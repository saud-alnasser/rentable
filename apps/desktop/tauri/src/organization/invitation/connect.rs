//! connecting a machine to an organization by its link: the machine learns where the
//! organization is and records it, and nobody has signed in yet.
//!
//! **A connect opens no vault and records no member** (effort 824, requirement 18). The link
//! carries the organization's id, name, remote and verifying key, and a credential over sealed
//! rows; what a connect does with it is reach the replica, check that the rows it finds are
//! the organization's, and write those four facts to this machine's record with `member_id` and
//! `role` empty. The person is admitted at the wall, by username and password, and that sign-in
//! is what fills the two. *819's join and restore did both in one step, from a link that carried
//! the invitation's half; requirement 18 retires them as ways through the wall.*
//!
//! **A connect takes a locator and the credential its caller unsealed** (effort 828, requirement
//! 16). It is handed where the organization is and what judges its rows, with no way to read a
//! credential out of a link's text, because there is no link left whose credential can be read:
//! every link seals its payload under the code somebody read out, and the act that takes the code
//! is what opens it and hands the credential here. *A link carrying a legible credential, the
//! organization's own, reached this function directly and connected a machine with no code, and a
//! sealed one arriving here was refused for want of one; requirement 16 retired that link, and the
//! refusal went with it because the type no longer admits what it guarded against.*
//!
//! **What the machine learns from the link is pinned from the link.** The verifying key is
//! written as the link spelled it and every later verification uses that copy, never one read
//! out of the database it judges; `authority/` says why the key travels this way. The one read
//! made here, the organization row, is compared against the pinned key rather than trusted.
//!
//! **A machine holds as many organizations as its people need, and a connect adds one** (effort
//! 851, requirement 1): what is recorded is a new entry in the record's list, and it is selected.
//! **A link for an organization already held adds nothing** (requirement 13): [`selected_if_held`]
//! selects its entry before anything is opened over a live replica, and each act judges the link
//! from there; only a reset link for one of its members is let through (`join::accept_while`). *A
//! connect while one organization was held was refused until effort 851, and reaching another was a
//! disconnect first.*

use std::path::Path;

use crate::{
    database::floor::Standing,
    diagnostics,
    error::{Error, RefusalReason},
    machine::RemoteSyncStore,
    persisted::Persisted,
};

use crate::organization::{
    HeldOrganization,
    invitation::{link::Locator, random_id},
    session,
    store::{FORMAT_VERSION, OrganizationStore, leave_no_replica},
};

/// Record the organization `locator` names on this machine, having reached its replica.
///
/// `store` is a replica of the organization the locator names, opened with `credential` and
/// pulled. The organization row is read once and has to carry the locator's id and the key it
/// pins; a replica saying otherwise is another organization's, or one whose rows were rewritten,
/// and is refused before anything is recorded. What is written to `machine` is what the locator
/// carried and no member.
///
/// **The credential has to be in hand** (effort 828, requirement 16). It is asked for rather than
/// read off a link, because there is no link left that carries one legibly: the caller opened a
/// sealed payload with the code to get it, and a blank one means the replica above was reached
/// with nothing and is refused rather than recorded.
///
/// **So is an organization of another format** (effort 838, requirement 11): one an earlier or a
/// newer version of the application made is refused by name before its organization row is read,
/// and nothing is recorded or registered.
///
/// **What the machine records, and the registry row beside it, are [`record`]'s**, which is the
/// one writer both ways of starting to hold an organization go through. A link connect records no
/// member, because nobody has signed in yet and the wall is what follows.
pub async fn connect(
    store: &OrganizationStore,
    machine: &mut Persisted<RemoteSyncStore>,
    locator: &Locator,
    credential: &str,
    now: i64,
) -> Result<HeldOrganization, Error> {
    // the replica the caller pulled is judged against the floors before anything is selected or
    // recorded (effort 857, ticket 04): below the read floor it is refused by name.
    let standing = store.refuse_another_format().await?;

    // an organization already held is selected and nothing is recorded a second time: its entry
    // carries the member and the machine this machine already has there.
    if let Some(held) = selected_if_held(machine, &locator.organization_id)? {
        return Ok(held);
    }

    if credential.trim().is_empty() {
        return Err(Error::refused(
            RefusalReason::LinkUnreadable,
            format!(
                "nothing opened a credential to read {}'s records with",
                locator.organization_name
            ),
        ));
    }

    // an organization another version of the application made is refused before its row is read
    // and before this machine records or registers anything (effort 838, requirement 11); and one
    // this build may read and not write, since recording it registers this machine in it (effort
    // 857, ticket 04).
    if standing != Standing::Writable {
        store.refuse_unwritable().await?;
    }

    let verifying_key = locator.verifying_key_bytes()?;
    let organization = store
        .organization()
        .await?
        .ok_or_else(|| Error::Integrity {
            message: format!(
                "the database this link reaches holds no organization row for {}",
                locator.organization_name
            ),
        })?;

    if organization.id != locator.organization_id {
        return Err(Error::Integrity {
            message: format!(
                "this link names {} and the database it reaches belongs to another organization",
                locator.organization_name
            ),
        });
    }

    if organization.verifying_key != verifying_key {
        return Err(Error::Integrity {
            message: format!(
                "the rows this link reaches for {} are not the ones its key judges",
                locator.organization_name
            ),
        });
    }

    record(
        store,
        machine,
        OrganizationFacts {
            id: locator.organization_id.clone(),
            name: locator.organization_name.clone(),
            verifying_key: locator.verifying_key.clone(),
            remote_url: locator.remote_url.clone(),
        },
        None,
        false,
        now,
    )
    .await
}

