use std::sync::{Arc, Mutex, atomic::Ordering};

use serde::{Deserialize, Serialize};
use tauri::Emitter;

use crate::{diagnostics, error::Error, state::AppState, timestamp};

use super::{
    HeldOrganization, connect, forget,
    invite::{self, FreshCode, Invitation, Invited, MemberFacts, WorkspaceGrant},
    join::{self, LinkFacts},
    link::JoinLink,
    migrate::Pipeline,
    migration::{self, MigrationPhase, PipelineLease},
    password,
    removal::{self, LockOutCost, Removed},
    role,
    session::{self, CredentialSlot, Resumption, SessionFacts, SessionsEnded, WorkspaceFacts},
    setup::{self, CreateOrganization, OrganizationCreated, Remote},
    store::OrganizationStore,
    workspace,
};
use crate::sync::turso::{
    discovery::McpEndpoint,
    platform::{AccessLevel, PlatformApi, PlatformEndpoint},
};

/// The organization this machine holds, as the wall names it. No key.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HeldOrganizationFacts {
    pub id: String,
    pub name: String,
    /// this person's member row, once a sign-in has found it; `None` on a machine that connected
    /// by link and has not signed in yet.
    pub member_id: Option<String>,
    /// their role, as last read. A display fact; `None` with `member_id`.
    pub role: Option<String>,
    pub joined_at: i64,
}

impl From<&HeldOrganization> for HeldOrganizationFacts {
    fn from(held: &HeldOrganization) -> Self {
        Self {
            id: held.id.clone(),
            name: held.name.clone(),
            member_id: held.member_id.clone(),
            role: held.role.clone(),
            joined_at: held.joined_at,
        }
    }
}

/// Where this machine stands: the one organization it holds, if any, and who is signed in.
///
/// What the sign-in wall admits on. `session` is `None` until a password has opened a vault in
/// this process, and it carries facts and no credential.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrganizationState {
    /// the organization this machine holds, or `None` on a machine that holds nothing, which is
    /// what the screen offering the two ways to connect is drawn on (requirement 18). *A list
    /// until 2026-09-13.*
    pub organization: Option<HeldOrganizationFacts>,
    pub session: Option<SessionFacts>,
    /// whether this machine holds the Turso authority and knows which account it is over: the
    /// owner's machine after a consent. An owner restored on a new machine holds none until they
    /// repeat the consent, which is the one thing a restore cannot bring with it (requirement 5).
    pub holds_turso_authority: bool,
    /// whether the wall is up because this member's sessions were ended from another machine
    /// (effort 826, requirement 22), which is a sentence the wall carries rather than a refusal
    /// anybody made here. False the moment somebody is signed in again.
    pub signed_out_elsewhere: bool,
}

/// Create an organization on the consented Turso account, with this machine's person as its
/// owner, from the three things the setup walk collects, and sign them in to it.
///
/// **None of the three crosses back, and nothing else crosses at all.** The password is turned
/// into a vault here and dropped; the organization key and the owner's signing key are derived
/// and never stored; the Platform API token is read from the keyring where the consent filed it.
/// What the web layer is told is the organization's id, the join link, and whether the rows have
/// reached Turso yet ([[rules/credentials]], *Client boundary*).
///
/// A machine with no consent is refused before anything is asked of Turso, with an answer that
/// says to connect the account first. Every failure after the database exists removes it, so a
/// first run that did not finish leaves nothing behind; `setup.rs` says how.
#[tauri::command]
pub async fn organization_create(
    app_state: tauri::State<'_, AppState>,
    name: String,
    username: String,
    password: String,
) -> Result<OrganizationCreated, Error> {
    let platform_token = setup::authority()?;
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
        remote_sync.store_mut(),
        &platform_token,
        &McpEndpoint::production(),
        |organization| PlatformApi::new(PlatformEndpoint::production(), organization),
        Remote::libsql(),
        &database_path,
        CreateOrganization {
            name: &name,
            username: &username,
            password: &password,
        },
        setup::SHIPPING_KDF,
        timestamp::now(),
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

    *app_state.organization.write().await = Some(store);
    *app_state.member.write().await = Some(member);

    Ok(created)
}

/// Where this machine stands: the organization it holds and who is signed in.
///
/// **`public` on the other side for the same reason the sync state is**: it is what the wall
/// admits on, so requiring a signed-in caller would make it answerable only to machines whose
/// answer is already known.
///
/// **The first read of a launch checks the shape of what the machine holds** and forgets it
/// where it was built before this build (requirement 17, `forget.rs`), before anything opens the
/// replica. Every later read, and every command that answers with the state, finds the check
/// already made.
///
/// **That same first read signs the machine back in** where it stayed signed in (effort 826,
/// requirement 12), so the shell's first question is already answered with a session and the
/// application opens on the workspace the person had last, with no wall in between.
#[tauri::command]
pub async fn organization_state_get(
    app_state: tauri::State<'_, AppState>,
) -> Result<OrganizationState, Error> {
    state_of(&app_state).await
}

/// The state, with the once-per-launch check made first.
///
/// **The same cell resumes a remembered session** (effort 826, requirement 12). It is one cell
/// rather than two because both are things that happen once, before anything else opens the
/// replica, and the order between them matters: a machine holding the old shape has just had its
/// replica deleted and its record emptied, and there is nothing left for a resume to open.
pub(crate) async fn state_of(app_state: &AppState) -> Result<OrganizationState, Error> {
    app_state
        .old_shape_check
        .get_or_try_init(|| async {
            forget::forget_old_shape(app_state).await?;
            resume_remembered(app_state).await;

            Ok::<(), Error>(())
        })
        .await?;

    let organization = {
        let mut remote_sync = app_state.remote_sync.write().await;

        remote_sync
            .store_mut()
            .organization
            .as_ref()
            .map(HeldOrganizationFacts::from)
    };
    let session = current_facts(app_state).await?;
    let holds_turso_authority = owner_platform(app_state).await.is_some();

    // the standing is only ever about a wall that is up: somebody signed in has answered it,
    // whichever way they got back in, so this one read clears it rather than five sign-in paths
    // each remembering to.
    if session.is_some() {
        app_state
            .signed_out_elsewhere
            .store(false, Ordering::SeqCst);
    }

    Ok(OrganizationState {
        organization,
        session,
        holds_turso_authority,
        signed_out_elsewhere: app_state.signed_out_elsewhere.load(Ordering::SeqCst),
    })
}

/// Connect this machine to the organization a link names: reach its replica as
/// `organization_link_inspect` does, check the rows against the key the link pins, and record
/// the organization with no member. No vault opens; the person signs in at the wall, or opens
/// their invitation (`invitation_accept`) where the link carries one.
///
/// A machine holds one organization (requirement 17). A link naming the one it already holds
/// changes nothing and answers with the state, so an invitation link to the held organization
/// goes straight to its password step; a link naming another is refused, and the way to it is a
/// disconnect first.
#[tauri::command]
pub async fn organization_connect(
    app_state: tauri::State<'_, AppState>,
    link: String,
) -> Result<OrganizationState, Error> {
    let link = JoinLink::decode(&link)?;

    {
        let mut remote_sync = app_state.remote_sync.write().await;
        let held = remote_sync.store_mut();

        if held
            .organization
            .as_ref()
            .is_some_and(|held| held.id == link.organization_id)
        {
            drop(remote_sync);

            return state_of(&app_state).await;
        }

        connect::refuse_while_held(held)?;
    }

    let store = reached(&app_state, &link).await?;

    {
        let mut remote_sync = app_state.remote_sync.write().await;

        connect::connect(&store, remote_sync.store_mut(), &link, timestamp::now()).await?;
    }

    // the replica is let go of rather than held: nobody is signed in, and the sign-in opens it
    // again with the credential the vault unseals.
    drop(store);

    state_of(&app_state).await
}

/// Forget the organization this machine holds (requirement 20): sign out where somebody is in,
/// delete every replica under the data directory, empty the record, and clear the Turso
/// authority. The organization on Turso is untouched, and the person can connect again by the
/// link. The one confirm before it is the screen's; this asks nothing.
#[tauri::command]
pub async fn organization_disconnect(
    app_state: tauri::State<'_, AppState>,
) -> Result<OrganizationState, Error> {
    forget::forget(&app_state).await?;

    state_of(&app_state).await
}

