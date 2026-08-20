use std::{
    collections::HashMap,
    io::{Read, Write},
    net::TcpListener,
    sync::{Arc, Mutex},
    time::Duration,
};

use serde::{Deserialize, Serialize};

use crate::{error::Error, timestamp};

use super::google::auth::{
    GoogleOAuthTokens, access_token_is_fresh, authorization_code_form, build_authorization_url,
    google_oauth_client_id, parse_http_request_path, parse_query_map, pkce_challenge,
    random_url_safe_token, refresh_token_form, request_google_tokens,
};
use super::store::{
    RemoteSync, RemoteSyncAccount, RemoteSyncAccountStatus, RemoteSyncState,
    sanitize_optional_string, sanitize_string, slugify,
};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum GoogleSignInSessionStatus {
    #[default]
    Pending,
    Completed,
    Error,
    Cancelled,
}

/// A started sign-in. The caller opens `authorization_url` and polls
/// `session_id`; the `state` and PKCE verifier behind that URL stay in this
/// process, so there is nothing else for the caller to carry.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleSignInSessionStart {
    pub session_id: String,
    pub authorization_url: String,
}

/// How far a sign-in has got. The authorization code is deliberately
/// absent: it is redeemed here, and a caller that cannot see it cannot redeem
/// it anywhere else.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleSignInSessionResult {
    pub session_id: String,
    pub status: GoogleSignInSessionStatus,
    pub error: Option<String>,
}

/// An access token, handed to the caller that has to present one.
///
/// Nothing on *this* path hands over a refresh token or the client secret. That is not yet true
/// of the surface as a whole — `google_account_auth` and `google_oauth_config` still return
/// them — and closing that is #118.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleAccessToken {
    pub access_token: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleSignInSessionLookupInput {
    pub session_id: String,
}

/// what a redeemed authorization turned out to be about — a person, not a folder.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleSignInCompleteInput {
    pub session_id: String,
    pub email: String,
    pub display_name: String,
    pub avatar_url: Option<String>,
    /// the picture itself, already fetched. **Nothing here reaches the network for it**: this is
    /// a store operation, and the transport stays where the other Google requests are.
    pub avatar_image: Option<String>,
    /// the OpenID `sub` claim, read from Google's `userinfo` endpoint.
    pub provider_user_id: Option<String>,
}

/// who a completed sign-in turned out to be, and the state that now holds them.
///
/// The account id is returned rather than looked up afterwards because looking
/// it up means matching on an email, which is the same guess the completion
/// already made and would silently disagree with it the day two accounts share
/// one address.
pub struct GoogleSignIn {
    pub account_id: String,
    pub state: RemoteSyncState,
}

/// which identity is being given up.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleSignOutInput {
    pub account_id: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleAccountAuthInput {
    pub account_id: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleAccountAuth {
    pub account_id: String,
    pub access_token: String,
    pub refresh_token: String,
    pub token_expires_at: Option<i64>,
}

/// Why a sign-in did not produce an authorization code. Each is a distinct
/// thing to tell the user, and the provider's own code is kept verbatim because
/// the caller branches on `access_denied` to separate a declined consent screen
/// from a real failure.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(super) enum GoogleSignInFailure {
    Provider(String),
    StateMismatch,
    MissingAuthorizationCode,
}

impl GoogleSignInFailure {
    fn message(&self) -> String {
        match self {
            Self::Provider(error) => error.clone(),
            Self::StateMismatch => {
                "oauth callback state did not match the active session".to_string()
            }
            Self::MissingAuthorizationCode => {
                "oauth callback did not include an authorization code".to_string()
            }
        }
    }

    /// What the browser tab shows before the user closes it.
    fn callback_page_message(&self) -> String {
        match self {
            Self::Provider(error) => {
                format!("Signing in to Google failed: {error}. You can close this window.")
            }
            Self::StateMismatch => "Signing in to Google failed because the callback state did not match the app session. You can close this window.".to_string(),
            Self::MissingAuthorizationCode => "Signing in to Google failed because the callback did not include an authorization code. You can close this window.".to_string(),
        }
    }
}

/// What an OAuth callback turned out to carry. Cancellation is not among these:
/// it arrives from the user rather than from the callback, and is applied by
/// [`GoogleSignInSession::cancel`].
///
/// The page a browser tab is left showing says the person signed in, and not that
/// a folder was linked: whether anything is being linked is a question this flow
/// no longer has an answer to, and one of its two callers never links anything.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(super) enum GoogleSignInOutcome {
    Authorized { authorization_code: String },
    Failed(GoogleSignInFailure),
}

impl GoogleSignInOutcome {
    /// What the browser tab shows before the user closes it.
    fn callback_page_message(&self) -> String {
        match self {
            Self::Authorized { .. } => {
                "Signed in to Google. You can close this window now.".to_string()
            }
            Self::Failed(failure) => failure.callback_page_message(),
        }
    }
}

/// One sign-in, from the authorization request to whichever outcome
/// settles it.
///
/// `expected_state` and `code_verifier` are generated here and never leave the
/// process: the state is what ties a callback back to this session, and the
/// verifier is what proves to Google that the code is being redeemed by whoever
/// requested it.
#[derive(Clone, Debug)]
pub(super) struct GoogleSignInSession {
    pub(super) session_id: String,
    pub(super) expected_state: String,
    pub(super) code_verifier: String,
    pub(super) redirect_uri: String,
    pub(super) status: GoogleSignInSessionStatus,
    pub(super) authorization_code: Option<String>,
    pub(super) error: Option<String>,
    /// What the code was redeemed for, held until the account it belongs to is
    /// known. The profile read that names that account needs an access token,
    /// so the redemption necessarily happens first.
    pub(super) tokens: Option<GoogleOAuthTokens>,
}

