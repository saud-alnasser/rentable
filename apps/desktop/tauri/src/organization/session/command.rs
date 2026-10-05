//! the commands of a session: where this machine stands, the sign-in and the sign-out, the launch's
//! resume, the sessions ended from here and from elsewhere, the reader's machines and one of them
//! signed out, the heartbeat, and the forget.

use std::sync::atomic::Ordering;

use serde::{Deserialize, Serialize};

use crate::{
    clock,
    credential::{CredentialStore, Credentials},
    diagnostics,
    error::{Error, RefusalReason},
    organization::Shared,
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
    session::{self, MachineView, SessionFacts, SessionsEnded, forget},
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

/// Where this machine stands: the organization it holds and who is signed in.
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

    let (organization, selected) = {
        let mut remote_sync = app_state.remote_sync.write().await;
        let selected = remote_sync.store_mut().selected();

        (
            selected.map(HeldOrganizationFacts::from),
            selected.map(|held| held.id.clone()),
        )
    };
    // the selected organization's own consent, which is the one the wall and the session are of.
    let holds_turso_authority = match selected.as_deref() {
        Some(organization_id) => owner_platform(app_state, credentials, organization_id)
            .await
            .is_some(),
        None => false,
    };

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
        session: session.map(|(facts, _)| facts),
        holds_turso_authority,
        signed_out_elsewhere: app_state.signed_out_elsewhere.load(Ordering::SeqCst),
    })
}

/// Forget the organization this machine holds (requirement 20): sign out where somebody is in,
/// delete every replica under the data directory, empty the record, and clear the Turso
/// authority. The organization on Turso is untouched, and the person can connect again by the
/// link. The one confirm before it is the screen's; this asks nothing.
#[tauri::command(rename = "session_disconnect")]
pub(crate) async fn organization_session_disconnect(
    app_state: tauri::State<'_, Shared>,
    credentials: tauri::State<'_, Credentials>,
    clock: tauri::State<'_, clock::Shared>,
) -> Result<OrganizationState, Error> {
    forget::forget(&app_state, credentials.inner().as_ref()).await?;

    state_of(&app_state, &credentials, &clock).await
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
/// `forget` does first, so that letting go of the replica is one routine and the file it held can
/// be deleted afterwards.
///
/// **The remembered key goes here rather than in each caller**, which is what makes a disconnect
/// forget it too: a machine that has let go of its organization must not keep the key that opened
/// a member's vault in it. The record is read before it is emptied, which is why this runs before
/// `forget` touches it.
pub(crate) async fn sign_out(app_state: &Shared, credentials: &dyn CredentialStore) {
    // a sign-out the person asked for answers the standing: they are at the wall because they
    // put themselves there. The heartbeat's own sign-out sets it again afterwards, which is the
    // one case where the wall has something to say.
    app_state
        .signed_out_elsewhere
        .store(false, Ordering::SeqCst);

    {
        let mut remote_sync = app_state.remote_sync.write().await;
        let held = remote_sync.store_mut().selected();

        if let Some((organization_id, member_id)) =
            held.and_then(|held| held.member_id.as_ref().map(|member| (&held.id, member)))
        {
            session::forget_remembered(credentials, organization_id, member_id);
        }
    }

    // the machine stays in the registry and stops naming anybody (effort 828, requirement 15):
    // it still holds the organization, and what ended is the session. Before the replica is let
    // go of below, since that is what carries the write.
    {
        let held = {
            let mut remote_sync = app_state.remote_sync.write().await;

            remote_sync.store_mut().selected().cloned()
        };
        let organization = app_state.organization.read().await;

        if let (Some(held), Some(store)) = (held, organization.as_ref()) {
            session::machine_seen(store, &held, None, store.clock().now()).await;
        }
    }

    *app_state.member.write().await = None;
    *app_state.organization.write().await = None;
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
/// signed where it differs from the one held. **Only a signed name is written**: an unsigned one,
/// read before the owner has signed, changes nothing the record holds.
async fn held_name_refreshed(
    app_state: &Shared,
    (facts, read): &(SessionFacts, HeldOrganization),
) -> Result<(), Error> {
    if !read.name_signed {
        return Ok(());
    }

    let mut remote_sync = app_state.remote_sync.write().await;
    let record = remote_sync.store_mut();
    let Some(entry) = record.held_mut(&read.id) else {
        return Ok(());
    };

    if entry.name_signed && entry.name == facts.organization_name {
        return Ok(());
    }

    entry.name_signed = true;
    entry.name = facts.organization_name.clone();
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

/// The organization this machine's record holds, for the acts that need to know which machine
/// this is. Read before the member's lock is taken, so the record's lock is never held under it.
async fn held_here(app_state: &Shared) -> Result<HeldOrganization, Error> {
    let mut remote_sync = app_state.remote_sync.write().await;

    remote_sync.store_mut().selected().cloned().ok_or_else(|| {
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
    // before the workspace's own replication, because a machine whose member is signed out has
    // no business pushing under a credential the organization has moved past. A machine with
    // nobody in, or whose row has not moved, pays one pull of the organization replica for it.
    let standing = if ended_elsewhere(&app_state, credentials.inner().as_ref()).await {
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
        });
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
            }

            // the moment the standing block says: a half went through, whether or not anything
            // moved. A quiet heartbeat that found nothing new still reached Turso.
            if replicated.completed {
                crate::machine::note_reached(&app_state.remote_sync, clock.as_ref()).await;
            }

            Ok(Replication::of(replicated, standing))
        }
        // a credential that stopped being accepted: a lock-out rotated it and the owner
        // re-sealed a fresh one to this member. The organization database says so, and reading
        // it costs one pull; where a credential moved, the same replication is tried once more
        // under it, and nobody has to do anything.
        Some(Error::Credential { .. }) => {
            if !reconnect(&app_state).await {
                app_state
                    .remote_sync
                    .write()
                    .await
                    .note_credential_refusal(clock.now());
                return Ok(Replication::of(replicated, standing));
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
            })
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

            Ok(Replication::of(replicated, standing))
        }
    }
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
    /// why a half did not go, where Turso said: the account's, or the credential's. `none` is
    /// offline or nothing to say, and the two halves say which.
    #[serde(serialize_with = "one_word")]
    pub refusal: Option<Error>,
    /// where the signed-in member stands after this replication. `signedOutElsewhere` is the one
    /// answer the caller has to act on: the wall is already up on this side and the shell reads
    /// where the machine stands again (effort 826, requirement 22).
    pub standing: SessionStanding,
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

/// The refusal as the web layer reads it: which kind, `none`, `account` or `credential`, and never
/// Turso's sentence, which is the owner's alone and read through
/// `organization_setup_account_refusal_detail`.
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
        Some(_) => "account",
    })
}

