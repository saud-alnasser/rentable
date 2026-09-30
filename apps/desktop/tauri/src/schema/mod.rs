//! whether a database is what its version is built as, checked before a change of shape commits.
//!
//! **One check, for both changes of shape** (effort 838, requirement 15): a workspace migration
//! (`organization/lease/apply.rs`) and an organization's change of format. Each reads the database
//! as it stands inside the transaction that changed it, before the commit, and hands this module
//! what it read and the shape a fresh database of the same version is built with. Nothing here
//! reaches a database: where the reads go is the caller's, a pipeline for a workspace and the
//! store's own connection for an organization, and so is how the fresh shape is built. A check
//! that fails refuses with `ShapeNotAsBuilt`, and the caller rolls back.
//!
//! **Three things are checked, in the order SQLite's own procedure for a table rebuild checks
//! them.** `PRAGMA quick_check` answering one row, `ok`; `PRAGMA foreign_key_check` answering no
//! rows; and the schema read from `sqlite_master` equal to the fresh one. The first two are the
//! engine's word on the file and its constraints, the third is Room's check: a migration that ran
//! every statement and still left a column, an index or a trigger other than a fresh build makes
//! is a migration that went wrong.
//!
//! **The schema is compared as structure, not as statements** (ticket 38), as Room's `TableInfo`
//! compares it. The fresh database a workspace is compared with is built on a plain SQLite here,
//! while the workspace lives on Turso's server, and the turso engine rewrites a table's statement
//! when it alters one in place: added columns last, quotes dropped, a default where a `NOT NULL`
//! addition needs one. Compared as text, one such difference would refuse every migration for
//! good. So each table is compared by its columns, read with `pragma_table_info`: each column's
//! name, declared type, `NOT NULL` and place in the primary key, whatever their order or defaults.
//! Every index a table has is compared, SQLite's own for a `UNIQUE` or `PRIMARY KEY` constraint
//! included (ticket 41), read with `pragma_index_list` and `pragma_index_info`: by its table, its
//! origin (`c` for one a statement created, `u` or `pk` for a constraint's), its uniqueness,
//! whether it is partial, and its columns in order. One a statement created is known by its name,
//! and its predicate, where it is partial, is compared too: the `WHERE` of its statement
//! [`normalised`]. One SQLite made is known by the rest alone, since its name,
//! `sqlite_autoindex_<table>_<n>`, only counts the table's constraints in the order its statement
//! declares them. Each table's foreign keys are compared by their parent table, their columns
//! paired with the parent's in order, and their `ON UPDATE` and `ON DELETE`, read with
//! `pragma_foreign_key_list`, whatever order the table declares them in. Views and triggers have
//! no pragma, and are compared by their statements [`normalised`]: identifier quotes dropped,
//! whitespace collapsed, and case folded outside string literals. What is compared is what
//! [`backup::listing`] lists, so what the engine owns is left out by the same
//! [`backup::NOT_THE_ENGINES`] a copy leaves out; every index on a listed table is read, whatever
//! it is named, but one the turso engine names as its own. A table the caller keeps outside what a
//! version builds, the organization's allowed extras say, is named with [`Shape::without`] on both
//! sides.
//!
//! **Every engine reads the structure itself**, with the same four statements
//! ([`backup::listing`], [`columns`], [`indexes`] and [`foreign_keys`]): the pipeline inside a
//! workspace's migration, the turso connection for the organization, and `sqlx` for the fresh
//! database a workspace is compared with. The turso engine answers the pragma functions joined
//! over `sqlite_master`, `pragma_index_list`'s `origin` and `partial` and every column of
//! `pragma_foreign_key_list` among them, and makes SQLite's own indexes for a constraint under
//! SQLite's names (measured on 0.8.0-pre.12 at tickets 38 and 41). It spells two things otherwise
//! than SQLite, and each is read as one: a parent key a statement left to the parent's primary key
//! is `''` where SQLite answers null, and an expression in an index is named by its text where
//! SQLite answers null, with the column place `-1` on both. Whether Turso's server answers the
//! same is what the live test at the foot of `organization/lease/apply.rs` measures. An engine that
//! answered nothing would make two databases look alike, so a table or an index the listing names
//! and the pragmas answer nothing for is a difference, never a pass, and so is a table whose
//! statement declares a `REFERENCES` its foreign keys were read without.
//!
//! **The organization is read on the turso engine** ([`read_engine`]), which answers
//! `PRAGMA quick_check` and does not know `PRAGMA foreign_key_check`: an unknown pragma is
//! silently ignored there, as SQLite ignores one, so it answers no rows whatever the rows are.
//! Read as it answers, that is a pass nobody checked. So the pragma is run only where the engine
//! lists it in `PRAGMA pragma_list`, and otherwise the log says it could not be checked and no
//! violation is counted, which the organization's schema makes safe: it declares no foreign key
//! (`organization/store/mod.rs`), and a schema equal to a fresh one declares none either.

