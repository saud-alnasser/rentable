//! The `role` table: the manager's, the member's and the custom roles, and what a member's
//! standing is read from them.

use std::collections::HashMap;

use crate::{
    error::{Error, RefusalReason},
    organization::{
        authority::{Chain, VERIFYING_KEY_BYTES, sign},
        role::permission::{self, OWNER_ROLE},
    },
};

use super::{
    MemberRecord, OrganizationStore, Signer, blob, integer, role_authority, signature::verified,
    text,
};

/// a role (effort 838): the manager's and the member's, written with the organization, and the
/// custom ones. The owner's role is a constant and never a row.
pub(super) const ROLE: &str = "CREATE TABLE IF NOT EXISTS \"role\" (\
        \"id\" TEXT PRIMARY KEY NOT NULL, \
        \"kind\" TEXT NOT NULL, \
        \"name_sealed\" BLOB NOT NULL, \
        \"mask\" INTEGER NOT NULL, \
        \"rank\" INTEGER NOT NULL, \
        \"certificate_id\" TEXT NOT NULL, \
        \"signature\" BLOB NOT NULL)";

/// A `role` row (effort 838): the whole of it is under signature.
///
/// The manager's and the member's are written with the organization and keep the built-in ids;
/// a custom role's id is drawn when it is made. `name_sealed` is empty on the built-in two, whose
/// names the interface gives in the reader's language.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RoleRecord {
    pub id: String,
    /// `manager`, `member` or `custom`.
    pub kind: String,
    pub name_sealed: Vec<u8>,
    pub mask: i64,
    pub rank: i64,
}

impl OrganizationStore {
    /// Write a role row, signed by `signer` over every field of it. Refused, with nothing written,
    /// where the signer's certificate does not cover it: a mask carrying a flag the certificate
    /// does not, or a rank not below it ([`OrganizationStore::refuse_uncovered`]).
    pub async fn write_role(&self, signer: &Signer<'_>, role: &RoleRecord) -> Result<(), Error> {
        self.refuse_uncovered(signer, role_authority(role)).await?;
        self.insert_role(signer, role).await
    }

    /// [`OrganizationStore::write_role`] around its check, for a test writing the row somebody
    /// holding the credential writes around the store: what every reader has to refuse.
    #[cfg(test)]
    pub(crate) async fn write_role_around_the_check(
        &self,
        signer: &Signer<'_>,
        role: &RoleRecord,
    ) -> Result<(), Error> {
        self.insert_role(signer, role).await
    }

    async fn insert_role(&self, signer: &Signer<'_>, role: &RoleRecord) -> Result<(), Error> {
        let signature = sign(signer.key, signer.certificate, role_authority(role))?;

        self.connection
            .execute(
                "INSERT OR REPLACE INTO \"role\" \
                 (\"id\", \"kind\", \"name_sealed\", \"mask\", \"rank\", \"certificate_id\", \
                  \"signature\") \
                 VALUES (?, ?, ?, ?, ?, ?, ?)",
                vec![
                    turso::Value::Text(role.id.clone()),
                    turso::Value::Text(role.kind.clone()),
                    turso::Value::Blob(role.name_sealed.clone()),
                    turso::Value::Integer(role.mask),
                    turso::Value::Integer(role.rank),
                    turso::Value::Text(signer.certificate.id.clone()),
                    turso::Value::Blob(signature),
                ],
            )
            .await?;

        Ok(())
    }

    /// Remove a role row. Its holders are the caller's to have moved first.
    pub async fn delete_role(&self, id: &str) -> Result<(), Error> {
        self.connection
            .execute(
                "DELETE FROM \"role\" WHERE \"id\" = ?",
                vec![turso::Value::Text(id.to_string())],
            )
            .await?;

        Ok(())
    }

    /// Every role row, highest rank first, each verified before it is returned. The owner's role
    /// is a constant and is not among them.
    pub async fn roles(
        &self,
        organization_verifying_key: &[u8; VERIFYING_KEY_BYTES],
    ) -> Result<Vec<RoleRecord>, Error> {
        Ok(self
            .signed_roles(organization_verifying_key)
            .await?
            .into_iter()
            .map(|(_, role)| role)
            .collect())
    }

