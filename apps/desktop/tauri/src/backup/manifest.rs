use serde::{Deserialize, Deserializer, Serialize};
use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
};

use crate::{
    error::Error,
    persisted::{Persistable, Persisted},
    sync::RemoteSyncProvider,
    timestamp,
};

use super::snapshot::list_snapshot_files;

pub(super) const RECOVERED_SNAPSHOT_VERSION: &str = "unknown";

pub(super) struct BackupManifestLoadOutcome {
    pub(super) index: Persisted<BackupManifest>,
    pub(super) skip_initial_cleanup: bool,
}

#[derive(Default)]
struct BackupManifestReconciliation {
    changed: bool,
    synthesized_entries: usize,
}

#[derive(Default, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupManifest {
    pub(super) metadata: BackupManifestMetadata,
    pub entries: Vec<BackupEntry>,
    /// The latest non-recovery snapshot that represents the current workspace state.
    pub head: Option<BackupEntry>,
}

#[derive(Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(super) struct BackupManifestMetadata {
    pub(super) version: u8,
    pub(super) provider: String,
    pub(super) updated_at: i64,
    pub(super) workspace_id: Option<String>,
    pub(super) workspace_name: Option<String>,
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
    pub(super) const fn is_managed(&self) -> bool {
        !matches!(self, Self::Manual)
    }

    pub(super) const fn participates_in_head(&self) -> bool {
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

pub(super) fn head_snapshot_entry(entries: &[BackupEntry]) -> Option<BackupEntry> {
    entries
        .iter()
        .filter(|entry| entry.source.participates_in_head())
        .max_by(|left, right| left.created_at.cmp(&right.created_at))
        .cloned()
}

pub(super) fn load_backup_manifest(
    backup_dir: &Path,
    manifest_path: PathBuf,
) -> Result<BackupManifestLoadOutcome, Error> {
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
                serde_json::to_string_pretty(&manifest).map_err(|error| Error::Internal {
                    message: error.to_string(),
                })?;
            fs::write(&manifest_path, serialized)?;

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
) -> Result<BackupManifestReconciliation, Error> {
    let before = serde_json::to_string(manifest).map_err(|error| Error::Internal {
        message: error.to_string(),
    })?;
    manifest.sanitize();

    let mut reconciliation = reconcile_backup_manifest_entries(manifest, backup_dir)?;
    let after = serde_json::to_string(manifest).map_err(|error| Error::Internal {
        message: error.to_string(),
    })?;
    reconciliation.changed |= before != after;

    Ok(reconciliation)
}

fn reconcile_backup_manifest_entries(
    manifest: &mut BackupManifest,
    backup_dir: &Path,
) -> Result<BackupManifestReconciliation, Error> {
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

pub(super) fn sanitize_optional_string(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

pub(super) fn sanitize_manifest_provider(value: &str) -> String {
    match value.trim() {
        "googleDrive" => "googleDrive".to_string(),
        "hosted" => "hosted".to_string(),
        _ => "local".to_string(),
    }
}

pub(super) fn remote_sync_provider_name(provider: &RemoteSyncProvider) -> &str {
    match provider {
        RemoteSyncProvider::Local => "local",
        RemoteSyncProvider::GoogleDrive => "googleDrive",
        RemoteSyncProvider::Hosted => "hosted",
    }
}

#[cfg(test)]
mod tests {
    use std::{sync::Arc, time::Duration};

    use tokio::{runtime::Runtime, sync::RwLock};

    use super::{
        BackupEntry, BackupRecoveryKind, BackupSource, RECOVERED_SNAPSHOT_VERSION,
        head_snapshot_entry,
    };
    use crate::{backup::Backup, database::Database, persisted::Persisted, settings::Settings};

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
    fn manifest_entries_for_deleted_snapshot_files_are_pruned() {
        Runtime::new()
            .expect("failed to create tokio runtime")
            .block_on(async {
                let root = unique_dir("backup-manifest-prunes-deleted-files");
                let (mut backup, db, settings) = setup_backup(&root).await;

                let kept = backup
                    .create(false)
                    .await
                    .expect("failed to create first snapshot");
                std::thread::sleep(Duration::from_millis(2));
                let deleted = backup
                    .create_managed(BackupSource::Autosave, None, false)
                    .await
                    .expect("failed to create second snapshot");

                std::fs::remove_file(root.join(Backup::BACKUP_DIRECTORY).join(&deleted.filename))
                    .expect("failed to delete snapshot file");

                drop(backup);

                let mut reconciled = Backup::new(db.clone(), settings.clone())
                    .await
                    .expect("failed to reconcile manifest");
                let entries = reconciled
                    .list()
                    .await
                    .expect("failed to list reconciled snapshots");

                assert_eq!(entries.len(), 1);
                assert_eq!(entries[0].filename, kept.filename);
                assert_eq!(entries[0].version, kept.version);

                db.write().await.disconnect().await;
                let _ = std::fs::remove_dir_all(root);
            });
    }

    #[test]
    fn partially_valid_manifest_keeps_salvageable_entries() {
        Runtime::new()
            .expect("failed to create tokio runtime")
            .block_on(async {
                let root = unique_dir("backup-manifest-partial-salvage");
                let (mut backup, db, settings) = setup_backup(&root).await;

                let salvaged = backup
                    .create(false)
                    .await
                    .expect("failed to create first snapshot");
                std::thread::sleep(Duration::from_millis(2));
                let recovered = backup
                    .create_managed(BackupSource::Autosave, None, false)
                    .await
                    .expect("failed to create second snapshot");

                // valid JSON that fails typed deserialization (one well-formed entry with a
                // marker version, one garbage entry), forcing the best-effort salvage path.
                let manifest_path = root
                    .join(Backup::BACKUP_DIRECTORY)
                    .join(Backup::MANIFEST_FILENAME);
                let partially_valid = serde_json::json!({
                    "metadata": {
                        "version": 1,
                        "provider": "local",
                        "updatedAt": salvaged.created_at
                    },
                    "entries": [
                        {
                            "filename": salvaged.filename,
                            "isProtected": true,
                            "createdAt": salvaged.created_at,
                            "version": "9.9.9",
                            "source": "manual"
                        },
                        { "bogus": true }
                    ]
                });
                std::fs::write(
                    &manifest_path,
                    serde_json::to_string_pretty(&partially_valid)
                        .expect("failed to serialize partially valid manifest"),
                )
                .expect("failed to write partially valid manifest");

                drop(backup);

                let mut reopened = Backup::new(db.clone(), settings.clone())
                    .await
                    .expect("failed to recover partially valid manifest");
                let entries = reopened
                    .list()
                    .await
                    .expect("failed to list recovered snapshots");

                assert_eq!(entries.len(), 2);

                // the well-formed entry survives with its own metadata, not a recovered stub.
                let salvaged_entry = entries
                    .iter()
                    .find(|entry| entry.filename == salvaged.filename)
                    .expect("missing salvaged snapshot entry");
                assert_eq!(salvaged_entry.version, "9.9.9");
                assert!(salvaged_entry.is_protected);

                // the file whose entry was garbage comes back as a recovered stub.
                let recovered_entry = entries
                    .iter()
                    .find(|entry| entry.filename == recovered.filename)
                    .expect("missing recovered snapshot entry");
                assert_eq!(recovered_entry.version, RECOVERED_SNAPSHOT_VERSION);

                // the unreadable manifest is preserved on disk rather than lost.
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
}
