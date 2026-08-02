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
    RemoteSync, RemoteSyncAccount, RemoteSyncAccountStatus, RemoteSyncProvider, RemoteSyncState,
    sanitize_optional_string, sanitize_string, slugify,
};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum GoogleDriveLinkSessionStatus {
    #[default]
    Pending,
    Completed,
    Error,
    Cancelled,
}

/// A started link attempt. The caller opens `authorization_url` and polls
/// `session_id`; the `state` and PKCE verifier behind that URL stay in this
/// process, so there is nothing else for the caller to carry.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleDriveLinkSessionStart {
    pub session_id: String,
    pub authorization_url: String,
}

/// How far a link attempt has got. The authorization code is deliberately
/// absent: it is redeemed here, and a caller that cannot see it cannot redeem
/// it anywhere else.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleDriveLinkSessionResult {
    pub session_id: String,
    pub status: GoogleDriveLinkSessionStatus,
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
pub struct GoogleDriveLinkSessionLookupInput {
    pub session_id: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleDriveLinkCompleteInput {
    pub session_id: String,
    pub email: String,
    pub display_name: String,
    pub avatar_url: Option<String>,
    pub provider_user_id: Option<String>,
    pub drive_quota_bytes: Option<i64>,
    pub drive_usage_bytes: Option<i64>,
    pub app_usage_bytes: Option<i64>,
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

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleDriveDisconnectInput {
    pub account_id: String,
}

/// Why a link attempt did not produce an authorization code. Each is a distinct
/// thing to tell the user, and the provider's own code is kept verbatim because
/// the caller branches on `access_denied` to separate a declined consent screen
/// from a real failure.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(super) enum GoogleDriveLinkFailure {
    Provider(String),
    StateMismatch,
    MissingAuthorizationCode,
}

impl GoogleDriveLinkFailure {
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
                format!("Google Drive linking failed: {error}. You can close this window.")
            }
            Self::StateMismatch => "Google Drive linking failed because the callback state did not match the app session. You can close this window.".to_string(),
            Self::MissingAuthorizationCode => "Google Drive linking failed because the callback did not include an authorization code. You can close this window.".to_string(),
        }
    }
}

/// What an OAuth callback turned out to carry. Cancellation is not among these:
/// it arrives from the user rather than from the callback, and is applied by
/// [`GoogleDriveLinkSession::cancel`].
#[derive(Clone, Debug, PartialEq, Eq)]
pub(super) enum GoogleDriveLinkOutcome {
    Authorized { authorization_code: String },
    Failed(GoogleDriveLinkFailure),
}

impl GoogleDriveLinkOutcome {
    /// What the browser tab shows before the user closes it.
    fn callback_page_message(&self) -> String {
        match self {
            Self::Authorized { .. } => {
                "Google Drive account linked. You can close this window now.".to_string()
            }
            Self::Failed(failure) => failure.callback_page_message(),
        }
    }
}

/// One link attempt, from the authorization request to whichever outcome
/// settles it.
///
/// `expected_state` and `code_verifier` are generated here and never leave the
/// process: the state is what ties a callback back to this session, and the
/// verifier is what proves to Google that the code is being redeemed by whoever
/// requested it.
#[derive(Clone, Debug)]
pub(super) struct GoogleDriveLinkSession {
    pub(super) session_id: String,
    pub(super) expected_state: String,
    pub(super) code_verifier: String,
    pub(super) redirect_uri: String,
    pub(super) status: GoogleDriveLinkSessionStatus,
    pub(super) authorization_code: Option<String>,
    pub(super) error: Option<String>,
    /// What the code was redeemed for, held until the account it belongs to is
    /// known. The profile read that names that account needs an access token,
    /// so the redemption necessarily happens first.
    pub(super) tokens: Option<GoogleOAuthTokens>,
}

