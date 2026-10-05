//! what a member may do, changed from their row and from the roles: the role they hold, their
//! override, the roles themselves, and the certificate that follows all three.
//!
//! **A role is a named set of flags and the override changes it for one member** (effort 838,
//! requirements 4 to 6). A member's permissions are their role's mask exclusive-or'd with their
//! override, computed on read from the verified rows; what changes them is a write to a role row
//! ([`create_role`], [`rename_role`], [`set_role_mask`], [`move_role`], [`delete_role`]) or to the
//! member's own row ([`assign_role`], [`set_override`]). *A role was a word beside a hand-edited
//! number until effort 838, and `change_role` wrote the two together.*
//!
//! **Nobody reaches above themselves or grants what they do not hold** (requirement 7). Each act is
//! gated on its flag, on the rank of what it touches, strictly below the actor's, on never being the
//! actor's own row, and on every flag it changes, in a role's mask or in anybody's effective
//! permissions, being one the actor holds; none of the owner's flags is set anywhere but on the
//! owner. The comparison is made here, with the before and the after in hand ([`apply`](apply::apply)); a reader
//! checks that a row is one its certificate may sign, which bounds a role's mask and a member's
//! override by the signer's ceiling and never lets a signer's own row be theirs to sign.
//!
//! **The certificate follows, in the same act** ([`reissue`], requirement 9). Whoever changes a
//! member's effective permissions or rank issues them a fresh certificate from their own, re-signs
//! under their own the rows the old one signed, issues again what the old one issued, and revokes
//! it, all in one transaction. A manager therefore gives a member a flag that signs rows with the
//! owner's machine off, and it verifies on the next sync. A holder whose certificate the actor
//! could not issue refuses the whole act by name. `workspace::signer_of` is untouched: a member
//! signs because a certificate names their key, never because something read their role.
//!
//! **Nobody changes their own row and nobody changes the owner's.** The first keeps the act an act
//! on somebody else, so a manager cannot grant themselves what they were not given; the second is
//! requirement 3's, and the organization is the owner's.
//!
//! The one path each of those writes takes is [`apply`](apply::apply), and the certificate that
//! follows it is `certificate`'s; the acts on a member's own row are `assign`'s. The handover of
//! the owner's row is `ownership`'s.

mod apply;
mod assign;
pub(crate) mod certificate;
mod command;
pub mod permission;

pub use assign::*;
pub(crate) use certificate::in_one_transaction;
pub(in crate::organization) use certificate::{Standing, reissue, reissue_within};
pub use command::*;

use serde::{Deserialize, Serialize};

use crate::{
    diagnostics,
    error::{Error, RefusalReason},
};

use super::{
    invitation::{MemberFacts, members, random_id},
    member::vault::{open_content, seal_content},
    session::{MemberSession, actor},
    store::{OrganizationStore, RoleRecord},
};
use apply::{Change, apply, placed, refuse_built_in, role_row, top_for, validated_name};
use permission::{CUSTOM, Flag};

// -------------------------------------------------------------------------------------------
// Effort 838, requirements 4 to 7 and 9: roles, the role a member holds, and their override.
// -------------------------------------------------------------------------------------------

/// One role as the settings area lists it (effort 838, requirement 12): which role, what kind,
/// what it is called, what it carries, how high it stands, and how many members hold it.
///
/// **`name` is empty on the three built-in roles**, whose names the interface gives in the
/// reader's language; a custom role's is opened with the content key the session holds. Nothing
/// about the certificate that signed the row crosses.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RoleFacts {
    pub id: String,
    /// `owner`, `manager`, `member` or `custom`.
    pub kind: String,
    pub name: String,
    pub mask: i64,
    pub rank: i64,
    /// the members still in who hold the role.
    pub holders: usize,
}

/// The column a custom role's name is sealed under.
const ROLE_NAME_COLUMN: &str = "role.name_sealed";

/// Every role, highest rank first: the owner's constant, then every verified row. What any signed
/// in member reads.
pub async fn roles(
    store: &OrganizationStore,
    session: &MemberSession,
) -> Result<Vec<RoleFacts>, Error> {
    let rows = store.roles(&session.verifying_key).await?;
    let members = store.members(&session.verifying_key).await?;
    let holders = |role_id: &str| {
        members
            .iter()
            .filter(|member| member.role_id == role_id && member.removed_at.is_none())
            .count()
    };
    let mut facts = vec![RoleFacts {
        id: permission::OWNER.to_string(),
        kind: permission::OWNER.to_string(),
        name: String::new(),
        mask: permission::OWNER_ROLE.mask,
        rank: permission::OWNER_ROLE.rank,
        holders: holders(permission::OWNER),
    }];

    for role in rows {
        facts.push(facts_of(session, &role, holders(&role.id))?);
    }

    Ok(facts)
}

/// One verified role row as [`RoleFacts`].
fn facts_of(
    session: &MemberSession,
    role: &RoleRecord,
    holders: usize,
) -> Result<RoleFacts, Error> {
    let name = if role.name_sealed.is_empty() {
        String::new()
    } else {
        String::from_utf8(open_content(
            &session.content_key,
            ROLE_NAME_COLUMN,
            &role.name_sealed,
        )?)
        .map_err(|_| Error::Integrity {
            message: "a role's name did not open as text".to_string(),
        })?
    };

    Ok(RoleFacts {
        id: role.id.clone(),
        kind: role.kind.clone(),
        name,
        mask: role.mask,
        rank: role.rank,
        holders,
    })
}

/// The role a member row names, as the facts about that member carry it (effort 838, requirement
/// 8): its kind, its name and its rank, beside the effective permissions the row already reads.
///
/// **Off the verified rows the caller already read**, so a list of members pays for one read of the
/// roles rather than one per member. A role id no row carries reads as the member's, as
/// [`kind_of`] reads it.
pub(crate) struct HeldRole {
    pub kind: String,
    pub name: String,
    pub rank: i64,
}

/// The kind of the role `role_id` names, from the verified `rows` and the owner's constant: what
/// a session and the machine's record call the role a member holds (effort 838, the plan's
/// *Interfaces*). A role id no row carries reads as the member's, the role a deleted one's holders
/// move to.
pub(crate) fn kind_of(rows: &[RoleRecord], role_id: &str) -> String {
    if role_id == permission::OWNER {
        return permission::OWNER.to_string();
    }

    rows.iter()
        .find(|role| role.id == role_id)
        .map_or_else(|| permission::MEMBER.to_string(), |role| role.kind.clone())
}

/// The role `role_id` names, from the verified `rows` and the owner's constant.
pub(crate) fn held_role(
    session: &MemberSession,
    rows: &[RoleRecord],
    role_id: &str,
) -> Result<HeldRole, Error> {
    if role_id == permission::OWNER {
        return Ok(HeldRole {
            kind: permission::OWNER.to_string(),
            name: String::new(),
            rank: permission::OWNER_ROLE.rank,
        });
    }

    match rows.iter().find(|role| role.id == role_id) {
        Some(role) => {
            let facts = facts_of(session, role, 0)?;

            Ok(HeldRole {
                kind: facts.kind,
                name: facts.name,
                rank: facts.rank,
            })
        }
        None => Ok(HeldRole {
            kind: permission::MEMBER.to_string(),
            name: String::new(),
            rank: permission::MEMBER_ROLE.rank,
        }),
    }
}

/// The role as it reads back after an act on it.
async fn role_facts(
    store: &OrganizationStore,
    session: &MemberSession,
    role_id: &str,
) -> Result<RoleFacts, Error> {
    roles(store, session)
        .await?
        .into_iter()
        .find(|role| role.id == role_id)
        .ok_or_else(|| Error::Integrity {
            message: "the role did not read back".to_string(),
        })
}

/// The member as the members list shows them, after an act on their row.
async fn member_facts(
    store: &OrganizationStore,
    session: &MemberSession,
    member_id: &str,
) -> Result<MemberFacts, Error> {
    members(store, session)
        .await?
        .into_iter()
        .find(|member| member.id == member_id)
        .ok_or_else(|| Error::Integrity {
            message: "the changed member's row did not read back".to_string(),
        })
}

/// Push what an act wrote, and say so where it could not go yet.
pub(in crate::organization) async fn sent(
    store: &OrganizationStore,
    event: &'static str,
    key: &str,
    value: &str,
) {
    if !store.push().await {
        diagnostics::warn(event).with(key, value).write();
    }
}

/// Make a custom role (requirement 4): a name, a mask, and a place directly below `after_role_id`.
///
/// **`manageRoles`, below your rank, and only flags you hold** (requirement 7). The place is below
/// the actor as well as below the manager, and the mask carries nothing the actor does not and none
/// of the owner's. Nobody holds the role yet, so no certificate moves unless making room renumbers
/// roles that somebody does hold, and then theirs follow ([`apply`](apply::apply)).
pub async fn create_role(
    store: &OrganizationStore,
    session: &MemberSession,
    name: &str,
    mask: i64,
    after_role_id: &str,
    now: i64,
) -> Result<RoleFacts, Error> {
    session.settled()?;

    let actor = actor(store, session).await?;

    permission::require(actor.row.effective, Flag::ManageRoles)?;

    let rows = store.roles(&session.verifying_key).await?;
    let name = validated_name(session, &rows, name, None)?;
    let (rank, renumbered) = placed(&rows, after_role_id, top_for(&actor))?;
    let id = format!("role-{}", random_id()?);
    let role = RoleRecord {
        id: id.clone(),
        kind: CUSTOM.to_string(),
        name_sealed: seal_content(&session.content_key, ROLE_NAME_COLUMN, name.as_bytes())?,
        mask,
        rank,
    };

    apply(
        store,
        session,
        &actor,
        Change {
            roles: renumbered.into_iter().chain([role]).collect(),
            ..Change::default()
        },
        now,
    )
    .await?;

    sent(store, "organization.role.createNotYetSent", "role", &id).await;
    diagnostics::info("organization.role.created")
        .with("role", id.as_str())
        .write();

    role_facts(store, session, &id).await
}

/// Rename a custom role (requirement 4). **`manageRoles`, and below your rank**; a built-in role
/// keeps the name the interface gives it. No flag moves, so nothing but the role row is written.
pub async fn rename_role(
    store: &OrganizationStore,
    session: &MemberSession,
    role_id: &str,
    name: &str,
    now: i64,
) -> Result<RoleFacts, Error> {
    session.settled()?;

    let actor = actor(store, session).await?;

    permission::require(actor.row.effective, Flag::ManageRoles)?;
    refuse_built_in(role_id, "renamed")?;

    let rows = store.roles(&session.verifying_key).await?;
    let role = role_row(&rows, role_id)?.clone();

    actor.outranks(
        role.rank,
        "that role is not below yours, so it is renamed by somebody who ranks above it",
    )?;

    let name = validated_name(session, &rows, name, Some(role_id))?;

    apply(
        store,
        session,
        &actor,
        Change {
            roles: vec![RoleRecord {
                name_sealed: seal_content(&session.content_key, ROLE_NAME_COLUMN, name.as_bytes())?,
                ..role
            }],
            ..Change::default()
        },
        now,
    )
    .await?;

    sent(store, "organization.role.renameNotYetSent", "role", role_id).await;
    diagnostics::info("organization.role.renamed")
        .with("role", role_id)
        .write();

    role_facts(store, session, role_id).await
}

/// Change what a role carries (requirements 3 and 4): the manager's, the member's or a custom
/// role's; never the owner's, which is every flag.
///
/// **`manageRoles`, below your rank, and only flags you hold.** Every flag switched, on or off, is
/// one the actor holds, and none is the owner's. Every holder's effective permissions move with
/// the mask, so every holder's certificate is issued again from the actor's in the same act, and a
/// holder whose certificate the actor could not issue refuses it ([`apply`](apply::apply)).
pub async fn set_role_mask(
    store: &OrganizationStore,
    session: &MemberSession,
    role_id: &str,
    mask: i64,
    now: i64,
) -> Result<RoleFacts, Error> {
    session.settled()?;

    let actor = actor(store, session).await?;

    permission::require(actor.row.effective, Flag::ManageRoles)?;

    if role_id == permission::OWNER {
        return Err(Error::refused(
            RefusalReason::RoleBuiltIn,
            "the owner's role carries every flag, and its mask is not edited",
        ));
    }

    let rows = store.roles(&session.verifying_key).await?;
    let role = role_row(&rows, role_id)?.clone();

    actor.outranks(
        role.rank,
        "that role is not below yours, so what it carries is changed by somebody who ranks above \
         it",
    )?;

    apply(
        store,
        session,
        &actor,
        Change {
            roles: vec![RoleRecord { mask, ..role }],
            ..Change::default()
        },
        now,
    )
    .await?;

    sent(store, "organization.role.maskNotYetSent", "role", role_id).await;
    diagnostics::info("organization.role.maskChanged")
        .with("role", role_id)
        .write();

    role_facts(store, session, role_id).await
}

/// Move a custom role to directly below `after_role_id` (requirement 4).
///
/// **`manageRoles`, and the rank of both**: the role moved ranks below the actor, and so does the
/// place it moves to, so `after_role_id` may be the actor's own role and nothing above it. The rank
/// taken is the midpoint of its new neighbours, and where they leave no room the custom roles below
/// the actor are renumbered ([`placed`]). Every holder of a role whose rank moved is issued a
/// certificate carrying the new one, in the same act.
pub async fn move_role(
    store: &OrganizationStore,
    session: &MemberSession,
    role_id: &str,
    after_role_id: &str,
    now: i64,
) -> Result<RoleFacts, Error> {
    session.settled()?;

    let actor = actor(store, session).await?;

    permission::require(actor.row.effective, Flag::ManageRoles)?;
    refuse_built_in(role_id, "moved")?;

    let rows = store.roles(&session.verifying_key).await?;
    let role = role_row(&rows, role_id)?.clone();

    actor.outranks(
        role.rank,
        "that role is not below yours, so it is moved by somebody who ranks above it",
    )?;

    if after_role_id == role_id {
        return Err(Error::refused(
            RefusalReason::RoleOutOfPlace,
            "a role is moved below another role, not below itself",
        ));
    }

    let others: Vec<RoleRecord> = rows
        .iter()
        .filter(|other| other.id != role_id)
        .cloned()
        .collect();
    let (rank, renumbered) = placed(&others, after_role_id, top_for(&actor))?;

    apply(
        store,
        session,
        &actor,
        Change {
            roles: renumbered
                .into_iter()
                .chain([RoleRecord { rank, ..role }])
                .collect(),
            ..Change::default()
        },
        now,
    )
    .await?;

    sent(store, "organization.role.moveNotYetSent", "role", role_id).await;
    diagnostics::info("organization.role.moved")
        .with("role", role_id)
        .write();

    role_facts(store, session, role_id).await
}

