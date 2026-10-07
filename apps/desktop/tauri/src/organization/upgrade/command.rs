//! the commands of the explicit upgrade (effort 857, ticket 07): what it would do, and running it,
//! for the organization or for one workspace. Both are `upgradeData`'s, asked of the verified row
//! by the act behind each (`super::gate`).

use crate::{
    clock,
    credential::Credentials,
    error::{Error, RefusalReason},
    organization::Shared,
};

use crate::organization::{
    act::{Acting, Pull, as_member, owner_platform},
    lease::{PipelineLease, apply},
    session::MemberSession,
    workspace::remote::Pipeline,
};

use super::{Awaiting, Preview, Running, Target};

/// What the upgrade of `target` would run, and whom it would stop or make read-only. Read after a
/// pull, so the floors and the machines are the organization's as it stands.
#[tauri::command(rename = "upgrade_preview")]
pub(crate) async fn organization_upgrade_preview(
    app_state: tauri::State<'_, Shared>,
    clock: tauri::State<'_, clock::Shared>,
    target: Target,
) -> Result<Preview, Error> {
    as_member(
        &app_state,
        Pull::First,
        async |Acting { member, store }| match &target {
            Target::Organization => super::preview_organization(store, member, clock.now()).await,
            Target::Workspace(workspace_id) => {
                super::preview_workspace(store, member, workspace_id, &apply::SHIPPED, clock.now())
                    .await
            }
        },
    )
    .await
}

/// What waits for the upgrade on the organization and on each workspace the member holds, by step
/// number (ticket 08): read by any member, since a capability gated on a step tells whoever meets
/// it why. Read off what the replica holds; the heartbeat's pull keeps it current.
#[tauri::command(rename = "upgrade_awaiting")]
pub(crate) async fn organization_upgrade_awaiting(
    app_state: tauri::State<'_, Shared>,
) -> Result<Awaiting, Error> {
    as_member(&app_state, Pull::No, async |Acting { member, store }| {
        super::awaiting(store, member, &apply::SHIPPED).await
    })
    .await
}

/// Run the upgrade of `target`, whole or not at all, under the lease taken at the organization
/// database's primary. Read after a pull, so it runs against the organization's latest state.
#[tauri::command(rename = "upgrade_run")]
pub(crate) async fn organization_upgrade_run(
    app_state: tauri::State<'_, Shared>,
    credentials: tauri::State<'_, Credentials>,
    clock: tauri::State<'_, clock::Shared>,
    target: Target,
) -> Result<(), Error> {
    let organization_id = app_state
        .member
        .read()
        .await
        .as_ref()
        .map(|member| member.organization_id.clone())
        .unwrap_or_default();
    // the owner's account, where this machine holds its authority: what is upgraded is copied
    // there as well as here. A member's machine holds none and copies to this machine alone.
    let account = owner_platform(&app_state, &credentials, &organization_id).await;
    let organization_host = {
        let mut remote_sync = app_state.remote_sync.write().await;

        remote_sync
            .store_mut()
            .held(&organization_id)
            .map(|held| held.remote_url.trim_start_matches("libsql://").to_string())
            .unwrap_or_default()
    };
    let upgrade = app_state.upgrade.clone();

    as_member(&app_state, Pull::First, async |Acting { member, store }| {
        let member: &MemberSession = member;
        let lease = PipelineLease::new(
            Pipeline::of(&organization_host),
            &organization_credential(member)?,
        );
        let now = || clock.now();

        match &target {
            Target::Organization => {
                super::run_organization(
                    store,
                    member,
                    &lease,
                    account.as_ref(),
                    |number| upgrade.change(store, member, number, clock.now()),
                    now,
                )
                .await
            }
            Target::Workspace(workspace_id) => {
                super::run_workspace(
                    Running {
                        store,
                        session: member,
                        workspace_id,
                        pipeline_of: &Pipeline::of,
                        account: account.as_ref(),
                    },
                    &lease,
                    &apply::SHIPPED,
                    now,
                )
                .await
            }
        }
    })
    .await
}

/// The credential to the organization database the member's session holds, which the lease is
/// taken under.
fn organization_credential(member: &MemberSession) -> Result<String, Error> {
    member
        .organization_credential
        .lock()
        .ok()
        .and_then(|slot| slot.clone())
        .ok_or_else(|| {
            Error::refused(
                RefusalReason::NoOrganizationCredential,
                "this machine holds no credential to the organization database, so it cannot take \
                 the lease to upgrade",
            )
        })
}
