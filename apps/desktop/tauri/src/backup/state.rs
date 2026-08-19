use std::{collections::HashSet, fs, path::Path, sync::Arc};

use tokio::sync::RwLock;

use crate::{
    database::Database, error::Error, persisted::Persisted, settings::Settings, state::AppState,
    sync::RemoteSyncWorkspace, timestamp,
};

use super::manifest::{
    BackupEntry, BackupManifest, BackupManifestLoadOutcome, BackupRecoveryKind, BackupSource,
    head_snapshot_entry, load_backup_manifest, sanitize_manifest_provider,
    sanitize_optional_string,
};

/// a backup manager for a database
pub struct Backup {
    db: Arc<RwLock<Database>>,
    settings: Arc<RwLock<Persisted<Settings>>>,
    pub(super) index: Persisted<BackupManifest>,
}

pub(super) const MANUAL_RETENTION_LIMIT: usize = 1;
pub(super) const AUTOSAVE_RETENTION_LIMIT: usize = 1;
pub(super) const SYNC_RECOVERY_RETENTION_LIMIT: usize = 1;
pub(super) const UPDATE_RECOVERY_RETENTION_LIMIT: usize = 3;

impl Backup {
    pub const BACKUP_DIRECTORY: &'static str = "snapshots";
    pub const MANIFEST_FILENAME: &'static str = "manifest.json";

    pub fn set_protected(&mut self, filename: &str, is_protected: bool) -> Result<bool, Error> {
        let Some(entry) = self
            .index
            .entries
            .iter_mut()
            .find(|entry| entry.filename == filename)
        else {
            return Ok(false);
        };

        if entry.is_protected == is_protected {
            return Ok(false);
        }

        entry.is_protected = is_protected;

        if let Some(head) = self
            .index
            .head
            .as_mut()
            .filter(|head| head.filename == filename)
        {
            head.is_protected = is_protected;
        }

        self.index.commit()?;

        Ok(true)
    }

    pub fn set_manifest_identity(
        &mut self,
        provider: &str,
        workspace_id: Option<String>,
        workspace_name: Option<String>,
    ) -> Result<(), Error> {
        let provider = sanitize_manifest_provider(provider);
        let workspace_id = sanitize_optional_string(workspace_id);
        let workspace_name = sanitize_optional_string(workspace_name);
        let metadata = &self.index.inner().metadata;

        if metadata.provider == provider
            && metadata.workspace_id == workspace_id
            && metadata.workspace_name == workspace_name
        {
            return Ok(());
        }

        self.index.metadata.provider = provider;
        self.index.metadata.workspace_id = workspace_id;
        self.index.metadata.workspace_name = workspace_name;
        self.index.commit()
    }

    pub fn sync_manifest_workspace(
        &mut self,
        workspace: Option<&RemoteSyncWorkspace>,
    ) -> Result<(), Error> {
        match workspace {
            // Manifest identity, and nothing branches on it. It named which provider held the
            // workspace while there were two; Drive sync retired and there is one, so what is
            // written is a constant. An existing manifest saying `googleDrive` or `local`
            // still reads — `set_manifest_identity` writes rather than validates.
            Some(workspace) => self.set_manifest_identity(
                "hosted",
                Some(workspace.id.clone()),
                Some(workspace.name.clone()),
            ),
            None => self.set_manifest_identity("hosted", None, None),
        }
    }

    /// create a new backup manager; loads or initializes the snapshot manifest.
    pub async fn new(
        db: Arc<RwLock<Database>>,
        settings: Arc<RwLock<Persisted<Settings>>>,
    ) -> Result<Self, Error> {
        let settings_arc = settings.clone();
        let backup_dir = { settings_arc.read().await.backup_dir.clone() };
        fs::create_dir_all(&backup_dir)?;

        let manifest_path = backup_dir.join(Self::MANIFEST_FILENAME);
        let BackupManifestLoadOutcome {
            index,
            skip_initial_cleanup,
        } = load_backup_manifest(&backup_dir, manifest_path)?;

        let mut this = Self {
            db,
            settings,
            index,
        };

        if !skip_initial_cleanup {
            let _ = this.cleanup_retained().await;
        }

        Ok(this)
    }

