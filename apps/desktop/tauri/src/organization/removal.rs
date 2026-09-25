//! removing a member, at one of two speeds.
//!
//! **Ordinary removal stops renewing.** The member's grants are deleted and their row is signed
//! as removed; nothing is minted and nothing is rotated. The credential they hold goes on working
//! until it expires, which is within the four weeks every credential is minted for
//! (`workspace::WORKSPACE_CREDENTIAL_LIFETIME`), and the renewal that would have re-sealed a
//! fresh one to them finds no grant row and passes them by. Nobody else is disturbed: every other
//! member's row and grant is byte-identical afterwards, which a test asserts.
//!
//! **A lock-out rotates.** Turso revokes per database and totally: rotating a workspace's
//! credentials invalidates every credential ever minted for it, the removed member's and every
//! remaining member's alike. So a lock-out rotates each workspace the member held, mints fresh
//! credentials and re-seals them to every remaining grant, and says how many members will stop
//! syncing until their application collects theirs. The organization database is not rotated:
//! its rows are sealed and signed, the member's credential on it expires with the ordinary
//! lifetime, and it is what a remaining member reads the re-sealed grant from, so rotating it
//! would take away the very thing recovery needs. Recovery is `session::refresh_credentials`,
//! run by the shell when a sync is refused, and needs no human step.
//!
//! **Neither takes back what a machine already holds.** A replica on the removed member's disk
//! is theirs to read for as long as the disk exists; removal ends synchronisation and reaches
//! into nothing. A test pins that as behaviour, which is requirement 14's own instruction, so it
//! is not discovered later as a bug.
//!
//! **Removing the organization is here too, and it is the one act that deletes** (effort 828,
//! requirement 18). Every workspace database and then the organization's own directory go from
//! the owner's Turso account, under the third intent [[references/turso]]'s *Never run* admits,
//! and this machine forgets what it held. It is the owner's alone and it asks for their password
//! first, because a machine left unlocked must not be able to delete what it is signed in to; the
//! password is tried against the row's own vault, so a wrong one refuses before a single request
//! is made. The other machines find out at their next launch, which is `forget`'s own sign for a
//! database that is not on the platform any more.

use serde::{Deserialize, Serialize};

use crate::{
    diagnostics,
    error::{Error, RefusalReason},
    state::AppState,
    sync::turso::platform::{DeletionIntent, TursoPlatform},
};

use super::{
    forget,
    permission::{self, Flag},
    session::{MemberSession, actor, rank_of},
    store::{MemberRecord, OrganizationStore, Signer},
    vault::{open_content, open_vault},
    workspace::{renew_credentials, signer_of},
};

/// One workspace a lock-out would rotate, and how many other members hold it.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AffectedWorkspace {
    pub id: String,
    pub name: String,
    /// members other than the one being removed and the one removing, who will stop syncing.
    pub members: usize,
}

/// What a lock-out costs, said before it runs: which workspaces rotate, and how many members
/// stop syncing until their application reconnects.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LockOutCost {
    pub workspaces: Vec<AffectedWorkspace>,
    /// distinct members across every workspace above.
    pub members_affected: usize,
}

/// What a removal did.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Removed {
    pub member_id: String,
    pub locked_out: bool,
    /// the workspaces whose credentials were rotated. Empty on an ordinary removal.
    pub rotated_workspace_ids: Vec<String>,
    /// how many other members will stop syncing until their application collects a re-sealed
    /// credential. Zero on an ordinary removal.
    pub others_must_reconnect: usize,
}

/// What locking `member_id` out would cost. The same reading the lock-out makes, so the number
/// the interface states is the number the act uses.
pub async fn lock_out_cost(
    store: &OrganizationStore,
    session: &MemberSession,
    member_id: &str,
) -> Result<LockOutCost, Error> {
    let grants = store.grants(&session.verifying_key).await?;
    let workspaces = store.workspaces(&session.verifying_key).await?;
    let held: Vec<&str> = grants
        .iter()
        .filter(|grant| {
            grant.member_id == member_id && grant.workspace_id != session.organization_id
        })
        .map(|grant| grant.workspace_id.as_str())
        .collect();
    let mut affected = Vec::new();
    let mut everybody = std::collections::BTreeSet::new();

    for workspace in workspaces
        .iter()
        .filter(|workspace| held.contains(&workspace.id.as_str()))
    {
        let others: std::collections::BTreeSet<&str> = grants
            .iter()
            .filter(|grant| {
                grant.workspace_id == workspace.id
                    && grant.member_id != member_id
                    && grant.member_id != session.member_id
            })
            .map(|grant| grant.member_id.as_str())
            .collect();

        everybody.extend(others.iter().copied());
        affected.push(AffectedWorkspace {
            id: workspace.id.clone(),
            name: String::from_utf8(open_content(
                &session.content_key,
                "workspace.name_sealed",
                &workspace.name_sealed,
            )?)
            .map_err(|_| Error::Integrity {
                message: "workspace.name_sealed did not open as text".to_string(),
            })?,
            members: others.len(),
        });
    }

    // by name, which is the order the dialog lists them in and the order the rotation runs in;
    // the rows come back in whatever order the replica holds them.
    affected.sort_by(|a, b| a.name.cmp(&b.name));

    Ok(LockOutCost {
        workspaces: affected,
        members_affected: everybody.len(),
    })
}

/// Remove a member. `lock_out` false is the ordinary removal and the default the interface
/// offers; true is the destructive path, chosen rather than fallen into, and it is the owner's,
/// because rotating needs the platform authority only the owner's machine holds.
///
/// **The ordinary removal is not the owner's alone** (effort 838). It needs `removeMember`, a rank
/// above the member's role, and a certificate that outranks theirs, which is what revokes it; no
/// organization key is derived. The rows their certificate signed are re-signed under the
/// remover's before it is revoked, so a row the remover could not sign refuses the removal by name
/// with nothing written. Every gate reads the remover's verified row, the lock-out's owner check
/// included, and never the session's snapshot of the role.
pub async fn remove_member<P: TursoPlatform>(
    store: &OrganizationStore,
    session: &mut MemberSession,
    platform: Option<&P>,
    organization_database: &str,
    member_id: &str,
    lock_out: bool,
    now: i64,
) -> Result<Removed, Error> {
    session.settled()?;

    let actor = actor(store, session).await?;

    permission::require(actor.row.effective, Flag::RemoveMember)?;

    if member_id == session.member_id {
        return Err(Error::refused(
            RefusalReason::NotYourself,
            "you cannot remove yourself. another manager can",
        ));
    }

    let members = store.members(&session.verifying_key).await?;
    let member = members
        .iter()
        .find(|member| member.id == member_id)
        .ok_or_else(|| {
            Error::refused(
                RefusalReason::MemberMissing,
                "that member is not in this organization",
            )
        })?;

    if member.role_id == permission::OWNER {
        return Err(Error::refused(
            RefusalReason::OwnerProtected,
            "an owner is not removed. the organization is theirs",
        ));
    }

    if member.removed_at.is_some() {
        return Err(Error::refused(
            RefusalReason::MemberRemoved,
            "that member was already removed",
        ));
    }

    actor.outranks(
        rank_of(store, session, member).await?,
        "that member's role is not below yours, so they are removed by somebody who ranks above \
         them",
    )?;

    // the destructive path is refused before anything is written, on the two things it needs: the
    // owner, as the verified row says, and the authority on this machine.
    let platform = if lock_out {
        actor.require_owner(
            Flag::LockOut,
            RefusalReason::OwnerMachineOnly,
            "only an owner can lock a member out, because rotating a workspace's credentials \
             needs the turso authority. ask the owner, or remove them without the lock-out",
        )?;

        Some(platform.ok_or_else(|| {
            Error::refused(
                RefusalReason::OwnerMachineOnly,
                "locking a member out needs the turso authority, which this machine does not \
                      hold. remove them without the lock-out, or do it from the machine that \
                      connected the account",
            )
        })?)
    } else {
        None
    };

    let cost = lock_out_cost(store, session, member_id).await?;

    retire_member(store, session, member, now).await?;

    let mut removed = Removed {
        member_id: member_id.to_string(),
        locked_out: false,
        rotated_workspace_ids: Vec::new(),
        others_must_reconnect: 0,
    };

    if let Some(platform) = platform {
        let workspaces = store.workspaces(&session.verifying_key).await?;

        for affected in &cost.workspaces {
            let database = workspaces
                .iter()
                .find(|workspace| workspace.id == affected.id)
                .map(|workspace| workspace.database_name.clone())
                .ok_or_else(|| Error::Integrity {
                    message: "a workspace the member held is not in the organization".to_string(),
                })?;

            platform.rotate_credentials(&database).await?;
            removed.rotated_workspace_ids.push(affected.id.clone());

            diagnostics::info("organization.member.lockedOut")
                .with("member", member_id)
                .with("workspace", affected.id.as_str())
                .write();
        }

        // fresh credentials for everybody who remains, re-sealed to each; the owner's own move
        // with them in this process.
        renew_credentials(store, session, platform, organization_database).await?;

        removed.locked_out = true;
        removed.others_must_reconnect = cost.members_affected;
    }

    if !store.push().await {
        diagnostics::warn("organization.member.removalNotYetSent")
            .with("member", member_id)
            .write();
    }

    diagnostics::info("organization.member.removed")
        .with("member", member_id)
        .with("lockedOut", if lock_out { "true" } else { "false" })
        .write();

    Ok(removed)
}

