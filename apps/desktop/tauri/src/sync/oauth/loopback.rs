//! the loopback address an authorization server hands the code back on.
//!
//! A desktop application has no address of its own, so the redirect is an ephemeral port on
//! `127.0.0.1` claimed for the length of one consent. The port is claimed before the browser
//! opens, because the authorization request has to carry the redirect the callback will
//! actually arrive on, and only a bound listener knows which port that is.

use std::{
    collections::HashMap,
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    time::Duration,
};

use crate::error::Error;

/// How long the wait sleeps between attempts to accept. The listener is non-blocking, so this
/// is also how often the caller is asked whether the wait is still wanted.
const CALLBACK_POLL_INTERVAL: Duration = Duration::from_millis(200);

/// How long the callback may take to arrive in full, and its answer to go back. Without one a
/// hung connection holds the thread for as long as the process lives.
const CALLBACK_STREAM_TIMEOUT: Duration = Duration::from_secs(30);

/// The most of a request that is read. A redirect carrying a code and a state is a few hundred
/// bytes, and nothing here reads a body.
const CALLBACK_REQUEST_LIMIT: usize = 16 * 1024;

/// Whether a wait for the callback goes on.
///
/// The answer is the caller's, because what ends a consent early is: a person who cancelled, or
/// a flow something else already settled. This module knows about neither.
pub(crate) enum LoopbackWait {
    Continue,
    Abandon,
}

/// A bound loopback port, waiting to be called back on.
pub(crate) struct LoopbackCallback {
    listener: TcpListener,
    redirect_uri: String,
}

impl LoopbackCallback {
    /// Claim an ephemeral loopback port, and compose the redirect that names it.
    ///
    /// `callback_path` is the path the authorization server redirects to. It is the caller's
    /// because it is registered with that server, and it is the only thing this needs from one.
    pub(crate) fn bind(callback_path: &str) -> Result<Self, Error> {
        let listener = TcpListener::bind("127.0.0.1:0")?;
        let port = listener.local_addr()?.port();

        Ok(Self {
            listener,
            redirect_uri: format!("http://127.0.0.1:{port}{callback_path}"),
        })
    }

    /// The address the authorization request carries, and the code comes back to.
    pub(crate) fn redirect_uri(&self) -> &str {
        &self.redirect_uri
    }

    /// Wait for the browser to arrive, and read what the redirect carried.
    ///
    /// `Ok(None)` is `still_waiting` having abandoned the wait, which is an outcome rather than
    /// a failure. Nothing is answered here: what the page should say depends on what the query
    /// turns out to mean, so the answer is [`LoopbackRequest::respond`]'s.
    pub(crate) fn accept(
        &self,
        mut still_waiting: impl FnMut() -> Result<LoopbackWait, Error>,
    ) -> Result<Option<LoopbackRequest>, Error> {
        self.listener.set_nonblocking(true)?;

        let (mut stream, _) = loop {
            match self.listener.accept() {
                Ok(connection) => break connection,
                Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                    match still_waiting()? {
                        LoopbackWait::Continue => std::thread::sleep(CALLBACK_POLL_INTERVAL),
                        LoopbackWait::Abandon => return Ok(None),
                    }
                }
                Err(error) => return Err(error.into()),
            }
        };

        let _ = stream.set_read_timeout(Some(CALLBACK_STREAM_TIMEOUT));
        let _ = stream.set_write_timeout(Some(CALLBACK_STREAM_TIMEOUT));

        let mut buffer = [0_u8; CALLBACK_REQUEST_LIMIT];
        let count = stream.read(&mut buffer)?;
        let request = String::from_utf8_lossy(&buffer[..count]).to_string();
        let path = parse_http_request_path(&request).ok_or_else(|| Error::InvalidInput {
            message: "failed to parse oauth callback request".to_string(),
        })?;

        Ok(Some(LoopbackRequest {
            query: parse_query_map(path),
            stream,
        }))
    }
}

/// What arrived on the loopback address, and the connection it arrived on.
pub(crate) struct LoopbackRequest {
    stream: TcpStream,
    query: HashMap<String, String>,
}

impl LoopbackRequest {
    /// What the redirect's query said, percent-decoded.
    pub(crate) fn query(&self) -> &HashMap<String, String> {
        &self.query
    }

    /// Answer the browser tab with a page saying what happened, and close the connection.
    pub(crate) fn respond(mut self, message: &str) -> Result<(), Error> {
        let body = format!(
            "<!doctype html><html><head><meta charset=\"utf-8\"><title>Rentable</title></head><body style=\"font-family: system-ui, sans-serif; padding: 32px;\"><h2>Rentable</h2><p>{message}</p></body></html>"
        );
        let response = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            body.len(),
            body
        );

        self.stream.write_all(response.as_bytes())?;
        self.stream.flush()?;

        // Close cleanly rather than by dropping the socket. On Windows a socket dropped with bytes
        // still unread in its receive buffer is closed abortively with an RST, and the browser tab,
        // or a test's client, then sees a reset connection instead of the page it was sent. A
        // write-half shutdown sends a FIN, and draining what the peer sends before the drop lets the
        // close be an ordinary one. The read timeout set on the stream bounds the drain.
        let _ = self.stream.shutdown(std::net::Shutdown::Write);
        let mut sink = [0_u8; 512];
        while matches!(self.stream.read(&mut sink), Ok(count) if count > 0) {}

        Ok(())
    }
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
}
