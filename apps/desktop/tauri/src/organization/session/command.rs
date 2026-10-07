//! the commands of a session: where this machine stands, the sign-in and the sign-out, the launch's
//! resume, the sessions ended from here and from elsewhere, the reader's machines and one of them
//! signed out, the heartbeat, and the forget.

use std::sync::atomic::Ordering;

use serde::{Deserialize, Serialize};

use crate::{
    clock,
    credential::{CredentialStore, Credentials},
    database::floor::Standing,
    diagnostics,
    error::{Error, RefusalReason},
    organization::Shared,
    turso::consent::{Account, holds_platform_token},
};

use super::{
    heartbeat::{ended_elsewhere, reconnect, succession_followed},
    replica::{Opening, machine_registered, open_replica, resume_remembered},
};
use crate::organization::{
    HeldOrganization,
    act::{Acting, Pull, as_member, owner_platform},
    invitation::join,
    ownership,
    session::{
        self, HeldByVersion, MachineView, SessionFacts, SessionsEnded, forget, held_by_version,
        hold_at_the_wall, workspace_judged,
    },
};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HeldOrganizationFacts {
    pub id: String,
    pub name: String,
    /// this person's member row, once a sign-in has found it; `None` on a machine that connected
    /// by link and has not signed in yet.
    pub member_id: Option<String>,
    /// the kind of their role, as last read. A display fact; `None` with `member_id`.
    pub role: Option<String>,
    pub joined_at: i64,
    /// whether this machine holds this organization's own Turso consent (effort 851, requirement
    /// 14), which is what decides whether removing it forgets a Turso account: the switcher's
    /// confirm says so only where it does (requirement 5). Read in [`state_of`]; `false` from the
    /// record alone, which knows nothing of the keyring.
    #[serde(default)]
    pub holds_turso_authority: bool,
}

impl From<&HeldOrganization> for HeldOrganizationFacts {
    fn from(held: &HeldOrganization) -> Self {
        Self {
            id: held.id.clone(),
            name: held.name.clone(),
            member_id: held.member_id.clone(),
            role: held.role.clone(),
            joined_at: held.joined_at,
            holds_turso_authority: false,
        }
    }
}

/// Where this machine stands: the organizations it holds, the one selected, and who is signed in.
///
/// What the sign-in wall admits on. `session` is `None` until a password has opened a vault in
/// this process, and it carries facts and no credential.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrganizationState {
    /// every organization this machine holds, in the order it came to hold them (effort 851,
    /// requirement 3). Empty on a machine that holds nothing, which is what the screen offering
    /// the two ways to connect is drawn on (requirement 18). *`organization`, the one a machine
    /// held, until effort 851's ticket 08 moved the shell onto the list.*
    pub organizations: Vec<HeldOrganizationFacts>,
    /// the id of the organization the wall opens on, the one last signed in to or chosen (effort
    /// 851, requirement 2); `None` where nothing is held.
    pub selected: Option<String>,
    pub session: Option<SessionFacts>,
    /// whether this machine holds the Turso authority and knows which account it is over: the
    /// owner's machine after a consent. An owner restored on a new machine holds none until they
    /// repeat the consent, which is the one thing a restore cannot bring with it (requirement 5).
    pub holds_turso_authority: bool,
    /// whether this machine holds a setup's own Turso consent, the one a consent in the setup walk
    /// grants and a create or a connect to an existing organization spends (effort 851,
    /// requirement 39). The walk reads this and never `holds_turso_authority`, which is the
    /// selected organization's: adding a second organization starts its walk from its own consent,
    /// not from the one the organization already held was made with.
    pub setup_consented: bool,
    /// whether the wall is up because this member's sessions were ended from another machine
    /// (effort 826, requirement 22), which is a sentence the wall carries rather than a refusal
    /// anybody made here. False the moment somebody is signed in again.
    pub signed_out_elsewhere: bool,
    /// what holds this machine by its version, where anything does (effort 857, ticket 04): a
    /// resume refused because a newer rentable upgraded the organization past what this one reads,
    /// a session let through on an organization or a workspace this one may read and not write,
    /// or one a pulled raise has put past reading. `None` where this build may write everything it
    /// has open.
    pub held_by_version: Option<HeldByVersion>,
}

impl OrganizationState {
    /// the held organization the selection names, as a test reads it: the one the wall opens on.
    #[cfg(test)]
    pub(crate) fn selected_organization(&self) -> Option<HeldOrganizationFacts> {
        let selected = self.selected.as_deref()?;

        self.organizations
            .iter()
            .find(|held| held.id == selected)
            .cloned()
    }
}

