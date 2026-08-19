//! reaching the control plane, and holding the session it issues.
//!
//! **This is the writer requirement 15's window did not have.** A session is a lifetime the
//! control plane issues; a client that never asks for one holds nothing, and a client holding
//! nothing is indistinguishable from a client whose window closed. So signing in reaches this
//! module, and what comes back is what the desktop believes about how much longer it may
//! replicate.
//!
//! **The token stays here and the expiry crosses.** The session token is a bearer credential —
//! whoever holds it is the account — so it is filed in the platform's credential store beside the
//! Google refresh token, and no command hands it to the web layer. What TypeScript is given is
//! the two moments, which are facts *about* credentials rather than credentials, exactly as
//! `RemoteSyncAccount::token_expires_at` already is.
//!
//! **Three moments, and the client believes the earliest.** `expires_at` is the refresh window —
//! how much longer this machine may work without reaching the control plane; `replica_expires_at` is how much longer the credential
//! the replica actually syncs with lives; `absolute_expires_at` is when the sign-in itself dies
//! and no refresh extends it. They are started by different calls — a refresh moves the first
//! alone, a mint restarts the first two, and nothing moves the third — so equal lengths do not
//! make them one clock, and the side that decides whether to keep replicating has to hold all
//! three.
//!
//! **Absent configuration is not a failure.** `RENTABLE_CONTROL_PLANE_URL` is unset on every
//! machine today and there is no deployment, so `sign_in` skips this entirely and a workspace
//! stays exactly as local as it was. That is the same shape as `google_oauth_client_id`: a
//! capability the application reports rather than a precondition it dies of.

use std::time::Duration;

#[cfg(not(test))]
use keyring::{Entry as KeyringEntry, Error as KeyringError};
use serde::{Deserialize, Serialize};

#[cfg(test)]
use std::{collections::HashMap, sync::Mutex};

use crate::{diagnostics, error::Error, http::build_client, state::AppState, timestamp};

use super::store::{RemoteSync, sanitize_string};

/// How long this application waits on the control plane before giving up.
///
/// Deliberately short: every call here is one small JSON exchange on the credential path, and a
/// sign-in that hangs is a sign-in the user cancels.
const CONTROL_PLANE_TIMEOUT: Duration = Duration::from_secs(20);

/// Where stored control-plane sessions are filed in the platform's credential store.
///
/// Its own service name rather than a second key under `rentable.google-drive`, and for the
/// reason that name carries its own note: a keyring service is data on installed machines. These
/// are different credentials from different issuers with different lifetimes, and filing them
/// together would mean signing out of one could not be told from signing out of the other.
#[cfg(not(test))]
const CONTROL_PLANE_KEYRING_SERVICE: &str = "rentable.control-plane";

/// the base URL of the control plane, or nothing where this build has not been told one.
///
/// An environment variable, which is how `GOOGLE_OAUTH_CLIENT_ID` is already supplied — there is
/// no deployment yet, so the honest default is *no control plane* rather than a hostname that
/// would fail on every machine.
pub(crate) fn control_plane_url() -> Option<String> {
    std::env::var("RENTABLE_CONTROL_PLANE_URL")
        .ok()
        .map(|value| value.trim().trim_end_matches('/').to_string())
        .filter(|value| !value.is_empty())
}

/// the session credential, as it is filed in the credential store.
///
/// Never serialised into `RemoteSyncState`, never returned by a command, and never logged. The
/// type is separate from [`SessionWindow`] for exactly that reason: the thing that crosses the
/// boundary cannot accidentally be the thing that must not.
#[derive(Clone, Debug, Serialize, Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
pub(crate) struct StoredControlPlaneSession {
    pub account_id: String,
    pub token: String,
    pub updated_at: i64,
}

