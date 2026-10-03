//! what the sync heartbeat asks of an open session: whether it was ended from another machine,
//! whether a handover it was not present for is to be followed, and whether a lock-out rotated a
//! credential it holds.

use std::sync::atomic::Ordering;

use crate::{
    credential::CredentialStore, diagnostics, machine::RemoteSyncStore, organization::Shared,
    persisted::Persisted,
};

use super::command::sign_out;
#[cfg(test)]
use crate::organization::act::signed_in;
use crate::organization::{
    act::{Acting, Pull, if_member},
    ownership,
    session::{self, MemberSession},
    store::OrganizationStore,
};

/// Whether the member signed in on this machine has been signed out from every machine since,
/// and if so put the wall up: the check the sync heartbeat makes (effort 826, requirement 22).
///
/// **The heartbeat rather than a timer of its own**, because the property wanted is that a
/// machine with the application open is at the wall within one heartbeat of the push reaching it,
/// and the heartbeat is already the thing that runs when nobody is doing anything. The
/// organization replica is pulled first, since the row was written on another machine and this
/// one learns of it no other way; a pull that could not go leaves the check to the next one,
/// which is the offline case rather than a failure.
///
/// What it does when the row has moved on is exactly what a sign-out does, through the same
/// routine: the keys go, the replica is let go of, the remembered key is deleted. What it adds is
/// the standing, so the wall says which sign-out this was. **A machine signed out on its own**
/// (effort 846, requirement 10) takes the same path, its `machine_sign_out` row above what its
/// record acknowledged; one that was not keeps its name and, hourly, its last seen.
///
/// **And it is where a machine open across a handover follows it** (effort 828, requirement 22).
/// The pull is what brings the re-keyed rows, so a row that will not read under the session's key
/// right after one is the sign of a succession this machine has not followed: it is followed
/// here, the record and the session re-pinned by [`followed`], and the question asked again under
/// the key the rows are on. A row that still will not read is the offline case as before, and this
/// member goes on working against what the replica holds (819's requirement 18). The launch runs
/// this same check once a remembered session is open, so both paths follow after the pull.
pub(crate) async fn ended_elsewhere(app_state: &Shared, credentials: &dyn CredentialStore) -> bool {
    let ended = {
        let mut member = app_state.member.write().await;
        let organization = app_state.organization.read().await;

        let (Some(session), Some(store)) = (member.as_mut(), organization.as_ref()) else {
            return false;
        };

        store.pull().await;

        // and out, which is what carries a bump made offline. `end_elsewhere` writes the number
        // on this machine's replica and pushes; a push that could not go left it there, and no
        // other scheduled path pushes the organization replica, so without this the sessions the
        // person was told would end stay open until they happen to make another organization
        // write. A push with nothing to send costs a round trip on a heartbeat that already
        // made one.
        store.push().await;

        // and the owner's own row, where somebody below them demoted or removed it around the
        // command: the owner's machine holds the root and writes it again, with nobody acting
        // (effort 838, the human's decision after review round two). Every other machine writes
        // nothing here.
        session::repair_own_row(store, session).await;

        let standing = match session::ended_elsewhere(store, session).await {
            Ok(ended) => Ok(ended),
            Err(refusal) => {
                let mut remote_sync = app_state.remote_sync.write().await;

                if followed(store, session, remote_sync.store_mut()).await {
                    session::ended_elsewhere(store, session).await
                } else {
                    Err(refusal)
                }
            }
        };

        match standing {
            Ok(true) => true,
            // and this machine alone, signed out from another of the member's (effort 846,
            // requirement 10): its row in `machine_sign_out` above the number its record last
            // acknowledged. Where it was not, the heartbeat keeps the machine's name and its last
            // seen, which is what the member's list of machines reads.
            Ok(false) => {
                let held = {
                    let mut remote_sync = app_state.remote_sync.write().await;

                    remote_sync.store_mut().organization.clone()
                };

                match held {
                    Some(held) => {
                        match session::signed_out_here(store, &held, &session.member_id).await {
                            Ok(true) => true,
                            Ok(false) => {
                                session::machine_kept(store, &held, session, store.clock().now())
                                    .await;

                                false
                            }
                            Err(refusal) => {
                                diagnostics::warn("organization.session.standingUnread")
                                    .with("reason", refusal.to_string())
                                    .write();

                                false
                            }
                        }
                    }
                    None => false,
                }
            }
            // a row that will not read is not a sign-out: the replica is the offline case and
            // this member goes on working against what it holds (requirement 18).
            Err(refusal) => {
                diagnostics::warn("organization.session.standingUnread")
                    .with("reason", refusal.to_string())
                    .write();

                false
            }
        }
    };

    if !ended {
        return false;
    }

    signed_out_from_elsewhere(app_state, credentials).await;

    true
}

/// Put the wall up for a session ended from another machine: exactly a sign-out, through the same
/// routine, with the standing that tells the wall which sign-out this was. What the heartbeat does
/// once it finds the session ended, and what an act refused because this machine was signed out on
/// its own does (`act::as_member`, effort 846, requirement 10). The caller holds no lock.
pub(crate) async fn signed_out_from_elsewhere(
    app_state: &Shared,
    credentials: &dyn CredentialStore,
) {
    sign_out(app_state, credentials).await;
    app_state.signed_out_elsewhere.store(true, Ordering::SeqCst);

    diagnostics::info("organization.session.endedFromAnotherMachine").write();
}

