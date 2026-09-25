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
//! # The chain is delegated (effort 838, requirement 9)
//!
//! The organization key signs one certificate, the owner's, and that is the root.
//! Every other certificate is signed by the certificate that issued it, with the
//! issuer's signing key, and says under that signature how far it reaches: a
//! `ceiling`, the flags its holder may sign for, and a `rank`, how high they stand.
//! A reader walks from a row's certificate to the pinned key, and at every link
//! the certificate must sit inside its issuer: the ceiling within the issuer's, the
//! rank below it, and the issuer holding a flag that administers members. So a
//! manager certifies a signer without the owner, and nobody certifies anybody
//! wider or higher than themselves.
//!
//! *There were two levels until effort 838: the organization key signed every
//! administrator's certificate and nothing said what a certificate was for, so any
//! certified member could sign any row, their own wider member row included.*
//!
//! # A row is checked against what its certificate is for
//!
//! A signature proves who wrote a row; [`covers`] says whether they may have. It
//! is a table from the kind of row to the flag the certificate must carry, and for
//! a row about a person or a role, the rank it must stand above. That is the bound
//! the chain puts on a member who holds the database's credential and signs around
//! a command: rows of the kinds their ceiling names, about people ranked below
//! them. Which flags inside it they may switch is the command's to refuse.
//!
//! # Verification has one implementation
//!
//! [`Chain::verify`] is the only function here that returns a row's verdict, and
//! the checks it makes are not separately callable. That is deliberate. The
//! failure this design has is named in the plan: **a client that verifies the row
//! and forgets the certificate accepts a revoked administrator**, and it arrives
//! as a second verifier written at a call site for convenience, not as a bug in
//! this file.
//!
//! [`verify_succession`] is the one exception and it is not that second verifier
//! (effort 828, requirement 22). A succession names no certificate, because what
//! it tells a reader is which key issues the root from now on; there is nothing
//! behind it to forget, and it can answer about no row.
//!
//! # A revocation is a signed row
//!
//! Signed by the certificate that revokes, which must outrank the one it revokes or
//! be the root. A certificate is revoked when a revocation that verifies names it
//! or any certificate above it. *`revoked_at` was an unsigned column on the
//! certificate until effort 838, so writing a null into it undid a removal.*
//!
//! # The key changes when the owner does
//!
//! An organization key is the current owner's derivation, and handing the
//! organization over replaces it ([`SuccessionAuthority`]). The root is issued again
//! under the new key; a machine holding the old key follows the succession to the
//! new one.
//!
//! # What a failure says
//!
//! Which check refused a row, which is the opposite of what the vault does and is
//! deliberate. The vault's failures are indistinguishable because a wrong password
//! is guessable offline and any distinction is an oracle. Nothing here is
//! guessable: every input to verification is already public to anybody holding the
//! database. So telling a reader which check failed hands an attacker nothing and
//! hands an operator the difference between a forged row and an administrator who
//! was revoked last week.
//!
//! # What this cannot stop
//!
//! Deletion. A member who can write the database can destroy rows they cannot
//! forge, and no signature prevents that. The answer is Turso's point-in-time
//! restore, which belongs to the customer's account and is not in this
//! application. **Do not answer it here with an append-only log**: there is no
//! compare-and-set underneath to build one on. A revocation is a row, so deleting
//! one reinstates what it revoked, in exactly the way deleting a member's row
//! removes them.

use std::{
    cell::{OnceCell, RefCell},
    collections::{HashMap, HashSet},
    fmt,
};

use ed25519_dalek::{Signature, Signer, SigningKey, VerifyingKey};

use crate::{error::Error, sync::turso::platform::AccessLevel};

use super::permission::{self, Flag, MEMBER_ADMINISTRATION, OWNER_ROLE};

/// The width of an Ed25519 signing key, at either level of the chain.
pub const SIGNING_KEY_BYTES: usize = 32;

/// The width of an Ed25519 verifying key, at either level of the chain.
pub const VERIFYING_KEY_BYTES: usize = 32;

/// The width of an Ed25519 signature.
pub const SIGNATURE_BYTES: usize = 64;

/// The most certificates a walk from a row to the pinned key passes through, the root included.
/// An organization of tens of members delegates a few levels at most; a chain longer than this is
/// somebody's construction, and refusing it bounds what one read can be made to cost.
pub const MAXIMUM_DEPTH: usize = 16;

/// Separates a certificate's preimage from every row's. `v2` since effort 838 put the issuer, the
/// ceiling and the rank under the signature: a `v1` signature is over a preimage no certificate
/// carries any more, and the label says so rather than letting the two share a name.
const CERTIFICATE_DOMAIN: &[u8] = b"rentable.organization.authority.certificate.v2";

/// Separates a revocation's preimage from every other (effort 838).
const REVOCATION_DOMAIN: &[u8] = b"rentable.organization.authority.revocation.v1";

/// Separates a `member` row's preimage from every other row's. `v2` since effort 826 put the
/// member's signing public key under the signature: a `v1` signature covers a preimage no row
/// carries any more, and the label says so rather than letting the two share a name.
const MEMBER_DOMAIN: &[u8] = b"rentable.organization.authority.member.v2";

/// Separates a `role` row's preimage from every other row's (effort 838).
const ROLE_DOMAIN: &[u8] = b"rentable.organization.authority.role.v1";

/// Separates a `workspace` row's preimage from every other row's.
const WORKSPACE_DOMAIN: &[u8] = b"rentable.organization.authority.workspace.v1";

/// Separates a `grant` row's preimage from every other row's.
const GRANT_DOMAIN: &[u8] = b"rentable.organization.authority.grant.v1";

/// Separates a `succession` row's preimage from every other row's, and from a certificate's.
///
/// **The one preimage the organization key signs that is not a certificate** (effort 828,
/// requirement 22). A succession is how a machine holding the old key learns which key replaced
/// it, so it cannot be signed under a certificate: a certificate is a thing the reader is being
/// asked to trust, and what the reader has to check here is the key that issues the root.
const SUCCESSION_DOMAIN: &[u8] = b"rentable.organization.authority.succession.v1";

/// What a `succession` row's signature refuses with.
const FORGED_SUCCESSION: &str = "the succession is not signed by the key it says it is leaving";

/// The fourth row, which the invitation ticket gave a signature: the plan's data model gave the
/// row the column, and the ticket that writes one is the ticket that signs it. `v2` since effort
/// 824 put the member id under the signature where the sealed payload was; a `v1` signature is
/// over a preimage no row carries any more, and the label says so rather than letting the two
/// share a name.
const INVITATION_DOMAIN: &[u8] = b"rentable.organization.authority.invitation.v2";

/// Domain separation for the `mark` row: the organization's signature or seal (effort 835).
const MARK_DOMAIN: &[u8] = b"rentable.organization.authority.mark.v1";

/// The first check's refusal: the row does not carry the signature the
/// certificate it names would have produced.
const FORGED_ROW: &str = "the row is not signed by the certificate it names";

/// A root's refusal: the certificate claims to be the owner's and the pinned key did not sign it.
const FORGED_CERTIFICATE: &str = "the certificate was not issued by the organization key";

/// A delegated certificate's refusal: its issuer's key did not sign it.
const FORGED_BY_ISSUER: &str =
    "the certificate is not signed by the certificate it names as its issuer";

/// A certificate names an issuer nobody holds.
const UNKNOWN_ISSUER: &str = "the certificate names an issuer that is not in this organization";

