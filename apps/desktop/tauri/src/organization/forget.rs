//! forgetting the organization this machine holds: every replica gone from the data directory,
//! the record emptied, the Turso authority cleared from the keyring.
//!
//! **One routine, reached two ways.** A disconnect (effort 824, requirement 20) is the person
//! asking for it, from the wall while signed out or from the organization page while signed in;
//! the startup check (requirement 17) is the machine finding that what it holds was built before
//! this build and cannot be opened by it. Both leave the machine as one that has never held an
//! organization, and the organization and its workspaces on Turso are untouched: what goes is
//! this machine's copy and this machine's record, and the person connects again by the link.
//!
//! **The files are deleted after everything holding them is let go of.** On Windows a file the
//! process still has open cannot be deleted, so the vault is closed, the organization replica is
//! dropped and the workspace engine is released through the same paths a sign-out and
//! `bootstrap::open_database` use, and only then is the directory swept. A file that still will
//! not go is reported by name rather than pretended away; the record is emptied regardless, so
//! the machine does not go on naming an organization whose replica it half holds.
//!
//! **The old shape, and why it is forgotten rather than migrated.** Nothing was published, so a
//! machine holding what 819 built holds test data of its own, and the human decided on 2026-09-13
//! to start over rather than carry it. Seven signs, any one of which is the old shape: the record
//! still carries a non-empty `organizations` list, which is what a machine that had joined
//! several kept; the held organization's replica file is missing, which is a record with nothing
//! behind it; that replica's `member` table has no `username_sealed` column, which is the
//! schema before ticket 09; its `invitation` table has no `sealed_secret` column, which is
//! every replica written before effort 826 changed what bits 4 and 5 of `member.permissions`
//! mean; its `member` table has no `signing_public_key` column, which is every replica
//! written before the same effort gave an owner something to certify a widened member against;
//! its `member` table has no `session_epoch` column, which is every replica written before the
//! same effort gave a member a run of sessions to be signed out of (requirement 22).
//! The last four are a local `PRAGMA table_info`, read before any pull, so an
//! unreachable remote does not stop the check. It runs on the first `organization_state_get` of a
//! launch, before anything else opens the replica.
//!
//! *There was a seventh sign, and effort 828 retired it with the column it read.* An `invitation`
//! table with no `code_seal` marked a replica written before effort 826 sealed the invited vault's
//! password under a code; effort 828 moved that seal into the link's own text and dropped the
//! column, so the sign would now read every replica this build writes as the old shape and wipe
//! the machine at launch. What it uniquely caught was a replica written inside effort 826, between
//! the ticket that added `session_epoch` and the ticket that added `code_seal`; everything older
//! is still caught by the two member signs above.
//!
//! **The fourth sign is what makes the permission table safe to renumber.** A row written under
//! the six-act table stores a number whose bits 4 and 5 now name other acts, and no read can tell
//! the two apart. Forgetting the replica is what stops one being read as the other, so the sign
//! and the renumbering land together (requirement 19 of effort 826).
//!
//! **One sign is not a shape at all**, and it is [`forget_deleted_organization`]: the owner
//! deleted the organization on their Turso account, so the database this machine's replica syncs
//! against is not there any more (effort 828, requirement 18). Every other sign is read off the
//! replica on disk; this one is the remote's answer to a pull, so it is read after the launch has
//! resumed a session and has a credential to pull with, and it is keyed on the remote saying the
//! database is absent rather than on any refusal it could make.

use std::{
    fmt,
    path::{Path, PathBuf},
};

use crate::{diagnostics, error::Error, state::AppState, sync::turso::platform::database_is_gone};

use super::store::OrganizationStore;

