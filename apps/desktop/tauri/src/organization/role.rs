//! what a member may do, changed from their row: the role they are called, the acts they carry,
//! and the certificate that follows both.
//!
//! **The role is a name and the permissions are the truth** (effort 826, requirement 6). A role is
//! the bundle somebody was invited as and the word the members list shows; what a command asks
//! before it acts is the number on the verified row, so widening and narrowing are writes to that
//! number and the role travels with them as the label.
//!
//! **Giving somebody an act that signs rows is the owner's alone, still.** Six of the seven acts
//! write a signed row, and a row is only accepted from a member a certificate names. The chain is
//! delegated since effort 838, so a manager's certificate could issue one, but the flows move onto
//! it in the tickets after the chain's: until then a holder of `changeRole` who is not the owner
//! narrows anybody and widens only with `renameWorkspace`, the one act that signs nothing
//! (`workspace::rename_workspace` writes the sealed name outside the signature), and the refusal
//! names the owner.
//!
//! **The certificate follows the permissions, in the same call** ([`reissue`]).
//! A member whose row signs is issued a certificate from the actor's, under a fresh id, over the
//! `signing_public_key` their row has carried since it was written, with the row's ceiling and
//! rank; a member whose row moved away from their certificate, or who signs nothing any more, has
//! the rows it signed re-signed under the actor and a revocation written for it, the pair
//! `removal::retire_member` performs too (`store::re_sign_rows_of_certificate`,
//! `authority::revoke`). `workspace::signer_of` is untouched: a widened member signs because a
//! certificate names their key, never because something read their role.
//!
//! **Nobody changes their own row and nobody changes the owner's.** The first keeps the act an act
//! on somebody else, so an administrator cannot grant themselves what they were not given; the
//! second is requirement 6's, and the organization is the owner's.
//!
//! **Which leaves one way for the owner's row to change, and it is two acts on two machines**
//! (effort 828, requirement 22). The owner offers the organization to an account whose password is
//! set; that person accepts on a machine they are signed in on, with their own password, and the
//! organization key becomes what their vault derives. The root is issued to them under it, and
//! every certificate the founder issued is issued again from it with the same ids and signing
//! keys, so nothing an administrator signed is disturbed; a `succession` row signed by the old key
//! over the new is what lets every other machine follow. An owner's way
//! back is then their password and nothing read out of the directory, founder or transferee alike.
//! *It was one act that sealed the founder's key into the new owner's row and left the key
//! unchanged, until review round one found that a way back resting on that seal rests on the
//! database it is meant to judge.*

use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD as BASE64URL};

use crate::{
    diagnostics,
    error::{Error, RefusalReason},
    persisted::Persisted,
    sync::RemoteSyncStore,
};

use super::{
    HeldOrganization,
    authority::{
        AdministratorKey, Certificate, Chain, Issue, OrganizationKey, SuccessionAuthority,
        VERIFYING_KEY_BYTES, issue_certificate, issue_root_certificate, revoke, sign_succession,
        unused_certificate_id, verify_succession,
    },
    invite::{MemberFacts, members, random_id},
    permission::{self, Administration, Flag},
    session::{MemberSession, acting_row, permissions_on_row, verifying_key_of},
    setup::{ADMINISTRATOR_KEY_PURPOSE, ORGANIZATION_KEY_PURPOSE, owner_key_from},
    store::{MemberRecord, OrganizationRecord, OrganizationStore, Signer, SuccessionRecord},
    vault::{SECRET_KEY_BYTES, open_vault, seal_to_public_key, unseal_with_secret_key},
    workspace::{require_owner, signer_of},
};

/// The one act that signs nothing. Everything else in the table writes a row an administrator
/// certificate has to stand behind, which is what makes widening into it the owner's.
const SIGNS_NOTHING: Administration = Administration::RenameWorkspace;

/// Whether a stored permission value carries any act that writes a signed row.
///
/// Read here and by `invite::write_account`, which needs the same answer for the same reason: a
/// row carrying one of these acts is only worth writing where the certificate behind it can be
/// issued, and issuing one is the owner's.
pub(super) fn signs_rows(permissions: i64) -> bool {
    Administration::ALL
        .iter()
        .filter(|act| **act != SIGNS_NOTHING)
        .any(|act| permission::permits(permissions, *act))
}

/// Where a member stands in the chain: the one role they hold, their override, what the two give
/// them, and the rank of the role.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) struct Standing<'a> {
    pub role_id: &'a str,
    pub override_mask: i64,
    pub effective: i64,
    pub rank: i64,
}

/// A member's standing for a role named by its word and the administration acts a command names
/// (`permission::role_id_of_word`, `permission::override_for_acts`), read against the role's
/// verified row.
///
/// **A bridge** for the commands that still take a word and a number (`invite`, `change_role`),
/// until they take a role id and an override (effort 838, tickets 05 and 07).
pub(super) async fn standing_of(
    store: &OrganizationStore,
    session: &MemberSession,
    word: &str,
    acts: i64,
) -> Result<Standing<'static>, Error> {
    let role_id = permission::role_id_of_word(word);
    let (mask, rank) = store.role_standing(&session.verifying_key, role_id).await?;
    let override_mask = permission::override_for_acts(role_id, mask, acts);

    Ok(Standing {
        role_id,
        override_mask,
        effective: permission::effective(mask, override_mask),
        rank,
    })
}

/// Whether a member whose permissions are these signs rows, and so holds a certificate: a manager
/// always, and anybody else who carries an act that writes a signed row.
pub(super) fn signs(role_id: &str, effective: i64) -> bool {
    role_id == permission::MANAGER || role_id == permission::OWNER || signs_rows(effective)
}

