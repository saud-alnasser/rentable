//! forgetting one organization this machine holds: its replica and its workspaces' replicas gone
//! from the data directory, its remembered sign-in and its Turso consent gone from the keyring,
//! and its entry gone from the record (effort 851, requirement 5).
//!
//! **One routine, reached four ways.** Removing an organization from the wall's switcher and a
//! disconnect from the organization page are the person asking for it (effort 824, requirement 20);
//! the startup check (requirement 17, `upgrade/shape.rs`) is the machine finding that what it holds
//! was built before this build and cannot be opened by it; and an owner deleting the organization,
//! here or on another machine, leaves nothing for this one to hold. Each forgets the one
//! organization it concerns, and the organization and its workspaces on Turso are untouched: what
//! goes is this machine's copy and this machine's record of it, and the person comes back by a link.
//!
//! **Exactly one organization, and every other one held keeps all of its own.** What is deleted is
//! named, never swept: `org-<id>.db` and its sidecars, the `ws-<id>.db` of each replica entry the
//! record keeps for that organization, the remembered key filed under its id, and the `org:<id>`
//! consent. *It was a sweep of every `org-*` and `ws-*` file under the data directory, the whole
//! record and every consent until effort 851, when a machine came to hold several organizations
//! and a sweep would have taken the others with it.*
//!
//! **The files are deleted after everything holding them is let go of.** On Windows a file the
//! process still has open cannot be deleted, so where the organization is the open one the vault is
//! closed, the organization replica is dropped and the workspace engine is released through the
//! same paths a sign-out and `workspace::open_database` use, and only then are its files removed;
//! an engine left on one of its workspaces at the wall is released the same way. A file that still
//! will not go is written to the diagnostics log by name rather than pretended away; the record
//! forgets the organization regardless, so the machine does not go on naming an organization whose
//! replica it half holds, and the forget answers as done, because it is.
//!
//! **One sign is not a shape at all**, and it is [`forget_deleted_organization`]: the owner deleted
//! the organization on their Turso account, so the database this machine's replica syncs against is
//! not there any more (effort 828, requirement 18). Every sign of the old shape is read off the
//! replica on disk (`upgrade/shape.rs`); this one is the remote's answer to a pull, so it is read
//! after the launch has resumed a session and has a credential to pull with, and it is keyed on the
//! remote saying the database is absent rather than on any refusal it could make.

use std::path::PathBuf;

use crate::{
    credential::CredentialStore,
    database::Database,
    diagnostics,
    error::Error,
    organization::{Shared, store::OrganizationStore},
    turso::{
        consent::{Account, forget_platform_token},
        platform::database_is_gone,
    },
};

