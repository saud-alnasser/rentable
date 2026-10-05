//! The `member` table: who belongs, their vault and keys, their role and override, and the
//! two unsigned writes a member makes on their own row; and the `member_lock` table beside it,
//! whether a member is locked (effort 851).

use std::{
    collections::HashMap,
    sync::atomic::{AtomicBool, Ordering},
};

use crate::{
    error::{Error, RefusalReason},
    organization::{
        authority::{Chain, Reading, VERIFYING_KEY_BYTES, sign},
        member::vault::{KDF_SALT_BYTES, KdfParams, PUBLIC_KEY_BYTES, Vault},
        role::permission,
    },
};

use super::{
    OrganizationStore, SignedRow, Signer, blob, fixed, integer, nullable_blob, nullable_integer,
    role::{effective_of, ranks_of_members, standings},
    signature::{member_authority, member_lock_authority, member_of},
    text,
};

pub(super) const MEMBER: &str = "CREATE TABLE IF NOT EXISTS \"member\" (\
        \"id\" TEXT PRIMARY KEY NOT NULL, \
        \"username_sealed\" BLOB NOT NULL, \
        \"public_key\" BLOB NOT NULL, \
        \"signing_public_key\" BLOB NOT NULL, \
        \"sealed_secret_key\" BLOB NOT NULL, \
        \"sealed_content_key\" BLOB NOT NULL, \
        \"kdf_salt\" BLOB NOT NULL, \
        \"kdf_params\" TEXT NOT NULL, \
        \"role_id\" TEXT NOT NULL, \
        \"override\" INTEGER NOT NULL, \
        \"removed_at\" INTEGER, \
        \"must_change_password\" INTEGER NOT NULL, \
        \"certificate_id\" TEXT NOT NULL, \
        \"signature\" BLOB NOT NULL, \
        \"created_at\" INTEGER NOT NULL, \
        \"updated_at\" INTEGER NOT NULL, \
        \"session_epoch\" INTEGER NOT NULL DEFAULT 0, \
        \"owner_seed_sealed\" BLOB)";

/// Whether a member is locked (effort 851, requirements 31 to 37): one row per member, signed by
/// whoever locked or unlocked them. A locked member signs in, changes their password and reads,
/// and every other act of the organization refuses them (`session::acting_row`).
///
/// **A table of its own rather than a field of the member row**, which would move the member
/// preimage and break every signature already made. It goes last in [`super::TABLES`], completed on
/// every replica of this format after a pull, so no change of format is needed and a build before
/// it never reads it.
pub(super) const MEMBER_LOCK: &str = "CREATE TABLE IF NOT EXISTS \"member_lock\" (\
        \"member_id\" TEXT PRIMARY KEY NOT NULL, \
        \"locked\" INTEGER NOT NULL, \
        \"updated_at\" INTEGER NOT NULL, \
        \"certificate_id\" TEXT NOT NULL, \
        \"signature\" BLOB NOT NULL)";

/// A `member_lock` row: whose it is, whether they are locked, and when that was set. The whole of
/// it is under signature, and the signing key the member's row holds with it, so a lock is about
/// one run of the account and a reset leaves every earlier one reading locked.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MemberLockRecord {
    pub member_id: String,
    pub locked: bool,
    pub updated_at: i64,
}

/// Every member's lock as one read found it (effort 851, requirement 35): what each row says by
/// member id, locked where the row does not verify, and whether the organization is **marked**.
///
/// **The marker is the owner's own lock row**, which only the root covers (nobody outranks the
/// owner), so one that verifies was written by the owner's machine, and it writes it only once
/// every member it found had a lock row of their own (`member::lock::lock_unset_accounts`).
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct MemberLocks {
    pub rows: HashMap<String, bool>,
    pub marked: bool,
}

impl MemberLocks {
    /// Whether a reader has seen the organization's lock marker, latching `seen` where this read
    /// carries it: what a session passes to [`locked_in`] (`session::MemberSession::lock_marked`).
    pub fn latch(&self, seen: &AtomicBool) -> bool {
        if self.marked {
            seen.store(true, Ordering::Relaxed);
        }

        seen.load(Ordering::Relaxed)
    }
}

