//! Turning a consented token into the organization slug every Platform API path is built from.
//!
//! Every path `platform.rs` uses is `/v1/organizations/{slug}/...`,
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
//! per-database credential, which is what requirement 9's grants are made of. It supplies the slug,
//! and on a first run into an empty group it creates the one database the slug is then read from,
//! because the Platform API cannot create anything without a slug already in hand. Since
//! 2026-09-15 it is also asked what the consented group is called ([`group_from_mcp`]), where its
//! tool set offers a way to ask. Nothing else.
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

use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD as BASE64URL};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::{
    diagnostics, error::Error, http::build_client, persisted::Persisted, sync::RemoteSyncStore,
};

/// Where the MCP server lives, and the same value the consent names as its resource indicator.
/// The authority this spends was issued *for* this resource, which is why one string is both.
const TURSO_MCP_ENDPOINT: &str = "https://mcp.turso.ai/mcp";

/// The protocol revision `turso-cloud-mcp` answered `initialize` with on 2026-08-30.
const MCP_PROTOCOL_VERSION: &str = "2025-06-18";

const MCP_CLIENT_NAME: &str = "Rentable";

/// The tool that carries the hostname. It reads and creates nothing
/// ([[references/turso]], *Never run*).
const MCP_LIST_DATABASES: &str = "list_databases";

/// The one tool here that creates anything, and only on a first run into an empty group, where
/// nothing else can. Its schema, read off `tools/list` on 2026-09-11: `name` required, `group`
/// optional and defaulting to the organization's default, `size_limit` and `use_tursodb` optional.
/// **`group` is optional in the schema and was refused without one on 2026-09-15**, when a
/// request that named none answered `HTTP 403: group-scoped tokens must specify a group in the
/// request`. Whether that holds on every account is Turso's to say rather than this module's to
/// assume, so the caller decides what to name and this sends what it was handed;
/// `organization/setup.rs` holds the order the names are tried in.
const MCP_CREATE_DATABASE: &str = "create_database";

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

/// What a refused create says before Turso's own reason. A caller reading that reason back out
/// takes the prefix from here rather than keeping a second copy of the sentence.
pub const CREATE_REFUSED: &str = "turso could not create the organization's database: ";

const MCP_REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

/// How many times the listing is asked for a database just created, and how long between: a
/// create that answered is a database that exists, and a listing that lags it for a moment is
/// not a database in the wrong place.
const CREATED_LISTING_ATTEMPTS: u32 = 3;
const CREATED_LISTING_RETRY: Duration = Duration::from_secs(1);

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
    pub(crate) fn at(base: &str) -> Self {
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
    Found {
        organization: TursoOrganization,
        /// every database the consented group holds, by the name the listing gave it, and
        /// nothing from any other group. It is what `organization/setup.rs` reads to refuse a
        /// group that already holds an organization (requirement 21 of effort 826); the
        /// hostnames behind the names stay here, because a name is what a refusal can say out
        /// loud and a hostname is a customer's own address.
        databases: Vec<String>,
    },
    /// the group the consent was granted over holds no database yet.
    NoDatabaseYet,
}

/// The consented group, and what it was holding when this machine looked.
///
/// **`databases` is `None` where nothing was asked.** The lookup happens once and is remembered
/// ([`organization`]), so every call after the first answers out of this machine's own store and
/// has no listing to report. That is not the same answer as a group holding nothing: an empty
/// group is [`OrganizationLookup::NoDatabaseYet`] and never reaches here, so a `Some` is always
/// at least one name.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ConsentedGroup {
    pub organization: TursoOrganization,
    pub databases: Option<Vec<String>>,
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

