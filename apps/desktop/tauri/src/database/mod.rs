pub mod commands;
pub mod proxy;
#[cfg(test)]
mod test;
pub mod version;

use sqlx::{
    Pool, Sqlite,
    sqlite::{SqliteConnectOptions, SqlitePoolOptions},
};
use std::{
    path::{Path, PathBuf},
    sync::Arc,
};
use tokio::sync::RwLock;

use crate::{
    database::proxy::{SQLQuery, SQLRow},
    error::Error,
    persisted::Persisted,
    settings::Settings,
};

/// which engine holds this database's file.
///
/// **One at a time, and that is the constraint everything else here bends around.** `sqlx` and
/// `turso` are in disjoint locking domains — turso's WAL index is `-tshm` where SQLite's is
/// `-shm`, its Windows lock byte is nowhere near SQLite's lock page, and its `fcntl` lock is
/// invisible to a second descriptor in the same process. Nothing reports a breach: not an error,
/// not lock contention, only eventual corruption. Change capture is the same constraint from the
/// other side — CDC is armed per connection with a turso-only pragma, so a write made through
/// `sqlx` produces no `turso_cdc` row and can never be pushed.
///
/// It is an enum rather than a boxed trait so that a method which forgets an arm fails to
/// compile. Every method below that used to reach for the pool answers for both.
///
/// `Local` is not a user's workspace — a workspace's record of truth is the hosted database. It
/// is the seeded and test paths, and the copier that has to read an ordinary SQLite file while
/// writing through the engine, to two different files. Two engines over *one file* is what is
/// forbidden; two engines is not.
pub enum Engine {
    Local(Pool<Sqlite>),
    Workspace(turso::sync::Database),
}

pub struct Database {
    engine: Option<Engine>,
    settings: Arc<RwLock<Persisted<Settings>>>,
}

impl Database {
    pub const FILENAME: &'static str = "app.db";

    pub fn new(settings: Arc<RwLock<Persisted<Settings>>>) -> Self {
        Database {
            engine: None,
            settings,
        }
    }

    /// Open this machine's database as a plain file.
    ///
    /// **It applies no migrations, and that is requirement 11 rather than an omission.** The
    /// control plane owns a workspace's schema and applies it at the token mint; the replica
    /// receives it as replicated pages. A client that applied DDL of its own would not merely
    /// duplicate that work — DDL issued through the sync connection is captured as CDC and
    /// replicates, so one client's migration would reach every other replica.
    ///
    /// `tauri/migrations/` stays in the tree as the input `build.rs` counts to produce
    /// `WORKSPACE_SCHEMA_VERSION`, which is the number this client sends to the mint. Nothing
    /// reads it at launch.
    pub async fn connect(&mut self) -> Result<(), Error> {
        let settings = self.settings.read().await;
        let db_path = settings.database_path.clone();

        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let connect_options = SqliteConnectOptions::new()
            .filename(&db_path)
            .pragma("journal_mode", "WAL")
            .pragma("synchronous", "NORMAL")
            .pragma("busy_timeout", "5000")
            .create_if_missing(true);

        let pool = SqlitePoolOptions::new()
            .connect_with(connect_options)
            .await?;

        self.engine = Some(Engine::Local(pool));

        Ok(())
    }

    /// Open this machine's replica through the sync engine.
    ///
    /// **The startup path calls this.** *It said nothing did, and that stopped being true when the
    /// mint landed: `bootstrap.rs` reaches it with the workspace's URL and a token from the control
    /// plane.* Corrected 2026-08-20, having misled a reader working out what renaming the replica
    /// file would do to an installed build.
    ///
    /// **`bootstrap_if_empty(false)`, and it is measured rather than preferred.** Left true, an
    /// engine pointed at a remote it cannot reach leaves no usable local database at all — the
    /// opposite of a workspace that works with no network.
    ///
    /// **The token is a function, never a string.** It is resolved before every request, so a
    /// short-lived credential is replaced without the replica being rebuilt. The whole credential
    /// model rests on that being a first-class API, and it is one.
    ///
    /// `remote_url` is absent until a workspace is known. An engine built without one serves the
    /// local file and reaches nothing, which is what a machine that has minted nothing should do.
    ///
    /// **The file is named for the workspace, not for the machine.** One person signing out and
    /// another signing in on the same computer would otherwise open the second account's replica
    /// over the first account's rows *and* the first account's sync metadata, so the second would
    /// be reading somebody else's ledger and pushing against a revision that is not theirs. A path
    /// derived from the workspace makes the binding structural rather than something a sign-out has
    /// to remember to clean up. *What it leaves behind is the previous workspace's file, and
    /// membership is what ends that: [`Self::remove_replica`] is reached only where the control
    /// plane says the account holding it is no longer a member.*
    pub async fn connect_workspace<F, Fut>(
        &mut self,
        workspace_id: &str,
        remote_url: Option<String>,
        auth_token: F,
    ) -> Result<(), Error>
    where
        F: Fn() -> Fut + Send + Sync + 'static,
        Fut: std::future::Future<Output = std::result::Result<String, turso::Error>>
            + Send
            + 'static,
    {
        let db_path = {
            let settings = self.settings.read().await;

            Self::replica_path(&settings.database_path, workspace_id)
        };

        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        self.engine = Some(Engine::Workspace(
            Self::open_replica(&db_path, remote_url, auth_token).await?,
        ));

        Ok(())
    }

