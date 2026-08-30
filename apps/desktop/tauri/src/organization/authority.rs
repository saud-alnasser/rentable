//! the certificate chain: issue, sign, verify, revoke.
//!
//! Pure functions over bytes, like the vault beside it. Nothing here opens a
//! database, reaches a network, or crosses the IPC boundary, and nothing here
//! knows what a password is. Whether a password opens a vault is the vault's
//! question and stays there, because one module answering both would let a
//! reviewer check one and believe they had checked both.
//!
//! # Why a signature at all
//!
//! Turso mints whole-database credentials and nothing finer exists, so every
//! member who can write the organization database can write every row of it.
//! There is no server to refuse them and no per-row permission to hide behind. A
//! signature is the only thing left that can make a row's authority proof against
//! its own reader.
//!
//! # The chain has two levels
//!
//! The organization key signs an administrator's signing key as a certificate.
//! That administrator signs the rows they create. A reader verifies both, against
//! an organization verifying key it was handed rather than one it read.
//!
//! Two levels rather than one because a compromised administrator is then revoked
//! by one row: nothing is re-sealed, no member changes their password, and no join
//! link is reissued. Under a single shared key, recovery means replacing the key,
//! re-signing every row, and reissuing every link, which is expensive enough that
//! it gets deferred, and a deferred recovery is a compromise still running.
//!
//! # Verification has one implementation
//!
//! [`verify`] is the only function here that returns a row's verdict, and the
//! three checks it makes are not separately callable. That is deliberate. The
//! failure this design has is named in the plan: **a client that verifies the row
//! and forgets the certificate accepts a revoked administrator**, and it arrives
//! as a second verifier written at a call site for convenience, not as a bug in
//! this file.
//!
//! # What a failure says
//!
//! Which of the three checks refused a row, which is the opposite of what the
//! vault does and is deliberate. The vault's failures are indistinguishable
//! because a wrong password is guessable offline and any distinction is an oracle.
//! Nothing here is guessable: every input to verification is already public to
//! anybody holding the database. So telling a reader which check failed hands an
//! attacker nothing and hands an operator the difference between a forged row and
//! an administrator who was revoked last week.
//!
//! # What this cannot stop
//!
//! Deletion. A member who can write the database can destroy rows they cannot
//! forge, and no signature prevents that. The answer is Turso's point-in-time
//! restore, which belongs to the customer's account and is not in this
//! application. **Do not answer it here with an append-only log**: there is no
//! compare-and-set underneath to build one on.
//!
//! The same limit covers revocation, which is a row rather than a signature.
//! Nothing here can tell a revocation the owner wrote from one anybody wrote, in
//! exactly the way nothing can tell a deleted row from one that never existed.

use std::fmt;

use ed25519_dalek::{Signature, Signer, SigningKey, VerifyingKey};

use crate::error::Error;

/// The width of an Ed25519 signing key, at either level of the chain.
pub const SIGNING_KEY_BYTES: usize = 32;

/// The width of an Ed25519 verifying key, at either level of the chain.
pub const VERIFYING_KEY_BYTES: usize = 32;

/// The width of an Ed25519 signature.
pub const SIGNATURE_BYTES: usize = 64;

/// Separates a certificate's preimage from every row's.
const CERTIFICATE_DOMAIN: &[u8] = b"rentable.organization.authority.certificate.v1";

/// Separates a `member` row's preimage from every other row's.
const MEMBER_DOMAIN: &[u8] = b"rentable.organization.authority.member.v1";

/// Separates a `workspace` row's preimage from every other row's.
const WORKSPACE_DOMAIN: &[u8] = b"rentable.organization.authority.workspace.v1";

/// Separates a `grant` row's preimage from every other row's.
const GRANT_DOMAIN: &[u8] = b"rentable.organization.authority.grant.v1";

/// The first check's refusal: the row does not carry the signature the
/// certificate it names would have produced.
const FORGED_ROW: &str = "the row is not signed by the certificate it names";

/// The second check's refusal: the certificate is not one the organization key
/// issued, so nothing it authorises means anything.
const FORGED_CERTIFICATE: &str = "the certificate was not issued by the organization key";

/// The third check's refusal, and the one a client that stops after the first two
/// never reaches.
const REVOKED_CERTIFICATE: &str = "the certificate that signed the row has been revoked";

/// The organization's key. It signs administrator certificates and nothing else.
///
/// **Separate from [`AdministratorKey`] on purpose, and the duplication below is
/// the point.** The whole content of a two-level chain is that the two levels are
/// not interchangeable: an administrator cannot issue themselves a certificate,
/// and the compiler is what says so rather than a comment somebody has to read.
pub struct OrganizationKey(SigningKey);

/// An administrator's key. It signs rows and nothing else.
pub struct AdministratorKey(SigningKey);