/// how much longer this machine may go on replicating, as two moments.
///
/// Persisted with the workspace rather than held in memory, because requirement 15 is that a
/// signed-in client works offline for *three days* — a window that reset to zero every time the
/// application was reopened would be a window measured in one session, which is not that.
#[derive(Clone, Debug, Serialize, Deserialize, Default, PartialEq, Eq)]
#[serde(default, rename_all = "camelCase")]
pub struct SessionWindow {
    /// which account this session belongs to, so a sign-out takes the right one.
    pub account_id: String,
    /// the refresh window: how much longer this machine may work without reaching the control
    /// plane. Moved by every reach, and what locks the application when it closes.
    pub expires_at: i64,
    /// when the credential the replica syncs with dies. `None` until something has minted one.
    pub replica_expires_at: Option<i64>,
    /// when the sign-in itself dies, whatever this machine does. Set when the person signed in
    /// and never moved, so past it the lock is lifted only by signing in with Google again.
    pub absolute_expires_at: i64,
    pub updated_at: i64,
}

/// what the control plane answered a sign-in or a refresh with.
#[derive(Clone, Debug)]
pub(crate) struct IssuedSession {
    pub token: String,
    pub expires_at: i64,
    /// present only where the answer carried one — the mint's does, a refresh's does not.
    pub replica_expires_at: Option<i64>,
    pub absolute_expires_at: i64,
}

#[derive(Deserialize)]
struct WireSession {
    token: String,
    #[serde(rename = "expiresAt")]
    expires_at: i64,
    #[serde(rename = "absoluteExpiresAt")]
    absolute_expires_at: i64,
}

#[derive(Deserialize)]
struct WireAnswer {
    session: Option<WireSession>,
    /// the replica credential's own expiry, which only the mint answers with.
    #[serde(rename = "expiresAt")]
    replica_expires_at: Option<i64>,
}

#[derive(Deserialize)]
struct WireRefusal {
    error: Option<WireRefusalBody>,
}

#[derive(Deserialize)]
struct WireRefusalBody {
    code: String,
    message: String,
}

/// the control plane's own refusal code for a session it will not renew.
///
/// Matched rather than inferred from the status, because a 401 is also what an absent credential
/// and a Google token it would not take answer with, and only this one means *the window closed*.
const SESSION_EXPIRED: &str = "session_expired";

/// the control plane's code for a sign-in that has reached its absolute lifetime.
///
/// **Separate from `SESSION_EXPIRED` because the two ask different things of the person.** A
/// closed refresh window is settled by a network coming back and costs nobody a keystroke; this
/// one is settled only by signing in with Google again. Collapsing them would either leave
/// somebody waiting for a network that cannot help, or send them back to Google after a weekend.
const SESSION_LIFETIME_REACHED: &str = "session_lifetime_reached";

/// Reach the control plane, presenting whatever credential this call has.
///
/// One function for both calls, because they differ only in the path and the credential: signing
/// in presents Google's access token to `/account/sign-in`, and renewing presents the session to
/// `/session/refresh`. Both answer with a session, and both refuse the same way.
async fn call(base_url: &str, path: &str, bearer: &str) -> Result<IssuedSession, Error> {
    let client = build_client(CONTROL_PLANE_TIMEOUT)?;

    let response = client
        .post(format!("{base_url}{path}"))
        .bearer_auth(bearer)
        .header("content-type", "application/json")
        .send()
        .await
        .map_err(|error| Error::Network {
            message: format!("could not reach the control plane: {error}"),
        })?;

    let status = response.status();
    let body = response.text().await.unwrap_or_default();

    if !status.is_success() {
        return Err(refusal(status.as_u16(), &body));
    }

    let answer: WireAnswer = serde_json::from_str(&body).map_err(|error| Error::Integrity {
        message: format!("the control plane answered with something unreadable: {error}"),
    })?;

    let Some(session) = answer.session else {
        return Err(Error::Integrity {
            message: "the control plane answered without a session".to_string(),
        });
    };

    Ok(IssuedSession {
        token: session.token,
        expires_at: session.expires_at,
        replica_expires_at: answer.replica_expires_at,
        absolute_expires_at: session.absolute_expires_at,
    })
}

