//! Sealing: what each row puts under signature, the writer's check of its own row before it is
//! signed, the verdict on a row as it is read, and the re-signing of every row a certificate
//! signed. The repository methods beside it sign and verify through these and nothing else.

use std::collections::HashMap;

use crate::{
    diagnostics,
    error::{Error, RefusalReason},
    organization::authority::{
        AdministratorKey, Authority, Certificate, Chain, GrantAuthority, InvitationAuthority,
        MarkAuthority, MemberAuthority, RoleAuthority, VERIFYING_KEY_BYTES, WorkspaceAuthority,
        WorkspaceOverrideAuthority, covers, needed_for,
    },
};

use super::{
    GrantRecord, InvitationRecord, MarkRecord, MemberLockRecord, MemberRecord,
    OrganizationNameRecord, OrganizationStore, RoleRecord, WorkspaceOverrideRecord,
    WorkspaceRecord,
    role::{rank_in, ranks_of_members, standings},
};

/// A signed row as it lies, verified by nobody yet: the record, the id of the certificate that
/// signed it, and the signature. The one reader of each table that has a record yields these
/// (`workspace_rows`, `grant_rows`, `invitation_rows`, `mark_row`), and both the verified reads of
/// this format and the format 1 directory the upgrade judges are built on them, so each table's
/// column list and row mapping are written once.
#[derive(Clone, Debug)]
pub struct SignedRow<T> {
    pub record: T,
    pub certificate_id: String,
    pub signature: Vec<u8>,
}

/// Who is writing: a member's signing key and the certificate that makes it an authority.
///
/// Taken together so that `authority::sign` can refuse a key the certificate does not name, once,
/// at the write, rather than every reader discovering it afterwards.
pub struct Signer<'a> {
    pub key: &'a AdministratorKey,
    pub certificate: &'a Certificate,
}

impl OrganizationStore {
    /// Refuse a row `signer`'s certificate does not cover, naming what it would need
    /// (`authority::needed_for`), before a byte of it is written (effort 838, the row-kind table).
    ///
    /// **A self-check of the writer, and not the security boundary.** What stops a row reaching
    /// wider than its certificate is every reader refusing it ([`Chain::verify`]), because a member
    /// holding the credential writes around this module as easily as through it. What this stops
    /// is a command of ours writing a row every reader then refuses, which refuses the directory for
    /// everybody by name: every command is to refuse its act up front, and this is what makes one
    /// that did not fail here rather than on every other machine.
    ///
    /// **The role rows are read unverified**, because what is being judged is our own write and
    /// not somebody else's row: the replica's roles as they stand are the ones a reader will judge
    /// this row by, and verifying them again on every write would buy nothing a read does not
    /// already refuse. The signer's own walk and revocations are not asked, for the same reason.
    /// **The member's live certificates are**, since a member row's signer has to outrank them
    /// ([`covers`]), and they are judged under the key the `organization` row carries: our own
    /// write asks what a reader holding that key will make of it, and a replica with no
    /// organization row yet has nobody certified to outrank.
    pub(super) async fn refuse_uncovered(
        &self,
        signer: &Signer<'_>,
        authority: Authority<'_>,
    ) -> Result<(), Error> {
        if self.covered(signer, authority).await? {
            return Ok(());
        }

        Err(Error::refused(
            RefusalReason::RoleLacksAct,
            format!(
                "this writes a row that needs {} to sign, and your certificate does not carry it. \
                 nothing was written",
                needed_for(authority)
            ),
        ))
    }

