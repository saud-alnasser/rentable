//! the commands of the way in: an account made, its link made, its password unset, the links
//! waiting to be opened listed and revoked, and a link read, taken and opened, as an invitation or
//! as a machine link.

use std::sync::Arc;

use crate::{
    clock,
    credential::{CredentialStore, Credentials},
    error::Error,
    organization::Shared,
};

use crate::organization::{
    act::{Acting, Pull, as_member, signed_in_owner_platform},
    invitation::{
        self, MadeLink, MemberFacts, OutstandingLink, UnreachableWorkspace, WorkspaceGrant, join,
        link::{self, JoinLink, LinkShape},
        machine,
    },
    member::vault::KdfParams,
    session::{CredentialSlot, OrganizationState, sign_out, state_of},
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
    app_state: tauri::State<'_, Shared>,
    credentials: tauri::State<'_, Credentials>,
    clock: tauri::State<'_, clock::Shared>,
    username: String,
    role_id: String,
    override_mask: i64,
    workspaces: Vec<WorkspaceGrant>,
) -> Result<MemberFacts, Error> {
    let platform = signed_in_owner_platform(&app_state, &credentials).await;
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
/// for, and each link admits one of them, once. **The caller chooses how long it lasts**,
/// `lifetimeHours` on the wire, and `invitation::make_link` refuses a lifetime off the steps
/// (effort 851, requirement 11).
///
/// **Both halves cross, and neither is a credential** ([[rules/credentials]], *Client boundary*).
/// The link's text carries the credential sealed and the code is what the person reads off the
/// screen and reads out on a call; nothing is written under the data directory, and a person who
/// lost the pair makes another, which drops the one they lost.
#[tauri::command(rename = "invitation_link_make")]
pub(crate) async fn organization_invitation_link_make(
    app_state: tauri::State<'_, Shared>,
    credentials: tauri::State<'_, Credentials>,
    clock: tauri::State<'_, clock::Shared>,
    member_id: String,
    lifetime_hours: i64,
) -> Result<MadeLink, Error> {
    // where this machine holds the organization's consent the link carries a credential minted to
    // die with it, so the platform decides what is sealed as well as what is granted (effort 851,
    // requirement 11).
    let platform = signed_in_owner_platform(&app_state, &credentials).await;
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
            lifetime_hours,
            invitation::INVITED_KDF,
            clock.now(),
        )
        .await
    })
    .await
}

/// The links waiting to be opened that the reader could have made: whom each is for, what opening
/// it does, who made it where the row says, and when it lapses (effort 851, at the human's word).
///
/// **`inviteMember` or `resetPassword`, on the accounts ranked below the reader**, as making a
/// link is, read off the verified row; a locked reader is refused. Nothing that opens a link
/// crosses: no text, no code, no secret ([[rules/credentials]], *Client boundary*).
#[tauri::command(rename = "invitation_link_list")]
pub(crate) async fn organization_invitation_link_list(
    app_state: tauri::State<'_, Shared>,
    clock: tauri::State<'_, clock::Shared>,
) -> Result<Vec<OutstandingLink>, Error> {
    as_member(&app_state, Pull::No, async |Acting { member, store }| {
        invitation::outstanding_links(store, member, clock.now()).await
    })
    .await
}

