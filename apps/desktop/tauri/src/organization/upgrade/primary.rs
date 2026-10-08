//! the organization's upgrade as one transaction at its database's primary (effort 857, ticket 24,
//! found at converge round two): the changes of format, `organization_floor` and the `format` row
//! builds before 857 read, sent over the pipeline the workspace's upgrade is sent over, so that no
//! other machine's write lands between the steps or is lost to them.
//!
//! **Why not on the replica.** A run that pulls, takes the lease and runs on its own replica before
//! pushing leaves a window: a write reaching the primary between the pull and the lease, or pushed
//! by a machine that has not yet pulled the lease, is not in what the steps read, and lands beside
//! what they wrote untransformed. An ordinary push cannot be made to wait on an advisory lease.
//!
//! **How it runs there.** One stream at the primary opens `BEGIN IMMEDIATE`, which takes the
//! database's write lock, so a push arriving from here on waits for the commit or is refused, and
//! never lands in between. Inside it, everything the primary holds is read into a store of the
//! organization on a file of this machine's own (`store/scratch.rs`), and the upgrade is judged
//! again there, against the primary rather than against what this machine last pulled: who may
//! run it, its floors, and what waits. The changes of format run on that store as every change of
//! format runs, reading the rows and signing what they write with keys this machine holds and
//! never sends; the store keeps every statement they write (`database/replay.rs`), and those
//! statements, with the floors and the `format` row, are sent in the same transaction. The check
//! is then read at the primary, the organization against a fresh one of this build built on a plain
//! SQLite, and the transaction commits; anything failing first rolls it back, and the primary is
//! as it was. Writes made from the same rows are the same writes, which is what sending them again
//! rests on.
//!
//! **Then this machine pulls**, so it follows the upgrade as every other machine does
//! (`super::run_organization`).

use std::sync::Arc;

use serde_json::{Value, json};

use crate::{
    backup,
    database::{Database, floor, replay::Replay},
    error::{Error, RefusalReason},
    schema::{self, Found, Shape},
};

use crate::organization::{
    role::in_one_transaction,
    session::MemberSession,
    store::{OrganizationStore, TABLES, statements, waits_for_its_owner},
    workspace::remote::{
        OverThePipeline, Pipeline, argument, decoded_row, decoded_rows, execute, refused_at,
        rows_of, unreadable,
    },
};

use super::{Changes, after_awaiting, gate, needs_the_owner};

/// Where the organization's database takes statements, and the credential it is reached under:
/// the member's own credential to it, which every member's session holds.
#[derive(Clone, Copy)]
pub struct Primary<'a> {
    pub pipeline: &'a Pipeline,
    pub token: &'a str,
}

/// What [`upgraded`] did at the primary: the changes of format it ran, none where the primary
/// shows the upgrade already run.
pub(super) type Ran = Vec<u32>;

/// Run every change of format waiting at the primary through `changes`, with
/// `organization_floor` and the `format` row, in one transaction there, or not at all. `now` stamps
/// what is written. The store `store` is this machine's replica, which lends its settings and its
/// directory and is not written.
pub(super) async fn upgraded<C: Changes + ?Sized>(
    store: &OrganizationStore,
    session: &MemberSession,
    primary: Primary<'_>,
    changes: &C,
    now: &(impl Fn() -> i64 + ?Sized),
) -> Result<Ran, Error> {
    let path = scratch_path(store, &session.organization_id);

    // a file a run cut short left behind is nobody's.
    Database::remove_replica_files(&path);

    let replay = Arc::new(Replay::default());
    let scratch = store.scratch(&path, Arc::clone(&replay)).await?;
    let stream = OverThePipeline::upgrading(primary.pipeline, primary.token);
    let ran = run(&stream, &scratch, &replay, session, changes, now).await;

    if ran.is_err() {
        stream.abandoned().await;
    }

    // let go before the files go, which Windows asks.
    drop(scratch);
    Database::remove_replica_files(&path);

    ran
}

/// Where the scratch store of the organization `organization_id` lies: under the data directory,
/// beside the copies.
fn scratch_path(store: &OrganizationStore, organization_id: &str) -> std::path::PathBuf {
    store
        .directory()
        .join("upgrading")
        .join(format!("org-{organization_id}.db"))
}

