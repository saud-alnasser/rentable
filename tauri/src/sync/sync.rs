//! exchanging a workspace with the account it is linked to.
//!
//! One call decides the direction and carries it out. The caller asks for a sync
//! and reads what happened; it does not resolve folders, read manifests, compare
//! heads, or choose between pushing and pulling.
//!
//! A sync that cannot proceed on its own is not a failure. It returns the same
//! question [`super::inspection`] puts to the user after a link, and transfers
//! nothing — answering it is a separate operation.

use serde::{Deserialize, Serialize};

use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};

use crate::{diagnostics, error::Error, state::AppState, timestamp};

use super::google::conflict::{
    GoogleDriveResolvedHead, GoogleDriveSyncAction, GoogleDriveSyncMode, content_hash_hex,
    is_cryptographic_content_hash, normalize_content_hash,
};
use super::google::files::{
    DriveFiles, GoogleDriveAccountDetails, GoogleDriveManifestResolution, GoogleDriveSnapshotUpload,
};
use super::google::manifest::{
    GoogleDriveManifest, GoogleDriveManifestEntryOverrides,
    build_google_drive_manifest_from_snapshots,
};
use super::google::metadata::{
    DriveFile, GoogleDriveSnapshotSource, parse_drive_snapshot_created_at,
};
use super::google::transport::{GoogleDriveApplyPullInput, GoogleDriveSyncCompleteInput};
use super::inspection::{
    GoogleDriveLinkPreparation, GoogleDriveRemoteState, inspect_google_drive_workspace,
    linked_google_drive_account_id, prepare_from_remote_state, read_remote_state,
};
use super::lock::{GoogleDriveSyncLockAcquireInput, GoogleDriveSyncLockReleaseInput};
use super::session::{GoogleDriveAccountAuthInput, GoogleDriveAccountUpdateInput};
use super::store::{RemoteSyncAccountStatus, RemoteSyncState, RemoteSyncWorkspace};
use super::workspace::{apply_remote_pull, mark_workspace_synced, prepare_local_push};

/// what the caller is asking for beyond the sync itself.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleDriveSyncInput {
    /// the user asked for this sync, rather than a mutation or the application
    /// closing. It decides what the snapshot a push sends counts as, and so what
    /// evicts it later.
    #[serde(default)]
    pub manual: bool,
}

/// which side of a conflict the user chose.
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum GoogleDriveConflictResolution {
    /// keep what is on this machine, and make the remote match it.
    Local,
    /// keep what the remote holds, and make this machine match it.
    Remote,
}

impl From<GoogleDriveConflictResolution> for GoogleDriveSyncMode {
    fn from(resolution: GoogleDriveConflictResolution) -> Self {
        match resolution {
            GoogleDriveConflictResolution::Local => GoogleDriveSyncMode::Push,
            GoogleDriveConflictResolution::Remote => GoogleDriveSyncMode::Pull,
        }
    }
}

/// what the caller is asking of a conflict.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleDriveResolveConflictInput {
    pub resolution: GoogleDriveConflictResolution,
}

/// what a sync run did, and what it could not do without asking.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleDriveSyncOutcome {
    pub state: RemoteSyncState,
    pub action: GoogleDriveSyncAction,
    /// the question to put to the user. Present only where the two sides could
    /// not be reconciled without one, and nothing transferred when it is.
    pub preparation: Option<GoogleDriveLinkPreparation>,
}

impl GoogleDriveSyncOutcome {
    /// nothing to do, and nothing to ask.
    fn settled(state: RemoteSyncState, action: GoogleDriveSyncAction) -> Self {
        Self {
            state,
            action,
            preparation: None,
        }
    }
}

/// sync this workspace with the account it is linked to.
///
/// A workspace linked to nothing is not an error: there is simply nothing to
/// exchange, which is what the local-only workspace every installation starts
/// with looks like.
///
/// Fails with [`Error::Busy`] where a sync is already running. The lock is
/// in-process and serialises this application's own operations; two machines
/// writing one workspace is detected afterwards rather than prevented (ADR 0005).
pub async fn sync_google_drive_workspace(
    app_state: &AppState,
    manual: bool,
) -> Result<GoogleDriveSyncOutcome, Error> {
    exchange_google_drive_workspace(app_state, manual, GoogleDriveSyncMode::Sync).await
}

