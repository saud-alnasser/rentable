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
//! **Opening a workspace runs what [`bring_up`] runs, and that is not always a prefix** (effort
//! 857, ticket 03). Every step shipped before 857 runs as it always did, and so does every step
//! declared after it as an addition; one declared an upgrade is passed over until the explicit
//! act, and the additions after it still run. So the workspace keeps `schema_version` as "every
//! step up to here has run" and lists any step above it that ran in `applied_step`; the check
//! builds its fresh database from that version's steps and the listed ones ([`fresh_of`]); and the
//! first step declared after 857 to run writes `data_floor`, holding the floors read before it.
//! A workspace only 0.20's steps have reached holds neither table, exactly as 0.20 left it.
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
    backup,
    database::{
        floor::{self, Floors, Standing, WORKSPACE_FLOOR_TABLE},
        step::{Steps, WORKSPACE_STEPS},
    },
    diagnostics,
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
    fresh_of(&SHIPPED, &(1..=version as u32).collect::<Vec<u32>>()).await
}

/// The shape a fresh workspace database that has run the steps `run` of `migrations` is built
/// with (effort 857, ticket 03): their statements in order and the version table, and where any
/// of them was declared after 857, the tables that record what ran and the floors
/// ([`Migrations::records`]). Built once per ladder and set of steps per process.
pub async fn fresh_of(migrations: &Migrations, run: &[u32]) -> Result<Shape, Error> {
    type Built = HashMap<(usize, Vec<u32>), Shape>;
    static BUILT: OnceLock<Mutex<Built>> = OnceLock::new();

    let built = BUILT.get_or_init(Mutex::default);
    let key = (migrations.files.as_ptr() as usize, run.to_vec());

    if let Some(shape) = built
        .lock()
        .unwrap_or_else(PoisonError::into_inner)
        .get(&key)
    {
        return Ok(shape.clone());
    }

    let mut connection = SqliteConnectOptions::from_str("sqlite::memory:")?
        .foreign_keys(false)
        .connect()
        .await?;
    let mut made: Vec<String> = run
        .iter()
        .flat_map(|number| migrations.statements_of(*number))
        .collect();

    made.push(VERSION_MADE.to_string());

    if migrations.records(run) {
        made.push(APPLIED_MADE.to_string());
        made.push(FLOOR_MADE.to_string());
    }

    for statement in &made {
        sqlx::query(sqlx::AssertSqlSafe(statement.as_str()))
            .execute(&mut connection)
            .await?;
    }

    let shape = schema::read(&mut connection).await?.shape;

    built
        .lock()
        .unwrap_or_else(PoisonError::into_inner)
        .insert(key, shape.clone());

    Ok(shape)
}

/// The table a workspace lists the steps it ran above its `schema_version` in (effort 857, ticket
/// 03). A step waiting for the explicit upgrade is passed over and the additions after it still
/// run, so what ran stops being a prefix: `schema_version` keeps meaning every step up to it has
/// run, and this lists any step above it that has.
pub const APPLIED_TABLE: &str = "applied_step";

/// [`APPLIED_TABLE`], made with the first step declared after 857 that runs.
const APPLIED_MADE: &str = "CREATE TABLE IF NOT EXISTS \"applied_step\" (\
                            \"step\" INTEGER PRIMARY KEY, \
                            \"applied_at\" INTEGER NOT NULL)";

/// The one-row table a workspace keeps its floors in (`database/floor.rs`), made with the first
/// step declared after 857 that runs, which writes its row.
const FLOOR_MADE: &str = "CREATE TABLE IF NOT EXISTS \"data_floor\" (\
                          \"id\" INTEGER PRIMARY KEY CHECK (\"id\" = 1), \
                          \"level\" INTEGER NOT NULL, \
                          \"read\" INTEGER NOT NULL, \
                          \"write\" INTEGER NOT NULL)";

/// Which of the two record tables a workspace already holds.
const RECORDS_LISTED: &str = "SELECT \"name\" FROM sqlite_master WHERE \"type\" = 'table' \
                              AND \"name\" IN ('applied_step', 'data_floor')";

/// The workspace's ladder as the open path is handed it (effort 857, ticket 03): the migration
/// files and the step each is declared as. [`SHIPPED`] in production, and a ladder of a test's
/// own under test, since no step declared after 857 has shipped yet.
#[derive(Clone, Copy, Debug)]
pub struct Migrations {
    /// every migration file, `files[i]` being step `i + 1`.
    pub files: &'static [(&'static str, &'static str)],
    /// the declaration of each, in the same order.
    pub steps: Steps,
}

