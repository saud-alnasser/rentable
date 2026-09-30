//! what the consented group is called: read out of the consent token's payload by its identity,
//! and named off the MCP server's own listing where its tool set offers one.

use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD as BASE64URL};
use serde_json::{Value, json};

use super::{
    MCP_REQUEST_TIMEOUT, McpEndpoint,
    mcp::{call, handshake, tool_refusal},
};
use crate::{error::Error, http::build_client};

/// The tool that names the groups a consent can see, where the server offers one.
///
/// **It was not in the tool set read on 2026-09-11**, which is why the first run had nothing to
/// learn the name from and the walk ended up asking. The set is versioned at `v0.1.0` and Turso
/// moves it, so the name is asked for rather than assumed: [`group_listing_tool`] reads
/// `tools/list` and takes this where it is offered, one tool that both names groups and lists
/// where it is spelled some other way, and nothing at all otherwise.
const MCP_LIST_GROUPS: &str = "list_groups";

/// What Turso's consent token calls the group it was granted over, in its own payload. The name
/// is not in there, which is why [`group_uuid_of`] answers an identity rather than a word a
/// screen could show anybody.
const GROUP_UUID_CLAIM: &str = "group_uuid";

/// The group the consent was granted over, by the identity its own token carries.
///
/// **The token is read here and no part of it leaves Rust** ([[rules/credentials]], *Client
/// boundary*). What is read is one claim, and what is done with it is naming a group in a
/// request to the server that issued the token: it is an identity rather than a name, so there
/// is nothing here a screen could show anybody and nothing that would help them if it did.
///
/// **Nothing is verified, deliberately.** A signature this application checked would be checked
/// against a key it does not hold, and the claim is not being trusted for anything: Turso
/// decides whether the group named is one this consent may create in, exactly as it does for a
/// name a person typed.
///
/// A token that is not three dot-separated segments, whose payload is not base64url, whose
/// payload is not JSON, or which carries no `group_uuid` string answers `None`, and the caller
/// has one name fewer to try.
pub fn group_uuid_of(platform_token: &str) -> Option<String> {
    let mut segments = platform_token.split('.');
    let (_header, payload) = (segments.next()?, segments.next()?);

    // three and no more: a JWT is header, payload and signature, and anything else is a string
    // this has no reason to read a claim out of.
    segments.next()?;

    if segments.next().is_some() {
        return None;
    }

    let decoded = BASE64URL.decode(payload).ok()?;
    let claims = serde_json::from_slice::<Value>(&decoded).ok()?;

    claims
        .get(GROUP_UUID_CLAIM)
        .and_then(Value::as_str)
        .map(str::to_string)
        .filter(|uuid| !uuid.is_empty())
}

/// One group as a listing names it: a word for a person, and an identity for a machine.
///
/// **Both halves are needed and neither is enough.** The consent's token carries the uuid and
/// not the name ([`group_uuid_of`]), and a create takes the name and not the uuid, so a listing
/// that carries the pair is the only thing that joins them.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GroupRecord {
    pub name: String,
    pub uuid: String,
}

/// Read one group out of a listing record.
///
/// **Both spellings of the name are read, and by hand rather than by an alias.** The databases
/// listing capitalises its own `Name` and a live record carried both spellings at once, which
/// serde reads as a duplicate field and rejects ([`DatabaseRecord`](super::DatabaseRecord) says so where it declines an
/// alias). Reading the two keys in order is the same tolerance with none of that risk.
pub fn group_record_from(value: &Value) -> Option<GroupRecord> {
    let field = |first: &str, second: &str| {
        value
            .get(first)
            .or_else(|| value.get(second))
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|read| !read.is_empty())
            .map(str::to_string)
    };

    Some(GroupRecord {
        name: field("name", "Name")?,
        uuid: field("uuid", "Uuid")?,
    })
}

/// The group a listing names, given what the consent says it is over.
///
/// **The uuid decides wherever both sides carry one**, because it is an identity and matching it
/// is not a reading of anything. Where it does not, a listing holding one group holds the answer,
/// and a listing holding several does not: a guess here would make the organization in a group
/// the owner keeps something else in, which is exactly what requirement 21 refuses.
pub fn group_named_in(groups: &[GroupRecord], group_uuid: Option<&str>) -> Option<String> {
    if let Some(uuid) = group_uuid
        && let Some(found) = groups.iter().find(|group| group.uuid == uuid)
    {
        return Some(found.name.clone());
    }

    match groups {
        [only] => Some(only.name.clone()),
        _ => None,
    }
}

