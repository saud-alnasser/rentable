use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;

use crate::{
    error::Error,
    persisted::{Persistable, Persisted},
    settings::Settings,
    state::AppState,
};

const BASE_RELEASE_URL: &str = "https://github.com/saud-alnasser/rentable/releases";

fn normalize_version(value: &str) -> String {
    value.trim().trim_start_matches('v').to_string()
}

/// What an update leaves behind for the version that comes after it.
///
/// **The protected snapshot is gone, and what replaced it is the record being somewhere else**
/// (#569, requirement 17). Until 2026-08-19 this took a copy of the database before installing
/// and put it back if the new version would not start. A workspace is a Turso database with a
/// local replica now, so the file on this machine is not the record: an update that damages it
/// costs nothing that is not still held remotely. Copying a replica out was refused by the
/// engine before it was deleted, so there was nothing left to take a snapshot of either.
///
/// **Two things still have to survive an update, and neither is a file.** The session, because
/// requirement 1 says a version change must not put a working user behind a login page: it is
/// persisted in `remote-sync.json` rather than held for the run of the process, and
/// `the_window_survives_the_application_being_closed_and_reopened` in `sync/control.rs` is
/// where that is exercised. And the route back, which is this file: a version that cannot open
/// the workspace has to be able to say which release the user came from, because reinstalling
/// it is the only move left to them.
#[derive(Clone)]
pub struct Update {
    recovery: Persisted<Recovery>,
}

#[derive(Clone, Default, Serialize, Deserialize, PartialEq, Eq, Debug)]
#[serde(rename_all = "camelCase")]
pub enum RecoveryStatus {
    /// an update was prepared and nothing has said how it went.
    #[default]
    Pending,
    /// it went, one way or the other, and there is nothing outstanding.
    ///
    /// *`applied` is what a rollback wrote while there was a snapshot to restore, and it is
    /// read as this: the recovery was over either way.*
    #[serde(alias = "applied")]
    Obsolete,
}

/// The route back from a version that will not run.
///
/// *`backupFilename` went with the snapshot it named, and `backupVersion` and
/// `backupReleaseUrl` are `previousVersion` and `previousReleaseUrl`: with no backup to be the
/// version of, what the field always meant was the release this machine came from.*
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Recovery {
    pub status: RecoveryStatus,
    pub target_version: String,
    pub previous_version: String,
    pub update_error: Option<String>,
    pub previous_release_url: String,
}

impl Default for Recovery {
    fn default() -> Self {
        Self {
            status: RecoveryStatus::Pending,
            target_version: String::new(),
            previous_version: String::new(),
            update_error: None,
            previous_release_url: String::new(),
        }
    }
}

impl Persistable for Recovery {
    fn sanitize(&mut self) {
        self.target_version = normalize_version(&self.target_version);
        self.previous_version = normalize_version(&self.previous_version);
        self.previous_release_url = self.previous_release_url.trim().to_string();
    }
}

impl Recovery {
    pub fn has_data(&self) -> bool {
        !self.target_version.trim().is_empty()
            || !self.previous_version.trim().is_empty()
            || !self.previous_release_url.trim().is_empty()
            || self.update_error.is_some()
    }
}

impl Update {
    pub const FILENAME: &'static str = "recovery.json";

    pub async fn new(settings: Arc<RwLock<Persisted<Settings>>>) -> Result<Self, Error> {
        let settings = settings.read().await;
        let recovery = Persisted::<Recovery>::load(settings.recovery_path.clone())?;

        Ok(Self { recovery })
    }

    pub const fn recovery(&self) -> &Persisted<Recovery> {
        &self.recovery
    }

    /// Record which release this machine is leaving, before the installer replaces it.
    ///
    /// **Nothing is copied and nothing is written to the workspace.** The whole of what this
    /// buys is that the version arriving next can name the one it displaced, and that is worth
    /// writing down before the install rather than after, because after is the case that does
    /// not happen.
    pub async fn prepare(
        &mut self,
        previous_version: &str,
        target_version: &str,
    ) -> Result<Recovery, Error> {
        let previous_version = normalize_version(previous_version);
        let target_version = normalize_version(target_version);

        if target_version.is_empty() {
            return Err(Error::InvalidInput {
                message: "target version is required".to_string(),
            });
        }

        if self.recovery.status == RecoveryStatus::Pending && self.recovery.has_data() {
            return Err(Error::Busy {
                message: "cannot prepare update while another recovery is still pending"
                    .to_string(),
            });
        }

        let previous_recovery = self.recovery.inner().clone();

        self.recovery.target_version = target_version;
        self.recovery.previous_version = previous_version.clone();
        self.recovery.status = RecoveryStatus::Pending;
        self.recovery.update_error = None;
        self.recovery.previous_release_url =
            format!("{}/tag/v{}", BASE_RELEASE_URL, previous_version);

        if let Err(error) = self.recovery.commit() {
            *self.recovery = previous_recovery;

            return Err(error);
        }

        Ok(self.recovery.inner().clone())
    }

