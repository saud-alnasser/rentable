//! an account: the row somebody will open, and the one link that finds the organization and
//! admits a machine to it.
//!
//! **Three acts, not one** (effort 828, requirements 19 and 20). [`create_account`] makes the row
//! and hands over nothing; [`make_link`] makes the one link, choosing its kind from the account's
//! standing; [`unset_password`] takes the account's password away so the next link asks for a new
//! one, which is what a reset is. *Until effort 828 an invitation made the account and the link in
//! one act, a reset made a second invitation, and a member made their own second-machine link from
//! the you section; three places explained one link.*
//!
//! **The application sends no mail.** We have registered with no mail service and the spec's
//! constraints forbid registering one on the customer's behalf, so a link is one thing the
//! administrator hands over themselves (effort 826, requirement 8). The interface says so and
//! shows it with one copy control. *Effort 824 handed over three things, the link, the username
//! and a generated password; the password is inside the link now, and the username is read off the
//! row the link opens.*
//!
//! **What an account is.** A member row with a vault sealed under a generated password nothing
//! stores and `must_change_password` set; the content key sealed to the new member's public key; a
//! grant on the organization database, which is the maker's own credential re-sealed, so the
//! member can pull the directory once their vault is open; and a grant on each workspace named, at
//! the access asked for, so an administrator grants what they can reach themselves and a read-only
//! grant is minted on the owner's machine as every read-only grant is. **No invitation row and no
//! link**: the account holds no password anybody knows until its first link is opened. Handing
//! somebody an act that signs rows needs the organization key to certify them, and only the
//! owner's vault yields it, so that is refused for anybody else and says why.
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
//! **The link's kind is read off the account rather than chosen** (effort 828, requirement 20).
//! An account whose `must_change_password` is set has no password anybody knows, so its link is an
//! invitation: the vault is built again under a freshly drawn password, that password rides in the
//! link's payload, and an `invitation` row stands behind it, which the first sign-in spends
//! (`join.rs::accept`). An account that has a password gets a machine link: no vault password, a
//! `machine_link` row behind it, and the machine it admits lands at the wall, where the password
//! they already have signs them in (`machine.rs::connect`). One act, two kinds, and the person
//! making it chooses neither.
//!
//! **An account is held on as many machines as it is given links for.** The act asks the register
//! of connected machines (requirement 15) nothing: a link is made whether or not a machine is
//! signed in on the account, and each one admits one more machine, once.
//!
//! **The invitation row carries the secret it was made with, sealed to its issuer.** [`make_link`]
//! writes the generated password, the link's own secret and the code under
//! [`vault::seal_to_public_key`] to the issuing session's own public key, and the issuer's member
//! id beside it. Nothing reads it back: the act that handed the issuer the same link and the same
//! code a second time went with effort 828, which found no caller for it, and a card offers a
//! fresh link instead. Neither column is under the invitation signature, whose preimage is
//! unchanged: a tampered seal opens for nobody, and a tampered issuer names a reader that is not
//! there yet.
//!
//! **What the link seals, and what the code opens** (effort 828, requirement 1). [`make_link`]
//! draws three things rather than one: the vault password where the kind has one, a thirty-two
//! byte link secret, and a six-character code from an alphabet with the letters that read alike
//! taken out. The link carries the secret and, in place of a legible credential, the maker's own
//! grant on the organization database and that vault password sealed under the code and the secret
//! together (`link::seal_payload`). So a link that leaks, is forwarded on, or is found in a chat
//! weeks later names an organization and reads nothing: what stands between its holder and the
//! directory is thirty-two to the sixth guesses at Argon2id. *Effort 826 put the vault password
//! in a `code_seal` column on the row under a ninety-second code and left the credential legible
//! in the link; the credential had to move into the text, because nothing reads a row before the
//! credential is out, and a code that lapsed would then be a fresh link to re-send.*
//!
//! **The link and the credential inside it both lapse** (effort 828, requirement 2). A link
//! stands for a week, or until the maker's own grant on the organization database dies, whichever
//! is sooner, and the row behind it carries that same moment, so the link and the row lapse
//! together. Making another drops the one that did not stand, so one link admits one machine at a
//! time.
//!
//! **Revoking takes back what a pending link made** (effort 826, requirement 15). A person who
//! never opened their link is removed the ordinary way, grants and all, under the act that made
//! them, so a link somebody kept opens a vault that holds nothing; a link on a member who has
//! signed in before is deleted alone, and the member's vault stays as it is. Which of the two a
//! member is, is whether an invitation of theirs was ever consumed: making a fresh link deletes
//! the open invitation before it and keeps the consumed one as that record.
//!
//! **A reset says what it could not restore** (826, requirement 13). The old vault is gone with
//! [`unset_password`] and every grant sealed to it is dead; the resetter re-seals the ones they
//! hold a full credential on themselves, mints again the read-only ones where they are the owner,
//! and the rest are removed and named in the answer, so the member knows which workspaces they
//! wait on somebody else for. There is no master key to do better with, and the spec accepted that
//! deliberately. A reset keeps the member's permissions as they were widened (826, requirement 6).

use serde::{Deserialize, Serialize};

use crate::{
    diagnostics,
    error::{Error, RefusalReason},
    sync::turso::platform::{AccessLevel, TursoPlatform},
};

use super::{
    authority::{AdministratorKey, issue_certificate},
    link::{Half, HalfKind, LinkPayload, Locator, seal_payload},
    permission::{self, Administration},
    session::{MemberSession, permissions_on_row},
    setup::{ADMINISTRATOR_KEY_PURPOSE, SHIPPING_KDF, credential_expiry},
    store::{
        GrantRecord, InvitationRecord, MachineLinkRecord, MemberRecord, OrganizationStore, Signer,
    },
    vault::{KdfParams, create_vault_with_secret, open_content, seal_content, seal_to_public_key},
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

/// The alphabet a confirmation code is spelled in: digits and upper-case letters with the four
/// that read alike removed, `I`, `L`, `O` and `U`, so a code read out on a call is the code
/// typed. Thirty-two symbols, which is five bits a character and thirty over the six.
const CODE_ALPHABET: &[u8] = b"0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/// How many characters a confirmation code is: six, which is what a person reads out in one
/// breath and types before it lapses (effort 826, requirement 23).
pub const CODE_LENGTH: usize = 6;

/// The width of the secret a link carries: thirty-two bytes drawn from the operating system,
/// base64url in the link's text. Its first sixteen are the salt the code key is derived with.
const LINK_SECRET_BYTES: usize = 32;

/// What the issuer's sealed copy holds, between the vault password, the link's secret and the
/// code. None of the three is spelled with it, so two splits read back exactly what was sealed.
const ISSUER_COPY_SEPARATOR: char = '\n';

/// What making a link hands the person who made it: the two things they hand over, and the moment
/// both stop working.
///
/// **One shape for both kinds** (effort 828, requirement 20). An account whose password is not yet
/// set gets an invitation-kind link and an account with one gets a machine-kind link; what the
/// person handing it over does with either is the same, so the answer says nothing about which it
/// is. The link carries one half of what opens the payload and the code is the other, so the link
/// is sent and the code is read out. Which of these may cross the boundary at all, and why, is
/// [[rules/credentials]], *Client boundary*.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MadeLink {
    /// the organization's locator with this link's sealed payload and half in it.
    pub link: String,
    /// the six-character code that opens the link's payload (effort 828, requirement 1). It is
    /// the other half of what unseals the credential and, where there is one, the vault password,
    /// so it is read out on a call or in person and never sent beside the link, and it lives
    /// exactly as long as the link does.
    pub code: String,
    /// when the link lapses: a week out, or when the maker's own grant on the organization
    /// database dies, whichever is sooner (effort 828, requirement 2). The row behind the link
    /// carries the same moment, so the link and the row lapse together.
    pub expires_at: i64,
    /// the workspaces the link could not carry over, named so the maker can say whom to ask. A
    /// link for an account with no password yet re-seals its grants to the fresh vault, and a
    /// grant the maker cannot seal again, full access on a workspace they hold no full credential
    /// on or read only where they hold no Turso authority, is taken off the row rather than left
    /// as a sign-in that fails; `unset_password` answers the same list, and this is the other
    /// act that drops grants and has to say so.
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
        return Err(Error::refused(
            RefusalReason::UsernameInvalid,
            USERNAME_RULES,
        ));
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
            return Err(Error::refused(RefusalReason::UsernameTaken, USERNAME_TAKEN));
        }
    }

    Ok(())
}

