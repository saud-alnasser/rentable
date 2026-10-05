//! the Turso group an organization's database goes in: its name learned where Turso asks for one,
//! and a group that already holds an organization told apart from one that does not.

use serde::{Deserialize, Serialize};

use crate::{
    diagnostics,
    error::{Error, RefusalReason},
    turso::{
        discovery::{self, McpEndpoint},
        platform::TursoPlatform,
    },
};

use super::ORGANIZATION_DATABASE_PREFIX;

/// What Turso calls the group a new organization is made with, and the second name a first
/// create tries. It is Turso's word rather than this application's, and it is never shown to
/// anybody: what it buys is one more account that nobody has to be asked anything on.
const TURSO_DEFAULT_GROUP: &str = "default";

/// Create the first database in a group that holds none, learning the group's name where the
/// account will say it and naming it by guess only where nothing would.
///
/// **The name is asked for before it is guessed at** (ticket 21). Two places on the customer's
/// own account know what the group is called: the MCP server, where its tool set offers a way to
/// list groups, and the Platform API, whose one slug-free endpoint names the person and whose
/// groups listing sits under that username. Both are reads, both pick the group by the uuid the
/// consent's token carries, and either of them answering ends this: the create is made with the
/// name it gave and nothing else is tried.
///
/// **The cascade below is what runs where neither answered, unchanged.** Three names, in the
/// order that costs a person least: no group at all, which is the tool's own default and what
/// worked until 2026-09-15; `default`, which is what Turso calls the group a new organization is
/// made with; and the group uuid the consent's own token carries, which names the consented group
/// exactly without anybody knowing what it is called. A refusal that speaks of the group moves to
/// the next name, because that is Turso saying the group is what it could not settle. **Every
/// other refusal is the answer and is returned as it stands**, whether it is a plan's limit, a
/// name Turso will not take or an account that needs attention, since two more requests would
/// only be told the same thing more slowly.
///
/// **Where a name was given, it is the only attempt.** The walk shows the field after everything
/// above was refused, so a name arriving here means it was, and trying any of it again would put
/// the person back where they started.
pub(super) async fn create_into_an_empty_group<P: TursoPlatform>(
    platform: &P,
    platform_token: &str,
    mcp: &McpEndpoint,
    database_name: &str,
    typed_group: Option<&str>,
) -> Result<discovery::FirstDatabase, Error> {
    if let Some(group) = typed_group {
        let first =
            discovery::create_first_database(platform_token, mcp, database_name, Some(group))
                .await?;
        named_the_group(TYPED);

        return Ok(first);
    }

    let group_uuid = discovery::group_uuid_of(platform_token);

    if let Some((named_by, group)) =
        learn_the_group(platform, platform_token, mcp, group_uuid.as_deref()).await
    {
        let first =
            discovery::create_first_database(platform_token, mcp, database_name, Some(&group))
                .await?;
        named_the_group(named_by);

        return Ok(first);
    }

    let mut attempts = vec![None, Some(TURSO_DEFAULT_GROUP)];

    // a token carrying no such claim has nothing to add: the attempt would be the first one
    // again, and one request that has already been refused is enough.
    if let Some(group_uuid) = group_uuid.as_deref() {
        attempts.push(Some(group_uuid));
    }

    let mut refusal = String::new();

    for group in attempts {
        match discovery::create_first_database(platform_token, mcp, database_name, group).await {
            Ok(first) => {
                named_the_group(CASCADE);

                return Ok(first);
            }
            Err(error) if is_about_the_group(&error) => {
                refusal = turso_reason(&error).unwrap_or_default().to_string();
            }
            Err(error) => return Err(error),
        }
    }

    // the reason is what the walk draws the field from, and the message is what it shows under
    // the field behind a disclosure: Turso's last words, which are free to change with Turso.
    Err(Error::refused(
        RefusalReason::GroupNeeded,
        format!(
            "turso refused every group this application could name on its \
             own, and said: {refusal}"
        ),
    ))
}

/// What the consented group is called, from whichever of the two ways knew, and which one that
/// was.
///
/// **A probe that failed answered nothing.** Both calls exist to save a person a question, and
/// neither is on the path to anything: a refusal, an unreachable moment or a reply in a shape
/// this cannot read goes to the diagnostics log and the run carries on to the cascade, exactly as
/// it did before either probe existed. Turning one of them into the reason a first run stopped
/// would be a worse first run than the one this ticket set out to fix.
async fn learn_the_group<P: TursoPlatform>(
    platform: &P,
    platform_token: &str,
    mcp: &McpEndpoint,
    group_uuid: Option<&str>,
) -> Option<(&'static str, String)> {
    match discovery::group_from_mcp(platform_token, mcp, group_uuid).await {
        Ok(Some(group)) => return Some((MCP, group)),
        Ok(None) => {}
        Err(error) => diagnostics::warn("organization.setup.groupNotReadFromMcp")
            .with("error", error.to_string())
            .write(),
    }

    match platform.group_named(platform_token, group_uuid).await {
        Ok(Some(group)) => Some((PLATFORM, group)),
        Ok(None) => None,
        Err(error) => {
            diagnostics::warn("organization.setup.groupNotReadFromPlatform")
                .with("error", error.to_string())
                .write();

            None
        }
    }
}

