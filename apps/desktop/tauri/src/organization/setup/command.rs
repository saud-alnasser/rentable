//! the commands of the first run: the Turso consent, the organization created or found in the
//! consented group, the authority reconnected, and what Turso said about the account.

use std::sync::{Arc, Mutex};

use crate::{
    clock,
    credential::Credentials,
    error::{Error, RefusalReason},
    state::AppState,
};

use crate::organization::{
    invitation::connect,
    session::{self, CredentialSlot, OrganizationState, state_of},
    setup::{self, CreateOrganization, GroupState, OrganizationCreated, Remote},
    workspace,
};
use crate::turso::{
    consent::{TursoConsentResult, TursoConsentStart, TursoEndpoints},
    discovery::McpEndpoint,
    platform::{PlatformApi, PlatformEndpoint},
};

/// Create an organization on the consented Turso account, with this machine's person as its
/// owner, from the three things the setup walk collects, and sign them in to it.
///
/// **A fourth is the Turso group, and it arrives only where Turso left no other way**
/// ([[rules/credentials]], *Client boundary*): the first create into an empty group may have to
/// name the group, and `setup/` tries every name it can work out before the walk asks anybody
/// for one, so this is `None` on an ordinary run. It is a name rather than a credential when it
/// does arrive; `setup/` and `turso/discovery/` say why.
///
/// **None of the four crosses back, and nothing else crosses at all.** The password is turned
/// into a vault here and dropped; the organization key and the owner's signing key are derived
/// and never stored; the Platform API token is read from the keyring where the consent filed it.
/// What the web layer is told is the organization's id and whether the rows have reached Turso
/// yet ([[rules/credentials]], *Client boundary*). *It was told the organization's own join link
/// as well until effort 828's requirement 16 retired that link; the first run mints nothing to
/// hand out now.*
///
/// A machine with no consent is refused before anything is asked of Turso, with an answer that
/// says to connect the account first. Every failure after the database exists removes it, so a
/// first run that did not finish leaves nothing behind; `setup/` says how.
#[tauri::command(rename = "setup_create")]
pub(crate) async fn organization_setup_create(
    app_state: tauri::State<'_, AppState>,
    credentials: tauri::State<'_, Credentials>,
    clock: tauri::State<'_, clock::Shared>,
    name: String,
    username: String,
    password: String,
    group: Option<String>,
) -> Result<OrganizationCreated, Error> {
    let platform_token = setup::authority(credentials.inner().as_ref())?;
    let database_path = {
        let settings = app_state.settings.read().await;

        settings.database_path.clone()
    };

    // held across the creation, network round trips included. The record of what this machine
    // has joined and which Turso organization its consent is over is inside `RemoteSync`, and a
    // first run writes both, so nothing else reads the sync state until it is done. That is a
    // foreground act with a screen saying so, and the calls that wait are the sync manager's.
    let mut remote_sync = app_state.remote_sync.write().await;

    // a machine holds one organization (requirement 17): the first run is offered only where
    // none is held, and a route reached some other way is refused here rather than making a
    // second organization on the account.
    connect::refuse_while_held(remote_sync.store_mut())?;

    let (created, store) = setup::create_organization(
        credentials.inner().as_ref(),
        &clock,
        remote_sync.store_mut(),
        &platform_token,
        &McpEndpoint::production(),
        |organization| {
            PlatformApi::new(
                PlatformEndpoint::production(),
                organization,
                credentials.inner().clone(),
            )
        },
        Remote::libsql(),
        &database_path,
        CreateOrganization {
            name: &name,
            username: &username,
            password: &password,
            group: group.as_deref(),
        },
        setup::SHIPPING_KDF,
        clock.now(),
    )
    .await?;

    // the owner is in: the vault their password just sealed is opened with it, which is the same
    // path every later sign-in takes, so what creation hands the process is exactly what a sign-in
    // would. One more derivation, and no second way of becoming signed in.
    let joined = remote_sync
        .store_mut()
        .organization
        .clone()
        .filter(|held| held.id == created.organization_id)
        .ok_or_else(|| Error::Internal {
            message: "the organization was created and not recorded".to_string(),
        })?;
    let credential: CredentialSlot = Arc::new(Mutex::new(None));
    let member = session::sign_in(&store, &joined, &password, &credential).await?;

    // the owner's machine enters the registry (effort 828, requirement 15). A first run draws the
    // machine id with the record (`setup/`) and registers here, after the sign-in, because the
    // push goes out under the credential the vault unsealed.
    session::machine_seen(&store, &joined, Some(&member.member_id), clock.now()).await;

    *app_state.organization.write().await = Some(store);
    *app_state.member.write().await = Some(member);

    Ok(created)
}

