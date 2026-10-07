pub(crate) mod bound;
pub mod command;
pub(crate) mod corrupt;
pub mod floor;
mod held;
mod plugin;
pub mod proxy;
pub(crate) mod replay;
pub mod step;
#[cfg(test)]
pub(crate) mod test;
pub(crate) mod unsendable;
pub mod version;

pub use plugin::plugin;

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
    clock::{self, Clock},
    database::{
        bound::{Bound, SYNC_BOUND, bounded},
        floor::{Floors, Standing},
        proxy::{SQLQuery, SQLRow},
    },
    error::{Error, RefusalReason},
    persisted::Persisted,
    settings::Settings,
    turso::platform::read_sync_refusal,
};

/// what one replication did, and why it did not where it did not.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Replicated {
    pub pushed: bool,
    pub received: bool,
    pub refusal: Option<Error>,
    /// whether either half went through: the remote took the push, or answered the pull, whether
    /// or not it had anything to bring.
    ///
    /// **Distinct from `pushed || received`, which is whether anything moved.** A pull that
    /// reached the remote and found nothing new answers `received: false` and is still a
    /// replication that went through, and it is the ordinary heartbeat on a quiet day; the moment
    /// the standing block says beside "up to date" is that moment, not the last one rows crossed
    /// (effort 828, requirement 25). A refusal is not a reach.
    pub completed: bool,
}

/// what one pull did: whether the remote answered, and whether it had anything to bring.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Pulled {
    /// the remote answered, with rows or with nothing new. `false` is the offline case.
    pub completed: bool,
    /// rows arrived, so derived state has to be reconciled.
    pub brought: bool,
}

/// [`Database::replicate`] over the engine alone, so a test can hold a replica against a
/// scripted remote without a `Database` around it.
///
/// `watch` records damage either half reports beside the replica (`corrupt.rs`), and `bound` is
/// how long each half may wait on the remote before it is the offline case (`bound.rs`).
/// `pushing` is whether this build may write the workspace: where it may not, only the pull goes
/// (effort 857, requirement 6).
///
/// **Changes the workspace refuses because an upgrade removed what they name stop both halves**
/// (effort 857, ticket 13): the refusal is recorded beside the replica, nothing is pulled after
/// it, and a replica holding such a record is neither pushed nor pulled, since either drops the
/// changes without a word (`unsendable.rs`). The person is asked before they go.
pub(crate) async fn replicate_engine(
    database: &turso::sync::Database,
    watch: &corrupt::Watch,
    bound: Bound,
    pushing: bool,
) -> Replicated {
    if watch.replica().is_some_and(unsendable::held) {
        return Replicated::unsendable();
    }

    let mut refusal = None;
    let pushed = pushing
        && match watch.note(bounded(bound, "push", database.push()).await) {
            Ok(()) => true,
            Err(error) => {
                if held_as_unsendable(watch, &error) {
                    return Replicated::unsendable();
                }

                refusal = read_sync_refusal(&error);
                false
            }
        };
    let pulled = match watch.note(bounded(bound, "pull", database.pull()).await) {
        Ok(brought) => Some(brought),
        Err(error) => {
            if held_as_unsendable(watch, &error) {
                return Replicated::unsendable();
            }

            if refusal.is_none() {
                refusal = read_sync_refusal(&error);
            }
            None
        }
    };

    Replicated {
        pushed,
        received: pulled.unwrap_or(false),
        refusal,
        completed: pushed || pulled.is_some(),
    }
}

/// Whether `error`, a push's or a pull's, is changes the workspace refuses because an upgrade
/// removed what they name; where it is, the refusal is recorded beside the replica `watch` is over,
/// so nothing pushes or pulls it again (`unsendable.rs`).
fn held_as_unsendable(watch: &corrupt::Watch, error: &turso::Error) -> bool {
    let refusal = error.to_string();

    if !unsendable::names_what_the_upgrade_removed(&refusal) {
        return false;
    }

    if let Some(replica) = watch.replica() {
        unsendable::hold(replica, &refusal);
    }

    true
}

impl Replicated {
    /// A replication that sent nothing and brought nothing, because the replica holds changes the
    /// workspace refuses since an upgrade.
    fn unsendable() -> Self {
        Replicated {
            pushed: false,
            received: false,
            refusal: Some(unsendable::refusal()),
            completed: false,
        }
    }
}

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
    Workspace(Replica),
}

/// What the interface asks of the open workspace, one statement or a batch, as
/// [`Database::held`] runs it, again where it has to wait for a verdict.
trait Request: Clone + Send {
    type Answer: Send;

    /// Run it on `connection`.
    fn run(
        self,
        connection: &corrupt::Watched,
    ) -> impl Future<Output = Result<Self::Answer, Error>> + Send + '_;
}

impl Request for SQLQuery {
    type Answer = Vec<SQLRow>;

    fn run(
        self,
        connection: &corrupt::Watched,
    ) -> impl Future<Output = Result<Self::Answer, Error>> + Send + '_ {
        proxy::workspace_execute_single_sql(connection, self)
    }
}

impl Request for Vec<SQLQuery> {
    type Answer = Vec<Vec<SQLRow>>;

    fn run(
        self,
        connection: &corrupt::Watched,
    ) -> impl Future<Output = Result<Self::Answer, Error>> + Send + '_ {
        proxy::workspace_execute_batch_sql(connection, self)
    }
}

/// A workspace's replica: the sync engine, and the connections its requests are served on.
///
/// **The two are opened together and go together**, because the connections are what keeps a
/// request off the engine's own mutex while a push or a pull waits on the network (`held.rs`).
pub struct Replica {
    engine: turso::sync::Database,
    connections: held::Held,
}

impl Replica {
    /// Hold `engine` with its connections, opened now, before anything can push or pull it.
    pub(crate) async fn open(
        engine: turso::sync::Database,
        watch: &corrupt::Watch,
    ) -> Result<Self, turso::Error> {
        let connections = held::Held::open(&engine, watch, held::SIZE).await?;

        Ok(Replica {
            engine,
            connections,
        })
    }
}

/// the database as the plugin manages it, made in its setup: one engine behind one lock, which the
/// commands, the startup and the organization's opening of a workspace all take.
pub type Shared = Arc<RwLock<Database>>;

pub struct Database {
    engine: Option<Engine>,
    /// where the replica the `Workspace` arm holds lies, so damage met on it after it opened is
    /// recorded beside it (`corrupt.rs`). Empty on the `Local` arm and with no engine.
    watch: corrupt::Watch,
    settings: Arc<RwLock<Persisted<Settings>>>,
    /// what says when a damaged replica was set aside, in the name it is set aside under.
    clock: clock::Shared,
    /// how long a push or a pull of the replica may wait on the remote (`bound.rs`).
    bound: Bound,
    /// where this build stands against the open workspace's floors, as the organization last
    /// judged them (effort 857, ticket 04): set by every open and every heartbeat, writable with
    /// no workspace open and until the first verdict, and let go of with the engine.
    standing: std::sync::Mutex<Standing>,
    /// held for writing while the open workspace is pulled and judged over what the pull brought
    /// ([`Database::judging`], effort 857, ticket 27), so no write lands between the two. A
    /// request holds it for reading while it runs.
    judging: tokio::sync::RwLock<()>,
}

impl Database {
    /// the file's name, which the settings hold, since it is their setup that says where it is.
    pub const FILENAME: &'static str = Settings::DATABASE_FILENAME;

    pub fn new(settings: Arc<RwLock<Persisted<Settings>>>, clock: clock::Shared) -> Self {
        Database {
            engine: None,
            watch: corrupt::Watch::default(),
            settings,
            clock,
            bound: SYNC_BOUND,
            standing: std::sync::Mutex::new(Standing::Writable),
            judging: tokio::sync::RwLock::new(()),
        }
    }

    /// The same database with its pushes and pulls given up after `bound`, which is how a test
    /// against a silent remote finishes in seconds.
    #[cfg(test)]
    pub(crate) fn with_bound(mut self, bound: Bound) -> Self {
        self.bound = bound;
        self
    }

    /// Open this machine's database as a plain file.
    ///
    /// **It applies no migrations, and that is requirement 11 rather than an omission.** A
    /// workspace's schema is applied to its database over the wire, at creation and under a
    /// lease (`organization/lease/apply.rs`); the replica receives it as replicated pages. A client
    /// that applied DDL of its own would not merely duplicate that work: DDL issued through the
    /// sync connection is captured as CDC and replicates, so one client's migration would reach
    /// every other replica.
    ///
    /// `tauri/migrations/` stays in the tree as what `build.rs` embeds for
    /// `organization/lease/apply.rs` and counts to produce `WORKSPACE_SCHEMA_VERSION`. Nothing
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
        self.watch = corrupt::Watch::default();