/// Turn the control plane's typed refusal into this application's typed error.
///
/// **The code is what is read, never the prose.** The control plane writes its message for a
/// person and this application shows its own, translated; what has to survive the boundary is
/// which of the failures it was, because the user's next move differs — sign in again, or wait.
fn refusal(status: u16, body: &str) -> Error {
    let code = serde_json::from_str::<WireRefusal>(body)
        .ok()
        .and_then(|refusal| refusal.error)
        .map(|error| (error.code, error.message));

    match code {
        Some((code, message)) if code == SESSION_EXPIRED => Error::Forbidden {
            message: format!("the control plane will not renew this sign-in: {message}"),
        },
        Some((code, message)) if code == SESSION_LIFETIME_REACHED => Error::Forbidden {
            message: format!("this sign-in has reached its lifetime: {message}"),
        },
        // A refusal on the merits. Retrying with the same credential cannot help, so it is not a
        // `Network` error even though it arrived over one.
        Some((code, message)) if status < 500 => Error::Forbidden {
            message: format!("the control plane refused this request ({code}): {message}"),
        },
        Some((code, message)) => Error::Network {
            message: format!("the control plane could not answer ({code}): {message}"),
        },
        None if status < 500 => Error::Forbidden {
            message: format!("the control plane refused this request with status {status}"),
        },
        None => Error::Network {
            message: format!("the control plane could not answer, status {status}"),
        },
    }
}

/// Exchange a Google access token for a session.
pub(crate) async fn sign_in(
    base_url: &str,
    google_access_token: &str,
) -> Result<IssuedSession, Error> {
    call(base_url, "/account/sign-in", google_access_token).await
}

/// Renew a session, restarting the window from now.
pub(crate) async fn refresh(base_url: &str, session_token: &str) -> Result<IssuedSession, Error> {
    call(base_url, "/session/refresh", session_token).await
}

impl RemoteSync {
    /// the window this machine is holding, or nothing where it holds no session.
    pub(crate) fn session_window(&self) -> Option<SessionWindow> {
        self.store.control_plane_session.clone()
    }

    /// Record what the control plane just issued: the token to the credential store, the window
    /// to the persisted store.
    ///
    /// **The replica's expiry is kept where the answer did not carry one.** A refresh moves the
    /// session and mints nothing, so forgetting the replica window on a refresh would make the
    /// client believe it may replicate until the session ends — which is precisely the drift the
    /// two fields exist to prevent.
    ///
    /// **The absolute lifetime is taken as answered and never merged with what was held.** Every
    /// answer carries it and no call moves it, so a held value differing from the answered one is
    /// the control plane having been told something this machine has not — a re-sign-in on
    /// another day — and the answer is the newer of the two.
    pub(crate) fn record_control_plane_session(
        &mut self,
        account_id: &str,
        issued: &IssuedSession,
    ) -> Result<SessionWindow, Error> {
        let account_id = sanitize_string(account_id);
        let now = timestamp::now();

        if account_id.is_empty() {
            return Err(Error::InvalidInput {
                message: "a control-plane session needs the account it belongs to".to_string(),
            });
        }

        self.save_control_plane_session(&StoredControlPlaneSession {
            account_id: account_id.clone(),
            token: issued.token.clone(),
            updated_at: now,
        })?;

        let held = self.store.control_plane_session.clone();
        let window = SessionWindow {
            account_id: account_id.clone(),
            expires_at: issued.expires_at,
            replica_expires_at: issued.replica_expires_at.or_else(|| {
                held.filter(|held| held.account_id == account_id)
                    .and_then(|held| held.replica_expires_at)
            }),
            absolute_expires_at: issued.absolute_expires_at,
            updated_at: now,
        };

        self.store.control_plane_session = Some(window.clone());
        self.store.commit()?;

        Ok(window)
    }

    /// Give up the session this machine holds. Signing out, and nothing else.
    pub(crate) fn forget_control_plane_session(&mut self) -> Result<(), Error> {
        if let Some(window) = self.store.control_plane_session.take() {
            self.delete_control_plane_session(&window.account_id)?;
            self.store.commit()?;
        }

        Ok(())
    }