/// The four ways the group a first database is created in can be named, as the diagnostics line
/// spells them.
const MCP: &str = "mcp";
const PLATFORM: &str = "platform";
const CASCADE: &str = "cascade";
const TYPED: &str = "typed";

/// Record which of them it was.
///
/// **The name itself is not in the line.** A group's name is the customer's own, and what a
/// reading of this file needs is which way answered: the two probes are new and the account they
/// are asked of is not this machine's, so whether either of them works in the field is a thing
/// nobody can see any other way.
fn named_the_group(by: &str) {
    diagnostics::info("organization.setup.groupNamed")
        .with("by", by)
        .write();
}

/// Turso's own reason inside a refused create, where what came back is one.
fn turso_reason(error: &Error) -> Option<&str> {
    match error {
        Error::Refused {
            reason: RefusalReason::CreateRefused,
            message,
        } => Some(
            message
                .strip_prefix(discovery::CREATE_REFUSED)
                .unwrap_or(message),
        ),
        _ => None,
    }
}

/// Whether Turso refused over the group, which is the one refusal another name could answer.
fn is_about_the_group(error: &Error) -> bool {
    turso_reason(error).is_some_and(|reason| reason.to_lowercase().contains("group"))
}

/// The organization id inside a listed database's name, where the name is one of ours.
///
/// **The whole of what marks a database as this application's**, and the one place the mark is
/// read: [`one_organization_to_a_group`] refuses a create on it and [`group_inspect`] offers a
/// connect on it, and a second reading of the same prefix is two answers to one question waiting
/// to disagree.
///
/// *The mark is loose on purpose and errs toward recognising* (effort 826, ticket 13): an
/// `org-chart` in the owner's own group reads as one of ours, which refuses a create that would
/// have been fine and offers a connect that then finds no rows and refuses. Both are the safe
/// side of the mistake.
///
/// **A copy on the account is not one of these, and is named so it cannot read as one.** The copy
/// taken before an organization or a workspace changes shape sits in the same group, and
/// `backup::remote_name` begins it `copy-`, never `org-` or `ws-`, so it is neither refused as an
/// organization nor offered to connect to (effort 838, ticket 30).
pub fn held_organization_id(database_name: &str) -> Option<&str> {
    database_name
        .strip_prefix(ORGANIZATION_DATABASE_PREFIX)
        .filter(|id| !id.is_empty())
}

/// What the consented group turned out to be holding, which is what the walk branches on after
/// the consent (effort 828, requirement 14).
///
/// **Two answers and no third.** A group holding no organization of ours is the ordinary first
/// run and creates; a group holding one is the owner coming back to an organization that is
/// already there, and the walk asks for their username and password instead of refusing them.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum GroupState {
    /// nothing of ours is in it. The walk asks for a name and creates.
    Empty,
    /// an organization of ours is in it, and this is its id.
    #[serde(rename_all = "camelCase")]
    Held { organization_id: String },
}

/// Read the consented group and say whether an organization of ours is already in it.
///
/// **A read and nothing else.** It mints nothing, creates nothing, opens no replica and writes
/// nothing to this machine's store, so a person who goes no further has changed nothing. The
/// account the consent is over is learned again by whichever path they take next, which is what
/// keeps [`create_organization`](super::create_organization)'s own listing, and the refusal it makes on it, exactly as they
/// were.
///
/// **The listing is asked for rather than remembered** ([`discovery::group_databases`] says why):
/// what the group holds is the thing being decided, and a group can have gained an organization
/// since this machine last looked.
pub async fn group_inspect(platform_token: &str, mcp: &McpEndpoint) -> Result<GroupState, Error> {
    let Some((_, databases)) = discovery::group_databases(platform_token, mcp).await? else {
        return Ok(GroupState::Empty);
    };
    let held = databases
        .iter()
        .find_map(|database| held_organization_id(&database.name));

    Ok(match held {
        Some(organization_id) => GroupState::Held {
            organization_id: organization_id.to_string(),
        },
        None => GroupState::Empty,
    })
}

