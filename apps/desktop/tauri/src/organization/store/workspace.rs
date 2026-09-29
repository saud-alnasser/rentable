//! The `workspace`, `grant` and `workspace_override` tables: which workspaces exist, who is
//! given each, and what is pinned for a member in one.

use crate::{
    error::Error,
    organization::authority::{Chain, VERIFYING_KEY_BYTES, sign},
};

use super::{
    OrganizationStore, SignedRow, Signer, blob, grant_authority, integer, nullable_text,
    optional_text,
    role::{ranks_of_members, standings},
    signature::{read_or_left_out, workspace_override_authority},
    text, workspace_authority,
};

pub(super) const WORKSPACE: &str = "CREATE TABLE IF NOT EXISTS \"workspace\" (\
        \"id\" TEXT PRIMARY KEY NOT NULL, \
        \"name_sealed\" BLOB NOT NULL, \
        \"database_name\" TEXT NOT NULL, \
        \"database_hostname\" TEXT NOT NULL, \
        \"schema_version\" INTEGER NOT NULL, \
        \"certificate_id\" TEXT NOT NULL, \
        \"signature\" BLOB NOT NULL, \
        \"created_at\" INTEGER NOT NULL, \
        \"updated_at\" INTEGER NOT NULL)";

pub(super) const GRANT: &str = "CREATE TABLE IF NOT EXISTS \"grant\" (\
        \"member_id\" TEXT NOT NULL, \
        \"workspace_id\" TEXT NOT NULL, \
        \"sealed_credential\" BLOB NOT NULL, \
        \"access_level\" TEXT NOT NULL, \
        \"credential_expires_at\" TEXT, \
        \"certificate_id\" TEXT NOT NULL, \
        \"signature\" BLOB NOT NULL, \
        PRIMARY KEY (\"member_id\", \"workspace_id\"))";

/// what is pinned for one member in one workspace (effort 838, requirement 12 as amended a
/// third time, and at review round one): the record flags set there, whatever they hold across
/// the organization, and which of those are on. Signed by a holder of `overrideMember` who
/// outranks them, and keyed on the pair, so a member carries one in each workspace they are in.
/// Format 3's, and so last.
pub(super) const WORKSPACE_OVERRIDE: &str = "CREATE TABLE IF NOT EXISTS \"workspace_override\" (\
        \"member_id\" TEXT NOT NULL, \
        \"workspace_id\" TEXT NOT NULL, \
        \"pinned\" INTEGER NOT NULL, \
        \"granted\" INTEGER NOT NULL, \
        \"certificate_id\" TEXT NOT NULL, \
        \"signature\" BLOB NOT NULL, \
        PRIMARY KEY (\"member_id\", \"workspace_id\"))";

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

/// A `workspace_override` row (effort 838, requirement 12 as amended a third time, and at review
/// round one): the record flags pinned for one member in one workspace, whatever they hold across
/// the organization, and which of those are on (`granted`, within `pinned`). The whole of it is
/// under signature. Nothing pinned is no row at all.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct WorkspaceOverrideRecord {
    pub member_id: String,
    pub workspace_id: String,
    pub pinned: i64,
    pub granted: i64,
}

