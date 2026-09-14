//! inviting a member: a row they will open, and the one link that finds the organization and
//! opens their place in it the first time.
//!
//! **The application sends no mail.** We have registered with no mail service and the spec's
//! constraints forbid registering one on the customer's behalf, so an invitation is one thing
//! the administrator hands over themselves: a link (effort 826, requirement 8). The interface
//! says so and shows it with one copy control. *Effort 824 handed over three things, the link,
//! the username and a generated password; the password is inside the link now, and the username
//! is read off the row the link opens.*
//!
//! **What an invitation makes.** A member row with a vault sealed under a generated password
//! and `must_change_password` set; the content key sealed to the new member's public key; a
//! grant on the organization database, which is the inviter's own credential re-sealed, so the
//! member can pull the directory once their vault is open; a grant on each workspace named, at
//! the access asked for, so an administrator invites into what they can reach themselves and a
//! read-only grant is minted on the owner's machine as every read-only grant is; and an invitation
//! row naming the member, which is the pending account's expiry and what opening the link spends
//! (`join.rs::accept`). An administrator who invites an administrator needs the organization key
//! to certify them, and only the owner's vault yields it, so that is refused for anybody else and
//! says why.
//!
//! **The row carries the verifying half of the key the member will sign with.** It is derived
//! from the vault secret drawn here, which is the one moment anybody holds that secret, and it is
//! written whatever the role is: an owner widening the member into an act that signs rows later
//! has a key to certify and no way to derive one themselves (effort 826, requirement 6,
//! `role::change_role`).
//!
//! **The generated password is drawn, never derived, and never shown.** Twenty characters from a
//! thirty-two character alphabet, drawn from the operating system; nothing about the username
//! enters it, and a test asserts that rather than asserting the two merely differ. It rides inside
//! the invitation link as the secret that opens the vault once, and opening the link reseals the
//! vault under a password the person chose, so the drawn one is spent the moment it is used.
//!
//! **A member is a username** (effort 824, requirement 21). The row carries no address and no
//! display name: one sealed username, three to thirty-two characters of letters, digits, `.`,
//! `_` and `-`, unique in the organization without regard to case. [`validate_username`] is the
//! one place the rules live and [`refuse_taken_username`] the one place uniqueness is checked;
//! the first run, an invitation and a rename all refuse through them, with the same sentences.
//!
//! **A rename is a row written back** (requirement 23). [`rename_member`] re-seals the username
//! and writes the member's row again under the actor's own signer, the way a removal writes one;
//! it is the owner's or an administrator's, never the member's own, and it moves nothing else on
//! the row.
//!
//! **The invitation row carries the secret it was made with, sealed to its issuer.** `issue`
//! writes the generated password under [`vault::seal_to_public_key`] to the issuing session's own
//! public key, and the issuer's member id beside it. It is what lets that one person hand the
//! same link over a second time ([`invitation_link`]); for anybody else the row offers a fresh
//! link, which is a reset. Neither column is under the invitation signature, whose preimage is
//! unchanged: a tampered seal opens for nobody, and a tampered issuer misplaces a copy control.
//!
//! **An invitation expires; the link does not** (requirement 23). The row carries the lifetime,
//! and a link opened after it lapsed is refused naming the lapse, since that is what a reissue is
//! for. Reissuing is a fresh invitation for the same member, which rewrites their vault under a
//! new password and re-seals what the reissuer can reach, and it is the path a reset takes.
//!
//! **Revoking takes back what the invitation made** (effort 826, requirement 15). A person who
//! never opened their link is removed the ordinary way, grants and all, under the act that made
//! them, so a link somebody kept opens a vault that holds nothing; a reset link on a member who
//! has signed in before is deleted alone, and the member's vault stays the reset one until another
//! reset. Which of the two a member is, is whether an invitation of theirs was ever consumed: a
//! reset deletes the open invitation before it and keeps the consumed one as that record.
//!
//! **A reset says what it could not restore** (requirement 13). The old vault is gone with the
//! reissue and every grant sealed to it is dead; the reissuer re-seals the ones they hold a full
//! credential on themselves, mints again the read-only ones where they are the owner, and the
//! rest are removed and named in the answer, so the member knows which workspaces they wait on
//! somebody else for. There is no master key to do better with, and the spec accepted that
//! deliberately. A reset keeps the member's permissions as they were widened (requirement 6).

use serde::{Deserialize, Serialize};

use crate::{
    diagnostics,
    error::Error,
    sync::turso::platform::{AccessLevel, TursoPlatform},
};

use super::{
    authority::{AdministratorKey, OrganizationKey, issue_certificate},
    link::JoinLink,
    permission::{self, Administration},
    removal,
    session::MemberSession,
    setup::{ADMINISTRATOR_KEY_PURPOSE, ORGANIZATION_KEY_PURPOSE, SHIPPING_KDF, credential_expiry},
    store::{GrantRecord, InvitationRecord, MemberRecord, OrganizationStore, Signer},
    vault::{
        KdfParams, create_vault_with_secret, open_content, seal_content, seal_to_public_key,
        unseal_with_secret_key,
    },
    workspace::{WORKSPACE_CREDENTIAL_LIFETIME, signer_of},
};

/// How long an invitation stands: a week, which is long enough to send a link on Friday and have
/// it opened on Monday, and short enough that a link in an old message is not a way in.
pub const INVITATION_LIFETIME_MS: i64 = 7 * 24 * 60 * 60 * 1000;

/// The alphabet a generated password is spelled in: lowercase and digits with the four that read
/// alike removed, `0`, `o`, `1` and `l`, so what is read out over a phone is what is typed.
const PASSWORD_ALPHABET: &[u8] = b"abcdefghijkmnpqrstuvwxyz23456789";
const PASSWORD_GROUPS: usize = 4;
const PASSWORD_GROUP_LENGTH: usize = 5;

/// What an invitation makes, shown to the administrator: the one thing they hand over, the
/// invitation link, beside the username and the ids the members list reads. The link carries the
/// secret that opens the vault once, inside it and nowhere else on this answer; no password
/// crosses on its own ([[rules/credentials]], *Client boundary*).
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Invited {
    pub member_id: String,
    pub invitation_id: String,
    /// the username the member signs in with, as the row seals it: what the inviter typed on an
    /// invitation, trimmed, and the one the row already carried on a reissue.
    pub username: String,
    /// the invitation link: the organization's own link with this invitation's half in it.
    pub join_link: String,
    pub expires_at: i64,
    /// on a reissue, the workspaces the member held that the reissuer could not re-seal, because
    /// the reissuer holds no full credential on them. Empty on a fresh invitation.
    pub unreachable_workspaces: Vec<UnreachableWorkspace>,
}

/// One workspace and the access held on it: what an invitation asks for, and what the members
/// list reports a member already holds. One pair, one type, because a second spelling of it
/// would be two places for the vocabulary of access to drift.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceGrant {
    pub id: String,
    pub access: AccessLevel,
}

/// A workspace a reset could not restore: the member waits on somebody who reaches it.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnreachableWorkspace {
    pub id: String,
    pub name: String,
}

/// Where an invitation stands, which is what a link opened against it is told.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum InvitationStanding {
    /// open, and a password opens it.
    Open,
    /// past its lifetime. The link still finds the organization; the invitation is what lapsed.
    Lapsed,
    /// already used to sign in once.
    Consumed,
}

impl InvitationStanding {
    pub fn of(invitation: &InvitationRecord, now: i64) -> Self {
        if invitation.consumed_at.is_some() {
            Self::Consumed
        } else if invitation.expires_at <= now {
            Self::Lapsed
        } else {
            Self::Open
        }
    }
}

/// The bounds a username fits: short enough for a row and a chip, long enough to be somebody.
pub const USERNAME_MINIMUM_LENGTH: usize = 3;
pub const USERNAME_MAXIMUM_LENGTH: usize = 32;

/// The one sentence a username outside the rules is refused with, here and by every form.
pub const USERNAME_RULES: &str = "a username is three to thirty-two characters of letters, digits, dots, underscores and hyphens";

/// The one sentence a username somebody else holds is refused with.
pub const USERNAME_TAKEN: &str = "that username is already taken in this organization";

/// Check a username against requirement 21's rules: three to thirty-two characters, each an
/// ASCII letter, a digit, `.`, `_` or `-`. The caller trims first; a space inside is refused
/// like any other character outside the set.
pub fn validate_username(username: &str) -> Result<(), Error> {
    let allowed = username
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'));
    let fits = (USERNAME_MINIMUM_LENGTH..=USERNAME_MAXIMUM_LENGTH).contains(&username.len());

    if !allowed || !fits {
        return Err(Error::InvalidInput {
            message: USERNAME_RULES.to_string(),
        });
    }

    Ok(())
}