    /// lists all snapshots sorted by creation time (newest first)
    pub async fn list(&mut self) -> Result<Vec<BackupEntry>, Error> {
        let mut entries = self.index.entries.clone();
        entries.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        Ok(entries)
    }

    /// creates a snapshot with a canonical filename `snapshot-{timestamp}.db`
    pub async fn create(&mut self, protected: bool) -> Result<BackupEntry, Error> {
        self.create_with_source(BackupSource::Manual, None, protected, true)
            .await
    }

    pub async fn create_managed(
        &mut self,
        source: BackupSource,
        recovery_kind: Option<BackupRecoveryKind>,
        protected: bool,
    ) -> Result<BackupEntry, Error> {
        if !source.is_managed() {
            return self
                .create_with_source(BackupSource::Manual, None, protected, true)
                .await;
        }

        self.create_with_source(source, recovery_kind, protected, true)
            .await
    }

    pub async fn create_managed_retaining_previous(
        &mut self,
        source: BackupSource,
        recovery_kind: Option<BackupRecoveryKind>,
        protected: bool,
    ) -> Result<BackupEntry, Error> {
        if !source.is_managed() {
            return self
                .create_with_source(BackupSource::Manual, None, protected, false)
                .await;
        }

        self.create_with_source(source, recovery_kind, protected, false)
            .await
    }

    /// restores a snapshot by filename
    pub async fn restore(&self, filename: &str) -> Result<(), Error> {
        let current_version = { self.settings.read().await.version.clone() };
        let entry = self
            .index
            .entries
            .iter()
            .find(|entry| entry.filename == filename)
            .cloned()
            .ok_or_else(snapshot_not_found)?;

        if entry.version != current_version {
            return Err(Error::Integrity {
                message: "snapshot app version does not match current app version".to_string(),
            });
        }

        let backup_dir = { self.settings.read().await.backup_dir.clone() };
        let path = backup_dir.join(&entry.filename);

        let mut db = self.db.write().await;
        db.restore_backup(&path).await
    }

    /// deletes a snapshot by filename
    pub async fn delete(&mut self, filename: &str) -> Result<(), Error> {
        let backup_dir = { self.settings.read().await.backup_dir.clone() };
        let previous_head = self.index.head.clone();

        let pos = self
            .index
            .entries
            .iter()
            .position(|e| e.filename == filename)
            .ok_or_else(snapshot_not_found)?;

        if self.index.entries[pos].is_protected {
            return Err(Error::Forbidden {
                message: "protected snapshots cannot be deleted".to_string(),
            });
        }

        let entry = self.index.entries[pos].clone();
        let path = backup_dir.join(&entry.filename);
        self.index.entries.remove(pos);
        self.index.head = head_snapshot_entry(&self.index.entries);

        if let Err(error) = self.index.commit() {
            self.index.entries.insert(pos, entry);
            self.index.head = previous_head;
            return Err(error);
        }

        if let Err(error) = fs::remove_file(&path) {
            self.index.entries.insert(pos, entry);
            self.index.head = previous_head;

            return Err(match self.index.commit() {
                Ok(()) => error.into(),
                Err(revert_error) => Error::Io {
                    message: format!("failed to delete snapshot file: {}", error),
                }
                .with_context(&format!(
                    "failed to restore snapshot manifest: {}",
                    revert_error
                )),
            });
        }

        Ok(())
    }

