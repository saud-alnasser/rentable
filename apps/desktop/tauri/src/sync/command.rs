use crate::{error::Error, state::AppState};

use super::control::establish_held_session as establish_control_plane_session;
use super::control::renew_session as renew_control_plane_session;
use super::sign_in::{sign_in_with_google, sign_out_of_google};
use super::store::RemoteSyncState;

#[tauri::command]
pub async fn remote_sync_state_get(
    app_state: tauri::State<'_, AppState>,
) -> Result<RemoteSyncState, Error> {
    let mut remote_sync = app_state.remote_sync.write().await;

    remote_sync.get_state().await
}
/// Reach the control plane and restart the window, where there is one to restart.
///
/// **This is *reaching the API inside the window*, as a call the application actually makes.**
/// The sync dispatcher runs it on the hosted path before it decides whether to replicate, and
/// the autosync manager already schedules that on a timer and on the machine coming back online
/// — so a client that is doing anything at all renews without anybody thinking about it.
///
/// Answers with the state, so the caller reads the window it just moved rather than the one it
/// had. Being offline is not a failure: the window stays where it was and the client goes on
/// replicating until it closes on its own.
#[tauri::command]
pub async fn remote_sync_renew_session(
    app_state: tauri::State<'_, AppState>,
) -> Result<RemoteSyncState, Error> {
    renew_control_plane_session(app_state.inner()).await?;

    let mut remote_sync = app_state.remote_sync.write().await;
    remote_sync.get_state().await
}

/// Reach the control plane with the identity this machine already holds, and say where that left it.
///
/// **The retry for a sign-in that got half way**, and the reason it is a command of its own rather
/// than another `google_sign_in` is that the consent screen is not what failed. This machine has
/// Google credentials and no session; opening a browser to be told again who the user is would
/// arrive back at the same missing session.
///
/// Answers with the state, so the screen that called it reads what it now stands on rather than
/// what it stood on before. A control plane that is still unreachable is not an error here: the
/// state comes back carrying no window, and the screen says so.
#[tauri::command]
pub async fn remote_sync_establish_session(
    app_state: tauri::State<'_, AppState>,
) -> Result<RemoteSyncState, Error> {
    establish_control_plane_session(app_state.inner()).await?;

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
pub async fn remote_sync_push(app_state: tauri::State<'_, AppState>) -> Result<bool, Error> {
    Ok(app_state.db.read().await.push_replica().await)
}

/// Send what this machine wrote, then take what the others wrote.
///
/// **Push before pull, and the order is the point.** A pull can bring another device's edit to a
/// row this machine has also changed; pushing first means what is here has been offered before
/// anything can land on top of it, so what a losing writer loses is a column rather than a write
/// that never left. #552's tests measure exactly that.
///
/// **Answers whether the pull brought anything**, because the caller has work to do only if it
/// did: another device's rows change derived state, so they have to be reconciled and the query
/// cache told. A pull that brought nothing is not an event.
///
/// **Neither half failing is an error.** Offline is the ordinary case and requirement 7 is that
/// the application stays usable through it; what could not be sent stays captured for the next
/// push, and what could not be fetched is fetched next time.
#[tauri::command]
pub async fn remote_sync_replicate(
    app_state: tauri::State<'_, AppState>,
) -> Result<Replication, Error> {
    let db = app_state.db.read().await;

    Ok(Replication {
        pushed: db.push_replica().await,
        received: db.pull_replica().await,
    })
}

/// what one replication did.
///
/// **Both halves are answered, and `pushed` is the one that is easy to leave out.** A push that
/// could not reach the remote is not an error — the writes stay captured and go with the next one —
/// but something has to try again, and a caller that cannot tell a push that went from one that did
/// not has nothing to schedule on. Without it a machine on a network with no upstream sends a
/// payment at the next mutation, or never.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Replication {
    pub pushed: bool,
    pub received: bool,
}

/// Sign in with Google, and nothing else.
///
/// The workspace is untouched — this establishes who somebody is, which is a
/// thing this application holds on its own.
///
/// Outstanding for as long as the user takes over the consent screen; progress
/// arrives on [`GOOGLE_SIGN_IN_PHASE_EVENT`].
///
/// [`GOOGLE_SIGN_IN_PHASE_EVENT`]: super::sign_in::GOOGLE_SIGN_IN_PHASE_EVENT
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
