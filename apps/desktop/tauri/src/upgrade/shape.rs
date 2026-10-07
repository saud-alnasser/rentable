//! what a machine holds in a shape this build replaced, found at startup and forgotten: the old
//! shape of this machine's record and of the organization replica it names (effort 824,
//! requirement 17).
//!
//! **Two halves, one of them not here.** What `remote-sync.json` carried before a machine held one
//! organization, the `organizations` list, is read into the record as it lies and kept there until
//! this check has seen it (`machine::RemoteSyncStore::organizations_of_the_old_shape`): the record
//! is what reads it, so the field stays on the record. The spellings older installs wrote that no
//! type claims any more, a `provider` of `"googleDrive"` or `"hosted"`, an `accounts` list and a
//! `controlPlaneSession`, are dropped on read, and the tests at the foot of this file hold both.
//! What this file holds is the check that reads those signs and forgets what each one concerns,
//! through the one forget a disconnect uses (`organization/session/forget.rs`): the organizations
//! the old list named, or the one held organization whose replica carries the sign. *It forgot
//! everything the machine held, whichever sign it read, until effort 851 gave a machine several
//! organizations, and one built before this build says nothing about the others.* *It was part of
//! `organization/forget.rs`, and those tests of `sync/store.rs` and then `machine/record.rs`,
//! until effort 840 (ticket 48).*
//!
//! **The old shape, and why it is forgotten rather than migrated.** Nothing was published, so a
//! machine holding what 819 built holds test data of its own, and the human decided on 2026-09-13
//! to start over rather than carry it. Eight signs, any one of which is the old shape: the record
//! still carries a non-empty `organizations` list, which is what a machine that had joined
//! several kept; the held organization's replica file is missing, which is a record with nothing
//! behind it; that replica's `member` table has no `username_sealed` column, which is the
//! schema before ticket 09; its `invitation` table has no `sealed_secret` column, which is
//! every replica written before effort 826 changed what bits 4 and 5 of `member.permissions`
//! mean; its `member` table has no `signing_public_key` column, which is every replica
//! written before the same effort gave an owner something to certify a widened member against;
//! its `member` table has no `session_epoch` column, which is every replica written before the
//! same effort gave a member a run of sessions to be signed out of (requirement 22); and its
//! `member` table has no `owner_seed_sealed` column, which is every replica written before effort
//! 828's requirement 22 gave the founder's key a row to be handed over in, and which every read of
//! a member row names. The last five are a local read of the replica's schema, before any pull,
//! so an unreachable remote does not stop the check. It runs on the first
//! `organization_session_state_get` of a launch, before anything else opens the replica.
//!
//! *There was a ninth sign, and effort 838 both added it and retired it (ticket 22).*
//! A replica with no `format` table is every organization made before effort 838's format break,
//! and the sign forgot it at launch. That was right while such an organization could only be
//! refused; since the human's call of 2026-09-26 its owner's sign-in, resume or connect upgrades
//! it in place (`format/runner/`), and a machine that had forgotten it would have nothing left to
//! upgrade, and would have lost the Turso authority with it. So a replica of that format is kept,
//! the owner's machine upgrades it, and every other machine pulls before it answers, going on once
//! the upgrade has arrived and told it waits for its owner until then (ticket 23).
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

use std::{fmt, path::PathBuf};

use crate::{
    clock,
    credential::CredentialStore,
    diagnostics,
    error::Error,
    organization::Shared,
    organization::{
        HeldOrganization,
        session::forget::{forget_one, forget_the_old_list},
        store::OrganizationStore,
    },
    turso::consent::{Account, forget_platform_token},
};

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
    /// the held organization's `member` table carries no `owner_seed_sealed`, the column effort
    /// 828 added for its requirement 22; every read of a member row names it, so a replica written
    /// without it answers nothing at all, and the column is under the member signature, so a row
    /// written before it hashes a preimage no reader here builds.
    MemberWithoutOwnerSeed,
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
            Self::MemberWithoutOwnerSeed => formatter
                .write_str("the held organization's member table carries no owner_seed_sealed"),
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