/// Where this machine stands: the organizations it holds, the one chosen, and who is signed in.
///
/// **`public` on the other side for the same reason the sync state is**: it is what the wall
/// admits on, so requiring a signed-in caller would make it answerable only to machines whose
/// answer is already known.
///
/// **The first read of a launch checks the shape of what the machine holds** and forgets it where
/// it was built before this build (requirement 17, `upgrade/shape.rs`), before anything opens the
/// replica. Every later read, and every command that answers with the state, finds the check
/// already made.
///
/// **That same first read signs the machine back in** where it stayed signed in (effort 826,
/// requirement 12), so the shell's first question is already answered with a session and the
/// application opens on the workspace the person had last, with no wall in between.
#[tauri::command(rename = "session_state_get")]
pub(crate) async fn organization_session_state_get(
    app_state: tauri::State<'_, Shared>,
    credentials: tauri::State<'_, Credentials>,
    clock: tauri::State<'_, clock::Shared>,
) -> Result<OrganizationState, Error> {
    state_of(&app_state, &credentials, &clock).await
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
///
/// **Between the check and the resume, the Turso consent an earlier build filed moves to its
/// organization** (effort 851, requirement 14, `upgrade/consent.rs`). After the check, because a
/// machine whose shape is forgotten has no organization left to move it to; before the resume,
/// because the resume is the first thing that asks for the owner's platform, and it would find
/// none on the first launch of this build.
pub(crate) async fn state_of(
    app_state: &Shared,
    credentials: &Credentials,
    clock: &clock::Shared,
) -> Result<OrganizationState, Error> {
    app_state
        .old_shape_check
        .get_or_try_init(|| async {
            app_state
                .upgrade
                .forget_old_shape(app_state, credentials.as_ref(), clock)
                .await?;
            app_state
                .upgrade
                .move_the_consent(app_state, credentials.as_ref())
                .await?;
            resume_remembered(app_state, credentials, clock).await;

            // and the one sign that is the remote's rather than the replica's: the owner deleted
            // the organization from another machine, so there is no database to sync against any
            // more (effort 828, requirement 18). It is after the resume because the pull it reads
            // spends the credential the resumed vault unsealed, and before the registration
            // because a machine that has just forgotten has no row to write.
            if forget::forget_deleted_organization(app_state, credentials.as_ref()).await? {
                return Ok(());
            }

            machine_registered(app_state).await?;

            Ok::<(), Error>(())
        })
        .await?;

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
    // the name this machine holds follows the one the owner signed (effort 851, requirement 26),
    // so the wall and the switcher name what the shell does. After the read, which is what verified
    // it, and before the held organization is read for the answer.
    if let Some(read) = &session {
        held_name_refreshed(app_state, read).await?;
    }

    let (mut organizations, selected): (Vec<HeldOrganizationFacts>, Option<String>) = {
        let mut remote_sync = app_state.remote_sync.write().await;
        let record = remote_sync.store_mut();
        let selected = record.selected();

        (
            record
                .held_organizations
                .iter()
                .map(HeldOrganizationFacts::from)
                .collect(),
            selected.map(|held| held.id.clone()),
        )
    };
    // each organization's own consent, which is what its remove says it forgets, and the selected
    // one's, which is the one the wall and the session are of. A keyring read apiece, no network.
    for held in &mut organizations {
        held.holds_turso_authority = owner_platform(app_state, credentials, &held.id)
            .await
            .is_some();
    }
    let holds_turso_authority = organizations
        .iter()
        .any(|held| Some(&held.id) == selected.as_ref() && held.holds_turso_authority);
    let setup_consented =
        holds_platform_token(credentials.as_ref(), &Account::Pending).unwrap_or(false);

    // the standing is only ever about a wall that is up: somebody signed in has answered it,
    // whichever way they got back in, so this one read clears it rather than five sign-in paths
    // each remembering to.
    if session.is_some() {
        app_state
            .signed_out_elsewhere
            .store(false, Ordering::SeqCst);
        // and the version that kept the wall up: a session open is judged on its own store.
        hold_at_the_wall(app_state, None);
    }

    Ok(OrganizationState {
        organizations,
        selected,
        session: session.map(|(facts, _)| facts),
        holds_turso_authority,
        setup_consented,
        signed_out_elsewhere: app_state.signed_out_elsewhere.load(Ordering::SeqCst),
        held_by_version: held_by_version(app_state).await,
    })
}

/// Forget the organization this machine has open, or the one the wall stands on (requirement 20):
/// sign out where somebody is in, delete its replica and its workspaces' replicas, forget its entry
/// on the record, and clear its Turso consent. Every other organization held keeps all of its own
/// (effort 851, requirement 5). The organization on Turso is untouched, and the person can connect
/// again by a link. The one confirm before it is the screen's; this asks nothing.
#[tauri::command(rename = "session_disconnect")]
pub(crate) async fn organization_session_disconnect(
    app_state: tauri::State<'_, Shared>,
    credentials: tauri::State<'_, Credentials>,
    clock: tauri::State<'_, clock::Shared>,
) -> Result<OrganizationState, Error> {
    forget::forget_the_open_one(&app_state, credentials.inner().as_ref()).await?;

    state_of(&app_state, &credentials, &clock).await
}

/// Choose the organization the wall opens on, from those this machine holds (effort 851,
/// requirement 3): the wall then asks for that organization's username and password.
///
/// **Refused while somebody is signed in** (requirement 8): switching happens signed out, so the
/// one organization open is the selected one for as long as it is open, and a selection that moved
/// under an open session would leave the shell answering for one organization with another's
/// replica. Nothing is opened here; the sign-in that follows opens the selected one.
///
/// **What the wall said, what Turso last refused and when the workspace was last reached were the
/// previous organization's**, so they go, and the current workspace becomes the one this
/// organization last had open (`RemoteSyncStore::select`).
#[tauri::command(rename = "session_select")]
pub(crate) async fn organization_session_select(
    app_state: tauri::State<'_, Shared>,
    credentials: tauri::State<'_, Credentials>,
    clock: tauri::State<'_, clock::Shared>,
    organization_id: String,
) -> Result<OrganizationState, Error> {
    select(&app_state, &organization_id).await?;

    state_of(&app_state, &credentials, &clock).await
}

/// [`organization_session_select`]'s act, with its two refusals.
pub(crate) async fn select(app_state: &Shared, organization_id: &str) -> Result<(), Error> {
    if app_state.member.read().await.is_some() || app_state.organization.read().await.is_some() {
        return Err(Error::refused(
            RefusalReason::SessionOpen,
            "sign out before choosing another organization",
        ));
    }

    let mut remote_sync = app_state.remote_sync.write().await;

    if remote_sync.store_mut().held(organization_id).is_none() {
        return Err(Error::refused(
            RefusalReason::NoOrganization,
            "this machine does not hold that organization",
        ));
    }

    remote_sync.select_organization(organization_id)?;
    app_state
        .signed_out_elsewhere
        .store(false, Ordering::SeqCst);
    // what kept the wall up for its version was the previous organization's.
    hold_at_the_wall(app_state, None);

    Ok(())
}

/// Forget one organization this machine holds, and nothing else (effort 851, requirement 5): the
/// switcher's remove. Its replica, its workspaces' replicas, its remembered sign-in, its entry on
/// the record and its Turso consent go; where it is the open one the machine signs out of it
/// first. Removing the last one brings back the welcome. The one confirm before it is the
/// screen's; this asks nothing.
///
/// **Removing another organization than the open one leaves the open one open**, which is how the
/// no-workspace screen removes an organization without signing anybody out.
#[tauri::command(rename = "session_remove")]
pub(crate) async fn organization_session_remove(
    app_state: tauri::State<'_, Shared>,
    credentials: tauri::State<'_, Credentials>,
    clock: tauri::State<'_, clock::Shared>,
    organization_id: String,
) -> Result<OrganizationState, Error> {
    remove(&app_state, credentials.inner().as_ref(), &organization_id).await?;

    state_of(&app_state, &credentials, &clock).await
}

/// [`organization_session_remove`]'s act: an organization this machine does not hold is refused,
/// and one it holds is forgotten (`forget::forget_one`).
pub(crate) async fn remove(
    app_state: &Shared,
    credentials: &dyn CredentialStore,
    organization_id: &str,
) -> Result<(), Error> {
    let held = {
        let mut remote_sync = app_state.remote_sync.write().await;

        remote_sync.store_mut().held(organization_id).is_some()
    };

    if !held {
        return Err(Error::refused(
            RefusalReason::NoOrganization,
            "this machine does not hold that organization",
        ));
    }

    forget::forget_one(app_state, credentials, organization_id).await
}

/// Sign in to the organization the wall stands on, the selected one, with a username and a
/// password (effort 824, requirement 19).
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
/// learns which member this person is; `invitation/join.rs` says how.
#[tauri::command(rename = "session_sign_in")]
pub(crate) async fn organization_session_sign_in(
    app_state: tauri::State<'_, Shared>,
    credentials: tauri::State<'_, Credentials>,
    clock: tauri::State<'_, clock::Shared>,
    username: String,
    password: String,
) -> Result<OrganizationState, Error> {
    let held = {
        let mut remote_sync = app_state.remote_sync.write().await;

        remote_sync.store_mut().selected().cloned().ok_or_else(|| {
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
        sign_out(app_state.inner(), credentials.inner().as_ref()).await;
    }

    let (store, credential) = open_replica(
        app_state.inner(),
        credentials.inner(),
        clock.inner(),
        &held,
        Opening::Password {
            username: &username,
            password: &password,
        },
    )
    .await?;

    // a handover accepted while this machine was at the wall left rows this machine's key cannot
    // verify, and the sign-in reads rows (effort 828, requirement 22). The succession is followed
    // before the password is tried, so the wall admits under the key the organization is on now.
    let held = {
        let mut remote_sync = app_state.remote_sync.write().await;

        match ownership::follow_succession(&store, remote_sync.store_mut()).await {
            Ok(Some(_)) => remote_sync.store_mut().selected().cloned().unwrap_or(held),
            Ok(None) => held,
            Err(refusal) => {
                diagnostics::warn("organization.succession.notFollowed")
                    .with("reason", refusal.to_string())
                    .write();

                held
            }
        }
    };

    // the admission pulls once the vault is open, because the pull needs the credential the vault
    // held, and before it acknowledges this machine's sign-outs, so the number it takes is the
    // one Turso holds (effort 846, ticket 30). What a pull that could not go leaves out is the
    // offline case rather than a failure of signing in.
    let member = {
        let mut remote_sync = app_state.remote_sync.write().await;

        join::admit(
            credentials.inner().as_ref(),
            &store,
            remote_sync.store_mut(),
            &held,
            &username,
            &password,
            &credential,
            clock.now(),
        )
        .await?
    };

    *app_state.organization.write().await = Some(store);
    *app_state.member.write().await = Some(member);

    // what this machine runs, where that changed since it last said (effort 857, requirement 4).
    session::version_recorded(&app_state).await;

    state_of(&app_state, &credentials, &clock).await
}

/// Put the wall back up: drop the keys this process held, and let go of the replica. The record
/// is untouched, so the wall comes back up on the same organization with the same member.
#[tauri::command(rename = "session_sign_out")]
pub(crate) async fn organization_session_sign_out(
    app_state: tauri::State<'_, Shared>,
    credentials: tauri::State<'_, Credentials>,
    clock: tauri::State<'_, clock::Shared>,
) -> Result<OrganizationState, Error> {
    sign_out(&app_state, credentials.inner().as_ref()).await;

    state_of(&app_state, &credentials, &clock).await
}

/// The sign-out itself: the keys go, the organization replica is dropped, and the key this
/// machine was staying signed in on is deleted. What `organization_session_sign_out` does, and what
/// `forget::forget_one` does first for the open organization, so that letting go of the replica is one routine and the file it held can
/// be deleted afterwards.
///
/// **The remembered key goes here rather than in each caller**, which is what makes a disconnect
/// forget it too: a machine that has let go of its organization must not keep the key that opened
/// a member's vault in it. The record is read before the entry goes, which is why this runs before
/// `forget::forget_one` touches it. **Only the open organization's**: every other organization
/// held keeps its own remembered key (effort 851, criterion 8).
pub(crate) async fn sign_out(app_state: &Shared, credentials: &dyn CredentialStore) {
    // a sign-out the person asked for answers the standing: they are at the wall because they
    // put themselves there. The heartbeat's own sign-out sets it again afterwards, which is the
    // one case where the wall has something to say.
    app_state
        .signed_out_elsewhere
        .store(false, Ordering::SeqCst);

    // the open organization, which is the member's where somebody is in and the one the wall
    // stands on otherwise (effort 851): never another organization this machine holds.
    let held = match forget::open_organization(app_state).await {
        Some(organization_id) => {
            let mut remote_sync = app_state.remote_sync.write().await;

            remote_sync.store_mut().held(&organization_id).cloned()
        }
        None => None,
    };

    if let Some((organization_id, member_id)) = held
        .as_ref()
        .and_then(|held| held.member_id.as_ref().map(|member| (&held.id, member)))
    {
        session::forget_remembered(credentials, organization_id, member_id);
    }

    // the machine stays in the registry and stops naming anybody (effort 828, requirement 15):
    // it still holds the organization, and what ended is the session. Before the replica is let
    // go of below, since that is what carries the write.
    {
        let organization = app_state.organization.read().await;

        // and only where this build may write the organization (effort 857, ticket 04).
        if let (Some(held), Some(store)) = (held.as_ref(), organization.as_ref())
            && session::writes_to(store)
        {
            session::machine_seen(store, held, None, store.clock().now()).await;
        }
    }

    *app_state.member.write().await = None;
    *app_state.organization.write().await = None;

    // and what Turso last refused and when the workspace was last reached, which were the open
    // organization's (effort 851). Nothing about the sign-out turns on the write.
    if let Err(error) = app_state.remote_sync.write().await.note_signed_out() {
        diagnostics::error("organization.session.signedOutNotRecorded")
            .with("error", error.to_string())
            .write();
    }
}

/// The signed-in member's facts, re-read from the replica so a row that changed under them since
/// sign-in is what the screen shows, with this machine's entry for the organization as the read
/// left it: `name_signed` set where a signed name was read (`session::organization_name_of`).
async fn current_facts(
    app_state: &Shared,
) -> Result<Option<(SessionFacts, HeldOrganization)>, Error> {
    let member = app_state.member.read().await;
    let organization = app_state.organization.read().await;

    let (Some(member), Some(store)) = (member.as_ref(), organization.as_ref()) else {
        return Ok(None);
    };
    let held = {
        let mut remote_sync = app_state.remote_sync.write().await;

        remote_sync
            .store_mut()
            .held(&member.organization_id)
            .cloned()
    };
    let Some(mut held) = held else {
        return Ok(None);
    };

    let facts = session::facts_of(store, member, &mut held).await?;

    Ok(Some((facts, held)))
}

/// Write this machine's entry for the organization where the read changed it (effort 851,
/// requirements 26 and 29): `name_signed` once a signed name has been read, and the name the owner
/// signed, with when they signed it, where either differs from the one held. **Only a signed name
/// is written**: an unsigned one, read before the owner has signed, changes nothing the record
/// holds, and neither does one signed before the name the record holds, which a read made before
/// the record moved could carry. **And `lock_marked`** once the organization's lock marker has been
/// read, which is never cleared (effort 851, requirement 35).
async fn held_name_refreshed(
    app_state: &Shared,
    (facts, read): &(SessionFacts, HeldOrganization),
) -> Result<(), Error> {
    if !read.name_signed && !read.lock_marked {
        return Ok(());
    }

    let mut remote_sync = app_state.remote_sync.write().await;
    let record = remote_sync.store_mut();
    let Some(entry) = record.held_mut(&read.id) else {
        return Ok(());
    };
    let name_moved = read.name_signed
        && !(entry.name_signed
            && entry.name == facts.organization_name
            && entry.name_signed_at == read.name_signed_at)
        && !(entry.name_signed && read.name_signed_at < entry.name_signed_at);
    // and the lock marker, once read, latched for good (effort 851, requirement 35).
    let marked = read.lock_marked && !entry.lock_marked;

    if !name_moved && !marked {
        return Ok(());
    }

    if name_moved {
        entry.name_signed = true;
        entry.name_signed_at = read.name_signed_at;
        entry.name = facts.organization_name.clone();
    }

    if marked {
        entry.lock_marked = true;
    }

    record.commit()
}

/// Sign this member out of every machine but the one they are at (effort 826, requirement 22).
///
/// **They stay signed in here**, and nothing asks for their password: the row's session epoch
/// moves on, this machine's session and its remembered key move with it, and every other machine
/// is behind. One with the application open meets the wall at its next sync heartbeat; one that
/// is closed meets it at its next launch.
///
/// **What comes back says whether the bump went out.** A push that could not go leaves the other
/// machines open until one does, and the account section says so rather than reporting the act
/// done.
#[tauri::command(rename = "session_end_elsewhere")]
pub(crate) async fn organization_session_end_elsewhere(
    app_state: tauri::State<'_, Shared>,
    credentials: tauri::State<'_, Credentials>,
    clock: tauri::State<'_, clock::Shared>,
) -> Result<SessionsEnded, Error> {
    // before the bump, as `organization_invitation_accept` pulls before it admits: the new number
    // is one past the row's, and a row this machine has not refreshed since somebody else's
    // sign-out is a number already reached, which would write nothing and report the sessions
    // ended. A pull that could not go is the offline case and leaves the row as it stands.
    let held = held_here(&app_state).await?;

    as_member(&app_state, Pull::First, async |Acting { member, store }| {
        Ok(SessionsEnded {
            sent: session::end_elsewhere(
                credentials.inner().as_ref(),
                store,
                member,
                &held.machine_id,
                clock.now(),
            )
            .await?,
        })
    })
    .await
}

/// Every machine signed in as the reader, this one first, however long ago each was last seen
/// (effort 846, requirement 9): its name, when it was last seen and added, and whether it can be
/// signed out on its own. Names and moments cross, and nothing else ([[rules/credentials]],
/// *Client boundary*).
///
/// Off the replica as it stands: the heartbeat is what pulls, and a list read on every look at the
/// account section has no business putting a round trip in front of it.
#[tauri::command(rename = "session_machines")]
pub(crate) async fn organization_session_machines(
    app_state: tauri::State<'_, Shared>,
) -> Result<Vec<MachineView>, Error> {
    let held = held_here(&app_state).await?;

    as_member(&app_state, Pull::No, async |Acting { member, store }| {
        session::machines(store, member, &held).await
    })
    .await
}

/// Sign one of the reader's other machines out, and stay signed in here (effort 846, requirement
/// 10). The member is the session's, never the caller's, and nothing about the password moves.
///
/// **What comes back says whether the sign-out went out**, as
/// [`organization_session_end_elsewhere`]'s does: offline, it reaches that machine once this one is
/// back online, and the account section says so.
#[tauri::command(rename = "session_end_machine")]
pub(crate) async fn organization_session_end_machine(
    app_state: tauri::State<'_, Shared>,
    clock: tauri::State<'_, clock::Shared>,
    machine_id: String,
) -> Result<SessionsEnded, Error> {
    let held = held_here(&app_state).await?;

    // before the sign-out, as ending every other session pulls before it bumps: the new number is
    // one past what the replica holds, and a replica behind another machine's sign-out of the same
    // one would write a number already reached and report it sent.
    as_member(&app_state, Pull::First, async |Acting { member, store }| {
        Ok(SessionsEnded {
            sent: session::end_machine(store, member, &held, &machine_id, clock.now()).await?,
        })
    })
    .await
}

/// This machine's entry for the organization it has open, for the acts that need to know which
/// machine this is. Read before the member's lock is taken, so the record's lock is never held
/// under it.
async fn held_here(app_state: &Shared) -> Result<HeldOrganization, Error> {
    let open = forget::open_organization(app_state).await;
    let mut remote_sync = app_state.remote_sync.write().await;

    open.and_then(|organization_id| remote_sync.store_mut().held(&organization_id).cloned())
        .ok_or_else(|| {
            Error::refused(
                RefusalReason::NoOrganization,
                "this machine holds no organization",
            )
        })
}

/// Send what this machine wrote, then take what the others wrote.
///
/// **Push before pull, and the order is the point.** A pull can bring another device's edit to a
/// row this machine has also changed; pushing first means what is here has been offered before
/// anything can land on top of it, so what a losing writer loses is a column rather than a write
/// that never left. #552's tests measure exactly that.
///
/// **Answers whether the pull brought anything**, because the caller has work to do only if it
/// did: another device's rows change derived state, so they have to be reconciled and the query
/// cache told. A pull that brought nothing is not an event.
///
/// **Neither half failing is an error.** Offline is the ordinary case and requirement 7 is that
/// the application stays usable through it; what could not be sent stays captured for the next
/// push, and what could not be fetched is fetched next time.
///
/// **It is also where a session ends that was ended from another machine** (effort 826,
/// requirement 22). This is what the sync heartbeat calls, so it is the call that runs on a
/// machine nobody is touching; it pulls the organization replica as well and, where the member's
/// row has moved past the session, empties the member slot, forgets the remembered key and says
/// so on `standing`. The shell reads that and puts the wall up.
#[tauri::command(rename = "session_replicate")]
pub(crate) async fn organization_session_replicate(
    app_state: tauri::State<'_, Shared>,
    credentials: tauri::State<'_, Credentials>,
    clock: tauri::State<'_, clock::Shared>,
) -> Result<Replication, Error> {
    replicate(
        app_state.inner(),
        credentials.inner().as_ref(),
        clock.inner(),
    )
    .await
}

/// [`organization_session_replicate`] over the application's state, as a test drives it.
///
/// **The floors are judged after the organization's pull and before the workspace's push**
/// (effort 857, requirement 9, ticket 04). The organization's verdict is the one the pull in
/// [`ended_elsewhere`] left on its store; the open workspace's is judged here, from the
/// organization's record of it and from the floors the workspace keeps itself, and kept on the
/// workspace engine. A workspace this build may read and not write is pulled and not pushed; one it
/// may not read, or one of an organization it may not read, is neither. The answer carries what
/// holds the machine, as `heldByVersion`, and the workspace is judged again after its own pull, so
/// a raise that pull brought is in the answer and is judged before the next heartbeat writes.
pub(crate) async fn replicate(
    app_state: &Shared,
    credentials: &dyn CredentialStore,
    clock: &clock::Shared,
) -> Result<Replication, Error> {
    // before the workspace's own replication, because a machine whose member is signed out has
    // no business pushing under a credential the organization has moved past. A machine with
    // nobody in, or whose row has not moved, pays one pull of the organization replica for it.
    let standing = if ended_elsewhere(app_state, credentials).await {
        SessionStanding::SignedOutElsewhere
    } else {
        SessionStanding::Held
    };

    // and that is where this replication ends: the wall is up, and the workspace's push and pull
    // would go out under a credential the member no longer stands behind. What this machine wrote
    // stays captured for whoever signs in and holds a grant on it.
    if standing == SessionStanding::SignedOutElsewhere {
        return Ok(Replication {
            pushed: false,
            received: false,
            refusal: None,
            standing,
            held_by_version: None,
        });
    }

    // the organization as its pull left it, and the open workspace judged now.
    let organization = app_state
        .organization
        .read()
        .await
        .as_ref()
        .map(|store| store.standing())
        .unwrap_or(Standing::Writable);
    let workspace = workspace_judged(app_state).await;

    match (organization, workspace.as_ref().map(|held| held.standing)) {
        // past reading, the organization or the workspace: nothing goes either way, and what this
        // machine wrote stays captured until it has updated.
        (Standing::Unreadable, _) | (_, Some(Standing::Unreadable)) => {
            return Ok(Replication {
                pushed: false,
                received: false,
                refusal: None,
                standing,
                held_by_version: HeldByVersion::organization(organization).or(workspace),
            });
        }
        // read-only: what the others wrote comes in, and nothing this build wrote goes out. A
        // replica holding changes the workspace refuses since an upgrade is not pulled either, and
        // says so (ticket 13).
        (_, Some(Standing::ReadOnly)) => {
            let (pulled, unsendable) = {
                let db = app_state.db.read().await;
                let pulled = db.pull_replica().await;

                (pulled, db.holds_unsendable())
            };

            if pulled.completed {
                crate::machine::note_reached(&app_state.remote_sync, clock.as_ref()).await;
            }

            let refusal = unsendable.then(crate::database::unsendable::refusal);

            if refusal.is_some() {
                app_state
                    .remote_sync
                    .write()
                    .await
                    .note_unsendable_changes(clock.now());
            }

            return Ok(Replication {
                pushed: false,
                received: pulled.brought,
                refusal,
                standing,
                held_by_version: held_after(app_state, organization).await,
            });
        }
        _ => {}
    }

    let replicated = {
        let db = app_state.db.read().await;

        db.replicate().await
    };

    match &replicated.refusal {
        // the remote was reached, or could not be: the offline case, which needs nothing.
        None => {
            if replicated.pushed || replicated.received {
                let mut remote_sync = app_state.remote_sync.write().await;
                remote_sync.clear_account_refusal();
                remote_sync.clear_credential_refusal();

                // a push that went took everything the replica held.
                if replicated.pushed {
                    remote_sync.clear_unsendable_changes();
                }
            }

            // the moment the standing block says: a half went through, whether or not anything
            // moved. A quiet heartbeat that found nothing new still reached Turso.
            if replicated.completed {
                crate::machine::note_reached(&app_state.remote_sync, clock.as_ref()).await;
            }

            Ok(Replication::of(
                replicated,
                standing,
                held_after(app_state, organization).await,
            ))
        }
        // a credential that stopped being accepted: a lock-out rotated it and the owner
        // re-sealed a fresh one to this member. The organization database says so, and reading
        // it costs one pull; where a credential moved, the same replication is tried once more
        // under it, and nobody has to do anything.
        Some(Error::Credential { .. }) => {
            if !reconnect(app_state).await {
                app_state
                    .remote_sync
                    .write()
                    .await
                    .note_credential_refusal(clock.now());
                return Ok(Replication::of(
                    replicated,
                    standing,
                    held_after(app_state, organization).await,
                ));
            }

            let db = app_state.db.read().await;
            let again = db.replicate().await;

            // the reconnect collected a fresh credential and the retry went through, or it did
            // not and the member is told their credential needs attention rather than shown
            // nothing wrong (requirement 25's shape, for the credential rather than the account).
            {
                let mut remote_sync = app_state.remote_sync.write().await;

                // the same three answers the first dispatch has, recorded the same way: a retry
                // that the account refused is the account's, and one that went through settles
                // both, or the owner is shown an account needing attention with no sentence
                // behind it until the next heartbeat.
                match &again.refusal {
                    None => {
                        if again.pushed || again.received {
                            remote_sync.clear_account_refusal();
                            remote_sync.clear_credential_refusal();
                        }
                    }
                    Some(Error::Credential { .. }) => {
                        remote_sync.note_credential_refusal(clock.now());
                    }
                    Some(refusal) if unsendable(refusal) => {
                        remote_sync.note_unsendable_changes(clock.now());
                    }
                    Some(account) => {
                        remote_sync.note_account_refusal(&account.to_string(), clock.now());
                    }
                }
            }

            // the retry under the collected credential went through: the same moment the first
            // arm records, since this is the other place a replication completes.
            if again.refusal.is_none() && again.completed {
                crate::machine::note_reached(&app_state.remote_sync, clock.as_ref()).await;
            }

            Ok(Replication {
                pushed: replicated.pushed || again.pushed,
                received: replicated.received || again.received,
                refusal: again.refusal,
                standing,
                held_by_version: held_after(app_state, organization).await,
            })
        }
        // changes this machine holds that the workspace refuses since an upgrade (effort 857,
        // ticket 13): nothing about the account or the credential, and nothing more goes either
        // way until the person discards them. The record says so to the sync card.
        Some(refusal) if unsendable(refusal) => {
            app_state
                .remote_sync
                .write()
                .await
                .note_unsendable_changes(clock.now());

            Ok(Replication::of(
                replicated,
                standing,
                held_after(app_state, organization).await,
            ))
        }
        // requirement 25: the account's, said as the account's, and the one other refusal
        // `read_sync_refusal` reads; its message is Turso's own sentence. The local replica goes
        // on serving every read and every write; what stops is replication, until the owner has
        // seen to the account and the next one goes through.
        Some(account) => {
            app_state
                .remote_sync
                .write()
                .await
                .note_account_refusal(&account.to_string(), clock.now());

            Ok(Replication::of(
                replicated,
                standing,
                held_after(app_state, organization).await,
            ))
        }
    }
}

/// Whether a replication's refusal is changes the workspace refuses since an upgrade
/// (`database/unsendable.rs`).
fn unsendable(refusal: &Error) -> bool {
    matches!(
        refusal,
        Error::Refused {
            reason: RefusalReason::ChangesUnsendableAfterUpgrade,
            ..
        }
    )
}

/// What holds this machine once a replication has gone: the organization's verdict, and the open
/// workspace judged again over whatever its own pull brought.
async fn held_after(app_state: &Shared, organization: Standing) -> Option<HeldByVersion> {
    HeldByVersion::organization(organization).or(workspace_judged(app_state).await)
}

/// what one replication did.
///
/// **Both halves are answered, and `pushed` is the one that is easy to leave out.** A push that
/// could not reach the remote is not an error — the writes stay captured and go with the next one —
/// but something has to try again, and a caller that cannot tell a push that went from one that did
/// not has nothing to schedule on. Without it a machine on a network with no upstream sends a
/// payment at the next mutation, or never.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Replication {
    pub pushed: bool,
    pub received: bool,
    /// why a half did not go, where Turso said: the account's, or the credential's, or changes
    /// the workspace refuses since an upgrade (`unsendable`). `none` is offline or nothing to say,
    /// and the two halves say which.
    #[serde(serialize_with = "one_word")]
    pub refusal: Option<Error>,
    /// where the signed-in member stands after this replication. `signedOutElsewhere` is the one
    /// answer the caller has to act on: the wall is already up on this side and the shell reads
    /// where the machine stands again (effort 826, requirement 22).
    pub standing: SessionStanding,
    /// what holds this machine by its version after this replication (effort 857, ticket 04):
    /// the organization or the open workspace, `readOnly` or `unreadable`, judged after the
    /// organization's pull and before anything went out. `None` where this build may write both.
    /// *Not a second `standing`*, which says where the member stands, and is the session's.
    pub held_by_version: Option<HeldByVersion>,
}

/// where the member signed in on this machine stands, as the heartbeat found it.
///
/// A standing rather than a refusal: nothing failed, and what the reader is owed is the wall with
/// the sentence for it rather than an error about a call they did not make.
#[derive(serde::Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SessionStanding {
    /// somebody is signed in and their row has not moved, or nobody is signed in at all.
    Held,
    /// their sessions were ended from another machine, and this one has just put the wall up.
    SignedOutElsewhere,
}

/// The refusal as the web layer reads it: which kind, `none`, `account`, `credential` or
/// `unsendable` (effort 857, ticket 13), and never Turso's sentence, which is the owner's alone and
/// read through `organization_setup_account_refusal_detail`.
///
/// *This was `ReplicationRefusal`, an enum of the three words, until effort 840 left the crate one
/// error type (ticket 47). The words are the ones it serialised to, and
/// `a_replication_crosses_with_its_refusal_as_one_word` pins them.*
fn one_word<S: serde::Serializer>(
    refusal: &Option<Error>,
    serializer: S,
) -> Result<S::Ok, S::Error> {
    serializer.serialize_str(match refusal {
        None => "none",
        Some(Error::Credential { .. }) => "credential",
        Some(refusal) if unsendable(refusal) => "unsendable",
        Some(_) => "account",
    })
}

impl Replication {
    /// one replication and the standing the same call read, which is the only way one is built:
    /// a `From` would leave the standing to a default, and a default is how the one answer the
    /// caller must act on comes to be omitted.
    fn of(
        replicated: crate::database::Replicated,
        standing: SessionStanding,
        held_by_version: Option<HeldByVersion>,
    ) -> Self {
        Self {
            pushed: replicated.pushed,
            received: replicated.received,
            refusal: replicated.refusal,
            standing,
            held_by_version,
        }
    }
}

#[cfg(test)]
mod tests {
    use crate::credential::{CredentialStore, Credentials, Memory};
    use crate::database::Database;
    use crate::machine::RemoteSync;

    use crate::organization::invitation::join;
    use std::sync::{Arc, Mutex};
    use tokio::sync::RwLock;

    use crate::organization::member::vault::{KdfParams, open_sealed_secret_key};

    use crate::organization::session::{MEMBER_KEY_SERVICE, forget, read_entry, verifying_key_of};
    use crate::organization::setup::{CreateOrganization, Remote, create_organization};

    use super::{Opening, open_replica, sign_out, state_of};
    use crate::error::Error;
    use crate::organization::HeldOrganization;
    use crate::organization::Shared;
    use crate::organization::act::{owner_platform, owner_platform_at};
    use crate::organization::invitation::link::JoinLink;
    use crate::organization::invitation::{
        Invitation, locator, make_account_and_link, vault_password_of,
    };
    use crate::organization::member::vault::{open_content, seal_content};
    use crate::organization::role::permission;
    use crate::organization::session::{AccountCopy, CredentialSlot, Upgrade, Upgrading};
    use crate::organization::session::{MemberSession, sign_in};
    use crate::organization::store::{OrganizationNameRecord, OrganizationStore, SignedRow};
    use crate::persisted::Persisted;
    use crate::settings::Settings;
    use crate::sync::test::server::{ScriptedResponse, ScriptedServer};
    use crate::test::scratch;
    use crate::turso::consent::{
        Account, TursoConsent, forget_platform_token, holds_platform_token, move_pending_consent,
        platform_token, store_platform_token,
    };
    use crate::turso::discovery::{McpEndpoint, TursoOrganization};
    use crate::turso::platform::{
        AccessLevel, InMemoryPlatform, PlatformApi, PlatformEndpoint, TursoPlatform,
    };
    use crate::update::Update;
    use serde_json::json;

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

    /// The organization's state over one data directory, as the plugins' setups build it, with
    /// nothing open and nobody in. *`forget.rs` and `invitation/join.rs` keep the same builder; a
    /// fixture is written out per module ([[rules/testing]]).*
    async fn state_over(directory: &std::path::Path) -> Shared {
        let mut settings =
            Persisted::<Settings>::load(directory.join(Settings::FILENAME)).expect("the settings");
        settings.database_path = directory.join(Database::FILENAME);
        settings.recovery_path = directory.join(Update::FILENAME);
        settings.commit().expect("the settings");

        let settings = Arc::new(RwLock::new(settings));
        let remote_sync = RemoteSync::new(
            settings.clone(),
            directory.join(RemoteSync::FILENAME),
            crate::clock::System::shared(),
        )
        .await
        .expect("the sync record");
        // the update is the `update` plugin's and no part of this state, and it is made as a launch
        // makes it, so the directory holds the file a launch leaves.
        Update::new(settings.clone(), &crate::clock::System)
            .await
            .expect("the update");

        Shared {
            db: Arc::new(RwLock::new(Database::new(
                settings.clone(),
                crate::clock::System::shared(),
            ))),
            settings,
            remote_sync: Arc::new(RwLock::new(remote_sync)),
            upgrade: Arc::new(crate::upgrade::Upgrader),
            credentials: Arc::new(crate::credential::Memory::new()),
            consent: Arc::new(TursoConsent::new()),
            organization: Arc::new(RwLock::new(None)),
            member: Arc::new(RwLock::new(None)),
            arriving_link: Arc::new(Mutex::new(None)),
            signed_out_elsewhere: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            held_by_version: Arc::new(std::sync::Mutex::new(None)),
            old_shape_check: tokio::sync::OnceCell::new(),
        }
    }

    /// A machine that has run the first run: an organization on it, the owner's row recorded, and
    /// the owner's member key filed, which is what every launch after it starts from. Nobody is
    /// signed in here, because a launch is a fresh process.
    async fn first_run(credentials: &dyn CredentialStore, directory: &std::path::Path) -> Shared {
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
                credentials,
                &crate::clock::System::shared(),
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

    /// What the record names: the organization and the member, which is what an entry is keyed on.
    async fn recorded(app_state: &Shared) -> (String, String) {
        let mut remote_sync = app_state.remote_sync.write().await;
        let held = remote_sync
            .store_mut()
            .selected()
            .cloned()
            .expect("the record names no organization");

        (held.id, held.member_id.expect("the record names no member"))
    }

    /// What is filed under a member's entry, or nothing where nothing is.
    fn filed(
        credentials: &dyn CredentialStore,
        organization_id: &str,
        member_id: &str,
    ) -> Option<String> {
        credentials
            .get(
                MEMBER_KEY_SERVICE,
                &format!("{organization_id}:{member_id}"),
            )
            .expect("the store would not answer")
    }

    // -------------------------------------------------------------------------------------
    // Effort 828, requirement 22: the handover holds at its seams.
    // -------------------------------------------------------------------------------------

    /// **What one replication answers the web layer, pinned as it crosses** (effort 840, ticket
    /// 47): each of the refusals, as the one word `sync/host.ts`'s `ReplicationRefusal` reads, and
    /// never Turso's sentence, which is the owner's alone.
    #[test]
    fn a_replication_crosses_with_its_refusal_as_one_word() {
        use super::{Replication, SessionStanding};
        use crate::{error::RefusalReason, turso::platform::CREDENTIAL_NOT_ACCEPTED};

        let crossing = |refusal, standing| {
            serde_json::to_value(Replication {
                pushed: true,
                received: false,
                refusal,
                standing,
                held_by_version: None,
            })
            .expect("a replication did not serialise")
        };

        assert_eq!(
            crossing(None, SessionStanding::Held),
            json!({
                "pushed": true,
                "received": false,
                "refusal": "none",
                "standing": "held",
                "heldByVersion": null
            })
        );
        assert_eq!(
            crossing(
                Some(Error::refused(
                    RefusalReason::TursoAccountRefused,
                    "BLOCKED: quota exceeded",
                )),
                SessionStanding::Held
            ),
            json!({
                "pushed": true,
                "received": false,
                "refusal": "account",
                "standing": "held",
                "heldByVersion": null
            })
        );
        assert_eq!(
            crossing(
                Some(Error::Credential {
                    message: CREDENTIAL_NOT_ACCEPTED.to_string(),
                }),
                SessionStanding::SignedOutElsewhere
            ),
            json!({
                "pushed": true,
                "received": false,
                "refusal": "credential",
                "standing": "signedOutElsewhere",
                "heldByVersion": null
            })
        );
        // and changes the workspace refuses since an upgrade, which are nobody's account (effort
        // 857, ticket 13).
        assert_eq!(
            crossing(
                Some(crate::database::unsendable::refusal()),
                SessionStanding::Held
            ),
            json!({
                "pushed": true,
                "received": false,
                "refusal": "unsendable",
                "standing": "held",
                "heldByVersion": null
            })
        );
    }

    /// **Criterion 1, the sign-out half.** The keys go and so does the entry, so the next launch
    /// puts the wall up rather than letting the machine back in behind the person's back.
    #[tokio::test]
    async fn a_sign_out_forgets_the_key_and_the_next_launch_shows_the_wall() {
        let credentials: Credentials = Arc::new(Memory::new());
        let directory = scratch("signout");
        let app_state = first_run(credentials.as_ref(), &directory).await;
        let (organization_id, member_id) = recorded(&app_state).await;

        state_of(&app_state, &credentials, &crate::clock::System::shared())
            .await
            .expect("the state")
            .session
            .expect("the launch did not resume");

        sign_out(&app_state, credentials.as_ref()).await;

        assert_eq!(
            filed(credentials.as_ref(), &organization_id, &member_id),
            None,
            "the sign-out left the key in the store"
        );

        // the next launch: a fresh process over the same data directory.
        let next = state_over(&directory).await;
        let state = state_of(&next, &credentials, &crate::clock::System::shared())
            .await
            .expect("the state");

        assert!(state.session.is_none(), "the wall did not come back up");
        assert_eq!(
            state.selected_organization().map(|held| held.member_id),
            Some(Some(member_id)),
            "the record forgot the member a sign-out keeps"
        );
    }

    /// A second organization made on the machine `app_state` is, beside the one it holds, by a
    /// first run of its own: the owner's key filed for it, and it selected.
    async fn another_organization(
        credentials: &dyn CredentialStore,
        directory: &std::path::Path,
        app_state: &Shared,
    ) -> HeldOrganization {
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
                        "hostname": "ledger-another-org.aws-eu-west-1.turso.io",
                        "group": "rentable"
                    }]).to_string() }] }
                })
                .to_string(),
            ),
        ])
        .await;
        let platform = Arc::new(InMemoryPlatform::new("another-org"));
        let mut remote_sync = app_state.remote_sync.write().await;
        let (created, _) = create_organization(
            credentials,
            &crate::clock::System::shared(),
            remote_sync.store_mut(),
            "a-platform-token",
            &McpEndpoint::at(&mcp.url("")),
            |_| Arc::clone(&platform),
            Remote::none(),
            &directory.join(Database::FILENAME),
            CreateOrganization {
                name: "Beta",
                username: USERNAME,
                password: PASSWORD,
                group: None,
            },
            test_cost(),
            CREATED_AT,
        )
        .await
        .expect("the second first run failed");

        remote_sync
            .store_mut()
            .held(&created.organization_id)
            .cloned()
            .expect("the second organization was not recorded")
    }

    /// **Effort 851, criterion 8, and the selection.** A machine holds two organizations and is
    /// signed in to the second, the one its last first run selected. Choosing another organization
    /// is refused while somebody is in. The sign-out deletes the open organization's remembered
    /// key alone, and the wall stands on it with both organizations listed. Choosing the first
    /// then persists on the record, the state answers with it, and what the wall said, what Turso
    /// last refused and when a workspace was last reached go with the selection.
    #[tokio::test]
    async fn a_sign_out_forgets_the_open_organizations_key_alone_and_a_selection_waits_for_it() {
        let credentials: Credentials = Arc::new(Memory::new());
        let directory = scratch("select");
        let app_state = first_run(credentials.as_ref(), &directory).await;
        let (first_id, first_member) = recorded(&app_state).await;
        let second = another_organization(credentials.as_ref(), &directory, &app_state).await;
        let second_member = second.member_id.clone().expect("the second owner");
        let clock = crate::clock::System::shared();

        let state = state_of(&app_state, &credentials, &clock)
            .await
            .expect("the state");

        assert_eq!(
            state
                .session
                .as_ref()
                .map(|session| session.organization_id.as_str()),
            Some(second.id.as_str()),
            "the launch did not resume the selected organization"
        );
        assert_eq!(
            state
                .organizations
                .iter()
                .map(|held| held.id.as_str())
                .collect::<Vec<_>>(),
            vec![first_id.as_str(), second.id.as_str()]
        );

        // signed in: choosing another organization waits for the sign-out.
        let refused = super::select(&app_state, &first_id).await;

        assert!(
            matches!(
                refused,
                Err(Error::Refused {
                    reason: crate::error::RefusalReason::SessionOpen,
                    ..
                })
            ),
            "{refused:?}"
        );
        assert_eq!(
            app_state
                .remote_sync
                .write()
                .await
                .store_mut()
                .selected_organization
                .as_deref(),
            Some(second.id.as_str())
        );

        // the sign-out: the open organization's key goes, and the first's stays.
        sign_out(&app_state, credentials.as_ref()).await;

        assert_eq!(
            filed(credentials.as_ref(), &second.id, &second_member),
            None,
            "the sign-out left the open organization's key"
        );
        assert!(
            filed(credentials.as_ref(), &first_id, &first_member).is_some(),
            "the sign-out took another organization's key"
        );

        let state = state_of(&app_state, &credentials, &clock)
            .await
            .expect("the state");

        assert!(state.session.is_none());
        assert_eq!(state.selected.as_deref(), Some(second.id.as_str()));
        assert_eq!(state.organizations.len(), 2);

        // what was the open organization's, to be cleared with the selection.
        app_state
            .signed_out_elsewhere
            .store(true, std::sync::atomic::Ordering::SeqCst);
        {
            let mut remote_sync = app_state.remote_sync.write().await;

            remote_sync.note_account_refusal("over quota", 1);
            remote_sync.note_credential_refusal(1);
            remote_sync.note_reached(1).expect("the moment");
        }

        super::select(&app_state, &first_id)
            .await
            .expect("the selection was refused");

        let state = state_of(&app_state, &credentials, &clock)
            .await
            .expect("the state");

        assert_eq!(state.selected.as_deref(), Some(first_id.as_str()));
        assert_eq!(
            state.selected_organization().map(|held| held.id),
            Some(first_id.clone()),
            "the state does not name the chosen organization"
        );
        assert!(!state.signed_out_elsewhere, "the wall's sentence stayed");

        {
            let mut remote_sync = app_state.remote_sync.write().await;

            assert_eq!(remote_sync.account_refusal_detail(), None);
            assert_eq!(
                remote_sync
                    .get_state()
                    .await
                    .expect("the sync state")
                    .credential_refusal,
                None
            );
            assert_eq!(remote_sync.store_mut().last_reached_at, None);
        }

        // on the record, on disk.
        let written: serde_json::Value = serde_json::from_str(
            &std::fs::read_to_string(directory.join(RemoteSync::FILENAME)).expect("the record"),
        )
        .expect("the record is json");

        assert_eq!(written["selectedOrganization"], json!(first_id));

        // and an organization this machine does not hold is refused.
        assert!(matches!(
            super::select(&app_state, "nobody-holds-this").await,
            Err(Error::Refused {
                reason: crate::error::RefusalReason::NoOrganization,
                ..
            })
        ));
    }

    /// **Effort 851: removing the organization open forgets it and signs out of it; removing
    /// another leaves the open one open.** The no-workspace screen removes an organization without
    /// signing anybody out, and the wall removes the one it stands on.
    #[tokio::test]
    async fn removing_another_organization_leaves_the_open_one_open() {
        let credentials: Credentials = Arc::new(Memory::new());
        let directory = scratch("remove-other");
        let app_state = first_run(credentials.as_ref(), &directory).await;
        let (first_id, first_member) = recorded(&app_state).await;
        let second = another_organization(credentials.as_ref(), &directory, &app_state).await;
        let clock = crate::clock::System::shared();

        state_of(&app_state, &credentials, &clock)
            .await
            .expect("the state")
            .session
            .expect("the launch did not resume");

        super::remove(&app_state, credentials.as_ref(), &first_id)
            .await
            .expect("the remove failed");

        let state = state_of(&app_state, &credentials, &clock)
            .await
            .expect("the state");

        assert_eq!(
            state.session.map(|session| session.organization_id),
            Some(second.id.clone()),
            "removing another organization signed the open one out"
        );
        assert_eq!(state.selected.as_deref(), Some(second.id.as_str()));
        assert_eq!(state.organizations.len(), 1);
        assert_eq!(filed(credentials.as_ref(), &first_id, &first_member), None);

        // and the open one: signed out, and nothing left held.
        super::remove(&app_state, credentials.as_ref(), &second.id)
            .await
            .expect("the remove failed");

        let state = state_of(&app_state, &credentials, &clock)
            .await
            .expect("the state");

        assert!(state.session.is_none());
        assert!(app_state.organization.read().await.is_none());
        assert!(state.organizations.is_empty());
        assert_eq!(state.selected, None);
    }

    /// **Effort 851, criterion 5: each held organization says whether this machine holds its own
    /// Turso consent**, which is what the switcher's remove confirm says the account goes by. Two
    /// organizations are held and only the first's consent is filed: the state says so of each,
    /// and the top-level answer is the selected one's, which is the second.
    #[tokio::test]
    async fn each_held_organization_says_whether_this_machine_holds_its_consent() {
        let credentials: Credentials = Arc::new(Memory::new());
        let directory = scratch("consent-each");
        let app_state = first_run(credentials.as_ref(), &directory).await;
        let (first_id, _) = recorded(&app_state).await;
        let second = another_organization(credentials.as_ref(), &directory, &app_state).await;

        for id in [first_id.as_str(), second.id.as_str()] {
            forget_platform_token(credentials.as_ref(), &Account::of(id)).expect("the forget");
        }
        store_platform_token(credentials.as_ref(), "token-a").expect("the consent");
        move_pending_consent(credentials.as_ref(), &first_id).expect("the move");

        let state = state_of(&app_state, &credentials, &crate::clock::System::shared())
            .await
            .expect("the state");
        let holds = |id: &str| {
            state
                .organizations
                .iter()
                .find(|held| held.id == id)
                .map(|held| held.holds_turso_authority)
        };

        assert_eq!(
            holds(&first_id),
            Some(true),
            "the first's consent is not read"
        );
        assert_eq!(
            holds(&second.id),
            Some(false),
            "the second reads another's consent"
        );
        assert_eq!(state.selected.as_deref(), Some(second.id.as_str()));
        assert!(
            !state.holds_turso_authority,
            "the top-level answer is not the selected organization's"
        );
    }

    /// **The owner is never left stuck on a consent Turso no longer accepts** (the link refused on
    /// 2026-10-06). An act spending the organization's own consent is refused as `invalid api
    /// token`; the answer tells the owner to connect Turso again, and the state reads the
    /// organization as holding no authority, which is what puts the connect card in its settings.
    #[tokio::test]
    async fn a_consent_turso_no_longer_accepts_reads_as_not_connected() {
        let credentials: Credentials = Arc::new(Memory::new());
        let directory = scratch("consent-lost");
        let app_state = first_run(credentials.as_ref(), &directory).await;
        let (organization_id, _) = recorded(&app_state).await;

        store_platform_token(credentials.as_ref(), "a-revoked-consent").expect("the consent");
        move_pending_consent(credentials.as_ref(), &organization_id).expect("the move");

        let server = ScriptedServer::start(vec![ScriptedResponse::new(
            401,
            json!({ "error": "invalid api token" }).to_string(),
        )])
        .await;
        let platform = owner_platform_at(
            &app_state,
            &credentials,
            &organization_id,
            PlatformEndpoint::at(&server.url("")),
        )
        .await
        .expect("the machine holds the organization's consent");

        let refused = platform
            .mint_token(
                &format!("org-{organization_id}"),
                "3d",
                AccessLevel::FullAccess,
            )
            .await
            .expect_err("a refused consent minted a credential");

        assert!(matches!(
            refused,
            Error::Refused {
                reason: crate::error::RefusalReason::TursoConsentLost,
                ..
            }
        ));

        let state = state_of(&app_state, &credentials, &crate::clock::System::shared())
            .await
            .expect("the state");

        assert_eq!(state.selected.as_deref(), Some(organization_id.as_str()));
        assert!(
            !state.holds_turso_authority,
            "the settings would still offer acts on a consent Turso refuses"
        );
        assert!(
            owner_platform(&app_state, &credentials, &organization_id)
                .await
                .is_none()
        );
    }

    /// **Criterion 1, the disconnect half.** A machine that has let go of the organization holds
    /// no key to a vault in it either. The forget signs out first, which is where the entry goes.
    #[tokio::test]
    async fn a_disconnect_forgets_the_key_with_everything_else() {
        let credentials: Credentials = Arc::new(Memory::new());
        let directory = scratch("disconnect");
        let app_state = first_run(credentials.as_ref(), &directory).await;
        let (organization_id, member_id) = recorded(&app_state).await;

        state_of(&app_state, &credentials, &crate::clock::System::shared())
            .await
            .expect("the state");
        forget::forget_the_open_one(&app_state, credentials.as_ref())
            .await
            .expect("the forget failed");

        assert_eq!(
            filed(credentials.as_ref(), &organization_id, &member_id),
            None,
            "the disconnect left the key in the store"
        );
    }

    /// **Criterion 2, the refusal half.** A locked keychain, or a machine with no secret service:
    /// the first run succeeds, nothing is filed, and the next launch asks for a password. Never a
    /// failure surface.
    #[tokio::test]
    async fn a_store_that_refuses_the_key_does_not_fail_the_first_run() {
        let memory = Arc::new(Memory::new());
        let credentials: Credentials = memory.clone();
        let directory = scratch("refused");

        memory.refuse_the_next_store();

        let app_state = first_run(credentials.as_ref(), &directory).await;
        let (organization_id, member_id) = recorded(&app_state).await;

        assert_eq!(
            filed(credentials.as_ref(), &organization_id, &member_id),
            None,
            "the store took a value it was told to refuse"
        );

        let state = state_of(&app_state, &credentials, &crate::clock::System::shared())
            .await
            .expect("the state");

        assert!(
            state.selected_organization().is_some(),
            "the first run did not finish"
        );
        assert!(state.session.is_none(), "a launch with no key signed in");
    }

    /// **Criterion 3.** Neither the password nor the key it derives reaches anything this machine
    /// wrote: not the record, and not a replica. The key is in the credential store, which is the
    /// whole reason it is filed there, and the sweep reads every file the data directory holds
    /// rather than the ones it expects to find.
    #[tokio::test]
    async fn neither_the_password_nor_the_member_key_reaches_a_file_this_machine_wrote() {
        let credentials: Credentials = Arc::new(Memory::new());
        let directory = scratch("secrecy");
        let app_state = first_run(credentials.as_ref(), &directory).await;
        let (organization_id, member_id) = recorded(&app_state).await;

        // the sign-in at the wall, which is what `organization_session_sign_in` performs: the
        // replica is opened, the password is tried, and the record is written back naming the
        // member.
        let held = {
            let mut remote_sync = app_state.remote_sync.write().await;

            remote_sync
                .store_mut()
                .selected()
                .cloned()
                .expect("the record")
        };
        let (store, credential) = open_replica(
            &app_state,
            &credentials,
            &crate::clock::System::shared(),
            &held,
            Opening::Password {
                username: USERNAME,
                password: PASSWORD,
            },
        )
        .await
        .expect("the replica");
        let session = {
            let mut remote_sync = app_state.remote_sync.write().await;

            join::admit(
                credentials.as_ref(),
                &store,
                remote_sync.store_mut(),
                &held,
                USERNAME,
                PASSWORD,
                &credential,
                crate::clock::Clock::now(&crate::clock::System),
            )
            .await
            .expect("the sign-in failed")
        };

        assert_eq!(session.member_id, member_id);

        let encoded = filed(credentials.as_ref(), &organization_id, &member_id)
            .expect("the sign-in filed no key");
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
    // -------------------------------------------------------------------------------------
    // Effort 851, requirements 26 and 29: the organization's name is the one the owner signed.
    // -------------------------------------------------------------------------------------

    /// A replica of the organization `store` holds, on another machine whose data directory is
    /// `directory`, carrying every row `store` holds.
    async fn replica_beside(
        store: &OrganizationStore,
        directory: &std::path::Path,
        organization_id: &str,
    ) -> OrganizationStore {
        std::fs::create_dir_all(directory).expect("the data directory");

        let replica = OrganizationStore::open(
            crate::clock::System::shared(),
            &OrganizationStore::replica_path(&directory.join(Database::FILENAME), organization_id),
            None,
            || async { Ok::<String, turso::Error>(String::new()) },
        )
        .await
        .expect("the second replica");

        replica.install_schema().await.expect("the schema");
        synced(store, &replica).await;

        replica
    }

    /// What a pull brings, with no remote to bring it from: every row of every table `from` holds,
    /// in place of what `to` holds there. A table `to` lacks is what an earlier build's replica
    /// lacks, and is left out, as a pull leaves it to `complete_schema`.
    async fn synced(from: &OrganizationStore, to: &OrganizationStore) {
        let present = to.tables().await.expect("the tables");

        for table in from.tables().await.expect("the tables") {
            if !present.contains(&table) {
                continue;
            }

            to.connection()
                .execute(&format!("DELETE FROM \"{table}\""), ())
                .await
                .expect("the old rows");

            let mut rows = from
                .connection()
                .query(&format!("SELECT * FROM \"{table}\""), ())
                .await
                .expect("the rows");

            while let Some(row) = rows.next().await.expect("a row") {
                let values: Vec<turso::Value> = (0..row.column_count())
                    .map(|index| row.get_value(index).expect("a value"))
                    .collect();
                let placeholders = vec!["?"; values.len()].join(", ");

                to.connection()
                    .execute(
                        &format!("INSERT INTO \"{table}\" VALUES ({placeholders})"),
                        values,
                    )
                    .await
                    .expect("the row");
            }
        }
    }

    /// The organization's replica on `app_state`'s machine, opened as a test reads it.
    async fn replica_of(app_state: &Shared) -> OrganizationStore {
        let (organization_id, _) = recorded(app_state).await;
        let database_path = app_state.settings.read().await.database_path.clone();

        OrganizationStore::open(
            crate::clock::System::shared(),
            &OrganizationStore::replica_path(&database_path, &organization_id),
            None,
            || async { Ok::<String, turso::Error>(String::new()) },
        )
        .await
        .expect("the replica")
    }

    /// The owner signed in on the first run's replica, as a test acts for them.
    async fn the_owner(store: &OrganizationStore, app_state: &Shared) -> MemberSession {
        let held = {
            let mut remote_sync = app_state.remote_sync.write().await;

            remote_sync
                .store_mut()
                .selected()
                .cloned()
                .expect("the entry")
        };

        sign_in(store, &held, PASSWORD, &Arc::new(Mutex::new(None)))
            .await
            .expect("the owner did not sign in")
    }

    /// A member's machine: invited by `owner` on `owner_store`, holding a replica of it in
    /// `directory`, signed in there, and past its launch's checks. What the state reads of it is
    /// what a member's screen shows.
    async fn a_members_machine(
        owner_store: &OrganizationStore,
        owner: &MemberSession,
        directory: &std::path::Path,
        username: &'static str,
    ) -> Shared {
        let link = locator(owner_store, owner).await.expect("the link");
        let invited = make_account_and_link(
            owner_store,
            owner,
            None::<&InMemoryPlatform>,
            &link,
            Invitation {
                username,
                role: permission::MEMBER,
                workspaces: &[],
            },
            test_cost(),
            CREATED_AT + 1,
        )
        .await
        .expect("the invitation");
        let replica = replica_beside(owner_store, directory, &owner.organization_id).await;
        let app_state = state_over(directory).await;
        let held = {
            let mut remote_sync = app_state.remote_sync.write().await;
            let record = remote_sync.store_mut();

            record.hold(HeldOrganization {
                id: owner.organization_id.clone(),
                name: "Acme".to_string(),
                verifying_key: base64::Engine::encode(
                    &base64::engine::general_purpose::URL_SAFE_NO_PAD,
                    owner.verifying_key,
                ),
                remote_url: "libsql://org-acme.turso.io".to_string(),
                machine_id: format!("machine-{username}"),
                member_id: Some(invited.member_id.clone()),
                role: Some(permission::MEMBER.to_string()),
                joined_at: CREATED_AT + 1,
                format: None,
                machine_signed_out: 0,
                turso_organization: None,
                workspace_id: None,
                name_signed: false,
                name_signed_at: 0,
                lock_marked: false,
                own_lock_latched: Vec::new(),
            });
            record.commit().expect("the record");
            record.selected().cloned().expect("the entry")
        };
        let member = sign_in(
            &replica,
            &held,
            &vault_password_of(&invited.join_link, &invited.code, test_cost()),
            &Arc::new(Mutex::new(None)),
        )
        .await
        .expect("the member did not sign in");

        *app_state.organization.write().await = Some(replica);
        *app_state.member.write().await = Some(member);
        app_state
            .old_shape_check
            .set(())
            .expect("the launch's checks had run");

        app_state
    }

    /// The owner renames the organization through the rename itself (effort 851, ticket 10): the
    /// signed row and the unsigned column, with the same sealed name.
    async fn renamed(store: &OrganizationStore, owner: &MemberSession, name: &str, at: i64) {
        crate::organization::setup::rename_organization(store, owner, name, at)
            .await
            .expect("the owner's rename");
    }

    /// What `app_state`'s machine names the organization: in the session, and in the record the
    /// wall and the switcher draw from.
    async fn names_on(app_state: &Shared, credentials: &Credentials) -> (String, String) {
        let state = state_of(app_state, credentials, &crate::clock::System::shared())
            .await
            .expect("the state");

        let held = state.selected_organization().expect("nothing is held").name;

        (
            state
                .session
                .expect("nobody is signed in")
                .organization_name,
            held,
        )
    }

    /// Whether `app_state`'s record has read a signed name.
    async fn read_signed(app_state: &Shared) -> bool {
        let mut remote_sync = app_state.remote_sync.write().await;

        remote_sync
            .store_mut()
            .selected()
            .expect("the entry")
            .name_signed
    }

    /// The pair a machine names when the session and the record both say `name`.
    fn both(name: &str) -> (String, String) {
        (name.to_string(), name.to_string())
    }

    /// **Criterion 26.** The owner renames; a member's machine whose replica syncs while they are
    /// signed in names the new name in its session and its record, and a member's machine that has
    /// not synced still names the old one.
    #[tokio::test]
    async fn a_members_machine_names_the_new_name_once_it_has_synced() {
        let credentials: Credentials = Arc::new(Memory::new());
        let elsewhere: Credentials = Arc::new(Memory::new());
        let directory = scratch("signed-name-follows");
        let owners = first_run(credentials.as_ref(), &directory.join("owner")).await;
        let store = replica_of(&owners).await;
        let owner = the_owner(&store, &owners).await;
        let syncs = a_members_machine(&store, &owner, &directory.join("syncs"), "sami.staff").await;
        let behind =
            a_members_machine(&store, &owner, &directory.join("behind"), "bea.staff").await;

        assert_eq!(names_on(&syncs, &elsewhere).await, both("Acme"));
        assert!(read_signed(&syncs).await, "the signed name was not latched");

        renamed(&store, &owner, "Acme Rentals", CREATED_AT + 10).await;

        // before its replica has synced, the member's machine names the name it has.
        assert_eq!(names_on(&syncs, &elsewhere).await, both("Acme"));

        {
            let organization = syncs.organization.read().await;

            synced(&store, organization.as_ref().expect("the replica")).await;
        }

        assert_eq!(
            names_on(&syncs, &elsewhere).await,
            both("Acme Rentals"),
            "the member's machine did not follow the rename"
        );
        assert_eq!(
            names_on(&behind, &elsewhere).await,
            both("Acme"),
            "a machine that has not synced named a name it never received"
        );
    }

    /// **Criterion 29, a forged name.** Once a member's machine has read the name the owner signed,
    /// a new `name_sealed` written straight into its replica without the owner's signature is not
    /// shown; neither is a signed row whose name somebody swapped, nor the unsigned column once
    /// the signed row is deleted. It keeps naming the last name that verified.
    #[tokio::test]
    async fn a_name_the_owner_did_not_sign_is_not_shown() {
        let credentials: Credentials = Arc::new(Memory::new());
        let elsewhere: Credentials = Arc::new(Memory::new());
        let directory = scratch("signed-name-forged");
        let owners = first_run(credentials.as_ref(), &directory.join("owner")).await;
        let store = replica_of(&owners).await;
        let owner = the_owner(&store, &owners).await;
        let member =
            a_members_machine(&store, &owner, &directory.join("member"), "sami.staff").await;
        let forged = seal_content(
            &owner.content_key,
            "organization.name_sealed",
            b"Forged Rentals",
        )
        .expect("the sealed name");

        assert_eq!(names_on(&member, &elsewhere).await, both("Acme"));

        for (statement, what) in [
            (
                "UPDATE \"organization\" SET \"name_sealed\" = ?",
                "an unsigned name written straight into the replica",
            ),
            (
                "UPDATE \"organization_name\" SET \"name_sealed\" = ?",
                "a signed row with its name swapped",
            ),
            (
                "DELETE FROM \"organization_name\" WHERE \"name_sealed\" = ?",
                "the signed row deleted",
            ),
        ] {
            {
                let organization = member.organization.read().await;

                organization
                    .as_ref()
                    .expect("the replica")
                    .connection()
                    .execute(statement, vec![turso::Value::Blob(forged.clone())])
                    .await
                    .unwrap_or_else(|error| panic!("{what}: {error}"));
            }

            assert_eq!(
                names_on(&member, &elsewhere).await,
                both("Acme"),
                "{what} was shown"
            );
        }
    }

    /// The owner's signed name row `old`, put back into `replica` as it lay, which is all a
    /// member who can write the replica needs to roll the name back.
    async fn put_back(replica: &OrganizationStore, old: &SignedRow<OrganizationNameRecord>) {
        replica
            .connection()
            .execute(
                "UPDATE \"organization_name\" SET \"name_sealed\" = ?, \"updated_at\" = ?,                  \"certificate_id\" = ?, \"signature\" = ?",
                vec![
                    turso::Value::Blob(old.record.name_sealed.clone()),
                    turso::Value::Integer(old.record.updated_at),
                    turso::Value::Text(old.certificate_id.clone()),
                    turso::Value::Blob(old.signature.clone()),
                ],
            )
            .await
            .expect("the old row put back");
    }

    /// **Criterion 29, a name rolled back.** A row the owner signed before the name a machine
    /// last read verifies, but a member's machine that has read the newer one keeps naming it when
    /// the old row is put back into its replica, and the owner's machine signs its own name again
    /// over the old row, so every machine moves forward to it. A row that is current is left as
    /// it is.
    #[tokio::test]
    async fn a_name_the_owner_signed_before_is_not_put_back() {
        let credentials: Credentials = Arc::new(Memory::new());
        let elsewhere: Credentials = Arc::new(Memory::new());
        let directory = scratch("signed-name-rolled-back");
        let owners = first_run(credentials.as_ref(), &directory.join("owner")).await;
        let store = replica_of(&owners).await;
        let owner = the_owner(&store, &owners).await;
        let member =
            a_members_machine(&store, &owner, &directory.join("member"), "sami.staff").await;

        assert_eq!(names_on(&member, &elsewhere).await, both("Acme"));

        let old = store
            .organization_name_row()
            .await
            .expect("the read")
            .expect("the signed row");

        renamed(&store, &owner, "Acme Rentals", CREATED_AT + 10).await;

        {
            let organization = member.organization.read().await;

            synced(&store, organization.as_ref().expect("the replica")).await;
        }

        assert_eq!(names_on(&member, &elsewhere).await, both("Acme Rentals"));

        {
            let organization = member.organization.read().await;

            put_back(organization.as_ref().expect("the replica"), &old).await;
        }

        assert_eq!(
            names_on(&member, &elsewhere).await,
            both("Acme Rentals"),
            "the name the owner signed before was put back"
        );

        // the owner's machine, latched on the name it gave, finds the old row put back.
        let latched = store
            .organization_name(&owner.verifying_key)
            .await
            .expect("the read")
            .expect("the renamed row")
            .updated_at;
        let held = {
            let mut remote_sync = owners.remote_sync.write().await;

            HeldOrganization {
                name: "Acme Rentals".to_string(),
                name_signed: true,
                name_signed_at: latched,
                ..remote_sync
                    .store_mut()
                    .selected()
                    .cloned()
                    .expect("the entry")
            }
        };

        put_back(&store, &old).await;

        assert!(
            crate::organization::ownership::sign_organization_name(
                &store,
                &owner.verifying_key,
                &owner.member_id,
                &owner.secret,
                Some(&held),
                CREATED_AT + 20,
            )
            .await
            .expect("the signing"),
            "the owner's machine left the old row in place"
        );

        let signed = store
            .organization_name(&owner.verifying_key)
            .await
            .expect("the read")
            .expect("the owner's machine signed nothing");

        assert!(
            signed.updated_at >= latched,
            "the name was signed before the one the owner's machine last read"
        );
        assert_eq!(
            open_content(
                &owner.content_key,
                "organization.name_sealed",
                &signed.name_sealed
            )
            .expect("the name opens"),
            b"Acme Rentals",
            "the owner's machine signed another name than its own"
        );

        {
            let organization = member.organization.read().await;

            synced(&store, organization.as_ref().expect("the replica")).await;
        }

        assert_eq!(names_on(&member, &elsewhere).await, both("Acme Rentals"));
        assert!(
            !crate::organization::ownership::sign_organization_name(
                &store,
                &owner.verifying_key,
                &owner.member_id,
                &owner.secret,
                Some(&held),
                CREATED_AT + 30,
            )
            .await
            .expect("the signing"),
            "the owner's machine signed over a name that is current"
        );
    }

    /// **Criterion 29, an organization made before this change.** Its replicas hold no signed
    /// name, and a member's of an earlier build not even the table: the member's machine opens it
    /// and names its name from the unsigned column. The owner's next launch signs that same name,
    /// and the member's machine, once it has synced, reads it signed and names the same name.
    #[tokio::test]
    async fn an_organization_made_before_the_signed_name_names_its_name_before_and_after_it_is_signed()
     {
        let credentials: Credentials = Arc::new(Memory::new());
        let elsewhere: Credentials = Arc::new(Memory::new());
        let directory = scratch("signed-name-before");
        let owners = first_run(credentials.as_ref(), &directory.join("owner")).await;
        let member = {
            let store = replica_of(&owners).await;
            let owner = the_owner(&store, &owners).await;

            // what an organization made before this change holds: no signed name.
            store
                .connection()
                .execute("DELETE FROM \"organization_name\"", ())
                .await
                .expect("the organization before the signed name");

            let member =
                a_members_machine(&store, &owner, &directory.join("member"), "sami.staff").await;

            {
                let organization = member.organization.read().await;

                organization
                    .as_ref()
                    .expect("the replica")
                    .connection()
                    .execute("DROP TABLE \"organization_name\"", ())
                    .await
                    .expect("a replica an earlier build made");
            }

            member
        };

        assert_eq!(
            names_on(&member, &elsewhere).await,
            both("Acme"),
            "an organization made before the signed name lost its name"
        );
        assert!(!read_signed(&member).await, "an unsigned name was latched");

        // the owner's next launch resumes the owner, and their machine signs the name.
        assert_eq!(names_on(&owners, &credentials).await, both("Acme"));

        {
            let organization = owners.organization.read().await;
            let store = organization.as_ref().expect("the owner's replica");
            let row = store
                .organization()
                .await
                .expect("the row")
                .expect("the organization");
            let name = store
                .organization_name(&row.verifying_key)
                .await
                .expect("the read")
                .expect("the owner's machine did not sign the name");

            assert_eq!(
                name.name_sealed, row.name_sealed,
                "the name signed is not the one the organization carried"
            );

            let theirs = member.organization.read().await;
            let replica = theirs.as_ref().expect("the replica");

            assert!(
                replica.complete_schema().await.expect("the completion"),
                "the earlier build's replica was not completed"
            );
            synced(store, replica).await;
        }

        assert_eq!(names_on(&member, &elsewhere).await, both("Acme"));
        assert!(
            read_signed(&member).await,
            "the signed name was not latched"
        );
        assert!(
            read_signed(&owners).await,
            "the owner's own machine did not latch"
        );
    }

    /// **Criterion 29, a forgery before the owner's machine first signs.** An organization made
    /// before the signed name, whose unsigned column a member rewrote before the owner's first
    /// sign-in on this build: the owner's machine signs the name its own entry holds, never the
    /// column's, and writes the column back with it, so every machine names the owner's name.
    #[tokio::test]
    async fn the_owners_first_signing_never_signs_a_column_somebody_rewrote() {
        let credentials: Credentials = Arc::new(Memory::new());
        let elsewhere: Credentials = Arc::new(Memory::new());
        let directory = scratch("signed-name-forged-before");
        let owners = first_run(credentials.as_ref(), &directory.join("owner")).await;
        let (member, owner) = {
            let store = replica_of(&owners).await;
            let owner = the_owner(&store, &owners).await;
            let forged = seal_content(
                &owner.content_key,
                "organization.name_sealed",
                b"Forged Rentals",
            )
            .expect("the sealed name");

            // what an organization made before this change holds, no signed name, with the
            // unsigned column rewritten by a member holding the credential.
            store
                .connection()
                .execute("DELETE FROM \"organization_name\"", ())
                .await
                .expect("the organization before the signed name");
            store
                .connection()
                .execute(
                    "UPDATE \"organization\" SET \"name_sealed\" = ?",
                    vec![turso::Value::Blob(forged)],
                )
                .await
                .expect("the forged column");

            let member =
                a_members_machine(&store, &owner, &directory.join("member"), "sami.staff").await;

            (member, owner)
        };

        assert!(
            !read_signed(&owners).await,
            "the owner's machine had read a signed name before its first signing"
        );

        // the owner's next launch resumes the owner, and their machine signs the name.
        assert_eq!(
            names_on(&owners, &credentials).await,
            both("Acme"),
            "the owner's machine named the forged column"
        );

        let name_of = |sealed: &[u8]| {
            String::from_utf8(
                open_content(&owner.content_key, "organization.name_sealed", sealed)
                    .expect("the name opens"),
            )
            .expect("a name")
        };

        {
            let organization = owners.organization.read().await;
            let store = organization.as_ref().expect("the owner's replica");
            let signed = store
                .organization_name(&owner.verifying_key)
                .await
                .expect("the read")
                .expect("the owner's machine did not sign the name");

            assert_eq!(
                name_of(&signed.name_sealed),
                "Acme",
                "the owner's machine signed the forged column"
            );
            assert_eq!(
                name_of(
                    &store
                        .organization()
                        .await
                        .expect("the row")
                        .expect("the organization")
                        .name_sealed
                ),
                "Acme",
                "the unsigned column was left forged"
            );

            let theirs = member.organization.read().await;

            synced(store, theirs.as_ref().expect("the replica")).await;
        }

        assert_eq!(names_on(&member, &elsewhere).await, both("Acme"));
        assert!(
            read_signed(&member).await,
            "the signed name was not latched"
        );
    }

    /// **Criterion 29, the owner's machine after a forgery.** Once a signed name has been seen, a
    /// member deletes the signed row and rewrites `name_sealed`: the owner's next sign-in writes a
    /// signed row naming the previous name, and the unsigned column with it, never the forged one,
    /// and no machine shows the forged name.
    #[tokio::test]
    async fn the_owners_machine_never_signs_a_name_written_around_the_signed_row() {
        let credentials: Credentials = Arc::new(Memory::new());
        let elsewhere: Credentials = Arc::new(Memory::new());
        let directory = scratch("signed-name-not-laundered");
        let owners = first_run(credentials.as_ref(), &directory.join("owner")).await;

        // the owner's launch reads the signed name, and their record latches it.
        assert_eq!(names_on(&owners, &credentials).await, both("Acme"));
        assert!(
            read_signed(&owners).await,
            "the owner's machine did not latch"
        );

        let (member, verifying_key) = {
            let organization = owners.organization.read().await;
            let store = organization.as_ref().expect("the owner's replica");
            let session = owners.member.read().await;
            let owner = session.as_ref().expect("the owner's session");
            let member =
                a_members_machine(store, owner, &directory.join("member"), "sami.staff").await;

            // the member's machine reads the signed name too, and latches it.
            assert_eq!(names_on(&member, &elsewhere).await, both("Acme"));

            let forged = seal_content(
                &owner.content_key,
                "organization.name_sealed",
                b"Forged Rentals",
            )
            .expect("the sealed name");

            // a member holding the credential: the signed row deleted, the column rewritten.
            store
                .connection()
                .execute("DELETE FROM \"organization_name\"", ())
                .await
                .expect("the deletion");
            store
                .connection()
                .execute(
                    "UPDATE \"organization\" SET \"name_sealed\" = ?",
                    vec![turso::Value::Blob(forged)],
                )
                .await
                .expect("the forged column");

            {
                let theirs = member.organization.read().await;

                synced(store, theirs.as_ref().expect("the replica")).await;
            }

            assert_eq!(
                names_on(&member, &elsewhere).await,
                both("Acme"),
                "the forged name reached the member's screen"
            );

            (member, owner.verifying_key)
        };

        // the owner signs out, and signs in again.
        sign_out(&owners, credentials.as_ref()).await;

        let store = replica_of(&owners).await;
        let owner = the_owner(&store, &owners).await;
        let name_of = |sealed: &[u8]| {
            String::from_utf8(
                open_content(&owner.content_key, "organization.name_sealed", sealed)
                    .expect("the name opens"),
            )
            .expect("a name")
        };
        let signed = store
            .organization_name(&verifying_key)
            .await
            .expect("the read")
            .expect("the owner's sign-in signed no name");

        assert_eq!(
            name_of(&signed.name_sealed),
            "Acme",
            "the owner's machine signed the forged name"
        );
        assert_eq!(
            name_of(
                &store
                    .organization()
                    .await
                    .expect("the row")
                    .expect("the organization")
                    .name_sealed
            ),
            "Acme",
            "the unsigned column was left forged"
        );

        // and the member's machine, synced before and after, names the previous name throughout.
        assert_eq!(names_on(&member, &elsewhere).await, both("Acme"));

        {
            let organization = member.organization.read().await;

            synced(&store, organization.as_ref().expect("the replica")).await;
        }

        assert_eq!(names_on(&member, &elsewhere).await, both("Acme"));
    }

    // -------------------------------------------------------------------------------------
    // Effort 851, requirements 23 to 28: the owner renames the organization.
    // -------------------------------------------------------------------------------------

    /// The owner signed in on the first run's machine, as the shell holds them after a sign-in.
    async fn owner_signed_in(owners: &Shared) {
        let store = replica_of(owners).await;
        let owner = the_owner(&store, owners).await;

        *owners.organization.write().await = Some(store);
        *owners.member.write().await = Some(owner);
        owners
            .old_shape_check
            .set(())
            .expect("the launch's checks had run");
    }

    /// The account and its link the signed-in owner on `owners` makes for `username`: the link's
    /// text and its code.
    async fn link_for(owners: &Shared, username: &'static str) -> (String, String) {
        let organization = owners.organization.read().await;
        let member = owners.member.read().await;
        let (store, owner) = (
            organization.as_ref().expect("the replica"),
            member.as_ref().expect("the owner"),
        );
        let link = locator(store, owner).await.expect("the link");
        let invited = make_account_and_link(
            store,
            owner,
            None::<&InMemoryPlatform>,
            &link,
            Invitation {
                username,
                role: permission::MEMBER,
                workspaces: &[],
            },
            test_cost(),
            CREATED_AT + 1,
        )
        .await
        .expect("the invitation");

        (invited.join_link, invited.code)
    }

    /// The name a link carries in the clear.
    fn named_by(link: &str) -> String {
        JoinLink::decode(link).expect("the link").organization_name
    }

    /// A machine that holds nothing, joined by `link` with its code and a password chosen there,
    /// over a replica of what the owner's machine holds, and past its launch's checks.
    async fn joined_by(
        owners: &Shared,
        credentials: &Credentials,
        directory: &std::path::Path,
        (link, code): &(String, String),
    ) -> Shared {
        let link = JoinLink::decode(link).expect("the link");
        let replica = {
            let organization = owners.organization.read().await;

            replica_beside(
                organization.as_ref().expect("the replica"),
                directory,
                &link.organization_id,
            )
            .await
        };
        let app_state = state_over(directory).await;
        let database_path = app_state.settings.read().await.database_path.clone();
        let (replica, member) = {
            let mut remote_sync = app_state.remote_sync.write().await;

            join::accept(
                credentials.as_ref(),
                |_| async { Ok::<_, Error>(replica) },
                remote_sync.store_mut(),
                &database_path,
                &link,
                code,
                "a password sami chose",
                test_cost(),
                CREATED_AT + 20,
            )
            .await
            .expect("the link did not join")
        };

        *app_state.organization.write().await = Some(replica);
        *app_state.member.write().await = Some(member);
        app_state
            .old_shape_check
            .set(())
            .expect("the launch's checks had run");

        app_state
    }

    /// The organization's name on `app_state`'s replica as it lies: the unsigned column, and the
    /// signed row's sealed name where there is one.
    async fn name_rows(app_state: &Shared) -> (Vec<u8>, Option<Vec<u8>>) {
        let organization = app_state.organization.read().await;
        let store = organization.as_ref().expect("the replica");

        (
            store
                .organization()
                .await
                .expect("the row")
                .expect("the organization")
                .name_sealed,
            store
                .organization_name_row()
                .await
                .expect("the signed row")
                .map(|row| row.record.name_sealed),
        )
    }

    /// What `app_state`'s record names, as the wall and the switcher read it, with no state read
    /// first, and whether it is latched to signed names.
    async fn held_name(app_state: &Shared) -> (String, bool) {
        let mut remote_sync = app_state.remote_sync.write().await;
        let held = remote_sync.store_mut().selected().expect("the entry");

        (held.name.clone(), held.name_signed)
    }

    fn reason_of(refusal: Error) -> crate::error::RefusalReason {
        match refusal {
            Error::Refused { reason, .. } => reason,
            other => panic!("not a refusal: {other:?}"),
        }
    }

    /// **Criteria 23 and 25.** The owner's rename is held to the walk's rules in the shell: blank,
    /// whitespace and one character past the limit are refused and change neither half of the
    /// name. A name inside them is trimmed, sealed once into the signed row and the unsigned
    /// column, and named at once by the state the rename answers (the session the tab and the
    /// shell read, the held organization the switcher reads) and by the record, with no restart.
    #[tokio::test]
    async fn the_owners_rename_is_trimmed_signed_and_named_at_once_and_a_refused_one_changes_nothing()
     {
        let credentials: Credentials = Arc::new(Memory::new());
        let clock = crate::clock::System::shared();
        let directory = scratch("rename-owner");
        let owners = first_run(credentials.as_ref(), &directory).await;

        owner_signed_in(&owners).await;

        let before = name_rows(&owners).await;
        let too_long = "n".repeat(crate::organization::setup::ORGANIZATION_NAME_LIMIT + 1);

        for (name, reason) in [
            ("", crate::error::RefusalReason::OrganizationNameMissing),
            ("   ", crate::error::RefusalReason::OrganizationNameMissing),
            (
                too_long.as_str(),
                crate::error::RefusalReason::OrganizationNameTooLong,
            ),
        ] {
            let refusal = crate::organization::setup::rename(&owners, &credentials, &clock, name)
                .await
                .expect_err(name);

            assert_eq!(reason_of(refusal), reason, "{name:?}");
            assert_eq!(name_rows(&owners).await, before, "{name:?} wrote a name");
        }

        let state =
            crate::organization::setup::rename(&owners, &credentials, &clock, "  Acme Rentals  ")
                .await
                .expect("the owner's rename");

        assert_eq!(
            state.session.as_ref().expect("the owner").organization_name,
            "Acme Rentals",
            "the tab and the shell read the old name"
        );
        assert_eq!(
            state.selected_organization().expect("the entry").name,
            "Acme Rentals",
            "the switcher reads the old name"
        );
        assert_eq!(
            held_name(&owners).await,
            ("Acme Rentals".to_string(), true),
            "the record names the old name"
        );

        let (column, signed) = name_rows(&owners).await;

        assert_eq!(Some(column.clone()), signed, "the two halves differ");

        let organization = owners.organization.read().await;
        let member = owners.member.read().await;
        let (store, owner) = (
            organization.as_ref().expect("the replica"),
            member.as_ref().expect("the owner"),
        );

        assert_eq!(
            open_content(&owner.content_key, "organization.name_sealed", &column)
                .expect("the name opens"),
            b"Acme Rentals",
            "the name was not trimmed"
        );
        assert!(
            store
                .organization_name(&owner.verifying_key)
                .await
                .expect("the signed name")
                .is_some(),
            "the signed row does not verify"
        );
    }

    /// **Effort 857, ticket 05's third criterion.** While this build stands below the
    /// organization's write floor, every act through `as_member` that writes is refused with the
    /// version as the reason and changes nothing: a role made (an insert), a role renamed and the
    /// organization renamed (updates), and a role deleted (a delete). Reading goes on, the roles
    /// listed as they were, and once the organization is writable again the same acts write.
    #[tokio::test]
    async fn an_organization_below_its_write_floor_refuses_every_act_that_writes_and_reads_on() {
        use crate::{
            database::floor::Standing,
            error::RefusalReason,
            organization::{
                act::{Acting, Pull, as_member},
                role,
                store::FORMAT_VERSION,
            },
        };

        let credentials: Credentials = Arc::new(Memory::new());
        let clock = crate::clock::System::shared();
        let directory = scratch("read-only-acts");
        let owners = first_run(credentials.as_ref(), &directory).await;

        owner_signed_in(&owners).await;

        let made = as_member(&owners, Pull::No, async |Acting { member, store }| {
            role::create_role(
                store,
                member,
                "clerks",
                permission::MEMBER_ROLE.mask,
                permission::MANAGER,
                CREATED_AT + 1,
            )
            .await
        })
        .await
        .expect("a role made while writable")
        .id;
        let roles = async || {
            as_member(&owners, Pull::No, async |Acting { member, store }| {
                role::roles(store, member).await
            })
            .await
        };
        let before = (roles().await.expect("the roles"), name_rows(&owners).await);

        {
            let organization = owners.organization.read().await;
            let store = organization.as_ref().expect("the replica");

            store
                .record_floors(FORMAT_VERSION + 1, FORMAT_VERSION, FORMAT_VERSION + 1)
                .await;
            assert_eq!(
                store.refuse_another_format().await.expect("judged"),
                Standing::ReadOnly
            );
        }

        let refusals = [
            (
                "a role made",
                as_member(&owners, Pull::No, async |Acting { member, store }| {
                    role::create_role(
                        store,
                        member,
                        "tellers",
                        permission::MEMBER_ROLE.mask,
                        permission::MANAGER,
                        CREATED_AT + 2,
                    )
                    .await
                    .map(|_| ())
                })
                .await,
            ),
            (
                "a role renamed",
                as_member(&owners, Pull::First, async |Acting { member, store }| {
                    role::rename_role(store, member, &made, "cashiers", CREATED_AT + 2)
                        .await
                        .map(|_| ())
                })
                .await,
            ),
            (
                "a role deleted",
                as_member(&owners, Pull::First, async |Acting { member, store }| {
                    role::delete_role(store, member, &made, CREATED_AT + 2).await
                })
                .await,
            ),
            (
                "the organization renamed",
                crate::organization::setup::rename(&owners, &credentials, &clock, "Acme Rentals")
                    .await
                    .map(|_| ()),
            ),
        ];

        for (act, refused) in refusals {
            assert_eq!(
                reason_of(refused.expect_err(act)),
                RefusalReason::OrganizationReadOnlyByVersion,
                "{act}"
            );
        }

        assert_eq!(
            (
                roles().await.expect("the roles, read while read-only"),
                name_rows(&owners).await
            ),
            before,
            "an act wrote while the organization was read-only"
        );

        {
            let organization = owners.organization.read().await;
            let store = organization.as_ref().expect("the replica");

            store
                .record_floors(FORMAT_VERSION, FORMAT_VERSION, FORMAT_VERSION)
                .await;
            assert_eq!(
                store.refuse_another_format().await.expect("judged"),
                Standing::Writable
            );
        }

        as_member(&owners, Pull::First, async |Acting { member, store }| {
            role::rename_role(store, member, &made, "cashiers", CREATED_AT + 3).await
        })
        .await
        .expect("a role renamed once writable again");
    }

    /// **Effort 857, ticket 19** (requirement 5, criterion 5). While another member holds the
    /// organization's upgrade lease, as this machine's replica reads it, nothing of this machine's
    /// lands in the organization between the upgrade's steps: an act through `as_member` writing a
    /// signed row is refused with `UpgradeUnderWay` and changes nothing while reading goes on, and
    /// the unsigned `machine_version` row the heartbeat keeps is not written and waits for the next
    /// beat. A lease the acting member holds themselves, and one that has lapsed, hold nothing;
    /// and once the lease is let go both writes land.
    #[tokio::test]
    async fn the_organizations_upgrade_holds_every_other_write_until_it_ends() {
        use crate::{
            error::RefusalReason,
            organization::{
                act::{Acting, Pull, as_member},
                lease::{LeaseAuthority, StoreLease},
                role,
                session::{Build, machine_versioned},
                upgrade::ORGANIZATION_LEASE,
            },
        };

        let credentials: Credentials = Arc::new(Memory::new());
        let directory = scratch("upgrade-holds-writes");
        let owners = first_run(credentials.as_ref(), &directory).await;

        owner_signed_in(&owners).await;

        let held = {
            let mut remote_sync = owners.remote_sync.write().await;

            remote_sync
                .store_mut()
                .selected()
                .cloned()
                .expect("the entry")
        };
        let owner_id = held.member_id.clone().expect("the owner");
        let build = Build {
            rentable: "99.0.0",
            workspace_known: 99,
            format_known: 99,
        };
        let make_role = async |name: &'static str| {
            as_member(&owners, Pull::No, async |Acting { member, store }| {
                role::create_role(
                    store,
                    member,
                    name,
                    permission::MEMBER_ROLE.mask,
                    permission::MANAGER,
                    CREATED_AT + 1,
                )
                .await
                .map(|_| ())
            })
            .await
        };
        let roles = async || {
            as_member(&owners, Pull::No, async |Acting { member, store }| {
                role::roles(store, member).await
            })
            .await
            .expect("the roles, read while the upgrade runs")
        };
        let lease_by = async |holder: &str, until: i64| {
            let organization = owners.organization.read().await;
            let store = organization.as_ref().expect("the replica");
            let lease = StoreLease::new(store);
            let now = store.clock().now();

            lease
                .take(ORGANIZATION_LEASE, holder, now + until, now)
                .await
                .expect("the lease");
        };
        let let_go = async |holder: &str| {
            let organization = owners.organization.read().await;
            let store = organization.as_ref().expect("the replica");

            StoreLease::new(store)
                .release(ORGANIZATION_LEASE, holder)
                .await
                .expect("let go");
        };
        let versioned = async || {
            let organization = owners.organization.read().await;
            let store = organization.as_ref().expect("the replica");
            let wrote = machine_versioned(store, &held, &build, store.clock().now()).await;

            (
                wrote,
                store
                    .machine_version(&held.machine_id)
                    .await
                    .expect("the row")
                    .map(|row| row.rentable),
            )
        };

        // another member's upgrade under way: the signed write refused, the unsigned one waiting.
        lease_by("m-upgrading", 60_000).await;

        let before = roles().await;
        let (wrote, row) = versioned().await;

        assert_eq!(
            reason_of(
                make_role("clerks")
                    .await
                    .expect_err("a role made mid-upgrade")
            ),
            RefusalReason::UpgradeUnderWay
        );
        assert_eq!(roles().await, before, "a signed row landed mid-upgrade");
        assert!(!wrote, "the machine's version was written mid-upgrade");
        assert_ne!(row.as_deref(), Some("99.0.0"));

        let_go("m-upgrading").await;

        // a lapsed lease holds nothing, and neither does the acting member's own.
        lease_by("m-upgrading", -1).await;
        make_role("clerks")
            .await
            .expect("a role made under a lapsed lease");
        let_go("m-upgrading").await;

        lease_by(&owner_id, 60_000).await;
        make_role("tellers")
            .await
            .expect("a role made under the member's own lease");
        let_go(&owner_id).await;

        // the upgrade over: the heartbeat's write lands.
        assert_eq!(versioned().await, (true, Some("99.0.0".to_string())));
        assert_eq!(roles().await.len(), before.len() + 2);
    }

    /// **Criterion 24.** A rename sent by anybody but the owner is refused in the shell, whatever
    /// the interface drew, and changes nothing: a member locked as their link leaves them, and the
    /// same member unlocked and made a manager, holding every flag but the owner's.
    #[tokio::test]
    async fn a_rename_by_anybody_but_the_owner_is_refused_and_changes_nothing() {
        let credentials: Credentials = Arc::new(Memory::new());
        let elsewhere: Credentials = Arc::new(Memory::new());
        let clock = crate::clock::System::shared();
        let directory = scratch("rename-not-owner");
        let owners = first_run(credentials.as_ref(), &directory.join("owner")).await;

        owner_signed_in(&owners).await;

        let link = link_for(&owners, "sami.staff").await;
        let member = joined_by(&owners, &elsewhere, &directory.join("member"), &link).await;
        let member_id = member
            .member
            .read()
            .await
            .as_ref()
            .expect("the member")
            .member_id
            .clone();
        let before = name_rows(&member).await;

        let locked = crate::organization::setup::rename(&member, &elsewhere, &clock, "Forged")
            .await
            .expect_err("a locked member renamed the organization");

        assert_eq!(reason_of(locked), crate::error::RefusalReason::Locked);
        assert_eq!(name_rows(&member).await, before);

        {
            let organization = owners.organization.read().await;
            let owner = owners.member.read().await;
            let (store, owner) = (
                organization.as_ref().expect("the replica"),
                owner.as_ref().expect("the owner"),
            );

            crate::organization::member::lock::unlocked_for_a_test(store, owner, &member_id)
                .await
                .expect("the owner unlocks them");
            crate::organization::role::assign_role(
                store,
                owner,
                &member_id,
                permission::MANAGER,
                None,
                CREATED_AT + 30,
            )
            .await
            .expect("the owner makes them a manager");

            let replica = member.organization.read().await;

            synced(store, replica.as_ref().expect("the member's replica")).await;
        }

        let before = name_rows(&member).await;
        let refused = crate::organization::setup::rename(&member, &elsewhere, &clock, "Forged")
            .await
            .expect_err("a manager renamed the organization");

        assert_eq!(reason_of(refused), crate::error::RefusalReason::OwnerOnly);
        assert_eq!(name_rows(&member).await, before, "a refused rename wrote");
        assert_eq!(names_on(&member, &elsewhere).await, both("Acme"));
    }

    /// **Criterion 27.** A link made before the rename still joins once the organization has been
    /// renamed. The link names the old name, and the machine it joins names the current one once
    /// it is in: the session, and the record the wall and the switcher read.
    #[tokio::test]
    async fn a_link_made_before_the_rename_still_joins_and_its_machine_names_the_new_name() {
        let credentials: Credentials = Arc::new(Memory::new());
        let elsewhere: Credentials = Arc::new(Memory::new());
        let clock = crate::clock::System::shared();
        let directory = scratch("rename-old-link");
        let owners = first_run(credentials.as_ref(), &directory.join("owner")).await;

        owner_signed_in(&owners).await;

        let link = link_for(&owners, "sami.staff").await;

        assert_eq!(named_by(&link.0), "Acme");

        crate::organization::setup::rename(&owners, &credentials, &clock, "Acme Rentals")
            .await
            .expect("the owner's rename");

        let joined = joined_by(&owners, &elsewhere, &directory.join("joined"), &link).await;

        assert_eq!(
            names_on(&joined, &elsewhere).await,
            both("Acme Rentals"),
            "the joined machine names the name the link carried"
        );
        assert_eq!(held_name(&joined).await, ("Acme Rentals".to_string(), true));
    }

    /// **Criterion 28.** A link made after the rename carries the new name, and the machine it
    /// joins names it from the moment it is recorded, before anything reads the state.
    #[tokio::test]
    async fn a_link_made_after_the_rename_carries_the_new_name() {
        let credentials: Credentials = Arc::new(Memory::new());
        let elsewhere: Credentials = Arc::new(Memory::new());
        let clock = crate::clock::System::shared();
        let directory = scratch("rename-new-link");
        let owners = first_run(credentials.as_ref(), &directory.join("owner")).await;

        owner_signed_in(&owners).await;
        crate::organization::setup::rename(&owners, &credentials, &clock, "Acme Rentals")
            .await
            .expect("the owner's rename");

        let link = link_for(&owners, "sami.staff").await;

        assert_eq!(named_by(&link.0), "Acme Rentals");

        let joined = joined_by(&owners, &elsewhere, &directory.join("joined"), &link).await;

        assert_eq!(held_name(&joined).await.0, "Acme Rentals");
        assert_eq!(names_on(&joined, &elsewhere).await, both("Acme Rentals"));
    }

    /// **Criteria 28 and 29, a link and the unsigned column.** A link names the organization by
    /// the name the owner signed, never by the unsigned column a member rewrote; an organization
    /// whose name nobody has signed yet names the column.
    #[tokio::test]
    async fn a_link_carries_the_signed_name_and_never_a_column_somebody_rewrote() {
        let credentials: Credentials = Arc::new(Memory::new());
        let directory = scratch("link-signed-name");
        let owners = first_run(credentials.as_ref(), &directory.join("owner")).await;
        let store = replica_of(&owners).await;
        let owner = the_owner(&store, &owners).await;
        let forged = seal_content(
            &owner.content_key,
            "organization.name_sealed",
            b"Forged Rentals",
        )
        .expect("the sealed name");

        store
            .connection()
            .execute(
                "UPDATE \"organization\" SET \"name_sealed\" = ?",
                vec![turso::Value::Blob(forged)],
            )
            .await
            .expect("the forged column");

        assert_eq!(
            locator(&store, &owner)
                .await
                .expect("the link")
                .organization_name,
            "Acme",
            "a link named the column a member rewrote"
        );

        // an organization made before the signed name names the column it has.
        store
            .connection()
            .execute("DELETE FROM \"organization_name\"", ())
            .await
            .expect("the organization before the signed name");

        assert_eq!(
            locator(&store, &owner)
                .await
                .expect("the link")
                .organization_name,
            "Forged Rentals"
        );
    }

    // -------------------------------------------------------------------------------------
    // Effort 851, requirement 14: each organization keeps its own Turso consent.
    // -------------------------------------------------------------------------------------

    /// what the launch's cell did, in the order it did it, and what each step found.
    #[derive(Clone, Debug, PartialEq, Eq)]
    enum Step {
        /// the old shape was checked, with the pending slot and the organization's entry holding
        /// a token or not.
        OldShape { pending: bool, organization: bool },
        /// the consent was moved.
        Moved,
        /// the resume reached the upgrade, with the owner's platform in hand or not.
        Resumed { account: bool },
    }

    /// The upgrade a launch runs, with every step the cell takes written down as it is taken:
    /// what pins the cell's order. It hands each step to the real upgrade unless told to stop the
    /// resume there, which a machine whose remembered key is not in the store needs.
    struct Recording {
        organization_id: String,
        credentials: Credentials,
        steps: Arc<Mutex<Vec<Step>>>,
        stop_the_resume: bool,
    }

    impl Recording {
        fn note(&self, step: Step) {
            self.steps.lock().expect("the steps").push(step);
        }
    }

    impl Upgrade for Recording {
        fn with_password<'a>(
            &'a self,
            store: &'a OrganizationStore,
            account: Option<PlatformApi>,
            held: &'a HeldOrganization,
            username: &'a str,
            password: &'a str,
            credential: &'a CredentialSlot,
            now: i64,
        ) -> Upgrading<'a> {
            crate::upgrade::Upgrader
                .with_password(store, account, held, username, password, credential, now)
        }

        fn with_remembered_key<'a>(
            &'a self,
            credentials: &'a dyn CredentialStore,
            store: &'a OrganizationStore,
            account: Option<PlatformApi>,
            held: &'a HeldOrganization,
            credential: &'a CredentialSlot,
            now: i64,
        ) -> Upgrading<'a> {
            self.note(Step::Resumed {
                account: account.is_some(),
            });

            if self.stop_the_resume {
                return Box::pin(async {
                    Err(Error::refused(
                        crate::error::RefusalReason::SignInAgain,
                        "the test stops the resume here",
                    ))
                });
            }

            crate::upgrade::Upgrader.with_remembered_key(
                credentials,
                store,
                account,
                held,
                credential,
                now,
            )
        }

        fn on_connect<'a>(
            &'a self,
            store: &'a OrganizationStore,
            remote: Remote,
            account: &'a dyn AccountCopy,
            username: &'a str,
            password: &'a str,
            credential: &'a CredentialSlot,
            now: i64,
            refused: &'a (dyn Fn() -> Error + Send + Sync),
        ) -> Upgrading<'a> {
            crate::upgrade::Upgrader.on_connect(
                store, remote, account, username, password, credential, now, refused,
            )
        }

        fn forget_old_shape<'a>(
            &'a self,
            state: &'a Shared,
            credentials: &'a dyn CredentialStore,
            clock: &'a crate::clock::Shared,
        ) -> Upgrading<'a> {
            let holds = |account: &Account| {
                holds_platform_token(self.credentials.as_ref(), account).expect("the store")
            };

            self.note(Step::OldShape {
                pending: holds(&Account::Pending),
                organization: holds(&Account::of(&self.organization_id)),
            });

            crate::upgrade::Upgrader.forget_old_shape(state, credentials, clock)
        }

        fn move_the_consent<'a>(
            &'a self,
            state: &'a Shared,
            credentials: &'a dyn CredentialStore,
        ) -> Upgrading<'a> {
            self.note(Step::Moved);

            crate::upgrade::Upgrader.move_the_consent(state, credentials)
        }

        fn change<'a>(
            &'a self,
            store: &'a OrganizationStore,
            session: &'a crate::organization::session::MemberSession,
            number: u32,
            now: i64,
        ) -> Upgrading<'a> {
            crate::upgrade::Upgrader.change(store, session, number, now)
        }

        fn build(&self) -> crate::organization::session::Build {
            crate::upgrade::Upgrader.build()
        }
    }

    /// The state a launch builds over `directory`, with the recording upgrade in place of the
    /// real one, and the steps it will write down.
    async fn launch_recording(
        directory: &std::path::Path,
        credentials: &Credentials,
        organization_id: &str,
        stop_the_resume: bool,
    ) -> (Shared, Arc<Mutex<Vec<Step>>>) {
        let steps = Arc::new(Mutex::new(Vec::new()));
        let mut app_state = state_over(directory).await;

        app_state.upgrade = Arc::new(Recording {
            organization_id: organization_id.to_string(),
            credentials: Arc::clone(credentials),
            steps: Arc::clone(&steps),
            stop_the_resume,
        });

        (app_state, steps)
    }

    /// What the Platform API answers a mint with.
    fn minted() -> ScriptedResponse {
        ScriptedResponse::new(200, json!({ "jwt": "a-minted-credential" }).to_string())
    }

    /// Mint once through the owner's platform for `organization_id`, against a loopback Platform
    /// API, and answer what reached it: the request's path and its bearer token.
    async fn an_owner_only_act(
        app_state: &Shared,
        credentials: &Credentials,
        organization_id: &str,
    ) -> (String, String) {
        let server = ScriptedServer::start(vec![minted()]).await;
        let platform = owner_platform_at(
            app_state,
            credentials,
            organization_id,
            PlatformEndpoint::at(&server.url("")),
        )
        .await
        .expect("the machine holds no authority for the organization");

        platform
            .mint_token(
                &format!("org-{organization_id}"),
                "4w",
                AccessLevel::FullAccess,
            )
            .await
            .expect("the act did not reach the platform");

        let request = server.request(0);

        (
            request
                .target
                .split('?')
                .next()
                .unwrap_or_default()
                .to_string(),
            request
                .header("authorization")
                .unwrap_or_default()
                .to_string(),
        )
    }

    /// The record under `directory` as a build from before effort 851 writes it: the keys this
    /// build adds taken out, so `organization` and `tursoOrganization` are all it says about what
    /// the machine holds, and the next load converts it.
    fn as_an_earlier_build_wrote_it(directory: &std::path::Path) {
        let path = directory.join(RemoteSync::FILENAME);
        let mut record: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(&path).expect("the record"))
                .expect("the record's json");
        let keys = record.as_object_mut().expect("an object");

        for added in [
            "heldOrganizations",
            "selectedOrganization",
            "pendingTursoOrganization",
            "consentToMove",
        ] {
            keys.remove(added);
        }

        std::fs::write(&path, record.to_string()).expect("the record written back");
    }

    /// **The cell's order** (effort 851, the plan's *Each organization keeps its own Turso
    /// consent*): the old shape is checked while the consent is still where an earlier build filed
    /// it, the consent moves next, and the resume finds the owner's platform already there. A
    /// machine made by the first run of an earlier build, signed in, resumes on this one with its
    /// consent moved and nothing typed.
    #[tokio::test]
    async fn the_launch_moves_the_consent_after_the_old_shape_and_before_the_resume() {
        let credentials: Credentials = Arc::new(Memory::new());
        let directory = scratch("consent-order");
        let app_state = first_run(credentials.as_ref(), &directory).await;
        let (organization_id, _) = recorded(&app_state).await;

        // where an earlier build left the owner's consent: under `owner`, and nowhere else; and the
        // record as that build wrote it, which the next load converts.
        store_platform_token(credentials.as_ref(), "a-platform-token").expect("the consent");
        drop(app_state);
        as_an_earlier_build_wrote_it(&directory);

        let (next, steps) =
            launch_recording(&directory, &credentials, &organization_id, false).await;
        let state = state_of(&next, &credentials, &crate::clock::System::shared())
            .await
            .expect("the state");

        assert_eq!(
            *steps.lock().expect("the steps"),
            vec![
                Step::OldShape {
                    pending: true,
                    organization: false,
                },
                Step::Moved,
                Step::Resumed { account: true },
            ],
            "the cell ran out of order"
        );
        assert!(state.session.is_some(), "the launch did not resume");
        assert!(state.holds_turso_authority);
        // the organization's own consent is not the setup's: a walk to add another starts with none.
        assert!(!state.setup_consented);
        assert_eq!(
            platform_token(credentials.as_ref(), &Account::of(&organization_id)).as_deref(),
            Ok("a-platform-token")
        );
        assert!(!holds_platform_token(credentials.as_ref(), &Account::Pending).expect("the store"));
    }

    /// `remote-sync.json` as release 0.19.0 writes it, frozen (effort 851, criterion 16): one
    /// organization, signed in as its owner, with the Turso organization its consent is over, two
    /// workspace replicas and the workspace it had open. Never edited: a record on disk is what the
    /// conversion has to meet, and a fixture that followed the code would meet nothing.
    ///
    /// **Written out byte for byte here and in the tests of `machine/record.rs`**,
    /// as a fixture used by more than one module is (`rules/testing`).
    const RELEASED: &str = r#"{
  "workspace": {
    "id": "workspace-1759000000000",
    "name": "Riyadh",
    "localDatabasePath": "C:\\Users\\someone\\AppData\\Roaming\\rentable\\app.db",
    "remoteId": "wks-north",
    "remoteUrl": "libsql://rentable-wks-north-acme.aws-eu-west-1.turso.io",
    "permissions": 63,
    "lastError": null,
    "createdAt": 1759000000000,
    "updatedAt": 1759500000000
  },
  "startupPromptEnabled": false,
  "deviceId": "device-1759000000000",
  "replicas": [
    {
      "workspaceId": "wks-north",
      "memberId": "mem-olivia",
      "createdAt": 1759000100000
    },
    {
      "workspaceId": "wks-south",
      "memberId": "mem-olivia",
      "createdAt": 1759000200000
    }
  ],
  "tursoOrganization": {
    "slug": "acme",
    "group": "rentable"
  },
  "organization": {
    "id": "org-acme",
    "name": "Acme",
    "verifyingKey": "c29tZS12ZXJpZnlpbmcta2V5LW9mLXRoaXJ0eS10d28tYnl0ZXM",
    "remoteUrl": "libsql://rentable-org-acme-acme.aws-eu-west-1.turso.io",
    "machineId": "mch-this-one",
    "memberId": "mem-olivia",
    "role": "owner",
    "joinedAt": 1759000000000,
    "format": 3,
    "machineSignedOut": 3
  },
  "lastReachedAt": 1759600000000
}
"#;

    /// **Criterion 16, the keyring half** (effort 851): the record release 0.19.0 wrote, frozen,
    /// with the owner's consent where that release filed it and the replica on disk. After the
    /// load and the launch's cell the consent is the organization's own, the pending slot is
    /// empty, and an owner-only act reaches the platform with that token and the slug the
    /// release recorded.
    #[tokio::test]
    async fn a_released_owners_consent_is_its_organizations_after_the_launch() {
        const ORGANIZATION: &str = "org-acme";

        let credentials: Credentials = Arc::new(Memory::new());
        let directory = scratch("consent-released");

        std::fs::write(directory.join(RemoteSync::FILENAME), RELEASED).expect("the record");
        store_platform_token(credentials.as_ref(), "the-owners-consent").expect("the consent");

        // the replica the release left, in this build's shape, so the check keeps what it finds.
        let replica = OrganizationStore::open(
            crate::clock::System::shared(),
            &OrganizationStore::replica_path(&directory.join(Database::FILENAME), ORGANIZATION),
            None,
            || async { Ok::<String, turso::Error>(String::new()) },
        )
        .await
        .expect("the replica");

        replica.install_schema().await.expect("the schema");
        replica.write_format().await.expect("the format");
        drop(replica);

        // no remembered key is filed for the release's member here, so the resume stops at the
        // upgrade rather than going on to a remote this test has no stand-in for.
        let (app_state, steps) =
            launch_recording(&directory, &credentials, ORGANIZATION, true).await;
        let state = state_of(&app_state, &credentials, &crate::clock::System::shared())
            .await
            .expect("the state");

        assert_eq!(
            state.selected_organization().map(|held| held.id),
            Some(ORGANIZATION.to_owned()),
            "the released organization is not held"
        );
        assert_eq!(
            *steps.lock().expect("the steps"),
            vec![
                Step::OldShape {
                    pending: true,
                    organization: false,
                },
                Step::Moved,
                Step::Resumed { account: true },
            ]
        );
        assert_eq!(
            platform_token(credentials.as_ref(), &Account::of(ORGANIZATION)).as_deref(),
            Ok("the-owners-consent"),
            "the consent is not under the organization"
        );
        assert!(
            !holds_platform_token(credentials.as_ref(), &Account::Pending).expect("the store"),
            "the consent is still under `owner`"
        );
        assert!(state.holds_turso_authority);
        assert_eq!(
            an_owner_only_act(&app_state, &credentials, ORGANIZATION).await,
            (
                format!("/v1/organizations/acme/databases/org-{ORGANIZATION}/auth/tokens"),
                "Bearer the-owners-consent".to_string()
            )
        );

        // and the next launch finds nothing left to move, and moves nothing.
        let (again, _) = launch_recording(&directory, &credentials, ORGANIZATION, true).await;

        state_of(&again, &credentials, &crate::clock::System::shared())
            .await
            .expect("the second launch");

        assert_eq!(
            platform_token(credentials.as_ref(), &Account::of(ORGANIZATION)).as_deref(),
            Ok("the-owners-consent")
        );
    }

    /// Every replica file under the directory whose name starts with `prefix`, the engine's
    /// sidecars with it, by name and with its bytes.
    fn files_of(
        directory: &std::path::Path,
        prefix: &str,
    ) -> std::collections::BTreeMap<String, Vec<u8>> {
        std::fs::read_dir(directory)
            .expect("the directory")
            .flatten()
            .map(|entry| entry.file_name().to_string_lossy().into_owned())
            .filter(|name| name.starts_with(prefix))
            .map(|name| {
                let bytes = std::fs::read(directory.join(&name)).expect("the file");

                (name, bytes)
            })
            .collect()
    }

    /// Every row the organization replica on disk holds, table by table, read through a store
    /// opened on the file with no remote and let go of again.
    async fn rows_of(path: &std::path::Path) -> Vec<(String, Vec<Vec<turso::Value>>)> {
        let store = OrganizationStore::open(crate::clock::System::shared(), path, None, || async {
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

    /// A workspace replica as the release left one: the engine's own file, holding a row of the
    /// ledger, written once and closed.
    async fn workspace_replica_left(directory: &std::path::Path, workspace_id: &str) {
        let replica = Database::replica_path(&directory.join(Database::FILENAME), workspace_id);
        let database = Database::open_replica(&crate::clock::System, &replica, None, || async {
            Ok::<String, turso::Error>(String::new())
        })
        .await
        .expect("the workspace replica");
        let connection = database.connect().await.expect("a connection");

        connection
            .execute("CREATE TABLE ledger (line TEXT NOT NULL)", ())
            .await
            .expect("the table");
        connection
            .execute(
                "INSERT INTO ledger (line) VALUES (?1)",
                [format!("the rent {workspace_id} collected")],
            )
            .await
            .expect("the row");
    }

    /// **Criterion 16, whole** (effort 851, requirement 16, ticket 17): the update a person meets.
    /// A data directory the current release wrote, its record release 0.19.0's frozen one,
    /// the organization's replica and both workspaces' replicas on disk beside it, and a keyring
    /// holding the member key the release remembered and the owner's Turso consent where the
    /// release filed it. This build's first launch converts the record with nothing forgotten,
    /// moves the consent to the organization, and resumes the session with no password typed;
    /// every replica is the file the release left, and an owner-only act reaches Turso.
    ///
    /// **The organization itself is a real one**, made by the first run here, because a resume
    /// opens a vault and verifies signed rows, and the frozen record's organization has neither.
    /// The record is the frozen one with the four values that name that organization written into
    /// it (its id, its verifying key, its remote and the owner's member row), the replica entries'
    /// member with them, and the open workspace's path in this data directory rather than in
    /// another machine's; every other value in it is what the release wrote. The keyring is
    /// a new one holding only what the release held.
    #[tokio::test]
    async fn an_install_from_the_current_release_updates_whole_with_nothing_typed_or_pulled_again()
    {
        let directory = scratch("updates-whole");
        let made: Credentials = Arc::new(Memory::new());

        drop(first_run(made.as_ref(), &directory).await);

        let made_record: serde_json::Value = serde_json::from_str(
            &std::fs::read_to_string(directory.join(RemoteSync::FILENAME)).expect("the record"),
        )
        .expect("the record");
        let (organization_id, member_id, held, member_key) = {
            let held = &made_record["heldOrganizations"][0];
            let organization_id = held["id"].as_str().expect("the id").to_owned();
            let member_id = held["memberId"].as_str().expect("the member").to_owned();
            let member_key = made
                .get(
                    MEMBER_KEY_SERVICE,
                    &format!("{organization_id}:{member_id}"),
                )
                .expect("the store")
                .expect("the first run remembered no member key");

            (organization_id, member_id, held.clone(), member_key)
        };

        // the record exactly as the release wrote it, naming this organization.
        let mut released: serde_json::Value = serde_json::from_str(RELEASED).expect("the fixture");

        released["organization"]["id"] = json!(organization_id);
        released["organization"]["verifyingKey"] = held["verifyingKey"].clone();
        released["organization"]["remoteUrl"] = held["remoteUrl"].clone();
        released["organization"]["memberId"] = json!(member_id);
        // and the data directory it wrote it in, which is this one.
        released["workspace"]["localDatabasePath"] =
            json!(directory.join(Database::FILENAME).to_string_lossy());

        for replica in released["replicas"]
            .as_array_mut()
            .expect("the replicas")
            .iter_mut()
        {
            replica["memberId"] = json!(member_id);
        }

        std::fs::write(
            directory.join(RemoteSync::FILENAME),
            serde_json::to_string_pretty(&released).expect("the record"),
        )
        .expect("the record");

        // the keyring as the release left it: the remembered member key, and the owner's consent
        // under `owner`, its one entry.
        let credentials: Credentials = Arc::new(Memory::new());

        credentials
            .set(
                MEMBER_KEY_SERVICE,
                &format!("{organization_id}:{member_id}"),
                &member_key,
            )
            .expect("the member key");
        store_platform_token(credentials.as_ref(), "the-owners-consent").expect("the consent");

        // the two workspaces the release replicated, beside the organization's replica.
        for replica in released["replicas"].as_array().expect("the replicas") {
            workspace_replica_left(
                &directory,
                replica["workspaceId"].as_str().expect("a workspace"),
            )
            .await;
        }

        let organization_replica =
            OrganizationStore::replica_path(&directory.join(Database::FILENAME), &organization_id);
        let organization_rows_before = rows_of(&organization_replica).await;
        let workspaces_before = files_of(&directory, "ws-");

        assert_eq!(
            workspaces_before
                .keys()
                .filter(|name| name.ends_with(".db"))
                .collect::<Vec<_>>(),
            vec!["ws-wks-north.db", "ws-wks-south.db"],
            "the release's workspace replicas were not laid down"
        );

        // this build's first launch: the load, and the first state read's cell.
        let app_state = state_over(&directory).await;
        let state = state_of(&app_state, &credentials, &crate::clock::System::shared())
            .await
            .expect("the state");

        // the same organization is held and selected, and the session resumed with nothing typed.
        assert_eq!(state.organizations.len(), 1, "{state:#?}");
        assert_eq!(state.selected.as_deref(), Some(organization_id.as_str()));
        let session = state.session.as_ref().expect("the launch did not resume");

        assert_eq!(session.member_id, member_id);
        assert_eq!(session.username, USERNAME);
        assert_eq!(session.role, "owner");
        assert!(!state.signed_out_elsewhere);

        // the record converted, with nothing the release wrote forgotten.
        let written: serde_json::Value = serde_json::from_str(
            &std::fs::read_to_string(directory.join(RemoteSync::FILENAME)).expect("the record"),
        )
        .expect("the record");
        let mut expected = released["organization"].clone();

        expected["tursoOrganization"] = released["tursoOrganization"].clone();
        expected["workspaceId"] = released["workspace"]["remoteId"].clone();

        // every field the release wrote, and the two the conversion adds from it. `nameSigned`
        // and `lockMarked` are this build's own, and the resume reads them from the replica.
        let entry = &written["heldOrganizations"][0];

        assert_eq!(
            written["heldOrganizations"]
                .as_array()
                .map(Vec::len)
                .unwrap_or_default(),
            1
        );
        for (field, value) in expected.as_object().expect("the organization") {
            assert_eq!(&entry[field], value, "`{field}` changed in the update");
        }
        assert_eq!(written["selectedOrganization"], json!(organization_id));
        for kept in [
            "workspace",
            "deviceId",
            "startupPromptEnabled",
            "lastReachedAt",
            "tursoOrganization",
        ] {
            assert_eq!(written[kept], released[kept], "`{kept}` changed");
        }

        let replicas = written["replicas"].as_array().expect("the replicas");
        let released_replicas = released["replicas"].as_array().expect("the replicas");

        assert_eq!(
            replicas.len(),
            released_replicas.len(),
            "a replica was lost"
        );
        for (replica, before) in replicas.iter().zip(released_replicas) {
            assert_eq!(replica["organizationId"], json!(organization_id));
            assert_eq!(replica["workspaceId"], before["workspaceId"]);
            assert_eq!(replica["memberId"], before["memberId"]);
            assert_eq!(replica["createdAt"], before["createdAt"]);
        }

        // the consent is the organization's own, and `owner` is empty.
        assert_eq!(
            platform_token(credentials.as_ref(), &Account::of(&organization_id)).as_deref(),
            Ok("the-owners-consent"),
            "the consent is not under the organization"
        );
        assert!(
            !holds_platform_token(credentials.as_ref(), &Account::Pending).expect("the store"),
            "the consent is still under `owner`"
        );
        assert!(state.holds_turso_authority);

        // nothing was pulled again: the workspaces' replicas are the release's bytes, and the
        // organization's replica still holds every row it held, which a replica replaced by a
        // fresh pull would not, there being no remote here to pull them from.
        assert_eq!(
            files_of(&directory, "ws-"),
            workspaces_before,
            "a workspace replica was touched by the launch"
        );

        drop(app_state);

        let organization_rows_after = rows_of(&organization_replica).await;

        for (table, rows) in &organization_rows_before {
            let after = organization_rows_after
                .iter()
                .find(|(name, _)| name == table)
                .map(|(_, rows)| rows)
                .unwrap_or_else(|| panic!("the replica lost `{table}`"));

            for row in rows {
                assert!(
                    after.contains(row),
                    "the replica lost a row of `{table}` the release left: {row:?}"
                );
            }
        }

        // and an owner-only act reaches Turso with that consent, on the account the release
        // recorded.
        let app_state = state_over(&directory).await;

        assert_eq!(
            an_owner_only_act(&app_state, &credentials, &organization_id).await,
            (
                format!("/v1/organizations/acme/databases/org-{organization_id}/auth/tokens"),
                "Bearer the-owners-consent".to_string()
            )
        );
    }

    /// **Criterion 14** (effort 851): one machine holds two organizations owned on two Turso
    /// accounts. Each owner-only act reaches the Platform API with its own organization's token
    /// and slug, and forgetting one organization's consent leaves the other's.
    #[tokio::test]
    async fn two_organizations_on_two_turso_accounts_each_act_with_their_own_consent() {
        let credentials: Credentials = Arc::new(Memory::new());
        let directory = scratch("consent-two-accounts");
        let app_state = state_over(&directory).await;

        {
            let mut remote_sync = app_state.remote_sync.write().await;
            let record = remote_sync.store_mut();

            for (id, slug) in [("org-a", "alpha"), ("org-b", "beta")] {
                record.hold(HeldOrganization {
                    id: id.to_string(),
                    name: id.to_string(),
                    verifying_key: "k".to_string(),
                    remote_url: format!("libsql://{id}"),
                    turso_organization: Some(TursoOrganization {
                        slug: slug.to_string(),
                        group: "rentable".to_string(),
                    }),
                    ..Default::default()
                });
            }

            record.commit().expect("the record");
        }

        // each consent is granted into the pending slot and moved to its organization, as a
        // first run moves it.
        for (id, token) in [("org-a", "token-a"), ("org-b", "token-b")] {
            store_platform_token(credentials.as_ref(), token).expect("the consent");
            move_pending_consent(credentials.as_ref(), id).expect("the move");
        }

        assert_eq!(
            an_owner_only_act(&app_state, &credentials, "org-a").await,
            (
                "/v1/organizations/alpha/databases/org-org-a/auth/tokens".to_string(),
                "Bearer token-a".to_string()
            )
        );
        assert_eq!(
            an_owner_only_act(&app_state, &credentials, "org-b").await,
            (
                "/v1/organizations/beta/databases/org-org-b/auth/tokens".to_string(),
                "Bearer token-b".to_string()
            )
        );

        forget_platform_token(credentials.as_ref(), &Account::of("org-a")).expect("the forget");

        assert!(
            owner_platform(&app_state, &credentials, "org-a")
                .await
                .is_none(),
            "the forgotten organization still reads as holding its authority"
        );
        assert_eq!(
            an_owner_only_act(&app_state, &credentials, "org-b").await,
            (
                "/v1/organizations/beta/databases/org-org-b/auth/tokens".to_string(),
                "Bearer token-b".to_string()
            ),
            "forgetting one organization's consent took the other's"
        );
    }

    /// The launch moves nothing where the consent cannot be told apart: two held organizations
    /// on Turso accounts and neither with a consent of its own is no record any build wrote, and
    /// guessing would hand one organization's authority to the other.
    #[tokio::test]
    async fn the_launch_moves_no_consent_it_cannot_place() {
        let credentials: Credentials = Arc::new(Memory::new());
        let directory = scratch("consent-unplaced");
        let app_state = state_over(&directory).await;

        {
            let mut remote_sync = app_state.remote_sync.write().await;
            let record = remote_sync.store_mut();

            for (id, slug) in [("org-a", "alpha"), ("org-b", "beta")] {
                record.hold(HeldOrganization {
                    id: id.to_string(),
                    name: id.to_string(),
                    verifying_key: "k".to_string(),
                    remote_url: format!("libsql://{id}"),
                    turso_organization: Some(TursoOrganization {
                        slug: slug.to_string(),
                        group: "rentable".to_string(),
                    }),
                    ..Default::default()
                });
            }

            record.commit().expect("the record");
        }

        store_platform_token(credentials.as_ref(), "a-platform-token").expect("the consent");

        crate::upgrade::consent::move_the_consent(&app_state, credentials.as_ref()).await;

        assert_eq!(
            platform_token(credentials.as_ref(), &Account::Pending).as_deref(),
            Ok("a-platform-token"),
            "a consent with two places it could go was moved to one of them"
        );
        assert!(!holds_platform_token(credentials.as_ref(), &Account::of("org-a")).expect("a"));
        assert!(!holds_platform_token(credentials.as_ref(), &Account::of("org-b")).expect("b"));
    }

    /// **An abandoned setup's consent is lent to nobody** (effort 851, requirement 14). A setup
    /// for another organization looked its Turso organization up and was left; the person signs
    /// in to an organization held here with no Turso organization of its own, which records that
    /// entry again. The slug and the token stay pending, and the next launch moves neither to it.
    #[tokio::test]
    async fn a_sign_in_after_an_abandoned_setup_leaves_its_consent_pending() {
        let credentials: Credentials = Arc::new(Memory::new());
        let directory = scratch("consent-abandoned-setup");
        let app_state = state_over(&directory).await;
        let held = HeldOrganization {
            id: "org-a".to_string(),
            name: "org-a".to_string(),
            verifying_key: "k".to_string(),
            remote_url: "libsql://org-a".to_string(),
            ..Default::default()
        };
        let pending = TursoOrganization {
            slug: "beta".to_string(),
            group: "rentable".to_string(),
        };

        {
            let mut remote_sync = app_state.remote_sync.write().await;
            let record = remote_sync.store_mut();

            record.hold(held.clone());
            record.remember_consent_organization(None, pending.clone());
            record.commit().expect("the record");
        }

        store_platform_token(credentials.as_ref(), "the-abandoned-consent").expect("the consent");

        // the sign-in records the entry again with the member it found, as every sign-in does.
        {
            let mut remote_sync = app_state.remote_sync.write().await;
            let record = remote_sync.store_mut();

            record.hold(HeldOrganization {
                member_id: Some("member-a".to_string()),
                role: Some("member".to_string()),
                ..held
            });
            record.commit().expect("the record");
        }

        crate::upgrade::consent::move_the_consent(&app_state, credentials.as_ref()).await;

        let mut remote_sync = app_state.remote_sync.write().await;
        let record = remote_sync.store_mut();

        assert_eq!(
            record.consent_organization(Some("org-a")),
            None,
            "the signed-in organization took the abandoned setup's Turso organization"
        );
        assert_eq!(record.consent_organization(None), Some(&pending));
        assert_eq!(
            platform_token(credentials.as_ref(), &Account::Pending).as_deref(),
            Ok("the-abandoned-consent"),
            "the launch moved the abandoned setup's consent"
        );
        assert!(!holds_platform_token(credentials.as_ref(), &Account::of("org-a")).expect("a"));
    }

    /// Two organizations owned on two Turso accounts, each with its own consent, and a setup's
    /// consent waiting in the pending slot, with the Turso organization it was looked up over.
    async fn two_owned_and_a_setup(credentials: &Credentials, name: &str) -> Shared {
        let directory = scratch(name);
        let app_state = state_over(&directory).await;
        let mut remote_sync = app_state.remote_sync.write().await;
        let record = remote_sync.store_mut();

        for (id, slug) in [("org-a", "alpha"), ("org-b", "beta")] {
            record.hold(HeldOrganization {
                id: id.to_string(),
                name: id.to_string(),
                verifying_key: "k".to_string(),
                remote_url: format!("libsql://{id}"),
                turso_organization: Some(TursoOrganization {
                    slug: slug.to_string(),
                    group: "rentable".to_string(),
                }),
                ..Default::default()
            });
            store_platform_token(credentials.as_ref(), &format!("token-{slug}"))
                .expect("the consent");
            move_pending_consent(credentials.as_ref(), id).expect("the move");
        }

        record.select("org-a");
        record.remember_consent_organization(
            None,
            TursoOrganization {
                slug: "gamma".to_string(),
                group: "rentable".to_string(),
            },
        );
        record.commit().expect("the record");
        store_platform_token(credentials.as_ref(), "a-setups-consent").expect("the consent");
        drop(remote_sync);

        app_state
    }

    /// **"Forget Turso account" on the owner's leaving card forgets the open organization's own
    /// consent** (effort 851, requirement 14): its `org:<id>` entry and the Turso organization it
    /// was over go, so the machine reads as holding no authority for it, and the other
    /// organization's consent and the setup's pending one stay. *It reached the setup walk's
    /// disconnect until a review of effort 851, which forgot the pending slot alone and left the
    /// organization's authority standing behind a toast saying it was gone.*
    #[tokio::test]
    async fn forgetting_the_turso_account_forgets_the_open_organizations_own_consent() {
        let credentials: Credentials = Arc::new(Memory::new());
        let app_state = two_owned_and_a_setup(&credentials, "forget-authority").await;

        assert!(
            owner_platform(&app_state, &credentials, "org-a")
                .await
                .is_some()
        );

        crate::organization::setup::forget_authority(&app_state, credentials.as_ref())
            .await
            .expect("the forget");

        assert!(
            owner_platform(&app_state, &credentials, "org-a")
                .await
                .is_none(),
            "the organization still holds its authority"
        );
        assert!(!holds_platform_token(credentials.as_ref(), &Account::of("org-a")).expect("a"));
        assert_eq!(
            platform_token(credentials.as_ref(), &Account::of("org-b")).as_deref(),
            Ok("token-beta"),
            "another organization's consent went"
        );
        assert_eq!(
            platform_token(credentials.as_ref(), &Account::Pending).as_deref(),
            Ok("a-setups-consent"),
            "the setup's consent went"
        );

        let mut remote_sync = app_state.remote_sync.write().await;
        let record = remote_sync.store_mut();

        assert_eq!(record.consent_organization(Some("org-a")), None);
        assert!(record.consent_organization(Some("org-b")).is_some());
        assert!(record.consent_organization(None).is_some());
    }

    /// **The setup walk's disconnect gives back the pending consent and nothing else**, and the
    /// Turso organization looked up for it goes with it, so the next consent is not built on its
    /// slug. Each organization's own stays.
    #[tokio::test]
    async fn the_walks_disconnect_gives_back_the_pending_consent_and_its_slug_alone() {
        let credentials: Credentials = Arc::new(Memory::new());
        let app_state = two_owned_and_a_setup(&credentials, "disconnect-pending").await;

        crate::organization::setup::disconnect_pending(&app_state, credentials.as_ref())
            .await
            .expect("the disconnect");

        assert!(!holds_platform_token(credentials.as_ref(), &Account::Pending).expect("pending"));
        assert!(holds_platform_token(credentials.as_ref(), &Account::of("org-a")).expect("a"));
        assert!(holds_platform_token(credentials.as_ref(), &Account::of("org-b")).expect("b"));

        let mut remote_sync = app_state.remote_sync.write().await;
        let record = remote_sync.store_mut();

        assert_eq!(
            record.consent_organization(None),
            None,
            "the abandoned consent's Turso organization was kept"
        );
        assert!(record.consent_organization(Some("org-a")).is_some());
    }

    /// **A launch that converted nothing moves nothing** (effort 851, requirement 14). The one
    /// organization held carries a Turso organization and has no consent of its own, and a setup's
    /// consent waits in the pending slot: an ordinary launch leaves it there, since only the load
    /// that converted an earlier build's record knows the slot holds an organization's consent.
    #[tokio::test]
    async fn a_launch_that_converted_nothing_moves_no_consent() {
        let credentials: Credentials = Arc::new(Memory::new());
        let directory = scratch("consent-not-converted");
        let app_state = state_over(&directory).await;

        {
            let mut remote_sync = app_state.remote_sync.write().await;
            let record = remote_sync.store_mut();

            record.hold(HeldOrganization {
                id: "org-a".to_string(),
                name: "org-a".to_string(),
                verifying_key: "k".to_string(),
                remote_url: "libsql://org-a".to_string(),
                turso_organization: Some(TursoOrganization {
                    slug: "alpha".to_string(),
                    group: "rentable".to_string(),
                }),
                ..Default::default()
            });
            record.commit().expect("the record");
        }

        store_platform_token(credentials.as_ref(), "a-setups-consent").expect("the consent");

        crate::upgrade::consent::move_the_consent(&app_state, credentials.as_ref()).await;

        assert_eq!(
            platform_token(credentials.as_ref(), &Account::Pending).as_deref(),
            Ok("a-setups-consent"),
            "a setup's consent was handed to an organization on a launch that converted nothing"
        );
        assert!(!holds_platform_token(credentials.as_ref(), &Account::of("org-a")).expect("a"));
    }
}