impl GoogleSignInSession {
    /// Read what an OAuth callback's query says, against the state this session
    /// issued. Pure: it decides nothing about the session's own status.
    pub(super) fn read_callback(&self, query: &HashMap<String, String>) -> GoogleSignInOutcome {
        if let Some(error) = query.get("error") {
            return GoogleSignInOutcome::Failed(GoogleSignInFailure::Provider(error.clone()));
        }

        if query.get("state").map(String::as_str) != Some(self.expected_state.as_str()) {
            return GoogleSignInOutcome::Failed(GoogleSignInFailure::StateMismatch);
        }

        let authorization_code = query
            .get("code")
            .map(|code| code.trim())
            .filter(|code| !code.is_empty());

        let Some(authorization_code) = authorization_code else {
            return GoogleSignInOutcome::Failed(GoogleSignInFailure::MissingAuthorizationCode);
        };

        GoogleSignInOutcome::Authorized {
            authorization_code: authorization_code.to_string(),
        }
    }

    /// Apply the outcome a callback carried, reporting whether it was the one
    /// that settled this session.
    ///
    /// A session leaves `Pending` exactly once by this route. The callback
    /// server and the user's own cancellation race by construction, so the
    /// first to arrive wins and a late callback cannot revive a session the
    /// user already abandoned.
    pub(super) fn settle(&mut self, outcome: GoogleSignInOutcome) -> bool {
        if self.status != GoogleSignInSessionStatus::Pending {
            return false;
        }

        match outcome {
            GoogleSignInOutcome::Authorized { authorization_code } => {
                self.status = GoogleSignInSessionStatus::Completed;
                self.authorization_code = Some(authorization_code);
                self.error = None;
            }
            GoogleSignInOutcome::Failed(failure) => {
                self.status = GoogleSignInSessionStatus::Error;
                self.authorization_code = None;
                self.error = Some(failure.message());
            }
        }

        true
    }

    /// Abandon this session, whatever state it had reached.
    ///
    /// Cancellation is a decision rather than a race, so unlike [`settle`] it
    /// is never refused: a session that already redeemed its code is holding
    /// tokens, and abandoning it has to drop them.
    ///
    /// [`settle`]: Self::settle
    pub(super) fn cancel(&mut self) {
        self.status = GoogleSignInSessionStatus::Cancelled;
        self.authorization_code = None;
        self.error = None;
        self.tokens = None;
    }

    /// Take the authorization code, leaving none behind.
    ///
    /// A code is redeemable once. Removing it as it is read means a repeated
    /// exchange fails here rather than at Google, which answers a replayed code
    /// by invalidating the tokens it already issued.
    pub(super) fn take_authorization_code(&mut self) -> Option<String> {
        self.authorization_code.take()
    }
}

/// what an account says about itself once its credentials are gone.
///
/// Read verbatim by the settings surface, which already renders an account's
/// `last_error` beside a *needs reconnect* badge — so this is written as the
/// sentence somebody reads there, and it names **both** ways out rather than
/// only the one that keeps syncing.
const SIGNED_OUT_MESSAGE: &str =
    "signed out of google. sign in again to keep this workspace syncing on this machine";

const GOOGLE_SIGN_IN_POLL_INTERVAL: Duration = Duration::from_millis(200);
const GOOGLE_SIGN_IN_TIMEOUT: Duration = Duration::from_secs(5 * 60);

impl RemoteSync {
    pub fn begin_google_sign_in(&mut self) -> Result<GoogleSignInSessionStart, Error> {
        let Some(client_id) = google_oauth_client_id() else {
            return Err(Error::NotConfigured {
                message: "GOOGLE_OAUTH_CLIENT_ID is not configured".to_string(),
            });
        };

        let expected_state = random_url_safe_token()?;
        let code_verifier = random_url_safe_token()?;

        let listener = TcpListener::bind("127.0.0.1:0")?;
        let port = listener.local_addr()?.port();

        let session_id = format!("google-sign-in-{}", timestamp::now());
        let redirect_uri = format!("http://127.0.0.1:{port}/callback");
        let authorization_url = build_authorization_url(
            &self.google_oauth_config(),
            &client_id,
            &redirect_uri,
            &expected_state,
            &pkce_challenge(&code_verifier),
        )?;

        {
            let mut sessions = self
                .auth_sessions
                .lock()
                .map_err(|_| oauth_sessions_poisoned())?;

            sessions.insert(
                session_id.clone(),
                GoogleSignInSession {
                    session_id: session_id.clone(),
                    expected_state,
                    code_verifier,
                    redirect_uri,
                    status: GoogleSignInSessionStatus::Pending,
                    authorization_code: None,
                    error: None,
                    tokens: None,
                },
            );
        }

        let sessions = self.auth_sessions.clone();
        let session_id_for_thread = session_id.clone();

        std::thread::spawn(move || {
            let Err(error) =
                handle_google_sign_in_callback(listener, sessions.clone(), &session_id_for_thread)
            else {
                return;
            };

            if let Ok(mut sessions) = sessions.lock()
                && let Some(session) = sessions.get_mut(&session_id_for_thread)
            {
                session.settle(GoogleSignInOutcome::Failed(GoogleSignInFailure::Provider(
                    error.to_string(),
                )));
            }
        });

        Ok(GoogleSignInSessionStart {
            session_id,
            authorization_url,
        })
    }

    pub fn get_google_sign_in_result(
        &self,
        input: GoogleSignInSessionLookupInput,
    ) -> Result<GoogleSignInSessionResult, Error> {
        let session_id = sanitize_string(&input.session_id);

        let sessions = self
            .auth_sessions
            .lock()
            .map_err(|_| oauth_sessions_poisoned())?;

        let session = sessions
            .get(&session_id)
            .ok_or_else(oauth_session_not_found)?;

        Ok(GoogleSignInSessionResult {
            session_id: session.session_id.clone(),
            status: session.status.clone(),
            error: session.error.clone(),
        })
    }

    /// Abandon one sign-in.
    ///
    /// *It used to answer with the identity the attempt had established, so that a link
    /// abandoning itself could take that identity back. Nothing signs in on the way past
    /// anything now, so an identity a sign-in recorded is one somebody asked for.*
    pub fn cancel_google_sign_in(
        &mut self,
        input: GoogleSignInSessionLookupInput,
    ) -> Result<(), Error> {
        let session_id = sanitize_string(&input.session_id);

        if session_id.is_empty() {
            return Err(Error::InvalidInput {
                message: "oauth session id is required".to_string(),
            });
        }

        let mut sessions = self
            .auth_sessions
            .lock()
            .map_err(|_| oauth_sessions_poisoned())?;

        let Some(session) = sessions.get_mut(&session_id) else {
            return Ok(());
        };

        session.cancel();

        Ok(())
    }