/// Refuse a username another member already holds, compared without case: `alice` and `Alice`
/// are one username. Every member still in is opened under the caller's content key, because
/// usernames are sealed and nothing else can compare them; a removed member's is free again.
/// `except` is the member whose own row is not counted, which a rename needs so a member can
/// keep their username under another case; an invitation passes `None`.
pub async fn refuse_taken_username(
    store: &OrganizationStore,
    session: &MemberSession,
    username: &str,
    except: Option<&str>,
) -> Result<(), Error> {
    let wanted = username.to_lowercase();

    for member in store
        .members(&session.verifying_key)
        .await?
        .iter()
        .filter(|member| member.role != permission::REMOVED)
        .filter(|member| except != Some(member.id.as_str()))
    {
        let held = opened(session, "member.username_sealed", &member.username_sealed)?;

        if held.to_lowercase() == wanted {
            return Err(Error::InvalidInput {
                message: USERNAME_TAKEN.to_string(),
            });
        }
    }

    Ok(())
}

/// What the inviter is asked for.
#[derive(Clone, Debug)]
pub struct Invitation<'a> {
    pub username: &'a str,
    /// `packages/workspace-permission`'s vocabulary: `administrator` or `member`.
    pub role: &'a str,
    /// the workspaces the member belongs to, each at the access asked for: full access is the
    /// inviter's own credential re-sealed, read-only is minted on the owner's machine.
    pub workspaces: &'a [WorkspaceGrant],
}

/// Invite a member.
///
/// `link` is the organization's own locator, the one the first run produced, which the answer
/// hands back with the invitation's half in it; `platform` is the owner's machine's authority,
/// which a read-only grant is minted with and nothing else here needs; `kdf_params` is what the
/// member's vault is sealed at.
pub async fn invite_member<P: TursoPlatform>(
    store: &OrganizationStore,
    session: &MemberSession,
    platform: Option<&P>,
    link: &JoinLink,
    invitation: Invitation<'_>,
    kdf_params: KdfParams,
    now: i64,
) -> Result<Invited, Error> {
    session.settled()?;
    permission::require(session.permissions, Administration::InviteMember)?;

    let username = invitation.username.trim();

    validate_username(username)?;

    if invitation.role != permission::ADMINISTRATOR && invitation.role != permission::MEMBER {
        return Err(Error::InvalidInput {
            message: "a member is invited as an administrator or as a member".to_string(),
        });
    }

    refuse_taken_username(store, session, username, None).await?;

    let member_id = random_id()?;

    issue(
        store,
        session,
        platform,
        link,
        &member_id,
        username,
        invitation.role,
        permission::mask_of_role(invitation.role),
        invitation.workspaces,
        kdf_params,
        now,
    )
    .await
}

/// Invite a member again: a fresh vault under a fresh password, the content key and every grant
/// the reissuer can reach re-sealed to it, and a fresh invitation. The member's row keeps its id,
/// its username and its role.
///
/// **This is what a reset is** (requirement 13): no escrow copy of the old vault exists, so what
/// restores a member's access is building them a new one from what the reissuer already holds,
/// and a workspace the reissuer cannot reach is one the member waits on somebody who can.
pub async fn reissue_invitation<P: TursoPlatform>(
    store: &OrganizationStore,
    session: &MemberSession,
    platform: Option<&P>,
    link: &JoinLink,
    member_id: &str,
    kdf_params: KdfParams,
    now: i64,
) -> Result<Invited, Error> {
    session.settled()?;
    permission::require(session.permissions, Administration::ResetPassword)?;

    let members = store.members(&session.verifying_key).await?;
    let member = members
        .iter()
        .find(|member| member.id == member_id)
        .ok_or_else(|| Error::NotFound {
            message: "that member is not in this organization".to_string(),
        })?;

    if member.role == permission::OWNER {
        return Err(Error::Forbidden {
            message: "an owner is not reissued an invitation. their vault is theirs alone"
                .to_string(),
        });
    }

    if member.role == permission::REMOVED {
        return Err(Error::Forbidden {
            message: "that member was removed. invite them again if they are to come back"
                .to_string(),
        });
    }

    let username = opened(session, "member.username_sealed", &member.username_sealed)?;
    let role = member.role.clone();

    // what the member held, split by what the reissuer can seal again: a full-access grant on a
    // workspace the reissuer holds full access to is re-sealed to the fresh vault, a read-only
    // grant is minted again where the reissuer is the owner with the authority in hand, and the
    // rest are removed, because a grant sealed to a vault that is gone is a sign-in that fails,
    // and named in the answer so the member knows whom to wait on.
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
            AccessLevel::ReadOnly => session.role == permission::OWNER && platform.is_some(),
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
    // the reset link apart from a revoke of a person who never arrived.
    for stale in store
        .invitations(&session.verifying_key)
        .await?
        .into_iter()
        .filter(|invitation| invitation.member_id == member_id && invitation.consumed_at.is_none())
    {
        store.delete_invitation(&stale.id).await?;
    }

    let mut invited = issue(
        store,
        session,
        platform,
        link,
        member_id,
        &username,
        &role,
        member.permissions,
        &kept,
        kdf_params,
        now,
    )
    .await?;

    invited.unreachable_workspaces = unreachable_workspaces;

    Ok(invited)
}

/// Revoke an invitation, and with it what it made (effort 826, requirement 15): a person who
/// never opened their link is removed the ordinary way, so the link opens a vault holding nothing;
/// a reset link on a member who has signed in before is deleted alone, and their vault stays the
/// reset one until another reset. The act is the one that made the invitation, `inviteMember`.
pub async fn revoke_invitation(
    store: &OrganizationStore,
    session: &MemberSession,
    invitation_id: &str,
    now: i64,
) -> Result<(), Error> {
    session.settled()?;
    permission::require(session.permissions, Administration::InviteMember)?;

    let invitations = store.invitations(&session.verifying_key).await?;
    let invitation = invitations
        .iter()
        .find(|invitation| invitation.id == invitation_id)
        .ok_or_else(|| Error::NotFound {
            message: "that invitation is not in this organization".to_string(),
        })?;
    let member_id = invitation.member_id.clone();
    let members = store.members(&session.verifying_key).await?;
    let member = members.iter().find(|member| member.id == member_id);

    store.delete_invitation(invitation_id).await?;

    // never arrived: no invitation of theirs was ever consumed. The one just deleted was their
    // only way in, and the row it pointed at is taken back with it.
    let arrived = invitations
        .iter()
        .any(|other| other.member_id == member_id && other.consumed_at.is_some());
    let pending = member
        .filter(|member| member.role != permission::OWNER && member.role != permission::REMOVED)
        .filter(|_| !arrived);

    if let Some(member) = pending {
        removal::retire_member(store, session, member, now).await?;

        diagnostics::info("organization.member.removed")
            .with("member", member_id.as_str())
            .with("lockedOut", "false")
            .write();
    }

    if !store.push().await {
        diagnostics::warn("organization.invitation.revocationNotYetSent")
            .with("invitation", invitation_id)
            .write();
    }

    Ok(())
}

/// The invitation link again, for the person who issued it and nobody else: the secret is sealed
/// to the issuer's public key on the row, so the issuer's own vault is the one thing that opens
/// it. Anybody else holding the act is offered a fresh link instead, which is a reset.
pub async fn invitation_link(
    store: &OrganizationStore,
    session: &MemberSession,
    invitation_id: &str,
) -> Result<String, Error> {
    session.settled()?;
    permission::require(session.permissions, Administration::InviteMember)?;

    let invitations = store.invitations(&session.verifying_key).await?;
    let invitation = invitations
        .iter()
        .find(|invitation| invitation.id == invitation_id)
        .ok_or_else(|| Error::NotFound {
            message: "that invitation is not in this organization".to_string(),
        })?;

    if invitation.issued_by != session.member_id {
        return Err(Error::Forbidden {
            message: "only the person who issued an invitation can copy its link again. issue a \
                      new link instead"
                .to_string(),
        });
    }

    let secret = String::from_utf8(unseal_with_secret_key(
        &session.secret,
        &invitation.sealed_secret,
    )?)
    .map_err(|_| Error::Integrity {
        message: "the invitation's sealed secret did not open as text".to_string(),
    })?;

    organization_link(store, session)
        .await?
        .for_invitation(&invitation.id, &secret)
        .encode()
}