/// What the owner is told when somebody else asks for the organization to be deleted.
pub const ONLY_THE_OWNER_DELETES: &str = "only the owner can delete the organization. it is \
     theirs, and the databases are on their turso account";

/// Delete the organization: every workspace database and then the organization's own directory,
/// on the owner's Turso account, and this machine's copy of all of it (effort 828, requirement
/// 18).
///
/// **The owner's alone, and their password is asked for first.** The role is read off the
/// session's verified row, never its snapshot, and the password is tried against that row's vault
/// the way `password::change_password` tries it, so a wrong one refuses before a single request is
/// made and a machine somebody walked away from is not a way to delete what it is signed in to.
/// Both refusals come before anything is touched.
///
/// **The workspaces go first and the directory last.** The names are read off the replica, which
/// is the only record of which databases belong to this organization; delete the directory first
/// and a request that then fails leaves ledgers on the account with nothing naming them. Each name
/// is checked to be a workspace's before it is sent, because the only databases this may reach are
/// this organization's own `org-` and `ws-` ones and the account may hold others that are the
/// human's.
///
/// **Then the machine forgets, exactly as a disconnect does**, through the one routine: signed
/// out, every replica swept, the record emptied and the Turso authority cleared. The consent goes
/// with it because the group holds no organization for it to be over any more. Every other machine
/// finds out at its next launch (`forget::forget_deleted_organization`).
///
/// The registry delete that routine makes first has nothing left to reach, since the database
/// holding the registry is one of the ones just deleted; it writes to the replica, fails to push
/// and says so in the diagnostics log, which is the same answer a disconnect with no connection
/// gets. Nothing turns on it: the rows went with the database.
///
/// **It is not recoverable and nothing here pretends otherwise.** The confirmation on the screen
/// says what goes, and this is the act that does it.
pub async fn delete_organization<P: TursoPlatform>(
    app_state: &AppState,
    platform: &P,
    password: &str,
) -> Result<(), Error> {
    let (organization_database, workspace_databases) = {
        let member = app_state.member.read().await;
        let organization = app_state.organization.read().await;
        let (Some(session), Some(store)) = (member.as_ref(), organization.as_ref()) else {
            return Err(Error::refused(
                RefusalReason::SignedOut,
                "nobody is signed in to an organization on this machine",
            ));
        };

        session.settled()?;

        // the owner as the verified row says: a founder's session open across a handover still
        // carries `owner` in its snapshot, and must not delete what is no longer theirs.
        let actor = actor(store, session).await?;

        actor.require_owner(
            Flag::DeleteOrganization,
            RefusalReason::OwnerOnly,
            ONLY_THE_OWNER_DELETES,
        )?;

        let row = &actor.row;

        // the password, tried against the row rather than trusted from the session: a wrong one
        // says only that the value did not open, and nothing has been asked of turso yet.
        let opened = open_vault(password, &row.vault)?;

        if opened.public_key() != session.secret.public_key() {
            return Err(Error::Integrity {
                message: "the vault the password opened is not the one this session holds"
                    .to_string(),
            });
        }

        let mut databases = Vec::new();

        for workspace in store.workspaces(&session.verifying_key).await? {
            if !workspace.database_name.starts_with("ws-") {
                return Err(Error::Integrity {
                    message: format!(
                        "a workspace of this organization names {}, which is not a workspace \
                         database. nothing was deleted",
                        workspace.database_name
                    ),
                });
            }

            databases.push(workspace.database_name);
        }

        (format!("org-{}", session.organization_id), databases)
    };

    for database in &workspace_databases {
        platform
            .delete_database(database, DeletionIntent::OrganizationDeletedByHuman)
            .await?;
    }

    platform
        .delete_database(
            &organization_database,
            DeletionIntent::OrganizationDeletedByHuman,
        )
        .await?;

    diagnostics::info("organization.deleted")
        .with("database", organization_database.as_str())
        .with("workspaces", workspace_databases.len().to_string())
        .write();

    forget::forget(app_state).await
}

