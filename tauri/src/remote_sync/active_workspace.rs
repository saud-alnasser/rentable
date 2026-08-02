//! the local reads and writes a sync run makes on the workspace as it stands on
//! this machine.
//!
//! Separate from [`super::google::conflict`] and [`super::google::manifest`] so
//! that those hold pure functions and nothing else: everything here needs the
//! application state, so none of it can be exercised by calling it with values.

use std::fs;

use crate::{error::Error, state::AppState, timestamp};

use super::google::conflict::content_hash_hex;
use super::store::RemoteSyncState;

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
