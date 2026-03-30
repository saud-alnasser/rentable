use serde::{Deserialize, Serialize};
use std::{fs, sync::Arc};
use tokio::sync::RwLock;

use crate::{
    database::Database,
    persisted::{Persistable, Persisted},
    settings::Settings,
    state::AppState,
    timestamp,
};

/// a backup manager for a database
pub struct Backup {
    db: Arc<RwLock<Database>>,
    settings: Arc<RwLock<Persisted<Settings>>>,
    index: Persisted<BackupIndex>,
}

#[derive(Serialize, Deserialize, Default, Clone)]
pub struct BackupIndex {
    pub entries: Vec<BackupEntry>,
}

impl Persistable for BackupIndex {
    fn sanitize(&mut self) {
        for entry in self.entries.iter_mut() {
            if entry.created_at <= 0 {
                entry.created_at = timestamp::now();
            }
        }
    }
}

/// a backup entry in the backup directory
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupEntry {
    pub filename: String,
    pub is_protected: bool,
    pub created_at: i64,
    pub version: String,
}

impl Backup {
    pub const BACKUP_DIRECTORY: &'static str = "backups";
    pub const INDEX_FILENAME: &'static str = "index.json";

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
        self.index.commit()?;

        Ok(true)
    }

    /// create a new backup manager; loads or initializes the backup index.
    pub async fn new(
        db: Arc<RwLock<Database>>,
        settings: Arc<RwLock<Persisted<Settings>>>,
    ) -> Result<Self, String> {
        let settings_arc = settings.clone();
        let backup_dir = { &settings_arc.read().await.backup_dir };
        fs::create_dir_all(&backup_dir).map_err(|e| e.to_string())?;

        let index_path = &backup_dir.join(Self::INDEX_FILENAME);
        let index = Persisted::<BackupIndex>::load(index_path.clone())?;

        Ok(Self {
            db,
            settings,
            index,
        })
    }

    /// lists all backups sorted by creation time (newest first)
    pub async fn list(&mut self) -> Result<Vec<BackupEntry>, String> {
        let mut entries = self.index.entries.clone();
        entries.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        Ok(entries)
    }

    /// creates a backup with a canonical filename `backup-{timestamp}.db`
    pub async fn create(&mut self, protected: bool) -> Result<BackupEntry, String> {
        let settings = self.settings.read().await;
        let db = self.db.read().await;

        if !db.is_ready().await {
            return Err("database not ready to create backup".to_string());
        }

        let timestamp = timestamp::now();
        let filename = format!("backup-{}.db", timestamp);
        let path = settings.backup_dir.join(&filename);

        db.create_backup(&path).await?;

        let entry = BackupEntry {
            filename: filename.clone(),
            created_at: timestamp,
            is_protected: protected,
            version: settings.version.clone(),
        };

        self.index.entries.push(entry.clone());

        if let Err(error) = self.index.commit() {
            self.index
                .entries
                .retain(|existing| existing.filename != entry.filename);

            let cleanup_error = fs::remove_file(&path).err().map(|err| err.to_string());

            return Err(match cleanup_error {
                Some(cleanup_error) => format!(
                    "{}; additionally failed to remove untracked backup file: {}",
                    error, cleanup_error
                ),
                None => error,
            });
        }

        Ok(entry)
    }

    /// restores a backup by filename
    pub async fn restore(&self, filename: &str) -> Result<(), String> {
        let current_version = { self.settings.read().await.version.clone() };
        let entry = self
            .index
            .entries
            .iter()
            .find(|entry| entry.filename == filename)
            .cloned()
            .ok_or("backup not found")?;

        if entry.version != current_version {
            return Err("backup app version does not match current app version".to_string());
        }

        let backup_dir = { self.settings.read().await.backup_dir.clone() };
        let path = backup_dir.join(&entry.filename);

        let mut db = self.db.write().await;
        db.restore_backup(&path).await
    }

    /// deletes a backup by filename
    pub async fn delete(&mut self, filename: &str) -> Result<(), String> {
        let backup_dir = { self.settings.read().await.backup_dir.clone() };

        let pos = self
            .index
            .entries
            .iter()
            .position(|e| e.filename == filename)
            .ok_or("backup not found")?;

        if self.index.entries[pos].is_protected {
            return Err("protected backups cannot be deleted".to_string());
        }

        let entry = self.index.entries[pos].clone();
        let path = backup_dir.join(&entry.filename);
        self.index.entries.remove(pos);

        if let Err(error) = self.index.commit() {
            self.index.entries.insert(pos, entry);
            return Err(error);
        }

        if let Err(error) = fs::remove_file(&path) {
            self.index.entries.insert(pos, entry);

            return Err(match self.index.commit() {
                Ok(()) => error.to_string(),
                Err(revert_error) => format!(
                    "failed to delete backup file: {}; additionally failed to restore backup index: {}",
                    error, revert_error
                ),
            });
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::{Backup, BackupEntry};
    use crate::{database::Database, persisted::Persisted, settings::Settings};
    use std::sync::Arc;

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
        settings.default_database_path = root.join(Database::FILENAME);
        settings.active_database_path = None;
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
                filename: "backup-1.db".to_string(),
                is_protected: true,
                created_at: 1,
                version: "0.5.1".to_string(),
            },
            BackupEntry {
                filename: "backup-2.db".to_string(),
                is_protected: false,
                created_at: 3,
                version: "0.5.1".to_string(),
            },
            BackupEntry {
                filename: "backup-3.db".to_string(),
                is_protected: true,
                created_at: 2,
                version: "0.5.1".to_string(),
            },
        ];

        let latest = backups
            .iter()
            .filter(|entry| entry.is_protected && entry.version == "0.5.1")
            .max_by_key(|entry| entry.created_at)
            .cloned();

        assert_eq!(latest.expect("missing backup").filename, "backup-3.db");
    }

    #[test]
    fn can_unprotect_specific_backup_entry() {
        let mut backups = vec![
            BackupEntry {
                filename: "backup-1.db".to_string(),
                is_protected: true,
                created_at: 1,
                version: "0.5.1".to_string(),
            },
            BackupEntry {
                filename: "backup-2.db".to_string(),
                is_protected: true,
                created_at: 2,
                version: "0.5.1".to_string(),
            },
        ];

        let changed = set_protected(&mut backups, "backup-1.db", false);

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
                    .join(Backup::INDEX_FILENAME);

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
                    .join(Backup::INDEX_FILENAME);

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
}

#[tauri::command]
pub async fn backup_list(
    app_state: tauri::State<'_, AppState>,
) -> Result<Vec<BackupEntry>, String> {
    let mut backup = app_state.backup.write().await;
    let entries = backup.list().await?;

    Ok(entries)
}

#[tauri::command]
pub async fn backup_create(app_state: tauri::State<'_, AppState>) -> Result<BackupEntry, String> {
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
    let mut backup = app_state.backup.write().await;
    backup.delete(&filename).await?;

    Ok(())
}
