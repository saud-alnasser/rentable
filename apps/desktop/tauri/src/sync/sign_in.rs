//! signing in with Google.
//!
//! **This was `link.rs`, and what it lost was the linking.** Signing in and linking a Drive
//! folder ran as a single call until 2026-08-18, when #543 separated them so that identity
//! could be reached without a folder; Drive sync then retired (decision 07), and the half that
//! was left is the half that was never Drive's. The file is named for what it does now.
//!
//! The flow still runs to completion in one call. Authorization happens in a browser this
//! application does not control, so the call is outstanding for as long as the user takes —
//! which is why it reports how far it has got as it goes, and why abandoning it is a second
//! call rather than a returned value.

use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tauri_plugin_opener::OpenerExt;

use crate::{diagnostics, error::Error, state::AppState};

use super::control;
use super::google::profile::{google_userinfo_endpoint, read_google_profile};
use super::session::{
    GoogleSignInCompleteInput, GoogleSignInSessionLookupInput, GoogleSignInSessionResult,
    GoogleSignInSessionStatus, GoogleSignOutInput,
};
use super::store::RemoteSyncState;

/// the event a sign-in reports its progress on. One call cannot return twice,
/// and the interface has something different to say before and after the user
/// has answered the consent screen.
pub const GOOGLE_SIGN_IN_PHASE_EVENT: &str = "rentable:google-sign-in-phase";

/// how far a sign-in has got.
#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum GoogleSignInPhase {
    /// the authorization page is open and the user has not answered it yet.
    Authorizing,
    /// the user has answered, and the account is being read and recorded.
    Finalizing,
}

/// an identity this machine holds, and a token that proves it.
struct GoogleIdentity {
    account_id: String,
    access_token: String,
}

/// Google's own code for a consent screen the user declined. It arrives as a
/// failure and means the user said no, which is not the same thing.
const OAUTH_ACCESS_DENIED: &str = "access_denied";

/// how long an authorization may stay outstanding. Long enough for a user to
/// find the browser window, sign in, and read the consent screen.
const AUTHORIZATION_TIMEOUT: Duration = Duration::from_secs(5 * 60);

/// how often the callback's outcome is looked for. The callback lands on a
/// thread of its own, so this only bounds how quickly the flow notices.
const AUTHORIZATION_POLL_INTERVAL: Duration = Duration::from_millis(750);

/// sign in with Google.
///
/// An identity is something this application holds on its own, which requirement 3 needs it to
/// be: a workspace has an owner, and signing in is how this machine learns who that is.
///
/// Fails with [`Error::Cancelled`] where the user declined the consent screen or abandoned the
/// attempt. Nothing went wrong in that case and nothing is worth showing.
pub async fn sign_in_with_google(
    app: &AppHandle,
    app_state: &AppState,
) -> Result<RemoteSyncState, Error> {
    let session_id = authorize_with_google(app, app_state).await?;

    let identity = match finish_sign_in(app_state, &session_id).await {
        Ok(identity) => identity,
        Err(error) => {
            abandon_session(app_state, &session_id).await;

            diagnostics::error("sync.signIn.failed")
                .with("error", error.to_string())
                .write();

            return Err(error);
        }
    };

    {
        let mut remote_sync = app_state.remote_sync.write().await;

        // a session left in the map after it succeeded would still be cancellable, so it is
        // dropped rather than kept — `forget_google_sign_in_session` is where that is argued.
        remote_sync.forget_google_sign_in_session(lookup(&session_id))?;
    }

    diagnostics::info("sync.signIn.completed")
        .with("account", identity.account_id.as_str())
        .write();

    // and the second half of what signing in is worth (#550): a session, so that *signed in
    // three days ago* is a lifetime this machine was issued rather than a flag it sets about
    // itself. Best effort — `establish_session` argues why a failure here is not a failed
    // sign-in.
    control::establish_session(app_state, &identity.account_id, &identity.access_token).await;

    // **Opening the workspace is not done here, and that is deliberate rather than missing.** The
    // sign-in screen calls `continueStartup` when this returns, which calls `bootstrap`, which is
    // where the database is opened — so the replica arrives in this session without a second mint.
    // An earlier draft called it here too and paid two control-plane round trips and two engine
    // swaps for one sign-in.

    let mut remote_sync = app_state.remote_sync.write().await;
    remote_sync.get_state().await
}