/// Delete a custom role (requirement 4): every member who held it holds the member role from here
/// on, exactly: the override they carried is cleared in the same signed write, since they are given
/// another role (requirement 6, as amended 2026-09-27). *They kept it, read against the member
/// role's mask, until that amendment.*
///
/// **`manageRoles`, and below your rank.** Moving the holders changes their effective permissions,
/// so every flag that changes for any of them is one the actor holds, and every holder's certificate
/// is issued again in the same act ([`apply`](apply::apply)).
pub async fn delete_role(
    store: &OrganizationStore,
    session: &MemberSession,
    role_id: &str,
    now: i64,
) -> Result<(), Error> {
    session.settled()?;

    let actor = actor(store, session).await?;

    permission::require(actor.row.effective, Flag::ManageRoles)?;
    refuse_built_in(role_id, "deleted")?;

    let rows = store.roles(&session.verifying_key).await?;
    let role = role_row(&rows, role_id)?;

    actor.outranks(
        role.rank,
        "that role is not below yours, so it is deleted by somebody who ranks above it",
    )?;

    apply(
        store,
        session,
        &actor,
        Change {
            deleted: vec![role_id.to_string()],
            ..Change::default()
        },
        now,
    )
    .await?;

    sent(store, "organization.role.deleteNotYetSent", "role", role_id).await;
    diagnostics::info("organization.role.deleted")
        .with("role", role_id)
        .write();

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{delete_role, move_role, rename_role, set_override, set_role_mask};
    use crate::credential::{CredentialStore, Memory};
    use crate::error::{Error, RefusalReason};
    use crate::machine::RemoteSyncStore;
    use crate::organization::HeldOrganization;
    use crate::organization::authority::{AdministratorKey, Certificate, VERIFYING_KEY_BYTES};
    use crate::organization::invitation::link::Locator;
    use crate::organization::invitation::{
        AccountAndLink, Invitation, WorkspaceGrant, locator, make_account_and_link,
    };
    use crate::organization::member::removal;
    use crate::organization::member::vault::KdfParams;
    use crate::organization::ownership::organization_key_of;
    use crate::organization::role::permission::{self, Flag};
    use crate::organization::role::{assign_role, create_role};
    use crate::organization::session::{CredentialSlot, MemberSession, sign_in};
    use crate::organization::setup::{
        ADMINISTRATOR_KEY_PURPOSE, CreateOrganization, Remote, create_organization,
    };
    use crate::organization::store::{
        GrantRecord, MemberRecord, OrganizationStore, Signer, TABLES, WorkspaceOverrideRecord,
        pins_of,
    };
    use crate::organization::workspace::remote::Pipeline;
    use crate::organization::workspace::{create_workspace, grant_workspace, signer_of};
    use crate::persisted::Persisted;
    use crate::sync::test::server::{ScriptedResponse, ScriptedServer};
    use crate::test::scratch;
    use crate::turso::discovery::McpEndpoint;
    use crate::turso::platform::{AccessLevel, InMemoryPlatform};
    use serde_json::json;
    use std::sync::{Arc, Mutex};

    const PASSWORD: &str = "the owners password";

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

    /// No platform authority in hand, which is every session here: nothing this module does mints
    /// anything.
    fn no_platform() -> Option<&'static InMemoryPlatform> {
        None
    }

    /// Full access on each workspace named, which is what every invitation here grants.
    fn full(ids: &[String]) -> Vec<WorkspaceGrant> {
        ids.iter()
            .map(|id| WorkspaceGrant {
                id: id.clone(),
                access: AccessLevel::FullAccess,
            })
            .collect()
    }

    /// The password an invitation's vault was sealed under: the link's own secret and the code
    /// together open the payload the link carries, which is what the person opening the link does
    /// (effort 828, requirement 1). *It was the link's secret alone until effort 826 made the code
    /// the other half, and it read the row's `code_seal` until effort 828 moved the seal into the
    /// link's text.*
    fn secret_of(invited: &AccountAndLink) -> String {
        crate::organization::invitation::vault_password_of(
            &invited.join_link,
            &invited.code,
            test_cost(),
        )
    }

    /// The machine's record of a member who joined.
    fn joined_as(owner: &MemberSession, member_id: &str, role: &str) -> HeldOrganization {
        HeldOrganization {
            id: owner.organization_id.clone(),
            name: "Acme".to_string(),
            verifying_key: base64::Engine::encode(
                &base64::engine::general_purpose::URL_SAFE_NO_PAD,
                owner.verifying_key,
            ),
            remote_url: String::new(),
            machine_id: "machine-one".to_string(),
            member_id: Some(member_id.to_string()),
            role: Some(role.to_string()),
            joined_at: 0,
            format: None,
            machine_signed_out: 0,
            turso_organization: None,
            workspace_id: None,
            name_signed: false,
            name_signed_at: 0,
            lock_marked: false,
            own_lock_latched: None,
        }
    }

    /// An organization with its owner signed in and one workspace, on a fake account.
    async fn owned(
        credentials: &dyn CredentialStore,
        directory: &std::path::Path,
    ) -> (OrganizationStore, MemberSession, Locator, String) {
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

        let (_, organization) = create_organization(
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
            NOW,
        )
        .await
        .expect("the first run failed");
        let joined = store.selected().cloned().expect("the record");
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
            NOW,
        )
        .await
        .expect("the workspace");
        let link = locator(&organization, &owner)
            .await
            .expect("the organization's link");

        (organization, owner, link, workspace.id)
    }

    /// A member of this organization, invited and signed in, with their password change settled
    /// the way an accept settles it.
    async fn a_member(
        store: &OrganizationStore,
        owner: &MemberSession,
        link: &Locator,
        username: &'static str,
        role: &str,
        workspace_id: &str,
    ) -> (AccountAndLink, MemberSession) {
        let workspaces = full(&[workspace_id.to_string()]);
        let invited = make_account_and_link(
            store,
            owner,
            no_platform(),
            link,
            Invitation {
                username,
                role,
                workspaces: &workspaces,
            },
            test_cost(),
            NOW,
        )
        .await
        .expect("the invitation failed");
        // every account starts locked (effort 851), and the acts these tests are about are an
        // unlocked member's: unlocked by whoever made it, where they may, and left locked by a
        // maker holding neither flag that unlocks, as it would be.
        let _ = crate::organization::member::lock::unlocked_for_a_test(
            store,
            owner,
            &invited.member_id,
        )
        .await;
        let mut session = sign_in(
            store,
            &joined_as(owner, &invited.member_id, role),
            &secret_of(&invited),
            &slot(),
        )
        .await
        .expect("the invited member did not sign in");
        session.must_change_password = false;

        (invited, session)
    }

    /// Every row of the organization, cell by cell, so a refusal that wrote something is caught
    /// wherever it wrote it.
    async fn every_row(store: &OrganizationStore) -> Vec<(String, Vec<Option<Vec<u8>>>)> {
        let mut rows_out = Vec::new();

        for table in TABLES {
            let mut rows = store
                .connection()
                .query(&format!("SELECT * FROM \"{table}\" ORDER BY 1, 2"), ())
                .await
                .expect("the rows");

            while let Some(row) = rows.next().await.expect("a row") {
                let mut cells = Vec::new();

                for index in 0..row.column_count() {
                    cells.push(match row.get_value(index).expect("a value") {
                        turso::Value::Text(text) => Some(text.into_bytes()),
                        turso::Value::Blob(blob) => Some(blob),
                        turso::Value::Integer(value) => Some(value.to_be_bytes().to_vec()),
                        turso::Value::Real(value) => Some(value.to_be_bytes().to_vec()),
                        turso::Value::Null => None,
                    });
                }

                rows_out.push((table.to_string(), cells));
            }
        }

        rows_out
    }

    /// What a member's row carries now, read through the verified reader, so a row that stopped
    /// verifying fails here rather than reading back as though nothing had happened.
    async fn row_of(
        store: &OrganizationStore,
        owner: &MemberSession,
        member_id: &str,
    ) -> (String, i64) {
        let member = store
            .members(&owner.verifying_key)
            .await
            .expect("the rows verify")
            .into_iter()
            .find(|member| member.id == member_id)
            .expect("the member row");

        (member.role_id, member.effective)
    }

    /// A copy of the replica as another machine would hold it, opened as a second store. Every
    /// read through it verifies against the key the link pinned rather than the one the database
    /// carries, which is what "verifies on every other client" means here.
    async fn another_machine(
        directory: &std::path::Path,
        organization_id: &str,
    ) -> OrganizationStore {
        let elsewhere = scratch("elsewhere");

        for entry in std::fs::read_dir(directory).expect("the directory") {
            let path = entry.expect("an entry").path();
            let name = path
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or_default()
                .to_string();

            if name.starts_with("org-") {
                std::fs::copy(&path, elsewhere.join(&name)).expect("the copy");
            }
        }

        OrganizationStore::open(
            crate::clock::System::shared(),
            &OrganizationStore::replica_path(&elsewhere.join("app.db"), organization_id),
            None,
            || async { Err(turso::Error::Misuse("no remote".into())) },
        )
        .await
        .expect("their replica did not open")
    }

    // -------------------------------------------------------------------------------------
    // Effort 838, requirements 3 to 7 and 9: roles, assignment and the override.
    // -------------------------------------------------------------------------------------

    /// The word a refusal carries, or a panic naming what came back instead.
    fn reason_of(error: &Error) -> RefusalReason {
        match error {
            Error::Refused { reason, .. } => *reason,
            other => panic!("not a refusal: {other:?}"),
        }
    }

    /// A member's row, read through the verified reader.
    async fn member_row(
        store: &OrganizationStore,
        owner: &MemberSession,
        id: &str,
    ) -> MemberRecord {
        store
            .members(&owner.verifying_key)
            .await
            .expect("the rows verify")
            .into_iter()
            .find(|member| member.id == id)
            .expect("the member row")
    }

    /// The one live certificate a member holds: **every live member holds exactly one**, and this
    /// fails where they hold none or two.
    async fn the_certificate(
        store: &OrganizationStore,
        owner: &MemberSession,
        member_id: &str,
    ) -> Certificate {
        let mut live = store
            .live_certificates(&owner.verifying_key, member_id)
            .await
            .expect("the certificates");

        assert_eq!(
            live.len(),
            1,
            "{member_id} holds {} live certificates",
            live.len()
        );

        live.pop().expect("the certificate")
    }

    /// A custom role made by the owner, directly below `after`.
    async fn a_role(
        store: &OrganizationStore,
        owner: &MemberSession,
        name: &str,
        mask: i64,
        after: &str,
    ) -> String {
        create_role(store, owner, name, mask, after, NOW)
            .await
            .unwrap_or_else(|error| panic!("the owner could not make {name}: {error:?}"))
            .id
    }

    /// A member signed in, given `role_id` by the owner.
    async fn holding_role(
        store: &OrganizationStore,
        owner: &MemberSession,
        link: &Locator,
        username: &'static str,
        role_id: &str,
        workspace_id: &str,
    ) -> MemberSession {
        let (_, session) = a_member(
            store,
            owner,
            link,
            username,
            permission::MEMBER,
            workspace_id,
        )
        .await;

        if role_id != permission::MEMBER {
            assign_role(store, owner, &session.member_id, role_id, None, NOW)
                .await
                .unwrap_or_else(|error| panic!("{username} was not given {role_id}: {error:?}"));
        }

        session
    }

    /// Sign `victim`'s row again under `forger`'s certificate, around the store, as the role given
    /// and removed where asked: a demotion written by somebody holding the credential.
    async fn demoted_around_the_store(
        store: &OrganizationStore,
        owner: &MemberSession,
        forger: &MemberSession,
        victim_id: &str,
        role_id: &str,
        removed_at: Option<i64>,
    ) {
        let (key, certificate) = signer_of(store, forger).await.expect("the forger signs");

        store
            .write_member_around_the_check(
                &Signer {
                    key: &key,
                    certificate: &certificate,
                },
                &MemberRecord {
                    role_id: role_id.to_string(),
                    override_mask: 0,
                    removed_at,
                    ..member_row(store, owner, victim_id).await
                },
            )
            .await
            .expect("written around the store");
    }

    /// A lead: the member role's flags with `inviteMember` and `grantWorkspace`, below the
    /// manager, signed in.
    async fn a_lead(
        store: &OrganizationStore,
        owner: &MemberSession,
        link: &Locator,
        workspace_id: &str,
    ) -> MemberSession {
        let lead = a_role(
            store,
            owner,
            "Lead",
            permission::MEMBER_ROLE.mask
                | permission::mask_of(&[Flag::InviteMember, Flag::GrantWorkspace]),
            permission::MANAGER,
        )
        .await;

        holding_role(store, owner, link, "lena", &lead, workspace_id).await
    }

    /// Every custom role, highest first, as `(id, rank)`, and each rank checked strictly between
    /// the member's and the manager's (criterion 4).
    async fn custom_ranks(store: &OrganizationStore, owner: &MemberSession) -> Vec<(String, i64)> {
        let ranks: Vec<(String, i64)> = store
            .roles(&owner.verifying_key)
            .await
            .expect("the roles verify")
            .into_iter()
            .filter(|role| role.kind == "custom")
            .map(|role| (role.id, role.rank))
            .collect();

        for (id, rank) in &ranks {
            assert!(
                *rank > permission::MEMBER_ROLE.rank && *rank < permission::MANAGER_ROLE.rank,
                "{id} ranks {rank}, outside the member and the manager"
            );
        }

        ranks
    }

    /// Requirements 5 and 6: a role and an override are written on the row, re-signed, the
    /// certificate follows each, and the answer is the member as the list will show them.
    #[tokio::test]
    async fn a_role_and_an_override_are_written_re_signed_and_read_back() {
        let credentials = Memory::new();
        let directory = scratch("write");
        let (store, owner, link, workspace_id) = owned(&credentials, &directory).await;
        let (invited, _) = a_member(
            &store,
            &owner,
            &link,
            "sami.staff",
            permission::MEMBER,
            &workspace_id,
        )
        .await;

        let managed = assign_role(
            &store,
            &owner,
            &invited.member_id,
            permission::MANAGER,
            None,
            NOW + 1,
        )
        .await
        .expect("the assignment failed");

        assert_eq!(managed.id, invited.member_id);
        assert_eq!(managed.username, "sami.staff");
        assert_eq!(managed.permissions, permission::MANAGER_ROLE.mask);
        assert_eq!(
            managed
                .workspaces
                .iter()
                .map(|workspace| workspace.id.clone())
                .collect::<Vec<_>>(),
            vec![workspace_id.clone()],
            "the assignment moved what the member holds"
        );

        let row = member_row(&store, &owner, &invited.member_id).await;

        assert_eq!(row.role_id, permission::MANAGER);
        assert_eq!(row.override_mask, 0);

        let certificate = the_certificate(&store, &owner, &invited.member_id).await;

        assert_eq!(certificate.ceiling, permission::MANAGER_ROLE.mask);
        assert_eq!(certificate.rank, permission::MANAGER_ROLE.rank);

        // and an override, which switches one flag off the role for them alone.
        let overridden = set_override(
            &store,
            &owner,
            &invited.member_id,
            permission::mask_of(&[Flag::InviteMember]),
            NOW + 2,
        )
        .await
        .expect("the override failed");
        let narrower = permission::MANAGER_ROLE.mask & !permission::mask_of(&[Flag::InviteMember]);

        assert_eq!(overridden.permissions, narrower);
        assert_eq!(
            member_row(&store, &owner, &invited.member_id)
                .await
                .override_mask,
            permission::mask_of(&[Flag::InviteMember])
        );
        assert_eq!(
            the_certificate(&store, &owner, &invited.member_id)
                .await
                .ceiling,
            narrower
        );
    }

    /// Requirement 8, across the boundary: the members list and the session's own facts carry the
    /// role's kind, id, name and rank, the override, and the effective permissions, in the names
    /// the web layer reads; and nothing about a certificate crosses.
    #[tokio::test]
    async fn the_facts_carry_the_role_its_rank_the_override_and_the_effective_permissions() {
        let credentials = Memory::new();
        let directory = scratch("facts");
        let (store, owner, link, workspace_id) = owned(&credentials, &directory).await;
        let mask = permission::MEMBER_ROLE.mask | permission::mask_of(&[Flag::RenameMember]);
        let bookkeeper = a_role(&store, &owner, "bookkeeper", mask, permission::MANAGER).await;
        let held = holding_role(
            &store,
            &owner,
            &link,
            "sami.staff",
            &bookkeeper,
            &workspace_id,
        )
        .await;
        let switched = permission::mask_of(&[Flag::RenameMember, Flag::DeletePayment]);

        set_override(&store, &owner, &held.member_id, switched, NOW + 1)
            .await
            .expect("the override failed");

        let effective = permission::effective(mask, switched);
        let rank = crate::organization::role::roles(&store, &owner)
            .await
            .expect("the roles")
            .into_iter()
            .find(|role| role.id == bookkeeper)
            .expect("the role is listed")
            .rank;
        let listed = crate::organization::invitation::members(&store, &owner)
            .await
            .expect("the members");
        let member = listed
            .iter()
            .find(|member| member.id == held.member_id)
            .expect("the member is listed");

        assert_eq!(member.role, "custom");
        assert_eq!(member.role_id, bookkeeper);
        assert_eq!(member.role_name, "bookkeeper");
        assert_eq!(member.rank, rank);
        assert_eq!(member.override_mask, switched);
        assert_eq!(member.permissions, effective);

        let founder = listed
            .iter()
            .find(|member| member.id == owner.member_id)
            .expect("the owner is listed");

        assert_eq!(
            (
                founder.role.as_str(),
                founder.role_id.as_str(),
                founder.role_name.as_str(),
                founder.rank,
                founder.override_mask,
            ),
            (
                permission::OWNER,
                permission::OWNER,
                "",
                permission::OWNER_ROLE.rank,
                0
            )
        );

        let facts = crate::organization::session::facts_of(
            &store,
            &held,
            &mut joined_as(&held, &held.member_id, &held.role),
        )
        .await
        .expect("the session's facts");

        assert_eq!(facts.role, "custom");
        assert_eq!(facts.role_id, bookkeeper);
        assert_eq!(facts.role_name, "bookkeeper");
        assert_eq!(facts.rank, rank);
        assert_eq!(facts.override_mask, switched);
        assert_eq!(facts.permissions, effective);

        // the manager crosses as its kind, where the word used to be `administrator`, and the
        // override is cleared by the assignment (requirement 6, as amended 2026-09-27).
        assign_role(
            &store,
            &owner,
            &held.member_id,
            permission::MANAGER,
            None,
            NOW + 2,
        )
        .await
        .expect("the assignment failed");
        let facts = crate::organization::session::facts_of(
            &store,
            &held,
            &mut joined_as(&held, &held.member_id, &held.role),
        )
        .await
        .expect("the session's facts");

        assert_eq!(facts.role, permission::MANAGER);
        assert_eq!(facts.role_name, "");
        assert_eq!(facts.rank, permission::MANAGER_ROLE.rank);

        // the names the web layer reads, and no certificate among them.
        let crossed = serde_json::to_value(&facts).expect("the facts serialise");
        let crossed_member = serde_json::to_value(member).expect("the member serialises");

        for value in [&crossed, &crossed_member] {
            let keys = value
                .as_object()
                .expect("an object")
                .keys()
                .cloned()
                .collect::<Vec<_>>();

            for key in [
                "role",
                "roleId",
                "roleName",
                "rank",
                "override",
                "permissions",
            ] {
                assert!(keys.iter().any(|name| name == key), "{key} did not cross");
            }
            assert!(
                keys.iter()
                    .all(|name| !name.to_lowercase().contains("certificate")
                        && !name.to_lowercase().contains("key")),
                "a certificate or a key crossed: {keys:?}"
            );
        }
        assert_eq!(crossed["override"], json!(0));
        assert_eq!(crossed_member["override"], json!(switched));
    }

    /// The refusals, each before anything is written: nobody changes their own row, nobody changes
    /// the owner's, a member with no flag changes nobody, a role this organization does not hold is
    /// not assigned, and a member who is not here is not found.
    #[tokio::test]
    async fn the_refusals_come_before_any_write() {
        let credentials = Memory::new();
        let directory = scratch("refusals");
        let (store, owner, link, workspace_id) = owned(&credentials, &directory).await;
        let (invited, sami) = a_member(
            &store,
            &owner,
            &link,
            "sami.staff",
            permission::MEMBER,
            &workspace_id,
        )
        .await;
        let (_, ada) = a_member(
            &store,
            &owner,
            &link,
            "ada.admin",
            permission::MANAGER,
            &workspace_id,
        )
        .await;
        let owner_id = owner.member_id.clone();
        let before = every_row(&store).await;

        let own = set_override(&store, &ada, &ada.member_id, 0, NOW + 1)
            .await
            .expect_err("a manager changed their own override");

        assert_eq!(reason_of(&own), RefusalReason::NotYourself, "{own:?}");
        assert!(own.to_string().contains("your own"), "{own}");

        for refused in [
            assign_role(&store, &ada, &owner_id, permission::MEMBER, None, NOW + 1)
                .await
                .expect_err("a manager changed the owner's role"),
            assign_role(&store, &owner, &owner_id, permission::MEMBER, None, NOW + 1)
                .await
                .expect_err("the owner changed their own role"),
        ] {
            assert_eq!(
                reason_of(&refused),
                RefusalReason::OwnerProtected,
                "{refused:?}"
            );
        }

        let without = assign_role(
            &store,
            &sami,
            &invited.member_id,
            permission::MEMBER,
            None,
            NOW + 1,
        )
        .await
        .expect_err("a member with no flag assigned a role");

        assert!(without.to_string().contains("assignRole"), "{without}");

        let unknown = assign_role(
            &store,
            &owner,
            &invited.member_id,
            "superuser",
            None,
            NOW + 1,
        )
        .await
        .expect_err("a role this organization does not hold was assigned");

        assert_eq!(
            reason_of(&unknown),
            RefusalReason::RoleUnknown,
            "{unknown:?}"
        );

        let missing = assign_role(&store, &owner, "nobody", permission::MEMBER, None, NOW + 1)
            .await
            .expect_err("a member who is not here was changed");

        assert_eq!(
            reason_of(&missing),
            RefusalReason::MemberMissing,
            "{missing:?}"
        );

        assert_eq!(every_row(&store).await, before, "a refusal wrote something");
    }

    /// Requirement 9 and criterion 9: a member given a flag that signs rows signs one, it verifies
    /// on another machine, and taken back, a row they sign under the old certificate is refused.
    ///
    /// **Narrowed, they still hold one live certificate**: a narrower one, issued from the actor's.
    /// *`change_role` revoked the certificate and issued none where a narrowing left no signing
    /// act, until effort 838 made every member hold one.*
    #[tokio::test]
    async fn a_signing_flag_given_and_taken_back_follows_the_certificate() {
        let credentials = Memory::new();
        let directory = scratch("certificate");
        let (store, owner, link, workspace_id) = owned(&credentials, &directory).await;
        let (sami, opened) = a_member(
            &store,
            &owner,
            &link,
            "sami.staff",
            permission::MEMBER,
            &workspace_id,
        )
        .await;
        let granting = permission::mask_of(&[Flag::GrantWorkspace]);

        set_override(&store, &owner, &sami.member_id, granting, NOW + 1)
            .await
            .expect("the widening failed");

        // what was certified is the key they derive from their own vault secret, read off their
        // row: the whole reason the column exists.
        let theirs_to_sign_with = AdministratorKey::from_bytes(
            &opened
                .secret
                .derive_seed(ADMINISTRATOR_KEY_PURPOSE)
                .expect("the signing seed"),
        )
        .verifying_key();
        let certificate = the_certificate(&store, &owner, &sami.member_id).await;

        assert_eq!(certificate.signing_public_key, theirs_to_sign_with);
        assert!(permission::permits(
            certificate.ceiling,
            Flag::GrantWorkspace
        ));

        let (noor, _) = a_member(
            &store,
            &owner,
            &link,
            "noor.new",
            permission::MEMBER,
            &workspace_id,
        )
        .await;

        grant_workspace(
            &store,
            &opened,
            no_platform(),
            &workspace_id,
            &noor.member_id,
            AccessLevel::FullAccess,
        )
        .await
        .expect("a widened member could not grant");

        let is_theirs = |grant: &GrantRecord| {
            grant.member_id == noor.member_id && grant.workspace_id == workspace_id
        };
        let elsewhere = another_machine(&directory, &owner.organization_id).await;

        assert!(
            elsewhere
                .grants(&owner.verifying_key)
                .await
                .expect("the grant does not verify on another machine")
                .iter()
                .any(is_theirs),
            "the grant a widened member signed is not on the other machine"
        );

        drop(elsewhere);

        // taken back: the rows their certificate signed move under the owner, the certificate is
        // revoked, and a narrower one takes its place.
        set_override(&store, &owner, &sami.member_id, 0, NOW + 3)
            .await
            .expect("the narrowing failed");

        let narrower = the_certificate(&store, &owner, &sami.member_id).await;

        assert_ne!(narrower.id, certificate.id);
        assert_eq!(narrower.ceiling, permission::MEMBER_ROLE.mask);
        assert!(
            store.grants(&owner.verifying_key).await.is_ok(),
            "retiring the certificate bricked the rows it had signed"
        );

        // and a row they sign under the old one anyway is left out of the read (ticket 25).
        let key = AdministratorKey::from_bytes(
            &opened
                .secret
                .derive_seed(ADMINISTRATOR_KEY_PURPOSE)
                .expect("the signing seed"),
        );
        let grant = store
            .grants(&owner.verifying_key)
            .await
            .expect("the grants")
            .into_iter()
            .find(is_theirs)
            .expect("the grant they had signed");

        store
            .write_grant(
                &Signer {
                    key: &key,
                    certificate: &certificate,
                },
                &grant,
            )
            .await
            .expect("the write itself is not what refuses");

        // left out of the read rather than refusing it (effort 838, ticket 25).
        let grants = store
            .grants(&owner.verifying_key)
            .await
            .expect("a row signed under a revoked certificate refused every grant");

        assert!(
            !grants.iter().any(is_theirs),
            "a row signed under a revoked certificate was accepted"
        );
    }

    /// Effort 838, ticket 04: **a re-issue the actor could not complete is refused by name, and
    /// nothing moves.** A member signs a grant; a manager whose override takes `grantWorkspace` away
    /// narrows them. Retiring the member's certificate would mean re-signing the grant, which takes
    /// `grantWorkspace`: the change is refused naming it, and the chain, the grant and the member's
    /// row are as they were.
    #[tokio::test]
    async fn a_reissue_the_actor_could_not_complete_is_refused_by_name_and_moves_nothing() {
        let credentials = Memory::new();
        let directory = scratch("reissue-refused");
        let (store, owner, link, workspace_id) = owned(&credentials, &directory).await;
        let (sami, widened) = a_member(
            &store,
            &owner,
            &link,
            "sami.staff",
            permission::MEMBER,
            &workspace_id,
        )
        .await;
        let granting = permission::mask_of(&[Flag::GrantWorkspace]);

        set_override(&store, &owner, &sami.member_id, granting, NOW + 1)
            .await
            .expect("the widening failed");

        let (noor, _) = a_member(
            &store,
            &owner,
            &link,
            "noor.new",
            permission::MEMBER,
            &workspace_id,
        )
        .await;

        grant_workspace(
            &store,
            &widened,
            no_platform(),
            &workspace_id,
            &noor.member_id,
            AccessLevel::FullAccess,
        )
        .await
        .expect("a widened member could not grant");

        // a manager who may do everything a manager does but grant.
        let (ada, ada_session) = a_member(
            &store,
            &owner,
            &link,
            "ada.admin",
            permission::MANAGER,
            &workspace_id,
        )
        .await;

        set_override(&store, &owner, &ada.member_id, granting, NOW + 2)
            .await
            .expect("the narrowing of the manager failed");

        let chain_before = store.chain_rows().await.expect("the chain");
        let rows_before = every_row(&store).await;

        let refusal = set_override(&store, &ada_session, &sami.member_id, 0, NOW + 3)
            .await
            .expect_err("a narrowing that could not re-sign the grant went through");

        assert!(refusal.to_string().contains("grantWorkspace"), "{refusal}");
        assert_eq!(
            store.chain_rows().await.expect("the chain after"),
            chain_before,
            "a refused re-issue wrote a certificate or a revocation"
        );
        assert_eq!(
            every_row(&store).await,
            rows_before,
            "a refused re-issue wrote a row"
        );
    }

    /// **A narrowing reaches the open session.** A member loses one act and keeps another; their
    /// session still carries the bit, and what refuses them is the verified row, by the act's name.
    #[tokio::test]
    async fn a_member_narrowed_out_of_one_act_is_refused_on_their_open_session_by_name() {
        let credentials = Memory::new();
        let directory = scratch("narrowed");
        let (store, owner, link, workspace_id) = owned(&credentials, &directory).await;
        let (sami, theirs) = a_member(
            &store,
            &owner,
            &link,
            "sami.staff",
            permission::MANAGER,
            &workspace_id,
        )
        .await;

        set_override(
            &store,
            &owner,
            &sami.member_id,
            permission::mask_of(&[Flag::InviteMember]),
            NOW + 1,
        )
        .await
        .expect("the narrowing failed");

        assert!(
            permission::permits(theirs.permissions, Flag::InviteMember),
            "the session stopped carrying the act on its own, and there is nothing left to refuse"
        );

        let workspaces = full(std::slice::from_ref(&workspace_id));
        let refusal = make_account_and_link(
            &store,
            &theirs,
            no_platform(),
            &link,
            Invitation {
                username: "noor.new",
                role: permission::MEMBER,
                workspaces: &workspaces,
            },
            test_cost(),
            NOW + 2,
        )
        .await
        .expect_err("a member narrowed out of inviteMember invited somebody");

        assert_eq!(
            reason_of(&refusal),
            RefusalReason::RoleLacksAct,
            "{refusal}"
        );
        assert!(refusal.to_string().contains("inviteMember"), "{refusal}");
        assert!(
            permission::permits(
                crate::organization::session::permissions_on_row(&store, &theirs)
                    .await
                    .expect("their row"),
                Flag::RemoveMember
            ),
            "the act they kept is gone"
        );
    }

    /// **What a member issued is issued again when their standing moves** (the plan's
    /// *Architecture*). A manager gives a member a role, which issues the member's certificate from
    /// the manager's; the owner then narrows the manager, which revokes the manager's old
    /// certificate. The member's is issued again from the owner's, under its own id, so it stays
    /// live and the rows it signed go on verifying.
    #[tokio::test]
    async fn what_a_narrowed_member_issued_is_issued_again_and_stays_live() {
        let credentials = Memory::new();
        let directory = scratch("reparent");
        let (store, owner, link, workspace_id) = owned(&credentials, &directory).await;
        let (ada, ada_session) = a_member(
            &store,
            &owner,
            &link,
            "ada.admin",
            permission::MANAGER,
            &workspace_id,
        )
        .await;
        let (sami, sami_session) = a_member(
            &store,
            &owner,
            &link,
            "sami.staff",
            permission::MEMBER,
            &workspace_id,
        )
        .await;

        // ada gives sami the flag that grants, from her own certificate.
        set_override(
            &store,
            &ada_session,
            &sami.member_id,
            permission::mask_of(&[Flag::GrantWorkspace]),
            NOW + 1,
        )
        .await
        .expect("the manager could not widen sami");

        let issued = the_certificate(&store, &owner, &sami.member_id).await;
        let adas = the_certificate(&store, &owner, &ada.member_id).await;

        assert_eq!(
            issued.issuer_certificate_id.as_deref(),
            Some(adas.id.as_str())
        );

        let (noor, _) = a_member(
            &store,
            &owner,
            &link,
            "noor.new",
            permission::MEMBER,
            &workspace_id,
        )
        .await;

        grant_workspace(
            &store,
            &sami_session,
            no_platform(),
            &workspace_id,
            &noor.member_id,
            AccessLevel::FullAccess,
        )
        .await
        .expect("sami could not grant");

        // the owner narrows ada: her certificate is issued afresh and the old one revoked.
        set_override(
            &store,
            &owner,
            &ada.member_id,
            permission::mask_of(&[Flag::RenameMember]),
            NOW + 2,
        )
        .await
        .expect("the owner could not narrow the manager");

        assert_ne!(
            the_certificate(&store, &owner, &ada.member_id).await.id,
            adas.id
        );

        let again = the_certificate(&store, &owner, &sami.member_id).await;
        let root = signer_of(&store, &owner).await.expect("the root").1;

        assert_eq!(
            again.id, issued.id,
            "sami's certificate was not issued again"
        );
        assert_eq!(
            again.issuer_certificate_id.as_deref(),
            Some(root.id.as_str())
        );
        assert_eq!(again.ceiling, issued.ceiling);
        assert!(
            another_machine(&directory, &owner.organization_id)
                .await
                .grants(&owner.verifying_key)
                .await
                .expect("the grant sami signed no longer verifies")
                .iter()
                .any(|grant| grant.member_id == noor.member_id),
            "the grant sami signed is gone"
        );
    }

    /// **Criterion 3.** Deleting, renaming or moving each built-in role is refused, and so is
    /// editing the owner's mask, as the owner, with nothing written; the owner edits the manager's
    /// and the member's masks, and every holder's certificate carries the new one.
    #[tokio::test]
    async fn the_built_in_roles_are_kept_and_the_owner_edits_the_managers_and_the_members_masks() {
        let credentials = Memory::new();
        let directory = scratch("built-in");
        let (store, owner, link, workspace_id) = owned(&credentials, &directory).await;
        let custom = a_role(
            &store,
            &owner,
            "collector",
            permission::MEMBER_ROLE.mask,
            permission::MANAGER,
        )
        .await;
        let ada = holding_role(
            &store,
            &owner,
            &link,
            "ada.admin",
            permission::MANAGER,
            &workspace_id,
        )
        .await;
        let sami = holding_role(
            &store,
            &owner,
            &link,
            "sami.staff",
            permission::MEMBER,
            &workspace_id,
        )
        .await;
        let before = every_row(&store).await;

        for built_in in [permission::OWNER, permission::MANAGER, permission::MEMBER] {
            for (act, refusal) in [
                (
                    "deleted",
                    delete_role(&store, &owner, built_in, NOW + 1).await.err(),
                ),
                (
                    "renamed",
                    rename_role(&store, &owner, built_in, "boss", NOW + 1)
                        .await
                        .err(),
                ),
                (
                    "moved",
                    move_role(&store, &owner, built_in, &custom, NOW + 1)
                        .await
                        .err(),
                ),
            ] {
                let refusal =
                    refusal.unwrap_or_else(|| panic!("the owner {act} the {built_in} role"));

                assert_eq!(
                    reason_of(&refusal),
                    RefusalReason::RoleBuiltIn,
                    "{built_in} {act}: {refusal:?}"
                );
            }
        }

        let owners = set_role_mask(&store, &owner, permission::OWNER, 0, NOW + 1)
            .await
            .expect_err("the owner's mask was edited");

        assert_eq!(reason_of(&owners), RefusalReason::RoleBuiltIn, "{owners:?}");
        assert_eq!(every_row(&store).await, before, "a refusal wrote something");

        // the manager's and the member's, which the owner edits.
        let managers = permission::MANAGER_ROLE.mask & !permission::mask_of(&[Flag::ManageMark]);
        let members = permission::MEMBER_ROLE.mask | permission::mask_of(&[Flag::DeletePayment]);

        assert_eq!(
            set_role_mask(&store, &owner, permission::MANAGER, managers, NOW + 2)
                .await
                .expect("the owner could not edit the manager's mask")
                .mask,
            managers
        );
        assert_eq!(
            set_role_mask(&store, &owner, permission::MEMBER, members, NOW + 3)
                .await
                .expect("the owner could not edit the member's mask")
                .mask,
            members
        );

        // every holder's certificate follows, and every row still verifies elsewhere.
        assert_eq!(
            the_certificate(&store, &owner, &ada.member_id)
                .await
                .ceiling,
            managers
        );
        assert_eq!(
            the_certificate(&store, &owner, &sami.member_id)
                .await
                .ceiling,
            members
        );
        another_machine(&directory, &owner.organization_id)
            .await
            .members(&owner.verifying_key)
            .await
            .expect("every member row verifies on another machine");
    }

    /// **Criterion 4, the lifecycle.** A custom role is made, renamed, re-masked, re-ranked and
    /// deleted; it ranks strictly between member and manager every time, a renumbering included,
    /// and after the deletion every member who held it holds member exactly, their override
    /// cleared, and the row verifies on another machine. *They read the member role's mask
    /// exclusive-or'd with the override they kept until requirement 6 was amended on 2026-09-27.*
    #[tokio::test]
    async fn a_custom_role_lives_between_member_and_manager_and_its_holders_fall_to_member() {
        let credentials = Memory::new();
        let directory = scratch("lifecycle");
        let (store, owner, link, workspace_id) = owned(&credentials, &directory).await;
        let collector = a_role(
            &store,
            &owner,
            "collector",
            permission::MEMBER_ROLE.mask,
            permission::MANAGER,
        )
        .await;
        let supervisor = a_role(
            &store,
            &owner,
            "supervisor",
            permission::MEMBER_ROLE.mask,
            permission::MANAGER,
        )
        .await;

        assert_eq!(
            custom_ranks(&store, &owner)
                .await
                .into_iter()
                .map(|(id, _)| id)
                .collect::<Vec<_>>(),
            vec![supervisor.clone(), collector.clone()],
            "a role made after the manager is not the highest custom role"
        );

        let sami = holding_role(
            &store,
            &owner,
            &link,
            "sami.staff",
            &collector,
            &workspace_id,
        )
        .await;
        let turned = permission::mask_of(&[Flag::DeletePayment, Flag::EditUnit]);

        set_override(&store, &owner, &sami.member_id, turned, NOW + 1)
            .await
            .expect("the override failed");

        // renamed, and a name another role holds is refused.
        assert_eq!(
            rename_role(&store, &owner, &collector, "rent collector", NOW + 2)
                .await
                .expect("the rename failed")
                .name,
            "rent collector"
        );

        let taken = rename_role(&store, &owner, &supervisor, "Rent Collector", NOW + 2)
            .await
            .expect_err("two roles share a name");

        assert_eq!(reason_of(&taken), RefusalReason::RoleNameTaken, "{taken:?}");

        // re-masked: the holder's permissions and certificate follow.
        let wider = permission::MEMBER_ROLE.mask | permission::mask_of(&[Flag::DeleteTenant]);

        set_role_mask(&store, &owner, &collector, wider, NOW + 3)
            .await
            .expect("the re-mask failed");

        assert_eq!(
            the_certificate(&store, &owner, &sami.member_id)
                .await
                .ceiling,
            permission::effective(wider, turned)
        );

        // re-ranked above the supervisor, and back below it.
        let moved = move_role(&store, &owner, &collector, permission::MANAGER, NOW + 4)
            .await
            .expect("the move failed");

        assert_eq!(
            custom_ranks(&store, &owner)
                .await
                .into_iter()
                .map(|(id, _)| id)
                .collect::<Vec<_>>(),
            vec![collector.clone(), supervisor.clone()]
        );
        assert_eq!(
            the_certificate(&store, &owner, &sami.member_id).await.rank,
            moved.rank
        );

        // a renumbering: roles made one after another directly below the manager close the gap
        // above the highest, and the one made when it closes spreads the custom roles out again.
        let mut expected = vec![collector.clone(), supervisor.clone()];
        let mut renumbered = false;

        for index in 0..40 {
            let before = custom_ranks(&store, &owner).await;
            let made = a_role(
                &store,
                &owner,
                &format!("tier {index}"),
                permission::MEMBER_ROLE.mask,
                permission::MANAGER,
            )
            .await;

            expected.insert(0, made);

            let after = custom_ranks(&store, &owner).await;

            assert_eq!(
                after.iter().map(|(id, _)| id.clone()).collect::<Vec<_>>(),
                expected,
                "the order did not hold at the role made {index}th"
            );

            if before.iter().any(|(id, rank)| {
                after
                    .iter()
                    .any(|(other, moved)| other == id && moved != rank)
            }) {
                renumbered = true;

                // the holder of a renumbered role holds a certificate carrying its new rank.
                let collectors = after
                    .iter()
                    .find(|(id, _)| *id == collector)
                    .map(|(_, rank)| *rank)
                    .expect("the collector role");

                assert_eq!(
                    the_certificate(&store, &owner, &sami.member_id).await.rank,
                    collectors
                );

                break;
            }
        }

        assert!(renumbered, "forty roles in a row never closed the gap");
        store
            .members(&owner.verifying_key)
            .await
            .expect("every member row verifies after the renumbering");

        // deleted: sami, who carried an override, holds member exactly.
        assert_eq!(
            member_row(&store, &owner, &sami.member_id)
                .await
                .override_mask,
            turned,
            "sami carried no override into the deletion"
        );
        delete_role(&store, &owner, &collector, NOW + 5)
            .await
            .expect("the deletion failed");

        let row = member_row(&store, &owner, &sami.member_id).await;

        assert_eq!(row.role_id, permission::MEMBER);
        assert_eq!(row.override_mask, 0, "the override outlived the role");
        assert_eq!(row.effective, permission::MEMBER_ROLE.mask);
        assert_eq!(
            the_certificate(&store, &owner, &sami.member_id)
                .await
                .ceiling,
            permission::MEMBER_ROLE.mask
        );

        let elsewhere = another_machine(&directory, &owner.organization_id).await;
        let theirs = member_row(&elsewhere, &owner, &sami.member_id).await;

        assert_eq!(
            (theirs.role_id, theirs.override_mask, theirs.effective),
            (
                permission::MEMBER.to_string(),
                0,
                permission::MEMBER_ROLE.mask
            ),
            "another machine reads the member otherwise"
        );

        drop(elsewhere);
        assert_eq!(
            the_certificate(&store, &owner, &sami.member_id).await.rank,
            permission::MEMBER_ROLE.rank
        );
        assert!(
            !custom_ranks(&store, &owner)
                .await
                .iter()
                .any(|(id, _)| *id == collector)
        );
    }

    /// **Criteria 5 and 6.** Every member row names one role; assigning the owner's role is
    /// refused, whoever asks; each other role is assigned and the member reads its mask back, the
    /// override they carried cleared; and the owner's row refuses an override, from the owner and
    /// from a manager.
    ///
    /// *The member read each role's mask XOR their override until requirement 6 was amended on
    /// 2026-09-27, and the override switched viewing payments off, which that amendment refuses.*
    #[tokio::test]
    async fn the_owners_role_is_not_assigned_and_the_owners_row_carries_no_override() {
        let credentials = Memory::new();
        let directory = scratch("assign");
        let (store, owner, link, workspace_id) = owned(&credentials, &directory).await;
        let custom = a_role(
            &store,
            &owner,
            "collector",
            permission::MEMBER_ROLE.mask | permission::mask_of(&[Flag::DeleteContract]),
            permission::MANAGER,
        )
        .await;
        let ada = holding_role(
            &store,
            &owner,
            &link,
            "ada.admin",
            permission::MANAGER,
            &workspace_id,
        )
        .await;
        let (sami, _) = a_member(
            &store,
            &owner,
            &link,
            "sami.staff",
            permission::MEMBER,
            &workspace_id,
        )
        .await;
        let turned = permission::mask_of(&[Flag::DeletePayment]);

        set_override(&store, &owner, &sami.member_id, turned, NOW + 1)
            .await
            .expect("the override failed");

        for asking in [&owner, &ada] {
            let refused = assign_role(
                &store,
                asking,
                &sami.member_id,
                permission::OWNER,
                None,
                NOW + 2,
            )
            .await
            .expect_err("the owner's role was assigned");

            assert_eq!(
                reason_of(&refused),
                RefusalReason::OwnerRoleNotAssigned,
                "{refused:?}"
            );
        }

        let roles = store.roles(&owner.verifying_key).await.expect("the roles");

        for role in [permission::MANAGER, custom.as_str(), permission::MEMBER] {
            let mask = roles
                .iter()
                .find(|row| row.id == role)
                .expect("the role")
                .mask;
            let facts = assign_role(&store, &owner, &sami.member_id, role, None, NOW + 3)
                .await
                .unwrap_or_else(|error| panic!("{role} was not assigned: {error:?}"));

            assert_eq!(facts.permissions, mask, "{role}");
            assert_eq!(facts.override_mask, 0, "{role}");
            assert_eq!(
                member_row(&store, &owner, &sami.member_id).await.role_id,
                role
            );
        }

        // every member row names exactly one role this organization holds.
        let held: Vec<String> = roles.iter().map(|role| role.id.clone()).collect();

        for member in store.members(&owner.verifying_key).await.expect("the rows") {
            assert!(
                member.role_id == permission::OWNER || held.contains(&member.role_id),
                "{} names {}",
                member.id,
                member.role_id
            );
        }

        // the owner's row refuses an override, from the owner and from a manager.
        for asking in [&owner, &ada] {
            let refused = set_override(&store, asking, &owner.member_id, turned, NOW + 4)
                .await
                .expect_err("the owner's row took an override");

            assert_eq!(
                reason_of(&refused),
                RefusalReason::OwnerProtected,
                "{refused:?}"
            );
        }

        assert_eq!(
            member_row(&store, &owner, &owner.member_id)
                .await
                .override_mask,
            0
        );
    }

    /// The organization, its owner, and the ranks one test of criterion 7 is about, for an actor
    /// whose role carries the member's flags and `flag`:
    ///
    /// | role | rank | held by |
    /// | --- | --- | --- |
    /// | `high` | 500 000 | hana |
    /// | `spare_high` | 375 000 | nobody |
    /// | `mine` | 250 000 | the actor and eve |
    /// | `low` | 125 000 | lina |
    /// | `spare_low` | 62 500 | nobody |
    ///
    /// **The roles an act on roles touches are held by nobody**, so what is measured is the rank
    /// and nothing else: editing a held role issues its holders certificates, which a holder of
    /// `manageRoles` alone, administering nobody, cannot.
    struct Ranked {
        store: OrganizationStore,
        owner: MemberSession,
        actor: MemberSession,
        hana: String,
        eve: String,
        lina: String,
        spare_high: String,
        mine: String,
        low: String,
        spare_low: String,
    }

    async fn ranked(
        credentials: &dyn CredentialStore,
        directory: &std::path::Path,
        flag: Flag,
    ) -> Ranked {
        let (store, owner, link, workspace_id) = owned(credentials, directory).await;
        let members = permission::MEMBER_ROLE.mask;
        let high = a_role(&store, &owner, "high", members, permission::MANAGER).await;
        let mine = a_role(
            &store,
            &owner,
            "mine",
            members | permission::mask_of(&[flag]),
            &high,
        )
        .await;
        let spare_high = a_role(&store, &owner, "spare high", members, &high).await;
        let low = a_role(&store, &owner, "low", members, &mine).await;
        let spare_low = a_role(&store, &owner, "spare low", members, &low).await;
        let actor = holding_role(&store, &owner, &link, "the.actor", &mine, &workspace_id).await;
        let hana = holding_role(&store, &owner, &link, "hana", &high, &workspace_id).await;
        let eve = holding_role(&store, &owner, &link, "eve", &mine, &workspace_id).await;
        let lina = holding_role(&store, &owner, &link, "lina", &low, &workspace_id).await;

        Ranked {
            store,
            owner,
            actor,
            hana: hana.member_id,
            eve: eve.member_id,
            lina: lina.member_id,
            spare_high,
            mine,
            low,
            spare_low,
        }
    }

    /// **Criterion 7, the rank matrix.** For each management flag, a holder of it acts on what
    /// ranks above them, at their rank, below them, and on themselves: only strictly below
    /// succeeds. The refusals come first and write nothing; the successes follow.
    ///
    /// For an act on a role, *at their rank* and *themselves* are one case, their own role: no two
    /// roles share a rank. A holder of one management flag is refused the acts of the others.
    #[tokio::test]
    async fn only_strictly_below_succeeds_for_every_management_flag() {
        let credentials = Memory::new();
        let directory = scratch("matrix");
        let edit_payment = permission::mask_of(&[Flag::EditPayment]);
        let members = permission::MEMBER_ROLE.mask;

        // manageRoles: rename, re-mask, move, delete, and making a role in a place.
        {
            let r = ranked(&credentials, &directory.join("roles"), Flag::ManageRoles).await;
            let before = every_row(&r.store).await;

            for (place, role) in [("above", &r.spare_high), ("at", &r.mine)] {
                let refusals = [
                    rename_role(&r.store, &r.actor, role, "renamed", NOW)
                        .await
                        .err(),
                    set_role_mask(&r.store, &r.actor, role, members ^ edit_payment, NOW)
                        .await
                        .err(),
                    move_role(&r.store, &r.actor, role, &r.low, NOW).await.err(),
                    delete_role(&r.store, &r.actor, role, NOW).await.err(),
                ];

                for (index, refusal) in refusals.into_iter().enumerate() {
                    let refusal =
                        refusal.unwrap_or_else(|| panic!("act {index} on the role {place} went"));

                    assert_eq!(
                        reason_of(&refusal),
                        RefusalReason::RankNotAbove,
                        "act {index} on the role {place}: {refusal:?}"
                    );
                }
            }

            let above = create_role(&r.store, &r.actor, "new", members, &r.spare_high, NOW)
                .await
                .expect_err("a role was made above its maker");

            assert_eq!(reason_of(&above), RefusalReason::RankNotAbove, "{above:?}");

            // and the acts on members, which are other flags'.
            for refusal in [
                assign_role(&r.store, &r.actor, &r.lina, &r.spare_low, None, NOW)
                    .await
                    .expect_err("a holder of manageRoles assigned a role"),
                set_override(&r.store, &r.actor, &r.lina, edit_payment, NOW)
                    .await
                    .expect_err("a holder of manageRoles set an override"),
            ] {
                assert_eq!(
                    reason_of(&refusal),
                    RefusalReason::RoleLacksAct,
                    "{refusal:?}"
                );
            }

            assert_eq!(
                every_row(&r.store).await,
                before,
                "a refusal wrote something"
            );

            // below: every act goes.
            rename_role(&r.store, &r.actor, &r.spare_low, "renamed", NOW)
                .await
                .expect("the rename below");
            set_role_mask(
                &r.store,
                &r.actor,
                &r.spare_low,
                members ^ edit_payment,
                NOW,
            )
            .await
            .expect("the re-mask below");
            move_role(&r.store, &r.actor, &r.spare_low, &r.mine, NOW)
                .await
                .expect("the move below");
            create_role(&r.store, &r.actor, "made", members, &r.mine, NOW)
                .await
                .expect("a role made below its maker");
            delete_role(&r.store, &r.actor, &r.spare_low, NOW)
                .await
                .expect("the deletion below");
        }

        // assignRole and overrideMember: the member above, at the rank, below, and themselves.
        for flag in [Flag::AssignRole, Flag::OverrideMember] {
            let r = ranked(&credentials, &directory.join(flag.name()), flag).await;
            let act = |member: String| {
                let r = &r;

                async move {
                    if flag == Flag::AssignRole {
                        assign_role(&r.store, &r.actor, &member, &r.spare_low, None, NOW).await
                    } else {
                        set_override(&r.store, &r.actor, &member, edit_payment, NOW).await
                    }
                }
            };
            let before = every_row(&r.store).await;

            for (place, member, expected) in [
                ("above", r.hana.clone(), RefusalReason::RankNotAbove),
                ("at", r.eve.clone(), RefusalReason::RankNotAbove),
                (
                    "self",
                    r.actor.member_id.clone(),
                    RefusalReason::NotYourself,
                ),
            ] {
                let Err(refusal) = act(member).await else {
                    panic!("{} on the member {place} went", flag.name());
                };

                assert_eq!(
                    reason_of(&refusal),
                    expected,
                    "{} on the member {place}: {refusal:?}",
                    flag.name()
                );
            }

            if flag == Flag::AssignRole {
                // the role given is held to the rank as well as the member.
                for role in [&r.spare_high, &r.mine] {
                    let refusal = assign_role(&r.store, &r.actor, &r.lina, role, None, NOW)
                        .await
                        .expect_err("a role not below the actor was given");

                    assert_eq!(
                        reason_of(&refusal),
                        RefusalReason::RankNotAbove,
                        "{refusal:?}"
                    );
                }
            }

            let other = rename_role(&r.store, &r.actor, &r.spare_low, "renamed", NOW)
                .await
                .expect_err("a holder of a member flag renamed a role");

            assert_eq!(reason_of(&other), RefusalReason::RoleLacksAct, "{other:?}");
            assert_eq!(
                every_row(&r.store).await,
                before,
                "a refusal wrote something"
            );

            // below: it goes, and the member's certificate is issued from the actor's.
            act(r.lina.clone())
                .await
                .unwrap_or_else(|error| panic!("{} below: {error:?}", flag.name()));

            let issued = the_certificate(&r.store, &r.owner, &r.lina).await;
            let actors = the_certificate(&r.store, &r.owner, &r.actor.member_id).await;

            assert_eq!(
                issued.issuer_certificate_id.as_deref(),
                Some(actors.id.as_str())
            );
        }
    }

    /// **Criterion 7, flags held.** A holder of every management flag who lacks `deletePayment`
    /// tries to switch it, in a role's mask and in an override, on and off: every way is refused by
    /// the flag's name and nothing is written. A flag they hold, switched the same ways, goes.
    #[tokio::test]
    async fn a_flag_the_actor_lacks_is_switched_neither_on_nor_off_in_a_role_or_an_override() {
        let credentials = Memory::new();
        let directory = scratch("flags-held");
        let (store, owner, link, workspace_id) = owned(&credentials, &directory).await;
        let deleting = permission::mask_of(&[Flag::DeletePayment]);
        let members = permission::MEMBER_ROLE.mask;
        let deputy = a_role(
            &store,
            &owner,
            "deputy",
            permission::MANAGER_ROLE.mask & !deleting,
            permission::MANAGER,
        )
        .await;
        let clerk = a_role(&store, &owner, "clerk", members, &deputy).await;
        let auditor = a_role(&store, &owner, "auditor", members | deleting, &clerk).await;
        let actor = holding_role(&store, &owner, &link, "the.deputy", &deputy, &workspace_id).await;
        let lina = holding_role(&store, &owner, &link, "lina", &clerk, &workspace_id).await;
        let noor = holding_role(&store, &owner, &link, "noor", &auditor, &workspace_id).await;
        let before = every_row(&store).await;

        let refusals = [
            // on, in a role's mask, made and edited.
            create_role(&store, &actor, "deleter", members | deleting, &clerk, NOW)
                .await
                .err(),
            set_role_mask(&store, &actor, &clerk, members | deleting, NOW)
                .await
                .err(),
            // off, in a role's mask.
            set_role_mask(&store, &actor, &auditor, members, NOW)
                .await
                .err(),
            // on, in an override, and by moving a member onto a role that carries it.
            set_override(&store, &actor, &lina.member_id, deleting, NOW)
                .await
                .err(),
            assign_role(&store, &actor, &lina.member_id, &auditor, None, NOW)
                .await
                .err(),
            // off, in an override.
            set_override(&store, &actor, &noor.member_id, deleting, NOW)
                .await
                .err(),
        ];

        for (index, refusal) in refusals.into_iter().enumerate() {
            let refusal = refusal.unwrap_or_else(|| panic!("switch {index} went"));

            assert_eq!(reason_of(&refusal), RefusalReason::RoleLacksAct, "{index}");
            assert!(
                refusal.to_string().contains("deletePayment"),
                "{index}: {refusal}"
            );
        }

        assert_eq!(every_row(&store).await, before, "a refusal wrote something");

        // a flag they hold goes every way.
        let editing = permission::mask_of(&[Flag::EditPayment]);

        set_role_mask(&store, &actor, &clerk, members ^ editing, NOW)
            .await
            .expect("a held flag off, in a role");
        set_role_mask(&store, &actor, &clerk, members, NOW)
            .await
            .expect("a held flag on, in a role");
        set_override(&store, &actor, &lina.member_id, editing, NOW)
            .await
            .expect("a held flag off, in an override");
        set_override(&store, &actor, &lina.member_id, 0, NOW)
            .await
            .expect("a held flag on again, in an override");
    }

    /// **Criterion 7, flags held over a role and an override given together** (converge, round 1,
    /// ticket 14). The auditor's mask differs from the clerk's in `editPayment`, which the deputy
    /// holds, and in `deletePayment`, which they do not; an override of `deletePayment` switches
    /// that back. So moving a clerk onto the auditor with that override moves only `editPayment`.
    ///
    /// Asked as two acts, either order passes through a state that switches `deletePayment`, and
    /// each is refused. Asked as one, it is refused too, and by the override: the row it writes
    /// switches `deletePayment`, which the deputy's certificate does not carry, and the chain
    /// refuses such a row on read (review round two bounded a member row by its override). The
    /// owner, who holds it, gives the role and the override as one act. A role and an override that
    /// together do switch `deletePayment` are refused whole, and the row and the certificate stay
    /// as they were. An override that changes is asked of `overrideMember` as well as
    /// `assignRole`, and one given as it stands is not. *Until review round two the deputy's one
    /// act went, as ticket 14 asked.*
    #[tokio::test]
    async fn a_role_and_an_override_given_together_are_held_to_the_flags_they_move_together() {
        let credentials = Memory::new();
        let directory = scratch("one-act");
        let (store, owner, link, workspace_id) = owned(&credentials, &directory).await;
        let deleting = permission::mask_of(&[Flag::DeletePayment]);
        let editing = permission::mask_of(&[Flag::EditPayment]);
        let members = permission::MEMBER_ROLE.mask;
        let deputy = a_role(
            &store,
            &owner,
            "deputy",
            permission::MANAGER_ROLE.mask & !deleting,
            permission::MANAGER,
        )
        .await;
        let clerk = a_role(&store, &owner, "clerk", members, &deputy).await;
        let auditor = a_role(
            &store,
            &owner,
            "auditor",
            (members ^ editing) | deleting,
            &clerk,
        )
        .await;
        let reviewer = a_role(&store, &owner, "reviewer", members ^ editing, &auditor).await;
        let actor = holding_role(&store, &owner, &link, "the.deputy", &deputy, &workspace_id).await;
        let lina = holding_role(&store, &owner, &link, "lina", &clerk, &workspace_id).await;
        let noor = holding_role(&store, &owner, &link, "noor", &clerk, &workspace_id).await;
        let before = every_row(&store).await;

        // two steps: the role alone switches deletePayment on, and so does the override alone.
        for refusal in [
            assign_role(&store, &actor, &lina.member_id, &auditor, None, NOW)
                .await
                .expect_err("the role alone went"),
            set_override(&store, &actor, &lina.member_id, deleting, NOW)
                .await
                .expect_err("the override alone went"),
        ] {
            assert_eq!(
                reason_of(&refusal),
                RefusalReason::RoleLacksAct,
                "{refusal:?}"
            );
            assert!(refusal.to_string().contains("deletePayment"), "{refusal}");
        }

        assert_eq!(every_row(&store).await, before, "a refusal wrote something");

        // one act: only editPayment moves, and the deputy still cannot sign the override.
        let refusal = assign_role(
            &store,
            &actor,
            &lina.member_id,
            &auditor,
            Some(deleting),
            NOW + 1,
        )
        .await
        .expect_err("the deputy signed an override switching a flag they lack");

        assert_eq!(
            reason_of(&refusal),
            RefusalReason::RoleLacksAct,
            "{refusal:?}"
        );
        assert!(
            refusal
                .to_string()
                .contains("has deletePayment switched for them"),
            "{refusal}"
        );
        assert_eq!(every_row(&store).await, before, "a refusal wrote something");

        // the owner gives the role and the override as one act.
        let given = assign_role(
            &store,
            &owner,
            &lina.member_id,
            &auditor,
            Some(deleting),
            NOW + 1,
        )
        .await
        .expect("the role and the override together");

        assert_eq!(given.permissions, members ^ editing);

        let row = member_row(&store, &owner, &lina.member_id).await;

        assert_eq!(row.role_id, auditor);
        assert_eq!(row.override_mask, deleting);
        assert_eq!(row.effective, members ^ editing);
        assert_eq!(
            the_certificate(&store, &owner, &lina.member_id)
                .await
                .ceiling,
            members ^ editing
        );

        // a combination that does switch deletePayment on is refused whole.
        let row_before = member_row(&store, &owner, &noor.member_id).await;
        let certificate_before = the_certificate(&store, &owner, &noor.member_id).await;
        let before = every_row(&store).await;
        let refusal = assign_role(&store, &actor, &noor.member_id, &auditor, Some(0), NOW + 2)
            .await
            .expect_err("a role and an override moving deletePayment went");

        assert_eq!(
            reason_of(&refusal),
            RefusalReason::RoleLacksAct,
            "{refusal:?}"
        );
        assert!(refusal.to_string().contains("deletePayment"), "{refusal}");
        assert_eq!(
            member_row(&store, &owner, &noor.member_id).await,
            row_before
        );
        assert_eq!(
            the_certificate(&store, &owner, &noor.member_id).await.id,
            certificate_before.id
        );
        assert_eq!(
            every_row(&store).await,
            before,
            "the refusal wrote something"
        );

        // without overrideMember: an override that changes is refused by that flag's name, and one
        // given as it stands is only an assignment.
        set_role_mask(
            &store,
            &owner,
            &deputy,
            permission::MANAGER_ROLE.mask
                & !deleting
                & !permission::mask_of(&[Flag::OverrideMember]),
            NOW + 3,
        )
        .await
        .expect("the owner narrowed the deputy");

        let before = every_row(&store).await;
        let refusal = assign_role(
            &store,
            &actor,
            &noor.member_id,
            &auditor,
            Some(deleting),
            NOW + 4,
        )
        .await
        .expect_err("an override was changed without overrideMember");

        assert_eq!(
            reason_of(&refusal),
            RefusalReason::RoleLacksAct,
            "{refusal:?}"
        );
        assert!(refusal.to_string().contains("overrideMember"), "{refusal}");
        assert_eq!(
            every_row(&store).await,
            before,
            "the refusal wrote something"
        );

        assign_role(&store, &actor, &noor.member_id, &reviewer, Some(0), NOW + 5)
            .await
            .expect("an override given as it stands is not asked of overrideMember");

        assert_eq!(
            member_row(&store, &owner, &noor.member_id).await.role_id,
            reviewer
        );
    }

    /// **Requirement 2 at these acts.** None of the owner's flags goes into the manager's mask, a
    /// custom role's mask or an override, from the owner or from a manager.
    #[tokio::test]
    async fn the_owners_flags_are_refused_in_every_mask_and_every_override() {
        let credentials = Memory::new();
        let directory = scratch("owner-only");
        let (store, owner, link, workspace_id) = owned(&credentials, &directory).await;
        let custom = a_role(
            &store,
            &owner,
            "collector",
            permission::MEMBER_ROLE.mask,
            permission::MANAGER,
        )
        .await;
        let ada = holding_role(
            &store,
            &owner,
            &link,
            "ada.admin",
            permission::MANAGER,
            &workspace_id,
        )
        .await;
        let sami = holding_role(&store, &owner, &link, "sami", &custom, &workspace_id).await;
        let before = every_row(&store).await;

        for flag in permission::OWNER_ONLY {
            let bit = permission::mask_of(&[flag]);

            for (what, refusal) in [
                (
                    "the manager's mask, by the owner",
                    set_role_mask(
                        &store,
                        &owner,
                        permission::MANAGER,
                        permission::MANAGER_ROLE.mask | bit,
                        NOW,
                    )
                    .await
                    .err(),
                ),
                (
                    "a custom mask, by the owner",
                    set_role_mask(
                        &store,
                        &owner,
                        &custom,
                        permission::MEMBER_ROLE.mask | bit,
                        NOW,
                    )
                    .await
                    .err(),
                ),
                (
                    "a custom mask, by a manager",
                    set_role_mask(
                        &store,
                        &ada,
                        &custom,
                        permission::MEMBER_ROLE.mask | bit,
                        NOW,
                    )
                    .await
                    .err(),
                ),
                (
                    "an override, by the owner",
                    set_override(&store, &owner, &sami.member_id, bit, NOW)
                        .await
                        .err(),
                ),
                (
                    "an override, by a manager",
                    set_override(&store, &ada, &sami.member_id, bit, NOW)
                        .await
                        .err(),
                ),
            ] {
                let refusal = refusal.unwrap_or_else(|| panic!("{} went into {what}", flag.name()));

                assert!(
                    matches!(
                        reason_of(&refusal),
                        RefusalReason::OwnerOnly | RefusalReason::RoleLacksAct
                    ),
                    "{} into {what}: {refusal:?}",
                    flag.name()
                );
                assert!(
                    refusal.to_string().contains(flag.name()),
                    "{} into {what}: {refusal}",
                    flag.name()
                );
            }
        }

        assert_eq!(every_row(&store).await, before, "a refusal wrote something");
    }

    /// **Criterion 9, three stores on one database.** The owner makes a role holding
    /// `inviteMember` and is gone: no act after that derives the organization key, and no store
    /// can, since only the owner's vault derives it. The role carries `grantWorkspace` beside it,
    /// because making an account writes the account's grant on the organization database, which
    /// only a holder of `grantWorkspace` signs (`invite::write_account`). A manager on a second store gives the role to
    /// a member who signed nothing before; the member, on a third, makes an account and its link,
    /// which writes an invitation row under the certificate the manager issued; and the row
    /// verifies on the other two against the key each pinned. Editing the role's mask then issues
    /// every holder's certificate again, and the row still verifies.
    #[tokio::test]
    async fn a_manager_gives_a_signing_flag_without_the_owner_and_it_verifies_on_a_third_store() {
        let credentials = Memory::new();
        let directory = scratch("three-stores");
        let (owners, owner, link, workspace_id) = owned(&credentials, &directory).await;
        let recruiting = permission::MEMBER_ROLE.mask
            | permission::mask_of(&[Flag::InviteMember, Flag::GrantWorkspace]);
        let recruiter = a_role(
            &owners,
            &owner,
            "recruiter",
            recruiting,
            permission::MANAGER,
        )
        .await;
        let ada = holding_role(
            &owners,
            &owner,
            &link,
            "ada.admin",
            permission::MANAGER,
            &workspace_id,
        )
        .await;
        let (sami, sami_session) = a_member(
            &owners,
            &owner,
            &link,
            "sami.staff",
            permission::MEMBER,
            &workspace_id,
        )
        .await;
        let (bilal, _) = a_member(
            &owners,
            &owner,
            &link,
            "bilal.staff",
            permission::MEMBER,
            &workspace_id,
        )
        .await;
        let path =
            OrganizationStore::replica_path(&directory.join("app.db"), &owner.organization_id);
        let open = || async {
            OrganizationStore::open(crate::clock::System::shared(), &path, None, || async {
                Err(turso::Error::Misuse("no remote".into()))
            })
            .await
            .expect("a store over the database did not open")
        };
        let managers = open().await;
        let members = open().await;
        let pinned = owner.verifying_key;

        // the owner's machine is off: neither the manager nor the member derives the key.
        assert!(organization_key_of(&ada).is_err());
        assert!(organization_key_of(&sami_session).is_err());

        let roots_before = owners
            .certificates()
            .await
            .expect("the certificates")
            .iter()
            .filter(|certificate| certificate.is_root())
            .count();

        // the manager, on their store, gives sami the role.
        assign_role(&managers, &ada, &sami.member_id, &recruiter, None, NOW + 1)
            .await
            .expect("the manager could not give the role");

        let issued = the_certificate(&members, &owner, &sami.member_id).await;
        let adas = the_certificate(&members, &owner, &ada.member_id).await;

        assert_eq!(
            issued.issuer_certificate_id.as_deref(),
            Some(adas.id.as_str())
        );
        assert!(permission::permits(issued.ceiling, Flag::InviteMember));

        // sami, on theirs, makes an account and its link: an invitation row signed by sami.
        let workspaces = full(std::slice::from_ref(&workspace_id));
        let made = make_account_and_link(
            &members,
            &sami_session,
            no_platform(),
            &link,
            Invitation {
                username: "noor.new",
                role: permission::MEMBER,
                workspaces: &workspaces,
            },
            test_cost(),
            NOW + 2,
        )
        .await
        .expect("the member could not invite");
        async fn invited(
            store: &OrganizationStore,
            pinned: &[u8; VERIFYING_KEY_BYTES],
            member_id: &str,
        ) -> bool {
            store
                .invitations(pinned)
                .await
                .expect("the invitations do not verify")
                .into_iter()
                .any(|invitation| invitation.member_id == member_id)
        }

        assert!(
            invited(&owners, &pinned, &made.member_id).await,
            "the invitation does not verify on the owner's store"
        );
        assert!(
            invited(&managers, &pinned, &made.member_id).await,
            "the invitation does not verify on the manager's store"
        );

        // editing the role's mask issues every holder's certificate again.
        assign_role(&managers, &ada, &bilal.member_id, &recruiter, None, NOW + 3)
            .await
            .expect("the manager could not give the role a second time");

        let holders_before = [
            the_certificate(&owners, &owner, &sami.member_id).await,
            the_certificate(&owners, &owner, &bilal.member_id).await,
        ];
        let narrower = recruiting & !permission::mask_of(&[Flag::EditTenant]);

        set_role_mask(&managers, &ada, &recruiter, narrower, NOW + 4)
            .await
            .expect("the manager could not edit the role");

        for (before, member_id) in holders_before
            .iter()
            .zip([&sami.member_id, &bilal.member_id])
        {
            let after = the_certificate(&owners, &owner, member_id).await;

            assert_ne!(
                after.id, before.id,
                "{member_id}'s certificate was not issued again"
            );
            assert_eq!(after.ceiling, narrower);
        }

        assert!(
            invited(&owners, &pinned, &made.member_id).await,
            "the invitation stopped verifying"
        );
        owners
            .members(&pinned)
            .await
            .expect("every member row verifies on the owner's store");
        assert_eq!(
            owners
                .certificates()
                .await
                .expect("the certificates")
                .iter()
                .filter(|certificate| certificate.is_root())
                .count(),
            roots_before,
            "a root was issued with the owner away"
        );
    }

    // -------------------------------------------------------------------------------------
    // The review of effort 838, round one: a signed row never reaches wider than the
    // certificate that signs it.
    // -------------------------------------------------------------------------------------

    /// **A member widening their own row** (criterion 9). A clerk, who renames members and so
    /// holds a certificate, writes their own row back to the member role with an override handing
    /// them `manageRoles`, `assignRole`, `grantWorkspace` and `deleteContract`. The store refuses
    /// it by name and writes nothing; written around the store, as somebody holding the credential
    /// can, every other machine refuses it on read. **And no later act reads the width back off
    /// it**: the owner's unrelated edit of the member role's mask, which issues every holder a
    /// fresh certificate from their row, is refused on the forged row, and the clerk's certificate
    /// carries none of the four. *Before the correction the row verified everywhere and the edit
    /// issued the clerk a certificate carrying all four.*
    #[tokio::test]
    async fn a_member_widening_their_own_row_is_refused_and_no_role_edit_reissues_the_width() {
        let credentials = Memory::new();
        let directory = scratch("own-row");
        let (store, owner, link, workspace_id) = owned(&credentials, &directory).await;
        let clerk = a_role(
            &store,
            &owner,
            "Clerk",
            permission::MEMBER_ROLE.mask | permission::mask_of(&[Flag::RenameMember]),
            permission::MANAGER,
        )
        .await;
        let rita = holding_role(&store, &owner, &link, "rita", &clerk, &workspace_id).await;
        let rita_row = member_row(&store, &owner, &rita.member_id).await;
        let (key, certificate) = signer_of(&store, &rita).await.expect("rita signs");
        let signer = Signer {
            key: &key,
            certificate: &certificate,
        };
        let widened = permission::mask_of(&[
            Flag::ManageRoles,
            Flag::AssignRole,
            Flag::GrantWorkspace,
            Flag::DeleteContract,
        ]);
        let forged = MemberRecord {
            role_id: permission::MEMBER.to_string(),
            override_mask: widened,
            ..rita_row.clone()
        };

        assert_eq!(certificate.ceiling & widened, 0);

        // through the store: refused by name, and nothing moved.
        let rows_before = every_row(&store).await;
        let refused = store
            .write_member(&signer, &forged)
            .await
            .expect_err("the store wrote a row wider than its signer");

        assert_eq!(reason_of(&refused), RefusalReason::RoleLacksAct);
        assert!(
            refused
                .to_string()
                .contains("every flag their override switches"),
            "{refused}"
        );
        assert_eq!(every_row(&store).await, rows_before);

        // around the store: every other machine refuses the directory, naming the row.
        store
            .write_member_around_the_check(&signer, &forged)
            .await
            .expect("written around the store");

        let elsewhere = another_machine(&directory, &owner.organization_id).await;
        let read = elsewhere.members(&owner.verifying_key).await;

        assert!(
            matches!(&read, Err(Error::Integrity { message })
                if message.contains(&rita.member_id)
                    && message.contains("the row is not one its certificate may sign")),
            "{read:?}"
        );

        // and the owner's later, unrelated edit of the member role does not carry the width into
        // a certificate: it reads the forged row, and is refused on it.
        let edited = set_role_mask(
            &store,
            &owner,
            permission::MEMBER,
            permission::MEMBER_ROLE.mask | permission::mask_of(&[Flag::DeletePayment]),
            NOW + 1,
        )
        .await;

        assert!(
            matches!(&edited, Err(Error::Integrity { .. })),
            "{edited:?}"
        );

        let live = store
            .live_certificates(&owner.verifying_key, &rita.member_id)
            .await
            .expect("the certificates");

        assert_eq!(live.len(), 1);
        assert_eq!(live[0].id, certificate.id);
        assert_eq!(live[0].ceiling & widened, 0, "the width was re-issued");
    }

    /// **A role row wider than its signer** (criterion 9). A supervisor, ranked below the manager
    /// and holding every manager's flag but `grantWorkspace`, writes a clerk role's row carrying
    /// `grantWorkspace` and `createWorkspace`, the second an owner's flag. The store refuses it by
    /// name and writes nothing; written around the store, every other machine refuses it on read,
    /// so no holder of the role reads either flag.
    #[tokio::test]
    async fn a_role_row_wider_than_its_signer_is_refused_by_the_store_and_on_every_other_machine() {
        let credentials = Memory::new();
        let directory = scratch("role-row");
        let (store, owner, link, workspace_id) = owned(&credentials, &directory).await;
        let without_grant =
            permission::MANAGER_ROLE.mask & !permission::mask_of(&[Flag::GrantWorkspace]);
        let supervisor = a_role(
            &store,
            &owner,
            "Supervisor",
            without_grant,
            permission::MANAGER,
        )
        .await;
        let clerk = a_role(
            &store,
            &owner,
            "Clerk",
            permission::MEMBER_ROLE.mask,
            &supervisor,
        )
        .await;
        let sue = holding_role(&store, &owner, &link, "sue", &supervisor, &workspace_id).await;
        let (key, certificate) = signer_of(&store, &sue).await.expect("sue signs");
        let signer = Signer {
            key: &key,
            certificate: &certificate,
        };
        let row = store
            .roles(&owner.verifying_key)
            .await
            .expect("the roles verify")
            .into_iter()
            .find(|role| role.id == clerk)
            .expect("the clerk role");
        let widened = crate::organization::store::RoleRecord {
            mask: row.mask | permission::mask_of(&[Flag::GrantWorkspace, Flag::CreateWorkspace]),
            ..row
        };

        assert!(!permission::permits(
            certificate.ceiling,
            Flag::GrantWorkspace
        ));

        // through the store: refused by name, and nothing moved.
        let rows_before = every_row(&store).await;
        let refused = store
            .write_role(&signer, &widened)
            .await
            .expect_err("the store wrote a role wider than its signer");

        assert_eq!(reason_of(&refused), RefusalReason::RoleLacksAct);
        assert!(
            refused.to_string().contains("every flag the role carries"),
            "{refused}"
        );
        assert_eq!(every_row(&store).await, rows_before);

        // around the store: every other machine refuses it.
        store
            .write_role_around_the_check(&signer, &widened)
            .await
            .expect("written around the store");

        let read = another_machine(&directory, &owner.organization_id)
            .await
            .roles(&owner.verifying_key)
            .await;

        assert!(
            matches!(&read, Err(Error::Integrity { message })
                if message.contains(&clerk)
                    && message.contains("the row is not one its certificate may sign")),
            "{read:?}"
        );
    }

    /// **What the corrected table refuses, each act refuses first** (the ticket's constraint). The
    /// owner widens the member role with `deleteContract` and takes it off the manager's mask, so a
    /// manager's certificate no longer signs the member role's row, nor issues a member-role
    /// holder's certificate. Every act of the manager's that would write one is refused by name,
    /// naming the flag, before anything is written, and the directory still reads: an override, an
    /// edit of the role and a reset. A rename, which writes the holder's row alone, is not: the
    /// row is bounded by its override, and the role's mask is its role row's to vouch for (review
    /// round two). *A rename and a removal were refused here too until then.*
    #[tokio::test]
    async fn an_act_whose_rows_the_actor_could_not_sign_is_refused_by_name_before_it_writes() {
        let credentials = Memory::new();
        let directory = scratch("uncovered-acts");
        let (store, owner, link, workspace_id) = owned(&credentials, &directory).await;
        let manny = holding_role(
            &store,
            &owner,
            &link,
            "manny",
            permission::MANAGER,
            &workspace_id,
        )
        .await;
        let (sami, _) = a_member(
            &store,
            &owner,
            &link,
            "sami.staff",
            permission::MEMBER,
            &workspace_id,
        )
        .await;
        let delete_contract = permission::mask_of(&[Flag::DeleteContract]);
        // a flag manny holds, switched on: switching viewing complexes off instead left the member
        // adding and editing complexes they cannot view, which requirement 6 as amended on
        // 2026-09-27 refuses before this test's refusal is reached.
        let delete_complex = permission::mask_of(&[Flag::DeleteComplex]);

        set_role_mask(
            &store,
            &owner,
            permission::MEMBER,
            permission::MEMBER_ROLE.mask | delete_contract,
            NOW + 1,
        )
        .await
        .expect("the owner widens the member role");
        set_role_mask(
            &store,
            &owner,
            permission::MANAGER,
            permission::MANAGER_ROLE.mask & !delete_contract,
            NOW + 2,
        )
        .await
        .expect("the owner narrows the manager role");

        let rows_before = every_row(&store).await;
        let names_the_flag = |outcome: Result<(), Error>, act: &str| {
            let refused = outcome.expect_err(act);

            assert_eq!(reason_of(&refused), RefusalReason::RoleLacksAct, "{act}");
            assert!(
                refused.to_string().contains("deleteContract"),
                "{act}: {refused}"
            );
        };

        names_the_flag(
            set_override(&store, &manny, &sami.member_id, delete_complex, NOW + 3)
                .await
                .map(|_| ()),
            "an override leaving sami a flag manny lacks",
        );
        names_the_flag(
            set_role_mask(
                &store,
                &manny,
                permission::MEMBER,
                (permission::MEMBER_ROLE.mask ^ delete_complex) | delete_contract,
                NOW + 3,
            )
            .await
            .map(|_| ()),
            "an edit of a role carrying a flag manny lacks",
        );
        names_the_flag(
            crate::organization::invitation::unset_password(
                &store,
                &manny,
                no_platform(),
                &sami.member_id,
                test_cost(),
                NOW + 3,
            )
            .await
            .map(|_| ()),
            "a reset of a member holding a flag manny lacks",
        );

        assert_eq!(every_row(&store).await, rows_before);

        // and what writes sami's row alone, switching nothing and issuing nothing, is manny's to
        // write: a rename, since the member role's mask is its role row's to vouch for.
        crate::organization::invitation::rename_member(
            &store,
            &manny,
            &sami.member_id,
            "sami.renamed",
            NOW + 4,
        )
        .await
        .expect("a rename of a member whose role carries a flag manny lacks");
        assert_eq!(
            member_row(&store, &owner, &sami.member_id).await.effective,
            permission::MEMBER_ROLE.mask | delete_contract
        );
        store
            .members(&owner.verifying_key)
            .await
            .expect("the directory still reads");
        store
            .roles(&owner.verifying_key)
            .await
            .expect("the roles still read");
    }

    // -------------------------------------------------------------------------------------
    // Effort 838, review round two: two machines acting together never brick the directory.
    // -------------------------------------------------------------------------------------

    /// A role's row as the owner's replica wrote it, merged into this one: signed by the owner's
    /// root with the mask and the rank given, and nothing else of the owner's act, which is what
    /// the other replica holds of it before either has pulled the other's.
    async fn merged_role_row(
        store: &OrganizationStore,
        owner: &MemberSession,
        role_id: &str,
        mask: i64,
        rank: i64,
    ) {
        let row = store
            .roles(&owner.verifying_key)
            .await
            .expect("the roles verify")
            .into_iter()
            .find(|role| role.id == role_id)
            .expect("the role");
        let (key, certificate) = signer_of(store, owner).await.expect("the owner signs");

        store
            .write_role(
                &Signer {
                    key: &key,
                    certificate: &certificate,
                },
                &crate::organization::store::RoleRecord { mask, rank, ..row },
            )
            .await
            .expect("the owner's role row");
    }

    /// **The review's race** (finding B). A lead, holding the member role's flags with
    /// `inviteMember` and `grantWorkspace`, invites sami on one machine while the owner adds
    /// `deletePayment` to the member role on another. Merged, sami's row names the widened role,
    /// wider than the lead's ceiling, and the directory reads on every machine with sami holding
    /// the widened role's permissions: the role's mask is vouched for by the role row's signer,
    /// and the lead signed only sami's role and override. *Before the correction every member read
    /// refused sami's row, and nothing in the application could repair it.*
    #[tokio::test]
    async fn a_lead_inviting_while_the_owner_widens_the_member_role_leaves_the_directory_readable()
    {
        let credentials = Memory::new();
        let directory = scratch("race-widen");
        let (store, owner, link, workspace_id) = owned(&credentials, &directory).await;
        let lead = a_role(
            &store,
            &owner,
            "Lead",
            permission::MEMBER_ROLE.mask
                | permission::mask_of(&[Flag::InviteMember, Flag::GrantWorkspace]),
            permission::MANAGER,
        )
        .await;
        let lena = holding_role(&store, &owner, &link, "lena", &lead, &workspace_id).await;
        let (sami, _) = a_member(
            &store,
            &lena,
            &link,
            "sami",
            permission::MEMBER,
            &workspace_id,
        )
        .await;
        let widened = permission::MEMBER_ROLE.mask | permission::mask_of(&[Flag::DeletePayment]);

        merged_role_row(
            &store,
            &owner,
            permission::MEMBER,
            widened,
            permission::MEMBER_ROLE.rank,
        )
        .await;

        assert!(!permission::permits(
            the_certificate(&store, &owner, &lena.member_id)
                .await
                .ceiling,
            Flag::DeletePayment
        ));

        for machine in [
            &store,
            &another_machine(&directory, &owner.organization_id).await,
        ] {
            let members = machine
                .members(&owner.verifying_key)
                .await
                .expect("the directory reads after the merge");
            let row = members
                .iter()
                .find(|member| member.id == sami.member_id)
                .expect("sami's row");

            assert_eq!(row.effective, widened);
        }
    }

    /// **A row its certificate stopped covering grants nothing, and the directory still reads.**
    /// A lead invites sami into a clerk role below them on one machine while the owner moves the
    /// clerk role above the lead on another. Merged, sami's row is genuine, signed by a live
    /// certificate that no longer outranks the role it names: it reads on every machine with no
    /// permissions and its removal as it was, and the lead's own acts on sami are refused. Sami's
    /// certificate stands as the lead issued it, re-issued from nothing. The row is never saved:
    /// the owner's assignment of the clerk role is refused by name, and the owner removes sami,
    /// which every machine then reads.
    #[tokio::test]
    async fn a_member_row_a_rank_move_left_uncovered_grants_nothing_and_is_removed_rather_than_saved()
     {
        let credentials = Memory::new();
        let directory = scratch("race-rank");
        let (store, mut owner, link, workspace_id) = owned(&credentials, &directory).await;
        let lead = a_role(
            &store,
            &owner,
            "Lead",
            permission::MEMBER_ROLE.mask
                | permission::mask_of(&[
                    Flag::InviteMember,
                    Flag::GrantWorkspace,
                    Flag::RenameMember,
                ]),
            permission::MANAGER,
        )
        .await;
        let clerk = a_role(&store, &owner, "Clerk", permission::MEMBER_ROLE.mask, &lead).await;
        let lena = holding_role(&store, &owner, &link, "lena", &lead, &workspace_id).await;
        let (sami, sami_session) =
            a_member(&store, &lena, &link, "sami", &clerk, &workspace_id).await;
        // the lead holds neither flag that unlocks, so the owner does (effort 851).
        crate::organization::member::lock::unlocked_for_a_test(&store, &owner, &sami.member_id)
            .await
            .expect("the owner unlocks sami");
        let issued = the_certificate(&store, &owner, &sami.member_id).await;
        let lead_rank = the_certificate(&store, &owner, &lena.member_id).await.rank;

        merged_role_row(
            &store,
            &owner,
            &clerk,
            permission::MEMBER_ROLE.mask,
            (lead_rank + permission::MANAGER_ROLE.rank) / 2,
        )
        .await;

        for machine in [
            &store,
            &another_machine(&directory, &owner.organization_id).await,
        ] {
            let row = machine
                .members(&owner.verifying_key)
                .await
                .expect("the directory reads after the merge")
                .into_iter()
                .find(|member| member.id == sami.member_id)
                .expect("sami's row");

            assert_eq!(row.effective, 0, "an uncovered row grants something");
            assert_eq!(row.role_id, clerk);
            assert_eq!(row.removed_at, None);
        }

        // sami acts with nothing, and the lead no longer acts on sami.
        assert_eq!(
            crate::organization::session::permissions_on_row(&store, &sami_session)
                .await
                .expect("sami's own row reads"),
            0
        );

        let rows_before = every_row(&store).await;
        let refused = crate::organization::invitation::rename_member(
            &store,
            &lena,
            &sami.member_id,
            "sami.renamed",
            NOW + 2,
        )
        .await
        .expect_err("the lead renamed a member whose row is uncovered");

        assert_eq!(reason_of(&refused), RefusalReason::RoleUnsettled);
        assert_eq!(every_row(&store).await, rows_before);

        // and the certificate the lead issued stands as it was: nothing re-issued it from the row.
        let still = the_certificate(&store, &owner, &sami.member_id).await;

        assert_eq!(still.id, issued.id);
        assert_eq!(still.ceiling, issued.ceiling);

        // the owner's assignment does not save it, and the owner's removal is what stands.
        assert_eq!(
            reason_of(
                &assign_role(&store, &owner, &sami.member_id, &clerk, None, NOW + 3)
                    .await
                    .expect_err("an assignment saved an uncovered row")
            ),
            RefusalReason::RoleUnsettled
        );
        removal::remove_member(
            &store,
            &mut owner,
            no_platform(),
            "org-database",
            &sami.member_id,
            false,
            NOW + 4,
        )
        .await
        .expect("the owner removes sami");

        for machine in [
            &store,
            &another_machine(&directory, &owner.organization_id).await,
        ] {
            let row = member_row(machine, &owner, &sami.member_id).await;

            assert!(row.removed_at.is_some());
            assert!(row.covered);
            assert_eq!(row.effective, 0);
        }
    }

    /// **A removed member's row grants nothing, and a removal is never refused for what the
    /// member role carries** (finding C). The owner adds `deleteContract` to the member role and
    /// takes it off the manager's, and a manager still removes a member below them: the removed
    /// row holds the member role with no override, which the manager's certificate covers, and
    /// reads on every machine as removed and granting nothing.
    #[tokio::test]
    async fn a_removal_is_not_refused_for_a_flag_the_member_role_carries_and_the_removed_row_grants_nothing()
     {
        let credentials = Memory::new();
        let directory = scratch("removal-member-role");
        let (store, owner, link, workspace_id) = owned(&credentials, &directory).await;
        let mut manny = holding_role(
            &store,
            &owner,
            &link,
            "manny",
            permission::MANAGER,
            &workspace_id,
        )
        .await;
        let (sami, _) = a_member(
            &store,
            &owner,
            &link,
            "sami.staff",
            permission::MEMBER,
            &workspace_id,
        )
        .await;
        let delete_contract = permission::mask_of(&[Flag::DeleteContract]);

        set_role_mask(
            &store,
            &owner,
            permission::MEMBER,
            permission::MEMBER_ROLE.mask | delete_contract,
            NOW + 1,
        )
        .await
        .expect("the owner widens the member role");
        set_role_mask(
            &store,
            &owner,
            permission::MANAGER,
            permission::MANAGER_ROLE.mask & !delete_contract,
            NOW + 2,
        )
        .await
        .expect("the owner narrows the manager role");

        assert!(!permission::permits(
            the_certificate(&store, &owner, &manny.member_id)
                .await
                .ceiling,
            Flag::DeleteContract
        ));

        removal::remove_member(
            &store,
            &mut manny,
            no_platform(),
            "org-database",
            &sami.member_id,
            false,
            NOW + 3,
        )
        .await
        .expect("the manager removes a member below them");

        for machine in [
            &store,
            &another_machine(&directory, &owner.organization_id).await,
        ] {
            let row = machine
                .members(&owner.verifying_key)
                .await
                .expect("the directory reads")
                .into_iter()
                .find(|member| member.id == sami.member_id)
                .expect("sami's row");

            assert!(row.removed_at.is_some());
            assert_eq!(row.effective, 0, "a removed member's row grants something");
        }
    }

    /// **A manager with the default mask does every act below them** (the review of effort 838,
    /// round two): a role made, given, overridden, re-masked, renamed, moved and deleted, the
    /// member role widened, a member renamed, reset and removed, and the directory, the roles and
    /// the grants read on another machine after them, and again after the owner widens the member
    /// role.
    #[tokio::test]
    async fn a_manager_does_every_act_below_them_and_every_machine_reads_the_result() {
        let credentials = Memory::new();
        let directory = scratch("manager-acts");
        let (store, owner, link, workspace_id) = owned(&credentials, &directory).await;
        let mut manny = holding_role(
            &store,
            &owner,
            &link,
            "manny",
            permission::MANAGER,
            &workspace_id,
        )
        .await;
        let clerk = create_role(
            &store,
            &manny,
            "Clerk",
            permission::MEMBER_ROLE.mask
                | permission::mask_of(&[
                    Flag::DeletePayment,
                    Flag::InviteMember,
                    Flag::GrantWorkspace,
                ]),
            permission::MANAGER,
            NOW + 1,
        )
        .await
        .expect("the manager makes a role");
        let (sami, _) = a_member(
            &store,
            &manny,
            &link,
            "sami",
            permission::MEMBER,
            &workspace_id,
        )
        .await;

        assign_role(&store, &manny, &sami.member_id, &clerk.id, None, NOW + 2)
            .await
            .expect("the manager gives the role");
        set_override(
            &store,
            &manny,
            &sami.member_id,
            permission::mask_of(&[Flag::DeletePayment]),
            NOW + 3,
        )
        .await
        .expect("the manager sets an override");
        set_role_mask(
            &store,
            &manny,
            &clerk.id,
            clerk.mask | permission::mask_of(&[Flag::DeleteTenant]),
            NOW + 4,
        )
        .await
        .expect("the manager re-masks the role");
        set_role_mask(
            &store,
            &manny,
            permission::MEMBER,
            permission::MEMBER_ROLE.mask | permission::mask_of(&[Flag::DeleteComplex]),
            NOW + 4,
        )
        .await
        .expect("the manager widens the member role");
        rename_role(&store, &manny, &clerk.id, "Clerk II", NOW + 5)
            .await
            .expect("the manager renames the role");

        let other = create_role(
            &store,
            &manny,
            "Other",
            permission::MEMBER_ROLE.mask,
            permission::MANAGER,
            NOW + 5,
        )
        .await
        .expect("a second role");

        move_role(&store, &manny, &clerk.id, &other.id, NOW + 6)
            .await
            .expect("the manager moves the role");
        crate::organization::invitation::rename_member(
            &store,
            &manny,
            &sami.member_id,
            "sami.renamed",
            NOW + 6,
        )
        .await
        .expect("the manager renames the member");
        crate::organization::invitation::unset_password(
            &store,
            &manny,
            no_platform(),
            &sami.member_id,
            test_cost(),
            NOW + 7,
        )
        .await
        .expect("the manager resets the member");
        delete_role(&store, &manny, &other.id, NOW + 8)
            .await
            .expect("the manager deletes a role");
        removal::remove_member(
            &store,
            &mut manny,
            no_platform(),
            "org-database",
            &sami.member_id,
            false,
            NOW + 9,
        )
        .await
        .expect("the manager removes the member");

        let elsewhere = another_machine(&directory, &owner.organization_id).await;

        elsewhere
            .members(&owner.verifying_key)
            .await
            .expect("the members read elsewhere");
        elsewhere
            .roles(&owner.verifying_key)
            .await
            .expect("the roles read elsewhere");
        elsewhere
            .grants(&owner.verifying_key)
            .await
            .expect("the grants read elsewhere");

        set_role_mask(
            &store,
            &owner,
            permission::MEMBER,
            permission::MEMBER_ROLE.mask
                | permission::mask_of(&[Flag::DeleteComplex, Flag::DeleteUnit]),
            NOW + 10,
        )
        .await
        .expect("the owner widens the member role");
        another_machine(&directory, &owner.organization_id)
            .await
            .members(&owner.verifying_key)
            .await
            .expect("the members read after it");
    }

    /// **A custom role holding the member-administration flags does what they say** (the review
    /// of effort 838, round two): a lead invites a member, sets their override, renames, resets
    /// and removes them, and the directory reads on another machine.
    #[tokio::test]
    async fn a_custom_role_holding_the_member_administration_flags_does_what_they_say() {
        let credentials = Memory::new();
        let directory = scratch("lead-acts");
        let (store, owner, link, workspace_id) = owned(&credentials, &directory).await;
        let lead = a_role(
            &store,
            &owner,
            "Lead",
            permission::MEMBER_ROLE.mask
                | permission::mask_of(&[
                    Flag::InviteMember,
                    Flag::GrantWorkspace,
                    Flag::AssignRole,
                    Flag::OverrideMember,
                    Flag::RemoveMember,
                    Flag::RenameMember,
                    Flag::ResetPassword,
                ]),
            permission::MANAGER,
        )
        .await;
        let mut lena = holding_role(&store, &owner, &link, "lena", &lead, &workspace_id).await;
        let (sami, _) = a_member(
            &store,
            &lena,
            &link,
            "sami",
            permission::MEMBER,
            &workspace_id,
        )
        .await;

        set_override(
            &store,
            &lena,
            &sami.member_id,
            permission::mask_of(&[Flag::EditPayment]),
            NOW + 2,
        )
        .await
        .expect("the lead sets an override");
        crate::organization::invitation::rename_member(
            &store,
            &lena,
            &sami.member_id,
            "sami.renamed",
            NOW + 3,
        )
        .await
        .expect("the lead renames the member");
        crate::organization::invitation::unset_password(
            &store,
            &lena,
            no_platform(),
            &sami.member_id,
            test_cost(),
            NOW + 4,
        )
        .await
        .expect("the lead resets the member");
        removal::remove_member(
            &store,
            &mut lena,
            no_platform(),
            "org-database",
            &sami.member_id,
            false,
            NOW + 5,
        )
        .await
        .expect("the lead removes the member");

        another_machine(&directory, &owner.organization_id)
            .await
            .members(&owner.verifying_key)
            .await
            .expect("the members read elsewhere");
    }

    /// **A demotion written around the command never reads as the role it names** (criterion 9).
    /// A lead holding a member-administration flag, and a manager, each sign the owner's row and a
    /// manager's row naming the member role, around every command. A member row's signer must
    /// outrank the member as certified as well as the role the row names, so the store refuses to
    /// write either, and written around it, every other machine reads the demoted member with no
    /// permissions rather than as a member: the row is the only record of their role, and it is
    /// not one its signer could write. *Until then each read back as a member with the member
    /// role's mask.*
    #[tokio::test]
    async fn a_demotion_signed_by_one_who_does_not_outrank_the_member_never_reads_as_the_named_role()
     {
        let credentials = Memory::new();
        let directory = scratch("demotion");
        let (store, owner, link, workspace_id) = owned(&credentials, &directory).await;
        let lead = a_role(
            &store,
            &owner,
            "Lead",
            permission::MEMBER_ROLE.mask
                | permission::mask_of(&[Flag::InviteMember, Flag::GrantWorkspace]),
            permission::MANAGER,
        )
        .await;
        let lena = holding_role(&store, &owner, &link, "lena", &lead, &workspace_id).await;
        let manny = holding_role(
            &store,
            &owner,
            &link,
            "manny",
            permission::MANAGER,
            &workspace_id,
        )
        .await;
        let mona = holding_role(
            &store,
            &owner,
            &link,
            "mona",
            permission::MANAGER,
            &workspace_id,
        )
        .await;

        for (signer_session, victims) in
            [(&lena, vec![&owner, &manny]), (&manny, vec![&owner, &mona])]
        {
            let (key, certificate) = signer_of(&store, signer_session)
                .await
                .expect("the signer signs");
            let signer = Signer {
                key: &key,
                certificate: &certificate,
            };

            for victim in victims {
                let demoted = MemberRecord {
                    role_id: permission::MEMBER.to_string(),
                    override_mask: 0,
                    ..member_row(&store, &owner, &victim.member_id).await
                };
                let rows_before = every_row(&store).await;

                store
                    .write_member(&signer, &demoted)
                    .await
                    .expect_err("the store wrote a demotion from below");
                assert_eq!(every_row(&store).await, rows_before);

                store
                    .write_member_around_the_check(&signer, &demoted)
                    .await
                    .expect("written around the store");

                let read = another_machine(&directory, &owner.organization_id)
                    .await
                    .members(&owner.verifying_key)
                    .await;

                if let Ok(members) = read {
                    let row = members
                        .into_iter()
                        .find(|member| member.id == victim.member_id)
                        .expect("the demoted row");

                    assert_eq!(
                        row.effective, 0,
                        "{} read as the role a demotion from below named",
                        victim.member_id
                    );
                }
            }
        }
    }

    // -------------------------------------------------------------------------------------
    // Effort 838, the re-check of ticket 20: an uncovered member row is never saved, only removed.
    // -------------------------------------------------------------------------------------

    /// The refusal an act on a member whose row is uncovered meets, or a panic naming what came
    /// back instead.
    fn unsettled<T: std::fmt::Debug>(outcome: Result<T, Error>, act: &str) {
        let refusal = outcome.expect_err(act);

        assert_eq!(
            reason_of(&refusal),
            RefusalReason::RoleUnsettled,
            "{act}: {refusal:?}"
        );
    }

    /// The owner removes a member, the ordinary removal.
    async fn removed_by(store: &OrganizationStore, remover: &mut MemberSession, member_id: &str) {
        removal::remove_member(
            store,
            remover,
            no_platform(),
            "org-database",
            member_id,
            false,
            NOW + 50,
        )
        .await
        .unwrap_or_else(|error| panic!("{member_id} was not removed: {error:?}"));
    }

    /// A member's row as every machine reads it once they are removed: removed, covered, granting
    /// nothing.
    async fn reads_removed(directory: &std::path::Path, owner: &MemberSession, member_id: &str) {
        let row = member_row(
            &another_machine(directory, &owner.organization_id).await,
            owner,
            member_id,
        )
        .await;

        assert!(row.removed_at.is_some(), "{member_id} is not removed");
        assert!(row.covered, "{member_id}'s removal is not covered");
        assert_eq!(row.effective, 0);
    }

    /// **A forged promotion is not laundered, by a rename or an assignment** (the review's first
    /// probe). A lead signs sami's row naming Senior, a role above the lead carrying
    /// `deleteContract`, around the store; it reads uncovered. A manager lacking the flag renames
    /// sami, and assigns them Senior or the member role, and the owner assigns them the member
    /// role: every one is refused by name and writes nothing, so sami never holds the flag. The
    /// owner's rename of a lead's forged "manager" row is refused the same way. Each is removed.
    #[tokio::test]
    async fn a_forged_promotion_is_never_saved_by_any_act_and_is_removed() {
        let credentials = Memory::new();
        let directory = scratch("launder");
        let (store, mut owner, link, workspace_id) = owned(&credentials, &directory).await;
        let delete_contract = permission::mask_of(&[Flag::DeleteContract]);

        set_role_mask(
            &store,
            &owner,
            permission::MANAGER,
            permission::MANAGER_ROLE.mask & !delete_contract,
            NOW,
        )
        .await
        .expect("the owner narrows the manager");

        // the lead first, so Senior, made after it directly below the manager, ranks above it.
        let lena = a_lead(&store, &owner, &link, &workspace_id).await;
        let senior = a_role(
            &store,
            &owner,
            "Senior",
            permission::MEMBER_ROLE.mask | delete_contract,
            permission::MANAGER,
        )
        .await;
        let manny = holding_role(
            &store,
            &owner,
            &link,
            "manny",
            permission::MANAGER,
            &workspace_id,
        )
        .await;
        let (sami, _) = a_member(
            &store,
            &owner,
            &link,
            "sami",
            permission::MEMBER,
            &workspace_id,
        )
        .await;
        let (tess, _) = a_member(
            &store,
            &owner,
            &link,
            "tess",
            permission::MEMBER,
            &workspace_id,
        )
        .await;

        demoted_around_the_store(&store, &owner, &lena, &sami.member_id, &senior, None).await;
        demoted_around_the_store(
            &store,
            &owner,
            &lena,
            &tess.member_id,
            permission::MANAGER,
            None,
        )
        .await;
        assert!(!member_row(&store, &owner, &sami.member_id).await.covered);
        assert!(!member_row(&store, &owner, &tess.member_id).await.covered);

        let rows_before = every_row(&store).await;

        unsettled(
            crate::organization::invitation::rename_member(
                &store,
                &manny,
                &sami.member_id,
                "sami.renamed",
                NOW + 2,
            )
            .await,
            "a manager's rename of a forged promotion",
        );
        unsettled(
            assign_role(&store, &manny, &sami.member_id, &senior, None, NOW + 2).await,
            "a manager's assignment of the forged role",
        );
        unsettled(
            assign_role(
                &store,
                &manny,
                &sami.member_id,
                permission::MEMBER,
                None,
                NOW + 2,
            )
            .await,
            "a manager's assignment of the member role",
        );
        unsettled(
            assign_role(
                &store,
                &owner,
                &sami.member_id,
                permission::MEMBER,
                None,
                NOW + 2,
            )
            .await,
            "the owner's assignment",
        );
        unsettled(
            crate::organization::invitation::rename_member(
                &store,
                &owner,
                &tess.member_id,
                "tess.renamed",
                NOW + 2,
            )
            .await,
            "the owner's rename of a forged manager row",
        );
        assert_eq!(every_row(&store).await, rows_before, "a refusal wrote");
        assert!(!permission::permits(
            member_row(
                &another_machine(&directory, &owner.organization_id).await,
                &owner,
                &sami.member_id
            )
            .await
            .effective,
            Flag::DeleteContract
        ));

        removed_by(&store, &mut owner, &sami.member_id).await;
        removed_by(&store, &mut owner, &tess.member_id).await;
        reads_removed(&directory, &owner, &sami.member_id).await;
        reads_removed(&directory, &owner, &tess.member_id).await;
    }

    /// **A row naming a role that is gone is refused every act and removed** (the review's second
    /// probe). The owner deletes Clerk on one machine while a lead's row giving sami Clerk merges
    /// in from another; the row reads uncovered. A rename and an assignment are refused by name,
    /// and the owner removes sami.
    #[tokio::test]
    async fn a_row_naming_a_role_that_is_gone_is_refused_every_act_and_removed() {
        let credentials = Memory::new();
        let directory = scratch("gone-role");
        let (store, mut owner, link, workspace_id) = owned(&credentials, &directory).await;
        let lead = a_role(
            &store,
            &owner,
            "Lead",
            permission::MEMBER_ROLE.mask
                | permission::mask_of(&[
                    Flag::InviteMember,
                    Flag::GrantWorkspace,
                    Flag::AssignRole,
                ]),
            permission::MANAGER,
        )
        .await;
        let clerk = a_role(&store, &owner, "Clerk", permission::MEMBER_ROLE.mask, &lead).await;
        let lena = holding_role(&store, &owner, &link, "lena", &lead, &workspace_id).await;
        let (sami, _) = a_member(&store, &lena, &link, "sami", &clerk, &workspace_id).await;
        let lenas_row = member_row(&store, &owner, &sami.member_id).await;

        delete_role(&store, &owner, &clerk, NOW + 1)
            .await
            .expect("the owner deletes the clerk role");

        let (key, certificate) = signer_of(&store, &lena).await.expect("lena signs");

        store
            .write_member_around_the_check(
                &Signer {
                    key: &key,
                    certificate: &certificate,
                },
                &MemberRecord {
                    updated_at: NOW + 5,
                    ..lenas_row
                },
            )
            .await
            .expect("the lead's row merges in");
        assert!(!member_row(&store, &owner, &sami.member_id).await.covered);

        unsettled(
            crate::organization::invitation::rename_member(
                &store,
                &owner,
                &sami.member_id,
                "sami.renamed",
                NOW + 6,
            )
            .await,
            "the owner's rename of a row naming a role that is gone",
        );
        unsettled(
            assign_role(
                &store,
                &owner,
                &sami.member_id,
                permission::MEMBER,
                None,
                NOW + 7,
            )
            .await,
            "the owner's assignment over a role that is gone",
        );

        removed_by(&store, &mut owner, &sami.member_id).await;
        reads_removed(&directory, &owner, &sami.member_id).await;
    }

    /// **A removal written from below reads as removed and is not lifted** (the review's third
    /// probe). A lead signs a manager's row as removed around the store: it reads uncovered and
    /// removed, fail-safe, so the manager is refused at sign-in. The owner's assignment of the
    /// manager role is refused by name, and the owner removes the manager, which stands as a
    /// removal the owner wrote.
    #[tokio::test]
    async fn a_removal_written_from_below_reads_as_removed_and_is_not_lifted() {
        let credentials = Memory::new();
        let directory = scratch("removal-from-below");
        let (store, mut owner, link, workspace_id) = owned(&credentials, &directory).await;
        let lena = a_lead(&store, &owner, &link, &workspace_id).await;
        let (invited, manny) = a_member(
            &store,
            &owner,
            &link,
            "manny",
            permission::MEMBER,
            &workspace_id,
        )
        .await;

        assign_role(
            &store,
            &owner,
            &manny.member_id,
            permission::MANAGER,
            None,
            NOW,
        )
        .await
        .expect("manny is a manager");
        demoted_around_the_store(
            &store,
            &owner,
            &lena,
            &manny.member_id,
            permission::MANAGER,
            Some(NOW + 1),
        )
        .await;

        let row = member_row(&store, &owner, &manny.member_id).await;

        assert!(row.removed_at.is_some() && !row.covered);
        assert_eq!(row.effective, 0);

        let joined = joined_as(&owner, &manny.member_id, permission::MANAGER);

        assert_eq!(
            reason_of(
                &sign_in(&store, &joined, &secret_of(&invited), &slot())
                    .await
                    .expect_err("a member removed from below signed in")
            ),
            RefusalReason::YouWereRemoved
        );
        unsettled(
            assign_role(
                &store,
                &owner,
                &manny.member_id,
                permission::MANAGER,
                None,
                NOW + 2,
            )
            .await,
            "the owner's assignment over a removal from below",
        );

        removed_by(&store, &mut owner, &manny.member_id).await;
        reads_removed(&directory, &owner, &manny.member_id).await;
    }

    /// **A covered removal a forger re-signs is not lifted** (the re-check's fourth probe). The
    /// owner removes sami; a lead signs sami's row again naming the manager role and keeping the
    /// removal, around the store. It reads uncovered and removed; the owner's assignment is
    /// refused by name, sami still cannot sign in, and the owner removes sami again, which stands.
    #[tokio::test]
    async fn a_covered_removal_a_forger_re_signs_is_not_lifted() {
        let credentials = Memory::new();
        let directory = scratch("removal-re-signed");
        let (store, mut owner, link, workspace_id) = owned(&credentials, &directory).await;
        let lena = a_lead(&store, &owner, &link, &workspace_id).await;
        let (invited, sami) = a_member(
            &store,
            &owner,
            &link,
            "sami",
            permission::MEMBER,
            &workspace_id,
        )
        .await;

        removed_by(&store, &mut owner, &sami.member_id).await;

        let removed_at = member_row(&store, &owner, &sami.member_id).await.removed_at;

        demoted_around_the_store(
            &store,
            &owner,
            &lena,
            &sami.member_id,
            permission::MANAGER,
            removed_at,
        )
        .await;

        let row = member_row(&store, &owner, &sami.member_id).await;

        assert!(row.removed_at.is_some() && !row.covered);

        unsettled(
            assign_role(
                &store,
                &owner,
                &sami.member_id,
                permission::MEMBER,
                None,
                NOW + 2,
            )
            .await,
            "the owner's assignment over a re-signed removal",
        );

        let joined = joined_as(&owner, &sami.member_id, permission::MEMBER);

        assert_eq!(
            reason_of(
                &sign_in(&store, &joined, &secret_of(&invited), &slot())
                    .await
                    .expect_err("a removed member signed in")
            ),
            RefusalReason::YouWereRemoved
        );

        removed_by(&store, &mut owner, &sami.member_id).await;
        reads_removed(&directory, &owner, &sami.member_id).await;
    }

    /// **A signing key a forger puts on a row is never certified** (the re-check's fifth probe). A
    /// lead signs a manager's row naming the member role with a signing key the lead generated,
    /// around the store. The owner's assignment of the manager role is refused by name, so no
    /// certificate names the forger's key; the owner removes the manager, whose certificates are
    /// revoked, and none that lives names it either.
    #[tokio::test]
    async fn a_signing_key_a_forger_puts_on_a_row_is_never_certified() {
        let credentials = Memory::new();
        let directory = scratch("forged-key");
        let (store, mut owner, link, workspace_id) = owned(&credentials, &directory).await;
        let lena = a_lead(&store, &owner, &link, &workspace_id).await;
        let manny = holding_role(
            &store,
            &owner,
            &link,
            "manny",
            permission::MANAGER,
            &workspace_id,
        )
        .await;
        let forger = AdministratorKey::generate().expect("a key");
        let (key, certificate) = signer_of(&store, &lena).await.expect("lena signs");

        store
            .write_member_around_the_check(
                &Signer {
                    key: &key,
                    certificate: &certificate,
                },
                &MemberRecord {
                    role_id: permission::MEMBER.to_string(),
                    override_mask: 0,
                    signing_public_key: forger.verifying_key(),
                    ..member_row(&store, &owner, &manny.member_id).await
                },
            )
            .await
            .expect("written around the store");

        unsettled(
            assign_role(
                &store,
                &owner,
                &manny.member_id,
                permission::MANAGER,
                None,
                NOW + 2,
            )
            .await,
            "the owner's assignment over a forged signing key",
        );

        let names_the_forger = |certificates: Vec<Certificate>| {
            certificates
                .iter()
                .any(|certificate| certificate.signing_public_key == forger.verifying_key())
        };

        assert!(!names_the_forger(
            store
                .live_certificates(&owner.verifying_key, &manny.member_id)
                .await
                .expect("the certificates")
        ));

        removed_by(&store, &mut owner, &manny.member_id).await;
        reads_removed(&directory, &owner, &manny.member_id).await;
        assert!(
            store
                .live_certificates(&owner.verifying_key, &manny.member_id)
                .await
                .expect("the certificates")
                .is_empty()
        );
        assert!(!names_the_forger(
            store.certificates().await.expect("every certificate")
        ));
    }

    /// **A covered removal is not undone by an assignment, and an uncovered row can be removed.**
    /// The owner removes sami, and assigning sami a role is refused as a removed member; a row a
    /// lead's forged promotion left uncovered is removed by the owner, who outranks the member as
    /// certified, and reads removed on every machine.
    #[tokio::test]
    async fn a_covered_removal_is_not_undone_by_an_assignment_and_an_uncovered_row_can_be_removed()
    {
        let credentials = Memory::new();
        let directory = scratch("covered-removal");
        let (store, mut owner, link, workspace_id) = owned(&credentials, &directory).await;
        let lena = a_lead(&store, &owner, &link, &workspace_id).await;
        let (sami, _) = a_member(
            &store,
            &owner,
            &link,
            "sami",
            permission::MEMBER,
            &workspace_id,
        )
        .await;
        let (tess, _) = a_member(
            &store,
            &owner,
            &link,
            "tess",
            permission::MEMBER,
            &workspace_id,
        )
        .await;

        removed_by(&store, &mut owner, &sami.member_id).await;

        let refusal = assign_role(
            &store,
            &owner,
            &sami.member_id,
            permission::MEMBER,
            None,
            NOW + 2,
        )
        .await
        .expect_err("an assignment undid a removal");

        assert_eq!(reason_of(&refusal), RefusalReason::MemberRemoved);

        demoted_around_the_store(
            &store,
            &owner,
            &lena,
            &tess.member_id,
            permission::MANAGER,
            None,
        )
        .await;
        removed_by(&store, &mut owner, &tess.member_id).await;
        reads_removed(&directory, &owner, &tess.member_id).await;
    }

    /// **Retiring a certificate that signed an uncovered row waits for that member's removal.** A
    /// lead signs sami's row naming a role above the lead, around the store; the owner's removal of
    /// the lead, which would sign the lead's rows again under the owner's root, is refused by
    /// name, saying to remove sami first, and writes nothing, since the root covers every role and
    /// would make the forged one real. Once the owner removes sami, the lead's removal goes.
    #[tokio::test]
    async fn retiring_a_certificate_that_signed_an_uncovered_row_waits_for_that_members_removal() {
        let credentials = Memory::new();
        let directory = scratch("resign-uncovered");
        let (store, mut owner, link, workspace_id) = owned(&credentials, &directory).await;
        let lena = a_lead(&store, &owner, &link, &workspace_id).await;
        let senior = a_role(
            &store,
            &owner,
            "Senior",
            permission::MEMBER_ROLE.mask | permission::mask_of(&[Flag::DeleteContract]),
            permission::MANAGER,
        )
        .await;
        let (sami, _) = a_member(
            &store,
            &owner,
            &link,
            "sami",
            permission::MEMBER,
            &workspace_id,
        )
        .await;

        demoted_around_the_store(&store, &owner, &lena, &sami.member_id, &senior, None).await;
        assert!(!member_row(&store, &owner, &sami.member_id).await.covered);

        let rows_before = every_row(&store).await;
        let refusal = removal::remove_member(
            &store,
            &mut owner,
            no_platform(),
            "org-database",
            &lena.member_id,
            false,
            NOW + 2,
        )
        .await
        .expect_err("a removal re-signed an uncovered row");

        assert_eq!(reason_of(&refusal), RefusalReason::RoleUnsettled);
        assert!(
            refusal.to_string().contains("removes them first"),
            "{refusal}"
        );
        assert_eq!(every_row(&store).await, rows_before, "a refusal wrote");

        removed_by(&store, &mut owner, &sami.member_id).await;
        removed_by(&store, &mut owner, &lena.member_id).await;
        reads_removed(&directory, &owner, &sami.member_id).await;
        reads_removed(&directory, &owner, &lena.member_id).await;
    }

    // -------------------------------------------------------------------------------------
    // Effort 838, requirement 6 as amended 2026-09-27: writing a kind of record needs viewing
    // it, and a member given another role holds it exactly.
    // -------------------------------------------------------------------------------------

    /// **A member with an override given another role holds it exactly**: the override is cleared
    /// in the same signed write, what they end up with is the new role's mask, their certificate
    /// carries it, and the row verifies on a second store.
    #[tokio::test]
    async fn a_member_given_another_role_holds_it_exactly() {
        let credentials = Memory::new();
        let directory = scratch("exactly");
        let (store, owner, link, workspace_id) = owned(&credentials, &directory).await;
        let (invited, _) = a_member(
            &store,
            &owner,
            &link,
            "sami.staff",
            permission::MEMBER,
            &workspace_id,
        )
        .await;
        let collector = a_role(
            &store,
            &owner,
            "collector",
            permission::mask_of(&[Flag::ViewPayment, Flag::CreatePayment]),
            permission::MANAGER,
        )
        .await;
        let override_mask = permission::mask_of(&[Flag::DeletePayment, Flag::InviteMember]);

        set_override(&store, &owner, &invited.member_id, override_mask, NOW + 1)
            .await
            .expect("the override was not set");

        assert_eq!(
            member_row(&store, &owner, &invited.member_id)
                .await
                .override_mask,
            override_mask
        );

        let given = assign_role(
            &store,
            &owner,
            &invited.member_id,
            &collector,
            None,
            NOW + 2,
        )
        .await
        .expect("the role was not given");
        let mask = permission::mask_of(&[Flag::ViewPayment, Flag::CreatePayment]);

        assert_eq!(given.permissions, mask);

        let row = member_row(&store, &owner, &invited.member_id).await;

        assert_eq!(row.role_id, collector);
        assert_eq!(row.override_mask, 0, "the override outlived the role");
        assert_eq!(row.effective, mask);
        assert_eq!(
            the_certificate(&store, &owner, &invited.member_id)
                .await
                .ceiling,
            mask
        );

        let elsewhere = another_machine(&directory, &owner.organization_id).await;
        let theirs = member_row(&elsewhere, &owner, &invited.member_id).await;

        assert_eq!(
            (theirs.role_id, theirs.override_mask, theirs.effective),
            (collector.clone(), 0, mask),
            "another machine reads the member otherwise"
        );

        drop(elsewhere);

        // and given the role they already hold, the override they were given since goes too: the
        // role, exactly.
        set_override(
            &store,
            &owner,
            &invited.member_id,
            permission::mask_of(&[Flag::EditPayment]),
            NOW + 3,
        )
        .await
        .expect("the override was not set");
        assign_role(
            &store,
            &owner,
            &invited.member_id,
            &collector,
            None,
            NOW + 4,
        )
        .await
        .expect("the role was not given again");

        assert_eq!(
            row_of(&store, &owner, &invited.member_id).await,
            (collector, mask)
        );
    }

    /// **Clearing an override is part of assigning**: a manager holding `assignRole` and not
    /// `overrideMember` gives a member with an override another role, and it is cleared; leaving
    /// them an override is what asks `overrideMember`.
    #[tokio::test]
    async fn clearing_an_override_asks_nothing_more_than_assigning() {
        let credentials = Memory::new();
        let directory = scratch("clearing");
        let (store, owner, link, workspace_id) = owned(&credentials, &directory).await;
        let lead = a_role(
            &store,
            &owner,
            "lead",
            permission::MEMBER_ROLE.mask | permission::mask_of(&[Flag::AssignRole]),
            permission::MANAGER,
        )
        .await;
        let assigner = holding_role(&store, &owner, &link, "ada.lead", &lead, &workspace_id).await;
        let (invited, _) = a_member(
            &store,
            &owner,
            &link,
            "sami.staff",
            permission::MEMBER,
            &workspace_id,
        )
        .await;
        let collector = a_role(
            &store,
            &owner,
            "collector",
            permission::mask_of(&[Flag::ViewPayment]),
            &lead,
        )
        .await;

        set_override(
            &store,
            &owner,
            &invited.member_id,
            permission::mask_of(&[Flag::EditPayment]),
            NOW + 1,
        )
        .await
        .expect("the override was not set");

        let refused = assign_role(
            &store,
            &assigner,
            &invited.member_id,
            &collector,
            Some(permission::mask_of(&[Flag::CreatePayment])),
            NOW + 2,
        )
        .await
        .expect_err("an override was left without overrideMember");

        assert_eq!(
            reason_of(&refused),
            RefusalReason::RoleLacksAct,
            "{refused:?}"
        );

        assign_role(
            &store,
            &assigner,
            &invited.member_id,
            &collector,
            None,
            NOW + 3,
        )
        .await
        .expect("assigning alone cleared nothing");

        let row = member_row(&store, &owner, &invited.member_id).await;

        assert_eq!(
            (row.role_id, row.override_mask, row.effective),
            (collector, 0, permission::mask_of(&[Flag::ViewPayment]))
        );
    }

    /// **No role mask and no member's effective permissions that add, edit or delete a kind of
    /// record without viewing it is written**, by making a role, editing one, setting an override,
    /// or giving a role with one; the refusal names the kind, and nothing is written. An edit of a
    /// role is refused too where it would leave a holder's override doing so.
    #[tokio::test]
    async fn a_role_or_an_override_writing_a_kind_it_cannot_view_is_refused_by_kind() {
        let credentials = Memory::new();
        let directory = scratch("unviewed");
        let (store, owner, link, workspace_id) = owned(&credentials, &directory).await;
        let collector = a_role(
            &store,
            &owner,
            "collector",
            permission::mask_of(&[Flag::ViewUnit, Flag::ViewPayment]),
            permission::MANAGER,
        )
        .await;
        let holder = holding_role(
            &store,
            &owner,
            &link,
            "noor.collector",
            &collector,
            &workspace_id,
        )
        .await;

        set_override(
            &store,
            &owner,
            &holder.member_id,
            permission::mask_of(&[Flag::CreateUnit]),
            NOW + 1,
        )
        .await
        .expect("an override writing units the role views was refused");

        let (plain, _) = a_member(
            &store,
            &owner,
            &link,
            "sami.staff",
            permission::MEMBER,
            &workspace_id,
        )
        .await;
        let before = every_row(&store).await;

        let refusals = [
            (
                "a role made editing contracts alone",
                create_role(
                    &store,
                    &owner,
                    "clerk",
                    permission::mask_of(&[Flag::EditContract]),
                    permission::MANAGER,
                    NOW + 2,
                )
                .await
                .map(|_| ()),
                RefusalReason::NeedsViewing("contract"),
            ),
            (
                "the member's role adding tenants without viewing them",
                set_role_mask(
                    &store,
                    &owner,
                    permission::MEMBER,
                    permission::MEMBER_ROLE.mask & !permission::mask_of(&[Flag::ViewTenant]),
                    NOW + 2,
                )
                .await
                .map(|_| ()),
                RefusalReason::NeedsViewing("tenant"),
            ),
            (
                "an override switching viewing payments off the member's role",
                set_override(
                    &store,
                    &owner,
                    &plain.member_id,
                    permission::mask_of(&[Flag::ViewPayment]),
                    NOW + 2,
                )
                .await
                .map(|_| ()),
                RefusalReason::NeedsViewing("payment"),
            ),
            (
                "a role given with an override deleting complexes",
                assign_role(
                    &store,
                    &owner,
                    &plain.member_id,
                    &collector,
                    Some(permission::mask_of(&[Flag::DeleteComplex])),
                    NOW + 2,
                )
                .await
                .map(|_| ()),
                RefusalReason::NeedsViewing("complex"),
            ),
            (
                "a role edit leaving its holder adding units without viewing them",
                set_role_mask(
                    &store,
                    &owner,
                    &collector,
                    permission::mask_of(&[Flag::ViewPayment]),
                    NOW + 2,
                )
                .await
                .map(|_| ()),
                RefusalReason::NeedsViewing("unit"),
            ),
        ];

        for (what, outcome, reason) in refusals {
            let refused = outcome.expect_err(what);

            assert_eq!(reason_of(&refused), reason, "{what}: {refused:?}");
        }

        assert!(
            every_row(&store).await == before,
            "a refusal wrote something"
        );
    }

    // -------------------------------------------------------------------------------------
    // Effort 838, requirement 12 as amended a third time (ticket 53): a member's override for one
    // workspace, set under the organization override's rules and cleared with it.
    // -------------------------------------------------------------------------------------

    /// The member's override for one workspace as the verified reader finds it, as `(pinned,
    /// granted)`, or `(0, 0)`.
    async fn workspace_override_of(
        store: &OrganizationStore,
        key: &[u8; VERIFYING_KEY_BYTES],
        member_id: &str,
        workspace_id: &str,
    ) -> (i64, i64) {
        pins_of(
            &store
                .workspace_overrides(key)
                .await
                .expect("the workspace overrides"),
            member_id,
            workspace_id,
        )
    }

    /// Whether a workspace override row about this pair is in the table at all, verified or not.
    async fn a_row_stands(store: &OrganizationStore, member_id: &str, workspace_id: &str) -> bool {
        let mut rows = store
            .connection()
            .query(
                "SELECT 1 FROM \"workspace_override\" \
                 WHERE \"member_id\" = ? AND \"workspace_id\" = ?",
                vec![
                    turso::Value::Text(member_id.to_string()),
                    turso::Value::Text(workspace_id.to_string()),
                ],
            )
            .await
            .expect("the rows");

        rows.next().await.expect("a row").is_some()
    }

    /// A lead: a custom role below the manager holding the member's mask and `overrideMember`,
    /// given to a new member of the workspace.
    async fn an_overrider(
        store: &OrganizationStore,
        owner: &MemberSession,
        link: &Locator,
        username: &'static str,
        workspace_id: &str,
    ) -> MemberSession {
        let lead = a_role(
            store,
            owner,
            "Lead",
            permission::MEMBER_ROLE.mask | permission::mask_of(&[Flag::OverrideMember]),
            permission::MANAGER,
        )
        .await;

        holding_role(store, owner, link, username, &lead, workspace_id).await
    }

    /// **Ticket 53's third criterion, the act.** The owner sets a member's override for the
    /// workspace, replaces it and clears it; each answer is the member as the list shows them,
    /// with the override and what it leaves them there, and the member's own facts carry the same.
    /// The row verifies on another machine, and a mask of zero leaves no row at all.
    #[tokio::test]
    async fn a_workspace_override_is_set_replaced_and_cleared_and_read_everywhere() {
        let credentials = Memory::new();
        let directory = scratch("workspace-override");
        let (store, owner, link, workspace_id) = owned(&credentials, &directory).await;
        let (sami, sami_session) = a_member(
            &store,
            &owner,
            &link,
            "sami",
            permission::MEMBER,
            &workspace_id,
        )
        .await;
        // read only: every add, edit and delete pinned off.
        let read_only = permission::mask_of(&permission::WRITE_FLAGS);

        let set = super::set_workspace_override(
            &store,
            &owner,
            &sami.member_id,
            &workspace_id,
            read_only,
            0,
        )
        .await
        .expect("the owner set it");
        let held = set
            .workspaces
            .iter()
            .find(|workspace| workspace.id == workspace_id)
            .expect("the workspace on the card");

        assert_eq!((held.pinned, held.granted), (read_only, 0));
        assert_eq!(
            held.permissions,
            permission::effective_in_workspace(permission::MEMBER_ROLE.mask, read_only, 0)
        );
        assert_eq!(
            set.permissions,
            permission::MEMBER_ROLE.mask,
            "the organization layer moved"
        );
        assert!(!permission::permits(held.permissions, Flag::CreatePayment));
        assert!(permission::permits(held.permissions, Flag::ViewPayment));

        // the member's own session reads the same off the replica.
        let facts = crate::organization::session::facts_of(
            &store,
            &sami_session,
            &mut joined_as(&sami_session, &sami_session.member_id, &sami_session.role),
        )
        .await
        .expect("sami's facts");
        let theirs = facts
            .workspaces
            .iter()
            .find(|workspace| workspace.id == workspace_id)
            .expect("the workspace in sami's facts");

        assert_eq!((theirs.pinned, theirs.granted), (read_only, 0));
        assert_eq!(theirs.permissions, held.permissions);
        assert_eq!(facts.permissions, permission::MEMBER_ROLE.mask);

        // replaced: deleting payments here, which the member role does not carry.
        let deleting = permission::mask_of(&[Flag::DeletePayment]);

        super::set_workspace_override(
            &store,
            &owner,
            &sami.member_id,
            &workspace_id,
            deleting,
            deleting,
        )
        .await
        .expect("the owner replaced it");

        let elsewhere = another_machine(&directory, &owner.organization_id).await;

        assert_eq!(
            workspace_override_of(
                &elsewhere,
                &owner.verifying_key,
                &sami.member_id,
                &workspace_id
            )
            .await,
            (deleting, deleting),
            "another machine does not read the override"
        );

        // cleared: no row, and the member holds there what they hold across the organization.
        let cleared =
            super::set_workspace_override(&store, &owner, &sami.member_id, &workspace_id, 0, 0)
                .await
                .expect("the owner cleared it");

        assert!(!a_row_stands(&store, &sami.member_id, &workspace_id).await);
        assert_eq!(
            cleared.workspaces[0].permissions,
            permission::MEMBER_ROLE.mask
        );
        assert_eq!(
            (cleared.workspaces[0].pinned, cleared.workspaces[0].granted),
            (0, 0)
        );
    }

    /// **Ticket 53's third criterion, the refusals.** Each is refused by name, and nothing is
    /// written: an administration flag; a flag the actor does not hold, pinned on or off; a member
    /// not ranked below the actor; the actor's own row, and the owner's; a workspace the member
    /// holds no grant on, and the organization's own directory; a result that writes a kind it
    /// does not view; a flag granted and not pinned; and an actor without `overrideMember`.
    #[tokio::test]
    async fn every_refusal_of_a_workspace_override_is_named_and_writes_nothing() {
        let credentials = Memory::new();
        let directory = scratch("workspace-override-refused");
        let (store, owner, link, workspace_id) = owned(&credentials, &directory).await;
        let lena = an_overrider(&store, &owner, &link, "lena", &workspace_id).await;
        let (sami, sami_session) = a_member(
            &store,
            &owner,
            &link,
            "sami",
            permission::MEMBER,
            &workspace_id,
        )
        .await;
        let (ada, _) = a_member(
            &store,
            &owner,
            &link,
            "ada",
            permission::MANAGER,
            &workspace_id,
        )
        .await;
        let before = every_row(&store).await;
        let refused = |outcome: Result<crate::organization::invitation::MemberFacts, Error>,
                       reason: RefusalReason,
                       case: &str| {
            let error = outcome.expect_err(case);

            assert_eq!(reason_of(&error), reason, "{case}: {error}");
        };

        refused(
            super::set_workspace_override(
                &store,
                &owner,
                &sami.member_id,
                &workspace_id,
                permission::mask_of(&[Flag::ViewUnit, Flag::AssignRole]),
                permission::mask_of(&[Flag::ViewUnit, Flag::AssignRole]),
            )
            .await,
            RefusalReason::RecordFlagsOnly,
            "an administration flag",
        );
        refused(
            super::set_workspace_override(
                &store,
                &lena,
                &sami.member_id,
                &workspace_id,
                permission::mask_of(&[Flag::DeleteContract]),
                permission::mask_of(&[Flag::DeleteContract]),
            )
            .await,
            RefusalReason::RoleLacksAct,
            "a flag the actor does not hold",
        );
        refused(
            super::set_workspace_override(
                &store,
                &lena,
                &ada.member_id,
                &workspace_id,
                permission::mask_of(&[Flag::EditUnit]),
                permission::mask_of(&[Flag::EditUnit]),
            )
            .await,
            RefusalReason::RankNotAbove,
            "a member not ranked below the actor",
        );
        refused(
            super::set_workspace_override(
                &store,
                &lena,
                &lena.member_id,
                &workspace_id,
                permission::mask_of(&[Flag::EditUnit]),
                permission::mask_of(&[Flag::EditUnit]),
            )
            .await,
            RefusalReason::NotYourself,
            "the actor's own row",
        );
        refused(
            super::set_workspace_override(
                &store,
                &owner,
                &owner.member_id,
                &workspace_id,
                permission::mask_of(&[Flag::EditUnit]),
                permission::mask_of(&[Flag::EditUnit]),
            )
            .await,
            RefusalReason::OwnerProtected,
            "the owner's row",
        );
        refused(
            super::set_workspace_override(
                &store,
                &owner,
                &sami.member_id,
                "a-workspace-nobody-holds",
                permission::mask_of(&[Flag::EditUnit]),
                permission::mask_of(&[Flag::EditUnit]),
            )
            .await,
            RefusalReason::GrantMissing,
            "a workspace the member holds no grant on",
        );
        refused(
            super::set_workspace_override(
                &store,
                &owner,
                &sami.member_id,
                &owner.organization_id,
                permission::mask_of(&[Flag::EditUnit]),
                permission::mask_of(&[Flag::EditUnit]),
            )
            .await,
            RefusalReason::WorkspaceMissing,
            "the organization's own directory",
        );
        refused(
            super::set_workspace_override(
                &store,
                &owner,
                &sami.member_id,
                &workspace_id,
                permission::mask_of(&[Flag::ViewPayment, Flag::DeletePayment]),
                permission::mask_of(&[Flag::DeletePayment]),
            )
            .await,
            RefusalReason::NeedsViewing("payment"),
            "deleting payments turned on there without viewing them",
        );
        refused(
            super::set_workspace_override(
                &store,
                &owner,
                &sami.member_id,
                &workspace_id,
                permission::mask_of(&[Flag::EditUnit]),
                permission::mask_of(&[Flag::EditUnit, Flag::DeleteUnit]),
            )
            .await,
            RefusalReason::RecordFlagsOnly,
            "granting a flag it does not pin",
        );
        refused(
            super::set_workspace_override(
                &store,
                &lena,
                &sami.member_id,
                &workspace_id,
                permission::mask_of(&[Flag::DeleteContract]),
                0,
            )
            .await,
            RefusalReason::RoleLacksAct,
            "pinning off a flag the actor does not hold",
        );
        refused(
            super::set_workspace_override(
                &store,
                &sami_session,
                &ada.member_id,
                &workspace_id,
                permission::mask_of(&[Flag::EditUnit]),
                permission::mask_of(&[Flag::EditUnit]),
            )
            .await,
            RefusalReason::RoleLacksAct,
            "an actor without overrideMember",
        );

        assert_eq!(every_row(&store).await, before, "a refusal wrote something");

        // and the lead, within everything above, sets one.
        super::set_workspace_override(
            &store,
            &lena,
            &sami.member_id,
            &workspace_id,
            permission::mask_of(&[Flag::EditUnit]),
            permission::mask_of(&[Flag::EditUnit]),
        )
        .await
        .expect("the lead set what they hold on somebody below them");

        // payments out of sight there, with the adding and editing the role carries left to the
        // reading, which drops a write without its view: the card pins the view alone.
        super::set_workspace_override(
            &store,
            &owner,
            &sami.member_id,
            &workspace_id,
            permission::mask_of(&[Flag::ViewPayment]),
            0,
        )
        .await
        .expect("a view pinned off beside the role's writes was refused");
    }

    /// The owner lets `member_id` delete units in `workspace_id`, which the member role does not.
    async fn deleting_units(
        store: &OrganizationStore,
        owner: &MemberSession,
        member_id: &str,
        workspace_id: &str,
    ) {
        super::set_workspace_override(
            store,
            owner,
            member_id,
            workspace_id,
            permission::mask_of(&[Flag::DeleteUnit]),
            permission::mask_of(&[Flag::DeleteUnit]),
        )
        .await
        .unwrap_or_else(|error| panic!("the owner set it: {error:?}"));
    }

    /// **Ticket 53's fourth criterion.** A member's workspace overrides go with their organization
    /// layer and with the grant: given another role, reset to their role, holding a role that is
    /// deleted, the grant withdrawn, removed, and the workspace deleted. An override given with a
    /// role that is not zero keeps them, since that is no reset.
    #[tokio::test]
    async fn a_workspace_override_goes_with_the_role_the_reset_the_grant_the_removal_and_the_workspace()
     {
        let credentials = Memory::new();
        let directory = scratch("workspace-override-cleared");
        let (store, mut owner, link, workspace_id) = owned(&credentials, &directory).await;
        let (sami, _) = a_member(
            &store,
            &owner,
            &link,
            "sami",
            permission::MEMBER,
            &workspace_id,
        )
        .await;

        // another role.
        deleting_units(&store, &owner, &sami.member_id, &workspace_id).await;
        assign_role(
            &store,
            &owner,
            &sami.member_id,
            permission::MANAGER,
            None,
            NOW + 1,
        )
        .await
        .expect("the assignment");
        assert!(
            !a_row_stands(&store, &sami.member_id, &workspace_id).await,
            "another role"
        );

        // an override that is not zero keeps it; the reset takes it.
        assign_role(
            &store,
            &owner,
            &sami.member_id,
            permission::MEMBER,
            None,
            NOW + 2,
        )
        .await
        .expect("back to member");
        deleting_units(&store, &owner, &sami.member_id, &workspace_id).await;
        set_override(
            &store,
            &owner,
            &sami.member_id,
            permission::mask_of(&[Flag::DeleteComplex]),
            NOW + 3,
        )
        .await
        .expect("an override");
        assert!(a_row_stands(&store, &sami.member_id, &workspace_id).await);
        set_override(&store, &owner, &sami.member_id, 0, NOW + 4)
            .await
            .expect("the reset");
        assert!(
            !a_row_stands(&store, &sami.member_id, &workspace_id).await,
            "the reset"
        );

        // a deleted role's holder.
        let clerk = a_role(
            &store,
            &owner,
            "Clerk",
            permission::MEMBER_ROLE.mask,
            permission::MANAGER,
        )
        .await;
        let cleo = holding_role(&store, &owner, &link, "cleo", &clerk, &workspace_id).await;

        deleting_units(&store, &owner, &cleo.member_id, &workspace_id).await;
        delete_role(&store, &owner, &clerk, NOW + 5)
            .await
            .expect("the deletion");
        assert!(
            !a_row_stands(&store, &cleo.member_id, &workspace_id).await,
            "a deleted role"
        );

        // the grant withdrawn.
        deleting_units(&store, &owner, &cleo.member_id, &workspace_id).await;
        crate::organization::workspace::withdraw_grant(
            &store,
            &owner,
            &workspace_id,
            &cleo.member_id,
        )
        .await
        .expect("the withdrawal");
        assert!(
            !a_row_stands(&store, &cleo.member_id, &workspace_id).await,
            "a withdrawal"
        );

        // removed.
        deleting_units(&store, &owner, &sami.member_id, &workspace_id).await;
        removal::remove_member(
            &store,
            &mut owner,
            no_platform(),
            "org-database",
            &sami.member_id,
            false,
            NOW + 6,
        )
        .await
        .expect("the removal");
        assert!(
            !a_row_stands(&store, &sami.member_id, &workspace_id).await,
            "a removal"
        );

        // the workspace deleted: a second one, made and granted here on an account of its own.
        let platform = Arc::new(InMemoryPlatform::new("an-org"));
        let pipeline = crate::sync::test::pipeline::LocalPipeline::start().await;
        let south = create_workspace(
            &store,
            &mut owner,
            &platform,
            |_| Pipeline::at(&pipeline.url("")),
            "South",
            NOW + 7,
        )
        .await
        .expect("the second workspace");
        let (tom, _) = a_member(&store, &owner, &link, "tom", permission::MEMBER, &south.id).await;

        deleting_units(&store, &owner, &tom.member_id, &south.id).await;
        crate::organization::workspace::delete_workspace(&store, &mut owner, &platform, &south.id)
            .await
            .expect("the deletion");
        assert!(
            !a_row_stands(&store, &tom.member_id, &south.id).await,
            "a deleted workspace"
        );
    }

    /// **Ticket 53's second criterion.** A lead holding `overrideMember` writes workspace
    /// overrides around the command: beyond their ceiling, about somebody at or above their rank,
    /// naming an administration flag, and about themselves. The store refuses each by name and
    /// writes nothing; written around it, every other machine leaves each out on read, and the
    /// one the lead may write reads.
    #[tokio::test]
    async fn a_workspace_override_written_around_the_command_beyond_its_signer_is_left_out() {
        let credentials = Memory::new();
        let directory = scratch("workspace-override-around");
        let (store, owner, link, workspace_id) = owned(&credentials, &directory).await;
        let lena = an_overrider(&store, &owner, &link, "lena", &workspace_id).await;
        let (sami, _) = a_member(
            &store,
            &owner,
            &link,
            "sami",
            permission::MEMBER,
            &workspace_id,
        )
        .await;
        let (ada, _) = a_member(
            &store,
            &owner,
            &link,
            "ada",
            permission::MANAGER,
            &workspace_id,
        )
        .await;
        let (key, certificate) = signer_of(&store, &lena).await.expect("lena signs");
        let signer = Signer {
            key: &key,
            certificate: &certificate,
        };
        let row = |member_id: &str, pinned: i64| WorkspaceOverrideRecord {
            member_id: member_id.to_string(),
            workspace_id: workspace_id.clone(),
            pinned,
            granted: pinned,
        };
        let beyond = [
            (
                "beyond the ceiling",
                row(&sami.member_id, permission::mask_of(&[Flag::DeleteUnit])),
            ),
            (
                "at or above the signer",
                row(&ada.member_id, permission::mask_of(&[Flag::EditUnit])),
            ),
            (
                "an administration flag",
                row(
                    &sami.member_id,
                    permission::mask_of(&[Flag::EditUnit, Flag::InviteMember]),
                ),
            ),
            (
                "the signer's own",
                row(&lena.member_id, permission::mask_of(&[Flag::EditUnit])),
            ),
            (
                "granting what it does not pin",
                WorkspaceOverrideRecord {
                    granted: permission::mask_of(&[Flag::EditUnit, Flag::ViewUnit]),
                    ..row(&sami.member_id, permission::mask_of(&[Flag::EditUnit]))
                },
            ),
        ];

        for (case, forged) in &beyond {
            let before = every_row(&store).await;
            let refused = store
                .write_workspace_override(&signer, forged)
                .await
                .expect_err(case);

            assert_eq!(reason_of(&refused), RefusalReason::RoleLacksAct, "{case}");
            assert_eq!(every_row(&store).await, before, "{case}: the store wrote");

            store
                .write_workspace_override_around_the_check(&signer, forged)
                .await
                .unwrap_or_else(|error| panic!("{case}: around the store: {error:?}"));

            let elsewhere = another_machine(&directory, &owner.organization_id).await;

            assert_eq!(
                workspace_override_of(
                    &elsewhere,
                    &owner.verifying_key,
                    &forged.member_id,
                    &workspace_id
                )
                .await,
                (0, 0),
                "{case}: another machine read it"
            );

            store
                .delete_workspace_override(&forged.member_id, &workspace_id)
                .await
                .expect("the row taken back");
        }

        // what the lead may write, written the same way, reads.
        let allowed = row(&sami.member_id, permission::mask_of(&[Flag::EditUnit]));

        store
            .write_workspace_override_around_the_check(&signer, &allowed)
            .await
            .expect("written around the store");

        let elsewhere = another_machine(&directory, &owner.organization_id).await;

        assert_eq!(
            workspace_override_of(
                &elsewhere,
                &owner.verifying_key,
                &sami.member_id,
                &workspace_id
            )
            .await,
            (allowed.pinned, allowed.granted)
        );
    }

    /// A workspace override a lead set is signed again with the rest of their rows when their
    /// certificate is issued again, so narrowing the lead in some other way leaves the member's
    /// override standing on every machine.
    #[tokio::test]
    async fn a_workspace_override_is_signed_again_when_its_signers_certificate_is() {
        let credentials = Memory::new();
        let directory = scratch("workspace-override-resigned");
        let (store, owner, link, workspace_id) = owned(&credentials, &directory).await;
        let lena = an_overrider(&store, &owner, &link, "lena", &workspace_id).await;
        let (sami, _) = a_member(
            &store,
            &owner,
            &link,
            "sami",
            permission::MEMBER,
            &workspace_id,
        )
        .await;
        let editing = permission::mask_of(&[Flag::EditUnit]);

        super::set_workspace_override(
            &store,
            &lena,
            &sami.member_id,
            &workspace_id,
            editing,
            editing,
        )
        .await
        .expect("the lead set it");

        let before = the_certificate(&store, &owner, &lena.member_id).await;

        set_override(
            &store,
            &owner,
            &lena.member_id,
            permission::mask_of(&[Flag::EditPayment]),
            NOW + 1,
        )
        .await
        .expect("the lead narrowed");

        assert_ne!(
            the_certificate(&store, &owner, &lena.member_id).await.id,
            before.id,
            "the lead's certificate was not issued again"
        );

        let elsewhere = another_machine(&directory, &owner.organization_id).await;

        assert_eq!(
            workspace_override_of(
                &elsewhere,
                &owner.verifying_key,
                &sami.member_id,
                &workspace_id
            )
            .await,
            (editing, editing),
            "the override did not follow its signer's certificate"
        );
    }

    /// **A reset unpins only what its actor holds** (review round one): a lead holding
    /// `overrideMember` resetting a member to their role is refused where the owner pinned a flag
    /// for them in a workspace the lead does not hold, and the pin stands; once what is pinned is
    /// a flag the lead holds, the reset goes through and takes it.
    #[tokio::test]
    async fn a_reset_that_would_unpin_a_flag_its_actor_does_not_hold_is_refused() {
        let credentials = Memory::new();
        let directory = scratch("workspace-override-reset-unheld");
        let (store, owner, link, workspace_id) = owned(&credentials, &directory).await;
        let lena = an_overrider(&store, &owner, &link, "lena", &workspace_id).await;
        let (sami, _) = a_member(
            &store,
            &owner,
            &link,
            "sami",
            permission::MEMBER,
            &workspace_id,
        )
        .await;

        deleting_units(&store, &owner, &sami.member_id, &workspace_id).await;

        let refused = set_override(&store, &lena, &sami.member_id, 0, NOW + 1)
            .await
            .expect_err("the lead unpinned a flag they do not hold");

        assert_eq!(
            reason_of(&refused),
            RefusalReason::RoleLacksAct,
            "{refused:?}"
        );
        assert!(a_row_stands(&store, &sami.member_id, &workspace_id).await);

        let editing = permission::mask_of(&[Flag::EditUnit]);

        super::set_workspace_override(&store, &owner, &sami.member_id, &workspace_id, editing, 0)
            .await
            .expect("the owner pinned editing units off");
        set_override(&store, &lena, &sami.member_id, 0, NOW + 2)
            .await
            .expect("the lead reset what they hold");

        assert!(!a_row_stands(&store, &sami.member_id, &workspace_id).await);
    }
}