    /// The new version is running and cannot open the workspace.
    ///
    /// Keeping it pending is what puts the route back on screen at the next launch as well as
    /// this one, since a user who quits rather than acting on it has not stopped needing it.
    pub fn fail(&mut self, error: Option<String>) -> Result<(), Error> {
        self.recovery.update_error = error;
        self.recovery.status = RecoveryStatus::Pending;

        self.recovery.commit()?;

        Ok(())
    }

    /// Nothing is outstanding: either the new version opened the workspace, or the user took the
    /// route back and this machine is running the release it came from.
    ///
    /// *It was two methods, `complete` and `rollback`, and the difference between them was that
    /// one restored a snapshot. Neither restores anything now, so they are one.*
    pub fn resolve(&mut self) -> Result<(), Error> {
        self.recovery.status = RecoveryStatus::Obsolete;

        self.recovery.commit()?;

        Ok(())
    }
}

#[tauri::command]
pub async fn update_prepare(
    app_state: tauri::State<'_, AppState>,
    target_version: String,
) -> Result<Recovery, Error> {
    let mut update = app_state.update.write().await;
    let settings = app_state.settings.read().await;

    update.prepare(&settings.version, &target_version).await
}

#[cfg(test)]
mod tests {
    use super::{Error, Recovery, RecoveryStatus, Update};
    use crate::{
        database::{Database, proxy::SQLQuery},
        persisted::Persisted,
        settings::Settings,
    };
    use std::{path::Path, path::PathBuf, sync::Arc};
    use tokio::{runtime::Runtime, sync::RwLock};

    fn unique_dir(name: &str) -> PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("system time before unix epoch")
            .as_nanos();

