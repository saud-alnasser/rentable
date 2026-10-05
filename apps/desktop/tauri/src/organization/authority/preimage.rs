//! what each kind of row signs: its authority fields, and the bytes a signature is made over.

use super::{
    CERTIFICATE_DOMAIN, Certificate, GRANT_DOMAIN, INVITATION_DOMAIN, MARK_DOMAIN, MEMBER_DOMAIN,
    ORGANIZATION_NAME_DOMAIN, REVOCATION_DOMAIN, ROLE_DOMAIN, Revocation, SUCCESSION_DOMAIN,
    VERIFYING_KEY_BYTES, WORKSPACE_DOMAIN, WORKSPACE_OVERRIDE_DOMAIN,
};

/// The authority fields of one row: exactly what its signature covers, and
/// nothing else the row happens to carry.
///
/// Three variants were the three rows the plan gives signed fields. The fourth
/// arrived with the invitation ticket, here rather than as a second encoding
/// somewhere else: an unsigned invitation row is one any member could have
/// written, and a member who could write one could invite whoever they liked.
#[derive(Clone, Copy, Debug)]
pub enum Authority<'a> {
    /// A `member` row.
    Member(MemberAuthority<'a>),
    /// A `role` row (effort 838).
    Role(RoleAuthority<'a>),
    /// A `workspace` row.
    Workspace(WorkspaceAuthority<'a>),
    /// A `grant` row.
    Grant(GrantAuthority<'a>),
    /// An `invitation` row.
    Invitation(InvitationAuthority<'a>),
    /// The `mark` row: the organization's signature or seal.
    Mark(MarkAuthority<'a>),
    /// A `workspace_override` row: what is pinned for one member in one workspace (effort 838,
    /// requirement 12 as amended a third time).
    WorkspaceOverride(WorkspaceOverrideAuthority<'a>),
    /// The `organization_name` row: the organization's name as sealed, and when it was set, under
    /// the owner's signature (effort 851, requirement 29). **The root's alone**, so a name any
    /// member holding the database's credential wrote is never shown as the organization's. The
    /// unsigned `organization.name_sealed` beside it is what builds before this one read, and what
    /// a machine falls back to only until it has once read this row.
    OrganizationName {
        name_sealed: &'a [u8],
        updated_at: i64,
    },
}

/// What a `workspace_override` row puts under signature, which is the whole of the row: whose it
/// is, which workspace, the record flags pinned for them there and which of those are on (effort
/// 838, requirement 12 as amended a third time, and at review round one). Its own row rather than a column of the grant, because a grant is
/// signed under `grantWorkspace` and carries a sealed credential, and this is set by a holder of
/// `overrideMember`, who may hold no grant rights at all.
#[derive(Clone, Copy, Debug)]
pub struct WorkspaceOverrideAuthority<'a> {
    /// Whose permissions it switches.
    pub member_id: &'a str,
    /// In which workspace.
    pub workspace_id: &'a str,
    /// The record flags set for the member in this workspace, whatever they hold across the
    /// organization. Record flags alone: a row pinning any other bit is covered by nobody.
    pub pinned: i64,
    /// Which of the pinned flags are on; the rest of them are off. Within `pinned`: a row granting
    /// a flag it does not pin is covered by nobody.
    pub granted: i64,
}

/// What a `role` row puts under signature: which role, what kind, what it is called, what it
/// carries and how high it stands (effort 838). The whole of what the role is, because every
/// field of it is authority: a renamed role reads as another, a wider mask widens every holder,
/// and a higher rank puts it over somebody.
#[derive(Clone, Copy, Debug)]
pub struct RoleAuthority<'a> {
    pub id: &'a str,
    /// `manager`, `member` or `custom`. The owner's role is a constant and never a row.
    pub kind: &'a str,
    pub name_sealed: &'a [u8],
    pub mask: i64,
    pub rank: i64,
}

/// What the `mark` row puts under signature: the image as sealed, what kind it is, and who set
/// it when. Signed so that the image printed as the organization's signature or seal is one a
/// holder of `manageMark` set, and not one any member holding the database's credential wrote
/// (effort 835, requirement 13). *It was the owner's or an administrator's by the role word until
/// effort 838 made it a flag.*
#[derive(Clone, Copy, Debug)]
pub struct MarkAuthority<'a> {
    pub image_sealed: &'a [u8],
    pub media_type: &'a str,
    pub updated_by: &'a str,
    pub updated_at: i64,
}

/// What an `invitation` row puts under signature: which invitation it is, whose
/// pending account it is, and how long it stands. `consumed_at` is written by the
/// machine that consumes it and is not covered: it does not exist when the row is
/// signed.
///
/// *A sealed payload naming the member stood under signature in `member_id`'s
/// place until effort 824 dropped the invitation's sealed half: the row is found
/// by the password now, and the member it names is what the signature binds.*
#[derive(Clone, Copy, Debug)]
pub struct InvitationAuthority<'a> {
    pub id: &'a str,
    /// The member whose first sign-in this invitation is for.
    pub member_id: &'a str,
    /// When the invitation lapses, in milliseconds.
    pub expires_at: i64,
}

/// What a `member` row puts under signature (`member.v3`, effort 838).
///
/// **`sealed_secret_key`, `kdf_salt` and `kdf_params` are deliberately absent, and
/// their absence is load-bearing.** They are the member's own vault: rewriting
/// them locks the member out and harms nobody else, so they do not need a signature
/// from above. That is exactly what makes a password change a write a member may
/// perform on a database they hold full access to. Signed, every password change
/// would need somebody ranked above the member present.
///
/// **The id is under signature**, so no signed tuple stands in for another member's
/// row. *Until effort 838 the public key stood in for it, which held only as long
/// as nothing a row said depended on whose row it was; the owner's role does.*
#[derive(Clone, Copy, Debug)]
pub struct MemberAuthority<'a> {
    /// Whose row this is.
    pub id: &'a str,
    /// The public half of the member's keypair, as the column holds it. This
    /// module does not know what kind of key it is, only that these are the bytes
    /// under signature.
    pub public_key: &'a [u8],
    /// The verifying half of the key this member signs rows with, as the column
    /// holds it. It is here so that whoever gives somebody an act that signs has
    /// something to certify: a certificate names a key, the key is derived from a
    /// secret only the member's password unseals, and before effort 826 the row
    /// kept no copy of its public half, so the one moment a certificate could be
    /// issued was the moment its issuer held the fresh secret. Under signature
    /// because an unsigned copy would let any writer name a key of their own and
    /// wait to be certified.
    pub signing_public_key: &'a [u8],
    /// The one role the member holds (requirement 5): `owner`, `manager`, `member`,
    /// or a custom role's id. [`covers`](super::covers) reads the rank it stands at.
    pub role_id: &'a str,
    /// The flags switched for this member alone (requirement 6). Zero on the owner's.
    pub override_mask: i64,
    /// When the member was removed, where they were. The row stays, signed by whoever
    /// removed them, so a machine holding a stale replica sees a verified removal.
    pub removed_at: Option<i64>,
    /// The organization key's seed, sealed to this member's public key, on the row
    /// of an account that has been offered the organization and has not accepted
    /// yet (effort 828, requirement 22). `None` on every other row, and `None`
    /// again the moment the offer is accepted or withdrawn.
    ///
    /// **It is the offer's carrier and never anybody's anchor.** The acceptance
    /// opens it only on a machine that already holds the old key by another route,
    /// and refuses unless what it opens derives the key that machine pinned, so a
    /// seal somebody planted opens nothing that is then believed.
    ///
    /// **Under signature.** A writer able to put a seal on a row of their own
    /// choosing would be naming themselves the organization's next owner.
    pub owner_seed_sealed: Option<&'a [u8]>,
}

/// What a `succession` row puts under signature: which account was offered the organization, who
/// offered it, the key that is being left, and the key that replaced it once one has (effort 828,
/// requirement 22).
///
/// **Signed by the organization key rather than under a certificate**, which is the whole of what
/// makes it worth anything. A machine that pinned the old key meets rows it cannot verify and has
/// to decide whether to pin another one; the only thing it holds that can answer is the key it
/// already pinned, so the offer is signed by the key in force when it was made and the completion
/// by that same key over the key replacing it. A certificate in between would be one more thing
/// the reader has to be persuaded of by the key it is trying to replace.
///
/// **`new_verifying_key` and `accepted_at` are `None` until the offer is accepted**, and the
/// completion signs them in. So the two states are two preimages and one column: an offer whose
/// signature was lifted onto a completed row verifies as neither.
#[derive(Clone, Copy, Debug)]
pub struct SuccessionAuthority<'a> {
    pub id: &'a str,
    /// the account that was offered the organization, and the only one that can accept.
    pub offered_member_id: &'a str,
    /// the owner who offered it.
    pub offered_by: &'a str,
    pub offered_at: i64,
    /// the organization key in force when the offer was written, which is the key whose holder
    /// signed this row.
    pub old_verifying_key: &'a [u8; VERIFYING_KEY_BYTES],
    /// what the new owner's own vault derives, once they have accepted. `None` on a standing
    /// offer.
    pub new_verifying_key: Option<&'a [u8; VERIFYING_KEY_BYTES]>,
    pub accepted_at: Option<i64>,
}