/// Re-issue a member's certificate: issue a fresh one for their standing, and retire every older
/// one after re-signing what it signed (effort 838). **The three in one transaction**, so a
/// refusal or a failure part way leaves the chain as it was.
///
/// `signing` is the member's signing key and their standing, or `None` for a member who is to hold
/// no certificate: every live one they hold is retired and none is issued. The new certificate is
/// issued down from `signer`'s, carrying the member's effective permissions as its ceiling and
/// their role's rank, so the issue itself refuses a standing wider or higher than the actor's
/// (`authority::issue_certificate`). Where the member already holds exactly one live certificate
/// naming that key, ceiling and rank, nothing is written.
///
/// **Refused, naming what is needed, where the actor could not sign a row the old certificate
/// signed** (`store::re_sign_rows_of_certificate`): re-signing a grant needs `grantWorkspace`, and
/// deleting it instead would take somebody's access away.
pub(super) async fn reissue(
    store: &OrganizationStore,
    session: &MemberSession,
    signer: &Signer<'_>,
    member_id: &str,
    signing: Option<(&[u8; VERIFYING_KEY_BYTES], Standing<'_>)>,
    now: i64,
) -> Result<(), Error> {
    let live = store
        .live_certificates(&session.verifying_key, member_id)
        .await?;
    let in_step = |certificate: &Certificate| {
        signing.is_some_and(|(key, standing)| {
            &certificate.signing_public_key == key
                && certificate.ceiling == standing.effective
                && certificate.rank == standing.rank
        })
    };

    if (signing.is_some() && live.len() == 1 && in_step(&live[0]))
        || (signing.is_none() && live.is_empty())
    {
        return Ok(());
    }

    store.begin().await?;

    match reissue_within(store, session, signer, member_id, signing, &live, now).await {
        Ok(()) => store.commit().await,
        Err(error) => {
            let _ = store.rollback().await;
            Err(error)
        }
    }
}

/// [`reissue`]'s writes, inside the transaction it opened.
async fn reissue_within(
    store: &OrganizationStore,
    session: &MemberSession,
    signer: &Signer<'_>,
    member_id: &str,
    signing: Option<(&[u8; VERIFYING_KEY_BYTES], Standing<'_>)>,
    live: &[Certificate],
    now: i64,
) -> Result<(), Error> {
    let issued_at = now.to_string();

    if let Some((signing_public_key, standing)) = signing {
        let id = unused_certificate_id(&store.certificates().await?, member_id, &issued_at);

        store
            .write_certificate(&issue_certificate(
                signer.key,
                signer.certificate,
                Issue {
                    id: &id,
                    member_id,
                    signing_public_key,
                    ceiling: standing.effective,
                    rank: standing.rank,
                    issued_at: &issued_at,
                },
            )?)
            .await?;
    }

    for old in live {
        store
            .re_sign_rows_of_certificate(&session.verifying_key, &old.id, signer)
            .await?;
        store
            .write_revocation(&revoke(signer.key, signer.certificate, old, &issued_at)?)
            .await?;
    }

    Ok(())
}

/// What somebody who is not the owner is told when they ask for the organization to be handed on.
pub const ONLY_THE_OWNER_TRANSFERS: &str =
    "only the owner can hand the organization over. it is theirs";

/// What the owner is told when they offer the organization to an account that has no password of
/// its own yet.
///
/// **The whole reason the offer refuses one** (effort 828, requirement 22): the new key is what
/// the accepting account's own vault derives, and an account whose password is not set has no
/// vault anybody but its link can open. The first shape of this act took such an account and left
/// the organization with an owner nobody could sign in as.
pub const AN_UNSET_ACCOUNT_CANNOT_ACCEPT: &str = "that account has no password of its own yet. they open their link and choose one, and then \
     the organization can be offered to them";

/// What somebody is told who accepts an organization nobody offered them, and what the owner is
/// told who withdraws an offer that is not there. One sentence for both, because from where
/// either stands there is nothing to act on but the absence.
pub const NOTHING_WAS_OFFERED: &str = "no offer of this organization stands";

/// What the owner is told who withdraws an offer the other person has accepted (effort 828,
/// requirement 22, the human's word at review round two).
///
/// The withdrawal pulls first, and what it may find is that the offer it is undoing is complete:
/// the directory is re-keyed under the new owner and the succession row is what every other
/// machine follows to it. Deleting that row and writing the seal off a row this session no longer
/// signs would strand every machine that has not followed yet, so a completed succession refuses
/// by name and nothing is written.
pub const THE_OFFER_WAS_ACCEPTED: &str =
    "the offer was accepted already, and the organization is theirs now. nothing was changed";

/// What a session is told whose vault does not derive the key this organization is signed under,
/// where it was about to sign with it (effort 828, requirement 22).
///
/// **A certificate is issued under the pinned key or not at all.** After a handover the founder's
/// vault still derives the key the directory was signed under before, and a session open across
/// the handover would sign a new administrator's certificate with it: a certificate every machine
/// refuses, and with it every row its holder signs. So the two acts that certify a signer read the
/// key through [`organization_key_of`], which refuses a derivation that is not the key the session
/// has pinned.
pub const NOT_THE_KEY_IN_FORCE: &str = "the key your vault derives is not the one this organization is signed under any more. the \
     organization was handed over, and certifying a signer is its owner's";

/// The organization key this session may sign a certificate with: its own derivation, checked
/// against the key it has pinned before anything is signed with it (effort 828, requirement 22).
///
/// Only the owner's vault derives the key in force, founder or transferee, so the comparison is the
/// whole of "this session's row is the owner's under the pinned key" without a read; a session that
/// followed a succession has a new pinned key and the founder's derivation fails against it. The
/// derivation itself is `setup::owner_key_from`, the one place it is made.
pub(super) fn organization_key_of(session: &MemberSession) -> Result<OrganizationKey, Error> {
    let key = owner_key_from(&session.secret)?;

    if key.verifying_key() != session.verifying_key {
        return Err(Error::refused(
            RefusalReason::KeyNotInForce,
            NOT_THE_KEY_IN_FORCE,
        ));
    }

    Ok(key)
}

/// What the acceptance says when the seed sealed onto the row is not the key this machine holds.
///
/// **This is the check that makes the seal safe to keep in the database** (effort 828,
/// requirement 22). A member who can write every row can write a seal of their own onto an
/// account's row; what they cannot do is make it open to the key that account's machine pinned
/// from its link or its first run. So a planted seal reaches here and stops, and nothing has been
/// written by then.
const THE_SEAL_IS_NOT_THIS_KEY: &str = "what was sealed onto your row is not the key this machine holds, so it is not this \
     organization's. nothing was changed";

/// One succession row's signed fields.
///
/// `new_verifying_key` and `accepted_at` are `None` while the offer stands, so the offer and the
/// completion are two preimages over one row, which is what stops a signature being lifted from
/// one onto the other.
fn authority_of(succession: &SuccessionRecord) -> SuccessionAuthority<'_> {
    SuccessionAuthority {
        id: &succession.id,
        offered_member_id: &succession.offered_member_id,
        offered_by: &succession.offered_by,
        offered_at: succession.offered_at,
        old_verifying_key: &succession.old_verifying_key,
        new_verifying_key: succession.new_verifying_key.as_ref(),
        accepted_at: succession.accepted_at,
    }
}

/// The offer that stands, if one does: unaccepted, leaving the key the caller holds, and signed
/// by that key.
///
/// **A row that does not check is skipped rather than refused.** Every other table refuses the
/// whole read on a row that will not verify, because a forged member row means the directory a
/// person is looking at is not the directory. Here the question is only whether an offer exists,
/// and a row anybody could have written is not one: skipping it answers the question correctly,
/// where refusing would let any member stop the owner offering the organization by writing a row
/// of nonsense.
pub(super) async fn standing_offer(
    store: &OrganizationStore,
    organization_verifying_key: &[u8; VERIFYING_KEY_BYTES],
) -> Result<Option<SuccessionRecord>, Error> {
    Ok(store.successions().await?.into_iter().find(|succession| {
        succession.accepted_at.is_none()
            && &succession.old_verifying_key == organization_verifying_key
            && verify_succession(
                organization_verifying_key,
                authority_of(succession),
                &succession.signature,
            )
            .is_ok()
    }))
}

/// Offer the organization to another account: the first of the two acts a handover is (effort
/// 828, requirement 22).
///
/// **Nothing moves here.** The roles stay, the key stays, and every row goes on verifying against
/// the key it was written under. What the offer does is put the outgoing key's seed, sealed to the
/// offered account's public key, on their row, and write a `succession` row signed by the key in
/// force. The owner can take both back with [`withdraw_offer`] until the other person accepts.
///
/// **The seal is the offer's carrier and nobody's anchor.** It says to one account, on a machine
/// that already holds this key, *here is the key you are replacing*; [`accept_ownership`] refuses
/// unless what it opens is the key that machine pinned, so a seal a member planted opens nothing
/// that is then believed. *It was the transferee's standing way back until review round one, which
/// is the shape requirement 22 was rewritten to replace.*
///
/// **An account with no password of its own is refused by name.** The key the acceptance derives
/// comes out of their vault, and an account whose password is not set has none of its own to
/// derive from; the first shape of this act took one and orphaned the organization.
///
/// **One offer at a time.** Two standing offers would mean two accounts each holding a seal of the
/// same seed, and whichever accepted first would leave the other holding an opened key to a
/// directory it no longer signs. The owner withdraws the first to make the second.
///
/// **The password is asked for and tried against the row**, the way `removal::delete_organization`
/// and `password::change_password` try one, so a wrong one refuses before a single row is written
/// and a machine somebody walked away from is not a way to give their organization away.
///
/// **The owner's, asked of the owner's verified row** (`workspace::require_owner`, effort 838,
/// requirement 2), and not of the role the session opened with: [`Flag::TransferOwnership`] is one
/// no role and no override carries, and a session opened as the owner that has handed over since
/// reads as the manager it now is.
pub async fn offer_ownership(
    store: &OrganizationStore,
    session: &MemberSession,
    member_id: &str,
    password: &str,
    now: i64,
) -> Result<MemberFacts, Error> {
    session.settled()?;

    let owner = require_owner(
        store,
        session,
        Flag::TransferOwnership,
        ONLY_THE_OWNER_TRANSFERS,
    )
    .await?;

    if member_id == session.member_id {
        return Err(Error::refused(
            RefusalReason::AlreadyOwner,
            "you are the owner already. name the account that is to have it",
        ));
    }

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

    if member.removed_at.is_some() {
        return Err(Error::refused(
            RefusalReason::MemberRemoved,
            "that member was removed. invite them again if they are to come back",
        ));
    }

    if member.must_change_password {
        return Err(Error::refused(
            RefusalReason::AccountNotSetUp,
            AN_UNSET_ACCOUNT_CANNOT_ACCEPT,
        ));
    }

    if standing_offer(store, &session.verifying_key)
        .await?
        .is_some()
    {
        return Err(Error::refused(
            RefusalReason::OfferPending,
            "this organization is already offered to an account. withdraw that offer \
                      before making another",
        ));
    }

    // the password, tried against the owner's own row rather than trusted from the session: a
    // wrong one says only that the value did not open, and nothing has been written.
    let opened = open_vault(password, &owner.vault)?;

    if opened.public_key() != session.secret.public_key() {
        return Err(Error::Integrity {
            message: "the vault the password opened is not the one this session holds".to_string(),
        });
    }

    // the seed itself, and not the key built from it: what is sealed has to be the thirty-two
    // bytes the other machine will build the same key out of to check it.
    let seed = opened.derive_seed(ORGANIZATION_KEY_PURPOSE)?;
    let organization_key = OrganizationKey::from_bytes(&seed);

    // and the key is checked against what the directory was written under before anything moves,
    // so an owner whose vault yields something else offers nothing.
    if organization_key.verifying_key() != session.verifying_key {
        return Err(Error::Integrity {
            message: "the organization key your vault holds is not the one this directory was \
                      signed under"
                .to_string(),
        });
    }

    let (key, certificate) = signer_of(store, session).await?;
    let signer = Signer {
        key: &key,
        certificate: &certificate,
    };

    store
        .write_member(
            &signer,
            &MemberRecord {
                owner_seed_sealed: Some(seal_to_public_key(&member.vault.public_key, &seed)?),
                updated_at: now,
                ..member.clone()
            },
        )
        .await?;

    let offer = SuccessionRecord {
        id: random_id()?,
        offered_member_id: member_id.to_string(),
        offered_by: session.member_id.clone(),
        offered_at: now,
        old_verifying_key: session.verifying_key,
        new_verifying_key: None,
        accepted_at: None,
        signature: Vec::new(),
    };

    store
        .write_succession(&SuccessionRecord {
            signature: sign_succession(&organization_key, authority_of(&offer)),
            ..offer
        })
        .await?;

    if !store.push().await {
        diagnostics::warn("organization.member.offerNotYetSent")
            .with("member", member_id)
            .write();
    }

    diagnostics::info("organization.member.ownershipOffered")
        .with("member", member_id)
        .write();

    members(store, session)
        .await?
        .into_iter()
        .find(|member| member.id == member_id)
        .ok_or_else(|| Error::Integrity {
            message: "the offered member's row did not read back".to_string(),
        })
}

/// Take the offer back: the succession row goes and the seal comes off the row it was put on.
///
/// The owner's, like the offer, and it needs no password: nothing is being unsealed and nothing
/// the owner holds is at stake in undoing something they did. The seal is cleared first, so a run
/// that stops half way leaves an offer with no seed behind it rather than a seed with no offer
/// naming it, and the acceptance refuses the first by reading the row.
///
/// **An offer the other person has accepted is refused by name** ([`THE_OFFER_WAS_ACCEPTED`]).
/// The command pulls before this runs, and a completed succession leaving the key this session
/// holds, signed by that key, is what the pull may have brought: the organization is theirs, and
/// this session has not followed yet. It is read before the standing offer, because the standing
/// offer's reader skips a completed row and would say no offer stands, which is not what
/// happened, and before the owner's row, which under the key this session holds no longer reads
/// at all: the founder is told what happened rather than that their row did not verify.
///
/// **The owner's, asked of the owner's verified row** (`workspace::require_owner`), like the
/// offer: [`Flag::TransferOwnership`] is one no role and no override carries.
pub async fn withdraw_offer(
    store: &OrganizationStore,
    session: &MemberSession,
    now: i64,
) -> Result<(), Error> {
    session.settled()?;

    if store.successions().await?.iter().any(|succession| {
        succession.accepted_at.is_some()
            && succession.old_verifying_key == session.verifying_key
            && verify_succession(
                &session.verifying_key,
                authority_of(succession),
                &succession.signature,
            )
            .is_ok()
    }) {
        return Err(Error::refused(
            RefusalReason::OfferAccepted,
            THE_OFFER_WAS_ACCEPTED,
        ));
    }

    require_owner(
        store,
        session,
        Flag::TransferOwnership,
        ONLY_THE_OWNER_TRANSFERS,
    )
    .await?;

    let offer = standing_offer(store, &session.verifying_key)
        .await?
        .ok_or_else(|| Error::refused(RefusalReason::NothingOffered, NOTHING_WAS_OFFERED))?;
    let offered = store
        .members(&session.verifying_key)
        .await?
        .into_iter()
        .find(|member| member.id == offer.offered_member_id);

    if let Some(offered) = offered.filter(|member| member.owner_seed_sealed.is_some()) {
        let (key, certificate) = signer_of(store, session).await?;
        let signer = Signer {
            key: &key,
            certificate: &certificate,
        };

        store
            .write_member(
                &signer,
                &MemberRecord {
                    owner_seed_sealed: None,
                    updated_at: now,
                    ..offered
                },
            )
            .await?;
    }

    store.delete_succession(&offer.id).await?;

    if !store.push().await {
        diagnostics::warn("organization.member.withdrawalNotYetSent")
            .with("member", offer.offered_member_id.as_str())
            .write();
    }

    diagnostics::info("organization.member.ownershipOfferWithdrawn")
        .with("member", offer.offered_member_id.as_str())
        .write();

    Ok(())
}

/// Accept the organization: the second act, on the offered account's own machine (effort 828,
/// requirement 22).
///
/// **The organization key becomes what this person's vault derives**, which is exactly what the
/// founder's key is over the founder's secret. That is the whole point of the two acts: an owner's
/// way back is their password, and nothing an owner holds is read out of the directory their
/// password is meant to judge.
///
/// **Two things are checked before a byte is written.** The offer has to be signed by the key this
/// machine pinned, and the seed sealed onto this row has to be that same key. The second is what
/// makes the seal safe to leave in a database every member can write: anybody can put a seal on a
/// row, and nobody but the owner can put one there that opens to the key this machine already
/// holds from its link or its first run. Before either, the accepting row is read the way every
/// act reads its own (`session::acting_row`): a member removed, or signed out everywhere, since
/// the offer was made is refused by name rather than handed the organization.
///
/// **What the re-key touches, and what it deliberately does not** (effort 838). The new owner is
/// issued the root under the new key. The rows the founder signed as owner are re-signed under it,
/// because the founder now ranks as a manager and a manager's certificate does not cover a row
/// about another manager. Every live certificate the founder issued directly is issued again from
/// the new root with the same id, the same fields and the same signing key, so every row its
/// holder signed goes on verifying; the founder's own is issued again the same way, as a
/// manager's, with the manager role's mask and rank and no override, and their row names the
/// manager role. A certificate issued further down names an issuer whose id and key did not move,
/// and is not touched. The organization row carrying the key is the last row that changes.
///
/// **What the founder revoked as owner stays revoked.** A revocation names its revoker by id, and
/// the founder's id now names a manager's certificate: one of a certificate ranked below a manager
/// goes on counting, and a revoked manager's certificate is not issued again, so it names as its
/// issuer a certificate it no longer ranks below and walks nowhere.
///
/// **The succession is completed under the old key**, not the new one, and that is the one
/// signature the whole design rests on: a machine that pinned the old key has nothing else it can
/// check the change against ([`follow_succession`]).
///
/// **Everything happens on one replica and one push carries it.** A failure part way leaves a
/// directory half re-keyed on this machine, which the next run of this act cannot repair; that is
/// the cost of there being no transaction across a replicated database, and it is the same cost
/// `removal::retire_member`'s re-signing pays.
pub async fn accept_ownership(
    store: &OrganizationStore,
    session: &mut MemberSession,
    machine: &mut Persisted<RemoteSyncStore>,
    password: &str,
    now: i64,
) -> Result<(), Error> {
    session.settled()?;

    let held = machine.organization.clone().ok_or_else(|| {
        Error::refused(
            RefusalReason::NoOrganization,
            "this machine holds no organization",
        )
    })?;
    // the key this machine pinned when it joined, and not the session's copy of it: the pin is
    // what the offer has to have been signed by, and reading it from the record is what makes
    // that sentence true rather than circular.
    let pinned = verifying_key_of(&held)?;

    if pinned != session.verifying_key {
        return Err(Error::Integrity {
            message: "this machine's record and this session hold different keys. sign in again"
                .to_string(),
        });
    }

    // this member's own row, with the three refusals every act's gate makes in front of it and
    // before the offer is even looked for: a row that is gone, one signed as removed, and one
    // whose sessions were ended from another machine (effort 828, requirement 22). An offer is a
    // fact about the row and not about the person: a removal takes the offer with the row, but a
    // replica that has not pulled the removal still holds both, and a sign-out everywhere takes
    // nothing off the row at all. Either way the person is refused for what happened to them,
    // rather than told no offer stands.
    let mine = acting_row(store, session).await?;
    let offer = standing_offer(store, &pinned)
        .await?
        .filter(|offer| offer.offered_member_id == session.member_id)
        .ok_or_else(|| Error::refused(RefusalReason::NothingOffered, NOTHING_WAS_OFFERED))?;
    let rows = store.members(&pinned).await?;
    let founder = rows
        .iter()
        .find(|member| member.id == offer.offered_by)
        .ok_or_else(|| {
            Error::refused(
                RefusalReason::OffererGone,
                "the account that offered you the organization is no longer in it",
            )
        })?;

    // the password, tried against this member's own row, so a machine somebody walked away from
    // is not a way to take an organization.
    let opened = open_vault(password, &mine.vault)?;

    if opened.public_key() != session.secret.public_key() {
        return Err(Error::Integrity {
            message: "the vault the password opened is not the one this session holds".to_string(),
        });
    }

    // the new organization key: this person's own derivation, the founder's derivation over the
    // founder's secret.
    let new_key = owner_key_from(&opened)?;
    let new_verifying_key = new_key.verifying_key();

    if new_verifying_key == pinned {
        return Err(Error::Integrity {
            message: "your vault already derives this organization's key".to_string(),
        });
    }

    // and the seal, which is refused unless it opens to the key this machine pinned.
    let planted = || Error::Integrity {
        message: THE_SEAL_IS_NOT_THIS_KEY.to_string(),
    };
    let sealed = mine
        .owner_seed_sealed
        .as_deref()
        .ok_or_else(|| Error::refused(RefusalReason::NothingOffered, NOTHING_WAS_OFFERED))?;
    let old_seed = unseal_with_secret_key(&opened, sealed).map_err(|_| planted())?;
    let old_seed =
        <[u8; SECRET_KEY_BYTES]>::try_from(old_seed.as_slice()).map_err(|_| planted())?;
    let old_key = OrganizationKey::from_bytes(&old_seed);

    if old_key.verifying_key() != pinned {
        return Err(planted());
    }

    // the key this member signs rows with, which their row has carried since it was written. The
    // certificate below names it, so a row that names something the vault does not derive is
    // refused here rather than producing a certificate that authorises nobody.
    let administrator_key =
        AdministratorKey::from_bytes(&opened.derive_seed(ADMINISTRATOR_KEY_PURPOSE)?);

    if administrator_key.verifying_key() != mine.signing_public_key {
        return Err(Error::Integrity {
            message: "your row names a signing key your vault does not derive".to_string(),
        });
    }

    // **from here on the directory is being re-keyed**, and every refusal above has already been
    // made.
    let (held_certificates, held_revocations) = store.chain_rows().await?;
    let before = Chain::new(&pinned, &held_certificates, &held_revocations);
    // the root the key being left signed, which is the founder's: what signed every row the owner
    // wrote, and what issued every certificate the owner gave.
    let old_root = held_certificates
        .iter()
        .find(|certificate| certificate.is_root() && before.live(&certificate.id).is_ok())
        .cloned()
        .ok_or_else(|| Error::Integrity {
            message: "the organization's root certificate does not verify under this machine's key"
                .to_string(),
        })?;
    let issued_at = now.to_string();
    // what the founder stands as from here on: the manager, with no override, as the manager
    // role's verified row gives it. Read while the role rows still verify under the key being
    // left: once the rows move under the new root, only the new key reads them.
    let (manager_mask, manager_rank) = store.role_standing(&pinned, permission::MANAGER).await?;
    let as_manager = Standing {
        role_id: permission::MANAGER,
        override_mask: 0,
        effective: permission::effective(manager_mask, 0),
        rank: manager_rank,
    };

    // the new root: this person's, under the key their own vault derives (effort 838).
    let root = issue_root_certificate(
        &new_key,
        &unused_certificate_id(&held_certificates, &session.member_id, &issued_at),
        &session.member_id,
        &mine.signing_public_key,
        &issued_at,
    );

    store.write_certificate(&root).await?;

    let signer = Signer {
        key: &administrator_key,
        certificate: &root,
    };

    // every row the founder signed as owner moves under the new root first, read under the key
    // being left: the founder is about to rank as a manager, and a manager's certificate does not
    // cover a row about another manager. The two rows whose roles swap are left, because they
    // are written afresh below, and the founder's as it stands names the owner's role, which only
    // its own holder's root signs.
    store
        .re_sign_rows_of_certificate_but(
            &pinned,
            &old_root.id,
            &signer,
            &[founder.id.as_str(), session.member_id.as_str()],
        )
        .await?;

    // every certificate the founder issued directly is issued again, under the same id with the
    // same fields, from the new root, so every row it signed goes on verifying. Only what is live
    // under the key being left: a revoked one stays where it was, and nothing re-issues it. The
    // table is read raw, and a certificate no row names is checked by nothing else, so one written
    // by anybody holding the credential, with a signature nothing ever verified, would otherwise
    // leave here signed from the new root; it is left as it is rather than refusing the handover,
    // because a planted row must not be able to hold the organization to its founder.
    for certificate in &held_certificates {
        if certificate.issuer_certificate_id.as_deref() != Some(old_root.id.as_str()) {
            continue;
        }

        if let Err(refusal) = before.live(&certificate.id) {
            diagnostics::warn("organization.succession.certificateNotReissued")
                .with("certificate", certificate.id.as_str())
                .with("member", certificate.member_id.as_str())
                .with("reason", refusal.to_string())
                .write();

            continue;
        }

        store
            .write_certificate(&issue_certificate(
                &administrator_key,
                &root,
                Issue {
                    id: &certificate.id,
                    member_id: &certificate.member_id,
                    signing_public_key: &certificate.signing_public_key,
                    ceiling: certificate.ceiling,
                    rank: certificate.rank,
                    issued_at: &certificate.issued_at,
                },
            )?)
            .await?;
    }

    // and the founder's own, under its id and key, as a manager's: what they sign with from now
    // on, and what the revocations they signed as owner go on naming.
    store
        .write_certificate(&issue_certificate(
            &administrator_key,
            &root,
            Issue {
                id: &old_root.id,
                member_id: &old_root.member_id,
                signing_public_key: &old_root.signing_public_key,
                ceiling: as_manager.effective,
                rank: as_manager.rank,
                issued_at: &old_root.issued_at,
            },
        )?)
        .await?;

    store
        .write_member(
            &signer,
            &MemberRecord {
                role_id: permission::OWNER.to_string(),
                override_mask: 0,
                // the seal was the offer's carrier and the offer is spent.
                owner_seed_sealed: None,
                updated_at: now,
                ..mine.clone()
            },
        )
        .await?;
    store
        .write_member(
            &signer,
            &MemberRecord {
                role_id: as_manager.role_id.to_string(),
                override_mask: as_manager.override_mask,
                owner_seed_sealed: None,
                updated_at: now,
                ..founder.clone()
            },
        )
        .await?;

    let organization = store
        .organization()
        .await?
        .ok_or_else(|| Error::Integrity {
            message: "the organization row is not in this directory".to_string(),
        })?;

    store
        .write_organization(&OrganizationRecord {
            verifying_key: new_verifying_key,
            ..organization
        })
        .await?;

    let completed = SuccessionRecord {
        new_verifying_key: Some(new_verifying_key),
        accepted_at: Some(now),
        signature: Vec::new(),
        ..offer
    };

    store
        .write_succession(&SuccessionRecord {
            // by the old key, over the new: the one thing a machine holding the old key can check.
            signature: sign_succession(&old_key, authority_of(&completed)),
            ..completed
        })
        .await?;

    // and this machine follows its own succession, before anything reads a row again.
    session.verifying_key = new_verifying_key;
    session.role = permission::OWNER.to_string();
    session.permissions = permission::OWNER_ROLE.mask;

    machine.organization = Some(HeldOrganization {
        verifying_key: BASE64URL.encode(new_verifying_key),
        role: Some(permission::OWNER.to_string()),
        ..held
    });
    machine.commit()?;

    if !store.push().await {
        diagnostics::warn("organization.member.ownershipNotYetSent")
            .with("member", session.member_id.as_str())
            .write();
    }

    diagnostics::info("organization.member.ownershipAccepted")
        .with("member", session.member_id.as_str())
        .write();

    Ok(())
}

/// Follow the organization's successions from the key this machine pinned to the key it should be
/// holding now, and pin that one (effort 828, requirement 22).
///
/// **It runs only where the pinned key has stopped verifying the rows**, which is the one sign a
/// machine has of a handover it was not present for. A machine whose key still reads the directory
/// is left alone, so this costs a machine that is up to date one verified read it was going to
/// make anyway.
///
/// **Each link is checked against the key the last one handed over**, starting from what this
/// machine pinned: the offer and the completion are signed by the key being left, so a chain of
/// handovers is a chain of signatures each made by the key the reader has just satisfied itself
/// about. A machine that pinned neither end of the chain follows nothing and refuses the rows as
/// it refuses any row it cannot verify, which is what it did before this existed.
///
/// **The new key is pinned only once it reads the directory.** A chain that ends somewhere the
/// rows do not verify is a chain that has not finished arriving on this replica, and pinning its
/// end would swap one unreadable key for another.
pub async fn follow_succession(
    store: &OrganizationStore,
    machine: &mut Persisted<RemoteSyncStore>,
) -> Result<Option<[u8; VERIFYING_KEY_BYTES]>, Error> {
    let Some(held) = machine.organization.clone() else {
        return Ok(None);
    };
    let pinned = verifying_key_of(&held)?;

    if store.members(&pinned).await.is_ok() {
        return Ok(None);
    }

    let successions = store.successions().await?;
    let mut key = pinned;

    // bounded by the number of rows there are, so a cycle somebody wrote is a run that ends
    // rather than one that does not.
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

    if key == pinned || store.members(&key).await.is_err() {
        return Ok(None);
    }

    let organization_id = held.id.clone();

    machine.organization = Some(HeldOrganization {
        verifying_key: BASE64URL.encode(key),
        ..held
    });
    machine.commit()?;

    diagnostics::info("organization.succession.followed")
        .with("organization", organization_id.as_str())
        .write();

    Ok(Some(key))
}

/// Change what a member is called and what they may do, and keep their certificate in step.
///
/// `permissions` is written as given rather than derived from `role`, which is the whole of
/// requirement 6's second half: a role is a bundle to start from and a single act can be added to
/// or taken off a row afterwards. What comes back is the member as the list will show them.
pub async fn change_role(
    store: &OrganizationStore,
    session: &MemberSession,
    member_id: &str,
    role: &str,
    permissions: i64,
    now: i64,
) -> Result<MemberFacts, Error> {
    session.settled()?;
    permission::require(
        permissions_on_row(store, session).await?,
        Administration::ChangeRole,
    )?;

    if member_id == session.member_id {
        return Err(Error::refused(
            RefusalReason::NotYourself,
            "you cannot change your own role or permissions. another administrator can",
        ));
    }

    if role != permission::ADMINISTRATOR && role != permission::MEMBER {
        return Err(Error::refused(
            RefusalReason::RoleUnknown,
            "a member is an administrator or a member",
        ));
    }

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

    if member.role_word() == permission::OWNER {
        return Err(Error::refused(
            RefusalReason::OwnerProtected,
            "an owner's role is not changed. the organization is theirs",
        ));
    }

    if member.role_word() == permission::REMOVED {
        return Err(Error::refused(
            RefusalReason::MemberRemoved,
            "that member was removed. invite them again if they are to come back",
        ));
    }

    // the one widening that needs the organization key, refused before anything is written. The
    // role is held to the same line as the acts, because `administrator` is the word for carrying
    // every one of them and a row that says so without a certificate behind it is a promise the
    // chain will not keep.
    let widens = Administration::ALL.iter().any(|act| {
        *act != SIGNS_NOTHING
            && permission::permits(permissions, *act)
            && !permission::permits(member.effective, *act)
    }) || (role == permission::ADMINISTRATOR
        && member.role_word() != permission::ADMINISTRATOR);

    if widens && session.role != permission::OWNER {
        return Err(Error::refused(
            RefusalReason::OwnerOnly,
            "only an owner can give somebody an act that signs rows, because certifying \
                      a signer needs the organization key. ask the owner, or change what they may \
                      do without it",
        ));
    }

    let (key, certificate) = signer_of(store, session).await?;
    let signer = Signer {
        key: &key,
        certificate: &certificate,
    };
    let signed_before = signs_rows(member.effective);
    let signs_now = signs_rows(permissions);
    let standing = standing_of(store, session, role, permissions).await?;

    // their first signing act is the owner's to give, founder or transferee, refused by name where
    // the session's vault does not derive the key it has pinned (effort 828, requirement 22). A
    // row written as a signer with no certificate to follow is the promise the chain will not
    // keep, so the refusal comes first. *The key signed the certificate itself until effort 838;
    // the owner's certificate issues it now, and the check stands until the flows move onto the
    // delegated chain.*
    if signs_now && !signed_before {
        organization_key_of(session)?;
    }

    // the certificate follows, before the row: issued over the key the row has carried since it
    // was written, which is the key `workspace::signer_of` will derive from their own vault, and
    // the old one retired where the row moved away from it. First, so a re-issue the actor could
    // not complete refuses the change with nothing written (effort 838).
    reissue(
        store,
        session,
        &signer,
        member_id,
        signs(standing.role_id, standing.effective)
            .then_some((&member.signing_public_key, standing)),
        now,
    )
    .await?;

    store
        .write_member(
            &signer,
            &MemberRecord {
                role_id: standing.role_id.to_string(),
                override_mask: standing.override_mask,
                updated_at: now,
                ..member.clone()
            },
        )
        .await?;

    if !store.push().await {
        diagnostics::warn("organization.member.roleNotYetSent")
            .with("member", member_id)
            .write();
    }

    diagnostics::info("organization.member.roleChanged")
        .with("member", member_id)
        .with("role", role)
        .write();

    // read back through the routine the list draws from, so what the caller is handed is what the
    // members list will show.
    members(store, session)
        .await?
        .into_iter()
        .find(|member| member.id == member_id)
        .ok_or_else(|| Error::Integrity {
            message: "the changed member's row did not read back".to_string(),
        })
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use serde_json::json;

    use super::{
        AN_UNSET_ACCOUNT_CANNOT_ACCEPT, NOT_THE_KEY_IN_FORCE, NOTHING_WAS_OFFERED,
        ONLY_THE_OWNER_TRANSFERS, THE_OFFER_WAS_ACCEPTED, accept_ownership, change_role,
        follow_succession, offer_ownership, organization_key_of, signs_rows, standing_offer,
        withdraw_offer,
    };
    use crate::{
        error::Error,
        organization::{
            HeldOrganization,
            authority::{
                AdministratorKey, Certificate, Chain, Issue, OrganizationKey, VERIFYING_KEY_BYTES,
                certificate_id, issue_certificate, revoke,
            },
            invite::{AccountAndLink, Invitation, WorkspaceGrant, locator, make_account_and_link},
            join::accept,
            link::{JoinLink, Locator},
            migrate::Pipeline,
            permission::{self, Administration},
            removal,
            session::{CredentialSlot, MemberSession, end_member_sessions, repin, sign_in},
            setup::{
                ADMINISTRATOR_KEY_PURPOSE, CreateOrganization, Remote, create_organization,
                owner_key_from,
            },
            store::{GrantRecord, MemberRecord, OrganizationStore, Signer, TABLES},
            vault::{KdfParams, seal_to_public_key},
            workspace::{create_workspace, grant_workspace, signer_of},
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
    /// What the settled administrator in these tests chose when they opened their link, which is
    /// the password that becomes the organization's key when they accept it.
    const ADMINISTRATORS_PASSWORD: &str = "the administrators password";
    /// And the second one's, for the chain of two handovers.
    const BILALS_PASSWORD: &str = "bilals own long password";
    const NOW: i64 = 1_757_000_000_000;

    /// A verifying key as a machine's record spells it.
    fn encoded(key: [u8; VERIFYING_KEY_BYTES]) -> String {
        base64::Engine::encode(&base64::engine::general_purpose::URL_SAFE_NO_PAD, key)
    }

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
        let directory = std::env::temp_dir().join(format!("rentable-role-{name}-{nanos:x}"));
        std::fs::create_dir_all(&directory).expect("scratch directory");

        directory
    }

    fn slot() -> CredentialSlot {
        Arc::new(Mutex::new(None))
    }

    /// No platform authority in hand, which is every session here: nothing this module does mints
    /// anything.
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

    /// The machine's record of a member who joined.
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
    ) -> (OrganizationStore, MemberSession, Locator, String) {
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

        let (_, organization) = create_organization(
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
            NOW,
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
            NOW,
        )
        .await
        .expect("the workspace");
        let link = locator(&organization, &owner)
            .await
            .expect("the organization's link");

        (organization, owner, link, workspace.id)
    }

    /// A member of this organization, invited and signed in, with their password change settled
    /// the way an accept settles it.
    async fn a_member(
        store: &OrganizationStore,
        owner: &MemberSession,
        link: &Locator,
        username: &'static str,
        role: &str,
        workspace_id: &str,
    ) -> (AccountAndLink, MemberSession) {
        let workspaces = full(&[workspace_id.to_string()]);
        let invited = make_account_and_link(
            store,
            owner,
            no_platform(),
            link,
            Invitation {
                username,
                role,
                workspaces: &workspaces,
            },
            test_cost(),
            NOW,
        )
        .await
        .expect("the invitation failed");
        let mut session = sign_in(
            store,
            &joined_as(owner, &invited.member_id, role),
            &secret_of(&invited),
            &slot(),
        )
        .await
        .expect("the invited member did not sign in");
        session.must_change_password = false;

        (invited, session)
    }

    /// Every row of the organization, cell by cell, so a refusal that wrote something is caught
    /// wherever it wrote it.
    async fn every_row(store: &OrganizationStore) -> Vec<(String, Vec<Option<Vec<u8>>>)> {
        let mut rows_out = Vec::new();

        for table in TABLES {
            let mut rows = store
                .connection()
                .query(&format!("SELECT * FROM \"{table}\" ORDER BY 1, 2"), ())
                .await
                .expect("the rows");

            while let Some(row) = rows.next().await.expect("a row") {
                let mut cells = Vec::new();

                for index in 0..row.column_count() {
                    cells.push(match row.get_value(index).expect("a value") {
                        turso::Value::Text(text) => Some(text.into_bytes()),
                        turso::Value::Blob(blob) => Some(blob),
                        turso::Value::Integer(value) => Some(value.to_be_bytes().to_vec()),
                        turso::Value::Real(value) => Some(value.to_be_bytes().to_vec()),
                        turso::Value::Null => None,
                    });
                }

                rows_out.push((table.to_string(), cells));
            }
        }

        rows_out
    }

    /// What a member's row carries now, read through the verified reader, so a row that stopped
    /// verifying fails here rather than reading back as though nothing had happened.
    async fn row_of(
        store: &OrganizationStore,
        owner: &MemberSession,
        member_id: &str,
    ) -> (String, i64) {
        let member = store
            .members(&owner.verifying_key)
            .await
            .expect("the rows verify")
            .into_iter()
            .find(|member| member.id == member_id)
            .expect("the member row");

        (
            member.role_word().to_string(),
            permission::acts_of(member.effective),
        )
    }

    /// Whether a live certificate names this member, which is what `workspace::signer_of` looks
    /// for and the whole of what lets them sign a row.
    ///
    /// Judged under the key the organization row carries, which a test may read and a reader
    /// never does.
    async fn certified(store: &OrganizationStore, member_id: &str) -> bool {
        let pinned = store
            .organization()
            .await
            .expect("the organization row")
            .expect("an organization")
            .verifying_key;

        !store
            .live_certificates(&pinned, member_id)
            .await
            .expect("the certificates")
            .is_empty()
    }

    /// A copy of the replica as another machine would hold it, opened as a second store. Every
    /// read through it verifies against the key the link pinned rather than the one the database
    /// carries, which is what "verifies on every other client" means here.
    async fn another_machine(
        directory: &std::path::Path,
        organization_id: &str,
    ) -> OrganizationStore {
        let elsewhere = scratch("elsewhere");

        for entry in std::fs::read_dir(directory).expect("the directory") {
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
            &OrganizationStore::replica_path(&elsewhere.join("app.db"), organization_id),
            None,
            || async { Err(turso::Error::Misuse("no remote".into())) },
        )
        .await
        .expect("their replica did not open")
    }

    /// The act table's one act that writes no signed row, which is what makes it the one a
    /// non-owner may hand out. A change here is a change to who needs the organization key.
    #[test]
    fn every_act_but_renaming_a_workspace_signs_a_row() {
        for act in Administration::ALL {
            assert_eq!(
                signs_rows(permission::mask_of(&[act])),
                act != Administration::RenameWorkspace,
                "{}",
                act.name()
            );
        }

        assert!(!signs_rows(0));
    }

    /// Requirement 6: both fields are written on the row, re-signed, and the answer is the member
    /// as the list will show them. An act that signs nothing earns no certificate.
    #[tokio::test]
    async fn the_role_and_the_acts_are_written_re_signed_and_read_back() {
        let directory = scratch("write");
        let (store, owner, link, workspace_id) = owned(&directory).await;
        let (invited, _) = a_member(
            &store,
            &owner,
            &link,
            "sami.staff",
            permission::MEMBER,
            &workspace_id,
        )
        .await;
        let widened = permission::mask_of(&[Administration::RenameWorkspace]);

        let changed = change_role(
            &store,
            &owner,
            &invited.member_id,
            permission::MEMBER,
            widened,
            NOW + 1,
        )
        .await
        .expect("the change failed");

        assert_eq!(changed.id, invited.member_id);
        assert_eq!(changed.username, "sami.staff");
        assert_eq!(changed.role, permission::MEMBER);
        assert_eq!(permission::acts_of(changed.permissions), widened);
        assert_eq!(
            changed
                .workspaces
                .iter()
                .map(|workspace| workspace.id.clone())
                .collect::<Vec<_>>(),
            vec![workspace_id.clone()],
            "the change moved what the member holds"
        );

        // on the row, verified, and not only in the answer.
        assert_eq!(
            row_of(&store, &owner, &invited.member_id).await,
            (permission::MEMBER.to_string(), widened)
        );

        // renaming a workspace writes the sealed name outside the signature, so it needs no
        // certificate and none was issued.
        assert!(!certified(&store, &invited.member_id).await);

        // and the role travels with the acts: an administrator by name, with the acts the owner
        // chose rather than the ones the bundle carries.
        let named = change_role(
            &store,
            &owner,
            &invited.member_id,
            permission::ADMINISTRATOR,
            permission::mask_of(&[Administration::RenameMember]),
            NOW + 2,
        )
        .await
        .expect("the second change failed");

        assert_eq!(named.role, permission::ADMINISTRATOR);
        assert_eq!(
            permission::acts_of(named.permissions),
            permission::mask_of(&[Administration::RenameMember])
        );
    }

    /// The refusals, each before anything is written: nobody changes their own row, nobody
    /// changes the owner's, a member with no act changes nobody, a role this build does not ship
    /// is not written, and a member who is not here is not found.
    #[tokio::test]
    async fn the_refusals_come_before_any_write() {
        let directory = scratch("refusals");
        let (store, owner, link, workspace_id) = owned(&directory).await;
        let (invited, sami) = a_member(
            &store,
            &owner,
            &link,
            "sami.staff",
            permission::MEMBER,
            &workspace_id,
        )
        .await;
        let (_, ada) = a_member(
            &store,
            &owner,
            &link,
            "ada.admin",
            permission::ADMINISTRATOR,
            &workspace_id,
        )
        .await;
        let owner_id = owner.member_id.clone();
        let before = every_row(&store).await;

        let own = change_role(&store, &owner, &owner_id, permission::MEMBER, 0, NOW + 1)
            .await
            .expect_err("the owner changed their own row");

        assert!(
            matches!(
                own,
                Error::Refused {
                    reason: crate::error::RefusalReason::NotYourself,
                    ..
                }
            ),
            "{own:?}"
        );
        assert!(own.to_string().contains("your own"), "{own}");

        let theirs = change_role(&store, &ada, &owner_id, permission::MEMBER, 0, NOW + 1)
            .await
            .expect_err("an administrator changed the owner's row");

        assert!(
            matches!(
                theirs,
                Error::Refused {
                    reason: crate::error::RefusalReason::OwnerProtected,
                    ..
                }
            ),
            "{theirs:?}"
        );
        assert!(theirs.to_string().contains("owner"), "{theirs}");

        let without = change_role(
            &store,
            &sami,
            &invited.member_id,
            permission::MEMBER,
            0,
            NOW + 1,
        )
        .await
        .expect_err("a member with no act changed a role");

        assert!(without.to_string().contains("changeRole"), "{without}");

        let unknown = change_role(&store, &owner, &invited.member_id, "superuser", 0, NOW + 1)
            .await
            .expect_err("a role this build never heard of was written");

        assert!(
            matches!(
                unknown,
                Error::Refused {
                    reason: crate::error::RefusalReason::RoleUnknown,
                    ..
                }
            ),
            "{unknown:?}"
        );

        let missing = change_role(&store, &owner, "nobody", permission::MEMBER, 0, NOW + 1)
            .await
            .expect_err("a member who is not here was changed");

        assert!(
            matches!(
                missing,
                Error::Refused {
                    reason: crate::error::RefusalReason::MemberMissing,
                    ..
                }
            ),
            "{missing:?}"
        );

        assert_eq!(every_row(&store).await, before, "a refusal wrote something");
    }

    /// Requirement 6's owner-only sentence: a holder of `changeRole` who is not the owner narrows
    /// anybody and widens only with `renameWorkspace`, the one act that signs nothing, and the
    /// refusal names the owner.
    #[tokio::test]
    async fn a_non_owner_narrows_anybody_and_widens_only_with_the_act_that_signs_nothing() {
        let directory = scratch("owner-only");
        let (store, owner, link, workspace_id) = owned(&directory).await;
        let (_, ada) = a_member(
            &store,
            &owner,
            &link,
            "ada.admin",
            permission::ADMINISTRATOR,
            &workspace_id,
        )
        .await;
        let (sami, _) = a_member(
            &store,
            &owner,
            &link,
            "sami.staff",
            permission::MEMBER,
            &workspace_id,
        )
        .await;
        let renaming = permission::mask_of(&[Administration::RenameWorkspace]);

        // the one widening an administrator may make.
        change_role(
            &store,
            &ada,
            &sami.member_id,
            permission::MEMBER,
            renaming,
            NOW + 1,
        )
        .await
        .expect("an administrator could not hand out the act that signs nothing");

        // and every other one, refused with a sentence naming the owner.
        for act in Administration::ALL
            .iter()
            .filter(|act| **act != Administration::RenameWorkspace)
        {
            let refusal = change_role(
                &store,
                &ada,
                &sami.member_id,
                permission::MEMBER,
                renaming | permission::mask_of(&[*act]),
                NOW + 2,
            )
            .await
            .err()
            .unwrap_or_else(|| panic!("an administrator handed out {}", act.name()));

            assert!(
                matches!(
                    refusal,
                    Error::Refused {
                        reason: crate::error::RefusalReason::OwnerOnly,
                        ..
                    }
                ),
                "{}: {refusal:?}",
                act.name()
            );
            assert!(
                refusal.to_string().contains("owner"),
                "{}: {refusal}",
                act.name()
            );
        }

        // the role is held to the same line, because `administrator` is the word for carrying
        // every act and a row saying so with no certificate behind it is a promise nothing keeps.
        let named = change_role(
            &store,
            &ada,
            &sami.member_id,
            permission::ADMINISTRATOR,
            renaming,
            NOW + 2,
        )
        .await
        .expect_err("an administrator named another one");

        assert!(named.to_string().contains("owner"), "{named}");

        // and narrowing is theirs to do: the act they handed out, taken back.
        change_role(
            &store,
            &ada,
            &sami.member_id,
            permission::MEMBER,
            0,
            NOW + 3,
        )
        .await
        .expect("an administrator could not narrow a member");

        assert_eq!(
            row_of(&store, &owner, &sami.member_id).await,
            (permission::MEMBER.to_string(), 0)
        );
    }

    /// Criterion 7: a member widened into an act that signs signs a row, and it verifies on every
    /// other client; narrowed back, a row they newly sign is refused.
    ///
    /// *The act was `inviteMember` and the row a member row until effort 838: a member row is
    /// signed only by a certificate that outranks the member it is about, and a member does not
    /// outrank a member. The act is `grantWorkspace` now, whose row is about no rank.*
    #[tokio::test]
    async fn a_first_signing_act_is_certified_and_the_last_one_lost_retires_the_certificate() {
        let directory = scratch("certificate");
        let (store, owner, link, workspace_id) = owned(&directory).await;
        let (sami, opened) = a_member(
            &store,
            &owner,
            &link,
            "sami.staff",
            permission::MEMBER,
            &workspace_id,
        )
        .await;

        // certified from the moment the account was made, as every account is since effort 838.
        assert!(certified(&store, &sami.member_id).await);

        // widened by the owner: their first signing act, and the certificate the owner issues over
        // the key their row has carried since it was written.
        change_role(
            &store,
            &owner,
            &sami.member_id,
            permission::MEMBER,
            permission::mask_of(&[Administration::GrantWorkspace]),
            NOW + 1,
        )
        .await
        .expect("the widening failed");

        assert!(certified(&store, &sami.member_id).await);

        // what was certified is the key they derive from their own vault secret, read off their
        // row: the whole reason the column exists.
        let theirs_to_sign_with = AdministratorKey::from_bytes(
            &opened
                .secret
                .derive_seed(ADMINISTRATOR_KEY_PURPOSE)
                .expect("the signing seed"),
        )
        .verifying_key();
        // the live one: the account's first link re-sealed its vault, so the certificate issued
        // when the account was made names a key the vault no longer derives, and was revoked.
        let certificate = store
            .live_certificates(&owner.verifying_key, &sami.member_id)
            .await
            .expect("the certificates")
            .pop()
            .expect("their certificate");

        assert_eq!(certificate.signing_public_key, theirs_to_sign_with);
        assert_eq!(
            store
                .members(&owner.verifying_key)
                .await
                .expect("the rows")
                .into_iter()
                .find(|member| member.id == sami.member_id)
                .expect("their row")
                .signing_public_key,
            theirs_to_sign_with
        );

        // and they grant, which is a row signed under that certificate: the workspace they hold,
        // given to another member from their own credential. Their session is opened after the
        // widening, because what a session may do is what the row said when it opened.
        let mut widened = sign_in(
            &store,
            &joined_as(&owner, &sami.member_id, permission::MEMBER),
            &secret_of(&sami),
            &slot(),
        )
        .await
        .expect("the widened member did not sign in");
        widened.must_change_password = false;

        let (noor, _) = a_member(
            &store,
            &owner,
            &link,
            "noor.new",
            permission::MEMBER,
            &workspace_id,
        )
        .await;

        grant_workspace(
            &store,
            &widened,
            no_platform(),
            &workspace_id,
            &noor.member_id,
            AccessLevel::FullAccess,
        )
        .await
        .expect("a widened member could not grant");

        let is_theirs = |grant: &GrantRecord| {
            grant.member_id == noor.member_id && grant.workspace_id == workspace_id
        };

        // on a second machine, verified against the key the link pinned.
        let elsewhere = another_machine(&directory, &owner.organization_id).await;
        let grants = elsewhere
            .grants(&owner.verifying_key)
            .await
            .expect("the grant does not verify on another machine");

        assert!(
            grants.iter().any(is_theirs),
            "the grant a widened member signed is not on the other machine"
        );

        drop(elsewhere);

        // narrowed back: the rows their certificate signed move under the owner, and the
        // certificate is written back revoked.
        change_role(
            &store,
            &owner,
            &sami.member_id,
            permission::MEMBER,
            0,
            NOW + 3,
        )
        .await
        .expect("the narrowing failed");

        assert!(!certified(&store, &sami.member_id).await);
        assert!(
            store.grants(&owner.verifying_key).await.is_ok(),
            "retiring the certificate bricked the rows it had signed"
        );
        assert!(
            signer_of(&store, &widened).await.is_err(),
            "a narrowed member still finds a certificate to sign under"
        );

        // and a row they sign under it anyway is refused on read, by name.
        let revoked = certificate;
        let key = AdministratorKey::from_bytes(
            &widened
                .secret
                .derive_seed(ADMINISTRATOR_KEY_PURPOSE)
                .expect("the signing seed"),
        );
        let grant = store
            .grants(&owner.verifying_key)
            .await
            .expect("the grants")
            .into_iter()
            .find(is_theirs)
            .expect("the grant they had signed");

        store
            .write_grant(
                &Signer {
                    key: &key,
                    certificate: &revoked,
                },
                &grant,
            )
            .await
            .expect("the write itself is not what refuses");

        let refusal = store
            .grants(&owner.verifying_key)
            .await
            .expect_err("a row signed under a revoked certificate was accepted");

        assert!(refusal.to_string().contains("revoked"), "{refusal}");
    }

    /// Effort 838, ticket 04: **a re-issue the actor could not complete is refused by name, and
    /// nothing moves.** A member signs a grant; an administrator who may change roles and holds
    /// nothing that signs a grant narrows them. Retiring the member's certificate would mean
    /// re-signing the grant, which takes `grantWorkspace`: the change is refused naming it, and
    /// the certificate, the revocations, the grant and the member's row are as they were.
    #[tokio::test]
    async fn a_reissue_the_actor_could_not_complete_is_refused_by_name_and_moves_nothing() {
        let directory = scratch("reissue-refused");
        let (store, owner, link, workspace_id) = owned(&directory).await;
        let (sami, _) = a_member(
            &store,
            &owner,
            &link,
            "sami.staff",
            permission::MEMBER,
            &workspace_id,
        )
        .await;
        let granting = permission::mask_of(&[Administration::GrantWorkspace]);

        change_role(
            &store,
            &owner,
            &sami.member_id,
            permission::MEMBER,
            granting,
            NOW + 1,
        )
        .await
        .expect("the widening failed");

        let mut widened = sign_in(
            &store,
            &joined_as(&owner, &sami.member_id, permission::MEMBER),
            &secret_of(&sami),
            &slot(),
        )
        .await
        .expect("the widened member did not sign in");
        widened.must_change_password = false;

        let (noor, _) = a_member(
            &store,
            &owner,
            &link,
            "noor.new",
            permission::MEMBER,
            &workspace_id,
        )
        .await;

        grant_workspace(
            &store,
            &widened,
            no_platform(),
            &workspace_id,
            &noor.member_id,
            AccessLevel::FullAccess,
        )
        .await
        .expect("a widened member could not grant");

        // an administrator who changes roles and does nothing else.
        let (ada, ada_session) = a_member(
            &store,
            &owner,
            &link,
            "ada.admin",
            permission::ADMINISTRATOR,
            &workspace_id,
        )
        .await;

        change_role(
            &store,
            &owner,
            &ada.member_id,
            permission::ADMINISTRATOR,
            permission::mask_of(&[Administration::ChangeRole]),
            NOW + 2,
        )
        .await
        .expect("the narrowing of the administrator failed");

        let chain_before = store.chain_rows().await.expect("the chain");
        let grants_before = store
            .grants(&owner.verifying_key)
            .await
            .expect("the grants");

        let refusal = change_role(
            &store,
            &ada_session,
            &sami.member_id,
            permission::MEMBER,
            0,
            NOW + 3,
        )
        .await
        .expect_err("a narrowing that could not re-sign the grant went through");

        assert!(refusal.to_string().contains("grantWorkspace"), "{refusal}");
        assert_eq!(
            store.chain_rows().await.expect("the chain after"),
            chain_before,
            "a refused re-issue wrote a certificate or a revocation"
        );
        assert_eq!(
            store
                .grants(&owner.verifying_key)
                .await
                .expect("the grants after"),
            grants_before
        );
        assert!(certified(&store, &sami.member_id).await);
        assert_eq!(
            row_of(&store, &owner, &sami.member_id).await,
            (permission::MEMBER.to_string(), granting),
            "the refused change wrote the member's row"
        );
    }

    /// **A narrowing that leaves the certificate standing still reaches the open session.**
    ///
    /// The case the test above does not cover, and the one requirement 6 makes the control
    /// surface: a member loses one act and keeps another that signs. `signed_before &&
    /// !signs_now` is false, so their certificate is not retired, and until the gates read the
    /// row their session went on carrying the bit the owner had just taken off. What refuses them
    /// here is `session::permissions_on_row`, and the refusal names the act they reached for.
    #[tokio::test]
    async fn a_member_narrowed_out_of_one_act_is_refused_on_their_open_session_by_name() {
        let directory = scratch("narrowed");
        let (store, owner, link, workspace_id) = owned(&directory).await;
        let (sami, theirs) = a_member(
            &store,
            &owner,
            &link,
            "sami.staff",
            permission::ADMINISTRATOR,
            &workspace_id,
        )
        .await;

        // the owner takes inviting off and leaves removing, which is the whole of the case: the
        // member still signs rows, so the certificate stays live.
        change_role(
            &store,
            &owner,
            &sami.member_id,
            permission::ADMINISTRATOR,
            permission::mask_of(&[Administration::RemoveMember]),
            NOW + 1,
        )
        .await
        .expect("the narrowing failed");

        assert!(
            certified(&store, &sami.member_id).await,
            "the narrowing retired the certificate, so this is the other test's case"
        );
        assert!(
            permission::permits(theirs.permissions, Administration::InviteMember),
            "the session stopped carrying the act on its own, and there is nothing left to refuse"
        );

        let workspaces = full(&[workspace_id.clone()]);
        let refusal = make_account_and_link(
            &store,
            &theirs,
            no_platform(),
            &link,
            Invitation {
                username: "noor.new",
                role: permission::MEMBER,
                workspaces: &workspaces,
            },
            test_cost(),
            NOW + 2,
        )
        .await
        .expect_err("a member narrowed out of inviteMember invited somebody");

        assert!(
            matches!(
                refusal,
                Error::Refused {
                    reason: crate::error::RefusalReason::RoleLacksAct,
                    ..
                }
            ),
            "the refusal is not a forbidden: {refusal}"
        );
        assert!(
            refusal.to_string().contains("inviteMember"),
            "the refusal does not name the act: {refusal}"
        );

        // nobody was written: the gate is before the work, as every other refusal here is.
        assert!(
            !store
                .members(&owner.verifying_key)
                .await
                .expect("the rows")
                .iter()
                .any(|member| member.id != sami.member_id && member.id != owner.member_id),
            "the refused invitation wrote a member row"
        );

        // and the act they kept is still theirs, off the same row.
        assert_eq!(
            permission::acts_of(
                crate::organization::session::permissions_on_row(&store, &theirs)
                    .await
                    .expect("their row")
            ),
            permission::mask_of(&[Administration::RemoveMember])
        );
    }
    // -------------------------------------------------------------------------------------
    // Effort 828, requirement 22: ownership is transferred by the owner.
    // -------------------------------------------------------------------------------------

    /// An account with no password of its own: made from the tray and never opened, which is the
    /// standing requirement 20 leaves an account in until its first link is used.
    async fn an_unset_account(
        store: &OrganizationStore,
        owner: &MemberSession,
        link: &Locator,
        username: &'static str,
        role: &str,
        workspace_id: &str,
    ) -> AccountAndLink {
        let workspaces = full(&[workspace_id.to_string()]);

        make_account_and_link(
            store,
            owner,
            no_platform(),
            link,
            Invitation {
                username,
                role,
                workspaces: &workspaces,
            },
            test_cost(),
            NOW,
        )
        .await
        .expect("the invitation failed")
    }

    /// A machine record of its own, under a directory of its own.
    fn fresh_machine(directory: &std::path::Path, name: &str) -> Persisted<RemoteSyncStore> {
        let theirs = directory.join(name);

        std::fs::create_dir_all(&theirs).expect("the machine directory");

        Persisted::<RemoteSyncStore>::load(theirs.join("remote-sync.json")).expect("the record")
    }

    /// An administrator who opened their link on a machine of their own and chose a password,
    /// which is the standing an offer of the organization needs: a vault of their own, that their
    /// own password opens, on a machine that pinned this organization's key.
    async fn a_settled_administrator(
        directory: &std::path::Path,
        store: &OrganizationStore,
        owner: &MemberSession,
        link: &Locator,
        workspace_id: &str,
        username: &'static str,
        password: &str,
    ) -> (AccountAndLink, MemberSession, Persisted<RemoteSyncStore>) {
        let invited = an_unset_account(
            store,
            owner,
            link,
            username,
            permission::ADMINISTRATOR,
            workspace_id,
        )
        .await;
        let mut machine = fresh_machine(directory, username);
        let (_, session) = accept(
            |_| async { Ok::<_, Error>(store) },
            &mut machine,
            &JoinLink::decode(&invited.join_link).expect("the invitation link"),
            &invited.code,
            password,
            test_cost(),
            NOW,
        )
        .await
        .expect("the account could not open its link");

        (invited, session, machine)
    }

    /// A machine record that holds this organization and pins the key given: what a machine has
    /// after a connect, without the connect. The remote is spelled because a record with none is
    /// one `RemoteSyncStore::sanitize` throws away, on the reading that it names a place on the
    /// wall nobody can go.
    fn holding(
        directory: &std::path::Path,
        name: &str,
        owner: &MemberSession,
        verifying_key: [u8; VERIFYING_KEY_BYTES],
    ) -> Persisted<RemoteSyncStore> {
        let mut machine = fresh_machine(directory, name);

        machine.organization = Some(HeldOrganization {
            remote_url: "libsql://acme.test".to_string(),
            verifying_key: encoded(verifying_key),
            ..joined_as(owner, &owner.member_id, permission::OWNER)
        });
        machine.commit().expect("the record");

        machine
    }

    /// What a member's row carries, read against a key given rather than a session's: what a
    /// re-keyed directory has to be read through.
    async fn row_of_under(
        store: &OrganizationStore,
        organization_verifying_key: &[u8; VERIFYING_KEY_BYTES],
        member_id: &str,
    ) -> (String, i64) {
        let member = store
            .members(organization_verifying_key)
            .await
            .expect("the rows verify")
            .into_iter()
            .find(|member| member.id == member_id)
            .expect("the member row");

        (
            member.role_word().to_string(),
            permission::acts_of(member.effective),
        )
    }

    /// Whether the offer's seal is on a row.
    async fn sealed_on(
        store: &OrganizationStore,
        session: &MemberSession,
        member_id: &str,
    ) -> bool {
        store
            .members(&session.verifying_key)
            .await
            .expect("the rows verify")
            .into_iter()
            .find(|member| member.id == member_id)
            .expect("the member row")
            .owner_seed_sealed
            .is_some()
    }

    /// **Criterion 22, the offer's refusals.** An unset account, a removed account, the owner's
    /// own row and a caller who is not the owner, each refused by its own sentence and each
    /// leaving the directory exactly as it was.
    ///
    /// The unset account is the one this list exists for: the key an acceptance derives comes out
    /// of the accepting account's own vault, and an account whose password has never been set has
    /// none of its own, so offering to one would leave the organization with an owner nobody can
    /// sign in as. That is what the first shape of this act did.
    #[tokio::test]
    async fn the_offer_is_refused_for_an_unset_account_a_removed_one_the_owner_and_a_non_owner() {
        let directory = scratch("offer-refusals");
        let (store, owner, link, workspace_id) = owned(&directory).await;
        let (ada, ada_session, _) = a_settled_administrator(
            &directory,
            &store,
            &owner,
            &link,
            &workspace_id,
            "ada.admin",
            ADMINISTRATORS_PASSWORD,
        )
        .await;
        let unset = an_unset_account(
            &store,
            &owner,
            &link,
            "noor.new",
            permission::ADMINISTRATOR,
            &workspace_id,
        )
        .await;
        let leaving = an_unset_account(
            &store,
            &owner,
            &link,
            "sami.staff",
            permission::MEMBER,
            &workspace_id,
        )
        .await;
        let row = store
            .members(&owner.verifying_key)
            .await
            .expect("the rows")
            .into_iter()
            .find(|member| member.id == leaving.member_id)
            .expect("the row");

        removal::retire_member(&store, &owner, &row, NOW + 1)
            .await
            .expect("the removal failed");

        let before = every_row(&store).await;

        // an account with no password of its own: refused by name.
        let no_password = offer_ownership(&store, &owner, &unset.member_id, PASSWORD, NOW + 2)
            .await
            .expect_err("the organization was offered to an account with no password");

        assert!(
            matches!(no_password, Error::Refused { reason: crate::error::RefusalReason::AccountNotSetUp, ref message } if message == AN_UNSET_ACCOUNT_CANNOT_ACCEPT),
            "{no_password:?}"
        );

        // a removed account.
        let removed = offer_ownership(&store, &owner, &leaving.member_id, PASSWORD, NOW + 2)
            .await
            .expect_err("the organization was offered to a removed account");

        assert!(
            matches!(
                removed,
                Error::Refused {
                    reason: crate::error::RefusalReason::MemberRemoved,
                    ..
                }
            ),
            "{removed:?}"
        );

        // themselves.
        let own = offer_ownership(&store, &owner, &owner.member_id, PASSWORD, NOW + 2)
            .await
            .expect_err("the owner offered the organization to themselves");

        assert!(
            matches!(
                own,
                Error::Refused {
                    reason: crate::error::RefusalReason::AlreadyOwner,
                    ..
                }
            ),
            "{own:?}"
        );

        // and somebody who is not the owner, with their own password, which is the one refusal
        // that is about who is asking rather than about who is being named.
        let not_the_owner = offer_ownership(
            &store,
            &ada_session,
            &unset.member_id,
            ADMINISTRATORS_PASSWORD,
            NOW + 2,
        )
        .await
        .expect_err("an administrator offered the organization");

        assert!(
            matches!(not_the_owner, Error::Refused { reason: crate::error::RefusalReason::OwnerOnly, ref message } if message == ONLY_THE_OWNER_TRANSFERS),
            "{not_the_owner:?}"
        );

        assert_eq!(
            every_row(&store).await,
            before,
            "a refused offer wrote something"
        );

        // and the one that goes through, so the list above is a list of refusals rather than of
        // an act that refuses everything.
        offer_ownership(&store, &owner, &ada.member_id, PASSWORD, NOW + 2)
            .await
            .expect("the offer failed");

        assert!(
            standing_offer(&store, &owner.verifying_key)
                .await
                .expect("the successions")
                .is_some()
        );
    }

    /// **Criterion 22, the acceptance.** The organization is re-keyed under what the new owner's
    /// own vault derives, every row of every signed table and every certificate verifies under the
    /// new key, the organization row carries it, the roles are swapped and the seal is gone.
    ///
    /// **The old key is then good for nothing**, which is the half the first shape of this act
    /// could not have: the founder's derivation is no longer what anything in the directory is
    /// signed under, and reading the rows under it is refused.
    #[tokio::test]
    async fn the_acceptance_re_keys_and_every_row_and_certificate_verifies_under_the_new_key() {
        let directory = scratch("accept");
        let (store, owner, link, workspace_id) = owned(&directory).await;
        let (ada, mut ada_session, mut ada_machine) = a_settled_administrator(
            &directory,
            &store,
            &owner,
            &link,
            &workspace_id,
            "ada.admin",
            ADMINISTRATORS_PASSWORD,
        )
        .await;
        let old_key = owner.verifying_key;

        offer_ownership(&store, &owner, &ada.member_id, PASSWORD, NOW + 1)
            .await
            .expect("the offer failed");

        // nothing moved on the offer alone: the roles and the key are what they were.
        assert_eq!(
            row_of(&store, &owner, &ada.member_id).await,
            (
                permission::ADMINISTRATOR.to_string(),
                permission::mask_of_role(permission::ADMINISTRATOR)
            )
        );

        accept_ownership(
            &store,
            &mut ada_session,
            &mut ada_machine,
            ADMINISTRATORS_PASSWORD,
            NOW + 2,
        )
        .await
        .expect("the acceptance failed");

        // the new key is what their own vault derives, and it is not the founder's.
        let new_key = ada_session.verifying_key;

        assert_ne!(new_key, old_key);
        assert_eq!(
            new_key,
            owner_key_from(&ada_session.secret)
                .expect("their derivation")
                .verifying_key(),
            "the key is not the new owner's own derivation"
        );

        // every row of every signed table, read through the verified readers.
        let rows = store
            .members(&new_key)
            .await
            .expect("every member row verifies under the new key");

        store
            .workspaces(&new_key)
            .await
            .expect("every workspace row verifies under the new key");
        store
            .grants(&new_key)
            .await
            .expect("every grant row verifies under the new key");
        store
            .invitations(&new_key)
            .await
            .expect("every invitation row verifies under the new key");

        // and the old key reads nothing any more, which is what re-keying has to mean.
        assert!(
            store.members(&old_key).await.is_err(),
            "the directory still verifies under the key that was handed over"
        );

        // the organization row carries the new key, and this machine pinned it in its record and
        // in the session that is open on it.
        assert_eq!(
            store
                .organization()
                .await
                .expect("the organization row")
                .expect("the organization row is there")
                .verifying_key,
            new_key
        );
        assert_eq!(
            ada_machine
                .organization
                .as_ref()
                .expect("the record")
                .verifying_key,
            encoded(new_key)
        );
        assert_eq!(ada_session.role, permission::OWNER);

        // the roles are swapped and the seal the offer wrote is gone from both rows.
        assert_eq!(
            row_of_under(&store, &new_key, &ada.member_id).await,
            (
                permission::OWNER.to_string(),
                permission::mask_of_role(permission::OWNER)
            )
        );
        assert_eq!(
            row_of_under(&store, &new_key, &owner.member_id).await,
            (
                permission::ADMINISTRATOR.to_string(),
                permission::mask_of_role(permission::ADMINISTRATOR)
            )
        );
        assert!(
            rows.iter().all(|member| member.owner_seed_sealed.is_none()),
            "a row still carries the seal the offer wrote"
        );

        // and both still sign rows: the founder's certificate was re-issued under the new key with
        // the same id and the same signing key, which is what lets the rows it signed stand.
        assert!(certified(&store, &ada.member_id).await);
        assert!(certified(&store, &owner.member_id).await);
    }

    /// **The handover on the delegated chain** (effort 838, requirement 2 and criterion 9). Before
    /// it, the founder has issued certificates as the owner: a manager's that is live, a manager's
    /// and a member's that they revoked; a manager has issued one further down; and the founder has
    /// set the mark.
    ///
    /// After it, every certificate that was live under the key being left is live under the new
    /// pinned key; each the founder issued directly is issued again from the new owner's root,
    /// under its id and signing key, and the one a manager issued keeps its issuer. The founder's
    /// own certificate is a manager's, their row names the manager role with no override and reads
    /// the manager's mask, and the roles and the mark verify under the new key. What the founder
    /// revoked as the owner stays revoked, and the new owner's session carries every flag.
    #[tokio::test]
    async fn after_a_handover_every_certificate_walks_to_the_new_key_and_the_founder_is_a_manager()
    {
        let directory = scratch("handover-chain");
        let (store, owner, link, workspace_id) = owned(&directory).await;
        let (ada, mut ada_session, mut ada_machine) = a_settled_administrator(
            &directory,
            &store,
            &owner,
            &link,
            &workspace_id,
            "ada.admin",
            ADMINISTRATORS_PASSWORD,
        )
        .await;
        let (bilal, bilal_session, _) = a_settled_administrator(
            &directory,
            &store,
            &owner,
            &link,
            &workspace_id,
            "bilal.admin",
            BILALS_PASSWORD,
        )
        .await;
        let (sami, sami_session) = a_member(
            &store,
            &owner,
            &link,
            "sami.staff",
            permission::MEMBER,
            &workspace_id,
        )
        .await;
        let old_key = owner.verifying_key;
        let signing_key_of = |session: &MemberSession| {
            AdministratorKey::from_bytes(
                &session
                    .secret
                    .derive_seed(ADMINISTRATOR_KEY_PURPOSE)
                    .expect("the seed"),
            )
            .verifying_key()
        };

        // the founder, as the owner: two certificates issued and revoked, one of a manager's rank
        // and one of a member's.
        let (owner_key, old_root) = signer_of(&store, &owner).await.expect("the root");

        assert!(old_root.is_root());

        let mut retired = Vec::new();

        for (member_id, signing_public_key, standing, at) in [
            (
                &bilal.member_id,
                signing_key_of(&bilal_session),
                permission::MANAGER_ROLE,
                NOW + 1,
            ),
            (
                &sami.member_id,
                signing_key_of(&sami_session),
                permission::MEMBER_ROLE,
                NOW + 2,
            ),
        ] {
            let at = at.to_string();
            let certificate = issue_certificate(
                &owner_key,
                &old_root,
                Issue {
                    id: &certificate_id(member_id, &at),
                    member_id,
                    signing_public_key: &signing_public_key,
                    ceiling: standing.mask,
                    rank: standing.rank,
                    issued_at: &at,
                },
            )
            .expect("the certificate");

            store
                .write_certificate(&certificate)
                .await
                .expect("the certificate");
            store
                .write_revocation(
                    &revoke(&owner_key, &old_root, &certificate, &at).expect("the revocation"),
                )
                .await
                .expect("the revocation");
            retired.push(certificate);
        }

        // a manager's certificate, issued by the founder, issuing one further down.
        let (bilal_key, bilal_certificate) =
            signer_of(&store, &bilal_session).await.expect("bilal's");

        assert_eq!(
            bilal_certificate.issuer_certificate_id.as_deref(),
            Some(old_root.id.as_str())
        );

        let at = (NOW + 3).to_string();
        let deep = issue_certificate(
            &bilal_key,
            &bilal_certificate,
            Issue {
                id: &format!("{}-deep", certificate_id(&sami.member_id, &at)),
                member_id: &sami.member_id,
                signing_public_key: &signing_key_of(&sami_session),
                ceiling: permission::MEMBER_ROLE.mask,
                rank: permission::MEMBER_ROLE.rank,
                issued_at: &at,
            },
        )
        .expect("the certificate further down");

        store
            .write_certificate(&deep)
            .await
            .expect("the certificate further down");

        crate::organization::mark::set_mark(
            &store,
            &owner,
            &[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 13],
            NOW + 4,
        )
        .await
        .expect("the founder could not set the mark");

        let (certificates, revocations) = store.chain_rows().await.expect("the chain");
        let before = Chain::new(&old_key, &certificates, &revocations);
        let live_before: Vec<Certificate> = certificates
            .iter()
            .filter(|certificate| before.live(&certificate.id).is_ok())
            .cloned()
            .collect();

        assert!(live_before.iter().any(|live| live.id == deep.id));
        assert!(
            retired
                .iter()
                .all(|certificate| before.live(&certificate.id).is_err())
        );

        offer_ownership(&store, &owner, &ada.member_id, PASSWORD, NOW + 5)
            .await
            .expect("the offer failed");
        accept_ownership(
            &store,
            &mut ada_session,
            &mut ada_machine,
            ADMINISTRATORS_PASSWORD,
            NOW + 6,
        )
        .await
        .expect("the acceptance failed");

        let new_key = ada_session.verifying_key;
        let (certificates, revocations) = store.chain_rows().await.expect("the chain");
        let after = Chain::new(&new_key, &certificates, &revocations);
        let new_root = certificates
            .iter()
            .find(|certificate| certificate.is_root() && after.live(&certificate.id).is_ok())
            .expect("no root verifies under the new key");

        assert_eq!(new_root.member_id, ada.member_id);
        assert_eq!(ada_session.permissions, permission::OWNER_ROLE.mask);

        // every certificate that was live is live under the new key, and each the founder issued
        // directly, their own among them, was issued again from the new owner's root.
        for was in &live_before {
            let now = after
                .live(&was.id)
                .unwrap_or_else(|refusal| panic!("{} stopped verifying: {refusal:?}", was.id));

            assert_eq!(now.member_id, was.member_id);
            assert_eq!(now.signing_public_key, was.signing_public_key);

            if was.issuer_certificate_id.as_deref() == Some(old_root.id.as_str())
                || was.id == old_root.id
            {
                assert_eq!(
                    now.issuer_certificate_id.as_deref(),
                    Some(new_root.id.as_str()),
                    "{} was not issued again under the new owner",
                    was.id
                );
            } else if was.id != new_root.id {
                assert_eq!(now.issuer_certificate_id, was.issuer_certificate_id);
            }
        }

        assert_eq!(
            after
                .live(&bilal_certificate.id)
                .expect("bilal's certificate")
                .issuer_certificate_id
                .as_deref(),
            Some(new_root.id.as_str())
        );
        assert_eq!(
            after
                .live(&deep.id)
                .expect("the certificate further down")
                .issuer_certificate_id
                .as_deref(),
            Some(bilal_certificate.id.as_str())
        );

        // the founder's certificate is a manager's, and their row names the manager role.
        let founders = after.live(&old_root.id).expect("the founder's certificate");

        assert!(!founders.is_root());
        assert_eq!(founders.ceiling, permission::MANAGER_ROLE.mask);
        assert_eq!(founders.rank, permission::MANAGER_ROLE.rank);

        let founder_row = store
            .members(&new_key)
            .await
            .expect("every member row verifies under the new key")
            .into_iter()
            .find(|member| member.id == owner.member_id)
            .expect("the founder's row");

        assert_eq!(founder_row.role_id, permission::MANAGER);
        assert_eq!(founder_row.override_mask, 0);
        assert_eq!(founder_row.effective, permission::MANAGER_ROLE.mask);

        // what the founder revoked as the owner stays revoked.
        for certificate in &retired {
            assert!(
                after.live(&certificate.id).is_err(),
                "{} was revoked by the founder and verifies again",
                certificate.id
            );
        }

        // and the rows the root signed read under the new key: the roles and the mark with them.
        store
            .roles(&new_key)
            .await
            .expect("the role rows do not verify under the new key");
        assert!(
            store
                .mark(&new_key)
                .await
                .expect("the mark does not verify under the new key")
                .is_some()
        );
        store
            .grants(&new_key)
            .await
            .expect("the grants do not verify under the new key");
    }

    /// **Criterion 22, every other machine.** A second store holding the key the organization was
    /// handed over from reads the succession, checks the new key under the one it pinned, pins it,
    /// and verifies every row.
    ///
    /// **This is the signature the whole design rests on.** The completion is signed by the key
    /// being left, so a machine that was not present for the handover has exactly one thing it can
    /// check the change against, and it is the thing it already holds.
    #[tokio::test]
    async fn a_second_store_holding_the_old_key_follows_the_succession_and_verifies_every_row() {
        let directory = scratch("follow");
        let (store, owner, link, workspace_id) = owned(&directory).await;
        let (ada, mut ada_session, mut ada_machine) = a_settled_administrator(
            &directory,
            &store,
            &owner,
            &link,
            &workspace_id,
            "ada.admin",
            ADMINISTRATORS_PASSWORD,
        )
        .await;
        let old_key = owner.verifying_key;

        offer_ownership(&store, &owner, &ada.member_id, PASSWORD, NOW + 1)
            .await
            .expect("the offer failed");
        accept_ownership(
            &store,
            &mut ada_session,
            &mut ada_machine,
            ADMINISTRATORS_PASSWORD,
            NOW + 2,
        )
        .await
        .expect("the acceptance failed");

        let new_key = ada_session.verifying_key;
        let elsewhere = another_machine(&directory, &owner.organization_id).await;
        let mut third = holding(&directory, "third-machine", &owner, old_key);

        // before it follows, the rows are refused: the key it pinned signs nothing here now.
        assert!(elsewhere.members(&old_key).await.is_err());

        let followed = follow_succession(&elsewhere, &mut third)
            .await
            .expect("the walk failed")
            .expect("the machine did not follow the succession");

        assert_eq!(followed, new_key);
        assert_eq!(
            third
                .organization
                .as_ref()
                .expect("the record")
                .verifying_key,
            encoded(new_key)
        );

        elsewhere
            .members(&new_key)
            .await
            .expect("every member row verifies on the machine that followed");
        elsewhere
            .workspaces(&new_key)
            .await
            .expect("every workspace row verifies on the machine that followed");
        elsewhere
            .grants(&new_key)
            .await
            .expect("every grant row verifies on the machine that followed");

        // and a machine that pinned neither end follows nothing and is left holding what it held,
        // which is a machine that refuses the rows exactly as it refuses any it cannot verify.
        let mut stranger = holding(
            &directory,
            "a-stranger",
            &owner,
            OrganizationKey::generate().expect("a key").verifying_key(),
        );

        assert_eq!(
            follow_succession(&elsewhere, &mut stranger)
                .await
                .expect("the walk failed"),
            None
        );
    }

    /// **Criterion 22, the planted seal.** A seal written onto the offered row under some other
    /// seed opens to something that is not the key this machine pinned, and the acceptance refuses
    /// before a byte of the directory is rewritten.
    ///
    /// **This is what makes the seal safe to leave in a database every member can write.** Anybody
    /// holding a full-access grant can put a seal on a row; nobody but the holder of the key can
    /// put one there that opens to the key the accepting machine already has from its link.
    #[tokio::test]
    async fn a_planted_seal_opens_nothing_and_the_acceptance_refuses() {
        let directory = scratch("planted-seal");
        let (store, owner, link, workspace_id) = owned(&directory).await;
        let (ada, mut ada_session, mut ada_machine) = a_settled_administrator(
            &directory,
            &store,
            &owner,
            &link,
            &workspace_id,
            "ada.admin",
            ADMINISTRATORS_PASSWORD,
        )
        .await;

        offer_ownership(&store, &owner, &ada.member_id, PASSWORD, NOW + 1)
            .await
            .expect("the offer failed");

        // somebody replaces the seal with one over a seed of their own, which is the shape of the
        // attack review round one found: the seal opens for the offered account, and what it
        // yields is a key the attacker made rather than the one this directory is signed under.
        let planted = OrganizationKey::generate().expect("a key").to_bytes();
        let (key, certificate) = signer_of(&store, &owner).await.expect("the owner's signer");
        let signer = Signer {
            key: &key,
            certificate: &certificate,
        };
        let row = store
            .members(&owner.verifying_key)
            .await
            .expect("the rows")
            .into_iter()
            .find(|member| member.id == ada.member_id)
            .expect("the offered row");

        store
            .write_member(
                &signer,
                &MemberRecord {
                    owner_seed_sealed: Some(
                        seal_to_public_key(&row.vault.public_key, &planted).expect("the seal"),
                    ),
                    ..row
                },
            )
            .await
            .expect("the planted seal");

        let before = every_row(&store).await;
        let refused = accept_ownership(
            &store,
            &mut ada_session,
            &mut ada_machine,
            ADMINISTRATORS_PASSWORD,
            NOW + 2,
        )
        .await
        .expect_err("a planted seal handed the organization over");

        assert!(matches!(refused, Error::Integrity { .. }), "{refused:?}");
        assert_eq!(
            every_row(&store).await,
            before,
            "a refused acceptance rewrote the directory"
        );

        // the directory is still the founder's, and this session still holds their key.
        store
            .members(&owner.verifying_key)
            .await
            .expect("the directory is still signed under the key it was");
        assert_eq!(ada_session.role, permission::ADMINISTRATOR);
    }

    /// **Criterion 22, a planted certificate.** The certificate table is read raw, and a
    /// certificate no row names is checked by nothing until a handover re-issues the table. One
    /// written by a member holding the organization credential, naming their own signing key under
    /// a signature nothing made, must come out of the acceptance as refused as it went in: the
    /// re-issue is of what the key being left issued, and of nothing else.
    #[tokio::test]
    async fn a_planted_certificate_is_not_reissued_by_the_handover() {
        let directory = scratch("planted-certificate");
        let (store, owner, link, workspace_id) = owned(&directory).await;
        let (ada, mut ada_session, mut ada_machine) = a_settled_administrator(
            &directory,
            &store,
            &owner,
            &link,
            &workspace_id,
            "ada.admin",
            ADMINISTRATORS_PASSWORD,
        )
        .await;
        let (bilal, bilal_session) = a_member(
            &store,
            &owner,
            &link,
            "bilal",
            permission::MEMBER,
            &workspace_id,
        )
        .await;
        let old_key = owner.verifying_key;

        // a member holding the organization credential writes a certificate for the key their
        // own vault derives, with a signature nothing issued. No row names it, so nothing refuses
        // it: it waits for the handover.
        let planted_key = AdministratorKey::from_bytes(
            &bilal_session
                .secret
                .derive_seed(ADMINISTRATOR_KEY_PURPOSE)
                .expect("the seed"),
        );
        // named as issued by the founder's root, which is the set the handover issues again.
        let root = store
            .certificates()
            .await
            .expect("the certificates")
            .into_iter()
            .find(Certificate::is_root)
            .expect("the founder's root");
        let planted = Certificate {
            id: format!("cert-{}", bilal.member_id),
            member_id: bilal.member_id.clone(),
            signing_public_key: planted_key.verifying_key(),
            issuer_certificate_id: Some(root.id.clone()),
            ceiling: permission::MANAGER_ROLE.mask,
            rank: 1,
            issued_at: NOW.to_string(),
            signature: vec![7; 64],
        };
        let judged = |key: &[u8; VERIFYING_KEY_BYTES], certificates: &[Certificate]| {
            Chain::new(key, certificates, &[]).live(&planted.id).is_ok()
        };

        store
            .write_certificate(&planted)
            .await
            .expect("the planted certificate");
        assert!(!judged(
            &old_key,
            &store.certificates().await.expect("the certificates")
        ));

        offer_ownership(&store, &owner, &ada.member_id, PASSWORD, NOW + 1)
            .await
            .expect("the offer failed");
        accept_ownership(
            &store,
            &mut ada_session,
            &mut ada_machine,
            ADMINISTRATORS_PASSWORD,
            NOW + 2,
        )
        .await
        .expect("the acceptance failed");

        let new_key = ada_session.verifying_key;

        // the founder's certificate was re-issued and still authorises; the planted one is as it
        // was written, verifies under neither key, and its holder signs nothing.
        assert!(certified(&store, &owner.member_id).await);
        assert!(certified(&store, &ada.member_id).await);

        let after = store
            .certificates()
            .await
            .expect("the certificates")
            .into_iter()
            .find(|certificate| certificate.id == planted.id)
            .expect("the planted certificate is still there");

        assert_eq!(after.signature, vec![7; 64]);
        assert!(!judged(
            &new_key,
            &store.certificates().await.expect("the certificates")
        ));

        let rows = store
            .members(&new_key)
            .await
            .expect("every member row still verifies under the new key");

        // and a row signed under it is refused by every reader, which is what the re-issue
        // would have changed: the planted certificate would have come out signed by the key.
        let row = rows
            .into_iter()
            .find(|member| member.id == bilal.member_id)
            .expect("bilal's row");
        let signer = Signer {
            key: &planted_key,
            certificate: &after,
        };

        store
            .write_member(
                &signer,
                &MemberRecord {
                    role_id: permission::MANAGER.to_string(),
                    override_mask: 0,
                    ..row
                },
            )
            .await
            .expect("the row is written; it is the readers that refuse it");
        assert!(
            store.members(&new_key).await.is_err(),
            "a row signed under the planted certificate verified"
        );
    }

    /// **Criterion 22, the withdrawal.** Taking the offer back deletes the succession row and
    /// clears the seal off the row it was written to, so the account it was offered to can accept
    /// nothing afterwards.
    #[tokio::test]
    async fn the_withdrawal_clears_the_offer_and_the_seal() {
        let directory = scratch("withdraw");
        let (store, owner, link, workspace_id) = owned(&directory).await;
        let (ada, mut ada_session, mut ada_machine) = a_settled_administrator(
            &directory,
            &store,
            &owner,
            &link,
            &workspace_id,
            "ada.admin",
            ADMINISTRATORS_PASSWORD,
        )
        .await;

        offer_ownership(&store, &owner, &ada.member_id, PASSWORD, NOW + 1)
            .await
            .expect("the offer failed");

        assert!(
            sealed_on(&store, &owner, &ada.member_id).await,
            "the offer wrote no seal"
        );

        withdraw_offer(&store, &owner, NOW + 2)
            .await
            .expect("the withdrawal failed");

        assert_eq!(
            standing_offer(&store, &owner.verifying_key)
                .await
                .expect("the successions"),
            None
        );
        assert!(
            !sealed_on(&store, &owner, &ada.member_id).await,
            "the withdrawal left the seal on the row"
        );

        // and there is nothing left to accept.
        let refused = accept_ownership(
            &store,
            &mut ada_session,
            &mut ada_machine,
            ADMINISTRATORS_PASSWORD,
            NOW + 3,
        )
        .await
        .expect_err("a withdrawn offer was accepted");

        assert!(
            matches!(refused, Error::Refused { reason: crate::error::RefusalReason::NothingOffered, ref message } if message == NOTHING_WAS_OFFERED),
            "{refused:?}"
        );

        // withdrawing again says the same thing rather than writing anything.
        let again = withdraw_offer(&store, &owner, NOW + 4)
            .await
            .expect_err("an offer that is not there was withdrawn");

        assert!(
            matches!(again, Error::Refused { reason: crate::error::RefusalReason::NothingOffered, ref message } if message == NOTHING_WAS_OFFERED),
            "{again:?}"
        );
    }

    /// **Criterion 22, the chain.** A machine that pinned the first key and was away for two
    /// handovers walks both links and lands on the key in force, because each link is signed by
    /// the key the one before it handed over.
    #[tokio::test]
    async fn two_successions_in_a_row_are_followed_by_a_machine_that_pinned_the_first_key() {
        let directory = scratch("two-successions");
        let (store, owner, link, workspace_id) = owned(&directory).await;
        let (ada, mut ada_session, mut ada_machine) = a_settled_administrator(
            &directory,
            &store,
            &owner,
            &link,
            &workspace_id,
            "ada.admin",
            ADMINISTRATORS_PASSWORD,
        )
        .await;
        let (bilal, mut bilal_session, mut bilal_machine) = a_settled_administrator(
            &directory,
            &store,
            &owner,
            &link,
            &workspace_id,
            "bilal.admin",
            BILALS_PASSWORD,
        )
        .await;
        let first_key = owner.verifying_key;

        // the founder hands it to ada.
        offer_ownership(&store, &owner, &ada.member_id, PASSWORD, NOW + 1)
            .await
            .expect("the first offer failed");
        accept_ownership(
            &store,
            &mut ada_session,
            &mut ada_machine,
            ADMINISTRATORS_PASSWORD,
            NOW + 2,
        )
        .await
        .expect("the first acceptance failed");

        // bilal's machine was signed in under the first key and follows the first succession, the
        // way `command::succession_followed` does it: the record is re-pinned by the walk and the
        // open session is re-pinned beside it.
        assert!(
            follow_succession(&store, &mut bilal_machine)
                .await
                .expect("the walk failed")
                .is_some()
        );

        bilal_session.verifying_key = ada_session.verifying_key;

        // and ada hands it on again.
        offer_ownership(
            &store,
            &ada_session,
            &bilal.member_id,
            ADMINISTRATORS_PASSWORD,
            NOW + 3,
        )
        .await
        .expect("the second offer failed");
        accept_ownership(
            &store,
            &mut bilal_session,
            &mut bilal_machine,
            BILALS_PASSWORD,
            NOW + 4,
        )
        .await
        .expect("the second acceptance failed");

        let last_key = bilal_session.verifying_key;

        assert_ne!(last_key, first_key);
        assert_ne!(last_key, ada_session.verifying_key);

        // and the machine that was away for both: it pinned the founder's key and walks two links.
        let elsewhere = another_machine(&directory, &owner.organization_id).await;
        let mut away = holding(&directory, "away", &owner, first_key);

        assert_eq!(
            follow_succession(&elsewhere, &mut away)
                .await
                .expect("the walk failed"),
            Some(last_key),
            "the machine did not walk both successions"
        );

        elsewhere
            .members(&last_key)
            .await
            .expect("every member row verifies under the key at the end of the chain");
    }
    /// **Criterion 22 at its seams: a removed or signed-out-everywhere account cannot accept.**
    /// An offer is a fact about the row, and what happens to the person after it was made has to
    /// reach the acceptance. Removal takes the offer with the row, the seal off it and the
    /// succession row out, so nothing remains that a removed account could accept with; and the
    /// acceptance reads its own row as every act reads one, so a person removed or signed out
    /// everywhere since is refused by name either way, and the founder stays owner.
    #[tokio::test]
    async fn a_removed_or_signed_out_everywhere_account_cannot_accept_the_offer() {
        let directory = scratch("accept-refused-on-the-row");
        let (store, owner, link, workspace_id) = owned(&directory).await;
        let (ada, mut ada_session, mut ada_machine) = a_settled_administrator(
            &directory,
            &store,
            &owner,
            &link,
            &workspace_id,
            "ada.admin",
            ADMINISTRATORS_PASSWORD,
        )
        .await;
        let (bilal, mut bilal_session, mut bilal_machine) = a_settled_administrator(
            &directory,
            &store,
            &owner,
            &link,
            &workspace_id,
            "bilal.admin",
            BILALS_PASSWORD,
        )
        .await;

        // offered to ada, then ada is removed: the offer goes with her row.
        offer_ownership(&store, &owner, &ada.member_id, PASSWORD, NOW + 1)
            .await
            .expect("the offer failed");

        assert!(sealed_on(&store, &owner, &ada.member_id).await);

        let row = store
            .members(&owner.verifying_key)
            .await
            .expect("the rows")
            .into_iter()
            .find(|member| member.id == ada.member_id)
            .expect("ada's row");

        removal::retire_member(&store, &owner, &row, NOW + 2)
            .await
            .expect("the removal failed");

        assert_eq!(
            standing_offer(&store, &owner.verifying_key)
                .await
                .expect("the successions"),
            None,
            "the removal left the offer standing"
        );
        assert!(
            !sealed_on(&store, &owner, &ada.member_id).await,
            "the removal left the seal on the row"
        );

        let before = every_row(&store).await;
        let removed = accept_ownership(
            &store,
            &mut ada_session,
            &mut ada_machine,
            ADMINISTRATORS_PASSWORD,
            NOW + 3,
        )
        .await
        .expect_err("a removed account accepted the organization");

        assert!(
            matches!(removed, Error::Refused { reason: crate::error::RefusalReason::YouWereRemoved, ref message } if message.contains("removed")),
            "{removed:?}"
        );
        assert_eq!(
            every_row(&store).await,
            before,
            "a refused acceptance wrote something"
        );

        // and offered to bilal, whose sessions are then ended from every machine: the row keeps
        // the seal and the offer stands, since nothing about the offer moved, but the session
        // that would accept is behind the row and is refused for that.
        offer_ownership(&store, &owner, &bilal.member_id, PASSWORD, NOW + 4)
            .await
            .expect("the second offer failed");
        end_member_sessions(&store, &owner, &bilal.member_id, NOW + 5)
            .await
            .expect("ending bilal's sessions failed");

        let before = every_row(&store).await;
        let signed_out = accept_ownership(
            &store,
            &mut bilal_session,
            &mut bilal_machine,
            BILALS_PASSWORD,
            NOW + 6,
        )
        .await
        .expect_err("a signed-out-everywhere account accepted the organization");

        assert!(
            matches!(signed_out, Error::Refused { reason: crate::error::RefusalReason::SessionsEnded, ref message } if message.contains("ended from another machine")),
            "{signed_out:?}"
        );
        assert_eq!(
            every_row(&store).await,
            before,
            "a refused acceptance wrote something"
        );

        // the founder is the owner throughout, under the key they always held.
        assert_eq!(
            row_of(&store, &owner, &owner.member_id).await,
            (
                permission::OWNER.to_string(),
                permission::mask_of_role(permission::OWNER)
            )
        );
        assert_eq!(bilal_session.role, permission::ADMINISTRATOR);
    }

    /// **Criterion 22 at its seams: a withdrawal that finds the offer accepted is refused by
    /// name** (the human's decision at review round two). The founder's session still holds the
    /// key that was handed over and still says owner; what its pull brought is the completed
    /// succession. Deleting that row would strand every machine that has not followed yet, so
    /// nothing is written and the sentence says what happened.
    #[tokio::test]
    async fn a_withdrawal_that_finds_the_offer_accepted_is_refused_by_name() {
        let directory = scratch("withdraw-after-acceptance");
        let (store, owner, link, workspace_id) = owned(&directory).await;
        let (ada, mut ada_session, mut ada_machine) = a_settled_administrator(
            &directory,
            &store,
            &owner,
            &link,
            &workspace_id,
            "ada.admin",
            ADMINISTRATORS_PASSWORD,
        )
        .await;

        offer_ownership(&store, &owner, &ada.member_id, PASSWORD, NOW + 1)
            .await
            .expect("the offer failed");
        accept_ownership(
            &store,
            &mut ada_session,
            &mut ada_machine,
            ADMINISTRATORS_PASSWORD,
            NOW + 2,
        )
        .await
        .expect("the acceptance failed");

        let before = every_row(&store).await;
        let refused = withdraw_offer(&store, &owner, NOW + 3)
            .await
            .expect_err("an accepted offer was withdrawn");

        assert!(
            matches!(refused, Error::Refused { reason: crate::error::RefusalReason::OfferAccepted, ref message } if message == THE_OFFER_WAS_ACCEPTED),
            "{refused:?}"
        );
        assert_eq!(
            every_row(&store).await,
            before,
            "a refused withdrawal wrote something"
        );

        // the succession row is still there for every other machine to follow, and ada is the
        // owner under the key her vault derives.
        let new_key = ada_session.verifying_key;
        let elsewhere = another_machine(&directory, &owner.organization_id).await;
        let mut third = holding(&directory, "third-machine", &owner, owner.verifying_key);

        assert_eq!(
            follow_succession(&elsewhere, &mut third)
                .await
                .expect("the walk failed"),
            Some(new_key)
        );
        assert_eq!(
            row_of_under(&store, &new_key, &ada.member_id).await,
            (
                permission::OWNER.to_string(),
                permission::mask_of_role(permission::OWNER)
            )
        );
    }

    /// **Criterion 22 at its seams: a certificate is issued under the pinned key or not at all.**
    /// The founder's session, re-pinned onto the key the organization is on now, is the
    /// administrator's its row says; and a session that somehow kept the word `owner` past the
    /// re-pin still cannot certify anybody, because the key its vault derives is not the one it
    /// has pinned and the derivation is refused by name before a certificate is written.
    #[tokio::test]
    async fn a_session_whose_vault_does_not_derive_the_pinned_key_certifies_nobody() {
        let directory = scratch("certify-under-the-pinned-key");
        let (store, mut owner, link, workspace_id) = owned(&directory).await;
        let (ada, mut ada_session, mut ada_machine) = a_settled_administrator(
            &directory,
            &store,
            &owner,
            &link,
            &workspace_id,
            "ada.admin",
            ADMINISTRATORS_PASSWORD,
        )
        .await;
        let (sami, _) = a_member(
            &store,
            &owner,
            &link,
            "sami.staff",
            permission::MEMBER,
            &workspace_id,
        )
        .await;

        // before the handover the founder's derivation is the key in force.
        assert_eq!(
            organization_key_of(&owner)
                .expect("the founder's key")
                .verifying_key(),
            owner.verifying_key
        );

        offer_ownership(&store, &owner, &ada.member_id, PASSWORD, NOW + 1)
            .await
            .expect("the offer failed");
        accept_ownership(
            &store,
            &mut ada_session,
            &mut ada_machine,
            ADMINISTRATORS_PASSWORD,
            NOW + 2,
        )
        .await
        .expect("the acceptance failed");

        let new_key = ada_session.verifying_key;

        // the founder's session follows the succession the way `command::followed` moves it: the
        // key, and what its own row says under it.
        repin(&store, &mut owner, new_key)
            .await
            .expect("the founder's session did not re-pin");

        assert_eq!(owner.verifying_key, new_key);
        assert_eq!(owner.role, permission::ADMINISTRATOR);
        assert_eq!(
            permission::acts_of(owner.permissions),
            permission::mask_of_role(permission::ADMINISTRATOR)
        );

        // and it is refused the key by name.
        let refused = organization_key_of(&owner).expect_err("the founder's vault certified");

        assert!(
            matches!(refused, Error::Refused { reason: crate::error::RefusalReason::KeyNotInForce, ref message } if message == NOT_THE_KEY_IN_FORCE),
            "{refused:?}"
        );

        // a session that kept the word past the re-pin: the one gate the word passes leads to the
        // derivation, and the derivation refuses. Nothing is written, and in particular no
        // certificate under the key that was handed over.
        owner.role = permission::OWNER.to_string();

        let certificates = store.certificates().await.expect("the certificates").len();
        let before = every_row(&store).await;
        let widened = change_role(
            &store,
            &owner,
            &sami.member_id,
            permission::ADMINISTRATOR,
            permission::mask_of_role(permission::ADMINISTRATOR),
            NOW + 3,
        )
        .await
        .expect_err("a certificate was issued under a key that was handed over");

        assert!(
            matches!(widened, Error::Refused { reason: crate::error::RefusalReason::KeyNotInForce, ref message } if message == NOT_THE_KEY_IN_FORCE),
            "{widened:?}"
        );
        assert_eq!(
            every_row(&store).await,
            before,
            "a refused widening wrote something"
        );
        assert_eq!(
            store.certificates().await.expect("the certificates").len(),
            certificates
        );

        // the directory still verifies under the key in force, on this machine and on another.
        store
            .members(&new_key)
            .await
            .expect("every member row verifies");
        another_machine(&directory, &owner.organization_id)
            .await
            .members(&new_key)
            .await
            .expect("every member row verifies on the other machine");
    }
}