/// what the remote holds for this workspace, as the question to put to the user.
///
/// `None` where the workspace is not on Drive: there is no remote to disagree
/// with, which is what every installation looks like before it is linked.
pub async fn inspect_google_drive_conflict(
    app_state: &AppState,
) -> Result<Option<GoogleDriveLinkPreparation>, Error> {
    let state = {
        let mut remote_sync = app_state.remote_sync.write().await;
        remote_sync.get_state().await?
    };

    let Some(account_id) = linked_google_drive_account_id(&state) else {
        return Ok(None);
    };

    if !state.google_drive_ready {
        return Ok(None);
    }

    let files = DriveFiles::new()?;
    let access_token = access_token_for(app_state, &account_id).await?;

    inspect_google_drive_workspace(app_state, &files, &access_token)
        .await
        .map(Some)
}

/// carry out the direction the user chose for a conflict they were asked about.
///
/// The reading happens again rather than being carried over from the question:
/// the user takes as long as they take, and what they answered about is what the
/// remote held when they were asked. Re-reading is also what makes the choice
/// safe to repeat — the same answer twice settles the same way.
pub async fn resolve_google_drive_conflict(
    app_state: &AppState,
    resolution: GoogleDriveConflictResolution,
) -> Result<GoogleDriveSyncOutcome, Error> {
    exchange_google_drive_workspace(app_state, true, resolution.into()).await
}

async fn exchange_google_drive_workspace(
    app_state: &AppState,
    manual: bool,
    mode: GoogleDriveSyncMode,
) -> Result<GoogleDriveSyncOutcome, Error> {
    let state = {
        let mut remote_sync = app_state.remote_sync.write().await;
        remote_sync.get_state().await?
    };

    let Some(account_id) = linked_google_drive_account_id(&state) else {
        return Ok(GoogleDriveSyncOutcome::settled(
            state,
            GoogleDriveSyncAction::None,
        ));
    };

    if !state.google_drive_ready {
        return Ok(GoogleDriveSyncOutcome::settled(
            state,
            GoogleDriveSyncAction::None,
        ));
    }

    let lease = {
        let mut remote_sync = app_state.remote_sync.write().await;
        remote_sync.acquire_google_drive_sync_lock(GoogleDriveSyncLockAcquireInput {
            workspace_id: state.workspace.id.clone(),
        })?
    };

    let synced = sync_under_lease(app_state, &account_id, manual, mode).await;

    {
        let mut remote_sync = app_state.remote_sync.write().await;
        remote_sync.release_google_drive_sync_lock(GoogleDriveSyncLockReleaseInput {
            lease_id: lease.lease_id,
        });
    }

    match synced {
        Ok(outcome) => {
            match outcome.preparation.as_ref() {
                Some(preparation) => diagnostics::warn("sync.deferred")
                    .with("workspace", outcome.state.workspace.id.as_str())
                    .with(
                        "conflict",
                        preparation
                            .conflict
                            .as_ref()
                            .map(|conflict| format!("{:?}", conflict.kind))
                            .unwrap_or_default(),
                    )
                    .write(),
                None => diagnostics::info("sync.completed")
                    .with("workspace", outcome.state.workspace.id.as_str())
                    .with("action", format!("{:?}", outcome.action))
                    .with("manual", manual.to_string())
                    .write(),
            }

            Ok(outcome)
        }
        Err(error) => {
            diagnostics::error("sync.failed")
                .with("workspace", state.workspace.id.as_str())
                .with("manual", manual.to_string())
                .with("error", error.to_string())
                .write();

            Err(error)
        }
    }
}