    /// Whether `signer`'s certificate covers a row, judged as [`OrganizationStore::refuse_uncovered`]
    /// judges it: what a write that is not refused asks before it writes, as the backfill of the
    /// members' locks does (`member::lock::lock_unset_accounts`, effort 851).
    pub async fn covered(
        &self,
        signer: &Signer<'_>,
        authority: Authority<'_>,
    ) -> Result<bool, Error> {
        let about = match authority {
            Authority::Member(member) => Some(member.id),
            Authority::WorkspaceOverride(workspace_override) => Some(workspace_override.member_id),
            Authority::MemberLock { member_id, .. } => Some(member_id),
            _ => None,
        };
        let organization = match about {
            Some(_) => self.organization().await?,
            None => None,
        };
        let certified_rank = match (&organization, about) {
            (Some(organization), Some(member_id)) => {
                let (certificates, revocations) = self.chain_rows().await?;

                Chain::new(&organization.verifying_key, &certificates, &revocations)
                    .certified_rank_of(member_id)
            }
            _ => None,
        };
        let roles = match about {
            Some(_) => standings(&self.roles_unverified().await?),
            None => HashMap::new(),
        };
        // the member a workspace override or a lock is about, as their row reads under the
        // organization row's key: in, and granted something, or nobody to override (effort 838,
        // ticket 53) or to unlock (effort 851).
        let member_rank = match (&organization, authority) {
            (
                Some(organization),
                Authority::WorkspaceOverride(_) | Authority::MemberLock { .. },
            ) => self
                .member(&organization.verifying_key, about.unwrap_or_default())
                .await?
                .filter(|member| member.covered && member.removed_at.is_none())
                .and_then(|member| rank_in(&member.role_id, &roles)),
            _ => None,
        };

        Ok(covers(
            signer.certificate,
            authority,
            |role_id| roles.get(role_id).copied(),
            |_| certified_rank,
            |_| member_rank,
        ))
    }

    /// Re-sign every row a certificate signed, under `signer`, and say how many rows moved.
    ///
    /// **The one routine reset, removal, narrowing and the handover share, so they cannot drift.**
    /// A certificate is retired by a revocation, or replaced by one naming a fresh key, and either
    /// way every row it signed would fail on read: `members` and `roles` refuse the whole read on
    /// the first such row, and `grants`, `invitations`, `workspaces` and `mark` leave it out, which
    /// takes it from whoever it was for. So before the certificate is retired, the rows it signed
    /// are re-signed under the actor. After it, those rows name the actor's certificate and verify
    /// under it, and retiring the old one bricks nothing and loses nothing.
    ///
    /// **Refused, naming what is needed, where the actor's certificate could not sign one of those
    /// rows** (effort 838): re-signing a grant takes `grantWorkspace`, a member row a rank above the
    /// member, and so on (`authority::needed_for`). The rows are read and every one is judged before
    /// the first is written, so a refusal leaves nothing half moved. Deleting the row instead is
    /// not offered: it would take something away from somebody who did nothing. **A member row
    /// the certificate signed that it no longer covers refuses the act too**, by name, since
    /// signing it again under the actor would carry its content forward as authority; the member
    /// is removed first, which the refusal says (effort 838, the re-check of ticket 20).
    ///
    /// The rows are read through the verified readers, so a member or role row that does not
    /// verify under the still-live old certificate refuses the whole operation, and a workspace,
    /// grant, invitation or mark row that does not is left out of it, rather than either being
    /// re-signed blind; the actor never launders a forgery into their own signature. Each row is
    /// written back through the ordinary `write_*` path, which stamps `signer`'s certificate id and
    /// a fresh signature and leaves every other column as it stood.
    pub async fn re_sign_rows_of_certificate(
        &self,
        organization_verifying_key: &[u8; VERIFYING_KEY_BYTES],
        certificate_id: &str,
        signer: &Signer<'_>,
    ) -> Result<usize, Error> {
        self.re_sign_rows_of_certificates_but(
            organization_verifying_key,
            &[certificate_id],
            signer,
            &[],
        )
        .await
    }