/// What the consented group already holds, read after the consent and before anything is created
/// (effort 828, requirement 14).
///
/// **`public`, because it happens before there is anybody to act as**, exactly as the consent and
/// the create do. A group holding nothing of ours answers `empty` and the walk asks for a name; a
/// group already holding an organization answers `held` and the walk asks for the owner's username
/// and password instead of refusing the run.
///
/// It reads and nothing else: nothing is minted, nothing is created, no replica is opened and
/// this machine's record is untouched, so a person who stops here has changed nothing on their
/// account.
#[tauri::command(rename = "setup_group_inspect")]
pub(crate) async fn organization_setup_group_inspect(
    _app_state: tauri::State<'_, AppState>,
    credentials: tauri::State<'_, Credentials>,
) -> Result<GroupState, Error> {
    let platform_token = setup::authority(credentials.inner().as_ref())?;

    setup::group_inspect(&platform_token, &McpEndpoint::production()).await
}

/// Connect this machine to the organization the consented group already holds, and sign the owner
/// in to it (effort 828, requirement 14).
///
/// **`public` for the same reason the create is**: it runs on a machine that holds nothing, where
/// there is nobody to act as yet, and what it answers with is a machine that holds an organization
/// and somebody signed in to it.
///
/// **Only the owner's password does it.** The password goes in and facts come out
/// ([[rules/credentials]], *Client boundary*): what it opens, what it derives and what that key
/// proves all stay in Rust, and `setup/` says in what order. A wrong username or password is
/// refused with the wall's one sentence, which tells the two apart by nothing; anybody who is not
/// the owner is refused by name and the machine is left holding nothing.
///
/// **The register of connected machines shuts nothing** (requirement 15, as the human corrected it
/// on 2026-09-20). This used to refuse while a machine an owner or an administrator was on had been
/// seen inside the week, and point at the link that machine could make; the owner is handed no
/// link, and an account is held on as many machines as its holder signs in on.
#[tauri::command(rename = "setup_connect_existing")]
pub(crate) async fn organization_setup_connect_existing(
    app_state: tauri::State<'_, AppState>,
    credentials: tauri::State<'_, Credentials>,
    clock: tauri::State<'_, clock::Shared>,
    username: String,
    password: String,
) -> Result<OrganizationState, Error> {
    let platform_token = setup::authority(credentials.inner().as_ref())?;
    let database_path = {
        let settings = app_state.settings.read().await;

        settings.database_path.clone()
    };

    // held across the connect, network round trips included, the way a first run holds it: the
    // record of what this machine holds and which Turso account its consent is over are both
    // inside `RemoteSync`, and this writes both. Dropped before the state is read back, because
    // that read takes the same lock.
    let (store, session) = {
        let mut remote_sync = app_state.remote_sync.write().await;
        let (_, store, session) = setup::connect_existing(
            credentials.inner().as_ref(),
            &clock,
            remote_sync.store_mut(),
            &platform_token,
            &McpEndpoint::production(),
            |organization| {
                PlatformApi::new(
                    PlatformEndpoint::production(),
                    organization,
                    credentials.inner().clone(),
                )
            },
            Remote::libsql(),
            &database_path,
            &username,
            &password,
            clock.now(),
        )
        .await?;

        (store, session)
    };

    *app_state.organization.write().await = Some(store);
    *app_state.member.write().await = Some(session);

    state_of(&app_state, &credentials, &clock).await
}

/// Turso's own sentence about the standing account refusal, for the owner and nobody else.
/// A member who is not the owner is answered with nothing rather than refused, because the
/// screen they see says the account needs attention and whom to tell, and that is the whole of
/// what requirement 25 lets them see.
///
/// **The owner is the owner's verified row**, asked for `tursoAccount` (effort 838, requirement
/// 2), and not the role the session opened with: a founder whose session is still open after
/// handing the organization over is a manager, and reads nothing here.
#[tauri::command(rename = "setup_account_refusal_detail")]
pub async fn organization_setup_account_refusal_detail(
    app_state: tauri::State<'_, AppState>,
) -> Result<Option<String>, Error> {
    // not through `as_member`: this reads, so it holds the session for reading where every act
    // holds it for writing, and nobody signed in is answered with nothing rather than the wall.
    let member = app_state.member.read().await;
    let organization = app_state.organization.read().await;

    let (Some(member), Some(store)) = (member.as_ref(), organization.as_ref()) else {
        return Ok(None);
    };

    if workspace::require_owner(
        store,
        member,
        crate::organization::role::permission::Flag::TursoAccount,
        "only the owner reads what turso said about the account",
    )
    .await
    .is_err()
    {
        return Ok(None);
    }

    let remote_sync = app_state.remote_sync.read().await;

    Ok(remote_sync.account_refusal_detail())
}

