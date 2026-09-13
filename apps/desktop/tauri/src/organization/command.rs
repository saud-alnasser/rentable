use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use tauri::Emitter;

use crate::{error::Error, state::AppState, timestamp};

use super::{
    JoinedOrganization,
    invite::{self, Invitation, InvitationFacts, Invited, MemberFacts},
    join::{self, LinkFacts},
    link::JoinLink,
    migrate::Pipeline,
    migration::{self, MigrationPhase, PipelineLease},
    password,
    removal::{self, LockOutCost, Removed},
    session::{self, CredentialSlot, SessionFacts, WorkspaceFacts},
    setup::{self, CreateOrganization, OrganizationCreated, Remote},
    store::OrganizationStore,
    workspace,
};
use crate::sync::turso::{
    discovery::McpEndpoint,
    platform::{AccessLevel, PlatformApi, PlatformEndpoint},
};

/// One organization this machine has joined, as the sign-in screen lists it. No key.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JoinedOrganizationFacts {
    pub id: String,
    pub name: String,
    pub member_id: String,
    pub role: String,
    pub joined_at: i64,
}

impl From<&JoinedOrganization> for JoinedOrganizationFacts {
    fn from(joined: &JoinedOrganization) -> Self {
        Self {
            id: joined.id.clone(),
            name: joined.name.clone(),
            member_id: joined.member_id.clone(),
            role: joined.role.clone(),
            joined_at: joined.joined_at,
        }
    }
}

/// Where this machine stands with organizations: which it has joined, and who is signed in.
///
/// What the sign-in wall admits on. `session` is `None` until a password has opened a vault in
/// this process, and it carries facts and no credential.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrganizationState {
    pub organizations: Vec<JoinedOrganizationFacts>,
    pub session: Option<SessionFacts>,
    /// whether this machine holds the Turso authority and knows which account it is over: the
    /// owner's machine after a consent. An owner restored on a new machine holds none until they
    /// repeat the consent, which is the one thing a restore cannot bring with it (requirement 5).
    pub holds_turso_authority: bool,
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
        .organizations
        .iter()
        .find(|joined| joined.id == created.organization_id)
        .cloned()
        .ok_or_else(|| Error::Internal {
            message: "the organization was created and not recorded".to_string(),
        })?;
    let credential: CredentialSlot = Arc::new(Mutex::new(None));
    let member = session::sign_in(&store, &joined, &password, &credential).await?;

    *app_state.organization.write().await = Some(store);
    *app_state.member.write().await = Some(member);

    Ok(created)
}

/// Where this machine stands: the organizations it has joined and who is signed in.
///
/// **`public` on the other side for the same reason the sync state is**: it is what the wall
/// admits on, so requiring a signed-in caller would make it answerable only to machines whose
/// answer is already known.
#[tauri::command]
pub async fn organization_state_get(
    app_state: tauri::State<'_, AppState>,
) -> Result<OrganizationState, Error> {
    let organizations = {
        let mut remote_sync = app_state.remote_sync.write().await;

        remote_sync
            .store_mut()
            .organizations
            .iter()
            .map(JoinedOrganizationFacts::from)
            .collect()
    };
    let session = current_facts(&app_state).await?;
    let holds_turso_authority = owner_platform(&app_state).await.is_some();

    Ok(OrganizationState {
        organizations,
        session,
        holds_turso_authority,
    })
}

