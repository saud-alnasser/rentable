//! the way in: what a link says about the organization it names, and the sign-in at the wall
//! that admits a person to the organization this machine holds.
//!
//! **A link is parsed in `link.rs` and read there.** The web layer hands the text over and is
//! told which organization it names, which kind of link it is and when it lapses; the credential
//! the link carries and the verifying key it pins stay on this side ([[rules/credentials]],
//! *Client boundary*). There are two kinds and each takes the code first: a machine link goes to
//! `machine::connect`, which unseals the payload and then connects (`connect.rs`), recording the
//! organization and no member; an invitation link goes to [`accept`]. *A third kind, the
//! organization's own, reached the connect directly with a credential anybody could read off it,
//! and effort 828's requirement 16 retired it.*
//!
//! **Signing in is a username and a password against the held organization** (effort 824,
//! requirement 19). The wall asks for both; `session::sign_in_by_username` tries the password
//! against each member's vault and checks the username on the row that opens, and what happens
//! here is the rest of the act: the machine's record learns which member this person is. A wrong
//! password, a username nobody holds, and a username held by somebody whose password this is not
//! are refused with one sentence, and nothing says whether the username exists. *819's join
//! opened a sealed payload with the link's half of a secret and the password to find the member's
//! row, and its restore tried every vault by the organization's own link; requirement 18 retires
//! both, and the vault trial is the one way in now.*
//!
//! **Opening an invitation link is the other way in, and it is where a password is chosen**
//! (effort 826, requirements 8 and 9; effort 828, requirement 1). The link carries no legible
//! credential, so [`accept`] does everything and does it in one order: unseal the payload with
//! the code, reach the organization with the credential that comes out, record it on this machine
//! where it holds none, judge the invitation row, open the vault with the password the payload
//! held, reseal it under the password the person chose, spend the invitation, record the member
//! and sign them in. A reset is the same link freshly issued, so a member locked out by a
//! forgotten password comes back the same way. Nothing at the wall asks anybody to change a
//! password any more: the row's `must_change_password` is written false by the accept, and the
//! sign-in path reads it as false, because a person who reached the wall by the generated secret
//! typed nothing they were shown.
//!
//! **Nothing is reached before the code is typed.** `locator_inspect` opened the
//! replica with the link's clear credential and judged the invitation's standing before the
//! person had given anything; there is no clear credential to do that with now, so reading a link
//! is `link::read`, a decode, and the standing is judged here, inside the act that takes the code.
//! The four standings survive as the sentences [`invitation_refused`] writes.
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
//! `organization/command.rs`'s `locator_take` and the shell's listener, and the decision
//! is recorded here because the join ticket made it.

use std::sync::{Arc, Mutex};

use crate::{
    diagnostics,
    error::{Error, RefusalReason},
    persisted::Persisted,
    sync::RemoteSyncStore,
};

use super::{
    HeldOrganization, connect,
    invite::InvitationStanding,
    link::{HalfKind, JoinLink, open_payload},
    permission,
    session::{
        CredentialSlot, MemberSession, content_key_of, machine_seen, open_session, refused_by_name,
        remember, sign_in_by_username,
    },
    setup::MINIMUM_PASSWORD_LENGTH,
    store::{InvitationRecord, MemberRecord, OrganizationStore},
    vault::{KdfParams, open_vault, reseal_vault_with_key},
};

/// Why an invitation no longer opens, which is what the sentence a person reads names.
///
/// *These were `LinkStanding`'s four values, answered to the connect screen before anybody had
/// typed anything. Nothing reads a row before the code is out, so the standing is judged inside
/// the accept and these survive as the reasons a refusal carries.*
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Refusal {
    /// past its lifetime; a new link is what the person needs.
    Lapsed,
    /// opened once already.
    Consumed,
    /// the invitation this link was made for is gone, or the member it named is.
    Revoked,
}

/// The one sentence an invitation that no longer opens is refused with: which of the three it is,
/// and the organization it was for, since the link names the organization and the invitation is
/// what is refused.
///
/// **It crosses as `Error::Refused` with the reason beside the message**, never as `Forbidden`,
/// which a wrong code keeps. The screen draws its own sentence per standing and offers the wall
/// on a spent link, so what it needs is the word and not the prose.
fn invitation_refused(organization_name: &str, refusal: Refusal) -> Error {
    let (reason, why) = match refusal {
        Refusal::Lapsed => (RefusalReason::Lapsed, "has lapsed"),
        Refusal::Consumed => (RefusalReason::Consumed, "was already opened"),
        Refusal::Revoked => (RefusalReason::Revoked, "was revoked"),
    };

    Error::Refused {
        reason,
        message: format!(
            "the invitation to {organization_name} {why}; ask whoever invited you for a new link"
        ),
    }
}

