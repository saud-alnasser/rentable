//! an organization an earlier version made, upgraded in place by its owner's machine (effort 838,
//! requirement 11 as the human amended it on 2026-09-26, tickets 22 and 23).
//!
//! **Only the owner, because every row of this format is signed from the root**, and the root is
//! the organization key, which the owner's vault secret derives (`setup::owner_key_from`) and no
//! other vault does. A vault is the owner's exactly when that key is the key the machine pinned,
//! followed along any handover format 1 signed ([`settled`]), the test `role::repair_owner_row`
//! makes. **Nothing else about the owner is read off a row**: not the role word, not
//! `must_change_password`, not an unsigned `revoked_at` on their certificate. Anybody else who meets
//! an organization of an earlier format, at a sign-in, a resume, a connect, a join or a machine
//! link, is refused with `OrganizationOlder` and the sentence that it waits for its owner, and
//! nothing is written (`store::waits_for_its_owner`).
//!
//! **Where it runs: before the format is refused**, at a sign-in with a password
//! ([`with_password`]), a launch resume with the remembered key ([`with_remembered_key`]) and
//! `setup::connect_existing` ([`with_the_owners_password`]). Each finds the vault first, reading
//! the member rows as they lie, because a password cannot be tried against a vault that has not
//! been read; what it takes from them is the vault and nothing else.
//!
//! **Every machine pulls before it answers** (ticket 23). A member's machine unseals its own grant
//! on the organization database, judged under the rules the row was signed in, and pulls with it:
//! where what arrives is this format, the owner has upgraded and the ordinary sign-in follows;
//! where it is still older, or the pull did not go, the member waits for the owner.
//!
//! **The owner's machine upgrades only against the organization's latest state** (ticket 23): what
//! the old build left captured is pushed first, since a row captured under the columns the upgrade
//! drops cannot share a push with the drop, then what the others wrote is pulled. Where either
//! does not go, nothing is written and the owner is refused with `OrganizationUpgradeOffline`,
//! asking for a connection: an upgrade made offline would be pushed after a remote that had moved
//! on, and a second owner machine could make one of its own. Where the pull brings this format,
//! another machine of the owner's got there first and nothing is written.
//!
//! **What each member keeps is exactly what they could do** ([`carried_by`]): the old seven acts,
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
//! checked a ceiling, so nothing depends on what an old certificate could have signed. A standing
//! handover offer is withdrawn, `session_epoch` is kept so every remembered session survives, and
//! every unsigned table is left as it is.
//!
//! **Each certificate keeps the id format 1 gave it, `cert-<member>`, and the key it named**
//! (ticket 23). A machine still on the old build can sign a workspace, grant, invitation or mark
//! row after the upgrade, offline and pushed later, and that row names `cert-<member>`. Under the
//! same id and key its signature verifies against this chain, bounded by the ceiling the member
//! was given, so the row reads like any other rather than refusing the directory for everybody.
//! The alternative, leaving such rows out of every read, would have meant a store that skips a row
//! it cannot verify, which this format refuses on purpose.
//!
//! **The upgrade is a list of steps, in order, and each tolerates the shape it finds** (ticket
//! 23): the reshape runs only the statements the table still needs, every row is written by its
//! key so a second write is the same row, and the rows are judged under whichever format signed
//! them. So an upgrade cut short anywhere, on this machine or on the remote, is finished by the
//! owner's next sign-in, resume or connect from any machine, and nothing is run twice ([`planned`]
//! gives the order).
//! Format 1's certificate table goes last but the `format` row, so every row of that format can be
//! judged until then, and the role word and the mask a cut-short reshape dropped are found again
//! from the signature over them.

use std::collections::HashMap;

use crate::{
    diagnostics,
    error::{Error, RefusalReason},
};

use super::{
    HeldOrganization,
    authority::{
        AdministratorKey, Authority, Certificate, Chain, FormatOneCertificate, FormatOneMember,
        FormatOneRow, Issue, MemberAuthority, OrganizationKey, Reading, Revocation,
        VERIFYING_KEY_BYTES, issue_certificate, issue_root_certificate, verify_format_one,
        verify_succession,
    },
    permission::{self, Flag, MANAGER_ROLE, MEMBER_ROLE, OWNER_ROLE, RECORD_FLAGS},
    role::{authority_of, in_one_transaction},
    session::{
        CredentialSlot, content_key_of, opened, refused_by_name, remembered, verifying_key_of,
    },
    setup::{ADMINISTRATOR_KEY_PURPOSE, owner_key_from},
    store::{
        FormatOneDirectory, FormatOneMemberRow, FormatOneReshape, GrantRecord, InvitationRecord,
        MarkRecord, MemberRecord, OrganizationStore, RoleRecord, Signer, WorkspaceRecord,
        grant_authority, invitation_authority, mark_authority, waits_for_its_owner,
        workspace_authority,
    },
    vault::{MemberSecretKey, open_sealed_secret_key, open_vault, unseal_with_secret_key},
};

/// The role word format 1 wrote on a removed member's row.
const REMOVED: &str = "removed";

/// The role word format 1 wrote on an administrator's row.
const ADMINISTRATOR: &str = "administrator";

/// Every role word format 1 wrote, in the order one a cut-short reshape dropped is looked for.
const FORMAT_ONE_ROLES: [&str; 4] = [
    permission::MEMBER,
    ADMINISTRATOR,
    REMOVED,
    permission::OWNER,
];

/// The seven acts of format 1, one bit each, in the order they sat.
const FORMAT_ONE_ACTS: i64 = 0b111_1111;

/// The act format 1 called `changeRole`, which this format splits in two.
const FORMAT_ONE_CHANGE_ROLE: i64 = 1 << 2;

/// How the upgrade reaches the organization's remote: send what this machine holds, and bring
/// what the others wrote, each answering whether it went.
///
/// **A seam, because the upgrade's answer depends on the remote's.** Production hands in
/// [`ItsRemote`], the remote the replica was opened against, or `setup::Remote` on the connect;
/// a test hands in a remote that answers as it is told, since there is no remote here to reach.
pub(crate) trait Replication {
    /// Send what `store` holds to its remote; whether it went.
    async fn push(&self, store: &OrganizationStore) -> bool;
    /// Bring what the others wrote into `store`; whether a pull completed, whatever it brought.
    async fn pull(&self, store: &OrganizationStore) -> bool;
}

/// The remote the replica was opened against.
pub(crate) struct ItsRemote;

impl Replication for ItsRemote {
    /// The replica's own push.
    async fn push(&self, store: &OrganizationStore) -> bool {
        store.push().await
    }

    /// The replica's own pull, where it completed, whatever it brought; a pull that did not is
    /// logged and answered as not gone.
    async fn pull(&self, store: &OrganizationStore) -> bool {
        match store.pulled().await {
            Ok(_) => true,
            Err(refusal) => {
                diagnostics::info("organization.upgrade.notPulled")
                    .with("reason", refusal.to_string())
                    .write();

                false
            }
        }
    }
}

/// A vault a password or a remembered key opened, and the member row it sits on.
struct Opened {
    member_id: String,
    secret: MemberSecretKey,
}

/// Upgrade the organization `held` names where it is of an earlier format and `password` opens
/// its owner's vault under `username`, or follow the owner's upgrade where it opens anybody
/// else's: the sign-in at the wall.
///
/// Nothing happens to an organization of this format or a newer one, and the caller's refusal of
/// the format follows either way. A username and password that open no vault are the wall's one
/// sentence, as a sign-in on this format says it.
pub(crate) async fn with_password(
    store: &OrganizationStore,
    remote: &impl Replication,
    held: &HeldOrganization,
    username: &str,
    password: &str,
    credential: &CredentialSlot,
    now: i64,
) -> Result<(), Error> {
    if !store.is_older().await? {
        return Ok(());
    }

    let pinned = verifying_key_of(held)?;
    let opened = vault_opened_by(store, username, password)
        .await?
        .ok_or_else(|| refused_by_name(&held.name))?;

    upgrade(store, remote, &held.id, &pinned, &opened, credential, now).await
}

