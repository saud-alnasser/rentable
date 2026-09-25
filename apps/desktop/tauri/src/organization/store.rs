//! the organization database: its schema, and the queries over it.
//!
//! **A replica like any workspace.** The organization's records live in one database on the
//! customer's Turso account, and each member's machine holds a `turso::sync` replica of it, opened
//! beside the workspace engine rather than inside it. `database/mod.rs` says why there is no third
//! `Engine` arm: `Engine` answers what the workspace is open as, and an organization is not a
//! workspace. Two engines over two files is what that module permits; two over one file is what it
//! forbids, and the organization replica is `org-<id>.db` beside `ws-<id>.db`, never the same file.
//!
//! **What the retired control plane's four tables knew lives here, sealed and signed, and one of
//! the four has no successor.** `account` and `membership` become `member` and `grant`; `workspace` keeps
//! its name and loses the `.unique()` owner that held every account to one workspace; `session`
//! is gone, because requirement 18 removes the window it existed for, and a faithful port would
//! re-add it. Every name and address is a `_sealed` column under the organization content key,
//! so a member holding only the database, or only what a join link carries, reads none of them.
//! Every authority field is under a signature `organization/authority.rs` checks, so a member who
//! can write every row, which Turso's whole-database credential makes every member, still cannot
//! forge one.
//!
//! **This module signs on the way in and verifies on the way out, and there is no read that
//! skips the check.** A row that fails verification refuses the read that found it, naming the row
//! and the check, rather than being dropped and the rest used: a forged row in the directory is an
//! event, and a reader that quietly skipped it would show a directory that looked whole. What to
//! show a person is the sign-in ticket's; that the store refuses is this one's.
//!
//! **What this module does not know.** Passwords, and whether one opens anything: the vault's.
//! Who may sign in: ticket 10's. What to seal a name under: the caller holds the content key and
//! hands this module ciphertext. The store is the shape of the rows and the signatures over them,
//! and nothing else.

use std::path::{Path, PathBuf};

use crate::{
    database::Database,
    error::{Error, RefusalReason},
};

use super::{
    authority::{
        Authority, Certificate, GrantAuthority, InvitationAuthority, MarkAuthority,
        MemberAuthority, VERIFYING_KEY_BYTES, WorkspaceAuthority, sign, verify,
    },
    vault::{KDF_SALT_BYTES, KdfParams, PUBLIC_KEY_BYTES, Vault},
};

/// The twelve tables, in the order the schema creates them. A test pins this list against what
/// the database reports, so a table added anywhere is added here or fails there.
pub const TABLES: [&str; 12] = [
    "format",
    "organization",
    "member",
    "administrator_certificate",
    "workspace",
    "grant",
    "invitation",
    "migration_lease",
    "machine_link",
    "machine",
    "succession",
    "mark",
];

/// How long a machine counts as connected after it was last seen: seven days (effort 828,
/// requirement 15).
///
/// A machine that died without disconnecting leaves its row behind, so the window is what stops
/// it saying for ever that somebody is signed in on it: the standing line on a member's card
/// (requirement 19) reads this register and nothing else does. Every machine that is running
/// refreshes its row at every launch, so a week is far longer than an ordinary gap and short
/// enough that a dead machine's line is wrong for a week rather than for ever. *The window kept
/// the Turso way in open until 2026-09-20; that gate is gone (requirement 14 as corrected).*
pub const MACHINE_PRESENCE_WINDOW: i64 = 7 * 24 * 60 * 60 * 1000;

/// The organization format this build reads and writes (effort 838, requirement 11).
///
/// **A break, not a migration.** An organization this build creates carries this number in its
/// one `format` row, and one with no row, or with a number other than this, is read no further
/// and written to not at all: [`OrganizationStore::refuse_another_format`] says which, and the
/// person is told what to do. Every organization made before effort 838 has no `format` table,
/// which is what version 1 was, so nothing is ever written with it. That absence is how an older
/// organization is told apart, and it is why [`OrganizationStore::complete_schema`] never
/// creates the table in one.
///
/// **Unsigned.** Rewriting the number achieves nothing the credential does not already allow: a
/// holder who changes it makes the organization refuse to open, as deleting its rows would.
pub const FORMAT_VERSION: i64 = 2;

/// The schema, as the plan's data model gives it.
///
/// **No foreign keys and no `UNIQUE` on an owner.** The first for the reason the workspace schema
/// gives: this database is replicated to machines that write to it offline, so a constraint met on
/// one replica can be violated by the merge. The second is requirement 1: an organization holds
/// several workspaces, and nothing constrains an account to one.
///
/// `grant` is quoted everywhere because it is a keyword in most dialects, and a statement that
/// works in SQLite and fails elsewhere is a statement worth spelling defensively once.
const SCHEMA: [&str; 12] = [
    // one row, the organization format (see [`FORMAT_VERSION`]).
    "CREATE TABLE IF NOT EXISTS \"format\" (\
        \"id\" TEXT PRIMARY KEY NOT NULL, \
        \"version\" INTEGER NOT NULL)",
    "CREATE TABLE IF NOT EXISTS \"organization\" (\
        \"id\" TEXT PRIMARY KEY NOT NULL, \
        \"name_sealed\" BLOB NOT NULL, \
        \"verifying_key\" BLOB NOT NULL, \
        \"remote_url\" TEXT NOT NULL, \
        \"created_at\" INTEGER NOT NULL)",
    "CREATE TABLE IF NOT EXISTS \"member\" (\
        \"id\" TEXT PRIMARY KEY NOT NULL, \
        \"username_sealed\" BLOB NOT NULL, \
        \"public_key\" BLOB NOT NULL, \
        \"signing_public_key\" BLOB NOT NULL, \
        \"sealed_secret_key\" BLOB NOT NULL, \
        \"sealed_content_key\" BLOB NOT NULL, \
        \"kdf_salt\" BLOB NOT NULL, \
        \"kdf_params\" TEXT NOT NULL, \
        \"role\" TEXT NOT NULL, \
        \"permissions\" INTEGER NOT NULL, \
        \"must_change_password\" INTEGER NOT NULL, \
        \"certificate_id\" TEXT NOT NULL, \
        \"signature\" BLOB NOT NULL, \
        \"created_at\" INTEGER NOT NULL, \
        \"updated_at\" INTEGER NOT NULL, \
        \"session_epoch\" INTEGER NOT NULL DEFAULT 0, \
        \"owner_seed_sealed\" BLOB)",
    "CREATE TABLE IF NOT EXISTS \"administrator_certificate\" (\
        \"id\" TEXT PRIMARY KEY NOT NULL, \
        \"member_id\" TEXT NOT NULL, \
        \"signing_public_key\" BLOB NOT NULL, \
        \"signature_by_organization_key\" BLOB NOT NULL, \
        \"issued_at\" TEXT NOT NULL, \
        \"revoked_at\" TEXT)",
    "CREATE TABLE IF NOT EXISTS \"workspace\" (\
        \"id\" TEXT PRIMARY KEY NOT NULL, \
        \"name_sealed\" BLOB NOT NULL, \
        \"database_name\" TEXT NOT NULL, \
        \"database_hostname\" TEXT NOT NULL, \
        \"schema_version\" INTEGER NOT NULL, \
        \"certificate_id\" TEXT NOT NULL, \
        \"signature\" BLOB NOT NULL, \
        \"created_at\" INTEGER NOT NULL, \
        \"updated_at\" INTEGER NOT NULL)",
    "CREATE TABLE IF NOT EXISTS \"grant\" (\
        \"member_id\" TEXT NOT NULL, \
        \"workspace_id\" TEXT NOT NULL, \
        \"sealed_credential\" BLOB NOT NULL, \
        \"access_level\" TEXT NOT NULL, \
        \"credential_expires_at\" TEXT, \
        \"certificate_id\" TEXT NOT NULL, \
        \"signature\" BLOB NOT NULL, \
        PRIMARY KEY (\"member_id\", \"workspace_id\"))",
    "CREATE TABLE IF NOT EXISTS \"invitation\" (\
        \"id\" TEXT PRIMARY KEY NOT NULL, \
        \"member_id\" TEXT NOT NULL, \
        \"expires_at\" INTEGER NOT NULL, \
        \"consumed_at\" INTEGER, \
        \"sealed_secret\" BLOB NOT NULL, \
        \"issued_by\" TEXT NOT NULL, \
        \"certificate_id\" TEXT NOT NULL, \
        \"signature\" BLOB NOT NULL, \
        \"created_at\" INTEGER NOT NULL)",
    "CREATE TABLE IF NOT EXISTS \"migration_lease\" (\
        \"workspace_id\" TEXT PRIMARY KEY NOT NULL, \
        \"holder_member_id\" TEXT NOT NULL, \
        \"expires_at\" INTEGER NOT NULL)",
    "CREATE TABLE IF NOT EXISTS \"machine_link\" (\
        \"id\" TEXT PRIMARY KEY NOT NULL, \
        \"member_id\" TEXT NOT NULL, \
        \"expires_at\" INTEGER NOT NULL, \
        \"consumed_at\" INTEGER, \
        \"created_at\" INTEGER NOT NULL)",
    "CREATE TABLE IF NOT EXISTS \"machine\" (\
        \"id\" TEXT PRIMARY KEY NOT NULL, \
        \"member_id\" TEXT, \
        \"seen_at\" INTEGER NOT NULL, \
        \"created_at\" INTEGER NOT NULL)",
    "CREATE TABLE IF NOT EXISTS \"succession\" (\
        \"id\" TEXT PRIMARY KEY NOT NULL, \
        \"offered_member_id\" TEXT NOT NULL, \
        \"offered_by\" TEXT NOT NULL, \
        \"offered_at\" INTEGER NOT NULL, \
        \"old_verifying_key\" BLOB NOT NULL, \
        \"new_verifying_key\" BLOB, \
        \"accepted_at\" INTEGER, \
        \"signature\" BLOB NOT NULL)",
    // the one image an organization prints on its pages, a signature or a seal (effort 835,
    // requirement 13). Sealed under the content key like a name, and signed by the owner or the
    // administrator who set it, so an image any member could write straight into the database is
    // never printed as the organization's. *A build during the effort kept it unsigned in
    // `organization_mark`; a replica that ran that build keeps that table, empty or not, and
    // nothing reads it.*
    "CREATE TABLE IF NOT EXISTS \"mark\" (\
        \"id\" TEXT PRIMARY KEY NOT NULL, \
        \"image_sealed\" BLOB NOT NULL, \
        \"media_type\" TEXT NOT NULL, \
        \"updated_by\" TEXT NOT NULL, \
        \"updated_at\" INTEGER NOT NULL, \
        \"certificate_id\" TEXT NOT NULL, \
        \"signature\" BLOB NOT NULL)",
];

/// The key of the one `mark` row: an organization keeps one mark.
const MARK_ID: &str = "mark";

/// The key of the one `format` row.
const FORMAT_ID: &str = "format";

/// The organization's mark as it is stored: the image sealed, what kind of image it is, and who
/// set it when.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MarkRecord {
    pub image_sealed: Vec<u8>,
    pub media_type: String,
    pub updated_by: String,
    pub updated_at: i64,
}