/// Ask the MCP server what the consented group is called.
///
/// **The first of the two ways a first run learns the name without asking anybody.** The token
/// carries the group's uuid and not its name, an empty group has no database to read one off, and
/// the person picked the group in a browser a minute earlier. Where the server offers a tool that
/// lists groups, the pair is right there.
///
/// **Nothing here creates anything** ([[references/turso]], *Never run*): `tools/list` and one
/// listing call, both reads.
///
/// **Every way of not knowing is `None` rather than an answer.** A server with no such tool, a
/// tool that refused, a payload in a shape this cannot read, or a listing whose groups the uuid
/// does not name and which holds more than one: each of them is this probe having nothing to say,
/// and the caller has another way to try. What is still an `Err` is the conversation itself
/// failing, which [`call`] says in the three ways it says everything else.
pub async fn group_from_mcp(
    platform_token: &str,
    endpoint: &McpEndpoint,
    group_uuid: Option<&str>,
) -> Result<Option<String>, Error> {
    let client = build_client(MCP_REQUEST_TIMEOUT)?;
    let session = handshake(&client, endpoint, platform_token).await?;

    let Some(tool) =
        group_listing_tool(&client, endpoint, platform_token, session.as_deref()).await?
    else {
        return Ok(None);
    };

    let (listed, _) = call(
        &client,
        endpoint,
        platform_token,
        session.as_deref(),
        &json!({
            "jsonrpc": "2.0",
            "id": 5,
            "method": "tools/call",
            "params": { "name": tool, "arguments": {} }
        }),
    )
    .await?;

    // a tool that refused said why, and nothing here would be helped by knowing: the reason
    // reaches nobody, because the next way of naming the group is about to be tried.
    if tool_refusal(&listed).is_some() {
        return Ok(None);
    }

    Ok(group_named_in(&groups_from(&listed), group_uuid))
}

/// Which of the server's tools lists groups, where one of them does.
///
/// The documented name is taken as it stands. A server that spells it otherwise is still offering
/// the one thing being asked for, so a single tool whose name both says groups and says listing
/// is taken as it; two of them are a choice this has no way to make, and none is a server that
/// cannot answer the question.
async fn group_listing_tool(
    client: &reqwest::Client,
    endpoint: &McpEndpoint,
    platform_token: &str,
    session: Option<&str>,
) -> Result<Option<String>, Error> {
    let (offered, _) = call(
        client,
        endpoint,
        platform_token,
        session,
        &json!({ "jsonrpc": "2.0", "id": 4, "method": "tools/list", "params": {} }),
    )
    .await?;

    let names = offered
        .pointer("/result/tools")
        .and_then(Value::as_array)
        .map(|tools| {
            tools
                .iter()
                .filter_map(|tool| tool.get("name").and_then(Value::as_str))
                .map(str::to_string)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    if names.iter().any(|name| name == MCP_LIST_GROUPS) {
        return Ok(Some(MCP_LIST_GROUPS.to_string()));
    }

    let mut listing = names.into_iter().filter(|name| {
        let name = name.to_lowercase();

        name.contains("group") && name.contains("list")
    });

    Ok(match (listing.next(), listing.next()) {
        (Some(only), None) => Some(only),
        _ => None,
    })
}

/// Pull the group records out of a `tools/call` result, in the shapes [`databases_from`](super::databases_from) reads.
///
/// **A shape this cannot read is no groups rather than a failure**, which is the one difference
/// from the databases listing: that one is the slug's only source and a caller that cannot read
/// it has nowhere to go, where this is a probe with a way of its own to be answered nothing.
fn groups_from(message: &Value) -> Vec<GroupRecord> {
    let Some(result) = message.get("result") else {
        return Vec::new();
    };

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
            });

        match text.and_then(|text| serde_json::from_str::<Value>(text).ok()) {
            Some(payload) => payload,
            None => return Vec::new(),
        }
    };

    let array = match &payload {
        Value::Array(records) => records.clone(),
        Value::Object(fields) => match fields.get("groups").and_then(Value::as_array) {
            Some(records) => records.clone(),
            None => return Vec::new(),
        },
        _ => return Vec::new(),
    };

    array.iter().filter_map(group_record_from).collect()
}

#[cfg(test)]
mod tests {
    use crate::sync::test::server::{ScriptedResponse, ScriptedServer};
    use crate::turso::discovery::{McpEndpoint, group_from_mcp, group_uuid_of};
    use base64::Engine as _;
    use base64::engine::general_purpose::URL_SAFE_NO_PAD as BASE64URL;
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