/// Whether `member` reads as locked out of `locks` (effort 851, requirement 35): what their row
/// says where it verifies, and locked where it does not. **A member with no row** reads locked
/// where the organization is marked, or where `latched` says this machine once saw the marker
/// (`HeldOrganization::lock_marked`), so deleting a row, the marker with it, unlocks nobody on a
/// machine that saw it; and unlocked before that, which is every member carried over from before
/// the table until the backfill writes their row.
///
/// **The owner is never locked.** Nothing locks the owner (their account is made by no invitation
/// and reset by nobody), and nobody outranks them to unlock them, so a row about them is the
/// marker or somebody writing around the commands, and reading it would take every act of the
/// organization from the one member who holds the Turso account. A member row naming the owner's
/// role verifies only as the root's about its holder (`authority::covers`), so `covered` is what
/// makes it theirs.
pub fn locked_in(locks: &MemberLocks, member: &MemberRecord, latched: bool) -> bool {
    if member.covered && member.role_id == permission::OWNER {
        return false;
    }

    locks
        .rows
        .get(&member.id)
        .copied()
        .unwrap_or(locks.marked || latched)
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
    /// the one role the member holds (effort 838, requirement 5): `owner`, `manager`, `member`, or
    /// a custom role's id.
    pub role_id: String,
    /// the flags switched for this member alone (requirement 6). Zero on the owner's row.
    pub override_mask: i64,
    /// when the member was removed, where they were. Signed, so a removal cannot be undone by
    /// clearing a column. *It was the role `removed` until effort 838.*
    pub removed_at: Option<i64>,
    /// **what the member may do: their role's mask exclusive-or'd with their override**
    /// (requirement 8), computed by the read from the verified role row, and never stored.
    /// **Nothing on a removed member's row**, and nothing on a row its certificate stopped
    /// covering (`Chain::read_member`): what an act's gate and a certificate's re-issue read, so
    /// neither reaches past a row somebody covering it wrote.
    ///
    /// **A write does not read it.** What changes a member's permissions is their role and their
    /// override; a record handed to [`OrganizationStore::write_member`] with this changed and
    /// neither of those writes exactly what it wrote before.
    pub effective: i64,
    /// **whether the row's certificate covers it** (`Chain::read_member`), as the read found it.
    /// `false` on a genuine row somebody below the member wrote, or one a role moved or went
    /// under on another machine: it grants nothing, its content is never carried forward as
    /// authority, and it is never saved, only removed (effort 838, the re-check of ticket 20).
    /// `true` on every row the unverified read returns, which judges nothing. Like
    /// `effective`, computed by the read and never stored, and a write does not read it.
    pub covered: bool,
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

impl OrganizationStore {
    /// Write a member row, signed by `signer` over the fields the plan puts under signature.
    ///
    /// **`session_epoch` never comes down here.** It is outside the preimage and inside a
    /// whole-row replace, and the three callers that rewrite a row from one they read
    /// (`invite::rename_member`, `role::apply`, `removal::retire_member`) read it off this
    /// machine's replica. A replica that has not pulled since somebody else ended a member's
    /// sessions still carries the number from before, and writing that back would re-admit every
    /// machine the sign-out locked out. So the row keeps the greater of what it holds and what
    /// the record carries, which is the invariant `session.rs` rests the comparison on: the
    /// number only ever moves forward.
    ///
    /// **Refused, with nothing written, where the signer's certificate does not cover the row**
    /// ([`OrganizationStore::refuse_uncovered`]): a member ranked at or above it, a flag the row's
    /// override switches that the certificate does not carry, or the certificate's own holder's
    /// row.
    pub async fn write_member(
        &self,
        signer: &Signer<'_>,
        member: &MemberRecord,
    ) -> Result<(), Error> {
        self.refuse_uncovered(signer, member_authority(member))
            .await?;
        self.insert_member(signer, member).await
    }

    /// [`OrganizationStore::write_member`] around its check, for a test writing the row somebody
    /// holding the credential writes around the store: what every reader has to refuse.
    #[cfg(test)]
    pub(crate) async fn write_member_around_the_check(
        &self,
        signer: &Signer<'_>,
        member: &MemberRecord,
    ) -> Result<(), Error> {
        self.insert_member(signer, member).await
    }

    async fn insert_member(&self, signer: &Signer<'_>, member: &MemberRecord) -> Result<(), Error> {
        let session_epoch = self
            .session_epoch_of(&member.id)
            .await?
            .map_or(member.session_epoch, |held| held.max(member.session_epoch));
        let signature = sign(signer.key, signer.certificate, member_authority(member))?;

        self.connection
            .execute(
                "INSERT OR REPLACE INTO \"member\" \
                 (\"id\", \"username_sealed\", \"public_key\", \"signing_public_key\", \
                  \"sealed_secret_key\", \"sealed_content_key\", \"kdf_salt\", \"kdf_params\", \
                  \"role_id\", \"override\", \"removed_at\", \"must_change_password\", \
                  \"certificate_id\", \"signature\", \"created_at\", \"updated_at\", \"session_epoch\", \
                  \"owner_seed_sealed\") \
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                vec![
                    turso::Value::Text(member.id.clone()),
                    turso::Value::Blob(member.username_sealed.clone()),
                    turso::Value::Blob(member.vault.public_key.to_vec()),
                    turso::Value::Blob(member.signing_public_key.to_vec()),
                    turso::Value::Blob(member.vault.sealed_secret_key.clone()),
                    turso::Value::Blob(member.sealed_content_key.clone()),
                    turso::Value::Blob(member.vault.kdf_salt.to_vec()),
                    turso::Value::Text(member.vault.kdf_params.encode()),
                    turso::Value::Text(member.role_id.clone()),
                    turso::Value::Integer(member.override_mask),
                    member
                        .removed_at
                        .map_or(turso::Value::Null, turso::Value::Integer),
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
    pub(super) async fn signed_members(
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
    /// answer is asking the database to vouch for itself, which is the one thing `authority/`
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
    /// that does not check refuses the whole read by name, but for one: a genuine row its
    /// certificate stopped covering because the role it names moved or went on another machine
    /// (`Chain::read_member`), which is returned granting nothing. A removed member's row grants
    /// nothing either, however it reads (effort 838, the human's decision after review round
    /// two). Where it is `None`, the certificates are not even fetched, because a caller that is
    /// not going to judge the rows has no use for the authorities behind them.
    /// [`OrganizationStore::members_unverified`] says which caller that is and why it is alone.
    async fn signed_members_where(
        &self,
        organization_verifying_key: Option<&[u8; VERIFYING_KEY_BYTES]>,
        member_id: Option<&str>,
    ) -> Result<Vec<(String, MemberRecord)>, Error> {
        // the roles first, verified where the rows are: a member row is judged by the rank of the
        // role it names, and what it gives is that role's mask with the override applied. The
        // unverified read reads them unverified too, and uses them for nothing but the number.
        let roles = match organization_verifying_key {
            Some(pinned) => self.roles(pinned).await?,
            None => self.roles_unverified().await?,
        };
        let (certificates, revocations) = match organization_verifying_key {
            Some(_) => self.chain_rows().await?,
            None => (Vec::new(), Vec::new()),
        };
        let chain = organization_verifying_key.map(|pinned| {
            Chain::new(pinned, &certificates, &revocations).with_roles(standings(&roles))
        });
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
                            \"role_id\", \"override\", \"removed_at\", \"must_change_password\", \
                            \"certificate_id\", \"signature\", \"created_at\", \"updated_at\", \
                            \"session_epoch\", \"owner_seed_sealed\" \
                     FROM \"member\"{filter} ORDER BY \"created_at\", \"id\""
                ),
                params,
            )
            .await?;
        let mut members = Vec::new();

        while let Some(row) = rows.next().await? {
            let role_id = text(&row, 8)?;
            let override_mask = integer(&row, 9)?;
            let certificate_id = text(&row, 12)?;
            let signature = blob(&row, 13)?;
            let mut member = MemberRecord {
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
                effective: 0,
                covered: true,
                role_id,
                override_mask,
                removed_at: nullable_integer(&row, 10)?,
                must_change_password: integer(&row, 11)? != 0,
                created_at: integer(&row, 14)?,
                updated_at: integer(&row, 15)?,
                session_epoch: integer(&row, 16)?,
                owner_seed_sealed: nullable_blob(&row, 17)?,
            };
            let reading = match &chain {
                Some(chain) => chain
                    .read_member(&certificate_id, member_of(&member), &signature)
                    .map_err(|error| Error::Integrity {
                        message: format!("the member row {} is refused: {error}", member.id),
                    })?,
                None => Reading::Covered,
            };

            // a removed member's row grants nothing, and neither does a genuine one its
            // certificate stopped covering (effort 838, the human's decision after review round
            // two): it stays in the directory, removal and all, until somebody above the member
            // removes it.
            member.covered = reading == Reading::Covered;

            if member.covered && member.removed_at.is_none() {
                member.effective =
                    effective_of(&member.role_id, member.override_mask, &roles).unwrap_or(0);
            }

            members.push((certificate_id, member));
        }

        Ok(members)
    }
}

impl OrganizationStore {
    /// Write a member's lock, signed by `signer` over the whole of it (effort 851).
    ///
    /// **An unlock is refused, with nothing written, where the signer's certificate does not cover
    /// it** ([`OrganizationStore::refuse_uncovered`]): `assignRole` or `overrideMember`, a rank
    /// above the member, and not the signer's own. **A lock is written whoever signs it**, because
    /// a lock row that does not verify reads locked all the same ([`locked_in`]): making an account
    /// takes `inviteMember` and a reset `resetPassword`, either of which may be held without the
    /// two flags that sign a lock, and the account they make is locked from its creation
    /// (requirements 31 and 37) whoever made it. An unlock by somebody covering it replaces it.
    pub async fn write_member_lock(
        &self,
        signer: &Signer<'_>,
        lock: &MemberLockRecord,
    ) -> Result<(), Error> {
        if !lock.locked {
            let member_key = self.member_lock_key(&lock.member_id).await?;

            self.refuse_uncovered(signer, member_lock_authority(lock, &member_key))
                .await?;
        }

        self.insert_member_lock(signer, lock).await
    }

    /// The key a lock about `member_id` is signed over: the signing key their row holds now, as
    /// it lies, or nothing where there is no row (effort 851, requirements 35 and 37). Read as it
    /// lies because a write only signs over it; the reader takes the key off the member's
    /// verified row ([`OrganizationStore::member_locks`]), so a row somebody rewrote around the
    /// store makes a lock signed over it read locked, and unlocks nobody.
    async fn member_lock_key(&self, member_id: &str) -> Result<Vec<u8>, Error> {
        let mut rows = self
            .connection
            .query(
                "SELECT \"signing_public_key\" FROM \"member\" WHERE \"id\" = ?",
                vec![turso::Value::Text(member_id.to_string())],
            )
            .await?;

        Ok(match rows.next().await? {
            Some(row) => blob(&row, 0)?,
            None => Vec::new(),
        })
    }

    /// [`OrganizationStore::write_member_lock`] around its check, for a test writing the row a
    /// member holding the credential writes around the store: what every reader has to read as
    /// locked.
    #[cfg(test)]
    pub(crate) async fn write_member_lock_around_the_check(
        &self,
        signer: &Signer<'_>,
        lock: &MemberLockRecord,
    ) -> Result<(), Error> {
        self.insert_member_lock(signer, lock).await
    }

    /// The write behind [`OrganizationStore::write_member_lock`], with no check: what a re-sign
    /// writes a lock back with, having judged it against the chain it read the rows under
    /// (`re_sign_rows_of_certificates_but`), since the organization row's key a check would read
    /// by is the one a handover is leaving.
    pub(super) async fn insert_member_lock(
        &self,
        signer: &Signer<'_>,
        lock: &MemberLockRecord,
    ) -> Result<(), Error> {
        let member_key = self.member_lock_key(&lock.member_id).await?;
        let signature = sign(
            signer.key,
            signer.certificate,
            member_lock_authority(lock, &member_key),
        )?;

        self.connection
            .execute(
                "INSERT OR REPLACE INTO \"member_lock\" \
                 (\"member_id\", \"locked\", \"updated_at\", \"certificate_id\", \"signature\") \
                 VALUES (?, ?, ?, ?, ?)",
                vec![
                    turso::Value::Text(lock.member_id.clone()),
                    turso::Value::Integer(i64::from(lock.locked)),
                    turso::Value::Integer(lock.updated_at),
                    turso::Value::Text(signer.certificate.id.clone()),
                    turso::Value::Blob(signature),
                ],
            )
            .await?;

        Ok(())
    }

    /// Every member's lock as it reads (effort 851, requirement 35): what a row says where it
    /// verifies, locked where it does not, and whether the owner's marker verifies
    /// ([`MemberLocks`]). A member with no row is not in it ([`locked_in`]).
    ///
    /// **A row that does not verify is not logged**, unlike a grant or a mark left out
    /// (`signature::read_or_left_out`): it is read, as locked, and a lock written by a maker of an
    /// account who holds neither flag that signs one is such a row on purpose
    /// ([`OrganizationStore::write_member_lock`]), read on every act.
    pub async fn member_locks(
        &self,
        organization_verifying_key: &[u8; VERIFYING_KEY_BYTES],
    ) -> Result<MemberLocks, Error> {
        let mut locks = MemberLocks::default();

        for judged in self.judged_member_locks(organization_verifying_key).await? {
            locks.marked |= judged.verified && judged.about_the_owner;
            locks.rows.insert(
                judged.row.record.member_id,
                !judged.verified || judged.row.record.locked,
            );
        }

        Ok(locks)
    }

    /// Whether one member reads as locked ([`locked_in`]), off every lock as it reads and
    /// whether this machine has `latched` the marker.
    pub async fn member_locked(
        &self,
        organization_verifying_key: &[u8; VERIFYING_KEY_BYTES],
        member: &MemberRecord,
        latched: bool,
    ) -> Result<bool, Error> {
        Ok(locked_in(
            &self.member_locks(organization_verifying_key).await?,
            member,
            latched,
        ))
    }

    /// Every lock that verifies, paired with the id of the certificate that signed it: what a
    /// re-signing moves (`re_sign_rows_of_certificates_but`). One that does not verify is not
    /// re-signed, and reads locked whoever signs next.
    pub(crate) async fn signed_member_locks(
        &self,
        organization_verifying_key: &[u8; VERIFYING_KEY_BYTES],
    ) -> Result<Vec<(String, MemberLockRecord)>, Error> {
        Ok(self
            .judged_member_locks(organization_verifying_key)
            .await?
            .into_iter()
            .filter(|judged| judged.verified)
            .map(|judged| (judged.row.certificate_id, judged.row.record))
            .collect())
    }

    /// Every lock row with whether it verifies. Judged by the rank each member stands at by the
    /// role their verified row names, as a workspace override is, so the members are read first.
    async fn judged_member_locks(
        &self,
        organization_verifying_key: &[u8; VERIFYING_KEY_BYTES],
    ) -> Result<Vec<JudgedLock>, Error> {
        let rows = self.member_lock_rows().await?;

        if rows.is_empty() {
            return Ok(Vec::new());
        }

        let roles = self.roles(organization_verifying_key).await?;
        let members = self.members(organization_verifying_key).await?;
        let (certificates, revocations) = self.chain_rows().await?;
        let chain = Chain::new(organization_verifying_key, &certificates, &revocations)
            .with_roles(standings(&roles))
            .with_members(ranks_of_members(&members, &roles));

        let owner = members
            .iter()
            .find(|member| member.covered && member.role_id == permission::OWNER)
            .map(|member| member.id.clone());
        // the key each lock is judged over: the one on the member's verified row. A row its
        // certificate stopped covering is genuine and grants nothing, so its key unlocks nothing
        // either; a lock about a member with no row verifies over nothing and reads locked.
        let keys: HashMap<&str, &[u8]> = members
            .iter()
            .map(|member| (member.id.as_str(), &member.signing_public_key[..]))
            .collect();

        Ok(rows
            .into_iter()
            .map(|row| {
                let verified = keys.get(row.record.member_id.as_str()).is_some_and(|key| {
                    chain
                        .verify(
                            &row.certificate_id,
                            member_lock_authority(&row.record, key),
                            &row.signature,
                        )
                        .is_ok()
                });

                JudgedLock {
                    about_the_owner: owner.as_deref() == Some(row.record.member_id.as_str()),
                    row,
                    verified,
                }
            })
            .collect())
    }

    /// Every lock row as it lies, verified by nobody. **A replica without the table reads as
    /// holding none**: one an earlier build made, not yet completed by a pull
    /// ([`OrganizationStore::complete_schema`]).
    async fn member_lock_rows(&self) -> Result<Vec<SignedRow<MemberLockRecord>>, Error> {
        if !self
            .tables()
            .await?
            .iter()
            .any(|table| table == "member_lock")
        {
            return Ok(Vec::new());
        }

        let mut rows = self
            .connection
            .query(
                "SELECT \"member_id\", \"locked\", \"updated_at\", \"certificate_id\", \
                        \"signature\" \
                 FROM \"member_lock\" ORDER BY \"member_id\"",
                (),
            )
            .await?;
        let mut locks = Vec::new();

        while let Some(row) = rows.next().await? {
            locks.push(SignedRow {
                record: MemberLockRecord {
                    member_id: text(&row, 0)?,
                    locked: integer(&row, 1)? != 0,
                    updated_at: integer(&row, 2)?,
                },
                certificate_id: text(&row, 3)?,
                signature: blob(&row, 4)?,
            });
        }

        Ok(locks)
    }
}

/// One lock row as a read judged it: whether it verifies, and whether it is about the owner,
/// which makes a verifying one the organization's marker ([`MemberLocks`]).
struct JudgedLock {
    row: SignedRow<MemberLockRecord>,
    verified: bool,
    about_the_owner: bool,
}