/// Upgrade the organization `held` names where it is of an earlier format and the key this machine
/// filed for the member it names opens the owner's vault, or follow the owner's upgrade where it
/// opens anybody else's: the launch resume, with no password.
///
/// Nothing happens to an organization of this format or a newer one. Otherwise, where the key
/// cannot be used, nothing is written and the resume is refused: with [`remembered`]'s refusal
/// where no key is filed or what is filed is not an entry this build wrote, with `SignInAgain`
/// where the key was filed before the member's sessions were ended from another machine, and as
/// waiting for its owner where the machine's record names no member, the member has no row, or
/// the key opens no vault. The resume then leaves the person at the wall, where their password
/// does what the key could not.
pub(crate) async fn with_remembered_key(
    store: &OrganizationStore,
    remote: &impl Replication,
    held: &HeldOrganization,
    credential: &CredentialSlot,
    now: i64,
) -> Result<(), Error> {
    if !store.is_older().await? {
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
    let opened = Opened {
        member_id: member.id,
        secret,
    };

    upgrade(store, remote, &held.id, &pinned, &opened, credential, now).await
}

/// Upgrade the organization a machine connecting on the owner's Turso account has just pulled,
/// where it is of an earlier format: `setup::connect_existing`, before the format is refused.
///
/// There is no pinned key yet on this path, so the key the password derives is judged against the
/// organization row's, which is the comparison that path makes of every owner
/// (`setup::the_owners_key`); the rows are then judged under it. `credential` already holds what
/// the consent minted. `refused` is the sentence that path gives a pair that opens nothing.
pub(crate) async fn with_the_owners_password(
    store: &OrganizationStore,
    remote: &impl Replication,
    username: &str,
    password: &str,
    credential: &CredentialSlot,
    now: i64,
    refused: impl Fn() -> Error,
) -> Result<(), Error> {
    if !store.is_older().await? {
        return Ok(());
    }

    let organization = store
        .organization()
        .await?
        .ok_or_else(|| Error::Integrity {
            message: "the database this turso account holds carries no organization of ours"
                .to_string(),
        })?;
    let opened = vault_opened_by(store, username, password)
        .await?
        .ok_or_else(refused)?;

    upgrade(
        store,
        remote,
        &organization.id,
        &organization.verifying_key,
        &opened,
        credential,
        now,
    )
    .await
}

/// The vault `password` opens under `username`, among the member rows of an older organization as
/// they lie.
///
/// **Every row is tried**, a removed one and one still waiting on its invitation link included:
/// which vault is the owner's is decided by the key it derives, never by a column beside it, so a
/// `must_change_password` somebody wrote onto the owner's row hides nothing. What anybody else's
/// vault opens is a member's wait for the owner, and past the upgrade the ordinary sign-in refuses
/// what it refuses.
async fn vault_opened_by(
    store: &OrganizationStore,
    username: &str,
    password: &str,
) -> Result<Option<Opened>, Error> {
    let wanted = username.trim().to_lowercase();

    for member in store.format_one_members().await? {
        let Ok(secret) = open_vault(password, &member.vault) else {
            continue;
        };
        let content_key = content_key_of(&member.sealed_content_key, &secret)?;
        let carried = opened(
            &content_key,
            "member.username_sealed",
            &member.username_sealed,
        )?;

        if carried.trim().to_lowercase() == wanted {
            return Ok(Some(Opened {
                member_id: member.id,
                secret,
            }));
        }
    }

    Ok(None)
}

/// Upgrade an older organization where `opened` is the owner's vault, or follow the owner's
/// upgrade where it is anybody else's: the member's own credential taken from their grant where
/// the machine holds none, then, for the owner alone, a push and a pull, the upgrade [`planned`]
/// and [`applied`] in one transaction, and a push of what it wrote.
async fn upgrade(
    store: &OrganizationStore,
    remote: &impl Replication,
    organization_id: &str,
    pinned: &[u8; VERIFYING_KEY_BYTES],
    opened: &Opened,
    credential: &CredentialSlot,
    now: i64,
) -> Result<(), Error> {
    let organization_key = owner_key_from(&opened.secret)?;
    let signing_key = signing_key_of(&opened.secret)?;
    // the key the organization is on now, followed from the pin along any handover this replica
    // holds, so a pin a format 1 handover left behind is settled before the owner is looked for.
    let key = settled(store, pinned).await?;
    let owner = organization_key.verifying_key() == key;

    // the member's own credential on the organization database, where the machine holds none
    // yet: their grant, judged under the rules of the format that signed it, and unsealed with the
    // secret that opened their vault. The owner's certificate is judged by its key alone.
    if credential
        .lock()
        .map_err(|_| poisoned())?
        .as_deref()
        .is_none()
    {
        let owners_signing_key = owner.then(|| signing_key.verifying_key());

        if let Some(token) =
            own_credential(store, organization_id, &key, opened, owners_signing_key).await?
        {
            *credential.lock().map_err(|_| poisoned())? = Some(token);
        }
    }

    if !owner {
        return follow_the_owner(store, remote).await;
    }

    // what the old build left captured goes first, since a row captured under the columns the
    // upgrade drops cannot share a push with the drop; then what the others wrote. Either not
    // going is a refusal, and nothing has been written.
    if !remote.push(store).await {
        return Err(needs_a_connection(
            organization_id,
            "what this machine holds could not be sent",
        ));
    }

    if !remote.pull(store).await {
        return Err(needs_a_connection(
            organization_id,
            "what the others wrote could not be brought",
        ));
    }

    // another machine of the owner's got there first, and what arrived is this format, or a
    // newer one, which the caller refuses.
    if !store.is_older().await? {
        return Ok(());
    }

    // what arrived can carry a handover, so the owner is looked for again under what it settles.
    if organization_key.verifying_key() != settled(store, pinned).await? {
        return Err(waits_for_its_owner());
    }

    let plan = planned(store, &organization_key, &signing_key, opened, now).await?;

    in_one_transaction(
        store,
        applied(store, &signing_key, plan.root.as_ref(), &plan.steps),
    )
    .await?;

    if !remote.push(store).await {
        diagnostics::warn("organization.upgrade.notYetSent")
            .with("organization", organization_id)
            .write();
    }

    diagnostics::info("organization.upgraded")
        .with("organization", organization_id)
        .write();

    Ok(())
}

/// A machine that is not the owner's, meeting an older organization: it pulls, with the
/// credential its own grant held, and goes on where what arrived is this format or a newer one,
/// which the caller then reads or refuses. Where the organization is still older, or the pull did
/// not go, it waits for its owner and nothing was written.
async fn follow_the_owner(
    store: &OrganizationStore,
    remote: &impl Replication,
) -> Result<(), Error> {
    if remote.pull(store).await && !store.is_older().await? {
        return Ok(());
    }

    Err(waits_for_its_owner())
}

/// The refusal of an owner whose upgrade could not reach the organization's latest state: nothing
/// was written, and the upgrade runs at their next sign-in, resume or connect that can reach it.
fn needs_a_connection(organization_id: &str, why: &str) -> Error {
    diagnostics::info("organization.upgrade.offline")
        .with("organization", organization_id)
        .with("reason", why)
        .write();

    Error::refused(
        RefusalReason::OrganizationUpgradeOffline,
        format!(
            "{why}, and the organization is upgraded only against its latest state. connect and \
             sign in again; nothing was changed"
        ),
    )
}

/// The key the organization is on now: the one `pinned`, followed along every completed
/// succession this replica holds that the key in hand signed, as `role::follow_succession` walks
/// them. A format 1 handover re-keyed the directory and left exactly such a row, so a machine
/// that pinned the key it replaced settles here on the key that replaced it.
///
/// **Each link is checked against the key the last one handed over**, so a row somebody wrote is
/// followed nowhere. Where the succession table is missing, the pin stands.
async fn settled(
    store: &OrganizationStore,
    pinned: &[u8; VERIFYING_KEY_BYTES],
) -> Result<[u8; VERIFYING_KEY_BYTES], Error> {
    if !store
        .tables()
        .await?
        .iter()
        .any(|table| table == "succession")
    {
        return Ok(*pinned);
    }

    let successions = store.successions().await?;
    let mut key = *pinned;

    // bounded by the number of rows there are, so a cycle somebody wrote is a walk that ends.
    for _ in 0..successions.len() {
        let next = successions.iter().find(|succession| {
            succession.old_verifying_key == key
                && succession.accepted_at.is_some()
                && verify_succession(&key, authority_of(succession), &succession.signature).is_ok()
        });

        match next.and_then(|succession| succession.new_verifying_key) {
            Some(new) => key = new,
            None => break,
        }
    }

    Ok(key)
}

/// What the grant of `opened`'s member on the organization database holds, where one verifies:
/// the credential their replica pulls with.
///
/// `owners_signing_key` is the owner's, where `opened` is the owner's vault: their certificate is
/// judged by its key alone, so an unsigned `revoked_at` on it revokes nothing.
async fn own_credential(
    store: &OrganizationStore,
    organization_id: &str,
    key: &[u8; VERIFYING_KEY_BYTES],
    opened: &Opened,
    owners_signing_key: Option<[u8; VERIFYING_KEY_BYTES]>,
) -> Result<Option<String>, Error> {
    let directory = store.format_one_directory().await?;
    let (certificates, revocations) = store.chain_rows_if_any().await?;
    let judge = Judge::new(
        key,
        &directory,
        owners_signing_key.as_ref(),
        &certificates,
        &revocations,
    );
    let Some(grant) = directory.grants.iter().find(|grant| {
        grant.record.member_id == opened.member_id && grant.record.workspace_id == organization_id
    }) else {
        return Ok(None);
    };

    if judge
        .row(
            &grant.certificate_id,
            grant_authority(&grant.record),
            &grant.signature,
        )
        .is_err()
    {
        return Ok(None);
    }

    String::from_utf8(unseal_with_secret_key(
        &opened.secret,
        &grant.record.sealed_credential,
    )?)
    .map(Some)
    .map_err(|_| Error::Integrity {
        message: "a sealed credential is not text".to_string(),
    })
}

/// The key the owner signs rows with, which their own secret derives and the root names.
fn signing_key_of(secret: &MemberSecretKey) -> Result<AdministratorKey, Error> {
    Ok(AdministratorKey::from_bytes(
        &secret.derive_seed(ADMINISTRATOR_KEY_PURPOSE)?,
    ))
}

/// The id format 1 gave a member's certificate, which the certificate this format issues them
/// keeps, so a row the old build signs under it after the upgrade still names a certificate that
/// exists (the module comment says why).
fn format_one_certificate_id(member_id: &str) -> String {
    format!("cert-{member_id}")
}

/// One write of the upgrade, in the order [`planned`] puts them.
#[derive(Clone, Debug)]
enum Step {
    /// one statement of the member table's reshape, which the table still needs.
    Reshape(FormatOneReshape),
    /// every table of this format, where it does not stand yet.
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
    /// the row that says the organization is of this format, last.
    Format,
}

/// What an upgrade writes: the steps, and the root they are signed under, where any is signed.
struct Plan {
    root: Option<Certificate>,
    steps: Vec<Step>,
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
/// 4. the owner's root certificate, and the two built-in role rows;
/// 5. for every member, their certificate where they are live and not the owner, and their row;
/// 6. a standing handover offer withdrawn;
/// 7. every workspace, grant and invitation, and the mark, signed again from the root;
/// 8. format 1's certificate table dropped, which nothing can judge a format 1 row without, so it
///    goes once there is none left;
/// 9. the `format` row, last: until it is written the organization reads as older everywhere.
///
/// An organization that carries nothing of format 1 any more had everything written but step 9,
/// and step 9 is all it is given.
async fn planned(
    store: &OrganizationStore,
    organization_key: &OrganizationKey,
    signing_key: &AdministratorKey,
    opened: &Opened,
    now: i64,
) -> Result<Plan, Error> {
    if !store.carries_format_one().await? {
        return Ok(Plan {
            root: None,
            steps: vec![Step::Format],
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
    let judge = Judge::new(
        &pinned,
        &directory,
        Some(&signing_key.verifying_key()),
        &certificates,
        &revocations,
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

    // the two built-in roles that are rows, as the first run writes them, before any member row
    // names one.
    for built_in in [MANAGER_ROLE, MEMBER_ROLE] {
        steps.push(Step::Role(RoleRecord {
            id: built_in.id.to_string(),
            kind: built_in.id.to_string(),
            name_sealed: Vec::new(),
            mask: built_in.mask,
            rank: built_in.rank,
        }));
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
            role_id: carried.role_id.to_string(),
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
    for succession in store.successions().await? {
        if succession.accepted_at.is_none() {
            steps.push(Step::WithdrawOffer(succession.id));
        }
    }

    steps.extend(judged.workspaces.into_iter().map(Step::Workspace));
    steps.extend(judged.grants.into_iter().map(Step::Grant));
    steps.extend(judged.invitations.into_iter().map(Step::Invitation));
    steps.extend(judged.mark.into_iter().map(Step::Mark));
    steps.push(Step::DropFormatOneCertificates);
    steps.push(Step::Format);

    Ok(Plan {
        root: Some(root),
        steps,
    })
}

/// Write `steps`, in order, the rows among them signed under `root` with `key`.
async fn applied(
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
            Step::Schema => store.install_schema().await?,
            Step::Drop(dropped) => match &dropped.row {
                Row::Member(id) => store.delete_format_one_member(id).await?,
                Row::Workspace(id) => store.delete_workspace(id).await?,
                Row::Grant {
                    member_id,
                    workspace_id,
                } => store.delete_grant(member_id, workspace_id).await?,
                Row::Invitation(id) => store.delete_invitation(id).await?,
                Row::Mark => store.clear_mark().await?,
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
            Step::Format => store.write_format().await?,
        }
    }

    Ok(())
}

/// What a member of format 1 carries into this one: the role they hold, their override, what they
/// end with, and whether they were removed.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct Carried {
    role_id: &'static str,
    override_mask: i64,
    /// what they end with, which is also the ceiling of the certificate they are issued.
    effective: i64,
    rank: i64,
    /// whether format 1 had removed them; the moment is the row's `updated_at`.
    removed: bool,
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
fn carried_by(role: &str, permissions: i64, owner: bool) -> Carried {
    if owner {
        return Carried {
            role_id: permission::OWNER,
            override_mask: 0,
            effective: OWNER_ROLE.mask,
            rank: OWNER_ROLE.rank,
            removed: false,
        };
    }

    if role == REMOVED {
        return Carried {
            role_id: MEMBER_ROLE.id,
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
        role_id: role.id,
        override_mask: permission::effective(role.mask, effective),
        effective,
        rank: role.rank,
        removed: false,
    }
}

/// What a member carries whose row an upgrade cut short already wrote in this format: the
/// built-in role it names, its override, and whether it was removed. `None` for any other role,
/// which no upgrade writes onto anybody but the owner.
fn carried_as_written(
    role_id: &str,
    override_mask: i64,
    removed_at: Option<i64>,
) -> Option<Carried> {
    let role = [MANAGER_ROLE, MEMBER_ROLE]
        .into_iter()
        .find(|role| role.id == role_id)?;
    let removed = removed_at.is_some();

    Some(Carried {
        role_id: role.id,
        override_mask,
        effective: if removed {
            0
        } else {
            permission::effective(role.mask, override_mask)
        },
        rank: role.rank,
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
struct Judge<'a> {
    pinned: &'a [u8; VERIFYING_KEY_BYTES],
    format_one: Vec<FormatOneCertificate>,
    chain: Chain<'a>,
}

impl<'a> Judge<'a> {
    /// A judge over `directory`'s format 1 certificates and this format's `certificates` and
    /// `revocations`, both rooted at `pinned`, with the two built-in roles that are rows.
    ///
    /// `owners_signing_key` is the owner's, where the caller holds it: a format 1 certificate
    /// naming it is judged by its key and signature alone, and the unsigned `revoked_at` on it is
    /// not read.
    fn new(
        pinned: &'a [u8; VERIFYING_KEY_BYTES],
        directory: &FormatOneDirectory,
        owners_signing_key: Option<&[u8; VERIFYING_KEY_BYTES]>,
        certificates: &'a [Certificate],
        revocations: &'a [Revocation],
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
        let built_in: HashMap<String, (i64, i64)> = [MANAGER_ROLE, MEMBER_ROLE]
            .into_iter()
            .map(|role| (role.id.to_string(), (role.mask, role.rank)))
            .collect();

        Self {
            pinned,
            format_one,
            chain: Chain::new(pinned, certificates, revocations).with_roles(built_in),
        }
    }

    /// The format 1 certificate issued under `id`, while their table stands.
    fn format_one_certificate(&self, id: &str) -> Option<&FormatOneCertificate> {
        self.format_one
            .iter()
            .find(|certificate| certificate.id == id)
    }

    /// Whether a workspace, grant, invitation or mark row is genuine, and why not where it is not.
    fn row(
        &self,
        certificate_id: &str,
        authority: Authority<'_>,
        signature: &[u8],
    ) -> Result<(), String> {
        let mut refusal = None;

        if let Some(certificate) = self.format_one_certificate(certificate_id) {
            match verify_format_one(
                self.pinned,
                certificate,
                FormatOneRow::Unchanged(authority),
                signature,
            ) {
                Ok(()) => return Ok(()),
                Err(error) => refusal = Some(error.to_string()),
            }
        }

        self.chain
            .verify(certificate_id, authority, signature)
            .map_err(|error| refusal.unwrap_or_else(|| error.to_string()))
    }

    /// Where a member stands, from a row that is genuine, and why not where it is not.
    ///
    /// A row still carrying format 1's signature is read under `member.v2`, with the role word and
    /// the mask the table still holds; where a reshape cut short dropped either, the one value its
    /// signature was made over is found by trying each value format 1 could have written, which
    /// are four words and a hundred and twenty-eight masks. A row an upgrade cut short already
    /// wrote in this format is read through the chain.
    fn member(&self, member: &FormatOneMemberRow) -> Result<Carried, String> {
        let mut refusal = None;

        if let Some(certificate) = self.format_one_certificate(&member.certificate_id) {
            let roles = match member.role.as_deref() {
                Some(role) => vec![role],
                None => FORMAT_ONE_ROLES.to_vec(),
            };
            let masks = match member.permissions {
                Some(permissions) => permissions..=permissions,
                None => 0..=FORMAT_ONE_ACTS,
            };

            for role in roles {
                for permissions in masks.clone() {
                    match verify_format_one(
                        self.pinned,
                        certificate,
                        FormatOneRow::Member(FormatOneMember {
                            public_key: &member.vault.public_key,
                            signing_public_key: &member.signing_public_key,
                            role,
                            permissions,
                            owner_seed_sealed: member.owner_seed_sealed.as_deref(),
                        }),
                        &member.signature,
                    ) {
                        Ok(()) => return Ok(carried_by(role, permissions, false)),
                        Err(error) => {
                            refusal.get_or_insert_with(|| error.to_string());
                        }
                    }
                }
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
                    if let Some(carried) =
                        carried_as_written(role_id, override_mask, member.removed_at)
                    {
                        return Ok(carried);
                    }

                    refusal.get_or_insert_with(|| {
                        "it names a role no upgrade gives a member".to_string()
                    });
                }
                Ok(Reading::Uncovered) => {
                    refusal.get_or_insert_with(|| "its certificate does not cover it".to_string());
                }
                Err(error) => {
                    refusal.get_or_insert_with(|| error.to_string());
                }
            }
        }

        Err(refusal
            .unwrap_or_else(|| "it names a certificate the organization never issued".to_string()))
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
struct Dropped {
    row: Row,
    reason: String,
}

/// Which row of an older organization, by its table and its key there.
#[derive(Clone, Debug, PartialEq, Eq)]
enum Row {
    Member(String),
    Workspace(String),
    Grant {
        member_id: String,
        workspace_id: String,
    },
    Invitation(String),
    /// the one mark row.
    Mark,
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
        }
    }

    /// The row's key, as the log names it: a grant's member and workspace joined by `/`.
    fn id(&self) -> String {
        match self {
            Self::Member(id) | Self::Workspace(id) | Self::Invitation(id) => id.clone(),
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
        dropped: Vec::new(),
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
            Err(reason) => judged.dropped.push(Dropped {
                row: Row::Member(member.id.clone()),
                reason,
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
            Err(reason) => judged.dropped.push(Dropped {
                row: Row::Workspace(record.id.clone()),
                reason,
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
            Err(reason) => judged.dropped.push(Dropped {
                row: Row::Grant {
                    member_id: record.member_id.clone(),
                    workspace_id: record.workspace_id.clone(),
                },
                reason,
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
            Err(reason) => judged.dropped.push(Dropped {
                row: Row::Invitation(record.id.clone()),
                reason,
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
            Err(reason) => judged.dropped.push(Dropped {
                row: Row::Mark,
                reason,
            }),
        }
    }

    judged
}

/// The error for a credential slot a panic left poisoned.
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
        FORMAT_ONE_ACTS, Opened, Replication, applied, carried_by, planned, signing_key_of,
        with_password, with_remembered_key, with_the_owners_password,
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
            role::{follow_succession, in_one_transaction},
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
    /// mina's own grant on the organization database: a credential of her own, so a test can tell
    /// which grant a machine pulled with.
    const MINAS_CREDENTIAL: &str = "minas-organization-credential";

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

    /// The cheapest vault cost Argon2id takes, so a test seals in milliseconds.
    fn test_cost() -> KdfParams {
        KdfParams {
            memory_kib: 1024,
            iterations: 2,
            lanes: 1,
        }
    }

    /// A directory of this test's own under the system's temporary directory.
    fn scratch(name: &str) -> PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|elapsed| elapsed.as_nanos())
            .unwrap_or_default();
        let directory = std::env::temp_dir().join(format!("rentable-upgrade-{name}-{nanos:x}"));
        std::fs::create_dir_all(&directory).expect("scratch directory");

        directory
    }

    /// A credential slot holding nothing yet.
    fn slot() -> CredentialSlot {
        Arc::new(Mutex::new(None))
    }

    /// A remote that answers every push and every pull as it is told, and says which were asked
    /// for, in order.
    struct Answering {
        push: bool,
        pull: bool,
        asked: Mutex<Vec<&'static str>>,
    }

    impl Answering {
        /// A remote answering every push with `push` and every pull with `pull`.
        fn new(push: bool, pull: bool) -> Self {
            Self {
                push,
                pull,
                asked: Mutex::new(Vec::new()),
            }
        }

        /// Which of push and pull were asked for, in order.
        fn asked(&self) -> Vec<&'static str> {
            self.asked.lock().expect("the record").clone()
        }
    }

    impl Replication for Answering {
        /// Records the push and answers as told.
        async fn push(&self, _: &OrganizationStore) -> bool {
            self.asked.lock().expect("the record").push("push");
            self.push
        }

        /// Records the pull and answers as told.
        async fn pull(&self, _: &OrganizationStore) -> bool {
            self.asked.lock().expect("the record").push("pull");
            self.pull
        }
    }

    /// A machine online: every push and pull goes.
    fn online() -> Answering {
        Answering::new(true, true)
    }

    /// A remote a member's machine pulls from, which says what credential the pull was made with,
    /// and where `owner_upgraded` is set, brings the owner's upgrade with it: what arrives is the
    /// owner's sign-in on another machine, run here on the same database, which is what the two
    /// replicas are to each other once a push and a pull have run between them.
    struct MemberPull<'a> {
        older: &'a Older,
        slot: CredentialSlot,
        owner_upgraded: bool,
        pulled_with: Mutex<Vec<Option<String>>>,
    }

    impl Replication for MemberPull<'_> {
        /// A member's machine never pushes to an older organization, so a push fails the test.
        async fn push(&self, _: &OrganizationStore) -> bool {
            panic!("a member's machine pushed to an older organization")
        }

        /// Records the credential the pull was made with, runs the owner's upgrade where it is set
        /// to, and answers as gone.
        async fn pull(&self, store: &OrganizationStore) -> bool {
            self.pulled_with
                .lock()
                .expect("the record")
                .push(self.slot.lock().expect("the slot").clone());

            if self.owner_upgraded {
                let owner = self.older.person("owner");

                with_password(
                    store,
                    &online(),
                    &self.older.held,
                    owner.username,
                    owner.password,
                    &slot(),
                    NOW,
                )
                .await
                .expect("the owner's upgrade on the other machine");
            }

            true
        }
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
        /// A person of the fixture, with a vault sealed under the password their id gives them.
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
        certificates: HashMap<&'static str, FormatOneCertificate>,
    }

    impl Older {
        /// The person of the fixture with this id.
        fn person(&self, id: &str) -> &Person {
            self.people.get(id).expect("a person of the fixture")
        }

        /// The format 1 certificate the fixture issued this person.
        fn certificate(&self, id: &str) -> &FormatOneCertificate {
            self.certificates
                .get(id)
                .expect("a certificate of the fixture")
        }

        /// The organization key a machine of this organization pinned.
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

        /// The organization's replica on this machine, with no remote.
        async fn open(&self) -> OrganizationStore {
            OrganizationStore::open(&self.path, None, || async {
                Ok::<String, turso::Error>(String::new())
            })
            .await
            .expect("the replica")
        }

        /// What the owner's vault opens, as the sign-in hands it to the upgrade.
        fn owners_vault(&self) -> Opened {
            Opened {
                member_id: "owner".to_string(),
                secret: owner_secret(self),
            }
        }
    }

    /// The secret the owner's password opens their vault to.
    fn owner_secret(older: &Older) -> MemberSecretKey {
        let owner = older.person("owner");

        crate::organization::vault::open_vault(owner.password, &owner.vault)
            .expect("the owner's vault")
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

    /// Run one statement on the replica, as the old build or somebody around the store would.
    async fn run(store: &OrganizationStore, sql: &str, values: Vec<turso::Value>) {
        store
            .connection()
            .execute(sql, values)
            .await
            .unwrap_or_else(|error| panic!("{sql}: {error}"));
    }

    /// A text value for a statement.
    fn text(value: &str) -> turso::Value {
        turso::Value::Text(value.to_string())
    }

    /// A blob value for a statement.
    fn bytes(value: &[u8]) -> turso::Value {
        turso::Value::Blob(value.to_vec())
    }

    /// Write a format 1 certificate row as the old build wrote it.
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

    /// A grant row as format 1 signs it, under `certificate` by `signer`, or with its signature
    /// broken where it is `forged`: what the fixture writes, and what a machine still on the old
    /// build writes after the upgrade.
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
            "INSERT OR REPLACE INTO \"grant\" \
             (\"member_id\", \"workspace_id\", \"sealed_credential\", \"access_level\", \
              \"credential_expires_at\", \"certificate_id\", \"signature\") \
             VALUES (?, ?, ?, ?, ?, ?, ?)",
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

    /// A workspace row as format 1 signs it.
    async fn write_workspace(
        store: &OrganizationStore,
        content_key: &ContentKey,
        id: &str,
        workspace: WorkspaceAuthority<'_>,
        signer: &AdministratorKey,
        certificate: &FormatOneCertificate,
    ) {
        run(
            store,
            "INSERT OR REPLACE INTO \"workspace\" \
             (\"id\", \"name_sealed\", \"database_name\", \"database_hostname\", \
              \"schema_version\", \"certificate_id\", \"signature\", \"created_at\", \
              \"updated_at\") \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            vec![
                text(id),
                bytes(
                    &seal_content(content_key, "workspace.name_sealed", id.as_bytes())
                        .expect("the name"),
                ),
                text(workspace.database_name),
                text(workspace.database_hostname),
                turso::Value::Integer(9),
                text(&certificate.id),
                bytes(&sign_format_one(
                    signer,
                    certificate,
                    FormatOneRow::Unchanged(Authority::Workspace(workspace)),
                )),
                turso::Value::Integer(EARLIER),
                turso::Value::Integer(EARLIER),
            ],
        )
        .await;
    }

    /// An invitation row as format 1 signs it.
    async fn write_invitation(
        store: &OrganizationStore,
        id: &str,
        member_id: &str,
        issued_by: &Person,
        certificate: &FormatOneCertificate,
    ) {
        let pending_until = NOW + 7 * 24 * 60 * 60 * 1000;

        run(
            store,
            "INSERT OR REPLACE INTO \"invitation\" \
             (\"id\", \"member_id\", \"expires_at\", \"consumed_at\", \"sealed_secret\", \
              \"issued_by\", \"certificate_id\", \"signature\", \"created_at\") \
             VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?)",
            vec![
                text(id),
                text(member_id),
                turso::Value::Integer(pending_until),
                bytes(b"the issuer's sealed copy"),
                text(issued_by.id),
                text(&certificate.id),
                bytes(&sign_format_one(
                    &issued_by.signing,
                    certificate,
                    FormatOneRow::Unchanged(Authority::Invitation(InvitationAuthority {
                        id,
                        member_id,
                        expires_at: pending_until,
                    })),
                )),
                turso::Value::Integer(EARLIER),
            ],
        )
        .await;
    }

    /// The mark as format 1 signs it.
    async fn write_mark(
        store: &OrganizationStore,
        content_key: &ContentKey,
        image: &[u8],
        set_by: &Person,
        certificate: &FormatOneCertificate,
        updated_at: i64,
    ) {
        let image = seal_content(content_key, "mark.image_sealed", image).expect("the mark");

        run(
            store,
            "INSERT OR REPLACE INTO \"mark\" \
             (\"id\", \"image_sealed\", \"media_type\", \"updated_by\", \"updated_at\", \
              \"certificate_id\", \"signature\") \
             VALUES ('mark', ?, 'image/png', ?, ?, ?, ?)",
            vec![
                bytes(&image),
                text(set_by.id),
                turso::Value::Integer(updated_at),
                text(&certificate.id),
                bytes(&sign_format_one(
                    &set_by.signing,
                    certificate,
                    FormatOneRow::Unchanged(Authority::Mark(MarkAuthority {
                        image_sealed: &image,
                        media_type: "image/png",
                        updated_by: set_by.id,
                        updated_at,
                    })),
                )),
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

        write_workspace(
            &store,
            &content_key,
            "north",
            WorkspaceAuthority {
                database_name: "ws-north",
                database_hostname: "ws-north-an-org.aws-eu-west-1.turso.io",
            },
            &owner.signing,
            &owners,
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
            MINAS_CREDENTIAL,
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

        write_invitation(&store, "invitation-pia", "pia", adam, &adams).await;
        write_mark(&store, &content_key, b"a seal", adam, &adams, EARLIER).await;

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
        let certificates = [
            ("owner", owners),
            ("adam", adams),
            ("lena", lenas),
            ("rafi", rafis),
        ]
        .into_iter()
        .collect();

        Older {
            directory,
            path,
            held,
            organization_key,
            content_key,
            people,
            certificates,
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

    /// The reason a result was refused for, where it was refused.
    fn reason_of<T>(result: &Result<T, Error>) -> Option<RefusalReason> {
        match result {
            Err(Error::Refused { reason, .. }) => Some(*reason),
            _ => None,
        }
    }

    /// The mask of these flags.
    fn mask(flags: &[Flag]) -> i64 {
        permission::mask_of(flags)
    }

    /// Every record flag, delete included: what the old build let every member do.
    fn records() -> i64 {
        mask(&permission::RECORD_FLAGS)
    }

    /// What each member of the fixture ends with, as the plan's *Migration* maps them.
    fn expected_effective(id: &str) -> i64 {
        match id {
            "owner" => OWNER_ROLE.mask,
            "adam" => {
                mask(&[
                    Flag::InviteMember,
                    Flag::RemoveMember,
                    Flag::AssignRole,
                    Flag::OverrideMember,
                    Flag::RenameMember,
                    Flag::ManageMark,
                    Flag::ManageRoles,
                ]) | records()
            }
            "lena" => mask(&[Flag::RenameWorkspace, Flag::GrantWorkspace]) | records(),
            "mina" | "pia" => records(),
            _ => 0,
        }
    }

    /// Everything a finished upgrade of the fixture leaves, read as this format reads it, here and
    /// on another machine holding no key but the pinned one: format 2 and nothing of format 1;
    /// every member where they could stand before; one live certificate each, under the id format
    /// 1 gave it; and every workspace, grant, invitation and the mark verified.
    async fn assert_upgraded(store: &OrganizationStore, older: &Older, pinned: &[u8; 32]) {
        assert_eq!(
            store.format().await.expect("the format"),
            Some(FORMAT_VERSION)
        );
        assert!(!store.is_older().await.expect("the format"));
        assert!(
            !store
                .carries_format_one()
                .await
                .expect("what is left of format 1")
        );

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

        let roles = store.roles(pinned).await.expect("the roles");

        assert_eq!(
            roles
                .iter()
                .map(|role| (role.id.as_str(), role.mask, role.rank))
                .collect::<Vec<_>>(),
            vec![
                ("manager", MANAGER_ROLE.mask, MANAGER_ROLE.rank),
                ("member", MEMBER_ROLE.mask, MEMBER_ROLE.rank),
            ]
        );

        let members = store.members(pinned).await.expect("the members");
        let mut standing = members
            .iter()
            .map(|member| {
                (
                    member.id.as_str(),
                    member.role_id.as_str(),
                    member.effective,
                    member.removed_at,
                )
            })
            .collect::<Vec<_>>();

        standing.sort();

        assert_eq!(
            standing,
            vec![
                ("adam", "manager", expected_effective("adam"), None),
                ("lena", "manager", expected_effective("lena"), None),
                ("mina", "member", expected_effective("mina"), None),
                ("owner", "owner", expected_effective("owner"), None),
                ("pia", "member", expected_effective("pia"), None),
                ("rafi", "member", 0, Some(EARLIER + 10)),
            ]
        );
        assert!(members.iter().all(|member| member.covered));
        assert!(
            members
                .iter()
                .all(|member| member.owner_seed_sealed.is_none())
        );

        for member in &members {
            if member.id != "mallory" {
                assert_eq!(
                    member.session_epoch,
                    older.person(&member.id).session_epoch,
                    "{}",
                    member.id
                );
            }
        }

        let (certificates, revocations) = store.chain_rows().await.expect("the chain");
        let chain = Chain::new(pinned, &certificates, &revocations);
        let mut ids = certificates
            .iter()
            .map(|certificate| certificate.id.as_str())
            .collect::<Vec<_>>();

        ids.sort_unstable();

        assert_eq!(
            ids,
            vec![
                "cert-adam",
                "cert-lena",
                "cert-mina",
                "cert-owner",
                "cert-pia"
            ]
        );

        for certificate in &certificates {
            chain
                .live(&certificate.id)
                .unwrap_or_else(|error| panic!("{} does not verify: {error}", certificate.id));
        }

        let grants = store.grants(pinned).await.expect("the grants");

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
        assert_eq!(
            store
                .workspaces(pinned)
                .await
                .expect("the workspaces")
                .iter()
                .map(|workspace| workspace.id.as_str())
                .collect::<Vec<_>>(),
            vec!["north"]
        );
        assert_eq!(
            store
                .invitations(pinned)
                .await
                .expect("the invitations")
                .iter()
                .map(|invitation| (invitation.id.as_str(), invitation.member_id.as_str()))
                .collect::<Vec<_>>(),
            vec![("invitation-pia", "pia")]
        );

        let mark = store.mark(pinned).await.expect("the mark").expect("a mark");

        assert_eq!(
            open_content(&older.content_key, "mark.image_sealed", &mark.image_sealed)
                .expect("the image"),
            b"a seal"
        );
        assert!(
            store
                .successions()
                .await
                .expect("the successions")
                .iter()
                .all(|succession| succession.accepted_at.is_some()),
            "a standing offer was not withdrawn"
        );
    }

    /// The mapping itself, one case per kind of member format 1 had: exactly what each could do,
    /// every record act included, as a role and an override.
    #[test]
    fn each_member_of_format_one_keeps_exactly_what_they_could_do() {
        let owner = carried_by("owner", FORMAT_ONE_ACTS, true);

        assert_eq!(
            (owner.role_id, owner.override_mask, owner.effective),
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

        // an administrator with every act is a manager with nothing switched.
        let whole = carried_by("administrator", FORMAT_ONE_ACTS, false);

        assert_eq!(whole.effective, MANAGER_ROLE.mask);
        assert_eq!(whole.override_mask, 0);

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
            (removed.role_id, removed.override_mask, removed.removed),
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

    /// **Ticket 22's second, third and ninth criteria.** The owner signs in on this build with
    /// their password, online: the organization reads as format 2, with the three built-in roles,
    /// no `administrator_certificate`, and every member standing where they could stand before;
    /// the credential the owner's grant held is in the slot; what did not verify is gone; the
    /// standing offer is withdrawn; and every session epoch is the one the row carried. The push
    /// of what the old build captured came first, then the pull, then the push of the upgrade.
    #[tokio::test]
    async fn the_owners_sign_in_upgrades_the_organization_and_everybody_keeps_what_they_could_do() {
        let older = older("sign-in").await;
        let store = older.open().await;
        let owner = older.person("owner");
        let credential = slot();
        let remote = online();

        assert!(store.is_older().await.expect("the format"));

        with_password(
            &store,
            &remote,
            &older.held,
            owner.username,
            owner.password,
            &credential,
            NOW,
        )
        .await
        .expect("the owner's sign-in did not upgrade the organization");

        assert_eq!(remote.asked(), vec!["push", "pull", "push"]);

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

        let columns = store.columns_of("member").await.expect("the columns");

        assert!(
            !columns
                .iter()
                .any(|column| column == "role" || column == "permissions")
        );

        assert_upgraded(&store, &older, &older.pinned()).await;

        let members = store.members(&older.pinned()).await.expect("the members");
        let row = |id: &str| {
            members
                .iter()
                .find(|member| member.id == id)
                .unwrap_or_else(|| panic!("{id} was not carried"))
        };

        assert!(row("pia").must_change_password);
        assert!(!members.iter().any(|member| member.id == "mallory"));
        assert!(
            store
                .live_certificates(&older.pinned(), "rafi")
                .await
                .expect("the certificates")
                .is_empty()
        );

        // every live member's certificate is issued from the root, its ceiling what they end
        // with and its key the one their row carries.
        let (certificates, revocations) = store.chain_rows().await.expect("the chain");
        let pinned = older.pinned();
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
            &online(),
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
        let (_, before_the_format) = plan.steps.split_last().expect("a step");
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
    /// statement of the reshape twice.
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

        for written in 1..steps {
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
                .filter(|step| matches!(step, super::Step::Reshape(_)))
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
                    .filter(|step| matches!(step, super::Step::Reshape(_)))
                    .count(),
                "{written}: a statement of the reshape would run twice"
            );

            let owner = older.person("owner");

            with_password(
                &store,
                &online(),
                &older.held,
                owner.username,
                owner.password,
                &slot(),
                NOW + 60_000,
            )
            .await
            .unwrap_or_else(|error| panic!("{written}: the owner did not finish it: {error}"));

            assert_upgraded(&store, &older, &older.pinned()).await;

            drop(store);

            let elsewhere = another_machine(&older.directory).await;

            assert_upgraded(&elsewhere, &older, &older.pinned()).await;
        }
    }

    /// **Ticket 23's fourth criterion.** Two of the owner's machines, one after the other on one
    /// database: the first upgrades, and the second, whose pull brought that, finds the upgrade
    /// done and writes nothing, the first's schema change above all.
    #[tokio::test]
    async fn a_second_owner_machine_finds_the_upgrade_done_and_replays_nothing() {
        let _turn = take_the_credential_store().await;
        let older = older("two-owners").await;
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
        .expect("the first machine's upgrade");

        let upgraded = contents(&store).await;
        let second = online();

        with_password(
            &store,
            &second,
            &older.held,
            owner.username,
            owner.password,
            &slot(),
            NOW + 60_000,
        )
        .await
        .expect("the second machine's sign-in");

        remember(
            ORGANIZATION_ID,
            "owner",
            owner.session_epoch,
            &owner.member_key,
        );
        with_remembered_key(&store, &second, &older.held, &slot(), NOW + 60_000)
            .await
            .expect("the second machine's resume");

        assert!(second.asked().is_empty(), "{:?}", second.asked());
        assert_eq!(
            contents(&store).await,
            upgraded,
            "the second machine wrote to an upgraded organization"
        );
        assert_upgraded(&store, &older, &older.pinned()).await;
    }

    /// **Ticket 23's first criterion.** The owner's upgrade runs only once what the machine holds
    /// has been pushed and a pull has completed. Offline, with the push refused, or with the pull
    /// refused, nothing is written, the organization is still older, and the owner is told the
    /// upgrade needs a connection; a pull is not tried after a push that failed.
    #[tokio::test]
    async fn offline_or_with_the_push_or_the_pull_failing_nothing_is_written() {
        let _turn = take_the_credential_store().await;
        let older = older("offline").await;
        let store = older.open().await;
        let owner = older.person("owner");
        let before = contents(&store).await;

        remember(
            ORGANIZATION_ID,
            "owner",
            owner.session_epoch,
            &owner.member_key,
        );

        for (case, push, pull, asked) in [
            ("offline", false, false, vec!["push"]),
            ("the push refused", false, true, vec!["push"]),
            ("the pull refused", true, false, vec!["push", "pull"]),
        ] {
            let remote = Answering::new(push, pull);
            let refused = with_password(
                &store,
                &remote,
                &older.held,
                owner.username,
                owner.password,
                &slot(),
                NOW,
            )
            .await;

            assert_eq!(
                reason_of(&refused),
                Some(RefusalReason::OrganizationUpgradeOffline),
                "{case}: {refused:?}"
            );
            assert!(
                refused
                    .expect_err("refused")
                    .to_string()
                    .contains("nothing was changed"),
                "{case}"
            );
            assert_eq!(remote.asked(), asked, "{case}");

            let remote = Answering::new(push, pull);
            let refused = with_remembered_key(&store, &remote, &older.held, &slot(), NOW).await;

            assert_eq!(
                reason_of(&refused),
                Some(RefusalReason::OrganizationUpgradeOffline),
                "{case}, the resume: {refused:?}"
            );
            assert_eq!(
                contents(&store).await,
                before,
                "{case}: something was written"
            );
            assert!(store.is_older().await.expect("the format"), "{case}");
        }
    }

    /// **Ticket 23's second criterion.** A member's machine holding a format 1 replica pulls
    /// before it answers, with the credential the member's own format 1 grant holds. While what
    /// arrives is still format 1, the sign-in and the resume wait for the owner and write nothing;
    /// once the owner has upgraded on their own machine and the pull brings it, both go through.
    #[tokio::test]
    async fn a_member_pulls_first_and_follows_the_owner_once_the_owner_has_upgraded() {
        let _turn = take_the_credential_store().await;
        let older = older("member-pulls").await;
        let store = older.open().await;
        let mina = older.person("mina");
        let before = contents(&store).await;

        remember(
            ORGANIZATION_ID,
            "mina",
            mina.session_epoch,
            &mina.member_key,
        );

        // the owner has not upgraded: the pull brings format 1 again.
        let credential = slot();
        let remote = MemberPull {
            older: &older,
            slot: Arc::clone(&credential),
            owner_upgraded: false,
            pulled_with: Mutex::new(Vec::new()),
        };
        let refused = with_password(
            &store,
            &remote,
            &older.held_by("mina"),
            mina.username,
            mina.password,
            &credential,
            NOW,
        )
        .await;

        assert_eq!(
            reason_of(&refused),
            Some(RefusalReason::OrganizationOlder),
            "{refused:?}"
        );
        assert_eq!(
            *remote.pulled_with.lock().expect("the record"),
            vec![Some(MINAS_CREDENTIAL.to_string())],
            "the member did not pull with their own grant"
        );

        let credential = slot();
        let remote = MemberPull {
            older: &older,
            slot: Arc::clone(&credential),
            owner_upgraded: false,
            pulled_with: Mutex::new(Vec::new()),
        };
        let refused =
            with_remembered_key(&store, &remote, &older.held_by("mina"), &credential, NOW).await;

        assert_eq!(
            reason_of(&refused),
            Some(RefusalReason::OrganizationOlder),
            "the resume: {refused:?}"
        );
        assert_eq!(
            *remote.pulled_with.lock().expect("the record"),
            vec![Some(MINAS_CREDENTIAL.to_string())]
        );
        assert_eq!(contents(&store).await, before, "a member wrote");

        // the owner has upgraded on their machine: the resume's pull brings it, and the resume
        // goes through into the ordinary one.
        let credential = slot();
        let remote = MemberPull {
            older: &older,
            slot: Arc::clone(&credential),
            owner_upgraded: true,
            pulled_with: Mutex::new(Vec::new()),
        };

        with_remembered_key(&store, &remote, &older.held_by("mina"), &credential, NOW)
            .await
            .expect("the member's resume did not follow the owner's upgrade");
        store
            .refuse_another_format()
            .await
            .expect("the member's machine still read the organization as older");

        match resume(&store, &older.held_by("mina"), &credential).await {
            Ok(Resumption::Opened(session)) => assert_eq!(session.role, "member"),
            other => panic!("mina did not resume after the owner's upgrade: {other:?}"),
        }

        // and the sign-in, on a machine whose replica is behind in the same way: here the rows
        // are already this format, so it only has to be let through.
        let credential = slot();
        let remote = MemberPull {
            older: &older,
            slot: Arc::clone(&credential),
            owner_upgraded: false,
            pulled_with: Mutex::new(Vec::new()),
        };

        with_password(
            &store,
            &remote,
            &older.held_by("mina"),
            mina.username,
            mina.password,
            &credential,
            NOW,
        )
        .await
        .expect("the member's sign-in was held after the owner's upgrade");

        let session = sign_in_by_username(
            &store,
            &older.held_by("mina"),
            mina.username,
            mina.password,
            &credential,
        )
        .await
        .expect("mina did not sign in after the owner's upgrade");

        assert_eq!(session.role, "member");
    }

    /// **Ticket 23's second criterion, the sign-in's pull.** The same as the resume above, with
    /// the password: the member's pull brings the owner's upgrade, and the sign-in goes through.
    #[tokio::test]
    async fn a_members_sign_in_follows_an_upgrade_its_pull_brings() {
        let older = older("member-sign-in-pulls").await;
        let store = older.open().await;
        let mina = older.person("mina");
        let credential = slot();
        let remote = MemberPull {
            older: &older,
            slot: Arc::clone(&credential),
            owner_upgraded: true,
            pulled_with: Mutex::new(Vec::new()),
        };

        with_password(
            &store,
            &remote,
            &older.held_by("mina"),
            mina.username,
            mina.password,
            &credential,
            NOW,
        )
        .await
        .expect("the member's sign-in did not follow the owner's upgrade");

        assert_eq!(
            *remote.pulled_with.lock().expect("the record"),
            vec![Some(MINAS_CREDENTIAL.to_string())]
        );

        let session = sign_in_by_username(
            &store,
            &older.held_by("mina"),
            mina.username,
            mina.password,
            &credential,
        )
        .await
        .expect("mina did not sign in after the owner's upgrade");

        assert_eq!(session.role, "member");
    }

    /// **Ticket 23's fifth criterion.** A machine still on the old build signs a workspace, a
    /// grant, an invitation and the mark after the upgrade, the way format 1 signs them, under
    /// the certificate id format 1 gave each signer; the owner's old build signs a read-only
    /// grant. None of it makes the directory unreadable: another machine reads every one of them
    /// verified, since each certificate the upgrade issued kept that id and that key.
    #[tokio::test]
    async fn a_row_an_old_build_signs_after_the_upgrade_is_read_verified() {
        let older = older("old-build").await;
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

        let lena = older.person("lena");
        let adam = older.person("adam");

        // lena's old build: a workspace renamed into place and north granted to pia.
        write_workspace(
            &store,
            &older.content_key,
            "south",
            WorkspaceAuthority {
                database_name: "ws-south",
                database_hostname: "ws-south-an-org.aws-eu-west-1.turso.io",
            },
            &lena.signing,
            older.certificate("lena"),
        )
        .await;
        write_grant(
            &store,
            older.person("pia"),
            "north",
            "north-full",
            "full-access",
            &lena.signing,
            older.certificate("lena"),
            false,
        )
        .await;
        // adam's old build: an invitation and a new mark.
        write_invitation(
            &store,
            "invitation-mina",
            "mina",
            adam,
            older.certificate("adam"),
        )
        .await;
        write_mark(
            &store,
            &older.content_key,
            b"a new seal",
            adam,
            older.certificate("adam"),
            NOW + 5,
        )
        .await;
        // the owner's old build: a read-only grant, which only the root signs.
        write_grant(
            &store,
            lena,
            "south",
            "south-read",
            "read-only",
            &owner.signing,
            older.certificate("owner"),
            false,
        )
        .await;

        drop(store);

        let elsewhere = another_machine(&older.directory).await;
        let pinned = older.pinned();
        let grants = elsewhere
            .grants(&pinned)
            .await
            .expect("an old build's grant made the grants unreadable");

        assert!(
            grants
                .iter()
                .any(|grant| grant.member_id == "pia" && grant.workspace_id == "north")
        );
        assert!(grants.iter().any(|grant| grant.member_id == "lena"
            && grant.workspace_id == "south"
            && grant.access_level == "read-only"));
        assert!(
            elsewhere
                .workspaces(&pinned)
                .await
                .expect("an old build's workspace made the workspaces unreadable")
                .iter()
                .any(|workspace| workspace.id == "south")
        );
        assert!(
            elsewhere
                .invitations(&pinned)
                .await
                .expect("an old build's invitation made the invitations unreadable")
                .iter()
                .any(|invitation| invitation.id == "invitation-mina")
        );

        let mark = elsewhere
            .mark(&pinned)
            .await
            .expect("an old build's mark made the mark unreadable")
            .expect("a mark");

        assert_eq!(
            open_content(&older.content_key, "mark.image_sealed", &mark.image_sealed)
                .expect("the image"),
            b"a new seal"
        );
        elsewhere
            .members(&pinned)
            .await
            .expect("the members were unreadable");
    }

    /// **Ticket 23's sixth criterion, the certificate.** An unsigned `revoked_at` somebody wrote
    /// onto the owner's format 1 certificate is not read: the owner's sign-in upgrades the
    /// organization, their credential is found under it, and every row it signed is carried.
    #[tokio::test]
    async fn an_unsigned_revocation_of_the_owners_certificate_is_ignored() {
        let older = older("owner-revoked").await;
        let store = older.open().await;
        let owner = older.person("owner");

        run(
            &store,
            "UPDATE \"administrator_certificate\" SET \"revoked_at\" = '1' WHERE \"id\" = 'cert-owner'",
            Vec::new(),
        )
        .await;

        let credential = slot();

        with_password(
            &store,
            &online(),
            &older.held,
            owner.username,
            owner.password,
            &credential,
            NOW,
        )
        .await
        .expect("a revocation nobody signed stopped the owner's upgrade");

        assert_eq!(
            credential.lock().expect("the slot").as_deref(),
            Some(ORGANIZATION_CREDENTIAL)
        );
        assert_upgraded(&store, &older, &older.pinned()).await;
    }

    /// **Ticket 23's sixth criterion, the column.** `must_change_password` written onto the
    /// owner's row neither hides their vault nor stops the upgrade, and it is not carried onto
    /// them: they sign in on this format afterwards.
    #[tokio::test]
    async fn must_change_password_on_the_owners_row_hides_nothing() {
        let older = older("owner-must-change").await;
        let store = older.open().await;
        let owner = older.person("owner");

        run(
            &store,
            "UPDATE \"member\" SET \"must_change_password\" = 1 WHERE \"id\" = 'owner'",
            Vec::new(),
        )
        .await;

        let credential = slot();

        with_password(
            &store,
            &online(),
            &older.held,
            owner.username,
            owner.password,
            &credential,
            NOW,
        )
        .await
        .expect("the column stopped the owner's upgrade");

        assert_upgraded(&store, &older, &older.pinned()).await;

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
    }

    /// **Ticket 23's sixth criterion, the pin.** The organization was handed over in format 1:
    /// the directory is on the new owner's key, and a completed succession signed by the old key
    /// says so. A machine that pinned the old key has the new owner sign in: the pin is settled
    /// along the succession before the owner is looked for, the organization is upgraded, and the
    /// ordinary walk afterwards pins the new key and signs the owner in.
    #[tokio::test]
    async fn a_pin_a_format_one_handover_left_stale_is_settled_before_the_owner_is_looked_for() {
        let older = older("stale-pin").await;
        let store = older.open().await;
        let owner = older.person("owner");
        let founders = OrganizationKey::generate().expect("the key before the handover");
        let completed = SuccessionAuthority {
            id: "handover",
            offered_member_id: "owner",
            offered_by: "adam",
            offered_at: EARLIER - 10,
            old_verifying_key: &founders.verifying_key(),
            new_verifying_key: Some(&older.pinned()),
            accepted_at: Some(EARLIER - 5),
        };

        store
            .write_succession(&SuccessionRecord {
                id: "handover".to_string(),
                offered_member_id: "owner".to_string(),
                offered_by: "adam".to_string(),
                offered_at: EARLIER - 10,
                old_verifying_key: founders.verifying_key(),
                new_verifying_key: Some(older.pinned()),
                accepted_at: Some(EARLIER - 5),
                signature: sign_succession(&founders, completed),
            })
            .await
            .expect("the handover");

        let stale = HeldOrganization {
            verifying_key: BASE64URL.encode(founders.verifying_key()),
            ..older.held.clone()
        };

        with_password(
            &store,
            &online(),
            &stale,
            owner.username,
            owner.password,
            &slot(),
            NOW,
        )
        .await
        .expect("a stale pin stopped the owner's upgrade");

        assert_eq!(
            store.format().await.expect("the format"),
            Some(FORMAT_VERSION)
        );

        let mut machine = Persisted::<RemoteSyncStore>::load(older.directory.join("m.json"))
            .expect("the machine");

        machine.organization = Some(stale);

        assert_eq!(
            follow_succession(&store, &mut machine)
                .await
                .expect("the walk"),
            Some(older.pinned())
        );

        let held = machine.organization.clone().expect("the record");
        let session = sign_in_by_username(&store, &held, owner.username, owner.password, &slot())
            .await
            .expect("the owner did not sign in after the upgrade");

        assert_eq!(session.role, "owner");
    }

    /// **Ticket 22's sixth criterion.** Opened first by anybody but its owner, at a sign-in, a
    /// resume or a connect, the organization is refused as waiting for its owner and nothing is
    /// written to it, the members' pulls having brought nothing newer. A pair that opens no vault
    /// is the wall's one sentence, as any sign-in's.
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
                &online(),
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
            &online(),
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

        let refused =
            with_remembered_key(&store, &online(), &older.held_by("mina"), &slot(), NOW).await;

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
        assert!(store.is_older().await.expect("the format"));
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

        with_remembered_key(&store, &online(), &older.held, &credential, NOW)
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
    /// account with the owner's password, and reaching the remote, upgrades the organization it
    /// pulled the same way, and ends holding it with the owner signed in; another member's
    /// password there waits for the owner, and the machine holds nothing. So does the owner's,
    /// with the remote out of reach.
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
            Remote::answering(),
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

        // the owner's, offline.
        let offline = older("connect-offline").await;
        let mcp = ScriptedServer::start(holding_the_organization()).await;
        let mut machine = Persisted::<RemoteSyncStore>::load(offline.directory.join("second.json"))
            .expect("the machine");
        let owner = offline.person("owner");
        let refused = connect_existing(
            &mut machine,
            "a-platform-token",
            &McpEndpoint::at(&mcp.url("")),
            |_| Arc::clone(&platform),
            Remote::none(),
            &offline.directory.join("app.db"),
            owner.username,
            owner.password,
            NOW,
        )
        .await
        .map(|_| ());

        assert_eq!(
            reason_of(&refused),
            Some(RefusalReason::OrganizationUpgradeOffline),
            "{refused:?}"
        );
        assert!(machine.organization.is_none());

        // and the owner's, online.
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
            Remote::answering(),
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
            &online(),
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
        let remote = online();

        with_password(
            &store,
            &remote,
            &older.held,
            owner.username,
            owner.password,
            &slot(),
            NOW,
        )
        .await
        .expect("a newer organization was treated as an older one");
        with_the_owners_password(
            &store,
            &remote,
            owner.username,
            owner.password,
            &slot(),
            NOW,
            || Error::Internal {
                message: "a newer organization was treated as an older one".to_string(),
            },
        )
        .await
        .expect("a newer organization was treated as an older one");

        assert!(remote.asked().is_empty());

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
