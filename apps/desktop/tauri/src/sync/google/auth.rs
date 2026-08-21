//! OAuth, credentials, and the link-callback parsing. Authorization, the code
//! exchange, and token refresh all happen here, so the client secret and the
//! refresh token have no reason to leave this process.

use std::{collections::HashMap, time::Duration};

use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD as BASE64URL};
#[cfg(not(test))]
use keyring::{Entry as KeyringEntry, Error as KeyringError};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use url::Url;

#[cfg(test)]
use std::sync::Mutex;

use crate::error::Error;

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
/// `GoogleTokenResponse` ignores, having no `deny_unknown_fields`.
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

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleOAuthConfig {
    pub client_id: Option<String>,
    pub client_secret: Option<String>,
    pub authorize_endpoint: String,
    pub token_endpoint: String,
    pub scopes: Vec<String>,
}

impl RemoteSync {
    pub fn google_oauth_config(&self) -> GoogleOAuthConfig {
        GoogleOAuthConfig {
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

/// The number of random bytes behind an OAuth `state` value and a PKCE
/// verifier. RFC 7636 fixes the verifier between 43 and 128 characters, which
/// 32 bytes of base64url meets exactly at the lower bound.
const OAUTH_TOKEN_ENTROPY_BYTES: usize = 32;

/// A fresh URL-safe token drawn from the operating system's entropy source,
/// used for both the OAuth `state` and the PKCE verifier.
///
/// Fails only where the platform cannot supply randomness, which is not a
/// condition the caller can recover from by retrying.
pub(crate) fn random_url_safe_token() -> Result<String, Error> {
    let mut bytes = [0_u8; OAUTH_TOKEN_ENTROPY_BYTES];

    getrandom::fill(&mut bytes).map_err(|error| Error::Internal {
        message: format!("failed to draw random bytes for the oauth session: {error}"),
    })?;

    Ok(BASE64URL.encode(bytes))
}

/// The `S256` PKCE challenge for a verifier: unpadded base64url of its SHA-256
/// digest, as RFC 7636 section 4.2 defines it.
pub(crate) fn pkce_challenge(verifier: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(verifier.as_bytes());

    BASE64URL.encode(hasher.finalize())
}

/// Google's authorization URL for one link attempt.
///
/// `redirect_uri` must be the loopback address the callback server is actually
/// listening on: Google matches it against the one replayed at the code
/// exchange, and a mismatch is rejected there rather than here.
pub(crate) fn build_authorization_url(
    config: &GoogleOAuthConfig,
    client_id: &str,
    redirect_uri: &str,
    state: &str,
    code_challenge: &str,
) -> Result<String, Error> {
    let mut url = Url::parse(&config.authorize_endpoint).map_err(|error| Error::Internal {
        message: format!("google authorize endpoint is not a url: {error}"),
    })?;

    url.query_pairs_mut()
        .clear()
        .append_pair("client_id", client_id)
        .append_pair("redirect_uri", redirect_uri)
        .append_pair("response_type", "code")
        .append_pair("scope", &config.scopes.join(" "))
        .append_pair("access_type", "offline")
        .append_pair("include_granted_scopes", "true")
        .append_pair("prompt", "consent")
        .append_pair("state", state)
        .append_pair("code_challenge", code_challenge)
        .append_pair("code_challenge_method", "S256");

    Ok(url.to_string())
}

/// How far ahead of its stated expiry an access token stops being usable. A
/// token that expires mid-flight fails the request it was attached to, so the
/// skew buys the whole round trip rather than the instant of the check.
const ACCESS_TOKEN_REFRESH_SKEW_MS: i64 = 60_000;

/// Matches the read and write timeouts the link callback server already sets.
/// Without one a hung connection holds the link open until the session's own
/// five-minute timeout, with nothing on screen explaining the wait.
const TOKEN_REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

/// What a grant yields. `refresh_token` is absent on the refresh grant itself,
/// and `expires_at` is absent where Google states no lifetime — neither is an
/// error, and neither may overwrite what is already stored.
#[derive(Clone, Debug)]
pub(crate) struct GoogleOAuthTokens {
    pub(crate) access_token: String,
    pub(crate) refresh_token: Option<String>,
    pub(crate) expires_at: Option<i64>,
}

/// The token endpoint's body, which carries either a grant or a refusal under
/// the same 200-shaped envelope — so every field is optional and the status
/// alone does not say which arrived.
#[derive(Clone, Debug, Default, Deserialize)]
pub(crate) struct GoogleTokenResponse {
    #[serde(default)]
    pub(crate) access_token: Option<String>,
    #[serde(default)]
    pub(crate) refresh_token: Option<String>,
    #[serde(default)]
    pub(crate) expires_in: Option<i64>,
    #[serde(default)]
    pub(crate) error: Option<String>,
    #[serde(default)]
    pub(crate) error_description: Option<String>,
    #[serde(default)]
    pub(crate) error_uri: Option<String>,
}

/// Whether a stored access token can still be used, or has to be refreshed
/// first. A token with no stated expiry is taken at face value: Google did not
/// tell us when it ages out, and guessing one would refresh on every call.
pub(crate) fn access_token_is_fresh(access_token: &str, expires_at: Option<i64>, now: i64) -> bool {
    !access_token.trim().is_empty()
        && expires_at.is_none_or(|expiry| expiry > now + ACCESS_TOKEN_REFRESH_SKEW_MS)
}

/// The form fields exchanging an authorization code for a token set.
///
/// `redirect_uri` and `code_verifier` are replayed rather than re-derived:
/// Google checks both against what the authorization request carried.
pub(crate) fn authorization_code_form(
    client_id: &str,
    client_secret: Option<&str>,
    redirect_uri: &str,
    code_verifier: &str,
    code: &str,
) -> Vec<(String, String)> {
    let mut form = vec![
        ("client_id".to_string(), client_id.to_string()),
        ("redirect_uri".to_string(), redirect_uri.to_string()),
        ("grant_type".to_string(), "authorization_code".to_string()),
        ("code_verifier".to_string(), code_verifier.to_string()),
        ("code".to_string(), code.to_string()),
    ];

    append_client_secret(&mut form, client_secret);

    form
}

/// The form fields trading a refresh token for a fresh access token.
pub(crate) fn refresh_token_form(
    client_id: &str,
    client_secret: Option<&str>,
    refresh_token: &str,
) -> Vec<(String, String)> {
    let mut form = vec![
        ("client_id".to_string(), client_id.to_string()),
        ("grant_type".to_string(), "refresh_token".to_string()),
        ("refresh_token".to_string(), refresh_token.to_string()),
    ];

    append_client_secret(&mut form, client_secret);

    form
}

/// A token endpoint response read as either a grant or a refusal.
///
/// `now` is passed rather than read so the expiry arithmetic is the caller's
/// clock, and so the boundary is testable.
pub(crate) fn parse_token_response(
    status: u16,
    payload: GoogleTokenResponse,
    now: i64,
) -> Result<GoogleOAuthTokens, Error> {
    let access_token = payload
        .access_token
        .as_deref()
        .map(str::trim)
        .filter(|token| !token.is_empty());

    let Some(access_token) = access_token else {
        return Err(token_refusal(status, &payload));
    };

    Ok(GoogleOAuthTokens {
        access_token: access_token.to_string(),
        refresh_token: sanitize_optional_string(payload.refresh_token),
        expires_at: payload
            .expires_in
            .map(|seconds| now.saturating_add(seconds.saturating_mul(1_000))),
    })
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
) -> Result<GoogleOAuthTokens, Error> {
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
    let payload = serde_json::from_str::<GoogleTokenResponse>(&body).unwrap_or_default();

    parse_token_response(status, payload, now)
}

fn append_client_secret(form: &mut Vec<(String, String)>, client_secret: Option<&str>) {
    let client_secret = client_secret
        .map(str::trim)
        .filter(|secret| !secret.is_empty());

    if let Some(client_secret) = client_secret {
        form.push(("client_secret".to_string(), client_secret.to_string()));
    }
}

/// A refusal read back as a typed error, by what the caller would have to do
/// about it: link the account again, fix the OAuth registration, or try later.
///
/// Nothing here maps to [`Error::Internal`] — a remote refusing a request is
/// not an invariant of this program breaking. #116 refines the categories once
/// the transport can exercise them.
fn token_refusal(status: u16, payload: &GoogleTokenResponse) -> Error {
    let detail = [
        payload.error.as_deref(),
        payload.error_description.as_deref(),
        payload.error_uri.as_deref(),
    ]
    .into_iter()
    .flatten()
    .map(str::trim)
    .filter(|part| !part.is_empty())
    .collect::<Vec<_>>()
    .join(" — ");

    let message = if detail.is_empty() {
        format!("google token exchange failed ({status})")
    } else {
        format!("google token exchange failed ({status}): {detail}")
    };

    match payload.error.as_deref().map(str::trim) {
        // the grant is spent or revoked. Nothing retries into a working state;
        // the account has to be linked again.
        Some("invalid_grant") => Error::PreconditionFailed { message },
        // the OAuth client itself is wrong, which is configuration rather than
        // anything this user did.
        Some("invalid_client" | "unauthorized_client") => Error::NotConfigured { message },
        // an unrecognised refusal, or a body that was not a refusal at all —
        // both leave the caller with nothing to change but the time.
        _ => Error::Network { message },
    }
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

pub(crate) fn parse_http_request_path(request: &str) -> Option<&str> {
    let first_line = request.lines().next()?;
    let mut segments = first_line.split_whitespace();
    let method = segments.next()?;
    let path = segments.next()?;

    if method.eq_ignore_ascii_case("GET") {
        Some(path)
    } else {
        None
    }
}

pub(crate) fn parse_query_map(path: &str) -> HashMap<String, String> {
    let query = path
        .split_once('?')
        .map(|(_, query)| query)
        .unwrap_or_default();
    let mut map = HashMap::new();

    for segment in query.split('&').filter(|segment| !segment.is_empty()) {
        let (key, value) = segment.split_once('=').unwrap_or((segment, ""));
        map.insert(percent_decode(key), percent_decode(value));
    }

    map
}

pub(crate) fn percent_decode(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut index = 0;
    let mut output = Vec::with_capacity(bytes.len());

    while index < bytes.len() {
        match bytes[index] {
            b'+' => {
                output.push(b' ');
                index += 1;
            }
            b'%' if index + 2 < bytes.len() => {
                let high = (bytes[index + 1] as char).to_digit(16);
                let low = (bytes[index + 2] as char).to_digit(16);

                if let (Some(high), Some(low)) = (high, low) {
                    output.push(((high << 4) | low) as u8);
                    index += 3;
                } else {
                    output.push(bytes[index]);
                    index += 1;
                }
            }
            byte => {
                output.push(byte);
                index += 1;
            }
        }
    }

    String::from_utf8_lossy(&output).to_string()
}

#[cfg(test)]
mod tests {
    use super::percent_decode;

    #[test]
    fn percent_decode_is_stable() {
        assert_eq!(percent_decode("hello%20world%2Btest"), "hello world+test");
    }

    use std::collections::HashMap;

    use serde_json::json;

    use crate::error::Error;

    use super::{
        GoogleOAuthConfig, GoogleTokenResponse, access_token_is_fresh, authorization_code_form,
        build_authorization_url, google_sign_in_scopes, parse_token_response, pkce_challenge,
        random_url_safe_token, refresh_token_form,
    };

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
    fn oauth_config() -> GoogleOAuthConfig {
        GoogleOAuthConfig {
            client_id: Some("client-id".to_string()),
            client_secret: Some("client-secret".to_string()),
            authorize_endpoint: "https://accounts.google.com/o/oauth2/v2/auth".to_string(),
            token_endpoint: "https://oauth2.googleapis.com/token".to_string(),
            scopes: vec!["openid".to_string(), "email".to_string()],
        }
    }

    /// the worked example from RFC 7636 appendix B. Google verifies the challenge
    /// against the verifier we send later, so an encoding that is merely
    /// self-consistent still fails against the live endpoint.
    #[test]
    fn the_pkce_challenge_matches_the_rfc_7636_worked_example() {
        assert_eq!(
            pkce_challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
    }

    #[test]
    fn a_random_token_is_unpadded_base64url_of_thirty_two_bytes() {
        let token = random_url_safe_token().expect("failed to draw a random token");

        assert_eq!(token.len(), 43);
        assert!(
            token
                .chars()
                .all(|character| character.is_ascii_alphanumeric()
                    || character == '-'
                    || character == '_'),
            "token left the base64url alphabet: {token}"
        );
    }

    #[test]
    fn two_random_tokens_differ() {
        let first = random_url_safe_token().expect("failed to draw a random token");
        let second = random_url_safe_token().expect("failed to draw a random token");

        assert_ne!(first, second);
    }

    #[test]
    fn the_authorization_url_carries_every_parameter_google_requires() {
        let url = build_authorization_url(
            &oauth_config(),
            "client-id",
            "http://127.0.0.1:5173/callback",
            "the-state",
            "the-challenge",
        )
        .expect("failed to build the authorization url");
        let parsed = url::Url::parse(&url).expect("the authorization url did not parse");
        let parameters = parsed
            .query_pairs()
            .map(|(key, value)| (key.into_owned(), value.into_owned()))
            .collect::<HashMap<_, _>>();

        assert_eq!(parsed.host_str(), Some("accounts.google.com"));
        assert_eq!(parsed.path(), "/o/oauth2/v2/auth");
        assert_eq!(
            parameters.get("client_id").map(String::as_str),
            Some("client-id")
        );
        assert_eq!(
            parameters.get("redirect_uri").map(String::as_str),
            Some("http://127.0.0.1:5173/callback")
        );
        assert_eq!(
            parameters.get("response_type").map(String::as_str),
            Some("code")
        );
        assert_eq!(
            parameters.get("scope").map(String::as_str),
            Some("openid email")
        );
        assert_eq!(
            parameters.get("access_type").map(String::as_str),
            Some("offline")
        );
        assert_eq!(
            parameters.get("include_granted_scopes").map(String::as_str),
            Some("true")
        );
        assert_eq!(
            parameters.get("prompt").map(String::as_str),
            Some("consent")
        );
        assert_eq!(
            parameters.get("state").map(String::as_str),
            Some("the-state")
        );
        assert_eq!(
            parameters.get("code_challenge").map(String::as_str),
            Some("the-challenge")
        );
        assert_eq!(
            parameters.get("code_challenge_method").map(String::as_str),
            Some("S256")
        );
    }

    /// the redirect and the scope list both carry characters that change meaning
    /// unescaped, and a mis-encoded redirect is rejected by Google as a mismatch
    /// rather than as a malformed request.
    #[test]
    fn the_authorization_url_escapes_the_values_it_carries() {
        let url = build_authorization_url(
            &oauth_config(),
            "client-id",
            "http://127.0.0.1:5173/callback",
            "the-state",
            "the-challenge",
        )
        .expect("failed to build the authorization url");

        assert!(
            url.contains("redirect_uri=http%3A%2F%2F127.0.0.1%3A5173%2Fcallback"),
            "the redirect uri was not escaped: {url}"
        );
        assert!(
            !url.contains("drive.file email"),
            "the scope separator was not escaped: {url}"
        );
    }

    fn token_payload(fields: serde_json::Value) -> GoogleTokenResponse {
        serde_json::from_value(fields).expect("failed to build a token payload")
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

    #[test]
    fn the_authorization_code_grant_replays_the_redirect_and_the_verifier() {
        let form = authorization_code_form(
            "client-id",
            Some("client-secret"),
            "http://127.0.0.1:5173/callback",
            "the-verifier",
            "the-code",
        )
        .into_iter()
        .collect::<HashMap<_, _>>();

        assert_eq!(
            form.get("grant_type").map(String::as_str),
            Some("authorization_code")
        );
        assert_eq!(form.get("client_id").map(String::as_str), Some("client-id"));
        assert_eq!(
            form.get("client_secret").map(String::as_str),
            Some("client-secret")
        );
        assert_eq!(
            form.get("redirect_uri").map(String::as_str),
            Some("http://127.0.0.1:5173/callback")
        );
        assert_eq!(
            form.get("code_verifier").map(String::as_str),
            Some("the-verifier")
        );
        assert_eq!(form.get("code").map(String::as_str), Some("the-code"));
    }

    #[test]
    fn the_refresh_grant_sends_only_the_refresh_token() {
        let form = refresh_token_form("client-id", Some("client-secret"), "the-refresh-token")
            .into_iter()
            .collect::<HashMap<_, _>>();

        assert_eq!(
            form.get("grant_type").map(String::as_str),
            Some("refresh_token")
        );
        assert_eq!(form.get("client_id").map(String::as_str), Some("client-id"));
        assert_eq!(
            form.get("client_secret").map(String::as_str),
            Some("client-secret")
        );
        assert_eq!(
            form.get("refresh_token").map(String::as_str),
            Some("the-refresh-token")
        );
        assert_eq!(form.get("code"), None);
        assert_eq!(form.get("redirect_uri"), None);
    }

    /// google issues the desktop client id without a secret, and sending an empty
    /// one is a rejected request rather than an ignored field.
    #[test]
    fn a_grant_omits_the_client_secret_when_there_is_none_configured() {
        for form in [
            authorization_code_form("client-id", None, "http://127.0.0.1/callback", "v", "c"),
            refresh_token_form("client-id", None, "the-refresh-token"),
        ] {
            assert!(
                !form.iter().any(|(key, _)| key == "client_secret"),
                "an unconfigured client secret still reached the request: {form:?}"
            );
        }
    }

    #[test]
    fn a_granted_token_carries_its_expiry_as_an_absolute_instant() {
        let now = 1_700_000_000_000;
        let tokens = parse_token_response(
            200,
            token_payload(json!({
                "access_token": "the-access-token",
                "refresh_token": "the-refresh-token",
                "expires_in": 3599,
            })),
            now,
        )
        .expect("a well-formed grant was rejected");

        assert_eq!(tokens.access_token, "the-access-token");
        assert_eq!(tokens.refresh_token.as_deref(), Some("the-refresh-token"));
        assert_eq!(tokens.expires_at, Some(now + 3_599_000));
    }

    /// the refresh grant returns no refresh token of its own, and no expiry is a
    /// token google has not told us how to age out.
    #[test]
    fn a_grant_may_omit_the_refresh_token_and_the_expiry() {
        let tokens = parse_token_response(
            200,
            token_payload(json!({ "access_token": "the-access-token" })),
            1_700_000_000_000,
        )
        .expect("a well-formed grant was rejected");

        assert_eq!(tokens.refresh_token, None);
        assert_eq!(tokens.expires_at, None);
    }

    /// a spent or revoked grant is the one refusal the caller can act on: it means
    /// relink, and nothing about retrying will change it.
    #[test]
    fn a_dead_grant_is_reported_as_a_failed_precondition() {
        let error = parse_token_response(
            400,
            token_payload(json!({
                "error": "invalid_grant",
                "error_description": "Token has been expired or revoked.",
            })),
            1_700_000_000_000,
        )
        .expect_err("a dead grant was accepted");

        assert!(matches!(error, Error::PreconditionFailed { .. }));
        assert!(
            error
                .to_string()
                .contains("Token has been expired or revoked."),
            "google's own description was dropped: {error}"
        );
    }

    #[test]
    fn any_other_refusal_keeps_googles_reported_detail() {
        let error = parse_token_response(
            401,
            token_payload(json!({
                "error": "invalid_client",
                "error_description": "The OAuth client was not found.",
                "error_uri": "https://example.test/oauth",
            })),
            1_700_000_000_000,
        )
        .expect_err("a refused grant was accepted");

        let message = error.to_string();

        assert!(message.contains("401"), "the status was dropped: {message}");
        assert!(
            message.contains("invalid_client"),
            "the code was dropped: {message}"
        );
        assert!(
            message.contains("The OAuth client was not found."),
            "the description was dropped: {message}"
        );
        assert!(
            message.contains("https://example.test/oauth"),
            "the reference url was dropped: {message}"
        );
    }

    /// a 200 with no token in it is not a success, and treating it as one stores an
    /// empty credential that fails at the next call instead of this one.
    #[test]
    fn a_success_status_without_a_token_is_still_a_failure() {
        let error = parse_token_response(200, token_payload(json!({})), 1_700_000_000_000)
            .expect_err("an empty grant was accepted");

        assert!(error.to_string().contains("200"));
    }
}