/// The transaction of [`upgraded`] on `stream`, which it rolls back where this fails.
async fn run<C: Changes + ?Sized>(
    stream: &OverThePipeline<'_>,
    scratch: &OrganizationStore,
    replay: &Replay,
    session: &MemberSession,
    changes: &C,
    now: &(impl Fn() -> i64 + ?Sized),
) -> Result<Ran, Error> {
    let opened = stream
        .exchanged(vec![execute("BEGIN IMMEDIATE")], false)
        .await?;

    if refused_at(&opened).is_some() {
        return Err(Error::refused(
            RefusalReason::DatabaseRefused,
            "the organization database refused to open the upgrade's transaction, and nothing \
             was changed",
        ));
    }

    let others = read_into(stream, scratch).await?;

    // judged again at the primary: what this machine last pulled may be behind it.
    let owner = gate(scratch, session).await?;

    if scratch.refuse_another_format().await? != floor::Standing::Writable {
        return Err(Error::refused(
            RefusalReason::OrganizationReadOnlyByVersion,
            "a newer version of rentable upgraded the organization, and this version may read it \
             but not write to it; nothing was changed",
        ));
    }

    let steps = scratch.format_steps();
    let before = scratch.floors().await?.ok_or_else(waits_for_its_owner)?;
    let (awaiting, after) = after_awaiting(&steps, before);

    if awaiting.is_empty() {
        ended(stream).await?;

        return Ok(Vec::new());
    }

    if steps.need_the_owner(&awaiting) && !owner {
        return Err(needs_the_owner());
    }

    let format = floor::number(
        scratch
            .format()
            .await?
            .unwrap_or(i64::from(steps.settled())),
    )?;
    let legacy = steps.legacy_after(format, after);

    replay.start();

    in_one_transaction(scratch, async {
        for number in &awaiting {
            changes.change(scratch, *number).await?;
        }

        scratch.record_organization_floor(after, now()).await?;

        if legacy != format {
            scratch.write_format_version(i64::from(legacy)).await?;
        }

        Ok(())
    })
    .await?;

    committed(stream, &replay.taken()?, &others).await?;

    Ok(awaiting)
}

/// Read everything the primary holds on `stream` into `scratch`: every table with its rows, then
/// every index, view and trigger. Answers the tables this build does not make, which the check
/// leaves out on both sides, as the walk leaves out the tables an earlier change left alone.
async fn read_into(
    stream: &OverThePipeline<'_>,
    scratch: &OrganizationStore,
) -> Result<Vec<String>, Error> {
    let objects = read(stream, &backup::listing()).await?;
    let mut others = Vec::new();

    for object in objects.iter().filter(|object| kind_of(object) == "table") {
        let [_, turso::Value::Text(name), turso::Value::Text(statement)] = object.as_slice() else {
            return Err(unreadable("a part of the schema"));
        };

        scratch.laid(statement, Vec::new()).await?;

        if !TABLES.contains(&name.as_str()) {
            others.push(name.clone());
        }

        let placeholders = |count: usize| vec!["?"; count].join(", ");
        let mut after = None;

        loop {
            let page = read(stream, &backup::paging(name, after)).await?;

            for row in &page {
                let Some((turso::Value::Integer(rowid), values)) = row.split_first() else {
                    return Err(unreadable("a row with its rowid"));
                };

                scratch
                    .laid(
                        &format!(
                            "INSERT INTO \"{}\" VALUES ({})",
                            name.replace('"', "\"\""),
                            placeholders(values.len())
                        ),
                        values.to_vec(),
                    )
                    .await?;
                after = Some(*rowid);
            }

            if page.len() < backup::PAGE {
                break;
            }
        }
    }

    for object in objects.iter().filter(|object| kind_of(object) != "table") {
        if let [_, _, turso::Value::Text(statement)] = object.as_slice() {
            scratch.laid(statement, Vec::new()).await?;
        }
    }

    Ok(others)
}

/// The kind a row of [`backup::listing`] names, or nothing it can read.
fn kind_of(object: &[turso::Value]) -> &str {
    match object.first() {
        Some(turso::Value::Text(kind)) => kind,
        _ => "",
    }
}

