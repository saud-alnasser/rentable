mod plugin;

use crate::{
    clock, diagnostics,
    error::Error,
    organization::{Shared, workspace::open_database},
    settings,
    update::{self, Recovery, RecoveryStatus},
};

pub use plugin::plugin;

/// Invoked as `plugin:startup|bootstrap`.
#[tauri::command]
pub async fn bootstrap(
    settings: tauri::State<'_, settings::Shared>,
    update: tauri::State<'_, update::Shared>,
    organization: tauri::State<'_, Shared>,
    clock: tauri::State<'_, clock::Shared>,
) -> Result<Recovery, Error> {
    let version = settings.read().await.version.clone();

    diagnostics::info("startup.started")
        .with("version", version.as_str())
        .write();

    let mut update = update.write().await;

    // a record whose target is not this version is over, whichever way it went.
    update.settle_at_launch(&version)?;

    let error = open_database(&organization, clock.as_ref()).await;

    if let Some(error) = error.as_ref() {
        diagnostics::error("startup.database.unavailable")
            .with("error", error.to_string())
            .write();
    }

    let is_pending_target_recovery = update.recovery().status == RecoveryStatus::Pending
        && update.recovery().target_version == version
        && update.recovery().previous_version != version;

    if is_pending_target_recovery {
        match error.clone() {
            Some(err) => update.fail(Some(err.to_string()))?,
            None => update.resolve()?,
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
