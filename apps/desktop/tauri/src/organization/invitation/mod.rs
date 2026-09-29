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
//! manager hands over themselves (effort 826, requirement 8). The interface says so and
//! shows it with one copy control. *Effort 824 handed over three things, the link, the username
//! and a generated password; the password is inside the link now, and the username is read off the
//! row the link opens.*
//!
//! **What an account is.** A member row with a vault sealed under a generated password nothing
//! stores and `must_change_password` set; the content key sealed to the new member's public key; a
//! grant on the organization database, which is the maker's own credential re-sealed, so the
//! member can pull the directory once their vault is open; and a grant on each workspace named, at
//! the access asked for, so a manager grants what they can reach themselves and a read-only
//! grant is minted on the owner's machine as every read-only grant is. **No invitation row and no
//! link**: the account holds no password anybody knows until its first link is opened.
//!
//! **Every account holds a certificate, issued from the maker's own** (effort 838). The account is
//! made in one role with one override, the role ranked below the maker's and neither naming a flag
//! the maker does not hold (requirement 7), and its certificate carries what the two compute as its
//! ceiling and the role's rank. The maker's certificate issues it, so a manager makes a signer with
//! the owner's machine off and nobody derives the organization key (requirement 9). *Until then
//! only the owner could, because a certificate was signed by the organization key.*
//!
//! **The row carries the verifying half of the key the member will sign with.** It is derived
//! from the vault secret drawn here, which is the one moment anybody holds that secret, and the
//! certificate issued beside the row names it.
//!
//! **Every act here on somebody else's account is from above** (effort 838, requirement 7):
//! making an account, a link and a reset each read the maker's verified row for what they may do
//! and how high they stand (`session::actor`), and refuse an account whose role does not rank
//! below theirs. None of them reads the session's snapshot of the role.
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
//! it is a holder of `renameMember`'s, from above like every other act on an account, never the
//! member's own and never the owner's, and it moves nothing else on the row.
//!
//! **Every account's row stands on a directory grant** (effort 838). Making an account and
//! building one again, the reset and an invitation-kind link, write the account's grant on the
//! organization database under the actor's certificate, and a grant is only `grantWorkspace`'s to
//! sign, so each refuses an actor without it by name before anything is written.
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
//! deliberately. A reset keeps the member's role and override as they were (826, requirement 6),
//! and issues their fresh certificate from the resetter's; the rows the old one signed are re-signed
//! under the resetter first, and a row the resetter could not sign refuses the reset by name.

mod account;
pub mod arrival;
mod command;
pub mod connect;
pub mod join;
pub mod link;
pub mod machine;
mod roster;
mod username;

pub use account::*;
pub use command::*;
pub use roster::*;
pub use username::*;

use serde::{Deserialize, Serialize};

use crate::{
    diagnostics,
    error::{Error, RefusalReason},
    turso::platform::{AccessLevel, TursoPlatform},
};

use super::{
    member::vault::{KdfParams, open_content, seal_to_public_key},
    role::permission::{self, Flag},
    session::{MemberSession, actor, rank_of},
    setup::{SHIPPING_KDF, credential_expiry},
    store::{InvitationRecord, MachineLinkRecord, OrganizationStore, Signer},
    workspace::signer_of,
};
use link::{Half, HalfKind, LinkPayload, Locator, seal_payload};