/// The ladder this build ships: the embedded migrations and `database/step.rs`'s declarations.
pub const SHIPPED: Migrations = Migrations {
    files: WORKSPACE_MIGRATIONS,
    steps: Steps {
        first: 1,
        declared: WORKSPACE_STEPS,
    },
};

impl Migrations {
    /// The statements of step `number`, split at `drizzle-kit`'s breakpoints.
    fn statements_of(&self, number: u32) -> Vec<String> {
        self.files
            .get(number as usize - 1)
            .map(|(_, sql)| {
                sql.split(STATEMENT_BREAKPOINT)
                    .map(|statement| statement.trim().to_string())
                    .filter(|statement| !statement.is_empty())
                    .collect()
            })
            .unwrap_or_default()
    }

    /// Whether a workspace that has run the steps `run` keeps the records of effort 857: the
    /// steps above its version, and its floors. It does once any step declared after 857 has run
    /// on it, and before that it is exactly what 0.20 left, with nothing added.
    pub fn records(&self, run: &[u32]) -> bool {
        let settled = self.steps.settled();

        run.iter().any(|number| *number > settled)
    }
}

/// Which steps [`bring_up`] runs: what opening runs, or every step the workspace has not run.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Selected {
    /// [`Steps::on_open`]'s: each step shipped before 857 and each addition, passing over an
    /// upgrade declared after (ticket 03).
    OnOpen,
    /// every step above the version the workspace has not run, the upgrades waiting for the
    /// explicit act among them (ticket 07). `owner` says whether the member running them is the
    /// owner, without whom a step needing the owner's key is refused and nothing runs.
    Every { owner: bool },
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

