//! the local reads and writes a sync run makes on the workspace as it stands on
//! this machine.
//!
//! Separate from [`super::google::conflict`] and [`super::google::manifest`] so
//! that those hold pure functions and nothing else: everything here needs the
//! application state, so none of it can be exercised by calling it with values.

use std::fs;

use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};

use crate::{
    backup::{BackupRecoveryKind, BackupSource},
    error::Error,
    state::AppState,
    timestamp,
};

use super::google::conflict::{content_hash_hex, validate_google_drive_pull_content_hash};
use super::google::transport::{
    GoogleDriveApplyPullInput, GoogleDrivePreparedPush, GoogleDriveSyncCompleteInput,
};
use super::store::{
    RemoteSyncState, sanitize_filename, sanitize_optional_string, sanitize_string,
};

pub(crate) async fn sync_backup_manifest_to_active_workspace(
    app_state: &AppState,
    state: &RemoteSyncState,
) -> Result<(), Error> {
    let mut backup = app_state.backup.write().await;
    backup.sync_manifest_workspace(Some(&state.workspace))
}

pub(crate) async fn current_workspace_content_hash(app_state: &AppState) -> Result<String, Error> {
    let temp_path = {
        let settings = app_state.settings.read().await;
        settings.backup_dir.join(format!(
            ".workspace-fingerprint-{}-{}.db",
            timestamp::now(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|duration| duration.as_nanos())
                .unwrap_or_default()
        ))
    };

    {
        let mut db = app_state.db.write().await;

        if !db.is_ready().await {
            db.reconnect()
                .await
                .map_err(|error| Error::PreconditionFailed {
                    message: format!(
                        "database not ready to fingerprint current workspace: {error}"
                    ),
                })?;
        }

        if !db.is_ready().await {
            return Err(Error::PreconditionFailed {
                message: "database not ready to fingerprint current workspace".to_string(),
            });
        }

        db.create_backup(&temp_path).await?;
    }

    let bytes = fs::read(&temp_path).map_err(Error::from);
    let _ = fs::remove_file(&temp_path);

    Ok(content_hash_hex(&bytes?))
}

/// what a push's snapshot is taken as on this machine.
///
/// Each variant carries two decisions rather than one, and they travel together
/// because they are not independently choosable: what the snapshot is recorded
/// under is what retention keeps it by, and what happens to the managed
/// snapshots around it follows from the same answer.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum LocalPushSnapshot {
    /// a copy the user asked for. Recorded as a manual snapshot, and the managed
    /// ones are cleaned up once it exists.
    Manual,
    /// a copy this application took for itself. Recorded as an autosave, and the
    /// managed snapshots around it are left in place — the cleanup that follows
    /// a settled sync is what takes them.
    Autosave,
}

/// take the snapshot a push is about to send, and record that this workspace
/// holds it.
///
/// `snapshot` decides what the copy counts as, which decides what evicts it
/// later: a copy the user asked for outlives the automatic ones around it.
pub(crate) async fn prepare_local_push(
    app_state: &AppState,
    snapshot: LocalPushSnapshot,
) -> Result<GoogleDrivePreparedPush, Error> {
    let (workspace, account_id) = {
        let mut remote_sync = app_state.remote_sync.write().await;
        let workspace = remote_sync.get_state().await?.workspace;

        // Naming an account is what being linked to Drive is, now that no mode says so.
        let account_id = workspace
            .account_id
            .clone()
            .ok_or_else(|| Error::PreconditionFailed {
                message: "workspace is not linked to Google Drive".to_string(),
            })?;

        (workspace, account_id)
    };

    let entry = {
        let mut backup = app_state.backup.write().await;
        backup.sync_manifest_workspace(Some(&workspace))?;
        match snapshot {
            LocalPushSnapshot::Manual => backup.create(false).await?,
            LocalPushSnapshot::Autosave => {
                backup
                    .create_managed_retaining_previous(BackupSource::Autosave, None, false)
                    .await?
            }
        }
    };

    let (contents_base64, content_hash, app_version) = {
        let settings = app_state.settings.read().await;
        let path = settings.backup_dir.join(&entry.filename);
        let bytes = fs::read(&path)?;
        (
            BASE64.encode(&bytes),
            content_hash_hex(&bytes),
            settings.version.clone(),
        )
    };

    let mut remote_sync = app_state.remote_sync.write().await;
    remote_sync.record_snapshot_for_workspace(&entry)?;

    Ok(GoogleDrivePreparedPush {
        workspace_id: workspace.id,
        account_id,
        filename: entry.filename,
        created_at: entry.created_at,
        source: entry.source,
        app_version,
        contents_base64,
        content_hash,
    })
}