/// How long an invitation stands: a week, which is long enough to send a link on Friday and have
/// it opened on Monday, and short enough that a link in an old message is not a way in.
pub const INVITATION_LIFETIME_MS: i64 = 7 * 24 * 60 * 60 * 1000;

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
/// in. Owners and managers hold both by role, so no default role moves.
///
/// **From above only** (effort 838, requirement 7): the account's role ranks below the maker's. A
/// link for an account with no password yet writes its row again, which only a certificate ranked
/// above it signs, and a machine link is held to the same line so that who may hand an account a
/// way in does not turn on which of the two it is.
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

    let actor = actor(store, session).await?;

    permission::require_any(
        actor.row.effective,
        &[Flag::InviteMember, Flag::ResetPassword],
    )?;

    let members = store.members(&session.verifying_key).await?;
    let member = writable_account(
        &members,
        member_id,
        "an owner is handed no link. the organization is reached with their own turso account",
    )?
    .clone();

    actor.outranks(
        rank_of(store, session, &member).await?,
        "that member's role is not below yours, so their link is made by somebody who ranks above \
         them",
    )?;

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
            reseal_account(store, session, &actor, platform, &member, kdf_params, now).await?;

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
/// mints, so a manager's invitation and a member's own link both carry the grant their
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
    let link = super::invitation::link::JoinLink::decode(join_link).expect("the invitation link");

    super::invitation::link::open_payload(
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
    /// the role the account holds, by id: `manager` or `member`, or a custom role's.
    pub role: &'a str,
    pub workspaces: &'a [WorkspaceGrant],
}

