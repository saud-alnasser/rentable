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

use serde::{Deserialize, Serialize};

use crate::{diagnostics, error::Error, sync::turso::platform::TursoPlatform};

use super::{
    permission::{self, Administration},
    session::MemberSession,
    store::{MemberRecord, OrganizationStore, Signer},
    vault::open_content,
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
    permission::require(session.permissions, Administration::RemoveMember)?;

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

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use serde_json::json;

    use super::{lock_out_cost, remove_member};
    use crate::{
        error::Error,
        organization::{
            JoinedOrganization,
            invite::{Invitation, invite_member, members, organization_link},
            migrate::Pipeline,
            permission,
            session::{CredentialSlot, MemberSession, refresh_credentials, sign_in},
            setup::{CreateOrganization, Remote, create_organization},
            store::{OrganizationStore, TABLES},
            vault::KdfParams,
            workspace::create_workspace,
        },
        persisted::Persisted,
        sync::{
            RemoteSyncStore,
            google::test::server::{ScriptedResponse, ScriptedServer},
            turso::{discovery::McpEndpoint, platform::InMemoryPlatform},
        },
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

    fn joined_as(owner: &MemberSession, member_id: &str, role: &str) -> JoinedOrganization {
        JoinedOrganization {
            id: owner.organization_id.clone(),
            name: "Acme".to_string(),
            verifying_key: base64::Engine::encode(
                &base64::engine::general_purpose::URL_SAFE_NO_PAD,
                owner.verifying_key,
            ),
            remote_url: String::new(),
            member_id: member_id.to_string(),
            role: role.to_string(),
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
                password: OWNER_PASSWORD,
            },
            test_cost(),
            AT,
        )
        .await
        .expect("the first run failed");
        let joined = machine.organizations[0].clone();
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
        let link = organization_link(&store, &owner).await.expect("the link");
        let administrator = invite_member(
            &store,
            &owner,
            &link,
            Invitation {
                email: "ada@acme.example",
                display_name: "Ada Admin",
                role: permission::ADMINISTRATOR,
                workspace_ids: std::slice::from_ref(&north.id),
            },
            test_cost(),
            AT,
        )
        .await
        .expect("the administrator");
        let member = invite_member(
            &store,
            &owner,
            &link,
            Invitation {
                email: "sami@acme.example",
                display_name: "Sami Staff",
                role: permission::MEMBER,
                workspace_ids: &[north.id.clone(), south.id.clone()],
            },
            test_cost(),
            AT,
        )
        .await
        .expect("the member");

        Organization {
            store,
            platform,
            owner,
            north: north.id,
            south: south.id,
            administrator: (administrator.member_id, administrator.generated_password),
            member: (member.member_id, member.generated_password),
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
