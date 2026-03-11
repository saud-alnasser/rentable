pub mod commands;
pub mod migrations;
pub mod proxy;

use sqlx::{
    Pool, Sqlite,
    sqlite::{SqliteConnectOptions, SqlitePoolOptions},
};
use std::path::{Path, PathBuf};

pub struct Database {
    pool: Option<Pool<Sqlite>>,
    db_path: PathBuf,
}

impl Database {
    pub const DB_NAME: &'static str = "app.db";

    pub fn new(db_path: PathBuf) -> Self {
        Database {
            pool: None,
            db_path,
        }
    }

    pub fn default_path_in(db_dir: &Path) -> PathBuf {
        db_dir.join(Self::DB_NAME)
    }

    pub fn path(&self) -> &Path {
        &self.db_path
    }

    fn related_paths(db_path: &Path) -> Vec<PathBuf> {
        let db_path = db_path.to_path_buf();
        let suffixes = ["-wal", "-shm", "-journal"];

        let mut paths = vec![db_path.clone()];
        let base = db_path.to_string_lossy().into_owned();

        for suffix in suffixes {
            paths.push(PathBuf::from(format!("{}{}", base, suffix)));
        }

        paths
    }

    pub fn purge_path(db_path: &Path) -> Result<(), String> {
        for path in Self::related_paths(db_path) {
            if path.exists() {
                std::fs::remove_file(&path)
                    .map_err(|e| format!("failed to delete {}: {}", path.to_string_lossy(), e))?;
            }
        }

        Ok(())
    }

    pub async fn connect(&mut self) -> Result<(), String> {
        let db_path = self.path().to_path_buf();

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

        migrations::create_table(&pool)
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

    pub async fn purge(&self) -> Result<(), String> {
        self.disconnect().await;

        Self::purge_path(self.path())
    }

    pub async fn create_backup_from_pool(
        pool: &Pool<Sqlite>,
        backup_path: &Path,
    ) -> Result<(), String> {
        if let Some(parent) = backup_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }

        if backup_path.exists() {
            std::fs::remove_file(backup_path).map_err(|e| e.to_string())?;
        }

        let escaped_path = backup_path.to_string_lossy().replace('\'', "''");

        sqlx::query(format!("VACUUM INTO '{}'", escaped_path).as_str())
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;

        Ok(())
    }

    pub async fn create_backup(&self, backup_path: &Path) -> Result<(), String> {
        let pool = self
            .pool_cloned()
            .ok_or("database not connected".to_string())?;

        Self::create_backup_from_pool(&pool, backup_path).await
    }

    pub async fn is_pool_ready(pool: &Pool<Sqlite>) -> bool {
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

    pub async fn ready(&self) -> bool {
        if let Some(pool) = self.pool_cloned() {
            return Self::is_pool_ready(&pool).await;
        }

        false
    }

    pub fn pool_cloned(&self) -> Option<Pool<Sqlite>> {
        self.pool.clone()
    }

    pub const fn pool(&self) -> Option<&Pool<Sqlite>> {
        self.pool.as_ref()
    }
}