/// A certificate reaches further than the one that issued it.
const ABOVE_ITS_ISSUERS_CEILING: &str = "the certificate carries a flag its issuer does not";

/// A certificate stands as high as, or higher than, the one that issued it.
const NOT_BELOW_ITS_ISSUER: &str = "the certificate does not rank below its issuer";

/// A certificate was issued by one that administers nobody.
const ISSUER_ADMINISTERS_NOBODY: &str =
    "the certificate's issuer holds no flag that administers members";

/// A walk that comes back to where it has been.
const CYCLE: &str = "the certificate's chain of issuers comes back on itself";

/// A walk longer than [`MAXIMUM_DEPTH`].
const TOO_DEEP: &str =
    "the certificate's chain of issuers is longer than any organization delegates";

/// The revocation check's refusal, and the one a client that stops after the signatures never
/// reaches.
const REVOKED_CERTIFICATE: &str = "the certificate that signed the row has been revoked";

/// The last check's refusal: a genuine signature under a certificate that is not for this row.
const BEYOND_ITS_CERTIFICATE: &str = "the row is not one its certificate may sign";

/// The organization's key. It signs the owner's certificate and a succession, and nothing else.
///
/// **Separate from [`AdministratorKey`] on purpose, and the duplication below is
/// the point.** The root is the one certificate the organization key signs, and
/// the compiler is what keeps a member's key from standing in for it rather than a
/// comment somebody has to read.
pub struct OrganizationKey(SigningKey);

/// A member's signing key. It signs rows, and the certificates and revocations it issues.
pub struct AdministratorKey(SigningKey);

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
/// it when. Signed so that the image printed as the organization's signature or seal is one an
/// owner or an administrator set, and not one any member holding the database's credential wrote
/// (effort 835, requirement 13).
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
    /// The verifying half of the key this member signs rows with, as the column
    /// holds it. It is here so that whoever gives somebody an act that signs has
    /// something to certify: a certificate names a key, the key is derived from a
    /// secret only the member's password unseals, and before effort 826 the row
    /// kept no copy of its public half, so the one moment a certificate could be
    /// issued was the moment its issuer held the fresh secret. Under signature
    /// because an unsigned copy would let any writer name a key of their own and
    /// wait to be certified.
    pub signing_public_key: &'a [u8],
    /// What the member is called. [`covers`] reads the rank it stands for, and
    /// nothing else here interprets it.
    pub role: &'a str,
    /// What the member may administer, as the column holds it.
    pub permissions: i64,
    /// The organization key's seed, sealed to this member's public key, on the row
    /// of an account that has been offered the organization and has not accepted
    /// yet (effort 828, requirement 22). `None` on every other row, and `None`
    /// again the moment the offer is accepted or withdrawn.
    ///
    /// **It is the offer's carrier and never anybody's anchor.** The acceptance
    /// opens it only on a machine that already holds the old key by another route,
    /// and refuses unless what it opens derives the key that machine pinned, so a
    /// seal somebody planted opens nothing that is then believed. *It was the
    /// transferee's way back until 2026-09-16, which meant a value read out of the
    /// database it was meant to judge.*
    ///
    /// **Under signature, and appended rather than tagged.** A writer able to put
    /// a seal on a row of their own choosing would be naming themselves the
    /// organization's next owner. The
    /// preimage appends it only where it is present, so a row without it signs the
    /// bytes it signed before the column existed and every row written before the
    /// transfer still verifies; [`preimage`] says why that is unambiguous here
    /// where `optional_field` is used elsewhere.
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
    /// joins. It is an input to [`Chain::new`] and is never read back out of the
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
    /// Draws a new signing key. One per member, drawn on the machine that will hold it.
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
/// **Separate from [`Chain::verify`] because there is no certificate to forget.** The warning at
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

/// Whether a certificate may sign a row of this kind: the row-kind table (effort 838, the plan's
/// *Architecture*).
///
/// | Row | The signing certificate must |
/// | --- | --- |
/// | `member` | hold a flag that administers members and outrank the member's role, or be the root |
/// | `role` | hold `manageRoles` and outrank the role |
/// | `grant` | hold `grantWorkspace`; a read-only grant, be the root |
/// | `workspace` | hold `renameWorkspace` or `grantWorkspace` |
/// | `invitation` | hold `inviteMember` or `resetPassword` |
/// | `mark` | hold `manageMark` |
///
/// Certificates and revocations are judged by the walk, and a succession by the organization key,
/// so neither is here. **The root is not waved through** except where the table says so: it holds
/// every flag and outranks every rank, so it passes every row on its own terms.
pub fn covers(certificate: &Certificate, authority: Authority<'_>) -> bool {
    let holds = |flag: Flag| permission::permits(certificate.ceiling, flag);
    let holds_any = |flags: &[Flag]| flags.iter().any(|flag| holds(*flag));

    match authority {
        Authority::Member(member) => {
            certificate.is_root()
                || (holds_any(&MEMBER_ADMINISTRATION)
                    && certificate.rank > permission::rank_of_role(member.role))
        }
        Authority::Role(role) => holds(Flag::ManageRoles) && certificate.rank > role.rank,
        Authority::Grant(grant) => {
            if AccessLevel::parse(grant.access_level) == Some(AccessLevel::FullAccess) {
                holds(Flag::GrantWorkspace)
            } else {
                certificate.is_root()
            }
        }
        Authority::Workspace(_) => holds_any(&[Flag::RenameWorkspace, Flag::GrantWorkspace]),
        Authority::Invitation(_) => holds_any(&[Flag::InviteMember, Flag::ResetPassword]),
        Authority::Mark(_) => holds(Flag::ManageMark),
    }
}

/// The certificates and revocations one read judges its rows by, against the key the caller
/// pinned.
///
/// **Built once per read and dropped with it**, so a walk is made once per certificate however
/// many rows name it, and no answer outlives the rows it was computed from.
///
/// `organization_verifying_key` is an input because it has to be. It arrives pinned in the join
/// link and is stored on the machine; reading it out of the database being verified would let
/// whoever rewrote the rows rewrite the key that judges them, and every signature would check out.
pub struct Chain<'a> {
    organization_verifying_key: &'a [u8; VERIFYING_KEY_BYTES],
    certificates: HashMap<&'a str, &'a Certificate>,
    revocations: &'a [Revocation],
    walked: RefCell<HashMap<String, Result<(), String>>>,
    revoked: OnceCell<HashSet<String>>,
}

impl<'a> Chain<'a> {
    pub fn new(
        organization_verifying_key: &'a [u8; VERIFYING_KEY_BYTES],
        certificates: &'a [Certificate],
        revocations: &'a [Revocation],
    ) -> Self {
        Self {
            organization_verifying_key,
            certificates: certificates
                .iter()
                .map(|certificate| (certificate.id.as_str(), certificate))
                .collect(),
            revocations,
            walked: RefCell::new(HashMap::new()),
            revoked: OnceCell::new(),
        }
    }

