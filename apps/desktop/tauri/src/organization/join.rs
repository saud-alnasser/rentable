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
//! here is the rest of the act: the machine's record learns which member this person is. A wrong
//! password, a username nobody holds, and a username held by somebody whose password this is not
//! are refused with one sentence, and nothing says whether the username exists. *819's join
//! opened a sealed payload with the link's half of a secret and the password to find the member's
//! row, and its restore tried every vault by the organization's own link; requirement 18 retires
//! both, and the vault trial is the one way in now.*
//!
//! **Opening an invitation link is the other way in, and it is where a password is chosen**
//! (effort 826, requirements 8, 9 and 23). The link's half names the invitation and carries one
//! half of what opens the member's vault; the other half is the six-character code the issuer
//! read out. [`accept`] finds the invitation, refuses one that lapsed, was consumed or was
//! revoked by name, opens the vault password with the secret and the code together, refuses a
//! code that is missing, wrong or lapsed by name, opens the vault with that password, reseals it
//! under the password the person chose, spends the invitation, records the member and signs them
//! in. A reset is the same link freshly issued, so a member locked out by a forgotten password
//! comes back the same way. Nothing at the wall asks anybody to change a password any more: the row's
//! `must_change_password` is written false by the accept, and the sign-in path reads it as false,
//! because a person who reached the wall by the generated secret typed nothing they were shown.
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
    invite::{InvitationStanding, code_context, code_salt},
    link::JoinLink,
    permission,
    session::{
        CredentialSlot, MemberSession, content_key_of, open_session, refused_by_name, remember,
        sign_in_by_username,
    },
    setup::MINIMUM_PASSWORD_LENGTH,
    store::{InvitationRecord, MemberRecord, OrganizationStore},
    vault::{
        KdfParams, derive_member_key, open_under_member_key, open_vault, reseal_vault_with_key,
    },
};

/// Where a link stands, as the connect screen is told it before it does anything: the four
/// values an invitation link takes, and `None` for the organization's own. *Between effort 824
/// and effort 826 there was one kind of link and `None` was the one value produced.*
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum LinkStanding {
    /// an open invitation: choosing a password opens it.
    Open,
    /// past its lifetime; a new link is what the person needs.
    Lapsed,
    /// opened once already.
    Consumed,
    /// the invitation this link was made for is gone.
    Revoked,
    /// the organization's own link, with no invitation in it: it names the organization, and a
    /// username and password admit a person at the wall.
    None,
}

/// The invited person, as an invitation link says it once the row it names has been opened.
/// The username and nothing else.
///
/// **Nothing fills this since effort 826's requirement 23**, and it is kept because it is the
/// shape the connect screen reads and the shape a link that opens the row again would take.
/// Naming the invited person meant opening their vault with the link's secret, and the link's
/// secret is now one half of what opens it: the other half is a code the person has not typed
/// yet when a link is read. The screen names the organization, which the link carries in the
/// clear, and asks for the code and a password.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InvitedFacts {
    pub username: String,
}

/// What a link says once the organization it points at has been reached: its name, where it is,
/// where the link stands, and whom it invites where it invites anybody. No credential, no key,
/// no secret.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkFacts {
    pub organization_id: String,
    pub organization_name: String,
    pub remote_url: String,
    pub standing: LinkStanding,
    /// the invited person, where the link carries an invitation half whose secret opens their
    /// row; `None` on the organization's own link, and on an invitation whose secret opens
    /// nothing, which the standing says more about.
    pub invitation: Option<InvitedFacts>,
}