impl Replication {
    /// one replication and the standing the same call read, which is the only way one is built:
    /// a `From` would leave the standing to a default, and a default is how the one answer the
    /// caller must act on comes to be omitted.
    fn of(replicated: crate::database::Replicated, standing: SessionStanding) -> Self {
        Self {
            pushed: replicated.pushed,
            received: replicated.received,
            refusal: replicated.refusal,
            standing,
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
    use crate::organization::invitation::{
        Invitation, locator, make_account_and_link, vault_password_of,
    };
    use crate::organization::member::vault::{open_content, seal_content};
    use crate::organization::role::permission;
    use crate::organization::session::{AccountCopy, CredentialSlot, Upgrade, Upgrading};
    use crate::organization::session::{MemberSession, sign_in};
    use crate::organization::store::{
        OrganizationNameRecord, OrganizationRecord, OrganizationStore, Signer,
    };
    use crate::organization::workspace::signer_of;
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
        Update::new(settings.clone()).await.expect("the update");

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
    /// 47): each of the three refusals, as the one word `sync/host.ts`'s `ReplicationRefusal`
    /// reads, and never Turso's sentence, which is the owner's alone.
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
            })
            .expect("a replication did not serialise")
        };

        assert_eq!(
            crossing(None, SessionStanding::Held),
            json!({ "pushed": true, "received": false, "refusal": "none", "standing": "held" })
        );
        assert_eq!(
            crossing(
                Some(Error::refused(
                    RefusalReason::TursoAccountRefused,
                    "BLOCKED: quota exceeded",
                )),
                SessionStanding::Held
            ),
            json!({ "pushed": true, "received": false, "refusal": "account", "standing": "held" })
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
                "standing": "signedOutElsewhere"
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
            state.organization.map(|held| held.member_id),
            Some(Some(member_id)),
            "the record forgot the member a sign-out keeps"
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
        forget::forget(&app_state, credentials.as_ref())
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

        assert!(state.organization.is_some(), "the first run did not finish");
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

    /// The owner renames the organization as the rename will (effort 851, ticket 10): the signed
    /// row and the unsigned column, with the same sealed name.
    async fn renamed(store: &OrganizationStore, owner: &MemberSession, name: &str, at: i64) {
        let name_sealed = seal_content(
            &owner.content_key,
            "organization.name_sealed",
            name.as_bytes(),
        )
        .expect("the sealed name");
        let (key, certificate) = signer_of(store, owner).await.expect("the owner's signer");
        let organization = store
            .organization()
            .await
            .expect("the row")
            .expect("the organization");

        store
            .write_organization_name(
                &Signer {
                    key: &key,
                    certificate: &certificate,
                },
                &OrganizationNameRecord {
                    name_sealed: name_sealed.clone(),
                    updated_at: at,
                },
            )
            .await
            .expect("the signed name");
        store
            .write_organization(&OrganizationRecord {
                name_sealed,
                ..organization
            })
            .await
            .expect("the organization row");
    }

    /// What `app_state`'s machine names the organization: in the session, and in the record the
    /// wall and the switcher draw from.
    async fn names_on(app_state: &Shared, credentials: &Credentials) -> (String, String) {
        let state = state_of(app_state, credentials, &crate::clock::System::shared())
            .await
            .expect("the state");

        (
            state
                .session
                .expect("nobody is signed in")
                .organization_name,
            state.organization.expect("nothing is held").name,
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

        // where an earlier build left the owner's consent: under `owner`, and nowhere else.
        store_platform_token(credentials.as_ref(), "a-platform-token").expect("the consent");

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
            state.organization.as_ref().map(|held| held.id.as_str()),
            Some(ORGANIZATION),
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
}