/// What a `workspace` row puts under signature: the identity of the database it
/// is, and nothing about its name or its schema version.
#[derive(Clone, Copy, Debug)]
pub struct WorkspaceAuthority<'a> {
    /// The database's name on the customer's account.
    pub database_name: &'a str,
    /// The host it is reached at.
    pub database_hostname: &'a str,
}

/// What a `grant` row puts under signature, which is the whole of the row.
#[derive(Clone, Copy, Debug)]
pub struct GrantAuthority<'a> {
    /// Who the grant is for.
    pub member_id: &'a str,
    /// Which workspace it opens.
    pub workspace_id: &'a str,
    /// The credential, sealed to the member's public key by the vault.
    pub sealed_credential: &'a [u8],
    /// What the credential is good for, as Turso minted it.
    pub access_level: &'a str,
    /// When the credential stops working, where it does.
    pub credential_expires_at: Option<&'a str>,
}

/// What a member signs when they sign a row. Reachable from outside this module for format 1's
/// verifier (`upgrade/format/signature.rs`), whose rows other than a member's signed exactly this.
pub(crate) fn preimage(certificate_id: &str, authority: Authority<'_>) -> Vec<u8> {
    let mut message = Vec::new();

    // every arm names its fields rather than taking `..`, so a column added to a
    // signed row is a compile error here instead of a field nobody signed.
    match authority {
        Authority::Member(MemberAuthority {
            id,
            public_key,
            signing_public_key,
            role_id,
            override_mask,
            removed_at,
            owner_seed_sealed,
        }) => {
            message.extend_from_slice(MEMBER_DOMAIN);
            field(&mut message, certificate_id.as_bytes());
            field(&mut message, id.as_bytes());
            field(&mut message, public_key);
            field(&mut message, signing_public_key);
            field(&mut message, role_id.as_bytes());
            field(&mut message, &override_mask.to_be_bytes());
            optional_field(
                &mut message,
                removed_at.map(i64::to_be_bytes).as_ref().map(|at| &at[..]),
            );
            // tagged like every other optional field. *It was appended only where present
            // until effort 838, so that rows signed before the column kept their bytes; an
            // organization of this format has no such rows.*
            optional_field(&mut message, owner_seed_sealed);
        }
        Authority::Role(RoleAuthority {
            id,
            kind,
            name_sealed,
            mask,
            rank,
        }) => {
            message.extend_from_slice(ROLE_DOMAIN);
            field(&mut message, certificate_id.as_bytes());
            field(&mut message, id.as_bytes());
            field(&mut message, kind.as_bytes());
            field(&mut message, name_sealed);
            field(&mut message, &mask.to_be_bytes());
            field(&mut message, &rank.to_be_bytes());
        }
        Authority::Workspace(WorkspaceAuthority {
            database_name,
            database_hostname,
        }) => {
            message.extend_from_slice(WORKSPACE_DOMAIN);
            field(&mut message, certificate_id.as_bytes());
            field(&mut message, database_name.as_bytes());
            field(&mut message, database_hostname.as_bytes());
        }
        Authority::Grant(GrantAuthority {
            member_id,
            workspace_id,
            sealed_credential,
            access_level,
            credential_expires_at,
        }) => {
            message.extend_from_slice(GRANT_DOMAIN);
            field(&mut message, certificate_id.as_bytes());
            field(&mut message, member_id.as_bytes());
            field(&mut message, workspace_id.as_bytes());
            field(&mut message, sealed_credential);
            field(&mut message, access_level.as_bytes());
            optional_field(&mut message, credential_expires_at.map(str::as_bytes));
        }
        Authority::Invitation(InvitationAuthority {
            id,
            member_id,
            expires_at,
        }) => {
            message.extend_from_slice(INVITATION_DOMAIN);
            field(&mut message, certificate_id.as_bytes());
            field(&mut message, id.as_bytes());
            field(&mut message, member_id.as_bytes());
            field(&mut message, &expires_at.to_be_bytes());
        }
        Authority::Mark(MarkAuthority {
            image_sealed,
            media_type,
            updated_by,
            updated_at,
        }) => {
            message.extend_from_slice(MARK_DOMAIN);
            field(&mut message, certificate_id.as_bytes());
            field(&mut message, image_sealed);
            field(&mut message, media_type.as_bytes());
            field(&mut message, updated_by.as_bytes());
            field(&mut message, &updated_at.to_be_bytes());
        }
        Authority::WorkspaceOverride(WorkspaceOverrideAuthority {
            member_id,
            workspace_id,
            pinned,
            granted,
        }) => {
            message.extend_from_slice(WORKSPACE_OVERRIDE_DOMAIN);
            field(&mut message, certificate_id.as_bytes());
            field(&mut message, member_id.as_bytes());
            field(&mut message, workspace_id.as_bytes());
            field(&mut message, &pinned.to_be_bytes());
            field(&mut message, &granted.to_be_bytes());
        }
        Authority::OrganizationName {
            name_sealed,
            updated_at,
        } => {
            message.extend_from_slice(ORGANIZATION_NAME_DOMAIN);
            field(&mut message, certificate_id.as_bytes());
            field(&mut message, name_sealed);
            field(&mut message, &updated_at.to_be_bytes());
        }
    }

    message
}