/// Forget the organization `organization_id`, and nothing else.
///
/// Where it is the open one, the machine leaves the registry, signs out and releases the workspace
/// engine first, as a sign-out does. Then the remembered key of the member its entry names goes,
/// `org-<id>.db` and its sidecars go, each workspace replica its replica entries name goes with its
/// sidecars, the record forgets the entry and those replica entries
/// (`RemoteSync::forget_held_organization`), and the `org:<id>` consent goes from the keyring.
///
/// **Once the record has forgotten the entry, the forget has happened**, and it answers so: a
/// file that would not go and a consent the keyring would not give up are written to the
/// diagnostics log by name, never returned. An error here would tell the switcher the
/// organization is still held when the record no longer holds it. Only a forget the record did
/// not take is refused.
///
/// **Where a replica entry names no organization**, which only an entry an older build tracked
/// can, the open organization's replica is asked which workspaces are its, and an entry it names
/// is this organization's (`OrganizationStore::workspace_ids_unverified`). The record is the first
/// source and this the second, because a damaged replica or a deleted workspace answers nothing.
/// **Only a replica already open is asked**: opening one from disk to read it would set a damaged
/// file aside under another name, which nothing here would then delete, and an entry naming nobody
/// on a machine whose old list is forgotten is that forget's (`forget_the_old_list`).
///
/// **Each organization's own consent and nothing else** (effort 851, requirement 14): never the
/// pending slot, which is a consent no organization has claimed yet and is the setup walk's to give
/// back, and never another organization's.
pub(crate) async fn forget_one(
    app_state: &Shared,
    credentials: &dyn CredentialStore,
    organization_id: &str,
) -> Result<(), Error> {
    let database_path = { app_state.settings.read().await.database_path.clone() };
    let open = open_organization(app_state).await.as_deref() == Some(organization_id);
    let (held, tracked, unnamed) = {
        let mut remote_sync = app_state.remote_sync.write().await;
        let record = remote_sync.store_mut();
        let tracked: Vec<String> = record
            .replicas
            .iter()
            .filter(|replica| replica.organization_id == organization_id)
            .map(|replica| replica.workspace_id.clone())
            .collect();
        let unnamed: Vec<String> = record
            .replicas
            .iter()
            .filter(|replica| replica.organization_id.trim().is_empty())
            .map(|replica| replica.workspace_id.clone())
            .collect();

        (record.held(organization_id).cloned(), tracked, unnamed)
    };
    let mut workspaces = tracked;

    if !unnamed.is_empty() {
        let named = named_by_its_replica(app_state, open).await;

        workspaces.extend(unnamed.into_iter().filter(|id| named.contains(id)));
    }

    if open {
        // the row this machine wrote to the registry goes first, through the replica that carries
        // the delete (effort 828, requirement 15): after the sign-out below there is no replica
        // left to say anything through, and a machine that let the organization go should stop
        // standing in the owner's way at once rather than in a week.
        super::leave_registry(app_state, organization_id).await;

        // the sign-out, the one `organization_session_sign_out` performs: the keys go and the
        // organization replica is dropped, which is what lets its file be deleted below.
        super::sign_out(app_state, credentials).await;
    }

    // the workspace engine, released the way `open_database` releases it before opening the next,
    // where it is the open organization's or holds a file about to go. **The engine is asked which
    // file it holds**, never the record: a sign-out leaves the engine on the workspace it had open,
    // and a choice of another organization at the wall then moves the record's current workspace
    // to that one's while the engine still holds this one's. Nothing reopens it here: what the
    // machine opens next is the wall's to say.
    {
        let mut db = app_state.db.write().await;
        let holds_one_going = workspaces.iter().any(|workspace_id| {
            db.holds_replica(&Database::replica_path(&database_path, workspace_id))
        });

        if open || holds_one_going {
            db.disconnect().await;
        }
    }

    // the remembered sign-in, which `sign_out` already took where the organization was open.
    if let Some(member_id) = held.as_ref().and_then(|held| held.member_id.as_deref()) {
        super::forget_remembered(credentials, organization_id, member_id);
    }

    let mut left = Vec::new();
    let organization_replica = OrganizationStore::replica_path(&database_path, organization_id);

    Database::remove_replica_files(&organization_replica);
    left.extend(still_there(organization_replica));

    for workspace_id in &workspaces {
        Database::remove_replica(&database_path, workspace_id);
        left.extend(still_there(Database::replica_path(
            &database_path,
            workspace_id,
        )));
    }

    let was_selected = {
        let mut remote_sync = app_state.remote_sync.write().await;

        remote_sync
            .forget_held_organization(organization_id, &workspaces)
            .await?
    };

    // the wall's sentence was about the organization the wall stood on.
    if was_selected {
        app_state
            .signed_out_elsewhere
            .store(false, std::sync::atomic::Ordering::SeqCst);
    }

    // from here on the organization is forgotten, whatever the keyring and the disk say below.
    if let Err(error) = forget_platform_token(credentials, &Account::of(organization_id)) {
        diagnostics::error("organization.forgotten.consentKept")
            .with("organization", organization_id)
            .with("error", error.to_string())
            .write();
    }

    diagnostics::info("organization.forgotten")
        .with("organization", organization_id)
        .with("workspaces", workspaces.len().to_string())
        .with("left", left.len().to_string())
        .write();

    if !left.is_empty() {
        diagnostics::warn("organization.forgotten.filesLeft")
            .with("organization", organization_id)
            .with(
                "files",
                left.iter()
                    .map(|path| path.display().to_string())
                    .collect::<Vec<_>>()
                    .join(", "),
            )
            .write();
    }

    Ok(())
}

/// Forget the organization this machine has open, or, at the wall, the one it is on: what a
/// disconnect does (effort 824, requirement 20). A machine holding nothing has nothing to forget.
pub(crate) async fn forget_the_open_one(
    app_state: &Shared,
    credentials: &dyn CredentialStore,
) -> Result<(), Error> {
    let Some(organization_id) = open_organization(app_state).await else {
        return Ok(());
    };

    forget_one(app_state, credentials, &organization_id).await
}