    /// [`OrganizationStore::re_sign_rows_of_certificate`] over the rows of every certificate
    /// named, read once and moved together, leaving alone the member rows of the members named:
    /// rows the caller is about to write afresh, as the handover writes the two whose roles swap,
    /// and which the new signer may not be able to sign as they stand.
    ///
    /// **Several certificates in one pass, because every row is read under the key given**, and
    /// the handover retires two under a key its first write already stops verifying: the
    /// founder's root, and the certificate the new owner held before it (effort 838). Read one
    /// after the other, the second read would meet the first one's rows signed under a root the
    /// key being left never issued.
    pub async fn re_sign_rows_of_certificates_but(
        &self,
        organization_verifying_key: &[u8; VERIFYING_KEY_BYTES],
        certificate_ids: &[&str],
        signer: &Signer<'_>,
        rewritten: &[&str],
    ) -> Result<usize, Error> {
        if certificate_ids.contains(&signer.certificate.id.as_str()) {
            return Err(Error::Integrity {
                message: "a certificate cannot re-sign its own rows onto itself".to_string(),
            });
        }

        let of = |signed_by: &String| certificate_ids.contains(&signed_by.as_str());
        let roles: Vec<RoleRecord> = self
            .signed_roles(organization_verifying_key)
            .await?
            .into_iter()
            .filter(|(signed_by, _)| of(signed_by))
            .map(|(_, role)| role)
            .collect();
        let members: Vec<MemberRecord> = self
            .signed_members(organization_verifying_key)
            .await?
            .into_iter()
            .filter(|(signed_by, member)| of(signed_by) && !rewritten.contains(&member.id.as_str()))
            .map(|(_, member)| member)
            .collect();
        let workspaces: Vec<WorkspaceRecord> = self
            .signed_workspaces(organization_verifying_key)
            .await?
            .into_iter()
            .filter(|(signed_by, _)| of(signed_by))
            .map(|(_, workspace)| workspace)
            .collect();
        let grants: Vec<GrantRecord> = self
            .signed_grants(organization_verifying_key)
            .await?
            .into_iter()
            .filter(|(signed_by, _)| of(signed_by))
            .map(|(_, grant)| grant)
            .collect();
        let invitations: Vec<InvitationRecord> = self
            .signed_invitations(organization_verifying_key)
            .await?
            .into_iter()
            .filter(|(signed_by, _)| of(signed_by))
            .map(|(_, invitation)| invitation)
            .collect();
        let mark = self
            .signed_mark(organization_verifying_key)
            .await?
            .filter(|(signed_by, _)| of(signed_by))
            .map(|(_, mark)| mark);
        let workspace_overrides: Vec<WorkspaceOverrideRecord> = self
            .signed_workspace_overrides(organization_verifying_key)
            .await?
            .into_iter()
            .filter(|(signed_by, _)| of(signed_by))
            .map(|(_, workspace_override)| workspace_override)
            .collect();
        // the organization's signed name, which only the root signs: the handover retires the
        // founder's root, and the new owner's signs it again (effort 851, requirement 29).
        let organization_name = self
            .signed_organization_name(organization_verifying_key)
            .await?
            .filter(|(signed_by, _)| of(signed_by))
            .map(|(_, name)| name);
        // every member's lock the certificate signed, locked or not (effort 851, requirement 35):
        // a lock left behind under a retired certificate reads locked, and an unlock would be
        // undone by the act that retired its signer. Those the signer cannot sign are left below.
        let member_locks: Vec<MemberLockRecord> = self
            .signed_member_locks(organization_verifying_key)
            .await?
            .into_iter()
            .filter(|(signed_by, _)| of(signed_by))
            .map(|(_, lock)| lock)
            .collect();

        // a member row its certificate no longer covers is not signed again under anybody: that
        // would make the role somebody below the member named real under a signer who covers it
        // (effort 838, the re-check of ticket 20). The member is removed first, which writes
        // their row under the remover, and the act is refused by name until they have been.
        if members.iter().any(|member| !member.covered) {
            return Err(Error::refused(
                RefusalReason::RoleUnsettled,
                "a row this certificate signed was written for a member it could not write it \
                 for. somebody ranked above that member removes them first, and makes them an \
                 account again. nothing was changed",
            ));
        }

        // every row judged before the first is written. The masks and the ranks are every role's
        // as it stands, so a member row is judged by the role it names.
        let all_roles = self.roles(organization_verifying_key).await?;
        let all_members = self.members(organization_verifying_key).await?;
        let (certificates, revocations) = self.chain_rows().await?;
        let chain = Chain::new(organization_verifying_key, &certificates, &revocations)
            .with_roles(standings(&all_roles))
            .with_members(ranks_of_members(&all_members, &all_roles));
        let authorities = roles
            .iter()
            .map(role_authority)
            .chain(members.iter().map(member_authority))
            .chain(workspaces.iter().map(workspace_authority))
            .chain(grants.iter().map(grant_authority))
            .chain(invitations.iter().map(invitation_authority))
            .chain(mark.iter().map(mark_authority))
            .chain(workspace_overrides.iter().map(workspace_override_authority))
            .chain(organization_name.iter().map(organization_name_authority));
        // **a lock the signer cannot sign again never refuses the act** (effort 851): it is left
        // as it lies, and once its certificate is retired it reads as a row that does not verify
        // reads, locked. A removal or a reset is never held up by somebody's lock.
        let member_locks: Vec<MemberLockRecord> = member_locks
            .into_iter()
            .filter(|lock| {
                all_members
                    .iter()
                    .find(|member| member.id == lock.member_id)
                    .is_some_and(|member| {
                        chain.covers(
                            signer.certificate,
                            member_lock_authority(lock, &member.signing_public_key),
                        )
                    })
            })
            .collect();

        for authority in authorities {
            if !chain.covers(signer.certificate, authority) {
                return Err(Error::refused(
                    RefusalReason::RoleLacksAct,
                    format!(
                        "a row the retiring certificate signed needs {} to sign again, and yours \
                         does not carry it. nothing was changed",
                        needed_for(authority)
                    ),
                ));
            }
        }

        for role in &roles {
            self.write_role(signer, role).await?;
        }

        for member in &members {
            self.write_member(signer, member).await?;
        }

        for workspace in &workspaces {
            self.write_workspace(signer, workspace).await?;
        }

        for grant in &grants {
            self.write_grant(signer, grant).await?;
        }

        for invitation in &invitations {
            self.write_invitation(signer, invitation).await?;
        }

        if let Some(mark) = &mark {
            self.write_mark(signer, mark).await?;
        }

        for workspace_override in &workspace_overrides {
            self.write_workspace_override(signer, workspace_override)
                .await?;
        }

        if let Some(name) = &organization_name {
            self.write_organization_name(signer, name).await?;
        }

        // judged against the chain above, under the key the rows were read by; a check against
        // the organization row would read them under the key a handover is leaving, over roles
        // this pass has already moved.
        for lock in &member_locks {
            self.insert_member_lock(signer, lock).await?;
        }

        Ok(roles.len()
            + members.len()
            + workspaces.len()
            + grants.len()
            + invitations.len()
            + usize::from(mark.is_some())
            + workspace_overrides.len()
            + usize::from(organization_name.is_some())
            + member_locks.len())
    }
}