mod shape;

pub use shape::*;

use sqlx::{Row, SqliteConnection};

use crate::{
    backup, diagnostics,
    error::{Error, RefusalReason},
};

/// How the turso engine names `foreign_key_check` in `PRAGMA pragma_list`, where it knows it.
const FOREIGN_KEY_CHECK_NAME: &str = "foreign_key_check";

/// SQLite's check of the file's structure: one row, `ok`, where nothing is wrong.
pub const QUICK_CHECK: &str = "PRAGMA quick_check";

/// Every row whose foreign key names a parent that is not there: none where nothing is wrong.
pub const FOREIGN_KEY_CHECK: &str = "PRAGMA foreign_key_check";

/// How many differences a refusal names before it says how many more there are.
const NAMED: usize = 5;

/// Every column of every table [`backup::listing`] lists: its table, its name, its declared type,
/// whether it is `NOT NULL`, and its place in the primary key, 0 where it is not in it.
pub fn columns() -> String {
    format!(
        "SELECT t.name, c.name, c.type, c.\"notnull\", c.pk \
         FROM (SELECT name FROM sqlite_master \
         WHERE type = 'table' AND sql IS NOT NULL AND {}) AS t, \
         pragma_table_info(t.name) AS c \
         ORDER BY t.name, c.cid",
        backup::NOT_THE_ENGINES
    )
}

/// Every column of every index on every table [`backup::listing`] lists, SQLite's own for a
/// constraint included, in the index's order: its table, its index, the index's origin (`c`, `u`
/// or `pk`), whether it is unique and whether it is partial, and the column's place in the table
/// and its name, `-1` and none for an expression (the turso engine names one by its text).
pub fn indexes() -> String {
    format!(
        "SELECT t.name, l.name, l.origin, l.\"unique\", l.partial, c.cid, c.name \
         FROM (SELECT name FROM sqlite_master \
         WHERE type = 'table' AND sql IS NOT NULL AND {}) AS t, \
         pragma_index_list(t.name) AS l, \
         pragma_index_info(l.name) AS c \
         WHERE l.name NOT LIKE 'turso!_%' ESCAPE '!' \
         AND l.name NOT LIKE '!_!_turso!_internal!_%' ESCAPE '!' \
         ORDER BY t.name, l.name, c.seqno",
        backup::NOT_THE_ENGINES
    )
}

/// Every column of every foreign key of every table [`backup::listing`] lists, in the key's
/// order: its table, the key's number and the column's place in it, the parent table, the column,
/// the parent's column (none, or `''` on the turso engine, where the statement left it to the
/// parent's primary key), and the key's `ON UPDATE` and `ON DELETE`.
pub fn foreign_keys() -> String {
    format!(
        "SELECT t.name, f.id, f.seq, f.\"table\", f.\"from\", f.\"to\", f.on_update, \
         f.on_delete \
         FROM (SELECT name FROM sqlite_master \
         WHERE type = 'table' AND sql IS NOT NULL AND {}) AS t, \
         pragma_foreign_key_list(t.name) AS f \
         ORDER BY t.name, f.id, f.seq",
        backup::NOT_THE_ENGINES
    )
}

/// What the check reads of a database inside the transaction that changed it.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Found {
    /// each row [`QUICK_CHECK`] answered.
    pub quick_check: Vec<String>,
    /// how many rows [`FOREIGN_KEY_CHECK`] answered.
    pub foreign_key_violations: usize,
    /// the schema as it stands.
    pub shape: Shape,
}

