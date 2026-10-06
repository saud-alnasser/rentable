//! a machine link: the kind of link an account with a password is admitted by, and the connect
//! that spends it.
//!
//! **The making is `invite::make_link`'s** (effort 828, requirement 20). One act makes a link for
//! an account and reads its kind off the account's standing, so the choice between this kind and
//! an invitation is made in one place; what is here is the kind's own shape and what spending it
//! does. *A signed-in member made their own from the you section until requirement 20 made a link
//! the owner's or an administrator's, from the account's card.*
//!
//! **The link is the same shape every other sealed link is** (`link.rs`). It carries the maker's
//! own grant on the organization database sealed under the six-character code and the link's own
//! secret together, a [`HalfKind::Machine`] half naming the row behind it, and no vault password,
//! because this kind opens no vault: it lands at the wall, where the account's own username and
//! password admit them, unchanged.
//!
//! **What the credential in it is for is the one pull.** The connect reads the organization row
//! with it and records the four facts the link pins; nothing writes it anywhere, and the sign-in
//! that follows fills the credential slot from the member's own vault, as `sign_in_by_username`
//! already does. So the link is worth one machine's first read and no more, and it is dead within
//! four weeks whatever happens to it, because the grant inside it is.
//!
//! **A locked member's link keeps their lock** (effort 851, requirement 38). A link made for a
//! member who read as locked names them inside its seal, and the machine it connects latches their
//! own lock (`HeldOrganization::own_lock_latched`), as a machine an invitation joined does, so they
//! read as locked there with no lock row until a verifying unlock is read. A link made before this
//! names nobody, and latches nothing.
//!
//! **One link stands at a time.** Making one drops the account's other unspent rows, so a pair
//! somebody lost stops being a way in the moment another is made.
//!
//! **The row behind it carries no signature, and that is an accepted limit.** `store/session.rs`'s
//! [`MachineLinkRecord`] says why: the row gates availability and never authority, and a rewritten
//! one reopens a spent link on one more machine that still lands at the wall. A test here rewrites
//! it and shows exactly that, so the limit is recorded rather than found.

use std::{
    path::Path,
    sync::{Arc, Mutex},
};

use crate::{
    diagnostics,
    error::{Error, RefusalReason},
    machine::RemoteSyncStore,
    persisted::Persisted,
};

use crate::organization::{
    HeldOrganization,
    invitation::{
        connect,
        link::{HalfKind, JoinLink, open_payload},
    },
    member::vault::KdfParams,
    session::CredentialSlot,
    store::OrganizationStore,
};

/// The one sentence a machine link that no longer opens is refused with, said in the name of the
/// organization the link names, since that is the only thing the person on the new machine has.
/// `reason` is why the link no longer opens: `Lapsed`, past its moment, whether the link says so or
/// the row does; `Consumed`, a machine opened it already, and it admits one; or `Revoked`, no row
/// stands behind it, because somebody revoked it from the list of links waiting to be opened, a
/// newer link took its place, or a reset or a removal withdrew it. *A `Refusal` enum of this file's
/// own named the three until effort 840 left the crate one error type (ticket 47). The third was
/// `Replaced` until the revoke (effort 851): a row that is gone says nothing about who took it
/// away, and the half a link carries names no member to ask after, so the one word that is true
/// of every way a row goes is that the link was withdrawn.*
///
/// **It points at whoever keeps the accounts.** A link is made by a holder of `inviteMember` or
/// `resetPassword` ranked above the account, from the account's card (effort 828, requirement 20), so a refusal has exactly one remedy and
/// it is asking them for another. *It said to make another from the you section while a member
/// made their own; the person reading this sentence is on a machine that holds nothing and has no
/// you section to reach.*
///
/// **It crosses as `Error::Refused` with the reason beside the message**, the way an invitation's
/// refusal does, so the connect screen names the standing rather than reading this sentence.
fn machine_link_refused(organization_name: &str, reason: RefusalReason) -> Error {
    let why = match reason {
        RefusalReason::Lapsed => "has lapsed",
        RefusalReason::Consumed => "already connected a machine",
        // `Revoked`, the third; nothing here refuses a machine link with another.
        _ => "was withdrawn",
    };

    Error::Refused {
        reason,
        message: format!(
            "this link to {organization_name} {why}; ask whoever keeps the accounts for another"
        ),
    }
}

/// What a link for an account that is no longer in the organization is refused with.
///
/// **It says nothing about the account.** Whoever is holding the link is on a machine that holds
/// nothing and is signed in to nothing, so naming whose account was removed would hand a fact
/// about the directory to whoever found the link.
fn no_longer_a_member(organization_name: &str) -> Error {
    Error::Refused {
        reason: RefusalReason::Revoked,
        message: format!("this link no longer admits anybody to {organization_name}"),
    }
}