/// What is pinned for `member_id` in `workspace_id` among `workspace_overrides`, and which of it is
/// on, as `(pinned, granted)`: `(0, 0)` where the member carries no row there.
pub fn pins_of(
    workspace_overrides: &[WorkspaceOverrideRecord],
    member_id: &str,
    workspace_id: &str,
) -> (i64, i64) {
    workspace_overrides
        .iter()
        .find(|workspace_override| {
            workspace_override.member_id == member_id
                && workspace_override.workspace_id == workspace_id
        })
        .map_or((0, 0), |workspace_override| {
            (workspace_override.pinned, workspace_override.granted)
        })
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

impl OrganizationStore {
    /// Write a workspace row, signed by `signer` over its database identity. Refused, with nothing
    /// written, where the signer's certificate does not cover it
    /// ([`OrganizationStore::refuse_uncovered`]).
    pub async fn write_workspace(
        &self,
        signer: &Signer<'_>,
        workspace: &WorkspaceRecord,
    ) -> Result<(), Error> {
        self.refuse_uncovered(signer, workspace_authority(workspace))
            .await?;

        let signature = sign(
            signer.key,
            signer.certificate,
            workspace_authority(workspace),
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

    /// Every workspace that verifies. One that does not is left out and logged, and the rest are
    /// read (effort 838, ticket 25; [`read_or_left_out`] says why).
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
    pub(super) async fn signed_workspaces(
        &self,
        organization_verifying_key: &[u8; VERIFYING_KEY_BYTES],
    ) -> Result<Vec<(String, WorkspaceRecord)>, Error> {
        let (certificates, revocations) = self.chain_rows().await?;
        let chain = Chain::new(organization_verifying_key, &certificates, &revocations);

        Ok(self
            .workspace_rows()
            .await?
            .into_iter()
            .filter(|row| {
                read_or_left_out(
                    &chain,
                    "workspace",
                    &row.record.id,
                    &row.certificate_id,
                    workspace_authority(&row.record),
                    &row.signature,
                )
            })
            .map(|row| (row.certificate_id, row.record))
            .collect())
    }

    /// Every workspace row as it lies, verified by nobody: what
    /// [`OrganizationStore::signed_workspaces`] verifies and the format 1 directory carries to the
    /// upgrade's judge.
    pub(super) async fn workspace_rows(&self) -> Result<Vec<SignedRow<WorkspaceRecord>>, Error> {
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
            workspaces.push(SignedRow {
                record: WorkspaceRecord {
                    id: text(&row, 0)?,
                    name_sealed: blob(&row, 1)?,
                    database_name: text(&row, 2)?,
                    database_hostname: text(&row, 3)?,
                    schema_version: integer(&row, 4)?,
                    created_at: integer(&row, 7)?,
                    updated_at: integer(&row, 8)?,
                },
                certificate_id: text(&row, 5)?,
                signature: blob(&row, 6)?,
            });
        }

        Ok(workspaces)
    }

    /// Write a grant row, signed by `signer` over the whole of it. Refused, with nothing written,
    /// where the signer's certificate does not cover it: `grantWorkspace`, and the root for a
    /// read-only grant ([`OrganizationStore::refuse_uncovered`]).
    pub async fn write_grant(&self, signer: &Signer<'_>, grant: &GrantRecord) -> Result<(), Error> {
        self.refuse_uncovered(signer, grant_authority(grant))
            .await?;
        self.insert_grant(signer, grant).await
    }

    /// [`OrganizationStore::write_grant`] around its check, for a test writing the row somebody
    /// holding the credential writes around the store: what every reader has to refuse.
    #[cfg(test)]
    pub(crate) async fn write_grant_around_the_check(
        &self,
        signer: &Signer<'_>,
        grant: &GrantRecord,
    ) -> Result<(), Error> {
        self.insert_grant(signer, grant).await
    }

    async fn insert_grant(&self, signer: &Signer<'_>, grant: &GrantRecord) -> Result<(), Error> {
        let signature = sign(signer.key, signer.certificate, grant_authority(grant))?;

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

    /// Every grant that verifies. One that does not is left out and logged, and the rest are read
    /// (effort 838, ticket 25; [`read_or_left_out`] says why).
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
    pub(super) async fn signed_grants(
        &self,
        organization_verifying_key: &[u8; VERIFYING_KEY_BYTES],
    ) -> Result<Vec<(String, GrantRecord)>, Error> {
        let (certificates, revocations) = self.chain_rows().await?;
        let chain = Chain::new(organization_verifying_key, &certificates, &revocations);

        Ok(self
            .grant_rows()
            .await?
            .into_iter()
            .filter(|row| {
                read_or_left_out(
                    &chain,
                    "grant",
                    &format!("{}/{}", row.record.member_id, row.record.workspace_id),
                    &row.certificate_id,
                    grant_authority(&row.record),
                    &row.signature,
                )
            })
            .map(|row| (row.certificate_id, row.record))
            .collect())
    }

    /// Every grant row as it lies, verified by nobody: what [`OrganizationStore::signed_grants`]
    /// verifies and the format 1 directory carries to the upgrade's judge.
    pub(super) async fn grant_rows(&self) -> Result<Vec<SignedRow<GrantRecord>>, Error> {
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
            grants.push(SignedRow {
                record: GrantRecord {
                    member_id: text(&row, 0)?,
                    workspace_id: text(&row, 1)?,
                    sealed_credential: blob(&row, 2)?,
                    access_level: text(&row, 3)?,
                    credential_expires_at: nullable_text(&row, 4)?,
                },
                certificate_id: text(&row, 5)?,
                signature: blob(&row, 6)?,
            });
        }

        Ok(grants)
    }

    /// Write a member's override for one workspace, signed by `signer` over the whole of it
    /// (effort 838, requirement 12 as amended a third time). Refused, with nothing written, where
    /// the signer's certificate does not cover it: `overrideMember`, a rank above the member, every
    /// flag it pins, record flags alone, and not the signer's own
    /// ([`OrganizationStore::refuse_uncovered`]).
    pub async fn write_workspace_override(
        &self,
        signer: &Signer<'_>,
        workspace_override: &WorkspaceOverrideRecord,
    ) -> Result<(), Error> {
        self.refuse_uncovered(signer, workspace_override_authority(workspace_override))
            .await?;
        self.insert_workspace_override(signer, workspace_override)
            .await
    }

    /// [`OrganizationStore::write_workspace_override`] around its check, for a test writing the
    /// row somebody holding the credential writes around the store: what every reader has to
    /// leave out.
    #[cfg(test)]
    pub(crate) async fn write_workspace_override_around_the_check(
        &self,
        signer: &Signer<'_>,
        workspace_override: &WorkspaceOverrideRecord,
    ) -> Result<(), Error> {
        self.insert_workspace_override(signer, workspace_override)
            .await
    }

    async fn insert_workspace_override(
        &self,
        signer: &Signer<'_>,
        workspace_override: &WorkspaceOverrideRecord,
    ) -> Result<(), Error> {
        let signature = sign(
            signer.key,
            signer.certificate,
            workspace_override_authority(workspace_override),
        )?;

        self.connection
            .execute(
                "INSERT OR REPLACE INTO \"workspace_override\" \
                 (\"member_id\", \"workspace_id\", \"pinned\", \"granted\", \"certificate_id\", \
                  \"signature\") \
                 VALUES (?, ?, ?, ?, ?, ?)",
                vec![
                    turso::Value::Text(workspace_override.member_id.clone()),
                    turso::Value::Text(workspace_override.workspace_id.clone()),
                    turso::Value::Integer(workspace_override.pinned),
                    turso::Value::Integer(workspace_override.granted),
                    turso::Value::Text(signer.certificate.id.clone()),
                    turso::Value::Blob(signature),
                ],
            )
            .await?;

        Ok(())
    }

    /// Remove a member's override for one workspace, which is what pinning nothing is.
    pub async fn delete_workspace_override(
        &self,
        member_id: &str,
        workspace_id: &str,
    ) -> Result<(), Error> {
        self.connection
            .execute(
                "DELETE FROM \"workspace_override\" \
                 WHERE \"member_id\" = ? AND \"workspace_id\" = ?",
                vec![
                    turso::Value::Text(member_id.to_string()),
                    turso::Value::Text(workspace_id.to_string()),
                ],
            )
            .await?;

        Ok(())
    }

    /// Remove every workspace override a member carries: what giving them another role, resetting
    /// them to their role and removing them do (effort 838, requirement 12 as amended a third
    /// time).
    pub async fn delete_workspace_overrides_of(&self, member_id: &str) -> Result<(), Error> {
        self.connection
            .execute(
                "DELETE FROM \"workspace_override\" WHERE \"member_id\" = ?",
                vec![turso::Value::Text(member_id.to_string())],
            )
            .await?;

        Ok(())
    }

    /// Every workspace override that verifies. One that does not is left out and logged, and the
    /// rest are read, as a grant is ([`read_or_left_out`]): a row left out pins nothing, so the
    /// member it was about holds what they hold across the organization there.
    pub async fn workspace_overrides(
        &self,
        organization_verifying_key: &[u8; VERIFYING_KEY_BYTES],
    ) -> Result<Vec<WorkspaceOverrideRecord>, Error> {
        Ok(self
            .signed_workspace_overrides(organization_verifying_key)
            .await?
            .into_iter()
            .map(|(_, workspace_override)| workspace_override)
            .collect())
    }

    /// Every workspace override, each verified, paired with the id of the certificate that signed
    /// it. Judged by the rank each member stands at by the role their verified row names, so the
    /// members are read first.
    pub(super) async fn signed_workspace_overrides(
        &self,
        organization_verifying_key: &[u8; VERIFYING_KEY_BYTES],
    ) -> Result<Vec<(String, WorkspaceOverrideRecord)>, Error> {
        let roles = self.roles(organization_verifying_key).await?;
        let members = self.members(organization_verifying_key).await?;
        let (certificates, revocations) = self.chain_rows().await?;
        let chain = Chain::new(organization_verifying_key, &certificates, &revocations)
            .with_roles(standings(&roles))
            .with_members(ranks_of_members(&members, &roles));

        Ok(self
            .workspace_override_rows()
            .await?
            .into_iter()
            .filter(|row| {
                read_or_left_out(
                    &chain,
                    "workspace_override",
                    &format!("{}/{}", row.record.member_id, row.record.workspace_id),
                    &row.certificate_id,
                    workspace_override_authority(&row.record),
                    &row.signature,
                )
            })
            .map(|row| (row.certificate_id, row.record))
            .collect())
    }

    /// Every workspace override row as it lies, verified by nobody.
    async fn workspace_override_rows(
        &self,
    ) -> Result<Vec<SignedRow<WorkspaceOverrideRecord>>, Error> {
        let mut rows = self
            .connection
            .query(
                "SELECT \"member_id\", \"workspace_id\", \"pinned\", \"granted\", \
                        \"certificate_id\", \"signature\" \
                 FROM \"workspace_override\" ORDER BY \"member_id\", \"workspace_id\"",
                (),
            )
            .await?;
        let mut workspace_overrides = Vec::new();

        while let Some(row) = rows.next().await? {
            workspace_overrides.push(SignedRow {
                record: WorkspaceOverrideRecord {
                    member_id: text(&row, 0)?,
                    workspace_id: text(&row, 1)?,
                    pinned: integer(&row, 2)?,
                    granted: integer(&row, 3)?,
                },
                certificate_id: text(&row, 4)?,
                signature: blob(&row, 5)?,
            });
        }

        Ok(workspace_overrides)
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

    /// Remove one grant: what a reset does with a grant it cannot re-seal, because the vault it
    /// was sealed to is gone and a grant nobody can open is a sign-in that fails.
    ///
    /// **The member's override for that workspace goes with it** (effort 838, ticket 53): it is
    /// set only on a workspace the member is in, and a grant given again later starts from what
    /// they may do across the organization.
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

        self.delete_workspace_override(member_id, workspace_id)
            .await
    }

    /// Remove one grant row and nothing beside it: what the change from format 1 drops, in an
    /// organization that holds no workspace overrides yet (`upgrade/format/two/`).
    pub async fn delete_grant_alone(
        &self,
        member_id: &str,
        workspace_id: &str,
    ) -> Result<(), Error> {
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

    /// Remove a workspace's row and every grant on it and nothing else, as
    /// [`OrganizationStore::delete_grant_alone`] does for a grant.
    pub async fn delete_workspace_alone(&self, workspace_id: &str) -> Result<(), Error> {
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

    /// Remove a workspace's row, every grant on it and every override for it, for the one moment
    /// requirement 4 permits it; the database it names is the port's to remove first.
    pub async fn delete_workspace(&self, workspace_id: &str) -> Result<(), Error> {
        self.connection
            .execute(
                "DELETE FROM \"grant\" WHERE \"workspace_id\" = ?",
                vec![turso::Value::Text(workspace_id.to_string())],
            )
            .await?;
        self.connection
            .execute(
                "DELETE FROM \"workspace_override\" WHERE \"workspace_id\" = ?",
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
}
