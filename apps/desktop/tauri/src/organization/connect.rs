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
//! **A connect takes a link whose credential is in hand, and nothing else** (effort 828,
//! requirement 4). The organization's own link carries a legible credential and connects a
//! machine with no code, which is what makes it the owner's recovery copy: when every machine is
//! gone there is nobody left to read a code out. Every other link carries a sealed payload, and
//! the act that takes the code is what opens it and hands a link with the credential in it back
//! here (`link::with_clear_credential`), so a sealed link reaching this function directly is a
//! person who was never asked for their code and is refused saying so.
//!
//! **What the machine learns from the link is pinned from the link.** The verifying key is
//! written as the link spelled it and every later verification uses that copy, never one read
//! out of the database it judges; `authority.rs` says why the key travels this way. The one read
//! made here, the organization row, is compared against the pinned key rather than trusted.
//!
//! **A machine holds one organization, so a connect while one is held is refused** before the
//! link is looked at. Reaching another is a disconnect (`forget.rs`) and then a connect, which is
//! requirement 17's shape and the reason the record is an `Option` rather than a list.

use crate::{diagnostics, error::Error, persisted::Persisted, sync::RemoteSyncStore};

use super::{HeldOrganization, invite::random_id, link::JoinLink, store::OrganizationStore};

/// The one sentence a link whose credential is still sealed is refused with here (effort 828,
/// requirement 1): a code is what opens it, and nothing on this path asked for one.
pub const CODE_NEEDED: &str =
    "this link needs the six-character code that came with it; open it and type the code";

/// Record the organization `link` names on this machine, having reached its replica.
///
/// `store` is a replica of the organization the link names, opened with the credential the link
/// carried and pulled. The organization row is read once and has to carry the link's id and the
/// key the link pins; a replica saying otherwise is another organization's, or one whose rows
/// were rewritten, and is refused before anything is recorded. What is written to `machine` is
/// what the link carried and no member.
///
/// **The credential has to be in hand** (effort 828, requirement 4). A link whose credential is
/// still sealed is refused naming the code, because reaching a replica at all took a credential
/// and a caller that got one without a code got it from the organization's own link.
///
/// **The machine draws its id here and registers with no member** (effort 828, requirement 15).
/// This is the moment it starts holding the organization, so it is where the id it will keep is
/// drawn, and the row goes in before the record that names it: a record naming a machine the
/// organization does not know is what a failed write would leave behind.
pub async fn connect(
    store: &OrganizationStore,
    machine: &mut Persisted<RemoteSyncStore>,
    link: &JoinLink,
    now: i64,
) -> Result<HeldOrganization, Error> {
    refuse_while_held(machine)?;
    refuse_sealed(link)?;

    let verifying_key = link.verifying_key_bytes()?;
    let organization = store
        .organization()
        .await?
        .ok_or_else(|| Error::Integrity {
            message: format!(
                "the database this link reaches holds no organization row for {}",
                link.organization_name
            ),
        })?;

    if organization.id != link.organization_id {
        return Err(Error::Integrity {
            message: format!(
                "this link names {} and the database it reaches belongs to another organization",
                link.organization_name
            ),
        });
    }

    if organization.verifying_key != verifying_key {
        return Err(Error::Integrity {
            message: format!(
                "the rows this link reaches for {} are not the ones its key judges",
                link.organization_name
            ),
        });
    }

    // the machine's own id in the registry, drawn here because this is the moment it starts
    // holding the organization and kept in the record for as long as it does (requirement 15).
    let machine_id = random_id()?;

    store.register_machine(&machine_id, None, now).await?;

    if !store.push().await {
        diagnostics::warn("organization.machine.registeredNotYetSent")
            .with("organization", link.organization_id.as_str())
            .write();
    }

    let held = HeldOrganization {
        id: link.organization_id.clone(),
        name: link.organization_name.clone(),
        verifying_key: link.verifying_key.clone(),
        remote_url: link.remote_url.clone(),
        machine_id,
        member_id: None,
        role: None,
        joined_at: now,
    };

    machine.organization = Some(held.clone());
    machine.commit()?;

    diagnostics::info("organization.connected")
        .with("organization", held.id.as_str())
        .write();

    Ok(held)
}

/// The refusal a link whose credential is still sealed meets, said before anything is reached.
///
/// Said separately from [`connect`] so the command can say it before it spends a network round
/// trip trying to open a replica with a credential it does not have.
pub fn refuse_sealed(link: &JoinLink) -> Result<(), Error> {
    match link.clear_credential() {
        Some(_) => Ok(()),
        None => Err(Error::PreconditionFailed {
            message: CODE_NEEDED.to_string(),
        }),
    }
}

