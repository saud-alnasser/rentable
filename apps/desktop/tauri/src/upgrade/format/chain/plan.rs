//! the upgrade's plan: what a member of format 1 carries into format 2, each row judged under
//! whichever format signed it, and the steps, in order, that the transaction applies (ticket 23).

use std::collections::HashMap;

use crate::{
    diagnostics,
    error::Error,
    organization::{
        authority::{
            AdministratorKey, Authority, Certificate, Chain, FormatOneCertificate, Issue,
            MemberAuthority, OrganizationKey, Reading, Revocation, VERIFYING_KEY_BYTES,
            issue_certificate, issue_root_certificate,
        },
        role::permission::{self, Flag, MANAGER_ROLE, MEMBER_ROLE, OWNER_ROLE, RECORD_FLAGS},
        store::{
            FormatOneDirectory, FormatOneMemberRow, FormatOneReshape, GrantRecord,
            InvitationRecord, MarkRecord, MemberRecord, OrganizationStore, RoleRecord, SignedRow,
            Signer, WorkspaceRecord, grant_authority, invitation_authority, mark_authority,
            role_authority, workspace_authority,
        },
    },
};

use super::{
    ADMINISTRATOR, FORMAT_ONE_ACTS, FORMAT_ONE_CHANGE_ROLE, REMOVED, format_one_signature,
};
use crate::upgrade::format::{
    runner::Opened,
    signature::{FormatOneRow, verify_format_one},
};

/// The id format 1 gave a member's certificate, which the certificate this format issues them
/// keeps, so a row the old build signs under it after the upgrade still names a certificate that
/// exists (the module comment says why).
fn format_one_certificate_id(member_id: &str) -> String {
    format!("cert-{member_id}")
}

/// One write of the upgrade, in the order [`planned`] puts them.
#[derive(Clone, Debug)]
pub(crate) enum Step {
    /// one statement of the member table's reshape, which the table still needs.
    Reshape(FormatOneReshape),
    /// every table of this format, where it does not stand yet: format 2's, and none a later
    /// format adds, which that format's change creates.
    Schema,
    /// a row that verified under neither format.
    Drop(Dropped),
    Certificate(Certificate),
    Role(RoleRecord),
    Member(MemberRecord),
    /// a standing handover offer, withdrawn.
    WithdrawOffer(String),
    Workspace(WorkspaceRecord),
    Grant(GrantRecord),
    Invitation(InvitationRecord),
    Mark(MarkRecord),
    /// format 1's certificate table, gone.
    DropFormatOneCertificates,
}

/// What an upgrade writes: the steps, and the root they are signed under, where any is signed.
pub(crate) struct Plan {
    pub(crate) root: Option<Certificate>,
    pub(crate) steps: Vec<Step>,
}

