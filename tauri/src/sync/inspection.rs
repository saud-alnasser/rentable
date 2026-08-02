//! reading what the remote holds, and turning it into the question to put to
//! the user.
//!
//! The decision itself is [`super::google::conflict`]'s and issues no request;
//! this is the reading that feeds it — which folder, which manifest, which head
//! — and it sits here rather than in the provider area because that is where the
//! local state it decides against is reachable.
//!
//! Every flow that can end in a conflict produces the same answer, so
//! [`GoogleDriveLinkPreparation`] is one type: linking asks it of a workspace
//! just linked, and syncing asks it of one already linked.

use serde::{Deserialize, Serialize};

use crate::{error::Error, state::AppState};

use super::google::conflict::{
    GoogleDriveConflictKind, GoogleDriveHeadObservation, GoogleDriveRecommendedMode,
    GoogleDriveResolvedHead, GoogleDriveSyncMode, GoogleDriveSyncResolution,
    analyze_sync_resolution, should_refresh_remote_manifest_head,
};
use super::google::files::{DriveFiles, GoogleDriveAccountDetails, GoogleDriveManifestResolution};
use super::google::manifest::GoogleDriveManifest;
use super::google::metadata::DriveFile;
use super::session::GoogleDriveAccountUpdateInput;
use super::store::{RemoteSyncProvider, RemoteSyncState, RemoteSyncWorkspace};
use super::workspace::current_workspace_content_hash;

/// what the user is being asked, and everything the interface needs to ask it.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GoogleDriveLinkConflict {
    pub kind: GoogleDriveConflictKind,
    pub account_email: String,
    pub local_snapshot_at: Option<i64>,
    pub remote_updated_at: Option<i64>,
    pub remote_filename: Option<String>,
    /// why, where the reason is more specific than the kind's own wording.
    /// Absent leaves the interface to say it, which is what keeps the sentence
    /// in the user's language.
    pub message: Option<String>,
}

/// the situation on the remote, and what to do about it.
///
/// `requires_resolution` is the whole point of the type: false means the caller
/// may proceed, true means nothing transfers until the user has chosen.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleDriveLinkPreparation {
    pub state: RemoteSyncState,
    pub requires_resolution: bool,
    pub recommended_mode: GoogleDriveRecommendedMode,
    pub conflict: Option<GoogleDriveLinkConflict>,
}

/// what the workspace folder turned out to hold.
#[derive(Clone, Debug)]
pub(super) struct GoogleDriveRemoteState {
    /// the workspace's folder, or `None` where the account holds none for it
    /// yet. A push creates one; nothing else may.
    pub folder: Option<DriveFile>,
    /// `None` where the account holds no folder for this workspace, or holds one
    /// with nothing in it to index — which is what an account that has never
    /// been synced to looks like.
    pub manifest: Option<GoogleDriveManifestResolution>,
    pub resolution: GoogleDriveSyncResolution,
    /// how much of the user's Drive this workspace's folder occupies.
    pub app_usage_bytes: i64,
}

impl GoogleDriveRemoteState {
    /// the index the folder holds, where it holds one that could be read or
    /// rebuilt.
    pub(super) fn manifest_document(&self) -> Option<&GoogleDriveManifest> {
        self.manifest
            .as_ref()
            .and_then(|resolution| resolution.manifest.as_ref())
    }
}

/// what the remote holds for this workspace, as a question to put to the user.
///
/// The account's record of Drive is refreshed on the way through, because the
/// reading has already paid for the requests that answer it: how much room the
/// account has is exactly what decides whether a push fits.
pub(super) async fn inspect_google_drive_workspace(
    app_state: &AppState,
    files: &DriveFiles,
    access_token: &str,
) -> Result<GoogleDriveLinkPreparation, Error> {
    let state = {
        let mut remote_sync = app_state.remote_sync.write().await;
        remote_sync.get_state().await?
    };

    let account_id =
        linked_google_drive_account_id(&state).ok_or_else(|| Error::PreconditionFailed {
            message: "workspace is not linked to a google drive account".to_string(),
        })?;

    // a fingerprint that cannot be taken leaves the comparison to capture times,
    // which is the same fallback a workspace with no hash recorded already uses.
    let local_content_hash = current_workspace_content_hash(app_state).await.ok();
    let details = files.read_account_details(access_token).await?;
    let remote = read_remote_state(
        files,
        access_token,
        &state.workspace,
        local_content_hash.as_deref(),
        GoogleDriveSyncMode::Sync,
    )
    .await?;

    let state =
        record_what_the_account_holds(app_state, state, &account_id, &details, &remote).await?;
    let account_email = state
        .accounts
        .iter()
        .find(|account| account.id == account_id)
        .map(|account| account.email.clone())
        .unwrap_or_default();

    Ok(prepare_from_remote_state(state, &account_email, &remote))
}

