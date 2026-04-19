use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;

use crate::{
    backup::{Backup, BackupRecoveryKind, BackupSource, sync_backup_manifest_workspace},
    persisted::{Persistable, Persisted},
    settings::Settings,
    state::AppState,
};

const BASE_RELEASE_URL: &str = "https://github.com/saud-alnasser/rentable/releases";

fn normalize_version(value: &str) -> String {
    value.trim().trim_start_matches('v').to_string()
}

#[derive(Clone)]
pub struct Update {
    backup: Arc<RwLock<Backup>>,
    recovery: Persisted<Recovery>,
}

#[derive(Clone, Default, Serialize, Deserialize, PartialEq, Eq, Debug)]
#[serde(rename_all = "camelCase")]
pub enum RecoveryStatus {
    #[default]
    Pending,
    Applied,
    Obsolete,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Recovery {
    pub status: RecoveryStatus,
    pub target_version: String,
    pub backup_version: String,
    pub backup_filename: String,
    #[serde(default)]
    pub update_error: Option<String>,
    pub backup_release_url: String,
}

impl Default for Recovery {
    fn default() -> Self {
        Self {
            status: RecoveryStatus::Pending,
            target_version: String::new(),
            backup_version: String::new(),
            backup_filename: String::new(),
            update_error: None,
            backup_release_url: String::new(),
        }
    }
}

impl Persistable for Recovery {
    fn sanitize(&mut self) {
        self.target_version = normalize_version(&self.target_version);
        self.backup_version = normalize_version(&self.backup_version);
        self.backup_filename = self.backup_filename.trim().to_string();
        self.backup_release_url = self.backup_release_url.trim().to_string();

        if self.target_version.is_empty() {
            self.target_version = String::new();
        }

        if self.backup_version.is_empty() {
            self.backup_version = String::new();
        }

        if self.backup_filename.is_empty() {
            self.backup_filename = String::new();
        }

        if self.update_error.is_none() {
            self.update_error = None;
        }

        if self.backup_release_url.is_empty() {
            self.backup_release_url = String::new();
        }
    }
}

impl Recovery {
    pub fn has_data(&self) -> bool {
        !self.target_version.trim().is_empty()
            || !self.backup_version.trim().is_empty()
            || !self.backup_filename.trim().is_empty()
            || !self.backup_release_url.trim().is_empty()
            || self.update_error.is_some()
    }
}

impl Update {
    pub const FILENAME: &'static str = "recovery.json";

    pub async fn new(
        backup: Arc<RwLock<Backup>>,
        settings: Arc<RwLock<Persisted<Settings>>>,
    ) -> Result<Self, String> {
        let settings = settings.read().await;
        let recovery = Persisted::<Recovery>::load(settings.recovery_path.clone())?;

        Ok(Self { backup, recovery })
    }

    pub const fn recovery(&self) -> &Persisted<Recovery> {
        &self.recovery
    }

    pub async fn prepare(
        &mut self,
        backup_version: &str,
        target_version: &str,
    ) -> Result<Recovery, String> {
        let backup_version = normalize_version(backup_version);
        let target_version = normalize_version(target_version);

        if target_version.is_empty() {
            return Err("target version is required".to_string());
        }

        if self.recovery.status == RecoveryStatus::Pending && self.recovery.has_data() {
            return Err(
                "cannot prepare update while another recovery is still pending".to_string(),
            );
        }

        let previous_recovery = self.recovery.inner().clone();

        let entry = {
            let mut backup = self.backup.write().await;
            backup
                .create_managed(
                    BackupSource::Recovery,
                    Some(BackupRecoveryKind::Update),
                    true,
                )
                .await?
        };
        let backup_filename = entry.filename.clone();

        self.recovery.target_version = target_version;
        self.recovery.backup_version = backup_version.clone();
        self.recovery.backup_filename = entry.filename;
        self.recovery.status = RecoveryStatus::Pending;
        self.recovery.update_error = None;
        self.recovery.backup_release_url = format!("{}/tag/v{}", BASE_RELEASE_URL, backup_version);

        if let Err(error) = self.recovery.commit() {
            *self.recovery = previous_recovery;

            let cleanup_error = {
                let mut backup = self.backup.write().await;
                let mut cleanup_errors = Vec::new();

                if let Err(cleanup_error) = backup.set_protected(&backup_filename, false) {
                    cleanup_errors.push(format!(
                        "failed to unprotect recovery backup: {}",
                        cleanup_error
                    ));
                }

                if let Err(cleanup_error) = backup.delete(&backup_filename).await {
                    cleanup_errors.push(format!(
                        "failed to delete recovery backup: {}",
                        cleanup_error
                    ));
                }

                cleanup_errors
            };

            return Err(if cleanup_error.is_empty() {
                error
            } else {
                format!("{}; additionally {}", error, cleanup_error.join("; "))
            });
        }

        Ok(self.recovery.inner().clone())
    }

