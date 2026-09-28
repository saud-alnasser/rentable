//! The `invitation` table: a pending account, whose member it is for and how long it stands.

use crate::{
    error::Error,
    organization::authority::{Chain, VERIFYING_KEY_BYTES, sign},
};

use super::{
    OrganizationStore, SignedRow, Signer, blob, integer, invitation_authority,
    signature::read_or_left_out, text,
};

pub(super) const INVITATION: &str = "CREATE TABLE IF NOT EXISTS \"invitation\" (\
        \"id\" TEXT PRIMARY KEY NOT NULL, \
        \"member_id\" TEXT NOT NULL, \
        \"expires_at\" INTEGER NOT NULL, \
        \"consumed_at\" INTEGER, \
        \"sealed_secret\" BLOB NOT NULL, \
        \"issued_by\" TEXT NOT NULL, \
        \"certificate_id\" TEXT NOT NULL, \
        \"signature\" BLOB NOT NULL, \
        \"created_at\" INTEGER NOT NULL)";

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

impl OrganizationStore {
    /// Write an invitation row, signed by `signer`. Refused, with nothing written, where the
    /// signer's certificate does not cover it ([`OrganizationStore::refuse_uncovered`]).
    pub async fn write_invitation(
        &self,
        signer: &Signer<'_>,
        invitation: &InvitationRecord,
    ) -> Result<(), Error> {
        self.refuse_uncovered(signer, invitation_authority(invitation))
            .await?;

        let signature = sign(
            signer.key,
            signer.certificate,
            invitation_authority(invitation),
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

    /// Every invitation that verifies. One that does not is left out and logged, and the rest are
    /// read (effort 838, ticket 25; [`read_or_left_out`] says why).
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
    pub(super) async fn signed_invitations(
        &self,
        organization_verifying_key: &[u8; VERIFYING_KEY_BYTES],
    ) -> Result<Vec<(String, InvitationRecord)>, Error> {
        let (certificates, revocations) = self.chain_rows().await?;
        let chain = Chain::new(organization_verifying_key, &certificates, &revocations);

        Ok(self
            .invitation_rows()
            .await?
            .into_iter()
            .filter(|row| {
                read_or_left_out(
                    &chain,
                    "invitation",
                    &row.record.id,
                    &row.certificate_id,
                    invitation_authority(&row.record),
                    &row.signature,
                )
            })
            .map(|row| (row.certificate_id, row.record))
            .collect())
    }

    /// Every invitation row as it lies, verified by nobody: what
    /// [`OrganizationStore::signed_invitations`] verifies and the format 1 directory carries to the
    /// upgrade's judge. A `consumed_at` that is not an integer reads as not consumed.
    pub(super) async fn invitation_rows(&self) -> Result<Vec<SignedRow<InvitationRecord>>, Error> {
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
            invitations.push(SignedRow {
                record: InvitationRecord {
                    id: text(&row, 0)?,
                    member_id: text(&row, 1)?,
                    expires_at: integer(&row, 2)?,
                    consumed_at: match row.get_value(3)? {
                        turso::Value::Integer(value) => Some(value),
                        _ => None,
                    },
                    sealed_secret: blob(&row, 4)?,
                    issued_by: text(&row, 5)?,
                    created_at: integer(&row, 8)?,
                },
                certificate_id: text(&row, 6)?,
                signature: blob(&row, 7)?,
            });
        }

        Ok(invitations)
    }

    /// Mark an invitation consumed: the member whose vault it made has a password of their own by
    /// the time this runs, so the link that named it opens a vault the generated password no
    /// longer fits.
    ///
    /// Unsigned on purpose: the machine that consumes it holds no signing key yet, and a
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
}
