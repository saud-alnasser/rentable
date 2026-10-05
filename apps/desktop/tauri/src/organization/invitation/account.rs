//! an account made, built again and reset: the row, its vault, its grants and its certificate,
//! written in one act by somebody above it.

use crate::{
    diagnostics,
    error::{Error, RefusalReason},
    turso::platform::{AccessLevel, TursoPlatform},
};

use super::{
    MemberFacts, UnreachableWorkspace, WorkspaceGrant, held_credential, members, opened, random_id,
    refuse_taken_username, validate_username,
};
use crate::organization::{
    authority::AdministratorKey,
    member::vault::{KdfParams, create_vault_with_secret, seal_content, seal_to_public_key},
    role::{
        Standing,
        permission::{self, Flag},
        reissue,
    },
    session::{Actor, MemberSession, actor, rank_of, refuse_unsettled},
    setup::{ADMINISTRATOR_KEY_PURPOSE, credential_expiry},
    store::{GrantRecord, MemberLockRecord, MemberRecord, OrganizationStore, Signer},
    workspace::{WORKSPACE_CREDENTIAL_LIFETIME, signer_of},
};

/// The alphabet a generated password is spelled in: lowercase and digits with the four that read
/// alike removed, `0`, `o`, `1` and `l`, so what is read out over a phone is what is typed.
const PASSWORD_ALPHABET: &[u8] = b"abcdefghijkmnpqrstuvwxyz23456789";
const PASSWORD_GROUPS: usize = 4;
const PASSWORD_GROUP_LENGTH: usize = 5;

/// Make an account: the row somebody will open, and no link (effort 828, requirements 19 and 20).
///
/// This is what inviting was, up to the link. The vault is sealed under a password nobody is ever
/// shown and nothing stores, `must_change_password` is set, the certificate is issued from the
/// actor's own, and the grants are sealed to the fresh vault. **No invitation row and no link**: an
/// account holds no password until its first link is opened, and [`make_link`](super::make_link) is what draws the
/// password the person opening it replaces.
///
/// **The account is made in one role with one override** (effort 838, requirement 5), and
/// requirement 7 bounds both before anything is written: the role ranks strictly below the actor's,
/// neither it nor the override names a flag the actor does not hold, and the override names none of
/// the owner's. An override that switches a flag off is still that flag changed, so it is held to
/// the same line as one that switches it on.
///
/// `platform` is the owner's machine's authority, which a read-only grant is minted with and
/// nothing else here needs; `kdf_params` is what the member's vault is sealed at. What comes back
/// is the account as the members list draws it.
#[allow(clippy::too_many_arguments)]
pub async fn create_account<P: TursoPlatform>(
    store: &OrganizationStore,
    session: &MemberSession,
    platform: Option<&P>,
    username: &str,
    role_id: &str,
    override_mask: i64,
    workspaces: &[WorkspaceGrant],
    kdf_params: KdfParams,
    now: i64,
) -> Result<MemberFacts, Error> {
    session.settled()?;

    let actor = actor(store, session).await?;

    permission::require(actor.row.effective, Flag::InviteMember)?;
    require_directory_grant(&actor)?;

    // an override is `set_override`'s to give, so an account made with one asks the same flag
    // (requirement 6); the role is the invitation's own, bounded by rank below.
    if override_mask != 0 {
        permission::require(actor.row.effective, Flag::OverrideMember)?;
    }

    let username = username.trim();

    validate_username(username)?;

    let (role_mask, standing) = standing_for(store, session, role_id, override_mask).await?;

    actor.outranks(
        standing.rank,
        "that role is not below yours, so an account is made in it by somebody who ranks above it",
    )?;

    if let Some(flag) = permission::first_owner_only(override_mask) {
        return Err(Error::refused(
            RefusalReason::OwnerOnly,
            format!("{flag} is the owner's alone, and no role or override carries it"),
        ));
    }

    if let Some(flag) = permission::first_not_held(actor.row.effective, role_mask | override_mask) {
        return Err(Error::refused(
            RefusalReason::RoleLacksAct,
            format!("you do not hold {flag}, so you cannot give it or take it away"),
        ));
    }

    // what the account ends up with adds, edits or deletes no kind of record it cannot view
    // (requirement 6, as amended 2026-09-27).
    permission::refuse_write_without_view(standing.effective, "the account this makes")?;

    refuse_taken_username(store, session, username, None).await?;

    let member_id = random_id()?;

    write_account(
        store, session, &actor, platform, &member_id, username, standing, workspaces, kdf_params,
        now,
    )
    .await?;

    if !store.push().await {
        diagnostics::warn("organization.member.notYetSent")
            .with("member", member_id.as_str())
            .write();
    }

    diagnostics::info("organization.member.created")
        .with("member", member_id.as_str())
        .with("role", role_id)
        .write();

    members(store, session)
        .await?
        .into_iter()
        .find(|member| member.id == member_id)
        .ok_or_else(|| Error::Integrity {
            message: "the new account's row did not read back".to_string(),
        })
}

/// Unset an account's password: a fresh vault under a fresh drawn password, everything the
/// resetter can reach re-sealed to it, and `must_change_password` set, so the next link asks the
/// person to choose one (effort 828, requirement 20).
///
/// **This is what a reset is** (826, requirement 13): no escrow copy of the old vault exists, so
/// what restores a member's access is building them a new one from what the resetter already
/// holds, and a workspace the resetter cannot reach is one the member waits on somebody who can.
/// What comes back names those, so the member knows whom to wait on.
///
/// **It hands over nothing.** A link is [`make_link`](super::make_link)'s, made from the account's card afterwards;
/// until one is, the account has no way in, which is exactly what a fresh account has.
///
/// **It is not the owner's alone** (effort 838). What it needs is `resetPassword`, a rank above the
/// member's role, and a certificate to issue the member's fresh one from, which every member who
/// holds the flag has; no organization key is derived.
pub async fn unset_password<P: TursoPlatform>(
    store: &OrganizationStore,
    session: &MemberSession,
    platform: Option<&P>,
    member_id: &str,
    kdf_params: KdfParams,
    now: i64,
) -> Result<Vec<UnreachableWorkspace>, Error> {
    session.settled()?;

    let actor = actor(store, session).await?;

    permission::require(actor.row.effective, Flag::ResetPassword)?;

    let members = store.members(&session.verifying_key).await?;
    let member = writable_account(
        &members,
        member_id,
        "an owner's password is not unset. their vault is theirs alone",
    )?
    .clone();

    actor.outranks(
        rank_of(store, session, &member).await?,
        "that member's role is not below yours, so their password is reset by somebody who ranks \
         above them",
    )?;

    // the drawn password is let go of here on purpose: nothing stores it, and the link made
    // afterwards draws its own.
    let (_, unreachable_workspaces) =
        reseal_account(store, session, &actor, platform, &member, kdf_params, now).await?;

    if !store.push().await {
        diagnostics::warn("organization.member.passwordUnsetNotYetSent")
            .with("member", member_id)
            .write();
    }

    diagnostics::info("organization.member.passwordUnset")
        .with("member", member_id)
        .write();

    Ok(unreachable_workspaces)
}

/// The account an act on somebody else's row is allowed to touch: in this organization, not the
/// owner's, and not one that was removed. `owner_refusal` is what an act on the owner's row is
/// told, because each of them has its own reason.
pub(in crate::organization) fn writable_account<'a>(
    members: &'a [MemberRecord],
    member_id: &str,
    owner_refusal: &str,
) -> Result<&'a MemberRecord, Error> {
    let member = members
        .iter()
        .find(|member| member.id == member_id)
        .ok_or_else(|| {
            Error::refused(
                RefusalReason::MemberMissing,
                "that member is not in this organization",
            )
        })?;

    if member.role_id == permission::OWNER {
        return Err(Error::refused(RefusalReason::OwnerProtected, owner_refusal));
    }

    // a reset and a link write the row back as it reads, which on a row its certificate no
    // longer covers is somebody else's content made authority (effort 838). Before the removal
    // check, so a removal a forger re-signed says what is to be done about it.
    refuse_unsettled(member)?;

    if member.removed_at.is_some() {
        return Err(Error::refused(
            RefusalReason::MemberRemoved,
            "that member was removed. make them an account again if they are to come back",
        ));
    }

    Ok(member)
}