/// give up the identity this machine holds.
///
/// The account row stays and its credentials go, which is the difference between signing out
/// and never having signed in: the person is still who the workspace belongs to, and this
/// machine has stopped being able to prove it. Signing out of a machine that holds no identity
/// is a refusal rather than a silent success: nothing happened, and reporting that something
/// did is worse than saying so.
pub async fn sign_out_of_google(app_state: &AppState) -> Result<RemoteSyncState, Error> {
    let account_id = {
        let remote_sync = app_state.remote_sync.read().await;
        remote_sync
            .signed_in_google_account()?
            .map(|account| account.id)
    };

    let Some(account_id) = account_id else {
        return Err(Error::PreconditionFailed {
            message: "this machine is not signed in to google".to_string(),
        });
    };

    let state = {
        let mut remote_sync = app_state.remote_sync.write().await;
        remote_sync
            .sign_out_of_google(GoogleSignOutInput {
                account_id: account_id.clone(),
            })
            .await?
    };

    diagnostics::info("sync.signOut.completed")
        .with("account", account_id.as_str())
        .with("workspace", state.workspace.id.as_str())
        .write();

    Ok(state)
}

/// what a sign-in session's state means to the flow waiting on it.
#[derive(Debug, PartialEq, Eq)]
enum Authorization {
    /// the consent screen has not been answered yet.
    Waiting,
    /// it was answered, and there is a code to redeem.
    Granted,
    /// it will not be answered, and nothing further is worth waiting for.
    Refused(Error),
}

/// wait for the consent screen to be answered, however it is answered.
async fn await_authorization(app_state: &AppState, session_id: &str) -> Result<(), Error> {
    let deadline = Instant::now() + AUTHORIZATION_TIMEOUT;

    loop {
        let result = {
            let remote_sync = app_state.remote_sync.read().await;
            remote_sync.get_google_sign_in_result(lookup(session_id))?
        };

        match read_authorization(&result) {
            Authorization::Granted => return Ok(()),
            Authorization::Refused(error) => return Err(error),
            Authorization::Waiting => {}
        }

        if Instant::now() >= deadline {
            return Err(Error::TimedOut {
                message: "google authorization was not completed in time".to_string(),
            });
        }

        tokio::time::sleep(AUTHORIZATION_POLL_INTERVAL).await;
    }
}

/// read a settled session as an answer. Separate from the waiting because
/// deciding what an answer means is the part worth exercising, and polling is
/// not.
fn read_authorization(result: &GoogleSignInSessionResult) -> Authorization {
    match result.status {
        GoogleSignInSessionStatus::Pending => Authorization::Waiting,
        GoogleSignInSessionStatus::Completed => Authorization::Granted,
        GoogleSignInSessionStatus::Cancelled => Authorization::Refused(sign_in_cancelled()),
        GoogleSignInSessionStatus::Error => {
            Authorization::Refused(match result.error.as_deref() {
                // the user answered the consent screen, and the answer was no.
                // Reporting that as a failure would put an error in front of
                // somebody who already knows what they did.
                Some(OAUTH_ACCESS_DENIED) => sign_in_cancelled(),
                Some(error) => Error::PreconditionFailed {
                    message: format!("google authorization failed: {error}"),
                },
                None => Error::PreconditionFailed {
                    message: "google authorization did not complete".to_string(),
                },
            })
        }
    }
}

/// open the consent screen and wait for it to be answered.
///
/// Answers with the session the answer landed on. Everything the redemption
/// needs is held against that session inside this process, so the session id is
/// the whole of what a caller carries.
async fn authorize_with_google(app: &AppHandle, app_state: &AppState) -> Result<String, Error> {
    let session = {
        let mut remote_sync = app_state.remote_sync.write().await;
        remote_sync.begin_google_sign_in().inspect_err(|error| {
            diagnostics::error("sync.signIn.startFailed")
                .with("error", error.to_string())
                .write()
        })?
    };

    diagnostics::info("sync.signIn.started")
        .with("session", session.session_id.as_str())
        .write();

    if let Err(error) = app
        .opener()
        .open_url(session.authorization_url.clone(), None::<&str>)
    {
        abandon_session(app_state, &session.session_id).await;

        return Err(Error::Internal {
            message: format!("could not open the google authorization page: {error}"),
        });
    }

    emit_phase(app, GoogleSignInPhase::Authorizing);

    if let Err(error) = await_authorization(app_state, &session.session_id).await {
        abandon_session(app_state, &session.session_id).await;

        return Err(error);
    }

    emit_phase(app, GoogleSignInPhase::Finalizing);

    Ok(session.session_id)
}

