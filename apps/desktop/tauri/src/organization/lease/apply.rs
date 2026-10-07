//! applying the workspace schema to a database on the customer's account, over the wire.
//!
//! **A client applies the migrations, over the database's HTTP endpoint.** The shipped `.sql`
//! files are embedded by `build.rs` in the order `drizzle-kit` numbers them, split at its
//! statement breakpoints, and posted to the database's own HTTP endpoint. A sync connection cannot carry them:
//! `0003` drops and renames tables, and the push that follows fails with *no such table*, measured
//! on 2026-08-20 (#552). So they go over `/v2/pipeline`, which `database/test/workspace.rs` had
//! already proved for its own tests, and which is promoted here rather than written a second time.
//!
//! **A migration commits whole, checked, with its version inside, or not at all** (effort 838,
//! requirement 15, ticket 32). The statements used to go as one pipeline request with no
//! transaction, and the pipeline runs every request of a request whatever the one before it
//! answered, so a statement refused part way left the ones before it committed and the ones after
//! it tried; the version was kept only in the organization, a different database from the schema,
//! and a retry replayed a tail that was half there. Now [`apply_between`] holds one stream by its
//! baton ([`OverThePipeline`], `organization/workspace/remote.rs`) and sends, in order:
//!
//! 1. `BEGIN`, the one-row [`VERSION_TABLE`] made where it is missing, and its row read. The
//!    workspace's own row is the version it is at; a workspace migrated before the table existed
//!    has none, and is at the version its caller says, which is the organization's record.
//! 2. Where that version is already the one asked for, `ROLLBACK`: nothing is applied, and the
//!    caller brings the organization's record up. Where it is above, `ROLLBACK` and
//!    `WorkspaceNewer`, as an older build opening a newer workspace is refused.
//! 3. Otherwise the tail after it as one batch, each statement run only where the one before it
//!    answered `ok`, so nothing runs after a refusal; and the check's reads (`schema/`):
//!    `quick_check`, `foreign_key_check`, and the schema's structure (each table's columns,
//!    each index's columns, each view's and trigger's statement), compared with a fresh database
//!    of the version asked for, which is the embedded migrations applied to an in-memory SQLite
//!    ([`fresh`]). Structure, not statement text (ticket 38): the server may record a statement
//!    otherwise than a plain SQLite does, and the same table compares equal either way.
//! 4. The version row written and `COMMIT`, and the stream closed.
//!
//! Every answer is read statement by statement, since the pipeline answers 200 with a refusal
//! inside, and any failure sends `ROLLBACK` and closes the stream: the workspace is then exactly
//! as it was, and a second attempt applies the whole tail. *Whether libSQL's server takes every
//! statement of `0003` inside one explicit transaction, and answers the check's pragma reads, was
//! not measured when this was written; the `#[ignore]`d live test at the foot of this file's
//! tests does so, armed by `RENTABLE_LIVE_TURSO=1`, and is the human's to run.*
//!
//! What is here is the runner. Which client applies a *pending* migration to a workspace that
//! already has rows, and under what lease, is `organization/lease/`; creating a workspace
//! already at the current schema is [`apply`], which is the same transaction from nothing.
//!
//! **The same stream is what a workspace is copied over** before a pending migration changes it
//! (effort 838, tickets 28 and 30). [`OverThePipeline`] answers `backup.rs` the workspace's schema
//! and rows with the credential the migration goes over, in one transaction on one stream held
//! across requests, each value decoded from the pipeline's typed JSON into the storage class the
//! database holds it in, so the copy keeps integers, reals, text, blobs and nulls apart. *The
//! client was written here, and moved to `organization/workspace/remote.rs` with effort 846, ticket
//! 11, when a workspace that is not open came to be read and written over it as well.*

use std::{
    collections::HashMap,
    str::FromStr,
    sync::{Mutex, OnceLock, PoisonError},
};

use serde_json::{Value, json};
use sqlx::{ConnectOptions, sqlite::SqliteConnectOptions};

use crate::{
    backup, diagnostics,
    error::{Error, RefusalReason},
    organization::workspace::remote::{
        OverThePipeline, Pipeline, decoded, decoded_row, decoded_rows, execute, refused_at,
        rows_of, unreadable,
    },
    schema::{self, Found, Shape},
};

include!(concat!(env!("OUT_DIR"), "/workspace-migrations.rs"));

/// `drizzle-kit`'s own separator, which both runners split on.
const STATEMENT_BREAKPOINT: &str = "--> statement-breakpoint";

/// The one-row table a workspace keeps its own schema version in, the application's and not the
/// engine's: a copy carries it as it carries every other table.
pub const VERSION_TABLE: &str = "schema_version";

/// The version table, made where it is missing. Part of every version's shape from ticket 32 on,
/// so [`fresh`] makes it too.
const VERSION_MADE: &str = "CREATE TABLE IF NOT EXISTS \"schema_version\" (\
                            \"id\" INTEGER PRIMARY KEY CHECK (\"id\" = 1), \
                            \"version\" INTEGER NOT NULL)";

/// The workspace's own version: one row, or none before the table was first written.
const VERSION_READ: &str = "SELECT \"version\" FROM \"schema_version\" WHERE \"id\" = 1";

/// The row saying the workspace is at `version`, written in the transaction that brought it there.
fn version_written(version: usize) -> String {
    format!(
        "INSERT INTO \"schema_version\" (\"id\", \"version\") VALUES (1, {version}) \
         ON CONFLICT(\"id\") DO UPDATE SET \"version\" = excluded.\"version\""
    )
}

/// How many migrations ship, which is what a workspace created here is recorded as being at.
pub fn shipped_version() -> i64 {
    WORKSPACE_MIGRATIONS.len() as i64
}