/// Judge the organization as it stands and plan its upgrade, or the rest of one cut short.
///
/// **The order as built**, and why each step sits where it does:
///
/// 1. the reshape of the member table, only what it still needs: the columns added, then the role
///    word and the mask dropped, before any row is written, for the measured reason
///    `OrganizationStore::format_one_reshape` records;
/// 2. every table of this format, where it does not stand;
/// 3. every row that verified under neither format, removed, so nothing below is taken with it;
/// 4. the owner's root certificate, every role row that verifies, and the two built-in role rows
///    where none of them is either;
/// 5. for every member, their certificate where they are live and not the owner, and their row;
/// 6. a standing handover offer withdrawn;
/// 7. every workspace, grant and invitation, and the mark, signed again from the root;
/// 8. format 1's certificate table dropped, which nothing can judge a format 1 row without, so it
///    goes once there is none left.
///
/// The `format` row follows, last, and the runner writes it (`runner/`): until it is written
/// the organization reads as older everywhere. An organization that carries nothing of format 1
/// any more had everything written but that row, and is given no step here; the runner does not
/// walk this change over it at all.
///
/// **Members are judged against the role rows that verify**, where a `role` table stands (ticket
/// 25), so the holder of a custom role is carried in it rather than dropped for naming a role the
/// built-in two do not include; each such row is signed again from the root with the rest. The
/// caller never plans over an organization holding a root, which is the only one whose role rows
/// verify, so this is what judges a row as it stands and not a path the owner's sign-in takes.
pub(crate) async fn planned(
    store: &OrganizationStore,
    organization_key: &OrganizationKey,
    signing_key: &AdministratorKey,
    opened: &Opened,
    now: i64,
) -> Result<Plan, Error> {
    if !store.carries_format_one().await? {
        return Ok(Plan {
            root: None,
            steps: Vec::new(),
        });
    }

    let pinned = organization_key.verifying_key();
    let mut steps: Vec<Step> = store
        .format_one_reshape()
        .await?
        .into_iter()
        .map(Step::Reshape)
        .collect();

    steps.push(Step::Schema);

    let directory = store.format_one_directory().await?;
    let (certificates, revocations) = store.chain_rows_if_any().await?;
    let role_rows = store.role_rows_if_any().await?;
    let judge = Judge::new(
        &pinned,
        &directory,
        Some(&signing_key.verifying_key()),
        &certificates,
        &revocations,
        &role_rows,
    );
    let owner_id = opened.member_id.as_str();
    let judged = judged(&judge, &directory, owner_id);

    for dropped in &judged.dropped {
        diagnostics::warn("organization.upgrade.rowDropped")
            .with("table", dropped.row.table())
            .with("row", dropped.row.id())
            .with("reason", dropped.reason.as_str())
            .write();

        steps.push(Step::Drop(dropped.clone()));
    }

    let issued_at = now.to_string();
    let root = issue_root_certificate(
        organization_key,
        &format_one_certificate_id(owner_id),
        owner_id,
        &signing_key.verifying_key(),
        &issued_at,
    );

    steps.push(Step::Certificate(root.clone()));

    // every role row that verified, signed again from the root, and the two built-in roles that
    // are rows, as the first run writes them, where no row of theirs did; all before any member row
    // names one.
    steps.extend(judge.roles.iter().cloned().map(Step::Role));

    for built_in in [MANAGER_ROLE, MEMBER_ROLE] {
        if !judge.roles.iter().any(|role| role.id == built_in.id) {
            steps.push(Step::Role(RoleRecord {
                id: built_in.id.to_string(),
                kind: built_in.id.to_string(),
                name_sealed: Vec::new(),
                mask: built_in.mask,
                rank: built_in.rank,
            }));
        }
    }

    // a certificate for every live member, from the root, over their own signing key; the owner's
    // is the root. Then every member row, which the root covers whatever it names.
    for (member, carried) in &judged.members {
        let owner = member.id == owner_id;

        if !owner && !carried.removed {
            steps.push(Step::Certificate(issue_certificate(
                signing_key,
                &root,
                Issue {
                    id: &format_one_certificate_id(&member.id),
                    member_id: &member.id,
                    signing_public_key: &member.signing_public_key,
                    ceiling: carried.effective,
                    rank: carried.rank,
                    issued_at: &issued_at,
                },
            )?));
        }

        steps.push(Step::Member(MemberRecord {
            id: member.id.clone(),
            username_sealed: member.username_sealed.clone(),
            vault: member.vault.clone(),
            // the owner's signing key is what their own secret derives, and the root names it;
            // everybody else's is the one their row carried under signature.
            signing_public_key: if owner {
                signing_key.verifying_key()
            } else {
                member.signing_public_key
            },
            sealed_content_key: member.sealed_content_key.clone(),
            role_id: carried.role_id.clone(),
            override_mask: carried.override_mask,
            removed_at: carried.removed.then_some(member.updated_at),
            effective: carried.effective,
            covered: true,
            // the owner opened their vault with their own password, which is what the column
            // asks of a member, and it is unsigned: whatever it said is not carried onto them.
            must_change_password: !owner && member.must_change_password,
            created_at: member.created_at,
            updated_at: member.updated_at,
            session_epoch: member.session_epoch,
            // a standing offer is withdrawn, and this is the seal it carried.
            owner_seed_sealed: None,
        }));
    }

    // a standing offer of the organization is withdrawn: its row goes, and its seal went above.
    // A completed succession stays, since a machine that pinned an older key walks it.
    // A replica with no succession table has no offer to withdraw, as `settled` reads it.
    for succession in store.successions_if_any().await? {
        if succession.accepted_at.is_none() {
            steps.push(Step::WithdrawOffer(succession.id));
        }
    }

    steps.extend(judged.workspaces.into_iter().map(Step::Workspace));
    steps.extend(judged.grants.into_iter().map(Step::Grant));
    steps.extend(judged.invitations.into_iter().map(Step::Invitation));
    steps.extend(judged.mark.into_iter().map(Step::Mark));
    steps.push(Step::DropFormatOneCertificates);

    Ok(Plan {
        root: Some(root),
        steps,
    })
}

/// Write `steps`, in order, the rows among them signed under `root` with `key`.
pub(crate) async fn applied(
    store: &OrganizationStore,
    key: &AdministratorKey,
    root: Option<&Certificate>,
    steps: &[Step],
) -> Result<(), Error> {
    let signer = root.map(|certificate| Signer { key, certificate });
    let signer = || {
        signer.as_ref().ok_or_else(|| Error::Internal {
            message: "the upgrade signs a row it holds no root for".to_string(),
        })
    };

    for step in steps {
        match step {
            Step::Reshape(statement) => store.reshape_format_one(*statement).await?,
            Step::Schema => store.install_format_two_schema().await?,
            Step::Drop(dropped) => match &dropped.row {
                Row::Member(id) => store.delete_format_one_member(id).await?,
                Row::Workspace(id) => store.delete_workspace_alone(id).await?,
                Row::Grant {
                    member_id,
                    workspace_id,
                } => store.delete_grant_alone(member_id, workspace_id).await?,
                Row::Invitation(id) => store.delete_invitation(id).await?,
                Row::Mark => store.clear_mark().await?,
                Row::Role(id) => store.delete_role(id).await?,
            },
            Step::Certificate(certificate) => store.write_certificate(certificate).await?,
            Step::Role(role) => store.write_role(signer()?, role).await?,
            Step::Member(member) => store.write_member(signer()?, member).await?,
            Step::WithdrawOffer(id) => store.delete_succession(id).await?,
            Step::Workspace(workspace) => store.write_workspace(signer()?, workspace).await?,
            Step::Grant(grant) => store.write_grant(signer()?, grant).await?,
            Step::Invitation(invitation) => store.write_invitation(signer()?, invitation).await?,
            Step::Mark(mark) => store.write_mark(signer()?, mark).await?,
            Step::DropFormatOneCertificates => store.drop_format_one_certificates().await?,
        }
    }

    Ok(())
}

