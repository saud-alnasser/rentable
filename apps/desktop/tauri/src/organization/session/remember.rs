//! the member key a signed-in machine keeps in the operating system's credential store, filed under
//! the session epoch, and the resume that opens the vault with it at the next launch.

use crate::{
    credential::CredentialStore,
    diagnostics,
    error::{Error, RefusalReason},
};

use super::{
    CredentialSlot, MEMBER_KEY_SERVICE, MemberSession, content_key_of, machine::signed_out_here,
    open_session, verifying_key_of,
};
use crate::organization::{
    HeldOrganization,
    member::vault::{MemberKey, open_sealed_secret_key},
    ownership::is_the_owners,
    store::OrganizationStore,
};

/// File the key that opens this member's vault, so the next launch opens it without asking.
///
/// **The session epoch is filed in front of it**, `<epoch>:<base64url key>` (effort 826,
/// requirement 22), so a launch can tell a key that is still this member's run of sessions from
/// one that a sign-out elsewhere left behind, before it spends the key on anything.
///
/// **A store that refuses is a diagnostic and never a failure.** A locked keychain, a Linux
/// machine with no secret service, a store out of room: the person is signed in either way, and
/// what they lose is not being asked again next time. Nothing here is on the path of anything the
/// person asked for, so there is no refusal for them to act on.
pub(crate) fn remember(
    credentials: &dyn CredentialStore,
    organization_id: &str,
    member_id: &str,
    session_epoch: i64,
    member_key: &MemberKey,
) {
    let filed = credentials.set(
        MEMBER_KEY_SERVICE,
        &account_of(organization_id, member_id),
        &filed_entry(session_epoch, member_key),
    );

    match filed {
        Ok(()) => diagnostics::info("organization.session.remembered")
            .with("organization", organization_id)
            .with("member", member_id)
            .write(),
        Err(refusal) => diagnostics::warn("organization.session.notRemembered")
            .with("organization", organization_id)
            .with("member", member_id)
            // the value never reaches a credential error (`credential/`), so this carries the
            // reason and no part of the key.
            .with("reason", refusal.to_string())
            .write(),
    }
}

/// Leave nothing under this member's entry. What a sign-out and a disconnect do, and what a
/// resume that did not open the vault does to the key it just tried.
///
/// A refusal is a diagnostic for the reason [`remember`]'s is: the caller is doing something else
/// and there is nothing here for the person to act on. An entry that was never filed is already
/// in the state this asks for.
pub(crate) fn forget_remembered(
    credentials: &dyn CredentialStore,
    organization_id: &str,
    member_id: &str,
) {
    if let Err(refusal) =
        credentials.delete(MEMBER_KEY_SERVICE, &account_of(organization_id, member_id))
    {
        diagnostics::warn("organization.session.notForgotten")
            .with("organization", organization_id)
            .with("member", member_id)
            .with("reason", refusal.to_string())
            .write();
    }
}

/// What a resume of a remembered session found.
///
/// **Being signed out from another machine is an outcome and not a failure**, which is why it is
/// a variant here rather than an error: nothing went wrong, the person is simply no longer signed
/// in on this machine, and the wall has a sentence of its own for it. Everything that did go
/// wrong is still an `Err`.
#[derive(Debug)]
pub(crate) enum Resumption {
    /// the vault opened and this machine is signed in again.
    Opened(Box<MemberSession>),
    /// the entry this machine filed is behind the member's row: somebody ended this member's
    /// sessions from another machine, or this machine alone (effort 846, requirement 10). The
    /// entry is forgotten and the wall goes up saying so.
    SignedOutElsewhere,
}

