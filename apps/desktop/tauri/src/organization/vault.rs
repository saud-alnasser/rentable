//! the key schedule: derive, seal, unseal, re-seal.
//!
//! Pure functions over bytes. Nothing here opens a database, reaches a network,
//! or crosses the IPC boundary, and nothing here knows what an organization is.
//! Whether a row is telling the truth is a separate question answered by a
//! separate module, because one module answering both would let a reviewer check
//! one and believe they had checked both.
//!
//! # What a member holds
//!
//! A member holds an X25519 keypair. The secret half is sealed under a key
//! derived from their password; a credential is sealed to the public half. That
//! asymmetry is the property the whole design turns on: an administrator grants
//! a workspace to a member whose password they do not know, so a member can join
//! a second workspace long after they joined the first.
//!
//! # What a wrong password does
//!
//! Nothing. It derives a key like any other password, that key fails the AEAD
//! tag, and that is the whole of the failure. There is no stored verifier, no
//! comparison, and no boolean a modified client could make return true, which is
//! the only form a password check can take when there is no server to ask.
//!
//! # What the cost is
//!
//! The Argon2id parameters are a value the caller passes and this module stores
//! beside the ciphertext they sealed. They are never a constant here. There is no
//! rate limiting and there cannot be, because an attacker holding the ciphertext
//! attacks it on their own hardware, so cost per guess is the only defence there
//! is and raising it must be a re-seal on the next sign-in rather than a
//! migration.

use std::fmt;

use argon2::{Algorithm, Argon2, Params, Version};
use chacha20poly1305::{
    Key, KeyInit, XChaCha20Poly1305, XNonce,
    aead::{Aead, Payload},
};
use hkdf::Hkdf;
use sha2::Sha256;
use x25519_dalek::{PublicKey, SharedSecret, StaticSecret};

use crate::error::Error;

/// The salt behind one member key. Sixteen bytes is the width Argon2 documents
/// as the recommendation and twice its own minimum.
pub const KDF_SALT_BYTES: usize = 16;

/// The width of a derived member key, which is also XChaCha20-Poly1305's key
/// width.
pub const MEMBER_KEY_BYTES: usize = 32;

/// XChaCha20-Poly1305's nonce width. Twenty-four bytes is wide enough to draw at
/// random for every seal without a counter that machines which never meet would
/// have to agree on.
pub const NONCE_BYTES: usize = 24;

/// The width of an X25519 public key.
pub const PUBLIC_KEY_BYTES: usize = 32;

/// The width of an X25519 secret key.
pub const SECRET_KEY_BYTES: usize = 32;

/// The width of the secret half an invitation link carries.
pub const INVITATION_SECRET_BYTES: usize = 32;

/// The width of the organization content key.
pub const CONTENT_KEY_BYTES: usize = 32;

/// Poly1305's tag, appended to every ciphertext this module produces.
const TAG_BYTES: usize = 16;

/// **The only thing a failed unseal ever says.** A wrong password, a truncated
/// ciphertext, a flipped bit, a secret key belonging to somebody else, and a
/// sealed value moved onto another member's row all end here with this exact
/// message, so nothing an attacker can run tells them which of those they hit.
const UNOPENABLE: &str = "the sealed value did not open";

/// Bound into the sealed secret key as associated data, along with the public key
/// and the derivation it was sealed under. Rewriting any of those three without
/// the password fails the tag rather than being caught by a comparison.
const SEALED_SECRET_KEY_DOMAIN: &[u8] = b"rentable.organization.vault.sealed-secret-key.v1";

/// Separates the sealed-box key derivation from every other use of HKDF here.
const SEALED_BOX_DOMAIN: &[u8] = b"rentable.organization.vault.sealed-box.v1";

/// Separates the invitation key derivation from every other use of HKDF here.
const INVITATION_DOMAIN: &[u8] = b"rentable.organization.vault.invitation.v1";

/// Prefixes the associated data of every column sealed under the content key.
const CONTENT_DOMAIN: &[u8] = b"rentable.organization.vault.content.v1";

/// The Argon2id cost one vault was sealed under.
///
/// **This is data the caller supplies and this module carries beside the
/// ciphertext.** There is deliberately no default and no constant: a cost
/// compiled in is a cost that can only be raised by a migration, and the point of
/// keeping it here is that raising it is a re-seal on the next sign-in.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct KdfParams {
    /// Memory cost in kibibytes.
    pub memory_kib: u32,
    /// Time cost, the number of passes.
    pub iterations: u32,
    /// Parallelism, the number of lanes.
    pub lanes: u32,
}

impl KdfParams {
    /// The text a stored `kdf_params` is, naming the algorithm and the version as
    /// well as the three costs. A future algorithm therefore cannot be read as
    /// this one by a client that only knew how to parse three numbers.
    pub fn encode(&self) -> String {
        format!(
            "argon2id$v=19$m={},t={},p={}",
            self.memory_kib, self.iterations, self.lanes
        )
    }

    /// Reads back what [`KdfParams::encode`] wrote, refusing anything else.
    pub fn parse(encoded: &str) -> Result<Self, Error> {
        let costs = encoded
            .strip_prefix("argon2id$v=19$")
            .ok_or_else(unreadable_params)?;
        let mut fields = costs.split(',');

        let memory_kib = read_cost(fields.next(), "m")?;
        let iterations = read_cost(fields.next(), "t")?;
        let lanes = read_cost(fields.next(), "p")?;

        if fields.next().is_some() {
            return Err(unreadable_params());
        }

        Ok(Self {
            memory_kib,
            iterations,
            lanes,
        })
    }
}

/// A key derived from a password. Never stored, never serialized, and scrubbed
/// when it drops.
pub struct MemberKey([u8; MEMBER_KEY_BYTES]);

