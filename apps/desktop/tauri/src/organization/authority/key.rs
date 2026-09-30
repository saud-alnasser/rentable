//! the organization's key and a member's signing key: drawn, read back from the bytes the caller
//! sealed, and never rendered.

use std::fmt;

#[cfg(test)]
use ed25519_dalek::Signer;
use ed25519_dalek::SigningKey;

use crate::error::Error;

use super::{SIGNING_KEY_BYTES, VERIFYING_KEY_BYTES};

/// The organization's key. It signs the owner's certificate and a succession, and nothing else.
///
/// **Separate from [`AdministratorKey`] on purpose, and the duplication below is
/// the point.** The root is the one certificate the organization key signs, and
/// the compiler is what keeps a member's key from standing in for it rather than a
/// comment somebody has to read.
pub struct OrganizationKey(pub(super) SigningKey);

/// A member's signing key. It signs rows, and the certificates and revocations it issues.
pub struct AdministratorKey(pub(super) SigningKey);

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
    /// joins. It is an input to [`Chain::new`](super::Chain::new) and is never read back out of the
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

#[cfg(test)]
impl OrganizationKey {
    /// A signature over `message` as it stands: for a test building what an older format signed,
    /// whose preimages are not this module's.
    pub(crate) fn signed(&self, message: &[u8]) -> Vec<u8> {
        self.0.sign(message).to_bytes().to_vec()
    }
}

#[cfg(test)]
impl AdministratorKey {
    /// A signature over `message` as it stands: for a test building what an older format signed,
    /// whose preimages are not this module's.
    pub(crate) fn signed(&self, message: &[u8]) -> Vec<u8> {
        self.0.sign(message).to_bytes().to_vec()
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

    fn checked_in_organization_key() -> OrganizationKey {
        OrganizationKey::from_bytes(&hex_array(CHECKED_IN_ORGANIZATION_SEED))
    }

    fn checked_in_administrator_key() -> AdministratorKey {
        AdministratorKey::from_bytes(&hex_array(CHECKED_IN_ADMINISTRATOR_SEED))
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
}
