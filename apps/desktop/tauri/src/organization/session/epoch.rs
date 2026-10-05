//! the session epoch on a member's row: moved on to end every other machine's session, and read
//! by an open session to learn that its own has ended (effort 826, requirement 22).

use crate::{
    credential::CredentialStore,
    diagnostics,
    error::{Error, RefusalReason},
};

use super::{MemberSession, acting_row, actor, rank_of, refuse_unsettled, remember::refile};
use crate::organization::{
    role::permission::{self, Flag},
    store::OrganizationStore,
};

/// Whether the row has moved past the session: somebody ended this member's sessions from another
/// machine, and this one is behind (effort 826, requirement 22).
///
/// Read off the replica as it stands, so the caller decides whether to pull first. The sync
/// heartbeat does, and the launch runs the heartbeat's check once the resumed vault can pay for
/// the pull (`command::ended_elsewhere`).
///
/// **A row that will not read under the session's key is an error and not an answer**, and the
/// caller is what reads it as a handover this machine has not followed yet (effort 828,
/// requirement 22): the rows a pull brought were re-keyed, and the succession is followed and the
/// session re-pinned before the question is asked again.
pub async fn ended_elsewhere(
    store: &OrganizationStore,
    session: &MemberSession,
) -> Result<bool, Error> {
    let members = store.members(&session.verifying_key).await?;
    let member = members
        .iter()
        .find(|member| member.id == session.member_id)
        .ok_or_else(|| {
            Error::refused(
                RefusalReason::MemberGone,
                "this member's row is not in the organization any more",
            )
        })?;

    Ok(session.session_epoch < member.session_epoch)
}

/// End this member's sessions everywhere but here, and stay signed in here (effort 826,
/// requirement 22).
///
/// The row's epoch moves on, this machine's open session moves with it and the entry it stays
/// signed in on is rewritten under the new number, so every other machine is behind: one still
/// running ends at its next heartbeat and one that is closed meets the wall at its next launch.
/// **Nothing about the password moves**, and nobody is asked for one: what this ends is sessions.
///
/// An entry the credential store will not give back or never took is a diagnostic rather than a
/// refusal, as [`remember`](fn@super::remember)'s is: the act itself went through, and what the person loses is this
/// machine staying signed in past the next launch.
///
/// **What comes back is whether the bump reached the organization database.** A push that could
/// not go leaves the number on this machine's replica alone, which means the other machines are
/// still open: the caller says so rather than reporting the act done, and the heartbeat's own
/// push is what carries it out when there is a connection again.
///
/// **The epoch stays the mechanism, and the register follows it** (effort 846, requirement 10):
/// it reaches a machine with no row and a machine older than this version, which signing one
/// machine out does not, and every other machine of the reader's stops naming them, so their list
/// stops showing the machines it ended. `machine_id` is this machine's, whose row is kept; an
/// empty one, a record from before the registry, clears nothing.
pub(crate) async fn end_elsewhere(
    credentials: &dyn CredentialStore,
    store: &OrganizationStore,
    session: &mut MemberSession,
    machine_id: &str,
    now: i64,
) -> Result<bool, Error> {
    session.settled()?;

    // the acting row, with a session behind it refused: a machine whose sessions were already
    // ended cannot bump past its own revocation and refile its key under the new number, which
    // is what would have let it stay. From the row rather than from the session, so a bump this
    // machine has not seen is not undone by one it makes. The command pulls before it calls in,
    // which is what makes the row the organization's rather than this machine's last sight of
    // it, and `store::set_session_epoch` refuses to write a number below the row's whatever this
    // arithmetic produced.
    let member = acting_row(store, session).await?;
    let epoch = member.session_epoch + 1;

    store
        .set_session_epoch(&session.member_id, epoch, now)
        .await?;

    if !machine_id.is_empty() {
        store
            .clear_member_from_other_machines(&session.member_id, machine_id)
            .await?;
    }

    let sent = store.push().await;

    if !sent {
        diagnostics::warn("organization.session.endedNotYetSent")
            .with("member", session.member_id.as_str())
            .write();
    }

    session.session_epoch = epoch;
    refile(
        credentials,
        &session.organization_id,
        &session.member_id,
        epoch,
    );

    diagnostics::info("organization.session.endedElsewhere")
        .with("member", session.member_id.as_str())
        .write();

    Ok(sent)
}