/// Refuse with `ShapeNotAsBuilt` unless `found` is a database whose structure SQLite passes and
/// whose schema is `fresh`. `what` names the database and its version, for the message and the
/// log, which both say what differs.
pub fn as_built(what: &str, found: &Found, fresh: &Shape) -> Result<(), Error> {
    let mut differences = Vec::new();

    if found.quick_check != ["ok"] {
        differences.push(format!(
            "quick_check answered {}",
            if found.quick_check.is_empty() {
                "nothing".to_string()
            } else {
                found.quick_check.join(", ")
            }
        ));
    }

    if found.foreign_key_violations > 0 {
        differences.push(format!(
            "foreign_key_check found {} rows naming a parent that is not there",
            found.foreign_key_violations
        ));
    }

    differences.extend(found.shape.differences(fresh));

    if differences.is_empty() {
        return Ok(());
    }

    let all = differences.join("; ");

    diagnostics::error("schema.notAsBuilt")
        .with("what", what)
        .with("differences", all.as_str())
        .write();

    let named = if differences.len() > NAMED {
        format!(
            "{}; and {} more",
            differences[..NAMED].join("; "),
            differences.len() - NAMED
        )
    } else {
        all
    };

    Err(Error::refused(
        RefusalReason::ShapeNotAsBuilt,
        format!(
            "{what} is not what a fresh database of that version is: {named}. nothing was kept"
        ),
    ))
}

/// What the check reads of a plain SQLite connection: the fresh database a version is built as,
/// or a test's.
pub async fn read(connection: &mut SqliteConnection) -> Result<Found, Error> {
    let quick_check = sqlx::query(QUICK_CHECK)
        .fetch_all(&mut *connection)
        .await?
        .iter()
        .map(|row| row.try_get::<String, _>(0))
        .collect::<Result<Vec<String>, sqlx::Error>>()?;
    let foreign_key_violations = sqlx::query(FOREIGN_KEY_CHECK)
        .fetch_all(&mut *connection)
        .await?
        .len();
    let listed = sqlx::query(sqlx::AssertSqlSafe(backup::listing()))
        .fetch_all(&mut *connection)
        .await?
        .iter()
        .map(|row| Ok((row.try_get(0)?, row.try_get(1)?, row.try_get(2)?)))
        .collect::<Result<Vec<(String, String, String)>, sqlx::Error>>()?;
    let columns = sqlx::query(sqlx::AssertSqlSafe(columns()))
        .fetch_all(&mut *connection)
        .await?
        .iter()
        .map(|row| {
            Ok((
                row.try_get(0)?,
                row.try_get(1)?,
                row.try_get(2)?,
                row.try_get::<i64, _>(3)? != 0,
                row.try_get(4)?,
            ))
        })
        .collect::<Result<Vec<ColumnRow>, sqlx::Error>>()?;
    let indexes = sqlx::query(sqlx::AssertSqlSafe(indexes()))
        .fetch_all(&mut *connection)
        .await?
        .iter()
        .map(|row| {
            Ok((
                row.try_get(0)?,
                row.try_get(1)?,
                row.try_get(2)?,
                row.try_get::<i64, _>(3)? != 0,
                row.try_get::<i64, _>(4)? != 0,
                row.try_get(5)?,
                row.try_get(6)?,
            ))
        })
        .collect::<Result<Vec<IndexRow>, sqlx::Error>>()?;
    let foreign_keys = sqlx::query(sqlx::AssertSqlSafe(foreign_keys()))
        .fetch_all(&mut *connection)
        .await?
        .iter()
        .map(|row| {
            Ok((
                row.try_get(0)?,
                row.try_get(1)?,
                row.try_get(2)?,
                row.try_get(3)?,
                row.try_get(4)?,
                row.try_get(5)?,
                row.try_get(6)?,
                row.try_get(7)?,
            ))
        })
        .collect::<Result<Vec<ForeignKeyRow>, sqlx::Error>>()?;

    Ok(Found {
        quick_check,
        foreign_key_violations,
        shape: Shape::of(listed, columns, indexes, foreign_keys),
    })
}

/// What the check reads of a turso connection: the organization's replica inside the transaction
/// that changed its format, or the fresh organization it is compared with. `PRAGMA
/// foreign_key_check` is run only where the engine lists it, as this module's comment says.
pub async fn read_engine(connection: &turso::Connection) -> Result<Found, Error> {
    let quick_check = values(connection, QUICK_CHECK)
        .await?
        .iter()
        .map(|row| text(row, 0))
        .collect::<Result<Vec<String>, Error>>()?;
    let listed = values(connection, "PRAGMA pragma_list")
        .await?
        .iter()
        .any(|row| {
            text(row, 0).is_ok_and(|name| name.eq_ignore_ascii_case(FOREIGN_KEY_CHECK_NAME))
        });
    let foreign_key_violations = if listed {
        values(connection, FOREIGN_KEY_CHECK).await?.len()
    } else {
        // the engine does not know the pragma and would answer nothing: not a pass, so it is
        // logged as not checked, and the schema compared below declares no foreign key.
        diagnostics::info("schema.foreignKeysNotCheckable")
            .with("pragma", FOREIGN_KEY_CHECK)
            .write();

        0
    };
    let shape = Shape::of_values(
        &values(connection, &backup::listing()).await?,
        &values(connection, &columns()).await?,
        &values(connection, &indexes()).await?,
        &values(connection, &foreign_keys()).await?,
    )?;

    Ok(Found {
        quick_check,
        foreign_key_violations,
        shape,
    })
}

