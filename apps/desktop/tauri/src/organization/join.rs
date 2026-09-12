//! joining an organization by opening its link: the machine learns where it is, the person's
//! password opens their place in it, and the invitation is spent.
//!
//! **A link is parsed here and nowhere else.** The web layer hands the text over and is told the
//! organization's name and where the invitation stands; the credential the link carries, the
//! verifying key it pins, and the invitation secret stay on this side ([[rules/credentials]],
//! *Client boundary*).
//!
//! **What the machine learns from the link is pinned from the link.** The organization's id, its
//! name, its remote and its verifying key are written into this machine's record of what it has
//! joined exactly as the link spelled them, and the rows the replica pulls are judged by that key
//! from the first read. A database whose rows were rewritten could rewrite the key that checks
//! them; the link cannot be rewritten by the database it points at, which is why `authority.rs`
//! has the key travel this way.
//!
//! **Two halves, and the machine holds neither until the person types one.** The link carries the
//! invitation's secret and the person carries the generated password; the payload opens with
//! both and names the member row, and the row's vault opens with the password alone, which is the
//! same sign-in every later launch performs. Joining is therefore a sign-in with one extra step
//! before it, opening the invitation, and one after it, consuming it. A wrong password answers
//! that the value did not open, and nothing more.
//!
//! **A refused invitation still names the organization** (requirement 23). Where the invitation
//! lapsed, was revoked, or was already used, the link has still found the organization by name,
//! and what the person is told is which of the three it is, so they know what to ask the person
//! who invited them for. The refusal is a refusal of the invitation, never of the link.
//!
//! **The organization's own link restores a place in it** (requirement 6). A link with no
//! invitation half is what the first run produced and what an owner keeps; opened on a machine
//! that has joined nothing, it finds the organization, and the person's email and password open
//! their place in it, as they would on the machine that made it. Nothing is restored from
//! anywhere: the rows are pulled with the link's read-only credential, the vault opens with the
//! password, and every credential unseals from the grants sealed to that vault. The email is
//! the row to look for and nothing more: addresses are sealed, so the password is tried against
//! each member's vault in turn and the address the opened row carries is compared to the one
//! typed; a mismatch is refused as the value not opening, because a password that opens
//! somebody else's vault is not a fact to hand out. An owner typed no address at the first run
//! and has none on their row, so the address is what a person offers where they have one, and
//! the password alone is the whole of the proof either way. A removed member's row is not tried.
//! The Turso authority an owner held is not in any row and is not restored from anywhere: they
//! repeat the consent, and `organization_reconnect_authority` records the account again.
//!
//! **How a link reaches the application.** A link is `rentable://join/...`, and the scheme is
//! registered with the operating system: by the installer on Windows and Linux, from the
//! `deep-link` plugin's configuration, and by `Info.plist` on macOS from the same; a development
//! build registers it for its own executable at startup. Opening the link opens the application,
//! or reaches the instance already running through the single-instance plugin, and the shell
//! puts the join screen on with the link already in it. A person whose platform did not hand the
//! link over, a chat client that refuses unknown schemes, a link copied as text, pastes it into
//! the same screen; that is the fallback and not the design. Both are in
//! `organization/command.rs`'s `organization_link_take` and the shell's listener, and the decision
//! is recorded here because the join ticket made it.

use serde::{Deserialize, Serialize};

use crate::{diagnostics, error::Error, persisted::Persisted, sync::RemoteSyncStore};

use super::{
    JoinedOrganization,
    invite::{InvitationPayload, InvitationStanding},
    link::JoinLink,
    session::{CredentialSlot, MemberSession, sign_in},
    store::OrganizationStore,
    vault::{
        CONTENT_KEY_BYTES, ContentKey, open_content, open_invitation, open_vault,
        unseal_with_secret_key,
    },
};

