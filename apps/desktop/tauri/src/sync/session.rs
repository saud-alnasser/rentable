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

/// An access token for the Drive calls still made from the web layer.
///
/// Nothing on *this* path hands over a refresh token or the client secret. That
/// is not yet true of the surface as a whole — `get_google_drive_account_auth`
/// and `get_google_drive_config` still return them — and closing that is #118.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleDriveAccessToken {
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
    pub provider_user_id: Option<String>,
    pub drive_quota_bytes: Option<i64>,
    pub drive_usage_bytes: Option<i64>,
    pub app_usage_bytes: Option<i64>,
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

/// which identity a workspace is being linked to Drive under.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleDriveLinkInput {
    pub account_id: String,
}

/// which identity is being given up.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleSignOutInput {
    pub account_id: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleDriveAccountAuthInput {
    pub account_id: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleDriveAccountAuth {
    pub account_id: String,
    pub access_token: String,
    pub refresh_token: String,
    pub token_expires_at: Option<i64>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleDriveAccountUpdateInput {
    pub account_id: String,
    pub email: Option<String>,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
    pub provider_user_id: Option<String>,
    pub drive_quota_bytes: Option<i64>,
    pub drive_usage_bytes: Option<i64>,
    pub app_usage_bytes: Option<i64>,
    pub access_token: Option<String>,
    pub refresh_token: Option<String>,
    pub token_expires_at: Option<i64>,
    pub status: Option<RemoteSyncAccountStatus>,
    pub error: Option<String>,
}

/// an update that changes nothing, for a caller to fill the fields it means.
pub(super) fn account_update(account_id: &str) -> GoogleDriveAccountUpdateInput {
    GoogleDriveAccountUpdateInput {
        account_id: account_id.to_string(),
        email: None,
        display_name: None,
        avatar_url: None,
        provider_user_id: None,
        drive_quota_bytes: None,
        drive_usage_bytes: None,
        app_usage_bytes: None,
        access_token: None,
        refresh_token: None,
        token_expires_at: None,
        status: None,
        error: None,
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleDriveDisconnectInput {
    pub account_id: String,
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
    /// the identity this attempt signed in, where the attempt is one whose
    /// abandonment has to undo it.
    ///
    /// Signing in is its own act, so most sign-ins are nobody's to take back:
    /// an identity that was already there when a link started, or one a person
    /// established deliberately on its own, survives that link being abandoned.
    /// What this marks is the third case — a link that had to sign in on the way
    /// past — because backing out of it must leave no credential behind that the
    /// person never asked for. The standalone sign-in drops its session on
    /// success rather than marking it, which is why nothing here can reach one.
    pub(super) established_account_id: Option<String>,
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
const SIGNED_OUT_MESSAGE: &str = "signed out of google. sign in again to keep syncing this workspace with google drive, or disconnect drive to stop";

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

        let session_id = format!("google-drive-link-{}", timestamp::now());
        let redirect_uri = format!("http://127.0.0.1:{port}/callback");
        let authorization_url = build_authorization_url(
            &self.get_google_drive_config(),
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
                    established_account_id: None,
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

    /// Abandon one sign-in, and say which identity that leaves nobody holding.
    ///
    /// The answer is `Some` only where this attempt is the one that established
    /// the account — see [`GoogleSignInSession::established_account_id`]. It is
    /// taken rather than read, so two callers cannot both decide to forget the
    /// same identity.
    pub fn cancel_google_sign_in(
        &mut self,
        input: GoogleSignInSessionLookupInput,
    ) -> Result<Option<String>, Error> {
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
            return Ok(None);
        };

        session.cancel();

        Ok(session.established_account_id.take())
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

    /// Cancel every sign-in this process is holding, and say which identities
    /// that leaves nobody holding.
    ///
    /// The caller that abandons a link is the user, and a user abandons *the*
    /// link rather than a session identifier they have never seen. At most one
    /// attempt is outstanding in practice; cancelling by session id is for the
    /// flow that started one and knows which.
    ///
    /// A session that has *already* been authorized is cancelled too, and that
    /// is the case worth stating: the window between the consent screen closing
    /// and the account being recorded is short but reachable, and a session left
    /// alone through it links a workspace the user just asked not to link.
    /// [`GoogleSignInSession::cancel`] drops the tokens, so a completion
    /// racing this one cannot succeed on them afterwards.
    pub fn cancel_google_sign_ins(&mut self) -> Result<Vec<String>, Error> {
        let mut sessions = self
            .auth_sessions
            .lock()
            .map_err(|_| oauth_sessions_poisoned())?;

        let mut established = Vec::new();

        for session in sessions.values_mut() {
            session.cancel();

            if let Some(account_id) = session.established_account_id.take() {
                established.push(account_id);
            }
        }

        Ok(established)
    }

    /// Redeem the authorization code this session captured, and hold what it
    /// yields until the account is known.
    ///
    /// Returns only the access token, which the caller still needs for the
    /// Drive profile read. The refresh token is kept on the session and reaches
    /// storage through [`complete_google_sign_in`].
    ///
    /// [`complete_google_sign_in`]: Self::complete_google_sign_in
    pub async fn exchange_google_sign_in_code(
        &mut self,
        input: GoogleSignInSessionLookupInput,
    ) -> Result<GoogleDriveAccessToken, Error> {
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
        let config = self.get_google_drive_config();
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

        Ok(GoogleDriveAccessToken { access_token })
    }

    /// Record the person an authorization turned out to belong to.
    ///
    /// **This touches no workspace.** Signing in establishes who somebody is;
    /// what that identity is then used for — a Drive folder, and later a hosted
    /// workspace — is a second act with its own call. The two ran as one until
    /// 2026-08-18, which is why an account could not exist unless a workspace
    /// was linked to it.
    ///
    /// `establishes_identity_for_attempt` says whether abandoning the attempt
    /// that called this should take the identity back with it. A link that had
    /// to sign in on the way past passes `true`; a person signing in on purpose
    /// passes `false`, and stays signed in whatever becomes of anything else.
    pub async fn complete_google_sign_in(
        &mut self,
        input: GoogleSignInCompleteInput,
        establishes_identity_for_attempt: bool,
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
            account.provider_user_id = provider_user_id.clone();
            account.drive_quota_bytes = input.drive_quota_bytes;
            account.drive_usage_bytes = input.drive_usage_bytes;
            account.app_usage_bytes = input.app_usage_bytes;
            account.token_expires_at = token_expires_at;
            account.refresh_token_available = refresh_token
                .as_ref()
                .map(|token| !token.is_empty())
                .unwrap_or(account.refresh_token_available);
            account.last_error = None;
            account.updated_at = now;
            account.id.clone()
        } else {
            let account_id = format!("google-drive-{}", slugify(&email));
            self.store.accounts.push(RemoteSyncAccount {
                id: account_id.clone(),
                status: RemoteSyncAccountStatus::Ready,
                email: email.clone(),
                display_name: resolved_display_name.clone(),
                avatar_url: avatar_url.clone(),
                provider_user_id: provider_user_id.clone(),
                drive_quota_bytes: input.drive_quota_bytes,
                drive_usage_bytes: input.drive_usage_bytes,
                app_usage_bytes: input.app_usage_bytes,
                token_expires_at,
                refresh_token_available: refresh_token
                    .as_ref()
                    .map(|token| !token.is_empty())
                    .unwrap_or(false),
                last_synced_at: None,
                last_error: None,
                created_at: now,
                updated_at: now,
            });
            account_id
        };

        let credentials = self.upsert_google_drive_credentials(
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

        if establishes_identity_for_attempt {
            let mut sessions = self
                .auth_sessions
                .lock()
                .map_err(|_| oauth_sessions_poisoned())?;

            if let Some(session) = sessions.get_mut(&sanitize_string(&input.session_id)) {
                session.established_account_id = Some(account_id.clone());
            }
        }

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
            self.delete_google_drive_credentials(&other)?;

            if let Some(account) = self
                .store
                .accounts
                .iter_mut()
                .find(|account| account.id == other)
            {
                account.status = RemoteSyncAccountStatus::NeedsReconnect;
                account.refresh_token_available = false;
                account.token_expires_at = None;
                account.last_error = Some(SIGNED_OUT_MESSAGE.to_string());
                account.updated_at = now;
            }
        }

        Ok(())
    }

    /// Link this workspace to a Google account that already exists.
    ///
    /// The account is not created here and no authorization runs: the identity
    /// is a precondition rather than a side effect, which is the whole of what
    /// separating the two acts bought. A link asked for under an identity this
    /// machine does not hold is refused rather than quietly signing somebody in.
    pub async fn link_workspace_to_google_drive(
        &mut self,
        input: GoogleDriveLinkInput,
    ) -> Result<RemoteSyncState, Error> {
        let account_id = sanitize_string(&input.account_id);
        let now = timestamp::now();

        let display_name = self
            .store
            .accounts
            .iter()
            .find(|account| account.id == account_id)
            .map(|account| account.display_name.clone())
            .ok_or_else(|| Error::NotFound {
                message: "google account not found".to_string(),
            })?;

        if self.store.workspace.id.is_empty() {
            self.store.workspace = Self::default_workspace(self.current_database_path().await, now);
        }

        self.store.workspace.account_id = Some(account_id);

        if self.store.workspace.name.trim().is_empty() {
            self.store.workspace.name = display_name;
        }

        self.store.workspace.updated_at = now;
        self.store.workspace.last_error = None;

        self.store.commit()?;
        self.get_state().await
    }

    /// Reset this workspace to local, keeping the identity it was linked under.
    ///
    /// The counterpart to [`link_workspace_to_google_drive`]: it undoes that
    /// call and nothing else. Disconnecting Drive for good is
    /// [`disconnect_google_drive_account`], which also gives up the identity —
    /// a person who wants this application to stop talking to their Google
    /// account is asking for both.
    ///
    /// [`link_workspace_to_google_drive`]: Self::link_workspace_to_google_drive
    /// [`disconnect_google_drive_account`]: Self::disconnect_google_drive_account
    pub async fn unlink_workspace_from_google_drive(&mut self) -> Result<RemoteSyncState, Error> {
        Self::clear_google_drive_link(&mut self.store.workspace, timestamp::now());

        self.store.commit()?;
        self.get_state().await
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
                .load_google_drive_credentials(&account.id)?
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

    /// Give up the identity, keeping the account row and whatever is linked
    /// under it.
    ///
    /// The credentials go and the link stays, deliberately. A workspace whose
    /// Drive link outlives the sign-in is not broken and is not silently
    /// severed either — it is waiting on a person, and the account says so in
    /// terms the settings surface already renders: `NeedsReconnect`, with a
    /// message naming both ways out. Removing the row instead would reset the
    /// workspace to local on the next reconcile, which is disconnecting Drive
    /// without being asked to.
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
        account.last_error = Some(SIGNED_OUT_MESSAGE.to_string());
        account.updated_at = now;

        self.delete_google_drive_credentials(&account_id)?;
        self.store.commit()?;
        self.get_state().await
    }

    pub fn get_google_drive_account_auth(
        &self,
        input: GoogleDriveAccountAuthInput,
    ) -> Result<GoogleDriveAccountAuth, Error> {
        let account_id = sanitize_string(&input.account_id);

        let credentials = self
            .load_google_drive_credentials(&account_id)?
            .ok_or_else(|| Error::NotFound {
                message: "google drive credentials not found".to_string(),
            })?;

        Ok(GoogleDriveAccountAuth {
            account_id,
            access_token: credentials.access_token.clone(),
            refresh_token: credentials.refresh_token.clone(),
            token_expires_at: credentials.token_expires_at,
        })
    }

    /// The stored access token for an account, where it is still usable.
    ///
    /// `None` means it has to be refreshed. Split from
    /// [`refresh_google_drive_access_token`] so the common case — a token that
    /// is simply still valid — answers under a read lock, rather than holding
    /// every other remote-sync operation behind a network round trip.
    ///
    /// [`refresh_google_drive_access_token`]: Self::refresh_google_drive_access_token
    pub fn fresh_google_drive_access_token(
        &self,
        input: &GoogleDriveAccountAuthInput,
    ) -> Result<Option<String>, Error> {
        let credentials = self
            .load_google_drive_credentials(&sanitize_string(&input.account_id))?
            .ok_or_else(|| Error::NotFound {
                message: "google drive credentials not found".to_string(),
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
    pub async fn refresh_google_drive_access_token(
        &mut self,
        input: GoogleDriveAccountAuthInput,
    ) -> Result<GoogleDriveAccessToken, Error> {
        let account_id = sanitize_string(&input.account_id);
        let credentials = self
            .load_google_drive_credentials(&account_id)?
            .ok_or_else(|| Error::NotFound {
                message: "google drive credentials not found".to_string(),
            })?;

        let config = self.get_google_drive_config();
        let refresh_token = credentials.refresh_token.trim();

        let (Some(client_id), false) = (google_oauth_client_id(), refresh_token.is_empty()) else {
            return Err(Error::PreconditionFailed {
                message: "google drive authorization has expired".to_string(),
            });
        };

        let form = refresh_token_form(&client_id, config.client_secret.as_deref(), refresh_token);
        let now = timestamp::now();
        let tokens = request_google_tokens(&config.token_endpoint, &form, now).await?;
        let access_token = tokens.access_token.clone();

        let stored = self.upsert_google_drive_credentials(
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

        Ok(GoogleDriveAccessToken { access_token })
    }

    pub async fn update_google_drive_account(
        &mut self,
        input: GoogleDriveAccountUpdateInput,
    ) -> Result<RemoteSyncState, Error> {
        let GoogleDriveAccountUpdateInput {
            account_id,
            email,
            display_name,
            avatar_url,
            provider_user_id,
            drive_quota_bytes,
            drive_usage_bytes,
            app_usage_bytes,
            access_token,
            refresh_token,
            token_expires_at,
            status,
            error,
        } = input;

        let account_id = sanitize_string(&account_id);
        let now = timestamp::now();
        let should_update_credentials =
            access_token.is_some() || refresh_token.is_some() || token_expires_at.is_some();

        let account_index = self
            .store
            .accounts
            .iter()
            .position(|account| account.id == account_id)
            .ok_or_else(|| Error::NotFound {
                message: "google drive account not found".to_string(),
            })?;

        {
            let account = &mut self.store.accounts[account_index];

            if let Some(email) = email {
                let email = sanitize_string(&email).to_lowercase();
                if !email.is_empty() {
                    account.email = email;
                }
            }

            if let Some(display_name) = display_name {
                let display_name = sanitize_string(&display_name);
                if !display_name.is_empty() {
                    account.display_name = display_name;
                }
            }

            if let Some(avatar_url) = avatar_url {
                account.avatar_url = sanitize_optional_string(Some(avatar_url));
            }

            if let Some(provider_user_id) = provider_user_id {
                account.provider_user_id = sanitize_optional_string(Some(provider_user_id));
            }

            account.drive_quota_bytes = drive_quota_bytes.or(account.drive_quota_bytes);
            account.drive_usage_bytes = drive_usage_bytes.or(account.drive_usage_bytes);
            account.app_usage_bytes = app_usage_bytes.or(account.app_usage_bytes);
            account.token_expires_at = token_expires_at.or(account.token_expires_at);
            account.status = status.unwrap_or(RemoteSyncAccountStatus::Ready);
            account.last_error = sanitize_optional_string(error);
            account.updated_at = now;
        }

        if should_update_credentials {
            let credentials = self.upsert_google_drive_credentials(
                &account_id,
                access_token,
                sanitize_optional_string(refresh_token),
                token_expires_at,
                now,
            )?;

            self.store.accounts[account_index].refresh_token_available =
                !credentials.refresh_token.trim().is_empty();
        }

        self.store.commit()?;
        self.get_state().await
    }

    pub async fn disconnect_google_drive_account(
        &mut self,
        input: GoogleDriveDisconnectInput,
    ) -> Result<RemoteSyncState, Error> {
        let account_id = sanitize_string(&input.account_id);

        self.store
            .accounts
            .retain(|account| account.id != account_id);
        self.delete_google_drive_credentials(&account_id)?;

        if self.store.workspace.account_id.as_deref() == Some(account_id.as_str()) {
            Self::clear_google_drive_link(&mut self.store.workspace, timestamp::now());
        }

        self.store.commit()?;
        self.get_state().await
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
            "Google Drive linking already finished in the app. You can close this window."
                .to_string()
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
        GoogleDriveAccountAuthInput, GoogleDriveLinkInput, GoogleSignInCompleteInput,
        GoogleSignInFailure, GoogleSignInOutcome, GoogleSignInSession,
        GoogleSignInSessionLookupInput, GoogleSignInSessionStatus, GoogleSignOutInput,
    };
    use crate::{
        error::Error,
        persisted::Persisted,
        settings::Settings,
        sync::{
            RemoteSync, google::auth::GoogleOAuthTokens, store::RemoteSyncAccountStatus,
        },
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

    fn pending_link_session() -> GoogleSignInSession {
        GoogleSignInSession {
            session_id: "session-1".to_string(),
            expected_state: "the-state".to_string(),
            code_verifier: "the-verifier".to_string(),
            redirect_uri: "http://127.0.0.1:5173/callback".to_string(),
            status: GoogleSignInSessionStatus::Pending,
            authorization_code: None,
            error: None,
            tokens: None,
            established_account_id: None,
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

        let mut redeemed = pending_link_session();
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
            // derived from the email, because the account lookup matches on either
            // and two people sharing a provider id are one person to it.
            provider_user_id: Some(format!("provider-user-{email}")),
            drive_quota_bytes: Some(1000),
            drive_usage_bytes: Some(250),
            app_usage_bytes: Some(125),
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
                    .complete_google_sign_in(signing_in_as("signed-in@example.com"), false)
                    .await
                    .expect("failed to complete the sign-in");

                assert_eq!(signed_in.account_id, "google-drive-signed-in-example-com");
                assert_eq!(signed_in.state.accounts.len(), 1);
                assert_eq!(
                    signed_in.state.workspace.account_id, None,
                    "signing in linked the workspace to an account"
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
                    .complete_google_sign_in(signing_in_as("survivor@example.com"), false)
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

    /// what "linking does not re-authorize" rests on: the account is already there
    /// and linking only names it. A link that had to establish an identity could not
    /// be written this way, because there would be nothing to pass it.
    #[test]
    fn linking_a_workspace_names_an_identity_that_already_exists() {
        Runtime::new()
            .expect("failed to create tokio runtime")
            .block_on(async {
                let (root, mut remote_sync) =
                    remote_sync_with_a_redeemed_authorization("remote-sync-link-under-identity")
                        .await;

                let signed_in = remote_sync
                    .complete_google_sign_in(signing_in_as("linker@example.com"), false)
                    .await
                    .expect("failed to complete the sign-in");

                let state = remote_sync
                    .link_workspace_to_google_drive(GoogleDriveLinkInput {
                        account_id: signed_in.account_id.clone(),
                    })
                    .await
                    .expect("failed to link the workspace");

                assert_eq!(
                    state.workspace.account_id.as_deref(),
                    Some(signed_in.account_id.as_str())
                );

                let _ = std::fs::remove_dir_all(&root);
            });
    }

    /// nothing in the linking path can sign anybody in, so a link under an identity
    /// this machine does not hold has to be refused rather than establishing one.
    #[test]
    fn linking_under_an_identity_this_machine_does_not_hold_is_refused() {
        Runtime::new()
            .expect("failed to create tokio runtime")
            .block_on(async {
                let (root, mut remote_sync) =
                    remote_sync_with_a_redeemed_authorization("remote-sync-link-without-identity")
                        .await;

                let error = remote_sync
                    .link_workspace_to_google_drive(GoogleDriveLinkInput {
                        account_id: "google-drive-nobody".to_string(),
                    })
                    .await
                    .expect_err("a workspace linked itself to an account that does not exist");

                assert!(
                    matches!(error, Error::NotFound { .. }),
                    "expected the account to be missing, got {error:?}"
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
                    .complete_google_sign_in(signing_in_as("first@example.com"), false)
                    .await
                    .expect("failed to sign the first person in");

                let second = remote_sync
                    .complete_google_sign_in(signing_in_as("second@example.com"), false)
                    .await
                    .expect("failed to sign the second person in");

                assert_ne!(first.account_id, second.account_id);
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

    /// signing out is not disconnecting Drive. The link survives so the person can
    /// act on it either way, and the account carries the sentence that says so —
    /// which the settings surface already renders beside a *needs reconnect* badge.
    #[test]
    fn signing_out_keeps_the_link_and_says_what_it_is_waiting_for() {
        Runtime::new()
            .expect("failed to create tokio runtime")
            .block_on(async {
                let (root, mut remote_sync) =
                    remote_sync_with_a_redeemed_authorization("remote-sync-sign-out").await;

                let signed_in = remote_sync
                    .complete_google_sign_in(signing_in_as("leaver@example.com"), false)
                    .await
                    .expect("failed to complete the sign-in");

                remote_sync
                    .link_workspace_to_google_drive(GoogleDriveLinkInput {
                        account_id: signed_in.account_id.clone(),
                    })
                    .await
                    .expect("failed to link the workspace");

                let state = remote_sync
                    .sign_out_of_google(GoogleSignOutInput {
                        account_id: signed_in.account_id.clone(),
                    })
                    .await
                    .expect("failed to sign out");

                assert_eq!(
                    state.workspace.account_id.as_deref(),
                    Some(signed_in.account_id.as_str()),
                    "signing out disconnected drive"
                );

                let account = state
                    .accounts
                    .iter()
                    .find(|account| account.id == signed_in.account_id)
                    .expect("the account the workspace is linked to went with the credentials");

                assert_eq!(account.status, RemoteSyncAccountStatus::NeedsReconnect);
                assert!(!account.refresh_token_available);

                let message = account.last_error.clone().unwrap_or_default();

                assert!(
                    message.contains("sign in again") && message.contains("disconnect drive"),
                    "the message named neither way out: {message}"
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

    /// abandoning an attempt undoes what the attempt did, and no more. A link that
    /// signed somebody in on the way past gives that identity back; one that merely
    /// used an identity already held gives back nothing.
    #[test]
    fn abandoning_an_attempt_hands_back_only_the_identity_it_established() {
        Runtime::new()
            .expect("failed to create tokio runtime")
            .block_on(async {
                for (establishes, expected) in [
                    (true, vec!["google-drive-abandoner-example-com"]),
                    (false, Vec::new()),
                ] {
                    let (root, mut remote_sync) = remote_sync_with_a_redeemed_authorization(
                        "remote-sync-abandon-established",
                    )
                    .await;

                    remote_sync
                        .complete_google_sign_in(
                            signing_in_as("abandoner@example.com"),
                            establishes,
                        )
                        .await
                        .expect("failed to complete the sign-in");

                    let established = remote_sync
                        .cancel_google_sign_ins()
                        .expect("failed to cancel the sign-ins");

                    assert_eq!(established, expected, "establishes = {establishes}");

                    let _ = std::fs::remove_dir_all(&root);
                }
            });
    }

    /// taken rather than read: two callers racing to abandon one attempt must not
    /// both decide to forget the same identity.
    #[test]
    fn an_identity_is_handed_back_once() {
        Runtime::new()
            .expect("failed to create tokio runtime")
            .block_on(async {
                let (root, mut remote_sync) =
                    remote_sync_with_a_redeemed_authorization("remote-sync-abandon-once").await;

                remote_sync
                    .complete_google_sign_in(signing_in_as("twice@example.com"), true)
                    .await
                    .expect("failed to complete the sign-in");

                assert_eq!(
                    remote_sync
                        .cancel_google_sign_ins()
                        .expect("failed to cancel the sign-ins")
                        .len(),
                    1
                );
                assert!(
                    remote_sync
                        .cancel_google_sign_ins()
                        .expect("failed to cancel the sign-ins")
                        .is_empty(),
                    "the same identity was handed back twice"
                );

                let _ = std::fs::remove_dir_all(&root);
            });
    }

    /// the standalone sign-in drops its session, which is what stops some later link
    /// being abandoned and taking an identity it never established with it.
    #[test]
    fn a_forgotten_session_hands_nothing_back() {
        Runtime::new()
            .expect("failed to create tokio runtime")
            .block_on(async {
                let (root, mut remote_sync) =
                    remote_sync_with_a_redeemed_authorization("remote-sync-forget-session").await;

                remote_sync
                    .complete_google_sign_in(signing_in_as("forgotten@example.com"), true)
                    .await
                    .expect("failed to complete the sign-in");

                remote_sync
                    .forget_google_sign_in_session(GoogleSignInSessionLookupInput {
                        session_id: "session-1".to_string(),
                    })
                    .expect("failed to forget the session");

                assert!(
                    remote_sync
                        .cancel_google_sign_ins()
                        .expect("failed to cancel the sign-ins")
                        .is_empty(),
                    "a session nobody is holding still gave an identity back"
                );

                let _ = std::fs::remove_dir_all(&root);
            });
    }

    #[test]
    fn cancels_google_sign_in_session_without_erroring() {
        Runtime::new()
            .expect("failed to create tokio runtime")
            .block_on(async {
                let root = unique_dir("remote-sync-google-drive-cancel-link");
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
                            ..pending_link_session()
                        },
                    );

                remote_sync
                    .cancel_google_sign_in(GoogleSignInSessionLookupInput {
                        session_id: "session-1".to_string(),
                    })
                    .expect("failed to cancel google drive link session");

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
        let mut session = pending_link_session();
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
        let mut session = pending_link_session();
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
            let mut session = pending_link_session();
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
        let mut session = pending_link_session();
        let outcome = session.read_callback(&callback_query(&[("error", "access_denied")]));

        assert!(session.settle(outcome));
        assert_eq!(session.status, GoogleSignInSessionStatus::Error);
        assert_eq!(session.error.as_deref(), Some("access_denied"));
    }

    #[test]
    fn cancelling_a_pending_session_clears_everything_it_held() {
        let mut session = pending_link_session();
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
        let mut session = pending_link_session();
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
        let mut session = pending_link_session();

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
        let mut session = pending_link_session();
        session.authorization_code = Some("the-code".to_string());

        assert_eq!(
            session.take_authorization_code().as_deref(),
            Some("the-code")
        );
        assert_eq!(session.take_authorization_code(), None);
    }

    #[test]
    fn a_settled_session_keeps_its_first_outcome() {
        let mut session = pending_link_session();
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

    /// the fresh path is what runs before nearly every drive call, and it must
    /// answer without a network round trip.
    #[test]
    fn a_fresh_stored_token_is_returned_without_refreshing() {
        Runtime::new()
            .expect("failed to create tokio runtime")
            .block_on(async {
                let root = unique_dir("remote-sync-google-drive-fresh-token");
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
                    .upsert_google_drive_credentials(
                        "account-with-a-fresh-token",
                        Some("the-access-token".to_string()),
                        Some("the-refresh-token".to_string()),
                        Some(crate::timestamp::now() + 10 * 60_000),
                        crate::timestamp::now(),
                    )
                    .expect("failed to store credentials");

                let fresh = remote_sync
                    .fresh_google_drive_access_token(&GoogleDriveAccountAuthInput {
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
                let root = unique_dir("remote-sync-google-drive-relink");
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
                    .upsert_google_drive_credentials(
                        "account-with-nothing-to-refresh-from",
                        Some("the-access-token".to_string()),
                        None,
                        Some(crate::timestamp::now() - 60_000),
                        crate::timestamp::now(),
                    )
                    .expect("failed to store credentials");

                let input = GoogleDriveAccountAuthInput {
                    account_id: "account-with-nothing-to-refresh-from".to_string(),
                };

                assert_eq!(
                    remote_sync
                        .fresh_google_drive_access_token(&input)
                        .expect("failed to read the stored token"),
                    None
                );

                let error = remote_sync
                    .refresh_google_drive_access_token(input)
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
