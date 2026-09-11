//! Turning a consented token into the organization slug every Platform API path is built from.
//!
//! Every path `apps/control-plane/src/workspace/turso.ts` uses is `/v1/organizations/{slug}/...`,
//! and a consent hands back neither the slug nor anything that maps to one. The token's `org_id`
//! claim is a number, and `GET /v1/organizations/26543` answers *organization 26543 not found*:
//! the server reading the parameter as a name it does not recognise rather than refusing the
//! credential. The organizations listing that would give the name answers 403, because the token
//! is scoped to one group. Both are measured in
//! [[efforts/819-an-organization-hosts-its-own-workspaces/evidence/prototypes/one-real-consent]].
//!
//! What does answer is Turso's MCP server. `list_databases` returns each database's `Name` and its
//! `hostname`, and a hostname is `<name>-<slug>.<region>.turso.io`, so **the slug is what is left
//! of the first label once the record's own name is removed from the front of it**. That is the
//! whole of this module.
//!
//! **This is the only thing in the tree that speaks to `mcp.turso.ai`**, deliberately. The tool
//! schemas are versioned at `v0.1.0` and Turso documents them for agents rather than for clients,
//! so when that surface moves the diff is one file. It is also why this is a setup-time lookup
//! rather than anything on the provisioning path: a first run that cannot find the slug is a
//! customer who has not started, and a change here can never break a customer who already has.
//!
//! **MCP cannot replace the Platform API and is not asked to.** Its tool set has no way to mint a
//! per-database credential, which is what requirement 9's grants are made of. It supplies the slug
//! and nothing else.
//!
//! **One test here reaches Turso**, admitted in [[rules/testing]] under *Tests that reach a live
//! remote* as the seventh property. Nothing local can hold it: a loopback server answers whatever
//! this file scripted it to, and what is under test is precisely whether Turso's own reply carries
//! a hostname in the shape the parse above depends on. It carries `#[ignore]`, so a machine that
//! has never reached Turso reports it in the summary line rather than passing silently, and it
//! **panics** rather than skipping when its two variables are absent: asking for an ignored test
//! is a deliberate act, and a live run that quietly was not one is the outcome worth refusing.
//!
//! The token is a real consented one and is the human's. It is supplied for the run and is not
//! committed anywhere.
//!
//! ```text
//! RENTABLE_LIVE_TURSO=1 TURSO_CONSENT_TOKEN=… TURSO_ORG=… \
//!   cargo test --manifest-path ./apps/desktop/tauri/Cargo.toml \
//!   discovery_live -- --test-threads=1 --ignored --nocapture
//! ```

use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::{error::Error, http::build_client, persisted::Persisted, sync::store::RemoteSyncStore};

/// Where the MCP server lives, and the same value the consent names as its resource indicator.
/// The authority this spends was issued *for* this resource, which is why one string is both.
const TURSO_MCP_ENDPOINT: &str = "https://mcp.turso.ai/mcp";

/// The protocol revision `turso-cloud-mcp` answered `initialize` with on 2026-08-30.
const MCP_PROTOCOL_VERSION: &str = "2025-06-18";

const MCP_CLIENT_NAME: &str = "Rentable";

/// The tool that carries the hostname. It reads and creates nothing
/// ([[references/turso]], *Never run*).
const MCP_LIST_DATABASES: &str = "list_databases";

const MCP_REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

/// Every database hostname ends here, and the region sits between the slug and this.
const TURSO_HOSTNAME_SUFFIX: &str = ".turso.io";

/// Where the lookup is made. A struct rather than the constant so the transport can be pointed at
/// a scripted server, which is the only way to test the parse against a reply we did not write.
#[derive(Clone, Debug)]
pub struct McpEndpoint {
    url: String,
}

impl McpEndpoint {
    pub fn production() -> Self {
        Self {
            url: TURSO_MCP_ENDPOINT.to_string(),
        }
    }

    #[cfg(test)]
    fn at(base: &str) -> Self {
        Self {
            url: format!("{base}/mcp"),
        }
    }
}