/// Where a link's invitation stands, as the join screen is told it before it asks for anything.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum LinkStanding {
    /// an open invitation: a password opens it.
    Open,
    /// past its lifetime; the person asks whoever invited them for a new one.
    Lapsed,
    /// used once already; a place in the organization is opened by signing in, not by joining.
    Consumed,
    /// the invitation this link was made for is not in the organization any more.
    Revoked,
    /// the organization's own link, with no invitation in it. It names the organization and
    /// admits nobody; what an owner does with one on a second machine is the restore ticket's.
    None,
}

impl LinkStanding {
    fn of(standing: InvitationStanding) -> Self {
        match standing {
            InvitationStanding::Open => Self::Open,
            InvitationStanding::Lapsed => Self::Lapsed,
            InvitationStanding::Consumed => Self::Consumed,
        }
    }
}

/// What a link says once the organization it points at has been reached: its name, where it is,
/// and where the invitation stands. No credential, no key, no secret.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkFacts {
    pub organization_id: String,
    pub organization_name: String,
    pub remote_url: String,
    pub standing: LinkStanding,
}

/// Read a link against the replica it found, and say where its invitation stands.
///
/// `store` is a replica of the organization the link names, opened with the link's read-only
/// credential and pulled; every row read here is verified against the key the link pinned, so a
/// replica whose rows were not signed by that organization is refused before anything is said
/// about it.
pub async fn inspect(
    store: &OrganizationStore,
    link: &JoinLink,
    now: i64,
) -> Result<LinkFacts, Error> {
    let verifying_key = link.verifying_key_bytes()?;
    let standing = match link.invitation_secret()? {
        None => LinkStanding::None,
        Some((invitation_id, _)) => store
            .invitations(&verifying_key)
            .await?
            .into_iter()
            .find(|invitation| invitation.id == invitation_id)
            .map_or(LinkStanding::Revoked, |invitation| {
                LinkStanding::of(InvitationStanding::of(&invitation, now))
            }),
    };

    Ok(LinkFacts {
        organization_id: link.organization_id.clone(),
        organization_name: link.organization_name.clone(),
        remote_url: link.remote_url.clone(),
        standing,
    })
}