/// Make an account: the row somebody will open, and no link (effort 828, requirements 19 and 20).
///
/// This is what inviting was, up to the link. The vault is sealed under a password nobody is ever
/// shown and nothing stores, `must_change_password` is set, the certificate is written where the
/// acts asked for sign rows, and the grants are sealed to the fresh vault. **No invitation row and
/// no link**: an account holds no password until its first link is opened, and [`make_link`] is
/// what draws the password the person opening it replaces.
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
    role: &str,
    permissions: i64,
    workspaces: &[WorkspaceGrant],
    kdf_params: KdfParams,
    now: i64,
) -> Result<MemberFacts, Error> {
    session.settled()?;
    permission::require(
        permissions_on_row(store, session).await?,
        Administration::InviteMember,
    )?;

    let username = username.trim();

    validate_username(username)?;

    if role != permission::ADMINISTRATOR && role != permission::MEMBER {
        return Err(Error::refused(
            RefusalReason::RoleUnknown,
            "an account is made as an administrator or as a member",
        ));
    }

    refuse_taken_username(store, session, username, None).await?;

    let member_id = random_id()?;

    write_account(
        store,
        session,
        platform,
        &member_id,
        username,
        role,
        permissions,
        workspaces,
        kdf_params,
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
        .with("role", role)
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
/// **It hands over nothing.** A link is [`make_link`]'s, made from the account's card afterwards;
/// until one is, the account has no way in, which is exactly what a fresh account has.
pub async fn unset_password<P: TursoPlatform>(
    store: &OrganizationStore,
    session: &MemberSession,
    platform: Option<&P>,
    member_id: &str,
    kdf_params: KdfParams,
    now: i64,
) -> Result<Vec<UnreachableWorkspace>, Error> {
    session.settled()?;
    permission::require(
        permissions_on_row(store, session).await?,
        Administration::ResetPassword,
    )?;

    let members = store.members(&session.verifying_key).await?;
    let member = writable_account(
        &members,
        member_id,
        "an owner's password is not unset. their vault is theirs alone",
    )?
    .clone();
    // the drawn password is let go of here on purpose: nothing stores it, and the link made
    // afterwards draws its own.
    let (_, unreachable_workspaces) =
        reseal_account(store, session, platform, &member, kdf_params, now).await?;

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

/// Make the one link that admits a machine to an account (effort 828, requirement 20).
///
/// **One act, and the account's standing chooses its kind.** An account whose password is not yet
/// set gets an invitation-kind link: the vault is built again under a freshly drawn password, that
/// password rides in the link's sealed payload, and an `invitation` row stands behind it, so
/// opening it asks the person to choose a password and signs them in. An account that has a
/// password gets a machine-kind link: no vault password, a `machine_link` row behind it, and the
/// machine that opens it lands at the wall, where the password they already have admits them.
///
/// **It is refused for no standing.** An account is held on as many machines as its holder is
/// given links for (requirement 20, as the human corrected it on 2026-09-20), so a link is made
/// whether or not a machine is signed in on the account. It used to be refused while one was, on
/// the reading that somebody who wanted another machine signed out of the one they had; nobody
/// does that. The register (requirement 15) is read here for nothing, and the standing line on the
/// card is a fact about the account rather than the reason a link is missing.
///
/// **Neither kind mints anything**, so whoever may make one makes either: what the link seals is
/// the maker's own grant on the organization database, which dies within four weeks whatever
/// happens to the link.
///
/// **It is `inviteMember`'s or `resetPassword`'s** (the human's word, 2026-09-16, striking the
/// spec's risk on it). A link is how a machine joins an account, which is what making an account
/// was always half of; it is also the only thing that restores an account whose password
/// [`unset_password`] took away, and that act is `resetPassword`'s. Held to the first alone, a
/// member widened with the second and not the first could take a password away and could not hand
/// back the link that gives one, which is a person locked out by somebody with no way to let them
/// in. Owners and administrators hold both by role, so no default role moves.
pub async fn make_link<P: TursoPlatform>(
    store: &OrganizationStore,
    session: &MemberSession,
    platform: Option<&P>,
    locator: &Locator,
    member_id: &str,
    kdf_params: KdfParams,
    now: i64,
) -> Result<MadeLink, Error> {
    session.settled()?;
    permission::require_any(
        permissions_on_row(store, session).await?,
        &[Administration::InviteMember, Administration::ResetPassword],
    )?;

    let members = store.members(&session.verifying_key).await?;
    let member = writable_account(
        &members,
        member_id,
        "an owner is handed no link. the organization is reached with their own turso account",
    )?
    .clone();

    let credential = held_credential(session)?;
    let expires_at = link_expiry(&credential, now);
    let id = random_id()?;
    let link_secret = generate_link_secret()?;
    let code = generate_code()?;

    let mut unreachable_workspaces = Vec::new();
    let (kind, vault_password) = if member.must_change_password {
        // no password to admit them with, so the link carries the one the vault is built under and
        // the person opening it replaces it with theirs. The row is written before the link so a
        // link that exists always has a row behind it.
        let (password, unreachable) =
            reseal_account(store, session, platform, &member, kdf_params, now).await?;

        unreachable_workspaces = unreachable;
        let (key, certificate) = signer_of(store, session).await?;
        let signer = Signer {
            key: &key,
            certificate: &certificate,
        };

        store
            .write_invitation(
                &signer,
                &InvitationRecord {
                    id: id.clone(),
                    member_id: member_id.to_string(),
                    expires_at,
                    consumed_at: None,
                    sealed_secret: seal_to_public_key(
                        &session.secret.public_key(),
                        issuer_copy(&password, &link_secret, &code).as_bytes(),
                    )?,
                    issued_by: session.member_id.clone(),
                    created_at: now,
                },
            )
            .await?;

        (HalfKind::Invitation, Some(password))
    } else {
        // their password already admits them, so the link opens no vault: it connects the machine
        // and leaves it at the wall. Their other unspent rows go first, so one link stands at a
        // time and a pair somebody lost stops being a way in.
        store.delete_open_machine_links_of(member_id).await?;
        store
            .write_machine_link(&MachineLinkRecord {
                id: id.clone(),
                member_id: member_id.to_string(),
                expires_at,
                consumed_at: None,
                created_at: now,
            })
            .await?;

        (HalfKind::Machine, None)
    };

    let half = Half {
        kind,
        id: id.clone(),
        secret: link_secret,
        expires_at,
    };
    let sealed = seal_payload(
        &code,
        locator,
        &half,
        &LinkPayload {
            credential,
            vault_password,
        },
        kdf_params,
    )?;
    let link = locator.sealed(&sealed, half).encode()?;

    if !store.push().await {
        diagnostics::warn("organization.link.notYetSent")
            .with("link", id.as_str())
            .write();
    }

    diagnostics::info("organization.link.made")
        .with("member", member_id)
        .with(
            "kind",
            if member.must_change_password {
                "invitation"
            } else {
                "machine"
            },
        )
        .write();

    Ok(MadeLink {
        link,
        code,
        expires_at,
        unreachable_workspaces,
    })
}

/// The account an act on somebody else's row is allowed to touch: in this organization, not the
/// owner's, and not one that was removed. `owner_refusal` is what an act on the owner's row is
/// told, because each of them has its own reason.
fn writable_account<'a>(
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

    if member.role == permission::OWNER {
        return Err(Error::refused(RefusalReason::OwnerProtected, owner_refusal));
    }

    if member.role == permission::REMOVED {
        return Err(Error::refused(
            RefusalReason::MemberRemoved,
            "that member was removed. make them an account again if they are to come back",
        ));
    }

    Ok(member)
}

/// Build the account's vault again, under a freshly drawn password: what a reset and an
/// invitation-kind link both begin with. The row keeps its id, its username, its role and its
/// permissions; what moves is the vault and everything sealed to it.
///
/// What comes back is the password it drew and the workspaces it could not carry over. The
/// password is the caller's to seal into a link or to let go of, and it is written nowhere: a
/// reset lets it go, so an account whose password was unset has no way in until a link is made.
async fn reseal_account<P: TursoPlatform>(
    store: &OrganizationStore,
    session: &MemberSession,
    platform: Option<&P>,
    member: &MemberRecord,
    kdf_params: KdfParams,
    now: i64,
) -> Result<(String, Vec<UnreachableWorkspace>), Error> {
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
        store,
        session,
        platform,
        member_id,
        &username,
        &member.role,
        member.permissions,
        &kept,
        kdf_params,
        now,
    )
    .await?;

    Ok((password, unreachable_workspaces))
}

/// One member as the members list draws them: the username opened with the content key and the
/// workspaces they hold with the access on each. No key and no credential.
///
/// *`workspace_ids` was a list of ids until effort 826, and the invitations were a second list
/// read from a command of their own, folded into the row here and then dropped again by effort
/// 828, which found nothing reading them. Where an account stands is [`MemberStanding`], asked
/// for on its own.*
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemberFacts {
    pub id: String,
    pub username: String,
    pub role: String,
    pub permissions: i64,
    pub workspaces: Vec<WorkspaceGrant>,
    pub created_at: i64,
    /// whether the organization has been offered to this account and not yet accepted (effort
    /// 828, requirement 22). It is what puts *withdraw the offer* on the owner's card in place of
    /// the offer, and what names the account the offer stands with.
    pub offered_ownership: bool,
}

/// Every member, verified, with the username opened for the screen.
pub async fn members(
    store: &OrganizationStore,
    session: &MemberSession,
) -> Result<Vec<MemberFacts>, Error> {
    let grants = store.grants(&session.verifying_key).await?;
    // read once for the whole list rather than per row: an organization has one standing offer or
    // none, and it is the same answer on every card (effort 828, requirement 22).
    let offered = super::role::standing_offer(store, &session.verifying_key)
        .await?
        .map(|offer| offer.offered_member_id);

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
                offered_ownership: offered.as_deref() == Some(member.id.as_str()),
                id: member.id,
                role: member.role,
                permissions: member.permissions,
                created_at: member.created_at,
            })
        })
        .collect()
}

