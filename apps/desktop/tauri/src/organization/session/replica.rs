//! the organization replica a session opens on this machine: opened in this build's format, or
//! upgraded by its owner where an earlier one made it; the launch's resume through it; and this
//! machine's row in the registry, written at the launch and taken out at a disconnect.

use std::sync::{Arc, Mutex, atomic::Ordering};

use crate::{clock, credential::Credentials, diagnostics, error::Error, organization::Shared};

use super::heartbeat::ended_elsewhere;
use crate::organization::{
    HeldOrganization,
    act::owner_platform,
    invitation::{self},
    ownership,
    session::{self, CredentialSlot, Resumption},
    store::{self, OrganizationStore},
};

/// Sign in with the key this machine filed at the last sign-in, where it has one and nobody is in
/// yet: the launch that goes straight past the wall (effort 826, requirement 12).
///
/// **Nothing here is a failure.** A record naming no member, an empty keyring, a key that no
/// longer opens the vault, a replica that will not open: every one of them leaves the `member`
/// slot empty, which is the wall, and the person signs in as they did before. So this answers
/// with nothing and writes what happened to the diagnostics log.
///
/// The replica is opened the way `organization_session_sign_in` opens it, through the same call, so
/// a resumed session reaches its remote on exactly the terms a typed one does.
///
/// **What the organization says now is read the way the heartbeat reads it**, once the session is
/// open and its vault can pay for the pull: one call of [`ended_elsewhere`], which pulls, follows
/// a succession where the rows that arrived ask for one, and signs out where the row has moved
/// on. A machine closed across a handover launches on a replica that has not received it, and
/// following the succession before the pull finds nothing to follow; the follow that matters is
/// the one after, and it is the heartbeat's (effort 828, requirement 22). The one before the vault
/// opens stays for a replica that already holds the re-keyed rows, which is what reads the member
/// row the key has to open.
pub(super) async fn resume_remembered(
    app_state: &Shared,
    credentials: &Credentials,
    clock: &clock::Shared,
) {
    if app_state.member.read().await.is_some() {
        return;
    }

    let held = {
        let mut remote_sync = app_state.remote_sync.write().await;

        remote_sync.store_mut().organization.clone()
    };
    let Some(held) = held.filter(|held| held.member_id.is_some()) else {
        return;
    };

    let resumed =
        match open_replica(app_state, credentials, clock, &held, Opening::Remembered).await {
            Ok((store, credential)) => {
                // a replica that already holds a handover this machine has not followed: the
                // succession is followed before the remembered key opens anything, so the resume
                // reads the member row under the key the rows are on (effort 828, requirement 22).
                // A handover the replica has not received yet is followed after the pull, below.
                let held = {
                    let mut remote_sync = app_state.remote_sync.write().await;

                    match ownership::follow_succession(&store, remote_sync.store_mut()).await {
                        Ok(Some(_)) => remote_sync
                            .store_mut()
                            .organization
                            .clone()
                            .unwrap_or_else(|| held.clone()),
                        Ok(None) => held.clone(),
                        Err(refusal) => {
                            diagnostics::warn("organization.succession.notFollowed")
                                .with("reason", refusal.to_string())
                                .write();

                            held.clone()
                        }
                    }
                };

                session::resume(credentials.as_ref(), &store, &held, &credential)
                    .await
                    .map(|resumption| (store, resumption))
            }
            Err(refusal) => Err(refusal),
        };

    let (store, member) = match resumed {
        Ok((store, Resumption::Opened(member))) => (store, *member),
        // the sessions were ended from another machine while this one was closed: the wall goes
        // up with the sentence for it rather than with the one every other launch shows.
        Ok((_, Resumption::SignedOutElsewhere)) => {
            app_state.signed_out_elsewhere.store(true, Ordering::SeqCst);

            diagnostics::info("organization.session.notResumed")
                .with("organization", held.id.as_str())
                .with("reason", "the sessions were ended from another machine")
                .write();

            return;
        }
        Err(refusal) => {
            diagnostics::info("organization.session.notResumed")
                .with("organization", held.id.as_str())
                .with("reason", refusal.to_string())
                .write();

            return;
        }
    };

    *app_state.organization.write().await = Some(store);
    *app_state.member.write().await = Some(member);

    // and what the organization says now, through the heartbeat's own check: the pull spends the
    // credential the vault just unsealed, a handover that arrives with it is followed and the
    // session re-pinned, and a row that moved on while this machine was closed puts the wall up
    // with the sentence for it. A pull that could not go is the offline case, and this machine
    // stays signed in on the rows it has (819's requirement 18).
    if ended_elsewhere(app_state, credentials.as_ref()).await {
        return;
    }

    diagnostics::info("organization.session.resumed")
        .with("organization", held.id.as_str())
        .write();
}

