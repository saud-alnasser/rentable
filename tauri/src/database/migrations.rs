use sqlparser::dialect::SQLiteDialect;
use sqlparser::parser::Parser;
use sqlx::{Pool, Sqlite};
use std::{
    fs,
    path::{Path, PathBuf},
};

use crate::error::Error;

pub const TABLE_NAME: &'static str = "__migrations__";

pub async fn create_table(pool: &Pool<Sqlite>) -> Result<(), Error> {
    sqlx::query(
            format!(
                "CREATE TABLE IF NOT EXISTS {}(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);",
                TABLE_NAME
            )
            .as_str(),
        )
        .execute(pool)
        .await?;

    Ok(())
}

pub async fn run(pool: &Pool<Sqlite>, migrations_dir: &PathBuf) -> Result<(), Error> {
    println!("[migration] running sql migrations.");
    create_table(pool).await?;

    let migration_files = get_migration_files(migrations_dir)?;
    let mut migrations_count = 0;

    for file in migration_files {
        let file_name = file.clone();
        let migration_path = migrations_dir.join(&file);
        let sql = fs::read_to_string(&migration_path).map_err(|e| Error::Io {
            message: format!(
                "failed to read migration {}: {}",
                migration_path.display(),
                e
            ),
        })?;

        if is_migration_applied(pool, &file_name).await? {
            continue;
        }

        migrations_count += 1;
        println!("[migration] applying migration: {}", file_name);
        if let Err(err) = apply_migration(pool, &file_name, &sql).await {
            println!(
                "[migration] migration failed: {}\nError: {}",
                file_name, err
            );
            return Err(err);
        }

        println!("[migration] migration applied: {}", file_name);
    }

    println!(
        "[migration] migration completed. {} new migrations applied.",
        migrations_count
    );

    Ok(())
}

fn get_migration_files(migrations_dir: &PathBuf) -> Result<Vec<String>, Error> {
    let path = Path::new(migrations_dir);

    if !path.exists() {
        return Err(Error::NotFound {
            message: format!("migration folder not found: {}", migrations_dir.display()),
        });
    }

    let mut files: Vec<String> = fs::read_dir(path)?
        .filter_map(|entry| {
            let entry = entry.ok()?;
            let path = entry.path();
            if path.extension()?.to_str()? == "sql" {
                Some(path.file_name()?.to_string_lossy().to_string())
            } else {
                None
            }
        })
        .collect();

    files.sort();

    Ok(files)
}

async fn is_migration_applied(pool: &Pool<Sqlite>, name: &str) -> Result<bool, Error> {
    let res: Option<(i64,)> = sqlx::query_as(&format!(
        "SELECT id FROM {} WHERE name = ? LIMIT 1;",
        TABLE_NAME
    ))
    .bind(name)
    .fetch_optional(pool)
    .await?;

    Ok(res.is_some())
}

async fn apply_migration(pool: &Pool<Sqlite>, name: &str, sql: &str) -> Result<(), Error> {
    let dialect = SQLiteDialect {};
    let statements = Parser::parse_sql(&dialect, sql).map_err(|e| Error::Integrity {
        message: e.to_string(),
    })?;

    let mut tx = pool.begin().await?;

    for statement in statements {
        let sql_str = statement.to_string();
        sqlx::query(&sql_str)
            .execute(&mut *tx)
            .await
            .map_err(|e| Error::Database {
                message: format!("{}: {}", name, e),
            })?;
    }

    sqlx::query(&format!("INSERT INTO {} (name) VALUES (?)", TABLE_NAME))
        .bind(name)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;

    Ok(())
}