/// Open the member the record names with the key this machine filed at their last sign-in: the
/// launch that goes straight past the wall (effort 826, requirement 12).
///
/// The same unsealing every sign-in performs, starting one step further in: there is no password
/// and no derivation, because the derivation's output is what was filed. The rows are read and
/// verified first, as [`sign_in`](super::sign_in) reads them, so a forged row is refused before the key is spent.
///
/// **The epoch the entry files is compared against the row's before the key is spent**
/// (requirement 22), on the rows this machine already holds, which is every machine whose
/// heartbeat saw the bump before it was closed. The second comparison, on what the organization
/// says now, is the caller's: the pull it takes spends the credential the vault holds, and what
/// arrives may be re-keyed by a handover this machine was closed across as well as bumped, so the
/// launch runs the heartbeat's own check once the session is open (`command::ended_elsewhere`),
/// which pulls, follows a succession where the rows ask for one, and signs out where the row has
/// moved on. *The pull and that check were in here until effort 828's review found that a
/// succession could only be followed before the pull, on a replica that had not received it.*
///
/// **Any failure forgets the entry and leaves the wall up.** Nothing filed, a value that is not a
/// key, a member row that is gone or removed, and a vault resealed by anybody since are one
/// outcome to the person: they sign in. The entry is deleted rather than kept, so the next launch
/// does not try a key that has already been shown not to open anything.
pub(crate) async fn resume(
    credentials: &dyn CredentialStore,
    store: &OrganizationStore,
    held: &HeldOrganization,
    credential: &CredentialSlot,
) -> Result<Resumption, Error> {
    let member_id = held.member_id.clone().ok_or_else(|| {
        Error::refused(
            RefusalReason::NoMemberYet,
            format!("this machine holds {} and no member in it yet", held.name),
        )
    })?;
    let resumed = resumed(credentials, store, held, &member_id, credential).await;

    if !matches!(resumed, Ok(Resumption::Opened(_))) {
        forget_remembered(credentials, &held.id, &member_id);
    }

    resumed
}

/// The resume itself, so that [`resume`] has one place to forget the entry from.
async fn resumed(
    credentials: &dyn CredentialStore,
    store: &OrganizationStore,
    held: &HeldOrganization,
    member_id: &str,
    credential: &CredentialSlot,
) -> Result<Resumption, Error> {
    let (filed_epoch, member_key) = remembered(credentials, &held.id, member_id)?;
    let verifying_key = verifying_key_of(held)?;
    let members = store.members(&verifying_key).await?;
    let member = members
        .iter()
        .find(|member| member.id == member_id)
        .ok_or_else(|| {
            Error::refused(
                RefusalReason::SignInAgain,
                "this machine's member row is not in the organization any more",
            )
        })?;

    let removed = || {
        Error::refused(
            RefusalReason::YouWereRemoved,
            format!("you were removed from {}", held.name),
        )
    };

    // before the key is spent: the rows this machine already holds may say the sessions ended,
    // which is every machine whose heartbeat saw the bump before it was closed.
    if filed_epoch < member.session_epoch {
        return Ok(Resumption::SignedOutElsewhere);
    }

    // and this machine alone, signed out from another of the member's while it was closed
    // (effort 846, requirement 10): its row above the number its record acknowledged at its last
    // sign-in. A resume acknowledges nothing, so the next launch asks the same question again.
    if signed_out_here(store, held, member_id).await? {
        return Ok(Resumption::SignedOutElsewhere);
    }

    // as `sign_in` reads it: a removal is a signed row rather than an absence, and the vault
    // would still open onto grants that grant nothing, unless it is the owner's own vault meeting
    // a removal written from below, which their machine repairs once the launch has pulled and
    // judged the organization's floors, and never before (`repaired_after_the_pull`, effort 857,
    // ticket 04).
    let secret = match open_sealed_secret_key(&member_key, &member.vault) {
        Ok(secret) => secret,
        Err(_) if member.removed_at.is_some() => return Err(removed()),
        Err(refusal) => return Err(refusal),
    };

    if member.removed_at.is_some() && !is_the_owners(&secret, &verifying_key) {
        return Err(removed());
    }

    let content_key = content_key_of(&member.sealed_content_key, &secret)?;
    let session = open_session(
        store,
        held,
        verifying_key,
        member,
        secret,
        content_key,
        credential,
    )
    .await?;

    Ok(Resumption::Opened(Box::new(session)))
}

/// Rewrite this machine's entry under a new epoch, keeping the key that is already in it.
///
/// The key itself is the Argon2id output and nothing here holds it: a session carries the secret
/// the key unsealed, not the key. So the entry is read, its key half kept, and the pair written
/// back. Nothing filed is the case where the credential store refused the sign-in's write, and
/// there is nothing to rewrite.
pub(super) fn refile(
    credentials: &dyn CredentialStore,
    organization_id: &str,
    member_id: &str,
    session_epoch: i64,
) {
    let account = account_of(organization_id, member_id);
    let filed = match credentials.get(MEMBER_KEY_SERVICE, &account) {
        Ok(Some(filed)) => filed,
        Ok(None) => return,
        Err(refusal) => {
            diagnostics::warn("organization.session.notRefiled")
                .with("organization", organization_id)
                .with("member", member_id)
                .with("reason", refusal.to_string())
                .write();

            return;
        }
    };

    match read_entry(&filed) {
        Ok((_, member_key)) => remember(
            credentials,
            organization_id,
            member_id,
            session_epoch,
            &member_key,
        ),
        // a value this build did not write opens nothing anyway, so it goes rather than being
        // carried forward under a number that would make it look current.
        Err(_) => forget_remembered(credentials, organization_id, member_id),
    }
}