/// Sign in to the organization this machine holds, with a username and a password (effort 824,
/// requirement 19).
///
/// **Works with the network down.** The replica on this machine is opened, its rows are verified
/// against the key this machine pinned when it connected, and the password is tried against each
/// member's vault until one opens, whose username has to be the one typed. A pull is attempted
/// once the vault is open and its failure is not one: the replica goes on serving what it holds
/// (819's requirement 18).
///
/// The wrong password, a username nobody holds, and a username held by somebody whose password
/// this is not are refused with one sentence ([[rules/credentials]]): there is no comparison to
/// skip, and the session that results holds the keys the password unsealed, which a wrong one
/// never produces. A first sign-in on a handed password spends the invitation and the record
/// learns which member this person is; `join.rs` says how.
#[tauri::command]
pub async fn organization_sign_in(
    app_state: tauri::State<'_, AppState>,
    username: String,
    password: String,
) -> Result<OrganizationState, Error> {
    let held = {
        let mut remote_sync = app_state.remote_sync.write().await;

        remote_sync
            .store_mut()
            .organization
            .clone()
            .ok_or_else(|| Error::PreconditionFailed {
                message: "this machine holds no organization to sign in to".to_string(),
            })?
    };
    let (store, credential) = open_replica(app_state.inner(), &held).await?;

    let member = {
        let mut remote_sync = app_state.remote_sync.write().await;

        join::admit(
            &store,
            remote_sync.store_mut(),
            &held,
            &username,
            &password,
            &credential,
        )
        .await?
    };

    // best effort, and after the vault is open, because the pull needs the credential the vault
    // held. What arrives is read on the next question, and what does not arrive is the offline
    // case rather than a failure of signing in.
    store.pull().await;

    *app_state.organization.write().await = Some(store);
    *app_state.member.write().await = Some(member);

    state_of(&app_state).await
}

/// Put the wall back up: drop the keys this process held, and let go of the replica. The record
/// is untouched, so the wall comes back up on the same organization with the same member.
#[tauri::command]
pub async fn organization_sign_out(
    app_state: tauri::State<'_, AppState>,
) -> Result<OrganizationState, Error> {
    sign_out(&app_state).await;

    state_of(&app_state).await
}

/// The sign-out itself: the keys go, the organization replica is dropped, and the key this
/// machine was staying signed in on is deleted. What `organization_sign_out` does, and what
/// `forget` does first, so that letting go of the replica is one routine and the file it held can
/// be deleted afterwards.
///
/// **The remembered key goes here rather than in each caller**, which is what makes a disconnect
/// forget it too: a machine that has let go of its organization must not keep the key that opened
/// a member's vault in it. The record is read before it is emptied, which is why this runs before
/// `forget` touches it.
pub(crate) async fn sign_out(app_state: &AppState) {
    // a sign-out the person asked for answers the standing: they are at the wall because they
    // put themselves there. The heartbeat's own sign-out sets it again afterwards, which is the
    // one case where the wall has something to say.
    app_state
        .signed_out_elsewhere
        .store(false, Ordering::SeqCst);

    {
        let mut remote_sync = app_state.remote_sync.write().await;
        let held = remote_sync.store_mut().organization.as_ref();

        if let Some((organization_id, member_id)) =
            held.and_then(|held| held.member_id.as_ref().map(|member| (&held.id, member)))
        {
            session::forget_remembered(organization_id, member_id);
        }
    }

    *app_state.member.write().await = None;
    *app_state.organization.write().await = None;
}

/// Sign in with the key this machine filed at the last sign-in, where it has one and nobody is in
/// yet: the launch that goes straight past the wall (effort 826, requirement 12).
///
/// **Nothing here is a failure.** A record naming no member, an empty keyring, a key that no
/// longer opens the vault, a replica that will not open: every one of them leaves the `member`
/// slot empty, which is the wall, and the person signs in as they did before. So this answers
/// with nothing and writes what happened to the diagnostics log.
///
/// The replica is opened the way `organization_sign_in` opens it, through the same call, so a
/// resumed session reaches its remote on exactly the terms a typed one does.
async fn resume_remembered(app_state: &AppState) {
    if app_state.member.read().await.is_some() {
        return;
    }

    let held = {
        let mut remote_sync = app_state.remote_sync.write().await;

        remote_sync.store_mut().organization.clone()
    };
    let Some(held) = held.filter(|held| held.member_id.is_some()) else {
        return;
    };

    let resumed = match open_replica(app_state, &held).await {
        Ok((store, credential)) => session::resume(&store, &held, &credential)
            .await
            .map(|resumption| (store, resumption)),
        Err(refusal) => Err(refusal),
    };

    let (store, member) = match resumed {
        Ok((store, Resumption::Opened(member))) => (store, *member),
        // the sessions were ended from another machine while this one was closed: the wall goes
        // up with the sentence for it rather than with the one every other launch shows.
        Ok((_, Resumption::SignedOutElsewhere)) => {
            app_state.signed_out_elsewhere.store(true, Ordering::SeqCst);

            diagnostics::info("organization.session.notResumed")
                .with("organization", held.id.as_str())
                .with("reason", "the sessions were ended from another machine")
                .write();

            return;
        }
        Err(refusal) => {
            diagnostics::info("organization.session.notResumed")
                .with("organization", held.id.as_str())
                .with("reason", refusal.to_string())
                .write();

            return;
        }
    };

    *app_state.organization.write().await = Some(store);
    *app_state.member.write().await = Some(member);

    diagnostics::info("organization.session.resumed")
        .with("organization", held.id.as_str())
        .write();
}

/// Whether the member signed in on this machine has been signed out from every machine since,
/// and if so put the wall up: the check the sync heartbeat makes (effort 826, requirement 22).
///
/// **The heartbeat rather than a timer of its own**, because the property wanted is that a
/// machine with the application open is at the wall within one heartbeat of the push reaching it,
/// and the heartbeat is already the thing that runs when nobody is doing anything. The
/// organization replica is pulled first, since the row was written on another machine and this
/// one learns of it no other way; a pull that could not go leaves the check to the next one,
/// which is the offline case rather than a failure.
///
/// What it does when the row has moved on is exactly what a sign-out does, through the same
/// routine: the keys go, the replica is let go of, the remembered key is deleted. What it adds is
/// the standing, so the wall says which sign-out this was.
pub(crate) async fn ended_elsewhere(app_state: &AppState) -> bool {
    let ended = {
        let member = app_state.member.read().await;
        let organization = app_state.organization.read().await;

        let (Some(member), Some(store)) = (member.as_ref(), organization.as_ref()) else {
            return false;
        };

        store.pull().await;

        // and out, which is what carries a bump made offline. `end_elsewhere` writes the number
        // on this machine's replica and pushes; a push that could not go left it there, and no
        // other scheduled path pushes the organization replica, so without this the sessions the
        // person was told would end stay open until they happen to make another organization
        // write. A push with nothing to send costs a round trip on a heartbeat that already
        // made one.
        store.push().await;

        match session::ended_elsewhere(store, member).await {
            Ok(ended) => ended,
            // a row that will not read is not a sign-out: the replica is the offline case and
            // this member goes on working against what it holds (requirement 18).
            Err(refusal) => {
                diagnostics::warn("organization.session.standingUnread")
                    .with("reason", refusal.to_string())
                    .write();

                false
            }
        }
    };

    if !ended {
        return false;
    }

    sign_out(app_state).await;
    app_state.signed_out_elsewhere.store(true, Ordering::SeqCst);

    diagnostics::info("organization.session.endedFromAnotherMachine").write();

    true
}

