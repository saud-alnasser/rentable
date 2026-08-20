//! the picture a Google profile points at, fetched once so nothing has to fetch it again.
//!
//! **The profile answers with a URL, and a URL is not what this application can draw.** It
//! points at `lh3.googleusercontent.com`, so a surface rendering it reaches Google every time
//! it is drawn: nothing appears with no network, the shell tells Google when the application is
//! opened, and the most permanent row in the window changes depending on signal. This
//! application works offline by construction, so the bytes are fetched once, on the sign-in
//! path, and kept.
//!
//! **What is kept is a complete `data:` URL** rather than bytes plus a media type. The one
//! consumer is an `<img>`, the encoding is the only form it takes, and a pair of fields would be
//! two things to keep in step for a value that is only ever used joined.
//!
//! **Nothing here returns an error, and the signature says so.** Every failure has the same
//! consequence: the account keeps no picture and the surface draws initials. A `Result` would
//! offer the caller a decision it does not have, on the path where the only thing that matters
//! is that a sign-in completes.

use std::time::Duration;

use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};

/// how long the picture read may take.
///
/// **Shorter than the profile read's thirty seconds, deliberately.** That read is the sign-in:
/// without it there is no identity and waiting is the only option. This one is decoration on a
/// sidebar row, and it is paid for by somebody watching a consent screen hand back, so its worst
/// case is what it costs them.
const PICTURE_REQUEST_TIMEOUT: Duration = Duration::from_secs(5);

/// the largest picture this application will keep.
///
/// Google's `userinfo` answers with an `=s96-c` URL, which is a 96-pixel square and arrives in
/// single-digit kilobytes. Two orders of magnitude above that is not generosity: it is the
/// distance between the real case and the response that is not the real case, and the cap exists
/// for the second one. It bounds what is buffered as well as what is stored, so a body that
/// never ends is abandoned rather than collected.
const PICTURE_MAX_BYTES: usize = 256 * 1024;

/// what a picture may arrive as.
///
/// An allowlist rather than a check for `image/`, because what this produces is a `data:` URL
/// rendered by a webview: the media type is not a description of the bytes, it is the
/// instruction the webview follows about how to treat them.
const PICTURE_MEDIA_TYPES: [&str; 4] = ["image/png", "image/jpeg", "image/webp", "image/gif"];

/// Fetch the picture at `url`, or answer with nothing.
///
/// The URL is Google's, taken from the profile that was just read. It is fetched without a
/// credential because it is served without one, which is also why this is the one Google request
/// here that is not a `bearer_auth` call.
pub(crate) async fn read_google_picture(url: &str) -> Option<String> {
    let client = crate::http::build_client(PICTURE_REQUEST_TIMEOUT).ok()?;
    let mut response = client.get(url).send().await.ok()?;

    let status = response.status().as_u16();
    let media_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(ToString::to_string);

    // read to the cap rather than reading and then measuring: `bytes()` would collect whatever
    // arrives before anything got to refuse it, which is the wrong order when the point of the
    // cap is a response nobody promised to keep small.
    let mut body = Vec::new();

    while let Some(chunk) = response.chunk().await.ok()? {
        if body.len() + chunk.len() > PICTURE_MAX_BYTES {
            return None;
        }

        body.extend_from_slice(&chunk);
    }

    to_picture(status, media_type.as_deref(), &body)
}

/// What an answer means, decided apart from the request that fetched it.
///
/// The same split `profile.rs` draws, for the same reason: everything decidable is decided here,
/// so what needs a server to exercise is the request rather than the rules.
fn to_picture(status: u16, media_type: Option<&str>, body: &[u8]) -> Option<String> {
    if !(200..300).contains(&status) {
        return None;
    }

    // the header carries parameters, and `image/png; charset=binary` is a real answer, so the
    // type is what precedes the first semicolon, lowercased, and the parameters are not kept.
    let declared = media_type?;
    let media_type = declared
        .split(';')
        .next()
        .unwrap_or(declared)
        .trim()
        .to_ascii_lowercase();

    if !PICTURE_MEDIA_TYPES.contains(&media_type.as_str()) {
        return None;
    }

    if body.is_empty() || body.len() > PICTURE_MAX_BYTES {
        return None;
    }

    Some(format!("data:{media_type};base64,{}", BASE64.encode(body)))
}

