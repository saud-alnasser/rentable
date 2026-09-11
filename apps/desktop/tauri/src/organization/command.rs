use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};

use crate::{error::Error, state::AppState, timestamp};

use super::{
    JoinedOrganization,
    invite::{self, Invitation, InvitationFacts, Invited, MemberFacts},
    migrate::Pipeline,
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
}

/// Create an organization on the consented Turso account, with this machine's person as its
/// owner, from the two things the setup walk collects, and sign them in to it.
///
/// **Neither of the two crosses back, and nothing else crosses at all.** The password is turned
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

    Ok(OrganizationState {
        organizations,
        session,
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

/// Open a workspace this member holds a grant on: record it as this machine's current workspace,
/// hold the credential the vault unsealed for the replica, and open the replica.
///
/// **The credential never leaves Rust.** What comes back is the workspace as a fact; the token is
/// in the sync state's own hands and the replica asks it per request.
#[tauri::command]
pub async fn workspace_open(
    app_state: tauri::State<'_, AppState>,
    workspace_id: String,
) -> Result<WorkspaceFacts, Error> {
    let opened = {
        let mut member = app_state.member.write().await;
        let store = app_state.organization.read().await;
        let (member, store) = signed_in(&mut member, &store)?;

        member.settled()?;

        let workspaces = store.workspaces(&member.verifying_key).await?;

        workspace::openable(member, &workspaces, &workspace_id)?.ok_or_else(|| {
            Error::Forbidden {
                message: "you hold no grant on that workspace".to_string(),
            }
        })?
    };
    let (facts, credential) = opened;

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

/// Invite a member: a row, a link and a generated password, shown once. The application sends
/// nothing; the administrator hands both over themselves.
///
/// **The password crosses exactly once, here, because it has to be shown**, and it is held
/// nowhere afterwards ([[rules/credentials]], *Client boundary*). Everything else the invitation
/// makes stays on this side: the member's vault, the content key sealed to them, and the grants.
#[tauri::command]
pub async fn member_invite(
    app_state: tauri::State<'_, AppState>,
    email: String,
    display_name: String,
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
            email: &email,
            display_name: &display_name,
            role: &role,
            workspace_ids: &workspace_ids,
        },
        invite::INVITED_KDF,
        timestamp::now(),
    )
    .await
}

/// Invite a member again: a fresh vault under a fresh password, and a fresh invitation. What a
/// reset is, for a member whose password nobody knows.
#[tauri::command]
pub async fn invitation_reissue(
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