async fn sync_under_lease(
    app_state: &AppState,
    account_id: &str,
    manual: bool,
    mode: GoogleDriveSyncMode,
) -> Result<GoogleDriveSyncOutcome, Error> {
    let files = DriveFiles::new()?;
    let access_token = access_token_for(app_state, account_id).await?;
    let details = files.read_account_details(&access_token).await?;
    let state = record_account_is_reachable(app_state, account_id, &details).await?;

    // a fingerprint that cannot be taken leaves the comparison to capture times,
    // which is the same fallback a workspace with no hash recorded already uses.
    let local_content_hash = super::workspace::current_workspace_content_hash(app_state)
        .await
        .ok();
    let remote = read_remote_state(
        &files,
        &access_token,
        &state.workspace,
        local_content_hash.as_deref(),
        mode,
    )
    .await?;

    if remote.resolution.requires_resolution {
        let account_email = account_email(&state, account_id);
        let preparation = prepare_from_remote_state(state, &account_email, &remote);

        return Ok(GoogleDriveSyncOutcome {
            state: preparation.state.clone(),
            action: GoogleDriveSyncAction::None,
            preparation: Some(preparation),
        });
    }

    match remote.resolution.action {
        GoogleDriveSyncAction::Pushed => {
            push(
                app_state,
                &files,
                &access_token,
                account_id,
                state,
                &remote,
                &details,
                manual,
            )
            .await
        }
        GoogleDriveSyncAction::Pulled => {
            pull(
                app_state,
                &files,
                &access_token,
                account_id,
                state,
                &remote,
                &details,
            )
            .await
        }
        GoogleDriveSyncAction::None => {
            settle(
                app_state,
                &files,
                &access_token,
                account_id,
                state,
                &remote,
                &details,
            )
            .await
        }
    }
}

/// send this machine's copy to the remote and make it the head.
#[allow(clippy::too_many_arguments)]
async fn push(
    app_state: &AppState,
    files: &DriveFiles,
    access_token: &str,
    account_id: &str,
    state: RemoteSyncState,
    remote: &GoogleDriveRemoteState,
    details: &GoogleDriveAccountDetails,
    manual: bool,
) -> Result<GoogleDriveSyncOutcome, Error> {
    let source = push_snapshot_source(
        manual,
        remote.folder.is_some() && remote.manifest_document().is_some(),
    );
    let prepared =
        prepare_local_push(app_state, source == GoogleDriveSnapshotSource::Manual).await?;

    if prepared.workspace_id != state.workspace.id || prepared.account_id != account_id {
        return Err(Error::PreconditionFailed {
            message: "the active workspace changed while the sync was preparing".to_string(),
        });
    }

    let folder = match remote.folder.clone() {
        Some(folder) => folder,
        None => {
            files
                .ensure_workspace_folder(access_token, &state.workspace)
                .await?
        }
    };

    let previous = remote.manifest_document();
    let remote_workspace_id = remote_workspace_id(&state.workspace, &folder, previous);
    let remote_workspace_name = previous
        .map(|manifest| manifest.metadata.workspace_name.clone())
        .unwrap_or_else(|| state.workspace.name.clone());
    let content_hash = normalize_content_hash(Some(&prepared.content_hash));

    let snapshot = files
        .upload_workspace_snapshot(
            access_token,
            &folder.id,
            &GoogleDriveSnapshotUpload {
                workspace_id: remote_workspace_id.clone(),
                device_id: state.device_id.clone(),
                filename: prepared.filename.clone(),
                created_at: prepared.created_at,
                source,
                app_version: prepared.app_version.clone(),
                content_hash: content_hash.clone(),
                content: BASE64
                    .decode(prepared.contents_base64.as_bytes())
                    .map_err(|error| Error::Integrity {
                        message: format!("the prepared snapshot could not be read: {error}"),
                    })?,
            },
        )
        .await?;

    let written = write_manifest_around(
        files,
        access_token,
        &state.workspace,
        &folder,
        remote.manifest.as_ref().map(|manifest| &manifest.file),
        &snapshot,
        &GoogleDriveManifestEntryOverrides {
            created_at: Some(prepared.created_at),
            source: Some(source),
            app_version: Some(prepared.app_version),
            content_hash,
            ..GoogleDriveManifestEntryOverrides::default()
        },
        &remote_workspace_id,
        &remote_workspace_name,
        previous,
    )
    .await?;

    let state = record_agreement(
        app_state,
        files,
        access_token,
        account_id,
        &folder.id,
        &written,
        details,
    )
    .await?;

    Ok(GoogleDriveSyncOutcome::settled(
        state,
        GoogleDriveSyncAction::Pushed,
    ))
}