/// The one `organization` row.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct OrganizationRecord {
    pub id: String,
    /// the name, sealed under the content key by the caller.
    pub name_sealed: Vec<u8>,
    /// the organization's Ed25519 verifying key, **stored here for a second machine to compare
    /// against and never to verify with.** A reader verifies against the key its join link pinned;
    /// this column is what lets it notice the two disagree.
    ///
    /// *Rewritten when the organization is handed over* (effort 828, requirement 22): the key is
    /// the current owner's derivation, so it moves with the ownership. A machine that disagrees
    /// with this column does not believe it; it reads the `succession` table and checks the change
    /// against the key it pinned.
    pub verifying_key: [u8; VERIFYING_KEY_BYTES],
    pub remote_url: String,
    pub created_at: i64,
}

/// A `member` row as a caller writes and reads it. The certificate and the signature are the
/// store's: put on by [`OrganizationStore::write_member`] and checked by
/// [`OrganizationStore::members`], so a record in a caller's hands has already been verified.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MemberRecord {
    pub id: String,
    /// the username, sealed under the content key by the caller. The one thing that names a
    /// member: there is no address and no display name beside it (effort 824, requirement 21).
    pub username_sealed: Vec<u8>,
    /// the member's keypair as the vault shapes it: the public half, the sealed secret half, and
    /// the derivation that seal used.
    pub vault: Vault,
    /// the verifying half of the key this member signs rows with, which is
    /// `derive_seed(ADMINISTRATOR_KEY_PURPOSE)` over the secret their password unseals. **Written
    /// by whoever makes the vault**, the first run for the owner and `invite::issue` for everybody
    /// else, because that is the one moment the fresh secret is in hand; an accept and a password
    /// change keep the keypair, so the key stands. It is here so an owner widening somebody into
    /// an act that signs has a key to certify (effort 826, requirement 6), and it is under the
    /// member signature so that nobody can name a key of their own and wait to be certified.
    pub signing_public_key: [u8; VERIFYING_KEY_BYTES],
    /// the organization content key, sealed to this member's public key.
    pub sealed_content_key: Vec<u8>,
    /// `packages/workspace-permission`'s vocabulary. Nothing here interprets it.
    pub role: String,
    pub permissions: i64,
    pub must_change_password: bool,
    pub created_at: i64,
    pub updated_at: i64,
    /// which run of this member's sessions is the current one (effort 826, requirement 22).
    ///
    /// **Outside the member signature, as the vault columns are**, and for the same reason: it is
    /// the member's own to write, and so is every act that reseals their vault. A session carries
    /// the number it opened under and a remembered key files it beside itself, so a session or a
    /// key from before the last bump is behind the row and opens nothing.
    pub session_epoch: i64,
    /// the outgoing organization key's seed, sealed to this member's public key, on the row of an
    /// account that has been offered the organization and has not accepted yet (effort 828,
    /// requirement 22).
    ///
    /// **`None` everywhere else, including on both owners' rows once a handover is done.** The
    /// offer puts it on, the acceptance and the withdrawal take it off. Every owner's key is what
    /// their own vault derives, founder and transferee alike, and is stored nowhere: what this
    /// carries is the key the acceptance is replacing, so that the accepting machine can prove the
    /// offer came from the holder of the key it already pinned.
    ///
    /// *It was a transferee's standing anchor until 2026-09-16, when review round one found that
    /// a way back resting on this column rests on the database it is meant to judge.*
    ///
    /// **Inside the member preimage where it is present** (`authority::MemberAuthority`), so a
    /// row without it hashes exactly as it did before the column existed and nobody can put a
    /// seal on a row without the key that signs one.
    pub owner_seed_sealed: Option<Vec<u8>>,
}

/// A `workspace` row. Only the database identity is under signature; the name and the schema
/// version are not, as the plan says.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct WorkspaceRecord {
    pub id: String,
    pub name_sealed: Vec<u8>,
    pub database_name: String,
    pub database_hostname: String,
    pub schema_version: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

/// A `migration_lease` row: which member is upgrading a workspace, and the moment after which
/// nobody is, whatever became of them.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MigrationLeaseRecord {
    pub workspace_id: String,
    pub holder_member_id: String,
    pub expires_at: i64,
}

/// A `grant` row, the whole of which is under signature.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GrantRecord {
    pub member_id: String,
    pub workspace_id: String,
    /// the workspace credential, sealed to the member's public key by the caller.
    pub sealed_credential: Vec<u8>,
    pub access_level: String,
    pub credential_expires_at: Option<String>,
}

/// An `invitation` row: a pending account, whose member it is for and how long it stands. The
/// id, the member and the expiry are under signature; `consumed_at` is written by the machine
/// whose first sign-in spends it. *It carried a sealed payload, a salt and a cost until effort 824
/// dropped the invitation's sealed half: the row was found through the link's secret and the
/// generated password together, and it is found by the password alone now.*
///
/// **`sealed_secret` and `issued_by` sit outside the signature**, which the plan settled: a
/// tampered `sealed_secret` opens for nobody, the issuer included, and a tampered `issued_by`
/// names an issuer no reader asks after. Putting either under `InvitationAuthority` would move a
/// preimage nothing needs moved.
///
/// *It carried `code_seal` and `code_expires_at` between effort 826 and effort 828: the vault
/// password sealed under a ninety-second code. The seal rides in the link's own text now, because
/// the credential had to move there and nothing reads a row before the credential is out, and the
/// code lives as long as the link. Both columns are dropped; a replica still carrying them opens,
/// since `write_invitation` names its columns and both were nullable.*
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct InvitationRecord {
    pub id: String,
    pub member_id: String,
    /// when this invitation, and the link that carries it, lapse: a week out or the moment the
    /// issuer's own grant on the organization database dies, whichever is sooner.
    pub expires_at: i64,
    pub consumed_at: Option<i64>,
    /// the issuer's copy: the vault password this invitation was made with, the link's own secret
    /// and the code, sealed together to the issuer's public key.
    ///
    /// **It has no reader yet.** The act that opened it and handed the issuer the same link and
    /// the same code a second time went with effort 828, which found nothing calling it; the
    /// column is written on every invitation and read by nothing. It stays because dropping a
    /// column is not something a replica can be asked to do, and because the copy it holds is
    /// what any such act would need again.
    pub sealed_secret: Vec<u8>,
    /// the member id of whoever issued it, which is whose key `sealed_secret` opens for.
    pub issued_by: String,
    pub created_at: i64,
}

/// A `machine_link` row: a link made for an account whose password is set, and whether it has been
/// spent.
///
/// **It carries no signature, and that is the accepted limit rather than an oversight** (effort
/// 828, requirement 3). A plain member holds no administrator key and no certificate, so nothing
/// they write on their own account can be signed (effort 826, requirement 6), and this is the one
/// row a plain member writes for themselves. It is written under their own organization credential
/// the way `member.session_epoch` is ([`OrganizationStore::set_session_epoch`]), which is the
/// precedent: a column outside the chain that gates availability and never authority.
///
/// **What a rewritten row buys is one more machine at the wall.** Somebody who clears
/// `consumed_at`, or moves `expires_at` out, reopens a spent link on a second machine, and what
/// that machine reaches is the sign-in wall, where the member's username and password are still
/// the whole of what admits. The credential inside the link is the member's own four-week grant,
/// which their vault already yields, so nothing is reachable that the password did not already
/// reach. A test rewrites the row and lands the machine at the wall, so the limit is recorded
/// rather than discovered.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MachineLinkRecord {
    pub id: String,
    /// the member whose machine this link is for, and the only person who can make one.
    pub member_id: String,
    /// when the link and this row lapse: a week out or the moment the member's own grant on the
    /// organization database dies, whichever is sooner.
    pub expires_at: i64,
    /// when a machine spent it. One machine, once.
    pub consumed_at: Option<i64>,
    pub created_at: i64,
}

/// A `machine` row: one machine that holds this organization, whoever is signed in on it, and
/// when it last said so (effort 828, requirement 15).
///
/// **Unsigned, like [`MachineLinkRecord`] and for the same reason.** Every machine writes its own
/// row, a plain member holds no administrator key and no certificate, so nothing they write on
/// their own account can be signed (effort 826, requirement 6). It is written under the member's
/// own organization credential the way `member.session_epoch` is
/// ([`OrganizationStore::set_session_epoch`]).
///
/// **The registry gates nothing at all**, which is what the human settled on 2026-09-20. It shut
/// the owner's way in while an owner's or an administrator's machine was connected (requirement
/// 14) and it refused a link while a machine was signed in on the account (requirement 20); both
/// gates are gone, because an account is held on as many machines as its holder signs in on. What
/// is left is one line on a member's card saying where that account stands (requirement 19), read
/// at the moment somebody looks. So a rewritten row can only make that line wrong, which is also
/// what an unsigned row is worth: nothing here says what a member may do, and nothing reads it to
/// find out.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MachineRecord {
    /// the machine's own id, drawn once when it connected and kept in its local record
    /// (`HeldOrganization::machine_id`).
    pub id: String,
    /// who is signed in on it, where somebody is. `None` on a machine that connected and has not
    /// signed in yet, and on one somebody signed out of.
    pub member_id: Option<String>,
    /// when it last said it was here: a connect, a sign-in, a sign-out, or a launch.
    pub seen_at: i64,
    pub created_at: i64,
}

/// A `succession` row: an offer of the organization to one account, and the key change it became
/// (effort 828, requirement 22).
///
/// **The tenth table, and the only one signed by the organization key rather than under a
/// certificate** (`authority::SuccessionAuthority`). An offer carries the key in force when it
/// was made and nothing else; the acceptance writes the key that replaced it and re-signs the
/// row, still under the old key, because the reader this row exists for is a machine that holds
/// the old key and nothing newer.
///
/// **Nothing is deleted once a succession completes.** A machine that was offline across two
/// handovers walks the chain, which means every link of it has to still be there; the rows a
/// long-lived organization accumulates are one per handover. A standing offer is deleted, which
/// is what withdrawing one is.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SuccessionRecord {
    pub id: String,
    /// the account offered the organization, and the only one whose acceptance means anything.
    pub offered_member_id: String,
    /// the owner who offered it.
    pub offered_by: String,
    pub offered_at: i64,
    /// the organization key in force when the offer was made, which is the key that signed this
    /// row both times.
    pub old_verifying_key: [u8; VERIFYING_KEY_BYTES],
    /// what the new owner's vault derives; `None` while the offer stands.
    pub new_verifying_key: Option<[u8; VERIFYING_KEY_BYTES]>,
    pub accepted_at: Option<i64>,
    /// the organization key's signature, made by whoever wrote the row. The store puts none on:
    /// it holds no organization key and never will, which is why this is a field here and not a
    /// `Signer` argument.
    pub signature: Vec<u8>,
}

/// Who is writing: an administrator's key and the certificate that makes it an authority.
///
/// Taken together so that `authority::sign` can refuse a key the certificate does not name, once,
/// at the write, rather than every reader discovering it afterwards.
pub struct Signer<'a> {
    pub key: &'a super::authority::AdministratorKey,
    pub certificate: &'a Certificate,
}

/// The organization replica on this machine.
///
/// `Debug` says which file it is over and nothing about the rows, which is all a log line needs.
pub struct OrganizationStore {
    database: turso::sync::Database,
    connection: turso::Connection,
}