    pub async fn cleanup_managed(&mut self) -> Result<(), Error> {
        let backup_dir = { self.settings.read().await.backup_dir.clone() };
        self.prune_missing_entries(&backup_dir)?;

        let mut filenames_to_delete = HashSet::new();

        for (source, recovery_kind, limit) in [
            (BackupSource::Autosave, None, AUTOSAVE_RETENTION_LIMIT),
            (
                BackupSource::Recovery,
                Some(BackupRecoveryKind::Sync),
                SYNC_RECOVERY_RETENTION_LIMIT,
            ),
            (
                BackupSource::Recovery,
                Some(BackupRecoveryKind::Update),
                UPDATE_RECOVERY_RETENTION_LIMIT,
            ),
        ] {
            let mut entries = self
                .index
                .entries
                .iter()
                .filter(|entry| {
                    entry.source == source
                        && entry.recovery_kind == recovery_kind
                        && !entry.is_protected
                })
                .cloned()
                .collect::<Vec<_>>();
            entries.sort_by(|left, right| right.created_at.cmp(&left.created_at));

            for entry in entries.into_iter().skip(limit) {
                filenames_to_delete.insert(entry.filename);
            }
        }

        let mut filenames_to_delete = filenames_to_delete.into_iter().collect::<Vec<_>>();
        filenames_to_delete.sort();

        for filename in filenames_to_delete {
            self.delete(&filename).await?;
        }

        Ok(())
    }

    pub async fn cleanup_retained(&mut self) -> Result<(), Error> {
        self.cleanup_current_state().await?;
        self.cleanup_managed().await
    }

    async fn cleanup_current_state(&mut self) -> Result<(), Error> {
        let backup_dir = { self.settings.read().await.backup_dir.clone() };
        self.prune_missing_entries(&backup_dir)?;

        let mut filenames_to_delete = HashSet::new();

        for (source, limit) in [
            (BackupSource::Manual, MANUAL_RETENTION_LIMIT),
            (BackupSource::Autosave, AUTOSAVE_RETENTION_LIMIT),
        ] {
            let mut entries = self
                .index
                .entries
                .iter()
                .filter(|entry| {
                    entry.source == source
                        && entry.source.participates_in_head()
                        && !entry.is_protected
                })
                .cloned()
                .collect::<Vec<_>>();
            entries.sort_by(|left, right| right.created_at.cmp(&left.created_at));

            for entry in entries.into_iter().skip(limit) {
                filenames_to_delete.insert(entry.filename);
            }
        }

        let mut filenames_to_delete = filenames_to_delete.into_iter().collect::<Vec<_>>();
        filenames_to_delete.sort();

        for filename in filenames_to_delete {
            self.delete(&filename).await?;
        }

        Ok(())
    }

    async fn create_with_source(
        &mut self,
        source: BackupSource,
        recovery_kind: Option<BackupRecoveryKind>,
        protected: bool,
        cleanup_managed_after_create: bool,
    ) -> Result<BackupEntry, Error> {
        let (backup_dir, version) = {
            let settings = self.settings.read().await;
            (settings.backup_dir.clone(), settings.version.clone())
        };

        let timestamp = timestamp::now();
        let filename = format!("snapshot-{}.db", timestamp);
        let path = backup_dir.join(&filename);

        {
            let mut db = self.db.write().await;

            if !db.is_ready().await {
                db.reconnect()
                    .await
                    .map_err(|error| Error::PreconditionFailed {
                        message: format!("database not ready to create snapshot: {error}"),
                    })?;
            }

            if !db.is_ready().await {
                return Err(Error::PreconditionFailed {
                    message: "database not ready to create snapshot".to_string(),
                });
            }

            db.create_backup(&path).await?;
        }

        let entry = BackupEntry {
            filename: filename.clone(),
            created_at: timestamp,
            is_protected: protected,
            version,
            source,
            recovery_kind,
        };

        let previous_head = self.index.head.clone();
        self.index.entries.push(entry.clone());
        self.index.head = head_snapshot_entry(&self.index.entries);

        if let Err(error) = self.index.commit() {
            self.index
                .entries
                .retain(|existing| existing.filename != entry.filename);
            self.index.head = previous_head;

            let cleanup_error = fs::remove_file(&path).err().map(|err| err.to_string());

            return Err(match cleanup_error {
                Some(cleanup_error) => error.with_context(&format!(
                    "failed to remove untracked snapshot file: {}",
                    cleanup_error
                )),
                None => error,
            });
        }

        if cleanup_managed_after_create {
            if entry.source.participates_in_head() {
                let _ = self.cleanup_current_state().await;
            } else if entry.source.is_managed() {
                let _ = self.cleanup_managed().await;
            }
        }

        Ok(entry)
    }