/// Where one account stands, as the directory says it in a line (effort 828, requirement 19).
///
/// **Two facts, and the third standing is neither of them.** An account holds no password until
/// its first link is opened, and the register (requirement 15) says whether a machine is signed in
/// on it inside the presence window; a card reads *password not yet set*, *a machine signed in* or
/// *no machine signed in* from the pair. The line is a fact about the account and gates nothing:
/// [`make_link`] reads neither half, and a card offering no link says so for a reason of its own.
///
/// **Read, never stored.** Nothing writes a standing: it is what the member row and the register
/// say between them at the moment somebody looks.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemberStanding {
    pub member_id: String,
    /// whether the account has a password of its own yet. `false` until its first link is opened.
    pub password_set: bool,
    /// whether a machine that was seen inside the window is signed in on the account.
    pub machine_signed_in: bool,
}

/// Every member's standing, in the order [`members`] answers them.
///
/// **A second command rather than a wider member row**, because the two halves come from two
/// places: the password half is on the signed member row and the machine half is on the unsigned
/// register, which every machine writes for itself. Asked apart, a list of people is still a list
/// of people when the register is empty.
pub async fn standings(
    store: &OrganizationStore,
    session: &MemberSession,
    now: i64,
) -> Result<Vec<MemberStanding>, Error> {
    let machines = store
        .connected_machines(&session.verifying_key, now)
        .await?;

    Ok(store
        .members(&session.verifying_key)
        .await?
        .into_iter()
        // the same filter [`members`] applies: a removed member's row stays for the replicas that
        // still hold it, and the directory lists who is in.
        .filter(|member| member.role != permission::REMOVED)
        .map(|member| MemberStanding {
            password_set: !member.must_change_password,
            machine_signed_in: machines
                .iter()
                .any(|(machine, _)| machine.member_id.as_deref() == Some(member.id.as_str())),
            member_id: member.id,
        })
        .collect())
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
    permission::require(
        permissions_on_row(store, session).await?,
        Administration::RenameMember,
    )?;

    if member_id == session.member_id {
        return Err(Error::refused(
            RefusalReason::NotYourself,
            "you cannot rename yourself. another administrator can",
        ));
    }

    let username = username.trim();

    validate_username(username)?;

    let rows = store.members(&session.verifying_key).await?;
    let member = rows
        .iter()
        .find(|member| member.id == member_id)
        .ok_or_else(|| {
            Error::refused(
                RefusalReason::MemberMissing,
                "that member is not in this organization",
            )
        })?;

    if member.role == permission::REMOVED {
        return Err(Error::refused(
            RefusalReason::MemberRemoved,
            "that member was removed. invite them again if they are to come back",
        ));
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
    members(store, session)
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

/// Draw a confirmation code. Six characters from the thirty-two the operating system's bytes are
/// folded onto; nothing about the invitation or the person enters it.
pub fn generate_code() -> Result<String, Error> {
    let mut bytes = [0_u8; CODE_LENGTH];

    getrandom::fill(&mut bytes).map_err(|error| Error::Internal {
        message: format!("failed to draw a code: {error}"),
    })?;

    Ok(bytes
        .iter()
        .map(|byte| CODE_ALPHABET[(*byte as usize) % CODE_ALPHABET.len()] as char)
        .collect())
}

/// Draw the secret a link carries: thirty-two bytes, base64url, so the link stays one line.
///
/// Reached from `machine.rs` as well, which mints the same shape of link for a member's own next
/// machine (effort 828, requirement 3).
pub(super) fn generate_link_secret() -> Result<String, Error> {
    use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD as BASE64URL};

    let mut bytes = [0_u8; LINK_SECRET_BYTES];

    getrandom::fill(&mut bytes).map_err(|error| Error::Internal {
        message: format!("failed to draw a link secret: {error}"),
    })?;

    Ok(BASE64URL.encode(bytes))
}

/// The issuer's copy: the vault password, the link's secret and the code, one line each, sealed
/// to the issuing session's own public key. All three are needed to build the same link again,
/// and any two of them would leave the issuer unable to.
fn issuer_copy(password: &str, link_secret: &str, code: &str) -> String {
    format!("{password}{ISSUER_COPY_SEPARATOR}{link_secret}{ISSUER_COPY_SEPARATOR}{code}")
}

/// The issuer's own grant on the organization database, out of the slot this session pushes
/// under: what a link seals in place of a legible credential (effort 828, requirement 1).
///
/// **Only what the issuer already holds.** Minting is the owner's machine's and nothing here
/// mints, so an administrator's invitation and a member's own link both carry the grant their
/// vault already unsealed, which is minted for four weeks and renewed on the owner's machine.
pub(super) fn held_credential(session: &MemberSession) -> Result<String, Error> {
    session
        .organization_credential
        .lock()
        .ok()
        .and_then(|slot| slot.clone())
        .ok_or_else(|| {
            Error::refused(
                RefusalReason::NoOrganizationCredential,
                "this machine holds no credential to the organization database to hand on",
            )
        })
}

/// When a link made now lapses: a week out, or when the credential inside it dies, whichever is
/// sooner (effort 828, requirement 2).
///
/// A credential whose text carries no expiry at all leaves the week standing on its own, which is
/// the shorter of the two either way. Nothing this application holds is minted without one now
/// (effort 828, requirement 16), so the fallback is for a token shaped in a way this cannot read
/// rather than for a credential that genuinely never lapses.
pub(super) fn link_expiry(credential: &str, now: i64) -> i64 {
    let week = now + INVITATION_LIFETIME_MS;

    credential_expiry(credential)
        .and_then(|moment| moment.parse::<i64>().ok())
        .map_or(week, |moment| week.min(moment))
}

/// The vault password an invitation was made under, opened the way the person holding the link
/// opens it: the code and the link's secret together.
///
/// **For the tests that sign a freshly made account in.** Every module here has one, because a
/// test that makes an account and then signs in as it needs the password the vault was sealed
/// under, and there is nowhere else to get it: it is never shown, never answered and never
/// written in the clear. *It read the row's `code_seal` until effort 828 moved the seal into the
/// link's own text.*
#[cfg(test)]
pub(crate) fn vault_password_of(join_link: &str, code: &str, kdf_params: KdfParams) -> String {
    let link = super::link::JoinLink::decode(join_link).expect("the invitation link");

    super::link::open_payload(
        code,
        &link.locator(),
        &link.half,
        &link.credential,
        kdf_params,
    )
    .expect("the code did not open the payload")
    .vault_password
    .expect("the payload holds no vault password")
}

/// What making an account and resetting one both write: the vault, the row, the certificate where
/// the acts asked for sign rows, and the grants. `permissions` is written as given rather than
/// derived from the role, so a reset keeps a widened member widened (826, requirement 6).
///
/// What comes back is the password the vault was drawn under. Nothing stores it: a fresh account
/// lets it go, and an invitation-kind link seals it into its own text.
#[allow(clippy::too_many_arguments)]
async fn write_account<P: TursoPlatform>(
    store: &OrganizationStore,
    session: &MemberSession,
    platform: Option<&P>,
    member_id: &str,
    username: &str,
    role: &str,
    permissions: i64,
    workspaces: &[WorkspaceGrant],
    kdf_params: KdfParams,
    now: i64,
) -> Result<String, Error> {
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
            return Err(Error::refused(
                RefusalReason::OwnerMachineOnly,
                "a read-only grant is minted on the owner's machine. ask the owner, or \
                          invite with full access",
            ));
        }

        if platform.is_none() {
            return Err(Error::refused(
                RefusalReason::OwnerMachineOnly,
                "a read-only grant is minted with the turso authority, which this \
                          machine does not hold. connect the account again, or invite with full \
                          access",
            ));
        }
    }

    // the member's vault, under a password nobody is ever shown and nothing stores. An account
    // holds it and no other until its first link is opened, and that link carries this password in
    // its sealed payload, where opening it replaces it with one the person chose (effort 828,
    // requirements 1 and 20).
    let generated_password = generate_password()?;
    let (vault, secret) = create_vault_with_secret(&generated_password, kdf_params)?;

    // the key this member will sign rows with, derived from the secret just drawn. Its verifying
    // half goes on the row whatever the role is, because this is the one moment the secret is in
    // hand: an owner widening them into a signing act later has the key to certify and no way to
    // derive it themselves (effort 826, requirement 6).
    let administrator_key =
        AdministratorKey::from_bytes(&secret.derive_seed(ADMINISTRATOR_KEY_PURPOSE)?);

    // a certificate is what makes a signed row of theirs verify, and issuing one needs the
    // organization key, which only the owner's vault yields. An administrator carries every act,
    // six of which sign, so the role and the acts are held to one line here rather than two: a row
    // that says administrator without a certificate behind it is a promise the chain will not
    // keep, and a member handed a signing act with no certificate is the same promise unsaid.
    if role == permission::ADMINISTRATOR || super::role::signs_rows(permissions) {
        if session.role != permission::OWNER {
            return Err(Error::refused(
                RefusalReason::OwnerOnly,
                "only an owner can give somebody an act that signs rows, because certifying a \
                          signer needs the organization key. ask the owner",
            ));
        }

        // read through `role::organization_key_of`, which derives the owner's own key, founder or
        // transferee, and refuses it by name where it is not the key this session has pinned: a
        // session open across a handover would otherwise certify under the key that was handed
        // over (effort 828, requirement 22).
        let organization_key = super::role::organization_key_of(session)?;

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
                signing_public_key: administrator_key.verifying_key(),
                role: role.to_string(),
                permissions,
                must_change_password: true,
                created_at: now,
                updated_at: now,
                // a fresh invitation has no row and starts at the first epoch. A reset keeps the
                // member's id and rewrites their row, so what it carries is what the row already
                // held: the number only ever moves forward (`session.rs`), and a reset that put
                // it back to zero would hand every keyring entry filed under an earlier one its
                // first gate again.
                session_epoch,
                // an account is made and reset with no organization seed on it. A transfer is the
                // one write that puts one there (effort 828, requirement 22).
                owner_seed_sealed: None,
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

    // the drawn password, handed back rather than written anywhere: the caller either seals it
    // into an invitation-kind link's payload or lets it go, and nothing on the row or in the
    // database holds it.
    Ok(generated_password)
}