    #[cfg(not(test))]
    pub(crate) fn load_control_plane_session(
        &self,
        account_id: &str,
    ) -> Result<Option<StoredControlPlaneSession>, Error> {
        let entry = self.control_plane_keyring_entry(account_id)?;
        let payload = match entry.get_password() {
            Ok(payload) => payload,
            Err(KeyringError::NoEntry) => return Ok(None),
            Err(error) => return Err(keyring_failure("read", account_id, error)),
        };

        serde_json::from_str::<StoredControlPlaneSession>(&payload)
            .map(Some)
            .map_err(|error| Error::Integrity {
                message: format!(
                    "failed to decode the stored control-plane session for {account_id}: {error}"
                ),
            })
    }

    #[cfg(test)]
    pub(crate) fn load_control_plane_session(
        &self,
        account_id: &str,
    ) -> Result<Option<StoredControlPlaneSession>, Error> {
        Ok(test_control_plane_sessions()
            .lock()
            .map_err(|_| Error::Internal {
                message: "failed to lock the test control-plane session store".to_string(),
            })?
            .get(account_id)
            .cloned())
    }

    #[cfg(not(test))]
    fn save_control_plane_session(&self, session: &StoredControlPlaneSession) -> Result<(), Error> {
        let entry = self.control_plane_keyring_entry(&session.account_id)?;
        let payload = serde_json::to_string(session).map_err(|error| Error::Internal {
            message: format!("failed to encode the control-plane session: {error}"),
        })?;

        entry
            .set_password(&payload)
            .map_err(|error| keyring_failure("store", &session.account_id, error))
    }

    #[cfg(test)]
    fn save_control_plane_session(&self, session: &StoredControlPlaneSession) -> Result<(), Error> {
        test_control_plane_sessions()
            .lock()
            .map_err(|_| Error::Internal {
                message: "failed to lock the test control-plane session store".to_string(),
            })?
            .insert(session.account_id.clone(), session.clone());

        Ok(())
    }

    #[cfg(not(test))]
    fn delete_control_plane_session(&self, account_id: &str) -> Result<(), Error> {
        let entry = self.control_plane_keyring_entry(account_id)?;

        match entry.delete_credential() {
            Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
            Err(error) => Err(keyring_failure("remove", account_id, error)),
        }
    }

    #[cfg(test)]
    fn delete_control_plane_session(&self, account_id: &str) -> Result<(), Error> {
        test_control_plane_sessions()
            .lock()
            .map_err(|_| Error::Internal {
                message: "failed to lock the test control-plane session store".to_string(),
            })?
            .remove(account_id);

        Ok(())
    }

    #[cfg(not(test))]
    fn control_plane_keyring_entry(&self, account_id: &str) -> Result<KeyringEntry, Error> {
        KeyringEntry::new(CONTROL_PLANE_KEYRING_SERVICE, account_id)
            .map_err(|error| keyring_failure("create", account_id, error))
    }
}

#[cfg(not(test))]
fn keyring_failure(action: &str, account_id: &str, error: KeyringError) -> Error {
    Error::Credential {
        message: format!("failed to {action} the control-plane session for {account_id}: {error}"),
    }
}

#[cfg(test)]
fn test_control_plane_sessions() -> &'static Mutex<HashMap<String, StoredControlPlaneSession>> {
    use std::sync::OnceLock;

    static STORE: OnceLock<Mutex<HashMap<String, StoredControlPlaneSession>>> = OnceLock::new();

    STORE.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Take a sign-in that has just happened to the control plane, and hold what it issues.
