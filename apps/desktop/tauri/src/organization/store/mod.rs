//! the organization database: its schema, and the queries over it.
//!
//! **A replica like any workspace.** The organization's records live in one database on the
//! customer's Turso account, and each member's machine holds a `turso::sync` replica of it, opened
//! beside the workspace engine rather than inside it. `database/mod.rs` says why there is no third
//! `Engine` arm: `Engine` answers what the workspace is open as, and an organization is not a
//! workspace. Two engines over two files is what that module permits; two over one file is what it
//! forbids, and the organization replica is `org-<id>.db` beside `ws-<id>.db`, never the same file.
//!
//! **Who belongs, what each may do, and which workspaces exist live here, sealed and signed.**
//! `member` and `grant` say who and what; `workspace` has no single owner, so an account is not
//! held to one workspace; and there is no `session` table, because requirement 18 removes the
//! window one would exist for. Every name and address is a `_sealed` column under the organization content key,
//! so a member holding only the database, or only what a join link carries, reads none of them.
//! Every authority field is under a signature `organization/authority/` checks, so a member who
//! can write every row, which Turso's whole-database credential makes every member, still cannot
//! forge one.
//!
//! **This module signs on the way in and verifies on the way out, and there is no read that
//! skips the check.** A member or role row that fails verification refuses the read that found
//! it, naming the row and the check, rather than being dropped and the rest used: those are what
//! a person's standing is read from, and a reader that quietly skipped one would show a directory
//! that looked whole. A workspace, grant, invitation or mark row that fails is left out of the read
//! and logged by name instead (effort 838, ticket 25): it grants nothing either way, and refusing
//! the read on it made the whole directory unreadable for everybody over one row. What to show a
//! person is the sign-in ticket's; that the store refuses is this one's.
//!
//! **What this module does not know.** Passwords, and whether one opens anything: the vault's.
//! Who may sign in: ticket 10's. What to seal a name under: the caller holds the content key and
//! hands this module ciphertext. The store is the shape of the rows and the signatures over them,
//! and nothing else.
//!
//! **One type, a file per sub-concept** (effort 840, ticket 50). Each file below holds one
//! sub-concept's tables and an `impl OrganizationStore` block of its methods: `member`, `role`,
//! `invitation`, `workspace` (with its grants and overrides), `ownership`, `session` (the machine
//! links and the machine registry), `setup` (the organization row and its signed name),
//! `authority` (certificates and revocations), `mark` and `lease`. `signature` is the sealing
//! every one of them signs and verifies through, and `format` the format policy and format 1's
//! readers the owner's upgrade runs. This file keeps the type, its construction and connection,
//! the schema as one list, and the row helpers. *Not a store per sub-concept*, because a write
//! that crosses them, re-signing every row a certificate signed above all, runs in one
//! transaction over one connection.

use std::path::{Path, PathBuf};

use crate::{
    backup,
    clock::{self, Clock},
    database::{
        Database,
        bound::{Bound, SYNC_BOUND, bounded},
        corrupt,
        floor::{Floors, Standing},
        step::{Ladder, Steps},
        unsendable,
    },
    error::Error,
    schema,
};

mod authority;
mod format;
mod invitation;
mod lease;
mod mark;
mod member;
mod ownership;
mod role;
mod scratch;
mod session;
mod setup;
mod signature;
mod workspace;

pub use format::{
    FORMAT_VERSION, FormatOneDirectory, FormatOneMemberRow, FormatOneReshape, read_only_by_version,
    waits_for_its_owner,
};
pub use invitation::InvitationRecord;
pub use lease::MigrationLeaseRecord;
pub use mark::MarkRecord;
pub use member::{MemberLockRecord, MemberLocks, MemberRecord, locked_in};
pub use ownership::SuccessionRecord;
pub use role::RoleRecord;
pub use session::{
    MACHINE_PRESENCE_WINDOW, MachineLinkRecord, MachineNameRecord, MachineRecord,
    MachineVersionRecord,
};
pub use setup::{OrganizationNameRecord, OrganizationRecord};
pub use signature::{SignedRow, Signer};
pub(crate) use signature::{
    grant_authority, invitation_authority, mark_authority, member_lock_authority,
    organization_name_authority, role_authority, workspace_authority,
};
pub use workspace::{GrantRecord, WorkspaceOverrideRecord, WorkspaceRecord, pins_of};

/// The twenty-two tables, in the order the schema creates them. A test pins this list against what
/// the database reports, so a table added anywhere is added here or fails there.
///
/// **A table added after format 3 goes last, with no change of format** (effort 846): the two
/// tables a machine is signed out on its own by are created on every replica of this format by
/// [`OrganizationStore::complete_schema`] after a pull, and by the change to format 3 with
/// `workspace_override`, so a walk arriving at this format builds what a fresh one is built with.
/// `organization_name` came after them the same way (effort 851), and `member_lock` after it, and
/// `machine_version` after that (effort 857), an addition that moves no floor, then `workspace_floor`
/// and `organization_floor` (effort 857, ticket 03), where a database's floors are recorded once a
/// step declared after 857 has run on it; the next table goes after them.
pub const TABLES: [&str; 22] = [
    "format",
    "organization",
    "role",
    "member",
    "certificate",
    "revocation",
    "workspace",
    "grant",
    "invitation",
    "migration_lease",
    "machine_link",
    "machine",
    "succession",
    "mark",
    "workspace_override",
    "machine_sign_out",
    "machine_name",
    "organization_name",
    "member_lock",
    "machine_version",
    "workspace_floor",
    "organization_floor",
];

/// How many of [`TABLES`] format 2 held: every one but `workspace_override`, which format 3 adds
/// (`upgrade/format/overriding.rs`), and the tables effort 846, effort 851 and effort 857 added
/// after it, which the change to format 3 creates with it.
const FORMAT_TWO_TABLES: usize = 14;

/// The schema, as the plan's data model gives it.
///
/// **No foreign keys and no `UNIQUE` on an owner.** The first for the reason the workspace schema
/// gives: this database is replicated to machines that write to it offline, so a constraint met on
/// one replica can be violated by the merge. The second is requirement 1: an organization holds
/// several workspaces, and nothing constrains an account to one.
///
/// `grant` is quoted everywhere because it is a keyword in most dialects, and a statement that
/// works in SQLite and fails elsewhere is a statement worth spelling defensively once.
const SCHEMA: [&str; 22] = [
    format::FORMAT,
    setup::ORGANIZATION,
    role::ROLE,
    member::MEMBER,
    authority::CERTIFICATE,
    authority::REVOCATION,
    workspace::WORKSPACE,
    workspace::GRANT,
    invitation::INVITATION,
    lease::MIGRATION_LEASE,
    session::MACHINE_LINK,
    session::MACHINE,
    ownership::SUCCESSION,
    mark::MARK,
    workspace::WORKSPACE_OVERRIDE,
    session::MACHINE_SIGN_OUT,
    session::MACHINE_NAME,
    setup::ORGANIZATION_NAME,
    member::MEMBER_LOCK,
    session::MACHINE_VERSION,
    workspace::WORKSPACE_FLOOR,
    format::ORGANIZATION_FLOOR,
];

/// The organization replica on this machine.
///
/// `Debug` says which file it is over and nothing about the rows, which is all a log line needs.
pub struct OrganizationStore {
    database: turso::sync::Database,
    /// the replica's connection, whose reads record the damage they meet beside the replica
    /// (`database/corrupt.rs`), so that its next open sets it aside.
    connection: corrupt::Watched,
    /// where the replica is, which is what says where the application's data directory is.
    path: PathBuf,
    /// what says when, for whatever acts on the replica after it opened: the clock the command
    /// that opened it was given.
    clock: clock::Shared,
    /// how long a push or a pull of the replica may wait on the remote (`database/bound.rs`).
    bound: Bound,
    /// where this build stood against the organization's floors when it last judged them
    /// ([`OrganizationStore::refuse_another_format`], effort 857, ticket 04): writable until the
    /// first verdict, which every way in reaches before it writes. What a way in and the heartbeat
    /// ask before they write anything of their own.
    standing: std::sync::Mutex<Standing>,
    /// the changes of format this build declares (`database/step.rs`): which of them run on open,
    /// and the format it knows. [`Ladder::Format`] in production, and a ladder of a test's own
    /// under test.
    format_steps: Steps,
    /// a read of the verdict that fails once, for a test standing in for a read the engine could
    /// not answer during a pull (effort 857, ticket 27).
    #[cfg(test)]
    a_read_fails: std::sync::atomic::AtomicBool,
}

impl std::fmt::Debug for OrganizationStore {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("OrganizationStore")
    }
}

/// Take away the replica an act pulled and did not keep: the file and every sidecar the engine
/// wrote beside it.
///
/// **Every refusal after a pull goes through here** (effort 828, requirement 14; effort 851,
/// requirement 10). An act that was refused left a copy of every sealed row of the organization on
/// a machine that does not hold it: the first run's walk and its connect to an existing
/// organization (`setup/`), and an invitation link or a machine link opened where the organization
/// is not held (`invitation/join.rs`, `invitation/machine.rs`). The caller lets the store go
/// first: on Windows a file this process still has open cannot be deleted, which is the order
/// `forget_one` keeps for the same reason.
///
/// **It is never reached for an organization the machine holds.** The replica is then the one the
/// machine works from, and a link for that organization opened again is refused with it left where
/// it is; each caller says so where it calls.
///
/// Best effort: what could not be removed is the forget's to report at a removal, and it never
/// takes the place of the refusal the person is about to read. *It was `setup/`'s alone until
/// effort 851 gave the two link acts the same way out.*
pub(crate) fn leave_no_replica(database_path: &Path, organization_id: &str) {
    Database::remove_replica_files(&OrganizationStore::replica_path(
        database_path,
        organization_id,
    ));
}

/// What a push or a pull of a replica holding changes the organization refused since an upgrade
/// answers, in the engine's terms, since neither is made (effort 857, ticket 20). A caller that
/// tells refusals apart asks [`OrganizationStore::holds_unsendable`] rather than reading this.
fn held() -> turso::Error {
    turso::Error::Error(unsendable::organization_refusal().to_string())
}

impl OrganizationStore {
    /// Where one organization's replica lives: `org-<id>.db` beside `app.db` and beside every
    /// `ws-<id>.db`, for the reason `Database::replica_path` gives. Two organizations on one
    /// machine never meet, and neither meets a workspace.
    pub fn replica_path(database_path: &Path, organization_id: &str) -> PathBuf {
        let directory = database_path.parent().unwrap_or_else(|| Path::new("."));

        directory.join(format!("org-{organization_id}.db"))
    }

    /// Open the replica, through the same construction the workspace engine uses.
    ///
    /// **A second `turso::sync::Database`, not a second `Engine` arm.** Built through
    /// [`Database::open_replica`] so that the crypto-provider guard and `bootstrap_if_empty(false)`
    /// are the ones the workspace already runs under, and so that whatever that function learns
    /// about the engine, this one learns too. A damaged `org-<id>.db` is one of those things: it is
    /// set aside there and opened again empty, and the sign-in's or the resume's pull fills it.
    pub async fn open<F, Fut>(
        clock: clock::Shared,
        path: &Path,
        remote_url: Option<String>,
        auth_token: F,
    ) -> Result<Self, Error>
    where
        F: Fn() -> Fut + Send + Sync + 'static,
        Fut: std::future::Future<Output = std::result::Result<String, turso::Error>>
            + Send
            + 'static,
    {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let database = Database::open_replica(clock.as_ref(), path, remote_url, auth_token).await?;
        let watch = corrupt::Watch::over(path);
        let connection = corrupt::Watched::new(watch.note(database.connect().await)?, watch);

        Ok(Self {
            database,
            connection,
            path: path.to_path_buf(),
            clock,
            bound: SYNC_BOUND,
            standing: std::sync::Mutex::new(Standing::Writable),
            format_steps: Ladder::Format.declared(),
            #[cfg(test)]
            a_read_fails: std::sync::atomic::AtomicBool::new(false),
        })
    }

    /// The same store with its pushes and pulls given up after `bound`, which is how a test
    /// against a silent remote finishes in seconds.
    #[cfg(test)]
    pub(crate) fn with_bound(mut self, bound: Bound) -> Self {
        self.bound = bound;
        self
    }

    /// The same store judging and completing the organization by `steps`, a ladder of the test's
    /// own: a change of format declared after effort 857, which no shipped step is yet.
    #[cfg(test)]
    pub(crate) fn declaring(mut self, steps: Steps) -> Self {
        self.format_steps = steps;
        self
    }

    /// The changes of format this store judges and completes the organization by: which run on
    /// open, and the format this build knows.
    pub(crate) fn format_steps(&self) -> Steps {
        self.format_steps
    }

    /// The clock the replica was opened with.
    pub(crate) fn clock(&self) -> &dyn Clock {
        self.clock.as_ref()
    }

    /// The directory the replica lives in: the application's data directory, beside `app.db`, as
    /// [`Self::replica_path`] puts it. A copy taken before a change of format goes under it
    /// (`backup.rs`).
    pub(crate) fn directory(&self) -> &Path {
        self.path.parent().unwrap_or_else(|| Path::new("."))
    }

    /// Create the ten tables where they do not exist.
    ///
    /// Issued through the sync connection, so on the machine that creates the organization the
    /// schema is captured as change data and reaches the remote with the first push; every other
    /// machine receives it as pages and the statements here find the tables already there.
    /// `CREATE TABLE` replicates this way where a drop-and-rename does not, which is the finding
    /// `database/test/workspace.rs` records and the reason this schema is never migrated by
    /// renaming. `ALTER TABLE ... ADD COLUMN` and `DROP COLUMN` do replicate, measured on
    /// 2026-09-26, and the one upgrade that alters a table says under what condition
    /// ([`OrganizationStore::format_one_reshape`]).
    pub async fn install_schema(&self) -> Result<(), Error> {
        install(&self.connection).await
    }

    /// Create the tables of format 2 where they do not exist, and none a later format adds: what
    /// the change from format 1 creates (`upgrade/format/chain/`), leaving the rest to the changes
    /// after it.
    pub async fn install_format_two_schema(&self) -> Result<(), Error> {
        install_format_two(&self.connection).await
    }

    /// Create what format 3 adds where it does not exist (`upgrade/format/overriding.rs`).
    pub async fn install_format_three_schema(&self) -> Result<(), Error> {
        install_format_three(&self.connection).await
    }

    /// Send what this machine wrote. A failure is an answer, as `Database::push_replica` says: a
    /// push that did not reach the remote leaves what it carried captured for the next one.
    ///
    /// **Except where the remote refused it because an upgrade removed what it names** (effort
    /// 857, ticket 20): measured on the workspace's replica and true of this one, a second push
    /// after that refusal drops the changes without a word. So the refusal is recorded beside the
    /// replica and no push or pull is made of it again until the person discards the changes
    /// ([`OrganizationStore::pushed`], `database/unsendable.rs`).
    pub async fn push(&self) -> bool {
        self.pushed().await.is_ok()
    }

