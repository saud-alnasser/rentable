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
//! a row about a person or a role, the rank it must stand above and the flags it
//! may give: a member row's override and a role row's mask. That is the bound the
//! chain puts on a member who holds the database's credential and signs around a
//! command: rows of the kinds their ceiling names, about people ranked below them,
//! switching for nobody a flag the ceiling does not carry, and never their own row.
//! Which flags inside it they may switch, and which role they may give, where the
//! before and the after are both in hand, is the command's to refuse.
//!
//! A member row whose only failure is the standing of the role it names, which
//! another machine moved or deleted while this one wrote the row, is read as
//! granting nothing rather than refused ([`Chain::read_member`]), so two machines
//! acting offline together never refuse the directory to everybody.
//!
//! # Verification has one implementation
//!
//! [`Chain::verify`] and [`Chain::read_member`] are the only functions here that
//! return a row's verdict, both from one private judgement, and the checks it makes
//! are not separately callable. That is deliberate. The
//! failure this design has is named in the plan: **a client that verifies the row
//! and forgets the certificate accepts a revoked certificate**, and it arrives
//! as a second verifier written at a call site for convenience, not as a bug in
//! this file.
//!
//! [`verify_succession`] is the one exception and it is not that second verifier
//! (effort 828, requirement 22). A succession names no certificate, because what
//! it tells a reader is which key issues the root from now on; there is nothing
//! behind it to forget, and it can answer about no row.
//!
//! [`verify_older_row`] is the other, and it is not that second verifier either
//! (effort 838, ticket 22). It judges the rows of an organization made before this
//! chain existed, by the rules that organization was written under, for the one
//! caller that reads such an organization at all: the owner's upgrade, which
//! carries what it accepts into this chain, signed again from the root, and drops
//! what it refuses. Nothing it accepts is believed by any reader of this format.
//! What format 1 signed, and its verifier, are `upgrade/format/signature.rs`'s
//! since effort 840 (ticket 48); the two signature checks and the revocation stay
//! here, in the one call.
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
//! hands an operator the difference between a forged row and a manager who
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

mod certificate;
mod chain;
mod key;
mod preimage;

pub use certificate::*;
pub use chain::*;
pub use key::*;
pub use preimage::*;

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

/// Separates a `member` row's preimage from every other row's. `v3` since effort 838 put the
/// row's id, its role and its override under the signature in place of the role's word and the
/// permissions column; `v2` had put the member's signing public key there (effort 826).
const MEMBER_DOMAIN: &[u8] = b"rentable.organization.authority.member.v3";

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

/// Separates the `organization_name` row's preimage from every other row's: the organization's
/// name under the owner's signature (effort 851, requirement 29).
const ORGANIZATION_NAME_DOMAIN: &[u8] = b"rentable.organization.authority.organization-name.v1";

/// Separates a `member_lock` row's preimage from every other row's: whether a member is locked,
/// under the signature of whoever locked or unlocked them (effort 851, requirement 35). `v2` since
/// the bug hunt of 2026-10-06 put the member's signing key under it, so an unlock from before a
/// reset does not verify after it; no `v1` row left a development build.
const MEMBER_LOCK_DOMAIN: &[u8] = b"rentable.organization.authority.member-lock.v2";

/// Separates a `workspace_override` row's preimage from every other row's (effort 838,
/// requirement 12 as amended a third time).
const WORKSPACE_OVERRIDE_DOMAIN: &[u8] = b"rentable.organization.authority.workspace-override.v1";

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
