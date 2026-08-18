use crate::{backup::BackupSource, diagnostics, error::Error, state::AppState};

use super::inspection::GoogleDriveLinkPreparation;
use super::link::{
    cancel_google_drive_link, link_google_drive_workspace, sign_in_with_google, sign_out_of_google,
    unlink_google_drive_workspace,
};
use super::store::RemoteSyncState;
use super::sync::{
    GoogleDriveResolveConflictInput, GoogleDriveSyncInput, GoogleDriveSyncOutcome,
    inspect_google_drive_conflict, resolve_google_drive_conflict, sync_google_drive_workspace,
};
use super::workspace::sync_backup_manifest_to_active_workspace;

#[tauri::command]
pub async fn remote_sync_state_get(
    app_state: tauri::State<'_, AppState>,
) -> Result<RemoteSyncState, Error> {
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
) -> Result<RemoteSyncState, Error> {
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

    diagnostics::info("sync.snapshot.recorded")
        .with("workspace", state.workspace.id.as_str())
        .with("filename", entry.filename.as_str())
        .write();

    {
        let mut backup = app_state.backup.write().await;
        let _ = backup.cleanup_retained().await;
    }

    Ok(state)
}
#[tauri::command]
pub async fn remote_sync_autosave_now(
    app_state: tauri::State<'_, AppState>,
) -> Result<RemoteSyncState, Error> {
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

    diagnostics::info("sync.autosave.recorded")
        .with("workspace", state.workspace.id.as_str())
        .with("filename", entry.filename.as_str())
        .write();

    {
        let mut backup = app_state.backup.write().await;
        let _ = backup.cleanup_retained().await;
    }

    Ok(state)
}

/// Sign in with Google, and nothing else.
///
/// No folder is chosen and the workspace is untouched — this establishes who
/// somebody is, which is a thing this application can hold on its own. Linking a
/// Drive folder is a second command that consumes the result.
///
/// Outstanding for as long as the user takes over the consent screen; progress
/// arrives on [`GOOGLE_SIGN_IN_PHASE_EVENT`].
///
/// [`GOOGLE_SIGN_IN_PHASE_EVENT`]: super::link::GOOGLE_SIGN_IN_PHASE_EVENT
#[tauri::command]
pub async fn google_sign_in(
    app: tauri::AppHandle,
    app_state: tauri::State<'_, AppState>,
) -> Result<RemoteSyncState, Error> {
    sign_in_with_google(&app, app_state.inner()).await
}

/// Give up the identity this machine holds.
///
/// Whatever is linked under it stays linked and says what it is waiting for.
/// Signing out of a machine that holds no identity is refused.
#[tauri::command]
pub async fn google_sign_out(
    app_state: tauri::State<'_, AppState>,
) -> Result<RemoteSyncState, Error> {
    sign_out_of_google(app_state.inner()).await
}

/// Link this workspace to a Google account, end to end.
///
/// Signs in first only where this machine holds no identity to link under; where
/// it does, no consent screen opens and no phase is emitted.
#[tauri::command]
pub async fn remote_sync_google_drive_link(
    app: tauri::AppHandle,
    app_state: tauri::State<'_, AppState>,
) -> Result<GoogleDriveLinkPreparation, Error> {
    link_google_drive_workspace(&app, app_state.inner()).await
}

/// Abandon the link that is outstanding, and undo one already recorded.
#[tauri::command]
pub async fn remote_sync_google_drive_cancel_link_attempt(
    app_state: tauri::State<'_, AppState>,
) -> Result<RemoteSyncState, Error> {
    cancel_google_drive_link(app_state.inner()).await
}

/// Disconnect this workspace from Google Drive, keeping one current snapshot of
/// it on this machine.
#[tauri::command]
pub async fn remote_sync_google_drive_unlink(
    app_state: tauri::State<'_, AppState>,
) -> Result<RemoteSyncState, Error> {
    unlink_google_drive_workspace(app_state.inner()).await
}

/// Ask what the remote holds for this workspace, and whether the two sides can
/// be reconciled without the user.
///
/// Resolves to `null` where the workspace is not on Drive.
#[tauri::command]
pub async fn remote_sync_google_drive_inspect(
    app_state: tauri::State<'_, AppState>,
) -> Result<Option<GoogleDriveLinkPreparation>, Error> {
    inspect_google_drive_conflict(app_state.inner()).await
}

/// Settle the conflict the user was asked about, the way they chose.
///
/// `local` keeps this machine's copy and makes the remote match it; `remote`
/// does the reverse. The remote is read again rather than trusting what the
/// question was asked against, because the user takes as long as they take.
#[tauri::command]
pub async fn remote_sync_google_drive_resolve_conflict(
    app_state: tauri::State<'_, AppState>,
    input: GoogleDriveResolveConflictInput,
) -> Result<GoogleDriveSyncOutcome, Error> {
    resolve_google_drive_conflict(app_state.inner(), input.resolution).await
}

/// Sync this workspace with the account it is linked to, end to end.
///
/// `manual` says the user asked, which is what decides the snapshot a push
/// sends. The result reports what happened, and carries the question to put to
/// the user where the two sides could not be reconciled without one.
#[tauri::command]
pub async fn remote_sync_google_drive_sync(
    app_state: tauri::State<'_, AppState>,
    input: Option<GoogleDriveSyncInput>,
) -> Result<GoogleDriveSyncOutcome, Error> {
    sync_google_drive_workspace(
        app_state.inner(),
        input.map(|input| input.manual).unwrap_or(false),
    )
    .await
}