/// read the remote against what the workspace records, and decide what should
/// happen between them.
///
/// `local_content_hash` is the digest of the local database, and supplying it is
/// what lets equal content be recognised as agreement however far the timestamps
/// have drifted. Without it the fallback is capture times against the last sync.
pub(super) async fn read_remote_state(
    files: &DriveFiles,
    access_token: &str,
    workspace: &RemoteSyncWorkspace,
    local_content_hash: Option<&str>,
    mode: GoogleDriveSyncMode,
) -> Result<GoogleDriveRemoteState, Error> {
    let Some(folder) = files
        .resolve_existing_workspace_folder(access_token, workspace)
        .await?
    else {
        return Ok(GoogleDriveRemoteState {
            folder: None,
            manifest: None,
            resolution: analyze_sync_resolution(
                workspace,
                None,
                mode,
                &GoogleDriveHeadObservation::default(),
            ),
            app_usage_bytes: 0,
        });
    };

    let app_usage_bytes = files
        .read_folder_usage_bytes(access_token, &folder.id)
        .await?;
    let manifest = files
        .resolve_manifest(access_token, workspace, &folder.id)
        .await?;
    let manifest_document = manifest
        .as_ref()
        .and_then(|resolution| resolution.manifest.as_ref());
    let observation =
        observe_heads(files, access_token, manifest_document, local_content_hash).await?;

    Ok(GoogleDriveRemoteState {
        resolution: analyze_sync_resolution(workspace, manifest_document, mode, &observation),
        folder: Some(folder),
        manifest,
        app_usage_bytes,
    })
}

/// the preparation a reading amounts to, against the state it was read for.
pub(super) fn prepare_from_remote_state(
    state: RemoteSyncState,
    account_email: &str,
    remote: &GoogleDriveRemoteState,
) -> GoogleDriveLinkPreparation {
    GoogleDriveLinkPreparation {
        requires_resolution: remote.resolution.requires_resolution,
        recommended_mode: remote.resolution.recommended_mode,
        conflict: remote.resolution.conflict_kind.map(|kind| {
            describe_conflict(
                &state.workspace,
                account_email,
                remote.manifest_document(),
                kind,
            )
        }),
        state,
    }
}

/// the question a conflict puts to the user, with what each side holds.
pub(super) fn describe_conflict(
    workspace: &RemoteSyncWorkspace,
    account_email: &str,
    manifest: Option<&GoogleDriveManifest>,
    kind: GoogleDriveConflictKind,
) -> GoogleDriveLinkConflict {
    GoogleDriveLinkConflict {
        kind,
        account_email: account_email.to_string(),
        local_snapshot_at: workspace.last_snapshot_at,
        remote_updated_at: manifest.map(|manifest| manifest.metadata.updated_at),
        remote_filename: manifest.map(|manifest| manifest.head.filename.clone()),
        message: None,
    }
}

/// the account this workspace is linked to, where it is linked to one at all.
pub(super) fn linked_google_drive_account_id(state: &RemoteSyncState) -> Option<String> {
    if state.workspace.provider != RemoteSyncProvider::GoogleDrive {
        return None;
    }

    state
        .workspace
        .account_id
        .as_deref()
        .filter(|account_id| !account_id.is_empty())
        .filter(|account_id| {
            state
                .accounts
                .iter()
                .any(|account| account.id == *account_id)
        })
        .map(str::to_string)
}