/// What a member of format 1 carries into this one: the role they hold, their override, what they
/// end with, and whether they were removed.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct Carried {
    pub(crate) role_id: String,
    pub(crate) override_mask: i64,
    /// what they end with, which is also the ceiling of the certificate they are issued.
    pub(crate) effective: i64,
    pub(crate) rank: i64,
    /// whether format 1 had removed them; the moment is the row's `updated_at`.
    pub(crate) removed: bool,
}

/// What a member of format 1 holds in this format, from the role word and the seven-act mask
/// their row carried, and whether theirs is the owner's vault: the mapping the plan's
/// *Migration* gives.
///
/// **The owner is whoever holds the key, never a role word.** A row saying `owner` that is not the
/// key holder's is read as the old build read it: its acts are the row's own `permissions`, which
/// every gate there asked (`session::permissions_on_row` on the main branch), and the mark was
/// the owner's or an administrator's by the role word, so it keeps the mark and the roles an
/// administrator keeps.
pub(crate) fn carried_by(role: &str, permissions: i64, owner: bool) -> Carried {
    if owner {
        return Carried {
            role_id: permission::OWNER.to_string(),
            override_mask: 0,
            effective: OWNER_ROLE.mask,
            rank: OWNER_ROLE.rank,
            removed: false,
        };
    }

    if role == REMOVED {
        return Carried {
            role_id: MEMBER_ROLE.id.to_string(),
            override_mask: 0,
            effective: 0,
            rank: MEMBER_ROLE.rank,
            removed: true,
        };
    }

    let acts = permissions & FORMAT_ONE_ACTS;
    let administrator = role == ADMINISTRATOR || role == permission::OWNER;
    let effective = acts_of(acts)
        | permission::mask_of(&RECORD_FLAGS)
        | if administrator {
            permission::mask_of(&[Flag::ManageMark, Flag::ManageRoles])
        } else {
            0
        };
    let role = if administrator || acts != 0 {
        MANAGER_ROLE
    } else {
        MEMBER_ROLE
    };

    Carried {
        role_id: role.id.to_string(),
        override_mask: permission::effective(role.mask, effective),
        effective,
        rank: role.rank,
        removed: false,
    }
}

/// What a member carries whose row is already written in this format: the role it names, as
/// `roles` gives its mask and rank, its override, and whether it was removed. `None` for the
/// owner's role, which nobody but the key holder carries, and for a role no verified row stands
/// for.
///
/// *It knew the two built-in roles and no other until ticket 25, so the holder of a custom role was
/// dropped as naming a role no upgrade gives a member.*
fn carried_as_written(
    role_id: &str,
    override_mask: i64,
    removed_at: Option<i64>,
    roles: &HashMap<String, (i64, i64)>,
) -> Option<Carried> {
    if role_id == permission::OWNER {
        return None;
    }

    let (mask, rank) = *roles.get(role_id)?;
    let removed = removed_at.is_some();

    Some(Carried {
        role_id: role_id.to_string(),
        override_mask,
        effective: if removed {
            0
        } else {
            permission::effective(mask, override_mask)
        },
        rank,
        removed,
    })
}

/// The seven acts of format 1 as this format's flags: each on the bit it sat on, and
/// `changeRole` as `assignRole` and `overrideMember`.
fn acts_of(acts: i64) -> i64 {
    let carried = acts & FORMAT_ONE_ACTS & !FORMAT_ONE_CHANGE_ROLE;

    if acts & FORMAT_ONE_CHANGE_ROLE == 0 {
        return carried;
    }

    carried | permission::mask_of(&[Flag::AssignRole, Flag::OverrideMember])
}

/// What judges a row of an older organization: format 1's certificates while they stand, and this
/// format's chain where an upgrade cut short already issued some. A row is genuine where either
/// accepts it, which is every row as the format that signed it would read it.
pub(super) struct Judge<'a> {
    pinned: &'a [u8; VERIFYING_KEY_BYTES],
    format_one: Vec<FormatOneCertificate>,
    chain: Chain<'a>,
    /// every role row that verified through the chain, highest rank first.
    roles: Vec<RoleRecord>,
    /// every role row that did not, and why.
    refused_roles: Vec<(String, String)>,
    /// the mask and rank of every role a member row may name: the two built-in roles, as the
    /// verified rows have them where they stand, and every custom role that verified.
    standings: HashMap<String, (i64, i64)>,
}

