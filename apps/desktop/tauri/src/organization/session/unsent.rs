//! What becomes of changes this machine had not sent when an upgrade made the workspace refuse
//! them (effort 857, requirement 10, ticket 13).
//!
//! **They are kept until the person says otherwise.** The replication that meets the refusal
//! records it beside the replica and from then on neither pushes nor pulls it
//! (`database/unsendable.rs`), and every replication answers `ChangesUnsendableAfterUpgrade`, which
//! this machine's record says to the sync card. The changes stay readable here, and what the
//! others write does not arrive until the choice is made.
//!
//! **The choice is the person's, and discarding is the only act.** Keeping them is doing nothing:
//! the card goes on saying so. Discarding them, after an explicit yes on the card, is
//! [`discard_unsent`]: the replica is removed with its record and the workspace opened again, which
//! makes a fresh copy of what the remote holds.

use crate::{
    clock::{self, Clock},
    error::Error,
    machine::RemoteSyncState,
    organization::{Shared, workspace::open_database},
};

/// Discard the changes this machine holds that the workspace refused since an upgrade, at the
/// person's word, and answer how the machine stands afterwards. Invoked as
/// `plugin:organization|session_discard_unsent`.
#[tauri::command(rename = "session_discard_unsent")]
pub(crate) async fn organization_session_discard_unsent(
    app_state: tauri::State<'_, Shared>,
    clock: tauri::State<'_, clock::Shared>,
) -> Result<RemoteSyncState, Error> {
    discard_unsent(app_state.inner(), clock.inner().as_ref()).await
}

