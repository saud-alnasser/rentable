//! the conversation with Turso's MCP server: the handshake, one JSON-RPC call inside the session it
//! opened, and a tool's refusal read back in Turso's own words.

use serde_json::{Value, json};

use super::McpEndpoint;
use crate::error::{Error, RefusalReason};

/// The protocol revision `turso-cloud-mcp` answered `initialize` with on 2026-08-30.
const MCP_PROTOCOL_VERSION: &str = "2025-06-18";

const MCP_CLIENT_NAME: &str = "Rentable";

/// The reason a tool gave for refusing, where the reply is a result flagged `isError`.
pub(super) fn tool_refusal(message: &Value) -> Option<String> {
    let result = message.get("result")?;

    if !result
        .get("isError")
        .and_then(Value::as_bool)
        .unwrap_or(false)
    {
        return None;
    }

    let text = result
        .get("content")
        .and_then(Value::as_array)
        .map(|content| {
            content
                .iter()
                .filter_map(|part| part.get("text").and_then(Value::as_str))
                .collect::<Vec<_>>()
                .join(" ")
        })
        .unwrap_or_default();

    Some(if text.trim().is_empty() {
        "no reason was given".to_string()
    } else {
        text.trim().to_string()
    })
}

/// `initialize`, and the session it opened where the server opened one.
pub(super) async fn handshake(
    client: &reqwest::Client,
    endpoint: &McpEndpoint,
    platform_token: &str,
) -> Result<Option<String>, Error> {
    let (_, session) = call(
        client,
        endpoint,
        platform_token,
        None,
        &json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": MCP_PROTOCOL_VERSION,
                "capabilities": {},
                "clientInfo": { "name": MCP_CLIENT_NAME, "version": env!("CARGO_PKG_VERSION") }
            }
        }),
    )
    .await?;

    Ok(session)
}

/// Post one JSON-RPC message and return what came back, with any session identifier.
///
/// **Three failures are three answers.** A request that never arrives is `Network`, because
/// retrying is the sensible response and nothing is wrong with the account. A refusal from the
/// server is `Refused` with `ConsentNeededAgain`, and its message names setting up rather than
/// syncing, because whoever sees it is on a first run and has no workspace to sync. A reply that
/// is not the shape this expects is `Integrity`, which is a defect here rather than anything the
/// customer did.
pub(super) async fn call(
    client: &reqwest::Client,
    endpoint: &McpEndpoint,
    platform_token: &str,
    session: Option<&str>,
    payload: &Value,
) -> Result<(Value, Option<String>), Error> {
    let mut request = client
        .post(&endpoint.url)
        .bearer_auth(platform_token)
        // a streamable HTTP server chooses between these two per reply, so a client that
        // accepted one of them would be asking the server to guess right.
        .header("accept", "application/json, text/event-stream")
        .json(payload);

    if let Some(session) = session {
        request = request.header("mcp-session-id", session);
    }

    let response = request.send().await.map_err(|error| Error::Network {
        message: format!("turso could not be reached ({error})"),
    })?;

    let status = response.status();
    let session = response
        .headers()
        .get("mcp-session-id")
        .and_then(|value| value.to_str().ok())
        .map(str::to_string);
    let body = response.text().await.unwrap_or_default();

    if !status.is_success() {
        return Err(consent_refused(status.as_u16().to_string()));
    }

    let message = json_rpc_body(&body)?;

    // a JSON-RPC error is a 200 carrying a refusal, so the status alone does not settle it.
    if let Some(error) = message.get("error") {
        let code = error
            .get("code")
            .and_then(Value::as_i64)
            .unwrap_or_default();
        return Err(consent_refused(format!("rpc {code}")));
    }

    Ok((message, session))
}

/// What a refused request to identify the account answers, whichever way Turso refused it:
/// `answer` is the status, or `rpc` and the JSON-RPC code.
///
/// **A refusal never quotes Turso back.** The message reaching a screen is ours, so that a
/// server-side string can never become the instruction a customer follows.
fn consent_refused(answer: String) -> Error {
    Error::refused(
        RefusalReason::ConsentNeededAgain,
        format!(
            "turso refused this application's request to identify the account ({answer}). \
             Setting up an organization needs the consent granted again."
        ),
    )
}

/// Read the JSON-RPC message out of a body that may be framed as a server-sent event.
///
/// Streamable HTTP lets one endpoint answer either way for the same request, so both are read
/// rather than one being assumed. Only the first `data:` line is taken: a single response is one
/// event, and a stream of several would be a server doing something this module does not ask for.
fn json_rpc_body(body: &str) -> Result<Value, Error> {
    if let Ok(value) = serde_json::from_str::<Value>(body) {
        return Ok(value);
    }

    body.lines()
        .filter_map(|line| line.strip_prefix("data:"))
        .find_map(|data| serde_json::from_str::<Value>(data.trim()).ok())
        .ok_or_else(|| Error::Integrity {
            message: "turso answered the account lookup with something that is not a reply this \
                      application can read."
                .to_string(),
        })
}

#[cfg(test)]
mod tests {
    use crate::sync::test::server::{ScriptedResponse, ScriptedServer};
    use crate::turso::discovery::{
        McpEndpoint, OrganizationLookup, TursoOrganization, look_up_organization,
    };
    use serde_json::json;

