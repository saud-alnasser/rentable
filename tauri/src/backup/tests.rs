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
    let mut settings = Persisted::<Settings>::load(settings_path).expect("failed to load settings");
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
                error.contains("failed") || error.contains("denied") || error.contains("directory")
            );
            assert!(backup.index.entries.is_empty());
            assert!(
                std::fs::read_dir(root.join(Backup::BACKUP_DIRECTORY))
                    .expect("failed to read backup dir")
                    .filter_map(|entry| entry.ok())
                    .all(
                        |entry| entry.path().extension().and_then(|ext| ext.to_str()) != Some("db")
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
                error.contains("failed") || error.contains("denied") || error.contains("directory")
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
            let manifest =
                std::fs::read_to_string(&manifest_path).expect("failed to read backup manifest");
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
