//! the members list as the settings area reads it: every account, what it holds, and where each
//! one stands.

use serde::{Deserialize, Serialize};

use crate::{error::Error, turso::platform::AccessLevel};

use super::opened;
use crate::organization::{
    session::MemberSession,
    store::{OrganizationStore, pins_of},
};

/// One workspace a member is in, as the members list draws it: the access their grant holds on it,
/// and what is pinned for them there (effort 838, requirement 12 as amended a third time, and at
/// review round one). No credential.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemberWorkspace {
    pub id: String,
    pub access: AccessLevel,
    /// the record flags pinned for them in this workspace, whatever they hold across the
    /// organization. Zero where nothing is.
    pub pinned: i64,
    /// which of the pinned flags are on; the rest of them are off.
    pub granted: i64,
    /// what they may do in this workspace before the grant is read: their permissions across the
    /// organization with what is pinned set as it is granted (`permission::effective_in_workspace`).
    /// A read-only grant clears the writes of it, which the web layer folds.
    pub permissions: i64,
}

/// One member as the members list draws them: the username opened with the content key and the
/// workspaces they hold with the access on each. No key and no credential.
///
/// *`workspace_ids` was a list of ids until effort 826, and the invitations were a second list
/// read from a command of their own, folded into the row here and then dropped again by effort
/// 828, which found nothing reading them. Where an account stands is [`MemberStanding`], asked
/// for on its own.*
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemberFacts {
    pub id: String,
    pub username: String,
    /// the kind of the role the member holds: `owner`, `manager`, `member` or `custom` (effort 838,
    /// requirement 8). *It was the word `owner`, `administrator` or `member` until then.*
    pub role: String,
    /// the role the member row names, by id.
    pub role_id: String,
    /// a custom role's name, opened with the content key; empty on the three built-in roles, whose
    /// names the interface gives in the reader's language.
    pub role_name: String,
    /// how high the role stands.
    pub rank: i64,
    /// the flags switched for this member alone. Zero on the owner's row.
    #[serde(rename = "override")]
    pub override_mask: i64,
    /// what the member may do: their role's mask exclusive-or'd with their override.
    pub permissions: i64,
    /// the workspaces the member is in, each with the access on it and what is pinned for them
    /// there. *Each was a workspace and the access alone until ticket 53 of effort 838.*
    pub workspaces: Vec<MemberWorkspace>,
    pub created_at: i64,
    /// whether the organization has been offered to this account and not yet accepted (effort
    /// 828, requirement 22). It is what puts *withdraw the offer* on the owner's card in place of
    /// the offer, and what names the account the offer stands with.
    pub offered_ownership: bool,
}

/// Every member, verified, with the username opened for the screen.
pub async fn members(
    store: &OrganizationStore,
    session: &MemberSession,
) -> Result<Vec<MemberFacts>, Error> {
    let grants = store.grants(&session.verifying_key).await?;
    let roles = store.roles(&session.verifying_key).await?;
    let workspace_overrides = store.workspace_overrides(&session.verifying_key).await?;
    // read once for the whole list rather than per row: an organization has one standing offer or
    // none, and it is the same answer on every card (effort 828, requirement 22).
    let offered = crate::organization::ownership::standing_offer(store, &session.verifying_key)
        .await?
        .map(|offer| offer.offered_member_id);

    store
        .members(&session.verifying_key)
        .await?
        .into_iter()
        // a removed member's row stays for the replicas that still hold it; the dashboard lists
        // who is in.
        .filter(|member| member.removed_at.is_none())
        .map(|member| {
            let role = crate::organization::role::held_role(session, &roles, &member.role_id)?;

            Ok(MemberFacts {
                username: opened(session, "member.username_sealed", &member.username_sealed)?,
                // the grant on the organization database itself is the directory every member
                // holds rather than a workspace anybody was given.
                workspaces: grants
                    .iter()
                    .filter(|grant| {
                        grant.member_id == member.id
                            && grant.workspace_id != session.organization_id
                    })
                    .map(|grant| {
                        let (pinned, granted) =
                            pins_of(&workspace_overrides, &member.id, &grant.workspace_id);

                        MemberWorkspace {
                            id: grant.workspace_id.clone(),
                            access: AccessLevel::parse(&grant.access_level)
                                .unwrap_or(AccessLevel::FullAccess),
                            pinned,
                            granted,
                            permissions:
                                crate::organization::role::permission::effective_in_workspace(
                                    member.effective,
                                    pinned,
                                    granted,
                                ),
                        }
                    })
                    .collect(),
                offered_ownership: offered.as_deref() == Some(member.id.as_str()),
                role: role.kind,
                role_name: role.name,
                rank: role.rank,
                override_mask: member.override_mask,
                role_id: member.role_id,
                id: member.id,
                permissions: member.effective,
                created_at: member.created_at,
            })
        })
        .collect()
}