/// An administrator certificate as the row carries it.
///
/// `signature_by_organization_key` covers `id`, `member_id`, `signing_public_key`
/// and `issued_at`. It does not cover `revoked_at`, which is written afterwards by
/// whoever revokes and could not have been signed at issue.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Certificate {
    /// What a signed row names to say which certificate authorises it.
    pub id: String,
    /// The member this certificate makes an administrator.
    pub member_id: String,
    /// The Ed25519 verifying key whose signatures this certificate authorises.
    pub signing_public_key: [u8; VERIFYING_KEY_BYTES],
    /// The organization key's signature over the four fields above.
    pub signature_by_organization_key: Vec<u8>,
    /// When it was issued.
    pub issued_at: String,
    /// When it stopped being an authority, if it has.
    pub revoked_at: Option<String>,
}

/// The authority fields of one row: exactly what its signature covers, and
/// nothing else the row happens to carry.
///
/// The three variants are the three rows the plan gives signed fields. A fourth
/// row grows a signature the day something needs one, and it arrives here rather
/// than as a second encoding somewhere else.
#[derive(Clone, Copy, Debug)]
pub enum Authority<'a> {
    /// A `member` row.
    Member(MemberAuthority<'a>),
    /// A `workspace` row.
    Workspace(WorkspaceAuthority<'a>),
    /// A `grant` row.
    Grant(GrantAuthority<'a>),
}

/// What a `member` row puts under signature.
///
/// **`sealed_secret_key`, `kdf_salt` and `kdf_params` are deliberately absent, and
/// their absence is load-bearing.** They are the member's own vault: rewriting
/// them locks the member out and harms nobody else, so they do not need an
/// administrator's signature. That is exactly what makes a password change a write
/// a member may perform on a database they hold full access to. Signed, every
/// password change would need an administrator present.
///
/// **There is no `id` here either**, and the field that stands in for one is
/// `public_key`. A member who copies another member's signed tuple onto their own
/// row takes that member's public key with it, and the vault binds a sealed secret
/// key to the public key it belongs to, so the row they built opens for nobody.
#[derive(Clone, Copy, Debug)]
pub struct MemberAuthority<'a> {
    /// The public half of the member's keypair, as the column holds it. This
    /// module does not know what kind of key it is, only that these are the bytes
    /// under signature.
    pub public_key: &'a [u8],
    /// What the member is called. `packages/workspace-permission` owns this
    /// vocabulary; nothing here interprets the value, which is why a role this
    /// build has never heard of is still unforgeable.
    pub role: &'a str,
    /// What the member may administer, as the column holds it.
    pub permissions: i64,
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

impl OrganizationKey {
    /// Draws a new organization key. There is one of these per organization and
    /// the owner holds it.
    pub fn generate() -> Result<Self, Error> {
        Ok(Self(generate_signing_key()?))
    }

    /// Reads a key back from the bytes the caller sealed.
    pub fn from_bytes(bytes: &[u8; SIGNING_KEY_BYTES]) -> Self {
        Self(SigningKey::from_bytes(bytes))
    }

    /// The bytes to seal. This module has nowhere to put a key and no opinion
    /// about where one goes; sealing it is the caller's, and the vault's.
    pub fn to_bytes(&self) -> [u8; SIGNING_KEY_BYTES] {
        self.0.to_bytes()
    }

    /// The half that goes in the join link and is pinned on every machine that
    /// joins. It is an input to [`verify`] and is never read back out of the
    /// database being verified.
    pub fn verifying_key(&self) -> [u8; VERIFYING_KEY_BYTES] {
        self.0.verifying_key().to_bytes()
    }
}

/// Redacted, for the reason the vault's keys are: a key that renders itself
/// reaches a log the first time somebody prints a struct holding one.
impl fmt::Debug for OrganizationKey {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("OrganizationKey(redacted)")
    }
}

impl AdministratorKey {
    /// Draws a new administrator key. One per administrator, drawn on the machine
    /// that will hold it.
    pub fn generate() -> Result<Self, Error> {
        Ok(Self(generate_signing_key()?))
    }

    /// Reads a key back from the bytes the caller sealed.
    pub fn from_bytes(bytes: &[u8; SIGNING_KEY_BYTES]) -> Self {
        Self(SigningKey::from_bytes(bytes))
    }

    /// The bytes to seal, as [`OrganizationKey::to_bytes`].
    pub fn to_bytes(&self) -> [u8; SIGNING_KEY_BYTES] {
        self.0.to_bytes()
    }

    /// The half a certificate names, and the half every reader checks a row
    /// against.
    pub fn verifying_key(&self) -> [u8; VERIFYING_KEY_BYTES] {
        self.0.verifying_key().to_bytes()
    }
}

/// Redacted, for the reason [`OrganizationKey`]'s is.
impl fmt::Debug for AdministratorKey {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("AdministratorKey(redacted)")
    }
}

impl Certificate {
    /// The same certificate, revoked.
    ///
    /// **Revocation is a row rather than a signature**, so this changes a field
    /// the issue signature never covered and leaves that signature intact. What
    /// that costs is stated at the top of this file: nothing here can tell an
    /// authentic revocation from a hostile one, in the way nothing can tell a
    /// deleted row from one that never existed.
    pub fn revoked(&self, revoked_at: &str) -> Self {
        Self {
            revoked_at: Some(revoked_at.to_string()),
            ..self.clone()
        }
    }
}