impl std::fmt::Debug for OrganizationStore {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("OrganizationStore")
    }
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
    /// about the engine, this one learns too.
    pub async fn open<F, Fut>(
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

        let database = Database::open_replica(path, remote_url, auth_token).await?;
        let connection = database.connect().await?;

        Ok(Self {
            database,
            connection,
        })
    }

    /// Create the ten tables where they do not exist.
    ///
    /// Issued through the sync connection, so on the machine that creates the organization the
    /// schema is captured as change data and reaches the remote with the first push; every other
    /// machine receives it as pages and the statements here find the tables already there.
    /// `CREATE TABLE` replicates this way where a drop-and-rename does not, which is the finding
    /// `database/test/workspace.rs` records and the reason this schema is never migrated by
    /// renaming.
    pub async fn install_schema(&self) -> Result<(), Error> {
        for statement in SCHEMA {
            self.connection.execute(statement, ()).await?;
        }

        Ok(())
    }

    /// Send what this machine wrote. A failure is an answer, as `Database::push_replica` says:
    /// what could not be sent stays captured and goes with the next push.
    pub async fn push(&self) -> bool {
        self.database.push().await.is_ok()
    }

    /// Bring what the remote has, and say whether anything arrived.
    pub async fn pull(&self) -> bool {
        matches!(self.pulled().await, Ok(true))
    }

    /// The same pull with the refusal kept, for the one caller that has to read it.
    ///
    /// **Every other caller wants the bool**, because a pull that did not go is the offline case
    /// and the replica goes on serving what it holds (819's requirement 18). `forget` is the
    /// exception: a remote answering that the database is not there any more is a fact about the
    /// organization rather than about this machine's connection, and it is the only way a machine
    /// learns the owner deleted it (effort 828, requirement 18).
    pub async fn pulled(&self) -> Result<bool, turso::Error> {
        let arrived = self.database.pull().await?;

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
    /// that nothing was created; the reader that follows is what refuses it. Above all it never
    /// creates `format` in an older organization, whose missing table is the only thing that
    /// tells it apart.
    pub async fn complete_schema(&self) -> Result<bool, turso::Error> {
        let format = self
            .format()
            .await
            .map_err(|error| turso::Error::Error(error.to_string()))?;

        if format != Some(FORMAT_VERSION) {
            return Ok(false);
        }

        let present = self
            .tables()
            .await
            .map_err(|error| turso::Error::Error(error.to_string()))?;
        let mut created = false;

        for (table, statement) in TABLES.iter().zip(SCHEMA.iter()) {
            if !present.iter().any(|name| name == table) {
                self.connection.execute(statement, ()).await?;
                created = true;
            }
        }

        Ok(created)
    }

    /// The tables this database holds, read from the database rather than from [`TABLES`], which
    /// is what lets a test compare the two.
    pub async fn tables(&self) -> Result<Vec<String>, Error> {
        let mut rows = self
            .connection
            .query(
                "SELECT name FROM sqlite_master WHERE type = 'table' \
                 AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'turso_%' \
                 AND name NOT LIKE '\\_\\_%' ESCAPE '\\' ORDER BY name",
                (),
            )
            .await?;
        let mut names = Vec::new();

        while let Some(row) = rows.next().await? {
            names.push(text(&row, 0)?);
        }

        Ok(names)
    }

    // the format

    /// Record that this organization is of this build's format: written once, by the first run,
    /// beside the schema that creates the table.
    pub async fn write_format(&self) -> Result<(), Error> {
        self.connection
            .execute(
                "INSERT OR REPLACE INTO \"format\" (\"id\", \"version\") VALUES (?, ?)",
                vec![
                    turso::Value::Text(FORMAT_ID.to_string()),
                    turso::Value::Integer(FORMAT_VERSION),
                ],
            )
            .await?;

        Ok(())
    }

    /// The organization's format version, or `None` where it has none: no `format` table, which
    /// is every organization made before effort 838, or a table with no row in it.
    ///
    /// Read against the tables the database reports before the row is asked for, so an older
    /// organization answers `None` rather than failing on a table it never had.
    pub async fn format(&self) -> Result<Option<i64>, Error> {
        if !self.tables().await?.iter().any(|table| table == "format") {
            return Ok(None);
        }

        let mut rows = self
            .connection
            .query(
                "SELECT \"version\" FROM \"format\" WHERE \"id\" = ? LIMIT 1",
                vec![turso::Value::Text(FORMAT_ID.to_string())],
            )
            .await?;

        match rows.next().await? {
            Some(row) => Ok(Some(integer(&row, 0)?)),
            None => Ok(None),
        }
    }

    /// Refuse an organization of another format, by name, before anything else is read from it
    /// or written to it (effort 838, requirement 11).
    ///
    /// **Two refusals, because the person does two different things.** An organization with no
    /// format, or an earlier one, was made by an earlier version of the application: its
    /// workspaces are exported there, it is deleted, and it is made again here, where each
    /// workspace is imported. There is no migration in place, by the human's call at the plan. One
    /// with a later format was made by a newer version, and this application is updated.
    ///
    /// Reads the format and nothing else, and writes nothing, so a refused organization is left
    /// exactly as it was found.
    pub async fn refuse_another_format(&self) -> Result<(), Error> {
        match self.format().await? {
            Some(FORMAT_VERSION) => Ok(()),
            Some(version) if version > FORMAT_VERSION => Err(Error::refused(
                RefusalReason::OrganizationNewer,
                format!(
                    "the organization is of format {version}, made by a newer version of \
                     rentable, and this version reads format {FORMAT_VERSION}"
                ),
            )),
            found => Err(Error::refused(
                RefusalReason::OrganizationOlder,
                format!(
                    "the organization carries {}, made by an earlier version of rentable, and \
                     this version reads format {FORMAT_VERSION}; export each workspace there, \
                     delete the organization, and make it again here",
                    found.map_or("no format".to_string(), |version| format!(
                        "format {version}"
                    ))
                ),
            )),
        }
    }

    // the organization row

    pub async fn write_organization(&self, organization: &OrganizationRecord) -> Result<(), Error> {
        self.connection
            .execute(
                "INSERT OR REPLACE INTO \"organization\" \
                 (\"id\", \"name_sealed\", \"verifying_key\", \"remote_url\", \"created_at\") \
                 VALUES (?, ?, ?, ?, ?)",
                vec![
                    turso::Value::Text(organization.id.clone()),
                    turso::Value::Blob(organization.name_sealed.clone()),
                    turso::Value::Blob(organization.verifying_key.to_vec()),
                    turso::Value::Text(organization.remote_url.clone()),
                    turso::Value::Integer(organization.created_at),
                ],
            )
            .await?;

        Ok(())
    }

    pub async fn organization(&self) -> Result<Option<OrganizationRecord>, Error> {
        let mut rows = self
            .connection
            .query(
                "SELECT \"id\", \"name_sealed\", \"verifying_key\", \"remote_url\", \"created_at\" \
                 FROM \"organization\" LIMIT 1",
                (),
            )
            .await?;

        let Some(row) = rows.next().await? else {
            return Ok(None);
        };

        Ok(Some(OrganizationRecord {
            id: text(&row, 0)?,
            name_sealed: blob(&row, 1)?,
            verifying_key: fixed::<VERIFYING_KEY_BYTES>(&row, 2, "verifying_key")?,
            remote_url: text(&row, 3)?,
            created_at: integer(&row, 4)?,
        }))
    }

    // the mark

    /// The organization's mark, verified, or nothing where none is set. A row whose signature does
    /// not verify against a certificate the organization issued is refused as an integrity error,
    /// which the caller treats as no mark: it is never printed.
    pub async fn mark(
        &self,
        organization_verifying_key: &[u8; VERIFYING_KEY_BYTES],
    ) -> Result<Option<MarkRecord>, Error> {
        let certificates = self.certificates().await?;
        let mut rows = self
            .connection
            .query(
                "SELECT \"image_sealed\", \"media_type\", \"updated_by\", \"updated_at\", \
                        \"certificate_id\", \"signature\" \
                 FROM \"mark\" WHERE \"id\" = ?",
                vec![turso::Value::Text(MARK_ID.to_string())],
            )
            .await?;

        let Some(row) = rows.next().await? else {
            return Ok(None);
        };

        let mark = MarkRecord {
            image_sealed: blob(&row, 0)?,
            media_type: text(&row, 1)?,
            updated_by: text(&row, 2)?,
            updated_at: integer(&row, 3)?,
        };

        verified(
            organization_verifying_key,
            &certificates,
            "mark",
            MARK_ID,
            &text(&row, 4)?,
            Authority::Mark(MarkAuthority {
                image_sealed: &mark.image_sealed,
                media_type: &mark.media_type,
                updated_by: &mark.updated_by,
                updated_at: mark.updated_at,
            }),
            &blob(&row, 5)?,
        )?;

        Ok(Some(mark))
    }

    /// Set the mark, signed by whoever set it, replacing whatever was there.
    pub async fn write_mark(&self, signer: &Signer<'_>, mark: &MarkRecord) -> Result<(), Error> {
        let signature = sign(
            signer.key,
            signer.certificate,
            Authority::Mark(MarkAuthority {
                image_sealed: &mark.image_sealed,
                media_type: &mark.media_type,
                updated_by: &mark.updated_by,
                updated_at: mark.updated_at,
            }),
        )?;

        self.connection
            .execute(
                "INSERT OR REPLACE INTO \"mark\" \
                 (\"id\", \"image_sealed\", \"media_type\", \"updated_by\", \"updated_at\", \
                  \"certificate_id\", \"signature\") \
                 VALUES (?, ?, ?, ?, ?, ?, ?)",
                vec![
                    turso::Value::Text(MARK_ID.to_string()),
                    turso::Value::Blob(mark.image_sealed.clone()),
                    turso::Value::Text(mark.media_type.clone()),
                    turso::Value::Text(mark.updated_by.clone()),
                    turso::Value::Integer(mark.updated_at),
                    turso::Value::Text(signer.certificate.id.clone()),
                    turso::Value::Blob(signature),
                ],
            )
            .await?;

        Ok(())
    }

    /// Remove the mark; a page printed after it has none.
    pub async fn clear_mark(&self) -> Result<(), Error> {
        self.connection
            .execute(
                "DELETE FROM \"mark\" WHERE \"id\" = ?",
                vec![turso::Value::Text(MARK_ID.to_string())],
            )
            .await?;

        Ok(())
    }

    // certificates

    /// Write a certificate as issued or as revoked. The signature it carries is the organization
    /// key's and was made when it was issued; this module checks it on every read of a row it
    /// authorises, and never makes one.
    pub async fn write_certificate(&self, certificate: &Certificate) -> Result<(), Error> {
        self.connection
            .execute(
                "INSERT OR REPLACE INTO \"administrator_certificate\" \
                 (\"id\", \"member_id\", \"signing_public_key\", \"signature_by_organization_key\", \
                  \"issued_at\", \"revoked_at\") \
                 VALUES (?, ?, ?, ?, ?, ?)",
                vec![
                    turso::Value::Text(certificate.id.clone()),
                    turso::Value::Text(certificate.member_id.clone()),
                    turso::Value::Blob(certificate.signing_public_key.to_vec()),
                    turso::Value::Blob(certificate.signature_by_organization_key.clone()),
                    turso::Value::Text(certificate.issued_at.clone()),
                    optional_text(certificate.revoked_at.as_deref()),
                ],
            )
            .await?;

        Ok(())
    }

    /// Every certificate, revoked ones included: a revoked certificate is still what a row names,
    /// and `verify` is what says the row is refused for it.
    pub async fn certificates(&self) -> Result<Vec<Certificate>, Error> {
        let mut rows = self
            .connection
            .query(
                "SELECT \"id\", \"member_id\", \"signing_public_key\", \
                        \"signature_by_organization_key\", \"issued_at\", \"revoked_at\" \
                 FROM \"administrator_certificate\" ORDER BY \"id\"",
                (),
            )
            .await?;
        let mut certificates = Vec::new();

        while let Some(row) = rows.next().await? {
            certificates.push(Certificate {
                id: text(&row, 0)?,
                member_id: text(&row, 1)?,
                signing_public_key: fixed::<VERIFYING_KEY_BYTES>(&row, 2, "signing_public_key")?,
                signature_by_organization_key: blob(&row, 3)?,
                issued_at: text(&row, 4)?,
                revoked_at: nullable_text(&row, 5)?,
            });
        }

        Ok(certificates)
    }

    // members

    /// Write a member row, signed by `signer` over the fields the plan puts under signature.
    ///
    /// **`session_epoch` never comes down here.** It is outside the preimage and inside a
    /// whole-row replace, and the three callers that rewrite a row from one they read
    /// (`invite::rename_member`, `role::change_role`, `removal::retire_member`) read it off this
    /// machine's replica. A replica that has not pulled since somebody else ended a member's
    /// sessions still carries the number from before, and writing that back would re-admit every
    /// machine the sign-out locked out. So the row keeps the greater of what it holds and what
    /// the record carries, which is the invariant `session.rs` rests the comparison on: the
    /// number only ever moves forward.
    pub async fn write_member(
        &self,
        signer: &Signer<'_>,
        member: &MemberRecord,
    ) -> Result<(), Error> {
        let session_epoch = self
            .session_epoch_of(&member.id)
            .await?
            .map_or(member.session_epoch, |held| held.max(member.session_epoch));
        let signature = sign(
            signer.key,
            signer.certificate,
            Authority::Member(MemberAuthority {
                public_key: &member.vault.public_key,
                signing_public_key: &member.signing_public_key,
                role: &member.role,
                permissions: member.permissions,
                owner_seed_sealed: member.owner_seed_sealed.as_deref(),
            }),
        )?;

        self.connection
            .execute(
                "INSERT OR REPLACE INTO \"member\" \
                 (\"id\", \"username_sealed\", \"public_key\", \"signing_public_key\", \
                  \"sealed_secret_key\", \"sealed_content_key\", \"kdf_salt\", \"kdf_params\", \
                  \"role\", \"permissions\", \"must_change_password\", \"certificate_id\", \
                  \"signature\", \"created_at\", \"updated_at\", \"session_epoch\", \
                  \"owner_seed_sealed\") \
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                vec![
                    turso::Value::Text(member.id.clone()),
                    turso::Value::Blob(member.username_sealed.clone()),
                    turso::Value::Blob(member.vault.public_key.to_vec()),
                    turso::Value::Blob(member.signing_public_key.to_vec()),
                    turso::Value::Blob(member.vault.sealed_secret_key.clone()),
                    turso::Value::Blob(member.sealed_content_key.clone()),
                    turso::Value::Blob(member.vault.kdf_salt.to_vec()),
                    turso::Value::Text(member.vault.kdf_params.encode()),
                    turso::Value::Text(member.role.clone()),
                    turso::Value::Integer(member.permissions),
                    turso::Value::Integer(i64::from(member.must_change_password)),
                    turso::Value::Text(signer.certificate.id.clone()),
                    turso::Value::Blob(signature),
                    turso::Value::Integer(member.created_at),
                    turso::Value::Integer(member.updated_at),
                    turso::Value::Integer(session_epoch),
                    match &member.owner_seed_sealed {
                        Some(sealed) => turso::Value::Blob(sealed.clone()),
                        None => turso::Value::Null,
                    },
                ],
            )
            .await?;

        Ok(())
    }

    /// The epoch the member's row carries on this replica, or `None` where there is no row.
    ///
    /// Read in Rust and compared there rather than folded into either write's SQL: the column is
    /// what a revocation turns on, and a scalar subquery or an upsert clause would put that
    /// comparison in the engine's hands instead of under a test.
    async fn session_epoch_of(&self, member_id: &str) -> Result<Option<i64>, Error> {
        let mut rows = self
            .connection
            .query(
                "SELECT \"session_epoch\" FROM \"member\" WHERE \"id\" = ?",
                vec![turso::Value::Text(member_id.to_string())],
            )
            .await?;

        match rows.next().await? {
            Some(row) => Ok(Some(integer(&row, 0)?)),
            None => Ok(None),
        }
    }

    /// Re-seal a member's vault under a new password, and say whether they still have to change
    /// it. The one write on a member row that carries no signature, and deliberately: the public
    /// key, the role and the permissions are what the chain signs, and none of them moves here.
    /// A member re-sealing their own vault writes nothing an authority has to vouch for, which is
    /// what makes a password change a write a member may perform on a database they hold full
    /// access to (ticket 07). A vault whose public key differs from the row's is refused, because
    /// that would be a new keypair, and a new keypair is a signed write.
    pub async fn reseal_member(
        &self,
        member_id: &str,
        vault: &Vault,
        must_change_password: bool,
        now: i64,
    ) -> Result<(), Error> {
        let mut rows = self
            .connection
            .query(
                "SELECT \"public_key\" FROM \"member\" WHERE \"id\" = ?",
                vec![turso::Value::Text(member_id.to_string())],
            )
            .await?;
        let row = rows.next().await?.ok_or_else(|| {
            Error::refused(
                RefusalReason::MemberMissing,
                "that member is not in this organization",
            )
        })?;

        if blob(&row, 0)? != vault.public_key {
            return Err(Error::Integrity {
                message: "a vault re-sealed under a password keeps its keypair; this one did not"
                    .to_string(),
            });
        }

        self.connection
            .execute(
                "UPDATE \"member\" SET \"sealed_secret_key\" = ?, \"kdf_salt\" = ?, \
                 \"kdf_params\" = ?, \"must_change_password\" = ?, \"updated_at\" = ? \
                 WHERE \"id\" = ?",
                vec![
                    turso::Value::Blob(vault.sealed_secret_key.clone()),
                    turso::Value::Blob(vault.kdf_salt.to_vec()),
                    turso::Value::Text(vault.kdf_params.encode()),
                    turso::Value::Integer(i64::from(must_change_password)),
                    turso::Value::Integer(now),
                    turso::Value::Text(member_id.to_string()),
                ],
            )
            .await?;

        Ok(())
    }

    /// Move a member's session epoch on, which ends every session opened under an earlier one
    /// (effort 826, requirement 22).
    ///
    /// The second write on a member row that carries no signature, and for the reason
    /// [`OrganizationStore::reseal_member`] gives: the column is outside the member preimage, so
    /// nothing an authority vouches for moves here. Who may call it is
    /// `session::end_elsewhere` and `session::end_member_sessions`, which is where the act and
    /// the owner's row are refused.
    ///
    /// **It moves the number on and never back**, for the reason
    /// [`OrganizationStore::write_member`] gives: the row keeps the greater of what it holds and
    /// what it is told, so a caller computing `+ 1` over a replica that has not pulled writes a
    /// number already reached rather than undoing the bump it did not see.
    pub async fn set_session_epoch(
        &self,
        member_id: &str,
        session_epoch: i64,
        now: i64,
    ) -> Result<(), Error> {
        let held = self.session_epoch_of(member_id).await?.ok_or_else(|| {
            Error::refused(
                RefusalReason::MemberMissing,
                "that member is not in this organization",
            )
        })?;

        self.connection
            .execute(
                "UPDATE \"member\" SET \"session_epoch\" = ?, \"updated_at\" = ? \
                 WHERE \"id\" = ?",
                vec![
                    turso::Value::Integer(held.max(session_epoch)),
                    turso::Value::Integer(now),
                    turso::Value::Text(member_id.to_string()),
                ],
            )
            .await?;

        Ok(())
    }

    /// Every member, each verified against the chain before it is returned.
    ///
    /// `organization_verifying_key` is the one the caller pinned from its join link, never the
    /// `organization` row's, for the reason `authority::verify` gives.
    pub async fn members(
        &self,
        organization_verifying_key: &[u8; VERIFYING_KEY_BYTES],
    ) -> Result<Vec<MemberRecord>, Error> {
        Ok(self
            .signed_members(organization_verifying_key)
            .await?
            .into_iter()
            .map(|(_, member)| member)
            .collect())
    }

    /// Every member, each verified, paired with the id of the certificate that signed it. The
    /// public [`OrganizationStore::members`] drops the id; [`OrganizationStore::re_sign_rows_of_certificate`]
    /// is what needs it, because a record alone does not say which certificate stands behind it.
    async fn signed_members(
        &self,
        organization_verifying_key: &[u8; VERIFYING_KEY_BYTES],
    ) -> Result<Vec<(String, MemberRecord)>, Error> {
        self.signed_members_where(Some(organization_verifying_key), None)
            .await
    }

    /// Every member, with no signature checked: the one read in this module that trusts nothing
    /// and verifies nothing.
    ///
    /// **It exists for one caller and has one**: `setup::connect_existing`, where a machine
    /// connecting to an organization the owner's Turso group already holds meets the rows before
    /// it holds any key to judge them by. The key that judges them is the one the owner's password
    /// re-derives, and the password cannot be tried against a vault that has not been read, so
    /// that one path has to read first and verify afterwards. Everything it does with what comes
    /// back is finding a vault the password opens; the key that vault yields is compared with the
    /// organization row's and every member row is then read again through
    /// [`OrganizationStore::members`], so nothing from here reaches a session.
    ///
    /// **A second caller is a defect**, and a test in this module reads the source tree and fails
    /// where one appears. Anything else asking the database who its members are and believing the
    /// answer is asking the database to vouch for itself, which is the one thing `authority.rs`
    /// refuses.
    pub async fn members_unverified(&self) -> Result<Vec<MemberRecord>, Error> {
        Ok(self
            .signed_members_where(None, None)
            .await?
            .into_iter()
            .map(|(_, member)| member)
            .collect())
    }

    /// One member's row, verified on its own, or `None` where no row carries that id.
    ///
    /// What an act's gate reads (`session::acting_row`): the acting member's own row and no
    /// other, so a row somebody else tampered with refuses the list and not every other
    /// member's acts. The list is what refuses it, by name, the next time anybody reads it.
    pub async fn member(
        &self,
        organization_verifying_key: &[u8; VERIFYING_KEY_BYTES],
        member_id: &str,
    ) -> Result<Option<MemberRecord>, Error> {
        Ok(self
            .signed_members_where(Some(organization_verifying_key), Some(member_id))
            .await?
            .into_iter()
            .map(|(_, member)| member)
            .next())
    }

    /// The member read behind [`OrganizationStore::signed_members`],
    /// [`OrganizationStore::member`] and [`OrganizationStore::members_unverified`]: every row, or
    /// the one row named.
    ///
    /// **`organization_verifying_key` is `None` for the unverified read and for nothing else.**
    /// Where it is `Some`, every row is checked against the chain before it is returned and a row
    /// that does not check refuses the whole read by name; where it is `None`, the certificates
    /// are not even fetched, because a caller that is not going to judge the rows has no use for
    /// the authorities behind them. [`OrganizationStore::members_unverified`] says which caller
    /// that is and why it is alone.
    async fn signed_members_where(
        &self,
        organization_verifying_key: Option<&[u8; VERIFYING_KEY_BYTES]>,
        member_id: Option<&str>,
    ) -> Result<Vec<(String, MemberRecord)>, Error> {
        let certificates = match organization_verifying_key {
            Some(_) => self.certificates().await?,
            None => Vec::new(),
        };
        let (filter, params) = match member_id {
            Some(id) => (
                " WHERE \"id\" = ?",
                vec![turso::Value::Text(id.to_string())],
            ),
            None => ("", Vec::new()),
        };
        let mut rows = self
            .connection
            .query(
                &format!(
                    "SELECT \"id\", \"username_sealed\", \"public_key\", \"signing_public_key\", \
                            \"sealed_secret_key\", \"sealed_content_key\", \"kdf_salt\", \"kdf_params\", \
                            \"role\", \"permissions\", \"must_change_password\", \"certificate_id\", \
                            \"signature\", \"created_at\", \"updated_at\", \"session_epoch\", \
                            \"owner_seed_sealed\" \
                     FROM \"member\"{filter} ORDER BY \"created_at\", \"id\""
                ),
                params,
            )
            .await?;
        let mut members = Vec::new();

        while let Some(row) = rows.next().await? {
            let id = text(&row, 0)?;
            let public_key = fixed::<PUBLIC_KEY_BYTES>(&row, 2, "public_key")?;
            let signing_public_key = fixed::<VERIFYING_KEY_BYTES>(&row, 3, "signing_public_key")?;
            let role = text(&row, 8)?;
            let permissions = integer(&row, 9)?;
            let certificate_id = text(&row, 11)?;
            let signature = blob(&row, 12)?;
            let owner_seed_sealed = nullable_blob(&row, 16)?;

            if let Some(organization_verifying_key) = organization_verifying_key {
                verified(
                    organization_verifying_key,
                    &certificates,
                    "member",
                    &id,
                    &certificate_id,
                    Authority::Member(MemberAuthority {
                        public_key: &public_key,
                        signing_public_key: &signing_public_key,
                        role: &role,
                        permissions,
                        owner_seed_sealed: owner_seed_sealed.as_deref(),
                    }),
                    &signature,
                )?;
            }

            members.push((
                certificate_id,
                MemberRecord {
                    id,
                    username_sealed: blob(&row, 1)?,
                    vault: Vault {
                        public_key,
                        sealed_secret_key: blob(&row, 4)?,
                        kdf_salt: fixed::<KDF_SALT_BYTES>(&row, 6, "kdf_salt")?,
                        kdf_params: KdfParams::parse(&text(&row, 7)?)?,
                    },
                    signing_public_key,
                    sealed_content_key: blob(&row, 5)?,
                    role,
                    permissions,
                    must_change_password: integer(&row, 10)? != 0,
                    created_at: integer(&row, 13)?,
                    updated_at: integer(&row, 14)?,
                    session_epoch: integer(&row, 15)?,
                    owner_seed_sealed,
                },
            ));
        }

        Ok(members)
    }

    // workspaces

    pub async fn write_workspace(
        &self,
        signer: &Signer<'_>,
        workspace: &WorkspaceRecord,
    ) -> Result<(), Error> {
        let signature = sign(
            signer.key,
            signer.certificate,
            Authority::Workspace(WorkspaceAuthority {
                database_name: &workspace.database_name,
                database_hostname: &workspace.database_hostname,
            }),
        )?;

        self.connection
            .execute(
                "INSERT OR REPLACE INTO \"workspace\" \
                 (\"id\", \"name_sealed\", \"database_name\", \"database_hostname\", \
                  \"schema_version\", \"certificate_id\", \"signature\", \"created_at\", \
                  \"updated_at\") \
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                vec![
                    turso::Value::Text(workspace.id.clone()),
                    turso::Value::Blob(workspace.name_sealed.clone()),
                    turso::Value::Text(workspace.database_name.clone()),
                    turso::Value::Text(workspace.database_hostname.clone()),
                    turso::Value::Integer(workspace.schema_version),
                    turso::Value::Text(signer.certificate.id.clone()),
                    turso::Value::Blob(signature),
                    turso::Value::Integer(workspace.created_at),
                    turso::Value::Integer(workspace.updated_at),
                ],
            )
            .await?;

        Ok(())
    }

    /// Every workspace, each verified before it is returned.
    pub async fn workspaces(
        &self,
        organization_verifying_key: &[u8; VERIFYING_KEY_BYTES],
    ) -> Result<Vec<WorkspaceRecord>, Error> {
        Ok(self
            .signed_workspaces(organization_verifying_key)
            .await?
            .into_iter()
            .map(|(_, workspace)| workspace)
            .collect())
    }

    /// Every workspace, each verified, paired with the id of the certificate that signed it.
    async fn signed_workspaces(
        &self,
        organization_verifying_key: &[u8; VERIFYING_KEY_BYTES],
    ) -> Result<Vec<(String, WorkspaceRecord)>, Error> {
        let certificates = self.certificates().await?;
        let mut rows = self
            .connection
            .query(
                "SELECT \"id\", \"name_sealed\", \"database_name\", \"database_hostname\", \
                        \"schema_version\", \"certificate_id\", \"signature\", \"created_at\", \
                        \"updated_at\" \
                 FROM \"workspace\" ORDER BY \"created_at\", \"id\"",
                (),
            )
            .await?;
        let mut workspaces = Vec::new();

        while let Some(row) = rows.next().await? {
            let id = text(&row, 0)?;
            let database_name = text(&row, 2)?;
            let database_hostname = text(&row, 3)?;
            let certificate_id = text(&row, 5)?;
            let signature = blob(&row, 6)?;

            verified(
                organization_verifying_key,
                &certificates,
                "workspace",
                &id,
                &certificate_id,
                Authority::Workspace(WorkspaceAuthority {
                    database_name: &database_name,
                    database_hostname: &database_hostname,
                }),
                &signature,
            )?;

            workspaces.push((
                certificate_id,
                WorkspaceRecord {
                    id,
                    name_sealed: blob(&row, 1)?,
                    database_name,
                    database_hostname,
                    schema_version: integer(&row, 4)?,
                    created_at: integer(&row, 7)?,
                    updated_at: integer(&row, 8)?,
                },
            ));
        }

        Ok(workspaces)
    }

    // grants

    pub async fn write_grant(&self, signer: &Signer<'_>, grant: &GrantRecord) -> Result<(), Error> {
        let signature = sign(
            signer.key,
            signer.certificate,
            Authority::Grant(GrantAuthority {
                member_id: &grant.member_id,
                workspace_id: &grant.workspace_id,
                sealed_credential: &grant.sealed_credential,
                access_level: &grant.access_level,
                credential_expires_at: grant.credential_expires_at.as_deref(),
            }),
        )?;

        self.connection
            .execute(
                "INSERT OR REPLACE INTO \"grant\" \
                 (\"member_id\", \"workspace_id\", \"sealed_credential\", \"access_level\", \
                  \"credential_expires_at\", \"certificate_id\", \"signature\") \
                 VALUES (?, ?, ?, ?, ?, ?, ?)",
                vec![
                    turso::Value::Text(grant.member_id.clone()),
                    turso::Value::Text(grant.workspace_id.clone()),
                    turso::Value::Blob(grant.sealed_credential.clone()),
                    turso::Value::Text(grant.access_level.clone()),
                    optional_text(grant.credential_expires_at.as_deref()),
                    turso::Value::Text(signer.certificate.id.clone()),
                    turso::Value::Blob(signature),
                ],
            )
            .await?;

        Ok(())
    }

    /// Every grant, each verified before it is returned.
    pub async fn grants(
        &self,
        organization_verifying_key: &[u8; VERIFYING_KEY_BYTES],
    ) -> Result<Vec<GrantRecord>, Error> {
        Ok(self
            .signed_grants(organization_verifying_key)
            .await?
            .into_iter()
            .map(|(_, grant)| grant)
            .collect())
    }

    /// Every grant, each verified, paired with the id of the certificate that signed it.
    async fn signed_grants(
        &self,
        organization_verifying_key: &[u8; VERIFYING_KEY_BYTES],
    ) -> Result<Vec<(String, GrantRecord)>, Error> {
        let certificates = self.certificates().await?;
        let mut rows = self
            .connection
            .query(
                "SELECT \"member_id\", \"workspace_id\", \"sealed_credential\", \"access_level\", \
                        \"credential_expires_at\", \"certificate_id\", \"signature\" \
                 FROM \"grant\" ORDER BY \"member_id\", \"workspace_id\"",
                (),
            )
            .await?;
        let mut grants = Vec::new();

        while let Some(row) = rows.next().await? {
            let grant = GrantRecord {
                member_id: text(&row, 0)?,
                workspace_id: text(&row, 1)?,
                sealed_credential: blob(&row, 2)?,
                access_level: text(&row, 3)?,
                credential_expires_at: nullable_text(&row, 4)?,
            };
            let certificate_id = text(&row, 5)?;
            let signature = blob(&row, 6)?;

            verified(
                organization_verifying_key,
                &certificates,
                "grant",
                &format!("{}/{}", grant.member_id, grant.workspace_id),
                &certificate_id,
                Authority::Grant(GrantAuthority {
                    member_id: &grant.member_id,
                    workspace_id: &grant.workspace_id,
                    sealed_credential: &grant.sealed_credential,
                    access_level: &grant.access_level,
                    credential_expires_at: grant.credential_expires_at.as_deref(),
                }),
                &signature,
            )?;

            grants.push((certificate_id, grant));
        }

        Ok(grants)
    }

    // invitations

    pub async fn write_invitation(
        &self,
        signer: &Signer<'_>,
        invitation: &InvitationRecord,
    ) -> Result<(), Error> {
        let signature = sign(
            signer.key,
            signer.certificate,
            Authority::Invitation(InvitationAuthority {
                id: &invitation.id,
                member_id: &invitation.member_id,
                expires_at: invitation.expires_at,
            }),
        )?;

        self.connection
            .execute(
                "INSERT OR REPLACE INTO \"invitation\" \
                 (\"id\", \"member_id\", \"expires_at\", \"consumed_at\", \"sealed_secret\", \
                  \"issued_by\", \"certificate_id\", \"signature\", \"created_at\") \
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                vec![
                    turso::Value::Text(invitation.id.clone()),
                    turso::Value::Text(invitation.member_id.clone()),
                    turso::Value::Integer(invitation.expires_at),
                    invitation
                        .consumed_at
                        .map_or(turso::Value::Null, turso::Value::Integer),
                    turso::Value::Blob(invitation.sealed_secret.clone()),
                    turso::Value::Text(invitation.issued_by.clone()),
                    turso::Value::Text(signer.certificate.id.clone()),
                    turso::Value::Blob(signature),
                    turso::Value::Integer(invitation.created_at),
                ],
            )
            .await?;

        Ok(())
    }

    /// Every invitation, each verified before it is returned.
    pub async fn invitations(
        &self,
        organization_verifying_key: &[u8; VERIFYING_KEY_BYTES],
    ) -> Result<Vec<InvitationRecord>, Error> {
        Ok(self
            .signed_invitations(organization_verifying_key)
            .await?
            .into_iter()
            .map(|(_, invitation)| invitation)
            .collect())
    }

    /// Every invitation, each verified, paired with the id of the certificate that signed it.
    async fn signed_invitations(
        &self,
        organization_verifying_key: &[u8; VERIFYING_KEY_BYTES],
    ) -> Result<Vec<(String, InvitationRecord)>, Error> {
        let certificates = self.certificates().await?;
        let mut rows = self
            .connection
            .query(
                "SELECT \"id\", \"member_id\", \"expires_at\", \"consumed_at\", \"sealed_secret\", \
                        \"issued_by\", \"certificate_id\", \"signature\", \"created_at\" \
                 FROM \"invitation\" ORDER BY \"created_at\", \"id\"",
                (),
            )
            .await?;
        let mut invitations = Vec::new();

        while let Some(row) = rows.next().await? {
            let id = text(&row, 0)?;
            let member_id = text(&row, 1)?;
            let expires_at = integer(&row, 2)?;
            let certificate_id = text(&row, 6)?;
            let signature = blob(&row, 7)?;

            verified(
                organization_verifying_key,
                &certificates,
                "invitation",
                &id,
                &certificate_id,
                Authority::Invitation(InvitationAuthority {
                    id: &id,
                    member_id: &member_id,
                    expires_at,
                }),
                &signature,
            )?;

            invitations.push((
                certificate_id,
                InvitationRecord {
                    id,
                    member_id,
                    expires_at,
                    consumed_at: match row.get_value(3)? {
                        turso::Value::Integer(value) => Some(value),
                        _ => None,
                    },
                    sealed_secret: blob(&row, 4)?,
                    issued_by: text(&row, 5)?,
                    created_at: integer(&row, 8)?,
                },
            ));
        }

        Ok(invitations)
    }

    /// Mark an invitation consumed: the member whose vault it made has a password of their own by
    /// the time this runs, so the link that named it opens a vault the generated password no
    /// longer fits.
    ///
    /// Unsigned on purpose: the machine that consumes it holds no administrator key, and a
    /// consumed invitation is spent whether or not the mark is trusted, because the member row it
    /// pointed at now has a password of the member's own.
    ///
    /// *It cleared `code_seal` and `code_expires_at` too, until effort 828 moved the seal into the
    /// link's own text, where a consume cannot reach it. What retires a spent link is the mark
    /// this writes, which the accept refuses on.*
    pub async fn consume_invitation(&self, id: &str, now: i64) -> Result<(), Error> {
        self.connection
            .execute(
                "UPDATE \"invitation\" SET \"consumed_at\" = ? WHERE \"id\" = ?",
                vec![
                    turso::Value::Integer(now),
                    turso::Value::Text(id.to_string()),
                ],
            )
            .await?;

        Ok(())
    }

    /// Revoke an invitation: the row goes, and the link that named it finds nothing.
    pub async fn delete_invitation(&self, id: &str) -> Result<(), Error> {
        self.connection
            .execute(
                "DELETE FROM \"invitation\" WHERE \"id\" = ?",
                vec![turso::Value::Text(id.to_string())],
            )
            .await?;

        Ok(())
    }

    // machine links

    /// Write the row behind a link made for an account whose password is set.
    ///
    /// **Unsigned**, for the reason [`MachineLinkRecord`] gives. `INSERT OR REPLACE`, so a member
    /// who makes a second link for the same id overwrites the first rather than growing a second
    /// row for it.
    pub async fn write_machine_link(&self, machine_link: &MachineLinkRecord) -> Result<(), Error> {
        self.connection
            .execute(
                "INSERT OR REPLACE INTO \"machine_link\" \
                 (\"id\", \"member_id\", \"expires_at\", \"consumed_at\", \"created_at\") \
                 VALUES (?, ?, ?, ?, ?)",
                vec![
                    turso::Value::Text(machine_link.id.clone()),
                    turso::Value::Text(machine_link.member_id.clone()),
                    turso::Value::Integer(machine_link.expires_at),
                    machine_link
                        .consumed_at
                        .map_or(turso::Value::Null, turso::Value::Integer),
                    turso::Value::Integer(machine_link.created_at),
                ],
            )
            .await?;

        Ok(())
    }

    /// The row a machine link names, or `None` where nobody made one or it was replaced.
    ///
    /// **No verifying key, because there is nothing to verify.** Every other read here checks a
    /// signature and refuses the row that fails it; this row carries none, so what the caller gets
    /// is what the replica holds, and what it is worth is [`MachineLinkRecord`]'s docstring.
    pub async fn machine_link(&self, id: &str) -> Result<Option<MachineLinkRecord>, Error> {
        let mut rows = self
            .connection
            .query(
                "SELECT \"id\", \"member_id\", \"expires_at\", \"consumed_at\", \"created_at\" \
                 FROM \"machine_link\" WHERE \"id\" = ?",
                vec![turso::Value::Text(id.to_string())],
            )
            .await?;

        match rows.next().await? {
            Some(row) => Ok(Some(MachineLinkRecord {
                id: text(&row, 0)?,
                member_id: text(&row, 1)?,
                expires_at: integer(&row, 2)?,
                consumed_at: match row.get_value(3)? {
                    turso::Value::Integer(value) => Some(value),
                    _ => None,
                },
                created_at: integer(&row, 4)?,
            })),
            None => Ok(None),
        }
    }

    /// Mark a machine link spent: the machine that opened it holds the organization from here on,
    /// and the link admits nobody else.
    pub async fn consume_machine_link(&self, id: &str, now: i64) -> Result<(), Error> {
        self.connection
            .execute(
                "UPDATE \"machine_link\" SET \"consumed_at\" = ? WHERE \"id\" = ?",
                vec![
                    turso::Value::Integer(now),
                    turso::Value::Text(id.to_string()),
                ],
            )
            .await?;

        Ok(())
    }

    /// Drop every unspent machine link this account holds, which is what makes one stand at a
    /// time.
    ///
    /// **Three callers clear the account's open rows, and each for its own reason.**
    /// `invite::make_link` clears them on the branch that makes this kind, so that somebody who
    /// lost the pair presses again and the link they could not use stops being a way in the
    /// moment the new one exists. `invite::reseal_account`, which a reset runs and which the
    /// invitation branch of the same act runs too, clears them because the vault the re-seal
    /// replaces is the one the account's old password opened, and a machine link made before it
    /// still carries a live credential over a row nothing has spent.
    /// `removal::retire_member` clears them because a link is judged against the row behind it
    /// and never against the member's standing, so one made before the removal would go on
    /// connecting machines after the person had been let go.
    ///
    /// A spent row is left where it is in all three: it is what refuses the link that already
    /// connected a machine.
    pub async fn delete_open_machine_links_of(&self, member_id: &str) -> Result<(), Error> {
        self.connection
            .execute(
                "DELETE FROM \"machine_link\" WHERE \"member_id\" = ? AND \"consumed_at\" IS NULL",
                vec![turso::Value::Text(member_id.to_string())],
            )
            .await?;

        Ok(())
    }

    // machines

    /// Put this machine in the registry: it holds the organization from now on.
    ///
    /// **Unsigned**, for the reason [`MachineRecord`] gives, and so is every other write here.
    /// `INSERT OR REPLACE`, so a machine that connects again under an id it already used starts
    /// its row over rather than growing a second one; the id is drawn at the connect, so that is
    /// a machine which disconnected and came back.
    pub async fn register_machine(
        &self,
        id: &str,
        member_id: Option<&str>,
        now: i64,
    ) -> Result<(), Error> {
        self.write_machine(id, member_id, now, now).await
    }

    /// Say this machine is still here, and who is signed in on it: `Some` at a sign-in, `None` at
    /// a sign-out, and whoever the record names at a launch.
    ///
    /// **It writes the row where there is none**, which is what a record written before this
    /// build meets at its next launch, and what a machine whose row somebody deleted meets at
    /// its next. `created_at` is read first and kept, so refreshing a row does not make an old
    /// machine look new.
    pub async fn machine_seen(
        &self,
        id: &str,
        member_id: Option<&str>,
        now: i64,
    ) -> Result<(), Error> {
        let created_at = self.machine_created_at(id).await?.unwrap_or(now);

        self.write_machine(id, member_id, now, created_at).await
    }

    /// Take this machine out of the registry: what a disconnect writes before it forgets the
    /// organization locally, so the machine stops standing in anybody's way at once rather than
    /// in a week.
    pub async fn unregister_machine(&self, id: &str) -> Result<(), Error> {
        self.connection
            .execute(
                "DELETE FROM \"machine\" WHERE \"id\" = ?",
                vec![turso::Value::Text(id.to_string())],
            )
            .await?;

        Ok(())
    }

    /// Take this member's name off every machine in the registry: what ending their sessions
    /// everywhere leaves behind (effort 828, requirements 15 and 20).
    ///
    /// **The rows stay and stop naming anybody**, which is the shape an ordinary sign-out writes
    /// through [`OrganizationStore::machine_seen`]: those machines still hold the organization,
    /// and what ended is who is signed in on them. So the standing line on that account's card
    /// reads *no machine signed in* from the next look onwards, which is the fact this act made
    /// true.
    pub async fn clear_member_from_machines(&self, member_id: &str) -> Result<(), Error> {
        self.connection
            .execute(
                "UPDATE \"machine\" SET \"member_id\" = NULL WHERE \"member_id\" = ?",
                vec![turso::Value::Text(member_id.to_string())],
            )
            .await?;

        Ok(())
    }

    /// Every machine seen inside [`MACHINE_PRESENCE_WINDOW`] of `now`, each with the member row
    /// signed in on it where one is named: the registry's one reader (effort 828, requirement
    /// 15).
    ///
    /// **What it answers gates nothing** (the human, 2026-09-20). Its one production caller is
    /// `invite::standings`, behind the standing line a member's card carries (requirement 19).
    /// It had two more, the Turso way in's refusal and the link act's, and both are gone: an
    /// account is held on as many machines as its holder signs in on.
    ///
    /// **The member half is the ordinary verified read**, so what a caller gets back is a role it
    /// can act on: the machine row carries no signature and nothing about it is trusted, and the
    /// member row beside it is verified against the chain exactly as [`OrganizationStore::members`]
    /// verifies it. That is why this read takes the organization's verifying key while every
    /// write above takes nothing: there is no signer anywhere in the registry, and the key is
    /// what judges the member rows the registry points at, never the rows it holds.
    ///
    /// A machine naming a member who is no longer in the organization comes back with `None`
    /// beside it rather than being dropped: it is still a machine holding the organization, and
    /// what the caller is counting is machines.
    ///
    /// **The window is bounded at both ends.** Every machine writes its own `seen_at` and the row
    /// carries no signature, so a row dated in the future is one anybody could write, and a window
    /// left open above would let a single row stand as connected for as long as that date says
    /// rather than for the week the window is. A machine seen later than now has not been seen.
    pub async fn connected_machines(
        &self,
        organization_verifying_key: &[u8; VERIFYING_KEY_BYTES],
        now: i64,
    ) -> Result<Vec<(MachineRecord, Option<MemberRecord>)>, Error> {
        let members = self.members(organization_verifying_key).await?;
        let mut rows = self
            .connection
            .query(
                "SELECT \"id\", \"member_id\", \"seen_at\", \"created_at\" FROM \"machine\" \
                 WHERE \"seen_at\" > ? AND \"seen_at\" <= ? \n                 ORDER BY \"created_at\", \"id\"",
                vec![
                    turso::Value::Integer(now - MACHINE_PRESENCE_WINDOW),
                    turso::Value::Integer(now),
                ],
            )
            .await?;
        let mut machines = Vec::new();

        while let Some(row) = rows.next().await? {
            let machine = MachineRecord {
                id: text(&row, 0)?,
                member_id: match row.get_value(1)? {
                    turso::Value::Text(value) => Some(value),
                    _ => None,
                },
                seen_at: integer(&row, 2)?,
                created_at: integer(&row, 3)?,
            };
            let member = machine.member_id.as_ref().and_then(|member_id| {
                members
                    .iter()
                    .find(|member| &member.id == member_id)
                    .cloned()
            });

            machines.push((machine, member));
        }

        Ok(machines)
    }

    /// The write behind [`OrganizationStore::register_machine`] and
    /// [`OrganizationStore::machine_seen`], which differ only in what they do with `created_at`.
    async fn write_machine(
        &self,
        id: &str,
        member_id: Option<&str>,
        seen_at: i64,
        created_at: i64,
    ) -> Result<(), Error> {
        self.connection
            .execute(
                "INSERT OR REPLACE INTO \"machine\" \
                 (\"id\", \"member_id\", \"seen_at\", \"created_at\") \
                 VALUES (?, ?, ?, ?)",
                vec![
                    turso::Value::Text(id.to_string()),
                    member_id.map_or(turso::Value::Null, |member_id| {
                        turso::Value::Text(member_id.to_string())
                    }),
                    turso::Value::Integer(seen_at),
                    turso::Value::Integer(created_at),
                ],
            )
            .await?;

        Ok(())
    }

    /// When this machine first registered, where it has a row: what a refresh keeps.
    async fn machine_created_at(&self, id: &str) -> Result<Option<i64>, Error> {
        let mut rows = self
            .connection
            .query(
                "SELECT \"created_at\" FROM \"machine\" WHERE \"id\" = ?",
                vec![turso::Value::Text(id.to_string())],
            )
            .await?;

        match rows.next().await? {
            Some(row) => Ok(Some(integer(&row, 0)?)),
            None => Ok(None),
        }
    }

    /// Rename a workspace. Unsigned, as the plan keeps the name: the database identity is what
    /// the chain signs, and the name is content, sealed under the content key by the caller.
    pub async fn rename_workspace(
        &self,
        workspace_id: &str,
        name_sealed: &[u8],
        now: i64,
    ) -> Result<(), Error> {
        self.connection
            .execute(
                "UPDATE \"workspace\" SET \"name_sealed\" = ?, \"updated_at\" = ? \
                 WHERE \"id\" = ?",
                vec![
                    turso::Value::Blob(name_sealed.to_vec()),
                    turso::Value::Integer(now),
                    turso::Value::Text(workspace_id.to_string()),
                ],
            )
            .await?;

        Ok(())
    }

    /// Record that a workspace's database is at `version`. Unsigned, deliberately: the plan puts
    /// the schema version outside the signature so that whichever member applied the migration
    /// can say so, and a member has no signing key.
    pub async fn record_schema_version(
        &self,
        workspace_id: &str,
        version: i64,
        now: i64,
    ) -> Result<(), Error> {
        self.connection
            .execute(
                "UPDATE \"workspace\" SET \"schema_version\" = ?, \"updated_at\" = ? \
                 WHERE \"id\" = ?",
                vec![
                    turso::Value::Integer(version),
                    turso::Value::Integer(now),
                    turso::Value::Text(workspace_id.to_string()),
                ],
            )
            .await?;

        Ok(())
    }

    /// The migration lease on a workspace, or nothing: who holds it and until when, as a value
    /// a human can read out of the row.
    pub async fn migration_lease(
        &self,
        workspace_id: &str,
    ) -> Result<Option<MigrationLeaseRecord>, Error> {
        let mut rows = self
            .connection
            .query(
                "SELECT \"holder_member_id\", \"expires_at\" FROM \"migration_lease\" \
                 WHERE \"workspace_id\" = ?",
                vec![turso::Value::Text(workspace_id.to_string())],
            )
            .await?;

        match rows.next().await? {
            Some(row) => Ok(Some(MigrationLeaseRecord {
                workspace_id: workspace_id.to_string(),
                holder_member_id: text(&row, 0)?,
                expires_at: integer(&row, 1)?,
            })),
            None => Ok(None),
        }
    }

    /// The connection, for the lease authority that runs the lease statements against a local
    /// primary (`organization/migration.rs::StoreLease`).
    pub(crate) fn lease_connection(&self) -> &turso::Connection {
        &self.connection
    }

    /// Remove one grant: what a reset does with a grant it cannot re-seal, because the vault it
    /// was sealed to is gone and a grant nobody can open is a sign-in that fails.
    pub async fn delete_grant(&self, member_id: &str, workspace_id: &str) -> Result<(), Error> {
        self.connection
            .execute(
                "DELETE FROM \"grant\" WHERE \"member_id\" = ? AND \"workspace_id\" = ?",
                vec![
                    turso::Value::Text(member_id.to_string()),
                    turso::Value::Text(workspace_id.to_string()),
                ],
            )
            .await?;

        Ok(())
    }

    /// Remove a workspace's row and every grant on it, for the one moment requirement 4 permits
    /// it; the database it names is the port's to remove first.
    pub async fn delete_workspace(&self, workspace_id: &str) -> Result<(), Error> {
        self.connection
            .execute(
                "DELETE FROM \"grant\" WHERE \"workspace_id\" = ?",
                vec![turso::Value::Text(workspace_id.to_string())],
            )
            .await?;
        self.connection
            .execute(
                "DELETE FROM \"workspace\" WHERE \"id\" = ?",
                vec![turso::Value::Text(workspace_id.to_string())],
            )
            .await?;

        Ok(())
    }

    /// Re-sign every row a certificate signed, under `signer`, and say how many rows moved.
    ///
    /// **The one routine reset, removal and any future revocation share, so the three cannot
    /// drift.** An administrator's certificate is retired two ways: a reset replaces it with a key
    /// derived from a fresh vault secret (`invite::issue`), and a removal writes it back revoked
    /// (`removal::remove_member`). Either way, `authority::verify` then refuses every row the old
    /// certificate signed, because the row's signature no longer matches the key the certificate
    /// carries (reset) or the certificate is revoked (removal), and `members`/`grants`/
    /// `invitations`/`workspaces` refuse the whole read on the first such row. So before the
    /// certificate is retired, the rows it signed are re-signed under the acting administrator, who
    /// already holds authority over them: the resetting owner, or the removing owner or
    /// administrator. After it, those rows name the actor's certificate and verify under it, and
    /// retiring the old certificate bricks nothing.
    ///
    /// The rows are read through the verified readers, so a row that does not verify under the
    /// still-live old certificate refuses the whole operation rather than being re-signed blind;
    /// the actor never launders a forgery into their own signature. Each row is written back
    /// through the ordinary `write_*` path, which stamps `signer`'s certificate id and a fresh
    /// signature and leaves every other column as it stood.
    pub async fn re_sign_rows_of_certificate(
        &self,
        organization_verifying_key: &[u8; VERIFYING_KEY_BYTES],
        certificate_id: &str,
        signer: &Signer<'_>,
    ) -> Result<usize, Error> {
        if signer.certificate.id == certificate_id {
            return Err(Error::Integrity {
                message: "a certificate cannot re-sign its own rows onto itself".to_string(),
            });
        }

        let mut re_signed = 0;

        for (signed_by, member) in self.signed_members(organization_verifying_key).await? {
            if signed_by == certificate_id {
                self.write_member(signer, &member).await?;
                re_signed += 1;
            }
        }

        for (signed_by, workspace) in self.signed_workspaces(organization_verifying_key).await? {
            if signed_by == certificate_id {
                self.write_workspace(signer, &workspace).await?;
                re_signed += 1;
            }
        }

        for (signed_by, grant) in self.signed_grants(organization_verifying_key).await? {
            if signed_by == certificate_id {
                self.write_grant(signer, &grant).await?;
                re_signed += 1;
            }
        }

        for (signed_by, invitation) in self.signed_invitations(organization_verifying_key).await? {
            if signed_by == certificate_id {
                self.write_invitation(signer, &invitation).await?;
                re_signed += 1;
            }
        }

        Ok(re_signed)
    }

    // successions

    /// Write a succession as offered or as accepted. The signature it carries is the organization
    /// key's and was made by the caller, exactly as a certificate's is: this module holds no
    /// organization key and makes no signature with one.
    pub async fn write_succession(&self, succession: &SuccessionRecord) -> Result<(), Error> {
        self.connection
            .execute(
                "INSERT OR REPLACE INTO \"succession\" \
                 (\"id\", \"offered_member_id\", \"offered_by\", \"offered_at\", \
                  \"old_verifying_key\", \"new_verifying_key\", \"accepted_at\", \"signature\") \
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                vec![
                    turso::Value::Text(succession.id.clone()),
                    turso::Value::Text(succession.offered_member_id.clone()),
                    turso::Value::Text(succession.offered_by.clone()),
                    turso::Value::Integer(succession.offered_at),
                    turso::Value::Blob(succession.old_verifying_key.to_vec()),
                    match &succession.new_verifying_key {
                        Some(key) => turso::Value::Blob(key.to_vec()),
                        None => turso::Value::Null,
                    },
                    match succession.accepted_at {
                        Some(at) => turso::Value::Integer(at),
                        None => turso::Value::Null,
                    },
                    turso::Value::Blob(succession.signature.clone()),
                ],
            )
            .await?;

        Ok(())
    }

    /// Every succession, oldest first, with no signature checked.
    ///
    /// **The second read in this module that verifies nothing, and the reason is the opposite of
    /// [`OrganizationStore::members_unverified`]'s.** That one reads before a key exists; this one
    /// reads the rows that say which key to hold, so the key to judge them by is exactly what the
    /// caller is working out. Verifying here would mean picking one, and the pick is the decision.
    ///
    /// **What a caller must do with these is check each one** through
    /// `authority::verify_succession`, against the key it already pinned and then against each key
    /// the chain hands it (`role::follow_succession`, which is the only walk there is). A row
    /// whose signature does not check under the key in hand is a row somebody wrote, and every
    /// such row is worth exactly nothing: without the check this table would be a way to tell any
    /// machine to trust any key.
    pub async fn successions(&self) -> Result<Vec<SuccessionRecord>, Error> {
        let mut rows = self
            .connection
            .query(
                "SELECT \"id\", \"offered_member_id\", \"offered_by\", \"offered_at\", \
                        \"old_verifying_key\", \"new_verifying_key\", \"accepted_at\", \
                        \"signature\" \
                 FROM \"succession\" ORDER BY \"offered_at\", \"id\"",
                (),
            )
            .await?;
        let mut successions = Vec::new();

        while let Some(row) = rows.next().await? {
            successions.push(SuccessionRecord {
                id: text(&row, 0)?,
                offered_member_id: text(&row, 1)?,
                offered_by: text(&row, 2)?,
                offered_at: integer(&row, 3)?,
                old_verifying_key: fixed::<VERIFYING_KEY_BYTES>(&row, 4, "old_verifying_key")?,
                new_verifying_key: match nullable_blob(&row, 5)? {
                    Some(bytes) => Some(
                        <[u8; VERIFYING_KEY_BYTES]>::try_from(bytes.as_slice()).map_err(|_| {
                            Error::Integrity {
                                message: "a succession's new verifying key is not a key"
                                    .to_string(),
                            }
                        })?,
                    ),
                    None => None,
                },
                accepted_at: nullable_integer(&row, 6)?,
                signature: blob(&row, 7)?,
            });
        }

        Ok(successions)
    }

    /// Take a standing offer away, which is what withdrawing one is. A completed succession is
    /// never deleted, and nothing here distinguishes the two: the caller names the row.
    pub async fn delete_succession(&self, id: &str) -> Result<(), Error> {
        self.connection
            .execute(
                "DELETE FROM \"succession\" WHERE \"id\" = ?",
                vec![turso::Value::Text(id.to_string())],
            )
            .await?;

        Ok(())
    }

    /// The columns one table carries, as the database reports them: what the startup check reads
    /// to tell a replica built under an earlier schema from one this build wrote
    /// (`organization/forget.rs`). A table that is not there has no columns.
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

    /// The connection, for a test that has to write a row the store would never write.
    #[cfg(test)]
    pub(crate) fn connection(&self) -> &turso::Connection {
        &self.connection
    }
}