/// Where one account stands, as the directory says it in a line (effort 828, requirement 19).
///
/// **Two facts, and the third standing is neither of them.** An account holds no password until
/// its first link is opened, and the register (requirement 15) says whether a machine is signed in
/// on it inside the presence window; a card reads *password not yet set*, *a machine signed in* or
/// *no machine signed in* from the pair. The line is a fact about the account and gates nothing:
/// [`make_link`](super::make_link) reads neither half, and a card offering no link says so for a reason of its own.
///
/// **Read, never stored.** Nothing writes a standing: it is what the member row and the register
/// say between them at the moment somebody looks.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemberStanding {
    pub member_id: String,
    /// whether the account has a password of its own yet. `false` until its first link is opened.
    pub password_set: bool,
    /// whether a machine that was seen inside the window is signed in on the account.
    pub machine_signed_in: bool,
}

/// Every member's standing, in the order [`members`] answers them.
///
/// **A second command rather than a wider member row**, because the two halves come from two
/// places: the password half is on the signed member row and the machine half is on the unsigned
/// register, which every machine writes for itself. Asked apart, a list of people is still a list
/// of people when the register is empty.
pub async fn standings(
    store: &OrganizationStore,
    session: &MemberSession,
    now: i64,
) -> Result<Vec<MemberStanding>, Error> {
    let machines = store
        .connected_machines(&session.verifying_key, now)
        .await?;

    Ok(store
        .members(&session.verifying_key)
        .await?
        .into_iter()
        // the same filter [`members`] applies: a removed member's row stays for the replicas that
        // still hold it, and the directory lists who is in.
        .filter(|member| member.removed_at.is_none())
        .map(|member| MemberStanding {
            password_set: !member.must_change_password,
            machine_signed_in: machines
                .iter()
                .any(|(machine, _)| machine.member_id.as_deref() == Some(member.id.as_str())),
            member_id: member.id,
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use crate::credential::{CredentialStore, Memory};
    use crate::error::Error;
    use crate::machine::RemoteSyncStore;
    use crate::organization::invitation::{
        MemberStanding, create_account, locator, make_link, standings,
    };
    use serde_json::json;
    use std::sync::{Arc, Mutex};

    use crate::organization::invitation::link::{JoinLink, Locator};
    use crate::organization::member::vault::KdfParams;
    use crate::organization::role::permission;
    use crate::organization::session::{CredentialSlot, MemberSession, sign_in};
    use crate::organization::setup::{CreateOrganization, Remote, create_organization};
    use crate::organization::store::OrganizationStore;
    use crate::organization::workspace::create_workspace;
    use crate::organization::workspace::remote::Pipeline;
    use crate::persisted::Persisted;
    use crate::sync::test::server::{ScriptedResponse, ScriptedServer};
    use crate::test::scratch;
    use crate::turso::discovery::McpEndpoint;
    use crate::turso::platform::InMemoryPlatform;

    const PASSWORD: &str = "the owners password";

    /// The password somebody chooses when they open the first link made for their account, and
    /// the one that admits them at the wall from then on.
    const CHOSEN: &str = "a password sami chose";

    /// When the members list is read, where a test reads one. The standing of a pending
    /// invitation is the one thing on that list that turns on the clock.
    const NOW: i64 = 1_757_000_000_000;

    fn test_cost() -> KdfParams {
        KdfParams {
            memory_kib: 1024,
            iterations: 2,
            lanes: 1,
        }
    }

    fn slot() -> CredentialSlot {
        Arc::new(Mutex::new(None))
    }

    /// No platform authority in hand, which is every session here but the owner's with one.
    fn no_platform() -> Option<&'static InMemoryPlatform> {
        None
    }

    /// An organization with its owner signed in and one workspace, on a fake account.
    async fn owned(
        credentials: &dyn CredentialStore,
        directory: &std::path::Path,
    ) -> (
        OrganizationStore,
        MemberSession,
        Locator,
        String,
        Arc<InMemoryPlatform>,
    ) {
        let mut store = Persisted::<RemoteSyncStore>::load(directory.join("remote-sync.json"))
            .expect("the store");
        let mcp = ScriptedServer::start(vec![
            ScriptedResponse::new(
                200,
                json!({ "jsonrpc": "2.0", "id": 1, "result": {} }).to_string(),
            ),
            ScriptedResponse::new(
                200,
                json!({
                    "jsonrpc": "2.0",
                    "id": 3,
                    "result": { "content": [{ "type": "text", "text": json!([{
                        "Name": "ledger",
                        "hostname": "ledger-an-org.aws-eu-west-1.turso.io",
                        "group": "rentable"
                    }]).to_string() }] }
                })
                .to_string(),
            ),
        ])
        .await;
        let platform = Arc::new(InMemoryPlatform::new("an-org"));

        let (created, organization) = create_organization(
            credentials,
            &crate::clock::System::shared(),
            &mut store,
            "a-platform-token",
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
        let joined = store.organization.clone().expect("the record");
        let mut owner = sign_in(&organization, &joined, PASSWORD, &slot())
            .await
            .expect("the owner did not sign in");
        let pipeline = crate::sync::test::pipeline::LocalPipeline::start().await;
        let workspace = create_workspace(
            &organization,
            &mut owner,
            &platform,
            |_| Pipeline::at(&pipeline.url("")),
            "North",
            1_757_000_000_000,
        )
        .await
        .expect("the workspace");
        let link = locator(&organization, &owner)
            .await
            .expect("the organization's locator");

        assert_eq!(link.organization_id, created.organization_id);

        (organization, owner, link, workspace.id, platform)
    }

    /// A machine's record with nothing on it, which is what a new machine is.
    fn fresh_machine(directory: &std::path::Path) -> Persisted<RemoteSyncStore> {
        let machine = Persisted::<RemoteSyncStore>::load(directory.join("remote-sync.json"))
            .expect("the store");

        assert!(
            machine.organization.is_none(),
            "the machine has prior state"
        );

        machine
    }

    /// Effort 828, requirement 19: **the standing a card reads is the member row and the register,
    /// asked together.**
    ///
    /// A fresh account has no password and nobody signed in on it; opening its link sets the first
    /// and the second; signing that machine out leaves the password and takes the machine away.
    /// Those are the three lines the directory draws, and each is a fact about the account:
    /// [`make_link`] reads neither half, so no line here is the reason a link is missing.
    #[tokio::test]
    async fn a_standing_is_the_password_and_the_register_read_together() {
        let credentials = Memory::new();
        let directory = scratch("standings");
        let (store, owner, link, _, _) = owned(&credentials, &directory).await;
        let account = create_account(
            &store,
            &owner,
            no_platform(),
            "sami.staff",
            permission::MEMBER,
            0,
            &[],
            test_cost(),
            NOW,
        )
        .await
        .expect("the account could not be made");
        let standing = |list: Vec<MemberStanding>, id: &str| {
            list.into_iter()
                .find(|standing| standing.member_id == id)
                .expect("the account is not in the standings")
        };

        let fresh = standing(
            standings(&store, &owner, NOW)
                .await
                .expect("the standings could not be read"),
            &account.id,
        );

        assert!(!fresh.password_set, "a fresh account had a password");
        assert!(
            !fresh.machine_signed_in,
            "a fresh account had a machine signed in"
        );

        let made = make_link(
            &store,
            &owner,
            no_platform(),
            &link,
            &account.id,
            test_cost(),
            NOW,
        )
        .await
        .expect("the link could not be made");
        let theirs = scratch("standings-theirs");
        let mut their_machine = fresh_machine(&theirs);

        crate::organization::invitation::join::accept(
            &credentials,
            |_| async { Ok::<_, Error>(&store) },
            &mut their_machine,
            &theirs.join("app.db"),
            &JoinLink::decode(&made.link).expect("the link"),
            &made.code,
            CHOSEN,
            test_cost(),
            NOW + 1,
        )
        .await
        .expect("the account could not be opened");

        let opened = standing(
            standings(&store, &owner, NOW + 1)
                .await
                .expect("the standings could not be read"),
            &account.id,
        );

        assert!(
            opened.password_set,
            "an account that chose a password still read as having none"
        );
        assert!(
            opened.machine_signed_in,
            "the machine that opened the link is not in the register"
        );

        store
            .unregister_machine(
                &their_machine
                    .organization
                    .as_ref()
                    .expect("the record")
                    .machine_id,
            )
            .await
            .expect("the machine could not be taken out of the register");

        let signed_out = standing(
            standings(&store, &owner, NOW + 2)
                .await
                .expect("the standings could not be read"),
            &account.id,
        );

        assert!(signed_out.password_set);
        assert!(
            !signed_out.machine_signed_in,
            "a machine that signed out is still in the register"
        );
        // the owner's own machine is in the register too, which is what makes the list a list
        // rather than one row.
        assert!(
            standings(&store, &owner, NOW + 2)
                .await
                .expect("the standings could not be read")
                .len()
                >= 2
        );
    }
}
