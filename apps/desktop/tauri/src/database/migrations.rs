use sqlparser::dialect::SQLiteDialect;
use sqlparser::parser::Parser;
use sqlx::{AssertSqlSafe, Pool, Sqlite};
use std::{
    fs,
    path::{Path, PathBuf},
};

use crate::{diagnostics, error::Error};

// A macro rather than a `const` so the statements below can `concat!` it: sqlx accepts
// only `&'static str` without an injection assertion, and a name interpolated at runtime
// would force one on statements that are entirely fixed at compile time.
macro_rules! table_name {
    () => {
        "__migrations__"
    };
}

const CREATE_TABLE: &str = concat!(
    "CREATE TABLE IF NOT EXISTS ",
    table_name!(),
    "(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);"
);

const SELECT_APPLIED: &str = concat!("SELECT id FROM ", table_name!(), " WHERE name = ? LIMIT 1;");

const INSERT_APPLIED: &str = concat!("INSERT INTO ", table_name!(), " (name) VALUES (?)");

/// Whether the migrations table exists yet — the readiness probe the database module runs
/// before it will treat a pool as usable.
pub const TABLE_EXISTS: &str = concat!(
    "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='",
    table_name!(),
    "';"
);

pub async fn create_table(pool: &Pool<Sqlite>) -> Result<(), Error> {
    sqlx::query(CREATE_TABLE).execute(pool).await?;

    Ok(())
}

pub async fn run(pool: &Pool<Sqlite>, migrations_dir: &PathBuf) -> Result<(), Error> {
    diagnostics::info("migration.started").write();

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

        if let Err(err) = apply_migration(pool, &file_name, &sql).await {
            diagnostics::error("migration.failed")
                .with("file", file_name.as_str())
                .with("error", err.to_string())
                .write();

            return Err(err);
        }

        diagnostics::info("migration.applied")
            .with("file", file_name.as_str())
            .write();
    }

    diagnostics::info("migration.completed")
        .with("applied", migrations_count.to_string())
        .write();

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
    let res: Option<(i64,)> = sqlx::query_as(SELECT_APPLIED)
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
        // Asserted safe: the text is a migration file shipped with the application,
        // re-emitted by the parser above rather than assembled from any input.
        let sql_str = AssertSqlSafe(statement.to_string());
        sqlx::query(sql_str)
            .execute(&mut *tx)
            .await
            .map_err(|e| Error::Database {
                message: format!("{}: {}", name, e),
            })?;
    }

    sqlx::query(INSERT_APPLIED)
        .bind(name)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;

    Ok(())
}
