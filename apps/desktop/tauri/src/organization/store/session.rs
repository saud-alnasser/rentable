//! The `machine_link`, `machine`, `machine_sign_out` and `machine_name` tables: the links that
//! connect a machine to an account, the registry of machines holding the organization, the
//! sign-outs of one machine another one wrote, and the name each machine gives itself (effort 846,
//! requirements 9 to 11). None of them carries a signature.

use crate::{error::Error, organization::authority::VERIFYING_KEY_BYTES};

use super::{MemberRecord, OrganizationStore, integer, nullable_blob, text};

pub(super) const MACHINE_LINK: &str = "CREATE TABLE IF NOT EXISTS \"machine_link\" (\
        \"id\" TEXT PRIMARY KEY NOT NULL, \
        \"member_id\" TEXT NOT NULL, \
        \"expires_at\" INTEGER NOT NULL, \
        \"consumed_at\" INTEGER, \
        \"created_at\" INTEGER NOT NULL)";

pub(super) const MACHINE: &str = "CREATE TABLE IF NOT EXISTS \"machine\" (\
        \"id\" TEXT PRIMARY KEY NOT NULL, \
        \"member_id\" TEXT, \
        \"seen_at\" INTEGER NOT NULL, \
        \"created_at\" INTEGER NOT NULL)";

/// One row per machine and member that has been signed out on its own: a number only ever moved
/// on, and only by the member's other machines (effort 846, requirement 10).
///
/// **The machine it names never writes it**, which is what makes it hold against a machine that
/// is offline when it is ended: the replica merges per column with the last push winning, and a
/// machine that never writes the row cannot overwrite a sign-out it has not seen yet. A table of
/// its own rather than a column on `machine`, because every machine rewrites its own `machine`
/// row whole at launch and would erase a sign-out it had not read.
pub(super) const MACHINE_SIGN_OUT: &str = "CREATE TABLE IF NOT EXISTS \"machine_sign_out\" (\
        \"id\" TEXT PRIMARY KEY NOT NULL, \
        \"machine_id\" TEXT NOT NULL, \
        \"member_id\" TEXT NOT NULL, \
        \"epoch\" INTEGER NOT NULL, \
        \"at\" INTEGER NOT NULL)";

/// The name a machine gives itself, sealed under the content key as every name in the
/// organization is, and written by that machine alone (effort 846, requirement 11).
///
/// **The row standing is what says the machine runs a build that reads `machine_sign_out`**, so a
/// row is written even where the operating system gave no name, with `name` null. A machine with
/// no row is one that has not run this version, and is not signed out on its own.
pub(super) const MACHINE_NAME: &str = "CREATE TABLE IF NOT EXISTS \"machine_name\" (\
        \"id\" TEXT PRIMARY KEY NOT NULL, \
        \"name\" BLOB, \
        \"named_at\" INTEGER NOT NULL)";

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

/// A `machine_link` row: a link made for an account whose password is set, and whether it has been
/// spent.
///
/// **It carries no signature, and that is the accepted limit rather than an oversight** (effort
/// 828, requirement 3). Nothing a member writes on their own account is signed (effort 826,
/// requirement 6): a plain member held no certificate until effort 838, and since then no
/// certificate signs its own holder's row. This is the one row a plain member writes for
/// themselves. It is written under their own organization credential
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
/// row, and nothing a member writes on their own account is signed (effort 826, requirement 6;
/// since effort 838 because no certificate signs its own holder's row). It is written under the member's
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

/// A `machine_name` row: the name one machine gave itself, sealed under the content key, and
/// when (effort 846, requirement 11).
///
/// **Unsigned**, like [`MachineRecord`]: a rewritten name can only make a line in somebody's own
/// list wrong, and nothing reads it to decide anything but whether that machine reads its own
/// sign-out, which a deleted row makes the reader refuse rather than allow.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MachineNameRecord {
    /// the machine's own id, as [`MachineRecord::id`].
    pub id: String,
    /// the name, sealed under the content key; `None` where the operating system gave none.
    pub name_sealed: Option<Vec<u8>>,
    pub named_at: i64,
}

impl OrganizationStore {
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
            let machine = machine_of(&row)?;
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