/// Follow a handover this machine was not present for, and pin the key it left behind (effort
/// 828, requirement 22).
///
/// **Nothing here is a refusal.** A machine whose pinned key still reads the directory is left
/// alone, and one that cannot follow the succession is left holding what it held, which is a
/// machine that refuses the rows exactly as it refuses any row it cannot verify. What the person
/// meets either way is the read that brought this here.
///
/// **The open session is re-pinned beside the record**, because a session carries its own copy of
/// the key and every act reads rows through it. The locks are taken in the order every other act
/// here takes them, the member before the replica before the record, so two acts cannot wait on
/// each other.
pub(super) async fn succession_followed(app_state: &Shared) {
    let mut member = app_state.member.write().await;
    let organization = app_state.organization.read().await;

    let (Some(session), Some(store)) = (member.as_mut(), organization.as_ref()) else {
        return;
    };
    let mut remote_sync = app_state.remote_sync.write().await;

    followed(store, session, remote_sync.store_mut()).await;
}

/// Follow a succession on a machine with a session open, and say whether one was: the record is
/// re-pinned by the walk, and the session moves onto the key with what its own row says under it
/// (effort 828, requirement 22).
///
/// **The session's role and permissions are the row's, not the ones it opened with.** A handover
/// is the one act that rewrites the acting member's own row from another machine: the founder's
/// session, kept as `owner`, passed every gate that reads the word after they had handed over,
/// deleting the organization among them, and signed certificates under a key that certified
/// nothing. `session::repin` reads the row under the new key and takes both. A row the new key
/// does not find leaves the session as it was, said in the diagnostics, and the read that brought
/// the caller here refuses as it did.
async fn followed(
    store: &OrganizationStore,
    session: &mut MemberSession,
    machine: &mut Persisted<RemoteSyncStore>,
) -> bool {
    let key = match ownership::follow_succession(store, machine).await {
        Ok(Some(key)) => key,
        Ok(None) => return false,
        Err(refusal) => {
            diagnostics::warn("organization.succession.notFollowed")
                .with("reason", refusal.to_string())
                .write();

            return false;
        }
    };

    if let Err(refusal) = session::repin(store, session, key).await {
        diagnostics::warn("organization.succession.sessionNotRepinned")
            .with("reason", refusal.to_string())
            .write();

        return false;
    }

    true
}

