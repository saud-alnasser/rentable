//! the opening of this machine's workspace database, as whatever it should be for the member who
//! is in: at startup, from the `startup` plugin's bootstrap, and again the moment a workspace is
//! opened ([`open_database`]).
//!
//! **Here, in the organization, because the answer is the member's**: whether they hold a grant on
//! the workspace this machine has open, and the credential their vault unsealed for it. The
//! diagnostics it writes keep the `startup.` names they had when the startup held it.

use crate::{clock::Clock, diagnostics, error::Error, machine::LocalReplica, organization::Shared};

/// Where the current workspace stands for the member who is in.
enum WorkspaceStanding {
    /// a credential is in hand, from the member's vault, at the remote the signed row names.
    Held(String),
    /// the member's vault holds no grant on the workspace this machine has open: their grant
    /// was removed, or the workspace was, and the replica is a copy of a ledger this machine has
    /// no right to any more.
    GrantEnded,
    /// nobody is signed in, or nothing is open yet.
    Nothing,
}

/// Open this machine's database as whatever it should be right now.
///
/// **Called at startup and again the moment a workspace is opened**, because those are the two
/// points at which the answer changes. A machine nobody is signed in on has no workspace, so the
/// first call opens a plain file; opening one from the organization is what gives it a replica,
/// and without a second call the replica would not arrive until the next launch.
///
/// **The credential is what the member's vault unsealed**, held for the replica by
/// `organization_workspace_open`, and the remote is on the signed row; nothing is minted and
/// nothing is asked of anybody. A grant that is gone is the organization's answer that this machine
/// should not be holding that replica any more, and the replica goes with it.
///
/// **Whatever is held is let go of first, and that is the one-file rule rather than tidiness.**
/// `sqlx` and `turso` are in disjoint locking domains (`database/mod.rs` has the detail), so a
/// pool left open on the file the replica is about to take would be a second writer nothing
/// reports. Taking the engine out before building the next one is what makes the swap safe.
pub(crate) async fn open_database(app_state: &Shared, clock: &dyn Clock) -> Option<Error> {
    // **What this machine is holding, reconciled against what is on disk.** The tracked list is how
    // a later launch knows a replica exists at all; an entry whose file somebody deleted by hand
    // would otherwise sit there forever, and a machine that could not say what it holds cannot be
    // asked to stop holding it.
    forget_replicas_no_longer_on_disk(app_state).await;

    let standing = organization_standing(app_state).await;

    let workspace = {
        let remote_sync = app_state.remote_sync.read().await;
        let workspace = remote_sync.workspace();

        workspace
            .remote_id
            .clone()
            .map(|id| (id, workspace.remote_url))
    };

    if matches!(standing, WorkspaceStanding::GrantEnded)
        && let Some((workspace_id, _)) = workspace.as_ref()
    {
        // let go of first, as the rule above says, and here it is the file about to be deleted:
        // an engine still open on it keeps the handle, the delete of the main file fails on
        // Windows, and what is left is part of a ledger this machine has no right to, untracked.
        {
            let mut db = app_state.db.write().await;

            db.disconnect().await;
        }

        release_replica(app_state, workspace_id).await;

        // **The machine has to end up somewhere a person can act from**, and an empty database is
        // not it: `connect()` opens a file with no schema, the first reconcile throws, and every
        // later launch repeats the whole thing because nothing cleared the workspace it was refused
        // from. So the workspace goes, which leaves the member with the workspaces they still hold,
        // or with nowhere to go, which is a state the shell draws.
        {
            let mut remote_sync = app_state.remote_sync.write().await;

            if let Err(error) = remote_sync.forget_remote_workspace() {
                diagnostics::error("startup.replica.notForgotten")
                    .with("error", error.to_string())
                    .write();
            }
        }

        let mut db = app_state.db.write().await;

        db.disconnect().await;

        return db.connect().await.err();
    }

    let remote_url = match standing {
        WorkspaceStanding::Held(url) => Some(url),
        // **Nobody in, or nothing open, falls back to the url this machine already recorded**,
        // rather than to the plain-file arm where one is recorded. Opening `sqlx` on the file the
        // replica owns is two engines over one file, which `database/mod.rs` says nothing reports
        // until the corruption does.
        _ => workspace.as_ref().and_then(|(_, url)| url.clone()),
    };

    let mut db = app_state.db.write().await;

    // **Whatever is held is let go of first, and that is the one-file rule rather than tidiness.**
    // `sqlx` and `turso` are in disjoint locking domains, so a pool left open on a file the replica
    // is about to take would be a second writer nothing reports.
    db.disconnect().await;

    let Some((workspace_id, _)) = workspace else {
        return db.connect().await.err();
    };

    let remote_sync = app_state.remote_sync.clone();

    if let Err(error) = db
        .connect_workspace(&workspace_id, remote_url, move || {
            let remote_sync = remote_sync.clone();

            // Resolved before every request rather than captured once, so a credential collected
            // again after a lock-out reaches the next request without the replica being rebuilt.
            async move {
                remote_sync.read().await.workspace_token().ok_or_else(|| {
                    turso::Error::Error("this machine holds no workspace credential".to_string())
                })
            }
        })
        .await
    {
        return Some(error);
    }

    // Every *other* replica this machine holds, asked the same question. The current one was just
    // answered above.
    release_replicas_grant_ended(app_state, Some(&workspace_id)).await;

    // **Tracked from the moment it exists**, so that a later launch knows this machine is holding a
    // workspace for a member and whose it is. Nothing else records it: the workspace record says
    // which workspace is *current*, and a machine can hold replicas for members nobody is signed
    // in as.
    {
        let member = app_state
            .member
            .read()
            .await
            .as_ref()
            .map(|member| (member.member_id.clone(), member.organization_id.clone()));
        let mut remote_sync = app_state.remote_sync.write().await;

        if let Some((member_id, organization_id)) = member
            && let Err(error) = remote_sync.remember_replica(
                &workspace_id,
                &member_id,
                &organization_id,
                clock.now(),
            )
        {
            diagnostics::error("startup.replica.notTracked")
                .with("error", error.to_string())
                .write();
        }
    }

    // **The schema arrives as replicated pages, so a replica that has never pulled has no tables**:
    // `turso_cdc` and its kin and nothing else. Everything the application does next reads
    // `contract`, `unit` and `payment`, so a first run that skipped this would sign in and then
    // fail on the next statement.
    //
    // **The pull is best-effort and the readiness check is what decides.** A replica that has
    // pulled before is usable whether or not this one succeeded, which is requirement 7; one that
    // never has is not usable at all, and requirement 3 already says a first run needs a network.
    // `is_ready` was written for this and had no caller until now.
    //
    // **A pull that the remote answered is a replication that went through**, and it is the
    // first one of a session, so the standing block reads its moment before the heartbeat has
    // run (effort 828, requirement 25).
    if db.pull_replica().await.completed {
        crate::machine::note_reached(&app_state.remote_sync, clock).await;
    }

    if !db.is_ready().await {
        return Some(Error::Network {
            message: "this workspace has not reached this machine yet. connect to the network and \
                      try again"
                .to_string(),
        });
    }

    None
}