/// Scrubbed on the way out, by a volatile write rather than an assignment: an
/// assignment to a value about to be released is a dead store and the optimiser
/// may drop it. This is what the `zeroize` crate does, written out in six lines
/// rather than taken as a fifth dependency for one struct.
///
/// **It buys less than it looks like it buys.** A debugger, a core dump, or a page
/// that reached swap while the key was live all defeat it, which the threat model
/// says plainly. What it does buy is that a key is not still sitting in a freed
/// allocation for the rest of the session.
impl Drop for MemberKey {
    fn drop(&mut self) {
        for byte in &mut self.0 {
            // SAFETY: a one-byte volatile write through a pointer to a byte this
            // value owns and is in the middle of releasing.
            unsafe { std::ptr::write_volatile(byte, 0) };
        }

        std::sync::atomic::compiler_fence(std::sync::atomic::Ordering::SeqCst);
    }
}

/// **Redacted, and that is the whole of it.** A key that renders itself reaches a
/// log the first time somebody derives one of these inside a struct somebody else
/// prints, and a diagnostic file is not where a member key goes.
impl fmt::Debug for MemberKey {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("MemberKey(redacted)")
    }
}

/// The organization content key: what every `_sealed` column in the organization
/// database is sealed under, so that a name or an address is legible to a member
/// whose vault is open and to nobody holding only the database.
///
/// One per organization. It reaches a member sealed to their public key, in
/// `member.sealed_content_key`, and is unsealed with the secret key their password
/// opens. Scrubbed on drop and redacted in `Debug`, for the reasons [`MemberKey`]
/// gives.
pub struct ContentKey([u8; CONTENT_KEY_BYTES]);

impl ContentKey {
    /// Reads a key back from the bytes a member unsealed.
    pub fn from_bytes(bytes: [u8; CONTENT_KEY_BYTES]) -> Self {
        Self(bytes)
    }

    /// The bytes to seal to a member's public key. Nowhere else.
    pub fn to_bytes(&self) -> [u8; CONTENT_KEY_BYTES] {
        self.0
    }
}

impl Drop for ContentKey {
    fn drop(&mut self) {
        for byte in &mut self.0 {
            // SAFETY: as for `MemberKey`, a volatile write through a pointer to a
            // byte this value owns and is releasing.
            unsafe { std::ptr::write_volatile(byte, 0) };
        }

        std::sync::atomic::compiler_fence(std::sync::atomic::Ordering::SeqCst);
    }
}

impl fmt::Debug for ContentKey {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("ContentKey(redacted)")
    }
}

/// A member's X25519 secret key. It exists only between an unseal and the use it
/// was unsealed for, and it never crosses the IPC boundary.
pub struct MemberSecretKey(StaticSecret);

/// Redacted, for the reason [`MemberKey`]'s is.
impl fmt::Debug for MemberSecretKey {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("MemberSecretKey(redacted)")
    }
}

impl MemberSecretKey {
    /// The public half, which is what a credential is sealed to and the only half
    /// that is ever written down.
    pub fn public_key(&self) -> [u8; PUBLIC_KEY_BYTES] {
        PublicKey::from(&self.0).to_bytes()
    }
}

/// What a member's row carries: the public half of their keypair, the secret half
/// sealed under their password, and the derivation that seal used.
///
/// The three sealed fields travel together because the seal binds them together.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Vault {
    /// The public half. A credential is sealed to this and an administrator needs
    /// nothing else to grant one.
    pub public_key: [u8; PUBLIC_KEY_BYTES],
    /// The nonce followed by the sealed secret half.
    pub sealed_secret_key: Vec<u8>,
    /// The salt this vault's member key was derived with.
    pub kdf_salt: [u8; KDF_SALT_BYTES],
    /// The cost this vault's member key was derived at.
    pub kdf_params: KdfParams,
}

/// An invitation payload, which needs both halves to open: the secret the link
/// carries and the password the person carries.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SealedInvitation {
    /// The nonce followed by the sealed payload.
    pub sealed_payload: Vec<u8>,
    /// The salt the generated password was stretched with.
    pub kdf_salt: [u8; KDF_SALT_BYTES],
    /// The cost the generated password was stretched at.
    pub kdf_params: KdfParams,
}

/// Stretches a password into a member key.
///
/// **This succeeds for every password.** Nothing here knows or could know whether
/// the password was the right one, which is what leaves the AEAD tag as the only
/// place a wrong one can fail.
pub fn derive_member_key(
    password: &str,
    kdf_salt: &[u8; KDF_SALT_BYTES],
    kdf_params: KdfParams,
) -> Result<MemberKey, Error> {
    let params = Params::new(
        kdf_params.memory_kib,
        kdf_params.iterations,
        kdf_params.lanes,
        Some(MEMBER_KEY_BYTES),
    )
    .map_err(|error| Error::InvalidInput {
        message: format!("the stored derivation parameters cannot be used: {error}"),
    })?;

    let mut member_key = [0_u8; MEMBER_KEY_BYTES];

    Argon2::new(Algorithm::Argon2id, Version::V0x13, params)
        .hash_password_into(password.as_bytes(), kdf_salt, &mut member_key)
        .map_err(|error| Error::Internal {
            message: format!("failed to derive a member key: {error}"),
        })?;

    Ok(MemberKey(member_key))
}

/// Builds a member a fresh vault: a new keypair, a new salt, and the secret half
/// sealed under the password at the cost the caller asked for.
pub fn create_vault(password: &str, kdf_params: KdfParams) -> Result<Vault, Error> {
    let secret_key = MemberSecretKey(StaticSecret::from(random_bytes::<SECRET_KEY_BYTES>()?));

    reseal_vault(&secret_key, password, kdf_params)
}

/// Opens a vault with a password, yielding the secret key it was sealing.
///
/// The wrong password produces [`Error::Integrity`] with a message that says only
/// that the value did not open.
pub fn open_vault(password: &str, vault: &Vault) -> Result<MemberSecretKey, Error> {
    let member_key = derive_member_key(password, &vault.kdf_salt, vault.kdf_params)?;

    open_sealed_secret_key(&member_key, vault)
}

