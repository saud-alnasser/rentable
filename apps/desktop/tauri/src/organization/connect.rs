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
//! out of the database it judges; `authority.rs` says why the key travels this way. The one read
//! made here, the organization row, is compared against the pinned key rather than trusted.
//!
//! **A machine holds one organization, so a connect while one is held is refused** before the
//! link is looked at. Reaching another is a disconnect (`forget.rs`) and then a connect, which is
//! requirement 17's shape and the reason the record is an `Option` rather than a list.

use crate::{
    diagnostics,
    error::{Error, RefusalReason},
    persisted::Persisted,
    sync::RemoteSyncStore,
};

use super::{HeldOrganization, invite::random_id, link::Locator, store::OrganizationStore};

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
    refuse_while_held(machine)?;

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
    // and before this machine records or registers anything (effort 838, requirement 11).
    store.refuse_another_format().await?;

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
pub async fn record(
    store: &OrganizationStore,
    machine: &mut Persisted<RemoteSyncStore>,
    facts: OrganizationFacts,
    member: Option<(&str, &str)>,
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

    let held = HeldOrganization {
        id: facts.id,
        name: facts.name,
        verifying_key: facts.verifying_key,
        remote_url: facts.remote_url,
        machine_id,
        member_id: member.map(|(id, _)| id.to_string()),
        role: member.map(|(_, role)| role.to_string()),
        joined_at: now,
    };

    machine.organization = Some(held.clone());
    machine.commit()?;

    diagnostics::info("organization.connected")
        .with("organization", held.id.as_str())
        .write();

    Ok(held)
}

/// The refusal a connect meets on a machine that already holds an organization, said before
/// the link is decoded or anything is reached: the way to another organization is a disconnect
/// first.
pub fn refuse_while_held(machine: &RemoteSyncStore) -> Result<(), Error> {
    match machine.organization.as_ref() {
        Some(held) => Err(Error::refused(
            RefusalReason::AnotherOrganizationHeld,
            format!(
                "this machine already holds {}; disconnect it before connecting another",
                held.name
            ),
        )),
        None => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use serde_json::json;

    use super::connect;
    use crate::{
        error::Error,
        organization::{
            HeldOrganization,
            join::admit,
            link::Locator,
            permission,
            session::{CredentialSlot, machine_seen},
            setup::{CreateOrganization, Remote, create_organization},
            store::OrganizationStore,
            vault::KdfParams,
        },
        persisted::Persisted,
        sync::{
            RemoteSyncStore,
            test::server::{ScriptedResponse, ScriptedServer},
            turso::{discovery::McpEndpoint, platform::InMemoryPlatform},
        },
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

    fn scratch(name: &str) -> std::path::PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|elapsed| elapsed.as_nanos())
            .unwrap_or_default();
        let directory = std::env::temp_dir().join(format!("rentable-connect-{name}-{nanos:x}"));
        std::fs::create_dir_all(&directory).expect("scratch directory");

        directory
    }

    /// A second machine's record: nothing held yet.
    fn fresh_machine(directory: &std::path::Path) -> Persisted<RemoteSyncStore> {
        let machine = Persisted::<RemoteSyncStore>::load(directory.join("second-machine.json"))
            .expect("the store");

        assert!(
            machine.organization.is_none(),
            "the machine has prior state"
        );

        machine
    }

    /// An organization with one member, its owner, and the locator every link to it is built
    /// from, read off the owner's own machine record. That record is returned with it, holding the
    /// organization.
    async fn created(
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
            .organization
            .clone()
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
        let directory = scratch("fresh");
        let (store, owners_machine, link) = created(&directory).await;
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
        assert_eq!(machine.organization.as_ref(), Some(&held));

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

        // and the owner's own machine, which holds the organization already, is refused with
        // its record left as it was: the owner still named as the member.
        let mut owners_machine = owners_machine;
        let before = owners_machine
            .organization
            .clone()
            .expect("the owner's record");

        assert!(before.member_id.is_some());

        let refused = connect(&store, &mut owners_machine, &link, UNSEALED, ISSUED_AT + 2).await;

        assert!(
            matches!(refused, Err(Error::Refused { reason: crate::error::RefusalReason::AnotherOrganizationHeld, ref message }) if message.contains("Acme")),
            "{refused:?}"
        );
        assert_eq!(
            owners_machine.organization.as_ref(),
            Some(&before),
            "the refusal touched the owner's record"
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
        let directory = scratch("no-credential");
        let (store, _, link) = created(&directory).await;
        let mut machine = fresh_machine(&directory);

        for nothing in ["", "   "] {
            let refused = connect(&store, &mut machine, &link, nothing, ISSUED_AT + 1).await;

            assert!(
                matches!(refused, Err(Error::Refused { reason: crate::error::RefusalReason::LinkUnreadable, ref message }) if message.contains("Acme")),
                "{refused:?}"
            );
            assert!(
                machine.organization.is_none(),
                "a connect with no credential recorded an organization"
            );
        }
    }

    /// Effort 828, requirement 15: **a record written before the machine id existed still opens.**
    ///
    /// The field defaults to an empty string rather than refusing the record, which is what makes
    /// the migration a launch rather than a disconnect: `command::state_of` draws an id for a
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
    /// acts themselves take the application state and this is the replica they reach it through.
    /// No signer is anywhere in it: a plain member signs nothing, and these are rows a plain
    /// member writes.
    #[tokio::test]
    async fn the_registry_follows_the_machine_through_the_connect_the_two_sessions_and_the_leave() {
        let directory = scratch("registry");
        let (store, _, link) = created(&directory).await;
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
        let signed_in = machine.organization.clone().expect("the record");
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
                .map(|member| member.role.as_str()),
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
        let directory = scratch("pinned");
        let (store, _, link) = created(&directory).await;
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
        assert!(machine.organization.is_none());

        let another_id = Locator {
            organization_id: "somebody-elses".to_string(),
            ..link.clone()
        };
        let refused = connect(&store, &mut machine, &another_id, UNSEALED, ISSUED_AT + 1).await;

        assert!(
            matches!(refused, Err(Error::Integrity { .. })),
            "another organization's id connected: {refused:?}"
        );
        assert!(machine.organization.is_none());
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
        for (name, change, reason) in [
            (
                "today",
                "DROP TABLE \"format\"",
                crate::error::RefusalReason::OrganizationOlder,
            ),
            (
                "newer",
                "UPDATE \"format\" SET \"version\" = 3",
                crate::error::RefusalReason::OrganizationNewer,
            ),
        ] {
            let directory = scratch(name);
            let (store, _, link) = created(&directory).await;
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
                machine.organization.is_none(),
                "{name}: a refused connect recorded the organization"
            );
        }
    }
}