/// The four facts a machine keeps about the organization it holds, whichever way it learned them.
///
/// A link spells all four (`connect`); a machine connecting on the owner's Turso account reads the
/// first and the last off the listing, the key off the password the owner typed, and the name out
/// of `name_sealed` once a vault has opened (`setup::connect_existing`). What is done with them
/// afterwards is the same either way, which is why they are gathered rather than passed as four
/// arguments to two callers.
#[derive(Clone, Debug)]
pub struct OrganizationFacts {
    pub id: String,
    pub name: String,
    /// base64url, as a link spells it and as [`HeldOrganization`] keeps it.
    pub verifying_key: String,
    pub remote_url: String,
}

/// Start holding an organization: put this machine in the organization's registry and write the
/// record that says it holds one.
///
/// **The one place `HeldOrganization` is written outside the first run.** Two ways reach it, a
/// link and the owner's own Turso account, and what a machine records has to be the same either
/// way: nothing on the record says how it arrived, and a reader that could tell would be reading
/// a difference nobody meant to create.
///
/// **The machine draws its id here** (effort 828, requirement 15). This is the moment it starts
/// holding the organization, so it is where the id it will keep is drawn, and the registry row
/// goes in before the record that names it: a record naming a machine the organization does not
/// know is what a failed write would leave behind.
///
/// `member` is the member and role signed in on this machine already, which is `None` for a
/// connect by link, since nobody has signed in yet, and the owner for a connect on the account,
/// where the session is what proved the machine could connect at all.
///
/// `consented` is whether the organization was found through the pending Turso consent, which is
/// the connect on the owner's account and never a link: the Turso organization that consent is over
/// then goes into the entry (`RemoteSyncStore::hold_consented`), and otherwise it stays pending.
pub async fn record(
    store: &OrganizationStore,
    machine: &mut Persisted<RemoteSyncStore>,
    facts: OrganizationFacts,
    member: Option<(&str, &str)>,
    consented: bool,
    now: i64,
) -> Result<HeldOrganization, Error> {
    let machine_id = random_id()?;

    store
        .register_machine(&machine_id, member.map(|(id, _)| id), now)
        .await?;

    if !store.push().await {
        diagnostics::warn("organization.machine.registeredNotYetSent")
            .with("organization", facts.id.as_str())
            .write();
    }

    // the owner's connect is a sign-in, and acknowledges what it finds for this machine (effort
    // 846, requirement 10); a connect by link has nobody signed in yet to acknowledge it for.
    let machine_signed_out = match member {
        Some((member_id, _)) => {
            session::sign_outs_acknowledged(store, &machine_id, member_id).await?
        }
        None => 0,
    };
    let held = HeldOrganization {
        id: facts.id,
        name: facts.name,
        verifying_key: facts.verifying_key,
        remote_url: facts.remote_url,
        machine_id,
        member_id: member.map(|(id, _)| id.to_string()),
        role: member.map(|(_, role)| role.to_string()),
        joined_at: now,
        // both callers refused another format before they came here, so what this machine has
        // read is this build's (effort 838, ticket 25).
        format: Some(FORMAT_VERSION),
        machine_signed_out,
        // a Turso organization the owner's consent was looked up over goes into the entry as it
        // is recorded, below; a link carries none.
        turso_organization: None,
        workspace_id: None,
        name_signed: false,
        name_signed_at: 0,
        lock_marked: false,
        own_lock_latched: Vec::new(),
    };

    if consented {
        machine.hold_consented(held.clone());
    } else {
        machine.hold(held.clone());
    }

    machine.commit()?;

    // what was recorded, which is the entry with whatever `hold_consented` gave it.
    let held = machine.held(&held.id).cloned().unwrap_or(held);

    diagnostics::info("organization.connected")
        .with("organization", held.id.as_str())
        .write();

    Ok(held)
}

