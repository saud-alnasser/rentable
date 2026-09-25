use std::sync::{Arc, Mutex, atomic::Ordering};

use serde::{Deserialize, Serialize};
use tauri::Emitter;

use crate::{
    diagnostics,
    error::{Error, RefusalReason},
    persisted::Persisted,
    state::AppState,
    sync::RemoteSyncStore,
    timestamp,
};

use super::{
    HeldOrganization, connect, forget,
    invite::{self, MadeLink, MemberFacts, MemberStanding, UnreachableWorkspace, WorkspaceGrant},
    join,
    link::{self, JoinLink, LinkShape},
    machine, mark,
    migrate::Pipeline,
    migration::{self, MigrationPhase, PipelineLease},
    password,
    removal::{self, LockOutCost, Removed},
    role::{self, RoleFacts},
    session::{
        self, CredentialSlot, MemberSession, Resumption, SessionFacts, SessionsEnded,
        WorkspaceFacts,
    },
    setup::{self, CreateOrganization, GroupState, OrganizationCreated, Remote},
    store::OrganizationStore,
    workspace,
};
use crate::sync::turso::{
    discovery::McpEndpoint,
    platform::{AccessLevel, PlatformApi, PlatformEndpoint},
};

/// The organization this machine holds, as the wall names it. No key.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HeldOrganizationFacts {
    pub id: String,
    pub name: String,
    /// this person's member row, once a sign-in has found it; `None` on a machine that connected
    /// by link and has not signed in yet.
    pub member_id: Option<String>,
    /// their role, as last read. A display fact; `None` with `member_id`.
    pub role: Option<String>,
    pub joined_at: i64,
}

impl From<&HeldOrganization> for HeldOrganizationFacts {
    fn from(held: &HeldOrganization) -> Self {
        Self {
            id: held.id.clone(),
            name: held.name.clone(),
            member_id: held.member_id.clone(),
            role: held.role.clone(),
            joined_at: held.joined_at,
        }
    }
}

/// Where this machine stands: the one organization it holds, if any, and who is signed in.
///
/// What the sign-in wall admits on. `session` is `None` until a password has opened a vault in
/// this process, and it carries facts and no credential.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrganizationState {
    /// the organization this machine holds, or `None` on a machine that holds nothing, which is
    /// what the screen offering the two ways to connect is drawn on (requirement 18). *A list
    /// until 2026-09-13.*
    pub organization: Option<HeldOrganizationFacts>,
    pub session: Option<SessionFacts>,
    /// whether this machine holds the Turso authority and knows which account it is over: the
    /// owner's machine after a consent. An owner restored on a new machine holds none until they
    /// repeat the consent, which is the one thing a restore cannot bring with it (requirement 5).
    pub holds_turso_authority: bool,
    /// whether the wall is up because this member's sessions were ended from another machine
    /// (effort 826, requirement 22), which is a sentence the wall carries rather than a refusal
    /// anybody made here. False the moment somebody is signed in again.
    pub signed_out_elsewhere: bool,
}

/// Create an organization on the consented Turso account, with this machine's person as its
/// owner, from the three things the setup walk collects, and sign them in to it.
///
/// **A fourth is the Turso group, and it arrives only where Turso left no other way**
/// ([[rules/credentials]], *Client boundary*): the first create into an empty group may have to
/// name the group, and `setup.rs` tries every name it can work out before the walk asks anybody
/// for one, so this is `None` on an ordinary run. It is a name rather than a credential when it
/// does arrive; `setup.rs` and `sync/turso/discovery.rs` say why.
///
/// **None of the four crosses back, and nothing else crosses at all.** The password is turned
/// into a vault here and dropped; the organization key and the owner's signing key are derived
/// and never stored; the Platform API token is read from the keyring where the consent filed it.
/// What the web layer is told is the organization's id and whether the rows have reached Turso
/// yet ([[rules/credentials]], *Client boundary*). *It was told the organization's own join link
/// as well until effort 828's requirement 16 retired that link; the first run mints nothing to
/// hand out now.*
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
    group: Option<String>,
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

    // a machine holds one organization (requirement 17): the first run is offered only where
    // none is held, and a route reached some other way is refused here rather than making a
    // second organization on the account.
    connect::refuse_while_held(remote_sync.store_mut())?;

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
            group: group.as_deref(),
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
        .organization
        .clone()
        .filter(|held| held.id == created.organization_id)
        .ok_or_else(|| Error::Internal {
            message: "the organization was created and not recorded".to_string(),
        })?;
    let credential: CredentialSlot = Arc::new(Mutex::new(None));
    let member = session::sign_in(&store, &joined, &password, &credential).await?;

    // the owner's machine enters the registry (effort 828, requirement 15). A first run draws the
    // machine id with the record (`setup.rs`) and registers here, after the sign-in, because the
    // push goes out under the credential the vault unsealed.
    session::machine_seen(&store, &joined, Some(&member.member_id), timestamp::now()).await;

    *app_state.organization.write().await = Some(store);
    *app_state.member.write().await = Some(member);

    Ok(created)
}

/// What the consented group already holds, read after the consent and before anything is created
/// (effort 828, requirement 14).
///
/// **`public`, because it happens before there is anybody to act as**, exactly as the consent and
/// the create do. A group holding nothing of ours answers `empty` and the walk asks for a name; a
/// group already holding an organization answers `held` and the walk asks for the owner's username
/// and password instead of refusing the run.
///
/// It reads and nothing else: nothing is minted, nothing is created, no replica is opened and
/// this machine's record is untouched, so a person who stops here has changed nothing on their
/// account.
#[tauri::command]
pub async fn organization_group_inspect(
    _app_state: tauri::State<'_, AppState>,
) -> Result<GroupState, Error> {
    let platform_token = setup::authority()?;

    setup::group_inspect(&platform_token, &McpEndpoint::production()).await
}

/// Connect this machine to the organization the consented group already holds, and sign the owner
/// in to it (effort 828, requirement 14).
///
/// **`public` for the same reason the create is**: it runs on a machine that holds nothing, where
/// there is nobody to act as yet, and what it answers with is a machine that holds an organization
/// and somebody signed in to it.
///
/// **Only the owner's password does it.** The password goes in and facts come out
/// ([[rules/credentials]], *Client boundary*): what it opens, what it derives and what that key
/// proves all stay in Rust, and `setup.rs` says in what order. A wrong username or password is
/// refused with the wall's one sentence, which tells the two apart by nothing; anybody who is not
/// the owner is refused by name and the machine is left holding nothing.
///
/// **The register of connected machines shuts nothing** (requirement 15, as the human corrected it
/// on 2026-09-20). This used to refuse while a machine an owner or an administrator was on had been
/// seen inside the week, and point at the link that machine could make; the owner is handed no
/// link, and an account is held on as many machines as its holder signs in on.
#[tauri::command]
pub async fn organization_connect_existing(
    app_state: tauri::State<'_, AppState>,
    username: String,
    password: String,
) -> Result<OrganizationState, Error> {
    let platform_token = setup::authority()?;
    let database_path = {
        let settings = app_state.settings.read().await;

        settings.database_path.clone()
    };

    // held across the connect, network round trips included, the way a first run holds it: the
    // record of what this machine holds and which Turso account its consent is over are both
    // inside `RemoteSync`, and this writes both. Dropped before the state is read back, because
    // that read takes the same lock.
    let (store, session) = {
        let mut remote_sync = app_state.remote_sync.write().await;
        let (_, store, session) = setup::connect_existing(
            remote_sync.store_mut(),
            &platform_token,
            &McpEndpoint::production(),
            |organization| PlatformApi::new(PlatformEndpoint::production(), organization),
            Remote::libsql(),
            &database_path,
            &username,
            &password,
            timestamp::now(),
        )
        .await?;

        (store, session)
    };

    *app_state.organization.write().await = Some(store);
    *app_state.member.write().await = Some(session);

    state_of(&app_state).await
}

/// Where this machine stands: the organization it holds and who is signed in.
///
/// **`public` on the other side for the same reason the sync state is**: it is what the wall
/// admits on, so requiring a signed-in caller would make it answerable only to machines whose
/// answer is already known.
///
/// **The first read of a launch checks the shape of what the machine holds** and forgets it
/// where it was built before this build (requirement 17, `forget.rs`), before anything opens the
/// replica. Every later read, and every command that answers with the state, finds the check
/// already made.
///
/// **That same first read signs the machine back in** where it stayed signed in (effort 826,
/// requirement 12), so the shell's first question is already answered with a session and the
/// application opens on the workspace the person had last, with no wall in between.
#[tauri::command]
pub async fn organization_state_get(
    app_state: tauri::State<'_, AppState>,
) -> Result<OrganizationState, Error> {
    state_of(&app_state).await
}

/// The state, with the once-per-launch check made first.
///
/// **The same cell resumes a remembered session** (effort 826, requirement 12). It is one cell
/// rather than two because both are things that happen once, before anything else opens the
/// replica, and the order between them matters: a machine holding the old shape has just had its
/// replica deleted and its record emptied, and there is nothing left for a resume to open.
///
/// **And registers the machine** (effort 828, requirement 15), which is the third thing that
/// happens once a launch and is last for the same reason: the resume is what opens the replica
/// the row is written through, so a machine that came back signed in refreshes its row here
/// without anybody typing a password.
pub(crate) async fn state_of(app_state: &AppState) -> Result<OrganizationState, Error> {
    app_state
        .old_shape_check
        .get_or_try_init(|| async {
            forget::forget_old_shape(app_state).await?;
            resume_remembered(app_state).await;

            // and the one sign that is the remote's rather than the replica's: the owner deleted
            // the organization from another machine, so there is no database to sync against any
            // more (effort 828, requirement 18). It is after the resume because the pull it reads
            // spends the credential the resumed vault unsealed, and before the registration
            // because a machine that has just forgotten has no row to write.
            if forget::forget_deleted_organization(app_state).await? {
                return Ok(());
            }

            machine_registered(app_state).await?;

            Ok::<(), Error>(())
        })
        .await?;

    let organization = {
        let mut remote_sync = app_state.remote_sync.write().await;

        remote_sync
            .store_mut()
            .organization
            .as_ref()
            .map(HeldOrganizationFacts::from)
    };
    // **and the one thing that can make this machine's key wrong** (effort 828, requirement 22).
    // A handover somebody else accepted arrives here as rows this machine cannot verify, which is
    // what the read below refuses with. So a refusal is the sign, and the succession is followed
    // and the read made again; a machine whose key still reads the directory pays nothing for
    // this, and one that pinned neither end of a chain is refused exactly as it is today.
    let session = match current_facts(app_state).await {
        Ok(session) => session,
        Err(_) => {
            succession_followed(app_state).await;

            current_facts(app_state).await?
        }
    };
    let holds_turso_authority = owner_platform(app_state).await.is_some();

    // the standing is only ever about a wall that is up: somebody signed in has answered it,
    // whichever way they got back in, so this one read clears it rather than five sign-in paths
    // each remembering to.
    if session.is_some() {
        app_state
            .signed_out_elsewhere
            .store(false, Ordering::SeqCst);
    }

    Ok(OrganizationState {
        organization,
        session,
        holds_turso_authority,
        signed_out_elsewhere: app_state.signed_out_elsewhere.load(Ordering::SeqCst),
    })
}

/// Forget the organization this machine holds (requirement 20): sign out where somebody is in,
/// delete every replica under the data directory, empty the record, and clear the Turso
/// authority. The organization on Turso is untouched, and the person can connect again by the
/// link. The one confirm before it is the screen's; this asks nothing.
#[tauri::command]
pub async fn organization_disconnect(
    app_state: tauri::State<'_, AppState>,
) -> Result<OrganizationState, Error> {
    forget::forget(&app_state).await?;

    state_of(&app_state).await
}

/// Delete the organization: every workspace database and the organization's own directory go from
/// the owner's Turso account, and this machine forgets what it held (effort 828, requirement 18).
///
/// **The owner's alone**, twice over: the authority is on their machine and nobody else's, which
/// is what this refuses on first, and `removal::delete_organization` refuses again on the role the
/// wall opened. The password is the second thing it asks for and it never crosses back.
///
/// What comes back is where the machine stands, which is a machine holding nothing: the shell
/// reads it and raises the first screen, exactly as a disconnect leaves it.
#[tauri::command]
pub async fn organization_delete(
    app_state: tauri::State<'_, AppState>,
    password: String,
) -> Result<OrganizationState, Error> {
    let platform = owner_platform(&app_state).await.ok_or_else(|| {
        Error::refused(
            RefusalReason::OwnerMachineOnly,
            "only an owner can delete the organization, from the machine that connected the \
                  turso account. ask the owner",
        )
    })?;

    removal::delete_organization(&app_state, &platform, &password).await?;

    state_of(&app_state).await
}