    /// Drop a sign-in that finished on its own account.
    ///
    /// Only the standalone sign-in calls this, and the reason is the marker:
    /// a session left in the map after it succeeded would still be cancellable,
    /// so abandoning some *later* link would forget an identity that link never
    /// established. Dropping the session is how signing in deliberately stops
    /// being something a link can take back.
    pub fn forget_google_sign_in_session(
        &mut self,
        input: GoogleSignInSessionLookupInput,
    ) -> Result<(), Error> {
        let mut sessions = self
            .auth_sessions
            .lock()
            .map_err(|_| oauth_sessions_poisoned())?;

        sessions.remove(&sanitize_string(&input.session_id));

        Ok(())
    }

    /// Redeem the authorization code this session captured, and hold what it
    /// yields until the account is known.
    ///
    /// Returns only the access token, which the caller still needs for the profile read. The
    /// refresh token is kept on the session and reaches storage through
    /// [`complete_google_sign_in`].
    ///
    /// [`complete_google_sign_in`]: Self::complete_google_sign_in
    pub async fn exchange_google_sign_in_code(
        &mut self,
        input: GoogleSignInSessionLookupInput,
    ) -> Result<GoogleAccessToken, Error> {
        let session_id = sanitize_string(&input.session_id);

        let Some(client_id) = google_oauth_client_id() else {
            return Err(Error::NotConfigured {
                message: "GOOGLE_OAUTH_CLIENT_ID is not configured".to_string(),
            });
        };

        // the sessions map is a std mutex, so nothing may be awaited while it
        // is held. Everything the exchange needs is copied out first.
        let redemption = {
            let mut sessions = self
                .auth_sessions
                .lock()
                .map_err(|_| oauth_sessions_poisoned())?;
            let session = sessions
                .get_mut(&session_id)
                .ok_or_else(oauth_session_not_found)?;

            if session.status != GoogleSignInSessionStatus::Completed {
                return Err(Error::PreconditionFailed {
                    message: "oauth session has no authorization code to redeem".to_string(),
                });
            }

            let Some(authorization_code) = session.take_authorization_code() else {
                return Err(Error::PreconditionFailed {
                    message: "oauth session has no authorization code to redeem".to_string(),
                });
            };

            (
                authorization_code,
                session.code_verifier.clone(),
                session.redirect_uri.clone(),
            )
        };

        let (authorization_code, code_verifier, redirect_uri) = redemption;
        let config = self.google_oauth_config();
        let form = authorization_code_form(
            &client_id,
            config.client_secret.as_deref(),
            &redirect_uri,
            &code_verifier,
            &authorization_code,
        );
        let tokens = request_google_tokens(&config.token_endpoint, &form, timestamp::now()).await?;
        let access_token = tokens.access_token.clone();

        {
            let mut sessions = self
                .auth_sessions
                .lock()
                .map_err(|_| oauth_sessions_poisoned())?;
            let session = sessions
                .get_mut(&session_id)
                .ok_or_else(oauth_session_not_found)?;

            session.tokens = Some(tokens);
        }

        Ok(GoogleAccessToken { access_token })
    }

    /// Record the person an authorization turned out to belong to.
    ///
    /// **This touches no workspace.** Signing in establishes who somebody is; what that
    /// identity is then used for is a second act with its own call. The two ran as one until
    /// 2026-08-18 — signing in happened inside linking a Drive folder — which is why an account
    /// could not exist unless a workspace was linked to one.
    ///
    /// *It took a second argument until Drive sync retired: whether abandoning the attempt
    /// that called this should take the identity back with it. A link that had to sign in on
    /// the way past passed `true` and a person signing in on purpose passed `false`. Only one
    /// caller is left and it is the second, so the flag and the marker it set are gone.*
    pub async fn complete_google_sign_in(
        &mut self,
        input: GoogleSignInCompleteInput,
    ) -> Result<GoogleSignIn, Error> {
        let now = timestamp::now();
        let email = sanitize_string(&input.email).to_lowercase();
        let display_name = sanitize_string(&input.display_name);
        let resolved_display_name = if display_name.is_empty() {
            email.clone()
        } else {
            display_name.clone()
        };
        let provider_user_id = sanitize_optional_string(input.provider_user_id);
        let avatar_url = sanitize_optional_string(input.avatar_url);
        let avatar_image = sanitize_optional_string(input.avatar_image);

        if email.is_empty() {
            return Err(Error::InvalidInput {
                message: "google account email is required".to_string(),
            });
        }

        let tokens = {
            let sessions = self
                .auth_sessions
                .lock()
                .map_err(|_| oauth_sessions_poisoned())?;

            sessions
                .get(&sanitize_string(&input.session_id))
                .and_then(|session| session.tokens.clone())
                .ok_or_else(|| Error::PreconditionFailed {
                    message: "oauth session has not been redeemed".to_string(),
                })?
        };

        let access_token = sanitize_string(&tokens.access_token);
        let refresh_token = sanitize_optional_string(tokens.refresh_token);
        let token_expires_at = tokens.expires_at;

        if access_token.is_empty() {
            return Err(Error::InvalidInput {
                message: "google access token is required".to_string(),
            });
        }

        let account_index = self.store.accounts.iter().position(|account| {
            account.email.eq_ignore_ascii_case(&email)
                || provider_user_id
                    .as_ref()
                    .zip(account.provider_user_id.as_ref())
                    .map(|(left, right)| left == right)
                    .unwrap_or(false)
        });

        let account_id = if let Some(index) = account_index {
            let account = &mut self.store.accounts[index];
            account.status = RemoteSyncAccountStatus::Ready;
            account.email = email.clone();
            account.display_name = resolved_display_name.clone();
            account.avatar_url = avatar_url.clone();
            account.avatar_image = avatar_image.clone();
            account.provider_user_id = provider_user_id.clone();
            account.token_expires_at = token_expires_at;
            account.refresh_token_available = refresh_token
                .as_ref()
                .map(|token| !token.is_empty())
                .unwrap_or(account.refresh_token_available);
            account.last_error = None;
            account.updated_at = now;
            account.id.clone()
        } else {
            // **The prefix outlived Drive and is kept for the same reason the keyring service
            // name is** (`google/auth.rs`): it is a key on installed machines. The credentials
            // for this account are filed under this id, so renaming it would look in an entry
            // nobody has and sign the person out — silently, because a missing credential is
            // indistinguishable from one never granted.
            let account_id = format!("google-drive-{}", slugify(&email));
            self.store.accounts.push(RemoteSyncAccount {
                id: account_id.clone(),
                status: RemoteSyncAccountStatus::Ready,
                email: email.clone(),
                display_name: resolved_display_name.clone(),
                avatar_url: avatar_url.clone(),
                avatar_image: avatar_image.clone(),
                provider_user_id: provider_user_id.clone(),
                token_expires_at,
                refresh_token_available: refresh_token
                    .as_ref()
                    .map(|token| !token.is_empty())
                    .unwrap_or(false),
                last_error: None,
                created_at: now,
                updated_at: now,
            });
            account_id
        };

        let credentials = self.upsert_google_credentials(
            &account_id,
            Some(access_token),
            refresh_token,
            token_expires_at,
            now,
        )?;

        if let Some(account) = self
            .store
            .accounts
            .iter_mut()
            .find(|account| account.id == account_id)
        {
            account.refresh_token_available = !credentials.refresh_token.trim().is_empty();
        }

        self.sign_out_of_every_other_google_account(&account_id, now)?;

        self.store.commit()?;

        Ok(GoogleSignIn {
            account_id,
            state: self.get_state().await?,
        })
    }

