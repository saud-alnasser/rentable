//! the commands on a member's row: the directory, a rename, a password changed, sessions ended,
//! a removal and what a lock-out would cost, and the organization itself deleted.

use crate::{
    clock,
    credential::Credentials,
    error::{Error, RefusalReason},
    organization::Shared,
};

use crate::organization::{
    act::{Acting, Pull, as_member, signed_in_owner_platform},
    invitation::{self, MemberFacts, MemberStanding},
    member::{
        password,
        removal::{self, LockOutCost, Removed},
    },
    session::{self, OrganizationState, SessionsEnded, state_of},
    setup,
    workspace::hold_renewed_token,
};

/// Delete the organization: every workspace database and the organization's own directory go from
/// the owner's Turso account, and this machine forgets what it held (effort 828, requirement 18).
///
/// **The owner's alone**, twice over: the authority is on their machine and nobody else's, which
/// is what this refuses on first, and `removal::delete_organization` refuses again on the role the
/// wall opened. The password is the second thing it asks for and it never crosses back.
///
/// What comes back is where the machine stands, which is a machine holding nothing: the shell
/// reads it and raises the first screen, exactly as a disconnect leaves it.
#[tauri::command(rename = "member_organization_delete")]
pub(crate) async fn organization_member_organization_delete(
    app_state: tauri::State<'_, Shared>,
    credentials: tauri::State<'_, Credentials>,
    clock: tauri::State<'_, clock::Shared>,
    password: String,
) -> Result<OrganizationState, Error> {
    let platform = signed_in_owner_platform(&app_state, &credentials)
        .await
        .ok_or_else(|| {
            Error::refused(
                RefusalReason::OwnerMachineOnly,
                "only an owner can delete the organization, from the machine that connected the \
                  turso account. ask the owner",
            )
        })?;

    removal::delete_organization(
        &app_state,
        credentials.inner().as_ref(),
        &platform,
        &password,
    )
    .await?;

    state_of(&app_state, &credentials, &clock).await
}

/// Rename a member: their row written back with the username re-sealed and signed by whoever
/// renamed them. A holder of `renameMember`'s, from above and on any row but their own and
/// the owner's; the username is
/// held to the same rules and the same uniqueness as an invitation's. What comes back is the
/// member as the list shows them.
#[tauri::command(rename = "member_rename")]
pub async fn organization_member_rename(
    app_state: tauri::State<'_, Shared>,
    clock: tauri::State<'_, clock::Shared>,
    member_id: String,
    username: String,
) -> Result<MemberFacts, Error> {
    // the row this act writes back whole carries the session epoch, so it is read after a pull
    // rather than off this machine's last sight of it (effort 826, requirement 22).
    as_member(&app_state, Pull::First, async |Acting { member, store }| {
        invitation::rename_member(store, member, &member_id, &username, clock.now()).await
    })
    .await
}

/// Sign a member out of every machine, from their row: the owner's, and any holder of
/// `resetPassword` (effort 826, requirement 22).
///
/// **Their password is not changed by it.** What ends is the sessions and the keys the machines
/// they signed in on were staying signed in with; the password they know still opens their vault.
/// The caller's own row is refused, because that is `organization_session_end_elsewhere` and
/// keeps this machine in, and the owner's is refused to anybody but the owner.
#[tauri::command(rename = "member_end_sessions")]
pub async fn organization_member_end_sessions(
    app_state: tauri::State<'_, Shared>,
    clock: tauri::State<'_, clock::Shared>,
    member_id: String,
) -> Result<SessionsEnded, Error> {
    // for the reason `organization_session_end_elsewhere` gives: the number written is one past
    // the row's, so the row has to be the organization's rather than this machine's last sight
    // of it.
    as_member(&app_state, Pull::First, async |Acting { member, store }| {
        Ok(SessionsEnded {
            sent: session::end_member_sessions(store, member, &member_id, clock.now()).await?,
        })
    })
    .await
}

