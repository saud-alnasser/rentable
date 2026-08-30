//! What is Google's about signing in with Google: the endpoints, the client
//! registration, the scopes asked for, and the credentials the grant yields. The
//! protocol they are spent on is provider-agnostic and lives in `sync/oauth/`.
//!
//! The code exchange and the token refresh are still issued from here, so the
//! client secret and the refresh token have no reason to leave this process.

use std::time::Duration;

#[cfg(not(test))]
use keyring::{Entry as KeyringEntry, Error as KeyringError};

#[cfg(test)]
use std::{collections::HashMap, sync::Mutex};

use crate::error::Error;

use super::super::oauth::{
    OAuthConfig,
    token::{OAuthTokenResponse, OAuthTokens, parse_token_response},
};
use super::super::store::{RemoteSync, StoredGoogleCredentials, sanitize_optional_string};

const GOOGLE_AUTHORIZE_ENDPOINT: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT: &str = "https://oauth2.googleapis.com/token";
const GOOGLE_SCOPE_EMAIL: &str = "email";
const GOOGLE_SCOPE_PROFILE: &str = "profile";
/// What makes this an OpenID Connect request, and it is asked for on behalf of a server this
/// file never talks to. The control-plane API identifies an account by Google's `sub` claim,
/// and it is OpenID Connect that defines `sub` and requires it in a UserInfo answer. Without
/// `openid` the request is plain OAuth 2 and `sub` is *undefined* rather than promised —
/// which is not a foundation for the column every membership hangs off.
///
/// It asks for no data the two scopes below do not already grant; `openid` requests no
/// resource of its own. The grant also yields an `id_token`, which nothing here reads and
/// `OAuthTokenResponse` ignores, having no `deny_unknown_fields`.
const GOOGLE_SCOPE_OPENID: &str = "openid";
// The service name every stored Google credential is filed under in the platform's
// credential store. It is written out rather than composed from `CARGO_PKG_NAME`, which is what
// it used to be: the crate was renamed to `rentable-desktop` and the entries already on users'
// machines are under `rentable.google-drive`, so following the crate would have looked in a
// keychain entry nobody has and signed every linked account out on update — silently, because a
// missing credential is indistinguishable from one never granted. This value is data belonging to
// installed machines, not a fact about the crate, and it does not move again without a migration.
#[cfg(not(test))]
const GOOGLE_KEYRING_SERVICE: &str = "rentable.google-drive";

impl RemoteSync {
    pub fn google_oauth_config(&self) -> OAuthConfig {
        OAuthConfig {
            client_id: google_oauth_client_id(),
            client_secret: google_oauth_client_secret(),
            authorize_endpoint: GOOGLE_AUTHORIZE_ENDPOINT.to_string(),
            token_endpoint: GOOGLE_TOKEN_ENDPOINT.to_string(),
            scopes: google_sign_in_scopes(),
        }
    }

    pub(crate) fn upsert_google_credentials(
        &self,
        account_id: &str,
        access_token: Option<String>,
        refresh_token: Option<String>,
        token_expires_at: Option<i64>,
        updated_at: i64,
    ) -> Result<StoredGoogleCredentials, Error> {
        let access_token = sanitize_optional_string(access_token);
        let refresh_token = sanitize_optional_string(refresh_token);
        let mut credentials =
            self.load_google_credentials(account_id)?
                .unwrap_or(StoredGoogleCredentials {
                    account_id: account_id.to_string(),
                    access_token: String::new(),
                    refresh_token: String::new(),
                    token_expires_at: None,
                    updated_at,
                });

        if let Some(access_token) = access_token {
            credentials.access_token = access_token;
        }

        if let Some(refresh_token) = refresh_token {
            credentials.refresh_token = refresh_token;
        }

        credentials.token_expires_at = token_expires_at.or(credentials.token_expires_at);
        credentials.updated_at = updated_at;

        if credentials.access_token.trim().is_empty() {
            return Err(Error::InvalidInput {
                message: "google access token is required".to_string(),
            });
        }

        self.save_google_credentials(&credentials)?;

        Ok(credentials)
    }

