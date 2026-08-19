pub mod commands;
pub mod migrations;
pub mod proxy;
pub mod version;

use sqlx::{
    AssertSqlSafe, Pool, Sqlite,
    sqlite::{SqliteConnectOptions, SqlitePoolOptions},
};
use std::{
    fs,
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

    pub async fn connect(&mut self) -> Result<(), Error> {
        let settings = self.settings.read().await;
        let db_path = settings.database_path.clone();
        let migration_dir = settings.migration_dir.clone();

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

        migrations::run(&pool, &migration_dir).await?;

        self.engine = Some(Engine::Local(pool));

        Ok(())
    }

    /// Open this machine's replica through the sync engine.
    ///
    /// **Nothing on the startup path calls this yet, and the reason is a credential rather than a
    /// decision.** The engine needs the workspace's database URL and a token to reach it with;
    /// both come from the control plane's mint, which nothing on this machine calls — the
    /// sign-in answer carries `token` and `url` and this application reads neither. Until that
    /// arrives this is the seam it plugs into, and the arm the proxy's both-engines test runs.
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
    pub async fn connect_workspace<F, Fut>(
        &mut self,
        remote_url: Option<String>,
        auth_token: F,
    ) -> Result<(), Error>
    where
        F: Fn() -> Fut + Send + Sync + 'static,
        Fut: std::future::Future<Output = std::result::Result<String, turso::Error>>
            + Send
            + 'static,
    {
        let db_path = { self.settings.read().await.database_path.clone() };

        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        self.engine = Some(Engine::Workspace(
            Self::open_replica(&db_path, remote_url, auth_token).await?,
        ));

        Ok(())
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
    /// Both callers reach this while deciding whether to take a snapshot, which the replica
    /// refuses anyway, so nothing is lost by refusing here first.
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

    pub async fn create_backup(&self, backup_path: &Path) -> Result<(), Error> {
        match self.engine.as_ref().ok_or_else(Self::not_connected)? {
            Engine::Local(pool) => Self::create_backup_from_pool(pool, backup_path).await,
            Engine::Workspace(_) => Err(Self::not_on_a_replica("copy the database out")),
        }
    }

    async fn create_backup_from_pool(pool: &Pool<Sqlite>, backup_path: &Path) -> Result<(), Error> {
        if let Some(parent) = backup_path.parent() {
            fs::create_dir_all(parent)?;
        }

        if backup_path.exists() {
            fs::remove_file(backup_path)?;
        }

        // `VACUUM INTO` takes no bind parameter, so the destination has to be written into
        // the statement. Asserted safe: the path is chosen by the application rather than
        // supplied by a caller, and the quote doubling above is SQLite's own escaping for
        // a string literal.
        let escaped_path = backup_path.to_string_lossy().replace('\'', "''");
        sqlx::query(AssertSqlSafe(format!("VACUUM INTO '{}'", escaped_path)))
            .execute(pool)
            .await?;

        Ok(())
    }

    pub async fn restore_backup(&mut self, backup_path: &Path) -> Result<(), Error> {
        match self.engine.as_ref() {
            // Refused before anything is deleted. What this does is purge the file and copy
            // another one over it, and on a replica that is not a restore — it is a replica
            // replaced by a plain SQLite file the engine has no change history for.
            Some(Engine::Workspace(_)) => {
                return Err(Self::not_on_a_replica("replace the database wholesale"));
            }
            // Matched rather than tested with `matches!`, so this method owes an answer for a
            // third arm the same way every other one here does.
            Some(Engine::Local(_)) | None => {}
        }

        let settings = self.settings.read().await;

        let db_path = settings.database_path.clone();

        drop(settings);

        self.disconnect().await;

        Self::purge_related_paths(&db_path).unwrap_or_else(|error| {
            Self::panic_restore_failure(
                "purging current database files",
                &db_path,
                backup_path,
                error,
            )
        });

        if let Some(parent) = db_path.parent() {
            fs::create_dir_all(parent).unwrap_or_else(|error| {
                Self::panic_restore_failure(
                    "creating restore destination directory",
                    &db_path,
                    backup_path,
                    error,
                )
            });
        }

        fs::copy(backup_path, &db_path).unwrap_or_else(|error| {
            Self::panic_restore_failure(
                "copying the selected backup into place",
                &db_path,
                backup_path,
                error,
            )
        });

        self.connect().await.unwrap_or_else(|error| {
            Self::panic_restore_failure(
                "reconnecting to the restored database",
                &db_path,
                backup_path,
                error,
            )
        });

        Ok(())
    }

    fn panic_restore_failure(
        phase: &str,
        db_path: &Path,
        backup_path: &Path,
        error: impl std::fmt::Display,
    ) -> ! {
        panic!(
            "fatal: backup restore entered an unrecoverable state during {} (active database: {}, backup: {}): {}",
            phase,
            db_path.display(),
            backup_path.display(),
            error,
        );
    }

    fn get_related_paths(db_path: &Path) -> Vec<PathBuf> {
        let db_path = db_path.to_path_buf();
        let suffixes = ["-wal", "-shm", "-journal"];

        let mut paths = vec![db_path.clone()];
        let base = db_path.to_string_lossy().into_owned();

        for suffix in suffixes {
            paths.push(PathBuf::from(format!("{}{}", base, suffix)));
        }

        paths
    }

    fn purge_related_paths(db_path: &Path) -> Result<(), Error> {
        for path in Self::get_related_paths(db_path) {
            if path.exists() {
                std::fs::remove_file(&path).map_err(|e| Error::Io {
                    message: format!("failed to delete {}: {}", path.to_string_lossy(), e),
                })?;
            }
        }

        Ok(())
    }

    fn not_connected() -> Error {
        Error::PreconditionFailed {
            message: "database not connected".to_string(),
        }
    }

    /// What a caller gets for asking the replica to do something only a plain file can do.
    ///
    /// Both refusals are one rule: nothing but the engine opens the replica. They read as gaps,
    /// and the surfaces behind them — a snapshot on disk, a restore from one — are the surface a
    /// hosted workspace retires. It retires on its own ticket rather than here.
    fn not_on_a_replica(what: &str) -> Error {
        Error::PreconditionFailed {
            message: format!(
                "cannot {what} while the workspace is a replica: nothing but the sync engine opens that file"
            ),
        }
    }

    pub async fn is_ready(&self) -> bool {
        match self.engine.as_ref() {
            Some(Engine::Local(pool)) => Self::is_pool_ready(pool).await,
            Some(Engine::Workspace(database)) => Self::is_replica_ready(database).await,
            None => false,
        }
    }

    async fn is_pool_ready(pool: &Pool<Sqlite>) -> bool {
        let row: Option<i32> = sqlx::query_scalar(migrations::TABLE_EXISTS)
            .fetch_one(pool)
            .await
            .ok();

        matches!(row, Some(1))
    }

    /// The same question, asked of the replica, and it cannot be asked the same way.
    ///
    /// **`migrations::TABLE_EXISTS` is the wrong probe here and would never be true.** It looks
    /// for `__migrations__`, which is this client's own ledger of migrations it applied — and a
    /// replica applies none. Its schema is the control plane's, arriving as replicated pages, and
    /// nothing in it is called that. A readiness probe that is permanently false is worse than
    /// none: the two callers respond to it by reconnecting.
    ///
    /// So the question becomes the one it always meant — *does this file hold the application's
    /// schema yet* — asked of any table that is not the engine's own bookkeeping. A replica that
    /// has never pulled holds `turso_cdc` and its kin and nothing else, and is not ready.
    async fn is_replica_ready(database: &turso::sync::Database) -> bool {
        let Ok(connection) = database.connect().await else {
            return false;
        };

        let Ok(mut rows) = connection.query(Self::REPLICA_HAS_A_SCHEMA, ()).await else {
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

    /// Whether the replica holds a schema of the application's rather than only the engine's.
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
    const REPLICA_HAS_A_SCHEMA: &'static str = "SELECT count(*) FROM sqlite_master \
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

    /// **A machine that has signed in and not yet pulled has no schema, and says so.**
    ///
    /// The probe this replaced looked for `__migrations__`, the ledger of migrations this client
    /// applied — and on the hosted path it applies none, so that probe answers *not ready* for a
    /// replica holding the whole workspace. Both callers of `is_ready` respond to a false by
    /// reconnecting, which on a replica is refused, so the failure would present as a snapshot
    /// that could never be taken rather than as a wrong answer.
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
}