/// Every row `sql` answers on `connection`, each value as the engine holds it.
async fn values(
    connection: &turso::Connection,
    sql: &str,
) -> Result<Vec<Vec<turso::Value>>, Error> {
    let mut rows = connection.query(sql, ()).await?;
    let mut answered = Vec::new();

    while let Some(row) = rows.next().await? {
        answered.push(
            (0..row.column_count())
                .map(|index| row.get_value(index))
                .collect::<Result<Vec<turso::Value>, turso::Error>>()?,
        );
    }

    Ok(answered)
}

/// A statement as the check compares it: identifier quotes (`"`, `` ` ``, `[`, `]`) dropped, every
/// run of whitespace one space and none beside `(`, `)` or `,`, ASCII case folded, a trailing `;`
/// dropped; all of it outside single-quoted string literals, which are kept as they are.
pub fn normalised(statement: &str) -> String {
    let mut out = String::with_capacity(statement.len());
    let mut in_literal = false;
    let mut pending_space = false;

    for character in statement.trim().trim_end_matches(';').trim_end().chars() {
        if in_literal {
            out.push(character);

            if character == '\'' {
                in_literal = false;
            }

            continue;
        }

        match character {
            '"' | '`' | '[' | ']' => {}
            '\'' => {
                if pending_space && !out.is_empty() && !out.ends_with(['(', ',']) {
                    out.push(' ');
                }

                pending_space = false;
                in_literal = true;
                out.push(character);
            }
            whitespace if whitespace.is_whitespace() => pending_space = true,
            '(' | ')' | ',' => {
                pending_space = false;

                if out.ends_with(' ') {
                    out.pop();
                }

                out.push(character);
            }
            other => {
                if pending_space && !out.is_empty() && !out.ends_with(['(', ',']) {
                    out.push(' ');
                }

                pending_space = false;
                out.push(other.to_ascii_lowercase());
            }
        }
    }

    out
}

#[cfg(test)]
mod tests {
    use sqlx::{ConnectOptions, sqlite::SqliteConnectOptions};

    use super::{Found, Shape, as_built, normalised, read, read_engine};
    use crate::error::{Error, RefusalReason};

    async fn memory() -> sqlx::SqliteConnection {
        use std::str::FromStr;

        SqliteConnectOptions::from_str("sqlite::memory:")
            .expect("options")
            .foreign_keys(false)
            .connect()
            .await
            .expect("an in-memory database")
    }

    async fn built(statements: &[&str]) -> Found {
        let mut connection = memory().await;

        for statement in statements {
            sqlx::query(sqlx::AssertSqlSafe(*statement))
                .execute(&mut connection)
                .await
                .expect("a statement");
        }

        read(&mut connection).await.expect("the read")
    }

    /// The same statements run on the turso engine, and read there.
    async fn built_on_the_engine(statements: &[&str]) -> Found {
        let database = turso::Builder::new_local(":memory:")
            .build()
            .await
            .expect("an in-memory engine");
        let connection = database.connect().expect("a connection");

        for statement in statements {
            connection
                .execute(statement, ())
                .await
                .expect("a statement");
        }

        read_engine(&connection).await.expect("the read")
    }

    /// Whether `found` is refused against `fresh`, with a message holding `naming`.
    fn refused_naming(found: &Found, fresh: &Shape, naming: &str) -> bool {
        matches!(
            as_built("a test database", found, fresh),
            Err(Error::Refused { reason: RefusalReason::ShapeNotAsBuilt, ref message })
                if message.contains(naming)
        )
    }

