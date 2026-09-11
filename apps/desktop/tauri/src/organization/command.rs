use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};

use crate::{error::Error, state::AppState, timestamp};

use super::{
    JoinedOrganization,
    session::{self, CredentialSlot, SessionFacts},
    setup::{self, CreateOrganization, OrganizationCreated, Remote},
    store::OrganizationStore,
};
use crate::sync::turso::{
    discovery::McpEndpoint,
    platform::{PlatformApi, PlatformEndpoint},
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
