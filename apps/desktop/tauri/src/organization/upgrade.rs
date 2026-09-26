//! an organization an earlier version made, upgraded in place by its owner's machine (effort 838,
//! requirement 11 as the human amended it on 2026-09-26, ticket 22).
//!
//! **Only the owner, because every row of this format is signed from the root**, and the root is
//! the organization key, which the owner's vault secret derives (`setup::owner_key_from`) and no
//! other vault does. A vault is the owner's exactly when that key is the key the machine pinned,
//! the test `role::repair_owner_row` makes. Anybody else who meets an organization of format 1,
//! at a sign-in, a resume, a connect, a join or a machine link, is refused with
//! `OrganizationOlder` and the sentence that it waits for its owner, and nothing is written
//! (`store::waits_for_its_owner`).
//!
//! **Where it runs: before the format is refused**, at the owner's sign-in with a password
//! ([`with_password`]), their launch resume with the remembered key ([`with_remembered_key`]) and
//! `setup::connect_existing` ([`with_the_owners_password`]). Each finds the vault first, reading
//! the member rows as they lie, because a password cannot be tried against a vault that has not
//! been read; what it takes from them is the vault and nothing else. Then [`upgrade`] confirms the
//! key, unseals the credential where the machine holds none yet, sends what the old build left
//! captured, pulls, verifies every row under the rules of format 1 (`authority::verify_format_one`)
//! and drops what does not verify, naming it in the log. What is left is transformed in one
//! transaction and sent in one push, and the caller carries on into the ordinary sign-in.
//!
//! **What each member keeps is exactly what they could do** ([`standing_of`]): the old seven acts,
//! `changeRole` read as `assignRole` and `overrideMember`; every record flag, delete included,
//! because the old build gated no record act; and for an administrator the mark and the roles.
//! The owner is `owner` with no override, an administrator becomes a manager, a member stays a
//! member, and a member holding any administration act becomes a manager too, since at the
//! member's rank they could certify nobody. The override is the role's mask exclusive-or'd with
//! what they end with. A removed member is a member with `removed_at` and holds no certificate.
//!
//! **Every row is signed again from the root**: the two role rows, a certificate for every live
//! member issued from the root with their own signing key, every member row, every workspace,
//! grant and invitation, and the mark. A read-only grant needs the root, and the old build never
//! checked a ceiling, so nothing depends on what an old certificate could have signed.
//! `administrator_certificate` goes, a standing handover offer is withdrawn, `session_epoch` is
//! kept so every remembered session survives, and every unsigned table is left as it is.
//!
//! **The `format` row is written last, inside the transaction.** An upgrade cut short leaves an
//! organization that still reads as format 1, locally because the transaction never committed,
//! and on the remote because the row that says otherwise is the last one sent; the owner's next
//! sign-in runs it again.

use crate::{
    diagnostics,
    error::{Error, RefusalReason},
};

use super::{
    HeldOrganization,
    authority::{
        AdministratorKey, Authority, FormatOneCertificate, FormatOneMember, FormatOneRow,
        GrantAuthority, InvitationAuthority, Issue, MarkAuthority, OrganizationKey,
        VERIFYING_KEY_BYTES, WorkspaceAuthority, certificate_id, issue_certificate,
        issue_root_certificate, unused_certificate_id, verify_format_one,
    },
    permission::{self, Family, Flag, MANAGER_ROLE, MEMBER_ROLE, OWNER_ROLE},
    role::in_one_transaction,
    session::{CredentialSlot, refused_by_name, remembered, verifying_key_of},
    setup::{ADMINISTRATOR_KEY_PURPOSE, owner_key_from},
    store::{
        FormatOneDirectory, FormatOneMemberRow, FormatOneSigned, GrantRecord, InvitationRecord,
        MarkRecord, MemberRecord, OrganizationStore, RoleRecord, Signer, WorkspaceRecord,
        waits_for_its_owner,
    },
    vault::{
        CONTENT_KEY_BYTES, ContentKey, MemberSecretKey, open_content, open_sealed_secret_key,
        open_vault, unseal_with_secret_key,
    },
};

/// The role word format 1 wrote on a removed member's row.
const REMOVED: &str = "removed";

/// The role word format 1 wrote on an administrator's row.
const ADMINISTRATOR: &str = "administrator";

/// The seven acts of format 1, one bit each, in the order they sat.
const FORMAT_ONE_ACTS: i64 = 0b111_1111;

/// The act format 1 called `changeRole`, which this format splits in two.
const FORMAT_ONE_CHANGE_ROLE: i64 = 1 << 2;

/// Upgrade the organization `held` names where it is of format 1 and `password` opens its owner's
/// vault under `username`: the sign-in at the wall.
///
/// Nothing happens to an organization of any other format, and the caller's refusal of the format
/// follows either way. A username and password that open no vault are the wall's one sentence, as
/// a sign-in on this format says it; one that opens somebody else's is refused as waiting for the
/// owner, and nothing is written.
pub(crate) async fn with_password(
    store: &OrganizationStore,
    held: &HeldOrganization,
    username: &str,
    password: &str,
    credential: &CredentialSlot,
    now: i64,
) -> Result<(), Error> {
    if !store.is_format_one().await? {
        return Ok(());
    }

    let pinned = verifying_key_of(held)?;
    let secret = vault_opened_by(store, username, password)
        .await?
        .ok_or_else(|| refused_by_name(&held.name))?;

    upgrade(store, &held.id, &pinned, &secret, credential, now).await
}

/// Upgrade the organization `held` names where it is of format 1 and the key this machine filed
/// for the member it names opens the owner's vault: the launch resume, with no password.
///
/// A key that is not filed, that opens nothing, or that was filed before the member's sessions
/// were ended elsewhere, upgrades nothing; the resume that follows fails as a resume fails, into
/// the wall, where the owner's password does it.
pub(crate) async fn with_remembered_key(
    store: &OrganizationStore,
    held: &HeldOrganization,
    credential: &CredentialSlot,
    now: i64,
) -> Result<(), Error> {
    if !store.is_format_one().await? {
        return Ok(());
    }

    let member_id = held.member_id.as_deref().ok_or_else(waits_for_its_owner)?;
    let (filed_epoch, member_key) = remembered(&held.id, member_id)?;
    let member = store
        .format_one_members()
        .await?
        .into_iter()
        .find(|member| member.id == member_id)
        .ok_or_else(waits_for_its_owner)?;

    if filed_epoch < member.session_epoch {
        return Err(Error::refused(
            RefusalReason::SignInAgain,
            "the sessions this key opened were ended from another machine",
        ));
    }

    let secret =
        open_sealed_secret_key(&member_key, &member.vault).map_err(|_| waits_for_its_owner())?;
    let pinned = verifying_key_of(held)?;

    upgrade(store, &held.id, &pinned, &secret, credential, now).await
}

/// Upgrade the organization a machine connecting on the owner's Turso account has just pulled,
/// where it is of format 1: `setup::connect_existing`, before the format is refused.
///
/// There is no pinned key yet on this path, so the key the password derives is judged against the
/// organization row's, which is the comparison that path makes of every owner
/// (`setup::the_owners_key`); the rows are then judged under it. `credential` already holds what
/// the consent minted. `refused` is the sentence that path gives a pair that opens nothing.
pub(crate) async fn with_the_owners_password(
    store: &OrganizationStore,
    username: &str,
    password: &str,
    credential: &CredentialSlot,
    now: i64,
    refused: impl Fn() -> Error,
) -> Result<(), Error> {
    if !store.is_format_one().await? {
        return Ok(());
    }

    let organization = store
        .organization()
        .await?
        .ok_or_else(|| Error::Integrity {
            message: "the database this turso account holds carries no organization of ours"
                .to_string(),
        })?;
    let secret = vault_opened_by(store, username, password)
        .await?
        .ok_or_else(refused)?;

    upgrade(
        store,
        &organization.id,
        &organization.verifying_key,
        &secret,
        credential,
        now,
    )
    .await
}

/// The secret of the vault `password` opens under `username`, among the members of a format 1
/// organization as they lie: a removed member's excepted, and one whose vault still waits on its
/// invitation link, as the wall walks them (`session::sign_in_by_username`).
async fn vault_opened_by(
    store: &OrganizationStore,
    username: &str,
    password: &str,
) -> Result<Option<MemberSecretKey>, Error> {
    let wanted = username.trim().to_lowercase();

    for member in store.format_one_members().await? {
        if member.role == REMOVED || member.must_change_password {
            continue;
        }

        let Ok(secret) = open_vault(password, &member.vault) else {
            continue;
        };
        let content_key = content_key_of(&member, &secret)?;
        let carried = String::from_utf8(open_content(
            &content_key,
            "member.username_sealed",
            &member.username_sealed,
        )?)
        .map_err(|_| Error::Integrity {
            message: "member.username_sealed did not open as text".to_string(),
        })?;

        if carried.trim().to_lowercase() == wanted {
            return Ok(Some(secret));
        }
    }

    Ok(None)
}

/// The organization content key a format 1 member row seals to its member.
fn content_key_of(
    member: &FormatOneMemberRow,
    secret: &MemberSecretKey,
) -> Result<ContentKey, Error> {
    let bytes = unseal_with_secret_key(secret, &member.sealed_content_key)?;

    Ok(ContentKey::from_bytes(
        <[u8; CONTENT_KEY_BYTES]>::try_from(bytes.as_slice()).map_err(|_| Error::Integrity {
            message: "the sealed content key is not a content key".to_string(),
        })?,
    ))
}