    /// What `tools/list` answers, carrying whichever tool names to offer.
    fn tools(names: &[&str]) -> ScriptedResponse {
        let offered = names
            .iter()
            .map(|name| {
                json!({
                    "name": name,
                    "description": "what the tool does, which nothing here reads",
                    "inputSchema": { "type": "object", "properties": {} }
                })
            })
            .collect::<Vec<_>>();

        ScriptedResponse::new(
            200,
            json!({ "jsonrpc": "2.0", "id": 4, "result": { "tools": offered } }).to_string(),
        )
    }

    /// The third name the first create tries, and the one nobody types: the consent's own token
    /// carries the group's identity in its payload, so a run that has been refused twice has one
    /// more thing to try before it asks anybody anything.
    #[tokio::test]
    async fn the_group_uuid_is_read_out_of_the_consent_tokens_payload() {
        let payload = BASE64URL.encode(
            json!({ "org_id": 26543, "group_uuid": "6f5b6f60-1d4a-4b4a-9c2e-0b0a1d2c3e4f" })
                .to_string(),
        );
        let token = format!("{}.{payload}.{}", BASE64URL.encode("{}"), "a-signature");

        assert_eq!(
            group_uuid_of(&token).as_deref(),
            Some("6f5b6f60-1d4a-4b4a-9c2e-0b0a1d2c3e4f")
        );
    }

    /// And every shape that is not that answers nothing, because the caller's next step is to ask
    /// the person rather than to send a name it made up.
    #[tokio::test]
    async fn a_token_that_carries_no_group_uuid_answers_nothing() {
        let with = |claims: serde_json::Value| {
            format!(
                "{}.{}.{}",
                BASE64URL.encode("{}"),
                BASE64URL.encode(claims.to_string()),
                "a-signature"
            )
        };

        // the plain string the tests here spend, which is what a token looked like before this.
        assert_eq!(group_uuid_of(TOKEN), None, "a token of one segment");
        assert_eq!(group_uuid_of("header.payload"), None, "two segments");
        assert_eq!(
            group_uuid_of(&format!("{}.x.y", with(json!({})))),
            None,
            "five segments"
        );
        assert_eq!(
            group_uuid_of(&format!(
                "{}.not-base64url!.{}",
                BASE64URL.encode("{}"),
                "s"
            )),
            None,
            "a payload that is not base64url"
        );
        assert_eq!(
            group_uuid_of(&format!(
                "{}.{}.{}",
                BASE64URL.encode("{}"),
                BASE64URL.encode("not json"),
                "s"
            )),
            None,
            "a payload that is not json"
        );
        assert_eq!(
            group_uuid_of(&with(json!({ "org_id": 26543 }))),
            None,
            "a payload with no claim"
        );
        assert_eq!(
            group_uuid_of(&with(json!({ "group_uuid": "" }))),
            None,
            "a claim with nothing in it"
        );
        assert_eq!(
            group_uuid_of(&with(json!({ "group_uuid": 7 }))),
            None,
            "a claim that is not a string"
        );
    }

    /// A groups listing inside a text part, the way `list_databases` answers.
    fn groups(records: serde_json::Value) -> ScriptedResponse {
        ScriptedResponse::new(
            200,
            json!({
                "jsonrpc": "2.0",
                "id": 5,
                "result": { "content": [{ "type": "text", "text": records.to_string() }] }
            })
            .to_string(),
        )
    }

    /// The group listing as Turso's own API shapes one, which is what a tool wrapping it sends.
    fn three_groups() -> serde_json::Value {
        json!({ "groups": [
            { "name": "rentable-empty", "uuid": CONSENTED, "locations": ["aws-eu-west-1"], "primary": "aws-eu-west-1" },
            { "name": "rents", "uuid": "11111111-1111-4111-8111-111111111111", "locations": [], "primary": "aws-eu-west-1" },
            { "name": "somebody-elses", "uuid": "22222222-2222-4222-8222-222222222222", "locations": [], "primary": "aws-eu-west-1" }
        ] })
    }

    /// The uuid the consent token carries in the tests below.
    const CONSENTED: &str = "6f5b6f60-1d4a-4b4a-9c2e-0b0a1d2c3e4f";

    /// **Ticket 21.** The first of the two ways a first run learns the group's name without
    /// asking: the consent's own uuid against the pairs a group listing carries.
    #[tokio::test]
    async fn the_group_the_consents_uuid_names_is_read_off_the_mcp_servers_listing() {
        let server = ScriptedServer::start(vec![
            handshake(),
            tools(&["list_databases", "create_database", "list_groups"]),
            groups(three_groups()),
        ])
        .await;

        let named = group_from_mcp(TOKEN, &McpEndpoint::at(&server.url("")), Some(CONSENTED))
            .await
            .expect("the group lookup failed");

        assert_eq!(named.as_deref(), Some("rentable-empty"));

        let asked: serde_json::Value = serde_json::from_str(&server.request(1).body).expect("json");

        assert_eq!(asked["method"], "tools/list");
        assert_eq!(asked["params"], json!({}), "tools/list takes empty params");

        let called: serde_json::Value =
            serde_json::from_str(&server.request(2).body).expect("json");

        assert_eq!(called["params"]["name"], "list_groups");
        assert_eq!(called["params"]["arguments"], json!({}));
        assert_eq!(
            server.request_count(),
            3,
            "the handshake, the tool set, and the listing"
        );
    }

