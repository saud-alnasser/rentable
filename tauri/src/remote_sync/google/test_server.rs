//! a real HTTP server on loopback, for tests that need the transport's actual
//! request on the wire.
//!
//! Chosen over a mocked transport because header construction, retry, and
//! error mapping are exactly the parts that break, and a mock asserts against
//! the description of a request rather than against the request.

use std::collections::VecDeque;
use std::sync::{Arc, Mutex};

use bytes::Bytes;
use http_body_util::{BodyExt, Full};
use hyper::body::Incoming;
use hyper::server::conn::http1;
use hyper::service::service_fn;
use hyper::{Request, Response};
use hyper_util::rt::TokioIo;
use tokio::net::TcpListener;

/// the status answered once the script runs out. Deliberately neither a code
/// the transport retries nor one it maps to anything meaningful, so a test that
/// under-scripts fails as itself rather than as a transport bug.
const SCRIPT_EXHAUSTED_STATUS: u16 = 599;

/// one answer the server is told to give, in order.
pub(super) enum ScriptedResponse {
    Respond {
        status: u16,
        headers: Vec<(String, String)>,
        body: Vec<u8>,
    },
    /// close the connection without answering, which is how a test reaches the
    /// transport's other retry path — the one where no answer arrives at all.
    Hangup,
}

impl ScriptedResponse {
    pub(super) fn new(status: u16, body: impl Into<Vec<u8>>) -> Self {
        Self::Respond {
            status,
            headers: Vec::new(),
            body: body.into(),
        }
    }

    pub(super) fn hangup() -> Self {
        Self::Hangup
    }

    pub(super) fn with_header(self, name: &str, value: &str) -> Self {
        match self {
            Self::Respond {
                status,
                mut headers,
                body,
            } => {
                headers.push((name.to_string(), value.to_string()));

                Self::Respond {
                    status,
                    headers,
                    body,
                }
            }
            Self::Hangup => Self::Hangup,
        }
    }
}

/// one request as it arrived, kept so a test can assert on what was actually
/// sent rather than on what the caller meant to send.
#[derive(Clone)]
pub(super) struct RecordedRequest {
    pub method: String,
    /// the request-target: the path and, where there was one, the query.
    pub target: String,
    headers: Vec<(String, String)>,
    pub body: Vec<u8>,
}

impl RecordedRequest {
    /// a header by name, matched case-insensitively as HTTP requires.
    pub(super) fn header(&self, name: &str) -> Option<&str> {
        self.headers
            .iter()
            .find(|(header, _)| header.eq_ignore_ascii_case(name))
            .map(|(_, value)| value.as_str())
    }

    pub(super) fn body_as_text(&self) -> String {
        String::from_utf8_lossy(&self.body).to_string()
    }
}

/// recording and scripting under one lock, so a request is always answered
/// with the entry that follows the one it was recorded after. Two locks would
/// let concurrent connections record in one order and be answered in another.
#[derive(Default)]
struct ServerState {
    script: VecDeque<ScriptedResponse>,
    recorded: Vec<RecordedRequest>,
}

/// an HTTP server bound to an ephemeral loopback port, answering from a script.
///
/// Nothing shuts it down: `#[tokio::test]` drops the runtime when the test
/// ends, which cancels the accept loop and every connection it spawned.
pub(super) struct TestDriveServer {
    base_url: String,
    state: Arc<Mutex<ServerState>>,
}

impl TestDriveServer {
    /// bind, start accepting, and answer each request with the next scripted
    /// entry. Returns once the port is known, so the first request a test makes
    /// cannot outrun the listener.
    pub(super) async fn start(script: Vec<ScriptedResponse>) -> Self {
        let listener = TcpListener::bind(("127.0.0.1", 0))
            .await
            .expect("failed to bind the test drive server");
        let address = listener
            .local_addr()
            .expect("failed to read the test drive server address");

        let state = Arc::new(Mutex::new(ServerState {
            script: script.into(),
            recorded: Vec::new(),
        }));

        tokio::spawn({
            let state = Arc::clone(&state);

            async move {
                while let Ok((stream, _)) = listener.accept().await {
                    let state = Arc::clone(&state);

                    // one task per connection: reqwest keeps the connection
                    // alive between attempts, so an accept loop that served
                    // one connection to completion would never reach the next.
                    tokio::spawn(async move {
                        let service = service_fn(move |request| {
                            let state = Arc::clone(&state);

                            async move { answer(state, request).await }
                        });

                        let _ = http1::Builder::new()
                            .serve_connection(TokioIo::new(stream), service)
                            .await;
                    });
                }
            }
        });

        Self {
            base_url: format!("http://{address}"),
            state,
        }
    }

    /// an absolute URL for `path`, which must start with `/`.
    pub(super) fn url(&self, path: &str) -> String {
        format!("{}{path}", self.base_url)
    }

    pub(super) fn request_count(&self) -> usize {
        self.locked().recorded.len()
    }

    /// the `index`th request the server received, in arrival order. Reading one
    /// leaves the log alone, so two reads of the same index agree.
    pub(super) fn request(&self, index: usize) -> RecordedRequest {
        let state = self.locked();

        state
            .recorded
            .get(index)
            .unwrap_or_else(|| {
                panic!(
                    "the test drive server received {} requests, not {}",
                    state.recorded.len(),
                    index + 1
                )
            })
            .clone()
    }

    fn locked(&self) -> std::sync::MutexGuard<'_, ServerState> {
        self.state
            .lock()
            .expect("the test drive server lock was poisoned")
    }
}

/// the connection is dropped rather than answered. Returning an error is how a
/// hyper service says so; the text is never sent anywhere.
#[derive(Debug)]
struct Hangup;

impl std::fmt::Display for Hangup {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("the test drive server dropped the connection")
    }
}

impl std::error::Error for Hangup {}

async fn answer(
    state: Arc<Mutex<ServerState>>,
    request: Request<Incoming>,
) -> Result<Response<Full<Bytes>>, Hangup> {
    let method = request.method().to_string();
    let target = request
        .uri()
        .path_and_query()
        .map(ToString::to_string)
        .unwrap_or_default();
    let headers = request
        .headers()
        .iter()
        .map(|(name, value)| {
            (
                name.as_str().to_string(),
                value.to_str().unwrap_or_default().to_string(),
            )
        })
        .collect();
    let body = request
        .into_body()
        .collect()
        .await
        .map(|body| body.to_bytes().to_vec())
        .unwrap_or_default();

    let scripted = {
        let mut state = state
            .lock()
            .expect("the test drive server lock was poisoned");

        state.recorded.push(RecordedRequest {
            method,
            target,
            headers,
            body,
        });

        state.script.pop_front()
    };

    let Some(ScriptedResponse::Respond {
        status,
        headers,
        body,
    }) = scripted
    else {
        if matches!(scripted, Some(ScriptedResponse::Hangup)) {
            return Err(Hangup);
        }

        return Ok(Response::builder()
            .status(SCRIPT_EXHAUSTED_STATUS)
            .body(Full::new(Bytes::from_static(
                b"the test drive server was asked for more responses than it was given",
            )))
            .expect("failed to build the script-exhausted response"));
    };

    let mut response = Response::builder().status(status);

    for (name, value) in &headers {
        response = response.header(name, value);
    }

    Ok(response
        .body(Full::new(Bytes::from(body)))
        .expect("failed to build the scripted response"))
}