/// The invitation a member is still waiting on, where they are (effort 826, requirement 15): the
/// pending mark on their row, its expiry, and whether the person reading can hand the same link
/// over again.
///
/// **A member has at most one of these.** It is the invitation of theirs that nobody has spent:
/// a reset deletes the open one before it and issues another, and the consumed invitation a
/// member signed in with is history rather than a pending mark.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingInvitation {
    pub invitation_id: String,
    pub expires_at: i64,
    /// `open` or `lapsed`: a consumed invitation is not pending and is never reported here.
    pub standing: InvitationStanding,
    /// whether the caller issued it, which is whether the same link opens for them again
    /// ([`invitation_link`]). Anybody else holding the act is offered a fresh link instead.
    pub can_copy: bool,
}

/// One member as the members list draws them: the username opened with the content key, the
/// workspaces they hold with the access on each, and their pending invitation where they have
/// one. No key and no credential.
///
/// *`workspace_ids` was a list of ids until effort 826, and the invitations were a second list
/// read from a command of their own. One row of the list needs both, so the row is answered
/// whole here and `organization_invitations` is gone.*
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemberFacts {
    pub id: String,
    pub username: String,
    pub role: String,
    pub permissions: i64,
    pub workspaces: Vec<WorkspaceGrant>,
    pub pending: Option<PendingInvitation>,
    pub created_at: i64,
}

/// Every member, verified, with the username opened for the screen.
pub async fn members(
    store: &OrganizationStore,
    session: &MemberSession,
    now: i64,
) -> Result<Vec<MemberFacts>, Error> {
    let grants = store.grants(&session.verifying_key).await?;
    let invitations = store.invitations(&session.verifying_key).await?;

    store
        .members(&session.verifying_key)
        .await?
        .into_iter()
        // a removed member's row stays for the replicas that still hold it; the dashboard lists
        // who is in.
        .filter(|member| member.role != permission::REMOVED)
        .map(|member| {
            Ok(MemberFacts {
                username: opened(session, "member.username_sealed", &member.username_sealed)?,
                // the grant on the organization database itself is the directory every member
                // holds rather than a workspace anybody was given.
                workspaces: grants
                    .iter()
                    .filter(|grant| {
                        grant.member_id == member.id
                            && grant.workspace_id != session.organization_id
                    })
                    .map(|grant| WorkspaceGrant {
                        id: grant.workspace_id.clone(),
                        access: AccessLevel::parse(&grant.access_level)
                            .unwrap_or(AccessLevel::FullAccess),
                    })
                    .collect(),
                pending: invitations
                    .iter()
                    .find(|invitation| {
                        invitation.member_id == member.id && invitation.consumed_at.is_none()
                    })
                    .map(|invitation| PendingInvitation {
                        invitation_id: invitation.id.clone(),
                        expires_at: invitation.expires_at,
                        standing: InvitationStanding::of(invitation, now),
                        can_copy: invitation.issued_by == session.member_id,
                    }),
                id: member.id,
                role: member.role,
                permissions: member.permissions,
                created_at: member.created_at,
            })
        })
        .collect()
}