    /// Give up every identity but this one.
    ///
    /// **At most one identity is held**, which is what makes
    /// [`signed_in_google_account`] answerable at all: it reads the credentials
    /// rather than a flag, so two accounts holding credentials at once would
    /// make *who this machine is signed in as* a question about iteration order.
    /// Signing in as somebody else is therefore signing out of whoever was
    /// there, and the account they leave behind says so in the same terms an
    /// explicit sign-out does.
    ///
    /// [`signed_in_google_account`]: Self::signed_in_google_account
    fn sign_out_of_every_other_google_account(
        &mut self,
        account_id: &str,
        now: i64,
    ) -> Result<(), Error> {
        let others = self
            .store
            .accounts
            .iter()
            .map(|account| account.id.clone())
            .filter(|id| id != account_id)
            .collect::<Vec<_>>();

        for other in others {
            self.delete_google_credentials(&other)?;

            if let Some(account) = self
                .store
                .accounts
                .iter_mut()
                .find(|account| account.id == other)
            {
                account.status = RemoteSyncAccountStatus::NeedsReconnect;
                account.refresh_token_available = false;
                account.token_expires_at = None;
                // the face goes with the credentials. The row stays so it can say what it is
                // waiting for, and a row that says that does not need a photograph of somebody
                // this machine is no longer signed in as.
                account.avatar_image = None;
                account.last_error = Some(SIGNED_OUT_MESSAGE.to_string());
                account.updated_at = now;
            }
        }

        Ok(())
    }

    /// The Google account this machine is signed in as, where it still holds a
    /// credential for one.
    ///
    /// The credential is the truth and the account row is not: a row survives
    /// signing out so that a workspace linked under it can say what it is
    /// waiting for, and answering `Some` for that row would send a link
    /// straight into a token that is gone.
    pub fn signed_in_google_account(&self) -> Result<Option<RemoteSyncAccount>, Error> {
        for account in self.store.accounts.iter() {
            let held = self
                .load_google_credentials(&account.id)?
                .map(|credentials| {
                    !credentials.access_token.trim().is_empty()
                        || !credentials.refresh_token.trim().is_empty()
                })
                .unwrap_or(false);

            if held {
                return Ok(Some(account.clone()));
            }
        }

        Ok(None)
    }

    /// Give up the identity, keeping the account row.
    ///
    /// The credentials go and the row stays, deliberately. A machine that has signed out is
    /// waiting on a person rather than broken, and the row is what lets it say so in terms the
    /// settings surface already renders: `NeedsReconnect`, with a message naming what to do.
    /// Removing the row instead would leave a machine that had never seen anybody, which is a
    /// different thing and is not what happened.
    pub async fn sign_out_of_google(
        &mut self,
        input: GoogleSignOutInput,
    ) -> Result<RemoteSyncState, Error> {
        let account_id = sanitize_string(&input.account_id);
        let now = timestamp::now();

        let account = self
            .store
            .accounts
            .iter_mut()
            .find(|account| account.id == account_id)
            .ok_or_else(|| Error::NotFound {
                message: "google account not found".to_string(),
            })?;

        account.status = RemoteSyncAccountStatus::NeedsReconnect;
        account.refresh_token_available = false;
        account.token_expires_at = None;
        // as above: the picture is the person's, not the row's.
        account.avatar_image = None;
        account.last_error = Some(SIGNED_OUT_MESSAGE.to_string());
        account.updated_at = now;

        self.delete_google_credentials(&account_id)?;
        self.store.commit()?;
        self.get_state().await
    }

    pub fn google_account_auth(
        &self,
        input: GoogleAccountAuthInput,
    ) -> Result<GoogleAccountAuth, Error> {
        let account_id = sanitize_string(&input.account_id);

        let credentials = self
            .load_google_credentials(&account_id)?
            .ok_or_else(|| Error::NotFound {
                message: "google credentials not found".to_string(),
            })?;

        Ok(GoogleAccountAuth {
            account_id,
            access_token: credentials.access_token.clone(),
            refresh_token: credentials.refresh_token.clone(),
            token_expires_at: credentials.token_expires_at,
        })
    }

    /// The stored access token for an account, where it is still usable.
    ///
    /// `None` means it has to be refreshed. Split from
    /// [`refresh_google_access_token`] so the common case — a token that
    /// is simply still valid — answers under a read lock, rather than holding
    /// every other remote-sync operation behind a network round trip.
    ///
    /// [`refresh_google_access_token`]: Self::refresh_google_access_token
    pub fn fresh_google_access_token(
        &self,
        input: &GoogleAccountAuthInput,
    ) -> Result<Option<String>, Error> {
        let credentials = self
            .load_google_credentials(&sanitize_string(&input.account_id))?
            .ok_or_else(|| Error::NotFound {
                message: "google credentials not found".to_string(),
            })?;

        Ok(access_token_is_fresh(
            &credentials.access_token,
            credentials.token_expires_at,
            timestamp::now(),
        )
        .then_some(credentials.access_token))
    }