    /// Where one workspace's replica lives, beside the plain file rather than over it.
    ///
    /// `app.db` stays what the seeded and test paths use, and every replica is `ws-<id>.db` next
    /// to it. Two workspaces on one machine therefore never meet, and neither meets `app.db`.
    ///
    /// **`ws-` is the control plane's own name for the database, not a local abbreviation.**
    /// `databaseNameFor` in `apps/control-plane/src/workspace/workspace.ts` builds `ws-<id>`, and
    /// that is what Turso holds and what the remote URL says. A local file named anything else
    /// makes a person reading a directory listing translate before they can match it against the
    /// dashboard, for no gain. *It was `workspace-<id>.db` until 2026-08-20.*
    pub fn replica_path(database_path: &Path, workspace_id: &str) -> PathBuf {
        database_path
            .parent()
            .unwrap_or_else(|| Path::new("."))
            .join(format!("ws-{workspace_id}.db"))
    }

    /// The sidecars a synced database produces, beside the database itself.
    ///
    /// **Read off `turso_sync_engine`'s own source rather than guessed**, and this repository
    /// already did the reading: the effort's evidence, `turso-sync-in-the-rust-layer`, enumerates
    /// them from `database_sync_engine.rs` and measured them on disk. `-shm` is *not* here — that
    /// is SQLite's index and turso keeps `-tshm` instead, which is the distinction the locking-
    /// domain note at the top of this file turns on.
    const REPLICA_SIDECARS: [&'static str; 6] =
        ["-wal", "-tshm", "-log", "-wal-revert", "-info", "-changes"];

    /// The prefix of the transient markers a replace-base leaves, which are named per attempt.
    const REPLICA_TRANSIENT_PREFIX: &'static str = "-replace-base-apply";

    /// Remove one workspace's replica, and every file the engine keeps beside it.
    ///
    /// **The sidecars matter as much as the database.** Deleting only `ws-<id>.db` would
    /// leave a machine holding the logical log of somebody's ledger and, worse, a partial set the
    /// engine might open and believe.
    ///
    /// Best effort per file, because a file that is already gone is the outcome this wanted.
    pub fn remove_replica(database_path: &Path, workspace_id: &str) -> bool {
        let replica = Self::replica_path(database_path, workspace_id);
        let mut removed = std::fs::remove_file(&replica).is_ok();

        for suffix in Self::REPLICA_SIDECARS {
            let path = PathBuf::from(format!("{}{suffix}", replica.display()));

            if std::fs::remove_file(&path).is_ok() {
                removed = true;
            }
        }

        // **The transient markers are named per attempt**, so they are swept by prefix rather than
        // by name. A directory that cannot be read leaves them, which is the same outcome as a file
        // that will not delete: reported by the caller finding the replica still tracked.
        let (Some(parent), Some(stem)) = (replica.parent(), replica.file_name()) else {
            return removed;
        };

        let transient = format!(
            "{}{}",
            stem.to_string_lossy(),
            Self::REPLICA_TRANSIENT_PREFIX
        );

        let Ok(entries) = std::fs::read_dir(parent) else {
            return removed;
        };

        for entry in entries.flatten() {
            if entry.file_name().to_string_lossy().starts_with(&transient)
                && std::fs::remove_file(entry.path()).is_ok()
            {
                removed = true;
            }
        }

        removed
    }

    /// Send what this machine has written since the last push.
    ///
    /// **The engine does not do this on its own**, which is the thing to know: `turso::sync`
    /// captures every write as change data and holds it until somebody calls `push`. Comments
    /// elsewhere in this tree said "a replica pushes its own writes" while nothing called it, so
    /// nothing left the machine.
    ///
    /// **A failure is an answer rather than an error to raise.** What could not be sent stays
    /// captured and goes with the next push, which is what makes an offline write survive rather
    /// than a promise anybody had to keep.
    pub async fn push_replica(&self) -> bool {
        match self.engine.as_ref() {
            Some(Engine::Workspace(database)) => database.push().await.is_ok(),
            Some(Engine::Local(_)) | None => false,
        }
    }

    /// Ask the replica for what the remote has, and say whether anything arrived.
    ///
    /// **A failure is an answer rather than an error to raise.** Being unable to reach the remote
    /// is the offline case, and the replica goes on serving what it holds — so the caller is told
    /// `false` and decides, which for a replica that has never pulled is a different decision from
    /// one for a replica that has.
    pub async fn pull_replica(&self) -> bool {
        match self.engine.as_ref() {
            // **`pull` answers `Ok(false)` when there was nothing to bring**, and that bool is the
            // answer rather than the call succeeding. Reading it as `is_ok()` made every online
            // dispatch report rows and put a whole-table reconcile and a root cache invalidation
            // behind every mutation, forever, with nothing having arrived.
            Some(Engine::Workspace(database)) => matches!(database.pull().await, Ok(true)),
            Some(Engine::Local(_)) | None => false,
        }
    }

    /// Build the sync engine over one file.
    ///
    /// Separate from [`Database::connect_workspace`] so a caller can hold an engine without
    /// holding a `Database` — which is what the proxy's both-engines test needs, and it is the
    /// only test that can hold this arm to the other one.
    pub async fn open_replica<F, Fut>(
        db_path: &Path,
        remote_url: Option<String>,
        auth_token: F,
    ) -> Result<turso::sync::Database, Error>
    where
        F: Fn() -> Fut + Send + Sync + 'static,
        Fut: std::future::Future<Output = std::result::Result<String, turso::Error>>
            + Send
            + 'static,
    {
        // **Before the engine's first request, not before its first sync.** `turso/sync` forces
        // `aws-lc-rs` in beside the `ring` this tree already builds, and with both rustls
        // providers present and none installed the failure is a panic on turso's own IO thread
        // that reaches the caller as a hang rather than as an error. The call is idempotent, and
        // this is one more of the construction sites it is made from.
        crate::http::install_crypto_provider();

        let mut builder = turso::sync::Builder::new_remote(&db_path.to_string_lossy())
            .bootstrap_if_empty(false)
            .with_auth_token_fn(auth_token);

        if let Some(remote_url) = remote_url {
            builder = builder.with_remote_url(remote_url);
        }

        Ok(builder.build().await?)
    }

    /// Let go of the file.
    ///
    /// Taking the engine rather than closing it is what matters on the replica arm: there is no
    /// close to call, and the file is held for exactly as long as the engine is.
    pub async fn disconnect(&mut self) {
        match self.engine.take() {
            Some(Engine::Local(pool)) => pool.close().await,
            Some(Engine::Workspace(_)) | None => {}
        }
    }

    /// Open the database again, having let go of it.
    ///
    /// **A replica is not reopened here, and letting it be would be the one-file rule broken by
    /// this file itself.** `connect()` builds the `Local` arm, so a reconnect on a workspace
    /// would quietly put `sqlx` on the replica — no error, no lock contention, and every write
    /// after it invisible to change capture. Rebuilding the replica instead is not available:
    /// the URL and the token that built it are the caller's and were never kept.
    ///
    /// **Nothing on the workspace path calls it.** Its callers were the snapshot writer and the
    /// restore, and both retired with the backup surface (#569); what is left is the seeded and
    /// test paths, where the arm is `Local` and the refusal never fires.
    pub async fn reconnect(&mut self) -> Result<(), Error> {
        match self.engine.as_ref() {
            Some(Engine::Workspace(_)) => {
                return Err(Self::not_on_a_replica(
                    "reopen the database as a plain file",
                ));
            }
            Some(Engine::Local(_)) | None => {}
        }

        self.disconnect().await;
        self.connect().await
    }

    fn not_connected() -> Error {
        Error::PreconditionFailed {
            message: "database not connected".to_string(),
        }
    }

    /// What a caller gets for asking the replica to do something only a plain file can do.
    ///
    /// One rule: nothing but the engine opens the replica. There were three refusals until #569,
    /// and the other two guarded a snapshot on disk and a restore from one. Those retired with
    /// the surface that asked for them, so what is left is reopening the file as a plain
    /// database, which is the rule stated directly rather than a gap where a feature was.
    fn not_on_a_replica(what: &str) -> Error {
        Error::PreconditionFailed {
            message: format!(
                "cannot {what} while the workspace is a replica: nothing but the sync engine opens that file"
            ),
        }
    }

    /// Whether this database holds the application's schema yet.
    ///
    /// **One question, and both arms are asked it the same way.** It used to be two: the pool was
    /// asked whether `__migrations__` existed — this client's own ledger of the migrations it had
    /// applied — and the replica could not be, because a replica applies none. The client applies
    /// none either now, so that ledger answers nothing on either side and the question is the one
    /// it always meant.
    pub async fn is_ready(&self) -> bool {
        match self.engine.as_ref() {
            Some(Engine::Local(pool)) => Self::is_pool_ready(pool).await,
            Some(Engine::Workspace(database)) => Self::is_replica_ready(database).await,
            None => false,
        }
    }

    async fn is_pool_ready(pool: &Pool<Sqlite>) -> bool {
        let tables: Option<i64> = sqlx::query_scalar(Self::HAS_A_SCHEMA)
            .fetch_one(pool)
            .await
            .ok();

        matches!(tables, Some(tables) if tables > 0)
    }

    /// The same question, asked of the replica, which cannot be asked it through `sqlx`.
    ///
    /// **A readiness probe that is permanently false is worse than none**: the two callers respond
    /// to a false by reconnecting, and on a replica that is refused. A replica that has never
    /// pulled holds `turso_cdc` and its kin and nothing else, and is not ready.
    async fn is_replica_ready(database: &turso::sync::Database) -> bool {
        let Ok(connection) = database.connect().await else {
            return false;
        };

        let Ok(mut rows) = connection.query(Self::HAS_A_SCHEMA, ()).await else {
            return false;
        };

        matches!(
            rows.next()
                .await
                .ok()
                .flatten()
                .and_then(|row| row.get_value(0).ok()),
            Some(turso::Value::Integer(tables)) if tables > 0
        )
    }

    /// Whether a database holds a schema of the application's rather than only the engine's.
    ///
    /// **Written by exclusion rather than by naming a table**, because the tables belong to
    /// `packages/workspace-migrations`. A copy of one of their names here would be a second place
    /// the schema is known, and it would go stale in silence — the test that pins this creates
    /// the table it names, so it would agree with a name nothing else in the product used any
    /// more.
    ///
    /// The three prefixes are turso's own, read off a freshly built replica at 0.8.0-pre.4:
    /// `sqlite_sequence`, `turso_cdc`, `turso_cdc_version`, and
    /// `__turso_internal_seq___turso_internal_autoincrement_turso_cdc`. That is knowledge of a
    /// pre-release crate's internals and it will move — which is why the staleness is the other
    /// way round here: a table the engine adds outside these prefixes fails
    /// `a_replica_that_has_pulled_nothing_is_not_ready` rather than shipping.
    const HAS_A_SCHEMA: &'static str = "SELECT count(*) FROM sqlite_master \
         WHERE type = 'table' \
         AND name NOT LIKE 'sqlite!_%' ESCAPE '!' \
         AND name NOT LIKE 'turso!_%' ESCAPE '!' \
         AND name NOT LIKE '!_!_turso!_internal!_%' ESCAPE '!';";

    pub async fn execute_single_sql(&self, query: SQLQuery) -> Result<Vec<SQLRow>, Error> {
        match self.engine.as_ref().ok_or_else(Self::not_connected)? {
            Engine::Local(pool) => proxy::execute_single_sql(pool, query).await,
            // A connection per request, which is what the pool hands out on the other arm too.
            // The engine arms change capture on every connection it opens, so one taken here is
            // one whose writes can be pushed — and one taken any other way is not.
            Engine::Workspace(database) => {
                proxy::workspace_execute_single_sql(&database.connect().await?, query).await
            }
        }
    }

    pub async fn execute_batch_sql(
        &self,
        queries: Vec<SQLQuery>,
    ) -> Result<Vec<Vec<SQLRow>>, Error> {
        match self.engine.as_ref().ok_or_else(Self::not_connected)? {
            Engine::Local(pool) => proxy::execute_batch_sql(pool, queries).await,
            Engine::Workspace(database) => {
                proxy::workspace_execute_batch_sql(&database.connect().await?, queries).await
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::test::workspace::{
        LiveWorkspace, apply_schema, concepts, count, distinct, run, shipped_migration_count, text,
    };
    use super::{Database, Engine};

    /// A replica engine over a file of its own, with no remote to reach.
    async fn replica(name: &str) -> (std::path::PathBuf, turso::sync::Database) {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|elapsed| elapsed.as_nanos())
            .unwrap_or_default();

        let directory = std::env::temp_dir().join(format!("rentable-{name}-{nanos}"));
        std::fs::create_dir_all(&directory).expect("scratch directory");

        let database = Database::open_replica(&directory.join("app.db"), None, || async {
            Ok::<String, turso::Error>(String::new())
        })
        .await
        .expect("replica engine");

        (directory, database)
    }

    /// **Two workspaces on one machine never meet, and neither meets `app.db`.**
    ///
    /// The failure this prevents is silent and is somebody else's data: one person signs out,
    /// another signs in, and a shared path would open the second account's replica over the first
    /// account's rows and the first account's sync metadata.
    #[test]
    fn a_replica_is_named_for_its_workspace_and_never_for_the_machine() {
        let base = std::path::Path::new("C:/rentable/app.db");

        let first = Database::replica_path(base, "ws-1");
        let second = Database::replica_path(base, "ws-2");

        assert_ne!(first, second, "two workspaces share one file");
        assert_ne!(first, base, "a replica took the plain file's path");
        assert_eq!(
            first.parent(),
            base.parent(),
            "a replica left the data directory"
        );
        assert!(
            first.to_string_lossy().contains("ws-1"),
            "a replica's path does not name the workspace it holds"
        );
    }

    /// **A machine that has signed in and not yet pulled has no schema, and says so.**
    ///
    /// The probe this replaced looked for `__migrations__`, the ledger of migrations this client
    /// applied — and it applies none, so that probe answers *not ready* for a replica holding the
    /// whole workspace. Both callers of `is_ready` respond to a false by reconnecting, which on a
    /// replica is refused, so the failure would present as a snapshot that could never be taken
    /// rather than as a wrong answer.
    #[tokio::test]
    async fn a_replica_that_has_pulled_nothing_is_not_ready() {
        let (directory, database) = replica("readiness-empty").await;

        assert!(
            !Database::is_replica_ready(&database).await,
            "a replica with no schema in it reported itself ready"
        );

        drop(database);
        let _ = std::fs::remove_dir_all(&directory);
    }

    /// The schema arrives as replicated pages rather than as anything this client ran, so the
    /// fixture creates the tables directly — which is what a pull leaves behind.
    #[tokio::test]
    async fn a_replica_holding_the_workspace_schema_is_ready() {
        let (directory, database) = replica("readiness-schema").await;

        let connection = database.connect().await.expect("replica connection");
        connection
            .execute("create table tenant (id text primary key, name text)", ())
            .await
            .expect("schema");

        assert!(
            Database::is_replica_ready(&database).await,
            "a replica holding the workspace schema reported itself not ready"
        );

        drop(connection);
        drop(database);
        let _ = std::fs::remove_dir_all(&directory);
    }

    /// **The other arm answers the same question, and the answer moves when a schema arrives.**
    ///
    /// A pool used to be asked whether `__migrations__` existed — a table the runner created as it
    /// applied the first file, and which nothing creates now. A probe still keyed on it would
    /// answer *not ready* for every database on this side, whatever is in it.
    #[tokio::test]
    async fn a_database_with_no_schema_in_it_is_not_ready() {
        use crate::{persisted::Persisted, settings::Settings};
        use std::sync::Arc;
        use tokio::sync::RwLock;

        let directory = std::env::temp_dir().join(format!(
            "rentable-readiness-local-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|elapsed| elapsed.as_nanos())
                .unwrap_or_default()
        ));
        std::fs::create_dir_all(&directory).expect("scratch directory");

        let mut settings =
            Persisted::<Settings>::load(directory.join("settings.json")).expect("settings");
        settings.database_path = directory.join("app.db");

        let mut database = Database::new(Arc::new(RwLock::new(settings)));
        database.connect().await.expect("the database should open");

        assert!(
            !database.is_ready().await,
            "a database with nothing in it reported itself ready"
        );

        database
            .execute_single_sql(crate::database::proxy::SQLQuery {
                sql: "CREATE TABLE tenant (id TEXT PRIMARY KEY, name TEXT)".to_string(),
                params: Vec::new(),
            })
            .await
            .expect("the schema should apply");

        assert!(
            database.is_ready().await,
            "a database holding the application's schema reported itself not ready"
        );

        database.disconnect().await;
        let _ = std::fs::remove_dir_all(&directory);
    }

    /// **The one-file rule, held by this file against itself.**
    ///
    /// `connect()` builds the `Local` arm, so a reconnect that fell through to it would put
    /// `sqlx` on the replica — in a locking domain the engine cannot see, writing rows change
    /// capture never records. Nothing would report it.
    #[tokio::test]
    async fn a_replica_is_never_reopened_as_a_plain_file() {
        use crate::{persisted::Persisted, settings::Settings};
        use std::sync::Arc;
        use tokio::sync::RwLock;

        let (directory, engine) = replica("reconnect-refusal").await;

        let mut settings =
            Persisted::<Settings>::load(directory.join("settings.json")).expect("settings");
        settings.database_path = directory.join("app.db");

        let mut database = Database::new(Arc::new(RwLock::new(settings)));
        database.engine = Some(Engine::Workspace(engine));

        let refusal = database.reconnect().await;

        assert!(
            refusal.is_err(),
            "a replica was reopened, and whichever engine lost that race lost it silently"
        );
        assert!(
            matches!(database.engine, Some(Engine::Workspace(_))),
            "the replica arm was replaced even though the reconnect refused"
        );

        database.engine = None;
        let _ = std::fs::remove_dir_all(&directory);
    }
    /// One row per concept under the shipped schema, named by `marker`.
    ///
    /// The ids are the client's own — `TEXT`, unique per call — which is requirement 16's scheme
    /// and what the uncontended test exists to hold.
    fn text_keyed_rows(marker: &str) -> Vec<String> {
        let id = |concept: &str| format!("{marker}-{concept}");

        vec![
            format!(
                "INSERT INTO complex (id, name, location) VALUES ('{}', 'complex {marker}', 'riyadh')",
                id("complex")
            ),
            format!(
                "INSERT INTO unit (id, name, status, complex_id) VALUES ('{}', 'unit {marker}', 'vacant', '{}')",
                id("unit"),
                id("complex")
            ),
            format!(
                "INSERT INTO tenant (id, national_id, name, phone) VALUES ('{}', '{marker}', 'tenant {marker}', '{marker}')",
                id("tenant")
            ),
            format!(
                "INSERT INTO contract (id, gov_id, status, start_date, end_date, interval_in_months, cost_per_interval, tenant_id) VALUES ('{}', '{marker}', 'active', 1, 2, '12', 1000.0, '{}')",
                id("contract"),
                id("tenant")
            ),
            format!(
                "INSERT INTO contract_unit (contract_id, unit_id) VALUES ('{}', '{}')",
                id("contract"),
                id("unit")
            ),
            format!(
                "INSERT INTO payment (id, date, amount, contract_id) VALUES ('{}', 1, 500.0, '{}')",
                id("payment"),
                id("contract")
            ),
            format!(
                "INSERT INTO history (id, at, concept, record_id, action, record) VALUES ('{}', 1, 'contract', '{}', 'create', '{{}}')",
                id("history"),
                id("contract")
            ),
        ]
    }

    /// The same rows under the **pre-identity** schema, where the id is the next number up.
    ///
    /// Nothing states an id: that is the point. Each replica's first row takes 1 on both, which is
    /// the collision requirement 16 closed.
    fn number_keyed_rows(marker: &str) -> Vec<String> {
        vec![
            format!("INSERT INTO complex (name, location) VALUES ('complex {marker}', 'riyadh')"),
            format!(
                "INSERT INTO unit (name, status, complex_id) VALUES ('unit {marker}', 'vacant', 1)"
            ),
            format!(
                "INSERT INTO tenant (national_id, name, phone) VALUES ('{marker}', 'tenant {marker}', '{marker}')"
            ),
            format!(
                "INSERT INTO contract (gov_id, status, start_date, end_date, interval_in_months, cost_per_interval, tenant_id) VALUES ('{marker}', 'active', 1, 2, '12', 1000.0, 1)"
            ),
            format!("INSERT INTO payment (date, amount, contract_id) VALUES (1, 500.0, 1)"),
            format!(
                "INSERT INTO history (at, concept, record_id, action, record) VALUES (1, 'contract', 1, 'create', '{{}}')"
            ),
        ]
    }

    /// Every concept a row was written into under the pre-identity schema.
    ///
    /// `contract_unit` is absent because it has no id to collide on, which is a different finding
    /// and is the subject of `distinct` above.
    const NUMBER_KEYED_CONCEPTS: [&str; 6] = [
        "complex", "unit", "tenant", "contract", "payment", "history",
    ];

    /// **Two devices, each creating records the other has never seen, lose nothing** — criterion
    /// 17, and the guaranteed half of criterion 9.
    ///
    /// Counted rather than spot-checked, and run for every concept the schema carries — read off
    /// the database rather than listed, so `history` is covered because it is there rather than
    /// because somebody remembered it. **Both counts are asserted**: the number of rows, and the
    /// number of *distinct* rows, because `contract_unit` carries no key and a merge that dropped
    /// one device's link while applying the other's twice would leave the first count right.
    ///
    /// This is the case requirement 16 closed, so it is expected to pass — and it is written so
    /// that a regression in identity fails it, because two replicas minting one id is what it
    /// counts.
    #[ignore = "reaches a live Turso account; see the module comment above for how to run it"]
    #[tokio::test]
    async fn a_losing_writer_loses_nothing_where_neither_writer_touched_the_other() {
        let workspace = LiveWorkspace::create("unrelated").await;

        let (first_dir, first) = workspace.replica("unrelated-a").await;
        let (second_dir, second) = workspace.replica("unrelated-b").await;

        workspace
            .apply_schema_remotely(shipped_migration_count())
            .await;

        assert!(
            first.pull().await.expect("pull the schema"),
            "the first replica pulled nothing, so it has no schema to write against"
        );
        let a = first.connect().await.expect("connection a");

        assert!(
            second.pull().await.expect("pull the schema"),
            "the second replica pulled nothing, so everything below would be measuring an empty \
             database against itself"
        );
        let b = second.connect().await.expect("connection b");

        // Both write before either syncs, which is what makes them divergent rather than
        // sequential. Nothing here reaches the network.
        for statement in text_keyed_rows("a") {
            run(&a, &statement).await;
        }
        for statement in text_keyed_rows("b") {
            run(&b, &statement).await;
        }

        first.push().await.expect("push a");
        second.pull().await.expect("pull into b");
        second.push().await.expect("push b");
        first.pull().await.expect("pull into a");

        let carried = concepts(&a).await;

        assert!(
            carried.iter().any(|name| name == "history"),
            "the schema read back carries no history table, and it is the one criterion 17 names"
        );

        for concept in &carried {
            for (side, connection) in [("first", &a), ("second", &b)] {
                assert_eq!(
                    count(connection, concept).await,
                    2,
                    "{concept}: the {side} device is missing a record after both synced"
                );
                assert_eq!(
                    distinct(connection, concept).await,
                    2,
                    "{concept}: the {side} device holds two rows that are not distinct, so one \
                     device's record was replaced by a copy of the other's"
                );
            }
        }

        eprintln!(
            "every record survived on both replicas, across {} concepts: {}",
            carried.len(),
            carried.join(", ")
        );

        drop(a);
        drop(b);
        drop(first);
        drop(second);
        let _ = std::fs::remove_dir_all(&first_dir);
        let _ = std::fs::remove_dir_all(&second_dir);
        workspace.destroy().await;
    }

    /// **The contended loss is per column, and the engine ships values rather than statements** —
    /// criterion 9, which asks that per statement, per row and per record identity all be ruled
    /// out rather than merely be consistent with the result.
    ///
    /// **The second device's update is written so that replaying it would do nothing.** It selects
    /// the row by the column the first device is about to change (`WHERE name = 'before'`), so an
    /// engine that shipped SQL text and re-ran it against the merged row would match no row and
    /// leave `phone` at its seeded value. An engine that ships the changed columns applies it
    /// regardless of what happened to `name`. The two outcomes differ, which the first draft of
    /// this test could not say: it used `WHERE id = 't'`, and a statement replayed against the
    /// merged row produces exactly the result column shipping produces.
    ///
    /// Decision 11 reached *per column* by reading the sync engine's source. This is the run that
    /// turns that into an observation, which is what criterion 9 asks for.
    #[ignore = "reaches a live Turso account; see the module comment above for how to run it"]
    #[tokio::test]
    async fn a_losing_writer_loses_per_column_and_not_per_statement() {
        let workspace = LiveWorkspace::create("contended").await;

        let (first_dir, first) = workspace.replica("contended-a").await;
        let (second_dir, second) = workspace.replica("contended-b").await;

        workspace
            .apply_schema_remotely(shipped_migration_count())
            .await;

        assert!(
            first.pull().await.expect("pull the schema"),
            "the first replica pulled nothing, so it has no schema to seed"
        );
        let a = first.connect().await.expect("connection a");

        run(
            &a,
            "INSERT INTO tenant (id, national_id, name, phone) VALUES ('t', '1', 'before', '000')",
        )
        .await;
        first.push().await.expect("push the seed");

        assert!(
            second.pull().await.expect("pull the seed"),
            "the second replica pulled nothing, so it has no row to contend over"
        );
        let b = second.connect().await.expect("connection b");

        assert_eq!(
            text(&b, "SELECT name FROM tenant WHERE id = 't'").await,
            Some("before".to_string()),
            "the seed did not reach the second replica, so nothing below is contended"
        );

        // Different columns of one row, both offline, and the second selects on the column the
        // first is changing.
        run(&a, "UPDATE tenant SET name = 'named by a' WHERE id = 't'").await;
        run(&b, "UPDATE tenant SET phone = '999' WHERE name = 'before'").await;

        first.push().await.expect("push a");
        second.pull().await.expect("pull into b");
        second.push().await.expect("push b");
        first.pull().await.expect("pull into a");

        assert_eq!(
            text(&a, "SELECT name FROM tenant WHERE id = 't'").await,
            Some("named by a".to_string()),
            "the first device's column was overwritten by an edit that did not touch it, so the \
             loss is coarser than per column"
        );
        assert_eq!(
            text(&a, "SELECT phone FROM tenant WHERE id = 't'").await,
            Some("999".to_string()),
            "the second device's edit did not apply. its statement selected on a column the first \
             device had changed, so this is what an engine shipping SQL text rather than column \
             values would produce"
        );

        // The same column, both offline. One of the two values stands; which one is the engine's
        // to decide and is not asserted, because a test that pinned it would be pinning an
        // ordering nothing promises.
        run(&a, "UPDATE tenant SET name = 'a wins' WHERE id = 't'").await;
        run(&b, "UPDATE tenant SET name = 'b wins' WHERE id = 't'").await;

        first.push().await.expect("push a again");
        second.pull().await.expect("pull into b again");
        second.push().await.expect("push b again");
        first.pull().await.expect("pull into a again");

        let standing = text(&a, "SELECT name FROM tenant WHERE id = 't'").await;

        assert!(
            standing == Some("a wins".to_string()) || standing == Some("b wins".to_string()),
            "a contended column came back as {standing:?}, which is neither writer's value"
        );
        assert_eq!(
            count(&a, "tenant").await,
            1,
            "a contended edit produced a second row, so identity is not what resolves it"
        );

        eprintln!("the contended column resolved to {standing:?}, and neither side was told");

        drop(a);
        drop(b);
        drop(first);
        drop(second);
        let _ = std::fs::remove_dir_all(&first_dir);
        let _ = std::fs::remove_dir_all(&second_dir);
        workspace.destroy().await;
    }

    /// **A row deleted under a concurrent edit is taken whole, with no error on either side** —
    /// criterion 9's third clause, and the exception [[rules/data]] holds undo to.
    ///
    /// **The edit is read back before either side syncs**, so the test can only reach its
    /// assertions by having had something to lose. Without that it passes on a replica that never
    /// received the seed: an `UPDATE` matching no row succeeds, and both counts are zero because
    /// nothing was ever there.
    #[ignore = "reaches a live Turso account; see the module comment above for how to run it"]
    #[tokio::test]
    async fn a_losing_writer_loses_a_whole_row_deleted_under_a_concurrent_edit() {
        let workspace = LiveWorkspace::create("deleted").await;

        let (first_dir, first) = workspace.replica("deleted-a").await;
        let (second_dir, second) = workspace.replica("deleted-b").await;

        workspace
            .apply_schema_remotely(shipped_migration_count())
            .await;

        assert!(
            first.pull().await.expect("pull the schema"),
            "the first replica pulled nothing, so it has no schema to seed"
        );
        let a = first.connect().await.expect("connection a");

        run(
            &a,
            "INSERT INTO tenant (id, national_id, name, phone) VALUES ('t', '1', 'before', '000')",
        )
        .await;
        first.push().await.expect("push the seed");

        assert!(
            second.pull().await.expect("pull the seed"),
            "the second replica pulled nothing, so it has no row to edit"
        );
        let b = second.connect().await.expect("connection b");

        run(&a, "DELETE FROM tenant WHERE id = 't'").await;
        run(&b, "UPDATE tenant SET name = 'edited by b' WHERE id = 't'").await;

        assert_eq!(
            text(&b, "SELECT name FROM tenant WHERE id = 't'").await,
            Some("edited by b".to_string()),
            "the second device's edit never landed locally, so there is no edit for the deletion \
             to take and this test would pass having demonstrated nothing"
        );

        // Neither of these is expected to refuse, and that is half the finding: the writer whose
        // edit is about to be discarded is told nothing at the moment it is discarded.
        first
            .push()
            .await
            .expect("the deletion pushed with an error");
        second.pull().await.expect("pull into b");
        second.push().await.expect("the edit pushed with an error");
        first.pull().await.expect("pull into a");

        assert_eq!(
            count(&a, "tenant").await,
            0,
            "the deleted row came back, so a concurrent edit resurrects a record somebody deleted"
        );
        assert_eq!(
            count(&b, "tenant").await,
            0,
            "the device that edited the row still holds it, so the two replicas disagree about \
             whether it exists"
        );

        eprintln!("the edited row was taken whole, and neither push reported anything");

        drop(a);
        drop(b);
        drop(first);
        drop(second);
        let _ = std::fs::remove_dir_all(&first_dir);
        let _ = std::fs::remove_dir_all(&second_dir);
        workspace.destroy().await;
    }

    /// **The collision requirement 16 closed, run against the schema that had it** — criterion
    /// 17's *the pre-migration behaviour is captured as a failing test first*.
    ///
    /// **The variable is the migration, not a table invented to resemble one.** This applies the
    /// shipped migrations up to but not including `0003_serious_synch.sql`, which is the schema
    /// that shipped with `id integer PRIMARY KEY` throughout, and writes one record per concept on
    /// each of two replicas with no id stated. Both allocate the next number, both get 1, and the
    /// second push takes the first's record with it. The green counterpart is
    /// `a_losing_writer_loses_nothing_where_neither_writer_touched_the_other`, which is the same
    /// run against the full set of migrations and asserts every record survives, so the pair
    /// shows the migration is what closed it.
    ///
    /// **Do not "fix" the assertion that fewer records survive.** Losing them is the point. A run
    /// where two survive means the pre-identity schema stopped colliding, which is a reason to
    /// re-read requirement 16's justification rather than to edit a number. It is not a
    /// characterization test in [[rules/testing]]'s sense: there is no code here to correct
    /// alongside the expectation, because the schema it pins shipped out of existence at
    /// `4bc35646`.
    #[ignore = "reaches a live Turso account; see the module comment above for how to run it"]
    #[tokio::test]
    async fn a_losing_writer_lost_a_whole_record_before_identity_was_its_own() {
        let workspace = LiveWorkspace::create("identity").await;

        let (first_dir, first) = workspace.replica("identity-a").await;
        let (second_dir, second) = workspace.replica("identity-b").await;

        let identity_migration = shipped_migration_count();

        assert!(
            identity_migration >= 2,
            "there are fewer migrations than the schema this test needs to stop before"
        );

        let a = first.connect().await.expect("connection a");
        apply_schema(&a, identity_migration - 1).await;
        first.push().await.expect("push the pre-identity schema");

        assert!(
            second.pull().await.expect("pull the pre-identity schema"),
            "the second replica pulled nothing, so it is not writing against the same schema"
        );
        let b = second.connect().await.expect("connection b");

        for statement in number_keyed_rows("a") {
            run(&a, &statement).await;
        }
        for statement in number_keyed_rows("b") {
            run(&b, &statement).await;
        }

        first.push().await.expect("push a");
        second.pull().await.expect("pull into b");
        second.push().await.expect("push b");
        first.pull().await.expect("pull into a");

        for concept in NUMBER_KEYED_CONCEPTS {
            let survived = count(&a, concept).await;

            assert_eq!(
                survived, 1,
                "{concept}: two devices each allocating the next number apiece did not collide, \
                 which is the premise requirement 16 rests on"
            );
        }

        eprintln!(
            "under the pre-identity schema each concept kept one of the two records written; the \
             tenant that survived was {:?}",
            text(&a, "SELECT name FROM tenant").await
        );

        drop(a);
        drop(b);
        drop(first);
        drop(second);
        let _ = std::fs::remove_dir_all(&first_dir);
        let _ = std::fs::remove_dir_all(&second_dir);
        workspace.destroy().await;
    }
}