/// What locking a member out would cost, said before it is done: which workspaces rotate and how
/// many other members stop syncing until their application reconnects.
#[tauri::command(rename = "member_lock_out_cost")]
pub async fn organization_member_lock_out_cost(
    app_state: tauri::State<'_, Shared>,
    member_id: String,
) -> Result<LockOutCost, Error> {
    as_member(&app_state, Pull::No, async |Acting { member, store }| {
        // the same gate the lock-out itself stands behind: the interface asks this before offering
        // the act, and every command refuses again on the row rather than trusting the screen.
        member.settled()?;
        crate::organization::role::permission::require(
            session::permissions_on_row(store, member).await?,
            crate::organization::role::permission::Flag::RemoveMember,
        )?;

        removal::lock_out_cost(store, member, &member_id).await
    })
    .await
}

/// Remove a member. `lock_out` is `false` unless the interface says otherwise, which is the
/// ordinary removal: their grants go, their row is signed as removed, and nobody else is
/// disturbed. `true` rotates every workspace they held, which cuts them off at once and stops
/// every remaining member of those workspaces syncing until their application collects a fresh
/// credential; it is the owner's, because rotating needs the turso authority.
#[tauri::command(rename = "member_remove")]
pub(crate) async fn organization_member_remove(
    app_state: tauri::State<'_, Shared>,
    credentials: tauri::State<'_, Credentials>,
    clock: tauri::State<'_, clock::Shared>,
    member_id: String,
    lock_out: Option<bool>,
) -> Result<Removed, Error> {
    let platform = signed_in_owner_platform(&app_state, &credentials).await;
    // the row this act writes back whole carries the session epoch, so it is read after a pull
    // rather than off this machine's last sight of it (effort 826, requirement 22).
    as_member(&app_state, Pull::First, async |Acting { member, store }| {
        let organization_database = format!("org-{}", member.organization_id);

        let removed = removal::remove_member(
            store,
            member,
            platform.as_ref(),
            &organization_database,
            &member_id,
            lock_out.unwrap_or(false),
            clock.now(),
        )
        .await?;

        // a lock-out rotated the workspaces the member held, this one among them where the owner
        // has it open, and the owner's session already carries the fresh credential: the engine is
        // told, since `reconnect` finds nothing moved between the rows and this session.
        hold_renewed_token(&app_state, member).await;

        Ok(removed)
    })
    .await
}

/// Change the signed-in member's own password. The current one opens the vault, the new one has
/// to reach the floor, and nothing else on the database moves. Neither password crosses back.
#[tauri::command(rename = "member_change_password")]
pub(crate) async fn organization_member_change_password(
    app_state: tauri::State<'_, Shared>,
    credentials: tauri::State<'_, Credentials>,
    clock: tauri::State<'_, clock::Shared>,
    current: String,
    new: String,
) -> Result<OrganizationState, Error> {
    as_member(&app_state, Pull::No, async |Acting { member, store }| {
        password::change_password(
            credentials.inner().as_ref(),
            store,
            member,
            &current,
            &new,
            setup::SHIPPING_KDF,
            clock.now(),
        )
        .await
    })
    .await?;

    state_of(&app_state, &credentials, &clock).await
}

/// Every member, for the members list: names opened with the content key the session holds and the
/// workspaces each holds with their access. *There was a second command answering the invitations
/// until effort 826, which folded the unspent one into the row; effort 828 dropped it again, since
/// nothing read it.*
#[tauri::command(rename = "member_list")]
pub async fn organization_member_list(
    app_state: tauri::State<'_, Shared>,
) -> Result<Vec<MemberFacts>, Error> {
    as_member(&app_state, Pull::No, async |Acting { member, store }| {
        invitation::members(store, member).await
    })
    .await
}

/// Where each account stands, for the line the directory draws under a name (effort 828,
/// requirement 19): whether it has a password of its own yet, and whether a machine is signed in
/// on it inside the presence window.
///
/// **Beside the members rather than on them**, because the two halves come from two places: the
/// password is on the signed member row and the machine is on the unsigned register every machine
/// writes for itself. Asked apart, a list of people is still a list of people when the register
/// says nothing, and the directory joins the two on the member's id.
#[tauri::command(rename = "member_standings")]
pub async fn organization_member_standings(
    app_state: tauri::State<'_, Shared>,
    clock: tauri::State<'_, clock::Shared>,
) -> Result<Vec<MemberStanding>, Error> {
    as_member(&app_state, Pull::No, async |Acting { member, store }| {
        invitation::standings(store, member, clock.now()).await
    })
    .await
}
