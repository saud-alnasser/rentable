use crate::{error::Error, state::AppState};

use super::store::RemoteSyncState;
use super::turso::consent::{TursoConsentResult, TursoConsentStart, TursoEndpoints};
use super::turso::platform::SyncRefusal;

#[tauri::command]
pub async fn remote_sync_state_get(
    app_state: tauri::State<'_, AppState>,
) -> Result<RemoteSyncState, Error> {
    let mut remote_sync = app_state.remote_sync.write().await;

    remote_sync.get_state().await
}
/// Rename the current workspace, on every machine signed in to it.
///
/// **One command for the whole act, and the interface observes it.** The name lives on the
/// organization database's workspace row, sealed under the content key and outside the
/// signature, as the plan puts it, so whoever carries `renameWorkspace` writes it and every
/// replica reads it on its next pull. Answers with the state, so the caller reads the name it
/// just set rather than the one it had.
///
/// The name is validated by the form before it gets here and again by the shell, which is what
/// stores it. Nothing is validated in between: a third opinion in the middle would be the one
/// that goes stale.
#[tauri::command]
pub async fn remote_sync_rename_workspace(
    app_state: tauri::State<'_, AppState>,
    name: String,
) -> Result<RemoteSyncState, Error> {
    crate::organization::rename_current_workspace(app_state.inner(), &name).await?;

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
    let replicated = {
        let db = app_state.db.read().await;

        db.replicate().await
    };

    match &replicated.refusal {
        // the remote was reached, or could not be: the offline case, which needs nothing.
        SyncRefusal::None => {
            if replicated.pushed || replicated.received {
                let mut remote_sync = app_state.remote_sync.write().await;
                remote_sync.clear_account_refusal();
                remote_sync.clear_credential_refusal();
            }

            Ok(Replication::from(replicated))
        }
        // requirement 25: the account's, said as the account's. The local replica goes on
        // serving every read and every write; what stops is replication, until the owner has
        // seen to the account and the next one goes through.
        SyncRefusal::Account { detail } => {
            app_state
                .remote_sync
                .write()
                .await
                .note_account_refusal(detail, crate::timestamp::now());

            Ok(Replication::from(replicated))
        }
        // a credential that stopped being accepted: a lock-out rotated it and the owner
        // re-sealed a fresh one to this member. The organization database says so, and reading
        // it costs one pull; where a credential moved, the same replication is tried once more
        // under it, and nobody has to do anything.
        SyncRefusal::Credential => {
            if !crate::organization::reconnect(&app_state).await {
                app_state
                    .remote_sync
                    .write()
                    .await
                    .note_credential_refusal(crate::timestamp::now());
                return Ok(Replication::from(replicated));
            }

            let db = app_state.db.read().await;
            let again = db.replicate().await;

            // the reconnect collected a fresh credential and the retry went through, or it did
            // not and the member is told their credential needs attention rather than shown
            // nothing wrong (requirement 25's shape, for the credential rather than the account).
            {
                let mut remote_sync = app_state.remote_sync.write().await;
                if matches!(again.refusal, SyncRefusal::None) && (again.pushed || again.received) {
                    remote_sync.clear_credential_refusal();
                } else if matches!(again.refusal, SyncRefusal::Credential) {
                    remote_sync.note_credential_refusal(crate::timestamp::now());
                }
            }

            Ok(Replication {
                pushed: replicated.pushed || again.pushed,
                received: replicated.received || again.received,
                refusal: again.refusal.into(),
            })
        }
    }
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
    /// why a half did not go, where Turso said: the account's, or the credential's. `none` is
    /// offline or nothing to say, and the two halves say which.
    pub refusal: ReplicationRefusal,
}

/// The refusal as the web layer reads it: which kind, and never Turso's sentence, which is the
/// owner's alone and read through `organization_account_refusal_detail`.
#[derive(serde::Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ReplicationRefusal {
    None,
    Account,
    Credential,
}

impl From<SyncRefusal> for ReplicationRefusal {
    fn from(refusal: SyncRefusal) -> Self {
        match refusal {
            SyncRefusal::None => Self::None,
            SyncRefusal::Account { .. } => Self::Account,
            SyncRefusal::Credential => Self::Credential,
        }
    }
}

impl From<crate::database::Replicated> for Replication {
    fn from(replicated: crate::database::Replicated) -> Self {
        Self {
            pushed: replicated.pushed,
            received: replicated.received,
            refusal: replicated.refusal.into(),
        }
    }
}

/// Ask Turso for the authority this application needs, and answer with the page to open.
///
/// **The browser is opened by the caller**: the consent screen is the person's and the
/// application's part of it ends at composing the URL. What is held here is the PKCE verifier and the state, neither of which the web layer
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
///
/// *This was `organization_disconnect` until effort 824 gave that name to forgetting the
/// organization itself (`organization::organization_disconnect`), which clears the authority as
/// one of its steps; what the setup walk offers is this narrower act, the consent alone.*
#[tauri::command]
pub async fn organization_consent_disconnect(
    app_state: tauri::State<'_, AppState>,
) -> Result<(), Error> {
    app_state.consent.disconnect()
}
