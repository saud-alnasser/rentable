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
    error::Error,
    state::AppState,
    sync::turso::platform::{DeletionIntent, TursoPlatform},
};

use super::{
    forget,
    permission::{self, Administration},
    session::{MemberSession, permissions_on_row},
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
    permission::require(
        permissions_on_row(store, session).await?,
        Administration::RemoveMember,
    )?;

    if member_id == session.member_id {
        return Err(Error::Forbidden {
            message: "you cannot remove yourself. another administrator can".to_string(),
        });
    }

    let members = store.members(&session.verifying_key).await?;
    let member = members
        .iter()
        .find(|member| member.id == member_id)
        .ok_or_else(|| Error::NotFound {
            message: "that member is not in this organization".to_string(),
        })?;

    if member.role == permission::OWNER {
        return Err(Error::Forbidden {
            message: "an owner is not removed. the organization is theirs".to_string(),
        });
    }

    if member.role == permission::REMOVED {
        return Err(Error::PreconditionFailed {
            message: "that member was already removed".to_string(),
        });
    }

    // the destructive path is refused before anything is written, on the two things it needs.
    let platform = if lock_out {
        if session.role != permission::OWNER {
            return Err(Error::Forbidden {
                message: "only an owner can lock a member out, because rotating a workspace's \
                          credentials needs the turso authority. ask the owner, or remove them \
                          without the lock-out"
                    .to_string(),
            });
        }

        Some(platform.ok_or_else(|| {
            Error::Forbidden {
                message:
                    "locking a member out needs the turso authority, which this machine does not \
                      hold. remove them without the lock-out, or do it from the machine that \
                      connected the account"
                        .to_string(),
            }
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
/// **The owner's alone, and their password is asked for first.** The role is read off the session
/// the wall opened, and the password is tried against the member row's own vault the way
/// `password::change_password` tries it, so a wrong one refuses before a single request is made
/// and a machine somebody walked away from is not a way to delete what it is signed in to. Both
/// refusals come before anything is touched.
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
            return Err(Error::PreconditionFailed {
                message: "nobody is signed in to an organization on this machine".to_string(),
            });
        };

        session.settled()?;

        if session.role != permission::OWNER {
            return Err(Error::Forbidden {
                message: ONLY_THE_OWNER_DELETES.to_string(),
            });
        }

        let members = store.members(&session.verifying_key).await?;
        let row = members
            .iter()
            .find(|row| row.id == session.member_id)
            .ok_or_else(|| Error::NotFound {
                message: "this member's row is not in the organization any more".to_string(),
            })?;

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

    store
        .write_member(
            &signer,
            &MemberRecord {
                role: permission::REMOVED.to_string(),
                permissions: 0,
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

    // end a removed administrator's authority. A member has no certificate and this does nothing;
    // an administrator's certificate is written back revoked, so a row they newly sign under it is
    // refused on read (F2, the half this ticket closes). But first the rows it legitimately signed
    // are re-signed under the remover, who holds authority over them, so revoking it bricks nothing
    // (`store::re_sign_rows_of_certificate`, the routine reset shares).
    if let Some(their_certificate) =
        store.certificates().await?.into_iter().find(|certificate| {
            certificate.member_id == member_id && certificate.revoked_at.is_none()
        })
    {
        store
            .re_sign_rows_of_certificate(&session.verifying_key, &their_certificate.id, &signer)
            .await?;
        store
            .write_certificate(&their_certificate.revoked(&now.to_string()))
            .await?;
    }

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

    /// Every row of every table but the removed member's own and their grants, as bytes: what
    /// "disturbs nobody" is asserted over.
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

                let theirs = cells
                    .iter()
                    .any(|cell| cell.as_deref() == Some(except.as_bytes()));

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
        administrator: (String, String),
        member: (String, String),
        database: String,
    }

    /// An organization with two workspaces, an administrator holding North, and a member holding
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
        let administrator = make_account_and_link(
            &store,
            &owner,
            no_platform(),
            &link,
            Invitation {
                username: "ada.admin",
                role: permission::ADMINISTRATOR,
                workspaces: &full(std::slice::from_ref(&north.id)),
            },
            test_cost(),
            AT,
        )
        .await
        .expect("the administrator");
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

        let administrator = (
            administrator.member_id.clone(),
            secret_of(&administrator),
        );
        let member = (
            member.member_id.clone(),
            secret_of(&member),
        );

        Organization {
            store,
            platform,
            owner,
            north: north.id,
            south: south.id,
            administrator,
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

        // the remaining administrator, signed in before the removal, as their machine would be.
        let mut administrator = sign_in(
            &org.store,
            &joined_as(&owner, &org.administrator.0, permission::ADMINISTRATOR),
            &org.administrator.1,
            &slot(),
        )
        .await
        .expect("the administrator did not sign in");
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

        assert_eq!(row.role, permission::REMOVED);
        assert_eq!(row.permissions, 0);
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
            matches!(refused, Err(Error::Forbidden { ref message }) if message.contains("removed")),
            "{refused:?}"
        );

        // everybody else: byte-identical rows, and a credential that did not move.
        assert_eq!(
            everybody_elses_rows(&org.store, &member_id).await,
            rows_before,
            "an ordinary removal disturbed somebody else's row"
        );
        assert!(
            !refresh_credentials(&org.store, &mut administrator)
                .await
                .expect("the refresh"),
            "the administrator's credentials moved on an ordinary removal"
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
            Err(Error::PreconditionFailed { .. })
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
        let mut administrator = sign_in(
            &org.store,
            &joined_as(&owner, &org.administrator.0, permission::ADMINISTRATOR),
            &org.administrator.1,
            &slot(),
        )
        .await
        .expect("the administrator did not sign in");
        let held_before = administrator.workspace_credentials[&org.north]
            .token
            .clone();
        let owner_org_before = owner
            .organization_credential
            .lock()
            .expect("the slot")
            .clone();

        // said before it runs: two workspaces, and one other member (the administrator, on North).
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

        // the administrator's grant on North was re-sealed with a credential minted after the
        // rotation; they recover by reading their grants again, with no human step.
        assert!(
            refresh_credentials(&org.store, &mut administrator)
                .await
                .expect("the refresh"),
            "the administrator's credentials did not move"
        );

        let held_after = administrator.workspace_credentials[&org.north]
            .token
            .clone();

        assert_ne!(held_after, held_before);
        assert!(held_after.ends_with("-r1"), "{held_after}");
        assert!(
            !refresh_credentials(&org.store, &mut administrator)
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
        let mut administrator = sign_in(
            &org.store,
            &joined_as(&owner, &org.administrator.0, permission::ADMINISTRATOR),
            &org.administrator.1,
            &slot(),
        )
        .await
        .expect("the administrator did not sign in");

        // an unsettled administrator removes nobody.
        assert!(matches!(
            remove_member::<InMemoryPlatform>(
                &org.store,
                &mut administrator,
                None,
                &org.database,
                &member_id,
                false,
                AT
            )
            .await,
            Err(Error::PreconditionFailed { .. })
        ));
        administrator.must_change_password = false;

        assert!(
            matches!(
                remove_member::<InMemoryPlatform>(
                    &org.store,
                    &mut administrator,
                    None,
                    &org.database,
                    &owner_id,
                    false,
                    AT
                )
                .await,
                Err(Error::Forbidden { .. })
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
                Err(Error::Forbidden { .. })
            ),
            "the owner removed themselves"
        );

        // a lock-out by an administrator is refused by name, and by an owner without the
        // authority too.
        let by_administrator = remove_member(
            &org.store,
            &mut administrator,
            Some(&org.platform),
            &org.database,
            &member_id,
            true,
            AT,
        )
        .await;

        assert!(
            matches!(by_administrator, Err(Error::Forbidden { ref message }) if message.contains("ask the owner")),
            "{by_administrator:?}"
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
            matches!(without_authority, Err(Error::Forbidden { .. })),
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
                &org.administrator.0,
                false,
                AT
            )
            .await,
            Err(Error::Forbidden { .. })
        ));

        assert_eq!(
            everybody_elses_rows(&org.store, "nobody").await,
            rows_before,
            "a refusal wrote something"
        );
        assert!(org.platform.rotated().is_empty());
    }

    /// Requirement 5 of effort 826, and criterion 5: locking a member out is the owner's, and no
    /// permission grants it. An administrator carrying **every** one of the seven grantable acts is
    /// refused with the sentence naming the owner, and nothing is rotated.
    ///
    /// **The permissions are asserted first**, so that the refusal is read as the owner check
    /// answering rather than as a bit the administrator happened not to hold. The refusal itself is
    /// also reached by `the_refusals_come_before_any_write` above, among everything else a removal
    /// turns away; this is the one that says what it is about.
    #[tokio::test]
    async fn an_administrator_holding_all_seven_acts_is_refused_a_lock_out() {
        let directory = scratch("lock-out-authority");
        let org = organization(&directory).await;
        let (member_id, _) = org.member.clone();
        let mut administrator = sign_in(
            &org.store,
            &joined_as(&org.owner, &org.administrator.0, permission::ADMINISTRATOR),
            &org.administrator.1,
            &slot(),
        )
        .await
        .expect("the administrator did not sign in");
        administrator.must_change_password = false;

        assert_eq!(
            administrator.permissions, 0b111_1111,
            "the administrator does not carry all seven acts"
        );
        for act in permission::Administration::ALL {
            assert!(
                permission::permits(administrator.permissions, act),
                "{}",
                act.name()
            );
        }

        let refusal = remove_member(
            &org.store,
            &mut administrator,
            Some(&org.platform),
            &org.database,
            &member_id,
            true,
            AT,
        )
        .await
        .expect_err("an administrator locked a member out");

        assert!(
            matches!(refusal, Error::Forbidden { ref message } if message.contains("only an owner")
                && message.contains("ask the owner")),
            "{refusal:?}"
        );
        assert!(org.platform.rotated().is_empty(), "a workspace was rotated");

        // the ordinary removal is theirs, which is what makes the refusal above about the
        // authority rather than about removal.
        remove_member::<InMemoryPlatform>(
            &org.store,
            &mut administrator,
            None,
            &org.database,
            &member_id,
            false,
            AT,
        )
        .await
        .expect("an administrator could not remove a member");
    }

    /// Criterion 2, and the ticket's own: **removing an administrator ends their authority.** The
    /// administrator has signed real rows; after an ordinary removal their certificate is revoked,
    /// the rows it signed are re-signed under the remover so nothing legitimate is bricked, and a
    /// row the removed administrator newly signs under their revoked certificate is refused by
    /// every other client on read.
    #[tokio::test]
    async fn removing_an_administrator_revokes_their_certificate_and_re_signs_what_they_signed() {
        use crate::organization::{
            authority::AdministratorKey,
            setup::ADMINISTRATOR_KEY_PURPOSE,
            store::{MemberRecord, Signer},
        };

        let directory = scratch("admin-removal");
        let org = organization(&directory).await;
        let mut owner = org.owner;
        let (admin_id, admin_password) = org.administrator.clone();

        // the administrator settles and signs real rows: they invite a member into North, which
        // they hold, so their certificate signs a member row, grants and an invitation.
        let mut ada = sign_in(
            &org.store,
            &joined_as(&owner, &admin_id, permission::ADMINISTRATOR),
            &admin_password,
            &slot(),
        )
        .await
        .expect("the administrator did not sign in");
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
            .certificates()
            .await
            .expect("the certificates")
            .into_iter()
            .find(|certificate| certificate.member_id == admin_id)
            .expect("the administrator's certificate")
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
            &admin_id,
            false,
            AT + 1,
        )
        .await
        .expect("the removal failed");

        // their certificate is revoked (F2).
        let ada_cert = org
            .store
            .certificates()
            .await
            .expect("the certificates")
            .into_iter()
            .find(|certificate| certificate.id == ada_cert_id)
            .expect("the certificate is gone rather than revoked");

        assert!(
            ada_cert.revoked_at.is_some(),
            "the removed administrator's certificate was not revoked"
        );

        // nothing they legitimately signed is bricked (F3): every read stands, and the member they
        // invited still signs in and holds North.
        assert!(
            org.store.members(&owner.verifying_key).await.is_ok(),
            "removing an administrator bricked the members read"
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
        .expect("bob no longer signs in after the administrator who invited him was removed");

        assert!(bob_session.workspace_credentials.contains_key(&org.north));

        // a row the removed administrator newly signs under their revoked certificate is refused:
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
            .find(|member| member.id == admin_id)
            .expect("the administrator's row");

        org.store
            .write_member(
                &Signer {
                    key: &ada_key,
                    certificate: &ada_cert,
                },
                &MemberRecord {
                    role: permission::OWNER.to_string(),
                    permissions: 63,
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
        assert!(refusal.to_string().contains(&admin_id), "{refusal}");
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

    /// Criterion 18, the two refusals: **an administrator is refused, and so is a wrong password**,
    /// and neither reaches Turso. The administrator carries every grantable act, so what turns them
    /// away is the owner check rather than a bit they happened not to hold.
    #[tokio::test]
    async fn an_administrator_and_a_wrong_password_are_each_refused_before_anything_is_deleted() {
        let _turn = crate::keyring::take_the_credential_store().await;
        let directory = scratch("delete-refused");
        let org = organization(&directory).await;
        let platform = Arc::clone(&org.platform);
        let owner = org.owner;
        let mut administrator = sign_in(
            &org.store,
            &joined_as(&owner, &org.administrator.0, permission::ADMINISTRATOR),
            &org.administrator.1,
            &slot(),
        )
        .await
        .expect("the administrator did not sign in");

        // as though they had settled on a password of their own, so what turns them away below is
        // the owner check rather than the one every fresh account meets first.
        administrator.must_change_password = false;

        assert_eq!(
            administrator.permissions, 0b111_1111,
            "the administrator does not carry all seven acts"
        );

        let administrators_password = org.administrator.1.clone();
        let held_before = platform.databases();
        let app_state = machine_holding(&directory, org.store, administrator).await;

        let refused = delete_organization(&app_state, platform.as_ref(), &administrators_password)
            .await
            .expect_err("an administrator deleted the organization");

        assert!(
            matches!(refused, Error::Forbidden { ref message } if message.contains("only the owner")),
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
}
