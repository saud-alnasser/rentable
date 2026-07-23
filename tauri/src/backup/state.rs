use std::{collections::HashSet, fs, path::Path, sync::Arc};

use tokio::sync::RwLock;

use crate::{
    database::Database, persisted::Persisted, remote_sync::RemoteSyncWorkspace, settings::Settings,
    state::AppState, timestamp,
};

use super::manifest::{
    BackupEntry, BackupManifest, BackupManifestLoadOutcome, BackupRecoveryKind, BackupSource,
    head_snapshot_entry, load_backup_manifest, remote_sync_provider_name,
    sanitize_manifest_provider, sanitize_optional_string,
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

    pub fn set_protected(&mut self, filename: &str, is_protected: bool) -> Result<bool, String> {
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
    ) -> Result<(), String> {
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
    ) -> Result<(), String> {
        match workspace {
            Some(workspace) => self.set_manifest_identity(
                remote_sync_provider_name(&workspace.provider),
                Some(workspace.id.clone()),
                Some(workspace.name.clone()),
            ),
            None => self.set_manifest_identity("local", None, None),
        }
    }

    /// create a new backup manager; loads or initializes the snapshot manifest.
    pub async fn new(
        db: Arc<RwLock<Database>>,
        settings: Arc<RwLock<Persisted<Settings>>>,
    ) -> Result<Self, String> {
        let settings_arc = settings.clone();
        let backup_dir = { settings_arc.read().await.backup_dir.clone() };
        fs::create_dir_all(&backup_dir).map_err(|e| e.to_string())?;

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
    pub async fn list(&mut self) -> Result<Vec<BackupEntry>, String> {
        let mut entries = self.index.entries.clone();
        entries.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        Ok(entries)
    }

    /// creates a snapshot with a canonical filename `snapshot-{timestamp}.db`
    pub async fn create(&mut self, protected: bool) -> Result<BackupEntry, String> {
        self.create_with_source(BackupSource::Manual, None, protected, true)
            .await
    }

    pub async fn create_managed(
        &mut self,
        source: BackupSource,
        recovery_kind: Option<BackupRecoveryKind>,
        protected: bool,
    ) -> Result<BackupEntry, String> {
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
    ) -> Result<BackupEntry, String> {
        if !source.is_managed() {
            return self
                .create_with_source(BackupSource::Manual, None, protected, false)
                .await;
        }

        self.create_with_source(source, recovery_kind, protected, false)
            .await
    }

    /// restores a snapshot by filename
    pub async fn restore(&self, filename: &str) -> Result<(), String> {
        let current_version = { self.settings.read().await.version.clone() };
        let entry = self
            .index
            .entries
            .iter()
            .find(|entry| entry.filename == filename)
            .cloned()
            .ok_or("snapshot not found")?;

        if entry.version != current_version {
            return Err("snapshot app version does not match current app version".to_string());
        }

        let backup_dir = { self.settings.read().await.backup_dir.clone() };
        let path = backup_dir.join(&entry.filename);

        let mut db = self.db.write().await;
        db.restore_backup(&path).await
    }

    /// deletes a snapshot by filename
    pub async fn delete(&mut self, filename: &str) -> Result<(), String> {
        let backup_dir = { self.settings.read().await.backup_dir.clone() };
        let previous_head = self.index.head.clone();

        let pos = self
            .index
            .entries
            .iter()
            .position(|e| e.filename == filename)
            .ok_or("snapshot not found")?;

        if self.index.entries[pos].is_protected {
            return Err("protected snapshots cannot be deleted".to_string());
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
                Ok(()) => error.to_string(),
                Err(revert_error) => format!(
                    "failed to delete snapshot file: {}; additionally failed to restore snapshot manifest: {}",
                    error, revert_error
                ),
            });
        }

        Ok(())
    }

    pub async fn cleanup_managed(&mut self) -> Result<(), String> {
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

    pub async fn cleanup_retained(&mut self) -> Result<(), String> {
        self.cleanup_current_state().await?;
        self.cleanup_managed().await
    }

    async fn cleanup_current_state(&mut self) -> Result<(), String> {
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
    ) -> Result<BackupEntry, String> {
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
                    .map_err(|error| format!("database not ready to create snapshot: {error}"))?;
            }

            if !db.is_ready().await {
                return Err("database not ready to create snapshot".to_string());
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
                Some(cleanup_error) => format!(
                    "{}; additionally failed to remove untracked snapshot file: {}",
                    error, cleanup_error
                ),
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

    fn prune_missing_entries(&mut self, backup_dir: &Path) -> Result<(), String> {
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

pub async fn sync_backup_manifest_workspace(app_state: &AppState) -> Result<(), String> {
    let workspace = {
        let mut remote_sync = app_state.remote_sync.write().await;
        remote_sync.get_state().await?;
        remote_sync.workspace()
    };

    let mut backup = app_state.backup.write().await;
    backup.sync_manifest_workspace(Some(&workspace))
}