fn opened(session: &MemberSession, column: &str, sealed: &[u8]) -> Result<String, Error> {
    String::from_utf8(open_content(&session.content_key, column, sealed)?).map_err(|_| {
        Error::Integrity {
            message: format!("{column} did not open as text"),
        }
    })
}

pub(super) fn random_id() -> Result<String, Error> {
    let mut bytes = [0_u8; 16];

    getrandom::fill(&mut bytes).map_err(|error| Error::Internal {
        message: format!("failed to draw an id: {error}"),
    })?;

    Ok(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
}

/// The shipping cost a member's vault is sealed at when they are invited, the same as the owner's.
pub const INVITED_KDF: KdfParams = SHIPPING_KDF;

/// The organization's own locator, rebuilt from what the replica holds: where the organization is,
/// what judges its rows, and what it is called. Every link this application makes is this with a
/// sealed payload and a half on it.
///
/// **It carries no credential** (effort 828, requirement 16). The name is sealed under the content
/// key, so this needs a member whose vault is open and reaches nothing over the network; what
/// comes back opens nothing and is handed to nobody. *It was the organization's own join link
/// until requirement 16 retired that, and it answered a legible read-only credential off
/// `organization.link_credential_sealed` that every caller but the link itself unsealed and threw
/// away.*
pub async fn locator(store: &OrganizationStore, session: &MemberSession) -> Result<Locator, Error> {
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

    Ok(Locator::new(
        &organization.id,
        &name,
        &session.verifying_key,
        &organization.remote_url,
    ))
}

/// What a test is asked for when it wants somebody in the organization: the account and the link
/// in one value, which is what an invitation was until effort 828 split it in two.
///
/// **Test scaffolding, and it is one act nowhere in the application.** Every module here has some
/// test that needs a second member before it can measure anything else, and writing the two acts
/// out in each of them would be forty copies of a sequence that is not what any of those tests are
/// about. The application's acts are [`create_account`], [`make_link`] and [`unset_password`], and
/// the tests that are about the split call them directly.
#[cfg(test)]
#[derive(Clone, Debug)]
pub(crate) struct AccountAndLink {
    pub member_id: String,
    pub invitation_id: String,
    pub username: String,
    pub join_link: String,
    pub expires_at: i64,
    pub code: String,
    pub unreachable_workspaces: Vec<UnreachableWorkspace>,
}

/// What the scaffolding is asked for.
#[cfg(test)]
pub(crate) struct Invitation<'a> {
    pub username: &'a str,
    /// `packages/workspace-permission`'s vocabulary: `administrator` or `member`.
    pub role: &'a str,
    pub workspaces: &'a [WorkspaceGrant],
}

