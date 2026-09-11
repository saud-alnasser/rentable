use crate::{error::Error, state::AppState, timestamp};

use super::setup::{self, CreateOrganization, OrganizationCreated, Remote};
use crate::sync::turso::{
    discovery::McpEndpoint,
    platform::{PlatformApi, PlatformEndpoint},
};

/// Create an organization on the consented Turso account, with this machine's person as its
/// owner, from the two things the setup walk collects.
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

    // the owner is in: the replica is open beside the workspace engine for the run of the
    // process. What being signed in means beyond that, a session and what it admits to, is the
    // sign-in ticket's.
    *app_state.organization.write().await = Some(store);

    Ok(created)
}