/// What a member row puts under signature, from the record.
pub(super) fn member_authority(member: &MemberRecord) -> Authority<'_> {
    Authority::Member(member_of(member))
}

/// The same, as the member read hands it to [`Chain::read_member`].
pub(super) fn member_of(member: &MemberRecord) -> MemberAuthority<'_> {
    MemberAuthority {
        id: &member.id,
        public_key: &member.vault.public_key,
        signing_public_key: &member.signing_public_key,
        role_id: &member.role_id,
        override_mask: member.override_mask,
        removed_at: member.removed_at,
        owner_seed_sealed: member.owner_seed_sealed.as_deref(),
    }
}

/// What a workspace row puts under signature, from the record.
pub(crate) fn workspace_authority(workspace: &WorkspaceRecord) -> Authority<'_> {
    Authority::Workspace(WorkspaceAuthority {
        database_name: &workspace.database_name,
        database_hostname: &workspace.database_hostname,
    })
}

/// What a grant row puts under signature, from the record.
pub(crate) fn grant_authority(grant: &GrantRecord) -> Authority<'_> {
    Authority::Grant(GrantAuthority {
        member_id: &grant.member_id,
        workspace_id: &grant.workspace_id,
        sealed_credential: &grant.sealed_credential,
        access_level: &grant.access_level,
        credential_expires_at: grant.credential_expires_at.as_deref(),
    })
}

