//! whether a database is what its version is built as, checked before a change of shape commits.
//!
//! **One check, for both changes of shape** (effort 838, requirement 15): a workspace migration
//! (`organization/migrate.rs`) and an organization's change of format. Each reads the database as
//! it stands inside the transaction that changed it, before the commit, and hands this module
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
//! **The schema is compared as statements, normalised.** Every table, index, view and trigger the
//! application made, read with [`backup::listing`], so what the engine owns is left out by the
//! same [`backup::NOT_THE_ENGINES`] a copy leaves out, and an index SQLite made for a constraint,
//! which has no statement, is carried by its table's. Each object is keyed by its kind and its
//! name, and its statement compared after [`normalised`]: identifier quotes dropped, whitespace
//! collapsed, and case folded outside string literals. Columns are compared in the order the
//! statement lists them, which is the order `PRAGMA table_info` reports, so a column added in
//! another place is a difference. The text is compared rather than `table_info` because it is
//! the whole of what SQLite keeps: defaults, checks, collations and constraints are in it and not
//! all of them are in any pragma. A table the caller keeps outside what a version builds, the
//! organization's allowed extras say, is named with [`Shape::without`] on both sides.

use std::collections::BTreeMap;

use sqlx::{Row, SqliteConnection};

use crate::{
    backup, diagnostics,
    error::{Error, RefusalReason},
};

/// SQLite's check of the file's structure: one row, `ok`, where nothing is wrong.
pub const QUICK_CHECK: &str = "PRAGMA quick_check";

/// Every row whose foreign key names a parent that is not there: none where nothing is wrong.
pub const FOREIGN_KEY_CHECK: &str = "PRAGMA foreign_key_check";

/// How many differences a refusal names before it says how many more there are.
const NAMED: usize = 5;

/// A database's schema as the check compares it: each table, index, view and trigger by kind and
/// name, with its statement [`normalised`].
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Shape {
    objects: BTreeMap<(String, String), String>,
}

impl Shape {
    /// The shape of what [`backup::listing`] answered: each row its kind, its name and its
    /// statement.
    pub fn of<I>(listed: I) -> Self
    where
        I: IntoIterator<Item = (String, String, String)>,
    {
        Self {
            objects: listed
                .into_iter()
                .map(|(kind, name, statement)| ((kind, name), normalised(&statement)))
                .collect(),
        }
    }

    /// This shape without the tables named, and without any index or trigger on them: for a
    /// table a caller keeps beside what a version builds.
    pub fn without(mut self, tables: &[&str]) -> Self {
        self.objects.retain(|(_, name), statement| {
            !tables.iter().any(|table| {
                let table = table.to_ascii_lowercase();

                name.eq_ignore_ascii_case(&table)
                    || statement.contains(&format!(" on {table} "))
                    || statement.contains(&format!(" on {table}("))
            })
        });

        self
    }

    /// What this shape has that `fresh` does not, what `fresh` has that it lacks, and what both
    /// have with different statements, one sentence each, in order of kind and name.
    fn differences(&self, fresh: &Shape) -> Vec<String> {
        let mut differences = Vec::new();

        for ((kind, name), statement) in &self.objects {
            match fresh.objects.get(&(kind.clone(), name.clone())) {
                None => differences.push(format!("{kind} {name} is not in a fresh database")),
                Some(built) if built != statement => {
                    differences.push(format!("{kind} {name} is not as a fresh database has it"))
                }
                Some(_) => {}
            }
        }

        for (kind, name) in fresh.objects.keys() {
            if !self.objects.contains_key(&(kind.clone(), name.clone())) {
                differences.push(format!("{kind} {name} is missing"));
            }
        }

        differences
    }
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

    Ok(Found {
        quick_check,
        foreign_key_violations,
        shape: Shape::of(listed),
    })
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

    use super::{Found, Shape, as_built, normalised, read};
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
        assert_ne!(
            normalised("CREATE TABLE note (id integer, body text)"),
            normalised("CREATE TABLE note (body text, id integer)"),
            "columns in another order are another table"
        );
    }

    /// A database built by the same statements is as built, whatever its engine quoted.
    #[tokio::test]
    async fn a_database_built_as_its_version_passes() {
        let statements = [
            "CREATE TABLE `note` (`id` text PRIMARY KEY NOT NULL, `body` text)",
            "CREATE INDEX `note_body_idx` ON `note` (`body`)",
        ];
        let found = built(&statements).await;
        let fresh = built(&statements).await.shape;

        assert_eq!(found.quick_check, vec!["ok".to_string()]);
        assert_eq!(found.foreign_key_violations, 0);
        as_built("a test database at version 1", &found, &fresh).expect("as built");
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
        assert!(matches!(
            as_built("a test database", &found, &fresh),
            Err(Error::Refused { reason: RefusalReason::ShapeNotAsBuilt, ref message })
                if message.contains("foreign_key_check found 1")
        ));

        let corrupt = Found {
            quick_check: vec!["*** in database main ***".to_string()],
            ..Found::default()
        };

        assert!(matches!(
            as_built("a test database", &corrupt, &Shape::default()),
            Err(Error::Refused { reason: RefusalReason::ShapeNotAsBuilt, ref message })
                if message.contains("quick_check answered *** in database main ***")
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
}