/// what a push's snapshot is taken as.
///
/// A remote with no folder or no index is being seeded, and seeding it is not
/// the user asking for a backup even where the user asked for the sync. The
/// distinction is not cosmetic: source is what retention keeps snapshots by,
/// and a manual one belongs to the class kept longest — so tagging every first
/// sync manual would fill that class with copies nobody chose to take.
fn push_snapshot_source(manual: bool, remote_has_index: bool) -> GoogleDriveSnapshotSource {
    if manual && remote_has_index {
        GoogleDriveSnapshotSource::Manual
    } else {
        GoogleDriveSnapshotSource::Autosave
    }
}

/// replace this machine's copy with the remote's.
#[allow(clippy::too_many_arguments)]
async fn pull(
    app_state: &AppState,
    files: &DriveFiles,
    access_token: &str,
    account_id: &str,
    state: RemoteSyncState,
    remote: &GoogleDriveRemoteState,
    details: &GoogleDriveAccountDetails,
) -> Result<GoogleDriveSyncOutcome, Error> {
    let (folder, manifest_file, manifest) = remote_head_to_pull(remote)?;

    // the manifest is rewritten first where it no longer describes the file it
    // points at, so what the pull records as the remote's head is what the
    // remote actually holds rather than a version that has already moved.
    let written = match remote.resolution.remote_head.as_ref() {
        Some(head) if remote.resolution.should_refresh_manifest_head => {
            refresh_manifest_head(
                files,
                access_token,
                &state.workspace,
                folder,
                manifest_file,
                manifest,
                head,
            )
            .await?
        }
        _ => WrittenManifest {
            file_id: manifest_file.id.clone(),
            manifest: manifest.clone(),
        },
    };

    let bytes = files
        .download(access_token, &written.manifest.head.file_id)
        .await?;
    let content_hash = content_hash_hex(&bytes);

    if is_cryptographic_content_hash(written.manifest.head.content_hash.as_deref())
        && normalize_content_hash(written.manifest.head.content_hash.as_deref())
            != Some(content_hash.clone())
    {
        return Err(Error::Integrity {
            message: "the remote snapshot does not match what the manifest says it holds"
                .to_string(),
        });
    }

    let app_usage_bytes = files
        .read_folder_usage_bytes(access_token, &folder.id)
        .await?;
    let state = apply_remote_pull(
        app_state,
        GoogleDriveApplyPullInput {
            workspace_id: written.manifest.metadata.workspace_id.clone(),
            workspace_name: Some(written.manifest.metadata.workspace_name.clone()),
            account_id: account_id.to_string(),
            filename: written.manifest.head.filename.clone(),
            app_version: written.manifest.head.app_version.clone(),
            contents_base64: BASE64.encode(&bytes),
            content_hash: Some(content_hash),
            remote_folder_id: folder.id.clone(),
            remote_manifest_file_id: written.file_id,
            remote_head_file_id: written.manifest.head.file_id.clone(),
            remote_head_revision: written.manifest.head.revision.clone(),
            remote_updated_at: written.manifest.metadata.updated_at,
            drive_quota_bytes: details.drive_quota_bytes,
            drive_usage_bytes: details.drive_usage_bytes,
            app_usage_bytes: Some(app_usage_bytes),
        },
    )
    .await?;

    Ok(GoogleDriveSyncOutcome::settled(
        state,
        GoogleDriveSyncAction::Pulled,
    ))
}

/// the two sides already agree. Nothing transfers, and the only thing left is
/// what the records still have to catch up on.
#[allow(clippy::too_many_arguments)]
async fn settle(
    app_state: &AppState,
    files: &DriveFiles,
    access_token: &str,
    account_id: &str,
    state: RemoteSyncState,
    remote: &GoogleDriveRemoteState,
    details: &GoogleDriveAccountDetails,
) -> Result<GoogleDriveSyncOutcome, Error> {
    let resolution = &remote.resolution;
    let Some((folder, manifest_file, manifest)) = remote_head_if_present(remote) else {
        return Ok(GoogleDriveSyncOutcome::settled(
            state,
            GoogleDriveSyncAction::None,
        ));
    };

    let written = match resolution.remote_head.as_ref() {
        Some(head) if resolution.should_refresh_manifest_head => Some(
            refresh_manifest_head(
                files,
                access_token,
                &state.workspace,
                folder,
                manifest_file,
                manifest,
                head,
            )
            .await?,
        ),
        _ if resolution.should_mark_synced_without_pull => Some(WrittenManifest {
            file_id: manifest_file.id.clone(),
            manifest: manifest.clone(),
        }),
        _ => None,
    };

    let Some(written) = written else {
        return Ok(GoogleDriveSyncOutcome::settled(
            state,
            GoogleDriveSyncAction::None,
        ));
    };

    let state = record_agreement(
        app_state,
        files,
        access_token,
        account_id,
        &folder.id,
        &written,
        details,
    )
    .await?;

    Ok(GoogleDriveSyncOutcome::settled(
        state,
        GoogleDriveSyncAction::None,
    ))
}