/// Build the account's vault again, under a freshly drawn password: what a reset and an
/// invitation-kind link both begin with. The row keeps its id, its username, its role and its
/// override; what moves is the vault, everything sealed to it, and the certificate.
///
/// What comes back is the password it drew and the workspaces it could not carry over. The
/// password is the caller's to seal into a link or to let go of, and it is written nowhere: a
/// reset lets it go, so an account whose password was unset has no way in until a link is made.
pub(super) async fn reseal_account<P: TursoPlatform>(
    store: &OrganizationStore,
    session: &MemberSession,
    actor: &Actor,
    platform: Option<&P>,
    member: &MemberRecord,
    kdf_params: KdfParams,
    now: i64,
) -> Result<(String, Vec<UnreachableWorkspace>), Error> {
    // before the first grant, invitation or link below goes: the account is written again with
    // its directory grant, which only `grantWorkspace` signs, and its row and certificate from the
    // actor's, which carry nothing the actor does not (`write_account` asks it again).
    require_directory_grant(actor)?;

    // the role and the override the row already carries, read against the role's verified row.
    let (_, standing) = standing_for(store, session, &member.role_id, member.override_mask).await?;

    if let Some(flag) = permission::first_not_held(actor.row.effective, standing.effective) {
        return Err(Error::refused(
            RefusalReason::RoleLacksAct,
            format!(
                "that account holds {flag}, and you do not, so its certificate cannot be issued \
                 from yours"
            ),
        ));
    }

    let member_id = member.id.as_str();
    let username = opened(session, "member.username_sealed", &member.username_sealed)?;

    // what the member held, split by what the resetter can seal again: a full-access grant on a
    // workspace they hold full access to themselves is re-sealed to the fresh vault, a read-only
    // grant is minted again where they are the owner with the authority in hand, and the rest are
    // removed, because a grant sealed to a vault that is gone is a sign-in that fails, and named
    // in the answer so the member knows whom to wait on.
    let mut kept = Vec::new();
    let mut unreachable_workspaces = Vec::new();
    let workspaces = store.workspaces(&session.verifying_key).await?;

    for grant in store
        .grants(&session.verifying_key)
        .await?
        .into_iter()
        .filter(|grant| {
            grant.member_id == member_id && grant.workspace_id != session.organization_id
        })
    {
        let access = AccessLevel::parse(&grant.access_level).unwrap_or(AccessLevel::FullAccess);
        let reachable = match access {
            AccessLevel::FullAccess => session
                .workspace_credentials
                .get(&grant.workspace_id)
                .is_some_and(|held| held.access == AccessLevel::FullAccess),
            AccessLevel::ReadOnly => actor.row.role_id == permission::OWNER && platform.is_some(),
        };

        if reachable {
            kept.push(WorkspaceGrant {
                id: grant.workspace_id,
                access,
            });
        } else {
            let name = match workspaces
                .iter()
                .find(|workspace| workspace.id == grant.workspace_id)
            {
                Some(workspace) => {
                    opened(session, "workspace.name_sealed", &workspace.name_sealed)?
                }
                None => grant.workspace_id.clone(),
            };

            store.delete_grant(member_id, &grant.workspace_id).await?;
            unreachable_workspaces.push(UnreachableWorkspace {
                id: grant.workspace_id,
                name,
            });
        }
    }

    // any invitation still open for them goes: one open invitation per member. A consumed one
    // stays, as the record that this member opened a link once, which is what tells a revoke of
    // a fresh link apart from a revoke of a person who never arrived.
    for stale in store
        .invitations(&session.verifying_key)
        .await?
        .into_iter()
        .filter(|invitation| invitation.member_id == member_id && invitation.consumed_at.is_none())
    {
        store.delete_invitation(&stale.id).await?;
    }

    // and every unspent machine link, for the same reason: the vault this re-seal replaces is the
    // one the account's old password opened, and a machine link made before it still carries a
    // live credential and a row nothing has spent. One way in stands at a time, and the link made
    // after this is it.
    store.delete_open_machine_links_of(member_id).await?;

    let password = write_account(
        store, session, actor, platform, member_id, &username, standing, &kept, kdf_params, now,
    )
    .await?;

    Ok((password, unreachable_workspaces))
}

/// Draw a generated password. Twenty characters, four groups of five, from bytes the operating
/// system drew; nothing about the person enters it.
pub fn generate_password() -> Result<String, Error> {
    let mut bytes = [0_u8; PASSWORD_GROUPS * PASSWORD_GROUP_LENGTH];

    getrandom::fill(&mut bytes).map_err(|error| Error::Internal {
        message: format!("failed to draw a password: {error}"),
    })?;

    let letters: Vec<char> = bytes
        .iter()
        .map(|byte| PASSWORD_ALPHABET[(*byte as usize) % PASSWORD_ALPHABET.len()] as char)
        .collect();

    Ok(letters
        .chunks(PASSWORD_GROUP_LENGTH)
        .map(|group| group.iter().collect::<String>())
        .collect::<Vec<_>>()
        .join("-"))
}

/// The standing a role and an override give a member (effort 838): the role's mask and rank off
/// its verified row, or the owner's constants, and the effective permissions the two compute. The
/// role's mask comes back beside it, for the check that bounds what an actor may give. Refused by
/// name for a role this organization does not hold.
async fn standing_for<'a>(
    store: &OrganizationStore,
    session: &MemberSession,
    role_id: &'a str,
    override_mask: i64,
) -> Result<(i64, Standing<'a>), Error> {
    let (mask, rank) = store.role_standing(&session.verifying_key, role_id).await?;

    Ok((
        mask,
        Standing {
            role_id,
            override_mask,
            effective: permission::effective(mask, override_mask),
            rank,
        },
    ))
}

/// Refuse, naming `grantWorkspace`, an actor who could not sign an account's directory grant: its
/// grant on the organization database, which making an account and building one again always
/// write under the actor's certificate, whatever workspaces the account is given (effort 838, the
/// row-kind table). *It was asked only where the account was given a workspace until the review of
/// effort 838 found an account made without it writing a grant every reader refused, and the
/// grants read by nobody from then on.*
fn require_directory_grant(actor: &Actor) -> Result<(), Error> {
    permission::require(actor.row.effective, Flag::GrantWorkspace)
}

