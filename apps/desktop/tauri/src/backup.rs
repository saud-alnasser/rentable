//! a copy of a database, taken before anything changes its shape (effort 838, requirement 13,
//! tickets 27 and 28).
//!
//! **Before an organization changes format, and before a workspace takes a migration, the machine
//! making the change writes down what it is about to change.** An upgrade rewrites and re-signs
//! every row, and one that finished wrong would leave nothing to go back to. The copy is taken
//! after everything that can refuse the change has had its say, so a refusal leaves no copy of a
//! change that never ran, and before the first write, so the copy is the database as it stood.
//!
//! **Logical, because the engine will not copy a replica's file.** A replica is a Turso database
//! with change data and a sync journal beside it, and the engine refused to copy one out, which
//! is why `update.rs` lost its snapshot (#569). So a copy is made of what the database answers:
//! every table but SQLite's own and the engine's, created with the statement that created it and
//! filled row by row, into a plain SQLite file written through `sqlx` as every other plain file
//! here is. Anybody can open it with any SQLite tool. What it holds is sealed and signed as it
//! lies, and no key goes with it.
//!
//! **A copy stands only once it has been read back.** It is written as `<name>.partial`, each
//! table's row count in the file is compared with the rows the source answered, and only then is
//! it renamed to `<label>-<unix ms>.sqlite` under `<data directory>/backups/<database>/`. A copy
//! that cannot be written, filled or read back refuses the change with `CopyNotTaken`, naming the
//! directory, and nothing has been written to the database. The three newest per database are
//! kept, and the rest removed once the new one stands.
//!
//! **A copy on the account as well, where this machine holds it** ([`remote_copy`]): a database
//! seeded from the one about to change, in the same group, protected from deletion. It is kept for
//! good; the owner removes one on the account. One that cannot be made is logged, and the change
//! goes on with the local copy.
//!
//! **What is copied is behind [`Source`]**, because two things are: the organization replica's
//! connection (`OrganizationStore`, in `organization/store.rs`), and a workspace over the
//! `/v2/pipeline` its migration goes over, with the credential the migration is applied under
//! (`migrate::OverThePipeline`, ticket 28). Each lives beside what it reads, and both read with
//! [`LISTING`] and [`selecting`]. A workspace's copies are under `backups/ws-<workspace id>/`,
//! labelled `schema-<from>-to-<to>`, beside the organization's under `backups/org-<id>/`.

use std::path::{Path, PathBuf};

use sqlx::{
    AssertSqlSafe, ConnectOptions, Connection,
    sqlite::{SqliteConnectOptions, SqliteConnection, SqliteJournalMode},
};

use crate::{
    diagnostics,
    error::{Error, RefusalReason},
    sync::turso::platform::{PlatformError, TursoPlatform},
};

/// Where the copies live, under the application's data directory.
pub const DIRECTORY_NAME: &str = "backups";

/// How many copies of one database are kept on this machine.
pub const KEPT: usize = 3;

/// The longest name Turso takes for a database.
const REMOTE_NAME_LIMIT: usize = 64;

/// The tables a copy holds, with the statement each was created with: every table but SQLite's
/// own (`sqlite_`) and the engine's (`turso_`, and anything under two underscores), which is the
/// filter `OrganizationStore::tables` reads with.
pub(crate) const LISTING: &str = "SELECT name, sql FROM sqlite_master WHERE type = 'table' \
     AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'turso_%' \
     AND name NOT LIKE '\\_\\_%' ESCAPE '\\' ORDER BY name";

/// One table of the database being copied.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct Table {
    pub(crate) name: String,
    /// the `CREATE TABLE` statement the database holds for it.
    pub(crate) statement: String,
}

/// What a copy is read from.
///
/// **Two answers and nothing else**: the tables, and each one's rows in the storage class every
/// value holds. Whoever implements it reads with [`LISTING`] and [`selecting`], so the organization
/// replica and a workspace's pipeline copy the same tables the same way.
pub(crate) trait Source {
    /// Every table to copy, with its statement.
    async fn tables(&self) -> Result<Vec<Table>, Error>;
    /// Every row of `table`, each value as the database holds it.
    async fn rows(&self, table: &str) -> Result<Vec<Vec<turso::Value>>, Error>;
}

/// The statement that reads every row of `table`.
pub(crate) fn selecting(table: &str) -> String {
    format!("SELECT * FROM {}", quoted(table))
}

