use crate::{
    diagnostics,
    error::Error,
    state::AppState,
    update::{Recovery, RecoveryStatus},
};

#[tauri::command]
pub async fn bootstrap(app_state: tauri::State<'_, AppState>) -> Result<Recovery, Error> {
    let version = app_state.settings.read().await.version.clone();

    diagnostics::info("startup.started")
        .with("version", version.as_str())
        .write();

    let mut update = app_state.update.write().await;

    if update.recovery().status == RecoveryStatus::Pending
        && update.recovery().backup_version == version
        && update.recovery().target_version != version
    {
        let target_version = update.recovery().target_version.clone();
        let backup_version = update.recovery().backup_version.clone();

        match update.recovery().update_error.clone() {
            Some(error) => {
                diagnostics::warn("startup.recovery.rollingBack")
                    .with("targetVersion", target_version)
                    .with("backupVersion", backup_version)
                    .with("error", error)
                    .write();

                update.rollback().await?
            }
            None => {
                diagnostics::info("startup.recovery.completing")
                    .with("targetVersion", target_version)
                    .with("backupVersion", backup_version)
                    .write();

                update.complete().await?
            }
        }
    }

    let error = {
        let mut db = app_state.db.write().await;

        db.connect().await.err()
    };

    if let Some(error) = error.as_ref() {
        diagnostics::error("startup.database.unavailable")
            .with("error", error.to_string())
            .write();
    }

    let is_pending_target_recovery = update.recovery().status == RecoveryStatus::Pending
        && update.recovery().target_version == version
        && update.recovery().backup_version != version;

    if is_pending_target_recovery {
        match error.clone() {
            Some(err) => update.fail(Some(err.to_string()))?,
            None => update.complete().await?,
        }
    }

    if let Some(error) = error {
        if is_pending_target_recovery {
            return Ok(update.recovery().inner().clone());
        }

        return Err(error);
    }

    diagnostics::info("startup.completed")
        .with("version", version.as_str())
        .write();

    Ok(update.recovery().inner().clone())
}