/// Issues an administrator certificate under the organization key.
pub fn issue_certificate(
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
        signature_by_organization_key: Vec::new(),
        issued_at: issued_at.to_string(),
        revoked_at: None,
    };

    certificate.signature_by_organization_key = organization_key
        .0
        .sign(&certificate_preimage(&certificate))
        .to_bytes()
        .to_vec();

    certificate
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
        return Err(Error::InvalidInput {
            message: "the signing key is not the one the certificate names".to_string(),
        });
    }

    Ok(administrator_key
        .0
        .sign(&preimage(&certificate.id, authority))
        .to_bytes()
        .to_vec())
}

/// Verifies a row against the chain. **The only place a signature is checked.**
///
/// Three checks, in this order and with no path to `Ok` that misses one: the row's
/// own signature, the certificate that authorises it, and that the certificate has
/// not been revoked.
///
/// `organization_verifying_key` is an input because it has to be. It arrives
/// pinned in the join link and is stored on the machine; reading it out of the
/// database being verified would let whoever rewrote the rows rewrite the key that
/// judges them, and every signature would check out.
pub fn verify(
    organization_verifying_key: &[u8; VERIFYING_KEY_BYTES],
    certificate: &Certificate,
    authority: Authority<'_>,
    signature: &[u8],
) -> Result<(), Error> {
    // 1. the row, against the key its certificate names.
    verify_signature(
        &certificate.signing_public_key,
        &preimage(&certificate.id, authority),
        signature,
        FORGED_ROW,
    )?;

    // 2. that certificate, against the key the caller pinned.
    verify_signature(
        organization_verifying_key,
        &certificate_preimage(certificate),
        &certificate.signature_by_organization_key,
        FORGED_CERTIFICATE,
    )?;

    // 3. and that it is still an authority. Last, and the only `Ok` in this
    //    function is below it.
    if certificate.revoked_at.is_some() {
        return Err(Error::Integrity {
            message: REVOKED_CERTIFICATE.to_string(),
        });
    }

    Ok(())
}

/// One signature check. Private, and it stays private: a caller able to reach this
/// could check a row and skip the certificate, which is the whole failure mode
/// this module is shaped to prevent.
fn verify_signature(
    verifying_key: &[u8; VERIFYING_KEY_BYTES],
    message: &[u8],
    signature: &[u8],
    refusal: &str,
) -> Result<(), Error> {
    let refuse = || Error::Integrity {
        message: refusal.to_string(),
    };

    let verifying_key = VerifyingKey::from_bytes(verifying_key).map_err(|_| refuse())?;
    let signature = Signature::from_slice(signature).map_err(|_| refuse())?;

    // `verify_strict` rather than `verify`: it refuses a small-order key and a
    // non-canonical point, so one signature has one verdict everywhere rather than
    // a verdict that depends on which implementation asked.
    verifying_key
        .verify_strict(message, &signature)
        .map_err(|_| refuse())
}