        std::env::temp_dir()
            .join("rentable-tests")
            .join(format!("{}-{}", name, nanos))
    }

    async fn setup_update(
        root: &Path,
    ) -> (
        Update,
        Arc<RwLock<Database>>,
        Arc<RwLock<Persisted<Settings>>>,
    ) {
        std::fs::create_dir_all(root).expect("failed to create test root");

        let settings_path = root.join(Settings::FILENAME);
        let mut settings =
            Persisted::<Settings>::load(settings_path).expect("failed to load settings");
        settings.database_path = root.join(Database::FILENAME);
        settings.recovery_path = root.join(Update::FILENAME);
        settings.version = "0.5.1".to_string();
        settings.commit().expect("failed to commit settings");

        let settings = Arc::new(RwLock::new(settings));
        let db = Arc::new(RwLock::new(Database::new(settings.clone())));
        db.write()
            .await
            .connect()
            .await
            .expect("failed to connect test database");

        // The schema is put here by hand because nothing else puts it anywhere: a workspace's
        // schema is the control plane's and arrives as replicated pages, and `connect()` applies
        // no migrations.
        db.write()
            .await
            .execute_single_sql(SQLQuery {
                sql: "CREATE TABLE tenant (id TEXT PRIMARY KEY, name TEXT)".to_string(),
                params: Vec::new(),
            })
            .await
            .expect("failed to create the test schema");

        let update = Update::new(settings.clone())
            .await
            .expect("failed to create update manager");

        (update, db, settings)
    }

    #[test]
    fn prepare_rejects_when_recovery_is_already_pending() {
        Runtime::new()
            .expect("failed to create tokio runtime")
            .block_on(async {
                let root = unique_dir("update-prepare-pending-recovery");
                let (mut update, db, _) = setup_update(&root).await;

                update.recovery.status = RecoveryStatus::Pending;
                update.recovery.target_version = "0.5.2".to_string();
                update.recovery.previous_version = "0.5.1".to_string();
                update
                    .recovery
                    .commit()
                    .expect("failed to seed pending recovery");

                let error = update
                    .prepare("0.5.1", "0.5.3")
                    .await
                    .expect_err("expected prepare to reject existing pending recovery");

                assert!(matches!(error, Error::Busy { .. }), "got {error:?}");
                assert_eq!(update.recovery.target_version, "0.5.2");

                db.write().await.disconnect().await;
                let _ = std::fs::remove_dir_all(root);
            });
    }

    #[test]
    fn prepare_keeps_the_previous_route_when_the_record_cannot_be_written() {
        Runtime::new()
            .expect("failed to create tokio runtime")
            .block_on(async {
                let root = unique_dir("update-prepare-recovery-commit-failure");
                let (mut update, db, _) = setup_update(&root).await;
                let recovery_path = root.join(Update::FILENAME);

                std::fs::remove_file(&recovery_path).expect("failed to remove recovery file");
                std::fs::create_dir_all(&recovery_path).expect("failed to sabotage recovery path");

                let error = update
                    .prepare("0.5.1", "0.5.2")
                    .await
                    .expect_err("expected prepare to fail when recovery commit fails");

                assert!(matches!(error, Error::Io { .. }), "got {error:?}");
                assert!(!update.recovery.has_data());

                db.write().await.disconnect().await;
                let _ = std::fs::remove_dir_all(root);
            });
    }

    /// **This is what replaced the protected snapshot** (#569, acceptance criterion 18).
    ///
    /// The mechanism is that there is no local record to protect: preparing an update writes a
    /// version and a release URL and touches the workspace not at all, so the file the new
    /// version opens is byte for byte the one the old version left, and what is in it is still
    /// there to be read. Asserted on the bytes rather than on the absence of a call, because
    /// the absence of a call is what a regression would restore.
    #[test]
    fn preparing_an_update_leaves_the_workspace_exactly_as_it_was() {
        Runtime::new()
            .expect("failed to create tokio runtime")
            .block_on(async {
                let root = unique_dir("update-prepare-leaves-the-workspace");
                let (mut update, db, _) = setup_update(&root).await;
                let database_path = root.join(Database::FILENAME);

                db.write()
                    .await
                    .execute_single_sql(SQLQuery {
                        sql: "INSERT INTO tenant (id, name) VALUES ('t1', 'a tenant')".to_string(),
                        params: Vec::new(),
                    })
                    .await
                    .expect("failed to write the row");

                // Let go of the file first: what an installer replaces is a binary, and the
                // question is what the next one finds on disk.
                db.write().await.disconnect().await;

                let before = std::fs::read(&database_path).expect("failed to read the workspace");

                update
                    .prepare("0.5.1", "0.5.2")
                    .await
                    .expect("failed to prepare the update");

                let after = std::fs::read(&database_path).expect("failed to read the workspace");
                assert_eq!(before, after, "preparing an update rewrote the workspace");

                // and it is still a database, not merely the same bytes.
                let mut reopened = Database::new(Arc::new(RwLock::new(
                    Persisted::<Settings>::load(root.join(Settings::FILENAME))
                        .expect("failed to load settings"),
                )));
                reopened
                    .connect()
                    .await
                    .expect("failed to reopen the workspace");
                let rows = reopened
                    .execute_single_sql(SQLQuery {
                        sql: "SELECT name FROM tenant WHERE id = 't1'".to_string(),
                        params: Vec::new(),
                    })
                    .await
                    .expect("failed to read the row back");
                assert_eq!(rows.len(), 1, "the row did not survive the update");

                reopened.disconnect().await;
                let _ = std::fs::remove_dir_all(root);
            });
    }

    /// A recovery file written before the backup surface retired still reads, so a machine
    /// carrying one does not meet a startup panic instead of an application. `applied` is the
    /// status that no longer exists, and the fields naming a snapshot are simply not read.
    #[test]
    fn a_recovery_written_while_there_were_snapshots_still_reads() {
        let recovery: Recovery = serde_json::from_str(
            r#"{
                "status": "applied",
                "targetVersion": "0.5.2",
                "backupVersion": "0.5.1",
                "backupFilename": "snapshot-1.db",
                "backupReleaseUrl": "https://example.invalid/v0.5.1"
            }"#,
        )
        .expect("a recovery written with a snapshot should still read");

        assert_eq!(recovery.status, RecoveryStatus::Obsolete);
        assert_eq!(recovery.target_version, "0.5.2");
        // the release it named went with the snapshot: there is no route back to offer, and a
        // resolved recovery offers none anyway.
        assert_eq!(recovery.previous_version, "");
    }

    /// The route back is the half of the old mechanism that survives, so it has to survive the
    /// thing it exists for: the application being replaced by a different build.
    #[test]
    fn the_route_back_survives_the_application_being_replaced() {
        Runtime::new()
            .expect("failed to create tokio runtime")
            .block_on(async {
                let root = unique_dir("update-route-back-survives");
                let (mut update, db, settings) = setup_update(&root).await;

                update
                    .prepare("0.5.1", "0.5.2")
                    .await
                    .expect("failed to prepare the update");

                // a second process over the same file, which is what the installed new version is.
                let installed = Update::new(settings)
                    .await
                    .expect("failed to load the recovery record");
                let recovery: &Recovery = installed.recovery();

                assert_eq!(recovery.status, RecoveryStatus::Pending);
                assert_eq!(recovery.target_version, "0.5.2");
                assert_eq!(recovery.previous_version, "0.5.1");
                assert_eq!(
                    recovery.previous_release_url,
                    "https://github.com/saud-alnasser/rentable/releases/tag/v0.5.1"
                );

                db.write().await.disconnect().await;
                let _ = std::fs::remove_dir_all(root);
            });
    }
}
