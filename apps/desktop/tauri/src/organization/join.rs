//! the way in: what a link says about the organization it names, and the sign-in at the wall
//! that admits a person to the organization this machine holds.
//!
//! **A link is parsed here and nowhere else.** The web layer hands the text over and is told the
//! organization's name and where it is; the credential the link carries and the verifying key it
//! pins stay on this side ([[rules/credentials]], *Client boundary*). What a machine does with a
//! link is connect (`connect.rs`), which records the organization and no member.
//!
//! **Signing in is a username and a password against the held organization** (effort 824,
//! requirement 19). The wall asks for both; `session::sign_in_by_username` tries the password
//! against each member's vault and checks the username on the row that opens, and what happens
//! here is the rest of the act: a pending account's first sign-in spends its invitation, and the
//! machine's record learns which member this person is. A wrong password, a username nobody
//! holds, and a username held by somebody whose password this is not are refused with one
//! sentence, and nothing says whether the username exists. *819's join opened a sealed payload
//! with the link's half of a secret and the password to find the member's row, and its restore
//! tried every vault by the organization's own link; requirement 18 retires both, and the vault
//! trial is the one way in now.*
//!
//! **A first sign-in on a handed password spends the invitation and still forces the change**
//! (requirement 19). The invitation row is the pending account's expiry: an open one is marked
//! consumed and pushed, a lapsed one refuses the sign-in naming the lapse, since a reissue is what
//! a lapsed invitation calls for, and the member row's `must_change_password` is what the
//! session carries, so the shell's password-change gate does the rest. A refusal that names the
//! organization is a refusal of the invitation, never of the link.
//!
//! **Sign-out keeps the record.** Signing out drops the keys this process held and nothing else;
//! the record goes on naming the organization and the member, so the wall comes back up on the
//! same organization and the next sign-in finds the same replica. Forgetting the organization is
//! a disconnect (`forget.rs`), which is a different act.
//!
//! **How a link reaches the application.** A link is `rentable://join/...`, and the scheme is
//! registered with the operating system: by the installer on Windows and Linux, from the
//! `deep-link` plugin's configuration, and by `Info.plist` on macOS from the same; a development
//! build registers it for its own executable at startup. Opening the link opens the application,
//! or reaches the instance already running through the single-instance plugin, and the shell
//! puts the connect screen on with the link already in it. A person whose platform did not hand
//! the link over, a chat client that refuses unknown schemes, a link copied as text, pastes it
//! into the same screen; that is the fallback and not the design. Both are in
//! `organization/command.rs`'s `organization_link_take` and the shell's listener, and the decision
//! is recorded here because the join ticket made it.

use serde::{Deserialize, Serialize};

use crate::{diagnostics, error::Error, persisted::Persisted, sync::RemoteSyncStore};

use super::{
    HeldOrganization,
    invite::InvitationStanding,
    link::JoinLink,
    session::{CredentialSlot, MemberSession, sign_in_by_username},
    store::OrganizationStore,
};

/// Where a link stands, as the connect screen is told it before it does anything.
///
/// **One value is ever produced now: `None`.** A link carried an invitation's half until effort
/// 824 dropped it, and the four invitation values said where that invitation stood; there is one
/// kind of link, the organization's own, and it names the organization and admits nobody. The
/// four are kept as words the connect screen still reads until ticket 13 redraws it around the
/// one; nothing constructs them.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum LinkStanding {
    /// an open invitation: a password opens it. *Not produced since effort 824.*
    Open,
    /// past its lifetime. *Not produced since effort 824.*
    Lapsed,
    /// used once already. *Not produced since effort 824.*
    Consumed,
    /// the invitation this link was made for is gone. *Not produced since effort 824.*
    Revoked,
    /// the organization's own link, with no invitation in it: it names the organization, and a
    /// username and password admit a person at the wall.
    None,
}

/// What a link says once the organization it points at has been reached: its name, where it is,
/// and where the link stands. No credential, no key, no secret.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkFacts {
    pub organization_id: String,
    pub organization_name: String,
    pub remote_url: String,
    pub standing: LinkStanding,
}

/// Read a link against the replica it found, and say what it names.
///
/// `store` is a replica of the organization the link names, opened with the link's read-only
/// credential and pulled; every row read here is verified against the key the link pinned, so a
/// replica whose rows were not signed by that organization is refused before anything is said
/// about it. The members are the read, because they are the rows a connect screen goes on to
/// need and the ones a stranger's key fails on.
pub async fn inspect(store: &OrganizationStore, link: &JoinLink) -> Result<LinkFacts, Error> {
    let verifying_key = link.verifying_key_bytes()?;

    store.members(&verifying_key).await?;

    Ok(LinkFacts {
        organization_id: link.organization_id.clone(),
        organization_name: link.organization_name.clone(),
        remote_url: link.remote_url.clone(),
        standing: LinkStanding::None,
    })
}