    /// Verifies a row against the chain. **The only place a row's signature is checked.**
    ///
    /// Four checks, in this order and with no path to `Ok` that misses one: the row's own
    /// signature, the walk from its certificate to the pinned key, that nothing on that walk has
    /// been revoked, and that the certificate may sign a row of this kind ([`covers`]).
    pub fn verify(
        &self,
        certificate_id: &str,
        authority: Authority<'_>,
        signature: &[u8],
    ) -> Result<(), Error> {
        let certificate = self.find(certificate_id)?;

        // 1. the row, against the key its certificate names.
        verify_signature(
            &certificate.signing_public_key,
            &preimage(&certificate.id, authority),
            signature,
            FORGED_ROW,
        )?;

        // 2 and 3. that certificate, walked to the pinned key, and unrevoked all the way up.
        self.live(certificate_id)?;

        // 4. and that it is a certificate for this row. Last, and the only `Ok` in this
        //    function is below it.
        if !covers(certificate, authority) {
            return Err(Error::Integrity {
                message: BEYOND_ITS_CERTIFICATE.to_string(),
            });
        }

        Ok(())
    }

    /// A certificate that walks to the pinned key and that nothing has revoked: what a row is
    /// signed under, and what a member signs and issues with.
    pub fn live(&self, certificate_id: &str) -> Result<&'a Certificate, Error> {
        let certificate = self.walk(certificate_id)?;
        let revoked = self.revoked();
        let mut current = certificate;

        // the walk has already bounded this path and refused a cycle on it.
        loop {
            if revoked.contains(&current.id) {
                return Err(Error::Integrity {
                    message: REVOKED_CERTIFICATE.to_string(),
                });
            }

            match &current.issuer_certificate_id {
                Some(issuer) => current = self.find(issuer)?,
                None => return Ok(certificate),
            }
        }
    }

    /// The live certificate a member signs with under this key, the newest where a half-written
    /// re-issue left two.
    pub fn live_certificate_of(
        &self,
        member_id: &str,
        signing_public_key: &[u8; VERIFYING_KEY_BYTES],
    ) -> Option<&'a Certificate> {
        self.certificates
            .values()
            .copied()
            .filter(|certificate| {
                certificate.member_id == member_id
                    && &certificate.signing_public_key == signing_public_key
                    && self.live(&certificate.id).is_ok()
            })
            .max_by(|one, other| {
                issued_at_order(&one.issued_at, &other.issued_at)
                    .then_with(|| one.id.cmp(&other.id))
            })
    }

    /// Every certificate a member holds that is live, whatever key it names.
    pub fn live_certificates_of(&self, member_id: &str) -> Vec<&'a Certificate> {
        let mut live: Vec<&Certificate> = self
            .certificates
            .values()
            .copied()
            .filter(|certificate| {
                certificate.member_id == member_id && self.live(&certificate.id).is_ok()
            })
            .collect();

        live.sort_by(|one, other| one.id.cmp(&other.id));

        live
    }

    /// The certificate a row or a link names, or the refusal for one nobody issued.
    fn find(&self, id: &str) -> Result<&'a Certificate, Error> {
        self.certificates
            .get(id)
            .copied()
            .ok_or_else(|| Error::Integrity {
                message: format!("the certificate {id} was issued by nobody"),
            })
    }

    /// The walk from one certificate to the pinned key, without asking about revocations: every
    /// link's signature and every link inside its issuer.
    ///
    /// **What a revocation's revoker is judged by**, as well as the first half of [`Chain::live`].
    /// Remembered per certificate for the life of the read.
    fn walk(&self, certificate_id: &str) -> Result<&'a Certificate, Error> {
        if let Some(verdict) = self.walked.borrow().get(certificate_id) {
            return match verdict {
                Ok(()) => self.find(certificate_id),
                Err(message) => Err(Error::Integrity {
                    message: message.clone(),
                }),
            };
        }

        let verdict = self.walk_uncached(certificate_id);

        self.walked.borrow_mut().insert(
            certificate_id.to_string(),
            verdict.as_ref().map(|_| ()).map_err(ToString::to_string),
        );

        verdict
    }

    fn walk_uncached(&self, certificate_id: &str) -> Result<&'a Certificate, Error> {
        let refuse = |message: &str| Error::Integrity {
            message: message.to_string(),
        };
        let certificate = self.find(certificate_id)?;
        let mut current = certificate;
        let mut seen = HashSet::new();

        loop {
            if !seen.insert(current.id.as_str()) {
                return Err(refuse(CYCLE));
            }

            if seen.len() > MAXIMUM_DEPTH {
                return Err(refuse(TOO_DEEP));
            }

            let Some(issuer_id) = &current.issuer_certificate_id else {
                // the root: the one certificate the pinned key signs.
                verify_signature(
                    self.organization_verifying_key,
                    &certificate_preimage(current),
                    &current.signature,
                    FORGED_CERTIFICATE,
                )?;

                return Ok(certificate);
            };

            let issuer = self
                .certificates
                .get(issuer_id.as_str())
                .copied()
                .ok_or_else(|| refuse(UNKNOWN_ISSUER))?;

            verify_signature(
                &issuer.signing_public_key,
                &certificate_preimage(current),
                &current.signature,
                FORGED_BY_ISSUER,
            )?;

            if let Some(refusal) = link_refusal(issuer, current) {
                return Err(refuse(refusal));
            }

            current = issuer;
        }
    }

    /// The certificates a revocation that verifies names.
    ///
    /// **A revocation counts when its revoker walks to the pinned key, signed it, and is the root
    /// or outranks what it revokes.** Whether the revoker has since been revoked is not asked:
    /// removing a manager would otherwise reinstate every certificate they retired, the old ones
    /// of everybody they narrowed included. What that leaves a revoked manager able to do is
    /// revoke somebody below them, which takes nothing a holder of the credential cannot already
    /// take by deleting a row.
    ///
    /// **One that does not verify is passed over, not refused.** It is a row anybody could have
    /// written, and it revokes nothing; refusing the read on it would let any member stop the
    /// directory being read by writing one.
    fn revoked(&self) -> &HashSet<String> {
        self.revoked.get_or_init(|| {
            self.revocations
                .iter()
                .filter(|revocation| self.revocation_counts(revocation))
                .map(|revocation| revocation.certificate_id.clone())
                .collect()
        })
    }

    fn revocation_counts(&self, revocation: &Revocation) -> bool {
        let (Ok(revoker), Some(revoked)) = (
            self.walk(&revocation.revoker_certificate_id),
            self.certificates
                .get(revocation.certificate_id.as_str())
                .copied(),
        ) else {
            return false;
        };

        verify_signature(
            &revoker.signing_public_key,
            &revocation_preimage(revocation),
            &revocation.signature,
            REVOKED_CERTIFICATE,
        )
        .is_ok()
            && (revoker.is_root() || revoker.rank > revoked.rank)
    }
}

/// Whether one certificate sits inside the one that issued it, and the refusal where it does not.
///
/// The three checks of a link that are not a signature: the ceiling within the issuer's, the rank
/// below it, and the issuer holding a flag that administers members. Shared by the issue and the
/// walk, so a certificate is refused on the way in for exactly what a reader refuses it for.
fn link_refusal(issuer: &Certificate, certificate: &Certificate) -> Option<&'static str> {
    if certificate.ceiling & !issuer.ceiling != 0 {
        return Some(ABOVE_ITS_ISSUERS_CEILING);
    }

    if certificate.rank >= issuer.rank {
        return Some(NOT_BELOW_ITS_ISSUER);
    }

    if !MEMBER_ADMINISTRATION
        .iter()
        .any(|flag| permission::permits(issuer.ceiling, *flag))
    {
        return Some(ISSUER_ADMINISTERS_NOBODY);
    }

    None
}