/// End another member's sessions, on every machine including whichever they are at: what an owner
/// or a holder of `resetPassword` does from the member's row (effort 826, requirement 22).
///
/// **No new act.** Whoever may hand a member a fresh way into their account may end the ways in
/// that are already open, which is why this is `resetPassword`'s and not a bit of its own.
///
/// Two rows are refused. The caller's own, because ending your own sessions and keeping this one
/// is [`end_elsewhere`] and does something different; and the owner's, which is the line
/// `role::assign_role` and `role::set_override` draw too. **Any other row is ended only from above**
/// (effort 838, requirement 7): a member whose role does not rank below the actor's is refused by
/// rank, the way a reset of them is, and the gate reads the actor's verified row rather than the
/// session's snapshot of it ([`Actor`](super::Actor)).
///
/// **The register follows the act**, because the standing the members directory draws is read off
/// it: an account nobody is signed in on is an account a link is offered for (requirement 20), and
/// a register still naming this member on machines that are all behind the epoch would keep the
/// one act that gets them back in absent from their card.
///
/// **What comes back is whether the bump reached the organization database**, for the reason
/// [`end_elsewhere`] gives: an act whose whole value is that it takes effect on another machine
/// cannot be reported done while it is still sitting on this one.
pub async fn end_member_sessions(
    store: &OrganizationStore,
    session: &MemberSession,
    member_id: &str,
    now: i64,
) -> Result<bool, Error> {
    session.settled()?;

    let actor = actor(store, session).await?;

    permission::require(actor.row.effective, Flag::ResetPassword)?;

    if member_id == session.member_id {
        return Err(Error::refused(
            RefusalReason::NotYourself,
            "you cannot end your own sessions from somebody else's row. sign out of your \
                      other machines from the account section",
        ));
    }

    let members = store.members(&session.verifying_key).await?;
    let member = members
        .iter()
        .find(|member| member.id == member_id)
        .ok_or_else(|| {
            Error::refused(
                RefusalReason::MemberMissing,
                "that member is not in this organization",
            )
        })?;

    if member.role_id == permission::OWNER {
        return Err(Error::refused(
            RefusalReason::OwnerProtected,
            "an owner's sessions are not ended by anybody else. the organization is theirs",
        ));
    }

    refuse_unsettled(member)?;

    // from above only: whoever may hand an account a fresh way in may end the ways in it has, and
    // both are held to the member's role ranking below the actor's (effort 838, requirement 7).
    actor.outranks(
        rank_of(store, session, member).await?,
        "that member's role is not below yours, so their sessions are ended by somebody who ranks \
         above them",
    )?;

    store
        .set_session_epoch(member_id, member.session_epoch + 1, now)
        .await?;

    // and the register stops naming them (effort 828, requirement 15). Every machine they were on
    // is behind the epoch now, so a register that went on saying one is signed in on the account
    // would draw a standing line for a state that ended here. The rows stay: those machines still
    // hold the organization, and what ended is who is on them.
    store.clear_member_from_machines(member_id).await?;

    let sent = store.push().await;

    if !sent {
        diagnostics::warn("organization.session.endedNotYetSent")
            .with("member", member_id)
            .write();
    }

    diagnostics::info("organization.session.endedForMember")
        .with("member", member_id)
        .write();

    Ok(sent)
}

#[cfg(test)]
mod tests {
    use crate::credential::{CredentialStore, Memory};
    use crate::machine::RemoteSyncStore;
    use crate::organization::HeldOrganization;
    use crate::organization::authority::AdministratorKey;
    use crate::organization::member::vault::{
        KdfParams, create_vault_with_secret, open_vault, seal_content, seal_to_public_key,
    };
    use crate::organization::role::permission;
    use crate::organization::session::{
        CredentialSlot, MEMBER_KEY_SERVICE, MemberSession, Resumption, end_elsewhere,
        end_member_sessions, permissions_on_row, resume, sign_in, sign_in_by_username,
    };
    use crate::organization::setup::{
        ADMINISTRATOR_KEY_PURPOSE, CreateOrganization, Remote, create_organization,
    };
    use crate::organization::store::{MemberRecord, OrganizationStore, Signer};
    use crate::organization::workspace::signer_of;
    use crate::persisted::Persisted;
    use crate::sync::test::server::{ScriptedResponse, ScriptedServer};
    use crate::test::scratch;
    use crate::turso::discovery::McpEndpoint;
    use crate::turso::platform::InMemoryPlatform;
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