/// The organization replica on this machine, opened against its remote with a credential slot a
/// sign-in or a resume fills.
///
/// Built through the same call as every replica, so it opens whether or not the remote is
/// reachable; the token function answers from the slot, which is empty until a vault is open and
/// is what stops an open replica reaching the remote before anybody is in.
async fn open_replica(
    app_state: &AppState,
    held: &HeldOrganization,
) -> Result<(OrganizationStore, CredentialSlot), Error> {
    let database_path = {
        let settings = app_state.settings.read().await;

        settings.database_path.clone()
    };
    let credential: CredentialSlot = Arc::new(Mutex::new(None));
    let slot = Arc::clone(&credential);
    let store = OrganizationStore::open(
        &OrganizationStore::replica_path(&database_path, &held.id),
        Some(held.remote_url.clone()),
        move || {
            let slot = Arc::clone(&slot);

            async move {
                slot.lock()
                    .ok()
                    .and_then(|slot| slot.clone())
                    .ok_or_else(|| turso::Error::Misuse("no credential is unsealed yet".into()))
            }
        },
    )
    .await?;

    Ok((store, credential))
}

/// The signed-in member's facts, re-read from the replica so a row that changed under them since
/// sign-in is what the screen shows.
async fn current_facts(app_state: &AppState) -> Result<Option<SessionFacts>, Error> {
    let member = app_state.member.read().await;
    let organization = app_state.organization.read().await;

    let (Some(member), Some(store)) = (member.as_ref(), organization.as_ref()) else {
        return Ok(None);
    };

    session::facts_of(store, member).await.map(Some)
}

/// The Platform API client this machine can build, where it holds the authority and knows the
/// organization: the owner's machine after a consent, and nobody else's. `None` is not a failure;
/// it is what makes a read-only grant, a create and a delete the owner's, at the command.
async fn owner_platform(app_state: &AppState) -> Option<PlatformApi> {
    setup::authority().ok()?;

    let mut remote_sync = app_state.remote_sync.write().await;
    let organization = remote_sync.store_mut().turso_organization.clone()?;

    Some(PlatformApi::new(
        PlatformEndpoint::production(),
        organization,
    ))
}

/// The signed-in member and their organization replica, or the wall.
fn signed_in<'a>(
    member: &'a mut Option<session::MemberSession>,
    store: &'a Option<OrganizationStore>,
) -> Result<(&'a mut session::MemberSession, &'a OrganizationStore), Error> {
    match (member.as_mut(), store.as_ref()) {
        (Some(member), Some(store)) => Ok((member, store)),
        _ => Err(Error::PreconditionFailed {
            message: "nobody is signed in to an organization on this machine".to_string(),
        }),
    }
}

/// Create a workspace on the account, migrated and granted to the owner. Owner only, at the
/// command: anybody else is told to ask the owner, before any request.
#[tauri::command]
pub async fn workspace_create(
    app_state: tauri::State<'_, AppState>,
    name: String,
) -> Result<WorkspaceFacts, Error> {
    let platform = owner_platform(&app_state)
        .await
        .ok_or_else(|| Error::Forbidden {
            message:
                "only an owner can create a workspace, from the machine that connected the turso \
                  account. ask the owner"
                    .to_string(),
        })?;
    let mut member = app_state.member.write().await;
    let store = app_state.organization.read().await;
    let (member, store) = signed_in(&mut member, &store)?;

    workspace::create_workspace(
        store,
        member,
        &platform,
        Pipeline::of,
        &name,
        timestamp::now(),
    )
    .await
}

/// Grant a workspace to a member. Full access re-seals the caller's own credential; read-only is
/// minted, which only the owner's machine can do.
#[tauri::command]
pub async fn workspace_grant(
    app_state: tauri::State<'_, AppState>,
    workspace_id: String,
    member_id: String,
    access: AccessLevel,
) -> Result<(), Error> {
    let platform = owner_platform(&app_state).await;
    let mut member = app_state.member.write().await;
    let store = app_state.organization.read().await;
    let (member, store) = signed_in(&mut member, &store)?;

    workspace::grant_workspace(
        store,
        member,
        platform.as_ref(),
        &workspace_id,
        &member_id,
        access,
    )
    .await
}

/// Take a workspace back from a member: the grant row goes, and nothing is minted or rotated, so
/// the credential they already hold works until it expires as an ordinary removal's does. The act
/// is the one that gives; the owner's own grant is refused.
#[tauri::command]
pub async fn workspace_grant_withdraw(
    app_state: tauri::State<'_, AppState>,
    workspace_id: String,
    member_id: String,
) -> Result<(), Error> {
    let mut member = app_state.member.write().await;
    let store = app_state.organization.read().await;
    let (member, store) = signed_in(&mut member, &store)?;

    workspace::withdraw_grant(store, member, &workspace_id, &member_id).await
}

/// Delete a workspace: the one moment requirement 4 permits deleting a database, through the one
/// intent the port takes for it. Owner only.
#[tauri::command]
pub async fn workspace_delete(
    app_state: tauri::State<'_, AppState>,
    workspace_id: String,
) -> Result<(), Error> {
    let platform = owner_platform(&app_state)
        .await
        .ok_or_else(|| Error::Forbidden {
            message:
                "only an owner can delete a workspace, from the machine that connected the turso \
                  account. ask the owner"
                    .to_string(),
        })?;
    let mut member = app_state.member.write().await;
    let store = app_state.organization.read().await;
    let (member, store) = signed_in(&mut member, &store)?;

    workspace::delete_workspace(store, member, &platform, &workspace_id).await
}

/// The event the shell listens to while a workspace is being upgraded: which workspace, and where
/// the upgrade is, so a member watching sees it running rather than the application stuck.
pub const MIGRATION_EVENT: &str = "organization:migration";

/// What the event carries.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct MigrationNotice {
    workspace_id: String,
    #[serde(flatten)]
    phase: MigrationPhase,
}

/// Open a workspace this member holds a grant on: record it as this machine's current workspace,
/// hold the credential the vault unsealed for the replica, and open the replica.
///
/// **The credential never leaves Rust.** What comes back is the workspace as a fact; the token is
/// in the sync state's own hands and the replica asks it per request.
#[tauri::command]
pub async fn workspace_open(
    app: tauri::AppHandle,
    app_state: tauri::State<'_, AppState>,
    workspace_id: String,
) -> Result<WorkspaceFacts, Error> {
    let (facts, credential) = {
        let mut member = app_state.member.write().await;
        let store = app_state.organization.read().await;
        let (member, store) = signed_in(&mut member, &store)?;

        member.settled()?;

        // requirement 24: the guard below turns on `schema_version`, and a version another machine
        // raised reaches this one as a replicated row rather than a push. Pull the organization
        // replica first, so the guard reads what the account holds now and not what this machine
        // last saw: without it an older build reads a stale row, passes the guard, and then the
        // workspace replica pulls the migrated pages it cannot understand. The lease serialises the
        // writers; this is what keeps a reader from opening across one.
        store.pull().await;

        let workspaces = store.workspaces(&member.verifying_key).await?;
        let (mut facts, credential) = workspace::openable(member, &workspaces, &workspace_id)?
            .ok_or_else(|| Error::Forbidden {
                message: "you hold no grant on that workspace".to_string(),
            })?;

        // a workspace this build was not written against is refused here, before the replica is
        // named, and nothing of it is read.
        migration::refuse_newer(&facts)?;

        // requirement 20: a workspace behind what this build ships is brought up to it, under a
        // lease taken at the organization database's primary, by whichever member opened it.
        // The organization credential in the session's slot is what the lease is taken under,
        // and the member's own workspace credential is what the migrations go over.
        if migration::is_pending(&facts) {
            let organization_credential = member
                .organization_credential
                .lock()
                .ok()
                .and_then(|slot| slot.clone())
                .ok_or_else(|| Error::PreconditionFailed {
                    message: "this machine holds no credential to the organization database, so                               it cannot take the lease to upgrade the workspace"
                        .to_string(),
                })?;
            let organization_host = {
                let mut remote_sync = app_state.remote_sync.write().await;

                remote_sync
                    .store_mut()
                    .organization
                    .as_ref()
                    .filter(|held| held.id == member.organization_id)
                    .map(|held| held.remote_url.trim_start_matches("libsql://").to_string())
                    .unwrap_or_default()
            };
            let lease =
                PipelineLease::new(Pipeline::of(&organization_host), &organization_credential);
            let notice = |phase: MigrationPhase| {
                let _ = app.emit(
                    MIGRATION_EVENT,
                    MigrationNotice {
                        workspace_id: workspace_id.clone(),
                        phase,
                    },
                );
            };

            facts.schema_version = migration::upgrade(
                migration::Pending {
                    store,
                    session: member,
                    facts: &facts,
                    held: &credential,
                    pipeline: &Pipeline::of(&facts.database_hostname),
                },
                &lease,
                || tokio::time::sleep(migration::LEASE_POLL_INTERVAL),
                notice,
                timestamp::now,
            )
            .await?;
        }

        (facts, credential)
    };

    {
        let permissions = app_state
            .member
            .read()
            .await
            .as_ref()
            .map(|member| member.permissions)
            .unwrap_or_default();
        let mut remote_sync = app_state.remote_sync.write().await;

        remote_sync.open_organization_workspace(
            &facts.id,
            &facts.name,
            &format!("libsql://{}", facts.database_hostname),
            permissions,
            &credential.token,
        )?;
    }

    if let Some(error) = crate::bootstrap::open_database(&app_state).await {
        return Err(error);
    }

    Ok(facts)
}