        Ok(())
    }

    /// Open this machine's replica through the sync engine.
    ///
    /// **The startup path calls this.** `startup` reaches it with the workspace's URL and
    /// the credential the member's vault unsealed for it.
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
    /// local file and reaches nothing, which is what a machine that holds no workspace should do.
    ///
    /// **The file is named for the workspace, not for the machine.** One person signing out and
    /// another signing in on the same computer would otherwise open the second account's replica
    /// over the first account's rows *and* the first account's sync metadata, so the second would
    /// be reading somebody else's ledger and pushing against a revision that is not theirs. A path
    /// derived from the workspace makes the binding structural rather than something a sign-out has
    /// to remember to clean up. *What it leaves behind is the previous workspace's file, and
    /// membership is what ends that: [`Self::remove_replica`] is reached only where the
    /// organization says the account holding it is no longer a member.*
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

        let engine =
            Self::open_replica(self.clock.as_ref(), &db_path, remote_url, auth_token).await?;
        let watch = corrupt::Watch::over(&db_path);

        // **The connections are opened here, before the engine is handed out**, since nothing can
        // push or pull it yet and `connect()` therefore waits on nothing (`held.rs`).
        self.engine = Some(Engine::Workspace(Replica::open(engine, &watch).await?));
        self.watch = watch;

        Ok(())
    }

    /// Where one workspace's replica lives, beside the plain file rather than over it.
    ///
    /// `app.db` stays what the seeded and test paths use, and every replica is `ws-<id>.db` next
    /// to it. Two workspaces on one machine therefore never meet, and neither meets `app.db`.
    ///
    /// **`ws-` is the organization's own name for the database, not a local abbreviation.**
    /// `create_workspace` in `organization/workspace/` builds `ws-<id>`, and
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
        Self::remove_replica_files(&Self::replica_path(database_path, workspace_id))
    }

    /// Remove one replica's file and everything the engine keeps beside it, whatever the replica
    /// is a replica of. The organization replica goes the same way as a workspace's.
    pub(crate) fn remove_replica_files(replica: &Path) -> bool {
        Self::replica_files(replica)
            .into_iter()
            .filter(|file| std::fs::remove_file(file).is_ok())
            .count()
            > 0
    }

    /// One replica's file and every file the engine keeps beside it, as far as they exist, and
    /// the one place the sidecar list is spelled. What removes a replica and what sets a damaged
    /// one aside (`corrupt.rs`) both walk this. The application's own marker of damage met after
    /// the open, `corrupt::MARKER`, goes with them.
    fn replica_files(replica: &Path) -> Vec<PathBuf> {
        let mut files: Vec<PathBuf> = std::iter::once(replica.to_path_buf())
            .chain(
                Self::REPLICA_SIDECARS
                    .iter()
                    .chain([&corrupt::MARKER, &unsendable::MARKER])
                    .map(|suffix| PathBuf::from(format!("{}{suffix}", replica.display()))),
            )
            .filter(|file| file.exists())
            .collect();

        // **The transient markers are named per attempt**, so they are found by prefix rather than
        // by name. A directory that cannot be read leaves them, which is the same outcome as a file
        // that will not move: reported by the caller finding the replica still tracked.
        let (Some(parent), Some(stem)) = (replica.parent(), replica.file_name()) else {
            return files;
        };

        let transient = format!(
            "{}{}",
            stem.to_string_lossy(),
            Self::REPLICA_TRANSIENT_PREFIX
        );

        if let Ok(entries) = std::fs::read_dir(parent) {
            files.extend(
                entries
                    .flatten()
                    .filter(|entry| entry.file_name().to_string_lossy().starts_with(&transient))
                    .map(|entry| entry.path()),
            );
        }

        files
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
    ///
    /// **Nothing is pushed of a workspace this build may not write** (effort 857, requirement 9):
    /// what it captured before the floor rose stays captured, and goes once it has updated.
    ///
    /// **Nor of one holding changes the workspace refused since an upgrade** (ticket 13): a second
    /// push is what drops them, so it is never made, and a push refused that way records it.
    pub async fn push_replica(&self) -> bool {
        if self.standing() != Standing::Writable || self.holds_unsendable() {
            return false;
        }

        match self.engine.as_ref() {
            Some(Engine::Workspace(replica)) => {
                match self
                    .watch
                    .note(bounded(self.bound, "push", replica.engine.push()).await)
                {
                    Ok(()) => true,
                    Err(error) => {
                        held_as_unsendable(&self.watch, &error);
                        false
                    }
                }
            }
            Some(Engine::Local(_)) | None => false,
        }
    }

    /// Whether the open replica holds changes the workspace refused because an upgrade removed
    /// what they name, which nothing sends or brings over until the person discards them
    /// (`unsendable.rs`).
    pub fn holds_unsendable(&self) -> bool {
        self.watch.replica().is_some_and(unsendable::held)
    }

    /// Whether the open replica holds changes it has not sent yet: what the opening pull is held
    /// back for (`organization/workspace/open.rs`), since a pull laid over changes the workspace
    /// can no longer take fails and holds the file locked (`unsendable.rs`). The engine counts them
    /// itself, and the count falls to nothing once a push has taken them. A count it cannot give
    /// reads as nothing held, so the opening pulls as it did before: holding back the first pull of
    /// a replica that has never had one would leave it with no tables.
    pub async fn holds_unsent(&self) -> bool {
        match self.engine.as_ref() {
            Some(Engine::Workspace(replica)) => replica
                .engine
                .stats()
                .await
                .is_ok_and(|stats| stats.cdc_operations > 0),
            Some(Engine::Local(_)) | None => false,
        }
    }

    /// Discard the changes the open replica holds that the workspace refused since an upgrade, at
    /// the person's word (effort 857, ticket 13): the replica is let go of and removed with
    /// everything beside it, its record of the refusal included, and the caller opens the workspace
    /// again, which makes a fresh copy of what the remote holds.
    ///
    /// **Refused while nothing is held**, so changes that could still be sent are never thrown
    /// away by this, and refused on anything but a replica. What else the replica held unsent goes
    /// with it, and that is what the person is told before they say yes.
    pub async fn discard_unsendable(&mut self) -> Result<(), Error> {
        let Some(replica) = self.watch.replica().map(Path::to_path_buf) else {
            return Err(Self::nothing_unsendable());
        };

        if !matches!(self.engine, Some(Engine::Workspace(_))) || !unsendable::held(&replica) {
            return Err(Self::nothing_unsendable());
        }

        self.disconnect().await;
        Self::remove_replica_files(&replica);
        unsendable::forget(&replica);

        crate::diagnostics::warn("database.unsendable.discarded")
            .with("replica", replica.display().to_string())
            .write();

        Ok(())
    }

    fn nothing_unsendable() -> Error {
        Error::PreconditionFailed {
            message: "this workspace holds no changes it was refused, so nothing was discarded"
                .to_string(),
        }
    }

    /// Ask the replica for what the remote has, and say whether the remote answered and whether
    /// anything arrived.
    ///
    /// **A failure is an answer rather than an error to raise.** Being unable to reach the remote
    /// is the offline case, and the replica goes on serving what it holds, so the caller is told
    /// and decides, which for a replica that has never pulled is a different decision from one
    /// for a replica that has.
    ///
    /// **A replica holding changes the workspace refused since an upgrade is not pulled** (ticket
    /// 13), since a pull drops them, and a pull that fails laying them over a changed remote
    /// records that it did.
    pub async fn pull_replica(&self) -> Pulled {
        if self.holds_unsendable() {
            return Pulled {
                completed: false,
                brought: false,
            };
        }

        match self.engine.as_ref() {
            // **`pull` answers `Ok(false)` when there was nothing to bring**, and that bool is the
            // answer rather than the call succeeding. Reading it as `is_ok()` made every online
            // dispatch report rows and put a whole-table reconcile and a root cache invalidation
            // behind every mutation, forever, with nothing having arrived. The call succeeding is
            // still an answer of its own: the remote was reached, which is the moment the
            // standing block records.
            Some(Engine::Workspace(replica)) => match self
                .watch
                .note(bounded(self.bound, "pull", replica.engine.pull()).await)
            {
                Ok(brought) => Pulled {
                    completed: true,
                    brought,
                },
                Err(error) => {
                    held_as_unsendable(&self.watch, &error);

                    Pulled {
                        completed: false,
                        brought: false,
                    }
                }
            },
            Some(Engine::Local(_)) | None => Pulled {
                completed: false,
                brought: false,
            },
        }
    }

    /// Push and pull, and say why either half did not go where Turso refused it.
    ///
    /// The two calls above answer a bool because offline is the ordinary case and not an error;
    /// what they cannot say is that the remote was reached and said no, which is a different
    /// sentence for the person reading it (requirement 25) and a different act for the shell (a
    /// refused credential is collected again). The refusal is read at the response by
    /// `turso::platform::read_sync_refusal`, and the first refusal of the two halves is
    /// the one reported, because both are about the same database and the same credential.
    ///
    /// **A workspace this build may not write is pulled and not pushed** (effort 857, requirement
    /// 6): what the others wrote comes in, and nothing this build holds goes out.
    pub async fn replicate(&self) -> Replicated {
        match self.engine.as_ref() {
            Some(Engine::Workspace(replica)) => {
                replicate_engine(
                    &replica.engine,
                    &self.watch,
                    self.bound,
                    self.standing() == Standing::Writable,
                )
                .await
            }
            Some(Engine::Local(_)) | None => Replicated {
                pushed: false,
                received: false,
                refusal: None,
                completed: false,
            },
        }
    }

    /// Build the sync engine over one file.
    ///
    /// Separate from [`Database::connect_workspace`] so a caller can hold an engine without
    /// holding a `Database` — which is what the proxy's both-engines test needs, and it is the
    /// only test that can hold this arm to the other one.
    ///
    /// **A replica found damaged is set aside and opened once more, empty** (effort 838,
    /// requirement 17). Every replica, a workspace's and the organization's, is opened here, so
    /// every one is rebuilt the same way: the file and its sidecars renamed to
    /// `<name>.corrupt-<ms>`, a warning naming them and what was lost, and an empty replica that
    /// the caller's first pull fills from its remote, as it fills a replica made for the first
    /// time. `corrupt.rs` says what counts as damaged and why. Damage the engine reports after this
    /// has answered is recorded beside the replica by the reads that meet it, and set aside here at
    /// the next open.
    pub async fn open_replica<F, Fut>(
        clock: &dyn Clock,
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

        // **Held behind one handle so the open can be made twice**: a replica found damaged is
        // set aside and opened once more, empty, and that open needs the same credential.
        let auth_token = Arc::new(auth_token);

        // **A replica found damaged is set aside and opened again, once** (effort 838,
        // requirement 17), which `corrupt.rs` says the whole of. The first read is part of the
        // open because that is where the engine reports a damaged page it did not meet opening
        // the file; any other answer to it is left for the caller's own reads, as it was.
        Ok(corrupt::opened_once_more(clock, db_path, || {
            let auth_token = Arc::clone(&auth_token);
            let remote_url = remote_url.clone();

            async move {
                let mut builder = turso::sync::Builder::new_remote(&db_path.to_string_lossy())
                    .bootstrap_if_empty(false)
                    .with_auth_token_fn(move || auth_token());

                if let Some(remote_url) = remote_url {
                    builder = builder.with_remote_url(remote_url);
                }

                let database = builder.build().await?;

                if let Err(error) = Self::first_read(&database).await
                    && corrupt::reported(&error).is_some()
                {
                    return Err(error);
                }

                Ok(database)
            }
        })
        .await?)
    }

    /// Read the schema once, which is where a damaged first page shows itself.
    async fn first_read(database: &turso::sync::Database) -> Result<(), turso::Error> {
        let connection = database.connect().await?;
        let mut rows = connection
            .query("SELECT count(*) FROM sqlite_master", ())
            .await?;

        rows.next().await.map(|_| ())
    }

    /// Whether the engine has the replica at `replica` open: what a forget asks before it deletes
    /// a workspace's files, since the record's current workspace need not be the one the engine
    /// was left on (`organization::session::forget`).
    pub fn holds_replica(&self, replica: &Path) -> bool {
        matches!(self.engine, Some(Engine::Workspace(_))) && self.watch.is_over(replica)
    }

    /// Let go of the file.
    ///
    /// Taking the engine rather than closing it is what matters on the replica arm: there is no
    /// close to call, and the file is held for exactly as long as the engine is.
    pub async fn disconnect(&mut self) {
        self.watch = corrupt::Watch::default();
        self.hold(Standing::Writable);

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
            // A replica the engine never lets go of within the bound is not one this can say is
            // ready, and the checkout has logged why (`held.rs`).
            Some(Engine::Workspace(replica)) => match replica.connections.checkout().await {
                Ok(connection) => Self::is_replica_ready(&connection).await,
                Err(_) => false,
            },
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
    ///
    /// Asked on a connection the caller holds: on the workspace arm one checked out of the
    /// replica's, so it never waits on a push or a pull (`held.rs`).
    pub(crate) async fn is_replica_ready(connection: &turso::Connection) -> bool {
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
    /// The same three prefixes are `backup::NOT_THE_ENGINES`, which a copy leaves out; a prefix the
    /// engine adds is added to both. They are turso's own, read off a freshly built replica at
    /// 0.8.0-pre.4 and turso_core's `RESERVED_TABLE_PREFIXES` at 0.8:
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

    /// Where this build stands against the open workspace's floors, as last judged.
    pub fn standing(&self) -> Standing {
        self.standing
            .lock()
            .map(|standing| *standing)
            .unwrap_or(Standing::Unreadable)
    }

    /// Hold the open workspace for a verdict (effort 857, ticket 27): a pull and the judgment over
    /// what it brought run under this, so no write lands on the replica between the two, where it
    /// would commit after a raise the pull brought and before the verdict that refuses it.
    ///
    /// **Reads go on beside it, and writes wait for the verdict.** A request that meets a verdict
    /// being judged runs held to reading; one the engine refuses as a write waits for the verdict
    /// and runs again, held to it ([`Database::held`]). So a pull the network is slow to answer
    /// holds no read, which effort 854 (requirement 15) is owed, and a save made during it is
    /// judged by what it brought. Waits for the requests already running.
    pub(crate) async fn judging(&self) -> tokio::sync::RwLockWriteGuard<'_, ()> {
        self.judging.write().await
    }

    /// Keep `standing` as the open workspace's verdict: what the organization does at every open
    /// and every heartbeat, having judged the floors (effort 857, ticket 04).
    pub fn hold(&self, standing: Standing) {
        if let Ok(mut held) = self.standing.lock() {
            *held = standing;
        }
    }

    /// The open workspace's own floors, read from its replica as it stands
    /// ([`floor::workspace`](crate::database::floor::workspace)); `None` with no replica open, or
    /// one holding no version of its own. Reads and writes nothing.
    pub async fn floors(&self) -> Result<Option<Floors>, Error> {
        match self.engine.as_ref() {
            Some(Engine::Workspace(replica)) => {
                crate::database::floor::workspace(&*replica.connections.checkout().await?).await
            }
            Some(Engine::Local(_)) | None => Ok(None),
        }
    }

    /// Write `sql` to the open replica as a pull lays what it brings: on a connection of the
    /// replica's own, whatever the verdict holds, for a test standing in for a pull that brought
    /// it.
    #[cfg(test)]
    pub(crate) async fn as_a_pull_brings(&self, sql: &str) {
        let Some(Engine::Workspace(replica)) = self.engine.as_ref() else {
            panic!("no replica is open");
        };
        let connection = replica.connections.checkout().await.expect("a connection");

        crate::database::floor::hold_writes(&connection, Standing::Writable)
            .await
            .expect("writable");
        connection
            .execute(sql, ())
            .await
            .expect("what the pull brought");
    }

    /// Run one statement on the open database.
    ///
    /// **A workspace this build may not write refuses every write here** (effort 857, requirement
    /// 6): the connection is held to the standing before the statement runs
    /// ([`floor::hold_writes`](crate::database::floor::hold_writes)), so the engine refuses a write
    /// and serves a read, and its refusal is answered with the version as the reason. The `Local`
    /// arm is the seeded and test paths, which no organization judges, and is not held.
    pub async fn execute_single_sql(&self, query: SQLQuery) -> Result<Vec<SQLRow>, Error> {
        match self.engine.as_ref().ok_or_else(Self::not_connected)? {
            Engine::Local(pool) => proxy::execute_single_sql(pool, query).await,
            // A connection per request, checked out of the replica's own, which is what the pool
            // hands out on the other arm too. The engine arms change capture on every connection
            // it opens, so one it opened is one whose writes can be pushed, and one taken any
            // other way is not.
            Engine::Workspace(replica) => self.held(replica, query).await,
        }
    }

    /// Run a batch on the open database, as one transaction, held as
    /// [`Database::execute_single_sql`] holds one statement: a batch holding a write is refused
    /// whole, and rolled back, while this build may not write the workspace.
    pub async fn execute_batch_sql(
        &self,
        queries: Vec<SQLQuery>,
    ) -> Result<Vec<Vec<SQLRow>>, Error> {
        match self.engine.as_ref().ok_or_else(Self::not_connected)? {
            Engine::Local(pool) => proxy::execute_batch_sql(pool, queries).await,
            Engine::Workspace(replica) => self.held(replica, queries).await,
        }
    }

    /// Run `request` on a connection of `replica` held to the workspace's verdict, so the engine
    /// refuses a write this build may not make (effort 857, requirement 6), and answer its refusal
    /// with the version as the reason.
    ///
    /// **While a verdict is being judged** ([`Database::judging`]) the request runs held to
    /// reading: a read answers at once, and a write the engine refuses waits for the verdict and
    /// runs again, held to it. Its connection goes back before it waits, so the judgment, which
    /// reads the floors on one, is never left waiting on the requests waiting on it.
    async fn held<R: Request>(&self, replica: &Replica, request: R) -> Result<R::Answer, Error> {
        if let Ok(_judged) = self.judging.try_read() {
            let standing = self.standing();

            return Self::held_to(replica, standing, request)
                .await
                .map_err(|error| Self::refused_by_version(standing, error));
        }

        match Self::held_to(replica, Standing::ReadOnly, request.clone()).await {
            Err(error) if crate::database::floor::refused_a_write(&error) => {}
            answered => return answered,
        }

        let _judged = self.judging.read().await;
        let standing = self.standing();

        Self::held_to(replica, standing, request)
            .await
            .map_err(|error| Self::refused_by_version(standing, error))
    }

    /// Run `request` on a connection of `replica` held to `standing`, answering the engine's
    /// refusal of a write as it came.
    async fn held_to<R: Request>(
        replica: &Replica,
        standing: Standing,
        request: R,
    ) -> Result<R::Answer, Error> {
        let connection = replica.connections.checkout().await?;

        crate::database::floor::hold_writes(&connection, standing).await?;

        request.run(&connection).await
    }

    /// The engine's refusal of a write on a connection held to `standing`, as the refusal a person
    /// is told: the workspace upgraded past what this build writes, or past what it reads. Any
    /// other error is answered as it came.
    fn refused_by_version(standing: Standing, error: Error) -> Error {
        if !crate::database::floor::refused_a_write(&error) {
            return error;
        }

        match standing {
            Standing::Unreadable => Error::refused(
                RefusalReason::WorkspaceNewer,
                "a newer version of rentable upgraded this workspace past what this version reads. \
                 update rentable to open it; nothing was written",
            ),
            Standing::ReadOnly | Standing::Writable => Error::refused(
                RefusalReason::WorkspaceReadOnlyByVersion,
                "a newer version of rentable upgraded this workspace, and this version reads it but \
                 does not write to it. update rentable to make changes; nothing was written",
            ),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::test::workspace::{
        LiveWorkspace, apply_schema, concepts, count, distinct, run, shipped_migration_count, text,
    };
    use super::{Database, Engine};
    use crate::test::scratch;
    use serde_json::json;
    use std::sync::Arc;

    /// A replica engine over a file of its own, with no remote to reach.
    async fn replica(name: &str) -> (std::path::PathBuf, turso::sync::Database) {
        let directory = scratch(name);

        let database = Database::open_replica(
            &crate::clock::System,
            &directory.join("app.db"),
            None,
            || async { Ok::<String, turso::Error>(String::new()) },
        )
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
            !Database::is_replica_ready(&database.connect().await.expect("a connection")).await,
            "a replica with no schema in it reported itself ready"
        );

        drop(database);
        let _ = std::fs::remove_dir_all(&directory);
    }

    /// Requirement 25 and requirement 18 together, driven exactly: the remote refuses for the
    /// account, the replication says so as the account's rather than as a network failure, and
    /// every read and write goes on being served from the local replica while the refusal stands.
    /// A machine that cannot reach the remote at all is told nothing of the kind, which is the
    /// distinction the requirement exists to keep.
    #[tokio::test]
    async fn a_refusal_for_the_account_is_read_as_the_accounts_and_the_replica_goes_on_serving() {
        use crate::{
            error::{Error, RefusalReason},
            sync::test::server::{ScriptedResponse, ScriptedServer},
        };

        // every request Turso would get is answered as a blocked account.
        let refusing = ScriptedServer::start(
            (0..8)
                .map(|_| {
                    ScriptedResponse::new(
                        402,
                        r#"{"error":"BLOCKED: quota exceeded, upgrade the plan or enable overages"}"#,
                    )
                })
                .collect(),
        )
        .await;
        let directory = scratch("refused");
        let database = Database::open_replica(
            &crate::clock::System,
            &directory.join("app.db"),
            Some(refusing.url("")),
            || async { Ok::<String, turso::Error>("a-credential".to_string()) },
        )
        .await
        .expect("replica engine");

        let replicated =
            super::replicate_engine(&database, &Default::default(), super::SYNC_BOUND, true).await;

        assert!(!replicated.pushed);
        assert!(!replicated.received);
        assert_eq!(
            replicated.refusal,
            Some(Error::refused(
                RefusalReason::TursoAccountRefused,
                "BLOCKED: quota exceeded, upgrade the plan or enable overages"
            ))
        );

        // and the replica serves a write and a read while it stands.
        let connection = database.connect().await.expect("replica connection");

        connection
            .execute("create table tenant (id text primary key, name text)", ())
            .await
            .expect("the local schema");
        connection
            .execute(
                "insert into tenant (id, name) values ('t-1', 'served locally')",
                (),
            )
            .await
            .expect("the local write was refused");

        let mut rows = connection
            .query("select name from tenant where id = 't-1'", ())
            .await
            .expect("the local read");
        let row = rows.next().await.expect("a row").expect("the row");

        assert_eq!(
            row.get_value(0).expect("a value"),
            turso::Value::Text("served locally".to_string())
        );

        // a machine that reaches nothing is not told the account needs attention.
        let unreachable =
            ScriptedServer::start((0..8).map(|_| ScriptedResponse::hangup()).collect()).await;
        let offline = Database::open_replica(
            &crate::clock::System,
            &directory.join("offline.db"),
            Some(unreachable.url("")),
            || async { Ok::<String, turso::Error>("a-credential".to_string()) },
        )
        .await
        .expect("replica engine");

        let unreached =
            super::replicate_engine(&offline, &Default::default(), super::SYNC_BOUND, true).await;

        assert_eq!(unreached.refusal, None);

        // and neither a refusal nor being offline is a replication that went through, so neither
        // moves the moment the standing block says (effort 828, requirement 25).
        assert!(
            !replicated.completed,
            "a refused replication reads as one that went through"
        );
        assert!(
            !unreached.completed,
            "a replication that reached nothing reads as one that went through"
        );

        drop(rows);
        drop(connection);
        drop(database);
        drop(offline);
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
            Database::is_replica_ready(&database.connect().await.expect("a connection")).await,
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

        let directory = scratch("readiness-local");

        let mut settings =
            Persisted::<Settings>::load(directory.join("settings.json")).expect("settings");
        settings.database_path = directory.join("app.db");

        let mut database = Database::new(
            Arc::new(RwLock::new(settings)),
            crate::clock::System::shared(),
        );
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

        let mut database = Database::new(
            Arc::new(RwLock::new(settings)),
            crate::clock::System::shared(),
        );
        database.engine = Some(Engine::Workspace(
            super::Replica::open(engine, &Default::default())
                .await
                .expect("the replica's connections"),
        ));

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

    /// A `Database` holding a workspace replica of its own, pointed at `remote`, whose pushes and
    /// pulls are given up after `silence` without an answer.
    async fn workspace_against(
        name: &str,
        remote: Option<String>,
        silence: std::time::Duration,
    ) -> (std::path::PathBuf, Database) {
        use crate::{persisted::Persisted, settings::Settings};
        use std::sync::Arc;
        use tokio::sync::RwLock;

        let directory = scratch(name);
        let mut settings =
            Persisted::<Settings>::load(directory.join("settings.json")).expect("settings");
        settings.database_path = directory.join("app.db");

        let mut database = Database::new(
            Arc::new(RwLock::new(settings)),
            crate::clock::System::shared(),
        )
        .with_bound(super::Bound {
            silence,
            ceiling: std::time::Duration::from_secs(60),
        });
        database
            .connect_workspace("silent", remote, || async {
                Ok::<String, turso::Error>("a-credential".to_string())
            })
            .await
            .expect("the workspace replica");

        (directory, database)
    }

    /// **A push, a pull and a replication the remote never answers read as offline within the
    /// bound** (effort 854, criterion 15). The remote takes the connection and says nothing, which
    /// the engine, with no timeout of its own, would wait on for good; each call answers exactly
    /// what being offline already answers, so no caller has anything new to read.
    #[test]
    fn a_silent_remote_reads_as_offline_within_the_bound() {
        use crate::sync::test::server::{SilentServer, within};
        use std::time::{Duration, Instant};

        within(Duration::from_secs(60), async {
            let silent = SilentServer::start();
            let (directory, database) = workspace_against(
                "silent-offline",
                Some(silent.url()),
                Duration::from_millis(300),
            )
            .await;

            let started = Instant::now();
            assert!(!database.push_replica().await, "a silent push went through");
            assert!(
                started.elapsed() < Duration::from_secs(2),
                "the push waited on"
            );

            let started = Instant::now();
            assert_eq!(
                database.pull_replica().await,
                super::Pulled {
                    completed: false,
                    brought: false
                },
                "a silent pull read as answered"
            );
            assert!(
                started.elapsed() < Duration::from_secs(2),
                "the pull waited on"
            );

            let started = Instant::now();
            assert_eq!(
                database.replicate().await,
                super::Replicated {
                    pushed: false,
                    received: false,
                    refusal: None,
                    completed: false,
                },
                "a silent replication read as anything but offline"
            );
            assert!(
                started.elapsed() < Duration::from_secs(2),
                "the replication waited on"
            );

            drop(database);
            drop(silent);
            let _ = std::fs::remove_dir_all(&directory);
        });
    }

    /// **A query runs while a replication waits on a remote that never answers** (effort 854,
    /// criterion 15). The sync engine's `connect()` waits on the very mutex a stalled pull holds,
    /// so a connection asked for per request stalled every query behind it; the replica's own
    /// connections are opened with the engine, and a write and a read on them finish while the
    /// replication is still waiting, under the same read lock the heartbeat holds.
    #[test]
    fn a_query_runs_while_a_replication_waits_on_a_silent_remote() {
        use crate::{
            database::proxy::SQLQuery,
            sync::test::server::{SilentServer, within},
        };
        use std::{
            sync::Arc,
            time::{Duration, Instant},
        };
        use tokio::sync::RwLock;

        let sql = |sql: &str| SQLQuery {
            sql: sql.to_string(),
            params: Vec::new(),
        };

        within(Duration::from_secs(60), async move {
            let silent = SilentServer::start();
            let (directory, database) =
                workspace_against("silent-query", Some(silent.url()), Duration::from_secs(2)).await;
            let database = Arc::new(RwLock::new(database));

            database
                .read()
                .await
                .execute_single_sql(sql("CREATE TABLE tenant (id TEXT PRIMARY KEY)"))
                .await
                .expect("the local schema");

            let replicating = {
                let database = Arc::clone(&database);

                tokio::spawn(async move { database.read().await.replicate().await })
            };

            tokio::time::sleep(Duration::from_millis(500)).await;
            assert!(
                !replicating.is_finished(),
                "the replication did not wait on the silent remote"
            );

            let started = Instant::now();
            let rows = {
                let database = database.read().await;

                database
                    .execute_batch_sql(vec![sql("INSERT INTO tenant (id) VALUES ('t-1')")])
                    .await
                    .expect("the write beside the replication");
                database
                    .execute_single_sql(sql("SELECT count(*) AS tenants FROM tenant"))
                    .await
                    .expect("the read beside the replication")
            };

            assert!(
                started.elapsed() < Duration::from_secs(1),
                "the query waited {:?} on the replication",
                started.elapsed()
            );
            assert_eq!(rows.len(), 1);
            assert!(
                !replicating.is_finished(),
                "the replication ended before the query ran, so nothing ran beside it"
            );
            assert!(
                !replicating.await.expect("the replication").completed,
                "a silent replication read as one that went through"
            );

            drop(database);
            drop(silent);
            let _ = std::fs::remove_dir_all(&directory);
        });
    }

    /// **A request that finds every held connection out waits for one, and runs once one is
    /// back** (effort 854, the plan's *Measured, and replanned*). Each request has its connection
    /// to itself, so a batch's transaction is never shared, and the wait is on local work alone.
    #[test]
    fn a_request_waits_for_a_held_connection_and_runs_once_one_is_returned() {
        use crate::{database::proxy::SQLQuery, sync::test::server::within};
        use std::{sync::Arc, time::Duration};

        within(Duration::from_secs(60), async {
            let (directory, database) =
                workspace_against("held-wait", None, Duration::from_secs(30)).await;
            let database = Arc::new(database);
            let Some(Engine::Workspace(replica)) = database.engine.as_ref() else {
                panic!("the workspace arm did not open");
            };

            let mut out = Vec::new();
            for _ in 0..super::held::SIZE {
                out.push(
                    replica
                        .connections
                        .checkout()
                        .await
                        .expect("a held connection"),
                );
            }

            let waiting = {
                let database = Arc::clone(&database);

                tokio::spawn(async move {
                    database
                        .execute_single_sql(SQLQuery {
                            sql: "SELECT 1 AS one".to_string(),
                            params: Vec::new(),
                        })
                        .await
                })
            };

            tokio::time::sleep(Duration::from_millis(300)).await;
            assert!(
                !waiting.is_finished(),
                "a request ran with every connection checked out"
            );

            out.pop();

            let answered = tokio::time::timeout(Duration::from_secs(2), waiting)
                .await
                .expect("the request did not run once a connection was returned")
                .expect("the request's task");
            assert_eq!(answered.expect("the request").len(), 1);

            drop(out);
            drop(database);
            let _ = std::fs::remove_dir_all(&directory);
        });
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

    /// One statement, with nothing bound.
    fn statement(sql: &str) -> crate::database::proxy::SQLQuery {
        crate::database::proxy::SQLQuery {
            sql: sql.to_string(),
            params: Vec::new(),
        }
    }

    /// The reason a refusal carries, or a panic naming what came back instead.
    fn reason_of<T: std::fmt::Debug>(
        answered: Result<T, crate::error::Error>,
    ) -> crate::error::RefusalReason {
        match answered {
            Err(crate::error::Error::Refused { reason, .. }) => reason,
            other => panic!("not a refusal: {other:?}"),
        }
    }

    /// Every tenant the workspace holds, by id.
    async fn tenants(database: &Database) -> Vec<crate::database::proxy::SQLRow> {
        database
            .execute_single_sql(statement("SELECT \"id\" FROM \"tenant\" ORDER BY \"id\""))
            .await
            .expect("the read")
    }

    /// **Ticket 05's second criterion.** While this build stands below the workspace's write floor,
    /// every kind of write, alone or in a batch, is refused with the version as the reason and
    /// changes nothing, and every read answers as before; below the read floor a write is refused
    /// as the workspace being newer. Once the standing is writable again the same connections
    /// write, so nothing of the refusal outlives it.
    #[test]
    fn a_workspace_below_its_write_floor_refuses_every_write_and_serves_reads() {
        use crate::{database::floor::Standing, error::RefusalReason, sync::test::server::within};
        use std::time::Duration;

        within(Duration::from_secs(60), async {
            let (directory, database) =
                workspace_against("read-only-writes", None, Duration::from_secs(30)).await;

            for sql in [
                "CREATE TABLE \"tenant\" (\"id\" TEXT PRIMARY KEY, \"name\" TEXT)",
                "INSERT INTO \"tenant\" VALUES ('t-1', 'first')",
            ] {
                database
                    .execute_single_sql(statement(sql))
                    .await
                    .expect(sql);
            }

            let before = tenants(&database).await;

            database.hold(Standing::ReadOnly);

            let writes = [
                "INSERT INTO \"tenant\" VALUES ('t-2', 'second')",
                "UPDATE \"tenant\" SET \"name\" = 'renamed' WHERE \"id\" = 't-1'",
                "DELETE FROM \"tenant\" WHERE \"id\" = 't-1'",
                "CREATE TABLE \"other\" (\"id\" TEXT)",
                "DROP TABLE \"tenant\"",
            ];

            // more times than the replica holds connections, so every one of them is met.
            for _ in 0..super::held::SIZE + 1 {
                for sql in writes {
                    assert_eq!(
                        reason_of(database.execute_single_sql(statement(sql)).await),
                        RefusalReason::WorkspaceReadOnlyByVersion,
                        "{sql}"
                    );
                    assert_eq!(
                        reason_of(
                            database
                                .execute_batch_sql(vec![
                                    statement("SELECT count(*) FROM \"tenant\""),
                                    statement(sql),
                                ])
                                .await
                        ),
                        RefusalReason::WorkspaceReadOnlyByVersion,
                        "a batch holding {sql}"
                    );
                }

                assert_eq!(tenants(&database).await, before, "a write went through");
                assert_eq!(
                    database
                        .execute_batch_sql(vec![
                            statement("SELECT count(*) FROM \"tenant\""),
                            statement("SELECT \"name\" FROM \"tenant\""),
                        ])
                        .await
                        .expect("a batch of reads")
                        .len(),
                    2
                );
            }

            database.hold(Standing::Unreadable);

            assert_eq!(
                reason_of(database.execute_single_sql(statement(writes[0])).await),
                RefusalReason::WorkspaceNewer
            );

            database.hold(Standing::Writable);

            for _ in 0..super::held::SIZE + 1 {
                database
                    .execute_batch_sql(vec![statement(
                        "UPDATE \"tenant\" SET \"name\" = 'written' WHERE \"id\" = 't-1'",
                    )])
                    .await
                    .expect("a write once writable again");
            }

            drop(database);
            let _ = std::fs::remove_dir_all(&directory);
        });
    }

    /// **Ticket 05's second criterion, the push.** A workspace this build may not write is pulled
    /// and never pushed, by the replication and by the last push of a session alike, so what it
    /// wrote before the floor rose stays captured on the machine. The same replica pushes once it
    /// may write again, which is what shows the test can see a push at all.
    #[test]
    fn a_workspace_below_its_write_floor_is_pulled_and_never_pushed() {
        use crate::{
            database::floor::Standing,
            sync::test::server::{ScriptedResponse, ScriptedServer, within},
        };
        use std::time::Duration;

        // what the engine sends each half to, measured against this server (ticket 05).
        const PUSH: &str = "/v2/pipeline";
        const PULL: &str = "/pull-updates";

        within(Duration::from_secs(60), async {
            let remote = ScriptedServer::start(
                (0..32)
                    .map(|_| ScriptedResponse::new(500, "unavailable"))
                    .collect(),
            )
            .await;
            let (directory, database) = workspace_against(
                "read-only-push",
                Some(remote.url("")),
                Duration::from_secs(5),
            )
            .await;
            let sent = |from: usize| {
                (from..remote.request_count())
                    .map(|index| remote.request(index).target)
                    .collect::<Vec<_>>()
            };

            for sql in [
                "CREATE TABLE \"tenant\" (\"id\" TEXT PRIMARY KEY)",
                "INSERT INTO \"tenant\" VALUES ('t-1')",
            ] {
                database
                    .execute_single_sql(statement(sql))
                    .await
                    .expect(sql);
            }

            let start = remote.request_count();

            database.hold(Standing::ReadOnly);

            let replicated = database.replicate().await;

            assert!(!replicated.pushed);
            assert!(!database.push_replica().await, "the last push went");

            let targets = sent(start);

            assert!(
                !targets.iter().any(|target| target == PUSH),
                "a read-only workspace pushed: {targets:?}"
            );
            assert!(
                targets.iter().any(|target| target == PULL),
                "a read-only workspace was not pulled: {targets:?}"
            );

            let start = remote.request_count();

            database.hold(Standing::Writable);
            database.push_replica().await;

            assert!(
                sent(start).iter().any(|target| target == PUSH),
                "a writable workspace did not push, so nothing above shows a push was held"
            );

            drop(database);
            drop(remote);
            let _ = std::fs::remove_dir_all(&directory);
        });
    }

    /// What the remote answers a push whose changes name a column an upgrade removed, as the
    /// live run of ticket 13 read it off Turso: the statement the engine sends is refused inside
    /// a pipeline that is otherwise answered.
    const REMOVED_COLUMN: &str = r#"{"baton":null,"base_url":null,"results":[{"type":"error","error":{"message":"SQLite error: table tenant has no column named note","code":"SQLITE_UNKNOWN"}}]}"#;

    /// **Ticket 13, the classification and the keeping.** A push the remote refuses because an
    /// upgrade removed what the changes name is answered as `ChangesUnsendableAfterUpgrade`, and
    /// from then on the replica is neither pushed nor pulled, by the replication, the last push of
    /// a session or a pull alike, in this session or the next: the live run measured that a
    /// second push, or a pull, after the first refusal drops the changes without a word. The
    /// changes stay readable on this machine until the person says to discard them.
    #[test]
    fn a_push_naming_what_an_upgrade_removed_is_classified_and_kept() {
        use crate::{
            error::{Error, RefusalReason},
            sync::test::server::{ScriptedResponse, ScriptedServer, within},
        };
        use std::time::Duration;

        within(Duration::from_secs(60), async {
            let remote = ScriptedServer::start(
                (0..32)
                    .map(|_| ScriptedResponse::new(200, REMOVED_COLUMN))
                    .collect(),
            )
            .await;
            let (directory, mut database) =
                workspace_against("unsendable", Some(remote.url("")), Duration::from_secs(5)).await;

            for sql in [
                "CREATE TABLE \"tenant\" (\"id\" TEXT PRIMARY KEY, \"note\" TEXT)",
                "INSERT INTO \"tenant\" VALUES ('t-1', 'written before the upgrade')",
            ] {
                database
                    .execute_single_sql(statement(sql))
                    .await
                    .expect(sql);
            }

            let replicated = database.replicate().await;

            assert!(
                matches!(
                    replicated.refusal,
                    Some(Error::Refused {
                        reason: RefusalReason::ChangesUnsendableAfterUpgrade,
                        ..
                    })
                ),
                "{replicated:?}"
            );
            assert!(!replicated.pushed);
            assert!(!replicated.received);
            assert!(database.holds_unsendable(), "nothing records the refusal");

            let sent = remote.request_count();

            assert!(
                !(0..sent).any(|index| remote.request(index).target == "/pull-updates"),
                "a refused push was followed by a pull, which drops what it holds"
            );

            // kept: nothing reaches the remote again, whichever call asks.
            let again = database.replicate().await;

            assert_eq!(again.refusal, replicated.refusal);
            assert!(!database.push_replica().await);
            assert!(!database.pull_replica().await.completed);

            // and a later launch keeps it the same way.
            database.disconnect().await;
            database
                .connect_workspace("silent", Some(remote.url("")), || async {
                    Ok::<String, turso::Error>("a-credential".to_string())
                })
                .await
                .expect("the replica, opened again");

            assert!(database.holds_unsendable());
            assert_eq!(database.replicate().await.refusal, replicated.refusal);
            assert_eq!(
                remote.request_count(),
                sent,
                "a held replica reached the remote again"
            );
            assert_eq!(
                tenants(&database).await.len(),
                1,
                "the change was not kept on this machine"
            );

            drop(database);
            drop(remote);
            let _ = std::fs::remove_dir_all(&directory);
        });
    }

    /// What the remote answers a push whose change another machine's took the unique value of
    /// first: a conflict between two machines, which no upgrade caused.
    const UNIQUE_CONFLICT: &str = r#"{"baton":null,"base_url":null,"results":[{"type":"error","error":{"message":"SQLite error: UNIQUE constraint failed: tenant.phone","code":"SQLITE_CONSTRAINT"}}]}"#;

    /// **Ticket 26 (correctness 2).** A push refused over a unique constraint is a conflict between
    /// two machines rather than a workspace an upgrade reshaped: the replica is not held, the
    /// person is not told it was upgraded nor offered a discard, and the next replication reaches
    /// the remote again.
    #[test]
    fn a_conflict_is_not_held_as_an_upgrade() {
        use crate::{
            error::{Error, RefusalReason},
            sync::test::server::{ScriptedResponse, ScriptedServer, within},
        };
        use std::time::Duration;

        within(Duration::from_secs(60), async {
            let remote = ScriptedServer::start(
                (0..32)
                    .map(|_| ScriptedResponse::new(200, UNIQUE_CONFLICT))
                    .collect(),
            )
            .await;
            let (directory, mut database) =
                workspace_against("conflict", Some(remote.url("")), Duration::from_secs(5)).await;

            for sql in [
                "CREATE TABLE \"tenant\" (\"id\" TEXT PRIMARY KEY, \"phone\" TEXT UNIQUE)",
                "INSERT INTO \"tenant\" VALUES ('t-1', '0500000000')",
            ] {
                database
                    .execute_single_sql(statement(sql))
                    .await
                    .expect(sql);
            }

            let replicated = database.replicate().await;

            assert!(
                !matches!(
                    replicated.refusal,
                    Some(Error::Refused {
                        reason: RefusalReason::ChangesUnsendableAfterUpgrade,
                        ..
                    })
                ),
                "a conflict was told as an upgrade: {replicated:?}"
            );
            assert!(!replicated.pushed);
            assert!(!database.holds_unsendable(), "a conflict held the replica");
            assert!(!database.push_replica().await);
            assert!(
                !database.holds_unsendable(),
                "the last push held the replica"
            );

            let sent = remote.request_count();

            database.replicate().await;

            assert!(
                remote.request_count() > sent,
                "the replica stopped reaching the remote after a conflict"
            );
            assert!(
                matches!(
                    database.discard_unsendable().await,
                    Err(Error::PreconditionFailed { .. })
                ),
                "a conflict's changes were offered for discarding"
            );

            drop(database);
            drop(remote);
            let _ = std::fs::remove_dir_all(&directory);
        });
    }

    /// **Ticket 26 (correctness 11).** Where the record of a refusal cannot be written beside the
    /// replica (here a directory stands where the file would go), the replica is held all the same
    /// for the rest of the session: no later replication, last push or pull reaches the remote,
    /// which is what would answer `Ok` and drop the refused changes.
    #[test]
    fn a_refusal_that_cannot_be_recorded_still_holds_the_replica() {
        use crate::{
            error::{Error, RefusalReason},
            sync::test::server::{ScriptedResponse, ScriptedServer, within},
        };
        use std::time::Duration;

        within(Duration::from_secs(60), async {
            let remote = ScriptedServer::start(
                (0..32)
                    .map(|_| ScriptedResponse::new(200, REMOVED_COLUMN))
                    .collect(),
            )
            .await;
            let (directory, database) =
                workspace_against("unrecorded", Some(remote.url("")), Duration::from_secs(5)).await;
            let replica = Database::replica_path(&directory.join("app.db"), "silent");

            std::fs::create_dir(super::unsendable::marker(&replica))
                .expect("the record's place, taken");

            for sql in [
                "CREATE TABLE \"tenant\" (\"id\" TEXT PRIMARY KEY, \"note\" TEXT)",
                "INSERT INTO \"tenant\" VALUES ('t-1', 'written before the upgrade')",
            ] {
                database
                    .execute_single_sql(statement(sql))
                    .await
                    .expect(sql);
            }

            assert!(
                !database.holds_unsendable(),
                "held before anything was refused"
            );

            let replicated = database.replicate().await;

            assert!(remote.request_count() > 0, "the push was never made");
            assert!(
                matches!(
                    replicated.refusal,
                    Some(Error::Refused {
                        reason: RefusalReason::ChangesUnsendableAfterUpgrade,
                        ..
                    })
                ),
                "{replicated:?}"
            );
            assert!(
                database.holds_unsendable(),
                "an unrecorded refusal was forgotten"
            );

            let sent = remote.request_count();

            assert_eq!(database.replicate().await.refusal, replicated.refusal);
            assert!(!database.push_replica().await);
            assert!(!database.pull_replica().await.completed);
            assert_eq!(
                remote.request_count(),
                sent,
                "an unrecorded hold let the replica reach the remote again"
            );
            assert_eq!(tenants(&database).await.len(), 1, "the change was not kept");

            drop(database);
            drop(remote);
            super::unsendable::forget(&replica);
            let _ = std::fs::remove_dir_all(&directory);
        });
    }

    // -------------------------------------------------------------------------------------
    // Effort 857, ticket 13, live: what an older build left unsent, pushed after an upgrade.
    // -------------------------------------------------------------------------------------

    /// Fail unless `RENTABLE_LIVE_TURSO=1` arms the run, as every live test admitted since
    /// 2026-08-30 does ([[rules/testing]]).
    fn armed_for_a_live_run() {
        assert_eq!(
            std::env::var("RENTABLE_LIVE_TURSO")
                .unwrap_or_else(|_| panic!(
                    "RENTABLE_LIVE_TURSO is needed for a live run; see unsent_changes_live_*"
                ))
                .trim(),
            "1",
            "a live run is armed by RENTABLE_LIVE_TURSO=1 as well as by --ignored"
        );
    }

    /// This machine's database over the replica of `workspace` kept in `directory`, opened as a
    /// launch opens it: the same file each time, so a second call is the build after an update.
    async fn live_database(directory: &std::path::Path, workspace: &LiveWorkspace) -> Database {
        use crate::{persisted::Persisted, settings::Settings};
        use std::sync::Arc;
        use tokio::sync::RwLock;

        let mut settings =
            Persisted::<Settings>::load(directory.join("settings.json")).expect("settings");
        settings.database_path = directory.join("app.db");

        let mut database = Database::new(
            Arc::new(RwLock::new(settings)),
            crate::clock::System::shared(),
        );
        let token = workspace.token.clone();

        database
            .connect_workspace("live", Some(workspace.url.clone()), move || {
                let token = token.clone();
                async move { Ok::<String, turso::Error>(token) }
            })
            .await
            .expect("the workspace replica");

        database
    }

    /// Every row of `pay` on this machine, each as its values in order.
    async fn local_pay(database: &Database) -> Vec<Vec<serde_json::Value>> {
        database
            .execute_single_sql(statement("SELECT * FROM \"pay\" ORDER BY \"id\""))
            .await
            .expect("the local read")
            .into_iter()
            .map(|row| row.rows)
            .collect()
    }

    /// Every row of `pay` on the remote, each as the pipeline's typed cells.
    async fn remote_pay(workspace: &LiveWorkspace) -> Vec<serde_json::Value> {
        workspace
            .over_the_wire(&["SELECT * FROM \"pay\" ORDER BY \"id\""])
            .await
    }

    /// One case on a throwaway database of its own: `case` runs against it, the database is
    /// deleted whatever the case did, and only then does a failure in the case fail the test, so a
    /// failed assertion never leaves a database behind.
    async fn on_a_throwaway_workspace<F, Fut>(label: &str, case: F)
    where
        F: FnOnce(Arc<LiveWorkspace>, std::path::PathBuf) -> Fut,
        Fut: std::future::Future<Output = ()> + Send + 'static,
    {
        let workspace = Arc::new(LiveWorkspace::create(label).await);
        let directory = scratch(label);
        let ran = tokio::spawn(case(Arc::clone(&workspace), directory.clone())).await;

        let _ = std::fs::remove_dir_all(&directory);

        match Arc::try_unwrap(workspace) {
            Ok(workspace) => workspace.destroy().await,
            Err(_) => panic!("the case kept the workspace, so it could not be deleted"),
        }

        if let Err(failure) = ran {
            std::panic::resume_unwind(failure.into_panic());
        }
    }

    /// The workspace as an older build left it: a table, a row everybody has, and this machine's
    /// replica holding `captured` unsent. `upgrade` then reaches the remote over the pipeline, as
    /// an upgrade's step does, and the replica is opened again, which is the build after the
    /// update. What the older build captured is still held when it opens.
    async fn captured_before(
        workspace: &LiveWorkspace,
        directory: &std::path::Path,
        captured: &str,
        upgrade: &str,
    ) -> Database {
        workspace
            .over_the_wire(&[
                "CREATE TABLE \"pay\" (\"id\" TEXT PRIMARY KEY, \"amount\" INTEGER NOT NULL, \
                 \"note\" TEXT)",
                "INSERT INTO \"pay\" VALUES ('u1', 1, 'seed')",
            ])
            .await;

        let mut older = live_database(directory, workspace).await;

        assert!(older.pull_replica().await.completed, "the first pull");
        older
            .execute_single_sql(statement(captured))
            .await
            .expect("the older build's write");
        older.disconnect().await;

        workspace.over_the_wire(&[upgrade]).await;

        let updated = live_database(directory, workspace).await;

        assert!(
            updated.holds_unsent().await,
            "the change the older build wrote is not held"
        );

        updated
    }

    /// **Ticket 13's live criterion, the addition: sent.** Changes an older build held when an
    /// upgrade added a column reach the remote at the updated build's first replication, with the
    /// new column empty, and the replica reads the new shape afterwards.
    ///
    /// ```text
    /// RENTABLE_LIVE_TURSO=1 TURSO_API_TOKEN=... TURSO_ORG=... TURSO_GROUP=... \
    ///   cargo test --manifest-path ./apps/desktop/tauri/Cargo.toml unsent_changes_live -- \
    ///   --test-threads=1 --ignored --nocapture
    /// ```
    #[ignore = "reaches a live Turso account and creates a database; see the doc comment"]
    #[tokio::test]
    async fn unsent_changes_live_are_sent_after_an_addition() {
        armed_for_a_live_run();

        on_a_throwaway_workspace("u857-added", |workspace, directory| async move {
            let database = captured_before(
                &workspace,
                &directory,
                "INSERT INTO \"pay\" (\"id\", \"amount\", \"note\") VALUES ('i1', 10, 'held')",
                "ALTER TABLE \"pay\" ADD COLUMN \"extra\" TEXT",
            )
            .await;

            let replicated = database.replicate().await;

            assert!(replicated.pushed, "{replicated:?}");
            assert_eq!(replicated.refusal, None);
            assert!(!database.holds_unsendable());
            assert_eq!(
                remote_pay(&workspace).await.len(),
                2,
                "the held row did not reach the remote"
            );
            assert_eq!(
                local_pay(&database).await,
                vec![
                    vec![json!("i1"), json!(10), json!("held"), json!(null)],
                    vec![json!("u1"), json!(1), json!("seed"), json!(null)],
                ]
            );
            assert!(!database.holds_unsent().await, "the row is still held");

            drop(database);
        })
        .await;
    }

    /// **Ticket 13's live criterion, the removal: kept and asked.** Changes an older build held
    /// when an upgrade dropped or renamed the column they name are classified at the updated
    /// build's first replication, kept on this machine across another replication, a last push, a
    /// pull and a reopen, and never reach the remote; once discarded, the next open is the
    /// remote's copy and this machine writes and sends again.
    #[ignore = "reaches a live Turso account and creates a database; see the doc comment"]
    #[tokio::test]
    async fn unsent_changes_live_are_kept_and_asked_for_after_a_removal() {
        use crate::error::{Error, RefusalReason};

        armed_for_a_live_run();

        for (label, upgrade) in [
            ("u857-dropped", "ALTER TABLE \"pay\" DROP COLUMN \"note\""),
            (
                "u857-renamed",
                "ALTER TABLE \"pay\" RENAME COLUMN \"note\" TO \"memo\"",
            ),
        ] {
            on_a_throwaway_workspace(label, move |workspace, directory| async move {
                let held_row = vec![json!("i1"), json!(10), json!("held")];
                let mut database = captured_before(
                    &workspace,
                    &directory,
                    "INSERT INTO \"pay\" (\"id\", \"amount\", \"note\") VALUES ('i1', 10, 'held')",
                    upgrade,
                )
                .await;
                let remote_before = remote_pay(&workspace).await;

                let replicated = database.replicate().await;

                assert!(
                    matches!(
                        replicated.refusal,
                        Some(Error::Refused {
                            reason: RefusalReason::ChangesUnsendableAfterUpgrade,
                            ..
                        })
                    ),
                    "{label}: {replicated:?}"
                );
                assert!(!replicated.pushed);
                assert!(database.holds_unsendable());

                // kept: every way the replica could reach the remote again declines, and the row
                // is still here.
                assert_eq!(database.replicate().await.refusal, replicated.refusal);
                assert!(!database.push_replica().await);
                assert!(!database.pull_replica().await.completed);
                database.disconnect().await;

                let mut database = live_database(&directory, &workspace).await;

                assert!(database.holds_unsendable(), "{label}: a reopen forgot");
                assert_eq!(database.replicate().await.refusal, replicated.refusal);
                assert!(
                    local_pay(&database).await.contains(&held_row),
                    "{label}: the held row is gone from this machine"
                );
                assert_eq!(
                    remote_pay(&workspace).await,
                    remote_before,
                    "{label}: the remote changed"
                );

                // asked: discarded at the person's word, and the next open is the remote's copy.
                database
                    .discard_unsendable()
                    .await
                    .expect("the held changes discarded");

                let database = live_database(&directory, &workspace).await;

                assert!(!database.holds_unsendable());
                assert!(
                    database.pull_replica().await.completed,
                    "{label}: the fresh pull"
                );
                assert!(
                    !local_pay(&database).await.contains(&held_row),
                    "{label}: the discarded row is still here"
                );

                database
                    .execute_single_sql(statement(
                        "INSERT INTO \"pay\" (\"id\", \"amount\") VALUES ('i2', 20)",
                    ))
                    .await
                    .expect("a write after the discard");

                let replicated = database.replicate().await;

                assert!(replicated.pushed, "{label}: {replicated:?}");
                assert_eq!(remote_pay(&workspace).await.len(), 2);

                drop(database);
            })
            .await;
        }
    }

    /// **Ticket 13, what holds the opening pull back.** A replica that has written nothing holds
    /// nothing unsent, so its first pull goes as it always did; one that has written and not
    /// pushed holds something, which the opening does not pull over.
    #[test]
    fn a_replica_holds_what_it_wrote_and_has_not_sent() {
        use crate::sync::test::server::within;
        use std::time::Duration;

        within(Duration::from_secs(60), async {
            let (directory, database) =
                workspace_against("unsent", None, Duration::from_secs(5)).await;

            assert!(
                !database.holds_unsent().await,
                "an empty replica holds something"
            );

            for sql in [
                "CREATE TABLE \"tenant\" (\"id\" TEXT PRIMARY KEY)",
                "INSERT INTO \"tenant\" VALUES ('t-1')",
            ] {
                database
                    .execute_single_sql(statement(sql))
                    .await
                    .expect(sql);
            }

            assert!(database.holds_unsent().await, "a write is not counted");

            drop(database);
            let _ = std::fs::remove_dir_all(&directory);
        });
    }

    /// **Ticket 13, the choice.** Discarding is refused while nothing is held, and leaves the
    /// replica as it was; once a push has been classified, it lets go of the replica and removes
    /// it, its record of the refusal with it, so the next open is a fresh copy of the remote and
    /// nothing of what was held reaches anyone.
    #[test]
    fn unsent_changes_are_discarded_only_once_held() {
        use crate::{
            error::Error,
            sync::test::server::{ScriptedResponse, ScriptedServer, within},
        };
        use std::time::Duration;

        within(Duration::from_secs(60), async {
            let remote = ScriptedServer::start(
                (0..32)
                    .map(|_| ScriptedResponse::new(200, REMOVED_COLUMN))
                    .collect(),
            )
            .await;
            let (directory, mut database) =
                workspace_against("discard", Some(remote.url("")), Duration::from_secs(5)).await;
            let replica = Database::replica_path(&directory.join("app.db"), "silent");

            for sql in [
                "CREATE TABLE \"tenant\" (\"id\" TEXT PRIMARY KEY, \"note\" TEXT)",
                "INSERT INTO \"tenant\" VALUES ('t-1', 'written before the upgrade')",
            ] {
                database
                    .execute_single_sql(statement(sql))
                    .await
                    .expect(sql);
            }

            assert!(
                matches!(
                    database.discard_unsendable().await,
                    Err(Error::PreconditionFailed { .. })
                ),
                "a discard went ahead with nothing held"
            );
            assert!(replica.exists(), "a refused discard removed the replica");
            assert_eq!(tenants(&database).await.len(), 1);

            database.replicate().await;
            database
                .discard_unsendable()
                .await
                .expect("the held changes discarded");

            assert!(!replica.exists(), "the replica is still on disk");
            assert!(!database.holds_unsendable());
            assert!(
                database
                    .execute_single_sql(statement("SELECT 1"))
                    .await
                    .is_err(),
                "the discarded replica is still open"
            );

            drop(database);
            drop(remote);
            let _ = std::fs::remove_dir_all(&directory);
        });
    }
}
