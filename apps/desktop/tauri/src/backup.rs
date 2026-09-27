//! a copy of a database, taken before anything changes its shape (effort 838, requirement 13,
//! tickets 27, 28 and 30).
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
//! every table, index, view and trigger but what the engine owns ([`NOT_THE_ENGINES`]), each
//! created with the statement that created it, into a plain SQLite file written through `sqlx` as
//! every other plain file here is. The tables are created and filled first and everything else
//! after, so no trigger fires on a row being copied. Anybody can open the file with any SQLite
//! tool, and a database restored from it keeps its unique indexes. What it holds is sealed and
//! signed as it lies, and no key goes with it.
//!
//! **One moment, read in pages.** The source is read inside one read transaction ([`Source`]), so
//! a write landing while the copy is taken is either all in it or not in it at all. Each table's
//! rows are read [`PAGE`] at a time in rowid order, so no one answer has to hold a whole table,
//! and each table's `COUNT(*)` is read in the same transaction.
//!
//! **A copy stands only once it has been read back.** It is written as `<name>.partial`, the rows
//! each table answered are compared with the count the source gave for it, each table's row count
//! in the file is compared with that count again, and only then is it renamed to
//! `<label>-<unix ms>.sqlite` under `<data directory>/backups/<database>/`. A copy that cannot be
//! taken refuses the change with `CopyNotTaken`, naming the directory, and nothing has been
//! written to the database. The log tells a source that could not be read
//! (`backup.localCopyNotRead`) from a file that could not be written
//! (`backup.localCopyNotWritten`).
//! The three newest per database are kept, the one just written always among them, and the rest
//! removed once the new one stands.
//!
//! **A copy on the account as well, where this machine holds it** ([`remote_copy`]): a database
//! seeded from the one about to change, in the same group, protected from deletion, and named by
//! [`remote_name`] so nothing reading the account's databases takes it for an organization or a
//! workspace. It is kept for good; the owner removes one on the account. One that cannot be made
//! is logged, and the change goes on with the local copy.
//!
//! **What is copied is behind [`Source`]**, because two things are: the organization replica's
//! connection (`OrganizationStore`, in `organization/store.rs`), and a workspace over the
//! `/v2/pipeline` its migration goes over, with the credential the migration is applied under
//! (`migrate::OverThePipeline`, ticket 28). Each lives beside what it reads, and both answer the
//! statements written here. A workspace's copies are under `backups/ws-<workspace id>/`, labelled
//! `schema-<from>-to-<to>`, beside the organization's under `backups/org-<id>/`.

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

/// How many rows of a table one read answers.
///
/// A row here is a few hundred bytes to a few kilobytes, sealed values included, so a page stays
/// well under a megabyte however large the table grows.
pub(crate) const PAGE: usize = 256;

/// What begins every copy's name on the account.
const REMOTE_PREFIX: &str = "copy-";

/// The longest name a copy on the account is given.
///
/// **Set by the hostname rather than by the name.** Turso takes a name of up to 64 characters,
/// but a database's hostname begins with the label `<name>-<account slug>`, and a DNS label holds
/// 63 characters. Forty for the name leaves 22 for the slug, which is longer than any account's
/// this application has met; `org-<id>`, at 36, is under the same budget.
pub(crate) const REMOTE_NAME_LIMIT: usize = 40;

/// How much of the database's id a copy's name on the account carries: enough to tell the
/// databases of one group apart, and short enough to leave the label and the moment whole.
const REMOTE_ID_LENGTH: usize = 8;