/// Sign in to the organization this machine holds, with a username and a password (effort 824,
/// requirement 19).
///
/// **Works with the network down.** The replica on this machine is opened, its rows are verified
/// against the key this machine pinned when it connected, and the password is tried against each
/// member's vault until one opens, whose username has to be the one typed. A pull is attempted
/// once the vault is open and its failure is not one: the replica goes on serving what it holds
/// (819's requirement 18).
///
/// The wrong password, a username nobody holds, and a username held by somebody whose password
/// this is not are refused with one sentence ([[rules/credentials]]): there is no comparison to
/// skip, and the session that results holds the keys the password unsealed, which a wrong one
/// never produces. A first sign-in on a handed password spends the invitation and the record
/// learns which member this person is; `join.rs` says how.
#[tauri::command]
pub async fn organization_sign_in(
    app_state: tauri::State<'_, AppState>,
    username: String,
    password: String,
) -> Result<OrganizationState, Error> {
    let held = {
        let mut remote_sync = app_state.remote_sync.write().await;

        remote_sync
            .store_mut()
            .organization
            .clone()
            .ok_or_else(|| {
                Error::refused(
                    RefusalReason::NoOrganization,
                    "this machine holds no organization to sign in to",
                )
            })?
    };
    // a session already open on this machine ends first, as a sign-out ends it: its remembered
    // key is deleted, the register stops naming it and its replica is let go of. Signing in over
    // it would file a second member's key beside the first and leave the first for nothing to
    // delete, since a sign-out and a disconnect forget the one member the record names.
    if app_state.member.read().await.is_some() {
        sign_out(app_state.inner()).await;
    }

    let (store, credential) = open_replica(app_state.inner(), &held).await?;

    // a handover accepted while this machine was at the wall left rows this machine's key cannot
    // verify, and the sign-in reads rows (effort 828, requirement 22). The succession is followed
    // before the password is tried, so the wall admits under the key the organization is on now.
    let held = {
        let mut remote_sync = app_state.remote_sync.write().await;

        match role::follow_succession(&store, remote_sync.store_mut()).await {
            Ok(Some(_)) => remote_sync.store_mut().organization.clone().unwrap_or(held),
            Ok(None) => held,
            Err(refusal) => {
                diagnostics::warn("organization.succession.notFollowed")
                    .with("reason", refusal.to_string())
                    .write();

                held
            }
        }
    };

    let member = {
        let mut remote_sync = app_state.remote_sync.write().await;

        join::admit(
            &store,
            remote_sync.store_mut(),
            &held,
            &username,
            &password,
            &credential,
            timestamp::now(),
        )
        .await?
    };

    // best effort, and after the vault is open, because the pull needs the credential the vault
    // held. What arrives is read on the next question, and what does not arrive is the offline
    // case rather than a failure of signing in.
    store.pull().await;

    *app_state.organization.write().await = Some(store);
    *app_state.member.write().await = Some(member);

    state_of(&app_state).await
}

/// Put the wall back up: drop the keys this process held, and let go of the replica. The record
/// is untouched, so the wall comes back up on the same organization with the same member.
#[tauri::command]
pub async fn organization_sign_out(
    app_state: tauri::State<'_, AppState>,
) -> Result<OrganizationState, Error> {
    sign_out(&app_state).await;

    state_of(&app_state).await
}

/// The sign-out itself: the keys go, the organization replica is dropped, and the key this
/// machine was staying signed in on is deleted. What `organization_sign_out` does, and what
/// `forget` does first, so that letting go of the replica is one routine and the file it held can
/// be deleted afterwards.
///
/// **The remembered key goes here rather than in each caller**, which is what makes a disconnect
/// forget it too: a machine that has let go of its organization must not keep the key that opened
/// a member's vault in it. The record is read before it is emptied, which is why this runs before
/// `forget` touches it.
pub(crate) async fn sign_out(app_state: &AppState) {
    // a sign-out the person asked for answers the standing: they are at the wall because they
    // put themselves there. The heartbeat's own sign-out sets it again afterwards, which is the
    // one case where the wall has something to say.
    app_state
        .signed_out_elsewhere
        .store(false, Ordering::SeqCst);

    {
        let mut remote_sync = app_state.remote_sync.write().await;
        let held = remote_sync.store_mut().organization.as_ref();

        if let Some((organization_id, member_id)) =
            held.and_then(|held| held.member_id.as_ref().map(|member| (&held.id, member)))
        {
            session::forget_remembered(organization_id, member_id);
        }
    }

    // the machine stays in the registry and stops naming anybody (effort 828, requirement 15):
    // it still holds the organization, and what ended is the session. Before the replica is let
    // go of below, since that is what carries the write.
    {
        let held = {
            let mut remote_sync = app_state.remote_sync.write().await;

            remote_sync.store_mut().organization.clone()
        };
        let organization = app_state.organization.read().await;

        if let (Some(held), Some(store)) = (held, organization.as_ref()) {
            session::machine_seen(store, &held, None, timestamp::now()).await;
        }
    }

    *app_state.member.write().await = None;
    *app_state.organization.write().await = None;
}

/// Sign in with the key this machine filed at the last sign-in, where it has one and nobody is in
/// yet: the launch that goes straight past the wall (effort 826, requirement 12).
///
/// **Nothing here is a failure.** A record naming no member, an empty keyring, a key that no
/// longer opens the vault, a replica that will not open: every one of them leaves the `member`
/// slot empty, which is the wall, and the person signs in as they did before. So this answers
/// with nothing and writes what happened to the diagnostics log.
///
/// The replica is opened the way `organization_sign_in` opens it, through the same call, so a
/// resumed session reaches its remote on exactly the terms a typed one does.
///
/// **What the organization says now is read the way the heartbeat reads it**, once the session is
/// open and its vault can pay for the pull: one call of [`ended_elsewhere`], which pulls, follows
/// a succession where the rows that arrived ask for one, and signs out where the row has moved
/// on. A machine closed across a handover launches on a replica that has not received it, and
/// following the succession before the pull finds nothing to follow; the follow that matters is
/// the one after, and it is the heartbeat's (effort 828, requirement 22). The one before the vault
/// opens stays for a replica that already holds the re-keyed rows, which is what reads the member
/// row the key has to open.
async fn resume_remembered(app_state: &AppState) {
    if app_state.member.read().await.is_some() {
        return;
    }

    let held = {
        let mut remote_sync = app_state.remote_sync.write().await;

        remote_sync.store_mut().organization.clone()
    };
    let Some(held) = held.filter(|held| held.member_id.is_some()) else {
        return;
    };

    let resumed = match open_replica(app_state, &held).await {
        Ok((store, credential)) => {
            // a replica that already holds a handover this machine has not followed: the
            // succession is followed before the remembered key opens anything, so the resume
            // reads the member row under the key the rows are on (effort 828, requirement 22).
            // A handover the replica has not received yet is followed after the pull, below.
            let held = {
                let mut remote_sync = app_state.remote_sync.write().await;

                match role::follow_succession(&store, remote_sync.store_mut()).await {
                    Ok(Some(_)) => remote_sync
                        .store_mut()
                        .organization
                        .clone()
                        .unwrap_or_else(|| held.clone()),
                    Ok(None) => held.clone(),
                    Err(refusal) => {
                        diagnostics::warn("organization.succession.notFollowed")
                            .with("reason", refusal.to_string())
                            .write();

                        held.clone()
                    }
                }
            };

            session::resume(&store, &held, &credential)
                .await
                .map(|resumption| (store, resumption))
        }
        Err(refusal) => Err(refusal),
    };

    let (store, member) = match resumed {
        Ok((store, Resumption::Opened(member))) => (store, *member),
        // the sessions were ended from another machine while this one was closed: the wall goes
        // up with the sentence for it rather than with the one every other launch shows.
        Ok((_, Resumption::SignedOutElsewhere)) => {
            app_state.signed_out_elsewhere.store(true, Ordering::SeqCst);

            diagnostics::info("organization.session.notResumed")
                .with("organization", held.id.as_str())
                .with("reason", "the sessions were ended from another machine")
                .write();

            return;
        }
        Err(refusal) => {
            diagnostics::info("organization.session.notResumed")
                .with("organization", held.id.as_str())
                .with("reason", refusal.to_string())
                .write();

            return;
        }
    };

    *app_state.organization.write().await = Some(store);
    *app_state.member.write().await = Some(member);

    // and what the organization says now, through the heartbeat's own check: the pull spends the
    // credential the vault just unsealed, a handover that arrives with it is followed and the
    // session re-pinned, and a row that moved on while this machine was closed puts the wall up
    // with the sentence for it. A pull that could not go is the offline case, and this machine
    // stays signed in on the rows it has (819's requirement 18).
    if ended_elsewhere(app_state).await {
        return;
    }

    diagnostics::info("organization.session.resumed")
        .with("organization", held.id.as_str())
        .write();
}

/// Say this machine is still here, and give a record written before this build the machine id it
/// has no field for: the launch's own write to the registry (effort 828, requirement 15).
///
/// **The id is drawn here for an old record and nowhere else.** A record from before the field
/// existed deserialises with an empty one rather than being refused, so the machine keeps what it
/// holds; this is the first launch that can give it one, and the row it writes below is that
/// machine's first. An id once drawn is never redrawn, so a machine keeps one row across every
/// launch after this.
///
/// **Only a launch that opened the replica writes a row**, which is a machine that came back
/// signed in. Reaching the organization database at all takes a credential a vault holds, so a
/// launch that stops at the wall has nothing to write through and nothing to write it under; the
/// sign-in that follows is what writes the row, and the id drawn here is the one it writes.
async fn machine_registered(app_state: &AppState) -> Result<(), Error> {
    let held = {
        let mut remote_sync = app_state.remote_sync.write().await;
        let Some(held) = remote_sync.store_mut().organization.clone() else {
            return Ok(());
        };

        if !held.machine_id.is_empty() {
            held
        } else {
            let identified = HeldOrganization {
                machine_id: invite::random_id()?,
                ..held
            };

            let record = remote_sync.store_mut();

            record.organization = Some(identified.clone());
            record.commit()?;

            diagnostics::info("organization.machine.identified")
                .with("organization", identified.id.as_str())
                .write();

            identified
        }
    };
    let organization = app_state.organization.read().await;

    if let Some(store) = organization.as_ref() {
        session::machine_seen(store, &held, held.member_id.as_deref(), timestamp::now()).await;
    }

    Ok(())
}

/// Take this machine out of the registry, through the replica that carries the delete: what a
/// disconnect does before it forgets the organization locally (effort 828, requirement 15).
///
/// **The replica is taken rather than borrowed**, so the sign-out `forget` performs next finds
/// none and writes nothing back: a machine that deleted its row and then said it was still here
/// would draw a standing line on its member's card for a week over a disconnect it performed
/// itself.
///
/// A disconnect from the wall has no replica open and leaves the row where it is, which the
/// seven-day window ages out. Nothing here is a refusal: the person asked to forget the
/// organization and that is what happens either way.
pub(crate) async fn leave_registry(app_state: &AppState) {
    let held = {
        let mut remote_sync = app_state.remote_sync.write().await;

        remote_sync.store_mut().organization.clone()
    };
    let Some(held) = held.filter(|held| !held.machine_id.is_empty()) else {
        return;
    };
    let Some(store) = app_state.organization.write().await.take() else {
        diagnostics::info("organization.machine.notUnregistered")
            .with("organization", held.id.as_str())
            .with("reason", "no replica is open on this machine")
            .write();

        return;
    };

    if let Err(refusal) = store.unregister_machine(&held.machine_id).await {
        diagnostics::warn("organization.machine.notUnregistered")
            .with("organization", held.id.as_str())
            .with("reason", refusal.to_string())
            .write();
    } else if !store.push().await {
        diagnostics::warn("organization.machine.unregisteredNotYetSent")
            .with("organization", held.id.as_str())
            .write();
    }
}

