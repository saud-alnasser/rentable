//! remote manifest concerns. The manifest-reconciliation port (#114) lands here.

use crate::state::AppState;

use super::super::store::RemoteSyncState;

pub(crate) async fn sync_backup_manifest_to_active_workspace(
    app_state: &AppState,
    state: &RemoteSyncState,
) -> Result<(), String> {
    let mut backup = app_state.backup.write().await;
    backup.sync_manifest_workspace(Some(&state.workspace))
}
