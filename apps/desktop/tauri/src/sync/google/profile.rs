//! who the person who just signed in is, read from Google.
//!
//! **This is the read that used to go through Drive**, and it is the one dependency the
//! sign-in split (#543) could not take with it: `finish_sign_in` asked Drive's own `about`
//! endpoint for the profile, because the scopes were there and the transport was already
//! built. That file said the read "goes when the Drive transport does (#554)", and this is
//! where it went.
//!
//! **The endpoint is OpenID Connect's `userinfo`, which is what the surviving scopes grant.**
//! Read from Google's own discovery document at
//! `https://accounts.google.com/.well-known/openid-configuration` on 2026-08-19 rather than
//! recalled: `userinfo_endpoint` is the constant below, and the document's `claims_supported`
//! carries `sub`, `email`, `name` and `picture` — the four this application reads. The same
//! document confirms the authorization and token endpoints `auth.rs` already names.
//!
//! **`sub` is why this matters beyond replacing a call.** The control-plane API identifies an
//! account by the OpenID `sub` claim (decision 03), and what this application recorded as
//! `provider_user_id` was Drive's `permissionId` — the same person under a different scheme,
//! which is why the boundary in [[contexts/desktop/remote-sync]] warned against copying one
//! into the other. With Drive gone there is one scheme left, and it is the one the API uses.

use std::time::Duration;

use serde::Deserialize;

use crate::error::Error;

/// where the profile is read from. OpenID Connect's `userinfo`, per Google's discovery
/// document.
const GOOGLE_USERINFO_ENDPOINT: &str = "https://openidconnect.googleapis.com/v1/userinfo";

/// how long the profile read may take. The same window `auth.rs` gives the token exchange:
/// both are one request against Google made while a person waits on a screen.
const PROFILE_REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

/// who signed in.
///
/// `subject` is not optional and the rest is: an answer with no `sub` is not an identity, and
/// an account with no display name is somebody whose Google profile carries none.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct GoogleProfile {
    /// the OpenID `sub` claim — stable for one person at one OAuth client, and what the
    /// control plane keys an account by.
    pub subject: String,
    pub email: Option<String>,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
}

/// the documented envelope, and every field optional because a refusal arrives in the same
/// body shape as an answer.
#[derive(Debug, Default, Deserialize)]
struct GoogleUserInfo {
    sub: Option<String>,
    email: Option<String>,
    name: Option<String>,
    picture: Option<String>,
    error: Option<String>,
    error_description: Option<String>,
}

pub(crate) const fn google_userinfo_endpoint() -> &'static str {
    GOOGLE_USERINFO_ENDPOINT
}

/// Read the profile the access token was granted for.
///
/// The endpoint is a parameter for the same reason `request_google_tokens` takes one: it is
/// what lets a test drive the real request against a server that can actually refuse it, which
/// is the reasoning [[rules/credentials]]'s *Transport testing* leaves behind when the transport it
/// described goes.
pub(crate) async fn read_google_profile(
    userinfo_endpoint: &str,
    access_token: &str,
) -> Result<GoogleProfile, Error> {
    let client = crate::http::build_client(PROFILE_REQUEST_TIMEOUT)?;

    let response = client
        .get(userinfo_endpoint)
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|error| Error::Network {
            message: format!("could not reach the google profile endpoint: {error}"),
        })?;

    let status = response.status().as_u16();
    let body = response.text().await.map_err(|error| Error::Network {
        message: format!("the google profile response did not arrive in full: {error}"),
    })?;

    // a body that is not the documented envelope — a proxy's error page, an outage notice —
    // still carries its status, and the status is what says what happened. The same reading
    // `parse_token_response` takes, for the same reason.
    let payload = serde_json::from_str::<GoogleUserInfo>(&body).unwrap_or_default();

    parse_profile(status, payload)
}

/// What an answer means, decided apart from the request that fetched it.
///
/// Everything decidable is decided here, so what stays untested by anything but a live Google
/// is the exchange itself — which is the split `auth.rs` already draws.
fn parse_profile(status: u16, payload: GoogleUserInfo) -> Result<GoogleProfile, Error> {
    if !(200..300).contains(&status) {
        return Err(profile_refusal(status, &payload));
    }

    let subject = payload
        .sub
        .as_deref()
        .map(str::trim)
        .filter(|subject| !subject.is_empty());

    // **An answer with no `sub` fails rather than producing an account.** Every later thing
    // that identifies this person — the control plane's account, and signing in again on
    // another machine — keys on it, so an identity recorded without one is a row that can
    // never be matched to the person it is about.
    let Some(subject) = subject else {
        return Err(Error::PreconditionFailed {
            message: "google answered without an account identifier. sign in again".to_string(),
        });
    };

    Ok(GoogleProfile {
        subject: subject.to_string(),
        email: text(payload.email),
        display_name: text(payload.name),
        avatar_url: text(payload.picture),
    })
}