/// What a remembered session is filed as: the epoch it was opened under, then the key, separated
/// by the one character neither half can contain.
fn filed_entry(session_epoch: i64, member_key: &MemberKey) -> String {
    format!("{session_epoch}:{}", member_key.encode())
}

/// Read back what [`filed_entry`] wrote. Anything else, a value from before requirement 22 or one
/// somebody put there, is refused as a key that opens nothing, which forgets the entry.
///
/// `pub(crate)` because the tests that assert on what a sign-in, an accept and a password change
/// filed live beside each of those, and a second parser written out there is one that can disagree
/// with this one about what an entry is.
pub(crate) fn read_entry(filed: &str) -> Result<(i64, MemberKey), Error> {
    let unreadable = || Error::Integrity {
        message: "what this machine remembers is not a session it can open".to_string(),
    };
    let (epoch, encoded) = filed.split_once(':').ok_or_else(unreadable)?;

    Ok((
        epoch.parse::<i64>().map_err(|_| unreadable())?,
        MemberKey::decode(encoded)?,
    ))
}

/// The key this machine filed for a member at their last sign-in, and the epoch it was filed
/// under: what a resume opens the vault with. Refused where nothing is filed or what is filed is
/// not an entry this build wrote. Read by the resume, and by the owner's upgrade of an older
/// organization on the way to it (`upgrade/format/runner/`, effort 838, ticket 22), which reads
/// the same key.
pub(crate) fn remembered(
    credentials: &dyn CredentialStore,
    organization_id: &str,
    member_id: &str,
) -> Result<(i64, MemberKey), Error> {
    let filed = credentials
        .get(MEMBER_KEY_SERVICE, &account_of(organization_id, member_id))?
        .ok_or_else(|| {
            Error::refused(
                RefusalReason::SignInAgain,
                "this machine remembers no key for the member it holds",
            )
        })?;

    read_entry(&filed)
}

/// What one member's entry is filed under: the organization, and their row in it.
///
/// Both halves, because a machine that forgets one organization and connects to another must not
/// find the first one's key waiting under the second one's name.
fn account_of(organization_id: &str, member_id: &str) -> String {
    format!("{organization_id}:{member_id}")
}

#[cfg(test)]
mod tests {
    use crate::credential::{CredentialStore, Memory};
    use crate::machine::RemoteSyncStore;
    use crate::organization::HeldOrganization;
    use crate::organization::member::vault::{
        KdfParams, MEMBER_KEY_BYTES, MemberKey, open_sealed_secret_key, reseal_vault,
    };
    use crate::organization::session::{
        CredentialSlot, MEMBER_KEY_SERVICE, MemberSession, Resumption, resume, sign_in_by_username,
    };
    use crate::organization::setup::{CreateOrganization, Remote, create_organization};
    use crate::organization::store::OrganizationStore;
    use crate::persisted::Persisted;
    use crate::sync::test::server::{ScriptedResponse, ScriptedServer};
    use crate::test::scratch;
    use crate::turso::discovery::McpEndpoint;
    use crate::turso::platform::InMemoryPlatform;
    use base64::Engine as _;
    use base64::engine::general_purpose::URL_SAFE_NO_PAD as BASE64URL;
    use serde_json::json;
    use std::sync::{Arc, Mutex};

    const PASSWORD: &str = "a long enough password";

    fn test_cost() -> KdfParams {
        KdfParams {
            memory_kib: 1024,
            iterations: 2,
            lanes: 1,
        }
    }

    fn slot() -> CredentialSlot {
        Arc::new(Mutex::new(None))
    }

    /// the session a resume opened, or a failure naming what it answered instead.
    fn opened(resumption: Resumption) -> MemberSession {
        match resumption {
            Resumption::Opened(session) => *session,
            Resumption::SignedOutElsewhere => {
                panic!("the resume answered that the sessions were ended elsewhere")
            }
        }
    }