/// redeem the authorization and record the person it belongs to.
///
/// **The profile is read from OpenID Connect's `userinfo` rather than from Drive.** It went
/// through Drive's `about` endpoint until this ticket, because the scopes were there and the
/// transport was built — a dependency on Drive that identity should not have had, and the one
/// thing #543's split left behind. [`super::google::profile`] is where it went.
async fn finish_sign_in(app_state: &AppState, session_id: &str) -> Result<GoogleIdentity, Error> {
    if was_abandoned(app_state, session_id).await {
        return Err(sign_in_cancelled());
    }

    let access_token = {
        let mut remote_sync = app_state.remote_sync.write().await;
        remote_sync
            .exchange_google_sign_in_code(lookup(session_id))
            .await?
            .access_token
    };

    let profile = read_google_profile(google_userinfo_endpoint(), &access_token).await?;
    let email = profile.email.clone().unwrap_or_default();

    // the profile read is the last thing that takes time, and the user can
    // abandon the attempt across it. Asking again here is what turns that into a
    // cancellation rather than an account nobody asked for; a cancellation
    // landing after this point still cannot record one, because cancelling
    // drops the tokens the completion needs.
    if was_abandoned(app_state, session_id).await {
        return Err(sign_in_cancelled());
    }

    let mut remote_sync = app_state.remote_sync.write().await;
    let signed_in = remote_sync
        .complete_google_sign_in(GoogleSignInCompleteInput {
            session_id: session_id.to_string(),
            display_name: profile.display_name.clone().unwrap_or_else(|| email.clone()),
            email,
            avatar_url: profile.avatar_url.clone(),
            provider_user_id: Some(profile.subject.clone()),
        })
        .await?;

    Ok(GoogleIdentity {
        account_id: signed_in.account_id,
        access_token,
    })
}

/// settle a session nobody is going to finish. Its own failure is never the one
/// worth reporting — something else already went wrong, or the user asked.
async fn abandon_session(app_state: &AppState, session_id: &str) {
    let mut remote_sync = app_state.remote_sync.write().await;
    let _ = remote_sync.cancel_google_sign_in(lookup(session_id));
}

/// whether the user has abandoned this attempt since it was last looked at.
///
/// A session that can no longer be read is treated as abandoned: there is
/// nothing left to finish it against either way.
async fn was_abandoned(app_state: &AppState, session_id: &str) -> bool {
    let remote_sync = app_state.remote_sync.read().await;

    remote_sync
        .get_google_sign_in_result(lookup(session_id))
        .map(|result| result.status == GoogleSignInSessionStatus::Cancelled)
        .unwrap_or(true)
}

fn lookup(session_id: &str) -> GoogleSignInSessionLookupInput {
    GoogleSignInSessionLookupInput {
        session_id: session_id.to_string(),
    }
}

fn sign_in_cancelled() -> Error {
    Error::Cancelled {
        message: "signing in with google was cancelled".to_string(),
    }
}

/// tell the interface how far the sign-in has got. A phase that does not arrive
/// costs a label, so it is never worth failing the sign-in over.
fn emit_phase(app: &AppHandle, phase: GoogleSignInPhase) {
    let _ = app.emit(GOOGLE_SIGN_IN_PHASE_EVENT, phase);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn settled(status: GoogleSignInSessionStatus, error: Option<&str>) -> Authorization {
        read_authorization(&GoogleSignInSessionResult {
            session_id: "session-1".to_string(),
            status,
            error: error.map(str::to_string),
        })
    }

    #[test]
    fn a_consent_screen_still_open_is_waited_on() {
        assert_eq!(
            settled(GoogleSignInSessionStatus::Pending, None),
            Authorization::Waiting
        );
    }

    #[test]
    fn a_consent_screen_answered_yes_is_granted() {
        assert_eq!(
            settled(GoogleSignInSessionStatus::Completed, None),
            Authorization::Granted
        );
    }

    /// the two ways a user says no. Google reports a declined consent screen as
    /// a failure, and reporting it onward as one would put an error in front of
    /// somebody who already knows what they did.
    #[test]
    fn both_ways_of_saying_no_read_as_a_cancellation() {
        for outcome in [
            settled(GoogleSignInSessionStatus::Cancelled, None),
            settled(GoogleSignInSessionStatus::Error, Some(OAUTH_ACCESS_DENIED)),
        ] {
            assert!(
                matches!(outcome, Authorization::Refused(Error::Cancelled { .. })),
                "a refusal by the user was not read as a cancellation: {outcome:?}"
            );
        }
    }

    #[test]
    fn a_provider_failure_keeps_its_own_wording() {
        let Authorization::Refused(error) =
            settled(GoogleSignInSessionStatus::Error, Some("invalid_scope"))
        else {
            panic!("a failed authorization was not refused");
        };

        assert!(matches!(error, Error::PreconditionFailed { .. }));
        assert!(
            error.to_string().contains("invalid_scope"),
            "the provider's own reason was dropped: {error}"
        );
    }

    #[test]
    fn a_failure_with_no_reason_is_still_a_refusal() {
        assert!(matches!(
            settled(GoogleSignInSessionStatus::Error, None),
            Authorization::Refused(Error::PreconditionFailed { .. })
        ));
    }
}
