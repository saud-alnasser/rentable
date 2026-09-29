//! the commands of the way in: an account made, its link made, its password unset, and a link
//! read, taken and opened, as an invitation or as a machine link.

use std::sync::Arc;

use crate::{clock, credential::Credentials, error::Error, state::AppState};

use crate::organization::{
    act::{Acting, Pull, as_member, owner_platform},
    invitation::{
        self, MadeLink, MemberFacts, UnreachableWorkspace, WorkspaceGrant, join,
        link::{self, JoinLink, LinkShape},
        machine,
    },
    session::{CredentialSlot, OrganizationState, state_of},
    setup,
    store::OrganizationStore,
};

/// Make an account: a row somebody will open, and no link (effort 828, requirements 19 and 20).
///
/// **Nothing crosses back but the account as the directory draws it.** The generated password the
/// vault is sealed under never leaves `invitation::create_account`, and nothing stores it: the
/// account holds no password anybody knows until its first link is opened, which is
/// [`organization_invitation_link_make`]. Everything the account is made of stays on this side: the
/// vault, the content key sealed to them, and the grants. A read-only grant is minted with the
/// owner's authority, which is why the platform is handed in where this machine holds it.
///
/// **One role and one override** (effort 838, requirement 5): `role_id` names the role the account
/// holds and `override_mask` the flags switched for them alone, `roleId` and `overrideMask` on the
/// wire. The second is not spelled `override`, which Rust keeps as a word of its own.
#[tauri::command(rename = "invitation_member_create")]
pub(crate) async fn organization_invitation_member_create(
    app_state: tauri::State<'_, AppState>,
    credentials: tauri::State<'_, Credentials>,
    clock: tauri::State<'_, clock::Shared>,
    username: String,
    role_id: String,
    override_mask: i64,
    workspaces: Vec<WorkspaceGrant>,
) -> Result<MemberFacts, Error> {
    let platform = owner_platform(&app_state, &credentials).await;
    as_member(&app_state, Pull::No, async |Acting { member, store }| {
        invitation::create_account(
            store,
            member,
            platform.as_ref(),
            &username,
            &role_id,
            override_mask,
            &workspaces,
            invitation::INVITED_KDF,
            clock.now(),
        )
        .await
    })
    .await
}

/// Make the one link that admits a machine to an account (effort 828, requirement 20).
///
/// **The account's standing chooses the kind and the caller chooses nothing.** An account whose
/// password is not yet set gets an invitation-kind link, which asks the person opening it to
/// choose a password; one that has a password gets a machine-kind link, which lands the machine at
/// the wall. No standing refuses it: an account is held on as many machines as it is given links
/// for, and each link admits one of them, once.
///
/// **Both halves cross, and neither is a credential** ([[rules/credentials]], *Client boundary*).
/// The link's text carries the credential sealed and the code is what the person reads off the
/// screen and reads out on a call; nothing is written under the data directory, and a person who
/// lost the pair makes another, which drops the one they lost.
#[tauri::command(rename = "invitation_link_make")]
pub(crate) async fn organization_invitation_link_make(
    app_state: tauri::State<'_, AppState>,
    credentials: tauri::State<'_, Credentials>,
    clock: tauri::State<'_, clock::Shared>,
    member_id: String,
) -> Result<MadeLink, Error> {
    let platform = owner_platform(&app_state, &credentials).await;
    // an invitation-kind link writes the account's row back whole, and that row carries the
    // session epoch, so it is read after a pull rather than off this machine's last sight of it
    // (effort 826, requirement 22). *The register this act was gated on was read from the same
    // pull until 2026-09-20; the gate is gone (828, requirement 20 as corrected).*
    as_member(&app_state, Pull::First, async |Acting { member, store }| {
        let locator = invitation::locator(store, member).await?;

        invitation::make_link(
            store,
            member,
            platform.as_ref(),
            &locator,
            &member_id,
            invitation::INVITED_KDF,
            clock.now(),
        )
        .await
    })
    .await
}

/// Unset a member's password: a fresh vault under a fresh secret, everything the resetting holder of
/// `resetPassword` reaches re-sealed to it, and the requirement to choose a password set, so the
/// next link asks for one. What a reset is, for a member whose password nobody knows.
///
/// **It hands over nothing.** The answer names the workspaces it could not restore, and the
/// member's permissions are kept; a link is a separate act on the same account.
#[tauri::command(rename = "invitation_password_unset")]
pub(crate) async fn organization_invitation_password_unset(
    app_state: tauri::State<'_, AppState>,
    credentials: tauri::State<'_, Credentials>,
    clock: tauri::State<'_, clock::Shared>,
    member_id: String,
) -> Result<Vec<UnreachableWorkspace>, Error> {
    let platform = owner_platform(&app_state, &credentials).await;
    // the row this act writes back whole carries the session epoch, so it is read after a pull
    // rather than off this machine's last sight of it (effort 826, requirement 22).
    as_member(&app_state, Pull::First, async |Acting { member, store }| {
        invitation::unset_password(
            store,
            member,
            platform.as_ref(),
            &member_id,
            invitation::INVITED_KDF,
            clock.now(),
        )
        .await
    })
    .await
}

