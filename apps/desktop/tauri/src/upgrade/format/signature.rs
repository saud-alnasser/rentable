//! what an organization made before effort 838 signed, and how that format judged a row: read once,
//! by the owner's upgrade (effort 838, ticket 22), and by nothing else.
//!
//! **The preimages and the rules are format 1's; the checks are the chain's.** What each signature
//! was made over is built here, byte for byte as the build before effort 838 built it, and the two
//! signature checks and the revocation are `organization/authority/`'s, made in one call
//! (`authority::verify_older_row`) so that the certificate behind a row is never skipped. The
//! certificate itself, as the store reads it off format 1's table, is
//! `authority::FormatOneCertificate`, which is what the store hands the upgrade.
//!
//! *It was the foot of `organization/authority.rs` until effort 840 (ticket 48) moved it here, with
//! everything else that brings an older install forward.*

use crate::{
    error::Error,
    organization::authority::{
        Authority, FormatOneCertificate, VERIFYING_KEY_BYTES, field, preimage, verify_older_row,
    },
};

#[cfg(test)]
use crate::organization::authority::{AdministratorKey, OrganizationKey};

/// What the organization key signed when it issued a certificate in format 1.
const FORMAT_ONE_CERTIFICATE_DOMAIN: &[u8] = b"rentable.organization.authority.certificate.v1";

/// What a member row carried under signature in format 1.
const FORMAT_ONE_MEMBER_DOMAIN: &[u8] = b"rentable.organization.authority.member.v2";

/// What a `member` row put under signature in format 1 (`member.v2`): the keys, the role word and
/// the seven-act mask, and the offer's seal only where one stood.
#[derive(Clone, Copy, Debug)]
pub struct FormatOneMember<'a> {
    pub public_key: &'a [u8],
    pub signing_public_key: &'a [u8],
    pub role: &'a str,
    pub permissions: i64,
    pub owner_seed_sealed: Option<&'a [u8]>,
}

/// One signed row of a format 1 organization: a member row in its own shape, or a row whose
/// preimage has not changed since (a workspace, a grant, an invitation or the mark).
#[derive(Clone, Copy, Debug)]
pub enum FormatOneRow<'a> {
    Member(FormatOneMember<'a>),
    Unchanged(Authority<'a>),
}

/// Whether a row of a format 1 organization is genuine, as that format judged it: signed by the
/// key its certificate names, that certificate signed by the key the caller pinned, and the
/// certificate not revoked (effort 838, ticket 22).
///
/// **The verifier the upgrade reads the old directory through, and the only one**: a row this
/// refuses is not carried into the new format. It asks nothing about what the row says, because
/// format 1 asked nothing either; what a member could do is read off the row once it is genuine.
/// A role row names no format 1 row, and is refused.
pub fn verify_format_one(
    organization_verifying_key: &[u8; VERIFYING_KEY_BYTES],
    certificate: &FormatOneCertificate,
    row: FormatOneRow<'_>,
    signature: &[u8],
) -> Result<(), Error> {
    if matches!(row, FormatOneRow::Unchanged(Authority::Role(_))) {
        return Err(Error::Integrity {
            message: "an organization of format 1 holds no role rows".to_string(),
        });
    }

    if matches!(
        row,
        FormatOneRow::Unchanged(Authority::WorkspaceOverride(_))
    ) {
        return Err(Error::Integrity {
            message: "an organization of format 1 holds no workspace overrides".to_string(),
        });
    }

    verify_older_row(
        organization_verifying_key,
        &certificate.signing_public_key,
        (&format_one_preimage(&certificate.id, row), signature),
        (
            &format_one_certificate_preimage(certificate),
            &certificate.signature_by_organization_key,
        ),
        certificate.revoked_at.is_some(),
    )
}

/// Issue a format 1 certificate, as the build before effort 838 did: for a test building an
/// organization of that format.
#[cfg(test)]
pub(crate) fn issue_format_one_certificate(
    organization_key: &OrganizationKey,
    id: &str,
    member_id: &str,
    signing_public_key: &[u8; VERIFYING_KEY_BYTES],
    issued_at: &str,
) -> FormatOneCertificate {
    let mut certificate = FormatOneCertificate {
        id: id.to_string(),
        member_id: member_id.to_string(),
        signing_public_key: *signing_public_key,
        signature_by_organization_key: Vec::new(),
        issued_at: issued_at.to_string(),
        revoked_at: None,
    };

    certificate.signature_by_organization_key =
        organization_key.signed(&format_one_certificate_preimage(&certificate));

    certificate
}

/// Sign a row as the build before effort 838 did: for a test building an organization of that
/// format.
#[cfg(test)]
pub(crate) fn sign_format_one(
    key: &AdministratorKey,
    certificate: &FormatOneCertificate,
    row: FormatOneRow<'_>,
) -> Vec<u8> {
    key.signed(&format_one_preimage(&certificate.id, row))
}

/// What a format 1 row signed: `member.v2` for a member, and today's preimage for the rest, which
/// has not changed since.
fn format_one_preimage(certificate_id: &str, row: FormatOneRow<'_>) -> Vec<u8> {
    let FormatOneMember {
        public_key,
        signing_public_key,
        role,
        permissions,
        owner_seed_sealed,
    } = match row {
        FormatOneRow::Member(member) => member,
        FormatOneRow::Unchanged(authority) => return preimage(certificate_id, authority),
    };
    let mut message = FORMAT_ONE_MEMBER_DOMAIN.to_vec();

    field(&mut message, certificate_id.as_bytes());
    field(&mut message, public_key);
    field(&mut message, signing_public_key);
    field(&mut message, role.as_bytes());
    field(&mut message, &permissions.to_be_bytes());

    // appended untagged where present and not at all where absent, as format 1 did.
    if let Some(owner_seed_sealed) = owner_seed_sealed {
        field(&mut message, owner_seed_sealed);
    }

    message
}

/// What the organization key signed when it issued a format 1 certificate. `revoked_at` was not
/// among it.
fn format_one_certificate_preimage(certificate: &FormatOneCertificate) -> Vec<u8> {
    let FormatOneCertificate {
        id,
        member_id,
        signing_public_key,
        signature_by_organization_key: _,
        issued_at,
        revoked_at: _,
    } = certificate;

    let mut message = FORMAT_ONE_CERTIFICATE_DOMAIN.to_vec();

    field(&mut message, id.as_bytes());
    field(&mut message, member_id.as_bytes());
    field(&mut message, signing_public_key);
    field(&mut message, issued_at.as_bytes());

    message
}
