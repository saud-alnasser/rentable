//! Reaching a live Turso workspace database from a test.
//!
//! What the tests over this scaffolding measure is what a losing writer loses when two replicas
//! of one workspace diverge (#552, acceptance criteria 9 and 17). They live at the foot of
//! `database/mod.rs`, beside the `open_replica` they go through; this is the part that provisions
//! a database to diverge against, which is the Turso-side counterpart of `sync/google/test/server.rs`.
//!
//! **A live account is reached, and there is no local stand-in.** The sync engine speaks HTTP to
//! a remote; the crate's own harness wants a separate server binary, and writing one would mean
//! implementing the replication protocol whose behaviour is the very thing under test.
//! [[rules/testing]], under *Tests that reach a live remote*, is where that deviation is declared
//! and what bounds it.
//!
//! **The tests carry `#[ignore]`, and that is the mechanism rather than an early return.**
//! libtest captures the output of a *passing* test by default, so a test that printed why it
//! skipped and then passed would report `ok` on a machine that has never reached Turso. `ignored`
//! reaches the summary line; an `eprintln!` does not. Asking for an ignored test with no
//! credentials **panics** rather than skipping: running one is a deliberate act, and a run that
//! meant to be live and silently was not is the one outcome worth refusing.
//!
//! Three variables are needed and **`apps/desktop/.env` carries only two of them**,
//! `TURSO_API_TOKEN` and `TURSO_ORG`. `TURSO_GROUP` is `apps/control-plane/.env.example`'s and
//! has to be supplied; the group has to exist already, and it must not be delete-protected or the
//! teardown below cannot remove what it created.
//!
//! ```text
//! TURSO_API_TOKEN=… TURSO_ORG=… TURSO_GROUP=… //!   cargo test --manifest-path ./apps/desktop/tauri/Cargo.toml losing_writer -- //!   --test-threads=1 --ignored --nocapture
//! ```
//!
//! All four test names carry `losing_writer`, so that filter selects the set rather than a subset
//! of it. [[references/cargo]] has why the manifest path is spelled the way it is.

use std::time::Duration;

use super::super::Database;

/// One workspace database on Turso, and the two things a replica needs to reach it.
///
/// **Created and destroyed per test rather than reused.** A database left over from a previous
/// run carries that run's rows, and a count assertion over it would pass or fail on history
/// rather than on what this test did.
pub(in crate::database) struct LiveWorkspace {
    name: String,
    url: String,
    token: String,
    organization: String,
    api_token: String,
}

impl LiveWorkspace {
    /// Provision one, the way the control plane does: create the database, then mint a
    /// full-access token scoped to it.
    ///
    /// **Missing credentials panic.** These tests are `#[ignore]`d, so reaching this function
    /// at all means somebody asked for a live run; answering that by quietly doing nothing is
    /// how a criterion comes to look met.
    pub(in crate::database) async fn create(label: &str) -> Self {
        let read = |name: &str| {
            std::env::var(name)
                .ok()
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty())
                .unwrap_or_else(|| {
                    panic!(
                        "{name} is not set, and these tests are only run deliberately. \
                         export TURSO_API_TOKEN, TURSO_ORG and TURSO_GROUP, or do not ask \
                         for the ignored tests"
                    )
                })
        };

        let api_token = read("TURSO_API_TOKEN");
        let organization = read("TURSO_ORG");
        let group = read("TURSO_GROUP");

        let client = crate::http::build_client(Duration::from_secs(60)).expect("an https client");

        let name = format!("t552-{label}-{}", short_nonce());
        let organization_url = format!("https://api.turso.tech/v1/organizations/{organization}");

        let created: serde_json::Value = client
            .post(format!("{organization_url}/databases"))
            .bearer_auth(&api_token)
            .json(&serde_json::json!({ "name": name, "group": group }))
            .send()
            .await
            .expect("create database")
            .error_for_status()
            .expect("create database refused")
            .json()
            .await
            .expect("create database body");

        let hostname = created
            .pointer("/database/Hostname")
            .and_then(serde_json::Value::as_str)
            .unwrap_or_else(|| panic!("no hostname in {created}"))
            .to_string();

        let minted: serde_json::Value = client
            .post(format!(
                "{organization_url}/databases/{name}/auth/tokens?expiration=1h&authorization=full-access"
            ))
            .bearer_auth(&api_token)
            .send()
            .await
            .expect("mint token")
            .error_for_status()
            .expect("mint token refused")
            .json()
            .await
            .expect("mint token body");

        let token = minted
            .get("jwt")
            .and_then(serde_json::Value::as_str)
            .unwrap_or_else(|| panic!("no jwt in {minted}"))
            .to_string();