/// Let go of a replica this machine may no longer hold.
///
/// **Membership is what kept it, and membership has ended.** Until then a replica is kept
/// indefinitely: not deleted on sign-out and not on a timer, because somebody who signs out is
/// usually about to sign back in and a re-pull of a whole workspace is a cost nobody asked for.
/// What this answers is the other case: the account this machine held it for is no longer a member
/// of that workspace, so the file is a copy of a ledger nobody here has a right to.
///
/// *Directed by the human 2026-08-20.* Requirement 14's organization work is where membership
/// starts ending routinely; today it ends only where an operator ends it.
async fn release_replica(app_state: &Shared, workspace_id: &str) {
    let database_path = { app_state.settings.read().await.database_path.clone() };

    if crate::database::Database::remove_replica(&database_path, workspace_id) {
        diagnostics::info("startup.replica.released")
            .with("workspace", workspace_id)
            .write();
    }

    // **Forgotten whether or not a file was there.** A replica somebody deleted by hand is still
    // one this machine has stopped holding, and an entry nothing could clear would have every
    // launch looking for it forever.
    let mut remote_sync = app_state.remote_sync.write().await;

    if let Err(error) = remote_sync.forget_replica(workspace_id) {
        diagnostics::error("startup.replica.notForgotten")
            .with("error", error.to_string())
            .write();
    }
}

