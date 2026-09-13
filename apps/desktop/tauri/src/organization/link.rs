//! the join link: what a machine needs to find an organization, and nothing useful alone.
//!
//! An owner hands one out; a person opens it, and their machine learns where the organization
//! database is, which key judges its rows, and how to read it before any vault is open
//! (requirement 8). What it deliberately carries is a **read-only** credential over a database
//! whose every name and address is sealed and whose every authority field is signed, so a person
//! holding the link and nothing else can pull the directory and read nothing legible out of it
//! (requirement 15, and `organization/store.rs`'s test over every cell). What it deliberately does
//! not carry is any password or any key: those are the person's, and a link found in a chat
//! history is a locator.
//!
//! **There is one link, the organization's own** (effort 824, requirement 18). It connects a
//! machine to the organization, and a username and password admit a person at the wall; an
//! invitation is the username and the generated password, handed over beside this same link.
//! *Until effort 824 a link made for an invitation carried the invitation's half of a secret,
//! which with the password opened a sealed payload naming the member's row; the row is found by
//! the password alone now, and the half is gone with the payload.*
//!
//! **A locator does not expire** (requirement 23). The read-only credential is minted with no
//! expiry, so the same link works on the day it was sent and a year later; what expires is the
//! pending account a person was handed with it, and that is a row the dashboard revokes and
//! reissues. Rotating the organization database's credentials, which a lock-out does, is the one
//! thing that retires a link, and the ticket that rotates is the ticket that reissues.
//!
//! **The verifying key rides in the link and is pinned from it**, never read out of the database it
//! judges. `organization/authority.rs` says why: a database whose rows were rewritten could rewrite
//! the key that checks them, and every signature would pass.

use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD as BASE64URL};
use serde::{Deserialize, Serialize};

use crate::error::Error;

use super::authority::VERIFYING_KEY_BYTES;

/// The scheme a link is spelled under. How a link is *opened*, whether by the operating system
/// handing the scheme to this application or by a person pasting it into a screen, is the join
/// ticket's; the spelling is fixed here so both ends agree on it.
const LINK_PREFIX: &str = "rentable://join/";

/// What a link carries.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JoinLink {
    pub organization_id: String,
    /// the organization's name, in the clear: what a lapsed invitation is refused in the name of
    /// (requirement 23), and not among the three things criterion 15 keeps from a link's holder.
    pub organization_name: String,
    /// the Ed25519 verifying key every row is judged against, base64url.
    pub verifying_key: String,
    /// where the organization database is, `libsql://...`.
    pub remote_url: String,
    /// reads the organization database, and nothing in it is legible without a vault.
    pub read_only_credential: String,
}

impl JoinLink {
    pub fn new(
        organization_id: &str,
        organization_name: &str,
        verifying_key: &[u8; VERIFYING_KEY_BYTES],
        remote_url: &str,
        read_only_credential: &str,
    ) -> Self {
        Self {
            organization_id: organization_id.to_string(),
            organization_name: organization_name.to_string(),
            verifying_key: BASE64URL.encode(verifying_key),
            remote_url: remote_url.to_string(),
            read_only_credential: read_only_credential.to_string(),
        }
    }

    /// The link as a person sees it and sends it: one line, one scheme, base64url of the fields.
    pub fn encode(&self) -> Result<String, Error> {
        let json = serde_json::to_vec(self).map_err(|error| Error::Internal {
            message: format!("failed to encode a join link: {error}"),
        })?;

        Ok(format!("{LINK_PREFIX}{}", BASE64URL.encode(json)))
    }

    /// The link read back. Anything that is not one is refused as input rather than as a defect,
    /// because the ordinary way to get here is a person pasting the wrong thing.
    pub fn decode(link: &str) -> Result<Self, Error> {
        let unreadable = || Error::InvalidInput {
            message: "this is not a rentable join link".to_string(),
        };
        let encoded = link
            .trim()
            .strip_prefix(LINK_PREFIX)
            .ok_or_else(unreadable)?;
        let json = BASE64URL.decode(encoded).map_err(|_| unreadable())?;
        let decoded: Self = serde_json::from_slice(&json).map_err(|_| unreadable())?;

        decoded.verifying_key_bytes()?;

        if decoded.organization_id.trim().is_empty()
            || decoded.remote_url.trim().is_empty()
            || decoded.read_only_credential.trim().is_empty()
        {
            return Err(unreadable());
        }

        Ok(decoded)
    }

    /// The verifying key as the chain takes it.
    pub fn verifying_key_bytes(&self) -> Result<[u8; VERIFYING_KEY_BYTES], Error> {
        let bytes = BASE64URL
            .decode(&self.verifying_key)
            .map_err(|_| Error::InvalidInput {
                message: "this join link carries no organization key".to_string(),
            })?;

        <[u8; VERIFYING_KEY_BYTES]>::try_from(bytes.as_slice()).map_err(|_| Error::InvalidInput {
            message: "this join link carries no organization key".to_string(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::JoinLink;

    fn link() -> JoinLink {
        JoinLink::new(
            "7f3a",
            "Acme",
            &[7_u8; 32],
            "libsql://org-7f3a-acme.aws-eu-west-1.turso.io",
            "a-read-only-credential",
        )
    }

    #[test]
    fn a_link_round_trips_and_is_one_line_under_one_scheme() {
        let encoded = link().encode().expect("failed to encode");

        assert!(encoded.starts_with("rentable://join/"), "{encoded}");
        assert!(!encoded.contains(char::is_whitespace), "{encoded}");
        assert_eq!(
            JoinLink::decode(&encoded).expect("failed to decode"),
            link()
        );
        assert_eq!(link().verifying_key_bytes().expect("a key"), [7_u8; 32]);
    }

    /// The five fields and nothing else: a link carries no password, no invitation and no key.
    /// *A link made for an invitation carried its half beside the five until effort 824; there
    /// is one kind of link now.*
    #[test]
    fn a_link_carries_the_five_fields_and_nothing_else() {
        let encoded = link().encode().expect("failed to encode");
        let json = base64::Engine::decode(
            &base64::engine::general_purpose::URL_SAFE_NO_PAD,
            encoded.trim_start_matches("rentable://join/"),
        )
        .expect("base64url");
        let fields: serde_json::Value = serde_json::from_slice(&json).expect("json");
        let mut names: Vec<&str> = fields
            .as_object()
            .expect("an object")
            .keys()
            .map(String::as_str)
            .collect();
        names.sort_unstable();

        assert_eq!(
            names,
            [
                "organizationId",
                "organizationName",
                "readOnlyCredential",
                "remoteUrl",
                "verifyingKey"
            ]
        );
        assert!(!encoded.contains("password"), "{encoded}");
        assert!(!encoded.contains("invitation"), "{encoded}");
    }

    #[test]
    fn what_is_not_a_link_is_refused_as_input() {
        for wrong in [
            "",
            "https://example.com",
            "rentable://join/",
            "rentable://join/not-base64!",
            "rentable://join/e30",
        ] {
            let error = JoinLink::decode(wrong).expect_err(wrong);

            assert!(
                matches!(error, crate::error::Error::InvalidInput { .. }),
                "{wrong}: {error:?}"
            );
        }
    }
}