/// One database the consented group holds: the name a refusal can say out loud, and the address
/// a replica of it opens at.
///
/// **The hostname is here and not in [`OrganizationLookup`]** for the reason that one keeps only
/// names: a refusal says a name to a person, and a hostname is a customer's own address with a
/// database name inside it. What needs the address is a machine connecting to an organization the
/// group already holds (effort 828, requirement 14), which reaches for the record rather than the
/// list of names.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GroupDatabase {
    pub name: String,
    pub hostname: String,
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
    match group_databases(platform_token, endpoint).await? {
        Some((organization, databases)) => Ok(OrganizationLookup::Found {
            organization,
            databases: databases
                .into_iter()
                .map(|database| database.name)
                .collect(),
        }),
        None => Ok(OrganizationLookup::NoDatabaseYet),
    }
}

/// The consented group as it stands: which Turso organization and group the consent turned out to
/// be over, and every database in it with its address. `None` where the group holds none.
///
/// **The listing behind [`look_up_organization`], with the addresses kept.** That one drops them
/// because what reads it is a refusal naming a database to a person; this one is read by
/// `organization/setup.rs` when a machine is connecting to an organization the group already
/// holds, which needs the address to open a replica at.
///
/// **Asked every time, and never answered from this machine's store.** [`organization`] remembers
/// the account because the account is a fact that does not change; what the group is *holding* is
/// the thing a caller here is deciding on, and answering that from a record written on an earlier
/// launch would decide it on what was true then.
pub async fn group_databases(
    platform_token: &str,
    endpoint: &McpEndpoint,
) -> Result<Option<(TursoOrganization, Vec<GroupDatabase>)>, Error> {
    let client = build_client(MCP_REQUEST_TIMEOUT)?;
    let session = handshake(&client, endpoint, platform_token).await?;
    let databases = list_databases(&client, endpoint, platform_token, session.as_deref()).await?;

    let Some(record) = databases.first() else {
        return Ok(None);
    };
    let organization = organization_of(record)?;

    // **the listing is filtered to the group the slug was read out of.** A group-scoped consent
    // lists one group, and the first record is the only thing here that names which one; a
    // listing that carried a second group would otherwise put a stranger's database in front of
    // a refusal that names the group the person picked.
    let held = databases
        .iter()
        .filter(|candidate| candidate.group == record.group)
        .map(|candidate| GroupDatabase {
            name: candidate.name.clone(),
            hostname: candidate.hostname.clone(),
        })
        .collect();

    Ok(Some((organization, held)))
}

/// What creating the first database in an empty group yields: the organization and the group the
/// consent turned out to be over, and the hostname of the database that answered it.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FirstDatabase {
    pub organization: TursoOrganization,
    pub hostname: String,
}