/// A link act refused after it reached the organization's replica: the replica it pulled is taken
/// away where this machine does not hold that organization, and the refusal goes back as it was.
///
/// **Both link acts end here on every refusal past the reach** (effort 851, requirement 10). An
/// invitation link and a machine link are each judged on the replica their credential reached, so
/// a spent, lapsed or revoked link, a wrong password inside the payload, or an organization of
/// another format is refused with the replica already on disk; on a machine that holds nothing,
/// or holds another organization, that file is a copy of every sealed row of an organization the
/// machine was refused, and [`leave_no_replica`] takes it away. The caller has let its store go
/// before calling, for the reason `leave_no_replica` gives.
///
/// **A machine holding this organization keeps its replica**, whatever was refused: that file is
/// the one the machine works from, and a link for its own organization opened again is the
/// ordinary way somebody meets a spent one. The record is read as it stands at the refusal, so an
/// act that recorded the organization before it failed leaves the replica with the record that
/// names it.
pub(crate) fn refused_after_reaching(
    machine: &RemoteSyncStore,
    database_path: &Path,
    organization_id: &str,
    refusal: Error,
) -> Error {
    let holds_it = machine.held(organization_id).is_some();

    if !holds_it {
        leave_no_replica(database_path, organization_id);
    }

    refusal
}

/// Select the organization `organization_id` where this machine already holds it, and answer its
/// entry; answer nothing where it does not (effort 851, requirement 13).
///
/// **What every way of adding an organization asks first, before anything is opened.** A link, a
/// machine link and a connect on the owner's account each name an organization; one this machine
/// holds already is not added again and the wall opens on it, and what each act does next is its
/// own: a connect on the account admits nothing, a machine link is refused as already used, and an
/// invitation link is judged on the held replica, letting a reset through. Answering here, before
/// anything is opened and with any session signed out by the command, is what keeps a second store
/// from opening over a live replica of an organization this machine holds. The record is written
/// only where the selection moved.
pub(crate) fn selected_if_held(
    machine: &mut Persisted<RemoteSyncStore>,
    organization_id: &str,
) -> Result<Option<HeldOrganization>, Error> {
    if machine.held(organization_id).is_none() {
        return Ok(None);
    }

    if machine.select(organization_id) {
        machine.commit()?;
    }

    diagnostics::info("organization.alreadyHeld")
        .with("organization", organization_id)
        .write();

    Ok(machine.held(organization_id).cloned())
}

/// Whether this machine holds the organization `organization_id`, selecting it as
/// [`selected_if_held`] does where nobody is signed in here (effort 851, requirement 13).
///
/// **The selection waits where a session is open** (effort 851, review). Where nobody is in, a
/// link for a held organization opens its wall whatever the link turns out to be. With somebody
/// signed in, the selection is the open organization's, and moving it would carry the current
/// workspace off the one in use while the session stayed on it; so the link is judged on what the
/// record holds, the selection moves only where the link goes through, at [`connect`], and a
/// refused link leaves the session, the selection and the wall as they were.
pub(crate) fn held_here(
    machine: &mut Persisted<RemoteSyncStore>,
    organization_id: &str,
    session_open: bool,
) -> Result<bool, Error> {
    if session_open {
        return Ok(machine.held(organization_id).is_some());
    }

    Ok(selected_if_held(machine, organization_id)?.is_some())
}