/// What an administrator signs when they sign a row.
fn preimage(certificate_id: &str, authority: Authority<'_>) -> Vec<u8> {
    let mut message = Vec::new();

    // every arm names its fields rather than taking `..`, so a column added to a
    // signed row is a compile error here instead of a field nobody signed.
    match authority {
        Authority::Member(MemberAuthority {
            public_key,
            role,
            permissions,
        }) => {
            message.extend_from_slice(MEMBER_DOMAIN);
            field(&mut message, certificate_id.as_bytes());
            field(&mut message, public_key);
            field(&mut message, role.as_bytes());
            field(&mut message, &permissions.to_be_bytes());
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
    }

    message
}

/// What the organization key signs when it issues a certificate.
fn certificate_preimage(certificate: &Certificate) -> Vec<u8> {
    // named field by field rather than with `..`, for the reason the arms above
    // are. The two named and discarded are the deliberate exclusions: a signature
    // cannot cover itself, and `revoked_at` does not exist yet when this is signed.
    let Certificate {
        id,
        member_id,
        signing_public_key,
        signature_by_organization_key: _,
        issued_at,
        revoked_at: _,
    } = certificate;

    let mut message = CERTIFICATE_DOMAIN.to_vec();

    field(&mut message, id.as_bytes());
    field(&mut message, member_id.as_bytes());
    field(&mut message, signing_public_key);
    field(&mut message, issued_at.as_bytes());

    message
}

/// One field of a preimage: how long it is, then what it is.
///
/// **The length is what makes the encoding mean one thing.** Concatenated without
/// it, a grant naming member `ab` and workspace `c` produces the same bytes as one
/// naming member `a` and workspace `bc`, so a signature over either is a signature
/// over both.
fn field(message: &mut Vec<u8>, bytes: &[u8]) {
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

/// A signing key drawn the way this crate already draws random bytes.
fn generate_signing_key() -> Result<SigningKey, Error> {
    let mut bytes = [0_u8; SIGNING_KEY_BYTES];

    getrandom::fill(&mut bytes).map_err(|error| Error::Internal {
        message: format!("failed to draw random bytes for a signing key: {error}"),
    })?;

    Ok(SigningKey::from_bytes(&bytes))
}

#[cfg(test)]
mod tests {
    use super::*;

    use crate::organization::vault::{self, KdfParams};

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

    /// The same section's second secret key, standing in for an administrator's.
    const CHECKED_IN_ADMINISTRATOR_SEED: &str =
        "4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb";
    const CHECKED_IN_ADMINISTRATOR_VERIFYING_KEY: &str =
        "3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c";

    const CHECKED_IN_CERTIFICATE_ID: &str = "certificate-1";
    const CHECKED_IN_MEMBER_ID: &str = "member-1";
    const CHECKED_IN_ISSUED_AT: &str = "2026-08-30T00:00:00Z";
    const CHECKED_IN_MEMBER_PUBLIC_KEY: &str =
        "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20";
    const CHECKED_IN_DATABASE_NAME: &str = "rentable-acme-ledger";
    const CHECKED_IN_DATABASE_HOSTNAME: &str = "acme-ledger-rentable.aws-eu-west-1.turso.io";
    const CHECKED_IN_SEALED_CREDENTIAL: &str = "a1b2c3d4";
    const CHECKED_IN_WORKSPACE_ID: &str = "workspace-1";
    const CHECKED_IN_ACCESS_LEVEL: &str = "full-access";
    const CHECKED_IN_EXPIRES_AT: &str = "2026-09-30T00:00:00Z";

    /// What `ADMINISTRATION_BY_ROLE.administrator` is in
    /// `packages/workspace-permission`: `inviteMember`, `removeMember` and
    /// `changeRole`, which is bits 0, 1 and 2. Written out rather than imported,
    /// because this module signs whatever the column holds and never reads it.
    const ADMINISTRATOR_PERMISSIONS: i64 = 7;

    fn checked_in_organization_key() -> OrganizationKey {
        OrganizationKey::from_bytes(&hex_array(CHECKED_IN_ORGANIZATION_SEED))
    }

    fn checked_in_administrator_key() -> AdministratorKey {
        AdministratorKey::from_bytes(&hex_array(CHECKED_IN_ADMINISTRATOR_SEED))
    }

    /// The certificate the vectors below pin. Issued at a fixed moment under a
    /// fixed key, so its bytes are the same on every machine that runs this.
    fn checked_in_certificate() -> Certificate {
        issue_certificate(
            &checked_in_organization_key(),
            CHECKED_IN_CERTIFICATE_ID,
            CHECKED_IN_MEMBER_ID,
            &hex_array(CHECKED_IN_ADMINISTRATOR_VERIFYING_KEY),
            CHECKED_IN_ISSUED_AT,
        )
    }

    fn member_authority<'a>(public_key: &'a [u8], role: &'a str) -> Authority<'a> {
        Authority::Member(MemberAuthority {
            public_key,
            role,
            permissions: ADMINISTRATOR_PERMISSIONS,
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
        Authority::Grant(GrantAuthority {
            member_id: CHECKED_IN_MEMBER_ID,
            workspace_id: CHECKED_IN_WORKSPACE_ID,
            sealed_credential,
            access_level: CHECKED_IN_ACCESS_LEVEL,
            credential_expires_at: Some(CHECKED_IN_EXPIRES_AT),
        })
    }

    fn checked_in_member_public_key() -> Vec<u8> {
        hex(CHECKED_IN_MEMBER_PUBLIC_KEY)
    }

    /// One organization, one certified administrator, and the keys behind both.
    /// Drawn rather than checked in, so a test using it exercises the chain and
    /// not a vector.
    struct Organization {
        verifying_key: [u8; VERIFYING_KEY_BYTES],
        administrator_key: AdministratorKey,
        certificate: Certificate,
    }

    fn an_organization() -> Organization {
        let organization_key = OrganizationKey::generate().expect("failed to generate");
        let administrator_key = AdministratorKey::generate().expect("failed to generate");
        let certificate = issue_certificate(
            &organization_key,
            "certificate-a",
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

    fn integrity(message: &str) -> Error {
        Error::Integrity {
            message: message.to_string(),
        }
    }

    // a row an administrator signed verifies against the chain

    #[test]
    fn a_member_row_signed_by_a_certified_administrator_verifies() {
        let organization = an_organization();
        let public_key = checked_in_member_public_key();
        let authority = member_authority(&public_key, "member");

        let signature = sign(
            &organization.administrator_key,
            &organization.certificate,
            authority,
        )
        .expect("failed to sign");

        assert_eq!(
            verify(
                &organization.verifying_key,
                &organization.certificate,
                authority,
                &signature
            ),
            Ok(())
        );
    }

    #[test]
    fn a_workspace_row_signed_by_a_certified_administrator_verifies() {
        let organization = an_organization();
        let authority = workspace_authority(CHECKED_IN_DATABASE_NAME, CHECKED_IN_DATABASE_HOSTNAME);

        let signature = sign(
            &organization.administrator_key,
            &organization.certificate,
            authority,
        )
        .expect("failed to sign");

        assert_eq!(
            verify(
                &organization.verifying_key,
                &organization.certificate,
                authority,
                &signature
            ),
            Ok(())
        );
    }

    #[test]
    fn a_grant_row_signed_by_a_certified_administrator_verifies() {
        let organization = an_organization();
        let sealed_credential = hex(CHECKED_IN_SEALED_CREDENTIAL);
        let authority = grant_authority(&sealed_credential);

        let signature = sign(
            &organization.administrator_key,
            &organization.certificate,
            authority,
        )
        .expect("failed to sign");

        assert_eq!(
            verify(
                &organization.verifying_key,
                &organization.certificate,
                authority,
                &signature
            ),
            Ok(())
        );
    }

    // the attack criterion 16 names, performed

    #[test]
    fn a_member_row_rewritten_by_another_member_is_rejected() {
        // exactly criterion 16. A member holds a full-access credential to the
        // organization database, so this row is theirs to write. All three fields
        // are here because forging any of them is the same attack wearing a
        // different field, and the one that matters is `role`.
        let organization = an_organization();
        let public_key = checked_in_member_public_key();
        let signed = member_authority(&public_key, "member");

        let signature = sign(
            &organization.administrator_key,
            &organization.certificate,
            signed,
        )
        .expect("failed to sign");

        // the member promotes themselves
        let promoted = member_authority(&public_key, "administrator");
        assert_eq!(
            verify(
                &organization.verifying_key,
                &organization.certificate,
                promoted,
                &signature
            ),
            Err(integrity(FORGED_ROW)),
            "a rewritten role was accepted"
        );

        // the member points the row at a key they hold the secret half of
        let their_own_key = hex(&"22".repeat(32));
        let taken_over = member_authority(&their_own_key, "member");
        assert_eq!(
            verify(
                &organization.verifying_key,
                &organization.certificate,
                taken_over,
                &signature
            ),
            Err(integrity(FORGED_ROW)),
            "a rewritten public key was accepted"
        );

        // the member points the row at a different certificate, which is what
        // rewriting `certificate_id` does to whoever reads the row
        let elsewhere = an_organization();
        assert_eq!(
            verify(
                &elsewhere.verifying_key,
                &elsewhere.certificate,
                signed,
                &signature
            ),
            Err(integrity(FORGED_ROW)),
            "a rewritten certificate id was accepted"
        );
    }

    // a revoked certificate, tested apart from a forged row

    #[test]
    fn a_row_signed_by_a_certificate_that_was_later_revoked_is_rejected() {
        // the failure mode the plan names by name: a client that verifies the row
        // and forgets the certificate accepts a revoked administrator. Every byte
        // of this row is genuine and it is still refused.
        let organization = an_organization();
        let public_key = checked_in_member_public_key();
        let authority = member_authority(&public_key, "administrator");

        let signature = sign(
            &organization.administrator_key,
            &organization.certificate,
            authority,
        )
        .expect("failed to sign");
        let revoked = organization.certificate.revoked("2026-08-30T12:00:00Z");

        assert_eq!(
            verify(&organization.verifying_key, &revoked, authority, &signature),
            Err(integrity(REVOKED_CERTIFICATE))
        );
    }

    #[test]
    fn a_revoked_certificate_still_carries_the_signature_it_was_issued_with() {
        // this is what makes the check above a third check rather than the second
        // one wearing a hat. Revocation leaves the issue signature untouched, so a
        // reader that stopped after the certificate would find nothing wrong.
        let organization = an_organization();
        let public_key = checked_in_member_public_key();
        let authority = member_authority(&public_key, "administrator");

        let signature = sign(
            &organization.administrator_key,
            &organization.certificate,
            authority,
        )
        .expect("failed to sign");
        let revoked = organization.certificate.revoked("2026-08-30T12:00:00Z");

        assert_eq!(
            revoked.signature_by_organization_key,
            organization.certificate.signature_by_organization_key,
            "revoking rewrote the certificate's own signature"
        );
        assert_eq!(
            verify(&organization.verifying_key, &revoked, authority, &signature),
            Err(integrity(REVOKED_CERTIFICATE))
        );
    }

    #[test]
    fn every_kind_of_row_is_rejected_under_a_revoked_certificate() {
        // one verifier, and no kind of row reaches an Ok without the last check.
        // A second verifier written at a call site is what breaks this.
        let organization = an_organization();
        let public_key = checked_in_member_public_key();
        let sealed_credential = hex(CHECKED_IN_SEALED_CREDENTIAL);
        let revoked = organization.certificate.revoked("2026-08-30T12:00:00Z");

        for authority in [
            member_authority(&public_key, "administrator"),
            workspace_authority(CHECKED_IN_DATABASE_NAME, CHECKED_IN_DATABASE_HOSTNAME),
            grant_authority(&sealed_credential),
        ] {
            let signature = sign(
                &organization.administrator_key,
                &organization.certificate,
                authority,
            )
            .expect("failed to sign");

            assert_eq!(
                verify(&organization.verifying_key, &revoked, authority, &signature),
                Err(integrity(REVOKED_CERTIFICATE)),
                "a revoked certificate authorised {authority:?}"
            );
        }
    }

    // the organization's verifying key is an input, never a column

    #[test]
    fn a_database_re_signed_under_another_organization_key_is_still_rejected() {
        // the whole database is the attacker's to rewrite, `organization
        // .verifying_key` included. So they mint an organization key of their own,
        // issue themselves a certificate under it, and re-sign the row. A verifier
        // that read the key out of the database would accept every byte of this.
        // The one that was handed the key pinned from the join link does not.
        let genuine = an_organization();
        let public_key = checked_in_member_public_key();

        let their_organization_key = OrganizationKey::generate().expect("failed to generate");
        let their_key = AdministratorKey::generate().expect("failed to generate");
        let their_certificate = issue_certificate(
            &their_organization_key,
            "certificate-a",
            "member-a",
            &their_key.verifying_key(),
            "2026-08-30T09:00:00Z",
        );
        let promoted = member_authority(&public_key, "owner");
        let their_signature =
            sign(&their_key, &their_certificate, promoted).expect("failed to sign");

        // against the key they put in the database, everything checks out
        assert_eq!(
            verify(
                &their_organization_key.verifying_key(),
                &their_certificate,
                promoted,
                &their_signature
            ),
            Ok(()),
            "the rewritten chain was not internally consistent, so this proves nothing"
        );

        // against the key the machine holds, it does not
        assert_eq!(
            verify(
                &genuine.verifying_key,
                &their_certificate,
                promoted,
                &their_signature
            ),
            Err(integrity(FORGED_CERTIFICATE))
        );
    }

    #[test]
    fn a_certificate_the_organization_key_did_not_issue_is_rejected() {
        let organization = an_organization();
        let public_key = checked_in_member_public_key();
        let self_appointed = AdministratorKey::generate().expect("failed to generate");

        // an administrator key cannot issue a certificate at all: `issue_
        // certificate` takes an OrganizationKey and there is no path from one type
        // to the other. So this is as close as a member gets, a certificate under
        // a key of their own making.
        let their_organization_key = OrganizationKey::generate().expect("failed to generate");
        let certificate = issue_certificate(
            &their_organization_key,
            "certificate-b",
            "member-b",
            &self_appointed.verifying_key(),
            "2026-08-30T10:00:00Z",
        );
        let authority = member_authority(&public_key, "owner");
        let signature = sign(&self_appointed, &certificate, authority).expect("failed to sign");

        assert_eq!(
            verify(
                &organization.verifying_key,
                &certificate,
                authority,
                &signature
            ),
            Err(integrity(FORGED_CERTIFICATE))
        );
    }

    #[test]
    fn a_row_signed_under_one_certificate_does_not_verify_under_another() {
        let organization = an_organization();
        let public_key = checked_in_member_public_key();
        let authority = member_authority(&public_key, "administrator");
        let renamed = Certificate {
            id: "certificate-b".to_string(),
            ..organization.certificate.clone()
        };

        let signature = sign(
            &organization.administrator_key,
            &organization.certificate,
            authority,
        )
        .expect("failed to sign");

        assert_eq!(
            verify(&organization.verifying_key, &renamed, authority, &signature),
            Err(integrity(FORGED_ROW))
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
                "63657274696669636174652e7631000000000000000d63657274696669636174",
                "652d3100000000000000086d656d6265722d3100000000000000203d4017c3e8",
                "43895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c0000000000",
                "000014323032362d30382d33305430303a30303a30305a",
            ),
            "a certificate covers a different set of fields"
        );

        assert_eq!(
            to_hex(&preimage(
                CHECKED_IN_CERTIFICATE_ID,
                member_authority(&public_key, "administrator")
            )),
            concat!(
                "72656e7461626c652e6f7267616e697a6174696f6e2e617574686f726974792e",
                "6d656d6265722e7631000000000000000d63657274696669636174652d310000",
                "0000000000200102030405060708090a0b0c0d0e0f101112131415161718191a",
                "1b1c1d1e1f20000000000000000d61646d696e6973747261746f720000000000",
                "0000080000000000000007",
            ),
            "a member row covers a different set of fields"
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
        let signed_workspace =
            workspace_authority(CHECKED_IN_DATABASE_NAME, CHECKED_IN_DATABASE_HOSTNAME);
        let signed_grant = grant_authority(&sealed_credential);

        let rewrites: Vec<(Authority<'_>, Authority<'_>)> = vec![
            // member: public_key, role, permissions
            (signed_member, member_authority(&other_public_key, "member")),
            (signed_member, member_authority(&public_key, "owner")),
            (
                signed_member,
                Authority::Member(MemberAuthority {
                    public_key: &public_key,
                    role: "member",
                    permissions: ADMINISTRATOR_PERMISSIONS + 1,
                }),
            ),
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
        ];

        for (signed, rewritten) in rewrites {
            let signature = sign(
                &organization.administrator_key,
                &organization.certificate,
                signed,
            )
            .expect("failed to sign");

            assert_eq!(
                verify(
                    &organization.verifying_key,
                    &organization.certificate,
                    rewritten,
                    &signature
                ),
                Err(integrity(FORGED_ROW)),
                "rewriting {signed:?} to {rewritten:?} was accepted"
            );
        }
    }

    #[test]
    fn every_field_a_certificate_signs_changes_its_signature() {
        let organization = an_organization();
        let public_key = checked_in_member_public_key();
        let authority = member_authority(&public_key, "administrator");
        let signature = sign(
            &organization.administrator_key,
            &organization.certificate,
            authority,
        )
        .expect("failed to sign");

        // `member_id` and `issued_at` are the two a row's own preimage does not
        // carry, so a rewrite of either is caught by the second check or by
        // nothing at all.
        for rewritten in [
            Certificate {
                member_id: "member-b".to_string(),
                ..organization.certificate.clone()
            },
            Certificate {
                issued_at: "2020-01-01T00:00:00Z".to_string(),
                ..organization.certificate.clone()
            },
        ] {
            assert_eq!(
                verify(
                    &organization.verifying_key,
                    &rewritten,
                    authority,
                    &signature
                ),
                Err(integrity(FORGED_CERTIFICATE)),
                "a rewritten certificate was accepted: {rewritten:?}"
            );
        }

        // the other two are caught by the first check instead, because a row's
        // preimage names its certificate and is verified against the key that
        // certificate carries.
        for rewritten in [
            Certificate {
                id: "certificate-b".to_string(),
                ..organization.certificate.clone()
            },
            Certificate {
                signing_public_key: AdministratorKey::generate()
                    .expect("failed to generate")
                    .verifying_key(),
                ..organization.certificate.clone()
            },
        ] {
            assert_eq!(
                verify(
                    &organization.verifying_key,
                    &rewritten,
                    authority,
                    &signature
                ),
                Err(integrity(FORGED_ROW)),
                "a rewritten certificate was accepted: {rewritten:?}"
            );
        }
    }

    #[test]
    fn a_members_vault_is_not_under_signature_so_a_password_change_needs_no_administrator() {
        // `sealed_secret_key`, `kdf_salt` and `kdf_params` are deliberately not
        // signed, and this is what that buys. A member changes their password on a
        // database they hold full access to, rewrites the three columns a change
        // rewrites, and the authority an administrator signed for them still
        // verifies. Signed, every password change would need an administrator.
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
            verify(
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
    fn a_signature_over_one_kind_of_row_does_not_verify_as_another() {
        // the domain in front of every preimage is what stops a workspace record
        // being read as the member row that makes somebody an administrator.
        let organization = an_organization();
        let signed = workspace_authority("member-1", "administrator");
        let signature = sign(
            &organization.administrator_key,
            &organization.certificate,
            signed,
        )
        .expect("failed to sign");
        let read_as_a_member = member_authority("member-1".as_bytes(), "administrator");

        assert_eq!(
            verify(
                &organization.verifying_key,
                &organization.certificate,
                read_as_a_member,
                &signature
            ),
            Err(integrity(FORGED_ROW))
        );
    }

    // nothing here trusts what a column happens to hold

    #[test]
    fn a_signature_that_is_not_a_signature_is_rejected() {
        let organization = an_organization();
        let public_key = checked_in_member_public_key();
        let authority = member_authority(&public_key, "member");

        for signature in [
            Vec::new(),
            vec![0_u8; SIGNATURE_BYTES],
            vec![0xff_u8; SIGNATURE_BYTES],
            vec![0_u8; SIGNATURE_BYTES - 1],
            vec![0_u8; SIGNATURE_BYTES + 1],
        ] {
            assert_eq!(
                verify(
                    &organization.verifying_key,
                    &organization.certificate,
                    authority,
                    &signature
                ),
                Err(integrity(FORGED_ROW)),
                "a signature of {} bytes was accepted",
                signature.len()
            );
        }
    }

    #[test]
    fn a_certificate_carrying_no_usable_signature_is_rejected() {
        let organization = an_organization();
        let public_key = checked_in_member_public_key();
        let authority = member_authority(&public_key, "member");
        let signature = sign(
            &organization.administrator_key,
            &organization.certificate,
            authority,
        )
        .expect("failed to sign");

        for certificate_signature in [Vec::new(), vec![0_u8; SIGNATURE_BYTES]] {
            let certificate = Certificate {
                signature_by_organization_key: certificate_signature,
                ..organization.certificate.clone()
            };

            assert_eq!(
                verify(
                    &organization.verifying_key,
                    &certificate,
                    authority,
                    &signature
                ),
                Err(integrity(FORGED_CERTIFICATE))
            );
        }
    }

    #[test]
    fn the_row_is_checked_first_and_the_revocation_last() {
        // all three checks refuse this row, and the order is what decides which
        // refusal a reader is handed.
        let organization = an_organization();
        let elsewhere = an_organization();
        let public_key = checked_in_member_public_key();
        let authority = member_authority(&public_key, "member");
        let revoked_and_foreign = elsewhere.certificate.revoked("2026-08-30T12:00:00Z");

        assert_eq!(
            verify(
                &organization.verifying_key,
                &revoked_and_foreign,
                authority,
                &[0_u8; SIGNATURE_BYTES]
            ),
            Err(integrity(FORGED_ROW))
        );

        // with the row's own signature good, the certificate answers next
        let signature = sign(
            &elsewhere.administrator_key,
            &revoked_and_foreign,
            authority,
        )
        .expect("failed to sign");
        assert_eq!(
            verify(
                &organization.verifying_key,
                &revoked_and_foreign,
                authority,
                &signature
            ),
            Err(integrity(FORGED_CERTIFICATE))
        );

        // and with that good too, the revocation is what is left
        assert_eq!(
            verify(
                &elsewhere.verifying_key,
                &revoked_and_foreign,
                authority,
                &signature
            ),
            Err(integrity(REVOKED_CERTIFICATE))
        );
    }

    #[test]
    fn signing_with_a_key_the_certificate_does_not_name_is_refused() {
        let organization = an_organization();
        let public_key = checked_in_member_public_key();
        let stranger = AdministratorKey::generate().expect("failed to generate");

        assert_eq!(
            sign(
                &stranger,
                &organization.certificate,
                member_authority(&public_key, "owner")
            ),
            Err(Error::InvalidInput {
                message: "the signing key is not the one the certificate names".to_string()
            })
        );
    }

    // keys

    #[test]
    fn a_verifying_key_matches_the_one_rfc_8032_derives_from_the_same_secret() {
        // RFC 8032 section 7.1, tests 1 and 2, confirmed against OpenSSL 3.5.7.
        assert_eq!(
            to_hex(&checked_in_organization_key().verifying_key()),
            CHECKED_IN_ORGANIZATION_VERIFYING_KEY
        );
        assert_eq!(
            to_hex(&checked_in_administrator_key().verifying_key()),
            CHECKED_IN_ADMINISTRATOR_VERIFYING_KEY
        );
    }

    #[test]
    fn a_signing_key_round_trips_through_the_bytes_the_caller_seals() {
        let organization_key = OrganizationKey::generate().expect("failed to generate");
        let administrator_key = AdministratorKey::generate().expect("failed to generate");

        assert_eq!(
            OrganizationKey::from_bytes(&organization_key.to_bytes()).verifying_key(),
            organization_key.verifying_key()
        );
        assert_eq!(
            AdministratorKey::from_bytes(&administrator_key.to_bytes()).verifying_key(),
            administrator_key.verifying_key()
        );
    }

    #[test]
    fn two_generated_keys_are_not_the_same_key() {
        assert_ne!(
            OrganizationKey::generate()
                .expect("failed to generate")
                .verifying_key(),
            OrganizationKey::generate()
                .expect("failed to generate")
                .verifying_key()
        );
    }

    #[test]
    fn a_key_does_not_render_itself() {
        let organization_key = OrganizationKey::generate().expect("failed to generate");
        let administrator_key = AdministratorKey::generate().expect("failed to generate");

        assert_eq!(format!("{organization_key:?}"), "OrganizationKey(redacted)");
        assert_eq!(
            format!("{administrator_key:?}"),
            "AdministratorKey(redacted)"
        );
    }

    // fixed vectors, so a dependency upgrade that changes the scheme fails the
    // suite instead of signing something different and passing

    #[test]
    fn a_checked_in_certificate_and_row_match_an_implementation_outside_this_crate() {
        // every signature below was produced by OpenSSL 3.5.7's Ed25519, over
        // preimages built by a separate encoder. Ed25519 is deterministic, so this
        // pins signing as well as verification.
        let certificate = checked_in_certificate();
        let administrator_key = checked_in_administrator_key();
        let organization_verifying_key: [u8; VERIFYING_KEY_BYTES] =
            hex_array(CHECKED_IN_ORGANIZATION_VERIFYING_KEY);
        let public_key = checked_in_member_public_key();
        let sealed_credential = hex(CHECKED_IN_SEALED_CREDENTIAL);

        assert_eq!(
            to_hex(&certificate.signature_by_organization_key),
            concat!(
                "d55c5af54992827384e1c5f6c272795c8bbb6b6fe499678f91ccb444d466073a",
                "c96b61c45b1017a58c6f9f561932b41b3991653e14cc6a815c3fbc4694ebdc0c",
            )
        );

        for (authority, expected) in [
            (
                member_authority(&public_key, "administrator"),
                concat!(
                    "e7ddc09a18d2702fa1d08f806d0f46744d239991e6866c0bafc0595632513061",
                    "420fdfa1da9a48c51a84210939455417329ad9b7a77d50b1c32847ca7a1b7204",
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
        ] {
            let signature =
                sign(&administrator_key, &certificate, authority).expect("failed to sign");

            assert_eq!(
                to_hex(&signature),
                expected,
                "signing produced different bytes for {authority:?}"
            );
            assert_eq!(
                verify(
                    &organization_verifying_key,
                    &certificate,
                    authority,
                    &hex(expected)
                ),
                Ok(()),
                "a checked-in signature stopped verifying for {authority:?}"
            );
        }
    }
}