/// Why the startup check forgot what the machine held: the sign it read.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum OldShape {
    /// the record still carried `organizations`, a list, with this many in it.
    SeveralOrganizations(usize),
    /// the held organization's replica is not on disk.
    ReplicaMissing(PathBuf),
    /// the held organization's `member` table carries no `username_sealed` column.
    MemberWithoutUsername,
    /// the held organization's `invitation` table still carries `sealed_payload`, the half ticket
    /// 11 dropped; a replica built between tickets 10 and 11 has usernames and this column both.
    InvitationWithSealedHalf,
    /// the held organization's `invitation` table carries no `sealed_secret`, the column effort
    /// 826 added; this is every organization written while `member.permissions` still meant the
    /// six-act table, whose bits 4 and 5 now name other acts.
    InvitationWithoutSealedSecret,
    /// the held organization's `member` table carries no `signing_public_key`, the column effort
    /// 826 put under the member signature; a member row written without it carries a `member.v1`
    /// signature over a preimage no reader here builds, so every row would refuse as forged.
    MemberWithoutSigningKey,
    /// the held organization's `member` table carries no `session_epoch`, the column effort 826
    /// added for requirement 22; without it no reader here can say whether a remembered key is
    /// still this member's run of sessions, and every read of the row would fail on the column.
    MemberWithoutSessionEpoch,
}

impl fmt::Display for OldShape {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::SeveralOrganizations(count) => write!(
                formatter,
                "the record listed {count} organizations under the shape this build replaced"
            ),
            Self::ReplicaMissing(path) => write!(
                formatter,
                "the held organization's replica is not at {}",
                path.display()
            ),
            Self::MemberWithoutUsername => formatter.write_str(
                "the held organization's member table carries no username_sealed column",
            ),
            Self::InvitationWithSealedHalf => formatter
                .write_str("the held organization's invitation table still carries sealed_payload"),
            Self::InvitationWithoutSealedSecret => formatter
                .write_str("the held organization's invitation table carries no sealed_secret"),
            Self::MemberWithoutSigningKey => formatter
                .write_str("the held organization's member table carries no signing_public_key"),
            Self::MemberWithoutSessionEpoch => {
                formatter.write_str("the held organization's member table carries no session_epoch")
            }
        }
    }
}

/// The column a member row has carried since ticket 09, whose absence marks a replica this build
/// cannot open.
const USERNAME_COLUMN: &str = "username_sealed";

/// The column an invitation carried until ticket 11, whose presence marks a replica this build
/// cannot invite on.
const SEALED_PAYLOAD_COLUMN: &str = "sealed_payload";

/// The column an invitation has carried since effort 826, whose absence marks a replica whose
/// stored permissions were written under the six-act table.
const SEALED_SECRET_COLUMN: &str = "sealed_secret";

/// The column a member has carried since effort 826 put it under the member signature, whose
/// absence marks a replica whose rows were signed under the `member.v1` preimage.
const SIGNING_KEY_COLUMN: &str = "signing_public_key";

/// The column a member has carried since effort 826 gave a member a run of sessions to be signed
/// out of (requirement 22), whose absence marks a replica no read of a member row would survive.
const SESSION_EPOCH_COLUMN: &str = "session_epoch";