    /// Another member of the organization the owner made, written under the owner's authority and
    /// signed in: the second and third people a test about somebody else's row needs.
    async fn a_member(
        store: &OrganizationStore,
        owner: &MemberSession,
        joined: &HeldOrganization,
        id: &str,
        username: &str,
        role: &str,
        password: &str,
    ) -> MemberSession {
        let (key, certificate) = signer_of(store, owner).await.expect("the owner's signer");
        let signer = Signer {
            key: &key,
            certificate: &certificate,
        };
        let (vault, secret) = create_vault_with_secret(password, test_cost()).expect("a vault");

        store
            .write_member(
                &signer,
                &MemberRecord {
                    id: id.to_string(),
                    username_sealed: seal_content(
                        &owner.content_key,
                        "member.username_sealed",
                        username.as_bytes(),
                    )
                    .expect("sealed"),
                    sealed_content_key: seal_to_public_key(
                        &vault.public_key,
                        &owner.content_key.to_bytes(),
                    )
                    .expect("sealed"),
                    vault: vault.clone(),
                    signing_public_key: AdministratorKey::from_bytes(
                        &secret
                            .derive_seed(ADMINISTRATOR_KEY_PURPOSE)
                            .expect("the signing seed"),
                    )
                    .verifying_key(),
                    role_id: role.to_string(),
                    override_mask: 0,
                    removed_at: None,
                    effective: 0,
                    covered: true,
                    must_change_password: false,
                    created_at: 1_757_000_000_000,
                    updated_at: 1_757_000_000_000,
                    session_epoch: 0,
                    owner_seed_sealed: None,
                },
            )
            .await
            .expect("the member row");

        let verifying_key =
            crate::organization::session::verifying_key_of(joined).expect("the key");
        let members = store.members(&verifying_key).await.expect("the members");
        let member = members
            .iter()
            .find(|member| member.id == id)
            .expect("the row just written");
        let secret = open_vault(password, &member.vault).expect("their password did not open");
        let content_key =
            crate::organization::session::content_key_of(&member.sealed_content_key, &secret)
                .expect("the content key");

        crate::organization::session::open_session(
            store,
            joined,
            verifying_key,
            member,
            secret,
            content_key,
            &slot(),
        )
        .await
        .expect("their session")
    }

    /// The row's session epoch, read back verified.
    async fn epoch_of(store: &OrganizationStore, joined: &HeldOrganization, id: &str) -> i64 {
        store
            .members(&crate::organization::session::verifying_key_of(joined).expect("the key"))
            .await
            .expect("the members")
            .iter()
            .find(|member| member.id == id)
            .expect("the row")
            .session_epoch
    }

    /// **A machine whose sessions were ended cannot end everybody else's and stay.** Ending your
    /// other sessions bumps from the row, so a machine already behind the row would write a
    /// number past the revocation and file its own key under it, and nothing would ever ask it
    /// again. The gate refuses a session behind its row, here and before every other act.
    #[tokio::test]
    async fn a_session_behind_its_row_is_refused_the_bump_and_every_act() {
        let credentials = Memory::new();
        let directory = scratch("behind-the-row");
        let (_, store, joined) = created(&credentials, &directory).await;
        let member_id = joined.member_id.clone().expect("the record names a member");
        let account = format!("{}:{member_id}", joined.id);

        let mut session =
            sign_in_by_username(&credentials, &store, &joined, "olivia", PASSWORD, &slot())
                .await
                .expect("the sign-in failed");
        let before = credentials
            .get(MEMBER_KEY_SERVICE, &account)
            .expect("the store would not answer")
            .expect("the sign-in filed nothing");

        // somebody ended this member's sessions from another machine, and the row arrived.
        store
            .set_session_epoch(&member_id, 1, 1_757_000_000_050)
            .await
            .expect("the bump failed");

        let refused = end_elsewhere(&credentials, &store, &mut session, "", 1_757_000_000_100)
            .await
            .expect_err("a session behind its row ended everybody else's");

        assert!(
            matches!(
                refused,
                crate::error::Error::Refused {
                    reason: crate::error::RefusalReason::SessionsEnded,
                    ..
                }
            ),
            "{refused:?}"
        );
        assert!(
            refused.to_string().contains("another machine"),
            "the refusal does not say what happened: {refused}"
        );
        assert_eq!(epoch_of(&store, &joined, &member_id).await, 1);
        assert_eq!(session.session_epoch, 0);
        assert_eq!(
            credentials
                .get(MEMBER_KEY_SERVICE, &account)
                .expect("the store would not answer")
                .as_deref(),
            Some(before.as_str()),
            "the entry was refiled by a refused bump"
        );

        // and no act goes through from that session either.
        let gate = permissions_on_row(&store, &session)
            .await
            .expect_err("a session behind its row was let through a gate");

        assert!(gate.to_string().contains("another machine"), "{gate}");
    }

