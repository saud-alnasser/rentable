//! the join link: where an organization is, and what it takes to read it.
//!
//! A person opens a link and their machine learns which organization it names, which key judges
//! its rows, and where the rows are. What it takes to *read* those rows is a credential, and how
//! the link carries one is the whole of what this file is about (effort 828, requirements 1 and
//! 16).
//!
//! **No link carries a legible credential.** A link is a [`Locator`], the four clear fields that
//! say where the organization is and what judges it, with a [`LinkPayload`] sealed onto it and a
//! [`Half`] saying which kind of link it is, which row stands behind it, the secret that salts the
//! code and the moment the link lapses. There are two kinds, an invitation and a member's own next
//! machine, and both are opened the same way: the six-character code somebody read out, and
//! nothing else. *Until effort 828 every link carried a never-expiring read-only credential in the
//! clear, whichever kind of link it was, so whoever found one pulled the whole directory
//! (`.aep/efforts/828-.../evidence/research/what-a-link-exposes-and-what-a-code-can-bound.md`).
//! That credential survived requirement 1 as the organization's own link, the copy that recovered
//! an organization whose every machine was gone; requirement 16 retired it, because the owner's
//! Turso account and password recover the organization now and nothing is left that has to be
//! legible.*
//!
//! **What is sealed, and under what.** The payload is [`LinkPayload`]: the issuer's own grant on
//! the organization database and, where the link opens a vault, the password that vault was made
//! under. It is sealed under a key Argon2id derives from the code, salted with the link's own
//! secret, with the half's kind, id and expiry and the locator's three fields bound as associated
//! data. So the code alone is thirty bits and the secret alone derives nothing: what opens the
//! payload is the two together, and each guess costs one Argon2id pass. A rewritten expiry opens
//! nothing, a seal lifted onto another link opens nothing, and a link whose address was rewritten
//! opens nothing, so nothing pulls a replica from a host the maker never named.
//!
//! **The seal rides in the link's text and it has to.** Nothing reads a row before the credential
//! is out, so a payload kept in a row would need the credential to fetch the row that holds the
//! credential (the research file's fifth finding). That is also why the code lives as long as the
//! link rather than ninety seconds: a fresh code is a fresh link text to re-send, and the clock
//! never bounded an attacker anyway. The barrier is the derivation.
//!
//! **What a lapse does that a code cannot.** A credential once unsealed is held, so no clock
//! retires it; the credential inside a sealed link is the issuer's own four-week grant, renewed
//! on the owner's machine, so a link whose code was guessed is dead within four weeks whatever
//! happens to the link itself (effort 828, requirement 2).
//!
//! **Reading a link is a decode.** [`read`] answers which organization the text names, which kind
//! of link it is and when it lapses, from the text alone, with no network and nothing opened.
//! Judging where the row behind it stands belongs to the act that takes the code, because until
//! the code is typed there is no credential to read a row with. *`join::inspect` reached the
//! organization with the link's clear credential and judged the invitation before the person had
//! typed anything; effort 828 retires it with the clear credential it needed.*
//!
//! **A link with no half is not a link.** The half is where the code's salt and the seal's
//! associated data both come from, so a text without one carries a payload nothing could ever
//! open, and [`JoinLink::decode`] refuses it with the sentence a pasted sentence gets. That is
//! also what refuses the organization's own link, which was four clear fields and a legible
//! credential, on a build that still has a copy of one.
//!
//! **A link in the previous shape is refused as a link that is not one.** It names
//! `readOnlyCredential` and carries no `credential`, [`JoinLink::decode`] refuses it with the
//! sentence a pasted sentence gets, and that refusal is the whole of this effort's migration:
//! nothing is published, so no holder of an old link exists to carry forward.
//!
//! **The verifying key rides in the link and is pinned from it**, never read out of the database
//! it judges. `organization/authority.rs` says why: a database whose rows were rewritten could
//! rewrite the key that checks them, and every signature would pass.

use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD as BASE64URL};
use serde::{Deserialize, Serialize};

use crate::error::Error;

use super::{
    authority::VERIFYING_KEY_BYTES,
    vault::{
        KDF_SALT_BYTES, KdfParams, derive_member_key, open_under_member_key, seal_under_member_key,
    },
};