/// Forget what a record of the shape effort 824 retired listed (`upgrade/shape.rs`): each
/// organization in its `organizations` list, by the id it carried, and every replica entry that
/// names no organization this machine holds, with its file. Then the list itself.
///
/// **Nothing this build holds is touched.** The list was written by a build that knew nothing of
/// `heldOrganizations`, so an entry of it is no organization the record holds, and a replica entry
/// naming nobody held belongs to none of them.
pub(crate) async fn forget_the_old_list(
    app_state: &Shared,
    credentials: &dyn CredentialStore,
) -> Result<(), Error> {
    let (listed, orphaned) = {
        let mut remote_sync = app_state.remote_sync.write().await;
        let record = remote_sync.store_mut();
        let listed: Vec<String> = record
            .organizations_of_the_old_shape
            .iter()
            .filter_map(|listed| listed.get("id").and_then(|id| id.as_str()))
            .filter(|id| !id.trim().is_empty() && record.held(id).is_none())
            .map(str::to_string)
            .collect();
        let orphaned: Vec<String> = record
            .replicas
            .iter()
            .filter(|replica| record.held(&replica.organization_id).is_none())
            .map(|replica| replica.workspace_id.clone())
            .collect();

        (listed, orphaned)
    };

    for organization_id in &listed {
        forget_one(app_state, credentials, organization_id).await?;
    }

    if !orphaned.is_empty() {
        app_state.db.write().await.disconnect().await;
    }

    let database_path = { app_state.settings.read().await.database_path.clone() };
    let mut remote_sync = app_state.remote_sync.write().await;

    for workspace_id in &orphaned {
        Database::remove_replica(&database_path, workspace_id);
        remote_sync.forget_replica(workspace_id)?;
    }

    remote_sync.forget_the_old_shapes_list().await
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
/// serving what it holds (819's requirement 18). **Only the open organization is asked and only it
/// is forgotten**; every other organization held learns the same thing when it is next opened.
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

    forget_the_open_one(app_state, credentials).await?;

    Ok(true)
}

/// The organization this machine has open: the signed-in member's, or, where nobody is in, the
/// selected one, which is the one the wall stands on and the one a replica open without a member
/// was opened for.
pub(crate) async fn open_organization(app_state: &Shared) -> Option<String> {
    if let Some(member) = app_state.member.read().await.as_ref() {
        return Some(member.organization_id.clone());
    }

    let mut remote_sync = app_state.remote_sync.write().await;

    remote_sync
        .store_mut()
        .selected()
        .map(|held| held.id.clone())
}

/// The workspaces the organization's own replica names, read through the replica this process has
/// open where the organization is the open one. One that is not open, or a replica that will not
/// answer, names none.
async fn named_by_its_replica(app_state: &Shared, open: bool) -> Vec<String> {
    if !open {
        return Vec::new();
    }

    match app_state.organization.read().await.as_ref() {
        Some(store) => store.workspace_ids_unverified().await.unwrap_or_default(),
        None => Vec::new(),
    }
}

/// The path, where a removal left it on disk.
fn still_there(path: PathBuf) -> Option<PathBuf> {
    path.exists().then_some(path)
}

#[cfg(test)]
mod tests {
    use crate::credential::{CredentialStore, Memory};

    use std::sync::{Arc, Mutex};

    use serde_json::json;
    use tokio::sync::RwLock;

    use super::{forget_deleted_organization, forget_one, forget_the_open_one};
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
            consent::{
                Account, TursoConsent, move_pending_consent, platform_token, store_platform_token,
            },
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

    /// Whether a file name is a replica's or one of its sidecars: `org-<id>.db`, `ws-<id>.db`, and
    /// anything the engine writes beside either under the same stem.
    fn is_replica_file(name: &str) -> bool {
        (name.starts_with("org-") || name.starts_with("ws-")) && name.contains(".db")
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
        // the organization's own consent, moved where a first run moves it, and a pending one no
        // organization has claimed (effort 851, requirement 14).
        store_platform_token(&credentials, "a-platform-token").expect("the authority");
        move_pending_consent(&credentials, &held.id).expect("the move");
        store_platform_token(&credentials, "a-pending-consent").expect("the pending consent");

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
            platform_token(&credentials, &Account::of(&held.id)).is_ok(),
            "no authority to clear"
        );