/// The refusal a connect meets on a machine that already holds an organization, said before
/// the link is decoded or anything is reached: the way to another organization is a disconnect
/// first.
pub fn refuse_while_held(machine: &RemoteSyncStore) -> Result<(), Error> {
    match machine.organization.as_ref() {
        Some(held) => Err(Error::PreconditionFailed {
            message: format!(
                "this machine already holds {}; disconnect it before connecting another",
                held.name
            ),
        }),
        None => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use serde_json::json;

    use super::{CODE_NEEDED, connect, refuse_sealed};
    use crate::{
        error::Error,
        organization::{
            HeldOrganization,
            join::admit,
            link::{Half, HalfKind, JoinLink},
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

    /// An organization with one member, its owner, and the link the first run produced: the
    /// owner's own. The owner's machine record is returned with it, holding the organization.
    async fn created(
        directory: &std::path::Path,
    ) -> (OrganizationStore, Persisted<RemoteSyncStore>, JoinLink) {
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
        let link = JoinLink::decode(&created.join_link).expect("the link");

        (organization, store, link)
    }

    /// Criterion 18, from this side: a machine that holds nothing connects by the organization's
    /// own link, and what it records is what the link carried, the key included, with no member
    /// and no role. Nothing was asked for but the link, so no vault could have opened: `connect`
    /// takes no password and hands back no session.
    #[tokio::test]
    async fn connecting_by_the_link_records_the_organization_and_no_member() {
        let directory = scratch("fresh");
        let (store, owners_machine, link) = created(&directory).await;
        let mut machine = fresh_machine(&directory);

        let held = connect(&store, &mut machine, &link, ISSUED_AT + 1)
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

        let refused = connect(&store, &mut owners_machine, &link, ISSUED_AT + 2).await;

        assert!(
            matches!(refused, Err(Error::PreconditionFailed { ref message }) if message.contains("Acme")),
            "{refused:?}"
        );
        assert_eq!(
            owners_machine.organization.as_ref(),
            Some(&before),
            "the refusal touched the owner's record"
        );
    }

    /// Effort 828, requirement 4: **the organization's own link connects a machine with no code,
    /// and a sealed link is refused with a sentence naming the one it needs.**
    ///
    /// The first half is what makes the owner's recovery copy work at all: when every machine is
    /// gone there is nobody left to read a code out. The second is the whole of what stops a found
    /// invitation link reaching the directory, since a connect is the one path that would record an
    /// organization without ever asking for one.
    #[tokio::test]
    async fn the_organizations_own_link_connects_with_no_code_and_a_sealed_one_is_refused() {
        let directory = scratch("no-code");
        let (store, _, link) = created(&directory).await;
        let mut machine = fresh_machine(&directory);

        // the organization's own: a legible credential, no half, and nothing asked for.
        assert!(link.clear_credential().is_some());
        assert_eq!(link.half(), None);

        let held = connect(&store, &mut machine, &link, ISSUED_AT + 1)
            .await
            .expect("the organization's own link did not connect");

        assert_eq!(held.id, link.organization_id);
        assert_eq!(held.member_id, None);

        // a sealed link, on a machine holding nothing: refused before anything is reached, with
        // the sentence that names the code.
        let mut second = Persisted::<RemoteSyncStore>::load(directory.join("third-machine.json"))
            .expect("the store");
        let sealed = link.sealed(
            "c2VhbGVk",
            Half {
                kind: HalfKind::Invitation,
                id: "inv-1".to_string(),
                secret: "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8".to_string(),
                expires_at: ISSUED_AT + 1000,
            },
        );
        let refused = connect(&store, &mut second, &sealed, ISSUED_AT + 2).await;

        assert!(
            matches!(refused, Err(Error::PreconditionFailed { ref message }) if message == CODE_NEEDED),
            "{refused:?}"
        );
        assert!(
            second.organization.is_none(),
            "a sealed link recorded an organization"
        );
        assert!(
            matches!(
                refuse_sealed(&sealed),
                Err(Error::PreconditionFailed { .. })
            ),
            "a sealed link passed the guard the command reads"
        );
        assert!(refuse_sealed(&link).is_ok());
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
        let held = connect(&store, &mut machine, &link, ISSUED_AT + 1)
            .await
            .expect("the connect failed");

        assert!(!held.machine_id.is_empty(), "the connect drew no machine id");

        let after_connect = connected(ISSUED_AT + 1).await;

        assert_eq!(after_connect.len(), 1);
        assert_eq!(after_connect[0].0.id, held.machine_id);
        assert_eq!(after_connect[0].0.member_id, None, "a connect named a member");
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

        assert_eq!(after_sign_in.len(), 1, "the sign-in registered a second machine");
        assert_eq!(after_sign_in[0].0.id, held.machine_id);
        assert_eq!(
            after_sign_in[0].0.member_id.as_deref(),
            Some(session.member_id.as_str())
        );
        assert_eq!(
            after_sign_in[0].1.as_ref().map(|member| member.role.as_str()),
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

        let strangers_key = JoinLink {
            verifying_key: base64::Engine::encode(
                &base64::engine::general_purpose::URL_SAFE_NO_PAD,
                [7_u8; 32],
            ),
            ..link.clone()
        };
        let refused = connect(&store, &mut machine, &strangers_key, ISSUED_AT + 1).await;

        assert!(
            matches!(refused, Err(Error::Integrity { .. })),
            "a stranger's key connected: {refused:?}"
        );
        assert!(machine.organization.is_none());

        let another_id = JoinLink {
            organization_id: "somebody-elses".to_string(),
            ..link.clone()
        };
        let refused = connect(&store, &mut machine, &another_id, ISSUED_AT + 1).await;

        assert!(
            matches!(refused, Err(Error::Integrity { .. })),
            "another organization's id connected: {refused:?}"
        );
        assert!(machine.organization.is_none());
    }
}
