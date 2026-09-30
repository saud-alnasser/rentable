//! the commands on the roles: listed, made, renamed, re-masked, moved and deleted, and a member's
//! role and overrides set.

use crate::{clock, error::Error, organization::Shared};

use crate::organization::{
    act::{Acting, Pull, as_member},
    invitation::MemberFacts,
    role::{self, RoleFacts},
};

/// Every role, highest rank first: the owner's, the manager's, the custom roles in order, and the
/// member's, each with what it carries and how many members hold it (effort 838, requirement 12).
/// Any signed-in member reads it, off the replica; a custom role's name is opened with the content
/// key the session holds, and nothing about a certificate crosses.
#[tauri::command(rename = "role_list")]
pub async fn organization_role_list(
    app_state: tauri::State<'_, Shared>,
) -> Result<Vec<RoleFacts>, Error> {
    as_member(&app_state, Pull::No, async |Acting { member, store }| {
        role::roles(store, member).await
    })
    .await
}

/// Make a custom role, named and carrying `mask`, directly below `after_role_id` (effort 838,
/// requirement 4). `manageRoles`, below the actor's rank, and only flags the actor holds.
#[tauri::command(rename = "role_create")]
pub async fn organization_role_create(
    app_state: tauri::State<'_, Shared>,
    clock: tauri::State<'_, clock::Shared>,
    name: String,
    mask: i64,
    after_role_id: String,
) -> Result<RoleFacts, Error> {
    // making room can renumber roles somebody holds, whose rows are written back whole and carry
    // the session epoch, so they are read after a pull (effort 826, requirement 22).
    as_member(&app_state, Pull::First, async |Acting { member, store }| {
        role::create_role(store, member, &name, mask, &after_role_id, clock.now()).await
    })
    .await
}

/// Rename a custom role. `manageRoles`, below the actor's rank; a built-in role is refused.
#[tauri::command(rename = "role_rename")]
pub async fn organization_role_rename(
    app_state: tauri::State<'_, Shared>,
    clock: tauri::State<'_, clock::Shared>,
    role_id: String,
    name: String,
) -> Result<RoleFacts, Error> {
    as_member(&app_state, Pull::First, async |Acting { member, store }| {
        role::rename_role(store, member, &role_id, &name, clock.now()).await
    })
    .await
}

/// Change what a role carries: the manager's, the member's or a custom role's, never the owner's.
/// `manageRoles`, below the actor's rank, and only flags the actor holds; every holder's
/// certificate is issued again in the same act.
#[tauri::command(rename = "role_set_mask")]
pub async fn organization_role_set_mask(
    app_state: tauri::State<'_, Shared>,
    clock: tauri::State<'_, clock::Shared>,
    role_id: String,
    mask: i64,
) -> Result<RoleFacts, Error> {
    // every holder's row is written back whole, and it carries the session epoch.
    as_member(&app_state, Pull::First, async |Acting { member, store }| {
        role::set_role_mask(store, member, &role_id, mask, clock.now()).await
    })
    .await
}

/// Move a custom role to directly below `after_role_id`. `manageRoles`, and both the role and the
/// place it moves to below the actor's rank; every holder of a role whose rank moved is issued a
/// certificate carrying the new one.
#[tauri::command(rename = "role_move")]
pub async fn organization_role_move(
    app_state: tauri::State<'_, Shared>,
    clock: tauri::State<'_, clock::Shared>,
    role_id: String,
    after_role_id: String,
) -> Result<RoleFacts, Error> {
    as_member(&app_state, Pull::First, async |Acting { member, store }| {
        role::move_role(store, member, &role_id, &after_role_id, clock.now()).await
    })
    .await
}

/// Delete a custom role; everybody who held it holds the member role from here on, exactly, the
/// override they carried cleared (effort 838, requirement 6 as amended 2026-09-27). `manageRoles`,
/// below the actor's rank, and only flags the actor holds, over what moving the holders changes.
#[tauri::command(rename = "role_delete")]
pub async fn organization_role_delete(
    app_state: tauri::State<'_, Shared>,
    clock: tauri::State<'_, clock::Shared>,
    role_id: String,
) -> Result<(), Error> {
    as_member(&app_state, Pull::First, async |Acting { member, store }| {
        role::delete_role(store, member, &role_id, clock.now()).await
    })
    .await
}

/// Give a member a role (effort 838, requirement 5): their row names it, re-signed, and their
/// certificate is issued again from the actor's in the same act, so a flag that signs rows is in
/// force on the next sync with the owner's machine off (requirement 9). `assignRole`, the member
/// and the role both below the actor's rank, never the actor's own row, only flags the actor
/// holds; the owner's role is not assigned. What comes back is the member as the list shows them.
///
/// `overrideMask`, where given, is the override they carry from here on, set in the same act
/// (requirement 6), so "flags held" is asked of the role and the override together rather than of
/// the state between two commands; `overrideMember` as well, where it is not zero. Left out, the
/// override they carried is cleared, so they hold the role exactly (requirement 6, as amended
/// 2026-09-27).
/// *It was `member_change_role`, which wrote a role's word and seven acts, until effort 838.*
#[tauri::command(rename = "role_assign")]
pub async fn organization_role_assign(
    app_state: tauri::State<'_, Shared>,
    clock: tauri::State<'_, clock::Shared>,
    member_id: String,
    role_id: String,
    override_mask: Option<i64>,
) -> Result<MemberFacts, Error> {
    // the row this act writes back whole carries the session epoch, so it is read after a pull
    // rather than off this machine's last sight of it (effort 826, requirement 22).
    as_member(&app_state, Pull::First, async |Acting { member, store }| {
        role::assign_role(
            store,
            member,
            &member_id,
            &role_id,
            override_mask,
            clock.now(),
        )
        .await
    })
    .await
}

/// Set a member's override, the flags switched for them alone (effort 838, requirement 6);
/// `overrideMask` on the wire, for the reason `organization_invitation_member_create` gives.
/// `overrideMember`, the member below the actor's rank, never the actor's own row, only flags the
/// actor holds; the owner's row carries none.
#[tauri::command(rename = "role_set_override")]
pub async fn organization_role_set_override(
    app_state: tauri::State<'_, Shared>,
    clock: tauri::State<'_, clock::Shared>,
    member_id: String,
    override_mask: i64,
) -> Result<MemberFacts, Error> {
    as_member(&app_state, Pull::First, async |Acting { member, store }| {
        role::set_override(store, member, &member_id, override_mask, clock.now()).await
    })
    .await
}

/// Set what is pinned for a member in one workspace, whatever they hold across the organization,
/// and which of it is on (effort 838, requirement 12 as amended a third time, and at review round
/// one); nothing pinned clears it. `overrideMember`, the member below the actor's rank and in that
/// workspace, never the actor's own row nor the owner's, record flags alone, granted within
/// pinned, only flags the actor holds, and nothing written there that the member cannot view.
#[tauri::command(rename = "role_set_workspace_override")]
pub async fn organization_role_set_workspace_override(
    app_state: tauri::State<'_, Shared>,
    member_id: String,
    workspace_id: String,
    pinned: i64,
    granted: i64,
) -> Result<MemberFacts, Error> {
    as_member(&app_state, Pull::First, async |Acting { member, store }| {
        role::set_workspace_override(store, member, &member_id, &workspace_id, pinned, granted)
            .await
    })
    .await
}