/// Join: open the invitation with both halves, sign in to the row it names, spend the
/// invitation, and record the organization on this machine.
///
/// `store` is the replica `inspect` read, and `credential` its slot, holding the link's read-only
/// credential on the way in and the member's own on the way out: `sign_in` fills it from the
/// grant the vault unsealed, and the push that spends the invitation goes out under that. The
/// record written to `machine` is what every later sign-in on this machine reads, and it carries
/// what the link carried, pinned.
pub async fn join(
    store: &OrganizationStore,
    machine: &mut Persisted<RemoteSyncStore>,
    link: &JoinLink,
    password: &str,
    credential: &CredentialSlot,
    now: i64,
) -> Result<MemberSession, Error> {
    let facts = inspect(store, link, now).await?;
    let (invitation_id, secret) = link
        .invitation_secret()?
        .ok_or_else(|| Error::InvalidInput {
            message: format!(
                "this link finds {} and carries no invitation; ask whoever invited you for one",
                facts.organization_name
            ),
        })?;

    // the refusals that name the organization: the link found it, and the invitation is what is
    // refused.
    match facts.standing {
        LinkStanding::Open => {}
        LinkStanding::Lapsed => {
            return Err(Error::Forbidden {
                message: format!(
                    "the invitation to {} has lapsed; ask whoever invited you for a new one",
                    facts.organization_name
                ),
            });
        }
        LinkStanding::Consumed => {
            return Err(Error::Forbidden {
                message: format!(
                    "the invitation to {} was already used; sign in instead",
                    facts.organization_name
                ),
            });
        }
        LinkStanding::Revoked => {
            return Err(Error::Forbidden {
                message: format!(
                    "the invitation to {} was revoked; ask whoever invited you for a new one",
                    facts.organization_name
                ),
            });
        }
        LinkStanding::None => unreachable!("a link with no invitation was refused above"),
    }

    let verifying_key = link.verifying_key_bytes()?;
    let invitation = store
        .invitations(&verifying_key)
        .await?
        .into_iter()
        .find(|invitation| invitation.id == invitation_id)
        .ok_or_else(|| Error::Forbidden {
            message: format!(
                "the invitation to {} was revoked; ask whoever invited you for a new one",
                facts.organization_name
            ),
        })?;

    // both halves, and the one place the password can fail on this path before the vault.
    let payload: InvitationPayload =
        serde_json::from_slice(&open_invitation(&secret, password, &invitation.sealed)?).map_err(
            |_| Error::Integrity {
                message: "the invitation opened and named nothing".to_string(),
            },
        )?;

    if payload.member_id != invitation.member_id {
        return Err(Error::Integrity {
            message: "the invitation names a member row it was not written for".to_string(),
        });
    }

    let members = store.members(&verifying_key).await?;
    let member = members
        .iter()
        .find(|member| member.id == payload.member_id)
        .ok_or_else(|| Error::NotFound {
            message: format!(
                "the invitation to {} names a member who is not in it any more",
                facts.organization_name
            ),
        })?;
    let joined = JoinedOrganization {
        id: link.organization_id.clone(),
        name: link.organization_name.clone(),
        verifying_key: link.verifying_key.clone(),
        remote_url: link.remote_url.clone(),
        member_id: member.id.clone(),
        role: member.role.clone(),
        joined_at: now,
    };

    // the sign-in every later launch performs, and the slot now holds the member's own credential.
    let session = sign_in(store, &joined, password, credential).await?;

    store.consume_invitation(&invitation_id, now).await?;

    if !store.push().await {
        diagnostics::warn("organization.joined.notYetSent")
            .with("organization", joined.id.as_str())
            .write();
    }

    // one record per organization on this machine: a member invited again to one they had
    // already joined here, which is what a reset produces, replaces their record rather than
    // listing the organization twice.
    machine
        .organizations
        .retain(|recorded| recorded.id != joined.id);
    machine.organizations.push(joined.clone());
    machine.commit()?;

    diagnostics::info("organization.joined")
        .with("organization", joined.id.as_str())
        .with("role", joined.role.as_str())
        .write();

    Ok(session)
}