impl<'a> Judge<'a> {
    /// A judge over `directory`'s format 1 certificates and this format's `certificates`,
    /// `revocations` and `role_rows`, all rooted at `pinned`.
    ///
    /// `owners_signing_key` is the owner's, where the caller holds it: a format 1 certificate
    /// naming it is judged by its key and signature alone, and the unsigned `revoked_at` on it is
    /// not read.
    pub(super) fn new(
        pinned: &'a [u8; VERIFYING_KEY_BYTES],
        directory: &FormatOneDirectory,
        owners_signing_key: Option<&[u8; VERIFYING_KEY_BYTES]>,
        certificates: &'a [Certificate],
        revocations: &'a [Revocation],
        role_rows: &[SignedRow<RoleRecord>],
    ) -> Self {
        let format_one = directory
            .certificates
            .iter()
            .cloned()
            .map(|certificate| {
                if owners_signing_key == Some(&certificate.signing_public_key) {
                    FormatOneCertificate {
                        revoked_at: None,
                        ..certificate
                    }
                } else {
                    certificate
                }
            })
            .collect();

        // the role rows first, through a chain that judges no member row: a role row is judged by
        // its certificate alone, and the member rows below are judged by what these say.
        let mut roles = Vec::new();
        let mut refused_roles = Vec::new();
        let unranked = Chain::new(pinned, certificates, revocations);

        for row in role_rows {
            match unranked.verify(
                &row.certificate_id,
                role_authority(&row.record),
                &row.signature,
            ) {
                Ok(()) => roles.push(row.record.clone()),
                Err(error) => refused_roles.push((row.record.id.clone(), error.to_string())),
            }
        }

        let mut standings: HashMap<String, (i64, i64)> = [MANAGER_ROLE, MEMBER_ROLE]
            .into_iter()
            .map(|role| (role.id.to_string(), (role.mask, role.rank)))
            .collect();

        standings.extend(
            roles
                .iter()
                .map(|role| (role.id.clone(), (role.mask, role.rank))),
        );

        Self {
            pinned,
            format_one,
            chain: Chain::new(pinned, certificates, revocations).with_roles(standings.clone()),
            roles,
            refused_roles,
            standings,
        }
    }

    /// The format 1 certificate issued under `id`, while their table stands.
    fn format_one_certificate(&self, id: &str) -> Option<&FormatOneCertificate> {
        self.format_one
            .iter()
            .find(|certificate| certificate.id == id)
    }

    /// Whether a workspace, grant, invitation or mark row is genuine, and why not where it is not.
    ///
    /// **A workspace row's format 1 certificate is not asked whether it was revoked** (ticket 25):
    /// `revoked_at` is unsigned, so it proves nothing, and a workspace row not carried is a
    /// workspace database nobody can reach again, every grant on it with it. What the row says is
    /// the database it names, which only its creator's signature put there. Grants, invitations
    /// and the mark still follow the revocation, since each hands somebody something.
    pub(super) fn row(
        &self,
        certificate_id: &str,
        authority: Authority<'_>,
        signature: &[u8],
    ) -> Result<(), Error> {
        let mut refusal = None;

        if let Some(certificate) = self.format_one_certificate(certificate_id) {
            let certificate = match authority {
                Authority::Workspace(_) => FormatOneCertificate {
                    revoked_at: None,
                    ..certificate.clone()
                },
                _ => certificate.clone(),
            };

            match verify_format_one(
                self.pinned,
                &certificate,
                FormatOneRow::Unchanged(authority),
                signature,
            ) {
                Ok(()) => return Ok(()),
                Err(error) => refusal = Some(error),
            }
        }

        self.chain
            .verify(certificate_id, authority, signature)
            .map_err(|error| refusal.unwrap_or(error))
    }

    /// Where a member stands, from a row that is genuine, and why not where it is not.
    ///
    /// A row still carrying format 1's signature is read under `member.v2`
    /// ([`format_one_signature`]). A row already written in this format is read through the chain,
    /// against the roles that verified, a custom one included.
    fn member(&self, member: &FormatOneMemberRow) -> Result<Carried, Error> {
        let mut refusal = None;

        if let Some(certificate) = self.format_one_certificate(&member.certificate_id) {
            match format_one_signature(self.pinned, certificate, member) {
                Ok((role, permissions)) => return Ok(carried_by(&role, permissions, false)),
                Err(error) => refusal = Some(error),
            }
        }

        if let (Some(role_id), Some(override_mask)) =
            (member.role_id.as_deref(), member.override_mask)
        {
            match self.chain.read_member(
                &member.certificate_id,
                MemberAuthority {
                    id: &member.id,
                    public_key: &member.vault.public_key,
                    signing_public_key: &member.signing_public_key,
                    role_id,
                    override_mask,
                    removed_at: member.removed_at,
                    owner_seed_sealed: member.owner_seed_sealed.as_deref(),
                },
                &member.signature,
            ) {
                Ok(Reading::Covered) => {
                    if let Some(carried) = carried_as_written(
                        role_id,
                        override_mask,
                        member.removed_at,
                        &self.standings,
                    ) {
                        return Ok(carried);
                    }

                    refusal.get_or_insert_with(|| Error::Integrity {
                        message: "it names a role no verified row stands for".to_string(),
                    });
                }
                Ok(Reading::Uncovered) => {
                    refusal.get_or_insert_with(|| Error::Integrity {
                        message: "its certificate does not cover it".to_string(),
                    });
                }
                Err(error) => {
                    refusal.get_or_insert(error);
                }
            }
        }

        Err(refusal.unwrap_or_else(|| Error::Integrity {
            message: "it names a certificate the organization never issued".to_string(),
        }))
    }
}

/// An older organization's rows, judged: what verified, to be carried, and what did not.
struct Judged<'a> {
    members: Vec<(&'a FormatOneMemberRow, Carried)>,
    workspaces: Vec<WorkspaceRecord>,
    grants: Vec<GrantRecord>,
    invitations: Vec<InvitationRecord>,
    mark: Option<MarkRecord>,
    dropped: Vec<Dropped>,
}

/// A row the upgrade does not carry, and why: the log names each one.
#[derive(Clone, Debug)]
pub(crate) struct Dropped {
    pub(crate) row: Row,
    reason: String,
}