    pub fn fail(&mut self, error: Option<String>) -> Result<(), String> {
        self.recovery.update_error = error;
        self.recovery.status = RecoveryStatus::Pending;

        self.recovery.commit()?;

        Ok(())
    }

    pub async fn complete(&mut self) -> Result<(), String> {
        {
            if !self.recovery.backup_filename.trim().is_empty() {
                let mut backup = self.backup.write().await;
                backup.set_protected(&self.recovery.backup_filename, false)?;
                let _ = backup.cleanup_retained().await;
            }
        }

        self.recovery.status = RecoveryStatus::Obsolete;

        self.recovery.commit()?;

        Ok(())
    }

    pub async fn rollback(&mut self) -> Result<(), String> {
        {
            let mut backup = self.backup.write().await;

            backup.restore(&self.recovery.backup_filename).await?;

            backup.set_protected(&self.recovery.backup_filename, false)?;
            let _ = backup.cleanup_retained().await;
        }

        self.recovery.status = RecoveryStatus::Applied;

        self.recovery.commit()?;

        Ok(())
    }
}

#[tauri::command]
pub async fn update_prepare(
    app_state: tauri::State<'_, AppState>,
    target_version: String,
) -> Result<Recovery, String> {
    sync_backup_manifest_workspace(app_state.inner()).await?;

    let mut update = app_state.update.write().await;
    let settings = app_state.settings.read().await;

    update.prepare(&settings.version, &target_version).await
}

#[cfg(test)]
mod tests {
    use super::{RecoveryStatus, Update};
    use crate::{backup::Backup, database::Database, persisted::Persisted, settings::Settings};
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
        Arc<RwLock<Backup>>,
        Arc<RwLock<Database>>,
        Arc<RwLock<Persisted<Settings>>>,
    ) {
        std::fs::create_dir_all(root).expect("failed to create test root");

        let settings_path = root.join(Settings::FILENAME);
        let mut settings =
            Persisted::<Settings>::load(settings_path).expect("failed to load settings");
        settings.database_path = root.join(Database::FILENAME);
        settings.migration_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("migrations");
        settings.backup_dir = root.join(Backup::BACKUP_DIRECTORY);
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

        let backup = Arc::new(RwLock::new(
            Backup::new(db.clone(), settings.clone())
                .await
                .expect("failed to create backup manager"),
        ));
        let update = Update::new(backup.clone(), settings.clone())
            .await
            .expect("failed to create update manager");

        (update, backup, db, settings)
    }

    #[test]
    fn prepare_rejects_when_recovery_is_already_pending() {
        Runtime::new()
            .expect("failed to create tokio runtime")
            .block_on(async {
                let root = unique_dir("update-prepare-pending-recovery");
                let (mut update, backup, db, _) = setup_update(&root).await;

                update.recovery.status = RecoveryStatus::Pending;
                update.recovery.target_version = "0.5.2".to_string();
                update.recovery.backup_version = "0.5.1".to_string();
                update.recovery.backup_filename = "snapshot-1.db".to_string();
                update
                    .recovery
                    .commit()
                    .expect("failed to seed pending recovery");

                let error = update
                    .prepare("0.5.1", "0.5.3")
                    .await
                    .expect_err("expected prepare to reject existing pending recovery");

                assert!(error.contains("pending"));
                assert!(
                    backup
                        .write()
                        .await
                        .list()
                        .await
                        .expect("failed to list backups")
                        .is_empty()
                );

                db.write().await.disconnect().await;
                let _ = std::fs::remove_dir_all(root);
            });
    }

    #[test]
    fn prepare_cleans_up_backup_when_recovery_commit_fails() {
        Runtime::new()
            .expect("failed to create tokio runtime")
            .block_on(async {
                let root = unique_dir("update-prepare-recovery-commit-failure");
                let (mut update, backup, db, _) = setup_update(&root).await;
                let recovery_path = root.join(Update::FILENAME);

                std::fs::remove_file(&recovery_path).expect("failed to remove recovery file");
                std::fs::create_dir_all(&recovery_path).expect("failed to sabotage recovery path");

                let error = update
                    .prepare("0.5.1", "0.5.2")
                    .await
                    .expect_err("expected prepare to fail when recovery commit fails");

                assert!(
                    error.contains("failed")
                        || error.contains("denied")
                        || error.contains("directory")
                );
                assert!(!update.recovery.has_data());
                assert!(
                    backup
                        .write()
                        .await
                        .list()
                        .await
                        .expect("failed to list backups")
                        .is_empty()
                );

                db.write().await.disconnect().await;
                let _ = std::fs::remove_dir_all(root);
            });
    }
}