    #[test]
    fn a_statement_is_compared_without_its_quotes_spacing_or_case() {
        assert_eq!(
            normalised(
                "CREATE TABLE `note` (\n\t`id` integer PRIMARY KEY NOT NULL,\n\t`body` text DEFAULT 'A  b'\n);"
            ),
            "create table note(id integer primary key not null,body text default 'A  b')"
        );
        assert_eq!(
            normalised(
                "CREATE TABLE \"note\" ( \"id\" INTEGER PRIMARY KEY NOT NULL , \"body\" TEXT DEFAULT 'A  b' )"
            ),
            normalised(
                "create table [note](id integer primary key not null,body text default 'A  b')"
            )
        );
    }

    /// A database built by the same statements is as built, whatever its engine quoted.
    #[tokio::test]
    async fn a_database_built_as_its_version_passes() {
        let statements = [
            "CREATE TABLE `note` (`id` text PRIMARY KEY NOT NULL, `body` text)",
            "CREATE INDEX `note_body_idx` ON `note` (`body`)",
            "CREATE VIEW `bodies` AS SELECT `body` FROM `note`",
        ];
        let found = built(&statements).await;
        let fresh = built(&statements).await.shape;

        assert_eq!(found.quick_check, vec!["ok".to_string()]);
        assert_eq!(found.foreign_key_violations, 0);
        as_built("a test database at version 1", &found, &fresh).expect("as built");
    }

    /// **Ticket 38's first criterion, what is equal.** Two statements of one table, its columns in
    /// another order, with defaults on one side, quoted otherwise and cased otherwise, and a
    /// constraint's own index made by another spelling of the constraint, compare equal: a table
    /// is its columns' names, declared types, `NOT NULL` and primary key places.
    #[tokio::test]
    async fn one_table_in_another_column_order_and_with_defaults_compares_equal() {
        let fresh = built(&[
            "CREATE TABLE `note` (`id` text PRIMARY KEY NOT NULL, `body` text NOT NULL, \
             `pinned` integer, `code` text UNIQUE)",
            "CREATE UNIQUE INDEX `note_body_pinned` ON `note` (`body`, `pinned`)",
        ])
        .await
        .shape;
        let found = built(&[
            "CREATE TABLE note (code TEXT, id TEXT NOT NULL PRIMARY KEY, \
             PINNED INTEGER DEFAULT 0, body TEXT NOT NULL DEFAULT '', UNIQUE (code))",
            "CREATE UNIQUE INDEX note_body_pinned ON note (body, pinned)",
        ])
        .await;

        as_built("a test database", &found, &fresh).expect("the same table, spelled otherwise");
    }

    /// **Ticket 38's first criterion, what differs.** Against one fresh table and its index, a
    /// missing column, a changed type, a lost `NOT NULL`, a column moved out of the primary key and
    /// a missing index are each refused, naming what differs.
    #[tokio::test]
    async fn a_missing_column_a_changed_type_a_lost_not_null_and_a_missing_index_each_differ() {
        let fresh = built(&[
            "CREATE TABLE note (id text PRIMARY KEY NOT NULL, body text NOT NULL, pinned integer)",
            "CREATE INDEX note_body ON note (body)",
        ])
        .await
        .shape;
        let index = "CREATE INDEX note_body ON note (body)";
        let cases = [
            (
                [
                    "CREATE TABLE note (id text PRIMARY KEY NOT NULL, body text NOT NULL)",
                    index,
                ],
                "table note is not as a fresh database has it (column pinned is missing)",
            ),
            (
                [
                    "CREATE TABLE note (id text PRIMARY KEY NOT NULL, body blob NOT NULL, \
                     pinned integer)",
                    index,
                ],
                "(column body is blob where a fresh one is text)",
            ),
            (
                [
                    "CREATE TABLE note (id text PRIMARY KEY NOT NULL, body text, pinned integer)",
                    index,
                ],
                "(column body may be null where a fresh one is not null)",
            ),
            (
                [
                    "CREATE TABLE note (id text NOT NULL, body text NOT NULL, pinned integer)",
                    index,
                ],
                "(column id is not in the primary key where a fresh one is primary key place 1)",
            ),
            (
                [
                    "CREATE TABLE note (id text PRIMARY KEY NOT NULL, body text NOT NULL, \
                     pinned integer)",
                    "SELECT 1",
                ],
                "index note_body is missing",
            ),
        ];

        for (statements, naming) in cases {
            let found = built(&statements).await;

            assert!(
                refused_naming(&found, &fresh, naming),
                "{naming}: {:?}",
                as_built("a test database", &found, &fresh)
            );
        }
    }

