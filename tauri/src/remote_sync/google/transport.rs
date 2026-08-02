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