/// [`organization_session_discard_unsent`] over the application's state, as a test drives it.
///
/// **Refused while nothing is held**, by the engine's own check, so changes that could still be
/// sent are never discarded by this. Once the replica is removed the workspace is opened as a
/// launch opens it, and an opening that cannot reach the remote says so: the changes are gone
/// either way, and the next opening fetches the copy.
pub(crate) async fn discard_unsent(
    app_state: &Shared,
    clock: &dyn Clock,
) -> Result<RemoteSyncState, Error> {
    app_state.db.write().await.discard_unsendable().await?;
    app_state
        .remote_sync
        .write()
        .await
        .clear_unsendable_changes();

    if let Some(error) = open_database(app_state, clock).await {
        return Err(error);
    }

    app_state.remote_sync.write().await.get_state().await
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use tokio::sync::RwLock;

    use super::discard_unsent;
    use crate::{
        credential::Memory,
        database::Database,
        error::Error,
        machine::RemoteSync,
        organization::{Shared, session::replicate, workspace::open_database},
        persisted::Persisted,
        settings::Settings,
        sync::test::server::{ScriptedResponse, ScriptedServer},
        test::scratch,
        turso::consent::TursoConsent,
        update::Update,
    };

    /// What the remote answers a push whose changes name a column an upgrade removed, as the
    /// live run of ticket 13 read it off Turso. *`database/mod.rs` keeps the same answer; a
    /// fixture is written out per module ([[rules/testing]]).*
    const REMOVED_COLUMN: &str = r#"{"baton":null,"base_url":null,"results":[{"type":"error","error":{"message":"SQLite error: table unit has no column named note","code":"SQLITE_UNKNOWN"}}]}"#;

    /// The organization's state over one data directory, as the plugins' setups build it, with
    /// nothing open and nobody in. *`workspace/open.rs` keeps the same builder.*
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
            held_by_version: Arc::new(std::sync::Mutex::new(None)),
            old_shape_check: tokio::sync::OnceCell::new(),
        }
    }

    /// A replica of the workspace `id` on disk, holding a table and one row it has not sent: what
    /// an older build left behind when an upgrade stopped it.
    async fn a_replica_holding_a_change(
        directory: &std::path::Path,
        id: &str,
    ) -> std::path::PathBuf {
        let path = Database::replica_path(&directory.join(Database::FILENAME), id);
        let replica = Database::open_replica(&crate::clock::System, &path, None, || async {
            Ok::<String, turso::Error>(String::new())
        })
        .await
        .expect("the workspace replica");
        let connection = replica.connect().await.expect("a connection");

        for statement in [
            "CREATE TABLE \"unit\" (\"id\" TEXT PRIMARY KEY, \"note\" TEXT)",
            "INSERT INTO \"unit\" VALUES ('u-1', 'written before the upgrade')",
        ] {
            connection.execute(statement, ()).await.expect(statement);
        }

        drop(connection);
        drop(replica);

        path
    }

    /// **Ticket 13, end to end on this machine.** An updated build opens a replica holding a change
    /// an upgrade made unsendable: the opening does not pull over it, the heartbeat's push is
    /// refused and answered as `unsendable` on the replication and on the machine's record, and
    /// nothing is pulled after it. Nothing is dropped until the discard, which is refused for a
    /// machine holding nothing and, once asked, removes the replica and opens the workspace again.
    #[tokio::test]
    async fn a_change_an_upgrade_made_unsendable_is_kept_said_and_discarded_only_when_asked() {
        let directory = scratch("unsent");
        let replica = a_replica_holding_a_change(&directory, "south").await;
        let server = ScriptedServer::start(
            (0..16)
                .map(|_| ScriptedResponse::new(200, REMOVED_COLUMN))
                .chain((0..16).map(|_| ScriptedResponse::hangup()))
                .collect(),
        )
        .await;
        let app_state = state_over(&directory).await;

        app_state
            .remote_sync
            .write()
            .await
            .open_organization_workspace("south", "South", &server.url(""), 0, "a-credential")
            .expect("the workspace recorded");

        assert!(
            open_database(&app_state, &crate::clock::System)
                .await
                .is_none(),
            "the workspace did not open"
        );
        assert_eq!(
            server.request_count(),
            0,
            "the opening reached the remote over a change it has not sent"
        );

        let replicated = replicate(&app_state, &Memory::new(), &crate::clock::System::shared())
            .await
            .expect("the heartbeat");

        assert!(!replicated.pushed);
        assert_eq!(
            serde_json::to_value(&replicated).expect("the answer")["refusal"],
            "unsendable"
        );
        assert!(
            (0..server.request_count())
                .all(|index| server.request(index).target != "/pull-updates"),
            "a refused push was followed by a pull"
        );

        let state = app_state
            .remote_sync
            .write()
            .await
            .get_state()
            .await
            .expect("the state");

        assert!(
            state.unsendable_changes.is_some(),
            "the record says nothing"
        );
        assert!(
            state.account_refusal.is_none(),
            "the refusal was read as the account's"
        );

        // kept: the next heartbeat reaches nothing and says the same.
        let reached = server.request_count();
        let again = replicate(&app_state, &Memory::new(), &crate::clock::System::shared())
            .await
            .expect("the next heartbeat");

        assert_eq!(
            serde_json::to_value(&again).expect("the answer")["refusal"],
            "unsendable"
        );
        assert_eq!(
            server.request_count(),
            reached,
            "the held replica reached the remote"
        );

        // the discard, asked: the replica is removed and the workspace opened again, which
        // reaches for a fresh copy and, the remote being silent now, says it could not.
        let discarded = discard_unsent(&app_state, &crate::clock::System).await;

        assert!(
            matches!(discarded, Err(Error::Network { .. })),
            "{discarded:?}"
        );
        assert!(
            !crate::database::unsendable::marker(&replica).exists(),
            "the record of the refusal is still on disk"
        );
        assert!(
            !app_state.db.read().await.is_ready().await,
            "the replica holding the refused change is still the one open"
        );
        assert!(
            app_state
                .remote_sync
                .write()
                .await
                .get_state()
                .await
                .expect("the state")
                .unsendable_changes
                .is_none(),
            "the record still says there are changes to discard"
        );

        // and with nothing held, a discard is refused.
        assert!(matches!(
            discard_unsent(&app_state, &crate::clock::System).await,
            Err(Error::PreconditionFailed { .. })
        ));

        app_state.db.write().await.disconnect().await;
        let _ = std::fs::remove_dir_all(&directory);
    }
}