/// Whether the member signed in on this machine has been signed out from every machine since,
/// and if so put the wall up: the check the sync heartbeat makes (effort 826, requirement 22).
///
/// **The heartbeat rather than a timer of its own**, because the property wanted is that a
/// machine with the application open is at the wall within one heartbeat of the push reaching it,
/// and the heartbeat is already the thing that runs when nobody is doing anything. The
/// organization replica is pulled first, since the row was written on another machine and this
/// one learns of it no other way; a pull that could not go leaves the check to the next one,
/// which is the offline case rather than a failure.
///
/// What it does when the row has moved on is exactly what a sign-out does, through the same
/// routine: the keys go, the replica is let go of, the remembered key is deleted. What it adds is
/// the standing, so the wall says which sign-out this was.
///
/// **And it is where a machine open across a handover follows it** (effort 828, requirement 22).
/// The pull is what brings the re-keyed rows, so a row that will not read under the session's key
/// right after one is the sign of a succession this machine has not followed: it is followed
/// here, the record and the session re-pinned by [`followed`], and the question asked again under
/// the key the rows are on. A row that still will not read is the offline case as before, and this
/// member goes on working against what the replica holds (819's requirement 18). The launch runs
/// this same check once a remembered session is open, so both paths follow after the pull.
pub(crate) async fn ended_elsewhere(app_state: &AppState) -> bool {
    let ended = {
        let mut member = app_state.member.write().await;
        let organization = app_state.organization.read().await;

        let (Some(session), Some(store)) = (member.as_mut(), organization.as_ref()) else {
            return false;
        };

        store.pull().await;

        // and out, which is what carries a bump made offline. `end_elsewhere` writes the number
        // on this machine's replica and pushes; a push that could not go left it there, and no
        // other scheduled path pushes the organization replica, so without this the sessions the
        // person was told would end stay open until they happen to make another organization
        // write. A push with nothing to send costs a round trip on a heartbeat that already
        // made one.
        store.push().await;

        let standing = match session::ended_elsewhere(store, session).await {
            Ok(ended) => Ok(ended),
            Err(refusal) => {
                let mut remote_sync = app_state.remote_sync.write().await;

                if followed(store, session, remote_sync.store_mut()).await {
                    session::ended_elsewhere(store, session).await
                } else {
                    Err(refusal)
                }
            }
        };

        match standing {
            Ok(ended) => ended,
            // a row that will not read is not a sign-out: the replica is the offline case and
            // this member goes on working against what it holds (requirement 18).
            Err(refusal) => {
                diagnostics::warn("organization.session.standingUnread")
                    .with("reason", refusal.to_string())
                    .write();

                false
            }
        }
    };

    if !ended {
        return false;
    }

    sign_out(app_state).await;
    app_state.signed_out_elsewhere.store(true, Ordering::SeqCst);

    diagnostics::info("organization.session.endedFromAnotherMachine").write();

    true
}