/// Revoke one link waiting to be opened: the row behind it goes, so opening it is refused as
/// revoked, and the change is sent (effort 851). Under the list's gate, and refused by rank for
/// an account at or above the reader.
///
/// **After a pull**, so a link somebody opened or revoked on another machine is refused as nothing
/// to revoke rather than deleted from under them.
#[tauri::command(rename = "invitation_link_revoke")]
pub(crate) async fn organization_invitation_link_revoke(
    app_state: tauri::State<'_, Shared>,
    clock: tauri::State<'_, clock::Shared>,
    link_id: String,
) -> Result<(), Error> {
    as_member(&app_state, Pull::First, async |Acting { member, store }| {
        invitation::revoke_link(store, member, &link_id, clock.now()).await
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
    app_state: tauri::State<'_, Shared>,
    credentials: tauri::State<'_, Credentials>,
    clock: tauri::State<'_, clock::Shared>,
    member_id: String,
) -> Result<Vec<UnreachableWorkspace>, Error> {
    let platform = signed_in_owner_platform(&app_state, &credentials).await;
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
/// password; the replica is opened under that grant; the invitation is judged and the vault
/// opened; the organization is recorded on this machine beside any others it holds and selected,
/// which is why this works on a machine that never connected; and the password the person chose
/// reseals their vault. A link refused once its replica was pulled takes that replica away again
/// (effort 851, requirement 10).
///
/// **A link for an organization this machine holds opens its wall** (effort 851, requirement 13,
/// as the human settled it on 2026-10-05): its entry is selected, and the link is judged on that
/// organization's own replica; a reset link for one of its members goes through, and anything else
/// is refused as already used.
///
/// **A session open here ends once the link has gone through** (effort 851, review), as a sign-in
/// ends one: the organization the link adds or selects is the one the machine opens next, and one
/// organization is open at a time. A refused link leaves the session, the selection and the wall as
/// they were; [`accepted_here`] says where it ends sooner.
///
/// **`public`, because it happens at the wall.** Neither the credential, the secret nor the
/// password crosses back; what comes back is where the machine stands, with a session in it.
#[tauri::command(rename = "invitation_accept")]
pub(crate) async fn organization_invitation_accept(
    app_state: tauri::State<'_, Shared>,
    credentials: tauri::State<'_, Credentials>,
    clock: tauri::State<'_, clock::Shared>,
    link: String,
    code: String,
    password: String,
) -> Result<OrganizationState, Error> {
    let link = JoinLink::decode(&link)?;

    accepted_here(
        app_state.inner(),
        credentials.inner().as_ref(),
        |credential| reached(&app_state, &clock, &link, credential),
        &link,
        &code,
        &password,
        setup::SHIPPING_KDF,
        clock.now(),
    )
    .await?;

    state_of(&app_state, &credentials, &clock).await
}

/// [`organization_invitation_accept`] past the decode, over the application's state: the accept,
/// and the session it opens put where the application holds one.
///
/// **A session open here is signed out as late as the link allows** (effort 851, review). Where
/// the link names the organization open now, that is before the reach, because the link is judged
/// on that organization's own replica and a second store is never opened over a live one.
/// Anywhere else it is once the accept has gone through, just before the new session takes its
/// place, so a link refused for its code, its moment or its invitation's standing leaves the
/// person signed in where they were. A failure past the record, which moved the selection, signs
/// them out as a success would (`left_consistent`). *Until this review the session ended before
/// anything was judged, so a refused link left the person signed out while the screen still had
/// them in.*
///
/// `store_for` is how the link's organization is reached, which the command answers with
/// [`reached`] and a test with a replica it holds.
#[allow(clippy::too_many_arguments)]
pub(crate) async fn accepted_here<S, F>(
    app_state: &Shared,
    credentials: &dyn CredentialStore,
    store_for: S,
    link: &JoinLink,
    code: &str,
    password: &str,
    kdf_params: KdfParams,
    now: i64,
) -> Result<(), Error>
where
    S: FnOnce(CredentialSlot) -> F,
    F: std::future::Future<Output = Result<OrganizationStore, Error>>,
{
    let database_path = database_path(app_state).await;

    if open_organization(app_state).await.as_deref() == Some(link.organization_id.as_str()) {
        sign_out(app_state, credentials).await;
    }

    let session_open = app_state.member.read().await.is_some();
    let accepted = {
        let mut remote_sync = app_state.remote_sync.write().await;

        join::accept_while(
            credentials,
            store_for,
            remote_sync.store_mut(),
            &database_path,
            link,
            code,
            password,
            kdf_params,
            now,
            session_open,
        )
        .await
    };
    let (store, member) = match accepted {
        Ok(accepted) => accepted,
        Err(refusal) => {
            left_consistent(app_state, credentials).await;

            return Err(refusal);
        }
    };

    // the session open on another organization ends here, now that this one admitted somebody.
    if session_open {
        sign_out(app_state, credentials).await;
    }

    // best effort, under the member's own credential now.
    store.pull().await;

    *app_state.organization.write().await = Some(store);
    *app_state.member.write().await = Some(member);

    Ok(())
}

/// Connect this machine with a machine-kind link, and leave it at the wall.
///
/// **`public`, because it happens before there is anybody to act as**, exactly as a connect and an
/// invitation accept do. The code and the link's secret together unseal the member's own grant,
/// the replica is opened under it, the organization is recorded with no member beside any others
/// held and selected, and the row behind the link is spent. A link for an organization this machine
/// holds is refused as already used (effort 851, requirement 13), and selected where nobody is in.
/// A session open here ends once the link has recorded an organization, as it does for an
/// invitation, and a refused link leaves it open ([`connected_here`]).
///
/// **The credential is let go of with the replica.** Nobody is signed in here, so the store is
/// dropped rather than kept, and the sign-in at the wall opens it again
/// with what the member's vault unseals.
#[tauri::command(rename = "invitation_machine_connect")]
pub(crate) async fn organization_invitation_machine_connect(
    app_state: tauri::State<'_, Shared>,
    credentials: tauri::State<'_, Credentials>,
    clock: tauri::State<'_, clock::Shared>,
    link: String,
    code: String,
) -> Result<OrganizationState, Error> {
    let link = JoinLink::decode(&link)?;

    connected_here(
        app_state.inner(),
        credentials.inner().as_ref(),
        |credential| reached(&app_state, &clock, &link, credential),
        &link,
        &code,
        setup::SHIPPING_KDF,
        clock.now(),
    )
    .await?;

    state_of(&app_state, &credentials, &clock).await
}

/// [`organization_invitation_machine_connect`] past the decode, over the application's state.
///
/// **A session open here is signed out only once the link has recorded an organization** (effort
/// 851, review). A machine link never reaches a replica this machine has open, since one for a
/// held organization is refused before anything is reached, so nothing here ends a session before
/// the link is judged, and a refused link leaves the person signed in where they were.
pub(crate) async fn connected_here<S, F>(
    app_state: &Shared,
    credentials: &dyn CredentialStore,
    store_for: S,
    link: &JoinLink,
    code: &str,
    kdf_params: KdfParams,
    now: i64,
) -> Result<(), Error>
where
    S: FnOnce(CredentialSlot) -> F,
    F: std::future::Future<Output = Result<OrganizationStore, Error>>,
{
    let database_path = database_path(app_state).await;
    let session_open = app_state.member.read().await.is_some();
    let connected = {
        let mut remote_sync = app_state.remote_sync.write().await;

        machine::connect(
            store_for,
            remote_sync.store_mut(),
            &database_path,
            link,
            code,
            kdf_params,
            now,
            session_open,
        )
        .await
    };

    if let Err(refusal) = connected {
        left_consistent(app_state, credentials).await;

        return Err(refusal);
    }

    // the machine is at the wall of the organization the link recorded, so a session open on
    // another one ends.
    if session_open {
        sign_out(app_state, credentials).await;
    }

    Ok(())
}

/// The organization a session is open on here, if one is.
async fn open_organization(app_state: &Shared) -> Option<String> {
    app_state
        .member
        .read()
        .await
        .as_ref()
        .map(|member| member.organization_id.clone())
}

/// After a link act failed: a session still open stays open where the record still selects its
/// organization, and is signed out where the act moved the selection before it failed (effort
/// 851, review). A link refused as it was judged never moves it with somebody signed in
/// (`connect::held_here`); one that failed past the record has, and the machine then stands at the
/// wall of the organization the link recorded, with one organization open at a time.
async fn left_consistent(app_state: &Shared, credentials: &dyn CredentialStore) {
    let Some(open) = open_organization(app_state).await else {
        return;
    };
    let selected = app_state
        .remote_sync
        .write()
        .await
        .store_mut()
        .selected()
        .map(|held| held.id.clone());

    if selected.as_deref() != Some(open.as_str()) {
        sign_out(app_state, credentials).await;
    }
}

/// The link the operating system handed this process, if one is waiting: a launch with a link
/// on the command line, or a link opened while the application was already running and before
/// the shell was listening. Taken once; the shell reads it at startup and then listens for the
/// event the same arrival raises afterwards.
#[tauri::command(rename = "invitation_link_take")]
pub async fn organization_invitation_link_take(
    app_state: tauri::State<'_, Shared>,
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
    app_state: &Shared,
    clock: &clock::Shared,
    link: &JoinLink,
    credential: CredentialSlot,
) -> Result<OrganizationStore, Error> {
    let database_path = database_path(app_state).await;
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

/// Where this machine keeps its data, read once per act: the replica a link reaches goes beside it,
/// and a refused link takes that replica away from the same place (effort 851, requirement 10).
async fn database_path(app_state: &Shared) -> std::path::PathBuf {
    let settings = app_state.settings.read().await;

    settings.database_path.clone()
}