#[cfg(test)]
mod tests {
    use super::{PICTURE_MAX_BYTES, read_google_picture, to_picture};
    use crate::sync::google::test::server::{ScriptedResponse, ScriptedServer};

    const PNG: &[u8] = b"\x89PNG\r\n\x1a\n";

    #[test]
    fn a_picture_becomes_the_data_url_a_surface_can_draw() {
        assert_eq!(
            to_picture(200, Some("image/png"), PNG).as_deref(),
            Some("data:image/png;base64,iVBORw0KGgo=")
        );
    }

    /// A media type arrives with its parameters and in whatever case the server felt like.
    #[test]
    fn the_media_type_is_read_without_its_parameters() {
        assert_eq!(
            to_picture(200, Some("IMAGE/PNG; charset=binary"), PNG).as_deref(),
            Some("data:image/png;base64,iVBORw0KGgo=")
        );
    }

    /// **The allowlist is the point, and `image/` as a prefix test is what it refuses to be.**
    ///
    /// What this produces is a `data:` URL handed to a webview, so the media type is an
    /// instruction about how to treat the bytes rather than a description of them. An answer
    /// naming a type nobody asked for is not kept whatever the bytes look like.
    #[test]
    fn only_the_four_picture_types_are_kept() {
        for refused in ["image/svg+xml", "text/html", "application/octet-stream", ""] {
            assert_eq!(
                to_picture(200, Some(refused), PNG),
                None,
                "{refused} should not have been kept"
            );
        }

        assert_eq!(
            to_picture(200, None, PNG),
            None,
            "an answer with no content type says nothing about what it sent"
        );
    }

    #[test]
    fn a_refusal_and_an_empty_answer_are_both_nothing() {
        assert_eq!(to_picture(404, Some("image/png"), PNG), None);
        assert_eq!(to_picture(500, Some("image/png"), PNG), None);
        assert_eq!(to_picture(200, Some("image/png"), b""), None);
    }

    #[test]
    fn a_picture_over_the_cap_is_not_kept() {
        let oversized = vec![0u8; PICTURE_MAX_BYTES + 1];

        assert_eq!(to_picture(200, Some("image/png"), &oversized), None);
    }

    /// The real request, on the wire, against a server that can actually answer it.
    #[tokio::test]
    async fn a_picture_is_fetched_without_a_credential() {
        let server =
            ScriptedServer::start(vec![ScriptedResponse::of(200, "image/png", PNG.to_vec())]).await;

        let picture = read_google_picture(&server.url("/a/amal")).await;

        assert_eq!(
            picture.as_deref(),
            Some("data:image/png;base64,iVBORw0KGgo=")
        );

        let request = server.request(0);

        assert_eq!(request.method, "GET");
        assert_eq!(request.target, "/a/amal");
        assert_eq!(
            request.header("authorization"),
            None,
            "the picture is served without a credential and is asked for without one"
        );
    }

    /// **The failure that matters, because the caller is a sign-in.**
    ///
    /// A connection that dies mid-answer is not an error anybody here can act on, and the whole
    /// reason this function returns an `Option` is that the sign-in above it must not learn about
    /// it. The oversized and refused cases are decided without a server; this one cannot be.
    #[tokio::test]
    async fn a_connection_that_dies_leaves_nothing() {
        let server = ScriptedServer::start(vec![ScriptedResponse::hangup()]).await;

        assert_eq!(read_google_picture(&server.url("/a/amal")).await, None);
    }
}