/// Refuse a group that already holds an organization, naming the database that is in the way.
///
/// **A group holds one organization** (requirement 21 of effort 826). The consent is granted
/// over one group and the organization lives in it, so a second organization in the same group
/// would put two sets of records behind one grant, and the owner ruled that out. The person
/// picks another group, or another Turso account, and the sentence says so.
///
/// *Effort 828's requirement 14 keeps this refusal and gives it a way on.* The walk asks the
/// group what it holds before it asks for a name ([`group_inspect`]), so a person whose group
/// already holds an organization is offered [`connect_existing`](super::connect_existing) and never reaches a create. This
/// is what refuses a create arriving by any other route, and a create is still the one thing a
/// held group may not have.
///
/// **Only a name this application would have written counts.** A Free or Developer account has
/// exactly one group and it holds whatever else the person keeps on that account, so refusing
/// on any database at all would refuse the accounts most first runs arrive on. The mark is the
/// name [`create_organization`](super::create_organization) gives an organization's database and nothing else,
/// [`held_organization_id`].
pub(super) fn one_organization_to_a_group(databases: &[String]) -> Result<(), Error> {
    let held = databases
        .iter()
        .find(|name| held_organization_id(name).is_some());

    match held {
        // the name is the customer's own and is said back to them, because it is what they look
        // for in Turso's dashboard to decide whether to delete it or pick elsewhere.
        Some(held) => Err(Error::refused(
            RefusalReason::GroupHoldsOrganization,
            format!(
                "this group already holds the organization database `{held}`; a group holds \
                 one organization, so pick another group or another Turso account"
            ),
        )),
        None => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use crate::credential::Memory;
    use crate::error::{Error, RefusalReason};
    use crate::machine::RemoteSyncStore;
    use crate::organization::member::vault::KdfParams;
    use crate::organization::setup::{
        BASE64URL, CreateOrganization, GroupState, ORGANIZATION_DATABASE_PREFIX, Remote,
        create_organization, group_inspect,
    };
    use crate::persisted::Persisted;
    use crate::sync::test::server::{ScriptedResponse, ScriptedServer};
    use crate::test::scratch;
    use crate::turso::consent::{platform_token, store_platform_token};
    use crate::turso::discovery::McpEndpoint;
    use crate::turso::platform::InMemoryPlatform;
    use base64::Engine as _;
    use serde_json::json;
    use std::sync::Arc;

    const TOKEN: &str = "a-platform-token";

    const PASSWORD: &str = "a long enough password";

    fn test_cost() -> KdfParams {
        KdfParams {
            memory_kib: 1024,
            iterations: 2,
            lanes: 1,
        }
    }

    fn handshake() -> ScriptedResponse {
        ScriptedResponse::new(
            200,
            json!({ "jsonrpc": "2.0", "id": 1, "result": { "protocolVersion": "2025-06-18" } })
                .to_string(),
        )
    }

    fn listing(records: serde_json::Value) -> ScriptedResponse {
        ScriptedResponse::new(
            200,
            json!({
                "jsonrpc": "2.0",
                "id": 3,
                "result": { "content": [{ "type": "text", "text": records.to_string() }] }
            })
            .to_string(),
        )
    }

    /// The listing a group that already holds a database answers, so the slug is read and the
    /// Platform API creates the organization's database.
    fn populated_group() -> Vec<ScriptedResponse> {
        vec![
            handshake(),
            listing(json!([{
                "Name": "ledger",
                "hostname": "ledger-an-org.aws-eu-west-1.turso.io",
                "group": "rentable"
            }])),
        ]
    }

    fn store(directory: &std::path::Path) -> Persisted<RemoteSyncStore> {
        Persisted::<RemoteSyncStore>::load(directory.join("remote-sync.json")).expect("the store")
    }

    // -------------------------------------------------------------------------------------
    // Effort 828, requirement 14: the account connects to the organization the group holds.
    // -------------------------------------------------------------------------------------

    /// The id every fixture below creates its organization under, so a listing can name
    /// `org-<id>` as a literal and a replica can be found at a known path.
    const HELD_ID: &str = "7f3a";

    const HELD_DATABASE: &str = "org-7f3a";

    const HELD_HOSTNAME: &str = "org-7f3a-an-org.aws-eu-west-1.turso.io";

    /// The listing a group holding the organization answers: the database that was there before,
    /// and ours beside it with the address a replica of it opens at.
    fn holding_the_organization() -> Vec<ScriptedResponse> {
        vec![
            handshake(),
            listing(json!([
                {
                    "Name": "ledger",
                    "hostname": "ledger-an-org.aws-eu-west-1.turso.io",
                    "group": "rentable"
                },
                {
                    "Name": HELD_DATABASE,
                    "hostname": HELD_HOSTNAME,
                    "group": "rentable"
                }
            ])),
        ]
    }

    fn created() -> ScriptedResponse {
        ScriptedResponse::new(
            200,
            json!({ "jsonrpc": "2.0", "id": 2, "result": { "content": [] } }).to_string(),
        )
    }

    /// What Turso answered a create that named no group on 2026-09-15, in its own words.
    const NO_GROUP_NAMED: &str =
        "HTTP 403: group-scoped tokens must specify a group in the request";

    /// And what it answers a create naming a group the consent is not over.
    const NO_SUCH_GROUP: &str = "group `default` does not exist in this organization";

    /// The group uuid a consent token carries, which is the third name a first create tries.
    const CONSENTED_GROUP_UUID: &str = "6f5b6f60-1d4a-4b4a-9c2e-0b0a1d2c3e4f";

    /// A create the tool refused: a result flagged `isError` carrying Turso's own reason, which
    /// is the shape `create_database` answers a refusal in rather than a JSON-RPC error.
    fn create_refused(reason: &str) -> ScriptedResponse {
        ScriptedResponse::new(
            200,
            json!({
                "jsonrpc": "2.0",
                "id": 2,
                "result": {
                    "isError": true,
                    "content": [{ "type": "text", "text": reason }]
                }
            })
            .to_string(),
        )
    }

    /// What `tools/list` answers, carrying whichever tool names the server offers.
    fn tools(names: &[&str]) -> ScriptedResponse {
        let offered = names
            .iter()
            .map(|name| json!({ "name": name, "inputSchema": { "type": "object" } }))
            .collect::<Vec<_>>();

        ScriptedResponse::new(
            200,
            json!({ "jsonrpc": "2.0", "id": 4, "result": { "tools": offered } }).to_string(),
        )
    }

    /// The tool set read on 2026-09-11, which offers no way to name a group. Every test whose
    /// group is named some other way scripts it, so the first probe answers nothing and the run
    /// carries on to the second.
    fn no_group_tool() -> ScriptedResponse {
        tools(&["list_databases", "create_database"])
    }

    /// And the groups a server that does offer one lists, in the shape Turso's own API sends.
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

    /// A consent token in the shape Turso issues one: three base64url segments, the middle
    /// carrying the claims. Only the group uuid is read out of it, and only here in Rust
    /// ([[rules/credentials]], *Client boundary*).
    fn token_naming_the_group() -> String {
        format!(
            "{}.{}.a-signature",
            BASE64URL.encode("{}"),
            BASE64URL.encode(json!({ "group_uuid": CONSENTED_GROUP_UUID }).to_string())
        )
    }

    /// **Requirement 21 of effort 826.** The consent landed on a group that already holds an
    /// organization, so the run is refused before it creates anything, the refusal names the
    /// database that is in the way, and the consent is given back so the person can grant
    /// another over another group or another Turso account.
    #[tokio::test]
    async fn a_group_already_holding_an_organization_refuses_the_run_and_gives_the_consent_back() {
        // taken once, at the top: the refusal reads and empties the same credential store the
        // fake keeps for the whole process.
        let credentials = Memory::new();

        store_platform_token(&credentials, TOKEN)
            .expect("the test credential store would not take the token");

        let directory = scratch("one-organization");
        let mut store = store(&directory);
        let mcp = ScriptedServer::start(vec![
            handshake(),
            listing(json!([
                {
                    "Name": "ledger",
                    "hostname": "ledger-an-org.aws-eu-west-1.turso.io",
                    "group": "rentable"
                },
                {
                    "Name": "org-7f3a",
                    "hostname": "org-7f3a-an-org.aws-eu-west-1.turso.io",
                    "group": "rentable"
                }
            ])),
        ])
        .await;
        let platform = Arc::new(InMemoryPlatform::new("an-org"));

        let refusal = create_organization(
            &credentials,
            &crate::clock::System::shared(),
            &mut store,
            TOKEN,
            &McpEndpoint::at(&mcp.url("")),
            |_| Arc::clone(&platform),
            Remote::none(),
            &directory.join("app.db"),
            CreateOrganization {
                name: "Acme Rentals",
                username: "olivia.owner",
                password: PASSWORD,
                group: None,
            },
            test_cost(),
            1_757_000_000_000,
        )
        .await
        .expect_err("a group already holding an organization was built into again");

        assert!(
            matches!(
                refusal,
                Error::Refused {
                    reason: crate::error::RefusalReason::GroupHoldsOrganization,
                    ..
                }
            ),
            "{refusal:?}"
        );
        assert_eq!(
            refusal.to_string(),
            "this group already holds the organization database `org-7f3a`; a group holds \
             one organization, so pick another group or another Turso account"
        );

        // nothing was created: no database, no credential, and nothing deleted either, because
        // there was never anything to undo.
        assert!(
            platform.databases().is_empty(),
            "a database was created on a group that was about to be refused"
        );
        assert!(platform.minted().is_empty(), "a credential was minted");
        assert!(platform.deleted().is_empty(), "something was cleaned up");
        assert!(store.selected().is_none());

        // and the consent is abandoned: the token is gone from the credential store, and so is
        // the slug it was read under, so the next consent is looked up rather than assumed.
        assert!(
            platform_token(&credentials).is_err(),
            "the refused consent left its authority on this machine"
        );
        assert_eq!(store.consent_organization(), None);
    }

    /// **Ticket 17.** The group the person typed is the one the first create names, so a name
    /// that is not the consent's group is refused before anything is created, by both names, and
    /// the consent stays where it is: what went wrong is a word on the form.
    #[tokio::test]
    async fn a_typed_group_that_is_not_the_consented_one_is_refused_by_name_and_keeps_the_consent()
    {
        let credentials = Memory::new();

        store_platform_token(&credentials, TOKEN)
            .expect("the test credential store would not take the token");

        let directory = scratch("another-group");
        let mut store = store(&directory);
        let mcp = ScriptedServer::start(populated_group()).await;
        let platform = Arc::new(InMemoryPlatform::new("an-org"));

        let refusal = create_organization(
            &credentials,
            &crate::clock::System::shared(),
            &mut store,
            TOKEN,
            &McpEndpoint::at(&mcp.url("")),
            |_| Arc::clone(&platform),
            Remote::none(),
            &directory.join("app.db"),
            CreateOrganization {
                name: "Acme Rentals",
                username: "olivia.owner",
                password: PASSWORD,
                group: Some("rentabel"),
            },
            test_cost(),
            1_757_000_000_000,
        )
        .await
        .expect_err("a group the consent is not over was built into");

        assert!(
            matches!(
                refusal,
                Error::Refused {
                    reason: crate::error::RefusalReason::GroupMismatch,
                    ..
                }
            ),
            "{refusal:?}"
        );
        assert_eq!(
            refusal.to_string(),
            "the group this consent is over is called `rentable`, not `rentabel`"
        );

        // nothing was created, and the authority is still this machine's: the person retypes the
        // group on the step they are on rather than granting a second consent.
        assert!(
            platform.databases().is_empty(),
            "a database was created on a refused run"
        );
        assert!(store.selected().is_none());
        assert!(platform_token(&credentials).is_ok());
    }

    /// The other half of the same rule: a group holding databases of the person's own is the
    /// ordinary Free or Developer account, and it is not a refusal. Only the name this
    /// application writes counts, so a name that merely carries the word does not.
    #[tokio::test]
    async fn a_group_holding_unrelated_databases_is_not_a_refusal() {
        let credentials = Memory::new();

        store_platform_token(&credentials, TOKEN)
            .expect("the test credential store would not take the token");

        let directory = scratch("unrelated-databases");
        let mut store = store(&directory);
        let mcp = ScriptedServer::start(vec![
            handshake(),
            listing(json!([
                {
                    "Name": "ledger",
                    "hostname": "ledger-an-org.aws-eu-west-1.turso.io",
                    "group": "rentable"
                },
                {
                    "Name": "my-org",
                    "hostname": "my-org-an-org.aws-eu-west-1.turso.io",
                    "group": "rentable"
                },
                {
                    "Name": "org-7f3a",
                    "hostname": "org-7f3a-an-org.aws-eu-west-1.turso.io",
                    "group": "somebody-elses-group"
                }
            ])),
        ])
        .await;
        let platform = Arc::new(InMemoryPlatform::new("an-org"));

        let (created, _organization) = create_organization(
            &credentials,
            &crate::clock::System::shared(),
            &mut store,
            TOKEN,
            &McpEndpoint::at(&mcp.url("")),
            |_| Arc::clone(&platform),
            Remote::none(),
            &directory.join("app.db"),
            CreateOrganization {
                name: "Acme Rentals",
                username: "olivia.owner",
                password: PASSWORD,
                group: None,
            },
            test_cost(),
            1_757_000_000_000,
        )
        .await
        .expect("a group holding the person's own databases was refused");

        assert_eq!(
            platform.databases().len(),
            1,
            "the organization's database was not created"
        );
        assert_eq!(
            platform.databases()[0].name,
            format!("org-{}", created.organization_id)
        );
        // and the authority the run spent is still this machine's, because nothing was refused.
        assert!(platform_token(&credentials).is_ok());
    }

    /// Requirement 3's ordinary first run: an empty group, so the first database is created
    /// through the MCP server, the slug and the group are read off the listing that follows, and
    /// the Platform API protects what it did not create. **The create names no group and is
    /// taken**, which is the account nobody is asked anything on.
    #[tokio::test]
    async fn a_first_run_into_an_empty_group_creates_the_first_database_through_mcp() {
        let credentials = Memory::new();
        let directory = scratch("empty");
        let mut store = store(&directory);
        let platform = Arc::new(InMemoryPlatform::new("acme-co"));
        let database_path = directory.join("app.db");

        // the ids a first run draws are fixed for this test, so the listing that answers the
        // create can carry the record the create will have made.
        crate::organization::setup::draw_these_ids_next(&[
            "0ffice0ffice0ffice0ffice0ffice00",
            "0wner",
        ]);

        let mcp = ScriptedServer::start(vec![
            handshake(),
            listing(json!([])),
            handshake(),
            no_group_tool(),
            handshake(),
            created(),
            listing(json!([{
                "Name": "org-0ffice0ffice0ffice0ffice0ffice00",
                "hostname": "org-0ffice0ffice0ffice0ffice0ffice00-acme-co.aws-eu-west-1.turso.io",
                "group": "rentable-empty"
            }])),
        ])
        .await;

        let (outcome, organization) = create_organization(
            &credentials,
            &crate::clock::System::shared(),
            &mut store,
            TOKEN,
            &McpEndpoint::at(&mcp.url("")),
            |_| Arc::clone(&platform),
            Remote::none(),
            &database_path,
            CreateOrganization {
                name: "Acme",
                username: "olivia",
                password: PASSWORD,
                group: None,
            },
            test_cost(),
            1_757_000_000_000,
        )
        .await
        .expect("the first run failed");

        let database_name = format!("org-{}", outcome.organization_id);
        let create = mcp.request(5);
        let payload: serde_json::Value = serde_json::from_str(&create.body).expect("json");

        assert_eq!(payload["params"]["name"], "create_database");
        assert_eq!(
            payload["params"]["arguments"],
            json!({ "name": database_name }),
            "the first attempt names no group, since the tool defaults to the token's own"
        );
        assert_eq!(mcp.request_count(), 7);

        // the platform created nothing and protected the one the MCP server made.
        let databases = platform.databases();

        assert_eq!(databases.len(), 1);
        assert_eq!(databases[0].name, database_name);
        assert!(databases[0].delete_protection);
        assert_eq!(
            store
                .consent_organization()
                .map(|o| (o.slug.as_str(), o.group.as_str())),
            Some(("acme-co", "rentable-empty"))
        );

        let held = store
            .selected()
            .cloned()
            .expect("the first run recorded no organization");

        assert_eq!(
            held.remote_url,
            format!("libsql://{database_name}-acme-co.aws-eu-west-1.turso.io")
        );

        let key = organization
            .organization()
            .await
            .expect("the organization")
            .expect("a row")
            .verifying_key;

        assert_eq!(
            organization.members(&key).await.expect("the members").len(),
            1
        );
    }

    /// **Ticket 21.** The first run learns what the group is called from the MCP server's own
    /// group listing, creates with that name, and tries nothing else: the cascade below is what
    /// runs where nobody could say the name, and this is a run where somebody could.
    #[tokio::test]
    async fn a_group_the_mcp_server_listed_is_the_name_the_first_create_uses() {
        let credentials = Memory::new();
        let directory = scratch("learned-from-mcp");
        let mut store = store(&directory);
        let platform = Arc::new(InMemoryPlatform::new("acme-co"));

        crate::organization::setup::draw_these_ids_next(&[
            "0ffice0ffice0ffice0ffice0ffice00",
            "0wner",
        ]);

        let mcp = ScriptedServer::start(vec![
            handshake(),
            listing(json!([])),
            handshake(),
            tools(&["list_databases", "create_database", "list_groups"]),
            groups(json!({ "groups": [
                { "name": "rents", "uuid": "11111111-1111-4111-8111-111111111111" },
                { "name": "rentable-empty", "uuid": CONSENTED_GROUP_UUID }
            ] })),
            handshake(),
            created(),
            listing(json!([{
                "Name": "org-0ffice0ffice0ffice0ffice0ffice00",
                "hostname": "org-0ffice0ffice0ffice0ffice0ffice00-acme-co.aws-eu-west-1.turso.io",
                "group": "rentable-empty"
            }])),
        ])
        .await;

        let (outcome, _organization) = create_organization(
            &credentials,
            &crate::clock::System::shared(),
            &mut store,
            &token_naming_the_group(),
            &McpEndpoint::at(&mcp.url("")),
            |_| Arc::clone(&platform),
            Remote::none(),
            &directory.join("app.db"),
            CreateOrganization {
                name: "Acme",
                username: "olivia",
                password: PASSWORD,
                group: None,
            },
            test_cost(),
            1_757_000_000_000,
        )
        .await
        .expect("the first run failed");

        let payload: serde_json::Value = serde_json::from_str(&mcp.request(6).body).expect("json");

        assert_eq!(payload["params"]["name"], "create_database");
        assert_eq!(
            payload["params"]["arguments"],
            json!({
                "name": format!("org-{}", outcome.organization_id),
                "group": "rentable-empty"
            }),
            "the create did not name the group the listing had just given it"
        );
        assert_eq!(
            mcp.request_count(),
            8,
            "one create, and no attempt of the cascade"
        );
        assert_eq!(platform.databases().len(), 1);
    }

    /// And where the server offers no group tool, the Platform API is the second way to ask: the
    /// name it gives is the one the create uses, and the cascade is not reached either.
    #[tokio::test]
    async fn a_server_with_no_group_tool_falls_to_the_name_the_platform_gives() {
        let credentials = Memory::new();
        let directory = scratch("learned-from-platform");
        let mut store = store(&directory);
        let platform = Arc::new(InMemoryPlatform::new("acme-co"));

        platform.naming_the_group("rentable-empty");
        crate::organization::setup::draw_these_ids_next(&[
            "0ffice0ffice0ffice0ffice0ffice00",
            "0wner",
        ]);

        let mcp = ScriptedServer::start(vec![
            handshake(),
            listing(json!([])),
            handshake(),
            no_group_tool(),
            handshake(),
            created(),
            listing(json!([{
                "Name": "org-0ffice0ffice0ffice0ffice0ffice00",
                "hostname": "org-0ffice0ffice0ffice0ffice0ffice00-acme-co.aws-eu-west-1.turso.io",
                "group": "rentable-empty"
            }])),
        ])
        .await;

        let (outcome, _organization) = create_organization(
            &credentials,
            &crate::clock::System::shared(),
            &mut store,
            &token_naming_the_group(),
            &McpEndpoint::at(&mcp.url("")),
            |_| Arc::clone(&platform),
            Remote::none(),
            &directory.join("app.db"),
            CreateOrganization {
                name: "Acme",
                username: "olivia",
                password: PASSWORD,
                group: None,
            },
            test_cost(),
            1_757_000_000_000,
        )
        .await
        .expect("the first run failed");

        let payload: serde_json::Value = serde_json::from_str(&mcp.request(5).body).expect("json");

        assert_eq!(
            payload["params"]["arguments"],
            json!({
                "name": format!("org-{}", outcome.organization_id),
                "group": "rentable-empty"
            }),
            "the create did not name the group the platform gave it"
        );
        assert_eq!(
            mcp.request_count(),
            7,
            "one create, and no attempt of the cascade"
        );
    }

    /// **Ticket 18, and what ticket 21 left of it.** Where neither way could name the group,
    /// Turso refusing a create over it is Turso saying the group is what it could not settle, so
    /// the run tries the next name it has rather than the person: no group, then Turso's own
    /// `default`, then the group uuid the consent token carries. Only where all three are refused
    /// is anybody asked anything, and the sentence that asks begins with the fixed phrase the
    /// walk reads and carries Turso's last reason so the person can see what they are answering.
    #[tokio::test]
    async fn the_first_create_tries_three_names_before_the_walk_asks_for_one() {
        let credentials = Memory::new();
        let directory = scratch("cascade");
        let mut store = store(&directory);
        let platform = Arc::new(InMemoryPlatform::new("acme-co"));
        let token = token_naming_the_group();

        let mcp = ScriptedServer::start(vec![
            handshake(),
            listing(json!([])),
            handshake(),
            no_group_tool(),
            handshake(),
            create_refused(NO_GROUP_NAMED),
            handshake(),
            create_refused("group `default` not found"),
            handshake(),
            create_refused(NO_SUCH_GROUP),
        ])
        .await;

        let refusal = create_organization(
            &credentials,
            &crate::clock::System::shared(),
            &mut store,
            &token,
            &McpEndpoint::at(&mcp.url("")),
            |_| Arc::clone(&platform),
            Remote::none(),
            &directory.join("app.db"),
            CreateOrganization {
                name: "Acme",
                username: "olivia",
                password: PASSWORD,
                group: None,
            },
            test_cost(),
            1_757_000_000_000,
        )
        .await
        .expect_err("a run refused three times over the group reported an organization");

        // the three attempts, in order, and each naming exactly what it meant to.
        let arguments = |index: usize| {
            serde_json::from_str::<serde_json::Value>(&mcp.request(index).body).expect("json")
                ["params"]["arguments"]
                .clone()
        };
        let database_name = arguments(5)["name"].as_str().expect("a name").to_string();

        assert!(database_name.starts_with(ORGANIZATION_DATABASE_PREFIX));
        assert_eq!(arguments(5), json!({ "name": database_name }));
        assert_eq!(
            arguments(7),
            json!({ "name": database_name, "group": "default" })
        );
        assert_eq!(
            arguments(9),
            json!({ "name": database_name, "group": CONSENTED_GROUP_UUID }),
            "the group uuid the consent token carries is the last name tried"
        );
        assert_eq!(
            mcp.request_count(),
            10,
            "the probe that learned nothing, then a handshake and a create per attempt"
        );

        // and the refusal asks for the one thing left: by its reason, so the walk can tell it
        // from every other refusal, with Turso's last words in the message.
        assert!(
            matches!(
                refusal,
                Error::Refused {
                    reason: RefusalReason::GroupNeeded,
                    ..
                }
            ),
            "{refusal:?}"
        );
        assert!(refusal.to_string().ends_with(NO_SUCH_GROUP), "{refusal}");

        // nothing was created, and the slug was not written down: there is no organization to
        // read one out of yet.
        assert!(platform.databases().is_empty());
        assert!(store.selected().is_none());
        assert_eq!(store.consent_organization(), None);
    }

    /// The other half of the same rule: a refusal that is not about the group is the answer, so
    /// it comes back as Turso said it and the next two names are never tried. Retrying a plan's
    /// limit under another group would spend two more requests to be told the same thing.
    #[tokio::test]
    async fn a_first_create_refused_for_anything_but_the_group_is_answered_at_once() {
        let credentials = Memory::new();
        let directory = scratch("not-the-group");
        let mut store = store(&directory);
        let platform = Arc::new(InMemoryPlatform::new("acme-co"));

        let mcp = ScriptedServer::start(vec![
            handshake(),
            listing(json!([])),
            handshake(),
            no_group_tool(),
            handshake(),
            create_refused("your plan allows 1 database and you have 1"),
        ])
        .await;

        let refusal = create_organization(
            &credentials,
            &crate::clock::System::shared(),
            &mut store,
            &token_naming_the_group(),
            &McpEndpoint::at(&mcp.url("")),
            |_| Arc::clone(&platform),
            Remote::none(),
            &directory.join("app.db"),
            CreateOrganization {
                name: "Acme",
                username: "olivia",
                password: PASSWORD,
                group: None,
            },
            test_cost(),
            1_757_000_000_000,
        )
        .await
        .expect_err("a plan limit was read as a group this application could rename around");

        assert_eq!(
            refusal.to_string(),
            "turso could not create the organization's database: your plan allows 1 database \
             and you have 1"
        );
        assert_eq!(
            mcp.request_count(),
            6,
            "the handshake, the listing, the probe, and one attempt"
        );
        assert!(platform.databases().is_empty());
    }

    /// And where the walk did ask, the name it was given is the only attempt: the three above
    /// have already been refused, so trying them again would put the person back where they
    /// started.
    #[tokio::test]
    async fn a_group_the_walk_asked_for_is_the_only_name_the_first_create_tries() {
        let credentials = Memory::new();
        let directory = scratch("asked");
        let mut store = store(&directory);
        let platform = Arc::new(InMemoryPlatform::new("acme-co"));

        crate::organization::setup::draw_these_ids_next(&[
            "0ffice0ffice0ffice0ffice0ffice00",
            "0wner",
        ]);

        let mcp = ScriptedServer::start(vec![
            handshake(),
            listing(json!([])),
            handshake(),
            created(),
            listing(json!([{
                "Name": "org-0ffice0ffice0ffice0ffice0ffice00",
                "hostname": "org-0ffice0ffice0ffice0ffice0ffice00-acme-co.aws-eu-west-1.turso.io",
                "group": "rentable-empty"
            }])),
        ])
        .await;

        let (outcome, _organization) = create_organization(
            &credentials,
            &crate::clock::System::shared(),
            &mut store,
            &token_naming_the_group(),
            &McpEndpoint::at(&mcp.url("")),
            |_| Arc::clone(&platform),
            Remote::none(),
            &directory.join("app.db"),
            CreateOrganization {
                name: "Acme",
                username: "olivia",
                password: PASSWORD,
                group: Some(" rentable-empty "),
            },
            test_cost(),
            1_757_000_000_000,
        )
        .await
        .expect("the first run failed");

        let payload: serde_json::Value = serde_json::from_str(&mcp.request(3).body).expect("json");

        // trimmed, because a name pasted out of Turso's own screen brings what came with it.
        assert_eq!(
            payload["params"]["arguments"],
            json!({
                "name": format!("org-{}", outcome.organization_id),
                "group": "rentable-empty"
            })
        );
        assert_eq!(mcp.request_count(), 5, "one attempt, and no cascade");
    }

    /// The inspect is what the walk branches on: a group holding an organization of ours is said
    /// to hold one, by its id, and a group holding anything else is empty as far as this is
    /// concerned and creates as it always did.
    #[tokio::test]
    async fn the_inspect_says_whether_the_group_already_holds_an_organization() {
        let held = ScriptedServer::start(holding_the_organization()).await;

        assert_eq!(
            group_inspect(TOKEN, &McpEndpoint::at(&held.url("")))
                .await
                .expect("the inspect failed"),
            GroupState::Held {
                organization_id: HELD_ID.to_string()
            }
        );

        // somebody else's databases in the same group are not ours, and the walk creates.
        let other = ScriptedServer::start(populated_group()).await;

        assert_eq!(
            group_inspect(TOKEN, &McpEndpoint::at(&other.url("")))
                .await
                .expect("the inspect failed"),
            GroupState::Empty
        );

        // and a group holding nothing at all is the ordinary first run.
        let empty = ScriptedServer::start(vec![handshake(), listing(json!([]))]).await;

        assert_eq!(
            group_inspect(TOKEN, &McpEndpoint::at(&empty.url("")))
                .await
                .expect("the inspect failed"),
            GroupState::Empty
        );
    }
}