    #[cfg(not(test))]
    pub(crate) fn load_google_credentials(
        &self,
        account_id: &str,
    ) -> Result<Option<StoredGoogleCredentials>, Error> {
        let entry = self.google_keyring_entry(account_id)?;
        let payload = match entry.get_password() {
            Ok(payload) => payload,
            Err(KeyringError::NoEntry) => return Ok(None),
            Err(error) => return Err(format_keyring_error("read", account_id, error)),
        };

        serde_json::from_str::<StoredGoogleCredentials>(&payload)
            .map(Some)
            .map_err(|error| Error::Integrity {
                message: format!(
                    "failed to decode stored google credentials for {account_id}: {error}"
                ),
            })
    }

    #[cfg(test)]
    pub(crate) fn load_google_credentials(
        &self,
        account_id: &str,
    ) -> Result<Option<StoredGoogleCredentials>, Error> {
        let store = test_google_credentials_store()
            .lock()
            .map_err(|_| Error::Internal {
                message: "failed to lock the test google credentials store".to_string(),
            })?;

        Ok(store.get(account_id).cloned())
    }

    #[cfg(not(test))]
    pub(crate) fn save_google_credentials(
        &self,
        credentials: &StoredGoogleCredentials,
    ) -> Result<(), Error> {
        let entry = self.google_keyring_entry(&credentials.account_id)?;
        let payload = serde_json::to_string(credentials).map_err(|error| Error::Internal {
            message: format!("failed to encode google credentials: {error}"),
        })?;

        entry
            .set_password(&payload)
            .map_err(|error| format_keyring_error("store", &credentials.account_id, error))
    }

    #[cfg(test)]
    pub(crate) fn save_google_credentials(
        &self,
        credentials: &StoredGoogleCredentials,
    ) -> Result<(), Error> {
        let mut store = test_google_credentials_store()
            .lock()
            .map_err(|_| Error::Internal {
                message: "failed to lock the test google credentials store".to_string(),
            })?;

        store.insert(credentials.account_id.clone(), credentials.clone());
        Ok(())
    }

    #[cfg(not(test))]
    pub(crate) fn delete_google_credentials(&self, account_id: &str) -> Result<(), Error> {
        let entry = self.google_keyring_entry(account_id)?;

        match entry.delete_credential() {
            Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
            Err(error) => Err(format_keyring_error("delete", account_id, error)),
        }
    }

    #[cfg(test)]
    pub(crate) fn delete_google_credentials(&self, account_id: &str) -> Result<(), Error> {
        let mut store = test_google_credentials_store()
            .lock()
            .map_err(|_| Error::Internal {
                message: "failed to lock the test google credentials store".to_string(),
            })?;

        store.remove(account_id);
        Ok(())
    }

    #[cfg(not(test))]
    fn google_keyring_entry(&self, account_id: &str) -> Result<KeyringEntry, Error> {
        KeyringEntry::new(GOOGLE_KEYRING_SERVICE, account_id)
            .map_err(|error| format_keyring_error("create", account_id, error))
    }
}

/// How far ahead of its stated expiry an access token stops being usable. A
/// token that expires mid-flight fails the request it was attached to, so the
/// skew buys the whole round trip rather than the instant of the check.
const ACCESS_TOKEN_REFRESH_SKEW_MS: i64 = 60_000;

/// Matches the read and write timeouts the link callback server already sets.
/// Without one a hung connection holds the link open until the session's own
/// five-minute timeout, with nothing on screen explaining the wait.
const TOKEN_REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

/// Whether a stored access token can still be used, or has to be refreshed
/// first. A token with no stated expiry is taken at face value: Google did not
/// tell us when it ages out, and guessing one would refresh on every call.
pub(crate) fn access_token_is_fresh(access_token: &str, expires_at: Option<i64>, now: i64) -> bool {
    !access_token.trim().is_empty()
        && expires_at.is_none_or(|expiry| expiry > now + ACCESS_TOKEN_REFRESH_SKEW_MS)
}

/// Send a prepared grant to Google's token endpoint.
///
/// Deliberately thin: everything decidable is decided in
/// [`parse_token_response`], leaving only the exchange itself untested until
/// #116's local-server harness can drive it.
pub(crate) async fn request_google_tokens(
    token_endpoint: &str,
    form: &[(String, String)],
    now: i64,
) -> Result<OAuthTokens, Error> {
    let client = crate::http::build_client(TOKEN_REQUEST_TIMEOUT)?;

    let response = client
        .post(token_endpoint)
        .form(form)
        .send()
        .await
        .map_err(|error| Error::Network {
            message: format!("could not reach the google token endpoint: {error}"),
        })?;

    let status = response.status().as_u16();
    let body = response.text().await.map_err(|error| Error::Network {
        message: format!("the google token response did not arrive in full: {error}"),
    })?;

    // a body that is not the documented envelope — a proxy's error page, an
    // outage notice — still carries its status, and the status is what says
    // what happened. Parsing it as an empty envelope keeps that answer.
    let payload = serde_json::from_str::<OAuthTokenResponse>(&body).unwrap_or_default();

    parse_token_response(status, payload, now)
}

