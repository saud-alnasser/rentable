//! what a member may do, changed from their row and from the roles: the role they hold, their
//! override, the roles themselves, and the certificate that follows all three.
//!
//! **A role is a named set of flags and the override changes it for one member** (effort 838,
//! requirements 4 to 6). A member's permissions are their role's mask exclusive-or'd with their
//! override, computed on read from the verified rows; what changes them is a write to a role row
//! ([`create_role`], [`rename_role`], [`set_role_mask`], [`move_role`], [`delete_role`]) or to the
//! member's own row ([`assign_role`], [`set_override`]). *A role was a word beside a hand-edited
//! number until effort 838, and `change_role` wrote the two together.*
//!
//! **Nobody reaches above themselves or grants what they do not hold** (requirement 7). Each act is
//! gated on its flag, on the rank of what it touches, strictly below the actor's, on never being the
//! actor's own row, and on every flag it changes, in a role's mask or in anybody's effective
//! permissions, being one the actor holds; none of the owner's flags is set anywhere but on the
//! owner. The comparison is made here, with the before and the after in hand ([`apply`]); a reader
//! checks that a row is one its certificate may sign, which bounds a role's mask and a member's
//! override by the signer's ceiling and never lets a signer's own row be theirs to sign.
//!
//! **The certificate follows, in the same act** ([`reissue`], requirement 9). Whoever changes a
//! member's effective permissions or rank issues them a fresh certificate from their own, re-signs
//! under their own the rows the old one signed, issues again what the old one issued, and revokes
//! it, all in one transaction. A manager therefore gives a member a flag that signs rows with the
//! owner's machine off, and it verifies on the next sync. A holder whose certificate the actor
//! could not issue refuses the whole act by name. `workspace::signer_of` is untouched: a member
//! signs because a certificate names their key, never because something read their role.
//!
//! **Nobody changes their own row and nobody changes the owner's.** The first keeps the act an act
//! on somebody else, so a manager cannot grant themselves what they were not given; the second is
//! requirement 3's, and the organization is the owner's.
//!
//! **Which leaves one way for the owner's row to change, and it is two acts on two machines**
//! (effort 828, requirement 22). The owner offers the organization to an account whose password is
//! set; that person accepts on a machine they are signed in on, with their own password, and the
//! organization key becomes what their vault derives. The root is issued to them under it, and
//! every certificate the founder issued to somebody else is issued again from it with the same ids
//! and signing keys, so nothing a manager signed is disturbed, while the one the new owner held
//! before is retired once its rows are theirs as the root; a `succession` row signed by the old key
//! over the new is what lets every other machine follow. An owner's way
//! back is then their password and nothing read out of the directory, founder or transferee alike.
//! *It was one act that sealed the founder's key into the new owner's row and left the key
//! unchanged, until review round one found that a way back resting on that seal rests on the
//! database it is meant to judge.*

use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD as BASE64URL};
use serde::{Deserialize, Serialize};

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
    permission::{self, CUSTOM, Flag},
    session::{Actor, MemberSession, acting_row, actor, rank_of, verifying_key_of},
    setup::{ADMINISTRATOR_KEY_PURPOSE, ORGANIZATION_KEY_PURPOSE, owner_key_from},
    store::{
        MemberRecord, OrganizationRecord, OrganizationStore, RoleRecord, Signer, SuccessionRecord,
    },
    vault::{
        MemberSecretKey, SECRET_KEY_BYTES, Vault, open_content, open_vault, seal_content,
        seal_to_public_key, unseal_with_secret_key,
    },
    workspace::{require_owner, signer_of},
};

/// Where a member stands in the chain: the one role they hold, their override, what the two give
/// them, and the rank of the role.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) struct Standing<'a> {
    pub role_id: &'a str,
    pub override_mask: i64,
    pub effective: i64,
    pub rank: i64,
}

/// Run `act` inside one transaction on this replica: every write it makes lands, or none does.
///
/// **What makes a refusal part way an act that did nothing** (effort 838). A role edit writes a
/// role row, the rows of everybody who holds it, a certificate and a revocation per holder and the
/// rows each old certificate signed; the last holder's certificate being one the actor cannot
/// issue has to leave the first holder's as it was.
pub(super) async fn in_one_transaction<T>(
    store: &OrganizationStore,
    act: impl Future<Output = Result<T, Error>>,
) -> Result<T, Error> {
    store.begin().await?;

    match act.await {
        Ok(value) => {
            store.commit().await?;

            Ok(value)
        }
        Err(error) => {
            let _ = store.rollback().await;

            Err(error)
        }
    }
}

