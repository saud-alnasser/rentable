use crate::{diagnostics, error::Error, state::AppState};

use super::{BackupEntry, sync_backup_manifest_workspace};

#[tauri::command]
pub async fn backup_list(app_state: tauri::State<'_, AppState>) -> Result<Vec<BackupEntry>, Error> {
    sync_backup_manifest_workspace(app_state.inner()).await?;

    let mut backup = app_state.backup.write().await;
    let entries = backup.list().await?;

    Ok(entries)
}

#[tauri::command]
pub async fn backup_create(app_state: tauri::State<'_, AppState>) -> Result<BackupEntry, Error> {
    sync_backup_manifest_workspace(app_state.inner()).await?;

    let mut backup = app_state.backup.write().await;

    match backup.create(false).await {
        Ok(entry) => {
            diagnostics::info("backup.created")
                .with("filename", entry.filename.as_str())
                .with("source", format!("{:?}", entry.source))
                .write();

            Ok(entry)
        }
        Err(error) => {
            diagnostics::error("backup.createFailed")
                .with("error", error.to_string())
                .write();

            Err(error)
        }
    }
}

#[tauri::command]
pub async fn backup_restore(
    app_state: tauri::State<'_, AppState>,
    filename: String,
) -> Result<(), Error> {
    let backup = app_state.backup.read().await;

    match backup.restore(&filename).await {
        Ok(()) => {
            diagnostics::info("backup.restored")
                .with("filename", filename.as_str())
                .write();

            Ok(())
        }
        Err(error) => {
            diagnostics::error("backup.restoreFailed")
                .with("filename", filename.as_str())
                .with("error", error.to_string())
                .write();

            Err(error)
        }
    }
}

#[tauri::command]
pub async fn backup_delete(
    app_state: tauri::State<'_, AppState>,
    filename: String,
) -> Result<(), Error> {
    sync_backup_manifest_workspace(app_state.inner()).await?;

    let mut backup = app_state.backup.write().await;

    backup.delete(&filename).await?;

    diagnostics::info("backup.deleted")
        .with("filename", filename.as_str())
        .write();

    Ok(())
}