/// The statements of the first `up_to` shipped migrations, in order.
pub fn statements(up_to: usize) -> Vec<String> {
    statements_between(0, up_to)
}

/// The statements of the shipped migrations after the first `from` and up to `up_to`, in
/// order: what a workspace recorded at `from` needs to reach `up_to`.
pub fn statements_between(from: usize, up_to: usize) -> Vec<String> {
    WORKSPACE_MIGRATIONS
        .iter()
        .take(up_to)
        .skip(from)
        .flat_map(|(_, sql)| {
            sql.split(STATEMENT_BREAKPOINT)
                .map(|statement| statement.trim().to_string())
                .filter(|statement| !statement.is_empty())
                .collect::<Vec<String>>()
        })
        .collect()
}

/// The shape a fresh workspace database at `version` is built with: the first `version` shipped
/// migrations and the version table, applied to an in-memory SQLite. Built once per version per
/// process, since it is the same every time.
pub async fn fresh(version: usize) -> Result<Shape, Error> {
    static BUILT: OnceLock<Mutex<HashMap<usize, Shape>>> = OnceLock::new();

    let built = BUILT.get_or_init(Mutex::default);

    if let Some(shape) = built
        .lock()
        .unwrap_or_else(PoisonError::into_inner)
        .get(&version)
    {
        return Ok(shape.clone());
    }

    let mut connection = SqliteConnectOptions::from_str("sqlite::memory:")?
        .foreign_keys(false)
        .connect()
        .await?;

    for statement in statements(version)
        .iter()
        .map(String::as_str)
        .chain([VERSION_MADE])
    {
        sqlx::query(sqlx::AssertSqlSafe(statement))
            .execute(&mut connection)
            .await?;
    }

    let shape = schema::read(&mut connection).await?.shape;

    built
        .lock()
        .unwrap_or_else(PoisonError::into_inner)
        .insert(version, shape.clone());

    Ok(shape)
}

/// What [`apply_between`] found and did.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Migrated {
    /// the tail after `from` was applied, checked and committed with the version row at `to`.
    Applied { from: usize, to: usize },
    /// the workspace's own row already said this version, and nothing was applied.
    AlreadyAt(usize),
}

/// Apply the first `up_to` shipped migrations to the database behind `pipeline`, with `token`:
/// a workspace being created, in the one transaction [`apply_between`] runs.
///
/// The token is the short-lived credential minted for the migration and nothing else, and it is
/// spent here and dropped.
pub async fn apply(pipeline: &Pipeline, token: &str, up_to: usize) -> Result<(), Error> {
    apply_between(pipeline, token, 0, up_to).await.map(|_| ())
}

/// Bring the workspace behind `pipeline` to `up_to` shipped migrations, in one transaction with
/// its version row and the check, or not at all. `from` is the version its caller holds it at,
/// which the workspace's own row, read first inside the transaction, overrules where it has one.
/// `token` is whatever credential the caller holds on the database; a pending migration is
/// applied under the member's own full-access credential, because any member may hold the lease
/// (`organization/lease/`).
pub async fn apply_between(
    pipeline: &Pipeline,
    token: &str,
    from: usize,
    up_to: usize,
) -> Result<Migrated, Error> {
    let stream = OverThePipeline::migrating(pipeline, token);
    let migrated = migrated_on(&stream, from, up_to).await;

    if migrated.is_err() {
        stream.abandoned().await;
    }

    migrated
}