/// a manifest as it now stands on the remote.
struct WrittenManifest {
    file_id: String,
    manifest: GoogleDriveManifest,
}

/// rewrite the manifest so its head describes the file it points at.
///
/// A head rewritten by another client leaves the manifest describing content
/// that is no longer there, and every later comparison would be against a stale
/// digest.
async fn refresh_manifest_head(
    files: &DriveFiles,
    access_token: &str,
    workspace: &RemoteSyncWorkspace,
    folder: &DriveFile,
    manifest_file: &DriveFile,
    manifest: &GoogleDriveManifest,
    head: &GoogleDriveResolvedHead,
) -> Result<WrittenManifest, Error> {
    write_manifest_around(
        files,
        access_token,
        workspace,
        folder,
        Some(manifest_file),
        &head.file,
        &GoogleDriveManifestEntryOverrides {
            created_at: Some(
                parse_drive_snapshot_created_at(&head.file).unwrap_or(manifest.head.created_at),
            ),
            app_version: Some(manifest.head.app_version.clone()),
            content_hash: normalize_content_hash(
                head.content_hash
                    .as_deref()
                    .or(manifest.head.content_hash.as_deref()),
            ),
            ..GoogleDriveManifestEntryOverrides::default()
        },
        &manifest.metadata.workspace_id,
        &manifest.metadata.workspace_name,
        Some(manifest),
    )
    .await
}

/// apply retention, index what survived, and leave the folder holding exactly
/// one manifest describing it.
///
/// Retention runs before the index is built rather than after, so the index is
/// built from the files that are actually there — the alternative indexes
/// snapshots a cleanup is about to delete.
#[allow(clippy::too_many_arguments)]
async fn write_manifest_around(
    files: &DriveFiles,
    access_token: &str,
    workspace: &RemoteSyncWorkspace,
    folder: &DriveFile,
    expected_manifest_file: Option<&DriveFile>,
    head_file: &DriveFile,
    head_overrides: &GoogleDriveManifestEntryOverrides,
    remote_workspace_id: &str,
    remote_workspace_name: &str,
    previous: Option<&GoogleDriveManifest>,
) -> Result<WrittenManifest, Error> {
    let retained = files
        .apply_workspace_snapshot_retention(access_token, &folder.id)
        .await?;
    let next = build_google_drive_manifest_from_snapshots(
        remote_workspace_id,
        remote_workspace_name,
        &retained,
        head_file,
        head_overrides,
        previous,
        timestamp::now(),
    )?;
    let written = files
        .save_manifest(
            access_token,
            workspace,
            &folder.id,
            expected_manifest_file,
            &next,
        )
        .await?;

    files
        .delete_workspace_manifests_except(access_token, &folder.id, Some(&written.file.id))
        .await?;

    Ok(WrittenManifest {
        file_id: written.file.id,
        manifest: written.manifest,
    })
}

/// record that this workspace now agrees with what the remote holds.
async fn record_agreement(
    app_state: &AppState,
    files: &DriveFiles,
    access_token: &str,
    account_id: &str,
    folder_id: &str,
    written: &WrittenManifest,
    details: &GoogleDriveAccountDetails,
) -> Result<RemoteSyncState, Error> {
    let app_usage_bytes = files
        .read_folder_usage_bytes(access_token, folder_id)
        .await?;

    mark_workspace_synced(
        app_state,
        GoogleDriveSyncCompleteInput {
            workspace_id: written.manifest.metadata.workspace_id.clone(),
            workspace_name: Some(written.manifest.metadata.workspace_name.clone()),
            account_id: account_id.to_string(),
            remote_folder_id: folder_id.to_string(),
            remote_manifest_file_id: written.file_id.clone(),
            remote_head_file_id: written.manifest.head.file_id.clone(),
            remote_head_revision: written.manifest.head.revision.clone(),
            remote_updated_at: written.manifest.metadata.updated_at,
            drive_quota_bytes: details.drive_quota_bytes,
            drive_usage_bytes: details.drive_usage_bytes,
            app_usage_bytes: Some(app_usage_bytes),
        },
    )
    .await
}

