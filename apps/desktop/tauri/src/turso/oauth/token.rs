//! the token endpoint: what is sent to it, and how its answer is read.
//!
//! The request itself is not here. Sending it means a client, a timeout and an endpoint, all of
//! which belong to whichever server is being asked; what is decidable without one is decided
//! here, which is the same split `parse_token_response` already had.

use serde::Deserialize;

use crate::error::{Error, RefusalReason};

/// What a grant yields: the access token, and only that. The one authorization server this
/// application asks, Turso's, issues a token with no expiry and no refresh, so a refresh token or
/// a lifetime in the answer is left unread rather than carried for nobody.
#[derive(Clone, Debug)]
pub(crate) struct OAuthTokens {
    pub(crate) access_token: String,
}

/// The token endpoint's body, which carries either a grant or a refusal under
/// the same 200-shaped envelope — so every field is optional and the status
/// alone does not say which arrived.
#[derive(Clone, Debug, Default, Deserialize)]
pub(crate) struct OAuthTokenResponse {
    #[serde(default)]
    pub(crate) access_token: Option<String>,
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
///
/// `provider_parameters` are whatever the server being asked defines on top of
/// RFC 6749 and RFC 7636, and they are the caller's for the reason
/// [`build_authorization_url`]'s are: they are the one part of a grant that is
/// not the protocol. RFC 8707's `resource` is the case that put this hook here.
/// An authorization server that requires a resource indicator requires it on
/// both requests, and a value baked in at this level would be one provider's
/// audience sent to every other provider's token endpoint.
///
/// [`build_authorization_url`]: super::authorization::build_authorization_url
pub(crate) fn authorization_code_form(
    client_id: &str,
    client_secret: Option<&str>,
    redirect_uri: &str,
    code_verifier: &str,
    code: &str,
    provider_parameters: &[(&str, &str)],
) -> Vec<(String, String)> {
    let mut form = vec![
        ("client_id".to_string(), client_id.to_string()),
        ("redirect_uri".to_string(), redirect_uri.to_string()),
        ("grant_type".to_string(), "authorization_code".to_string()),
        ("code_verifier".to_string(), code_verifier.to_string()),
        ("code".to_string(), code.to_string()),
    ];

    append_client_secret(&mut form, client_secret);

    for (name, value) in provider_parameters {
        form.push(((*name).to_string(), (*value).to_string()));
    }

    form
}

/// A token endpoint response read as either a grant or a refusal.
pub(crate) fn parse_token_response(
    status: u16,
    payload: OAuthTokenResponse,
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
        Some("invalid_grant") => Error::refused(RefusalReason::ConsentNeededAgain, message),
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

    use super::{OAuthTokenResponse, authorization_code_form, parse_token_response};

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
            &[],
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

    /// a public client is issued its id without a secret, and sending an empty one is a
    /// rejected request rather than an ignored field.
    #[test]
    fn a_grant_omits_the_client_secret_when_there_is_none_configured() {
        let form = authorization_code_form(
            "client-id",
            None,
            "http://127.0.0.1/callback",
            "v",
            "c",
            &[],
        );

        assert!(
            !form.iter().any(|(key, _)| key == "client_secret"),
            "an unconfigured client secret still reached the request: {form:?}"
        );
    }

    /// **the grant carries nothing a provider did not ask for**, which is what makes this
    /// form usable by a second authorization server. A `resource` sent to a server that never
    /// asked for one would be an audience that server has never defined.
    #[test]
    fn a_grant_that_asks_for_no_provider_parameters_carries_none() {
        let names = authorization_code_form(
            "client-id",
            None,
            "http://127.0.0.1:5173/callback",
            "the-verifier",
            "the-code",
            &[],
        )
        .into_iter()
        .map(|(key, _)| key)
        .collect::<Vec<_>>();

        assert_eq!(
            names,
            vec![
                "client_id",
                "redirect_uri",
                "grant_type",
                "code_verifier",
                "code",
            ],
            "the neutral form grew a field nobody asked for"
        );
    }

    /// RFC 8707's resource indicator is the case this hook exists for, and it rides on the
    /// grant as well as on the authorization request.
    #[test]
    fn the_provider_parameters_a_caller_gives_reach_the_grant() {
        let form = authorization_code_form(
            "client-id",
            None,
            "http://127.0.0.1:5173/callback",
            "the-verifier",
            "the-code",
            &[("resource", "https://mcp.example.test/mcp")],
        )
        .into_iter()
        .collect::<HashMap<_, _>>();

        assert_eq!(
            form.get("resource").map(String::as_str),
            Some("https://mcp.example.test/mcp")
        );
    }

    /// a refresh token and a lifetime in the answer are not a malformed grant: they are read
    /// past, and the access token is what comes back.
    #[test]
    fn a_grant_is_read_for_its_access_token() {
        let tokens = parse_token_response(
            200,
            token_payload(json!({
                "access_token": "the-access-token",
                "refresh_token": "the-refresh-token",
                "expires_in": 3599,
            })),
        )
        .expect("a well-formed grant was rejected");

        assert_eq!(tokens.access_token, "the-access-token");
    }

    /// a spent or revoked grant is the one refusal the caller can act on: it means
    /// relink, and nothing about retrying will change it.
    #[test]
    fn a_dead_grant_is_refused_as_a_consent_needed_again() {
        let error = parse_token_response(
            400,
            token_payload(json!({
                "error": "invalid_grant",
                "error_description": "Token has been expired or revoked.",
            })),
        )
        .expect_err("a dead grant was accepted");

        assert!(matches!(
            error,
            Error::Refused {
                reason: crate::error::RefusalReason::ConsentNeededAgain,
                ..
            }
        ));
        assert!(
            error
                .to_string()
                .contains("Token has been expired or revoked."),
            "the server's own description was dropped: {error}"
        );
    }

    #[test]
    fn any_other_refusal_keeps_the_servers_reported_detail() {
        let error = parse_token_response(
            401,
            token_payload(json!({
                "error": "invalid_client",
                "error_description": "The OAuth client was not found.",
                "error_uri": "https://example.test/oauth",
            })),
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
        let error = parse_token_response(200, token_payload(json!({})))
            .expect_err("an empty grant was accepted");

        assert!(error.to_string().contains("200"));
    }
}