    /// The mask and the rank of one role: the owner's constants, or its verified row's. Refused by
    /// name for a role nobody holds.
    pub async fn role_standing(
        &self,
        organization_verifying_key: &[u8; VERIFYING_KEY_BYTES],
        role_id: &str,
    ) -> Result<(i64, i64), Error> {
        if role_id == permission::OWNER {
            return Ok((OWNER_ROLE.mask, OWNER_ROLE.rank));
        }

        self.roles(organization_verifying_key)
            .await?
            .into_iter()
            .find(|role| role.id == role_id)
            .map(|role| (role.mask, role.rank))
            .ok_or_else(|| {
                Error::refused(
                    RefusalReason::RoleUnknown,
                    "that role is not in this organization",
                )
            })
    }

    /// Every role row, each verified, paired with the id of the certificate that signed it.
    pub(super) async fn signed_roles(
        &self,
        organization_verifying_key: &[u8; VERIFYING_KEY_BYTES],
    ) -> Result<Vec<(String, RoleRecord)>, Error> {
        let (certificates, revocations) = self.chain_rows().await?;
        let chain = Chain::new(organization_verifying_key, &certificates, &revocations);
        let mut roles = Vec::new();

        for (certificate_id, signature, role) in self.role_rows().await? {
            verified(
                &chain,
                "role",
                &role.id,
                &certificate_id,
                role_authority(&role),
                &signature,
            )?;

            roles.push((certificate_id, role));
        }

        Ok(roles)
    }

    /// Every role row with nothing checked, for the one read that checks nothing
    /// ([`OrganizationStore::members_unverified`]) and for the writer's check of its own row
    /// ([`OrganizationStore::refuse_uncovered`]), which judges a write of ours and not a row of
    /// anybody else's.
    pub(super) async fn roles_unverified(&self) -> Result<Vec<RoleRecord>, Error> {
        Ok(self
            .role_rows()
            .await?
            .into_iter()
            .map(|(_, _, role)| role)
            .collect())
    }

    pub(super) async fn role_rows(&self) -> Result<Vec<(String, Vec<u8>, RoleRecord)>, Error> {
        let mut rows = self
            .connection
            .query(
                "SELECT \"id\", \"kind\", \"name_sealed\", \"mask\", \"rank\", \"certificate_id\", \
                        \"signature\" \
                 FROM \"role\" ORDER BY \"rank\" DESC, \"id\"",
                (),
            )
            .await?;
        let mut roles = Vec::new();

        while let Some(row) = rows.next().await? {
            roles.push((
                text(&row, 5)?,
                blob(&row, 6)?,
                RoleRecord {
                    id: text(&row, 0)?,
                    kind: text(&row, 1)?,
                    name_sealed: blob(&row, 2)?,
                    mask: integer(&row, 3)?,
                    rank: integer(&row, 4)?,
                },
            ));
        }

        Ok(roles)
    }
}

/// Every role's `(mask, rank)` by id, as a [`Chain`] and [`covers`] are told them.
pub(super) fn standings(roles: &[RoleRecord]) -> HashMap<String, (i64, i64)> {
    roles
        .iter()
        .map(|role| (role.id.clone(), (role.mask, role.rank)))
        .collect()
}

/// The rank of a role by id: the owner's constant, or the role row's. `None` for a role nobody
/// holds.
pub(super) fn rank_in(role_id: &str, roles: &HashMap<String, (i64, i64)>) -> Option<i64> {
    if role_id == permission::OWNER {
        return Some(OWNER_ROLE.rank);
    }

    roles.get(role_id).map(|(_, rank)| *rank)
}

/// The rank each member in stands at by the role their verified row names, by id, as a [`Chain`]
/// judges a workspace override by: a removed member, and one whose row grants nothing, are left
/// out, and nobody overrides them.
pub(super) fn ranks_of_members(
    members: &[MemberRecord],
    roles: &[RoleRecord],
) -> HashMap<String, i64> {
    let roles = standings(roles);

    members
        .iter()
        .filter(|member| member.covered && member.removed_at.is_none())
        .filter_map(|member| rank_in(&member.role_id, &roles).map(|rank| (member.id.clone(), rank)))
        .collect()
}

/// A member's effective permissions: their role's mask exclusive-or'd with their override
/// (requirement 6), the owner's every flag. `None` for a role nobody holds.
pub(super) fn effective_of(role_id: &str, override_mask: i64, masks: &[RoleRecord]) -> Option<i64> {
    if role_id == permission::OWNER {
        return Some(OWNER_ROLE.mask);
    }

    masks
        .iter()
        .find(|role| role.id == role_id)
        .map(|role| permission::effective(role.mask, override_mask))
}