/// The scheme a link is spelled under. How a link is *opened*, whether by the operating system
/// handing the scheme to this application or by a person pasting it into a screen, is the join
/// ticket's; the spelling is fixed here so both ends agree on it.
const LINK_PREFIX: &str = "rentable://join/";

/// What the previous shape spelled its credential under. A text naming it is refused: see the
/// module docstring on the migration this effort has.
const PREVIOUS_CREDENTIAL_FIELD: &str = "readOnlyCredential";

/// The one sentence a person who typed no code is told, which is about what they did rather than
/// about what the link says.
pub const CODE_MISSING: &str = "type the six-character code whoever sent you this link read out";

/// The one sentence a code that does not open the link's payload is refused with.
///
/// **It says wrong and not lapsed.** A code now lives exactly as long as the link it came with
/// (effort 828, requirement 1), so there is no third state to be in: a code that fails the tag is
/// wrong, and a link past its moment is refused as a lapsed link before any key is derived.
pub const CODE_REFUSED: &str =
    "the code is wrong; ask whoever sent you the link to read it out again";

/// What a link's half stands behind: an invitation row, or a member's own second machine.
///
/// **`Machine` is reachable here and minted nowhere yet.** Effort 828's ticket 04 builds the act
/// and the row; ticket 03 puts the variant in the type, in the decode and in the read, so the
/// shape it lands on is the one already tested.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum HalfKind {
    Invitation,
    Machine,
}

impl HalfKind {
    /// How the kind is spelled inside the seal's associated data. Written out rather than taken
    /// from serde, because what binds a seal is a byte string and a rename attribute must not be
    /// able to move it.
    const fn as_str(self) -> &'static str {
        match self {
            Self::Invitation => "invitation",
            Self::Machine => "machine",
        }
    }
}

/// The half of a link that is not the organization: which act made it, the row it names, the
/// secret that salts the code, and the moment both lapse.
///
/// The secret is thirty-two bytes base64url drawn for this link; its first sixteen are the salt
/// the code's key is derived with, so the secret alone derives nothing and the code alone is
/// thirty bits. `expires_at` is the earlier of the link's own week and the moment the credential
/// inside it lapses, so a link never outlives what it carries, and it is bound into the seal, so
/// a rewritten copy opens nothing.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Half {
    pub kind: HalfKind,
    pub id: String,
    pub secret: String,
    pub expires_at: i64,
}

/// Where an organization is and what judges its rows: the four clear fields, and no credential.
///
/// **It reads nothing, and that is what it is for** (effort 828, requirement 16). Every link this
/// application makes is one of these with a payload sealed onto it, so the act that builds a link
/// never has a legible credential in hand to leave behind, and a locator that escaped would name
/// an organization and open nothing. `invite::locator` rebuilds it from the replica's own
/// organization row, which any member whose vault is open can read.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Locator {
    pub organization_id: String,
    /// the organization's name, in the clear: what a refusal is said in the name of, and what a
    /// person recognises before they type anything.
    pub organization_name: String,
    /// the Ed25519 verifying key every row is judged against, base64url.
    pub verifying_key: String,
    /// where the organization database is, `libsql://...`.
    pub remote_url: String,
}

impl Locator {
    pub fn new(
        organization_id: &str,
        organization_name: &str,
        verifying_key: &[u8; VERIFYING_KEY_BYTES],
        remote_url: &str,
    ) -> Self {
        Self {
            organization_id: organization_id.to_string(),
            organization_name: organization_name.to_string(),
            verifying_key: BASE64URL.encode(verifying_key),
            remote_url: remote_url.to_string(),
        }
    }

    /// This locator as a link: the sealed payload, and the half that opens it.
    pub fn sealed(&self, sealed: &str, half: Half) -> JoinLink {
        JoinLink {
            organization_id: self.organization_id.clone(),
            organization_name: self.organization_name.clone(),
            verifying_key: self.verifying_key.clone(),
            remote_url: self.remote_url.clone(),
            credential: sealed.to_string(),
            half,
        }
    }

    /// The verifying key as the chain takes it.
    pub fn verifying_key_bytes(&self) -> Result<[u8; VERIFYING_KEY_BYTES], Error> {
        verifying_key_bytes(&self.verifying_key)
    }
}

