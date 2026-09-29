//! the change from format 1, every organization made before effort 838, to format 2, the chain
//! of certificates and the roles as rows (effort 838, requirement 11 as the human amended it on
//! 2026-09-26, tickets 22 to 25). What runs it, and what every change of format shares, is
//! `runner/`; where it sits in the order is [`super::TRANSITIONS`]. *This format*, below, is
//! format 2, the one the change arrives at.
//!
//! **It refuses a directory that holds a root** ([`holds_a_root`], ticket 25): a root certificate
//! the organization key signed is what only an organization of format 2 holds, so one that holds
//! a root and still carries format 1 has been made to look older, from rows a member can put
//! back, and nothing is transformed.
//!
//! **What each member keeps is exactly what they could do** ([`carried_by`](plan::carried_by)): the old seven acts,
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
//! was given, so the row reads like any other. One that reaches past that ceiling is left out of
//! the read and logged, as every workspace, grant, invitation and mark row that does not verify is
//! (`store::signature::read_or_left_out`, ticket 25), and the rows beside it still read.
//!
//! **The upgrade is a list of steps, in order, and each tolerates the shape it finds** (ticket
//! 23): the reshape runs only the statements the table still needs, every row is written by its
//! key so a second write is the same row, and the rows are judged under whichever format signed
//! them. So an upgrade cut short anywhere, on this machine or on the remote, is finished by the
//! owner's next sign-in, resume or connect from any machine, and nothing is run twice ([`planned`]
//! gives the order).
//! Format 1's certificate table goes last, before the `format` row the runner writes, so every row
//! of that format can be judged until then, and the role word and the mask a cut-short reshape
//! dropped are found again from the signature over them.

use crate::{
    error::Error,
    organization::{
        authority::{Chain, FormatOneCertificate, VERIFYING_KEY_BYTES},
        member::vault::MemberSecretKey,
        role::permission::{self},
        store::{
            FormatOneMemberRow, GrantRecord, OrganizationStore, grant_authority, install_format_two,
        },
    },
};

use super::{
    Pending, Sought, Transition, Unjudged, Upgrading,
    runner::signing_key_of,
    signature::{FormatOneMember, FormatOneRow, verify_format_one},
};

mod plan;

use plan::{Judge, applied, planned};

/// The change from format 1, as [`super::TRANSITIONS`] lists it.
pub(crate) const TRANSITION: Transition = Transition {
    from: 1,
    name: "format 1 to 2",
    members,
    signed_as_its_own: own,
    grant,
    refused,
    run,
    built,
    kept: &["organization_mark"],
};

/// A fresh organization of format 2: every table of this build's schema but what a later format
/// added. Only the last change's is read (`runner/`), so it is read where a walk ends at format
/// 2, as a test seeding an organization of format 2 walks (`three.rs`), and never where
/// a walk goes on. *It was the schema this build installs until format 3 added a table to it.*
fn built(connection: &turso::Connection) -> Pending<'_, ()> {
    Box::pin(install_format_two(connection))
}

/// Every member row as it lies, read with whichever authority columns the table has now, so a
/// table of format 1, one part way through the reshape, and one of format 2 all read.
fn members(store: &OrganizationStore) -> Pending<'_, Vec<Unjudged>> {
    Box::pin(async move {
        Ok(store
            .format_one_members()
            .await?
            .into_iter()
            .map(|member| Unjudged {
                id: member.id,
                username_sealed: member.username_sealed,
                vault: member.vault,
                sealed_content_key: member.sealed_content_key,
                session_epoch: member.session_epoch,
            })
            .collect())
    })
}

/// Whether the row of the member sought is signed as its own ([`signed_as_its_own`]).
fn own<'a>(sought: &'a Sought<'a>, secret: &'a MemberSecretKey) -> Pending<'a, bool> {
    Box::pin(async move {
        let certificates = sought.store.format_one_certificates().await?;

        Ok(sought
            .store
            .format_one_members()
            .await?
            .iter()
            .filter(|member| member.id == sought.member_id)
            .any(|member| signed_as_its_own(sought.key, &certificates, member, secret)))
    })
}

