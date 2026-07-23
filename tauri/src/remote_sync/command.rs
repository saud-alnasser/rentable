use std::fs;

use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};

use crate::{
    backup::{BackupRecoveryKind, BackupSource},
    state::AppState,
    timestamp,
};

use super::google::conflict::{
    content_hash_hex, current_workspace_content_hash, validate_google_drive_pull_content_hash,
};
use super::google::manifest::sync_backup_manifest_to_active_workspace;
use super::google::retention::google_drive_push_snapshot_source;
use super::lock::{
    GoogleDriveSyncLockAcquireInput, GoogleDriveSyncLockLease, GoogleDriveSyncLockReleaseInput,
};
use super::session::{
    GoogleDriveAccountAuth, GoogleDriveAccountAuthInput, GoogleDriveAccountUpdateInput,
    GoogleDriveDisconnectInput, GoogleDriveLinkCompleteInput, GoogleDriveLinkSessionCreateInput,
    GoogleDriveLinkSessionLookupInput, GoogleDriveLinkSessionResult, GoogleDriveLinkSessionStart,
};
use super::store::{
    RemoteSyncProvider, RemoteSyncState, sanitize_filename, sanitize_optional_string,
    sanitize_string,
};
use super::{
    GoogleDriveApplyPullInput, GoogleDriveConfig, GoogleDriveLocalFingerprint,
    GoogleDrivePreparePushInput, GoogleDrivePreparedPush, GoogleDriveSyncCompleteInput,
};

#[tauri::command]
pub async fn remote_sync_state_get(
    app_state: tauri::State<'_, AppState>,
) -> Result<RemoteSyncState, String> {
    let state = {
        let mut remote_sync = app_state.remote_sync.write().await;
        remote_sync.get_state().await?
    };

    sync_backup_manifest_to_active_workspace(app_state.inner(), &state).await?;
    Ok(state)
}

#[tauri::command]
pub async fn remote_sync_snapshot_now(
    app_state: tauri::State<'_, AppState>,
) -> Result<RemoteSyncState, String> {
    let workspace = {
        let mut remote_sync = app_state.remote_sync.write().await;
        remote_sync.get_state().await?.workspace
    };
    let entry = {
        let mut backup = app_state.backup.write().await;
        backup.sync_manifest_workspace(Some(&workspace))?;
        backup.create(false).await?
    };

    let mut remote_sync = app_state.remote_sync.write().await;
    remote_sync.record_snapshot_for_workspace(&entry)?;
    let state = remote_sync.get_state().await?;
    drop(remote_sync);

    {
        let mut backup = app_state.backup.write().await;
        let _ = backup.cleanup_retained().await;
    }

    Ok(state)
}

#[tauri::command]
pub async fn remote_sync_autosave_now(
    app_state: tauri::State<'_, AppState>,
) -> Result<RemoteSyncState, String> {
    let workspace = {
        let mut remote_sync = app_state.remote_sync.write().await;
        remote_sync.get_state().await?.workspace
    };

    let entry = {
        let mut backup = app_state.backup.write().await;
        backup.sync_manifest_workspace(Some(&workspace))?;
        backup
            .create_managed(BackupSource::Autosave, None, false)
            .await?
    };

    let mut remote_sync = app_state.remote_sync.write().await;
    remote_sync.record_snapshot_for_workspace(&entry)?;
    let state = remote_sync.get_state().await?;
    drop(remote_sync);

    {
        let mut backup = app_state.backup.write().await;
        let _ = backup.cleanup_retained().await;
    }

    Ok(state)
}

#[tauri::command]
pub async fn remote_sync_google_drive_config_get(
    app_state: tauri::State<'_, AppState>,
) -> Result<GoogleDriveConfig, String> {
    let remote_sync = app_state.remote_sync.read().await;
    Ok(remote_sync.get_google_drive_config())
}

#[tauri::command]
pub async fn remote_sync_google_drive_begin_link(
    app_state: tauri::State<'_, AppState>,
    input: GoogleDriveLinkSessionCreateInput,
) -> Result<GoogleDriveLinkSessionStart, String> {
    let mut remote_sync = app_state.remote_sync.write().await;
    remote_sync.begin_google_drive_link(input)
}

#[tauri::command]
pub async fn remote_sync_google_drive_get_link_result(
    app_state: tauri::State<'_, AppState>,
    input: GoogleDriveLinkSessionLookupInput,
) -> Result<GoogleDriveLinkSessionResult, String> {
    let remote_sync = app_state.remote_sync.read().await;
    remote_sync.get_google_drive_link_result(input)
}

#[tauri::command]
pub async fn remote_sync_google_drive_cancel_link(
    app_state: tauri::State<'_, AppState>,
    input: GoogleDriveLinkSessionLookupInput,
) -> Result<(), String> {
    let mut remote_sync = app_state.remote_sync.write().await;
    remote_sync.cancel_google_drive_link(input)
}

#[tauri::command]
pub async fn remote_sync_google_drive_complete_link(
    app_state: tauri::State<'_, AppState>,
    input: GoogleDriveLinkCompleteInput,
) -> Result<RemoteSyncState, String> {
    let state = {
        let mut remote_sync = app_state.remote_sync.write().await;
        remote_sync.complete_google_drive_link(input).await?
    };

    sync_backup_manifest_to_active_workspace(app_state.inner(), &state).await?;
    Ok(state)
}