/// Take back the registry row [`record`] wrote for `held`, where the act that recorded it is
/// undone before anybody was admitted (effort 851, review): the row went out with the push that
/// followed it, so it is deleted and the delete pushed, and the same link opened again registers
/// this machine once rather than twice.
///
/// Best effort, as the undo it is part of is: a row that could not be deleted goes to the
/// diagnostics log, and a delete that could not be sent goes with the next push.
pub(crate) async fn unregistered(store: &OrganizationStore, held: &HeldOrganization) {
    if let Err(error) = store.unregister_machine(&held.machine_id).await {
        diagnostics::error("organization.machine.notUnregistered")
            .with("organization", held.id.as_str())
            .with("error", error.to_string())
            .write();

        return;
    }

    if !store.push().await {
        diagnostics::warn("organization.machine.unregisteredNotYetSent")
            .with("organization", held.id.as_str())
            .write();
    }
}

#[cfg(test)]
mod tests {
    use crate::credential::{CredentialStore, Memory};

    use std::sync::{Arc, Mutex};

    use serde_json::json;

    use super::connect;
    use crate::test::scratch;
    use crate::{
        error::Error,
        machine::RemoteSyncStore,
        organization::{
            HeldOrganization,
            invitation::{join::admit, link::Locator},
            member::vault::KdfParams,
            role::permission,
            session::{CredentialSlot, machine_seen},
            setup::{CreateOrganization, Remote, create_organization},
            store::OrganizationStore,
        },
        persisted::Persisted,
        sync::test::server::{ScriptedResponse, ScriptedServer},
        turso::{discovery::McpEndpoint, platform::InMemoryPlatform},
    };

    const PASSWORD: &str = "the owners password";
    const ISSUED_AT: i64 = 1_757_000_000_000;

    /// What a caller holds by the time it reaches [`connect`]: the credential the code it was given
    /// unsealed, which is what the replica handed in was opened with. The connect reads nothing
    /// with it; it is the fact that one was opened at all (effort 828, requirement 16).
    const UNSEALED: &str = "the-credential-the-code-opened";

    fn test_cost() -> KdfParams {
        KdfParams {
            memory_kib: 1024,
            iterations: 2,
            lanes: 1,
        }
    }

    /// A second machine's record: nothing held yet.
    fn fresh_machine(directory: &std::path::Path) -> Persisted<RemoteSyncStore> {
        let machine = Persisted::<RemoteSyncStore>::load(directory.join("second-machine.json"))
            .expect("the store");

        assert!(machine.selected().is_none(), "the machine has prior state");

        machine
    }

    /// An organization with one member, its owner, and the locator every link to it is built
    /// from, read off the owner's own machine record. That record is returned with it, holding the
    /// organization.
    async fn created(
        credentials: &dyn CredentialStore,
        directory: &std::path::Path,
    ) -> (OrganizationStore, Persisted<RemoteSyncStore>, Locator) {
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
        let (created, organization) = create_organization(
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
            ISSUED_AT,
        )
        .await
        .expect("the first run failed");
        let held = store
            .selected()
            .cloned()
            .expect("the first run recorded no organization");

        assert_eq!(held.id, created.organization_id);

        let locator = Locator {
            organization_id: held.id,
            organization_name: held.name,
            verifying_key: held.verifying_key,
            remote_url: held.remote_url,
        };

        (organization, store, locator)
    }

    /// Criterion 18, from this side: a machine that holds nothing connects by a link, and what it
    /// records is what the locator carried, the key included, with no member and no role. Nothing
    /// was asked for but the link and its code, so no vault could have opened: `connect` takes no
    /// password and hands back no session.
    #[tokio::test]
    async fn connecting_by_the_link_records_the_organization_and_no_member() {
        let credentials = Memory::new();
        let directory = scratch("fresh");
        let (store, owners_machine, link) = created(&credentials, &directory).await;
        let mut machine = fresh_machine(&directory);

        let held = connect(&store, &mut machine, &link, UNSEALED, ISSUED_AT + 1)
            .await
            .expect("the connect failed");

        assert_eq!(held.id, link.organization_id);
        assert_eq!(held.name, "Acme");
        assert_eq!(held.remote_url, link.remote_url);
        assert_eq!(held.verifying_key, link.verifying_key);
        assert_eq!(held.member_id, None, "a connect recorded a member");
        assert_eq!(held.role, None, "a connect recorded a role");
        assert_eq!(held.joined_at, ISSUED_AT + 1);

        // on the record, once, and the same on disk.
        assert_eq!(machine.selected(), Some(&held));

        let written =
            std::fs::read_to_string(directory.join("second-machine.json")).expect("the file");

        assert!(written.contains(&link.organization_id));
        assert!(
            !written.contains("\"organizations\""),
            "the record was written in the old shape"
        );
        assert!(
            !written.contains(PASSWORD) && !written.contains("a-platform-token"),
            "a secret reached the record"
        );

        // and the owner's own machine, which holds the organization already, records nothing a
        // second time (effort 851, requirement 13): its entry comes back as it was, the owner
        // still named as the member, and the record is the same file.
        let mut owners_machine = owners_machine;
        let before = owners_machine
            .selected()
            .cloned()
            .expect("the owner's record");
        let written = std::fs::read(owners_machine.path()).expect("the owner's record");

        assert!(before.member_id.is_some());

        let again = connect(&store, &mut owners_machine, &link, UNSEALED, ISSUED_AT + 2)
            .await
            .expect("a connect for a held organization was refused");

        assert_eq!(again, before, "the connect recorded the organization again");
        assert_eq!(
            owners_machine.selected(),
            Some(&before),
            "the connect touched the owner's record"
        );
        assert_eq!(
            std::fs::read(owners_machine.path()).expect("the owner's record"),
            written,
            "the connect wrote the owner's record"
        );
    }