/// Forget the organization this machine holds, whole.
///
/// Signs out where somebody is in, releases the workspace engine, deletes every `org-*.db*` and
/// `ws-*.db*` under the data directory, empties the record (`RemoteSync::forget_organization`),
/// clears the Turso authority from the keyring (`TursoConsent::disconnect`), and commits. A file
/// that could not be removed is reported after all of that has run, by name.
pub async fn forget(app_state: &AppState) -> Result<(), Error> {
    // the row this machine wrote to the registry goes first, through the replica that carries the
    // delete (effort 828, requirement 15): after the sign-out below there is no replica left to
    // say anything through, and a machine that disconnected should stop standing in the owner's
    // way at once rather than in a week.
    super::leave_registry(app_state).await;

    // the sign-out, the one `organization_sign_out` performs: the keys go and the organization
    // replica is dropped, which is what lets its file be deleted below.
    super::sign_out(app_state).await;

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

    app_state.consent.disconnect()?;

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

/// Forget what the machine holds where its shape is the old one, and say which sign was read.
///
/// The check reads the record and, where an organization is held, its replica's schema, and
/// nothing else; it opens no vault and pulls nothing. `None` is a machine whose shape is this
/// build's, held organization or not.
pub async fn forget_old_shape(app_state: &AppState) -> Result<Option<OldShape>, Error> {
    let Some(shape) = old_shape(app_state).await? else {
        return Ok(None);
    };

    diagnostics::warn("organization.forgotten.oldShape")
        .with("reason", shape.to_string())
        .write();

    forget(app_state).await?;

    Ok(Some(shape))
}

/// Forget the organization where the remote says its database is not there any more: the other
/// machines' half of the owner deleting the organization (effort 828, requirement 18).
///
/// **It reads a pull rather than the replica**, which is why it is not one of [`OldShape`]'s
/// signs: what is being asked is a fact about the account, and the only thing that can answer it
/// is the remote. The pull is the launch's own, made through the replica a resume has already
/// opened, so it spends the credential that vault unsealed and costs one round trip on a launch
/// that made one anyway.
///
/// **A machine that stopped at the wall pulls nothing and learns nothing**, because reaching the
/// organization database at all takes a credential a vault holds. It signs in on the rows it has,
/// and the launch after that one, which resumes, is where it finds out.
///
/// Answers whether the organization was forgotten. Anything but the remote saying the database is
/// absent leaves the machine exactly as it was: a credential that lapsed, a refusal for the
/// account and a remote nothing could reach are all the offline case, and the replica goes on
/// serving what it holds (819's requirement 18).
pub async fn forget_deleted_organization(app_state: &AppState) -> Result<bool, Error> {
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

    forget(app_state).await?;

    Ok(true)
}

/// The sign that what this machine holds was built before this build, where there is one.
async fn old_shape(app_state: &AppState) -> Result<Option<OldShape>, Error> {
    let (listed, held) = {
        let mut remote_sync = app_state.remote_sync.write().await;
        let store = remote_sync.store_mut();

        (
            store.organizations_of_the_old_shape.len(),
            store.organization.clone(),
        )
    };

    if listed > 0 {
        return Ok(Some(OldShape::SeveralOrganizations(listed)));
    }

    let Some(held) = held else {
        return Ok(None);
    };
    let database_path = { app_state.settings.read().await.database_path.clone() };
    let replica = OrganizationStore::replica_path(&database_path, &held.id);

    if !replica.exists() {
        return Ok(Some(OldShape::ReplicaMissing(replica)));
    }

    // opened with no remote, so the engine serves the file and reaches nothing; dropped before
    // anything else opens it.
    let store = OrganizationStore::open(&replica, None, || async {
        Ok::<String, turso::Error>(String::new())
    })
    .await?;
    let member_columns = store.columns_of("member").await?;
    let invitation_columns = store.columns_of("invitation").await?;

    drop(store);

    if !member_columns
        .iter()
        .any(|column| column == USERNAME_COLUMN)
    {
        return Ok(Some(OldShape::MemberWithoutUsername));
    }

    if invitation_columns
        .iter()
        .any(|column| column == SEALED_PAYLOAD_COLUMN)
    {
        return Ok(Some(OldShape::InvitationWithSealedHalf));
    }

    if !invitation_columns
        .iter()
        .any(|column| column == SEALED_SECRET_COLUMN)
    {
        return Ok(Some(OldShape::InvitationWithoutSealedSecret));
    }

    // read after the invitation's two, because a replica missing both is the older shape and the
    // sign a reader is told about should be the one that came first.
    if !member_columns
        .iter()
        .any(|column| column == SIGNING_KEY_COLUMN)
    {
        return Ok(Some(OldShape::MemberWithoutSigningKey));
    }

    // a replica missing this one alone was written between the signing key and requirement 22.
    if !member_columns
        .iter()
        .any(|column| column == SESSION_EPOCH_COLUMN)
    {
        return Ok(Some(OldShape::MemberWithoutSessionEpoch));
    }

    Ok(None)
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

async fn data_directory(app_state: &AppState) -> PathBuf {
    let settings = app_state.settings.read().await;

    settings
        .database_path
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| PathBuf::from("."))
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use serde_json::json;
    use tokio::sync::RwLock;

    use super::{OldShape, forget, forget_deleted_organization, forget_old_shape, is_replica_file};
    use crate::{
        database::Database,
        organization::{
            HeldOrganization,
            session::{CredentialSlot, sign_in},
            setup::{CreateOrganization, Remote, create_organization},
            store::OrganizationStore,
            vault::KdfParams,
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
                platform::InMemoryPlatform,
            },
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

    fn scratch(name: &str) -> std::path::PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|elapsed| elapsed.as_nanos())
            .unwrap_or_default();
        let directory = std::env::temp_dir().join(format!("rentable-forget-{name}-{nanos:x}"));
        std::fs::create_dir_all(&directory).expect("scratch directory");

        directory
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

    /// The whole of the application state over one data directory, as `lib.rs` builds it, with
    /// nothing open and nobody in. `remote-sync.json` is loaded from the directory, so a test
    /// writes the record it wants first.
    async fn state_over(directory: &std::path::Path) -> AppState {
        let mut settings =
            Persisted::<Settings>::load(directory.join(Settings::FILENAME)).expect("the settings");
        settings.database_path = directory.join(Database::FILENAME);
        settings.recovery_path = directory.join(Update::FILENAME);
        settings.commit().expect("the settings");

        let settings = Arc::new(RwLock::new(settings));
        let remote_sync = RemoteSync::new(settings.clone(), directory.join(RemoteSync::FILENAME))
            .await
            .expect("the sync record");
        let update = Update::new(settings.clone()).await.expect("the update");

        AppState {
            db: Arc::new(RwLock::new(Database::new(settings.clone()))),
            settings,
            remote_sync: Arc::new(RwLock::new(remote_sync)),
            update: Arc::new(RwLock::new(update)),
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
        let held = store.organization.clone().expect("the record");

        (organization, held)
    }

    /// A workspace replica on disk under `ws-<id>.db`, with the sidecars a synced engine keeps.
    async fn a_workspace_replica(directory: &std::path::Path, id: &str) {
        let path = Database::replica_path(&directory.join(Database::FILENAME), id);
        let replica = Database::open_replica(&path, None, || async {
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
        let _turn = crate::keyring::take_the_credential_store().await;
        let directory = scratch("whole");
        let (organization, held) = created(&directory).await;

        a_workspace_replica(&directory, "north").await;
        a_workspace_replica(&directory, "south").await;
        store_platform_token("a-platform-token").expect("the authority");

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
                .remember_replica("north", held.member_id.as_deref().expect("the owner"), 1)
                .expect("tracked");
            remote_sync
                .remember_replica("south", held.member_id.as_deref().expect("the owner"), 1)
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
        assert!(platform_token().is_ok(), "no authority to clear");

        forget(&app_state).await.expect("the forget failed");

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

        assert_eq!(store.organization, None);
        assert!(store.replicas.is_empty());
        assert_eq!(store.turso_organization, None);
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
            platform_token().is_err(),
            "the authority survived the disconnect"
        );
    }

    /// Criterion 17, the record of two: a `remote-sync.json` still carrying `organizations` is
    /// the old shape, and the first state read forgets it, replicas and all, saying why.
    #[tokio::test]
    async fn a_record_listing_organizations_is_forgotten_at_startup() {
        let _turn = crate::keyring::take_the_credential_store().await;
        let directory = scratch("listed");

        std::fs::write(
            directory.join(RemoteSync::FILENAME),
            r#"{"workspace":{"id":"workspace-1","name":"Riyadh","remoteId":"north","remoteUrl":"libsql://ws-north.example"},"replicas":[{"workspaceId":"north","memberId":"me","createdAt":1}],"organizations":[{"id":"a","name":"Acme","verifyingKey":"k","remoteUrl":"libsql://org-a.example","memberId":"me","role":"owner","joinedAt":1},{"id":"b","name":"Beta","verifyingKey":"k","remoteUrl":"libsql://org-b.example","memberId":"me","role":"member","joinedAt":2}]}"#,
        )
        .expect("the old record");
        std::fs::write(directory.join("org-a.db"), b"not read").expect("a replica");
        std::fs::write(directory.join("org-b.db"), b"not read").expect("a replica");
        std::fs::write(directory.join("ws-north.db"), b"not read").expect("a replica");
        std::fs::write(directory.join("ws-north.db-wal"), b"not read").expect("a sidecar");

        let app_state = state_over(&directory).await;
        let forgotten = forget_old_shape(&app_state)
            .await
            .expect("the check failed");

        assert_eq!(forgotten, Some(OldShape::SeveralOrganizations(2)));
        assert_eq!(replica_files(&directory), Vec::<String>::new());

        let written =
            std::fs::read_to_string(directory.join(RemoteSync::FILENAME)).expect("the file");

        assert!(!written.contains("organizations"), "{written}");
        assert!(!written.contains("Acme"), "{written}");
        assert!(!written.contains("north"), "{written}");

        // and a second read finds the new shape, and forgets nothing.
        assert_eq!(forget_old_shape(&app_state).await.expect("the check"), None);
    }

    /// Criterion 17, the old schema, and criterion 19 of effort 826: a held organization whose
    /// replica's `member` table carries no `username_sealed` is forgotten at startup, before
    /// anything reads it; one whose `invitation` table still carries `sealed_payload` is
    /// forgotten; one written under the six-act permission table, whose `invitation` table carries
    /// no `sealed_secret`, is forgotten; one whose `member` table carries no `signing_public_key`
    /// is forgotten; one whose `member` table carries no `session_epoch` is forgotten, which is
    /// requirement 22's; one whose replica is not on disk at all is forgotten the same way; and one
    /// of this build's shape is kept, `code_seal` gone with effort 828 and all.
    #[tokio::test]
    async fn a_replica_of_the_old_schema_or_none_at_all_is_forgotten_at_startup() {
        let _turn = crate::keyring::take_the_credential_store().await;

        // the old schema: the member table as 819 wrote it, with an email and a display name.
        let directory = scratch("old-schema");
        let replica = OrganizationStore::replica_path(&directory.join(Database::FILENAME), "old");
        let store = OrganizationStore::open(&replica, None, || async {
            Ok::<String, turso::Error>(String::new())
        })
        .await
        .expect("the replica");

        store
            .connection()
            .execute(
                "CREATE TABLE IF NOT EXISTS \"member\" (\
                    \"id\" TEXT PRIMARY KEY NOT NULL, \
                    \"email_sealed\" BLOB NOT NULL, \
                    \"display_name_sealed\" BLOB NOT NULL, \
                    \"role\" TEXT NOT NULL)",
                (),
            )
            .await
            .expect("the old member table");

        drop(store);

        let record = |id: &str| {
            format!(
                r#"{{"organization":{{"id":"{id}","name":"Acme","verifyingKey":"k","remoteUrl":"libsql://org.example","memberId":"me","role":"owner","joinedAt":1}}}}"#
            )
        };

        std::fs::write(directory.join(RemoteSync::FILENAME), record("old")).expect("the record");

        let app_state = state_over(&directory).await;

        assert_eq!(
            forget_old_shape(&app_state)
                .await
                .expect("the check failed"),
            Some(OldShape::MemberWithoutUsername)
        );
        assert_eq!(replica_files(&directory), Vec::<String>::new());
        assert!(
            app_state
                .remote_sync
                .write()
                .await
                .store_mut()
                .organization
                .is_none()
        );

        // the shape between tickets 10 and 11: usernames, and an invitation with its sealed half.
        let directory = scratch("sealed-half");
        let replica = OrganizationStore::replica_path(&directory.join(Database::FILENAME), "half");
        let store = OrganizationStore::open(&replica, None, || async {
            Ok::<String, turso::Error>(String::new())
        })
        .await
        .expect("the replica");

        for statement in [
            "CREATE TABLE IF NOT EXISTS \"member\" (\"id\" TEXT PRIMARY KEY NOT NULL, \"username_sealed\" BLOB NOT NULL)",
            "CREATE TABLE IF NOT EXISTS \"invitation\" (\"id\" TEXT PRIMARY KEY NOT NULL, \"sealed_payload\" BLOB NOT NULL)",
        ] {
            store
                .connection()
                .execute(statement, ())
                .await
                .expect("the half-old tables");
        }

        drop(store);
        std::fs::write(directory.join(RemoteSync::FILENAME), record("half")).expect("the record");

        let app_state = state_over(&directory).await;

        assert_eq!(
            forget_old_shape(&app_state)
                .await
                .expect("the check failed"),
            Some(OldShape::InvitationWithSealedHalf)
        );
        assert_eq!(replica_files(&directory), Vec::<String>::new());

        // requirement 19 of effort 826: the six-act shape. Usernames, no sealed half, and an
        // invitation table with no `sealed_secret`, which is what every organization written
        // before the permission table was renumbered looks like. Its `member.permissions` values
        // were written when bits 4 and 5 meant deleting a workspace and transferring ownership,
        // and nothing can tell them from the acts those bits name now, so the whole machine is
        // forgotten rather than read.
        let directory = scratch("six-acts");
        let replica = OrganizationStore::replica_path(&directory.join(Database::FILENAME), "six");
        let store = OrganizationStore::open(&replica, None, || async {
            Ok::<String, turso::Error>(String::new())
        })
        .await
        .expect("the replica");

        for statement in [
            "CREATE TABLE IF NOT EXISTS \"member\" (\"id\" TEXT PRIMARY KEY NOT NULL, \"username_sealed\" BLOB NOT NULL, \"permissions\" INTEGER NOT NULL)",
            "CREATE TABLE IF NOT EXISTS \"invitation\" (\"id\" TEXT PRIMARY KEY NOT NULL, \"member_id\" TEXT NOT NULL, \"expires_at\" INTEGER NOT NULL, \"consumed_at\" INTEGER, \"certificate_id\" TEXT NOT NULL, \"signature\" BLOB NOT NULL, \"created_at\" INTEGER NOT NULL)",
            "INSERT INTO \"member\" VALUES ('member-owner', X'00', 63)",
        ] {
            store
                .connection()
                .execute(statement, ())
                .await
                .expect("the six-act tables");
        }

        drop(store);
        std::fs::write(directory.join(RemoteSync::FILENAME), record("six")).expect("the record");

        let app_state = state_over(&directory).await;

        assert_eq!(
            forget_old_shape(&app_state)
                .await
                .expect("the check failed"),
            Some(OldShape::InvitationWithoutSealedSecret)
        );
        assert_eq!(replica_files(&directory), Vec::<String>::new());
        assert!(
            app_state
                .remote_sync
                .write()
                .await
                .store_mut()
                .organization
                .is_none()
        );

        // the shape before the member row carried a signing key: usernames and an invitation with
        // `sealed_secret`, and a `member` table without `signing_public_key`. Every member row
        // there is signed over the `member.v1` preimage, which no reader here builds, so the whole
        // replica would refuse on its first read rather than open.
        let directory = scratch("no-signing-key");
        let replica = OrganizationStore::replica_path(&directory.join(Database::FILENAME), "nokey");
        let store = OrganizationStore::open(&replica, None, || async {
            Ok::<String, turso::Error>(String::new())
        })
        .await
        .expect("the replica");

        for statement in [
            "CREATE TABLE IF NOT EXISTS \"member\" (\"id\" TEXT PRIMARY KEY NOT NULL, \"username_sealed\" BLOB NOT NULL, \"public_key\" BLOB NOT NULL, \"permissions\" INTEGER NOT NULL)",
            "CREATE TABLE IF NOT EXISTS \"invitation\" (\"id\" TEXT PRIMARY KEY NOT NULL, \"member_id\" TEXT NOT NULL, \"expires_at\" INTEGER NOT NULL, \"consumed_at\" INTEGER, \"sealed_secret\" BLOB NOT NULL, \"issued_by\" TEXT NOT NULL, \"certificate_id\" TEXT NOT NULL, \"signature\" BLOB NOT NULL, \"created_at\" INTEGER NOT NULL)",
            "INSERT INTO \"member\" VALUES ('member-owner', X'00', X'00', 127)",
        ] {
            store
                .connection()
                .execute(statement, ())
                .await
                .expect("the tables before the signing key");
        }

        drop(store);
        std::fs::write(directory.join(RemoteSync::FILENAME), record("nokey")).expect("the record");

        let app_state = state_over(&directory).await;

        assert_eq!(
            forget_old_shape(&app_state)
                .await
                .expect("the check failed"),
            Some(OldShape::MemberWithoutSigningKey)
        );
        assert_eq!(replica_files(&directory), Vec::<String>::new());
        assert!(
            app_state
                .remote_sync
                .write()
                .await
                .store_mut()
                .organization
                .is_none()
        );

        // the shape between the signing key and requirement 22: everything above, and a `member`
        // table with no `session_epoch`. No read of a member row survives the missing column, so
        // the machine is forgotten before anything reads one.
        let directory = scratch("no-session-epoch");
        let replica =
            OrganizationStore::replica_path(&directory.join(Database::FILENAME), "noepoch");
        let store = OrganizationStore::open(&replica, None, || async {
            Ok::<String, turso::Error>(String::new())
        })
        .await
        .expect("the replica");

        for statement in [
            "CREATE TABLE IF NOT EXISTS \"member\" (\"id\" TEXT PRIMARY KEY NOT NULL, \"username_sealed\" BLOB NOT NULL, \"public_key\" BLOB NOT NULL, \"signing_public_key\" BLOB NOT NULL, \"permissions\" INTEGER NOT NULL)",
            "CREATE TABLE IF NOT EXISTS \"invitation\" (\"id\" TEXT PRIMARY KEY NOT NULL, \"member_id\" TEXT NOT NULL, \"expires_at\" INTEGER NOT NULL, \"consumed_at\" INTEGER, \"sealed_secret\" BLOB NOT NULL, \"issued_by\" TEXT NOT NULL, \"certificate_id\" TEXT NOT NULL, \"signature\" BLOB NOT NULL, \"created_at\" INTEGER NOT NULL)",
            "INSERT INTO \"member\" VALUES ('member-owner', X'00', X'00', X'00', 127)",
        ] {
            store
                .connection()
                .execute(statement, ())
                .await
                .expect("the tables before the session epoch");
        }

        drop(store);
        std::fs::write(directory.join(RemoteSync::FILENAME), record("noepoch"))
            .expect("the record");

        let app_state = state_over(&directory).await;

        assert_eq!(
            forget_old_shape(&app_state)
                .await
                .expect("the check failed"),
            Some(OldShape::MemberWithoutSessionEpoch)
        );
        assert_eq!(replica_files(&directory), Vec::<String>::new());
        assert!(
            app_state
                .remote_sync
                .write()
                .await
                .store_mut()
                .organization
                .is_none()
        );

        // an invitation table with no `code_seal` is this build's own shape, and is kept. Effort
        // 826 read that absence as the old shape; effort 828 moved the seal into the link's own
        // text and dropped the column, so the sign had to go with it or every replica this build
        // writes would be wiped at launch.
        let directory = scratch("no-code-seal");
        let replica =
            OrganizationStore::replica_path(&directory.join(Database::FILENAME), "nocode");
        let store = OrganizationStore::open(&replica, None, || async {
            Ok::<String, turso::Error>(String::new())
        })
        .await
        .expect("the replica");

        for statement in [
            "CREATE TABLE IF NOT EXISTS \"member\" (\"id\" TEXT PRIMARY KEY NOT NULL, \"username_sealed\" BLOB NOT NULL, \"public_key\" BLOB NOT NULL, \"signing_public_key\" BLOB NOT NULL, \"permissions\" INTEGER NOT NULL, \"session_epoch\" INTEGER NOT NULL DEFAULT 0)",
            "CREATE TABLE IF NOT EXISTS \"invitation\" (\"id\" TEXT PRIMARY KEY NOT NULL, \"member_id\" TEXT NOT NULL, \"expires_at\" INTEGER NOT NULL, \"consumed_at\" INTEGER, \"sealed_secret\" BLOB NOT NULL, \"issued_by\" TEXT NOT NULL, \"certificate_id\" TEXT NOT NULL, \"signature\" BLOB NOT NULL, \"created_at\" INTEGER NOT NULL)",
            "INSERT INTO \"member\" VALUES ('member-owner', X'00', X'00', X'00', 127, 0)",
        ] {
            store
                .connection()
                .execute(statement, ())
                .await
                .expect("the tables of this build's shape");
        }

        drop(store);
        std::fs::write(directory.join(RemoteSync::FILENAME), record("nocode")).expect("the record");

        let app_state = state_over(&directory).await;

        assert_eq!(
            forget_old_shape(&app_state)
                .await
                .expect("the check failed"),
            None,
            "an invitation table with no code_seal was read as the old shape"
        );
        assert!(
            replica_files(&directory)
                .iter()
                .any(|name| name == "org-nocode.db"),
            "the replica was swept"
        );

        // no replica at all behind the record.
        let directory = scratch("missing");

        std::fs::write(directory.join(RemoteSync::FILENAME), record("gone")).expect("the record");

        let app_state = state_over(&directory).await;
        let forgotten = forget_old_shape(&app_state)
            .await
            .expect("the check failed");

        assert!(
            matches!(forgotten, Some(OldShape::ReplicaMissing(ref path)) if path.ends_with("org-gone.db")),
            "{forgotten:?}"
        );

        // and this build's own shape is left alone: the first run's replica, with the username
        // column, and the record naming it.
        let directory = scratch("kept");
        let (organization, held) = created(&directory).await;

        drop(organization);

        let app_state = state_over(&directory).await;

        assert_eq!(forget_old_shape(&app_state).await.expect("the check"), None);
        assert_eq!(
            app_state
                .remote_sync
                .write()
                .await
                .store_mut()
                .organization
                .as_ref(),
            Some(&held)
        );
        assert!(
            replica_files(&directory)
                .iter()
                .any(|name| name == &format!("org-{}.db", held.id))
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
        let _turn = crate::keyring::take_the_credential_store().await;
        let directory = scratch("deleted");
        let (organization, held) = created(&directory).await;

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
            forget_deleted_organization(&app_state)
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
                .organization
                .is_none()
        );
        assert!(app_state.organization.read().await.is_none());

        // a credential the remote will not accept is not a deleted organization: the machine keeps
        // what it holds and the shell renews or reconnects.
        let directory = scratch("refused");
        let (organization, held) = created(&directory).await;

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
            !forget_deleted_organization(&app_state)
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
        let (organization, held) = created(&directory).await;

        drop(organization);

        let unreachable =
            ScriptedServer::start((0..8).map(|_| ScriptedResponse::hangup()).collect()).await;
        let app_state = state_over(&directory).await;

        *app_state.organization.write().await =
            Some(replica_against(&directory, &held, &unreachable.url("")).await);

        assert!(
            !forget_deleted_organization(&app_state)
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