    /// The same push with the refusal kept, for the callers that have to tell a push the remote
    /// refused on its merits from one that did not reach it: the owner's upgrade, where changes an
    /// earlier build captured under columns the remote has since dropped are refused for good
    /// (effort 838, ticket 25; [`OrganizationStore::format_one_reshape`] records the measurement).
    ///
    /// **A replica holding changes the organization refused since an upgrade is not pushed**, and
    /// a push refused that way records it (effort 857, ticket 20): the answer is the refusal
    /// either way, in the engine's own words the first time and in the hold's after.
    pub async fn pushed(&self) -> Result<(), turso::Error> {
        if self.holds_unsendable() {
            return Err(held());
        }

        let pushed = self
            .connection
            .watch()
            .note(bounded(self.bound, "push", self.database.push()).await)
            .map(|_| ());

        if let Err(refusal) = &pushed {
            self.hold_if_unsendable(refusal);
        }

        pushed
    }

    /// Whether this replica holds changes the organization refused because an upgrade removed or
    /// renamed what they name, which nothing sends or brings over until the person discards them
    /// (effort 857, ticket 20; `database/unsendable.rs`).
    pub fn holds_unsendable(&self) -> bool {
        unsendable::held(&self.path)
    }

    /// The refusal a person is told while this replica holds such changes, or `None` where it
    /// holds none.
    pub fn unsendable(&self) -> Option<Error> {
        self.holds_unsendable()
            .then(unsendable::organization_refusal)
    }

    /// Discard the changes the replica at `path` holds that the organization refused since an
    /// upgrade, at the person's word (effort 857, ticket 20): the replica is removed with
    /// everything beside it, its record of the refusal included, and the caller opens it again,
    /// which makes a fresh copy of what the remote holds. The caller lets the store go first: on
    /// Windows a file this process still has open cannot be deleted.
    ///
    /// **Refused while nothing is held**, so changes that could still be sent are never thrown
    /// away by this. What else the replica held unsent goes with it, and that is what the person
    /// is told before they say yes.
    pub(crate) fn discard_unsendable(path: &Path) -> Result<(), Error> {
        if !unsendable::held(path) {
            return Err(Self::nothing_unsent());
        }

        Database::remove_replica_files(path);
        unsendable::forget(path);

        crate::diagnostics::warn("organization.unsendable.discarded")
            .with("replica", path.display().to_string())
            .write();

        Ok(())
    }

    /// The refusal of a discard asked where nothing is held.
    pub(crate) fn nothing_unsent() -> Error {
        Error::refused(
            crate::error::RefusalReason::NothingUnsent,
            "this organization holds no changes it was refused, so nothing was discarded",
        )
    }

    /// The replica's file, which is where the record of a refusal is kept beside.
    pub(crate) fn path(&self) -> &Path {
        &self.path
    }

    /// Record beside the replica that `refusal`, a push's or a pull's, is changes the organization
    /// refuses since an upgrade, where it is.
    fn hold_if_unsendable(&self, refusal: &turso::Error) {
        let refusal = refusal.to_string();

        if unsendable::names_what_the_upgrade_removed(&refusal) {
            unsendable::hold(&self.path, &refusal);
        }
    }

    /// Bring what the remote has, and say whether anything arrived.
    pub async fn pull(&self) -> bool {
        matches!(self.pulled().await, Ok(true))
    }

    /// The same pull with the refusal kept, for the one caller that has to read it.
    ///
    /// **Every other caller wants the bool**, because a pull that did not go is the offline case
    /// and the replica goes on serving what it holds (819's requirement 18). `forget_deleted_organization` is the
    /// exception: a remote answering that the database is not there any more is a fact about the
    /// organization rather than about this machine's connection, and it is the only way a machine
    /// learns the owner deleted it (effort 828, requirement 18).
    ///
    /// **A replica holding changes the organization refused since an upgrade is not pulled**
    /// (effort 857, ticket 20), since a pull drops them; and a pull that fails laying captured
    /// changes over a remote an upgrade reshaped, which is the first thing an updated build does
    /// at its sign-in or resume, records that it did. The changes stay where they are either way.
    pub async fn pulled(&self) -> Result<bool, turso::Error> {
        if self.holds_unsendable() {
            return Err(held());
        }

        let arrived = self
            .connection
            .watch()
            .note(bounded(self.bound, "pull", self.database.pull()).await)
            .inspect_err(|refusal| self.hold_if_unsendable(refusal))?;

        // a replica made by an earlier build lacks the tables the schema gained since, and the
        // remote lacks them too, because the schema is issued once, on the machine that created
        // the organization, and every other machine receives it as pages. So the first machine
        // to pull after a build that names a new table creates it here, through the sync
        // connection, and the push carries it to the remote for everybody else; a machine that
        // finds every table in place writes nothing. Effort 828 found this on the human's own
        // organization, which answered "no such table: succession" at launch.
        if self.complete_schema().await? {
            let _ = self.push().await;
        }

        Ok(arrived)
    }

    /// Create every table [`SCHEMA`] names that this replica lacks, and say whether any was.
    ///
    /// Read against the database rather than assumed, so a replica that already holds every
    /// table costs one query and no write. The statements are `CREATE TABLE IF NOT EXISTS`, so a
    /// second machine racing the first on the same table finds it there.
    ///
    /// **Only an organization of this build's format is completed** (effort 838, requirement 11).
    /// One of another format is written to not at all, so this creates nothing in it and answers
    /// that nothing was created; the reader that follows is what refuses it, or its owner's
    /// upgrade reshapes it (`upgrade/format/runner/`). Above all it never creates `format` in an
    /// older organization, whose missing table is one of the things that tell it apart; one
    /// carrying a `format` row beside format 1's table or columns is older too (ticket 25), and a
    /// member's pull creates nothing in it.
    ///
    /// **This build's format means any format that only additions separate from it** (effort 857,
    /// ticket 03): one at or past the last change shipped before 857, which still runs on open on
    /// the owner's machine as it always did, and no newer than this build knows. A change declared
    /// after 857 leaves the `format` row where it was, since the builds before 857 refuse any other
    /// number; so an organization of format 3 opened by a build knowing a later addition is
    /// completed here, by any member, and records in `organization_floor` the level the addition
    /// took it to beside the floors it left where they were. A change declared an upgrade is
    /// passed over: its tables, made empty here like any other, change nothing until the explicit
    /// upgrade runs it (ticket 07).
    pub async fn complete_schema(&self) -> Result<bool, turso::Error> {
        let as_turso = |error: Error| turso::Error::Error(error.to_string());
        let steps = self.format_steps;
        let format = self.format().await.map_err(as_turso)?;
        let completed = format.is_some_and(|format| {
            format >= i64::from(steps.settled()) && format <= i64::from(steps.known())
        });

        if !completed || self.carries_format_one().await.map_err(as_turso)? {
            return Ok(false);
        }

        let present = self.tables().await.map_err(as_turso)?;
        let mut created = false;

        for (table, statement) in TABLES.iter().zip(SCHEMA.iter()) {
            if !present.iter().any(|name| name == table) {
                self.connection.execute(statement, ()).await?;
                created = true;
            }
        }

        // the floors as they stand, before the additions this build knows are counted in: a
        // level they take it to is recorded once, with both floors where they were.
        if let Some(before) = self.floors().await.map_err(as_turso)?
            && let Some(level) = steps.on_open(before.level, &[]).into_iter().max()
        {
            self.record_organization_floor(Floors { level, ..before }, self.clock.now())
                .await
                .map_err(as_turso)?;
            created = true;
        }

        Ok(created)
    }

    /// The tables this database holds, read from the database rather than from [`TABLES`], which
    /// is what lets a test compare the two. What the engine owns is left out, as a copy leaves it
    /// out ([`backup::NOT_THE_ENGINES`]).
    pub async fn tables(&self) -> Result<Vec<String>, Error> {
        let mut rows = self
            .connection
            .query(
                &format!(
                    "SELECT name FROM sqlite_master WHERE type = 'table' AND {} ORDER BY name",
                    backup::NOT_THE_ENGINES
                ),
                (),
            )
            .await?;
        let mut names = Vec::new();

        while let Some(row) = rows.next().await? {
            names.push(text(&row, 0)?);
        }

        Ok(names)
    }

    /// Open a transaction on this replica: what [`OrganizationStore::commit`] makes whole and
    /// [`OrganizationStore::rollback`] undoes. For an act whose rows must land together or not at
    /// all, a re-issue above all (effort 838): a new certificate, the revocation of the old one
    /// and the rows moved from it.
    ///
    /// **Not nested, and not held across a push.** Every write between the two is on this
    /// connection, and the push that follows the act carries what was committed.
    pub async fn begin(&self) -> Result<(), Error> {
        self.connection.execute("BEGIN", ()).await?;

        Ok(())
    }

    /// Make the open transaction's writes whole.
    pub async fn commit(&self) -> Result<(), Error> {
        self.connection.execute("COMMIT", ()).await?;

        Ok(())
    }

    /// Undo the open transaction's writes.
    pub async fn rollback(&self) -> Result<(), Error> {
        self.connection.execute("ROLLBACK", ()).await?;

        Ok(())
    }

    /// The columns one table carries, as the database reports them: what the startup check reads
    /// to tell a replica built under an earlier schema from one this build wrote
    /// (`organization/session/forget.rs`). A table that is not there has no columns.
    pub async fn columns_of(&self, table: &str) -> Result<Vec<String>, Error> {
        let mut rows = self
            .connection
            .query(&format!("PRAGMA table_info(\"{table}\")"), ())
            .await?;
        let mut names = Vec::new();

        while let Some(row) = rows.next().await? {
            names.push(text(&row, 1)?);
        }

        Ok(names)
    }

    /// The id of every workspace this replica names, read without verifying anything: what tells a
    /// machine forgetting the organization which of its workspace replicas are this
    /// organization's where its record does not say (`organization/session/forget.rs`).
    ///
    /// **Only ever a second source.** A row nobody signed could name any id, so what is read here
    /// decides nothing about who may do what; the forget asks it only of replica entries that name
    /// no organization, and every entry that names one is answered by the record. A replica with no
    /// workspace table names none.
    pub(crate) async fn workspace_ids_unverified(&self) -> Result<Vec<String>, Error> {
        if !self
            .columns_of("workspace")
            .await?
            .iter()
            .any(|column| column == "id")
        {
            return Ok(Vec::new());
        }

        let mut rows = self
            .connection
            .query("SELECT \"id\" FROM \"workspace\"", ())
            .await?;
        let mut ids = Vec::new();

        while let Some(row) = rows.next().await? {
            ids.push(text(&row, 0)?);
        }

        Ok(ids)
    }

    /// What the check before a change of format commits reads of this replica, inside that change's
    /// transaction (effort 838, ticket 33; `schema/`).
    pub(crate) async fn found(&self) -> Result<schema::Found, Error> {
        schema::read_engine(&self.connection).await
    }

    /// The connection, for a test that has to write a row the store would never write.
    #[cfg(test)]
    pub(crate) fn connection(&self) -> &turso::Connection {
        &self.connection
    }
}

/// The statements [`install`] runs, in order: what the organization's upgrade builds a fresh
/// organization with on a plain SQLite, to check the primary against (effort 857, ticket 24).
pub(crate) fn statements() -> &'static [&'static str] {
    &SCHEMA
}

/// Create the nineteen tables on `connection` where they do not exist: what
/// [`OrganizationStore::install_schema`] runs on the replica, and what a change of format arriving
/// at this format builds a fresh organization with, to check an upgraded one against
/// (`upgrade::format::Transition::built`, ticket 33).
pub(crate) async fn install(connection: &turso::Connection) -> Result<(), Error> {
    for statement in SCHEMA {
        connection.execute(statement, ()).await?;
    }

    Ok(())
}

/// Create the tables of format 2 on `connection`: every one but what format 3 added. What the
/// change arriving at format 2 builds a fresh organization with, where a walk ends there
/// (`upgrade/format/chain/`), and what a test builds an organization of format 2 from.
pub(crate) async fn install_format_two(connection: &turso::Connection) -> Result<(), Error> {
    for statement in &SCHEMA[..FORMAT_TWO_TABLES] {
        connection.execute(statement, ()).await?;
    }

    Ok(())
}

/// Create what format 3 adds, where it is missing: the `workspace_override` table (effort 838,
/// ticket 53), the two tables a machine is signed out on its own by (effort 846), and the signed
/// organization name and the members' locks (effort 851), which came after it with no change of
/// format. What
/// `upgrade/format/overriding.rs` runs.
pub(crate) async fn install_format_three(connection: &turso::Connection) -> Result<(), Error> {
    for statement in &SCHEMA[FORMAT_TWO_TABLES..] {
        connection.execute(statement, ()).await?;
    }

    Ok(())
}

/// The replica as a copy reads it, before its format changes (effort 838, tickets 27 and 30): one
/// transaction on the replica's own connection, so everything the copy reads is of one moment,
/// rolled back at its end having written nothing.
impl backup::Source for OrganizationStore {
    async fn begin(&self) -> Result<(), Error> {
        OrganizationStore::begin(self).await
    }

    async fn read(&self, sql: &str) -> Result<Vec<Vec<turso::Value>>, Error> {
        let mut rows = self.connection.query(sql, ()).await?;
        let mut values = Vec::new();

        while let Some(row) = rows.next().await? {
            values.push(
                (0..row.column_count())
                    .map(|index| row.get_value(index))
                    .collect::<Result<Vec<_>, _>>()?,
            );
        }

        Ok(values)
    }

    async fn end(&self) -> Result<(), Error> {
        self.rollback().await
    }
}

fn text(row: &turso::Row, index: usize) -> Result<String, Error> {
    match row.get_value(index)? {
        turso::Value::Text(value) => Ok(value),
        other => Err(unexpected(index, "text", &other)),
    }
}

fn nullable_text(row: &turso::Row, index: usize) -> Result<Option<String>, Error> {
    match row.get_value(index)? {
        turso::Value::Text(value) => Ok(Some(value)),
        turso::Value::Null => Ok(None),
        other => Err(unexpected(index, "text or null", &other)),
    }
}

fn blob(row: &turso::Row, index: usize) -> Result<Vec<u8>, Error> {
    match row.get_value(index)? {
        turso::Value::Blob(value) => Ok(value),
        other => Err(unexpected(index, "a blob", &other)),
    }
}

fn nullable_blob(row: &turso::Row, index: usize) -> Result<Option<Vec<u8>>, Error> {
    match row.get_value(index)? {
        turso::Value::Blob(value) => Ok(Some(value)),
        turso::Value::Null => Ok(None),
        other => Err(unexpected(index, "a blob or null", &other)),
    }
}

fn integer(row: &turso::Row, index: usize) -> Result<i64, Error> {
    match row.get_value(index)? {
        turso::Value::Integer(value) => Ok(value),
        other => Err(unexpected(index, "an integer", &other)),
    }
}

fn nullable_integer(row: &turso::Row, index: usize) -> Result<Option<i64>, Error> {
    match row.get_value(index)? {
        turso::Value::Integer(value) => Ok(Some(value)),
        turso::Value::Null => Ok(None),
        other => Err(unexpected(index, "an integer or null", &other)),
    }
}

/// A blob of exactly `N` bytes, which every key column is.
fn fixed<const N: usize>(row: &turso::Row, index: usize, column: &str) -> Result<[u8; N], Error> {
    let bytes = blob(row, index)?;

    <[u8; N]>::try_from(bytes.as_slice()).map_err(|_| Error::Integrity {
        message: format!(
            "the organization database holds a {column} of {} bytes where {N} were expected",
            bytes.len()
        ),
    })
}