/// Upgrade a format 1 organization under the owner's `secret`, which the caller's vault opened.
///
/// Refused as waiting for the owner, with nothing written, where the key `secret` derives is not
/// `pinned`. The steps and their order are the module comment's.
async fn upgrade(
    store: &OrganizationStore,
    organization_id: &str,
    pinned: &[u8; VERIFYING_KEY_BYTES],
    secret: &MemberSecretKey,
    credential: &CredentialSlot,
    now: i64,
) -> Result<(), Error> {
    let organization_key = owner_key_from(secret)?;

    if organization_key.verifying_key() != *pinned {
        return Err(waits_for_its_owner());
    }

    // the owner's own credential on the organization database, where the machine holds none yet:
    // the grant format 1 signed for them, judged as that format judged it, and unsealed with the
    // secret that opened their vault.
    if credential
        .lock()
        .map_err(|_| poisoned())?
        .as_deref()
        .is_none()
    {
        let directory = store.format_one_directory().await?;

        if let Some(token) = owners_credential(&directory, organization_id, pinned, secret)? {
            *credential.lock().map_err(|_| poisoned())? = Some(token);
        }
    }

    // what the old build left captured goes first, since a row captured under the columns the
    // upgrade drops cannot share a push with the drop; then what the others wrote. Neither is a
    // refusal, as no push or pull is: offline, the organization is upgraded on this machine and
    // the push that finally goes carries it (819's requirement 18).
    if !store.push().await {
        diagnostics::warn("organization.upgrade.capturedNotSent").write();
    }

    if let Err(refusal) = store.pulled().await {
        diagnostics::info("organization.upgrade.notPulled")
            .with("reason", refusal.to_string())
            .write();
    }

    // another machine of the owner's got there first, and what arrived is this format.
    if !store.is_format_one().await? {
        return Ok(());
    }

    upgrade_until(store, &organization_key, secret, now, Until::Whole).await?;

    if !store.push().await {
        diagnostics::warn("organization.upgrade.notYetSent")
            .with("organization", organization_id)
            .write();
    }

    diagnostics::info("organization.upgraded")
        .with("organization", organization_id)
        .write();

    Ok(())
}

/// How far [`upgrade_until`] goes: the whole way, or, for the test of an upgrade cut short,
/// everything but the `format` row, which is then refused and rolled back.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Until {
    Whole,
    #[cfg(test)]
    BeforeTheFormat,
}

/// Judge the directory as it stands and carry it into this format, in one transaction.
async fn upgrade_until(
    store: &OrganizationStore,
    organization_key: &OrganizationKey,
    secret: &MemberSecretKey,
    now: i64,
    until: Until,
) -> Result<(), Error> {
    let pinned = organization_key.verifying_key();
    let directory = store.format_one_directory().await?;
    let judged = judged(&pinned, &directory);

    for dropped in &judged.dropped {
        diagnostics::warn("organization.upgrade.rowDropped")
            .with("table", dropped.table)
            .with("row", dropped.id.as_str())
            .with("reason", dropped.reason.as_str())
            .write();
    }

    let owner_public_key = secret.public_key();
    let owner = judged
        .members
        .iter()
        .find(|member| member.vault.public_key == owner_public_key)
        .ok_or_else(|| Error::Integrity {
            message: "the owner's own row does not verify under the organization's key, so the \
                      organization was not upgraded"
                .to_string(),
        })?;
    let key = AdministratorKey::from_bytes(&secret.derive_seed(ADMINISTRATOR_KEY_PURPOSE)?);

    in_one_transaction(
        store,
        transformed(
            store,
            organization_key,
            &key,
            &owner.id,
            &judged,
            now,
            until,
        ),
    )
    .await
}

/// The writes of an upgrade, inside the caller's transaction: the tables reshaped, what did not
/// verify removed, and everything else written again from the root, the `format` row last.
async fn transformed(
    store: &OrganizationStore,
    organization_key: &OrganizationKey,
    key: &AdministratorKey,
    owner_id: &str,
    judged: &Judged<'_>,
    now: i64,
    until: Until,
) -> Result<(), Error> {
    store.reshape_format_one().await?;

    // what did not verify goes before anything is written, so nothing below is taken with it.
    for dropped in &judged.dropped {
        match dropped.table {
            "member" => store.delete_format_one_member(&dropped.id).await?,
            "workspace" => store.delete_workspace(&dropped.id).await?,
            "grant" => {
                let (member_id, workspace_id) = dropped.id.split_once('/').unwrap_or_default();

                store.delete_grant(member_id, workspace_id).await?;
            }
            "invitation" => store.delete_invitation(&dropped.id).await?,
            _ => store.clear_mark().await?,
        }
    }

    let issued_at = now.to_string();
    let root = issue_root_certificate(
        organization_key,
        &certificate_id(owner_id, &issued_at),
        owner_id,
        &key.verifying_key(),
        &issued_at,
    );

    store.write_certificate(&root).await?;

    let signer = Signer {
        key,
        certificate: &root,
    };

    // the two built-in roles that are rows, as the first run writes them, before any member row
    // names one.
    for built_in in [MANAGER_ROLE, MEMBER_ROLE] {
        store
            .write_role(
                &signer,
                &RoleRecord {
                    id: built_in.id.to_string(),
                    kind: built_in.id.to_string(),
                    name_sealed: Vec::new(),
                    mask: built_in.mask,
                    rank: built_in.rank,
                },
            )
            .await?;
    }

    // a certificate for every live member, from the root, over their own signing key; the owner's
    // is the root. Then every member row, which the root covers whatever it names.
    let mut issued = vec![root.clone()];

    for member in &judged.members {
        let owner = member.id == owner_id;
        let standing = standing_of(&member.role, member.permissions, owner);

        if !owner && !standing.removed {
            let certificate = issue_certificate(
                key,
                &root,
                Issue {
                    id: &unused_certificate_id(&issued, &member.id, &issued_at),
                    member_id: &member.id,
                    signing_public_key: &member.signing_public_key,
                    ceiling: standing.effective,
                    rank: standing.rank,
                    issued_at: &issued_at,
                },
            )?;

            store.write_certificate(&certificate).await?;
            issued.push(certificate);
        }

        store
            .write_member(
                &signer,
                &MemberRecord {
                    id: member.id.clone(),
                    username_sealed: member.username_sealed.clone(),
                    vault: member.vault.clone(),
                    // the owner's signing key is what their own secret derives, and the root names
                    // it; everybody else's is the one their row carried under signature.
                    signing_public_key: if owner {
                        key.verifying_key()
                    } else {
                        member.signing_public_key
                    },
                    sealed_content_key: member.sealed_content_key.clone(),
                    role_id: standing.role_id.to_string(),
                    override_mask: standing.override_mask,
                    removed_at: standing.removed.then_some(member.updated_at),
                    effective: standing.effective,
                    covered: true,
                    must_change_password: member.must_change_password,
                    created_at: member.created_at,
                    updated_at: member.updated_at,
                    session_epoch: member.session_epoch,
                    // a standing offer is withdrawn, and this is the seal it carried.
                    owner_seed_sealed: None,
                },
            )
            .await?;
    }

    // a standing offer of the organization is withdrawn: its row goes, and its seal went above.
    // A completed succession stays, since a machine that pinned an older key walks it.
    for succession in store.successions().await? {
        if succession.accepted_at.is_none() {
            store.delete_succession(&succession.id).await?;
        }
    }

    for workspace in &judged.workspaces {
        store.write_workspace(&signer, workspace).await?;
    }

    for grant in &judged.grants {
        store.write_grant(&signer, grant).await?;
    }

    for invitation in &judged.invitations {
        store.write_invitation(&signer, invitation).await?;
    }

    if let Some(mark) = &judged.mark {
        store.write_mark(&signer, mark).await?;
    }

    // the one place an upgrade can be cut short on purpose, which only a test asks for: every
    // row but the one that says it is done, then the refusal the caller's transaction rolls back.
    match until {
        Until::Whole => {}
        #[cfg(test)]
        Until::BeforeTheFormat => {
            return Err(Error::Internal {
                message: "the upgrade was cut short before the format row".to_string(),
            });
        }
    }

    // last: until this row is there, the organization reads as format 1 everywhere.
    store.write_format().await
}

/// Where a member of a format 1 organization stands in this one.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) struct Standing {
    pub role_id: &'static str,
    pub override_mask: i64,
    /// what they end with, which is also the ceiling of the certificate they are issued.
    pub effective: i64,
    pub rank: i64,
    /// whether format 1 had removed them; the moment is the row's `updated_at`.
    pub removed: bool,
}

