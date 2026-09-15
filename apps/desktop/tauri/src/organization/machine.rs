//! a member's own next machine: the link they make for it, and the connect that spends it.
//!
//! **Nobody but the member makes one** (effort 828, requirement 3). A person setting a laptop up
//! should not have to call somebody, so the pair they need is made from the you section on a
//! machine they are already signed in on. An administrator who has to get somebody back in issues
//! a reset, which is an invitation link and already exists; there is no act here that reaches
//! another member's row.
//!
//! **The link is the same shape every other sealed link is** (`link.rs`). It carries the member's
//! own grant on the organization database sealed under the six-character code and the link's own
//! secret together, a [`HalfKind::Machine`] half naming the row behind it, and no vault password,
//! because a second machine opens no vault: it lands at the wall, where the member's unchanged
//! username and password admit them exactly as they do on the machine they made the link on.
//!
//! **What the credential in it is for is the one pull.** The connect reads the organization row
//! with it and records the four facts the link pins; nothing writes it anywhere, and the sign-in
//! that follows fills the credential slot from the member's own vault, as `sign_in_by_username`
//! already does. So the link is worth one machine's first read and no more, and it is dead within
//! four weeks whatever happens to it, because the grant inside it is.
//!
//! **One link stands at a time.** Making one drops the member's other unspent rows, so a person
//! who lost the pair presses again and the link they could not use stops being a way in. Nothing
//! is kept for a copy later: an invitation keeps an issuer's copy because somebody else has to be
//! handed it twice, and here the person who made the link is the person who opens it.
//!
//! **The row behind it carries no signature, and that is an accepted limit.** `store.rs`'s
//! [`MachineLinkRecord`] says why: a plain member holds no certificate and signs nothing, the row
//! gates availability and never authority, and a rewritten one reopens a spent link on one more
//! machine that still lands at the wall. A test here rewrites it and shows exactly that, so the
//! limit is recorded rather than found.

use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};

use crate::{
    diagnostics,
    error::{Error, RefusalReason},
    persisted::Persisted,
    sync::RemoteSyncStore,
};

use super::{
    HeldOrganization, connect,
    invite::{
        generate_code, generate_link_secret, held_credential, link_expiry, organization_link,
        random_id,
    },
    link::{Half, HalfKind, JoinLink, LinkPayload, open_payload, seal_payload},
    session::{CredentialSlot, MemberSession},
    store::{MachineLinkRecord, OrganizationStore},
    vault::KdfParams,
};

/// What making a link for another machine hands the member: the two things they carry over, and
/// the moment both stop working.
///
/// The link is sent to the other machine and the code is read off the screen; neither the
/// credential nor any key is legible in either ([[rules/credentials]], *Client boundary*). There
/// is one pair per link and nothing stores it, so a person who lost it makes another.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MachineLink {
    pub link: String,
    /// six characters from the alphabet with the letters that read alike taken out.
    pub code: String,
    /// the earlier of a week out and the moment the member's own grant dies.
    pub expires_at: i64,
}

/// Why a machine link no longer opens, which is what the sentence the person reads names.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Refusal {
    /// past its moment, whether the link says so or the row does.
    Lapsed,
    /// a machine opened it already, and it admits one.
    Consumed,
    /// no row stands behind it: the member made a newer link, or the organization forgot this one.
    Replaced,
}

/// The one sentence a machine link that no longer opens is refused with, said in the name of the
/// organization the link names, since that is the only thing the person on the new machine has.
///
/// **It points at the you section rather than at anybody else.** Nobody but the member makes one
/// of these, so a refusal has exactly one remedy and the sentence says where it is.
///
/// **It crosses as `Error::Refused` with the reason beside the message**, the way an invitation's
/// refusal does, so the connect screen names the standing rather than reading this sentence.
fn machine_link_refused(organization_name: &str, refusal: Refusal) -> Error {
    let (reason, why) = match refusal {
        Refusal::Lapsed => (RefusalReason::Lapsed, "has lapsed"),
        Refusal::Consumed => (RefusalReason::Consumed, "already connected a machine"),
        Refusal::Replaced => (RefusalReason::Replaced, "was replaced by a newer one"),
    };

    Error::Refused {
        reason,
        message: format!(
            "this link to {organization_name} {why}; make another from the you section on a \
             machine you are already signed in on"
        ),
    }
}