/// The rows `sql` reads on `stream`, inside its transaction.
async fn read(stream: &OverThePipeline<'_>, sql: &str) -> Result<Vec<Vec<turso::Value>>, Error> {
    let answered = stream.exchanged(vec![execute(sql)], false).await?;

    if refused_at(&answered).is_some() {
        return Err(Error::refused(
            RefusalReason::DatabaseRefused,
            "the organization database refused to be read for its upgrade, and nothing was \
             changed",
        ));
    }

    decoded_rows(&answered, 0)
}

/// The transaction on `stream` ended with nothing in it kept, and the stream closed.
async fn ended(stream: &OverThePipeline<'_>) -> Result<(), Error> {
    stream
        .exchanged(vec![execute("ROLLBACK")], true)
        .await
        .map(|_| ())
}

/// `statements` run as one batch on `stream`, each only where the one before it answered `ok`,
/// the check read after them and compared with a fresh organization of this build less `others`,
/// and the transaction committed.
async fn committed(
    stream: &OverThePipeline<'_>,
    statements: &[crate::database::replay::Statement],
    others: &[String],
) -> Result<(), Error> {
    let steps: Vec<Value> = statements
        .iter()
        .enumerate()
        .map(|(index, statement)| {
            json!({
                "stmt": {
                    "sql": statement.sql,
                    "args": statement.values.iter().cloned().map(argument).collect::<Vec<Value>>(),
                },
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
    let batch = applied
        .first()
        .filter(|answer| answer.get("type") == Some(&json!("ok")))
        .and_then(|answer| answer.pointer("/response/result"));

    for index in 0..statements.len() {
        let answered = |field: &str| {
            batch
                .and_then(|batch| batch.get(field))
                .and_then(|answers| answers.get(index))
                .filter(|answer| !answer.is_null())
        };

        if batch.is_none()
            || answered("step_errors").is_some()
            || answered("step_results").is_none()
        {
            return Err(Error::refused(
                RefusalReason::DatabaseRefused,
                format!(
                    "write {index} of the organization's upgrade was refused by its database, and \
                     nothing of it was kept"
                ),
            ));
        }
    }

    if let Some(index) = refused_at(&applied) {
        return Err(Error::refused(
            RefusalReason::DatabaseRefused,
            format!(
                "the organization database refused check {index} of its upgrade, and nothing of \
                 it was kept"
            ),
        ));
    }

    let others: Vec<&str> = others.iter().map(String::as_str).collect();
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
        )?
        .without(&others),
    };

    schema::as_built(
        "the organization upgraded",
        &found,
        &fresh().await?.without(&others),
    )?;

    let committed = stream.exchanged(vec![execute("COMMIT")], true).await?;

    if refused_at(&committed).is_some() {
        return Err(Error::refused(
            RefusalReason::DatabaseRefused,
            "the organization database refused to commit its upgrade, and nothing of it was kept",
        ));
    }

    Ok(())
}

/// The schema of a fresh organization of this build, built on a plain SQLite, as the primary is
/// one.
async fn fresh() -> Result<Shape, Error> {
    use sqlx::{ConnectOptions, Connection};

    let mut connection = sqlx::sqlite::SqliteConnectOptions::new()
        .in_memory(true)
        .connect()
        .await?;

    for statement in statements() {
        sqlx::query(sqlx::AssertSqlSafe(*statement))
            .execute(&mut connection)
            .await?;
    }

    let found = schema::read(&mut connection).await?;

    connection.close().await?;

    Ok(found.shape)
}

/// The organization as the primary behind `primary` holds it, read in one read into a store of its
/// own at `path`, beside `store`'s settings: what a test reads the primary through.
#[cfg(test)]
pub(super) async fn seen(
    store: &OrganizationStore,
    primary: Primary<'_>,
    path: &std::path::Path,
) -> OrganizationStore {
    let scratch = store
        .scratch(path, Arc::new(Replay::default()))
        .await
        .expect("a store to read the primary into");
    let stream = OverThePipeline::copying_the_organization(primary.pipeline, primary.token);

    stream
        .exchanged(vec![execute("BEGIN")], false)
        .await
        .expect("the read opened");
    read_into(&stream, &scratch)
        .await
        .expect("the primary read");
    ended(&stream).await.expect("the read ended");

    scratch
}
