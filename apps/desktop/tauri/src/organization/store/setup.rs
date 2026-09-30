//! The one `organization` row, written when the organization is set up.

use crate::{error::Error, organization::authority::VERIFYING_KEY_BYTES};

use super::{OrganizationStore, blob, fixed, integer, text};

pub(super) const ORGANIZATION: &str = "CREATE TABLE IF NOT EXISTS \"organization\" (\
        \"id\" TEXT PRIMARY KEY NOT NULL, \
        \"name_sealed\" BLOB NOT NULL, \
        \"verifying_key\" BLOB NOT NULL, \
        \"remote_url\" TEXT NOT NULL, \
        \"created_at\" INTEGER NOT NULL)";

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

impl OrganizationStore {
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
}
