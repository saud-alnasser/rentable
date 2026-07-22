use serde::{Deserialize, Deserializer, Serialize};
use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
};

use crate::{
    persisted::{Persistable, Persisted},
    remote_sync::RemoteSyncProvider,
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

pub(super) fn sanitize_optional_string(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

pub(super) fn sanitize_manifest_provider(value: &str) -> String {
    match value.trim() {
        "googleDrive" => "googleDrive".to_string(),
        _ => "local".to_string(),
    }
}

pub(super) fn remote_sync_provider_name(provider: &RemoteSyncProvider) -> &str {
    match provider {
        RemoteSyncProvider::Local => "local",
        RemoteSyncProvider::GoogleDrive => "googleDrive",
    }
}