    fn prune_missing_entries(&mut self, backup_dir: &Path) -> Result<(), Error> {
        let original_len = self.index.entries.len();

        self.index
            .entries
            .retain(|entry| backup_dir.join(&entry.filename).exists());

        if self.index.entries.len() != original_len {
            self.index.commit()?;
        }

        Ok(())
    }
}

fn snapshot_not_found() -> Error {
    Error::NotFound {
        message: "snapshot not found".to_string(),
    }
}

pub async fn sync_backup_manifest_workspace(app_state: &AppState) -> Result<(), Error> {
    let workspace = {
        let mut remote_sync = app_state.remote_sync.write().await;
        remote_sync.get_state().await?;
        remote_sync.workspace()
    };

    let mut backup = app_state.backup.write().await;
    backup.sync_manifest_workspace(Some(&workspace))
}

#[cfg(test)]
mod tests {
    use std::{sync::Arc, time::Duration};

    use tokio::{runtime::Runtime, sync::RwLock};

    use super::{
        AUTOSAVE_RETENTION_LIMIT, Backup, BackupRecoveryKind, BackupSource, MANUAL_RETENTION_LIMIT,
        SYNC_RECOVERY_RETENTION_LIMIT, UPDATE_RECOVERY_RETENTION_LIMIT,
    };
    use crate::{
        database::{Database, proxy::SQLQuery},
        error::Error,
        persisted::Persisted,
        settings::Settings,
    };

    fn unique_dir(name: &str) -> std::path::PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("system time before unix epoch")
            .as_nanos();