/// The grant of the member sought on the organization database `organization_id`, where one
/// verifies under the rules of the format that signed it ([`Judge::row`]).
///
/// `owners_signing_key` is the owner's, where the member sought is the owner: their certificate
/// is judged by its key alone, so an unsigned `revoked_at` on it revokes nothing.
fn grant<'a>(
    sought: &'a Sought<'a>,
    organization_id: &'a str,
    owners_signing_key: Option<&'a [u8; VERIFYING_KEY_BYTES]>,
) -> Pending<'a, Option<GrantRecord>> {
    Box::pin(async move {
        let store = sought.store;
        let directory = store.format_one_directory().await?;
        let (certificates, revocations) = store.chain_rows_if_any().await?;
        let role_rows = store.role_rows_if_any().await?;
        let judge = Judge::new(
            sought.key,
            &directory,
            owners_signing_key,
            &certificates,
            &revocations,
            &role_rows,
        );

        Ok(directory
            .grants
            .iter()
            .find(|grant| {
                grant.record.member_id == sought.member_id
                    && grant.record.workspace_id == organization_id
            })
            .filter(|grant| {
                judge
                    .row(
                        &grant.certificate_id,
                        grant_authority(&grant.record),
                        &grant.signature,
                    )
                    .is_ok()
            })
            .map(|grant| grant.record.clone()))
    })
}

/// Why a directory as it stands is not transformed, where it is not: one that holds a root.
fn refused<'a>(upgrading: &'a Upgrading<'a>) -> Pending<'a, Option<&'static str>> {
    Box::pin(async move {
        Ok(holds_a_root(upgrading.store, upgrading.key)
            .await?
            .then_some("the organization holds a root certificate the organization key signed"))
    })
}

/// The change [`planned`] over the directory as it stands and [`applied`], inside the runner's
/// transaction.
fn run<'a>(upgrading: &'a Upgrading<'a>) -> Pending<'a, ()> {
    Box::pin(async move {
        let plan = planned(
            upgrading.store,
            upgrading.organization_key,
            upgrading.signing_key,
            upgrading.opened,
            upgrading.now,
        )
        .await?;

        applied(
            upgrading.store,
            upgrading.signing_key,
            plan.root.as_ref(),
            &plan.steps,
        )
        .await
    })
}

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
pub(crate) const FORMAT_ONE_ACTS: i64 = 0b111_1111;

/// The act format 1 called `changeRole`, which this format splits in two.
const FORMAT_ONE_CHANGE_ROLE: i64 = 1 << 2;

/// Whether `member`'s format 1 signature is its own member's: made under the format 1
/// certificate `key` issued to that very row, naming the signing key `secret` derives, with that
/// certificate's unsigned `revoked_at` not read, as the owner's never is.
fn signed_as_its_own(
    key: &[u8; VERIFYING_KEY_BYTES],
    certificates: &[FormatOneCertificate],
    member: &FormatOneMemberRow,
    secret: &MemberSecretKey,
) -> bool {
    let Ok(signing_key) = signing_key_of(secret) else {
        return false;
    };
    let signing_public_key = signing_key.verifying_key();

    certificates
        .iter()
        .filter(|certificate| {
            certificate.id == member.certificate_id
                && certificate.member_id == member.id
                && certificate.signing_public_key == signing_public_key
        })
        .any(|certificate| {
            format_one_signature(
                key,
                &FormatOneCertificate {
                    revoked_at: None,
                    ..certificate.clone()
                },
                member,
            )
            .is_ok()
        })
}

/// The role word and the seven-act mask a format 1 member row's signature was made over under
/// `certificate`, or why none was.
///
/// The row's own columns where they stand; where a reshape cut short dropped either, the one value
/// the signature was made over is found by trying each value format 1 could have written, which
/// are four words and a hundred and twenty-eight masks.
fn format_one_signature(
    key: &[u8; VERIFYING_KEY_BYTES],
    certificate: &FormatOneCertificate,
    member: &FormatOneMemberRow,
) -> Result<(String, i64), Error> {
    let roles = match member.role.as_deref() {
        Some(role) => vec![role],
        None => FORMAT_ONE_ROLES.to_vec(),
    };
    let masks = match member.permissions {
        Some(permissions) => permissions..=permissions,
        None => 0..=FORMAT_ONE_ACTS,
    };
    let mut refusal = None;

    for role in roles {
        for permissions in masks.clone() {
            match verify_format_one(
                key,
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
                Ok(()) => return Ok((role.to_string(), permissions)),
                Err(error) => {
                    refusal.get_or_insert(error);
                }
            }
        }
    }

    Err(refusal.unwrap_or_else(|| Error::Integrity {
        message: "no role word verified".to_string(),
    }))
}

/// Whether the organization holds a root certificate, one the organization key `key` signed:
/// what only an organization of this format holds, since only its owner's upgrade or its first run
/// writes one.
async fn holds_a_root(
    store: &OrganizationStore,
    key: &[u8; VERIFYING_KEY_BYTES],
) -> Result<bool, Error> {
    let (certificates, revocations) = store.chain_rows_if_any().await?;

    Ok(Chain::new(key, &certificates, &revocations).holds_a_root())
}