/// What making an account and resetting one both write: the vault, the row, the certificate, and
/// the grants. The role and the override are written as `standing` carries them, so a reset keeps
/// a member exactly as they stood (826, requirement 6).
///
/// **Every account holds a certificate, issued from the actor's** (effort 838): its ceiling is the
/// member's effective permissions and its rank their role's, so a member widened into a signing
/// flag later signs under one already issued, and nobody derives the organization key to make it.
/// What the actor's own certificate could not issue is refused by name before a row is written.
///
/// What comes back is the password the vault was drawn under. Nothing stores it: a fresh account
/// lets it go, and an invitation-kind link seals it into its own text.
#[allow(clippy::too_many_arguments)]
async fn write_account<P: TursoPlatform>(
    store: &OrganizationStore,
    session: &MemberSession,
    actor: &Actor,
    platform: Option<&P>,
    member_id: &str,
    username: &str,
    standing: Standing<'_>,
    workspaces: &[WorkspaceGrant],
    kdf_params: KdfParams,
    now: i64,
) -> Result<String, Error> {
    // every account is written with its directory grant, so this is asked whatever workspaces the
    // account is given. The callers ask it first, before anything of theirs is written; asked
    // here too so that no caller reaches a grant without it.
    require_directory_grant(actor)?;

    // the certificate is issued down from the actor's, so it carries nothing the actor does not:
    // a member who holds a flag the actor lacks is refused by name here, rather than by the issue
    // as a certificate that would reach wider than its issuer.
    if let Some(flag) = permission::first_not_held(actor.row.effective, standing.effective) {
        return Err(Error::refused(
            RefusalReason::RoleLacksAct,
            format!(
                "that account holds {flag}, and you do not, so its certificate cannot be issued \
                 from yours"
            ),
        ));
    }

    let (key, certificate) = signer_of(store, session).await?;
    let signer = Signer {
        key: &key,
        certificate: &certificate,
    };

    // a read-only grant is minted, and minting is the owner's machine's: refused by name before
    // anything is written, so an invitation never quietly grants less than it was asked to. The
    // owner is who the verified row says, and never the session's snapshot of it.
    if workspaces
        .iter()
        .any(|workspace| workspace.access == AccessLevel::ReadOnly)
    {
        actor.require_owner(
            permission::Flag::MintReadOnly,
            RefusalReason::OwnerMachineOnly,
            "a read-only grant is minted on the owner's machine. ask the owner, or invite with \
             full access",
        )?;

        if platform.is_none() {
            return Err(Error::refused(
                RefusalReason::OwnerMachineOnly,
                "a read-only grant is minted with the turso authority, which this \
                          machine does not hold. connect the account again, or invite with full \
                          access",
            ));
        }
    }

    // the workspaces: full access is what the inviter reaches, re-sealed, and one they do not is
    // refused by name rather than skipped, so an invitation never quietly grants less than it was
    // asked to; read-only is minted, on the owner's machine, as `workspace::grant_workspace` mints
    // one. Every credential is in hand before the certificate, the row or any grant is written, so
    // a refusal here leaves no half-made account holding the username.
    let known = store.workspaces(&session.verifying_key).await?;
    let mut credentials = Vec::with_capacity(workspaces.len());

    for workspace in workspaces {
        let credential = match workspace.access {
            AccessLevel::FullAccess => session
                .workspace_credentials
                .get(&workspace.id)
                .filter(|held| held.access == AccessLevel::FullAccess)
                .map(|held| held.token.clone())
                .ok_or_else(|| {
                    Error::refused(
                        RefusalReason::GrantBeyondOwn,
                        "you can invite into a workspace you hold full access to yourself, \
                              and no other",
                    )
                })?,
            AccessLevel::ReadOnly => {
                let database = known
                    .iter()
                    .find(|known| known.id == workspace.id)
                    .map(|known| known.database_name.clone())
                    .ok_or_else(|| {
                        Error::refused(
                            RefusalReason::WorkspaceMissing,
                            "that workspace is not in this organization",
                        )
                    })?;
                let platform = platform.ok_or_else(|| {
                    Error::refused(
                        RefusalReason::OwnerMachineOnly,
                        "a read-only grant is minted on the owner's machine. ask the owner",
                    )
                })?;

                platform
                    .mint_token(
                        &database,
                        WORKSPACE_CREDENTIAL_LIFETIME,
                        AccessLevel::ReadOnly,
                    )
                    .await?
            }
        };

        credentials.push((workspace, credential));
    }

    // the member's vault, under a password nobody is ever shown and nothing stores. An account
    // holds it and no other until its first link is opened, and that link carries this password in
    // its sealed payload, where opening it replaces it with one the person chose (effort 828,
    // requirements 1 and 20).
    let generated_password = generate_password()?;
    let (vault, secret) = create_vault_with_secret(&generated_password, kdf_params)?;

    // the key this member will sign rows with, derived from the secret just drawn: the one moment
    // the secret is in hand, and the key their certificate names.
    let signing_key = AdministratorKey::from_bytes(&secret.derive_seed(ADMINISTRATOR_KEY_PURPOSE)?);

    // the certificate follows, issued from the actor's own, before the row (effort 838). A reset
    // draws a fresh vault secret, so `signing_key` differs from the one this member's old
    // certificate names: the old one has the rows it signed re-signed under the resetter, who
    // holds authority over them, and is then revoked, so the replacement bricks nothing. A row the
    // resetter could not sign refuses the reset by name with nothing written (`role::reissue`). A
    // fresh account has no certificate to retire.
    reissue(
        store,
        session,
        &signer,
        member_id,
        Some((&signing_key.verifying_key(), standing)),
        now,
    )
    .await?;

    // which run of this member's sessions is current, off the row rather than assumed. A fresh
    // invitation has no row to read and starts at the first.
    let session_epoch = store
        .members(&session.verifying_key)
        .await?
        .iter()
        .find(|member| member.id == member_id)
        .map_or(0, |member| member.session_epoch);

    store
        .write_member(
            &signer,
            &MemberRecord {
                id: member_id.to_string(),
                username_sealed: seal_content(
                    &session.content_key,
                    "member.username_sealed",
                    username.as_bytes(),
                )?,
                sealed_content_key: seal_to_public_key(
                    &vault.public_key,
                    &session.content_key.to_bytes(),
                )?,
                vault: vault.clone(),
                signing_public_key: signing_key.verifying_key(),
                role_id: standing.role_id.to_string(),
                override_mask: standing.override_mask,
                removed_at: None,
                effective: standing.effective,
                covered: true,
                must_change_password: true,
                created_at: now,
                updated_at: now,
                // a fresh invitation has no row and starts at the first epoch. A reset keeps the
                // member's id and rewrites their row, so what it carries is what the row already
                // held: the number only ever moves forward (`session/`), and a reset that put
                // it back to zero would hand every keyring entry filed under an earlier one its
                // first gate again.
                session_epoch,
                // an account is made and reset with no organization seed on it. A transfer is the
                // one write that puts one there (effort 828, requirement 22).
                owner_seed_sealed: None,
            },
        )
        .await?;

    // and locked, from its creation and again at a reset, until somebody above it unlocks it once
    // its person has chosen a password (effort 851, requirements 31 and 37): a reset hands the
    // account to whoever holds the next link. After the row, which the lock is judged by. Written
    // whoever the actor is, since a lock the actor cannot sign reads locked all the same
    // (`store::write_member_lock`).
    store
        .write_member_lock(
            &signer,
            &MemberLockRecord {
                member_id: member_id.to_string(),
                locked: true,
                updated_at: now,
            },
        )
        .await?;

    // the directory: the inviter's own credential on the organization database, re-sealed. It is
    // also what the link seals, so the person opening it can read the rows before any vault of
    // theirs is open.
    let organization_credential = held_credential(session)?;

    store
        .write_grant(
            &signer,
            &GrantRecord {
                member_id: member_id.to_string(),
                workspace_id: session.organization_id.clone(),
                sealed_credential: seal_to_public_key(
                    &vault.public_key,
                    organization_credential.as_bytes(),
                )?,
                access_level: AccessLevel::FullAccess.as_str().to_string(),
                credential_expires_at: credential_expiry(&organization_credential),
            },
        )
        .await?;

    // the workspaces, each credential resolved before anything was written (above), sealed now.
    for (workspace, credential) in &credentials {
        store
            .write_grant(
                &signer,
                &GrantRecord {
                    member_id: member_id.to_string(),
                    workspace_id: workspace.id.clone(),
                    sealed_credential: seal_to_public_key(
                        &vault.public_key,
                        credential.as_bytes(),
                    )?,
                    access_level: workspace.access.as_str().to_string(),
                    credential_expires_at: credential_expiry(credential),
                },
            )
            .await?;
    }

    // the drawn password, handed back rather than written anywhere: the caller either seals it
    // into an invitation-kind link's payload or lets it go, and nothing on the row or in the
    // database holds it.
    Ok(generated_password)
}

#[cfg(test)]
mod tests {
    use crate::credential::{CredentialStore, Memory};
    use crate::error::{Error, RefusalReason};
    use crate::machine::RemoteSyncStore;
    use crate::organization::HeldOrganization;
    use crate::organization::invitation::link::{HalfKind, JoinLink, Locator, open_payload};
    use crate::organization::invitation::{
        AccountAndLink, Invitation, TEST_LIFETIME_MS, WorkspaceGrant, create_account,
        generate_password, locator, make_account_and_link, make_link, reset_account,
        unset_password,
    };
    use crate::organization::member::vault::KdfParams;
    use crate::organization::role::permission;
    use crate::organization::session::{
        CredentialSlot, MemberSession, sign_in, sign_in_by_username,
    };
    use crate::organization::setup::{CreateOrganization, Remote, create_organization};
    use crate::organization::store::{OrganizationStore, Signer};
    use crate::organization::workspace::create_workspace;
    use crate::organization::workspace::remote::Pipeline;
    use crate::persisted::Persisted;
    use crate::sync::test::server::{ScriptedResponse, ScriptedServer};
    use crate::test::scratch;
    use crate::turso::discovery::McpEndpoint;
    use crate::turso::platform::{AccessLevel, InMemoryPlatform};
    use serde_json::json;
    use std::sync::{Arc, Mutex};

    const PASSWORD: &str = "the owners password";

    /// The password somebody chooses when they open the first link made for their account, and
    /// the one that admits them at the wall from then on.
    const CHOSEN: &str = "a password sami chose";

    /// When the members list is read, where a test reads one. The standing of a pending
    /// invitation is the one thing on that list that turns on the clock.
    const NOW: i64 = 1_757_000_000_000;

    fn test_cost() -> KdfParams {
        KdfParams {
            memory_kib: 1024,
            iterations: 2,
            lanes: 1,
        }
    }

    fn slot() -> CredentialSlot {
        Arc::new(Mutex::new(None))
    }

