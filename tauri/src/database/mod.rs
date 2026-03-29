pub mod commands;
pub mod migrations;
pub mod proxy;

use sqlx::{
    Pool, Sqlite,
    sqlite::{SqliteConnectOptions, SqlitePoolOptions},
};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::Arc,
};
use tokio::sync::RwLock;

use crate::{
    database::proxy::{SQLQuery, SQLRow},
    persisted::Persisted,
    settings::Settings,
};

pub struct Database {
    pool: Option<Pool<Sqlite>>,
    settings: Arc<RwLock<Persisted<Settings>>>,
}

impl Database {
    pub const FILENAME: &'static str = "app.db";

    pub fn new(settings: Arc<RwLock<Persisted<Settings>>>) -> Self {
        Database {
            pool: None,
            settings,
        }
    }

    pub async fn connect(&mut self) -> Result<(), String> {
        let settings = self.settings.read().await;
        let db_path = settings
            .active_database_path
            .clone()
            .unwrap_or(settings.default_database_path.clone());
        let migration_dir = settings.migration_dir.clone();

        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }

        let connect_options = SqliteConnectOptions::new()
            .filename(&db_path)
            .pragma("journal_mode", "WAL")
            .pragma("synchronous", "NORMAL")
            .pragma("busy_timeout", "5000")
            .create_if_missing(true);

        let pool = SqlitePoolOptions::new()
            .connect_with(connect_options)
            .await
            .map_err(|e| e.to_string())?;

        migrations::run(&pool, &migration_dir)
            .await
            .map_err(|e| e.to_string())?;

        self.pool = Some(pool);

        Ok(())
    }

    pub async fn disconnect(&self) {
        if let Some(pool) = &self.pool {
            pool.close().await;
        }
    }

    pub async fn reconnect(&mut self) -> Result<(), String> {
        self.disconnect().await;
        self.connect().await
    }

    pub async fn create_backup(&self, backup_path: &Path) -> Result<(), String> {
        let pool = self
            .pool
            .clone()
            .ok_or("database not connected".to_string())?;

        Self::create_backup_from_pool(&pool, backup_path).await
    }

    async fn create_backup_from_pool(
        pool: &Pool<Sqlite>,
        backup_path: &Path,
    ) -> Result<(), String> {
        if let Some(parent) = backup_path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }

        if backup_path.exists() {
            fs::remove_file(backup_path).map_err(|e| e.to_string())?;
        }

        let escaped_path = backup_path.to_string_lossy().replace('\'', "''");
        sqlx::query(format!("VACUUM INTO '{}'", escaped_path).as_str())
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;

        Ok(())
    }

    pub async fn restore_backup(&mut self, backup_path: &Path) -> Result<(), String> {
        let settings = self.settings.read().await;

        let db_path = settings
            .active_database_path
            .clone()
            .unwrap_or(settings.default_database_path.clone());

        drop(settings);

        self.disconnect().await;
        self.pool = None;

        Self::purge_related_paths(&db_path).unwrap_or_else(|error| {
            Self::panic_restore_failure(
                "purging current database files",
                &db_path,
                backup_path,
                error,
            )
        });

        if let Some(parent) = db_path.parent() {
            fs::create_dir_all(parent).unwrap_or_else(|error| {
                Self::panic_restore_failure(
                    "creating restore destination directory",
                    &db_path,
                    backup_path,
                    error,
                )
            });
        }

        fs::copy(backup_path, &db_path).unwrap_or_else(|error| {
            Self::panic_restore_failure(
                "copying the selected backup into place",
                &db_path,
                backup_path,
                error,
            )
        });

        self.connect().await.unwrap_or_else(|error| {
            Self::panic_restore_failure(
                "reconnecting to the restored database",
                &db_path,
                backup_path,
                error,
            )
        });

        Ok(())
    }

    fn panic_restore_failure(
        phase: &str,
        db_path: &Path,
        backup_path: &Path,
        error: impl std::fmt::Display,
    ) -> ! {
        panic!(
            "fatal: backup restore entered an unrecoverable state during {} (active database: {}, backup: {}): {}",
            phase,
            db_path.display(),
            backup_path.display(),
            error,
        );
    }

    fn get_related_paths(db_path: &Path) -> Vec<PathBuf> {
        let db_path = db_path.to_path_buf();
        let suffixes = ["-wal", "-shm", "-journal"];

        let mut paths = vec![db_path.clone()];
        let base = db_path.to_string_lossy().into_owned();

        for suffix in suffixes {
            paths.push(PathBuf::from(format!("{}{}", base, suffix)));
        }

        paths
    }

    fn purge_related_paths(db_path: &Path) -> Result<(), String> {
        for path in Self::get_related_paths(db_path) {
            if path.exists() {
                std::fs::remove_file(&path)
                    .map_err(|e| format!("failed to delete {}: {}", path.to_string_lossy(), e))?;
            }
        }

        Ok(())
    }

    pub async fn is_ready(&self) -> bool {
        if let Some(pool) = self.pool.clone() {
            return Self::is_pool_ready(&pool).await;
        }

        false
    }

    async fn is_pool_ready(pool: &Pool<Sqlite>) -> bool {
        let row: Option<i32> = sqlx::query_scalar(
            format!(
                "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='{}';",
                migrations::TABLE_NAME
            )
            .as_str(),
        )
        .fetch_one(pool)
        .await
        .ok();

        matches!(row, Some(1))
    }

    pub async fn execute_single_sql(&self, query: SQLQuery) -> Result<Vec<SQLRow>, String> {
        let pool = self
            .pool
            .clone()
            .ok_or("database not connected".to_string())?;

        proxy::execute_single_sql(&pool, query).await
    }

    pub async fn execute_batch_sql(
        &self,
        queries: Vec<SQLQuery>,
    ) -> Result<Vec<Vec<SQLRow>>, String> {
        let pool = self
            .pool
            .clone()
            .ok_or("database not connected".to_string())?;

        proxy::execute_batch_sql(&pool, queries).await
    }

    pub fn normalize_path(path: Option<String>) -> Result<Option<PathBuf>, String> {
        let Some(raw_path) = path else {
            return Ok(None);
        };

        let trimmed_path = raw_path.trim();

        if trimmed_path.is_empty() {
            return Ok(None);
        }

        let mut normalized_path = PathBuf::from(trimmed_path);

        if !normalized_path.is_absolute() {
            normalized_path = std::env::current_dir()
                .map_err(|e| e.to_string())?
                .join(normalized_path);
        }

        if trimmed_path.ends_with('/') || trimmed_path.ends_with('\\') || normalized_path.is_dir() {
            normalized_path = normalized_path.join(Database::FILENAME);
        }

        Ok(Some(normalized_path))
    }
}