/// Record which Turso account the consent this machine now holds is over, so the owner's
/// machine can build the Platform API client again: what an owner restored on a new machine
/// does after repeating the consent. The account is discovered the way the first run
/// discovered it, and nothing about it was restored from anywhere.
#[tauri::command(rename = "setup_reconnect_authority")]
pub(crate) async fn organization_setup_reconnect_authority(
    app_state: tauri::State<'_, AppState>,
    credentials: tauri::State<'_, Credentials>,
    clock: tauri::State<'_, clock::Shared>,
) -> Result<OrganizationState, Error> {
    let platform_token = setup::authority(credentials.inner().as_ref())?;

    {
        let mut remote_sync = app_state.remote_sync.write().await;

        if crate::machine::consented_organization(
            remote_sync.store_mut(),
            &platform_token,
            &McpEndpoint::production(),
        )
        .await?
        .is_none()
        {
            return Err(Error::refused(
                RefusalReason::GroupEmpty,
                "the consent was granted over a group with no database in it, and the                           organization is not there. grant it over the group that holds the                           organization",
            ));
        }
    }

    state_of(&app_state, &credentials, &clock).await
}

/// Ask Turso for the authority this application needs, and answer with the page to open.
///
/// **The browser is opened by the caller**: the consent screen is the person's and the
/// application's part of it ends at composing the URL. What is held here is the PKCE verifier and the state, neither of which the web layer
/// is given, so a caller cannot redeem the code that comes back on its own.
///
/// Nothing is granted by this call. It claims a loopback port, registers this application as a
/// public client on it, and returns; what the person does next arrives on that port and is read
/// by [`organization_setup_consent_result`].
#[tauri::command(rename = "setup_consent_begin")]
pub async fn organization_setup_consent_begin(
    app_state: tauri::State<'_, AppState>,
) -> Result<TursoConsentStart, Error> {
    app_state.consent.begin(TursoEndpoints::production()).await
}

/// How far one consent has got.
///
/// **It returns no token**, which is [[rules/credentials]]'s *Client boundary* at the one place
/// this application obtains a Platform API token: the token is filed in the operating system's
/// credential store by the call that redeems it and never crosses to TypeScript.
///
/// Polled while the status is `pending`. A consent that failed says so and says why; one the
/// person abandoned says that instead, because closing the browser tab is the ordinary way a
/// consent ends and there is nothing to report about it.
#[tauri::command(rename = "setup_consent_result")]
pub(crate) async fn organization_setup_consent_result(
    app_state: tauri::State<'_, AppState>,
    credentials: tauri::State<'_, Credentials>,
    session_id: String,
) -> Result<TursoConsentResult, Error> {
    app_state
        .consent
        .result(&session_id, credentials.inner().as_ref())
        .await
}

/// Hand the Turso authority back.
///
/// The token is removed from this machine's credential store and the consents this process
/// started are dropped with it, so nothing is left that a later run could read as a grant.
///
/// **Nothing is revoked at Turso by this**, and the surface offering it has to say so. There
/// is no revocation endpoint in the authorization server's metadata and the token carries no
/// expiry, so what the account granted stays granted until the person ends it in Turso's own
/// dashboard.
///
/// It answers nothing, and disconnecting a machine that holds no token is not an error: the
/// caller asked for there to be no token, and afterwards there is none.
///
/// *This was `organization_disconnect` until effort 824 gave that name to forgetting the
/// organization itself (`organization_session_disconnect` since effort 840), which clears the
/// authority as one of its steps; what the setup walk offers is this narrower act, the consent
/// alone.*
#[tauri::command(rename = "setup_consent_disconnect")]
pub(crate) async fn organization_setup_consent_disconnect(
    app_state: tauri::State<'_, AppState>,
    credentials: tauri::State<'_, Credentials>,
) -> Result<(), Error> {
    app_state.consent.disconnect(credentials.inner().as_ref())
}