    /// Trade the stored refresh token for a new access token, and persist both.
    ///
    /// The exchange happens here, so the refresh token and the client secret
    /// are never handed to the caller. A `PreconditionFailed` means the account
    /// has to be linked again — nothing the caller retries will change it.
    pub async fn refresh_google_access_token(
        &mut self,
        input: GoogleAccountAuthInput,
    ) -> Result<GoogleAccessToken, Error> {
        let account_id = sanitize_string(&input.account_id);
        let credentials = self
            .load_google_credentials(&account_id)?
            .ok_or_else(|| Error::NotFound {
                message: "google credentials not found".to_string(),
            })?;

        let config = self.google_oauth_config();
        let refresh_token = credentials.refresh_token.trim();

        let (Some(client_id), false) = (google_oauth_client_id(), refresh_token.is_empty()) else {
            return Err(Error::PreconditionFailed {
                message: "google authorization has expired".to_string(),
            });
        };

        let form = refresh_token_form(&client_id, config.client_secret.as_deref(), refresh_token);
        let now = timestamp::now();
        let tokens = request_google_tokens(&config.token_endpoint, &form, now).await?;
        let access_token = tokens.access_token.clone();

        let stored = self.upsert_google_credentials(
            &account_id,
            Some(tokens.access_token),
            tokens.refresh_token,
            tokens.expires_at,
            now,
        )?;

        if let Some(account) = self
            .store
            .accounts
            .iter_mut()
            .find(|account| account.id == account_id)
        {
            account.status = RemoteSyncAccountStatus::Ready;
            // what was stored, not what the grant stated: a grant that states
            // no expiry leaves the previous one in place, and the account has
            // to agree with the credential it describes.
            account.token_expires_at = stored.token_expires_at;
            account.last_error = None;
            account.updated_at = now;
        }

        self.store.commit()?;

        Ok(GoogleAccessToken { access_token })
    }

}

fn handle_google_sign_in_callback(
    listener: TcpListener,
    auth_sessions: Arc<Mutex<HashMap<String, GoogleSignInSession>>>,
    session_id: &str,
) -> Result<(), Error> {
    listener.set_nonblocking(true)?;

    let started_at = std::time::Instant::now();
    let (mut stream, _) = loop {
        match listener.accept() {
            Ok(connection) => break connection,
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                let status = {
                    let sessions = auth_sessions
                        .lock()
                        .map_err(|_| oauth_sessions_poisoned())?;

                    sessions
                        .get(session_id)
                        .map(|session| session.status.clone())
                };

                match status {
                    Some(GoogleSignInSessionStatus::Pending) => {
                        if started_at.elapsed() >= GOOGLE_SIGN_IN_TIMEOUT {
                            return Err(Error::TimedOut {
                                message: "GOOGLE_SIGN_IN_TIMED_OUT".to_string(),
                            });
                        }

                        std::thread::sleep(GOOGLE_SIGN_IN_POLL_INTERVAL);
                    }
                    Some(_) | None => return Ok(()),
                }
            }
            Err(error) => return Err(error.into()),
        }
    };

    let _ = stream.set_read_timeout(Some(Duration::from_secs(30)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(30)));

    let mut buffer = [0_u8; 16 * 1024];
    let count = stream.read(&mut buffer)?;
    let request = String::from_utf8_lossy(&buffer[..count]).to_string();
    let path = parse_http_request_path(&request).ok_or_else(|| Error::InvalidInput {
        message: "failed to parse oauth callback request".to_string(),
    })?;
    let query = parse_query_map(path);

    let html_message = {
        let mut sessions = auth_sessions
            .lock()
            .map_err(|_| oauth_sessions_poisoned())?;

        let session = sessions
            .get_mut(session_id)
            .ok_or_else(oauth_session_not_found)?;

        let outcome = session.read_callback(&query);
        let proposed = outcome.callback_page_message();

        if session.settle(outcome) {
            proposed
        } else {
            // the user cancelled between this connection being accepted and the
            // outcome being applied. The page states what actually holds, not
            // what this callback proposed.
            "Signing in already finished in the app. You can close this window.".to_string()
        }
    };

    let body = format!(
        "<!doctype html><html><head><meta charset=\"utf-8\"><title>Rentable</title></head><body style=\"font-family: system-ui, sans-serif; padding: 32px;\"><h2>Rentable</h2><p>{html_message}</p></body></html>"
    );
    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.len(),
        body
    );

    stream.write_all(response.as_bytes())?;

    Ok(())
}

/// the oauth sessions map is only ever held for a field read or write, so a
/// poisoned lock means a panic elsewhere rather than anything the caller did.
fn oauth_sessions_poisoned() -> Error {
    Error::Internal {
        message: "failed to lock oauth sessions".to_string(),
    }
}