pub(crate) fn google_oauth_client_id() -> Option<String> {
    std::env::var("GOOGLE_OAUTH_CLIENT_ID")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn google_oauth_client_secret() -> Option<String> {
    std::env::var("GOOGLE_OAUTH_CLIENT_SECRET")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

/// what this application asks a person to grant.
///
/// **Three, and none of them is Drive's.** `drive.file` and `drive.metadata.readonly` went with
/// Drive sync (decision 07), which is the concrete obligation the spec's *Risks* names: an
/// application still asking for access to somebody's files after deleting the code that used
/// them is asking for something it cannot spend.
///
/// What is left is what identity needs. `openid` is not decoration beside `email` and
/// `profile` — the control-plane API keys an account on the `sub` claim, and that claim is
/// *undefined* in a plain OAuth 2 grant rather than merely absent.
fn google_sign_in_scopes() -> Vec<String> {
    vec![
        GOOGLE_SCOPE_OPENID.to_string(),
        GOOGLE_SCOPE_EMAIL.to_string(),
        GOOGLE_SCOPE_PROFILE.to_string(),
    ]
}

#[cfg(not(test))]
fn format_keyring_error(action: &str, account_id: &str, error: KeyringError) -> Error {
    Error::Credential {
        message: format!("failed to {action} google credentials for {account_id}: {error}"),
    }
}

#[cfg(test)]
fn test_google_credentials_store() -> &'static Mutex<HashMap<String, StoredGoogleCredentials>> {
    use std::sync::OnceLock;

    static STORE: OnceLock<Mutex<HashMap<String, StoredGoogleCredentials>>> = OnceLock::new();

    STORE.get_or_init(|| Mutex::new(HashMap::new()))
}

#[cfg(test)]
mod tests {
    use super::{access_token_is_fresh, google_sign_in_scopes};

    /// The control-plane API identifies an account by Google's `sub`, and OpenID Connect is
    /// what defines that claim. Dropping this scope would leave the API matching on something
    /// Google is under no obligation to send — and it would fail at the API rather than here,
    /// on a machine nobody is looking at.
    #[test]
    fn the_sign_in_asks_for_openid_so_a_subject_is_promised() {
        let scopes = google_sign_in_scopes();

        assert!(
            scopes.iter().any(|scope| scope == "openid"),
            "the sign-in stopped being an OpenID Connect request: {scopes:?}"
        );
        assert!(scopes.iter().any(|scope| scope == "email"));
        assert!(scopes.iter().any(|scope| scope == "profile"));
    }

    /// **An application that deleted Drive does not go on asking for somebody's files.**
    ///
    /// The spec's *Risks* names an OAuth scope set outliving its justification as the concrete
    /// thing decision 07 owes, and a scope is not the kind of thing whose absence is visible:
    /// the consent screen would go on asking, the grant would go on being given, and nothing
    /// in this application would ever use it.
    #[test]
    fn the_sign_in_asks_for_nothing_of_drives() {
        let scopes = google_sign_in_scopes();

        assert!(
            !scopes.iter().any(|scope| scope.contains("drive")),
            "a drive scope survived the transport it was granted for: {scopes:?}"
        );
    }

    /// the sixty-second skew is what stops a token that is valid *now* from
    /// expiring mid-request, so the boundary itself is the interesting case.
    #[test]
    fn an_access_token_is_stale_once_it_is_inside_the_refresh_skew() {
        let now = 1_700_000_000_000;

        assert!(access_token_is_fresh("token", None, now));
        assert!(access_token_is_fresh("token", Some(now + 60_001), now));
        assert!(!access_token_is_fresh("token", Some(now + 60_000), now));
        assert!(!access_token_is_fresh("token", Some(now + 59_999), now));
        assert!(!access_token_is_fresh("token", Some(now - 1), now));
    }

    #[test]
    fn an_absent_access_token_is_never_fresh() {
        let now = 1_700_000_000_000;

        assert!(!access_token_is_fresh("", None, now));
        assert!(!access_token_is_fresh("   ", Some(now + 600_000), now));
    }
}
