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
    db_dir: PathBuf,
}

impl Database {
    pub const DB_NAME: &'static str = "app.db";

    pub fn new(db_dir: PathBuf) -> Self {
        Database { pool: None, db_dir }
    }

    pub fn path_in(db_dir: &Path) -> PathBuf {
        db_dir.join(Self::DB_NAME)
    }

    fn db_path(&self) -> PathBuf {
        Self::path_in(&self.db_dir)
    }

    pub async fn connect(&mut self) -> Result<(), String> {
        let db_path = self.db_path();

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

        let entries = std::fs::read_dir(&self.db_dir)
            .map_err(|e| format!("failed to read db directory: {}", e))?;

        for entry in entries {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();

            if let Some(fname) = path.file_name().and_then(|n| n.to_str()) {
                if fname.starts_with(Database::DB_NAME) {
                    std::fs::remove_file(&path)
                        .map_err(|e| format!("failed to delete {}: {}", fname, e))?;
                }
            }
        }

        Ok(())
    }

    pub async fn ready(&self) -> bool {
        if let Some(pool) = self.pool() {
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

            if let Some(count) = row {
                return count == 1;
            }
        }

        false
    }

    pub const fn pool(&self) -> Option<&Pool<Sqlite>> {
        self.pool.as_ref()
    }
}