/// Rename a member: their row written back with the username re-sealed under the content key,
/// signed by whoever renamed them, and pushed like every other write (effort 824, requirement
/// 23). The act is [`Administration::RenameMember`], which requirement 4 of effort 826 gave a bit
/// of its own: it was held to inviting while the two were one decision, and an organization may
/// want somebody who corrects a spelling without being able to make an account. Nothing else on
/// the row moves: the vault, the role, the grants and the certificate are exactly as they were, so
/// a member renamed while signed in elsewhere goes on working under their own password.
///
/// A session renaming its own row is refused: an account's name is given by an administrator and
/// changed by one, never by its holder, which is what keeps the rename an act on somebody else's
/// row and the actor's signature meaningful as such. `except` on the uniqueness check is the
/// member's own id, so `alice` may become `Alice` without being refused as taken by herself.
pub async fn rename_member(
    store: &OrganizationStore,
    session: &MemberSession,
    member_id: &str,
    username: &str,
    now: i64,
) -> Result<MemberFacts, Error> {
    session.settled()?;
    permission::require(session.permissions, Administration::RenameMember)?;

    if member_id == session.member_id {
        return Err(Error::Forbidden {
            message: "you cannot rename yourself. another administrator can".to_string(),
        });
    }

    let username = username.trim();

    validate_username(username)?;

    let rows = store.members(&session.verifying_key).await?;
    let member = rows
        .iter()
        .find(|member| member.id == member_id)
        .ok_or_else(|| Error::NotFound {
            message: "that member is not in this organization".to_string(),
        })?;

    if member.role == permission::REMOVED {
        return Err(Error::PreconditionFailed {
            message: "that member was removed. invite them again if they are to come back"
                .to_string(),
        });
    }

    refuse_taken_username(store, session, username, Some(member_id)).await?;

    let (key, certificate) = signer_of(store, session).await?;
    let signer = Signer {
        key: &key,
        certificate: &certificate,
    };

    store
        .write_member(
            &signer,
            &MemberRecord {
                username_sealed: seal_content(
                    &session.content_key,
                    "member.username_sealed",
                    username.as_bytes(),
                )?,
                updated_at: now,
                ..member.clone()
            },
        )
        .await?;

    if !store.push().await {
        diagnostics::warn("organization.member.renameNotYetSent")
            .with("member", member_id)
            .write();
    }

    diagnostics::info("organization.member.renamed")
        .with("member", member_id)
        .write();

    // read back through the same routine the list draws from, so what the caller is handed is
    // what the members list will show.
    members(store, session, now)
        .await?
        .into_iter()
        .find(|member| member.id == member_id)
        .ok_or_else(|| Error::Integrity {
            message: "the renamed member's row did not read back".to_string(),
        })
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

/// What every invitation and every reset writes. `permissions` is written as given rather than
/// derived from the role, so a reset keeps a widened member widened (requirement 6); a fresh
/// invitation passes the role's own mask.
#[allow(clippy::too_many_arguments)]
async fn issue<P: TursoPlatform>(
    store: &OrganizationStore,
    session: &MemberSession,
    platform: Option<&P>,
    link: &JoinLink,
    member_id: &str,
    username: &str,
    role: &str,
    permissions: i64,
    workspaces: &[WorkspaceGrant],
    kdf_params: KdfParams,
    now: i64,
) -> Result<Invited, Error> {
    let (key, certificate) = signer_of(store, session).await?;
    let signer = Signer {
        key: &key,
        certificate: &certificate,
    };

    // a read-only grant is minted, and minting is the owner's machine's: refused by name before
    // anything is written, so an invitation never quietly grants less than it was asked to.
    if workspaces
        .iter()
        .any(|workspace| workspace.access == AccessLevel::ReadOnly)
    {
        if session.role != permission::OWNER {
            return Err(Error::Forbidden {
                message: "a read-only grant is minted on the owner's machine. ask the owner, or \
                          invite with full access"
                    .to_string(),
            });
        }

        if platform.is_none() {
            return Err(Error::Forbidden {
                message: "a read-only grant is minted with the turso authority, which this \
                          machine does not hold. connect the account again, or invite with full \
                          access"
                    .to_string(),
            });
        }
    }

    // the member's vault, under a password only the invitation link will ever carry, and which
    // opening the link replaces with one the member chose.
    let generated_password = generate_password()?;
    let (vault, secret) = create_vault_with_secret(&generated_password, kdf_params)?;

    // the key this member will sign rows with, derived from the secret just drawn. Its verifying
    // half goes on the row whatever the role is, because this is the one moment the secret is in
    // hand: an owner widening them into a signing act later has the key to certify and no way to
    // derive it themselves (effort 826, requirement 6).
    let administrator_key =
        AdministratorKey::from_bytes(&secret.derive_seed(ADMINISTRATOR_KEY_PURPOSE)?);

    // an administrator's certificate needs the organization key, which only the owner's vault
    // yields.
    if role == permission::ADMINISTRATOR {
        if session.role != permission::OWNER {
            return Err(Error::Forbidden {
                message:
                    "only an owner invites an administrator, because certifying one needs the \
                          organization key. ask the owner"
                        .to_string(),
            });
        }

        let organization_key =
            OrganizationKey::from_bytes(&session.secret.derive_seed(ORGANIZATION_KEY_PURPOSE)?);

        // a reset draws a fresh vault secret, so `administrator_key` differs from the one this
        // member's old certificate names, and the certificate about to replace it carries the new
        // key. Every row the old certificate signed would then fail verification. Re-sign them
        // first, under the resetter (an owner, who holds authority over all of them), so the
        // replacement bricks nothing (`store::re_sign_rows_of_certificate`). A fresh invitation of
        // a new administrator has no rows under this id and this moves nothing.
        store
            .re_sign_rows_of_certificate(
                &session.verifying_key,
                &format!("cert-{member_id}"),
                &signer,
            )
            .await?;

        store
            .write_certificate(&issue_certificate(
                &organization_key,
                &format!("cert-{member_id}"),
                member_id,
                &administrator_key.verifying_key(),
                &now.to_string(),
            ))
            .await?;
    }

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
                signing_public_key: administrator_key.verifying_key(),
                role: role.to_string(),
                permissions,
                must_change_password: true,
                created_at: now,
                updated_at: now,
                // a fresh row starts at the first epoch; only an end-of-sessions moves it.
                session_epoch: 0,
            },
        )
        .await?;

    // the directory: the inviter's own credential on the organization database, re-sealed.
    let organization_credential = session
        .organization_credential
        .lock()
        .ok()
        .and_then(|slot| slot.clone())
        .ok_or_else(|| Error::PreconditionFailed {
            message: "this machine holds no credential to the organization database to hand on"
                .to_string(),
        })?;

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

    // the workspaces: full access is what the inviter reaches, re-sealed, and one they do not is
    // refused by name rather than skipped, so an invitation never quietly grants less than it was
    // asked to; read-only is minted, on the owner's machine, as `workspace::grant_workspace` mints
    // one.
    let known = store.workspaces(&session.verifying_key).await?;

    for workspace in workspaces {
        let credential = match workspace.access {
            AccessLevel::FullAccess => session
                .workspace_credentials
                .get(&workspace.id)
                .filter(|held| held.access == AccessLevel::FullAccess)
                .map(|held| held.token.clone())
                .ok_or_else(|| Error::Forbidden {
                    message: "you can invite into a workspace you hold full access to yourself, \
                              and no other"
                        .to_string(),
                })?,
            AccessLevel::ReadOnly => {
                let database = known
                    .iter()
                    .find(|known| known.id == workspace.id)
                    .map(|known| known.database_name.clone())
                    .ok_or_else(|| Error::NotFound {
                        message: "that workspace is not in this organization".to_string(),
                    })?;
                let platform = platform.ok_or_else(|| Error::Forbidden {
                    message: "a read-only grant is minted on the owner's machine. ask the owner"
                        .to_string(),
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
                    credential_expires_at: credential_expiry(&credential),
                },
            )
            .await?;
    }

    // the invitation: the pending account's expiry, naming the member whose first sign-in spends
    // it, the generated password sealed to the issuer, and who the issuer was.
    //
    // **The secret is sealed to the issuer's own public key and to nobody else's.** It is what
    // lets them hand the same link over twice; anybody else holding the act is offered a fresh
    // link, which is a reset. Sealing it under the content key instead would put it within reach
    // of every member, and a member who opened a pending colleague's vault would hold that
    // colleague's grants, which may reach workspaces the member does not. Neither column is under
    // the signature: a tampered seal opens for nobody and a tampered issuer misplaces a copy
    // control, so neither is worth a preimage.
    let invitation_id = random_id()?;
    let expires_at = now + INVITATION_LIFETIME_MS;

    store
        .write_invitation(
            &signer,
            &InvitationRecord {
                id: invitation_id.clone(),
                member_id: member_id.to_string(),
                expires_at,
                consumed_at: None,
                sealed_secret: seal_to_public_key(
                    &session.secret.public_key(),
                    generated_password.as_bytes(),
                )?,
                issued_by: session.member_id.clone(),
                created_at: now,
            },
        )
        .await?;

    if !store.push().await {
        diagnostics::warn("organization.invitation.notYetSent")
            .with("invitation", invitation_id.as_str())
            .write();
    }

    diagnostics::info("organization.invitation.issued")
        .with("member", member_id)
        .with("role", role)
        .write();

    // the one thing handed over: the organization's link with this invitation's half in it. The
    // generated password leaves this function inside it and in the sealed column, and nowhere else.
    let join_link = link
        .for_invitation(&invitation_id, &generated_password)
        .encode()?;

    Ok(Invited {
        member_id: member_id.to_string(),
        invitation_id,
        username: username.to_string(),
        join_link,
        expires_at,
        unreachable_workspaces: Vec::new(),
    })
}

fn opened(session: &MemberSession, column: &str, sealed: &[u8]) -> Result<String, Error> {
    String::from_utf8(open_content(&session.content_key, column, sealed)?).map_err(|_| {
        Error::Integrity {
            message: format!("{column} did not open as text"),
        }
    })
}

fn random_id() -> Result<String, Error> {
    let mut bytes = [0_u8; 16];

    getrandom::fill(&mut bytes).map_err(|error| Error::Internal {
        message: format!("failed to draw an id: {error}"),
    })?;

    Ok(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
}

/// The shipping cost a member's vault is sealed at when they are invited, the same as the owner's.
pub const INVITED_KDF: KdfParams = SHIPPING_KDF;

/// The organization's own locator, rebuilt from what the replica holds: the link every invitation
/// is made from. The read-only credential it carries is sealed under the content key on the
/// organization row, so any member whose vault is open can make a link and nobody holding the
/// database alone can read it.
pub async fn organization_link(
    store: &OrganizationStore,
    session: &MemberSession,
) -> Result<JoinLink, Error> {
    let organization = store
        .organization()
        .await?
        .ok_or_else(|| Error::Integrity {
            message: "the organization replica holds no organization row".to_string(),
        })?;
    let name = opened(
        session,
        "organization.name_sealed",
        &organization.name_sealed,
    )?;
    let credential = opened(
        session,
        "organization.link_credential_sealed",
        &organization.link_credential_sealed,
    )?;

    Ok(JoinLink::new(
        &organization.id,
        &name,
        &session.verifying_key,
        &organization.remote_url,
        &credential,
    ))
}

/// The organization's own join link, rebuilt from the stored rows for the owner to share or keep.
///
/// The read-only credential it carries is stored sealed under the content key at setup, so this
/// needs the owner's open vault and not the Turso authority, which a restored owner does not hold
/// (requirement 6). It is the owner's: a member is refused, because the link opens a read-only view
/// of the directory to whoever holds it and handing that out is the owner's to do.
pub(crate) async fn own_link(
    member: &MemberSession,
    store: &OrganizationStore,
) -> Result<String, Error> {
    member.settled()?;

    if member.role != permission::OWNER {
        return Err(Error::Forbidden {
            message: "the organization's own link is the owner's to share".to_string(),
        });
    }

    let organization = store.organization().await?.ok_or_else(|| Error::NotFound {
        message: "this machine holds no organization".to_string(),
    })?;
    let name = opened(
        member,
        "organization.name_sealed",
        &organization.name_sealed,
    )?;
    let credential = opened(
        member,
        "organization.link_credential_sealed",
        &organization.link_credential_sealed,
    )?;

    JoinLink::new(
        &member.organization_id,
        &name,
        &member.verifying_key,
        &organization.remote_url,
        &credential,
    )
    .encode()
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use serde_json::json;

    use super::{
        INVITATION_LIFETIME_MS, Invitation, InvitationStanding, Invited, USERNAME_RULES,
        USERNAME_TAKEN, WorkspaceGrant, generate_password, invitation_link, invite_member,
        organization_link, reissue_invitation, rename_member, revoke_invitation, validate_username,
    };
    use crate::{
        error::Error,
        organization::{
            HeldOrganization,
            link::JoinLink,
            migrate::Pipeline,
            permission,
            session::{CredentialSlot, MemberSession, sign_in, sign_in_by_username},
            setup::{CreateOrganization, Remote, create_organization},
            store::{OrganizationStore, Signer},
            vault::KdfParams,
            workspace::create_workspace,
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

    const PASSWORD: &str = "the owners password";

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

    fn scratch(name: &str) -> std::path::PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|elapsed| elapsed.as_nanos())
            .unwrap_or_default();
        let directory = std::env::temp_dir().join(format!("rentable-invite-{name}-{nanos:x}"));
        std::fs::create_dir_all(&directory).expect("scratch directory");

        directory
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

    /// The secret inside an invitation link: the generated password the vault was sealed under.
    fn secret_of(invited: &Invited) -> String {
        JoinLink::decode(&invited.join_link)
            .expect("the invitation link")
            .invitation
            .expect("the invitation half")
            .secret
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
            member_id: Some(member_id.to_string()),
            role: Some(role.to_string()),
            joined_at: 0,
        }
    }

    /// An organization with its owner signed in and one workspace, on a fake account.
    async fn owned(
        directory: &std::path::Path,
    ) -> (
        OrganizationStore,
        MemberSession,
        JoinLink,
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
            },
            test_cost(),
            1_757_000_000_000,
        )
        .await
        .expect("the first run failed");
        let joined = store.organization.clone().expect("the record");
        let mut owner = sign_in(&organization, &joined, PASSWORD, &slot())
            .await
            .expect("the owner did not sign in");
        let pipeline = ScriptedServer::start(vec![ScriptedResponse::new(
            200,
            json!({ "results": [] }).to_string(),
        )])
        .await;
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
        let link = organization_link(&organization, &owner)
            .await
            .expect("the organization's link");

        assert_eq!(
            JoinLink::decode(&created.join_link).expect("the first run's link"),
            link,
            "the link rebuilt from the replica is the one the first run produced"
        );

        (organization, owner, link, workspace.id, platform)
    }

    /// What an invitation hands the inviter: one link, the organization's own with the invitation's
    /// half in it, whose secret is the generated password and is spelled nowhere else on the
    /// answer; the username as the row seals it; and what it writes: a member row the secret
    /// opens, and an invitation row naming that member with the secret sealed to the issuer.
    #[tokio::test]
    async fn an_invitation_makes_a_member_and_one_link_carrying_the_secret() {
        let directory = scratch("invite");
        let (store, owner, link, workspace_id, _) = owned(&directory).await;
        let workspaces = vec![workspace_id.clone()];

        let invited = invite_member(
            &store,
            &owner,
            no_platform(),
            &link,
            Invitation {
                username: " sami.staff ",
                role: permission::MEMBER,
                workspaces: &full(&workspaces),
            },
            test_cost(),
            1_757_000_000_000,
        )
        .await
        .expect("the invitation failed");

        assert_eq!(
            invited.expires_at,
            1_757_000_000_000 + INVITATION_LIFETIME_MS
        );

        // the link is the organization's own with the invitation's half in it: it carries the
        // organization and its name, the invitation's id and the secret, and no username.
        let decoded = JoinLink::decode(&invited.join_link).expect("the link decodes");
        let half = decoded.invitation_half().expect("the invitation half");

        assert_eq!(
            JoinLink {
                invitation: None,
                ..decoded.clone()
            },
            link
        );
        assert_eq!(decoded.organization_name, "Acme");
        assert_eq!(half.id, invited.invitation_id);
        assert_eq!(half.secret.len(), 23, "{}", half.secret);
        assert!(!invited.join_link.contains("sami"));
        assert_eq!(invited.username, "sami.staff", "the username, trimmed");

        // the invitation row names the member, the issuer, and the secret sealed to the issuer's
        // key and to nobody else's: the owner opens it, and it is the secret in the link.
        let rows = store
            .invitations(&owner.verifying_key)
            .await
            .expect("the rows");
        let row = rows
            .iter()
            .find(|row| row.id == invited.invitation_id)
            .expect("the invitation row");

        assert_eq!(row.member_id, invited.member_id);
        assert_eq!(row.expires_at, invited.expires_at);
        assert_eq!(row.consumed_at, None);
        assert_eq!(row.issued_by, owner.member_id);
        assert_eq!(
            crate::organization::vault::unseal_with_secret_key(&owner.secret, &row.sealed_secret)
                .expect("the owner opens the sealed secret"),
            half.secret.as_bytes()
        );

        // the member's vault opens with the secret and with nothing else yet, the row says the
        // password is still to be chosen, and the vault holds the directory and the workspace
        // the inviter held.
        let member = sign_in(
            &store,
            &joined_as(&owner, &invited.member_id, permission::MEMBER),
            &secret_of(&invited),
            &slot(),
        )
        .await
        .expect("the member did not sign in");

        assert!(member.must_change_password);
        assert_eq!(member.role, permission::MEMBER);
        assert_eq!(member.permissions, 0);
        assert!(member.workspace_credentials.contains_key(&workspace_id));
        assert_eq!(
            member.workspace_credentials[&workspace_id].token,
            owner.workspace_credentials[&workspace_id].token
        );
        assert_eq!(
            member
                .organization_credential
                .lock()
                .expect("the slot")
                .as_deref(),
            owner
                .organization_credential
                .lock()
                .expect("the slot")
                .as_deref()
        );
    }

    /// **The generated password is not derived from the username**, asserted rather than merely
    /// different: two invitations whose usernames differ by one character draw passwords that
    /// share nothing, and no part of either username appears in either password. Two draws with
    /// identical inputs cannot be made through an invitation any more, because the second username
    /// would be taken, so the alphabet and the draw are asserted on the generator itself.
    #[tokio::test]
    async fn the_generated_password_is_drawn_and_not_derived() {
        let directory = scratch("password");
        let (store, owner, link, _, _) = owned(&directory).await;
        let invite = |username: &'static str| {
            let store = &store;
            let owner = &owner;
            let link = &link;

            async move {
                let invited = invite_member(
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

    /// Requirement 23, and effort 826's requirement 15: the invitation lapses and the link does
    /// not; revoking a person who never opened their link takes them back with it, grants and
    /// all; reissuing makes a fresh vault under a fresh secret with the old one dead, and hands a
    /// fresh link over the same organization.
    #[tokio::test]
    async fn an_invitation_lapses_is_revocable_and_is_reissuable_while_the_link_stands() {
        let directory = scratch("lifetime");
        let (store, owner, link, workspace_id, _) = owned(&directory).await;
        let workspaces = vec![workspace_id.clone()];
        let issued_at = 1_757_000_000_000;
        let invite = |username: &'static str, now: i64| {
            let store = &store;
            let owner = &owner;
            let link = &link;
            let workspaces = &workspaces;

            async move {
                invite_member(
                    store,
                    owner,
                    no_platform(),
                    link,
                    Invitation {
                        username,
                        role: permission::MEMBER,
                        workspaces: &full(workspaces),
                    },
                    test_cost(),
                    now,
                )
                .await
                .expect("the invitation failed")
            }
        };
        let invited = invite("sami", issued_at).await;

        // where the invitation stands is read off the member's row, which is the only place it is
        // reported from since effort 826 folded the invitation list into the members list.
        let standing = |now: i64| {
            let store = &store;
            let owner = &owner;

            async move {
                super::members(store, owner, now)
                    .await
                    .expect("the list")
                    .into_iter()
                    .filter_map(|member| member.pending)
                    .map(|pending| pending.standing)
                    .collect::<Vec<_>>()
            }
        };

        assert_eq!(
            standing(issued_at + 1).await,
            vec![InvitationStanding::Open]
        );
        assert_eq!(
            standing(issued_at + INVITATION_LIFETIME_MS).await,
            vec![InvitationStanding::Lapsed]
        );

        // the link still finds the organization by name, whatever the invitation's standing.
        let decoded = JoinLink::decode(&invited.join_link).expect("the link decodes");

        assert_eq!(decoded.organization_name, "Acme");

        // revoked: the row is gone, and so is the person who never arrived. Their row is signed
        // as removed, their grants are gone, and the secret opens a vault that grants nothing.
        revoke_invitation(&store, &owner, &invited.invitation_id, issued_at + 5)
            .await
            .expect("the revocation failed");

        assert!(standing(issued_at + 1).await.is_empty());
        assert!(
            revoke_invitation(&store, &owner, &invited.invitation_id, issued_at + 5)
                .await
                .is_err(),
            "a revoked invitation was revoked again"
        );

        let listed = super::members(&store, &owner, NOW)
            .await
            .expect("the members");

        assert!(
            !listed.iter().any(|member| member.id == invited.member_id),
            "the revoked person is still listed"
        );

        let refused = sign_in(
            &store,
            &joined_as(&owner, &invited.member_id, permission::MEMBER),
            &secret_of(&invited),
            &slot(),
        )
        .await
        .expect_err("the revoked person's secret still opens a place");

        assert!(refused.to_string().contains("removed"), "{refused}");
        assert!(
            store
                .grants(&owner.verifying_key)
                .await
                .expect("the grants")
                .iter()
                .all(|grant| grant.member_id != invited.member_id),
            "a grant survived the revoke"
        );

        // reissued, for a member who is in: a fresh secret opens the vault, the old one does not,
        // the workspace the reissuer holds is re-sealed to the fresh vault, and the link is a
        // fresh one over the same organization.
        let bob = invite("bob", issued_at + 6).await;
        let reissued = reissue_invitation(
            &store,
            &owner,
            no_platform(),
            &link,
            &bob.member_id,
            test_cost(),
            issued_at + 10,
        )
        .await
        .expect("the reissue failed");
        let fresh = JoinLink::decode(&reissued.join_link).expect("the fresh link");

        assert_eq!(reissued.member_id, bob.member_id);
        assert_eq!(reissued.username, "bob", "a reissue keeps the username");
        assert_eq!(
            JoinLink {
                invitation: None,
                ..fresh.clone()
            },
            link,
            "a reissue hands a link over the same organization"
        );
        assert_ne!(secret_of(&reissued), secret_of(&bob));
        assert_ne!(reissued.invitation_id, bob.invitation_id);
        assert_eq!(
            fresh.invitation_half().map(|half| half.id.as_str()),
            Some(reissued.invitation_id.as_str())
        );

        let joined = joined_as(&owner, &bob.member_id, permission::MEMBER);

        assert!(
            sign_in(&store, &joined, &secret_of(&bob), &slot())
                .await
                .is_err(),
            "the old secret still opens the vault"
        );

        let member = sign_in(&store, &joined, &secret_of(&reissued), &slot())
            .await
            .expect("the fresh secret did not open the vault");

        assert!(member.workspace_credentials.contains_key(&workspace_id));
        assert_eq!(
            standing(issued_at + 11).await,
            vec![InvitationStanding::Open]
        );
    }

    /// Effort 826, requirement 6 at the reset: `issue` writes the permissions it is given, so a
    /// member whose row was widened past their role's mask is reset with the widening kept, and a
    /// fresh invitation writes the role's own mask.
    #[tokio::test]
    async fn a_reset_keeps_a_widened_members_permissions_and_a_fresh_invitation_writes_the_roles() {
        let directory = scratch("widened");
        let (store, owner, link, _, _) = owned(&directory).await;
        let invited = invite_member(
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
            super::members(&store, &owner, NOW)
                .await
                .expect("the members")
                .into_iter()
                .find(|member| member.id == invited.member_id)
                .expect("the member")
                .permissions,
            permission::mask_of_role(permission::MEMBER),
            "a fresh invitation wrote something other than the role's mask"
        );

        // widened by hand, the way the change-role act will widen a row: one act past the role.
        let widened = permission::mask_of(&[permission::Administration::RenameWorkspace]);
        let (key, certificate) = super::signer_of(&store, &owner).await.expect("the signer");
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
                    permissions: widened,
                    ..row
                },
            )
            .await
            .expect("widened");

        let reset = reissue_invitation(
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

        assert_eq!(after.permissions, widened, "the reset narrowed the member");
        assert_eq!(after.role, permission::MEMBER);
    }

    /// Effort 826, requirement 5 at the invitation: a read-only grant is minted, so it is the
    /// owner's with the authority in hand. The owner with a platform invites into a workspace at
    /// read-only and the grant says so; the owner without one, and an administrator holding every
    /// act, are each refused by name before anything is written.
    #[tokio::test]
    async fn a_read_only_invitation_is_minted_on_the_owners_machine_and_refused_elsewhere() {
        let directory = scratch("read-only");
        let (store, owner, link, workspace_id, platform) = owned(&directory).await;
        let read_only = vec![WorkspaceGrant {
            id: workspace_id.clone(),
            access: AccessLevel::ReadOnly,
        }];

        let invited = invite_member(
            &store,
            &owner,
            Some(&*platform),
            &link,
            Invitation {
                username: "reader",
                role: permission::MEMBER,
                workspaces: &read_only,
            },
            test_cost(),
            1,
        )
        .await
        .expect("the owner could not invite at read-only");
        let reader = sign_in(
            &store,
            &joined_as(&owner, &invited.member_id, permission::MEMBER),
            &secret_of(&invited),
            &slot(),
        )
        .await
        .expect("the reader did not sign in");

        assert_eq!(
            reader.workspace_credentials[&workspace_id].access,
            AccessLevel::ReadOnly
        );
        assert_ne!(
            reader.workspace_credentials[&workspace_id].token,
            owner.workspace_credentials[&workspace_id].token,
            "a read-only grant re-sealed the owner's full credential"
        );

        let refused = invite_member(
            &store,
            &owner,
            no_platform(),
            &link,
            Invitation {
                username: "reader2",
                role: permission::MEMBER,
                workspaces: &read_only,
            },
            test_cost(),
            2,
        )
        .await
        .expect_err("an owner without the authority minted");

        assert!(refused.to_string().contains("authority"), "{refused}");

        let admin = invite_member(
            &store,
            &owner,
            no_platform(),
            &link,
            Invitation {
                username: "ada.admin",
                role: permission::ADMINISTRATOR,
                workspaces: &full(std::slice::from_ref(&workspace_id)),
            },
            test_cost(),
            3,
        )
        .await
        .expect("the administrator");
        let mut ada = sign_in(
            &store,
            &joined_as(&owner, &admin.member_id, permission::ADMINISTRATOR),
            &secret_of(&admin),
            &slot(),
        )
        .await
        .expect("the administrator did not sign in");
        ada.must_change_password = false;

        let refused = invite_member(
            &store,
            &ada,
            Some(&*platform),
            &link,
            Invitation {
                username: "reader3",
                role: permission::MEMBER,
                workspaces: &read_only,
            },
            test_cost(),
            4,
        )
        .await
        .expect_err("an administrator minted a read-only grant");

        assert!(refused.to_string().contains("owner"), "{refused}");

        let usernames: Vec<String> = super::members(&store, &owner, NOW)
            .await
            .expect("the members")
            .into_iter()
            .map(|member| member.username)
            .collect();

        assert!(!usernames.iter().any(|name| name.starts_with("reader2")));
        assert!(!usernames.iter().any(|name| name.starts_with("reader3")));
    }

    /// Effort 826, requirement 8: the issuer copies the link again, and it is the same link; an
    /// administrator who did not issue it is refused, and offered nothing but a new link.
    #[tokio::test]
    async fn the_issuer_copies_the_link_again_and_nobody_else_can() {
        let directory = scratch("copy-link");
        let (store, owner, link, _, _) = owned(&directory).await;
        let invited = invite_member(
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

        let again = invitation_link(&store, &owner, &invited.invitation_id)
            .await
            .expect("the issuer could not copy the link");

        assert_eq!(again, invited.join_link);

        let admin = invite_member(
            &store,
            &owner,
            no_platform(),
            &link,
            Invitation {
                username: "ada.admin",
                role: permission::ADMINISTRATOR,
                workspaces: &[],
            },
            test_cost(),
            2,
        )
        .await
        .expect("the administrator");
        let mut ada = sign_in(
            &store,
            &joined_as(&owner, &admin.member_id, permission::ADMINISTRATOR),
            &secret_of(&admin),
            &slot(),
        )
        .await
        .expect("the administrator did not sign in");
        ada.must_change_password = false;

        let refused = invitation_link(&store, &ada, &invited.invitation_id)
            .await
            .expect_err("somebody other than the issuer copied the link");

        assert!(matches!(refused, Error::Forbidden { .. }), "{refused:?}");
        assert!(refused.to_string().contains("new link"), "{refused}");
        assert!(
            matches!(
                invitation_link(&store, &owner, "nobody").await,
                Err(Error::NotFound { .. })
            ),
            "an invitation that is not there was copied"
        );
    }

    /// Effort 826, requirement 15's other half: revoking a reset link on a member who has opened a
    /// link before deletes the row alone. The member is still in, listed, and their vault is the
    /// reset one, which opens on nothing until another reset.
    #[tokio::test]
    async fn revoking_a_reset_link_deletes_the_row_alone_and_keeps_the_member() {
        let directory = scratch("revoke-reset");
        let (store, owner, link, _, _) = owned(&directory).await;
        let invited = invite_member(
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

        // the member opens their link once, on a machine of their own.
        let theirs = scratch("revoke-reset-machine");
        let mut machine = Persisted::<RemoteSyncStore>::load(theirs.join("remote-sync.json"))
            .expect("the machine");
        let held = HeldOrganization {
            member_id: None,
            role: None,
            ..joined_as(&owner, &invited.member_id, permission::MEMBER)
        };
        let opened = crate::organization::join::accept(
            &store,
            &mut machine,
            &held,
            &JoinLink::decode(&invited.join_link).expect("the link"),
            "a password sami chose",
            &slot(),
            test_cost(),
            2,
        )
        .await
        .expect("the member could not open their link");

        assert!(!opened.must_change_password);

        let reset = reissue_invitation(
            &store,
            &owner,
            no_platform(),
            &link,
            &invited.member_id,
            test_cost(),
            3,
        )
        .await
        .expect("the reset failed");

        revoke_invitation(&store, &owner, &reset.invitation_id, 4)
            .await
            .expect("the revoke failed");

        let listed = super::members(&store, &owner, NOW)
            .await
            .expect("the members");

        assert!(
            listed.iter().any(|member| member.id == invited.member_id),
            "revoking a reset link removed the member"
        );
        assert!(
            listed.iter().all(|member| member
                .pending
                .as_ref()
                .is_none_or(|pending| pending.invitation_id != reset.invitation_id)),
            "the reset link's row stayed"
        );

        // the vault is the reset one, and the wall refuses its secret: whoever types it decoded
        // a link, and this one was revoked.
        let joined = joined_as(&owner, &invited.member_id, permission::MEMBER);

        assert!(
            sign_in_by_username(&store, &joined, "sami", &secret_of(&reset), &slot())
                .await
                .is_err(),
            "the revoked reset link's secret still opens a place at the wall"
        );
        assert!(
            sign_in_by_username(&store, &joined, "sami", "a password sami chose", &slot())
                .await
                .is_err(),
            "the password from before the reset still opens the vault"
        );
    }

    /// Criterion 1: **resetting an administrator leaves every row they signed still verifiable,
    /// and everyone can still sign in.** The owner resets an administrator who has invited a member
    /// and holds a workspace; the reset draws a fresh vault secret and replaces the certificate,
    /// and without the re-signing that precedes it every row the old certificate signed would fail
    /// verification and refuse the whole read (F1). Afterwards the owner, the reset administrator
    /// under the new password, and the member all sign in, and members, grants and invitations all
    /// read without a refusal.
    #[tokio::test]
    async fn resetting_an_administrator_leaves_every_row_verifiable_and_everyone_signs_in() {
        let directory = scratch("admin-reset");
        let (store, owner, link, workspace_id, _) = owned(&directory).await;

        let admin = invite_member(
            &store,
            &owner,
            no_platform(),
            &link,
            Invitation {
                username: "ada.admin",
                role: permission::ADMINISTRATOR,
                workspaces: &full(std::slice::from_ref(&workspace_id)),
            },
            test_cost(),
            1,
        )
        .await
        .expect("the administrator");

        // the administrator signs in, settles, and invites a member into the workspace: their
        // certificate now signs a member row, grants and an invitation.
        let mut ada = sign_in(
            &store,
            &joined_as(&owner, &admin.member_id, permission::ADMINISTRATOR),
            &secret_of(&admin),
            &slot(),
        )
        .await
        .expect("the administrator did not sign in");
        ada.must_change_password = false;

        let bob = invite_member(
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

        // the owner resets the administrator: their certificate is replaced with one over a key
        // derived from a fresh vault secret.
        let reset = reissue_invitation(
            &store,
            &owner,
            no_platform(),
            &link,
            &admin.member_id,
            test_cost(),
            3,
        )
        .await
        .expect("the reset failed");

        assert_ne!(secret_of(&reset), secret_of(&admin));

        // F1: every read stands.
        assert!(
            store.members(&owner.verifying_key).await.is_ok(),
            "resetting an administrator bricked the members read"
        );
        assert!(
            store.grants(&owner.verifying_key).await.is_ok(),
            "resetting an administrator bricked the grants read"
        );
        assert!(
            store.invitations(&owner.verifying_key).await.is_ok(),
            "resetting an administrator bricked the invitations read"
        );

        // everyone signs in: the owner, the reset administrator under the new password, the member.
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
            &joined_as(&owner, &admin.member_id, permission::ADMINISTRATOR),
            &secret_of(&reset),
            &slot(),
        )
        .await
        .expect("the reset administrator did not sign in under the new password");

        assert!(ada_again.must_change_password);
        assert!(
            ada_again.workspace_credentials.contains_key(&workspace_id),
            "the reset administrator lost the workspace they held"
        );

        let bob_again = sign_in(
            &store,
            &joined_as(&owner, &bob.member_id, permission::MEMBER),
            &secret_of(&bob),
            &slot(),
        )
        .await
        .expect("the member the administrator invited can no longer sign in");

        assert!(bob_again.workspace_credentials.contains_key(&workspace_id));

        // and the old password no longer opens the reset administrator's vault.
        assert!(
            sign_in(
                &store,
                &joined_as(&owner, &admin.member_id, permission::ADMINISTRATOR),
                &secret_of(&admin),
                &slot(),
            )
            .await
            .is_err(),
            "the old password still opens the reset administrator's vault"
        );
    }

    /// Who may invite whom: an owner invites an administrator, who then invites a member; an
    /// administrator does not invite an administrator; a member invites nobody.
    #[tokio::test]
    async fn administration_is_what_the_row_carries_and_the_organization_key_is_the_owners() {
        let directory = scratch("roles");
        let (store, owner, link, _, _) = owned(&directory).await;

        let administrator = invite_member(
            &store,
            &owner,
            no_platform(),
            &link,
            Invitation {
                username: "ada.admin",
                role: permission::ADMINISTRATOR,
                workspaces: &[],
            },
            test_cost(),
            1,
        )
        .await
        .expect("the owner could not invite an administrator");

        // a certificate exists for them, under the organization key.
        let certificates = store.certificates().await.expect("the certificates");

        assert!(
            certificates
                .iter()
                .any(|certificate| certificate.member_id == administrator.member_id)
        );

        let ada = sign_in(
            &store,
            &joined_as(&owner, &administrator.member_id, permission::ADMINISTRATOR),
            &secret_of(&administrator),
            &slot(),
        )
        .await
        .expect("the administrator did not sign in");

        assert_eq!(
            ada.permissions,
            permission::mask_of_role(permission::ADMINISTRATOR)
        );

        let mut settled = ada;
        settled.must_change_password = false;

        let member = invite_member(
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
        .expect("an administrator could not invite a member");

        let refusal = invite_member(
            &store,
            &settled,
            no_platform(),
            &link,
            Invitation {
                username: "another.admin",
                role: permission::ADMINISTRATOR,
                workspaces: &[],
            },
            test_cost(),
            3,
        )
        .await
        .expect_err("an administrator certified an administrator");

        assert!(refusal.to_string().contains("only an owner"), "{refusal}");

        let mut mo = sign_in(
            &store,
            &joined_as(&owner, &member.member_id, permission::MEMBER),
            &secret_of(&member),
            &slot(),
        )
        .await
        .expect("the member did not sign in");
        mo.must_change_password = false;

        let refusal = invite_member(
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
        let directory = scratch("refused");
        let (store, owner, link, _, _) = owned(&directory).await;
        let mut unsettled = sign_in(
            &store,
            &joined_as(&owner, &owner.member_id, permission::OWNER),
            PASSWORD,
            &slot(),
        )
        .await
        .expect("the owner");
        unsettled.must_change_password = true;

        let refusal = invite_member(
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
        let refusal = invite_member(
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
    }

    /// Ticket 27, F7: the organization's own link is the owner's to read again, not only in the
    /// moment setup shows it, because an owner restores from it (requirement 6). A member is
    /// refused, because the link opens a read-only view of the directory to whoever holds it.
    #[tokio::test]
    async fn the_organizations_own_link_is_the_owners_to_read_again() {
        let directory = scratch("own-link");
        let (store, owner, original, _, _) = owned(&directory).await;

        let again = super::own_link(&owner, &store)
            .await
            .expect("the owner reads the link");
        let decoded = JoinLink::decode(&again).expect("the re-read link decodes");

        assert_eq!(decoded.organization_id, original.organization_id);
        assert_eq!(decoded.verifying_key, original.verifying_key);
        assert!(!decoded.read_only_credential.trim().is_empty());

        let invited = invite_member(
            &store,
            &owner,
            no_platform(),
            &original,
            Invitation {
                username: "member",
                role: permission::MEMBER,
                workspaces: &[],
            },
            test_cost(),
            1_757_000_000_100,
        )
        .await
        .expect("the invitation failed");
        // the member, settled so the refusal is by role and not the first-password requirement.
        let (key, certificate) = super::signer_of(&store, &owner).await.expect("the signer");
        let mut member_row = store
            .members(&owner.verifying_key)
            .await
            .expect("members")
            .into_iter()
            .find(|member| member.id == invited.member_id)
            .expect("the member row");
        member_row.must_change_password = false;
        store
            .write_member(
                &Signer {
                    key: &key,
                    certificate: &certificate,
                },
                &member_row,
            )
            .await
            .expect("settled");

        let joined = joined_as(&owner, &invited.member_id, permission::MEMBER);
        let member = sign_in(&store, &joined, &secret_of(&invited), &slot())
            .await
            .expect("the member did not sign in");

        assert!(
            matches!(
                super::own_link(&member, &store).await,
                Err(crate::error::Error::Forbidden { .. })
            ),
            "a member was handed the organization's own link"
        );
    }

    /// Requirement 21's rules, at their limits: three and thirty-two characters are accepted,
    /// two and thirty-three refused, and any character outside letters, digits, `.`, `_` and `-`
    /// is refused, with the one sentence every form repeats.
    #[test]
    fn a_username_is_three_to_thirty_two_of_letters_digits_dot_underscore_and_hyphen() {
        let longest = "x".repeat(32);
        let too_long = "x".repeat(33);
        let accepted = ["abc", "a.b", "a_b", "a-b", "A1.b_C-9", longest.as_str()];
        let refused = [
            "",
            "ab",
            too_long.as_str(),
            "a b",
            " abc",
            "a@b.c",
            "ab!",
            "ali/ce",
            "élan",
            "ahmed\u{200b}",
            "a\tb",
        ];

        for username in accepted {
            assert!(
                validate_username(username).is_ok(),
                "{username:?} was refused"
            );
        }

        for username in refused {
            let error = validate_username(username).expect_err(username);

            assert!(matches!(error, Error::InvalidInput { .. }), "{error:?}");
            assert_eq!(error.to_string(), USERNAME_RULES, "{username:?}");
        }
    }

    /// A username is unique in the organization without regard to case: once `alice` is in,
    /// `Alice` is refused with the one sentence, and so is the owner's own under another case.
    /// The refusal for a username outside the rules is the other sentence, and it comes first.
    #[tokio::test]
    async fn a_username_already_held_is_refused_in_any_case() {
        let directory = scratch("taken");
        let (store, owner, link, _, _) = owned(&directory).await;
        let invite = |username: &'static str| {
            let store = &store;
            let owner = &owner;
            let link = &link;

            async move {
                invite_member(
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
            }
        };

        invite("alice").await.expect("the first alice was refused");

        for taken in ["Alice", "ALICE", " alice ", "OLIVIA"] {
            let error = invite(taken).await.expect_err(taken);

            assert!(matches!(error, Error::InvalidInput { .. }), "{error:?}");
            assert_eq!(error.to_string(), USERNAME_TAKEN, "{taken:?}");
        }

        for outside in ["al", "al ice", "alice@acme.example"] {
            let error = invite(outside).await.expect_err(outside);

            assert_eq!(error.to_string(), USERNAME_RULES, "{outside:?}");
        }

        let members = super::members(&store, &owner, NOW)
            .await
            .expect("the members");
        let mut usernames: Vec<&str> = members
            .iter()
            .map(|member| member.username.as_str())
            .collect();
        usernames.sort_unstable();

        assert_eq!(usernames, vec!["alice", "olivia"]);
    }

    /// The certificate a member's row names, read off the replica: which signer stands behind it.
    async fn signed_by(store: &OrganizationStore, member_id: &str) -> String {
        let mut rows = store
            .connection()
            .query(
                "SELECT \"certificate_id\", \"updated_at\" FROM \"member\" WHERE \"id\" = ?",
                vec![turso::Value::Text(member_id.to_string())],
            )
            .await
            .expect("the row");
        let row = rows
            .next()
            .await
            .expect("a row")
            .expect("the member row exists");

        match row.get_value(0).expect("the certificate id") {
            turso::Value::Text(id) => id,
            other => panic!("certificate_id is {other:?}"),
        }
    }

    /// Requirement 23: a rename by the owner is what the members list reads back; the row is
    /// signed by whoever renamed it rather than by whoever wrote it before, and nothing else on
    /// it moves, so the member still signs in under their own password. A member keeps their
    /// own username under another case, because their own row is not counted as taking it.
    #[tokio::test]
    async fn a_rename_is_read_back_by_the_members_list_and_the_row_is_signed_by_the_renamer() {
        let directory = scratch("rename");
        let (store, owner, link, workspace_id, _) = owned(&directory).await;

        // an administrator invites the member, so the member's row is signed under the
        // administrator's certificate and a rename by the owner has a signer to change.
        let admin = invite_member(
            &store,
            &owner,
            no_platform(),
            &link,
            Invitation {
                username: "ada.admin",
                role: permission::ADMINISTRATOR,
                workspaces: &full(std::slice::from_ref(&workspace_id)),
            },
            test_cost(),
            1,
        )
        .await
        .expect("the administrator");
        let mut ada = sign_in(
            &store,
            &joined_as(&owner, &admin.member_id, permission::ADMINISTRATOR),
            &secret_of(&admin),
            &slot(),
        )
        .await
        .expect("the administrator did not sign in");
        ada.must_change_password = false;

        let sami = invite_member(
            &store,
            &ada,
            no_platform(),
            &link,
            Invitation {
                username: "sami",
                role: permission::MEMBER,
                workspaces: &full(std::slice::from_ref(&workspace_id)),
            },
            test_cost(),
            2,
        )
        .await
        .expect("the member");

        assert_eq!(
            signed_by(&store, &sami.member_id).await,
            format!("cert-{}", admin.member_id)
        );

        let renamed = rename_member(&store, &owner, &sami.member_id, " Sami.Staff ", 3)
            .await
            .expect("the rename failed");

        assert_eq!(renamed.id, sami.member_id);
        assert_eq!(renamed.username, "Sami.Staff");
        assert_eq!(renamed.role, permission::MEMBER);
        assert_eq!(
            renamed
                .workspaces
                .iter()
                .map(|workspace| workspace.id.clone())
                .collect::<Vec<_>>(),
            vec![workspace_id.clone()]
        );

        let listed = super::members(&store, &owner, NOW)
            .await
            .expect("the members")
            .into_iter()
            .find(|member| member.id == sami.member_id)
            .expect("the renamed member is listed");

        assert_eq!(listed.username, "Sami.Staff");

        // signed by the owner now, whose certificate is the one `signer_of` finds for them.
        let (_, owners_certificate) = super::signer_of(&store, &owner)
            .await
            .expect("the owner's signer");

        assert_eq!(
            signed_by(&store, &sami.member_id).await,
            owners_certificate.id
        );

        let row = store
            .members(&owner.verifying_key)
            .await
            .expect("the rows")
            .into_iter()
            .find(|member| member.id == sami.member_id)
            .expect("the row");

        assert_eq!(row.updated_at, 3);
        assert_eq!(row.created_at, 2);
        assert!(row.must_change_password, "the rename settled the member");

        // nothing else moved: the same password opens the same vault and reaches the same
        // workspace.
        let member = sign_in(
            &store,
            &joined_as(&owner, &sami.member_id, permission::MEMBER),
            &secret_of(&sami),
            &slot(),
        )
        .await
        .expect("the renamed member did not sign in");

        assert!(member.workspace_credentials.contains_key(&workspace_id));

        // their own username under another case is theirs to keep.
        let lowered = rename_member(&store, &owner, &sami.member_id, "sami.staff", 4)
            .await
            .expect("a member could not keep their username under another case");

        assert_eq!(lowered.username, "sami.staff");
    }

    /// The three refusals: a username somebody else holds, in any case; a session renaming its
    /// own row; a session whose row does not carry the act. And the rules sentence comes before
    /// the uniqueness one, as it does on an invitation.
    #[tokio::test]
    async fn a_rename_is_refused_for_a_taken_username_for_ones_own_row_and_without_the_act() {
        let directory = scratch("rename-refused");
        let (store, owner, link, _, _) = owned(&directory).await;
        let invite = |username: &'static str| {
            let store = &store;
            let owner = &owner;
            let link = &link;

            async move {
                invite_member(
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
                .expect("the invitation failed")
            }
        };
        let sami = invite("sami").await;
        let bob = invite("bob").await;

        for taken in ["Bob", "BOB", " bob ", "olivia", "OLIVIA"] {
            let error = rename_member(&store, &owner, &sami.member_id, taken, 2)
                .await
                .expect_err(taken);

            assert!(matches!(error, Error::InvalidInput { .. }), "{error:?}");
            assert_eq!(error.to_string(), USERNAME_TAKEN, "{taken:?}");
        }

        for outside in ["sa", "sa mi", "sami@acme.example", ""] {
            let error = rename_member(&store, &owner, &sami.member_id, outside, 2)
                .await
                .expect_err(outside);

            assert_eq!(error.to_string(), USERNAME_RULES, "{outside:?}");
        }

        let error = rename_member(&store, &owner, &owner.member_id, "olivia.owner", 2)
            .await
            .expect_err("the owner renamed themselves");

        assert!(matches!(error, Error::Forbidden { .. }), "{error:?}");
        assert!(error.to_string().contains("yourself"), "{error}");

        let mut member = sign_in(
            &store,
            &joined_as(&owner, &sami.member_id, permission::MEMBER),
            &secret_of(&sami),
            &slot(),
        )
        .await
        .expect("the member did not sign in");
        member.must_change_password = false;

        let error = rename_member(&store, &member, &bob.member_id, "robert", 2)
            .await
            .expect_err("a member renamed somebody");

        assert!(matches!(error, Error::Forbidden { .. }), "{error:?}");
        assert!(error.to_string().contains("renameMember"), "{error}");

        let error = rename_member(&store, &owner, "nobody", "robert", 2)
            .await
            .expect_err("a member who is not there was renamed");

        assert!(matches!(error, Error::NotFound { .. }), "{error:?}");

        // and nothing was written by any of them.
        let mut usernames: Vec<String> = super::members(&store, &owner, NOW)
            .await
            .expect("the members")
            .into_iter()
            .map(|member| member.username)
            .collect();
        usernames.sort_unstable();

        assert_eq!(usernames, vec!["bob", "olivia", "sami"]);
    }
}