/// What the organization key signs when it hands the organization on.
///
/// Named field by field rather than with `..`, for the reason the arms of [`preimage`] are: a
/// column added to the succession row is a compile error here instead of a field nobody signed.
pub(super) fn succession_preimage(succession: SuccessionAuthority<'_>) -> Vec<u8> {
    let SuccessionAuthority {
        id,
        offered_member_id,
        offered_by,
        offered_at,
        old_verifying_key,
        new_verifying_key,
        accepted_at,
    } = succession;

    let mut message = SUCCESSION_DOMAIN.to_vec();

    field(&mut message, id.as_bytes());
    field(&mut message, offered_member_id.as_bytes());
    field(&mut message, offered_by.as_bytes());
    field(&mut message, &offered_at.to_be_bytes());
    field(&mut message, old_verifying_key);
    optional_field(&mut message, new_verifying_key.map(|key| &key[..]));
    optional_field(
        &mut message,
        accepted_at.map(i64::to_be_bytes).as_ref().map(|at| &at[..]),
    );

    message
}

/// What an issuer signs when it issues a certificate, the organization key at the root.
pub(super) fn certificate_preimage(certificate: &Certificate) -> Vec<u8> {
    // named field by field rather than with `..`, for the reason the arms above
    // are. The one discarded is the deliberate exclusion: a signature cannot cover
    // itself.
    let Certificate {
        id,
        member_id,
        signing_public_key,
        issuer_certificate_id,
        ceiling,
        rank,
        issued_at,
        signature: _,
    } = certificate;

    let mut message = CERTIFICATE_DOMAIN.to_vec();

    field(&mut message, id.as_bytes());
    field(&mut message, member_id.as_bytes());
    field(&mut message, signing_public_key);
    optional_field(
        &mut message,
        issuer_certificate_id.as_deref().map(str::as_bytes),
    );
    field(&mut message, &ceiling.to_be_bytes());
    field(&mut message, &rank.to_be_bytes());
    field(&mut message, issued_at.as_bytes());

    message
}

/// What a revoker signs when it revokes a certificate.
pub(super) fn revocation_preimage(revocation: &Revocation) -> Vec<u8> {
    let Revocation {
        certificate_id,
        revoker_certificate_id,
        revoked_at,
        signature: _,
    } = revocation;

    let mut message = REVOCATION_DOMAIN.to_vec();

    field(&mut message, certificate_id.as_bytes());
    field(&mut message, revoker_certificate_id.as_bytes());
    field(&mut message, revoked_at.as_bytes());

    message
}

/// One field of a preimage: how long it is, then what it is.
///
/// **The length is what makes the encoding mean one thing.** Concatenated without
/// it, a grant naming member `ab` and workspace `c` produces the same bytes as one
/// naming member `a` and workspace `bc`, so a signature over either is a signature
/// over both.
pub(crate) fn field(message: &mut Vec<u8>, bytes: &[u8]) {
    message.extend_from_slice(&(bytes.len() as u64).to_be_bytes());
    message.extend_from_slice(bytes);
}