/// Connect this machine with a link its member made for it, and leave it at the wall.
///
/// `store_for` opens a replica of the organization the link names against a credential slot, the
/// way `join::accept_while` reaches: after the unseal and never before it, because there is no
/// legible credential to reach with. `machine` is this machine's record, which may hold other
/// organizations.
///
/// **The order is what this function is.** Select the organization where this machine holds it
/// already, and refuse the link there as already used (effort 851, requirement 13); refuse a link past its own moment before any key is derived,
/// because deriving for a dead link is a free pass to whoever is guessing; unseal the payload with
/// the code and the link's secret together; reach the replica with what came out; judge the row,
/// refusing a revoked, lapsed or spent one by name; refuse an account that is no longer in the
/// organization; record the organization with no member, beside any others held, and select it,
/// with the member's own lock latched where the seal says they were locked; mark the row spent and
/// send it.
///
/// **Nothing is signed in afterwards and nothing is kept.** The credential goes out of scope with
/// the slot it was put in, and the member signs in at the wall with the username and password they
/// already had, which is what fills the slot from their vault from then on.
///
/// **`session_open` is whether somebody is signed in here as the link is opened** (effort 851,
/// review). Where they are, a link for a held organization is refused without selecting it
/// (`connect::held_here`), so the refusal leaves their session and the record as they were; the
/// command ends the session only once a link has recorded an organization.
#[allow(clippy::too_many_arguments)]
pub async fn connect<S, F, R>(
    store_for: S,
    machine: &mut Persisted<RemoteSyncStore>,
    database_path: &Path,
    link: &JoinLink,
    code: &str,
    kdf_params: KdfParams,
    now: i64,
    session_open: bool,
) -> Result<HeldOrganization, Error>
where
    S: FnOnce(CredentialSlot) -> F,
    F: std::future::Future<Output = Result<R, Error>>,
    R: std::borrow::Borrow<OrganizationStore>,
{
    let not_for_a_machine = || {
        Error::refused(
            RefusalReason::LinkNotForAMachine,
            "this link does not connect another machine; open it at the wall instead",
        )
    };
    let half = &link.half;

    if half.kind != HalfKind::Machine {
        return Err(not_for_a_machine());
    }

    // a link for an organization this machine holds opens that organization's wall (effort 851,
    // requirement 13, as the human settled it on 2026-10-05): it is selected, and a machine link is
    // never what a machine already on that wall needs, so it is refused as already used before
    // anything is derived or reached. `join::accept_while` lets a reset through; nothing else is.
    // With somebody signed in here it is not selected, and nothing else is touched either.
    if connect::held_here(machine, &link.organization_id, session_open)? {
        return Err(machine_link_refused(
            &link.organization_name,
            RefusalReason::Consumed,
        ));
    }

    if half.expires_at <= now {
        return Err(machine_link_refused(
            &link.organization_name,
            RefusalReason::Lapsed,
        ));
    }

    let payload = open_payload(code, &link.locator(), half, &link.credential, kdf_params)?;
    // the one pull this credential is for, in the slot the replica reads from and in nothing else.
    // From here on a refusal has a replica on disk, so every one goes out through
    // `refused_after_reaching`, with the replica let go of first (effort 851, requirement 10).
    let credential: CredentialSlot = Arc::new(Mutex::new(Some(payload.credential.clone())));
    let reached = match store_for(credential).await {
        Ok(reached) => reached,
        Err(refusal) => {
            return Err(connect::refused_after_reaching(
                machine,
                database_path,
                &link.organization_id,
                refusal,
            ));
        }
    };
    let connected = connected(
        reached.borrow(),
        machine,
        link,
        &payload.credential,
        payload.locked_member.as_deref(),
        now,
    )
    .await;

    drop(reached);

    connected.map_err(|refusal| {
        connect::refused_after_reaching(machine, database_path, &link.organization_id, refusal)
    })
}

