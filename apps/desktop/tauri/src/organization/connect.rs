//! connecting a machine to an organization by its link: the machine learns where the
//! organization is and records it, and nobody has signed in yet.
//!
//! **A connect opens no vault and records no member** (effort 824, requirement 18). The link
//! carries the organization's id, name, remote and verifying key, and a read-only credential over
//! sealed rows; what a connect does with it is reach the replica, check that the rows it finds are
//! the organization's, and write those four facts to this machine's record with `member_id` and
//! `role` empty. The person is admitted at the wall, by username and password, and that sign-in
//! is what fills the two. *819's join and restore did both in one step, from a link that carried
//! the invitation's half; requirement 18 retires them as ways through the wall.*
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

use super::{HeldOrganization, link::JoinLink, store::OrganizationStore};

/// Record the organization `link` names on this machine, having reached its replica.
///
/// `store` is a replica of the organization the link names, opened with the link's read-only
/// credential and pulled, the way `organization_link_inspect` reaches one. The organization row is
/// read once and has to carry the link's id and the key the link pins; a replica saying otherwise
/// is another organization's, or one whose rows were rewritten, and is refused before anything is
/// recorded. What is written to `machine` is what the link carried and no member.
pub async fn connect(
    store: &OrganizationStore,
    machine: &mut Persisted<RemoteSyncStore>,
    link: &JoinLink,
    now: i64,
) -> Result<HeldOrganization, Error> {
    refuse_while_held(machine)?;

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

    let held = HeldOrganization {
        id: link.organization_id.clone(),
        name: link.organization_name.clone(),
        verifying_key: link.verifying_key.clone(),
        remote_url: link.remote_url.clone(),
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
    use std::sync::Arc;

    use serde_json::json;

    use super::connect;
    use crate::{
        error::Error,
        organization::{
            link::JoinLink,
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
