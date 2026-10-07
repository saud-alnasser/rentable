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
//!
//! **The organization's replica is held and discarded the same way** (ticket 20), by the record
//! beside `org-<id>.db` and [`discard_unsent_organization`]. Discarding removes the replica and
//! opens it again for the member still signed in, under the credential their session already
//! holds, so a yes asks for no password: the fresh copy is pulled at once, and the session goes on
//! over it. Where that pull cannot go, the empty copy would read as nothing, so the session ends
//! on this machine instead and the wall comes up; the key it stays signed in on is kept, and the
//! next sign-in or launch brings the copy.

use std::sync::Arc;

use crate::{
    clock::{self, Clock},
    diagnostics,
    error::{Error, RefusalReason},
    machine::RemoteSyncState,
    organization::{
        Shared,
        store::{OrganizationStore, leave_no_replica},
        workspace::open_database,
    },
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

/// Discard the changes this machine holds that the organization refused since an upgrade, at the
/// person's word, and answer how the machine stands afterwards. Invoked as
/// `plugin:organization|session_discard_unsent_organization`.
#[tauri::command(rename = "session_discard_unsent_organization")]
pub(crate) async fn organization_session_discard_unsent_organization(
    app_state: tauri::State<'_, Shared>,
    clock: tauri::State<'_, clock::Shared>,
) -> Result<RemoteSyncState, Error> {
    discard_unsent_organization(app_state.inner(), clock.inner()).await
}

/// [`organization_session_discard_unsent_organization`] over the application's state, as a test
/// drives it.
///
/// **Refused with nobody in, and while nothing is held**, so changes that could still be sent are
/// never discarded by this. Once asked, the replica is let go of and removed with its record, and
/// opened again against the organization's remote under the session's own credential: a pull that
/// goes keeps the member signed in over the fresh copy, judged against its floors as every way in
/// judges it; one that does not ends the session here and answers that the remote could not be
/// reached. The changes are gone either way.
pub(crate) async fn discard_unsent_organization(
    app_state: &Shared,
    clock: &clock::Shared,
) -> Result<RemoteSyncState, Error> {
    let reopened = {
        let mut member = app_state.member.write().await;
        let mut organization = app_state.organization.write().await;
        let (Some(session), Some(store)) = (member.as_ref(), organization.as_ref()) else {
            return Err(Error::refused(
                RefusalReason::SignedOut,
                "nobody is signed in to an organization on this machine",
            ));
        };

        if !store.holds_unsendable() {
            return Err(OrganizationStore::nothing_unsent());
        }

        let path = store.path().to_path_buf();
        let slot = Arc::clone(&session.organization_credential);
        let remote_url = {
            let mut remote_sync = app_state.remote_sync.write().await;

            remote_sync
                .store_mut()
                .held(&session.organization_id)
                .map(|held| held.remote_url.clone())
        };

        // the store goes first: on Windows a file this process still has open cannot be deleted.
        *organization = None;
        OrganizationStore::discard_unsendable(&path)?;

        let fresh = OrganizationStore::open(clock.clone(), &path, remote_url, move || {
            let slot = Arc::clone(&slot);

            async move {
                slot.lock()
                    .ok()
                    .and_then(|slot| slot.clone())
                    .ok_or_else(|| turso::Error::Misuse("no credential is unsealed yet".into()))
            }
        })
        .await;
        let fresh = match fresh {
            Ok(fresh) if fresh.pulled().await.is_ok() => Some(fresh),
            _ => None,
        };

        match fresh {
            Some(fresh) => {
                // judged as every way in judges it; a verdict that holds this build is kept on the
                // store and said by the next replication.
                let _ = fresh.refuse_another_format().await;
                *organization = Some(fresh);

                Ok(())
            }
            None => {
                let organization_id = session.organization_id.clone();
                let database_path = app_state.settings.read().await.database_path.clone();

                *member = None;
                leave_no_replica(&database_path, &organization_id);

                diagnostics::info("organization.unsendable.notReopened")
                    .with("organization", organization_id)
                    .write();

                Err(Error::Network {
                    message:
                        "the unsent changes were discarded, and the organization could not be \
                              copied again from Turso just now. sign in again to bring it"
                            .to_string(),
                })
            }
        }
    };

    app_state
        .remote_sync
        .write()
        .await
        .note_unsendable_organization_changes(false, clock.now());

    reopened?;

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
            bringing_up: Default::default(),
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