/// Which row of an older organization, by its table and its key there.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum Row {
    Member(String),
    Workspace(String),
    Grant {
        member_id: String,
        workspace_id: String,
    },
    Invitation(String),
    /// the one mark row.
    Mark,
    /// a role row an upgrade cut short left, or anybody wrote, that does not verify: left in
    /// place, it would refuse every read of the roles in this format.
    Role(String),
}

impl Row {
    /// The table the row sits in, as the log names it.
    fn table(&self) -> &'static str {
        match self {
            Self::Member(_) => "member",
            Self::Workspace(_) => "workspace",
            Self::Grant { .. } => "grant",
            Self::Invitation(_) => "invitation",
            Self::Mark => "mark",
            Self::Role(_) => "role",
        }
    }

    /// The row's key, as the log names it: a grant's member and workspace joined by `/`.
    pub(crate) fn id(&self) -> String {
        match self {
            Self::Member(id) | Self::Workspace(id) | Self::Invitation(id) | Self::Role(id) => {
                id.clone()
            }
            Self::Grant {
                member_id,
                workspace_id,
            } => format!("{member_id}/{workspace_id}"),
            Self::Mark => "mark".to_string(),
        }
    }
}

/// Judge every row of `directory` through `judge`. The owner's own row, `owner_id`'s, is the
/// owner's by the key that opened it, and nothing on it is judged.
fn judged<'a>(judge: &Judge<'_>, directory: &'a FormatOneDirectory, owner_id: &str) -> Judged<'a> {
    let mut judged = Judged {
        members: Vec::new(),
        workspaces: Vec::new(),
        grants: Vec::new(),
        invitations: Vec::new(),
        mark: None,
        dropped: judge
            .refused_roles
            .iter()
            .map(|(id, reason)| Dropped {
                row: Row::Role(id.clone()),
                reason: reason.clone(),
            })
            .collect(),
    };

    for member in &directory.members {
        if member.id == owner_id {
            judged
                .members
                .push((member, carried_by(permission::OWNER, 0, true)));

            continue;
        }

        match judge.member(member) {
            Ok(carried) => judged.members.push((member, carried)),
            Err(error) => judged.dropped.push(Dropped {
                row: Row::Member(member.id.clone()),
                reason: error.to_string(),
            }),
        }
    }

    for signed in &directory.workspaces {
        let record = &signed.record;

        match judge.row(
            &signed.certificate_id,
            workspace_authority(record),
            &signed.signature,
        ) {
            Ok(()) => judged.workspaces.push(record.clone()),
            Err(error) => judged.dropped.push(Dropped {
                row: Row::Workspace(record.id.clone()),
                reason: error.to_string(),
            }),
        }
    }

    for signed in &directory.grants {
        let record = &signed.record;

        match judge.row(
            &signed.certificate_id,
            grant_authority(record),
            &signed.signature,
        ) {
            Ok(()) => judged.grants.push(record.clone()),
            Err(error) => judged.dropped.push(Dropped {
                row: Row::Grant {
                    member_id: record.member_id.clone(),
                    workspace_id: record.workspace_id.clone(),
                },
                reason: error.to_string(),
            }),
        }
    }

    for signed in &directory.invitations {
        let record = &signed.record;

        match judge.row(
            &signed.certificate_id,
            invitation_authority(record),
            &signed.signature,
        ) {
            Ok(()) => judged.invitations.push(record.clone()),
            Err(error) => judged.dropped.push(Dropped {
                row: Row::Invitation(record.id.clone()),
                reason: error.to_string(),
            }),
        }
    }

    if let Some(signed) = &directory.mark {
        let record = &signed.record;

        match judge.row(
            &signed.certificate_id,
            mark_authority(record),
            &signed.signature,
        ) {
            Ok(()) => judged.mark = Some(record.clone()),
            Err(error) => judged.dropped.push(Dropped {
                row: Row::Mark,
                reason: error.to_string(),
            }),
        }
    }

    judged
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use super::{FORMAT_ONE_ACTS, Step, applied, carried_by, planned};
    use crate::{
        error::{Error, RefusalReason},
        organization::{
            member::vault::seal_content,
            role::{
                in_one_transaction,
                permission::{self, Flag, MANAGER_ROLE, MEMBER_ROLE, OWNER_ROLE},
            },
            session::CredentialSlot,
            store::{OrganizationStore, RoleRecord, Signer},
        },
        upgrade::format::{
            runner::{signing_key_of, with_password},
            test::{
                older::{
                    CHANGE_ROLE, GRANT_WORKSPACE, INVITE_MEMBER, NOW, Older, RENAME_MEMBER,
                    RENAME_WORKSPACE, another_machine, assert_upgraded, made_to_look_older, mask,
                    older, records, run,
                },
                remote::online,
            },
        },
    };

    /// A credential slot holding nothing yet.
    fn slot() -> CredentialSlot {
        Arc::new(Mutex::new(None))
    }

    /// Everything the organization database holds, table by table and row by row: a write
    /// anywhere changes it.
    async fn contents(store: &OrganizationStore) -> Vec<(String, Vec<Vec<turso::Value>>)> {
        let mut contents = Vec::new();

        for table in store.tables().await.expect("the tables") {
            let mut rows = store
                .connection()
                .query(&format!("SELECT * FROM \"{table}\" ORDER BY rowid"), ())
                .await
                .expect("the rows");
            let mut values = Vec::new();

            while let Some(row) = rows.next().await.expect("a row") {
                values.push(
                    (0..row.column_count())
                        .map(|index| row.get_value(index).expect("a value"))
                        .collect(),
                );
            }

            contents.push((table, values));
        }

        contents
    }

    /// The reason a result was refused for, where it was refused.
    fn reason_of<T>(result: &Result<T, Error>) -> Option<RefusalReason> {
        match result {
            Err(Error::Refused { reason, .. }) => Some(*reason),
            _ => None,
        }
    }

    /// The fixture, upgraded by the owner's sign-in online.
    async fn upgraded(name: &str) -> (Older, OrganizationStore) {
        let older = older(name).await;
        let store = older.open().await;
        let owner = older.person("owner");

        with_password(
            &store,
            &online(),
            &older.held,
            owner.username,
            owner.password,
            &slot(),
            NOW,
        )
        .await
        .expect("the upgrade");

        (older, store)
    }

    /// The mapping itself, one case per kind of member format 1 had: exactly what each could do,
    /// every record act included, as a role and an override.
    #[test]
    fn each_member_of_format_one_keeps_exactly_what_they_could_do() {
        let owner = carried_by("owner", FORMAT_ONE_ACTS, true);

        assert_eq!(
            (owner.role_id.as_str(), owner.override_mask, owner.effective),
            ("owner", 0, OWNER_ROLE.mask)
        );

        // an administrator the owner narrowed: their acts, `changeRole` as two, every record act,
        // and the mark and the roles.
        let narrowed = carried_by(
            "administrator",
            INVITE_MEMBER | CHANGE_ROLE | RENAME_MEMBER,
            false,
        );

        assert_eq!(narrowed.role_id, "manager");
        assert_eq!(
            narrowed.effective,
            mask(&[
                Flag::InviteMember,
                Flag::AssignRole,
                Flag::OverrideMember,
                Flag::RenameMember,
                Flag::ManageMark,
                Flag::ManageRoles,
            ]) | records()
        );
        assert_eq!(
            permission::effective(MANAGER_ROLE.mask, narrowed.override_mask),
            narrowed.effective
        );

        // an administrator with every act is a manager with nothing switched but upgrading the
        // data, which format 1 did not name and the manager role carries since effort 857: they
        // keep exactly what they could do.
        let whole = carried_by("administrator", FORMAT_ONE_ACTS, false);
        let upgrading = mask(&[Flag::UpgradeData]);

        assert_eq!(whole.effective, MANAGER_ROLE.mask & !upgrading);
        assert_eq!(whole.override_mask, upgrading);

        // a member granted administration acts: a manager holding exactly those, and the records.
        let lead = carried_by("member", GRANT_WORKSPACE | RENAME_WORKSPACE, false);

        assert_eq!(lead.role_id, "manager");
        assert_eq!(
            lead.effective,
            mask(&[Flag::GrantWorkspace, Flag::RenameWorkspace]) | records()
        );
        assert_eq!(
            permission::effective(MANAGER_ROLE.mask, lead.override_mask),
            lead.effective
        );

        // a plain member: the member role, with delete switched on for every kind.
        let member = carried_by("member", 0, false);

        assert_eq!(member.role_id, "member");
        assert_eq!(member.effective, records());
        assert_eq!(
            member.override_mask,
            mask(&[
                Flag::DeleteComplex,
                Flag::DeleteUnit,
                Flag::DeleteTenant,
                Flag::DeleteContract,
                Flag::DeletePayment,
            ])
        );

        // a removed member: a member, removed, with nothing.
        let removed = carried_by("removed", 0, false);

        assert_eq!(
            (
                removed.role_id.as_str(),
                removed.override_mask,
                removed.removed
            ),
            ("member", 0, true)
        );

        // **ticket 23's seventh criterion**: a row saying owner that is not the key holder's is
        // read as the old build read it, its acts off its own `permissions` column, and the mark
        // and the roles an administrator keeps.
        let forged_owner = carried_by("owner", INVITE_MEMBER, false);

        assert_eq!(forged_owner.role_id, "manager");
        assert_eq!(
            forged_owner.effective,
            mask(&[Flag::InviteMember, Flag::ManageMark, Flag::ManageRoles]) | records()
        );
        assert_eq!(
            carried_by("owner", 0, false).effective,
            mask(&[Flag::ManageMark, Flag::ManageRoles]) | records()
        );

        // nothing any of them ends with is the owner's.
        for standing in [narrowed, whole, lead, member, forged_owner] {
            assert_eq!(
                standing.effective & mask(&permission::OWNER_ONLY),
                0,
                "{standing:?}"
            );
        }
    }

    /// **Ticket 22's fifth criterion.** An upgrade cut short on this machine before the `format`
    /// row, inside its transaction, leaves the organization exactly as it was, still older, and
    /// the owner's next sign-in completes it.
    #[tokio::test]
    async fn an_upgrade_cut_short_in_its_transaction_leaves_nothing_and_the_next_sign_in_completes_it()
     {
        let older = older("cut-short").await;
        let store = older.open().await;
        let owner = older.person("owner");
        let before = contents(&store).await;
        let opened = older.owners_vault();
        let key = signing_key_of(&opened.secret).expect("the signing key");
        let plan = planned(&store, &older.organization_key, &key, &opened, NOW)
            .await
            .expect("the plan");
        // the plan is everything before the `format` row, which the runner writes after it.
        let before_the_format = &plan.steps;
        let cut = in_one_transaction(&store, async {
            applied(&store, &key, plan.root.as_ref(), before_the_format).await?;

            Err::<(), _>(Error::Internal {
                message: "the upgrade was cut short before the format row".to_string(),
            })
        })
        .await;

        assert!(
            matches!(&cut, Err(Error::Internal { message }) if message.contains("cut short")),
            "the upgrade was not cut short where the test cut it: {cut:?}"
        );
        assert!(store.is_older().await.expect("the format"));
        assert_eq!(store.format().await.expect("the format"), None);
        assert_eq!(
            contents(&store).await,
            before,
            "the cut left something behind"
        );

        with_password(
            &store,
            &online(),
            &older.held,
            owner.username,
            owner.password,
            &slot(),
            NOW,
        )
        .await
        .expect("the next sign-in did not complete the upgrade");

        assert_upgraded(&store, &older, &older.pinned()).await;
    }

    /// **Ticket 23's third criterion.** Every state the upgrade's order can leave behind it, on
    /// this machine or on a remote a push reached part of: each prefix of its writes, from the
    /// first statement of the reshape to everything but the `format` row, committed as it stands.
    ///
    /// Each is recognised as unfinished: it reads as older, never as format 2 and never as a
    /// stranger's. A member's sign-in is told the organization waits for its owner, and writes
    /// nothing. The owner's next sign-in, a minute later and from any machine, since nothing in it
    /// is this machine's, finishes it into exactly what a whole upgrade leaves, and runs no
    /// statement of the reshape twice; except, since ticket 25, a state that already holds the
    /// root and still carries format 1, which no machine transforms and the upgrading machine's
    /// own push completes.
    #[tokio::test]
    async fn every_partial_state_the_upgrade_can_leave_is_recognised_and_the_owner_finishes_it() {
        let steps = {
            let older = older("partial-plan").await;
            let store = older.open().await;
            let opened = older.owners_vault();
            let key = signing_key_of(&opened.secret).expect("the signing key");

            planned(&store, &older.organization_key, &key, &opened, NOW)
                .await
                .expect("the plan")
                .steps
                .len()
        };

        // every step of the plan written is everything but the `format` row, which the runner
        // writes after it.
        for written in 1..=steps {
            let older = older(&format!("partial-{written}")).await;
            let store = older.open().await;
            let opened = older.owners_vault();
            let key = signing_key_of(&opened.secret).expect("the signing key");
            let plan = planned(&store, &older.organization_key, &key, &opened, NOW)
                .await
                .expect("the plan");

            assert_eq!(plan.steps.len(), steps);

            applied(&store, &key, plan.root.as_ref(), &plan.steps[..written])
                .await
                .unwrap_or_else(|error| panic!("{written}: the partial upgrade: {error}"));

            assert!(
                store.is_older().await.expect("the format"),
                "{written}: a partial upgrade read as this format"
            );
            assert_eq!(
                reason_of(&store.refuse_another_format().await),
                Some(RefusalReason::OrganizationOlder),
                "{written}"
            );

            // a member meeting it waits for the owner, and nothing is written.
            let before = contents(&store).await;
            let mina = older.person("mina");
            let refused = with_password(
                &store,
                &online(),
                &older.held_by("mina"),
                mina.username,
                mina.password,
                &slot(),
                NOW + 60_000,
            )
            .await;

            assert_eq!(
                reason_of(&refused),
                Some(RefusalReason::OrganizationOlder),
                "{written}: {refused:?}"
            );
            assert_eq!(contents(&store).await, before, "{written}: a member wrote");

            // the owner finishes it, running only what the table still needs.
            let reshape_done = plan
                .steps
                .iter()
                .take(written)
                .filter(|step| matches!(step, Step::Reshape(_)))
                .count();
            let reshape_left = store
                .format_one_reshape()
                .await
                .expect("what the reshape still needs")
                .len();

            assert_eq!(
                reshape_done + reshape_left,
                plan.steps
                    .iter()
                    .filter(|step| matches!(step, Step::Reshape(_)))
                    .count(),
                "{written}: a statement of the reshape would run twice"
            );

            let owner = older.person("owner");
            let rooted = plan.steps[..written].iter().any(
                |step| matches!(step, Step::Certificate(certificate) if certificate.is_root()),
            );
            let carries = store
                .carries_format_one()
                .await
                .expect("what is left of format 1");
            let finished = with_password(
                &store,
                &online(),
                &older.held,
                owner.username,
                owner.password,
                &slot(),
                NOW + 60_000,
            )
            .await;

            if rooted && carries {
                // **ticket 25's second criterion narrows this one**: past the root, a machine
                // that has not read the organization in this format transforms nothing, since a
                // root is what an organization of this format holds, and a member can make one
                // look older. The rest arrives with the push of the machine that made the upgrade,
                // which holds all of it.
                assert_eq!(
                    reason_of(&finished),
                    Some(RefusalReason::OrganizationOlder),
                    "{written}: {finished:?}"
                );
                assert_eq!(
                    contents(&store).await,
                    before,
                    "{written}: the owner's machine transformed an organization holding a root"
                );

                applied(&store, &key, plan.root.as_ref(), &plan.steps[written..])
                    .await
                    .unwrap_or_else(|error| panic!("{written}: the rest of the upgrade: {error}"));
                // and the changes after this one, which the same walk ran on that machine.
                store
                    .install_format_three_schema()
                    .await
                    .unwrap_or_else(|error| panic!("{written}: format 3: {error}"));
                store
                    .write_format()
                    .await
                    .unwrap_or_else(|error| panic!("{written}: the format row: {error}"));
            } else {
                finished.unwrap_or_else(|error| {
                    panic!("{written}: the owner did not finish it: {error}")
                });
            }

            assert_upgraded(&store, &older, &older.pinned()).await;

            drop(store);

            let elsewhere = another_machine(&older.directory).await;

            assert_upgraded(&elsewhere, &older, &older.pinned()).await;
        }
    }

    /// **Ticket 25's third criterion.** A member holding a custom role, in an organization whose
    /// `role` table holds that role's verified row: the upgrade judges members against the role
    /// rows that verify, so the holder is carried in their role, the role row is signed again
    /// from the root, and they read afterwards with what the role gives. The plan is made directly,
    /// since the owner's sign-in refuses an organization holding a root before it plans.
    #[tokio::test]
    async fn the_holder_of_a_custom_role_is_carried_in_it() {
        let (older, store) = upgraded("custom-role").await;
        let owner = older.person("owner");
        let pinned = older.pinned();
        let root = store
            .live_certificate(&pinned, "owner", &owner.signing.verifying_key())
            .await
            .expect("the chain")
            .expect("the root");
        let signer = Signer {
            key: &owner.signing,
            certificate: &root,
        };
        let leasing = RoleRecord {
            id: "role-leasing".to_string(),
            kind: "custom".to_string(),
            name_sealed: seal_content(&older.content_key, "role.name_sealed", b"Leasing")
                .expect("the name"),
            mask: MEMBER_ROLE.mask | mask(&[Flag::InviteMember]),
            rank: 500_000,
        };

        store.write_role(&signer, &leasing).await.expect("the role");

        let pia = store
            .member(&pinned, "pia")
            .await
            .expect("the member")
            .expect("pia");

        store
            .write_member(
                &signer,
                &crate::organization::store::MemberRecord {
                    role_id: leasing.id.clone(),
                    override_mask: 0,
                    ..pia
                },
            )
            .await
            .expect("pia in the custom role");

        made_to_look_older(&older, &store).await;

        let opened = older.owners_vault();
        let key = signing_key_of(&opened.secret).expect("the signing key");
        let plan = planned(&store, &older.organization_key, &key, &opened, NOW + 60_000)
            .await
            .expect("the plan");

        assert!(
            plan.steps.iter().any(|step| matches!(
                step,
                Step::Member(member) if member.id == "pia" && member.role_id == "role-leasing"
            )),
            "the holder of a custom role was not carried in it"
        );
        assert!(
            !plan
                .steps
                .iter()
                .any(|step| matches!(step, Step::Drop(dropped) if dropped.row.id() == "pia")),
            "the holder of a custom role was dropped"
        );
        assert!(
            plan.steps.iter().any(
                |step| matches!(step, Step::Role(role) if role.id == "role-leasing" && role.rank == 500_000)
            ),
            "the custom role was not signed again"
        );

        in_one_transaction(
            &store,
            applied(&store, &key, plan.root.as_ref(), &plan.steps),
        )
        .await
        .expect("the plan applied");

        let pia = store
            .members(&pinned)
            .await
            .expect("the members")
            .into_iter()
            .find(|member| member.id == "pia")
            .expect("pia");

        assert_eq!(pia.role_id, "role-leasing");
        assert_eq!(pia.effective, leasing.mask);
        assert!(pia.covered);
    }

    /// **Ticket 25's tenth criterion.** An organization whose replica has no `succession` table,
    /// which a build before effort 828 made: the plan meets it the way `settled` does, with no
    /// offer to withdraw, and the owner's sign-in upgrades it.
    #[tokio::test]
    async fn the_plan_meets_a_replica_without_a_succession_table() {
        let older = older("no-succession").await;
        let store = older.open().await;
        let owner = older.person("owner");

        run(&store, "DROP TABLE \"succession\"", Vec::new()).await;

        let opened = older.owners_vault();
        let key = signing_key_of(&opened.secret).expect("the signing key");
        let plan = planned(&store, &older.organization_key, &key, &opened, NOW)
            .await
            .expect("a replica without a succession table could not be planned");

        assert!(
            !plan
                .steps
                .iter()
                .any(|step| matches!(step, Step::WithdrawOffer(_)))
        );

        with_password(
            &store,
            &online(),
            &older.held,
            owner.username,
            owner.password,
            &slot(),
            NOW,
        )
        .await
        .expect("the upgrade");

        assert_upgraded(&store, &older, &older.pinned()).await;
    }

    /// What ticket 25's refusal keeps from happening, planned directly: over an upgraded
    /// organization made to look older, the promotion replayed onto mina's row reads as an
    /// administrator of format 1, and the plan would sign it from the root as a manager. The
    /// runner never plans over it (`runner/`, whose tests show the refusal).
    #[tokio::test]
    async fn a_promotion_replayed_onto_an_upgraded_organization_would_be_carried() {
        let (older, store) = upgraded("replayed-promotion").await;

        made_to_look_older(&older, &store).await;

        let opened = older.owners_vault();
        let key = signing_key_of(&opened.secret).expect("the signing key");
        let plan = planned(&store, &older.organization_key, &key, &opened, NOW)
            .await
            .expect("the plan");

        assert!(
            plan.steps.iter().any(|step| matches!(
                step,
                Step::Member(member) if member.id == "mina" && member.role_id == "manager"
            )),
            "the replayed promotion would not have been carried"
        );
    }
}