/// Mint fresh credentials for every grant and re-seal them, on the owner's machine. Answers with
/// how many grants were renewed.
#[tauri::command]
pub async fn organization_renew_credentials(
    app_state: tauri::State<'_, AppState>,
) -> Result<usize, Error> {
    let platform = owner_platform(&app_state)
        .await
        .ok_or_else(|| Error::Forbidden {
            message:
                "credentials are renewed on the owner's machine, which holds the turso authority"
                    .to_string(),
        })?;
    let mut member = app_state.member.write().await;
    let store = app_state.organization.read().await;
    let (member, store) = signed_in(&mut member, &store)?;
    let organization_database = format!("org-{}", member.organization_id);

    workspace::renew_credentials(store, member, &platform, &organization_database).await
}

/// The organization's own join link, rebuilt for the owner to share or to keep.
///
/// **The owner's, and readable any time rather than only in the moment setup shows it.** An owner
/// whose first machine is gone restores from this link (requirement 6), so a link shown once and
/// never again is a way to lose the organization. It carries a read-only credential over the sealed
/// rows, the same the setup walk produced; that credential is stored sealed under the content key,
/// so rebuilding the link needs the owner's open vault and not the Turso authority, which a restored
/// owner does not yet hold. It is refused to anyone but the owner, whose link it is to share.
#[tauri::command]
pub async fn organization_own_link(app_state: tauri::State<'_, AppState>) -> Result<String, Error> {
    let mut member = app_state.member.write().await;
    let store = app_state.organization.read().await;
    let (member, store) = signed_in(&mut member, &store)?;

    invite::own_link(member, store).await
}

/// Renew credentials if any is close to lapsing, on the owner's machine, best effort. Answers
/// whether it renewed. This is what keeps an organization syncing past the four-week credential
/// lifetime: the owner's machine, which is the only one holding the platform authority, calls it
/// after sign-in, and it mints only when something is within the renewal window rather than on
/// every launch. A machine that is not the owner's, or holds no authority, or is not signed in,
/// answers `false` and does nothing, so the caller can fire it and forget it. It never blocks
/// sign-in, which works offline (requirement 18).
#[tauri::command]
pub async fn organization_renew_due(app_state: tauri::State<'_, AppState>) -> Result<bool, Error> {
    let Some(platform) = owner_platform(&app_state).await else {
        return Ok(false);
    };
    let mut member = app_state.member.write().await;
    let store = app_state.organization.read().await;
    let Ok((member, store)) = signed_in(&mut member, &store) else {
        return Ok(false);
    };
    if member.settled().is_err() {
        return Ok(false);
    }

    let now = crate::timestamp::now();
    if !workspace::credentials_due(store, member, workspace::CREDENTIAL_RENEWAL_WINDOW_MS, now)
        .await?
    {
        return Ok(false);
    }

    let organization_database = format!("org-{}", member.organization_id);
    workspace::renew_credentials(store, member, &platform, &organization_database).await?;

    Ok(true)
}

/// Invite a member: a row, and one link. The application sends nothing; the administrator hands
/// the link over themselves.
///
/// **No password crosses.** The generated password the vault is sealed under leaves `invite::issue`
/// in two sealed columns of the invitation row, `sealed_secret` and `code_seal`, and nowhere else.
/// What crosses is the link, which carries the invitation id and the link secret, and the
/// six-character code, which is the other half of what opens that seal; [[rules/credentials]],
/// *Client boundary*, is what sanctions the two. Everything else the invitation makes stays on
/// this side: the member's vault, the content key sealed to them, and the grants. A read-only
/// grant is minted with the owner's authority, which is why the platform is handed in where this
/// machine holds it.
#[tauri::command]
pub async fn member_invite(
    app_state: tauri::State<'_, AppState>,
    username: String,
    role: String,
    workspaces: Vec<WorkspaceGrant>,
) -> Result<Invited, Error> {
    let platform = owner_platform(&app_state).await;
    let mut member = app_state.member.write().await;
    let store = app_state.organization.read().await;
    let (member, store) = signed_in(&mut member, &store)?;
    let link = invite::organization_link(store, member).await?;

    invite::invite_member(
        store,
        member,
        platform.as_ref(),
        &link,
        Invitation {
            username: &username,
            role: &role,
            workspaces: &workspaces,
        },
        invite::INVITED_KDF,
        timestamp::now(),
    )
    .await
}

/// Reset a member's password: a fresh vault under a fresh secret, everything the resetting
/// administrator reaches re-sealed to it, and a fresh invitation, handed back as a new link. What
/// a reset is, for a member whose password nobody knows; the answer names the workspaces it could
/// not restore, and the member's permissions are kept.
#[tauri::command]
pub async fn member_reset(
    app_state: tauri::State<'_, AppState>,
    member_id: String,
) -> Result<Invited, Error> {
    let platform = owner_platform(&app_state).await;
    let mut member = app_state.member.write().await;
    let store = app_state.organization.read().await;
    let (member, store) = signed_in(&mut member, &store)?;
    // the row this act writes back whole carries the session epoch, so it is read after a pull
    // rather than off this machine's last sight of it (effort 826, requirement 22).
    store.pull().await;
    let link = invite::organization_link(store, member).await?;

    invite::reissue_invitation(
        store,
        member,
        platform.as_ref(),
        &link,
        &member_id,
        invite::INVITED_KDF,
        timestamp::now(),
    )
    .await
}

/// The invitation link again, for the person who issued it: the secret is sealed to their key on
/// the row, so their open vault is the one thing that rebuilds it. Anybody else with the act is
/// refused and offered a new link, which is a reset.
#[tauri::command]
pub async fn invitation_link(
    app_state: tauri::State<'_, AppState>,
    invitation_id: String,
) -> Result<String, Error> {
    let mut member = app_state.member.write().await;
    let store = app_state.organization.read().await;
    let (member, store) = signed_in(&mut member, &store)?;

    invite::invitation_link(store, member, &invitation_id).await
}

/// A fresh confirmation code for an invitation, for the person who issued it (effort 826,
/// requirement 23). The vault password is sealed under it and the link's secret together, so only
/// the issuer's open vault can make one; anybody else with the act is refused and offered a new
/// link, which is a reset.
///
/// **The code crosses once, as the generated password used to**: it is read out on a call or in
/// person and typed into the connect screen, which is the one thing the person on the other side
/// can do with it, and it is never written under the data directory.
#[tauri::command]
pub async fn invitation_code(
    app_state: tauri::State<'_, AppState>,
    invitation_id: String,
) -> Result<FreshCode, Error> {
    let mut member = app_state.member.write().await;
    let store = app_state.organization.read().await;
    let (member, store) = signed_in(&mut member, &store)?;

    invite::invitation_code(
        store,
        member,
        &invitation_id,
        invite::INVITED_KDF,
        timestamp::now(),
    )
    .await
}