        std::env::temp_dir()
            .join("rentable-tests")
            .join(format!("{}-{}", name, nanos))
    }

    async fn setup_backup(
        root: &std::path::Path,
    ) -> (
        Backup,
        Arc<RwLock<Database>>,
        Arc<RwLock<Persisted<Settings>>>,
    ) {
        std::fs::create_dir_all(root).expect("failed to create test root");

        let settings_path = root.join(Settings::FILENAME);
        let mut settings =
            Persisted::<Settings>::load(settings_path).expect("failed to load settings");
        settings.database_path = root.join(Database::FILENAME);
        settings.backup_dir = root.join(Backup::BACKUP_DIRECTORY);
        settings.recovery_path = root.join("recovery.json");
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
        // no migrations. What these tests need of it is only that the file holds a table of the
        // application's, which is what `is_ready` asks before it will take a snapshot.
        db.write()
            .await
            .execute_single_sql(SQLQuery {
                sql: "CREATE TABLE tenant (id TEXT PRIMARY KEY, name TEXT)".to_string(),
                params: Vec::new(),
            })
            .await
            .expect("failed to create the test schema");

        let backup = Backup::new(db.clone(), settings.clone())
            .await
            .expect("failed to create backup manager");

        (backup, db, settings)
    }

    #[test]
    fn create_cleans_up_backup_file_when_index_commit_fails() {
        Runtime::new()
            .expect("failed to create tokio runtime")
            .block_on(async {
                let root = unique_dir("backup-create-commit-failure");
                let (mut backup, db, _) = setup_backup(&root).await;
                let index_path = root
                    .join(Backup::BACKUP_DIRECTORY)
                    .join(Backup::MANIFEST_FILENAME);

                std::fs::remove_file(&index_path).expect("failed to remove backup index file");
                std::fs::create_dir_all(&index_path).expect("failed to sabotage backup index path");

                let error = backup
                    .create(false)
                    .await
                    .expect_err("expected backup create to fail");

                assert!(matches!(error, Error::Io { .. }), "got {error:?}");
                assert!(backup.index.entries.is_empty());
                assert!(
                    std::fs::read_dir(root.join(Backup::BACKUP_DIRECTORY))
                        .expect("failed to read backup dir")
                        .filter_map(|entry| entry.ok())
                        .all(
                            |entry| entry.path().extension().and_then(|ext| ext.to_str())
                                != Some("db")
                        )
                );

                db.write().await.disconnect().await;
                let _ = std::fs::remove_dir_all(root);
            });
    }

    #[test]
    fn delete_keeps_backup_file_when_index_commit_fails() {
        Runtime::new()
            .expect("failed to create tokio runtime")
            .block_on(async {
                let root = unique_dir("backup-delete-commit-failure");
                let (mut backup, db, _) = setup_backup(&root).await;
                let entry = backup
                    .create(false)
                    .await
                    .expect("failed to create backup entry");
                let backup_path = root.join(Backup::BACKUP_DIRECTORY).join(&entry.filename);
                let index_path = root
                    .join(Backup::BACKUP_DIRECTORY)
                    .join(Backup::MANIFEST_FILENAME);

                std::fs::remove_file(&index_path).expect("failed to remove backup index file");
                std::fs::create_dir_all(&index_path).expect("failed to sabotage backup index path");

                let error = backup
                    .delete(&entry.filename)
                    .await
                    .expect_err("expected backup delete to fail");

                assert!(matches!(error, Error::Io { .. }), "got {error:?}");
                assert!(backup_path.exists());
                assert_eq!(backup.index.entries.len(), 1);
                assert_eq!(backup.index.entries[0].filename, entry.filename);

                db.write().await.disconnect().await;
                let _ = std::fs::remove_dir_all(root);
            });
    }

    #[test]
    fn managed_autosave_backups_are_auto_cleaned() {
        Runtime::new()
            .expect("failed to create tokio runtime")
            .block_on(async {
                let root = unique_dir("backup-managed-cleanup");
                let (mut backup, db, _) = setup_backup(&root).await;

                for _ in 0..(AUTOSAVE_RETENTION_LIMIT + 2) {
                    let _ = backup
                        .create_managed(BackupSource::Autosave, None, false)
                        .await
                        .expect("failed to create managed autosave backup");
                    std::thread::sleep(Duration::from_millis(2));
                }

                let entries = backup.list().await.expect("failed to list backups");
                let autosave_entries = entries
                    .iter()
                    .filter(|entry| entry.source == BackupSource::Autosave)
                    .collect::<Vec<_>>();

                assert_eq!(autosave_entries.len(), AUTOSAVE_RETENTION_LIMIT);

                db.write().await.disconnect().await;
                let _ = std::fs::remove_dir_all(root);
            });
    }

    #[test]
    fn manual_snapshots_replace_previous_manual_snapshot() {
        Runtime::new()
            .expect("failed to create tokio runtime")
            .block_on(async {
                let root = unique_dir("backup-manual-cleanup");
                let (mut backup, db, _) = setup_backup(&root).await;

                let first = backup
                    .create(false)
                    .await
                    .expect("failed to create first snapshot");
                std::thread::sleep(Duration::from_millis(2));
                let second = backup
                    .create(false)
                    .await
                    .expect("failed to create replacement snapshot");

                let entries = backup.list().await.expect("failed to list snapshots");
                assert_eq!(entries.len(), 1);
                assert_eq!(entries[0].filename, second.filename);
                assert_ne!(entries[0].filename, first.filename);

                db.write().await.disconnect().await;
                let _ = std::fs::remove_dir_all(root);
            });
    }

    #[test]
    fn manual_and_autosave_snapshots_can_coexist() {
        Runtime::new()
            .expect("failed to create tokio runtime")
            .block_on(async {
                let root = unique_dir("backup-manual-autosave-coexist");
                let (mut backup, db, _) = setup_backup(&root).await;

                let manual = backup
                    .create(false)
                    .await
                    .expect("failed to create manual snapshot");
                std::thread::sleep(Duration::from_millis(2));
                let autosave = backup
                    .create_managed(BackupSource::Autosave, None, false)
                    .await
                    .expect("failed to create autosave snapshot");

                let entries = backup.list().await.expect("failed to list snapshots");
                let manual_entries = entries
                    .iter()
                    .filter(|entry| entry.source == BackupSource::Manual)
                    .collect::<Vec<_>>();
                let autosave_entries = entries
                    .iter()
                    .filter(|entry| entry.source == BackupSource::Autosave)
                    .collect::<Vec<_>>();

                assert_eq!(manual_entries.len(), MANUAL_RETENTION_LIMIT);
                assert_eq!(autosave_entries.len(), AUTOSAVE_RETENTION_LIMIT);
                assert_eq!(manual_entries[0].filename, manual.filename);
                assert_eq!(autosave_entries[0].filename, autosave.filename);

                db.write().await.disconnect().await;
                let _ = std::fs::remove_dir_all(root);
            });
    }

    #[test]
    fn sync_recovery_snapshots_replace_previous_sync_recovery() {
        Runtime::new()
            .expect("failed to create tokio runtime")
            .block_on(async {
                let root = unique_dir("backup-sync-recovery-cleanup");
                let (mut backup, db, _) = setup_backup(&root).await;

                let first = backup
                    .create_managed(
                        BackupSource::Recovery,
                        Some(BackupRecoveryKind::Sync),
                        false,
                    )
                    .await
                    .expect("failed to create first sync recovery snapshot");
                std::thread::sleep(Duration::from_millis(2));
                let second = backup
                    .create_managed(
                        BackupSource::Recovery,
                        Some(BackupRecoveryKind::Sync),
                        false,
                    )
                    .await
                    .expect("failed to create replacement sync recovery snapshot");

                let entries = backup.list().await.expect("failed to list snapshots");
                let sync_recovery_entries = entries
                    .iter()
                    .filter(|entry| {
                        entry.source == BackupSource::Recovery
                            && entry.recovery_kind == Some(BackupRecoveryKind::Sync)
                    })
                    .collect::<Vec<_>>();

                assert_eq!(sync_recovery_entries.len(), SYNC_RECOVERY_RETENTION_LIMIT);
                assert_eq!(sync_recovery_entries[0].filename, second.filename);
                assert_ne!(sync_recovery_entries[0].filename, first.filename);

                db.write().await.disconnect().await;
                let _ = std::fs::remove_dir_all(root);
            });
    }

    #[test]
    fn update_recovery_snapshots_keep_latest_three() {
        Runtime::new()
            .expect("failed to create tokio runtime")
            .block_on(async {
                let root = unique_dir("backup-update-recovery-cleanup");
                let (mut backup, db, _) = setup_backup(&root).await;
                let mut created = Vec::new();

                for _ in 0..(UPDATE_RECOVERY_RETENTION_LIMIT + 2) {
                    let entry = backup
                        .create_managed(
                            BackupSource::Recovery,
                            Some(BackupRecoveryKind::Update),
                            false,
                        )
                        .await
                        .expect("failed to create update recovery snapshot");
                    created.push(entry);
                    std::thread::sleep(Duration::from_millis(2));
                }

                let entries = backup.list().await.expect("failed to list snapshots");
                let update_recovery_entries = entries
                    .iter()
                    .filter(|entry| {
                        entry.source == BackupSource::Recovery
                            && entry.recovery_kind == Some(BackupRecoveryKind::Update)
                    })
                    .collect::<Vec<_>>();

                assert_eq!(
                    update_recovery_entries.len(),
                    UPDATE_RECOVERY_RETENTION_LIMIT
                );
                assert_eq!(
                    update_recovery_entries[0].filename,
                    created
                        .last()
                        .expect("missing latest created snapshot")
                        .filename
                );
                assert_eq!(
                    update_recovery_entries
                        .iter()
                        .map(|entry| entry.filename.as_str())
                        .collect::<Vec<_>>(),
                    created
                        .iter()
                        .rev()
                        .take(UPDATE_RECOVERY_RETENTION_LIMIT)
                        .map(|entry| entry.filename.as_str())
                        .collect::<Vec<_>>()
                );

                db.write().await.disconnect().await;
                let _ = std::fs::remove_dir_all(root);
            });
    }

    #[test]
    fn snapshot_creation_reconnects_when_database_is_not_ready() {
        Runtime::new()
            .expect("failed to create tokio runtime")
            .block_on(async {
                let root = unique_dir("backup-reconnect-before-snapshot");
                let (mut backup, db, _) = setup_backup(&root).await;

                db.write().await.disconnect().await;

                let entry = backup
                    .create(false)
                    .await
                    .expect("failed to create snapshot after reconnect");

                assert!(
                    root.join(Backup::BACKUP_DIRECTORY)
                        .join(entry.filename)
                        .exists()
                );

                db.write().await.disconnect().await;
                let _ = std::fs::remove_dir_all(root);
            });
    }

    #[test]
    fn retained_autosave_snapshots_are_pruned_only_after_explicit_cleanup() {
        Runtime::new()
            .expect("failed to create tokio runtime")
            .block_on(async {
                let root = unique_dir("backup-retained-cleanup");
                let (mut backup, db, _) = setup_backup(&root).await;

                let first = backup
                    .create_managed(BackupSource::Autosave, None, false)
                    .await
                    .expect("failed to create initial managed autosave snapshot");
                std::thread::sleep(Duration::from_millis(2));
                let second = backup
                    .create_managed_retaining_previous(BackupSource::Autosave, None, false)
                    .await
                    .expect("failed to create retained managed autosave snapshot");

                let entries_before_cleanup = backup.list().await.expect("failed to list snapshots");
                let retained_entries = entries_before_cleanup
                    .iter()
                    .filter(|entry| entry.source == BackupSource::Autosave)
                    .collect::<Vec<_>>();

                assert_eq!(retained_entries.len(), 2);

                backup
                    .cleanup_managed()
                    .await
                    .expect("failed to clean up retained snapshots");

                let entries_after_cleanup = backup.list().await.expect("failed to list snapshots");
                let autosave_entries = entries_after_cleanup
                    .iter()
                    .filter(|entry| entry.source == BackupSource::Autosave)
                    .collect::<Vec<_>>();

                assert_eq!(autosave_entries.len(), AUTOSAVE_RETENTION_LIMIT);
                assert_eq!(autosave_entries[0].filename, second.filename);
                assert_ne!(autosave_entries[0].filename, first.filename);

                db.write().await.disconnect().await;
                let _ = std::fs::remove_dir_all(root);
            });
    }

    #[test]
    fn manifest_identity_is_persisted() {
        Runtime::new()
            .expect("failed to create tokio runtime")
            .block_on(async {
                let root = unique_dir("backup-manifest-identity");
                let (mut backup, db, _) = setup_backup(&root).await;
                backup
                    .set_manifest_identity(
                        "googleDrive",
                        Some("workspace-123".to_string()),
                        Some("Primary workspace".to_string()),
                    )
                    .expect("failed to persist manifest identity");

                let manifest_path = root
                    .join(Backup::BACKUP_DIRECTORY)
                    .join(Backup::MANIFEST_FILENAME);
                let manifest = std::fs::read_to_string(&manifest_path)
                    .expect("failed to read backup manifest");
                let manifest = serde_json::from_str::<serde_json::Value>(&manifest)
                    .expect("failed to decode backup manifest");

                assert_eq!(manifest["metadata"]["provider"], "googleDrive");
                assert_eq!(manifest["metadata"]["workspaceId"], "workspace-123");
                assert_eq!(manifest["metadata"]["workspaceName"], "Primary workspace");

                db.write().await.disconnect().await;
                let _ = std::fs::remove_dir_all(root);
            });
    }
}