/// What a member of format 1 holds in this format, from the role word and the seven-act mask
/// their row carried, and whether theirs is the owner's vault: the mapping the plan's
/// *Migration* gives.
///
/// **The owner is whoever holds the key, never a role word.** A row saying `owner` that is not the
/// key holder's reads as the administrator the old build treated it as, every act of the seven
/// included (`permission::mask_of_role` on the main branch).
pub(super) fn standing_of(role: &str, permissions: i64, owner: bool) -> Standing {
    if owner {
        return Standing {
            role_id: permission::OWNER,
            override_mask: 0,
            effective: OWNER_ROLE.mask,
            rank: OWNER_ROLE.rank,
            removed: false,
        };
    }

    if role == REMOVED {
        return Standing {
            role_id: MEMBER_ROLE.id,
            override_mask: 0,
            effective: 0,
            rank: MEMBER_ROLE.rank,
            removed: true,
        };
    }

    let acts = match role {
        permission::OWNER => FORMAT_ONE_ACTS,
        _ => permissions & FORMAT_ONE_ACTS,
    };
    let administrator = role == ADMINISTRATOR || role == permission::OWNER;
    let effective = acts_of(acts)
        | records()
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

    Standing {
        role_id: role.id,
        override_mask: permission::effective(role.mask, effective),
        effective,
        rank: role.rank,
        removed: false,
    }
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

/// Every record flag, delete included: what the old build let every member do.
fn records() -> i64 {
    [
        Family::Complex,
        Family::Unit,
        Family::Tenant,
        Family::Contract,
        Family::Payment,
    ]
    .into_iter()
    .fold(0, |mask, family| {
        mask | permission::mask_of(&family.flags())
    })
}

/// What the owner's grant on the organization database holds, where format 1 signed one for them
/// that verifies: the credential their replica syncs with.
fn owners_credential(
    directory: &FormatOneDirectory,
    organization_id: &str,
    pinned: &[u8; VERIFYING_KEY_BYTES],
    secret: &MemberSecretKey,
) -> Result<Option<String>, Error> {
    let public_key = secret.public_key();
    let Some(owner) = directory
        .members
        .iter()
        .find(|member| member.vault.public_key == public_key)
    else {
        return Ok(None);
    };
    let Some(grant) = directory.grants.iter().find(|grant| {
        grant.record.member_id == owner.id && grant.record.workspace_id == organization_id
    }) else {
        return Ok(None);
    };
    let Some(certificate) = directory
        .certificates
        .iter()
        .find(|certificate| certificate.id == grant.certificate_id)
    else {
        return Ok(None);
    };

    if verify_format_one(
        pinned,
        certificate,
        FormatOneRow::Unchanged(grant_authority(&grant.record)),
        &grant.signature,
    )
    .is_err()
    {
        return Ok(None);
    }

    String::from_utf8(unseal_with_secret_key(
        secret,
        &grant.record.sealed_credential,
    )?)
    .map(Some)
    .map_err(|_| Error::Integrity {
        message: "a sealed credential is not text".to_string(),
    })
}

/// A format 1 organization's rows, judged: what verified, to be carried, and what did not.
struct Judged<'a> {
    members: Vec<&'a FormatOneMemberRow>,
    workspaces: Vec<WorkspaceRecord>,
    grants: Vec<GrantRecord>,
    invitations: Vec<InvitationRecord>,
    mark: Option<MarkRecord>,
    dropped: Vec<Dropped>,
}

/// A row the upgrade does not carry, and why: the log names each one.
struct Dropped {
    table: &'static str,
    id: String,
    reason: String,
}

/// Judge every row of `directory` under the rules of format 1, against `pinned`.
fn judged<'a>(pinned: &[u8; VERIFYING_KEY_BYTES], directory: &'a FormatOneDirectory) -> Judged<'a> {
    let mut judged = Judged {
        members: Vec::new(),
        workspaces: Vec::new(),
        grants: Vec::new(),
        invitations: Vec::new(),
        mark: None,
        dropped: Vec::new(),
    };
    let genuine = |certificate_id: &str, row: FormatOneRow<'_>, signature: &[u8]| {
        let certificate: &FormatOneCertificate = directory
            .certificates
            .iter()
            .find(|certificate| certificate.id == certificate_id)
            .ok_or_else(|| "it names a certificate the organization never issued".to_string())?;

        verify_format_one(pinned, certificate, row, signature).map_err(|error| error.to_string())
    };

    for member in &directory.members {
        match genuine(
            &member.certificate_id,
            FormatOneRow::Member(FormatOneMember {
                public_key: &member.vault.public_key,
                signing_public_key: &member.signing_public_key,
                role: &member.role,
                permissions: member.permissions,
                owner_seed_sealed: member.owner_seed_sealed.as_deref(),
            }),
            &member.signature,
        ) {
            Ok(()) => judged.members.push(member),
            Err(reason) => judged.dropped.push(Dropped {
                table: "member",
                id: member.id.clone(),
                reason,
            }),
        }
    }

    for FormatOneSigned {
        record,
        certificate_id,
        signature,
    } in &directory.workspaces
    {
        match genuine(
            certificate_id,
            FormatOneRow::Unchanged(Authority::Workspace(WorkspaceAuthority {
                database_name: &record.database_name,
                database_hostname: &record.database_hostname,
            })),
            signature,
        ) {
            Ok(()) => judged.workspaces.push(record.clone()),
            Err(reason) => judged.dropped.push(Dropped {
                table: "workspace",
                id: record.id.clone(),
                reason,
            }),
        }
    }

    for FormatOneSigned {
        record,
        certificate_id,
        signature,
    } in &directory.grants
    {
        match genuine(
            certificate_id,
            FormatOneRow::Unchanged(grant_authority(record)),
            signature,
        ) {
            Ok(()) => judged.grants.push(record.clone()),
            Err(reason) => judged.dropped.push(Dropped {
                table: "grant",
                id: format!("{}/{}", record.member_id, record.workspace_id),
                reason,
            }),
        }
    }

    for FormatOneSigned {
        record,
        certificate_id,
        signature,
    } in &directory.invitations
    {
        match genuine(
            certificate_id,
            FormatOneRow::Unchanged(Authority::Invitation(InvitationAuthority {
                id: &record.id,
                member_id: &record.member_id,
                expires_at: record.expires_at,
            })),
            signature,
        ) {
            Ok(()) => judged.invitations.push(record.clone()),
            Err(reason) => judged.dropped.push(Dropped {
                table: "invitation",
                id: record.id.clone(),
                reason,
            }),
        }
    }

    if let Some(FormatOneSigned {
        record,
        certificate_id,
        signature,
    }) = &directory.mark
    {
        match genuine(
            certificate_id,
            FormatOneRow::Unchanged(Authority::Mark(MarkAuthority {
                image_sealed: &record.image_sealed,
                media_type: &record.media_type,
                updated_by: &record.updated_by,
                updated_at: record.updated_at,
            })),
            signature,
        ) {
            Ok(()) => judged.mark = Some(record.clone()),
            Err(reason) => judged.dropped.push(Dropped {
                table: "mark",
                id: "mark".to_string(),
                reason,
            }),
        }
    }

    judged
}

fn grant_authority(grant: &GrantRecord) -> Authority<'_> {
    Authority::Grant(GrantAuthority {
        member_id: &grant.member_id,
        workspace_id: &grant.workspace_id,
        sealed_credential: &grant.sealed_credential,
        access_level: &grant.access_level,
        credential_expires_at: grant.credential_expires_at.as_deref(),
    })
}

