//! the loopback address an authorization server hands the code back on.
//!
//! A desktop application has no address of its own, so the redirect is an ephemeral port on
//! `127.0.0.1` claimed for the length of one consent. The port is claimed before the browser
//! opens, because the authorization request has to carry the redirect the callback will
//! actually arrive on, and only a bound listener knows which port that is.
//!
//! **Whoever connects is not necessarily the callback.** A browser opens connections before it
//! has anything to send on them, sends a request in more than one piece, and asks for a favicon;
//! any page on the machine can point at the port. So every connection is read on a thread of its
//! own, one that fails is dropped without ending the wait, and the caller judges whether a
//! request that did arrive is the one it is waiting for.

use std::{
    collections::HashMap,
    io::{self, Read, Write},
    net::{TcpListener, TcpStream},
    sync::mpsc::{self, Receiver, Sender},
    time::Duration,
};

use crate::{diagnostics, error::Error};

/// How long the wait sleeps between attempts to accept. The listener is non-blocking, so this
/// is also how often the caller is asked whether the wait is still wanted.
const CALLBACK_POLL_INTERVAL: Duration = Duration::from_millis(200);

/// How long the callback may take to arrive in full, and its answer to go back. Without one a
/// hung connection holds its reader thread for as long as the process lives.
const CALLBACK_STREAM_TIMEOUT: Duration = Duration::from_secs(30);

/// The most of a request that is read. A redirect carrying a code and a state is a few hundred
/// bytes, and nothing here reads a body.
const CALLBACK_REQUEST_LIMIT: usize = 16 * 1024;

/// What a request whose `state` is not the waiting consent's is shown. It says nothing about
/// the consent, because whoever sent it is not the person who started one.
pub(crate) const STRANGER_PAGE: &str =
    "This window is not part of a connection Rentable is waiting for. You can close it.";

/// Whether a wait for the callback goes on.
///
/// The answer is the caller's, because what ends a consent early is: a person who cancelled, or
/// a flow something else already settled. This module knows about neither.
pub(crate) enum LoopbackWait {
    Continue,
    Abandon,
}

/// Whether a request that arrived is the one being waited for.
///
/// The judgement is the caller's, because only it knows the `state` it issued.
pub(crate) enum Judged {
    Ours,
    Stranger,
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
    /// **The wait goes on past every connection that is not the callback.** One that sends
    /// nothing, sends what does not parse, or fails is dropped, and one `judge` calls a
    /// stranger's is answered with a page that says nothing and dropped too. Only `still_waiting`
    /// ends the wait without a request, and only a request `judge` calls ours ends it with one.
    ///
    /// `Ok(None)` is `still_waiting` having abandoned the wait, which is an outcome rather than
    /// a failure. Nothing is answered to the request returned: what the page should say depends on
    /// what the query turns out to mean, so the answer is [`LoopbackRequest::respond`]'s.
    pub(crate) fn accept(
        &self,
        mut still_waiting: impl FnMut() -> Result<LoopbackWait, Error>,
        mut judge: impl FnMut(&HashMap<String, String>) -> Judged,
    ) -> Result<Option<LoopbackRequest>, Error> {
        self.listener.set_nonblocking(true)?;

        let (arrived, arrivals) = mpsc::channel();

        loop {
            self.take_connections(&arrived)?;

            if let Some(request) = take_ours(&arrivals, &mut judge) {
                return Ok(Some(request));
            }

            match still_waiting()? {
                LoopbackWait::Continue => std::thread::sleep(CALLBACK_POLL_INTERVAL),
                LoopbackWait::Abandon => return Ok(None),
            }
        }
    }

    /// Hand every connection waiting on the listener to a reader of its own.
    fn take_connections(
        &self,
        arrived: &Sender<Result<LoopbackRequest, Error>>,
    ) -> Result<(), Error> {
        loop {
            match self.listener.accept() {
                Ok((stream, _)) => {
                    let arrived = arrived.clone();

                    std::thread::spawn(move || {
                        // the wait may have ended while this was reading, and then nobody is
                        // listening for what it read. The socket is dropped with the thread.
                        let _ = arrived.send(read_request(stream));
                    });
                }
                Err(error) if error.kind() == io::ErrorKind::WouldBlock => return Ok(()),
                // a connection the peer gave up on before it was accepted is one fewer to read,
                // not a listener that stopped working.
                Err(error)
                    if matches!(
                        error.kind(),
                        io::ErrorKind::ConnectionAborted
                            | io::ErrorKind::ConnectionReset
                            | io::ErrorKind::Interrupted
                    ) =>
                {
                    dropped(&error.into());
                }
                Err(error) => return Err(error.into()),
            }
        }
    }
}

/// The first request read so far that `judge` calls ours, answering and dropping every other.
fn take_ours(
    arrivals: &Receiver<Result<LoopbackRequest, Error>>,
    judge: &mut impl FnMut(&HashMap<String, String>) -> Judged,
) -> Option<LoopbackRequest> {
    while let Ok(arrival) = arrivals.try_recv() {
        match arrival {
            Ok(request) => match judge(request.query()) {
                Judged::Ours => return Some(request),
                Judged::Stranger => {
                    // answered on a thread of its own, because answering waits for the peer to
                    // close, and the callback may be arriving meanwhile.
                    std::thread::spawn(move || {
                        let _ = request.respond(STRANGER_PAGE);
                    });
                }
            },
            Err(error) => dropped(&error),
        }
    }

    None
}