        Self {
            name,
            url: format!("libsql://{hostname}"),
            token,
            organization,
            api_token,
        }
    }

    /// A replica of this workspace, in a directory of its own.
    ///
    /// **Separate directories rather than separate connections**, which is the whole point:
    /// two connections to one file are one writer, and what these tests measure exists only
    /// between two of them. `open_replica` sets no sync interval, so neither replica reaches
    /// the remote until it is told to.
    pub(in crate::database) async fn replica(
        &self,
        name: &str,
    ) -> (std::path::PathBuf, turso::sync::Database) {
        let directory = std::env::temp_dir().join(format!("rentable-{name}-{}", short_nonce()));
        std::fs::create_dir_all(&directory).expect("scratch directory");

        let token = self.token.clone();
        let database = Database::open_replica(
            &directory.join("app.db"),
            Some(self.url.clone()),
            move || {
                let token = token.clone();
                async move { Ok::<String, turso::Error>(token) }
            },
        )
        .await
        .expect("replica engine");

        (directory, database)
    }

    /// Best effort, and **a refusal is printed rather than swallowed**.
    ///
    /// It is known to fail on some accounts, and this repository already measured why: Turso
    /// will not delete any database inside a delete-protected group, and answers `403 group
    /// <name> is delete-protected and cannot be deleted` even though the database itself is
    /// not protected. `workspace/turso.ts` records the same finding for the control plane.
    ///
    /// **The first draft of this checked only whether the request was sent**, so a 403 read as
    /// a successful cleanup and four databases were left in the account with nothing said.
    /// Apply the first `up_to` migrations to the **remote** database, as the control plane does.
    ///
    /// It opens the workspace database with the token it minted and issues DDL over libSQL's HTTP
    /// protocol, which is `apps/control-plane/src/workspace/migration.ts` in one Rust function and
    /// without the ledger — the ledger is the control plane's business and nothing here reads it.
    ///
    /// **This is the only way the shipped schema reaches a workspace in these tests.** Issuing it
    /// through a replica cannot work past `0003_serious_synch.sql`; see [`apply_schema`].
    pub(in crate::database) async fn apply_schema_remotely(&self, up_to: usize) {
        let client = crate::http::build_client(Duration::from_secs(60)).expect("an https client");
        let host = self
            .url
            .strip_prefix("libsql://")
            .expect("a libsql:// workspace url");

        let mut requests: Vec<serde_json::Value> = migration_statements(up_to)
            .into_iter()
            .map(|sql| serde_json::json!({ "type": "execute", "stmt": { "sql": sql } }))
            .collect();

        requests.push(serde_json::json!({ "type": "close" }));

        let answered: serde_json::Value = client
            .post(format!("https://{host}/v2/pipeline"))
            .bearer_auth(&self.token)
            .json(&serde_json::json!({ "requests": requests }))
            .send()
            .await
            .expect("apply the schema remotely")
            .error_for_status()
            .expect("the workspace database refused the schema")
            .json()
            .await
            .expect("the schema response");

        // The pipeline answers 200 with a per-statement result, so a failed statement is in the
        // body rather than in the status. Reading it is the difference between a schema that was
        // applied and one that was merely sent.
        if let Some(results) = answered
            .get("results")
            .and_then(serde_json::Value::as_array)
        {
            for result in results {
                assert_ne!(
                    result.get("type").and_then(serde_json::Value::as_str),
                    Some("error"),
                    "a migration statement was refused by the workspace database: {result}"
                );
            }
        }
    }

    pub(in crate::database) async fn destroy(self) {
        let Ok(client) = crate::http::build_client(Duration::from_secs(60)) else {
            return;
        };

        let unreferenced = |what: String| {
            eprintln!(
                "the workspace database {} was created and is now unreferenced: {what}",
                self.name
            );
        };

        match client
            .delete(format!(
                "https://api.turso.tech/v1/organizations/{}/databases/{}",
                self.organization, self.name
            ))
            .bearer_auth(&self.api_token)
            .send()
            .await
        {
            Err(error) => unreferenced(error.to_string()),
            Ok(response) if !response.status().is_success() => {
                let status = response.status();
                let body = response.text().await.unwrap_or_default();

                unreferenced(format!("{status} {}", body.trim()));
            }
            Ok(_) => {}
        }
    }
}

pub(in crate::database) fn short_nonce() -> String {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| elapsed.as_nanos())
        .unwrap_or_default();

    format!("{nanos:x}")
}

/// The statements of the first `up_to` shipped migrations, in order.
///
/// **Read from the files that ship rather than written out here**, which is what makes "every
/// concept the schema carries" true by construction rather than by coincidence: an eighth
/// table added to `packages/workspace-migrations/` arrives in these tests without anybody
/// remembering to add it. It is also the only way the identity test below can be *about* the
/// migration rather than about a table pair invented to resemble it.
///
/// Resolved from the crate root, as `version.rs` does, because `pnpm test:rust` runs cargo
/// from `apps/desktop/` — `build.rs` mirrors the package's files into `tauri/migrations/`.
pub(in crate::database) fn migration_statements(up_to: usize) -> Vec<String> {
    let folder = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("migrations");

    let mut files: Vec<std::path::PathBuf> = std::fs::read_dir(&folder)
        .expect("the migrations directory is missing")
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.path())
        .filter(|path| path.extension().is_some_and(|kind| kind == "sql"))
        .collect();

    // The same order both runners apply them in: a plain sort over names drizzle-kit numbers
    // from `0000`.
    files.sort();

    files
        .into_iter()
        .take(up_to)
        .flat_map(|path| {
            std::fs::read_to_string(&path)
                .unwrap_or_else(|error| panic!("reading {}: {error}", path.display()))
                .split("--> statement-breakpoint")
                .map(|statement| statement.trim().to_string())
                .filter(|statement| !statement.is_empty())
                .collect::<Vec<String>>()
        })
        .collect()
}