/// A refusal read back by what the caller would have to do about it, exactly as
/// `token_refusal` does: sign in again, fix the registration, or try later.
fn profile_refusal(status: u16, payload: &GoogleUserInfo) -> Error {
    let detail = [
        payload.error.as_deref(),
        payload.error_description.as_deref(),
    ]
    .into_iter()
    .flatten()
    .map(str::trim)
    .filter(|part| !part.is_empty())
    .collect::<Vec<_>>()
    .join(" — ");

    let message = if detail.is_empty() {
        format!("google profile read failed ({status})")
    } else {
        format!("google profile read failed ({status}): {detail}")
    };

    match status {
        // the token is spent, revoked, or was never granted these scopes. Nothing retries into
        // a working state and the person has to authorize again.
        401 | 403 => Error::PreconditionFailed { message },
        // anything else leaves the caller with nothing to change but the time.
        _ => Error::Network { message },
    }
}

fn text(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

#[cfg(test)]
mod tests {
    use super::{GoogleProfile, GoogleUserInfo, parse_profile, read_google_profile};
    use crate::error::Error;
    use crate::sync::google::test::server::{ScriptedResponse, ScriptedServer};

    fn answered(sub: &str) -> GoogleUserInfo {
        GoogleUserInfo {
            sub: Some(sub.to_string()),
            email: Some("amal@example.com".to_string()),
            name: Some("Amal Nasser".to_string()),
            picture: Some("https://lh3.example.com/a/amal".to_string()),
            error: None,
            error_description: None,
        }
    }

    #[test]
    fn a_profile_is_read_as_the_person_it_describes() {
        assert_eq!(
            parse_profile(200, answered("117420938475")).expect("the profile should read"),
            GoogleProfile {
                subject: "117420938475".to_string(),
                email: Some("amal@example.com".to_string()),
                display_name: Some("Amal Nasser".to_string()),
                avatar_url: Some("https://lh3.example.com/a/amal".to_string()),
            }
        );
    }

    /// **The claim everything downstream keys on, so its absence is a failure and not a blank.**
    ///
    /// An account recorded without a subject can never be matched to the person it is about —
    /// not by the control plane, which identifies an account by exactly this claim, and not by
    /// this machine signing the same person in again.
    #[test]
    fn an_answer_without_a_subject_is_not_an_identity() {
        let mut answer = answered("");
        answer.sub = None;

        assert!(matches!(
            parse_profile(200, answer),
            Err(Error::PreconditionFailed { .. })
        ));

        assert!(
            matches!(
                parse_profile(200, answered("   ")),
                Err(Error::PreconditionFailed { .. })
            ),
            "a blank subject is the same absence with whitespace in it"
        );
    }

    /// A refused read is what the caller has to act on, and the two acts are different: reauthorize,
    /// or wait.
    #[test]
    fn a_refusal_says_which_kind_it_is() {
        for status in [401, 403] {
            assert!(
                matches!(
                    parse_profile(status, GoogleUserInfo::default()),
                    Err(Error::PreconditionFailed { .. })
                ),
                "{status} should ask the person to authorize again"
            );
        }

        assert!(matches!(
            parse_profile(500, GoogleUserInfo::default()),
            Err(Error::Network { .. })
        ));
    }

    /// The real request, on the wire, against a server that can actually refuse it.
    ///
    /// This is what [[rules/credentials]]'s *Transport testing* was for, applied to the one request
    /// that outlived the transport: a mocked client would assert against the description of a
    /// request rather than the request, and the bearer header is exactly the part that breaks.
    #[tokio::test]
    async fn the_profile_request_carries_the_token_as_a_bearer_credential() {
        let server = ScriptedServer::start(vec![ScriptedResponse::new(
            200,
            br#"{"sub":"117420938475","email":"amal@example.com","name":"Amal Nasser","picture":"https://lh3.example.com/a/amal"}"#.to_vec(),
        )])
        .await;

        let profile = read_google_profile(&server.url("/v1/userinfo"), "ya29.the-access-token")
            .await
            .expect("the profile read failed");

        assert_eq!(profile.subject, "117420938475");
        assert_eq!(profile.display_name.as_deref(), Some("Amal Nasser"));

        let request = server.request(0);

        assert_eq!(request.method, "GET");
        assert_eq!(request.target, "/v1/userinfo");
        assert_eq!(
            request.header("authorization"),
            Some("Bearer ya29.the-access-token")
        );
        assert_eq!(server.request_count(), 1, "the profile was read more than once");
    }
}
