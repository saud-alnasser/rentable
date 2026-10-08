//! a certificate and a revocation: issued, revoked and signed under, and the succession signed by
//! the key it leaves.

use ed25519_dalek::Signer;

use crate::error::Error;

use super::{
    AdministratorKey, Authority, FORGED_SUCCESSION, OrganizationKey, SuccessionAuthority,
    VERIFYING_KEY_BYTES, certificate_preimage, link_refusal, preimage, revocation_preimage,
    succession_preimage, verify_signature,
};
use crate::organization::role::permission::OWNER_ROLE;

/// A certificate as the row carries it.
///
/// `signature` covers every other field: the issuer's key made it, or the organization key where
/// `issuer_certificate_id` is `None`. **Every issue takes a fresh id**, so an older, wider
/// certificate is a different row that a revocation names rather than a version of this one.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Certificate {
    /// What a signed row names to say which certificate authorises it.
    pub id: String,
    /// The member this certificate is for.
    pub member_id: String,
    /// The Ed25519 verifying key whose signatures this certificate authorises.
    pub signing_public_key: [u8; VERIFYING_KEY_BYTES],
    /// The certificate that issued this one, or `None` for the root, which the organization key
    /// signed.
    pub issuer_certificate_id: Option<String>,
    /// The flags its holder may sign for: their effective permissions when it was issued.
    pub ceiling: i64,
    /// How high its holder stands: their role's rank when it was issued.
    pub rank: i64,
    /// When it was issued.
    pub issued_at: String,
    /// The issuer's signature over the fields above.
    pub signature: Vec<u8>,
}

/// A revocation as the row carries it: which certificate stops being an authority, who says so,
/// and when. `signature` is the revoker's, over the other three.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Revocation {
    pub certificate_id: String,
    pub revoker_certificate_id: String,
    pub revoked_at: String,
    pub signature: Vec<u8>,
}

impl Certificate {
    /// Whether this is the owner's certificate, the one the organization key signed.
    pub fn is_root(&self) -> bool {
        self.issuer_certificate_id.is_none()
    }
}

/// The id a certificate issued to a member at a moment takes: `cert-<member>-<issued at>`, fresh
/// per issue so an older certificate is a row a revocation can name (effort 838). Where two issues
/// to one member share a moment the caller adds a suffix, which [`unused_certificate_id`] does.
pub fn certificate_id(member_id: &str, issued_at: &str) -> String {
    format!("cert-{member_id}-{issued_at}")
}

/// [`certificate_id`], with `-2`, `-3` and on appended until it names no certificate in `taken`:
/// a re-issue in the same millisecond as the issue it replaces must not take the id the
/// revocation of that one names.
pub fn unused_certificate_id(taken: &[Certificate], member_id: &str, issued_at: &str) -> String {
    let base = certificate_id(member_id, issued_at);
    let is_taken = |id: &str| taken.iter().any(|certificate| certificate.id == id);

    if !is_taken(&base) {
        return base;
    }

    (2..)
        .map(|suffix| format!("{base}-{suffix}"))
        .find(|id| !is_taken(id))
        .unwrap_or(base)
}

/// Issues the owner's certificate under the organization key: the root, carrying every flag and
/// the owner's rank.
pub fn issue_root_certificate(
    organization_key: &OrganizationKey,
    id: &str,
    member_id: &str,
    signing_public_key: &[u8; VERIFYING_KEY_BYTES],
    issued_at: &str,
) -> Certificate {
    let mut certificate = Certificate {
        id: id.to_string(),
        member_id: member_id.to_string(),
        signing_public_key: *signing_public_key,
        issuer_certificate_id: None,
        ceiling: OWNER_ROLE.mask,
        rank: OWNER_ROLE.rank,
        issued_at: issued_at.to_string(),
        signature: Vec::new(),
    };

    certificate.signature = organization_key
        .0
        .sign(&certificate_preimage(&certificate))
        .to_bytes()
        .to_vec();

    certificate
}

/// The root as a build whose owner's role knew fewer flags issued it: `root` with `ceiling` in
/// place of its own, signed again under the organization key. For a test seeding an organization
/// made before a flag was added (effort 857, ticket 15).
#[cfg(test)]
pub(crate) fn root_issued_with(
    organization_key: &OrganizationKey,
    root: &Certificate,
    ceiling: i64,
) -> Certificate {
    let mut certificate = Certificate {
        ceiling,
        signature: Vec::new(),
        ..root.clone()
    };

    certificate.signature = organization_key
        .0
        .sign(&certificate_preimage(&certificate))
        .to_bytes()
        .to_vec();

    certificate
}