/// record that this workspace now agrees with the remote state described.
pub(crate) async fn mark_workspace_synced(
    app_state: &AppState,
    input: GoogleDriveSyncCompleteInput,
) -> Result<RemoteSyncState, Error> {
    {
        let mut remote_sync = app_state.remote_sync.write().await;
        remote_sync.mark_google_drive_synced(input)?;
    }

    {
        let mut backup = app_state.backup.write().await;
        let _ = backup.cleanup_retained().await;
    }

    let state = {
        let mut remote_sync = app_state.remote_sync.write().await;
        remote_sync.get_state().await?
    };

    sync_backup_manifest_to_active_workspace(app_state, &state).await?;
    Ok(state)
}

/// replace this machine's database with a snapshot from the remote, and record
/// that the workspace now holds it.
///
/// A safety copy is taken first, because the restore is the one operation here
/// that destroys local work — and the snapshot that replaces it was written by a
/// different machine.
pub(crate) async fn apply_remote_pull(
    app_state: &AppState,
    input: GoogleDriveApplyPullInput,
) -> Result<RemoteSyncState, Error> {
    let workspace_id = sanitize_string(&input.workspace_id);
    let account_id = sanitize_string(&input.account_id);
    let filename = sanitize_filename(&input.filename);

    if workspace_id.is_empty() || account_id.is_empty() {
        return Err(Error::InvalidInput {
            message: "workspace and account are required for pull".to_string(),
        });
    }

    let (backup_dir, current_version) = {
        let settings = app_state.settings.read().await;
        (settings.backup_dir.clone(), settings.version.clone())
    };

    if sanitize_string(&input.app_version) != current_version {
        return Err(Error::Integrity {
            message: "remote snapshot app version does not match current app version".to_string(),
        });
    }

    let workspace = {
        let mut remote_sync = app_state.remote_sync.write().await;
        Some(remote_sync.get_state().await?.workspace)
    };

    {
        let mut backup = app_state.backup.write().await;
        backup.sync_manifest_workspace(workspace.as_ref())?;
        let _ = backup
            .create_managed(
                BackupSource::Recovery,
                Some(BackupRecoveryKind::Sync),
                false,
            )
            .await?;
    }

    let temp_filename = if filename.is_empty() {
        format!("remote-sync-{}.db", timestamp::now())
    } else {
        format!("remote-sync-{}-{}", timestamp::now(), filename)
    };
    let temp_path = backup_dir.join(temp_filename);
    let expected_content_hash = sanitize_optional_string(input.content_hash);
    let bytes = BASE64
        .decode(input.contents_base64.as_bytes())
        .map_err(|error| Error::Integrity {
            message: error.to_string(),
        })?;

    validate_google_drive_pull_content_hash(expected_content_hash.as_deref(), &bytes)?;

    fs::write(&temp_path, bytes)?;

    let restore_result = {
        let mut db = app_state.db.write().await;
        db.restore_backup(&temp_path).await
    };

    let _ = fs::remove_file(&temp_path);
    restore_result?;

    let pulled_entry = {
        let mut backup = app_state.backup.write().await;
        backup.sync_manifest_workspace(workspace.as_ref())?;
        backup
            .create_managed_retaining_previous(BackupSource::Autosave, None, false)
            .await?
    };

    let state = {
        let mut remote_sync = app_state.remote_sync.write().await;
        remote_sync.record_snapshot_for_workspace(&pulled_entry)?;
        remote_sync.mark_google_drive_synced(GoogleDriveSyncCompleteInput {
            workspace_id,
            workspace_name: input.workspace_name,
            account_id,
            remote_folder_id: input.remote_folder_id,
            remote_manifest_file_id: input.remote_manifest_file_id,
            remote_head_file_id: input.remote_head_file_id,
            remote_head_revision: input.remote_head_revision,
            remote_updated_at: input.remote_updated_at,
            drive_quota_bytes: input.drive_quota_bytes,
            drive_usage_bytes: input.drive_usage_bytes,
            app_usage_bytes: input.app_usage_bytes,
        })?;
        remote_sync.get_state().await?
    };

    {
        let mut backup = app_state.backup.write().await;
        let _ = backup.cleanup_retained().await;
    }

    sync_backup_manifest_to_active_workspace(app_state, &state).await?;
    Ok(state)
}
