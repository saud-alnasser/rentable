//! The one `organization` row, written when the organization is set up, and the one
//! `organization_name` row, the name under the owner's signature.

use crate::{
    error::Error,
    organization::authority::{Chain, VERIFYING_KEY_BYTES, sign},
};

use super::{
    OrganizationStore, SignedRow, Signer, blob, fixed, integer, organization_name_authority,
    signature::read_or_left_out, text,
};

pub(super) const ORGANIZATION: &str = "CREATE TABLE IF NOT EXISTS \"organization\" (\
        \"id\" TEXT PRIMARY KEY NOT NULL, \
        \"name_sealed\" BLOB NOT NULL, \
        \"verifying_key\" BLOB NOT NULL, \
        \"remote_url\" TEXT NOT NULL, \
        \"created_at\" INTEGER NOT NULL)";

/// The organization's name under the owner's signature (effort 851, requirement 29): sealed under
/// the content key as `organization.name_sealed` is, and signed by the root, so a name any member
/// holding the database's credential wrote is never shown as the organization's.
///
/// **A table of its own rather than a signature on `organization`**, so no change of format is
/// needed: it is the last of [`super::TABLES`], completed on every replica of this format after a
/// pull ([`OrganizationStore::complete_schema`]), and a build before it never reads it and keeps
/// reading `organization.name_sealed`, which the owner's writes keep the same. A column on
/// `organization` would be wiped by an older build's `INSERT OR REPLACE` of that row.
pub(super) const ORGANIZATION_NAME: &str = "CREATE TABLE IF NOT EXISTS \"organization_name\" (\
        \"id\" TEXT PRIMARY KEY NOT NULL, \
        \"name_sealed\" BLOB NOT NULL, \
        \"updated_at\" INTEGER NOT NULL, \
        \"certificate_id\" TEXT NOT NULL, \
        \"signature\" BLOB NOT NULL)";

/// The key of the one `organization_name` row: an organization has one name.
const ORGANIZATION_NAME_ID: &str = "name";

/// The organization's name as its signed row stores it: sealed, and when it was set.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct OrganizationNameRecord {
    pub name_sealed: Vec<u8>,
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

impl OrganizationStore {
    /// The organization's name as the owner signed it, or nothing where no row verifies: none was
    /// ever signed, the replica predates the table, or the row there is not the owner's. A row
    /// that does not verify is logged and left out, as the mark is ([`read_or_left_out`]); what
    /// a reader shows instead is the session's to say (`session::facts_of`).
    pub async fn organization_name(
        &self,
        organization_verifying_key: &[u8; VERIFYING_KEY_BYTES],
    ) -> Result<Option<OrganizationNameRecord>, Error> {
        Ok(self
            .signed_organization_name(organization_verifying_key)
            .await?
            .map(|(_, name)| name))
    }

    /// The signed name, verified, paired with the id of the certificate that signed it.
    pub(super) async fn signed_organization_name(
        &self,
        organization_verifying_key: &[u8; VERIFYING_KEY_BYTES],
    ) -> Result<Option<(String, OrganizationNameRecord)>, Error> {
        let Some(row) = self.organization_name_row().await? else {
            return Ok(None);
        };
        let (certificates, revocations) = self.chain_rows().await?;
        let chain = Chain::new(organization_verifying_key, &certificates, &revocations);

        Ok(read_or_left_out(
            &chain,
            "organization_name",
            ORGANIZATION_NAME_ID,
            &row.certificate_id,
            organization_name_authority(&row.record),
            &row.signature,
        )
        .then_some((row.certificate_id, row.record)))
    }

    /// The signed name's row as it lies, verified by nobody, or nothing where there is none.
    ///
    /// **A replica without the table reads as holding no row**: one an earlier build made, not
    /// yet completed by a pull ([`OrganizationStore::complete_schema`]), is read offline at a
    /// resume, and that is the organization before anybody signed its name.
    pub(crate) async fn organization_name_row(
        &self,
    ) -> Result<Option<SignedRow<OrganizationNameRecord>>, Error> {
        if !self
            .tables()
            .await?
            .iter()
            .any(|table| table == "organization_name")
        {
            return Ok(None);
        }

        let mut rows = self
            .connection
            .query(
                "SELECT \"name_sealed\", \"updated_at\", \"certificate_id\", \"signature\" \
                 FROM \"organization_name\" WHERE \"id\" = ?",
                vec![turso::Value::Text(ORGANIZATION_NAME_ID.to_string())],
            )
            .await?;

        let Some(row) = rows.next().await? else {
            return Ok(None);
        };

        Ok(Some(SignedRow {
            record: OrganizationNameRecord {
                name_sealed: blob(&row, 0)?,
                updated_at: integer(&row, 1)?,
            },
            certificate_id: text(&row, 2)?,
            signature: blob(&row, 3)?,
        }))
    }

    /// Set the organization's signed name, replacing whatever was there. Refused, with nothing
    /// written, where the signer's certificate is not the root
    /// ([`OrganizationStore::refuse_uncovered`]).
    pub async fn write_organization_name(
        &self,
        signer: &Signer<'_>,
        name: &OrganizationNameRecord,
    ) -> Result<(), Error> {
        self.refuse_uncovered(signer, organization_name_authority(name))
            .await?;

        let signature = sign(
            signer.key,
            signer.certificate,
            organization_name_authority(name),
        )?;

        self.connection
            .execute(
                "INSERT OR REPLACE INTO \"organization_name\" \
                 (\"id\", \"name_sealed\", \"updated_at\", \"certificate_id\", \"signature\") \
                 VALUES (?, ?, ?, ?, ?)",
                vec![
                    turso::Value::Text(ORGANIZATION_NAME_ID.to_string()),
                    turso::Value::Blob(name.name_sealed.clone()),
                    turso::Value::Integer(name.updated_at),
                    turso::Value::Text(signer.certificate.id.clone()),
                    turso::Value::Blob(signature),
                ],
            )
            .await?;

        Ok(())
    }
}
