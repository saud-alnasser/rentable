//! the links waiting to be opened: every invitation and machine link nobody has used yet and that
//! has not lapsed, listed for whoever could have made it, and revoked one at a time (effort 851, at
//! the human's word: "there should be a menu to manage invites to revoke them from the app for who
//! has the permissions for it").
//!
//! **Who sees and revokes a link is who could have made it.** Making one is `inviteMember`'s or
//! `resetPassword`'s, on an account ranked below the maker ([`make_link`](super::make_link)), so the
//! list answers a holder of either flag with the links of the accounts below them, the owner's
//! answer holding every one, and a revoke is refused for an account at or above the reader by the
//! same rule. Both read the actor's verified row (`session::actor`), so a locked member is refused
//! both, as every act of theirs but signing in, their password and their own machines is.
//!
//! **What crosses is facts about a link and never the link.** Whose account it is for, what
//! opening it does, who made it where the row says, when it was made and when it lapses. The text,
//! the code, the secret, the sealed payload and the issuer's sealed copy stay on this side
//! ([[rules/credentials]], *Client boundary*); nothing here reads them.
//!
//! **A revoke deletes the row behind the link and nothing else.** The link's own text still
//! decodes, and its code still opens the payload, but the act that takes the code judges the row
//! before anything is recorded and finds none, so an invitation's accept and a machine link's
//! connect both refuse it as revoked (`join.rs`, `machine.rs`). The account stays as it is: a
//! person who never opened their link is still in the directory with no password of their own, and
//! a new link from their card brings them in. *Effort 826's revoke removed an account that had
//! never been opened along with its link; it went with effort 828, which found nothing calling it,
//! and this one takes back the link alone.*

use serde::{Deserialize, Serialize};

use crate::{
    diagnostics,
    error::{Error, RefusalReason},
};

use super::{InvitationStanding, opened};
use crate::organization::{
    role::permission::{self, Flag},
    session::{Actor, MemberSession, actor, rank_of},
    store::{MemberRecord, OrganizationStore},
};

/// What opening a link does, as far as the rows behind it can truthfully say.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum LinkPurpose {
    /// an invitation for an account nobody has opened yet: whoever opens it joins as that member
    /// and chooses their password.
    Join,
    /// an invitation for an account that was opened once before and whose password was reset: the
    /// person opening it chooses a new password. Told apart from a join by the consumed invitation
    /// the account's first opening left behind, which is how the accept tells them apart too
    /// (`join.rs`, requirement 13).
    Reset,
    /// a machine link: the account has a password, and the link adds a machine that lands at the
    /// wall.
    Machine,
}

/// One link waiting to be opened, as the settings list draws it. No credential, no code, no
/// secret and no sealed payload: facts about the link and nothing that opens it.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OutstandingLink {
    /// the row's id, which is what a revoke names. It is the half id the link's text carries, and
    /// on its own it opens nothing: the secret and the code are what unseal the payload.
    pub id: String,
    /// the account the link is for.
    pub member_id: String,
    /// that account's username, opened with the content key.
    pub username: String,
    pub purpose: LinkPurpose,
    /// the username of whoever made it, where the row records one: an invitation names its issuer
    /// and a machine link names nobody. The issuer sits outside the invitation's signature
    /// (`store/invitation.rs`), so this is what the row says rather than what the chain vouches
    /// for, which is all a line of the list needs.
    pub made_by: Option<String>,
    pub made_at: i64,
    /// when the link and its code stop working: what its maker chose, or sooner where the
    /// credential sealed inside it dies.
    pub expires_at: i64,
}

/// The two flags either of which makes a link, and so either of which sees and revokes one.
const LINK_FLAGS: [Flag; 2] = [Flag::InviteMember, Flag::ResetPassword];

/// The reader, refused unless they may make links at all: settled, unlocked and holding either
/// flag, off their verified row.
async fn link_keeper(store: &OrganizationStore, session: &MemberSession) -> Result<Actor, Error> {
    session.settled()?;

    let actor = actor(store, session).await?;

    permission::require_any(actor.row.effective, &LINK_FLAGS)?;

    Ok(actor)
}