/// Re-seals a secret key under a new password, at whatever cost the caller now
/// asks for, with a fresh salt and a fresh nonce.
///
/// The public key is unchanged, so every credential already sealed to this member
/// still opens and nothing else in the organization is touched. Raising the cost
/// is this call and nothing more.
pub fn reseal_vault(
    secret_key: &MemberSecretKey,
    password: &str,
    kdf_params: KdfParams,
) -> Result<Vault, Error> {
    let public_key = secret_key.public_key();
    let kdf_salt = random_bytes::<KDF_SALT_BYTES>()?;
    let nonce = random_bytes::<NONCE_BYTES>()?;
    let member_key = derive_member_key(password, &kdf_salt, kdf_params)?;

    let mut sealed_secret_key = nonce.to_vec();
    sealed_secret_key.extend_from_slice(&seal_bytes(
        &member_key.0,
        &nonce,
        &secret_key.0.to_bytes(),
        &sealed_secret_key_aad(&public_key, &kdf_salt, kdf_params),
    )?);

    Ok(Vault {
        public_key,
        sealed_secret_key,
        kdf_salt,
        kdf_params,
    })
}

/// Seals a credential to a member's public key.
///
/// **The sealer holds no secret of their own and needs no password**, which is
/// what lets an administrator grant a workspace to a member whose password they
/// do not know. The output carries the ephemeral public key it was sealed with.
pub fn seal_to_public_key(
    recipient_public_key: &[u8; PUBLIC_KEY_BYTES],
    plaintext: &[u8],
) -> Result<Vec<u8>, Error> {
    let ephemeral = StaticSecret::from(random_bytes::<SECRET_KEY_BYTES>()?);
    let ephemeral_public_key = PublicKey::from(&ephemeral).to_bytes();
    let shared = ephemeral.diffie_hellman(&PublicKey::from(*recipient_public_key));

    if !shared.was_contributory() {
        return Err(Error::InvalidInput {
            message: "the recipient public key cannot be sealed to".to_string(),
        });
    }

    let (key, nonce) = sealed_box_key(&shared, &ephemeral_public_key, recipient_public_key)?;

    let mut sealed = ephemeral_public_key.to_vec();
    sealed.extend_from_slice(&seal_bytes(&key, &nonce, plaintext, SEALED_BOX_DOMAIN)?);

    Ok(sealed)
}

/// Opens what was sealed to this secret key's public half. No other key opens it.
pub fn unseal_with_secret_key(
    secret_key: &MemberSecretKey,
    sealed: &[u8],
) -> Result<Vec<u8>, Error> {
    if sealed.len() < PUBLIC_KEY_BYTES + TAG_BYTES {
        return Err(unopenable());
    }

    let (ephemeral, ciphertext) = sealed.split_at(PUBLIC_KEY_BYTES);
    let mut ephemeral_public_key = [0_u8; PUBLIC_KEY_BYTES];
    ephemeral_public_key.copy_from_slice(ephemeral);

    let shared = secret_key
        .0
        .diffie_hellman(&PublicKey::from(ephemeral_public_key));

    // a low-order ephemeral key agrees to zero with every secret key there is, so
    // it would open for anybody. It fails as everything else here fails.
    if !shared.was_contributory() {
        return Err(unopenable());
    }

    let (key, nonce) = sealed_box_key(&shared, &ephemeral_public_key, &secret_key.public_key())?;

    unseal_bytes(&key, &nonce, ciphertext, SEALED_BOX_DOMAIN)
}

/// Draws a fresh organization content key. Once per organization, at creation.
pub fn generate_content_key() -> Result<ContentKey, Error> {
    Ok(ContentKey(random_bytes::<CONTENT_KEY_BYTES>()?))
}

/// Seals one column value under the content key, yielding the nonce followed by
/// the ciphertext.
///
/// `column` is bound as associated data, so a ciphertext lifted out of
/// `member.email_sealed` and written into `member.display_name_sealed` does not
/// open there: a value is legible only in the place it was sealed for.
pub fn seal_content(key: &ContentKey, column: &str, plaintext: &[u8]) -> Result<Vec<u8>, Error> {
    let nonce = random_bytes::<NONCE_BYTES>()?;

    let mut sealed = nonce.to_vec();
    sealed.extend_from_slice(&seal_bytes(
        &key.0,
        &nonce,
        plaintext,
        &content_aad(column),
    )?);

    Ok(sealed)
}

/// The other direction. A wrong key, a wrong column or a changed byte all fail
/// the same way, as [`Error::Integrity`] saying only that the value did not open.
pub fn open_content(key: &ContentKey, column: &str, sealed: &[u8]) -> Result<Vec<u8>, Error> {
    let (nonce, ciphertext) = split_nonce(sealed)?;

    unseal_bytes(&key.0, &nonce, ciphertext, &content_aad(column))
}

/// Seals an invitation payload under both of its halves: the secret the link
/// carries, and the generated password the person carries.
///
/// Neither half alone opens it, which is what makes a link that also carries a
/// read-only credential useless on its own.
pub fn seal_invitation(
    invitation_secret: &[u8; INVITATION_SECRET_BYTES],
    generated_password: &str,
    kdf_params: KdfParams,
    payload: &[u8],
) -> Result<SealedInvitation, Error> {
    let kdf_salt = random_bytes::<KDF_SALT_BYTES>()?;
    let nonce = random_bytes::<NONCE_BYTES>()?;
    let key = invitation_key(invitation_secret, generated_password, &kdf_salt, kdf_params)?;

    let mut sealed_payload = nonce.to_vec();
    sealed_payload.extend_from_slice(&seal_bytes(
        &key,
        &nonce,
        payload,
        &invitation_aad(&kdf_salt, kdf_params),
    )?);

    Ok(SealedInvitation {
        sealed_payload,
        kdf_salt,
        kdf_params,
    })
}