/// What the engine owns, and so what a copy leaves out, as a condition on `sqlite_master`'s `name`
/// and `tbl_name`: SQLite's own (`sqlite_`), turso's (`turso_`, the change data and the sync
/// engine's bookkeeping) and turso's internal ones (`__turso_internal_`). These are the prefixes
/// turso reserves at 0.8 (`RESERVED_TABLE_PREFIXES` in `turso_core`'s `schema.rs`) with its
/// change data beside them, and the same three `Database::HAS_A_SCHEMA` in `database/mod.rs` reads
/// a freshly built replica by.
///
/// **A name under two underscores that is not turso's is copied.** `drizzle-kit` rebuilds a table
/// as `__new_<table>` and renames it back, so a migration cut short leaves one of those in the
/// workspace, and it holds rows the copy is for. `OrganizationStore::tables` reads with this too.
pub(crate) const NOT_THE_ENGINES: &str = "name NOT LIKE 'sqlite!_%' ESCAPE '!' \
     AND name NOT LIKE 'turso!_%' ESCAPE '!' \
     AND name NOT LIKE '!_!_turso!_internal!_%' ESCAPE '!' \
     AND tbl_name NOT LIKE 'sqlite!_%' ESCAPE '!' \
     AND tbl_name NOT LIKE 'turso!_%' ESCAPE '!' \
     AND tbl_name NOT LIKE '!_!_turso!_internal!_%' ESCAPE '!'";

/// Everything a copy holds, with the statement each was created with: the tables first, then the
/// indexes, views and triggers, each kind by name. An index SQLite made for a constraint has no
/// statement of its own, and the table's statement makes it again.
pub(crate) fn listing() -> String {
    format!(
        "SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL AND {NOT_THE_ENGINES} \
         ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 WHEN 'view' THEN 2 ELSE 3 END, \
         name"
    )
}

/// One thing the database's schema holds: a table, an index, a view or a trigger.
#[derive(Clone, Debug, PartialEq, Eq)]
struct Object {
    /// `table`, `index`, `view` or `trigger`, as `sqlite_master` says.
    kind: String,
    name: String,
    /// the `CREATE` statement the database holds for it.
    statement: String,
}

/// What a copy is read from.
///
/// **One read, from [`Source::begin`] to [`Source::end`].** Everything [`Source::read`] answers in
/// between is of one moment, which is what makes a table's count and its rows agree and the
/// tables agree with each other. `end` writes nothing, and it is asked for whatever came of the
/// reads. The statements are this module's; whoever implements it only runs them, each value in
/// the storage class the database holds it in.
pub(crate) trait Source {
    /// Open the read.
    async fn begin(&self) -> Result<(), Error>;
    /// The rows `sql` answers, inside the read.
    async fn read(&self, sql: &str) -> Result<Vec<Vec<turso::Value>>, Error>;
    /// Close the read, writing nothing.
    async fn end(&self) -> Result<(), Error>;
}

/// Where the copies of `database` live, under the data directory `data_directory`.
pub fn directory_of(data_directory: &Path, database: &str) -> PathBuf {
    data_directory.join(DIRECTORY_NAME).join(database)
}

/// Why a copy was not taken: the source could not be read, or the file could not be written.
enum Failed {
    Read(Error),
    Written(Error),
}

/// A failure of the file, for `map_err`.
fn not_written(cause: impl Into<Error>) -> Failed {
    Failed::Written(cause.into())
}

/// Copy what `source` holds to a file of its own under `data_directory`, for the database named
/// `database`, labelled `label` and stamped `at` (unix milliseconds), and say where it is.
///
/// Nothing here writes to the source. A copy that could not be taken is refused with
/// `CopyNotTaken`, naming the directory, and leaves no `.partial` behind. Once the copy stands,
/// the oldest beyond [`KEPT`] are removed, never this one; one that will not go is logged and
/// left.
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

    if let Err(failed) = written(source, &directory, &partial, &path).await {
        let _ = std::fs::remove_file(&partial);

        let (event, message, cause) = match failed {
            Failed::Read(cause) => (
                "backup.localCopyNotRead",
                format!(
                    "{database} could not be read for the copy taken before it changes, so no \
                     copy was written to {}; nothing was changed",
                    directory.display()
                ),
                cause,
            ),
            Failed::Written(cause) => (
                "backup.localCopyNotWritten",
                format!(
                    "the copy of {database} taken before it changes could not be written to {}; \
                     nothing was changed",
                    directory.display()
                ),
                cause,
            ),
        };

        diagnostics::error(event)
            .with("database", database)
            .with("directory", directory.display().to_string())
            .with("reason", cause.to_string())
            .write();

        return Err(Error::refused(RefusalReason::CopyNotTaken, message));
    }

    diagnostics::info("backup.localCopied")
        .with("database", database)
        .with("path", path.display().to_string())
        .write();

    kept(&directory, database, &path);

    Ok(path)
}

