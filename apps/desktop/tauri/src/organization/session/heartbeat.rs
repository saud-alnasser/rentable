//! what the sync heartbeat asks of an open session: whether it was ended from another machine,
//! whether a handover it was not present for is to be followed, and whether a lock-out rotated a
//! credential it holds.

use std::sync::atomic::Ordering;

use crate::{
    credential::CredentialStore, diagnostics, machine::RemoteSyncStore, persisted::Persisted,
    state::AppState,
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
/// the standing, so the wall says which sign-out this was.
///
/// **And it is where a machine open across a handover follows it** (effort 828, requirement 22).
/// The pull is what brings the re-keyed rows, so a row that will not read under the session's key
/// right after one is the sign of a succession this machine has not followed: it is followed
/// here, the record and the session re-pinned by [`followed`], and the question asked again under
/// the key the rows are on. A row that still will not read is the offline case as before, and this
/// member goes on working against what the replica holds (819's requirement 18). The launch runs
/// this same check once a remembered session is open, so both paths follow after the pull.
pub(crate) async fn ended_elsewhere(
    app_state: &AppState,
    credentials: &dyn CredentialStore,
) -> bool {
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
            Ok(ended) => ended,
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

    sign_out(app_state, credentials).await;
    app_state.signed_out_elsewhere.store(true, Ordering::SeqCst);

    diagnostics::info("organization.session.endedFromAnotherMachine").write();

    true
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
pub(super) async fn succession_followed(app_state: &AppState) {
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
pub(crate) async fn reconnect(app_state: &AppState) -> bool {
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
    use crate::persisted::Persisted;
    use crate::settings::Settings;
    use crate::state::AppState;
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

    /// The whole of the application state over one data directory, as `lib.rs` builds it, with
    /// nothing open and nobody in. *`forget.rs` and `invitation/join.rs` keep the same builder; a
    /// fixture is written out per module ([[rules/testing]]).*
    async fn state_over(directory: &std::path::Path) -> AppState {
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
        let update = Update::new(settings.clone()).await.expect("the update");

        AppState {
            db: Arc::new(RwLock::new(Database::new(
                settings.clone(),
                crate::clock::System::shared(),
            ))),
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

    /// A machine that has run the first run: an organization on it, the owner's row recorded, and
    /// the owner's member key filed, which is what every launch after it starts from. Nobody is
    /// signed in here, because a launch is a fresh process.
    async fn first_run(credentials: &dyn CredentialStore, directory: &std::path::Path) -> AppState {
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
    async fn recorded(app_state: &AppState) -> (String, String) {
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
        app_state: &AppState,
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
    async fn pinned(app_state: &AppState) -> String {
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
    async fn session_holds(app_state: &AppState) -> ([u8; VERIFYING_KEY_BYTES], String) {
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
        let app_state = first_run(credentials.as_ref(), &directory).await;
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
        let app_state = first_run(credentials.as_ref(), &directory).await;
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
        let app_state = first_run(credentials.as_ref(), &directory).await;
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
        let app_state = first_run(credentials.as_ref(), &directory).await;
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
        let app_state = first_run(credentials.as_ref(), &directory).await;
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
