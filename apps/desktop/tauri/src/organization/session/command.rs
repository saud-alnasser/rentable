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
    let holds_turso_authority = owner_platform(app_state, credentials).await.is_some();

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
        let held = remote_sync.store_mut().organization.as_ref();

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

            remote_sync.store_mut().organization.clone()
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
/// sign-in is what the screen shows.
async fn current_facts(app_state: &Shared) -> Result<Option<SessionFacts>, Error> {
    let member = app_state.member.read().await;
    let organization = app_state.organization.read().await;

    let (Some(member), Some(store)) = (member.as_ref(), organization.as_ref()) else {
        return Ok(None);
    };

    session::facts_of(store, member).await.map(Some)
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

    remote_sync.store_mut().organization.clone().ok_or_else(|| {
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
    use crate::organization::Shared;
    use crate::persisted::Persisted;
    use crate::settings::Settings;
    use crate::sync::test::server::{ScriptedResponse, ScriptedServer};
    use crate::test::scratch;
    use crate::turso::consent::TursoConsent;
    use crate::turso::discovery::McpEndpoint;
    use crate::turso::platform::InMemoryPlatform;
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
            .organization
            .clone()
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
                .organization
                .clone()
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
}