/// Make an account and the first link for it, as a test needs both. The account holds the role and
/// no override, so it carries the role's own mask, which is what every invitation wrote before the
/// override became a parameter.
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
        0,
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
    let invitation_id = super::invitation::link::JoinLink::decode(&made.link)
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
    use super::{
        CODE_LENGTH, INVITATION_LIFETIME_MS, Invitation, InvitationStanding, make_account_and_link,
        reset_account, unset_password,
    };
    use crate::credential::{CredentialStore, Memory};
    use crate::error::Error;
    use crate::machine::RemoteSyncStore;
    use crate::organization::HeldOrganization;
    use crate::organization::invitation::link::{
        HalfKind, JoinLink, LinkPayload, Locator, open_payload,
    };
    use crate::organization::invitation::{
        AccountAndLink, WorkspaceGrant, create_account, locator, make_link,
    };
    use crate::organization::lease::apply::Pipeline;
    use crate::organization::member::vault::KdfParams;
    use crate::organization::role::permission;
    use crate::organization::session::{
        CredentialSlot, MemberSession, sign_in, sign_in_by_username,
    };
    use crate::organization::setup::{
        CreateOrganization, Remote, create_organization, credential_expiry,
    };
    use crate::organization::store::OrganizationStore;
    use crate::organization::workspace::create_workspace;
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
        let joined = store.organization.clone().expect("the record");
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

        assert!(
            machine.organization.is_none(),
            "the machine has prior state"
        );

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

    /// Ticket 20, the human's first ask: **a link is made by a holder of `inviteMember` or of
    /// `resetPassword`, and by nobody else.**
    ///
    /// `unset_password` beside this act takes an account's password away and is `resetPassword`'s;
    /// a link is the only thing that gives one back. Held to `inviteMember` alone, a member widened
    /// with the second and not the first could lock somebody out and not let them in, which is what
    /// the spec recorded under Risks and the human struck on 2026-09-16. Owners and managers hold
    /// both by role, so what is read here is a manager whose override takes `inviteMember` away:
    /// a link is made only from above (effort 838, requirement 7), and a plain member ranks above
    /// nobody.
    ///
    /// The account the link is made for has a password and nobody signed in on it, so the link is
    /// the machine kind and the row behind it is unsigned: what is under test is the act and not
    /// what the maker can sign.
    #[tokio::test]
    async fn a_link_is_made_by_a_holder_of_either_act_and_by_nobody_else() {
        let credentials = Memory::new();
        let directory = scratch("link-acts");
        let (store, owner, link, _, _) = owned(&credentials, &directory).await;
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
        let (sami, _) = opened_as(
            &credentials,
            &store,
            &owner,
            &link,
            &subject.id,
            "sami",
            NOW,
        )
        .await;

        // a manager holding `resetPassword` and not `inviteMember`.
        let resetter = create_account(
            &store,
            &owner,
            no_platform(),
            "rita.reset",
            permission::MANAGER,
            permission::mask_of(&[permission::Flag::InviteMember]),
            &[],
            test_cost(),
            NOW,
        )
        .await
        .expect("the narrowed manager could not be made");
        let (rita, _) = opened_as(
            &credentials,
            &store,
            &owner,
            &link,
            &resetter.id,
            "rita",
            NOW + 2,
        )
        .await;

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

        // and a member holding neither act is refused, with both named before anything about
        // rank: a caller told only the first would go looking for a bit they do not need.
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
        let credentials = Memory::new();
        let directory = scratch("standing");
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

        crate::organization::invitation::join::accept(
            &credentials,
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
            sign_in_by_username(&credentials, &store, &held, "sami.staff", CHOSEN, &slot())
                .await
                .is_err(),
            "the reset left the old password admitting them"
        );

        let next = scratch("standing-next");
        let mut next_machine = fresh_machine(&next);
        let (_, session) = crate::organization::invitation::join::accept(
            &credentials,
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

    /// What an invitation hands the inviter: one link, the organization's own with the invitation's
    /// half in it, whose secret is the generated password and is spelled nowhere else on the
    /// answer; the username as the row seals it; and what it writes: a member row the secret
    /// opens, and an invitation row naming that member with the secret sealed to the issuer.
    #[tokio::test]
    async fn an_invitation_makes_a_member_and_one_link_carrying_the_secret() {
        let credentials = Memory::new();
        let directory = scratch("invite");
        let (store, owner, link, workspace_id, _) = owned(&credentials, &directory).await;
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
            crate::organization::member::vault::unseal_with_secret_key(
                &owner.secret,
                &row.sealed_secret,
            )
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
        assert_eq!(member.permissions, permission::MEMBER_ROLE.mask);
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

    /// Requirement 23: the invitation lapses and the link does not, and reissuing makes a fresh
    /// vault under a fresh secret with the old one dead and hands a fresh link over the same
    /// organization. *Revoking was read here too, under effort 826's requirement 15, until effort
    /// 828 found nothing calling it.*
    #[tokio::test]
    async fn an_invitation_lapses_and_is_reissuable_while_the_link_stands() {
        let credentials = Memory::new();
        let directory = scratch("lifetime");
        let (store, owner, link, workspace_id, _) = owned(&credentials, &directory).await;
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

    /// Effort 826, requirement 5 at the invitation: a read-only grant is minted, so it is the
    /// owner's with the authority in hand. The owner with a platform invites into a workspace at
    /// read-only and the grant says so; the owner without one, and a manager holding every
    /// act, are each refused by name before anything is written.
    #[tokio::test]
    async fn a_read_only_invitation_is_minted_on_the_owners_machine_and_refused_elsewhere() {
        let credentials = Memory::new();
        let directory = scratch("read-only");
        let (store, owner, link, workspace_id, platform) = owned(&credentials, &directory).await;
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
            3,
        )
        .await
        .expect("the manager");
        let mut ada = sign_in(
            &store,
            &joined_as(&owner, &manager.member_id, permission::MANAGER),
            &secret_of(&manager),
            &slot(),
        )
        .await
        .expect("the manager did not sign in");
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
        .expect_err("a manager minted a read-only grant");

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
        let credentials = Memory::new();
        let directory = scratch("sealed-payload");
        let (store, owner, link, _, _) = owned(&credentials, &directory).await;
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

    /// A link for an account with no password yet re-seals its grants, and a grant the maker cannot
    /// seal again is taken off the row and named in the answer, as a reset names it: nobody is
    /// told otherwise, and the person opening the link would find the workspace missing.
    #[tokio::test]
    async fn a_link_made_by_somebody_who_cannot_reach_a_workspace_says_which_grant_it_dropped() {
        let credentials = Memory::new();
        let directory = scratch("dropped-grant");
        let (store, owner, link, workspace_id, _) = owned(&credentials, &directory).await;
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
        .expect("the manager");
        let mut ada = sign_in(
            &store,
            &joined_as(&owner, &manager.member_id, permission::MANAGER),
            &secret_of(&manager),
            &slot(),
        )
        .await
        .expect("the manager did not sign in");
        ada.must_change_password = false;

        // the owner, who holds the workspace, makes the account into it; the manager, who
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
}