/// Ask, for every replica this machine holds, whether it is still allowed to hold it.
///
/// **This is the check over the tracked list**, and it is separate from the current workspace's
/// because that one is answered on the way in. What this covers is the rest: a machine that has
/// held workspaces for more than one member, or one whose current workspace is not the only
/// replica on disk.
///
/// **A replica held for somebody else is left alone**, which is most of them after a sign-out:
/// only the member whose vault is open can be asked what they hold, and a question that cannot be
/// put is not an answer that the grant ended. A replica this member held and holds no grant on
/// any more goes. **So is a replica of another organization**, which the member's vault cannot
/// answer for either (effort 851, requirement 5).
async fn release_replicas_grant_ended(app_state: &Shared, current: Option<&str>) {
    let held = { app_state.remote_sync.read().await.local_replicas() };
    let (member, granted): (Option<(String, String)>, Vec<String>) = {
        let member = app_state.member.read().await;

        match member.as_ref() {
            Some(member) => (
                Some((member.member_id.clone(), member.organization_id.clone())),
                member.workspace_credentials.keys().cloned().collect(),
            ),
            None => (None, Vec::new()),
        }
    };
    let Some((member_id, organization_id)) = member else {
        return;
    };

    for replica in held {
        if current == Some(replica.workspace_id.as_str())
            || replica.member_id != member_id
            || of_another_organization(&replica, &organization_id)
        {
            continue;
        }

        if !granted.contains(&replica.workspace_id) {
            release_replica(app_state, &replica.workspace_id).await;
        }
    }
}

/// Drop tracked replicas whose files are gone.
///
/// **This deletes nothing.** It is the other direction: a file somebody removed by hand, or a
/// workspace released on an earlier launch that failed to write the store, leaves an entry naming
/// a replica this machine does not have. Membership is what removes a replica; this only stops the
/// list claiming ones that are not there.
async fn forget_replicas_no_longer_on_disk(app_state: &Shared) {
    let held = { app_state.remote_sync.read().await.local_replicas() };

    if held.is_empty() {
        return;
    }

    let database_path = { app_state.settings.read().await.database_path.clone() };

    let missing: Vec<String> = held
        .into_iter()
        .filter(|replica| {
            !crate::database::Database::replica_path(&database_path, &replica.workspace_id).exists()
        })
        .map(|replica| replica.workspace_id)
        .collect();

    if missing.is_empty() {
        return;
    }

    let mut remote_sync = app_state.remote_sync.write().await;

    for workspace_id in &missing {
        if let Err(error) = remote_sync.forget_replica(workspace_id) {
            diagnostics::error("startup.replica.notForgotten")
                .with("error", error.to_string())
                .write();
        }
    }
}

/// Where the current workspace stands for the member who is in: held, with the credential their
/// vault unsealed handed to the replica; ended, where they hold no grant on it any more; or
/// nothing, where nobody is in or nothing is open.
async fn organization_standing(app_state: &Shared) -> WorkspaceStanding {
    let member = app_state.member.read().await;
    let Some(member) = member.as_ref() else {
        return WorkspaceStanding::Nothing;
    };
    let mut remote_sync = app_state.remote_sync.write().await;
    let workspace = remote_sync.workspace();
    let Some(remote_id) = workspace.remote_id.as_deref() else {
        return WorkspaceStanding::Nothing;
    };

    // **a workspace of another organization is not this member's to judge** (effort 851, the
    // plan's *The machine's record holds a list*): their vault holds no grant on it because it is
    // not of their organization, not because a grant ended, and reading that as an end would
    // delete the other organization's replica.
    if remote_sync.local_replicas().iter().any(|replica| {
        replica.workspace_id == remote_id
            && of_another_organization(replica, &member.organization_id)
    }) {
        return WorkspaceStanding::Nothing;
    }

    let Some(held) = member.workspace_credentials.get(remote_id) else {
        return WorkspaceStanding::GrantEnded;
    };
    let Some(url) = workspace.remote_url.clone() else {
        return WorkspaceStanding::Nothing;
    };

    remote_sync.hold_organization_workspace_token(&held.token);

    WorkspaceStanding::Held(url)
}