/// The column a member has carried since effort 828 gave ownership somewhere to be handed over
/// (requirement 22), whose absence marks a replica whose member rows no read here can answer and
/// whose signatures no reader here can rebuild.
const OWNER_SEED_COLUMN: &str = "owner_seed_sealed";

/// Forget what the machine holds in the old shape, and say which sign was read first.
///
/// The check reads the record and, for each organization held, its replica's schema, and nothing
/// else; it opens no vault and pulls nothing. The old list is forgotten whole, and each held
/// organization whose replica carries a sign is forgotten on its own; every other organization
/// held keeps all of its own (effort 851, requirement 5). `None` is a machine whose shape is this
/// build's, held organizations or not.
pub(crate) async fn forget_old_shape(
    app_state: &Shared,
    credentials: &dyn CredentialStore,
    clock: &clock::Shared,
) -> Result<Option<OldShape>, Error> {
    let (listed, held, to_move) = {
        let mut remote_sync = app_state.remote_sync.write().await;
        let store = remote_sync.store_mut();

        (
            store.organizations_of_the_old_shape.len(),
            store.held_organizations.clone(),
            store.consent_to_move.clone(),
        )
    };
    let mut first = None;
    let mut its_consent_forgotten = listed > 0;

    if listed > 0 {
        let shape = OldShape::SeveralOrganizations(listed);

        diagnostics::warn("organization.forgotten.oldShape")
            .with("reason", shape.to_string())
            .write();

        forget_the_old_list(app_state, credentials).await?;
        first = Some(shape);
    }

    for held in &held {
        let Some(shape) = old_shape(app_state, clock, held).await? else {
            continue;
        };

        diagnostics::warn("organization.forgotten.oldShape")
            .with("organization", held.id.as_str())
            .with("reason", shape.to_string())
            .write();

        forget_one(app_state, credentials, &held.id).await?;
        first.get_or_insert(shape);
        its_consent_forgotten |= to_move.as_deref() == Some(held.id.as_str());
    }

    let Some(shape) = first else {
        return Ok(None);
    };

    // and the consent an earlier build filed for what was just forgotten, which this check runs
    // before the launch moves it to its organization (`upgrade/consent.rs`): nothing is left for
    // it to move to (effort 851, requirement 14). **Only where the pending slot is known to hold
    // that consent**: the old list, which only a record from before 2026-09-13 carries, or the
    // organization the load converted (`machine::RemoteSyncStore::consent_to_move`). Anywhere else
    // the slot holds what a setup granted for an organization not made yet, and an organization
    // held beside it reading as the old shape says nothing about it. The Turso organization looked
    // up for the consent goes with it, so the next consent is not built on this one's account.
    if its_consent_forgotten {
        forget_platform_token(credentials, &Account::Pending)?;

        let mut remote_sync = app_state.remote_sync.write().await;
        let store = remote_sync.store_mut();

        store.forget_consent_organization(None);
        store.consent_to_move = None;
        store.commit()?;
    }

    Ok(Some(shape))
}