/// Say this machine is still here, and give a record written before this build the machine id it
/// has no field for: the launch's own write to the registry (effort 828, requirement 15).
///
/// **The id is drawn here for an old record and nowhere else.** A record from before the field
/// existed deserialises with an empty one rather than being refused, so the machine keeps what it
/// holds; this is the first launch that can give it one, and the row it writes below is that
/// machine's first. An id once drawn is never redrawn, so a machine keeps one row across every
/// launch after this.
///
/// **Only a launch that opened the replica writes a row**, which is a machine that came back
/// signed in. Reaching the organization database at all takes a credential a vault holds, so a
/// launch that stops at the wall has nothing to write through and nothing to write it under; the
/// sign-in that follows is what writes the row, and the id drawn here is the one it writes.
pub(super) async fn machine_registered(app_state: &Shared) -> Result<(), Error> {
    let held = {
        let mut remote_sync = app_state.remote_sync.write().await;
        let Some(held) = remote_sync.store_mut().organization.clone() else {
            return Ok(());
        };

        if !held.machine_id.is_empty() {
            held
        } else {
            let identified = HeldOrganization {
                machine_id: invitation::random_id()?,
                ..held
            };

            let record = remote_sync.store_mut();

            record.organization = Some(identified.clone());
            record.commit()?;

            diagnostics::info("organization.machine.identified")
                .with("organization", identified.id.as_str())
                .write();

            identified
        }
    };
    let organization = app_state.organization.read().await;

    if let Some(store) = organization.as_ref() {
        session::machine_seen(store, &held, held.member_id.as_deref(), store.clock().now()).await;
    }

    Ok(())
}

/// Take this machine out of the registry, through the replica that carries the delete: what a
/// disconnect does before it forgets the organization locally (effort 828, requirement 15).
///
/// **The replica is taken rather than borrowed**, so the sign-out `forget` performs next finds
/// none and writes nothing back: a machine that deleted its row and then said it was still here
/// would draw a standing line on its member's card for a week over a disconnect it performed
/// itself.
///
/// A disconnect from the wall has no replica open and leaves the row where it is, which the
/// seven-day window ages out. Nothing here is a refusal: the person asked to forget the
/// organization and that is what happens either way.
pub(crate) async fn leave_registry(app_state: &Shared) {
    let held = {
        let mut remote_sync = app_state.remote_sync.write().await;

        remote_sync.store_mut().organization.clone()
    };
    let Some(held) = held.filter(|held| !held.machine_id.is_empty()) else {
        return;
    };
    let Some(store) = app_state.organization.write().await.take() else {
        diagnostics::info("organization.machine.notUnregistered")
            .with("organization", held.id.as_str())
            .with("reason", "no replica is open on this machine")
            .write();

        return;
    };

    if let Err(refusal) = store.unregister_machine(&held.machine_id).await {
        diagnostics::warn("organization.machine.notUnregistered")
            .with("organization", held.id.as_str())
            .with("reason", refusal.to_string())
            .write();
    } else if !store.push().await {
        diagnostics::warn("organization.machine.unregisteredNotYetSent")
            .with("organization", held.id.as_str())
            .write();
    }
}

