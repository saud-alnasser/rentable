//! The organization format: which one an organization is in, the refusal of another, and the
//! readers and reshapes of format 1 that its owner's upgrade runs (`upgrade/format/`). Format
//! policy, kept apart from the repository methods of this format.

use crate::{
    database::floor::{self, Floors, Standing},
    error::{Error, RefusalReason},
    organization::{
        authority::{Certificate, FormatOneCertificate, Revocation, VERIFYING_KEY_BYTES},
        member::vault::{KDF_SALT_BYTES, KdfParams, PUBLIC_KEY_BYTES, Vault},
    },
};

use super::{
    FORMAT_TWO_TABLES, GrantRecord, InvitationRecord, MarkRecord, OrganizationStore, RoleRecord,
    SCHEMA, SignedRow, SuccessionRecord, TABLES, WorkspaceRecord, blob, fixed, integer,
    nullable_blob, nullable_integer, nullable_text, text,
};

/// one row, the organization format (see [`FORMAT_VERSION`]).
pub(super) const FORMAT: &str = "CREATE TABLE IF NOT EXISTS \"format\" (\
        \"id\" TEXT PRIMARY KEY NOT NULL, \
        \"version\" INTEGER NOT NULL)";

/// The organization format this build reads and writes (effort 838, requirement 11).
///
/// **An older organization is upgraded by its owner, and a newer one refused.** An organization
/// this build creates carries this number in its one `format` row. Every organization made before
/// effort 838 has no `format` table, which is what version 1 was: its owner's machine upgrades it
/// in place at their sign-in, resume or connect, online, and writes this row last
/// (`upgrade/format/runner/`, tickets 22 and 23). An upgrade cut short has no row either, and its
/// owner finishes it. Until then, and for an organization with a number above this one, nothing is
/// read from it and nothing written to it: [`OrganizationStore::refuse_another_format`] says which,
/// and the person is told what to do. That absence is how an older organization is told apart, and
/// it is why [`OrganizationStore::complete_schema`] never creates the table in one. *It was a break
/// with no upgrade until the human's call of 2026-09-26: an update replaces the build that could
/// export, so nobody could reach an export.*
///
/// **Unsigned.** Rewriting the number achieves nothing the credential does not already allow: a
/// holder who changes it makes the organization refuse to open, as deleting its rows would.
///
/// **The one after the last change of format this build holds** (ticket 26): the last change
/// `upgrade::format::TRANSITIONS` lists makes it, so adding a change moves it on by one, and the
/// test at the foot of `upgrade/format/mod.rs` fails until it has. *Counted from that list until
/// effort 840 (ticket 48): the store names nothing of `upgrade`, so the number is written here and
/// the list is held to it, and a release that removes the upgrade keeps it.*
pub const FORMAT_VERSION: i64 = 3;

/// The first format that writes a `format` row: format 1 wrote none, so a row is never read as
/// lower than this (`OrganizationStore::format_as_it_stands`, ticket 29).
const FIRST_FORMAT_WITH_A_ROW: i64 = 2;

/// The key of the one `format` row.
const FORMAT_ID: &str = "format";

/// The one-row table an organization's floors are recorded in (effort 857), by the first change
/// declared after 857 to reach it and then by the explicit upgrade: the step a build must know to
/// read it and to write it, beside the format it is in.
const ORGANIZATION_FLOOR_TABLE: &str = "organization_floor";

/// The key of the one `organization_floor` row.
const ORGANIZATION_FLOOR_ID: &str = "floor";

/// one row, the organization's floors, once a step declared after effort 857 has reached it
/// (ticket 03): an addition records the level it took the organization to beside the floors it
/// left where they were, and the explicit upgrade raises them (ticket 07). Unsigned, as `format`
/// is. An addition, created by [`OrganizationStore::complete_schema`]; empty, it records nothing,
/// and the `format` row is the record.
pub(super) const ORGANIZATION_FLOOR: &str = "CREATE TABLE IF NOT EXISTS \"organization_floor\" (\
        \"id\" TEXT PRIMARY KEY NOT NULL, \
        \"level\" INTEGER NOT NULL, \
        \"read\" INTEGER NOT NULL, \
        \"write\" INTEGER NOT NULL, \
        \"written_at\" INTEGER NOT NULL)";

/// The member column format 1 carried the role word in, and the one it carried the seven-act mask
/// in: either still standing marks an upgrade that has not finished
/// ([`OrganizationStore::carries_format_one`]).
const FORMAT_ONE_ROLE_COLUMN: &str = "role";
const FORMAT_ONE_PERMISSIONS_COLUMN: &str = "permissions";

/// The table format 1 kept its certificates in, which the upgrade drops last of all but the
/// `format` row, so every row of that format can still be judged until then.
const FORMAT_ONE_CERTIFICATE_TABLE: &str = "administrator_certificate";