/// Write the copy to `partial`, read it back, and rename it to `path`.
async fn written(
    source: &impl Source,
    directory: &Path,
    partial: &Path,
    path: &Path,
) -> Result<(), Failed> {
    std::fs::create_dir_all(directory).map_err(not_written)?;

    // a `.partial` a run cut short left behind is not a copy, and this one takes its place.
    match std::fs::remove_file(partial) {
        Err(error) if error.kind() != std::io::ErrorKind::NotFound => {
            return Err(not_written(error));
        }
        _ => {}
    }

    let mut copy = SqliteConnectOptions::new()
        .filename(partial)
        .create_if_missing(true)
        .journal_mode(SqliteJournalMode::Delete)
        .connect()
        .await
        .map_err(not_written)?;
    let filled = filled(source, &mut copy).await;

    // closed whatever came of it, so the file can be renamed or removed on every platform.
    copy.close().await.map_err(not_written)?;
    filled?;
    std::fs::rename(partial, path).map_err(not_written)?;

    Ok(())
}

/// Read `source` in one read into `copy`, then compare each table's row count in `copy` with the
/// count `source` gave.
async fn filled(source: &impl Source, copy: &mut SqliteConnection) -> Result<(), Failed> {
    source.begin().await.map_err(Failed::Read)?;

    let copied = read_into(source, copy).await;
    // ended whatever came of the reads; a failure before it is the one worth telling.
    let ended = source.end().await.map_err(Failed::Read);
    let counted = copied?;

    ended?;

    for (table, expected) in counted {
        let found: i64 = sqlx::query_scalar(AssertSqlSafe(format!(
            "SELECT COUNT(*) FROM {}",
            quoted(&table)
        )))
        .fetch_one(&mut *copy)
        .await
        .map_err(not_written)?;

        if found != expected {
            return Err(Failed::Written(Error::Integrity {
                message: format!(
                    "the copy of {table} holds {found} rows and the database counts {expected}"
                ),
            }));
        }
    }

    Ok(())
}

/// Create and fill every table of `source` in `copy`, then everything else, in one transaction,
/// and answer each table with the count `source` gave for it.
async fn read_into(
    source: &impl Source,
    copy: &mut SqliteConnection,
) -> Result<Vec<(String, i64)>, Failed> {
    let objects = schema_of(source).await.map_err(Failed::Read)?;
    let mut counted = Vec::new();
    let mut transaction = copy.begin().await.map_err(not_written)?;

    for object in objects.iter().filter(|object| object.kind == "table") {
        sqlx::query(AssertSqlSafe(object.statement.as_str()))
            .execute(&mut *transaction)
            .await
            .map_err(not_written)?;

        let expected = count_of(source, &object.name).await.map_err(Failed::Read)?;
        let mut answered = 0_i64;
        let mut after = None;

        loop {
            let page = source
                .read(&paging(&object.name, after))
                .await
                .map_err(Failed::Read)?;

            for row in &page {
                let (rowid, values) = split(row).map_err(Failed::Read)?;

                inserted(&mut transaction, &object.name, values).await?;
                after = Some(rowid);
            }

            answered += page.len() as i64;

            if page.len() < PAGE {
                break;
            }
        }

        if answered != expected {
            return Err(Failed::Read(Error::Integrity {
                message: format!(
                    "the database answered {answered} rows of {} and counts {expected}",
                    object.name
                ),
            }));
        }

        counted.push((object.name.clone(), expected));
    }

    for object in objects.iter().filter(|object| object.kind != "table") {
        sqlx::query(AssertSqlSafe(object.statement.as_str()))
            .execute(&mut *transaction)
            .await
            .map_err(not_written)?;
    }

    transaction.commit().await.map_err(not_written)?;

    Ok(counted)
}