/// Sign in to one of the organizations this machine has joined, with a password.
///
/// **Works with the network down.** The replica on this machine is opened, its rows are verified
/// against the key this machine pinned when it joined, and the password is tried against the
/// member's vault. A pull is attempted once the vault is open and its failure is not one: the
/// replica goes on serving what it holds (requirement 18).
///
/// A wrong password answers that the value did not open, and nothing more
/// ([[rules/credentials]]): there is no comparison to skip, and the session that results holds
/// the keys the password unsealed, which a wrong one never produces.
#[tauri::command]
pub async fn organization_sign_in(
    app_state: tauri::State<'_, AppState>,
    organization_id: String,
    password: String,
) -> Result<OrganizationState, Error> {
    let joined = {
        let mut remote_sync = app_state.remote_sync.write().await;

        remote_sync
            .store_mut()
            .organizations
            .iter()
            .find(|joined| joined.id == organization_id)
            .cloned()
            .ok_or_else(|| Error::NotFound {
                message: "this machine has not joined that organization".to_string(),
            })?
    };
    let database_path = {
        let settings = app_state.settings.read().await;

        settings.database_path.clone()
    };

    // the replica, opened against its remote with a credential slot the sign-in fills. Built
    // through the same call as every replica, so it opens whether or not the remote is reachable.
    let credential: CredentialSlot = Arc::new(Mutex::new(None));
    let slot = Arc::clone(&credential);
    let store = OrganizationStore::open(
        &OrganizationStore::replica_path(&database_path, &joined.id),
        Some(joined.remote_url.clone()),
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

    let member = session::sign_in(&store, &joined, &password, &credential).await?;

    // best effort, and after the vault is open, because the pull needs the credential the vault
    // held. What arrives is read on the next question, and what does not arrive is the offline
    // case rather than a failure of signing in.
    store.pull().await;

    *app_state.organization.write().await = Some(store);
    *app_state.member.write().await = Some(member);

    organization_state_get(app_state).await
}

/// Put the wall back up: drop the keys this process held, and let go of the replica.
#[tauri::command]
pub async fn organization_sign_out(
    app_state: tauri::State<'_, AppState>,
) -> Result<OrganizationState, Error> {
    *app_state.member.write().await = None;
    *app_state.organization.write().await = None;

    organization_state_get(app_state).await
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
                    .organizations
                    .iter()
                    .find(|joined| joined.id == member.organization_id)
                    .map(|joined| {
                        joined
                            .remote_url
                            .trim_start_matches("libsql://")
                            .to_string()
                    })
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

/// Invite a member: a row, a link and a generated password, shown once. The application sends
/// nothing; the administrator hands both over themselves.
///
/// **The password crosses exactly once, here, because it has to be shown**, and it is held
/// nowhere afterwards ([[rules/credentials]], *Client boundary*). Everything else the invitation
/// makes stays on this side: the member's vault, the content key sealed to them, and the grants.
#[tauri::command]
pub async fn member_invite(
    app_state: tauri::State<'_, AppState>,
    username: String,
    role: String,
    workspace_ids: Vec<String>,
) -> Result<Invited, Error> {
    let mut member = app_state.member.write().await;
    let store = app_state.organization.read().await;
    let (member, store) = signed_in(&mut member, &store)?;
    let link = invite::organization_link(store, member).await?;

    invite::invite_member(
        store,
        member,
        &link,
        Invitation {
            username: &username,
            role: &role,
            workspace_ids: &workspace_ids,
        },
        invite::INVITED_KDF,
        timestamp::now(),
    )
    .await
}

/// Reset a member's password: a fresh vault under a fresh password, everything the resetting
/// administrator reaches re-sealed to it, and a fresh invitation. What a reset is, for a member
/// whose password nobody knows; the answer names the workspaces it could not restore.
#[tauri::command]
pub async fn member_reset(
    app_state: tauri::State<'_, AppState>,
    member_id: String,
) -> Result<Invited, Error> {
    let mut member = app_state.member.write().await;
    let store = app_state.organization.read().await;
    let (member, store) = signed_in(&mut member, &store)?;
    let link = invite::organization_link(store, member).await?;

    invite::reissue_invitation(
        store,
        member,
        &link,
        &member_id,
        invite::INVITED_KDF,
        timestamp::now(),
    )
    .await
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

    organization_state_get(app_state).await
}

/// Revoke an unused invitation. The link that named it opens nothing afterwards.
#[tauri::command]
pub async fn invitation_revoke(
    app_state: tauri::State<'_, AppState>,
    invitation_id: String,
) -> Result<(), Error> {
    let mut member = app_state.member.write().await;
    let store = app_state.organization.read().await;
    let (member, store) = signed_in(&mut member, &store)?;

    invite::revoke_invitation(store, member, &invitation_id).await
}

/// Every member, for the dashboard. Names opened with the content key the session holds.
#[tauri::command]
pub async fn organization_members(
    app_state: tauri::State<'_, AppState>,
) -> Result<Vec<MemberFacts>, Error> {
    let mut member = app_state.member.write().await;
    let store = app_state.organization.read().await;
    let (member, store) = signed_in(&mut member, &store)?;

    invite::members(store, member).await
}

/// Every invitation with where it stands, for the dashboard.
#[tauri::command]
pub async fn organization_invitations(
    app_state: tauri::State<'_, AppState>,
) -> Result<Vec<InvitationFacts>, Error> {
    let mut member = app_state.member.write().await;
    let store = app_state.organization.read().await;
    let (member, store) = signed_in(&mut member, &store)?;

    invite::invitations(store, member, timestamp::now()).await
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

/// Read a link: which organization it names and where its invitation stands, before a password
/// is asked for. The link is parsed here, the organization is reached with the credential it
/// carries, and what crosses back is a name and a standing ([[rules/credentials]]).
#[tauri::command]
pub async fn organization_link_inspect(
    app_state: tauri::State<'_, AppState>,
    link: String,
) -> Result<LinkFacts, Error> {
    let link = JoinLink::decode(&link)?;
    let (store, _) = reached(&app_state, &link).await?;

    join::inspect(&store, &link, timestamp::now()).await
}

/// Join the organization a link names, with the generated password the person was handed, and
/// sign them in to it. Refused while somebody is signed in here: joining is a way through the
/// wall, and the wall is down.
#[tauri::command]
pub async fn organization_join(
    app_state: tauri::State<'_, AppState>,
    link: String,
    password: String,
) -> Result<OrganizationState, Error> {
    if app_state.member.read().await.is_some() {
        return Err(Error::PreconditionFailed {
            message: "sign out before joining another organization on this machine".to_string(),
        });
    }

    let link = JoinLink::decode(&link)?;
    let (store, credential) = reached(&app_state, &link).await?;
    let member = {
        let mut remote_sync = app_state.remote_sync.write().await;

        join::join(
            &store,
            remote_sync.store_mut(),
            &link,
            &password,
            &credential,
            timestamp::now(),
        )
        .await?
    };

    *app_state.organization.write().await = Some(store);
    *app_state.member.write().await = Some(member);

    organization_state_get(app_state).await
}

/// Restore a place in the organization its own link names, by the person's username and password,
/// and sign them in. An owner on a new machine walks this and then repeats the consent; a member
/// walks it and is done. Refused while somebody is signed in here, as joining is.
#[tauri::command]
pub async fn organization_restore(
    app_state: tauri::State<'_, AppState>,
    link: String,
    username: String,
    password: String,
) -> Result<OrganizationState, Error> {
    if app_state.member.read().await.is_some() {
        return Err(Error::PreconditionFailed {
            message: "sign out before restoring an organization on this machine".to_string(),
        });
    }

    let link = JoinLink::decode(&link)?;
    let (store, credential) = reached(&app_state, &link).await?;
    let member = {
        let mut remote_sync = app_state.remote_sync.write().await;

        join::restore(
            &store,
            remote_sync.store_mut(),
            &link,
            &username,
            &password,
            &credential,
            timestamp::now(),
        )
        .await?
    };

    *app_state.organization.write().await = Some(store);
    *app_state.member.write().await = Some(member);

    organization_state_get(app_state).await
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

    organization_state_get(app_state).await
}

/// The organization a link names, reached: its replica on this machine, opened against the
/// remote the link spells with the read-only credential it carries, and pulled. A machine that
/// has never seen the organization and cannot reach it now has nothing to say about the link,
/// and says so as a network failure rather than as a refusal.
async fn reached(
    app_state: &AppState,
    link: &JoinLink,
) -> Result<(OrganizationStore, CredentialSlot), Error> {
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

    Ok((store, credential))
}