/// One row's verdict, through the only verifier there is.
///
/// A row naming a certificate that does not exist fails here as well: an unknown certificate is
/// an authority nobody issued, which is the same thing as a forged one from where a reader stands.
fn verified(
    organization_verifying_key: &[u8; VERIFYING_KEY_BYTES],
    certificates: &[Certificate],
    table: &str,
    id: &str,
    certificate_id: &str,
    authority: Authority<'_>,
    signature: &[u8],
) -> Result<(), Error> {
    let certificate = certificates
        .iter()
        .find(|certificate| certificate.id == certificate_id)
        .ok_or_else(|| Error::Integrity {
            message: format!(
                "the {table} row {id} names a certificate nobody issued ({certificate_id}), \
                 and is refused"
            ),
        })?;

    verify(
        organization_verifying_key,
        certificate,
        authority,
        signature,
    )
    .map_err(|error| Error::Integrity {
        message: format!("the {table} row {id} is refused: {error}"),
    })
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
    use std::path::PathBuf;

    use super::{
        FORMAT_VERSION, GrantRecord, MemberRecord, OrganizationRecord, OrganizationStore, Signer,
        TABLES, WorkspaceRecord,
    };
    use crate::error::{Error, RefusalReason};
    use crate::organization::{
        authority::{AdministratorKey, Certificate, OrganizationKey, issue_certificate},
        vault::{
            ContentKey, KdfParams, create_vault_with_secret, generate_content_key, open_content,
            seal_content, seal_to_public_key,
        },
    };

    /// A cost cheap enough to run in a suite, written out as a caller writes one.
    fn test_cost() -> KdfParams {
        KdfParams {
            memory_kib: 1024,
            iterations: 2,
            lanes: 1,
        }
    }

    fn scratch(name: &str) -> PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|elapsed| elapsed.as_nanos())
            .unwrap_or_default();
        let directory = std::env::temp_dir().join(format!("rentable-org-{name}-{nanos:x}"));
        std::fs::create_dir_all(&directory).expect("scratch directory");

        directory
    }

    /// An organization with one administrator, as ticket 09 will create one: an organization key,
    /// an administrator key, and the certificate that joins them.
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
            let certificate = issue_certificate(
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
                role: role.to_string(),
                permissions: if role == "owner" { 127 } else { 0 },
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
        let store = OrganizationStore::open(&directory.join("org-acme.db"), None, || async {
            Ok::<String, turso::Error>(String::new())
        })
        .await
        .expect("the organization replica");

        store.install_schema().await.expect("the schema");

        store
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
        let store = OrganizationStore::open(&directory.join("org-x.db"), None, || async {
            Ok::<String, turso::Error>(String::new())
        })
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

    /// Every table in the schema but `format`, created as every build before effort 838 created
    /// them: an organization of today's shape, before the format break.
    async fn without_format(directory: &std::path::Path) -> OrganizationStore {
        let store = OrganizationStore::open(&directory.join("org-old.db"), None, || async {
            Ok::<String, turso::Error>(String::new())
        })
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
            .execute("UPDATE \"format\" SET \"version\" = 3", ())
            .await
            .expect("a newer format");

        assert_eq!(store.format().await.expect("the format"), Some(3));
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
            .execute("INSERT INTO \"format\" VALUES ('format', 3)", ())
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

        // the invitation's own columns, pinned: `sealed_secret` is what `forget::old_shape` calls
        // a replica without the old shape by, so a schema that stopped declaring it would wipe
        // every machine at startup rather than fail here. *`code_seal` and
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
        // (requirement 22), and `forget::old_shape` calls a replica without either the old shape.
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
                "role",
                "permissions",
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
        let store = OrganizationStore::open(&directory.join("org-acme.db"), None, || async {
            Ok::<String, turso::Error>(String::new())
        })
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

    /// **No rents domain table appears in the organization database**, in the shape the
    /// control plane's `boundary.test.ts` had before it retired. The domain tables are
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
        assert_eq!(members[0].role, "owner");
        assert!(!members[0].must_change_password);
        assert_eq!(members[1].role, "member");
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

    /// Effort 828, requirement 22: **a row written before the column and a row written with it
    /// both verify**, against the same unchanged key.
    ///
    /// The nullable column is folded into the signed preimage only where it is present
    /// (`authority::preimage`), so a row with no seal signs exactly the bytes it signed before
    /// the column existed; `authority.rs` pins those bytes, and this is the same claim read
    /// through the store, where a row also has to survive a write and a read.
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
        store
            .write_member(&chain.signer(), &chain.member("founder", "olivia", "owner"))
            .await
            .expect("the row written before the column");
        store
            .write_member(
                &chain.signer(),
                &MemberRecord {
                    owner_seed_sealed: Some(sealed.clone()),
                    ..chain.member("transferee", "ada", "owner")
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
    /// and is pushed; an administrator whose replica has not pulled since fixes a typo in that
    /// member's username, and `invite::rename_member` writes the row back whole from the record
    /// it read, which still carries 0. `role::change_role` and `removal::retire_member` write
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
                "UPDATE \"member\" SET \"role\" = 'owner', \"permissions\" = 127 \
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

        assert_eq!(owner.role, "owner");
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

    #[tokio::test]
    async fn a_row_signed_under_a_revoked_or_unknown_certificate_is_refused() {
        let directory = scratch("revoked");
        let store = open(&directory).await;
        let chain = Chain::new();

        populated(&store, &chain).await;

        // revocation is a row: the same certificate, written back with `revoked_at` set.
        store
            .write_certificate(&chain.certificate.revoked("1757100000000"))
            .await
            .expect("the revocation");

        let refusal = store
            .grants(&chain.verifying_key())
            .await
            .expect_err("a grant under a revoked certificate was read");

        assert!(refusal.to_string().contains("revoked"), "{refusal}");

        // and a row naming a certificate nobody issued is a forgery from where a reader stands.
        store
            .connection()
            .execute(
                "UPDATE \"workspace\" SET \"certificate_id\" = 'cert-nobody' WHERE \"id\" = 'north'",
                (),
            )
            .await
            .expect("the hostile write");

        let refusal = store
            .workspaces(&chain.verifying_key())
            .await
            .expect_err("a workspace under an unknown certificate was read");

        assert!(refusal.to_string().contains("nobody issued"), "{refusal}");
        assert!(refusal.to_string().contains("north"), "{refusal}");
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

        assert!(refusal.to_string().contains("member-owner"), "{refusal}");
    }

    /// **The re-signing routine, and what it buys: a certificate that signed rows can be retired
    /// without bricking them.** An administrator's certificate signs one of every kind of row.
    /// While it stands every read verifies; revoked, every read that finds one of its rows is
    /// refused (F3). Re-signed under the owner first, the same revocation refuses nothing, and a
    /// fresh row still signed under the retired certificate is refused, which is what a removed
    /// administrator's forgery is.
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
        store
            .write_member(
                &chain.signer(),
                &chain.member("member-owner", "olivia", "owner"),
            )
            .await
            .expect("the owner member");

        // an administrator certified under the same organization key, who signs one of every kind
        // of row: a member, a workspace, a grant and an invitation.
        let admin_key = AdministratorKey::generate().expect("an administrator key");
        let admin_certificate = issue_certificate(
            &chain.organization_key,
            "cert-admin",
            "member-admin",
            &admin_key.verifying_key(),
            "1757000000000",
        );

        store
            .write_certificate(&admin_certificate)
            .await
            .expect("the administrator certificate");

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
            .write_certificate(&admin_certificate.revoked("1757100000000"))
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
            .write_certificate(&admin_certificate)
            .await
            .expect("un-revoke");

        let moved = store
            .re_sign_rows_of_certificate(&key, "cert-admin", &chain.signer())
            .await
            .expect("the re-sign");

        assert_eq!(moved, 4, "one of every kind of row was re-signed");

        store
            .write_certificate(&admin_certificate.revoked("1757100000000"))
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
                    certificate: &admin_certificate.revoked("1757100000000"),
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
            its_member.as_ref().map(|member| member.role.as_str()),
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
    /// database this run provisions through `sync/turso/platform.rs` and removes at the end.
    /// Admitted by name in [[rules/testing]] under *Tests that reach a live remote*, as the sixth
    /// property: whether the organization lives on the remote rather than on the machine that made
    /// it. `#[ignore]`, and it panics rather than skipping when its variables are absent, for the
    /// reason `sync/turso/discovery.rs` gives.
    ///
    /// ```text
    /// RENTABLE_LIVE_TURSO=1 TURSO_CONSENT_TOKEN=… TURSO_ORG=… TURSO_GROUP=… \
    ///   cargo test --manifest-path ./apps/desktop/tauri/Cargo.toml \
    ///   organization_live -- --test-threads=1 --ignored --nocapture
    /// ```
    #[tokio::test]
    #[ignore = "reaches a live Turso account and creates a database; see the doc comment"]
    async fn organization_live_a_second_machine_reads_what_the_first_wrote() {
        use crate::sync::turso::{
            consent::store_platform_token,
            discovery::TursoOrganization,
            platform::{DeletionIntent, PlatformApi, PlatformEndpoint, TursoPlatform},
        };

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
        store_platform_token(&read("TURSO_CONSENT_TOKEN")).expect("failed to file the token");

        let platform = PlatformApi::new(
            PlatformEndpoint::production(),
            TursoOrganization {
                slug: read("TURSO_ORG"),
                group: read("TURSO_GROUP"),
            },
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
            .mint_token(
                &name,
                "1h",
                crate::sync::turso::platform::AccessLevel::FullAccess,
            )
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
            if file.ends_with("organization/store.rs") || file.ends_with("organization\\store.rs") {
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
            vec!["organization/setup.rs".to_string()],
            "the unverified member read is meant to have exactly one caller"
        );
    }
}