/// Open an invitation link: the way in for a person who was invited or reset (effort 826,
/// requirements 8 and 9). The organization the link names has to be the one this machine holds,
/// which `organization_connect` arranges first; the secret inside the link opens the member's
/// vault, the password they chose reseals it, the invitation is spent, and they are signed in.
///
/// **`public`, because it happens at the wall.** Neither the secret nor the password crosses
/// back; what comes back is where the machine stands, with a session in it.
#[tauri::command]
pub async fn invitation_accept(
    app_state: tauri::State<'_, AppState>,
    link: String,
    code: String,
    password: String,
) -> Result<OrganizationState, Error> {
    let link = JoinLink::decode(&link)?;
    let held = {
        let mut remote_sync = app_state.remote_sync.write().await;

        remote_sync
            .store_mut()
            .organization
            .clone()
            .ok_or_else(|| Error::PreconditionFailed {
                message: "this machine holds no organization yet; connect with the link first"
                    .to_string(),
            })?
    };

    if held.id != link.organization_id {
        return Err(Error::PreconditionFailed {
            message: format!(
                "this link is for {} and this machine holds {}; disconnect it first",
                link.organization_name, held.name
            ),
        });
    }

    let database_path = {
        let settings = app_state.settings.read().await;

        settings.database_path.clone()
    };

    // the replica, under the link's read-only credential until the vault is open: the invitation
    // row may have been written after this machine connected, and the read-only credential is what
    // lets the pull collect it. The accept then leaves the member's own credential in the slot.
    let credential: CredentialSlot = Arc::new(Mutex::new(Some(link.read_only_credential.clone())));
    let slot = Arc::clone(&credential);
    let store = OrganizationStore::open(
        &OrganizationStore::replica_path(&database_path, &held.id),
        Some(held.remote_url.clone()),
        move || {
            let slot = Arc::clone(&slot);

            async move {
                slot.lock()
                    .ok()
                    .and_then(|slot| slot.clone())
                    .ok_or_else(|| turso::Error::Misuse("no credential is held".into()))
            }
        },
    )
    .await?;

    store.pull().await;

    let member = {
        let mut remote_sync = app_state.remote_sync.write().await;

        join::accept(
            &store,
            remote_sync.store_mut(),
            &held,
            &link,
            &code,
            &password,
            &credential,
            setup::SHIPPING_KDF,
            timestamp::now(),
        )
        .await?
    };

    // best effort, under the member's own credential now.
    store.pull().await;

    *app_state.organization.write().await = Some(store);
    *app_state.member.write().await = Some(member);

    state_of(&app_state).await
}

/// Change what a member is called and what they may do: both written on their row, re-signed, and
/// their certificate issued or revoked to match. Nobody changes their own row or the owner's, and
/// giving somebody an act that signs rows is the owner's, because certifying a signer needs the
/// organization key only their vault yields. What comes back is the member as the list shows them.
#[tauri::command]
pub async fn member_change_role(
    app_state: tauri::State<'_, AppState>,
    member_id: String,
    role: String,
    permissions: i64,
) -> Result<MemberFacts, Error> {
    let mut member = app_state.member.write().await;
    let store = app_state.organization.read().await;
    let (member, store) = signed_in(&mut member, &store)?;
    // the row this act writes back whole carries the session epoch, so it is read after a pull
    // rather than off this machine's last sight of it (effort 826, requirement 22).
    store.pull().await;

    role::change_role(
        store,
        member,
        &member_id,
        &role,
        permissions,
        timestamp::now(),
    )
    .await
}

/// Rename a member: their row written back with the username re-sealed and signed by whoever
/// renamed them. The owner's or an administrator's, on any row but their own; the username is
/// held to the same rules and the same uniqueness as an invitation's. What comes back is the
/// member as the list shows them.
#[tauri::command]
pub async fn member_rename(
    app_state: tauri::State<'_, AppState>,
    member_id: String,
    username: String,
) -> Result<MemberFacts, Error> {
    let mut member = app_state.member.write().await;
    let store = app_state.organization.read().await;
    let (member, store) = signed_in(&mut member, &store)?;
    // the row this act writes back whole carries the session epoch, so it is read after a pull
    // rather than off this machine's last sight of it (effort 826, requirement 22).
    store.pull().await;

    invite::rename_member(store, member, &member_id, &username, timestamp::now()).await
}

/// Sign this member out of every machine but the one they are at (effort 826, requirement 22).
///
/// **They stay signed in here**, and nothing asks for their password: the row's session epoch
/// moves on, this machine's session and its remembered key move with it, and every other machine
/// is behind. One with the application open meets the wall at its next sync heartbeat; one that
/// is closed meets it at its next launch.
///
/// **What comes back says whether the bump went out.** A push that could not go leaves the other
/// machines open until one does, and the you section says so rather than reporting the act done.
#[tauri::command]
pub async fn organization_session_end_elsewhere(
    app_state: tauri::State<'_, AppState>,
) -> Result<SessionsEnded, Error> {
    let mut member = app_state.member.write().await;
    let store = app_state.organization.read().await;
    let (member, store) = signed_in(&mut member, &store)?;

    // before the bump, as `invitation_accept` pulls before it admits: the new number is one past
    // the row's, and a row this machine has not refreshed since somebody else's sign-out is a
    // number already reached, which would write nothing and report the sessions ended. A pull
    // that could not go is the offline case and leaves the row as it stands.
    store.pull().await;

    Ok(SessionsEnded {
        sent: session::end_elsewhere(store, member, timestamp::now()).await?,
    })
}

/// Sign a member out of every machine, from their row: the owner's, and any holder of
/// `resetPassword` (effort 826, requirement 22).
///
/// **Their password is not changed by it.** What ends is the sessions and the keys the machines
/// they signed in on were staying signed in with; the password they know still opens their vault.
/// The caller's own row is refused, because that is `organization_session_end_elsewhere` and
/// keeps this machine in, and the owner's is refused to anybody but the owner.
#[tauri::command]
pub async fn member_end_sessions(
    app_state: tauri::State<'_, AppState>,
    member_id: String,
) -> Result<SessionsEnded, Error> {
    let mut member = app_state.member.write().await;
    let store = app_state.organization.read().await;
    let (member, store) = signed_in(&mut member, &store)?;

    // for the reason `organization_session_end_elsewhere` gives: the number written is one past
    // the row's, so the row has to be the organization's rather than this machine's last sight
    // of it.
    store.pull().await;

    Ok(SessionsEnded {
        sent: session::end_member_sessions(store, member, &member_id, timestamp::now()).await?,
    })
}

/// What locking a member out would cost, said before it is done: which workspaces rotate and how
/// many other members stop syncing until their application reconnects.
#[tauri::command]
pub async fn member_lock_out_cost(
    app_state: tauri::State<'_, AppState>,
    member_id: String,
) -> Result<LockOutCost, Error> {
    let mut member = app_state.member.write().await;
    let store = app_state.organization.read().await;
    let (member, store) = signed_in(&mut member, &store)?;

    removal::lock_out_cost(store, member, &member_id).await
}

/// Remove a member. `lock_out` is `false` unless the interface says otherwise, which is the
/// ordinary removal: their grants go, their row is signed as removed, and nobody else is
/// disturbed. `true` rotates every workspace they held, which cuts them off at once and stops
/// every remaining member of those workspaces syncing until their application collects a fresh
/// credential; it is the owner's, because rotating needs the turso authority.
#[tauri::command]
pub async fn member_remove(
    app_state: tauri::State<'_, AppState>,
    member_id: String,
    lock_out: Option<bool>,
) -> Result<Removed, Error> {
    let platform = owner_platform(&app_state).await;
    let mut member = app_state.member.write().await;
    let store = app_state.organization.read().await;
    let (member, store) = signed_in(&mut member, &store)?;
    // the row this act writes back whole carries the session epoch, so it is read after a pull
    // rather than off this machine's last sight of it (effort 826, requirement 22).
    store.pull().await;
    let organization_database = format!("org-{}", member.organization_id);

    removal::remove_member(
        store,
        member,
        platform.as_ref(),
        &organization_database,
        &member_id,
        lock_out.unwrap_or(false),
        timestamp::now(),
    )
    .await
}