fn optional_text(value: Option<&str>) -> turso::Value {
    match value {
        Some(value) => turso::Value::Text(value.to_string()),
        None => turso::Value::Null,
    }
}

/// The value is described by its storage class and never quoted: a column here may hold a
/// sealed value or a key, and neither belongs in an error string.
fn unexpected(index: usize, expected: &str, found: &turso::Value) -> Error {
    let class = match found {
        turso::Value::Null => "null",
        turso::Value::Integer(_) => "an integer",
        turso::Value::Real(_) => "a real",
        turso::Value::Text(_) => "text",
        turso::Value::Blob(_) => "a blob",
    };

    Error::Integrity {
        message: format!(
            "the organization database answered column {index} with {class} where {expected} was \
             expected"
        ),
    }
}

#[cfg(test)]
mod tests {
    use crate::credential::Memory;

    use std::path::PathBuf;

    use super::{
        FORMAT_VERSION, GrantRecord, MarkRecord, MemberRecord, OrganizationNameRecord,
        OrganizationRecord, OrganizationStore, RoleRecord, Signer, TABLES, WorkspaceRecord,
    };
    use crate::error::{Error, RefusalReason};
    use crate::organization::{
        authority::{
            AdministratorKey, Authority, Certificate, GrantAuthority, InvitationAuthority, Issue,
            MarkAuthority, OrganizationKey, WorkspaceAuthority, issue_certificate,
            issue_root_certificate, revoke, sign,
        },
        member::vault::{
            ContentKey, KdfParams, create_vault_with_secret, generate_content_key, open_content,
            seal_content, seal_to_public_key,
        },
        role::permission::{Flag, MANAGER_ROLE, MEMBER_ROLE, mask_of},
    };
    use crate::test::scratch;

    /// A cost cheap enough to run in a suite, written out as a caller writes one.
    fn test_cost() -> KdfParams {
        KdfParams {
            memory_kib: 1024,
            iterations: 2,
            lanes: 1,
        }
    }

    /// An organization with its owner, as the first run creates one: an organization key, the
    /// owner's signing key, and the root that joins them.
    struct Chain {
        organization_key: OrganizationKey,
        administrator_key: AdministratorKey,
        certificate: Certificate,
        content_key: ContentKey,
    }

    impl Chain {
        fn new() -> Self {
            let organization_key = OrganizationKey::generate().expect("an organization key");
            let administrator_key = AdministratorKey::generate().expect("an administrator key");
            let certificate = issue_root_certificate(
                &organization_key,
                "cert-owner",
                "member-owner",
                &administrator_key.verifying_key(),
                "1757000000000",
            );

            Self {
                organization_key,
                administrator_key,
                certificate,
                content_key: generate_content_key().expect("a content key"),
            }
        }

        fn signer(&self) -> Signer<'_> {
            Signer {
                key: &self.administrator_key,
                certificate: &self.certificate,
            }
        }

        /// The manager's and the member's role rows, as a first run writes them.
        async fn write_roles(&self, store: &OrganizationStore) {
            for built_in in [MANAGER_ROLE, MEMBER_ROLE] {
                store
                    .write_role(
                        &self.signer(),
                        &RoleRecord {
                            id: built_in.id.to_string(),
                            kind: built_in.id.to_string(),
                            name_sealed: Vec::new(),
                            mask: built_in.mask,
                            rank: built_in.rank,
                        },
                    )
                    .await
                    .expect("a role");
            }
        }

        fn verifying_key(&self) -> [u8; 32] {
            self.organization_key.verifying_key()
        }

        fn sealed(&self, column: &str, plaintext: &str) -> Vec<u8> {
            seal_content(&self.content_key, column, plaintext.as_bytes()).expect("failed to seal")
        }

        fn member(&self, id: &str, username: &str, role: &str) -> MemberRecord {
            let (vault, secret) =
                create_vault_with_secret("a password", test_cost()).expect("a vault");
            let sealed_content_key =
                seal_to_public_key(&vault.public_key, &self.content_key.to_bytes())
                    .expect("failed to seal the content key");
            let signing_public_key = AdministratorKey::from_bytes(
                &secret
                    .derive_seed(crate::organization::setup::ADMINISTRATOR_KEY_PURPOSE)
                    .expect("the signing seed"),
            )
            .verifying_key();

            MemberRecord {
                id: id.to_string(),
                username_sealed: self.sealed("member.username_sealed", username),
                vault,
                signing_public_key,
                sealed_content_key,
                role_id: role.to_string(),
                override_mask: 0,
                removed_at: None,
                effective: 0,
                covered: true,
                must_change_password: role != "owner",
                created_at: 1_757_000_000_000,
                updated_at: 1_757_000_000_000,
                session_epoch: 0,
                owner_seed_sealed: None,
            }
        }