/// write back how much of Drive the account holds.
///
/// Returns the state unchanged where the numbers already match, so an inspection
/// that found no news does not write.
async fn record_what_the_account_holds(
    app_state: &AppState,
    state: RemoteSyncState,
    account_id: &str,
    details: &GoogleDriveAccountDetails,
    remote: &GoogleDriveRemoteState,
) -> Result<RemoteSyncState, Error> {
    let unchanged = state
        .accounts
        .iter()
        .find(|account| account.id == account_id)
        .is_some_and(|account| {
            account.drive_quota_bytes == details.drive_quota_bytes
                && account.drive_usage_bytes == details.drive_usage_bytes
                && account.app_usage_bytes.unwrap_or(0) == remote.app_usage_bytes
        });

    if unchanged {
        return Ok(state);
    }

    let mut remote_sync = app_state.remote_sync.write().await;
    remote_sync
        .update_google_drive_account(GoogleDriveAccountUpdateInput {
            account_id: account_id.to_string(),
            drive_quota_bytes: details.drive_quota_bytes,
            drive_usage_bytes: details.drive_usage_bytes,
            app_usage_bytes: Some(remote.app_usage_bytes),
            email: None,
            display_name: None,
            avatar_url: None,
            provider_user_id: None,
            access_token: None,
            refresh_token: None,
            token_expires_at: None,
            status: None,
            error: None,
        })
        .await
}