/// The ordinary removal's writes, with nothing minted and nothing pushed: `member`'s grants go,
/// their row is signed as removed by `session`, and a certificate they held is revoked once the
/// rows it signed are re-signed under the remover. What [`remove_member`] does after its
/// refusals. *Revoking a never-accepted invitation took a pending account back through here too,
/// under effort 826's requirement 15, until effort 828 found nothing calling the revoke.*
pub(crate) async fn retire_member(
    store: &OrganizationStore,
    session: &MemberSession,
    member: &MemberRecord,
    now: i64,
) -> Result<(), Error> {
    let member_id = member.id.as_str();
    let (key, certificate) = signer_of(store, session).await?;
    let signer = Signer {
        key: &key,
        certificate: &certificate,
    };

    // end the removed member's authority first, so a removal that could not be completed changes
    // nothing. Every live certificate they hold has the rows it legitimately signed re-signed
    // under the remover, who outranks them, and a revocation written for it, so a row they newly
    // sign under it is refused on read (F2) and revoking it bricks nothing (`role::reissue`, the
    // routine reset shares). A row the remover's own certificate could not sign refuses the
    // removal by name (effort 838).
    super::role::reissue(store, session, &signer, member_id, None, now).await?;

    // the grants go, and the row is signed as removed by whoever removed them: a machine holding
    // a stale replica sees a verified removal rather than an unexplained absence.
    for grant in store
        .grants(&session.verifying_key)
        .await?
        .iter()
        .filter(|grant| grant.member_id == member_id)
    {
        store.delete_grant(member_id, &grant.workspace_id).await?;
    }

    // and an offer of the organization that stands with them goes with the row (effort 828,
    // requirement 22): the seal comes off the row that is being written back anyway, and the
    // succession row naming them is deleted, so nothing remains that a removed account could
    // accept with and the owner can offer the organization to somebody else without withdrawing
    // an offer from a person who is no longer here. `role::accept_ownership` refuses a removed row
    // by name as well, for the replica that has not pulled this yet.
    if let Some(offer) = super::role::standing_offer(store, &session.verifying_key)
        .await?
        .filter(|offer| offer.offered_member_id == member_id)
    {
        store.delete_succession(&offer.id).await?;
    }

    store
        .write_member(
            &signer,
            &MemberRecord {
                // a removed member keeps the member's role and nothing more, and says when they
                // went (effort 838).
                role_id: permission::MEMBER.to_string(),
                override_mask: 0,
                removed_at: Some(now),
                owner_seed_sealed: None,
                updated_at: now,
                ..member.clone()
            },
        )
        .await?;

    // every way in they still had, withdrawn with the role. A link is judged against the row
    // behind it and never against the member's standing, so an invitation or a machine link made
    // before the removal would go on connecting a machine and pulling a replica of the directory
    // after the person had been let go. The open rows go; a consumed one stays, as the record that
    // this account opened a link once.
    for stale in store
        .invitations(&session.verifying_key)
        .await?
        .into_iter()
        .filter(|invitation| invitation.member_id == member_id && invitation.consumed_at.is_none())
    {
        store.delete_invitation(&stale.id).await?;
    }

    store.delete_open_machine_links_of(member_id).await?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use serde_json::json;

    use super::{delete_organization, lock_out_cost, remove_member};
    use crate::{
        database::Database,
        error::Error,
        organization::{
            HeldOrganization,
            authority::Chain,
            invite::{
                AccountAndLink, Invitation, WorkspaceGrant, locator, make_account_and_link, members,
            },
            migrate::Pipeline,
            permission,
            session::{CredentialSlot, MemberSession, refresh_credentials, sign_in},
            setup::{CreateOrganization, Remote, create_organization},
            store::{OrganizationStore, TABLES},
            vault::KdfParams,
            workspace::create_workspace,
        },
        persisted::Persisted,
        settings::Settings,
        state::AppState,
        sync::{
            RemoteSync, RemoteSyncStore,
            test::server::{ScriptedResponse, ScriptedServer},
            turso::{
                consent::{TursoConsent, platform_token, store_platform_token},
                discovery::McpEndpoint,
                platform::{AccessLevel, DeletionIntent, InMemoryPlatform},
            },
        },
        update::Update,
    };

    const OWNER_PASSWORD: &str = "the owners password";
    const AT: i64 = 1_757_000_000_000;

    fn test_cost() -> KdfParams {
        KdfParams {
            memory_kib: 1024,
            iterations: 2,
            lanes: 1,
        }
    }

    fn scratch(name: &str) -> std::path::PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|elapsed| elapsed.as_nanos())
            .unwrap_or_default();
        let directory = std::env::temp_dir().join(format!("rentable-removal-{name}-{nanos:x}"));
        std::fs::create_dir_all(&directory).expect("scratch directory");

        directory
    }

    fn slot() -> CredentialSlot {
        Arc::new(Mutex::new(None))
    }
    /// No platform authority in hand, which is every session here but the owner's with one.
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
        crate::organization::invite::vault_password_of(
            &invited.join_link,
            &invited.code,
            test_cost(),
        )
    }

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
        }
    }

    /// Every row of every table but the removed member's own, their grants, and their
    /// certificates and the revocations of them, as bytes: what "disturbs nobody" is asserted
    /// over. A certificate is theirs where its id is one issued to them (`cert-<member>-...`).
    async fn everybody_elses_rows(
        store: &OrganizationStore,
        except: &str,
    ) -> Vec<(String, Vec<Option<Vec<u8>>>)> {
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

                let certificate_of_theirs = format!("cert-{except}-");
                let theirs = cells.iter().any(|cell| {
                    cell.as_deref() == Some(except.as_bytes())
                        || cell
                            .as_deref()
                            .is_some_and(|cell| cell.starts_with(certificate_of_theirs.as_bytes()))
                });

                if !theirs {
                    rows_out.push((table.to_string(), cells));
                }
            }
        }

        rows_out
    }

    struct Organization {
        store: OrganizationStore,
        platform: Arc<InMemoryPlatform>,
        owner: MemberSession,
        north: String,
        south: String,
        manager: (String, String),
        member: (String, String),
        database: String,
    }

    /// An organization with two workspaces, a manager holding North, and a member holding
    /// both. Everybody but the owner is on their generated password and has not signed in yet.
    async fn organization(directory: &std::path::Path) -> Organization {
        let mut machine = Persisted::<RemoteSyncStore>::load(directory.join("remote-sync.json"))
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
        let (created, store) = create_organization(
            &mut machine,
            "a-platform-token",
            &McpEndpoint::at(&mcp.url("")),
            |_| Arc::clone(&platform),
            Remote::none(),
            &directory.join("app.db"),
            CreateOrganization {
                name: "Acme",
                username: "olivia",
                password: OWNER_PASSWORD,
                group: None,
            },
            test_cost(),
            AT,
        )
        .await
        .expect("the first run failed");
        let joined = machine.organization.clone().expect("the record");
        let mut owner = sign_in(&store, &joined, OWNER_PASSWORD, &slot())
            .await
            .expect("the owner did not sign in");
        let pipeline = ScriptedServer::start(vec![
            ScriptedResponse::new(200, json!({ "results": [] }).to_string()),
            ScriptedResponse::new(200, json!({ "results": [] }).to_string()),
        ])
        .await;
        let north = create_workspace(
            &store,
            &mut owner,
            &platform,
            |_| Pipeline::at(&pipeline.url("")),
            "North",
            AT,
        )
        .await
        .expect("the first workspace");
        let south = create_workspace(
            &store,
            &mut owner,
            &platform,
            |_| Pipeline::at(&pipeline.url("")),
            "South",
            AT,
        )
        .await
        .expect("the second workspace");
        let link = locator(&store, &owner).await.expect("the link");
        let manager = make_account_and_link(
            &store,
            &owner,
            no_platform(),
            &link,
            Invitation {
                username: "ada.manager",
                role: permission::MANAGER,
                workspaces: &full(std::slice::from_ref(&north.id)),
            },
            test_cost(),
            AT,
        )
        .await
        .expect("the manager");
        let member = make_account_and_link(
            &store,
            &owner,
            no_platform(),
            &link,
            Invitation {
                username: "sami.staff",
                role: permission::MEMBER,
                workspaces: &full(&[north.id.clone(), south.id.clone()]),
            },
            test_cost(),
            AT,
        )
        .await
        .expect("the member");

        let manager = (manager.member_id.clone(), secret_of(&manager));
        let member = (member.member_id.clone(), secret_of(&member));

        Organization {
            store,
            platform,
            owner,
            north: north.id,
            south: south.id,
            manager,
            member,
            database: format!("org-{}", created.organization_id),
        }
    }

    /// An ordinary removal: the grants go, the row is signed as removed, the member signs in to
    /// nothing, and nobody else is disturbed: nothing is minted or rotated, every other row is
    /// byte-identical, and a remaining member who reads their grants again finds nothing moved.
    #[tokio::test]
    async fn an_ordinary_removal_stops_renewing_and_disturbs_nobody() {
        let directory = scratch("ordinary");
        let org = organization(&directory).await;
        let (member_id, member_password) = org.member.clone();
        let mut owner = org.owner;

        // the remaining manager, signed in before the removal, as their machine would be.
        let mut manager = sign_in(
            &org.store,
            &joined_as(&owner, &org.manager.0, permission::MANAGER),
            &org.manager.1,
            &slot(),
        )
        .await
        .expect("the manager did not sign in");
        let minted_before = org.platform.minted().len();
        let rows_before = everybody_elses_rows(&org.store, &member_id).await;

        let removed = remove_member::<InMemoryPlatform>(
            &org.store,
            &mut owner,
            None,
            &org.database,
            &member_id,
            false,
            AT + 1,
        )
        .await
        .expect("the removal failed");

        assert!(!removed.locked_out);
        assert!(removed.rotated_workspace_ids.is_empty());
        assert_eq!(removed.others_must_reconnect, 0);

        // nothing minted, nothing rotated.
        assert_eq!(org.platform.minted().len(), minted_before);
        assert!(org.platform.rotated().is_empty());

        // the row stays, verified, and says removed; the grants are gone; the dashboard does not
        // list them.
        let rows = org
            .store
            .members(&owner.verifying_key)
            .await
            .expect("the members verify");
        let row = rows
            .iter()
            .find(|row| row.id == member_id)
            .expect("the removed member's row is gone rather than marked");

        assert!(row.removed_at.is_some(), "the row does not say removed");
        assert_eq!(row.role_id, permission::MEMBER);
        assert_eq!(row.effective, permission::MEMBER_ROLE.mask);
        assert!(
            !org.store
                .grants(&owner.verifying_key)
                .await
                .expect("the grants")
                .iter()
                .any(|grant| grant.member_id == member_id)
        );
        assert!(
            !members(&org.store, &owner)
                .await
                .expect("the dashboard's list")
                .iter()
                .any(|listed| listed.id == member_id)
        );

        // and they sign in to nothing, told why.
        let refused = sign_in(
            &org.store,
            &joined_as(&owner, &member_id, permission::MEMBER),
            &member_password,
            &slot(),
        )
        .await;

        assert!(
            matches!(refused, Err(Error::Refused { reason: crate::error::RefusalReason::YouWereRemoved, ref message }) if message.contains("removed")),
            "{refused:?}"
        );

        // everybody else: byte-identical rows, and a credential that did not move.
        assert_eq!(
            everybody_elses_rows(&org.store, &member_id).await,
            rows_before,
            "an ordinary removal disturbed somebody else's row"
        );
        assert!(
            !refresh_credentials(&org.store, &mut manager)
                .await
                .expect("the refresh"),
            "the manager's credentials moved on an ordinary removal"
        );

        // a second removal of the same member is refused as already done.
        assert!(matches!(
            remove_member::<InMemoryPlatform>(
                &org.store,
                &mut owner,
                None,
                &org.database,
                &member_id,
                false,
                AT + 2
            )
            .await,
            Err(Error::Refused {
                reason: crate::error::RefusalReason::MemberRemoved,
                ..
            })
        ));
    }

    /// A lock-out: the workspaces the member held are rotated and the organization database is
    /// not; everybody remaining is re-sealed a fresh credential; the cost said beforehand is the
    /// cost paid; and a remaining member recovers by reading their grants again.
    #[tokio::test]
    async fn a_lock_out_rotates_the_workspaces_held_re_seals_everybody_else_and_says_the_cost() {
        let directory = scratch("lockout");
        let org = organization(&directory).await;
        let (member_id, _) = org.member.clone();
        let mut owner = org.owner;
        let mut manager = sign_in(
            &org.store,
            &joined_as(&owner, &org.manager.0, permission::MANAGER),
            &org.manager.1,
            &slot(),
        )
        .await
        .expect("the manager did not sign in");
        let held_before = manager.workspace_credentials[&org.north].token.clone();
        let owner_org_before = owner
            .organization_credential
            .lock()
            .expect("the slot")
            .clone();

        // said before it runs: two workspaces, and one other member (the manager, on North).
        let cost = lock_out_cost(&org.store, &owner, &member_id)
            .await
            .expect("the cost");

        assert_eq!(
            cost.workspaces
                .iter()
                .map(|workspace| (workspace.name.as_str(), workspace.members))
                .collect::<Vec<_>>(),
            vec![("North", 1), ("South", 0)]
        );
        assert_eq!(cost.members_affected, 1);

        let removed = remove_member(
            &org.store,
            &mut owner,
            Some(&org.platform),
            &org.database,
            &member_id,
            true,
            AT + 1,
        )
        .await
        .expect("the lock-out failed");

        assert!(removed.locked_out);
        assert_eq!(
            removed.rotated_workspace_ids,
            vec![org.north.clone(), org.south.clone()]
        );
        assert_eq!(removed.others_must_reconnect, 1);

        // the two workspace databases rotated, and the organization database not.
        let rotated = org.platform.rotated();

        assert_eq!(rotated.len(), 2);
        assert!(rotated.iter().all(|database| database.starts_with("ws-")));
        assert!(!rotated.contains(&org.database));

        // the manager's grant on North was re-sealed with a credential minted after the
        // rotation; they recover by reading their grants again, with no human step.
        assert!(
            refresh_credentials(&org.store, &mut manager)
                .await
                .expect("the refresh"),
            "the manager's credentials did not move"
        );

        let held_after = manager.workspace_credentials[&org.north].token.clone();

        assert_ne!(held_after, held_before);
        assert!(held_after.ends_with("-r1"), "{held_after}");
        assert!(
            !refresh_credentials(&org.store, &mut manager)
                .await
                .expect("the second refresh"),
            "a second read moved something"
        );

        // the owner's own moved with the rows, in this process.
        assert!(
            owner.workspace_credentials[&org.north]
                .token
                .ends_with("-r1")
        );
        assert!(
            owner.workspace_credentials[&org.south]
                .token
                .ends_with("-r1")
        );
        // the organization credential was minted again but not rotated: the old one still stands,
        // and the link's read-only one with it.
        assert!(
            !owner
                .organization_credential
                .lock()
                .expect("the slot")
                .as_deref()
                .unwrap_or_default()
                .ends_with("-r1")
        );
        assert!(owner_org_before.is_some());

        // and the removed member holds no grant to re-seal to.
        assert!(
            !org.store
                .grants(&owner.verifying_key)
                .await
                .expect("the grants")
                .iter()
                .any(|grant| grant.member_id == member_id)
        );
    }

    /// Requirement 14's limit, recorded as behaviour: the replica on the removed member's disk
    /// stays readable. Their machine's copy of the organization database, taken before the
    /// removal, still verifies and still says they are a member, because removal ends
    /// synchronisation and reaches into nothing.
    #[tokio::test]
    async fn removal_leaves_the_removed_members_local_replica_readable() {
        let directory = scratch("replica");
        let org = organization(&directory).await;
        let (member_id, member_password) = org.member.clone();
        let mut owner = org.owner;
        let their_machine = scratch("their-machine");

        // the member's machine: a copy of the replica as it stood before the removal.
        for entry in std::fs::read_dir(&directory).expect("the directory") {
            let path = entry.expect("an entry").path();
            let name = path
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or_default()
                .to_string();

            if name.starts_with("org-") {
                std::fs::copy(&path, their_machine.join(&name)).expect("the copy");
            }
        }

        remove_member::<InMemoryPlatform>(
            &org.store,
            &mut owner,
            None,
            &org.database,
            &member_id,
            false,
            AT + 1,
        )
        .await
        .expect("the removal failed");

        let theirs = OrganizationStore::open(
            &OrganizationStore::replica_path(&their_machine.join("app.db"), &owner.organization_id),
            None,
            || async { Err(turso::Error::Misuse("no remote".into())) },
        )
        .await
        .expect("their replica did not open");
        let session = sign_in(
            &theirs,
            &joined_as(&owner, &member_id, permission::MEMBER),
            &member_password,
            &slot(),
        )
        .await
        .expect("their replica no longer opens with their password");

        assert_eq!(session.role, permission::MEMBER);
        assert!(session.workspace_credentials.contains_key(&org.north));
        assert!(session.workspace_credentials.contains_key(&org.south));
        assert_eq!(
            theirs
                .members(&owner.verifying_key)
                .await
                .expect("their rows verify")
                .len(),
            3
        );
    }

    /// The refusals, each before anything is written: the owner is not removed, nobody removes
    /// themselves, a member removes nobody, and a lock-out is the owner's and needs the authority.
    #[tokio::test]
    async fn the_refusals_come_before_any_write() {
        let directory = scratch("refusals");
        let org = organization(&directory).await;
        let (member_id, _) = org.member.clone();
        let mut owner = org.owner;
        let rows_before = everybody_elses_rows(&org.store, "nobody").await;

        let owner_id = owner.member_id.clone();
        let mut manager = sign_in(
            &org.store,
            &joined_as(&owner, &org.manager.0, permission::MANAGER),
            &org.manager.1,
            &slot(),
        )
        .await
        .expect("the manager did not sign in");

        // an unsettled manager removes nobody.
        assert!(matches!(
            remove_member::<InMemoryPlatform>(
                &org.store,
                &mut manager,
                None,
                &org.database,
                &member_id,
                false,
                AT
            )
            .await,
            Err(Error::Refused {
                reason: crate::error::RefusalReason::PasswordChangeRequired,
                ..
            })
        ));
        manager.must_change_password = false;

        assert!(
            matches!(
                remove_member::<InMemoryPlatform>(
                    &org.store,
                    &mut manager,
                    None,
                    &org.database,
                    &owner_id,
                    false,
                    AT
                )
                .await,
                Err(Error::Refused {
                    reason: crate::error::RefusalReason::OwnerProtected,
                    ..
                })
            ),
            "the owner was removed"
        );
        assert!(
            matches!(
                remove_member::<InMemoryPlatform>(
                    &org.store,
                    &mut owner,
                    None,
                    &org.database,
                    &owner_id,
                    false,
                    AT
                )
                .await,
                Err(Error::Refused {
                    reason: crate::error::RefusalReason::NotYourself,
                    ..
                })
            ),
            "the owner removed themselves"
        );

        // a lock-out by a manager is refused by name, and by an owner without the
        // authority too.
        let by_manager = remove_member(
            &org.store,
            &mut manager,
            Some(&org.platform),
            &org.database,
            &member_id,
            true,
            AT,
        )
        .await;

        assert!(
            matches!(by_manager, Err(Error::Refused { reason: crate::error::RefusalReason::OwnerMachineOnly, ref message }) if message.contains("ask the owner")),
            "{by_manager:?}"
        );

        let without_authority = remove_member::<InMemoryPlatform>(
            &org.store,
            &mut owner,
            None,
            &org.database,
            &member_id,
            true,
            AT,
        )
        .await;

        assert!(
            matches!(
                without_authority,
                Err(Error::Refused {
                    reason: crate::error::RefusalReason::OwnerMachineOnly,
                    ..
                })
            ),
            "{without_authority:?}"
        );

        // a member removes nobody.
        let mut member = sign_in(
            &org.store,
            &joined_as(&owner, &member_id, permission::MEMBER),
            &org.member.1,
            &slot(),
        )
        .await
        .expect("the member did not sign in");
        member.must_change_password = false;

        assert!(matches!(
            remove_member::<InMemoryPlatform>(
                &org.store,
                &mut member,
                None,
                &org.database,
                &org.manager.0,
                false,
                AT
            )
            .await,
            Err(Error::Refused {
                reason: crate::error::RefusalReason::RoleLacksAct,
                ..
            })
        ));

        assert_eq!(
            everybody_elses_rows(&org.store, "nobody").await,
            rows_before,
            "a refusal wrote something"
        );
        assert!(org.platform.rotated().is_empty());
    }

    /// Requirement 5 of effort 826, and criterion 5: locking a member out is the owner's, and no
    /// permission grants it. A manager carrying **every** flag but the owner's is refused with the
    /// sentence naming the owner, and nothing is rotated.
    ///
    /// **The permissions are asserted first**, so that the refusal is read as the owner check
    /// answering rather than as a bit the manager happened not to hold. The refusal itself is
    /// also reached by `the_refusals_come_before_any_write` above, among everything else a removal
    /// turns away; this is the one that says what it is about.
    ///
    /// **And the owner is who the verified row says** (effort 838): the manager's session is told
    /// it is the owner's, the way a founder's session open across a handover still says so, and
    /// the lock-out is refused all the same, because the gate reads the row.
    #[tokio::test]
    async fn a_manager_holding_every_flag_but_the_owners_is_refused_a_lock_out() {
        let directory = scratch("lock-out-authority");
        let org = organization(&directory).await;
        let (member_id, _) = org.member.clone();
        let mut manager = sign_in(
            &org.store,
            &joined_as(&org.owner, &org.manager.0, permission::MANAGER),
            &org.manager.1,
            &slot(),
        )
        .await
        .expect("the manager did not sign in");
        manager.must_change_password = false;

        assert_eq!(
            manager.permissions,
            permission::MANAGER_ROLE.mask,
            "the manager does not carry every flag but the owner's"
        );

        // the snapshot says owner; the row does not.
        manager.role = permission::OWNER.to_string();

        let refusal = remove_member(
            &org.store,
            &mut manager,
            Some(&org.platform),
            &org.database,
            &member_id,
            true,
            AT,
        )
        .await
        .expect_err("a manager locked a member out");

        assert!(
            matches!(refusal, Error::Refused { reason: crate::error::RefusalReason::OwnerMachineOnly, ref message } if message.contains("only an owner")
                && message.contains("ask the owner")),
            "{refusal:?}"
        );
        assert!(org.platform.rotated().is_empty(), "a workspace was rotated");

        // the ordinary removal is theirs, which is what makes the refusal above about the
        // authority rather than about removal.
        remove_member::<InMemoryPlatform>(
            &org.store,
            &mut manager,
            None,
            &org.database,
            &member_id,
            false,
            AT,
        )
        .await
        .expect("a manager could not remove a member");
    }

    /// Criterion 2, and the ticket's own: **removing a manager ends their authority.** The
    /// manager has signed real rows; after an ordinary removal their certificate is revoked,
    /// the rows it signed are re-signed under the remover so nothing legitimate is bricked, and a
    /// row the removed manager newly signs under their revoked certificate is refused by
    /// every other client on read.
    #[tokio::test]
    async fn removing_a_manager_revokes_their_certificate_and_re_signs_what_they_signed() {
        use crate::organization::{
            authority::AdministratorKey,
            setup::ADMINISTRATOR_KEY_PURPOSE,
            store::{MemberRecord, Signer},
        };

        let directory = scratch("manager-removal");
        let org = organization(&directory).await;
        let mut owner = org.owner;
        let (manager_id, manager_password) = org.manager.clone();

        // the manager settles and signs real rows: they invite a member into North, which
        // they hold, so their certificate signs a member row, grants and an invitation.
        let mut ada = sign_in(
            &org.store,
            &joined_as(&owner, &manager_id, permission::MANAGER),
            &manager_password,
            &slot(),
        )
        .await
        .expect("the manager did not sign in");
        ada.must_change_password = false;

        let link = locator(&org.store, &ada).await.expect("the link");
        let bob = make_account_and_link(
            &org.store,
            &ada,
            no_platform(),
            &link,
            Invitation {
                username: "bob",
                role: permission::MEMBER,
                workspaces: &full(std::slice::from_ref(&org.north)),
            },
            test_cost(),
            AT,
        )
        .await
        .expect("bob");

        let ada_cert_id = org
            .store
            .live_certificates(&owner.verifying_key, &manager_id)
            .await
            .expect("the certificates")
            .pop()
            .expect("the manager's certificate")
            .id;

        // everything reads while the certificate stands.
        assert!(org.store.members(&owner.verifying_key).await.is_ok());
        assert!(org.store.grants(&owner.verifying_key).await.is_ok());
        assert!(org.store.invitations(&owner.verifying_key).await.is_ok());

        remove_member::<InMemoryPlatform>(
            &org.store,
            &mut owner,
            None,
            &org.database,
            &manager_id,
            false,
            AT + 1,
        )
        .await
        .expect("the removal failed");

        // their certificate is revoked (F2): still there, and named by a revocation that counts.
        let (certificates, revocations) = org.store.chain_rows().await.expect("the chain");

        let ada_cert = certificates
            .iter()
            .find(|certificate| certificate.id == ada_cert_id)
            .cloned()
            .expect("the certificate is gone rather than revoked");

        assert!(
            Chain::new(&owner.verifying_key, &certificates, &revocations)
                .live(&ada_cert_id)
                .is_err(),
            "the removed manager's certificate was not revoked"
        );

        // nothing they legitimately signed is bricked (F3): every read stands, and the member they
        // invited still signs in and holds North.
        assert!(
            org.store.members(&owner.verifying_key).await.is_ok(),
            "removing a manager bricked the members read"
        );
        assert!(org.store.grants(&owner.verifying_key).await.is_ok());
        assert!(org.store.invitations(&owner.verifying_key).await.is_ok());

        let bob_session = sign_in(
            &org.store,
            &joined_as(&owner, &bob.member_id, permission::MEMBER),
            &secret_of(&bob),
            &slot(),
        )
        .await
        .expect("bob no longer signs in after the manager who invited him was removed");

        assert!(bob_session.workspace_credentials.contains_key(&org.north));

        // a row the removed manager newly signs under their revoked certificate is refused:
        // they re-promote themselves to owner, and every other client refuses the read by name.
        let ada_key = AdministratorKey::from_bytes(
            &ada.secret
                .derive_seed(ADMINISTRATOR_KEY_PURPOSE)
                .expect("a seed"),
        );
        let ada_row = org
            .store
            .members(&owner.verifying_key)
            .await
            .expect("the members")
            .into_iter()
            .find(|member| member.id == manager_id)
            .expect("the manager's row");

        org.store
            .write_member(
                &Signer {
                    key: &ada_key,
                    certificate: &ada_cert,
                },
                &MemberRecord {
                    role_id: permission::OWNER.to_string(),
                    override_mask: 0,
                    ..ada_row
                },
            )
            .await
            .expect("the hostile write");

        let refusal = org
            .store
            .members(&owner.verifying_key)
            .await
            .expect_err("a self-promotion under a revoked certificate was accepted");

        assert!(refusal.to_string().contains("revoked"), "{refusal}");
        assert!(refusal.to_string().contains(&manager_id), "{refusal}");
    }

    /// The whole of the application state over one data directory, as `lib.rs` builds it, with the
    /// replica and the session handed in: what a machine standing on the organization page looks
    /// like from inside. `remote-sync.json` is loaded from the directory, so the organization the
    /// fixture created is already recorded there.
    async fn machine_holding(
        directory: &std::path::Path,
        store: OrganizationStore,
        session: MemberSession,
    ) -> AppState {
        let mut settings =
            Persisted::<Settings>::load(directory.join(Settings::FILENAME)).expect("the settings");
        settings.database_path = directory.join(Database::FILENAME);
        settings.recovery_path = directory.join(Update::FILENAME);
        settings.commit().expect("the settings");

        let settings = Arc::new(tokio::sync::RwLock::new(settings));
        let remote_sync = RemoteSync::new(settings.clone(), directory.join(RemoteSync::FILENAME))
            .await
            .expect("the sync record");
        let update = Update::new(settings.clone()).await.expect("the update");

        AppState {
            db: Arc::new(tokio::sync::RwLock::new(Database::new(settings.clone()))),
            settings,
            remote_sync: Arc::new(tokio::sync::RwLock::new(remote_sync)),
            update: Arc::new(tokio::sync::RwLock::new(update)),
            consent: Arc::new(TursoConsent::new()),
            organization: Arc::new(tokio::sync::RwLock::new(Some(store))),
            member: Arc::new(tokio::sync::RwLock::new(Some(session))),
            arriving_link: Arc::new(Mutex::new(None)),
            signed_out_elsewhere: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            old_shape_check: tokio::sync::OnceCell::new(),
        }
    }

    /// Every replica file under the directory, sorted: what a machine still holds.
    fn replica_files(directory: &std::path::Path) -> Vec<String> {
        let mut names: Vec<String> = std::fs::read_dir(directory)
            .expect("the directory")
            .flatten()
            .map(|entry| entry.file_name().to_string_lossy().into_owned())
            .filter(|name| {
                (name.starts_with("org-") || name.starts_with("ws-")) && name.contains(".db")
            })
            .collect();

        names.sort();

        names
    }

    /// Criterion 18, the owner's half: **the two workspace databases go, then the organization's
    /// own directory, each under the intent that names the act**, and the machine is left holding
    /// nothing at all.
    ///
    /// The order is asserted rather than the set, because it is the order that matters: the
    /// directory is the only record of which databases are this organization's, so a run that
    /// removed it first and then failed would leave ledgers on the account with nothing naming
    /// them.
    #[tokio::test]
    async fn the_owner_deletes_every_workspace_then_the_organization_and_keeps_nothing() {
        let _turn = crate::keyring::take_the_credential_store().await;
        let directory = scratch("delete");
        let org = organization(&directory).await;
        let platform = Arc::clone(&org.platform);
        let database = org.database.clone();
        let north = org.north.clone();
        let south = org.south.clone();

        store_platform_token("a-platform-token").expect("the authority");

        let held_before: Vec<String> = platform
            .databases()
            .into_iter()
            .map(|database| database.name)
            .collect();

        assert!(held_before.contains(&database), "{held_before:?}");

        let app_state = machine_holding(&directory, org.store, org.owner).await;

        assert!(
            replica_files(&directory)
                .iter()
                .any(|name| name.starts_with("org-")),
            "no replica to forget"
        );

        delete_organization(&app_state, platform.as_ref(), OWNER_PASSWORD)
            .await
            .expect("the delete failed");

        let deleted = platform.deleted();

        assert!(
            deleted
                .iter()
                .all(|(_, intent)| *intent == DeletionIntent::OrganizationDeletedByHuman),
            "{deleted:?}"
        );

        // the two workspaces first, in whatever order the replica lists them, and the directory
        // last: it is the only record of which databases are this organization's.
        let mut workspaces: Vec<&str> =
            deleted[..2].iter().map(|(name, _)| name.as_str()).collect();
        let mut expected = vec![format!("ws-{north}"), format!("ws-{south}")];

        workspaces.sort_unstable();
        expected.sort_unstable();

        assert_eq!(workspaces, expected, "{deleted:?}");
        assert_eq!(deleted.len(), 3, "{deleted:?}");
        assert_eq!(deleted[2].0, database, "{deleted:?}");
        assert_eq!(
            platform.databases(),
            Vec::new(),
            "a database of this organization is still on the account"
        );

        // and the machine holds nothing: no replica, no record, nobody signed in, no authority.
        assert_eq!(replica_files(&directory), Vec::<String>::new());
        assert!(app_state.member.read().await.is_none());
        assert!(app_state.organization.read().await.is_none());
        assert_eq!(
            app_state.remote_sync.write().await.store_mut().organization,
            None
        );
        assert_eq!(
            app_state
                .remote_sync
                .write()
                .await
                .store_mut()
                .turso_organization,
            None
        );
        assert!(
            platform_token().is_err(),
            "the consent survived the delete, with no organization left for it to be over"
        );
    }

    /// Criterion 18, the two refusals: **a manager is refused, and so is a wrong password**,
    /// and neither reaches Turso. The manager carries every grantable act, so what turns them
    /// away is the owner check rather than a bit they happened not to hold.
    #[tokio::test]
    async fn a_manager_and_a_wrong_password_are_each_refused_before_anything_is_deleted() {
        let _turn = crate::keyring::take_the_credential_store().await;
        let directory = scratch("delete-refused");
        let org = organization(&directory).await;
        let platform = Arc::clone(&org.platform);
        let owner = org.owner;
        let mut manager = sign_in(
            &org.store,
            &joined_as(&owner, &org.manager.0, permission::MANAGER),
            &org.manager.1,
            &slot(),
        )
        .await
        .expect("the manager did not sign in");

        // as though they had settled on a password of their own, so what turns them away below is
        // the owner check rather than the one every fresh account meets first; and told, in the
        // session's snapshot, that they are the owner, which the check does not read (effort 838).
        manager.must_change_password = false;
        manager.role = permission::OWNER.to_string();

        assert_eq!(
            manager.permissions,
            permission::MANAGER_ROLE.mask,
            "the manager does not carry every flag but the owner's"
        );

        let managers_password = org.manager.1.clone();
        let held_before = platform.databases();
        let app_state = machine_holding(&directory, org.store, manager).await;

        let refused = delete_organization(&app_state, platform.as_ref(), &managers_password)
            .await
            .expect_err("a manager deleted the organization");

        assert!(
            matches!(refused, Error::Refused { reason: crate::error::RefusalReason::OwnerOnly, ref message } if message.contains("only the owner")),
            "{refused:?}"
        );

        // the owner, with a password that is not theirs: refused on the vault, and still nothing
        // has been asked of turso.
        *app_state.member.write().await = None;

        let owner_again = sign_in(
            app_state
                .organization
                .read()
                .await
                .as_ref()
                .expect("the replica"),
            &joined_as(&owner, &owner.member_id, permission::OWNER),
            OWNER_PASSWORD,
            &slot(),
        )
        .await
        .expect("the owner did not sign in");

        *app_state.member.write().await = Some(owner_again);

        let wrong = delete_organization(&app_state, platform.as_ref(), "not the owners password")
            .await
            .expect_err("a wrong password deleted the organization");

        // the vault's one sentence, which says nothing about which of the ways it could fail this
        // was: a wrong password is not told apart from anything else here.
        assert!(
            matches!(wrong, Error::Integrity { ref message } if message.contains("did not open")),
            "{wrong:?}"
        );

        assert_eq!(platform.deleted(), Vec::new(), "something was deleted");
        assert_eq!(platform.databases(), held_before);
        assert!(
            app_state.organization.read().await.is_some(),
            "a refused delete let go of the replica"
        );
        assert!(
            replica_files(&directory)
                .iter()
                .any(|name| name.starts_with("org-")),
            "a refused delete swept the replicas"
        );
    }

    /// Live, at the human's request, and admitted in [[rules/testing]] under *Tests that reach a
    /// live remote*: **both speeds of removal, on Turso's own refusal**. A database is provisioned
    /// through the port and two credentials minted for it, the removed member's and a remaining
    /// member's; after the ordinary removal nothing is rotated and both still push, which is
    /// "every remaining member's sync is unbroken"; after the lock-out the removed member's push is
    /// refused by Turso, the remaining member's old credential is refused too, and a fresh one
    /// minted for them lands, which is the re-sealed grant their application collects. The
    /// database is deleted by the same run.
    ///
    /// ```text
    /// RENTABLE_LIVE_TURSO=1 TURSO_CONSENT_TOKEN=… TURSO_ORG=… TURSO_GROUP=… \
    ///   cargo test --manifest-path ./apps/desktop/tauri/Cargo.toml \
    ///   removal_live -- --test-threads=1 --ignored --nocapture
    /// ```
    #[tokio::test]
    #[ignore = "reaches a live Turso account and creates a database; see the doc comment"]
    async fn removal_live_an_ordinary_removal_breaks_nobody_and_a_lock_out_is_refused_by_turso() {
        use crate::{
            organization::workspace::MIGRATION_CREDENTIAL_LIFETIME,
            sync::turso::{
                consent::store_platform_token,
                discovery::TursoOrganization,
                platform::{
                    AccessLevel, DeletionIntent, PlatformApi, PlatformEndpoint, TursoPlatform,
                },
            },
        };

        let read = |name: &str| {
            std::env::var(name)
                .ok()
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| {
                    panic!("{name} is needed for a live run; see the doc comment above")
                })
        };

        assert_eq!(
            read("RENTABLE_LIVE_TURSO"),
            "1",
            "a live run is armed by RENTABLE_LIVE_TURSO=1 as well as by --ignored"
        );
        store_platform_token(&read("TURSO_CONSENT_TOKEN")).expect("failed to file the token");

        let platform = PlatformApi::new(
            PlatformEndpoint::production(),
            TursoOrganization {
                slug: read("TURSO_ORG"),
                group: read("TURSO_GROUP"),
            },
        );
        let nonce = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|elapsed| elapsed.as_nanos())
            .unwrap_or_default();
        let name = format!("t819-15-{nonce:x}");
        let database = platform
            .create_database(&name)
            .await
            .expect("the live create failed");

        eprintln!("created {name} at {}", database.hostname);

        let migration = platform
            .mint_token(
                &name,
                MIGRATION_CREDENTIAL_LIFETIME,
                AccessLevel::FullAccess,
            )
            .await
            .expect("the migration mint failed");

        crate::organization::migrate::apply(
            &Pipeline::of(&database.hostname),
            &migration,
            crate::organization::migrate::shipped_version() as usize,
        )
        .await
        .expect("the live migration failed");

        let mint = |what: &'static str| {
            let platform = &platform;
            let name = name.clone();

            async move {
                platform
                    .mint_token(&name, "1h", AccessLevel::FullAccess)
                    .await
                    .unwrap_or_else(|error| panic!("the {what} mint failed: {error:?}"))
            }
        };
        let removed_member = mint("removed member's").await;
        let remaining_member = mint("remaining member's").await;
        let remote = format!("libsql://{}", database.hostname);
        let directory = scratch("live");

        // one replica per credential, each pushing one row under it.
        let push_as = |replica: &'static str, token: String, row: &'static str| {
            let path = directory.join(format!("{replica}.db"));
            let remote = remote.clone();

            async move {
                let engine =
                    crate::database::Database::open_replica(&path, Some(remote), move || {
                        let token = token.clone();
                        async move { Ok::<String, turso::Error>(token) }
                    })
                    .await
                    .expect("the replica");

                // a pull first, so a fresh replica has the schema; a refused pull is not the
                // question here and the push that follows is what answers it.
                let _ = engine.pull().await;

                let connection = engine.connect().await.expect("a connection");

                connection
                    .execute(
                        "INSERT INTO complex (id, name, location) VALUES (?, ?, ?)",
                        vec![
                            turso::Value::Text(format!("c-{replica}-{row}")),
                            turso::Value::Text(format!("Live Tower {replica} {row}")),
                            turso::Value::Text("nowhere".to_string()),
                        ],
                    )
                    .await
                    .expect("the local write");

                engine.push().await
            }
        };

        // before anything: both credentials land.
        assert!(
            push_as("removed", removed_member.clone(), "before")
                .await
                .is_ok()
        );
        assert!(
            push_as("remaining", remaining_member.clone(), "before")
                .await
                .is_ok()
        );

        // the ordinary removal: nothing is rotated, so nothing minted before it stops working.
        // The removed member's credential goes on until its expiry, and the remaining member's
        // sync is unbroken.
        let after_ordinary = push_as("remaining", remaining_member.clone(), "after-ordinary").await;

        eprintln!("remaining member after an ordinary removal: {after_ordinary:?}");
        assert!(
            after_ordinary.is_ok(),
            "an ordinary removal broke a remaining member's sync"
        );

        // the lock-out: rotate, and Turso refuses everything minted before.
        platform
            .rotate_credentials(&name)
            .await
            .expect("the live rotation failed");

        let removed_after = push_as("removed", removed_member, "after-lockout").await;

        eprintln!("removed member after the lock-out: {removed_after:?}");
        assert!(
            removed_after.is_err(),
            "turso accepted the removed member's credential after the lock-out"
        );

        let remaining_stale = push_as("remaining", remaining_member, "after-lockout-stale").await;

        eprintln!("remaining member on the old credential: {remaining_stale:?}");
        assert!(
            remaining_stale.is_err(),
            "turso revokes per database and totally, and the remaining member's old credential \
             should have gone with the removed member's"
        );

        // the remaining member's recovery: the fresh credential the owner minted and re-sealed,
        // collected from the organization database, lands.
        let fresh = mint("fresh").await;
        let remaining_fresh = push_as("remaining-fresh", fresh, "after-lockout-fresh").await;

        eprintln!("remaining member on the fresh credential: {remaining_fresh:?}");
        assert!(
            remaining_fresh.is_ok(),
            "turso refused the credential minted after the rotation"
        );

        platform
            .delete_database(&name, DeletionIntent::CreatedAndUnreferenced)
            .await
            .expect("the live delete failed, and the database is left behind");

        eprintln!("removed {name}");
    }

    /// An account `maker` makes in `role_id` with `override_mask`, its first link opened the way a
    /// test opens one, and the member signed in on it and settled.
    async fn signed_in_account(
        org: &Organization,
        maker: &MemberSession,
        username: &str,
        role_id: &str,
        override_mask: i64,
        workspaces: &[WorkspaceGrant],
    ) -> MemberSession {
        let account = crate::organization::invite::create_account(
            &org.store,
            maker,
            no_platform(),
            username,
            role_id,
            override_mask,
            workspaces,
            test_cost(),
            AT,
        )
        .await
        .expect("the account");
        let link = locator(&org.store, maker).await.expect("the link");
        let made = crate::organization::invite::make_link(
            &org.store,
            maker,
            no_platform(),
            &link,
            &account.id,
            test_cost(),
            AT,
        )
        .await
        .expect("the link could not be made");
        let password =
            crate::organization::invite::vault_password_of(&made.link, &made.code, test_cost());
        let mut session = sign_in(
            &org.store,
            &joined_as(maker, &account.id, role_id),
            &password,
            &slot(),
        )
        .await
        .expect("the account did not sign in");

        session.must_change_password = false;

        session
    }

    /// The manager of the fixture, signed in and settled.
    async fn the_manager(org: &Organization) -> MemberSession {
        let mut manager = sign_in(
            &org.store,
            &joined_as(&org.owner, &org.manager.0, permission::MANAGER),
            &org.manager.1,
            &slot(),
        )
        .await
        .expect("the manager did not sign in");

        manager.must_change_password = false;

        manager
    }

    /// A member widened with `grantWorkspace` who has granted North to a colleague, so their
    /// certificate signed a row: what the two tests below remove.
    async fn a_granter_and_the_row_they_signed(
        org: &Organization,
    ) -> (MemberSession, MemberSession) {
        let granter = signed_in_account(
            org,
            &org.owner,
            "gina.staff",
            permission::MEMBER,
            permission::mask_of(&[permission::Flag::GrantWorkspace]),
            &full(std::slice::from_ref(&org.north)),
        )
        .await;
        let colleague =
            signed_in_account(org, &org.owner, "bob.staff", permission::MEMBER, 0, &[]).await;

        crate::organization::workspace::grant_workspace::<InMemoryPlatform>(
            &org.store,
            &granter,
            None,
            &org.north,
            &colleague.member_id,
            AccessLevel::FullAccess,
        )
        .await
        .expect("the widened member could not grant the workspace");

        (granter, colleague)
    }

    /// Effort 838, criterion 9 at the removal: **a manager removes a member with no organization
    /// key in reach; what the member signs afterwards is refused, and what they signed before still
    /// verifies.**
    ///
    /// The member was widened with `grantWorkspace` and granted North to a colleague. The manager's
    /// removal re-signs that grant under the manager's certificate and revokes the member's, so the
    /// colleague still reads the grants and still opens North; a grant the removed member then
    /// signs under their revoked certificate, straight into the database, refuses the read by
    /// name on every machine.
    #[tokio::test]
    async fn a_manager_removes_a_member_and_what_they_sign_afterwards_is_refused() {
        use crate::organization::{
            authority::AdministratorKey,
            setup::ADMINISTRATOR_KEY_PURPOSE,
            store::{GrantRecord, Signer},
        };

        let directory = scratch("manager-removes");
        let org = organization(&directory).await;
        let (granter, colleague) = a_granter_and_the_row_they_signed(&org).await;
        let mut manager = the_manager(&org).await;
        let pinned = org.owner.verifying_key;

        assert!(
            crate::organization::role::organization_key_of(&manager).is_err(),
            "a manager's vault derives the organization key"
        );

        let departing = org
            .store
            .live_certificates(&pinned, &granter.member_id)
            .await
            .expect("the certificates")
            .pop()
            .expect("the member's certificate");

        remove_member::<InMemoryPlatform>(
            &org.store,
            &mut manager,
            None,
            &org.database,
            &granter.member_id,
            false,
            AT + 1,
        )
        .await
        .expect("a manager could not remove a member");

        // what they signed before verifies, and the colleague still opens North.
        org.store
            .grants(&pinned)
            .await
            .expect("a row the removed member signed before no longer verifies");

        let mut colleague = colleague;

        refresh_credentials(&org.store, &mut colleague)
            .await
            .expect("the colleague could not read their grants again");

        assert!(colleague.workspace_credentials.contains_key(&org.north));
        assert!(
            org.store
                .grants(&pinned)
                .await
                .expect("the grants")
                .iter()
                .any(|grant| grant.member_id == colleague.member_id
                    && grant.workspace_id == org.north),
            "the colleague's grant went with the member who signed it"
        );
        assert!(
            org.store
                .live_certificates(&pinned, &granter.member_id)
                .await
                .expect("the certificates")
                .is_empty(),
            "the removed member still holds a live certificate"
        );

        // and what they sign afterwards, under the certificate they held, is refused.
        let key = AdministratorKey::from_bytes(
            &granter
                .secret
                .derive_seed(ADMINISTRATOR_KEY_PURPOSE)
                .expect("a seed"),
        );

        org.store
            .write_grant(
                &Signer {
                    key: &key,
                    certificate: &departing,
                },
                &GrantRecord {
                    member_id: colleague.member_id.clone(),
                    workspace_id: org.south.clone(),
                    sealed_credential: vec![7; 48],
                    access_level: AccessLevel::FullAccess.as_str().to_string(),
                    credential_expires_at: None,
                },
            )
            .await
            .expect("the hostile write");

        let refusal = org
            .store
            .grants(&pinned)
            .await
            .expect_err("a grant signed under a removed member's certificate was accepted");

        assert!(refusal.to_string().contains("revoked"), "{refusal}");
    }

    /// Effort 838, the plan's *Architecture*: **a removal whose departing certificate signed a row
    /// the remover cannot sign again is refused, naming the flag, and nothing is written.**
    ///
    /// The remover is a manager whose override takes `grantWorkspace` away; the member being
    /// removed granted North to a colleague. Re-signing that grant is `grantWorkspace`'s, and
    /// deleting it instead would take the colleague's access away, so the removal stops before a
    /// row moves and the member's certificate stays live.
    #[tokio::test]
    async fn a_removal_is_refused_where_the_departing_certificate_signed_a_row_the_remover_cannot_sign()
     {
        let directory = scratch("remover-lacks");
        let org = organization(&directory).await;
        let (granter, _) = a_granter_and_the_row_they_signed(&org).await;
        let mut remover = signed_in_account(
            &org,
            &org.owner,
            "rami.manager",
            permission::MANAGER,
            permission::mask_of(&[permission::Flag::GrantWorkspace]),
            &[],
        )
        .await;
        let rows_before = everybody_elses_rows(&org.store, "nobody").await;

        let refusal = remove_member::<InMemoryPlatform>(
            &org.store,
            &mut remover,
            None,
            &org.database,
            &granter.member_id,
            false,
            AT + 1,
        )
        .await
        .expect_err("a manager without grantWorkspace removed a member who signed a grant");

        assert!(
            matches!(
                &refusal,
                Error::Refused {
                    reason: crate::error::RefusalReason::RoleLacksAct,
                    message,
                } if message.contains("grantWorkspace")
            ),
            "{refusal:?}"
        );
        assert_eq!(
            everybody_elses_rows(&org.store, "nobody").await,
            rows_before,
            "a refused removal wrote something"
        );
        assert_eq!(
            org.store
                .live_certificates(&org.owner.verifying_key, &granter.member_id)
                .await
                .expect("the certificates")
                .len(),
            1,
            "a refused removal revoked the member's certificate"
        );
    }

    /// Effort 838, requirement 7 at the removal: **a member is removed only from above.** A manager
    /// removing another manager is refused by rank, and nothing is written.
    #[tokio::test]
    async fn a_manager_is_not_removed_by_another_manager() {
        let directory = scratch("same-rank");
        let org = organization(&directory).await;
        let mut other =
            signed_in_account(&org, &org.owner, "bea.manager", permission::MANAGER, 0, &[]).await;
        let rows_before = everybody_elses_rows(&org.store, "nobody").await;

        let refusal = remove_member::<InMemoryPlatform>(
            &org.store,
            &mut other,
            None,
            &org.database,
            &org.manager.0,
            false,
            AT + 1,
        )
        .await
        .expect_err("a manager removed a manager");

        assert!(
            matches!(
                refusal,
                Error::Refused {
                    reason: crate::error::RefusalReason::RankNotAbove,
                    ..
                }
            ),
            "{refusal:?}"
        );
        assert_eq!(
            everybody_elses_rows(&org.store, "nobody").await,
            rows_before
        );
    }
}