/// What a link carries.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JoinLink {
    pub organization_id: String,
    /// the organization's name, in the clear: what a refusal is said in the name of, and what a
    /// person recognises before they type anything.
    pub organization_name: String,
    /// the Ed25519 verifying key every row is judged against, base64url.
    pub verifying_key: String,
    /// where the organization database is, `libsql://...`.
    pub remote_url: String,
    /// the [`LinkPayload`] this link carries, sealed under the code and the half's secret
    /// together, base64url. There is no second way a link carries a credential.
    pub credential: String,
    /// the row this link was made for. Every link has one: the half is where the code's salt and
    /// the seal's associated data come from, so a link without one carries a payload nothing could
    /// open.
    pub half: Half,
}

/// Which of the two kinds of link a text is, as [`read`] answers it.
///
/// *There was a third, the organization's own, until effort 828's requirement 16 retired it; it
/// was the one kind that carried a legible credential and connected a machine with no code.*
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum LinkKind {
    Invitation,
    Machine,
}

/// What a link says about itself, from its own text: no network, no credential, no row read.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkShape {
    pub organization_id: String,
    pub organization_name: String,
    pub kind: LinkKind,
    /// when the link lapses, off the half. Every link lapses.
    pub expires_at: i64,
}

/// What a sealed link holds once the code has opened it.
///
/// `credential` is the issuer's own grant on the organization database, which is what the machine
/// reads the rows with from here; `vault_password` is the password the invited vault was made
/// under, and it is absent on a link that opens no vault.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkPayload {
    pub credential: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub vault_password: Option<String>,
}

impl JoinLink {
    /// Where this link says the organization is, with the credential left behind.
    ///
    /// What `connect::connect` records an organization from: the connect writes the four clear
    /// facts and nothing else, and handing it a locator rather than a link is what makes it
    /// impossible to record an organization the caller never opened a payload for.
    pub fn locator(&self) -> Locator {
        Locator {
            organization_id: self.organization_id.clone(),
            organization_name: self.organization_name.clone(),
            verifying_key: self.verifying_key.clone(),
            remote_url: self.remote_url.clone(),
        }
    }

