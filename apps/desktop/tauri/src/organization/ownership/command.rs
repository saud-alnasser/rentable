//! the commands of a handover: the organization offered to another account, the offer withdrawn,
//! and the offer accepted.

use crate::{clock, credential::Credentials, error::Error, state::AppState};

use crate::organization::{
    act::{Acting, Pull, as_member},
    invitation::MemberFacts,
    ownership,
    session::{OrganizationState, state_of},
};

/// Offer the organization to another account: the first of the two acts a handover is (effort
/// 828, requirement 22).
///
/// **The owner's alone, and their password is what performs it.** The role is read off the session
/// the wall opened and refused in Rust; the password is tried against the owner's own row, so a
/// wrong one refuses before a single row is written and a machine somebody walked away from is not
/// a way to give their organization away. Nothing about the password crosses back.
///
/// **Nothing about the organization moves here.** The offer seals the key this directory is signed
/// under to the account named, writes a succession row saying so, and stops; the roles, the key
/// and every signature stay as they were until the other person accepts on a machine of their own.
///
/// What comes back is the offered account as the members list shows them.
#[tauri::command(rename = "ownership_offer")]
pub async fn organization_ownership_offer(
    app_state: tauri::State<'_, AppState>,
    clock: tauri::State<'_, clock::Shared>,
    member_id: String,
    password: String,
) -> Result<MemberFacts, Error> {
    // the row this act writes back whole carries the session epoch, so it is read after a pull
    // rather than off this machine's last sight of it (effort 826, requirement 22).
    as_member(&app_state, Pull::First, async |Acting { member, store }| {
        ownership::offer_ownership(store, member, &member_id, &password, clock.now()).await
    })
    .await
}

/// Take the offer back (effort 828, requirement 22).
///
/// The owner's, and it asks for no password: nothing is unsealed and what is being undone is
/// something this person did. Whether an offer stands at all is Rust's to answer, and the refusal
/// where none does is the sentence the members section shows.
#[tauri::command(rename = "ownership_withdraw_offer")]
pub async fn organization_ownership_withdraw_offer(
    app_state: tauri::State<'_, AppState>,
    clock: tauri::State<'_, clock::Shared>,
) -> Result<(), Error> {
    as_member(&app_state, Pull::First, async |Acting { member, store }| {
        ownership::withdraw_offer(store, member, clock.now()).await
    })
    .await
}

/// Accept the organization: the second act, on the offered account's own machine (effort 828,
/// requirement 22).
///
/// **The password is what becomes the key.** Their vault derives the organization's new key, every
/// certificate is re-issued under it, the roles swap, and this machine pins the new key in its own
/// record and in the open session. Nothing about the password or the key crosses back
/// ([[rules/credentials]], *Client boundary*).
///
/// **What comes back is the whole state**, rather than the member row the offer answers with: this
/// reader is the owner from here on, so the sections the settings area draws, the acts its cards
/// carry and the rail's menus all change with it, and every one of them is read off the state.
///
/// The Turso account does not move with the ownership: until the new owner grants the consent on
/// their own machine the acts that mint run on the founder's machine or not at all, which is what
/// the Turso account block in the organization section says beside the reconnect.
#[tauri::command(rename = "ownership_accept")]
pub(crate) async fn organization_ownership_accept(
    app_state: tauri::State<'_, AppState>,
    credentials: tauri::State<'_, Credentials>,
    clock: tauri::State<'_, clock::Shared>,
    password: String,
) -> Result<OrganizationState, Error> {
    // the rows this act writes back whole carry the session epoch, so they are read after a pull
    // rather than off this machine's last sight of them (effort 826, requirement 22).
    as_member(&app_state, Pull::First, async |Acting { member, store }| {
        let mut remote_sync = app_state.remote_sync.write().await;

        ownership::accept_ownership(
            store,
            member,
            remote_sync.store_mut(),
            &password,
            clock.now(),
        )
        .await
    })
    .await?;

    state_of(&app_state, &credentials, &clock).await
}
