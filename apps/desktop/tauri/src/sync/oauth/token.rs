//! the token endpoint: what is sent to it, and how its answer is read.
//!
//! The request itself is not here. Sending it means a client, a timeout and an endpoint, all of
//! which belong to whichever server is being asked; what is decidable without one is decided
//! here, which is the same split `parse_token_response` already had.

use serde::Deserialize;

use crate::error::Error;

use super::super::store::sanitize_optional_string;

/// What a grant yields. `refresh_token` is absent on the refresh grant itself,
/// and `expires_at` is absent where the server states no lifetime. Neither is an
/// error, and neither may overwrite what is already stored.
#[derive(Clone, Debug)]
pub(crate) struct OAuthTokens {
    pub(crate) access_token: String,
    pub(crate) refresh_token: Option<String>,
    pub(crate) expires_at: Option<i64>,
}

/// The token endpoint's body, which carries either a grant or a refusal under
/// the same 200-shaped envelope — so every field is optional and the status
/// alone does not say which arrived.
#[derive(Clone, Debug, Default, Deserialize)]
pub(crate) struct OAuthTokenResponse {
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

/// The form fields exchanging an authorization code for a token set.
///
/// `redirect_uri` and `code_verifier` are replayed rather than re-derived:
/// the authorization server checks both against what the authorization request
/// carried.
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
///
/// It sits beside the grant above rather than with its caller: the two share
/// [`append_client_secret`], and one test covers both.
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
    payload: OAuthTokenResponse,
    now: i64,
) -> Result<OAuthTokens, Error> {
    let access_token = payload
        .access_token
        .as_deref()
        .map(str::trim)
        .filter(|token| !token.is_empty());

    let Some(access_token) = access_token else {
        return Err(token_refusal(status, &payload));
    };

    Ok(OAuthTokens {
        access_token: access_token.to_string(),
        refresh_token: sanitize_optional_string(payload.refresh_token),
        expires_at: payload
            .expires_in
            .map(|seconds| now.saturating_add(seconds.saturating_mul(1_000))),
    })
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
fn token_refusal(status: u16, payload: &OAuthTokenResponse) -> Error {
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
        format!("the token exchange failed ({status})")
    } else {
        format!("the token exchange failed ({status}): {detail}")
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

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use serde_json::json;

    use crate::error::Error;

    use super::{
        OAuthTokenResponse, authorization_code_form, parse_token_response, refresh_token_form,
    };

    fn token_payload(fields: serde_json::Value) -> OAuthTokenResponse {
        serde_json::from_value(fields).expect("failed to build a token payload")
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