/// Read a link against the replica it found, and say what it names.
///
/// `store` is a replica of the organization the link names, opened with the link's read-only
/// credential and pulled; every row read here is verified against the key the link pinned, so a
/// replica whose rows were not signed by that organization is refused before anything is said
/// about it. The members are the read, because they are the rows a connect screen goes on to
/// need and the ones a stranger's key fails on. Where the link carries an invitation half, the
/// standing is the invitation's. *It named the invited person until effort 826's requirement 23
/// made the link's secret one half of what opens their vault; the other half is the code, which
/// nobody has typed when a link is read, so [`InvitedFacts`] is never filled and says why.*
pub async fn inspect(
    store: &OrganizationStore,
    link: &JoinLink,
    now: i64,
) -> Result<LinkFacts, Error> {
    let verifying_key = link.verifying_key_bytes()?;

    // read and discarded: the members are the rows a stranger's key fails on, so this is where a
    // replica that was not signed by the organization the link pinned is refused, before anything
    // is said about it.
    store.members(&verifying_key).await?;

    let mut facts = LinkFacts {
        organization_id: link.organization_id.clone(),
        organization_name: link.organization_name.clone(),
        remote_url: link.remote_url.clone(),
        standing: LinkStanding::None,
        invitation: None,
    };

    let Some(half) = link.invitation_half() else {
        return Ok(facts);
    };

    let invitations = store.invitations(&verifying_key).await?;
    let Some(invitation) = invitations
        .iter()
        .find(|invitation| invitation.id == half.id)
    else {
        facts.standing = LinkStanding::Revoked;

        return Ok(facts);
    };

    facts.standing = match InvitationStanding::of(invitation, now) {
        InvitationStanding::Open => LinkStanding::Open,
        InvitationStanding::Lapsed => LinkStanding::Lapsed,
        InvitationStanding::Consumed => LinkStanding::Consumed,
    };

    // whom it invites is not said, and cannot be: the username is sealed under the content key,
    // which the member's vault holds, and requirement 23 made the link's secret one half of what
    // opens that vault. A reader holding a link and no code is told which organization it is for
    // and where the invitation stands, which is what the members read above establish.
    Ok(facts)
}

/// The one sentence a code that does not open the seal is refused with (effort 826, requirement
/// 23). It says both, because the two are one act to the person reading it: ask for a fresh one.
pub const CODE_REFUSED: &str =
    "the code is wrong or has lapsed; ask whoever invited you for a fresh one";

/// The one sentence a code the row says has lapsed is refused with, before any key is derived.
pub const CODE_LAPSED: &str = "the code has lapsed; ask whoever invited you for a fresh one";

/// The one sentence a person who typed no code is told, which is the only one of the three that
/// is about what they did rather than about what the row says.
const CODE_MISSING: &str = "type the six-character code whoever invited you read out";

/// The vault password the invitation was made under, opened with the link's secret and the code
/// together.
///
/// The row's `code_expires_at` is read against this machine's clock, which is the one refusal the
/// clock decides; the seal binds that expiry as associated data, so a row whose expiry somebody
/// rewrote opens nothing whatever the clock then says. A row with no seal left is a consumed
/// invitation or one whose code was cleared, and is refused as lapsed for the same reason.
fn open_vault_password(
    invitation: &InvitationRecord,
    link_secret: &str,
    code: &str,
    kdf_params: KdfParams,
    now: i64,
) -> Result<String, Error> {
    let code = code.trim().to_uppercase();

    if code.is_empty() {
        return Err(Error::InvalidInput {
            message: CODE_MISSING.to_string(),
        });
    }

    let lapsed = || Error::PreconditionFailed {
        message: CODE_LAPSED.to_string(),
    };
    let (Some(seal), Some(code_expires_at)) = (&invitation.code_seal, invitation.code_expires_at)
    else {
        return Err(lapsed());
    };

    if code_expires_at <= now {
        return Err(lapsed());
    }

    let refused = || Error::Forbidden {
        message: CODE_REFUSED.to_string(),
    };
    let key = derive_member_key(&code, &code_salt(link_secret)?, kdf_params)?;
    let opened = open_under_member_key(&key, &code_context(&invitation.id, code_expires_at), seal)
        .map_err(|_| refused())?;

    String::from_utf8(opened).map_err(|_| refused())
}