/// The account a link is for, where the reader could have made it: in the organization, not
/// removed, not the owner's, and ranked below the reader.
async fn below_reader<'a>(
    store: &OrganizationStore,
    session: &MemberSession,
    actor: &Actor,
    members: &'a [MemberRecord],
    member_id: &str,
) -> Result<Option<&'a MemberRecord>, Error> {
    let Some(member) = members
        .iter()
        .find(|member| member.id == member_id && member.removed_at.is_none())
    else {
        return Ok(None);
    };

    if member.role_id == permission::OWNER || rank_of(store, session, member).await? >= actor.rank {
        return Ok(None);
    }

    Ok(Some(member))
}

/// Every link waiting to be opened that the reader could have made, the newest first.
///
/// **Waiting means neither used nor lapsed** at `now`: a consumed invitation stays as the record
/// that its account was opened once and a spent machine link as what refuses it, and neither is
/// anything to revoke. An invitation is read through its signature, as the accept reads it, so a
/// row nobody covering it wrote is not listed; a machine link carries none, and is read as the
/// connect reads it.
pub async fn outstanding_links(
    store: &OrganizationStore,
    session: &MemberSession,
    now: i64,
) -> Result<Vec<OutstandingLink>, Error> {
    let actor = link_keeper(store, session).await?;
    let members = store.members(&session.verifying_key).await?;
    let invitations = store.invitations(&session.verifying_key).await?;
    let username_of =
        |member: &MemberRecord| opened(session, "member.username_sealed", &member.username_sealed);
    let mut links = Vec::new();

    for invitation in &invitations {
        if InvitationStanding::of(invitation, now) != InvitationStanding::Open {
            continue;
        }

        let Some(member) =
            below_reader(store, session, &actor, &members, &invitation.member_id).await?
        else {
            continue;
        };
        let reset = invitations.iter().any(|other| {
            other.member_id == member.id && other.id != invitation.id && other.consumed_at.is_some()
        });

        links.push(OutstandingLink {
            id: invitation.id.clone(),
            member_id: member.id.clone(),
            username: username_of(member)?,
            purpose: if reset {
                LinkPurpose::Reset
            } else {
                LinkPurpose::Join
            },
            // a maker whose name will not open is left unnamed rather than failing the list: the
            // line is about the link, and who made it is the least of it.
            made_by: members
                .iter()
                .find(|maker| maker.id == invitation.issued_by)
                .and_then(|maker| username_of(maker).ok()),
            made_at: invitation.created_at,
            expires_at: invitation.expires_at,
        });
    }

    for machine_link in store.machine_links().await? {
        if machine_link.consumed_at.is_some() || machine_link.expires_at <= now {
            continue;
        }

        let Some(member) =
            below_reader(store, session, &actor, &members, &machine_link.member_id).await?
        else {
            continue;
        };

        links.push(OutstandingLink {
            id: machine_link.id,
            member_id: member.id.clone(),
            username: username_of(member)?,
            purpose: LinkPurpose::Machine,
            made_by: None,
            made_at: machine_link.created_at,
            expires_at: machine_link.expires_at,
        });
    }

    links.sort_by(|a, b| b.made_at.cmp(&a.made_at).then_with(|| a.id.cmp(&b.id)));

    Ok(links)
}

/// What a revoke of a link that is not waiting any more is told.
fn not_outstanding() -> Error {
    Error::refused(
        RefusalReason::LinkNotOutstanding,
        "that link is not waiting to be opened: it was used, it lapsed, or it was revoked already",
    )
}

