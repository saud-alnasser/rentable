//! the commands of the first run: the Turso consent, the organization created or found in the
//! consented group, the authority reconnected, and what Turso said about the account.

use std::sync::{Arc, Mutex};

use crate::{
    clock,
    credential::{CredentialStore, Credentials},
    error::{Error, RefusalReason},
    organization::Shared,
};

use crate::organization::{
    act::{Acting, Pull, as_member},
    session::{self, CredentialSlot, OrganizationState, sign_out, state_of},
    setup::{
        self, ConnectedToExisting, CreateOrganization, GroupState, OrganizationCreated, Remote,
    },
    workspace,
};
use crate::turso::{
    consent::{
        Account, TursoConsentResult, TursoConsentStart, TursoEndpoints, forget_platform_token,
        move_pending_consent,
    },
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
///
/// **A machine holding other organizations holds this one beside them** (effort 851, requirement
/// 1), and it is selected. A session open here ends first, as a sign-in ends one, since the owner
/// is signed in to the new organization at the end. A group already holding an organization is
/// still refused (`setup::one_organization_to_a_group`).
#[tauri::command(rename = "setup_create")]
pub(crate) async fn organization_setup_create(
    app_state: tauri::State<'_, Shared>,
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

    if app_state.member.read().await.is_some() {
        sign_out(app_state.inner(), credentials.inner().as_ref()).await;
    }

    // held across the creation, network round trips included. The record of what this machine
    // has joined and which Turso organization its consent is over is inside `RemoteSync`, and a
    // first run writes both, so nothing else reads the sync state until it is done. That is a
    // foreground act with a screen saying so, and the calls that wait are the sync manager's.
    let mut remote_sync = app_state.remote_sync.write().await;

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
                Account::Pending,
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
        .held(&created.organization_id)
        .cloned()
        .ok_or_else(|| Error::Internal {
            message: "the organization was created and not recorded".to_string(),
        })?;
    let credential: CredentialSlot = Arc::new(Mutex::new(None));
    let member = session::sign_in(&store, &joined, &password, &credential).await?;

    // the owner's machine enters the registry (effort 828, requirement 15), named (effort 846,
    // requirement 11). A first run draws the machine id with the record (`setup/`) and registers
    // here, after the sign-in, because the push goes out under the credential the vault unsealed.
    session::machine_named(&store, &joined, &member.content_key, clock.now()).await;
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
    _app_state: tauri::State<'_, Shared>,
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
///
/// **An organization this machine already holds is selected and nothing is admitted** (effort 851,
/// requirement 13): the wall is what comes back, and nothing is opened over its replica. One it
/// does not hold is added beside any others and selected. A session open here ends first.
#[tauri::command(rename = "setup_connect_existing")]
pub(crate) async fn organization_setup_connect_existing(
    app_state: tauri::State<'_, Shared>,
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

    if app_state.member.read().await.is_some() {
        sign_out(app_state.inner(), credentials.inner().as_ref()).await;
    }

    // held across the connect, network round trips included, the way a first run holds it: the
    // record of what this machine holds and which Turso account its consent is over are both
    // inside `RemoteSync`, and this writes both. Dropped before the state is read back, because
    // that read takes the same lock.
    let connected = {
        let mut remote_sync = app_state.remote_sync.write().await;

        setup::connect_existing(
            credentials.inner().as_ref(),
            app_state.upgrade.as_ref(),
            &clock,
            remote_sync.store_mut(),
            &platform_token,
            &McpEndpoint::production(),
            |organization| {
                PlatformApi::new(
                    PlatformEndpoint::production(),
                    organization,
                    Account::Pending,
                    credentials.inner().clone(),
                )
            },
            Remote::libsql(),
            &database_path,
            &username,
            &password,
            clock.now(),
        )
        .await?
    };
    let ConnectedToExisting::Connected(_, store, session) = connected else {
        return state_of(&app_state, &credentials, &clock).await;
    };

    *app_state.organization.write().await = Some(store);
    *app_state.member.write().await = Some(*session);

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
    app_state: tauri::State<'_, Shared>,
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
///
/// **The consent becomes the selected organization's own** (effort 851, requirement 14): the
/// consent filed it in the pending slot, and it is moved to the organization's entry here, read,
/// set, read back and deleted, once the account it is over is known. Selecting another
/// organization is refused while a session is open, so the selected one is the one the owner is
/// in. A move that did not finish is refused, and leaves the consent pending for the next try.
#[tauri::command(rename = "setup_reconnect_authority")]
pub(crate) async fn organization_setup_reconnect_authority(
    app_state: tauri::State<'_, Shared>,
    credentials: tauri::State<'_, Credentials>,
    clock: tauri::State<'_, clock::Shared>,
) -> Result<OrganizationState, Error> {
    let platform_token = setup::authority(credentials.inner().as_ref())?;

    {
        let mut remote_sync = app_state.remote_sync.write().await;
        let organization_id = remote_sync
            .store_mut()
            .selected()
            .map(|held| held.id.clone())
            .ok_or_else(|| {
                Error::refused(
                    RefusalReason::NoOrganization,
                    "this machine holds no organization to reconnect the turso account to",
                )
            })?;

        if crate::machine::consented_organization(
            remote_sync.store_mut(),
            Some(&organization_id),
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

        move_pending_consent(credentials.inner().as_ref(), &organization_id)?;
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
    app_state: tauri::State<'_, Shared>,
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
    app_state: tauri::State<'_, Shared>,
    credentials: tauri::State<'_, Credentials>,
    session_id: String,
) -> Result<TursoConsentResult, Error> {
    app_state
        .consent
        .result(&session_id, credentials.inner().as_ref())
        .await
}

/// Hand the pending Turso authority back: the setup walk's disconnect, before the consent belongs
/// to any organization.
///
/// The token is removed from this machine's credential store and the consents this process
/// started are dropped with it, so nothing is left that a later run could read as a grant. The
/// Turso organization looked up for it goes too, so the next consent, over another account
/// perhaps, is not built on this one's slug. **An organization's own consent is not this act's**:
/// the leaving card gives that back ([`organization_setup_forget_authority`]).
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
    app_state: tauri::State<'_, Shared>,
    credentials: tauri::State<'_, Credentials>,
) -> Result<(), Error> {
    disconnect_pending(&app_state, credentials.inner().as_ref()).await
}

/// [`organization_setup_consent_disconnect`]'s act, over the state a test holds as the plugin does.
pub(crate) async fn disconnect_pending(
    app_state: &Shared,
    credentials: &dyn CredentialStore,
) -> Result<(), Error> {
    app_state.consent.disconnect(credentials)?;

    let mut remote_sync = app_state.remote_sync.write().await;
    let store = remote_sync.store_mut();

    store.forget_consent_organization(None);
    store.commit()
}

/// Give back the Turso account of the organization this machine has open: the owner's leaving
/// card, "forget Turso account" (effort 846, requirement 13; effort 851, requirement 14).
///
/// **That organization's own consent, and the Turso organization it was over**: the `org:<id>`
/// entry goes from the keyring, and its entry on the record forgets the slug, so a consent granted
/// again is looked up afresh, perhaps over another account (`setup_reconnect_authority`). The
/// pending slot, which is a setup's, and every other organization's consent are left as they are.
/// *It reached the setup walk's disconnect until a review of effort 851, which gave back only the
/// pending slot, so the card said the account was forgotten and the machine went on holding it.*
///
/// **Nothing is revoked at Turso by this**, for the reason the walk's disconnect gives, and the
/// card says so. Forgetting a consent this machine does not hold is not an error. What answers is
/// the whole state, which then says the organization's authority is not held here.
#[tauri::command(rename = "setup_forget_authority")]
pub(crate) async fn organization_setup_forget_authority(
    app_state: tauri::State<'_, Shared>,
    credentials: tauri::State<'_, Credentials>,
    clock: tauri::State<'_, clock::Shared>,
) -> Result<OrganizationState, Error> {
    forget_authority(&app_state, credentials.inner().as_ref()).await?;

    state_of(&app_state, &credentials, &clock).await
}

/// [`organization_setup_forget_authority`]'s act: the open organization's consent, or a refusal
/// where none is open.
pub(crate) async fn forget_authority(
    app_state: &Shared,
    credentials: &dyn CredentialStore,
) -> Result<(), Error> {
    let organization_id = session::forget::open_organization(app_state)
        .await
        .ok_or_else(|| {
            Error::refused(
                RefusalReason::NoOrganization,
                "this machine holds no organization to forget the turso account of",
            )
        })?;

    forget_platform_token(credentials, &Account::of(&organization_id))?;

    let mut remote_sync = app_state.remote_sync.write().await;
    let store = remote_sync.store_mut();

    store.forget_consent_organization(Some(&organization_id));
    store.commit()
}

/// Rename the organization, as its owner (effort 851, requirements 22 to 28).
///
/// **One command for the whole act, and the screens observe it.** The signed name and the unsigned
/// column are written and sent (`setup::rename_organization`), this machine's own entry names the
/// new name at once, so the wall and the switcher read it with no restart, and what answers is the
/// whole state, so the settings tab and the shell read the name just set rather than the one they
/// had (requirement 25). Every other member's machine follows once it has synced while signed in
/// (requirement 26, `session::state_of`).
///
/// The name is validated by the form first and again by Rust, which is what stores it.
#[tauri::command(rename = "setup_rename")]
pub(crate) async fn organization_setup_rename(
    app_state: tauri::State<'_, Shared>,
    credentials: tauri::State<'_, Credentials>,
    clock: tauri::State<'_, clock::Shared>,
    name: String,
) -> Result<OrganizationState, Error> {
    rename(&app_state, &credentials, &clock, &name).await
}

/// [`organization_setup_rename`]'s act, over the state a test holds as the plugin does.
pub(crate) async fn rename(
    app_state: &Shared,
    credentials: &Credentials,
    clock: &clock::Shared,
    name: &str,
) -> Result<OrganizationState, Error> {
    // one moment for the signed row and this machine's latch on it, so the owner's own read of
    // the row it just wrote is never older than what the entry holds.
    let now = clock.now();
    let (organization_id, renamed) =
        as_member(app_state, Pull::No, async |Acting { member, store }| {
            let renamed = setup::rename_organization(store, member, name, now).await?;

            Ok((member.organization_id.clone(), renamed))
        })
        .await?;

    app_state
        .remote_sync
        .write()
        .await
        .rename_held_organization(&organization_id, &renamed, now)?;

    state_of(app_state, credentials, clock).await
}