    const TOKEN: &str = "the-platform-api-token";

    /// what `initialize` answers, which this module reads nothing out of but the session header.
    fn handshake() -> ScriptedResponse {
        ScriptedResponse::new(
            200,
            json!({
                "jsonrpc": "2.0",
                "id": 1,
                "result": {
                    "protocolVersion": "2025-06-18",
                    "capabilities": {},
                    "serverInfo": { "name": "turso-cloud-mcp", "version": "0.1.0" }
                }
            })
            .to_string(),
        )
    }

    /// `list_databases` as it answered on 2026-08-30: the records inside a text part.
    fn listing(records: serde_json::Value) -> ScriptedResponse {
        ScriptedResponse::new(
            200,
            json!({
                "jsonrpc": "2.0",
                "id": 2,
                "result": {
                    "content": [{ "type": "text", "text": records.to_string() }]
                }
            })
            .to_string(),
        )
    }

    #[tokio::test]
    async fn a_refusal_names_setting_up_rather_than_syncing() {
        let server = ScriptedServer::start(vec![ScriptedResponse::new(403, "{}")]).await;

        let error = look_up_organization(TOKEN, &McpEndpoint::at(&server.url("")))
            .await
            .expect_err("a refusal was read as a lookup");

        let message = error.to_string();
        assert!(
            message.contains("Setting up an organization"),
            "a refusal did not name setting up: {message}"
        );
        assert!(
            !message.contains("sync"),
            "a refusal named syncing on a first run: {message}"
        );
    }

    /// A refusal, a network failure and an empty group are three answers, and a caller that could
    /// not tell them apart would tell a customer with a correct setup to fix it.
    #[tokio::test]
    async fn a_network_failure_is_not_a_refusal() {
        let server = ScriptedServer::start(vec![ScriptedResponse::hangup()]).await;

        let error = look_up_organization(TOKEN, &McpEndpoint::at(&server.url("")))
            .await
            .expect_err("an unreachable server answered");

        assert!(
            matches!(error, crate::error::Error::Network { .. }),
            "an unreachable server was not reported as a network failure: {error}"
        );
    }

    #[tokio::test]
    async fn a_json_rpc_error_is_a_refusal_even_though_the_status_is_200() {
        let server = ScriptedServer::start(vec![
            handshake(),
            ScriptedResponse::new(
                200,
                json!({
                    "jsonrpc": "2.0",
                    "id": 2,
                    "error": { "code": -32001, "message": "whatever turso would like to say" }
                })
                .to_string(),
            ),
        ])
        .await;

        let error = look_up_organization(TOKEN, &McpEndpoint::at(&server.url("")))
            .await
            .expect_err("a json-rpc error was read as a listing");

        assert!(
            !error
                .to_string()
                .contains("whatever turso would like to say"),
            "turso's own words reached the message a customer reads"
        );
    }

    /// Streamable HTTP lets the server choose the framing per reply, so both are read.
    #[tokio::test]
    async fn a_reply_framed_as_an_event_stream_is_read_the_same_way() {
        let records = json!([{
            "Name": "ledger",
            "hostname": "ledger-acme.aws-us-east-1.turso.io",
            "group": "rents"
        }]);
        let framed = format!(
            "event: message\ndata: {}\n\n",
            json!({
                "jsonrpc": "2.0",
                "id": 2,
                "result": { "content": [{ "type": "text", "text": records.to_string() }] }
            })
        );

        let server = ScriptedServer::start(vec![
            handshake(),
            ScriptedResponse::of(200, "text/event-stream", framed),
        ])
        .await;

        let found = look_up_organization(TOKEN, &McpEndpoint::at(&server.url("")))
            .await
            .expect("an event-stream reply was not read");

        assert_eq!(
            found,
            OrganizationLookup::Found {
                organization: TursoOrganization {
                    slug: "acme".to_string(),
                    group: "rents".to_string(),
                },
                databases: vec!["ledger".to_string()],
            }
        );
    }

    #[tokio::test]
    async fn the_session_the_handshake_opens_is_carried_into_the_call() {
        let server = ScriptedServer::start(vec![
            ScriptedResponse::of(
                200,
                "application/json",
                json!({ "jsonrpc": "2.0", "id": 1, "result": {} }).to_string(),
            ),
            listing(json!([])),
        ])
        .await;

        look_up_organization(TOKEN, &McpEndpoint::at(&server.url("")))
            .await
            .expect("the lookup failed");

        // no session header came back, so none is sent: inventing one would be a request Turso
        // never asked for.
        assert_eq!(server.request(1).header("mcp-session-id"), None);
    }

    #[tokio::test]
    async fn the_token_is_sent_as_a_bearer_credential_and_nothing_else_is() {
        let server = ScriptedServer::start(vec![handshake(), listing(json!([]))]).await;

        look_up_organization(TOKEN, &McpEndpoint::at(&server.url("")))
            .await
            .expect("the lookup failed");

        assert_eq!(
            server.request(0).header("authorization"),
            Some(format!("Bearer {TOKEN}").as_str())
        );
    }
}