    /// An index is its table, its uniqueness and its columns in order: each of those changed is a
    /// difference, and so is a view whose statement changed.
    #[tokio::test]
    async fn an_index_by_its_uniqueness_and_column_order_and_a_view_by_its_text() {
        let table = "CREATE TABLE note (id integer PRIMARY KEY, body text, pinned integer)";
        let fresh = built(&[
            table,
            "CREATE INDEX note_body ON note (body, pinned)",
            "CREATE VIEW bodies AS SELECT body FROM note",
        ])
        .await
        .shape;

        for (index, view) in [
            (
                "CREATE UNIQUE INDEX note_body ON note (body, pinned)",
                "CREATE VIEW bodies AS SELECT body FROM note",
            ),
            (
                "CREATE INDEX note_body ON note (pinned, body)",
                "CREATE VIEW bodies AS SELECT body FROM note",
            ),
        ] {
            let found = built(&[table, index, view]).await;

            assert!(
                refused_naming(&found, &fresh, "index note_body is not as a fresh database"),
                "{index}"
            );
        }

        let found = built(&[
            table,
            "CREATE INDEX note_body ON note (body, pinned)",
            "CREATE VIEW bodies AS SELECT pinned FROM note",
        ])
        .await;

        assert!(refused_naming(
            &found,
            &fresh,
            "view bodies is not as a fresh database has it"
        ));
    }

    /// An extra table, a missing index and a changed column are each named, and the refusal is
    /// `ShapeNotAsBuilt`.
    #[tokio::test]
    async fn a_schema_other_than_a_fresh_one_is_refused_naming_what_differs() {
        let fresh = built(&[
            "CREATE TABLE note (id text PRIMARY KEY NOT NULL, body text)",
            "CREATE INDEX note_body_idx ON note (body)",
        ])
        .await
        .shape;
        let found = built(&[
            "CREATE TABLE note (id text PRIMARY KEY NOT NULL, body integer)",
            "CREATE TABLE stray (id integer)",
        ])
        .await;
        let refused = as_built("a test database at version 1", &found, &fresh);

        assert!(
            matches!(
                &refused,
                Err(Error::Refused { reason: RefusalReason::ShapeNotAsBuilt, message })
                    if message.contains("table stray is not in a fresh database")
                        && message.contains("index note_body_idx is missing")
                        && message.contains("table note is not as a fresh database has it")
            ),
            "{refused:?}"
        );
    }

    /// A row naming a parent that is not there, and a quick check that answers anything but `ok`,
    /// each refuse.
    #[tokio::test]
    async fn a_broken_foreign_key_or_a_failed_quick_check_is_refused() {
        let statements = [
            "CREATE TABLE parent (id integer PRIMARY KEY)",
            "CREATE TABLE child (id integer PRIMARY KEY, parent_id integer REFERENCES parent(id))",
            "INSERT INTO child VALUES (1, 7)",
        ];
        let found = built(&statements).await;
        let fresh = found.shape.clone();

        assert_eq!(found.foreign_key_violations, 1);
        assert!(refused_naming(&found, &fresh, "foreign_key_check found 1"));

        let corrupt = Found {
            quick_check: vec!["*** in database main ***".to_string()],
            ..Found::default()
        };

        assert!(refused_naming(
            &corrupt,
            &Shape::default(),
            "quick_check answered *** in database main ***"
        ));
    }

    /// A table kept beside a version's schema is left out of both sides with its indexes.
    #[tokio::test]
    async fn a_table_named_as_kept_beside_the_schema_is_not_compared() {
        let fresh = built(&["CREATE TABLE note (id integer)"]).await.shape;
        let found = built(&[
            "CREATE TABLE note (id integer)",
            "CREATE TABLE kept (id integer)",
            "CREATE INDEX kept_id ON kept (id)",
        ])
        .await;
        let kept = Found {
            shape: found.shape.clone().without(&["kept"]),
            ..found
        };

        as_built("a test database", &kept, &fresh.without(&["kept"])).expect("as built");
    }

