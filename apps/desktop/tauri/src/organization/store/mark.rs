//! The `mark` table: the one image an organization prints on its pages.

use crate::{
    error::Error,
    organization::authority::{Chain, VERIFYING_KEY_BYTES, sign},
};

use super::{
    OrganizationStore, SignedRow, Signer, blob, integer, mark_authority,
    signature::read_or_left_out, text,
};

/// the one image an organization prints on its pages, a signature or a seal (effort 835,
/// requirement 13). Sealed under the content key like a name, and signed by the holder of
/// `manageMark` who set it, so an image any member could write straight into the database is
/// never printed as the organization's. *A build during the effort kept it unsigned in
/// `organization_mark`; a replica that ran that build keeps that table, empty or not, and
/// nothing reads it.*
pub(super) const MARK: &str = "CREATE TABLE IF NOT EXISTS \"mark\" (\
        \"id\" TEXT PRIMARY KEY NOT NULL, \
        \"image_sealed\" BLOB NOT NULL, \
        \"media_type\" TEXT NOT NULL, \
        \"updated_by\" TEXT NOT NULL, \
        \"updated_at\" INTEGER NOT NULL, \
        \"certificate_id\" TEXT NOT NULL, \
        \"signature\" BLOB NOT NULL)";

/// The key of the one `mark` row: an organization keeps one mark.
const MARK_ID: &str = "mark";

/// The organization's mark as it is stored: the image sealed, what kind of image it is, and who
/// set it when.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MarkRecord {
    pub image_sealed: Vec<u8>,
    pub media_type: String,
    pub updated_by: String,
    pub updated_at: i64,
}

impl OrganizationStore {
    /// The organization's mark, verified, or nothing where none is set. A row that does not verify
    /// against a certificate the organization issued, or reaches past what its certificate covers,
    /// reads as no mark and is logged: it is never printed (effort 838, ticket 25).
    pub async fn mark(
        &self,
        organization_verifying_key: &[u8; VERIFYING_KEY_BYTES],
    ) -> Result<Option<MarkRecord>, Error> {
        Ok(self
            .signed_mark(organization_verifying_key)
            .await?
            .map(|(_, mark)| mark))
    }

    /// The mark, verified, paired with the id of the certificate that signed it.
    pub(super) async fn signed_mark(
        &self,
        organization_verifying_key: &[u8; VERIFYING_KEY_BYTES],
    ) -> Result<Option<(String, MarkRecord)>, Error> {
        let (certificates, revocations) = self.chain_rows().await?;
        let chain = Chain::new(organization_verifying_key, &certificates, &revocations);
        let Some(row) = self.mark_row().await? else {
            return Ok(None);
        };

        Ok(read_or_left_out(
            &chain,
            "mark",
            MARK_ID,
            &row.certificate_id,
            mark_authority(&row.record),
            &row.signature,
        )
        .then_some((row.certificate_id, row.record)))
    }

    /// The mark row as it lies, verified by nobody, or nothing where none is set: what
    /// [`OrganizationStore::signed_mark`] verifies and the format 1 directory carries to the
    /// upgrade's judge.
    pub(super) async fn mark_row(&self) -> Result<Option<SignedRow<MarkRecord>>, Error> {
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

        Ok(Some(SignedRow {
            record: MarkRecord {
                image_sealed: blob(&row, 0)?,
                media_type: text(&row, 1)?,
                updated_by: text(&row, 2)?,
                updated_at: integer(&row, 3)?,
            },
            certificate_id: text(&row, 4)?,
            signature: blob(&row, 5)?,
        }))
    }

    /// Set the mark, signed by whoever set it, replacing whatever was there. Refused, with nothing
    /// written, where the signer's certificate does not cover it
    /// ([`OrganizationStore::refuse_uncovered`]).
    pub async fn write_mark(&self, signer: &Signer<'_>, mark: &MarkRecord) -> Result<(), Error> {
        self.refuse_uncovered(signer, mark_authority(mark)).await?;

        let signature = sign(signer.key, signer.certificate, mark_authority(mark))?;

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
}
