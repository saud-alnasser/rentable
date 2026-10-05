//! forgetting the organization this machine holds: every replica gone from the data directory,
//! the record emptied, the Turso authority cleared from the keyring.
//!
//! **One routine, reached two ways.** A disconnect (effort 824, requirement 20) is the person
//! asking for it, from the wall while signed out or from the organization page while signed in; the
//! startup check (requirement 17, `upgrade/shape.rs`) is the machine finding that what it holds was
//! built before this build and cannot be opened by it. Both leave the machine as one that has never
//! held an organization, and the organization and its workspaces on Turso are untouched: what goes
//! is this machine's copy and this machine's record, and the person connects again by the link.
//!
//! **The files are deleted after everything holding them is let go of.** On Windows a file the
//! process still has open cannot be deleted, so the vault is closed, the organization replica is
//! dropped and the workspace engine is released through the same paths a sign-out and
//! `workspace::open_database` use, and only then is the directory swept. A file that still will
//! not go is reported by name rather than pretended away; the record is emptied regardless, so
//! the machine does not go on naming an organization whose replica it half holds.
//!
//! **One sign is not a shape at all**, and it is [`forget_deleted_organization`]: the owner deleted
//! the organization on their Turso account, so the database this machine's replica syncs against is
//! not there any more (effort 828, requirement 18). Every sign of the old shape is read off the
//! replica on disk (`upgrade/shape.rs`); this one is the remote's answer to a pull, so it is read
//! after the launch has resumed a session and has a credential to pull with, and it is keyed on the
//! remote saying the database is absent rather than on any refusal it could make.

use std::path::{Path, PathBuf};

use crate::{
    credential::CredentialStore, diagnostics, error::Error, organization::Shared,
    turso::platform::database_is_gone,
};

/// Forget the organization this machine holds, whole.
///
/// Signs out where somebody is in, releases the workspace engine, deletes every `org-*.db*` and
/// `ws-*.db*` under the data directory, empties the record (`RemoteSync::forget_organization`),
/// clears the Turso authority from the keyring (`TursoConsent::disconnect`), and commits. A file
/// that could not be removed is reported after all of that has run, by name.
pub(crate) async fn forget(
    app_state: &Shared,
    credentials: &dyn CredentialStore,
) -> Result<(), Error> {
    // the row this machine wrote to the registry goes first, through the replica that carries the
    // delete (effort 828, requirement 15): after the sign-out below there is no replica left to
    // say anything through, and a machine that disconnected should stop standing in the owner's
    // way at once rather than in a week.
    super::leave_registry(app_state).await;

    // the sign-out, the one `organization_session_sign_out` performs: the keys go and the
    // organization replica is dropped, which is what lets its file be deleted below.
    super::sign_out(app_state, credentials).await;

    // the workspace engine, released the way `open_database` releases it before opening the next.
    // Nothing reopens it here: a machine holding no organization has nothing to open, which is the
    // state a launch is in before the wall.
    app_state.db.write().await.disconnect().await;

    let directory = data_directory(app_state).await;
    let swept = sweep_replicas(&directory);

    {
        let mut remote_sync = app_state.remote_sync.write().await;

        remote_sync.forget_organization().await?;
    }

    app_state.consent.disconnect(credentials)?;

    diagnostics::info("organization.forgotten")
        .with("removed", swept.removed.len().to_string())
        .with("left", swept.left.len().to_string())
        .write();

    if swept.left.is_empty() {
        return Ok(());
    }

    Err(Error::Io {
        message: format!(
            "the organization was forgotten and {} could not be removed: {}",
            if swept.left.len() == 1 {
                "one file"
            } else {
                "these files"
            },
            swept
                .left
                .iter()
                .map(|(path, error)| format!("{} ({error})", path.display()))
                .collect::<Vec<_>>()
                .join(", ")
        ),
    })
}

