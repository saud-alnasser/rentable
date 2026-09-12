use crate::{error::Error, state::AppState};

use super::control::establish_held_session as establish_control_plane_session;
use super::control::rename_workspace as rename_control_plane_workspace;
use super::control::renew_session as renew_control_plane_session;
use super::sign_in::{sign_in_with_google, sign_out_of_google};
use super::store::RemoteSyncState;
use super::turso::consent::{TursoConsentResult, TursoConsentStart, TursoEndpoints};

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

/// Call this workspace something else.
///
/// **One command for the whole act, and the interface observes it.** The caller asks for the
/// outcome rather than for a step: this reaches the control plane, which is where the name lives,
/// writes what came back, and answers with the state. A caller that had to mint, then rename, then
/// re-read would be sequencing a protocol it has no business knowing.
///
/// **Answers with the state for the same reason the two session commands do** — the caller reads
/// the name it just set rather than the one it had, and the three surfaces that draw a workspace
/// name all read that one query.
///
/// The name is validated by the form before it gets here and again by the control plane, which is
/// the one that has to store it. Nothing is validated in between: a third opinion in the middle
/// would be the one that goes stale.
#[tauri::command]
pub async fn remote_sync_rename_workspace(
    app_state: tauri::State<'_, AppState>,
    name: String,
) -> Result<RemoteSyncState, Error> {
    rename_control_plane_workspace(app_state.inner(), &name).await?;

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
    let (pushed, received) = {
        let db = app_state.db.read().await;

        (db.push_replica().await, db.pull_replica().await)
    };

    if pushed && received {
        return Ok(Replication { pushed, received });
    }

    // a half that failed is the offline case, or a credential that stopped being accepted: a
    // lock-out rotated it and the owner re-sealed a fresh one to this member. The organization
    // database says which, and reading it costs one pull; where a credential moved, the same
    // replication is tried once more under it, and nobody has to do anything.
    if !crate::organization::reconnect(&app_state).await {
        return Ok(Replication { pushed, received });
    }

    let db = app_state.db.read().await;

    Ok(Replication {
        pushed: pushed || db.push_replica().await,
        received: received || db.pull_replica().await,
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

/// Ask Turso for the authority this application needs, and answer with the page to open.
///
/// **The browser is opened by the caller**, which is how signing in with Google already works:
/// the consent screen is the person's and the application's part of it ends at composing the
/// URL. What is held here is the PKCE verifier and the state, neither of which the web layer
/// is given, so a caller cannot redeem the code that comes back on its own.
///
/// Nothing is granted by this call. It claims a loopback port, registers this application as a
/// public client on it, and returns; what the person does next arrives on that port and is read
/// by [`organization_consent_result`].
#[tauri::command]
pub async fn organization_consent_begin(
    app_state: tauri::State<'_, AppState>,
) -> Result<TursoConsentStart, Error> {
    app_state.consent.begin(TursoEndpoints::production()).await
}

/// How far one consent has got.
///
/// **It returns no token**, which is [[rules/credentials]]'s *Client boundary* at the one place
/// this application obtains a Platform API token: the token is filed in the operating system's
/// credential store by the call that redeems it and never crosses to TypeScript.
///
/// Polled while the status is `pending`. A consent that failed says so and says why; one the
/// person abandoned says that instead, because closing the browser tab is the ordinary way a
/// consent ends and there is nothing to report about it.
#[tauri::command]
pub async fn organization_consent_result(
    app_state: tauri::State<'_, AppState>,
    session_id: String,
) -> Result<TursoConsentResult, Error> {
    app_state.consent.result(&session_id).await
}

/// Hand the Turso authority back.
///
/// The token is removed from this machine's credential store and the consents this process
/// started are dropped with it, so nothing is left that a later run could read as a grant.
///
/// **Nothing is revoked at Turso by this**, and the surface offering it has to say so. There
/// is no revocation endpoint in the authorization server's metadata and the token carries no
/// expiry, so what the account granted stays granted until the person ends it in Turso's own
/// dashboard.
///
/// It answers nothing, and disconnecting a machine that holds no token is not an error: the
/// caller asked for there to be no token, and afterwards there is none.
#[tauri::command]
pub async fn organization_disconnect(app_state: tauri::State<'_, AppState>) -> Result<(), Error> {
    app_state.consent.disconnect()
}