/// Opens an invitation, given both halves.
pub fn open_invitation(
    invitation_secret: &[u8; INVITATION_SECRET_BYTES],
    generated_password: &str,
    sealed: &SealedInvitation,
) -> Result<Vec<u8>, Error> {
    let key = invitation_key(
        invitation_secret,
        generated_password,
        &sealed.kdf_salt,
        sealed.kdf_params,
    )?;
    let (nonce, ciphertext) = split_nonce(&sealed.sealed_payload)?;

    unseal_bytes(
        &key,
        &nonce,
        ciphertext,
        &invitation_aad(&sealed.kdf_salt, sealed.kdf_params),
    )
}

/// Opens a vault with a member key that is already derived.
///
/// Separate from [`open_vault`] only so a test can offer a key that no password
/// of this vault would have produced. There is nothing here that a caller holding
/// the right key does differently from one holding the wrong key.
fn open_sealed_secret_key(member_key: &MemberKey, vault: &Vault) -> Result<MemberSecretKey, Error> {
    let (nonce, ciphertext) = split_nonce(&vault.sealed_secret_key)?;

    let plaintext = unseal_bytes(
        &member_key.0,
        &nonce,
        ciphertext,
        &sealed_secret_key_aad(&vault.public_key, &vault.kdf_salt, vault.kdf_params),
    )?;

    let secret_key: [u8; SECRET_KEY_BYTES] = plaintext.try_into().map_err(|_| unopenable())?;

    Ok(MemberSecretKey(StaticSecret::from(secret_key)))
}

/// What the sealed secret key is authenticated against: the domain, the public
/// key it belongs to, and the derivation it was sealed under.
fn sealed_secret_key_aad(
    public_key: &[u8; PUBLIC_KEY_BYTES],
    kdf_salt: &[u8; KDF_SALT_BYTES],
    kdf_params: KdfParams,
) -> Vec<u8> {
    let mut aad = SEALED_SECRET_KEY_DOMAIN.to_vec();

    aad.extend_from_slice(public_key);
    aad.extend_from_slice(kdf_salt);
    aad.extend_from_slice(kdf_params.encode().as_bytes());

    aad
}

/// XChaCha20-Poly1305, with the tag appended.
fn seal_bytes(
    key: &[u8; MEMBER_KEY_BYTES],
    nonce: &[u8; NONCE_BYTES],
    plaintext: &[u8],
    aad: &[u8],
) -> Result<Vec<u8>, Error> {
    cipher(key)
        .encrypt(
            &nonce_of(nonce),
            Payload {
                msg: plaintext,
                aad,
            },
        )
        .map_err(|error| Error::Internal {
            message: format!("failed to seal a value: {error}"),
        })
}

/// The other direction. Every way this can fail is [`UNOPENABLE`].
fn unseal_bytes(
    key: &[u8; MEMBER_KEY_BYTES],
    nonce: &[u8; NONCE_BYTES],
    ciphertext: &[u8],
    aad: &[u8],
) -> Result<Vec<u8>, Error> {
    cipher(key)
        .decrypt(
            &nonce_of(nonce),
            Payload {
                msg: ciphertext,
                aad,
            },
        )
        .map_err(|_| unopenable())
}

/// HKDF-SHA256, extract then expand, filling `okm`.
fn expand(salt: Option<&[u8]>, ikm: &[u8], info: &[u8], okm: &mut [u8]) -> Result<(), Error> {
    Hkdf::<Sha256>::new(salt, ikm)
        .expand(info, okm)
        .map_err(|error| Error::Internal {
            message: format!("failed to expand a key: {error}"),
        })
}

/// Splits a stored `nonce || ciphertext` into its two halves.
fn split_nonce(sealed: &[u8]) -> Result<([u8; NONCE_BYTES], &[u8]), Error> {
    if sealed.len() < NONCE_BYTES + TAG_BYTES {
        return Err(unopenable());
    }

    let (head, ciphertext) = sealed.split_at(NONCE_BYTES);
    let mut nonce = [0_u8; NONCE_BYTES];
    nonce.copy_from_slice(head);

    Ok((nonce, ciphertext))
}

/// Random bytes, drawn the way this crate already draws them.
fn random_bytes<const N: usize>() -> Result<[u8; N], Error> {
    let mut bytes = [0_u8; N];

    getrandom::fill(&mut bytes).map_err(|error| Error::Internal {
        message: format!("failed to draw random bytes for the vault: {error}"),
    })?;

    Ok(bytes)
}

/// The key and the nonce one sealed box uses, derived from the agreement rather
/// than drawn: the ephemeral half is fresh for every seal, so the pair is fresh
/// too, and there is nothing to store.
///
/// Both public keys go into `info`, which is what stops a sealed credential being
/// moved onto another member and opening there.
fn sealed_box_key(
    shared: &SharedSecret,
    ephemeral_public_key: &[u8; PUBLIC_KEY_BYTES],
    recipient_public_key: &[u8; PUBLIC_KEY_BYTES],
) -> Result<([u8; MEMBER_KEY_BYTES], [u8; NONCE_BYTES]), Error> {
    let mut info = SEALED_BOX_DOMAIN.to_vec();
    info.extend_from_slice(ephemeral_public_key);
    info.extend_from_slice(recipient_public_key);

    let mut material = [0_u8; MEMBER_KEY_BYTES + NONCE_BYTES];
    expand(None, shared.as_bytes(), &info, &mut material)?;

    let (key, nonce) = material.split_at(MEMBER_KEY_BYTES);
    let mut sealing_key = [0_u8; MEMBER_KEY_BYTES];
    let mut sealing_nonce = [0_u8; NONCE_BYTES];
    sealing_key.copy_from_slice(key);
    sealing_nonce.copy_from_slice(nonce);

    Ok((sealing_key, sealing_nonce))
}

/// The key an invitation is sealed under: the generated password stretched, then
/// mixed with the secret the link carries. Whoever holds one half holds nothing.
fn invitation_key(
    invitation_secret: &[u8; INVITATION_SECRET_BYTES],
    generated_password: &str,
    kdf_salt: &[u8; KDF_SALT_BYTES],
    kdf_params: KdfParams,
) -> Result<[u8; MEMBER_KEY_BYTES], Error> {
    let stretched = derive_member_key(generated_password, kdf_salt, kdf_params)?;

    let mut key = [0_u8; MEMBER_KEY_BYTES];
    expand(
        Some(invitation_secret),
        &stretched.0,
        INVITATION_DOMAIN,
        &mut key,
    )?;

    Ok(key)
}

