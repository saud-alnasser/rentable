use serde::{Deserialize, Deserializer, Serialize};
use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
    sync::Arc,
    time::UNIX_EPOCH,
};
use tokio::sync::RwLock;

use crate::{
    database::Database,
    persisted::{Persistable, Persisted},
    remote_sync::{RemoteSyncProvider, RemoteSyncWorkspace},
    settings::Settings,
    state::AppState,
    timestamp,
};

/// a backup manager for a database
pub struct Backup {
    db: Arc<RwLock<Database>>,
    settings: Arc<RwLock<Persisted<Settings>>>,
    index: Persisted<BackupManifest>,
}

const MANUAL_RETENTION_LIMIT: usize = 1;
const AUTOSAVE_RETENTION_LIMIT: usize = 1;
const SYNC_RECOVERY_RETENTION_LIMIT: usize = 1;
const UPDATE_RECOVERY_RETENTION_LIMIT: usize = 3;
const RECOVERED_SNAPSHOT_VERSION: &str = "unknown";

struct BackupManifestLoadOutcome {
    index: Persisted<BackupManifest>,
    skip_initial_cleanup: bool,
}

#[derive(Default)]
struct BackupManifestReconciliation {
    changed: bool,
    synthesized_entries: usize,
}

struct SnapshotFileInfo {
    filename: String,
    created_at: i64,
}

#[derive(Default, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupManifest {
    metadata: BackupManifestMetadata,
    pub entries: Vec<BackupEntry>,
    /// The latest non-recovery snapshot that represents the current workspace state.
    pub head: Option<BackupEntry>,
}

#[derive(Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct BackupManifestMetadata {
    version: u8,
    provider: String,
    updated_at: i64,
    workspace_id: Option<String>,
    workspace_name: Option<String>,
}

impl Persistable for BackupManifest {
    fn sanitize(&mut self) {
        for entry in self.entries.iter_mut() {
            if entry.created_at <= 0 {
                entry.created_at = timestamp::now();
            }

            entry.sanitize();
        }

        self.head = self
            .head
            .as_ref()
            .and_then(|head| {
                self.entries
                    .iter()
                    .find(|entry| entry.filename == head.filename)
                    .cloned()
            })
            .or_else(|| head_snapshot_entry(&self.entries));

        self.metadata.version = 1;
        self.metadata.provider = sanitize_manifest_provider(&self.metadata.provider);
        self.metadata.workspace_id = sanitize_optional_string(self.metadata.workspace_id.clone());
        self.metadata.workspace_name =
            sanitize_optional_string(self.metadata.workspace_name.clone());
        self.metadata.updated_at = self
            .head
            .as_ref()
            .map(|entry| entry.created_at)
            .or_else(|| self.entries.iter().map(|entry| entry.created_at).max())
            .unwrap_or_else(timestamp::now);
    }
}

