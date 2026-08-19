//! what a sync run reads and writes on the workspace as it stands on this machine.
//!
//! **One function is left and it was never Drive's.** The rest — preparing the snapshot a push
//! sent, applying a pull, hashing the workspace to compare two sides, recording what a sync
//! settled — retired with Google Drive sync (decision 07), because each of them existed to
//! move a whole snapshot between two copies of a file. A replica resolves divergence per
//! column as it arrives and has no pair of snapshots for anybody to choose between.

use crate::{error::Error, state::AppState};

use super::store::RemoteSyncState;

pub(crate) async fn sync_backup_manifest_to_active_workspace(
    app_state: &AppState,
    state: &RemoteSyncState,
) -> Result<(), Error> {
    let mut backup = app_state.backup.write().await;
    backup.sync_manifest_workspace(Some(&state.workspace))
}