/// What turns a format 1 `member` table into this format's, in order, each with the column whose
/// presence says whether it is still to run: the three columns added, each with a default a
/// `NOT NULL` addition needs, then the two dropped ([`OrganizationStore::format_one_reshape`] says
/// why in that order).
const FORMAT_ONE_RESHAPE: [(FormatOneReshape, &str); 5] = [
    (
        FormatOneReshape::Add(
            "ALTER TABLE \"member\" ADD COLUMN \"role_id\" TEXT NOT NULL DEFAULT 'member'",
        ),
        "role_id",
    ),
    (
        FormatOneReshape::Add(
            "ALTER TABLE \"member\" ADD COLUMN \"override\" INTEGER NOT NULL DEFAULT 0",
        ),
        "override",
    ),
    (
        FormatOneReshape::Add("ALTER TABLE \"member\" ADD COLUMN \"removed_at\" INTEGER"),
        "removed_at",
    ),
    (
        FormatOneReshape::Drop("ALTER TABLE \"member\" DROP COLUMN \"role\""),
        FORMAT_ONE_ROLE_COLUMN,
    ),
    (
        FormatOneReshape::Drop("ALTER TABLE \"member\" DROP COLUMN \"permissions\""),
        FORMAT_ONE_PERMISSIONS_COLUMN,
    ),
];