/// Create the first database in a group that holds none, and read the slug and the group out of
/// what comes back.
///
/// **The one create this module makes, and the reason it is here rather than in `platform.rs`.**
/// Requirement 3 asks the customer to prepare an *empty* group, so on the ordinary first run the
/// listing has nothing to read a slug from, and the Platform API cannot create anything without
/// that slug in its path and the group's name in its body. The MCP server needs neither: its
/// `create_database` tool takes a name, and the group-scoped token decides where it lands. The
/// reply's shape is undocumented (`additionalProperties: true`, read off `tools/list` on
/// 2026-09-11), so nothing is read out of it; the listing is asked again and the record carrying
/// the name just created is what answers, in the one shape this module already reads.
///
/// **The group is sent only where one was given.** Turso refused a create that named none on
/// 2026-09-15 (`HTTP 403: group-scoped tokens must specify a group in the request`, where until
/// then the tool defaulted to the token's own group), and an account it does not refuse that way
/// is one nobody has to be asked anything. So which name to send is the caller's:
/// `organization/setup.rs` tries no group, then Turso's own default, then [`group_uuid_of`], and
/// asks the person only where every one of those was refused over the group. A name that is not
/// the consent's group is refused by Turso, and the refusal is said in Turso's own words. Delete
/// protection is the Platform API's to turn on afterwards, once the slug is known.
pub async fn create_first_database(
    platform_token: &str,
    endpoint: &McpEndpoint,
    name: &str,
    group: Option<&str>,
) -> Result<FirstDatabase, Error> {
    let client = build_client(MCP_REQUEST_TIMEOUT)?;
    let session = handshake(&client, endpoint, platform_token).await?;

    // the tool's `group` is optional, so an attempt that has no name for one carries the name of
    // the database and nothing beside it.
    let mut arguments = json!({ "name": name });

    if let Some(group) = group {
        arguments["group"] = json!(group);
    }

    let (created, _) = call(
        &client,
        endpoint,
        platform_token,
        session.as_deref(),
        &json!({
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/call",
            "params": {
                "name": MCP_CREATE_DATABASE,
                "arguments": arguments
            }
        }),
    )
    .await?;

    // a tool that could not do what it was asked answers a result carrying `isError`, not a
    // json-rpc error, and its text is turso's own reason: a plan's limit, a name it will not
    // take, a group it could not find. Said as it was said, rather than as a listing that
    // happens not to carry the name afterwards.
    if let Some(reason) = tool_refusal(&created) {
        return Err(Error::PreconditionFailed {
            message: format!("{CREATE_REFUSED}{reason}"),
        });
    }

    // the reply's shape is undocumented, so a record read out of it is a convenience and the
    // listing is what is trusted; where the reply does carry the database just made, under its
    // own name, that is one round trip and one moment of listing lag fewer.
    if let Some(record) = record_from(&created, name) {
        return Ok(FirstDatabase {
            organization: organization_of(&record)?,
            hostname: record.hostname,
        });
    }

    for attempt in 1..=CREATED_LISTING_ATTEMPTS {
        if attempt > 1 {
            tokio::time::sleep(CREATED_LISTING_RETRY).await;
        }

        let databases =
            list_databases(&client, endpoint, platform_token, session.as_deref()).await?;

        if let Some(record) = databases.into_iter().find(|record| record.name == name) {
            return Ok(FirstDatabase {
                organization: organization_of(&record)?,
                hostname: record.hostname,
            });
        }

        diagnostics::warn("organization.create.databaseUnlisted")
            .with("attempt", attempt.to_string().as_str())
            .write();
    }

    Err(Error::Integrity {
        message: "turso created the organization's database somewhere this application \
                  cannot see. Setting up an organization needs the account's support."
            .to_string(),
    })
}

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
/// serde reads as a duplicate field and rejects ([`DatabaseRecord`] says so where it declines an
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

/// Pull the group records out of a `tools/call` result, in the shapes [`databases_from`] reads.
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