    /// Effort 828, requirement 16: **a connect records nothing without a credential in hand.**
    ///
    /// There is no link left that carries one legibly, so what reaches here is what an act unsealed
    /// with the code somebody read out. A caller arriving with nothing reached the replica with
    /// nothing, and is refused before the organization row is read rather than recorded from a
    /// database it could not have opened. *`connect::refuse_sealed` refused a sealed link here,
    /// naming the code, while the organization's own link connected with none.*
    #[tokio::test]
    async fn a_connect_with_no_credential_in_hand_records_nothing() {
        let credentials = Memory::new();
        let directory = scratch("no-credential");
        let (store, _, link) = created(&credentials, &directory).await;
        let mut machine = fresh_machine(&directory);

        for nothing in ["", "   "] {
            let refused = connect(&store, &mut machine, &link, nothing, ISSUED_AT + 1).await;

            assert!(
                matches!(refused, Err(Error::Refused { reason: crate::error::RefusalReason::LinkUnreadable, ref message }) if message.contains("Acme")),
                "{refused:?}"
            );
            assert!(
                machine.selected().is_none(),
                "a connect with no credential recorded an organization"
            );
        }
    }

    /// Effort 828, requirement 15: **a record written before the machine id existed still opens.**
    ///
    /// The field defaults to an empty string rather than refusing the record, which is what makes
    /// the migration a launch rather than a disconnect: `session::state_of` draws an id for a
    /// record carrying an empty one and registers the machine there. Nothing writes to the
    /// registry under an empty id in the meantime.
    #[test]
    fn a_record_written_before_the_machine_id_opens_and_carries_an_empty_one() {
        let written = json!({
            "id": "acme",
            "name": "Acme",
            "verifyingKey": "a-verifying-key",
            "remoteUrl": "libsql://org-acme-acme.aws-eu-west-1.turso.io",
            "memberId": "member-owner",
            "role": "owner",
            "joinedAt": ISSUED_AT
        })
        .to_string();

        let held: HeldOrganization =
            serde_json::from_str(&written).expect("a record from before this build was refused");

        assert_eq!(held.machine_id, "", "the field did not default");
        assert_eq!(held.id, "acme");
        assert_eq!(held.member_id.as_deref(), Some("member-owner"));
        assert_eq!(held.joined_at, ISSUED_AT);
    }