/// whether a replica entry names an organization other than `organization_id`. An entry naming
/// none is one an earlier build tracked, which the record's load gives the one organization it
/// held, so it is nobody else's.
fn of_another_organization(replica: &LocalReplica, organization_id: &str) -> bool {
    !replica.organization_id.is_empty() && replica.organization_id != organization_id
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use serde_json::json;
    use tokio::sync::RwLock;

    use super::open_database;
    use crate::test::scratch;
    use crate::{
        credential::Memory,
        database::Database,
        machine::{RemoteSync, RemoteSyncStore},
        organization::Shared,
        organization::{
            HeldOrganization,
            member::vault::KdfParams,
            session::{CredentialSlot, sign_in},
            setup::{CreateOrganization, Remote, create_organization},
            store::OrganizationStore,
        },
        persisted::Persisted,
        settings::Settings,
        sync::test::server::{ScriptedResponse, ScriptedServer},
        turso::{consent::TursoConsent, discovery::McpEndpoint, platform::InMemoryPlatform},
        update::Update,
    };

    const PASSWORD: &str = "the owners password";
    const ISSUED_AT: i64 = 1_757_000_000_000;
    /// an organization this machine holds beside the one signed in to.
    const ANOTHER: &str = "org-another";

    fn test_cost() -> KdfParams {
        KdfParams {
            memory_kib: 1024,
            iterations: 2,
            lanes: 1,
        }
    }

    /// The organization's state over one data directory, as the plugins' setups build it, with
    /// nothing open and nobody in.
    async fn state_over(directory: &std::path::Path) -> Shared {
        let mut settings =
            Persisted::<Settings>::load(directory.join(Settings::FILENAME)).expect("the settings");
        settings.database_path = directory.join(Database::FILENAME);
        settings.recovery_path = directory.join(Update::FILENAME);
        settings.commit().expect("the settings");

        let settings = Arc::new(RwLock::new(settings));
        let remote_sync = RemoteSync::new(
            settings.clone(),
            directory.join(RemoteSync::FILENAME),
            crate::clock::System::shared(),
        )
        .await
        .expect("the sync record");
        Update::new(settings.clone(), &crate::clock::System)
            .await
            .expect("the update");

        Shared {
            db: Arc::new(RwLock::new(Database::new(
                settings.clone(),
                crate::clock::System::shared(),
            ))),
            settings,
            remote_sync: Arc::new(RwLock::new(remote_sync)),
            upgrade: Arc::new(crate::upgrade::Upgrader),
            credentials: Arc::new(Memory::new()),
            consent: Arc::new(TursoConsent::new()),
            organization: Arc::new(RwLock::new(None)),
            member: Arc::new(RwLock::new(None)),
            arriving_link: Arc::new(Mutex::new(None)),
            signed_out_elsewhere: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            old_shape_check: tokio::sync::OnceCell::new(),
        }
    }

    /// An organization created in `directory` by a first run, with the owner as its member.
    async fn created(directory: &std::path::Path) -> (OrganizationStore, HeldOrganization) {
        let mut store = Persisted::<RemoteSyncStore>::load(directory.join(RemoteSync::FILENAME))
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
            &Memory::new(),
            &crate::clock::System::shared(),
            &mut store,
            "a-platform-token",
            &McpEndpoint::at(&mcp.url("")),
            |_| Arc::clone(&platform),
            Remote::none(),
            &directory.join(Database::FILENAME),
            CreateOrganization {
                name: "Acme",
                username: "olivia",
                password: PASSWORD,
                group: None,
            },
            test_cost(),
            ISSUED_AT,
        )
        .await
        .expect("the first run failed");
        let held = store.selected().cloned().expect("the record");

        (organization, held)
    }

    /// A workspace replica on disk under `ws-<id>.db`.
    async fn a_workspace_replica(directory: &std::path::Path, id: &str) -> std::path::PathBuf {
        let path = Database::replica_path(&directory.join(Database::FILENAME), id);
        let replica = Database::open_replica(&crate::clock::System, &path, None, || async {
            Ok::<String, turso::Error>(String::new())
        })
        .await
        .expect("the workspace replica");
        let connection = replica.connect().await.expect("a connection");

        connection
            .execute(
                "CREATE TABLE IF NOT EXISTS \"unit\" (\"id\" TEXT PRIMARY KEY)",
                (),
            )
            .await
            .expect("a table");

        drop(connection);
        drop(replica);

        assert!(path.exists(), "the workspace replica was not written");

        path
    }

    /// The owner of one organization signed in, with the machine's current workspace `south` and
    /// a replica of it and of `east` on disk, each tracked for the owner and for the organization
    /// `organization_of` names. The owner's vault holds a grant on neither.
    async fn signed_in_with(
        name: &str,
        organization_of: impl Fn(&HeldOrganization) -> String,
    ) -> (Shared, std::path::PathBuf, std::path::PathBuf) {
        let directory = scratch(name);
        let (organization, held) = created(&directory).await;
        let current = a_workspace_replica(&directory, "south").await;
        let other = a_workspace_replica(&directory, "east").await;
        let app_state = state_over(&directory).await;
        let slot: CredentialSlot = Arc::new(Mutex::new(None));
        let member = sign_in(&organization, &held, PASSWORD, &slot)
            .await
            .expect("the owner did not sign in");

        assert!(member.workspace_credentials.is_empty());

        *app_state.member.write().await = Some(member);
        *app_state.organization.write().await = Some(organization);

        {
            let mut remote_sync = app_state.remote_sync.write().await;
            let member_id = held.member_id.clone().expect("the owner");
            let organization_id = organization_of(&held);

            for workspace in ["south", "east"] {
                remote_sync
                    .remember_replica(workspace, &member_id, &organization_id, 1)
                    .expect("tracked");
            }

            let record = remote_sync.store_mut();

            record.workspace.remote_id = Some("south".to_string());
            record.workspace.remote_url = None;
            record.commit().expect("the record");
        }

        (app_state, current, other)
    }

    /// **Opening a workspace never judges another organization's replica** (effort 851, the
    /// plan's *The machine's record holds a list*). The member signed in holds no grant on a
    /// workspace of another organization because it is not of theirs, and reading that as a grant
    /// that ended would delete the other organization's file, current or not.
    #[tokio::test]
    async fn a_replica_of_another_organization_is_not_released_when_a_workspace_opens() {
        let (app_state, current, other) =
            signed_in_with("open-another-organization", |_| ANOTHER.to_string()).await;

        open_database(&app_state, &crate::clock::System).await;
        app_state.db.write().await.disconnect().await;

        assert!(
            current.exists(),
            "the other organization's current replica was released"
        );
        assert!(
            other.exists(),
            "the other organization's replica was released"
        );
        assert_eq!(
            app_state.remote_sync.read().await.local_replicas().len(),
            2,
            "the other organization's replicas stopped being tracked"
        );
    }

    /// And the same replica, tracked as the signed-in organization's, is released, which is what
    /// shows the test above watches the guard rather than a release that never runs.
    #[tokio::test]
    async fn a_replica_of_the_signed_in_organization_with_no_grant_is_released() {
        let (app_state, current, _) =
            signed_in_with("open-own-organization", |held| held.id.clone()).await;

        open_database(&app_state, &crate::clock::System).await;
        app_state.db.write().await.disconnect().await;

        assert!(!current.exists(), "a replica whose grant ended was kept");
    }
}