    /// Which of the two kinds of link this is, read off the half.
    pub fn kind(&self) -> LinkKind {
        match self.half.kind {
            HalfKind::Invitation => LinkKind::Invitation,
            HalfKind::Machine => LinkKind::Machine,
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

        // the previous shape, refused before it is parsed. It named its credential in the clear
        // and carried no `credential` at all, so serde would refuse it anyway; naming the field
        // here is what also refuses a text that carries both, which serde would quietly ignore.
        if std::str::from_utf8(&json).is_ok_and(|text| text.contains(PREVIOUS_CREDENTIAL_FIELD)) {
            return Err(unreadable());
        }

        let decoded: Self = serde_json::from_slice(&json).map_err(|_| unreadable())?;

        decoded.verifying_key_bytes()?;

        if decoded.organization_id.trim().is_empty()
            || decoded.remote_url.trim().is_empty()
            || decoded.credential.trim().is_empty()
        {
            return Err(unreadable());
        }

        // a half with either text field blank is not a half: the link is not one. A text with no
        // half at all never reaches here, since the field is required and serde refuses it above,
        // which is what refuses a link in the shape the organization's own had.
        if decoded.half.id.trim().is_empty() || decoded.half.secret.trim().is_empty() {
            return Err(unreadable());
        }

        Ok(decoded)
    }

    /// The verifying key as the chain takes it.
    pub fn verifying_key_bytes(&self) -> Result<[u8; VERIFYING_KEY_BYTES], Error> {
        verifying_key_bytes(&self.verifying_key)
    }
}

/// A base64url verifying key as the chain takes it, for the two types that carry one.
fn verifying_key_bytes(encoded: &str) -> Result<[u8; VERIFYING_KEY_BYTES], Error> {
    let bytes = BASE64URL.decode(encoded).map_err(|_| Error::InvalidInput {
        message: "this join link carries no organization key".to_string(),
    })?;

    <[u8; VERIFYING_KEY_BYTES]>::try_from(bytes.as_slice()).map_err(|_| Error::InvalidInput {
        message: "this join link carries no organization key".to_string(),
    })
}

/// What a link says about itself, from its text alone: which organization, which kind, and when
/// it lapses. No network, nothing unsealed, no row read.
pub fn read(link: &str) -> Result<LinkShape, Error> {
    let link = JoinLink::decode(link)?;

    Ok(LinkShape {
        organization_id: link.organization_id.clone(),
        organization_name: link.organization_name.clone(),
        kind: link.kind(),
        expires_at: link.half.expires_at,
    })
}

/// The salt a code's key is derived with: the first sixteen bytes of the link's own secret.
///
/// **This is what makes the code a key half rather than a check.** The code alone is thirty bits
/// and the secret alone derives nothing, so what opens the payload is the two together, and each
/// guess at the code costs one Argon2id pass at the shipping cost. A link whose secret is not the
/// thirty-two bytes that were drawn is refused here rather than folded into something shorter.
pub fn code_salt(link_secret: &str) -> Result<[u8; KDF_SALT_BYTES], Error> {
    let bytes = BASE64URL
        .decode(link_secret)
        .map_err(|_| Error::InvalidInput {
            message: "this join link carries no secret".to_string(),
        })?;

    <[u8; KDF_SALT_BYTES]>::try_from(&bytes[..bytes.len().min(KDF_SALT_BYTES)]).map_err(|_| {
        Error::InvalidInput {
            message: "this join link carries no secret".to_string(),
        }
    })
}

/// What a link's seal is bound to: the half, which says which kind of link it is, the row it
/// names and the moment it lapses, and the locator, which says where the organization is and what
/// judges its rows.
///
/// **The address is bound because the seal alone does not pin it.** The four clear fields ride in
/// the link's text beside the payload, so a seal lifted onto a link naming another host opens with
/// the same code and the machine then pulls a replica from wherever that text said. Binding
/// `organization_id`, `verifying_key` and `remote_url` is what makes the payload open only for the
/// address it was made for; the organization's name is left out, because it is what a refusal is
/// said in the name of rather than a fact anything is reached with.
///
/// **Each field is written with its length in front of it**, the shape `authority::field` uses and
/// for the same reason: a separator a field can carry is a separator two different sets of fields
/// can be made to agree on, and `remote_url` carries dots.
pub fn payload_context(locator: &Locator, half: &Half) -> Vec<u8> {
    let mut context = Vec::new();

    for part in [
        half.kind.as_str(),
        half.id.as_str(),
        &half.expires_at.to_string(),
        locator.organization_id.as_str(),
        locator.verifying_key.as_str(),
        locator.remote_url.as_str(),
    ] {
        context.extend_from_slice(&(part.len() as u64).to_be_bytes());
        context.extend_from_slice(part.as_bytes());
    }

    context
}

/// Seal a payload under a code and a link's secret together, at the cost the reader will derive
/// at. The answer is base64url, which is what the link's text carries.
pub fn seal_payload(
    code: &str,
    locator: &Locator,
    half: &Half,
    payload: &LinkPayload,
    kdf_params: KdfParams,
) -> Result<String, Error> {
    let key = derive_member_key(
        &code.trim().to_uppercase(),
        &code_salt(&half.secret)?,
        kdf_params,
    )?;
    let json = serde_json::to_vec(payload).map_err(|error| Error::Internal {
        message: format!("failed to seal a link payload: {error}"),
    })?;

    Ok(BASE64URL.encode(seal_under_member_key(
        &key,
        &payload_context(locator, half),
        &json,
    )?))
}

/// Open what [`seal_payload`] sealed, with the code the person typed.
///
/// **The code is checked by being used, and never by being compared.** A wrong one derives a key
/// like any other, that key fails the AEAD tag, and there is no stored verifier and no boolean a
/// modified client could make return true. The caller refuses a lapsed link before reaching here,
/// because deriving a key for a link that is already dead buys the guesser a free pass.
pub fn open_payload(
    code: &str,
    locator: &Locator,
    half: &Half,
    sealed: &str,
    kdf_params: KdfParams,
) -> Result<LinkPayload, Error> {
    let code = code.trim().to_uppercase();

    if code.is_empty() {
        return Err(Error::InvalidInput {
            message: CODE_MISSING.to_string(),
        });
    }

    let refused = || Error::Forbidden {
        message: CODE_REFUSED.to_string(),
    };
    let bytes = BASE64URL.decode(sealed).map_err(|_| refused())?;
    let key = derive_member_key(&code, &code_salt(&half.secret)?, kdf_params)?;
    let opened = open_under_member_key(&key, &payload_context(locator, half), &bytes)
        .map_err(|_| refused())?;

    serde_json::from_slice(&opened).map_err(|_| refused())
}

#[cfg(test)]
mod tests {
    use super::{
        Half, HalfKind, JoinLink, LinkKind, LinkPayload, Locator, open_payload, read, seal_payload,
    };
    use crate::organization::vault::KdfParams;