/// Forget the organization where the remote says its database is not there any more: the other
/// machines' half of the owner deleting the organization (effort 828, requirement 18).
///
/// **It reads a pull rather than the replica**, which is why it is not one of the old shape's signs
/// (`upgrade::shape::OldShape`): what is being asked is a fact about the account, and the only
/// thing that can answer it is the remote. The pull is the launch's own, made through the replica a
/// resume has already opened, so it spends the credential that vault unsealed and costs one round
/// trip on a launch that made one anyway.
///
/// **A machine that stopped at the wall pulls nothing and learns nothing**, because reaching the
/// organization database at all takes a credential a vault holds. It signs in on the rows it has,
/// and the launch after that one, which resumes, is where it finds out.
///
/// Answers whether the organization was forgotten. Anything but the remote saying the database is
/// absent leaves the machine exactly as it was: a credential that lapsed, a refusal for the
/// account and a remote nothing could reach are all the offline case, and the replica goes on
/// serving what it holds (819's requirement 18).
pub(crate) async fn forget_deleted_organization(
    app_state: &Shared,
    credentials: &dyn CredentialStore,
) -> Result<bool, Error> {
    let gone = {
        let organization = app_state.organization.read().await;
        let Some(store) = organization.as_ref() else {
            return Ok(false);
        };

        match store.pulled().await {
            Ok(_) => false,
            Err(refusal) => {
                let gone = database_is_gone(&refusal);

                if !gone {
                    diagnostics::info("organization.launch.notPulled")
                        .with("reason", refusal.to_string())
                        .write();
                }

                gone
            }
        }
    };

    if !gone {
        return Ok(false);
    }

    diagnostics::warn("organization.forgotten.deletedOnThePlatform").write();

    forget(app_state, credentials).await?;

    Ok(true)
}

/// What one sweep of the data directory did.
struct Swept {
    removed: Vec<PathBuf>,
    left: Vec<(PathBuf, std::io::Error)>,
}

/// Remove every `org-*.db*` and `ws-*.db*` under `directory`: the replicas and every sidecar the
/// engine keeps beside them, whatever it is named, which is why the match is on the prefix and
/// the extension rather than on a list of suffixes.
fn sweep_replicas(directory: &Path) -> Swept {
    let mut swept = Swept {
        removed: Vec::new(),
        left: Vec::new(),
    };
    let entries = match std::fs::read_dir(directory) {
        Ok(entries) => entries,
        // a directory that is not there holds no replica, which is the outcome this wanted.
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return swept,
        Err(error) => {
            swept.left.push((directory.to_path_buf(), error));

            return swept;
        }
    };

    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();

        if !is_replica_file(&name) {
            continue;
        }

        match std::fs::remove_file(entry.path()) {
            Ok(()) => swept.removed.push(entry.path()),
            Err(error) => swept.left.push((entry.path(), error)),
        }
    }

    swept
}

/// Whether a file name is a replica's or one of its sidecars: `org-<id>.db`, `ws-<id>.db`, and
/// anything the engine writes beside either under the same stem.
fn is_replica_file(name: &str) -> bool {
    (name.starts_with("org-") || name.starts_with("ws-")) && name.contains(".db")
}

async fn data_directory(app_state: &Shared) -> PathBuf {
    let settings = app_state.settings.read().await;

    settings
        .database_path
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| PathBuf::from("."))
}

#[cfg(test)]
mod tests {
    use crate::credential::{CredentialStore, Memory};

    use std::sync::{Arc, Mutex};

    use serde_json::json;
    use tokio::sync::RwLock;

    use super::{forget, forget_deleted_organization, is_replica_file};
    use crate::test::scratch;
    use crate::{
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
        turso::{
            consent::{TursoConsent, platform_token, store_platform_token},
            discovery::McpEndpoint,
            platform::InMemoryPlatform,
        },
        update::Update,
    };

    const PASSWORD: &str = "the owners password";
    const ISSUED_AT: i64 = 1_757_000_000_000;

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

    /// The names of every replica file under the directory, sorted.
    fn replica_files(directory: &std::path::Path) -> Vec<String> {
        let mut names: Vec<String> = std::fs::read_dir(directory)
            .expect("the directory")
            .flatten()
            .map(|entry| entry.file_name().to_string_lossy().into_owned())
            .filter(|name| is_replica_file(name))
            .collect();

        names.sort();

        names
    }

    /// The organization's state over one data directory, as the plugins' setups build it, with
    /// nothing open and nobody in. `remote-sync.json` is loaded from the directory, so a test
    /// writes the record it wants first.
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
        // the update is the `update` plugin's and no part of this state, and it is made as a launch
        // makes it, so the directory holds the file a launch leaves.
        Update::new(settings.clone()).await.expect("the update");