/// The one sentence an invitation that no longer opens is refused with: which of the three it is,
/// and the organization it was for, since the link found the organization and the invitation is
/// what is refused.
fn invitation_refused(organization_name: &str, standing: LinkStanding) -> Error {
    let why = match standing {
        LinkStanding::Lapsed => "has lapsed",
        LinkStanding::Consumed => "was already opened",
        _ => "was revoked",
    };

    Error::Forbidden {
        message: format!(
            "the invitation to {organization_name} {why}; ask whoever invited you for a new link"
        ),
    }
}

/// Open an invitation link on the organization this machine holds: the way in for an invited or
/// a reset member (effort 826, requirements 8 and 9).
///
/// `held` is the machine's record, which a connect wrote with no member; `link` has to name the
/// same organization and carry an invitation half; `code` is the six characters the issuer read
/// out, and `password` is the one the person chose, held to the first run's floor because a
/// member's vault is sealed the way the owner's is. The link's secret and the code together open
/// the vault password (effort 826, requirement 23), that password opens the vault the invitation
/// made, the vault is resealed under the password with `must_change_password` written false, the
/// invitation is spent, and the record learns which member this person is. A lapsed, consumed or
/// revoked invitation is refused naming which, before anything is opened; a second open of the
/// same link is a consumed one.
///
/// **The code is checked by being used, and never by being compared.** A wrong one derives a key
/// like any other, that key fails the AEAD tag, and there is no stored verifier and no boolean a
/// modified client could make return true, which is the same shape a wrong password has. The
/// lapse is the row's own moment against this machine's clock, and it is the only refusal the
/// clock decides: a code past it is refused before the derivation runs, and every other wrong
/// code is refused by the tag whatever the clock says.
#[allow(clippy::too_many_arguments)]
pub async fn accept(
    store: &OrganizationStore,
    machine: &mut Persisted<RemoteSyncStore>,
    held: &HeldOrganization,
    link: &JoinLink,
    code: &str,
    password: &str,
    credential: &CredentialSlot,
    kdf_params: KdfParams,
    now: i64,
) -> Result<MemberSession, Error> {
    let half = link.invitation_half().ok_or_else(|| Error::InvalidInput {
        message: "this link carries no invitation; sign in with your username and password"
            .to_string(),
    })?;

    if link.organization_id != held.id {
        return Err(Error::PreconditionFailed {
            message: format!(
                "this link is for {} and this machine holds {}; disconnect it first",
                link.organization_name, held.name
            ),
        });
    }

    if password.chars().count() < MINIMUM_PASSWORD_LENGTH {
        return Err(Error::InvalidInput {
            message: format!(
                "the password needs at least {MINIMUM_PASSWORD_LENGTH} characters. it is the only \
                 thing between anybody holding the organization's records and reading them"
            ),
        });
    }

    let verifying_key = super::session::verifying_key_of(held)?;
    let invitations = store.invitations(&verifying_key).await?;
    let invitation: &InvitationRecord = invitations
        .iter()
        .find(|invitation| invitation.id == half.id)
        .ok_or_else(|| invitation_refused(&held.name, LinkStanding::Revoked))?;

    match InvitationStanding::of(invitation, now) {
        InvitationStanding::Open => {}
        InvitationStanding::Lapsed => {
            return Err(invitation_refused(&held.name, LinkStanding::Lapsed));
        }
        InvitationStanding::Consumed => {
            return Err(invitation_refused(&held.name, LinkStanding::Consumed));
        }
    }

    let members = store.members(&verifying_key).await?;
    let member: &MemberRecord = members
        .iter()
        .find(|member| member.id == invitation.member_id)
        .ok_or_else(|| invitation_refused(&held.name, LinkStanding::Revoked))?;

    if member.role == permission::REMOVED {
        return Err(invitation_refused(&held.name, LinkStanding::Revoked));
    }

    // the link's secret and the code together are what open the vault password: the code keys the
    // seal and the secret salts it, so neither on its own derives anything (requirement 23).
    let vault_password = open_vault_password(invitation, &half.secret, code, kdf_params, now)?;

    // that password is the one thing that opens this vault; a link somebody altered says no more
    // than a wrong password would.
    let secret =
        open_vault(&vault_password, &member.vault).map_err(|_| refused_by_name(&held.name))?;
    let content_key = content_key_of(member, &secret)?;

    // the rest of a sign-in: every grant the vault holds, the organization's into the slot the
    // replica pushes under from here on.
    let mut session = open_session(
        store,
        held,
        verifying_key,
        member,
        secret,
        content_key,
        credential,
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

    Ok(session)
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

    use super::{CODE_LAPSED, CODE_REFUSED, LinkStanding, accept, admit, inspect};
    use crate::{
        database::Database,
        error::Error,
        keyring::{self, take_the_credential_store},
        organization::{
            HeldOrganization, connect,
            invite::{
                INVITATION_LIFETIME_MS, Invitation, WorkspaceGrant, invite_member,
                organization_link,
            },
            link::JoinLink,
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
    /// the store with two members every test here runs over, the organization's own link, and the
    /// member's invitation link. The replica the owner wrote is what a connected machine reads once
    /// it has pulled; the pull itself is `organization/store.rs`'s and is not what this module
    /// proves.
    async fn invited(
        directory: &std::path::Path,
    ) -> (
        OrganizationStore,
        MemberSession,
        JoinLink,
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
                group: "rentable",
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
            JoinLink {
                invitation: None,
                ..invitation.clone()
            },
            link,
            "an invitation link is the organization's own with a half in it"
        );
        assert_eq!(
            invitation.invitation_half().map(|half| half.id.as_str()),
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

    /// A fresh machine connected to the organization by its link, and `invitation` opened on it
    /// choosing `password`: what a person does with the link they were sent.
    async fn opened(
        directory: &std::path::Path,
        store: &OrganizationStore,
        invitation: &JoinLink,
        code: &str,
        password: &str,
        now: i64,
    ) -> (
        Persisted<RemoteSyncStore>,
        HeldOrganization,
        Result<MemberSession, Error>,
    ) {
        let (mut machine, held) = connected_machine(
            directory,
            store,
            &JoinLink {
                invitation: None,
                ..invitation.clone()
            },
        )
        .await;
        let session = accept(
            store,
            &mut machine,
            &held,
            invitation,
            code,
            password,
            &slot(),
            test_cost(),
            now,
        )
        .await;

        (machine, held, session)
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

    /// Criterion 18, the link's half, and effort 826's criterion 8 on what a link says: the
    /// organization's own link names the organization and stands as nothing else; an invitation
    /// link stands where its invitation stands; a link for an invitation that is gone stands
    /// revoked; and one carrying a stranger's key finds rows it cannot verify and is refused
    /// before anything is said. The connect itself is `connect.rs`'s test.
    ///
    /// **No link names the person it invites any more** (requirement 23). Naming them meant
    /// opening their vault with the link's secret, and the secret is one half of what opens it
    /// now; the code is the other, and nobody has typed one when a link is read. So the reads
    /// that used to answer a username answer `None`, whatever the link carries.
    #[tokio::test]
    async fn a_link_names_the_organization_and_an_invitation_link_names_whom_it_invites() {
        let directory = scratch("inspect");
        let (store, owner, link, invitation, _, _) = invited(&directory).await;

        let facts = inspect(&store, &link, ISSUED_AT + 2)
            .await
            .expect("the link could not be read");

        assert_eq!(facts.organization_name, "Acme");
        assert_eq!(facts.organization_id, owner.organization_id);
        assert_eq!(facts.remote_url, link.remote_url);
        assert_eq!(facts.standing, LinkStanding::None);
        assert_eq!(facts.invitation, None);

        let facts = inspect(&store, &invitation, ISSUED_AT + 2)
            .await
            .expect("the invitation link could not be read");

        assert_eq!(facts.organization_name, "Acme");
        assert_eq!(facts.standing, LinkStanding::Open);
        assert_eq!(
            facts.invitation, None,
            "a link read without a code named the person it invites"
        );

        // the same invitation with its secret altered reads exactly the same, which is the point:
        // what a link holder is told does not turn on whether their secret is the right one.
        let half = invitation.invitation_half().expect("the half");
        let altered = link.for_invitation(&half.id, "not-the-secret-at-all");
        let facts = inspect(&store, &altered, ISSUED_AT + 2)
            .await
            .expect("the altered link could not be read");

        assert_eq!(facts.standing, LinkStanding::Open);
        assert_eq!(facts.invitation, None);

        let gone = link.for_invitation("an-invitation-nobody-issued", &half.secret);
        let facts = inspect(&store, &gone, ISSUED_AT + 2)
            .await
            .expect("the gone link could not be read");

        assert_eq!(facts.standing, LinkStanding::Revoked);
        assert_eq!(facts.invitation, None);

        let strangers = JoinLink {
            verifying_key: base64::Engine::encode(
                &base64::engine::general_purpose::URL_SAFE_NO_PAD,
                [7_u8; 32],
            ),
            ..link
        };

        assert!(
            matches!(
                inspect(&store, &strangers, ISSUED_AT + 2).await,
                Err(Error::Integrity { .. })
            ),
            "a stranger's key read the rows"
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
        let session = admit(&store, &mut machine, &held, "Olivia", PASSWORD, &credential)
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

        let (mut their_machine, their_held, member) =
            opened(&theirs, &store, &invitation, &code, CHOSEN, ISSUED_AT + 3).await;
        let member = member.expect("the member could not open their link");

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
        let secret = invitation
            .invitation_half()
            .expect("the half")
            .secret
            .clone();

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
            )
            .await
            .is_err(),
            "the link's secret still opens the vault"
        );

        // the link opened again is a consumed invitation, refused by name.
        let refused = accept(
            &store,
            &mut their_machine,
            &their_held,
            &invitation,
            &code,
            "another password entirely",
            &slot(),
            test_cost(),
            ISSUED_AT + 4,
        )
        .await;

        assert!(
            matches!(refused, Err(Error::Forbidden { ref message }) if message.contains("Acme") && message.contains("already opened")),
            "{refused:?}"
        );
        assert_eq!(
            inspect(&store, &invitation, ISSUED_AT + 4)
                .await
                .expect("the link")
                .standing,
            LinkStanding::Consumed
        );
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
        let (_, _, member) = opened(
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
            let refused = admit(&store, &mut machine, &held, username, password, &slot())
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
    /// one held, a password under the floor, and the organization's own link, which invites
    /// nobody. Nothing is recorded and the invitation is not spent by any of them.
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

        let elsewhere = HeldOrganization {
            id: "another".to_string(),
            name: "Other".to_string(),
            ..held.clone()
        };
        let refused = accept(
            &store,
            &mut machine,
            &elsewhere,
            &invitation,
            &code,
            CHOSEN,
            &slot(),
            test_cost(),
            ISSUED_AT + 2,
        )
        .await;

        assert!(
            matches!(refused, Err(Error::PreconditionFailed { ref message }) if message.contains("Other") && message.contains("Acme")),
            "{refused:?}"
        );

        let refused = accept(
            &store,
            &mut machine,
            &held,
            &invitation,
            &code,
            "short",
            &slot(),
            test_cost(),
            ISSUED_AT + 2,
        )
        .await;

        assert!(
            matches!(refused, Err(Error::InvalidInput { .. })),
            "{refused:?}"
        );

        let refused = accept(
            &store,
            &mut machine,
            &held,
            &link,
            &code,
            CHOSEN,
            &slot(),
            test_cost(),
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

    /// Effort 826, requirement 15: revoking a person who never opened their link removes them.
    /// The link then stands revoked and opens nothing, the member is not listed, and their row is
    /// signed as removed, so a link somebody kept is a locator and no more.
    #[tokio::test]
    async fn a_revoked_invitation_is_refused_by_name_and_the_person_who_never_arrived_is_gone() {
        let directory = scratch("revoked");
        let (store, owner, link, _, _, _) = invited(&directory).await;
        let gone = invite_member(
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

        crate::organization::invite::revoke_invitation(
            &store,
            &owner,
            &gone.invitation_id,
            ISSUED_AT + 1,
        )
        .await
        .expect("the revoke failed");

        let (machine, _, refused) = opened(
            &scratch("revoked-machine"),
            &store,
            &their_link,
            &gone.code,
            CHOSEN,
            ISSUED_AT + 2,
        )
        .await;

        assert!(
            matches!(refused, Err(Error::Forbidden { ref message }) if message.contains("Acme") && message.contains("revoked")),
            "{refused:?}"
        );
        assert_eq!(
            inspect(&store, &their_link, ISSUED_AT + 2)
                .await
                .expect("the link")
                .standing,
            LinkStanding::Revoked
        );
        assert_eq!(
            machine
                .organization
                .as_ref()
                .and_then(|held| held.member_id.as_deref()),
            None
        );

        let listed = crate::organization::invite::members(&store, &owner, 1_757_000_000_000)
            .await
            .expect("the members");

        assert!(
            !listed.iter().any(|member| member.id == gone.member_id),
            "the revoked person is still listed"
        );

        let row = store
            .members(&owner.verifying_key)
            .await
            .expect("the rows")
            .into_iter()
            .find(|row| row.id == gone.member_id)
            .expect("the row stays, signed as removed");

        assert_eq!(row.role, permission::REMOVED);
        assert!(
            store
                .grants(&owner.verifying_key)
                .await
                .expect("the grants")
                .iter()
                .all(|grant| grant.member_id != gone.member_id),
            "a grant survived the revoke"
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
        let late = invite_member(
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

        let (mut machine, held, refused) =
            opened(&theirs, &store, &their_link, &late.code, CHOSEN, after).await;

        assert!(
            matches!(refused, Err(Error::Forbidden { ref message }) if message.contains("Acme") && message.contains("lapsed")),
            "{refused:?}"
        );
        assert_eq!(
            inspect(&store, &their_link, after)
                .await
                .expect("the link")
                .standing,
            LinkStanding::Lapsed
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

        let refused = accept(
            &store,
            &mut machine,
            &held,
            &their_link,
            &late.code,
            CHOSEN,
            &slot(),
            test_cost(),
            after + 1,
        )
        .await;

        assert!(
            matches!(refused, Err(Error::Forbidden { ref message }) if message.contains("revoked")),
            "the lapsed link still opens: {refused:?}"
        );

        let member = accept(
            &store,
            &mut machine,
            &held,
            &fresh,
            &reissued.code,
            CHOSEN,
            &slot(),
            test_cost(),
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
        let (mut machine, held, member) =
            opened(&theirs, &store, &invitation, &code, CHOSEN, ISSUED_AT + 2).await;
        let member = member.expect("the member");

        let reset = crate::organization::invite::reissue_invitation(
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
            admit(&store, &mut machine, &held, "sami.staff", CHOSEN, &slot())
                .await
                .is_err(),
            "the forgotten password still opens the reset vault"
        );

        let back = accept(
            &store,
            &mut machine,
            &held,
            &fresh,
            &reset.code,
            "a new password sami chose",
            &slot(),
            test_cost(),
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
        let session = admit(&store, &mut machine, &held, "olivia", PASSWORD, &slot())
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

    /// Effort 826, requirement 23, and its criterion: **the code is a key half and not a check.**
    /// A link whose secret is right and whose code is wrong opens neither the seal nor the vault;
    /// a row whose `code_expires_at` somebody rewrote opens nothing, because the seal binds it; a
    /// code the row says has lapsed is refused before any key is derived; no code at all is
    /// refused as input; and the right code admits the person and spends the invitation.
    ///
    /// **Nothing here leans on the clock for the refusal a wrong code gets.** Every wrong-code
    /// read below runs at a moment the row calls open, so what refuses them is the tag.
    #[tokio::test]
    async fn the_link_secret_alone_opens_neither_the_code_seal_nor_the_vault() {
        use crate::organization::{
            invite::{CODE_LIFETIME_MS, code_context, code_salt},
            vault::{derive_member_key, open_under_member_key, open_vault},
        };

        let directory = scratch("code");
        let (store, owner, link, invitation, _, code) = invited(&directory).await;
        let half = invitation.invitation_half().expect("the half").clone();
        let (mut machine, held) = connected_machine(&scratch("code-machine"), &store, &link).await;
        let sealed = invitation_row(&store, &owner, &half.id).await;
        let code_expires_at = sealed.code_expires_at.expect("the code expiry");

        assert_eq!(
            code_expires_at,
            ISSUED_AT + CODE_LIFETIME_MS,
            "the code does not lapse ninety seconds out"
        );
        assert_eq!(code.chars().count(), 6, "the code is not six characters");
        assert!(
            code.chars().all(|character| character.is_ascii_digit()
                || (character.is_ascii_uppercase() && !matches!(character, 'I' | 'L' | 'O' | 'U'))),
            "the code is spelled outside its alphabet: {code}"
        );

        // the link's secret is not the vault's password, and it is not the code either: neither
        // the seal nor the vault opens on it.
        let seal = sealed.code_seal.clone().expect("the code seal");
        let salt = code_salt(&half.secret).expect("the salt");
        let context = code_context(&half.id, code_expires_at);

        for wrong in [half.secret.as_str(), "ABCDEF", "000000"] {
            let key = derive_member_key(wrong, &salt, test_cost()).expect("a key");

            assert!(
                open_under_member_key(&key, &context, &seal).is_err(),
                "{wrong:?} opened the code seal"
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

        // a wrong code, at a moment the row calls open: the tag refuses it, by name.
        let refused = accept(
            &store,
            &mut machine,
            &held,
            &invitation,
            "ABCDEF",
            CHOSEN,
            &slot(),
            test_cost(),
            ISSUED_AT + 1,
        )
        .await;

        assert!(
            matches!(refused, Err(Error::Forbidden { ref message }) if message == CODE_REFUSED),
            "{refused:?}"
        );

        // no code at all is about what the person did, and is refused as input.
        let refused = accept(
            &store,
            &mut machine,
            &held,
            &invitation,
            "   ",
            CHOSEN,
            &slot(),
            test_cost(),
            ISSUED_AT + 1,
        )
        .await;

        assert!(
            matches!(refused, Err(Error::InvalidInput { .. })),
            "{refused:?}"
        );

        // the row's own moment, past: refused as lapsed before any key is derived.
        let refused = accept(
            &store,
            &mut machine,
            &held,
            &invitation,
            &code,
            CHOSEN,
            &slot(),
            test_cost(),
            code_expires_at,
        )
        .await;

        assert!(
            matches!(refused, Err(Error::PreconditionFailed { ref message }) if message == CODE_LAPSED),
            "{refused:?}"
        );

        // the expiry rewritten to buy more time: the seal binds it, so the right code opens
        // nothing and the clock has bought nobody anything.
        rewrite_code_expiry(&store, &half.id, code_expires_at + 600_000).await;

        let refused = accept(
            &store,
            &mut machine,
            &held,
            &invitation,
            &code,
            CHOSEN,
            &slot(),
            test_cost(),
            code_expires_at + 1,
        )
        .await;

        assert!(
            matches!(refused, Err(Error::Forbidden { ref message }) if message == CODE_REFUSED),
            "a rewritten expiry opened the seal: {refused:?}"
        );

        // put the row back and open it properly: the right code, inside its ninety seconds.
        rewrite_code_expiry(&store, &half.id, code_expires_at).await;

        let member = accept(
            &store,
            &mut machine,
            &held,
            &invitation,
            &code,
            CHOSEN,
            &slot(),
            test_cost(),
            ISSUED_AT + 2,
        )
        .await
        .expect("the right code did not open the invitation");

        assert!(!member.must_change_password);

        // and consuming the invitation cleared the seal, so the row holds nothing to guess at.
        let spent = invitation_row(&store, &owner, &half.id).await;

        assert_eq!(spent.code_seal, None);
        assert_eq!(spent.code_expires_at, None);
        assert_eq!(spent.consumed_at, Some(ISSUED_AT + 2));
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

    /// The row's `code_expires_at`, written straight, the way somebody holding the database would
    /// write it: the column is outside the signature, so nothing here refuses the write, and what
    /// the seal binds is what refuses the read.
    async fn rewrite_code_expiry(store: &OrganizationStore, invitation_id: &str, expires_at: i64) {
        store
            .connection()
            .execute(
                "UPDATE \"invitation\" SET \"code_expires_at\" = ? WHERE \"id\" = ?",
                vec![
                    turso::Value::Integer(expires_at),
                    turso::Value::Text(invitation_id.to_string()),
                ],
            )
            .await
            .expect("the rewrite");
    }

    /// Criterion 15 against the rows a real invitation wrote: given the link's contents and a
    /// credential that reads every row, no username or workspace name is legible.
    /// `store.rs` proves it over hand-written rows; this is the same read over what `invite` and
    /// `create_workspace` actually write.
    ///
    /// **The code and the vault password are swept for too** (effort 826, requirement 23). The
    /// code is what the link holder does not have and the vault password is what the two together
    /// open, so either one legible in a cell would hand a link holder the vault. The vault
    /// password is read out of the issuer's own sealed copy, which is the one place it is
    /// recoverable at all and needs the owner's open vault to reach.
    #[tokio::test]
    async fn the_rows_a_link_holder_reads_carry_no_username_and_no_workspace_name() {
        let directory = scratch("legible");
        let (store, owner, link, invitation, _, code) = invited(&directory).await;
        let link_text = link.encode().expect("the link");
        let invitation_text = invitation.encode().expect("the invitation link");
        let link_secret = invitation
            .invitation_half()
            .expect("the half")
            .secret
            .clone();
        let row = store
            .invitations(&owner.verifying_key)
            .await
            .expect("the invitations")
            .into_iter()
            .find(|row| row.id == invitation.invitation_half().expect("the half").id)
            .expect("the invitation row");
        let issuers_copy = String::from_utf8(
            crate::organization::vault::unseal_with_secret_key(&owner.secret, &row.sealed_secret)
                .expect("the issuer's copy"),
        )
        .expect("the issuer's copy is text");
        let (vault_password, sealed_link_secret) = issuers_copy
            .split_once('\n')
            .expect("the issuer's copy holds a password and a link secret");

        assert_eq!(
            sealed_link_secret, link_secret,
            "the issuer's copy does not hold the link's own secret"
        );

        let secrets = [
            "sami.staff",
            "olivia",
            "North",
            "Acme",
            PASSWORD,
            link_secret.as_str(),
            code.as_str(),
            vault_password,
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

        // and the organization's own link carries its name, which is the one name criterion 15
        // permits, and none of the others; the invitation link carries its own secret, by design,
        // and still no username, no workspace name, no code and no vault password.
        for secret in ["sami.staff", "olivia", "North", link_secret.as_str()] {
            assert!(!link_text.contains(secret), "{secret:?} is in the link");
        }
        for secret in [
            "sami.staff",
            "olivia",
            "North",
            PASSWORD,
            code.as_str(),
            vault_password,
        ] {
            assert!(
                !invitation_text.contains(secret),
                "{secret:?} is in the invitation link"
            );
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
                group: &organization.group,
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
        let machine_c = scratch("live-c");
        let (organization_c, credential_c) = reach(&machine_c).await;
        let (mut store_c, held_c) = connected_machine(&machine_c, &organization_c, &link).await;
        let member_c = accept(
            &organization_c,
            &mut store_c,
            &held_c,
            &JoinLink::decode(&invited.join_link).expect("the invitation link"),
            &invited.code,
            CHOSEN,
            &credential_c,
            test_cost(),
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
        let (_, _, member) =
            opened(&theirs, &store, &invitation, &code, CHOSEN, ISSUED_AT + 3).await;
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
