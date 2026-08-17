//! the transfer surface: how a Drive request is issued, and the push, pull, and
//! fingerprint shapes it carries. Authentication is attached here, so an access
//! token reaches the network without passing through the web layer. Reading what
//! a refusal means is here too, so one seam decides it. Which requests exist is
//! [`super::files`]'s, and what Drive said about a file is
//! [`super::metadata`]'s.

use std::time::Duration;

use reqwest::Method;
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};

use crate::backup::BackupSource;
use crate::error::Error;

pub(crate) const GOOGLE_DRIVE_API_BASE_URL: &str = "https://www.googleapis.com/drive/v3";

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleDrivePreparedPush {
    pub workspace_id: String,
    pub account_id: String,
    pub filename: String,
    pub created_at: i64,
    pub source: BackupSource,
    pub app_version: String,
    pub contents_base64: String,
    pub content_hash: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleDrivePreparePushInput {
    #[serde(default)]
    pub manual: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleDriveLocalFingerprint {
    pub content_hash: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleDriveSyncCompleteInput {
    pub workspace_id: String,
    pub workspace_name: Option<String>,
    pub account_id: String,
    pub remote_folder_id: String,
    pub remote_manifest_file_id: String,
    pub remote_head_file_id: String,
    pub remote_head_revision: String,
    pub remote_updated_at: i64,
    pub drive_quota_bytes: Option<i64>,
    pub drive_usage_bytes: Option<i64>,
    pub app_usage_bytes: Option<i64>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleDriveApplyPullInput {
    pub workspace_id: String,
    pub workspace_name: Option<String>,
    pub account_id: String,
    pub filename: String,
    pub app_version: String,
    pub contents_base64: String,
    pub content_hash: Option<String>,
    pub remote_folder_id: String,
    pub remote_manifest_file_id: String,
    pub remote_head_file_id: String,
    pub remote_head_revision: String,
    pub remote_updated_at: i64,
    pub drive_quota_bytes: Option<i64>,
    pub drive_usage_bytes: Option<i64>,
    pub app_usage_bytes: Option<i64>,
}

/// how long one attempt may take before it is abandoned. Generous because a
/// snapshot upload is measured in megabytes over whatever connection the user
/// has, and a timeout that fires mid-upload costs the whole transfer.
const DRIVE_REQUEST_TIMEOUT: Duration = Duration::from_secs(60);

/// the sentences Drive refuses with when a file exists but was never granted to
/// this application. Read by [`DriveResponse::file_access_was_denied`], which
/// carries why prose is being matched at all.
const FILE_ACCESS_DENIED_PHRASES: [&str; 5] = [
    "not granted the app",
    "read access to the file",
    "insufficient file permissions",
    "does not have sufficient permissions",
    "app is not authorized to access this file",
];

/// the status codes worth issuing again. Each one says the request was well
/// formed and could not be served *now* — nothing about it would be different
/// if the caller changed something.
const RETRYABLE_STATUSES: [u16; 5] = [429, 500, 502, 503, 504];

/// how a refusal that might clear on its own is waited out.
///
/// Held as a value rather than compiled in so a test can drive the same
/// decision table without sleeping for real.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct DriveRetryPolicy {
    /// how many times a request is issued in total, the first attempt
    /// included. One means never retry.
    pub attempts: u32,
    pub base_delay: Duration,
    /// the ceiling on any single wait, including one the remote asked for. A
    /// `Retry-After` of an hour is not a reason to hang the application.
    pub max_delay: Duration,
}

impl Default for DriveRetryPolicy {
    fn default() -> Self {
        Self {
            attempts: 3,
            base_delay: Duration::from_millis(500),
            max_delay: Duration::from_secs(8),
        }
    }
}

/// whether replaying this method can create a second thing on the remote.
///
/// `POST` is the one that can: Drive creates a file by `POST`, so a request
/// that succeeded and whose response was lost would upload the snapshot twice,
/// and a duplicate is a fault this application cannot see happen. `PATCH`
/// always names an existing file id here, so replaying it overwrites rather
/// than creates — which is why it sits with the safe methods rather than where
/// the general reading of the verb would put it.
fn replay_is_safe(method: &Method) -> bool {
    matches!(*method, Method::GET | Method::DELETE | Method::PATCH)
}

/// whether a refused response is worth issuing again. Both halves have to
/// hold: the status must be one that can succeed unchanged, and replaying the
/// method must not create anything.
pub fn is_retryable(method: &Method, status: u16) -> bool {
    replay_is_safe(method) && RETRYABLE_STATUSES.contains(&status)
}

/// how long to wait after `attempt` has been refused, where the first attempt
/// is 1. The remote's own `Retry-After` wins when it sent one, because it knows
/// when its rate window reopens and the doubling here is only a guess at it.
///
/// No jitter. Jitter exists to stop a fleet of clients retrying in lockstep,
/// and this is one desktop application talking to its own user's Drive — there
/// is no herd to disperse, and a deterministic delay is one a test can assert.
pub fn retry_delay(
    policy: &DriveRetryPolicy,
    attempt: u32,
    retry_after: Option<Duration>,
) -> Duration {
    let requested = retry_after.unwrap_or_else(|| {
        let doubling = 1u32
            .checked_shl(attempt.saturating_sub(1))
            .unwrap_or(u32::MAX);

        policy.base_delay.saturating_mul(doubling)
    });

    requested.min(policy.max_delay)
}

/// `Retry-After` in the delta-seconds form Google sends.
///
/// The HTTP-date form is legal and deliberately unhandled: reading it needs a
/// trusted clock, and falling through to the computed backoff is a correct
/// answer for it anyway.
pub fn parse_retry_after(value: &str) -> Option<Duration> {
    value.trim().parse::<u64>().ok().map(Duration::from_secs)
}

/// the error envelope Drive refuses with. Both shapes appear and neither field
/// is required.
#[derive(Debug, Default, Deserialize)]
struct DriveErrorEnvelope {
    /// the Drive API nests a message under here; the OAuth-flavoured endpoints
    /// put a bare code string in the same field. Left untyped so the second
    /// shape does not make the whole envelope unreadable.
    #[serde(default)]
    error: Option<serde_json::Value>,
    #[serde(default)]
    error_description: Option<String>,
}

/// the sentence the remote gave, or the status where it gave none. Each
/// candidate is discarded before the next is tried, so an envelope carrying an
/// empty `message` beside a real `error_description` reports the description
/// rather than falling all the way through to the status.
fn read_drive_error_message(status: u16, body: &str) -> String {
    let envelope = serde_json::from_str::<DriveErrorEnvelope>(body).unwrap_or_default();
    let nested = envelope
        .error
        .as_ref()
        .and_then(|error| error.get("message"))
        .and_then(serde_json::Value::as_str)
        .map(str::to_string);

    [nested, envelope.error_description]
        .into_iter()
        .flatten()
        .map(|message| message.trim().to_string())
        .find(|message| !message.is_empty())
        .unwrap_or_else(|| format!("google drive refused the request ({status})"))
}

/// a refused Drive response as the typed error a caller branches on, chosen by
/// what the caller would have to do about it.
pub fn drive_error(status: u16, body: &str) -> Error {
    let message = read_drive_error_message(status, body);

    match status {
        // the request itself is malformed, or names something Drive will not
        // accept. Issuing it again unchanged cannot help.
        400 | 413 | 422 => Error::InvalidInput { message },
        // the access token is dead or was refused, so the account has to be
        // linked again — the same answer a spent refresh grant gives.
        401 => Error::PreconditionFailed { message },
        // authenticated, and still not allowed: a file owned by someone else,
        // or a Drive quota that is full.
        403 => Error::Forbidden { message },
        404 => Error::NotFound { message },
        // what the caller believed about the remote file is not what the
        // remote holds — the same disagreement a failed content hash reports,
        // reached from the other direction.
        409 | 412 => Error::Integrity { message },
        // rate limited, unwell, or unrecognised. By the time this is reached
        // any retry is already spent, and nothing is left to change but when.
        _ => Error::Network { message },
    }
}

/// what a request carries beyond its URL. Absent for a read or a delete.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum DriveRequestBody {
    /// a JSON document, sent as `application/json`.
    Json(Vec<u8>),
    /// a `multipart/related` upload. The boundary is part of the content type
    /// as well as of the body, and the two have to agree or Drive reads the
    /// whole upload as a single undelimited part.
    Multipart { boundary: String, body: Vec<u8> },
}

/// one Drive request, described completely enough to be issued again.
#[derive(Clone, Debug)]
pub struct DriveRequest {
    pub method: Method,
    pub url: String,
    pub body: Option<DriveRequestBody>,
}

impl DriveRequest {
    pub fn get(url: impl Into<String>) -> Self {
        Self {
            method: Method::GET,
            url: url.into(),
            body: None,
        }
    }

    pub fn delete(url: impl Into<String>) -> Self {
        Self {
            method: Method::DELETE,
            url: url.into(),
            body: None,
        }
    }

    pub fn json(method: Method, url: impl Into<String>, body: Vec<u8>) -> Self {
        Self {
            method,
            url: url.into(),
            body: Some(DriveRequestBody::Json(body)),
        }
    }

    pub fn multipart(
        method: Method,
        url: impl Into<String>,
        boundary: impl Into<String>,
        body: Vec<u8>,
    ) -> Self {
        Self {
            method,
            url: url.into(),
            body: Some(DriveRequestBody::Multipart {
                boundary: boundary.into(),
                body,
            }),
        }
    }
}

/// what the remote answered, whatever it answered. A refusal is a response
/// here rather than an error, because a caller that treats one status
/// specially — a missing file read as absent rather than as a failure — has to
/// see it before it is mapped.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DriveResponse {
    pub status: u16,
    pub body: Vec<u8>,
}

impl DriveResponse {
    pub fn is_success(&self) -> bool {
        (200..300).contains(&self.status)
    }

    /// whether this refusal is Drive saying the file is there but was never
    /// this application's to read.
    ///
    /// Meaningful only on a 403, and the caller checks that: Drive refuses
    /// "you may not" and "this app was never granted this file" with the same
    /// status and no machine-readable reason, so the sentence is the only thing
    /// that separates them. Reading prose is a poor test and it is the one
    /// available — treating every 403 as fatal turns a scope change into a
    /// failed sync, and treating every 403 as absent hides a real permission
    /// failure behind a duplicate folder.
    pub fn file_access_was_denied(&self) -> bool {
        let message = read_drive_error_message(self.status, &String::from_utf8_lossy(&self.body))
            .to_ascii_lowercase();

        FILE_ACCESS_DENIED_PHRASES
            .iter()
            .any(|phrase| message.contains(phrase))
    }

    /// the body of a response that succeeded, or the typed error its refusal
    /// maps to.
    pub fn into_success(self) -> Result<Vec<u8>, Error> {
        if self.is_success() {
            return Ok(self.body);
        }

        Err(drive_error(
            self.status,
            &String::from_utf8_lossy(&self.body),
        ))
    }
}

/// what one attempt produced, and whether waiting is worth it.
enum Attempt {
    /// the remote answered, and that answer is final.
    Settled(DriveResponse),
    /// worth issuing again after this long.
    Retry(Duration),
    Failed(Error),
}

/// the authenticated HTTP client for Drive. Every Drive request leaves through
/// here, which is what keeps the access token on this side of the IPC boundary.
pub struct DriveTransport {
    client: reqwest::Client,
    retry: DriveRetryPolicy,
}

impl DriveTransport {
    pub fn new() -> Result<Self, Error> {
        Self::with_retry_policy(DriveRetryPolicy::default())
    }

    pub fn with_retry_policy(retry: DriveRetryPolicy) -> Result<Self, Error> {
        Ok(Self {
            client: crate::http::build_client(DRIVE_REQUEST_TIMEOUT)?,
            retry,
        })
    }

    /// issue the request, waiting out a refusal that might clear on its own,
    /// and answer with whatever the remote finally said.
    ///
    /// Fails only where no answer was obtained at all — the connection never
    /// formed, or it dropped before the body was complete.
    pub async fn send(
        &self,
        access_token: &str,
        request: &DriveRequest,
    ) -> Result<DriveResponse, Error> {
        let mut attempt = 1;

        loop {
            match self.attempt(access_token, request, attempt).await {
                Attempt::Settled(response) => return Ok(response),
                Attempt::Failed(error) => return Err(error),
                Attempt::Retry(delay) => {
                    tokio::time::sleep(delay).await;
                    attempt += 1;
                }
            }
        }
    }

    /// issue the request and read a successful body as `T`.
    pub async fn send_json<T: DeserializeOwned>(
        &self,
        access_token: &str,
        request: &DriveRequest,
    ) -> Result<T, Error> {
        let body = self.send(access_token, request).await?.into_success()?;

        serde_json::from_slice(&body).map_err(|error| Error::Integrity {
            message: format!("google drive sent a response this app could not read: {error}"),
        })
    }

    /// issue the request once and decide what that answer is worth.
    async fn attempt(&self, access_token: &str, request: &DriveRequest, attempt: u32) -> Attempt {
        let last = attempt >= self.retry.attempts;

        match self.issue(access_token, request).await {
            Ok(issued) if last || !is_retryable(&request.method, issued.response.status) => {
                Attempt::Settled(issued.response)
            }
            Ok(issued) => Attempt::Retry(retry_delay(&self.retry, attempt, issued.retry_after)),
            // no answer at all. There is nothing to read a wait out of, so the
            // computed backoff is all there is — and replaying is only safe
            // where a request that did arrive could not have created anything.
            Err(error) if last || !replay_is_safe(&request.method) => Attempt::Failed(error),
            Err(_) => Attempt::Retry(retry_delay(&self.retry, attempt, None)),
        }
    }

    async fn issue(
        &self,
        access_token: &str,
        request: &DriveRequest,
    ) -> Result<IssuedResponse, Error> {
        let builder = self
            .client
            .request(request.method.clone(), &request.url)
            .bearer_auth(access_token);

        let builder = match &request.body {
            None => builder,
            Some(DriveRequestBody::Json(body)) => builder
                .header("content-type", "application/json; charset=UTF-8")
                .body(body.clone()),
            Some(DriveRequestBody::Multipart { boundary, body }) => builder
                .header(
                    "content-type",
                    format!("multipart/related; boundary={boundary}"),
                )
                .body(body.clone()),
        };

        let response = builder.send().await.map_err(|error| Error::Network {
            message: format!("could not reach google drive: {error}"),
        })?;

        let status = response.status().as_u16();
        let retry_after = response
            .headers()
            .get("retry-after")
            .and_then(|value| value.to_str().ok())
            .and_then(parse_retry_after);

        let body = response.bytes().await.map_err(|error| Error::Network {
            message: format!("the google drive response did not arrive in full: {error}"),
        })?;

        Ok(IssuedResponse {
            response: DriveResponse {
                status,
                body: body.to_vec(),
            },
            retry_after,
        })
    }
}

struct IssuedResponse {
    response: DriveResponse,
    retry_after: Option<Duration>,
}

#[cfg(test)]
mod tests {
    use std::time::{Duration, Instant};

    use reqwest::Method;
    use serde_json::json;

    use super::{
        DriveRequest, DriveResponse, DriveRetryPolicy, DriveTransport, drive_error, is_retryable,
        parse_retry_after, retry_delay,
    };
    use crate::{
        error::Error,
        sync::google::{
            metadata::DriveFile,
            test::server::{ScriptedResponse, TestDriveServer},
        },
    };
    /// a policy that retries as production does but waits in milliseconds, so a
    /// test asserting that backoff happened does not pay seconds for the answer.
    fn fast_retry_policy(attempts: u32) -> DriveRetryPolicy {
        DriveRetryPolicy {
            attempts,
            base_delay: Duration::from_millis(150),
            max_delay: Duration::from_millis(600),
        }
    }

    fn transport(attempts: u32) -> DriveTransport {
        DriveTransport::with_retry_policy(fast_retry_policy(attempts))
            .expect("failed to build the drive transport")
    }

    fn json_response(status: u16, body: serde_json::Value) -> ScriptedResponse {
        ScriptedResponse::new(status, body.to_string())
    }
    #[test]
    fn a_status_that_cannot_succeed_unchanged_is_not_retried() {
        for status in [400, 401, 403, 404, 409, 412, 418, 200] {
            assert!(
                !is_retryable(&Method::GET, status),
                "{status} was treated as worth issuing again"
            );
        }
    }

    #[test]
    fn rate_limiting_and_a_sick_server_are_retried_on_replay_safe_methods() {
        for status in [429, 500, 502, 503, 504] {
            for method in [Method::GET, Method::DELETE, Method::PATCH] {
                assert!(
                    is_retryable(&method, status),
                    "{method} {status} was given up on"
                );
            }
        }
    }

    /// the rule that stops a lost response becoming a second snapshot in the
    /// user's Drive: a create is a POST, and a POST is never issued twice.
    #[test]
    fn a_post_is_never_retried_however_the_remote_refused() {
        for status in [429, 500, 502, 503, 504] {
            assert!(
                !is_retryable(&Method::POST, status),
                "a post was replayed after {status}"
            );
        }
    }

    #[test]
    fn the_wait_doubles_with_each_refusal_and_stops_at_the_ceiling() {
        let policy = DriveRetryPolicy {
            attempts: 6,
            base_delay: Duration::from_millis(500),
            max_delay: Duration::from_secs(2),
        };

        assert_eq!(retry_delay(&policy, 1, None), Duration::from_millis(500));
        assert_eq!(retry_delay(&policy, 2, None), Duration::from_secs(1));
        assert_eq!(retry_delay(&policy, 3, None), Duration::from_secs(2));
        assert_eq!(
            retry_delay(&policy, 4, None),
            Duration::from_secs(2),
            "the doubling ran past the ceiling"
        );
        assert_eq!(
            retry_delay(&policy, 60, None),
            Duration::from_secs(2),
            "a large attempt count overflowed instead of capping"
        );
    }

    #[test]
    fn the_remotes_own_retry_after_wins_over_the_computed_wait() {
        let policy = DriveRetryPolicy {
            attempts: 3,
            base_delay: Duration::from_millis(500),
            max_delay: Duration::from_secs(30),
        };

        assert_eq!(
            retry_delay(&policy, 1, Some(Duration::from_secs(7))),
            Duration::from_secs(7)
        );
    }

    /// a remote asking for an hour is not a reason to hang the application; the
    /// ceiling applies to what it asked for as much as to what we computed.
    #[test]
    fn a_retry_after_beyond_the_ceiling_is_capped() {
        let policy = DriveRetryPolicy {
            attempts: 3,
            base_delay: Duration::from_millis(500),
            max_delay: Duration::from_secs(8),
        };

        assert_eq!(
            retry_delay(&policy, 1, Some(Duration::from_secs(3600))),
            Duration::from_secs(8)
        );
    }

    #[test]
    fn retry_after_is_read_in_the_delta_seconds_form() {
        assert_eq!(parse_retry_after("30"), Some(Duration::from_secs(30)));
        assert_eq!(parse_retry_after("  12 "), Some(Duration::from_secs(12)));
        assert_eq!(parse_retry_after("0"), Some(Duration::ZERO));
    }

    /// the http-date form is legal and deliberately unread — falling through to
    /// the computed backoff is a correct answer for it.
    #[test]
    fn a_retry_after_that_is_not_a_count_of_seconds_is_ignored() {
        assert_eq!(parse_retry_after("Wed, 21 Oct 2015 07:28:00 GMT"), None);
        assert_eq!(parse_retry_after(""), None);
        assert_eq!(parse_retry_after("soon"), None);
        assert_eq!(parse_retry_after("-5"), None);
    }

    #[test]
    fn each_refusal_category_maps_onto_its_own_error() {
        let body = json!({ "error": { "message": "the remote said why" } }).to_string();

        let expected = [
            (400, "invalidInput"),
            (413, "invalidInput"),
            (422, "invalidInput"),
            (401, "preconditionFailed"),
            (403, "forbidden"),
            (404, "notFound"),
            (409, "integrity"),
            (412, "integrity"),
            (429, "network"),
            (500, "network"),
            (503, "network"),
        ];

        for (status, code) in expected {
            let error = drive_error(status, &body);
            let wire = serde_json::to_value(&error).expect("failed to serialize the error");

            assert_eq!(
                wire,
                json!({ "code": code, "message": "the remote said why" }),
                "unexpected mapping for {status}"
            );
        }
    }

    #[test]
    fn a_refusal_message_is_read_from_either_envelope_google_uses() {
        assert_eq!(
            drive_error(
                404,
                &json!({ "error": { "message": "File not found: abc." } }).to_string()
            )
            .to_string(),
            "File not found: abc."
        );
        assert_eq!(
            drive_error(
                400,
                &json!({ "error": "invalid_request", "error_description": "missing parameter" })
                    .to_string()
            )
            .to_string(),
            "missing parameter"
        );
    }

    /// a proxy's html error page carries no message, and the status is then the
    /// only thing that says anything at all — so it has to survive into the text.
    #[test]
    fn a_body_that_is_not_an_envelope_still_reports_the_status() {
        for body in ["<html>502 Bad Gateway</html>", "", "{}", r#"{"error":{}}"#] {
            let message = drive_error(502, body).to_string();

            assert!(
                message.contains("502"),
                "the status was lost for body {body:?}: {message}"
            );
        }
    }

    #[test]
    fn a_successful_response_yields_its_body_and_a_refusal_yields_its_error() {
        let success = DriveResponse {
            status: 200,
            body: b"the payload".to_vec(),
        };

        assert_eq!(success.into_success(), Ok(b"the payload".to_vec()));

        let refusal = DriveResponse {
            status: 404,
            body: json!({ "error": { "message": "gone" } })
                .to_string()
                .into_bytes(),
        };

        assert_eq!(
            refusal.into_success(),
            Err(Error::NotFound {
                message: "gone".to_string()
            })
        );
    }

    #[tokio::test]
    async fn a_request_carries_the_access_token_as_a_bearer_credential() {
        let server = TestDriveServer::start(vec![json_response(
            200,
            json!({ "id": "file-1", "name": "snapshot.db" }),
        )])
        .await;

        let file: DriveFile = transport(1)
            .send_json(
                "ya29.the-access-token",
                &DriveRequest::get(server.url("/files/file-1")),
            )
            .await
            .expect("the request failed");

        assert_eq!(file.id, "file-1");
        assert_eq!(server.request_count(), 1);

        let request = server.request(0);

        assert_eq!(request.method, "GET");
        assert_eq!(request.target, "/files/file-1");
        assert_eq!(
            request.header("authorization"),
            Some("Bearer ya29.the-access-token")
        );
        assert!(request.body.is_empty(), "a read sent a body");
    }

    #[tokio::test]
    async fn a_json_request_declares_its_content_type_and_sends_its_document() {
        let server = TestDriveServer::start(vec![json_response(
            200,
            json!({ "id": "folder-1", "name": "rentable" }),
        )])
        .await;
        let document =
            json!({ "name": "rentable", "mimeType": "application/vnd.google-apps.folder" });

        let created: DriveFile = transport(1)
            .send_json(
                "token",
                &DriveRequest::json(
                    Method::POST,
                    server.url("/files"),
                    document.to_string().into_bytes(),
                ),
            )
            .await
            .expect("the request failed");

        assert_eq!(created.id, "folder-1");

        let request = server.request(0);

        assert_eq!(request.method, "POST");
        assert_eq!(
            request.header("content-type"),
            Some("application/json; charset=UTF-8")
        );
        assert_eq!(request.body_as_text(), document.to_string());
    }

    /// the boundary in the content type and the one delimiting the parts are one
    /// value; where they disagree Drive reads the whole upload as a single part.
    #[tokio::test]
    async fn a_multipart_upload_declares_the_boundary_its_body_uses() {
        let server = TestDriveServer::start(vec![json_response(
            200,
            json!({ "id": "snapshot-1", "name": "snapshot.db" }),
        )])
        .await;
        let boundary = "rentable-0d1c2b3a";
        let body = format!("--{boundary}\r\n\r\n{{}}\r\n--{boundary}--");

        let uploaded: DriveFile = transport(1)
            .send_json(
                "token",
                &DriveRequest::multipart(
                    Method::PATCH,
                    server.url("/upload/files/snapshot-1?uploadType=multipart"),
                    boundary,
                    body.clone().into_bytes(),
                ),
            )
            .await
            .expect("the request failed");

        assert_eq!(uploaded.id, "snapshot-1");

        let request = server.request(0);

        assert_eq!(request.method, "PATCH");
        assert_eq!(
            request.target,
            "/upload/files/snapshot-1?uploadType=multipart"
        );
        assert_eq!(
            request.header("content-type"),
            Some(format!("multipart/related; boundary={boundary}").as_str())
        );
        assert_eq!(request.body_as_text(), body);
    }

    #[tokio::test]
    async fn a_transient_refusal_is_issued_again_and_then_succeeds() {
        let server = TestDriveServer::start(vec![
            ScriptedResponse::new(503, "service unavailable"),
            json_response(200, json!({ "id": "file-1", "name": "snapshot.db" })),
        ])
        .await;

        let file: DriveFile = transport(3)
            .send_json("token", &DriveRequest::get(server.url("/files/file-1")))
            .await
            .expect("a retryable refusal was not retried");

        assert_eq!(file.id, "file-1");
        assert_eq!(server.request_count(), 2);
    }

    #[tokio::test]
    async fn the_transport_waits_longer_before_each_further_attempt() {
        let server = TestDriveServer::start(vec![
            ScriptedResponse::new(503, ""),
            ScriptedResponse::new(503, ""),
            json_response(200, json!({ "id": "file-1", "name": "snapshot.db" })),
        ])
        .await;

        let started = Instant::now();

        transport(3)
            .send_json::<DriveFile>("token", &DriveRequest::get(server.url("/files/file-1")))
            .await
            .expect("the request failed");

        // 150ms before the second attempt and 300ms before the third: doubling,
        // rather than the same wait twice.
        assert!(
            started.elapsed() >= Duration::from_millis(450),
            "the waits did not lengthen: {:?}",
            started.elapsed()
        );
        assert_eq!(server.request_count(), 3);
    }

    /// asserted as a lower bound rather than an upper one: a machine can always be
    /// slower than expected, so only "it waited at least this long" is a fact about
    /// the code rather than about the machine.
    #[tokio::test]
    async fn a_rate_limit_is_waited_out_for_as_long_as_the_remote_asked() {
        let server = TestDriveServer::start(vec![
            ScriptedResponse::new(429, "").with_header("retry-after", "1"),
            json_response(200, json!({ "id": "file-1", "name": "snapshot.db" })),
        ])
        .await;

        // a ceiling above what the remote asks for, so this measures whether the
        // request was obeyed rather than whether it was capped — which is the
        // separate question `a_retry_after_beyond_the_ceiling_is_capped` answers.
        let transport = DriveTransport::with_retry_policy(DriveRetryPolicy {
            attempts: 2,
            base_delay: Duration::from_millis(150),
            max_delay: Duration::from_secs(5),
        })
        .expect("failed to build the drive transport");

        let started = Instant::now();

        transport
            .send_json::<DriveFile>("token", &DriveRequest::get(server.url("/files/file-1")))
            .await
            .expect("the request failed");

        // a whole second, where the policy's own backoff would have waited 150ms.
        assert!(
            started.elapsed() >= Duration::from_secs(1),
            "the remote's retry-after was ignored in favour of the computed wait: {:?}",
            started.elapsed()
        );
        assert_eq!(server.request_count(), 2);
    }

    /// the transport's other retry path: not a refusal, but no answer at all. A
    /// dropped connection is the shape a flaky network actually takes.
    #[tokio::test]
    async fn a_dropped_connection_is_tried_again_on_a_replay_safe_method() {
        let server = TestDriveServer::start(vec![
            ScriptedResponse::hangup(),
            json_response(200, json!({ "id": "file-1", "name": "snapshot.db" })),
        ])
        .await;

        let file: DriveFile = transport(3)
            .send_json("token", &DriveRequest::get(server.url("/files/file-1")))
            .await
            .expect("a dropped connection was not retried");

        assert_eq!(file.id, "file-1");
        assert_eq!(server.request_count(), 2);
    }

    /// a create whose response was lost may still have created the file, so the
    /// one thing that must not happen is sending it again.
    #[tokio::test]
    async fn a_dropped_connection_does_not_replay_a_create() {
        let server = TestDriveServer::start(vec![
            ScriptedResponse::hangup(),
            json_response(
                200,
                json!({ "id": "a-duplicate-file", "name": "duplicate.db" }),
            ),
        ])
        .await;

        let error = transport(3)
            .send_json::<DriveFile>(
                "token",
                &DriveRequest::json(Method::POST, server.url("/files"), b"{}".to_vec()),
            )
            .await
            .expect_err("a post was replayed after the connection dropped");

        assert!(
            matches!(error, Error::Network { .. }),
            "unexpected: {error:?}"
        );
        assert_eq!(server.request_count(), 1);
    }

    #[tokio::test]
    async fn a_refusal_that_never_clears_gives_up_after_the_last_attempt() {
        let server = TestDriveServer::start(vec![
            ScriptedResponse::new(503, ""),
            ScriptedResponse::new(503, ""),
            ScriptedResponse::new(503, ""),
            json_response(200, json!({ "id": "never-reached", "name": "never.db" })),
        ])
        .await;

        let error = transport(3)
            .send_json::<DriveFile>("token", &DriveRequest::get(server.url("/files/file-1")))
            .await
            .expect_err("an unending refusal was reported as success");

        assert!(
            matches!(error, Error::Network { .. }),
            "unexpected: {error:?}"
        );
        assert_eq!(
            server.request_count(),
            3,
            "the transport kept going past its attempt budget"
        );
    }

    #[tokio::test]
    async fn a_create_is_issued_once_however_the_remote_refused() {
        let server = TestDriveServer::start(vec![
            ScriptedResponse::new(503, ""),
            json_response(
                200,
                json!({ "id": "a-duplicate-file", "name": "duplicate.db" }),
            ),
        ])
        .await;

        let error = transport(3)
            .send_json::<DriveFile>(
                "token",
                &DriveRequest::json(Method::POST, server.url("/files"), b"{}".to_vec()),
            )
            .await
            .expect_err("a post was replayed");

        assert!(
            matches!(error, Error::Network { .. }),
            "unexpected: {error:?}"
        );
        assert_eq!(
            server.request_count(),
            1,
            "a create was issued twice, which is how a duplicate snapshot appears"
        );
    }

    #[tokio::test]
    async fn a_refusal_reaches_the_caller_as_its_typed_error() {
        let server = TestDriveServer::start(vec![json_response(
            404,
            json!({ "error": { "message": "File not found: missing." } }),
        )])
        .await;

        let error = transport(3)
            .send_json::<DriveFile>("token", &DriveRequest::get(server.url("/files/missing")))
            .await
            .expect_err("a missing file was reported as found");

        assert_eq!(
            error,
            Error::NotFound {
                message: "File not found: missing.".to_string()
            }
        );
    }

    /// a caller that treats one status as an answer rather than a failure — an
    /// absent file read as absent — has to see the status before it is mapped.
    #[tokio::test]
    async fn a_refused_status_is_visible_to_a_caller_that_reads_it_itself() {
        let server = TestDriveServer::start(vec![ScriptedResponse::new(404, "")]).await;

        let response = transport(3)
            .send("token", &DriveRequest::get(server.url("/files/missing")))
            .await
            .expect("a refusal was reported as no answer at all");

        assert_eq!(response.status, 404);
        assert!(!response.is_success());
    }

    #[tokio::test]
    async fn a_download_yields_the_bytes_the_remote_sent() {
        let contents = vec![0x00, 0x01, 0xff, 0xfe, b'r', b'e', b'n', b't'];
        let server =
            TestDriveServer::start(vec![ScriptedResponse::new(200, contents.clone())]).await;

        let downloaded = transport(3)
            .send(
                "token",
                &DriveRequest::get(server.url("/files/snapshot-1?alt=media")),
            )
            .await
            .expect("the download failed")
            .into_success()
            .expect("the download was refused");

        assert_eq!(downloaded, contents);
    }

    #[tokio::test]
    async fn a_delete_sends_no_body_and_answers_with_an_empty_success() {
        let server = TestDriveServer::start(vec![ScriptedResponse::new(204, "")]).await;

        let response = transport(3)
            .send("token", &DriveRequest::delete(server.url("/files/file-1")))
            .await
            .expect("the delete failed");

        assert!(response.is_success());
        assert_eq!(response.body, Vec::<u8>::new());

        let request = server.request(0);

        assert_eq!(request.method, "DELETE");
        assert_eq!(request.header("authorization"), Some("Bearer token"));
    }

    /// nothing in these tests may reach Google. Every request goes to a loopback
    /// address the test itself bound, and this pins that rather than trusting it.
    #[tokio::test]
    async fn the_test_harness_serves_from_loopback_and_never_from_the_live_api() {
        let server = TestDriveServer::start(vec![json_response(
            200,
            json!({ "id": "file-1", "name": "snapshot.db" }),
        )])
        .await;
        let url = server.url("/files/file-1");

        assert!(
            url.starts_with("http://127.0.0.1:"),
            "the harness was not bound to loopback: {url}"
        );
    }
}