/// a backup entry in the snapshot directory
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum BackupSource {
    #[default]
    Manual,
    Autosave,
    Recovery,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum BackupRecoveryKind {
    #[default]
    Sync,
    Update,
}

impl BackupSource {
    const fn is_managed(&self) -> bool {
        !matches!(self, Self::Manual)
    }

    const fn participates_in_head(&self) -> bool {
        !matches!(self, Self::Recovery)
    }
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BackupEntry {
    pub filename: String,
    pub is_protected: bool,
    pub created_at: i64,
    pub version: String,
    #[serde(default)]
    pub source: BackupSource,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub recovery_kind: Option<BackupRecoveryKind>,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
enum BackupSourceRepr {
    #[default]
    Manual,
    Autosave,
    Recovery,
    RemoteSync,
    SyncRecovery,
    UpdateRecovery,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackupEntryRepr {
    filename: String,
    #[serde(default)]
    is_protected: bool,
    created_at: i64,
    version: String,
    #[serde(default)]
    source: BackupSourceRepr,
    #[serde(default)]
    recovery_kind: Option<BackupRecoveryKind>,
}

impl<'de> Deserialize<'de> for BackupEntry {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let repr = BackupEntryRepr::deserialize(deserializer)?;
        let (source, recovery_kind) = match repr.source {
            BackupSourceRepr::Manual => (BackupSource::Manual, None),
            BackupSourceRepr::Autosave | BackupSourceRepr::RemoteSync => {
                (BackupSource::Autosave, None)
            }
            BackupSourceRepr::Recovery => (
                BackupSource::Recovery,
                Some(repr.recovery_kind.unwrap_or(if repr.is_protected {
                    BackupRecoveryKind::Update
                } else {
                    BackupRecoveryKind::Sync
                })),
            ),
            BackupSourceRepr::SyncRecovery => {
                (BackupSource::Recovery, Some(BackupRecoveryKind::Sync))
            }
            BackupSourceRepr::UpdateRecovery => {
                (BackupSource::Recovery, Some(BackupRecoveryKind::Update))
            }
        };

        Ok(Self {
            filename: repr.filename,
            is_protected: repr.is_protected,
            created_at: repr.created_at,
            version: repr.version,
            source,
            recovery_kind,
        })
    }
}

impl BackupEntry {
    fn sanitize(&mut self) {
        self.recovery_kind = match self.source {
            BackupSource::Recovery => {
                Some(self.recovery_kind.clone().unwrap_or(if self.is_protected {
                    BackupRecoveryKind::Update
                } else {
                    BackupRecoveryKind::Sync
                }))
            }
            _ => None,
        };
    }
}

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

fn head_snapshot_entry(entries: &[BackupEntry]) -> Option<BackupEntry> {
    entries
        .iter()
        .filter(|entry| entry.source.participates_in_head())
        .max_by(|left, right| left.created_at.cmp(&right.created_at))
        .cloned()
}

fn load_backup_manifest(
    backup_dir: &Path,
    manifest_path: PathBuf,
) -> Result<BackupManifestLoadOutcome, String> {
    match Persisted::<BackupManifest>::load(manifest_path.clone()) {
        Ok(mut index) => {
            let reconciliation = reconcile_backup_manifest(&mut index, backup_dir)?;
            if reconciliation.changed {
                index.commit()?;
            }

            Ok(BackupManifestLoadOutcome {
                index,
                skip_initial_cleanup: reconciliation.synthesized_entries > 0,
            })
        }
        Err(load_error) => {
            let contents = match fs::read_to_string(&manifest_path) {
                Ok(contents) => contents,
                Err(_) => return Err(load_error),
            };

            let parsed_value = serde_json::from_str::<serde_json::Value>(&contents).ok();
            let mut manifest = parsed_value
                .as_ref()
                .map(best_effort_manifest_from_value)
                .unwrap_or_default();
            reconcile_backup_manifest_entries(&mut manifest, backup_dir)?;
            manifest.sanitize();

            preserve_invalid_backup_manifest(&manifest_path, &contents);

            let serialized =
                serde_json::to_string_pretty(&manifest).map_err(|error| error.to_string())?;
            fs::write(&manifest_path, serialized).map_err(|error| error.to_string())?;

            Ok(BackupManifestLoadOutcome {
                index: Persisted::<BackupManifest>::load(manifest_path)?,
                skip_initial_cleanup: true,
            })
        }
    }
}

fn reconcile_backup_manifest(
    manifest: &mut BackupManifest,
    backup_dir: &Path,
) -> Result<BackupManifestReconciliation, String> {
    let before = serde_json::to_string(manifest).map_err(|error| error.to_string())?;
    manifest.sanitize();

    let mut reconciliation = reconcile_backup_manifest_entries(manifest, backup_dir)?;
    let after = serde_json::to_string(manifest).map_err(|error| error.to_string())?;
    reconciliation.changed |= before != after;

    Ok(reconciliation)
}

fn reconcile_backup_manifest_entries(
    manifest: &mut BackupManifest,
    backup_dir: &Path,
) -> Result<BackupManifestReconciliation, String> {
    let snapshot_files = list_snapshot_files(backup_dir)?;
    let snapshot_filenames = snapshot_files
        .iter()
        .map(|snapshot| snapshot.filename.as_str())
        .collect::<HashSet<_>>();

    let original_len = manifest.entries.len();
    let mut seen_filenames = HashSet::new();
    manifest.entries.retain(|entry| {
        snapshot_filenames.contains(entry.filename.as_str())
            && seen_filenames.insert(entry.filename.clone())
    });

    let mut synthesized_entries = 0;
    for snapshot in snapshot_files {
        if manifest
            .entries
            .iter()
            .any(|entry| entry.filename == snapshot.filename)
        {
            continue;
        }

        manifest.entries.push(BackupEntry {
            filename: snapshot.filename,
            is_protected: false,
            created_at: snapshot.created_at,
            version: RECOVERED_SNAPSHOT_VERSION.to_string(),
            source: BackupSource::Manual,
            recovery_kind: None,
        });
        synthesized_entries += 1;
    }

    let next_head = head_snapshot_entry(&manifest.entries);
    let head_changed = manifest.head != next_head;
    manifest.head = next_head;
    manifest.sanitize();

    Ok(BackupManifestReconciliation {
        changed: manifest.entries.len() != original_len || synthesized_entries > 0 || head_changed,
        synthesized_entries,
    })
}

fn best_effort_manifest_from_value(value: &serde_json::Value) -> BackupManifest {
    let metadata = value
        .get("metadata")
        .and_then(|metadata| metadata.as_object());
    let entries = value
        .get("entries")
        .and_then(|entries| entries.as_array())
        .map(|entries| {
            entries
                .iter()
                .filter_map(|entry| serde_json::from_value::<BackupEntry>(entry.clone()).ok())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let head = value
        .get("head")
        .and_then(|head| serde_json::from_value::<BackupEntry>(head.clone()).ok());

    BackupManifest {
        metadata: BackupManifestMetadata {
            version: 1,
            provider: metadata
                .and_then(|metadata| metadata.get("provider"))
                .and_then(|provider| provider.as_str())
                .unwrap_or("local")
                .to_string(),
            updated_at: metadata
                .and_then(|metadata| metadata.get("updatedAt"))
                .and_then(|updated_at| updated_at.as_i64())
                .unwrap_or_default(),
            workspace_id: metadata
                .and_then(|metadata| metadata.get("workspaceId"))
                .and_then(|workspace_id| workspace_id.as_str())
                .map(|workspace_id| workspace_id.to_string()),
            workspace_name: metadata
                .and_then(|metadata| metadata.get("workspaceName"))
                .and_then(|workspace_name| workspace_name.as_str())
                .map(|workspace_name| workspace_name.to_string()),
        },
        entries,
        head,
    }
}

fn preserve_invalid_backup_manifest(manifest_path: &Path, contents: &str) {
    let Some(parent) = manifest_path.parent() else {
        return;
    };

    let preserved_path = parent.join(format!("manifest.invalid-{}.json", timestamp::now()));
    let _ = fs::write(preserved_path, contents);
}

fn list_snapshot_files(backup_dir: &Path) -> Result<Vec<SnapshotFileInfo>, String> {
    let mut snapshots = fs::read_dir(backup_dir)
        .map_err(|error| error.to_string())?
        .filter_map(|entry| entry.ok())
        .filter_map(|entry| {
            let path = entry.path();
            let file_type = entry.file_type().ok()?;
            if !file_type.is_file() {
                return None;
            }

            let filename = path.file_name()?.to_str()?.to_string();
            if !is_snapshot_filename(&filename) {
                return None;
            }

            Some(SnapshotFileInfo {
                created_at: snapshot_timestamp_from_path(&path),
                filename,
            })
        })
        .collect::<Vec<_>>();

    snapshots.sort_by(|left, right| {
        right
            .created_at
            .cmp(&left.created_at)
            .then_with(|| right.filename.cmp(&left.filename))
    });

    Ok(snapshots)
}

fn is_snapshot_filename(filename: &str) -> bool {
    filename.starts_with("snapshot-") && filename.ends_with(".db")
}

fn snapshot_timestamp_from_path(path: &Path) -> i64 {
    path.file_name()
        .and_then(|filename| filename.to_str())
        .and_then(snapshot_timestamp_from_filename)
        .or_else(|| {
            fs::metadata(path)
                .ok()
                .and_then(|metadata| metadata.modified().ok())
                .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
                .and_then(|duration| i64::try_from(duration.as_secs()).ok())
        })
        .unwrap_or_else(timestamp::now)
}

fn snapshot_timestamp_from_filename(filename: &str) -> Option<i64> {
    filename
        .strip_prefix("snapshot-")
        .and_then(|filename| filename.strip_suffix(".db"))
        .and_then(|timestamp| timestamp.parse::<i64>().ok())
        .filter(|timestamp| *timestamp > 0)
}

fn sanitize_optional_string(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn sanitize_manifest_provider(value: &str) -> String {
    match value.trim() {
        "googleDrive" => "googleDrive".to_string(),
        _ => "local".to_string(),
    }
}

fn remote_sync_provider_name(provider: &RemoteSyncProvider) -> &str {
    match provider {
        RemoteSyncProvider::Local => "local",
        RemoteSyncProvider::GoogleDrive => "googleDrive",
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

#[cfg(test)]
mod tests {
    use super::{
        AUTOSAVE_RETENTION_LIMIT, Backup, BackupEntry, BackupRecoveryKind, BackupSource,
        MANUAL_RETENTION_LIMIT, RECOVERED_SNAPSHOT_VERSION, SYNC_RECOVERY_RETENTION_LIMIT,
        UPDATE_RECOVERY_RETENTION_LIMIT, head_snapshot_entry,
    };
    use crate::{database::Database, persisted::Persisted, settings::Settings};
    use std::{sync::Arc, time::Duration};

    use tokio::{runtime::Runtime, sync::RwLock};

    fn set_protected(entries: &mut [BackupEntry], filename: &str, is_protected: bool) -> bool {
        let Some(entry) = entries.iter_mut().find(|entry| entry.filename == filename) else {
            return false;
        };

        if entry.is_protected == is_protected {
            return false;
        }

        entry.is_protected = is_protected;
        true
    }

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
        settings.migration_dir =
            std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("migrations");
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

        let backup = Backup::new(db.clone(), settings.clone())
            .await
            .expect("failed to create backup manager");

        (backup, db, settings)
    }

    #[test]
    fn finds_latest_protected_backup_by_version() {
        let backups = [
            BackupEntry {
                filename: "snapshot-1.db".to_string(),
                is_protected: true,
                created_at: 1,
                version: "0.5.1".to_string(),
                source: BackupSource::Recovery,
                recovery_kind: Some(BackupRecoveryKind::Update),
            },
            BackupEntry {
                filename: "snapshot-2.db".to_string(),
                is_protected: false,
                created_at: 3,
                version: "0.5.1".to_string(),
                source: BackupSource::Manual,
                recovery_kind: None,
            },
            BackupEntry {
                filename: "snapshot-3.db".to_string(),
                is_protected: true,
                created_at: 2,
                version: "0.5.1".to_string(),
                source: BackupSource::Recovery,
                recovery_kind: Some(BackupRecoveryKind::Update),
            },
        ];

        let latest = backups
            .iter()
            .filter(|entry| entry.is_protected && entry.version == "0.5.1")
            .max_by_key(|entry| entry.created_at)
            .cloned();

        assert_eq!(latest.expect("missing backup").filename, "snapshot-3.db");
    }

    #[test]
    fn can_unprotect_specific_backup_entry() {
        let mut backups = vec![
            BackupEntry {
                filename: "snapshot-1.db".to_string(),
                is_protected: true,
                created_at: 1,
                version: "0.5.1".to_string(),
                source: BackupSource::Recovery,
                recovery_kind: Some(BackupRecoveryKind::Update),
            },
            BackupEntry {
                filename: "snapshot-2.db".to_string(),
                is_protected: true,
                created_at: 2,
                version: "0.5.1".to_string(),
                source: BackupSource::Recovery,
                recovery_kind: Some(BackupRecoveryKind::Update),
            },
        ];

        let changed = set_protected(&mut backups, "snapshot-1.db", false);

        assert!(changed);
        assert!(!backups[0].is_protected);
        assert!(backups[1].is_protected);
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

                assert!(
                    error.contains("failed")
                        || error.contains("denied")
                        || error.contains("directory")
                );
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

                assert!(
                    error.contains("failed")
                        || error.contains("denied")
                        || error.contains("directory")
                );
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

    #[test]
    fn invalid_manifest_is_rebuilt_from_snapshot_files() {
        Runtime::new()
            .expect("failed to create tokio runtime")
            .block_on(async {
                let root = unique_dir("backup-invalid-manifest-rebuild");
                let (mut backup, db, settings) = setup_backup(&root).await;

                let first = backup
                    .create(false)
                    .await
                    .expect("failed to create first snapshot");
                std::thread::sleep(Duration::from_millis(2));
                let second = backup
                    .create_managed(BackupSource::Autosave, None, false)
                    .await
                    .expect("failed to create second snapshot");

                let manifest_path = root
                    .join(Backup::BACKUP_DIRECTORY)
                    .join(Backup::MANIFEST_FILENAME);
                std::fs::write(&manifest_path, "{invalid json")
                    .expect("failed to corrupt backup manifest");

                drop(backup);

                let mut recovered = Backup::new(db.clone(), settings.clone())
                    .await
                    .expect("failed to recover backup manifest");
                let entries = recovered
                    .list()
                    .await
                    .expect("failed to list recovered snapshots");

                assert_eq!(entries.len(), 2);
                assert!(entries.iter().any(|entry| entry.filename == first.filename));
                assert!(
                    entries
                        .iter()
                        .any(|entry| entry.filename == second.filename)
                );
                assert!(
                    entries
                        .iter()
                        .all(|entry| entry.version == RECOVERED_SNAPSHOT_VERSION)
                );

                let preserved_invalid_manifests =
                    std::fs::read_dir(root.join(Backup::BACKUP_DIRECTORY))
                        .expect("failed to read backup dir")
                        .filter_map(|entry| entry.ok())
                        .filter(|entry| {
                            entry
                                .file_name()
                                .to_str()
                                .is_some_and(|name| name.starts_with("manifest.invalid-"))
                        })
                        .count();
                assert_eq!(preserved_invalid_manifests, 1);

                db.write().await.disconnect().await;
                let _ = std::fs::remove_dir_all(root);
            });
    }

    #[test]
    fn stale_manifest_adds_missing_snapshot_files_without_pruning_them() {
        Runtime::new()
            .expect("failed to create tokio runtime")
            .block_on(async {
                let root = unique_dir("backup-stale-manifest-reconcile");
                let (mut backup, db, settings) = setup_backup(&root).await;

                let first = backup
                    .create(false)
                    .await
                    .expect("failed to create first snapshot");
                std::thread::sleep(Duration::from_millis(2));
                let second = backup
                    .create_managed(BackupSource::Autosave, None, false)
                    .await
                    .expect("failed to create second snapshot");

                let manifest_path = root
                    .join(Backup::BACKUP_DIRECTORY)
                    .join(Backup::MANIFEST_FILENAME);
                let stale_manifest = serde_json::json!({
                    "metadata": {
                        "version": 1,
                        "provider": "googleDrive",
                        "updatedAt": first.created_at,
                        "workspaceId": "workspace-123",
                        "workspaceName": "Primary workspace"
                    },
                    "entries": [
                        {
                            "filename": first.filename,
                            "isProtected": first.is_protected,
                            "createdAt": first.created_at,
                            "version": first.version,
                            "source": "manual"
                        }
                    ],
                    "head": {
                        "filename": first.filename,
                        "isProtected": first.is_protected,
                        "createdAt": first.created_at,
                        "version": first.version,
                        "source": "manual"
                    }
                });
                std::fs::write(
                    &manifest_path,
                    serde_json::to_string_pretty(&stale_manifest)
                        .expect("failed to serialize stale manifest"),
                )
                .expect("failed to write stale manifest");

                drop(backup);

                let mut reconciled = Backup::new(db.clone(), settings.clone())
                    .await
                    .expect("failed to reconcile stale manifest");
                let entries = reconciled
                    .list()
                    .await
                    .expect("failed to list reconciled snapshots");

                assert_eq!(entries.len(), 2);
                assert!(entries.iter().any(|entry| entry.filename == first.filename));
                let recovered_entry = entries
                    .iter()
                    .find(|entry| entry.filename == second.filename)
                    .expect("missing recovered snapshot entry");
                assert_eq!(recovered_entry.version, RECOVERED_SNAPSHOT_VERSION);
                assert_eq!(recovered_entry.source, BackupSource::Manual);

                db.write().await.disconnect().await;
                let _ = std::fs::remove_dir_all(root);
            });
    }

    #[test]
    fn head_prefers_latest_non_recovery_snapshot() {
        let entries = vec![
            BackupEntry {
                filename: "snapshot-manual.db".to_string(),
                is_protected: false,
                created_at: 10,
                version: "0.5.1".to_string(),
                source: BackupSource::Manual,
                recovery_kind: None,
            },
            BackupEntry {
                filename: "snapshot-autosave.db".to_string(),
                is_protected: false,
                created_at: 20,
                version: "0.5.1".to_string(),
                source: BackupSource::Autosave,
                recovery_kind: None,
            },
            BackupEntry {
                filename: "snapshot-update-recovery.db".to_string(),
                is_protected: true,
                created_at: 30,
                version: "0.5.1".to_string(),
                source: BackupSource::Recovery,
                recovery_kind: Some(BackupRecoveryKind::Update),
            },
        ];

        let head = head_snapshot_entry(&entries).expect("missing head entry");
        assert_eq!(head.filename, "snapshot-autosave.db");
        assert_eq!(head.source, BackupSource::Autosave);
    }

    #[test]
    fn head_is_none_when_only_recovery_snapshots_exist() {
        let entries = vec![
            BackupEntry {
                filename: "snapshot-sync-recovery.db".to_string(),
                is_protected: false,
                created_at: 10,
                version: "0.5.1".to_string(),
                source: BackupSource::Recovery,
                recovery_kind: Some(BackupRecoveryKind::Sync),
            },
            BackupEntry {
                filename: "snapshot-update-recovery.db".to_string(),
                is_protected: true,
                created_at: 20,
                version: "0.5.1".to_string(),
                source: BackupSource::Recovery,
                recovery_kind: Some(BackupRecoveryKind::Update),
            },
        ];

        assert!(head_snapshot_entry(&entries).is_none());
    }
}

#[tauri::command]
pub async fn backup_list(
    app_state: tauri::State<'_, AppState>,
) -> Result<Vec<BackupEntry>, String> {
    sync_backup_manifest_workspace(app_state.inner()).await?;

    let mut backup = app_state.backup.write().await;
    let entries = backup.list().await?;

    Ok(entries)
}

#[tauri::command]
pub async fn backup_create(app_state: tauri::State<'_, AppState>) -> Result<BackupEntry, String> {
    sync_backup_manifest_workspace(app_state.inner()).await?;

    let mut backup = app_state.backup.write().await;
    let entry = backup.create(false).await?;

    Ok(entry)
}

#[tauri::command]
pub async fn backup_restore(
    app_state: tauri::State<'_, AppState>,
    filename: String,
) -> Result<(), String> {
    let backup = app_state.backup.read().await;
    backup.restore(&filename).await?;

    Ok(())
}

#[tauri::command]
pub async fn backup_delete(
    app_state: tauri::State<'_, AppState>,
    filename: String,
) -> Result<(), String> {
    sync_backup_manifest_workspace(app_state.inner()).await?;

    let mut backup = app_state.backup.write().await;
    backup.delete(&filename).await?;

    Ok(())
}