/// Insert one row of `table` into the copy.
async fn inserted(
    transaction: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    table: &str,
    values: &[turso::Value],
) -> Result<(), Failed> {
    let placeholders = vec!["?"; values.len()].join(", ");
    let statement = format!("INSERT INTO {} VALUES ({placeholders})", quoted(table));
    let mut insert = sqlx::query(AssertSqlSafe(statement));

    for value in values {
        insert = match value {
            turso::Value::Null => insert.bind(None::<i64>),
            turso::Value::Integer(integer) => insert.bind(*integer),
            turso::Value::Real(real) => insert.bind(*real),
            turso::Value::Text(text) => insert.bind(text.clone()),
            turso::Value::Blob(bytes) => insert.bind(bytes.clone()),
        };
    }

    insert
        .execute(&mut **transaction)
        .await
        .map_err(not_written)?;

    Ok(())
}

/// What `source`'s schema holds, read with [`listing`].
async fn schema_of(source: &impl Source) -> Result<Vec<Object>, Error> {
    source
        .read(&listing())
        .await?
        .into_iter()
        .map(|row| match <[turso::Value; 3]>::try_from(row) {
            Ok(
                [
                    turso::Value::Text(kind),
                    turso::Value::Text(name),
                    turso::Value::Text(statement),
                ],
            ) => Ok(Object {
                kind,
                name,
                statement,
            }),
            _ => Err(Error::Integrity {
                message: "the database listed a part of its schema this application cannot read"
                    .to_string(),
            }),
        })
        .collect()
}

/// How many rows `table` holds, as `source` counts them.
async fn count_of(source: &impl Source, table: &str) -> Result<i64, Error> {
    let answered = source
        .read(&format!("SELECT COUNT(*) FROM {}", quoted(table)))
        .await?;

    match answered.as_slice() {
        [row] => match row.as_slice() {
            [turso::Value::Integer(count)] => Ok(*count),
            _ => Err(uncounted(table)),
        },
        _ => Err(uncounted(table)),
    }
}

fn uncounted(table: &str) -> Error {
    Error::Integrity {
        message: format!("the database counted {table} in a way this application cannot read"),
    }
}

/// The statement that reads the next [`PAGE`] rows of `table` after the row whose rowid is
/// `after`, in rowid order, each row led by its rowid.
pub(crate) fn paging(table: &str, after: Option<i64>) -> String {
    let past = after
        .map(|rowid| format!(" WHERE rowid > {rowid}"))
        .unwrap_or_default();

    format!(
        "SELECT rowid, * FROM {}{past} ORDER BY rowid LIMIT {PAGE}",
        quoted(table)
    )
}

/// A row [`paging`] answered, as its rowid and its values.
fn split(row: &[turso::Value]) -> Result<(i64, &[turso::Value]), Error> {
    match row.split_first() {
        Some((turso::Value::Integer(rowid), values)) => Ok((*rowid, values)),
        _ => Err(Error::Integrity {
            message: "the database answered a row with no rowid this application can read"
                .to_string(),
        }),
    }
}