/// Where the copies of `database` live, under the data directory `data_directory`.
pub fn directory_of(data_directory: &Path, database: &str) -> PathBuf {
    data_directory.join(DIRECTORY_NAME).join(database)
}

/// Copy what `source` holds to a file of its own under `data_directory`, for the database named
/// `database`, labelled `label` and stamped `at` (unix milliseconds), and say where it is.
///
/// Nothing here writes to the source. A copy that could not be taken is refused with
/// `CopyNotTaken`, naming the directory, and leaves no `.partial` behind. Once the copy stands,
/// the oldest beyond [`KEPT`] are removed; one that will not go is logged and left.
pub(crate) async fn local_copy(
    source: &impl Source,
    data_directory: &Path,
    database: &str,
    label: &str,
    at: i64,
) -> Result<PathBuf, Error> {
    let directory = directory_of(data_directory, database);
    let path = directory.join(format!("{label}-{at}.sqlite"));
    let partial = directory.join(format!("{label}-{at}.sqlite.partial"));

    if let Err(cause) = written(source, &directory, &partial, &path).await {
        let _ = std::fs::remove_file(&partial);

        diagnostics::error("backup.localCopyNotTaken")
            .with("database", database)
            .with("directory", directory.display().to_string())
            .with("reason", cause.to_string())
            .write();

        return Err(Error::refused(
            RefusalReason::CopyNotTaken,
            format!(
                "the copy of {database} taken before it changes could not be written to {}; \
                 nothing was changed",
                directory.display()
            ),
        ));
    }

    diagnostics::info("backup.localCopied")
        .with("database", database)
        .with("path", path.display().to_string())
        .write();

    kept(&directory, database);

    Ok(path)
}

/// Write the copy to `partial`, read it back, and rename it to `path`.
async fn written(
    source: &impl Source,
    directory: &Path,
    partial: &Path,
    path: &Path,
) -> Result<(), Error> {
    std::fs::create_dir_all(directory)?;

    // a `.partial` a run cut short left behind is not a copy, and this one takes its place.
    match std::fs::remove_file(partial) {
        Err(error) if error.kind() != std::io::ErrorKind::NotFound => return Err(error.into()),
        _ => {}
    }

    let mut copy = SqliteConnectOptions::new()
        .filename(partial)
        .create_if_missing(true)
        .journal_mode(SqliteJournalMode::Delete)
        .connect()
        .await?;
    let filled = filled(source, &mut copy).await;

    // closed whatever came of it, so the file can be renamed or removed on every platform.
    copy.close().await?;
    filled?;
    std::fs::rename(partial, path)?;

    Ok(())
}

/// Create every table of `source` in `copy`, fill it in one transaction, and compare each table's
/// row count in `copy` with the rows `source` answered.
async fn filled(source: &impl Source, copy: &mut SqliteConnection) -> Result<(), Error> {
    let tables = source.tables().await?;
    let mut counted = Vec::with_capacity(tables.len());
    let mut transaction = copy.begin().await?;

    for table in &tables {
        sqlx::query(AssertSqlSafe(table.statement.as_str()))
            .execute(&mut *transaction)
            .await?;

        let rows = source.rows(&table.name).await?;

        for row in &rows {
            let placeholders = vec!["?"; row.len()].join(", ");
            let statement = format!(
                "INSERT INTO {} VALUES ({placeholders})",
                quoted(&table.name)
            );
            let mut insert = sqlx::query(AssertSqlSafe(statement));

            for value in row {
                insert = match value {
                    turso::Value::Null => insert.bind(None::<i64>),
                    turso::Value::Integer(integer) => insert.bind(*integer),
                    turso::Value::Real(real) => insert.bind(*real),
                    turso::Value::Text(text) => insert.bind(text.clone()),
                    turso::Value::Blob(bytes) => insert.bind(bytes.clone()),
                };
            }

            insert.execute(&mut *transaction).await?;
        }

        counted.push((table.name.as_str(), rows.len() as i64));
    }

    transaction.commit().await?;

    for (table, expected) in counted {
        let found: i64 = sqlx::query_scalar(AssertSqlSafe(format!(
            "SELECT COUNT(*) FROM {}",
            quoted(table)
        )))
        .fetch_one(&mut *copy)
        .await?;

        if found != expected {
            return Err(Error::Integrity {
                message: format!(
                    "the copy of {table} holds {found} rows and the database answered {expected}"
                ),
            });
        }
    }

    Ok(())
}