/// The organization replica on this machine, opened against its remote with a credential slot a
/// sign-in or a resume fills.
///
/// Built through the same call as every replica, so it opens whether or not the remote is
/// reachable; the token function answers from the slot, which is empty until a vault is open and
/// is what stops an open replica reaching the remote before anybody is in.
///
/// **An organization an earlier version made is upgraded here by its owner, and one of another
/// format refused and let go of** (effort 838, requirement 11 as amended, tickets 22 and 23). This
/// is where a sign-in and a launch's resume both reach what the machine holds, so the owner's
/// password, or the key their machine remembers, upgrades an older organization, or finishes an
/// upgrade cut short, before anything else reads it, and only once a push and a pull have both gone
/// (`upgrade/format/runner/`). Anybody else's machine pulls first, with the credential its own
/// grant holds, and goes on where the owner has upgraded; where the owner has not, it is refused as
/// waiting for its owner. A newer one is refused by name. Neither refusal reads a row of this
/// format or writes anything: no registry row and no push.
pub(super) async fn open_replica(
    app_state: &Shared,
    credentials: &Credentials,
    clock: &clock::Shared,
    held: &HeldOrganization,
    opening: Opening<'_>,
) -> Result<(OrganizationStore, CredentialSlot), Error> {
    let database_path = {
        let settings = app_state.settings.read().await;

        settings.database_path.clone()
    };
    let credential: CredentialSlot = Arc::new(Mutex::new(None));
    let slot = Arc::clone(&credential);
    let store = OrganizationStore::open(
        clock.clone(),
        &OrganizationStore::replica_path(&database_path, &held.id),
        Some(held.remote_url.clone()),
        move || {
            let slot = Arc::clone(&slot);

            async move {
                slot.lock()
                    .ok()
                    .and_then(|slot| slot.clone())
                    .ok_or_else(|| turso::Error::Misuse("no credential is unsealed yet".into()))
            }
        },
    )
    .await?;
    // the owner's account, where this machine holds its authority: what renews a lapsed grant
    // before the owner's upgrade pushes (ticket 25). It mints only for the owner, whom the upgrade
    // finds by key, and only where the grant is lapsed or gone.
    let account = owner_platform(app_state, credentials).await;

    match opening {
        Opening::Password { username, password } => {
            app_state
                .upgrade
                .with_password(
                    &store,
                    account,
                    held,
                    username,
                    password,
                    &credential,
                    store.clock().now(),
                )
                .await?
        }
        Opening::Remembered => {
            app_state
                .upgrade
                .with_remembered_key(
                    credentials.as_ref(),
                    &store,
                    account,
                    held,
                    &credential,
                    store.clock().now(),
                )
                .await?
        }
    }

    store.refuse_another_format().await?;
    read_in_this_format(app_state, held).await?;

    Ok((store, credential))
}

/// Keep on this machine's record that it has read the organization in this build's format, where
/// the record does not say so yet: a record written before the field existed, at its first
/// sign-in or resume past the format's refusal (effort 838, ticket 25). From then on the owner's
/// upgrade never transforms the organization on this machine, whatever its `format` row says.
async fn read_in_this_format(app_state: &Shared, held: &HeldOrganization) -> Result<(), Error> {
    if held.format == Some(store::FORMAT_VERSION) {
        return Ok(());
    }

    let mut remote_sync = app_state.remote_sync.write().await;
    let record = remote_sync.store_mut();

    if let Some(organization) = record
        .organization
        .as_mut()
        .filter(|organization| organization.id == held.id)
    {
        organization.format = Some(store::FORMAT_VERSION);
        record.commit()?;
    }

    Ok(())
}

/// What opens the replica: a username and password typed at the wall, or the key this machine
/// remembers for the member its record names. Either is what the owner's upgrade of an older
/// organization runs on.
#[derive(Clone, Copy)]
pub(super) enum Opening<'a> {
    Password {
        username: &'a str,
        password: &'a str,
    },
    Remembered,
}