/// The reason a tool gave for refusing, where the reply is a result flagged `isError`.
fn tool_refusal(message: &Value) -> Option<String> {
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

/// The database record a create reply carries, where it carries one under the name asked for:
/// as `structuredContent`, as `structuredContent.database`, or as the same two shapes inside
/// the text content. Anything else is `None`, and the listing decides.
fn record_from(message: &Value, name: &str) -> Option<DatabaseRecord> {
    let result = message.get("result")?;
    let mut candidates = Vec::new();

    if let Some(structured) = result.get("structuredContent") {
        candidates.push(structured.clone());
    }

    if let Some(content) = result.get("content").and_then(Value::as_array) {
        for text in content
            .iter()
            .filter_map(|part| part.get("text").and_then(Value::as_str))
        {
            if let Ok(value) = serde_json::from_str::<Value>(text) {
                candidates.push(value);
            }
        }
    }

    candidates
        .into_iter()
        .flat_map(|candidate| {
            let nested = candidate.get("database").cloned();
            [Some(candidate), nested]
        })
        .flatten()
        .filter_map(|candidate| serde_json::from_value::<DatabaseRecord>(candidate).ok())
        .find(|record| record.name == name && !record.hostname.is_empty())
}

/// `initialize`, and the session it opened where the server opened one.
async fn handshake(
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

/// One `list_databases`, inside a conversation the handshake opened.
async fn list_databases(
    client: &reqwest::Client,
    endpoint: &McpEndpoint,
    platform_token: &str,
    session: Option<&str>,
) -> Result<Vec<DatabaseRecord>, Error> {
    let (listing, _) = call(
        client,
        endpoint,
        platform_token,
        session,
        &json!({
            "jsonrpc": "2.0",
            "id": 3,
            "method": "tools/call",
            "params": { "name": MCP_LIST_DATABASES, "arguments": {} }
        }),
    )
    .await?;

    databases_from(&listing)
}

/// The organization and group one record names.
fn organization_of(record: &DatabaseRecord) -> Result<TursoOrganization, Error> {
    let slug = slug_from_hostname(&record.name, &record.hostname).ok_or_else(|| {
        // the hostname itself is withheld: it carries a customer's database name.
        Error::Integrity {
            message: "turso returned a database hostname this application cannot read an \
                      organization out of. Setting up an organization needs the account's \
                      support."
                .to_string(),
        }
    })?;

    Ok(TursoOrganization {
        slug,
        group: record.group.clone(),
    })
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
) -> Result<Option<ConsentedGroup>, Error> {
    if let Some(known) = store.turso_organization.clone() {
        return Ok(Some(ConsentedGroup {
            organization: known,
            databases: None,
        }));
    }

    match look_up_organization(platform_token, endpoint).await? {
        OrganizationLookup::Found {
            organization,
            databases,
        } => {
            store.turso_organization = Some(organization.clone());
            store.commit()?;

            Ok(Some(ConsentedGroup {
                organization,
                databases: Some(databases),
            }))
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
    use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD as BASE64URL};
    use serde_json::json;

    use crate::sync::test::server::{ScriptedResponse, ScriptedServer};

    use crate::{persisted::Persisted, sync::store::RemoteSyncStore};

    use super::{
        ConsentedGroup, FirstDatabase, McpEndpoint, OrganizationLookup, TursoOrganization,
        create_first_database, group_from_mcp, group_uuid_of, look_up_organization, organization,
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

    /// The first run into the empty group requirement 3 asks for: `create_database` by name and
    /// nothing else, then the listing read again, and the slug and the group taken off the record
    /// that carries the name just created rather than off the create's own reply.
    #[tokio::test]
    async fn the_first_database_is_created_by_name_and_read_back_out_of_the_listing() {
        let server = ScriptedServer::start(vec![
            handshake(),
            ScriptedResponse::new(
                200,
                json!({ "jsonrpc": "2.0", "id": 2, "result": { "content": [{ "type": "text", "text": "created" }] } })
                    .to_string(),
            ),
            listing(json!([{
                "Name": "org-7f3a",
                "hostname": "org-7f3a-acme-co.aws-eu-west-1.turso.io",
                "group": "rentable-empty"
            }])),
        ])
        .await;

        let first =
            create_first_database(TOKEN, &McpEndpoint::at(&server.url("")), "org-7f3a", None)
                .await
                .expect("the first create failed");

        assert_eq!(
            first,
            FirstDatabase {
                organization: TursoOrganization {
                    slug: "acme-co".to_string(),
                    group: "rentable-empty".to_string(),
                },
                hostname: "org-7f3a-acme-co.aws-eu-west-1.turso.io".to_string(),
            }
        );

        let create = server.request(1);
        let payload: serde_json::Value = serde_json::from_str(&create.body).expect("json");

        assert_eq!(payload["method"], "tools/call");
        assert_eq!(payload["params"]["name"], "create_database");
        assert_eq!(
            payload["params"]["arguments"],
            json!({ "name": "org-7f3a" }),
            "an attempt with no group for it named one anyway"
        );
        assert_eq!(
            server.request_count(),
            3,
            "handshake, create, listing, and nothing else"
        );
    }

    /// The same create, with a group to name. **The argument appears only here**: an account that
    /// takes a create naming no group is one nobody has to be asked anything, so the name rides
    /// along only where the caller had one to send.
    #[tokio::test]
    async fn the_create_names_the_group_only_where_one_was_given() {
        let server = ScriptedServer::start(vec![
            handshake(),
            ScriptedResponse::new(
                200,
                json!({ "jsonrpc": "2.0", "id": 2, "result": { "content": [{ "type": "text", "text": "created" }] } })
                    .to_string(),
            ),
            listing(json!([{
                "Name": "org-7f3a",
                "hostname": "org-7f3a-acme-co.aws-eu-west-1.turso.io",
                "group": "rentable-empty"
            }])),
        ])
        .await;

        create_first_database(
            TOKEN,
            &McpEndpoint::at(&server.url("")),
            "org-7f3a",
            Some("rentable-empty"),
        )
        .await
        .expect("the create failed");

        let payload: serde_json::Value =
            serde_json::from_str(&server.request(1).body).expect("json");

        assert_eq!(
            payload["params"]["arguments"],
            json!({ "name": "org-7f3a", "group": "rentable-empty" }),
            "the create names the group it was given, and carries nothing else"
        );
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

    /// A database the listing cannot see is a database in the wrong place, and the create is
    /// reported as a failure rather than as a slug read off some other record.
    #[tokio::test]
    async fn a_created_database_the_listing_does_not_carry_is_a_failure_not_a_guess() {
        let elsewhere = || {
            listing(json!([{
                "Name": "somebody-elses",
                "hostname": "somebody-elses-acme-co.aws-eu-west-1.turso.io",
                "group": "other"
            }]))
        };
        let server = ScriptedServer::start(vec![
            handshake(),
            ScriptedResponse::new(
                200,
                json!({ "jsonrpc": "2.0", "id": 2, "result": { "content": [] } }).to_string(),
            ),
            elsewhere(),
            elsewhere(),
            elsewhere(),
        ])
        .await;

        let error =
            create_first_database(TOKEN, &McpEndpoint::at(&server.url("")), "org-7f3a", None)
                .await
                .expect_err("a slug was read off a record that is not the created database");

        assert!(
            matches!(error, crate::error::Error::Integrity { .. }),
            "{error:?}"
        );
        assert!(
            error.to_string().contains("Setting up an organization"),
            "{error}"
        );
        assert_eq!(
            server.request_count(),
            5,
            "the listing was not asked again before the create was called a failure"
        );
    }

    /// A tool that could not create the database says why in a result flagged `isError`, and
    /// that reason is what the person reads, not a listing that lacks the name afterwards.
    #[tokio::test]
    async fn a_create_the_tool_refused_is_said_in_tursos_own_words_and_nothing_is_listed() {
        let server = ScriptedServer::start(vec![
            handshake(),
            ScriptedResponse::new(
                200,
                json!({
                    "jsonrpc": "2.0",
                    "id": 2,
                    "result": {
                        "isError": true,
                        "content": [{ "type": "text", "text": "database limit reached for plan" }]
                    }
                })
                .to_string(),
            ),
        ])
        .await;

        let error =
            create_first_database(TOKEN, &McpEndpoint::at(&server.url("")), "org-7f3a", None)
                .await
                .expect_err("a refused create was read as a database");

        assert!(
            matches!(error, crate::error::Error::PreconditionFailed { .. }),
            "{error:?}"
        );
        assert!(
            error
                .to_string()
                .contains("database limit reached for plan"),
            "turso's reason is not in the sentence: {error}"
        );
        assert_eq!(
            server.request_count(),
            2,
            "a refused create was followed by a listing"
        );
    }

    /// Where the reply carries the record it made, under the name asked for, that is the
    /// answer and no listing is asked.
    #[tokio::test]
    async fn a_create_reply_that_carries_the_record_is_read_without_a_listing() {
        let server = ScriptedServer::start(vec![
            handshake(),
            ScriptedResponse::new(
                200,
                json!({
                    "jsonrpc": "2.0",
                    "id": 2,
                    "result": {
                        "content": [{ "type": "text", "text": "created" }],
                        "structuredContent": {
                            "database": {
                                "Name": "org-7f3a",
                                "hostname": "org-7f3a-acme-co.aws-eu-west-1.turso.io",
                                "group": "rentable-empty"
                            }
                        }
                    }
                })
                .to_string(),
            ),
        ])
        .await;

        let first =
            create_first_database(TOKEN, &McpEndpoint::at(&server.url("")), "org-7f3a", None)
                .await
                .expect("the create failed");

        assert_eq!(first.organization.slug, "acme-co");
        assert_eq!(first.organization.group, "rentable-empty");
        assert_eq!(
            server.request_count(),
            2,
            "the reply carried the record and a listing was asked anyway"
        );
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
            OrganizationLookup::Found {
                organization: TursoOrganization {
                    slug: "rentable".to_string(),
                    group: "rentable".to_string(),
                },
                databases: vec!["control-plane".to_string()],
            }
        );
        assert_eq!(
            server.request_count(),
            2,
            "the handshake or the call is missing"
        );
    }

    /// Requirement 21 of effort 826: a first run has to know what the group it consented over
    /// already holds, so the lookup reports every name in that group and nothing from any other.
    /// A listing carrying a second group is what a token wider than one group would answer, and
    /// a name from it in this list would put a database the person never picked in front of a
    /// refusal naming the group they did.
    #[tokio::test]
    async fn the_lookup_reports_the_names_in_the_consented_group_and_no_others() {
        let server = ScriptedServer::start(vec![
            handshake(),
            listing(json!([
                {
                    "Name": "ledger",
                    "hostname": "ledger-acme.aws-eu-west-1.turso.io",
                    "group": "rents"
                },
                {
                    "Name": "org-7f3a",
                    "hostname": "org-7f3a-acme.aws-eu-west-1.turso.io",
                    "group": "rents"
                },
                {
                    "Name": "somebody-elses",
                    "hostname": "somebody-elses-acme.aws-eu-west-1.turso.io",
                    "group": "another-group"
                }
            ])),
        ])
        .await;

        let found = look_up_organization(TOKEN, &McpEndpoint::at(&server.url("")))
            .await
            .expect("the lookup failed");

        let OrganizationLookup::Found {
            organization,
            databases,
        } = found
        else {
            panic!("a populated group was read as empty");
        };

        assert_eq!(organization.group, "rents");
        assert_eq!(
            databases,
            vec!["ledger".to_string(), "org-7f3a".to_string()],
            "the names the consented group holds are not what was reported"
        );
        assert!(
            !databases.iter().any(|name| name == "somebody-elses"),
            "a database of another group was reported as the consented group's: {databases:?}"
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
            OrganizationLookup::Found {
                organization: TursoOrganization {
                    slug: "rentable".to_string(),
                    group: "rentable".to_string(),
                },
                databases: vec!["control-plane".to_string()],
            }
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

        assert_eq!(
            first,
            Some(ConsentedGroup {
                organization: TursoOrganization {
                    slug: "acme".to_string(),
                    group: "rents".to_string(),
                },
                // the listing was read, so what the group holds is reported.
                databases: Some(vec!["ledger".to_string()]),
            })
        );
        assert_eq!(
            second,
            Some(ConsentedGroup {
                organization: TursoOrganization {
                    slug: "acme".to_string(),
                    group: "rents".to_string(),
                },
                // and the second call asked nothing, so it has no listing to report rather
                // than an empty one, which would read as a group holding nothing.
                databases: None,
            })
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
            OrganizationLookup::Found { organization, .. } => {
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
