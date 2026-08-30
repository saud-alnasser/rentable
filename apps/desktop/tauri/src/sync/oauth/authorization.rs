//! the authorization request: the URL a browser is sent to for a consent.

use url::Url;

use crate::error::Error;

use super::OAuthConfig;

/// The authorization URL for one attempt at a consent.
///
/// `redirect_uri` must be the loopback address the callback server is actually
/// listening on: the authorization server matches it against the one replayed at
/// the code exchange, and a mismatch is rejected there rather than here.
///
/// `provider_parameters` are whatever the server being asked defines on top of
/// RFC 6749 and RFC 7636. They are the caller's because they are the one thing in
/// an authorization request that is not the protocol: `access_type` and
/// `include_granted_scopes` are Google's own spelling and mean nothing anywhere
/// else, so a request built here with them baked in would send Google's
/// vocabulary to every other authorization server. Everything above them is in
/// one RFC or the other and is added for every caller.
pub(crate) fn build_authorization_url(
    config: &OAuthConfig,
    client_id: &str,
    redirect_uri: &str,
    state: &str,
    code_challenge: &str,
    provider_parameters: &[(&str, &str)],
) -> Result<String, Error> {
    let mut url = Url::parse(&config.authorize_endpoint).map_err(|error| Error::Internal {
        message: format!("the authorize endpoint is not a url: {error}"),
    })?;

    let mut query = url.query_pairs_mut();

    query
        .clear()
        .append_pair("client_id", client_id)
        .append_pair("redirect_uri", redirect_uri)
        .append_pair("response_type", "code")
        .append_pair("scope", &config.scopes.join(" "))
        .append_pair("state", state)
        .append_pair("code_challenge", code_challenge)
        .append_pair("code_challenge_method", "S256");

    for (name, value) in provider_parameters {
        query.append_pair(name, value);
    }

    drop(query);

    Ok(url.to_string())
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use super::{OAuthConfig, build_authorization_url};

    fn oauth_config() -> OAuthConfig {
        OAuthConfig {
            client_id: Some("client-id".to_string()),
            client_secret: Some("client-secret".to_string()),
            authorize_endpoint: "https://accounts.google.com/o/oauth2/v2/auth".to_string(),
            token_endpoint: "https://oauth2.googleapis.com/token".to_string(),
            scopes: vec!["openid".to_string(), "email".to_string()],
        }
    }

    /// what the two RFCs require, which is what every caller gets without asking.
    #[test]
    fn the_authorization_url_carries_every_parameter_the_protocol_requires() {
        let url = build_authorization_url(
            &oauth_config(),
            "client-id",
            "http://127.0.0.1:5173/callback",
            "the-state",
            "the-challenge",
            &[],
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

    /// **Nothing a provider defines is added on its own**, which is the whole of what
    /// makes this builder usable by a second authorization server. Google's three
    /// parameters lived here until a second caller arrived, and a Turso consent
    /// carrying `access_type=offline` would be sending Google's vocabulary to an
    /// endpoint that has never defined it.
    #[test]
    fn a_caller_that_asks_for_no_provider_parameters_is_sent_none() {
        let url = build_authorization_url(
            &oauth_config(),
            "client-id",
            "http://127.0.0.1:5173/callback",
            "the-state",
            "the-challenge",
            &[],
        )
        .expect("failed to build the authorization url");
        let parsed = url::Url::parse(&url).expect("the authorization url did not parse");
        let names = parsed
            .query_pairs()
            .map(|(key, _)| key.into_owned())
            .collect::<Vec<_>>();

        assert_eq!(
            names,
            vec![
                "client_id",
                "redirect_uri",
                "response_type",
                "scope",
                "state",
                "code_challenge",
                "code_challenge_method",
            ],
            "the neutral builder added a parameter nobody asked for: {url}"
        );
    }

    #[test]
    fn the_provider_parameters_a_caller_gives_are_appended_in_order() {
        let url = build_authorization_url(
            &oauth_config(),
            "client-id",
            "http://127.0.0.1:5173/callback",
            "the-state",
            "the-challenge",
            &[("access_type", "offline"), ("prompt", "consent")],
        )
        .expect("failed to build the authorization url");
        let parsed = url::Url::parse(&url).expect("the authorization url did not parse");
        let parameters = parsed
            .query_pairs()
            .map(|(key, value)| (key.into_owned(), value.into_owned()))
            .collect::<HashMap<_, _>>();

        assert_eq!(
            parameters.get("access_type").map(String::as_str),
            Some("offline")
        );
        assert_eq!(
            parameters.get("prompt").map(String::as_str),
            Some("consent")
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
            &[],
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
}