#[tauri::command]
pub async fn remote_sync_google_drive_get_account_auth(
    app_state: tauri::State<'_, AppState>,
    input: GoogleDriveAccountAuthInput,
) -> Result<GoogleDriveAccountAuth, String> {
    let remote_sync = app_state.remote_sync.read().await;
    remote_sync.get_google_drive_account_auth(input)
}

#[tauri::command]
pub async fn remote_sync_google_drive_update_account(
    app_state: tauri::State<'_, AppState>,
    input: GoogleDriveAccountUpdateInput,
) -> Result<RemoteSyncState, String> {
    let mut remote_sync = app_state.remote_sync.write().await;
    remote_sync.update_google_drive_account(input).await
}

#[tauri::command]
pub async fn remote_sync_google_drive_disconnect_account(
    app_state: tauri::State<'_, AppState>,
    input: GoogleDriveDisconnectInput,
) -> Result<RemoteSyncState, String> {
    let state = {
        let mut remote_sync = app_state.remote_sync.write().await;
        remote_sync.disconnect_google_drive_account(input).await?
    };

    sync_backup_manifest_to_active_workspace(app_state.inner(), &state).await?;
    Ok(state)
}

#[tauri::command]
pub async fn remote_sync_google_drive_acquire_lock(
    app_state: tauri::State<'_, AppState>,
    input: GoogleDriveSyncLockAcquireInput,
) -> Result<GoogleDriveSyncLockLease, String> {
    let mut remote_sync = app_state.remote_sync.write().await;
    remote_sync.acquire_google_drive_sync_lock(input)
}

#[tauri::command]
pub async fn remote_sync_google_drive_release_lock(
    app_state: tauri::State<'_, AppState>,
    input: GoogleDriveSyncLockReleaseInput,
) -> Result<(), String> {
    let mut remote_sync = app_state.remote_sync.write().await;
    remote_sync.release_google_drive_sync_lock(input);
    Ok(())
}

#[tauri::command]
pub async fn remote_sync_google_drive_get_local_fingerprint(
    app_state: tauri::State<'_, AppState>,
) -> Result<GoogleDriveLocalFingerprint, String> {
    Ok(GoogleDriveLocalFingerprint {
        content_hash: current_workspace_content_hash(app_state.inner()).await?,
    })
}

#[tauri::command]
pub async fn remote_sync_google_drive_prepare_push(
    app_state: tauri::State<'_, AppState>,
    input: Option<GoogleDrivePreparePushInput>,
) -> Result<GoogleDrivePreparedPush, String> {
    let (workspace, account_id) = {
        let mut remote_sync = app_state.remote_sync.write().await;
        let workspace = remote_sync.get_state().await?.workspace;

        if workspace.provider != RemoteSyncProvider::GoogleDrive {
            return Err("workspace is not linked to Google Drive".to_string());
        }

        let account_id = workspace
            .account_id
            .clone()
            .ok_or("workspace is missing a linked Google Drive account".to_string())?;

        (workspace, account_id)
    };

    let entry = {
        let mut backup = app_state.backup.write().await;
        backup.sync_manifest_workspace(Some(&workspace))?;
        if google_drive_push_snapshot_source(input.as_ref()) == BackupSource::Manual {
            backup.create(false).await?
        } else {
            backup
                .create_managed_retaining_previous(BackupSource::Autosave, None, false)
                .await?
        }
    };

    let (contents_base64, content_hash, app_version) = {
        let settings = app_state.settings.read().await;
        let path = settings.backup_dir.join(&entry.filename);
        let bytes = fs::read(&path).map_err(|error| error.to_string())?;
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

#[tauri::command]
pub async fn remote_sync_google_drive_mark_synced(
    app_state: tauri::State<'_, AppState>,
    input: GoogleDriveSyncCompleteInput,
) -> Result<RemoteSyncState, String> {
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

    sync_backup_manifest_to_active_workspace(app_state.inner(), &state).await?;
    Ok(state)
}

#[tauri::command]
pub async fn remote_sync_google_drive_apply_pull(
    app_state: tauri::State<'_, AppState>,
    input: GoogleDriveApplyPullInput,
) -> Result<RemoteSyncState, String> {
    let workspace_id = sanitize_string(&input.workspace_id);
    let account_id = sanitize_string(&input.account_id);
    let filename = sanitize_filename(&input.filename);

    if workspace_id.is_empty() || account_id.is_empty() {
        return Err("workspace and account are required for pull".to_string());
    }

    let (backup_dir, current_version) = {
        let settings = app_state.settings.read().await;
        (settings.backup_dir.clone(), settings.version.clone())
    };

    if sanitize_string(&input.app_version) != current_version {
        return Err("remote snapshot app version does not match current app version".to_string());
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
        .map_err(|error| error.to_string())?;

    validate_google_drive_pull_content_hash(expected_content_hash.as_deref(), &bytes)?;

    fs::write(&temp_path, bytes).map_err(|error| error.to_string())?;

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

    sync_backup_manifest_to_active_workspace(app_state.inner(), &state).await?;
    Ok(state)
}