#[cfg(test)]
mod tests {
    use crate::credential::{CredentialStore, Credentials, Memory};
    use crate::database::Database;
    use crate::error::Error;
    use crate::machine::{RemoteSync, RemoteSyncStore};
    use crate::organization::Shared;
    use crate::organization::authority::VERIFYING_KEY_BYTES;
    use crate::organization::invitation::link::JoinLink;
    use crate::organization::invitation::{self, join};
    use crate::organization::member::vault::KdfParams;
    use crate::organization::role::permission;
    use crate::organization::session::replica::{Opening, open_replica};
    use crate::organization::session::{self, CredentialSlot, MEMBER_KEY_SERVICE, state_of};
    use crate::organization::setup::{CreateOrganization, Remote, create_organization};
    use crate::organization::store::OrganizationStore;
    use crate::organization::{HeldOrganization, ownership};
    use crate::persisted::Persisted;
    use crate::settings::Settings;
    use crate::sync::test::server::{ScriptedResponse, ScriptedServer};
    use crate::test::scratch;
    use crate::turso::consent::TursoConsent;
    use crate::turso::discovery::McpEndpoint;
    use crate::turso::platform::InMemoryPlatform;
    use crate::update::Update;
    use serde_json::json;
    use std::sync::{Arc, Mutex};
    use tokio::sync::RwLock;

    const PASSWORD: &str = "the owners password";

    const USERNAME: &str = "olivia";

    const CREATED_AT: i64 = 1_757_000_000_000;

    fn test_cost() -> KdfParams {
        KdfParams {
            memory_kib: 1024,
            iterations: 2,
            lanes: 1,
        }
    }