/// a token good for the requests that follow.
///
/// Only a refused grant is the account needing the user's attention, and that
/// alone is recorded on it: every screen showing the workspace then says the
/// same thing, whichever operation discovered it. A refresh that failed for any
/// other reason — no network, Drive unavailable — is transient, and marking the
/// account on one would send the user to relink over a dropped connection.
pub(super) async fn access_token_for(
    app_state: &AppState,
    account_id: &str,
) -> Result<String, Error> {
    {
        let remote_sync = app_state.remote_sync.read().await;

        if let Some(access_token) =
            remote_sync.fresh_google_drive_access_token(&GoogleDriveAccountAuthInput {
                account_id: account_id.to_string(),
            })?
        {
            return Ok(access_token);
        }
    }

    let refreshed = {
        let mut remote_sync = app_state.remote_sync.write().await;
        remote_sync
            .refresh_google_drive_access_token(GoogleDriveAccountAuthInput {
                account_id: account_id.to_string(),
            })
            .await
    };

    match refreshed {
        Ok(token) => Ok(token.access_token),
        Err(error) => {
            if matches!(error, Error::PreconditionFailed { .. }) {
                let mut remote_sync = app_state.remote_sync.write().await;
                let _ = remote_sync
                    .update_google_drive_account(GoogleDriveAccountUpdateInput {
                        status: Some(RemoteSyncAccountStatus::NeedsReconnect),
                        error: Some(error.to_string()),
                        ..account_update(account_id)
                    })
                    .await;
            }

            Err(error)
        }
    }
}

/// write back who the account is, and clear any failure recorded against it —
/// reaching Drive at all is what makes a recorded failure stale.
///
/// How much of the *folder* the workspace occupies is not known yet and is not
/// touched here; it is written once the operation that changes it has run.
async fn record_account_is_reachable(
    app_state: &AppState,
    account_id: &str,
    details: &GoogleDriveAccountDetails,
) -> Result<RemoteSyncState, Error> {
    let mut remote_sync = app_state.remote_sync.write().await;

    remote_sync
        .update_google_drive_account(GoogleDriveAccountUpdateInput {
            email: details.email.clone(),
            display_name: details.display_name.clone(),
            avatar_url: details.avatar_url.clone(),
            provider_user_id: details.provider_user_id.clone(),
            drive_quota_bytes: details.drive_quota_bytes,
            drive_usage_bytes: details.drive_usage_bytes,
            status: Some(RemoteSyncAccountStatus::Ready),
            error: None,
            ..account_update(account_id)
        })
        .await
}

/// an update that changes nothing, for a caller to fill the fields it means.
fn account_update(account_id: &str) -> GoogleDriveAccountUpdateInput {
    GoogleDriveAccountUpdateInput {
        account_id: account_id.to_string(),
        email: None,
        display_name: None,
        avatar_url: None,
        provider_user_id: None,
        drive_quota_bytes: None,
        drive_usage_bytes: None,
        app_usage_bytes: None,
        access_token: None,
        refresh_token: None,
        token_expires_at: None,
        status: None,
        error: None,
    }
}

fn account_email(state: &RemoteSyncState, account_id: &str) -> String {
    state
        .accounts
        .iter()
        .find(|account| account.id == account_id)
        .map(|account| account.email.clone())
        .unwrap_or_default()
}