/// what both sides currently hold.
///
/// An empty remote has no head to observe, and costs neither the request nor the
/// download that observing one takes.
async fn observe_heads(
    files: &DriveFiles,
    access_token: &str,
    manifest: Option<&GoogleDriveManifest>,
    local_content_hash: Option<&str>,
) -> Result<GoogleDriveHeadObservation, Error> {
    let Some(manifest) = manifest else {
        return Ok(GoogleDriveHeadObservation::default());
    };

    let remote_head = files
        .resolve_remote_head_state(access_token, manifest)
        .await?
        .map(|state| GoogleDriveResolvedHead {
            file: state.file,
            content_hash: state.content_hash,
            changed_from_manifest: state.changed_from_manifest,
        });

    Ok(GoogleDriveHeadObservation {
        local_content_hash: local_content_hash.map(str::to_string),
        remote_content_hash: remote_head
            .as_ref()
            .and_then(|head| head.content_hash.clone()),
        remote_head_revision: remote_head
            .as_ref()
            .and_then(|head| head.file.version.clone())
            .or_else(|| Some(manifest.head.revision.clone())),
        remote_head_changed: remote_head
            .as_ref()
            .is_some_and(|head| head.changed_from_manifest),
        should_refresh_manifest_head: remote_head
            .as_ref()
            .is_some_and(|head| should_refresh_remote_manifest_head(&manifest.head, head)),
        remote_head,
    })
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use serde_json::json;

    use super::super::google::conflict::GoogleDriveSyncAction;
    use super::super::google::files::DriveEndpoints;
    use super::super::google::test::server::{ScriptedResponse, TestDriveServer};
    use super::super::google::transport::{DriveRetryPolicy, DriveTransport};
    use super::*;

    /// the digest of [`SNAPSHOT_BYTES`], which is what a workspace holding that
    /// snapshot fingerprints to.
    const SNAPSHOT_CONTENT_HASH: &str =
        "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";

    const SNAPSHOT_BYTES: &str = "test";

    /// a digest of the right shape that matches nothing.
    const OTHER_CONTENT_HASH: &str =
        "0000000000000000000000000000000000000000000000000000000000000000";

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

    fn linked_workspace() -> RemoteSyncWorkspace {
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

    fn workspace_folder() -> ScriptedResponse {
        json_response(json!({ "id": "folder-1", "name": "Primary workspace" }))
    }

    fn manifest_file_listing() -> ScriptedResponse {
        listing(vec![json!({ "id": "manifest-1", "name": "manifest.json" })])
    }

    fn head_file() -> ScriptedResponse {
        json_response(json!({ "id": "head-1", "name": "snapshot-head-1.db", "version": "7" }))
    }

    fn manifest_json(content_hash: Option<&str>) -> serde_json::Value {
        let head = json!({
            "fileId": "head-1",
            "filename": "snapshot-head-1.db",
            "createdAt": 1_700_000_000_000i64,
            "source": "autosave",
            "appVersion": "1.0.0",
            "revision": "7",
            "modifiedTime": null,
            "sizeBytes": null,
            "md5Checksum": null,
            "contentHash": content_hash,
        });

        json!({
            "metadata": {
                "version": 1,
                "provider": "googleDrive",
                "workspaceId": "workspace-1",
                "workspaceName": "Primary workspace",
                "updatedAt": 1_700_000_000_000i64,
            },
            "entries": [head],
            "head": head,
        })
    }

    #[tokio::test]
    async fn an_account_holding_no_folder_for_this_workspace_is_pushed_to() {
        let server = TestDriveServer::start(vec![
            // the folder the workspace names is gone, and no root folder
            // stands in for it.
            ScriptedResponse::new(404, "{}"),
            listing(vec![]),
        ])
        .await;

        let remote = read_remote_state(
            &drive_files(&server),
            "token",
            &linked_workspace(),
            Some(SNAPSHOT_CONTENT_HASH),
            GoogleDriveSyncMode::Sync,
        )
        .await
        .expect("reading the remote failed");

        assert!(remote.manifest.is_none());
        assert_eq!(remote.app_usage_bytes, 0);
        assert_eq!(remote.resolution.action, GoogleDriveSyncAction::Pushed);
        assert!(!remote.resolution.requires_resolution);
    }

    #[tokio::test]
    async fn a_remote_head_matching_the_local_copy_needs_no_transfer() {
        let server = TestDriveServer::start(vec![
            workspace_folder(),
            listing(vec![
                json!({ "id": "head-1", "name": "snapshot-head-1.db", "size": "2048" }),
            ]),
            manifest_file_listing(),
            json_response(manifest_json(Some(SNAPSHOT_CONTENT_HASH))),
            head_file(),
        ])
        .await;

        let remote = read_remote_state(
            &drive_files(&server),
            "token",
            &linked_workspace(),
            Some(SNAPSHOT_CONTENT_HASH),
            GoogleDriveSyncMode::Sync,
        )
        .await
        .expect("reading the remote failed");

        assert_eq!(remote.app_usage_bytes, 2048);
        assert_eq!(remote.resolution.action, GoogleDriveSyncAction::None);
        assert!(!remote.resolution.requires_resolution);
        assert_eq!(remote.resolution.conflict_kind, None);
    }

    #[tokio::test]
    async fn work_on_both_sides_and_nothing_agreed_between_them_asks_the_user() {
        let server = TestDriveServer::start(vec![
            workspace_folder(),
            listing(vec![]),
            manifest_file_listing(),
            json_response(manifest_json(None)),
            head_file(),
            // the manifest records no digest, so the head's own bytes are read.
            ScriptedResponse::new(200, SNAPSHOT_BYTES),
        ])
        .await;
        let workspace = RemoteSyncWorkspace {
            last_snapshot_at: Some(1_700_000_100_000),
            last_snapshot_filename: Some("snapshot-local.db".to_string()),
            ..linked_workspace()
        };

        let remote = read_remote_state(
            &drive_files(&server),
            "token",
            &workspace,
            Some(OTHER_CONTENT_HASH),
            GoogleDriveSyncMode::Sync,
        )
        .await
        .expect("reading the remote failed");

        assert!(remote.resolution.requires_resolution);
        assert_eq!(
            remote.resolution.conflict_kind,
            Some(GoogleDriveConflictKind::Link)
        );

        let conflict = describe_conflict(
            &workspace,
            "someone@example.com",
            remote.manifest_document(),
            GoogleDriveConflictKind::Link,
        );

        assert_eq!(conflict.account_email, "someone@example.com");
        assert_eq!(conflict.local_snapshot_at, Some(1_700_000_100_000));
        assert_eq!(conflict.remote_updated_at, Some(1_700_000_000_000));
        assert_eq!(
            conflict.remote_filename,
            Some("snapshot-head-1.db".to_string())
        );
        assert_eq!(
            conflict.message, None,
            "a conflict the interface already has wording for carried a message it would show instead"
        );
    }
}