    /// No platform authority in hand, which is every session here but the owner's with one.
    fn no_platform() -> Option<&'static InMemoryPlatform> {
        None
    }

    /// Full access on each workspace named, which is what every invitation here grants.
    fn full(ids: &[String]) -> Vec<WorkspaceGrant> {
        ids.iter()
            .map(|id| WorkspaceGrant {
                id: id.clone(),
                access: AccessLevel::FullAccess,
            })
            .collect()
    }

    /// The password an invitation's vault was sealed under: the link's own secret and the code
    /// together open the payload the link carries, which is what the person opening the link does
    /// (effort 828, requirement 1). *It was the link's secret alone until effort 826 made the code
    /// the other half, and it read the row's `code_seal` until effort 828 moved the seal into the
    /// link's text.*
    fn secret_of(invited: &AccountAndLink) -> String {
        crate::organization::invitation::vault_password_of(
            &invited.join_link,
            &invited.code,
            test_cost(),
        )
    }

    /// The machine's record of a member who joined, as the join ticket will write one.
    fn joined_as(owner: &MemberSession, member_id: &str, role: &str) -> HeldOrganization {
        HeldOrganization {
            id: owner.organization_id.clone(),
            name: "Acme".to_string(),
            verifying_key: base64::Engine::encode(
                &base64::engine::general_purpose::URL_SAFE_NO_PAD,
                owner.verifying_key,
            ),
            remote_url: String::new(),
            machine_id: "machine-one".to_string(),
            member_id: Some(member_id.to_string()),
            role: Some(role.to_string()),
            joined_at: 0,
            format: None,
            machine_signed_out: 0,
            turso_organization: None,
            workspace_id: None,
            name_signed: false,
            lock_marked: false,
            own_lock_latched: None,
        }
    }

    /// An organization with its owner signed in and one workspace, on a fake account.
    async fn owned(
        credentials: &dyn CredentialStore,
        directory: &std::path::Path,
    ) -> (
        OrganizationStore,
        MemberSession,
        Locator,
        String,
        Arc<InMemoryPlatform>,
    ) {
        let mut store = Persisted::<RemoteSyncStore>::load(directory.join("remote-sync.json"))
            .expect("the store");
        let mcp = ScriptedServer::start(vec![
            ScriptedResponse::new(
                200,
                json!({ "jsonrpc": "2.0", "id": 1, "result": {} }).to_string(),
            ),
            ScriptedResponse::new(
                200,
                json!({
                    "jsonrpc": "2.0",
                    "id": 3,
                    "result": { "content": [{ "type": "text", "text": json!([{
                        "Name": "ledger",
                        "hostname": "ledger-an-org.aws-eu-west-1.turso.io",
                        "group": "rentable"
                    }]).to_string() }] }
                })
                .to_string(),
            ),
        ])
        .await;
        let platform = Arc::new(InMemoryPlatform::new("an-org"));

        let (created, organization) = create_organization(
            credentials,
            &crate::clock::System::shared(),
            &mut store,
            "a-platform-token",
            &McpEndpoint::at(&mcp.url("")),
            |_| Arc::clone(&platform),
            Remote::none(),
            &directory.join("app.db"),
            CreateOrganization {
                name: "Acme",
                username: "olivia",
                password: PASSWORD,
                group: None,
            },
            test_cost(),
            1_757_000_000_000,
        )
        .await
        .expect("the first run failed");
        let joined = store.selected().cloned().expect("the record");
        let mut owner = sign_in(&organization, &joined, PASSWORD, &slot())
            .await
            .expect("the owner did not sign in");
        let pipeline = crate::sync::test::pipeline::LocalPipeline::start().await;
        let workspace = create_workspace(
            &organization,
            &mut owner,
            &platform,
            |_| Pipeline::at(&pipeline.url("")),
            "North",
            1_757_000_000_000,
        )
        .await
        .expect("the workspace");
        let link = locator(&organization, &owner)
            .await
            .expect("the organization's locator");

        assert_eq!(link.organization_id, created.organization_id);

        (organization, owner, link, workspace.id, platform)
    }

    /// A machine's record with nothing on it, which is what a new machine is.
    fn fresh_machine(directory: &std::path::Path) -> Persisted<RemoteSyncStore> {
        let machine = Persisted::<RemoteSyncStore>::load(directory.join("remote-sync.json"))
            .expect("the store");

        assert!(machine.selected().is_none(), "the machine has prior state");

        machine
    }

    /// One account opened on a machine of its own: the owner makes its link, the person opens it
    /// and chooses a password, and what comes back is their session and their machine's id.
    async fn opened_as(
        credentials: &dyn CredentialStore,
        store: &OrganizationStore,
        owner: &MemberSession,
        link: &Locator,
        member_id: &str,
        name: &str,
        now: i64,
    ) -> (MemberSession, String) {
        let made = make_link(
            store,
            owner,
            no_platform(),
            link,
            member_id,
            crate::organization::invitation::TEST_LIFETIME_HOURS,
            test_cost(),
            now,
        )
        .await
        .expect("the link could not be made");
        let directory = scratch(&format!("opened-{name}"));
        let mut machine = fresh_machine(&directory);
        let (_, session) = crate::organization::invitation::join::accept(
            credentials,
            |_| async { Ok::<_, Error>(store) },
            &mut machine,
            &directory.join("app.db"),
            &JoinLink::decode(&made.link).expect("the link"),
            &made.code,
            CHOSEN,
            test_cost(),
            now + 1,
        )
        .await
        .expect("the account could not be opened");
        // every account starts locked (effort 851), and the acts these tests are about are an
        // unlocked member's: unlocked by whoever made the link, where they may.
        let _ =
            crate::organization::member::lock::unlocked_for_a_test(store, owner, member_id).await;
        let machine_id = machine.selected().expect("the record").machine_id.clone();

        (session, machine_id)
    }

    /// An account made by `maker` in `role_id` with `override_mask`, into no workspace.
    async fn made(
        store: &OrganizationStore,
        maker: &MemberSession,
        username: &str,
        role_id: &str,
        override_mask: i64,
    ) -> Result<super::MemberFacts, Error> {
        create_account(
            store,
            maker,
            no_platform(),
            username,
            role_id,
            override_mask,
            &[],
            test_cost(),
            NOW,
        )
        .await
    }

    /// Effort 828, requirements 19 and 20, criteria 19 and 20: **an account is made without a link
    /// and holds no password until its first link is opened.**
    ///
    /// The row is written and nothing is handed over: no invitation stands behind it, and the wall
    /// refuses every password, because the one the vault was drawn under is spelled nowhere. The
    /// first link is an invitation-kind link, since the account's password is not yet set; it
    /// lapses a week out, admits one machine once, and the password the person chooses on it is
    /// what signs them in from then on.
    #[tokio::test]
    async fn an_account_is_made_with_no_link_and_its_first_link_sets_its_password() {
        let credentials = Memory::new();
        let directory = scratch("account");
        let (store, owner, link, _, _) = owned(&credentials, &directory).await;
        let account = create_account(
            &store,
            &owner,
            no_platform(),
            "sami.staff",
            permission::MEMBER,
            0,
            &[],
            test_cost(),
            NOW,
        )
        .await
        .expect("the account could not be made");

        assert_eq!(account.username, "sami.staff");
        assert_eq!(account.role, permission::MEMBER);
        assert!(
            store
                .invitations(&owner.verifying_key)
                .await
                .expect("the invitations")
                .is_empty(),
            "making an account wrote an invitation row"
        );

        // the wall, with nothing to admit them: the vault was drawn under a password nobody was
        // shown and nothing stores, so no password opens it and the account waits for a link.
        let held = joined_as(&owner, &account.id, permission::MEMBER);

        for attempt in ["sami.staff", PASSWORD, "a password sami chose"] {
            assert!(
                sign_in_by_username(&credentials, &store, &held, "sami.staff", attempt, &slot())
                    .await
                    .is_err(),
                "an account with no link admitted {attempt} at the wall"
            );
        }

        let made = make_link(
            &store,
            &owner,
            no_platform(),
            &link,
            &account.id,
            crate::organization::invitation::TEST_LIFETIME_HOURS,
            test_cost(),
            NOW,
        )
        .await
        .expect("the first link could not be made");
        let decoded = JoinLink::decode(&made.link).expect("the link");

        assert_eq!(
            decoded.half.kind,
            HalfKind::Invitation,
            "an account whose password is not set got a link that opens no vault"
        );
        assert_eq!(made.expires_at, NOW + TEST_LIFETIME_MS);
        assert!(
            open_payload(
                &made.code,
                &decoded.locator(),
                &decoded.half,
                &decoded.credential,
                test_cost()
            )
            .expect("the code did not open the payload")
            .vault_password
            .is_some(),
            "the invitation-kind link carries no vault password"
        );

        // a week and a moment late, on a machine holding nothing: refused before anything is
        // recorded.
        let late = scratch("account-late");
        let mut late_machine = fresh_machine(&late);

        assert!(
            crate::organization::invitation::join::accept(
                &credentials,
                |_| async { Ok::<_, Error>(&store) },
                &mut late_machine,
                &late.join("app.db"),
                &decoded,
                &made.code,
                CHOSEN,
                test_cost(),
                made.expires_at + 1,
            )
            .await
            .is_err(),
            "a lapsed link opened an account"
        );
        assert!(late_machine.selected().is_none());

        // the machine it was made for, which spends it and chooses the password.
        let theirs = scratch("account-theirs");
        let mut their_machine = fresh_machine(&theirs);
        let (_, session) = crate::organization::invitation::join::accept(
            &credentials,
            |_| async { Ok::<_, Error>(&store) },
            &mut their_machine,
            &theirs.join("app.db"),
            &decoded,
            &made.code,
            CHOSEN,
            test_cost(),
            NOW + 1,
        )
        .await
        .expect("the account could not be opened");

        assert_eq!(session.member_id, account.id);
        assert!(!session.must_change_password);

        // and the wall admits them on it from now on.
        sign_in_by_username(&credentials, &store, &held, "sami.staff", CHOSEN, &slot())
            .await
            .expect("the chosen password did not admit them at the wall");

        // a second machine with the same pair: the invitation was spent, and it is refused with
        // nothing recorded on that machine (effort 851, requirement 10).
        let second = scratch("account-second");
        let mut second_machine = fresh_machine(&second);

        assert!(
            crate::organization::invitation::join::accept(
                &credentials,
                |_| async { Ok::<_, Error>(&store) },
                &mut second_machine,
                &second.join("app.db"),
                &decoded,
                &made.code,
                "another password again",
                test_cost(),
                NOW + 2,
            )
            .await
            .is_err(),
            "a spent link opened a second machine"
        );
        assert!(
            second_machine.selected().is_none(),
            "a spent link recorded the organization"
        );
    }

    /// **The generated password is not derived from the username**, asserted rather than merely
    /// different: two invitations whose usernames differ by one character draw passwords that
    /// share nothing, and no part of either username appears in either password. Two draws with
    /// identical inputs cannot be made through an invitation any more, because the second username
    /// would be taken, so the alphabet and the draw are asserted on the generator itself.
    #[tokio::test]
    async fn the_generated_password_is_drawn_and_not_derived() {
        let credentials = Memory::new();
        let directory = scratch("password");
        let (store, owner, link, _, _) = owned(&credentials, &directory).await;
        let invite = |username: &'static str| {
            let store = &store;
            let owner = &owner;
            let link = &link;

            async move {
                let invited = make_account_and_link(
                    store,
                    owner,
                    no_platform(),
                    link,
                    Invitation {
                        username,
                        role: permission::MEMBER,
                        workspaces: &[],
                    },
                    test_cost(),
                    1,
                )
                .await
                .expect("the invitation failed");

                secret_of(&invited)
            }
        };

        let first = invite("olivia.owner").await;
        let second = invite("olivia.owner2").await;

        assert_ne!(first, second, "two invitations drew the same password");
        assert_ne!(
            generate_password().expect("a password"),
            generate_password().expect("a password"),
            "the generator drew the same password twice"
        );

        for password in [&first, &second] {
            assert_eq!(password.len(), 23, "{password}");
            assert_eq!(password.matches('-').count(), 3, "{password}");

            for fragment in ["olivia", "owner"] {
                assert!(
                    !password.to_lowercase().contains(fragment),
                    "{password} carries {fragment}"
                );
            }
        }

        let alphabet = generate_password().expect("a password");

        assert!(
            alphabet
                .chars()
                .all(|c| c == '-' || "abcdefghijkmnpqrstuvwxyz23456789".contains(c)),
            "{alphabet}"
        );
    }

    /// Effort 826, requirement 6 at the reset: `issue` writes the permissions it is given, so a
    /// member whose row was widened past their role's mask is reset with the widening kept, and a
    /// fresh invitation writes the role's own mask.
    #[tokio::test]
    async fn a_reset_keeps_a_widened_members_permissions_and_a_fresh_invitation_writes_the_roles() {
        let credentials = Memory::new();
        let directory = scratch("widened");
        let (store, owner, link, _, _) = owned(&credentials, &directory).await;
        let invited = make_account_and_link(
            &store,
            &owner,
            no_platform(),
            &link,
            Invitation {
                username: "sami",
                role: permission::MEMBER,
                workspaces: &[],
            },
            test_cost(),
            1,
        )
        .await
        .expect("the invitation failed");

        assert_eq!(
            crate::organization::invitation::members(&store, &owner)
                .await
                .expect("the members")
                .into_iter()
                .find(|member| member.id == invited.member_id)
                .expect("the member")
                .permissions,
            permission::MEMBER_ROLE.mask,
            "a fresh invitation wrote something other than the role's mask"
        );

        // widened by hand, the way an override widens a row: one flag past the role.
        let widened = permission::mask_of(&[permission::Flag::RenameWorkspace]);
        let (key, certificate) = crate::organization::workspace::signer_of(&store, &owner)
            .await
            .expect("the signer");
        let row = store
            .members(&owner.verifying_key)
            .await
            .expect("members")
            .into_iter()
            .find(|member| member.id == invited.member_id)
            .expect("the member row");
        store
            .write_member(
                &Signer {
                    key: &key,
                    certificate: &certificate,
                },
                &crate::organization::store::MemberRecord {
                    override_mask: widened,
                    ..row
                },
            )
            .await
            .expect("widened");

        let reset = reset_account(
            &store,
            &owner,
            no_platform(),
            &link,
            &invited.member_id,
            test_cost(),
            2,
        )
        .await
        .expect("the reset failed");
        let after = sign_in(
            &store,
            &joined_as(&owner, &reset.member_id, permission::MEMBER),
            &secret_of(&reset),
            &slot(),
        )
        .await
        .expect("the reset member did not sign in");

        assert_eq!(
            after.permissions,
            permission::effective(permission::MEMBER_ROLE.mask, widened),
            "the reset narrowed the member"
        );
        assert_eq!(after.role, permission::MEMBER);
    }

    /// Criterion 1: **resetting a manager leaves every row they signed still verifiable,
    /// and everyone can still sign in.** The owner resets a manager who has invited a member
    /// and holds a workspace; the reset draws a fresh vault secret and replaces the certificate,
    /// and without the re-signing that precedes it every row the old certificate signed would fail
    /// verification and refuse the whole read (F1). Afterwards the owner, the reset manager
    /// under the new password, and the member all sign in, and members, grants and invitations all
    /// read without a refusal.
    #[tokio::test]
    async fn resetting_a_manager_leaves_every_row_verifiable_and_everyone_signs_in() {
        let credentials = Memory::new();
        let directory = scratch("manager-reset-by-owner");
        let (store, owner, link, workspace_id, _) = owned(&credentials, &directory).await;

        let manager = make_account_and_link(
            &store,
            &owner,
            no_platform(),
            &link,
            Invitation {
                username: "ada.manager",
                role: permission::MANAGER,
                workspaces: &full(std::slice::from_ref(&workspace_id)),
            },
            test_cost(),
            1,
        )
        .await
        .expect("the manager");

        // the manager signs in, settles, and invites a member into the workspace: their
        // certificate now signs a member row, grants and an invitation. The manager's first
        // password is read while their invitation row is still there, because the reset below
        // deletes it and the vault it opened is what the reset replaces.
        let managers_first_password = secret_of(&manager);
        let mut ada = sign_in(
            &store,
            &joined_as(&owner, &manager.member_id, permission::MANAGER),
            &managers_first_password,
            &slot(),
        )
        .await
        .expect("the manager did not sign in");
        ada.must_change_password = false;
        // every account starts locked (effort 851); these tests are about an unlocked one.
        let _ =
            crate::organization::member::lock::unlocked_for_a_test(&store, &owner, &ada.member_id)
                .await;

        let bob = make_account_and_link(
            &store,
            &ada,
            no_platform(),
            &link,
            Invitation {
                username: "bob",
                role: permission::MEMBER,
                workspaces: &full(std::slice::from_ref(&workspace_id)),
            },
            test_cost(),
            2,
        )
        .await
        .expect("bob");

        // the owner resets the manager: their certificate is replaced with one over a key
        // derived from a fresh vault secret.
        let reset = reset_account(
            &store,
            &owner,
            no_platform(),
            &link,
            &manager.member_id,
            test_cost(),
            3,
        )
        .await
        .expect("the reset failed");

        assert_ne!(secret_of(&reset), managers_first_password);

        // F1: every read stands.
        assert!(
            store.members(&owner.verifying_key).await.is_ok(),
            "resetting a manager bricked the members read"
        );
        assert!(
            store.grants(&owner.verifying_key).await.is_ok(),
            "resetting a manager bricked the grants read"
        );
        assert!(
            store.invitations(&owner.verifying_key).await.is_ok(),
            "resetting a manager bricked the invitations read"
        );

        // everyone signs in: the owner, the reset manager under the new password, the member.
        let owner_again = sign_in(
            &store,
            &joined_as(&owner, &owner.member_id, permission::OWNER),
            PASSWORD,
            &slot(),
        )
        .await
        .expect("the owner can no longer sign in");

        assert_eq!(owner_again.role, permission::OWNER);

        let ada_again = sign_in(
            &store,
            &joined_as(&owner, &manager.member_id, permission::MANAGER),
            &secret_of(&reset),
            &slot(),
        )
        .await
        .expect("the reset manager did not sign in under the new password");

        assert!(ada_again.must_change_password);
        assert!(
            ada_again.workspace_credentials.contains_key(&workspace_id),
            "the reset manager lost the workspace they held"
        );

        let bob_again = sign_in(
            &store,
            &joined_as(&owner, &bob.member_id, permission::MEMBER),
            &secret_of(&bob),
            &slot(),
        )
        .await
        .expect("the member the manager invited can no longer sign in");

        assert!(bob_again.workspace_credentials.contains_key(&workspace_id));

        // and the old password no longer opens the reset manager's vault.
        assert!(
            sign_in(
                &store,
                &joined_as(&owner, &manager.member_id, permission::MANAGER),
                &managers_first_password,
                &slot(),
            )
            .await
            .is_err(),
            "the old password still opens the reset manager's vault"
        );
    }

    /// Who may invite whom: an owner invites a manager, who then invites a member; a manager does
    /// not invite a manager, whose role is not below theirs (effort 838, requirement 7); a member
    /// invites nobody.
    #[tokio::test]
    async fn administration_is_what_the_row_carries_and_an_account_ranks_below_its_maker() {
        let credentials = Memory::new();
        let directory = scratch("roles");
        let (store, owner, link, _, _) = owned(&credentials, &directory).await;

        let manager = make_account_and_link(
            &store,
            &owner,
            no_platform(),
            &link,
            Invitation {
                username: "ada.manager",
                role: permission::MANAGER,
                workspaces: &[],
            },
            test_cost(),
            1,
        )
        .await
        .expect("the owner could not invite a manager");

        // a certificate exists for them, issued from the owner's.
        let certificates = store.certificates().await.expect("the certificates");

        assert!(
            certificates
                .iter()
                .any(|certificate| certificate.member_id == manager.member_id)
        );

        let ada = sign_in(
            &store,
            &joined_as(&owner, &manager.member_id, permission::MANAGER),
            &secret_of(&manager),
            &slot(),
        )
        .await
        .expect("the manager did not sign in");

        assert_eq!(ada.permissions, permission::MANAGER_ROLE.mask);

        let mut settled = ada;
        settled.must_change_password = false;
        // every account starts locked (effort 851); these tests are about an unlocked one.
        let _ = crate::organization::member::lock::unlocked_for_a_test(
            &store,
            &owner,
            &settled.member_id,
        )
        .await;

        let member = make_account_and_link(
            &store,
            &settled,
            no_platform(),
            &link,
            Invitation {
                username: "mohammed",
                role: permission::MEMBER,
                workspaces: &[],
            },
            test_cost(),
            2,
        )
        .await
        .expect("a manager could not invite a member");

        let refusal = make_account_and_link(
            &store,
            &settled,
            no_platform(),
            &link,
            Invitation {
                username: "another.manager",
                role: permission::MANAGER,
                workspaces: &[],
            },
            test_cost(),
            3,
        )
        .await
        .expect_err("a manager made a manager");

        assert!(
            matches!(
                refusal,
                Error::Refused {
                    reason: RefusalReason::RankNotAbove,
                    ..
                }
            ),
            "{refusal:?}"
        );

        let mut mo = sign_in(
            &store,
            &joined_as(&owner, &member.member_id, permission::MEMBER),
            &secret_of(&member),
            &slot(),
        )
        .await
        .expect("the member did not sign in");
        mo.must_change_password = false;
        // every account starts locked (effort 851); these tests are about an unlocked one.
        let _ =
            crate::organization::member::lock::unlocked_for_a_test(&store, &owner, &mo.member_id)
                .await;

        let refusal = make_account_and_link(
            &store,
            &mo,
            no_platform(),
            &link,
            Invitation {
                username: "xavier",
                role: permission::MEMBER,
                workspaces: &[],
            },
            test_cost(),
            4,
        )
        .await
        .expect_err("a member invited somebody");

        assert!(refusal.to_string().contains("inviteMember"), "{refusal}");
    }

    /// A member who must still change their password invites nobody, at the command; and an
    /// invitation into a workspace the inviter does not hold is refused by name rather than quietly
    /// granting less.
    #[tokio::test]
    async fn an_unsettled_inviter_and_an_unreachable_workspace_are_both_refused() {
        let credentials = Memory::new();
        let directory = scratch("refused");
        let (store, owner, link, _, _) = owned(&credentials, &directory).await;
        let mut unsettled = sign_in(
            &store,
            &joined_as(&owner, &owner.member_id, permission::OWNER),
            PASSWORD,
            &slot(),
        )
        .await
        .expect("the owner");
        unsettled.must_change_password = true;

        let refusal = make_account_and_link(
            &store,
            &unsettled,
            no_platform(),
            &link,
            Invitation {
                username: "xavier",
                role: permission::MEMBER,
                workspaces: &[],
            },
            test_cost(),
            1,
        )
        .await
        .expect_err("an unsettled member invited");

        assert!(
            refusal.to_string().contains("change your password"),
            "{refusal}"
        );

        let elsewhere = vec!["a-workspace-nobody-here-holds".to_string()];
        let refusal = make_account_and_link(
            &store,
            &owner,
            no_platform(),
            &link,
            Invitation {
                username: "xavier",
                role: permission::MEMBER,
                workspaces: &full(&elsewhere),
            },
            test_cost(),
            1,
        )
        .await
        .expect_err("an invitation granted a workspace the inviter does not hold");

        assert!(refusal.to_string().contains("full access"), "{refusal}");

        // refused before anything was written: no half-made account holds the username.
        make_account_and_link(
            &store,
            &owner,
            no_platform(),
            &link,
            Invitation {
                username: "xavier",
                role: permission::MEMBER,
                workspaces: &[],
            },
            test_cost(),
            1,
        )
        .await
        .expect("the refused invitation left its username taken");
    }

    /// **Making an account and building one again take `grantWorkspace`, whatever workspaces the
    /// account is given** (the review of effort 838, round one). Each writes the account's grant
    /// on the organization database under the actor's certificate, and a grant is only
    /// `grantWorkspace`'s to sign. A manager whose override switches it off is refused by name
    /// making an account with no workspace, resetting one, and making the link that builds an
    /// unset account again; nothing is written, and the grants go on reading for everybody.
    /// *Until then the refusal came only where a workspace was named, and an account made without
    /// one wrote a grant every reader refused, taking the grants with it.*
    #[tokio::test]
    async fn making_or_resetting_an_account_without_grant_workspace_is_refused_by_name() {
        let credentials = Memory::new();
        let directory = scratch("directory-grant");
        let (store, owner, link, _, _) = owned(&credentials, &directory).await;
        let grant_workspace = permission::mask_of(&[permission::Flag::GrantWorkspace]);
        let nora = made(
            &store,
            &owner,
            "nora.manager",
            permission::MANAGER,
            grant_workspace,
        )
        .await
        .expect("the owner could not make a manager without grantWorkspace");
        let mo = made(&store, &owner, "mo.staff", permission::MEMBER, 0)
            .await
            .expect("the owner could not make a member");
        let (nora_session, _) = opened_as(
            &credentials,
            &store,
            &owner,
            &link,
            &nora.id,
            "nora",
            NOW + 1,
        )
        .await;
        let certificates = store.certificates().await.expect("the certificates");
        let members = store
            .members(&owner.verifying_key)
            .await
            .expect("the members");
        let grants = store
            .grants(&owner.verifying_key)
            .await
            .expect("the grants");
        let invitations = store
            .invitations(&owner.verifying_key)
            .await
            .expect("the invitations");

        let refusals: [(&str, Result<(), Error>); 3] = [
            (
                "an account made with no workspace",
                made(&store, &nora_session, "xavier", permission::MEMBER, 0)
                    .await
                    .map(|_| ()),
            ),
            (
                "a reset",
                unset_password(
                    &store,
                    &nora_session,
                    no_platform(),
                    &mo.id,
                    test_cost(),
                    NOW + 2,
                )
                .await
                .map(|_| ()),
            ),
            (
                "the link that builds an unset account again",
                make_link(
                    &store,
                    &nora_session,
                    no_platform(),
                    &link,
                    &mo.id,
                    crate::organization::invitation::TEST_LIFETIME_HOURS,
                    test_cost(),
                    NOW + 2,
                )
                .await
                .map(|_| ()),
            ),
        ];

        for (what, outcome) in refusals {
            let error = outcome.expect_err(what);

            assert!(
                matches!(
                    &error,
                    Error::Refused {
                        reason: RefusalReason::RoleLacksAct,
                        ..
                    }
                ),
                "{what}: {error:?}"
            );
            assert!(
                error.to_string().contains("grantWorkspace"),
                "{what}: {error}"
            );
        }

        assert_eq!(
            store.certificates().await.expect("the certificates"),
            certificates
        );
        assert_eq!(
            store
                .members(&owner.verifying_key)
                .await
                .expect("the members"),
            members
        );
        assert_eq!(
            store
                .grants(&owner.verifying_key)
                .await
                .expect("the grants still read"),
            grants
        );
        assert_eq!(
            store
                .invitations(&owner.verifying_key)
                .await
                .expect("the invitations"),
            invitations
        );
    }

    /// **A reset carries the member's session epoch through**, rather than writing the literal a
    /// fresh invitation starts at.
    ///
    /// `issue` is reached by both an invitation and a reset, and a reset keeps the member's id
    /// and rewrites their row. A row put back to zero hands every keyring entry filed under an
    /// earlier number the gate `session::resumed` was holding it out with; what saves it today is
    /// the fresh vault behind that gate, and a revocation path with one of its two barriers gone
    /// is not one to rest on.
    #[tokio::test]
    async fn a_reissue_carries_the_rows_session_epoch_through() {
        let credentials = Memory::new();
        let directory = scratch("reissue-epoch");
        let (store, owner, link, workspace_id, _) = owned(&credentials, &directory).await;
        let workspaces = full(&[workspace_id.clone()]);
        let invited = make_account_and_link(
            &store,
            &owner,
            no_platform(),
            &link,
            Invitation {
                username: "sami.staff",
                role: permission::MEMBER,
                workspaces: &workspaces,
            },
            test_cost(),
            NOW,
        )
        .await
        .expect("the invitation failed");

        // three sign-outs-everywhere behind them, as the row would carry after three.
        for epoch in 1..=3 {
            store
                .set_session_epoch(&invited.member_id, epoch, NOW + epoch)
                .await
                .expect("the bump");
        }

        assert_eq!(epoch_of(&store, &owner, &invited.member_id).await, 3);

        reset_account(
            &store,
            &owner,
            no_platform(),
            &link,
            &invited.member_id,
            test_cost(),
            NOW + 10,
        )
        .await
        .expect("the reissue failed");

        assert_eq!(
            epoch_of(&store, &owner, &invited.member_id).await,
            3,
            "a password reset put the member's session epoch back"
        );

        // and a fresh invitation still starts where a fresh row starts.
        let fresh = make_account_and_link(
            &store,
            &owner,
            no_platform(),
            &link,
            Invitation {
                username: "noor.new",
                role: permission::MEMBER,
                workspaces: &workspaces,
            },
            test_cost(),
            NOW + 11,
        )
        .await
        .expect("the second invitation failed");

        assert_eq!(epoch_of(&store, &owner, &fresh.member_id).await, 0);
    }

    /// The session epoch on a member's row, read through the verified reader.
    async fn epoch_of(store: &OrganizationStore, owner: &MemberSession, member_id: &str) -> i64 {
        store
            .members(&owner.verifying_key)
            .await
            .expect("the rows")
            .into_iter()
            .find(|member| member.id == member_id)
            .expect("the member row")
            .session_epoch
    }

    /// Every live certificate a member holds, judged against the key the owner pinned.
    async fn live_of(
        store: &OrganizationStore,
        owner: &MemberSession,
        member_id: &str,
    ) -> Vec<crate::organization::authority::Certificate> {
        store
            .live_certificates(&owner.verifying_key, member_id)
            .await
            .expect("the certificates")
    }

    /// Which certificate signed one grant row, read raw.
    async fn grant_signed_by(
        store: &OrganizationStore,
        member_id: &str,
        workspace_id: &str,
    ) -> String {
        let mut rows = store
            .connection()
            .query(
                "SELECT \"certificate_id\" FROM \"grant\" WHERE \"member_id\" = ? AND \
                 \"workspace_id\" = ?",
                vec![
                    turso::Value::Text(member_id.to_string()),
                    turso::Value::Text(workspace_id.to_string()),
                ],
            )
            .await
            .expect("the row");
        let row = rows
            .next()
            .await
            .expect("a row")
            .expect("the grant row exists");

        match row.get_value(0).expect("the certificate id") {
            turso::Value::Text(id) => id,
            other => panic!("certificate_id is {other:?}"),
        }
    }

    /// The refusal's reason and sentence, or a panic naming what came back instead.
    fn refused_with(
        result: Result<crate::organization::invitation::MemberFacts, Error>,
        what: &str,
    ) -> (RefusalReason, String) {
        match result {
            Err(Error::Refused { reason, message }) => (reason, message),
            other => panic!("{what}: {other:?}"),
        }
    }

    /// Effort 838, requirement 6 as amended 2026-09-27, at the account: **an account whose role
    /// and override add, edit or delete a kind of record without viewing it is not made**, and the
    /// refusal names the kind. Nothing is written, and the same role with the view kept is made.
    #[tokio::test]
    async fn an_account_writing_a_kind_it_cannot_view_is_not_made() {
        let credentials = Memory::new();
        let directory = scratch("unviewed");
        let (store, owner, _, _, _) = owned(&credentials, &directory).await;
        let members = store
            .members(&owner.verifying_key)
            .await
            .expect("the members")
            .len();

        // the member's role views and writes contracts; switching the view off leaves the writes.
        let (reason, message) = refused_with(
            made(
                &store,
                &owner,
                "xavier",
                permission::MEMBER,
                permission::mask_of(&[permission::Flag::ViewContract]),
            )
            .await,
            "an account was made writing contracts it cannot view",
        );

        assert_eq!(reason, RefusalReason::NeedsViewing("contract"), "{message}");
        assert!(message.contains("contract"), "{message}");
        assert_eq!(
            store
                .members(&owner.verifying_key)
                .await
                .expect("the members")
                .len(),
            members,
            "a refusal wrote a member row"
        );

        let kept = made(
            &store,
            &owner,
            "xavier",
            permission::MEMBER,
            permission::mask_of(&[
                permission::Flag::ViewContract,
                permission::Flag::CreateContract,
                permission::Flag::EditContract,
            ]),
        )
        .await
        .expect("an account without contracts at all was not made");

        assert!(!permission::permits(
            kept.permissions,
            permission::Flag::EditContract
        ));
    }

    /// Effort 838, criterion 7 at the account: **an account is made in a role strictly below the
    /// maker's, and carrying no flag the maker does not hold, switched on or off.**
    ///
    /// Three managers stand in for every maker: one carrying the manager's role whole, one whose
    /// override takes `editPayment` away, and one whose override takes `deleteUnit` away. A role at
    /// or above the maker's is refused by rank, the owner's included and by the owner too; a role
    /// that carries a flag the maker lacks is refused naming it, and so is an override that names
    /// one, whether it would switch the flag off (the member's `editPayment`) or on (`deleteUnit`,
    /// which the member's role does not carry); the owner's flags are refused in any override.
    /// None of the refusals writes a row or a certificate, and within the lines both makers make
    /// the account they asked for.
    #[tokio::test]
    async fn an_account_is_made_below_the_maker_and_with_only_flags_they_hold() {
        let credentials = Memory::new();
        let directory = scratch("below");
        let (store, owner, link, _, _) = owned(&credentials, &directory).await;
        let edit_payment = permission::mask_of(&[permission::Flag::EditPayment]);
        let delete_unit = permission::mask_of(&[permission::Flag::DeleteUnit]);
        let lock_out = permission::mask_of(&[permission::Flag::LockOut]);
        let mut sessions = Vec::new();

        for (username, override_mask, at) in [
            ("ada.manager", 0, NOW + 1),
            ("nora.manager", edit_payment, NOW + 3),
            ("dana.manager", delete_unit, NOW + 5),
        ] {
            let account = made(&store, &owner, username, permission::MANAGER, override_mask)
                .await
                .expect("the owner could not make a manager");
            let (session, _) = opened_as(
                &credentials,
                &store,
                &owner,
                &link,
                &account.id,
                username,
                at,
            )
            .await;

            sessions.push(session);
        }

        let [ada, nora, dana] = <[MemberSession; 3]>::try_from(sessions).expect("three managers");
        let certificates = store.certificates().await.expect("the certificates").len();
        let members = store
            .members(&owner.verifying_key)
            .await
            .expect("the members")
            .len();

        // a role at or above the maker's, by rank: the manager's for a manager, and the owner's
        // for anybody, the owner included.
        for (maker, role_id, what) in [
            (&ada, permission::MANAGER, "a manager made a manager"),
            (&ada, permission::OWNER, "a manager made an owner"),
            (&owner, permission::OWNER, "the owner made a second owner"),
        ] {
            let (reason, message) =
                refused_with(made(&store, maker, "xavier", role_id, 0).await, what);

            assert_eq!(reason, RefusalReason::RankNotAbove, "{what}: {message}");
            assert!(message.contains("not below yours"), "{what}: {message}");
        }

        // a role nobody holds is not made up.
        let (reason, _) = refused_with(
            made(&store, &ada, "xavier", "a-role-nobody-made", 0).await,
            "an account was made in a role that does not exist",
        );

        assert_eq!(reason, RefusalReason::RoleUnknown);

        // a flag the maker lacks, carried by the role, by an override switching it off, and by an
        // override switching it on.
        for (maker, override_mask, flag, what) in [
            (&nora, 0, "editPayment", "the role's editPayment was given"),
            (
                &nora,
                edit_payment,
                "editPayment",
                "editPayment was switched off",
            ),
            (
                &dana,
                delete_unit,
                "deleteUnit",
                "deleteUnit was switched on",
            ),
        ] {
            let (reason, message) = refused_with(
                made(&store, maker, "xavier", permission::MEMBER, override_mask).await,
                what,
            );

            assert_eq!(reason, RefusalReason::RoleLacksAct, "{what}: {message}");
            assert!(message.contains(flag), "{what}: {message}");
        }

        // and the owner's flags, in anybody's override, from the owner who holds them as well.
        for (maker, what) in [(&owner, "the owner"), (&ada, "a manager")] {
            let (reason, message) = refused_with(
                made(&store, maker, "xavier", permission::MEMBER, lock_out).await,
                what,
            );

            assert_eq!(reason, RefusalReason::OwnerOnly, "{what}: {message}");
            assert!(message.contains("lockOut"), "{what}: {message}");
        }

        assert_eq!(
            store.certificates().await.expect("the certificates").len(),
            certificates,
            "a refusal issued a certificate"
        );
        assert_eq!(
            store
                .members(&owner.verifying_key)
                .await
                .expect("the members")
                .len(),
            members,
            "a refusal wrote a member row"
        );

        // within the lines, the account is made as asked.
        let plain = made(&store, &dana, "mo.staff", permission::MEMBER, 0)
            .await
            .expect("a manager lacking deleteUnit could not make a plain member");

        assert_eq!(plain.permissions, permission::MEMBER_ROLE.mask);

        let widened = made(
            &store,
            &ada,
            "gina.staff",
            permission::MEMBER,
            permission::mask_of(&[permission::Flag::GrantWorkspace]),
        )
        .await
        .expect("a manager could not make a member widened with a flag they hold");

        assert_eq!(
            widened.permissions,
            permission::MEMBER_ROLE.mask | permission::mask_of(&[permission::Flag::GrantWorkspace])
        );
    }

    /// Effort 838, requirement 9 at the account: **a manager's account is certified from the
    /// manager's own certificate, with the ceiling and the rank of what the account may do, and
    /// nobody derives the organization key to do it.**
    ///
    /// The manager's vault derives no key the organization is signed under
    /// (`ownership::organization_key_of` refuses it by name), and the member they make holds one live
    /// certificate that names the manager's as its issuer, carries the member's effective
    /// permissions and the member's rank, and walks to the pinned key. Every live member holds
    /// exactly one live certificate afterwards, the owner and the manager included.
    #[tokio::test]
    async fn a_managers_account_is_certified_from_their_own_certificate() {
        let credentials = Memory::new();
        let directory = scratch("delegated");
        let (store, owner, link, _, _) = owned(&credentials, &directory).await;
        let manager = made(&store, &owner, "ada.manager", permission::MANAGER, 0)
            .await
            .expect("the manager");
        let (ada, _) = opened_as(
            &credentials,
            &store,
            &owner,
            &link,
            &manager.id,
            "ada",
            NOW + 1,
        )
        .await;

        assert!(
            crate::organization::ownership::organization_key_of(&ada).is_err(),
            "a manager's vault derives the organization key"
        );

        let widened = permission::mask_of(&[permission::Flag::GrantWorkspace]);
        let member = made(&store, &ada, "mo.staff", permission::MEMBER, widened)
            .await
            .expect("the manager could not make a member");
        let row = store
            .members(&owner.verifying_key)
            .await
            .expect("the members")
            .into_iter()
            .find(|row| row.id == member.id)
            .expect("the member row");
        let issuer = live_of(&store, &owner, &manager.id).await;
        let issued = live_of(&store, &owner, &member.id).await;

        assert_eq!(issuer.len(), 1, "{issuer:?}");
        assert_eq!(issued.len(), 1, "{issued:?}");

        let certificate = &issued[0];

        assert_eq!(
            certificate.issuer_certificate_id.as_deref(),
            Some(issuer[0].id.as_str()),
            "the member's certificate was not issued from the manager's"
        );
        assert_eq!(certificate.ceiling, row.effective);
        assert_eq!(certificate.ceiling, permission::MEMBER_ROLE.mask | widened);
        assert_eq!(certificate.rank, permission::MEMBER_ROLE.rank);
        assert_eq!(certificate.signing_public_key, row.signing_public_key);

        let (certificates, revocations) = store.chain_rows().await.expect("the chain");

        assert!(
            crate::organization::authority::Chain::new(
                &owner.verifying_key,
                &certificates,
                &revocations
            )
            .live(&certificate.id)
            .is_ok(),
            "the member's certificate does not walk to the pinned key"
        );

        for row in store
            .members(&owner.verifying_key)
            .await
            .expect("the members")
        {
            assert_eq!(
                live_of(&store, &owner, &row.id).await.len(),
                1,
                "{} does not hold exactly one live certificate",
                row.id
            );
        }
    }

    /// Effort 838, requirement 9 at the reset: **a manager resets a member's password with no
    /// organization key anywhere in reach, the member's fresh certificate verifies, and the rows
    /// their old one signed still verify.**
    ///
    /// The member was widened with `grantWorkspace` and granted the workspace to a colleague, so
    /// their certificate signed a row. The manager's reset issues them a certificate from the
    /// manager's own over the fresh vault's key, re-signs the grant under the manager and revokes
    /// the old certificate: the grants read, the colleague still opens the workspace, and the reset
    /// member signs in on the fresh link. A second manager is not the first's to reset.
    #[tokio::test]
    async fn a_manager_resets_a_member_and_every_row_their_old_certificate_signed_still_verifies() {
        let credentials = Memory::new();
        let directory = scratch("manager-reset");
        let (store, owner, link, north, _) = owned(&credentials, &directory).await;
        let north_only = full(std::slice::from_ref(&north));
        let manager = create_account(
            &store,
            &owner,
            no_platform(),
            "ada.manager",
            permission::MANAGER,
            0,
            &north_only,
            test_cost(),
            NOW,
        )
        .await
        .expect("the manager");
        let other_manager = made(&store, &owner, "bea.manager", permission::MANAGER, 0)
            .await
            .expect("the second manager");
        let granter = create_account(
            &store,
            &owner,
            no_platform(),
            "sami.staff",
            permission::MEMBER,
            permission::mask_of(&[permission::Flag::GrantWorkspace]),
            &north_only,
            test_cost(),
            NOW,
        )
        .await
        .expect("the widened member");
        let colleague = made(&store, &owner, "bob.staff", permission::MEMBER, 0)
            .await
            .expect("the colleague");
        let (ada, _) = opened_as(
            &credentials,
            &store,
            &owner,
            &link,
            &manager.id,
            "ada",
            NOW + 1,
        )
        .await;
        let (sami, _) = opened_as(
            &credentials,
            &store,
            &owner,
            &link,
            &granter.id,
            "sami",
            NOW + 3,
        )
        .await;
        let (_, _) = opened_as(
            &credentials,
            &store,
            &owner,
            &link,
            &colleague.id,
            "bob",
            NOW + 5,
        )
        .await;

        // the member's certificate signs a row: their colleague's grant on the workspace.
        crate::organization::workspace::grant_workspace::<InMemoryPlatform>(
            &store,
            &sami,
            None,
            &north,
            &colleague.id,
            AccessLevel::FullAccess,
        )
        .await
        .expect("the widened member could not grant the workspace");

        let old = live_of(&store, &owner, &granter.id).await;

        assert_eq!(old.len(), 1);
        assert_eq!(
            grant_signed_by(&store, &colleague.id, &north).await,
            old[0].id
        );

        // no organization key in reach: the manager's vault does not derive it.
        assert!(
            crate::organization::ownership::organization_key_of(&ada).is_err(),
            "a manager's vault derives the organization key"
        );

        let reset = reset_account(
            &store,
            &ada,
            no_platform(),
            &link,
            &granter.id,
            test_cost(),
            NOW + 10,
        )
        .await
        .expect("a manager could not reset a member");

        // the fresh certificate: one, from the manager's, over the key the fresh row names, and
        // it walks to the pinned key; the old one does not any more.
        let managers = live_of(&store, &owner, &manager.id).await;
        let fresh = live_of(&store, &owner, &granter.id).await;
        let row = store
            .members(&owner.verifying_key)
            .await
            .expect("the members verify after the reset")
            .into_iter()
            .find(|row| row.id == granter.id)
            .expect("the reset member's row");

        assert_eq!(fresh.len(), 1, "{fresh:?}");
        assert_ne!(fresh[0].id, old[0].id);
        assert_eq!(
            fresh[0].issuer_certificate_id.as_deref(),
            Some(managers[0].id.as_str())
        );
        assert_eq!(fresh[0].signing_public_key, row.signing_public_key);
        assert_ne!(fresh[0].signing_public_key, old[0].signing_public_key);
        assert_eq!(fresh[0].ceiling, row.effective);

        // the row the old certificate signed verifies, under the manager now.
        store
            .grants(&owner.verifying_key)
            .await
            .expect("the rows the old certificate signed no longer verify");
        assert_eq!(
            grant_signed_by(&store, &colleague.id, &north).await,
            managers[0].id
        );

        let bob = sign_in(
            &store,
            &joined_as(&owner, &colleague.id, permission::MEMBER),
            CHOSEN,
            &slot(),
        )
        .await
        .expect("the colleague no longer signs in");

        assert!(bob.workspace_credentials.contains_key(&north));

        // and the reset member signs in on the fresh link, holding what they held.
        let after = sign_in(
            &store,
            &joined_as(&owner, &granter.id, permission::MEMBER),
            &secret_of(&reset),
            &slot(),
        )
        .await
        .expect("the reset member did not sign in");

        assert!(after.must_change_password);
        assert!(after.workspace_credentials.contains_key(&north));

        // a manager's account is not a manager's to reset.
        let refusal = unset_password(
            &store,
            &ada,
            no_platform(),
            &other_manager.id,
            test_cost(),
            NOW + 20,
        )
        .await
        .expect_err("a manager reset another manager");

        assert!(
            matches!(
                refusal,
                Error::Refused {
                    reason: RefusalReason::RankNotAbove,
                    ..
                }
            ),
            "{refusal:?}"
        );
    }
}