/// What an invitation is authenticated against.
/// The associated data one sealed column carries: the domain and the column's
/// own name.
fn content_aad(column: &str) -> Vec<u8> {
    let mut aad = CONTENT_DOMAIN.to_vec();
    aad.push(b'.');
    aad.extend_from_slice(column.as_bytes());

    aad
}

fn invitation_aad(kdf_salt: &[u8; KDF_SALT_BYTES], kdf_params: KdfParams) -> Vec<u8> {
    let mut aad = INVITATION_DOMAIN.to_vec();

    aad.extend_from_slice(kdf_salt);
    aad.extend_from_slice(kdf_params.encode().as_bytes());

    aad
}

/// XChaCha20-Poly1305 under one key.
fn cipher(key: &[u8; MEMBER_KEY_BYTES]) -> XChaCha20Poly1305 {
    XChaCha20Poly1305::new(&Key::from(*key))
}

fn nonce_of(nonce: &[u8; NONCE_BYTES]) -> XNonce {
    XNonce::from(*nonce)
}

/// One reading of a cost field out of stored text.
fn read_cost(field: Option<&str>, name: &str) -> Result<u32, Error> {
    field
        .and_then(|field| field.strip_prefix(name))
        .and_then(|field| field.strip_prefix('='))
        .and_then(|value| value.parse().ok())
        .ok_or_else(unreadable_params)
}

fn unreadable_params() -> Error {
    Error::InvalidInput {
        message: "the stored derivation parameters are not ones this build wrote".to_string(),
    }
}