/// Admit a person to the organization this machine holds, by username and password: the sign-in
/// at the wall.
///
/// `store` is the held organization's replica on this machine and `credential` its slot, empty
/// on the way in and holding the member's own credential on the way out, which `sign_in_by_username`
/// fills from the grant the vault unsealed; the push that spends an invitation goes out under
/// that. `held` is what the record names, which a connect wrote with no member and a first run
/// or an earlier sign-in wrote with one; either way the person is found by what they typed, and
/// the record is written back naming them.
pub async fn admit(
    store: &OrganizationStore,
    machine: &mut Persisted<RemoteSyncStore>,
    held: &HeldOrganization,
    username: &str,
    password: &str,
    credential: &CredentialSlot,
    now: i64,
) -> Result<MemberSession, Error> {
    let session = sign_in_by_username(store, held, username, password, credential).await?;

    // the invitations naming this member: one at most, since a reissue deletes the ones before
    // it, and none once a revoke has deleted it.
    let invitations: Vec<_> = store
        .invitations(&session.verifying_key)
        .await?
        .into_iter()
        .filter(|invitation| invitation.member_id == session.member_id)
        .collect();

    // a handed password with no invitation row at all is one somebody revoked: the row is
    // still there, the vault still opens, and the one sentence says nothing more than a wrong
    // password would. A consumed row is a person who signed in once and has not chosen their
    // own password yet, and they are admitted to that change again.
    if session.must_change_password && invitations.is_empty() {
        return Err(super::session::refused_by_name(&held.name));
    }

    // the pending account: an invitation that no sign-in has spent yet.
    let pending = invitations
        .into_iter()
        .find(|invitation| invitation.consumed_at.is_none());

    if let Some(invitation) = pending {
        // unspent, so it stands open or it has lapsed; a lapsed one is what a reissue is for, and
        // the refusal names the organization because the link found it and the invitation is
        // what is refused.
        if InvitationStanding::of(&invitation, now) == InvitationStanding::Lapsed {
            return Err(Error::Forbidden {
                message: format!(
                    "the invitation to {} has lapsed; ask whoever invited you for a new one",
                    held.name
                ),
            });
        }

        // spent, under the credential the vault just unsealed; a push that does not go out is
        // the offline case, and the mark reaches the account with the next one.
        store.consume_invitation(&invitation.id, now).await?;

        if !store.push().await {
            diagnostics::warn("organization.invitation.consumedNotYetSent")
                .with("invitation", invitation.id.as_str())
                .write();
        }
    }

    let filled = HeldOrganization {
        member_id: Some(session.member_id.clone()),
        role: Some(session.role.clone()),
        ..held.clone()
    };

    machine.organization = Some(filled);
    machine.commit()?;

    diagnostics::info("organization.signedIn")
        .with("organization", held.id.as_str())
        .with("role", session.role.as_str())
        .write();

    Ok(session)
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use serde_json::json;
    use tokio::sync::RwLock;

    use super::{LinkStanding, admit, inspect};
    use crate::{
        database::Database,
        error::Error,
        organization::{
            HeldOrganization, connect,
            invite::{INVITATION_LIFETIME_MS, Invitation, invite_member, organization_link},
            link::JoinLink,
            migrate::Pipeline,
            permission,
            session::{CredentialSlot, MemberSession, sign_in},
            setup::{CreateOrganization, Remote, create_organization},
            store::OrganizationStore,
            vault::KdfParams,
            workspace::create_workspace,
        },
        persisted::Persisted,
        settings::Settings,
        state::AppState,
        sync::{
            RemoteSync, RemoteSyncStore,
            test::server::{ScriptedResponse, ScriptedServer},
            turso::{consent::TursoConsent, discovery::McpEndpoint, platform::InMemoryPlatform},
        },
        update::Update,
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
        let directory = std::env::temp_dir().join(format!("rentable-join-{name}-{nanos:x}"));
        std::fs::create_dir_all(&directory).expect("scratch directory");

        directory
    }

    fn slot() -> CredentialSlot {
        Arc::new(Mutex::new(None))
    }

    /// A second machine's record, connected to the organization by its link: the organization
    /// named, and no member yet, which is what a person signs in against at the wall.
    async fn connected_machine(
        directory: &std::path::Path,
        store: &OrganizationStore,
        link: &JoinLink,
    ) -> (Persisted<RemoteSyncStore>, HeldOrganization) {
        let mut machine = Persisted::<RemoteSyncStore>::load(directory.join(RemoteSync::FILENAME))
            .expect("the store");

        assert!(
            machine.organization.is_none(),
            "the second machine has prior state"
        );

        let held = connect::connect(store, &mut machine, link, ISSUED_AT + 1)
            .await
            .expect("the connect failed");

        assert_eq!(held.member_id, None);

        (machine, held)
    }

    /// An organization with its owner signed in, one workspace, and one member invited into it:
    /// the store with two members every test here runs over. The replica the owner wrote is what
    /// a connected machine reads once it has pulled; the pull itself is `organization/store.rs`'s
    /// and is not what this module proves.
    async fn invited(
        directory: &std::path::Path,
    ) -> (OrganizationStore, MemberSession, JoinLink, String, String) {
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
            },
            test_cost(),
            ISSUED_AT,
        )
        .await
        .expect("the first run failed");
        let joined = store.organization.clone().expect("the record");
        let mut owner = sign_in(&organization, &joined, PASSWORD, &slot())
            .await
            .expect("the owner did not sign in");
        let pipeline = ScriptedServer::start(vec![ScriptedResponse::new(
            200,
            json!({ "results": [] }).to_string(),
        )])
        .await;
        let workspace = create_workspace(
            &organization,
            &mut owner,
            &platform,
            |_| Pipeline::at(&pipeline.url("")),
            "North",
            ISSUED_AT,
        )
        .await
        .expect("the workspace");
        let link = organization_link(&organization, &owner)
            .await
            .expect("the organization's link");
        let invited = invite_member(
            &organization,
            &owner,
            &link,
            Invitation {
                username: "sami.staff",
                role: permission::MEMBER,
                workspace_ids: std::slice::from_ref(&workspace.id),
            },
            test_cost(),
            ISSUED_AT,
        )
        .await
        .expect("the invitation failed");

        assert_eq!(
            JoinLink::decode(&invited.join_link).expect("the invitation's link"),
            link,
            "an invitation hands out the organization's own link"
        );

        (
            organization,
            owner,
            link,
            invited.generated_password,
            workspace.id,
        )
    }

    /// The invitation naming `member_id`, as the rows hold it: `(expires_at, consumed_at)`.
    async fn invitation_of(
        store: &OrganizationStore,
        session: &MemberSession,
        member_id: &str,
    ) -> Option<(i64, Option<i64>)> {
        store
            .invitations(&session.verifying_key)
            .await
            .expect("the invitations")
            .into_iter()
            .find(|invitation| invitation.member_id == member_id)
            .map(|invitation| (invitation.expires_at, invitation.consumed_at))
    }

    /// Criterion 18, the link's half: a link names the organization and stands as nothing else,
    /// and one carrying a stranger's key finds rows it cannot verify and is refused before
    /// anything is said. The connect itself is `connect.rs`'s test.
    #[tokio::test]
    async fn a_link_names_the_organization_and_a_strangers_key_is_refused_by_the_rows() {
        let directory = scratch("inspect");
        let (store, owner, link, _, _) = invited(&directory).await;

        let facts = inspect(&store, &link)
            .await
            .expect("the link could not be read");

        assert_eq!(facts.organization_name, "Acme");
        assert_eq!(facts.organization_id, owner.organization_id);
        assert_eq!(facts.remote_url, link.remote_url);
        assert_eq!(facts.standing, LinkStanding::None);

        let strangers = JoinLink {
            verifying_key: base64::Engine::encode(
                &base64::engine::general_purpose::URL_SAFE_NO_PAD,
                [7_u8; 32],
            ),
            ..link
        };

        assert!(
            matches!(
                inspect(&store, &strangers).await,
                Err(Error::Integrity { .. })
            ),
            "a stranger's key read the rows"
        );
    }

    /// Criterion 19: over a store with two members, the owner and an invited member, a username
    /// and password that match a member open a session on a machine that connected by link and
    /// knew no member, in whatever case and spacing the username was typed; the record then names
    /// the member and their role, on disk. The member's first sign-in is on the handed password:
    /// the invitation is spent, and the session still says to change the password.
    #[tokio::test]
    async fn a_username_and_password_that_match_a_member_open_a_session_and_fill_the_record() {
        let directory = scratch("admit");
        let (store, owner, link, member_password, workspace_id) = invited(&directory).await;

        // the owner, on a second machine, by the username the first run took and their password,
        // in another case. The credential slot holds the member's own on the way out.
        let owners = scratch("admit-owner");
        let (mut machine, held) = connected_machine(&owners, &store, &link).await;
        let credential = slot();
        let session = admit(
            &store,
            &mut machine,
            &held,
            "Olivia",
            PASSWORD,
            &credential,
            ISSUED_AT + 2,
        )
        .await
        .expect("the owner did not sign in");

        assert_eq!(session.role, permission::OWNER);
        assert_eq!(session.member_id, owner.member_id);
        assert_eq!(session.permissions, owner.permissions);
        assert!(!session.must_change_password);
        assert_eq!(
            session.workspace_credentials[&workspace_id].token,
            owner.workspace_credentials[&workspace_id].token
        );
        assert_eq!(
            credential.lock().expect("the slot").as_deref(),
            owner
                .organization_credential
                .lock()
                .expect("the slot")
                .as_deref()
        );

        let recorded = machine.organization.as_ref().expect("the record");

        assert_eq!(recorded.id, link.organization_id);
        assert_eq!(recorded.verifying_key, link.verifying_key);
        assert_eq!(
            recorded.member_id.as_deref(),
            Some(owner.member_id.as_str())
        );
        assert_eq!(recorded.role.as_deref(), Some(permission::OWNER));
        assert_eq!(
            recorded.joined_at,
            ISSUED_AT + 1,
            "the connect's moment stays"
        );

        let written = std::fs::read_to_string(owners.join(RemoteSync::FILENAME)).expect("the file");

        assert!(
            written.contains(&owner.member_id),
            "the record on disk names nobody"
        );
        assert!(
            !written.contains(PASSWORD),
            "the password reached the record"
        );

        // the member, on their own machine, by the username they were given and the password
        // they were handed: their first sign-in, which spends the invitation.
        let theirs = scratch("admit-member");
        let (mut their_machine, their_held) = connected_machine(&theirs, &store, &link).await;

        assert_eq!(
            invitation_of(&store, &owner, &session.member_id).await,
            None,
            "the owner has an invitation"
        );

        let member = admit(
            &store,
            &mut their_machine,
            &their_held,
            " Sami.Staff ",
            &member_password,
            &slot(),
            ISSUED_AT + 3,
        )
        .await
        .expect("the member did not sign in");

        assert_eq!(member.role, permission::MEMBER);
        assert!(
            member.must_change_password,
            "a first sign-in on a handed password settled the member"
        );
        assert!(member.workspace_credentials.contains_key(&workspace_id));
        assert_eq!(
            invitation_of(&store, &owner, &member.member_id).await,
            Some((ISSUED_AT + INVITATION_LIFETIME_MS, Some(ISSUED_AT + 3))),
            "the invitation was not spent"
        );

        let recorded = their_machine.organization.as_ref().expect("the record");

        assert_eq!(
            recorded.member_id.as_deref(),
            Some(member.member_id.as_str())
        );
        assert_eq!(recorded.role.as_deref(), Some(permission::MEMBER));

        // and their second sign-in, on the same machine and the same handed password, is not a
        // first: nothing is spent again, and the session still says to change the password.
        let again = admit(
            &store,
            &mut their_machine,
            &their_held,
            "sami.staff",
            &member_password,
            &slot(),
            ISSUED_AT + 4,
        )
        .await
        .expect("the second sign-in was refused");

        assert!(again.must_change_password);
        assert_eq!(
            invitation_of(&store, &owner, &member.member_id).await,
            Some((ISSUED_AT + INVITATION_LIFETIME_MS, Some(ISSUED_AT + 3)))
        );
    }

    /// Criterion 19's refusals, over the same two members: the wrong password, a username nobody
    /// holds, and a username somebody holds with another member's password are each refused with
    /// the same one sentence, so nothing says whether the username exists; nothing is recorded,
    /// and the member's invitation is not spent by any of them.
    #[tokio::test]
    async fn the_wrong_password_an_unknown_username_and_another_members_password_are_one_sentence()
    {
        let directory = scratch("refused");
        let (store, owner, link, member_password, _) = invited(&directory).await;
        let (mut machine, held) =
            connected_machine(&scratch("refused-machine"), &store, &link).await;
        let member_id = {
            let members = store
                .members(&owner.verifying_key)
                .await
                .expect("the members");

            members
                .iter()
                .find(|member| member.id != owner.member_id)
                .expect("the invited member")
                .id
                .clone()
        };
        let mut sentences = Vec::new();

        for (username, password) in [
            ("sami.staff", "not the password"),
            ("olivia", "not the password"),
            ("nobody.here", PASSWORD),
            ("nobody.here", member_password.as_str()),
            ("sami.staff", PASSWORD),
            ("olivia", member_password.as_str()),
            ("", PASSWORD),
            ("", "not the password"),
        ] {
            let refused = admit(
                &store,
                &mut machine,
                &held,
                username,
                password,
                &slot(),
                ISSUED_AT + 2,
            )
            .await
            .expect_err(&format!("{username:?} signed in with {password:?}"));

            assert!(
                matches!(refused, Error::Forbidden { .. }),
                "{username:?} with {password:?}: {refused:?}"
            );
            sentences.push(refused.to_string());
        }

        sentences.dedup();

        assert_eq!(
            sentences,
            vec!["the username and password do not open a place in Acme".to_string()],
            "the refusals differ"
        );
        assert_eq!(
            machine
                .organization
                .as_ref()
                .and_then(|held| held.member_id.as_deref()),
            None,
            "a refusal recorded a member"
        );
        assert_eq!(
            invitation_of(&store, &owner, &member_id).await,
            Some((ISSUED_AT + INVITATION_LIFETIME_MS, None)),
            "a refusal spent the invitation"
        );
    }

    /// A revoke deletes the invitation row and nothing else, so the vault still opens on the
    /// handed password. The sign-in is what closes it: a member who has never chosen a password
    /// and has no invitation row, spent or open, is refused with the one sentence, which says
    /// nothing a wrong password would not.
    #[tokio::test]
    async fn a_revoked_account_is_refused_with_the_one_sentence() {
        let directory = scratch("revoked");
        let (store, owner, link, _, _) = invited(&directory).await;
        let (mut machine, held) =
            connected_machine(&scratch("revoked-machine"), &store, &link).await;
        let gone = invite_member(
            &store,
            &owner,
            &link,
            Invitation {
                username: "gone.member",
                role: permission::MEMBER,
                workspace_ids: &[],
            },
            test_cost(),
            ISSUED_AT,
        )
        .await
        .expect("the invitation failed");

        crate::organization::invite::revoke_invitation(&store, &owner, &gone.invitation_id)
            .await
            .expect("the revoke failed");

        let refused = admit(
            &store,
            &mut machine,
            &held,
            "gone.member",
            &gone.generated_password,
            &slot(),
            ISSUED_AT + 1,
        )
        .await;

        assert!(
            matches!(refused, Err(Error::Forbidden { ref message }) if message == "the username and password do not open a place in Acme"),
            "{refused:?}"
        );
        assert_eq!(
            machine
                .organization
                .as_ref()
                .and_then(|held| held.member_id.as_deref()),
            None
        );
    }

    /// A member whose invitation lapsed before their first sign-in is refused by name, with the
    /// lapse said, since a reissue is what they need; the record is not filled and the invitation
    /// is not spent. A reissue then admits them on the fresh password.
    #[tokio::test]
    async fn a_lapsed_invitation_refuses_the_first_sign_in_by_name_and_a_reissue_admits() {
        let directory = scratch("lapsed");
        let (store, owner, link, _, _) = invited(&directory).await;
        let (mut machine, held) =
            connected_machine(&scratch("lapsed-machine"), &store, &link).await;
        let late = invite_member(
            &store,
            &owner,
            &link,
            Invitation {
                username: "late.member",
                role: permission::MEMBER,
                workspace_ids: &[],
            },
            test_cost(),
            ISSUED_AT,
        )
        .await
        .expect("the second invitation failed");
        let after = ISSUED_AT + INVITATION_LIFETIME_MS;

        let refused = admit(
            &store,
            &mut machine,
            &held,
            "late.member",
            &late.generated_password,
            &slot(),
            after,
        )
        .await;

        assert!(
            matches!(refused, Err(Error::Forbidden { ref message }) if message.contains("Acme") && message.contains("lapsed")),
            "{refused:?}"
        );
        assert_eq!(
            machine
                .organization
                .as_ref()
                .and_then(|held| held.member_id.as_deref()),
            None
        );
        assert_eq!(
            invitation_of(&store, &owner, &late.member_id).await,
            Some((after, None))
        );

        let reissued = crate::organization::invite::reissue_invitation(
            &store,
            &owner,
            &link,
            &late.member_id,
            test_cost(),
            after,
        )
        .await
        .expect("the reissue failed");

        assert!(
            admit(
                &store,
                &mut machine,
                &held,
                "late.member",
                &late.generated_password,
                &slot(),
                after + 1,
            )
            .await
            .is_err(),
            "the lapsed password still opens the vault"
        );

        let member = admit(
            &store,
            &mut machine,
            &held,
            "late.member",
            &reissued.generated_password,
            &slot(),
            after + 1,
        )
        .await
        .expect("the reissued member did not sign in");

        assert!(member.must_change_password);
        assert_eq!(
            invitation_of(&store, &owner, &late.member_id).await,
            Some((after + INVITATION_LIFETIME_MS, Some(after + 1)))
        );
    }

    /// Signing out leaves the record naming the organization with its member: the sign-out
    /// drops the keys this process held and the replica, and the record on disk is exactly what
    /// the sign-in wrote. Driven through the routine `organization_sign_out` calls, over the whole
    /// application state built the way `lib.rs` builds it.
    #[tokio::test]
    async fn signing_out_leaves_the_record_naming_the_organization_with_its_member() {
        let directory = scratch("sign-out");
        let (store, owner, link, _, _) = invited(&directory).await;
        let theirs = scratch("sign-out-machine");
        let (mut machine, held) = connected_machine(&theirs, &store, &link).await;
        let session = admit(
            &store,
            &mut machine,
            &held,
            "olivia",
            PASSWORD,
            &slot(),
            ISSUED_AT + 2,
        )
        .await
        .expect("the owner did not sign in");
        let signed_in = machine.organization.clone().expect("the record");

        drop(machine);

        // the application state over the second machine's directory, with the person in.
        let app_state = state_over(&theirs).await;

        *app_state.organization.write().await = Some(store);
        *app_state.member.write().await = Some(session);

        crate::organization::sign_out(&app_state).await;

        assert!(
            app_state.member.read().await.is_none(),
            "the keys were kept"
        );
        assert!(
            app_state.organization.read().await.is_none(),
            "the replica was kept"
        );

        let recorded = app_state
            .remote_sync
            .write()
            .await
            .store_mut()
            .organization
            .clone();

        assert_eq!(recorded.as_ref(), Some(&signed_in));
        assert_eq!(
            recorded.as_ref().and_then(|held| held.member_id.as_deref()),
            Some(owner.member_id.as_str())
        );

        let written = std::fs::read_to_string(theirs.join(RemoteSync::FILENAME)).expect("the file");

        assert!(written.contains(&link.organization_id));
        assert!(written.contains(&owner.member_id));
    }

    /// The whole of the application state over one data directory, as `lib.rs` builds it, with
    /// nothing open and nobody in. `remote-sync.json` is loaded from the directory, so a test
    /// writes the record it wants first. *`forget.rs` keeps the same builder; a fixture is
    /// written out per module ([[rules/testing]]).*
    async fn state_over(directory: &std::path::Path) -> AppState {
        let mut settings =
            Persisted::<Settings>::load(directory.join(Settings::FILENAME)).expect("the settings");
        settings.database_path = directory.join(Database::FILENAME);
        settings.recovery_path = directory.join(Update::FILENAME);
        settings.commit().expect("the settings");

        let settings = Arc::new(RwLock::new(settings));
        let remote_sync = RemoteSync::new(settings.clone(), directory.join(RemoteSync::FILENAME))
            .await
            .expect("the sync record");
        let update = Update::new(settings.clone()).await.expect("the update");

        AppState {
            db: Arc::new(RwLock::new(Database::new(settings.clone()))),
            settings,
            remote_sync: Arc::new(RwLock::new(remote_sync)),
            update: Arc::new(RwLock::new(update)),
            consent: Arc::new(TursoConsent::new()),
            organization: Arc::new(RwLock::new(None)),
            member: Arc::new(RwLock::new(None)),
            arriving_link: Arc::new(Mutex::new(None)),
            old_shape_check: tokio::sync::OnceCell::new(),
        }
    }

    /// Criterion 15 against the rows a real invitation wrote: given the link's contents and a
    /// credential that reads every row, no username or workspace name is legible.
    /// `store.rs` proves it over hand-written rows; this is the same read over what `invite` and
    /// `create_workspace` actually write.
    #[tokio::test]
    async fn the_rows_a_link_holder_reads_carry_no_username_and_no_workspace_name() {
        let directory = scratch("legible");
        let (store, _, link, password, _) = invited(&directory).await;
        let link_text = link.encode().expect("the link");
        let secrets = [
            "sami.staff",
            "olivia",
            "North",
            "Acme",
            PASSWORD,
            password.as_str(),
        ];
        let mut cells = 0;

        for table in crate::organization::store::TABLES {
            let mut rows = store
                .connection()
                .query(&format!("SELECT * FROM \"{table}\""), ())
                .await
                .expect("the rows");

            while let Some(row) = rows.next().await.expect("a row") {
                for index in 0..row.column_count() {
                    let bytes = match row.get_value(index).expect("a value") {
                        turso::Value::Text(text) => text.into_bytes(),
                        turso::Value::Blob(blob) => blob,
                        _ => continue,
                    };

                    cells += 1;

                    for secret in secrets {
                        assert!(
                            !bytes
                                .windows(secret.len())
                                .any(|window| window == secret.as_bytes()),
                            "{secret:?} is legible in a {table} column to anybody holding the \
                             link and the database"
                        );
                    }
                }
            }
        }

        assert!(
            cells > 30,
            "the secrecy test read almost nothing: {cells} cells"
        );

        // and the link itself carries the organization's name, which is the one name criterion 15
        // permits, and none of the others.
        for secret in ["sami.staff", "olivia", "North", password.as_str()] {
            assert!(!link_text.contains(secret), "{secret:?} is in the link");
        }
        assert_eq!(link.organization_name, "Acme");
    }

    /// Live, at the human's request, and admitted in [[rules/testing]] under *Tests that reach a
    /// live remote* as criterion 6: **an organization provisioned on machine A is restored on
    /// machine B from the link, the username, the password and one consent, with A offline.**
    ///
    /// Two machines are two application data directories in one process, and A is offline in
    /// the sense that matters: its replica is closed and nothing of its directory is read after
    /// the provisioning; B starts from an empty directory and is handed the link text, the
    /// owner's username and password, and the consent's product. The consent's product is the
    /// platform token, read from the environment as every live test here reads it, and it is the
    /// one thing the keyring holds in common between the two, because this process has one
    /// keyring. What the test cannot cover is two operating-system accounts and two keyrings;
    /// what it does cover is that nothing about the organization is machine-local, which is the
    /// property. The member is admitted on a third directory the same way, by their username and
    /// the password they were handed. Both databases are deleted by the same run. *Under effort
    /// 824 a machine connects by the link and then signs in at the wall; the two steps are what
    /// 819's one restore was.*
    ///
    /// ```text
    /// RENTABLE_LIVE_TURSO=1 TURSO_CONSENT_TOKEN=… TURSO_ORG=… TURSO_GROUP=… \
    ///   cargo test --manifest-path ./apps/desktop/tauri/Cargo.toml \
    ///   restore_live -- --test-threads=1 --ignored --nocapture
    /// ```
    #[tokio::test]
    #[ignore = "reaches a live Turso account and creates two databases; see the doc comment"]
    async fn restore_live_a_second_machine_restores_the_organization_with_the_first_offline() {
        use crate::{
            organization::{
                setup::{CreateOrganization, Remote, create_organization},
                store::OrganizationStore,
                workspace::create_workspace,
            },
            sync::turso::{
                consent::store_platform_token,
                discovery::{McpEndpoint, TursoOrganization},
                platform::{
                    AccessLevel, DeletionIntent, PlatformApi, PlatformEndpoint, TursoPlatform,
                },
            },
        };

        let read = |name: &str| {
            std::env::var(name)
                .ok()
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| {
                    panic!("{name} is needed for a live run; see the doc comment above")
                })
        };

        assert_eq!(
            read("RENTABLE_LIVE_TURSO"),
            "1",
            "a live run is armed by RENTABLE_LIVE_TURSO=1 as well as by --ignored"
        );

        let token = read("TURSO_CONSENT_TOKEN");
        store_platform_token(&token).expect("failed to file the token");

        let organization = TursoOrganization {
            slug: read("TURSO_ORG"),
            group: read("TURSO_GROUP"),
        };
        let platform = PlatformApi::new(PlatformEndpoint::production(), organization.clone());
        let now = || {
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|elapsed| elapsed.as_millis() as i64)
                .unwrap_or_default()
        };

        // machine A: the first run, a workspace, and an invitation, all pushed to the account.
        let machine_a = scratch("live-a");
        let mut store_a = Persisted::<RemoteSyncStore>::load(machine_a.join("remote-sync.json"))
            .expect("A's store");
        let (created, organization_a) = create_organization(
            &mut store_a,
            &token,
            &McpEndpoint::production(),
            |organization| PlatformApi::new(PlatformEndpoint::production(), organization),
            Remote::libsql(),
            &machine_a.join("app.db"),
            CreateOrganization {
                name: "t819-18 restore",
                username: "olivia",
                password: PASSWORD,
            },
            test_cost(),
            now(),
        )
        .await
        .expect("the live first run failed");
        let organization_database = format!("org-{}", created.organization_id);

        eprintln!("created {organization_database}");
        assert!(
            created.synced,
            "the first run's rows did not reach the account"
        );

        let joined_a = store_a.organization.clone().expect("the record on A");
        let mut owner_a = sign_in(&organization_a, &joined_a, PASSWORD, &slot())
            .await
            .expect("the owner did not sign in on A");
        let workspace = create_workspace(
            &organization_a,
            &mut owner_a,
            &platform,
            Pipeline::of,
            "North",
            now(),
        )
        .await
        .expect("the live workspace failed");

        eprintln!("created {}", workspace.database_name);

        let link_a = organization_link(&organization_a, &owner_a)
            .await
            .expect("the link");
        let invited = invite_member(
            &organization_a,
            &owner_a,
            &link_a,
            Invitation {
                username: "sami.staff",
                role: permission::MEMBER,
                workspace_ids: std::slice::from_ref(&workspace.id),
            },
            test_cost(),
            now(),
        )
        .await
        .expect("the invitation failed");

        assert!(
            organization_a.push().await,
            "the invitation's rows did not reach the account"
        );

        // machine A goes offline: its replica is closed and its directory is not read again.
        drop(owner_a);
        drop(organization_a);
        drop(store_a);

        let link = JoinLink::decode(&created.join_link).expect("the organization's own link");

        // a machine that has never seen the organization: its replica opened against the remote
        // with the link's read-only credential, pulled, and the organization recorded with no
        // member, the way `organization_connect` reaches one.
        let reach = |directory: &std::path::Path| {
            let link = link.clone();
            let path =
                OrganizationStore::replica_path(&directory.join("app.db"), &link.organization_id);

            async move {
                let credential: CredentialSlot =
                    Arc::new(Mutex::new(Some(link.read_only_credential.clone())));
                let slot = Arc::clone(&credential);
                let store =
                    OrganizationStore::open(&path, Some(link.remote_url.clone()), move || {
                        let slot = Arc::clone(&slot);

                        async move {
                            slot.lock()
                                .ok()
                                .and_then(|slot| slot.clone())
                                .ok_or_else(|| turso::Error::Misuse("no credential".into()))
                        }
                    })
                    .await
                    .expect("the replica did not open");

                assert!(store.pull().await, "nothing was pulled from the account");

                (store, credential)
            }
        };

        // machine B: an empty directory, the link, and the owner's username and password.
        let machine_b = scratch("live-b");
        let (organization_b, credential_b) = reach(&machine_b).await;
        let (mut store_b, held_b) = connected_machine(&machine_b, &organization_b, &link).await;
        let restored = admit(
            &organization_b,
            &mut store_b,
            &held_b,
            "olivia",
            PASSWORD,
            &credential_b,
            now(),
        )
        .await
        .expect("the owner did not sign in on B");

        eprintln!("restored the owner on B as {}", restored.role);
        assert_eq!(restored.role, permission::OWNER);
        assert_eq!(
            Some(restored.member_id.as_str()),
            joined_a.member_id.as_deref()
        );
        assert!(
            restored.workspace_credentials.contains_key(&workspace.id),
            "the restored owner does not hold the workspace"
        );

        // the rows on B verify against the key the link carried, and say what A wrote.
        let members_b = organization_b
            .members(&restored.verifying_key)
            .await
            .expect("B's rows did not verify");
        let grants_b = organization_b
            .grants(&restored.verifying_key)
            .await
            .expect("B's grants did not verify");

        assert_eq!(members_b.len(), 2);
        assert!(grants_b.iter().any(
            |grant| grant.member_id == restored.member_id && grant.workspace_id == workspace.id
        ));

        // the one consent: the authority is not in any row B pulled, and the token the consent
        // produced is what lets B act as the owner again.
        let minted = platform
            .mint_token(&workspace.database_name, "5m", AccessLevel::ReadOnly)
            .await
            .expect("B could not act on the account with the consent's authority");

        assert!(!minted.is_empty());

        // machine C: the member, by their username and the password they were handed.
        let machine_c = scratch("live-c");
        let (organization_c, credential_c) = reach(&machine_c).await;
        let (mut store_c, held_c) = connected_machine(&machine_c, &organization_c, &link).await;
        let member_c = admit(
            &organization_c,
            &mut store_c,
            &held_c,
            "sami.staff",
            &invited.generated_password,
            &credential_c,
            now(),
        )
        .await
        .expect("the member did not sign in on C");

        eprintln!("restored the member on C as {}", member_c.role);
        assert_eq!(member_c.role, permission::MEMBER);
        assert!(member_c.must_change_password);

        // and the member's credential opens the workspace: a replica of it pulls the schema.
        let held = member_c.workspace_credentials[&workspace.id].token.clone();
        let workspace_c = crate::database::Database::open_replica(
            &machine_c.join("workspace.db"),
            Some(format!("libsql://{}", workspace.database_hostname)),
            move || {
                let held = held.clone();
                async move { Ok::<String, turso::Error>(held) }
            },
        )
        .await
        .expect("C's workspace replica");

        assert!(
            workspace_c.pull().await.is_ok(),
            "C could not pull the workspace"
        );
        assert!(
            crate::database::Database::is_replica_ready(&workspace_c).await,
            "the workspace C pulled holds no schema"
        );

        drop(workspace_c);
        drop(organization_c);
        drop(organization_b);

        for name in [
            workspace.database_name.as_str(),
            organization_database.as_str(),
        ] {
            platform
                .delete_database(name, DeletionIntent::CreatedAndUnreferenced)
                .await
                .unwrap_or_else(|error| {
                    panic!("the live delete of {name} failed, and it is left behind: {error:?}")
                });

            eprintln!("removed {name}");
        }
    }
}
