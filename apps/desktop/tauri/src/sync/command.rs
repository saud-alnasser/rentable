use crate::{clock, error::Error, machine::RemoteSyncState, state::AppState};

#[tauri::command]
pub async fn remote_sync_state_get(
    app_state: tauri::State<'_, AppState>,
) -> Result<RemoteSyncState, Error> {
    let mut remote_sync = app_state.remote_sync.write().await;

    remote_sync.get_state().await
}

/// Send what this machine wrote, and nothing else.
///
/// **The last call of a session pushes and does not pull.** A pull on the way out fetches rows into
/// a window that is closing, with nothing left to render them and a network round trip standing
/// between the person and the application shutting; what must not be skipped is the offer of what
/// they wrote.
#[tauri::command]
pub async fn remote_sync_push(
    app_state: tauri::State<'_, AppState>,
    clock: tauri::State<'_, clock::Shared>,
) -> Result<bool, Error> {
    let pushed = app_state.db.read().await.push_replica().await;

    // a push that went is a replication that went through, and the last one of a session is
    // exactly the moment the block should read on the next launch (effort 828, requirement 25).
    if pushed {
        crate::machine::note_reached(&app_state.remote_sync, clock.as_ref()).await;
    }

    Ok(pushed)
}