///
/// **A failure here does not fail the sign-in, and that is a decision rather than a hedge.**
/// Signing in with Google is its own act and a local workspace is the whole population that has
/// one today; refusing the identity because a server this machine may never talk to was
/// unreachable would break the one mode that is finished. What a failure costs is that no
/// session is held — which is exactly the state a hosted workspace reads as *sign in again*, so
/// nothing is hidden by carrying on.
///
/// Does nothing at all where this build was told no control plane, which is every build today.
pub(super) async fn establish_session(
    app_state: &AppState,
    account_id: &str,
    google_access_token: &str,
) {
    let Some(base_url) = control_plane_url() else {
        return;
    };

    match sign_in(&base_url, google_access_token).await {
        Ok(issued) => {
            let mut remote_sync = app_state.remote_sync.write().await;

            match remote_sync.record_control_plane_session(account_id, &issued) {
                Ok(window) => diagnostics::info("sync.session.established")
                    .with("account", account_id)
                    .with("expiresAt", window.expires_at.to_string())
                    .write(),
                Err(error) => diagnostics::error("sync.session.notRecorded")
                    .with("error", error.to_string())
                    .write(),
            }
        }
        Err(error) => diagnostics::error("sync.session.notEstablished")
            .with("error", error.to_string())
            .write(),
    }
}