/// Revoke one link waiting to be opened: its row goes, so opening it is refused as revoked, and
/// the change is sent like every other write to the organization.
///
/// **From above, as making it is.** The reader holds `inviteMember` or `resetPassword` and the
/// account ranks below them; one at or above them is refused by name, since somebody who ranks
/// above that account revokes its link. A link that was used, lapsed or already revoked is refused
/// as nothing to revoke.
pub async fn revoke_link(
    store: &OrganizationStore,
    session: &MemberSession,
    link_id: &str,
    now: i64,
) -> Result<(), Error> {
    let actor = link_keeper(store, session).await?;
    let invitation = store
        .invitations(&session.verifying_key)
        .await?
        .into_iter()
        .find(|invitation| invitation.id == link_id);

    let (member_id, is_invitation) = match invitation {
        Some(invitation) => {
            if InvitationStanding::of(&invitation, now) != InvitationStanding::Open {
                return Err(not_outstanding());
            }

            (invitation.member_id, true)
        }
        None => {
            let machine_link = store
                .machine_link(link_id)
                .await?
                .ok_or_else(not_outstanding)?;

            if machine_link.consumed_at.is_some() || machine_link.expires_at <= now {
                return Err(not_outstanding());
            }

            (machine_link.member_id, false)
        }
    };

    let members = store.members(&session.verifying_key).await?;
    let member = members
        .iter()
        .find(|member| member.id == member_id)
        .ok_or_else(|| {
            Error::refused(
                RefusalReason::MemberMissing,
                "that link's member is not in this organization",
            )
        })?;

    actor.outranks(
        rank_of(store, session, member).await?,
        "that member's role is not below yours, so their link is revoked by somebody who ranks \
         above them",
    )?;

    if is_invitation {
        store.delete_invitation(link_id).await?;
    } else {
        store.delete_machine_link(link_id).await?;
    }

    if !store.push().await {
        diagnostics::warn("organization.link.revokeNotYetSent")
            .with("link", link_id)
            .write();
    }

    diagnostics::info("organization.link.revoked")
        .with("member", member_id.as_str())
        .with(
            "kind",
            if is_invitation {
                "invitation"
            } else {
                "machine"
            },
        )
        .write();

    Ok(())
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use serde_json::json;

    use super::{LinkPurpose, OutstandingLink, outstanding_links, revoke_link};
    use crate::credential::{CredentialStore, Memory};
    use crate::error::{Error, RefusalReason};
    use crate::machine::{RemoteSync, RemoteSyncStore};
    use crate::organization::invitation::link::{JoinLink, Locator};
    use crate::organization::invitation::{
        MadeLink, TEST_LIFETIME_HOURS, create_account, join, locator, machine, make_link,
        unset_password,
    };
    use crate::organization::member::lock::unlocked_for_a_test;
    use crate::organization::member::vault::KdfParams;
    use crate::organization::role::permission;
    use crate::organization::session::{CredentialSlot, MemberSession, sign_in};
    use crate::organization::setup::{CreateOrganization, Remote, create_organization};
    use crate::organization::store::{MemberLockRecord, OrganizationStore, Signer};
    use crate::organization::workspace::signer_of;
    use crate::persisted::Persisted;
    use crate::sync::test::server::{ScriptedResponse, ScriptedServer};
    use crate::test::scratch;
    use crate::turso::discovery::McpEndpoint;
    use crate::turso::platform::InMemoryPlatform;

    const PASSWORD: &str = "the owners password";
    const CHOSEN: &str = "a password of their own";
    const AT: i64 = 1_757_000_000_000;
    const HOUR: i64 = 60 * 60 * 1000;

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

    fn no_platform() -> Option<&'static InMemoryPlatform> {
        None
    }

    fn reason_of(error: &Error) -> RefusalReason {
        match error {
            Error::Refused { reason, .. } => *reason,
            other => panic!("not a refusal: {other:?}"),
        }
    }

    fn fresh_machine(directory: &std::path::Path) -> Persisted<RemoteSyncStore> {
        std::fs::create_dir_all(directory).expect("the machine's directory");

        Persisted::<RemoteSyncStore>::load(directory.join(RemoteSync::FILENAME)).expect("the store")
    }

    /// An organization made with its owner, olivia, signed in.
    async fn owned(
        credentials: &dyn CredentialStore,
        directory: &std::path::Path,
    ) -> (OrganizationStore, MemberSession, Locator) {
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
            AT,
        )
        .await
        .expect("the first run failed");
        let joined = record.selected().cloned().expect("the record");
        let owner = sign_in(&store, &joined, PASSWORD, &slot())
            .await
            .expect("the owner did not sign in");
        let locator = locator(&store, &owner).await.expect("the locator");

        (store, owner, locator)
    }

    /// An account `maker` makes in `role`, into no workspace.
    async fn account(
        store: &OrganizationStore,
        maker: &MemberSession,
        username: &str,
        role: &str,
    ) -> String {
        create_account(
            store,
            maker,
            no_platform(),
            username,
            role,
            0,
            &[],
            test_cost(),
            AT,
        )
        .await
        .expect("the account could not be made")
        .id
    }

    /// A link `maker` makes for `member_id` at `now`, lasting `hours`.
    async fn link(
        store: &OrganizationStore,
        maker: &MemberSession,
        locator: &Locator,
        member_id: &str,
        hours: i64,
        now: i64,
    ) -> MadeLink {
        make_link(
            store,
            maker,
            no_platform(),
            locator,
            member_id,
            hours,
            test_cost(),
            now,
        )
        .await
        .expect("the link could not be made")
    }

    /// Open `made` on a fresh machine and choose a password: the account's invitation is spent,
    /// and its person holds a session.
    async fn opened(
        credentials: &dyn CredentialStore,
        store: &OrganizationStore,
        made: &MadeLink,
        name: &str,
        now: i64,
    ) -> Result<MemberSession, Error> {
        let directory = scratch(&format!("outstanding-{name}"));
        let mut machine = fresh_machine(&directory);

        join::accept(
            credentials,
            |_| async { Ok::<_, Error>(store) },
            &mut machine,
            &directory.join("app.db"),
            &JoinLink::decode(&made.link).expect("the link"),
            &made.code,
            CHOSEN,
            test_cost(),
            now,
        )
        .await
        .map(|(_, session)| session)
    }

    /// Connect a fresh machine with a machine link.
    async fn connected(
        store: &OrganizationStore,
        made: &MadeLink,
        name: &str,
        now: i64,
    ) -> Result<(), Error> {
        let directory = scratch(&format!("outstanding-machine-{name}"));
        let mut record = fresh_machine(&directory);

        machine::connect(
            |_| async { Ok::<_, Error>(store) },
            &mut record,
            &directory.join("app.db"),
            &JoinLink::decode(&made.link).expect("the link"),
            &made.code,
            test_cost(),
            now,
            false,
        )
        .await
        .map(|_| ())
    }

    /// Lock `member_id` under the owner's root, as a reset or an invitation would leave them.
    async fn locked_for_a_test(store: &OrganizationStore, owner: &MemberSession, member_id: &str) {
        let (key, certificate) = signer_of(store, owner).await.expect("the owner's signer");

        store
            .write_member_lock(
                &Signer {
                    key: &key,
                    certificate: &certificate,
                },
                &MemberLockRecord {
                    member_id: member_id.to_string(),
                    locked: true,
                    updated_at: AT + 10,
                },
            )
            .await
            .expect("the owner locks them");
    }

    fn half_of(made: &MadeLink) -> String {
        JoinLink::decode(&made.link).expect("the link").half.id
    }

    /// One of each kind waiting, beside a spent invitation and a lapsed link that are not: sami
    /// was invited and never came, noor opened her link and is handed one for another machine, and
    /// rami opened his and was reset.
    struct Organization {
        store: OrganizationStore,
        owner: MemberSession,
        locator: Locator,
        sami: (String, MadeLink),
        noor: (String, MadeLink),
        rami: (String, MadeLink),
        lapsing: (String, MadeLink),
        /// noor's own session, from the machine her first link opened on.
        noor_session: MemberSession,
    }

    async fn organization(credentials: &dyn CredentialStore, name: &str) -> Organization {
        let (store, owner, locator) = owned(credentials, &scratch(name)).await;

        let sami = account(&store, &owner, "sami.staff", permission::MEMBER).await;
        let sami_link = link(&store, &owner, &locator, &sami, TEST_LIFETIME_HOURS, AT).await;

        let noor = account(&store, &owner, "noor.staff", permission::MEMBER).await;
        let first = link(&store, &owner, &locator, &noor, TEST_LIFETIME_HOURS, AT).await;
        let noor_session = opened(credentials, &store, &first, &format!("{name}-noor"), AT + 1)
            .await
            .expect("noor could not open her link");
        let noor_link = link(&store, &owner, &locator, &noor, TEST_LIFETIME_HOURS, AT + 2).await;

        let rami = account(&store, &owner, "rami.staff", permission::MEMBER).await;
        let first = link(&store, &owner, &locator, &rami, TEST_LIFETIME_HOURS, AT).await;
        opened(credentials, &store, &first, &format!("{name}-rami"), AT + 1)
            .await
            .expect("rami could not open his link");
        unset_password(&store, &owner, no_platform(), &rami, test_cost(), AT + 3)
            .await
            .expect("the reset");
        let rami_link = link(&store, &owner, &locator, &rami, TEST_LIFETIME_HOURS, AT + 4).await;

        // an hour's link, which has lapsed by the time the list is read below.
        let lapsing = account(&store, &owner, "lapsing.staff", permission::MEMBER).await;
        let lapsing_link = link(&store, &owner, &locator, &lapsing, 1, AT + 5).await;

        Organization {
            store,
            owner,
            locator,
            sami: (sami, sami_link),
            noor: (noor, noor_link),
            rami: (rami, rami_link),
            lapsing: (lapsing, lapsing_link),
            noor_session,
        }
    }

    /// Effort 851, the human's ask: **every link waiting to be opened is listed, with whom it is
    /// for, what opening it does, who made it where the row says, and when it lapses; a spent
    /// invitation and a lapsed link are not.**
    #[tokio::test]
    async fn the_list_holds_what_is_waiting_and_hides_what_was_used_or_lapsed() {
        let credentials = Memory::new();
        let org = organization(&credentials, "outstanding-list").await;
        let read = AT + 2 * HOUR;
        let links = outstanding_links(&org.store, &org.owner, read)
            .await
            .expect("the list");

        assert_eq!(
            links,
            vec![
                OutstandingLink {
                    id: half_of(&org.rami.1),
                    member_id: org.rami.0.clone(),
                    username: "rami.staff".to_string(),
                    purpose: LinkPurpose::Reset,
                    made_by: Some("olivia".to_string()),
                    made_at: AT + 4,
                    expires_at: org.rami.1.expires_at,
                },
                OutstandingLink {
                    id: half_of(&org.noor.1),
                    member_id: org.noor.0.clone(),
                    username: "noor.staff".to_string(),
                    purpose: LinkPurpose::Machine,
                    made_by: None,
                    made_at: AT + 2,
                    expires_at: org.noor.1.expires_at,
                },
                OutstandingLink {
                    id: half_of(&org.sami.1),
                    member_id: org.sami.0.clone(),
                    username: "sami.staff".to_string(),
                    purpose: LinkPurpose::Join,
                    made_by: Some("olivia".to_string()),
                    made_at: AT,
                    expires_at: org.sami.1.expires_at,
                },
            ],
            "newest first, one of each kind, and nothing spent or lapsed"
        );

        // and the lapsing link was there while it stood.
        let before = outstanding_links(&org.store, &org.owner, AT + 6)
            .await
            .expect("the list");
        assert!(
            before.iter().any(|listed| listed.member_id == org.lapsing.0
                && listed.expires_at == org.lapsing.1.expires_at),
            "an hour's link was not listed inside its hour"
        );
    }

    /// [[rules/credentials]], *Client boundary*: **the list carries facts about a link and nothing
    /// that opens it.** What crosses is exactly the seven fields, and none of the link's text, its
    /// code, its secret or the generated password inside it appears anywhere in what is sent.
    #[tokio::test]
    async fn the_list_never_carries_a_link_a_code_or_a_secret() {
        let credentials = Memory::new();
        let org = organization(&credentials, "outstanding-secrets").await;
        let links = outstanding_links(&org.store, &org.owner, AT + 6)
            .await
            .expect("the list");
        let wire = serde_json::to_value(&links).expect("the wire");
        let text = wire.to_string();

        for listed in wire.as_array().expect("a list") {
            let mut keys: Vec<&str> = listed
                .as_object()
                .expect("an object")
                .keys()
                .map(String::as_str)
                .collect();
            keys.sort_unstable();

            assert_eq!(
                keys,
                [
                    "expiresAt",
                    "id",
                    "madeAt",
                    "madeBy",
                    "memberId",
                    "purpose",
                    "username"
                ]
            );
        }

        for (_, made) in [&org.sami, &org.noor, &org.rami, &org.lapsing] {
            let half = JoinLink::decode(&made.link).expect("the link").half;

            assert!(!text.contains(&made.link), "the link's text crossed");
            assert!(!text.contains(&made.code), "a code crossed");
            assert!(!text.contains(&half.secret), "a link's secret crossed");
        }

        let generated = crate::organization::invitation::vault_password_of(
            &org.sami.1.link,
            &org.sami.1.code,
            test_cost(),
        );
        assert!(!text.contains(&generated), "the generated password crossed");
    }

    /// **A link is seen and revoked by whoever could have made it, and by nobody else.** A
    /// manager sees the links of the members below them and not a fellow manager's, which the
    /// owner made and sees; revoking that one is refused by rank. A member holding neither flag is
    /// refused the list and the revoke; a locked manager is refused both for the lock.
    #[tokio::test]
    async fn the_list_and_the_revoke_answer_who_could_make_the_link() {
        let credentials = Memory::new();
        let org = organization(&credentials, "outstanding-gates").await;

        // ada, a manager, opens her link and is unlocked by the owner; bea, a second manager, is
        // invited and has not come.
        let ada = account(&org.store, &org.owner, "ada.manager", permission::MANAGER).await;
        let ada_link = link(
            &org.store,
            &org.owner,
            &org.locator,
            &ada,
            TEST_LIFETIME_HOURS,
            AT,
        )
        .await;
        let ada_session = opened(&credentials, &org.store, &ada_link, "gates-ada", AT + 1)
            .await
            .expect("ada could not open her link");
        unlocked_for_a_test(&org.store, &org.owner, &ada)
            .await
            .expect("the owner unlocks ada");
        let bea = account(&org.store, &org.owner, "bea.manager", permission::MANAGER).await;
        let bea_link = link(
            &org.store,
            &org.owner,
            &org.locator,
            &bea,
            TEST_LIFETIME_HOURS,
            AT + 5,
        )
        .await;

        let owners = outstanding_links(&org.store, &org.owner, AT + 6)
            .await
            .expect("the owner's list");
        assert!(owners.iter().any(|listed| listed.member_id == bea));

        let adas = outstanding_links(&org.store, &ada_session, AT + 6)
            .await
            .expect("ada's list");
        let mut seen: Vec<&str> = adas.iter().map(|listed| listed.username.as_str()).collect();
        seen.sort_unstable();
        assert_eq!(
            seen,
            ["lapsing.staff", "noor.staff", "rami.staff", "sami.staff"],
            "a manager sees the links below them and not a fellow manager's"
        );

        let refused = revoke_link(&org.store, &ada_session, &half_of(&bea_link), AT + 6)
            .await
            .expect_err("a manager revoked a fellow manager's link");
        assert_eq!(reason_of(&refused), RefusalReason::RankNotAbove);
        assert!(
            outstanding_links(&org.store, &org.owner, AT + 6)
                .await
                .expect("the list")
                .iter()
                .any(|listed| listed.member_id == bea),
            "the refused revoke took the link away"
        );

        // noor, a plain member, holds neither flag; unlocked, so that the flag is what refuses her.
        unlocked_for_a_test(&org.store, &org.owner, &org.noor.0)
            .await
            .expect("the owner unlocks noor");
        let noor_session = &org.noor_session;
        let refused = outstanding_links(&org.store, noor_session, AT + 9)
            .await
            .expect_err("a member with neither flag read the links");
        assert_eq!(reason_of(&refused), RefusalReason::RoleLacksAct);
        let refused = revoke_link(&org.store, noor_session, &half_of(&org.sami.1), AT + 9)
            .await
            .expect_err("a member with neither flag revoked a link");
        assert_eq!(reason_of(&refused), RefusalReason::RoleLacksAct);

        // and ada, locked again, is refused both for the lock.
        locked_for_a_test(&org.store, &org.owner, &ada).await;
        let refused = outstanding_links(&org.store, &ada_session, AT + 11)
            .await
            .expect_err("a locked manager read the links");
        assert_eq!(reason_of(&refused), RefusalReason::Locked);
        let refused = revoke_link(&org.store, &ada_session, &half_of(&org.sami.1), AT + 11)
            .await
            .expect_err("a locked manager revoked a link");
        assert_eq!(reason_of(&refused), RefusalReason::Locked);
    }

    /// **A revoked link is refused as revoked where it is opened, whichever kind it is**, and it
    /// leaves the list; the account stays, and a new link brings the person in. Revoking it again,
    /// or revoking a spent link, is refused as nothing to revoke.
    #[tokio::test]
    async fn a_revoked_link_reads_revoked_on_the_accept_and_the_connect() {
        let credentials = Memory::new();
        let org = organization(&credentials, "outstanding-revoke").await;

        // the invitation: sami's.
        revoke_link(&org.store, &org.owner, &half_of(&org.sami.1), AT + 6)
            .await
            .expect("the owner revokes sami's link");
        let refused = opened(&credentials, &org.store, &org.sami.1, "revoke-sami", AT + 7)
            .await
            .expect_err("a revoked invitation admitted somebody");
        assert_eq!(reason_of(&refused), RefusalReason::Revoked);

        // the machine link: noor's.
        revoke_link(&org.store, &org.owner, &half_of(&org.noor.1), AT + 6)
            .await
            .expect("the owner revokes noor's link");
        let refused = connected(&org.store, &org.noor.1, "revoke-noor", AT + 7)
            .await
            .expect_err("a revoked machine link connected a machine");
        assert_eq!(reason_of(&refused), RefusalReason::Revoked);

        let listed = outstanding_links(&org.store, &org.owner, AT + 8)
            .await
            .expect("the list");
        assert!(
            !listed
                .iter()
                .any(|link| link.member_id == org.sami.0 || link.member_id == org.noor.0),
            "a revoked link is still listed: {listed:?}"
        );

        // nothing left to revoke: the same link again, and a spent one.
        let again = revoke_link(&org.store, &org.owner, &half_of(&org.sami.1), AT + 8)
            .await
            .expect_err("a revoked link was revoked twice");
        assert_eq!(reason_of(&again), RefusalReason::LinkNotOutstanding);
        let lapsed = revoke_link(
            &org.store,
            &org.owner,
            &half_of(&org.lapsing.1),
            AT + 2 * HOUR,
        )
        .await
        .expect_err("a lapsed link was revoked");
        assert_eq!(reason_of(&lapsed), RefusalReason::LinkNotOutstanding);

        // and the account is where it was: a new link admits sami.
        let fresh = link(
            &org.store,
            &org.owner,
            &org.locator,
            &org.sami.0,
            TEST_LIFETIME_HOURS,
            AT + 9,
        )
        .await;
        opened(
            &credentials,
            &org.store,
            &fresh,
            "revoke-sami-again",
            AT + 10,
        )
        .await
        .expect("a new link did not admit sami after a revoke");
    }
}