/// Open an invitation link: the way in for a person who was invited or reset (effort 826,
/// requirements 8 and 9; effort 828, requirement 1).
///
/// **The code comes first and everything follows it.** The link carries no credential anybody can
/// read, so the code and the link's secret together unseal the issuer's own grant and the vault
/// password; the replica is opened under that grant; the organization is recorded on this machine
/// where it holds none, which is why this works on a machine that never connected; the invitation
/// is judged; and the password the person chose reseals their vault. A link naming an organization
/// other than the one this machine holds is refused, and the way to it is a disconnect.
///
/// **`public`, because it happens at the wall.** Neither the credential, the secret nor the
/// password crosses back; what comes back is where the machine stands, with a session in it.
#[tauri::command(rename = "invitation_accept")]
pub(crate) async fn organization_invitation_accept(
    app_state: tauri::State<'_, AppState>,
    credentials: tauri::State<'_, Credentials>,
    clock: tauri::State<'_, clock::Shared>,
    link: String,
    code: String,
    password: String,
) -> Result<OrganizationState, Error> {
    let link = JoinLink::decode(&link)?;
    let (store, member) = {
        let mut remote_sync = app_state.remote_sync.write().await;

        join::accept(
            credentials.inner().as_ref(),
            |credential| reached(&app_state, &clock, &link, credential),
            remote_sync.store_mut(),
            &link,
            &code,
            &password,
            setup::SHIPPING_KDF,
            clock.now(),
        )
        .await?
    };

    // best effort, under the member's own credential now.
    store.pull().await;

    *app_state.organization.write().await = Some(store);
    *app_state.member.write().await = Some(member);

    state_of(&app_state, &credentials, &clock).await
}

/// Connect this machine with a machine-kind link, and leave it at the wall.
///
/// **`public`, because it happens before there is anybody to act as**, exactly as a connect and an
/// invitation accept do. The code and the link's secret together unseal the member's own grant,
/// the replica is opened under it, the organization is recorded with no member, and the row behind
/// the link is spent. A machine that already holds an organization is refused, and the way to
/// another is a disconnect.
///
/// **The credential is let go of with the replica.** Nobody is signed in here, so the store is
/// dropped rather than kept, and the sign-in at the wall opens it again
/// with what the member's vault unseals.
#[tauri::command(rename = "invitation_machine_connect")]
pub(crate) async fn organization_invitation_machine_connect(
    app_state: tauri::State<'_, AppState>,
    credentials: tauri::State<'_, Credentials>,
    clock: tauri::State<'_, clock::Shared>,
    link: String,
    code: String,
) -> Result<OrganizationState, Error> {
    let link = JoinLink::decode(&link)?;

    {
        let mut remote_sync = app_state.remote_sync.write().await;

        machine::connect(
            |credential| reached(&app_state, &clock, &link, credential),
            remote_sync.store_mut(),
            &link,
            &code,
            setup::SHIPPING_KDF,
            clock.now(),
        )
        .await?;
    }

    state_of(&app_state, &credentials, &clock).await
}

/// The link the operating system handed this process, if one is waiting: a launch with a link
/// on the command line, or a link opened while the application was already running and before
/// the shell was listening. Taken once; the shell reads it at startup and then listens for the
/// event the same arrival raises afterwards.
#[tauri::command(rename = "invitation_link_take")]
pub async fn organization_invitation_link_take(
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

/// Read a link: which organization it names, which kind of link it is, and when it lapses.
///
/// **A decode and nothing else** (effort 828, requirement 1). Nothing is reached and no row is
/// read, because there is no credential to read one with until somebody types the code; where the
/// invitation behind a link stands is judged inside `organization_invitation_accept`, which has
/// one. What crosses back is what the text says; the credential and the secret stay on this side
/// ([[rules/credentials]]). *It was `organization_link_inspect`, which opened the replica with the
/// link's clear credential before the person had given anything.*
#[tauri::command(rename = "invitation_link_read")]
pub fn organization_invitation_link_read(link: String) -> Result<LinkShape, Error> {
    link::read(&link)
}

/// The organization a link names, reached: its replica on this machine, opened against the
/// remote the link spells with the credential it was handed, and pulled. A machine that has never
/// seen the organization and cannot reach it now has nothing to say about the link, and says so
/// as a network failure rather than as a refusal.
///
/// **The credential is handed in rather than read off the link** (effort 828, requirement 1).
/// No link carries one legibly: every link seals its payload under the code that was read out
/// with it, so what fills this slot is what the code unsealed. The slot is the caller's, because
/// a session opened over this replica replaces its contents with the member's own. *The
/// organization's own link carried a legible credential until requirement 16 retired the link and
/// the credential together.*
async fn reached(
    app_state: &AppState,
    clock: &clock::Shared,
    link: &JoinLink,
    credential: CredentialSlot,
) -> Result<OrganizationStore, Error> {
    let database_path = {
        let settings = app_state.settings.read().await;

        settings.database_path.clone()
    };
    let slot = Arc::clone(&credential);
    let store = OrganizationStore::open(
        clock.clone(),
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