        fn workspace(&self, id: &str, name: &str) -> WorkspaceRecord {
            WorkspaceRecord {
                id: id.to_string(),
                name_sealed: self.sealed("workspace.name_sealed", name),
                database_name: format!("ws-{id}"),
                database_hostname: format!("ws-{id}-acme.aws-eu-west-1.turso.io"),
                schema_version: 5,
                created_at: 1_757_000_000_000,
                updated_at: 1_757_000_000_000,
            }
        }
    }

    async fn open(directory: &std::path::Path) -> OrganizationStore {
        let store = OrganizationStore::open(
            crate::clock::System::shared(),
            &directory.join("org-acme.db"),
            None,
            || async { Ok::<String, turso::Error>(String::new()) },
        )
        .await
        .expect("the organization replica");

        store.install_schema().await.expect("the schema");

        store
    }

    /// **The organization replica's push and pull read as offline within the bound when the remote
    /// never answers** (effort 854, criterion 15). The heartbeat pushes and pulls it under the
    /// member lock, so a call that waited for good would hold that lock for good.
    #[test]
    fn a_silent_remote_reads_as_offline_for_the_organization_within_the_bound() {
        use crate::{
            database::bound::Bound,
            sync::test::server::{SilentServer, within},
        };
        use std::time::{Duration, Instant};

        within(Duration::from_secs(60), async {
            let silent = SilentServer::start();
            let directory = scratch("organization-silent");
            let store = OrganizationStore::open(
                crate::clock::System::shared(),
                &directory.join("org-acme.db"),
                Some(silent.url()),
                || async { Ok::<String, turso::Error>("a-credential".to_string()) },
            )
            .await
            .expect("the organization replica")
            .with_bound(Bound {
                silence: Duration::from_millis(300),
                ceiling: Duration::from_secs(60),
            });

            let started = Instant::now();
            assert!(!store.push().await, "a silent push went through");
            assert!(
                started.elapsed() < Duration::from_secs(2),
                "the push waited on"
            );

            let started = Instant::now();
            assert!(!store.pull().await, "a silent pull brought something");
            assert!(
                started.elapsed() < Duration::from_secs(2),
                "the pull waited on"
            );

            drop(store);
            drop(silent);
            let _ = std::fs::remove_dir_all(&directory);
        });
    }

    /// What the remote answers a push whose changes name a column an upgrade removed, as the live
    /// run of ticket 13 read it off Turso. *`database/mod.rs` keeps the same answer; a fixture is
    /// written out per module ([[rules/testing]]).*
    const REMOVED_COLUMN: &str = r#"{"baton":null,"base_url":null,"results":[{"type":"error","error":{"message":"SQLite error: table member has no column named note","code":"SQLITE_UNKNOWN"}}]}"#;

    /// **Effort 857, ticket 20, the classification and the hold.** A push of the organization
    /// replica the remote refuses because an upgrade removed what the changes name is answered as
    /// `ChangesUnsendableAfterUpgrade` and recorded beside the replica; from then on nothing pushes
    /// or pulls that replica, in this session or the next, since a second push or a pull drops the
    /// changes without a word (`database/unsendable.rs`). What it holds stays readable here.
    #[test]
    fn a_push_naming_what_an_upgrade_removed_holds_the_organization_replica() {
        use crate::{
            database::{bound::Bound, unsendable},
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
            let directory = scratch("organization-unsendable");
            let path = directory.join("org-acme.db");
            let opened = || async {
                OrganizationStore::open(
                    crate::clock::System::shared(),
                    &path,
                    Some(remote.url("")),
                    || async { Ok::<String, turso::Error>("a-credential".to_string()) },
                )
                .await
                .expect("the organization replica")
                .with_bound(Bound {
                    silence: Duration::from_secs(5),
                    ceiling: Duration::from_secs(60),
                })
            };
            let store = opened().await;

            store.install_schema().await.expect("the schema, unsent");

            assert!(
                !store.holds_unsendable(),
                "held before anything was refused"
            );

            let refused = store.pushed().await.expect_err("the push went");

            assert!(
                unsendable::names_what_the_upgrade_removed(&refused.to_string()),
                "{refused}"
            );
            assert!(store.holds_unsendable(), "nothing records the refusal");
            assert!(unsendable::marker(&path).exists());
            assert!(matches!(
                store.unsendable(),
                Some(Error::Refused {
                    reason: RefusalReason::ChangesUnsendableAfterUpgrade,
                    ..
                })
            ));

            // held: nothing reaches the remote again, whichever call asks.
            let sent = remote.request_count();

            assert!(!store.push().await);
            assert!(!store.pull().await);
            assert!(store.pulled().await.is_err());
            assert!(store.pushed().await.is_err());
            assert_eq!(
                remote.request_count(),
                sent,
                "a held replica reached the remote"
            );
            assert!(
                !(0..sent).any(|index| remote.request(index).target == "/pull-updates"),
                "the refused push was followed by a pull"
            );

            // and the next launch holds it the same way, with what it held still here.
            drop(store);
            let store = opened().await;

            assert!(store.holds_unsendable(), "a reopen forgot");
            assert!(!store.push().await);
            assert!(!store.pull().await);
            assert_eq!(
                remote.request_count(),
                sent,
                "a reopened replica reached the remote"
            );
            assert_eq!(
                store.tables().await.expect("the tables").len(),
                TABLES.len(),
                "what the replica held is gone"
            );

            drop(store);
            drop(remote);
            let _ = std::fs::remove_dir_all(&directory);
        });
    }

    /// The organization every populated test starts from: one owner, one member, two workspaces,
    /// and a grant on each. **Two workspaces of one organization**, which is criterion 1 and the
    /// thing `workspace.ownerAccountId` being `.unique()` prevented.
    async fn populated(store: &OrganizationStore, chain: &Chain) {
        store
            .write_organization(&OrganizationRecord {
                id: "acme".to_string(),
                name_sealed: chain.sealed("organization.name_sealed", "Acme Rentals"),
                verifying_key: chain.verifying_key(),
                remote_url: "libsql://org-acme-acme.aws-eu-west-1.turso.io".to_string(),
                created_at: 1_757_000_000_000,
            })
            .await
            .expect("the organization row");
        store
            .write_certificate(&chain.certificate)
            .await
            .expect("the certificate");
        chain.write_roles(store).await;

        let signer = chain.signer();

        for member in [
            chain.member("member-owner", "olivia.owner", "owner"),
            chain.member("member-staff", "sami.staff", "member"),
        ] {
            store
                .write_member(&signer, &member)
                .await
                .expect("a member");
        }

        for workspace in [
            chain.workspace("north", "North Properties"),
            chain.workspace("south", "South Properties"),
        ] {
            store
                .write_workspace(&signer, &workspace)
                .await
                .expect("a workspace");
            store
                .write_grant(
                    &signer,
                    &GrantRecord {
                        member_id: "member-staff".to_string(),
                        workspace_id: workspace.id.clone(),
                        sealed_credential: b"a sealed workspace credential".to_vec(),
                        access_level: "full-access".to_string(),
                        credential_expires_at: Some("1757600000000".to_string()),
                    },
                )
                .await
                .expect("a grant");
        }
    }

    // criterion 1: the schema, and two workspaces of one organization

    #[tokio::test]
    async fn a_replica_lacking_a_table_the_schema_names_gains_it_and_says_so() {
        // an organization of this format made by a build that knew one table fewer: every
        // statement but the last, and the format row the first run writes.
        let directory = scratch("schema-completes");
        let newest = super::TABLES[super::TABLES.len() - 1];
        let store = OrganizationStore::open(
            crate::clock::System::shared(),
            &directory.join("org-x.db"),
            None,
            || async { Ok::<String, turso::Error>(String::new()) },
        )
        .await
        .expect("the store");

        for statement in &super::SCHEMA[..super::SCHEMA.len() - 1] {
            store
                .connection
                .execute(statement, ())
                .await
                .expect("the older schema");
        }
        store.write_format().await.expect("the format row");
        assert!(
            !store
                .tables()
                .await
                .expect("the tables")
                .iter()
                .any(|t| t == newest),
            "the fixture already held the newest table"
        );

        assert!(
            store.complete_schema().await.expect("the completion"),
            "a missing table was not created"
        );
        assert!(
            store
                .tables()
                .await
                .expect("the tables")
                .iter()
                .any(|t| t == newest),
            "the newest table was not created"
        );
        assert!(
            !store
                .complete_schema()
                .await
                .expect("the second completion"),
            "a complete schema was reported as completed again"
        );
    }

    /// **Effort 846: the two tables a machine is signed out on its own by reach a replica of
    /// format 3 that lacks them**, as the schema reaches other machines: as pages, so a build that
    /// names a new table completes it on every machine after a pull. Format 3's replica as the build
    /// before this one made it, `workspace_override` and all, gains both and says so, and the
    /// `machine` table they sit beside keeps its four columns. **Effort 851's signed organization
    /// name and the members' locks came after them the same way**, and reach the same replica with
    /// them, and so does what each machine runs (effort 857), which is an addition on this ladder,
    /// and the two tables floors are recorded in (effort 857, ticket 03).
    #[tokio::test]
    async fn a_format_three_replica_without_the_machine_tables_gains_both() {
        let directory = scratch("schema-machine-tables");
        let store = OrganizationStore::open(
            crate::clock::System::shared(),
            &directory.join("org-x.db"),
            None,
            || async { Ok::<String, turso::Error>(String::new()) },
        )
        .await
        .expect("the store");

        assert_eq!(TABLES.len(), 22);
        assert_eq!(
            &TABLES[TABLES.len() - 8..],
            &[
                "workspace_override",
                "machine_sign_out",
                "machine_name",
                "organization_name",
                "member_lock",
                "machine_version",
                "workspace_floor",
                "organization_floor"
            ]
        );

        for statement in &super::SCHEMA[..super::SCHEMA.len() - 7] {
            store
                .connection
                .execute(statement, ())
                .await
                .expect("the schema of the build before");
        }
        store.write_format().await.expect("the format row");

        assert_eq!(
            store.format().await.expect("the format"),
            Some(FORMAT_VERSION)
        );
        assert!(
            store.complete_schema().await.expect("the completion"),
            "the missing tables were not created"
        );

        let tables = store.tables().await.expect("the tables");

        for table in [
            "machine_sign_out",
            "machine_name",
            "organization_name",
            "member_lock",
            "machine_version",
            "workspace_floor",
            "organization_floor",
        ] {
            assert!(tables.iter().any(|t| t == table), "{table} was not created");
        }
        assert_eq!(
            store.columns_of("machine").await.expect("the columns"),
            vec!["id", "member_id", "seen_at", "created_at"],
            "the machine table was altered"
        );
        assert_eq!(
            store
                .columns_of("machine_sign_out")
                .await
                .expect("the columns"),
            vec!["id", "machine_id", "member_id", "epoch", "at"]
        );
        assert_eq!(
            store.columns_of("machine_name").await.expect("the columns"),
            vec!["id", "name", "named_at"]
        );
        assert_eq!(
            store
                .columns_of("machine_version")
                .await
                .expect("the columns"),
            vec![
                "id",
                "rentable",
                "workspace_known",
                "format_known",
                "written_at"
            ]
        );
        assert_eq!(
            store
                .columns_of("organization_name")
                .await
                .expect("the columns"),
            vec![
                "id",
                "name_sealed",
                "updated_at",
                "certificate_id",
                "signature"
            ]
        );
        assert_eq!(
            store.columns_of("member_lock").await.expect("the columns"),
            vec![
                "member_id",
                "locked",
                "updated_at",
                "certificate_id",
                "signature"
            ]
        );
        assert_eq!(
            store.columns_of("organization").await.expect("the columns"),
            vec![
                "id",
                "name_sealed",
                "verifying_key",
                "remote_url",
                "created_at"
            ],
            "the organization table was altered"
        );
        assert_eq!(
            store.columns_of("member").await.expect("the columns").len(),
            18,
            "the member table was altered"
        );
        assert_eq!(
            store.format().await.expect("the format"),
            Some(FORMAT_VERSION),
            "the format moved"
        );
    }

    /// Every table in the schema but `format`, created as every build before effort 838 created
    /// them: an organization of today's shape, before the format break.
    async fn without_format(directory: &std::path::Path) -> OrganizationStore {
        let store = OrganizationStore::open(
            crate::clock::System::shared(),
            &directory.join("org-old.db"),
            None,
            || async { Ok::<String, turso::Error>(String::new()) },
        )
        .await
        .expect("the store");

        for (table, statement) in TABLES.iter().zip(super::SCHEMA.iter()) {
            if *table != "format" {
                store
                    .connection
                    .execute(statement, ())
                    .await
                    .expect("the schema before the format");
            }
        }

        store
    }

    /// Effort 838, requirement 11: the format is read, and an organization of another format is
    /// refused by name. No `format` table and a table with no row are both an earlier version's
    /// organization; a number above this build's is a newer one's; this build's own is let through.
    #[tokio::test]
    async fn an_organization_of_another_format_is_refused_by_name() {
        let directory = scratch("format");
        let older = without_format(&directory).await;

        assert_eq!(older.format().await.expect("the format"), None);
        assert!(matches!(
            older.refuse_another_format().await,
            Err(Error::Refused {
                reason: RefusalReason::OrganizationOlder,
                ..
            })
        ));

        let store = open(&scratch("format-current")).await;

        // the table with no row in it: a format row somebody deleted.
        assert_eq!(store.format().await.expect("the format"), None);
        assert!(matches!(
            store.refuse_another_format().await,
            Err(Error::Refused {
                reason: RefusalReason::OrganizationOlder,
                ..
            })
        ));

        store.write_format().await.expect("the format row");

        assert_eq!(
            store.format().await.expect("the format"),
            Some(FORMAT_VERSION)
        );
        store
            .refuse_another_format()
            .await
            .expect("this build's own format was refused");

        store
            .connection
            .execute(
                "UPDATE \"format\" SET \"version\" = ?",
                vec![turso::Value::Integer(FORMAT_VERSION + 1)],
            )
            .await
            .expect("a newer format");

        assert_eq!(
            store.format().await.expect("the format"),
            Some(FORMAT_VERSION + 1)
        );
        assert!(matches!(
            store.refuse_another_format().await,
            Err(Error::Refused {
                reason: RefusalReason::OrganizationNewer,
                ..
            })
        ));
    }

    /// Effort 838, requirement 11: the completion that runs after every pull writes nothing into an
    /// organization of another format. Above all it does not create `format` in an older one,
    /// whose missing table is the only thing that tells it apart, and it does not create the
    /// tables this build names that an older one lacks.
    #[tokio::test]
    async fn an_organization_of_another_format_is_not_completed() {
        let directory = scratch("format-not-completed");
        let older = without_format(&directory).await;

        older
            .connection
            .execute("DROP TABLE \"mark\"", ())
            .await
            .expect("a table the older organization lacks");

        let before = older.tables().await.expect("the tables");

        assert!(
            !older.complete_schema().await.expect("the completion"),
            "an older organization was completed"
        );
        assert_eq!(older.tables().await.expect("the tables"), before);
        assert!(
            !before
                .iter()
                .any(|table| table == "format" || table == "mark")
        );

        let newer = open(&scratch("format-newer")).await;

        newer
            .connection
            .execute(
                "INSERT INTO \"format\" VALUES ('format', ?)",
                vec![turso::Value::Integer(FORMAT_VERSION + 1)],
            )
            .await
            .expect("a newer format");
        newer
            .connection
            .execute("DROP TABLE \"mark\"", ())
            .await
            .expect("a table the newer organization dropped");

        assert!(
            !newer.complete_schema().await.expect("the completion"),
            "a newer organization was completed"
        );
        assert!(
            !newer
                .tables()
                .await
                .expect("the tables")
                .iter()
                .any(|table| table == "mark")
        );
    }

    #[tokio::test]
    async fn the_ten_tables_exist_and_an_organization_holds_two_workspaces_at_once() {
        let directory = scratch("schema");
        let store = open(&directory).await;
        let chain = Chain::new();

        let mut expected: Vec<String> = TABLES.iter().map(|table| table.to_string()).collect();
        expected.sort();
        assert_eq!(store.tables().await.expect("the tables"), expected);

        populated(&store, &chain).await;

        let workspaces = store
            .workspaces(&chain.verifying_key())
            .await
            .expect("the workspaces");

        assert_eq!(
            workspaces.len(),
            2,
            "one organization holds one workspace only"
        );
        assert_eq!(workspaces[0].database_name, "ws-north");
        assert_eq!(workspaces[1].database_name, "ws-south");

        // nothing constrains an account to one workspace: there is no owner column to constrain.
        let mut columns = store
            .connection()
            .query("PRAGMA table_info(\"workspace\")", ())
            .await
            .expect("the workspace columns");
        let mut names = Vec::new();

        while let Some(row) = columns.next().await.expect("a column row") {
            names.push(super::text(&row, 1).expect("a column name"));
        }

        assert!(
            !names.iter().any(|name| name.contains("owner")),
            "the workspace table carries an owner column: {names:?}"
        );
        assert!(names.contains(&"database_name".to_string()));
        assert!(names.contains(&"schema_version".to_string()));

        // the invitation's own columns, pinned: `sealed_secret` is what `upgrade::shape::old_shape`
        // calls a replica without the old shape by, so a schema that stopped declaring it would
        // wipe every machine at startup rather than fail here. *`code_seal` and
        // `code_expires_at` sat last, added last and outside the signature, until effort 828 moved
        // the seal into the link's own text.*
        let mut columns = store
            .connection()
            .query("PRAGMA table_info(\"invitation\")", ())
            .await
            .expect("the invitation columns");
        let mut names = Vec::new();

        while let Some(row) = columns.next().await.expect("a column row") {
            names.push(super::text(&row, 1).expect("a column name"));
        }

        assert_eq!(
            names,
            vec![
                "id",
                "member_id",
                "expires_at",
                "consumed_at",
                "sealed_secret",
                "issued_by",
                "certificate_id",
                "signature",
                "created_at"
            ]
        );

        // the member's own columns, pinned for the same two reasons: `signing_public_key` is what
        // an owner certifies when they widen somebody into an act that signs (effort 826,
        // requirement 6), `session_epoch` is what ends a session opened on another machine
        // (requirement 22), and `upgrade::shape::old_shape` calls a replica without either the old
        // shape.
        // `owner_seed_sealed` is last and nullable, which is load-bearing: it is the organization
        // key's seed sealed to an owner who was given the organization (effort 828, requirement
        // 22), and it is folded into the signed preimage only where it is present, so a row
        // without it hashes exactly as it did before the column existed.
        let mut columns = store
            .connection()
            .query("PRAGMA table_info(\"member\")", ())
            .await
            .expect("the member columns");
        let mut names = Vec::new();

        while let Some(row) = columns.next().await.expect("a column row") {
            names.push(super::text(&row, 1).expect("a column name"));
        }

        assert_eq!(
            names,
            vec![
                "id",
                "username_sealed",
                "public_key",
                "signing_public_key",
                "sealed_secret_key",
                "sealed_content_key",
                "kdf_salt",
                "kdf_params",
                "role_id",
                "override",
                "removed_at",
                "must_change_password",
                "certificate_id",
                "signature",
                "created_at",
                "updated_at",
                "session_epoch",
                "owner_seed_sealed"
            ]
        );

        // and the schema is idempotent, which is what a second machine runs into.
        store.install_schema().await.expect("the schema, again");
    }

    /// Effort 828, requirement 16: **a replica still carrying `link_credential_sealed` opens, and
    /// its organization row reads.**
    ///
    /// The column left the schema and nothing migrates the databases that have it:
    /// `CREATE TABLE IF NOT EXISTS` leaves a table that exists alone, and the write and the read
    /// both name their columns, so the one nobody names any more is simply never touched. This is
    /// the whole of what retiring the organization's own link does to data at rest.
    #[tokio::test]
    async fn a_replica_still_carrying_the_link_credential_column_opens_and_reads() {
        let directory = scratch("dropped-column");
        let store = OrganizationStore::open(
            crate::clock::System::shared(),
            &directory.join("org-acme.db"),
            None,
            || async { Ok::<String, turso::Error>(String::new()) },
        )
        .await
        .expect("the organization replica");
        let chain = Chain::new();

        // the table as a replica written before this build has it: the dropped column, not null
        // and filled, exactly where it was.
        store
            .connection()
            .execute(
                "CREATE TABLE \"organization\" (\
                 \"id\" TEXT PRIMARY KEY NOT NULL, \
                 \"name_sealed\" BLOB NOT NULL, \
                 \"verifying_key\" BLOB NOT NULL, \
                 \"remote_url\" TEXT NOT NULL, \
                 \"link_credential_sealed\" BLOB NOT NULL, \
                 \"created_at\" INTEGER NOT NULL)",
                (),
            )
            .await
            .expect("the previous shape of the table");
        store
            .connection()
            .execute(
                "INSERT INTO \"organization\" VALUES (?, ?, ?, ?, ?, ?)",
                vec![
                    turso::Value::Text("acme".to_string()),
                    turso::Value::Blob(chain.sealed("organization.name_sealed", "Acme Rentals")),
                    turso::Value::Blob(chain.verifying_key().to_vec()),
                    turso::Value::Text("libsql://org-acme-acme.aws-eu-west-1.turso.io".to_string()),
                    turso::Value::Blob(chain.sealed(
                        "organization.link_credential_sealed",
                        "a-read-only-credential",
                    )),
                    turso::Value::Integer(1_757_000_000_000),
                ],
            )
            .await
            .expect("the row in the previous shape");

        store
            .install_schema()
            .await
            .expect("the schema over a replica that still has the column");

        let row = store
            .organization()
            .await
            .expect("the organization row could not be read")
            .expect("a row");

        assert_eq!(row.id, "acme");
        assert_eq!(
            row.remote_url,
            "libsql://org-acme-acme.aws-eu-west-1.turso.io"
        );
        assert_eq!(row.verifying_key, chain.verifying_key());
        assert_eq!(row.created_at, 1_757_000_000_000);
        assert_eq!(
            open_content(
                &chain.content_key,
                "organization.name_sealed",
                &row.name_sealed
            )
            .expect("the name"),
            b"Acme Rentals"
        );
    }

    // criterion 2: the boundary

    /// **No rents domain table appears in the organization database.** The domain tables are
    /// read from the shipped workspace migrations rather than listed here, so an eighth concept
    /// added to the workspace arrives in this test without anybody remembering to add it.
    #[tokio::test]
    async fn no_rents_domain_table_and_no_session_table_appears_in_the_organization_schema() {
        let directory = scratch("boundary");
        let store = open(&directory).await;

        let tables = store.tables().await.expect("the tables");
        let mut expected: Vec<String> = TABLES.iter().map(|table| table.to_string()).collect();
        expected.sort();

        assert_eq!(
            tables, expected,
            "a table was declared that TABLES does not name"
        );

        let migrations = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("migrations");
        let mut domain_tables = Vec::new();

        for entry in std::fs::read_dir(&migrations).expect("the migrations directory") {
            let path = entry.expect("an entry").path();

            if path.extension().is_some_and(|kind| kind == "sql") {
                let sql = std::fs::read_to_string(&path).expect("a migration");

                for statement in sql.split("--> statement-breakpoint") {
                    let statement = statement.trim();

                    if let Some(rest) = statement.strip_prefix("CREATE TABLE `") {
                        let name = rest.split('`').next().unwrap_or_default();

                        if !name.starts_with("__") && name != "idmap" {
                            domain_tables.push(name.to_string());
                        }
                    }
                }
            }
        }

        assert!(
            domain_tables.len() >= 7,
            "the boundary test found almost no domain tables: {domain_tables:?}"
        );

        for domain in &domain_tables {
            assert!(
                !tables.contains(domain),
                "the rents domain table {domain} appears in the organization database"
            );
        }

        // requirement 18: the table whose absence is the requirement.
        assert!(!tables.iter().any(|table| table == "session"));
    }

    // criterion 15: what a link and a read-only credential yield

    /// Given only what a join link carries, the organization id, its verifying key and the remote,
    /// and a credential that reads every row, no username, organization name or workspace name is
    /// legible. Asserted against populated rows rather than an empty table, over the raw bytes of
    /// every column of every table.
    #[tokio::test]
    async fn a_link_holder_reads_no_username_no_organization_name_and_no_workspace_name() {
        let directory = scratch("link");
        let store = open(&directory).await;
        let chain = Chain::new();

        populated(&store, &chain).await;

        let secrets = [
            "olivia.owner",
            "sami.staff",
            "olivia",
            "sami",
            "North Properties",
            "South Properties",
            "Acme Rentals",
            "a-read-only-credential",
        ];
        let mut cells = 0;

        for table in TABLES {
            let mut rows = store
                .connection()
                .query(&format!("SELECT * FROM \"{table}\""), ())
                .await
                .expect("the rows");

            while let Some(row) = rows.next().await.expect("a row") {
                for index in 0..row.column_count() {
                    let bytes = match row.get_value(index).expect("a value") {
                        turso::Value::Text(text) => text.into_bytes(),
                        turso::Value::Blob(blob) => blob,
                        _ => continue,
                    };

                    cells += 1;

                    for secret in secrets {
                        assert!(
                            !bytes
                                .windows(secret.len())
                                .any(|window| window == secret.as_bytes()),
                            "{secret:?} is legible in a {table} column to anybody holding the \
                             database"
                        );
                    }
                }
            }
        }

        assert!(
            cells > 20,
            "the secrecy test read almost nothing: {cells} cells"
        );

        // the verified rows are readable, and still say nothing, because the link carries no
        // content key and a member's sealed copy opens only with their password.
        let members = store
            .members(&chain.verifying_key())
            .await
            .expect("the members");
        let stranger = generate_content_key().expect("a key the link does not carry");

        assert_eq!(members.len(), 2);
        assert!(
            open_content(
                &stranger,
                "member.username_sealed",
                &members[0].username_sealed
            )
            .is_err(),
            "a username opened without the organization's content key"
        );
        assert_eq!(
            open_content(
                &chain.content_key,
                "member.username_sealed",
                &members[0].username_sealed
            )
            .expect("the owner's username"),
            b"olivia.owner"
        );
    }

    // criterion 16, and the ticket's own: every write signs, every read verifies

    #[tokio::test]
    async fn what_was_written_signed_is_read_back_verified() {
        let directory = scratch("signed");
        let store = open(&directory).await;
        let chain = Chain::new();

        populated(&store, &chain).await;

        let key = chain.verifying_key();
        let members = store.members(&key).await.expect("the members");
        let grants = store.grants(&key).await.expect("the grants");
        let organization = store
            .organization()
            .await
            .expect("the organization")
            .expect("an organization row");

        assert_eq!(members[0].id, "member-owner");
        assert_eq!(members[0].role_id, "owner");
        assert!(!members[0].must_change_password);
        assert_eq!(members[1].role_id, "member");
        assert!(members[1].must_change_password);
        assert_eq!(members[1].vault.kdf_params, test_cost());
        assert_eq!(grants.len(), 2);
        assert_eq!(grants[0].access_level, "full-access");
        assert_eq!(
            grants[0].credential_expires_at.as_deref(),
            Some("1757600000000")
        );
        assert_eq!(organization.verifying_key, key);
    }

    /// Effort 828, requirement 22: **a row without the seal and a row carrying it
    /// both verify**, against the same unchanged key.
    ///
    /// The nullable column is a tagged field of the signed preimage (`authority::preimage`), so a
    /// row with it and a row without it are two messages; `authority/` pins those bytes, and
    /// this is the same claim read through the store, where a row also has to survive a write and
    /// a read.
    ///
    /// **The seal is under signature and not beside it**, which is what the third read here
    /// shows: the column moved by hand on a row signed without it refuses the whole read, so
    /// nobody can hand themselves the key that certifies signers by writing a blob.
    #[tokio::test]
    async fn a_member_row_with_the_owner_seed_and_one_without_both_read_back_verified() {
        let directory = scratch("owner-seed");
        let store = open(&directory).await;
        let chain = Chain::new();
        let key = chain.verifying_key();
        let sealed = b"a sealed organization seed".to_vec();

        store
            .write_certificate(&chain.certificate)
            .await
            .expect("the certificate");
        chain.write_roles(&store).await;
        store
            .write_member(
                &chain.signer(),
                &chain.member("founder", "olivia", "member"),
            )
            .await
            .expect("the row written before the column");
        store
            .write_member(
                &chain.signer(),
                &MemberRecord {
                    owner_seed_sealed: Some(sealed.clone()),
                    ..chain.member("transferee", "ada", "member")
                },
            )
            .await
            .expect("the row written with the column");

        let members = store.members(&key).await.expect("both rows verify");
        let founder = members
            .iter()
            .find(|member| member.id == "founder")
            .expect("the founder's row");
        let transferee = members
            .iter()
            .find(|member| member.id == "transferee")
            .expect("the transferee's row");

        assert_eq!(founder.owner_seed_sealed, None);
        assert_eq!(transferee.owner_seed_sealed.as_deref(), Some(&sealed[..]));

        // and the column is under signature: putting a seal on the row that was signed without
        // one refuses the read by name rather than handing back a row that carries it.
        store
            .connection()
            .execute(
                "UPDATE \"member\" SET \"owner_seed_sealed\" = ? WHERE \"id\" = ?",
                vec![
                    turso::Value::Blob(sealed.clone()),
                    turso::Value::Text("founder".to_string()),
                ],
            )
            .await
            .expect("the update");

        let refused = store
            .members(&key)
            .await
            .expect_err("a seal added by hand read back as though it were signed");

        assert!(matches!(refused, Error::Integrity { .. }), "{refused:?}");
        assert!(refused.to_string().contains("founder"), "{refused}");
    }

    /// **A whole-row write never puts a member's session epoch back**, which is the whole of
    /// requirement 22 holding against an ordinary rename.
    ///
    /// The interleaving this stands for: somebody ends a member's sessions, the row goes to 1
    /// and is pushed; a manager whose replica has not pulled since fixes a typo in that
    /// member's username, and `invite::rename_member` writes the row back whole from the record
    /// it read, which still carries 0. `role::apply` and `removal::retire_member` write
    /// the same shape, `..member.clone()` with two fields moved, so the three are one case.
    /// Without the guard the row lands back at 0 and every machine the sign-out locked out opens
    /// again on its remembered key.
    #[tokio::test]
    async fn a_whole_row_write_from_a_record_carrying_an_older_epoch_keeps_the_rows_own() {
        let directory = scratch("epoch-floor");
        let store = open(&directory).await;
        let chain = Chain::new();

        populated(&store, &chain).await;

        let key = chain.verifying_key();
        let stale = store
            .members(&key)
            .await
            .expect("the members")
            .into_iter()
            .find(|member| member.id == "member-staff")
            .expect("the member row");

        assert_eq!(
            stale.session_epoch, 0,
            "a fresh row starts at the first epoch"
        );

        store
            .set_session_epoch("member-staff", 1, 1_757_000_001_000)
            .await
            .expect("the bump");

        // the rename, written from the record read before the bump.
        store
            .write_member(
                &chain.signer(),
                &MemberRecord {
                    username_sealed: chain.sealed("member.username_sealed", "sam.staff"),
                    updated_at: 1_757_000_002_000,
                    ..stale.clone()
                },
            )
            .await
            .expect("the rename");

        let renamed = store
            .members(&key)
            .await
            .expect("the members")
            .into_iter()
            .find(|member| member.id == "member-staff")
            .expect("the member row");

        assert_eq!(
            renamed.session_epoch, 1,
            "a rename put the session epoch back and re-admitted the machines a sign-out locked out"
        );
        assert_eq!(
            open_content(
                &chain.content_key,
                "member.username_sealed",
                &renamed.username_sealed
            )
            .expect("the username"),
            b"sam.staff",
            "the rename itself did not go through"
        );

        // and the bump's own write is held to the same line, which is what stops
        // `end_member_sessions` computing `+ 1` over a stale read and writing a number the row
        // has already passed.
        store
            .set_session_epoch("member-staff", 1, 1_757_000_003_000)
            .await
            .expect("the second bump");

        assert_eq!(
            store
                .members(&key)
                .await
                .expect("the members")
                .into_iter()
                .find(|member| member.id == "member-staff")
                .expect("the member row")
                .session_epoch,
            1,
            "a lower epoch was written over a higher one"
        );

        // a row nobody holds is still a refusal rather than a silent write.
        assert!(matches!(
            store
                .set_session_epoch("member-nobody", 4, 1_757_000_004_000)
                .await,
            Err(Error::Refused {
                reason: crate::error::RefusalReason::MemberMissing,
                ..
            })
        ));
    }

    /// **A member who writes another member's row with an altered role is rejected by every
    /// other client on read**, which is criterion 16 performed exactly: the write goes through the
    /// connection, as a full-access member's would, and the store's read refuses it by name.
    #[tokio::test]
    async fn a_row_another_member_altered_is_refused_on_read_and_named() {
        let directory = scratch("altered");
        let store = open(&directory).await;
        let chain = Chain::new();

        populated(&store, &chain).await;

        store
            .connection()
            .execute(
                "UPDATE \"member\" SET \"role_id\" = 'manager', \"override\" = 0 \
                 WHERE \"id\" = 'member-staff'",
                (),
            )
            .await
            .expect("the hostile write");

        let refusal = store
            .members(&chain.verifying_key())
            .await
            .expect_err("an altered role was read and used");

        assert!(
            refusal.to_string().contains("member-staff"),
            "the refusal does not name the row: {refusal}"
        );
        assert!(
            refusal.to_string().contains("refused"),
            "the refusal does not say so: {refusal}"
        );

        // the other tables are unaffected, and read.
        assert_eq!(
            store
                .workspaces(&chain.verifying_key())
                .await
                .expect("the workspaces")
                .len(),
            2
        );

        // and the owner's own row, read on its own, still answers: one hostile row stops the
        // list and not every other member's acts, which read their own row and no other.
        let owner = store
            .member(&chain.verifying_key(), "member-owner")
            .await
            .expect("the owner's row would not read")
            .expect("the owner is not a member");

        assert_eq!(owner.role_id, "owner");
        assert!(
            store
                .member(&chain.verifying_key(), "member-staff")
                .await
                .is_err(),
            "the altered row read on its own"
        );
        assert!(
            store
                .member(&chain.verifying_key(), "member-nobody")
                .await
                .expect("an unknown id would not read")
                .is_none()
        );
    }

    /// Write a workspace, a grant, an invitation and the mark straight into the database, signed
    /// by `key` under `certificate`, as somebody holding the credential writes around the store:
    /// the `west` workspace, a grant on north for `member-intruder`, `invitation-hostile`, and a
    /// mark that replaces the one there.
    async fn written_around_the_store(
        store: &OrganizationStore,
        key: &AdministratorKey,
        certificate: &Certificate,
    ) {
        let signed = |authority| sign(key, certificate, authority).expect("the signature");
        let text = |value: &str| turso::Value::Text(value.to_string());
        let blob = |value: &[u8]| turso::Value::Blob(value.to_vec());
        let workspace = WorkspaceAuthority {
            database_name: "ws-west",
            database_hostname: "ws-west-acme.aws-eu-west-1.turso.io",
        };
        let grant = GrantAuthority {
            member_id: "member-intruder",
            workspace_id: "north",
            sealed_credential: b"a credential for the intruder",
            access_level: "full-access",
            credential_expires_at: None,
        };
        let invitation = InvitationAuthority {
            id: "invitation-hostile",
            member_id: "member-intruder",
            expires_at: 1_757_900_000_000,
        };
        let mark = MarkAuthority {
            image_sealed: b"a hostile image",
            media_type: "image/png",
            updated_by: "member-intruder",
            updated_at: 1_757_100_000_000,
        };
        let statements = [
            (
                "INSERT OR REPLACE INTO \"workspace\" (\"id\", \"name_sealed\", \"database_name\", \
                 \"database_hostname\", \"schema_version\", \"certificate_id\", \"signature\", \
                 \"created_at\", \"updated_at\") VALUES ('west', X'00', ?, ?, 5, ?, ?, 1, 1)",
                vec![
                    text(workspace.database_name),
                    text(workspace.database_hostname),
                    text(&certificate.id),
                    blob(&signed(Authority::Workspace(workspace))),
                ],
            ),
            (
                "INSERT OR REPLACE INTO \"grant\" (\"member_id\", \"workspace_id\", \
                 \"sealed_credential\", \"access_level\", \"credential_expires_at\", \
                 \"certificate_id\", \"signature\") VALUES (?, ?, ?, ?, NULL, ?, ?)",
                vec![
                    text(grant.member_id),
                    text(grant.workspace_id),
                    blob(grant.sealed_credential),
                    text(grant.access_level),
                    text(&certificate.id),
                    blob(&signed(Authority::Grant(grant))),
                ],
            ),
            (
                "INSERT OR REPLACE INTO \"invitation\" (\"id\", \"member_id\", \"expires_at\", \
                 \"consumed_at\", \"sealed_secret\", \"issued_by\", \"certificate_id\", \
                 \"signature\", \"created_at\") VALUES (?, ?, ?, NULL, X'00', 'member-intruder', \
                 ?, ?, 1)",
                vec![
                    text(invitation.id),
                    text(invitation.member_id),
                    turso::Value::Integer(invitation.expires_at),
                    text(&certificate.id),
                    blob(&signed(Authority::Invitation(invitation))),
                ],
            ),
            (
                "INSERT OR REPLACE INTO \"mark\" (\"id\", \"image_sealed\", \"media_type\", \
                 \"updated_by\", \"updated_at\", \"certificate_id\", \"signature\") \
                 VALUES ('mark', ?, ?, ?, ?, ?, ?)",
                vec![
                    blob(mark.image_sealed),
                    text(mark.media_type),
                    text(mark.updated_by),
                    turso::Value::Integer(mark.updated_at),
                    text(&certificate.id),
                    blob(&signed(Authority::Mark(mark))),
                ],
            ),
        ];

        for (sql, values) in statements {
            store
                .connection()
                .execute(sql, values)
                .await
                .unwrap_or_else(|error| panic!("{sql}: {error}"));
        }
    }

    /// **Effort 838, ticket 25's ninth criterion.** A workspace, a grant, an invitation and the
    /// mark, each signed under a revoked certificate, under one nobody issued, and under one that
    /// does not cover it, are left out of what the directory reads, and none of them refuses the
    /// read: the rows beside each still read, the mark reads as none, and the member rows are
    /// untouched. *Until ticket 25 each of them refused the whole read for everybody.*
    #[tokio::test]
    async fn a_row_that_does_not_verify_is_left_out_and_the_rows_beside_it_still_read() {
        for cause in ["revoked", "unknown", "beyond its certificate"] {
            let directory = scratch("left-out");
            let store = open(&directory).await;
            let chain = Chain::new();
            let pinned = chain.verifying_key();

            populated(&store, &chain).await;
            store
                .write_invitation(
                    &chain.signer(),
                    &super::InvitationRecord {
                        id: "invitation-genuine".to_string(),
                        member_id: "member-staff".to_string(),
                        expires_at: 1_757_900_000_000,
                        consumed_at: None,
                        sealed_secret: vec![1],
                        issued_by: "member-owner".to_string(),
                        created_at: 1,
                    },
                )
                .await
                .expect("the genuine invitation");

            let (key, certificate) = match cause {
                // a manager, removed: their certificate revoked by the root, and their old
                // machine pushing late.
                "revoked" => {
                    let (key, certificate) =
                        delegated(&chain, "gone", MANAGER_ROLE.mask, MANAGER_ROLE.rank);

                    store
                        .write_certificate(&certificate)
                        .await
                        .expect("the certificate");
                    store
                        .write_revocation(
                            &revoke(
                                &chain.administrator_key,
                                &chain.certificate,
                                &certificate,
                                "1757100000000",
                            )
                            .expect("the revocation"),
                        )
                        .await
                        .expect("the revocation");

                    (key, certificate)
                }
                // a certificate nobody wrote into the organization.
                "unknown" => delegated(&chain, "nobody", MANAGER_ROLE.mask, MANAGER_ROLE.rank),
                // a member's own certificate, whose ceiling holds none of the four kinds' flags.
                _ => {
                    let (key, certificate) =
                        delegated(&chain, "plain", MEMBER_ROLE.mask, MEMBER_ROLE.rank);

                    store
                        .write_certificate(&certificate)
                        .await
                        .expect("the certificate");

                    (key, certificate)
                }
            };

            written_around_the_store(&store, &key, &certificate).await;

            let workspaces = store
                .workspaces(&pinned)
                .await
                .unwrap_or_else(|error| panic!("{cause}: the workspaces were refused: {error}"));

            assert_eq!(
                workspaces
                    .iter()
                    .map(|workspace| workspace.id.as_str())
                    .collect::<Vec<_>>(),
                vec!["north", "south"],
                "{cause}"
            );

            let grants = store
                .grants(&pinned)
                .await
                .unwrap_or_else(|error| panic!("{cause}: the grants were refused: {error}"));

            assert_eq!(
                grants
                    .iter()
                    .map(|grant| (grant.member_id.as_str(), grant.workspace_id.as_str()))
                    .collect::<Vec<_>>(),
                vec![("member-staff", "north"), ("member-staff", "south")],
                "{cause}"
            );

            let invitations = store
                .invitations(&pinned)
                .await
                .unwrap_or_else(|error| panic!("{cause}: the invitations were refused: {error}"));

            assert_eq!(
                invitations
                    .iter()
                    .map(|invitation| invitation.id.as_str())
                    .collect::<Vec<_>>(),
                vec!["invitation-genuine"],
                "{cause}"
            );
            assert_eq!(
                store
                    .mark(&pinned)
                    .await
                    .unwrap_or_else(|error| panic!("{cause}: the mark was refused: {error}")),
                None,
                "{cause}: a mark that does not verify was read"
            );
            assert_eq!(
                store
                    .members(&pinned)
                    .await
                    .unwrap_or_else(|error| panic!("{cause}: the members were refused: {error}"))
                    .len(),
                2,
                "{cause}"
            );
        }
    }

    /// Member rows keep refusing the read (ticket 20; ticket 25 leaves them as they were): one
    /// naming a certificate nobody issued refuses the member read by name.
    #[tokio::test]
    async fn a_member_row_under_a_certificate_nobody_issued_still_refuses_the_read() {
        let directory = scratch("member-unknown");
        let store = open(&directory).await;
        let chain = Chain::new();

        populated(&store, &chain).await;

        store
            .connection()
            .execute(
                "UPDATE \"member\" SET \"certificate_id\" = 'cert-nobody' \
                 WHERE \"id\" = 'member-staff'",
                (),
            )
            .await
            .expect("the hostile write");

        let refusal = store
            .members(&chain.verifying_key())
            .await
            .expect_err("a member row under an unknown certificate was read");

        assert!(
            refusal.to_string().contains("issued by nobody"),
            "{refusal}"
        );
        assert!(refusal.to_string().contains("member-staff"), "{refusal}");
    }

    /// A reader verifies against the key its link pinned, so a database rewritten under another
    /// organization key, `organization.verifying_key` included, verifies for nobody who joined
    /// through a real link.
    #[tokio::test]
    async fn a_database_signed_under_another_key_verifies_for_nobody_holding_the_real_one() {
        let directory = scratch("otherkey");
        let store = open(&directory).await;
        let chain = Chain::new();
        let impostor = Chain::new();

        populated(&store, &impostor).await;

        let refusal = store
            .members(&chain.verifying_key())
            .await
            .expect_err("rows signed under another organization key were read");

        // the role rows are read first, because a member row is judged by its role's rank.
        assert!(
            refusal.to_string().contains("the role row manager"),
            "{refusal}"
        );
    }

    /// **The re-signing routine, and what it buys: a certificate that signed rows can be retired
    /// without bricking them.** A manager's certificate signs one of every kind of row.
    /// While it stands every read verifies; revoked, every read that finds one of its rows is
    /// refused (F3). Re-signed under the owner first, the same revocation refuses nothing, and a
    /// fresh row still signed under the retired certificate is refused, which is what a removed
    /// manager's forgery is.
    #[tokio::test]
    async fn re_signing_a_certificates_rows_lets_it_be_retired_without_bricking_them() {
        use super::InvitationRecord;

        let directory = scratch("resign");
        let store = open(&directory).await;
        let chain = Chain::new();

        store
            .write_organization(&OrganizationRecord {
                id: "acme".to_string(),
                name_sealed: chain.sealed("organization.name_sealed", "Acme"),
                verifying_key: chain.verifying_key(),
                remote_url: "libsql://org-acme.turso.io".to_string(),
                created_at: 1_757_000_000_000,
            })
            .await
            .expect("the organization row");
        store
            .write_certificate(&chain.certificate)
            .await
            .expect("the owner certificate");
        chain.write_roles(&store).await;
        store
            .write_member(
                &chain.signer(),
                &chain.member("member-owner", "olivia", "owner"),
            )
            .await
            .expect("the owner member");

        // a manager certified by the owner's root, who signs one of every kind of row: a member,
        // a workspace, a grant and an invitation.
        let admin_key = AdministratorKey::generate().expect("an administrator key");
        let admin_certificate = issue_certificate(
            &chain.administrator_key,
            &chain.certificate,
            Issue {
                id: "cert-admin",
                member_id: "member-admin",
                signing_public_key: &admin_key.verifying_key(),
                ceiling: MANAGER_ROLE.mask,
                rank: MANAGER_ROLE.rank,
                issued_at: "1757000000000",
            },
        )
        .expect("the manager's certificate");
        let revocation = revoke(
            &chain.administrator_key,
            &chain.certificate,
            &admin_certificate,
            "1757100000000",
        )
        .expect("the revocation");

        store
            .write_certificate(&admin_certificate)
            .await
            .expect("the manager's certificate");

        let admin_signer = Signer {
            key: &admin_key,
            certificate: &admin_certificate,
        };

        store
            .write_member(
                &admin_signer,
                &chain.member("member-x", "member-x", "member"),
            )
            .await
            .expect("member-x");
        store
            .write_workspace(&admin_signer, &chain.workspace("w", "W"))
            .await
            .expect("the workspace");
        store
            .write_grant(
                &admin_signer,
                &GrantRecord {
                    member_id: "member-x".to_string(),
                    workspace_id: "w".to_string(),
                    sealed_credential: b"a sealed credential".to_vec(),
                    access_level: "full-access".to_string(),
                    credential_expires_at: None,
                },
            )
            .await
            .expect("the grant");

        store
            .write_invitation(
                &admin_signer,
                &InvitationRecord {
                    id: "inv-1".to_string(),
                    member_id: "member-x".to_string(),
                    expires_at: 1_757_600_000_000,
                    consumed_at: None,
                    sealed_secret: b"a secret sealed to the issuer".to_vec(),
                    issued_by: "member-admin".to_string(),
                    created_at: 1_757_000_000_000,
                },
            )
            .await
            .expect("the invitation");

        let key = chain.verifying_key();

        // everything verifies while the certificate stands.
        assert_eq!(store.members(&key).await.expect("members").len(), 2);
        assert_eq!(store.workspaces(&key).await.expect("workspaces").len(), 1);
        assert_eq!(store.grants(&key).await.expect("grants").len(), 1);
        assert_eq!(store.invitations(&key).await.expect("invitations").len(), 1);

        // F3: revoked without re-signing first, every read that finds one of its rows is refused.
        store
            .write_revocation(&revocation)
            .await
            .expect("the revocation");

        let refusal = store
            .members(&key)
            .await
            .expect_err("a row under a revoked certificate was read");

        assert!(refusal.to_string().contains("revoked"), "{refusal}");
        assert!(refusal.to_string().contains("member-x"), "{refusal}");

        // restore the certificate, re-sign its rows under the owner, then revoke: nothing bricks,
        // and one of every kind of row moved.
        store
            .connection()
            .execute("DELETE FROM \"revocation\"", ())
            .await
            .expect("un-revoke");

        let moved = store
            .re_sign_rows_of_certificate(&key, "cert-admin", &chain.signer())
            .await
            .expect("the re-sign");

        assert_eq!(moved, 4, "one of every kind of row was re-signed");

        store
            .write_revocation(&revocation)
            .await
            .expect("the revocation, again");

        assert_eq!(store.members(&key).await.expect("members after").len(), 2);
        assert_eq!(
            store
                .workspaces(&key)
                .await
                .expect("workspaces after")
                .len(),
            1
        );
        assert_eq!(store.grants(&key).await.expect("grants after").len(), 1);
        assert_eq!(
            store
                .invitations(&key)
                .await
                .expect("invitations after")
                .len(),
            1
        );

        // a fresh row still signed under the retired certificate is refused: re-signing moved the
        // old rows, it did not resurrect the certificate.
        store
            .write_member(
                &Signer {
                    key: &admin_key,
                    certificate: &admin_certificate,
                },
                &chain.member("member-y", "member-y", "member"),
            )
            .await
            .expect("the hostile write");

        let refusal = store
            .members(&key)
            .await
            .expect_err("a fresh row under the revoked certificate was read");

        assert!(refusal.to_string().contains("revoked"), "{refusal}");

        // and the routine refuses to re-sign a certificate's rows onto itself.
        assert!(
            store
                .re_sign_rows_of_certificate(&key, &chain.certificate.id, &chain.signer())
                .await
                .is_err(),
            "a certificate re-signed its own rows onto itself"
        );
    }

    /// A certificate the owner's root issues, and the key it names: a manager's, or narrower.
    fn delegated(
        chain: &Chain,
        id: &str,
        ceiling: i64,
        rank: i64,
    ) -> (AdministratorKey, Certificate) {
        let key = AdministratorKey::generate().expect("a key");
        let certificate = issue_certificate(
            &chain.administrator_key,
            &chain.certificate,
            Issue {
                id,
                member_id: &format!("member-{id}"),
                signing_public_key: &key.verifying_key(),
                ceiling,
                rank,
                issued_at: "1757000000000",
            },
        )
        .expect("the certificate");

        (key, certificate)
    }

    /// Effort 851, requirement 29: **the organization's name reads only as the owner signed it.**
    /// None is read before anybody signs; the root's reads back; a row written straight into the
    /// replica under the root's id with another name is left out and reads as none, as is one
    /// whose sealed name was swapped under the root's signature.
    #[tokio::test]
    async fn the_organizations_name_reads_only_as_the_owner_signed_it() {
        let directory = scratch("organization-name");
        let store = open(&directory).await;
        let chain = Chain::new();
        let key = chain.verifying_key();

        populated(&store, &chain).await;

        assert_eq!(store.organization_name(&key).await.expect("the read"), None);

        let signed = OrganizationNameRecord {
            name_sealed: chain.sealed("organization.name_sealed", "Acme Rentals"),
            updated_at: 1_757_000_000_000,
        };

        store
            .write_organization_name(&chain.signer(), &signed)
            .await
            .expect("the root's name");

        assert_eq!(
            store.organization_name(&key).await.expect("the read"),
            Some(signed.clone())
        );

        store
            .connection()
            .execute(
                "UPDATE \"organization_name\" SET \"name_sealed\" = ?",
                vec![turso::Value::Blob(
                    chain.sealed("organization.name_sealed", "Forged Rentals"),
                )],
            )
            .await
            .expect("a forged name");

        assert_eq!(
            store.organization_name(&key).await.expect("the read"),
            None,
            "a name nobody signed was read as the organization's"
        );
    }

    /// Effort 838, ticket 04: **the mark and the role rows move with everything else.** A manager
    /// sets the mark and makes a role; revoked without re-signing, the mark reads as none (ticket
    /// 25 leaves it out) and the roles refuse; re-signed under the owner first, the mark is still
    /// the organization's and the role still reads.
    #[tokio::test]
    async fn retiring_the_certificate_that_set_the_mark_and_made_a_role_leaves_both_readable() {
        let directory = scratch("resign-mark");
        let store = open(&directory).await;
        let chain = Chain::new();
        let key = chain.verifying_key();

        populated(&store, &chain).await;

        let (manager_key, manager) =
            delegated(&chain, "manager", MANAGER_ROLE.mask, MANAGER_ROLE.rank);
        let signer = Signer {
            key: &manager_key,
            certificate: &manager,
        };

        store
            .write_certificate(&manager)
            .await
            .expect("the manager");
        store
            .write_mark(
                &signer,
                &MarkRecord {
                    image_sealed: b"a sealed image".to_vec(),
                    media_type: "image/png".to_string(),
                    updated_by: "member-manager".to_string(),
                    updated_at: 1_757_000_000_000,
                },
            )
            .await
            .expect("the mark");
        store
            .write_role(
                &signer,
                &RoleRecord {
                    id: "role-leasing".to_string(),
                    kind: "custom".to_string(),
                    name_sealed: chain.sealed("role.name_sealed", "Leasing"),
                    mask: MEMBER_ROLE.mask,
                    rank: 500_000,
                },
            )
            .await
            .expect("the role");

        let revocation = revoke(
            &chain.administrator_key,
            &chain.certificate,
            &manager,
            "1757100000000",
        )
        .expect("the revocation");

        store
            .write_revocation(&revocation)
            .await
            .expect("the revocation");

        assert_eq!(
            store.mark(&key).await.expect("the mark refused the read"),
            None,
            "the mark read past a revoked signer"
        );
        assert!(
            store.roles(&key).await.is_err(),
            "a role read past a revoked signer"
        );

        store
            .connection()
            .execute("DELETE FROM \"revocation\"", ())
            .await
            .expect("un-revoke");

        let moved = store
            .re_sign_rows_of_certificate(&key, "manager", &chain.signer())
            .await
            .expect("the re-sign");

        assert_eq!(moved, 2, "the mark and the role were not both re-signed");

        store
            .write_revocation(&revocation)
            .await
            .expect("the revocation, again");

        assert_eq!(
            store
                .mark(&key)
                .await
                .expect("the mark after")
                .map(|mark| mark.image_sealed),
            Some(b"a sealed image".to_vec())
        );
        assert!(
            store
                .roles(&key)
                .await
                .expect("the roles after")
                .iter()
                .any(|role| role.id == "role-leasing")
        );
    }

    /// Effort 838, ticket 04: **a re-sign the signer could not make is refused by name, and moves
    /// nothing.** A certificate that signed a grant is to be retired by one that does not carry
    /// `grantWorkspace`; the refusal names it, and the grant is still the old certificate's.
    #[tokio::test]
    async fn a_re_sign_the_signer_could_not_make_is_refused_by_name_and_moves_nothing() {
        let directory = scratch("resign-refused");
        let store = open(&directory).await;
        let chain = Chain::new();
        let key = chain.verifying_key();

        populated(&store, &chain).await;

        let (granter_key, granter) = delegated(
            &chain,
            "granter",
            mask_of(&[Flag::GrantWorkspace, Flag::InviteMember]),
            1,
        );
        let (narrow_key, narrow) = delegated(
            &chain,
            "narrow",
            mask_of(&[Flag::AssignRole, Flag::RemoveMember]),
            10,
        );

        for certificate in [&granter, &narrow] {
            store
                .write_certificate(certificate)
                .await
                .expect("a certificate");
        }

        store
            .write_grant(
                &Signer {
                    key: &granter_key,
                    certificate: &granter,
                },
                &GrantRecord {
                    member_id: "member-staff".to_string(),
                    workspace_id: "north".to_string(),
                    sealed_credential: b"a sealed workspace credential".to_vec(),
                    access_level: "full-access".to_string(),
                    credential_expires_at: None,
                },
            )
            .await
            .expect("the grant");

        let before = store.signed_grants(&key).await.expect("the grants");
        let refusal = store
            .re_sign_rows_of_certificate(
                &key,
                "granter",
                &Signer {
                    key: &narrow_key,
                    certificate: &narrow,
                },
            )
            .await
            .expect_err("a signer without grantWorkspace re-signed a grant");

        assert!(refusal.to_string().contains("grantWorkspace"), "{refusal}");
        assert_eq!(
            store.signed_grants(&key).await.expect("the grants after"),
            before,
            "a refused re-sign moved something"
        );
    }

    /// Every row of every table, cell by cell, so a write refused part way is caught wherever it
    /// wrote.
    async fn every_row(store: &OrganizationStore) -> Vec<String> {
        let mut rows_out = Vec::new();

        for table in TABLES {
            let mut rows = store
                .connection()
                .query(&format!("SELECT * FROM \"{table}\" ORDER BY 1, 2"), ())
                .await
                .expect("the table");

            while let Some(row) = rows.next().await.expect("a row") {
                let cells: Vec<String> = (0..row.column_count())
                    .map(|index| format!("{:?}", row.get_value(index).expect("a cell")))
                    .collect();

                rows_out.push(format!("{table}: {}", cells.join(", ")));
            }
        }

        rows_out
    }

    /// The review of effort 838, round one: **the store refuses to write a row its signer's
    /// certificate does not cover, naming what it needs, and writes nothing.** One narrow
    /// certificate, holding `assignRole` and the member role's flags at a rank above the member,
    /// tries a row of every kind it may not sign: a grant, a role, a workspace, an invitation and
    /// the mark for want of their flags, a member row switching a flag it lacks, and its own
    /// member's row. Each is refused with `authority::needed_for`'s words and not a cell moves; a
    /// member row inside the certificate, about somebody else, is written.
    #[tokio::test]
    async fn a_row_its_signers_certificate_does_not_cover_is_refused_by_name_and_not_written() {
        let directory = scratch("uncovered-write");
        let store = open(&directory).await;
        let chain = Chain::new();

        populated(&store, &chain).await;

        let (narrow_key, narrow) = delegated(
            &chain,
            "narrow",
            MEMBER_ROLE.mask | mask_of(&[Flag::AssignRole]),
            10,
        );

        store
            .write_certificate(&narrow)
            .await
            .expect("a certificate");

        let signer = Signer {
            key: &narrow_key,
            certificate: &narrow,
        };
        let widened = MemberRecord {
            override_mask: mask_of(&[Flag::DeleteContract]),
            ..chain.member("member-new", "nadia.staff", "member")
        };
        let own = chain.member("member-narrow", "nick.staff", "member");
        let before = every_row(&store).await;
        let attempts: [(&str, Result<(), Error>); 8] = [
            (
                "grantWorkspace",
                store
                    .write_grant(
                        &signer,
                        &GrantRecord {
                            member_id: "member-staff".to_string(),
                            workspace_id: "north".to_string(),
                            sealed_credential: b"another credential".to_vec(),
                            access_level: "full-access".to_string(),
                            credential_expires_at: None,
                        },
                    )
                    .await,
            ),
            (
                "manageRoles, a rank above the role, and every flag the role carries",
                store
                    .write_role(
                        &signer,
                        &RoleRecord {
                            id: "role-clerk".to_string(),
                            kind: "custom".to_string(),
                            name_sealed: Vec::new(),
                            mask: MEMBER_ROLE.mask,
                            rank: 5,
                        },
                    )
                    .await,
            ),
            (
                "renameWorkspace or grantWorkspace",
                store
                    .write_workspace(&signer, &chain.workspace("east", "East Properties"))
                    .await,
            ),
            (
                "inviteMember or resetPassword",
                store
                    .write_invitation(
                        &signer,
                        &super::InvitationRecord {
                            id: "invitation-new".to_string(),
                            member_id: "member-staff".to_string(),
                            expires_at: 1_757_600_000_000,
                            consumed_at: None,
                            sealed_secret: Vec::new(),
                            issued_by: "member-narrow".to_string(),
                            created_at: 1_757_000_000_000,
                        },
                    )
                    .await,
            ),
            (
                "manageMark",
                store
                    .write_mark(
                        &signer,
                        &MarkRecord {
                            image_sealed: b"an image".to_vec(),
                            media_type: "image/png".to_string(),
                            updated_by: "member-narrow".to_string(),
                            updated_at: 1_757_000_000_000,
                        },
                    )
                    .await,
            ),
            (
                "the owner's certificate",
                store
                    .write_organization_name(
                        &signer,
                        &OrganizationNameRecord {
                            name_sealed: chain.sealed("organization.name_sealed", "Not Acme"),
                            updated_at: 1_757_000_000_000,
                        },
                    )
                    .await,
            ),
            (
                "every flag their override switches",
                store.write_member(&signer, &widened).await,
            ),
            (
                "not to be the member's own",
                store.write_member(&signer, &own).await,
            ),
        ];

        for (needed, outcome) in attempts {
            let refusal = outcome.expect_err(needed);

            assert!(
                matches!(
                    &refusal,
                    Error::Refused {
                        reason: RefusalReason::RoleLacksAct,
                        ..
                    }
                ),
                "{needed}: {refusal:?}"
            );
            assert!(refusal.to_string().contains(needed), "{needed}: {refusal}");
        }

        assert_eq!(every_row(&store).await, before, "a refused write wrote");

        // inside the certificate, about somebody else, the row is written and reads back.
        store
            .write_member(
                &signer,
                &chain.member("member-new", "nadia.staff", "member"),
            )
            .await
            .expect("a member row inside the certificate");
        assert!(
            store
                .members(&chain.verifying_key())
                .await
                .expect("the directory reads")
                .iter()
                .any(|member| member.id == "member-new")
        );
    }

    /// Effort 838, ticket 04: **what a re-issue writes lands whole or not at all.** A certificate
    /// and a revocation written inside a transaction that is rolled back are gone; committed, they
    /// stay.
    #[tokio::test]
    async fn a_transaction_rolled_back_leaves_nothing_it_wrote_and_one_committed_stays() {
        let directory = scratch("transaction");
        let store = open(&directory).await;
        let chain = Chain::new();

        populated(&store, &chain).await;

        let before = store.chain_rows().await.expect("the chain");
        let (_, manager) = delegated(&chain, "manager", MANAGER_ROLE.mask, MANAGER_ROLE.rank);
        let revocation = revoke(
            &chain.administrator_key,
            &chain.certificate,
            &manager,
            "1757100000000",
        )
        .expect("the revocation");

        store.begin().await.expect("begin");
        store
            .write_certificate(&manager)
            .await
            .expect("the certificate");
        store
            .write_revocation(&revocation)
            .await
            .expect("the revocation");
        store.rollback().await.expect("rollback");

        assert_eq!(store.chain_rows().await.expect("the chain"), before);

        store.begin().await.expect("begin");
        store
            .write_certificate(&manager)
            .await
            .expect("the certificate");
        store
            .write_revocation(&revocation)
            .await
            .expect("the revocation");
        store.commit().await.expect("commit");

        let (certificates, revocations) = store.chain_rows().await.expect("the chain");

        assert!(certificates.contains(&manager));
        assert_eq!(revocations, vec![revocation]);
    }

    /// Effort 838, ticket 04: **a member row whose signer does not outrank the role it names
    /// grants nothing.** A manager writes a row making somebody a manager, around every command.
    /// The directory still reads and the row grants nothing: a reader cannot tell it from a row a
    /// role's rank moved under on another machine, which is genuine, and a row whose only failure
    /// is its role's standing is read that way rather than refusing everybody the directory
    /// (review round two). Saved by the root, which covers it, it grants its role's mask.
    /// *Refused on read, and the directory with it, until then.*
    #[tokio::test]
    async fn a_member_row_signed_by_one_not_outranking_its_role_grants_nothing_until_saved() {
        let directory = scratch("outranked");
        let store = open(&directory).await;
        let chain = Chain::new();
        let key = chain.verifying_key();

        populated(&store, &chain).await;

        let (manager_key, manager) =
            delegated(&chain, "manager", MANAGER_ROLE.mask, MANAGER_ROLE.rank);

        store
            .write_certificate(&manager)
            .await
            .expect("the manager");

        let staff = store
            .member(&key, "member-staff")
            .await
            .expect("the row")
            .expect("member-staff");

        store
            .write_member_around_the_check(
                &Signer {
                    key: &manager_key,
                    certificate: &manager,
                },
                &MemberRecord {
                    role_id: MANAGER_ROLE.id.to_string(),
                    ..staff.clone()
                },
            )
            .await
            .expect("written around the store, which is not what refuses");

        let read = store
            .member(&key, "member-staff")
            .await
            .expect("the row reads")
            .expect("member-staff");

        assert_eq!(read.role_id, MANAGER_ROLE.id);
        assert_eq!(read.effective, 0, "a manager made somebody a manager");
        assert_eq!(store.members(&key).await.expect("the directory").len(), 2);

        store
            .write_member(&chain.signer(), &read)
            .await
            .expect("the root saves the row");

        assert_eq!(
            store
                .member(&key, "member-staff")
                .await
                .expect("the row reads")
                .expect("member-staff")
                .effective,
            MANAGER_ROLE.mask
        );
    }

    #[test]
    fn a_replica_is_named_for_its_organization_beside_the_workspaces() {
        let base = std::path::Path::new("C:/rentable/app.db");

        let path = OrganizationStore::replica_path(base, "acme");

        assert_eq!(path.parent(), base.parent());
        assert_eq!(
            path.file_name().and_then(|name| name.to_str()),
            Some("org-acme.db")
        );
        assert_ne!(path, crate::database::Database::replica_path(base, "acme"));
    }

    // effort 828, criterion 15: the registry of connected machines

    /// **A machine counts as connected for seven days after it was last seen, and the member
    /// beside it is the verified row** (effort 828, requirement 15).
    ///
    /// The window is what stops a machine that died without disconnecting standing in the owner's
    /// way for ever: a machine seen six days ago is still connected and one seen eight days ago
    /// is not, and neither row was written or read through a signer. The member half is the
    /// ordinary verified read, which is why the reader takes the organization's key and none of
    /// the writes takes anything.
    #[tokio::test]
    async fn a_machine_counts_as_connected_for_seven_days_and_carries_the_member_signed_in_on_it() {
        let directory = scratch("registry");
        let store = open(&directory).await;
        let chain = Chain::new();

        populated(&store, &chain).await;

        let now = 1_757_000_000_000_i64;
        let day = 24 * 60 * 60 * 1000;

        // registered with no member, as a connect registers one.
        store
            .register_machine("machine-fresh", None, now)
            .await
            .expect("the machine did not register");
        // seen six days ago with the owner on it, and eight days ago with the member: one is
        // inside the window and the other is not.
        store
            .machine_seen("machine-recent", Some("member-owner"), now - 6 * day)
            .await
            .expect("the recent machine");
        store
            .machine_seen("machine-lapsed", Some("member-staff"), now - 8 * day)
            .await
            .expect("the lapsed machine");

        let connected = store
            .connected_machines(&chain.verifying_key(), now)
            .await
            .expect("the connected machines");
        let ids: Vec<&str> = connected
            .iter()
            .map(|(machine, _)| machine.id.as_str())
            .collect();

        // oldest first, which is the order `created_at` gives.
        assert_eq!(
            ids,
            vec!["machine-recent", "machine-fresh"],
            "the seven-day window counted the wrong machines"
        );

        let (recent, its_member) = &connected[0];
        let (fresh, nobody) = &connected[1];

        assert_eq!(recent.seen_at, now - 6 * day);
        assert_eq!(
            its_member.as_ref().map(|member| member.role_id.as_str()),
            Some("owner"),
            "the member row beside a machine is not the one it names"
        );
        assert_eq!(fresh.member_id, None);
        assert!(nobody.is_none(), "a machine with no member carried one");

        // a refresh keeps `created_at`, so a machine that says it is here does not look new.
        store
            .machine_seen("machine-recent", None, now)
            .await
            .expect("the refresh");

        let connected = store
            .connected_machines(&chain.verifying_key(), now)
            .await
            .expect("the connected machines");
        let recent = connected
            .iter()
            .find(|(machine, _)| machine.id == "machine-recent")
            .expect("the refreshed machine");

        assert_eq!(recent.0.created_at, now - 6 * day);
        assert_eq!(recent.0.seen_at, now);
        assert_eq!(recent.0.member_id, None, "a sign-out kept the member");
        assert!(recent.1.is_none());

        // and a machine that left is gone at once rather than in a week.
        store
            .unregister_machine("machine-fresh")
            .await
            .expect("the machine did not leave");

        let connected = store
            .connected_machines(&chain.verifying_key(), now)
            .await
            .expect("the connected machines");

        assert_eq!(connected.len(), 1);
        assert_eq!(connected[0].0.id, "machine-recent");

        // no signature is written over any of it: the row is four plain columns.
        let mut columns = store
            .connection()
            .query("PRAGMA table_info(\"machine\")", ())
            .await
            .expect("the machine columns");
        let mut names = Vec::new();

        while let Some(row) = columns.next().await.expect("a column row") {
            names.push(super::text(&row, 1).expect("a column name"));
        }

        assert_eq!(
            names,
            vec!["id", "member_id", "seen_at", "created_at"],
            "the machine row carries a column the registry does not need"
        );
    }

    /// Ticket 20, the review's sixth finding: **a row dated in the future does not count as
    /// connected.**
    ///
    /// Every machine writes its own `seen_at` and nothing signs the row, so a date years out is a
    /// row anybody with the organization credential could write; with the window open above, one
    /// of them stood as connected for as long as that date said rather than for the week the
    /// window is. What that was worth then was the owner's way back in, which this read gated
    /// until 2026-09-20; what it is worth now is one line on a card, and the bound stays because a
    /// line nobody can correct is still wrong. A machine seen later than now has not been seen.
    #[tokio::test]
    async fn a_machine_seen_in_the_future_does_not_count_as_connected() {
        let directory = scratch("registry-future");
        let store = open(&directory).await;
        let chain = Chain::new();

        populated(&store, &chain).await;

        let now = 1_757_000_000_000_i64;
        let year = 365 * 24 * 60 * 60 * 1000_i64;

        store
            .machine_seen("machine-here", Some("member-owner"), now - 1)
            .await
            .expect("the machine that is here");
        store
            .machine_seen("machine-ahead", Some("member-staff"), now + year)
            .await
            .expect("the machine dated ahead");

        let ids: Vec<String> = store
            .connected_machines(&chain.verifying_key(), now)
            .await
            .expect("the connected machines")
            .into_iter()
            .map(|(machine, _)| machine.id)
            .collect();

        assert_eq!(
            ids,
            vec!["machine-here".to_string()],
            "a row dated in the future counted as a connected machine"
        );

        // and it is the date and not the row that is refused: the same machine seen now counts.
        store
            .machine_seen("machine-ahead", Some("member-staff"), now)
            .await
            .expect("the machine seen now");

        assert_eq!(
            store
                .connected_machines(&chain.verifying_key(), now)
                .await
                .expect("the connected machines")
                .len(),
            2
        );
    }

    // the plan's untested capability: two synced databases open at once

    /// **Two `turso::sync` engines are open at once and work is done on both.** The plan records
    /// this as an untested capability of `turso` 0.8.0-pre.7 that would first appear as a hang on
    /// turso's IO thread. Both engines here have no remote, which is the construction the
    /// application runs offline; the live test below does the same with two remotes.
    #[tokio::test]
    async fn the_organization_replica_and_a_workspace_replica_are_open_at_once() {
        let directory = scratch("two");
        let store = open(&directory).await;
        let chain = Chain::new();

        let workspace = crate::database::Database::open_replica(
            &crate::clock::System,
            &directory.join("ws-north.db"),
            None,
            || async { Ok::<String, turso::Error>(String::new()) },
        )
        .await
        .expect("the workspace replica");
        let ledger = workspace.connect().await.expect("the workspace connection");

        // interleaved work on both, so neither engine is idle while the other is used.
        ledger
            .execute(
                "CREATE TABLE complex (id TEXT PRIMARY KEY, name TEXT NOT NULL)",
                (),
            )
            .await
            .expect("the workspace schema");
        populated(&store, &chain).await;
        ledger
            .execute(
                "INSERT INTO complex (id, name) VALUES ('c1', 'North Tower')",
                (),
            )
            .await
            .expect("a workspace row");

        let members = store
            .members(&chain.verifying_key())
            .await
            .expect("the members");
        let mut rows = ledger
            .query("SELECT count(*) FROM complex", ())
            .await
            .expect("the count");
        let row = rows.next().await.expect("a row").expect("one row");

        assert_eq!(members.len(), 2);
        assert_eq!(super::integer(&row, 0).expect("a count"), 1);
        assert_eq!(
            store.tables().await.expect("the tables").len(),
            TABLES.len()
        );
    }

    /// Live, at the human's request: **machine A writes, machine B reads it back**, against a
    /// database this run provisions through `turso/platform/` and removes at the end.
    /// Admitted by name in [[rules/testing]] under *Tests that reach a live remote*, as the sixth
    /// property: whether the organization lives on the remote rather than on the machine that made
    /// it. `#[ignore]`, and it panics rather than skipping when its variables are absent, for the
    /// reason `turso/discovery/` gives.
    ///
    /// ```text
    /// RENTABLE_LIVE_TURSO=1 TURSO_CONSENT_TOKEN=… TURSO_ORG=… TURSO_GROUP=… \
    ///   cargo test --manifest-path ./apps/desktop/tauri/Cargo.toml \
    ///   organization_live -- --test-threads=1 --ignored --nocapture
    /// ```
    #[tokio::test]
    #[ignore = "reaches a live Turso account and creates a database; see the doc comment"]
    async fn organization_live_a_second_machine_reads_what_the_first_wrote() {
        use crate::turso::{
            consent::{Account, store_platform_token},
            discovery::TursoOrganization,
            platform::{DeletionIntent, PlatformApi, PlatformEndpoint, TursoPlatform},
        };

        let credentials = std::sync::Arc::new(Memory::new());

        let read = |name: &str| {
            std::env::var(name)
                .ok()
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| {
                    panic!("{name} is needed for a live run; see the doc comment above")
                })
        };

        assert_eq!(
            read("RENTABLE_LIVE_TURSO"),
            "1",
            "a live run is armed by RENTABLE_LIVE_TURSO=1 as well as by --ignored"
        );
        store_platform_token(credentials.as_ref(), &read("TURSO_CONSENT_TOKEN"))
            .expect("failed to file the token");

        let platform = PlatformApi::new(
            PlatformEndpoint::production(),
            TursoOrganization {
                slug: read("TURSO_ORG"),
                group: read("TURSO_GROUP"),
            },
            Account::Pending,
            credentials.clone(),
        );
        let nonce = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|elapsed| elapsed.as_nanos())
            .unwrap_or_default();
        let name = format!("t819-08-{nonce:x}");

        let database = platform
            .create_database(&name)
            .await
            .expect("the live create failed");
        let token = platform
            .mint_token(&name, "1h", crate::turso::platform::AccessLevel::FullAccess)
            .await
            .expect("the live mint failed");
        let remote_url = format!("libsql://{}", database.hostname);

        eprintln!("created {name} at {remote_url}");

        let chain = Chain::new();
        let machine_a = scratch("live-a");
        let machine_b = scratch("live-b");

        let token_for = |token: String| {
            move || {
                let token = token.clone();
                async move { Ok::<String, turso::Error>(token) }
            }
        };

        // machine A: schema, rows, push.
        let store_a = OrganizationStore::open(
            crate::clock::System::shared(),
            &machine_a.join("org-live.db"),
            Some(remote_url.clone()),
            token_for(token.clone()),
        )
        .await
        .expect("machine A's replica");

        store_a.install_schema().await.expect("the schema on A");
        populated(&store_a, &chain).await;

        assert!(store_a.push().await, "machine A could not push");

        // machine B: a fresh directory, a pull, and the rows verified against the pinned key.
        let store_b = OrganizationStore::open(
            crate::clock::System::shared(),
            &machine_b.join("org-live.db"),
            Some(remote_url.clone()),
            token_for(token.clone()),
        )
        .await
        .expect("machine B's replica");

        assert!(store_b.pull().await, "nothing arrived on machine B");

        let members = store_b
            .members(&chain.verifying_key())
            .await
            .expect("machine B could not read the members");
        let workspaces = store_b
            .workspaces(&chain.verifying_key())
            .await
            .expect("machine B could not read the workspaces");

        assert_eq!(
            members.len(),
            2,
            "machine B did not read what machine A wrote"
        );
        assert_eq!(workspaces.len(), 2);
        assert_eq!(
            open_content(
                &chain.content_key,
                "member.username_sealed",
                &members[1].username_sealed
            )
            .expect("the sealed username did not survive the round trip"),
            b"sami.staff"
        );

        eprintln!(
            "machine B read {} members and {} workspaces",
            members.len(),
            workspaces.len()
        );

        // both engines are open against real remotes at this point, and both worked.
        drop(store_a);
        drop(store_b);

        platform
            .delete_database(&name, DeletionIntent::CreatedAndUnreferenced)
            .await
            .expect("the live delete failed, and the database is left behind");

        eprintln!("removed {name}");
    }

    /// **The unverified member read has one caller, and this is what says so.**
    ///
    /// [`OrganizationStore::members_unverified`] exists for `setup::connect_existing`, where a
    /// machine meets the rows before it holds a key to judge them by, and its docstring says why
    /// that one path has to read first and verify afterwards. Every other reader of the member
    /// table asks the chain. A second caller would be somebody asking the database to vouch for
    /// itself, which is not something a reviewer can see by reading one file, so the source tree
    /// is read here instead.
    #[test]
    fn the_unverified_member_read_has_one_caller() {
        fn rust_files(directory: &std::path::Path, into: &mut Vec<PathBuf>) {
            for entry in std::fs::read_dir(directory).expect("the source directory") {
                let path = entry.expect("a source entry").path();

                if path.is_dir() {
                    rust_files(&path, into);
                } else if path.extension().is_some_and(|extension| extension == "rs") {
                    into.push(path);
                }
            }
        }

        let source = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("src");
        let mut files = Vec::new();

        rust_files(&source, &mut files);
        files.sort();

        let mut callers = Vec::new();

        for file in &files {
            // the module that defines it names it in its own docstrings and in this test.
            if file.starts_with(source.join("organization").join("store")) {
                continue;
            }

            let text = std::fs::read_to_string(file).expect("a source file");

            for _ in 0..text.matches("members_unverified(").count() {
                callers.push(
                    file.strip_prefix(&source)
                        .expect("a path under src")
                        .to_string_lossy()
                        .replace('\\', "/"),
                );
            }
        }

        assert_eq!(
            callers,
            vec!["organization/setup/connect.rs".to_string()],
            "the unverified member read is meant to have exactly one caller"
        );
    }

    // -------------------------------------------------------------------------------------
    // Effort 857, ticket 20, live: what an older build left unsent in the organization replica,
    // met after an upgrade removed what it names.
    // -------------------------------------------------------------------------------------

    /// One case on a throwaway database of its own, in the group `TURSO_GROUP` names: `case` runs
    /// against it, the database is deleted whatever the case did, and only then does a failure in
    /// the case fail the test, so a failed assertion never leaves a database behind. *The
    /// workspace's live tests keep the same shape in `database/mod.rs`.*
    async fn on_a_throwaway_organization<F, Fut>(label: &str, case: F)
    where
        F: FnOnce(std::sync::Arc<crate::database::test::workspace::LiveWorkspace>, PathBuf) -> Fut,
        Fut: std::future::Future<Output = ()> + Send + 'static,
    {
        use crate::database::test::workspace::LiveWorkspace;
        use std::sync::Arc;

        assert_eq!(
            std::env::var("RENTABLE_LIVE_TURSO")
                .unwrap_or_else(|_| panic!(
                    "RENTABLE_LIVE_TURSO is needed for a live run; see organization_unsent_live_*"
                ))
                .trim(),
            "1",
            "a live run is armed by RENTABLE_LIVE_TURSO=1 as well as by --ignored"
        );
        assert_eq!(
            std::env::var("TURSO_GROUP").unwrap_or_default().trim(),
            "rentable",
            "these runs are allowed in the group rentable alone"
        );

        let organization = Arc::new(LiveWorkspace::create(label).await);
        let directory = scratch(label);
        let ran = tokio::spawn(case(Arc::clone(&organization), directory.clone())).await;

        let _ = std::fs::remove_dir_all(&directory);

        match Arc::try_unwrap(organization) {
            Ok(organization) => organization.destroy().await,
            Err(_) => panic!("the case kept the database, so it could not be deleted"),
        }

        if let Err(failure) = ran {
            std::panic::resume_unwind(failure.into_panic());
        }
    }

    /// This machine's organization replica in `directory`, opened against `remote` as a launch
    /// opens it: the same file each time, so a second call is the build after an update.
    async fn live_replica(
        directory: &std::path::Path,
        remote: &crate::database::test::workspace::LiveWorkspace,
    ) -> OrganizationStore {
        let token = remote.token.clone();

        OrganizationStore::open(
            crate::clock::System::shared(),
            &directory.join("org-live.db"),
            Some(remote.url.clone()),
            move || {
                let token = token.clone();
                async move { Ok::<String, turso::Error>(token) }
            },
        )
        .await
        .expect("the organization replica")
    }

    /// Every row of `kept` on this machine's replica, each as its cells in order.
    async fn kept_here(store: &OrganizationStore) -> Vec<Vec<String>> {
        let mut rows = store
            .connection()
            .query("SELECT * FROM \"kept\" ORDER BY \"id\"", ())
            .await
            .expect("the local read");
        let mut read = Vec::new();

        while let Some(row) = rows.next().await.expect("a row") {
            read.push(
                (0..row.column_count())
                    .map(|index| format!("{:?}", row.get_value(index).expect("a cell")))
                    .collect(),
            );
        }

        read
    }

    /// The organization as an older build left it: the schema and a table of the test's own
    /// pushed, then a row of it captured on this machine and never sent. `upgrade` then reaches
    /// the remote over the pipeline, as an upgrade's step does, and the replica is opened again,
    /// which is the build after the update.
    async fn captured_before(
        remote: &crate::database::test::workspace::LiveWorkspace,
        directory: &std::path::Path,
        upgrade: &str,
    ) -> OrganizationStore {
        let older = live_replica(directory, remote).await;

        older.install_schema().await.expect("the schema");
        older
            .connection()
            .execute(
                "CREATE TABLE \"kept\" (\"id\" TEXT PRIMARY KEY, \"note\" TEXT)",
                (),
            )
            .await
            .expect("the table");
        assert!(older.push().await, "the older build's first push");
        older
            .connection()
            .execute("INSERT INTO \"kept\" VALUES ('k1', 'held')", ())
            .await
            .expect("the older build's write");
        drop(older);

        remote.over_the_wire(&[upgrade]).await;

        live_replica(directory, remote).await
    }

    /// **Ticket 20's live criterion.** An organization change an older build held when an upgrade
    /// dropped the column it names is classified at the updated build's first push, or at its
    /// first pull, which is what a sign-in or a resume makes first; it is held from every push
    /// and pull after, across a reopen, never reaches the remote, and stays on this machine. Once
    /// discarded, the next open is the remote's copy and this machine writes and sends again.
    ///
    /// ```text
    /// RENTABLE_LIVE_TURSO=1 TURSO_API_TOKEN=... TURSO_ORG=... TURSO_GROUP=rentable \
    ///   cargo test --manifest-path ./apps/desktop/tauri/Cargo.toml organization_unsent_live -- \
    ///   --test-threads=1 --ignored --nocapture
    /// ```
    #[ignore = "reaches a live Turso account and creates a database; see the doc comment"]
    #[tokio::test]
    async fn organization_unsent_live_changes_are_held_and_discarded_only_when_asked() {
        for (label, pull_first) in [("o857-pushed", false), ("o857-pulled", true)] {
            on_a_throwaway_organization(label, move |remote, directory| async move {
                let held_row = vec!["Text(\"k1\")".to_string(), "Text(\"held\")".to_string()];
                let store = captured_before(
                    &remote,
                    &directory,
                    "ALTER TABLE \"kept\" DROP COLUMN \"note\"",
                )
                .await;
                let path = store.path().to_path_buf();
                let remote_before = remote.over_the_wire(&["SELECT * FROM \"kept\""]).await;

                let refusal = if pull_first {
                    store.pulled().await.map(|_| ()).expect_err("the pull went")
                } else {
                    store.pushed().await.expect_err("the push went")
                };

                eprintln!("{label}: the first refusal: {refusal}");

                assert!(
                    crate::database::unsendable::names_what_the_upgrade_removed(
                        &refusal.to_string()
                    ),
                    "{label}: {refusal}"
                );
                assert!(store.holds_unsendable(), "{label}: nothing records it");
                assert!(matches!(
                    store.unsendable(),
                    Some(Error::Refused {
                        reason: RefusalReason::ChangesUnsendableAfterUpgrade,
                        ..
                    })
                ));

                // held: every way the replica could reach the remote again declines.
                assert!(!store.push().await);
                assert!(!store.pull().await);
                eprintln!(
                    "{label}: a read of the held replica in the same session: {:?}",
                    store.tables().await.map(|tables| tables.len())
                );
                drop(store);

                let store = live_replica(&directory, &remote).await;

                assert!(store.holds_unsendable(), "{label}: a reopen forgot");
                assert!(!store.push().await);
                assert!(!store.pull().await);
                assert!(
                    kept_here(&store).await.contains(&held_row),
                    "{label}: the held row is gone from this machine"
                );
                assert_eq!(
                    remote.over_the_wire(&["SELECT * FROM \"kept\""]).await,
                    remote_before,
                    "{label}: the remote changed"
                );

                // asked: discarded at the person's word, and the next open is the remote's copy.
                drop(store);
                OrganizationStore::discard_unsendable(&path).expect("the held changes discarded");
                assert!(
                    matches!(
                        OrganizationStore::discard_unsendable(&path),
                        Err(Error::Refused {
                            reason: RefusalReason::NothingUnsent,
                            ..
                        })
                    ),
                    "{label}: a second discard went ahead with nothing held"
                );

                let store = live_replica(&directory, &remote).await;

                assert!(!store.holds_unsendable());
                assert!(store.pulled().await.is_ok(), "{label}: the fresh pull");
                assert!(
                    !kept_here(&store).await.contains(&held_row),
                    "{label}: the discarded row is still here"
                );

                store
                    .connection()
                    .execute("INSERT INTO \"kept\" (\"id\") VALUES ('k2')", ())
                    .await
                    .expect("a write after the discard");

                assert!(store.push().await, "{label}: the push after the discard");
                assert_eq!(
                    remote
                        .over_the_wire(&["SELECT * FROM \"kept\""])
                        .await
                        .len(),
                    1,
                    "{label}: the write after the discard did not arrive"
                );

                drop(store);
            })
            .await;
        }
    }
}