/// which workspace the remote calls this one.
///
/// The manifest's answer wins, then the folder's own declaration, then this
/// machine's. A workspace recovered onto a folder it did not create would
/// otherwise rename the remote's index to match a local identifier the rest of
/// the folder does not use.
fn remote_workspace_id(
    workspace: &RemoteSyncWorkspace,
    folder: &DriveFile,
    manifest: Option<&GoogleDriveManifest>,
) -> String {
    manifest
        .map(|manifest| manifest.metadata.workspace_id.clone())
        .or_else(|| folder.declared_workspace_id().map(str::to_string))
        .unwrap_or_else(|| workspace.id.clone())
}

/// the folder, manifest file, and manifest a pull needs, where the remote holds
/// all three.
fn remote_head_if_present(
    remote: &GoogleDriveRemoteState,
) -> Option<(&DriveFile, &DriveFile, &GoogleDriveManifest)> {
    let folder = remote.folder.as_ref()?;
    let GoogleDriveManifestResolution { file, manifest } = remote.manifest.as_ref()?;

    Some((folder, file, manifest.as_ref()?))
}

fn remote_head_to_pull(
    remote: &GoogleDriveRemoteState,
) -> Result<(&DriveFile, &DriveFile, &GoogleDriveManifest), Error> {
    remote_head_if_present(remote).ok_or_else(|| Error::NotFound {
        message: "the remote snapshot to pull is no longer there".to_string(),
    })
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;
    use std::time::Duration;

    use serde_json::json;

    use super::super::google::files::DriveEndpoints;
    use super::super::google::test::server::{ScriptedResponse, TestDriveServer};
    use super::super::google::transport::{DriveRetryPolicy, DriveTransport};
    use super::*;

    fn drive_files(server: &TestDriveServer) -> DriveFiles {
        DriveFiles::with_transport(
            DriveTransport::with_retry_policy(DriveRetryPolicy {
                attempts: 1,
                base_delay: Duration::from_millis(1),
                max_delay: Duration::from_millis(2),
            })
            .expect("failed to build the drive transport"),
            DriveEndpoints {
                api_base_url: server.url(""),
                upload_base_url: server.url("/upload"),
            },
        )
    }

    fn workspace() -> RemoteSyncWorkspace {
        RemoteSyncWorkspace {
            id: "workspace-1".to_string(),
            name: "Primary workspace".to_string(),
            remote_folder_id: Some("folder-1".to_string()),
            ..RemoteSyncWorkspace::default()
        }
    }

    fn json_response(body: serde_json::Value) -> ScriptedResponse {
        ScriptedResponse::new(200, body.to_string())
    }

    fn listing(files: Vec<serde_json::Value>) -> ScriptedResponse {
        json_response(json!({ "files": files }))
    }

    fn folder() -> DriveFile {
        DriveFile {
            id: "folder-1".to_string(),
            name: "Primary workspace".to_string(),
            ..DriveFile::default()
        }
    }

    fn snapshot_file(id: &str, source: &str, created_at: i64) -> serde_json::Value {
        json!({
            "id": id,
            "name": format!("snapshot-{created_at}.db"),
            "version": "1",
            "appProperties": {
                "rentableType": "snapshot",
                "rentableSource": source,
                "rentableCreatedAt": created_at.to_string(),
                "rentableAppVersion": "1.0.0",
            },
        })
    }

    /// what a push leaves behind: one snapshot of each source, one manifest
    /// describing them, and nothing else this application wrote.
    #[tokio::test]
    async fn writing_the_index_evicts_what_it_supersedes_and_leaves_one_manifest() {
        let listed = vec![
            snapshot_file("snapshot-new", "autosave", 1_700_000_200_000),
            snapshot_file("snapshot-old", "autosave", 1_700_000_100_000),
            snapshot_file("snapshot-manual", "manual", 1_700_000_000_000),
        ];
        let server = TestDriveServer::start(vec![
            // retention lists the folder twice — by property, then by name.
            listing(listed.clone()),
            listing(listed),
            // the superseded automatic snapshot is deleted.
            ScriptedResponse::new(204, ""),
            // the manifest write re-reads the folder's manifest, writes, then
            // clears the ones it superseded.
            listing(vec![json!({ "id": "manifest-1", "name": "manifest.json" })]),
            json_response(json!({ "id": "manifest-1", "name": "manifest.json" })),
            listing(vec![
                json!({ "id": "manifest-1", "name": "manifest.json" }),
                json!({ "id": "manifest-stray", "name": "manifest.json" }),
            ]),
            ScriptedResponse::new(204, ""),
        ])
        .await;
        let head = DriveFile {
            id: "snapshot-new".to_string(),
            name: "snapshot-1700000200000.db".to_string(),
            version: Some("1".to_string()),
            app_properties: Some(HashMap::from([(
                "rentableSource".to_string(),
                "autosave".to_string(),
            )])),
            ..DriveFile::default()
        };

        let written = write_manifest_around(
            &drive_files(&server),
            "token",
            &workspace(),
            &folder(),
            Some(&DriveFile {
                id: "manifest-1".to_string(),
                name: "manifest.json".to_string(),
                ..DriveFile::default()
            }),
            &head,
            &GoogleDriveManifestEntryOverrides {
                created_at: Some(1_700_000_200_000),
                source: Some(GoogleDriveSnapshotSource::Autosave),
                app_version: Some("1.0.0".to_string()),
                content_hash: Some("abc123".to_string()),
                ..GoogleDriveManifestEntryOverrides::default()
            },
            "workspace-1",
            "Primary workspace",
            None,
        )
        .await
        .expect("writing the manifest failed");

        assert_eq!(written.manifest.head.file_id, "snapshot-new");
        assert_eq!(
            written.manifest.entries.len(),
            2,
            "the index describes something other than the one snapshot of each source that survived"
        );
        assert_eq!(server.request(2).method, "DELETE");
        assert!(
            server.request(2).target.contains("snapshot-old"),
            "the superseded automatic snapshot was not the one deleted: {}",
            server.request(2).target
        );
        assert!(
            server.request(6).target.contains("manifest-stray"),
            "a second manifest was left in the folder for the next read to find: {}",
            server.request(6).target
        );
    }

    /// seeding an empty remote is not the user taking a backup, however the sync
    /// that seeds it was triggered — retention keeps manual snapshots longest,
    /// and a first sync would otherwise fill that class with copies nobody asked
    /// for.
    #[test]
    fn a_sync_that_seeds_an_empty_remote_takes_an_automatic_snapshot() {
        assert_eq!(
            push_snapshot_source(true, true),
            GoogleDriveSnapshotSource::Manual
        );
        assert_eq!(
            push_snapshot_source(true, false),
            GoogleDriveSnapshotSource::Autosave
        );
        assert_eq!(
            push_snapshot_source(false, true),
            GoogleDriveSnapshotSource::Autosave
        );
        assert_eq!(
            push_snapshot_source(false, false),
            GoogleDriveSnapshotSource::Autosave
        );
    }

    #[test]
    fn the_remote_keeps_its_own_name_for_a_workspace_it_already_indexed() {
        let manifest = GoogleDriveManifest {
            metadata: super::super::google::manifest::GoogleDriveManifestMetadata {
                version: 1,
                provider: "googleDrive".to_string(),
                workspace_id: "workspace-remote".to_string(),
                workspace_name: "Primary workspace".to_string(),
                updated_at: 1,
            },
            entries: Vec::new(),
            head: super::super::google::manifest::GoogleDriveManifestEntry {
                file_id: "head-1".to_string(),
                filename: "snapshot-1.db".to_string(),
                created_at: 1,
                source: GoogleDriveSnapshotSource::Autosave,
                app_version: "1.0.0".to_string(),
                revision: "1".to_string(),
                modified_time: None,
                size_bytes: None,
                md5_checksum: None,
                content_hash: None,
            },
        };

        assert_eq!(
            remote_workspace_id(&workspace(), &folder(), Some(&manifest)),
            "workspace-remote"
        );
    }

    #[test]
    fn a_folder_with_no_index_still_answers_for_the_workspace_it_declares() {
        let folder = DriveFile {
            app_properties: Some(HashMap::from([(
                "rentableWorkspaceId".to_string(),
                "workspace-declared".to_string(),
            )])),
            ..folder()
        };

        assert_eq!(
            remote_workspace_id(&workspace(), &folder, None),
            "workspace-declared"
        );
    }

    #[test]
    fn a_folder_declaring_nothing_falls_back_to_this_machines_answer() {
        assert_eq!(
            remote_workspace_id(&workspace(), &folder(), None),
            "workspace-1"
        );
    }
}