/// The sign that the held organization `held` was built before this build, where there is one.
async fn old_shape(
    app_state: &Shared,
    clock: &clock::Shared,
    held: &HeldOrganization,
) -> Result<Option<OldShape>, Error> {
    let database_path = { app_state.settings.read().await.database_path.clone() };
    let replica = OrganizationStore::replica_path(&database_path, &held.id);

    if !replica.exists() {
        return Ok(Some(OldShape::ReplicaMissing(replica)));
    }

    // opened with no remote, so the engine serves the file and reaches nothing; dropped before
    // anything else opens it.
    let store = OrganizationStore::open(clock.clone(), &replica, None, || async {
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

    // last of the member signs, because a replica missing it alone is the newest of them: it was
    // written inside effort 828, before the transfer of ownership gave the founder's key a row.
    if !member_columns
        .iter()
        .any(|column| column == OWNER_SEED_COLUMN)
    {
        return Ok(Some(OldShape::MemberWithoutOwnerSeed));
    }

    Ok(None)
}

#[cfg(test)]
mod tests {
    use crate::credential::{CredentialStore, Memory};

    use std::sync::{Arc, Mutex};

    use serde_json::json;
    use tokio::sync::RwLock;

    use super::{OldShape, forget_old_shape};
    use crate::test::scratch;
    use crate::{
        database::Database,
        machine::{RemoteSync, RemoteSyncStore},
        organization::Shared,
        organization::{
            HeldOrganization,
            member::vault::KdfParams,
            setup::{CreateOrganization, Remote, create_organization},
            store::OrganizationStore,
        },
        persisted::{Persistable as _, Persisted},
        settings::Settings,
        sync::test::server::{ScriptedResponse, ScriptedServer},
        turso::{
            consent::{
                Account, TursoConsent, holds_platform_token, platform_token, store_platform_token,
            },
            discovery::{McpEndpoint, TursoOrganization},
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

    /// The names of every replica file under the directory, sorted.
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
            credentials: Arc::new(crate::credential::Memory::new()),
            consent: Arc::new(TursoConsent::new()),
            organization: Arc::new(RwLock::new(None)),
            member: Arc::new(RwLock::new(None)),
            arriving_link: Arc::new(Mutex::new(None)),
            signed_out_elsewhere: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            held_by_version: Arc::new(std::sync::Mutex::new(None)),
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

    /// Criterion 17, the record of two: a `remote-sync.json` still carrying `organizations` is
    /// the old shape, and the first state read forgets it, replicas and all, saying why.
    #[tokio::test]
    async fn a_record_listing_organizations_is_forgotten_at_startup() {
        let credentials = Memory::new();
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
        let forgotten = forget_old_shape(&app_state, &credentials, &crate::clock::System::shared())
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
        assert_eq!(
            forget_old_shape(&app_state, &credentials, &crate::clock::System::shared())
                .await
                .expect("the check"),
            None
        );
    }

    /// Criterion 17, the old schema, and criterion 19 of effort 826: a held organization whose
    /// replica's `member` table carries no `username_sealed` is forgotten at startup, before
    /// anything reads it; one whose `invitation` table still carries `sealed_payload` is
    /// forgotten; one written under the six-act permission table, whose `invitation` table carries
    /// no `sealed_secret`, is forgotten; one whose `member` table carries no `signing_public_key`
    /// is forgotten; one whose `member` table carries no `session_epoch` is forgotten, which is
    /// requirement 22's; one whose replica is not on disk at all is forgotten the same way; and one
    /// of this build's shape is kept, `code_seal` gone with effort 828 and all, and so is one with
    /// no `format` table, which is every organization before effort 838's format break and which
    /// its owner's machine upgrades (ticket 22).
    #[tokio::test]
    async fn a_replica_of_the_old_schema_or_none_at_all_is_forgotten_at_startup() {
        let credentials = Memory::new();

        // the old schema: the member table as 819 wrote it, with an email and a display name.
        let directory = scratch("old-schema");
        let replica = OrganizationStore::replica_path(&directory.join(Database::FILENAME), "old");
        let store =
            OrganizationStore::open(crate::clock::System::shared(), &replica, None, || async {
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
            forget_old_shape(&app_state, &credentials, &crate::clock::System::shared())
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
                .selected()
                .is_none()
        );

        // the shape between tickets 10 and 11: usernames, and an invitation with its sealed half.
        let directory = scratch("sealed-half");
        let replica = OrganizationStore::replica_path(&directory.join(Database::FILENAME), "half");
        let store =
            OrganizationStore::open(crate::clock::System::shared(), &replica, None, || async {
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
            forget_old_shape(&app_state, &credentials, &crate::clock::System::shared())
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
        let store =
            OrganizationStore::open(crate::clock::System::shared(), &replica, None, || async {
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
            forget_old_shape(&app_state, &credentials, &crate::clock::System::shared())
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
                .selected()
                .is_none()
        );

        // the shape before the member row carried a signing key: usernames and an invitation with
        // `sealed_secret`, and a `member` table without `signing_public_key`. Every member row
        // there is signed over the `member.v1` preimage, which no reader here builds, so the whole
        // replica would refuse on its first read rather than open.
        let directory = scratch("no-signing-key");
        let replica = OrganizationStore::replica_path(&directory.join(Database::FILENAME), "nokey");
        let store =
            OrganizationStore::open(crate::clock::System::shared(), &replica, None, || async {
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
            forget_old_shape(&app_state, &credentials, &crate::clock::System::shared())
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
                .selected()
                .is_none()
        );

        // the shape between the signing key and requirement 22: everything above, and a `member`
        // table with no `session_epoch`. No read of a member row survives the missing column, so
        // the machine is forgotten before anything reads one.
        let directory = scratch("no-session-epoch");
        let replica =
            OrganizationStore::replica_path(&directory.join(Database::FILENAME), "noepoch");
        let store =
            OrganizationStore::open(crate::clock::System::shared(), &replica, None, || async {
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
            forget_old_shape(&app_state, &credentials, &crate::clock::System::shared())
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
                .selected()
                .is_none()
        );

        // ticket 20, the human's second ask: the shape written inside effort 828 before the
        // transfer of ownership gave the founder's key a row. Everything above is there and the
        // `member` table has no `owner_seed_sealed`; every read of a member row names the column,
        // so the machine is forgotten at launch and lands on the first screen rather than meeting
        // a failure on whatever it reads first.
        let directory = scratch("no-owner-seed");
        let replica =
            OrganizationStore::replica_path(&directory.join(Database::FILENAME), "noseed");
        let store =
            OrganizationStore::open(crate::clock::System::shared(), &replica, None, || async {
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
                .expect("the tables before the owner seed");
        }

        drop(store);
        std::fs::write(directory.join(RemoteSync::FILENAME), record("noseed")).expect("the record");

        let app_state = state_over(&directory).await;

        assert_eq!(
            forget_old_shape(&app_state, &credentials, &crate::clock::System::shared())
                .await
                .expect("the check failed"),
            Some(OldShape::MemberWithoutOwnerSeed)
        );
        assert_eq!(replica_files(&directory), Vec::<String>::new());
        assert!(
            app_state
                .remote_sync
                .write()
                .await
                .store_mut()
                .selected()
                .is_none(),
            "the organization was not forgotten"
        );

        // an invitation table with no `code_seal` is this build's own shape, and is kept. Effort
        // 826 read that absence as the old shape; effort 828 moved the seal into the link's own
        // text and dropped the column, so the sign had to go with it or every replica this build
        // writes would be wiped at launch.
        let directory = scratch("no-code-seal");
        let replica =
            OrganizationStore::replica_path(&directory.join(Database::FILENAME), "nocode");
        let store =
            OrganizationStore::open(crate::clock::System::shared(), &replica, None, || async {
                Ok::<String, turso::Error>(String::new())
            })
            .await
            .expect("the replica");

        for statement in [
            "CREATE TABLE IF NOT EXISTS \"member\" (\"id\" TEXT PRIMARY KEY NOT NULL, \"username_sealed\" BLOB NOT NULL, \"public_key\" BLOB NOT NULL, \"signing_public_key\" BLOB NOT NULL, \"permissions\" INTEGER NOT NULL, \"session_epoch\" INTEGER NOT NULL DEFAULT 0, \"owner_seed_sealed\" BLOB)",
            "CREATE TABLE IF NOT EXISTS \"invitation\" (\"id\" TEXT PRIMARY KEY NOT NULL, \"member_id\" TEXT NOT NULL, \"expires_at\" INTEGER NOT NULL, \"consumed_at\" INTEGER, \"sealed_secret\" BLOB NOT NULL, \"issued_by\" TEXT NOT NULL, \"certificate_id\" TEXT NOT NULL, \"signature\" BLOB NOT NULL, \"created_at\" INTEGER NOT NULL)",
            "INSERT INTO \"member\" VALUES ('member-owner', X'00', X'00', X'00', 127, 0, NULL)",
            "CREATE TABLE IF NOT EXISTS \"format\" (\"id\" TEXT PRIMARY KEY NOT NULL, \"version\" INTEGER NOT NULL)",
            "INSERT INTO \"format\" VALUES ('format', 2)",
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
            forget_old_shape(&app_state, &credentials, &crate::clock::System::shared())
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

        // effort 838, ticket 22: an organization with no `format` table, which is every one made
        // before the format break, is kept, because its owner's sign-in, resume or connect
        // upgrades it in place and a machine that had forgotten it would have nothing left to
        // upgrade.
        let directory = scratch("no-format");
        let (organization, held) = created(&credentials, &directory).await;

        organization
            .connection()
            .execute("DROP TABLE \"format\"", ())
            .await
            .expect("the format table taken away");
        drop(organization);

        let app_state = state_over(&directory).await;

        assert_eq!(
            forget_old_shape(&app_state, &credentials, &crate::clock::System::shared())
                .await
                .expect("the check failed"),
            None,
            "an organization with no format table was read as the old shape"
        );
        assert!(
            replica_files(&directory)
                .iter()
                .any(|name| name == &format!("org-{}.db", held.id)),
            "the replica was swept"
        );
        assert_eq!(
            app_state.remote_sync.write().await.store_mut().selected(),
            Some(&held),
            "{} was forgotten",
            held.id
        );

        // no replica at all behind the record.
        let directory = scratch("missing");

        std::fs::write(directory.join(RemoteSync::FILENAME), record("gone")).expect("the record");

        let app_state = state_over(&directory).await;
        let forgotten = forget_old_shape(&app_state, &credentials, &crate::clock::System::shared())
            .await
            .expect("the check failed");

        assert!(
            matches!(forgotten, Some(OldShape::ReplicaMissing(ref path)) if path.ends_with("org-gone.db")),
            "{forgotten:?}"
        );

        // and this build's own shape is left alone: the first run's replica, with the username
        // column, and the record naming it.
        let directory = scratch("kept");
        let (organization, held) = created(&credentials, &directory).await;

        drop(organization);

        let app_state = state_over(&directory).await;

        assert_eq!(
            forget_old_shape(&app_state, &credentials, &crate::clock::System::shared())
                .await
                .expect("the check"),
            None
        );
        assert_eq!(
            app_state.remote_sync.write().await.store_mut().selected(),
            Some(&held)
        );
        assert!(
            replica_files(&directory)
                .iter()
                .any(|name| name == &format!("org-{}.db", held.id))
        );
    }

    /// **The pending consent goes with an organization read as the old shape only where it was
    /// known to be that organization's** (effort 851, requirement 14). A setup for another
    /// organization waits with its consent and its Turso organization while this build's record
    /// holds one organization of this build's shape and one whose replica is gone: the second is
    /// forgotten, and the setup's consent and its Turso organization are kept. Where the load
    /// converted a record an earlier build wrote, the pending slot is that organization's consent,
    /// and it goes with the organization, with whatever Turso organization the record named for it.
    #[tokio::test]
    async fn a_setups_consent_outlives_another_organization_read_as_the_old_shape() {
        let setup = TursoOrganization {
            slug: "beta".to_string(),
            group: "rentable".to_string(),
        };

        // this build's record, mid "add organization".
        let credentials = Memory::new();
        let directory = scratch("pending-beside-missing");
        let (organization, held) = created(&credentials, &directory).await;

        drop(organization);

        {
            let mut store =
                Persisted::<RemoteSyncStore>::load(directory.join(RemoteSync::FILENAME))
                    .expect("the store");

            store.hold(HeldOrganization {
                id: "gone".to_string(),
                name: "Gone".to_string(),
                verifying_key: "k".to_string(),
                remote_url: "libsql://org.example".to_string(),
                ..Default::default()
            });
            store.select(&held.id);
            store.remember_consent_organization(None, setup.clone());
            store.commit().expect("the record");
        }

        store_platform_token(&credentials, "a-setups-consent").expect("the consent");

        let app_state = state_over(&directory).await;
        let forgotten = forget_old_shape(&app_state, &credentials, &crate::clock::System::shared())
            .await
            .expect("the check failed");

        assert!(
            matches!(forgotten, Some(OldShape::ReplicaMissing(_))),
            "{forgotten:?}"
        );
        assert_eq!(
            platform_token(&credentials, &Account::Pending).as_deref(),
            Ok("a-setups-consent"),
            "the setup's consent went with an organization it was never over"
        );
        {
            let mut remote_sync = app_state.remote_sync.write().await;
            let record = remote_sync.store_mut();

            assert_eq!(record.held("gone"), None);
            assert_eq!(record.consent_organization(None), Some(&setup));
        }

        // a record an earlier build wrote, converted at this load, whose one organization has no
        // replica: the pending slot was its consent, and both go.
        let credentials = Memory::new();
        let directory = scratch("converted-missing");

        std::fs::write(
            directory.join(RemoteSync::FILENAME),
            r#"{"tursoOrganization":{"slug":"acme","group":"rentable"},"pendingTursoOrganization":{"slug":"stale","group":"rentable"},"organization":{"id":"gone","name":"Acme","verifyingKey":"k","remoteUrl":"libsql://org.example","memberId":"me","role":"owner","joinedAt":1}}"#,
        )
        .expect("the record");
        store_platform_token(&credentials, "the-releases-consent").expect("the consent");

        let app_state = state_over(&directory).await;

        assert!(
            forget_old_shape(&app_state, &credentials, &crate::clock::System::shared())
                .await
                .expect("the check failed")
                .is_some()
        );
        assert!(
            !holds_platform_token(&credentials, &Account::Pending).expect("the store"),
            "the forgotten organization's consent was kept"
        );

        let mut remote_sync = app_state.remote_sync.write().await;
        let record = remote_sync.store_mut();

        assert_eq!(
            record.consent_organization(None),
            None,
            "the Turso organization outlived the consent it was looked up for"
        );
        assert_eq!(record.consent_to_move, None);
    }

    /// A store written by an older install, with a `provider` of `"googleDrive"` or `"hosted"`, an
    /// `accounts` list or a `controlPlaneSession`, still reads, and that is the whole of the
    /// migration: those spellings are **dropped rather than migrated**, because `RemoteSyncStore` and every
    /// struct under it derive `Deserialize` without `deny_unknown_fields`, so serde ignores a
    /// field no type claims. An install holding any of them loads unchanged and writes them away
    /// on its next commit; a replica tracked under an account id reads under the member's name.
    ///
    /// Asserted rather than reasoned about: adding `deny_unknown_fields` anywhere on this path
    /// would make every store on a developer machine unreadable, and nothing in
    /// `machine/record.rs` would notice.
    #[test]
    fn a_store_written_while_the_mode_existed_still_reads() {
        for written in ["\"local\"", "\"googleDrive\"", "\"hosted\""] {
            let store: RemoteSyncStore = serde_json::from_str(&format!(
                "{{\"workspace\":{{\"id\":\"workspace-1\",\"provider\":{written},\"name\":\"Primary workspace\"}},\"accounts\":[{{\"id\":\"account-1\",\"provider\":{written},\"email\":\"person@example.com\"}}],\"controlPlaneSession\":{{\"accountId\":\"account-1\",\"expiresAt\":1}},\"replicas\":[{{\"workspaceId\":\"ws-1\",\"accountId\":\"account-1\",\"createdAt\":1}}]}}"
            ))
            .expect("a store written with a provider should still read");

            assert_eq!(
                store.workspace.id, "workspace-1",
                "{written} lost the workspace"
            );
            assert_eq!(store.replicas.len(), 1, "{written} lost the replica");
            assert_eq!(
                store.replicas[0].member_id, "account-1",
                "{written} lost who the replica was held for"
            );
        }
    }

    /// **A record written when a machine held a list still reads, and the list is kept as the
    /// sign it is.** `organizations` lands in the field the startup check reads and never in
    /// `organization`; it is written back as long as it is non-empty, so a commit made before
    /// the check does not erase the sign; and a record of the new shape never carries the key.
    #[test]
    fn a_record_of_the_old_shape_keeps_its_list_as_the_sign_the_startup_check_reads() {
        let mut store: RemoteSyncStore = serde_json::from_str(
            r#"{"workspace":{"id":"workspace-1","name":"Riyadh"},"organizations":[{"id":"a","name":"Acme","verifyingKey":"k","remoteUrl":"libsql://a","memberId":"me","role":"owner","joinedAt":1},{"id":"b","name":"Beta","verifyingKey":"k","remoteUrl":"libsql://b","memberId":"me","role":"member","joinedAt":2}]}"#,
        )
        .expect("a record of the old shape did not read");

        assert_eq!(store.selected(), None, "the list was read as the one held");
        assert_eq!(store.organizations_of_the_old_shape.len(), 2);

        let written = serde_json::to_string(&store).expect("serialised");

        assert!(
            written.contains("\"organizations\":[") && written.contains("Beta"),
            "the sign was dropped on write: {written}"
        );

        store.organizations_of_the_old_shape.clear();

        let written = serde_json::to_string(&store).expect("serialised");

        assert!(
            !written.contains("organizations\""),
            "a record of the new shape carries the old key: {written}"
        );
        assert!(written.contains("\"organization\":null"), "{written}");
    }

    /// **The list this build writes is not the list it forgets the machine over** (effort 851).
    /// `heldOrganizations` reads into the record's list and never into the old shape's sign, and
    /// a record holding several organizations is written without the `organizations` key the
    /// startup check and every older build read as the shape effort 824 retired.
    #[test]
    fn a_record_holding_a_list_of_this_builds_shape_is_never_read_as_the_old_shape() {
        let mut store: RemoteSyncStore = serde_json::from_str(
            r#"{"workspace":{"id":"workspace-1","name":"Riyadh"},"heldOrganizations":[{"id":"a","name":"Acme","verifyingKey":"k","remoteUrl":"libsql://a","memberId":"me","role":"owner","joinedAt":1},{"id":"b","name":"Beta","verifyingKey":"k","remoteUrl":"libsql://b","memberId":"me","role":"member","joinedAt":2}],"selectedOrganization":"b"}"#,
        )
        .expect("a record of this build's shape did not read");

        store.sanitize();

        assert!(
            store.organizations_of_the_old_shape.is_empty(),
            "the list was read as the old shape's sign"
        );
        assert_eq!(store.held_organizations.len(), 2);

        let written = serde_json::to_string(&store).expect("serialised");

        assert!(
            !written.contains("\"organizations\""),
            "a record of this build's shape carries the old key: {written}"
        );
        assert!(written.contains("\"heldOrganizations\":["), "{written}");
        assert!(
            written.contains("\"organization\":{\"id\":\"b\""),
            "the selected organization is not under the old key: {written}"
        );
    }
}