/// One statement of the reshape of a format 1 `member` table, as
/// [`OrganizationStore::format_one_reshape`] finds it still to run: a column to add, which runs
/// where the column is missing, or one to drop, which runs where it stands.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FormatOneReshape {
    Add(&'static str),
    Drop(&'static str),
}

/// A `member` row of an organization its owner's upgrade has not finished with (effort 838,
/// tickets 22 and 23), as it lies, judged by nobody yet: the vault and the keys, the certificate and
/// signature it carries, and whichever of the two formats' authority columns the table still has.
///
/// **Every authority column is optional**, because an upgrade cut short leaves the table part way
/// between the two shapes: the role word and the mask gone while the row still carries the
/// format 1 signature over them, or the row already written again in this format.
#[derive(Clone, Debug)]
pub struct FormatOneMemberRow {
    pub id: String,
    pub username_sealed: Vec<u8>,
    pub vault: Vault,
    pub signing_public_key: [u8; VERIFYING_KEY_BYTES],
    pub sealed_content_key: Vec<u8>,
    /// `owner`, `administrator`, `member` or `removed`, where the column still stands.
    pub role: Option<String>,
    /// the seven acts of format 1, one bit each, where the column still stands.
    pub permissions: Option<i64>,
    /// this format's role, override and removal, where the columns have been added: the defaults
    /// until the row is written again, and what the upgrade wrote after.
    pub role_id: Option<String>,
    pub override_mask: Option<i64>,
    pub removed_at: Option<i64>,
    pub must_change_password: bool,
    pub created_at: i64,
    pub updated_at: i64,
    pub session_epoch: i64,
    pub owner_seed_sealed: Option<Vec<u8>>,
    pub certificate_id: String,
    pub signature: Vec<u8>,
}

/// Every signed row of a format 1 organization, as it lies: what its owner's upgrade judges and
/// carries forward ([`OrganizationStore::format_one_directory`]).
#[derive(Clone, Debug)]
pub struct FormatOneDirectory {
    /// format 1's certificates, while the table stands: empty once an upgrade has dropped it.
    pub certificates: Vec<FormatOneCertificate>,
    pub members: Vec<FormatOneMemberRow>,
    pub workspaces: Vec<SignedRow<WorkspaceRecord>>,
    pub grants: Vec<SignedRow<GrantRecord>>,
    pub invitations: Vec<SignedRow<InvitationRecord>>,
    pub mark: Option<SignedRow<MarkRecord>>,
}

impl OrganizationStore {
    /// Record that this organization is of this build's format: written by the first run beside
    /// the schema, and by the owner's upgrade last of all.
    ///
    /// **The table is created where it is missing**, since the row is what an upgrade writes last
    /// and a `format` table somebody dropped would otherwise fail that step at every sign-in
    /// (effort 838, ticket 25).
    pub async fn write_format(&self) -> Result<(), Error> {
        self.write_format_version(FORMAT_VERSION).await
    }

    /// Record that this organization is of format `version`: the row the owner's upgrade writes
    /// last, naming the format its walk ended at (`upgrade/format/runner/`, ticket 26), which is
    /// this build's except where a test walks a list of its own. The table is created where it is
    /// missing, as [`OrganizationStore::write_format`] says.
    pub async fn write_format_version(&self, version: i64) -> Result<(), Error> {
        self.connection.execute(SCHEMA[0], ()).await?;
        self.connection
            .execute(
                "INSERT OR REPLACE INTO \"format\" (\"id\", \"version\") VALUES (?, ?)",
                vec![
                    turso::Value::Text(FORMAT_ID.to_string()),
                    turso::Value::Integer(version),
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

    /// The organization's floors as an upgrade recorded them, `(level, read, write)`, or `None`
    /// where none is recorded: no `organization_floor` table, or one with no row, which is every
    /// organization no change of format declared after effort 857 has reached
    /// ([`OrganizationStore::floors`] reads the format then).
    ///
    /// Read against the tables the database reports, so it never fails on a table it does not
    /// have, and writes nothing.
    pub async fn floor_recorded(&self) -> Result<Option<(i64, i64, i64)>, Error> {
        if !self
            .tables()
            .await?
            .iter()
            .any(|table| table == ORGANIZATION_FLOOR_TABLE)
        {
            return Ok(None);
        }

        let mut rows = self
            .connection
            .query(
                &format!(
                    "SELECT \"level\", \"read\", \"write\" FROM \"{ORGANIZATION_FLOOR_TABLE}\" \
                     WHERE \"id\" = ? LIMIT 1"
                ),
                vec![turso::Value::Text(ORGANIZATION_FLOOR_ID.to_string())],
            )
            .await?;

        match rows.next().await? {
            Some(row) => Ok(Some((
                integer(&row, 0)?,
                integer(&row, 1)?,
                integer(&row, 2)?,
            ))),
            None => Ok(None),
        }
    }

    /// The format the organization is in as it stands, which its owner's upgrade walks the changes
    /// of format from (ticket 26), where the upgrade ships format `shipped`: 1 wherever anything of
    /// format 1 is left, and otherwise the `format` row, read as no lower than 2.
    ///
    /// **A row beside format 1's table or columns is not believed** (ticket 25): the row is
    /// unsigned, and that directory is format 1, part way through its upgrade or written over.
    /// **And one carrying nothing of format 1 with no row is of the shipped format**: an upgrade
    /// that wrote everything but the row, or an organization whose row somebody took away, and the
    /// row is all that is left to write, which is what [`OrganizationStore::carries_format_one`]
    /// already says of it.
    ///
    /// **Nor is a row below 2 believed where nothing of format 1 is left** (ticket 29): format 1
    /// wrote no row, so whatever a member wrote there, the directory is at least format 2, and the
    /// owner's next sign-in writes the row back as it did before the changes were split. Read as
    /// written, it made format 1's change due over a directory holding a root, which refuses it,
    /// and everybody was locked out.
    ///
    /// **And one with no row, or a row below 2, and no `workspace_override` table is format 2**
    /// (effort 838, ticket 53): format 3 adds that table and nothing else, so a directory without
    /// it whose row is gone has not been through format 3's change, which creates it where it is
    /// missing and runs again with nothing lost. With the table it is the shipped format, as
    /// before, and only its row is written.
    pub async fn format_as_it_stands(&self, shipped: i64) -> Result<i64, Error> {
        if self.carries_format_one().await? {
            return Ok(1);
        }

        match self.format().await? {
            Some(version) if version >= FIRST_FORMAT_WITH_A_ROW => Ok(version),
            _ if !self
                .tables()
                .await?
                .iter()
                .any(|table| table == TABLES[FORMAT_TWO_TABLES]) =>
            {
                Ok(shipped.min(FIRST_FORMAT_WITH_A_ROW))
            }
            _ => Ok(shipped),
        }
    }

    /// The organization's floors (effort 857, requirements 2 and 13): its `organization_floor` row
    /// where an upgrade wrote one, and otherwise its `format` row, read as floors equal to it
    /// ([`Floors::legacy`]). `None` where it has no format row, which is an organization of format 1
    /// or one whose upgrade was cut short, and [`OrganizationStore::refuse_another_format`] answers
    /// that.
    ///
    /// Reads and writes nothing. *It was `upgrade/floor.rs`'s `organization` until ticket 04.*
    pub async fn floors(&self) -> Result<Option<Floors>, Error> {
        if let Some((level, read, write)) = self.floor_recorded().await? {
            return Ok(Some(Floors {
                level: floor::number(level)?,
                read: floor::number(read)?,
                write: floor::number(write)?,
            }));
        }

        self.format()
            .await?
            .map(|format| floor::number(format).map(Floors::legacy))
            .transpose()
    }

    /// Judge this build against the organization's floors, before anything else is read from it or
    /// written to it, and keep the verdict on the store (effort 838, requirement 11; effort 857,
    /// requirement 2 and ticket 04).
    ///
    /// **Three answers where there were two.** Below the read floor the organization is refused by
    /// name as `OrganizationNewer`, which now means exactly that: a newer version of rentable
    /// upgraded it past what this one reads, and this application is updated. At or above the read
    /// floor and below the write floor it is let through as [`Standing::ReadOnly`]: every way in
    /// reads it and writes nothing, and the acts refuse their writes (ticket 05). At or above both
    /// it is [`Standing::Writable`], whatever level the additions took it to. An organization
    /// recorded at a format above this build's with no floor record reads as floors at that format
    /// ([`Floors::legacy`]), so it is refused, exactly as every build before effort 857 refused it.
    ///
    /// **An organization with no format, or an earlier one, waits for its owner.** It was made by
    /// an earlier version of the application, and its owner's machine upgrades it at their first
    /// sign-in, resume or connect on this one, online (tickets 22 and 23); anybody else meeting it
    /// first waits for that, and so does everybody meeting an upgrade cut short, which the owner's
    /// next sign-in, resume or connect finishes. Its owner meets this only where the upgrade did
    /// not run.
    ///
    /// **A `format` row beside format 1's table or columns is not this format** (ticket 25): the
    /// row is unsigned, and one written into an organization still in format 1's shape would
    /// otherwise have every reader take it for this one and fail on a column it lacks. It reads as
    /// unfinished, which is what it is.
    ///
    /// **Every way in asks it after its pull** (effort 857, ticket 04), since a pull is what brings
    /// a floor another machine raised, and asks [`OrganizationStore::standing`] before any write of
    /// its own. Reads the format, the floors and the member table's shape and nothing else, so a
    /// refused organization is left exactly as it was found.
    pub async fn refuse_another_format(&self) -> Result<Standing, Error> {
        let judged = self.judged().await;

        self.hold(match &judged {
            Ok(standing) => *standing,
            Err(Error::Refused {
                reason: RefusalReason::OrganizationNewer,
                ..
            }) => Standing::Unreadable,
            // an organization waiting for its owner is read by nothing of this format and written
            // by nothing either, until the owner's upgrade.
            Err(_) => Standing::ReadOnly,
        });

        judged
    }

    /// [`OrganizationStore::refuse_another_format`]'s verdict, before it is kept.
    async fn judged(&self) -> Result<Standing, Error> {
        let format = self.format().await?;
        let steps = self.format_steps;
        let known = steps.known();

        // a format behind this build's by changes declared after 857 alone is this build's to
        // read, since those leave the row where it was (ticket 03); one behind a change shipped
        // before 857 waits for its owner's machine, which runs it on open as it always did.
        match format {
            Some(version) if version > i64::from(known) => {}
            Some(version)
                if version >= i64::from(steps.settled()) && !self.carries_format_one().await? => {}
            _ => return Err(waits_for_its_owner()),
        }

        let floors = self.floors().await?.ok_or_else(waits_for_its_owner)?;

        match floors.standing(known) {
            Standing::Unreadable => Err(Error::refused(
                RefusalReason::OrganizationNewer,
                format!(
                    "the organization was made by a newer version of rentable (format {}, which a \
                     version knowing format {} reads), and this version knows format {known}. \
                     update rentable to open it; nothing was read or written",
                    format.unwrap_or_default(),
                    floors.read
                ),
            )),
            standing => Ok(standing),
        }
    }

    /// Refuse an organization this build may not write, where the way in cannot go on without
    /// writing to it: a connect, which registers the machine, and a link opened, which spends its
    /// row and reseals a vault (effort 857, ticket 04). Below the read floor it is
    /// [`OrganizationStore::refuse_another_format`]'s refusal; below the write floor it is
    /// `OrganizationReadOnlyByVersion`, and nothing was written.
    pub async fn refuse_unwritable(&self) -> Result<(), Error> {
        match self.refuse_another_format().await? {
            Standing::Writable => Ok(()),
            _ => Err(Error::refused(
                RefusalReason::OrganizationReadOnlyByVersion,
                "a newer version of rentable upgraded the organization, and this version can read \
                 it but not write to it. update rentable to make changes; nothing was written",
            )),
        }
    }

    /// Record the organization's floors as the explicit upgrade will (effort 857, ticket 07), for a
    /// test raising them past this build: the table where it is missing, and its one row.
    #[cfg(test)]
    pub(crate) async fn record_floors(&self, level: i64, read: i64, write: i64) {
        self.connection
            .execute(
                &format!(
                    "CREATE TABLE IF NOT EXISTS \"{ORGANIZATION_FLOOR_TABLE}\" (\
                     \"id\" TEXT PRIMARY KEY NOT NULL, \"level\" INTEGER NOT NULL, \
                     \"read\" INTEGER NOT NULL, \"write\" INTEGER NOT NULL, \
                     \"written_at\" INTEGER NOT NULL)"
                ),
                (),
            )
            .await
            .expect("the floor table");
        self.connection
            .execute(
                &format!(
                    "INSERT OR REPLACE INTO \"{ORGANIZATION_FLOOR_TABLE}\" \
                     (\"id\", \"level\", \"read\", \"write\", \"written_at\") \
                     VALUES (?, ?, ?, ?, 0)"
                ),
                vec![
                    turso::Value::Text(ORGANIZATION_FLOOR_ID.to_string()),
                    turso::Value::Integer(level),
                    turso::Value::Integer(read),
                    turso::Value::Integer(write),
                ],
            )
            .await
            .expect("the floor row");
    }

    /// Record the organization's floors, `floors`, over whatever its one row said: what
    /// [`OrganizationStore::complete_schema`] writes once an addition declared after effort 857
    /// takes the organization past the level recorded (ticket 03), and the explicit upgrade inside
    /// its transaction (ticket 07). The table is made where this replica lacks it.
    pub(crate) async fn record_organization_floor(
        &self,
        floors: Floors,
        now: i64,
    ) -> Result<(), Error> {
        self.connection.execute(ORGANIZATION_FLOOR, ()).await?;
        self.connection
            .execute(
                &format!(
                    "INSERT OR REPLACE INTO \"{ORGANIZATION_FLOOR_TABLE}\" \
                     (\"id\", \"level\", \"read\", \"write\", \"written_at\") \
                     VALUES (?, ?, ?, ?, ?)"
                ),
                vec![
                    turso::Value::Text(ORGANIZATION_FLOOR_ID.to_string()),
                    turso::Value::Integer(i64::from(floors.level)),
                    turso::Value::Integer(i64::from(floors.read)),
                    turso::Value::Integer(i64::from(floors.write)),
                    turso::Value::Integer(now),
                ],
            )
            .await?;

        Ok(())
    }

    /// Where this build stood at the last verdict ([`OrganizationStore::refuse_another_format`]):
    /// what a way in and the heartbeat ask before they write anything of their own.
    pub fn standing(&self) -> Standing {
        self.standing
            .lock()
            .map(|standing| *standing)
            .unwrap_or(Standing::Unreadable)
    }

    /// Hold the replica's connection to the last verdict where it says this build may not write
    /// the organization, so the engine refuses every write on it and serves every read (effort 857,
    /// ticket 05; `database::floor::hold_writes` says what was measured). Answers whether it held
    /// it, which is what says [`OrganizationStore::release_writes`] is owed.
    ///
    /// **Held for one act and released after it** (`act::as_member`), rather than for as long as
    /// the verdict stands: an organization waiting for its owner is read-only by the same verdict,
    /// and the owner's own upgrade writes to it through this connection.
    pub(crate) async fn hold_writes(&self) -> Result<bool, Error> {
        let standing = self.standing();

        if standing == Standing::Writable {
            return Ok(false);
        }

        floor::hold_writes(&self.connection, standing).await?;

        Ok(true)
    }

    /// Hold the replica's connection from every write for one act whatever the verdict, as
    /// [`OrganizationStore::hold_writes`] holds it below the write floor: while another member's
    /// upgrade of the organization runs (effort 857, ticket 19), so the act reads and writes
    /// nothing. Let go of by [`OrganizationStore::release_writes`].
    pub(crate) async fn hold_every_write(&self) -> Result<(), Error> {
        floor::hold_writes(&self.connection, Standing::ReadOnly).await
    }

    /// Let the replica's connection write again, after an act [`OrganizationStore::hold_writes`]
    /// held. A pragma that cannot be set is logged rather than raised: the act has answered.
    pub(crate) async fn release_writes(&self) {
        if let Err(error) = floor::hold_writes(&self.connection, Standing::Writable).await {
            crate::diagnostics::warn("organization.writes.notReleased")
                .with("error", error.to_string())
                .write();
        }
    }

    /// Keep `standing` as the verdict this store answers with.
    fn hold(&self, standing: Standing) {
        if let Ok(mut held) = self.standing.lock() {
            *held = standing;
        }
    }

    /// Whether this is an organization of an earlier format: a `member` table, and no format row
    /// or an earlier one, or this format's row beside format 1's table or columns.
    ///
    /// **That covers two shapes, and both wait for the owner** (effort 838, ticket 23). One is
    /// format 1 as every build before effort 838 wrote it. The other is an upgrade cut short, on
    /// this machine or on the remote this machine pulled: the table part way between the two
    /// shapes, or everything written again but the `format` row, which is written last. Neither is
    /// this format, and neither is anything a stranger made, so both are the owner's to upgrade or
    /// to finish ([`OrganizationStore::carries_format_one`] tells them apart), and everybody else
    /// is told the organization waits for its owner.
    ///
    /// *It was "no format row and a `member` table still carrying the role word" until ticket 23:
    /// a remote left with part of the upgrade matched neither format, so everybody was refused,
    /// the owner included, and nothing could finish it.*
    ///
    /// *And it was "no format row and a `member` table" until ticket 25: the row is unsigned, and
    /// one written into a remote still in format 1's shape had the owner conclude that another of
    /// their machines had finished, and every sign-in then failed on a column the table lacked.*
    pub async fn is_older(&self) -> Result<bool, Error> {
        self.is_older_than(i64::from(self.format_steps.settled()))
            .await
    }

    /// Whether this is an organization of a format earlier than `shipped`, as
    /// [`OrganizationStore::is_older`] says of this build's: what the owner's upgrade asks, since
    /// it counts the format it ships from the changes it is handed (ticket 29).
    pub async fn is_older_than(&self, shipped: i64) -> Result<bool, Error> {
        if self.columns_of("member").await?.is_empty() {
            return Ok(false);
        }

        match self.format().await? {
            Some(version) if version > shipped => Ok(false),
            Some(version) if version == shipped => self.carries_format_one().await,
            _ => Ok(true),
        }
    }

    /// Whether anything of format 1 is still here: its certificate table, or the role word or the
    /// mask on the member table. An older organization carrying none of them is one whose upgrade
    /// wrote everything but the `format` row, or one of this format whose row somebody deleted,
    /// and either is finished by writing the row and nothing else.
    pub async fn carries_format_one(&self) -> Result<bool, Error> {
        let columns = self.columns_of("member").await?;

        Ok(self
            .tables()
            .await?
            .iter()
            .any(|table| table == FORMAT_ONE_CERTIFICATE_TABLE)
            || columns.iter().any(|column| {
                column == FORMAT_ONE_ROLE_COLUMN || column == FORMAT_ONE_PERMISSIONS_COLUMN
            }))
    }

    /// Every member row of an organization of an earlier format, as it lies, with nothing judged,
    /// read with whichever authority columns the table has now.
    ///
    /// **Two readers, and neither believes anything here.** The sign-in, the resume and the
    /// connect read it to find the vault a password or a remembered key opens, the first two before
    /// a pull, which is the reason [`OrganizationStore::members_unverified`] gives for reading
    /// first; the vault is all they take from it, and the organization key it derives is compared
    /// with the key the machine pinned, or on the connect with the organization row's. The upgrade
    /// reads it after the pull and judges every row it carries forward, under
    /// the rules of the format its signature was made in, dropping the rest.
    pub async fn format_one_members(&self) -> Result<Vec<FormatOneMemberRow>, Error> {
        let columns = self.columns_of("member").await?;
        let has = |column: &str| columns.iter().any(|name| name == column);
        // the base columns first, at fixed places, and then whichever of the five authority
        // columns stand, each at the place it lands.
        let mut select = vec![
            "\"id\"",
            "\"username_sealed\"",
            "\"public_key\"",
            "\"signing_public_key\"",
            "\"sealed_secret_key\"",
            "\"sealed_content_key\"",
            "\"kdf_salt\"",
            "\"kdf_params\"",
            "\"must_change_password\"",
            "\"certificate_id\"",
            "\"signature\"",
            "\"created_at\"",
            "\"updated_at\"",
            "\"session_epoch\"",
            "\"owner_seed_sealed\"",
        ];
        let mut place = |column: &'static str, quoted: &'static str| {
            has(column).then(|| {
                select.push(quoted);
                select.len() - 1
            })
        };
        let role = place(FORMAT_ONE_ROLE_COLUMN, "\"role\"");
        let permissions = place(FORMAT_ONE_PERMISSIONS_COLUMN, "\"permissions\"");
        let role_id = place("role_id", "\"role_id\"");
        let override_mask = place("override", "\"override\"");
        let removed_at = place("removed_at", "\"removed_at\"");
        let mut rows = self
            .connection
            .query(
                &format!(
                    "SELECT {} FROM \"member\" ORDER BY \"created_at\", \"id\"",
                    select.join(", ")
                ),
                (),
            )
            .await?;
        let mut members = Vec::new();

        while let Some(row) = rows.next().await? {
            members.push(FormatOneMemberRow {
                id: text(&row, 0)?,
                username_sealed: blob(&row, 1)?,
                vault: Vault {
                    public_key: fixed::<PUBLIC_KEY_BYTES>(&row, 2, "public_key")?,
                    sealed_secret_key: blob(&row, 4)?,
                    kdf_salt: fixed::<KDF_SALT_BYTES>(&row, 6, "kdf_salt")?,
                    kdf_params: KdfParams::parse(&text(&row, 7)?)?,
                },
                signing_public_key: fixed::<VERIFYING_KEY_BYTES>(&row, 3, "signing_public_key")?,
                sealed_content_key: blob(&row, 5)?,
                must_change_password: integer(&row, 8)? != 0,
                certificate_id: text(&row, 9)?,
                signature: blob(&row, 10)?,
                created_at: integer(&row, 11)?,
                updated_at: integer(&row, 12)?,
                session_epoch: integer(&row, 13)?,
                owner_seed_sealed: nullable_blob(&row, 14)?,
                role: role.map(|index| text(&row, index)).transpose()?,
                permissions: permissions.map(|index| integer(&row, index)).transpose()?,
                role_id: role_id.map(|index| text(&row, index)).transpose()?,
                override_mask: override_mask
                    .map(|index| integer(&row, index))
                    .transpose()?,
                removed_at: match removed_at {
                    Some(index) => nullable_integer(&row, index)?,
                    None => None,
                },
            });
        }

        Ok(members)
    }

    /// Every signed row of an organization of an earlier format, as it lies, with format 1's
    /// certificates while their table stands: what the upgrade judges and carries forward. This
    /// format's certificates, where an upgrade cut short already wrote some, are
    /// [`OrganizationStore::chain_rows`].
    pub async fn format_one_directory(&self) -> Result<FormatOneDirectory, Error> {
        let tables = self.tables().await?;

        // the mark arrived with effort 835, so an organization a build before it made has no
        // table for it until a pull there completed the schema.
        let mark = if tables.iter().any(|table| table == "mark") {
            self.mark_row().await?
        } else {
            None
        };

        Ok(FormatOneDirectory {
            certificates: self.format_one_certificates().await?,
            members: self.format_one_members().await?,
            workspaces: self.workspace_rows().await?,
            grants: self.grant_rows().await?,
            invitations: self.invitation_rows().await?,
            mark,
        })
    }

    /// Format 1's certificates as they lie, while their table stands, and none once it is gone.
    pub async fn format_one_certificates(&self) -> Result<Vec<FormatOneCertificate>, Error> {
        let mut certificates = Vec::new();

        if self
            .tables()
            .await?
            .iter()
            .any(|table| table == FORMAT_ONE_CERTIFICATE_TABLE)
        {
            let mut rows = self
                .connection
                .query(
                    "SELECT \"id\", \"member_id\", \"signing_public_key\", \
                            \"signature_by_organization_key\", \"issued_at\", \"revoked_at\" \
                     FROM \"administrator_certificate\" ORDER BY \"id\"",
                    (),
                )
                .await?;

            while let Some(row) = rows.next().await? {
                certificates.push(FormatOneCertificate {
                    id: text(&row, 0)?,
                    member_id: text(&row, 1)?,
                    signing_public_key: fixed::<VERIFYING_KEY_BYTES>(
                        &row,
                        2,
                        "signing_public_key",
                    )?,
                    signature_by_organization_key: blob(&row, 3)?,
                    issued_at: text(&row, 4)?,
                    revoked_at: nullable_text(&row, 5)?,
                });
            }
        }

        Ok(certificates)
    }

    /// This format's certificates and revocations, where an upgrade cut short already created
    /// their tables, and none where it has not: what a row it already signed again is judged by.
    pub async fn chain_rows_if_any(&self) -> Result<(Vec<Certificate>, Vec<Revocation>), Error> {
        let tables = self.tables().await?;

        if ["certificate", "revocation"]
            .iter()
            .all(|wanted| tables.iter().any(|table| table == wanted))
        {
            self.chain_rows().await
        } else {
            Ok((Vec::new(), Vec::new()))
        }
    }

    /// This format's role rows as they lie, verified by nobody, where the `role` table stands, and
    /// none where it does not: what the owner's upgrade judges a member of this format by, a
    /// custom role's holder included (effort 838, ticket 25).
    pub async fn role_rows_if_any(&self) -> Result<Vec<SignedRow<RoleRecord>>, Error> {
        if !self.tables().await?.iter().any(|table| table == "role") {
            return Ok(Vec::new());
        }

        Ok(self
            .role_rows()
            .await?
            .into_iter()
            .map(|(certificate_id, signature, record)| SignedRow {
                record,
                certificate_id,
                signature,
            })
            .collect())
    }

    /// Every succession where the table stands, and none where it does not: an organization a
    /// build before effort 828 made has no such table until a pull there completed the schema,
    /// and the upgrade writes nothing to complete it before it has judged the rest.
    pub async fn successions_if_any(&self) -> Result<Vec<SuccessionRecord>, Error> {
        if self
            .tables()
            .await?
            .iter()
            .any(|table| table == "succession")
        {
            self.successions().await
        } else {
            Ok(Vec::new())
        }
    }

    /// What is still to run of the reshape of a format 1 `member` table, in order: each column
    /// added only where it is missing, and each dropped only where it stands, so an upgrade cut
    /// short part way through is finished without a statement run twice.
    ///
    /// **Measured through a sync connection on 2026-09-26, against a live account, before
    /// anything relied on it** (effort 838, ticket 22). `ALTER TABLE ... ADD COLUMN` and
    /// `ALTER TABLE ... DROP COLUMN` both replicate: a second replica pulled the altered table and
    /// the rows written into it, a third bootstrapped from the remote read the same, and a write
    /// the second made in the new shape reached the first. `DROP TABLE` replicates too. **What does
    /// not is a row change captured under a column set that a later statement in the same push
    /// drops**: an `UPDATE` made between the add and the drop, pushed with both, fails the push
    /// with `Number of arguments mismatch: expected 2, got 3`, and the remote is left with part of
    /// it. So every statement here runs before the first row is written, the whole upgrade is one
    /// transaction and one push, and the upgrade runs only once what the old build left captured
    /// has been pushed (ticket 23). `database/test/workspace.rs` records the drop-and-rename of
    /// 2026-08-20 that does not replicate, which is why nothing here renames.
    ///
    /// **Added before dropped, and each added with a default**: the writer names its columns and
    /// omits the two it drops, which are `NOT NULL` with no default and would refuse its insert
    /// while they stood, and a `NOT NULL` column can only be added with one.
    pub async fn format_one_reshape(&self) -> Result<Vec<FormatOneReshape>, Error> {
        let columns = self.columns_of("member").await?;
        let stands = |column: &str| columns.iter().any(|name| name == column);

        Ok(FORMAT_ONE_RESHAPE
            .iter()
            .filter(|(statement, column)| match statement {
                FormatOneReshape::Add(_) => !stands(column),
                FormatOneReshape::Drop(_) => stands(column),
            })
            .map(|(statement, _)| *statement)
            .collect())
    }

    /// Run one statement of the reshape [`OrganizationStore::format_one_reshape`] found still to
    /// run.
    pub async fn reshape_format_one(&self, statement: FormatOneReshape) -> Result<(), Error> {
        let (FormatOneReshape::Add(sql) | FormatOneReshape::Drop(sql)) = statement;

        self.connection.execute(sql, ()).await?;

        Ok(())
    }

    /// Drop format 1's certificate table, where it still stands: the upgrade's last statement but
    /// the `format` row, since nothing of format 1 can be judged once it is gone.
    pub async fn drop_format_one_certificates(&self) -> Result<(), Error> {
        self.connection
            .execute("DROP TABLE IF EXISTS \"administrator_certificate\"", ())
            .await?;

        Ok(())
    }

    /// Remove a member row the upgrade could not carry: one that verified under the rules of
    /// neither format, and so would refuse every read of the directory in this one.
    pub async fn delete_format_one_member(&self, id: &str) -> Result<(), Error> {
        self.connection
            .execute(
                "DELETE FROM \"member\" WHERE \"id\" = ?",
                vec![turso::Value::Text(id.to_string())],
            )
            .await?;

        Ok(())
    }
}

/// The refusal of an organization an earlier version made, to anybody but its owner, and to the
/// owner where the upgrade could not run (effort 838, ticket 22): it waits for its owner to open
/// it in this version. Nothing was written to the organization.
pub fn waits_for_its_owner() -> Error {
    Error::refused(
        RefusalReason::OrganizationOlder,
        format!(
            "an earlier version of rentable made this organization, and this version reads format \
             {FORMAT_VERSION}. it waits for its owner to open it in this version, which upgrades \
             it; nothing was changed"
        ),
    )
}

#[cfg(test)]
mod tests {
    use crate::database::floor::{Floors, Standing};
    use crate::error::{Error, RefusalReason};

    use super::{FORMAT_VERSION, OrganizationStore};

    async fn store(name: &str) -> OrganizationStore {
        let path = crate::test::scratch(name).join("org.db");

        OrganizationStore::open(crate::clock::System::shared(), &path, None, || async {
            Err(turso::Error::Misuse("no remote".into()))
        })
        .await
        .expect("a store")
    }

    /// An organization of this build's format, as a first run leaves it.
    async fn of_this_format(name: &str) -> OrganizationStore {
        let store = store(name).await;

        store.install_schema().await.expect("the schema");
        store.write_format().await.expect("the format row");

        store
    }

    /// Every table, and every row of each, as the replica holds them: what "writes nothing" is
    /// held to.
    async fn everything(store: &OrganizationStore) -> Vec<(String, Vec<String>)> {
        let connection = store.connection();
        let mut names = Vec::new();
        let mut rows = connection
            .query(
                "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
                (),
            )
            .await
            .expect("the tables");

        while let Some(row) = rows.next().await.expect("a table") {
            if let turso::Value::Text(name) = row.get_value(0).expect("a name") {
                names.push(name);
            }
        }

        let mut everything = Vec::new();

        for name in names {
            let mut rows = connection
                .query(&format!("SELECT * FROM \"{name}\""), ())
                .await
                .expect("the rows");
            let mut held = Vec::new();

            while let Some(row) = rows.next().await.expect("a row") {
                held.push(format!(
                    "{:?}",
                    (0..row.column_count())
                        .map(|index| row.get_value(index).expect("a value"))
                        .collect::<Vec<_>>()
                ));
            }

            everything.push((name, held));
        }

        everything
    }

    fn reason_of<T: std::fmt::Debug>(result: Result<T, Error>) -> RefusalReason {
        match result {
            Err(Error::Refused { reason, .. }) => reason,
            other => panic!("not a refusal: {other:?}"),
        }
    }

    /// **Ticket 01's fifth criterion, on an organization.** An organization of this build's format
    /// with no floor record reads every floor at its format, and nothing in it changes.
    #[tokio::test]
    async fn an_organization_with_no_floor_record_reads_its_format_and_writes_nothing() {
        let store = of_this_format("floor-organization").await;
        let before = everything(&store).await;

        assert_eq!(
            store.floors().await.expect("the floors"),
            Some(Floors::legacy(FORMAT_VERSION as u32))
        );
        assert_eq!(everything(&store).await, before);
    }

    /// An organization with no format row, format 1's or one cut short, has no floors of its own,
    /// and the read leaves it as it was.
    #[tokio::test]
    async fn an_organization_with_no_format_row_has_no_floors_of_its_own() {
        let store = store("floor-no-format").await;
        let before = everything(&store).await;

        assert_eq!(store.floors().await.expect("the floors"), None);
        assert_eq!(everything(&store).await, before);
    }

    /// An organization an upgrade recorded floors in reads them rather than its format.
    #[tokio::test]
    async fn an_organization_with_a_floor_record_reads_it() {
        let store = of_this_format("floor-recorded").await;

        store.record_floors(5, 3, 4).await;

        assert_eq!(
            store.floors().await.expect("the floors"),
            Some(Floors {
                level: 5,
                read: 3,
                write: 4
            })
        );
    }

    /// **Ticket 04's first criterion, on the organization.** The verdict is the floors': at or
    /// above both it is writable whatever the level, below the write floor it is let through
    /// read-only, and below the read floor it is refused as `OrganizationNewer`. Each verdict is
    /// kept on the store, and judging writes nothing.
    #[tokio::test]
    async fn the_organizations_verdict_is_its_floors() {
        let known = FORMAT_VERSION;
        let cases = [
            // (level, read, write, the verdict)
            (known, known, known, Ok(Standing::Writable)),
            (known + 2, known, known, Ok(Standing::Writable)),
            (known + 1, known, known + 1, Ok(Standing::ReadOnly)),
            (
                known + 1,
                known + 1,
                known + 1,
                Err(RefusalReason::OrganizationNewer),
            ),
        ];

        for (index, (level, read, write, expected)) in cases.into_iter().enumerate() {
            let store = of_this_format(&format!("floor-verdict-{index}")).await;

            store.record_floors(level, read, write).await;

            let before = everything(&store).await;
            let judged = store.refuse_another_format().await;

            match expected {
                Ok(standing) => {
                    assert_eq!(judged.expect("judged"), standing);
                    assert_eq!(store.standing(), standing);
                }
                Err(reason) => {
                    assert_eq!(reason_of(judged), reason);
                    assert_eq!(store.standing(), Standing::Unreadable);
                }
            }

            assert_eq!(everything(&store).await, before, "judging wrote");
        }
    }

    /// A format above this build's with no floor record is refused, as every build before effort
    /// 857 refused it: the legacy number is its own floor.
    #[tokio::test]
    async fn a_newer_format_with_no_floor_record_is_below_the_read_floor() {
        let store = of_this_format("floor-newer-format").await;

        store
            .connection()
            .execute("UPDATE \"format\" SET \"version\" = \"version\" + 1", ())
            .await
            .expect("a newer format");

        assert_eq!(
            reason_of(store.refuse_another_format().await),
            RefusalReason::OrganizationNewer
        );
        assert_eq!(store.standing(), Standing::Unreadable);
    }

    /// A way in that has to write is refused below the write floor, by the version, and let
    /// through at it.
    #[tokio::test]
    async fn a_way_in_that_writes_is_refused_below_the_write_floor() {
        let store = of_this_format("floor-unwritable").await;

        store.refuse_unwritable().await.expect("writable");

        store
            .record_floors(FORMAT_VERSION + 1, FORMAT_VERSION, FORMAT_VERSION + 1)
            .await;

        assert_eq!(
            reason_of(store.refuse_unwritable().await),
            RefusalReason::OrganizationReadOnlyByVersion
        );
        assert_eq!(store.standing(), Standing::ReadOnly);

        store
            .record_floors(FORMAT_VERSION + 1, FORMAT_VERSION + 1, FORMAT_VERSION + 1)
            .await;

        assert_eq!(
            reason_of(store.refuse_unwritable().await),
            RefusalReason::OrganizationNewer
        );
    }
}