/// [`connect`] past the reach: the row behind the link judged, the account it names checked, and
/// only then the organization recorded and the row spent.
///
/// **Nothing is recorded before the row is judged**, which this kind of link always did and an
/// invitation link does too since effort 851; a refusal here comes back to [`connect`], which
/// takes away the replica where this machine does not hold the organization.
async fn connected(
    store: &OrganizationStore,
    machine: &mut Persisted<RemoteSyncStore>,
    link: &JoinLink,
    link_credential: &str,
    locked_member: Option<&str>,
    now: i64,
) -> Result<HeldOrganization, Error> {
    let half = &link.half;

    // an organization another version made is refused before its link's row is read (effort 838,
    // requirement 11).
    store.refuse_another_format().await?;

    let row = store
        .machine_link(&half.id)
        .await?
        .ok_or_else(|| machine_link_refused(&link.organization_name, RefusalReason::Revoked))?;

    if row.expires_at <= now {
        return Err(machine_link_refused(
            &link.organization_name,
            RefusalReason::Lapsed,
        ));
    }

    if row.consumed_at.is_some() {
        return Err(machine_link_refused(
            &link.organization_name,
            RefusalReason::Consumed,
        ));
    }

    // the account the row names, read and verified against the key the link pins, before this
    // machine records anything or pulls anything further. A removal withdraws the open rows behind
    // a member's links, so an unspent row here belongs to somebody who is in; a replica that has
    // not caught up with the removal is the case this refusal is for, and it is the difference
    // between a link that stops working and a link that keeps handing out the directory.
    let verifying_key = link.verifying_key_bytes()?;
    let member = store
        .members(&verifying_key)
        .await?
        .into_iter()
        .find(|member| member.id == row.member_id)
        .ok_or_else(|| no_longer_a_member(&link.organization_name))?;

    if member.removed_at.is_some() {
        return Err(no_longer_a_member(&link.organization_name));
    }

    // recorded beside any other organization this machine holds, and selected.
    let held = connect::connect(store, machine, &link.locator(), link_credential, now).await?;

    // **and a locked member's own lock latched from the connect on** (effort 851, requirement 38),
    // where the link's seal says they were locked when it was made: they read as locked here with
    // no lock row of theirs that verifies, as a machine an invitation joined holds them, so
    // deleting their row and the owner's marker from this replica unlocks nobody. The member is
    // the one the seal names, never the unsigned row's, and a verifying unlock still reads first.
    let held = match locked_member {
        Some(member_id) => {
            let latched = held.latching(member_id);

            machine.hold(latched.clone());
            machine.commit()?;

            latched
        }
        None => held,
    };

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
    use crate::credential::{CredentialStore, Memory};

    use std::sync::{Arc, Mutex};

    use serde_json::json;

    use super::connect;
    use crate::test::scratch;
    use crate::{
        error::{Error, RefusalReason},
        machine::{RemoteSync, RemoteSyncStore},
        organization::{
            HeldOrganization,
            invitation::{
                MadeLink, TEST_LIFETIME_MS, create_account, join,
                link::{CODE_REFUSED, JoinLink, LinkKind, LinkPayload, Locator, open_payload},
                locator, make_link,
            },
            member::{lock::unlock_member, vault::KdfParams},
            role::permission,
            session::{
                CredentialSlot, MEMBER_KEY_SERVICE, MemberSession, acting_row, sign_in,
                sign_in_by_username,
            },
            setup::{CreateOrganization, Remote, create_organization, credential_expiry},
            store::{MachineLinkRecord, OrganizationStore},
        },
        persisted::Persisted,
        sync::test::server::{ScriptedResponse, ScriptedServer},
        turso::{discovery::McpEndpoint, platform::InMemoryPlatform},
    };

    const PASSWORD: &str = "the owners password";
    /// The password the member chose when they opened their first link, and the one that has to go
    /// on admitting them on every machine a link connects afterwards.
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

        assert!(machine.selected().is_none(), "the machine has prior state");

        machine
    }

    /// One plain member's account, with a password of their own and no machine signed in on it:
    /// the store, the owner's session, the organization's locator, and the account's id and
    /// username.
    ///
    /// **The account has been opened once**, because that is what gives it a password and so what
    /// makes the next link a machine link. The machine that opened it stays signed in and stays in
    /// the register, since an account is held on as many machines as it is given links for
    /// (effort 828, requirement 20 as corrected 2026-09-20), and what these tests are about is the
    /// link that follows. *It was signed out here until then, because a link was refused while a
    /// machine was signed in.*
    async fn account(
        credentials: &dyn CredentialStore,
        directory: &std::path::Path,
    ) -> (OrganizationStore, MemberSession, Locator, String, String) {
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
            credentials,
            &crate::clock::System::shared(),
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
        let joined = record.selected().cloned().expect("the record");
        let owner = sign_in(&store, &joined, PASSWORD, &slot())
            .await
            .expect("the owner did not sign in");
        let locator = locator(&store, &owner)
            .await
            .expect("the organization's locator");
        let account = create_account(
            &store,
            &owner,
            no_platform(),
            "sami.staff",
            permission::MEMBER,
            0,
            &[],
            test_cost(),
            ISSUED_AT,
        )
        .await
        .expect("the account could not be made");
        let first = make_link(
            &store,
            &owner,
            no_platform(),
            &locator,
            &account.id,
            crate::organization::invitation::TEST_LIFETIME_HOURS,
            test_cost(),
            ISSUED_AT,
        )
        .await
        .expect("the first link could not be made");
        let invitation = JoinLink::decode(&first.link).expect("the invitation link");
        let theirs = directory.join("sami");

        std::fs::create_dir_all(&theirs).expect("the member's directory");

        let mut their_machine = fresh_machine(&theirs);
        let (_, session) = join::accept(
            credentials,
            |_| async { Ok::<_, Error>(&store) },
            &mut their_machine,
            &theirs.join("app.db"),
            &invitation,
            &first.code,
            CHOSEN,
            test_cost(),
            ISSUED_AT + 1,
        )
        .await
        .expect("the member could not open their link");

        assert_eq!(session.role, permission::MEMBER);
        assert!(!session.must_change_password);

        // **and they stay signed in on it**, which is the state every link below is made in: an
        // account is held on as many machines as it is given links for (requirement 20, as the
        // human corrected it on 2026-09-20). *They were signed out here until then, because the
        // act refused a link while a machine was signed in on the account.*
        let named = store
            .connected_machines(&owner.verifying_key, ISSUED_AT + 1)
            .await
            .expect("the register could not be read")
            .into_iter()
            .any(|(machine, _)| machine.member_id.as_deref() == Some(account.id.as_str()));
        assert!(named, "opening the link did not register their machine");

        (store, owner, locator, account.id, "sami.staff".to_string())
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
    /// the application `reached` (`command.rs`) answers with one it opened against the credential
    /// the code unsealed, and here the organization is a local file every test in this module
    /// shares, which is the same read either way.
    async fn connect_on(
        machine: &mut Persisted<RemoteSyncStore>,
        store: &OrganizationStore,
        made: &MadeLink,
        code: &str,
        now: i64,
    ) -> Result<HeldOrganization, Error> {
        let link = JoinLink::decode(&made.link).expect("the machine link");
        let database_path = machine.path().with_file_name("app.db");

        connect(
            |_| async { Ok::<_, Error>(store) },
            machine,
            &database_path,
            &link,
            code,
            test_cost(),
            now,
            false,
        )
        .await
    }

    /// Effort 828, requirement 20 and criterion 20: **a link for an account that has a password
    /// lands at the wall, where that password admits.**
    ///
    /// The owner makes it from the account **while a machine is already signed in on it**, which
    /// is the whole of what the human's correction of 2026-09-20 changed: an account is held on as
    /// many machines as it is given links for. Opening it on a machine that holds nothing connects
    /// that machine and names no member, which is the wall; the username and the password the
    /// member already had admit them there, unchanged. The link is a machine link by its own text,
    /// and it lapses a week out because the in-memory grant carries no death of its own.
    #[tokio::test]
    async fn a_link_for_an_account_with_a_password_lands_at_the_wall_where_that_password_admits() {
        let credentials = Memory::new();
        let directory = scratch("connect");
        let (store, owner, locator, member_id, username) = account(&credentials, &directory).await;
        let made = make_link(
            &store,
            &owner,
            no_platform(),
            &locator,
            &member_id,
            crate::organization::invitation::TEST_LIFETIME_HOURS,
            test_cost(),
            ISSUED_AT + 2,
        )
        .await
        .expect("the link could not be made");

        assert_eq!(
            made.expires_at,
            ISSUED_AT + 2 + TEST_LIFETIME_MS,
            "a link the grant does not cut short lapses a week out"
        );
        assert_eq!(
            crate::organization::invitation::link::read(&made.link)
                .expect("the link could not be read")
                .kind,
            LinkKind::Machine
        );
        assert!(
            !made.link.contains(
                owner
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

        assert_eq!(held.id, owner.organization_id);
        assert_eq!(held.name, "Acme");
        assert_eq!(held.member_id, None, "the connect recorded a member");
        assert_eq!(held.role, None);
        assert_eq!(held.joined_at, ISSUED_AT + 3);

        let recorded = machine.selected().expect("the record");

        assert_eq!(recorded.member_id, None);

        // the wall on the machine that just connected: the password is the one they chose when
        // they opened their first link, and nothing here changed it.
        let credential = slot();
        let session =
            sign_in_by_username(&credentials, &store, &held, &username, CHOSEN, &credential)
                .await
                .expect("the member could not sign in on their next machine");

        assert_eq!(session.member_id, member_id);
        assert_eq!(session.role, permission::MEMBER);
        assert!(!session.must_change_password);
        assert!(
            credential.lock().expect("the slot").is_some(),
            "the sign-in did not fill the credential slot from the vault"
        );
    }

    /// **Effort 851, criteria 1 and 12, for a machine link.** A machine that holds another
    /// organization connects by the link, and holds both with the new one selected and the other's
    /// entry as it was. Once the organization is removed from it, the link that first added it is
    /// refused as already used and the record gains nothing; a new link for the same account
    /// admits the machine again.
    #[tokio::test]
    async fn a_machine_link_adds_beside_another_and_after_a_removal_only_a_new_link_admits() {
        let credentials = Memory::new();
        let directory = scratch("beside");
        let (store, owner, locator, member_id, _) = account(&credentials, &directory).await;
        let made = make_link(
            &store,
            &owner,
            no_platform(),
            &locator,
            &member_id,
            crate::organization::invitation::TEST_LIFETIME_HOURS,
            test_cost(),
            ISSUED_AT + 2,
        )
        .await
        .expect("the link could not be made");
        let machine_directory = scratch("beside-machine");
        let mut machine = fresh_machine(&machine_directory);
        let another = HeldOrganization {
            id: "another".to_string(),
            name: "Other".to_string(),
            verifying_key: locator.verifying_key.clone(),
            remote_url: "libsql://org-another.example".to_string(),
            machine_id: "machine-of-another".to_string(),
            member_id: Some("member-of-another".to_string()),
            ..HeldOrganization::default()
        };

        machine.hold(another.clone());
        machine.commit().expect("the record");

        let held = connect_on(&mut machine, &store, &made, &made.code, ISSUED_AT + 3)
            .await
            .expect("a machine holding another organization was refused");

        assert_eq!(
            machine
                .held_organizations
                .iter()
                .map(|held| held.id.as_str())
                .collect::<Vec<_>>(),
            vec!["another", owner.organization_id.as_str()]
        );
        assert_eq!(machine.selected(), Some(&held));
        assert_eq!(machine.held("another"), Some(&another));

        // removed from this machine: the entry goes, and the other organization is selected.
        machine.forget_held(&held.id, &[]);
        machine.commit().expect("the record");

        let record = std::fs::read(machine.path()).expect("the record");
        let refused = connect_on(&mut machine, &store, &made, &made.code, ISSUED_AT + 4).await;

        assert!(
            matches!(
                refused,
                Err(Error::Refused {
                    reason: RefusalReason::Consumed,
                    ..
                })
            ),
            "{refused:?}"
        );
        assert_eq!(
            std::fs::read(machine.path()).expect("the record"),
            record,
            "the spent link wrote the record"
        );
        assert_eq!(machine.held(&owner.organization_id), None);

        // a new link for the same account admits the machine again.
        let fresh = make_link(
            &store,
            &owner,
            no_platform(),
            &locator,
            &member_id,
            crate::organization::invitation::TEST_LIFETIME_HOURS,
            test_cost(),
            ISSUED_AT + 5,
        )
        .await
        .expect("the new link could not be made");
        let again = connect_on(&mut machine, &store, &fresh, &fresh.code, ISSUED_AT + 6)
            .await
            .expect("a new link did not admit the machine");

        assert_eq!(again.id, owner.organization_id);
        assert_eq!(machine.selected(), Some(&again));
        assert_eq!(machine.held_organizations.len(), 2);
    }

    /// Effort 828, requirement 20: **the link admits one machine, once, and lapses on its own.**
    ///
    /// A second machine opening the same pair is refused as already spent, before anything is
    /// recorded on it; a machine opening it a week later is refused as lapsed, before any key is
    /// derived; and a wrong code is refused with the one sentence a wrong code gets, which is
    /// `CODE_REFUSED` and never a comparison. **And the machine that spent it, opening it again,
    /// is refused as spent too** rather than as a machine holding an organization, which is the
    /// ordinary way a person meets this: they press the link in the message a second time. The
    /// machine holds the organization, so its wall is selected first (effort 851, requirement 13).
    #[tokio::test]
    async fn one_machine_once_and_a_lapsed_link_or_a_wrong_code_reaches_nothing() {
        let credentials = Memory::new();
        let directory = scratch("once");
        let (store, owner, locator, member_id, _) = account(&credentials, &directory).await;
        let made = make_link(
            &store,
            &owner,
            no_platform(),
            &locator,
            &member_id,
            crate::organization::invitation::TEST_LIFETIME_HOURS,
            test_cost(),
            ISSUED_AT + 2,
        )
        .await
        .expect("the link could not be made");

        // the wrong code, on a machine holding nothing: the tag fails and nothing is recorded.
        let wrong = scratch("once-wrong");
        let mut wrong_machine = fresh_machine(&wrong);
        let refusal = connect_on(&mut wrong_machine, &store, &made, "ZZZZZZ", ISSUED_AT + 3)
            .await
            .expect_err("a wrong code connected a machine");

        assert!(
            matches!(&refusal, Error::Refused { reason: crate::error::RefusalReason::CodeWrong, message } if message == CODE_REFUSED),
            "{refusal:?}"
        );
        assert!(
            wrong_machine.selected().is_none(),
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
            matches!(
                &refusal,
                Error::Refused {
                    reason: RefusalReason::Lapsed,
                    ..
                }
            ),
            "{refusal:?}"
        );
        assert!(late_machine.selected().is_none());

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
                        .half
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
        let refusal = connect_on(
            &mut second_machine,
            &store,
            &made,
            &made.code,
            ISSUED_AT + 5,
        )
        .await
        .expect_err("a spent link connected a second machine");

        assert!(
            matches!(
                &refusal,
                Error::Refused {
                    reason: RefusalReason::Consumed,
                    ..
                }
            ),
            "{refusal:?}"
        );
        assert!(
            second_machine.selected().is_none(),
            "a spent link recorded an organization"
        );

        // and the same pair opened again on the machine that spent it, which holds the
        // organization: **its wall, and the link refused as one that already connected a
        // machine** (effort 851, requirement 13, as the human settled it). The record is the entry
        // it was, and the sentence points at whoever keeps the accounts, never at a disconnect.
        let before = first_machine.selected().cloned().expect("the record");
        let refusal = connect_on(&mut first_machine, &store, &made, &made.code, ISSUED_AT + 6)
            .await
            .expect_err("a spent link opened again on the machine that spent it");

        assert!(
            matches!(
                &refusal,
                Error::Refused {
                    reason: RefusalReason::Consumed,
                    ..
                }
            ),
            "{refusal:?}"
        );
        assert!(
            refusal
                .to_string()
                .contains("ask whoever keeps the accounts"),
            "the refusal points somewhere the person cannot reach: {refusal}"
        );
        assert_eq!(first_machine.selected(), Some(&before));
    }

    /// Effort 851, requirement 38 and criterion 38: **a locked member's machine link keeps their
    /// lock on the machine it connects, and an unlocked member's latches nothing.**
    ///
    /// Sami opened their invitation, so their account is locked, and a link made for them now names
    /// them inside its seal. Before it is opened, sami deletes their own lock row and the owner's
    /// marker, so nothing in the replica says they are locked and a machine that never saw the
    /// marker would read them unlocked. The new machine latches their own lock all the same: sami
    /// signs in there and is refused an act of the organization as locked. The owner's verifying
    /// unlock is what lets them act, and a link made for them then names nobody and latches
    /// nothing.
    #[tokio::test]
    async fn a_locked_members_machine_link_keeps_their_lock_and_an_unlocked_ones_latches_nothing() {
        let credentials = Memory::new();
        let directory = scratch("locked-link");
        let (store, owner, locator, member_id, username) = account(&credentials, &directory).await;
        let made = make_link(
            &store,
            &owner,
            no_platform(),
            &locator,
            &member_id,
            crate::organization::invitation::TEST_LIFETIME_HOURS,
            test_cost(),
            ISSUED_AT + 2,
        )
        .await
        .expect("the link could not be made");
        let sealed = |made: &MadeLink| {
            let link = JoinLink::decode(&made.link).expect("the link");

            open_payload(
                &made.code,
                &link.locator(),
                &link.half,
                &link.credential,
                test_cost(),
            )
            .expect("the code did not open the payload")
        };

        assert_eq!(
            sealed(&made).locked_member.as_deref(),
            Some(member_id.as_str()),
            "a locked member's link does not say so"
        );

        // sami's own row and the owner's marker, deleted from the replica the link pulls.
        for id in [&member_id, &owner.member_id] {
            store
                .connection()
                .execute(
                    "DELETE FROM \"member_lock\" WHERE \"member_id\" = ?",
                    vec![turso::Value::Text(id.clone())],
                )
                .await
                .expect("the row deleted");
        }

        let sami = store
            .member(&owner.verifying_key, &member_id)
            .await
            .expect("the row")
            .expect("sami");

        assert!(
            !store
                .member_locked(&owner.verifying_key, &sami, false)
                .await
                .expect("the lock"),
            "the replica still holds something that locks sami"
        );

        let next = scratch("locked-link-next");
        let mut machine = fresh_machine(&next);

        connect_on(&mut machine, &store, &made, &made.code, ISSUED_AT + 3)
            .await
            .expect("the next machine did not connect");

        // the record as the next launch reads it back.
        let held = Persisted::<RemoteSyncStore>::load(machine.path().to_path_buf())
            .expect("the record")
            .selected()
            .cloned()
            .expect("the organization");

        assert_eq!(held.member_id, None, "the connect recorded a member");
        assert_eq!(
            held.own_lock_latched,
            vec![member_id.clone()],
            "the connect did not latch sami's own lock"
        );

        let session = sign_in_by_username(&credentials, &store, &held, &username, CHOSEN, &slot())
            .await
            .expect("sami could not sign in on the next machine");

        assert!(session.own_lock_latched, "the wall forgot sami's own lock");

        let refused = unlock_member(&store, &session, &owner.member_id, ISSUED_AT + 4)
            .await
            .expect_err("a locked member acted");

        assert!(
            matches!(
                refused,
                Error::Refused {
                    reason: RefusalReason::Locked,
                    ..
                }
            ),
            "{refused:?}"
        );

        // a verifying unlock reads before the latch.
        unlock_member(&store, &owner, &member_id, ISSUED_AT + 5)
            .await
            .expect("the owner could not unlock sami");

        let session = sign_in_by_username(&credentials, &store, &held, &username, CHOSEN, &slot())
            .await
            .expect("sami could not sign in again");

        acting_row(&store, &session)
            .await
            .expect("an unlocked member read as locked");

        // and an unlocked member's link names nobody and latches nothing.
        let unlocked = make_link(
            &store,
            &owner,
            no_platform(),
            &locator,
            &member_id,
            crate::organization::invitation::TEST_LIFETIME_HOURS,
            test_cost(),
            ISSUED_AT + 6,
        )
        .await
        .expect("the second link could not be made");

        assert_eq!(sealed(&unlocked).locked_member, None);

        let mut third = fresh_machine(&scratch("locked-link-third"));
        let held = connect_on(&mut third, &store, &unlocked, &unlocked.code, ISSUED_AT + 7)
            .await
            .expect("the third machine did not connect");

        assert_eq!(
            held.own_lock_latched,
            Vec::<String>::new(),
            "an unlocked member's link latched"
        );
    }

    /// The organization's replica in `from`, copied into `to`: a machine's own replica, as a
    /// link's credential would have pulled it, since nothing here serves a pull.
    fn replica_copied(from: &std::path::Path, to: &std::path::Path) {
        for name in replica_files_in(from) {
            std::fs::copy(from.join(&name), to.join(&name)).expect("the copy");
        }
    }

    /// Every file in `directory` that is an organization's replica or one of its sidecars.
    fn replica_files_in(directory: &std::path::Path) -> Vec<String> {
        std::fs::read_dir(directory)
            .expect("the directory")
            .filter_map(|entry| {
                entry
                    .expect("an entry")
                    .file_name()
                    .to_str()
                    .map(str::to_string)
            })
            .filter(|name| name.starts_with("org-"))
            .collect()
    }

    /// A replica of the organization opened from what `directory` holds, with no remote.
    async fn replica_in(directory: &std::path::Path, organization_id: &str) -> OrganizationStore {
        OrganizationStore::open(
            crate::clock::System::shared(),
            &OrganizationStore::replica_path(&directory.join("app.db"), organization_id),
            None,
            || async { Err(turso::Error::Misuse("no remote".into())) },
        )
        .await
        .expect("the replica did not open")
    }

    /// The machine connect over a replica of the machine's own, beside its record: what the
    /// application hands it, rather than the file every other test here shares.
    async fn connect_over_its_own(
        machine: &mut Persisted<RemoteSyncStore>,
        directory: &std::path::Path,
        replica: OrganizationStore,
        made: &MadeLink,
        now: i64,
    ) -> Result<HeldOrganization, Error> {
        connect(
            move |_| async move { Ok::<_, Error>(replica) },
            machine,
            &directory.join("app.db"),
            &JoinLink::decode(&made.link).expect("the machine link"),
            &made.code,
            test_cost(),
            now,
            false,
        )
        .await
    }

    /// Effort 851, requirement 10 and criterion 10, for a machine link: **a link and its code
    /// admit one machine, once.**
    ///
    /// Used once, then opened again on the machine that used it and on a machine holding nothing:
    /// each second opening is refused as already used, the machine's record is the same file byte
    /// for byte, and the remembered keys are as they were (a machine link opens no vault and is
    /// handed no credential store, so this is the outcome by construction, asserted all the same).
    /// **The machine that holds the organization keeps its replica**; the machine that holds
    /// nothing is left with no `org-*` file, though the link's credential reached the
    /// organization and pulled it.
    #[tokio::test]
    async fn a_spent_machine_link_records_nothing_on_either_machine() {
        let credentials = Memory::new();
        let directory = scratch("spent-machine");
        let (store, owner, locator, member_id, _) = account(&credentials, &directory).await;
        let made = make_link(
            &store,
            &owner,
            no_platform(),
            &locator,
            &member_id,
            crate::organization::invitation::TEST_LIFETIME_HOURS,
            test_cost(),
            ISSUED_AT + 2,
        )
        .await
        .expect("the link could not be made");
        let account = format!("{}:{member_id}", owner.organization_id);
        let filed = credentials
            .get(MEMBER_KEY_SERVICE, &account)
            .expect("the store would not answer");

        // used once, on the machine it was made for.
        let first = scratch("spent-machine-first");
        let mut first_machine = fresh_machine(&first);

        connect_on(&mut first_machine, &store, &made, &made.code, ISSUED_AT + 3)
            .await
            .expect("the machine did not connect");

        // opened again on that machine, over the replica it works from: the organization is held,
        // so it is selected and the link refused as already used, with nothing written (effort
        // 851, requirements 10 and 13).
        replica_copied(&directory, &first);

        let theirs = replica_in(&first, &owner.organization_id).await;
        let record = std::fs::read(first.join(RemoteSync::FILENAME)).expect("the record");
        let again =
            connect_over_its_own(&mut first_machine, &first, theirs, &made, ISSUED_AT + 4).await;

        assert!(
            matches!(
                &again,
                Err(Error::Refused {
                    reason: RefusalReason::Consumed,
                    ..
                })
            ),
            "{again:?}"
        );
        assert_eq!(
            std::fs::read(first.join(RemoteSync::FILENAME)).expect("the record"),
            record,
            "the second opening changed the record"
        );
        assert!(
            !replica_files_in(&first).is_empty(),
            "a link for the organization this machine holds took its replica away"
        );

        // and on a machine holding nothing, with a replica the link's credential pulled.
        let elsewhere = scratch("spent-machine-elsewhere");

        replica_copied(&directory, &elsewhere);

        let pulled = replica_in(&elsewhere, &owner.organization_id).await;
        let mut machine = fresh_machine(&elsewhere);
        let record = std::fs::read(elsewhere.join(RemoteSync::FILENAME)).expect("the record");

        assert!(!replica_files_in(&elsewhere).is_empty());

        let refused =
            connect_over_its_own(&mut machine, &elsewhere, pulled, &made, ISSUED_AT + 5).await;

        assert!(
            matches!(
                refused,
                Err(Error::Refused {
                    reason: RefusalReason::Consumed,
                    ..
                })
            ),
            "{refused:?}"
        );
        assert!(machine.selected().is_none(), "the spent link recorded");
        assert_eq!(
            std::fs::read(elsewhere.join(RemoteSync::FILENAME)).expect("the record"),
            record,
            "the spent link changed the record"
        );
        assert_eq!(
            replica_files_in(&elsewhere),
            Vec::<String>::new(),
            "the spent link left the replica it pulled"
        );
        assert_eq!(
            credentials
                .get(MEMBER_KEY_SERVICE, &account)
                .expect("the store would not answer"),
            filed,
            "a machine link filed a key"
        );
    }

    /// The spec's recorded risk, written as a test: **the row is unsigned, so anybody who can
    /// write the replica can reopen a spent link.**
    ///
    /// Clearing `consumed_at` by hand puts one more machine through, and where that machine lands
    /// is the wall, where the member's password is still the whole of what admits. That is the
    /// limit the effort accepted rather than a hole to be patched here: nothing certifies the row,
    /// so the alternative was no row at all and no single use.
    #[tokio::test]
    async fn a_rewritten_row_reopens_a_spent_link_and_the_machine_still_lands_at_the_wall() {
        let credentials = Memory::new();
        let directory = scratch("rewritten");
        let (store, owner, locator, member_id, username) = account(&credentials, &directory).await;
        let made = make_link(
            &store,
            &owner,
            no_platform(),
            &locator,
            &member_id,
            crate::organization::invitation::TEST_LIFETIME_HOURS,
            test_cost(),
            ISSUED_AT + 2,
        )
        .await
        .expect("the link could not be made");
        let id = JoinLink::decode(&made.link).expect("the link").half.id;

        let first = scratch("rewritten-first");
        let mut first_machine = fresh_machine(&first);

        connect_on(&mut first_machine, &store, &made, &made.code, ISSUED_AT + 3)
            .await
            .expect("the next machine did not connect");

        // the row as anybody holding the database can write it: no signature stands in the way.
        store
            .write_machine_link(&MachineLinkRecord {
                id: id.clone(),
                member_id: member_id.clone(),
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
        sign_in_by_username(&credentials, &store, &held, &username, CHOSEN, &slot())
            .await
            .expect("the member could not sign in on the reopened machine");

        assert!(
            sign_in_by_username(
                &credentials,
                &store,
                &held,
                &username,
                "not their password",
                &slot()
            )
            .await
            .is_err(),
            "the reopened machine admitted a wrong password"
        );
    }

    /// Effort 828, requirement 2 and criterion 2: **what the link seals is the maker's own grant,
    /// and it dies within four weeks.**
    ///
    /// The payload carries the credential the session holds and no vault password, because this
    /// kind opens no vault. Where that grant dies before the week is out, the link and its row
    /// lapse with it, so a link never outlives what it carries and the panel prints the true date.
    #[tokio::test]
    async fn a_machine_link_seals_the_makers_own_grant_and_lapses_no_later_than_it_does() {
        let credentials = Memory::new();
        let directory = scratch("grant");
        let (store, owner, locator, member_id, _) = account(&credentials, &directory).await;
        let now = ISSUED_AT + 2;
        // a round moment, since a credential spells its expiry in seconds and a link reads it
        // back in milliseconds.
        let dies_at = ISSUED_AT + 3 * 24 * 60 * 60 * 1000;
        let grant = grant_dying_at(dies_at);

        *owner.organization_credential.lock().expect("the slot") = Some(grant.clone());

        let made = make_link(
            &store,
            &owner,
            no_platform(),
            &locator,
            &member_id,
            crate::organization::invitation::TEST_LIFETIME_HOURS,
            test_cost(),
            now,
        )
        .await
        .expect("the link could not be made");
        let link = JoinLink::decode(&made.link).expect("the link");
        let half = &link.half;
        let payload: LinkPayload = open_payload(
            &made.code,
            &link.locator(),
            half,
            &link.credential,
            test_cost(),
        )
        .expect("the code did not open the payload");

        assert_eq!(
            payload.credential, grant,
            "the link sealed a credential that is not the session's"
        );
        assert_eq!(
            payload.vault_password, None,
            "the link seals a vault password, and this kind opens no vault"
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
        let second = make_link(
            &store,
            &owner,
            no_platform(),
            &locator,
            &member_id,
            crate::organization::invitation::TEST_LIFETIME_HOURS,
            test_cost(),
            now + 1,
        )
        .await
        .expect("a second link could not be made");

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

    /// Ticket 20, the review's fifth finding: **a link made before a removal admits nobody
    /// afterwards, and a machine that is refused pulls nothing.**
    ///
    /// The connect judged the row's expiry and whether it had been spent, and read no role at all,
    /// so a member let go of on Monday went on connecting machines with the link they were handed
    /// on Friday and pulling a replica of the whole directory with the credential inside it. Two
    /// things close it and both are checked here: the removal takes the open row away, which is
    /// what refuses the link in the ordinary case; and where a row survives anyway, the account is
    /// read off the verified member rows and a removed one is refused by name before anything is
    /// recorded.
    #[tokio::test]
    async fn a_link_made_before_a_removal_admits_nobody_and_records_nothing() {
        let credentials = Memory::new();
        let directory = scratch("removed");
        let (store, mut owner, locator, member_id, _) = account(&credentials, &directory).await;
        let made = make_link(
            &store,
            &owner,
            no_platform(),
            &locator,
            &member_id,
            crate::organization::invitation::TEST_LIFETIME_HOURS,
            test_cost(),
            ISSUED_AT + 2,
        )
        .await
        .expect("the link could not be made");
        let half = JoinLink::decode(&made.link).expect("the link").half;

        crate::organization::member::removal::remove_member(
            &store,
            &mut owner,
            no_platform(),
            "org-whatever",
            &member_id,
            false,
            ISSUED_AT + 3,
        )
        .await
        .expect("the member could not be removed");

        assert!(
            store
                .machine_link(&half.id)
                .await
                .expect("the row")
                .is_none(),
            "the removal left the link's row standing"
        );

        let theirs = scratch("removed-machine");
        let mut machine = fresh_machine(&theirs);
        let refused = connect_on(&mut machine, &store, &made, &made.code, ISSUED_AT + 4)
            .await
            .expect_err("a removed member's link connected a machine");

        assert!(
            matches!(
                refused,
                Error::Refused {
                    reason: RefusalReason::Revoked,
                    ..
                }
            ),
            "{refused:?}"
        );
        assert!(machine.selected().is_none(), "the machine recorded one");

        // and the row written back, which is what a replica somebody rewrote carries: the account
        // itself is what refuses now, read off the rows the link's own key judges.
        store
            .write_machine_link(&MachineLinkRecord {
                id: half.id.clone(),
                member_id: member_id.clone(),
                expires_at: ISSUED_AT + TEST_LIFETIME_MS,
                consumed_at: None,
                created_at: ISSUED_AT + 2,
            })
            .await
            .expect("the row could not be written back");

        let refused = connect_on(&mut machine, &store, &made, &made.code, ISSUED_AT + 5)
            .await
            .expect_err("a rewritten row let a removed member connect");

        assert!(
            matches!(
                refused,
                Error::Refused {
                    reason: RefusalReason::Revoked,
                    ..
                }
            ),
            "{refused:?}"
        );
        assert!(
            refused.to_string().contains("Acme"),
            "the refusal names nothing the person can recognise: {refused}"
        );
        assert!(
            !refused.to_string().contains("sami"),
            "the refusal names the account: {refused}"
        );
        assert!(machine.selected().is_none(), "the machine recorded one");
    }

    /// The other half of the same finding: **a reset takes an account's open machine links with
    /// it.**
    ///
    /// A reset builds the vault again under a password nobody is handed, so what restores the
    /// account is the link made after it. A link made before it carries a credential that still
    /// lives and a row nothing had spent, and one way in stands at a time.
    #[tokio::test]
    async fn a_link_made_before_a_reset_admits_nobody_afterwards() {
        let credentials = Memory::new();
        let directory = scratch("reset");
        let (store, owner, locator, member_id, _) = account(&credentials, &directory).await;
        let made = make_link(
            &store,
            &owner,
            no_platform(),
            &locator,
            &member_id,
            crate::organization::invitation::TEST_LIFETIME_HOURS,
            test_cost(),
            ISSUED_AT + 2,
        )
        .await
        .expect("the link could not be made");
        let half = JoinLink::decode(&made.link).expect("the link").half;

        crate::organization::invitation::unset_password(
            &store,
            &owner,
            no_platform(),
            &member_id,
            test_cost(),
            ISSUED_AT + 3,
        )
        .await
        .expect("the password could not be unset");

        assert!(
            store
                .machine_link(&half.id)
                .await
                .expect("the row")
                .is_none(),
            "the reset left the link's row standing"
        );

        let theirs = scratch("reset-machine");
        let mut machine = fresh_machine(&theirs);
        let refused = connect_on(&mut machine, &store, &made, &made.code, ISSUED_AT + 4)
            .await
            .expect_err("a link made before a reset connected a machine");

        assert!(
            matches!(
                refused,
                Error::Refused {
                    reason: RefusalReason::Revoked,
                    ..
                }
            ),
            "{refused:?}"
        );
        assert!(machine.selected().is_none(), "the machine recorded one");
    }

    /// Everything the organization database holds, table by table and row by row, as a test
    /// compares it before and after a refusal: a write anywhere changes it.
    async fn contents(store: &OrganizationStore) -> Vec<(String, Vec<Vec<turso::Value>>)> {
        let mut contents = Vec::new();

        for table in store.tables().await.expect("the tables") {
            let mut rows = store
                .connection()
                .query(&format!("SELECT * FROM \"{table}\" ORDER BY rowid"), ())
                .await
                .expect("the rows");
            let mut values = Vec::new();

            while let Some(row) = rows.next().await.expect("a row") {
                values.push(
                    (0..row.column_count())
                        .map(|index| row.get_value(index).expect("a value"))
                        .collect(),
                );
            }

            contents.push((table, values));
        }

        contents
    }

    /// Turn this build's organization into format 1 as the main branch shapes it, keeping its
    /// rows: no `format`, `role`, `certificate` or `revocation` table, the role word and the
    /// seven-act mask on the member row where this format has a role, an override and a removal,
    /// and format 1's `administrator_certificate` with its unsigned `revoked_at`. The refusal is
    /// made before any row is read, so what the rows say does not matter; the shape is what every
    /// way in has to recognise, and it is checked against the main branch's here.
    async fn as_format_one(store: &OrganizationStore) {
        for statement in [
            "DROP TABLE \"format\"",
            "DROP TABLE \"workspace_override\"",
            "DROP TABLE \"machine_sign_out\"",
            "DROP TABLE \"machine_name\"",
            "DROP TABLE \"organization_name\"",
            "DROP TABLE \"member_lock\"",
            "DROP TABLE \"role\"",
            "DROP TABLE \"certificate\"",
            "DROP TABLE \"revocation\"",
            "ALTER TABLE \"member\" ADD COLUMN \"role\" TEXT NOT NULL DEFAULT 'member'",
            "ALTER TABLE \"member\" ADD COLUMN \"permissions\" INTEGER NOT NULL DEFAULT 0",
            "ALTER TABLE \"member\" DROP COLUMN \"role_id\"",
            "ALTER TABLE \"member\" DROP COLUMN \"override\"",
            "ALTER TABLE \"member\" DROP COLUMN \"removed_at\"",
            "CREATE TABLE \"administrator_certificate\" (\
                \"id\" TEXT PRIMARY KEY NOT NULL, \
                \"member_id\" TEXT NOT NULL, \
                \"signing_public_key\" BLOB NOT NULL, \
                \"signature_by_organization_key\" BLOB NOT NULL, \
                \"issued_at\" TEXT NOT NULL, \
                \"revoked_at\" TEXT)",
        ] {
            store
                .connection()
                .execute(statement, ())
                .await
                .unwrap_or_else(|error| panic!("{statement}: {error}"));
        }

        // the main branch's eleven tables, and its member row's columns.
        assert_eq!(
            store.tables().await.expect("the tables"),
            vec![
                "administrator_certificate",
                "grant",
                "invitation",
                "machine",
                "machine_link",
                "mark",
                "member",
                "migration_lease",
                "organization",
                "succession",
                "workspace",
            ]
        );

        let mut columns = store.columns_of("member").await.expect("the columns");
        let mut main = vec![
            "id",
            "username_sealed",
            "public_key",
            "signing_public_key",
            "sealed_secret_key",
            "sealed_content_key",
            "kdf_salt",
            "kdf_params",
            "role",
            "permissions",
            "must_change_password",
            "certificate_id",
            "signature",
            "created_at",
            "updated_at",
            "session_epoch",
            "owner_seed_sealed",
        ];

        columns.sort();
        main.sort_unstable();

        assert_eq!(columns, main);
        assert!(store.is_older().await.expect("the format"));
    }

    /// Effort 838, tickets 22 and 23, at the machine link: **an organization an earlier version
    /// made, opened first by a member's next machine, waits for its owner, and nothing is written
    /// to it.**
    ///
    /// The organization is this build's own turned into format 1 in the main branch's shape
    /// ([`as_format_one`]). The link and its code open, and the connect is refused before the
    /// link's row is read: the organization is as it was, the link unspent, and the machine
    /// records nothing. *It took the `format` table away from this build's shape until ticket 23,
    /// which is an upgrade's last row missing rather than format 1.*
    #[tokio::test]
    async fn an_older_organization_opened_first_by_a_machine_link_waits_for_its_owner() {
        let credentials = Memory::new();
        let directory = scratch("older");
        let (store, owner, locator, member_id, _) = account(&credentials, &directory).await;
        let made = make_link(
            &store,
            &owner,
            no_platform(),
            &locator,
            &member_id,
            crate::organization::invitation::TEST_LIFETIME_HOURS,
            test_cost(),
            ISSUED_AT + 2,
        )
        .await
        .expect("the link could not be made");

        as_format_one(&store).await;

        let before = contents(&store).await;
        let mut machine = fresh_machine(&scratch("older-machine"));
        let refused = connect_on(&mut machine, &store, &made, &made.code, ISSUED_AT + 3).await;

        assert!(
            matches!(
                &refused,
                Err(Error::Refused {
                    reason: RefusalReason::OrganizationOlder,
                    message,
                }) if message.contains("waits for its owner")
            ),
            "{refused:?}"
        );
        assert_eq!(
            contents(&store).await,
            before,
            "the refusal wrote to the organization"
        );
        assert!(machine.selected().is_none());
    }
}