/// Collect whatever the organization database holds for this member that this process does
/// not: the credential a lock-out rotated and the owner re-sealed, or a workspace granted since
/// sign-in. Pulls the replica, reads the grants again, and where the credential for the current
/// workspace moved, hands the sync engine the new one. Answers whether anything moved.
///
/// **This is a remaining member's recovery after a lock-out, and it is automatic**: the sync
/// dispatcher runs it when a replication is refused, and the next request goes out under the
/// fresh credential. Nobody is signed out, and nobody is told to do anything.
pub(crate) async fn reconnect(app_state: &AppState) -> bool {
    let mut member = app_state.member.write().await;
    let store = app_state.organization.read().await;
    let Ok((member, store)) = signed_in(&mut member, &store) else {
        return false;
    };

    store.pull().await;

    let moved = match session::refresh_credentials(store, member).await {
        Ok(moved) => moved,
        Err(error) => {
            crate::diagnostics::warn("organization.credentials.refreshFailed")
                .with("error", error.to_string().as_str())
                .write();

            return false;
        }
    };

    if !moved {
        return false;
    }

    let mut remote_sync = app_state.remote_sync.write().await;
    let current = remote_sync.workspace();

    if let Some(remote_id) = current.remote_id.as_deref()
        && let Some(held) = member.workspace_credentials.get(remote_id)
    {
        remote_sync.hold_organization_workspace_token(&held.token);
    }

    crate::diagnostics::info("organization.credentials.refreshed").write();

    true
}

/// Rename the workspace this machine has open, on the organization database, and on this
/// machine's own record of it so the rail reads the new name before the next pull. What
/// `remote_sync_rename_workspace` calls; it lives here because the name is the organization's.
pub(crate) async fn rename_current_workspace(
    app_state: &AppState,
    name: &str,
) -> Result<(), Error> {
    let workspace_id = {
        let remote_sync = app_state.remote_sync.read().await;

        remote_sync
            .workspace()
            .remote_id
            .ok_or_else(|| Error::PreconditionFailed {
                message: "no workspace is open on this machine".to_string(),
            })?
    };

    {
        let mut member = app_state.member.write().await;
        let store = app_state.organization.read().await;
        let (member, store) = signed_in(&mut member, &store)?;

        workspace::rename_workspace(store, member, &workspace_id, name, timestamp::now()).await?;
    }

    let mut remote_sync = app_state.remote_sync.write().await;

    remote_sync.rename_held_workspace(name.trim())
}

/// Turso's own sentence about the standing account refusal, for the owner and nobody else.
/// A member who is not the owner is answered with nothing rather than refused, because the
/// screen they see says the account needs attention and whom to tell, and that is the whole of
/// what requirement 25 lets them see.
#[tauri::command]
pub async fn organization_account_refusal_detail(
    app_state: tauri::State<'_, AppState>,
) -> Result<Option<String>, Error> {
    let member = app_state.member.read().await;

    if member.as_ref().map(|member| member.role.as_str()) != Some(super::permission::OWNER) {
        return Ok(None);
    }

    let remote_sync = app_state.remote_sync.read().await;

    Ok(remote_sync.account_refusal_detail())
}

/// Change the signed-in member's own password. The current one opens the vault, the new one has
/// to reach the floor, and nothing else on the database moves. Neither password crosses back.
#[tauri::command]
pub async fn organization_change_password(
    app_state: tauri::State<'_, AppState>,
    current: String,
    new: String,
) -> Result<OrganizationState, Error> {
    {
        let mut member = app_state.member.write().await;
        let store = app_state.organization.read().await;
        let (member, store) = signed_in(&mut member, &store)?;

        password::change_password(
            store,
            member,
            &current,
            &new,
            setup::SHIPPING_KDF,
            timestamp::now(),
        )
        .await?;
    }

    state_of(&app_state).await
}

/// Revoke an invitation. A person who never opened their link is removed with it, so the link
/// opens nothing afterwards; a reset link on a member who has signed in before is deleted alone.
#[tauri::command]
pub async fn invitation_revoke(
    app_state: tauri::State<'_, AppState>,
    invitation_id: String,
) -> Result<(), Error> {
    let mut member = app_state.member.write().await;
    let store = app_state.organization.read().await;
    let (member, store) = signed_in(&mut member, &store)?;
    // the row this act writes back whole carries the session epoch, so it is read after a pull
    // rather than off this machine's last sight of it (effort 826, requirement 22).
    store.pull().await;

    invite::revoke_invitation(store, member, &invitation_id, timestamp::now()).await
}

/// Every member, for the members list: names opened with the content key the session holds, the
/// workspaces each holds with their access, and the pending invitation where there is one. *There
/// was a second command answering the invitations until effort 826; one row of the list needs
/// both, so the row is answered whole here.*
#[tauri::command]
pub async fn organization_members(
    app_state: tauri::State<'_, AppState>,
) -> Result<Vec<MemberFacts>, Error> {
    let mut member = app_state.member.write().await;
    let store = app_state.organization.read().await;
    let (member, store) = signed_in(&mut member, &store)?;

    invite::members(store, member, timestamp::now()).await
}

/// The link the operating system handed this process, if one is waiting: a launch with a link
/// on the command line, or a link opened while the application was already running and before
/// the shell was listening. Taken once; the shell reads it at startup and then listens for the
/// event the same arrival raises afterwards.
#[tauri::command]
pub async fn organization_link_take(
    app_state: tauri::State<'_, AppState>,
) -> Result<Option<String>, Error> {
    let mut arriving = app_state
        .arriving_link
        .lock()
        .map_err(|_| Error::Internal {
            message: "the arriving link was poisoned".to_string(),
        })?;

    Ok(arriving.take())
}

/// Read a link: which organization it names, and where its invitation stands where it carries
/// one, before anything is done with it. The link is parsed here, the organization is reached with
/// the credential it carries, and what crosses back is a name, where it is, the standing and the
/// invited username; the secret stays on this side ([[rules/credentials]]).
#[tauri::command]
pub async fn organization_link_inspect(
    app_state: tauri::State<'_, AppState>,
    link: String,
) -> Result<LinkFacts, Error> {
    let link = JoinLink::decode(&link)?;
    let store = reached(&app_state, &link).await?;

    join::inspect(&store, &link, timestamp::now()).await
}

/// Record which Turso account the consent this machine now holds is over, so the owner's
/// machine can build the Platform API client again: what an owner restored on a new machine
/// does after repeating the consent. The account is discovered the way the first run
/// discovered it, and nothing about it was restored from anywhere.
#[tauri::command]
pub async fn organization_reconnect_authority(
    app_state: tauri::State<'_, AppState>,
) -> Result<OrganizationState, Error> {
    let platform_token = setup::authority()?;

    {
        let mut remote_sync = app_state.remote_sync.write().await;

        if crate::sync::turso::discovery::organization(
            remote_sync.store_mut(),
            &platform_token,
            &McpEndpoint::production(),
        )
        .await?
        .is_none()
        {
            return Err(Error::PreconditionFailed {
                message: "the consent was granted over a group with no database in it, and the                           organization is not there. grant it over the group that holds the                           organization"
                    .to_string(),
            });
        }
    }

    state_of(&app_state).await
}