        Shared {
            db: Arc::new(RwLock::new(Database::new(
                settings.clone(),
                crate::clock::System::shared(),
            ))),
            settings,
            remote_sync: Arc::new(RwLock::new(remote_sync)),
            upgrade: Arc::new(crate::upgrade::Upgrader),
            credentials: Arc::new(crate::credential::Memory::new()),
            consent: Arc::new(TursoConsent::new()),
            organization: Arc::new(RwLock::new(None)),
            member: Arc::new(RwLock::new(None)),
            arriving_link: Arc::new(Mutex::new(None)),
            signed_out_elsewhere: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            old_shape_check: tokio::sync::OnceCell::new(),
        }
    }

    /// An organization created in `directory` by a first run: the replica on disk and the
    /// machine's record naming it, with the owner as its member.
    async fn created(
        credentials: &dyn CredentialStore,
        directory: &std::path::Path,
    ) -> (OrganizationStore, HeldOrganization) {
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
            credentials,
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

    /// A workspace replica on disk under `ws-<id>.db`, with the sidecars a synced engine keeps.
    async fn a_workspace_replica(directory: &std::path::Path, id: &str) {
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
    }

    /// Criterion 20, the Rust half: a disconnect on a machine holding an organization, signed
    /// in, with two workspace replicas and the workspace engine open on one, leaves no `org-*`
    /// or `ws-*` file, an empty record, and no authority in the keyring.
    #[tokio::test]
    async fn forgetting_leaves_no_replica_no_record_and_no_authority() {
        let credentials = Memory::new();
        let directory = scratch("whole");
        let (organization, held) = created(&credentials, &directory).await;

        a_workspace_replica(&directory, "north").await;
        a_workspace_replica(&directory, "south").await;
        store_platform_token(&credentials, "a-platform-token").expect("the authority");

        let app_state = state_over(&directory).await;

        // signed in, with the organization replica open in the process and the workspace engine
        // on one of the two workspaces, as a member on the organization page would be.
        let member = sign_in(&organization, &held, PASSWORD, &slot())
            .await
            .expect("the owner did not sign in");

        *app_state.member.write().await = Some(member);
        *app_state.organization.write().await = Some(organization);

        {
            let mut remote_sync = app_state.remote_sync.write().await;

            remote_sync
                .remember_replica(
                    "north",
                    held.member_id.as_deref().expect("the owner"),
                    &held.id,
                    1,
                )
                .expect("tracked");
            remote_sync
                .remember_replica(
                    "south",
                    held.member_id.as_deref().expect("the owner"),
                    &held.id,
                    1,
                )
                .expect("tracked");
            remote_sync
                .open_organization_workspace("north", "North", "", 0, "a-workspace-token")
                .expect("the workspace");
        }

        app_state
            .db
            .write()
            .await
            .connect_workspace("north", None, || async {
                Ok::<String, turso::Error>(String::new())
            })
            .await
            .expect("the workspace engine");

        let before = replica_files(&directory);

        assert!(
            before.iter().any(|name| name.starts_with("org-")),
            "no organization replica to forget: {before:?}"
        );
        assert!(
            before.iter().any(|name| name == "ws-north.db")
                && before.iter().any(|name| name == "ws-south.db"),
            "the two workspace replicas are not there: {before:?}"
        );
        assert!(
            platform_token(&credentials).is_ok(),
            "no authority to clear"
        );

        forget(&app_state, &credentials)
            .await
            .expect("the forget failed");

        assert_eq!(
            replica_files(&directory),
            Vec::<String>::new(),
            "a replica file survived the disconnect"
        );
        assert!(
            directory.join(Settings::FILENAME).exists(),
            "the sweep took more than the replicas"
        );

        // the record: nothing held, nothing tracked, the workspace a fresh default.
        let mut remote_sync = app_state.remote_sync.write().await;
        let store = remote_sync.store_mut();

        assert_eq!(store.selected(), None);
        assert!(store.replicas.is_empty());
        assert_eq!(store.consent_organization(), None);
        assert_eq!(store.workspace.remote_id, None);
        assert_eq!(store.workspace.remote_url, None);

        let written =
            std::fs::read_to_string(directory.join(RemoteSync::FILENAME)).expect("the file");

        assert!(!written.contains("\"organization\":{"), "{written}");
        assert!(!written.contains("north"), "{written}");

        // signed out, and the authority gone.
        assert!(app_state.member.read().await.is_none());
        assert!(app_state.organization.read().await.is_none());
        assert!(
            platform_token(&credentials).is_err(),
            "the authority survived the disconnect"
        );
    }

    /// The replica the launch holds open, against `remote`: the file the first run wrote, reopened
    /// with a remote to pull from and a credential to pull with, which is what a resumed session
    /// leaves in `app_state.organization`.
    async fn replica_against(
        directory: &std::path::Path,
        held: &HeldOrganization,
        remote: &str,
    ) -> OrganizationStore {
        OrganizationStore::open(
            crate::clock::System::shared(),
            &OrganizationStore::replica_path(&directory.join(Database::FILENAME), &held.id),
            Some(remote.to_string()),
            || async { Ok::<String, turso::Error>("a-credential".to_string()) },
        )
        .await
        .expect("the replica")
    }

    /// Criterion 18, the other machines' half: **a launch whose pull is answered by a remote that
    /// has no such database forgets the organization**, and lands where a machine holding nothing
    /// lands. The owner deleted it from their own machine and this one finds out no other way.
    ///
    /// **And what a machine meets instead is pinned beside it.** A `401`, which is a credential
    /// that lapsed or was rotated, and a remote that answers nothing at all, each leave the machine
    /// exactly as it was: the replica goes on serving what it holds, which is 819's requirement 18,
    /// and a sign keyed any wider than *not there* would wipe a machine whose credential could
    /// simply be renewed.
    ///
    /// This is also where what the client answers is established, without deleting anything on any
    /// account: `turso::Error` carries no variant for a remote's answer, so what a refusal says is
    /// read out of its message, and the scripted server is what pins that the status really is in
    /// there for a pull.
    #[tokio::test]
    async fn a_launch_whose_pull_says_the_database_is_gone_forgets_the_organization() {
        let credentials = Memory::new();
        let directory = scratch("deleted");
        let (organization, held) = created(&credentials, &directory).await;

        drop(organization);

        // the remote says there is no such database. Every request of the pull is answered the
        // same way, since the engine makes more than one and any of them is where it stops.
        let absent = ScriptedServer::start(
            (0..8)
                .map(|_| ScriptedResponse::new(404, r#"{"error":"database not found"}"#))
                .collect(),
        )
        .await;
        let app_state = state_over(&directory).await;

        *app_state.organization.write().await =
            Some(replica_against(&directory, &held, &absent.url("")).await);

        assert!(
            forget_deleted_organization(&app_state, &credentials)
                .await
                .expect("the check failed"),
            "a pull answered by a remote holding no such database left the organization here"
        );
        assert_eq!(replica_files(&directory), Vec::<String>::new());
        assert!(
            app_state
                .remote_sync
                .write()
                .await
                .store_mut()
                .selected()
                .is_none()
        );
        assert!(app_state.organization.read().await.is_none());

        // a credential the remote will not accept is not a deleted organization: the machine keeps
        // what it holds and the shell renews or reconnects.
        let directory = scratch("refused");
        let (organization, held) = created(&credentials, &directory).await;

        drop(organization);

        let refusing = ScriptedServer::start(
            (0..8)
                .map(|_| ScriptedResponse::new(401, r#"{"error":"Unauthorized: invalid JWT"}"#))
                .collect(),
        )
        .await;
        let app_state = state_over(&directory).await;

        *app_state.organization.write().await =
            Some(replica_against(&directory, &held, &refusing.url("")).await);

        assert!(
            !forget_deleted_organization(&app_state, &credentials)
                .await
                .expect("the check failed"),
            "a refused credential was read as a deleted organization"
        );
        assert!(
            replica_files(&directory)
                .iter()
                .any(|name| name == &format!("org-{}.db", held.id)),
            "a refused credential swept the replicas"
        );

        // and a machine that reaches nothing at all is the offline case, which says nothing about
        // whether the organization is still there.
        let directory = scratch("unreachable");
        let (organization, held) = created(&credentials, &directory).await;

        drop(organization);

        let unreachable =
            ScriptedServer::start((0..8).map(|_| ScriptedResponse::hangup()).collect()).await;
        let app_state = state_over(&directory).await;

        *app_state.organization.write().await =
            Some(replica_against(&directory, &held, &unreachable.url("")).await);

        assert!(
            !forget_deleted_organization(&app_state, &credentials)
                .await
                .expect("the check failed"),
            "a remote that answered nothing was read as a deleted organization"
        );
        assert!(
            replica_files(&directory)
                .iter()
                .any(|name| name == &format!("org-{}.db", held.id)),
            "an unreachable remote swept the replicas"
        );
    }
}