    /// **Criterion 22, the member's own half.** Two machines are signed in as one member; the
    /// first ends every other session. The first still resumes, because its entry was rewritten
    /// under the new epoch; the second's resume answers that the sessions were ended elsewhere
    /// and leaves nothing filed.
    ///
    /// The second machine is a second store over the same replica, which is what two machines are
    /// to each other once a push and a pull have run between them; there is no remote here, so
    /// the file is the thing they share. Its entry is the one that was filed before the bump,
    /// kept aside and put back, because the credential store a test has is one map and both
    /// machines file under the same account.
    #[tokio::test]
    async fn ending_sessions_elsewhere_keeps_this_machine_in_and_leaves_every_other_behind() {
        let credentials = Memory::new();
        let directory = scratch("end-elsewhere");
        let (_, store, joined) = created(&credentials, &directory).await;
        let member_id = joined.member_id.clone().expect("the record names a member");
        let account = format!("{}:{member_id}", joined.id);

        let mut session =
            sign_in_by_username(&credentials, &store, &joined, "olivia", PASSWORD, &slot())
                .await
                .expect("the sign-in failed");
        let before = credentials
            .get(MEMBER_KEY_SERVICE, &account)
            .expect("the store would not answer")
            .expect("the sign-in filed nothing");

        assert!(
            before.starts_with("0:"),
            "the entry does not file the epoch in front of the key: {before}"
        );
        assert_eq!(session.session_epoch, 0);

        // the second machine, over the same replica and holding the entry above.
        let second = OrganizationStore::open(
            crate::clock::System::shared(),
            &OrganizationStore::replica_path(&directory.join("app.db"), &joined.id),
            None,
            || async { Ok::<String, turso::Error>(String::new()) },
        )
        .await
        .expect("the second machine's replica");

        end_elsewhere(&credentials, &store, &mut session, "", 1_757_000_000_100)
            .await
            .expect("ending the other sessions failed");

        assert_eq!(session.session_epoch, 1);
        assert_eq!(epoch_of(&store, &joined, &member_id).await, 1);

        // this machine stays in: the entry moved with the row, so the next launch opens the vault
        // as it did before.
        let rewritten = credentials
            .get(MEMBER_KEY_SERVICE, &account)
            .expect("the store would not answer")
            .expect("the entry was not rewritten");

        assert_eq!(
            rewritten.split_once(':').map(|(epoch, _)| epoch),
            Some("1"),
            "the entry was not refiled under the new epoch: {rewritten}"
        );
        assert_eq!(
            rewritten.split_once(':').map(|(_, key)| key),
            before.split_once(':').map(|(_, key)| key),
            "the key itself was changed by an act that ends sessions"
        );

        let resumed = opened(
            resume(&credentials, &store, &joined, &slot())
                .await
                .expect("this machine's own resume failed"),
        );

        assert_eq!(resumed.member_id, member_id);
        assert_eq!(resumed.session_epoch, 1);

        // and the other machine, whose entry is the one filed before the bump.
        credentials
            .set(MEMBER_KEY_SERVICE, &account, &before)
            .expect("the store would not take the value");

        let standing = resume(&credentials, &second, &joined, &slot())
            .await
            .expect("the second machine's resume failed");

        assert!(
            matches!(standing, Resumption::SignedOutElsewhere),
            "{standing:?}"
        );
        assert_eq!(
            credentials
                .get(MEMBER_KEY_SERVICE, &account)
                .expect("the store would not answer"),
            None,
            "a key from before the sign-out was kept"
        );
    }