/// Read one connection to the end of its request's head, on the thread that owns it.
///
/// The stream is made blocking before it is read: on Windows an accepted socket inherits the
/// listener's non-blocking mode, and a read timeout does nothing on a non-blocking socket.
fn read_request(mut stream: TcpStream) -> Result<LoopbackRequest, Error> {
    stream.set_nonblocking(false)?;
    stream.set_read_timeout(Some(CALLBACK_STREAM_TIMEOUT))?;
    stream.set_write_timeout(Some(CALLBACK_STREAM_TIMEOUT))?;

    let head = read_head(&mut stream)?;
    let path = parse_http_request_path(&head).ok_or_else(|| Error::Integrity {
        message: "the connection sent no request line".to_string(),
    })?;

    Ok(LoopbackRequest {
        query: parse_query_map(path),
        stream,
    })
}

/// Read a request up to the blank line that ends its head, however many pieces it arrives in.
///
/// It stops at the end of the head, at the end of the stream, or at [`CALLBACK_REQUEST_LIMIT`],
/// and fails where a read does, which is how the stream's read timeout ends a silent connection.
pub(crate) fn read_head(stream: &mut impl Read) -> Result<String, Error> {
    let mut head = Vec::new();
    let mut piece = [0_u8; 1024];

    while head.len() < CALLBACK_REQUEST_LIMIT && !head.windows(4).any(|end| end == b"\r\n\r\n") {
        let count = stream.read(&mut piece)?;

        if count == 0 {
            break;
        }

        let room = CALLBACK_REQUEST_LIMIT - head.len();
        head.extend_from_slice(&piece[..count.min(room)]);
    }

    Ok(String::from_utf8_lossy(&head).to_string())
}

/// Record a connection that was dropped. **Only what kind of failure it was**: what the
/// connection sent may carry a code, and a code is never written down.
fn dropped(error: &Error) {
    diagnostics::warn("turso.consent.connectionDropped")
        .with("reason", error.to_string())
        .write();
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
    ///
    /// The message is escaped, so what a query carried into it reaches the tab as text.
    pub(crate) fn respond(mut self, message: &str) -> Result<(), Error> {
        let body = format!(
            "<!doctype html><html><head><meta charset=\"utf-8\"><title>Rentable</title></head><body style=\"font-family: system-ui, sans-serif; padding: 32px;\"><h2>Rentable</h2><p>{}</p></body></html>",
            escape_html(message)
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

/// Make text safe to place in a page: what an authorization server put in a query is echoed
/// into the tab, and it is shown as text rather than run as markup.
fn escape_html(text: &str) -> String {
    let mut escaped = String::with_capacity(text.len());

    for character in text.chars() {
        match character {
            '&' => escaped.push_str("&amp;"),
            '<' => escaped.push_str("&lt;"),
            '>' => escaped.push_str("&gt;"),
            '"' => escaped.push_str("&quot;"),
            '\'' => escaped.push_str("&#39;"),
            other => escaped.push(other),
        }
    }

    escaped
}

#[cfg(test)]
mod tests {
    use std::{
        io::Write,
        net::{TcpListener, TcpStream},
        time::Duration,
    };

    use super::{escape_html, percent_decode, read_head};

    #[test]
    fn percent_decode_is_stable() {
        assert_eq!(percent_decode("hello%20world%2Btest"), "hello world+test");
    }

    /// **a request may arrive in as many pieces as the sender likes** (criterion 16), and the
    /// head is read to its blank line rather than to whatever the first read happened to get.
    #[test]
    fn a_request_written_in_three_pieces_is_read_whole() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("failed to bind a listener");
        let address = listener.local_addr().expect("the listener has no address");
        let pieces = [
            "GET /callback?code=the-code",
            "&state=the-state HTTP/1.1\r\n",
            "Host: 127.0.0.1\r\n\r\n",
        ];

        let writer = std::thread::spawn(move || {
            let mut stream = TcpStream::connect(address).expect("the connection was refused");

            for piece in pieces {
                stream
                    .write_all(piece.as_bytes())
                    .expect("a piece was not written");
                stream.flush().expect("a piece was not sent");
                std::thread::sleep(Duration::from_millis(150));
            }

            stream
        });

        let (mut stream, _) = listener.accept().expect("nothing connected");
        stream
            .set_read_timeout(Some(Duration::from_secs(5)))
            .expect("failed to bound the read");

        let head = read_head(&mut stream).expect("the head was not read");

        assert_eq!(head, pieces.concat());

        drop(writer.join());
    }

    #[test]
    fn escape_html_escapes_every_character_markup_reads() {
        assert_eq!(
            escape_html(r#"<a href="x" title='y'>&</a>"#),
            "&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;"
        );
        assert_eq!(escape_html("nothing to escape"), "nothing to escape");
    }
}