/// Orders two issue times. They are milliseconds written as text, so a longer one is later; two
/// of one length compare as they read.
fn issued_at_order(one: &str, other: &str) -> std::cmp::Ordering {
    one.len().cmp(&other.len()).then_with(|| one.cmp(other))
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

/// What a member signs when they sign a row.
fn preimage(certificate_id: &str, authority: Authority<'_>) -> Vec<u8> {
    let mut message = Vec::new();

    // every arm names its fields rather than taking `..`, so a column added to a
    // signed row is a compile error here instead of a field nobody signed.
    match authority {
        Authority::Member(MemberAuthority {
            public_key,
            signing_public_key,
            role,
            permissions,
            owner_seed_sealed,
        }) => {
            message.extend_from_slice(MEMBER_DOMAIN);
            field(&mut message, certificate_id.as_bytes());
            field(&mut message, public_key);
            field(&mut message, signing_public_key);
            field(&mut message, role.as_bytes());
            field(&mut message, &permissions.to_be_bytes());

            // appended where it is present and nothing at all where it is not, so a
            // row with no seal signs exactly the bytes it signed before the column
            // existed. That is what lets a column be added to a signed row without
            // re-signing the directory (effort 828, requirement 22), and it is why
            // `optional_field` is wrong here: its absent tag is one byte, and that
            // byte is the whole of what would have broken every row already written.
            //
            // **Unambiguous because it is last and length-prefixed.** Nothing
            // follows it, so an absent seal cannot be read as a present empty one:
            // the first ends the message and the second appends eight zero bytes.
            if let Some(owner_seed_sealed) = owner_seed_sealed {
                field(&mut message, owner_seed_sealed);
            }
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
    }

    message
}

/// What the organization key signs when it hands the organization on.
///
/// Named field by field rather than with `..`, for the reason the arms of [`preimage`] are: a
/// column added to the succession row is a compile error here instead of a field nobody signed.
fn succession_preimage(succession: SuccessionAuthority<'_>) -> Vec<u8> {
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
fn certificate_preimage(certificate: &Certificate) -> Vec<u8> {
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
fn revocation_preimage(revocation: &Revocation) -> Vec<u8> {
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

    use crate::organization::{
        permission::{MANAGER_ROLE, MEMBER_ROLE, mask_of},
        vault::{self, KdfParams},
    };

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

    /// The signing key a member row names. It is the administrator key above, because that is
    /// what the column holds: a certificate names the key the member derives from their own
    /// vault secret, and the row carries its verifying half so there is something to certify
    /// (effort 826, requirement 6).
    fn member_authority<'a>(public_key: &'a [u8], role: &'a str) -> Authority<'a> {
        Authority::Member(MemberAuthority {
            public_key,
            signing_public_key: CHECKED_IN_MEMBER_SIGNING_PUBLIC_KEY,
            role,
            permissions: ADMINISTRATOR_PERMISSIONS,
            owner_seed_sealed: None,
        })
    }

    /// The same row, carrying the organization seed a transfer sealed onto it.
    fn member_authority_with_seal<'a>(
        public_key: &'a [u8],
        role: &'a str,
        owner_seed_sealed: &'a [u8],
    ) -> Authority<'a> {
        Authority::Member(MemberAuthority {
            public_key,
            signing_public_key: CHECKED_IN_MEMBER_SIGNING_PUBLIC_KEY,
            role,
            permissions: ADMINISTRATOR_PERMISSIONS,
            owner_seed_sealed: Some(owner_seed_sealed),
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

    fn invitation_authority() -> Authority<'static> {
        Authority::Invitation(InvitationAuthority {
            id: "invitation-1",
            member_id: CHECKED_IN_MEMBER_ID,
            expires_at: 1_757_000_000_000,
        })
    }

    fn mark_authority(image_sealed: &[u8]) -> Authority<'_> {
        Authority::Mark(MarkAuthority {
            image_sealed,
            media_type: "image/png",
            updated_by: CHECKED_IN_MEMBER_ID,
            updated_at: 1_757_000_000_000,
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

    /// A certificate signed by `signer` over whatever fields it is given: what somebody holding
    /// the credential writes around every check the issue makes.
    fn forged(signer: &AdministratorKey, certificate: Certificate) -> Certificate {
        Certificate {
            signature: signer
                .0
                .sign(&certificate_preimage(&certificate))
                .to_bytes()
                .to_vec(),
            ..certificate
        }
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
        Chain::new(verifying_key, certificates, revocations).verify(
            &certificate.id,
            authority,
            signature,
        )
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

    fn integrity(message: &str) -> Error {
        Error::Integrity {
            message: message.to_string(),
        }
    }

    // a row the root signed verifies against the chain

    #[test]
    fn a_member_row_signed_by_the_root_verifies() {
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
            verify_under(
                &organization.verifying_key,
                &organization.certificate,
                authority,
                &signature
            ),
            Ok(())
        );
    }

    /// Effort 828, requirement 22: **a member row with no owner seed signs exactly the
    /// bytes it signed before the column existed**, so every row written before a
    /// transfer still verifies against the unchanged organization key.
    ///
    /// The expectation is written out here rather than taken from the function under
    /// test: an assertion that the preimage equals the preimage says nothing, and
    /// what this has to pin is the layout a row already on somebody's replica was
    /// signed under.
    #[test]
    fn a_member_row_without_the_owner_seed_signs_the_bytes_it_signed_before_the_column() {
        let public_key = checked_in_member_public_key();
        let mut before = Vec::new();

        before.extend_from_slice(MEMBER_DOMAIN);
        field(&mut before, b"cert-an-administrator");
        field(&mut before, &public_key);
        field(&mut before, CHECKED_IN_MEMBER_SIGNING_PUBLIC_KEY);
        field(&mut before, b"member");
        field(&mut before, &ADMINISTRATOR_PERMISSIONS.to_be_bytes());

        assert_eq!(
            preimage(
                "cert-an-administrator",
                member_authority(&public_key, "member")
            ),
            before
        );
    }

    /// And the row that carries one signs the same bytes with the seal appended, so
    /// the two are different messages and a seal cannot be added to a row or taken
    /// off one without the signature failing.
    #[test]
    fn a_member_row_carrying_the_owner_seed_folds_it_into_what_it_signs() {
        let organization = an_organization();
        let public_key = checked_in_member_public_key();
        let seal = b"a sealed organization seed".as_slice();
        let without = member_authority(&public_key, "owner");
        let with = member_authority_with_seal(&public_key, "owner", seal);
        let mut expected = preimage("cert-an-administrator", without);

        field(&mut expected, seal);

        assert_eq!(preimage("cert-an-administrator", with), expected);

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
            Err(integrity(FORGED_ROW))
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
            Err(integrity(FORGED_ROW))
        );
    }

    #[test]
    fn a_workspace_row_and_a_grant_row_signed_by_the_root_verify() {
        let organization = an_organization();
        let sealed_credential = hex(CHECKED_IN_SEALED_CREDENTIAL);

        for authority in [
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
                verify_under(
                    &organization.verifying_key,
                    &organization.certificate,
                    authority,
                    &signature
                ),
                Ok(()),
                "{authority:?}"
            );
        }
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
            verify_under(
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
            verify_under(
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
            verify_under(
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
        let certificates = [organization.certificate.clone(), manager.clone()];
        let revocation = revoke(
            &organization.administrator_key,
            &organization.certificate,
            &manager,
            "2026-08-30T12:00:00Z",
        )
        .expect("failed to revoke");

        assert_eq!(
            verify(
                &organization.verifying_key,
                &certificates,
                &[],
                &manager,
                authority,
                &signature
            ),
            Ok(())
        );
        assert_eq!(
            verify(
                &organization.verifying_key,
                &certificates,
                &[revocation],
                &manager,
                authority,
                &signature
            ),
            Err(integrity(REVOKED_CERTIFICATE))
        );
    }

    #[test]
    fn every_kind_of_row_is_rejected_under_a_revoked_certificate() {
        // one verifier, and no kind of row reaches an Ok without the revocation. A
        // second verifier written at a call site is what breaks this.
        let organization = an_organization();
        let (manager_key, manager) = delegate(
            &organization.administrator_key,
            &organization.certificate,
            "manager",
            MANAGER_ROLE.mask,
            MANAGER_ROLE.rank,
        );
        let public_key = checked_in_member_public_key();
        let sealed = hex(CHECKED_IN_SEALED_CREDENTIAL);
        let certificates = [organization.certificate.clone(), manager.clone()];
        let revocations = [revoke(
            &organization.administrator_key,
            &organization.certificate,
            &manager,
            "2026-08-30T12:00:00Z",
        )
        .expect("failed to revoke")];

        for authority in [
            member_authority(&public_key, "member"),
            role_authority(&sealed, 0, 1),
            workspace_authority(CHECKED_IN_DATABASE_NAME, CHECKED_IN_DATABASE_HOSTNAME),
            grant_authority(&sealed),
            invitation_authority(),
            mark_authority(&sealed),
        ] {
            let signature = sign(&manager_key, &manager, authority).expect("failed to sign");

            assert_eq!(
                verify(
                    &organization.verifying_key,
                    &certificates,
                    &[],
                    &manager,
                    authority,
                    &signature
                ),
                Ok(()),
                "the manager could not sign {authority:?} to begin with"
            );
            assert_eq!(
                verify(
                    &organization.verifying_key,
                    &certificates,
                    &revocations,
                    &manager,
                    authority,
                    &signature
                ),
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
        // issue themselves a root under it, and re-sign the row. A verifier that
        // read the key out of the database would accept every byte of this. The
        // one that was handed the key pinned from the join link does not.
        let genuine = an_organization();
        let theirs = an_organization();
        let public_key = checked_in_member_public_key();
        let promoted = member_authority(&public_key, "owner");
        let their_signature =
            sign(&theirs.administrator_key, &theirs.certificate, promoted).expect("failed to sign");

        // against the key they put in the database, everything checks out
        assert_eq!(
            verify_under(
                &theirs.verifying_key,
                &theirs.certificate,
                promoted,
                &their_signature
            ),
            Ok(()),
            "the rewritten chain was not internally consistent, so this proves nothing"
        );

        // against the key the machine holds, it does not
        assert_eq!(
            verify_under(
                &genuine.verifying_key,
                &theirs.certificate,
                promoted,
                &their_signature
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
            verify_under(&organization.verifying_key, &renamed, authority, &signature),
            Err(integrity(FORGED_ROW))
        );
    }

    #[test]
    fn a_row_naming_a_certificate_nobody_issued_is_rejected() {
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
            Chain::new(&organization.verifying_key, &[], &[]).verify(
                &organization.certificate.id,
                authority,
                &signature
            ),
            Err(integrity(
                "the certificate certificate-a was issued by nobody"
            ))
        );
    }

    // the walk (criterion 9, the chain's half): one test per check

    #[test]
    fn a_delegated_certificate_verifies_through_its_issuer_to_the_pinned_key() {
        let organization = an_organization();
        let (manager_key, manager) = delegate(
            &organization.administrator_key,
            &organization.certificate,
            "manager",
            MANAGER_ROLE.mask,
            MANAGER_ROLE.rank,
        );
        let (member_key, member) = delegate(
            &manager_key,
            &manager,
            "member",
            mask_of(&[Flag::InviteMember]),
            MEMBER_ROLE.rank + 1,
        );
        let certificates = [organization.certificate.clone(), manager, member.clone()];
        let authority = invitation_authority();
        let signature = sign(&member_key, &member, authority).expect("failed to sign");

        assert_eq!(
            verify(
                &organization.verifying_key,
                &certificates,
                &[],
                &member,
                authority,
                &signature
            ),
            Ok(())
        );
    }

    #[test]
    fn a_link_its_issuer_did_not_sign_is_refused() {
        let organization = an_organization();
        let (_, manager) = delegate(
            &organization.administrator_key,
            &organization.certificate,
            "manager",
            MANAGER_ROLE.mask,
            MANAGER_ROLE.rank,
        );
        let stranger = AdministratorKey::generate().expect("failed to generate");
        let signed_by_somebody_else = forged(&stranger, manager.clone());

        assert_eq!(
            Chain::new(
                &organization.verifying_key,
                &[organization.certificate.clone(), signed_by_somebody_else],
                &[]
            )
            .live(&manager.id)
            .err(),
            Some(integrity(FORGED_BY_ISSUER))
        );

        // and a root the pinned key did not sign
        let other = an_organization();

        assert_eq!(
            Chain::new(
                &organization.verifying_key,
                std::slice::from_ref(&other.certificate),
                &[]
            )
            .live(&other.certificate.id)
            .err(),
            Some(integrity(FORGED_CERTIFICATE))
        );
    }

    #[test]
    fn a_link_naming_an_issuer_nobody_holds_is_refused() {
        let organization = an_organization();
        let (_, manager) = delegate(
            &organization.administrator_key,
            &organization.certificate,
            "manager",
            MANAGER_ROLE.mask,
            MANAGER_ROLE.rank,
        );

        assert_eq!(
            Chain::new(
                &organization.verifying_key,
                std::slice::from_ref(&manager),
                &[]
            )
            .live(&manager.id)
            .err(),
            Some(integrity(UNKNOWN_ISSUER))
        );
    }

    #[test]
    fn a_certificate_under_a_revoked_issuer_reads_as_revoked() {
        let organization = an_organization();
        let (manager_key, manager) = delegate(
            &organization.administrator_key,
            &organization.certificate,
            "manager",
            MANAGER_ROLE.mask,
            MANAGER_ROLE.rank,
        );
        let (_, member) = delegate(
            &manager_key,
            &manager,
            "member",
            mask_of(&[Flag::InviteMember]),
            1,
        );
        let certificates = [
            organization.certificate.clone(),
            manager.clone(),
            member.clone(),
        ];
        let revocations = [revoke(
            &organization.administrator_key,
            &organization.certificate,
            &manager,
            "2026-09-01T00:00:00Z",
        )
        .expect("failed to revoke")];
        let chain = Chain::new(&organization.verifying_key, &certificates, &revocations);

        assert_eq!(
            chain.live(&member.id).err(),
            Some(integrity(REVOKED_CERTIFICATE))
        );
        assert_eq!(
            chain
                .live(&organization.certificate.id)
                .map(|found| &found.id),
            Ok(&organization.certificate.id),
            "revoking the manager revoked the root"
        );
    }

    #[test]
    fn a_certificate_wider_than_its_issuer_is_refused() {
        let organization = an_organization();
        let (manager_key, manager) = delegate(
            &organization.administrator_key,
            &organization.certificate,
            "manager",
            MANAGER_ROLE.mask,
            MANAGER_ROLE.rank,
        );
        // the manager's ceiling lacks every owner flag, and this certificate names one.
        let wider = forged(
            &manager_key,
            Certificate {
                id: "wider".to_string(),
                member_id: "member-wider".to_string(),
                issuer_certificate_id: Some(manager.id.clone()),
                ceiling: mask_of(&[Flag::InviteMember, Flag::CreateWorkspace]),
                rank: 1,
                ..manager.clone()
            },
        );

        assert_eq!(
            Chain::new(
                &organization.verifying_key,
                &[organization.certificate.clone(), manager.clone(), wider],
                &[]
            )
            .live("wider")
            .err(),
            Some(integrity(ABOVE_ITS_ISSUERS_CEILING))
        );
        assert_eq!(
            issue_certificate(
                &manager_key,
                &manager,
                Issue {
                    id: "wider",
                    member_id: "member-wider",
                    signing_public_key: &manager.signing_public_key,
                    ceiling: mask_of(&[Flag::InviteMember, Flag::CreateWorkspace]),
                    rank: 1,
                    issued_at: "2026-09-01T00:00:00Z",
                }
            ),
            Err(integrity(ABOVE_ITS_ISSUERS_CEILING)),
            "the issue made a certificate the walk refuses"
        );
    }

    #[test]
    fn a_certificate_not_ranked_below_its_issuer_is_refused() {
        let organization = an_organization();
        let (manager_key, manager) = delegate(
            &organization.administrator_key,
            &organization.certificate,
            "manager",
            MANAGER_ROLE.mask,
            MANAGER_ROLE.rank,
        );

        for rank in [MANAGER_ROLE.rank, MANAGER_ROLE.rank + 1] {
            let level = forged(
                &manager_key,
                Certificate {
                    id: "level".to_string(),
                    member_id: "member-level".to_string(),
                    issuer_certificate_id: Some(manager.id.clone()),
                    ceiling: mask_of(&[Flag::InviteMember]),
                    rank,
                    ..manager.clone()
                },
            );

            assert_eq!(
                Chain::new(
                    &organization.verifying_key,
                    &[organization.certificate.clone(), manager.clone(), level],
                    &[]
                )
                .live("level")
                .err(),
                Some(integrity(NOT_BELOW_ITS_ISSUER)),
                "rank {rank} under a manager was accepted"
            );
        }
    }

    #[test]
    fn a_certificate_issued_by_one_that_administers_nobody_is_refused() {
        let organization = an_organization();
        // a member who may create and edit records and administers nobody.
        let (member_key, member) = delegate(
            &organization.administrator_key,
            &organization.certificate,
            "member",
            MEMBER_ROLE.mask,
            10,
        );
        let below = forged(
            &member_key,
            Certificate {
                id: "below".to_string(),
                member_id: "member-below".to_string(),
                issuer_certificate_id: Some(member.id.clone()),
                ceiling: mask_of(&[Flag::ViewUnit]),
                rank: 1,
                ..member.clone()
            },
        );

        assert_eq!(
            Chain::new(
                &organization.verifying_key,
                &[organization.certificate.clone(), member, below],
                &[]
            )
            .live("below")
            .err(),
            Some(integrity(ISSUER_ADMINISTERS_NOBODY))
        );
    }

    #[test]
    fn a_chain_of_issuers_that_comes_back_on_itself_is_refused_and_ends() {
        // two certificates each naming the other as issuer, each signed by the other's key.
        // **A cycle cannot pass the rank check**, which strictly descends at every link, so this
        // is refused for rank before the cycle is seen; the cycle check stands behind it, so the
        // walk ends whichever check a future change removes.
        let organization = an_organization();
        let one_key = AdministratorKey::generate().expect("failed to generate");
        let other_key = AdministratorKey::generate().expect("failed to generate");
        let shape = |id: &str, issuer: &str, key: &AdministratorKey| Certificate {
            id: id.to_string(),
            member_id: format!("member-{id}"),
            signing_public_key: key.verifying_key(),
            issuer_certificate_id: Some(issuer.to_string()),
            ceiling: MANAGER_ROLE.mask,
            rank: 5,
            issued_at: "2026-09-01T00:00:00Z".to_string(),
            signature: Vec::new(),
        };
        let one = forged(&other_key, shape("one", "other", &one_key));
        let other = forged(&one_key, shape("other", "one", &other_key));
        let cycle = [one, other];
        let chain = Chain::new(&organization.verifying_key, &cycle, &[]);

        assert!(chain.live("one").is_err());
        assert!(
            [integrity(NOT_BELOW_ITS_ISSUER), integrity(CYCLE)]
                .contains(&chain.live("one").expect_err("a cycle verified"))
        );

        // and a certificate that names itself as its issuer.
        let itself = [forged(&one_key, shape("itself", "itself", &one_key))];

        assert!(
            Chain::new(&organization.verifying_key, &itself, &[])
                .live("itself")
                .is_err()
        );
    }

    #[test]
    fn a_chain_deeper_than_the_limit_is_refused_and_one_at_it_verifies() {
        let organization = an_organization();
        let mut certificates = vec![organization.certificate.clone()];
        let mut key = AdministratorKey::from_bytes(&organization.administrator_key.to_bytes());
        let mut rank = MANAGER_ROLE.rank;

        // the root and fifteen below it is sixteen certificates, which is the limit.
        for depth in 1..MAXIMUM_DEPTH {
            let (next_key, next) = delegate(
                &key,
                certificates.last().expect("a certificate"),
                &format!("depth-{depth}"),
                mask_of(&[Flag::InviteMember]),
                rank,
            );

            certificates.push(next);
            key = next_key;
            rank -= 1;
        }

        let deepest = certificates.last().expect("a certificate").id.clone();

        assert_eq!(
            Chain::new(&organization.verifying_key, &certificates, &[])
                .live(&deepest)
                .map(|found| found.id.clone()),
            Ok(deepest)
        );

        let (_, past) = delegate(
            &key,
            certificates.last().expect("a certificate"),
            "past",
            mask_of(&[Flag::InviteMember]),
            rank,
        );

        certificates.push(past);

        assert_eq!(
            Chain::new(&organization.verifying_key, &certificates, &[])
                .live("past")
                .err(),
            Some(integrity(TOO_DEEP))
        );
    }

    // revocations (criterion 9)

    #[test]
    fn a_revocation_counts_only_from_the_root_or_a_certificate_that_outranks_the_revoked() {
        let organization = an_organization();
        let (manager_key, manager) = delegate(
            &organization.administrator_key,
            &organization.certificate,
            "manager",
            MANAGER_ROLE.mask,
            MANAGER_ROLE.rank,
        );
        let (peer_key, peer) = delegate(
            &organization.administrator_key,
            &organization.certificate,
            "peer",
            MANAGER_ROLE.mask,
            MANAGER_ROLE.rank,
        );
        let (_, member) = delegate(
            &manager_key,
            &manager,
            "member",
            mask_of(&[Flag::InviteMember]),
            1,
        );
        let certificates = [
            organization.certificate.clone(),
            manager.clone(),
            peer.clone(),
            member.clone(),
        ];
        let live = |revocations: &[Revocation], id: &str| {
            Chain::new(&organization.verifying_key, &certificates, revocations)
                .live(id)
                .is_ok()
        };

        // the root revokes anybody.
        let by_root = revoke(
            &organization.administrator_key,
            &organization.certificate,
            &manager,
            "2026-09-01T00:00:00Z",
        )
        .expect("failed to revoke");

        assert!(!live(std::slice::from_ref(&by_root), &manager.id));

        // a manager revokes a member below them, their own issue or anybody else's.
        let by_manager =
            revoke(&peer_key, &peer, &member, "2026-09-01T00:00:00Z").expect("failed to revoke");

        assert!(!live(std::slice::from_ref(&by_manager), &member.id));

        // a manager does not revoke another manager, however the row is made.
        assert_eq!(
            revoke(&peer_key, &peer, &manager, "2026-09-01T00:00:00Z"),
            Err(integrity("a certificate revokes only one ranked below it"))
        );

        let mut by_peer = Revocation {
            certificate_id: manager.id.clone(),
            revoker_certificate_id: peer.id.clone(),
            revoked_at: "2026-09-01T00:00:00Z".to_string(),
            signature: Vec::new(),
        };

        by_peer.signature = peer_key
            .0
            .sign(&revocation_preimage(&by_peer))
            .to_bytes()
            .to_vec();

        assert!(live(std::slice::from_ref(&by_peer), &manager.id));

        // and a revocation whose revoker does not walk to the pinned key, or whose signature
        // is not the revoker's, revokes nothing.
        let elsewhere = an_organization_rooted_at("certificate-elsewhere");
        let by_stranger = Revocation {
            ..revoke(
                &elsewhere.administrator_key,
                &elsewhere.certificate,
                &member,
                "2026-09-01T00:00:00Z",
            )
            .expect("failed to revoke")
        };
        let mut with_elsewhere = certificates.to_vec();

        with_elsewhere.push(elsewhere.certificate.clone());

        assert!(
            Chain::new(
                &organization.verifying_key,
                &with_elsewhere,
                std::slice::from_ref(&by_stranger)
            )
            .live(&member.id)
            .is_ok()
        );

        let rewritten = Revocation {
            revoked_at: "2026-09-02T00:00:00Z".to_string(),
            ..by_root.clone()
        };

        assert!(live(std::slice::from_ref(&rewritten), &manager.id));
    }

    #[test]
    fn a_revocation_still_counts_once_its_revoker_is_revoked() {
        // a manager narrows a member, revoking their old certificate; the manager is removed
        // afterwards. The member's old certificate stays revoked, or removing the manager would
        // hand back every width they took away.
        let organization = an_organization();
        let (manager_key, manager) = delegate(
            &organization.administrator_key,
            &organization.certificate,
            "manager",
            MANAGER_ROLE.mask,
            MANAGER_ROLE.rank,
        );
        let (_, member) = delegate(
            &organization.administrator_key,
            &organization.certificate,
            "member",
            mask_of(&[Flag::InviteMember]),
            1,
        );
        let certificates = [
            organization.certificate.clone(),
            manager.clone(),
            member.clone(),
        ];
        let revocations = [
            revoke(&manager_key, &manager, &member, "2026-09-01T00:00:00Z")
                .expect("failed to revoke"),
            revoke(
                &organization.administrator_key,
                &organization.certificate,
                &manager,
                "2026-09-02T00:00:00Z",
            )
            .expect("failed to revoke"),
        ];
        let chain = Chain::new(&organization.verifying_key, &certificates, &revocations);

        assert!(chain.live(&manager.id).is_err());
        assert!(chain.live(&member.id).is_err());
    }

    // the row-kind table (criterion 9): every kind refused under a certificate lacking its flag,
    // and a row about somebody refused under one that does not outrank them

    #[test]
    fn each_kind_of_row_is_refused_under_a_certificate_lacking_its_flag() {
        let organization = an_organization();
        let public_key = checked_in_member_public_key();
        let sealed = hex(CHECKED_IN_SEALED_CREDENTIAL);
        let every_member_flag = mask_of(&MEMBER_ADMINISTRATION);

        for (authority, needs) in [
            (member_authority(&public_key, "member"), every_member_flag),
            (role_authority(&sealed, 0, 1), mask_of(&[Flag::ManageRoles])),
            (
                workspace_authority(CHECKED_IN_DATABASE_NAME, CHECKED_IN_DATABASE_HOSTNAME),
                mask_of(&[Flag::RenameWorkspace, Flag::GrantWorkspace]),
            ),
            (grant_authority(&sealed), mask_of(&[Flag::GrantWorkspace])),
            (
                invitation_authority(),
                mask_of(&[Flag::InviteMember, Flag::ResetPassword]),
            ),
            (mark_authority(&sealed), mask_of(&[Flag::ManageMark])),
        ] {
            let with = MANAGER_ROLE.mask;
            let without = MANAGER_ROLE.mask & !needs;

            for (ceiling, expected) in [
                (with, Ok(())),
                (without, Err(integrity(BEYOND_ITS_CERTIFICATE))),
            ] {
                let (key, certificate) = delegate(
                    &organization.administrator_key,
                    &organization.certificate,
                    "signer",
                    ceiling,
                    MANAGER_ROLE.rank,
                );
                let signature = sign(&key, &certificate, authority).expect("failed to sign");

                assert_eq!(
                    verify(
                        &organization.verifying_key,
                        &[organization.certificate.clone(), certificate.clone()],
                        &[],
                        &certificate,
                        authority,
                        &signature
                    ),
                    expected,
                    "{authority:?} under a ceiling of {ceiling}"
                );
            }
        }
    }

    #[test]
    fn a_row_about_somebody_is_refused_under_a_certificate_that_does_not_outrank_them() {
        let organization = an_organization();
        let public_key = checked_in_member_public_key();
        let sealed = hex(CHECKED_IN_SEALED_CREDENTIAL);
        let (manager_key, manager) = delegate(
            &organization.administrator_key,
            &organization.certificate,
            "manager",
            MANAGER_ROLE.mask,
            MANAGER_ROLE.rank,
        );
        let certificates = [organization.certificate.clone(), manager.clone()];

        for (authority, expected) in [
            // a member row below the manager, one at their rank, and one above it.
            (member_authority(&public_key, "member"), Ok(())),
            (
                member_authority(&public_key, "administrator"),
                Err(integrity(BEYOND_ITS_CERTIFICATE)),
            ),
            (
                member_authority(&public_key, "owner"),
                Err(integrity(BEYOND_ITS_CERTIFICATE)),
            ),
            // a role below the manager, and one at their rank: the manager role is the root's.
            (role_authority(&sealed, 0, MANAGER_ROLE.rank - 1), Ok(())),
            (
                role_authority(&sealed, 0, MANAGER_ROLE.rank),
                Err(integrity(BEYOND_ITS_CERTIFICATE)),
            ),
        ] {
            let signature = sign(&manager_key, &manager, authority).expect("failed to sign");

            assert_eq!(
                verify(
                    &organization.verifying_key,
                    &certificates,
                    &[],
                    &manager,
                    authority,
                    &signature
                ),
                expected,
                "{authority:?}"
            );
        }

        // and the root signs every one of them.
        for authority in [
            member_authority(&public_key, "owner"),
            role_authority(&sealed, 0, MANAGER_ROLE.rank),
        ] {
            let signature = sign(
                &organization.administrator_key,
                &organization.certificate,
                authority,
            )
            .expect("failed to sign");

            assert_eq!(
                verify_under(
                    &organization.verifying_key,
                    &organization.certificate,
                    authority,
                    &signature
                ),
                Ok(()),
                "{authority:?}"
            );
        }
    }

    #[test]
    fn a_read_only_grant_is_the_roots_alone() {
        let organization = an_organization();
        let sealed = hex(CHECKED_IN_SEALED_CREDENTIAL);
        let (manager_key, manager) = delegate(
            &organization.administrator_key,
            &organization.certificate,
            "manager",
            MANAGER_ROLE.mask,
            MANAGER_ROLE.rank,
        );
        let certificates = [organization.certificate.clone(), manager.clone()];
        let read_only = grant_authority_at(&sealed, "read-only");
        let by_manager = sign(&manager_key, &manager, read_only).expect("failed to sign");
        let by_root = sign(
            &organization.administrator_key,
            &organization.certificate,
            read_only,
        )
        .expect("failed to sign");

        assert_eq!(
            verify(
                &organization.verifying_key,
                &certificates,
                &[],
                &manager,
                read_only,
                &by_manager
            ),
            Err(integrity(BEYOND_ITS_CERTIFICATE))
        );
        assert_eq!(
            verify(
                &organization.verifying_key,
                &certificates,
                &[],
                &organization.certificate,
                read_only,
                &by_root
            ),
            Ok(())
        );
    }

    #[test]
    fn a_members_live_certificate_is_the_newest_that_nothing_revoked() {
        let organization = an_organization();
        let key = AdministratorKey::generate().expect("failed to generate");
        let issue = |id: &str, issued_at: &str| {
            issue_certificate(
                &organization.administrator_key,
                &organization.certificate,
                Issue {
                    id,
                    member_id: "member-b",
                    signing_public_key: &key.verifying_key(),
                    ceiling: mask_of(&[Flag::InviteMember]),
                    rank: 1,
                    issued_at,
                },
            )
            .expect("failed to issue")
        };
        let older = issue("older", "999");
        let newer = issue("newer", "1000");
        let certificates = [
            organization.certificate.clone(),
            older.clone(),
            newer.clone(),
        ];

        assert_eq!(
            Chain::new(&organization.verifying_key, &certificates, &[])
                .live_certificate_of("member-b", &key.verifying_key())
                .map(|found| found.id.as_str()),
            Some("newer")
        );

        let revocations = [revoke(
            &organization.administrator_key,
            &organization.certificate,
            &newer,
            "1001",
        )
        .expect("failed to revoke")];

        assert_eq!(
            Chain::new(&organization.verifying_key, &certificates, &revocations)
                .live_certificate_of("member-b", &key.verifying_key())
                .map(|found| found.id.as_str()),
            Some("older")
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
                member_authority(&public_key, "administrator")
            )),
            concat!(
                "72656e7461626c652e6f7267616e697a6174696f6e2e617574686f726974792e",
                "6d656d6265722e7632000000000000000d63657274696669636174652d310000",
                "0000000000200102030405060708090a0b0c0d0e0f101112131415161718191a",
                "1b1c1d1e1f2000000000000000203d4017c3e843895a92b70aa74d1b7ebc9c98",
                "2ccf2ec4968cc0cd55f12af4660c000000000000000d61646d696e6973747261",
                "746f7200000000000000080000000000000007",
            ),
            "a member row covers a different set of fields"
        );

        // and the same row carrying the seed a transfer sealed onto it (effort 828, requirement
        // 22): the bytes above with one more length-prefixed field appended, so the row above is
        // still the row this crate signed before the column existed.
        assert_eq!(
            to_hex(&preimage(
                CHECKED_IN_CERTIFICATE_ID,
                member_authority_with_seal(&public_key, "administrator", b"a sealed seed")
            )),
            concat!(
                "72656e7461626c652e6f7267616e697a6174696f6e2e617574686f726974792e",
                "6d656d6265722e7632000000000000000d63657274696669636174652d310000",
                "0000000000200102030405060708090a0b0c0d0e0f101112131415161718191a",
                "1b1c1d1e1f2000000000000000203d4017c3e843895a92b70aa74d1b7ebc9c98",
                "2ccf2ec4968cc0cd55f12af4660c000000000000000d61646d696e6973747261",
                "746f7200000000000000080000000000000007",
                "000000000000000d61207365616c65642073656564",
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

        let rewrites: Vec<(Authority<'_>, Authority<'_>)> = vec![
            // member: public_key, signing_public_key, role, permissions
            (signed_member, member_authority(&other_public_key, "member")),
            (signed_member, member_authority(&public_key, "owner")),
            (
                signed_member,
                Authority::Member(MemberAuthority {
                    public_key: &public_key,
                    signing_public_key: &other_public_key,
                    role: "member",
                    permissions: ADMINISTRATOR_PERMISSIONS,
                    owner_seed_sealed: None,
                }),
            ),
            (
                signed_member,
                Authority::Member(MemberAuthority {
                    public_key: &public_key,
                    signing_public_key: CHECKED_IN_MEMBER_SIGNING_PUBLIC_KEY,
                    role: "member",
                    permissions: ADMINISTRATOR_PERMISSIONS + 1,
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
                Err(integrity(FORGED_ROW)),
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
                Err(integrity(FORGED_BY_ISSUER)),
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
            Err(integrity(FORGED_CERTIFICATE))
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
            verify_under(
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
                verify_under(
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
                signature: certificate_signature,
                ..organization.certificate.clone()
            };

            assert_eq!(
                verify_under(
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
    fn the_row_is_checked_first_then_the_walk_the_revocation_and_what_it_covers() {
        // every check refuses this row, and the order is what decides which refusal a reader is
        // handed.
        let organization = an_organization();
        let elsewhere = an_organization();
        let (member_key, member) = delegate(
            &elsewhere.administrator_key,
            &elsewhere.certificate,
            "member",
            mask_of(&[Flag::InviteMember]),
            1,
        );
        let public_key = checked_in_member_public_key();
        // a member row about a manager, which a certificate of rank 1 does not cover.
        let authority = member_authority(&public_key, "administrator");
        let certificates = [elsewhere.certificate.clone(), member.clone()];
        let revocations = [revoke(
            &elsewhere.administrator_key,
            &elsewhere.certificate,
            &member,
            "2026-09-01T00:00:00Z",
        )
        .expect("failed to revoke")];

        assert_eq!(
            verify(
                &organization.verifying_key,
                &certificates,
                &revocations,
                &member,
                authority,
                &[0_u8; SIGNATURE_BYTES]
            ),
            Err(integrity(FORGED_ROW))
        );

        // with the row's own signature good, the walk answers next
        let signature = sign(&member_key, &member, authority).expect("failed to sign");

        assert_eq!(
            verify(
                &organization.verifying_key,
                &certificates,
                &revocations,
                &member,
                authority,
                &signature
            ),
            Err(integrity(FORGED_CERTIFICATE))
        );

        // with the walk good too, the revocation
        assert_eq!(
            verify(
                &elsewhere.verifying_key,
                &certificates,
                &revocations,
                &member,
                authority,
                &signature
            ),
            Err(integrity(REVOKED_CERTIFICATE))
        );

        // and with nothing revoked, what the certificate covers is what is left
        assert_eq!(
            verify(
                &elsewhere.verifying_key,
                &certificates,
                &[],
                &member,
                authority,
                &signature
            ),
            Err(integrity(BEYOND_ITS_CERTIFICATE))
        );
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
        // v2 certificate, the revocation and the role row; the row signatures did
        // not move, because a row signs its certificate's id and not its fields.*
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
        );

        for (authority, expected) in [
            (
                member_authority(&public_key, "administrator"),
                concat!(
                    "845ba711012384871f66bbb040432a46cd2ea24f95626c53eb6eef8c414cace9",
                    "628260a5e96da6b6af3f7011c63902ad15579a2928bd516bed2ed94fd783500e",
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