/// Re-issue a member's certificate: issue a fresh one for their standing, and retire every older
/// one after re-signing what it signed and issuing again what it issued (effort 838). **All of it
/// in one transaction**, so a refusal or a failure part way leaves the chain as it was.
///
/// `signing` is the member's signing key and their standing, or `None` for a member who is to hold
/// no certificate, which is a removed one: every live one they hold is retired and none is issued.
/// [`reissue_within`] says what the rest does.
pub(super) async fn reissue(
    store: &OrganizationStore,
    session: &MemberSession,
    signer: &Signer<'_>,
    member_id: &str,
    signing: Option<(&[u8; VERIFYING_KEY_BYTES], Standing<'_>)>,
    now: i64,
) -> Result<(), Error> {
    in_one_transaction(
        store,
        reissue_within(store, session, signer, member_id, signing, now),
    )
    .await
}

/// [`reissue`]'s writes, for a caller that holds the transaction itself.
///
/// The new certificate is issued down from `signer`'s, carrying the member's effective permissions
/// as its ceiling and their role's rank, so the issue itself refuses a standing wider or higher
/// than the actor's (`authority::issue_certificate`). Where the member already holds exactly one
/// live certificate naming that key, ceiling and rank, nothing is written: **every live member
/// holds exactly one live certificate**, and this is what keeps it one.
///
/// **What an old certificate issued is issued again, from the actor's, before it is revoked.** A
/// revocation retires everything below the certificate it names, so a member whose standing moved
/// would otherwise take with them every certificate they had issued, and every row signed under
/// those. Each is issued again under its own id with its own fields, as the handover issues the
/// founder's ([`accept_ownership`]), so every row it signed goes on verifying and nothing further
/// down moves; one the actor's certificate could not have issued, a flag beyond theirs or a rank
/// not below them, refuses the whole act by name.
///
/// **Refused, naming what is needed, where the actor could not sign a row the old certificate
/// signed** (`store::re_sign_rows_of_certificate`): re-signing a grant needs `grantWorkspace`, and
/// deleting it instead would take somebody's access away.
pub(super) async fn reissue_within(
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

    let issued_at = now.to_string();

    if let Some((signing_public_key, standing)) = signing {
        if let Some(flag) =
            permission::first_not_held(signer.certificate.ceiling, standing.effective)
        {
            return Err(Error::refused(
                RefusalReason::RoleLacksAct,
                format!(
                    "their permissions would include {flag}, and yours do not, so their \
                     certificate cannot be issued from yours. nothing was changed"
                ),
            ));
        }

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

    for old in &live {
        reissue_what_it_issued(store, session, signer, old).await?;
        store
            .re_sign_rows_of_certificate(&session.verifying_key, &old.id, signer)
            .await?;
        store
            .write_revocation(&revoke(signer.key, signer.certificate, old, &issued_at)?)
            .await?;
    }

    Ok(())
}

/// Issue again, from `signer`'s certificate, every live certificate `old` issued: under the same
/// id, for the same key, with the same ceiling, rank and moment, so the rows each signed and the
/// certificates each issued in turn stand as they were once `old` is revoked.
async fn reissue_what_it_issued(
    store: &OrganizationStore,
    session: &MemberSession,
    signer: &Signer<'_>,
    old: &Certificate,
) -> Result<(), Error> {
    let (certificates, revocations) = store.chain_rows().await?;
    let chain = Chain::new(&session.verifying_key, &certificates, &revocations);
    let issued: Vec<&Certificate> = certificates
        .iter()
        .filter(|certificate| {
            certificate.issuer_certificate_id.as_deref() == Some(old.id.as_str())
                && chain.live(&certificate.id).is_ok()
        })
        .collect();

    for certificate in issued {
        if let Some(flag) =
            permission::first_not_held(signer.certificate.ceiling, certificate.ceiling)
        {
            return Err(Error::refused(
                RefusalReason::RoleLacksAct,
                format!(
                    "a certificate their old one issued carries {flag}, and yours does not, so it \
                     cannot be issued again from yours. nothing was changed"
                ),
            ));
        }

        if certificate.rank >= signer.certificate.rank {
            return Err(Error::refused(
                RefusalReason::RankNotAbove,
                "a certificate their old one issued does not rank below yours, so it cannot be \
                 issued again from yours. nothing was changed",
            ));
        }

        store
            .write_certificate(&issue_certificate(
                signer.key,
                signer.certificate,
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
pub const NOT_THE_KEY_IN_FORCE: &str = "the key your vault derives is not the one this organization is signed under any more. the \
     organization was handed over, and certifying a signer is its owner's";

/// The organization key this session derives, checked against the key it has pinned (effort 828,
/// requirement 22): only the owner's vault derives the key in force, founder or transferee, and a
/// session that followed a succession has a new pinned key the founder's derivation fails against.
///
/// **What the tests ask to say that no organization key is in reach.** No act signs with the
/// organization key since effort 838 but the first run, the root the handover issues and a
/// succession, each of which derives it where it is: a certificate is issued from the issuer's own
/// (`authority::issue_certificate`), so a manager puts a signer into effect without it
/// (requirement 9). *Assigning a signing act read the key through this until effort 838.*
#[cfg(test)]
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

    super::session::refuse_unsettled(member)?;

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
/// **The new owner leaves holding one live certificate, the root.** What they held before it is
/// not issued again: the rows it signed move under the root with the founder's, what it issued is
/// issued again from the root, and the root revokes it. *Until the review of effort 838 it was
/// issued again with the rest, and the new owner held a manager's certificate beside the root.*
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
    // what this member signed with before the root: every certificate they hold that is live
    // under the key being left. Their rows move under the root with the founder's, what they
    // issued is issued again from it, and each is then revoked, so the new owner holds exactly one
    // live certificate (effort 838). Each is issued again from the root before it is revoked, like
    // every certificate the founder issued: left under the founder's certificate, which stands no
    // higher than it from here on, it would stop walking, and every revocation it signed would
    // stop counting with it, bringing back whoever this member removed or narrowed as a manager.
    let earlier: Vec<Certificate> = before
        .live_certificates_of(&session.member_id)
        .into_iter()
        .cloned()
        .collect();
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
    // cover a row about another manager. So does every row this member signed before, since the
    // certificate that signed them is about to be revoked. One pass over both, because every row
    // is read under the key being left and the first row moved no longer verifies under it. The
    // two rows whose roles swap are left, because they are written afresh below, and the
    // founder's as it stands names the owner's role, which only its own holder's root signs.
    let retiring: Vec<&str> = std::iter::once(old_root.id.as_str())
        .chain(earlier.iter().map(|certificate| certificate.id.as_str()))
        .collect();

    store
        .re_sign_rows_of_certificates_but(
            &pinned,
            &retiring,
            &signer,
            &[founder.id.as_str(), session.member_id.as_str()],
        )
        .await?;

    // what this member's earlier certificates issued is issued again from the root, under the
    // same ids with the same fields, before those are revoked: a revocation retires everything
    // below the certificate it names. Read under the key being left, so before anything above
    // them is issued again.
    for old in &earlier {
        reissue_what_it_issued(store, session, &signer, old).await?;
    }

    // every certificate the founder issued directly is issued again, under the same id with the
    // same fields, from the new root, so every row it signed goes on verifying. Only what is live
    // under the key being left: a revoked one stays where it was, and nothing re-issues it. The
    // table is read raw, and a certificate no row names is checked by nothing else, so one written
    // by anybody holding the credential, with a signature nothing ever verified, would otherwise
    // leave here signed from the new root; it is left as it is rather than refusing the handover,
    // because a planted row must not be able to hold the organization to its founder. **This
    // member's own is issued again too**, so the revocations it signed go on walking to the key,
    // and it is revoked below: the root is theirs now.
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

    // and this member's earlier certificates are revoked by the root, whatever issued them, so the
    // root is the one live certificate they hold. Its rows moved above and what it issued was
    // issued again, so the revocation retires nothing but the certificate itself.
    for old in &earlier {
        store
            .write_revocation(&revoke(&administrator_key, &root, old, &issued_at)?)
            .await?;
    }

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

/// Sign the owner's own row again under the root where it does not read as the owner's: what the
/// owner's machine does, with nobody acting, when a sign-in, a resume or a heartbeat finds it so
/// (effort 838, the human's decision after review round two). Answers whether it wrote.
///
/// **A demotion written around the command reads as granting nothing, and only the root undoes
/// it.** A member holding the credential who signs the owner's row naming a lower role, or
/// removed, fails on rank alone and reads uncovered, so the owner would hold no permissions and
/// no command of theirs would run to write the row again. The one machine that holds the root is
/// the owner's, so that machine repairs it the moment it reads it: the row is written again as the
/// owner's role, with no override, no removal and no offer's seal, and pushed. **The keys are the
/// owner's own**, the signing key their secret derives and the vault's public half their secret
/// opens, never the row's, which somebody below them wrote (the re-check of ticket 20); every other
/// column stands as it is (the sealed vault, the session epoch, the username).
///
/// **Only for the machine whose vault derives the key the organization is pinned to, and only
/// for its own row.** `secret` derives the organization key (`setup::owner_key_from`); where it is
/// not `verifying_key`, the caller is not the owner, founder or transferee, and nothing is read or
/// written. A manager's machine meeting their own demoted row therefore writes nothing: an
/// uncovered row is never saved (`session::refuse_unsettled`), and the owner removes the manager
/// and makes them an account again. A row that is gone is a deletion,
/// which the chain says it cannot stop (`authority.rs`): there is no vault left to keep, so nothing
/// is written and the point-in-time restore is the answer.
pub(super) async fn repair_owner_row(
    store: &OrganizationStore,
    verifying_key: &[u8; VERIFYING_KEY_BYTES],
    member_id: &str,
    secret: &MemberSecretKey,
    now: i64,
) -> Result<bool, Error> {
    if owner_key_from(secret)?.verifying_key() != *verifying_key {
        return Ok(false);
    }

    let Some(row) = store.member(verifying_key, member_id).await? else {
        return Ok(false);
    };

    if row.role_id == permission::OWNER
        && row.override_mask == 0
        && row.removed_at.is_none()
        && row.effective == permission::OWNER_ROLE.mask
    {
        return Ok(false);
    }

    let key = AdministratorKey::from_bytes(&secret.derive_seed(ADMINISTRATOR_KEY_PURPOSE)?);
    let Some(root) = store
        .live_certificates(verifying_key, member_id)
        .await?
        .into_iter()
        .find(|certificate| {
            certificate.is_root() && certificate.signing_public_key == key.verifying_key()
        })
    else {
        return Ok(false);
    };

    store
        .write_member(
            &Signer {
                key: &key,
                certificate: &root,
            },
            // the keys come from what the owner's own secret derives and opens, never from the
            // row, which somebody below them wrote: a forged signing key re-signed under the root
            // would be the forger's at the owner's rank. The seal of an offer goes too.
            &MemberRecord {
                role_id: permission::OWNER.to_string(),
                override_mask: 0,
                removed_at: None,
                signing_public_key: key.verifying_key(),
                vault: Vault {
                    public_key: secret.public_key(),
                    ..row.vault.clone()
                },
                owner_seed_sealed: None,
                updated_at: now,
                ..row
            },
        )
        .await?;

    sent(
        store,
        "organization.owner.repairNotYetSent",
        "member",
        member_id,
    )
    .await;
    diagnostics::warn("organization.owner.rowRepaired")
        .with("member", member_id)
        .write();

    Ok(true)
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

// -------------------------------------------------------------------------------------------
// Effort 838, requirements 4 to 7 and 9: roles, the role a member holds, and their override.
// -------------------------------------------------------------------------------------------

/// One role as the settings area lists it (effort 838, requirement 12): which role, what kind,
/// what it is called, what it carries, how high it stands, and how many members hold it.
///
/// **`name` is empty on the three built-in roles**, whose names the interface gives in the
/// reader's language; a custom role's is opened with the content key the session holds. Nothing
/// about the certificate that signed the row crosses.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RoleFacts {
    pub id: String,
    /// `owner`, `manager`, `member` or `custom`.
    pub kind: String,
    pub name: String,
    pub mask: i64,
    pub rank: i64,
    /// the members still in who hold the role.
    pub holders: usize,
}

/// The column a custom role's name is sealed under.
const ROLE_NAME_COLUMN: &str = "role.name_sealed";

/// Every role, highest rank first: the owner's constant, then every verified row. What any signed
/// in member reads.
pub async fn roles(
    store: &OrganizationStore,
    session: &MemberSession,
) -> Result<Vec<RoleFacts>, Error> {
    let rows = store.roles(&session.verifying_key).await?;
    let members = store.members(&session.verifying_key).await?;
    let holders = |role_id: &str| {
        members
            .iter()
            .filter(|member| member.role_id == role_id && member.removed_at.is_none())
            .count()
    };
    let mut facts = vec![RoleFacts {
        id: permission::OWNER.to_string(),
        kind: permission::OWNER.to_string(),
        name: String::new(),
        mask: permission::OWNER_ROLE.mask,
        rank: permission::OWNER_ROLE.rank,
        holders: holders(permission::OWNER),
    }];

    for role in rows {
        facts.push(facts_of(session, &role, holders(&role.id))?);
    }

    Ok(facts)
}

/// One verified role row as [`RoleFacts`].
fn facts_of(
    session: &MemberSession,
    role: &RoleRecord,
    holders: usize,
) -> Result<RoleFacts, Error> {
    let name = if role.name_sealed.is_empty() {
        String::new()
    } else {
        String::from_utf8(open_content(
            &session.content_key,
            ROLE_NAME_COLUMN,
            &role.name_sealed,
        )?)
        .map_err(|_| Error::Integrity {
            message: "a role's name did not open as text".to_string(),
        })?
    };

    Ok(RoleFacts {
        id: role.id.clone(),
        kind: role.kind.clone(),
        name,
        mask: role.mask,
        rank: role.rank,
        holders,
    })
}

/// The role a member row names, as the facts about that member carry it (effort 838, requirement
/// 8): its kind, its name and its rank, beside the effective permissions the row already reads.
///
/// **Off the verified rows the caller already read**, so a list of members pays for one read of the
/// roles rather than one per member. A role id no row carries reads as the member's, as
/// [`kind_of`] reads it.
pub(crate) struct HeldRole {
    pub kind: String,
    pub name: String,
    pub rank: i64,
}

/// The kind of the role `role_id` names, from the verified `rows` and the owner's constant: what
/// a session and the machine's record call the role a member holds (effort 838, the plan's
/// *Interfaces*). A role id no row carries reads as the member's, the role a deleted one's holders
/// move to.
pub(crate) fn kind_of(rows: &[RoleRecord], role_id: &str) -> String {
    if role_id == permission::OWNER {
        return permission::OWNER.to_string();
    }

    rows.iter()
        .find(|role| role.id == role_id)
        .map_or_else(|| permission::MEMBER.to_string(), |role| role.kind.clone())
}

/// The role `role_id` names, from the verified `rows` and the owner's constant.
pub(crate) fn held_role(
    session: &MemberSession,
    rows: &[RoleRecord],
    role_id: &str,
) -> Result<HeldRole, Error> {
    if role_id == permission::OWNER {
        return Ok(HeldRole {
            kind: permission::OWNER.to_string(),
            name: String::new(),
            rank: permission::OWNER_ROLE.rank,
        });
    }

    match rows.iter().find(|role| role.id == role_id) {
        Some(role) => {
            let facts = facts_of(session, role, 0)?;

            Ok(HeldRole {
                kind: facts.kind,
                name: facts.name,
                rank: facts.rank,
            })
        }
        None => Ok(HeldRole {
            kind: permission::MEMBER.to_string(),
            name: String::new(),
            rank: permission::MEMBER_ROLE.rank,
        }),
    }
}

/// The role as it reads back after an act on it.
async fn role_facts(
    store: &OrganizationStore,
    session: &MemberSession,
    role_id: &str,
) -> Result<RoleFacts, Error> {
    roles(store, session)
        .await?
        .into_iter()
        .find(|role| role.id == role_id)
        .ok_or_else(|| Error::Integrity {
            message: "the role did not read back".to_string(),
        })
}

/// The member as the members list shows them, after an act on their row.
async fn member_facts(
    store: &OrganizationStore,
    session: &MemberSession,
    member_id: &str,
) -> Result<MemberFacts, Error> {
    members(store, session)
        .await?
        .into_iter()
        .find(|member| member.id == member_id)
        .ok_or_else(|| Error::Integrity {
            message: "the changed member's row did not read back".to_string(),
        })
}

/// A role's verified row, refused by name where this organization holds none under that id. The
/// owner's role is a constant and is not a row, so it is refused here too; a caller that means the
/// owner's role says so first.
fn role_row<'a>(rows: &'a [RoleRecord], role_id: &str) -> Result<&'a RoleRecord, Error> {
    rows.iter().find(|role| role.id == role_id).ok_or_else(|| {
        Error::refused(
            RefusalReason::RoleUnknown,
            "that role is not in this organization",
        )
    })
}

/// Refuse an act that only a custom role takes: renaming, moving and deleting one (requirement 3).
fn refuse_built_in(role_id: &str, act: &str) -> Result<(), Error> {
    if permission::BUILT_IN.iter().any(|role| role.id == role_id) {
        return Err(Error::refused(
            RefusalReason::RoleBuiltIn,
            format!(
                "{role_id} is one of the three roles every organization has, and it is not {act}"
            ),
        ));
    }

    Ok(())
}

/// Requirement 7's "only flags you hold", over what an act changes: every bit of `changed` is one
/// the actor holds. A flag switched off is as changed as one switched on.
fn refuse_unheld(actor: &Actor, changed: i64) -> Result<(), Error> {
    match permission::first_not_held(actor.row.effective, changed) {
        Some(flag) => Err(Error::refused(
            RefusalReason::RoleLacksAct,
            format!("you do not hold {flag}, so you cannot give it or take it away"),
        )),
        None => Ok(()),
    }
}

/// Requirement 2: none of the owner's flags is set anywhere but on the owner.
fn refuse_owner_only(mask: i64) -> Result<(), Error> {
    match permission::first_owner_only(mask) {
        Some(flag) => Err(Error::refused(
            RefusalReason::OwnerOnly,
            format!("{flag} is the owner's alone, and no role or override carries it"),
        )),
        None => Ok(()),
    }
}

/// A custom role's name as the act gives it: trimmed, present, and nobody else's. Compared without
/// case against every custom role but `except` and against the three built-in ids, so no role reads
/// as another.
fn validated_name(
    session: &MemberSession,
    rows: &[RoleRecord],
    name: &str,
    except: Option<&str>,
) -> Result<String, Error> {
    let name = name.trim();

    if name.is_empty() {
        return Err(Error::refused(
            RefusalReason::RoleNameMissing,
            "a role is given a name",
        ));
    }

    let wanted = name.to_lowercase();
    let taken = |held: &str| held.to_lowercase() == wanted;

    if permission::BUILT_IN.iter().any(|role| taken(role.id)) {
        return Err(Error::refused(
            RefusalReason::RoleNameTaken,
            "that name is taken by a role every organization has",
        ));
    }

    for role in rows
        .iter()
        .filter(|role| role.kind == CUSTOM && except != Some(role.id.as_str()))
    {
        if taken(&facts_of(session, role, 0)?.name) {
            return Err(Error::refused(
                RefusalReason::RoleNameTaken,
                "another role is called that",
            ));
        }
    }

    Ok(name.to_string())
}

/// Where a role placed directly below `after_role_id` stands, and the custom roles renumbered to
/// make room for it (effort 838, the plan's *Data Model*).
///
/// `rows` are the role rows the placement is among, without the role being moved. **A custom role
/// ranks strictly between the member and the manager**, so `after_role_id` names the manager or a
/// custom role; the rank taken is the midpoint of it and the role below it, and it has to rank
/// below `top`, which is the actor's rank or the manager's, whichever is lower. Where no integer
/// is left between the two, the custom roles below `top` are renumbered evenly across it with the
/// new one in its place, so the order is kept and every rank moves only below the actor.
fn placed(
    rows: &[RoleRecord],
    after_role_id: &str,
    top: i64,
) -> Result<(i64, Vec<RoleRecord>), Error> {
    let above = if after_role_id == permission::MANAGER {
        permission::MANAGER_ROLE.rank
    } else if after_role_id == permission::OWNER || after_role_id == permission::MEMBER {
        return Err(Error::refused(
            RefusalReason::RoleOutOfPlace,
            "a custom role goes below the manager and above the member",
        ));
    } else {
        role_row(rows, after_role_id)?.rank
    };
    let below = rows
        .iter()
        .map(|role| role.rank)
        .filter(|rank| *rank < above)
        .max()
        .unwrap_or(permission::MEMBER_ROLE.rank);
    let not_below = || {
        Error::refused(
            RefusalReason::RankNotAbove,
            "that place is not below your role, so a role is put there by somebody who ranks \
             above it",
        )
    };

    if above - below >= 2 {
        let rank = below + (above - below) / 2;

        return if rank < top {
            Ok((rank, Vec::new()))
        } else {
            Err(not_below())
        };
    }

    if above > top {
        return Err(not_below());
    }

    // the gap has closed: the custom roles below the actor, highest first, with the new one's
    // place marked, spread evenly between the member and the actor.
    let mut order: Vec<Option<&RoleRecord>> = rows
        .iter()
        .filter(|role| role.kind == CUSTOM && role.rank < top)
        .map(Some)
        .collect();

    order.sort_by_key(|role| role.map(|role| -role.rank));

    let at = order
        .iter()
        .position(|role| role.is_some_and(|role| role.id == after_role_id))
        .map_or(0, |index| index + 1);

    order.insert(at, None);

    let spacing = top / (order.len() as i64 + 1);

    if spacing < 1 {
        return Err(Error::refused(
            RefusalReason::NoRankBelow,
            "there is no room left below your role for another. somebody who ranks above you \
             can make some",
        ));
    }

    let mut rank = 0;
    let mut renumbered = Vec::new();

    for (index, role) in order.into_iter().enumerate() {
        let slot = top - spacing * (index as i64 + 1);

        match role {
            None => rank = slot,
            Some(role) if role.rank != slot => renumbered.push(RoleRecord {
                rank: slot,
                ..role.clone()
            }),
            Some(_) => {}
        }
    }

    Ok((rank, renumbered))
}

/// The highest a role an actor places may stand: below their own rank, and below the manager's,
/// since a custom role ranks under the manager whoever makes it.
fn top_for(actor: &Actor) -> i64 {
    actor.rank.min(permission::MANAGER_ROLE.rank)
}

/// What an act asks of the directory: the role rows it writes as they are to stand, the roles it
/// deletes, and the members it moves to a role or an override, each as `(member, role, override)`.
#[derive(Default)]
struct Change {
    roles: Vec<RoleRecord>,
    deleted: Vec<String>,
    members: Vec<(String, String, i64)>,
}

/// One member row an act rewrites, and where its holder stands before and after.
struct Moved {
    row: MemberRecord,
    role_id: String,
    override_mask: i64,
    effective: i64,
    rank: i64,
}

/// Apply a change to roles and members, with the certificates following in the same act (effort
/// 838, the plan's *Architecture*, "What a change does to certificates").
///
/// **What it checks, before a row is written.** Requirement 7's "only flags you hold" over the
/// change as a whole: every bit that differs, in a role's mask or in the effective permissions of
/// anybody the change moves, is one the actor holds, and none of the owner's flags is set on a role
/// or on anybody's permissions. Then the row-kind table over what it signs: every role row's mask
/// it writes, and the override of every member row it rewrites, within the actor's certificate,
/// since the chain refuses a row that switches more than its signer holds; the certificate each
/// holder is issued holds their whole effective permissions to the actor's. The gates in front of
/// it (the flag, the rank, never yourself) are each command's own.
///
/// **What it writes, in one transaction.** The rows of every member it moves, re-signed under the
/// actor with the role and the override they now name: first, so that a row whose role is
/// re-ranked stays signed by a certificate that outranks it. Then the role rows, and the deletions.
/// Then each member still in is issued a fresh certificate from the actor's, with their new
/// effective permissions and rank, and every older one retired ([`reissue_within`]). A member whose
/// certificate the actor could not issue, or whose old one signed or issued something the actor
/// could not, refuses the whole act by name and nothing moves.
///
/// A member row the change names, or whose role it writes or deletes, is rewritten wherever its
/// role, its override, what it grants or its rank moves. A removed member's row grants nothing
/// before and after, is re-signed where its role or its rank moves, and holds no certificate to
/// follow.
///
/// **A row its certificate no longer covers is never saved** (effort 838, the re-check of ticket
/// 20): nothing the directory holds says which of its fields are genuine, so its content is never
/// carried forward as authority. The commands refuse an act naming it, and an edit of the role it
/// names, or a deletion, leaves it as it stands. *An assignment saved one until the re-check found
/// it lifting a covered removal a forger had re-signed and certifying a signing key the forger had
/// put on the row.*
async fn apply(
    store: &OrganizationStore,
    session: &MemberSession,
    actor: &Actor,
    change: Change,
    now: i64,
) -> Result<(), Error> {
    let before = store.roles(&session.verifying_key).await?;
    let after: Vec<RoleRecord> = before
        .iter()
        .filter(|role| {
            !change.deleted.contains(&role.id)
                && !change.roles.iter().any(|changed| changed.id == role.id)
        })
        .cloned()
        .chain(change.roles.iter().cloned())
        .collect();
    let standing_in = |rows: &[RoleRecord], role_id: &str| -> Option<(i64, i64)> {
        if role_id == permission::OWNER {
            Some((permission::OWNER_ROLE.mask, permission::OWNER_ROLE.rank))
        } else {
            rows.iter()
                .find(|role| role.id == role_id)
                .map(|role| (role.mask, role.rank))
        }
    };

    for role in &change.roles {
        let was = standing_in(&before, &role.id).map_or(0, |(mask, _)| mask);

        refuse_owner_only(role.mask)?;
        refuse_unheld(actor, was ^ role.mask)?;
    }

    let mut moved = Vec::new();

    for row in store.members(&session.verifying_key).await? {
        // a row the change does not name, whose role it neither writes nor deletes, stands as it
        // was.
        if !change
            .members
            .iter()
            .any(|(member_id, _, _)| *member_id == row.id)
            && !change.roles.iter().any(|role| role.id == row.role_id)
            && !change.deleted.contains(&row.role_id)
        {
            continue;
        }

        let unknown = || Error::Integrity {
            message: "a member's role is not among the organization's roles".to_string(),
        };

        // a row its certificate no longer covers is never saved (the re-check of ticket 20): the
        // commands refuse an act naming it, and an edit of the role it names leaves it as it
        // stands.
        if !row.covered {
            continue;
        }

        let (role_id, override_mask) = change
            .members
            .iter()
            .find(|(member_id, _, _)| *member_id == row.id)
            .map(|(_, role_id, override_mask)| (role_id.clone(), *override_mask))
            .unwrap_or_else(|| {
                if change.deleted.contains(&row.role_id) {
                    (permission::MEMBER.to_string(), row.override_mask)
                } else {
                    (row.role_id.clone(), row.override_mask)
                }
            });
        let (_, rank_before) = standing_in(&before, &row.role_id).ok_or_else(unknown)?;
        let (mask_after, rank_after) = standing_in(&after, &role_id).ok_or_else(unknown)?;
        // what the row grants as it reads, which is nothing on a removed member's row, and what it
        // will grant once this signs it.
        let effective_before = row.effective;
        let effective_after = if row.removed_at.is_some() {
            0
        } else {
            permission::effective(mask_after, override_mask)
        };

        if role_id == row.role_id
            && override_mask == row.override_mask
            && effective_before == effective_after
            && rank_before == rank_after
        {
            continue;
        }

        // the owner's role is the constant and the owner's row is refused by every command that
        // could name it, so a change reaching it is a defect rather than a refusal.
        if row.role_id == permission::OWNER || role_id == permission::OWNER {
            return Err(Error::Integrity {
                message: "a change to roles reached the owner's row".to_string(),
            });
        }

        if row.removed_at.is_none() {
            refuse_owner_only(override_mask | effective_after)?;
            refuse_unheld(actor, effective_before ^ effective_after)?;
        }

        moved.push(Moved {
            row,
            role_id,
            override_mask,
            effective: effective_after,
            rank: rank_after,
        });
    }

    let (key, certificate) = signer_of(store, session).await?;
    let signer = Signer {
        key: &key,
        certificate: &certificate,
    };

    // a member row is signed only by a certificate that administers members, and a certificate is
    // issued only by one; refused by name here rather than as a row nobody could verify.
    if !moved.is_empty()
        && !permission::MEMBER_ADMINISTRATION
            .iter()
            .any(|flag| permission::permits(certificate.ceiling, *flag))
    {
        return Err(Error::refused(
            RefusalReason::RoleLacksAct,
            "this moves members, whose rows and certificates are signed again by you, and you \
             hold no flag that administers members. nothing was changed",
        ));
    }

    // and every row this signs sits inside the actor's certificate (effort 838, the row-kind
    // table): a role row carries no flag it does not, the ones it only renames or renumbers
    // included, and a member row's override switches none for anybody, a removed member's
    // included. The gates above hold the flags this changes; these are the flags it leaves where
    // they were and signs again. The role's own mask a member row names is its role row's to
    // vouch for, and the certificate each holder is issued below is what holds it to the actor's.
    for role in &change.roles {
        if let Some(flag) = permission::first_not_held(certificate.ceiling, role.mask) {
            return Err(Error::refused(
                RefusalReason::RoleLacksAct,
                format!(
                    "a role this writes carries {flag}, and you do not, so its row cannot be \
                     signed by you. nothing was changed"
                ),
            ));
        }
    }

    for moving in &moved {
        if let Some(flag) = permission::first_not_held(certificate.ceiling, moving.override_mask) {
            return Err(Error::refused(
                RefusalReason::RoleLacksAct,
                format!(
                    "a member this moves has {flag} switched for them, and you do not hold it, so \
                     their row cannot be signed by you. nothing was changed"
                ),
            ));
        }
    }

    in_one_transaction(store, async {
        for moving in &moved {
            store
                .write_member(
                    &signer,
                    &MemberRecord {
                        role_id: moving.role_id.clone(),
                        override_mask: moving.override_mask,
                        effective: moving.effective,
                        updated_at: now,
                        ..moving.row.clone()
                    },
                )
                .await?;
        }

        for role in &change.roles {
            store.write_role(&signer, role).await?;
        }

        for role_id in &change.deleted {
            store.delete_role(role_id).await?;
        }

        for moving in moved
            .iter()
            .filter(|moving| moving.row.removed_at.is_none())
        {
            reissue_within(
                store,
                session,
                &signer,
                &moving.row.id,
                Some((
                    &moving.row.signing_public_key,
                    Standing {
                        role_id: &moving.role_id,
                        override_mask: moving.override_mask,
                        effective: moving.effective,
                        rank: moving.rank,
                    },
                )),
                now,
            )
            .await?;
        }

        Ok(())
    })
    .await?;

    Ok(())
}

/// Push what an act wrote, and say so where it could not go yet.
async fn sent(store: &OrganizationStore, event: &'static str, key: &str, value: &str) {
    if !store.push().await {
        diagnostics::warn(event).with(key, value).write();
    }
}

/// Make a custom role (requirement 4): a name, a mask, and a place directly below `after_role_id`.
///
/// **`manageRoles`, below your rank, and only flags you hold** (requirement 7). The place is below
/// the actor as well as below the manager, and the mask carries nothing the actor does not and none
/// of the owner's. Nobody holds the role yet, so no certificate moves unless making room renumbers
/// roles that somebody does hold, and then theirs follow ([`apply`]).
pub async fn create_role(
    store: &OrganizationStore,
    session: &MemberSession,
    name: &str,
    mask: i64,
    after_role_id: &str,
    now: i64,
) -> Result<RoleFacts, Error> {
    session.settled()?;

    let actor = actor(store, session).await?;

    permission::require(actor.row.effective, Flag::ManageRoles)?;

    let rows = store.roles(&session.verifying_key).await?;
    let name = validated_name(session, &rows, name, None)?;
    let (rank, renumbered) = placed(&rows, after_role_id, top_for(&actor))?;
    let id = format!("role-{}", random_id()?);
    let role = RoleRecord {
        id: id.clone(),
        kind: CUSTOM.to_string(),
        name_sealed: seal_content(&session.content_key, ROLE_NAME_COLUMN, name.as_bytes())?,
        mask,
        rank,
    };

    apply(
        store,
        session,
        &actor,
        Change {
            roles: renumbered.into_iter().chain([role]).collect(),
            ..Change::default()
        },
        now,
    )
    .await?;

    sent(store, "organization.role.createNotYetSent", "role", &id).await;
    diagnostics::info("organization.role.created")
        .with("role", id.as_str())
        .write();

    role_facts(store, session, &id).await
}

/// Rename a custom role (requirement 4). **`manageRoles`, and below your rank**; a built-in role
/// keeps the name the interface gives it. No flag moves, so nothing but the role row is written.
pub async fn rename_role(
    store: &OrganizationStore,
    session: &MemberSession,
    role_id: &str,
    name: &str,
    now: i64,
) -> Result<RoleFacts, Error> {
    session.settled()?;

    let actor = actor(store, session).await?;

    permission::require(actor.row.effective, Flag::ManageRoles)?;
    refuse_built_in(role_id, "renamed")?;

    let rows = store.roles(&session.verifying_key).await?;
    let role = role_row(&rows, role_id)?.clone();

    actor.outranks(
        role.rank,
        "that role is not below yours, so it is renamed by somebody who ranks above it",
    )?;

    let name = validated_name(session, &rows, name, Some(role_id))?;

    apply(
        store,
        session,
        &actor,
        Change {
            roles: vec![RoleRecord {
                name_sealed: seal_content(&session.content_key, ROLE_NAME_COLUMN, name.as_bytes())?,
                ..role
            }],
            ..Change::default()
        },
        now,
    )
    .await?;

    sent(store, "organization.role.renameNotYetSent", "role", role_id).await;
    diagnostics::info("organization.role.renamed")
        .with("role", role_id)
        .write();

    role_facts(store, session, role_id).await
}

/// Change what a role carries (requirements 3 and 4): the manager's, the member's or a custom
/// role's; never the owner's, which is every flag.
///
/// **`manageRoles`, below your rank, and only flags you hold.** Every flag switched, on or off, is
/// one the actor holds, and none is the owner's. Every holder's effective permissions move with
/// the mask, so every holder's certificate is issued again from the actor's in the same act, and a
/// holder whose certificate the actor could not issue refuses it ([`apply`]).
pub async fn set_role_mask(
    store: &OrganizationStore,
    session: &MemberSession,
    role_id: &str,
    mask: i64,
    now: i64,
) -> Result<RoleFacts, Error> {
    session.settled()?;

    let actor = actor(store, session).await?;

    permission::require(actor.row.effective, Flag::ManageRoles)?;

    if role_id == permission::OWNER {
        return Err(Error::refused(
            RefusalReason::RoleBuiltIn,
            "the owner's role carries every flag, and its mask is not edited",
        ));
    }

    let rows = store.roles(&session.verifying_key).await?;
    let role = role_row(&rows, role_id)?.clone();

    actor.outranks(
        role.rank,
        "that role is not below yours, so what it carries is changed by somebody who ranks above \
         it",
    )?;

    apply(
        store,
        session,
        &actor,
        Change {
            roles: vec![RoleRecord { mask, ..role }],
            ..Change::default()
        },
        now,
    )
    .await?;

    sent(store, "organization.role.maskNotYetSent", "role", role_id).await;
    diagnostics::info("organization.role.maskChanged")
        .with("role", role_id)
        .write();

    role_facts(store, session, role_id).await
}

/// Move a custom role to directly below `after_role_id` (requirement 4).
///
/// **`manageRoles`, and the rank of both**: the role moved ranks below the actor, and so does the
/// place it moves to, so `after_role_id` may be the actor's own role and nothing above it. The rank
/// taken is the midpoint of its new neighbours, and where they leave no room the custom roles below
/// the actor are renumbered ([`placed`]). Every holder of a role whose rank moved is issued a
/// certificate carrying the new one, in the same act.
pub async fn move_role(
    store: &OrganizationStore,
    session: &MemberSession,
    role_id: &str,
    after_role_id: &str,
    now: i64,
) -> Result<RoleFacts, Error> {
    session.settled()?;

    let actor = actor(store, session).await?;

    permission::require(actor.row.effective, Flag::ManageRoles)?;
    refuse_built_in(role_id, "moved")?;

    let rows = store.roles(&session.verifying_key).await?;
    let role = role_row(&rows, role_id)?.clone();

    actor.outranks(
        role.rank,
        "that role is not below yours, so it is moved by somebody who ranks above it",
    )?;

    if after_role_id == role_id {
        return Err(Error::refused(
            RefusalReason::RoleOutOfPlace,
            "a role is moved below another role, not below itself",
        ));
    }

    let others: Vec<RoleRecord> = rows
        .iter()
        .filter(|other| other.id != role_id)
        .cloned()
        .collect();
    let (rank, renumbered) = placed(&others, after_role_id, top_for(&actor))?;

    apply(
        store,
        session,
        &actor,
        Change {
            roles: renumbered
                .into_iter()
                .chain([RoleRecord { rank, ..role }])
                .collect(),
            ..Change::default()
        },
        now,
    )
    .await?;

    sent(store, "organization.role.moveNotYetSent", "role", role_id).await;
    diagnostics::info("organization.role.moved")
        .with("role", role_id)
        .write();

    role_facts(store, session, role_id).await
}

/// Delete a custom role (requirement 4): every member who held it holds the member role from here
/// on, reading the member role's mask exclusive-or'd with the override they carry.
///
/// **`manageRoles`, and below your rank.** Moving the holders changes their effective permissions,
/// so every flag that changes for any of them is one the actor holds, and every holder's certificate
/// is issued again in the same act ([`apply`]).
pub async fn delete_role(
    store: &OrganizationStore,
    session: &MemberSession,
    role_id: &str,
    now: i64,
) -> Result<(), Error> {
    session.settled()?;

    let actor = actor(store, session).await?;

    permission::require(actor.row.effective, Flag::ManageRoles)?;
    refuse_built_in(role_id, "deleted")?;

    let rows = store.roles(&session.verifying_key).await?;
    let role = role_row(&rows, role_id)?;

    actor.outranks(
        role.rank,
        "that role is not below yours, so it is deleted by somebody who ranks above it",
    )?;

    apply(
        store,
        session,
        &actor,
        Change {
            deleted: vec![role_id.to_string()],
            ..Change::default()
        },
        now,
    )
    .await?;

    sent(store, "organization.role.deleteNotYetSent", "role", role_id).await;
    diagnostics::info("organization.role.deleted")
        .with("role", role_id)
        .write();

    Ok(())
}

/// The member an act on somebody's role or override is about: in this organization, still in, not
/// the owner, and not the actor (requirements 5, 6 and 7).
///
/// **The owner's row is refused before the actor's own**, so the owner asking to change their own
/// role or override is told what is true of that row rather than that it is theirs.
fn acted_on<'a>(
    rows: &'a [MemberRecord],
    session: &MemberSession,
    member_id: &str,
    owner_refusal: &str,
) -> Result<&'a MemberRecord, Error> {
    let member = rows
        .iter()
        .find(|member| member.id == member_id)
        .ok_or_else(|| {
            Error::refused(
                RefusalReason::MemberMissing,
                "that member is not in this organization",
            )
        })?;

    // an uncovered row is never saved, an assignment's included (the re-check of ticket 20).
    super::session::refuse_unsettled(member)?;

    if member.removed_at.is_some() {
        return Err(Error::refused(
            RefusalReason::MemberRemoved,
            "that member was removed. make them an account again if they are to come back",
        ));
    }

    if member.role_id == permission::OWNER {
        return Err(Error::refused(RefusalReason::OwnerProtected, owner_refusal));
    }

    if member.id == session.member_id {
        return Err(Error::refused(
            RefusalReason::NotYourself,
            "you cannot change your own role or override. somebody who ranks above you can",
        ));
    }

    Ok(member)
}

/// Give a member a role (requirement 5), and with it, where `override_mask` is given, their
/// override (requirement 6). With none, the override they carry stays, and is read against the new
/// role's mask from here on (the spec's *Risks*).
///
/// **`assignRole`, the rank of the member and of the role, never yourself, and only flags you
/// hold** (requirement 7); and **`overrideMember` too, where the override given is not the one they
/// carry**. The role and the override are one act, so "flags held" is asked of the member's
/// effective permissions before and after both together: a role whose mask carries a flag the actor
/// lacks, given with an override switching it back, moves nothing the actor does not hold, where
/// the two asked one after the other would each be refused on the state between them (converge,
/// round 1, ticket 14). The owner's role is not assigned: it moves by the handover, which is the
/// owner's. Their certificate is issued again from the actor's in the same act, with the role's
/// rank and their new effective permissions, so a flag that signs rows is in force on the next sync
/// without the owner (requirement 9).
pub async fn assign_role(
    store: &OrganizationStore,
    session: &MemberSession,
    member_id: &str,
    role_id: &str,
    override_mask: Option<i64>,
    now: i64,
) -> Result<MemberFacts, Error> {
    session.settled()?;

    let actor = actor(store, session).await?;

    permission::require(actor.row.effective, Flag::AssignRole)?;

    let rows = store.members(&session.verifying_key).await?;
    let member = acted_on(
        &rows,
        session,
        member_id,
        "the owner's role is not changed. the organization is theirs",
    )?;

    let override_mask = override_mask.unwrap_or(member.override_mask);

    if override_mask != member.override_mask {
        permission::require(actor.row.effective, Flag::OverrideMember)?;
    }

    actor.outranks(
        rank_of(store, session, member).await?,
        "that member's role is not below yours, so their role is changed by somebody who ranks \
         above them",
    )?;

    if role_id == permission::OWNER {
        return Err(Error::refused(
            RefusalReason::OwnerRoleNotAssigned,
            "the owner's role is not assigned. the owner hands the organization over",
        ));
    }

    let (_, rank) = store.role_standing(&session.verifying_key, role_id).await?;

    actor.outranks(
        rank,
        "that role is not below yours, so it is given by somebody who ranks above it",
    )?;

    apply(
        store,
        session,
        &actor,
        Change {
            members: vec![(member.id.clone(), role_id.to_string(), override_mask)],
            ..Change::default()
        },
        now,
    )
    .await?;

    sent(
        store,
        "organization.member.roleNotYetSent",
        "member",
        member_id,
    )
    .await;
    diagnostics::info("organization.member.roleAssigned")
        .with("member", member_id)
        .with("role", role_id)
        .write();

    member_facts(store, session, member_id).await
}

/// Set a member's override: the flags switched for them alone (requirement 6). Zero clears it.
///
/// **`overrideMember`, the rank of the member, never yourself, and only flags you hold**
/// (requirement 7): every flag whose value the member ends up with differently is one the actor
/// holds, and none of the owner's is set. The owner's row carries no override. Their certificate
/// is issued again from the actor's in the same act.
pub async fn set_override(
    store: &OrganizationStore,
    session: &MemberSession,
    member_id: &str,
    override_mask: i64,
    now: i64,
) -> Result<MemberFacts, Error> {
    session.settled()?;

    let actor = actor(store, session).await?;

    permission::require(actor.row.effective, Flag::OverrideMember)?;

    let rows = store.members(&session.verifying_key).await?;
    let member = acted_on(
        &rows,
        session,
        member_id,
        "the owner carries every flag, and their row carries no override",
    )?;

    actor.outranks(
        rank_of(store, session, member).await?,
        "that member's role is not below yours, so their override is set by somebody who ranks \
         above them",
    )?;

    apply(
        store,
        session,
        &actor,
        Change {
            members: vec![(member.id.clone(), member.role_id.clone(), override_mask)],
            ..Change::default()
        },
        now,
    )
    .await?;

    sent(
        store,
        "organization.member.overrideNotYetSent",
        "member",
        member_id,
    )
    .await;
    diagnostics::info("organization.member.overrideSet")
        .with("member", member_id)
        .write();

    member_facts(store, session, member_id).await
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use serde_json::json;

    use super::{
        AN_UNSET_ACCOUNT_CANNOT_ACCEPT, NOT_THE_KEY_IN_FORCE, NOTHING_WAS_OFFERED,
        ONLY_THE_OWNER_TRANSFERS, THE_OFFER_WAS_ACCEPTED, accept_ownership, assign_role,
        create_role, delete_role, follow_succession, move_role, offer_ownership,
        organization_key_of, rename_role, set_override, set_role_mask, standing_offer,
        withdraw_offer,
    };
    use crate::{
        error::{Error, RefusalReason},
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
            permission::{self, Flag},
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
    /// What the settled manager in these tests chose when they opened their link, which is
    /// the password that becomes the organization's key when they accept it.
    const MANAGERS_PASSWORD: &str = "the managers password";
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

        (member.role_id, member.effective)
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

    // -------------------------------------------------------------------------------------
    // Effort 838, requirements 3 to 7 and 9: roles, assignment and the override.
    // -------------------------------------------------------------------------------------

    /// The word a refusal carries, or a panic naming what came back instead.
    fn reason_of(error: &Error) -> RefusalReason {
        match error {
            Error::Refused { reason, .. } => *reason,
            other => panic!("not a refusal: {other:?}"),
        }
    }

    /// A member's row, read through the verified reader.
    async fn member_row(
        store: &OrganizationStore,
        owner: &MemberSession,
        id: &str,
    ) -> MemberRecord {
        store
            .members(&owner.verifying_key)
            .await
            .expect("the rows verify")
            .into_iter()
            .find(|member| member.id == id)
            .expect("the member row")
    }

    /// The one live certificate a member holds: **every live member holds exactly one**, and this
    /// fails where they hold none or two.
    async fn the_certificate(
        store: &OrganizationStore,
        owner: &MemberSession,
        member_id: &str,
    ) -> Certificate {
        let mut live = store
            .live_certificates(&owner.verifying_key, member_id)
            .await
            .expect("the certificates");

        assert_eq!(
            live.len(),
            1,
            "{member_id} holds {} live certificates",
            live.len()
        );

        live.pop().expect("the certificate")
    }

    /// Every custom role, highest first, as `(id, rank)`, and each rank checked strictly between
    /// the member's and the manager's (criterion 4).
    async fn custom_ranks(store: &OrganizationStore, owner: &MemberSession) -> Vec<(String, i64)> {
        let ranks: Vec<(String, i64)> = store
            .roles(&owner.verifying_key)
            .await
            .expect("the roles verify")
            .into_iter()
            .filter(|role| role.kind == "custom")
            .map(|role| (role.id, role.rank))
            .collect();

        for (id, rank) in &ranks {
            assert!(
                *rank > permission::MEMBER_ROLE.rank && *rank < permission::MANAGER_ROLE.rank,
                "{id} ranks {rank}, outside the member and the manager"
            );
        }

        ranks
    }

    /// A custom role made by the owner, directly below `after`.
    async fn a_role(
        store: &OrganizationStore,
        owner: &MemberSession,
        name: &str,
        mask: i64,
        after: &str,
    ) -> String {
        create_role(store, owner, name, mask, after, NOW)
            .await
            .unwrap_or_else(|error| panic!("the owner could not make {name}: {error:?}"))
            .id
    }

    /// A member signed in, given `role_id` by the owner.
    async fn holding_role(
        store: &OrganizationStore,
        owner: &MemberSession,
        link: &Locator,
        username: &'static str,
        role_id: &str,
        workspace_id: &str,
    ) -> MemberSession {
        let (_, session) = a_member(
            store,
            owner,
            link,
            username,
            permission::MEMBER,
            workspace_id,
        )
        .await;

        if role_id != permission::MEMBER {
            assign_role(store, owner, &session.member_id, role_id, None, NOW)
                .await
                .unwrap_or_else(|error| panic!("{username} was not given {role_id}: {error:?}"));
        }

        session
    }

    /// Requirements 5 and 6: a role and an override are written on the row, re-signed, the
    /// certificate follows each, and the answer is the member as the list will show them.
    #[tokio::test]
    async fn a_role_and_an_override_are_written_re_signed_and_read_back() {
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

        let managed = assign_role(
            &store,
            &owner,
            &invited.member_id,
            permission::MANAGER,
            None,
            NOW + 1,
        )
        .await
        .expect("the assignment failed");

        assert_eq!(managed.id, invited.member_id);
        assert_eq!(managed.username, "sami.staff");
        assert_eq!(managed.permissions, permission::MANAGER_ROLE.mask);
        assert_eq!(
            managed
                .workspaces
                .iter()
                .map(|workspace| workspace.id.clone())
                .collect::<Vec<_>>(),
            vec![workspace_id.clone()],
            "the assignment moved what the member holds"
        );

        let row = member_row(&store, &owner, &invited.member_id).await;

        assert_eq!(row.role_id, permission::MANAGER);
        assert_eq!(row.override_mask, 0);

        let certificate = the_certificate(&store, &owner, &invited.member_id).await;

        assert_eq!(certificate.ceiling, permission::MANAGER_ROLE.mask);
        assert_eq!(certificate.rank, permission::MANAGER_ROLE.rank);

        // and an override, which switches one flag off the role for them alone.
        let overridden = set_override(
            &store,
            &owner,
            &invited.member_id,
            permission::mask_of(&[Flag::InviteMember]),
            NOW + 2,
        )
        .await
        .expect("the override failed");
        let narrower = permission::MANAGER_ROLE.mask & !permission::mask_of(&[Flag::InviteMember]);

        assert_eq!(overridden.permissions, narrower);
        assert_eq!(
            member_row(&store, &owner, &invited.member_id)
                .await
                .override_mask,
            permission::mask_of(&[Flag::InviteMember])
        );
        assert_eq!(
            the_certificate(&store, &owner, &invited.member_id)
                .await
                .ceiling,
            narrower
        );
    }

    /// Requirement 8, across the boundary: the members list and the session's own facts carry the
    /// role's kind, id, name and rank, the override, and the effective permissions, in the names
    /// the web layer reads; and nothing about a certificate crosses.
    #[tokio::test]
    async fn the_facts_carry_the_role_its_rank_the_override_and_the_effective_permissions() {
        let directory = scratch("facts");
        let (store, owner, link, workspace_id) = owned(&directory).await;
        let mask = permission::MEMBER_ROLE.mask | permission::mask_of(&[Flag::RenameMember]);
        let bookkeeper = a_role(&store, &owner, "bookkeeper", mask, permission::MANAGER).await;
        let held = holding_role(
            &store,
            &owner,
            &link,
            "sami.staff",
            &bookkeeper,
            &workspace_id,
        )
        .await;
        let switched = permission::mask_of(&[Flag::RenameMember, Flag::DeletePayment]);

        set_override(&store, &owner, &held.member_id, switched, NOW + 1)
            .await
            .expect("the override failed");

        let effective = permission::effective(mask, switched);
        let rank = crate::organization::role::roles(&store, &owner)
            .await
            .expect("the roles")
            .into_iter()
            .find(|role| role.id == bookkeeper)
            .expect("the role is listed")
            .rank;
        let listed = crate::organization::invite::members(&store, &owner)
            .await
            .expect("the members");
        let member = listed
            .iter()
            .find(|member| member.id == held.member_id)
            .expect("the member is listed");

        assert_eq!(member.role, "custom");
        assert_eq!(member.role_id, bookkeeper);
        assert_eq!(member.role_name, "bookkeeper");
        assert_eq!(member.rank, rank);
        assert_eq!(member.override_mask, switched);
        assert_eq!(member.permissions, effective);

        let founder = listed
            .iter()
            .find(|member| member.id == owner.member_id)
            .expect("the owner is listed");

        assert_eq!(
            (
                founder.role.as_str(),
                founder.role_id.as_str(),
                founder.role_name.as_str(),
                founder.rank,
                founder.override_mask,
            ),
            (
                permission::OWNER,
                permission::OWNER,
                "",
                permission::OWNER_ROLE.rank,
                0
            )
        );

        let facts = crate::organization::session::facts_of(&store, &held)
            .await
            .expect("the session's facts");

        assert_eq!(facts.role, "custom");
        assert_eq!(facts.role_id, bookkeeper);
        assert_eq!(facts.role_name, "bookkeeper");
        assert_eq!(facts.rank, rank);
        assert_eq!(facts.override_mask, switched);
        assert_eq!(facts.permissions, effective);

        // the manager crosses as its kind, where the word used to be `administrator`.
        assign_role(
            &store,
            &owner,
            &held.member_id,
            permission::MANAGER,
            None,
            NOW + 2,
        )
        .await
        .expect("the assignment failed");
        let facts = crate::organization::session::facts_of(&store, &held)
            .await
            .expect("the session's facts");

        assert_eq!(facts.role, permission::MANAGER);
        assert_eq!(facts.role_name, "");
        assert_eq!(facts.rank, permission::MANAGER_ROLE.rank);

        // the names the web layer reads, and no certificate among them.
        let crossed = serde_json::to_value(&facts).expect("the facts serialise");
        let crossed_member = serde_json::to_value(member).expect("the member serialises");

        for value in [&crossed, &crossed_member] {
            let keys = value
                .as_object()
                .expect("an object")
                .keys()
                .cloned()
                .collect::<Vec<_>>();

            for key in [
                "role",
                "roleId",
                "roleName",
                "rank",
                "override",
                "permissions",
            ] {
                assert!(keys.iter().any(|name| name == key), "{key} did not cross");
            }
            assert!(
                keys.iter()
                    .all(|name| !name.to_lowercase().contains("certificate")
                        && !name.to_lowercase().contains("key")),
                "a certificate or a key crossed: {keys:?}"
            );
        }
        assert_eq!(crossed["override"], json!(switched));
    }

    /// The refusals, each before anything is written: nobody changes their own row, nobody changes
    /// the owner's, a member with no flag changes nobody, a role this organization does not hold is
    /// not assigned, and a member who is not here is not found.
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
            permission::MANAGER,
            &workspace_id,
        )
        .await;
        let owner_id = owner.member_id.clone();
        let before = every_row(&store).await;

        let own = set_override(&store, &ada, &ada.member_id, 0, NOW + 1)
            .await
            .expect_err("a manager changed their own override");

        assert_eq!(reason_of(&own), RefusalReason::NotYourself, "{own:?}");
        assert!(own.to_string().contains("your own"), "{own}");

        for refused in [
            assign_role(&store, &ada, &owner_id, permission::MEMBER, None, NOW + 1)
                .await
                .expect_err("a manager changed the owner's role"),
            assign_role(&store, &owner, &owner_id, permission::MEMBER, None, NOW + 1)
                .await
                .expect_err("the owner changed their own role"),
        ] {
            assert_eq!(
                reason_of(&refused),
                RefusalReason::OwnerProtected,
                "{refused:?}"
            );
        }

        let without = assign_role(
            &store,
            &sami,
            &invited.member_id,
            permission::MEMBER,
            None,
            NOW + 1,
        )
        .await
        .expect_err("a member with no flag assigned a role");

        assert!(without.to_string().contains("assignRole"), "{without}");

        let unknown = assign_role(
            &store,
            &owner,
            &invited.member_id,
            "superuser",
            None,
            NOW + 1,
        )
        .await
        .expect_err("a role this organization does not hold was assigned");

        assert_eq!(
            reason_of(&unknown),
            RefusalReason::RoleUnknown,
            "{unknown:?}"
        );

        let missing = assign_role(&store, &owner, "nobody", permission::MEMBER, None, NOW + 1)
            .await
            .expect_err("a member who is not here was changed");

        assert_eq!(
            reason_of(&missing),
            RefusalReason::MemberMissing,
            "{missing:?}"
        );

        assert_eq!(every_row(&store).await, before, "a refusal wrote something");
    }

    /// Requirement 9 and criterion 9: a member given a flag that signs rows signs one, it verifies
    /// on another machine, and taken back, a row they sign under the old certificate is refused.
    ///
    /// **Narrowed, they still hold one live certificate**: a narrower one, issued from the actor's.
    /// *`change_role` revoked the certificate and issued none where a narrowing left no signing
    /// act, until effort 838 made every member hold one.*
    #[tokio::test]
    async fn a_signing_flag_given_and_taken_back_follows_the_certificate() {
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
        let granting = permission::mask_of(&[Flag::GrantWorkspace]);

        set_override(&store, &owner, &sami.member_id, granting, NOW + 1)
            .await
            .expect("the widening failed");

        // what was certified is the key they derive from their own vault secret, read off their
        // row: the whole reason the column exists.
        let theirs_to_sign_with = AdministratorKey::from_bytes(
            &opened
                .secret
                .derive_seed(ADMINISTRATOR_KEY_PURPOSE)
                .expect("the signing seed"),
        )
        .verifying_key();
        let certificate = the_certificate(&store, &owner, &sami.member_id).await;

        assert_eq!(certificate.signing_public_key, theirs_to_sign_with);
        assert!(permission::permits(
            certificate.ceiling,
            Flag::GrantWorkspace
        ));

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
            &opened,
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
        let elsewhere = another_machine(&directory, &owner.organization_id).await;

        assert!(
            elsewhere
                .grants(&owner.verifying_key)
                .await
                .expect("the grant does not verify on another machine")
                .iter()
                .any(is_theirs),
            "the grant a widened member signed is not on the other machine"
        );

        drop(elsewhere);

        // taken back: the rows their certificate signed move under the owner, the certificate is
        // revoked, and a narrower one takes its place.
        set_override(&store, &owner, &sami.member_id, 0, NOW + 3)
            .await
            .expect("the narrowing failed");

        let narrower = the_certificate(&store, &owner, &sami.member_id).await;

        assert_ne!(narrower.id, certificate.id);
        assert_eq!(narrower.ceiling, permission::MEMBER_ROLE.mask);
        assert!(
            store.grants(&owner.verifying_key).await.is_ok(),
            "retiring the certificate bricked the rows it had signed"
        );

        // and a row they sign under the old one anyway is refused on read, by name.
        let key = AdministratorKey::from_bytes(
            &opened
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
                    certificate: &certificate,
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
    /// nothing moves.** A member signs a grant; a manager whose override takes `grantWorkspace` away
    /// narrows them. Retiring the member's certificate would mean re-signing the grant, which takes
    /// `grantWorkspace`: the change is refused naming it, and the chain, the grant and the member's
    /// row are as they were.
    #[tokio::test]
    async fn a_reissue_the_actor_could_not_complete_is_refused_by_name_and_moves_nothing() {
        let directory = scratch("reissue-refused");
        let (store, owner, link, workspace_id) = owned(&directory).await;
        let (sami, widened) = a_member(
            &store,
            &owner,
            &link,
            "sami.staff",
            permission::MEMBER,
            &workspace_id,
        )
        .await;
        let granting = permission::mask_of(&[Flag::GrantWorkspace]);

        set_override(&store, &owner, &sami.member_id, granting, NOW + 1)
            .await
            .expect("the widening failed");

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

        // a manager who may do everything a manager does but grant.
        let (ada, ada_session) = a_member(
            &store,
            &owner,
            &link,
            "ada.admin",
            permission::MANAGER,
            &workspace_id,
        )
        .await;

        set_override(&store, &owner, &ada.member_id, granting, NOW + 2)
            .await
            .expect("the narrowing of the manager failed");

        let chain_before = store.chain_rows().await.expect("the chain");
        let rows_before = every_row(&store).await;

        let refusal = set_override(&store, &ada_session, &sami.member_id, 0, NOW + 3)
            .await
            .expect_err("a narrowing that could not re-sign the grant went through");

        assert!(refusal.to_string().contains("grantWorkspace"), "{refusal}");
        assert_eq!(
            store.chain_rows().await.expect("the chain after"),
            chain_before,
            "a refused re-issue wrote a certificate or a revocation"
        );
        assert_eq!(
            every_row(&store).await,
            rows_before,
            "a refused re-issue wrote a row"
        );
    }

    /// **A narrowing reaches the open session.** A member loses one act and keeps another; their
    /// session still carries the bit, and what refuses them is the verified row, by the act's name.
    #[tokio::test]
    async fn a_member_narrowed_out_of_one_act_is_refused_on_their_open_session_by_name() {
        let directory = scratch("narrowed");
        let (store, owner, link, workspace_id) = owned(&directory).await;
        let (sami, theirs) = a_member(
            &store,
            &owner,
            &link,
            "sami.staff",
            permission::MANAGER,
            &workspace_id,
        )
        .await;

        set_override(
            &store,
            &owner,
            &sami.member_id,
            permission::mask_of(&[Flag::InviteMember]),
            NOW + 1,
        )
        .await
        .expect("the narrowing failed");

        assert!(
            permission::permits(theirs.permissions, Flag::InviteMember),
            "the session stopped carrying the act on its own, and there is nothing left to refuse"
        );

        let workspaces = full(std::slice::from_ref(&workspace_id));
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

        assert_eq!(
            reason_of(&refusal),
            RefusalReason::RoleLacksAct,
            "{refusal}"
        );
        assert!(refusal.to_string().contains("inviteMember"), "{refusal}");
        assert!(
            permission::permits(
                crate::organization::session::permissions_on_row(&store, &theirs)
                    .await
                    .expect("their row"),
                Flag::RemoveMember
            ),
            "the act they kept is gone"
        );
    }

    /// **What a member issued is issued again when their standing moves** (the plan's
    /// *Architecture*). A manager gives a member a role, which issues the member's certificate from
    /// the manager's; the owner then narrows the manager, which revokes the manager's old
    /// certificate. The member's is issued again from the owner's, under its own id, so it stays
    /// live and the rows it signed go on verifying.
    #[tokio::test]
    async fn what_a_narrowed_member_issued_is_issued_again_and_stays_live() {
        let directory = scratch("reparent");
        let (store, owner, link, workspace_id) = owned(&directory).await;
        let (ada, ada_session) = a_member(
            &store,
            &owner,
            &link,
            "ada.admin",
            permission::MANAGER,
            &workspace_id,
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

        // ada gives sami the flag that grants, from her own certificate.
        set_override(
            &store,
            &ada_session,
            &sami.member_id,
            permission::mask_of(&[Flag::GrantWorkspace]),
            NOW + 1,
        )
        .await
        .expect("the manager could not widen sami");

        let issued = the_certificate(&store, &owner, &sami.member_id).await;
        let adas = the_certificate(&store, &owner, &ada.member_id).await;

        assert_eq!(
            issued.issuer_certificate_id.as_deref(),
            Some(adas.id.as_str())
        );

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
            &sami_session,
            no_platform(),
            &workspace_id,
            &noor.member_id,
            AccessLevel::FullAccess,
        )
        .await
        .expect("sami could not grant");

        // the owner narrows ada: her certificate is issued afresh and the old one revoked.
        set_override(
            &store,
            &owner,
            &ada.member_id,
            permission::mask_of(&[Flag::RenameMember]),
            NOW + 2,
        )
        .await
        .expect("the owner could not narrow the manager");

        assert_ne!(
            the_certificate(&store, &owner, &ada.member_id).await.id,
            adas.id
        );

        let again = the_certificate(&store, &owner, &sami.member_id).await;
        let root = signer_of(&store, &owner).await.expect("the root").1;

        assert_eq!(
            again.id, issued.id,
            "sami's certificate was not issued again"
        );
        assert_eq!(
            again.issuer_certificate_id.as_deref(),
            Some(root.id.as_str())
        );
        assert_eq!(again.ceiling, issued.ceiling);
        assert!(
            another_machine(&directory, &owner.organization_id)
                .await
                .grants(&owner.verifying_key)
                .await
                .expect("the grant sami signed no longer verifies")
                .iter()
                .any(|grant| grant.member_id == noor.member_id),
            "the grant sami signed is gone"
        );
    }

    /// **Criterion 3.** Deleting, renaming or moving each built-in role is refused, and so is
    /// editing the owner's mask, as the owner, with nothing written; the owner edits the manager's
    /// and the member's masks, and every holder's certificate carries the new one.
    #[tokio::test]
    async fn the_built_in_roles_are_kept_and_the_owner_edits_the_managers_and_the_members_masks() {
        let directory = scratch("built-in");
        let (store, owner, link, workspace_id) = owned(&directory).await;
        let custom = a_role(
            &store,
            &owner,
            "collector",
            permission::MEMBER_ROLE.mask,
            permission::MANAGER,
        )
        .await;
        let ada = holding_role(
            &store,
            &owner,
            &link,
            "ada.admin",
            permission::MANAGER,
            &workspace_id,
        )
        .await;
        let sami = holding_role(
            &store,
            &owner,
            &link,
            "sami.staff",
            permission::MEMBER,
            &workspace_id,
        )
        .await;
        let before = every_row(&store).await;

        for built_in in [permission::OWNER, permission::MANAGER, permission::MEMBER] {
            for (act, refusal) in [
                (
                    "deleted",
                    delete_role(&store, &owner, built_in, NOW + 1).await.err(),
                ),
                (
                    "renamed",
                    rename_role(&store, &owner, built_in, "boss", NOW + 1)
                        .await
                        .err(),
                ),
                (
                    "moved",
                    move_role(&store, &owner, built_in, &custom, NOW + 1)
                        .await
                        .err(),
                ),
            ] {
                let refusal =
                    refusal.unwrap_or_else(|| panic!("the owner {act} the {built_in} role"));

                assert_eq!(
                    reason_of(&refusal),
                    RefusalReason::RoleBuiltIn,
                    "{built_in} {act}: {refusal:?}"
                );
            }
        }

        let owners = set_role_mask(&store, &owner, permission::OWNER, 0, NOW + 1)
            .await
            .expect_err("the owner's mask was edited");

        assert_eq!(reason_of(&owners), RefusalReason::RoleBuiltIn, "{owners:?}");
        assert_eq!(every_row(&store).await, before, "a refusal wrote something");

        // the manager's and the member's, which the owner edits.
        let managers = permission::MANAGER_ROLE.mask & !permission::mask_of(&[Flag::ManageMark]);
        let members = permission::MEMBER_ROLE.mask | permission::mask_of(&[Flag::DeletePayment]);

        assert_eq!(
            set_role_mask(&store, &owner, permission::MANAGER, managers, NOW + 2)
                .await
                .expect("the owner could not edit the manager's mask")
                .mask,
            managers
        );
        assert_eq!(
            set_role_mask(&store, &owner, permission::MEMBER, members, NOW + 3)
                .await
                .expect("the owner could not edit the member's mask")
                .mask,
            members
        );

        // every holder's certificate follows, and every row still verifies elsewhere.
        assert_eq!(
            the_certificate(&store, &owner, &ada.member_id)
                .await
                .ceiling,
            managers
        );
        assert_eq!(
            the_certificate(&store, &owner, &sami.member_id)
                .await
                .ceiling,
            members
        );
        another_machine(&directory, &owner.organization_id)
            .await
            .members(&owner.verifying_key)
            .await
            .expect("every member row verifies on another machine");
    }

    /// **Criterion 4, the lifecycle.** A custom role is made, renamed, re-masked, re-ranked and
    /// deleted; it ranks strictly between member and manager every time, a renumbering included,
    /// and after the deletion every member who held it holds member and reads the member role's
    /// mask exclusive-or'd with their override.
    #[tokio::test]
    async fn a_custom_role_lives_between_member_and_manager_and_its_holders_fall_to_member() {
        let directory = scratch("lifecycle");
        let (store, owner, link, workspace_id) = owned(&directory).await;
        let collector = a_role(
            &store,
            &owner,
            "collector",
            permission::MEMBER_ROLE.mask,
            permission::MANAGER,
        )
        .await;
        let supervisor = a_role(
            &store,
            &owner,
            "supervisor",
            permission::MEMBER_ROLE.mask,
            permission::MANAGER,
        )
        .await;

        assert_eq!(
            custom_ranks(&store, &owner)
                .await
                .into_iter()
                .map(|(id, _)| id)
                .collect::<Vec<_>>(),
            vec![supervisor.clone(), collector.clone()],
            "a role made after the manager is not the highest custom role"
        );

        let sami = holding_role(
            &store,
            &owner,
            &link,
            "sami.staff",
            &collector,
            &workspace_id,
        )
        .await;
        let turned = permission::mask_of(&[Flag::DeletePayment, Flag::EditUnit]);

        set_override(&store, &owner, &sami.member_id, turned, NOW + 1)
            .await
            .expect("the override failed");

        // renamed, and a name another role holds is refused.
        assert_eq!(
            rename_role(&store, &owner, &collector, "rent collector", NOW + 2)
                .await
                .expect("the rename failed")
                .name,
            "rent collector"
        );

        let taken = rename_role(&store, &owner, &supervisor, "Rent Collector", NOW + 2)
            .await
            .expect_err("two roles share a name");

        assert_eq!(reason_of(&taken), RefusalReason::RoleNameTaken, "{taken:?}");

        // re-masked: the holder's permissions and certificate follow.
        let wider = permission::MEMBER_ROLE.mask | permission::mask_of(&[Flag::DeleteTenant]);

        set_role_mask(&store, &owner, &collector, wider, NOW + 3)
            .await
            .expect("the re-mask failed");

        assert_eq!(
            the_certificate(&store, &owner, &sami.member_id)
                .await
                .ceiling,
            permission::effective(wider, turned)
        );

        // re-ranked above the supervisor, and back below it.
        let moved = move_role(&store, &owner, &collector, permission::MANAGER, NOW + 4)
            .await
            .expect("the move failed");

        assert_eq!(
            custom_ranks(&store, &owner)
                .await
                .into_iter()
                .map(|(id, _)| id)
                .collect::<Vec<_>>(),
            vec![collector.clone(), supervisor.clone()]
        );
        assert_eq!(
            the_certificate(&store, &owner, &sami.member_id).await.rank,
            moved.rank
        );

        // a renumbering: roles made one after another directly below the manager close the gap
        // above the highest, and the one made when it closes spreads the custom roles out again.
        let mut expected = vec![collector.clone(), supervisor.clone()];
        let mut renumbered = false;

        for index in 0..40 {
            let before = custom_ranks(&store, &owner).await;
            let made = a_role(
                &store,
                &owner,
                &format!("tier {index}"),
                permission::MEMBER_ROLE.mask,
                permission::MANAGER,
            )
            .await;

            expected.insert(0, made);

            let after = custom_ranks(&store, &owner).await;

            assert_eq!(
                after.iter().map(|(id, _)| id.clone()).collect::<Vec<_>>(),
                expected,
                "the order did not hold at the role made {index}th"
            );

            if before.iter().any(|(id, rank)| {
                after
                    .iter()
                    .any(|(other, moved)| other == id && moved != rank)
            }) {
                renumbered = true;

                // the holder of a renumbered role holds a certificate carrying its new rank.
                let collectors = after
                    .iter()
                    .find(|(id, _)| *id == collector)
                    .map(|(_, rank)| *rank)
                    .expect("the collector role");

                assert_eq!(
                    the_certificate(&store, &owner, &sami.member_id).await.rank,
                    collectors
                );

                break;
            }
        }

        assert!(renumbered, "forty roles in a row never closed the gap");
        store
            .members(&owner.verifying_key)
            .await
            .expect("every member row verifies after the renumbering");

        // deleted: sami holds member, and reads the member mask with their override.
        delete_role(&store, &owner, &collector, NOW + 5)
            .await
            .expect("the deletion failed");

        let row = member_row(&store, &owner, &sami.member_id).await;

        assert_eq!(row.role_id, permission::MEMBER);
        assert_eq!(row.override_mask, turned);
        assert_eq!(
            row.effective,
            permission::effective(permission::MEMBER_ROLE.mask, turned)
        );
        assert_eq!(
            the_certificate(&store, &owner, &sami.member_id).await.rank,
            permission::MEMBER_ROLE.rank
        );
        assert!(
            !custom_ranks(&store, &owner)
                .await
                .iter()
                .any(|(id, _)| *id == collector)
        );
    }

    /// **Criteria 5 and 6.** Every member row names one role; assigning the owner's role is
    /// refused, whoever asks; each other role is assigned and the member reads its mask XOR their
    /// override back; and the owner's row refuses an override, from the owner and from a manager.
    #[tokio::test]
    async fn the_owners_role_is_not_assigned_and_the_owners_row_carries_no_override() {
        let directory = scratch("assign");
        let (store, owner, link, workspace_id) = owned(&directory).await;
        let custom = a_role(
            &store,
            &owner,
            "collector",
            permission::MEMBER_ROLE.mask | permission::mask_of(&[Flag::DeleteContract]),
            permission::MANAGER,
        )
        .await;
        let ada = holding_role(
            &store,
            &owner,
            &link,
            "ada.admin",
            permission::MANAGER,
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
        let turned = permission::mask_of(&[Flag::ViewPayment]);

        set_override(&store, &owner, &sami.member_id, turned, NOW + 1)
            .await
            .expect("the override failed");

        for asking in [&owner, &ada] {
            let refused = assign_role(
                &store,
                asking,
                &sami.member_id,
                permission::OWNER,
                None,
                NOW + 2,
            )
            .await
            .expect_err("the owner's role was assigned");

            assert_eq!(
                reason_of(&refused),
                RefusalReason::OwnerRoleNotAssigned,
                "{refused:?}"
            );
        }

        let roles = store.roles(&owner.verifying_key).await.expect("the roles");

        for role in [permission::MANAGER, custom.as_str(), permission::MEMBER] {
            let mask = roles
                .iter()
                .find(|row| row.id == role)
                .expect("the role")
                .mask;
            let facts = assign_role(&store, &owner, &sami.member_id, role, None, NOW + 3)
                .await
                .unwrap_or_else(|error| panic!("{role} was not assigned: {error:?}"));

            assert_eq!(
                facts.permissions,
                permission::effective(mask, turned),
                "{role}"
            );
            assert_eq!(
                member_row(&store, &owner, &sami.member_id).await.role_id,
                role
            );
        }

        // every member row names exactly one role this organization holds.
        let held: Vec<String> = roles.iter().map(|role| role.id.clone()).collect();

        for member in store.members(&owner.verifying_key).await.expect("the rows") {
            assert!(
                member.role_id == permission::OWNER || held.contains(&member.role_id),
                "{} names {}",
                member.id,
                member.role_id
            );
        }

        // the owner's row refuses an override, from the owner and from a manager.
        for asking in [&owner, &ada] {
            let refused = set_override(&store, asking, &owner.member_id, turned, NOW + 4)
                .await
                .expect_err("the owner's row took an override");

            assert_eq!(
                reason_of(&refused),
                RefusalReason::OwnerProtected,
                "{refused:?}"
            );
        }

        assert_eq!(
            member_row(&store, &owner, &owner.member_id)
                .await
                .override_mask,
            0
        );
    }

    /// The organization, its owner, and the ranks one test of criterion 7 is about, for an actor
    /// whose role carries the member's flags and `flag`:
    ///
    /// | role | rank | held by |
    /// | --- | --- | --- |
    /// | `high` | 500 000 | hana |
    /// | `spare_high` | 375 000 | nobody |
    /// | `mine` | 250 000 | the actor and eve |
    /// | `low` | 125 000 | lina |
    /// | `spare_low` | 62 500 | nobody |
    ///
    /// **The roles an act on roles touches are held by nobody**, so what is measured is the rank
    /// and nothing else: editing a held role issues its holders certificates, which a holder of
    /// `manageRoles` alone, administering nobody, cannot.
    struct Ranked {
        store: OrganizationStore,
        owner: MemberSession,
        actor: MemberSession,
        hana: String,
        eve: String,
        lina: String,
        spare_high: String,
        mine: String,
        low: String,
        spare_low: String,
    }

    async fn ranked(directory: &std::path::Path, flag: Flag) -> Ranked {
        let (store, owner, link, workspace_id) = owned(directory).await;
        let members = permission::MEMBER_ROLE.mask;
        let high = a_role(&store, &owner, "high", members, permission::MANAGER).await;
        let mine = a_role(
            &store,
            &owner,
            "mine",
            members | permission::mask_of(&[flag]),
            &high,
        )
        .await;
        let spare_high = a_role(&store, &owner, "spare high", members, &high).await;
        let low = a_role(&store, &owner, "low", members, &mine).await;
        let spare_low = a_role(&store, &owner, "spare low", members, &low).await;
        let actor = holding_role(&store, &owner, &link, "the.actor", &mine, &workspace_id).await;
        let hana = holding_role(&store, &owner, &link, "hana", &high, &workspace_id).await;
        let eve = holding_role(&store, &owner, &link, "eve", &mine, &workspace_id).await;
        let lina = holding_role(&store, &owner, &link, "lina", &low, &workspace_id).await;

        Ranked {
            store,
            owner,
            actor,
            hana: hana.member_id,
            eve: eve.member_id,
            lina: lina.member_id,
            spare_high,
            mine,
            low,
            spare_low,
        }
    }

    /// **Criterion 7, the rank matrix.** For each management flag, a holder of it acts on what
    /// ranks above them, at their rank, below them, and on themselves: only strictly below
    /// succeeds. The refusals come first and write nothing; the successes follow.
    ///
    /// For an act on a role, *at their rank* and *themselves* are one case, their own role: no two
    /// roles share a rank. A holder of one management flag is refused the acts of the others.
    #[tokio::test]
    async fn only_strictly_below_succeeds_for_every_management_flag() {
        let directory = scratch("matrix");
        let edit_payment = permission::mask_of(&[Flag::EditPayment]);
        let members = permission::MEMBER_ROLE.mask;

        // manageRoles: rename, re-mask, move, delete, and making a role in a place.
        {
            let r = ranked(&directory.join("roles"), Flag::ManageRoles).await;
            let before = every_row(&r.store).await;

            for (place, role) in [("above", &r.spare_high), ("at", &r.mine)] {
                let refusals = [
                    rename_role(&r.store, &r.actor, role, "renamed", NOW)
                        .await
                        .err(),
                    set_role_mask(&r.store, &r.actor, role, members ^ edit_payment, NOW)
                        .await
                        .err(),
                    move_role(&r.store, &r.actor, role, &r.low, NOW).await.err(),
                    delete_role(&r.store, &r.actor, role, NOW).await.err(),
                ];

                for (index, refusal) in refusals.into_iter().enumerate() {
                    let refusal =
                        refusal.unwrap_or_else(|| panic!("act {index} on the role {place} went"));

                    assert_eq!(
                        reason_of(&refusal),
                        RefusalReason::RankNotAbove,
                        "act {index} on the role {place}: {refusal:?}"
                    );
                }
            }

            let above = create_role(&r.store, &r.actor, "new", members, &r.spare_high, NOW)
                .await
                .expect_err("a role was made above its maker");

            assert_eq!(reason_of(&above), RefusalReason::RankNotAbove, "{above:?}");

            // and the acts on members, which are other flags'.
            for refusal in [
                assign_role(&r.store, &r.actor, &r.lina, &r.spare_low, None, NOW)
                    .await
                    .expect_err("a holder of manageRoles assigned a role"),
                set_override(&r.store, &r.actor, &r.lina, edit_payment, NOW)
                    .await
                    .expect_err("a holder of manageRoles set an override"),
            ] {
                assert_eq!(
                    reason_of(&refusal),
                    RefusalReason::RoleLacksAct,
                    "{refusal:?}"
                );
            }

            assert_eq!(
                every_row(&r.store).await,
                before,
                "a refusal wrote something"
            );

            // below: every act goes.
            rename_role(&r.store, &r.actor, &r.spare_low, "renamed", NOW)
                .await
                .expect("the rename below");
            set_role_mask(
                &r.store,
                &r.actor,
                &r.spare_low,
                members ^ edit_payment,
                NOW,
            )
            .await
            .expect("the re-mask below");
            move_role(&r.store, &r.actor, &r.spare_low, &r.mine, NOW)
                .await
                .expect("the move below");
            create_role(&r.store, &r.actor, "made", members, &r.mine, NOW)
                .await
                .expect("a role made below its maker");
            delete_role(&r.store, &r.actor, &r.spare_low, NOW)
                .await
                .expect("the deletion below");
        }

        // assignRole and overrideMember: the member above, at the rank, below, and themselves.
        for flag in [Flag::AssignRole, Flag::OverrideMember] {
            let r = ranked(&directory.join(flag.name()), flag).await;
            let act = |member: String| {
                let r = &r;

                async move {
                    if flag == Flag::AssignRole {
                        assign_role(&r.store, &r.actor, &member, &r.spare_low, None, NOW).await
                    } else {
                        set_override(&r.store, &r.actor, &member, edit_payment, NOW).await
                    }
                }
            };
            let before = every_row(&r.store).await;

            for (place, member, expected) in [
                ("above", r.hana.clone(), RefusalReason::RankNotAbove),
                ("at", r.eve.clone(), RefusalReason::RankNotAbove),
                (
                    "self",
                    r.actor.member_id.clone(),
                    RefusalReason::NotYourself,
                ),
            ] {
                let Err(refusal) = act(member).await else {
                    panic!("{} on the member {place} went", flag.name());
                };

                assert_eq!(
                    reason_of(&refusal),
                    expected,
                    "{} on the member {place}: {refusal:?}",
                    flag.name()
                );
            }

            if flag == Flag::AssignRole {
                // the role given is held to the rank as well as the member.
                for role in [&r.spare_high, &r.mine] {
                    let refusal = assign_role(&r.store, &r.actor, &r.lina, role, None, NOW)
                        .await
                        .expect_err("a role not below the actor was given");

                    assert_eq!(
                        reason_of(&refusal),
                        RefusalReason::RankNotAbove,
                        "{refusal:?}"
                    );
                }
            }

            let other = rename_role(&r.store, &r.actor, &r.spare_low, "renamed", NOW)
                .await
                .expect_err("a holder of a member flag renamed a role");

            assert_eq!(reason_of(&other), RefusalReason::RoleLacksAct, "{other:?}");
            assert_eq!(
                every_row(&r.store).await,
                before,
                "a refusal wrote something"
            );

            // below: it goes, and the member's certificate is issued from the actor's.
            act(r.lina.clone())
                .await
                .unwrap_or_else(|error| panic!("{} below: {error:?}", flag.name()));

            let issued = the_certificate(&r.store, &r.owner, &r.lina).await;
            let actors = the_certificate(&r.store, &r.owner, &r.actor.member_id).await;

            assert_eq!(
                issued.issuer_certificate_id.as_deref(),
                Some(actors.id.as_str())
            );
        }
    }

    /// **Criterion 7, flags held.** A holder of every management flag who lacks `deletePayment`
    /// tries to switch it, in a role's mask and in an override, on and off: every way is refused by
    /// the flag's name and nothing is written. A flag they hold, switched the same ways, goes.
    #[tokio::test]
    async fn a_flag_the_actor_lacks_is_switched_neither_on_nor_off_in_a_role_or_an_override() {
        let directory = scratch("flags-held");
        let (store, owner, link, workspace_id) = owned(&directory).await;
        let deleting = permission::mask_of(&[Flag::DeletePayment]);
        let members = permission::MEMBER_ROLE.mask;
        let deputy = a_role(
            &store,
            &owner,
            "deputy",
            permission::MANAGER_ROLE.mask & !deleting,
            permission::MANAGER,
        )
        .await;
        let clerk = a_role(&store, &owner, "clerk", members, &deputy).await;
        let auditor = a_role(&store, &owner, "auditor", members | deleting, &clerk).await;
        let actor = holding_role(&store, &owner, &link, "the.deputy", &deputy, &workspace_id).await;
        let lina = holding_role(&store, &owner, &link, "lina", &clerk, &workspace_id).await;
        let noor = holding_role(&store, &owner, &link, "noor", &auditor, &workspace_id).await;
        let before = every_row(&store).await;

        let refusals = [
            // on, in a role's mask, made and edited.
            create_role(&store, &actor, "deleter", members | deleting, &clerk, NOW)
                .await
                .err(),
            set_role_mask(&store, &actor, &clerk, members | deleting, NOW)
                .await
                .err(),
            // off, in a role's mask.
            set_role_mask(&store, &actor, &auditor, members, NOW)
                .await
                .err(),
            // on, in an override, and by moving a member onto a role that carries it.
            set_override(&store, &actor, &lina.member_id, deleting, NOW)
                .await
                .err(),
            assign_role(&store, &actor, &lina.member_id, &auditor, None, NOW)
                .await
                .err(),
            // off, in an override.
            set_override(&store, &actor, &noor.member_id, deleting, NOW)
                .await
                .err(),
        ];

        for (index, refusal) in refusals.into_iter().enumerate() {
            let refusal = refusal.unwrap_or_else(|| panic!("switch {index} went"));

            assert_eq!(reason_of(&refusal), RefusalReason::RoleLacksAct, "{index}");
            assert!(
                refusal.to_string().contains("deletePayment"),
                "{index}: {refusal}"
            );
        }

        assert_eq!(every_row(&store).await, before, "a refusal wrote something");

        // a flag they hold goes every way.
        let editing = permission::mask_of(&[Flag::EditPayment]);

        set_role_mask(&store, &actor, &clerk, members ^ editing, NOW)
            .await
            .expect("a held flag off, in a role");
        set_role_mask(&store, &actor, &clerk, members, NOW)
            .await
            .expect("a held flag on, in a role");
        set_override(&store, &actor, &lina.member_id, editing, NOW)
            .await
            .expect("a held flag off, in an override");
        set_override(&store, &actor, &lina.member_id, 0, NOW)
            .await
            .expect("a held flag on again, in an override");
    }

    /// **Criterion 7, flags held over a role and an override given together** (converge, round 1,
    /// ticket 14). The auditor's mask differs from the clerk's in `editPayment`, which the deputy
    /// holds, and in `deletePayment`, which they do not; an override of `deletePayment` switches
    /// that back. So moving a clerk onto the auditor with that override moves only `editPayment`.
    ///
    /// Asked as two acts, either order passes through a state that switches `deletePayment`, and
    /// each is refused. Asked as one, it is refused too, and by the override: the row it writes
    /// switches `deletePayment`, which the deputy's certificate does not carry, and the chain
    /// refuses such a row on read (review round two bounded a member row by its override). The
    /// owner, who holds it, gives the role and the override as one act. A role and an override that
    /// together do switch `deletePayment` are refused whole, and the row and the certificate stay
    /// as they were. An override that changes is asked of `overrideMember` as well as
    /// `assignRole`, and one given as it stands is not. *Until review round two the deputy's one
    /// act went, as ticket 14 asked.*
    #[tokio::test]
    async fn a_role_and_an_override_given_together_are_held_to_the_flags_they_move_together() {
        let directory = scratch("one-act");
        let (store, owner, link, workspace_id) = owned(&directory).await;
        let deleting = permission::mask_of(&[Flag::DeletePayment]);
        let editing = permission::mask_of(&[Flag::EditPayment]);
        let members = permission::MEMBER_ROLE.mask;
        let deputy = a_role(
            &store,
            &owner,
            "deputy",
            permission::MANAGER_ROLE.mask & !deleting,
            permission::MANAGER,
        )
        .await;
        let clerk = a_role(&store, &owner, "clerk", members, &deputy).await;
        let auditor = a_role(
            &store,
            &owner,
            "auditor",
            (members ^ editing) | deleting,
            &clerk,
        )
        .await;
        let reviewer = a_role(&store, &owner, "reviewer", members ^ editing, &auditor).await;
        let actor = holding_role(&store, &owner, &link, "the.deputy", &deputy, &workspace_id).await;
        let lina = holding_role(&store, &owner, &link, "lina", &clerk, &workspace_id).await;
        let noor = holding_role(&store, &owner, &link, "noor", &clerk, &workspace_id).await;
        let before = every_row(&store).await;

        // two steps: the role alone switches deletePayment on, and so does the override alone.
        for refusal in [
            assign_role(&store, &actor, &lina.member_id, &auditor, None, NOW)
                .await
                .expect_err("the role alone went"),
            set_override(&store, &actor, &lina.member_id, deleting, NOW)
                .await
                .expect_err("the override alone went"),
        ] {
            assert_eq!(
                reason_of(&refusal),
                RefusalReason::RoleLacksAct,
                "{refusal:?}"
            );
            assert!(refusal.to_string().contains("deletePayment"), "{refusal}");
        }

        assert_eq!(every_row(&store).await, before, "a refusal wrote something");

        // one act: only editPayment moves, and the deputy still cannot sign the override.
        let refusal = assign_role(
            &store,
            &actor,
            &lina.member_id,
            &auditor,
            Some(deleting),
            NOW + 1,
        )
        .await
        .expect_err("the deputy signed an override switching a flag they lack");

        assert_eq!(
            reason_of(&refusal),
            RefusalReason::RoleLacksAct,
            "{refusal:?}"
        );
        assert!(
            refusal
                .to_string()
                .contains("has deletePayment switched for them"),
            "{refusal}"
        );
        assert_eq!(every_row(&store).await, before, "a refusal wrote something");

        // the owner gives the role and the override as one act.
        let given = assign_role(
            &store,
            &owner,
            &lina.member_id,
            &auditor,
            Some(deleting),
            NOW + 1,
        )
        .await
        .expect("the role and the override together");

        assert_eq!(given.permissions, members ^ editing);

        let row = member_row(&store, &owner, &lina.member_id).await;

        assert_eq!(row.role_id, auditor);
        assert_eq!(row.override_mask, deleting);
        assert_eq!(row.effective, members ^ editing);
        assert_eq!(
            the_certificate(&store, &owner, &lina.member_id)
                .await
                .ceiling,
            members ^ editing
        );

        // a combination that does switch deletePayment on is refused whole.
        let row_before = member_row(&store, &owner, &noor.member_id).await;
        let certificate_before = the_certificate(&store, &owner, &noor.member_id).await;
        let before = every_row(&store).await;
        let refusal = assign_role(&store, &actor, &noor.member_id, &auditor, Some(0), NOW + 2)
            .await
            .expect_err("a role and an override moving deletePayment went");

        assert_eq!(
            reason_of(&refusal),
            RefusalReason::RoleLacksAct,
            "{refusal:?}"
        );
        assert!(refusal.to_string().contains("deletePayment"), "{refusal}");
        assert_eq!(
            member_row(&store, &owner, &noor.member_id).await,
            row_before
        );
        assert_eq!(
            the_certificate(&store, &owner, &noor.member_id).await.id,
            certificate_before.id
        );
        assert_eq!(
            every_row(&store).await,
            before,
            "the refusal wrote something"
        );

        // without overrideMember: an override that changes is refused by that flag's name, and one
        // given as it stands is only an assignment.
        set_role_mask(
            &store,
            &owner,
            &deputy,
            permission::MANAGER_ROLE.mask
                & !deleting
                & !permission::mask_of(&[Flag::OverrideMember]),
            NOW + 3,
        )
        .await
        .expect("the owner narrowed the deputy");

        let before = every_row(&store).await;
        let refusal = assign_role(
            &store,
            &actor,
            &noor.member_id,
            &auditor,
            Some(deleting),
            NOW + 4,
        )
        .await
        .expect_err("an override was changed without overrideMember");

        assert_eq!(
            reason_of(&refusal),
            RefusalReason::RoleLacksAct,
            "{refusal:?}"
        );
        assert!(refusal.to_string().contains("overrideMember"), "{refusal}");
        assert_eq!(
            every_row(&store).await,
            before,
            "the refusal wrote something"
        );

        assign_role(&store, &actor, &noor.member_id, &reviewer, Some(0), NOW + 5)
            .await
            .expect("an override given as it stands is not asked of overrideMember");

        assert_eq!(
            member_row(&store, &owner, &noor.member_id).await.role_id,
            reviewer
        );
    }

    /// **Requirement 2 at these acts.** None of the owner's flags goes into the manager's mask, a
    /// custom role's mask or an override, from the owner or from a manager.
    #[tokio::test]
    async fn the_owners_flags_are_refused_in_every_mask_and_every_override() {
        let directory = scratch("owner-only");
        let (store, owner, link, workspace_id) = owned(&directory).await;
        let custom = a_role(
            &store,
            &owner,
            "collector",
            permission::MEMBER_ROLE.mask,
            permission::MANAGER,
        )
        .await;
        let ada = holding_role(
            &store,
            &owner,
            &link,
            "ada.admin",
            permission::MANAGER,
            &workspace_id,
        )
        .await;
        let sami = holding_role(&store, &owner, &link, "sami", &custom, &workspace_id).await;
        let before = every_row(&store).await;

        for flag in permission::OWNER_ONLY {
            let bit = permission::mask_of(&[flag]);

            for (what, refusal) in [
                (
                    "the manager's mask, by the owner",
                    set_role_mask(
                        &store,
                        &owner,
                        permission::MANAGER,
                        permission::MANAGER_ROLE.mask | bit,
                        NOW,
                    )
                    .await
                    .err(),
                ),
                (
                    "a custom mask, by the owner",
                    set_role_mask(
                        &store,
                        &owner,
                        &custom,
                        permission::MEMBER_ROLE.mask | bit,
                        NOW,
                    )
                    .await
                    .err(),
                ),
                (
                    "a custom mask, by a manager",
                    set_role_mask(
                        &store,
                        &ada,
                        &custom,
                        permission::MEMBER_ROLE.mask | bit,
                        NOW,
                    )
                    .await
                    .err(),
                ),
                (
                    "an override, by the owner",
                    set_override(&store, &owner, &sami.member_id, bit, NOW)
                        .await
                        .err(),
                ),
                (
                    "an override, by a manager",
                    set_override(&store, &ada, &sami.member_id, bit, NOW)
                        .await
                        .err(),
                ),
            ] {
                let refusal = refusal.unwrap_or_else(|| panic!("{} went into {what}", flag.name()));

                assert!(
                    matches!(
                        reason_of(&refusal),
                        RefusalReason::OwnerOnly | RefusalReason::RoleLacksAct
                    ),
                    "{} into {what}: {refusal:?}",
                    flag.name()
                );
                assert!(
                    refusal.to_string().contains(flag.name()),
                    "{} into {what}: {refusal}",
                    flag.name()
                );
            }
        }

        assert_eq!(every_row(&store).await, before, "a refusal wrote something");
    }

    /// **Criterion 9, three stores on one database.** The owner makes a role holding
    /// `inviteMember` and is gone: no act after that derives the organization key, and no store
    /// can, since only the owner's vault derives it. The role carries `grantWorkspace` beside it,
    /// because making an account writes the account's grant on the organization database, which
    /// only a holder of `grantWorkspace` signs (`invite::write_account`). A manager on a second store gives the role to
    /// a member who signed nothing before; the member, on a third, makes an account and its link,
    /// which writes an invitation row under the certificate the manager issued; and the row
    /// verifies on the other two against the key each pinned. Editing the role's mask then issues
    /// every holder's certificate again, and the row still verifies.
    #[tokio::test]
    async fn a_manager_gives_a_signing_flag_without_the_owner_and_it_verifies_on_a_third_store() {
        let directory = scratch("three-stores");
        let (owners, owner, link, workspace_id) = owned(&directory).await;
        let recruiting = permission::MEMBER_ROLE.mask
            | permission::mask_of(&[Flag::InviteMember, Flag::GrantWorkspace]);
        let recruiter = a_role(
            &owners,
            &owner,
            "recruiter",
            recruiting,
            permission::MANAGER,
        )
        .await;
        let ada = holding_role(
            &owners,
            &owner,
            &link,
            "ada.admin",
            permission::MANAGER,
            &workspace_id,
        )
        .await;
        let (sami, sami_session) = a_member(
            &owners,
            &owner,
            &link,
            "sami.staff",
            permission::MEMBER,
            &workspace_id,
        )
        .await;
        let (bilal, _) = a_member(
            &owners,
            &owner,
            &link,
            "bilal.staff",
            permission::MEMBER,
            &workspace_id,
        )
        .await;
        let path =
            OrganizationStore::replica_path(&directory.join("app.db"), &owner.organization_id);
        let open = || async {
            OrganizationStore::open(&path, None, || async {
                Err(turso::Error::Misuse("no remote".into()))
            })
            .await
            .expect("a store over the database did not open")
        };
        let managers = open().await;
        let members = open().await;
        let pinned = owner.verifying_key;

        // the owner's machine is off: neither the manager nor the member derives the key.
        assert!(organization_key_of(&ada).is_err());
        assert!(organization_key_of(&sami_session).is_err());

        let roots_before = owners
            .certificates()
            .await
            .expect("the certificates")
            .iter()
            .filter(|certificate| certificate.is_root())
            .count();

        // the manager, on their store, gives sami the role.
        assign_role(&managers, &ada, &sami.member_id, &recruiter, None, NOW + 1)
            .await
            .expect("the manager could not give the role");

        let issued = the_certificate(&members, &owner, &sami.member_id).await;
        let adas = the_certificate(&members, &owner, &ada.member_id).await;

        assert_eq!(
            issued.issuer_certificate_id.as_deref(),
            Some(adas.id.as_str())
        );
        assert!(permission::permits(issued.ceiling, Flag::InviteMember));

        // sami, on theirs, makes an account and its link: an invitation row signed by sami.
        let workspaces = full(std::slice::from_ref(&workspace_id));
        let made = make_account_and_link(
            &members,
            &sami_session,
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
        .expect("the member could not invite");
        async fn invited(
            store: &OrganizationStore,
            pinned: &[u8; VERIFYING_KEY_BYTES],
            member_id: &str,
        ) -> bool {
            store
                .invitations(pinned)
                .await
                .expect("the invitations do not verify")
                .into_iter()
                .any(|invitation| invitation.member_id == member_id)
        }

        assert!(
            invited(&owners, &pinned, &made.member_id).await,
            "the invitation does not verify on the owner's store"
        );
        assert!(
            invited(&managers, &pinned, &made.member_id).await,
            "the invitation does not verify on the manager's store"
        );

        // editing the role's mask issues every holder's certificate again.
        assign_role(&managers, &ada, &bilal.member_id, &recruiter, None, NOW + 3)
            .await
            .expect("the manager could not give the role a second time");

        let holders_before = [
            the_certificate(&owners, &owner, &sami.member_id).await,
            the_certificate(&owners, &owner, &bilal.member_id).await,
        ];
        let narrower = recruiting & !permission::mask_of(&[Flag::EditTenant]);

        set_role_mask(&managers, &ada, &recruiter, narrower, NOW + 4)
            .await
            .expect("the manager could not edit the role");

        for (before, member_id) in holders_before
            .iter()
            .zip([&sami.member_id, &bilal.member_id])
        {
            let after = the_certificate(&owners, &owner, member_id).await;

            assert_ne!(
                after.id, before.id,
                "{member_id}'s certificate was not issued again"
            );
            assert_eq!(after.ceiling, narrower);
        }

        assert!(
            invited(&owners, &pinned, &made.member_id).await,
            "the invitation stopped verifying"
        );
        owners
            .members(&pinned)
            .await
            .expect("every member row verifies on the owner's store");
        assert_eq!(
            owners
                .certificates()
                .await
                .expect("the certificates")
                .iter()
                .filter(|certificate| certificate.is_root())
                .count(),
            roots_before,
            "a root was issued with the owner away"
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

    /// A manager who opened their link on a machine of their own and chose a password,
    /// which is the standing an offer of the organization needs: a vault of their own, that their
    /// own password opens, on a machine that pinned this organization's key.
    async fn a_settled_manager(
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
            permission::MANAGER,
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

        (member.role_id, member.effective)
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
        let (ada, ada_session, _) = a_settled_manager(
            &directory,
            &store,
            &owner,
            &link,
            &workspace_id,
            "ada.admin",
            MANAGERS_PASSWORD,
        )
        .await;
        let unset = an_unset_account(
            &store,
            &owner,
            &link,
            "noor.new",
            permission::MANAGER,
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
            MANAGERS_PASSWORD,
            NOW + 2,
        )
        .await
        .expect_err("a manager offered the organization");

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
        let (ada, mut ada_session, mut ada_machine) = a_settled_manager(
            &directory,
            &store,
            &owner,
            &link,
            &workspace_id,
            "ada.admin",
            MANAGERS_PASSWORD,
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
                permission::MANAGER.to_string(),
                permission::MANAGER_ROLE.mask
            )
        );

        accept_ownership(
            &store,
            &mut ada_session,
            &mut ada_machine,
            MANAGERS_PASSWORD,
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
            (permission::OWNER.to_string(), permission::OWNER_ROLE.mask)
        );
        assert_eq!(
            row_of_under(&store, &new_key, &owner.member_id).await,
            (
                permission::MANAGER.to_string(),
                permission::MANAGER_ROLE.mask
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
    /// and a member's that they revoked; a manager has issued one further down; the manager who
    /// accepts has made an account, so their certificate signed rows and issued one; and the
    /// founder has set the mark.
    ///
    /// After it, **the new owner holds exactly one live certificate, the root** (the review of
    /// effort 838): the one they held before is not live, the rows it signed verify under the new
    /// key, and what it issued is issued again from the root. Every other certificate that was
    /// live under the key being left is live under the new pinned key; each the founder issued
    /// directly is issued again from the new owner's root, under its id and signing key, and the
    /// one a manager issued keeps its issuer. The founder's own certificate is a manager's, their
    /// row names the manager role with no override and reads the manager's mask, and the roles and
    /// the mark verify under the new key. What the founder revoked as the owner stays revoked, and
    /// the new owner's session carries every flag.
    #[tokio::test]
    async fn after_a_handover_every_certificate_walks_to_the_new_key_and_the_founder_is_a_manager()
    {
        let directory = scratch("handover-chain");
        let (store, owner, link, workspace_id) = owned(&directory).await;
        let (ada, mut ada_session, mut ada_machine) = a_settled_manager(
            &directory,
            &store,
            &owner,
            &link,
            &workspace_id,
            "ada.admin",
            MANAGERS_PASSWORD,
        )
        .await;
        let (bilal, bilal_session, _) = a_settled_manager(
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

        // the manager who is to accept makes an account: their certificate signs its rows and
        // issues its certificate.
        let (celia, _) = a_member(
            &store,
            &ada_session,
            &link,
            "celia.staff",
            permission::MEMBER,
            &workspace_id,
        )
        .await;
        let (_, adas_before) = signer_of(&store, &ada_session).await.expect("ada's");

        assert_eq!(
            store
                .live_certificate(
                    &old_key,
                    &celia.member_id,
                    &store
                        .members(&old_key)
                        .await
                        .expect("the rows")
                        .into_iter()
                        .find(|member| member.id == celia.member_id)
                        .expect("celia's row")
                        .signing_public_key,
                )
                .await
                .expect("the certificates")
                .expect("celia's certificate")
                .issuer_certificate_id
                .as_deref(),
            Some(adas_before.id.as_str())
        );

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
            MANAGERS_PASSWORD,
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

        // the new owner holds one live certificate, the root: the one they signed with before is
        // not live, and what it issued was issued again from the root.
        assert_eq!(
            after
                .live_certificates_of(&ada.member_id)
                .into_iter()
                .map(|certificate| certificate.id.clone())
                .collect::<Vec<_>>(),
            vec![new_root.id.clone()]
        );
        assert!(after.live(&adas_before.id).is_err());

        // every other certificate that was live is live under the new key; each the founder
        // issued directly, their own among them, and each the new owner's earlier one issued, was
        // issued again from the new owner's root.
        for was in live_before
            .iter()
            .filter(|was| was.member_id != ada.member_id)
        {
            let now = after
                .live(&was.id)
                .unwrap_or_else(|refusal| panic!("{} stopped verifying: {refusal:?}", was.id));

            assert_eq!(now.member_id, was.member_id);
            assert_eq!(now.signing_public_key, was.signing_public_key);

            if was.issuer_certificate_id.as_deref() == Some(old_root.id.as_str())
                || was.issuer_certificate_id.as_deref() == Some(adas_before.id.as_str())
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
        store
            .invitations(&new_key)
            .await
            .expect("the invitations do not verify under the new key");
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
        let (ada, mut ada_session, mut ada_machine) = a_settled_manager(
            &directory,
            &store,
            &owner,
            &link,
            &workspace_id,
            "ada.admin",
            MANAGERS_PASSWORD,
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
            MANAGERS_PASSWORD,
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
        let (ada, mut ada_session, mut ada_machine) = a_settled_manager(
            &directory,
            &store,
            &owner,
            &link,
            &workspace_id,
            "ada.admin",
            MANAGERS_PASSWORD,
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
            MANAGERS_PASSWORD,
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
        assert_eq!(ada_session.role, permission::MANAGER);
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
        let (ada, mut ada_session, mut ada_machine) = a_settled_manager(
            &directory,
            &store,
            &owner,
            &link,
            &workspace_id,
            "ada.admin",
            MANAGERS_PASSWORD,
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
            MANAGERS_PASSWORD,
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
            .write_member_around_the_check(
                &signer,
                &MemberRecord {
                    role_id: permission::MANAGER.to_string(),
                    override_mask: 0,
                    ..row
                },
            )
            .await
            .expect("the row is written around the store; it is the readers that refuse it");
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
        let (ada, mut ada_session, mut ada_machine) = a_settled_manager(
            &directory,
            &store,
            &owner,
            &link,
            &workspace_id,
            "ada.admin",
            MANAGERS_PASSWORD,
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
            MANAGERS_PASSWORD,
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
        let (ada, mut ada_session, mut ada_machine) = a_settled_manager(
            &directory,
            &store,
            &owner,
            &link,
            &workspace_id,
            "ada.admin",
            MANAGERS_PASSWORD,
        )
        .await;
        let (bilal, mut bilal_session, mut bilal_machine) = a_settled_manager(
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
            MANAGERS_PASSWORD,
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
            MANAGERS_PASSWORD,
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
        let (ada, mut ada_session, mut ada_machine) = a_settled_manager(
            &directory,
            &store,
            &owner,
            &link,
            &workspace_id,
            "ada.admin",
            MANAGERS_PASSWORD,
        )
        .await;
        let (bilal, mut bilal_session, mut bilal_machine) = a_settled_manager(
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
            MANAGERS_PASSWORD,
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
            (permission::OWNER.to_string(), permission::OWNER_ROLE.mask)
        );
        assert_eq!(bilal_session.role, permission::MANAGER);
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
        let (ada, mut ada_session, mut ada_machine) = a_settled_manager(
            &directory,
            &store,
            &owner,
            &link,
            &workspace_id,
            "ada.admin",
            MANAGERS_PASSWORD,
        )
        .await;

        offer_ownership(&store, &owner, &ada.member_id, PASSWORD, NOW + 1)
            .await
            .expect("the offer failed");
        accept_ownership(
            &store,
            &mut ada_session,
            &mut ada_machine,
            MANAGERS_PASSWORD,
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
            (permission::OWNER.to_string(), permission::OWNER_ROLE.mask)
        );
    }

    /// **Criterion 22 at its seams: a certificate is issued under the pinned key or not at all.**
    /// The founder's session, re-pinned onto the key the organization is on now, is the manager
    /// its row says, and its vault is refused the key by name. A session that somehow kept the word
    /// `owner` past the re-pin gains nothing by it: every gate reads the verified row, so the
    /// manager's role is still not below it, and what it may do as a manager it does from the
    /// manager's certificate, which walks to the key in force (effort 838).
    #[tokio::test]
    async fn a_session_whose_vault_does_not_derive_the_pinned_key_certifies_nobody() {
        let directory = scratch("certify-under-the-pinned-key");
        let (store, mut owner, link, workspace_id) = owned(&directory).await;
        let (ada, mut ada_session, mut ada_machine) = a_settled_manager(
            &directory,
            &store,
            &owner,
            &link,
            &workspace_id,
            "ada.admin",
            MANAGERS_PASSWORD,
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
            MANAGERS_PASSWORD,
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
        assert_eq!(owner.role, permission::MANAGER);
        assert_eq!(owner.permissions, permission::MANAGER_ROLE.mask);

        // and it is refused the key by name.
        let refused = organization_key_of(&owner).expect_err("the founder's vault certified");

        assert!(
            matches!(refused, Error::Refused { reason: crate::error::RefusalReason::KeyNotInForce, ref message } if message == NOT_THE_KEY_IN_FORCE),
            "{refused:?}"
        );

        // a session that kept the word past the re-pin: the gate reads the row, and the manager's
        // role is not below a manager. Nothing is written.
        owner.role = permission::OWNER.to_string();

        let before = every_row(&store).await;
        let refused = assign_role(
            &store,
            &owner,
            &sami.member_id,
            permission::MANAGER,
            None,
            NOW + 3,
        )
        .await
        .expect_err("a session that kept the word made somebody a manager");

        assert_eq!(
            reason_of(&refused),
            RefusalReason::RankNotAbove,
            "{refused:?}"
        );
        assert_eq!(
            every_row(&store).await,
            before,
            "a refused assignment wrote something"
        );

        // and what it does as a manager is issued from the manager's certificate, under the key
        // in force: no root, and nothing under the key that was handed over.
        let roots = |certificates: &[Certificate]| {
            certificates
                .iter()
                .filter(|certificate| certificate.is_root())
                .count()
        };
        let roots_before = roots(&store.certificates().await.expect("the certificates"));

        set_override(
            &store,
            &owner,
            &sami.member_id,
            permission::mask_of(&[Flag::EditPayment]),
            NOW + 4,
        )
        .await
        .expect("the founder, a manager now, could not set an override");

        let (certificates, revocations) = store.chain_rows().await.expect("the chain");
        let issued = Chain::new(&new_key, &certificates, &revocations)
            .live_certificates_of(&sami.member_id)
            .pop()
            .cloned()
            .expect("sami's certificate does not walk to the key in force");

        assert_eq!(
            issued.issuer_certificate_id.as_deref(),
            Some(
                the_certificate(&store, &ada_session, &owner.member_id)
                    .await
                    .id
                    .as_str()
            )
        );
        assert_eq!(roots(&certificates), roots_before);

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

    // -------------------------------------------------------------------------------------
    // The review of effort 838, round one: a signed row never reaches wider than the
    // certificate that signs it.
    // -------------------------------------------------------------------------------------

    /// **A member widening their own row** (criterion 9). A clerk, who renames members and so
    /// holds a certificate, writes their own row back to the member role with an override handing
    /// them `manageRoles`, `assignRole`, `grantWorkspace` and `deleteContract`. The store refuses
    /// it by name and writes nothing; written around the store, as somebody holding the credential
    /// can, every other machine refuses it on read. **And no later act reads the width back off
    /// it**: the owner's unrelated edit of the member role's mask, which issues every holder a
    /// fresh certificate from their row, is refused on the forged row, and the clerk's certificate
    /// carries none of the four. *Before the correction the row verified everywhere and the edit
    /// issued the clerk a certificate carrying all four.*
    #[tokio::test]
    async fn a_member_widening_their_own_row_is_refused_and_no_role_edit_reissues_the_width() {
        let directory = scratch("own-row");
        let (store, owner, link, workspace_id) = owned(&directory).await;
        let clerk = a_role(
            &store,
            &owner,
            "Clerk",
            permission::MEMBER_ROLE.mask | permission::mask_of(&[Flag::RenameMember]),
            permission::MANAGER,
        )
        .await;
        let rita = holding_role(&store, &owner, &link, "rita", &clerk, &workspace_id).await;
        let rita_row = member_row(&store, &owner, &rita.member_id).await;
        let (key, certificate) = signer_of(&store, &rita).await.expect("rita signs");
        let signer = Signer {
            key: &key,
            certificate: &certificate,
        };
        let widened = permission::mask_of(&[
            Flag::ManageRoles,
            Flag::AssignRole,
            Flag::GrantWorkspace,
            Flag::DeleteContract,
        ]);
        let forged = MemberRecord {
            role_id: permission::MEMBER.to_string(),
            override_mask: widened,
            ..rita_row.clone()
        };

        assert_eq!(certificate.ceiling & widened, 0);

        // through the store: refused by name, and nothing moved.
        let rows_before = every_row(&store).await;
        let refused = store
            .write_member(&signer, &forged)
            .await
            .expect_err("the store wrote a row wider than its signer");

        assert_eq!(reason_of(&refused), RefusalReason::RoleLacksAct);
        assert!(
            refused
                .to_string()
                .contains("every flag their override switches"),
            "{refused}"
        );
        assert_eq!(every_row(&store).await, rows_before);

        // around the store: every other machine refuses the directory, naming the row.
        store
            .write_member_around_the_check(&signer, &forged)
            .await
            .expect("written around the store");

        let elsewhere = another_machine(&directory, &owner.organization_id).await;
        let read = elsewhere.members(&owner.verifying_key).await;

        assert!(
            matches!(&read, Err(Error::Integrity { message })
                if message.contains(&rita.member_id)
                    && message.contains("the row is not one its certificate may sign")),
            "{read:?}"
        );

        // and the owner's later, unrelated edit of the member role does not carry the width into
        // a certificate: it reads the forged row, and is refused on it.
        let edited = set_role_mask(
            &store,
            &owner,
            permission::MEMBER,
            permission::MEMBER_ROLE.mask | permission::mask_of(&[Flag::DeletePayment]),
            NOW + 1,
        )
        .await;

        assert!(
            matches!(&edited, Err(Error::Integrity { .. })),
            "{edited:?}"
        );

        let live = store
            .live_certificates(&owner.verifying_key, &rita.member_id)
            .await
            .expect("the certificates");

        assert_eq!(live.len(), 1);
        assert_eq!(live[0].id, certificate.id);
        assert_eq!(live[0].ceiling & widened, 0, "the width was re-issued");
    }

    /// **A role row wider than its signer** (criterion 9). A supervisor, ranked below the manager
    /// and holding every manager's flag but `grantWorkspace`, writes a clerk role's row carrying
    /// `grantWorkspace` and `createWorkspace`, the second an owner's flag. The store refuses it by
    /// name and writes nothing; written around the store, every other machine refuses it on read,
    /// so no holder of the role reads either flag.
    #[tokio::test]
    async fn a_role_row_wider_than_its_signer_is_refused_by_the_store_and_on_every_other_machine() {
        let directory = scratch("role-row");
        let (store, owner, link, workspace_id) = owned(&directory).await;
        let without_grant =
            permission::MANAGER_ROLE.mask & !permission::mask_of(&[Flag::GrantWorkspace]);
        let supervisor = a_role(
            &store,
            &owner,
            "Supervisor",
            without_grant,
            permission::MANAGER,
        )
        .await;
        let clerk = a_role(
            &store,
            &owner,
            "Clerk",
            permission::MEMBER_ROLE.mask,
            &supervisor,
        )
        .await;
        let sue = holding_role(&store, &owner, &link, "sue", &supervisor, &workspace_id).await;
        let (key, certificate) = signer_of(&store, &sue).await.expect("sue signs");
        let signer = Signer {
            key: &key,
            certificate: &certificate,
        };
        let row = store
            .roles(&owner.verifying_key)
            .await
            .expect("the roles verify")
            .into_iter()
            .find(|role| role.id == clerk)
            .expect("the clerk role");
        let widened = crate::organization::store::RoleRecord {
            mask: row.mask | permission::mask_of(&[Flag::GrantWorkspace, Flag::CreateWorkspace]),
            ..row
        };

        assert!(!permission::permits(
            certificate.ceiling,
            Flag::GrantWorkspace
        ));

        // through the store: refused by name, and nothing moved.
        let rows_before = every_row(&store).await;
        let refused = store
            .write_role(&signer, &widened)
            .await
            .expect_err("the store wrote a role wider than its signer");

        assert_eq!(reason_of(&refused), RefusalReason::RoleLacksAct);
        assert!(
            refused.to_string().contains("every flag the role carries"),
            "{refused}"
        );
        assert_eq!(every_row(&store).await, rows_before);

        // around the store: every other machine refuses it.
        store
            .write_role_around_the_check(&signer, &widened)
            .await
            .expect("written around the store");

        let read = another_machine(&directory, &owner.organization_id)
            .await
            .roles(&owner.verifying_key)
            .await;

        assert!(
            matches!(&read, Err(Error::Integrity { message })
                if message.contains(&clerk)
                    && message.contains("the row is not one its certificate may sign")),
            "{read:?}"
        );
    }

    /// **What the corrected table refuses, each act refuses first** (the ticket's constraint). The
    /// owner widens the member role with `deleteContract` and takes it off the manager's mask, so a
    /// manager's certificate no longer signs the member role's row, nor issues a member-role
    /// holder's certificate. Every act of the manager's that would write one is refused by name,
    /// naming the flag, before anything is written, and the directory still reads: an override, an
    /// edit of the role and a reset. A rename, which writes the holder's row alone, is not: the
    /// row is bounded by its override, and the role's mask is its role row's to vouch for (review
    /// round two). *A rename and a removal were refused here too until then.*
    #[tokio::test]
    async fn an_act_whose_rows_the_actor_could_not_sign_is_refused_by_name_before_it_writes() {
        let directory = scratch("uncovered-acts");
        let (store, owner, link, workspace_id) = owned(&directory).await;
        let manny = holding_role(
            &store,
            &owner,
            &link,
            "manny",
            permission::MANAGER,
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
        let delete_contract = permission::mask_of(&[Flag::DeleteContract]);
        let view_complex = permission::mask_of(&[Flag::ViewComplex]);

        set_role_mask(
            &store,
            &owner,
            permission::MEMBER,
            permission::MEMBER_ROLE.mask | delete_contract,
            NOW + 1,
        )
        .await
        .expect("the owner widens the member role");
        set_role_mask(
            &store,
            &owner,
            permission::MANAGER,
            permission::MANAGER_ROLE.mask & !delete_contract,
            NOW + 2,
        )
        .await
        .expect("the owner narrows the manager role");

        let rows_before = every_row(&store).await;
        let names_the_flag = |outcome: Result<(), Error>, act: &str| {
            let refused = outcome.expect_err(act);

            assert_eq!(reason_of(&refused), RefusalReason::RoleLacksAct, "{act}");
            assert!(
                refused.to_string().contains("deleteContract"),
                "{act}: {refused}"
            );
        };

        names_the_flag(
            set_override(&store, &manny, &sami.member_id, view_complex, NOW + 3)
                .await
                .map(|_| ()),
            "an override leaving sami a flag manny lacks",
        );
        names_the_flag(
            set_role_mask(
                &store,
                &manny,
                permission::MEMBER,
                (permission::MEMBER_ROLE.mask ^ view_complex) | delete_contract,
                NOW + 3,
            )
            .await
            .map(|_| ()),
            "an edit of a role carrying a flag manny lacks",
        );
        names_the_flag(
            crate::organization::invite::unset_password(
                &store,
                &manny,
                no_platform(),
                &sami.member_id,
                test_cost(),
                NOW + 3,
            )
            .await
            .map(|_| ()),
            "a reset of a member holding a flag manny lacks",
        );

        assert_eq!(every_row(&store).await, rows_before);

        // and what writes sami's row alone, switching nothing and issuing nothing, is manny's to
        // write: a rename, since the member role's mask is its role row's to vouch for.
        crate::organization::invite::rename_member(
            &store,
            &manny,
            &sami.member_id,
            "sami.renamed",
            NOW + 4,
        )
        .await
        .expect("a rename of a member whose role carries a flag manny lacks");
        assert_eq!(
            member_row(&store, &owner, &sami.member_id).await.effective,
            permission::MEMBER_ROLE.mask | delete_contract
        );
        store
            .members(&owner.verifying_key)
            .await
            .expect("the directory still reads");
        store
            .roles(&owner.verifying_key)
            .await
            .expect("the roles still read");
    }

    /// Effort 838, review round two: **what the new owner revoked as a manager stays revoked
    /// after they accept the organization.** Their earlier certificate is issued again from the
    /// root under its own id before it is revoked, so every revocation it signed goes on counting:
    /// a member they removed is not live again, and a member they narrowed does not hold their old,
    /// wider certificate beside the new one.
    #[tokio::test]
    async fn what_the_new_owner_revoked_as_a_manager_stays_revoked_after_the_handover() {
        let directory = scratch("handover-revocations");
        let (store, owner, link, workspace_id) = owned(&directory).await;
        let (ada, mut ada_session, mut ada_machine) = a_settled_manager(
            &directory,
            &store,
            &owner,
            &link,
            &workspace_id,
            "ada.admin",
            MANAGERS_PASSWORD,
        )
        .await;
        let recruiter = a_role(
            &store,
            &owner,
            "Recruiter",
            permission::MEMBER_ROLE.mask
                | permission::mask_of(&[Flag::InviteMember, Flag::GrantWorkspace]),
            permission::MANAGER,
        )
        .await;
        let rex = holding_role(&store, &owner, &link, "rex", &recruiter, &workspace_id).await;
        let kim = holding_role(&store, &owner, &link, "kim", &recruiter, &workspace_id).await;
        let old_key = owner.verifying_key;

        removal::remove_member(
            &store,
            &mut ada_session,
            no_platform(),
            "org-database",
            &rex.member_id,
            false,
            NOW + 2,
        )
        .await
        .expect("ada removes rex");
        set_override(
            &store,
            &ada_session,
            &kim.member_id,
            permission::mask_of(&[Flag::InviteMember]),
            NOW + 3,
        )
        .await
        .expect("ada narrows kim");

        let kim_narrowed = store
            .live_certificates(&old_key, &kim.member_id)
            .await
            .expect("kim's certificates");

        assert!(
            store
                .live_certificates(&old_key, &rex.member_id)
                .await
                .expect("rex's certificates")
                .is_empty()
        );
        assert_eq!(kim_narrowed.len(), 1);

        offer_ownership(&store, &owner, &ada.member_id, PASSWORD, NOW + 5)
            .await
            .expect("the offer");
        accept_ownership(
            &store,
            &mut ada_session,
            &mut ada_machine,
            MANAGERS_PASSWORD,
            NOW + 6,
        )
        .await
        .expect("the acceptance");

        let new_key = ada_session.verifying_key;

        assert!(
            store
                .live_certificates(&new_key, &rex.member_id)
                .await
                .expect("rex's certificates")
                .is_empty(),
            "the removed member's certificate is live again after the handover"
        );
        assert_eq!(
            store
                .live_certificates(&new_key, &kim.member_id)
                .await
                .expect("kim's certificates")
                .iter()
                .map(|certificate| certificate.id.clone())
                .collect::<Vec<_>>(),
            vec![kim_narrowed[0].id.clone()],
            "the narrowed member holds their old, wider certificate again"
        );
        assert_eq!(
            store
                .live_certificates(&new_key, &ada.member_id)
                .await
                .expect("ada's certificates")
                .len(),
            1,
            "the new owner holds more than the root"
        );
    }

    // -------------------------------------------------------------------------------------
    // Effort 838, review round two: two machines acting together never brick the directory.
    // -------------------------------------------------------------------------------------

    /// A role's row as the owner's replica wrote it, merged into this one: signed by the owner's
    /// root with the mask and the rank given, and nothing else of the owner's act, which is what
    /// the other replica holds of it before either has pulled the other's.
    async fn merged_role_row(
        store: &OrganizationStore,
        owner: &MemberSession,
        role_id: &str,
        mask: i64,
        rank: i64,
    ) {
        let row = store
            .roles(&owner.verifying_key)
            .await
            .expect("the roles verify")
            .into_iter()
            .find(|role| role.id == role_id)
            .expect("the role");
        let (key, certificate) = signer_of(store, owner).await.expect("the owner signs");

        store
            .write_role(
                &Signer {
                    key: &key,
                    certificate: &certificate,
                },
                &crate::organization::store::RoleRecord { mask, rank, ..row },
            )
            .await
            .expect("the owner's role row");
    }

    /// **The review's race** (finding B). A lead, holding the member role's flags with
    /// `inviteMember` and `grantWorkspace`, invites sami on one machine while the owner adds
    /// `deletePayment` to the member role on another. Merged, sami's row names the widened role,
    /// wider than the lead's ceiling, and the directory reads on every machine with sami holding
    /// the widened role's permissions: the role's mask is vouched for by the role row's signer,
    /// and the lead signed only sami's role and override. *Before the correction every member read
    /// refused sami's row, and nothing in the application could repair it.*
    #[tokio::test]
    async fn a_lead_inviting_while_the_owner_widens_the_member_role_leaves_the_directory_readable()
    {
        let directory = scratch("race-widen");
        let (store, owner, link, workspace_id) = owned(&directory).await;
        let lead = a_role(
            &store,
            &owner,
            "Lead",
            permission::MEMBER_ROLE.mask
                | permission::mask_of(&[Flag::InviteMember, Flag::GrantWorkspace]),
            permission::MANAGER,
        )
        .await;
        let lena = holding_role(&store, &owner, &link, "lena", &lead, &workspace_id).await;
        let (sami, _) = a_member(
            &store,
            &lena,
            &link,
            "sami",
            permission::MEMBER,
            &workspace_id,
        )
        .await;
        let widened = permission::MEMBER_ROLE.mask | permission::mask_of(&[Flag::DeletePayment]);

        merged_role_row(
            &store,
            &owner,
            permission::MEMBER,
            widened,
            permission::MEMBER_ROLE.rank,
        )
        .await;

        assert!(!permission::permits(
            the_certificate(&store, &owner, &lena.member_id)
                .await
                .ceiling,
            Flag::DeletePayment
        ));

        for machine in [
            &store,
            &another_machine(&directory, &owner.organization_id).await,
        ] {
            let members = machine
                .members(&owner.verifying_key)
                .await
                .expect("the directory reads after the merge");
            let row = members
                .iter()
                .find(|member| member.id == sami.member_id)
                .expect("sami's row");

            assert_eq!(row.effective, widened);
        }
    }

    /// **A row its certificate stopped covering grants nothing, and the directory still reads.**
    /// A lead invites sami into a clerk role below them on one machine while the owner moves the
    /// clerk role above the lead on another. Merged, sami's row is genuine, signed by a live
    /// certificate that no longer outranks the role it names: it reads on every machine with no
    /// permissions and its removal as it was, and the lead's own acts on sami are refused. Sami's
    /// certificate stands as the lead issued it, re-issued from nothing. The row is never saved:
    /// the owner's assignment of the clerk role is refused by name, and the owner removes sami,
    /// which every machine then reads.
    #[tokio::test]
    async fn a_member_row_a_rank_move_left_uncovered_grants_nothing_and_is_removed_rather_than_saved()
     {
        let directory = scratch("race-rank");
        let (store, mut owner, link, workspace_id) = owned(&directory).await;
        let lead = a_role(
            &store,
            &owner,
            "Lead",
            permission::MEMBER_ROLE.mask
                | permission::mask_of(&[
                    Flag::InviteMember,
                    Flag::GrantWorkspace,
                    Flag::RenameMember,
                ]),
            permission::MANAGER,
        )
        .await;
        let clerk = a_role(&store, &owner, "Clerk", permission::MEMBER_ROLE.mask, &lead).await;
        let lena = holding_role(&store, &owner, &link, "lena", &lead, &workspace_id).await;
        let (sami, sami_session) =
            a_member(&store, &lena, &link, "sami", &clerk, &workspace_id).await;
        let issued = the_certificate(&store, &owner, &sami.member_id).await;
        let lead_rank = the_certificate(&store, &owner, &lena.member_id).await.rank;

        merged_role_row(
            &store,
            &owner,
            &clerk,
            permission::MEMBER_ROLE.mask,
            (lead_rank + permission::MANAGER_ROLE.rank) / 2,
        )
        .await;

        for machine in [
            &store,
            &another_machine(&directory, &owner.organization_id).await,
        ] {
            let row = machine
                .members(&owner.verifying_key)
                .await
                .expect("the directory reads after the merge")
                .into_iter()
                .find(|member| member.id == sami.member_id)
                .expect("sami's row");

            assert_eq!(row.effective, 0, "an uncovered row grants something");
            assert_eq!(row.role_id, clerk);
            assert_eq!(row.removed_at, None);
        }

        // sami acts with nothing, and the lead no longer acts on sami.
        assert_eq!(
            crate::organization::session::permissions_on_row(&store, &sami_session)
                .await
                .expect("sami's own row reads"),
            0
        );

        let rows_before = every_row(&store).await;
        let refused = crate::organization::invite::rename_member(
            &store,
            &lena,
            &sami.member_id,
            "sami.renamed",
            NOW + 2,
        )
        .await
        .expect_err("the lead renamed a member whose row is uncovered");

        assert_eq!(reason_of(&refused), RefusalReason::RoleUnsettled);
        assert_eq!(every_row(&store).await, rows_before);

        // and the certificate the lead issued stands as it was: nothing re-issued it from the row.
        let still = the_certificate(&store, &owner, &sami.member_id).await;

        assert_eq!(still.id, issued.id);
        assert_eq!(still.ceiling, issued.ceiling);

        // the owner's assignment does not save it, and the owner's removal is what stands.
        assert_eq!(
            reason_of(
                &assign_role(&store, &owner, &sami.member_id, &clerk, None, NOW + 3)
                    .await
                    .expect_err("an assignment saved an uncovered row")
            ),
            RefusalReason::RoleUnsettled
        );
        removal::remove_member(
            &store,
            &mut owner,
            no_platform(),
            "org-database",
            &sami.member_id,
            false,
            NOW + 4,
        )
        .await
        .expect("the owner removes sami");

        for machine in [
            &store,
            &another_machine(&directory, &owner.organization_id).await,
        ] {
            let row = member_row(machine, &owner, &sami.member_id).await;

            assert!(row.removed_at.is_some());
            assert!(row.covered);
            assert_eq!(row.effective, 0);
        }
    }

    /// **A removed member's row grants nothing, and a removal is never refused for what the
    /// member role carries** (finding C). The owner adds `deleteContract` to the member role and
    /// takes it off the manager's, and a manager still removes a member below them: the removed
    /// row holds the member role with no override, which the manager's certificate covers, and
    /// reads on every machine as removed and granting nothing.
    #[tokio::test]
    async fn a_removal_is_not_refused_for_a_flag_the_member_role_carries_and_the_removed_row_grants_nothing()
     {
        let directory = scratch("removal-member-role");
        let (store, owner, link, workspace_id) = owned(&directory).await;
        let mut manny = holding_role(
            &store,
            &owner,
            &link,
            "manny",
            permission::MANAGER,
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
        let delete_contract = permission::mask_of(&[Flag::DeleteContract]);

        set_role_mask(
            &store,
            &owner,
            permission::MEMBER,
            permission::MEMBER_ROLE.mask | delete_contract,
            NOW + 1,
        )
        .await
        .expect("the owner widens the member role");
        set_role_mask(
            &store,
            &owner,
            permission::MANAGER,
            permission::MANAGER_ROLE.mask & !delete_contract,
            NOW + 2,
        )
        .await
        .expect("the owner narrows the manager role");

        assert!(!permission::permits(
            the_certificate(&store, &owner, &manny.member_id)
                .await
                .ceiling,
            Flag::DeleteContract
        ));

        removal::remove_member(
            &store,
            &mut manny,
            no_platform(),
            "org-database",
            &sami.member_id,
            false,
            NOW + 3,
        )
        .await
        .expect("the manager removes a member below them");

        for machine in [
            &store,
            &another_machine(&directory, &owner.organization_id).await,
        ] {
            let row = machine
                .members(&owner.verifying_key)
                .await
                .expect("the directory reads")
                .into_iter()
                .find(|member| member.id == sami.member_id)
                .expect("sami's row");

            assert!(row.removed_at.is_some());
            assert_eq!(row.effective, 0, "a removed member's row grants something");
        }
    }

    /// **A manager with the default mask does every act below them** (the review of effort 838,
    /// round two): a role made, given, overridden, re-masked, renamed, moved and deleted, the
    /// member role widened, a member renamed, reset and removed, and the directory, the roles and
    /// the grants read on another machine after them, and again after the owner widens the member
    /// role.
    #[tokio::test]
    async fn a_manager_does_every_act_below_them_and_every_machine_reads_the_result() {
        let directory = scratch("manager-acts");
        let (store, owner, link, workspace_id) = owned(&directory).await;
        let mut manny = holding_role(
            &store,
            &owner,
            &link,
            "manny",
            permission::MANAGER,
            &workspace_id,
        )
        .await;
        let clerk = create_role(
            &store,
            &manny,
            "Clerk",
            permission::MEMBER_ROLE.mask
                | permission::mask_of(&[
                    Flag::DeletePayment,
                    Flag::InviteMember,
                    Flag::GrantWorkspace,
                ]),
            permission::MANAGER,
            NOW + 1,
        )
        .await
        .expect("the manager makes a role");
        let (sami, _) = a_member(
            &store,
            &manny,
            &link,
            "sami",
            permission::MEMBER,
            &workspace_id,
        )
        .await;

        assign_role(&store, &manny, &sami.member_id, &clerk.id, None, NOW + 2)
            .await
            .expect("the manager gives the role");
        set_override(
            &store,
            &manny,
            &sami.member_id,
            permission::mask_of(&[Flag::DeletePayment]),
            NOW + 3,
        )
        .await
        .expect("the manager sets an override");
        set_role_mask(
            &store,
            &manny,
            &clerk.id,
            clerk.mask | permission::mask_of(&[Flag::DeleteTenant]),
            NOW + 4,
        )
        .await
        .expect("the manager re-masks the role");
        set_role_mask(
            &store,
            &manny,
            permission::MEMBER,
            permission::MEMBER_ROLE.mask | permission::mask_of(&[Flag::DeleteComplex]),
            NOW + 4,
        )
        .await
        .expect("the manager widens the member role");
        rename_role(&store, &manny, &clerk.id, "Clerk II", NOW + 5)
            .await
            .expect("the manager renames the role");

        let other = create_role(
            &store,
            &manny,
            "Other",
            permission::MEMBER_ROLE.mask,
            permission::MANAGER,
            NOW + 5,
        )
        .await
        .expect("a second role");

        move_role(&store, &manny, &clerk.id, &other.id, NOW + 6)
            .await
            .expect("the manager moves the role");
        crate::organization::invite::rename_member(
            &store,
            &manny,
            &sami.member_id,
            "sami.renamed",
            NOW + 6,
        )
        .await
        .expect("the manager renames the member");
        crate::organization::invite::unset_password(
            &store,
            &manny,
            no_platform(),
            &sami.member_id,
            test_cost(),
            NOW + 7,
        )
        .await
        .expect("the manager resets the member");
        delete_role(&store, &manny, &other.id, NOW + 8)
            .await
            .expect("the manager deletes a role");
        removal::remove_member(
            &store,
            &mut manny,
            no_platform(),
            "org-database",
            &sami.member_id,
            false,
            NOW + 9,
        )
        .await
        .expect("the manager removes the member");

        let elsewhere = another_machine(&directory, &owner.organization_id).await;

        elsewhere
            .members(&owner.verifying_key)
            .await
            .expect("the members read elsewhere");
        elsewhere
            .roles(&owner.verifying_key)
            .await
            .expect("the roles read elsewhere");
        elsewhere
            .grants(&owner.verifying_key)
            .await
            .expect("the grants read elsewhere");

        set_role_mask(
            &store,
            &owner,
            permission::MEMBER,
            permission::MEMBER_ROLE.mask
                | permission::mask_of(&[Flag::DeleteComplex, Flag::DeleteUnit]),
            NOW + 10,
        )
        .await
        .expect("the owner widens the member role");
        another_machine(&directory, &owner.organization_id)
            .await
            .members(&owner.verifying_key)
            .await
            .expect("the members read after it");
    }

    /// **A custom role holding the member-administration flags does what they say** (the review
    /// of effort 838, round two): a lead invites a member, sets their override, renames, resets
    /// and removes them, and the directory reads on another machine.
    #[tokio::test]
    async fn a_custom_role_holding_the_member_administration_flags_does_what_they_say() {
        let directory = scratch("lead-acts");
        let (store, owner, link, workspace_id) = owned(&directory).await;
        let lead = a_role(
            &store,
            &owner,
            "Lead",
            permission::MEMBER_ROLE.mask
                | permission::mask_of(&[
                    Flag::InviteMember,
                    Flag::GrantWorkspace,
                    Flag::AssignRole,
                    Flag::OverrideMember,
                    Flag::RemoveMember,
                    Flag::RenameMember,
                    Flag::ResetPassword,
                ]),
            permission::MANAGER,
        )
        .await;
        let mut lena = holding_role(&store, &owner, &link, "lena", &lead, &workspace_id).await;
        let (sami, _) = a_member(
            &store,
            &lena,
            &link,
            "sami",
            permission::MEMBER,
            &workspace_id,
        )
        .await;

        set_override(
            &store,
            &lena,
            &sami.member_id,
            permission::mask_of(&[Flag::EditPayment]),
            NOW + 2,
        )
        .await
        .expect("the lead sets an override");
        crate::organization::invite::rename_member(
            &store,
            &lena,
            &sami.member_id,
            "sami.renamed",
            NOW + 3,
        )
        .await
        .expect("the lead renames the member");
        crate::organization::invite::unset_password(
            &store,
            &lena,
            no_platform(),
            &sami.member_id,
            test_cost(),
            NOW + 4,
        )
        .await
        .expect("the lead resets the member");
        removal::remove_member(
            &store,
            &mut lena,
            no_platform(),
            "org-database",
            &sami.member_id,
            false,
            NOW + 5,
        )
        .await
        .expect("the lead removes the member");

        another_machine(&directory, &owner.organization_id)
            .await
            .members(&owner.verifying_key)
            .await
            .expect("the members read elsewhere");
    }

    /// **A demotion written around the command never reads as the role it names** (criterion 9).
    /// A lead holding a member-administration flag, and a manager, each sign the owner's row and a
    /// manager's row naming the member role, around every command. A member row's signer must
    /// outrank the member as certified as well as the role the row names, so the store refuses to
    /// write either, and written around it, every other machine reads the demoted member with no
    /// permissions rather than as a member: the row is the only record of their role, and it is
    /// not one its signer could write. *Until then each read back as a member with the member
    /// role's mask.*
    #[tokio::test]
    async fn a_demotion_signed_by_one_who_does_not_outrank_the_member_never_reads_as_the_named_role()
     {
        let directory = scratch("demotion");
        let (store, owner, link, workspace_id) = owned(&directory).await;
        let lead = a_role(
            &store,
            &owner,
            "Lead",
            permission::MEMBER_ROLE.mask
                | permission::mask_of(&[Flag::InviteMember, Flag::GrantWorkspace]),
            permission::MANAGER,
        )
        .await;
        let lena = holding_role(&store, &owner, &link, "lena", &lead, &workspace_id).await;
        let manny = holding_role(
            &store,
            &owner,
            &link,
            "manny",
            permission::MANAGER,
            &workspace_id,
        )
        .await;
        let mona = holding_role(
            &store,
            &owner,
            &link,
            "mona",
            permission::MANAGER,
            &workspace_id,
        )
        .await;

        for (signer_session, victims) in
            [(&lena, vec![&owner, &manny]), (&manny, vec![&owner, &mona])]
        {
            let (key, certificate) = signer_of(&store, signer_session)
                .await
                .expect("the signer signs");
            let signer = Signer {
                key: &key,
                certificate: &certificate,
            };

            for victim in victims {
                let demoted = MemberRecord {
                    role_id: permission::MEMBER.to_string(),
                    override_mask: 0,
                    ..member_row(&store, &owner, &victim.member_id).await
                };
                let rows_before = every_row(&store).await;

                store
                    .write_member(&signer, &demoted)
                    .await
                    .expect_err("the store wrote a demotion from below");
                assert_eq!(every_row(&store).await, rows_before);

                store
                    .write_member_around_the_check(&signer, &demoted)
                    .await
                    .expect("written around the store");

                let read = another_machine(&directory, &owner.organization_id)
                    .await
                    .members(&owner.verifying_key)
                    .await;

                if let Ok(members) = read {
                    let row = members
                        .into_iter()
                        .find(|member| member.id == victim.member_id)
                        .expect("the demoted row");

                    assert_eq!(
                        row.effective, 0,
                        "{} read as the role a demotion from below named",
                        victim.member_id
                    );
                }
            }
        }
    }

    /// Sign `victim`'s row again under `forger`'s certificate, around the store, as the role given
    /// and removed where asked: a demotion written by somebody holding the credential.
    async fn demoted_around_the_store(
        store: &OrganizationStore,
        owner: &MemberSession,
        forger: &MemberSession,
        victim_id: &str,
        role_id: &str,
        removed_at: Option<i64>,
    ) {
        let (key, certificate) = signer_of(store, forger).await.expect("the forger signs");

        store
            .write_member_around_the_check(
                &Signer {
                    key: &key,
                    certificate: &certificate,
                },
                &MemberRecord {
                    role_id: role_id.to_string(),
                    override_mask: 0,
                    removed_at,
                    ..member_row(store, owner, victim_id).await
                },
            )
            .await
            .expect("written around the store");
    }

    /// **The owner's machine repairs a forged demotion of the owner's row at sign-in, with nobody
    /// acting.** A lead signs the owner's row naming the member role, and then removed, around the
    /// store; every other machine reads the owner with no permissions. The owner signs in on their
    /// own machine, which holds the root, and afterwards every machine reads the owner as the
    /// owner with every flag, the vault and the username as they were.
    #[tokio::test]
    async fn the_owners_machine_repairs_a_forged_demotion_of_the_owners_row_at_sign_in() {
        let directory = scratch("owner-repair");
        let (store, owner, link, workspace_id) = owned(&directory).await;
        let lead = a_role(
            &store,
            &owner,
            "Lead",
            permission::MEMBER_ROLE.mask
                | permission::mask_of(&[Flag::InviteMember, Flag::GrantWorkspace]),
            permission::MANAGER,
        )
        .await;
        let lena = holding_role(&store, &owner, &link, "lena", &lead, &workspace_id).await;
        let before = member_row(&store, &owner, &owner.member_id).await;

        for removed_at in [None, Some(NOW + 1)] {
            demoted_around_the_store(
                &store,
                &owner,
                &lena,
                &owner.member_id,
                permission::MEMBER,
                removed_at,
            )
            .await;

            assert_eq!(
                member_row(
                    &another_machine(&directory, &owner.organization_id).await,
                    &owner,
                    &owner.member_id
                )
                .await
                .effective,
                0
            );

            let signed_in = sign_in(
                &store,
                &joined_as(&owner, &owner.member_id, permission::OWNER),
                PASSWORD,
                &slot(),
            )
            .await
            .expect("the owner signs in");

            assert_eq!(signed_in.permissions, permission::OWNER_ROLE.mask);

            for machine in [
                &store,
                &another_machine(&directory, &owner.organization_id).await,
            ] {
                let row = member_row(machine, &owner, &owner.member_id).await;

                assert_eq!(row.role_id, permission::OWNER);
                assert_eq!(row.removed_at, None);
                assert_eq!(row.effective, permission::OWNER_ROLE.mask);
                assert_eq!(row.vault, before.vault);
                assert_eq!(row.username_sealed, before.username_sealed);
                assert_eq!(row.session_epoch, before.session_epoch);
            }
        }
    }

    /// **A non-owner's machine repairs nothing.** A lead signs a manager's own row naming the
    /// member role around the store. The manager signs in on their machine and still reads with
    /// no permissions: their vault does not derive the organization key, so their machine does not
    /// and cannot write the row, and the repair routine answers that it wrote nothing. The owner
    /// does not save it either, an assignment included, and removes the manager instead.
    #[tokio::test]
    async fn a_managers_machine_does_not_repair_their_own_demoted_row_and_the_owner_removes_them() {
        let directory = scratch("manager-no-repair");
        let (store, mut owner, link, workspace_id) = owned(&directory).await;
        let lead = a_role(
            &store,
            &owner,
            "Lead",
            permission::MEMBER_ROLE.mask
                | permission::mask_of(&[Flag::InviteMember, Flag::GrantWorkspace]),
            permission::MANAGER,
        )
        .await;
        let lena = holding_role(&store, &owner, &link, "lena", &lead, &workspace_id).await;
        let (invited, manny) = a_member(
            &store,
            &owner,
            &link,
            "manny",
            permission::MEMBER,
            &workspace_id,
        )
        .await;

        assign_role(
            &store,
            &owner,
            &manny.member_id,
            permission::MANAGER,
            None,
            NOW,
        )
        .await
        .expect("manny is a manager");
        demoted_around_the_store(
            &store,
            &owner,
            &lena,
            &manny.member_id,
            permission::MEMBER,
            None,
        )
        .await;

        let rows_before = every_row(&store).await;
        let signed_in = sign_in(
            &store,
            &joined_as(&owner, &manny.member_id, permission::MANAGER),
            &secret_of(&invited),
            &slot(),
        )
        .await
        .expect("manny signs in");

        assert_eq!(signed_in.permissions, 0);
        assert!(
            !super::repair_owner_row(
                &store,
                &owner.verifying_key,
                &manny.member_id,
                &signed_in.secret,
                NOW + 1,
            )
            .await
            .expect("the repair answers")
        );
        assert_eq!(
            every_row(&store).await,
            rows_before,
            "a manager's machine wrote"
        );
        assert_eq!(
            member_row(&store, &owner, &manny.member_id).await.effective,
            0
        );

        assert_eq!(
            reason_of(
                &assign_role(
                    &store,
                    &owner,
                    &manny.member_id,
                    permission::MANAGER,
                    None,
                    NOW + 2,
                )
                .await
                .expect_err("the owner saved an uncovered row")
            ),
            RefusalReason::RoleUnsettled
        );
        removal::remove_member(
            &store,
            &mut owner,
            no_platform(),
            "org-database",
            &manny.member_id,
            false,
            NOW + 3,
        )
        .await
        .expect("the owner removes manny");

        let row = member_row(
            &another_machine(&directory, &owner.organization_id).await,
            &owner,
            &manny.member_id,
        )
        .await;

        assert!(row.removed_at.is_some());
        assert_eq!(row.effective, 0);
    }

    // -------------------------------------------------------------------------------------
    // Effort 838, the re-check of ticket 20: an uncovered member row is never saved, only removed.
    // -------------------------------------------------------------------------------------

    /// The refusal an act on a member whose row is uncovered meets, or a panic naming what came
    /// back instead.
    fn unsettled<T: std::fmt::Debug>(outcome: Result<T, Error>, act: &str) {
        let refusal = outcome.expect_err(act);

        assert_eq!(
            reason_of(&refusal),
            RefusalReason::RoleUnsettled,
            "{act}: {refusal:?}"
        );
    }

    /// The owner removes a member, the ordinary removal.
    async fn removed_by(store: &OrganizationStore, remover: &mut MemberSession, member_id: &str) {
        removal::remove_member(
            store,
            remover,
            no_platform(),
            "org-database",
            member_id,
            false,
            NOW + 50,
        )
        .await
        .unwrap_or_else(|error| panic!("{member_id} was not removed: {error:?}"));
    }

    /// A member's row as every machine reads it once they are removed: removed, covered, granting
    /// nothing.
    async fn reads_removed(directory: &std::path::Path, owner: &MemberSession, member_id: &str) {
        let row = member_row(
            &another_machine(directory, &owner.organization_id).await,
            owner,
            member_id,
        )
        .await;

        assert!(row.removed_at.is_some(), "{member_id} is not removed");
        assert!(row.covered, "{member_id}'s removal is not covered");
        assert_eq!(row.effective, 0);
    }

    /// A lead: the member role's flags with `inviteMember` and `grantWorkspace`, below the
    /// manager, signed in.
    async fn a_lead(
        store: &OrganizationStore,
        owner: &MemberSession,
        link: &Locator,
        workspace_id: &str,
    ) -> MemberSession {
        let lead = a_role(
            store,
            owner,
            "Lead",
            permission::MEMBER_ROLE.mask
                | permission::mask_of(&[Flag::InviteMember, Flag::GrantWorkspace]),
            permission::MANAGER,
        )
        .await;

        holding_role(store, owner, link, "lena", &lead, workspace_id).await
    }

    /// **A forged promotion is not laundered, by a rename or an assignment** (the review's first
    /// probe). A lead signs sami's row naming Senior, a role above the lead carrying
    /// `deleteContract`, around the store; it reads uncovered. A manager lacking the flag renames
    /// sami, and assigns them Senior or the member role, and the owner assigns them the member
    /// role: every one is refused by name and writes nothing, so sami never holds the flag. The
    /// owner's rename of a lead's forged "manager" row is refused the same way. Each is removed.
    #[tokio::test]
    async fn a_forged_promotion_is_never_saved_by_any_act_and_is_removed() {
        let directory = scratch("launder");
        let (store, mut owner, link, workspace_id) = owned(&directory).await;
        let delete_contract = permission::mask_of(&[Flag::DeleteContract]);

        set_role_mask(
            &store,
            &owner,
            permission::MANAGER,
            permission::MANAGER_ROLE.mask & !delete_contract,
            NOW,
        )
        .await
        .expect("the owner narrows the manager");

        // the lead first, so Senior, made after it directly below the manager, ranks above it.
        let lena = a_lead(&store, &owner, &link, &workspace_id).await;
        let senior = a_role(
            &store,
            &owner,
            "Senior",
            permission::MEMBER_ROLE.mask | delete_contract,
            permission::MANAGER,
        )
        .await;
        let manny = holding_role(
            &store,
            &owner,
            &link,
            "manny",
            permission::MANAGER,
            &workspace_id,
        )
        .await;
        let (sami, _) = a_member(
            &store,
            &owner,
            &link,
            "sami",
            permission::MEMBER,
            &workspace_id,
        )
        .await;
        let (tess, _) = a_member(
            &store,
            &owner,
            &link,
            "tess",
            permission::MEMBER,
            &workspace_id,
        )
        .await;

        demoted_around_the_store(&store, &owner, &lena, &sami.member_id, &senior, None).await;
        demoted_around_the_store(
            &store,
            &owner,
            &lena,
            &tess.member_id,
            permission::MANAGER,
            None,
        )
        .await;
        assert!(!member_row(&store, &owner, &sami.member_id).await.covered);
        assert!(!member_row(&store, &owner, &tess.member_id).await.covered);

        let rows_before = every_row(&store).await;

        unsettled(
            crate::organization::invite::rename_member(
                &store,
                &manny,
                &sami.member_id,
                "sami.renamed",
                NOW + 2,
            )
            .await,
            "a manager's rename of a forged promotion",
        );
        unsettled(
            assign_role(&store, &manny, &sami.member_id, &senior, None, NOW + 2).await,
            "a manager's assignment of the forged role",
        );
        unsettled(
            assign_role(
                &store,
                &manny,
                &sami.member_id,
                permission::MEMBER,
                None,
                NOW + 2,
            )
            .await,
            "a manager's assignment of the member role",
        );
        unsettled(
            assign_role(
                &store,
                &owner,
                &sami.member_id,
                permission::MEMBER,
                None,
                NOW + 2,
            )
            .await,
            "the owner's assignment",
        );
        unsettled(
            crate::organization::invite::rename_member(
                &store,
                &owner,
                &tess.member_id,
                "tess.renamed",
                NOW + 2,
            )
            .await,
            "the owner's rename of a forged manager row",
        );
        assert_eq!(every_row(&store).await, rows_before, "a refusal wrote");
        assert!(!permission::permits(
            member_row(
                &another_machine(&directory, &owner.organization_id).await,
                &owner,
                &sami.member_id
            )
            .await
            .effective,
            Flag::DeleteContract
        ));

        removed_by(&store, &mut owner, &sami.member_id).await;
        removed_by(&store, &mut owner, &tess.member_id).await;
        reads_removed(&directory, &owner, &sami.member_id).await;
        reads_removed(&directory, &owner, &tess.member_id).await;
    }

    /// **A row naming a role that is gone is refused every act and removed** (the review's second
    /// probe). The owner deletes Clerk on one machine while a lead's row giving sami Clerk merges
    /// in from another; the row reads uncovered. A rename and an assignment are refused by name,
    /// and the owner removes sami.
    #[tokio::test]
    async fn a_row_naming_a_role_that_is_gone_is_refused_every_act_and_removed() {
        let directory = scratch("gone-role");
        let (store, mut owner, link, workspace_id) = owned(&directory).await;
        let lead = a_role(
            &store,
            &owner,
            "Lead",
            permission::MEMBER_ROLE.mask
                | permission::mask_of(&[
                    Flag::InviteMember,
                    Flag::GrantWorkspace,
                    Flag::AssignRole,
                ]),
            permission::MANAGER,
        )
        .await;
        let clerk = a_role(&store, &owner, "Clerk", permission::MEMBER_ROLE.mask, &lead).await;
        let lena = holding_role(&store, &owner, &link, "lena", &lead, &workspace_id).await;
        let (sami, _) = a_member(&store, &lena, &link, "sami", &clerk, &workspace_id).await;
        let lenas_row = member_row(&store, &owner, &sami.member_id).await;

        delete_role(&store, &owner, &clerk, NOW + 1)
            .await
            .expect("the owner deletes the clerk role");

        let (key, certificate) = signer_of(&store, &lena).await.expect("lena signs");

        store
            .write_member_around_the_check(
                &Signer {
                    key: &key,
                    certificate: &certificate,
                },
                &MemberRecord {
                    updated_at: NOW + 5,
                    ..lenas_row
                },
            )
            .await
            .expect("the lead's row merges in");
        assert!(!member_row(&store, &owner, &sami.member_id).await.covered);

        unsettled(
            crate::organization::invite::rename_member(
                &store,
                &owner,
                &sami.member_id,
                "sami.renamed",
                NOW + 6,
            )
            .await,
            "the owner's rename of a row naming a role that is gone",
        );
        unsettled(
            assign_role(
                &store,
                &owner,
                &sami.member_id,
                permission::MEMBER,
                None,
                NOW + 7,
            )
            .await,
            "the owner's assignment over a role that is gone",
        );

        removed_by(&store, &mut owner, &sami.member_id).await;
        reads_removed(&directory, &owner, &sami.member_id).await;
    }

    /// **A removal written from below reads as removed and is not lifted** (the review's third
    /// probe). A lead signs a manager's row as removed around the store: it reads uncovered and
    /// removed, fail-safe, so the manager is refused at sign-in. The owner's assignment of the
    /// manager role is refused by name, and the owner removes the manager, which stands as a
    /// removal the owner wrote.
    #[tokio::test]
    async fn a_removal_written_from_below_reads_as_removed_and_is_not_lifted() {
        let directory = scratch("removal-from-below");
        let (store, mut owner, link, workspace_id) = owned(&directory).await;
        let lena = a_lead(&store, &owner, &link, &workspace_id).await;
        let (invited, manny) = a_member(
            &store,
            &owner,
            &link,
            "manny",
            permission::MEMBER,
            &workspace_id,
        )
        .await;

        assign_role(
            &store,
            &owner,
            &manny.member_id,
            permission::MANAGER,
            None,
            NOW,
        )
        .await
        .expect("manny is a manager");
        demoted_around_the_store(
            &store,
            &owner,
            &lena,
            &manny.member_id,
            permission::MANAGER,
            Some(NOW + 1),
        )
        .await;

        let row = member_row(&store, &owner, &manny.member_id).await;

        assert!(row.removed_at.is_some() && !row.covered);
        assert_eq!(row.effective, 0);

        let joined = joined_as(&owner, &manny.member_id, permission::MANAGER);

        assert_eq!(
            reason_of(
                &sign_in(&store, &joined, &secret_of(&invited), &slot())
                    .await
                    .expect_err("a member removed from below signed in")
            ),
            RefusalReason::YouWereRemoved
        );
        unsettled(
            assign_role(
                &store,
                &owner,
                &manny.member_id,
                permission::MANAGER,
                None,
                NOW + 2,
            )
            .await,
            "the owner's assignment over a removal from below",
        );

        removed_by(&store, &mut owner, &manny.member_id).await;
        reads_removed(&directory, &owner, &manny.member_id).await;
    }

    /// **A covered removal a forger re-signs is not lifted** (the re-check's fourth probe). The
    /// owner removes sami; a lead signs sami's row again naming the manager role and keeping the
    /// removal, around the store. It reads uncovered and removed; the owner's assignment is
    /// refused by name, sami still cannot sign in, and the owner removes sami again, which stands.
    #[tokio::test]
    async fn a_covered_removal_a_forger_re_signs_is_not_lifted() {
        let directory = scratch("removal-re-signed");
        let (store, mut owner, link, workspace_id) = owned(&directory).await;
        let lena = a_lead(&store, &owner, &link, &workspace_id).await;
        let (invited, sami) = a_member(
            &store,
            &owner,
            &link,
            "sami",
            permission::MEMBER,
            &workspace_id,
        )
        .await;

        removed_by(&store, &mut owner, &sami.member_id).await;

        let removed_at = member_row(&store, &owner, &sami.member_id).await.removed_at;

        demoted_around_the_store(
            &store,
            &owner,
            &lena,
            &sami.member_id,
            permission::MANAGER,
            removed_at,
        )
        .await;

        let row = member_row(&store, &owner, &sami.member_id).await;

        assert!(row.removed_at.is_some() && !row.covered);

        unsettled(
            assign_role(
                &store,
                &owner,
                &sami.member_id,
                permission::MEMBER,
                None,
                NOW + 2,
            )
            .await,
            "the owner's assignment over a re-signed removal",
        );

        let joined = joined_as(&owner, &sami.member_id, permission::MEMBER);

        assert_eq!(
            reason_of(
                &sign_in(&store, &joined, &secret_of(&invited), &slot())
                    .await
                    .expect_err("a removed member signed in")
            ),
            RefusalReason::YouWereRemoved
        );

        removed_by(&store, &mut owner, &sami.member_id).await;
        reads_removed(&directory, &owner, &sami.member_id).await;
    }

    /// **A signing key a forger puts on a row is never certified** (the re-check's fifth probe). A
    /// lead signs a manager's row naming the member role with a signing key the lead generated,
    /// around the store. The owner's assignment of the manager role is refused by name, so no
    /// certificate names the forger's key; the owner removes the manager, whose certificates are
    /// revoked, and none that lives names it either.
    #[tokio::test]
    async fn a_signing_key_a_forger_puts_on_a_row_is_never_certified() {
        let directory = scratch("forged-key");
        let (store, mut owner, link, workspace_id) = owned(&directory).await;
        let lena = a_lead(&store, &owner, &link, &workspace_id).await;
        let manny = holding_role(
            &store,
            &owner,
            &link,
            "manny",
            permission::MANAGER,
            &workspace_id,
        )
        .await;
        let forger = AdministratorKey::generate().expect("a key");
        let (key, certificate) = signer_of(&store, &lena).await.expect("lena signs");

        store
            .write_member_around_the_check(
                &Signer {
                    key: &key,
                    certificate: &certificate,
                },
                &MemberRecord {
                    role_id: permission::MEMBER.to_string(),
                    override_mask: 0,
                    signing_public_key: forger.verifying_key(),
                    ..member_row(&store, &owner, &manny.member_id).await
                },
            )
            .await
            .expect("written around the store");

        unsettled(
            assign_role(
                &store,
                &owner,
                &manny.member_id,
                permission::MANAGER,
                None,
                NOW + 2,
            )
            .await,
            "the owner's assignment over a forged signing key",
        );

        let names_the_forger = |certificates: Vec<Certificate>| {
            certificates
                .iter()
                .any(|certificate| certificate.signing_public_key == forger.verifying_key())
        };

        assert!(!names_the_forger(
            store
                .live_certificates(&owner.verifying_key, &manny.member_id)
                .await
                .expect("the certificates")
        ));

        removed_by(&store, &mut owner, &manny.member_id).await;
        reads_removed(&directory, &owner, &manny.member_id).await;
        assert!(
            store
                .live_certificates(&owner.verifying_key, &manny.member_id)
                .await
                .expect("the certificates")
                .is_empty()
        );
        assert!(!names_the_forger(
            store.certificates().await.expect("every certificate")
        ));
    }

    /// **A covered removal is not undone by an assignment, and an uncovered row can be removed.**
    /// The owner removes sami, and assigning sami a role is refused as a removed member; a row a
    /// lead's forged promotion left uncovered is removed by the owner, who outranks the member as
    /// certified, and reads removed on every machine.
    #[tokio::test]
    async fn a_covered_removal_is_not_undone_by_an_assignment_and_an_uncovered_row_can_be_removed()
    {
        let directory = scratch("covered-removal");
        let (store, mut owner, link, workspace_id) = owned(&directory).await;
        let lena = a_lead(&store, &owner, &link, &workspace_id).await;
        let (sami, _) = a_member(
            &store,
            &owner,
            &link,
            "sami",
            permission::MEMBER,
            &workspace_id,
        )
        .await;
        let (tess, _) = a_member(
            &store,
            &owner,
            &link,
            "tess",
            permission::MEMBER,
            &workspace_id,
        )
        .await;

        removed_by(&store, &mut owner, &sami.member_id).await;

        let refusal = assign_role(
            &store,
            &owner,
            &sami.member_id,
            permission::MEMBER,
            None,
            NOW + 2,
        )
        .await
        .expect_err("an assignment undid a removal");

        assert_eq!(reason_of(&refusal), RefusalReason::MemberRemoved);

        demoted_around_the_store(
            &store,
            &owner,
            &lena,
            &tess.member_id,
            permission::MANAGER,
            None,
        )
        .await;
        removed_by(&store, &mut owner, &tess.member_id).await;
        reads_removed(&directory, &owner, &tess.member_id).await;
    }

    /// **Retiring a certificate that signed an uncovered row waits for that member's removal.** A
    /// lead signs sami's row naming a role above the lead, around the store; the owner's removal of
    /// the lead, which would sign the lead's rows again under the owner's root, is refused by
    /// name, saying to remove sami first, and writes nothing, since the root covers every role and
    /// would make the forged one real. Once the owner removes sami, the lead's removal goes.
    #[tokio::test]
    async fn retiring_a_certificate_that_signed_an_uncovered_row_waits_for_that_members_removal() {
        let directory = scratch("resign-uncovered");
        let (store, mut owner, link, workspace_id) = owned(&directory).await;
        let lena = a_lead(&store, &owner, &link, &workspace_id).await;
        let senior = a_role(
            &store,
            &owner,
            "Senior",
            permission::MEMBER_ROLE.mask | permission::mask_of(&[Flag::DeleteContract]),
            permission::MANAGER,
        )
        .await;
        let (sami, _) = a_member(
            &store,
            &owner,
            &link,
            "sami",
            permission::MEMBER,
            &workspace_id,
        )
        .await;

        demoted_around_the_store(&store, &owner, &lena, &sami.member_id, &senior, None).await;
        assert!(!member_row(&store, &owner, &sami.member_id).await.covered);

        let rows_before = every_row(&store).await;
        let refusal = removal::remove_member(
            &store,
            &mut owner,
            no_platform(),
            "org-database",
            &lena.member_id,
            false,
            NOW + 2,
        )
        .await
        .expect_err("a removal re-signed an uncovered row");

        assert_eq!(reason_of(&refusal), RefusalReason::RoleUnsettled);
        assert!(
            refusal.to_string().contains("removes them first"),
            "{refusal}"
        );
        assert_eq!(every_row(&store).await, rows_before, "a refusal wrote");

        removed_by(&store, &mut owner, &sami.member_id).await;
        removed_by(&store, &mut owner, &lena.member_id).await;
        reads_removed(&directory, &owner, &sami.member_id).await;
        reads_removed(&directory, &owner, &lena.member_id).await;
    }

    /// **The owner's repair takes the owner's own keys, never the row's** (the re-check of ticket
    /// 20). A lead signs the owner's row naming the member role with a signing key the lead
    /// generated and an offer's seal, around the store. The owner signs in, and the repaired row,
    /// on every machine, names the key the owner's root certificate names, the vault's public half
    /// the owner's secret opens, and no seal.
    #[tokio::test]
    async fn the_owners_repair_takes_the_owners_own_keys_and_never_the_rows() {
        let directory = scratch("owner-repair-keys");
        let (store, owner, link, workspace_id) = owned(&directory).await;
        let lena = a_lead(&store, &owner, &link, &workspace_id).await;
        let root = the_certificate(&store, &owner, &owner.member_id).await;
        let forger = AdministratorKey::generate().expect("a key");
        let (key, certificate) = signer_of(&store, &lena).await.expect("lena signs");

        assert!(root.is_root());

        store
            .write_member_around_the_check(
                &Signer {
                    key: &key,
                    certificate: &certificate,
                },
                &MemberRecord {
                    role_id: permission::MEMBER.to_string(),
                    signing_public_key: forger.verifying_key(),
                    owner_seed_sealed: Some(b"a seal of the forger's".to_vec()),
                    ..member_row(&store, &owner, &owner.member_id).await
                },
            )
            .await
            .expect("written around the store");

        let signed_in = sign_in(
            &store,
            &joined_as(&owner, &owner.member_id, permission::OWNER),
            PASSWORD,
            &slot(),
        )
        .await
        .expect("the owner signs in");

        for machine in [
            &store,
            &another_machine(&directory, &owner.organization_id).await,
        ] {
            let row = member_row(machine, &owner, &owner.member_id).await;

            assert_eq!(row.role_id, permission::OWNER);
            assert_eq!(row.signing_public_key, root.signing_public_key);
            assert_ne!(row.signing_public_key, forger.verifying_key());
            assert_eq!(row.vault.public_key, signed_in.secret.public_key());
            assert_eq!(row.owner_seed_sealed, None);
        }
    }
}