    fn test_cost() -> KdfParams {
        KdfParams {
            memory_kib: 1024,
            iterations: 2,
            lanes: 1,
        }
    }

    fn locator() -> Locator {
        Locator::new(
            "7f3a",
            "Acme",
            &[7_u8; 32],
            "libsql://org-7f3a-acme.aws-eu-west-1.turso.io",
        )
    }

    fn link() -> JoinLink {
        locator().sealed("c2VhbGVk", half(HalfKind::Invitation))
    }

    /// A thirty-two byte secret, base64url, as `invite::generate_link_secret` draws one.
    const SECRET: &str = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8";

    fn half(kind: HalfKind) -> Half {
        Half {
            kind,
            id: "inv-1".to_string(),
            secret: SECRET.to_string(),
            expires_at: 1_757_000_000_000,
        }
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

    /// Effort 828, requirements 1 and 16: **every link names a sealed credential and a half, and
    /// there is no other shape a link can take.** Nothing spells `readOnlyCredential`, which the
    /// previous shape did and is what a Turso client would take as a token, and nothing carries a
    /// credential a reader of the text could use. *The organization's own link named
    /// `credential.clear` and carried no half until requirement 16 retired it.*
    #[test]
    fn every_link_names_a_sealed_credential_and_the_half_that_opens_it() {
        for kind in [HalfKind::Invitation, HalfKind::Machine] {
            let (text, names) = fields_of(&locator().sealed("c2VhbGVk", half(kind)));

            assert_eq!(
                names,
                [
                    "credential",
                    "half",
                    "organizationId",
                    "organizationName",
                    "remoteUrl",
                    "verifyingKey"
                ]
            );
            assert!(text.contains(r#""credential":"c2VhbGVk""#), "{text}");
            assert!(!text.contains("clear"), "{text}");
            assert!(!text.contains("readOnlyCredential"), "{text}");
            assert!(!text.contains("password"), "{text}");
        }

        let (text, _) = fields_of(&locator().sealed("c2VhbGVk", half(HalfKind::Invitation)));

        assert!(text.contains(r#""kind":"invitation""#), "{text}");

        let (text, _) = fields_of(&locator().sealed("c2VhbGVk", half(HalfKind::Machine)));

        assert!(text.contains(r#""kind":"machine""#), "{text}");
    }

    /// The half round-trips on both kinds, and the locator a link came from is read back off it
    /// with the credential left behind, which is what a connect is handed.
    #[test]
    fn a_sealed_link_round_trips_with_its_half() {
        for kind in [HalfKind::Invitation, HalfKind::Machine] {
            let sealed = locator().sealed("c2VhbGVk", half(kind));
            let encoded = sealed.encode().expect("failed to encode");
            let decoded = JoinLink::decode(&encoded).expect("failed to decode");

            assert_eq!(decoded, sealed);
            assert_eq!(decoded.organization_name, "Acme");
            assert_eq!(decoded.half.id, "inv-1");
            assert_eq!(decoded.credential, "c2VhbGVk");
            assert_eq!(decoded.locator(), locator());
        }
    }

    /// Reading a link is a decode: which organization, which kind, and when it lapses. Every link
    /// lapses, so the moment is a fact rather than an absence.
    #[test]
    fn reading_a_link_answers_its_shape_from_the_text_alone() {
        for (kind, expected) in [
            (HalfKind::Invitation, LinkKind::Invitation),
            (HalfKind::Machine, LinkKind::Machine),
        ] {
            let text = locator()
                .sealed("c2VhbGVk", half(kind))
                .encode()
                .expect("encodes");
            let shape = read(&text).expect("the sealed link");

            assert_eq!(shape.organization_id, "7f3a");
            assert_eq!(shape.organization_name, "Acme");
            assert_eq!(shape.kind, expected);
            assert_eq!(shape.expires_at, 1_757_000_000_000);
        }

        assert!(read("not a link").is_err());
    }

    /// Effort 828, requirement 11: a link in the previous shape is refused with the sentence a
    /// text that is not a link gets, and that refusal is the whole migration. Nothing is
    /// published, so there is no holder to carry forward.
    #[test]
    fn a_link_in_the_previous_shape_is_refused_as_a_link_that_is_not_one() {
        let previous = serde_json::json!({
            "organizationId": "7f3a",
            "organizationName": "Acme",
            "verifyingKey": base64::Engine::encode(
                &base64::engine::general_purpose::URL_SAFE_NO_PAD,
                [7_u8; 32],
            ),
            "remoteUrl": "libsql://org-7f3a-acme.aws-eu-west-1.turso.io",
            "readOnlyCredential": "a-read-only-credential",
            "invitation": { "id": "inv-1", "secret": SECRET }
        });
        let text = format!(
            "rentable://join/{}",
            base64::Engine::encode(
                &base64::engine::general_purpose::URL_SAFE_NO_PAD,
                serde_json::to_vec(&previous).expect("json"),
            )
        );
        let error = JoinLink::decode(&text).expect_err("the previous shape decoded");

        assert!(
            matches!(error, crate::error::Error::InvalidInput { ref message }
                if message == "this is not a rentable join link"),
            "{error:?}"
        );
        assert!(read(&text).is_err(), "the previous shape read");
    }

    /// Effort 828, requirement 16: **a text with no half is not a link**, which is what refuses
    /// the organization's own shape wherever a copy of one survives. Beside it, the two other
    /// shapes that are not links: a half with a blank field, and a blank credential.
    #[test]
    fn a_text_with_no_half_and_a_blank_half_are_not_links() {
        let halfless = serde_json::json!({
            "organizationId": "7f3a",
            "organizationName": "Acme",
            "verifyingKey": base64::Engine::encode(
                &base64::engine::general_purpose::URL_SAFE_NO_PAD,
                [7_u8; 32],
            ),
            "remoteUrl": "libsql://org-7f3a-acme.aws-eu-west-1.turso.io",
            "credential": "c2VhbGVk"
        });
        let text = format!(
            "rentable://join/{}",
            base64::Engine::encode(
                &base64::engine::general_purpose::URL_SAFE_NO_PAD,
                serde_json::to_vec(&halfless).expect("json"),
            )
        );

        assert!(
            matches!(
                JoinLink::decode(&text),
                Err(crate::error::Error::InvalidInput { ref message })
                    if message == "this is not a rentable join link"
            ),
            "a link with no half decoded"
        );
        assert!(read(&text).is_err(), "a link with no half read");

        for (id, secret) in [("", SECRET), ("inv-1", ""), (" ", " ")] {
            let broken = locator()
                .sealed(
                    "c2VhbGVk",
                    Half {
                        id: id.to_string(),
                        secret: secret.to_string(),
                        ..half(HalfKind::Invitation)
                    },
                )
                .encode()
                .expect("encodes");

            assert!(
                matches!(
                    JoinLink::decode(&broken),
                    Err(crate::error::Error::InvalidInput { .. })
                ),
                "{id:?} {secret:?} decoded"
            );
        }

        let blank = JoinLink {
            credential: "  ".to_string(),
            ..link()
        };

        assert!(
            matches!(
                JoinLink::decode(&blank.encode().expect("encodes")),
                Err(crate::error::Error::InvalidInput { .. })
            ),
            "a blank credential decoded"
        );
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

    /// The seal opens on the right code and on nothing else, and what it is bound to is the
    /// half's kind, id and expiry and the locator's three fields: any of the six rewritten and the
    /// right code opens nothing. The code is upper-cased on both sides, so a person typing lower
    /// case is not refused for it.
    #[test]
    fn the_payload_opens_on_the_code_and_the_secret_together_and_on_nothing_else() {
        let half = half(HalfKind::Invitation);
        let payload = LinkPayload {
            credential: "the-issuers-grant".to_string(),
            vault_password: Some("the-generated-password".to_string()),
        };
        let sealed =
            seal_payload("7K4M9Q", &locator(), &half, &payload, test_cost()).expect("the seal");

        assert_eq!(
            open_payload("7K4M9Q", &locator(), &half, &sealed, test_cost())
                .expect("the right code"),
            payload
        );
        assert_eq!(
            open_payload(" 7k4m9q ", &locator(), &half, &sealed, test_cost())
                .expect("the same code, typed"),
            payload
        );

        for wrong in ["ABCDEF", "000000", SECRET] {
            assert!(
                matches!(
                    open_payload(wrong, &locator(), &half, &sealed, test_cost()),
                    Err(crate::error::Error::Forbidden { ref message })
                        if message == super::CODE_REFUSED
                ),
                "{wrong:?} opened the payload"
            );
        }

        assert!(
            matches!(
                open_payload("   ", &locator(), &half, &sealed, test_cost()),
                Err(crate::error::Error::InvalidInput { ref message })
                    if message == super::CODE_MISSING
            ),
            "an empty code was not refused as input"
        );

        // the associated data's half: the kind, the row and the moment. Each rewritten on its
        // own, and the right code opens nothing. The locator's three are the test below.
        for rewritten in [
            Half {
                kind: HalfKind::Machine,
                ..half.clone()
            },
            Half {
                id: "inv-2".to_string(),
                ..half.clone()
            },
            Half {
                expires_at: half.expires_at + 600_000,
                ..half.clone()
            },
        ] {
            assert!(
                open_payload("7K4M9Q", &locator(), &rewritten, &sealed, test_cost()).is_err(),
                "a rewritten half opened the payload"
            );
        }

        // a machine link seals no vault password, and the field is absent rather than null.
        let bare = LinkPayload {
            credential: "the-members-grant".to_string(),
            vault_password: None,
        };
        let sealed =
            seal_payload("7K4M9Q", &locator(), &half, &bare, test_cost()).expect("the seal");

        assert_eq!(
            open_payload("7K4M9Q", &locator(), &half, &sealed, test_cost())
                .expect("the right code"),
            bare
        );
        assert!(
            !String::from_utf8_lossy(&serde_json::to_vec(&bare).expect("json"))
                .contains("vaultPassword"),
            "a payload with no vault password wrote the field"
        );
    }

    /// Ticket 20, the review's fourth finding: **the seal binds the address, so a link whose
    /// `remoteUrl` was rewritten opens nothing.**
    ///
    /// The four clear fields ride in the link's text beside the payload and nothing signs them, so
    /// a link found in a chat could be re-encoded pointing at a host somebody else keeps, with the
    /// half and the sealed payload carried over untouched. Before the locator was bound, the code
    /// still opened the payload on that text and the machine then pulled a replica from the
    /// rewritten host with the credential inside it. Each of the three bound fields is rewritten
    /// on its own here, and the decode is left whole, so what refuses is the seal rather than the
    /// text being unreadable.
    #[test]
    fn a_link_whose_address_was_rewritten_opens_nothing_with_the_right_code() {
        let locator = locator();
        let half = half(HalfKind::Machine);
        let payload = LinkPayload {
            credential: "the-members-grant".to_string(),
            vault_password: None,
        };
        let sealed = seal_payload("7K4M9Q", &locator, &half, &payload, test_cost()).expect("seal");
        let link = locator.sealed(&sealed, half.clone());

        // the link as it was made opens, so the refusals below are the rewriting and nothing else.
        assert_eq!(
            open_payload(
                "7K4M9Q",
                &link.locator(),
                &link.half,
                &link.credential,
                test_cost()
            )
            .expect("the link as it was made"),
            payload
        );

        for rewritten in [
            JoinLink {
                remote_url: "libsql://org-7f3a-acme.an-attackers-host.example".to_string(),
                ..link.clone()
            },
            JoinLink {
                verifying_key: Locator::new("7f3a", "Acme", &[9_u8; 32], "libsql://x")
                    .verifying_key,
                ..link.clone()
            },
            JoinLink {
                organization_id: "beef".to_string(),
                ..link.clone()
            },
        ] {
            // the text still decodes: what is rewritten is a clear field, not the shape.
            let decoded = JoinLink::decode(&rewritten.encode().expect("the rewritten text"))
                .expect("a rewritten link is still a link");

            assert!(
                matches!(
                    open_payload(
                        "7K4M9Q",
                        &decoded.locator(),
                        &decoded.half,
                        &decoded.credential,
                        test_cost()
                    ),
                    Err(crate::error::Error::Forbidden { ref message })
                        if message == super::CODE_REFUSED
                ),
                "a rewritten address opened the payload: {}",
                decoded.remote_url
            );
        }
    }
}