    /// **Criterion 22, somebody else's row.** `resetPassword` is the act, the caller's own row is
    /// refused because that is `end_elsewhere`, and the owner's row is nobody else's to end. A
    /// plain member holds none of it, and a manager ends nobody whose role is not below theirs
    /// (effort 838, requirement 7).
    #[tokio::test]
    async fn ending_a_members_sessions_is_reset_passwords_and_never_the_owners_row() {
        let credentials = Memory::new();
        let directory = scratch("end-member");
        let (_, store, joined) = created(&credentials, &directory).await;
        let owner_id = joined.member_id.clone().expect("the record names a member");
        let owner = sign_in(&store, &joined, PASSWORD, &slot())
            .await
            .expect("the owner did not sign in");
        let manager = a_member(
            &store,
            &owner,
            &joined,
            "member-ada",
            "ada.manager",
            permission::MANAGER,
            "a password ada chose",
        )
        .await;
        let member = a_member(
            &store,
            &owner,
            &joined,
            "member-sami",
            "sami.staff",
            permission::MEMBER,
            "a password sami chose",
        )
        .await;

        // two machines in the register, one for each of them, so what the act does to the register
        // is visible (ticket 20, the review's ninth finding).
        let at = 1_757_000_000_100;

        store
            .machine_seen("machine-sami-laptop", Some("member-sami"), at)
            .await
            .expect("the member's machine did not register");
        store
            .machine_seen("machine-sami-desk", Some("member-sami"), at)
            .await
            .expect("the member's second machine did not register");
        store
            .machine_seen("machine-ada", Some("member-ada"), at)
            .await
            .expect("the manager's machine did not register");

        // the act, on somebody else's row: the epoch moves and nothing else does.
        end_member_sessions(&store, &manager, "member-sami", 1_757_000_000_200)
            .await
            .expect("a manager could not end a member's sessions");

        assert_eq!(epoch_of(&store, &joined, "member-sami").await, 1);
        assert_eq!(epoch_of(&store, &joined, "member-ada").await, 0);

        // **and the register stops naming them, so the standing line follows the sign-out.**
        // Every machine they were on is behind the epoch now; the rows stay, because those
        // machines still hold the organization, and the standing the members directory draws is
        // *no machine signed in*, a fact and nothing more since 2026-09-20 (requirement 20 as
        // corrected). *The epoch moved and the register did not, until ticket 20, so the card
        // said somebody was signed in on a machine nothing admitted any more.*
        let named: Vec<Option<String>> = store
            .connected_machines(
                &crate::organization::session::verifying_key_of(&joined).expect("the key"),
                1_757_000_000_300,
            )
            .await
            .expect("the register")
            .into_iter()
            .map(|(machine, _)| machine.member_id)
            .collect();

        assert_eq!(
            named.iter().filter(|member| member.is_none()).count(),
            2,
            "the register still names the member on a machine: {named:?}"
        );
        assert!(
            named.contains(&Some("member-ada".to_string())),
            "the act reached a row it was not about: {named:?}"
        );

        // their own row is the other act's.
        let own = end_member_sessions(&store, &manager, "member-ada", 1_757_000_000_300)
            .await
            .expect_err("a manager ended their own sessions from a row");

        assert!(
            matches!(
                own,
                crate::error::Error::Refused {
                    reason: crate::error::RefusalReason::NotYourself,
                    ..
                }
            ),
            "{own:?}"
        );
        assert!(own.to_string().contains("your own sessions"), "{own}");

        // and the owner's row is nobody else's.
        let theirs = end_member_sessions(&store, &manager, &owner_id, 1_757_000_000_400)
            .await
            .expect_err("a manager ended the owner's sessions");

        assert!(
            matches!(
                theirs,
                crate::error::Error::Refused {
                    reason: crate::error::RefusalReason::OwnerProtected,
                    ..
                }
            ),
            "{theirs:?}"
        );
        assert!(
            theirs.to_string().contains("the organization is theirs"),
            "{theirs}"
        );
        assert_eq!(epoch_of(&store, &joined, &owner_id).await, 0);

        // the member whose sessions were just ended is refused for that, before any act is read:
        // their open session is behind their row.
        let ended = end_member_sessions(&store, &member, "member-ada", 1_757_000_000_500)
            .await
            .expect_err("a member whose sessions were ended acted from the old session");

        assert!(ended.to_string().contains("another machine"), "{ended}");

        // and a plain member whose session stands holds the act on nobody.
        let noor = a_member(
            &store,
            &owner,
            &joined,
            "member-noor",
            "noor.staff",
            permission::MEMBER,
            "a password noor chose",
        )
        .await;
        let refusal = end_member_sessions(&store, &noor, "member-ada", 1_757_000_000_600)
            .await
            .expect_err("a plain member ended somebody's sessions");

        assert!(refusal.to_string().contains("resetPassword"), "{refusal}");
        assert_eq!(epoch_of(&store, &joined, "member-ada").await, 0);

        // and a manager's sessions are not another manager's to end: the rank is read off the
        // verified rows, and it is the same rank.
        let bea = a_member(
            &store,
            &owner,
            &joined,
            "member-bea",
            "bea.manager",
            permission::MANAGER,
            "a password bea chose",
        )
        .await;
        let refusal = end_member_sessions(&store, &bea, "member-ada", 1_757_000_000_700)
            .await
            .expect_err("a manager ended another manager's sessions");

        assert!(
            matches!(
                refusal,
                crate::error::Error::Refused {
                    reason: crate::error::RefusalReason::RankNotAbove,
                    ..
                }
            ),
            "{refusal:?}"
        );
        assert_eq!(epoch_of(&store, &joined, "member-ada").await, 0);
    }
}