/// How many migrations ship, which is what the client sends to the mint.
pub(in crate::database) fn shipped_migration_count() -> usize {
    std::fs::read_dir(std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("migrations"))
        .expect("the migrations directory is missing")
        .filter_map(|entry| entry.ok())
        .filter(|entry| entry.path().extension().is_some_and(|kind| kind == "sql"))
        .count()
}

/// Apply the first `up_to` migrations to a replica, through the sync connection.
///
/// **Only the pre-identity set can go this way, and that is a finding rather than a choice.**
/// DDL issued through a sync connection is captured as change data and replicates, which is what
/// makes it a cheap way to give two replicas one schema. It stops working at
/// `0003_serious_synch.sql`: that migration builds `__new_<table>`, copies through `idmap`, drops
/// the original and renames, and the push that follows fails with `no such table: main.complex`.
/// Measured against a live account 2026-08-20.
///
/// So the shipped schema goes on through [`LiveWorkspace::apply_schema_remotely`] instead, which
/// is the faithful path anyway: requirement 11 puts migrations on the control plane, and a
/// replica receives the schema as replicated pages rather than applying it.
pub(in crate::database) async fn apply_schema(connection: &turso::Connection, up_to: usize) {
    for statement in migration_statements(up_to) {
        run(connection, &statement).await;
    }
}

/// The tables a workspace holds, read from the database rather than listed here.
///
/// Engine and ledger tables are excluded by prefix; everything else is a concept, `history`
/// included. **Listing them in a constant is what would let coverage shrink in silence** when
/// the schema grows a table nobody added to the list.
pub(in crate::database) async fn concepts(connection: &turso::Connection) -> Vec<String> {
    let mut rows = connection
        .query(
            "SELECT name FROM sqlite_master WHERE type = 'table' \
             AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'turso_%' \
             AND name NOT LIKE '\\_\\_%' ESCAPE '\\' ORDER BY name",
            (),
        )
        .await
        .expect("reading the schema");

    let mut names = vec![];

    while let Some(row) = rows.next().await.expect("a schema row") {
        if let turso::Value::Text(name) = row.get_value(0).expect("a table name") {
            names.push(name);
        }
    }

    assert!(
        !names.is_empty(),
        "the replica holds no tables, so nothing below is measuring a schema"
    );

    names
}

pub(in crate::database) async fn run(connection: &turso::Connection, sql: &str) {
    connection
        .execute(sql, ())
        .await
        .unwrap_or_else(|error| panic!("statement failed: {sql}\n{error}"));
}

pub(in crate::database) async fn number(connection: &turso::Connection, sql: &str) -> i64 {
    let mut rows = connection
        .query(sql, ())
        .await
        .unwrap_or_else(|error| panic!("query failed: {sql}\n{error}"));

    let row = rows
        .next()
        .await
        .expect("query")
        .unwrap_or_else(|| panic!("no row from {sql}"));

    match row.get_value(0).expect("a value") {
        turso::Value::Integer(value) => value,
        other => panic!("{sql} came back as {other:?}"),
    }
}

pub(in crate::database) async fn count(connection: &turso::Connection, table: &str) -> i64 {
    number(connection, &format!("SELECT count(*) FROM {table}")).await
}

/// How many *distinct* rows a table holds, over every column it has.
///
/// **Cardinality alone does not answer criterion 17**, which asks that the records be all
/// present **and all distinct**. Six of the seven concepts carry a `TEXT PRIMARY KEY`, so for
/// those the two counts cannot disagree — but `contract_unit` has no key and no unique index
/// at all, and it is the one concept whose only identity is its rowid. A merge that dropped
/// one device's link and applied the other's twice would leave the count at two.
pub(in crate::database) async fn distinct(connection: &turso::Connection, table: &str) -> i64 {
    number(
        connection,
        &format!("SELECT count(*) FROM (SELECT DISTINCT * FROM {table})"),
    )
    .await
}

pub(in crate::database) async fn text(connection: &turso::Connection, sql: &str) -> Option<String> {
    let mut rows = connection
        .query(sql, ())
        .await
        .unwrap_or_else(|error| panic!("query failed: {sql}\n{error}"));

    let row = rows.next().await.ok().flatten()?;

    match row.get_value(0).ok()? {
        turso::Value::Text(value) => Some(value),
        turso::Value::Null => None,
        other => panic!("expected text from {sql}, got {other:?}"),
    }
}