/// Which organization and group a consent turned out to be over.
///
/// **Neither field is a credential**, which is why this is kept in the machine's own sync store
/// rather than in the keyring: a slug is a name that appears in every URL this application builds,
/// and treating it as a secret would imply the URLs were.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TursoOrganization {
    pub slug: String,
    pub group: String,
}

/// What one lookup came to.
///
/// **An empty group is an answer rather than a failure.** Requirement 3 asks the customer to
/// prepare an *empty* group and select it during the consent, so the ordinary first run has
/// nothing to list. Reported as an error it would be the most common outcome of a correct setup
/// arriving as a fault, and the customer would be told to fix the one thing they did right.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum OrganizationLookup {
    Found(TursoOrganization),
    /// the group the consent was granted over holds no database yet.
    NoDatabaseYet,
}

/// Read the slug out of a hostname, given the name of the database the hostname belongs to.
///
/// **The name is subtracted; the string is never split on a dash.** A hostname's first label is
/// `<name>-<slug>` and both halves may contain dashes, so no split has a correct place to cut:
/// `control-plane-rentable` is `control-plane` in `rentable` and also `control` in
/// `plane-rentable`, and nothing in the string says which. The record supplies its own `Name`, so
/// what is left after removing it is the slug, with no guess anywhere in the derivation.
fn slug_from_hostname(name: &str, hostname: &str) -> Option<String> {
    let host = hostname.strip_suffix(TURSO_HOSTNAME_SUFFIX)?;
    let label = host.split('.').next()?;
    let slug = label.strip_prefix(name)?.strip_prefix('-')?;

    (!slug.is_empty()).then(|| slug.to_string())
}

/// One database as `list_databases` reports it.
///
/// Turso spells the name with a capital and everything else without, which is a fact about their
/// serializer rather than a decision. There are deliberately no case aliases here. A live listing
/// on 2026-08-31 carried `Hostname` and `hostname` in the same record, holding the same value, and
/// serde reads a second key filling an already filled field as a duplicate and rejects the record.
/// An alias naming the other spelling turns a listing that parses into one that does not, which is
/// the opposite of the tolerance such an alias is added for.
#[derive(Debug, Deserialize)]
struct DatabaseRecord {
    #[serde(rename = "Name")]
    name: String,
    #[serde(rename = "hostname")]
    hostname: String,
    #[serde(default, rename = "group")]
    group: String,
}

/// Ask Turso which databases the consented group holds, and read the slug out of the first one.
///
/// The handshake is not ceremony: a streamable HTTP server may answer `initialize` with a session
/// identifier it then expects on every later request, so the two calls are one conversation rather
/// than two independent posts.
pub async fn look_up_organization(
    platform_token: &str,
    endpoint: &McpEndpoint,
) -> Result<OrganizationLookup, Error> {
    let client = build_client(MCP_REQUEST_TIMEOUT)?;

    let (_, session) = call(
        &client,
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

    let (listing, _) = call(
        &client,
        endpoint,
        platform_token,
        session.as_deref(),
        &json!({
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/call",
            "params": { "name": MCP_LIST_DATABASES, "arguments": {} }
        }),
    )
    .await?;

    let databases = databases_from(&listing)?;

    let Some(record) = databases.first() else {
        return Ok(OrganizationLookup::NoDatabaseYet);
    };

    let slug = slug_from_hostname(&record.name, &record.hostname).ok_or_else(|| {
        // the hostname itself is withheld: it carries a customer's database name.
        Error::Integrity {
            message: "turso returned a database hostname this application cannot read an \
                      organization out of. Setting up an organization needs the account's \
                      support."
                .to_string(),
        }
    })?;

    Ok(OrganizationLookup::Found(TursoOrganization {
        slug,
        group: record.group.clone(),
    }))
}

/// The organization this machine's consent is over: asked for once, and remembered.
///
/// **Nothing asks twice.** The lookup is the one thing in this effort that depends on a surface
/// Turso versions for agents, so every call after the first is answered from this machine's own
/// store and no request leaves the process. `None` is an empty group rather than a failure, and
/// the caller creates the first database and reads the slug out of what comes back.
pub async fn organization(
    store: &mut Persisted<RemoteSyncStore>,
    platform_token: &str,
    endpoint: &McpEndpoint,
) -> Result<Option<TursoOrganization>, Error> {
    if let Some(known) = store.turso_organization.clone() {
        return Ok(Some(known));
    }

    match look_up_organization(platform_token, endpoint).await? {
        OrganizationLookup::Found(organization) => {
            store.turso_organization = Some(organization.clone());
            store.commit()?;

            Ok(Some(organization))
        }
        OrganizationLookup::NoDatabaseYet => Ok(None),
    }
}

/// Post one JSON-RPC message and return what came back, with any session identifier.
///
/// **Three failures are three answers.** A request that never arrives is `Network`, because
/// retrying is the sensible response and nothing is wrong with the account. A refusal from the
/// server is `NotConfigured` and its message names setting up rather than syncing, because
/// whoever sees it is on a first run and has no workspace to sync. A reply that is not the shape
/// this expects is `Integrity`, which is a defect here rather than anything the customer did.
async fn call(
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
        return Err(refused(status.as_u16()));
    }

    let message = json_rpc_body(&body)?;

    // a JSON-RPC error is a 200 carrying a refusal, so the status alone does not settle it.
    if let Some(error) = message.get("error") {
        let code = error
            .get("code")
            .and_then(Value::as_i64)
            .unwrap_or_default();
        return Err(refused_with_code(code));
    }

    Ok((message, session))
}