/// Restore a place in the organization from its own link: the email names the row to look for,
/// the password opens it, and the machine records the organization as the link spelled it.
///
/// `store` is a replica opened with the link's read-only credential and pulled, and `credential`
/// its slot, which `sign_in` fills from the member's grant on the organization database. Works
/// for an owner and for a member alike; what differs is only that an owner then repeats the
/// consent for the Turso authority, which no row holds.
pub async fn restore(
    store: &OrganizationStore,
    machine: &mut Persisted<RemoteSyncStore>,
    link: &JoinLink,
    email: &str,
    password: &str,
    credential: &CredentialSlot,
    now: i64,
) -> Result<MemberSession, Error> {
    let verifying_key = link.verifying_key_bytes()?;
    let wanted = email.trim().to_lowercase();
    let members = store.members(&verifying_key).await?;

    // the password against each vault in turn: addresses are sealed, so nothing narrows the rows
    // before one opens, and a wrong password costs one derivation per member. The first row that
    // opens is the person's, and its address has to be the one typed.
    let mut opened = None;

    for member in members
        .iter()
        .filter(|member| member.role != super::permission::REMOVED)
    {
        if let Ok(secret) = open_vault(password, &member.vault) {
            opened = Some((member, secret));
            break;
        }
    }

    let Some((member, secret)) = opened else {
        // the same sentence a removed member is not told apart from: whether their row is there
        // is theirs to know from whoever removed them, not from a refusal.
        return Err(Error::Forbidden {
            message: format!(
                "the email and password do not open a place in {}",
                link.organization_name
            ),
        });
    };
    let content_key = {
        let bytes = unseal_with_secret_key(&secret, &member.sealed_content_key)?;

        ContentKey::from_bytes(
            <[u8; CONTENT_KEY_BYTES]>::try_from(bytes.as_slice()).map_err(|_| {
                Error::Integrity {
                    message: "the sealed content key is not a content key".to_string(),
                }
            })?,
        )
    };
    let address = String::from_utf8(open_content(
        &content_key,
        "member.email_sealed",
        &member.email_sealed,
    )?)
    .map_err(|_| Error::Integrity {
        message: "member.email_sealed did not open as text".to_string(),
    })?;

    // an address offered has to be the row's; none offered is the owner's case, whose row
    // carries none, and the password is the proof either way.
    if !wanted.is_empty() && address.trim().to_lowercase() != wanted {
        return Err(Error::Forbidden {
            message: format!(
                "the email and password do not open a place in {}",
                link.organization_name
            ),
        });
    }

    let joined = JoinedOrganization {
        id: link.organization_id.clone(),
        name: link.organization_name.clone(),
        verifying_key: link.verifying_key.clone(),
        remote_url: link.remote_url.clone(),
        member_id: member.id.clone(),
        role: member.role.clone(),
        joined_at: now,
    };

    // the sign-in every launch performs, which verifies the rows again and unseals every grant.
    let session = sign_in(store, &joined, password, credential).await?;

    machine
        .organizations
        .retain(|recorded| recorded.id != joined.id);
    machine.organizations.push(joined.clone());
    machine.commit()?;

    diagnostics::info("organization.restored")
        .with("organization", joined.id.as_str())
        .with("role", joined.role.as_str())
        .write();

    Ok(session)
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use serde_json::json;

    use super::{LinkStanding, inspect, join, restore};
    use crate::{
        error::Error,
        organization::{
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
        sync::{
            RemoteSyncStore,
            google::test::server::{ScriptedResponse, ScriptedServer},
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
        let directory = std::env::temp_dir().join(format!("rentable-join-{name}-{nanos:x}"));
        std::fs::create_dir_all(&directory).expect("scratch directory");

        directory
    }

    fn slot() -> CredentialSlot {
        Arc::new(Mutex::new(None))
    }

    /// A second machine's record of what it has joined: nothing yet.
    fn fresh_machine(directory: &std::path::Path) -> Persisted<RemoteSyncStore> {
        let machine = Persisted::<RemoteSyncStore>::load(directory.join("second-machine.json"))
            .expect("the store");

        assert!(
            machine.organizations.is_empty(),
            "the second machine has prior state"
        );

        machine
    }

    /// An organization with its owner signed in, one workspace, and one member invited into it.
    /// The replica the owner wrote is what the joining machine reads once it has pulled; the pull
    /// itself is `organization/store.rs`'s and is not what this module proves.
    async fn invited(
        directory: &std::path::Path,
    ) -> (OrganizationStore, MemberSession, String, String, String) {
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
                password: PASSWORD,
            },
            test_cost(),
            ISSUED_AT,
        )
        .await
        .expect("the first run failed");
        let joined = store.organizations[0].clone();
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
                email: "sami@acme.example",
                display_name: "Sami Staff",
                role: permission::MEMBER,
                workspace_ids: std::slice::from_ref(&workspace.id),
            },
            test_cost(),
            ISSUED_AT,
        )
        .await
        .expect("the invitation failed");

        (
            organization,
            owner,
            invited.join_link,
            invited.generated_password,
            workspace.id,
        )
    }

    /// Criterion 8: a machine with no prior state joins, and what it records is what the link
    /// carried, the key included; the joined member is signed in, holds the workspace they were
    /// granted, and must change their password; and the invitation is spent.
    #[tokio::test]
    async fn opening_the_link_on_a_fresh_machine_records_the_organization_as_the_link_spelled_it() {
        let directory = scratch("fresh");
        let (store, owner, link_text, password, workspace_id) = invited(&directory).await;
        let link = JoinLink::decode(&link_text).expect("the link");
        let mut machine = fresh_machine(&directory);
        let credential = slot();

        // the link alone says which organization and that the invitation is open.
        let facts = inspect(&store, &link, ISSUED_AT + 1)
            .await
            .expect("the link could not be read");

        assert_eq!(facts.organization_name, "Acme");
        assert_eq!(facts.organization_id, owner.organization_id);
        assert_eq!(facts.standing, LinkStanding::Open);

        let session = join(
            &store,
            &mut machine,
            &link,
            &password,
            &credential,
            ISSUED_AT + 2,
        )
        .await
        .expect("the join failed");

        // recorded from the link, pinned, and once.
        assert_eq!(machine.organizations.len(), 1);

        let recorded = &machine.organizations[0];

        assert_eq!(recorded.id, link.organization_id);
        assert_eq!(recorded.name, "Acme");
        assert_eq!(recorded.remote_url, link.remote_url);
        assert_eq!(recorded.verifying_key, link.verifying_key);
        assert_eq!(recorded.member_id, session.member_id);
        assert_eq!(recorded.role, permission::MEMBER);
        assert_eq!(recorded.joined_at, ISSUED_AT + 2);

        // signed in as the member, with what the inviter granted, and made to change the password.
        assert!(session.must_change_password);
        assert_eq!(session.role, permission::MEMBER);
        assert!(session.workspace_credentials.contains_key(&workspace_id));
        assert_eq!(
            credential.lock().expect("the slot").as_deref(),
            owner
                .organization_credential
                .lock()
                .expect("the slot")
                .as_deref(),
            "the slot holds the member's own credential on the way out"
        );

        // and the invitation is spent, which the link now says.
        let facts = inspect(&store, &link, ISSUED_AT + 3)
            .await
            .expect("the link could not be read");

        assert_eq!(facts.standing, LinkStanding::Consumed);
    }

    /// Requirement 8's "nothing useful on its own", from the joining side: the link opens the
    /// invitation only with the password, and the password opens nothing without the link's
    /// half. A wrong password says only that the value did not open, and nothing is recorded.
    #[tokio::test]
    async fn neither_half_alone_joins_and_a_wrong_password_records_nothing() {
        let directory = scratch("halves");
        let (store, _, link_text, password, _) = invited(&directory).await;
        let link = JoinLink::decode(&link_text).expect("the link");
        let mut machine = fresh_machine(&directory);

        let wrong = join(
            &store,
            &mut machine,
            &link,
            "not the password",
            &slot(),
            ISSUED_AT + 1,
        )
        .await;

        assert!(wrong.is_err(), "a wrong password joined");
        assert!(
            machine.organizations.is_empty(),
            "a wrong password was recorded"
        );
        assert_eq!(
            inspect(&store, &link, ISSUED_AT + 1)
                .await
                .expect("the link")
                .standing,
            LinkStanding::Open,
            "a wrong password spent the invitation"
        );

        // the organization's own link, with no invitation half: the password alone.
        let bare = JoinLink {
            invitation: None,
            ..link.clone()
        };

        assert_eq!(
            inspect(&store, &bare, ISSUED_AT + 1)
                .await
                .expect("the link")
                .standing,
            LinkStanding::None
        );

        let refused = join(
            &store,
            &mut machine,
            &bare,
            &password,
            &slot(),
            ISSUED_AT + 1,
        )
        .await;

        assert!(
            matches!(refused, Err(Error::InvalidInput { ref message }) if message.contains("Acme")),
            "{refused:?}"
        );
        assert!(machine.organizations.is_empty());
    }

    /// The verifying key is pinned from the link and not read from the database: a link that
    /// carries a stranger's key finds rows it cannot verify and is refused before anything is
    /// said about the invitation.
    #[tokio::test]
    async fn a_link_carrying_another_key_is_refused_by_the_rows_it_finds() {
        let directory = scratch("pinned");
        let (store, _, link_text, password, _) = invited(&directory).await;
        let mut link = JoinLink::decode(&link_text).expect("the link");
        let mut machine = fresh_machine(&directory);

        link.verifying_key = base64::Engine::encode(
            &base64::engine::general_purpose::URL_SAFE_NO_PAD,
            [7_u8; 32],
        );

        assert!(
            matches!(
                inspect(&store, &link, ISSUED_AT + 1).await,
                Err(Error::Integrity { .. })
            ),
            "a stranger's key read the rows"
        );
        assert!(
            join(
                &store,
                &mut machine,
                &link,
                &password,
                &slot(),
                ISSUED_AT + 1
            )
            .await
            .is_err()
        );
        assert!(machine.organizations.is_empty());
    }

    /// A consumed invitation is not consumed twice, and a lapsed or revoked one is refused with
    /// the organization still named: ticket 11's criterion, seen from this side.
    #[tokio::test]
    async fn a_spent_lapsed_or_revoked_invitation_is_refused_and_the_organization_is_still_named() {
        let directory = scratch("spent");
        let (store, owner, link_text, password, _) = invited(&directory).await;
        let link = JoinLink::decode(&link_text).expect("the link");
        let mut machine = fresh_machine(&directory);

        join(
            &store,
            &mut machine,
            &link,
            &password,
            &slot(),
            ISSUED_AT + 1,
        )
        .await
        .expect("the first join failed");

        // the second attempt, driven: the same link and the same password, refused by name.
        let second = join(
            &store,
            &mut machine,
            &link,
            &password,
            &slot(),
            ISSUED_AT + 2,
        )
        .await;

        assert!(
            matches!(second, Err(Error::Forbidden { ref message }) if message.contains("Acme") && message.contains("already used")),
            "{second:?}"
        );
        assert_eq!(
            machine.organizations.len(),
            1,
            "the second attempt recorded again"
        );

        // a second member, whose invitation lapses before they open it.
        let lapsing = invite_member(
            &store,
            &owner,
            &JoinLink {
                invitation: None,
                ..link.clone()
            },
            Invitation {
                email: "late@acme.example",
                display_name: "Late Member",
                role: permission::MEMBER,
                workspace_ids: &[],
            },
            test_cost(),
            ISSUED_AT,
        )
        .await
        .expect("the second invitation failed");
        let lapsed_link = JoinLink::decode(&lapsing.join_link).expect("the link");
        let after = ISSUED_AT + INVITATION_LIFETIME_MS;
        let facts = inspect(&store, &lapsed_link, after)
            .await
            .expect("the link");

        assert_eq!(facts.organization_name, "Acme");
        assert_eq!(facts.standing, LinkStanding::Lapsed);

        let lapsed = join(
            &store,
            &mut machine,
            &lapsed_link,
            &lapsing.generated_password,
            &slot(),
            after,
        )
        .await;

        assert!(
            matches!(lapsed, Err(Error::Forbidden { ref message }) if message.contains("Acme") && message.contains("lapsed")),
            "{lapsed:?}"
        );

        // and a third, revoked before they open it: the link finds the organization and no
        // invitation.
        let revoking = invite_member(
            &store,
            &owner,
            &JoinLink {
                invitation: None,
                ..link.clone()
            },
            Invitation {
                email: "gone@acme.example",
                display_name: "Gone Member",
                role: permission::MEMBER,
                workspace_ids: &[],
            },
            test_cost(),
            ISSUED_AT,
        )
        .await
        .expect("the third invitation failed");

        crate::organization::invite::revoke_invitation(&store, &owner, &revoking.invitation_id)
            .await
            .expect("the revocation failed");

        let revoked_link = JoinLink::decode(&revoking.join_link).expect("the link");
        let facts = inspect(&store, &revoked_link, ISSUED_AT + 1)
            .await
            .expect("the link");

        assert_eq!(facts.organization_name, "Acme");
        assert_eq!(facts.standing, LinkStanding::Revoked);

        let revoked = join(
            &store,
            &mut machine,
            &revoked_link,
            &revoking.generated_password,
            &slot(),
            ISSUED_AT + 1,
        )
        .await;

        assert!(
            matches!(revoked, Err(Error::Forbidden { ref message }) if message.contains("Acme") && message.contains("revoked")),
            "{revoked:?}"
        );
        assert_eq!(machine.organizations.len(), 1);
    }

    /// Requirement 6, offline: the organization's own link and the owner's email and password
    /// restore their place on a machine that has joined nothing, with the same role, the same
    /// workspaces and the same grants, every row verified against the chain; a member restores
    /// the same way; and the Turso authority is in no row and no file the second machine reads.
    #[tokio::test]
    async fn the_organizations_own_link_restores_an_owner_and_a_member_on_a_fresh_machine() {
        let directory = scratch("restore");
        let (store, owner, link_text, member_password, workspace_id) = invited(&directory).await;
        let link = JoinLink {
            invitation: None,
            ..JoinLink::decode(&link_text).expect("the link")
        };
        let mut machine = fresh_machine(&directory);

        // the owner, by their password: the first run typed no address, and their row has none.
        let credential = slot();
        let restored = restore(
            &store,
            &mut machine,
            &link,
            "",
            PASSWORD,
            &credential,
            ISSUED_AT + 1,
        )
        .await
        .expect("the owner did not restore");

        assert_eq!(restored.role, permission::OWNER);
        assert_eq!(restored.member_id, owner.member_id);
        assert_eq!(restored.permissions, owner.permissions);
        assert_eq!(
            restored.workspace_credentials.keys().collect::<Vec<_>>(),
            owner.workspace_credentials.keys().collect::<Vec<_>>()
        );
        assert_eq!(
            restored.workspace_credentials[&workspace_id].token,
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
        assert_eq!(machine.organizations.len(), 1);
        assert_eq!(machine.organizations[0].role, permission::OWNER);
        assert_eq!(machine.organizations[0].verifying_key, link.verifying_key);

        // the member, by their email and the password they were handed, on another machine.
        let theirs = scratch("restore-member");
        let mut their_machine = fresh_machine(&theirs);
        let member = restore(
            &store,
            &mut their_machine,
            &link,
            " Sami@Acme.example",
            &member_password,
            &slot(),
            ISSUED_AT + 2,
        )
        .await
        .expect("the member did not restore");

        assert_eq!(member.role, permission::MEMBER);
        assert!(member.must_change_password);
        assert!(member.workspace_credentials.contains_key(&workspace_id));

        // the wrong email with the right password, and the right email with the wrong password,
        // are refused with one sentence and record nothing.
        let mut nobody = fresh_machine(&scratch("restore-nobody"));

        for (email, password) in [
            ("sami@acme.example", "not the password"),
            ("", "not the password"),
            ("sami@acme.example", PASSWORD),
            ("somebody@else.example", &member_password),
        ] {
            let refused = restore(
                &store,
                &mut nobody,
                &link,
                email,
                password,
                &slot(),
                ISSUED_AT + 3,
            )
            .await;

            assert!(refused.is_err(), "{email:?} restored with {password:?}");
            assert!(nobody.organizations.is_empty());
        }

        // and the authority: the platform token that created the organization is in no cell of
        // any table and in no file the second machine wrote.
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

                    assert!(
                        !bytes
                            .windows("a-platform-token".len())
                            .any(|window| window == b"a-platform-token"),
                        "the platform token is in a {table} column"
                    );
                }
            }
        }

        let recorded =
            std::fs::read_to_string(directory.join("second-machine.json")).expect("the file");

        assert!(!recorded.contains("a-platform-token"));
        assert!(!recorded.contains("token-for-"));
    }

    /// Criterion 15 against the rows a real invitation wrote: given the link's contents and a
    /// credential that reads every row, no email, display name or workspace name is legible.
    /// `store.rs` proves it over hand-written rows; this is the same read over what `invite` and
    /// `create_workspace` actually write.
    #[tokio::test]
    async fn the_rows_a_link_holder_reads_carry_no_email_no_name_and_no_workspace_name() {
        let directory = scratch("legible");
        let (store, _, link_text, password, _) = invited(&directory).await;
        let link = JoinLink::decode(&link_text).expect("the link");
        let secrets = [
            "sami@acme.example",
            "Sami Staff",
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
        for secret in [
            "sami@acme.example",
            "Sami Staff",
            "North",
            password.as_str(),
        ] {
            assert!(!link_text.contains(secret), "{secret:?} is in the link");
        }
        assert_eq!(link.organization_name, "Acme");
    }

    /// Live, at the human's request, and admitted in [[rules/testing]] under *Tests that reach a
    /// live remote* as criterion 6: **an organization provisioned on machine A is restored on
    /// machine B from the link, the email, the password and one consent, with A offline.**
    ///
    /// Two machines are two application data directories in one process, and A is offline in
    /// the sense that matters: its replica is closed and nothing of its directory is read after
    /// the provisioning; B starts from an empty directory and is handed the link text, the
    /// owner's password, and the consent's product. The consent's product is the platform token,
    /// read from the environment as every live test here reads it, and it is the one thing the
    /// keyring holds in common between the two, because this process has one keyring. What the
    /// test cannot cover is two operating-system accounts and two keyrings; what it does cover is
    /// that nothing about the organization is machine-local, which is the property. The member is
    /// restored on a third directory the same way, by their email and the password they were
    /// handed. Both databases are deleted by the same run.
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

        let joined_a = store_a.organizations[0].clone();
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
                email: "sami@acme.example",
                display_name: "Sami Staff",
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

        assert!(
            link.invitation.is_none(),
            "the first run's link carries an invitation"
        );

        // machine B: an empty directory, the link, and the owner's password.
        let machine_b = scratch("live-b");
        let mut store_b = fresh_machine(&machine_b);
        let credential_b: CredentialSlot =
            Arc::new(Mutex::new(Some(link.read_only_credential.clone())));
        let slot_b = Arc::clone(&credential_b);
        let organization_b = OrganizationStore::open(
            &OrganizationStore::replica_path(&machine_b.join("app.db"), &link.organization_id),
            Some(link.remote_url.clone()),
            move || {
                let slot = Arc::clone(&slot_b);

                async move {
                    slot.lock()
                        .ok()
                        .and_then(|slot| slot.clone())
                        .ok_or_else(|| turso::Error::Misuse("no credential".into()))
                }
            },
        )
        .await
        .expect("B's replica did not open");

        assert!(
            organization_b.pull().await,
            "B pulled nothing from the account"
        );

        let restored = restore(
            &organization_b,
            &mut store_b,
            &link,
            "",
            PASSWORD,
            &credential_b,
            now(),
        )
        .await
        .expect("the owner did not restore on B");

        eprintln!("restored the owner on B as {}", restored.role);
        assert_eq!(restored.role, permission::OWNER);
        assert_eq!(restored.member_id, joined_a.member_id);
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

        // machine C: the member, by their email and the password they were handed.
        let machine_c = scratch("live-c");
        let mut store_c = fresh_machine(&machine_c);
        let credential_c: CredentialSlot =
            Arc::new(Mutex::new(Some(link.read_only_credential.clone())));
        let slot_c = Arc::clone(&credential_c);
        let organization_c = OrganizationStore::open(
            &OrganizationStore::replica_path(&machine_c.join("app.db"), &link.organization_id),
            Some(link.remote_url.clone()),
            move || {
                let slot = Arc::clone(&slot_c);

                async move {
                    slot.lock()
                        .ok()
                        .and_then(|slot| slot.clone())
                        .ok_or_else(|| turso::Error::Misuse("no credential".into()))
                }
            },
        )
        .await
        .expect("C's replica did not open");

        assert!(
            organization_c.pull().await,
            "C pulled nothing from the account"
        );

        let member_c = restore(
            &organization_c,
            &mut store_c,
            &link,
            "sami@acme.example",
            &invited.generated_password,
            &credential_c,
            now(),
        )
        .await
        .expect("the member did not restore on C");

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