/// A field that may be absent. The tag is what separates absent from empty:
/// without it, a credential that never expires and one whose expiry is the empty
/// string sign the same bytes.
fn optional_field(message: &mut Vec<u8>, bytes: Option<&[u8]>) {
    match bytes {
        Some(bytes) => {
            message.push(1);
            field(message, bytes);
        }
        None => message.push(0),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::Error;
    use crate::organization::authority::*;
    use crate::organization::authority::{
        AdministratorKey, Certificate, Chain, FORGED_BY_ISSUER, FORGED_CERTIFICATE, FORGED_ROW,
        Issue, Revocation, VERIFYING_KEY_BYTES, issue_certificate, issue_root_certificate, revoke,
        sign,
    };
    use crate::organization::member::vault::{self, KdfParams};
    use crate::organization::role::permission::{self, Flag, MANAGER_ROLE, MEMBER_ROLE, mask_of};
    use std::collections::HashMap;

    fn hex(text: &str) -> Vec<u8> {
        assert!(text.len().is_multiple_of(2), "odd-length hex: {text}");

        (0..text.len() / 2)
            .map(|index| {
                u8::from_str_radix(&text[index * 2..index * 2 + 2], 16)
                    .unwrap_or_else(|_| panic!("not hex: {text}"))
            })
            .collect()
    }

    fn hex_array<const N: usize>(text: &str) -> [u8; N] {
        hex(text)
            .try_into()
            .unwrap_or_else(|_| panic!("expected {N} bytes: {text}"))
    }

    fn to_hex(bytes: &[u8]) -> String {
        bytes.iter().map(|byte| format!("{byte:02x}")).collect()
    }

    /// RFC 8032 section 7.1's first secret key, standing in for an organization
    /// key so that the verifying key derived from it is a published number rather
    /// than one this crate produced.
    const CHECKED_IN_ORGANIZATION_SEED: &str =
        "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60";

    const CHECKED_IN_ORGANIZATION_VERIFYING_KEY: &str =
        "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a";

    /// The same section's second secret key, standing in for a member's.
    const CHECKED_IN_ADMINISTRATOR_SEED: &str =
        "4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb";

    const CHECKED_IN_ADMINISTRATOR_VERIFYING_KEY: &str =
        "3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c";

    const CHECKED_IN_MEMBER_ID: &str = "member-1";

    const CHECKED_IN_MEMBER_PUBLIC_KEY: &str =
        "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20";

    const CHECKED_IN_DATABASE_NAME: &str = "rentable-acme-ledger";

    const CHECKED_IN_DATABASE_HOSTNAME: &str = "acme-ledger-rentable.aws-eu-west-1.turso.io";

    const CHECKED_IN_SEALED_CREDENTIAL: &str = "a1b2c3d4";

    const CHECKED_IN_WORKSPACE_ID: &str = "workspace-1";

    const CHECKED_IN_ACCESS_LEVEL: &str = "full-access";

    const CHECKED_IN_EXPIRES_AT: &str = "2026-09-30T00:00:00Z";

    /// An override switching `inviteMember`, `removeMember` and `assignRole`, bits 0, 1 and 2.
    /// Written out rather than imported, because this module signs whatever the column holds and
    /// never reads it.
    const CHECKED_IN_OVERRIDE: i64 = 7;

    fn checked_in_organization_key() -> OrganizationKey {
        OrganizationKey::from_bytes(&hex_array(CHECKED_IN_ORGANIZATION_SEED))
    }

    fn checked_in_administrator_key() -> AdministratorKey {
        AdministratorKey::from_bytes(&hex_array(CHECKED_IN_ADMINISTRATOR_SEED))
    }

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

    fn role_authority<'a>(name_sealed: &'a [u8], mask: i64, rank: i64) -> Authority<'a> {
        Authority::Role(RoleAuthority {
            id: "role-1",
            kind: "custom",
            name_sealed,
            mask,
            rank,
        })
    }

    fn workspace_authority<'a>(
        database_name: &'a str,
        database_hostname: &'a str,
    ) -> Authority<'a> {
        Authority::Workspace(WorkspaceAuthority {
            database_name,
            database_hostname,
        })
    }

    fn grant_authority(sealed_credential: &[u8]) -> Authority<'_> {
        grant_authority_at(sealed_credential, CHECKED_IN_ACCESS_LEVEL)
    }

    fn grant_authority_at<'a>(sealed_credential: &'a [u8], access_level: &'a str) -> Authority<'a> {
        Authority::Grant(GrantAuthority {
            member_id: CHECKED_IN_MEMBER_ID,
            workspace_id: CHECKED_IN_WORKSPACE_ID,
            sealed_credential,
            access_level,
            credential_expires_at: Some(CHECKED_IN_EXPIRES_AT),
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

    /// One organization: its key, the owner's signing key, and the root that joins them. Drawn
    /// rather than checked in, so a test using it exercises the chain and not a vector.
    struct Organization {
        verifying_key: [u8; VERIFYING_KEY_BYTES],
        administrator_key: AdministratorKey,
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

        Organization {
            verifying_key: organization_key.verifying_key(),
            administrator_key,
            certificate,
        }
    }

    /// A certificate `issuer` issues to a fresh key, and that key.
    fn delegate(
        issuer_key: &AdministratorKey,
        issuer: &Certificate,
        id: &str,
        ceiling: i64,
        rank: i64,
    ) -> (AdministratorKey, Certificate) {
        let key = AdministratorKey::generate().expect("failed to generate");
        let certificate = issue_certificate(
            issuer_key,
            issuer,
            Issue {
                id,
                member_id: &format!("member-{id}"),
                signing_public_key: &key.verifying_key(),
                ceiling,
                rank,
                issued_at: "2026-08-31T09:00:00Z",
            },
        )
        .expect("failed to issue");

        (key, certificate)
    }

    /// The masks and the ranks of the two built-in roles that are rows, as a reader holds them
    /// once it has verified the role rows.
    fn built_in_roles() -> HashMap<String, (i64, i64)> {
        HashMap::from([
            (
                permission::MANAGER.to_string(),
                (MANAGER_ROLE.mask, MANAGER_ROLE.rank),
            ),
            (
                permission::MEMBER.to_string(),
                (MEMBER_ROLE.mask, MEMBER_ROLE.rank),
            ),
        ])
    }

    /// A row's verdict against the chain these certificates and revocations make.
    fn verify(
        verifying_key: &[u8; VERIFYING_KEY_BYTES],
        certificates: &[Certificate],
        revocations: &[Revocation],
        certificate: &Certificate,
        authority: Authority<'_>,
        signature: &[u8],
    ) -> Result<(), Error> {
        Chain::new(verifying_key, certificates, revocations)
            .with_roles(built_in_roles())
            .verify(&certificate.id, authority, signature)
    }

    /// The same, for a row signed under the root and nothing else in the chain.
    fn verify_under(
        verifying_key: &[u8; VERIFYING_KEY_BYTES],
        certificate: &Certificate,
        authority: Authority<'_>,
        signature: &[u8],
    ) -> Result<(), Error> {
        verify(
            verifying_key,
            std::slice::from_ref(certificate),
            &[],
            certificate,
            authority,
            signature,
        )
    }

    const CHECKED_IN_CERTIFICATE_ID: &str = "certificate-1";

    const CHECKED_IN_ISSUED_AT: &str = "2026-08-30T00:00:00Z";

    /// The root the vectors below pin. Issued at a fixed moment under a fixed key,
    /// so its bytes are the same on every machine that runs this.
    fn checked_in_certificate() -> Certificate {
        issue_root_certificate(
            &checked_in_organization_key(),
            CHECKED_IN_CERTIFICATE_ID,
            CHECKED_IN_MEMBER_ID,
            &hex_array(CHECKED_IN_ADMINISTRATOR_VERIFYING_KEY),
            CHECKED_IN_ISSUED_AT,
        )
    }

    /// The same row, carrying the organization seed a transfer sealed onto it.
    fn member_authority_with_seal<'a>(
        public_key: &'a [u8],
        role_id: &'a str,
        owner_seed_sealed: &'a [u8],
    ) -> Authority<'a> {
        Authority::Member(MemberAuthority {
            id: CHECKED_IN_MEMBER_ID,
            public_key,
            signing_public_key: CHECKED_IN_MEMBER_SIGNING_PUBLIC_KEY,
            role_id,
            override_mask: CHECKED_IN_OVERRIDE,
            removed_at: None,
            owner_seed_sealed: Some(owner_seed_sealed),
        })
    }

    /// An absent seal and a present empty one are two rows, and so are a removed row and one that
    /// is not: every optional field of `member.v3` is tagged (effort 838).
    #[test]
    fn a_member_rows_optional_fields_are_told_apart_from_empty_ones() {
        let public_key = checked_in_member_public_key();
        let absent = member_authority(&public_key, "member");
        let empty = member_authority_with_seal(&public_key, "member", b"");
        let removed = Authority::Member(MemberAuthority {
            id: CHECKED_IN_MEMBER_ID,
            public_key: &public_key,
            signing_public_key: CHECKED_IN_MEMBER_SIGNING_PUBLIC_KEY,
            role_id: "member",
            override_mask: CHECKED_IN_OVERRIDE,
            removed_at: Some(0),
            owner_seed_sealed: None,
        });

        assert_ne!(preimage("cert-a", absent), preimage("cert-a", empty));
        assert_ne!(preimage("cert-a", absent), preimage("cert-a", removed));
    }

    /// A row that carries the seal signs different bytes from the same row without it, so a seal
    /// cannot be added to a row or taken off one without the signature failing.
    #[test]
    fn a_member_row_carrying_the_owner_seed_folds_it_into_what_it_signs() {
        let organization = an_organization();
        let public_key = checked_in_member_public_key();
        let seal = b"a sealed organization seed".as_slice();
        let without = member_authority(&public_key, "member");
        let with = member_authority_with_seal(&public_key, "member", seal);

        assert_ne!(
            preimage("cert-a-manager", with),
            preimage("cert-a-manager", without)
        );

        // and the signature over one is not a signature over the other, in both
        // directions: a row handed a seal it was not signed with is refused, and so
        // is a row whose seal was taken off.
        let signed_with_seal = sign(
            &organization.administrator_key,
            &organization.certificate,
            with,
        )
        .expect("failed to sign");

        assert_eq!(
            verify_under(
                &organization.verifying_key,
                &organization.certificate,
                with,
                &signed_with_seal
            ),
            Ok(())
        );
        assert_eq!(
            verify_under(
                &organization.verifying_key,
                &organization.certificate,
                without,
                &signed_with_seal
            ),
            Err(Error::Integrity {
                message: FORGED_ROW.to_string(),
            })
        );

        let signed_without = sign(
            &organization.administrator_key,
            &organization.certificate,
            without,
        )
        .expect("failed to sign");

        assert_eq!(
            verify_under(
                &organization.verifying_key,
                &organization.certificate,
                with,
                &signed_without
            ),
            Err(Error::Integrity {
                message: FORGED_ROW.to_string(),
            })
        );
    }

    // exactly the fields the plan lists, and no others

    #[test]
    fn the_fields_under_signature_are_exactly_the_ones_the_plan_lists() {
        // the preimages, byte for byte, built by an encoder outside this crate. A
        // field added to a signed row is already a compile error in `preimage`,
        // which is what stops one arriving unsigned. This is what stops one
        // arriving unnoticed: covering it changes these bytes and this fails.
        let public_key = checked_in_member_public_key();
        let sealed_credential = hex(CHECKED_IN_SEALED_CREDENTIAL);

        assert_eq!(
            to_hex(&certificate_preimage(&checked_in_certificate())),
            concat!(
                "72656e7461626c652e6f7267616e697a6174696f6e2e617574686f726974792e",
                "63657274696669636174652e7632000000000000000d63657274696669636174",
                "652d3100000000000000086d656d6265722d3100000000000000203d4017c3e8",
                "43895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c0000000000",
                "00000008000000fffff3ffff000000000000000800000000001e848000000000",
                "00000014323032362d30382d33305430303a30303a30305a",
            ),
            "a certificate covers a different set of fields"
        );

        assert_eq!(
            to_hex(&certificate_preimage(&checked_in_delegated_certificate())),
            concat!(
                "72656e7461626c652e6f7267616e697a6174696f6e2e617574686f726974792e",
                "63657274696669636174652e7632000000000000000d63657274696669636174",
                "652d3200000000000000086d656d6265722d3200000000000000203d4017c3e8",
                "43895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c0100000000",
                "0000000d63657274696669636174652d310000000000000008000000fffff003",
                "ff000000000000000800000000000f42400000000000000014323032362d3038",
                "2d33315430303a30303a30305a",
            ),
            "a delegated certificate covers a different set of fields"
        );

        assert_eq!(
            to_hex(&revocation_preimage(&checked_in_revocation())),
            concat!(
                "72656e7461626c652e6f7267616e697a6174696f6e2e617574686f726974792e",
                "7265766f636174696f6e2e7631000000000000000d6365727469666963617465",
                "2d32000000000000000d63657274696669636174652d31000000000000001432",
                "3032362d30392d30315430303a30303a30305a",
            ),
            "a revocation covers a different set of fields"
        );

        assert_eq!(
            to_hex(&preimage(
                CHECKED_IN_CERTIFICATE_ID,
                checked_in_role_authority(&sealed_credential)
            )),
            concat!(
                "72656e7461626c652e6f7267616e697a6174696f6e2e617574686f726974792e",
                "726f6c652e7631000000000000000d63657274696669636174652d3100000000",
                "00000006726f6c652d310000000000000006637573746f6d0000000000000004",
                "a1b2c3d400000000000000080000000001100000000000000000000800000000",
                "0007a120",
            ),
            "a role row covers a different set of fields"
        );

        assert_eq!(
            to_hex(&preimage(
                CHECKED_IN_CERTIFICATE_ID,
                member_authority(&public_key, "manager")
            )),
            concat!(
                "72656e7461626c652e6f7267616e697a6174696f6e2e617574686f726974792e",
                "6d656d6265722e7633000000000000000d63657274696669636174652d310000",
                "0000000000086d656d6265722d3100000000000000200102030405060708090a",
                "0b0c0d0e0f101112131415161718191a1b1c1d1e1f2000000000000000203d40",
                "17c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c0000",
                "0000000000076d616e61676572000000000000000800000000000000070000",
            ),
            "a member row covers a different set of fields"
        );

        // and the same row carrying the seed a transfer sealed onto it (effort 828, requirement
        // 22): the last tag set, and the seal after it.
        assert_eq!(
            to_hex(&preimage(
                CHECKED_IN_CERTIFICATE_ID,
                member_authority_with_seal(&public_key, "manager", b"a sealed seed")
            )),
            concat!(
                "72656e7461626c652e6f7267616e697a6174696f6e2e617574686f726974792e",
                "6d656d6265722e7633000000000000000d63657274696669636174652d310000",
                "0000000000086d656d6265722d3100000000000000200102030405060708090a",
                "0b0c0d0e0f101112131415161718191a1b1c1d1e1f2000000000000000203d40",
                "17c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c0000",
                "0000000000076d616e6167657200000000000000080000000000000007000100",
                "0000000000000d61207365616c65642073656564",
            ),
            "a member row carrying an owner seed covers a different set of fields"
        );

        assert_eq!(
            to_hex(&preimage(
                CHECKED_IN_CERTIFICATE_ID,
                workspace_authority(CHECKED_IN_DATABASE_NAME, CHECKED_IN_DATABASE_HOSTNAME)
            )),
            concat!(
                "72656e7461626c652e6f7267616e697a6174696f6e2e617574686f726974792e",
                "776f726b73706163652e7631000000000000000d63657274696669636174652d",
                "31000000000000001472656e7461626c652d61636d652d6c6564676572000000",
                "000000002b61636d652d6c65646765722d72656e7461626c652e6177732d6575",
                "2d776573742d312e747572736f2e696f",
            ),
            "a workspace row covers a different set of fields"
        );

        assert_eq!(
            to_hex(&preimage(
                CHECKED_IN_CERTIFICATE_ID,
                grant_authority(&sealed_credential)
            )),
            concat!(
                "72656e7461626c652e6f7267616e697a6174696f6e2e617574686f726974792e",
                "6772616e742e7631000000000000000d63657274696669636174652d31000000",
                "00000000086d656d6265722d31000000000000000b776f726b73706163652d31",
                "0000000000000004a1b2c3d4000000000000000b66756c6c2d61636365737301",
                "0000000000000014323032362d30392d33305430303a30303a30305a",
            ),
            "a grant row covers a different set of fields"
        );

        assert_eq!(
            to_hex(&preimage(
                CHECKED_IN_CERTIFICATE_ID,
                organization_name_authority(&sealed_credential, CHECKED_IN_NAMED_AT)
            )),
            concat!(
                "72656e7461626c652e6f7267616e697a6174696f6e2e617574686f726974792e",
                "6f7267616e697a6174696f6e2d6e616d652e7631000000000000000d63657274",
                "696669636174652d310000000000000004a1b2c3d40000000000000008000001",
                "99155c6200",
            ),
            "the organization's name covers a different set of fields"
        );
    }

    #[test]
    fn every_field_under_signature_changes_the_signature() {
        // one rewrite per field the plan lists. A field that quietly stopped being
        // covered stops failing here.
        let organization = an_organization();
        let public_key = checked_in_member_public_key();
        let other_public_key = hex(&"33".repeat(32));
        let sealed_credential = hex(CHECKED_IN_SEALED_CREDENTIAL);
        let other_credential = hex("ffffffff");

        let signed_member = member_authority(&public_key, "member");
        let signed_role = role_authority(&sealed_credential, 3, 5);
        let signed_workspace =
            workspace_authority(CHECKED_IN_DATABASE_NAME, CHECKED_IN_DATABASE_HOSTNAME);
        let signed_grant = grant_authority(&sealed_credential);
        let signed_name = organization_name_authority(&sealed_credential, CHECKED_IN_NAMED_AT);

        let rewrites: Vec<(Authority<'_>, Authority<'_>)> = vec![
            // member: id, public_key, signing_public_key, role_id, override, removed_at
            (
                signed_member,
                Authority::Member(MemberAuthority {
                    id: "member-2",
                    public_key: &public_key,
                    signing_public_key: CHECKED_IN_MEMBER_SIGNING_PUBLIC_KEY,
                    role_id: "member",
                    override_mask: CHECKED_IN_OVERRIDE,
                    removed_at: None,
                    owner_seed_sealed: None,
                }),
            ),
            (signed_member, member_authority(&other_public_key, "member")),
            (signed_member, member_authority(&public_key, "manager")),
            (
                signed_member,
                Authority::Member(MemberAuthority {
                    id: CHECKED_IN_MEMBER_ID,
                    public_key: &public_key,
                    signing_public_key: &other_public_key,
                    role_id: "member",
                    override_mask: CHECKED_IN_OVERRIDE,
                    removed_at: None,
                    owner_seed_sealed: None,
                }),
            ),
            (
                signed_member,
                Authority::Member(MemberAuthority {
                    id: CHECKED_IN_MEMBER_ID,
                    public_key: &public_key,
                    signing_public_key: CHECKED_IN_MEMBER_SIGNING_PUBLIC_KEY,
                    role_id: "member",
                    override_mask: CHECKED_IN_OVERRIDE + 1,
                    removed_at: None,
                    owner_seed_sealed: None,
                }),
            ),
            (
                signed_member,
                Authority::Member(MemberAuthority {
                    id: CHECKED_IN_MEMBER_ID,
                    public_key: &public_key,
                    signing_public_key: CHECKED_IN_MEMBER_SIGNING_PUBLIC_KEY,
                    role_id: "member",
                    override_mask: CHECKED_IN_OVERRIDE,
                    removed_at: Some(1),
                    owner_seed_sealed: None,
                }),
            ),
            // and the seed a transfer seals onto an owner's row, put on a row that was signed
            // without one (effort 828, requirement 22).
            (
                signed_member,
                member_authority_with_seal(&public_key, "member", b"a sealed organization seed"),
            ),
            // role: id, kind, name, mask, rank
            (
                signed_role,
                Authority::Role(RoleAuthority {
                    id: "role-2",
                    kind: "custom",
                    name_sealed: &sealed_credential,
                    mask: 3,
                    rank: 5,
                }),
            ),
            (
                signed_role,
                Authority::Role(RoleAuthority {
                    id: "role-1",
                    kind: "member",
                    name_sealed: &sealed_credential,
                    mask: 3,
                    rank: 5,
                }),
            ),
            (signed_role, role_authority(&other_credential, 3, 5)),
            (signed_role, role_authority(&sealed_credential, 7, 5)),
            (signed_role, role_authority(&sealed_credential, 3, 6)),
            // workspace: database_name, database_hostname
            (
                signed_workspace,
                workspace_authority("rentable-other-ledger", CHECKED_IN_DATABASE_HOSTNAME),
            ),
            (
                signed_workspace,
                workspace_authority(CHECKED_IN_DATABASE_NAME, "elsewhere.turso.io"),
            ),
            // grant: every field of it
            (
                signed_grant,
                Authority::Grant(GrantAuthority {
                    member_id: "member-2",
                    workspace_id: CHECKED_IN_WORKSPACE_ID,
                    sealed_credential: &sealed_credential,
                    access_level: CHECKED_IN_ACCESS_LEVEL,
                    credential_expires_at: Some(CHECKED_IN_EXPIRES_AT),
                }),
            ),
            (
                signed_grant,
                Authority::Grant(GrantAuthority {
                    member_id: CHECKED_IN_MEMBER_ID,
                    workspace_id: "workspace-2",
                    sealed_credential: &sealed_credential,
                    access_level: CHECKED_IN_ACCESS_LEVEL,
                    credential_expires_at: Some(CHECKED_IN_EXPIRES_AT),
                }),
            ),
            (
                signed_grant,
                Authority::Grant(GrantAuthority {
                    member_id: CHECKED_IN_MEMBER_ID,
                    workspace_id: CHECKED_IN_WORKSPACE_ID,
                    sealed_credential: &other_credential,
                    access_level: CHECKED_IN_ACCESS_LEVEL,
                    credential_expires_at: Some(CHECKED_IN_EXPIRES_AT),
                }),
            ),
            (
                signed_grant,
                Authority::Grant(GrantAuthority {
                    member_id: CHECKED_IN_MEMBER_ID,
                    workspace_id: CHECKED_IN_WORKSPACE_ID,
                    sealed_credential: &sealed_credential,
                    access_level: "read-only",
                    credential_expires_at: Some(CHECKED_IN_EXPIRES_AT),
                }),
            ),
            (
                signed_grant,
                Authority::Grant(GrantAuthority {
                    member_id: CHECKED_IN_MEMBER_ID,
                    workspace_id: CHECKED_IN_WORKSPACE_ID,
                    sealed_credential: &sealed_credential,
                    access_level: CHECKED_IN_ACCESS_LEVEL,
                    credential_expires_at: None,
                }),
            ),
            // the organization's name: the name as sealed, and when it was set
            (
                signed_name,
                organization_name_authority(&other_credential, CHECKED_IN_NAMED_AT),
            ),
            (
                signed_name,
                organization_name_authority(&sealed_credential, CHECKED_IN_NAMED_AT + 1),
            ),
        ];

        for (signed, rewritten) in rewrites {
            let signature = sign(
                &organization.administrator_key,
                &organization.certificate,
                signed,
            )
            .expect("failed to sign");

            assert_eq!(
                verify_under(
                    &organization.verifying_key,
                    &organization.certificate,
                    rewritten,
                    &signature
                ),
                Err(Error::Integrity {
                    message: FORGED_ROW.to_string(),
                }),
                "rewriting {signed:?} to {rewritten:?} was accepted"
            );
        }
    }

    #[test]
    fn every_field_a_certificate_signs_changes_its_signature() {
        let organization = an_organization();
        let (manager_key, manager) = delegate(
            &organization.administrator_key,
            &organization.certificate,
            "manager",
            MANAGER_ROLE.mask,
            MANAGER_ROLE.rank,
        );
        let public_key = checked_in_member_public_key();
        let authority = member_authority(&public_key, "member");
        let signature = sign(&manager_key, &manager, authority).expect("failed to sign");
        let judged = |rewritten: &Certificate| {
            verify(
                &organization.verifying_key,
                &[organization.certificate.clone(), rewritten.clone()],
                &[],
                rewritten,
                authority,
                &signature,
            )
        };

        // the fields a row's own preimage does not carry are caught by the issuer's signature,
        // or by nothing at all. A narrower ceiling or a lower rank is exactly what a holder
        // would never forge, and it is refused all the same: the signature is over what the
        // issuer issued and nothing else.
        for rewritten in [
            Certificate {
                member_id: "member-b".to_string(),
                ..manager.clone()
            },
            Certificate {
                ceiling: manager.ceiling & !mask_of(&[Flag::InviteMember]),
                ..manager.clone()
            },
            Certificate {
                rank: manager.rank - 1,
                ..manager.clone()
            },
            Certificate {
                issued_at: "2020-01-01T00:00:00Z".to_string(),
                ..manager.clone()
            },
        ] {
            assert_eq!(
                judged(&rewritten),
                Err(Error::Integrity {
                    message: FORGED_BY_ISSUER.to_string(),
                }),
                "a rewritten certificate was accepted: {rewritten:?}"
            );
        }

        // the issuer itself, rewritten to name no issuer: the root is the pinned key's, and
        // this is not.
        assert_eq!(
            judged(&Certificate {
                issuer_certificate_id: None,
                ..manager.clone()
            }),
            Err(Error::Integrity {
                message: FORGED_CERTIFICATE.to_string(),
            })
        );

        // the other two are caught by the row's check instead, because a row's preimage names its
        // certificate and is verified against the key that certificate carries.
        for rewritten in [
            Certificate {
                id: "certificate-b".to_string(),
                ..manager.clone()
            },
            Certificate {
                signing_public_key: AdministratorKey::generate()
                    .expect("failed to generate")
                    .verifying_key(),
                ..manager.clone()
            },
        ] {
            assert_eq!(
                judged(&rewritten),
                Err(Error::Integrity {
                    message: FORGED_ROW.to_string(),
                }),
                "a rewritten certificate was accepted: {rewritten:?}"
            );
        }
    }

    #[test]
    fn a_members_vault_is_not_under_signature_so_a_password_change_needs_no_signer() {
        // `sealed_secret_key`, `kdf_salt` and `kdf_params` are deliberately not
        // signed, and this is what that buys. A member changes their password on a
        // database they hold full access to, rewrites the three columns a change
        // rewrites, and the authority somebody above them signed for them still
        // verifies. Signed, every password change would need that somebody.
        let cost = KdfParams {
            memory_kib: 1024,
            iterations: 2,
            lanes: 1,
        };
        let organization = an_organization();
        let vault = vault::create_vault("the old password", cost).expect("failed to create");
        let signature = sign(
            &organization.administrator_key,
            &organization.certificate,
            member_authority(&vault.public_key, "member"),
        )
        .expect("failed to sign");

        let secret_key = vault::open_vault("the old password", &vault).expect("failed to open");
        let changed =
            vault::reseal_vault(&secret_key, "the new password", cost).expect("failed to reseal");

        assert_ne!(changed.sealed_secret_key, vault.sealed_secret_key);
        assert_ne!(changed.kdf_salt, vault.kdf_salt);
        assert_eq!(
            verify_under(
                &organization.verifying_key,
                &organization.certificate,
                member_authority(&changed.public_key, "member"),
                &signature
            ),
            Ok(()),
            "a password change invalidated a member's authority"
        );
    }

    // the encoding means one thing

    #[test]
    fn two_rows_that_differ_only_in_where_a_field_ends_do_not_share_a_signature() {
        // without a length in front of every field, a grant naming member `ab` and
        // workspace `c` signs the same bytes as one naming member `a` and
        // workspace `bc`, and one signature then covers both rows.
        let sealed_credential = hex(CHECKED_IN_SEALED_CREDENTIAL);

        let split_one = Authority::Grant(GrantAuthority {
            member_id: "ab",
            workspace_id: "c",
            sealed_credential: &sealed_credential,
            access_level: CHECKED_IN_ACCESS_LEVEL,
            credential_expires_at: None,
        });
        let split_other = Authority::Grant(GrantAuthority {
            member_id: "a",
            workspace_id: "bc",
            sealed_credential: &sealed_credential,
            access_level: CHECKED_IN_ACCESS_LEVEL,
            credential_expires_at: None,
        });

        assert_ne!(
            preimage("certificate-a", split_one),
            preimage("certificate-a", split_other)
        );
    }

    #[test]
    fn a_grant_that_never_expires_is_not_a_grant_that_expires_at_nothing() {
        let sealed_credential = hex(CHECKED_IN_SEALED_CREDENTIAL);

        let never = Authority::Grant(GrantAuthority {
            member_id: CHECKED_IN_MEMBER_ID,
            workspace_id: CHECKED_IN_WORKSPACE_ID,
            sealed_credential: &sealed_credential,
            access_level: CHECKED_IN_ACCESS_LEVEL,
            credential_expires_at: None,
        });
        let at_nothing = Authority::Grant(GrantAuthority {
            member_id: CHECKED_IN_MEMBER_ID,
            workspace_id: CHECKED_IN_WORKSPACE_ID,
            sealed_credential: &sealed_credential,
            access_level: CHECKED_IN_ACCESS_LEVEL,
            credential_expires_at: Some(""),
        });

        assert_ne!(
            preimage("certificate-a", never),
            preimage("certificate-a", at_nothing)
        );
    }

    #[test]
    fn a_root_is_not_a_certificate_whose_issuer_is_named_nothing() {
        let root = checked_in_certificate();
        let named_nothing = Certificate {
            issuer_certificate_id: Some(String::new()),
            ..root.clone()
        };

        assert_ne!(
            certificate_preimage(&root),
            certificate_preimage(&named_nothing)
        );
    }

    #[test]
    fn a_signature_over_one_kind_of_row_does_not_verify_as_another() {
        // the domain in front of every preimage is what stops a workspace record
        // being read as the member row that makes somebody a manager.
        let organization = an_organization();
        let signed = workspace_authority("member-1", "manager");
        let signature = sign(
            &organization.administrator_key,
            &organization.certificate,
            signed,
        )
        .expect("failed to sign");
        let read_as_a_member = member_authority("member-1".as_bytes(), "manager");

        assert_eq!(
            verify_under(
                &organization.verifying_key,
                &organization.certificate,
                read_as_a_member,
                &signature
            ),
            Err(Error::Integrity {
                message: FORGED_ROW.to_string(),
            })
        );
    }

    // fixed vectors, so a dependency upgrade that changes the scheme fails the
    // suite instead of signing something different and passing

    /// The manager certificate the checked-in root issues, to the same key: a delegated link
    /// with fixed bytes.
    fn checked_in_delegated_certificate() -> Certificate {
        issue_certificate(
            &checked_in_administrator_key(),
            &checked_in_certificate(),
            Issue {
                id: "certificate-2",
                member_id: "member-2",
                signing_public_key: &hex_array(CHECKED_IN_ADMINISTRATOR_VERIFYING_KEY),
                ceiling: MANAGER_ROLE.mask,
                rank: MANAGER_ROLE.rank,
                issued_at: "2026-08-31T00:00:00Z",
            },
        )
        .expect("failed to issue")
    }

    /// The checked-in root revoking the checked-in manager certificate.
    fn checked_in_revocation() -> Revocation {
        revoke(
            &checked_in_administrator_key(),
            &checked_in_certificate(),
            &checked_in_delegated_certificate(),
            "2026-09-01T00:00:00Z",
        )
        .expect("failed to revoke")
    }

    /// When the checked-in organization name was set, in milliseconds.
    const CHECKED_IN_NAMED_AT: i64 = 1_757_000_000_000;

    /// The organization's signed name (effort 851), over whatever sealed bytes the caller hands.
    fn organization_name_authority(name_sealed: &[u8], updated_at: i64) -> Authority<'_> {
        Authority::OrganizationName {
            name_sealed,
            updated_at,
        }
    }

    fn checked_in_role_authority(name_sealed: &[u8]) -> Authority<'_> {
        Authority::Role(RoleAuthority {
            id: "role-1",
            kind: "custom",
            name_sealed,
            mask: mask_of(&[Flag::ViewComplex, Flag::ViewUnit]),
            rank: 500_000,
        })
    }

    #[test]
    fn a_checked_in_chain_and_row_match_an_implementation_outside_this_crate() {
        // every signature below was produced by OpenSSL 3.5.7's Ed25519, over
        // preimages built by a separate encoder. Ed25519 is deterministic, so this
        // pins signing as well as verification. *Regenerated by effort 838 for the
        // v2 certificate, the revocation, the role row and `member.v3`; the other
        // rows' signatures did not move, because a row signs its certificate's id
        // and not its fields.*
        let certificate = checked_in_certificate();
        let delegated = checked_in_delegated_certificate();
        let revocation = checked_in_revocation();
        let administrator_key = checked_in_administrator_key();
        let organization_verifying_key: [u8; VERIFYING_KEY_BYTES] =
            hex_array(CHECKED_IN_ORGANIZATION_VERIFYING_KEY);
        let public_key = checked_in_member_public_key();
        let sealed_credential = hex(CHECKED_IN_SEALED_CREDENTIAL);

        assert_eq!(
            to_hex(&certificate.signature),
            concat!(
                "c8861767055d997fbcc3fc989fe39d68c3f90dddcaf891a1d8b695f7f29d7eae",
                "89e0e4b7e1fa54810af3c4a40f484389b026ca578c8b83cc89b4d5380ac1870a",
            )
        );
        assert_eq!(
            to_hex(&delegated.signature),
            concat!(
                "3cd37c8f4316db737196fde02d98d9f5c352c43eecd9541f9fcda3ba72002957",
                "71a95ea9a97e84f5c6666d903358a92f42d3ad6b9709f7b63ca9d1e2c0052b00",
            )
        );
        assert_eq!(
            to_hex(&revocation.signature),
            concat!(
                "066582dfd001a5c641ce9e5737af583a34e814dc8d93a557e94ae265c7bda8a3",
                "d09f1afc91aa84390de41bd0107b7e553360812cdc96a4c8e1deb12642fdb90b",
            )
        );

        let chain = Chain::new(
            &organization_verifying_key,
            std::slice::from_ref(&certificate),
            &[],
        )
        .with_roles(built_in_roles());

        for (authority, expected) in [
            (
                member_authority(&public_key, "manager"),
                concat!(
                    "0d6579591868b611eb29691fb003258311f663d09186110cf1727bd0d0cb4450",
                    "8894c542a788bd648399e27463caed5a9aaecf63568942f66a73f777aa7b5305",
                ),
            ),
            (
                checked_in_role_authority(&sealed_credential),
                concat!(
                    "4738d55f891ef42ffbf498a5d2c60b12ef51ef5a0169f3d255cf98767268bc4e",
                    "5ad9fb48fd9914627fb1794a83352d320e563d46a46ba386e8d3175f579d3500",
                ),
            ),
            (
                workspace_authority(CHECKED_IN_DATABASE_NAME, CHECKED_IN_DATABASE_HOSTNAME),
                concat!(
                    "0c8a60d6e6e55bee2661f5a6d13a0742b974fa36cc458e3721ff16264a53b4b1",
                    "dae651b8c619b0feb3c77b8f3180965f4b30a1b5a79f89b4b95ae6cecbc9f50f",
                ),
            ),
            (
                grant_authority(&sealed_credential),
                concat!(
                    "28f6b7bdd9df90f859857417127566f878a724b4ed3307f58b92d3e68a64db65",
                    "d90eee65c2b3d6beacfae2c0481b75274f6b4cd3818513f8488cf00386de790b",
                ),
            ),
            // added by effort 851, from the same OpenSSL over the vector above.
            (
                organization_name_authority(&sealed_credential, CHECKED_IN_NAMED_AT),
                concat!(
                    "16766c73d99733a9b015475f6408b5fae7ccd0d4a2c246268a9b50055b71cde2",
                    "86f063181218d783c6cb177c8808ace6c9c3e0091557751397ba7693e1890400",
                ),
            ),
        ] {
            let signature =
                sign(&administrator_key, &certificate, authority).expect("failed to sign");

            assert_eq!(
                to_hex(&signature),
                expected,
                "signing produced different bytes for {authority:?}"
            );
            assert_eq!(
                chain.verify(&certificate.id, authority, &hex(expected)),
                Ok(()),
                "a checked-in signature stopped verifying for {authority:?}"
            );
        }

        // and the delegated link and the revocation verify as a reader walks them.
        let certificates = [certificate.clone(), delegated.clone()];

        assert!(
            Chain::new(&organization_verifying_key, &certificates, &[])
                .live(&delegated.id)
                .is_ok()
        );
        assert!(
            Chain::new(
                &organization_verifying_key,
                &certificates,
                std::slice::from_ref(&revocation)
            )
            .live(&delegated.id)
            .is_err()
        );
    }
}