/// What an invitation row puts under signature, from the record.
pub(crate) fn invitation_authority(invitation: &InvitationRecord) -> Authority<'_> {
    Authority::Invitation(InvitationAuthority {
        id: &invitation.id,
        member_id: &invitation.member_id,
        expires_at: invitation.expires_at,
    })
}

/// What the mark row puts under signature, from the record.
pub(crate) fn mark_authority(mark: &MarkRecord) -> Authority<'_> {
    Authority::Mark(MarkAuthority {
        image_sealed: &mark.image_sealed,
        media_type: &mark.media_type,
        updated_by: &mark.updated_by,
        updated_at: mark.updated_at,
    })
}

/// What the organization's signed name puts under signature, from the record.
pub(crate) fn organization_name_authority(name: &OrganizationNameRecord) -> Authority<'_> {
    Authority::OrganizationName {
        name_sealed: &name.name_sealed,
        updated_at: name.updated_at,
    }
}

/// What a member's lock puts under signature, from the record and the signing key the member's
/// row holds (`member_key`), which is what ties the lock to this run of their account: a reset
/// draws a new one (effort 851, requirements 35 and 37).
pub(crate) fn member_lock_authority<'a>(
    lock: &'a MemberLockRecord,
    member_key: &'a [u8],
) -> Authority<'a> {
    Authority::MemberLock {
        member_id: &lock.member_id,
        member_key,
        locked: lock.locked,
        updated_at: lock.updated_at,
    }
}

/// What a workspace override row puts under signature, from the record.
pub(in crate::organization) fn workspace_override_authority(
    workspace_override: &WorkspaceOverrideRecord,
) -> Authority<'_> {
    Authority::WorkspaceOverride(WorkspaceOverrideAuthority {
        member_id: &workspace_override.member_id,
        workspace_id: &workspace_override.workspace_id,
        pinned: workspace_override.pinned,
        granted: workspace_override.granted,
    })
}

/// What a role row puts under signature, from the record.
pub(crate) fn role_authority(role: &RoleRecord) -> Authority<'_> {
    Authority::Role(RoleAuthority {
        id: &role.id,
        kind: &role.kind,
        name_sealed: &role.name_sealed,
        mask: role.mask,
        rank: role.rank,
    })
}

/// One row's verdict, through the only verifier there is ([`Chain::verify`]).
///
/// A row naming a certificate that does not exist fails there as well: an unknown certificate is
/// an authority nobody issued, which is the same thing as a forged one from where a reader stands.
pub(super) fn verified(
    chain: &Chain<'_>,
    table: &str,
    id: &str,
    certificate_id: &str,
    authority: Authority<'_>,
    signature: &[u8],
) -> Result<(), Error> {
    chain
        .verify(certificate_id, authority, signature)
        .map_err(|error| Error::Integrity {
            message: format!("the {table} row {id} is refused: {error}"),
        })
}

/// Whether a workspace, grant, invitation or mark row verifies, through the same verifier as
/// [`verified`]; one that does not is logged by its table and key and left out of the read.
///
/// **Left out rather than refusing the read, for these four kinds** (effort 838, ticket 25). A row
/// that does not verify grants nothing either way, so leaving it out takes nothing away that the
/// chain gave: what it saves is every other row beside it, which one row signed under a revoked or
/// an unknown certificate, or past what its certificate covers, used to make unreadable for
/// everybody. A removed manager's old machine pushing late is the ordinary case, and a member
/// writing one around the command the other. **Member and role rows still refuse the read**
/// (ticket 20): a member row is what every gate reads a person's standing from, and a directory
/// read without one forged row would look whole while missing a person.
pub(super) fn read_or_left_out(
    chain: &Chain<'_>,
    table: &str,
    id: &str,
    certificate_id: &str,
    authority: Authority<'_>,
    signature: &[u8],
) -> bool {
    match chain.verify(certificate_id, authority, signature) {
        Ok(()) => true,
        Err(error) => {
            diagnostics::warn("organization.row.leftOut")
                .with("table", table)
                .with("row", id)
                .with("reason", error.to_string())
                .write();

            false
        }
    }
}