fn oauth_session_not_found() -> Error {
    Error::NotFound {
        message: "oauth session not found".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use std::{collections::HashMap, path::PathBuf, sync::Arc};

    use tokio::{runtime::Runtime, sync::RwLock};

    use super::{
        GoogleAccountAuthInput, GoogleSignInCompleteInput, GoogleSignInFailure,
        GoogleSignInOutcome, GoogleSignInSession, GoogleSignInSessionLookupInput,
        GoogleSignInSessionStatus, GoogleSignOutInput,
    };
    use crate::{
        error::Error,
        persisted::Persisted,
        settings::Settings,
        sync::{RemoteSync, google::auth::GoogleOAuthTokens, store::RemoteSyncAccountStatus},
    };

    fn unique_dir(name: &str) -> PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("system time before unix epoch")
            .as_nanos();

        std::env::temp_dir()
            .join("rentable-tests")
            .join(format!("{}-{}", name, nanos))
    }

    fn pending_sign_in_session() -> GoogleSignInSession {
        GoogleSignInSession {
            session_id: "session-1".to_string(),
            expected_state: "the-state".to_string(),
            code_verifier: "the-verifier".to_string(),
            redirect_uri: "http://127.0.0.1:5173/callback".to_string(),
            status: GoogleSignInSessionStatus::Pending,
            authorization_code: None,
            error: None,
            tokens: None,
        }
    }

    /// a remote sync over its own directory, with one authorization already
    /// redeemed and waiting to be completed.
    async fn remote_sync_with_a_redeemed_authorization(name: &str) -> (PathBuf, RemoteSync) {
        let root = unique_dir(name);
        std::fs::create_dir_all(&root).expect("failed to create test root");

        let settings_path = root.join(Settings::FILENAME);
        let mut settings =
            Persisted::<Settings>::load(settings_path).expect("failed to load settings");
        settings.database_path = root.join("active.db");
        settings.commit().expect("failed to commit settings");

        let settings = Arc::new(RwLock::new(settings));
        let remote_sync = RemoteSync::new(settings, root.join(RemoteSync::FILENAME))
            .await
            .expect("failed to initialize remote sync");

        let mut redeemed = pending_sign_in_session();
        redeemed.status = GoogleSignInSessionStatus::Completed;
        redeemed.tokens = Some(GoogleOAuthTokens {
            access_token: "access-token".to_string(),
            refresh_token: Some("refresh-token".to_string()),
            expires_at: Some(crate::timestamp::now() + 10 * 60_000),
        });

        remote_sync
            .auth_sessions
            .lock()
            .expect("failed to lock auth sessions")
            .insert(redeemed.session_id.clone(), redeemed);

        (root, remote_sync)
    }

    fn signing_in_as(email: &str) -> GoogleSignInCompleteInput {
        GoogleSignInCompleteInput {
            session_id: "session-1".to_string(),
            email: email.to_string(),
            display_name: "Person Example".to_string(),
            avatar_url: Some("https://example.com/avatar.png".to_string()),
            avatar_image: Some("data:image/png;base64,iVBORw0KGgo=".to_string()),
            // derived from the email, because the account lookup matches on either
            // and two people sharing a provider id are one person to it.
            provider_user_id: Some(format!("provider-user-{email}")),
        }
    }

    fn callback_query(pairs: &[(&str, &str)]) -> HashMap<String, String> {
        pairs
            .iter()
            .map(|(key, value)| (key.to_string(), value.to_string()))
            .collect()
    }

    /// **This asserted the opposite until 2026-08-18**, when signing in and linking
    /// were one call: completing a sign-in set the workspace's provider and account
    /// on the way past. It is rewritten rather than weakened — what it pins now is
    /// that an identity is a thing on its own, which is the whole of #543.
    #[test]
    fn signing_in_records_the_person_and_leaves_the_workspace_alone() {
        Runtime::new()
            .expect("failed to create tokio runtime")
            .block_on(async {
                let (root, mut remote_sync) =
                    remote_sync_with_a_redeemed_authorization("remote-sync-google-sign-in").await;

                let signed_in = remote_sync
                    .complete_google_sign_in(signing_in_as("signed-in@example.com"))
                    .await
                    .expect("failed to complete the sign-in");

                assert_eq!(signed_in.account_id, "google-drive-signed-in-example-com");
                assert_eq!(signed_in.state.accounts.len(), 1);
                assert_eq!(
                    signed_in.state.workspace.name, "Primary workspace",
                    "signing in wrote something onto the workspace"
                );
                // `last_snapshot_at` was the witness here until the backup surface retired
                // (#569). What is left that a write would move is `updated_at`, which the
                // reconcile only advances when the workspace itself changes.
                assert_eq!(
                    signed_in.state.workspace.updated_at, signed_in.state.workspace.created_at,
                    "signing in touched the workspace"
                );

                let _ = std::fs::remove_dir_all(&root);
            });
    }

    /// the reconcile that runs on every state read used to delete any Google account
    /// the workspace was not linked to. That was consistent while signing in *was*
    /// linking; now it would undo a sign-in on the next read, which is the failure
    /// this pins — and it is invisible without a second read.
    #[test]
    fn an_identity_survives_a_state_read_with_no_workspace_linked_to_it() {
        Runtime::new()
            .expect("failed to create tokio runtime")
            .block_on(async {
                let (root, mut remote_sync) =
                    remote_sync_with_a_redeemed_authorization("remote-sync-identity-survives")
                        .await;

                remote_sync
                    .complete_google_sign_in(signing_in_as("survivor@example.com"))
                    .await
                    .expect("failed to complete the sign-in");

                let state = remote_sync.get_state().await.expect("failed to read state");

                assert_eq!(state.accounts.len(), 1, "the identity was reconciled away");
                assert!(
                    remote_sync
                        .signed_in_google_account()
                        .expect("failed to read the identity")
                        .is_some(),
                    "the credentials went with it"
                );

                let _ = std::fs::remove_dir_all(&root);
            });
    }

    /// two accounts holding credentials at once would make *who this machine is
    /// signed in as* a question about iteration order, so signing in as somebody
    /// else signs out of whoever was there.
    #[test]
    fn signing_in_as_somebody_else_signs_out_of_whoever_was_there() {
        Runtime::new()
            .expect("failed to create tokio runtime")
            .block_on(async {
                let (root, mut remote_sync) =
                    remote_sync_with_a_redeemed_authorization("remote-sync-one-identity").await;

                let first = remote_sync
                    .complete_google_sign_in(signing_in_as("first@example.com"))
                    .await
                    .expect("failed to sign the first person in");

                let second = remote_sync
                    .complete_google_sign_in(signing_in_as("second@example.com"))
                    .await
                    .expect("failed to sign the second person in");

                assert_ne!(first.account_id, second.account_id);

                let superseded = second
                    .state
                    .accounts
                    .iter()
                    .find(|account| account.id == first.account_id)
                    .expect("the superseded row went away with its credentials");

                assert_eq!(
                    superseded.avatar_image, None,
                    "the first person's picture outlived their credentials"
                );
                assert!(
                    second
                        .state
                        .accounts
                        .iter()
                        .find(|account| account.id == second.account_id)
                        .expect("the new identity is not in the state it produced")
                        .avatar_image
                        .is_some(),
                    "the person who just signed in has no picture"
                );

                assert_eq!(
                    remote_sync
                        .signed_in_google_account()
                        .expect("failed to read the identity")
                        .map(|account| account.id),
                    Some(second.account_id),
                    "the machine still reads as signed in as the first person"
                );

                let _ = std::fs::remove_dir_all(&root);
            });
    }

    /// signing out drops the credentials and keeps the account row, which is what lets the
    /// settings surface say what it is waiting for rather than showing a machine that has
    /// never seen anybody.
    ///
    /// *It read "signing out is not disconnecting Drive" and linked a workspace to prove the
    /// link survived. There is no link; the row surviving its credentials is the whole of what
    /// is left, and it is still the distinction worth pinning.*
    #[test]
    fn signing_out_keeps_the_account_and_says_what_it_is_waiting_for() {
        Runtime::new()
            .expect("failed to create tokio runtime")
            .block_on(async {
                let (root, mut remote_sync) =
                    remote_sync_with_a_redeemed_authorization("remote-sync-sign-out").await;

                let signed_in = remote_sync
                    .complete_google_sign_in(signing_in_as("leaver@example.com"))
                    .await
                    .expect("failed to complete the sign-in");

                let state = remote_sync
                    .sign_out_of_google(GoogleSignOutInput {
                        account_id: signed_in.account_id.clone(),
                    })
                    .await
                    .expect("failed to sign out");

                let account = state
                    .accounts
                    .iter()
                    .find(|account| account.id == signed_in.account_id)
                    .expect("the account went with the credentials it was holding");

                assert_eq!(account.status, RemoteSyncAccountStatus::NeedsReconnect);
                assert!(!account.refresh_token_available);
                assert_eq!(
                    account.avatar_image, None,
                    "the picture is the person's and goes with the credentials, not with the row"
                );

                let message = account.last_error.clone().unwrap_or_default();

                assert!(
                    message.contains("sign in again"),
                    "the message did not say what to do about it: {message}"
                );
                assert!(
                    remote_sync
                        .signed_in_google_account()
                        .expect("failed to read the identity")
                        .is_none(),
                    "a signed-out account still reads as signed in"
                );

                let _ = std::fs::remove_dir_all(&root);
            });
    }

    #[test]
    fn cancels_google_sign_in_session_without_erroring() {
        Runtime::new()
            .expect("failed to create tokio runtime")
            .block_on(async {
                let root = unique_dir("remote-sync-cancel-sign-in");
                std::fs::create_dir_all(&root).expect("failed to create test root");

                let settings_path = root.join(Settings::FILENAME);
                let mut settings =
                    Persisted::<Settings>::load(settings_path).expect("failed to load settings");
                settings.database_path = root.join("active.db");
                settings.commit().expect("failed to commit settings");

                let settings = Arc::new(RwLock::new(settings));
                let mut remote_sync = RemoteSync::new(settings, root.join(RemoteSync::FILENAME))
                    .await
                    .expect("failed to initialize remote sync");

                remote_sync
                    .auth_sessions
                    .lock()
                    .expect("failed to lock auth sessions")
                    .insert(
                        "session-1".to_string(),
                        GoogleSignInSession {
                            authorization_code: Some("code".to_string()),
                            error: Some("error".to_string()),
                            ..pending_sign_in_session()
                        },
                    );

                remote_sync
                    .cancel_google_sign_in(GoogleSignInSessionLookupInput {
                        session_id: "session-1".to_string(),
                    })
                    .expect("failed to cancel the google sign-in session");

                let result = remote_sync
                    .get_google_sign_in_result(GoogleSignInSessionLookupInput {
                        session_id: "session-1".to_string(),
                    })
                    .expect("failed to get cancelled link session result");

                assert_eq!(result.status, GoogleSignInSessionStatus::Cancelled);
                assert!(result.error.is_none());

                let _ = std::fs::remove_dir_all(&root);
            });
    }

    #[test]
    fn a_callback_carrying_a_matching_state_and_a_code_authorizes_the_session() {
        let mut session = pending_sign_in_session();
        let outcome = session.read_callback(&callback_query(&[
            ("code", "the-code"),
            ("state", "the-state"),
        ]));

        assert!(session.settle(outcome));
        assert_eq!(session.status, GoogleSignInSessionStatus::Completed);
        assert_eq!(session.authorization_code.as_deref(), Some("the-code"));
        assert_eq!(session.error, None);
    }

    /// the state is the only thing tying a callback to the session that started it,
    /// so a mismatch is an unrelated or forged callback and its code is not kept.
    #[test]
    fn a_callback_whose_state_does_not_match_fails_without_keeping_the_code() {
        let mut session = pending_sign_in_session();
        let outcome = session.read_callback(&callback_query(&[
            ("code", "the-code"),
            ("state", "a-different-state"),
        ]));

        assert!(session.settle(outcome));
        assert_eq!(session.status, GoogleSignInSessionStatus::Error);
        assert_eq!(session.authorization_code, None);
        assert!(
            session
                .error
                .as_deref()
                .is_some_and(|error| error.contains("state")),
            "the failure did not name the state mismatch: {:?}",
            session.error
        );
    }

    #[test]
    fn a_callback_without_an_authorization_code_fails_the_session() {
        for query in [
            callback_query(&[("state", "the-state")]),
            callback_query(&[("code", "   "), ("state", "the-state")]),
        ] {
            let mut session = pending_sign_in_session();
            let outcome = session.read_callback(&query);

            assert!(session.settle(outcome));
            assert_eq!(session.status, GoogleSignInSessionStatus::Error);
            assert_eq!(session.authorization_code, None);
        }
    }

    /// `access_denied` is google's own code and the caller branches on it to tell a
    /// user who declined consent from one who hit a real failure.
    #[test]
    fn a_callback_carrying_googles_own_error_preserves_it_verbatim() {
        let mut session = pending_sign_in_session();
        let outcome = session.read_callback(&callback_query(&[("error", "access_denied")]));

        assert!(session.settle(outcome));
        assert_eq!(session.status, GoogleSignInSessionStatus::Error);
        assert_eq!(session.error.as_deref(), Some("access_denied"));
    }

    #[test]
    fn cancelling_a_pending_session_clears_everything_it_held() {
        let mut session = pending_sign_in_session();
        session.authorization_code = Some("the-code".to_string());
        session.error = Some("an earlier error".to_string());

        session.cancel();

        assert_eq!(session.status, GoogleSignInSessionStatus::Cancelled);
        assert_eq!(session.authorization_code, None);
        assert_eq!(session.error, None);
    }

    /// cancelling after the code was redeemed is the path the link flow takes when
    /// a later step fails. The tokens are already in hand, and abandoning the
    /// session has to drop them rather than leave them in a map nobody prunes.
    #[test]
    fn cancelling_a_redeemed_session_drops_the_tokens_it_was_holding() {
        let mut session = pending_sign_in_session();
        session.status = GoogleSignInSessionStatus::Completed;
        session.authorization_code = Some("the-code".to_string());
        session.tokens = Some(GoogleOAuthTokens {
            access_token: "the-access-token".to_string(),
            refresh_token: Some("the-refresh-token".to_string()),
            expires_at: Some(999),
        });

        session.cancel();

        assert_eq!(session.status, GoogleSignInSessionStatus::Cancelled);
        assert!(
            session.tokens.is_none(),
            "a cancelled session kept its tokens"
        );
        assert_eq!(session.authorization_code, None);
    }

    /// the callback server and the user's cancellation race by construction. The
    /// callback must not overwrite the cancellation, or a link the user abandoned
    /// completes anyway.
    #[test]
    fn a_callback_arriving_after_cancellation_does_not_revive_the_session() {
        let mut session = pending_sign_in_session();

        session.cancel();

        let outcome = session.read_callback(&callback_query(&[
            ("code", "the-code"),
            ("state", "the-state"),
        ]));

        assert!(!session.settle(outcome));
        assert_eq!(session.status, GoogleSignInSessionStatus::Cancelled);
        assert_eq!(session.authorization_code, None);
    }

    /// a code is redeemable once, and google answers a replay by invalidating the
    /// tokens it already issued.
    #[test]
    fn an_authorization_code_is_taken_only_once() {
        let mut session = pending_sign_in_session();
        session.authorization_code = Some("the-code".to_string());

        assert_eq!(
            session.take_authorization_code().as_deref(),
            Some("the-code")
        );
        assert_eq!(session.take_authorization_code(), None);
    }

    #[test]
    fn a_settled_session_keeps_its_first_outcome() {
        let mut session = pending_sign_in_session();
        let authorized = session.read_callback(&callback_query(&[
            ("code", "the-first-code"),
            ("state", "the-state"),
        ]));

        assert!(session.settle(authorized));
        assert!(!session.settle(GoogleSignInOutcome::Failed(
            GoogleSignInFailure::MissingAuthorizationCode
        )));
        assert_eq!(session.status, GoogleSignInSessionStatus::Completed);
        assert_eq!(
            session.authorization_code.as_deref(),
            Some("the-first-code")
        );
    }

    /// the fresh path is what runs before every call that presents a token, and it must
    /// answer without a network round trip.
    #[test]
    fn a_fresh_stored_token_is_returned_without_refreshing() {
        Runtime::new()
            .expect("failed to create tokio runtime")
            .block_on(async {
                let root = unique_dir("remote-sync-google-fresh-token");
                std::fs::create_dir_all(&root).expect("failed to create test root");

                let settings_path = root.join(Settings::FILENAME);
                let mut settings =
                    Persisted::<Settings>::load(settings_path).expect("failed to load settings");
                settings.database_path = root.join("active.db");
                settings.commit().expect("failed to commit settings");

                let settings = Arc::new(RwLock::new(settings));
                let remote_sync = RemoteSync::new(settings, root.join(RemoteSync::FILENAME))
                    .await
                    .expect("failed to initialize remote sync");

                remote_sync
                    .upsert_google_credentials(
                        "account-with-a-fresh-token",
                        Some("the-access-token".to_string()),
                        Some("the-refresh-token".to_string()),
                        Some(crate::timestamp::now() + 10 * 60_000),
                        crate::timestamp::now(),
                    )
                    .expect("failed to store credentials");

                let fresh = remote_sync
                    .fresh_google_access_token(&GoogleAccountAuthInput {
                        account_id: "account-with-a-fresh-token".to_string(),
                    })
                    .expect("failed to read the stored token");

                assert_eq!(fresh.as_deref(), Some("the-access-token"));

                let _ = std::fs::remove_dir_all(&root);
            });
    }

    /// an expired token with no refresh token behind it cannot be recovered, and
    /// the caller has to be told to link again rather than to retry.
    #[test]
    fn an_expired_token_with_nothing_to_refresh_from_demands_a_relink() {
        Runtime::new()
            .expect("failed to create tokio runtime")
            .block_on(async {
                let root = unique_dir("remote-sync-google-reauthorize");
                std::fs::create_dir_all(&root).expect("failed to create test root");

                let settings_path = root.join(Settings::FILENAME);
                let mut settings =
                    Persisted::<Settings>::load(settings_path).expect("failed to load settings");
                settings.database_path = root.join("active.db");
                settings.commit().expect("failed to commit settings");

                let settings = Arc::new(RwLock::new(settings));
                let mut remote_sync = RemoteSync::new(settings, root.join(RemoteSync::FILENAME))
                    .await
                    .expect("failed to initialize remote sync");

                remote_sync
                    .upsert_google_credentials(
                        "account-with-nothing-to-refresh-from",
                        Some("the-access-token".to_string()),
                        None,
                        Some(crate::timestamp::now() - 60_000),
                        crate::timestamp::now(),
                    )
                    .expect("failed to store credentials");

                let input = GoogleAccountAuthInput {
                    account_id: "account-with-nothing-to-refresh-from".to_string(),
                };

                assert_eq!(
                    remote_sync
                        .fresh_google_access_token(&input)
                        .expect("failed to read the stored token"),
                    None
                );

                let error = remote_sync
                    .refresh_google_access_token(input)
                    .await
                    .expect_err("an unrefreshable account was accepted");

                assert!(
                    matches!(error, Error::PreconditionFailed { .. }),
                    "expected a relink to be demanded, got {error:?}"
                );

                let _ = std::fs::remove_dir_all(&root);
            });
    }
}