/// Make the link and the code for the member's own next machine (effort 828, requirement 3).
///
/// `session` is whoever is signed in, and the link carries what their vault already unsealed:
/// their own grant on the organization database, which the owner's machine renews and which dies
/// within four weeks whatever happens here. Nothing is minted, which is what lets a plain member
/// do this at all (826, requirement 5).
///
/// The row is written before the link is built, so a link that exists always has a row behind it,
/// and the member's other unspent rows go first, so one link stands at a time. What comes back is
/// shown once and kept nowhere.
pub async fn make(
    store: &OrganizationStore,
    session: &MemberSession,
    kdf_params: KdfParams,
    now: i64,
) -> Result<MachineLink, Error> {
    session.settled()?;

    // the organization's own locator, which every link is built from. Its clear credential is
    // replaced by the seal below and never leaves this function.
    let locator = organization_link(store, session).await?;
    let credential = held_credential(session)?;
    let expires_at = link_expiry(&credential, now);
    let id = random_id()?;
    let secret = generate_link_secret()?;
    let code = generate_code()?;

    store
        .delete_open_machine_links_of(&session.member_id)
        .await?;
    store
        .write_machine_link(&MachineLinkRecord {
            id: id.clone(),
            member_id: session.member_id.clone(),
            expires_at,
            consumed_at: None,
            created_at: now,
        })
        .await?;

    let half = Half {
        kind: HalfKind::Machine,
        id: id.clone(),
        secret,
        expires_at,
    };
    let sealed = seal_payload(
        &code,
        &half,
        &LinkPayload {
            credential,
            vault_password: None,
        },
        kdf_params,
    )?;
    let link = locator.sealed(&sealed, half).encode()?;

    if !store.push().await {
        diagnostics::warn("organization.machineLink.notYetSent")
            .with("link", id.as_str())
            .write();
    }

    diagnostics::info("organization.machineLink.made")
        .with("member", session.member_id.as_str())
        .write();

    Ok(MachineLink {
        link,
        code,
        expires_at,
    })
}