    /// The organization's state over one data directory, as the plugins' setups build it, with
    /// nothing open and nobody in. *`forget.rs` and `invitation/join.rs` keep the same builder; a
    /// fixture is written out per module ([[rules/testing]]).*
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
            consent: Arc::new(TursoConsent::new()),
            organization: Arc::new(RwLock::new(None)),
            member: Arc::new(RwLock::new(None)),
            arriving_link: Arc::new(Mutex::new(None)),
            signed_out_elsewhere: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            old_shape_check: tokio::sync::OnceCell::new(),
        }
    }

    /// A machine that has run the first run: an organization on it, the owner's row recorded, and
    /// the owner's member key filed, which is what every launch after it starts from. Nobody is
    /// signed in here, because a launch is a fresh process.
    async fn first_run(credentials: &dyn CredentialStore, directory: &std::path::Path) -> Shared {
        let app_state = state_over(directory).await;
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

        {
            let mut remote_sync = app_state.remote_sync.write().await;

            create_organization(
                credentials,
                &crate::clock::System::shared(),
                remote_sync.store_mut(),
                "a-platform-token",
                &McpEndpoint::at(&mcp.url("")),
                |_| Arc::clone(&platform),
                Remote::none(),
                &directory.join(Database::FILENAME),
                CreateOrganization {
                    name: "Acme",
                    username: USERNAME,
                    password: PASSWORD,
                    group: None,
                },
                test_cost(),
                CREATED_AT,
            )
            .await
            .expect("the first run failed");
        }

        app_state
    }

    /// An empty credential slot, for a store opened against no remote.
    fn slot() -> CredentialSlot {
        Arc::new(Mutex::new(None))
    }

    /// What the record names: the organization and the member, which is what an entry is keyed on.
    async fn recorded(app_state: &Shared) -> (String, String) {
        let mut remote_sync = app_state.remote_sync.write().await;
        let held = remote_sync
            .store_mut()
            .organization
            .clone()
            .expect("the record names no organization");

        (held.id, held.member_id.expect("the record names no member"))
    }

    /// What is filed under a member's entry, or nothing where nothing is.
    fn filed(
        credentials: &dyn CredentialStore,
        organization_id: &str,
        member_id: &str,
    ) -> Option<String> {
        credentials
            .get(
                MEMBER_KEY_SERVICE,
                &format!("{organization_id}:{member_id}"),
            )
            .expect("the store would not answer")
    }

    /// The record this machine keeps about the organization it holds.
    async fn held(app_state: &Shared) -> HeldOrganization {
        let mut remote_sync = app_state.remote_sync.write().await;

        remote_sync
            .store_mut()
            .organization
            .clone()
            .expect("the record names no organization")
    }

    // -------------------------------------------------------------------------------------
    // Effort 828, requirement 22: the handover holds at its seams.
    // -------------------------------------------------------------------------------------

    /// What the settled manager chose when they opened their link, which is the password
    /// that becomes the organization's key when they accept it.
    const MANAGERS_PASSWORD: &str = "the managers password";

    /// A verifying key as a machine's record spells it.
    fn encoded(key: [u8; VERIFYING_KEY_BYTES]) -> String {
        base64::Engine::encode(&base64::engine::general_purpose::URL_SAFE_NO_PAD, key)
    }

    /// The organization's replica opened a second time over the same file: another machine, as
    /// far as the rows go, once a push and a pull have run between them. There is no remote here,
    /// so the file is what they share, and what one writes the other reads at once.
    async fn elsewhere(directory: &std::path::Path, organization_id: &str) -> OrganizationStore {
        OrganizationStore::open(
            crate::clock::System::shared(),
            &OrganizationStore::replica_path(&directory.join(Database::FILENAME), organization_id),
            None,
            || async { Ok::<String, turso::Error>(String::new()) },
        )
        .await
        .expect("the other machine's replica")
    }

    /// A manager who opened their link on a machine of their own and chose a password:
    /// the standing an offer of the organization needs. *`role/` keeps the same fixture; one is
    /// written out per module ([[rules/testing]]).*
    async fn a_settled_manager(
        credentials: &dyn CredentialStore,
        directory: &std::path::Path,
        store: &OrganizationStore,
        owner: &session::MemberSession,
        username: &'static str,
        password: &str,
    ) -> (String, session::MemberSession, Persisted<RemoteSyncStore>) {
        let link = invitation::locator(store, owner)
            .await
            .expect("the organization's locator");
        let invited = invitation::make_account_and_link(
            store,
            owner,
            None::<&InMemoryPlatform>,
            &link,
            invitation::Invitation {
                username,
                role: permission::MANAGER,
                workspaces: &[],
            },
            test_cost(),
            CREATED_AT,
        )
        .await
        .expect("the invitation failed");
        let theirs = directory.join(username);

        std::fs::create_dir_all(&theirs).expect("the machine directory");

        let mut machine = Persisted::<RemoteSyncStore>::load(theirs.join("remote-sync.json"))
            .expect("the record");
        let (_, session) = join::accept(
            credentials,
            |_| async { Ok::<_, crate::error::Error>(store) },
            &mut machine,
            &JoinLink::decode(&invited.join_link).expect("the invitation link"),
            &invited.code,
            password,
            test_cost(),
            CREATED_AT,
        )
        .await
        .expect("the account could not open its link");

        (invited.member_id, session, machine)
    }

    /// The handover, made on another machine: the founder offers the organization to a settled
    /// manager, who accepts on a machine of their own. Answers the key the organization is
    /// on afterwards, which the machine under test has not followed yet.
    async fn handed_over(
        credentials: &dyn CredentialStore,
        directory: &std::path::Path,
        app_state: &Shared,
    ) -> [u8; VERIFYING_KEY_BYTES] {
        let held = {
            let mut remote_sync = app_state.remote_sync.write().await;

            remote_sync
                .store_mut()
                .organization
                .clone()
                .expect("the record names no organization")
        };
        let theirs = elsewhere(directory, &held.id).await;
        let founder = session::sign_in(&theirs, &held, PASSWORD, &slot())
            .await
            .expect("the founder did not sign in on the other machine");
        let (ada, mut ada_session, mut ada_machine) = a_settled_manager(
            credentials,
            directory,
            &theirs,
            &founder,
            "ada.admin",
            MANAGERS_PASSWORD,
        )
        .await;

        ownership::offer_ownership(&theirs, &founder, &ada, PASSWORD, CREATED_AT + 1)
            .await
            .expect("the offer failed");
        ownership::accept_ownership(
            &theirs,
            &mut ada_session,
            &mut ada_machine,
            MANAGERS_PASSWORD,
            CREATED_AT + 2,
        )
        .await
        .expect("the acceptance failed");

        ada_session.verifying_key
    }

    /// What the record on this machine pins.
    async fn pinned(app_state: &Shared) -> String {
        let mut remote_sync = app_state.remote_sync.write().await;

        remote_sync
            .store_mut()
            .organization
            .as_ref()
            .expect("the record names no organization")
            .verifying_key
            .clone()
    }

    /// The key and the role the open session holds.
    async fn session_holds(app_state: &Shared) -> ([u8; VERIFYING_KEY_BYTES], String) {
        let member = app_state.member.read().await;
        let session = member.as_ref().expect("nobody is in");

        (session.verifying_key, session.role.clone())
    }

    /// **Criterion 2.** The record names a member, the `member` slot is empty, and the key that
    /// opens their vault is filed: the first state read of the launch opens it and answers with a
    /// session, so nothing ever draws the wall.
    #[tokio::test]
    async fn the_first_state_read_of_a_launch_resumes_the_remembered_session() {
        let credentials: Credentials = Arc::new(Memory::new());
        let directory = scratch("resume");
        let app_state = first_run(credentials.as_ref(), &directory).await;
        let (organization_id, member_id) = recorded(&app_state).await;

        assert!(
            filed(credentials.as_ref(), &organization_id, &member_id).is_some(),
            "the first run filed no member key"
        );
        assert!(
            app_state.member.read().await.is_none(),
            "a launch starts with nobody in"
        );

        let state = state_of(&app_state, &credentials, &crate::clock::System::shared())
            .await
            .expect("the state");
        let session = state.session.expect("the launch did not resume");

        assert_eq!(session.member_id, member_id);
        assert_eq!(session.username, USERNAME);
        assert_eq!(session.role, "owner");
        assert!(
            app_state.member.read().await.is_some(),
            "the session was answered with and not held"
        );
        assert!(
            app_state.organization.read().await.is_some(),
            "the replica was not held open"
        );
    }

    /// **Effort 838, ticket 25: the machine keeps that it has read the organization in this
    /// format, outside the organization database.** The first run records it; a record written
    /// before the field existed gains it at the first resume past the format's refusal; and it is
    /// the machine's own record, which nothing replicated reaches.
    #[tokio::test]
    async fn the_record_keeps_that_this_machine_has_read_the_organization_in_this_format() {
        let credentials: Credentials = Arc::new(Memory::new());
        let directory = scratch("format-kept");
        let app_state = first_run(credentials.as_ref(), &directory).await;

        assert_eq!(
            held(&app_state).await.format,
            Some(crate::organization::store::FORMAT_VERSION),
            "the first run did not keep the format it made the organization in"
        );

        // a record from before the field: the format forgotten, as an older build wrote it.
        {
            let mut remote_sync = app_state.remote_sync.write().await;
            let record = remote_sync.store_mut();

            if let Some(organization) = record.organization.as_mut() {
                organization.format = None;
            }

            record.commit().expect("the record");
        }

        let state = state_of(&app_state, &credentials, &crate::clock::System::shared())
            .await
            .expect("the state");

        assert!(state.session.is_some(), "the launch did not resume");
        assert_eq!(
            held(&app_state).await.format,
            Some(crate::organization::store::FORMAT_VERSION),
            "the resume did not keep the format it read the organization in"
        );
    }

    /// Everything the replica on disk holds, table by table and row by row, read through a store
    /// opened on the file with no remote and let go of again: a write anywhere changes it.
    async fn contents(path: &std::path::Path) -> Vec<(String, Vec<Vec<turso::Value>>)> {
        let store = OrganizationStore::open(crate::clock::System::shared(), path, None, || async {
            Ok::<String, turso::Error>(String::new())
        })
        .await
        .expect("the replica");
        let mut contents = Vec::new();

        for table in store.tables().await.expect("the tables") {
            let mut rows = store
                .connection()
                .query(&format!("SELECT * FROM \"{table}\" ORDER BY rowid"), ())
                .await
                .expect("the rows");
            let mut values = Vec::new();

            while let Some(row) = rows.next().await.expect("a row") {
                values.push(
                    (0..row.column_count())
                        .map(|index| row.get_value(index).expect("a value"))
                        .collect(),
                );
            }

            contents.push((table, values));
        }

        contents
    }

    /// Effort 838, requirement 11 and criterion 11, at the launch: **a held replica of another
    /// format is refused by name, and nothing is written to it.**
    ///
    /// The machine ran the first run and stayed signed in, so the launch would resume; then the
    /// organization's format moved under it. A newer format is format 3. An older one is the
    /// `format` row gone from a table that is still there, which is the one way this build's own
    /// organization comes to read as an earlier version's, and the table gone altogether over this
    /// build's member table is the other. Both read as an upgrade that wrote everything but its
    /// last row, which the owner finishes only against the organization's latest state (ticket
    /// 23). This machine is the owner's, and its push goes nowhere: the credential the first run
    /// minted is the in-memory platform's and no remote takes it, so the resume asks for a
    /// connection; `upgrade/format/runner/` tests the upgrade itself.
    ///
    /// Each of them: the launch leaves the wall up with no session and the organization
    /// still held, the replica the resume and the sign-in both open through refuses with its own
    /// reason, and the replica holds exactly what it held before, no registry row and no table
    /// gained.
    #[tokio::test]
    async fn a_held_replica_of_another_format_is_refused_at_the_launch_and_nothing_is_written() {
        let credentials: Credentials = Arc::new(Memory::new());

        // a format past the one this build ships, whichever that is.
        let newer = format!(
            "UPDATE \"format\" SET \"version\" = {}",
            crate::organization::store::FORMAT_VERSION + 1
        );

        for (name, change, reason) in [
            (
                "older",
                "DELETE FROM \"format\"",
                crate::error::RefusalReason::OrganizationUpgradeOffline,
            ),
            (
                "newer",
                newer.as_str(),
                crate::error::RefusalReason::OrganizationNewer,
            ),
        ] {
            let directory = scratch(&format!("format-{name}"));
            let app_state = first_run(credentials.as_ref(), &directory).await;
            let (organization_id, _) = recorded(&app_state).await;
            let replica = OrganizationStore::replica_path(
                &directory.join(Database::FILENAME),
                &organization_id,
            );

            {
                let store = OrganizationStore::open(
                    crate::clock::System::shared(),
                    &replica,
                    None,
                    || async { Ok::<String, turso::Error>(String::new()) },
                )
                .await
                .expect("the replica");

                store
                    .connection()
                    .execute(change, ())
                    .await
                    .expect("the organization of another format");
            }

            let before = contents(&replica).await;
            let state = state_of(&app_state, &credentials, &crate::clock::System::shared())
                .await
                .expect("the state");

            assert!(
                state.session.is_none(),
                "{name}: the launch resumed into an organization of another format"
            );
            assert_eq!(
                state.organization.map(|held| held.id),
                Some(organization_id.clone()),
                "{name}: the launch forgot an organization it should refuse"
            );
            assert!(app_state.organization.read().await.is_none());

            let held = {
                let mut remote_sync = app_state.remote_sync.write().await;

                remote_sync
                    .store_mut()
                    .organization
                    .clone()
                    .expect("the record")
            };
            let refused = open_replica(
                &app_state,
                &credentials,
                &crate::clock::System::shared(),
                &held,
                Opening::Remembered,
            )
            .await
            .map(|_| ());

            assert!(
                matches!(refused, Err(Error::Refused { reason: refusal, .. }) if refusal == reason),
                "{name}: {refused:?}"
            );
            assert_eq!(
                contents(&replica).await,
                before,
                "{name}: the launch wrote to the organization"
            );
        }

        // no `format` table at all over this build's member table: the launch keeps it now that an
        // organization with no format table is upgraded rather than forgotten (ticket 22), and it
        // carries nothing of format 1, so what is left of an upgrade is its last row (ticket 23).
        // The resume is the owner's, with a push no remote takes, so it is refused as the older one
        // above is, asking for a connection, and nothing is written.
        let directory = scratch("format-today");
        let app_state = first_run(credentials.as_ref(), &directory).await;
        let (organization_id, _) = recorded(&app_state).await;
        let replica =
            OrganizationStore::replica_path(&directory.join(Database::FILENAME), &organization_id);

        {
            let store =
                OrganizationStore::open(crate::clock::System::shared(), &replica, None, || async {
                    Ok::<String, turso::Error>(String::new())
                })
                .await
                .expect("the replica");

            store
                .connection()
                .execute("DROP TABLE \"format\"", ())
                .await
                .expect("today's shape");
        }

        let before = contents(&replica).await;
        let state = state_of(&app_state, &credentials, &crate::clock::System::shared())
            .await
            .expect("the state");

        assert!(state.session.is_none());
        assert_eq!(
            state.organization.map(|held| held.id),
            Some(organization_id),
            "a replica with no format table was forgotten"
        );

        let held = {
            let mut remote_sync = app_state.remote_sync.write().await;

            remote_sync
                .store_mut()
                .organization
                .clone()
                .expect("the record")
        };
        let refused = open_replica(
            &app_state,
            &credentials,
            &crate::clock::System::shared(),
            &held,
            Opening::Remembered,
        )
        .await
        .map(|_| ());

        assert!(
            matches!(
                refused,
                Err(Error::Refused {
                    reason: crate::error::RefusalReason::OrganizationUpgradeOffline,
                    ..
                })
            ),
            "{refused:?}"
        );
        assert_eq!(
            contents(&replica).await,
            before,
            "the launch wrote to the organization"
        );
    }

    /// The wall, which is what every failure to resume comes to. Nothing filed is the plainest of
    /// them, and it is the state a machine that has signed out is in.
    #[tokio::test]
    async fn a_launch_with_nothing_filed_leaves_the_wall_up() {
        let credentials: Credentials = Arc::new(Memory::new());
        let directory = scratch("nothing");
        let app_state = first_run(credentials.as_ref(), &directory).await;
        let (organization_id, member_id) = recorded(&app_state).await;

        credentials
            .delete(
                MEMBER_KEY_SERVICE,
                &format!("{organization_id}:{member_id}"),
            )
            .expect("the store would not forget");

        let state = state_of(&app_state, &credentials, &crate::clock::System::shared())
            .await
            .expect("the state");

        assert!(state.session.is_none(), "a launch with no key signed in");
        assert!(
            state.organization.is_some(),
            "the machine forgot what it holds"
        );
        assert!(app_state.member.read().await.is_none());
    }

    /// **Criterion 22 at its seams: a machine closed across the handover.** The founder's key is
    /// filed and nobody is in; the organization is handed over on another machine; the launch
    /// resumes the session, pulls, follows the succession and keeps the session, under the new
    /// key and as the manager the row says, with no sign-out and the remembered key kept.
    ///
    /// The two stores share one file, so the launch meets the re-keyed rows at its first read
    /// rather than after its pull; what the pull would bring is already there. The follow after
    /// the pull runs on the same path the heartbeat test below reads, and this pins that the
    /// launch ends signed in on the key in force rather than at the wall.
    #[tokio::test]
    async fn a_machine_closed_across_a_handover_launches_signed_in_under_the_new_key() {
        let credentials: Credentials = Arc::new(Memory::new());
        let directory = scratch("launch-after-handover");
        let app_state = first_run(credentials.as_ref(), &directory).await;
        let (organization_id, member_id) = recorded(&app_state).await;
        let new_key = handed_over(credentials.as_ref(), &directory, &app_state).await;

        assert!(
            app_state.member.read().await.is_none(),
            "a launch starts with nobody in"
        );
        assert!(filed(credentials.as_ref(), &organization_id, &member_id).is_some());

        let state = state_of(&app_state, &credentials, &crate::clock::System::shared())
            .await
            .expect("the state");
        let session = state
            .session
            .expect("the launch across the handover did not resume");

        assert_eq!(session.member_id, member_id);
        assert_eq!(session.role, "manager");
        assert!(
            !state.signed_out_elsewhere,
            "the wall was told a sign-out that did not happen"
        );
        assert!(
            filed(credentials.as_ref(), &organization_id, &member_id).is_some(),
            "the remembered key was forgotten"
        );
        assert_eq!(
            session_holds(&app_state).await,
            (new_key, "manager".to_string())
        );
        assert_eq!(pinned(&app_state).await, encoded(new_key));
    }
}