/// The transaction [`apply_between`] runs on `stream`, which it rolls back where this fails.
async fn migrated_on(
    stream: &OverThePipeline<'_>,
    from: usize,
    up_to: usize,
) -> Result<Migrated, Error> {
    let opened = stream
        .exchanged(
            vec![
                execute("BEGIN"),
                execute(VERSION_MADE),
                execute(VERSION_READ),
            ],
            false,
        )
        .await?;

    if let Some(index) = refused_at(&opened) {
        return Err(Error::refused(
            RefusalReason::DatabaseRefused,
            format!(
                "the workspace database refused request {index} opening its migration, and \
                 nothing was changed"
            ),
        ));
    }

    let recorded = rows_of(&opened, 2)
        .first()
        .and_then(|row| row.as_array())
        .and_then(|row| row.first())
        .map(decoded)
        .transpose()?;
    let at = match recorded {
        Some(turso::Value::Integer(version)) if version >= 0 => version as usize,
        Some(_) => {
            return Err(Error::Integrity {
                message: "the workspace database holds a schema version this application cannot \
                          read"
                    .to_string(),
            });
        }
        None => from,
    };

    if at > up_to {
        return Err(Error::refused(
            RefusalReason::WorkspaceNewer,
            format!(
                "the workspace was upgraded by a newer rentable (schema {at}, and this one knows \
                 {up_to}). update rentable to open it; nothing was changed"
            ),
        ));
    }

    if at == up_to {
        let ended = stream.exchanged(vec![execute("ROLLBACK")], true).await?;

        if refused_at(&ended).is_some() {
            diagnostics::warn("organization.migrate.rollbackRefused").write();
        }

        return Ok(Migrated::AlreadyAt(at));
    }

    let tail = statements_between(at, up_to);
    let steps: Vec<Value> = tail
        .iter()
        .enumerate()
        .map(|(index, sql)| {
            json!({
                "stmt": { "sql": sql },
                "condition": index.checked_sub(1).map(|before| json!({ "type": "ok", "step": before })),
            })
        })
        .collect();
    let applied = stream
        .exchanged(
            vec![
                json!({ "type": "batch", "batch": { "steps": steps } }),
                execute(schema::QUICK_CHECK),
                execute(schema::FOREIGN_KEY_CHECK),
                execute(&backup::listing()),
                execute(&schema::columns()),
                execute(&schema::indexes()),
                execute(&schema::foreign_keys()),
            ],
            false,
        )
        .await?;

    if applied.first().and_then(|result| result.get("type")) != Some(&json!("ok")) {
        return Err(Error::refused(
            RefusalReason::DatabaseRefused,
            format!(
                "the workspace database refused the migration from {at} to {up_to}, and nothing \
                 was changed"
            ),
        ));
    }

    let batch = applied[0].pointer("/response/result");

    for index in 0..tail.len() {
        let answered = |field: &str| {
            batch
                .and_then(|batch| batch.get(field))
                .and_then(|answers| answers.get(index))
                .filter(|answer| !answer.is_null())
        };

        if answered("step_errors").is_some() || answered("step_results").is_none() {
            // the statement is not quoted: it is the shipped SQL, and the index names it.
            return Err(Error::refused(
                RefusalReason::DatabaseRefused,
                format!(
                    "statement {index} of the migration from {at} to {up_to} was refused by the \
                     database, and nothing of it was kept"
                ),
            ));
        }
    }

    if let Some(index) = refused_at(&applied) {
        return Err(Error::refused(
            RefusalReason::DatabaseRefused,
            format!(
                "the workspace database refused check {index} of the migration from {at} to \
                 {up_to}, and nothing of it was kept"
            ),
        ));
    }

    let found = Found {
        quick_check: rows_of(&applied, 1)
            .iter()
            .map(|row| match decoded_row(row)?.into_iter().next() {
                Some(turso::Value::Text(text)) => Ok(text),
                _ => Err(unreadable("a quick_check row")),
            })
            .collect::<Result<Vec<String>, Error>>()?,
        foreign_key_violations: rows_of(&applied, 2).len(),
        shape: Shape::of_values(
            &decoded_rows(&applied, 3)?,
            &decoded_rows(&applied, 4)?,
            &decoded_rows(&applied, 5)?,
            &decoded_rows(&applied, 6)?,
        )?,
    };

    schema::as_built(
        &format!("the workspace migrated from {at} to {up_to}"),
        &found,
        &fresh(up_to).await?,
    )?;

    let committed = stream
        .exchanged(
            vec![execute(&version_written(up_to)), execute("COMMIT")],
            true,
        )
        .await?;

    if let Some(index) = refused_at(&committed) {
        return Err(Error::refused(
            RefusalReason::DatabaseRefused,
            format!(
                "the workspace database refused request {index} committing the migration from \
                 {at} to {up_to}, and nothing of it was kept"
            ),
        ));
    }

    Ok(Migrated::Applied {
        from: at,
        to: up_to,
    })
}

#[cfg(test)]
mod tests {
    use crate::sync::test::{
        pipeline::LocalPipeline,
        server::{ScriptedResponse, ScriptedServer},
    };

    use super::{
        Migrated, Pipeline, VERSION_READ, WORKSPACE_MIGRATIONS, apply, apply_between, fresh,
        shipped_version, statements, statements_between, version_written,
    };
    use crate::{
        backup,
        error::{Error, RefusalReason},
        schema::{self, Shape},
    };

    /// A workspace at version `from` needs exactly the migrations after it, and none of the ones
    /// it already has; the whole set is the same as starting from nothing.
    #[test]
    fn the_statements_between_two_versions_are_the_tail_and_nothing_before_it() {
        let all = statements(WORKSPACE_MIGRATIONS.len());
        let first = statements(1);
        let rest = statements_between(1, WORKSPACE_MIGRATIONS.len());

        assert_eq!(first.len() + rest.len(), all.len());
        assert_eq!([first.clone(), rest.clone()].concat(), all);
        assert_eq!(statements_between(0, WORKSPACE_MIGRATIONS.len()), all);
        assert!(
            statements_between(WORKSPACE_MIGRATIONS.len(), WORKSPACE_MIGRATIONS.len()).is_empty()
        );
    }

    /// The embedded set against the directory it was mirrored from: the same guard
    /// `database/version.rs` keeps over the count, over the contents.
    #[test]
    fn the_embedded_migrations_are_the_shipped_files_in_order() {
        let folder = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("migrations");
        let mut files: Vec<std::path::PathBuf> = std::fs::read_dir(&folder)
            .expect("the migrations directory")
            .filter_map(|entry| entry.ok())
            .map(|entry| entry.path())
            .filter(|path| path.extension().is_some_and(|kind| kind == "sql"))
            .collect();

        files.sort();

        assert_eq!(WORKSPACE_MIGRATIONS.len(), files.len());
        assert_eq!(
            shipped_version(),
            i64::from(crate::database::version::WORKSPACE_SCHEMA_VERSION)
        );

        for ((name, sql), file) in WORKSPACE_MIGRATIONS.iter().zip(files) {
            assert_eq!(Some(*name), file.file_name().and_then(|name| name.to_str()));
            assert_eq!(*sql, std::fs::read_to_string(&file).expect("a migration"));
        }
    }

    #[test]
    fn the_statements_split_at_the_breakpoints_and_carry_every_concept() {
        let all = statements(WORKSPACE_MIGRATIONS.len());

        assert!(all.len() > 7, "{} statements", all.len());
        assert!(
            all.iter()
                .all(|statement| !statement.contains("statement-breakpoint"))
        );
        assert!(all.iter().any(|statement| statement.contains("`contract`")));
        assert_eq!(statements(0), Vec::<String>::new());
    }

    /// The shape of the database behind `pipeline`, and every row it holds, read as a plain file.
    async fn as_it_is(pipeline: &LocalPipeline) -> (Shape, Vec<(String, Vec<Vec<turso::Value>>)>) {
        let mut connection = pipeline.connection().await;
        let shape = schema::read(&mut connection)
            .await
            .expect("the shape")
            .shape;

        sqlx::Connection::close(connection).await.expect("closed");

        (shape, backup::contents_of(pipeline.path()).await)
    }