/// The transaction opened on `stream`, and the workspace's own version read inside it: the row,
/// or `from` where it has none. Answers that version and every answer of the opening request.
async fn opened_on(
    stream: &OverThePipeline<'_>,
    from: usize,
    also: &[&str],
) -> Result<(usize, Vec<Value>), Error> {
    let opened = stream
        .exchanged(
            [
                execute("BEGIN"),
                execute(VERSION_MADE),
                execute(VERSION_READ),
            ]
            .into_iter()
            .chain(also.iter().map(|sql| execute(sql)))
            .collect(),
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

    Ok((at, opened))
}

/// The transaction on `stream` ended with nothing in it kept.
async fn rolled_back(stream: &OverThePipeline<'_>) -> Result<(), Error> {
    let ended = stream.exchanged(vec![execute("ROLLBACK")], true).await?;

    if refused_at(&ended).is_some() {
        diagnostics::warn("organization.migrate.rollbackRefused").write();
    }

    Ok(())
}

/// The workspace refused for having been upgraded past `known`, which this build knows.
fn newer_than(at: impl std::fmt::Display, known: impl std::fmt::Display) -> Error {
    Error::refused(
        RefusalReason::WorkspaceNewer,
        format!(
            "the workspace was upgraded by a newer rentable (schema {at}, and this one knows \
             {known}). update rentable to open it; nothing was changed"
        ),
    )
}

/// The transaction [`apply_between`] runs on `stream`, which it rolls back where this fails.
async fn migrated_on(
    stream: &OverThePipeline<'_>,
    from: usize,
    up_to: usize,
) -> Result<Migrated, Error> {
    let (at, _) = opened_on(stream, from, &[]).await?;

    if at > up_to {
        return Err(newer_than(at, up_to));
    }

    if at == up_to {
        rolled_back(stream).await?;

        return Ok(Migrated::AlreadyAt(at));
    }

    committed(
        stream,
        &statements_between(at, up_to),
        &fresh(up_to).await?,
        up_to,
        &format!("from {at} to {up_to}"),
    )
    .await?;

    Ok(Migrated::Applied {
        from: at,
        to: up_to,
    })
}

/// The `tail` run as one batch on `stream`, each statement only where the one before it answered
/// `ok`, the check's reads after it compared with `expected`, and the version row at `version`
/// written and committed: what every migration of a workspace ends with, whatever it applies.
/// `between` says which, as the refusals name it.
async fn committed(
    stream: &OverThePipeline<'_>,
    tail: &[String],
    expected: &Shape,
    version: usize,
    between: &str,
) -> Result<(), Error> {
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
                "the workspace database refused the migration {between}, and nothing was changed"
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
                    "statement {index} of the migration {between} was refused by the database, \
                     and nothing of it was kept"
                ),
            ));
        }
    }

    if let Some(index) = refused_at(&applied) {
        return Err(Error::refused(
            RefusalReason::DatabaseRefused,
            format!(
                "the workspace database refused check {index} of the migration {between}, and \
                 nothing of it was kept"
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
        &format!("the workspace migrated {between}"),
        &found,
        expected,
    )?;

    let committed = stream
        .exchanged(
            vec![execute(&version_written(version)), execute("COMMIT")],
            true,
        )
        .await?;

    if let Some(index) = refused_at(&committed) {
        return Err(Error::refused(
            RefusalReason::DatabaseRefused,
            format!(
                "the workspace database refused request {index} committing the migration \
                 {between}, and nothing of it was kept"
            ),
        ));
    }

    Ok(())
}

/// What opening a workspace found and ran ([`bring_up`]).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Brought {
    /// the version its own row said, or the caller's where it had none.
    pub from: u32,
    /// every step run, in order; none where nothing was due.
    pub ran: Vec<u32>,
    /// its version now: every step up to it has run.
    pub version: u32,
    /// the floors its own `data_floor` records now, where it keeps them.
    pub floors: Option<Floors>,
}

/// Run on the workspace behind `pipeline` every step of `migrations` that opening it runs
/// (effort 857, ticket 03), in one transaction with the check and its version row, or not at all.
///
/// **What runs is [`Steps::on_open`]'s**: each step above the version that it has not run yet,
/// shipped before 857 or declared an addition. A step declared after 857 as an upgrade is passed
/// over and the additions after it still run, which is why the workspace lists in `applied_step`
/// any step it ran above its version, and why the fresh database it is checked against is built
/// from that version's steps and the listed ones ([`fresh_of`]).
///
/// **The first step declared after 857 to run writes the floors** into `data_floor`, as they were
/// read before it with the level it took the workspace to: the version alone would otherwise read
/// as raised floors (`database/floor.rs`). An addition moves neither floor.
///
/// **Nothing runs on a workspace this build may not write**: one whose own floors put it below the
/// read floor is refused as `WorkspaceNewer`, as an older build opening a newer one always was,
/// and one below the write floor is left as it is. `from` and `token` are [`apply_between`]'s.
pub async fn bring_up(
    pipeline: &Pipeline,
    token: &str,
    migrations: &Migrations,
    from: usize,
    now: i64,
) -> Result<Brought, Error> {
    bring_up_selected(pipeline, token, migrations, from, now, Selected::OnOpen).await
}

/// [`bring_up`], running the steps `selected` names: what opening runs, or every step the
/// workspace has not run, which is the explicit upgrade (effort 857, ticket 07). The same one
/// transaction, check and records either way, so an upgrade is whole or nothing.
pub async fn bring_up_selected(
    pipeline: &Pipeline,
    token: &str,
    migrations: &Migrations,
    from: usize,
    now: i64,
    selected: Selected,
) -> Result<Brought, Error> {
    let stream = OverThePipeline::migrating(pipeline, token);
    let brought = brought_on(&stream, migrations, from, now, selected).await;

    if brought.is_err() {
        stream.abandoned().await;
    }

    brought
}

/// The transaction [`bring_up`] runs on `stream`, which it rolls back where this fails.
async fn brought_on(
    stream: &OverThePipeline<'_>,
    migrations: &Migrations,
    from: usize,
    now: i64,
    selected: Selected,
) -> Result<Brought, Error> {
    let (at, opened) = opened_on(stream, from, &[RECORDS_LISTED]).await?;
    let at = floor::number(at as i64)?;
    let listed: Vec<String> = rows_of(&opened, 3)
        .iter()
        .filter_map(|row| match decoded_row(row).ok()?.into_iter().next() {
            Some(turso::Value::Text(name)) => Some(name),
            _ => None,
        })
        .collect();
    let (applied, recorded) = records_read(stream, &listed).await?;
    let before = recorded.unwrap_or(Floors::legacy(at));
    let known = migrations.steps.known();

    match before.standing(known) {
        Standing::Unreadable => return Err(newer_than(before.level.max(at), known)),
        Standing::ReadOnly => {
            rolled_back(stream).await?;

            return Ok(Brought {
                from: at,
                ran: Vec::new(),
                version: at,
                floors: recorded,
            });
        }
        Standing::Writable => {}
    }

    let ran: Vec<u32> = match selected {
        Selected::OnOpen => migrations.steps.on_open(at, &applied),
        Selected::Every { .. } => (at.saturating_add(1)..=known)
            .filter(|number| !applied.contains(number))
            .collect(),
    };

    if selected == (Selected::Every { owner: false }) && migrations.steps.need_the_owner(&ran) {
        rolled_back(stream).await?;

        return Err(crate::organization::upgrade::needs_the_owner());
    }

    if ran.is_empty() {
        rolled_back(stream).await?;

        return Ok(Brought {
            from: at,
            ran,
            version: at,
            floors: recorded,
        });
    }

    // every step the workspace holds once these have run, its version the end of their unbroken
    // run from the first, and what lies above it listed.
    let mut holds: Vec<u32> = (1..=at).chain(applied).chain(ran.iter().copied()).collect();

    holds.sort_unstable();
    holds.dedup();

    let mut version = at;

    while holds.contains(&(version + 1)) {
        version += 1;
    }

    let above: Vec<u32> = holds
        .iter()
        .copied()
        .filter(|number| *number > version)
        .collect();
    let level = holds.last().copied().unwrap_or(version);
    let floors = migrations
        .records(&holds)
        .then(|| migrations.steps.raised(before, &ran, level));
    let mut tail: Vec<String> = ran
        .iter()
        .flat_map(|number| migrations.statements_of(*number))
        .collect();

    if let Some(floors) = floors {
        tail.push(APPLIED_MADE.to_string());
        tail.push(FLOOR_MADE.to_string());
        tail.push(format!(
            "DELETE FROM \"{APPLIED_TABLE}\" WHERE \"step\" <= {version}"
        ));
        tail.extend(above.iter().map(|number| {
            format!(
                "INSERT OR IGNORE INTO \"{APPLIED_TABLE}\" (\"step\", \"applied_at\") \
                 VALUES ({number}, {now})"
            )
        }));
        tail.push(format!(
            "INSERT INTO \"{WORKSPACE_FLOOR_TABLE}\" (\"id\", \"level\", \"read\", \"write\") \
             VALUES (1, {}, {}, {}) ON CONFLICT(\"id\") DO UPDATE SET \
             \"level\" = excluded.\"level\", \"read\" = excluded.\"read\", \
             \"write\" = excluded.\"write\"",
            floors.level, floors.read, floors.write
        ));
    }

    committed(
        stream,
        &tail,
        &fresh_of(migrations, &holds).await?,
        version as usize,
        &format!("from {at} to {level}"),
    )
    .await?;

    Ok(Brought {
        from: at,
        ran,
        version,
        floors: floors.or(recorded),
    })
}

/// The steps a workspace lists above its version and the floors it records, read inside the
/// transaction from the record tables `listed` says it holds; none of either where it holds
/// neither, which is every workspace no step declared after 857 has reached.
async fn records_read(
    stream: &OverThePipeline<'_>,
    listed: &[String],
) -> Result<(Vec<u32>, Option<Floors>), Error> {
    let holds = |table: &str| listed.iter().any(|name| name == table);
    let mut reads = Vec::new();

    if holds(APPLIED_TABLE) {
        reads.push(execute(&format!(
            "SELECT \"step\" FROM \"{APPLIED_TABLE}\" ORDER BY \"step\""
        )));
    }

    if holds(WORKSPACE_FLOOR_TABLE) {
        reads.push(execute(&format!(
            "SELECT \"level\", \"read\", \"write\" FROM \"{WORKSPACE_FLOOR_TABLE}\" \
             WHERE \"id\" = 1"
        )));
    }

    if reads.is_empty() {
        return Ok((Vec::new(), None));
    }

    let read = stream.exchanged(reads, false).await?;

    if let Some(index) = refused_at(&read) {
        return Err(Error::refused(
            RefusalReason::DatabaseRefused,
            format!(
                "the workspace database refused read {index} of what it records, and nothing was \
                 changed"
            ),
        ));
    }

    let number_in = |cell: Option<turso::Value>| match cell {
        Some(turso::Value::Integer(value)) => floor::number(value),
        _ => Err(unreadable("a step number")),
    };
    let mut at = 0;
    let mut applied = Vec::new();

    if holds(APPLIED_TABLE) {
        for row in decoded_rows(&read, at)? {
            applied.push(number_in(row.into_iter().next())?);
        }

        at += 1;
    }

    let floors = if holds(WORKSPACE_FLOOR_TABLE) {
        match decoded_rows(&read, at)?.into_iter().next() {
            Some(row) => {
                let mut cells = row.into_iter();

                Some(Floors {
                    level: number_in(cells.next())?,
                    read: number_in(cells.next())?,
                    write: number_in(cells.next())?,
                })
            }
            None => None,
        }
    } else {
        None
    };

    Ok((applied, floors))
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
        organization::lease::test::seed::{
            AT_THE_SHIPPED_VERSION, FIRST_CARRIED, SEEDS, Seed, seeded,
        },
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
    // version (effort 838, requirement 16, ticket 34; `rules/migrations`). The seeds are
    // `test/seed.rs`'s.

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

        // and the shipped version has its own, which joins the others once a migration follows it
        // (effort 857, ticket 14).
        assert_eq!(
            AT_THE_SHIPPED_VERSION.version, shipped,
            "a migration was added: the seed at the shipped version joins SEEDS, and a new one is \
             written at the version it brings"
        );
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
            let pipeline = seeded(seed).await;

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