/// Remove every copy in `directory` but the [`KEPT`] newest, by the stamp in its name. A file
/// whose name carries no stamp is not one of these and is left alone, as is a `.partial`.
fn kept(directory: &Path, database: &str) {
    let Ok(entries) = std::fs::read_dir(directory) else {
        return;
    };
    let mut copies: Vec<(i64, PathBuf)> = entries
        .flatten()
        .filter_map(|entry| {
            let path = entry.path();
            let stamp = path
                .file_name()?
                .to_str()?
                .strip_suffix(".sqlite")?
                .rsplit_once('-')?
                .1
                .parse::<i64>()
                .ok()?;

            Some((stamp, path))
        })
        .collect();

    copies.sort();

    let surplus = copies.len().saturating_sub(KEPT);

    for (_, path) in copies.into_iter().take(surplus) {
        if let Err(error) = std::fs::remove_file(&path) {
            diagnostics::warn("backup.oldCopyLeft")
                .with("database", database)
                .with("path", path.display().to_string())
                .with("reason", error.to_string())
                .write();
        }
    }
}

/// Make a protected copy of `database` on `platform`'s account, named for `label` and `at` (unix
/// milliseconds) by [`remote_name`], and say what it is called. Where it is, and where it could not
/// be made and why, is logged; a refusal is the caller's to go on from.
pub(crate) async fn remote_copy(
    platform: &impl TursoPlatform,
    database: &str,
    label: &str,
    at: i64,
) -> Result<String, PlatformError> {
    let name = remote_name(database, label, at / 1000);

    match platform.copy_database(database, &name).await {
        Ok(()) => {
            diagnostics::info("backup.remoteCopied")
                .with("database", database)
                .with("copy", name.as_str())
                .write();

            Ok(name)
        }
        Err(refusal) => {
            diagnostics::warn("backup.remoteCopyRefused")
                .with("database", database)
                .with("copy", name.as_str())
                .with("reason", refusal.to_string())
                .write();

            Err(refusal)
        }
    }
}

/// `<database>-<label>-<unix s>` as Turso takes a name: lowercase letters, digits and dashes, and
/// no longer than 64 characters. Where it would be longer, the database's part is cut rather than
/// the label or the moment, which are what tell one copy of a database from another.
pub(crate) fn remote_name(database: &str, label: &str, at_seconds: i64) -> String {
    let spelled = |part: &str| -> String {
        part.chars()
            .map(|character| match character.to_ascii_lowercase() {
                lower @ ('a'..='z' | '0'..='9') => lower,
                _ => '-',
            })
            .collect()
    };
    let suffix = format!("-{}-{at_seconds}", spelled(label));
    let room = REMOTE_NAME_LIMIT.saturating_sub(suffix.len());
    let database: String = spelled(database).chars().take(room).collect();
    let name = format!("{}{suffix}", database.trim_end_matches('-'));

    name.chars().take(REMOTE_NAME_LIMIT).collect()
}

/// `name` as an SQL identifier.
fn quoted(name: &str) -> String {
    format!("\"{}\"", name.replace('"', "\"\""))
}