/// **A refusal never quotes Turso back.** The message reaching a screen is ours, so that a
/// server-side string can never become the instruction a customer follows.
fn refused(status: u16) -> Error {
    Error::NotConfigured {
        message: format!(
            "turso refused this application's request to identify the account ({status}). \
             Setting up an organization needs the consent granted again."
        ),
    }
}

fn refused_with_code(code: i64) -> Error {
    Error::NotConfigured {
        message: format!(
            "turso refused this application's request to identify the account (rpc {code}). \
             Setting up an organization needs the consent granted again."
        ),
    }
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

/// Pull the database records out of a `tools/call` result.
///
/// A tool result carries its payload either as `structuredContent` or as text inside `content`,
/// and the same tool may move between them across versions. Both are read, and the array may be
/// bare or under a `databases` key, for the same reason.
fn databases_from(message: &Value) -> Result<Vec<DatabaseRecord>, Error> {
    let result = message.get("result").ok_or_else(unreadable_listing)?;

    let payload = if let Some(structured) = result.get("structuredContent") {
        structured.clone()
    } else {
        let text = result
            .get("content")
            .and_then(Value::as_array)
            .and_then(|content| {
                content
                    .iter()
                    .filter_map(|part| part.get("text").and_then(Value::as_str))
                    .next()
            })
            .ok_or_else(unreadable_listing)?;

        serde_json::from_str::<Value>(text).map_err(|_| unreadable_listing())?
    };

    let array = match &payload {
        Value::Array(_) => payload.clone(),
        Value::Object(fields) => fields
            .get("databases")
            .cloned()
            .ok_or_else(unreadable_listing)?,
        _ => return Err(unreadable_listing()),
    };

    serde_json::from_value::<Vec<DatabaseRecord>>(array).map_err(|_| unreadable_listing())
}

fn unreadable_listing() -> Error {
    Error::Integrity {
        message: "turso listed the account's databases in a shape this application cannot read."
            .to_string(),
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use crate::sync::google::test::server::{ScriptedResponse, ScriptedServer};

    use crate::{persisted::Persisted, sync::store::RemoteSyncStore};

    use super::{
        McpEndpoint, OrganizationLookup, TursoOrganization, look_up_organization, organization,
        slug_from_hostname,
    };

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

    /// A directory of this machine's own, the way every other test here makes one. No crate is
    /// added for it: `std::env::temp_dir` is what `database/mod.rs` and `export.rs` already use.
    fn temporary_directory(name: &str) -> std::path::PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("the clock is before the epoch")
            .as_nanos();
        let directory = std::env::temp_dir().join(format!("rentable-{name}-{nanos}"));
        std::fs::create_dir_all(&directory).expect("no temporary directory");

        directory
    }

    /// A store on disk, so the remembering is the real thing rather than a field in a test.
    fn load_store(directory: &std::path::Path) -> Persisted<RemoteSyncStore> {
        Persisted::<RemoteSyncStore>::load(directory.join("remote-sync.json"))
            .expect("the store could not be loaded")
    }

    #[test]
    fn a_slug_is_what_is_left_when_the_database_name_is_taken_off_the_front() {
        assert_eq!(
            slug_from_hostname("ledger", "ledger-acme.aws-us-east-1.turso.io").as_deref(),
            Some("acme")
        );
    }

    /// The criterion this module exists for: both halves of the first label may carry dashes, so
    /// a split would have to guess and subtraction does not.
    #[test]
    fn dashes_in_both_the_name_and_the_slug_are_not_a_parse_problem() {
        assert_eq!(
            slug_from_hostname(
                "control-plane-live-test",
                "control-plane-live-test-rentable-co.aws-eu-west-1.turso.io"
            )
            .as_deref(),
            Some("rentable-co"),
            "the slug was not read by subtracting the record's own name"
        );
    }

    #[test]
    fn a_hostname_that_does_not_carry_the_name_yields_no_slug() {
        assert_eq!(
            slug_from_hostname("ledger", "something-else.aws-us-east-1.turso.io"),
            None
        );
        assert_eq!(
            slug_from_hostname("ledger", "ledger-acme.example.com"),
            None
        );
        assert_eq!(
            slug_from_hostname("ledger", "ledger-.aws-us-east-1.turso.io"),
            None,
            "an empty slug was accepted"
        );
    }

    #[tokio::test]
    async fn one_lookup_reads_the_slug_and_the_group_out_of_the_listing() {
        let server = ScriptedServer::start(vec![
            handshake(),
            listing(json!([{
                "Name": "control-plane",
                "hostname": "control-plane-rentable.aws-eu-west-1.turso.io",
                "group": "rentable",
                "organization_id": "d0b1f4c2-0000-4000-8000-000000000000"
            }])),
        ])
        .await;

        let found = look_up_organization(TOKEN, &McpEndpoint::at(&server.url("")))
            .await
            .expect("the lookup failed");

        assert_eq!(
            found,
            OrganizationLookup::Found(TursoOrganization {
                slug: "rentable".to_string(),
                group: "rentable".to_string(),
            })
        );
        assert_eq!(
            server.request_count(),
            2,
            "the handshake or the call is missing"
        );
    }

    /// The record as `list_databases` really sends it, measured live on 2026-08-31.
    ///
    /// Turso spells the host twice in one record, `Hostname` and `hostname`, carrying the same
    /// value in both. Every other field is here so this stays a fixture of the measured shape
    /// rather than of the two keys the parse happens to read.
    #[tokio::test]
    async fn a_record_that_spells_the_host_twice_is_still_one_record() {
        let server = ScriptedServer::start(vec![
            handshake(),
            listing(json!([{
                "DbId": "01a02c28-0000-4000-8000-000000000000",
                "Hostname": "control-plane-rentable.aws-eu-west-1.turso.io",
                "Name": "control-plane",
                "auth_role_id": "ca9acde8-0000-4000-8000-000000000000",
                "block_reads": false,
                "block_writes": false,
                "delete_protection": false,
                "engine": "libsql",
                "group": "rentable",
                "group_id": "22b43299-0000-4000-8000-000000000000",
                "hostname": "control-plane-rentable.aws-eu-west-1.turso.io",
                "organization_id": "84b7507f-0000-4000-8000-000000000000",
                "parent": null,
                "primaryRegion": "aws-eu-west-1",
                "regions": ["aws-eu-west-1"]
            }])),
        ])
        .await;

        let found = look_up_organization(TOKEN, &McpEndpoint::at(&server.url("")))
            .await
            .expect("a record carrying both spellings of the host was rejected");

        assert_eq!(
            found,
            OrganizationLookup::Found(TursoOrganization {
                slug: "rentable".to_string(),
                group: "rentable".to_string(),
            })
        );
    }

    /// Requirement 3 asks the customer for an *empty* group, so this is the ordinary first run.
    #[tokio::test]
    async fn an_empty_group_is_an_answer_rather_than_a_failure() {
        let server = ScriptedServer::start(vec![handshake(), listing(json!([]))]).await;

        let found = look_up_organization(TOKEN, &McpEndpoint::at(&server.url("")))
            .await
            .expect("an empty group was reported as a failure");

        assert_eq!(found, OrganizationLookup::NoDatabaseYet);
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
            OrganizationLookup::Found(TursoOrganization {
                slug: "acme".to_string(),
                group: "rents".to_string(),
            })
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

    /// Criterion 4: the slug is stored locally and a second provisioning call asks nothing.
    #[tokio::test]
    async fn the_second_call_reads_the_store_and_makes_no_request() {
        let directory = temporary_directory("discovery-remembers");
        let mut store = load_store(&directory);

        let server = ScriptedServer::start(vec![
            handshake(),
            listing(json!([{
                "Name": "ledger",
                "hostname": "ledger-acme.aws-us-east-1.turso.io",
                "group": "rents"
            }])),
        ])
        .await;
        let endpoint = McpEndpoint::at(&server.url(""));

        let first = organization(&mut store, TOKEN, &endpoint)
            .await
            .expect("the first lookup failed");
        let after_first = server.request_count();

        let second = organization(&mut store, TOKEN, &endpoint)
            .await
            .expect("the second lookup failed");

        assert_eq!(first, second);
        assert_eq!(
            first.map(|organization| organization.slug),
            Some("acme".to_string())
        );
        assert_eq!(
            server.request_count(),
            after_first,
            "a second provisioning call reached the mcp server"
        );

        // and it survives the process, which is what makes it storage rather than a cache.
        let reopened = load_store(&directory);
        assert_eq!(
            reopened
                .turso_organization
                .as_ref()
                .map(|it| it.slug.as_str()),
            Some("acme")
        );
    }

    /// An empty group is remembered as nothing, so the next run asks again rather than believing
    /// the account has no organization.
    #[tokio::test]
    async fn an_empty_group_is_not_remembered_as_an_answer() {
        let directory = temporary_directory("discovery-empty-group");
        let mut store = load_store(&directory);

        let server = ScriptedServer::start(vec![handshake(), listing(json!([]))]).await;

        let found = organization(&mut store, TOKEN, &McpEndpoint::at(&server.url("")))
            .await
            .expect("an empty group was reported as a failure");

        assert_eq!(found, None);
        assert_eq!(store.turso_organization, None);
    }

    /// **Live, and the only thing here that reaches Turso.** One real consent, one
    /// `list_databases`, and the slug that comes back is the account it was granted on.
    ///
    /// Admitted by name in ticket 22 of effort 819. Reads and creates nothing
    /// ([[references/turso]], *Never run*).
    #[tokio::test]
    #[ignore = "reaches a live Turso account; see the module comment above for how to run it"]
    async fn discovery_live_reads_the_slug_off_a_real_account() {
        let read = |name: &str| {
            std::env::var(name)
                .ok()
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| {
                    panic!("{name} is needed for a live run; see the module comment above")
                })
        };

        // [[rules/testing]]: `#[ignore]` is not the whole gate, because `cargo test -- --ignored`
        // asks for every ignored test in the crate rather than for this one. A sweep that nobody
        // meant as a live run fails here instead of reaching Turso.
        assert_eq!(
            read("RENTABLE_LIVE_TURSO"),
            "1",
            "a live run is armed by RENTABLE_LIVE_TURSO=1 as well as by --ignored"
        );

        let token = read("TURSO_CONSENT_TOKEN");
        let expected = read("TURSO_ORG");

        let found = look_up_organization(&token, &McpEndpoint::production())
            .await
            .expect("the live lookup failed");

        match found {
            OrganizationLookup::Found(organization) => {
                assert_eq!(
                    organization.slug, expected,
                    "the slug read out of a real hostname is not the account the \
                     consent was granted on"
                );
                // the group is reported and the database names it came from are not.
                eprintln!("slug {} in group {}", organization.slug, organization.group);
            }
            OrganizationLookup::NoDatabaseYet => panic!(
                "the consented group holds no database, so this run measured nothing. \
                 Point it at a group with one, or run it after ticket 05 creates the first."
            ),
        }
    }
}
