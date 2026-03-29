use crate::{
    state::AppState,
    update::{Recovery, RecoveryStatus},
};

#[tauri::command]
pub async fn bootstrap(app_state: tauri::State<'_, AppState>) -> Result<Recovery, String> {
    let version = app_state.settings.read().await.version.clone();
    let mut update = app_state.update.write().await;

    if update.recovery().status == RecoveryStatus::Pending
        && update.recovery().backup_version == version
        && update.recovery().target_version != version
    {
        match update.recovery().update_error.as_ref() {
            Some(_) => update.rollback().await?,
            None => update.complete().await?,
        }
    }

    let error = {
        let mut db = app_state.db.write().await;

        db.connect().await.err()
    };

    let is_pending_target_recovery = update.recovery().status == RecoveryStatus::Pending
        && update.recovery().target_version == version
        && update.recovery().backup_version != version;

    if is_pending_target_recovery {
        match error.clone() {
            Some(err) => update.fail(Some(err))?,
            None => update.complete().await?,
        }
    }

    if let Some(error) = error {
        if is_pending_target_recovery {
            return Ok(update.recovery().inner().clone());
        }

        return Err(error);
    }

    Ok(update.recovery().inner().clone())
}