/// Everything the copy at `path` holds, table by table and row by row, read from it as a plain
/// SQLite file, each value in the storage class it lies in: what a test compares with what the
/// database held before its change (tickets 27 and 28).
#[cfg(test)]
pub(crate) async fn contents_of(path: &Path) -> Vec<(String, Vec<Vec<turso::Value>>)> {
    use sqlx::{ConnectOptions, Connection, Row, TypeInfo, ValueRef, sqlite::SqliteConnectOptions};

    let mut plain = SqliteConnectOptions::new()
        .filename(path)
        .read_only(true)
        .connect()
        .await
        .expect("the copy opens as a plain file");
    let tables: Vec<String> = sqlx::query_scalar(
        "SELECT name FROM sqlite_master WHERE type = 'table' \
         AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .fetch_all(&mut plain)
    .await
    .expect("the tables");
    let mut contents = Vec::new();

    for table in tables {
        let rows = sqlx::query(sqlx::AssertSqlSafe(format!(
            "SELECT * FROM \"{table}\" ORDER BY rowid"
        )))
        .fetch_all(&mut plain)
        .await
        .expect("the rows");
        let values = rows
            .iter()
            .map(|row| {
                (0..row.len())
                    .map(|index| {
                        let raw = row.try_get_raw(index).expect("a value");

                        if raw.is_null() {
                            return turso::Value::Null;
                        }

                        match raw.type_info().name() {
                            "INTEGER" => turso::Value::Integer(row.get(index)),
                            "REAL" => turso::Value::Real(row.get(index)),
                            "TEXT" => turso::Value::Text(row.get(index)),
                            _ => turso::Value::Blob(row.get(index)),
                        }
                    })
                    .collect()
            })
            .collect();

        contents.push((table, values));
    }

    plain.close().await.expect("closed");

    contents
}

#[cfg(test)]
mod tests {
    use std::path::{Path, PathBuf};

    use sqlx::{ConnectOptions, Connection, sqlite::SqliteConnectOptions};

    use super::{KEPT, Source, Table, directory_of, local_copy, remote_copy, remote_name};
    use crate::{
        error::{Error, RefusalReason},
        sync::turso::platform::{InMemoryPlatform, PlatformError},
    };

    /// One row of `note`, as the copy is read back.
    type Note = (i64, String, f64, Vec<u8>, Option<String>);

    /// A source that answers the tables and rows it was given.
    struct Answering {
        tables: Vec<(Table, Vec<Vec<turso::Value>>)>,
    }

    impl Source for Answering {
        async fn tables(&self) -> Result<Vec<Table>, Error> {
            Ok(self.tables.iter().map(|(table, _)| table.clone()).collect())
        }

        async fn rows(&self, table: &str) -> Result<Vec<Vec<turso::Value>>, Error> {
            Ok(self
                .tables
                .iter()
                .find(|(held, _)| held.name == table)
                .map(|(_, rows)| rows.clone())
                .unwrap_or_default())
        }
    }

    /// One table, `note`, holding a value of every storage class.
    fn one_table() -> Answering {
        Answering {
            tables: vec![(
                Table {
                    name: "note".to_string(),
                    statement: "CREATE TABLE \"note\" (\"id\" INTEGER PRIMARY KEY, \"body\" TEXT, \
                                \"weight\" REAL, \"sealed\" BLOB, \"gone\" TEXT)"
                        .to_string(),
                },
                vec![
                    vec![
                        turso::Value::Integer(1),
                        turso::Value::Text("first".to_string()),
                        turso::Value::Real(1.5),
                        turso::Value::Blob(vec![0, 1, 2]),
                        turso::Value::Null,
                    ],
                    vec![
                        turso::Value::Integer(2),
                        turso::Value::Text("second".to_string()),
                        turso::Value::Real(-2.25),
                        turso::Value::Blob(Vec::new()),
                        turso::Value::Null,
                    ],
                ],
            )],
        }
    }

    /// A directory of this test's own under the system's temporary directory.
    fn scratch(name: &str) -> PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|elapsed| elapsed.as_nanos())
            .unwrap_or_default();
        let directory = std::env::temp_dir().join(format!("rentable-backup-{name}-{nanos:x}"));
        std::fs::create_dir_all(&directory).expect("scratch directory");

        directory
    }

    /// The names in `directory`, sorted.
    fn names_in(directory: &Path) -> Vec<String> {
        let mut names: Vec<String> = std::fs::read_dir(directory)
            .expect("the directory")
            .flatten()
            .map(|entry| entry.file_name().to_string_lossy().into_owned())
            .collect();

        names.sort();
        names
    }

    /// The copy is a plain SQLite file any tool opens, holding every row as the source answered
    /// it, value by value, and it is where the log says it is.
    #[tokio::test]
    async fn a_copy_is_a_plain_file_holding_every_row_as_the_source_answered_it() {
        let data = scratch("plain");
        let path = local_copy(
            &one_table(),
            &data,
            "org-1",
            "format-1-to-2",
            1_758_000_000_000,
        )
        .await
        .expect("the copy");

        assert_eq!(
            path,
            directory_of(&data, "org-1").join("format-1-to-2-1758000000000.sqlite")
        );
        assert_eq!(
            names_in(&directory_of(&data, "org-1")),
            vec!["format-1-to-2-1758000000000.sqlite"],
            "a .partial was left beside the copy"
        );

        let mut plain = SqliteConnectOptions::new()
            .filename(&path)
            .read_only(true)
            .connect()
            .await
            .expect("the copy opens as a plain file");
        let rows: Vec<Note> =
            sqlx::query_as("SELECT id, body, weight, sealed, gone FROM note ORDER BY id")
                .fetch_all(&mut plain)
                .await
                .expect("the rows");

        plain.close().await.expect("closed");

        assert_eq!(
            rows,
            vec![
                (1, "first".to_string(), 1.5, vec![0, 1, 2], None),
                (2, "second".to_string(), -2.25, Vec::new(), None),
            ]
        );
    }

    /// A directory that cannot be made refuses with `CopyNotTaken`, naming it.
    #[tokio::test]
    async fn a_copy_that_cannot_be_written_is_refused_naming_the_directory() {
        let data = scratch("unwritable");

        // a file where the directory of copies would go, so nothing can be made under it.
        std::fs::write(data.join(super::DIRECTORY_NAME), b"in the way").expect("the obstacle");

        let refused = local_copy(&one_table(), &data, "org-1", "format-1-to-2", 1)
            .await
            .expect_err("a copy was written under a file");

        assert!(
            matches!(
                &refused,
                Error::Refused { reason: RefusalReason::CopyNotTaken, message }
                    if message.contains(&directory_of(&data, "org-1").display().to_string())
            ),
            "{refused:?}"
        );
    }

    /// Three copies of one database are kept, the newest by the moment each was taken, and a
    /// copy of another database is not counted against them.
    #[tokio::test]
    async fn the_three_newest_copies_of_a_database_are_kept() {
        let data = scratch("kept");

        for at in [5, 1, 4, 2, 3] {
            local_copy(&one_table(), &data, "org-1", "format-1-to-2", at)
                .await
                .expect("the copy");
        }

        local_copy(&one_table(), &data, "ws-1", "schema-3-to-4", 1)
            .await
            .expect("the other database's copy");

        assert_eq!(KEPT, 3);
        assert_eq!(
            names_in(&directory_of(&data, "org-1")),
            vec![
                "format-1-to-2-3.sqlite",
                "format-1-to-2-4.sqlite",
                "format-1-to-2-5.sqlite"
            ]
        );
        assert_eq!(
            names_in(&directory_of(&data, "ws-1")),
            vec!["schema-3-to-4-1.sqlite"]
        );
    }

    /// The account's copy is named for the database, the label and the second, as Turso takes a
    /// name, and cut to 64 characters from the database's part.
    #[test]
    fn a_copy_on_the_account_is_named_as_turso_takes_a_name() {
        assert_eq!(
            remote_name(
                "org-7f3a9c0e1d2b4a5f8e7d6c5b4a3f2e1d",
                "format-1-to-2",
                1_758_000_000
            ),
            "org-7f3a9c0e1d2b4a5f8e7d6c5b4a3f2e1d-format-1-to-2-1758000000"
        );

        let long = remote_name(&"Org".repeat(40), "Schema_3 to 4", 1_758_000_000);

        assert_eq!(long.len(), 64);
        assert!(long.starts_with("orgorg"), "{long}");
        assert!(long.ends_with("-schema-3-to-4-1758000000"), "{long}");
        assert!(
            long.chars().all(|character| character.is_ascii_lowercase()
                || character.is_ascii_digit()
                || character == '-'),
            "{long}"
        );
    }

    /// The account's copy is seeded from the database and protected; one the account refuses is
    /// the caller's to go on from, and nothing is left there.
    #[tokio::test]
    async fn a_copy_on_the_account_is_seeded_protected_or_refused() {
        let platform = InMemoryPlatform::new("an-org");

        platform.holding_unprotected("org-1");

        let name = remote_copy(&platform, "org-1", "format-1-to-2", 1_758_000_000_000)
            .await
            .expect("the copy");

        assert_eq!(name, "org-1-format-1-to-2-1758000000");
        assert_eq!(platform.copies(), vec![("org-1".to_string(), name.clone())]);
        assert!(
            platform
                .databases()
                .iter()
                .any(|database| database.name == name && database.delete_protection)
        );

        platform.refuse_next(PlatformError::Refused {
            what: "copy the database",
        });

        assert!(
            remote_copy(&platform, "org-1", "format-1-to-2", 1_758_000_060_000)
                .await
                .is_err()
        );
        assert_eq!(platform.copies().len(), 1);
    }
}