        forget_the_open_one(&app_state, &credentials)
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
        assert_eq!(store.consent_organization(Some(&held.id)), None);
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
            platform_token(&credentials, &Account::of(&held.id)).is_err(),
            "the authority survived the disconnect"
        );
        // and only the organization's own: the pending slot is the setup walk's to give back.
        assert_eq!(
            platform_token(&credentials, &Account::Pending).as_deref(),
            Ok("a-pending-consent"),
            "the forget took a consent that was not the organization's"
        );
    }

    /// Every file under the directory with its bytes, by name, for comparing an organization's files
    /// before and after another organization is forgotten.
    fn files_of(
        directory: &std::path::Path,
        organization_id: &str,
        workspaces: &[&str],
    ) -> Vec<(String, Vec<u8>)> {
        let mut files: Vec<(String, Vec<u8>)> = std::fs::read_dir(directory)
            .expect("the directory")
            .flatten()
            .map(|entry| entry.file_name().to_string_lossy().into_owned())
            .filter(|name| {
                name.starts_with(&format!("org-{organization_id}.db"))
                    || workspaces
                        .iter()
                        .any(|workspace| name.starts_with(&format!("ws-{workspace}.db")))
            })
            .map(|name| {
                let bytes = std::fs::read(directory.join(&name)).expect("the file");

                (name, bytes)
            })
            .collect();

        files.sort();

        files
    }

    /// What is filed under a member's remembered key, or nothing.
    fn remembered(credentials: &dyn CredentialStore, held: &HeldOrganization) -> Option<String> {
        credentials
            .get(
                crate::organization::session::MEMBER_KEY_SERVICE,
                &format!(
                    "{}:{}",
                    held.id,
                    held.member_id.as_deref().expect("the owner")
                ),
            )
            .expect("the store would not answer")
    }

    /// **Effort 851, criterion 5, the Rust half: removing one organization forgets that one
    /// alone.**
    ///
    /// A machine holds two organizations, each with a workspace replica and a remembered key, and a
    /// Turso consent for the first. Removing the first deletes exactly its `org-<id>.db`, its
    /// workspace's replica, its keyring entry, its entry on the record and its consent; the
    /// second's files are the same bytes, and its key, its entry and the pending consent are as
    /// they were. Removing the second, the last held, leaves no entry and no selection, which is
    /// the welcome.
    #[tokio::test]
    async fn removing_one_organization_forgets_that_one_alone_and_the_last_leaves_the_welcome() {
        let credentials = Memory::new();
        let directory = scratch("one-of-two");
        let (first_store, first) = created(&credentials, &directory).await;
        let (second_store, second) = created(&credentials, &directory).await;

        drop(first_store);
        drop(second_store);

        assert_ne!(first.id, second.id);

        a_workspace_replica(&directory, "north").await;
        a_workspace_replica(&directory, "south").await;
        // the first organization's own consent, and a pending one no organization has claimed.
        store_platform_token(&credentials, "the-first-consent").expect("the consent");
        move_pending_consent(&credentials, &first.id).expect("the move");
        store_platform_token(&credentials, "a-pending-consent").expect("the pending consent");

        let app_state = state_over(&directory).await;

        {
            let mut remote_sync = app_state.remote_sync.write().await;

            remote_sync
                .remember_replica(
                    "north",
                    first.member_id.as_deref().expect("the owner"),
                    &first.id,
                    1,
                )
                .expect("tracked");
            remote_sync
                .remember_replica(
                    "south",
                    second.member_id.as_deref().expect("the owner"),
                    &second.id,
                    1,
                )
                .expect("tracked");
        }

        let second_entry = app_state
            .remote_sync
            .write()
            .await
            .store_mut()
            .held(&second.id)
            .cloned()
            .expect("the second organization's entry");
        let second_files = files_of(&directory, &second.id, &["south"]);
        let second_key = remembered(&credentials, &second);

        assert!(
            second_files
                .iter()
                .any(|(name, _)| name == &format!("org-{}.db", second.id))
                && second_files.iter().any(|(name, _)| name == "ws-south.db"),
            "the second organization holds no files: {second_files:?}"
        );
        assert!(second_key.is_some(), "the second organization has no key");
        assert!(remembered(&credentials, &first).is_some());

        super::super::remove(&app_state, &credentials, &first.id)
            .await
            .expect("the remove failed");

        // the first is gone: its replica, its workspace, its key, its entry, its consent.
        let left = replica_files(&directory);

        assert!(
            !left
                .iter()
                .any(|name| name.starts_with(&format!("org-{}", first.id))),
            "the first organization's replica survived: {left:?}"
        );
        assert!(
            !left.iter().any(|name| name.starts_with("ws-north")),
            "the first organization's workspace survived: {left:?}"
        );
        assert_eq!(
            remembered(&credentials, &first),
            None,
            "the first key survived"
        );
        assert!(
            platform_token(&credentials, &Account::of(&first.id)).is_err(),
            "the first consent survived"
        );

        // and the second keeps everything, byte for byte.
        assert_eq!(
            files_of(&directory, &second.id, &["south"]),
            second_files,
            "the second organization's files changed"
        );
        assert_eq!(remembered(&credentials, &second), second_key);
        assert_eq!(
            platform_token(&credentials, &Account::Pending).as_deref(),
            Ok("a-pending-consent"),
            "the remove took a consent that was not the first organization's"
        );

        {
            let mut remote_sync = app_state.remote_sync.write().await;
            let record = remote_sync.store_mut();

            assert_eq!(record.held(&first.id), None, "the first entry survived");
            assert_eq!(record.held(&second.id), Some(&second_entry));
            assert_eq!(
                record.selected_organization.as_deref(),
                Some(second.id.as_str()),
                "the selection did not move to the organization left"
            );
            assert_eq!(
                record
                    .replicas
                    .iter()
                    .map(|replica| (
                        replica.workspace_id.as_str(),
                        replica.organization_id.as_str()
                    ))
                    .collect::<Vec<_>>(),
                vec![("south", second.id.as_str())]
            );
        }

        // removing the last one held leaves the welcome: nothing held and nothing selected.
        super::super::remove(&app_state, &credentials, &second.id)
            .await
            .expect("the second remove failed");

        assert_eq!(replica_files(&directory), Vec::<String>::new());
        assert_eq!(remembered(&credentials, &second), None);

        let mut remote_sync = app_state.remote_sync.write().await;
        let record = remote_sync.store_mut();

        assert!(record.held_organizations.is_empty());
        assert_eq!(record.selected_organization, None);
        assert_eq!(record.selected(), None);
        assert!(record.replicas.is_empty());
        assert_eq!(record.workspace.remote_id, None);
        drop(remote_sync);

        // and an organization this machine does not hold is refused, with nothing touched.
        assert!(matches!(
            super::super::remove(&app_state, &credentials, &first.id).await,
            Err(crate::error::Error::Refused {
                reason: crate::error::RefusalReason::NoOrganization,
                ..
            })
        ));
        assert_eq!(
            platform_token(&credentials, &Account::Pending).as_deref(),
            Ok("a-pending-consent")
        );
    }

    /// **A forget the record took answers as done, whatever the disk says after it.** A workspace
    /// replica that will not go (a directory stands where its file would be, which no file removal
    /// takes) is left on disk and written to the log, and the remove answers `Ok` with the
    /// organization no longer held. *It answered with an error until a review of effort 851, and
    /// the switcher went on listing an organization the record had forgotten.*
    #[tokio::test]
    async fn a_forget_the_record_took_answers_as_done_with_a_file_left_behind() {
        let credentials = Memory::new();
        let directory = scratch("file-left");
        let (store, held) = created(&credentials, &directory).await;

        drop(store);

        let stuck = Database::replica_path(&directory.join(Database::FILENAME), "stuck");

        std::fs::create_dir_all(stuck.join("inside")).expect("a directory where the file goes");

        let app_state = state_over(&directory).await;

        app_state
            .remote_sync
            .write()
            .await
            .remember_replica(
                "stuck",
                held.member_id.as_deref().expect("the owner"),
                &held.id,
                1,
            )
            .expect("tracked");

        super::super::remove(&app_state, &credentials, &held.id)
            .await
            .expect("a forget the record took was reported as failed");

        assert!(stuck.exists(), "the test's stuck file went after all");

        let mut remote_sync = app_state.remote_sync.write().await;
        let record = remote_sync.store_mut();

        assert_eq!(
            record.held(&held.id),
            None,
            "the organization is still held"
        );
        assert!(record.replicas.is_empty());
    }

    /// **The workspace engine is released wherever it holds a file about to go**, not where the
    /// record's current workspace says. A sign-out leaves the engine on the first organization's
    /// workspace, and choosing the second at the wall moves the record's current workspace to that
    /// one's; removing the first then lets go of the engine before its workspace's files are
    /// deleted, and they are.
    #[tokio::test]
    async fn removing_an_organization_releases_the_engine_left_on_its_workspace() {
        let credentials = Memory::new();
        let directory = scratch("engine-left");
        let (first_store, first) = created(&credentials, &directory).await;
        let (second_store, second) = created(&credentials, &directory).await;

        drop(first_store);
        drop(second_store);

        a_workspace_replica(&directory, "north").await;

        let app_state = state_over(&directory).await;
        let north = Database::replica_path(&directory.join(Database::FILENAME), "north");

        {
            let mut remote_sync = app_state.remote_sync.write().await;

            remote_sync
                .remember_replica(
                    "north",
                    first.member_id.as_deref().expect("the owner"),
                    &first.id,
                    1,
                )
                .expect("tracked");
            remote_sync
                .select_organization(&second.id)
                .expect("the second chosen");
        }

        // the engine as the first organization's sign-out left it: on its workspace, nobody in.
        app_state
            .db
            .write()
            .await
            .connect_workspace("north", None, || async {
                Ok::<String, turso::Error>(String::new())
            })
            .await
            .expect("the engine on the first organization's workspace");

        assert!(app_state.db.read().await.holds_replica(&north));
        assert_ne!(
            app_state
                .remote_sync
                .read()
                .await
                .workspace()
                .remote_id
                .as_deref(),
            Some("north"),
            "the record still names the first organization's workspace"
        );

        super::super::remove(&app_state, &credentials, &first.id)
            .await
            .expect("the remove failed");

        assert!(
            !app_state.db.read().await.holds_replica(&north),
            "the engine still holds the removed organization's workspace"
        );
        assert!(
            !replica_files(&directory)
                .iter()
                .any(|name| name.starts_with("ws-north")),
            "the removed organization's workspace survived: {:?}",
            replica_files(&directory)
        );
    }

    /// **A workspace replica an older build tracked, naming no organization, goes with the open
    /// organization where its own replica names it** (the plan's second source), and one it does
    /// not name stays: it belongs to nobody this forget concerns.
    #[tokio::test]
    async fn an_unnamed_replica_entry_goes_with_the_organization_whose_replica_names_it() {
        let credentials = Memory::new();
        let directory = scratch("unnamed");
        let (store, held) = created(&credentials, &directory).await;

        // a workspace row as the replica holds one; the read is unverified, so its signature is
        // nothing anybody checks here.
        store
            .connection()
            .execute(
                "INSERT INTO \"workspace\" VALUES ('east', X'00', 'ws-east', 'east.example', 1, 'c', X'00', 1, 1)",
                (),
            )
            .await
            .expect("a workspace row");

        a_workspace_replica(&directory, "east").await;
        a_workspace_replica(&directory, "west").await;

        let app_state = state_over(&directory).await;

        // the organization open, which is the replica the second source reads.
        *app_state.organization.write().await = Some(store);

        {
            let mut remote_sync = app_state.remote_sync.write().await;

            remote_sync
                .remember_replica("east", "a-member", "", 1)
                .expect("tracked");
            remote_sync
                .remember_replica("west", "a-member", "", 1)
                .expect("tracked");
        }

        forget_one(&app_state, &credentials, &held.id)
            .await
            .expect("the forget failed");

        let left = replica_files(&directory);

        assert!(
            !left.iter().any(|name| name.starts_with("ws-east")),
            "a workspace the organization names survived: {left:?}"
        );
        assert!(
            left.iter().any(|name| name == "ws-west.db"),
            "a workspace the organization does not name was taken: {left:?}"
        );

        let mut remote_sync = app_state.remote_sync.write().await;

        assert_eq!(
            remote_sync
                .store_mut()
                .replicas
                .iter()
                .map(|replica| replica.workspace_id.as_str())
                .collect::<Vec<_>>(),
            vec!["west"]
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