/// Connect this machine with a link its member made for it, and leave it at the wall.
///
/// `store_for` opens a replica of the organization the link names against a credential slot, the
/// way `join::accept` reaches: after the unseal and never before it, because there is no legible
/// credential to reach with. `machine` is this machine's record, which has to hold nothing.
///
/// **The order is what this function is.** Refuse while an organization is held, since a machine
/// holds one; refuse a link past its own moment before any key is derived, because deriving for a
/// dead link is a free pass to whoever is guessing; unseal the payload with the code and the
/// link's secret together; reach the replica with what came out; judge the row, refusing a
/// replaced, lapsed or spent one by name; record the organization with no member; mark the row
/// spent and send it.
///
/// **Nothing is signed in afterwards and nothing is kept.** The credential goes out of scope with
/// the slot it was put in, and the member signs in at the wall with the username and password they
/// already had, which is what fills the slot from their vault from then on.
pub async fn connect<S, F, R>(
    store_for: S,
    machine: &mut Persisted<RemoteSyncStore>,
    link: &JoinLink,
    code: &str,
    kdf_params: KdfParams,
    now: i64,
) -> Result<HeldOrganization, Error>
where
    S: FnOnce(CredentialSlot) -> F,
    F: std::future::Future<Output = Result<R, Error>>,
    R: std::borrow::Borrow<OrganizationStore>,
{
    let not_for_a_machine = || Error::InvalidInput {
        message: "this link does not connect another machine; open it at the wall instead"
            .to_string(),
    };
    let half = link.half().ok_or_else(not_for_a_machine)?;
    let sealed = link.sealed_credential().ok_or_else(not_for_a_machine)?;

    if half.kind != HalfKind::Machine {
        return Err(not_for_a_machine());
    }

    connect::refuse_while_held(machine)?;

    if half.expires_at <= now {
        return Err(machine_link_refused(
            &link.organization_name,
            Refusal::Lapsed,
        ));
    }

    let payload = open_payload(code, half, sealed, kdf_params)?;
    // the one pull this credential is for, in the slot the replica reads from and in nothing else.
    let credential: CredentialSlot = Arc::new(Mutex::new(Some(payload.credential.clone())));
    let reached = store_for(credential).await?;
    let store = reached.borrow();
    // the link with its credential in hand: what `connect::connect` records an organization from,
    // since a sealed one is refused there for want of a code.
    let opened = link.with_clear_credential(&payload.credential);

    let row = store
        .machine_link(&half.id)
        .await?
        .ok_or_else(|| machine_link_refused(&link.organization_name, Refusal::Replaced))?;

    if row.expires_at <= now {
        return Err(machine_link_refused(
            &link.organization_name,
            Refusal::Lapsed,
        ));
    }

    if row.consumed_at.is_some() {
        return Err(machine_link_refused(
            &link.organization_name,
            Refusal::Consumed,
        ));
    }

    let held = connect::connect(store, machine, &opened, now).await?;

    store.consume_machine_link(&half.id, now).await?;

    if !store.push().await {
        diagnostics::warn("organization.machineLink.spentNotYetSent")
            .with("link", half.id.as_str())
            .write();
    }

    diagnostics::info("organization.machineLink.connected")
        .with("organization", held.id.as_str())
        .with("member", row.member_id.as_str())
        .write();

    Ok(held)
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use serde_json::json;

    use super::{MachineLink, connect, make};
    use crate::{
        error::{Error, RefusalReason},
        organization::{
            HeldOrganization,
            invite::{INVITATION_LIFETIME_MS, Invitation, invite_member, organization_link},
            join,
            link::{CODE_REFUSED, JoinLink, LinkKind, LinkPayload, open_payload},
            permission,
            session::{CredentialSlot, MemberSession, sign_in, sign_in_by_username},
            setup::{CreateOrganization, Remote, create_organization, credential_expiry},
            store::{MachineLinkRecord, OrganizationStore},
            vault::KdfParams,
        },
        persisted::Persisted,
        sync::{
            RemoteSync, RemoteSyncStore,
            test::server::{ScriptedResponse, ScriptedServer},
            turso::{discovery::McpEndpoint, platform::InMemoryPlatform},
        },
    };

    const PASSWORD: &str = "the owners password";
    /// The password the invited member chooses when they open their link, and the one that has to
    /// go on admitting them on every machine they connect afterwards.
    const CHOSEN: &str = "a password sami chose";
    const ISSUED_AT: i64 = 1_757_000_000_000;
    const FOUR_WEEKS_MS: i64 = 28 * 24 * 60 * 60 * 1000;

    fn test_cost() -> KdfParams {
        KdfParams {
            memory_kib: 1024,
            iterations: 2,
            lanes: 1,
        }
    }

    fn scratch(name: &str) -> std::path::PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|elapsed| elapsed.as_nanos())
            .unwrap_or_default();
        let directory = std::env::temp_dir().join(format!("rentable-machine-{name}-{nanos:x}"));
        std::fs::create_dir_all(&directory).expect("scratch directory");

        directory
    }

    fn slot() -> CredentialSlot {
        Arc::new(Mutex::new(None))
    }

    /// No platform authority in hand, which is every session here but the owner's with one.
    fn no_platform() -> Option<&'static InMemoryPlatform> {
        None
    }

    /// A machine's record with nothing on it, which is what a new machine is.
    fn fresh_machine(directory: &std::path::Path) -> Persisted<RemoteSyncStore> {
        let machine = Persisted::<RemoteSyncStore>::load(directory.join(RemoteSync::FILENAME))
            .expect("the store");

        assert!(machine.organization.is_none(), "the machine has prior state");

        machine
    }

    /// An organization with its owner and one plain member, that member signed in on a machine of
    /// their own: the store every test here runs over, the member's session, and their username.
    ///
    /// **A plain member and not the owner**, because the row this module writes is the one a
    /// member with no certificate writes on their own account, and a fixture signed in as the
    /// owner would prove the act works for somebody who can sign.
    async fn member(directory: &std::path::Path) -> (OrganizationStore, MemberSession, String) {
        let mut record = Persisted::<RemoteSyncStore>::load(directory.join("remote-sync.json"))
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
        let (_, store) = create_organization(
            &mut record,
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
            ISSUED_AT,
        )
        .await
        .expect("the first run failed");
        let joined = record.organization.clone().expect("the record");
        let owner = sign_in(&store, &joined, PASSWORD, &slot())
            .await
            .expect("the owner did not sign in");
        let locator = organization_link(&store, &owner)
            .await
            .expect("the organization's link");
        let invited = invite_member(
            &store,
            &owner,
            no_platform(),
            &locator,
            Invitation {
                username: "sami.staff",
                role: permission::MEMBER,
                workspaces: &[],
            },
            test_cost(),
            ISSUED_AT,
        )
        .await
        .expect("the invitation failed");
        let invitation = JoinLink::decode(&invited.join_link).expect("the invitation link");
        let theirs = directory.join("sami");

        std::fs::create_dir_all(&theirs).expect("the member's directory");

        let mut their_machine = fresh_machine(&theirs);
        let (_, session) = join::accept(
            |_| async { Ok::<_, Error>(&store) },
            &mut their_machine,
            &invitation,
            &invited.code,
            CHOSEN,
            test_cost(),
            ISSUED_AT + 1,
        )
        .await
        .expect("the member could not open their link");

        assert_eq!(session.role, permission::MEMBER);
        assert!(!session.must_change_password);

        (store, session, "sami.staff".to_string())
    }

    /// A credential shaped the way a minted one is, dying at `expires_at`. The in-memory platform
    /// draws tokens carrying no claims at all, so a test about what a grant's own expiry does to a
    /// link writes one the way `setup::credential_expiry` reads one.
    fn grant_dying_at(expires_at: i64) -> String {
        let payload = base64::Engine::encode(
            &base64::engine::general_purpose::URL_SAFE_NO_PAD,
            json!({ "id": "org", "exp": expires_at / 1000 }).to_string(),
        );

        format!("header.{payload}.signature")
    }

    /// The connect, over one machine's record and the replica this test already holds.
    ///
    /// **The replica is handed in rather than opened**, for the reason `join.rs`'s tests give: in
    /// the application `command::reached` answers with one it opened against the credential the
    /// code unsealed, and here the organization is a local file every test in this module shares,
    /// which is the same read either way.
    async fn connect_on(
        machine: &mut Persisted<RemoteSyncStore>,
        store: &OrganizationStore,
        made: &MachineLink,
        code: &str,
        now: i64,
    ) -> Result<HeldOrganization, Error> {
        let link = JoinLink::decode(&made.link).expect("the machine link");

        connect(
            |_| async { Ok::<_, Error>(store) },
            machine,
            &link,
            code,
            test_cost(),
            now,
        )
        .await
    }

    /// Effort 828, requirement 3 and criterion 3: **a member connects their own next machine.**
    ///
    /// The member makes a link and a code on the machine they are signed in on. Opening it on a
    /// machine that holds nothing connects that machine and names no member, which is the wall;
    /// the username and the password they already had admit them there, unchanged. The link is a
    /// machine link by its own text, and it lapses a week out because the in-memory grant carries
    /// no death of its own.
    #[tokio::test]
    async fn a_member_makes_a_link_for_their_next_machine_and_the_same_password_admits_them_there()
    {
        let directory = scratch("connect");
        let (store, member, username) = member(&directory).await;
        let made = make(&store, &member, test_cost(), ISSUED_AT + 2)
            .await
            .expect("the member could not make a link");

        assert_eq!(
            made.expires_at,
            ISSUED_AT + 2 + INVITATION_LIFETIME_MS,
            "a link the grant does not cut short lapses a week out"
        );
        assert_eq!(
            crate::organization::link::read(&made.link)
                .expect("the link could not be read")
                .kind,
            LinkKind::Machine
        );
        assert!(
            !made.link.contains(
                member
                    .organization_credential
                    .lock()
                    .expect("the slot")
                    .as_deref()
                    .expect("a credential")
            ),
            "the link carries the credential in the clear"
        );

        let next = scratch("connect-next");
        let mut machine = fresh_machine(&next);
        let held = connect_on(&mut machine, &store, &made, &made.code, ISSUED_AT + 3)
            .await
            .expect("the next machine did not connect");

        assert_eq!(held.id, member.organization_id);
        assert_eq!(held.name, "Acme");
        assert_eq!(held.member_id, None, "the connect recorded a member");
        assert_eq!(held.role, None);
        assert_eq!(held.joined_at, ISSUED_AT + 3);

        let recorded = machine.organization.as_ref().expect("the record");

        assert_eq!(recorded.member_id, None);

        // the wall on the machine that just connected: the password is the one they chose when
        // they opened their invitation, and nothing here changed it.
        let credential = slot();
        let session = sign_in_by_username(&store, &held, &username, CHOSEN, &credential)
            .await
            .expect("the member could not sign in on their next machine");

        assert_eq!(session.member_id, member.member_id);
        assert_eq!(session.role, permission::MEMBER);
        assert!(!session.must_change_password);
        assert!(
            credential.lock().expect("the slot").is_some(),
            "the sign-in did not fill the credential slot from the vault"
        );
    }

    /// Effort 828, requirement 3: **the link admits one machine, once, and lapses on its own.**
    ///
    /// A second machine opening the same pair is refused as already spent, before anything is
    /// recorded on it; a machine opening it a week later is refused as lapsed, before any key is
    /// derived; and a wrong code is refused with the one sentence a wrong code gets, which is
    /// `CODE_REFUSED` and never a comparison.
    #[tokio::test]
    async fn one_machine_once_and_a_lapsed_link_or_a_wrong_code_reaches_nothing() {
        let directory = scratch("once");
        let (store, member, _) = member(&directory).await;
        let made = make(&store, &member, test_cost(), ISSUED_AT + 2)
            .await
            .expect("the member could not make a link");

        // the wrong code, on a machine holding nothing: the tag fails and nothing is recorded.
        let wrong = scratch("once-wrong");
        let mut wrong_machine = fresh_machine(&wrong);
        let refusal = connect_on(&mut wrong_machine, &store, &made, "ZZZZZZ", ISSUED_AT + 3)
            .await
            .expect_err("a wrong code connected a machine");

        assert!(
            matches!(&refusal, Error::Forbidden { message } if message == CODE_REFUSED),
            "{refusal:?}"
        );
        assert!(
            wrong_machine.organization.is_none(),
            "a wrong code recorded an organization"
        );

        // a week and a moment later, before any key is derived.
        let late = scratch("once-late");
        let mut late_machine = fresh_machine(&late);
        let refusal = connect_on(
            &mut late_machine,
            &store,
            &made,
            &made.code,
            made.expires_at + 1,
        )
        .await
        .expect_err("a lapsed link connected a machine");

        assert!(
            matches!(&refusal, Error::Refused { reason: RefusalReason::Lapsed, .. }),
            "{refusal:?}"
        );
        assert!(late_machine.organization.is_none());

        // the machine the link was made for, which spends it.
        let first = scratch("once-first");
        let mut first_machine = fresh_machine(&first);

        connect_on(&mut first_machine, &store, &made, &made.code, ISSUED_AT + 4)
            .await
            .expect("the next machine did not connect");

        assert_eq!(
            store
                .machine_link(
                    JoinLink::decode(&made.link)
                        .expect("the link")
                        .half()
                        .expect("the half")
                        .id
                        .as_str()
                )
                .await
                .expect("the row")
                .expect("the row is gone")
                .consumed_at,
            Some(ISSUED_AT + 4),
            "the connect did not spend the row"
        );

        // and a second machine with the same pair.
        let second = scratch("once-second");
        let mut second_machine = fresh_machine(&second);
        let refusal = connect_on(&mut second_machine, &store, &made, &made.code, ISSUED_AT + 5)
            .await
            .expect_err("a spent link connected a second machine");

        assert!(
            matches!(
                &refusal,
                Error::Refused { reason: RefusalReason::Consumed, .. }
            ),
            "{refusal:?}"
        );
        assert!(
            second_machine.organization.is_none(),
            "a spent link recorded an organization"
        );
    }

    /// The spec's recorded risk, written as a test: **the row is unsigned, so anybody who can
    /// write the replica can reopen a spent link.**
    ///
    /// Clearing `consumed_at` by hand puts one more machine through, and where that machine lands
    /// is the wall, where the member's password is still the whole of what admits. That is the
    /// limit the effort accepted rather than a hole to be patched here: a plain member holds no
    /// certificate and can sign nothing, so the alternative was no row at all and no single use.
    #[tokio::test]
    async fn a_rewritten_row_reopens_a_spent_link_and_the_machine_still_lands_at_the_wall() {
        let directory = scratch("rewritten");
        let (store, member, username) = member(&directory).await;
        let made = make(&store, &member, test_cost(), ISSUED_AT + 2)
            .await
            .expect("the member could not make a link");
        let id = JoinLink::decode(&made.link)
            .expect("the link")
            .half()
            .expect("the half")
            .id
            .clone();

        let first = scratch("rewritten-first");
        let mut first_machine = fresh_machine(&first);

        connect_on(&mut first_machine, &store, &made, &made.code, ISSUED_AT + 3)
            .await
            .expect("the next machine did not connect");

        // the row as any member holding the database can write it: no signature stands in the way.
        store
            .write_machine_link(&MachineLinkRecord {
                id: id.clone(),
                member_id: member.member_id.clone(),
                expires_at: made.expires_at,
                consumed_at: None,
                created_at: ISSUED_AT + 2,
            })
            .await
            .expect("the row could not be rewritten");

        let again = scratch("rewritten-again");
        let mut again_machine = fresh_machine(&again);
        let held = connect_on(&mut again_machine, &store, &made, &made.code, ISSUED_AT + 4)
            .await
            .expect("the rewritten row did not reopen the link");

        assert_eq!(held.member_id, None, "the connect recorded a member");

        // and the wall is where it lands: the password admits, exactly as it does anywhere else,
        // so what the rewrite bought is availability and never authority.
        sign_in_by_username(&store, &held, &username, CHOSEN, &slot())
            .await
            .expect("the member could not sign in on the reopened machine");

        assert!(
            sign_in_by_username(&store, &held, &username, "not their password", &slot())
                .await
                .is_err(),
            "the reopened machine admitted a wrong password"
        );
    }

    /// Effort 828, requirement 2 and criterion 2: **what the link seals is the member's own grant,
    /// and it dies within four weeks.**
    ///
    /// The payload carries the credential the session holds and no vault password, because a
    /// second machine opens no vault. Where that grant dies before the week is out, the link and
    /// its row lapse with it, so a link never outlives what it carries and the panel prints the
    /// true date.
    #[tokio::test]
    async fn a_machine_link_seals_the_members_own_grant_and_lapses_no_later_than_it_does() {
        let directory = scratch("grant");
        let (store, member, _) = member(&directory).await;
        let now = ISSUED_AT + 2;
        // a round moment, since a credential spells its expiry in seconds and a link reads it
        // back in milliseconds.
        let dies_at = ISSUED_AT + 3 * 24 * 60 * 60 * 1000;
        let grant = grant_dying_at(dies_at);

        *member.organization_credential.lock().expect("the slot") = Some(grant.clone());

        let made = make(&store, &member, test_cost(), now)
            .await
            .expect("the member could not make a link");
        let link = JoinLink::decode(&made.link).expect("the link");
        let half = link.half().expect("the half");
        let payload: LinkPayload = open_payload(
            &made.code,
            half,
            link.sealed_credential().expect("the sealed payload"),
            test_cost(),
        )
        .expect("the code did not open the payload");

        assert_eq!(
            payload.credential, grant,
            "the link sealed a credential that is not the session's"
        );
        assert_eq!(
            payload.vault_password, None,
            "the link seals a vault password, and a second machine opens no vault"
        );

        let expiry = credential_expiry(&payload.credential)
            .and_then(|moment| moment.parse::<i64>().ok())
            .expect("the link sealed a credential that never dies");

        assert!(
            expiry > now && expiry <= now + FOUR_WEEKS_MS,
            "the link sealed a credential dying at {expiry}, outside four weeks of {now}"
        );
        assert_eq!(made.expires_at, dies_at, "the link outlived its credential");
        assert_eq!(half.expires_at, dies_at);
        assert_eq!(
            store
                .machine_link(&half.id)
                .await
                .expect("the row")
                .expect("the row is gone")
                .expires_at,
            dies_at,
            "the row outlived the link"
        );

        // and making another drops the one that did not stand: one link at a time.
        let second = make(&store, &member, test_cost(), now + 1)
            .await
            .expect("the member could not make a second link");

        assert!(
            store
                .machine_link(&half.id)
                .await
                .expect("the row")
                .is_none(),
            "the earlier link still stands"
        );
        assert_ne!(second.code, made.code);
    }
}