impl GoogleDriveLinkSession {
    /// Read what an OAuth callback's query says, against the state this session
    /// issued. Pure: it decides nothing about the session's own status.
    pub(super) fn read_callback(&self, query: &HashMap<String, String>) -> GoogleDriveLinkOutcome {
        if let Some(error) = query.get("error") {
            return GoogleDriveLinkOutcome::Failed(GoogleDriveLinkFailure::Provider(error.clone()));
        }

        if query.get("state").map(String::as_str) != Some(self.expected_state.as_str()) {
            return GoogleDriveLinkOutcome::Failed(GoogleDriveLinkFailure::StateMismatch);
        }

        let authorization_code = query
            .get("code")
            .map(|code| code.trim())
            .filter(|code| !code.is_empty());

        let Some(authorization_code) = authorization_code else {
            return GoogleDriveLinkOutcome::Failed(
                GoogleDriveLinkFailure::MissingAuthorizationCode,
            );
        };

        GoogleDriveLinkOutcome::Authorized {
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
    pub(super) fn settle(&mut self, outcome: GoogleDriveLinkOutcome) -> bool {
        if self.status != GoogleDriveLinkSessionStatus::Pending {
            return false;
        }

        match outcome {
            GoogleDriveLinkOutcome::Authorized { authorization_code } => {
                self.status = GoogleDriveLinkSessionStatus::Completed;
                self.authorization_code = Some(authorization_code);
                self.error = None;
            }
            GoogleDriveLinkOutcome::Failed(failure) => {
                self.status = GoogleDriveLinkSessionStatus::Error;
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
        self.status = GoogleDriveLinkSessionStatus::Cancelled;
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

const GOOGLE_DRIVE_LINK_POLL_INTERVAL: Duration = Duration::from_millis(200);
const GOOGLE_DRIVE_LINK_TIMEOUT: Duration = Duration::from_secs(5 * 60);

impl RemoteSync {
    pub fn begin_google_drive_link(&mut self) -> Result<GoogleDriveLinkSessionStart, Error> {
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
                GoogleDriveLinkSession {
                    session_id: session_id.clone(),
                    expected_state,
                    code_verifier,
                    redirect_uri,
                    status: GoogleDriveLinkSessionStatus::Pending,
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
                handle_google_drive_callback(listener, sessions.clone(), &session_id_for_thread)
            else {
                return;
            };

            if let Ok(mut sessions) = sessions.lock()
                && let Some(session) = sessions.get_mut(&session_id_for_thread)
            {
                session.settle(GoogleDriveLinkOutcome::Failed(
                    GoogleDriveLinkFailure::Provider(error.to_string()),
                ));
            }
        });

        Ok(GoogleDriveLinkSessionStart {
            session_id,
            authorization_url,
        })
    }

    pub fn get_google_drive_link_result(
        &self,
        input: GoogleDriveLinkSessionLookupInput,
    ) -> Result<GoogleDriveLinkSessionResult, Error> {
        let session_id = sanitize_string(&input.session_id);

        let sessions = self
            .auth_sessions
            .lock()
            .map_err(|_| oauth_sessions_poisoned())?;

        let session = sessions
            .get(&session_id)
            .ok_or_else(oauth_session_not_found)?;

        Ok(GoogleDriveLinkSessionResult {
            session_id: session.session_id.clone(),
            status: session.status.clone(),
            error: session.error.clone(),
        })
    }

    pub fn cancel_google_drive_link(
        &mut self,
        input: GoogleDriveLinkSessionLookupInput,
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

        if let Some(session) = sessions.get_mut(&session_id) {
            session.cancel();
        }

        Ok(())
    }

    /// Cancel every link attempt this process is holding.
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
    /// [`GoogleDriveLinkSession::cancel`] drops the tokens, so a completion
    /// racing this one cannot succeed on them afterwards.
    pub fn cancel_google_drive_links(&mut self) -> Result<(), Error> {
        let mut sessions = self
            .auth_sessions
            .lock()
            .map_err(|_| oauth_sessions_poisoned())?;

        for session in sessions.values_mut() {
            session.cancel();
        }

        Ok(())
    }

    /// Redeem the authorization code this session captured, and hold what it
    /// yields until the account is known.
    ///
    /// Returns only the access token, which the caller still needs for the
    /// Drive profile read. The refresh token is kept on the session and reaches
    /// storage through [`complete_google_drive_link`].
    ///
    /// [`complete_google_drive_link`]: Self::complete_google_drive_link
    pub async fn exchange_google_drive_link_code(
        &mut self,
        input: GoogleDriveLinkSessionLookupInput,
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

            if session.status != GoogleDriveLinkSessionStatus::Completed {
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

    pub async fn complete_google_drive_link(
        &mut self,
        input: GoogleDriveLinkCompleteInput,
    ) -> Result<RemoteSyncState, Error> {
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
            account.provider = RemoteSyncProvider::GoogleDrive;
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
                provider: RemoteSyncProvider::GoogleDrive,
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

        if self.store.workspace.id.is_empty() {
            self.store.workspace = Self::default_workspace(self.current_database_path().await, now);
        }

        self.store.workspace.account_id = Some(account_id.clone());
        self.store.workspace.provider = RemoteSyncProvider::GoogleDrive;
        if self.store.workspace.name.trim().is_empty() {
            self.store.workspace.name = resolved_display_name;
        }
        self.store.workspace.updated_at = now;
        self.store.workspace.last_error = None;

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
            Self::reset_workspace_to_local(&mut self.store.workspace, timestamp::now());
        }

        self.store.commit()?;
        self.get_state().await
    }
}

fn handle_google_drive_callback(
    listener: TcpListener,
    auth_sessions: Arc<Mutex<HashMap<String, GoogleDriveLinkSession>>>,
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
                    Some(GoogleDriveLinkSessionStatus::Pending) => {
                        if started_at.elapsed() >= GOOGLE_DRIVE_LINK_TIMEOUT {
                            return Err(Error::TimedOut {
                                message: "GOOGLE_DRIVE_LINK_TIMED_OUT".to_string(),
                            });
                        }

                        std::thread::sleep(GOOGLE_DRIVE_LINK_POLL_INTERVAL);
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