    /// One machine's row in the registry, or `None` where it has none: what the heartbeat reads to
    /// learn when this machine last said it was here (effort 846, requirement 9).
    pub async fn machine(&self, id: &str) -> Result<Option<MachineRecord>, Error> {
        let mut rows = self
            .connection
            .query(
                "SELECT \"id\", \"member_id\", \"seen_at\", \"created_at\" FROM \"machine\" \
                 WHERE \"id\" = ?",
                vec![turso::Value::Text(id.to_string())],
            )
            .await?;

        match rows.next().await? {
            Some(row) => Ok(Some(machine_of(&row)?)),
            None => Ok(None),
        }
    }

    /// Every machine whose row names `member_id`, the one most lately seen first: the machines a
    /// member is signed in on, as their account section lists them (effort 846, requirement 9).
    ///
    /// **No presence window**, unlike [`OrganizationStore::connected_machines`]: a laptop closed
    /// for a month still holds a remembered key, and it is the machine its member most needs to
    /// sign out. A machine somebody signed out of, or that was signed out from elsewhere, names
    /// nobody and is not listed.
    pub async fn machines_of(&self, member_id: &str) -> Result<Vec<MachineRecord>, Error> {
        let mut rows = self
            .connection
            .query(
                "SELECT \"id\", \"member_id\", \"seen_at\", \"created_at\" FROM \"machine\" \
                 WHERE \"member_id\" = ? ORDER BY \"seen_at\" DESC, \"id\"",
                vec![turso::Value::Text(member_id.to_string())],
            )
            .await?;
        let mut machines = Vec::new();

        while let Some(row) = rows.next().await? {
            machines.push(machine_of(&row)?);
        }

        Ok(machines)
    }

    /// Take this member's name off one machine in the registry: what signing that machine out on
    /// its own leaves behind, so it leaves the list at once rather than when it next says it is
    /// here (effort 846, requirement 10). A row naming somebody else is left alone.
    pub async fn clear_member_from_machine(
        &self,
        machine_id: &str,
        member_id: &str,
    ) -> Result<(), Error> {
        self.connection
            .execute(
                "UPDATE \"machine\" SET \"member_id\" = NULL \
                 WHERE \"id\" = ? AND \"member_id\" = ?",
                vec![
                    turso::Value::Text(machine_id.to_string()),
                    turso::Value::Text(member_id.to_string()),
                ],
            )
            .await?;

        Ok(())
    }

    /// Take this member's name off every machine but `except`: what signing out every other
    /// machine leaves behind, so the list stops showing the machines it ended (effort 846,
    /// requirement 10).
    pub async fn clear_member_from_other_machines(
        &self,
        member_id: &str,
        except: &str,
    ) -> Result<(), Error> {
        self.connection
            .execute(
                "UPDATE \"machine\" SET \"member_id\" = NULL \
                 WHERE \"member_id\" = ? AND \"id\" <> ?",
                vec![
                    turso::Value::Text(member_id.to_string()),
                    turso::Value::Text(except.to_string()),
                ],
            )
            .await?;

        Ok(())
    }

    /// How far one machine has been signed out on its own for one member: the number another
    /// machine last moved on, or 0 where none ever did (effort 846, requirement 10).
    ///
    /// **A replica that does not hold the table yet answers 0**, which is one an earlier build
    /// pulled and this one has not pulled since: the table arrives with the next pull
    /// ([`OrganizationStore::pulled`]), and nothing in it can name this machine before then,
    /// because a machine is signed out on its own only once it has named itself, which needs the
    /// table on its own replica.
    pub async fn machine_signed_out(
        &self,
        machine_id: &str,
        member_id: &str,
    ) -> Result<i64, Error> {
        if !self.holds("machine_sign_out").await? {
            return Ok(0);
        }

        let mut rows = self
            .connection
            .query(
                "SELECT \"epoch\" FROM \"machine_sign_out\" WHERE \"id\" = ?",
                vec![turso::Value::Text(sign_out_id(machine_id, member_id))],
            )
            .await?;

        match rows.next().await? {
            Some(row) => integer(&row, 0),
            None => Ok(0),
        }
    }