/// Remove every copy in `directory` but the [`KEPT`] newest, by the stamp in its name, and never
/// `written`, the copy just taken, whatever its stamp says. A file whose name carries no stamp is
/// not one of these and is left alone, as is a `.partial`.
fn kept(directory: &Path, database: &str, written: &Path) {
    let Ok(entries) = std::fs::read_dir(directory) else {
        return;
    };
    let mut others: Vec<(i64, PathBuf)> = entries
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
        .filter(|(_, path)| path != written)
        .collect();

    others.sort();

    // the one just written counts against what is kept, and is not among what can go.
    let surplus = (others.len() + 1).saturating_sub(KEPT);

    for (_, path) in others.into_iter().take(surplus) {
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

/// `copy-<id>-<label>-<unix s>` as Turso takes a name: lowercase letters, digits and dashes, and no
/// longer than [`REMOTE_NAME_LIMIT`].
///
/// **Never `org-` or `ws-` at its start**, because those are what mark an organization's database
/// and a workspace's (`setup::held_organization_id`), and a copy read as one would be offered to
/// connect to. The `<id>` is the first [`REMOTE_ID_LENGTH`] characters of the database's id, its
/// name with the `org-` or `ws-` before it dropped, which with the label (`format-` for an
/// organization, `schema-` for a workspace) says whose copy it is. Where the whole would still be
/// longer than the limit, the id is cut rather than the label or the moment, which are what tell
/// one copy of a database from another.
pub(crate) fn remote_name(database: &str, label: &str, at_seconds: i64) -> String {
    let spelled = |part: &str| -> String {
        part.chars()
            .map(|character| match character.to_ascii_lowercase() {
                lower @ ('a'..='z' | '0'..='9') => lower,
                _ => '-',
            })
            .collect()
    };
    let id = database.split_once('-').map_or(database, |(_, id)| id);
    let suffix = format!("-{}-{at_seconds}", spelled(label));
    let room = REMOTE_NAME_LIMIT
        .saturating_sub(REMOTE_PREFIX.len() + suffix.len())
        .min(REMOTE_ID_LENGTH);
    let id: String = spelled(id).chars().take(room).collect();
    let name = format!("{REMOTE_PREFIX}{}{suffix}", id.trim_matches('-'));

    name.chars().take(REMOTE_NAME_LIMIT).collect()
}

/// `name` as an SQL identifier.
fn quoted(name: &str) -> String {
    format!("\"{}\"", name.replace('"', "\"\""))
}

/// One row read from a plain SQLite file through `sqlx`, each value in the storage class it lies
/// in.
#[cfg(test)]
pub(crate) fn values_of(row: &sqlx::sqlite::SqliteRow) -> Vec<turso::Value> {
    use sqlx::{Row, TypeInfo, ValueRef};

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
}

/// Everything the copy at `path` holds, table by table and row by row, read from it as a plain
/// SQLite file, each value in the storage class it lies in: what a test compares with what the
/// database held before its change (tickets 27 and 28).
#[cfg(test)]
pub(crate) async fn contents_of(path: &Path) -> Vec<(String, Vec<Vec<turso::Value>>)> {
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
        let rows = sqlx::query(AssertSqlSafe(format!(
            "SELECT * FROM \"{table}\" ORDER BY rowid"
        )))
        .fetch_all(&mut plain)
        .await
        .expect("the rows");

        contents.push((table, rows.iter().map(values_of).collect()));
    }

    plain.close().await.expect("closed");

    contents
}

#[cfg(test)]
mod tests {
    use std::path::{Path, PathBuf};

    use sqlx::{
        AssertSqlSafe, ConnectOptions, Connection,
        sqlite::{SqliteConnectOptions, SqliteConnection},
    };
    use tokio::sync::Mutex;

    use super::{
        KEPT, PAGE, REMOTE_NAME_LIMIT, Source, directory_of, local_copy, remote_copy, remote_name,
        values_of,
    };
    use crate::{
        error::{Error, RefusalReason},
        organization::setup::held_organization_id,
        sync::turso::platform::{InMemoryPlatform, PlatformError},
    };

    /// One row of `note`, as the copy is read back.
    type Note = (i64, String, f64, Vec<u8>, Option<String>);

    /// A plain SQLite file as the source, one connection so the read is one transaction: the
    /// statements `backup.rs` writes, run against a real schema.
    struct Plain {
        connection: Mutex<SqliteConnection>,
        /// how many rows each page drops from its end, for a source that answers fewer rows than
        /// it counts.
        short: usize,
    }

    impl Source for Plain {
        async fn begin(&self) -> Result<(), Error> {
            sqlx::query("BEGIN")
                .execute(&mut *self.connection.lock().await)
                .await?;

            Ok(())
        }

        async fn read(&self, sql: &str) -> Result<Vec<Vec<turso::Value>>, Error> {
            let mut rows: Vec<Vec<turso::Value>> = sqlx::query(AssertSqlSafe(sql.to_string()))
                .fetch_all(&mut *self.connection.lock().await)
                .await?
                .iter()
                .map(values_of)
                .collect();

            if sql.starts_with("SELECT rowid") {
                rows.truncate(rows.len().saturating_sub(self.short));
            }

            Ok(rows)
        }

        async fn end(&self) -> Result<(), Error> {
            sqlx::query("ROLLBACK")
                .execute(&mut *self.connection.lock().await)
                .await?;

            Ok(())
        }
    }

    /// A source whose every read fails, as a dropped connection does.
    struct Unreachable;

    impl Source for Unreachable {
        async fn begin(&self) -> Result<(), Error> {
            Err(Error::Network {
                message: "the database could not be reached".to_string(),
            })
        }

        async fn read(&self, _: &str) -> Result<Vec<Vec<turso::Value>>, Error> {
            unreachable!("read after a failed begin")
        }

        async fn end(&self) -> Result<(), Error> {
            Ok(())
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

    /// A source in `directory` holding `note` with a value of every storage class and `rows`
    /// plain notes after them, a unique index, a view, and a trigger that would mark every row
    /// inserted after it was made; and what the engine owns, which a copy leaves out.
    async fn source(directory: &Path, rows: usize) -> Plain {
        let mut connection = SqliteConnectOptions::new()
            .filename(directory.join("source.db"))
            .create_if_missing(true)
            .connect()
            .await
            .expect("the source");

        for statement in [
            "CREATE TABLE \"note\" (\"id\" INTEGER PRIMARY KEY, \"body\" TEXT, \"weight\" REAL, \"sealed\" BLOB, \"gone\" TEXT)",
            "CREATE UNIQUE INDEX \"note_body_unique\" ON \"note\" (\"body\")",
            "CREATE VIEW \"heavy\" AS SELECT \"id\" FROM \"note\" WHERE \"weight\" > 1",
            "INSERT INTO \"note\" VALUES (1, 'first', 1.5, x'000102', NULL)",
            "INSERT INTO \"note\" VALUES (2, 'second', -2.25, x'', NULL)",
            "CREATE TABLE \"turso_cdc\" (\"change_id\" INTEGER PRIMARY KEY, \"body\" BLOB)",
            "CREATE INDEX \"cdc_by_body\" ON \"turso_cdc\" (\"body\")",
            "CREATE TABLE \"__turso_internal_seq\" (\"value\" INTEGER PRIMARY KEY)",
            "CREATE TABLE \"__new_note\" (\"id\" INTEGER PRIMARY KEY, \"body\" TEXT)",
            "INSERT INTO \"__new_note\" VALUES (1, 'left by a migration cut short')",
        ] {
            sqlx::query(statement)
                .execute(&mut connection)
                .await
                .expect(statement);
        }

        for id in 0..rows {
            sqlx::query("INSERT INTO \"note\" VALUES (?, ?, 0.5, x'', NULL)")
                .bind(id as i64 + 3)
                .bind(format!("note {id}"))
                .execute(&mut connection)
                .await
                .expect("a note");
        }

        sqlx::query(
            "CREATE TRIGGER \"marked\" AFTER INSERT ON \"note\" BEGIN UPDATE \"note\" SET \"gone\" = 'marked' WHERE \"id\" = NEW.\"id\"; END",
        )
        .execute(&mut connection)
        .await
        .expect("the trigger");

        Plain {
            connection: Mutex::new(connection),
            short: 0,
        }
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

    /// What `path`'s schema holds, as `(type, name)`, sorted.
    async fn schema_in(path: &Path) -> Vec<(String, String)> {
        let mut plain = SqliteConnectOptions::new()
            .filename(path)
            .read_only(true)
            .connect()
            .await
            .expect("the copy opens as a plain file");
        let schema = sqlx::query_as(
            "SELECT type, name FROM sqlite_master WHERE sql IS NOT NULL ORDER BY type, name",
        )
        .fetch_all(&mut plain)
        .await
        .expect("the schema");

        plain.close().await.expect("closed");

        schema
    }

    /// The copy is a plain SQLite file any tool opens, holding every row as the source answered
    /// it, value by value, and it is where the log says it is.
    #[tokio::test]
    async fn a_copy_is_a_plain_file_holding_every_row_as_the_source_answered_it() {
        let data = scratch("plain");
        let path = local_copy(
            &source(&data, 0).await,
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
            ],
            "the trigger ran on the rows copied, so it was made before them"
        );
    }

    /// **Ticket 30's second criterion.** The copy holds every index, view and trigger the source
    /// holds, the unique index among them, and nothing the engine owns; a table under two
    /// underscores that is not the engine's is copied.
    #[tokio::test]
    async fn a_copy_holds_the_indexes_views_and_triggers_and_nothing_of_the_engines() {
        let data = scratch("schema");
        let path = local_copy(&source(&data, 0).await, &data, "ws-1", "schema-3-to-4", 1)
            .await
            .expect("the copy");

        assert_eq!(
            schema_in(&path).await,
            [
                ("index", "note_body_unique"),
                ("table", "__new_note"),
                ("table", "note"),
                ("trigger", "marked"),
                ("view", "heavy"),
            ]
            .map(|(kind, name)| (kind.to_string(), name.to_string()))
            .to_vec()
        );

        let mut plain = SqliteConnectOptions::new()
            .filename(&path)
            .connect()
            .await
            .expect("the copy");
        let duplicate = sqlx::query("INSERT INTO note (id, body) VALUES (9, 'first')")
            .execute(&mut plain)
            .await;

        plain.close().await.expect("closed");

        assert!(duplicate.is_err(), "the copy's index is not unique");
    }

    /// **Ticket 30's first criterion.** A source answering fewer rows than it counts is refused,
    /// as a read that failed, and leaves nothing behind.
    #[tokio::test]
    async fn a_source_answering_fewer_rows_than_it_counts_is_refused() {
        let data = scratch("short");
        let mut short = source(&data, 0).await;

        short.short = 1;

        let refused = local_copy(&short, &data, "org-1", "format-1-to-2", 1)
            .await
            .expect_err("a short read was taken for a copy");

        assert!(
            matches!(
                &refused,
                Error::Refused { reason: RefusalReason::CopyNotTaken, message }
                    if message.contains("could not be read")
            ),
            "{refused:?}"
        );
        assert!(names_in(&directory_of(&data, "org-1")).is_empty());
    }

    /// A table larger than a page is read a page at a time and copied whole.
    #[tokio::test]
    async fn a_table_larger_than_a_page_is_copied_whole() {
        let data = scratch("pages");
        let path = local_copy(
            &source(&data, PAGE * 2).await,
            &data,
            "ws-1",
            "schema-3-to-4",
            1,
        )
        .await
        .expect("the copy");
        let note = super::contents_of(&path)
            .await
            .into_iter()
            .find(|(table, _)| table == "note")
            .expect("note");

        assert_eq!(note.1.len(), PAGE * 2 + 2);
    }

    /// **Ticket 30's fifth criterion.** A directory that cannot be made refuses with
    /// `CopyNotTaken`, naming it, as a copy that could not be written.
    #[tokio::test]
    async fn a_copy_that_cannot_be_written_is_refused_naming_the_directory() {
        let data = scratch("unwritable");
        let plain = source(&data, 0).await;

        // a file where the directory of copies would go, so nothing can be made under it.
        std::fs::write(data.join(super::DIRECTORY_NAME), b"in the way").expect("the obstacle");

        let refused = local_copy(&plain, &data, "org-1", "format-1-to-2", 1)
            .await
            .expect_err("a copy was written under a file");

        assert!(
            matches!(
                &refused,
                Error::Refused { reason: RefusalReason::CopyNotTaken, message }
                    if message.contains("could not be written")
                        && message.contains(&directory_of(&data, "org-1").display().to_string())
            ),
            "{refused:?}"
        );
    }

    /// A source that cannot be reached is refused as one that could not be read, not as a folder
    /// that could not be written.
    #[tokio::test]
    async fn a_source_that_cannot_be_read_is_refused_as_not_read() {
        let data = scratch("unread");
        let refused = local_copy(&Unreachable, &data, "ws-1", "schema-3-to-4", 1)
            .await
            .expect_err("a copy was taken of nothing");

        assert!(
            matches!(
                &refused,
                Error::Refused { reason: RefusalReason::CopyNotTaken, message }
                    if message.contains("could not be read")
                        && !message.contains("could not be written")
            ),
            "{refused:?}"
        );
        assert!(names_in(&directory_of(&data, "ws-1")).is_empty());
    }

    /// Three copies of one database are kept, the newest by the moment each was taken, and a
    /// copy of another database is not counted against them.
    #[tokio::test]
    async fn the_three_newest_copies_of_a_database_are_kept() {
        let data = scratch("kept");
        let plain = source(&data, 0).await;

        for at in [5, 1, 4, 2, 3] {
            local_copy(&plain, &data, "org-1", "format-1-to-2", at)
                .await
                .expect("the copy");
        }

        local_copy(&plain, &data, "ws-1", "schema-3-to-4", 1)
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

    /// **Ticket 30's fourth criterion.** The copy just written is kept even where three copies
    /// carry a newer stamp, as a clock set back would leave them.
    #[tokio::test]
    async fn the_copy_just_written_is_kept_beside_three_newer_ones() {
        let data = scratch("kept-new");
        let plain = source(&data, 0).await;

        for at in [7, 8, 9] {
            local_copy(&plain, &data, "org-1", "format-1-to-2", at)
                .await
                .expect("the copy");
        }

        let path = local_copy(&plain, &data, "org-1", "format-1-to-2", 1)
            .await
            .expect("the copy");

        assert!(path.exists(), "the copy just written was removed");
        assert_eq!(
            names_in(&directory_of(&data, "org-1")),
            vec![
                "format-1-to-2-1.sqlite",
                "format-1-to-2-8.sqlite",
                "format-1-to-2-9.sqlite"
            ]
        );
    }

    /// **Ticket 30's sixth criterion.** The account's copy is named so nothing reading the
    /// account's databases takes it for an organization's or a workspace's, as Turso takes a
    /// name, and within the budget the hostname leaves it.
    #[test]
    fn a_copy_on_the_account_is_named_as_nobody_takes_for_a_database_of_ours() {
        let organization = remote_name(
            "org-7f3a9c0e1d2b4a5f8e7d6c5b4a3f2e1d",
            "format-1-to-2",
            1_758_000_000,
        );
        let workspace = remote_name(
            "ws-c8aa62a6-d4ea-45a6-a317-d2ca2530dd46",
            "schema-10-to-11",
            1_758_000_000,
        );
        let long = remote_name(&"Org".repeat(40), "Schema_3 to 4", 1_758_000_000);

        assert_eq!(organization, "copy-7f3a9c0e-format-1-to-2-1758000000");
        assert_eq!(workspace, "copy-c8aa62a6-schema-10-to-11-1758000000");
        assert!(long.ends_with("-schema-3-to-4-1758000000"), "{long}");

        for name in [&organization, &workspace, &long] {
            assert!(name.len() <= REMOTE_NAME_LIMIT, "{name}");
            assert!(held_organization_id(name).is_none(), "{name}");
            assert!(!name.starts_with("ws-"), "{name}");
            assert!(
                name.chars().all(|character| character.is_ascii_lowercase()
                    || character.is_ascii_digit()
                    || character == '-'),
                "{name}"
            );
            // the hostname's first label, with an account slug of 22 characters.
            assert!(format!("{name}-{}", "a".repeat(22)).len() <= 63, "{name}");
        }
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

        assert_eq!(name, "copy-1-format-1-to-2-1758000000");
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