/// Collect whatever the organization database holds for this member that this process does
/// not: the credential a lock-out rotated and the owner re-sealed, or a workspace granted since
/// sign-in. Pulls the replica, reads the grants again, and where the credential for the current
/// workspace moved, hands the sync engine the new one. Answers whether anything moved.
///
/// **This is a remaining member's recovery after a lock-out, and it is automatic**: the sync
/// dispatcher runs it when a replication is refused, and the next request goes out under the
/// fresh credential. Nobody is signed out, and nobody is told to do anything.
pub(crate) async fn reconnect(app_state: &Shared) -> bool {
    // nobody signed in answers `false`, with nothing pulled.
    if_member(app_state, Pull::First, async |Acting { member, store }| {
        let moved = match session::refresh_credentials(store, member).await {
            Ok(moved) => moved,
            Err(error) => {
                crate::diagnostics::warn("organization.credentials.refreshFailed")
                    .with("error", error.to_string().as_str())
                    .write();

                return false;
            }
        };

        let mut remote_sync = app_state.remote_sync.write().await;
        let current = remote_sync.workspace();

        // the engine's own token is compared as well as the rows: a renewal or a lock-out made on
        // this machine wrote the session and not the engine, so the rows and the session agree
        // while the engine is still on the credential that was rotated away.
        let engine_behind = current
            .remote_id
            .as_deref()
            .and_then(|remote_id| member.workspace_credentials.get(remote_id))
            .is_some_and(|held| {
                remote_sync.workspace_token().as_deref() != Some(held.token.as_str())
            });

        if !moved && !engine_behind {
            return false;
        }

        if let Some(remote_id) = current.remote_id.as_deref()
            && let Some(held) = member.workspace_credentials.get(remote_id)
        {
            remote_sync.hold_organization_workspace_token(&held.token);
        }

        crate::diagnostics::info("organization.credentials.refreshed").write();

        true
    })
    .await
    .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use crate::credential::{CredentialStore, Credentials, Memory};
    use crate::database::Database;
    use crate::error::Error;
    use crate::machine::{RemoteSync, RemoteSyncStore};
    use crate::organization::act::{Acting, Pull, as_member};
    use crate::organization::authority::VERIFYING_KEY_BYTES;
    use crate::organization::invitation::link::JoinLink;
    use crate::organization::invitation::{self, join};
    use crate::organization::member::removal;
    use crate::organization::member::vault::KdfParams;
    use crate::organization::ownership;
    use crate::organization::role::permission;
    use crate::organization::session::{
        self, CredentialSlot, MEMBER_KEY_SERVICE, state_of, verifying_key_of,
    };
    use crate::organization::setup::{CreateOrganization, Remote, create_organization};
    use crate::organization::store::OrganizationStore;
    use crate::organization::{HeldOrganization, Shared};
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
    async fn state_over(credentials: &Credentials, directory: &std::path::Path) -> Shared {
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
            credentials: Arc::clone(credentials),
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
    async fn first_run(credentials: &Credentials, directory: &std::path::Path) -> Shared {
        let app_state = state_over(credentials, directory).await;
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
                credentials.as_ref(),
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

    /// **Criterion 22, the heartbeat.** A member is signed in on this machine; on another machine
    /// they end every other session. One call of the check the sync heartbeat makes, and this
    /// machine holds no session, no replica and no remembered key, and says on the state that it
    /// was signed out from another machine.
    ///
    /// The other machine is a second store over the same replica, which is what two machines are
    /// to each other once a push and a pull have run between them; there is no remote here, so the
    /// file is what they share.
    #[tokio::test]
    async fn a_session_ended_from_another_machine_is_gone_after_one_heartbeat() {
        let credentials: Credentials = Arc::new(Memory::new());
        let directory = scratch("heartbeat");
        let app_state = first_run(&credentials, &directory).await;
        let (organization_id, member_id) = recorded(&app_state).await;

        let state = state_of(&app_state, &credentials, &crate::clock::System::shared())
            .await
            .expect("the state");

        assert!(state.session.is_some(), "the launch did not resume");
        assert!(!state.signed_out_elsewhere);

        // the other machine, signed in as the same member, ending every other session.
        let held = {
            let mut remote_sync = app_state.remote_sync.write().await;

            remote_sync
                .store_mut()
                .organization
                .clone()
                .expect("the record names no organization")
        };
        let elsewhere = OrganizationStore::open(
            crate::clock::System::shared(),
            &OrganizationStore::replica_path(&directory.join(Database::FILENAME), &organization_id),
            None,
            || async { Ok::<String, turso::Error>(String::new()) },
        )
        .await
        .expect("the other machine's replica");
        let mut theirs = session::sign_in(&elsewhere, &held, PASSWORD, &slot())
            .await
            .expect("the other machine did not sign in");

        session::end_elsewhere(
            credentials.as_ref(),
            &elsewhere,
            &mut theirs,
            "machine-elsewhere",
            CREATED_AT + 1,
        )
        .await
        .expect("ending the other sessions failed");

        // one heartbeat on this machine.
        assert!(
            super::ended_elsewhere(&app_state, credentials.as_ref()).await,
            "the heartbeat did not read the row as moved on"
        );
        assert!(
            app_state.member.read().await.is_none(),
            "the session outlived the sign-out"
        );
        assert!(
            app_state.organization.read().await.is_none(),
            "the replica was still held open"
        );
        assert_eq!(
            filed(credentials.as_ref(), &organization_id, &member_id),
            None,
            "the remembered key outlived the sign-out"
        );

        let state = state_of(&app_state, &credentials, &crate::clock::System::shared())
            .await
            .expect("the state");

        assert!(state.session.is_none());
        assert!(
            state.signed_out_elsewhere,
            "the wall was not told which sign-out this was"
        );
        assert_eq!(
            state.organization.map(|held| held.id),
            Some(organization_id),
            "the machine forgot the organization as well as the session"
        );

        // and a heartbeat on a machine with nobody in reads nothing and says nothing.
        assert!(!super::ended_elsewhere(&app_state, credentials.as_ref()).await);
    }

    /// **Criterion 10 of effort 846: one machine signed out on its own.** This machine, B, came
    /// back signed in and named itself; on another machine, A, the same member signs B out by its
    /// row, and a third machine, C, is left alone. One heartbeat on B puts the wall up saying it
    /// was signed out from elsewhere and forgets B's key; A and C are untouched, and so are the
    /// member's epoch and vault. Signed in again on B with the same password, the next heartbeat
    /// keeps B in, because the sign-in acknowledged the number.
    #[tokio::test]
    async fn a_machine_signed_out_on_its_own_is_gone_after_one_heartbeat_and_back_with_its_password()
     {
        let credentials: Credentials = Arc::new(Memory::new());
        let directory = scratch("heartbeat-one-machine");
        let app_state = first_run(&credentials, &directory).await;
        let (organization_id, member_id) = recorded(&app_state).await;

        assert!(
            state_of(&app_state, &credentials, &crate::clock::System::shared())
                .await
                .expect("the state")
                .session
                .is_some(),
            "the launch did not resume"
        );

        let held_b = {
            let mut remote_sync = app_state.remote_sync.write().await;

            remote_sync
                .store_mut()
                .organization
                .clone()
                .expect("the record names no organization")
        };
        let held_a = HeldOrganization {
            machine_id: "machine-a".to_string(),
            ..held_b.clone()
        };
        let key = verifying_key_of(&held_b).expect("the pinned key");
        let machine_a = elsewhere(&directory, &organization_id).await;
        let a = session::sign_in(&machine_a, &held_a, PASSWORD, &slot())
            .await
            .expect("machine A did not sign in");

        // A and C are on this version and signed in as the member; B registered and named itself
        // at its launch.
        for machine in ["machine-a", "machine-c"] {
            machine_a
                .machine_seen(machine, Some(&member_id), CREATED_AT)
                .await
                .expect("the machine row");
            machine_a
                .write_machine_name(machine, None, CREATED_AT)
                .await
                .expect("the name row");
        }

        let before = machine_a
            .member(&key, &member_id)
            .await
            .expect("the row reads")
            .expect("the member's row");

        assert!(
            session::machines(&machine_a, &a, &held_a)
                .await
                .expect("A's list")
                .iter()
                .any(|machine| machine.id == held_b.machine_id && machine.may_end_alone),
            "B is not listed on A as a machine to end alone"
        );

        session::end_machine(&machine_a, &a, &held_a, &held_b.machine_id, CREATED_AT + 1)
            .await
            .expect("A could not sign B out");

        // one heartbeat on B.
        assert!(
            super::ended_elsewhere(&app_state, credentials.as_ref()).await,
            "the heartbeat did not read this machine as signed out"
        );
        assert!(app_state.member.read().await.is_none());
        assert!(app_state.organization.read().await.is_none());
        assert_eq!(
            filed(credentials.as_ref(), &organization_id, &member_id),
            None,
            "B's remembered key outlived its sign-out"
        );
        assert!(
            state_of(&app_state, &credentials, &crate::clock::System::shared())
                .await
                .expect("the state")
                .signed_out_elsewhere,
            "the wall was not told which sign-out this was"
        );

        // A and C untouched, and the member's epoch and vault unmoved.
        assert!(
            !session::signed_out_here(&machine_a, &held_a, &member_id)
                .await
                .expect("A's standing"),
            "A was signed out with B"
        );
        for machine in ["machine-a", "machine-c"] {
            assert_eq!(
                machine_a
                    .machine(machine)
                    .await
                    .expect("the row")
                    .and_then(|row| row.member_id),
                Some(member_id.clone()),
                "{machine} stopped naming the member"
            );
            assert_eq!(
                machine_a
                    .machine_signed_out(machine, &member_id)
                    .await
                    .expect("the number"),
                0
            );
        }

        let after = machine_a
            .member(&key, &member_id)
            .await
            .expect("the row reads")
            .expect("the member's row");

        assert_eq!(after.session_epoch, before.session_epoch);
        assert_eq!(after.vault, before.vault, "the password moved");

        // B signed in again with the same password, as the wall's sign-in admits it.
        let store = elsewhere(&directory, &organization_id).await;
        let member = {
            let mut remote_sync = app_state.remote_sync.write().await;
            let held = remote_sync
                .store_mut()
                .organization
                .clone()
                .expect("the record");

            join::admit(
                credentials.as_ref(),
                &store,
                remote_sync.store_mut(),
                &held,
                USERNAME,
                PASSWORD,
                &slot(),
                CREATED_AT + 2,
            )
            .await
            .expect("B could not sign in again")
        };

        *app_state.organization.write().await = Some(store);
        *app_state.member.write().await = Some(member);

        assert!(
            !super::ended_elsewhere(&app_state, credentials.as_ref()).await,
            "B was signed out again by the sign-out it signed in past"
        );
        assert!(app_state.member.read().await.is_some());
        assert_eq!(
            {
                let mut remote_sync = app_state.remote_sync.write().await;

                remote_sync
                    .store_mut()
                    .organization
                    .as_ref()
                    .map(|held| held.machine_signed_out)
            },
            Some(1),
            "the sign-in did not acknowledge the number"
        );
    }

    /// **Effort 846, requirement 10: a machine signed out on its own cannot act before its next
    /// heartbeat.** B came back signed in; on A the same member signs B out by its row, and the
    /// pull brings it to B. With no heartbeat run, an organization act on B is refused as signed
    /// out from another machine and B is at the wall, its key forgotten and the wall told which
    /// sign-out this was. The same act on A and on a third machine, C, still runs.
    #[tokio::test]
    async fn a_machine_signed_out_on_its_own_is_refused_its_next_act_and_walled() {
        let credentials: Credentials = Arc::new(Memory::new());
        let directory = scratch("act-one-machine");
        let app_state = first_run(&credentials, &directory).await;
        let (organization_id, member_id) = recorded(&app_state).await;

        assert!(
            state_of(&app_state, &credentials, &crate::clock::System::shared())
                .await
                .expect("the state")
                .session
                .is_some(),
            "the launch did not resume"
        );

        let held_b = {
            let mut remote_sync = app_state.remote_sync.write().await;

            remote_sync
                .store_mut()
                .organization
                .clone()
                .expect("the record names no organization")
        };
        let held_a = HeldOrganization {
            machine_id: "machine-a".to_string(),
            ..held_b.clone()
        };
        let held_c = HeldOrganization {
            machine_id: "machine-c".to_string(),
            ..held_b.clone()
        };
        let other = elsewhere(&directory, &organization_id).await;

        for machine in ["machine-a", "machine-c"] {
            other
                .machine_seen(machine, Some(&member_id), CREATED_AT)
                .await
                .expect("the machine row");
            other
                .write_machine_name(machine, None, CREATED_AT)
                .await
                .expect("the name row");
        }

        let a = session::sign_in(&other, &held_a, PASSWORD, &slot())
            .await
            .expect("machine A did not sign in");
        let c = session::sign_in(&other, &held_c, PASSWORD, &slot())
            .await
            .expect("machine C did not sign in");

        // the act every machine takes here: reading the member's own machines, which passes the
        // acting row first, as every organization act does.
        let act_on_b = async || {
            let held = held_b.clone();

            as_member(
                &app_state,
                Pull::First,
                async move |Acting { member, store }| session::machines(store, member, &held).await,
            )
            .await
        };

        act_on_b()
            .await
            .expect("B could not act before it was signed out");

        session::end_machine(&other, &a, &held_a, &held_b.machine_id, CREATED_AT + 1)
            .await
            .expect("A could not sign B out");

        // B pulls with its act, and no heartbeat has run.
        let refused = act_on_b()
            .await
            .expect_err("B acted after it was signed out on its own");

        assert!(
            matches!(
                refused,
                Error::Refused {
                    reason: crate::error::RefusalReason::SessionsEnded,
                    ..
                }
            ),
            "{refused:?}"
        );
        assert!(
            refused.to_string().contains("signed out from another"),
            "the refusal does not say what happened: {refused}"
        );

        // and B is at the wall, as one heartbeat would have put it there.
        assert!(app_state.member.read().await.is_none());
        assert!(app_state.organization.read().await.is_none());
        assert_eq!(
            filed(credentials.as_ref(), &organization_id, &member_id),
            None,
            "B's remembered key outlived its sign-out"
        );
        assert!(
            state_of(&app_state, &credentials, &crate::clock::System::shared())
                .await
                .expect("the state")
                .signed_out_elsewhere,
            "the wall was not told which sign-out this was"
        );

        // A and C act as before.
        session::machines(&other, &a, &held_a)
            .await
            .expect("A was refused with B");
        session::machines(&other, &c, &held_c)
            .await
            .expect("C was refused with B");
    }

    /// Sign `username` in on this machine at the wall, as the wall's sign-in admits them, over a
    /// replica opened afresh, and leave them signed in. Answers the record the sign-in wrote.
    async fn admitted(
        app_state: &Shared,
        credentials: &Credentials,
        directory: &std::path::Path,
        username: &str,
        password: &str,
        now: i64,
    ) -> HeldOrganization {
        let mut remote_sync = app_state.remote_sync.write().await;
        let held = remote_sync
            .store_mut()
            .organization
            .clone()
            .expect("the record names no organization");
        let store = elsewhere(directory, &held.id).await;
        let member = join::admit(
            credentials.as_ref(),
            &store,
            remote_sync.store_mut(),
            &held,
            username,
            password,
            &slot(),
            now,
        )
        .await
        .expect("the sign-in failed");
        let written = remote_sync
            .store_mut()
            .organization
            .clone()
            .expect("the record");

        drop(remote_sync);
        *app_state.organization.write().await = Some(store);
        *app_state.member.write().await = Some(member);

        written
    }

    /// **Effort 846, ticket 28: the number a session opens under is its own member's.** Member X
    /// is signed out of this machine, M, on its own twice and signs in past both, so M's record
    /// carries X's number, 2; X signs out, and Y signs in on M. Y's own machine signs M out on its
    /// own, which is Y's first, 1. With no heartbeat run, M's next act is refused and M is at the
    /// wall: a session that took the record's number while the record still named X would have
    /// opened under 2, read 1 as nothing new, and acted on.
    #[tokio::test]
    async fn a_member_signed_in_where_another_was_signed_out_alone_is_refused_after_their_own() {
        let credentials: Credentials = Arc::new(Memory::new());
        let directory = scratch("act-next-member");
        let app_state = first_run(&credentials, &directory).await;
        let (organization_id, x) = recorded(&app_state).await;

        assert!(
            state_of(&app_state, &credentials, &crate::clock::System::shared())
                .await
                .expect("the state")
                .session
                .is_some(),
            "the launch did not resume"
        );

        let held_m = {
            let mut remote_sync = app_state.remote_sync.write().await;

            remote_sync
                .store_mut()
                .organization
                .clone()
                .expect("the record names no organization")
        };
        let held_a = HeldOrganization {
            machine_id: "machine-a".to_string(),
            ..held_m.clone()
        };
        let other = elsewhere(&directory, &organization_id).await;
        let a = session::sign_in(&other, &held_a, PASSWORD, &slot())
            .await
            .expect("machine A did not sign in");

        // X signed out of M on its own, twice, and signed in again past each.
        for (round, at) in [(1, CREATED_AT + 10), (2, CREATED_AT + 20)] {
            session::end_machine(&other, &a, &held_a, &held_m.machine_id, at)
                .await
                .expect("A could not sign M out");

            let written = admitted(
                &app_state,
                &credentials,
                &directory,
                USERNAME,
                PASSWORD,
                at + 1,
            )
            .await;

            assert_eq!(written.member_id.as_deref(), Some(x.as_str()));
            assert_eq!(written.machine_signed_out, round);
        }

        // X signs out here, and the record still names X with their number.
        session::sign_out(&app_state, credentials.as_ref()).await;

        let left = {
            let mut remote_sync = app_state.remote_sync.write().await;

            remote_sync
                .store_mut()
                .organization
                .clone()
                .expect("the record")
        };

        assert_eq!(left.member_id.as_deref(), Some(x.as_str()));
        assert_eq!(left.machine_signed_out, 2);

        // Y, settled on a machine of their own, signs in on M.
        let (y, y_session, y_machine) = a_settled_manager(
            credentials.as_ref(),
            &directory,
            &other,
            &a,
            "ada.admin",
            MANAGERS_PASSWORD,
        )
        .await;
        let held_y = y_machine.organization.clone().expect("Y's record");
        let written = admitted(
            &app_state,
            &credentials,
            &directory,
            "ada.admin",
            MANAGERS_PASSWORD,
            CREATED_AT + 30,
        )
        .await;

        assert_eq!(written.member_id.as_deref(), Some(y.as_str()));
        assert_eq!(
            app_state
                .member
                .read()
                .await
                .as_ref()
                .map(|session| session.machine_signed_out),
            Some(0),
            "Y's session opened under X's number"
        );

        let act_on_m = async || {
            let held = written.clone();

            as_member(
                &app_state,
                Pull::First,
                async move |Acting { member, store }| session::machines(store, member, &held).await,
            )
            .await
        };

        act_on_m()
            .await
            .expect("Y could not act on M before it was signed out");

        // Y's own machine signs M out on its own.
        session::end_machine(
            &other,
            &y_session,
            &held_y,
            &held_m.machine_id,
            CREATED_AT + 40,
        )
        .await
        .expect("Y's machine could not sign M out");

        let refused = act_on_m()
            .await
            .expect_err("M acted after Y signed it out on its own");

        assert!(
            matches!(
                refused,
                Error::Refused {
                    reason: crate::error::RefusalReason::SessionsEnded,
                    ..
                }
            ),
            "{refused:?}"
        );
        assert!(
            app_state.member.read().await.is_none(),
            "M is not at the wall"
        );
        assert!(app_state.organization.read().await.is_none());
        assert!(
            state_of(&app_state, &credentials, &crate::clock::System::shared())
                .await
                .expect("the state")
                .signed_out_elsewhere,
            "the wall was not told which sign-out this was"
        );
    }

    /// **Effort 846, ticket 30: a sign-in reads the number it has just pulled.** X signs out of
    /// this machine, M, by hand, and while M is at the wall X signs M out on its own from A, which
    /// M's replica does not hold until it pulls. X signs in on M with the password; the pull the
    /// sign-in makes once the vault is open brings A's sign-out, and the sign-in acknowledges it.
    /// X's first act on M runs, and M stays in across the next heartbeat. A sign-in that read the
    /// number before its pull would open under 0, and the act would meet the 1 the pull brought.
    ///
    /// Nothing here serves a pull, so the row A wrote is written where the pull is made: before
    /// it, M's replica does not hold it, as a replica that has not pulled since A wrote does not.
    #[tokio::test]
    async fn a_sign_in_acknowledges_a_sign_out_alone_its_own_pull_brought() {
        let credentials: Credentials = Arc::new(Memory::new());
        let directory = scratch("sign-in-pulled-count");
        let app_state = first_run(&credentials, &directory).await;
        let (organization_id, x) = recorded(&app_state).await;

        assert!(
            state_of(&app_state, &credentials, &crate::clock::System::shared())
                .await
                .expect("the state")
                .session
                .is_some(),
            "the launch did not resume"
        );

        // X signs out on M by hand.
        session::sign_out(&app_state, credentials.as_ref()).await;

        let held_m = {
            let mut remote_sync = app_state.remote_sync.write().await;

            remote_sync
                .store_mut()
                .organization
                .clone()
                .expect("the record names no organization")
        };
        let other = elsewhere(&directory, &organization_id).await;

        assert_eq!(
            other
                .machine_signed_out(&held_m.machine_id, &x)
                .await
                .expect("the number"),
            0
        );

        // X types the password on M; A's sign-out of M alone arrives with the pull.
        let store = elsewhere(&directory, &organization_id).await;
        let member = {
            let mut remote_sync = app_state.remote_sync.write().await;

            join::admitted_after(
                credentials.as_ref(),
                &store,
                remote_sync.store_mut(),
                &held_m,
                USERNAME,
                PASSWORD,
                &slot(),
                CREATED_AT + 2,
                async || {
                    other
                        .set_machine_signed_out(&held_m.machine_id, &x, 1, CREATED_AT + 1)
                        .await
                        .expect("A's sign-out of M");
                },
            )
            .await
            .expect("X could not sign in on M")
        };

        assert_eq!(member.machine_signed_out, 1, "the session opened under 0");

        *app_state.organization.write().await = Some(store);
        *app_state.member.write().await = Some(member);

        // X's first act on M.
        let held = held_m.clone();

        as_member(
            &app_state,
            Pull::First,
            async move |Acting { member, store }| session::machines(store, member, &held).await,
        )
        .await
        .expect("X's first act on M was refused");

        assert!(
            !super::ended_elsewhere(&app_state, credentials.as_ref()).await,
            "M was signed out again by the sign-out it signed in past"
        );
        assert!(app_state.member.read().await.is_some());
        assert_eq!(
            {
                let mut remote_sync = app_state.remote_sync.write().await;

                remote_sync
                    .store_mut()
                    .organization
                    .as_ref()
                    .map(|held| held.machine_signed_out)
            },
            Some(1),
            "the sign-in did not acknowledge the number it pulled"
        );
    }

    /// **Effort 846, ticket 30: a record from before machine ids resumes onto the id it is drawn.**
    /// M's record was written before effort 828 and names no machine; the launch resumes X and
    /// draws M its id. On A, X signs M out on its own. With no heartbeat run, M's next act is
    /// refused and M is at the wall: a session left with no machine id would read as never signed
    /// out alone, and act on until the heartbeat.
    #[tokio::test]
    async fn a_session_resumed_before_its_machine_had_an_id_is_refused_once_signed_out_alone() {
        let credentials: Credentials = Arc::new(Memory::new());
        let directory = scratch("act-drawn-id");
        let app_state = first_run(&credentials, &directory).await;
        let (organization_id, x) = recorded(&app_state).await;

        // the record as a build before effort 828 left it: no machine id.
        {
            let mut remote_sync = app_state.remote_sync.write().await;
            let record = remote_sync.store_mut();
            let held = record.organization.clone().expect("the record");

            record.organization = Some(HeldOrganization {
                machine_id: String::new(),
                ..held
            });
            record.commit().expect("the record");
        }

        assert!(
            state_of(&app_state, &credentials, &crate::clock::System::shared())
                .await
                .expect("the state")
                .session
                .is_some(),
            "the launch did not resume"
        );

        let held_m = {
            let mut remote_sync = app_state.remote_sync.write().await;

            remote_sync
                .store_mut()
                .organization
                .clone()
                .expect("the record names no organization")
        };

        assert!(!held_m.machine_id.is_empty(), "the launch drew no id");

        let held_a = HeldOrganization {
            machine_id: "machine-a".to_string(),
            ..held_m.clone()
        };
        let other = elsewhere(&directory, &organization_id).await;
        let a = session::sign_in(&other, &held_a, PASSWORD, &slot())
            .await
            .expect("machine A did not sign in");
        let act_on_m = async || {
            let held = held_m.clone();

            as_member(
                &app_state,
                Pull::First,
                async move |Acting { member, store }| session::machines(store, member, &held).await,
            )
            .await
        };

        act_on_m()
            .await
            .expect("M could not act before it was signed out");

        session::end_machine(&other, &a, &held_a, &held_m.machine_id, CREATED_AT + 1)
            .await
            .expect("A could not sign M out");

        let refused = act_on_m()
            .await
            .expect_err("M acted after it was signed out on its own");

        assert!(
            matches!(
                refused,
                Error::Refused {
                    reason: crate::error::RefusalReason::SessionsEnded,
                    ..
                }
            ),
            "{refused:?}"
        );
        assert!(
            app_state.member.read().await.is_none(),
            "M is not at the wall"
        );
        assert!(app_state.organization.read().await.is_none());
        assert_eq!(
            filed(credentials.as_ref(), &organization_id, &x),
            None,
            "M's remembered key outlived its sign-out"
        );
        assert!(
            state_of(&app_state, &credentials, &crate::clock::System::shared())
                .await
                .expect("the state")
                .signed_out_elsewhere,
            "the wall was not told which sign-out this was"
        );
    }

    /// **The heartbeat pushes as well as pulls**, which is what carries out a sign-out made
    /// offline.
    ///
    /// `end_elsewhere` writes the new number on this machine's replica and pushes; a push that
    /// could not go leaves it there, and no other scheduled path pushes the organization replica.
    /// So without this the person is told their other machines are signed out and they stay open
    /// until that member happens to make another organization write, which a plain member almost
    /// never does.
    ///
    /// Read on the wire rather than through a stand-in: the replica is reopened against a server
    /// that answers nothing, so what the two calls put on it is what this asserts on. The pull is
    /// `POST /pull-updates` and the push is not, which is the whole of what is being distinguished.
    #[tokio::test]
    async fn the_heartbeat_pushes_the_organization_replica_after_its_pull() {
        let credentials: Credentials = Arc::new(Memory::new());
        let directory = scratch("heartbeat-push");
        let app_state = first_run(&credentials, &directory).await;
        let (organization_id, _) = recorded(&app_state).await;

        assert!(
            state_of(&app_state, &credentials, &crate::clock::System::shared())
                .await
                .expect("the state")
                .session
                .is_some(),
            "the launch did not resume"
        );

        // the same replica, reopened against a remote that answers nothing. The engine the resume
        // opened is let go of first: one file, one engine.
        let server =
            ScriptedServer::start((0..8).map(|_| ScriptedResponse::hangup()).collect()).await;
        {
            let mut organization = app_state.organization.write().await;

            *organization = None;
            *organization = Some(
                OrganizationStore::open(
                    crate::clock::System::shared(),
                    &OrganizationStore::replica_path(
                        &directory.join(Database::FILENAME),
                        &organization_id,
                    ),
                    Some(server.url("")),
                    || async { Ok::<String, turso::Error>("a-credential".to_string()) },
                )
                .await
                .expect("the replica did not reopen against the remote"),
            );
        }

        assert_eq!(
            server.request_count(),
            0,
            "something reached the remote early"
        );

        // one heartbeat. Nobody ended anything, so the answer is that the session stands; what is
        // under test is what it did on the way to that answer.
        assert!(!super::ended_elsewhere(&app_state, credentials.as_ref()).await);
        assert!(
            server.request_count() >= 2,
            "the heartbeat made {} request(s); a pull and a push are two",
            server.request_count()
        );
        assert_eq!(
            server.request(0).target,
            "/pull-updates",
            "the heartbeat's first call to the remote is not the pull"
        );
        assert_ne!(
            server.request(1).target,
            "/pull-updates",
            "the heartbeat pulled twice and pushed nothing"
        );
    }

    /// **Criterion 22 at its seams: the founder's open session is a manager's after the
    /// handover.** The organization is handed over on another machine while the founder's session
    /// is open here. Before this machine has read anything, making a manager from the
    /// stale session is refused rather than written; the next state read follows the succession
    /// and re-reads the founder's own row, so the session is the manager's it now is on
    /// every gate: deleting the organization is refused by name and making a manager by rank, a
    /// plain member is theirs to make, and the directory verifies on every machine afterwards.
    #[tokio::test]
    async fn the_founders_open_session_is_a_managers_after_a_handover_elsewhere() {
        let credentials: Credentials = Arc::new(Memory::new());
        let directory = scratch("founder-after-handover");
        let app_state = first_run(&credentials, &directory).await;
        let (organization_id, _) = recorded(&app_state).await;
        let state = state_of(&app_state, &credentials, &crate::clock::System::shared())
            .await
            .expect("the state");

        assert_eq!(
            state.session.expect("the launch did not resume").role,
            "owner"
        );

        let (old_key, _) = session_holds(&app_state).await;
        let new_key = handed_over(credentials.as_ref(), &directory, &app_state).await;

        assert_ne!(new_key, old_key);

        // before any read: the session still says owner and still holds the old key, and the one
        // thing it could do with that is refused before a certificate is written.
        {
            let mut member = app_state.member.write().await;
            let organization = app_state.organization.read().await;
            let (session, store) = super::signed_in(&mut member, &organization).expect("signed in");
            let certificates = store.certificates().await.expect("the certificates").len();

            assert_eq!(session.role, "owner");

            invitation::create_account(
                store,
                &*session,
                None::<&InMemoryPlatform>,
                "noor.new",
                permission::MANAGER,
                0,
                &[],
                test_cost(),
                CREATED_AT + 3,
            )
            .await
            .expect_err("a stale session made a manager");

            assert_eq!(
                store.certificates().await.expect("the certificates").len(),
                certificates,
                "a certificate was written under the key that was handed over"
            );
        }

        // the state read follows the succession, and the session is the row's.
        let state = state_of(&app_state, &credentials, &crate::clock::System::shared())
            .await
            .expect("the state");

        assert_eq!(state.session.expect("the session was lost").role, "manager");
        assert_eq!(
            session_holds(&app_state).await,
            (new_key, "manager".to_string())
        );
        assert_eq!(pinned(&app_state).await, encoded(new_key));

        // deleting the organization: this machine holds the authority, and the session is refused
        // on the role by name.
        let platform = InMemoryPlatform::new("an-org");
        let refused =
            removal::delete_organization(&app_state, credentials.as_ref(), &platform, PASSWORD)
                .await
                .expect_err("the founder deleted the organization after handing it over");

        assert!(
            matches!(refused, Error::Refused { reason: crate::error::RefusalReason::OwnerOnly, ref message } if message == removal::ONLY_THE_OWNER_DELETES),
            "{refused:?}"
        );

        // making a manager: refused by rank, as the manager the row now says they are, and a plain
        // member is theirs to make, issued from their own certificate (effort 838).
        {
            let mut member = app_state.member.write().await;
            let organization = app_state.organization.read().await;
            let (session, store) = super::signed_in(&mut member, &organization).expect("signed in");
            let refused = invitation::create_account(
                store,
                &*session,
                None::<&InMemoryPlatform>,
                "noor.new",
                permission::MANAGER,
                0,
                &[],
                test_cost(),
                CREATED_AT + 4,
            )
            .await
            .expect_err("a manager made a manager");

            assert!(
                matches!(
                    refused,
                    Error::Refused {
                        reason: crate::error::RefusalReason::RankNotAbove,
                        ..
                    }
                ),
                "{refused:?}"
            );

            invitation::create_account(
                store,
                &*session,
                None::<&InMemoryPlatform>,
                "sami.staff",
                permission::MEMBER,
                0,
                &[],
                test_cost(),
                CREATED_AT + 5,
            )
            .await
            .expect("a manager could not make a member");
        }

        // and the directory verifies under the key in force, here and on the other machine.
        {
            let organization = app_state.organization.read().await;

            organization
                .as_ref()
                .expect("the replica")
                .members(&new_key)
                .await
                .expect("every member row verifies on this machine");
        }
        elsewhere(&directory, &organization_id)
            .await
            .members(&new_key)
            .await
            .expect("every member row verifies on the other machine");
    }

    /// **Criterion 22 at its seams: a machine open across the handover.** The founder is signed in
    /// here; the organization is handed over on another machine; the heartbeat that pulls the
    /// re-keyed rows follows the succession rather than swallowing the read that refused, and the
    /// session goes on under the new key as the manager the row says. Nothing was ended, so
    /// the heartbeat says so and keeps everything it holds.
    #[tokio::test]
    async fn a_machine_open_across_a_handover_follows_it_on_the_heartbeat() {
        let credentials: Credentials = Arc::new(Memory::new());
        let directory = scratch("heartbeat-after-handover");
        let app_state = first_run(&credentials, &directory).await;
        let (organization_id, member_id) = recorded(&app_state).await;

        assert!(
            state_of(&app_state, &credentials, &crate::clock::System::shared())
                .await
                .expect("the state")
                .session
                .is_some(),
            "the launch did not resume"
        );

        let (old_key, _) = session_holds(&app_state).await;
        let new_key = handed_over(credentials.as_ref(), &directory, &app_state).await;

        assert_eq!(pinned(&app_state).await, encoded(old_key));

        // one heartbeat.
        assert!(
            !super::ended_elsewhere(&app_state, credentials.as_ref()).await,
            "the heartbeat read a handover as a sign-out"
        );
        assert_eq!(
            session_holds(&app_state).await,
            (new_key, "manager".to_string()),
            "the heartbeat did not follow the succession"
        );
        assert_eq!(pinned(&app_state).await, encoded(new_key));
        assert!(
            app_state.organization.read().await.is_some(),
            "the replica was let go of"
        );
        assert!(
            filed(credentials.as_ref(), &organization_id, &member_id).is_some(),
            "the remembered key was forgotten"
        );

        // and the state read afterwards has nothing left to follow.
        let state = state_of(&app_state, &credentials, &crate::clock::System::shared())
            .await
            .expect("the state");

        assert_eq!(state.session.expect("the session").role, "manager");
        assert!(!state.signed_out_elsewhere);
    }

    /// **The owner's machine repairs a forged demotion of the owner's row on the heartbeat**
    /// (effort 838, the human's decision after review round two). A lead's certificate, issued
    /// from the owner's root, signs the owner's row naming the member role around the store, on
    /// another machine sharing the replica; that machine reads the owner with no permissions. One
    /// heartbeat on the owner's machine, signed in all along, writes the row again under the root,
    /// and every machine reads the owner as the owner with every flag.
    #[tokio::test]
    async fn the_owners_machine_repairs_a_forged_demotion_of_the_owners_row_on_the_heartbeat() {
        use crate::organization::{
            authority::{AdministratorKey, Issue, issue_certificate},
            role::permission::Flag,
            store::{MemberRecord, Signer},
            workspace::signer_of,
        };

        let credentials: Credentials = Arc::new(Memory::new());
        let directory = scratch("owner-repair-heartbeat");
        let app_state = first_run(&credentials, &directory).await;
        let (organization_id, member_id) = recorded(&app_state).await;

        assert!(
            state_of(&app_state, &credentials, &crate::clock::System::shared())
                .await
                .expect("the state")
                .session
                .is_some()
        );

        let held = {
            let mut remote_sync = app_state.remote_sync.write().await;

            remote_sync
                .store_mut()
                .organization
                .clone()
                .expect("the record names no organization")
        };
        let key = verifying_key_of(&held).expect("the pinned key");
        let elsewhere = OrganizationStore::open(
            crate::clock::System::shared(),
            &OrganizationStore::replica_path(&directory.join(Database::FILENAME), &organization_id),
            None,
            || async { Ok::<String, turso::Error>(String::new()) },
        )
        .await
        .expect("the other machine's replica");

        // a lead's certificate, and the owner's row signed by it naming the member role.
        {
            let member = app_state.member.read().await;
            let owner = member.as_ref().expect("the owner's session");
            let (root_key, root) = signer_of(&elsewhere, owner).await.expect("the root");
            let lead_key = AdministratorKey::generate().expect("a key");
            let lead = issue_certificate(
                &root_key,
                &root,
                Issue {
                    id: "cert-lead",
                    member_id: "member-lead",
                    signing_public_key: &lead_key.verifying_key(),
                    ceiling: permission::MEMBER_ROLE.mask
                        | permission::mask_of(&[Flag::InviteMember]),
                    rank: 500_000,
                    issued_at: "1",
                },
            )
            .expect("the lead's certificate");

            elsewhere
                .write_certificate(&lead)
                .await
                .expect("the certificate");

            let row = elsewhere
                .member(&key, &member_id)
                .await
                .expect("the row reads")
                .expect("the owner's row");

            elsewhere
                .write_member_around_the_check(
                    &Signer {
                        key: &lead_key,
                        certificate: &lead,
                    },
                    &MemberRecord {
                        role_id: permission::MEMBER.to_string(),
                        ..row
                    },
                )
                .await
                .expect("written around the store");
        }

        let demoted = elsewhere
            .member(&key, &member_id)
            .await
            .expect("the row reads")
            .expect("the owner's row");

        assert_eq!(demoted.effective, 0);

        // one heartbeat on the owner's machine.
        assert!(!super::ended_elsewhere(&app_state, credentials.as_ref()).await);

        let repaired = elsewhere
            .member(&key, &member_id)
            .await
            .expect("the row reads")
            .expect("the owner's row");

        assert_eq!(repaired.role_id, permission::OWNER);
        assert_eq!(repaired.effective, permission::OWNER_ROLE.mask);
        assert_eq!(
            app_state
                .member
                .read()
                .await
                .as_ref()
                .expect("still signed in")
                .permissions,
            permission::OWNER_ROLE.mask
        );
    }
}