    /// Where the uuid names none of them, one group is still an answer and three are not: a
    /// guess would create the organization in a group the owner keeps something else in.
    #[tokio::test]
    async fn one_group_is_the_answer_where_the_uuid_names_none_and_three_are_not() {
        let only = json!([{ "name": "rentable-empty", "uuid": "a-uuid-nobody-asked-for" }]);
        let server = ScriptedServer::start(vec![
            handshake(),
            tools(&["list_groups"]),
            // the payload as `structuredContent` and bare rather than under a key, which is the
            // other shape the same tool may answer in.
            ScriptedResponse::new(
                200,
                json!({ "jsonrpc": "2.0", "id": 5, "result": { "structuredContent": only } })
                    .to_string(),
            ),
        ])
        .await;

        assert_eq!(
            group_from_mcp(TOKEN, &McpEndpoint::at(&server.url("")), None)
                .await
                .expect("the group lookup failed")
                .as_deref(),
            Some("rentable-empty")
        );

        let several = ScriptedServer::start(vec![
            handshake(),
            tools(&["list_groups"]),
            groups(three_groups()),
        ])
        .await;

        assert_eq!(
            group_from_mcp(
                TOKEN,
                &McpEndpoint::at(&several.url("")),
                Some("a-uuid-none-of-them-carries")
            )
            .await
            .expect("the group lookup failed"),
            None,
            "one of three groups was picked for a uuid that names none of them"
        );
    }

    /// The tool set read on 2026-09-11, which is what sent this run looking elsewhere: no group
    /// tool, so the lookup answers nothing and nothing is called.
    #[tokio::test]
    async fn a_server_that_offers_no_group_tool_answers_nothing_rather_than_failing() {
        let server = ScriptedServer::start(vec![
            handshake(),
            tools(&["list_databases", "create_database", "delete_database"]),
        ])
        .await;

        assert_eq!(
            group_from_mcp(TOKEN, &McpEndpoint::at(&server.url("")), Some(CONSENTED))
                .await
                .expect("a server with no group tool was reported as a failure"),
            None
        );
        assert_eq!(
            server.request_count(),
            2,
            "a tool the server does not offer was called anyway"
        );
    }

    /// The set is Turso's and they move it, so the documented name is taken where it is there
    /// and a single tool that both names groups and lists is taken where it is not.
    #[tokio::test]
    async fn a_group_listing_tool_under_another_name_is_still_the_one_asked() {
        let server = ScriptedServer::start(vec![
            handshake(),
            tools(&["list_databases", "groups_list"]),
            groups(three_groups()),
        ])
        .await;

        assert_eq!(
            group_from_mcp(TOKEN, &McpEndpoint::at(&server.url("")), Some(CONSENTED))
                .await
                .expect("the group lookup failed")
                .as_deref(),
            Some("rentable-empty")
        );

        let two = ScriptedServer::start(vec![
            handshake(),
            tools(&["groups_list", "list_group_members"]),
        ])
        .await;

        assert_eq!(
            group_from_mcp(TOKEN, &McpEndpoint::at(&two.url("")), Some(CONSENTED))
                .await
                .expect("the group lookup failed"),
            None,
            "one of two tools that could have been the listing was chosen"
        );
    }

    /// A tool that refused is this probe having nothing to say, not a first run that stops: the
    /// caller has the Platform API to ask next and the cascade after that.
    #[tokio::test]
    async fn a_group_tool_that_refused_answers_nothing_rather_than_a_refusal() {
        let server = ScriptedServer::start(vec![
            handshake(),
            tools(&["list_groups"]),
            ScriptedResponse::new(
                200,
                json!({
                    "jsonrpc": "2.0",
                    "id": 5,
                    "result": {
                        "isError": true,
                        "content": [{ "type": "text", "text": "this token may not list groups" }]
                    }
                })
                .to_string(),
            ),
        ])
        .await;

        assert_eq!(
            group_from_mcp(TOKEN, &McpEndpoint::at(&server.url("")), Some(CONSENTED))
                .await
                .expect("a refused tool was reported as a failed lookup"),
            None
        );
    }
}