    /// Effort 828, criterion 15: **the registry follows the machine through the four acts.**
    ///
    /// A connect puts the machine in with no member; the sign-in at the wall names the member;
    /// the sign-out drops the member and leaves the machine; the disconnect takes the row out. The
    /// sign-out and the disconnect are read here through the two calls those acts make, since the
    /// acts themselves take the organization's state and this is the replica they reach it through.
    /// No signer is anywhere in it: a plain member signs nothing, and these are rows a plain
    /// member writes.
    #[tokio::test]
    async fn the_registry_follows_the_machine_through_the_connect_the_two_sessions_and_the_leave() {
        let credentials = Memory::new();
        let directory = scratch("registry");
        let (store, _, link) = created(&credentials, &directory).await;
        let mut machine = fresh_machine(&directory);
        let verifying_key = link.verifying_key_bytes().expect("the key the link pins");
        let connected = |at: i64| {
            let store = &store;

            async move {
                store
                    .connected_machines(&verifying_key, at)
                    .await
                    .expect("the connected machines")
            }
        };

        assert!(
            connected(ISSUED_AT).await.is_empty(),
            "a machine was registered before anything connected"
        );

        // the connect: one machine, drawn an id of its own, and no member on it.
        let held = connect(&store, &mut machine, &link, UNSEALED, ISSUED_AT + 1)
            .await
            .expect("the connect failed");

        assert!(
            !held.machine_id.is_empty(),
            "the connect drew no machine id"
        );

        let after_connect = connected(ISSUED_AT + 1).await;

        assert_eq!(after_connect.len(), 1);
        assert_eq!(after_connect[0].0.id, held.machine_id);
        assert_eq!(
            after_connect[0].0.member_id, None,
            "a connect named a member"
        );
        assert!(after_connect[0].1.is_none());

        // the sign-in at the wall: the same machine, now naming the member on it.
        let credential: CredentialSlot = Arc::new(Mutex::new(None));
        let session = admit(
            &credentials,
            &store,
            &mut machine,
            &held,
            "olivia",
            PASSWORD,
            &credential,
            ISSUED_AT + 2,
        )
        .await
        .expect("the owner did not sign in at the wall");
        let signed_in = machine.selected().cloned().expect("the record");
        let after_sign_in = connected(ISSUED_AT + 2).await;

        assert_eq!(
            after_sign_in.len(),
            1,
            "the sign-in registered a second machine"
        );
        assert_eq!(after_sign_in[0].0.id, held.machine_id);
        assert_eq!(
            after_sign_in[0].0.member_id.as_deref(),
            Some(session.member_id.as_str())
        );
        assert_eq!(
            after_sign_in[0]
                .1
                .as_ref()
                .map(|member| member.role_id.as_str()),
            Some(permission::OWNER),
            "the member row beside the machine is not the one who signed in"
        );

        // the sign-out: the machine stays and stops naming anybody.
        machine_seen(&store, &signed_in, None, ISSUED_AT + 3).await;

        let after_sign_out = connected(ISSUED_AT + 3).await;

        assert_eq!(after_sign_out.len(), 1);
        assert_eq!(after_sign_out[0].0.id, held.machine_id);
        assert_eq!(
            after_sign_out[0].0.member_id, None,
            "the sign-out left the member on the machine"
        );
        assert_eq!(
            after_sign_out[0].0.created_at,
            ISSUED_AT + 1,
            "the machine looks newer than the connect that registered it"
        );

        // the disconnect: the row goes before the record that names it.
        store
            .unregister_machine(&signed_in.machine_id)
            .await
            .expect("the machine did not leave the registry");

        assert!(
            connected(ISSUED_AT + 4).await.is_empty(),
            "a disconnected machine is still in the registry"
        );
    }

    /// The verifying key is pinned from the link and checked against the row it finds: a link
    /// carrying a stranger's key, or naming another organization, finds rows it cannot own and
    /// is refused with nothing recorded.
    #[tokio::test]
    async fn a_link_whose_key_or_id_the_rows_do_not_carry_is_refused_and_nothing_is_recorded() {
        let credentials = Memory::new();
        let directory = scratch("pinned");
        let (store, _, link) = created(&credentials, &directory).await;
        let mut machine = fresh_machine(&directory);

        let strangers_key = Locator {
            verifying_key: base64::Engine::encode(
                &base64::engine::general_purpose::URL_SAFE_NO_PAD,
                [7_u8; 32],
            ),
            ..link.clone()
        };
        let refused = connect(
            &store,
            &mut machine,
            &strangers_key,
            UNSEALED,
            ISSUED_AT + 1,
        )
        .await;

        assert!(
            matches!(refused, Err(Error::Integrity { .. })),
            "a stranger's key connected: {refused:?}"
        );
        assert!(machine.selected().is_none());

        let another_id = Locator {
            organization_id: "somebody-elses".to_string(),
            ..link.clone()
        };
        let refused = connect(&store, &mut machine, &another_id, UNSEALED, ISSUED_AT + 1).await;

        assert!(
            matches!(refused, Err(Error::Integrity { .. })),
            "another organization's id connected: {refused:?}"
        );
        assert!(machine.selected().is_none());
    }

    /// Everything an organization database holds, table by table and row by row, as a test
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