    /// **Why structure and not text.** A table the turso engine altered in place, its added column
    /// last with the default a `NOT NULL` addition needs, and its statement rewritten by the
    /// engine, compares equal to the same table created whole on a plain SQLite; the engine reads
    /// the structure through the same pragmas.
    #[tokio::test]
    async fn a_table_altered_on_the_engine_compares_equal_to_one_created_whole_on_sqlite() {
        let fresh = built(&[
            "CREATE TABLE \"member\" (\"id\" TEXT PRIMARY KEY NOT NULL, \
             \"role_id\" TEXT NOT NULL, \"name\" TEXT)",
            "CREATE INDEX \"member_role\" ON \"member\" (\"role_id\")",
        ])
        .await
        .shape;
        let found = built_on_the_engine(&[
            "CREATE TABLE member (id TEXT NOT NULL PRIMARY KEY, name TEXT)",
            "ALTER TABLE member ADD COLUMN role_id TEXT NOT NULL DEFAULT 'member'",
            "CREATE INDEX member_role ON member (role_id)",
        ])
        .await;

        assert_eq!(found.quick_check, vec!["ok".to_string()]);
        as_built("a test database", &found, &fresh).expect("the same table, altered in place");

        let without_the_index = built_on_the_engine(&[
            "CREATE TABLE member (id TEXT NOT NULL PRIMARY KEY, name TEXT)",
            "ALTER TABLE member ADD COLUMN role_id TEXT NOT NULL DEFAULT 'member'",
        ])
        .await;

        assert!(refused_naming(
            &without_the_index,
            &fresh,
            "index member_role is missing"
        ));
    }

    /// A table or an index the listing names and the pragmas answer nothing for is a difference,
    /// on either side, so an engine that answered nothing never reads as a pass.
    #[test]
    fn a_table_the_pragmas_answer_nothing_for_is_never_a_pass() {
        let unread = Shape::of(
            [(
                "table".to_string(),
                "note".to_string(),
                "CREATE TABLE note (id integer)".to_string(),
            )],
            [],
            [],
            [],
        );
        let found = Found {
            quick_check: vec!["ok".to_string()],
            shape: unread.clone(),
            ..Found::default()
        };

        assert!(refused_naming(
            &found,
            &unread,
            "the database's table note answered nothing to its pragma"
        ));
        assert!(refused_naming(
            &Found {
                shape: Shape::default(),
                ..found
            },
            &unread,
            "a fresh database's table note answered nothing to its pragma"
        ));
    }

    /// **Ticket 41's first criterion.** A rebuild that lost an inline `UNIQUE`, a `REFERENCES` or a
    /// partial index's predicate is each a difference, though every column and every index name is
    /// as a fresh database has it; SQLite's own index for a constraint is compared by what it is.
    #[tokio::test]
    async fn a_lost_unique_a_lost_references_and_a_lost_predicate_each_differ() {
        let parent = "CREATE TABLE parent (id text PRIMARY KEY NOT NULL)";
        let child = "CREATE TABLE child (id integer PRIMARY KEY, \
                     parent_id text REFERENCES parent(id) ON DELETE CASCADE, \
                     code text UNIQUE, pinned integer)";
        let partial = "CREATE INDEX child_pinned ON child (code) WHERE pinned = 1";
        let fresh = built(&[parent, child, partial]).await.shape;
        let cases = [
            (
                [
                    parent,
                    "CREATE TABLE child (id integer PRIMARY KEY, \
                     parent_id text REFERENCES parent(id) ON DELETE CASCADE, \
                     code text, pinned integer)",
                    partial,
                ],
                "table child is missing the index of its unique constraint on (code)",
            ),
            (
                [
                    parent,
                    "CREATE TABLE child (id integer PRIMARY KEY, parent_id text, \
                     code text UNIQUE, pinned integer)",
                    partial,
                ],
                "table child is missing its foreign key (parent_id) references parent(id) on \
                 update no action on delete cascade",
            ),
            (
                [
                    parent,
                    "CREATE TABLE child (id integer PRIMARY KEY, \
                     parent_id text REFERENCES parent(id), code text UNIQUE, pinned integer)",
                    partial,
                ],
                "table child is missing its foreign key (parent_id) references parent(id) on \
                 update no action on delete cascade",
            ),
            (
                [parent, child, "CREATE INDEX child_pinned ON child (code)"],
                "index child_pinned is not as a fresh database has it (on child(code), where a \
                 fresh one is on child(code) where pinned = 1)",
            ),
            (
                [
                    parent,
                    child,
                    "CREATE INDEX child_pinned ON child (code) WHERE pinned = 0",
                ],
                "index child_pinned is not as a fresh database has it",
            ),
        ];

        as_built(
            "a test database",
            &built(&[parent, child, partial]).await,
            &fresh,
        )
        .expect("the same statements");

        for (statements, naming) in cases {
            let found = built(&statements).await;

            assert!(
                refused_naming(&found, &fresh, naming),
                "{naming}: {:?}",
                as_built("a test database", &found, &fresh)
            );
        }
    }