/// Renew the session, which is what *reaching the API inside the window* means in practice.
///
/// **Being unable to reach the control plane leaves the window exactly where it was**, and that
/// is the offline case rather than a failure: the client goes on replicating on the window it
/// already holds until that window closes on its own. **A refusal is the opposite** — the
/// control plane has declined to renew, so the session is given up here and the workspace reads
/// as needing a sign-in from the next state read onward.
///
/// Answers whether the window moved, so a caller can tell *renewed* from *carried on*.
pub(super) async fn renew_session(app_state: &AppState) -> Result<bool, Error> {
    let Some(base_url) = control_plane_url() else {
        return Ok(false);
    };

    let held = {
        let remote_sync = app_state.remote_sync.read().await;
        let Some(window) = remote_sync.session_window() else {
            return Ok(false);
        };

        remote_sync.load_control_plane_session(&window.account_id)?
    };

    let Some(held) = held else {
        // A window with no credential behind it cannot be renewed and must not be believed: the
        // credential store was cleared under it, or the machine was signed out elsewhere.
        let mut remote_sync = app_state.remote_sync.write().await;
        remote_sync.forget_control_plane_session()?;

        return Ok(false);
    };

    match refresh(&base_url, &held.token).await {
        Ok(issued) => {
            let mut remote_sync = app_state.remote_sync.write().await;
            let window = remote_sync.record_control_plane_session(&held.account_id, &issued)?;

            diagnostics::info("sync.session.renewed")
                .with("account", held.account_id.as_str())
                .with("expiresAt", window.expires_at.to_string())
                .write();

            Ok(true)
        }
        Err(Error::Network { message }) => {
            diagnostics::info("sync.session.notRenewed")
                .with("reason", message)
                .write();

            Ok(false)
        }
        Err(error) => {
            let mut remote_sync = app_state.remote_sync.write().await;
            remote_sync.forget_control_plane_session()?;

            diagnostics::warn("sync.session.declined")
                .with("account", held.account_id.as_str())
                .with("error", error.to_string())
                .write();

            Ok(false)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sync::google::test::server::{ScriptedResponse, ScriptedServer};

    const A_DAY: i64 = 24 * 60 * 60 * 1000;
    const AT: i64 = 1_787_054_400_000;

    fn signed_in_body(expires_at: i64) -> String {
        signed_in_body_signed_at(expires_at, AT)
    }

    /// The same answer, with the sign-in it is running under said separately.
    ///
    /// The absolute lifetime runs from when the person signed in and no refresh moves it, so a
    /// refresh's answer carries a moment that has nothing to do with the window it just restarted
    /// — which is exactly the case a fixture that derived one from the other could not express.
    fn signed_in_body_signed_at(expires_at: i64, signed_in_at: i64) -> String {
        let absolute_expires_at = signed_in_at + 30 * A_DAY;

        format!(
            r#"{{"account":{{"id":"account-1"}},"session":{{"token":"rws_a-token","expiresAt":{expires_at},"absoluteExpiresAt":{absolute_expires_at}}}}}"#
        )
    }

    /// The whole of what a client presents and what it gets back, on the wire rather than
    /// through a mock: a Google access token as a bearer credential, and a session with the
    /// moment the window ends.
    #[tokio::test]
    async fn signing_in_presents_the_google_token_and_comes_back_with_a_window() {
        let server = ScriptedServer::start(vec![ScriptedResponse::new(
            200,
            signed_in_body(AT + 3 * A_DAY),
        )])
        .await;

        let issued = super::sign_in(&server.url(""), "ya29.a-google-token")
            .await
            .expect("signing in failed");

        assert_eq!(issued.token, "rws_a-token");
        assert_eq!(issued.expires_at, AT + 3 * A_DAY);
        assert_eq!(issued.replica_expires_at, None);
        assert_eq!(issued.absolute_expires_at, AT + 30 * A_DAY);

        let request = server.request(0);
        assert_eq!(request.method, "POST");
        assert_eq!(request.target, "/account/sign-in");
        assert_eq!(
            request.header("authorization"),
            Some("Bearer ya29.a-google-token")
        );
    }

    /// Renewing presents the session, not Google — which is the whole point of holding one.
    #[tokio::test]
    async fn renewing_presents_the_session_and_restarts_the_window() {
        let server = ScriptedServer::start(vec![ScriptedResponse::new(
            200,
            signed_in_body(AT + 5 * A_DAY),
        )])
        .await;

        let issued = super::refresh(&server.url(""), "rws_a-token")
            .await
            .expect("renewing failed");

        assert_eq!(issued.expires_at, AT + 5 * A_DAY);

        let request = server.request(0);
        assert_eq!(request.target, "/session/refresh");
        assert_eq!(request.header("authorization"), Some("Bearer rws_a-token"));
    }

    /// The mint answers with both windows, and the client has to read both — reading only the
    /// session's is how it comes to believe it may replicate on a credential that has died.
    #[tokio::test]
    async fn an_answer_carrying_both_windows_yields_both() {
        let body = format!(
            r#"{{"token":"turso","url":"libsql://x","expiresAt":{},"session":{{"token":"rws_a-token","expiresAt":{},"absoluteExpiresAt":{}}}}}"#,
            AT + 3 * A_DAY,
            AT + 3 * A_DAY,
            AT + 30 * A_DAY
        );
        let server = ScriptedServer::start(vec![ScriptedResponse::new(200, body)]).await;

        let issued = super::call(&server.url(""), "/workspace/w/token", "rws_a-token")
            .await
            .expect("the mint failed");

        assert_eq!(issued.expires_at, AT + 3 * A_DAY);
        assert_eq!(issued.replica_expires_at, Some(AT + 3 * A_DAY));
        assert_eq!(issued.absolute_expires_at, AT + 30 * A_DAY);
    }

    /// A refresh restarts the window and leaves the sign-in where it is, which is the whole of
    /// requirement 15's second window seen from this side. It is asserted on the wire because
    /// nothing else here would notice a control plane that started sliding the month.
    #[tokio::test]
    async fn a_refresh_restarts_the_window_and_leaves_the_sign_in_where_it_is() {
        let server = ScriptedServer::start(vec![ScriptedResponse::new(
            200,
            signed_in_body_signed_at(AT + 29 * A_DAY, AT),
        )])
        .await;

        let issued = super::refresh(&server.url(""), "rws_a-token")
            .await
            .expect("renewing failed");

        assert_eq!(issued.expires_at, AT + 29 * A_DAY);
        assert_eq!(
            issued.absolute_expires_at,
            AT + 30 * A_DAY,
            "a refresh carried the sign-in past the month it was issued under"
        );
    }

    /// The two refusals are separate errors on the wire, and the difference is what the person is
    /// asked to do: wait for a network, or go back to Google. Both land as `Forbidden` — a retry
    /// helps neither — and the wording is what carries the distinction to the surface.
    #[tokio::test]
    async fn a_sign_in_past_its_lifetime_is_refused_in_its_own_words() {
        let server = ScriptedServer::start(vec![ScriptedResponse::new(
            401,
            r#"{"error":{"code":"session_lifetime_reached","message":"this sign-in is a month old"}}"#,
        )])
        .await;

        let error = super::refresh(&server.url(""), "rws_aged")
            .await
            .expect_err("a sign-in past its lifetime was accepted");

        let Error::Forbidden { message } = &error else {
            panic!("a sign-in past its lifetime came back as {error:?}, which a retry would chase");
        };

        assert!(
            message.contains("reached its lifetime"),
            "the refusal reads as a closed refresh window: {message}"
        );
    }

    /// A window that closed is not a network failure, and the difference is the user's next
    /// move: one is *sign in again*, the other is *wait*.
    #[tokio::test]
    async fn a_closed_window_is_a_refusal_rather_than_a_moment_that_will_pass() {
        let server = ScriptedServer::start(vec![ScriptedResponse::new(
            401,
            r#"{"error":{"code":"session_expired","message":"your sign-in has run out"}}"#,
        )])
        .await;

        let error = super::refresh(&server.url(""), "rws_stale")
            .await
            .expect_err("an expired session was accepted");

        assert!(
            matches!(error, Error::Forbidden { .. }),
            "an expired session came back as {error:?}, which a retry would chase"
        );
    }

    /// The other half: a control plane having a bad minute *is* worth trying again, and must not
    /// read as a sign-in that has to be repeated.
    #[tokio::test]
    async fn a_control_plane_having_a_bad_minute_is_a_moment_that_will_pass() {
        let server = ScriptedServer::start(vec![ScriptedResponse::new(
            503,
            r#"{"error":{"code":"unavailable","message":"try again"}}"#,
        )])
        .await;

        let error = super::refresh(&server.url(""), "rws_a-token")
            .await
            .expect_err("a 503 was accepted as a session");

        assert!(matches!(error, Error::Network { .. }), "got {error:?}");
    }

    /// Never reaching the control plane at all is the ordinary offline case, and it must not
    /// read as a refusal — a client that treated it as one would sign the user out for being on
    /// a train.
    #[tokio::test]
    async fn an_unreachable_control_plane_is_a_network_failure_and_not_a_refusal() {
        let server = ScriptedServer::start(vec![ScriptedResponse::hangup()]).await;

        let error = super::refresh(&server.url(""), "rws_a-token")
            .await
            .expect_err("a dropped connection produced a session");

        assert!(matches!(error, Error::Network { .. }), "got {error:?}");
    }

    /// An answer this application cannot read is its own failure and not a closed window.
    #[tokio::test]
    async fn an_answer_with_no_session_is_a_failure_rather_than_an_empty_window() {
        let server =
            ScriptedServer::start(vec![ScriptedResponse::new(200, r#"{"account":{}}"#)]).await;

        let error = super::sign_in(&server.url(""), "ya29.token")
            .await
            .expect_err("an answer with no session was accepted");

        assert!(matches!(error, Error::Integrity { .. }), "got {error:?}");
    }

    /// **Requirement 15 is three days, not three days of one sitting.** A window held in memory
    /// would start again at every launch, so a client that signed in on Monday and reopened the
    /// application on Tuesday with no network would be asked to sign in — while the control
    /// plane would still have renewed it for another day. This is the test that would have
    /// caught that, and it reads the window back through a second `RemoteSync` over the same
    /// file, which is what a restart is.
    #[test]
    fn the_window_survives_the_application_being_closed_and_reopened() {
        use std::sync::Arc;
        use tokio::{runtime::Runtime, sync::RwLock};

        use crate::{persisted::Persisted, settings::Settings};

        Runtime::new()
            .expect("failed to create tokio runtime")
            .block_on(async {
                let root =
                    std::env::temp_dir().join(format!("remote-sync-window-{}", timestamp::now()));
                std::fs::create_dir_all(&root).expect("failed to create test root");

                let settings_path = root.join(Settings::FILENAME);
                let mut settings =
                    Persisted::<Settings>::load(settings_path).expect("failed to load settings");
                settings.database_path = root.join("app.db");
                settings.commit().expect("failed to commit settings");
                let settings = Arc::new(RwLock::new(settings));

                let issued = IssuedSession {
                    token: "rws_a-token".to_string(),
                    expires_at: AT + 3 * A_DAY,
                    replica_expires_at: Some(AT + 3 * A_DAY),
                    absolute_expires_at: AT + 30 * A_DAY,
                };

                {
                    let mut remote_sync =
                        RemoteSync::new(Arc::clone(&settings), root.join(RemoteSync::FILENAME))
                            .await
                            .expect("failed to initialize remote sync");

                    remote_sync
                        .record_control_plane_session("account-1", &issued)
                        .expect("failed to record the session");
                }

                // a second process over the same file, which is what reopening the application is.
                let mut reopened = RemoteSync::new(settings, root.join(RemoteSync::FILENAME))
                    .await
                    .expect("failed to reopen remote sync");

                let state = reopened
                    .get_state()
                    .await
                    .expect("failed to read the state");
                let window = state
                    .session
                    .expect("the window did not survive the restart");

                assert_eq!(window.account_id, "account-1");
                assert_eq!(window.expires_at, AT + 3 * A_DAY);
                assert_eq!(window.replica_expires_at, Some(AT + 3 * A_DAY));

                let _ = std::fs::remove_dir_all(&root);
            });
    }

    /// **A refresh moves the session and mints nothing**, so an answer carrying no replica
    /// window must leave the one already held alone. Forgetting it would make the client
    /// believe it may replicate until the session ends — which is the drift the two fields
    /// exist to prevent, arriving through the back door.
    #[test]
    fn renewing_keeps_a_replica_window_the_answer_did_not_carry() {
        use std::sync::Arc;
        use tokio::{runtime::Runtime, sync::RwLock};

        use crate::{persisted::Persisted, settings::Settings};

        Runtime::new()
            .expect("failed to create tokio runtime")
            .block_on(async {
                let root =
                    std::env::temp_dir().join(format!("remote-sync-replica-{}", timestamp::now()));
                std::fs::create_dir_all(&root).expect("failed to create test root");

                let settings_path = root.join(Settings::FILENAME);
                let mut settings =
                    Persisted::<Settings>::load(settings_path).expect("failed to load settings");
                settings.database_path = root.join("app.db");
                settings.commit().expect("failed to commit settings");

                let mut remote_sync = RemoteSync::new(
                    Arc::new(RwLock::new(settings)),
                    root.join(RemoteSync::FILENAME),
                )
                .await
                .expect("failed to initialize remote sync");

                remote_sync
                    .record_control_plane_session(
                        "account-1",
                        &IssuedSession {
                            token: "rws_a-token".to_string(),
                            expires_at: AT + 3 * A_DAY,
                            replica_expires_at: Some(AT + 3 * A_DAY),
                            absolute_expires_at: AT + 30 * A_DAY,
                        },
                    )
                    .expect("failed to record the mint");

                let window = remote_sync
                    .record_control_plane_session(
                        "account-1",
                        &IssuedSession {
                            token: "rws_a-token".to_string(),
                            expires_at: AT + 5 * A_DAY,
                            replica_expires_at: None,
                            absolute_expires_at: AT + 30 * A_DAY,
                        },
                    )
                    .expect("failed to record the refresh");

                assert_eq!(
                    window.expires_at,
                    AT + 5 * A_DAY,
                    "the session did not move"
                );
                assert_eq!(
                    window.replica_expires_at,
                    Some(AT + 3 * A_DAY),
                    "a refresh silently extended the credential the replica actually syncs with"
                );

                let _ = std::fs::remove_dir_all(&root);
            });
    }

    /// Absent configuration is the state of every machine today, and it is not a failure.
    #[test]
    fn a_build_that_was_told_no_control_plane_reports_none() {
        // SAFETY: single-threaded test, and the variable is read nowhere else in it.
        unsafe { std::env::remove_var("RENTABLE_CONTROL_PLANE_URL") };
        assert_eq!(control_plane_url(), None);

        unsafe { std::env::set_var("RENTABLE_CONTROL_PLANE_URL", "https://example.test/") };
        assert_eq!(
            control_plane_url().as_deref(),
            Some("https://example.test"),
            "the trailing slash would have doubled in every path"
        );

        unsafe { std::env::remove_var("RENTABLE_CONTROL_PLANE_URL") };
    }
}