    /// Effort 838, requirement 11 and criterion 11, at the connect: **an organization of another
    /// format is refused by name, and nothing is written to it.**
    ///
    /// Today's shape is this build's first run with the `format` table taken away, which is every
    /// organization made before the format break; the newer one carries format 3. Each is met the
    /// way a caller meets it, the completion every pull runs first and the connect after, and each
    /// is refused with its own reason before its organization row is read. Neither database gains
    /// a table or a row, the older one in particular gaining no `format` table, and the machine
    /// records nothing.
    #[tokio::test]
    async fn an_organization_of_another_format_is_refused_at_the_connect_and_nothing_is_written() {
        let credentials = Memory::new();
        // a format past the one this build ships, whichever that is.
        let newer = format!(
            "UPDATE \"format\" SET \"version\" = {}",
            crate::organization::store::FORMAT_VERSION + 1
        );

        for (name, change, reason) in [
            (
                "today",
                "DROP TABLE \"format\"",
                crate::error::RefusalReason::OrganizationOlder,
            ),
            (
                "newer",
                newer.as_str(),
                crate::error::RefusalReason::OrganizationNewer,
            ),
        ] {
            let directory = scratch(name);
            let (store, _, link) = created(&credentials, &directory).await;
            let mut machine = fresh_machine(&directory);

            store
                .connection()
                .execute(change, ())
                .await
                .expect("the organization of another format");

            let before = contents(&store).await;

            assert!(
                !store.complete_schema().await.expect("the completion"),
                "{name}: the completion wrote to an organization of another format"
            );

            let refused = connect(&store, &mut machine, &link, UNSEALED, ISSUED_AT + 1).await;

            assert!(
                matches!(refused, Err(Error::Refused { reason: refusal, .. }) if refusal == reason),
                "{name}: {refused:?}"
            );
            assert_eq!(
                contents(&store).await,
                before,
                "{name}: the refusal wrote to the organization"
            );
            assert!(
                machine.selected().is_none(),
                "{name}: a refused connect recorded the organization"
            );
        }
    }

    /// **Effort 857, ticket 04, at the connect.** What the caller pulled carries a raise of the
    /// organization's floors. A connect to an organization this machine does not hold is refused
    /// past the write floor alone, as `OrganizationReadOnlyByVersion`, since it registers the
    /// machine; and a connect to one it holds already is judged before it is selected, and refused
    /// past the read floor as `OrganizationNewer`. Nothing is written to the organization.
    #[tokio::test]
    async fn a_connect_past_the_floors_is_refused_and_writes_nothing() {
        use crate::organization::store::FORMAT_VERSION;

        let credentials = Memory::new();

        // not held: past the write floor alone.
        let directory = scratch("connect-read-only");
        let (store, _, link) = created(&credentials, &directory).await;
        let mut machine = fresh_machine(&directory);

        store
            .record_floors(FORMAT_VERSION + 1, FORMAT_VERSION, FORMAT_VERSION + 1)
            .await;

        let before = contents(&store).await;
        let refused = connect(&store, &mut machine, &link, UNSEALED, ISSUED_AT + 1).await;

        assert!(
            matches!(
                refused,
                Err(Error::Refused {
                    reason: crate::error::RefusalReason::OrganizationReadOnlyByVersion,
                    ..
                })
            ),
            "{refused:?}"
        );
        assert_eq!(contents(&store).await, before, "the refusal wrote");
        assert!(
            machine.selected().is_none(),
            "a refused connect recorded it"
        );

        // held already: past the read floor.
        let directory = scratch("connect-held-unreadable");
        let (store, _, link) = created(&credentials, &directory).await;
        let mut machine = fresh_machine(&directory);

        connect(&store, &mut machine, &link, UNSEALED, ISSUED_AT + 1)
            .await
            .expect("the first connect");
        store
            .record_floors(FORMAT_VERSION + 1, FORMAT_VERSION + 1, FORMAT_VERSION + 1)
            .await;

        let before = contents(&store).await;
        let refused = connect(&store, &mut machine, &link, UNSEALED, ISSUED_AT + 2).await;

        assert!(
            matches!(
                refused,
                Err(Error::Refused {
                    reason: crate::error::RefusalReason::OrganizationNewer,
                    ..
                })
            ),
            "{refused:?}"
        );
        assert_eq!(contents(&store).await, before, "the refusal wrote");
    }
}