/// The message every failed unseal carries, and the only one.
fn unopenable() -> Error {
    Error::Integrity {
        message: UNOPENABLE.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use std::time::Instant;

    use super::*;

    /// A cost cheap enough to run in a suite. It is written out per test exactly
    /// as a caller writes one out, because there is no default here to reach for
    /// and that absence is the point.
    fn test_cost() -> KdfParams {
        KdfParams {
            memory_kib: 1024,
            iterations: 2,
            lanes: 1,
        }
    }

    /// What the application seals a member's vault under, written out here as a
    /// caller would supply it rather than read from the module.
    fn shipping_cost() -> KdfParams {
        KdfParams {
            memory_kib: 256 * 1024,
            iterations: 3,
            lanes: 1,
        }
    }

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

    const CHECKED_IN_PASSWORD: &str = "correct horse battery staple";
    const CHECKED_IN_SECRET_KEY: &str =
        "77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a";
    const CHECKED_IN_PUBLIC_KEY: &str =
        "8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a";
    const CHECKED_IN_SALT: &str = "000102030405060708090a0b0c0d0e0f";

    /// The vault the vectors below pin, byte for byte. Every field of it was
    /// produced outside this crate: the member key by OpenSSL 3.5.7's Argon2id,
    /// the keypair by OpenSSL's X25519, and the ciphertext by a standalone
    /// XChaCha20-Poly1305 checked against RFC 8439 section 2.8.2.
    fn checked_in_vault() -> Vault {
        Vault {
            public_key: hex_array(CHECKED_IN_PUBLIC_KEY),
            sealed_secret_key: hex(concat!(
                "202122232425262728292a2b2c2d2e2f3031323334353637",
                "3b699282d6e5a2217b4e5f2735ddf1df19f7bcb4af699133",
                "313e1699ada4d0203fb331b2d9011dc9f1c44eafb2cb767f",
            )),
            kdf_salt: hex_array(CHECKED_IN_SALT),
            kdf_params: test_cost(),
        }
    }

    // the schedule round-trips

    #[test]
    fn a_vault_opens_under_the_password_it_was_sealed_with() {
        let vault = create_vault("a chosen password", test_cost()).expect("failed to create");

        let secret_key = open_vault("a chosen password", &vault).expect("failed to open");

        assert_eq!(secret_key.public_key(), vault.public_key);
    }

    #[test]
    fn a_credential_sealed_to_a_public_key_opens_with_its_secret_half() {
        let vault = create_vault("a chosen password", test_cost()).expect("failed to create");
        let credential = b"a whole-database token for one workspace";

        let sealed = seal_to_public_key(&vault.public_key, credential).expect("failed to seal");
        let secret_key = open_vault("a chosen password", &vault).expect("failed to open");

        assert_eq!(
            unseal_with_secret_key(&secret_key, &sealed).expect("failed to unseal"),
            credential
        );
    }

    #[test]
    fn sealing_to_a_public_key_needs_no_password_and_no_secret_of_the_sealers_own() {
        // the administrator's half of a grant: they hold the member's public key
        // out of a row and nothing else, and that is enough to grant a workspace.
        let member = create_vault("the member password", test_cost()).expect("failed to create");

        let sealed = seal_to_public_key(&member.public_key, b"a token").expect("failed to seal");

        let secret_key = open_vault("the member password", &member).expect("failed to open");
        assert_eq!(
            unseal_with_secret_key(&secret_key, &sealed).expect("failed to unseal"),
            b"a token"
        );
    }

    #[test]
    fn a_reseal_keeps_the_public_key_and_opens_under_the_new_password() {
        let vault = create_vault("the old password", test_cost()).expect("failed to create");
        let secret_key = open_vault("the old password", &vault).expect("failed to open");

        let resealed =
            reseal_vault(&secret_key, "the new password", test_cost()).expect("failed to reseal");

        assert_eq!(resealed.public_key, vault.public_key);
        assert_eq!(
            open_vault("the new password", &resealed)
                .expect("failed to open")
                .public_key(),
            vault.public_key
        );
    }

    #[test]
    fn a_reseal_leaves_credentials_already_sealed_to_the_member_openable() {
        let vault = create_vault("the old password", test_cost()).expect("failed to create");
        let sealed = seal_to_public_key(&vault.public_key, b"a token").expect("failed to seal");

        let secret_key = open_vault("the old password", &vault).expect("failed to open");
        let resealed =
            reseal_vault(&secret_key, "the new password", test_cost()).expect("failed to reseal");
        let reopened = open_vault("the new password", &resealed).expect("failed to open");

        assert_eq!(
            unseal_with_secret_key(&reopened, &sealed).expect("failed to unseal"),
            b"a token"
        );
    }

    #[test]
    fn a_reseal_draws_a_fresh_salt_and_a_fresh_nonce() {
        let vault = create_vault("the same password", test_cost()).expect("failed to create");
        let secret_key = open_vault("the same password", &vault).expect("failed to open");

        let resealed =
            reseal_vault(&secret_key, "the same password", test_cost()).expect("failed to reseal");

        assert_ne!(resealed.kdf_salt, vault.kdf_salt);
        assert_ne!(resealed.sealed_secret_key, vault.sealed_secret_key);
    }

    #[test]
    fn an_invitation_opens_with_both_halves() {
        let link_secret = hex_array::<INVITATION_SECRET_BYTES>(
            "1111111111111111111111111111111111111111111111111111111111111111",
        );
        let payload = b"the organization id, its verifying key, and a read-only credential";

        let sealed = seal_invitation(&link_secret, "a generated password", test_cost(), payload)
            .expect("failed to seal");

        assert_eq!(
            open_invitation(&link_secret, "a generated password", &sealed).expect("failed to open"),
            payload
        );
    }

    // the content key

    #[test]
    fn a_sealed_column_opens_under_its_key_in_its_own_column_and_nowhere_else() {
        let key = generate_content_key().expect("failed to draw a content key");
        let other = generate_content_key().expect("failed to draw a second key");

        let sealed = seal_content(&key, "member.email_sealed", b"somebody@example.com")
            .expect("failed to seal");

        assert_eq!(
            open_content(&key, "member.email_sealed", &sealed).expect("failed to open"),
            b"somebody@example.com"
        );
        assert!(
            !sealed
                .windows(b"somebody".len())
                .any(|window| window == b"somebody"),
            "the plaintext is legible in the ciphertext"
        );

        // lifted into another column, it does not open there
        assert_eq!(
            open_content(&key, "member.display_name_sealed", &sealed)
                .expect_err("a ciphertext opened in a column it was not sealed for")
                .to_string(),
            UNOPENABLE
        );
        // and a different organization's key opens nothing
        assert_eq!(
            open_content(&other, "member.email_sealed", &sealed)
                .expect_err("another key opened it")
                .to_string(),
            UNOPENABLE
        );
    }

    #[test]
    fn the_content_key_travels_to_a_member_as_a_sealed_box_and_nowhere_in_the_clear() {
        let key = generate_content_key().expect("failed to draw a content key");
        let vault = create_vault("a password", test_cost()).expect("failed to create");

        let sealed_content_key =
            seal_to_public_key(&vault.public_key, &key.to_bytes()).expect("failed to seal");
        let secret_key = open_vault("a password", &vault).expect("failed to open");
        let unsealed = unseal_with_secret_key(&secret_key, &sealed_content_key)
            .expect("the member could not unseal the content key");

        let mut bytes = [0_u8; CONTENT_KEY_BYTES];
        bytes.copy_from_slice(&unsealed);
        let recovered = ContentKey::from_bytes(bytes);

        let sealed = seal_content(&key, "organization.name_sealed", b"Acme Rentals")
            .expect("failed to seal");

        assert_eq!(
            open_content(&recovered, "organization.name_sealed", &sealed)
                .expect("the recovered key did not open what the original sealed"),
            b"Acme Rentals"
        );
        assert_eq!(format!("{key:?}"), "ContentKey(redacted)");
    }

    // a wrong password is indistinguishable from anything else

    #[test]
    fn a_wrong_password_yields_no_key() {
        let vault = create_vault("the right password", test_cost()).expect("failed to create");

        let outcome = open_vault("the wrong password", &vault);

        assert!(outcome.is_err(), "the wrong password opened the vault");
    }

    #[test]
    fn deriving_a_member_key_succeeds_whatever_the_password_is() {
        // nothing here has anything to compare a password against, so this step
        // cannot fail on a wrong one and cannot report one. The tag is the only
        // place a wrong password shows up at all.
        let vault = create_vault("the right password", test_cost()).expect("failed to create");

        let derived = derive_member_key("the wrong password", &vault.kdf_salt, vault.kdf_params);

        assert!(derived.is_ok(), "deriving refused a password");
    }

    #[test]
    fn a_wrong_password_fails_exactly_as_a_tampered_ciphertext_does() {
        let vault = create_vault("the right password", test_cost()).expect("failed to create");

        let mut tampered = vault.clone();
        let last = tampered.sealed_secret_key.len() - 1;
        tampered.sealed_secret_key[last] ^= 0x01;

        let from_a_wrong_password = open_vault("the wrong password", &vault).unwrap_err();
        let from_a_tampered_ciphertext = open_vault("the right password", &tampered).unwrap_err();

        assert_eq!(from_a_wrong_password, from_a_tampered_ciphertext);
        assert_eq!(
            from_a_wrong_password,
            Error::Integrity {
                message: UNOPENABLE.to_string()
            }
        );
    }

    #[test]
    fn a_truncated_ciphertext_fails_exactly_as_a_wrong_password_does() {
        let vault = create_vault("the right password", test_cost()).expect("failed to create");

        let mut truncated = vault.clone();
        truncated.sealed_secret_key.truncate(NONCE_BYTES);

        assert_eq!(
            open_vault("the right password", &truncated).unwrap_err(),
            open_vault("the wrong password", &vault).unwrap_err()
        );
    }

    #[test]
    fn a_rewritten_public_key_fails_the_tag_rather_than_a_comparison() {
        // `public_key`, `sealed_secret_key`, `kdf_salt` and `kdf_params` are the
        // member own row and are not signed, so any member who can write the
        // database can rewrite them. Binding them into the seal is what makes a
        // rewritten set fail, and it fails the way a wrong password does.
        let vault = create_vault("the right password", test_cost()).expect("failed to create");
        let other = create_vault("another password", test_cost()).expect("failed to create");

        let mut rewritten = vault.clone();
        rewritten.public_key = other.public_key;

        assert_eq!(
            open_vault("the right password", &rewritten).unwrap_err(),
            open_vault("the wrong password", &vault).unwrap_err()
        );
    }

    #[test]
    fn a_rewritten_salt_or_cost_fails_the_tag() {
        let vault = create_vault("the right password", test_cost()).expect("failed to create");

        let mut moved_salt = vault.clone();
        moved_salt.kdf_salt[0] ^= 0x01;

        let mut moved_cost = vault.clone();
        moved_cost.kdf_params.iterations += 1;

        assert!(open_vault("the right password", &moved_salt).is_err());
        assert!(open_vault("the right password", &moved_cost).is_err());
    }

    #[test]
    fn the_old_password_stops_opening_a_resealed_vault() {
        let vault = create_vault("the old password", test_cost()).expect("failed to create");
        let secret_key = open_vault("the old password", &vault).expect("failed to open");

        let resealed =
            reseal_vault(&secret_key, "the new password", test_cost()).expect("failed to reseal");

        assert!(open_vault("the old password", &resealed).is_err());
    }

    #[test]
    fn neither_half_of_an_invitation_opens_it_alone() {
        let link_secret = hex_array::<INVITATION_SECRET_BYTES>(
            "1111111111111111111111111111111111111111111111111111111111111111",
        );
        let other_secret = hex_array::<INVITATION_SECRET_BYTES>(
            "2222222222222222222222222222222222222222222222222222222222222222",
        );

        let sealed = seal_invitation(
            &link_secret,
            "a generated password",
            test_cost(),
            b"payload",
        )
        .expect("failed to seal");

        // the link, without the password the person carries
        assert!(open_invitation(&link_secret, "a guessed password", &sealed).is_err());
        // the password, without the secret the link carries
        assert!(open_invitation(&other_secret, "a generated password", &sealed).is_err());
    }

    #[test]
    fn a_tampered_sealed_credential_does_not_open() {
        let vault = create_vault("a chosen password", test_cost()).expect("failed to create");
        let secret_key = open_vault("a chosen password", &vault).expect("failed to open");

        let mut sealed = seal_to_public_key(&vault.public_key, b"a token").expect("failed to seal");
        let last = sealed.len() - 1;
        sealed[last] ^= 0x01;

        assert_eq!(
            unseal_with_secret_key(&secret_key, &sealed).unwrap_err(),
            Error::Integrity {
                message: UNOPENABLE.to_string()
            }
        );
    }

    // no key opens more than its own holder's credentials

    #[test]
    fn no_key_one_member_holds_opens_another_members_sealed_secret_key() {
        // this is what stops an escrow copy arriving later as a convenience. The
        // three keys below are every key a member or an administrator ever has,
        // and none of them opens a vault it did not build.
        let mine = create_vault("my password", test_cost()).expect("failed to create");
        let theirs = create_vault("their password", test_cost()).expect("failed to create");

        // my password
        assert!(open_vault("my password", &theirs).is_err());

        // my member key, derived against their salt and their cost
        let my_key_on_their_derivation =
            derive_member_key("my password", &theirs.kdf_salt, theirs.kdf_params)
                .expect("failed to derive");
        assert!(
            open_sealed_secret_key(&my_key_on_their_derivation, &theirs).is_err(),
            "a member key from another password opened their vault"
        );

        // my secret key, which is what an administrator holds after their own
        // sign-in and the only key a reset could be tempted to reach for
        let my_secret_key = open_vault("my password", &mine).expect("failed to open");
        assert!(
            unseal_with_secret_key(&my_secret_key, &theirs.sealed_secret_key).is_err(),
            "one member secret key read another member sealed secret key"
        );
    }

    #[test]
    fn a_credential_sealed_to_one_member_does_not_open_for_another() {
        let mine = create_vault("my password", test_cost()).expect("failed to create");
        let theirs = create_vault("their password", test_cost()).expect("failed to create");

        let sealed_to_them =
            seal_to_public_key(&theirs.public_key, b"a token").expect("failed to seal");
        let my_secret_key = open_vault("my password", &mine).expect("failed to open");

        assert!(
            unseal_with_secret_key(&my_secret_key, &sealed_to_them).is_err(),
            "a credential sealed to one member opened for another"
        );
    }

    #[test]
    fn the_same_password_twice_produces_two_unrelated_vaults() {
        let first = create_vault("the same password", test_cost()).expect("failed to create");
        let second = create_vault("the same password", test_cost()).expect("failed to create");

        assert_ne!(first.kdf_salt, second.kdf_salt);
        assert_ne!(first.public_key, second.public_key);
        assert!(open_vault("the same password", &first).is_ok());
        assert!(
            open_sealed_secret_key(
                &derive_member_key("the same password", &first.kdf_salt, first.kdf_params)
                    .expect("failed to derive"),
                &second
            )
            .is_err()
        );
    }

    // the cost is data the caller passes

    #[test]
    fn a_vault_opens_at_the_cost_it_was_sealed_at_rather_than_a_current_one() {
        let cheap = KdfParams {
            memory_kib: 1024,
            iterations: 1,
            lanes: 1,
        };
        let dearer = KdfParams {
            memory_kib: 2048,
            iterations: 3,
            lanes: 1,
        };

        let old = create_vault("a chosen password", cheap).expect("failed to create");
        assert_eq!(old.kdf_params, cheap);

        // raising the cost is a re-seal on the next sign-in, and nothing sealed at
        // the old cost has to move for it
        let secret_key = open_vault("a chosen password", &old).expect("failed to open");
        let raised =
            reseal_vault(&secret_key, "a chosen password", dearer).expect("failed to reseal");

        assert_eq!(raised.kdf_params, dearer);
        assert!(open_vault("a chosen password", &old).is_ok());
        assert!(open_vault("a chosen password", &raised).is_ok());
    }

    #[test]
    fn stored_kdf_params_round_trip_through_their_text() {
        let params = shipping_cost();

        let encoded = params.encode();

        assert_eq!(encoded, "argon2id$v=19$m=262144,t=3,p=1");
        assert_eq!(KdfParams::parse(&encoded).expect("failed to parse"), params);
    }

    #[test]
    fn stored_kdf_params_naming_anything_else_are_refused() {
        for encoded in [
            "argon2i$v=19$m=262144,t=3,p=1",
            "argon2id$v=16$m=262144,t=3,p=1",
            "m=262144,t=3,p=1",
            "argon2id$v=19$m=262144,t=3",
            "argon2id$v=19$m=lots,t=3,p=1",
            "",
        ] {
            assert!(
                KdfParams::parse(encoded).is_err(),
                "accepted stored parameters this module did not write: {encoded}"
            );
        }
    }

    // fixed vectors, so a dependency upgrade that changes an algorithm fails the
    // suite instead of re-deriving a different answer and passing

    #[test]
    fn a_member_key_matches_a_vector_from_another_implementation() {
        // produced by OpenSSL 3.5.7:
        //   openssl kdf -keylen 32 -kdfopt "pass:correct horse battery staple"
        //     -kdfopt hexsalt:000102030405060708090a0b0c0d0e0f
        //     -kdfopt iter:2 -kdfopt memcost:1024 -kdfopt threads:1 -kdfopt lanes:1 ARGON2ID
        let derived = derive_member_key(
            CHECKED_IN_PASSWORD,
            &hex_array(CHECKED_IN_SALT),
            test_cost(),
        )
        .expect("failed to derive");

        assert_eq!(
            to_hex(&derived.0),
            "58782fc96f06a6d7fcec4728099f6a788ee98a04f4cd8fa0a27af6db8b7a46b8"
        );
    }

    #[test]
    fn the_aead_matches_a_vector_from_another_implementation() {
        // produced by a standalone XChaCha20-Poly1305 that was itself checked
        // against RFC 8439 section 2.8.2's worked example.
        let sealed = seal_bytes(
            &hex_array("000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f"),
            &hex_array("202122232425262728292a2b2c2d2e2f3031323334353637"),
            &hex(CHECKED_IN_SECRET_KEY),
            SEALED_SECRET_KEY_DOMAIN,
        )
        .expect("failed to seal");

        assert_eq!(
            to_hex(&sealed),
            concat!(
                "6a5e20c1082fb1f604a891cf19f56794e219febb34539f9f5016a78c1280c628",
                "dd71fd43d0b0af812451f7eaaae74ecc"
            )
        );
    }

    #[test]
    fn key_agreement_matches_rfc_7748() {
        // RFC 7748 section 6.1, confirmed against OpenSSL 3.5.7's X25519.
        let secret_key = MemberSecretKey(StaticSecret::from(hex_array::<SECRET_KEY_BYTES>(
            CHECKED_IN_SECRET_KEY,
        )));
        let peer = PublicKey::from(hex_array::<PUBLIC_KEY_BYTES>(
            "de9edb7d7b7dc1b4d35b61c2ece435373f8343c85b78674dadfc7e146f882b4f",
        ));

        assert_eq!(to_hex(&secret_key.public_key()), CHECKED_IN_PUBLIC_KEY);
        assert_eq!(
            to_hex(secret_key.0.diffie_hellman(&peer).as_bytes()),
            "4a5d9d5ba4ce2de1728e3bf480350f25e07e21c947d19e3376f09b3c1e161742"
        );
    }

    #[test]
    fn key_expansion_matches_rfc_5869() {
        // RFC 5869 test case 1, confirmed against OpenSSL 3.5.7's HKDF.
        let mut okm = [0_u8; 42];

        expand(
            Some(&hex("000102030405060708090a0b0c")),
            &hex("0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b"),
            &hex("f0f1f2f3f4f5f6f7f8f9"),
            &mut okm,
        )
        .expect("failed to expand");

        assert_eq!(
            to_hex(&okm),
            concat!(
                "3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf",
                "34007208d5b887185865"
            )
        );
    }

    #[test]
    fn a_checked_in_vault_opens_under_its_checked_in_password() {
        // every byte of this vault was produced outside this crate. If a
        // dependency upgrade changes an algorithm underneath the schedule, this is
        // what stops it re-deriving a different answer and passing.
        let vault = checked_in_vault();

        let secret_key = open_vault(CHECKED_IN_PASSWORD, &vault).expect("failed to open");

        assert_eq!(to_hex(&secret_key.0.to_bytes()), CHECKED_IN_SECRET_KEY);
        assert_eq!(to_hex(&secret_key.public_key()), CHECKED_IN_PUBLIC_KEY);
    }

    #[test]
    fn the_checked_in_vault_opens_under_no_other_password() {
        assert!(open_vault("correct horse battery stapl", &checked_in_vault()).is_err());
        assert!(open_vault("", &checked_in_vault()).is_err());
    }

    // the cost, measured

    #[test]
    fn deriving_at_the_shipping_cost_is_usable() {
        // the measurement itself is recorded on the ticket. The bound here is
        // loose on purpose: this is not a benchmark, it is a refusal to ship a
        // cost that has stopped being a sign-in and started being a wait.
        let started = Instant::now();

        derive_member_key(
            "a chosen password",
            &hex_array(CHECKED_IN_SALT),
            shipping_cost(),
        )
        .expect("failed to derive");

        let elapsed = started.elapsed();
        println!("argon2id m=256MiB t=3 p=1 took {elapsed:?}");

        assert!(
            elapsed.as_secs() < 10,
            "deriving at the shipping cost took {elapsed:?}, which is no longer a sign-in"
        );
    }
}