/// The organization a link names, reached: its replica on this machine, opened against the
/// remote the link spells with the read-only credential it carries, and pulled. A machine that
/// has never seen the organization and cannot reach it now has nothing to say about the link,
/// and says so as a network failure rather than as a refusal. The credential stays in the slot
/// the replica reads; nobody signs in on this replica, which is let go of once read.
async fn reached(app_state: &AppState, link: &JoinLink) -> Result<OrganizationStore, Error> {
    let database_path = {
        let settings = app_state.settings.read().await;

        settings.database_path.clone()
    };
    let credential: CredentialSlot = Arc::new(Mutex::new(Some(link.read_only_credential.clone())));
    let slot = Arc::clone(&credential);
    let store = OrganizationStore::open(
        &OrganizationStore::replica_path(&database_path, &link.organization_id),
        Some(link.remote_url.clone()),
        move || {
            let slot = Arc::clone(&slot);

            async move {
                slot.lock()
                    .ok()
                    .and_then(|slot| slot.clone())
                    .ok_or_else(|| turso::Error::Misuse("no credential is held".into()))
            }
        },
    )
    .await?;

    if !store.pull().await && store.organization().await?.is_none() {
        return Err(Error::Network {
            message: format!(
                "{} could not be reached; the link is right, and the connection is what to try \
                 again",
                link.organization_name
            ),
        });
    }

    Ok(store)
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use serde_json::json;
    use tokio::sync::RwLock;

    use super::{open_replica, sign_out, state_of};
    use crate::{
        database::Database,
        keyring::{self, CredentialStoreTurn, refuse_the_next_store, take_the_credential_store},
        organization::{
            forget, join, session,
            session::{CredentialSlot, MEMBER_KEY_SERVICE, read_entry, verifying_key_of},
            setup::{CreateOrganization, Remote, create_organization},
            store::OrganizationStore,
            vault::{KdfParams, open_sealed_secret_key},
        },
        persisted::Persisted,
        settings::Settings,
        state::AppState,
        sync::{
            RemoteSync,
            test::server::{ScriptedResponse, ScriptedServer},
            turso::{consent::TursoConsent, discovery::McpEndpoint, platform::InMemoryPlatform},
        },
        update::Update,
    };

    const PASSWORD: &str = "the owners password";
    const USERNAME: &str = "olivia";
    const CREATED_AT: i64 = 1_757_000_000_000;

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
        let directory = std::env::temp_dir().join(format!("rentable-command-{name}-{nanos:x}"));
        std::fs::create_dir_all(&directory).expect("scratch directory");

        directory
    }

    /// The whole of the application state over one data directory, as `lib.rs` builds it, with
    /// nothing open and nobody in. *`forget.rs` and `join.rs` keep the same builder; a fixture is
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

    /// A machine that has run the first run: an organization on it, the owner's row recorded, and
    /// the owner's member key filed, which is what every launch after it starts from. Nobody is
    /// signed in here, because a launch is a fresh process.
    async fn first_run(directory: &std::path::Path) -> AppState {
        let app_state = state_over(directory).await;
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

        {
            let mut remote_sync = app_state.remote_sync.write().await;

            create_organization(
                remote_sync.store_mut(),
                "a-platform-token",
                &McpEndpoint::at(&mcp.url("")),
                |_| Arc::clone(&platform),
                Remote::none(),
                &directory.join(Database::FILENAME),
                CreateOrganization {
                    name: "Acme",
                    username: USERNAME,
                    password: PASSWORD,
                },
                test_cost(),
                CREATED_AT,
            )
            .await
            .expect("the first run failed");
        }

        app_state
    }

    /// An empty credential slot, for a store opened against no remote.
    fn slot() -> CredentialSlot {
        Arc::new(Mutex::new(None))
    }

    /// What the record names: the organization and the member, which is what an entry is keyed on.
    async fn recorded(app_state: &AppState) -> (String, String) {
        let mut remote_sync = app_state.remote_sync.write().await;
        let held = remote_sync
            .store_mut()
            .organization
            .clone()
            .expect("the record names no organization");

        (held.id, held.member_id.expect("the record names no member"))
    }

    /// What is filed under a member's entry, or nothing where nothing is.
    fn filed(organization_id: &str, member_id: &str) -> Option<String> {
        keyring::read(
            MEMBER_KEY_SERVICE,
            &format!("{organization_id}:{member_id}"),
        )
        .expect("the store would not answer")
    }

    /// A test's turn on the credential store, taken once at the top: the fake is one map for
    /// every service, and a test that takes the turn twice deadlocks (`keyring.rs`).
    async fn a_turn() -> CredentialStoreTurn {
        take_the_credential_store().await
    }

    /// **Criterion 2.** The record names a member, the `member` slot is empty, and the key that
    /// opens their vault is filed: the first state read of the launch opens it and answers with a
    /// session, so nothing ever draws the wall.
    #[tokio::test]
    async fn the_first_state_read_of_a_launch_resumes_the_remembered_session() {
        let _turn = a_turn().await;
        let directory = scratch("resume");
        let app_state = first_run(&directory).await;
        let (organization_id, member_id) = recorded(&app_state).await;

        assert!(
            filed(&organization_id, &member_id).is_some(),
            "the first run filed no member key"
        );
        assert!(
            app_state.member.read().await.is_none(),
            "a launch starts with nobody in"
        );

        let state = state_of(&app_state).await.expect("the state");
        let session = state.session.expect("the launch did not resume");

        assert_eq!(session.member_id, member_id);
        assert_eq!(session.username, USERNAME);
        assert_eq!(session.role, "owner");
        assert!(
            app_state.member.read().await.is_some(),
            "the session was answered with and not held"
        );
        assert!(
            app_state.organization.read().await.is_some(),
            "the replica was not held open"
        );
    }

    /// **Criterion 22, the heartbeat.** A member is signed in on this machine; on another machine
    /// they end every other session. One call of the check the sync heartbeat makes, and this
    /// machine holds no session, no replica and no remembered key, and says on the state that it
    /// was signed out from another machine.
    ///
    /// The other machine is a second store over the same replica, which is what two machines are
    /// to each other once a push and a pull have run between them; there is no remote here, so the
    /// file is what they share.
    #[tokio::test]
    async fn a_session_ended_from_another_machine_is_gone_after_one_heartbeat() {
        let _turn = a_turn().await;
        let directory = scratch("heartbeat");
        let app_state = first_run(&directory).await;
        let (organization_id, member_id) = recorded(&app_state).await;

        let state = state_of(&app_state).await.expect("the state");

        assert!(state.session.is_some(), "the launch did not resume");
        assert!(!state.signed_out_elsewhere);

        // the other machine, signed in as the same member, ending every other session.
        let held = {
            let mut remote_sync = app_state.remote_sync.write().await;

            remote_sync
                .store_mut()
                .organization
                .clone()
                .expect("the record names no organization")
        };
        let elsewhere = OrganizationStore::open(
            &OrganizationStore::replica_path(&directory.join(Database::FILENAME), &organization_id),
            None,
            || async { Ok::<String, turso::Error>(String::new()) },
        )
        .await
        .expect("the other machine's replica");
        let mut theirs = session::sign_in(&elsewhere, &held, PASSWORD, &slot())
            .await
            .expect("the other machine did not sign in");

        session::end_elsewhere(&elsewhere, &mut theirs, CREATED_AT + 1)
            .await
            .expect("ending the other sessions failed");

        // one heartbeat on this machine.
        assert!(
            super::ended_elsewhere(&app_state).await,
            "the heartbeat did not read the row as moved on"
        );
        assert!(
            app_state.member.read().await.is_none(),
            "the session outlived the sign-out"
        );
        assert!(
            app_state.organization.read().await.is_none(),
            "the replica was still held open"
        );
        assert_eq!(
            filed(&organization_id, &member_id),
            None,
            "the remembered key outlived the sign-out"
        );

        let state = state_of(&app_state).await.expect("the state");

        assert!(state.session.is_none());
        assert!(
            state.signed_out_elsewhere,
            "the wall was not told which sign-out this was"
        );
        assert_eq!(
            state.organization.map(|held| held.id),
            Some(organization_id),
            "the machine forgot the organization as well as the session"
        );

        // and a heartbeat on a machine with nobody in reads nothing and says nothing.
        assert!(!super::ended_elsewhere(&app_state).await);
    }

    /// The wall, which is what every failure to resume comes to. Nothing filed is the plainest of
    /// them, and it is the state a machine that has signed out is in.
    #[tokio::test]
    async fn a_launch_with_nothing_filed_leaves_the_wall_up() {
        let _turn = a_turn().await;
        let directory = scratch("nothing");
        let app_state = first_run(&directory).await;
        let (organization_id, member_id) = recorded(&app_state).await;

        keyring::forget(
            MEMBER_KEY_SERVICE,
            &format!("{organization_id}:{member_id}"),
        )
        .expect("the store would not forget");

        let state = state_of(&app_state).await.expect("the state");

        assert!(state.session.is_none(), "a launch with no key signed in");
        assert!(
            state.organization.is_some(),
            "the machine forgot what it holds"
        );
        assert!(app_state.member.read().await.is_none());
    }

    /// **Criterion 1, the sign-out half.** The keys go and so does the entry, so the next launch
    /// puts the wall up rather than letting the machine back in behind the person's back.
    #[tokio::test]
    async fn a_sign_out_forgets_the_key_and_the_next_launch_shows_the_wall() {
        let _turn = a_turn().await;
        let directory = scratch("signout");
        let app_state = first_run(&directory).await;
        let (organization_id, member_id) = recorded(&app_state).await;

        state_of(&app_state)
            .await
            .expect("the state")
            .session
            .expect("the launch did not resume");

        sign_out(&app_state).await;

        assert_eq!(
            filed(&organization_id, &member_id),
            None,
            "the sign-out left the key in the store"
        );

        // the next launch: a fresh process over the same data directory.
        let next = state_over(&directory).await;
        let state = state_of(&next).await.expect("the state");

        assert!(state.session.is_none(), "the wall did not come back up");
        assert_eq!(
            state.organization.map(|held| held.member_id),
            Some(Some(member_id)),
            "the record forgot the member a sign-out keeps"
        );
    }

    /// **Criterion 1, the disconnect half.** A machine that has let go of the organization holds
    /// no key to a vault in it either. The forget signs out first, which is where the entry goes.
    #[tokio::test]
    async fn a_disconnect_forgets_the_key_with_everything_else() {
        let _turn = a_turn().await;
        let directory = scratch("disconnect");
        let app_state = first_run(&directory).await;
        let (organization_id, member_id) = recorded(&app_state).await;

        state_of(&app_state).await.expect("the state");
        forget::forget(&app_state).await.expect("the forget failed");

        assert_eq!(
            filed(&organization_id, &member_id),
            None,
            "the disconnect left the key in the store"
        );
    }

    /// **Criterion 2, the refusal half.** A locked keychain, or a machine with no secret service:
    /// the first run succeeds, nothing is filed, and the next launch asks for a password. Never a
    /// failure surface.
    #[tokio::test]
    async fn a_store_that_refuses_the_key_does_not_fail_the_first_run() {
        let _turn = a_turn().await;
        let directory = scratch("refused");

        refuse_the_next_store();

        let app_state = first_run(&directory).await;
        let (organization_id, member_id) = recorded(&app_state).await;

        assert_eq!(
            filed(&organization_id, &member_id),
            None,
            "the store took a value it was told to refuse"
        );

        let state = state_of(&app_state).await.expect("the state");

        assert!(state.organization.is_some(), "the first run did not finish");
        assert!(state.session.is_none(), "a launch with no key signed in");
    }

    /// **Criterion 3.** Neither the password nor the key it derives reaches anything this machine
    /// wrote: not the record, and not a replica. The key is in the credential store, which is the
    /// whole reason it is filed there, and the sweep reads every file the data directory holds
    /// rather than the ones it expects to find.
    #[tokio::test]
    async fn neither_the_password_nor_the_member_key_reaches_a_file_this_machine_wrote() {
        let _turn = a_turn().await;
        let directory = scratch("secrecy");
        let app_state = first_run(&directory).await;
        let (organization_id, member_id) = recorded(&app_state).await;

        // the sign-in at the wall, which is what `organization_sign_in` performs: the replica is
        // opened, the password is tried, and the record is written back naming the member.
        let held = {
            let mut remote_sync = app_state.remote_sync.write().await;

            remote_sync
                .store_mut()
                .organization
                .clone()
                .expect("the record")
        };
        let (store, credential) = open_replica(&app_state, &held).await.expect("the replica");
        let session = {
            let mut remote_sync = app_state.remote_sync.write().await;

            join::admit(
                &store,
                remote_sync.store_mut(),
                &held,
                USERNAME,
                PASSWORD,
                &credential,
            )
            .await
            .expect("the sign-in failed")
        };

        assert_eq!(session.member_id, member_id);

        let encoded = filed(&organization_id, &member_id).expect("the sign-in filed no key");
        let (epoch, key) =
            read_entry(&encoded).expect("what was filed is not a remembered session");
        let bytes = {
            use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD as BASE64URL};

            BASE64URL
                .decode(key.encode())
                .expect("what was filed is not base64url")
        };

        assert_eq!(
            epoch, 0,
            "the entry files the session epoch in front of the key"
        );

        assert_eq!(
            bytes.len(),
            32,
            "what was filed is not a member key's width"
        );

        // and it is the key that opens this member's vault rather than any other value.
        let members = store
            .members(&verifying_key_of(&held).expect("the key"))
            .await
            .expect("the members");
        let member = members
            .iter()
            .find(|member| member.id == member_id)
            .expect("the member row");

        assert_eq!(
            open_sealed_secret_key(&key, &member.vault)
                .expect("the filed key did not open the vault")
                .public_key(),
            member.vault.public_key
        );

        // the sweep: every file under the data directory, the record included, read as bytes.
        let secrets: [&[u8]; 3] = [PASSWORD.as_bytes(), encoded.as_bytes(), &bytes];
        let mut swept = 0;

        for entry in std::fs::read_dir(&directory).expect("the data directory") {
            let path = entry.expect("an entry").path();

            if !path.is_file() {
                continue;
            }

            let written = std::fs::read(&path).expect("the file");

            swept += 1;

            for secret in secrets {
                assert!(
                    !written.windows(secret.len()).any(|window| window == secret),
                    "a secret is legible in {}",
                    path.display()
                );
            }
        }

        assert!(swept > 1, "the sweep read almost nothing: {swept} files");
        assert!(
            directory.join(RemoteSync::FILENAME).is_file(),
            "the record was not among the files the sweep read"
        );
    }

    /// **The heartbeat pushes as well as pulls**, which is what carries out a sign-out made
    /// offline.
    ///
    /// `end_elsewhere` writes the new number on this machine's replica and pushes; a push that
    /// could not go leaves it there, and no other scheduled path pushes the organization replica.
    /// So without this the person is told their other machines are signed out and they stay open
    /// until that member happens to make another organization write, which a plain member almost
    /// never does.
    ///
    /// Read on the wire rather than through a stand-in: the replica is reopened against a server
    /// that answers nothing, so what the two calls put on it is what this asserts on. The pull is
    /// `POST /pull-updates` and the push is not, which is the whole of what is being distinguished.
    #[tokio::test]
    async fn the_heartbeat_pushes_the_organization_replica_after_its_pull() {
        let _turn = a_turn().await;
        let directory = scratch("heartbeat-push");
        let app_state = first_run(&directory).await;
        let (organization_id, _) = recorded(&app_state).await;

        assert!(
            state_of(&app_state)
                .await
                .expect("the state")
                .session
                .is_some(),
            "the launch did not resume"
        );

        // the same replica, reopened against a remote that answers nothing. The engine the resume
        // opened is let go of first: one file, one engine.
        let server =
            ScriptedServer::start((0..8).map(|_| ScriptedResponse::hangup()).collect()).await;
        {
            let mut organization = app_state.organization.write().await;

            *organization = None;
            *organization = Some(
                OrganizationStore::open(
                    &OrganizationStore::replica_path(
                        &directory.join(Database::FILENAME),
                        &organization_id,
                    ),
                    Some(server.url("")),
                    || async { Ok::<String, turso::Error>("a-credential".to_string()) },
                )
                .await
                .expect("the replica did not reopen against the remote"),
            );
        }

        assert_eq!(
            server.request_count(),
            0,
            "something reached the remote early"
        );

        // one heartbeat. Nobody ended anything, so the answer is that the session stands; what is
        // under test is what it did on the way to that answer.
        assert!(!super::ended_elsewhere(&app_state).await);
        assert!(
            server.request_count() >= 2,
            "the heartbeat made {} request(s); a pull and a push are two",
            server.request_count()
        );
        assert_eq!(
            server.request(0).target,
            "/pull-updates",
            "the heartbeat's first call to the remote is not the pull"
        );
        assert_ne!(
            server.request(1).target,
            "/pull-updates",
            "the heartbeat pulled twice and pushed nothing"
        );
    }
}