/// What a certificate issued by `issuer` has to carry, and how high it may stand.
///
/// The fields a caller supplies when issuing: [`issue_certificate`] takes these beside the
/// issuer so that a caller cannot name a ceiling or a rank in the wrong order.
#[derive(Clone, Copy, Debug)]
pub struct Issue<'a> {
    pub id: &'a str,
    pub member_id: &'a str,
    pub signing_public_key: &'a [u8; VERIFYING_KEY_BYTES],
    pub ceiling: i64,
    pub rank: i64,
    pub issued_at: &'a str,
}

/// Issues a certificate under `issuer`, signed with the issuer's key.
///
/// **Refused here rather than left to every reader**: a key the issuer does not name, a ceiling
/// wider than the issuer's, a rank not below it, and an issuer that administers nobody. These are
/// the checks the walk makes at every link, so a certificate this returns is one the walk
/// accepts, provided the issuer's own chain does.
pub fn issue_certificate(
    issuer_key: &AdministratorKey,
    issuer: &Certificate,
    issue: Issue<'_>,
) -> Result<Certificate, Error> {
    if issuer_key.verifying_key() != issuer.signing_public_key {
        return Err(Error::Internal {
            message: "the signing key is not the one the certificate names".to_string(),
        });
    }

    let mut certificate = Certificate {
        id: issue.id.to_string(),
        member_id: issue.member_id.to_string(),
        signing_public_key: *issue.signing_public_key,
        issuer_certificate_id: Some(issuer.id.clone()),
        ceiling: issue.ceiling,
        rank: issue.rank,
        issued_at: issue.issued_at.to_string(),
        signature: Vec::new(),
    };

    if let Some(refusal) = link_refusal(issuer, &certificate) {
        return Err(Error::Integrity {
            message: refusal.to_string(),
        });
    }

    certificate.signature = issuer_key
        .0
        .sign(&certificate_preimage(&certificate))
        .to_bytes()
        .to_vec();

    Ok(certificate)
}

/// Revokes a certificate, signed by the certificate that revokes it.
///
/// Refused here where the revoker neither is the root nor outranks what it revokes, which is the
/// check a reader makes; the caller hands over the certificate being revoked so the rank is the
/// one it carries rather than one the caller believes.
pub fn revoke(
    revoker_key: &AdministratorKey,
    revoker: &Certificate,
    revoked: &Certificate,
    revoked_at: &str,
) -> Result<Revocation, Error> {
    if revoker_key.verifying_key() != revoker.signing_public_key {
        return Err(Error::Internal {
            message: "the signing key is not the one the certificate names".to_string(),
        });
    }

    if !revoker.is_root() && revoker.rank <= revoked.rank {
        return Err(Error::Integrity {
            message: "a certificate revokes only one ranked below it".to_string(),
        });
    }

    let mut revocation = Revocation {
        certificate_id: revoked.id.clone(),
        revoker_certificate_id: revoker.id.clone(),
        revoked_at: revoked_at.to_string(),
        signature: Vec::new(),
    };

    revocation.signature = revoker_key
        .0
        .sign(&revocation_preimage(&revocation))
        .to_bytes()
        .to_vec();

    Ok(revocation)
}

/// Signs a succession under the organization key (effort 828, requirement 22).
///
/// **The second and last thing the organization key signs**, beside the root, and it is
/// deliberately not reachable as a general "sign anything with the organization key": the
/// preimage is built here from a named struct, so the key cannot be turned on a row by a caller
/// who found it convenient.
pub fn sign_succession(
    organization_key: &OrganizationKey,
    succession: SuccessionAuthority<'_>,
) -> Vec<u8> {
    organization_key
        .0
        .sign(&succession_preimage(succession))
        .to_bytes()
        .to_vec()
}

/// Verifies a succession against the key the reader already holds.
///
/// **Separate from [`Chain::verify`](super::Chain::verify) because there is no certificate to forget.** The warning at
/// the top of this file is about a reader that checks a row and skips the authority behind it; a
/// succession has no authority behind it but the organization key itself, which is the input, so
/// the failure mode that made `verify` a single function does not exist here.
///
/// `organization_verifying_key` is the key the caller pinned, and it is what the signature has to
/// have been made by. A machine following a chain of successions calls this once per link, each
/// time with the key the previous link handed it.
pub fn verify_succession(
    organization_verifying_key: &[u8; VERIFYING_KEY_BYTES],
    succession: SuccessionAuthority<'_>,
    signature: &[u8],
) -> Result<(), Error> {
    verify_signature(
        organization_verifying_key,
        &succession_preimage(succession),
        signature,
        FORGED_SUCCESSION,
    )
}