    /// The version the workspace's own row says, where it has one.
    async fn recorded(pipeline: &LocalPipeline) -> Option<i64> {
        let mut connection = pipeline.connection().await;
        let exists: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = 'schema_version'",
        )
        .fetch_one(&mut connection)
        .await
        .expect("the listing");

        if exists == 0 {
            return None;
        }

        sqlx::query_scalar(VERSION_READ)
            .fetch_optional(&mut connection)
            .await
            .expect("the row")
    }

    /// A workspace at version 2, as a build before ticket 32 left it: no version row, and a row
    /// in two of its tables.
    async fn at_version_two() -> LocalPipeline {
        let pipeline = LocalPipeline::start().await;

        pipeline
            .holding(
                &[
                    statements(2),
                    vec![
                        "INSERT INTO `complex` (`id`, `name`, `location`) \
                         VALUES (1, 'North', 'Riyadh')"
                            .to_string(),
                        "INSERT INTO `payment` (`id`, `date`, `amount`, `contract_id`) \
                         VALUES (1, 1757000000000, 1250.5, 1)"
                            .to_string(),
                    ],
                ]
                .concat(),
            )
            .await;

        pipeline
    }

    /// The statements the `index`th request to `pipeline` carried, as the database was sent
    /// them: an execute's own, and a batch's steps.
    fn sent(pipeline: &LocalPipeline, index: usize) -> Vec<String> {
        let body: serde_json::Value =
            serde_json::from_str(&pipeline.request(index).body).expect("json");

        body["requests"]
            .as_array()
            .expect("requests")
            .iter()
            .flat_map(|request| match request["type"].as_str() {
                Some("execute") => vec![request["stmt"]["sql"].as_str().expect("sql").to_string()],
                Some("batch") => request["batch"]["steps"]
                    .as_array()
                    .expect("steps")
                    .iter()
                    .map(|step| step["stmt"]["sql"].as_str().expect("sql").to_string())
                    .collect(),
                _ => Vec::new(),
            })
            .collect()
    }

    /// A workspace is created in the one transaction a migration runs: `BEGIN` and the version
    /// read, the whole schema as one batch with the check's reads, then the version row and
    /// `COMMIT`, all on one stream under the migration's credential. The result is the shape a
    /// fresh database of the shipped version has, and says so in its own row.
    #[tokio::test]
    async fn a_workspace_is_created_in_one_transaction_with_its_version_row() {
        let pipeline = LocalPipeline::start().await;
        let shipped = shipped_version() as usize;

        apply(
            &Pipeline::at(&pipeline.url("")),
            "a-migration-token",
            shipped,
        )
        .await
        .expect("the schema was refused");

        assert_eq!(pipeline.request_count(), 3);

        let bodies: Vec<serde_json::Value> = (0..3)
            .map(|index| serde_json::from_str(&pipeline.request(index).body).expect("json"))
            .collect();

        assert_eq!(bodies[0]["baton"], serde_json::Value::Null);
        assert!(bodies[1..].iter().all(|body| body["baton"].is_string()));
        assert_eq!(sent(&pipeline, 0)[0], "BEGIN");
        assert_eq!(
            bodies[1]["requests"][0]["batch"]["steps"]
                .as_array()
                .expect("steps")
                .len(),
            statements(shipped).len()
        );
        assert_eq!(
            sent(&pipeline, 2).last().map(String::as_str),
            Some("COMMIT")
        );
        assert_eq!(
            bodies[2]["requests"]
                .as_array()
                .expect("requests")
                .last()
                .expect("a close")["type"],
            "close"
        );

        for index in 0..3 {
            let request = pipeline.request(index);

            assert_eq!(request.target, "/v2/pipeline");
            assert_eq!(
                request.header("authorization"),
                Some("Bearer a-migration-token")
            );
        }

        assert_eq!(recorded(&pipeline).await, Some(shipped as i64));
        assert_eq!(
            as_it_is(&pipeline).await.0,
            fresh(shipped).await.expect("the fresh shape")
        );
    }

    /// **Ticket 32's first criterion.** A statement refused in the middle of the tail leaves the
    /// workspace exactly as it was, every table and every row, with no version row; the refusal
    /// names the statement and not the database's words. The retry applies the whole tail and
    /// commits it with the version.
    #[tokio::test]
    async fn a_statement_refused_part_way_leaves_every_table_as_it_was_and_a_retry_applies_all() {
        let pipeline = at_version_two().await;
        let shipped = shipped_version() as usize;
        let tail = statements_between(2, shipped);
        let middle = tail.len() / 2;
        let before = as_it_is(&pipeline).await;

        assert!(middle > 0 && middle < tail.len() - 1);
        pipeline.refusing(&tail[middle]).await;

        let refused = apply_between(&Pipeline::at(&pipeline.url("")), "t", 2, shipped).await;

        assert!(
            matches!(
                &refused,
                Err(Error::Refused { reason: RefusalReason::DatabaseRefused, message })
                    if message.contains(&format!("statement {middle} "))
                        && !message.contains("refused by the test")
            ),
            "{refused:?}"
        );
        assert_eq!(
            as_it_is(&pipeline).await,
            before,
            "the workspace was changed"
        );
        assert_eq!(recorded(&pipeline).await, None);

        // the stream was rolled back and closed.
        let last = pipeline.request_count() - 1;

        assert_eq!(sent(&pipeline, last), vec!["ROLLBACK".to_string()]);

        let retried = apply_between(&Pipeline::at(&pipeline.url("")), "t", 2, shipped)
            .await
            .expect("the retry");

        assert_eq!(
            retried,
            Migrated::Applied {
                from: 2,
                to: shipped
            }
        );
        assert_eq!(sent(&pipeline, last + 2)[..tail.len()], tail[..]);
        assert_eq!(recorded(&pipeline).await, Some(shipped as i64));
        assert_eq!(
            as_it_is(&pipeline).await.0,
            fresh(shipped).await.expect("the fresh shape")
        );
    }

    /// **Ticket 32's second criterion.** The workspace's own row is read first, inside the
    /// transaction: where it already says the version asked for, nothing is applied, even though
    /// the caller's record is behind; and where it says a newer one, the workspace is refused as
    /// newer and nothing is changed.
    #[tokio::test]
    async fn the_workspaces_own_version_is_read_first_and_nothing_is_applied_twice() {
        let shipped = shipped_version() as usize;
        let pipeline = LocalPipeline::start().await;

        apply(&Pipeline::at(&pipeline.url("")), "t", shipped)
            .await
            .expect("the schema");

        let before = as_it_is(&pipeline).await;
        let requests = pipeline.request_count();
        let again = apply_between(&Pipeline::at(&pipeline.url("")), "t", shipped - 1, shipped)
            .await
            .expect("the second run");

        assert_eq!(again, Migrated::AlreadyAt(shipped));
        assert_eq!(pipeline.request_count(), requests + 2);
        assert_eq!(sent(&pipeline, requests + 1), vec!["ROLLBACK".to_string()]);
        assert!(
            (requests..requests + 2)
                .all(|index| !pipeline.request(index).body.contains("\"batch\"")),
            "a statement of the tail was sent again"
        );
        assert_eq!(as_it_is(&pipeline).await, before);

        pipeline.holding(&[version_written(shipped + 1)]).await;

        let newer =
            apply_between(&Pipeline::at(&pipeline.url("")), "t", shipped - 1, shipped).await;

        assert!(
            matches!(
                newer,
                Err(Error::Refused {
                    reason: RefusalReason::WorkspaceNewer,
                    ..
                })
            ),
            "{newer:?}"
        );
        assert_eq!(recorded(&pipeline).await, Some(shipped as i64 + 1));
    }

    /// **Ticket 32's third criterion, for a workspace.** A tail that runs and leaves a schema other
    /// than a fresh database's of that version is refused with `ShapeNotAsBuilt`, naming what
    /// differs, and rolled back: none of the tail and no version row is kept.
    #[tokio::test]
    async fn a_check_that_fails_rolls_the_migration_back_with_shape_not_as_built() {
        let shipped = shipped_version() as usize;
        let pipeline = LocalPipeline::start().await;

        pipeline
            .holding(
                &[
                    statements(shipped - 1),
                    vec!["CREATE TABLE `stray` (`id` integer)".to_string()],
                ]
                .concat(),
            )
            .await;

        let before = as_it_is(&pipeline).await;
        let refused =
            apply_between(&Pipeline::at(&pipeline.url("")), "t", shipped - 1, shipped).await;

        assert!(
            matches!(
                &refused,
                Err(Error::Refused { reason: RefusalReason::ShapeNotAsBuilt, message })
                    if message.contains("table stray is not in a fresh database")
            ),
            "{refused:?}"
        );
        assert_eq!(
            as_it_is(&pipeline).await,
            before,
            "the workspace was changed"
        );
        assert_eq!(recorded(&pipeline).await, None);
    }

    /// The fresh shape of every shipped version builds, the same each time, and each carries the
    /// version table.
    #[tokio::test]
    async fn a_fresh_database_of_every_shipped_version_builds() {
        for version in 0..=shipped_version() as usize {
            let shape = fresh(version).await.expect("the fresh shape");

            assert_eq!(shape, fresh(version).await.expect("the second read"));
            assert!(format!("{shape:?}").contains("schema_version"));
        }
    }

    #[tokio::test]
    async fn a_database_that_refuses_the_request_is_a_refusal_and_a_dropped_one_is_network() {
        let refusing = ScriptedServer::start(vec![ScriptedResponse::new(401, "")]).await;
        let dropping = ScriptedServer::start(vec![ScriptedResponse::hangup()]).await;

        assert!(matches!(
            apply(&Pipeline::at(&refusing.url("")), "t", 1).await,
            Err(crate::error::Error::Refused {
                reason: crate::error::RefusalReason::DatabaseRefused,
                ..
            })
        ));
        assert!(matches!(
            apply(&Pipeline::at(&dropping.url("")), "t", 1).await,
            Err(crate::error::Error::Network { .. })
        ));
    }

    // every workspace version shipped from 0.14.0 on, seeded with rows and walked to the shipped
    // version (effort 838, requirement 16, ticket 34; `rules/migrations`).

    /// The first workspace version a release on Turso shipped at: 0.14.0 and 0.15.0 are both at 5.
    /// Earlier releases kept their records in one local file, and move over by the guided step of
    /// effort 838's requirement 18 rather than by migration.
    const FIRST_CARRIED: usize = 5;

    /// Every table and every row a database holds, as `backup::contents_of` reads it: tables by
    /// name, rows by rowid.
    type Contents = Vec<(String, Vec<Vec<turso::Value>>)>;

    /// A workspace database as a shipped version left it, and what walking it to the shipped
    /// version must leave.
    struct Seed {
        /// the version it is at: its first `version` migrations, and no version row, since no
        /// build before ticket 32 wrote one.
        version: usize,
        /// the rows it holds, as that version's build wrote them.
        rows: &'static [&'static str],
        /// every row once it is at the shipped version, the version row included.
        carried: fn() -> Contents,
    }

    /// **One seed per shipped version from [`FIRST_CARRIED`] up to the one before the shipped
    /// version.** A new migration comes with the seed of the version before it, the rows a
    /// database of that version holds, and the rows each seed here holds once the new migration
    /// has run.
    const SEEDS: &[Seed] = &[
        Seed {
            version: 5,
            rows: SEEDED_AT_FIVE,
            carried: carried_from_five,
        },
        Seed {
            version: 6,
            rows: SEEDED_AT_SIX,
            carried: carried_from_six,
        },
    ];

    /// A workspace as 0.14.0 and 0.15.0 wrote it: a record of every kind, a contract with a
    /// government id and one without, a unit on both contracts and one on neither, a payment on
    /// each contract and one of them fractional, and history naming a record by its id. `0005`
    /// adds a payment's method, reference and note, so every payment here is one written before it.
    const SEEDED_AT_FIVE: &[&str] = &[
        "INSERT INTO `complex` (`id`, `name`, `location`) VALUES \
         ('0199a000-0000-7000-8000-0000000c0001', 'North Towers', 'Riyadh, Olaya'), \
         ('0199a000-0000-7000-8000-0000000c0002', 'برج الروضة', 'Jeddah')",
        "INSERT INTO `tenant` (`id`, `national_id`, `name`, `phone`) VALUES \
         ('0199a000-0000-7000-8000-000000070001', '1012345678', 'Sara Al-Harbi', '0501234567'), \
         ('0199a000-0000-7000-8000-000000070002', '2098765432', 'خالد العتيبي', '0559876543')",
        "INSERT INTO `unit` (`id`, `name`, `status`, `complex_id`) VALUES \
         ('0199a000-0000-7000-8000-0000000a0001', 'A-101', 'occupied', \
          '0199a000-0000-7000-8000-0000000c0001'), \
         ('0199a000-0000-7000-8000-0000000a0002', 'A-102', 'occupied', \
          '0199a000-0000-7000-8000-0000000c0001'), \
         ('0199a000-0000-7000-8000-0000000a0003', 'B-1', 'vacant', \
          '0199a000-0000-7000-8000-0000000c0002')",
        "INSERT INTO `contract` (`id`, `gov_id`, `status`, `start_date`, `end_date`, \
         `interval_in_months`, `cost_per_interval`, `paid_amount`, `expected_amount`, \
         `tenant_id`) VALUES \
         ('0199a000-0000-7000-8000-0000000d0001', '20250001', 'active', 1735689600000, \
          1767225600000, '6m', 30000.5, 15000.25, 30000.5, \
          '0199a000-0000-7000-8000-000000070001'), \
         ('0199a000-0000-7000-8000-0000000d0002', NULL, 'expired', 1704067200000, \
          1735603200000, '1m', 2500, 0, 0, '0199a000-0000-7000-8000-000000070002')",
        "INSERT INTO `contract_unit` (`contract_id`, `unit_id`) VALUES \
         ('0199a000-0000-7000-8000-0000000d0001', '0199a000-0000-7000-8000-0000000a0001'), \
         ('0199a000-0000-7000-8000-0000000d0001', '0199a000-0000-7000-8000-0000000a0002'), \
         ('0199a000-0000-7000-8000-0000000d0002', '0199a000-0000-7000-8000-0000000a0002')",
        "INSERT INTO `payment` (`id`, `date`, `amount`, `contract_id`) VALUES \
         ('0199a000-0000-7000-8000-0000000e0001', 1738368000000, 15000.25, \
          '0199a000-0000-7000-8000-0000000d0001'), \
         ('0199a000-0000-7000-8000-0000000e0002', 1706745600000, 2500, \
          '0199a000-0000-7000-8000-0000000d0002')",
        "INSERT INTO `history` (`id`, `at`, `concept`, `record_id`, `action`, `record`) VALUES \
         ('0199a000-0000-7000-8000-0000000f0001', 1738368000000, 'payment', \
          '0199a000-0000-7000-8000-0000000e0001', 'created', '15000.25'), \
         ('0199a000-0000-7000-8000-0000000f0002', 1738454400000, 'tenant', \
          '0199a000-0000-7000-8000-000000070002', 'edited', 'خالد العتيبي')",
    ];

    /// [`SEEDED_AT_FIVE`] at the shipped version: every row where it was, each payment's method,
    /// reference and note null, each payment received, and the version row.
    fn carried_from_five() -> Contents {
        let null = || turso::Value::Null;

        vec![
            (
                "complex".to_string(),
                vec![
                    vec![
                        cell("0199a000-0000-7000-8000-0000000c0001"),
                        cell("North Towers"),
                        cell("Riyadh, Olaya"),
                    ],
                    vec![
                        cell("0199a000-0000-7000-8000-0000000c0002"),
                        cell("برج الروضة"),
                        cell("Jeddah"),
                    ],
                ],
            ),
            (
                "contract".to_string(),
                vec![
                    vec![
                        cell("0199a000-0000-7000-8000-0000000d0001"),
                        cell("20250001"),
                        cell("active"),
                        turso::Value::Integer(1_735_689_600_000),
                        turso::Value::Integer(1_767_225_600_000),
                        cell("6m"),
                        turso::Value::Real(30_000.5),
                        turso::Value::Real(15_000.25),
                        turso::Value::Real(30_000.5),
                        cell("0199a000-0000-7000-8000-000000070001"),
                    ],
                    vec![
                        cell("0199a000-0000-7000-8000-0000000d0002"),
                        null(),
                        cell("expired"),
                        turso::Value::Integer(1_704_067_200_000),
                        turso::Value::Integer(1_735_603_200_000),
                        cell("1m"),
                        turso::Value::Real(2_500.0),
                        turso::Value::Real(0.0),
                        turso::Value::Real(0.0),
                        cell("0199a000-0000-7000-8000-000000070002"),
                    ],
                ],
            ),
            (
                "contract_unit".to_string(),
                vec![
                    vec![
                        cell("0199a000-0000-7000-8000-0000000d0001"),
                        cell("0199a000-0000-7000-8000-0000000a0001"),
                    ],
                    vec![
                        cell("0199a000-0000-7000-8000-0000000d0001"),
                        cell("0199a000-0000-7000-8000-0000000a0002"),
                    ],
                    vec![
                        cell("0199a000-0000-7000-8000-0000000d0002"),
                        cell("0199a000-0000-7000-8000-0000000a0002"),
                    ],
                ],
            ),
            (
                "history".to_string(),
                vec![
                    vec![
                        cell("0199a000-0000-7000-8000-0000000f0001"),
                        turso::Value::Integer(1_738_368_000_000),
                        cell("payment"),
                        cell("0199a000-0000-7000-8000-0000000e0001"),
                        cell("created"),
                        cell("15000.25"),
                    ],
                    vec![
                        cell("0199a000-0000-7000-8000-0000000f0002"),
                        turso::Value::Integer(1_738_454_400_000),
                        cell("tenant"),
                        cell("0199a000-0000-7000-8000-000000070002"),
                        cell("edited"),
                        cell("خالد العتيبي"),
                    ],
                ],
            ),
            (
                "payment".to_string(),
                vec![
                    vec![
                        cell("0199a000-0000-7000-8000-0000000e0001"),
                        turso::Value::Integer(1_738_368_000_000),
                        turso::Value::Real(15_000.25),
                        cell("0199a000-0000-7000-8000-0000000d0001"),
                        null(),
                        null(),
                        null(),
                        cell("received"),
                    ],
                    vec![
                        cell("0199a000-0000-7000-8000-0000000e0002"),
                        turso::Value::Integer(1_706_745_600_000),
                        turso::Value::Real(2_500.0),
                        cell("0199a000-0000-7000-8000-0000000d0002"),
                        null(),
                        null(),
                        null(),
                        cell("received"),
                    ],
                ],
            ),
            (
                "schema_version".to_string(),
                vec![vec![
                    turso::Value::Integer(1),
                    turso::Value::Integer(shipped_version()),
                ]],
            ),
            (
                "tenant".to_string(),
                vec![
                    vec![
                        cell("0199a000-0000-7000-8000-000000070001"),
                        cell("1012345678"),
                        cell("Sara Al-Harbi"),
                        cell("0501234567"),
                    ],
                    vec![
                        cell("0199a000-0000-7000-8000-000000070002"),
                        cell("2098765432"),
                        cell("خالد العتيبي"),
                        cell("0559876543"),
                    ],
                ],
            ),
            (
                "unit".to_string(),
                vec![
                    vec![
                        cell("0199a000-0000-7000-8000-0000000a0001"),
                        cell("A-101"),
                        cell("occupied"),
                        cell("0199a000-0000-7000-8000-0000000c0001"),
                    ],
                    vec![
                        cell("0199a000-0000-7000-8000-0000000a0002"),
                        cell("A-102"),
                        cell("occupied"),
                        cell("0199a000-0000-7000-8000-0000000c0001"),
                    ],
                    vec![
                        cell("0199a000-0000-7000-8000-0000000a0003"),
                        cell("B-1"),
                        cell("vacant"),
                        cell("0199a000-0000-7000-8000-0000000c0002"),
                    ],
                ],
            ),
        ]
    }

    /// A workspace as a build at version 6 wrote it: every record of [`SEEDED_AT_FIVE`] but its
    /// payments, which now say how they were paid, one with a reference and a note and one with
    /// a note alone. `0006` adds a payment's direction, so every payment here is one written
    /// before it, and money received.
    const SEEDED_AT_SIX: &[&str] = &[
        SEEDED_AT_FIVE[0],
        SEEDED_AT_FIVE[1],
        SEEDED_AT_FIVE[2],
        SEEDED_AT_FIVE[3],
        SEEDED_AT_FIVE[4],
        "INSERT INTO `payment` (`id`, `date`, `amount`, `contract_id`, `method`, `reference`,          `note`) VALUES          ('0199a000-0000-7000-8000-0000000e0001', 1738368000000, 15000.25,           '0199a000-0000-7000-8000-0000000d0001', 'bank-transfer', 'SADAD-7731', 'first half'),          ('0199a000-0000-7000-8000-0000000e0002', 1706745600000, 2500,           '0199a000-0000-7000-8000-0000000d0002', 'cash', NULL, 'دفعة نقدية')",
        SEEDED_AT_FIVE[6],
    ];

    /// [`SEEDED_AT_SIX`] at the shipped version: every row where it was, each payment's method,
    /// reference and note as written, each payment received, and the version row.
    fn carried_from_six() -> Contents {
        let mut carried = carried_from_five();
        let (_, payments) = carried
            .iter_mut()
            .find(|(table, _)| table == "payment")
            .expect("the payments carried from five");

        payments[0][4] = cell("bank-transfer");
        payments[0][5] = cell("SADAD-7731");
        payments[0][6] = cell("first half");
        payments[1][4] = cell("cash");
        payments[1][6] = cell("دفعة نقدية");

        carried
    }

    /// A text value as a row holds it.
    fn cell(value: &str) -> turso::Value {
        turso::Value::Text(value.to_string())
    }

    /// The shipped versions from [`FIRST_CARRIED`] up to the one before `shipped` that no seed of
    /// `seeds` is at.
    fn unseeded(seeds: &[Seed], shipped: usize) -> Vec<usize> {
        (FIRST_CARRIED..shipped)
            .filter(|version| !seeds.iter().any(|seed| seed.version == *version))
            .collect()
    }

    /// **Ticket 34's second criterion.** Every version shipped from 0.14.0 on, up to the one
    /// before the shipped version, has a seed, and only one; a seed is never at the shipped
    /// version or past it. So the next migration fails here until the version before it is
    /// seeded.
    #[test]
    fn every_shipped_version_from_the_first_carried_has_one_seed() {
        let shipped = shipped_version() as usize;

        assert_eq!(
            unseeded(SEEDS, shipped),
            Vec::<usize>::new(),
            "a shipped workspace version has no seed in SEEDS"
        );

        for (place, seed) in SEEDS.iter().enumerate() {
            assert!(
                (FIRST_CARRIED..shipped).contains(&seed.version),
                "the seed at {} is not a version a workspace is walked from",
                seed.version
            );
            assert!(
                SEEDS[place + 1..]
                    .iter()
                    .all(|other| other.version != seed.version),
                "two seeds at {}",
                seed.version
            );
        }
    }

    /// The check above fails a shipped version with no seed: a migration added after the last
    /// one leaves the version before it unseeded.
    #[test]
    fn a_shipped_version_with_no_seed_is_found() {
        let shipped = shipped_version() as usize;

        assert_eq!(unseeded(SEEDS, shipped + 1), vec![shipped]);
        assert_eq!(
            unseeded(&[], shipped),
            (FIRST_CARRIED..shipped).collect::<Vec<usize>>()
        );
    }

    /// **Ticket 34's first criterion.** Each seed is a database of its version with its rows,
    /// holding no version row, as its build left it; walked by [`apply_between`] over the
    /// pipeline, from the version the organization records it at, to the shipped version, it is
    /// the schema a fresh database of the shipped version is built with, the check passing inside
    /// the migration, and every row is carried as the seed says.
    #[tokio::test]
    async fn every_seeded_version_is_walked_to_the_shipped_version_with_its_rows() {
        let shipped = shipped_version() as usize;

        for seed in SEEDS {
            let pipeline = LocalPipeline::start().await;

            pipeline
                .holding(
                    &[
                        statements(seed.version),
                        seed.rows.iter().map(|row| row.to_string()).collect(),
                    ]
                    .concat(),
                )
                .await;

            assert_eq!(
                as_it_is(&pipeline).await.0,
                fresh(seed.version)
                    .await
                    .expect("the fresh shape")
                    .without(&[super::VERSION_TABLE]),
                "the seed at {} is not a database of that version",
                seed.version
            );
            assert_eq!(recorded(&pipeline).await, None);

            let walked =
                apply_between(&Pipeline::at(&pipeline.url("")), "t", seed.version, shipped)
                    .await
                    .unwrap_or_else(|error| panic!("the walk from {}: {error:?}", seed.version));

            assert_eq!(
                walked,
                Migrated::Applied {
                    from: seed.version,
                    to: shipped
                }
            );

            let (shape, rows) = as_it_is(&pipeline).await;

            assert_eq!(
                shape,
                fresh(shipped).await.expect("the fresh shape"),
                "the walk from {} left a schema a fresh database does not have",
                seed.version
            );
            assert_eq!(
                rows,
                (seed.carried)(),
                "the walk from {} did not carry the rows",
                seed.version
            );
            assert_eq!(recorded(&pipeline).await, Some(shipped as i64));
        }
    }

    /// **Live, and the human's to run** (effort 838, tickets 32 and 38). Every shipped migration,
    /// `0003`'s drops and renames among them, applied to a fresh database on the account inside
    /// one explicit transaction over the pipeline, with the check and the version row, then
    /// committed; and a second run reading the version row back and applying nothing. It is the
    /// one witness of two things the local stand-in cannot answer: whether Turso's server takes
    /// all of it in one transaction, where the plan's fallback is one transaction per migration
    /// file; and whether the server answers the check's reads, `pragma_table_info`,
    /// `pragma_index_list`, `pragma_index_info` and `pragma_foreign_key_list` among them, so that
    /// the workspace it holds compares equal to the fresh one built on a plain SQLite.
    /// [[rules/testing]] admits it under *Tests that reach a live remote*.
    ///
    /// ```text
    /// RENTABLE_LIVE_TURSO=1 TURSO_API_TOKEN=... TURSO_ORG=... TURSO_GROUP=... \
    ///   cargo test --manifest-path ./apps/desktop/tauri/Cargo.toml migration_live -- \
    ///   --test-threads=1 --ignored --nocapture
    /// ```
    #[tokio::test]
    #[ignore = "reaches a live Turso account and creates a database; see the doc comment"]
    async fn migration_live_every_shipped_migration_commits_in_one_transaction() {
        use crate::database::test::workspace::LiveWorkspace;

        assert_eq!(
            std::env::var("RENTABLE_LIVE_TURSO")
                .unwrap_or_else(|_| {
                    panic!(
                        "RENTABLE_LIVE_TURSO is needed for a live run; see the doc comment above"
                    )
                })
                .trim(),
            "1",
            "a live run is armed by RENTABLE_LIVE_TURSO=1 as well as by --ignored"
        );

        let workspace = LiveWorkspace::create("t32").await;
        let pipeline = Pipeline::of(
            workspace
                .url
                .strip_prefix("libsql://")
                .expect("a libsql:// workspace url"),
        );
        let shipped = shipped_version() as usize;
        let applied = apply_between(&pipeline, &workspace.token, 0, shipped).await;
        let again = apply_between(&pipeline, &workspace.token, 0, shipped).await;

        workspace.destroy().await;

        assert_eq!(
            applied.expect("the whole schema in one transaction, checked"),
            Migrated::Applied {
                from: 0,
                to: shipped
            }
        );
        assert_eq!(again.expect("the second run"), Migrated::AlreadyAt(shipped));
    }
}
