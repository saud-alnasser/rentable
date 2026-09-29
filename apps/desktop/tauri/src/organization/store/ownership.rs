//! The `succession` table: an offer of the organization to one account, and the key change it
//! became.

use crate::{error::Error, organization::authority::VERIFYING_KEY_BYTES};

use super::{OrganizationStore, blob, fixed, integer, nullable_blob, nullable_integer, text};

pub(super) const SUCCESSION: &str = "CREATE TABLE IF NOT EXISTS \"succession\" (\
        \"id\" TEXT PRIMARY KEY NOT NULL, \
        \"offered_member_id\" TEXT NOT NULL, \
        \"offered_by\" TEXT NOT NULL, \
        \"offered_at\" INTEGER NOT NULL, \
        \"old_verifying_key\" BLOB NOT NULL, \
        \"new_verifying_key\" BLOB, \
        \"accepted_at\" INTEGER, \
        \"signature\" BLOB NOT NULL)";

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

impl OrganizationStore {
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
    /// the chain hands it (`ownership::follow_succession`, which is the only walk there is). A row
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
}