fn poisoned() -> Error {
    Error::Internal {
        message: "the credential slot was poisoned".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use std::{
        collections::HashMap,
        path::{Path, PathBuf},
        sync::{Arc, Mutex},
    };

    use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD as BASE64URL};
    use serde_json::json;

    use super::{
        FORMAT_ONE_ACTS, Until, records, standing_of, upgrade_until, with_password,
        with_remembered_key, with_the_owners_password,
    };
    use crate::{
        error::{Error, RefusalReason},
        keyring::take_the_credential_store,
        organization::{
            HeldOrganization,
            authority::{
                AdministratorKey, Authority, Chain, FormatOneCertificate, FormatOneMember,
                FormatOneRow, GrantAuthority, InvitationAuthority, MarkAuthority, OrganizationKey,
                SuccessionAuthority, WorkspaceAuthority, issue_format_one_certificate,
                sign_format_one, sign_succession,
            },
            connect,
            invite::rename_member,
            link::Locator,
            permission::{self, Flag, MANAGER_ROLE, MEMBER_ROLE, OWNER_ROLE},
            session::{
                CredentialSlot, Resumption, refused_by_name, remember, resume, sign_in_by_username,
            },
            setup::{ADMINISTRATOR_KEY_PURPOSE, Remote, connect_existing, owner_key_from},
            store::{FORMAT_VERSION, OrganizationStore, SuccessionRecord},
            vault::{
                ContentKey, KdfParams, MemberKey, MemberSecretKey, Vault,
                create_vault_with_secret_and_key, generate_content_key, open_content, seal_content,
                seal_to_public_key,
            },
            workspace::grant_workspace,
        },
        persisted::Persisted,
        sync::{
            RemoteSyncStore,
            test::server::{ScriptedResponse, ScriptedServer},
            turso::{
                discovery::McpEndpoint,
                platform::{AccessLevel, InMemoryPlatform},
            },
        },
    };

    const ORGANIZATION_ID: &str = "7f3a";
    const NOW: i64 = 1_758_000_000_000;
    const EARLIER: i64 = 1_757_000_000_000;
    const ORGANIZATION_CREDENTIAL: &str = "the-organization-credential";

    /// The schema of format 1, as `origin/main` creates it: every table the build before effort
    /// 838 made, the role word and the seven-act mask on the member row, and
    /// `administrator_certificate` with its unsigned `revoked_at`. Written out rather than read
    /// from anywhere, because nothing in this build writes it any more.
    const FORMAT_ONE_SCHEMA: [&str; 11] = [
        "CREATE TABLE IF NOT EXISTS \"organization\" (\
            \"id\" TEXT PRIMARY KEY NOT NULL, \
            \"name_sealed\" BLOB NOT NULL, \
            \"verifying_key\" BLOB NOT NULL, \
            \"remote_url\" TEXT NOT NULL, \
            \"created_at\" INTEGER NOT NULL)",
        "CREATE TABLE IF NOT EXISTS \"member\" (\
            \"id\" TEXT PRIMARY KEY NOT NULL, \
            \"username_sealed\" BLOB NOT NULL, \
            \"public_key\" BLOB NOT NULL, \
            \"signing_public_key\" BLOB NOT NULL, \
            \"sealed_secret_key\" BLOB NOT NULL, \
            \"sealed_content_key\" BLOB NOT NULL, \
            \"kdf_salt\" BLOB NOT NULL, \
            \"kdf_params\" TEXT NOT NULL, \
            \"role\" TEXT NOT NULL, \
            \"permissions\" INTEGER NOT NULL, \
            \"must_change_password\" INTEGER NOT NULL, \
            \"certificate_id\" TEXT NOT NULL, \
            \"signature\" BLOB NOT NULL, \
            \"created_at\" INTEGER NOT NULL, \
            \"updated_at\" INTEGER NOT NULL, \
            \"session_epoch\" INTEGER NOT NULL DEFAULT 0, \
            \"owner_seed_sealed\" BLOB)",
        "CREATE TABLE IF NOT EXISTS \"administrator_certificate\" (\
            \"id\" TEXT PRIMARY KEY NOT NULL, \
            \"member_id\" TEXT NOT NULL, \
            \"signing_public_key\" BLOB NOT NULL, \
            \"signature_by_organization_key\" BLOB NOT NULL, \
            \"issued_at\" TEXT NOT NULL, \
            \"revoked_at\" TEXT)",
        "CREATE TABLE IF NOT EXISTS \"workspace\" (\
            \"id\" TEXT PRIMARY KEY NOT NULL, \
            \"name_sealed\" BLOB NOT NULL, \
            \"database_name\" TEXT NOT NULL, \
            \"database_hostname\" TEXT NOT NULL, \
            \"schema_version\" INTEGER NOT NULL, \
            \"certificate_id\" TEXT NOT NULL, \
            \"signature\" BLOB NOT NULL, \
            \"created_at\" INTEGER NOT NULL, \
            \"updated_at\" INTEGER NOT NULL)",
        "CREATE TABLE IF NOT EXISTS \"grant\" (\
            \"member_id\" TEXT NOT NULL, \
            \"workspace_id\" TEXT NOT NULL, \
            \"sealed_credential\" BLOB NOT NULL, \
            \"access_level\" TEXT NOT NULL, \
            \"credential_expires_at\" TEXT, \
            \"certificate_id\" TEXT NOT NULL, \
            \"signature\" BLOB NOT NULL, \
            PRIMARY KEY (\"member_id\", \"workspace_id\"))",
        "CREATE TABLE IF NOT EXISTS \"invitation\" (\
            \"id\" TEXT PRIMARY KEY NOT NULL, \
            \"member_id\" TEXT NOT NULL, \
            \"expires_at\" INTEGER NOT NULL, \
            \"consumed_at\" INTEGER, \
            \"sealed_secret\" BLOB NOT NULL, \
            \"issued_by\" TEXT NOT NULL, \
            \"certificate_id\" TEXT NOT NULL, \
            \"signature\" BLOB NOT NULL, \
            \"created_at\" INTEGER NOT NULL)",
        "CREATE TABLE IF NOT EXISTS \"migration_lease\" (\
            \"workspace_id\" TEXT PRIMARY KEY NOT NULL, \
            \"holder_member_id\" TEXT NOT NULL, \
            \"expires_at\" INTEGER NOT NULL)",
        "CREATE TABLE IF NOT EXISTS \"machine_link\" (\
            \"id\" TEXT PRIMARY KEY NOT NULL, \
            \"member_id\" TEXT NOT NULL, \
            \"expires_at\" INTEGER NOT NULL, \
            \"consumed_at\" INTEGER, \
            \"created_at\" INTEGER NOT NULL)",
        "CREATE TABLE IF NOT EXISTS \"machine\" (\
            \"id\" TEXT PRIMARY KEY NOT NULL, \
            \"member_id\" TEXT, \
            \"seen_at\" INTEGER NOT NULL, \
            \"created_at\" INTEGER NOT NULL)",
        "CREATE TABLE IF NOT EXISTS \"succession\" (\
            \"id\" TEXT PRIMARY KEY NOT NULL, \
            \"offered_member_id\" TEXT NOT NULL, \
            \"offered_by\" TEXT NOT NULL, \
            \"offered_at\" INTEGER NOT NULL, \
            \"old_verifying_key\" BLOB NOT NULL, \
            \"new_verifying_key\" BLOB, \
            \"accepted_at\" INTEGER, \
            \"signature\" BLOB NOT NULL)",
        "CREATE TABLE IF NOT EXISTS \"mark\" (\
            \"id\" TEXT PRIMARY KEY NOT NULL, \
            \"image_sealed\" BLOB NOT NULL, \
            \"media_type\" TEXT NOT NULL, \
            \"updated_by\" TEXT NOT NULL, \
            \"updated_at\" INTEGER NOT NULL, \
            \"certificate_id\" TEXT NOT NULL, \
            \"signature\" BLOB NOT NULL)",
    ];

    // the seven acts of format 1, as `origin/main`'s `permission::Administration` numbered them.
    const INVITE_MEMBER: i64 = 1 << 0;
    const REMOVE_MEMBER: i64 = 1 << 1;
    const CHANGE_ROLE: i64 = 1 << 2;
    const RENAME_WORKSPACE: i64 = 1 << 3;
    const RENAME_MEMBER: i64 = 1 << 5;
    const GRANT_WORKSPACE: i64 = 1 << 6;

    fn test_cost() -> KdfParams {
        KdfParams {
            memory_kib: 1024,
            iterations: 2,
            lanes: 1,
        }
    }

    fn scratch(name: &str) -> PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|elapsed| elapsed.as_nanos())
            .unwrap_or_default();
        let directory = std::env::temp_dir().join(format!("rentable-upgrade-{name}-{nanos:x}"));
        std::fs::create_dir_all(&directory).expect("scratch directory");

        directory
    }

    fn slot() -> CredentialSlot {
        Arc::new(Mutex::new(None))
    }

    /// One person in the older organization: their vault, the key it was opened with, and the
    /// signing key its secret derives.
    struct Person {
        id: &'static str,
        username: &'static str,
        password: &'static str,
        vault: Vault,
        secret: MemberSecretKey,
        member_key: MemberKey,
        signing: AdministratorKey,
        role: &'static str,
        permissions: i64,
        session_epoch: i64,
        must_change_password: bool,
    }

    impl Person {
        fn new(
            id: &'static str,
            username: &'static str,
            role: &'static str,
            permissions: i64,
            session_epoch: i64,
        ) -> Self {
            let password = match id {
                "owner" => "the owners own password",
                "adam" => "a password adam chose",
                "lena" => "a password lena chose",
                "mina" => "a password mina chose",
                _ => "a password nobody types",
            };
            let (vault, secret, member_key) =
                create_vault_with_secret_and_key(password, test_cost()).expect("a vault");
            let signing = AdministratorKey::from_bytes(
                &secret
                    .derive_seed(ADMINISTRATOR_KEY_PURPOSE)
                    .expect("the signing seed"),
            );

            Self {
                id,
                username,
                password,
                vault,
                secret,
                member_key,
                signing,
                role,
                permissions,
                session_epoch,
                must_change_password: id == "pia",
            }
        }
    }

    /// An organization of format 1 on this machine, as the build before effort 838 left it, and
    /// what the test needs to act in it.
    struct Older {
        directory: PathBuf,
        path: PathBuf,
        held: HeldOrganization,
        organization_key: OrganizationKey,
        content_key: ContentKey,
        people: HashMap<&'static str, Person>,
    }

    impl Older {
        fn person(&self, id: &str) -> &Person {
            self.people.get(id).expect("a person of the fixture")
        }

        fn pinned(&self) -> [u8; 32] {
            self.organization_key.verifying_key()
        }

        /// The record a machine this person signed in on keeps.
        fn held_by(&self, id: &str) -> HeldOrganization {
            HeldOrganization {
                member_id: Some(id.to_string()),
                ..self.held.clone()
            }
        }

        async fn open(&self) -> OrganizationStore {
            OrganizationStore::open(&self.path, None, || async {
                Ok::<String, turso::Error>(String::new())
            })
            .await
            .expect("the replica")
        }
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

    async fn run(store: &OrganizationStore, sql: &str, values: Vec<turso::Value>) {
        store
            .connection()
            .execute(sql, values)
            .await
            .unwrap_or_else(|error| panic!("{sql}: {error}"));
    }

    fn text(value: &str) -> turso::Value {
        turso::Value::Text(value.to_string())
    }

    fn bytes(value: &[u8]) -> turso::Value {
        turso::Value::Blob(value.to_vec())
    }

    async fn write_certificate(store: &OrganizationStore, certificate: &FormatOneCertificate) {
        run(
            store,
            "INSERT INTO \"administrator_certificate\" VALUES (?, ?, ?, ?, ?, ?)",
            vec![
                text(&certificate.id),
                text(&certificate.member_id),
                bytes(&certificate.signing_public_key),
                bytes(&certificate.signature_by_organization_key),
                text(&certificate.issued_at),
                certificate
                    .revoked_at
                    .as_deref()
                    .map_or(turso::Value::Null, text),
            ],
        )
        .await;
    }

    /// A member row of format 1, signed `member.v2` under `certificate` by `signer`.
    #[allow(clippy::too_many_arguments)]
    async fn write_member(
        store: &OrganizationStore,
        content_key: &ContentKey,
        person: &Person,
        signer: &AdministratorKey,
        certificate: &FormatOneCertificate,
        owner_seed_sealed: Option<&[u8]>,
        updated_at: i64,
    ) {
        let signature = sign_format_one(
            signer,
            certificate,
            FormatOneRow::Member(FormatOneMember {
                public_key: &person.vault.public_key,
                signing_public_key: &person.signing.verifying_key(),
                role: person.role,
                permissions: person.permissions,
                owner_seed_sealed,
            }),
        );

        run(
            store,
            "INSERT INTO \"member\" VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            vec![
                text(person.id),
                bytes(
                    &seal_content(
                        content_key,
                        "member.username_sealed",
                        person.username.as_bytes(),
                    )
                    .expect("the username"),
                ),
                bytes(&person.vault.public_key),
                bytes(&person.signing.verifying_key()),
                bytes(&person.vault.sealed_secret_key),
                bytes(
                    &seal_to_public_key(&person.vault.public_key, &content_key.to_bytes())
                        .expect("the content key"),
                ),
                bytes(&person.vault.kdf_salt),
                text(&person.vault.kdf_params.encode()),
                text(person.role),
                turso::Value::Integer(person.permissions),
                turso::Value::Integer(i64::from(person.must_change_password)),
                text(&certificate.id),
                bytes(&signature),
                turso::Value::Integer(EARLIER),
                turso::Value::Integer(updated_at),
                turso::Value::Integer(person.session_epoch),
                owner_seed_sealed.map_or(turso::Value::Null, bytes),
            ],
        )
        .await;
    }

    /// A grant row of format 1, signed under `certificate` by `signer`, or with its signature
    /// broken where it is `forged`.
    #[allow(clippy::too_many_arguments)]
    async fn write_grant(
        store: &OrganizationStore,
        member: &Person,
        workspace_id: &str,
        credential: &str,
        access_level: &str,
        signer: &AdministratorKey,
        certificate: &FormatOneCertificate,
        forged: bool,
    ) {
        let sealed = seal_to_public_key(&member.vault.public_key, credential.as_bytes())
            .expect("the credential");
        let mut signature = sign_format_one(
            signer,
            certificate,
            FormatOneRow::Unchanged(Authority::Grant(GrantAuthority {
                member_id: member.id,
                workspace_id,
                sealed_credential: &sealed,
                access_level,
                credential_expires_at: Some("1760000000000"),
            })),
        );

        if forged {
            signature[0] ^= 0xff;
        }

        run(
            store,
            "INSERT OR REPLACE INTO \"grant\" VALUES (?, ?, ?, ?, ?, ?, ?)",
            vec![
                text(member.id),
                text(workspace_id),
                bytes(&sealed),
                text(access_level),
                text("1760000000000"),
                text(&certificate.id),
                bytes(&signature),
            ],
        )
        .await;
    }

    /// The organization every test here starts from, in the main-branch shape: the owner; an
    /// administrator the owner narrowed, standing offered the organization; a member granted
    /// administration acts; a plain member; a removed member, whose certificate is revoked; a
    /// member whose invitation is pending; a workspace with a full-access and a read-only grant;
    /// the mark; and a member row and a grant that do not verify.
    async fn older(name: &str) -> Older {
        let directory = scratch(name);
        let path = OrganizationStore::replica_path(&directory.join("app.db"), ORGANIZATION_ID);
        let store = OrganizationStore::open(&path, None, || async {
            Ok::<String, turso::Error>(String::new())
        })
        .await
        .expect("the replica");

        for statement in FORMAT_ONE_SCHEMA {
            run(&store, statement, Vec::new()).await;
        }

        let owner = Person::new("owner", "olivia.owner", "owner", FORMAT_ONE_ACTS, 3);
        let organization_key = owner_key_from(&owner.secret).expect("the organization key");
        let content_key = generate_content_key().expect("a content key");
        let people = [
            owner,
            // narrowed by the owner: no renaming or granting a workspace, and no reset.
            Person::new(
                "adam",
                "adam.admin",
                "administrator",
                INVITE_MEMBER | REMOVE_MEMBER | CHANGE_ROLE | RENAME_MEMBER,
                5,
            ),
            Person::new(
                "lena",
                "lena.lead",
                "member",
                RENAME_WORKSPACE | GRANT_WORKSPACE,
                1,
            ),
            Person::new("mina", "mina.member", "member", 0, 2),
            Person::new("rafi", "rafi.removed", "removed", 0, 4),
            Person::new("pia", "pia.pending", "member", 0, 0),
            Person::new(
                "mallory",
                "mallory.forged",
                "administrator",
                FORMAT_ONE_ACTS,
                0,
            ),
        ]
        .into_iter()
        .map(|person| (person.id, person))
        .collect::<HashMap<_, _>>();
        let certificate = |id: &str| {
            issue_format_one_certificate(
                &organization_key,
                &format!("cert-{id}"),
                id,
                &people[id].signing.verifying_key(),
                &EARLIER.to_string(),
            )
        };
        let owners = certificate("owner");
        let adams = certificate("adam");
        let lenas = certificate("lena");
        // the removal revoked it by writing the column, which is all format 1 asked.
        let rafis = FormatOneCertificate {
            revoked_at: Some((EARLIER + 10).to_string()),
            ..certificate("rafi")
        };

        run(
            &store,
            "INSERT INTO \"organization\" VALUES (?, ?, ?, ?, ?)",
            vec![
                text(ORGANIZATION_ID),
                bytes(
                    &seal_content(&content_key, "organization.name_sealed", b"Acme Rentals")
                        .expect("the name"),
                ),
                bytes(&organization_key.verifying_key()),
                text("libsql://org-7f3a-an-org.aws-eu-west-1.turso.io"),
                turso::Value::Integer(EARLIER),
            ],
        )
        .await;

        for issued in [&owners, &adams, &lenas, &rafis] {
            write_certificate(&store, issued).await;
        }

        let owner = &people["owner"];
        let adam = &people["adam"];
        let lena = &people["lena"];
        let mina = &people["mina"];
        // the organization offered to adam and not accepted yet: the seal on his row and the
        // succession row the organization key signed.
        let seal = seal_to_public_key(&adam.vault.public_key, &organization_key.to_bytes())
            .expect("the offer's seal");

        write_member(
            &store,
            &content_key,
            owner,
            &owner.signing,
            &owners,
            None,
            EARLIER,
        )
        .await;
        write_member(
            &store,
            &content_key,
            adam,
            &owner.signing,
            &owners,
            Some(&seal),
            EARLIER,
        )
        .await;
        write_member(
            &store,
            &content_key,
            lena,
            &owner.signing,
            &owners,
            None,
            EARLIER,
        )
        .await;
        write_member(
            &store,
            &content_key,
            mina,
            &adam.signing,
            &adams,
            None,
            EARLIER,
        )
        .await;
        write_member(
            &store,
            &content_key,
            &people["rafi"],
            &owner.signing,
            &owners,
            None,
            EARLIER + 10,
        )
        .await;
        write_member(
            &store,
            &content_key,
            &people["pia"],
            &adam.signing,
            &adams,
            None,
            EARLIER,
        )
        .await;
        // signed with mallory's own key under adam's certificate, which does not name it.
        write_member(
            &store,
            &content_key,
            &people["mallory"],
            &people["mallory"].signing,
            &adams,
            None,
            EARLIER,
        )
        .await;

        store
            .write_succession(&SuccessionRecord {
                id: "offer".to_string(),
                offered_member_id: "adam".to_string(),
                offered_by: "owner".to_string(),
                offered_at: EARLIER,
                old_verifying_key: organization_key.verifying_key(),
                new_verifying_key: None,
                accepted_at: None,
                signature: sign_succession(
                    &organization_key,
                    SuccessionAuthority {
                        id: "offer",
                        offered_member_id: "adam",
                        offered_by: "owner",
                        offered_at: EARLIER,
                        old_verifying_key: &organization_key.verifying_key(),
                        new_verifying_key: None,
                        accepted_at: None,
                    },
                ),
            })
            .await
            .expect("the offer");

        let workspace = WorkspaceAuthority {
            database_name: "ws-north",
            database_hostname: "ws-north-an-org.aws-eu-west-1.turso.io",
        };

        run(
            &store,
            "INSERT INTO \"workspace\" VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            vec![
                text("north"),
                bytes(
                    &seal_content(&content_key, "workspace.name_sealed", b"North Properties")
                        .expect("the name"),
                ),
                text(workspace.database_name),
                text(workspace.database_hostname),
                turso::Value::Integer(9),
                text(&owners.id),
                bytes(&sign_format_one(
                    &owner.signing,
                    &owners,
                    FormatOneRow::Unchanged(Authority::Workspace(workspace)),
                )),
                turso::Value::Integer(EARLIER),
                turso::Value::Integer(EARLIER),
            ],
        )
        .await;

        // the organization's own database, for the owner and for mina, whose remembered session
        // pulls with it; north at full access for lena, and for mina granted by lena under her
        // own certificate; north read-only for adam, which only the owner mints; and a grant
        // somebody wrote for lena at the owner's name, which does not verify.
        write_grant(
            &store,
            owner,
            ORGANIZATION_ID,
            ORGANIZATION_CREDENTIAL,
            "full-access",
            &owner.signing,
            &owners,
            false,
        )
        .await;
        write_grant(
            &store,
            mina,
            ORGANIZATION_ID,
            ORGANIZATION_CREDENTIAL,
            "full-access",
            &owner.signing,
            &owners,
            false,
        )
        .await;
        write_grant(
            &store,
            lena,
            "north",
            "north-full",
            "full-access",
            &owner.signing,
            &owners,
            false,
        )
        .await;
        write_grant(
            &store,
            mina,
            "north",
            "north-full",
            "full-access",
            &lena.signing,
            &lenas,
            false,
        )
        .await;
        write_grant(
            &store,
            adam,
            "north",
            "north-read",
            "read-only",
            &owner.signing,
            &owners,
            false,
        )
        .await;
        write_grant(
            &store,
            lena,
            ORGANIZATION_ID,
            ORGANIZATION_CREDENTIAL,
            "full-access",
            &owner.signing,
            &owners,
            true,
        )
        .await;

        let pending_until = NOW + 7 * 24 * 60 * 60 * 1000;

        run(
            &store,
            "INSERT INTO \"invitation\" VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?)",
            vec![
                text("invitation-pia"),
                text("pia"),
                turso::Value::Integer(pending_until),
                bytes(b"the issuer's sealed copy"),
                text("adam"),
                text(&adams.id),
                bytes(&sign_format_one(
                    &adam.signing,
                    &adams,
                    FormatOneRow::Unchanged(Authority::Invitation(InvitationAuthority {
                        id: "invitation-pia",
                        member_id: "pia",
                        expires_at: pending_until,
                    })),
                )),
                turso::Value::Integer(EARLIER),
            ],
        )
        .await;

        let image = seal_content(&content_key, "mark.image_sealed", b"a seal").expect("the mark");

        run(
            &store,
            "INSERT INTO \"mark\" VALUES ('mark', ?, 'image/png', 'adam', ?, ?, ?)",
            vec![
                bytes(&image),
                turso::Value::Integer(EARLIER),
                text(&adams.id),
                bytes(&sign_format_one(
                    &adam.signing,
                    &adams,
                    FormatOneRow::Unchanged(Authority::Mark(MarkAuthority {
                        image_sealed: &image,
                        media_type: "image/png",
                        updated_by: "adam",
                        updated_at: EARLIER,
                    })),
                )),
            ],
        )
        .await;

        drop(store);

        let held = HeldOrganization {
            id: ORGANIZATION_ID.to_string(),
            name: "Acme Rentals".to_string(),
            verifying_key: BASE64URL.encode(organization_key.verifying_key()),
            remote_url: "libsql://org-7f3a-an-org.aws-eu-west-1.turso.io".to_string(),
            machine_id: String::new(),
            member_id: Some("owner".to_string()),
            role: Some("owner".to_string()),
            joined_at: EARLIER,
        };

        Older {
            directory,
            path,
            held,
            organization_key,
            content_key,
            people,
        }
    }

    /// A copy of the replica as another machine would hold it, opened as a second store that
    /// holds no key but the verifying key the machine pinned.
    async fn another_machine(from: &Path) -> OrganizationStore {
        let elsewhere = scratch("elsewhere");

        for entry in std::fs::read_dir(from).expect("the directory") {
            let path = entry.expect("an entry").path();
            let name = path
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or_default()
                .to_string();

            if name.starts_with("org-") {
                std::fs::copy(&path, elsewhere.join(&name)).expect("the copy");
            }
        }

        OrganizationStore::open(
            &OrganizationStore::replica_path(&elsewhere.join("app.db"), ORGANIZATION_ID),
            None,
            || async { Err(turso::Error::Misuse("no remote".into())) },
        )
        .await
        .expect("their replica did not open")
    }

    fn reason_of<T>(result: &Result<T, Error>) -> Option<RefusalReason> {
        match result {
            Err(Error::Refused { reason, .. }) => Some(*reason),
            _ => None,
        }
    }

    fn mask(flags: &[Flag]) -> i64 {
        permission::mask_of(flags)
    }

    /// The mapping itself, one case per kind of member format 1 had: exactly what each could do,
    /// every record act included, as a role and an override.
    #[test]
    fn each_member_of_format_one_keeps_exactly_what_they_could_do() {
        let owner = standing_of("owner", FORMAT_ONE_ACTS, true);

        assert_eq!(
            (owner.role_id, owner.override_mask, owner.effective),
            ("owner", 0, OWNER_ROLE.mask)
        );

        // an administrator the owner narrowed: their acts, `changeRole` as two, every record act,
        // and the mark and the roles.
        let narrowed = standing_of(
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

        // an administrator with every act is a manager with nothing switched.
        let whole = standing_of("administrator", FORMAT_ONE_ACTS, false);

        assert_eq!(whole.effective, MANAGER_ROLE.mask);
        assert_eq!(whole.override_mask, 0);

        // a member granted administration acts: a manager holding exactly those, and the records.
        let lead = standing_of("member", GRANT_WORKSPACE | RENAME_WORKSPACE, false);

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
        let member = standing_of("member", 0, false);

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
        let removed = standing_of("removed", 0, false);

        assert_eq!(
            (removed.role_id, removed.override_mask, removed.removed),
            ("member", 0, true)
        );

        // and a row saying owner that is not the key holder's reads as the administrator the old
        // build treated it as.
        assert_eq!(standing_of("owner", 0, false).effective, MANAGER_ROLE.mask);

        // nothing any of them ends with is the owner's.
        for standing in [narrowed, whole, lead, member] {
            assert_eq!(
                standing.effective & mask(&permission::OWNER_ONLY),
                0,
                "{standing:?}"
            );
        }
    }

    /// **Ticket 22's second, third and ninth criteria.** The owner signs in on this build with
    /// their password: the organization reads as format 2, with the three built-in roles, no
    /// `administrator_certificate`, and every member standing where they could stand before; the
    /// credential the owner's grant held is in the slot; what did not verify is gone; the standing
    /// offer is withdrawn; and every session epoch is the one the row carried.
    #[tokio::test]
    async fn the_owners_sign_in_upgrades_the_organization_and_everybody_keeps_what_they_could_do() {
        let older = older("sign-in").await;
        let store = older.open().await;
        let owner = older.person("owner");
        let credential = slot();

        assert!(store.is_format_one().await.expect("the format"));

        with_password(
            &store,
            &older.held,
            owner.username,
            owner.password,
            &credential,
            NOW,
        )
        .await
        .expect("the owner's sign-in did not upgrade the organization");

        store
            .refuse_another_format()
            .await
            .expect("the upgraded organization was refused");

        let session = sign_in_by_username(
            &store,
            &older.held,
            owner.username,
            owner.password,
            &credential,
        )
        .await
        .expect("the owner did not sign in after the upgrade");

        assert_eq!(session.role, "owner");
        assert_eq!(session.permissions, OWNER_ROLE.mask);
        assert_eq!(
            credential.lock().expect("the slot").as_deref(),
            Some(ORGANIZATION_CREDENTIAL)
        );

        // format 2, the tables this build writes, and no certificate table of the old shape.
        assert_eq!(
            store.format().await.expect("the format"),
            Some(FORMAT_VERSION)
        );
        assert!(!store.is_format_one().await.expect("the format"));

        let tables = store.tables().await.expect("the tables");

        for table in crate::organization::store::TABLES {
            assert!(
                tables.iter().any(|name| name == table),
                "{table} is missing"
            );
        }

        assert!(
            !tables
                .iter()
                .any(|name| name == "administrator_certificate")
        );

        let columns = store.columns_of("member").await.expect("the columns");

        assert!(
            !columns
                .iter()
                .any(|column| column == "role" || column == "permissions")
        );

        // the three built-in roles: the owner's constant and the two rows.
        let pinned = older.pinned();
        let roles = store.roles(&pinned).await.expect("the roles");

        assert_eq!(
            roles
                .iter()
                .map(|role| (role.id.as_str(), role.kind.as_str(), role.mask, role.rank))
                .collect::<Vec<_>>(),
            vec![
                ("manager", "manager", MANAGER_ROLE.mask, MANAGER_ROLE.rank),
                ("member", "member", MEMBER_ROLE.mask, MEMBER_ROLE.rank),
            ]
        );

        let members = store.members(&pinned).await.expect("the members");
        let row = |id: &str| {
            members
                .iter()
                .find(|member| member.id == id)
                .unwrap_or_else(|| panic!("{id} was not carried"))
        };
        let records = records();

        // the owner: owner, no override.
        assert_eq!(
            (row("owner").role_id.as_str(), row("owner").override_mask),
            ("owner", 0)
        );
        assert_eq!(row("owner").effective, OWNER_ROLE.mask);

        // the administrator the owner narrowed: a manager, with exactly their acts, the records,
        // the mark and the roles.
        assert_eq!(row("adam").role_id, "manager");
        assert_eq!(
            row("adam").effective,
            mask(&[
                Flag::InviteMember,
                Flag::RemoveMember,
                Flag::AssignRole,
                Flag::OverrideMember,
                Flag::RenameMember,
                Flag::ManageMark,
                Flag::ManageRoles,
            ]) | records
        );

        // the member granted administration acts: a manager holding exactly those.
        assert_eq!(row("lena").role_id, "manager");
        assert_eq!(
            row("lena").effective,
            mask(&[Flag::RenameWorkspace, Flag::GrantWorkspace]) | records
        );

        // the plain member and the pending one: members, every record act, delete included.
        for id in ["mina", "pia"] {
            assert_eq!(row(id).role_id, "member");
            assert_eq!(row(id).effective, records, "{id}");
        }

        assert!(row("pia").must_change_password);

        // the removed member is removed, grants nothing, and holds no live certificate.
        assert_eq!(row("rafi").removed_at, Some(EARLIER + 10));
        assert_eq!(row("rafi").effective, 0);
        assert!(
            store
                .live_certificates(&pinned, "rafi")
                .await
                .expect("the certificates")
                .is_empty()
        );

        // every live member holds exactly one live certificate, issued from the root, whose
        // ceiling is what they end with and whose key is the one their row carries.
        let (certificates, revocations) = store.chain_rows().await.expect("the chain");
        let chain = Chain::new(&pinned, &certificates, &revocations);
        let root = chain
            .live_certificates_of("owner")
            .into_iter()
            .find(|certificate| certificate.is_root())
            .expect("the owner holds the root");

        for id in ["adam", "lena", "mina", "pia"] {
            let held = chain.live_certificates_of(id);

            assert_eq!(held.len(), 1, "{id}");
            assert_eq!(
                held[0].issuer_certificate_id.as_deref(),
                Some(root.id.as_str())
            );
            assert_eq!(held[0].ceiling, row(id).effective, "{id}");
            assert_eq!(
                held[0].signing_public_key,
                row(id).signing_public_key,
                "{id}"
            );
        }

        // the row that did not verify is not carried; neither is the grant.
        assert!(!members.iter().any(|member| member.id == "mallory"));

        let grants = store.grants(&pinned).await.expect("the grants");

        assert_eq!(
            grants
                .iter()
                .map(|grant| (
                    grant.member_id.as_str(),
                    grant.workspace_id.as_str(),
                    grant.access_level.as_str()
                ))
                .collect::<Vec<_>>(),
            vec![
                ("adam", "north", "read-only"),
                ("lena", "north", "full-access"),
                ("mina", ORGANIZATION_ID, "full-access"),
                ("mina", "north", "full-access"),
                ("owner", ORGANIZATION_ID, "full-access"),
            ]
        );

        // the standing offer is withdrawn: its row and its seal.
        assert!(
            store
                .successions()
                .await
                .expect("the successions")
                .is_empty()
        );
        assert_eq!(row("adam").owner_seed_sealed, None);

        // every session epoch is the one the row carried, so every remembered session survives.
        for (id, person) in &older.people {
            if *id != "mallory" {
                assert_eq!(row(id).session_epoch, person.session_epoch, "{id}");
            }
        }

        // the workspace, the invitation and the mark are carried.
        assert_eq!(
            store
                .workspaces(&pinned)
                .await
                .expect("the workspaces")
                .iter()
                .map(|workspace| workspace.id.as_str())
                .collect::<Vec<_>>(),
            vec!["north"]
        );
        assert_eq!(
            store
                .invitations(&pinned)
                .await
                .expect("the invitations")
                .iter()
                .map(|invitation| (invitation.id.as_str(), invitation.member_id.as_str()))
                .collect::<Vec<_>>(),
            vec![("invitation-pia", "pia")]
        );

        let mark = store
            .mark(&pinned)
            .await
            .expect("the mark")
            .expect("a mark");

        assert_eq!(
            open_content(&older.content_key, "mark.image_sealed", &mark.image_sealed)
                .expect("the image"),
            b"a seal"
        );
    }

    /// **Ticket 22's fourth criterion.** A second store on the same database, holding no key but
    /// the verifying key it pinned, reads every member, role, certificate, workspace, grant,
    /// invitation and mark row verified; and what the administrator and the member granted
    /// administration acts sign afterwards, with the owner nowhere in it, verifies there too.
    #[tokio::test]
    async fn every_upgraded_row_and_every_act_signed_afterwards_verifies_on_another_machine() {
        let older = older("elsewhere").await;
        let store = older.open().await;
        let owner = older.person("owner");

        with_password(
            &store,
            &older.held,
            owner.username,
            owner.password,
            &slot(),
            NOW,
        )
        .await
        .expect("the upgrade");

        // the administrator renames the plain member, and the member granted administration acts
        // grants north to the pending one at full access. Each signs under the certificate the
        // upgrade issued them.
        let adam = older.person("adam");
        let adams = sign_in_by_username(
            &store,
            &older.held_by("adam"),
            adam.username,
            adam.password,
            &slot(),
        )
        .await
        .expect("the administrator did not sign in after the upgrade");

        assert_eq!(adams.role, "manager");

        rename_member(&store, &adams, "mina", "mina.renamed", NOW + 1)
            .await
            .expect("the manager could not rename a member");

        let lena = older.person("lena");
        let lenas = sign_in_by_username(
            &store,
            &older.held_by("lena"),
            lena.username,
            lena.password,
            &slot(),
        )
        .await
        .expect("the member granted administration acts did not sign in after the upgrade");

        grant_workspace(
            &store,
            &lenas,
            None::<&InMemoryPlatform>,
            "north",
            "pia",
            AccessLevel::FullAccess,
        )
        .await
        .expect("the member granted administration acts could not grant a workspace");

        drop(store);

        let elsewhere = another_machine(&older.directory).await;
        let pinned = older.pinned();

        assert_eq!(
            elsewhere.format().await.expect("the format"),
            Some(FORMAT_VERSION)
        );

        let members = elsewhere.members(&pinned).await.expect("the members");

        assert_eq!(members.len(), 6);
        assert!(members.iter().all(|member| member.covered), "{members:?}");

        let mina = members
            .iter()
            .find(|member| member.id == "mina")
            .expect("mina");

        assert_eq!(
            open_content(
                &older.content_key,
                "member.username_sealed",
                &mina.username_sealed
            )
            .expect("the username"),
            b"mina.renamed"
        );
        assert_eq!(elsewhere.roles(&pinned).await.expect("the roles").len(), 2);

        let (certificates, revocations) = elsewhere.chain_rows().await.expect("the chain");
        let chain = Chain::new(&pinned, &certificates, &revocations);

        for certificate in &certificates {
            chain
                .live(&certificate.id)
                .unwrap_or_else(|error| panic!("{} does not verify: {error}", certificate.id));
        }

        assert_eq!(certificates.len(), 5, "the root and one per live member");
        assert_eq!(
            elsewhere
                .workspaces(&pinned)
                .await
                .expect("the workspaces")
                .len(),
            1
        );
        assert!(
            elsewhere
                .grants(&pinned)
                .await
                .expect("the grants")
                .iter()
                .any(|grant| grant.member_id == "pia" && grant.workspace_id == "north")
        );
        assert_eq!(
            elsewhere
                .invitations(&pinned)
                .await
                .expect("the invitations")
                .len(),
            1
        );
        assert!(elsewhere.mark(&pinned).await.expect("the mark").is_some());
    }

    /// **Ticket 22's fifth criterion.** An upgrade cut short before the `format` row is written
    /// leaves the organization exactly as it was, reading as format 1, and the owner's next
    /// sign-in completes it.
    #[tokio::test]
    async fn an_upgrade_cut_short_still_reads_as_format_one_and_the_next_sign_in_completes_it() {
        let older = older("cut-short").await;
        let store = older.open().await;
        let owner = older.person("owner");
        let before = contents(&store).await;
        let cut = upgrade_until(
            &store,
            &older.organization_key,
            &owner.secret,
            NOW,
            Until::BeforeTheFormat,
        )
        .await;

        assert!(
            matches!(&cut, Err(Error::Internal { message }) if message.contains("cut short")),
            "the upgrade was not cut short where the test cut it: {cut:?}"
        );
        assert!(store.is_format_one().await.expect("the format"));
        assert_eq!(store.format().await.expect("the format"), None);
        assert_eq!(
            contents(&store).await,
            before,
            "the cut left something behind"
        );

        with_password(
            &store,
            &older.held,
            owner.username,
            owner.password,
            &slot(),
            NOW,
        )
        .await
        .expect("the next sign-in did not complete the upgrade");

        assert_eq!(
            store.format().await.expect("the format"),
            Some(FORMAT_VERSION)
        );
        assert_eq!(
            store
                .members(&older.pinned())
                .await
                .expect("the members")
                .len(),
            6
        );
    }

    /// **Ticket 22's sixth criterion.** Opened first by anybody but its owner, at a sign-in, a
    /// resume or a connect, the organization is refused as waiting for its owner and nothing is
    /// written to it. A pair that opens no vault is the wall's one sentence, as any sign-in's.
    #[tokio::test]
    async fn opened_first_by_a_member_it_waits_for_its_owner_and_nothing_is_written() {
        let _turn = take_the_credential_store().await;
        let older = older("member-first").await;
        let store = older.open().await;
        let before = contents(&store).await;

        // the sign-in, by the administrator and by a plain member.
        for id in ["adam", "mina"] {
            let person = older.person(id);
            let refused = with_password(
                &store,
                &older.held_by(id),
                person.username,
                person.password,
                &slot(),
                NOW,
            )
            .await;

            assert_eq!(
                reason_of(&refused),
                Some(RefusalReason::OrganizationOlder),
                "{id}: {refused:?}"
            );
        }

        // a wrong password.
        let refused = with_password(
            &store,
            &older.held,
            "olivia.owner",
            "not the owners password",
            &slot(),
            NOW,
        )
        .await;

        assert_eq!(refused, Err(refused_by_name(&older.held.name)));

        // the resume, with the key mina's machine filed at her last sign-in.
        let mina = older.person("mina");

        remember(
            ORGANIZATION_ID,
            "mina",
            mina.session_epoch,
            &mina.member_key,
        );

        let refused = with_remembered_key(&store, &older.held_by("mina"), &slot(), NOW).await;

        assert_eq!(
            reason_of(&refused),
            Some(RefusalReason::OrganizationOlder),
            "{refused:?}"
        );

        // the connect by link, as any member's machine makes it.
        let mut machine = Persisted::<RemoteSyncStore>::load(older.directory.join("m.json"))
            .expect("the machine");
        let refused = connect::connect(
            &store,
            &mut machine,
            &Locator::new(
                ORGANIZATION_ID,
                "Acme Rentals",
                &older.pinned(),
                &older.held.remote_url,
            ),
            "a credential",
            NOW,
        )
        .await;

        assert_eq!(
            reason_of(&refused),
            Some(RefusalReason::OrganizationOlder),
            "{refused:?}"
        );
        assert!(machine.organization.is_none());

        // and the refusal every way in meets says whose it is to open.
        let refused = store.refuse_another_format().await;

        assert_eq!(reason_of(&refused), Some(RefusalReason::OrganizationOlder));
        assert!(
            refused
                .expect_err("refused")
                .to_string()
                .contains("waits for its owner to open it in this version")
        );

        assert_eq!(
            contents(&store).await,
            before,
            "a refusal wrote to the organization"
        );
        assert!(store.is_format_one().await.expect("the format"));
    }

    /// **Ticket 22's seventh and ninth criteria, the resume.** The owner's machine launches with
    /// the key it remembers and no password, and the organization is upgraded the way a sign-in
    /// upgrades it; afterwards the owner's session and the key mina's machine filed before the
    /// upgrade both resume, because every epoch was kept.
    #[tokio::test]
    async fn the_owners_resume_upgrades_it_and_every_remembered_session_survives() {
        let _turn = take_the_credential_store().await;
        let older = older("resume").await;
        let store = older.open().await;
        let owner = older.person("owner");
        let mina = older.person("mina");

        remember(
            ORGANIZATION_ID,
            "owner",
            owner.session_epoch,
            &owner.member_key,
        );
        remember(
            ORGANIZATION_ID,
            "mina",
            mina.session_epoch,
            &mina.member_key,
        );

        let credential = slot();

        with_remembered_key(&store, &older.held, &credential, NOW)
            .await
            .expect("the owner's resume did not upgrade the organization");

        assert_eq!(
            store.format().await.expect("the format"),
            Some(FORMAT_VERSION)
        );
        assert_eq!(
            credential.lock().expect("the slot").as_deref(),
            Some(ORGANIZATION_CREDENTIAL)
        );

        for (id, role) in [("owner", "owner"), ("mina", "member")] {
            match resume(&store, &older.held_by(id), &slot()).await {
                Ok(Resumption::Opened(session)) => {
                    assert_eq!(session.role, role, "{id}");
                    assert_eq!(
                        session.session_epoch,
                        older.person(id).session_epoch,
                        "{id}"
                    );
                }
                other => panic!("{id} did not resume after the upgrade: {other:?}"),
            }
        }
    }

    /// The listing a group holding the older organization answers.
    fn holding_the_organization() -> Vec<ScriptedResponse> {
        vec![
            ScriptedResponse::new(
                200,
                json!({ "jsonrpc": "2.0", "id": 1, "result": { "protocolVersion": "2025-06-18" } })
                    .to_string(),
            ),
            ScriptedResponse::new(
                200,
                json!({
                    "jsonrpc": "2.0",
                    "id": 3,
                    "result": { "content": [{ "type": "text", "text": json!([{
                        "Name": "org-7f3a",
                        "hostname": "org-7f3a-an-org.aws-eu-west-1.turso.io",
                        "group": "rentable"
                    }]).to_string() }] }
                })
                .to_string(),
            ),
        ]
    }

    /// **Ticket 22's seventh criterion, the connect.** A machine connecting on the owner's Turso
    /// account with the owner's password upgrades the organization it pulled the same way, and
    /// ends holding it with the owner signed in; another member's password there waits for the
    /// owner, and the machine holds nothing.
    #[tokio::test]
    async fn the_connect_on_the_owners_account_upgrades_it_the_same_way() {
        let _turn = take_the_credential_store().await;
        let platform = Arc::new(InMemoryPlatform::new("an-org"));

        // the account holds the organization's database and the workspace's, which is what the
        // consent mints for.
        platform.holding_unprotected("org-7f3a");
        platform.holding_unprotected("ws-north");

        // anybody else's password first, which leaves the machine holding nothing.
        let first = older("connect-member").await;
        let mcp = ScriptedServer::start(holding_the_organization()).await;
        let mut machine = Persisted::<RemoteSyncStore>::load(first.directory.join("second.json"))
            .expect("the machine");
        let adam = first.person("adam");
        let refused = connect_existing(
            &mut machine,
            "a-platform-token",
            &McpEndpoint::at(&mcp.url("")),
            |_| Arc::clone(&platform),
            Remote::none(),
            &first.directory.join("app.db"),
            adam.username,
            adam.password,
            NOW,
        )
        .await
        .map(|_| ());

        assert_eq!(
            reason_of(&refused),
            Some(RefusalReason::OrganizationOlder),
            "{refused:?}"
        );
        assert!(machine.organization.is_none());

        // and the owner's.
        let older = older("connect-owner").await;
        let mcp = ScriptedServer::start(holding_the_organization()).await;
        let mut machine = Persisted::<RemoteSyncStore>::load(older.directory.join("second.json"))
            .expect("the machine");
        let owner = older.person("owner");
        let (held, replica, session) = connect_existing(
            &mut machine,
            "a-platform-token",
            &McpEndpoint::at(&mcp.url("")),
            |_| Arc::clone(&platform),
            Remote::none(),
            &older.directory.join("app.db"),
            owner.username,
            owner.password,
            NOW,
        )
        .await
        .expect("the owner's connect did not upgrade the organization");

        assert_eq!(held.id, ORGANIZATION_ID);
        assert_eq!(session.role, "owner");
        assert_eq!(
            replica.format().await.expect("the format"),
            Some(FORMAT_VERSION)
        );
        assert_eq!(
            replica
                .members(&older.pinned())
                .await
                .expect("the members")
                .len(),
            6
        );
    }

    /// **Ticket 22's eighth criterion.** An organization of format 3 is not an older one: the
    /// owner's password upgrades nothing in it, the refusal names the update, and nothing is
    /// written.
    #[tokio::test]
    async fn a_newer_format_is_refused_naming_the_update_and_nothing_is_written() {
        let older = older("newer").await;
        let store = older.open().await;
        let owner = older.person("owner");

        with_password(
            &store,
            &older.held,
            owner.username,
            owner.password,
            &slot(),
            NOW,
        )
        .await
        .expect("the upgrade");
        run(&store, "UPDATE \"format\" SET \"version\" = 3", Vec::new()).await;

        let before = contents(&store).await;

        with_password(
            &store,
            &older.held,
            owner.username,
            owner.password,
            &slot(),
            NOW,
        )
        .await
        .expect("a newer organization was treated as an older one");
        with_the_owners_password(&store, owner.username, owner.password, &slot(), NOW, || {
            Error::Internal {
                message: "a newer organization was treated as an older one".to_string(),
            }
        })
        .await
        .expect("a newer organization was treated as an older one");

        let refused = store.refuse_another_format().await;

        assert_eq!(reason_of(&refused), Some(RefusalReason::OrganizationNewer));
        assert!(
            refused
                .expect_err("refused")
                .to_string()
                .contains("made by a newer version")
        );
        assert_eq!(
            contents(&store).await,
            before,
            "a refusal wrote to the organization"
        );
    }
}
