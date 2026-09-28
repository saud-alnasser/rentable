//! The `certificate` and `revocation` tables: the chain every signed row is judged by, stored
//! as issued and judged by `organization/authority.rs`, never here.

use crate::{
    error::Error,
    organization::authority::{Certificate, Chain, Revocation, VERIFYING_KEY_BYTES},
};

use super::{OrganizationStore, blob, fixed, integer, nullable_text, optional_text, text};

/// a delegated certificate (effort 838): signed by its issuer, or by the organization key where
/// `issuer_certificate_id` is null, which is the owner's alone. *It was
/// `administrator_certificate`, signed by the organization key every time and revoked by an
/// unsigned `revoked_at`, until effort 838.*
pub(super) const CERTIFICATE: &str = "CREATE TABLE IF NOT EXISTS \"certificate\" (\
        \"id\" TEXT PRIMARY KEY NOT NULL, \
        \"member_id\" TEXT NOT NULL, \
        \"signing_public_key\" BLOB NOT NULL, \
        \"issuer_certificate_id\" TEXT, \
        \"ceiling\" INTEGER NOT NULL, \
        \"rank\" INTEGER NOT NULL, \
        \"issued_at\" TEXT NOT NULL, \
        \"signature\" BLOB NOT NULL)";

/// a signed revocation (effort 838). Keyed on the pair, so a second revoker's row sits beside
/// the first rather than replacing it: one that does not verify then cannot overwrite one that
/// does.
pub(super) const REVOCATION: &str = "CREATE TABLE IF NOT EXISTS \"revocation\" (\
        \"certificate_id\" TEXT NOT NULL, \
        \"revoker_certificate_id\" TEXT NOT NULL, \
        \"revoked_at\" TEXT NOT NULL, \
        \"signature\" BLOB NOT NULL, \
        PRIMARY KEY (\"certificate_id\", \"revoker_certificate_id\"))";

impl OrganizationStore {
    /// Write a certificate as issued. The signature it carries is its issuer's and was made when
    /// it was issued; this module checks it on every read of a row it authorises, and never makes
    /// one. **A certificate is not written again once issued**: a change in what somebody may do
    /// is a fresh certificate under a fresh id and a revocation of the old one.
    pub async fn write_certificate(&self, certificate: &Certificate) -> Result<(), Error> {
        self.connection
            .execute(
                "INSERT OR REPLACE INTO \"certificate\" \
                 (\"id\", \"member_id\", \"signing_public_key\", \"issuer_certificate_id\", \
                  \"ceiling\", \"rank\", \"issued_at\", \"signature\") \
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                vec![
                    turso::Value::Text(certificate.id.clone()),
                    turso::Value::Text(certificate.member_id.clone()),
                    turso::Value::Blob(certificate.signing_public_key.to_vec()),
                    optional_text(certificate.issuer_certificate_id.as_deref()),
                    turso::Value::Integer(certificate.ceiling),
                    turso::Value::Integer(certificate.rank),
                    turso::Value::Text(certificate.issued_at.clone()),
                    turso::Value::Blob(certificate.signature.clone()),
                ],
            )
            .await?;

        Ok(())
    }

    /// Every certificate, revoked ones included, with nothing checked: a revoked certificate is
    /// still what a row names, and the chain is what says the row is refused for it. Judge these
    /// through [`Chain`], never by reading a field.
    pub async fn certificates(&self) -> Result<Vec<Certificate>, Error> {
        let mut rows = self
            .connection
            .query(
                "SELECT \"id\", \"member_id\", \"signing_public_key\", \
                        \"issuer_certificate_id\", \"ceiling\", \"rank\", \"issued_at\", \
                        \"signature\" \
                 FROM \"certificate\" ORDER BY \"id\"",
                (),
            )
            .await?;
        let mut certificates = Vec::new();

        while let Some(row) = rows.next().await? {
            certificates.push(Certificate {
                id: text(&row, 0)?,
                member_id: text(&row, 1)?,
                signing_public_key: fixed::<VERIFYING_KEY_BYTES>(&row, 2, "signing_public_key")?,
                issuer_certificate_id: nullable_text(&row, 3)?,
                ceiling: integer(&row, 4)?,
                rank: integer(&row, 5)?,
                issued_at: text(&row, 6)?,
                signature: blob(&row, 7)?,
            });
        }

        Ok(certificates)
    }

    /// Write a revocation. Its signature is the revoker's, made by the caller; the chain decides
    /// whether it counts.
    pub async fn write_revocation(&self, revocation: &Revocation) -> Result<(), Error> {
        self.connection
            .execute(
                "INSERT OR REPLACE INTO \"revocation\" \
                 (\"certificate_id\", \"revoker_certificate_id\", \"revoked_at\", \"signature\") \
                 VALUES (?, ?, ?, ?)",
                vec![
                    turso::Value::Text(revocation.certificate_id.clone()),
                    turso::Value::Text(revocation.revoker_certificate_id.clone()),
                    turso::Value::Text(revocation.revoked_at.clone()),
                    turso::Value::Blob(revocation.signature.clone()),
                ],
            )
            .await?;

        Ok(())
    }

    /// Every revocation, with nothing checked, for the chain to judge.
    pub async fn revocations(&self) -> Result<Vec<Revocation>, Error> {
        let mut rows = self
            .connection
            .query(
                "SELECT \"certificate_id\", \"revoker_certificate_id\", \"revoked_at\", \
                        \"signature\" \
                 FROM \"revocation\" ORDER BY \"certificate_id\", \"revoker_certificate_id\"",
                (),
            )
            .await?;
        let mut revocations = Vec::new();

        while let Some(row) = rows.next().await? {
            revocations.push(Revocation {
                certificate_id: text(&row, 0)?,
                revoker_certificate_id: text(&row, 1)?,
                revoked_at: text(&row, 2)?,
                signature: blob(&row, 3)?,
            });
        }

        Ok(revocations)
    }

    /// What one read judges its rows by: every certificate and every revocation, read once and
    /// handed to a [`Chain`] the read builds and drops. That is the per-read cache: a walk is made
    /// once per certificate however many rows name it, and no verdict outlives the read.
    pub async fn chain_rows(&self) -> Result<(Vec<Certificate>, Vec<Revocation>), Error> {
        Ok((self.certificates().await?, self.revocations().await?))
    }

    /// The certificate a member signs with under the key the caller pinned: live, naming the key
    /// given, and the newest where two are. `None` where the member holds none.
    pub async fn live_certificate(
        &self,
        organization_verifying_key: &[u8; VERIFYING_KEY_BYTES],
        member_id: &str,
        signing_public_key: &[u8; VERIFYING_KEY_BYTES],
    ) -> Result<Option<Certificate>, Error> {
        let (certificates, revocations) = self.chain_rows().await?;

        Ok(
            Chain::new(organization_verifying_key, &certificates, &revocations)
                .live_certificate_of(member_id, signing_public_key)
                .cloned(),
        )
    }

    /// Every live certificate a member holds under the key the caller pinned, whatever key each
    /// names: what a removal or a narrowing revokes.
    pub async fn live_certificates(
        &self,
        organization_verifying_key: &[u8; VERIFYING_KEY_BYTES],
        member_id: &str,
    ) -> Result<Vec<Certificate>, Error> {
        let (certificates, revocations) = self.chain_rows().await?;

        Ok(
            Chain::new(organization_verifying_key, &certificates, &revocations)
                .live_certificates_of(member_id)
                .into_iter()
                .cloned()
                .collect(),
        )
    }
}