/// Signs the authority fields of one row, under the certificate that authorises
/// the signer.
///
/// The certificate is taken whole rather than by id so that signing with a key the
/// certificate does not name is refused here, once, instead of being discovered by
/// every reader afterwards.
pub fn sign(
    administrator_key: &AdministratorKey,
    certificate: &Certificate,
    authority: Authority<'_>,
) -> Result<Vec<u8>, Error> {
    if administrator_key.verifying_key() != certificate.signing_public_key {
        return Err(Error::Internal {
            message: "the signing key is not the one the certificate names".to_string(),
        });
    }

    Ok(administrator_key
        .0
        .sign(&preimage(&certificate.id, authority))
        .to_bytes()
        .to_vec())
}

#[cfg(test)]
mod tests {
    use crate::organization::authority::*;

    use crate::error::Error;

    use super::*;
    use crate::organization::authority::AdministratorKey;

    fn hex(text: &str) -> Vec<u8> {
        assert!(text.len().is_multiple_of(2), "odd-length hex: {text}");

        (0..text.len() / 2)
            .map(|index| {
                u8::from_str_radix(&text[index * 2..index * 2 + 2], 16)
                    .unwrap_or_else(|_| panic!("not hex: {text}"))
            })
            .collect()
    }

    const CHECKED_IN_MEMBER_ID: &str = "member-1";

    const CHECKED_IN_MEMBER_PUBLIC_KEY: &str =
        "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20";

    /// An override switching `inviteMember`, `removeMember` and `assignRole`, bits 0, 1 and 2.
    /// Written out rather than imported, because this module signs whatever the column holds and
    /// never reads it.
    const CHECKED_IN_OVERRIDE: i64 = 7;

    /// The signing key a member row names. It is the administrator key above, because that is
    /// what the column holds: a certificate names the key the member derives from their own
    /// vault secret, and the row carries its verifying half so there is something to certify
    /// (effort 826, requirement 6).
    fn member_authority<'a>(public_key: &'a [u8], role_id: &'a str) -> Authority<'a> {
        Authority::Member(MemberAuthority {
            id: CHECKED_IN_MEMBER_ID,
            public_key,
            signing_public_key: CHECKED_IN_MEMBER_SIGNING_PUBLIC_KEY,
            role_id,
            override_mask: CHECKED_IN_OVERRIDE,
            removed_at: None,
            owner_seed_sealed: None,
        })
    }

    fn checked_in_member_public_key() -> Vec<u8> {
        hex(CHECKED_IN_MEMBER_PUBLIC_KEY)
    }

    /// The verifying half of the key the checked-in member signs with, as the row holds it.
    /// Drawn once here so every vector and every rewrite below names the same bytes.
    static CHECKED_IN_MEMBER_SIGNING_PUBLIC_KEY: &[u8] = &[
        0x3d, 0x40, 0x17, 0xc3, 0xe8, 0x43, 0x89, 0x5a, 0x92, 0xb7, 0x0a, 0xa7, 0x4d, 0x1b, 0x7e,
        0xbc, 0x9c, 0x98, 0x2c, 0xcf, 0x2e, 0xc4, 0x96, 0x8c, 0xc0, 0xcd, 0x55, 0xf1, 0x2a, 0xf4,
        0x66, 0x0c,
    ];

    /// One organization, as far as the test here reads it: the root. Drawn rather than checked
    /// in, so a test using it exercises the chain and not a vector.
    struct Organization {
        certificate: Certificate,
    }

    fn an_organization() -> Organization {
        an_organization_rooted_at("certificate-a")
    }

    /// The same, with the root under an id of the caller's choosing, for a test that holds two
    /// organizations' certificates in one chain.
    fn an_organization_rooted_at(root_id: &str) -> Organization {
        let organization_key = OrganizationKey::generate().expect("failed to generate");
        let administrator_key = AdministratorKey::generate().expect("failed to generate");
        let certificate = issue_root_certificate(
            &organization_key,
            root_id,
            "member-a",
            &administrator_key.verifying_key(),
            "2026-08-30T09:00:00Z",
        );

        Organization { certificate }
    }

    #[test]
    fn signing_issuing_or_revoking_with_a_key_the_certificate_does_not_name_is_refused() {
        let organization = an_organization();
        let public_key = checked_in_member_public_key();
        let stranger = AdministratorKey::generate().expect("failed to generate");
        let refused = Error::Internal {
            message: "the signing key is not the one the certificate names".to_string(),
        };

        assert_eq!(
            sign(
                &stranger,
                &organization.certificate,
                member_authority(&public_key, "owner")
            ),
            Err(refused.clone())
        );
        assert_eq!(
            issue_certificate(
                &stranger,
                &organization.certificate,
                Issue {
                    id: "b",
                    member_id: "member-b",
                    signing_public_key: &stranger.verifying_key(),
                    ceiling: 0,
                    rank: 0,
                    issued_at: "0",
                }
            ),
            Err(refused.clone())
        );
        assert_eq!(
            revoke(
                &stranger,
                &organization.certificate,
                &organization.certificate,
                "0"
            ),
            Err(refused)
        );
    }
}