/// The organization replica on this machine, opened against its remote with a credential slot a
/// sign-in or a resume fills.
///
/// Built through the same call as every replica, so it opens whether or not the remote is
/// reachable; the token function answers from the slot, which is empty until a vault is open and
/// is what stops an open replica reaching the remote before anybody is in.
///
/// **A replica of another format is refused here, and let go of** (effort 838, requirement 11).
/// This is where a sign-in and a launch's resume both reach what the machine holds, so an
/// organization an earlier or a newer version of the application made is refused by name before
/// either reads a row of it, and neither writes to it: no registry row, no pull, no push.
async fn open_replica(
    app_state: &AppState,
    held: &HeldOrganization,
) -> Result<(OrganizationStore, CredentialSlot), Error> {
    let database_path = {
        let settings = app_state.settings.read().await;

        settings.database_path.clone()
    };
    let credential: CredentialSlot = Arc::new(Mutex::new(None));
    let slot = Arc::clone(&credential);
    let store = OrganizationStore::open(
        &OrganizationStore::replica_path(&database_path, &held.id),
        Some(held.remote_url.clone()),
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

    store.refuse_another_format().await?;

    Ok((store, credential))
}

/// Follow a handover this machine was not present for, and pin the key it left behind (effort
/// 828, requirement 22).
///
/// **Nothing here is a refusal.** A machine whose pinned key still reads the directory is left
/// alone, and one that cannot follow the succession is left holding what it held, which is a
/// machine that refuses the rows exactly as it refuses any row it cannot verify. What the person
/// meets either way is the read that brought this here.
///
/// **The open session is re-pinned beside the record**, because a session carries its own copy of
/// the key and every act reads rows through it. The locks are taken in the order every other act
/// here takes them, the member before the replica before the record, so two acts cannot wait on
/// each other.
async fn succession_followed(app_state: &AppState) {
    let mut member = app_state.member.write().await;
    let organization = app_state.organization.read().await;

    let (Some(session), Some(store)) = (member.as_mut(), organization.as_ref()) else {
        return;
    };
    let mut remote_sync = app_state.remote_sync.write().await;

    followed(store, session, remote_sync.store_mut()).await;
}

/// Follow a succession on a machine with a session open, and say whether one was: the record is
/// re-pinned by the walk, and the session moves onto the key with what its own row says under it
/// (effort 828, requirement 22).
///
/// **The session's role and permissions are the row's, not the ones it opened with.** A handover
/// is the one act that rewrites the acting member's own row from another machine: the founder's
/// session, kept as `owner`, passed every gate that reads the word after they had handed over,
/// deleting the organization among them, and signed certificates under a key that certified
/// nothing. `session::repin` reads the row under the new key and takes both. A row the new key
/// does not find leaves the session as it was, said in the diagnostics, and the read that brought
/// the caller here refuses as it did.
async fn followed(
    store: &OrganizationStore,
    session: &mut MemberSession,
    machine: &mut Persisted<RemoteSyncStore>,
) -> bool {
    let key = match role::follow_succession(store, machine).await {
        Ok(Some(key)) => key,
        Ok(None) => return false,
        Err(refusal) => {
            diagnostics::warn("organization.succession.notFollowed")
                .with("reason", refusal.to_string())
                .write();

            return false;
        }
    };

    if let Err(refusal) = session::repin(store, session, key).await {
        diagnostics::warn("organization.succession.sessionNotRepinned")
            .with("reason", refusal.to_string())
            .write();

        return false;
    }

    true
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
    member: &'a mut Option<MemberSession>,
    store: &'a Option<OrganizationStore>,
) -> Result<(&'a mut MemberSession, &'a OrganizationStore), Error> {
    match (member.as_mut(), store.as_ref()) {
        (Some(member), Some(store)) => Ok((member, store)),
        _ => Err(Error::refused(
            RefusalReason::SignedOut,
            "nobody is signed in to an organization on this machine",
        )),
    }
}

/// Create a workspace on the account, migrated and granted to the owner. Owner only, at the
/// command: anybody else is told to ask the owner, before any request.
#[tauri::command]
pub async fn workspace_create(
    app_state: tauri::State<'_, AppState>,
    name: String,
) -> Result<WorkspaceFacts, Error> {
    let platform = owner_platform(&app_state).await.ok_or_else(|| {
        Error::refused(
            RefusalReason::OwnerMachineOnly,
            "only an owner can create a workspace, from the machine that connected the turso \
                  account. ask the owner",
        )
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

/// Take a workspace back from a member: the grant row goes, and nothing is minted or rotated, so
/// the credential they already hold works until it expires as an ordinary removal's does. The act
/// is the one that gives; the owner's own grant is refused.
#[tauri::command]
pub async fn workspace_grant_withdraw(
    app_state: tauri::State<'_, AppState>,
    workspace_id: String,
    member_id: String,
) -> Result<(), Error> {
    let mut member = app_state.member.write().await;
    let store = app_state.organization.read().await;
    let (member, store) = signed_in(&mut member, &store)?;

    workspace::withdraw_grant(store, member, &workspace_id, &member_id).await
}

/// Delete a workspace: the one moment requirement 4 permits deleting a database, through the one
/// intent the port takes for it. Owner only.
#[tauri::command]
pub async fn workspace_delete(
    app_state: tauri::State<'_, AppState>,
    workspace_id: String,
) -> Result<(), Error> {
    let platform = owner_platform(&app_state).await.ok_or_else(|| {
        Error::refused(
            RefusalReason::OwnerMachineOnly,
            "only an owner can delete a workspace, from the machine that connected the turso \
                  account. ask the owner",
        )
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
            .ok_or_else(|| {
                Error::refused(
                    RefusalReason::NoGrant,
                    "you hold no grant on that workspace",
                )
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
                .ok_or_else(|| Error::refused(RefusalReason::NoOrganizationCredential, "this machine holds no credential to the organization database, so                               it cannot take the lease to upgrade the workspace"))?;
            let organization_host = {
                let mut remote_sync = app_state.remote_sync.write().await;

                remote_sync
                    .store_mut()
                    .organization
                    .as_ref()
                    .filter(|held| held.id == member.organization_id)
                    .map(|held| held.remote_url.trim_start_matches("libsql://").to_string())
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
    let platform = owner_platform(&app_state).await.ok_or_else(|| {
        Error::refused(
            RefusalReason::OwnerMachineOnly,
            "credentials are renewed on the owner's machine, which holds the turso authority",
        )
    })?;
    let mut member = app_state.member.write().await;
    let store = app_state.organization.read().await;
    let (member, store) = signed_in(&mut member, &store)?;
    // the renewal seals to every member's public key as the row carries it, so the rows are read
    // after a pull rather than off this machine's last sight of them: a vault reset on another
    // machine since would otherwise have its grants sealed to the key it no longer holds, and
    // that member could open nothing at all.
    store.pull().await;
    let organization_database = format!("org-{}", member.organization_id);

    let renewed =
        workspace::renew_credentials(store, member, &platform, &organization_database).await?;

    hold_renewed_token(&app_state, member).await;

    Ok(renewed)
}

/// Hand the sync engine the credential the session now holds for the open workspace, where a
/// renewal or a rotation moved it.
///
/// **The engine reads its token off `RemoteSync`, and a renewal writes the session.** Every other
/// member's engine learns of a moved credential through `reconnect`, which compares the rows
/// against the session; the acting owner's session already carries the new one, so nothing there
/// moves and the engine goes on under the token that was just rotated away. This is the one
/// place the owner's own engine is told.
async fn hold_renewed_token(app_state: &AppState, member: &MemberSession) {
    let mut remote_sync = app_state.remote_sync.write().await;
    let current = remote_sync.workspace();

    if let Some(remote_id) = current.remote_id.as_deref()
        && let Some(held) = member.workspace_credentials.get(remote_id)
        && remote_sync.workspace_token().as_deref() != Some(held.token.as_str())
    {
        remote_sync.hold_organization_workspace_token(&held.token);
    }
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

    // after a pull, for the reason `organization_renew_credentials` gives.
    store.pull().await;

    let now = crate::timestamp::now();
    if !workspace::credentials_due(store, member, workspace::CREDENTIAL_RENEWAL_WINDOW_MS, now)
        .await?
    {
        return Ok(false);
    }

    let organization_database = format!("org-{}", member.organization_id);
    workspace::renew_credentials(store, member, &platform, &organization_database).await?;
    hold_renewed_token(&app_state, member).await;

    Ok(true)
}

/// Make an account: a row somebody will open, and no link (effort 828, requirements 19 and 20).
///
/// **Nothing crosses back but the account as the directory draws it.** The generated password the
/// vault is sealed under never leaves `invite::create_account`, and nothing stores it: the account
/// holds no password anybody knows until its first link is opened, which is [`member_link_make`].
/// Everything the account is made of stays on this side: the vault, the content key sealed to
/// them, and the grants. A read-only grant is minted with the owner's authority, which is why the
/// platform is handed in where this machine holds it.
///
/// **One role and one override** (effort 838, requirement 5): `role_id` names the role the account
/// holds and `override_mask` the flags switched for them alone, `roleId` and `overrideMask` on the
/// wire. The second is not spelled `override`, which Rust keeps as a word of its own.
#[tauri::command]
pub async fn member_create(
    app_state: tauri::State<'_, AppState>,
    username: String,
    role_id: String,
    override_mask: i64,
    workspaces: Vec<WorkspaceGrant>,
) -> Result<MemberFacts, Error> {
    let platform = owner_platform(&app_state).await;
    let mut member = app_state.member.write().await;
    let store = app_state.organization.read().await;
    let (member, store) = signed_in(&mut member, &store)?;

    invite::create_account(
        store,
        member,
        platform.as_ref(),
        &username,
        &role_id,
        override_mask,
        &workspaces,
        invite::INVITED_KDF,
        timestamp::now(),
    )
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
#[tauri::command]
pub async fn member_link_make(
    app_state: tauri::State<'_, AppState>,
    member_id: String,
) -> Result<MadeLink, Error> {
    let platform = owner_platform(&app_state).await;
    let mut member = app_state.member.write().await;
    let store = app_state.organization.read().await;
    let (member, store) = signed_in(&mut member, &store)?;
    // an invitation-kind link writes the account's row back whole, and that row carries the
    // session epoch, so it is read after a pull rather than off this machine's last sight of it
    // (effort 826, requirement 22). *The register this act was gated on was read from the same
    // pull until 2026-09-20; the gate is gone (828, requirement 20 as corrected).*
    store.pull().await;
    let locator = invite::locator(store, member).await?;

    invite::make_link(
        store,
        member,
        platform.as_ref(),
        &locator,
        &member_id,
        invite::INVITED_KDF,
        timestamp::now(),
    )
    .await
}

/// Unset a member's password: a fresh vault under a fresh secret, everything the resetting
/// administrator reaches re-sealed to it, and the requirement to choose a password set, so the
/// next link asks for one. What a reset is, for a member whose password nobody knows.
///
/// **It hands over nothing.** The answer names the workspaces it could not restore, and the
/// member's permissions are kept; a link is a separate act on the same account.
#[tauri::command]
pub async fn member_password_unset(
    app_state: tauri::State<'_, AppState>,
    member_id: String,
) -> Result<Vec<UnreachableWorkspace>, Error> {
    let platform = owner_platform(&app_state).await;
    let mut member = app_state.member.write().await;
    let store = app_state.organization.read().await;
    let (member, store) = signed_in(&mut member, &store)?;
    // the row this act writes back whole carries the session epoch, so it is read after a pull
    // rather than off this machine's last sight of it (effort 826, requirement 22).
    store.pull().await;

    invite::unset_password(
        store,
        member,
        platform.as_ref(),
        &member_id,
        invite::INVITED_KDF,
        timestamp::now(),
    )
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
#[tauri::command]
pub async fn invitation_accept(
    app_state: tauri::State<'_, AppState>,
    link: String,
    code: String,
    password: String,
) -> Result<OrganizationState, Error> {
    let link = JoinLink::decode(&link)?;
    let (store, member) = {
        let mut remote_sync = app_state.remote_sync.write().await;

        join::accept(
            |credential| reached(&app_state, &link, credential),
            remote_sync.store_mut(),
            &link,
            &code,
            &password,
            setup::SHIPPING_KDF,
            timestamp::now(),
        )
        .await?
    };

    // best effort, under the member's own credential now.
    store.pull().await;

    *app_state.organization.write().await = Some(store);
    *app_state.member.write().await = Some(member);

    state_of(&app_state).await
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
#[tauri::command]
pub async fn machine_connect(
    app_state: tauri::State<'_, AppState>,
    link: String,
    code: String,
) -> Result<OrganizationState, Error> {
    let link = JoinLink::decode(&link)?;

    {
        let mut remote_sync = app_state.remote_sync.write().await;

        machine::connect(
            |credential| reached(&app_state, &link, credential),
            remote_sync.store_mut(),
            &link,
            &code,
            setup::SHIPPING_KDF,
            timestamp::now(),
        )
        .await?;
    }

    state_of(&app_state).await
}

/// Every role, highest rank first: the owner's, the manager's, the custom roles in order, and the
/// member's, each with what it carries and how many members hold it (effort 838, requirement 12).
/// Any signed-in member reads it, off the replica; a custom role's name is opened with the content
/// key the session holds, and nothing about a certificate crosses.
#[tauri::command]
pub async fn organization_roles(
    app_state: tauri::State<'_, AppState>,
) -> Result<Vec<RoleFacts>, Error> {
    let mut member = app_state.member.write().await;
    let store = app_state.organization.read().await;
    let (member, store) = signed_in(&mut member, &store)?;

    role::roles(store, member).await
}

/// Make a custom role, named and carrying `mask`, directly below `after_role_id` (effort 838,
/// requirement 4). `manageRoles`, below the actor's rank, and only flags the actor holds.
#[tauri::command]
pub async fn role_create(
    app_state: tauri::State<'_, AppState>,
    name: String,
    mask: i64,
    after_role_id: String,
) -> Result<RoleFacts, Error> {
    let mut member = app_state.member.write().await;
    let store = app_state.organization.read().await;
    let (member, store) = signed_in(&mut member, &store)?;
    // making room can renumber roles somebody holds, whose rows are written back whole and carry
    // the session epoch, so they are read after a pull (effort 826, requirement 22).
    store.pull().await;

    role::create_role(store, member, &name, mask, &after_role_id, timestamp::now()).await
}

/// Rename a custom role. `manageRoles`, below the actor's rank; a built-in role is refused.
#[tauri::command]
pub async fn role_rename(
    app_state: tauri::State<'_, AppState>,
    role_id: String,
    name: String,
) -> Result<RoleFacts, Error> {
    let mut member = app_state.member.write().await;
    let store = app_state.organization.read().await;
    let (member, store) = signed_in(&mut member, &store)?;
    store.pull().await;

    role::rename_role(store, member, &role_id, &name, timestamp::now()).await
}

/// Change what a role carries: the manager's, the member's or a custom role's, never the owner's.
/// `manageRoles`, below the actor's rank, and only flags the actor holds; every holder's
/// certificate is issued again in the same act.
#[tauri::command]
pub async fn role_set_mask(
    app_state: tauri::State<'_, AppState>,
    role_id: String,
    mask: i64,
) -> Result<RoleFacts, Error> {
    let mut member = app_state.member.write().await;
    let store = app_state.organization.read().await;
    let (member, store) = signed_in(&mut member, &store)?;
    // every holder's row is written back whole, and it carries the session epoch.
    store.pull().await;

    role::set_role_mask(store, member, &role_id, mask, timestamp::now()).await
}

/// Move a custom role to directly below `after_role_id`. `manageRoles`, and both the role and the
/// place it moves to below the actor's rank; every holder of a role whose rank moved is issued a
/// certificate carrying the new one.
#[tauri::command]
pub async fn role_move(
    app_state: tauri::State<'_, AppState>,
    role_id: String,
    after_role_id: String,
) -> Result<RoleFacts, Error> {
    let mut member = app_state.member.write().await;
    let store = app_state.organization.read().await;
    let (member, store) = signed_in(&mut member, &store)?;
    store.pull().await;

    role::move_role(store, member, &role_id, &after_role_id, timestamp::now()).await
}

/// Delete a custom role; everybody who held it holds the member role from here on. `manageRoles`,
/// below the actor's rank, and only flags the actor holds, over what moving the holders changes.
#[tauri::command]
pub async fn role_delete(
    app_state: tauri::State<'_, AppState>,
    role_id: String,
) -> Result<(), Error> {
    let mut member = app_state.member.write().await;
    let store = app_state.organization.read().await;
    let (member, store) = signed_in(&mut member, &store)?;
    store.pull().await;

    role::delete_role(store, member, &role_id, timestamp::now()).await
}

/// Give a member a role (effort 838, requirement 5): their row names it, re-signed, and their
/// certificate is issued again from the actor's in the same act, so a flag that signs rows is in
/// force on the next sync with the owner's machine off (requirement 9). `assignRole`, the member
/// and the role both below the actor's rank, never the actor's own row, only flags the actor
/// holds; the owner's role is not assigned. What comes back is the member as the list shows them.
/// *It was `member_change_role`, which wrote a role's word and seven acts, until effort 838.*
#[tauri::command]
pub async fn member_assign_role(
    app_state: tauri::State<'_, AppState>,
    member_id: String,
    role_id: String,
) -> Result<MemberFacts, Error> {
    let mut member = app_state.member.write().await;
    let store = app_state.organization.read().await;
    let (member, store) = signed_in(&mut member, &store)?;
    // the row this act writes back whole carries the session epoch, so it is read after a pull
    // rather than off this machine's last sight of it (effort 826, requirement 22).
    store.pull().await;

    role::assign_role(store, member, &member_id, &role_id, timestamp::now()).await
}

/// Set a member's override, the flags switched for them alone (effort 838, requirement 6);
/// `overrideMask` on the wire, for the reason `member_create` gives. `overrideMember`, the member
/// below the actor's rank, never the actor's own row, only flags the actor holds; the owner's row
/// carries none.
#[tauri::command]
pub async fn member_set_override(
    app_state: tauri::State<'_, AppState>,
    member_id: String,
    override_mask: i64,
) -> Result<MemberFacts, Error> {
    let mut member = app_state.member.write().await;
    let store = app_state.organization.read().await;
    let (member, store) = signed_in(&mut member, &store)?;
    store.pull().await;

    role::set_override(store, member, &member_id, override_mask, timestamp::now()).await
}

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
#[tauri::command]
pub async fn member_offer_ownership(
    app_state: tauri::State<'_, AppState>,
    member_id: String,
    password: String,
) -> Result<MemberFacts, Error> {
    let mut member = app_state.member.write().await;
    let store = app_state.organization.read().await;
    let (member, store) = signed_in(&mut member, &store)?;
    // the row this act writes back whole carries the session epoch, so it is read after a pull
    // rather than off this machine's last sight of it (effort 826, requirement 22).
    store.pull().await;

    role::offer_ownership(store, member, &member_id, &password, timestamp::now()).await
}

/// Take the offer back (effort 828, requirement 22).
///
/// The owner's, and it asks for no password: nothing is unsealed and what is being undone is
/// something this person did. Whether an offer stands at all is Rust's to answer, and the refusal
/// where none does is the sentence the members section shows.
#[tauri::command]
pub async fn member_withdraw_offer(app_state: tauri::State<'_, AppState>) -> Result<(), Error> {
    let mut member = app_state.member.write().await;
    let store = app_state.organization.read().await;
    let (member, store) = signed_in(&mut member, &store)?;

    store.pull().await;

    role::withdraw_offer(store, member, timestamp::now()).await
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
#[tauri::command]
pub async fn ownership_accept(
    app_state: tauri::State<'_, AppState>,
    password: String,
) -> Result<OrganizationState, Error> {
    {
        let mut member = app_state.member.write().await;
        let store = app_state.organization.read().await;
        let (member, store) = signed_in(&mut member, &store)?;
        // the rows this act writes back whole carry the session epoch, so they are read after a
        // pull rather than off this machine's last sight of them (effort 826, requirement 22).
        store.pull().await;

        let mut remote_sync = app_state.remote_sync.write().await;

        role::accept_ownership(
            store,
            member,
            remote_sync.store_mut(),
            &password,
            timestamp::now(),
        )
        .await?;
    }

    state_of(&app_state).await
}

/// Rename a member: their row written back with the username re-sealed and signed by whoever
/// renamed them. The owner's or an administrator's, on any row but their own; the username is
/// held to the same rules and the same uniqueness as an invitation's. What comes back is the
/// member as the list shows them.
#[tauri::command]
pub async fn member_rename(
    app_state: tauri::State<'_, AppState>,
    member_id: String,
    username: String,
) -> Result<MemberFacts, Error> {
    let mut member = app_state.member.write().await;
    let store = app_state.organization.read().await;
    let (member, store) = signed_in(&mut member, &store)?;
    // the row this act writes back whole carries the session epoch, so it is read after a pull
    // rather than off this machine's last sight of it (effort 826, requirement 22).
    store.pull().await;

    invite::rename_member(store, member, &member_id, &username, timestamp::now()).await
}

/// The organization's mark, a signature or a seal, opened for the pages it is printed on and the
/// settings it is set in; nothing where none is set. Any signed-in member reads it, from the
/// replica, offline included.
#[tauri::command]
pub async fn organization_mark_get(
    app_state: tauri::State<'_, AppState>,
) -> Result<Option<mark::MarkFacts>, Error> {
    let mut member = app_state.member.write().await;
    let store = app_state.organization.read().await;
    let (member, store) = signed_in(&mut member, &store)?;

    mark::read_mark(store, member).await
}

/// Keep the image at `path`, which the open dialog chose, as the organization's mark. It is read
/// here rather than handed over, checked by its bytes, sealed, written and sent; whoever carries
/// `manageMark` does it.
#[tauri::command]
pub async fn organization_mark_set(
    app_state: tauri::State<'_, AppState>,
    path: String,
) -> Result<mark::MarkFacts, Error> {
    let unreadable = |error: std::io::Error| Error::Io {
        message: format!("could not read {path}: {error}"),
    };

    // the size first, so a file far past the limit is refused without being read into memory.
    mark::check_length(tokio::fs::metadata(&path).await.map_err(unreadable)?.len())?;

    let image = tokio::fs::read(&path).await.map_err(unreadable)?;
    let mut member = app_state.member.write().await;
    let store = app_state.organization.read().await;
    let (member, store) = signed_in(&mut member, &store)?;

    mark::set_mark(store, member, &image, timestamp::now()).await
}

/// Remove the organization's mark; whoever carries `manageMark` does it.
#[tauri::command]
pub async fn organization_mark_clear(app_state: tauri::State<'_, AppState>) -> Result<(), Error> {
    let mut member = app_state.member.write().await;
    let store = app_state.organization.read().await;
    let (member, store) = signed_in(&mut member, &store)?;

    mark::clear_mark(store, member).await
}

/// Sign this member out of every machine but the one they are at (effort 826, requirement 22).
///
/// **They stay signed in here**, and nothing asks for their password: the row's session epoch
/// moves on, this machine's session and its remembered key move with it, and every other machine
/// is behind. One with the application open meets the wall at its next sync heartbeat; one that
/// is closed meets it at its next launch.
///
/// **What comes back says whether the bump went out.** A push that could not go leaves the other
/// machines open until one does, and the account section says so rather than reporting the act done.
#[tauri::command]
pub async fn organization_session_end_elsewhere(
    app_state: tauri::State<'_, AppState>,
) -> Result<SessionsEnded, Error> {
    let mut member = app_state.member.write().await;
    let store = app_state.organization.read().await;
    let (member, store) = signed_in(&mut member, &store)?;

    // before the bump, as `invitation_accept` pulls before it admits: the new number is one past
    // the row's, and a row this machine has not refreshed since somebody else's sign-out is a
    // number already reached, which would write nothing and report the sessions ended. A pull
    // that could not go is the offline case and leaves the row as it stands.
    store.pull().await;

    Ok(SessionsEnded {
        sent: session::end_elsewhere(store, member, timestamp::now()).await?,
    })
}

/// Sign a member out of every machine, from their row: the owner's, and any holder of
/// `resetPassword` (effort 826, requirement 22).
///
/// **Their password is not changed by it.** What ends is the sessions and the keys the machines
/// they signed in on were staying signed in with; the password they know still opens their vault.
/// The caller's own row is refused, because that is `organization_session_end_elsewhere` and
/// keeps this machine in, and the owner's is refused to anybody but the owner.
#[tauri::command]
pub async fn member_end_sessions(
    app_state: tauri::State<'_, AppState>,
    member_id: String,
) -> Result<SessionsEnded, Error> {
    let mut member = app_state.member.write().await;
    let store = app_state.organization.read().await;
    let (member, store) = signed_in(&mut member, &store)?;

    // for the reason `organization_session_end_elsewhere` gives: the number written is one past
    // the row's, so the row has to be the organization's rather than this machine's last sight
    // of it.
    store.pull().await;

    Ok(SessionsEnded {
        sent: session::end_member_sessions(store, member, &member_id, timestamp::now()).await?,
    })
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

    // the same gate the lock-out itself stands behind: the interface asks this before offering
    // the act, and every command refuses again on the row rather than trusting the screen.
    member.settled()?;
    crate::organization::permission::require(
        session::permissions_on_row(store, member).await?,
        crate::organization::permission::Administration::RemoveMember,
    )?;

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
    // the row this act writes back whole carries the session epoch, so it is read after a pull
    // rather than off this machine's last sight of it (effort 826, requirement 22).
    store.pull().await;
    let organization_database = format!("org-{}", member.organization_id);

    let removed = removal::remove_member(
        store,
        member,
        platform.as_ref(),
        &organization_database,
        &member_id,
        lock_out.unwrap_or(false),
        timestamp::now(),
    )
    .await?;

    // a lock-out rotated the workspaces the member held, this one among them where the owner has
    // it open, and the owner's session already carries the fresh credential: the engine is told,
    // since `reconnect` finds nothing moved between the rows and this session.
    hold_renewed_token(&app_state, member).await;

    Ok(removed)
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

    let mut remote_sync = app_state.remote_sync.write().await;
    let current = remote_sync.workspace();

    // the engine's own token is compared as well as the rows: a renewal or a lock-out made on
    // this machine wrote the session and not the engine, so the rows and the session agree while
    // the engine is still on the credential that was rotated away.
    let engine_behind = current
        .remote_id
        .as_deref()
        .and_then(|remote_id| member.workspace_credentials.get(remote_id))
        .is_some_and(|held| remote_sync.workspace_token().as_deref() != Some(held.token.as_str()));

    if !moved && !engine_behind {
        return false;
    }

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

        remote_sync.workspace().remote_id.ok_or_else(|| {
            Error::refused(
                RefusalReason::NoWorkspaceOpen,
                "no workspace is open on this machine",
            )
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
///
/// **The owner is the owner's verified row**, asked for `tursoAccount` (effort 838, requirement
/// 2), and not the role the session opened with: a founder whose session is still open after
/// handing the organization over is a manager, and reads nothing here.
#[tauri::command]
pub async fn organization_account_refusal_detail(
    app_state: tauri::State<'_, AppState>,
) -> Result<Option<String>, Error> {
    let member = app_state.member.read().await;
    let organization = app_state.organization.read().await;

    let (Some(member), Some(store)) = (member.as_ref(), organization.as_ref()) else {
        return Ok(None);
    };

    if workspace::require_owner(
        store,
        member,
        super::permission::Flag::TursoAccount,
        "only the owner reads what turso said about the account",
    )
    .await
    .is_err()
    {
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

    state_of(&app_state).await
}

/// Every member, for the members list: names opened with the content key the session holds and the
/// workspaces each holds with their access. *There was a second command answering the invitations
/// until effort 826, which folded the unspent one into the row; effort 828 dropped it again, since
/// nothing read it.*
#[tauri::command]
pub async fn organization_members(
    app_state: tauri::State<'_, AppState>,
) -> Result<Vec<MemberFacts>, Error> {
    let mut member = app_state.member.write().await;
    let store = app_state.organization.read().await;
    let (member, store) = signed_in(&mut member, &store)?;

    invite::members(store, member).await
}

/// Where each account stands, for the line the directory draws under a name (effort 828,
/// requirement 19): whether it has a password of its own yet, and whether a machine is signed in
/// on it inside the presence window.
///
/// **Beside the members rather than on them**, because the two halves come from two places: the
/// password is on the signed member row and the machine is on the unsigned register every machine
/// writes for itself. Asked apart, a list of people is still a list of people when the register
/// says nothing, and the directory joins the two on the member's id.
#[tauri::command]
pub async fn organization_member_standings(
    app_state: tauri::State<'_, AppState>,
) -> Result<Vec<MemberStanding>, Error> {
    let mut member = app_state.member.write().await;
    let store = app_state.organization.read().await;
    let (member, store) = signed_in(&mut member, &store)?;

    invite::standings(store, member, timestamp::now()).await
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

/// Read a link: which organization it names, which kind of link it is, and when it lapses.
///
/// **A decode and nothing else** (effort 828, requirement 1). Nothing is reached and no row is
/// read, because there is no credential to read one with until somebody types the code; where the
/// invitation behind a link stands is judged inside `invitation_accept`, which has one. What
/// crosses back is what the text says; the credential and the secret stay on this side
/// ([[rules/credentials]]). *It was `organization_link_inspect`, which opened the replica with the
/// link's clear credential before the person had given anything.*
#[tauri::command]
pub fn organization_link_read(link: String) -> Result<LinkShape, Error> {
    link::read(&link)
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
            return Err(Error::refused(
                RefusalReason::GroupEmpty,
                "the consent was granted over a group with no database in it, and the                           organization is not there. grant it over the group that holds the                           organization",
            ));
        }
    }

    state_of(&app_state).await
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
    link: &JoinLink,
    credential: CredentialSlot,
) -> Result<OrganizationStore, Error> {
    let database_path = {
        let settings = app_state.settings.read().await;

        settings.database_path.clone()
    };
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

    Ok(store)
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use serde_json::json;
    use tokio::sync::RwLock;

    use super::{open_replica, sign_out, state_of};
    use crate::{
        database::Database,
        error::Error,
        keyring::{self, CredentialStoreTurn, refuse_the_next_store, take_the_credential_store},
        organization::{
            authority::VERIFYING_KEY_BYTES,
            forget, invite, join,
            link::JoinLink,
            permission, removal, role, session,
            session::{CredentialSlot, MEMBER_KEY_SERVICE, read_entry, verifying_key_of},
            setup::{CreateOrganization, Remote, create_organization},
            store::OrganizationStore,
            vault::{KdfParams, open_sealed_secret_key},
        },
        persisted::Persisted,
        settings::Settings,
        state::AppState,
        sync::{
            RemoteSync, RemoteSyncStore,
            test::server::{ScriptedResponse, ScriptedServer},
            turso::{consent::TursoConsent, discovery::McpEndpoint, platform::InMemoryPlatform},
        },
        update::Update,
    };

    const PASSWORD: &str = "the owners password";
    const USERNAME: &str = "olivia";
    const CREATED_AT: i64 = 1_757_000_000_000;

    fn test_cost() -> KdfParams {
        KdfParams {
            memory_kib: 1024,
            iterations: 2,
            lanes: 1,
        }
    }

    fn scratch(name: &str) -> std::path::PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|elapsed| elapsed.as_nanos())
            .unwrap_or_default();
        let directory = std::env::temp_dir().join(format!("rentable-command-{name}-{nanos:x}"));
        std::fs::create_dir_all(&directory).expect("scratch directory");

        directory
    }

    /// The whole of the application state over one data directory, as `lib.rs` builds it, with
    /// nothing open and nobody in. *`forget.rs` and `join.rs` keep the same builder; a fixture is
    /// written out per module ([[rules/testing]]).*
    async fn state_over(directory: &std::path::Path) -> AppState {
        let mut settings =
            Persisted::<Settings>::load(directory.join(Settings::FILENAME)).expect("the settings");
        settings.database_path = directory.join(Database::FILENAME);
        settings.recovery_path = directory.join(Update::FILENAME);
        settings.commit().expect("the settings");

        let settings = Arc::new(RwLock::new(settings));
        let remote_sync = RemoteSync::new(settings.clone(), directory.join(RemoteSync::FILENAME))
            .await
            .expect("the sync record");
        let update = Update::new(settings.clone()).await.expect("the update");

        AppState {
            db: Arc::new(RwLock::new(Database::new(settings.clone()))),
            settings,
            remote_sync: Arc::new(RwLock::new(remote_sync)),
            update: Arc::new(RwLock::new(update)),
            consent: Arc::new(TursoConsent::new()),
            organization: Arc::new(RwLock::new(None)),
            member: Arc::new(RwLock::new(None)),
            arriving_link: Arc::new(Mutex::new(None)),
            signed_out_elsewhere: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            old_shape_check: tokio::sync::OnceCell::new(),
        }
    }

    /// A machine that has run the first run: an organization on it, the owner's row recorded, and
    /// the owner's member key filed, which is what every launch after it starts from. Nobody is
    /// signed in here, because a launch is a fresh process.
    async fn first_run(directory: &std::path::Path) -> AppState {
        let app_state = state_over(directory).await;
        let mcp = ScriptedServer::start(vec![
            ScriptedResponse::new(
                200,
                json!({ "jsonrpc": "2.0", "id": 1, "result": {} }).to_string(),
            ),
            ScriptedResponse::new(
                200,
                json!({
                    "jsonrpc": "2.0",
                    "id": 3,
                    "result": { "content": [{ "type": "text", "text": json!([{
                        "Name": "ledger",
                        "hostname": "ledger-an-org.aws-eu-west-1.turso.io",
                        "group": "rentable"
                    }]).to_string() }] }
                })
                .to_string(),
            ),
        ])
        .await;
        let platform = Arc::new(InMemoryPlatform::new("an-org"));

        {
            let mut remote_sync = app_state.remote_sync.write().await;

            create_organization(
                remote_sync.store_mut(),
                "a-platform-token",
                &McpEndpoint::at(&mcp.url("")),
                |_| Arc::clone(&platform),
                Remote::none(),
                &directory.join(Database::FILENAME),
                CreateOrganization {
                    name: "Acme",
                    username: USERNAME,
                    password: PASSWORD,
                    group: None,
                },
                test_cost(),
                CREATED_AT,
            )
            .await
            .expect("the first run failed");
        }

        app_state
    }

    /// An empty credential slot, for a store opened against no remote.
    fn slot() -> CredentialSlot {
        Arc::new(Mutex::new(None))
    }

    /// What the record names: the organization and the member, which is what an entry is keyed on.
    async fn recorded(app_state: &AppState) -> (String, String) {
        let mut remote_sync = app_state.remote_sync.write().await;
        let held = remote_sync
            .store_mut()
            .organization
            .clone()
            .expect("the record names no organization");

        (held.id, held.member_id.expect("the record names no member"))
    }

    /// What is filed under a member's entry, or nothing where nothing is.
    fn filed(organization_id: &str, member_id: &str) -> Option<String> {
        keyring::read(
            MEMBER_KEY_SERVICE,
            &format!("{organization_id}:{member_id}"),
        )
        .expect("the store would not answer")
    }

    /// A test's turn on the credential store, taken once at the top: the fake is one map for
    /// every service, and a test that takes the turn twice deadlocks (`keyring.rs`).
    async fn a_turn() -> CredentialStoreTurn {
        take_the_credential_store().await
    }

    /// **Criterion 2.** The record names a member, the `member` slot is empty, and the key that
    /// opens their vault is filed: the first state read of the launch opens it and answers with a
    /// session, so nothing ever draws the wall.
    #[tokio::test]
    async fn the_first_state_read_of_a_launch_resumes_the_remembered_session() {
        let _turn = a_turn().await;
        let directory = scratch("resume");
        let app_state = first_run(&directory).await;
        let (organization_id, member_id) = recorded(&app_state).await;

        assert!(
            filed(&organization_id, &member_id).is_some(),
            "the first run filed no member key"
        );
        assert!(
            app_state.member.read().await.is_none(),
            "a launch starts with nobody in"
        );

        let state = state_of(&app_state).await.expect("the state");
        let session = state.session.expect("the launch did not resume");

        assert_eq!(session.member_id, member_id);
        assert_eq!(session.username, USERNAME);
        assert_eq!(session.role, "owner");
        assert!(
            app_state.member.read().await.is_some(),
            "the session was answered with and not held"
        );
        assert!(
            app_state.organization.read().await.is_some(),
            "the replica was not held open"
        );
    }

    /// Everything the replica on disk holds, table by table and row by row, read through a store
    /// opened on the file with no remote and let go of again: a write anywhere changes it.
    async fn contents(path: &std::path::Path) -> Vec<(String, Vec<Vec<turso::Value>>)> {
        let store = OrganizationStore::open(path, None, || async {
            Ok::<String, turso::Error>(String::new())
        })
        .await
        .expect("the replica");
        let mut contents = Vec::new();

        for table in store.tables().await.expect("the tables") {
            let mut rows = store
                .connection()
                .query(&format!("SELECT * FROM \"{table}\" ORDER BY rowid"), ())
                .await
                .expect("the rows");
            let mut values = Vec::new();

            while let Some(row) = rows.next().await.expect("a row") {
                values.push(
                    (0..row.column_count())
                        .map(|index| row.get_value(index).expect("a value"))
                        .collect(),
                );
            }

            contents.push((table, values));
        }

        contents
    }

    /// Effort 838, requirement 11 and criterion 11, at the launch: **a held replica of another
    /// format is refused by name, and nothing is written to it.**
    ///
    /// The machine ran the first run and stayed signed in, so the launch would resume; then the
    /// organization's format moved under it. A newer format is format 3. An older one is the
    /// `format` row gone from a table that is still there, which is the one way this build's own
    /// organization comes to read as an earlier version's; a replica with no `format` table at all
    /// is today's shape, which the launch forgets before anything opens it (`forget.rs`, and the
    /// last case here).
    ///
    /// Each of the first two: the launch leaves the wall up with no session and the organization
    /// still held, the replica the resume and the sign-in both open through refuses with its own
    /// reason, and the replica holds exactly what it held before, no registry row and no table
    /// gained.
    #[tokio::test]
    async fn a_held_replica_of_another_format_is_refused_at_the_launch_and_nothing_is_written() {
        let _turn = a_turn().await;

        for (name, change, reason) in [
            (
                "older",
                "DELETE FROM \"format\"",
                crate::error::RefusalReason::OrganizationOlder,
            ),
            (
                "newer",
                "UPDATE \"format\" SET \"version\" = 3",
                crate::error::RefusalReason::OrganizationNewer,
            ),
        ] {
            let directory = scratch(&format!("format-{name}"));
            let app_state = first_run(&directory).await;
            let (organization_id, _) = recorded(&app_state).await;
            let replica = OrganizationStore::replica_path(
                &directory.join(Database::FILENAME),
                &organization_id,
            );

            {
                let store = OrganizationStore::open(&replica, None, || async {
                    Ok::<String, turso::Error>(String::new())
                })
                .await
                .expect("the replica");

                store
                    .connection()
                    .execute(change, ())
                    .await
                    .expect("the organization of another format");
            }

            let before = contents(&replica).await;
            let state = state_of(&app_state).await.expect("the state");

            assert!(
                state.session.is_none(),
                "{name}: the launch resumed into an organization of another format"
            );
            assert_eq!(
                state.organization.map(|held| held.id),
                Some(organization_id.clone()),
                "{name}: the launch forgot an organization it should refuse"
            );
            assert!(app_state.organization.read().await.is_none());

            let held = {
                let mut remote_sync = app_state.remote_sync.write().await;

                remote_sync
                    .store_mut()
                    .organization
                    .clone()
                    .expect("the record")
            };
            let refused = open_replica(&app_state, &held).await.map(|_| ());

            assert!(
                matches!(refused, Err(Error::Refused { reason: refusal, .. }) if refusal == reason),
                "{name}: {refused:?}"
            );
            assert_eq!(
                contents(&replica).await,
                before,
                "{name}: the launch wrote to the organization"
            );
        }

        // today's shape, no `format` table at all: the launch forgets it before anything opens it,
        // so it never meets the reader above. The connect that follows is where the person is told.
        let directory = scratch("format-today");
        let app_state = first_run(&directory).await;
        let (organization_id, _) = recorded(&app_state).await;
        let replica =
            OrganizationStore::replica_path(&directory.join(Database::FILENAME), &organization_id);

        {
            let store = OrganizationStore::open(&replica, None, || async {
                Ok::<String, turso::Error>(String::new())
            })
            .await
            .expect("the replica");

            store
                .connection()
                .execute("DROP TABLE \"format\"", ())
                .await
                .expect("today's shape");
        }

        let state = state_of(&app_state).await.expect("the state");

        assert!(state.session.is_none());
        assert!(
            state.organization.is_none(),
            "a replica of today's shape was not forgotten"
        );
        assert!(
            !replica.exists(),
            "the replica of today's shape is still on disk"
        );
    }

    /// **Criterion 22, the heartbeat.** A member is signed in on this machine; on another machine
    /// they end every other session. One call of the check the sync heartbeat makes, and this
    /// machine holds no session, no replica and no remembered key, and says on the state that it
    /// was signed out from another machine.
    ///
    /// The other machine is a second store over the same replica, which is what two machines are
    /// to each other once a push and a pull have run between them; there is no remote here, so the
    /// file is what they share.
    #[tokio::test]
    async fn a_session_ended_from_another_machine_is_gone_after_one_heartbeat() {
        let _turn = a_turn().await;
        let directory = scratch("heartbeat");
        let app_state = first_run(&directory).await;
        let (organization_id, member_id) = recorded(&app_state).await;

        let state = state_of(&app_state).await.expect("the state");

        assert!(state.session.is_some(), "the launch did not resume");
        assert!(!state.signed_out_elsewhere);

        // the other machine, signed in as the same member, ending every other session.
        let held = {
            let mut remote_sync = app_state.remote_sync.write().await;

            remote_sync
                .store_mut()
                .organization
                .clone()
                .expect("the record names no organization")
        };
        let elsewhere = OrganizationStore::open(
            &OrganizationStore::replica_path(&directory.join(Database::FILENAME), &organization_id),
            None,
            || async { Ok::<String, turso::Error>(String::new()) },
        )
        .await
        .expect("the other machine's replica");
        let mut theirs = session::sign_in(&elsewhere, &held, PASSWORD, &slot())
            .await
            .expect("the other machine did not sign in");

        session::end_elsewhere(&elsewhere, &mut theirs, CREATED_AT + 1)
            .await
            .expect("ending the other sessions failed");

        // one heartbeat on this machine.
        assert!(
            super::ended_elsewhere(&app_state).await,
            "the heartbeat did not read the row as moved on"
        );
        assert!(
            app_state.member.read().await.is_none(),
            "the session outlived the sign-out"
        );
        assert!(
            app_state.organization.read().await.is_none(),
            "the replica was still held open"
        );
        assert_eq!(
            filed(&organization_id, &member_id),
            None,
            "the remembered key outlived the sign-out"
        );

        let state = state_of(&app_state).await.expect("the state");

        assert!(state.session.is_none());
        assert!(
            state.signed_out_elsewhere,
            "the wall was not told which sign-out this was"
        );
        assert_eq!(
            state.organization.map(|held| held.id),
            Some(organization_id),
            "the machine forgot the organization as well as the session"
        );

        // and a heartbeat on a machine with nobody in reads nothing and says nothing.
        assert!(!super::ended_elsewhere(&app_state).await);
    }

    /// The wall, which is what every failure to resume comes to. Nothing filed is the plainest of
    /// them, and it is the state a machine that has signed out is in.
    #[tokio::test]
    async fn a_launch_with_nothing_filed_leaves_the_wall_up() {
        let _turn = a_turn().await;
        let directory = scratch("nothing");
        let app_state = first_run(&directory).await;
        let (organization_id, member_id) = recorded(&app_state).await;

        keyring::forget(
            MEMBER_KEY_SERVICE,
            &format!("{organization_id}:{member_id}"),
        )
        .expect("the store would not forget");

        let state = state_of(&app_state).await.expect("the state");

        assert!(state.session.is_none(), "a launch with no key signed in");
        assert!(
            state.organization.is_some(),
            "the machine forgot what it holds"
        );
        assert!(app_state.member.read().await.is_none());
    }

    /// **Criterion 1, the sign-out half.** The keys go and so does the entry, so the next launch
    /// puts the wall up rather than letting the machine back in behind the person's back.
    #[tokio::test]
    async fn a_sign_out_forgets_the_key_and_the_next_launch_shows_the_wall() {
        let _turn = a_turn().await;
        let directory = scratch("signout");
        let app_state = first_run(&directory).await;
        let (organization_id, member_id) = recorded(&app_state).await;

        state_of(&app_state)
            .await
            .expect("the state")
            .session
            .expect("the launch did not resume");

        sign_out(&app_state).await;

        assert_eq!(
            filed(&organization_id, &member_id),
            None,
            "the sign-out left the key in the store"
        );

        // the next launch: a fresh process over the same data directory.
        let next = state_over(&directory).await;
        let state = state_of(&next).await.expect("the state");

        assert!(state.session.is_none(), "the wall did not come back up");
        assert_eq!(
            state.organization.map(|held| held.member_id),
            Some(Some(member_id)),
            "the record forgot the member a sign-out keeps"
        );
    }

    /// **Criterion 1, the disconnect half.** A machine that has let go of the organization holds
    /// no key to a vault in it either. The forget signs out first, which is where the entry goes.
    #[tokio::test]
    async fn a_disconnect_forgets_the_key_with_everything_else() {
        let _turn = a_turn().await;
        let directory = scratch("disconnect");
        let app_state = first_run(&directory).await;
        let (organization_id, member_id) = recorded(&app_state).await;

        state_of(&app_state).await.expect("the state");
        forget::forget(&app_state).await.expect("the forget failed");

        assert_eq!(
            filed(&organization_id, &member_id),
            None,
            "the disconnect left the key in the store"
        );
    }

    /// **Criterion 2, the refusal half.** A locked keychain, or a machine with no secret service:
    /// the first run succeeds, nothing is filed, and the next launch asks for a password. Never a
    /// failure surface.
    #[tokio::test]
    async fn a_store_that_refuses_the_key_does_not_fail_the_first_run() {
        let _turn = a_turn().await;
        let directory = scratch("refused");

        refuse_the_next_store();

        let app_state = first_run(&directory).await;
        let (organization_id, member_id) = recorded(&app_state).await;

        assert_eq!(
            filed(&organization_id, &member_id),
            None,
            "the store took a value it was told to refuse"
        );

        let state = state_of(&app_state).await.expect("the state");

        assert!(state.organization.is_some(), "the first run did not finish");
        assert!(state.session.is_none(), "a launch with no key signed in");
    }

    /// **Criterion 3.** Neither the password nor the key it derives reaches anything this machine
    /// wrote: not the record, and not a replica. The key is in the credential store, which is the
    /// whole reason it is filed there, and the sweep reads every file the data directory holds
    /// rather than the ones it expects to find.
    #[tokio::test]
    async fn neither_the_password_nor_the_member_key_reaches_a_file_this_machine_wrote() {
        let _turn = a_turn().await;
        let directory = scratch("secrecy");
        let app_state = first_run(&directory).await;
        let (organization_id, member_id) = recorded(&app_state).await;

        // the sign-in at the wall, which is what `organization_sign_in` performs: the replica is
        // opened, the password is tried, and the record is written back naming the member.
        let held = {
            let mut remote_sync = app_state.remote_sync.write().await;

            remote_sync
                .store_mut()
                .organization
                .clone()
                .expect("the record")
        };
        let (store, credential) = open_replica(&app_state, &held).await.expect("the replica");
        let session = {
            let mut remote_sync = app_state.remote_sync.write().await;

            join::admit(
                &store,
                remote_sync.store_mut(),
                &held,
                USERNAME,
                PASSWORD,
                &credential,
                crate::timestamp::now(),
            )
            .await
            .expect("the sign-in failed")
        };

        assert_eq!(session.member_id, member_id);

        let encoded = filed(&organization_id, &member_id).expect("the sign-in filed no key");
        let (epoch, key) =
            read_entry(&encoded).expect("what was filed is not a remembered session");
        let bytes = {
            use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD as BASE64URL};

            BASE64URL
                .decode(key.encode())
                .expect("what was filed is not base64url")
        };

        assert_eq!(
            epoch, 0,
            "the entry files the session epoch in front of the key"
        );

        assert_eq!(
            bytes.len(),
            32,
            "what was filed is not a member key's width"
        );

        // and it is the key that opens this member's vault rather than any other value.
        let members = store
            .members(&verifying_key_of(&held).expect("the key"))
            .await
            .expect("the members");
        let member = members
            .iter()
            .find(|member| member.id == member_id)
            .expect("the member row");

        assert_eq!(
            open_sealed_secret_key(&key, &member.vault)
                .expect("the filed key did not open the vault")
                .public_key(),
            member.vault.public_key
        );

        // the sweep: every file under the data directory, the record included, read as bytes.
        let secrets: [&[u8]; 3] = [PASSWORD.as_bytes(), encoded.as_bytes(), &bytes];
        let mut swept = 0;

        for entry in std::fs::read_dir(&directory).expect("the data directory") {
            let path = entry.expect("an entry").path();

            if !path.is_file() {
                continue;
            }

            let written = std::fs::read(&path).expect("the file");

            swept += 1;

            for secret in secrets {
                assert!(
                    !written.windows(secret.len()).any(|window| window == secret),
                    "a secret is legible in {}",
                    path.display()
                );
            }
        }

        assert!(swept > 1, "the sweep read almost nothing: {swept} files");
        assert!(
            directory.join(RemoteSync::FILENAME).is_file(),
            "the record was not among the files the sweep read"
        );
    }

    /// **The heartbeat pushes as well as pulls**, which is what carries out a sign-out made
    /// offline.
    ///
    /// `end_elsewhere` writes the new number on this machine's replica and pushes; a push that
    /// could not go leaves it there, and no other scheduled path pushes the organization replica.
    /// So without this the person is told their other machines are signed out and they stay open
    /// until that member happens to make another organization write, which a plain member almost
    /// never does.
    ///
    /// Read on the wire rather than through a stand-in: the replica is reopened against a server
    /// that answers nothing, so what the two calls put on it is what this asserts on. The pull is
    /// `POST /pull-updates` and the push is not, which is the whole of what is being distinguished.
    #[tokio::test]
    async fn the_heartbeat_pushes_the_organization_replica_after_its_pull() {
        let _turn = a_turn().await;
        let directory = scratch("heartbeat-push");
        let app_state = first_run(&directory).await;
        let (organization_id, _) = recorded(&app_state).await;

        assert!(
            state_of(&app_state)
                .await
                .expect("the state")
                .session
                .is_some(),
            "the launch did not resume"
        );

        // the same replica, reopened against a remote that answers nothing. The engine the resume
        // opened is let go of first: one file, one engine.
        let server =
            ScriptedServer::start((0..8).map(|_| ScriptedResponse::hangup()).collect()).await;
        {
            let mut organization = app_state.organization.write().await;

            *organization = None;
            *organization = Some(
                OrganizationStore::open(
                    &OrganizationStore::replica_path(
                        &directory.join(Database::FILENAME),
                        &organization_id,
                    ),
                    Some(server.url("")),
                    || async { Ok::<String, turso::Error>("a-credential".to_string()) },
                )
                .await
                .expect("the replica did not reopen against the remote"),
            );
        }

        assert_eq!(
            server.request_count(),
            0,
            "something reached the remote early"
        );

        // one heartbeat. Nobody ended anything, so the answer is that the session stands; what is
        // under test is what it did on the way to that answer.
        assert!(!super::ended_elsewhere(&app_state).await);
        assert!(
            server.request_count() >= 2,
            "the heartbeat made {} request(s); a pull and a push are two",
            server.request_count()
        );
        assert_eq!(
            server.request(0).target,
            "/pull-updates",
            "the heartbeat's first call to the remote is not the pull"
        );
        assert_ne!(
            server.request(1).target,
            "/pull-updates",
            "the heartbeat pulled twice and pushed nothing"
        );
    }
    // -------------------------------------------------------------------------------------
    // Effort 828, requirement 22: the handover holds at its seams.
    // -------------------------------------------------------------------------------------

    /// What the settled administrator chose when they opened their link, which is the password
    /// that becomes the organization's key when they accept it.
    const ADMINISTRATORS_PASSWORD: &str = "the administrators password";

    /// A verifying key as a machine's record spells it.
    fn encoded(key: [u8; VERIFYING_KEY_BYTES]) -> String {
        base64::Engine::encode(&base64::engine::general_purpose::URL_SAFE_NO_PAD, key)
    }

    /// The organization's replica opened a second time over the same file: another machine, as
    /// far as the rows go, once a push and a pull have run between them. There is no remote here,
    /// so the file is what they share, and what one writes the other reads at once.
    async fn elsewhere(directory: &std::path::Path, organization_id: &str) -> OrganizationStore {
        OrganizationStore::open(
            &OrganizationStore::replica_path(&directory.join(Database::FILENAME), organization_id),
            None,
            || async { Ok::<String, turso::Error>(String::new()) },
        )
        .await
        .expect("the other machine's replica")
    }

    /// An administrator who opened their link on a machine of their own and chose a password:
    /// the standing an offer of the organization needs. *`role.rs` keeps the same fixture; one is
    /// written out per module ([[rules/testing]]).*
    async fn a_settled_administrator(
        directory: &std::path::Path,
        store: &OrganizationStore,
        owner: &session::MemberSession,
        username: &'static str,
        password: &str,
    ) -> (String, session::MemberSession, Persisted<RemoteSyncStore>) {
        let link = invite::locator(store, owner)
            .await
            .expect("the organization's locator");
        let invited = invite::make_account_and_link(
            store,
            owner,
            None::<&InMemoryPlatform>,
            &link,
            invite::Invitation {
                username,
                role: permission::ADMINISTRATOR,
                workspaces: &[],
            },
            test_cost(),
            CREATED_AT,
        )
        .await
        .expect("the invitation failed");
        let theirs = directory.join(username);

        std::fs::create_dir_all(&theirs).expect("the machine directory");

        let mut machine = Persisted::<RemoteSyncStore>::load(theirs.join("remote-sync.json"))
            .expect("the record");
        let (_, session) = join::accept(
            |_| async { Ok::<_, crate::error::Error>(store) },
            &mut machine,
            &JoinLink::decode(&invited.join_link).expect("the invitation link"),
            &invited.code,
            password,
            test_cost(),
            CREATED_AT,
        )
        .await
        .expect("the account could not open its link");

        (invited.member_id, session, machine)
    }

    /// The handover, made on another machine: the founder offers the organization to a settled
    /// administrator, who accepts on a machine of their own. Answers the key the organization is
    /// on afterwards, which the machine under test has not followed yet.
    async fn handed_over(
        directory: &std::path::Path,
        app_state: &AppState,
    ) -> [u8; VERIFYING_KEY_BYTES] {
        let held = {
            let mut remote_sync = app_state.remote_sync.write().await;

            remote_sync
                .store_mut()
                .organization
                .clone()
                .expect("the record names no organization")
        };
        let theirs = elsewhere(directory, &held.id).await;
        let founder = session::sign_in(&theirs, &held, PASSWORD, &slot())
            .await
            .expect("the founder did not sign in on the other machine");
        let (ada, mut ada_session, mut ada_machine) = a_settled_administrator(
            directory,
            &theirs,
            &founder,
            "ada.admin",
            ADMINISTRATORS_PASSWORD,
        )
        .await;

        role::offer_ownership(&theirs, &founder, &ada, PASSWORD, CREATED_AT + 1)
            .await
            .expect("the offer failed");
        role::accept_ownership(
            &theirs,
            &mut ada_session,
            &mut ada_machine,
            ADMINISTRATORS_PASSWORD,
            CREATED_AT + 2,
        )
        .await
        .expect("the acceptance failed");

        ada_session.verifying_key
    }

    /// What the record on this machine pins.
    async fn pinned(app_state: &AppState) -> String {
        let mut remote_sync = app_state.remote_sync.write().await;

        remote_sync
            .store_mut()
            .organization
            .as_ref()
            .expect("the record names no organization")
            .verifying_key
            .clone()
    }

    /// The key and the role the open session holds.
    async fn session_holds(app_state: &AppState) -> ([u8; VERIFYING_KEY_BYTES], String) {
        let member = app_state.member.read().await;
        let session = member.as_ref().expect("nobody is in");

        (session.verifying_key, session.role.clone())
    }

    /// **Criterion 22 at its seams: the founder's open session is an administrator's after the
    /// handover.** The organization is handed over on another machine while the founder's session
    /// is open here. Before this machine has read anything, making an administrator from the
    /// stale session is refused rather than written; the next state read follows the succession
    /// and re-reads the founder's own row, so the session is the administrator's it now is on
    /// every gate: deleting the organization is refused by name and making a manager by rank, a
    /// plain member is theirs to make, and the directory verifies on every machine afterwards.
    #[tokio::test]
    async fn the_founders_open_session_is_an_administrators_after_a_handover_elsewhere() {
        let _turn = a_turn().await;
        let directory = scratch("founder-after-handover");
        let app_state = first_run(&directory).await;
        let (organization_id, _) = recorded(&app_state).await;
        let state = state_of(&app_state).await.expect("the state");

        assert_eq!(
            state.session.expect("the launch did not resume").role,
            "owner"
        );

        let (old_key, _) = session_holds(&app_state).await;
        let new_key = handed_over(&directory, &app_state).await;

        assert_ne!(new_key, old_key);

        // before any read: the session still says owner and still holds the old key, and the one
        // thing it could do with that is refused before a certificate is written.
        {
            let mut member = app_state.member.write().await;
            let organization = app_state.organization.read().await;
            let (session, store) = super::signed_in(&mut member, &organization).expect("signed in");
            let certificates = store.certificates().await.expect("the certificates").len();

            assert_eq!(session.role, "owner");

            invite::create_account(
                store,
                &*session,
                None::<&InMemoryPlatform>,
                "noor.new",
                permission::MANAGER,
                0,
                &[],
                test_cost(),
                CREATED_AT + 3,
            )
            .await
            .expect_err("a stale session made an administrator");

            assert_eq!(
                store.certificates().await.expect("the certificates").len(),
                certificates,
                "a certificate was written under the key that was handed over"
            );
        }

        // the state read follows the succession, and the session is the row's.
        let state = state_of(&app_state).await.expect("the state");

        assert_eq!(
            state.session.expect("the session was lost").role,
            "administrator"
        );
        assert_eq!(
            session_holds(&app_state).await,
            (new_key, "administrator".to_string())
        );
        assert_eq!(pinned(&app_state).await, encoded(new_key));

        // deleting the organization: this machine holds the authority, and the session is refused
        // on the role by name.
        let platform = InMemoryPlatform::new("an-org");
        let refused = removal::delete_organization(&app_state, &platform, PASSWORD)
            .await
            .expect_err("the founder deleted the organization after handing it over");

        assert!(
            matches!(refused, Error::Refused { reason: crate::error::RefusalReason::OwnerOnly, ref message } if message == removal::ONLY_THE_OWNER_DELETES),
            "{refused:?}"
        );

        // making a manager: refused by rank, as the manager the row now says they are, and a plain
        // member is theirs to make, issued from their own certificate (effort 838).
        {
            let mut member = app_state.member.write().await;
            let organization = app_state.organization.read().await;
            let (session, store) = super::signed_in(&mut member, &organization).expect("signed in");
            let refused = invite::create_account(
                store,
                &*session,
                None::<&InMemoryPlatform>,
                "noor.new",
                permission::MANAGER,
                0,
                &[],
                test_cost(),
                CREATED_AT + 4,
            )
            .await
            .expect_err("a manager made a manager");

            assert!(
                matches!(
                    refused,
                    Error::Refused {
                        reason: crate::error::RefusalReason::RankNotAbove,
                        ..
                    }
                ),
                "{refused:?}"
            );

            invite::create_account(
                store,
                &*session,
                None::<&InMemoryPlatform>,
                "sami.staff",
                permission::MEMBER,
                0,
                &[],
                test_cost(),
                CREATED_AT + 5,
            )
            .await
            .expect("a manager could not make a member");
        }

        // and the directory verifies under the key in force, here and on the other machine.
        {
            let organization = app_state.organization.read().await;

            organization
                .as_ref()
                .expect("the replica")
                .members(&new_key)
                .await
                .expect("every member row verifies on this machine");
        }
        elsewhere(&directory, &organization_id)
            .await
            .members(&new_key)
            .await
            .expect("every member row verifies on the other machine");
    }

    /// **Criterion 22 at its seams: a machine closed across the handover.** The founder's key is
    /// filed and nobody is in; the organization is handed over on another machine; the launch
    /// resumes the session, pulls, follows the succession and keeps the session, under the new
    /// key and as the administrator the row says, with no sign-out and the remembered key kept.
    ///
    /// The two stores share one file, so the launch meets the re-keyed rows at its first read
    /// rather than after its pull; what the pull would bring is already there. The follow after
    /// the pull runs on the same path the heartbeat test below reads, and this pins that the
    /// launch ends signed in on the key in force rather than at the wall.
    #[tokio::test]
    async fn a_machine_closed_across_a_handover_launches_signed_in_under_the_new_key() {
        let _turn = a_turn().await;
        let directory = scratch("launch-after-handover");
        let app_state = first_run(&directory).await;
        let (organization_id, member_id) = recorded(&app_state).await;
        let new_key = handed_over(&directory, &app_state).await;

        assert!(
            app_state.member.read().await.is_none(),
            "a launch starts with nobody in"
        );
        assert!(filed(&organization_id, &member_id).is_some());

        let state = state_of(&app_state).await.expect("the state");
        let session = state
            .session
            .expect("the launch across the handover did not resume");

        assert_eq!(session.member_id, member_id);
        assert_eq!(session.role, "administrator");
        assert!(
            !state.signed_out_elsewhere,
            "the wall was told a sign-out that did not happen"
        );
        assert!(
            filed(&organization_id, &member_id).is_some(),
            "the remembered key was forgotten"
        );
        assert_eq!(
            session_holds(&app_state).await,
            (new_key, "administrator".to_string())
        );
        assert_eq!(pinned(&app_state).await, encoded(new_key));
    }

    /// **Criterion 22 at its seams: a machine open across the handover.** The founder is signed in
    /// here; the organization is handed over on another machine; the heartbeat that pulls the
    /// re-keyed rows follows the succession rather than swallowing the read that refused, and the
    /// session goes on under the new key as the administrator the row says. Nothing was ended, so
    /// the heartbeat says so and keeps everything it holds.
    #[tokio::test]
    async fn a_machine_open_across_a_handover_follows_it_on_the_heartbeat() {
        let _turn = a_turn().await;
        let directory = scratch("heartbeat-after-handover");
        let app_state = first_run(&directory).await;
        let (organization_id, member_id) = recorded(&app_state).await;

        assert!(
            state_of(&app_state)
                .await
                .expect("the state")
                .session
                .is_some(),
            "the launch did not resume"
        );

        let (old_key, _) = session_holds(&app_state).await;
        let new_key = handed_over(&directory, &app_state).await;

        assert_eq!(pinned(&app_state).await, encoded(old_key));

        // one heartbeat.
        assert!(
            !super::ended_elsewhere(&app_state).await,
            "the heartbeat read a handover as a sign-out"
        );
        assert_eq!(
            session_holds(&app_state).await,
            (new_key, "administrator".to_string()),
            "the heartbeat did not follow the succession"
        );
        assert_eq!(pinned(&app_state).await, encoded(new_key));
        assert!(
            app_state.organization.read().await.is_some(),
            "the replica was let go of"
        );
        assert!(
            filed(&organization_id, &member_id).is_some(),
            "the remembered key was forgotten"
        );

        // and the state read afterwards has nothing left to follow.
        let state = state_of(&app_state).await.expect("the state");

        assert_eq!(state.session.expect("the session").role, "administrator");
        assert!(!state.signed_out_elsewhere);
    }

    // -------------------------------------------------------------------------------------
    // Effort 838, criterion 1: every organization command names its gate.
    // -------------------------------------------------------------------------------------

    use crate::organization::permission::Flag;

    /// What stands in front of an organization command before it does anything.
    ///
    /// **The flag is asked of the verified row by the act behind the command**, and never of the
    /// session's snapshot; this table is the list of which, so a command added without one is a
    /// test that fails rather than an act anybody may perform.
    #[derive(Clone, Copy, Debug)]
    enum Gate {
        /// before there is anybody to act as: the first run, a connect, a link, the wall.
        Public,
        /// this machine's own hold on the organization, which is its to let go of: a sign-out,
        /// a disconnect, the Turso consent it holds.
        ThisMachine,
        /// the signed-in member's own session or row, and nobody else's.
        Own,
        /// what every signed-in member reads.
        SignedIn,
        /// the flag, off the actor's verified row.
        Flag(Flag),
        /// any of the flags, off the actor's verified row.
        AnyFlag(&'static [Flag]),
        /// the owner's verified row, carrying the flag: the acts that need the Turso authority
        /// or hand the organization on (`session::Actor::require_owner`).
        Owner(Flag),
    }

    /// Every command `command.rs` declares, with its gate.
    const GATES: &[(&str, Gate)] = &[
        ("organization_create", Gate::Public),
        ("organization_group_inspect", Gate::Public),
        ("organization_connect_existing", Gate::Public),
        ("organization_state_get", Gate::Public),
        ("organization_disconnect", Gate::ThisMachine),
        ("organization_delete", Gate::Owner(Flag::DeleteOrganization)),
        ("organization_sign_in", Gate::Public),
        ("organization_sign_out", Gate::ThisMachine),
        ("workspace_create", Gate::Owner(Flag::CreateWorkspace)),
        ("workspace_grant", Gate::Flag(Flag::GrantWorkspace)),
        ("workspace_grant_withdraw", Gate::Flag(Flag::GrantWorkspace)),
        ("workspace_delete", Gate::Owner(Flag::DeleteWorkspace)),
        ("workspace_open", Gate::Own),
        (
            "organization_renew_credentials",
            Gate::Owner(Flag::RenewCredentials),
        ),
        (
            "organization_renew_due",
            Gate::Owner(Flag::RenewCredentials),
        ),
        ("member_create", Gate::Flag(Flag::InviteMember)),
        (
            "member_link_make",
            Gate::AnyFlag(&[Flag::InviteMember, Flag::ResetPassword]),
        ),
        ("member_password_unset", Gate::Flag(Flag::ResetPassword)),
        ("invitation_accept", Gate::Public),
        ("machine_connect", Gate::Public),
        ("organization_roles", Gate::SignedIn),
        ("role_create", Gate::Flag(Flag::ManageRoles)),
        ("role_rename", Gate::Flag(Flag::ManageRoles)),
        ("role_set_mask", Gate::Flag(Flag::ManageRoles)),
        ("role_move", Gate::Flag(Flag::ManageRoles)),
        ("role_delete", Gate::Flag(Flag::ManageRoles)),
        ("member_assign_role", Gate::Flag(Flag::AssignRole)),
        ("member_set_override", Gate::Flag(Flag::OverrideMember)),
        (
            "member_offer_ownership",
            Gate::Owner(Flag::TransferOwnership),
        ),
        (
            "member_withdraw_offer",
            Gate::Owner(Flag::TransferOwnership),
        ),
        ("ownership_accept", Gate::Own),
        ("member_rename", Gate::Flag(Flag::RenameMember)),
        ("organization_mark_get", Gate::SignedIn),
        ("organization_mark_set", Gate::Flag(Flag::ManageMark)),
        ("organization_mark_clear", Gate::Flag(Flag::ManageMark)),
        ("organization_session_end_elsewhere", Gate::Own),
        ("member_end_sessions", Gate::Flag(Flag::ResetPassword)),
        ("member_lock_out_cost", Gate::Flag(Flag::RemoveMember)),
        ("member_remove", Gate::Flag(Flag::RemoveMember)),
        (
            "organization_account_refusal_detail",
            Gate::Owner(Flag::TursoAccount),
        ),
        ("organization_change_password", Gate::Own),
        ("organization_members", Gate::SignedIn),
        ("organization_member_standings", Gate::SignedIn),
        ("organization_link_take", Gate::Public),
        ("organization_link_read", Gate::Public),
        ("organization_reconnect_authority", Gate::ThisMachine),
    ];

    /// The name of every `#[tauri::command]` in a source file, in order.
    fn declared_commands(source: &str) -> Vec<String> {
        let lines: Vec<&str> = source.lines().collect();

        lines
            .iter()
            .enumerate()
            .filter(|(_, line)| line.trim() == "#[tauri::command]")
            .filter_map(|(index, _)| {
                let signature = lines.get(index + 1)?.trim();
                let name = signature
                    .strip_prefix("pub async fn ")
                    .or_else(|| signature.strip_prefix("pub fn "))?;

                Some(name.split('(').next()?.to_string())
            })
            .collect()
    }

    /// Every command of this module the application registers: each `organization::<name>` in
    /// `lib.rs`'s handler list.
    fn registered_commands(source: &str) -> Vec<String> {
        let handlers = source
            .split("tauri::generate_handler![")
            .nth(1)
            .and_then(|rest| rest.split(']').next())
            .expect("lib.rs registers no handlers");

        handlers
            .split(',')
            .filter_map(|entry| entry.trim().strip_prefix("organization::"))
            .map(str::to_string)
            .collect()
    }

    /// The commands that name no gate, and the gates that name no command.
    fn ungated(declared: &[String], gates: &[(&str, Gate)]) -> (Vec<String>, Vec<String>) {
        let named: Vec<&str> = gates.iter().map(|(name, _)| *name).collect();

        (
            declared
                .iter()
                .filter(|command| !named.contains(&command.as_str()))
                .cloned()
                .collect(),
            named
                .iter()
                .filter(|name| !declared.iter().any(|command| command == *name))
                .map(|name| name.to_string())
                .collect(),
        )
    }

    /// **Criterion 1, the Rust half.** Every command this module declares, and every one the
    /// application registers from it, names its gate here; a command with none fails, naming it,
    /// and so does a gate for a command that is gone. The flags named are the vocabulary's own,
    /// so each is a bit a refusal names.
    #[test]
    fn every_organization_command_names_its_gate() {
        let declared = declared_commands(include_str!("command.rs"));
        let registered = registered_commands(include_str!("../lib.rs"));

        assert!(
            declared.len() > 40,
            "the declarations were not read: {declared:?}"
        );
        assert_eq!(
            {
                let mut sorted = registered.clone();
                sorted.sort();
                sorted
            },
            {
                let mut sorted = declared.clone();
                sorted.sort();
                sorted
            },
            "lib.rs registers a different set of organization commands than command.rs declares"
        );

        let (without, stale) = ungated(&declared, GATES);

        assert!(without.is_empty(), "commands with no gate: {without:?}");
        assert!(stale.is_empty(), "gates naming no command: {stale:?}");

        for (name, gate) in GATES {
            let flags: Vec<Flag> = match gate {
                Gate::Flag(flag) | Gate::Owner(flag) => vec![*flag],
                Gate::AnyFlag(flags) => flags.to_vec(),
                Gate::Public | Gate::ThisMachine | Gate::Own | Gate::SignedIn => Vec::new(),
            };

            for flag in flags {
                assert!(Flag::ALL.contains(&flag), "{name} names {}", flag.name());
            }

            if let Gate::Owner(flag) = gate {
                assert!(
                    crate::organization::permission::OWNER_ONLY.contains(flag),
                    "{name} is the owner's under {}, which is not one of the owner's flags",
                    flag.name()
                );
            }
        }

        // and the check itself: a command declared with no gate is named.
        let (without, _) = ungated(
            &["member_widen_everything".to_string()],
            &[("organization_members", Gate::SignedIn)],
        );

        assert_eq!(without, vec!["member_widen_everything".to_string()]);
    }
}