    /// Sign one machine out for one member: the number on its row moved to `epoch`.
    ///
    /// **Unsigned**, as the member's `session_epoch` is, and for the same reason: it gates
    /// availability and never authority. **It moves the number on and never back**, as
    /// [`OrganizationStore::set_session_epoch`] does: the row keeps the greater of what it holds
    /// and what it is told, so a caller computing `+ 1` over a replica that has not pulled writes
    /// a number already reached rather than undoing a sign-out it did not see. Who may call it is
    /// `session::end_machine`, which is where this machine's own id is refused.
    pub async fn set_machine_signed_out(
        &self,
        machine_id: &str,
        member_id: &str,
        epoch: i64,
        now: i64,
    ) -> Result<(), Error> {
        let held = self.machine_signed_out(machine_id, member_id).await?;

        self.connection
            .execute(
                "INSERT OR REPLACE INTO \"machine_sign_out\" \
                 (\"id\", \"machine_id\", \"member_id\", \"epoch\", \"at\") \
                 VALUES (?, ?, ?, ?, ?)",
                vec![
                    turso::Value::Text(sign_out_id(machine_id, member_id)),
                    turso::Value::Text(machine_id.to_string()),
                    turso::Value::Text(member_id.to_string()),
                    turso::Value::Integer(held.max(epoch)),
                    turso::Value::Integer(now),
                ],
            )
            .await?;

        Ok(())
    }

    /// Every machine's name row: the machines that have run a build that reads
    /// `machine_sign_out`, each with its name sealed under the content key where it gave one
    /// (effort 846, requirement 11). A replica without the table yet answers none.
    pub async fn machine_names(&self) -> Result<Vec<MachineNameRecord>, Error> {
        if !self.holds("machine_name").await? {
            return Ok(Vec::new());
        }

        let mut rows = self
            .connection
            .query(
                "SELECT \"id\", \"name\", \"named_at\" FROM \"machine_name\" ORDER BY \"id\"",
                (),
            )
            .await?;
        let mut names = Vec::new();

        while let Some(row) = rows.next().await? {
            names.push(MachineNameRecord {
                id: text(&row, 0)?,
                name_sealed: nullable_blob(&row, 1)?,
                named_at: integer(&row, 2)?,
            });
        }

        Ok(names)
    }

    /// Write the name this machine gives itself, sealed by the caller, or `None` where the
    /// operating system gave none: the row standing is what says this machine reads its own
    /// sign-out (effort 846, requirement 10). **Unsigned**, like the rest of the registry. Only the
    /// machine itself writes its row, and only where the name changed, which is the caller's to
    /// judge, since a seal draws a fresh nonce and the bytes differ every time.
    pub async fn write_machine_name(
        &self,
        id: &str,
        name_sealed: Option<&[u8]>,
        now: i64,
    ) -> Result<(), Error> {
        self.connection
            .execute(
                "INSERT OR REPLACE INTO \"machine_name\" (\"id\", \"name\", \"named_at\") \
                 VALUES (?, ?, ?)",
                vec![
                    turso::Value::Text(id.to_string()),
                    name_sealed.map_or(turso::Value::Null, |sealed| {
                        turso::Value::Blob(sealed.to_vec())
                    }),
                    turso::Value::Integer(now),
                ],
            )
            .await?;

        Ok(())
    }

    /// Whether this replica holds `table`: the two tables effort 846 added are read only where
    /// they stand, since a replica an earlier build pulled gains them at its next pull.
    async fn holds(&self, table: &str) -> Result<bool, Error> {
        let mut rows = self
            .connection
            .query(
                "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
                vec![turso::Value::Text(table.to_string())],
            )
            .await?;

        Ok(rows.next().await?.is_some())
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
}

/// A `machine` row as every read here selects it: the id, who is on it, and the two moments.
fn machine_of(row: &turso::Row) -> Result<MachineRecord, Error> {
    Ok(MachineRecord {
        id: text(row, 0)?,
        member_id: match row.get_value(1)? {
            turso::Value::Text(value) => Some(value),
            _ => None,
        },
        seen_at: integer(row, 2)?,
        created_at: integer(row, 3)?,
    })
}

/// What one machine's sign-out for one member is keyed on: both, so a machine a second member
/// signs in on later is not signed out by what ended the first.
fn sign_out_id(machine_id: &str, member_id: &str) -> String {
    format!("{machine_id}:{member_id}")
}
