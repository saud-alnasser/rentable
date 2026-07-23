use crate::state::AppState;

use super::{BackupEntry, sync_backup_manifest_workspace};

#[tauri::command]
pub async fn backup_list(
    app_state: tauri::State<'_, AppState>,
) -> Result<Vec<BackupEntry>, String> {
    sync_backup_manifest_workspace(app_state.inner()).await?;

    let mut backup = app_state.backup.write().await;
    let entries = backup.list().await?;

    Ok(entries)
}

#[tauri::command]
pub async fn backup_create(app_state: tauri::State<'_, AppState>) -> Result<BackupEntry, String> {
    sync_backup_manifest_workspace(app_state.inner()).await?;

    let mut backup = app_state.backup.write().await;
    let entry = backup.create(false).await?;

    Ok(entry)
}

#[tauri::command]
pub async fn backup_restore(
    app_state: tauri::State<'_, AppState>,
    filename: String,
) -> Result<(), String> {
    let backup = app_state.backup.read().await;
    backup.restore(&filename).await?;

    Ok(())
}

#[tauri::command]
pub async fn backup_delete(
    app_state: tauri::State<'_, AppState>,
    filename: String,
) -> Result<(), String> {
    sync_backup_manifest_workspace(app_state.inner()).await?;

    let mut backup = app_state.backup.write().await;
    backup.delete(&filename).await?;

    Ok(())
}