    /// An organization a first run made, on this machine, with no remote: the owner's vault,
    /// their grant on the organization database, and the machine's record of having joined.
    async fn created(
        credentials: &dyn CredentialStore,
        directory: &std::path::Path,
    ) -> (
        Persisted<RemoteSyncStore>,
        OrganizationStore,
        HeldOrganization,
    ) {
        let mut store = Persisted::<RemoteSyncStore>::load(directory.join("remote-sync.json"))
            .expect("the store");
        let mcp = ScriptedServer::start(vec![
            ScriptedResponse::new(
                200,
                json!({ "jsonrpc": "2.0", "id": 1, "result": {} }).to_string(),
            ),
            ScriptedResponse::new(
                200,
                json!({
                    "jsonrpc": "2.0",
                    "id": 3,
                    "result": { "content": [{ "type": "text", "text": json!([{
                        "Name": "ledger",
                        "hostname": "ledger-an-org.aws-eu-west-1.turso.io",
                        "group": "rentable"
                    }]).to_string() }] }
                })
                .to_string(),
            ),
        ])
        .await;
        let platform = Arc::new(InMemoryPlatform::new("an-org"));

        let (_, organization) = create_organization(
            credentials,
            &crate::clock::System::shared(),
            &mut store,
            "a-platform-token",
            &McpEndpoint::at(&mcp.url("")),
            |_| Arc::clone(&platform),
            Remote::none(),
            &directory.join("app.db"),
            CreateOrganization {
                name: "Acme",
                username: "olivia",
                password: PASSWORD,
                group: None,
            },
            test_cost(),
            1_757_000_000_000,
        )
        .await
        .expect("the first run failed");
        let joined = store.selected().cloned().expect("the record");

        (store, organization, joined)
    }

    /// **Criterion 1.** A sign-in at the wall files the key that opened the vault, under the
    /// service and the account the launch reads it back from, and what is filed is the member key
    /// rather than anything else: it opens the same vault, and it is thirty-two bytes of base64url
    /// with no password anywhere in it. *Effort 826's requirement 22 put the session epoch in
    /// front of it, so the entry is read as a pair from here on.*
    #[tokio::test]
    async fn a_sign_in_files_the_member_key_and_a_resume_opens_the_vault_with_it() {
        let credentials = Memory::new();
        let directory = scratch("remember");
        let (_, store, joined) = created(&credentials, &directory).await;
        let member_id = joined.member_id.clone().expect("the record names a member");
        let account = format!("{}:{member_id}", joined.id);

        // the first run filed the owner's key already; emptied, so what is read back below is
        // what this sign-in filed.
        credentials
            .delete(MEMBER_KEY_SERVICE, &account)
            .expect("the store would not forget");

        let session =
            sign_in_by_username(&credentials, &store, &joined, "olivia", PASSWORD, &slot())
                .await
                .expect("the sign-in failed");
        let filed = credentials
            .get(MEMBER_KEY_SERVICE, &account)
            .expect("the store would not answer")
            .expect("the sign-in filed nothing");
        let (epoch, encoded) = filed
            .split_once(':')
            .expect("what was filed is not an epoch and a key");
        let bytes = BASE64URL
            .decode(encoded)
            .expect("what was filed is not base64url");

        assert_eq!(epoch, "0");
        assert_eq!(bytes.len(), MEMBER_KEY_BYTES);
        assert!(!filed.contains(PASSWORD), "the password was filed");

        // it is the key that opens this member's vault, and it opens it.
        let members = store
            .members(&crate::organization::session::verifying_key_of(&joined).expect("the key"))
            .await
            .expect("the members");
        let member = members
            .iter()
            .find(|member| member.id == member_id)
            .expect("the member row");
        let key = MemberKey::decode(encoded).expect("what was filed is not a key");

        assert_eq!(
            open_sealed_secret_key(&key, &member.vault)
                .expect("the filed key did not open the vault")
                .public_key(),
            session.secret.public_key()
        );

        // and the resume the next launch performs reaches the same session, with no password.
        let credential = slot();
        let resumed = opened(
            resume(&credentials, &store, &joined, &credential)
                .await
                .expect("the resume failed"),
        );

        assert_eq!(resumed.member_id, member_id);
        assert_eq!(resumed.role, "owner");
        assert_eq!(resumed.secret.public_key(), session.secret.public_key());
        assert_eq!(
            credential.lock().expect("the slot").as_deref(),
            Some(format!("token-for-org-{}-4w-full-access", joined.id).as_str()),
            "the resume unsealed no credential for the replica"
        );
    }