/// Make an account and the first link for it, as a test needs both. The account carries the role's
/// own mask, which is what every invitation wrote before the permissions became a parameter.
#[cfg(test)]
pub(crate) async fn make_account_and_link<P: TursoPlatform>(
    store: &OrganizationStore,
    session: &MemberSession,
    platform: Option<&P>,
    locator: &Locator,
    invitation: Invitation<'_>,
    kdf_params: KdfParams,
    now: i64,
) -> Result<AccountAndLink, Error> {
    let account = create_account(
        store,
        session,
        platform,
        invitation.username,
        invitation.role,
        permission::mask_of_role(invitation.role),
        invitation.workspaces,
        kdf_params,
        now,
    )
    .await?;
    let made = make_link(
        store,
        session,
        platform,
        locator,
        &account.id,
        kdf_params,
        now,
    )
    .await?;

    Ok(with_link(&account.id, &account.username, made, Vec::new()))
}

/// Unset an account's password and make the link that follows it, which is what a reset was.
///
/// *It took the account's machines out of the register first until 2026-09-20*, because a link
/// was refused while a machine was signed in on the account and a test about the reset is not a
/// test about that gate. The gate is gone: [`make_link`] reads the register for nothing, so
/// neither does this.
#[cfg(test)]
pub(crate) async fn reset_account<P: TursoPlatform>(
    store: &OrganizationStore,
    session: &MemberSession,
    platform: Option<&P>,
    locator: &Locator,
    member_id: &str,
    kdf_params: KdfParams,
    now: i64,
) -> Result<AccountAndLink, Error> {
    let unreachable = unset_password(store, session, platform, member_id, kdf_params, now).await?;
    let made = make_link(
        store, session, platform, locator, member_id, kdf_params, now,
    )
    .await?;
    let username = members(store, session)
        .await?
        .into_iter()
        .find(|member| member.id == member_id)
        .map(|member| member.username)
        .unwrap_or_default();

    Ok(with_link(member_id, &username, made, unreachable))
}