/// Open an invitation link: the way in for an invited or a reset member (effort 826, requirements
/// 8 and 9; effort 828, requirement 1).
///
/// `store_for` opens a replica of the organization the link names against a credential slot, which
/// is how the reach happens *after* the unseal rather than before it; `machine` is this machine's
/// record, which may hold the organization already or nothing at all; `code` is the six characters
/// the issuer read out, and `password` is the one the person chose, held to the first run's floor
/// because a member's vault is sealed the way the owner's is.
///
/// **The order is what this function is.** Unseal the payload with the code and the link's secret
/// together; reach the organization with the credential that comes out; record it on this machine
/// where it holds none, and refuse another organization's link where it holds one; judge the
/// invitation row, refusing a lapsed, consumed or revoked one by name; open the vault with the
/// password the payload held; reseal it under the password the person chose, with
/// `must_change_password` written false; spend the invitation; and record which member this person
/// is. A consumed link still connects the machine, so a person setting a second machine up with a
/// spent link lands at the wall rather than at a dead end.
///
/// **The code is checked by being used, and never by being compared.** A wrong one derives a key
/// like any other, that key fails the AEAD tag, and there is no stored verifier and no boolean a
/// modified client could make return true, which is the same shape a wrong password has. The one
/// refusal the clock decides is the link's own moment, which is refused before any key is derived,
/// because deriving for a link that is already dead is a free pass for whoever is guessing.
/// **`store_for` is how the reach happens after the unseal.** It is handed the slot the credential
/// lands in and answers a replica reading from it, and the replica comes back to the caller with
/// the session, because whoever called this is who goes on holding it. What it answers only has to
/// *be* an organization store: the application hands over one it opened for this accept, and a
/// test hands over the one it is already holding, which is the same read either way.
#[allow(clippy::too_many_arguments)]
pub async fn accept<S, F, R>(
    store_for: S,
    machine: &mut Persisted<RemoteSyncStore>,
    link: &JoinLink,
    code: &str,
    password: &str,
    kdf_params: KdfParams,
    now: i64,
) -> Result<(R, MemberSession), Error>
where
    S: FnOnce(CredentialSlot) -> F,
    F: std::future::Future<Output = Result<R, Error>>,
    R: std::borrow::Borrow<OrganizationStore>,
{
    let no_invitation = || Error::InvalidInput {
        message: "this link carries no invitation; sign in with your username and password"
            .to_string(),
    };
    let half = &link.half;

    if half.kind != HalfKind::Invitation {
        return Err(no_invitation());
    }

    if password.chars().count() < MINIMUM_PASSWORD_LENGTH {
        return Err(Error::InvalidInput {
            message: format!(
                "the password needs at least {MINIMUM_PASSWORD_LENGTH} characters. it is the only \
                 thing between anybody holding the organization's records and reading them"
            ),
        });
    }

    // the link's own moment, before any key is derived. What the seal binds includes this moment,
    // so a rewritten copy opens nothing either way; refusing here is what keeps a dead link from
    // costing an Argon2id pass per guess.
    if half.expires_at <= now {
        return Err(invitation_refused(&link.organization_name, Refusal::Lapsed));
    }

    // the code and the link's secret together: the code keys the seal and the secret salts it, so
    // neither on its own derives anything (effort 828, requirement 1). What comes out is the
    // issuer's own grant on the organization database and the password their vault was made under.
    let payload = open_payload(code, &link.locator(), half, &link.credential, kdf_params)?;
    let vault_password = payload
        .vault_password
        .ok_or_else(|| invitation_refused(&link.organization_name, Refusal::Revoked))?;

    // the reach, under the credential that was inside the link, held in the slot the replica reads
    // from and the session fills with the member's own on the way out ([[rules/credentials]]).
    let credential: CredentialSlot = Arc::new(Mutex::new(Some(payload.credential.clone())));
    let reached = store_for(Arc::clone(&credential)).await?;
    let store = reached.borrow();

    let held = match machine.organization.clone() {
        Some(held) if held.id == link.organization_id => held,
        Some(held) => {
            return Err(Error::PreconditionFailed {
                message: format!(
                    "this link is for {} and this machine holds {}; disconnect it first",
                    link.organization_name, held.name
                ),
            });
        }
        None => connect::connect(store, machine, &link.locator(), &payload.credential, now).await?,
    };

    let verifying_key = super::session::verifying_key_of(&held)?;
    let invitations = store.invitations(&verifying_key).await?;
    let invitation: &InvitationRecord = invitations
        .iter()
        .find(|invitation| invitation.id == half.id)
        .ok_or_else(|| invitation_refused(&held.name, Refusal::Revoked))?;

    match InvitationStanding::of(invitation, now) {
        InvitationStanding::Open => {}
        InvitationStanding::Lapsed => {
            return Err(invitation_refused(&held.name, Refusal::Lapsed));
        }
        InvitationStanding::Consumed => {
            return Err(invitation_refused(&held.name, Refusal::Consumed));
        }
    }

    let members = store.members(&verifying_key).await?;
    let member: &MemberRecord = members
        .iter()
        .find(|member| member.id == invitation.member_id)
        .ok_or_else(|| invitation_refused(&held.name, Refusal::Revoked))?;

    if member.role == permission::REMOVED {
        return Err(invitation_refused(&held.name, Refusal::Revoked));
    }

    // that password is the one thing that opens this vault; a link somebody altered says no more
    // than a wrong password would.
    let secret =
        open_vault(&vault_password, &member.vault).map_err(|_| refused_by_name(&held.name))?;
    let content_key = content_key_of(member, &secret)?;

    // the rest of a sign-in: every grant the vault holds, the organization's into the slot the
    // replica pushes under from here on, over the link's credential that is in it now.
    let mut session = open_session(
        store,
        &held,
        verifying_key,
        member,
        secret,
        content_key,
        &credential,
    )
    .await?;

    // the password they chose, over the same keypair: nothing sealed to them is touched, and the
    // generated secret opens nothing from now on.
    let (vault, member_key) = reseal_vault_with_key(&session.secret, password, kdf_params)?;

    store.reseal_member(&member.id, &vault, false, now).await?;

    // this machine stays signed in from here, on the key the password they just chose derives
    // (effort 826, requirement 12). Filed after the row is written, so a re-seal that did not
    // land leaves no key behind for a vault it does not open.
    remember(
        &held.id,
        &session.member_id,
        session.session_epoch,
        &member_key,
    );
    store.consume_invitation(&invitation.id, now).await?;

    if !store.push().await {
        diagnostics::warn("organization.invitation.acceptedNotYetSent")
            .with("invitation", invitation.id.as_str())
            .write();
    }

    // an accepted invitation is a sign-in, so the registry learns who is on this machine (effort
    // 828, requirement 15): the row `connect::connect` wrote above names nobody yet.
    machine_seen(store, &held, Some(&session.member_id), now).await;

    session.must_change_password = false;

    machine.organization = Some(HeldOrganization {
        member_id: Some(session.member_id.clone()),
        role: Some(session.role.clone()),
        ..held.clone()
    });
    machine.commit()?;

    diagnostics::info("organization.invitation.accepted")
        .with("organization", held.id.as_str())
        .with("member", session.member_id.as_str())
        .with("role", session.role.as_str())
        .write();

    Ok((reached, session))
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
    // a row still carrying `must_change_password` is one whose invitation link has not been
    // opened, and the wall refuses it inside the sign-in itself; every session that reaches here
    // has a password of its own, so nothing about the flag is acted on (effort 826, ticket 03).
    let session = sign_in_by_username(store, held, username, password, credential).await?;

    let filled = HeldOrganization {
        member_id: Some(session.member_id.clone()),
        role: Some(session.role.clone()),
        ..held.clone()
    };

    // the registry learns who is on this machine (effort 828, requirement 15). After the sign-in,
    // because the push it makes goes out under the credential the vault just unsealed.
    machine_seen(store, &filled, Some(&session.member_id), now).await;

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

    use super::{accept, admit};
    use crate::{
        database::Database,
        error::{Error, RefusalReason},
        keyring::{self, take_the_credential_store},
        organization::{
            HeldOrganization, connect,
            invite::{
                INVITATION_LIFETIME_MS, Invitation, WorkspaceGrant, locator, make_account_and_link,
            },
            link::{
                CODE_MISSING, CODE_REFUSED, Half, HalfKind, JoinLink, LinkKind, Locator,
                open_payload,
            },
            migrate::Pipeline,
            permission,
            session::{CredentialSlot, MEMBER_KEY_SERVICE, MemberSession, read_entry, sign_in},
            setup::{CreateOrganization, Remote, create_organization},
            store::OrganizationStore,
            vault::{KdfParams, open_sealed_secret_key},
            workspace::create_workspace,
        },
        persisted::Persisted,
        settings::Settings,
        state::AppState,
        sync::{
            RemoteSync, RemoteSyncStore,
            test::server::{ScriptedResponse, ScriptedServer},
            turso::{
                consent::TursoConsent,
                discovery::McpEndpoint,
                platform::{AccessLevel, InMemoryPlatform},
            },
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
    /// No platform authority in hand, which is every session here but the owner's with one.
    fn no_platform() -> Option<&'static InMemoryPlatform> {
        None
    }

    /// Full access on each workspace named, which is what every invitation here grants.
    fn full(ids: &[String]) -> Vec<WorkspaceGrant> {
        ids.iter()
            .map(|id| WorkspaceGrant {
                id: id.clone(),
                access: AccessLevel::FullAccess,
            })
            .collect()
    }

    /// A second machine's record, connected to the organization by its link: the organization
    /// named, and no member yet, which is what a person signs in against at the wall.
    async fn connected_machine(
        directory: &std::path::Path,
        store: &OrganizationStore,
        link: &Locator,
    ) -> (Persisted<RemoteSyncStore>, HeldOrganization) {
        let mut machine = Persisted::<RemoteSyncStore>::load(directory.join(RemoteSync::FILENAME))
            .expect("the store");

        assert!(
            machine.organization.is_none(),
            "the second machine has prior state"
        );

        let held = connect::connect(store, &mut machine, link, REACHED_WITH, ISSUED_AT + 1)
            .await
            .expect("the connect failed");

        assert_eq!(held.member_id, None);

        (machine, held)
    }

    /// An organization with its owner signed in, one workspace, and one member invited into it:
    /// the store with two members every test here runs over, the organization's locator (the four
    /// clear fields every link seals a payload onto; nothing connects with it alone), and the
    /// member's invitation link. The replica the owner wrote is what a connected machine reads once
    /// it has pulled; the pull itself is `organization/store.rs`'s and is not what this module
    /// proves.
    async fn invited(
        directory: &std::path::Path,
    ) -> (
        OrganizationStore,
        MemberSession,
        Locator,
        JoinLink,
        String,
        String,
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
        let link = locator(&organization, &owner)
            .await
            .expect("the organization's link");
        let invited = make_account_and_link(
            &organization,
            &owner,
            no_platform(),
            &link,
            Invitation {
                username: "sami.staff",
                role: permission::MEMBER,
                workspaces: &full(std::slice::from_ref(&workspace.id)),
            },
            test_cost(),
            ISSUED_AT,
        )
        .await
        .expect("the invitation failed");
        let invitation = JoinLink::decode(&invited.join_link).expect("the invitation's link");

        assert_eq!(
            invitation.organization_id, link.organization_id,
            "an invitation link is the organization's locator with a sealed payload in it"
        );
        assert_eq!(invitation.verifying_key, link.verifying_key);
        assert_eq!(invitation.remote_url, link.remote_url);
        assert!(
            !invitation.credential.is_empty(),
            "an invitation link carries no sealed payload"
        );
        assert_eq!(
            Some(invitation.half.id.as_str()),
            Some(invited.invitation_id.as_str())
        );

        (
            organization,
            owner,
            link,
            invitation,
            workspace.id,
            invited.code,
        )
    }

    /// The password the invited member chooses when they open their link.
    const CHOSEN: &str = "a password sami chose";

    /// What a caller holds by the time it reaches `connect::connect`: the credential the link's
    /// code unsealed, which the replica handed in stands for here.
    const REACHED_WITH: &str = "the-credential-the-code-opened";

    /// `invitation` opened on a machine that holds nothing, choosing `password`: what a person
    /// does with the link they were sent, on the machine they were sent it on. The accept records
    /// the organization itself, so nothing connects first (effort 828, requirement 1).
    async fn opened(
        directory: &std::path::Path,
        store: &OrganizationStore,
        invitation: &JoinLink,
        code: &str,
        password: &str,
        now: i64,
    ) -> (Persisted<RemoteSyncStore>, Result<MemberSession, Error>) {
        let mut machine = Persisted::<RemoteSyncStore>::load(directory.join(RemoteSync::FILENAME))
            .expect("the store");

        assert!(
            machine.organization.is_none(),
            "the second machine has prior state"
        );

        let session = accept_on(&mut machine, store, invitation, code, password, now).await;

        (machine, session)
    }

    /// The accept, over one machine's record and the replica this test already holds.
    ///
    /// **The replica is handed in rather than opened.** In the application `command::reached`
    /// answers with one it opened against the credential the code unsealed; here the organization
    /// is a local file every test in this module shares, and what the accept does with it is the
    /// same read either way.
    async fn accept_on(
        machine: &mut Persisted<RemoteSyncStore>,
        store: &OrganizationStore,
        link: &JoinLink,
        code: &str,
        password: &str,
        now: i64,
    ) -> Result<MemberSession, Error> {
        accept(
            |_| async { Ok::<_, Error>(store) },
            machine,
            link,
            code,
            password,
            test_cost(),
            now,
        )
        .await
        .map(|(_, session)| session)
    }

    /// What a machine's record names, once something has recorded an organization on it.
    fn held_by(machine: &Persisted<RemoteSyncStore>) -> HeldOrganization {
        machine
            .organization
            .clone()
            .expect("the machine holds no organization")
    }

    /// The invitation naming `member_id`, as the rows hold it: `(expires_at, consumed_at)`, the
    /// most recent where there are several.
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
            .filter(|invitation| invitation.member_id == member_id)
            .max_by_key(|invitation| invitation.created_at)
            .map(|invitation| (invitation.expires_at, invitation.consumed_at))
    }

    /// Effort 828, requirement 1: **reading a link is a decode, and it reaches nothing.**
    ///
    /// An invitation link names the organization, says which kind of link it is and says when it
    /// lapses, and the read touches no replica, which is what makes it answerable before anybody
    /// has typed a code. A link for an invitation nobody issued reads exactly like one for an
    /// invitation that stands, because a decode has no row to tell them apart; which it is, is what
    /// the accept answers, and the test below it is where that is pinned.
    #[tokio::test]
    async fn reading_a_link_is_a_decode_and_says_nothing_about_the_row() {
        let directory = scratch("read");
        let (_, owner, link, invitation, _, _) = invited(&directory).await;

        let shape = crate::organization::link::read(&invitation.encode().expect("the link"))
            .expect("the invitation link could not be read");

        assert_eq!(shape.organization_name, "Acme");
        assert_eq!(shape.organization_id, owner.organization_id);
        assert_eq!(shape.kind, LinkKind::Invitation);
        assert_eq!(
            shape.expires_at,
            ISSUED_AT + INVITATION_LIFETIME_MS,
            "the invitation link does not lapse with its row"
        );

        // the same link with its id pointed at an invitation nobody issued reads the same: a
        // decode has no row in front of it.
        let gone = link.sealed(
            &invitation.credential,
            Half {
                id: "an-invitation-nobody-issued".to_string(),
                ..invitation.half.clone()
            },
        );

        assert_eq!(
            crate::organization::link::read(&gone.encode().expect("the link"))
                .expect("the gone link could not be read")
                .kind,
            LinkKind::Invitation
        );
    }

    /// Criterion 19 and effort 826's criterion 8: over a store with two members, the owner signs
    /// in by username and password on a machine that connected by link and knew no member, in
    /// whatever case and spacing the username was typed, and the record then names them and their
    /// role, on disk. The invited member opens their link on their own machine choosing a
    /// password: their vault is resealed under it, the invitation is spent, the record names
    /// them, and they are signed in with nothing left to change. The password they chose is what
    /// admits them at the wall from then on, the secret the link carried opens nothing, and the
    /// link opened a second time is refused as already opened.
    #[tokio::test]
    async fn the_owner_signs_in_at_the_wall_and_the_invited_member_opens_their_link() {
        let directory = scratch("admit");
        let (store, owner, link, invitation, workspace_id, code) = invited(&directory).await;

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
            ISSUED_AT,
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

        // the member, on their own machine, by the link they were sent and a password they chose.
        let theirs = scratch("admit-member");

        assert_eq!(
            invitation_of(&store, &owner, &session.member_id).await,
            None,
            "the owner has an invitation"
        );

        let (mut their_machine, member) =
            opened(&theirs, &store, &invitation, &code, CHOSEN, ISSUED_AT + 3).await;
        let member = member.expect("the member could not open their link");
        let their_held = held_by(&their_machine);

        // the accept recorded the organization on a machine that held nothing, which is why the
        // person never had to connect first (effort 828, requirement 1).
        assert_eq!(their_held.id, link.organization_id);
        assert_eq!(their_held.verifying_key, link.verifying_key);
        assert_eq!(their_held.joined_at, ISSUED_AT + 3);

        assert_eq!(member.role, permission::MEMBER);
        assert_eq!(member.permissions, 0);
        assert!(
            !member.must_change_password,
            "opening the link left the member with a password to change"
        );
        assert!(member.workspace_credentials.contains_key(&workspace_id));
        assert_eq!(
            member.workspace_credentials[&workspace_id].token,
            owner.workspace_credentials[&workspace_id].token
        );
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

        let row = store
            .members(&owner.verifying_key)
            .await
            .expect("the rows")
            .into_iter()
            .find(|row| row.id == member.member_id)
            .expect("the member's row");

        assert!(!row.must_change_password, "the row still says to change");

        let written = std::fs::read_to_string(theirs.join(RemoteSync::FILENAME)).expect("the file");
        let secret = invitation.half.secret.clone();

        assert!(
            !written.contains(CHOSEN),
            "the chosen password reached the record"
        );
        assert!(
            !written.contains(&secret),
            "the link's secret reached the record"
        );

        // from now on the wall admits them on the password they chose, and on nothing else.
        let again = admit(
            &store,
            &mut their_machine,
            &their_held,
            " Sami.Staff ",
            CHOSEN,
            &slot(),
            ISSUED_AT,
        )
        .await
        .expect("the chosen password does not admit the member");

        assert!(!again.must_change_password);
        assert!(
            admit(
                &store,
                &mut their_machine,
                &their_held,
                "sami.staff",
                &secret,
                &slot(),
                ISSUED_AT,
            )
            .await
            .is_err(),
            "the link's secret still opens the vault"
        );

        // the link opened again is a consumed invitation, refused by name.
        let refused = accept_on(
            &mut their_machine,
            &store,
            &invitation,
            &code,
            "another password entirely",
            ISSUED_AT + 4,
        )
        .await;

        assert!(
            matches!(refused, Err(Error::Refused { reason: RefusalReason::Consumed, ref message })
                if message.contains("Acme")),
            "{refused:?}"
        );
        assert_eq!(
            invitation_of(&store, &owner, &member.member_id).await,
            Some((ISSUED_AT + INVITATION_LIFETIME_MS, Some(ISSUED_AT + 3))),
            "the second opening moved the invitation"
        );

        // and on a third machine that holds nothing, the same spent link still lands it connected
        // before the row is judged: the code was right, so the credential came out and reached the
        // organization, and the person setting a second machine up meets the wall rather than a
        // dead end (effort 828, requirement 1).
        let third = scratch("admit-third");
        let (spent_machine, spent) =
            opened(&third, &store, &invitation, &code, CHOSEN, ISSUED_AT + 5).await;

        assert!(
            matches!(
                spent,
                Err(Error::Refused {
                    reason: RefusalReason::Consumed,
                    ..
                })
            ),
            "{spent:?}"
        );

        let recorded = held_by(&spent_machine);

        assert_eq!(recorded.id, link.organization_id);
        assert_eq!(recorded.verifying_key, link.verifying_key);
        assert_eq!(recorded.member_id, None, "a spent link recorded a member");
        assert_eq!(recorded.role, None);
    }

    /// Criterion 19's refusals, over the same two members once the member has opened their link:
    /// the wrong password, a username nobody holds, and a username somebody holds with another
    /// member's password are each refused with the same one sentence, so nothing says whether the
    /// username exists; nothing is recorded, and the invitation is as the accept left it.
    #[tokio::test]
    async fn the_wrong_password_an_unknown_username_and_another_members_password_are_one_sentence()
    {
        let directory = scratch("refused");
        let (store, owner, link, invitation, _, code) = invited(&directory).await;
        let (_, member) = opened(
            &scratch("refused-member"),
            &store,
            &invitation,
            &code,
            CHOSEN,
            ISSUED_AT + 2,
        )
        .await;
        let member_id = member.expect("the member").member_id;
        let (mut machine, held) =
            connected_machine(&scratch("refused-machine"), &store, &link).await;
        let mut sentences = Vec::new();

        for (username, password) in [
            ("sami.staff", "not the password"),
            ("olivia", "not the password"),
            ("nobody.here", PASSWORD),
            ("nobody.here", CHOSEN),
            ("sami.staff", PASSWORD),
            ("olivia", CHOSEN),
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
                ISSUED_AT,
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
            Some((ISSUED_AT + INVITATION_LIFETIME_MS, Some(ISSUED_AT + 2))),
            "a refusal moved the invitation"
        );
    }

    /// What an accept refuses before it opens anything: a link for another organization than the
    /// one held, a password under the floor, and a link under a machine half, which is what an
    /// account with a password is handed and invites nobody. Nothing is recorded and the
    /// invitation is not spent by any of them.
    #[tokio::test]
    async fn an_accept_refuses_another_organizations_link_a_short_password_and_a_link_with_no_half()
    {
        let directory = scratch("accept-refused");
        let (store, owner, link, invitation, _, code) = invited(&directory).await;
        let (mut machine, held) =
            connected_machine(&scratch("accept-refused-machine"), &store, &link).await;
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

        // a machine holding another organization: the link is refused naming both, and the way to
        // it is a disconnect.
        let mut elsewhere = Persisted::<RemoteSyncStore>::load(
            scratch("accept-refused-elsewhere").join(RemoteSync::FILENAME),
        )
        .expect("the machine");
        elsewhere.organization = Some(HeldOrganization {
            id: "another".to_string(),
            name: "Other".to_string(),
            ..held.clone()
        });

        let refused = accept_on(
            &mut elsewhere,
            &store,
            &invitation,
            &code,
            CHOSEN,
            ISSUED_AT + 2,
        )
        .await;

        assert!(
            matches!(refused, Err(Error::PreconditionFailed { ref message }) if message.contains("Other") && message.contains("Acme")),
            "{refused:?}"
        );

        let refused = accept_on(
            &mut machine,
            &store,
            &invitation,
            &code,
            "short",
            ISSUED_AT + 2,
        )
        .await;

        assert!(
            matches!(refused, Err(Error::InvalidInput { .. })),
            "{refused:?}"
        );

        // a link that is not an invitation's: the same locator and payload under a machine half,
        // which is what an account with a password is handed and is refused here by name.
        let a_machines = link.sealed(
            &invitation.credential,
            Half {
                kind: HalfKind::Machine,
                ..invitation.half.clone()
            },
        );
        let refused = accept_on(
            &mut machine,
            &store,
            &a_machines,
            &code,
            CHOSEN,
            ISSUED_AT + 2,
        )
        .await;

        assert!(
            matches!(refused, Err(Error::InvalidInput { .. })),
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
            invitation_of(&store, &owner, &member_id).await,
            Some((ISSUED_AT + INVITATION_LIFETIME_MS, None)),
            "a refusal spent the invitation"
        );
    }

    /// A link whose invitation row is gone is refused by name, and the machine it was opened on
    /// still lands at the wall. A reset is what takes a row away now: it deletes the account's
    /// unspent invitation and issues another, so a link somebody kept points at nothing and is
    /// told so. *The row was taken here by a revoke, under effort 826's requirement 15, until
    /// effort 828 found nothing calling it; the row is deleted directly instead.*
    #[tokio::test]
    async fn a_link_whose_invitation_row_is_gone_is_refused_and_lands_at_the_wall() {
        let directory = scratch("revoked");
        let (store, owner, link, _, _, _) = invited(&directory).await;
        let gone = make_account_and_link(
            &store,
            &owner,
            no_platform(),
            &link,
            Invitation {
                username: "gone.member",
                role: permission::MEMBER,
                workspaces: &[],
            },
            test_cost(),
            ISSUED_AT,
        )
        .await
        .expect("the invitation failed");
        let their_link = JoinLink::decode(&gone.join_link).expect("the link");

        store
            .delete_invitation(&gone.invitation_id)
            .await
            .expect("the invitation row could not be deleted");

        let (machine, refused) = opened(
            &scratch("revoked-machine"),
            &store,
            &their_link,
            &gone.code,
            CHOSEN,
            ISSUED_AT + 2,
        )
        .await;

        assert!(
            matches!(refused, Err(Error::Refused { reason: RefusalReason::Revoked, ref message })
                if message.contains("Acme")),
            "{refused:?}"
        );
        // the code was right, so the machine reached the organization and recorded it before the
        // row was judged: the person lands at the wall rather than at a dead end.
        assert_eq!(held_by(&machine).id, link.organization_id);
        assert_eq!(
            machine
                .organization
                .as_ref()
                .and_then(|held| held.member_id.as_deref()),
            None
        );
    }

    /// A member whose invitation lapsed before they opened it is refused by name, with the lapse
    /// said, since a reissue is what they need; the record is not filled and the invitation is not
    /// spent. A reissue is a fresh link: the lapsed one then stands revoked, and the fresh one
    /// admits them on a password of their choosing (effort 826, requirement 9).
    #[tokio::test]
    async fn a_lapsed_invitation_refuses_the_link_by_name_and_a_reissue_admits() {
        let directory = scratch("lapsed");
        let (store, owner, link, _, _, _) = invited(&directory).await;
        let late = make_account_and_link(
            &store,
            &owner,
            no_platform(),
            &link,
            Invitation {
                username: "late.member",
                role: permission::MEMBER,
                workspaces: &[],
            },
            test_cost(),
            ISSUED_AT,
        )
        .await
        .expect("the second invitation failed");
        let their_link = JoinLink::decode(&late.join_link).expect("the link");
        let after = ISSUED_AT + INVITATION_LIFETIME_MS;
        let theirs = scratch("lapsed-machine");

        let (mut machine, refused) =
            opened(&theirs, &store, &their_link, &late.code, CHOSEN, after).await;

        assert!(
            matches!(refused, Err(Error::Refused { reason: RefusalReason::Lapsed, ref message })
                if message.contains("Acme")),
            "{refused:?}"
        );
        // refused on the link's own moment, before any key was derived, so nothing was reached and
        // the machine holds nothing (effort 828, requirement 1).
        assert_eq!(
            machine.organization, None,
            "a lapsed link reached the organization"
        );
        assert_eq!(
            invitation_of(&store, &owner, &late.member_id).await,
            Some((after, None))
        );

        let reissued = crate::organization::invite::reset_account(
            &store,
            &owner,
            no_platform(),
            &link,
            &late.member_id,
            test_cost(),
            after,
        )
        .await
        .expect("the reissue failed");
        let fresh = JoinLink::decode(&reissued.join_link).expect("the fresh link");

        assert_ne!(fresh, their_link, "a reissue handed the same link");

        let refused = accept_on(
            &mut machine,
            &store,
            &their_link,
            &late.code,
            CHOSEN,
            after + 1,
        )
        .await;

        assert!(
            matches!(
                refused,
                Err(Error::Refused {
                    reason: RefusalReason::Lapsed,
                    ..
                })
            ),
            "the lapsed link still opens: {refused:?}"
        );

        let member = accept_on(
            &mut machine,
            &store,
            &fresh,
            &reissued.code,
            CHOSEN,
            after + 1,
        )
        .await
        .expect("the reissued member could not open their link");

        assert!(!member.must_change_password);
        assert_eq!(
            invitation_of(&store, &owner, &late.member_id).await,
            Some((after + INVITATION_LIFETIME_MS, Some(after + 1)))
        );
    }

    /// Effort 826, requirement 9: a member who forgot their password is reset, and the reset is a
    /// fresh link. Their old password stops admitting them the moment the reset is made, the link
    /// admits them on a new one, and what they held is theirs again.
    #[tokio::test]
    async fn a_reset_link_brings_a_member_who_forgot_their_password_back() {
        let directory = scratch("reset");
        let (store, owner, link, invitation, workspace_id, code) = invited(&directory).await;
        let theirs = scratch("reset-machine");
        let (mut machine, member) =
            opened(&theirs, &store, &invitation, &code, CHOSEN, ISSUED_AT + 2).await;
        let member = member.expect("the member");
        let held = held_by(&machine);

        let reset = crate::organization::invite::reset_account(
            &store,
            &owner,
            no_platform(),
            &link,
            &member.member_id,
            test_cost(),
            ISSUED_AT + 3,
        )
        .await
        .expect("the reset failed");
        let fresh = JoinLink::decode(&reset.join_link).expect("the reset link");

        assert!(
            admit(
                &store,
                &mut machine,
                &held,
                "sami.staff",
                CHOSEN,
                &slot(),
                ISSUED_AT,
            )
            .await
            .is_err(),
            "the forgotten password still opens the reset vault"
        );

        let back = accept_on(
            &mut machine,
            &store,
            &fresh,
            &reset.code,
            "a new password sami chose",
            ISSUED_AT + 4,
        )
        .await
        .expect("the reset link did not admit the member");

        assert_eq!(back.member_id, member.member_id);
        assert!(!back.must_change_password);
        assert!(back.workspace_credentials.contains_key(&workspace_id));
        assert!(
            admit(
                &store,
                &mut machine,
                &held,
                "sami.staff",
                "a new password sami chose",
                &slot(),
                ISSUED_AT,
            )
            .await
            .is_ok(),
            "the new password does not admit the member at the wall"
        );
    }

    /// Signing out leaves the record naming the organization with its member: the sign-out
    /// drops the keys this process held and the replica, and the record on disk is exactly what
    /// the sign-in wrote. Driven through the routine `organization_sign_out` calls, over the whole
    /// application state built the way `lib.rs` builds it.
    #[tokio::test]
    async fn signing_out_leaves_the_record_naming_the_organization_with_its_member() {
        let directory = scratch("sign-out");
        let (store, owner, link, _, _, _) = invited(&directory).await;
        let theirs = scratch("sign-out-machine");
        let (mut machine, held) = connected_machine(&theirs, &store, &link).await;
        let session = admit(
            &store,
            &mut machine,
            &held,
            "olivia",
            PASSWORD,
            &slot(),
            ISSUED_AT,
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
            signed_out_elsewhere: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            old_shape_check: tokio::sync::OnceCell::new(),
        }
    }

    /// Effort 826, requirement 23 and effort 828, requirement 1: **the code is a key half and not
    /// a check, and it is the only thing between a found link and the directory.**
    ///
    /// A link whose secret is right and whose code is wrong opens neither the payload nor the
    /// vault; the link's own expiry is bound into the seal, so a rewritten copy opens nothing;
    /// a link past that moment is refused before any key is derived and reaches nothing; no code
    /// at all is refused as input; and the right code unseals the credential, reaches the
    /// organization, records it on a machine that held nothing, and spends the invitation.
    ///
    /// **Nothing here leans on the clock for the refusal a wrong code gets.** Every wrong-code
    /// read below runs at a moment the link is open at, so what refuses them is the tag.
    #[tokio::test]
    async fn the_link_secret_alone_opens_neither_the_payload_nor_the_vault() {
        use crate::organization::{
            link::{code_salt, payload_context},
            vault::{derive_member_key, open_under_member_key, open_vault},
        };

        let directory = scratch("code");
        let (store, owner, link, invitation, _, code) = invited(&directory).await;
        let half = invitation.half.clone();
        let sealed = invitation.credential.clone();
        let theirs = scratch("code-machine");

        assert_eq!(half.expires_at, ISSUED_AT + INVITATION_LIFETIME_MS);
        assert_eq!(code.chars().count(), 6, "the code is not six characters");
        assert!(
            code.chars().all(|character| character.is_ascii_digit()
                || (character.is_ascii_uppercase() && !matches!(character, 'I' | 'L' | 'O' | 'U'))),
            "the code is spelled outside its alphabet: {code}"
        );

        // the link's secret is not the vault's password, and it is not the code either: neither
        // the payload nor the vault opens on it.
        let bytes =
            base64::Engine::decode(&base64::engine::general_purpose::URL_SAFE_NO_PAD, &sealed)
                .expect("the sealed payload is base64url");
        let salt = code_salt(&half.secret).expect("the salt");
        let context = payload_context(&invitation.locator(), &half);

        for wrong in [half.secret.as_str(), "ABCDEF", "000000"] {
            let key = derive_member_key(wrong, &salt, test_cost()).expect("a key");

            assert!(
                open_under_member_key(&key, &context, &bytes).is_err(),
                "{wrong:?} opened the payload"
            );
        }

        let member_row = store
            .members(&owner.verifying_key)
            .await
            .expect("the members")
            .into_iter()
            .find(|member| member.id != owner.member_id)
            .expect("the invited member");

        assert!(
            open_vault(&half.secret, &member_row.vault).is_err(),
            "the link's secret opens the invited vault on its own"
        );

        // the expiry is bound into the seal: a link whose moment somebody moved opens nothing on
        // the right code, so the clock has bought the person rewriting it nothing.
        let rewritten = link.sealed(
            &sealed,
            Half {
                expires_at: half.expires_at + 600_000,
                ..half.clone()
            },
        );
        let mut machine = Persisted::<RemoteSyncStore>::load(theirs.join(RemoteSync::FILENAME))
            .expect("the machine");
        let refused = accept_on(
            &mut machine,
            &store,
            &rewritten,
            &code,
            CHOSEN,
            ISSUED_AT + 1,
        )
        .await;

        assert!(
            matches!(refused, Err(Error::Forbidden { ref message }) if message == CODE_REFUSED),
            "a rewritten expiry opened the payload: {refused:?}"
        );

        // a wrong code, at a moment the link is open at: the tag refuses it, by name.
        let refused = accept_on(
            &mut machine,
            &store,
            &invitation,
            "ABCDEF",
            CHOSEN,
            ISSUED_AT + 1,
        )
        .await;

        assert!(
            matches!(refused, Err(Error::Forbidden { ref message }) if message == CODE_REFUSED),
            "{refused:?}"
        );

        // no code at all is about what the person did, and is refused as input.
        let refused = accept_on(
            &mut machine,
            &store,
            &invitation,
            "   ",
            CHOSEN,
            ISSUED_AT + 1,
        )
        .await;

        assert!(
            matches!(refused, Err(Error::InvalidInput { ref message }) if message == CODE_MISSING),
            "{refused:?}"
        );

        // the link's own moment, past: refused as a lapsed link before any key is derived.
        let refused = accept_on(
            &mut machine,
            &store,
            &invitation,
            &code,
            CHOSEN,
            half.expires_at,
        )
        .await;

        assert!(
            matches!(refused, Err(Error::Refused { reason: RefusalReason::Lapsed, ref message })
                if message.contains("Acme")),
            "{refused:?}"
        );

        // none of the four reached anything: the machine holds no organization, because the
        // credential that would reach one is what the code was standing in front of.
        assert_eq!(
            machine.organization, None,
            "a refused code reached the organization"
        );

        // and the right code opens the payload, reaches the organization, records it and spends
        // the invitation.
        let member = accept_on(
            &mut machine,
            &store,
            &invitation,
            &code,
            CHOSEN,
            ISSUED_AT + 2,
        )
        .await
        .expect("the right code did not open the invitation");

        assert!(!member.must_change_password);
        assert_eq!(held_by(&machine).id, link.organization_id);
        assert_eq!(
            held_by(&machine).member_id.as_deref(),
            Some(member.member_id.as_str())
        );

        let spent = invitation_row(&store, &owner, &half.id).await;

        assert_eq!(spent.consumed_at, Some(ISSUED_AT + 2));

        // the payload the link carried is the issuer's own grant on the organization database,
        // which is the credential the machine read the rows with.
        let payload = open_payload(&code, &invitation.locator(), &half, &sealed, test_cost())
            .expect("the payload");

        assert_eq!(
            Some(payload.credential.as_str()),
            owner
                .organization_credential
                .lock()
                .expect("the slot")
                .as_deref()
        );
        assert_eq!(half.kind, HalfKind::Invitation);
    }

    /// One invitation row, verified, by its id.
    async fn invitation_row(
        store: &OrganizationStore,
        session: &MemberSession,
        invitation_id: &str,
    ) -> crate::organization::store::InvitationRecord {
        store
            .invitations(&session.verifying_key)
            .await
            .expect("the invitations")
            .into_iter()
            .find(|row| row.id == invitation_id)
            .expect("the invitation row")
    }

    /// Criterion 15 against the rows a real invitation wrote: given the link's contents and a
    /// credential that reads every row, no username or workspace name is legible.
    /// `store.rs` proves it over hand-written rows; this is the same read over what `invite` and
    /// `create_workspace` actually write.
    ///
    /// **The code, the vault password and the organization credential are swept for too** (effort
    /// 826, requirement 23; effort 828, requirement 1). The code is what the link holder does not
    /// have, the vault password is what the two together open, and the credential is what reads
    /// the directory: any one of them legible in a cell, or in a link's text, would hand a link
    /// holder what the code stands in front of. The password and the code are read out of the
    /// issuer's own sealed copy, which is the one place either is recoverable at all and needs the
    /// owner's open vault to reach.
    #[tokio::test]
    async fn the_rows_a_link_holder_reads_carry_no_username_and_no_workspace_name() {
        let directory = scratch("legible");
        let (store, owner, link, invitation, _, code) = invited(&directory).await;
        let invitation_text = invitation.encode().expect("the invitation link");
        let half = invitation.half.clone();
        let link_secret = half.secret.clone();
        let row = store
            .invitations(&owner.verifying_key)
            .await
            .expect("the invitations")
            .into_iter()
            .find(|row| row.id == half.id)
            .expect("the invitation row");
        let issuers_copy = String::from_utf8(
            crate::organization::vault::unseal_with_secret_key(&owner.secret, &row.sealed_secret)
                .expect("the issuer's copy"),
        )
        .expect("the issuer's copy is text");
        let held: Vec<&str> = issuers_copy.split('\n').collect();
        let (vault_password, sealed_link_secret, sealed_code) = (held[0], held[1], held[2]);

        assert_eq!(
            sealed_link_secret, link_secret,
            "the issuer's copy does not hold the link's own secret"
        );
        assert_eq!(
            sealed_code, code,
            "the issuer's copy does not hold the code"
        );

        // the credential the link seals is what reads the directory, so it is swept for the way
        // the vault password is (effort 828, requirement 1).
        let credential = owner
            .organization_credential
            .lock()
            .expect("the slot")
            .clone()
            .expect("the owner holds a credential");
        let secrets = [
            "sami.staff",
            "olivia",
            "North",
            "Acme",
            PASSWORD,
            link_secret.as_str(),
            code.as_str(),
            vault_password,
            credential.as_str(),
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

        // and the link's own text carries the organization's name, which is the one name criterion
        // 15 permits, and its own secret, by design, and still no username, no workspace name, no
        // code, no vault password and no credential.
        for secret in [
            "sami.staff",
            "olivia",
            "North",
            PASSWORD,
            code.as_str(),
            vault_password,
            credential.as_str(),
        ] {
            assert!(
                !invitation_text.contains(secret),
                "{secret:?} is in the invitation link"
            );
        }
        assert_eq!(link.organization_name, "Acme");

        // and the locator every link is built from carries no credential at all (effort 828,
        // requirement 16), so there is nothing legible left for a link holder to read off it.
        assert!(
            ![&link.organization_id, &link.verifying_key, &link.remote_url]
                .iter()
                .any(|field| field.contains(&credential)),
            "the locator carries the owner's grant"
        );
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
                // named rather than left to the cascade: this run is against a real account and
                // the group it is over is already in hand, so the live test spends one request
                // rather than three on its way to what it actually measures.
                group: Some(organization.group.as_str()),
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

        let link_a = locator(&organization_a, &owner_a).await.expect("the link");
        let invited = make_account_and_link(
            &organization_a,
            &owner_a,
            no_platform(),
            &link_a,
            Invitation {
                username: "sami.staff",
                role: permission::MEMBER,
                workspaces: &full(std::slice::from_ref(&workspace.id)),
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

        let link = link_a;
        // what a link carries now (effort 828, requirement 16): the issuer's own grant, sealed
        // under the code they read out. B opens the invitation's payload with the code it was
        // handed and reaches the organization with what comes out, which is the accept's own path.
        let invitation = JoinLink::decode(&invited.join_link).expect("the invitation link");
        let reached_with = open_payload(
            &invited.code,
            &invitation.locator(),
            &invitation.half,
            &invitation.credential,
            test_cost(),
        )
        .expect("the code did not open the invitation's payload")
        .credential;

        // a machine that has never seen the organization: its replica opened against the remote
        // with that credential, pulled, and the organization recorded with no member.
        let reach = |directory: &std::path::Path| {
            let link = link.clone();
            let reached_with = reached_with.clone();
            let path =
                OrganizationStore::replica_path(&directory.join("app.db"), &link.organization_id);

            async move {
                let credential: CredentialSlot = Arc::new(Mutex::new(Some(reached_with)));
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
            ISSUED_AT,
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

        // machine C: the member, by the invitation link they were sent and a password they chose.
        // Nothing connects C first: the accept unseals the credential and records the organization
        // itself (effort 828, requirement 1).
        let machine_c = scratch("live-c");
        let (organization_c, _) = reach(&machine_c).await;
        let mut store_c = Persisted::<RemoteSyncStore>::load(machine_c.join(RemoteSync::FILENAME))
            .expect("C's record");
        let member_c = accept_on(
            &mut store_c,
            &organization_c,
            &JoinLink::decode(&invited.join_link).expect("the invitation link"),
            &invited.code,
            CHOSEN,
            now(),
        )
        .await
        .expect("the member could not open their link on C");

        eprintln!("restored the member on C as {}", member_c.role);
        assert_eq!(member_c.role, permission::MEMBER);
        assert!(!member_c.must_change_password);

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

    /// **Effort 826, requirement 12.** Opening an invitation leaves the machine signed in across a
    /// relaunch: the key the chosen password derives is filed under the member's entry, and it is
    /// the key that opens the vault the accept just resealed rather than the one the link carried.
    #[tokio::test]
    async fn an_accepted_invitation_files_the_key_the_chosen_password_derives() {
        let _turn = take_the_credential_store().await;
        let directory = scratch("accept-remembers");
        let (store, owner, _, invitation, _, code) = invited(&directory).await;
        let theirs = scratch("accept-remembers-member");
        let (_, member) = opened(&theirs, &store, &invitation, &code, CHOSEN, ISSUED_AT + 3).await;
        let member = member.expect("the member could not open their link");
        let filed = keyring::read(
            MEMBER_KEY_SERVICE,
            &format!("{}:{}", member.organization_id, member.member_id),
        )
        .expect("the store would not answer")
        .expect("the accept filed no key");
        let (_, key) = read_entry(&filed).expect("what was filed is not a remembered session");
        let rows = store
            .members(&owner.verifying_key)
            .await
            .expect("the members");
        let row = rows
            .iter()
            .find(|row| row.id == member.member_id)
            .expect("the member row");

        assert_eq!(
            open_sealed_secret_key(&key, &row.vault)
                .expect("the filed key did not open the resealed vault")
                .public_key(),
            member.secret.public_key()
        );
        assert!(!filed.contains(CHOSEN), "the password was filed");
    }
}