    /// **Criterion 1, the stale key.** A reset elsewhere reseals the vault, which retires every
    /// key that ever opened it: the salt and the cost are authenticated into the seal, so there is
    /// nothing to compare and the failure is the AEAD tag. The entry goes, and the wall is what
    /// the person meets.
    #[tokio::test]
    async fn a_vault_resealed_elsewhere_leaves_the_remembered_key_opening_nothing() {
        let credentials = Memory::new();
        let directory = scratch("stale");
        let (_, store, joined) = created(&credentials, &directory).await;
        let member_id = joined.member_id.clone().expect("the record names a member");
        let account = format!("{}:{member_id}", joined.id);
        let session =
            sign_in_by_username(&credentials, &store, &joined, "olivia", PASSWORD, &slot())
                .await
                .expect("the sign-in failed");

        assert!(
            credentials
                .get(MEMBER_KEY_SERVICE, &account)
                .expect("the store would not answer")
                .is_some()
        );

        // the reset, performed by somebody else and arriving on the replica: the same keypair
        // under a password this machine has never seen.
        let resealed = reseal_vault(
            &session.secret,
            "a password chosen somewhere else",
            test_cost(),
        )
        .expect("the reseal failed");

        store
            .reseal_member(&member_id, &resealed, false, 1_757_000_000_001)
            .await
            .expect("the row would not be written");

        let refusal = resume(&credentials, &store, &joined, &slot())
            .await
            .expect_err("a key that opens nothing resumed a session");

        assert!(
            matches!(refusal, crate::error::Error::Integrity { .. }),
            "{refusal:?}"
        );
        assert_eq!(
            credentials
                .get(MEMBER_KEY_SERVICE, &account)
                .expect("the store would not answer"),
            None,
            "a key that opens nothing was kept"
        );
    }

    /// **Criterion 2, the refusal half, at the sign-in.** A store that will not take the key is a
    /// diagnostic: the person is in, and what they lose is being asked again next launch.
    #[tokio::test]
    async fn a_store_that_refuses_the_key_does_not_refuse_the_sign_in() {
        let credentials = Memory::new();
        let directory = scratch("refused");
        let (_, store, joined) = created(&credentials, &directory).await;
        let member_id = joined.member_id.clone().expect("the record names a member");
        let account = format!("{}:{member_id}", joined.id);

        credentials
            .delete(MEMBER_KEY_SERVICE, &account)
            .expect("the store would not forget");
        credentials.refuse_the_next_store();

        let session =
            sign_in_by_username(&credentials, &store, &joined, "olivia", PASSWORD, &slot())
                .await
                .expect("a refused store failed the sign-in");

        assert_eq!(session.member_id, member_id);
        assert_eq!(
            credentials
                .get(MEMBER_KEY_SERVICE, &account)
                .expect("the store would not answer"),
            None,
            "the store took a value it was told to refuse"
        );

        // and the launch after it meets the wall rather than an error.
        let refusal = resume(&credentials, &store, &joined, &slot())
            .await
            .expect_err("a launch with nothing filed resumed a session");

        assert!(
            matches!(
                refusal,
                crate::error::Error::Refused {
                    reason: crate::error::RefusalReason::SignInAgain,
                    ..
                }
            ),
            "{refusal:?}"
        );
    }

    /// A record naming no member has nothing to resume: a machine connected by the organization's
    /// link is in that state, and the person signs in at the wall.
    #[tokio::test]
    async fn a_record_with_no_member_has_nothing_to_resume() {
        let credentials = Memory::new();
        let directory = scratch("resume-no-member");
        let (_, store, joined) = created(&credentials, &directory).await;
        let connected = HeldOrganization {
            member_id: None,
            role: None,
            ..joined
        };

        let refusal = resume(&credentials, &store, &connected, &slot())
            .await
            .expect_err("a record naming no member resumed a session");

        assert!(
            matches!(
                refusal,
                crate::error::Error::Refused {
                    reason: crate::error::RefusalReason::NoMemberYet,
                    ..
                }
            ),
            "{refusal:?}"
        );
        assert!(refusal.to_string().contains("no member"), "{refusal}");
    }

    /// The key a member key encodes to reads back as the same key, and anything else reads back as
    /// a value that opens nothing rather than as a panic.
    #[tokio::test]
    async fn what_is_filed_reads_back_as_the_same_key_and_nothing_else_reads_back_at_all() {
        let key = MemberKey::from_bytes([7_u8; MEMBER_KEY_BYTES]);
        let encoded = key.encode();

        assert_eq!(
            BASE64URL
                .decode(&encoded)
                .expect("not base64url")
                .as_slice(),
            [7_u8; MEMBER_KEY_BYTES].as_slice()
        );
        assert!(MemberKey::decode("not base64url at all ***").is_err());
        assert!(
            MemberKey::decode(&BASE64URL.encode([7_u8; 16])).is_err(),
            "a value of the wrong width read back as a key"
        );
    }
}