    /// SQLite's own index for a constraint is known by what it is and not by its name, which
    /// counts the table's constraints in the order its statement declares them; and a table's
    /// foreign keys by what they are, whatever order it declares them in.
    #[tokio::test]
    async fn constraints_declared_in_another_order_compare_equal() {
        let fresh = built(&[
            "CREATE TABLE parent (id text PRIMARY KEY NOT NULL)",
            "CREATE TABLE child (id text PRIMARY KEY NOT NULL, a text UNIQUE, b text UNIQUE, \
             p text REFERENCES parent(id), q text REFERENCES parent)",
        ])
        .await
        .shape;
        let found = built(&[
            "CREATE TABLE parent (id text PRIMARY KEY NOT NULL)",
            "CREATE TABLE child (q text REFERENCES parent, b text UNIQUE, \
             p text REFERENCES parent(id), a text UNIQUE, id text PRIMARY KEY NOT NULL)",
        ])
        .await;

        as_built("a test database", &found, &fresh).expect("the same constraints, reordered");
    }

    /// **Ticket 41, the engines agree.** A table with an inline `UNIQUE`, a `REFERENCES` to a
    /// parent's column and one to its primary key, a partial index and an index on an expression,
    /// built on the turso engine, compares equal to the same built on a plain SQLite, though the
    /// engine spells the implicit parent key and the expression otherwise; built without the
    /// `UNIQUE` or the `REFERENCES` there, it differs.
    #[tokio::test]
    async fn constraints_keys_and_partial_indexes_read_on_the_engine_as_on_sqlite() {
        let parent = "CREATE TABLE parent (id TEXT PRIMARY KEY NOT NULL)";
        let indexes = [
            "CREATE INDEX child_pinned ON child (code) WHERE pinned > 1",
            "CREATE UNIQUE INDEX child_lower ON child (lower(code))",
        ];
        let child = "CREATE TABLE child (id INTEGER PRIMARY KEY, \
                     parent_id TEXT REFERENCES parent(id) ON DELETE CASCADE, \
                     owner TEXT REFERENCES parent, code TEXT UNIQUE, pinned INTEGER)";
        let fresh = built(&[parent, child, indexes[0], indexes[1]]).await.shape;
        let found = built_on_the_engine(&[parent, child, indexes[0], indexes[1]]).await;

        as_built("a test database", &found, &fresh).expect("the same schema on the engine");

        for (table, naming) in [
            (
                "CREATE TABLE child (id INTEGER PRIMARY KEY, \
                 parent_id TEXT REFERENCES parent(id) ON DELETE CASCADE, \
                 owner TEXT REFERENCES parent, code TEXT, pinned INTEGER)",
                "table child is missing the index of its unique constraint on (code)",
            ),
            (
                "CREATE TABLE child (id INTEGER PRIMARY KEY, \
                 parent_id TEXT REFERENCES parent(id) ON DELETE CASCADE, \
                 owner TEXT, code TEXT UNIQUE, pinned INTEGER)",
                "table child is missing its foreign key (owner) references parent on update",
            ),
        ] {
            let found = built_on_the_engine(&[parent, table, indexes[0], indexes[1]]).await;

            assert!(
                refused_naming(&found, &fresh, naming),
                "{naming}: {:?}",
                as_built("a test database", &found, &fresh)
            );
        }
    }

    /// A table whose statement declares a `REFERENCES` its foreign keys were read without is a
    /// difference, so an engine that answered nothing to the pragma never reads as a pass.
    #[test]
    fn a_reference_the_pragma_answers_nothing_for_is_never_a_pass() {
        let unread = Shape::of(
            [(
                "table".to_string(),
                "child".to_string(),
                "CREATE TABLE child (parent_id integer REFERENCES parent(id))".to_string(),
            )],
            [(
                "child".to_string(),
                "parent_id".to_string(),
                "integer".to_string(),
                false,
                0,
            )],
            [],
            [],
        );
        let found = Found {
            quick_check: vec!["ok".to_string()],
            shape: unread.clone(),
            ..Found::default()
        };

        assert!(refused_naming(
            &found,
            &unread,
            "the database's table child declares a foreign key its pragma answered nothing for"
        ));
    }
}