#[cfg(test)]
fn with_link(
    member_id: &str,
    username: &str,
    made: MadeLink,
    unreachable_workspaces: Vec<UnreachableWorkspace>,
) -> AccountAndLink {
    let invitation_id = super::link::JoinLink::decode(&made.link)
        .map(|link| link.half.id)
        .unwrap_or_default();

    AccountAndLink {
        member_id: member_id.to_string(),
        invitation_id,
        username: username.to_string(),
        join_link: made.link,
        expires_at: made.expires_at,
        code: made.code,
        unreachable_workspaces,
    }
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use serde_json::json;

    use super::{
        AccountAndLink, CODE_LENGTH, INVITATION_LIFETIME_MS, Invitation, InvitationStanding,
        MemberStanding, USERNAME_RULES, USERNAME_TAKEN, WorkspaceGrant, create_account,
        generate_password, locator, make_account_and_link, make_link, rename_member, reset_account,
        standings, unset_password, validate_username,
    };
    use crate::{
        error::Error,
        organization::{
            HeldOrganization,
            link::{HalfKind, JoinLink, LinkPayload, Locator, open_payload},
            migrate::Pipeline,
            permission,
            session::{CredentialSlot, MemberSession, sign_in, sign_in_by_username},
            setup::{CreateOrganization, Remote, create_organization, credential_expiry},
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

    /// The password an invitation's vault was sealed under: the link's own secret and the code
    /// together open the payload the link carries, which is what the person opening the link does
    /// (effort 828, requirement 1). *It was the link's secret alone until effort 826 made the code
    /// the other half, and it read the row's `code_seal` until effort 828 moved the seal into the
    /// link's text.*
    fn secret_of(invited: &AccountAndLink) -> String {
        crate::organization::invite::vault_password_of(
            &invited.join_link,
            &invited.code,
            test_cost(),
        )
    }

    /// Everything a link's code opens: the credential the machine reads the rows with, and the
    /// password the vault was built under.
    fn payload_of(invited: &AccountAndLink) -> LinkPayload {
        let link = JoinLink::decode(&invited.join_link).expect("the link");

        open_payload(
            &invited.code,
            &link.locator(),
            &link.half,
            &link.credential,
            test_cost(),
        )
        .expect("the code did not open the payload")
    }

    /// A credential shaped the way a minted one is, dying at `expires_at`. The in-memory platform
    /// draws tokens that carry no claims at all, so a test about what a grant's own expiry does to
    /// a link writes one the way `setup::credential_expiry` reads one.
    fn grant_dying_at(expires_at: i64) -> String {
        let payload = base64::Engine::encode(
            &base64::engine::general_purpose::URL_SAFE_NO_PAD,
            json!({ "id": "org", "exp": expires_at / 1000 }).to_string(),
        );

        format!("header.{payload}.signature")
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
        }
    }

    /// An organization with its owner signed in and one workspace, on a fake account.
    async fn owned(
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

        assert!(
            machine.organization.is_none(),
            "the machine has prior state"
        );

        machine
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
        let directory = scratch("account");
        let (store, owner, link, _, _) = owned(&directory).await;
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
                sign_in_by_username(&store, &held, "sami.staff", attempt, &slot())
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
        assert_eq!(made.expires_at, NOW + INVITATION_LIFETIME_MS);
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
            crate::organization::join::accept(
                |_| async { Ok::<_, Error>(&store) },
                &mut late_machine,
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
        assert!(late_machine.organization.is_none());

        // the machine it was made for, which spends it and chooses the password.
        let theirs = scratch("account-theirs");
        let mut their_machine = fresh_machine(&theirs);
        let (_, session) = crate::organization::join::accept(
            |_| async { Ok::<_, Error>(&store) },
            &mut their_machine,
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
        sign_in_by_username(&store, &held, "sami.staff", CHOSEN, &slot())
            .await
            .expect("the chosen password did not admit them at the wall");

        // a second machine with the same pair: the invitation was spent. The organization is
        // recorded on it, because a link is judged after the replica it names has been reached,
        // and no vault of theirs opens there.
        let second = scratch("account-second");
        let mut second_machine = fresh_machine(&second);

        assert!(
            crate::organization::join::accept(
                |_| async { Ok::<_, Error>(&store) },
                &mut second_machine,
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
    }

    /// Ticket 20, the human's first ask: **a link is made by a holder of `inviteMember` or of
    /// `resetPassword`, and by nobody else.**
    ///
    /// `unset_password` beside this act takes an account's password away and is `resetPassword`'s;
    /// a link is the only thing that gives one back. Held to `inviteMember` alone, a member widened
    /// with the second and not the first could lock somebody out and not let them in, which is what
    /// the spec recorded under Risks and the human struck on 2026-09-16. Owners and administrators
    /// hold both by role, so no default role moves and what is read here is a widened plain member.
    ///
    /// The account the link is made for has a password and nobody signed in on it, so the link is
    /// the machine kind and the row behind it is unsigned: what is under test is the act and not
    /// what a plain member can sign.
    #[tokio::test]
    async fn a_link_is_made_by_a_holder_of_either_act_and_by_nobody_else() {
        let directory = scratch("link-acts");
        let (store, owner, link, _, _) = owned(&directory).await;
        let subject = create_account(
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
        let (sami, _) = opened_as(&store, &owner, &link, &subject.id, "sami", NOW).await;

        // a plain member widened with `resetPassword` and nothing else.
        let resetter = create_account(
            &store,
            &owner,
            no_platform(),
            "rita.reset",
            permission::MEMBER,
            permission::mask_of(&[permission::Administration::ResetPassword]),
            &[],
            test_cost(),
            NOW,
        )
        .await
        .expect("the widened account could not be made");
        let (rita, _) = opened_as(&store, &owner, &link, &resetter.id, "rita", NOW + 2).await;

        make_link(
            &store,
            &rita,
            no_platform(),
            &link,
            &subject.id,
            test_cost(),
            NOW + 4,
        )
        .await
        .expect("a holder of resetPassword was refused the link that restores an account");

        // and a member holding neither act is refused, with both named: a caller told only the
        // first would go looking for a bit they do not need.
        let refusal = make_link(
            &store,
            &sami,
            no_platform(),
            &link,
            &resetter.id,
            test_cost(),
            NOW + 5,
        )
        .await
        .expect_err("a member holding neither act made a link");

        assert!(
            matches!(&refusal, Error::Refused { reason: crate::error::RefusalReason::RoleLacksAct, message }
                if message.contains("inviteMember") && message.contains("resetPassword")),
            "{refusal:?}"
        );
    }

    /// One account opened on a machine of its own: the owner makes its link, the person opens it
    /// and chooses a password, and what comes back is their session and their machine's id.
    async fn opened_as(
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
            test_cost(),
            now,
        )
        .await
        .expect("the link could not be made");
        let directory = scratch(&format!("opened-{name}"));
        let mut machine = fresh_machine(&directory);
        let (_, session) = crate::organization::join::accept(
            |_| async { Ok::<_, Error>(store) },
            &mut machine,
            &JoinLink::decode(&made.link).expect("the link"),
            &made.code,
            CHOSEN,
            test_cost(),
            now + 1,
        )
        .await
        .expect("the account could not be opened");
        let machine_id = machine
            .organization
            .as_ref()
            .expect("the record")
            .machine_id
            .clone();

        (session, machine_id)
    }

    /// Effort 828, requirement 20 and criterion 20: **the account's standing chooses the link's
    /// kind and refuses none of them.**
    ///
    /// An account with a password is offered a link while a machine is signed in on it, and that
    /// link is a machine-kind one, which opens no vault and lands its machine at the wall like any
    /// other. A reset unsets the password, and the next link is an invitation again: it asks the
    /// person to choose one, and the one they chose before stops admitting them.
    ///
    /// *Turned round on 2026-09-20.* This asserted the refusal, and the sign-out that lifted it,
    /// until the human ruled one machine per account out: an account is held on as many machines
    /// as it is given links for, and nobody signs out of one to be handed another.
    #[tokio::test]
    async fn a_machine_signed_in_is_offered_a_link_and_a_reset_makes_the_next_one_ask_a_password() {
        let directory = scratch("standing");
        let (store, owner, link, _, _) = owned(&directory).await;
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
        let first = make_link(
            &store,
            &owner,
            no_platform(),
            &link,
            &account.id,
            test_cost(),
            NOW,
        )
        .await
        .expect("the first link could not be made");
        let theirs = scratch("standing-theirs");
        let mut their_machine = fresh_machine(&theirs);

        crate::organization::join::accept(
            |_| async { Ok::<_, Error>(&store) },
            &mut their_machine,
            &JoinLink::decode(&first.link).expect("the link"),
            &first.code,
            CHOSEN,
            test_cost(),
            NOW + 1,
        )
        .await
        .expect("the account could not be opened");

        // opening a link is a sign-in, so the register now names them on that machine. The next
        // link is made anyway: the account is held on this machine and on whichever the link
        // admits, and nobody signs out to be handed one.
        let signed_in = store
            .connected_machines(&owner.verifying_key, NOW + 2)
            .await
            .expect("the register")
            .iter()
            .any(|(machine, _)| machine.member_id.as_deref() == Some(account.id.as_str()));

        assert!(signed_in, "opening the link did not register their machine");

        let second = make_link(
            &store,
            &owner,
            no_platform(),
            &link,
            &account.id,
            test_cost(),
            NOW + 3,
        )
        .await
        .expect("a link was refused for an account with a machine signed in on it");
        let decoded = JoinLink::decode(&second.link).expect("the link");

        assert_eq!(
            decoded.half.kind,
            HalfKind::Machine,
            "an account with a password got a link that asks for one"
        );
        assert_eq!(
            open_payload(
                &second.code,
                &decoded.locator(),
                &decoded.half,
                &decoded.credential,
                test_cost()
            )
            .expect("the code did not open the payload")
            .vault_password,
            None,
            "a machine-kind link carries a vault password"
        );

        // the reset: the password is unset, so the next link asks for a new one.
        assert!(
            unset_password(
                &store,
                &owner,
                no_platform(),
                &account.id,
                test_cost(),
                NOW + 4,
            )
            .await
            .expect("the password could not be unset")
            .is_empty(),
            "the reset could not carry a workspace over"
        );

        // their machine is still in the register, naming them, and the link after the reset is
        // made all the same: the reset is what they need a link for (requirement 20).
        let third = make_link(
            &store,
            &owner,
            no_platform(),
            &link,
            &account.id,
            test_cost(),
            NOW + 5,
        )
        .await
        .expect("a link could not be made after the reset while a machine was signed in");
        let decoded = JoinLink::decode(&third.link).expect("the link");

        assert_eq!(
            decoded.half.kind,
            HalfKind::Invitation,
            "the link after a reset did not ask for a password"
        );

        // and what they chose before is gone with the vault it opened.
        let held = joined_as(&owner, &account.id, permission::MEMBER);

        assert!(
            sign_in_by_username(&store, &held, "sami.staff", CHOSEN, &slot())
                .await
                .is_err(),
            "the reset left the old password admitting them"
        );

        let next = scratch("standing-next");
        let mut next_machine = fresh_machine(&next);
        let (_, session) = crate::organization::join::accept(
            |_| async { Ok::<_, Error>(&store) },
            &mut next_machine,
            &decoded,
            &third.code,
            "the password sami chose after the reset",
            test_cost(),
            NOW + 6,
        )
        .await
        .expect("the account could not be opened after the reset");

        assert_eq!(session.member_id, account.id);
        assert!(!session.must_change_password);
    }

    /// Effort 828, requirement 19: **the standing a card reads is the member row and the register,
    /// asked together.**
    ///
    /// A fresh account has no password and nobody signed in on it; opening its link sets the first
    /// and the second; signing that machine out leaves the password and takes the machine away.
    /// Those are the three lines the directory draws, and each is a fact about the account:
    /// [`make_link`] reads neither half, so no line here is the reason a link is missing.
    #[tokio::test]
    async fn a_standing_is_the_password_and_the_register_read_together() {
        let directory = scratch("standings");
        let (store, owner, link, _, _) = owned(&directory).await;
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
        let standing = |list: Vec<MemberStanding>, id: &str| {
            list.into_iter()
                .find(|standing| standing.member_id == id)
                .expect("the account is not in the standings")
        };

        let fresh = standing(
            standings(&store, &owner, NOW)
                .await
                .expect("the standings could not be read"),
            &account.id,
        );

        assert!(!fresh.password_set, "a fresh account had a password");
        assert!(
            !fresh.machine_signed_in,
            "a fresh account had a machine signed in"
        );

        let made = make_link(
            &store,
            &owner,
            no_platform(),
            &link,
            &account.id,
            test_cost(),
            NOW,
        )
        .await
        .expect("the link could not be made");
        let theirs = scratch("standings-theirs");
        let mut their_machine = fresh_machine(&theirs);

        crate::organization::join::accept(
            |_| async { Ok::<_, Error>(&store) },
            &mut their_machine,
            &JoinLink::decode(&made.link).expect("the link"),
            &made.code,
            CHOSEN,
            test_cost(),
            NOW + 1,
        )
        .await
        .expect("the account could not be opened");

        let opened = standing(
            standings(&store, &owner, NOW + 1)
                .await
                .expect("the standings could not be read"),
            &account.id,
        );

        assert!(
            opened.password_set,
            "an account that chose a password still read as having none"
        );
        assert!(
            opened.machine_signed_in,
            "the machine that opened the link is not in the register"
        );

        store
            .unregister_machine(
                &their_machine
                    .organization
                    .as_ref()
                    .expect("the record")
                    .machine_id,
            )
            .await
            .expect("the machine could not be taken out of the register");

        let signed_out = standing(
            standings(&store, &owner, NOW + 2)
                .await
                .expect("the standings could not be read"),
            &account.id,
        );

        assert!(signed_out.password_set);
        assert!(
            !signed_out.machine_signed_in,
            "a machine that signed out is still in the register"
        );
        // the owner's own machine is in the register too, which is what makes the list a list
        // rather than one row.
        assert!(
            standings(&store, &owner, NOW + 2)
                .await
                .expect("the standings could not be read")
                .len()
                >= 2
        );
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

        let invited = make_account_and_link(
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

        // the link is the organization's locator with a sealed payload in place of the credential
        // and the invitation's half beside it: the organization, its name, the invitation's id and
        // the link's own secret, and no username. The secret is thirty-two bytes base64url, which
        // salts the code's key; the code is the other half and is not in the link (effort 828,
        // requirement 1).
        let decoded = JoinLink::decode(&invited.join_link).expect("the link decodes");
        let half = &decoded.half;

        assert_eq!(decoded.organization_id, link.organization_id);
        assert_eq!(decoded.verifying_key, link.verifying_key);
        assert_eq!(decoded.remote_url, link.remote_url);
        assert_eq!(decoded.organization_name, "Acme");
        assert_eq!(half.kind, HalfKind::Invitation);
        assert_eq!(half.id, invited.invitation_id);
        assert_eq!(half.expires_at, invited.expires_at);
        assert_eq!(half.secret.len(), 43, "{}", half.secret);
        assert!(
            !decoded.credential.is_empty(),
            "the link carries no sealed payload"
        );
        assert!(!invited.join_link.contains("sami"));
        assert!(
            !invited.join_link.contains(&invited.code),
            "the code is inside the link it opens"
        );
        assert_eq!(invited.username, "sami.staff", "the username, trimmed");

        // the invitation row names the member, the issuer, and the vault password, the link's
        // secret and the code sealed together to the issuer's key and to nobody else's: the owner
        // opens it, and what it holds is what rebuilds the same link and the same code.
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
        let issuers_copy = String::from_utf8(
            crate::organization::vault::unseal_with_secret_key(&owner.secret, &row.sealed_secret)
                .expect("the owner opens the sealed secret"),
        )
        .expect("the issuer's copy is text");
        let held: Vec<&str> = issuers_copy.split('\n').collect();

        assert_eq!(
            held.len(),
            3,
            "the issuer's copy holds {} parts",
            held.len()
        );
        assert_eq!(held[1], half.secret);
        assert_eq!(held[2], invited.code);
        assert_eq!(
            held[0],
            secret_of(&invited),
            "the code opens a password the issuer's copy does not hold"
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

    /// Requirement 23: the invitation lapses and the link does not, and reissuing makes a fresh
    /// vault under a fresh secret with the old one dead and hands a fresh link over the same
    /// organization. *Revoking was read here too, under effort 826's requirement 15, until effort
    /// 828 found nothing calling it.*
    #[tokio::test]
    async fn an_invitation_lapses_and_is_reissuable_while_the_link_stands() {
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
                make_account_and_link(
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

        // where an unspent invitation stands, read off the rows themselves: the members list
        // carried it on the member's own row between effort 826 and effort 828, and answers it
        // nowhere now, because nothing on the other side read it.
        let standing = |invitation_id: String, now: i64| {
            let store = &store;
            let owner = &owner;

            async move {
                store
                    .invitations(&owner.verifying_key)
                    .await
                    .expect("the invitations")
                    .iter()
                    .find(|invitation| invitation.id == invitation_id)
                    .map(|invitation| InvitationStanding::of(invitation, now))
            }
        };

        assert_eq!(
            standing(invited.invitation_id.clone(), issued_at + 1).await,
            Some(InvitationStanding::Open)
        );
        assert_eq!(
            standing(
                invited.invitation_id.clone(),
                issued_at + INVITATION_LIFETIME_MS
            )
            .await,
            Some(InvitationStanding::Lapsed)
        );

        // the link still finds the organization by name, whatever the invitation's standing.
        let decoded = JoinLink::decode(&invited.join_link).expect("the link decodes");

        assert_eq!(decoded.organization_name, "Acme");

        // reissued, for a member who is in: a fresh secret opens the vault, the old one does not,
        // the workspace the reissuer holds is re-sealed to the fresh vault, and the link is a
        // fresh one over the same organization.
        let bob = invite("bob", issued_at + 6).await;
        let bobs_first_password = secret_of(&bob);
        let reissued = reset_account(
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
            fresh.organization_id, link.organization_id,
            "a reissue hands a link over the same organization"
        );
        assert_eq!(fresh.verifying_key, link.verifying_key);
        assert_ne!(secret_of(&reissued), bobs_first_password);
        assert_ne!(reissued.invitation_id, bob.invitation_id);
        assert_eq!(
            Some(fresh.half.id.as_str()),
            Some(reissued.invitation_id.as_str())
        );

        let joined = joined_as(&owner, &bob.member_id, permission::MEMBER);

        assert!(
            sign_in(&store, &joined, &bobs_first_password, &slot())
                .await
                .is_err(),
            "the old secret still opens the vault"
        );

        let member = sign_in(&store, &joined, &secret_of(&reissued), &slot())
            .await
            .expect("the fresh secret did not open the vault");

        assert!(member.workspace_credentials.contains_key(&workspace_id));
        assert_eq!(
            standing(reissued.invitation_id.clone(), issued_at + 11).await,
            Some(InvitationStanding::Open),
            "the reissued invitation does not stand open"
        );
    }

    /// Effort 826, requirement 6 at the reset: `issue` writes the permissions it is given, so a
    /// member whose row was widened past their role's mask is reset with the widening kept, and a
    /// fresh invitation writes the role's own mask.
    #[tokio::test]
    async fn a_reset_keeps_a_widened_members_permissions_and_a_fresh_invitation_writes_the_roles() {
        let directory = scratch("widened");
        let (store, owner, link, _, _) = owned(&directory).await;
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
            super::members(&store, &owner)
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

        let invited = make_account_and_link(
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

        let refused = make_account_and_link(
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

        let admin = make_account_and_link(
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

        let refused = make_account_and_link(
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

        let usernames: Vec<String> = super::members(&store, &owner)
            .await
            .expect("the members")
            .into_iter()
            .map(|member| member.username)
            .collect();

        assert!(!usernames.iter().any(|name| name.starts_with("reader2")));
        assert!(!usernames.iter().any(|name| name.starts_with("reader3")));
    }

    /// Effort 828, requirements 1 and 2: **a link seals the issuer's own grant on the organization
    /// database and the generated vault password, and it lapses with that grant.**
    ///
    /// The payload opens on the code and on nothing else; the credential inside it is the one in
    /// the session's slot, a four-week grant, and no link carries a credential that does not lapse
    /// (the organization's own link, which did, is gone with requirement 16); its expiry is inside
    /// four weeks, which is what the owner's machine mints for; and where the grant dies before the
    /// week is out, the link's own moment is the grant's. All of it on the first link an account
    /// is made and on the link that follows a reset alike, which are the same act, `make_link`.
    #[tokio::test]
    async fn a_link_seals_the_issuers_own_grant_and_lapses_no_later_than_it_does() {
        let directory = scratch("sealed-payload");
        let (store, owner, link, _, _) = owned(&directory).await;
        let now = 1_757_000_000_000;
        let four_weeks = 28 * 24 * 60 * 60 * 1000;
        // a grant with three days left, which is a four-week one the owner minted twenty-five days
        // ago and has not renewed yet.
        let dies_at = now + 3 * 24 * 60 * 60 * 1000;
        let grant = grant_dying_at(dies_at);

        *owner.organization_credential.lock().expect("the slot") = Some(grant.clone());

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
            now,
        )
        .await
        .expect("the invitation failed");
        let reset = reset_account(
            &store,
            &owner,
            no_platform(),
            &link,
            &invited.member_id,
            test_cost(),
            now,
        )
        .await
        .expect("the reset failed");

        for (what, issued) in [("an invitation", &invited), ("a reset", &reset)] {
            let payload = payload_of(issued);

            assert_eq!(
                payload.credential, grant,
                "{what} sealed a credential that is not the session's"
            );
            assert_eq!(
                payload.vault_password.as_deref(),
                Some(secret_of(issued).as_str()),
                "{what} sealed a password the vault was not built under"
            );

            let expiry = credential_expiry(&payload.credential)
                .and_then(|moment| moment.parse::<i64>().ok())
                .unwrap_or_else(|| panic!("{what} sealed a credential that never dies"));

            assert!(
                expiry > now && expiry <= now + four_weeks,
                "{what} sealed a credential dying at {expiry}, outside four weeks of {now}"
            );

            // the link's own moment is the grant's, because the grant dies first.
            assert_eq!(issued.expires_at, dies_at, "{what}");

            let decoded = JoinLink::decode(&issued.join_link).expect("the link");

            assert_eq!(decoded.half.expires_at, dies_at, "{what}");
            assert_eq!(decoded.half.kind, HalfKind::Invitation, "{what}");
            assert!(
                !issued.join_link.contains(&grant),
                "{what} carries the credential in the clear"
            );
            assert_eq!(issued.code.chars().count(), CODE_LENGTH, "{what}");
        }

        // and a grant that outlives the week leaves the week standing, which is the ordinary case.
        *owner.organization_credential.lock().expect("the slot") =
            Some(grant_dying_at(now + four_weeks));

        let later = make_account_and_link(
            &store,
            &owner,
            no_platform(),
            &link,
            Invitation {
                username: "bobby",
                role: permission::MEMBER,
                workspaces: &[],
            },
            test_cost(),
            now,
        )
        .await
        .expect("the second invitation failed");

        assert_eq!(later.expires_at, now + INVITATION_LIFETIME_MS);

        // and the locator every one of these was built from carries nothing to read the
        // organization with (effort 828, requirement 16): a field of it holding the grant would be
        // the leak the seal above exists to close.
        assert!(
            ![
                &link.organization_id,
                &link.organization_name,
                &link.verifying_key,
                &link.remote_url,
            ]
            .iter()
            .any(|field| field.contains(&grant)),
            "the locator carries the issuer's grant"
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

        let admin = make_account_and_link(
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
        // certificate now signs a member row, grants and an invitation. The administrator's first
        // password is read while their invitation row is still there, because the reset below
        // deletes it and the vault it opened is what the reset replaces.
        let admins_first_password = secret_of(&admin);
        let mut ada = sign_in(
            &store,
            &joined_as(&owner, &admin.member_id, permission::ADMINISTRATOR),
            &admins_first_password,
            &slot(),
        )
        .await
        .expect("the administrator did not sign in");
        ada.must_change_password = false;

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

        // the owner resets the administrator: their certificate is replaced with one over a key
        // derived from a fresh vault secret.
        let reset = reset_account(
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

        assert_ne!(secret_of(&reset), admins_first_password);

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
                &admins_first_password,
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

        let administrator = make_account_and_link(
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
        .expect("an administrator could not invite a member");

        let refusal = make_account_and_link(
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
    }

    /// A link for an account with no password yet re-seals its grants, and a grant the maker cannot
    /// seal again is taken off the row and named in the answer, as a reset names it: nobody is
    /// told otherwise, and the person opening the link would find the workspace missing.
    #[tokio::test]
    async fn a_link_made_by_somebody_who_cannot_reach_a_workspace_says_which_grant_it_dropped() {
        let directory = scratch("dropped-grant");
        let (store, owner, link, workspace_id, _) = owned(&directory).await;
        let admin = make_account_and_link(
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

        // the owner, who holds the workspace, makes the account into it; the administrator, who
        // does not, makes the first link.
        let account = create_account(
            &store,
            &owner,
            no_platform(),
            "sami.staff",
            permission::MEMBER,
            0,
            &full(std::slice::from_ref(&workspace_id)),
            test_cost(),
            2,
        )
        .await
        .expect("the account");
        let made = make_link(
            &store,
            &ada,
            no_platform(),
            &link,
            &account.id,
            test_cost(),
            3,
        )
        .await
        .expect("the link");

        assert_eq!(
            made.unreachable_workspaces
                .iter()
                .map(|workspace| workspace.id.as_str())
                .collect::<Vec<_>>(),
            vec![workspace_id.as_str()],
            "the dropped grant was not named"
        );
        assert!(
            !store
                .grants(&owner.verifying_key)
                .await
                .expect("the grants")
                .iter()
                .any(|grant| grant.member_id == account.id && grant.workspace_id == workspace_id),
            "the grant the link could not carry over is still on the row"
        );

        // and a link the owner makes, holding the workspace, drops nothing.
        let account = create_account(
            &store,
            &owner,
            no_platform(),
            "rana.staff",
            permission::MEMBER,
            0,
            &full(std::slice::from_ref(&workspace_id)),
            test_cost(),
            4,
        )
        .await
        .expect("the account");
        let made = make_link(
            &store,
            &owner,
            no_platform(),
            &link,
            &account.id,
            test_cost(),
            5,
        )
        .await
        .expect("the link");

        assert!(made.unreachable_workspaces.is_empty());
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

            assert!(
                matches!(
                    error,
                    Error::Refused {
                        reason: crate::error::RefusalReason::UsernameInvalid,
                        ..
                    }
                ),
                "{error:?}"
            );
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
                make_account_and_link(
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

            assert!(
                matches!(
                    error,
                    Error::Refused {
                        reason: crate::error::RefusalReason::UsernameTaken,
                        ..
                    }
                ),
                "{error:?}"
            );
            assert_eq!(error.to_string(), USERNAME_TAKEN, "{taken:?}");
        }

        for outside in ["al", "al ice", "alice@acme.example"] {
            let error = invite(outside).await.expect_err(outside);

            assert_eq!(error.to_string(), USERNAME_RULES, "{outside:?}");
        }

        let members = super::members(&store, &owner).await.expect("the members");
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
        let admin = make_account_and_link(
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

        let sami = make_account_and_link(
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

        let listed = super::members(&store, &owner)
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
                make_account_and_link(
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

            assert!(
                matches!(
                    error,
                    Error::Refused {
                        reason: crate::error::RefusalReason::UsernameTaken,
                        ..
                    }
                ),
                "{error:?}"
            );
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

        assert!(
            matches!(
                error,
                Error::Refused {
                    reason: crate::error::RefusalReason::NotYourself,
                    ..
                }
            ),
            "{error:?}"
        );
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

        assert!(
            matches!(
                error,
                Error::Refused {
                    reason: crate::error::RefusalReason::RoleLacksAct,
                    ..
                }
            ),
            "{error:?}"
        );
        assert!(error.to_string().contains("renameMember"), "{error}");

        let error = rename_member(&store, &owner, "nobody", "robert", 2)
            .await
            .expect_err("a member who is not there was renamed");

        assert!(
            matches!(
                error,
                Error::Refused {
                    reason: crate::error::RefusalReason::MemberMissing,
                    ..
                }
            ),
            "{error:?}"
        );

        // and nothing was written by any of them.
        let mut usernames: Vec<String> = super::members(&store, &owner)
            .await
            .expect("the members")
            .into_iter()
            .map(|member| member.username)
            .collect();
        usernames.sort_unstable();

        assert_eq!(usernames, vec!["bob", "olivia", "sami"]);
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
        let directory = scratch("reissue-epoch");
        let (store, owner, link, workspace_id, _) = owned(&directory).await;
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
}
