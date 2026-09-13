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
//! **There is one link, and it carries an invitation half or it does not** (effort 826,
//! requirement 8). The organization's own link connects a machine to the organization, and a
//! username and password admit a person at the wall. An invitation is that same link with one more
//! field, the invitation's id and the secret that opens the member's vault the first time: the
//! secret is the generated password `invite.rs` seals the vault under, so it is never shown and
//! never handed over on its own, and opening the link is what turns it into a password the person
//! chose (`join.rs::accept`). A reset is the same link freshly issued. *Effort 824 had one kind of
//! link and handed the generated password over beside it; 819 carried a half that opened a sealed
//! payload naming the row. The half is back, and it opens the vault rather than a payload.*
//!
//! **A locator does not expire** (requirement 23). The read-only credential is minted with no
//! expiry, so the same link works on the day it was sent and a year later; what expires is the
//! invitation a person was handed inside it, and that is a row the members list revokes and
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
    /// the invitation this link was made for, where it was made for one. Absent on the
    /// organization's own link, and absent from its text rather than written as null, so the
    /// organization link's five fields are exactly what they were.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub invitation: Option<InvitationHalf>,
}

/// The invitation half of a link: which invitation, and the secret that opens the invited
/// member's vault once. The secret is the generated password the vault was sealed under, and this
/// is the one place it is ever spelled out ([[rules/credentials]] sanctions the link crossing).
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InvitationHalf {
    pub id: String,
    pub secret: String,
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
            invitation: None,
        }
    }

    /// This link, made for an invitation: the same five fields and the invitation's half.
    pub fn for_invitation(&self, invitation_id: &str, secret: &str) -> Self {
        Self {
            invitation: Some(InvitationHalf {
                id: invitation_id.to_string(),
                secret: secret.to_string(),
            }),
            ..self.clone()
        }
    }

    /// The invitation half, where this link carries one.
    pub fn invitation_half(&self) -> Option<&InvitationHalf> {
        self.invitation.as_ref()
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

        // an invitation half with either field blank is not a half: the link is not one.
        if decoded
            .invitation
            .as_ref()
            .is_some_and(|half| half.id.trim().is_empty() || half.secret.trim().is_empty())
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

    /// The text of a link, as JSON: what a person holding it can read out of it.
    fn fields_of(link: &JoinLink) -> (String, Vec<String>) {
        let encoded = link.encode().expect("failed to encode");
        let json = base64::Engine::decode(
            &base64::engine::general_purpose::URL_SAFE_NO_PAD,
            encoded.trim_start_matches("rentable://join/"),
        )
        .expect("base64url");
        let text = String::from_utf8(json.clone()).expect("utf-8");
        let fields: serde_json::Value = serde_json::from_slice(&json).expect("json");
        let mut names: Vec<String> = fields
            .as_object()
            .expect("an object")
            .keys()
            .cloned()
            .collect();
        names.sort_unstable();

        (text, names)
    }

    /// The organization's own link is five fields and nothing else; an invitation link is those
    /// five and the invitation half, and neither spells the word password: the secret inside the
    /// half is a field named for what it is, and the organization link carries no secret at all.
    /// *There was one kind of link from effort 824 to effort 826.*
    #[test]
    fn a_link_carries_five_fields_and_an_invitation_link_six() {
        let (text, names) = fields_of(&link());

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
        assert!(!text.contains("password"), "{text}");
        assert!(!text.contains("invitation"), "{text}");

        let (text, names) = fields_of(&link().for_invitation("inv-1", "abcde-fghjk-mnpqr-stuvw"));

        assert_eq!(
            names,
            [
                "invitation",
                "organizationId",
                "organizationName",
                "readOnlyCredential",
                "remoteUrl",
                "verifyingKey"
            ]
        );
        assert!(!text.contains("password"), "{text}");
    }

    /// The half round-trips, and a link made for an invitation still names the organization the
    /// way the organization's own does.
    #[test]
    fn an_invitation_link_round_trips_with_its_half() {
        let invitation = link().for_invitation("inv-1", "abcde-fghjk-mnpqr-stuvw");
        let encoded = invitation.encode().expect("failed to encode");
        let decoded = JoinLink::decode(&encoded).expect("failed to decode");

        assert_eq!(decoded, invitation);
        assert_eq!(decoded.organization_name, "Acme");
        assert_eq!(
            decoded.invitation_half().map(|half| half.id.as_str()),
            Some("inv-1")
        );
        assert_eq!(link().invitation_half(), None);

        // a half with a blank field is not a link.
        for (id, secret) in [("", "abcde"), ("inv-1", ""), (" ", " ")] {
            let broken = link().for_invitation(id, secret).encode().expect("encodes");

            assert!(
                matches!(
                    JoinLink::decode(&broken),
                    Err(crate::error::Error::InvalidInput { .. })
                ),
                "{id:?} {secret:?} decoded"
            );
        }
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
