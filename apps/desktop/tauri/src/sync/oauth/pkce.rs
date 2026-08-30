//! the proof key, and the random values an authorization request carries.
//!
//! One function draws both the `state` and the PKCE verifier, so it sits beside the challenge
//! that is derived from the second of them rather than in a module of its own: RFC 7636 is what
//! fixes how long the value has to be, and it is the same RFC either way.

use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD as BASE64URL};
use sha2::{Digest, Sha256};

use crate::error::Error;

/// The number of random bytes behind an OAuth `state` value and a PKCE
/// verifier. RFC 7636 fixes the verifier between 43 and 128 characters, which
/// 32 bytes of base64url meets exactly at the lower bound.
const OAUTH_TOKEN_ENTROPY_BYTES: usize = 32;

/// A fresh URL-safe token drawn from the operating system's entropy source,
/// used for both the OAuth `state` and the PKCE verifier.
///
/// Fails only where the platform cannot supply randomness, which is not a
/// condition the caller can recover from by retrying.
pub(crate) fn random_url_safe_token() -> Result<String, Error> {
    let mut bytes = [0_u8; OAUTH_TOKEN_ENTROPY_BYTES];

    getrandom::fill(&mut bytes).map_err(|error| Error::Internal {
        message: format!("failed to draw random bytes for the oauth session: {error}"),
    })?;

    Ok(BASE64URL.encode(bytes))
}

/// The `S256` PKCE challenge for a verifier: unpadded base64url of its SHA-256
/// digest, as RFC 7636 section 4.2 defines it.
pub(crate) fn pkce_challenge(verifier: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(verifier.as_bytes());

    BASE64URL.encode(hasher.finalize())
}

#[cfg(test)]
mod tests {
    use super::{pkce_challenge, random_url_safe_token};

    /// the worked example from RFC 7636 appendix B. Google verifies the challenge
    /// against the verifier we send later, so an encoding that is merely
    /// self-consistent still fails against the live endpoint.
    #[test]
    fn the_pkce_challenge_matches_the_rfc_7636_worked_example() {
        assert_eq!(
            pkce_challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
    }

    #[test]
    fn a_random_token_is_unpadded_base64url_of_thirty_two_bytes() {
        let token = random_url_safe_token().expect("failed to draw a random token");

        assert_eq!(token.len(), 43);
        assert!(
            token
                .chars()
                .all(|character| character.is_ascii_alphanumeric()
                    || character == '-'
                    || character == '_'),
            "token left the base64url alphabet: {token}"
        );
    }

    #[test]
    fn two_random_tokens_differ() {
        let first = random_url_safe_token().expect("failed to draw a random token");
        let second = random_url_safe_token().expect("failed to draw a random token");

        assert_ne!(first, second);
    }
}
