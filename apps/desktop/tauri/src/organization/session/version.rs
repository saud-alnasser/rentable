//! what holds this machine by its version: the organization or the open workspace upgraded past
//! what this build may write, or past what it may read (effort 857, requirements 8 and 9,
//! ticket 04).
//!
//! **A standing rather than an error, beside `signedOutElsewhere`.** A resume refused for its
//! version leaves the person at the wall, and the wall is owed the reason; a session let through
//! read-only is owed it while it lasts; and a heartbeat that pulls a raise is owed it before the
//! next thing is written. So the verdicts cross as a list of [`HeldByVersion`], on
//! `OrganizationState` and on `session_replicate`'s answer, and what the shell does with them is
//! the shell's.
//!
//! **Both verdicts, apart** (ticket 16). The organization and the open workspace are judged
//! separately, and each verdict crosses on its own, the organization's first: a workspace
//! read-only or past reading in an organization that is read-only is still the workspace's to fold
//! or to hold, and keeping only the organization's verdict lost it.
//!
//! **Where each verdict lives.** The organization's is kept on its store
//! (`OrganizationStore::refuse_another_format`), the open workspace's on the workspace engine
//! (`Database::hold`), and the refusal that kept a resume at the wall, when no store is open, on
//! the organization's state (`Shared::held_by_version`).

use serde::{Deserialize, Serialize};

use crate::{
    database::{
        Database, Pulled, Replicated,
        floor::{self, Floors, Standing},
    },
    error::{Error, RefusalReason},
    machine::RemoteSyncWorkspace,
    organization::{
        Shared,
        lease::{self, apply},
        store::OrganizationStore,
    },
    turso::platform::AccessLevel,
};

/// The organization, or one workspace by its id: what a version holds, and what an upgrade
/// brings forward (`organization::upgrade`). Crosses as `"organization"` or `{ "workspace": id }`.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum VersionTarget {
    Organization,
    Workspace(String),
}

/// The organization or a workspace upgraded past this build: which, how far this build may still
/// go with it, and the reason as a sentence for the detail a screen keeps behind its own words.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HeldByVersion {
    pub target: VersionTarget,
    /// `readOnly` or `unreadable`; a writable verdict holds nothing and is never carried.
    pub standing: Standing,
    pub reason: String,
}

impl HeldByVersion {
    /// The organization, at `standing`; nothing where it is writable.
    pub fn organization(standing: Standing) -> Option<Self> {
        let reason = match standing {
            Standing::Writable => return None,
            Standing::ReadOnly => {
                "a newer version of rentable upgraded the organization, and this version reads it \
                 and writes nothing to it. update rentable to make changes"
            }
            Standing::Unreadable => {
                "a newer version of rentable upgraded the organization past what this version \
                 reads. update rentable to open it"
            }
        };

        Some(Self {
            target: VersionTarget::Organization,
            standing,
            reason: reason.to_string(),
        })
    }

    /// The workspace `id`, called `name`, at `standing`; nothing where it is writable.
    pub fn workspace(id: &str, name: &str, standing: Standing) -> Option<Self> {
        let reason = match standing {
            Standing::Writable => return None,
            Standing::ReadOnly => format!(
                "a newer version of rentable upgraded {name}, and this version reads it and \
                 writes nothing to it. update rentable to make changes"
            ),
            Standing::Unreadable => format!(
                "a newer version of rentable upgraded {name} past what this version reads. update \
                 rentable to open it"
            ),
        };

        Some(Self {
            target: VersionTarget::Workspace(id.to_string()),
            standing,
            reason,
        })
    }

    /// The workspace `id`, called `name`, whose floors could not be read, at `standing`: read-only
    /// until they can be, or unreadable where it already was (ticket 27).
    ///
    /// **The reason is the refusal's word, [`floor::FLOORS_UNREADABLE`]** (ticket 31), not a
    /// sentence: it is what tells a save, and the interface reading `heldByVersion`, that the hold
    /// is the floors' and not a newer version's, so neither says to update.
    pub fn unjudged(id: &str, name: &str, standing: Standing) -> Option<Self> {
        match standing {
            Standing::ReadOnly => Some(Self {
                target: VersionTarget::Workspace(id.to_string()),
                standing,
                reason: floor::FLOORS_UNREADABLE.to_string(),
            }),
            _ => Self::workspace(id, name, standing),
        }
    }

    /// What a refusal of the organization for its version holds, with the refusal's own sentence;
    /// nothing for any other refusal.
    pub fn refused(refusal: &Error) -> Option<Self> {
        let (standing, message) = match refusal {
            Error::Refused {
                reason: RefusalReason::OrganizationNewer,
                message,
            } => (Standing::Unreadable, message),
            Error::Refused {
                reason: RefusalReason::OrganizationReadOnlyByVersion,
                message,
            } => (Standing::ReadOnly, message),
            _ => return None,
        };

        Some(Self {
            target: VersionTarget::Organization,
            standing,
            reason: message.clone(),
        })
    }
}

/// The step this build ships for a workspace, in the numbering of the floors.
fn known() -> u32 {
    floor::number(apply::shipped_version()).unwrap_or(u32::MAX)
}

/// Judge the open workspace against both records of its floors and keep the verdict on the
/// workspace engine (effort 857, ticket 04): the organization's record of its version, which is its
/// legacy floor and arrives with the organization's pull, and the floors the workspace keeps itself,
/// which arrive with its own. The lesser of the two is the verdict. Nothing open is writable, and
/// nothing is written here.
///
/// **Floors that read wrong are not writable** (ticket 27): a record the organization holds, or
/// floors the workspace keeps, that are no step numbers hold it read-only, or unreadable where it
/// was, until a verdict reads them. The answer says the floors could not be read, and the
/// diagnostics say why.
///
/// **A read that fails keeps the last verdict** (ticket 31), as the organization's does: a read
/// the engine could not answer, a busy one during a pull say, says nothing about the floors, so a
/// workspace this build writes is not turned read-only and told a newer version upgraded it. With
/// no verdict yet to keep, it fails closed as floors that read wrong do.
///
/// Answers what holds the workspace, or nothing where this build may write it.
pub(crate) async fn workspace_judged(app_state: &Shared) -> Option<HeldByVersion> {
    replicated_then_judged(app_state, async |_| ()).await.1
}

/// Run `replication` on the open workspace and judge the workspace over what it brought
/// ([`workspace_judged`]), answering both: what the heartbeat does with a workspace's pull.
///
/// **From its pull to its verdict under one hold of the engine** (`Database::judging`, ticket
/// 27): a save the interface makes while the pull runs waits for the verdict over what it brought,
/// so a raise the pull brought refuses it, rather than letting it commit on the replica between
/// the two. **The push is not held** (ticket 31): it can wait on the network for as long as the
/// bound allows, and a save made meanwhile commits at once and goes with the next one. So
/// `replication` is handed the workspace as a [`Judging`], whose pull takes the hold first, and
/// the hold is taken here where it pulled nothing. The organization's record of the workspace is
/// read first, since the organization's pull has already brought it, and the member and the
/// replica are let go of before the engine is held.
pub(crate) async fn replicated_then_judged<T>(
    app_state: &Shared,
    replication: impl AsyncFnOnce(&Judging<'_>) -> T,
) -> (T, Option<HeldByVersion>) {
    let (replicated, held, _) = judged_over(app_state, replication, None).await;

    (replicated, held)
}

/// The heartbeat's replication of the open workspace, judged over what its pull brought as
/// [`replicated_then_judged`] judges it, and healed after the verdict (effort 857, ticket 35): the
/// identical records two machines saved apart made into one (`database/heal.rs`), under the same
/// hold of the engine, so no save lands between the verdict and the pass.
///
/// **Healed only where this build may write the workspace**: its verdict writable, no changes
/// held that the workspace refuses, and the member in holding a full-access grant on it, since a
/// read-only credential's write would be refused at the push and held. A pass that wrote anything
/// is answered as rows having arrived, so the interface reconciles and reads again; one that fails
/// is logged and tried at the next pull, and the replication is answered as it went.
pub(crate) async fn replicated_judged_then_healed(
    app_state: &Shared,
) -> (Replicated, Option<HeldByVersion>) {
    let full_access = holds_full_access(app_state).await;
    let (mut replicated, held, healed) = judged_over(
        app_state,
        async |db: &Judging<'_>| db.replicate().await,
        Some(full_access),
    )
    .await;

    replicated.received |= healed;

    (replicated, held)
}

/// What [`replicated_then_judged`] does, and the open workspace healed after the verdict where
/// `heal` says the member may write it, answering whether the pass wrote.
async fn judged_over<T>(
    app_state: &Shared,
    replication: impl AsyncFnOnce(&Judging<'_>) -> T,
    heal: Option<bool>,
) -> (T, Option<HeldByVersion>, bool) {
    let recorded = recorded(app_state).await;
    let db = app_state.db.read().await;
    let judging = Judging::over(&db);
    let replicated = replication(&judging).await;

    judging.hold().await;

    let held = match recorded {
        Some((workspace, recorded)) => judged(&db, &workspace, recorded).await,
        None => None,
    };

    // still under the hold, so the pass reads the workspace as the verdict judged it.
    let healed = match heal {
        Some(true) if held.is_none() => db.heal(judging.brought()).await,
        _ => false,
    };

    drop(judging);

    (replicated, held, healed)
}

/// Whether the member in holds a full-access grant on the workspace this machine has open: what a
/// write of this build's own to it, the healing pass's, asks first (effort 857, ticket 35). Read
/// before the engine is held, the member before the replica, as every act takes them.
pub(crate) async fn holds_full_access(app_state: &Shared) -> bool {
    let Some(id) = ({ app_state.remote_sync.read().await.workspace().remote_id }) else {
        return false;
    };
    let member = app_state.member.read().await;

    member
        .as_ref()
        .is_some_and(|member| grants_full_access(&member.workspace_credentials, &id))
}

/// Whether `credentials`, a member's unsealed grants by workspace, hold full access to `id`.
fn grants_full_access(
    credentials: &std::collections::HashMap<String, super::WorkspaceCredential>,
    id: &str,
) -> bool {
    credentials
        .get(id)
        .is_some_and(|held| held.access == AccessLevel::FullAccess)
}

/// The open workspace as a replication over it is handed it ([`replicated_then_judged`]): the
/// database, and the hold of its engine for the verdict, taken at the pull rather than before the
/// push (ticket 31) and kept until the verdict is in.
///
/// Reads as the [`Database`] it is over. Its own `replicate` and `pull_replica` are the ones that
/// take the hold; nothing else reached through it does.
pub(crate) struct Judging<'a> {
    db: &'a Database,
    hold: std::sync::Mutex<Option<tokio::sync::OwnedRwLockWriteGuard<()>>>,
    /// whether a pull through it brought rows, which is what owes the workspace a healing pass.
    brought: std::sync::atomic::AtomicBool,
}

impl<'a> Judging<'a> {
    fn over(db: &'a Database) -> Self {
        Self {
            db,
            hold: std::sync::Mutex::new(None),
            brought: std::sync::atomic::AtomicBool::new(false),
        }
    }

    /// Whether a pull through it brought rows.
    fn brought(&self) -> bool {
        self.brought.load(std::sync::atomic::Ordering::SeqCst)
    }

    fn note(&self, brought: bool) {
        if brought {
            self.brought
                .store(true, std::sync::atomic::Ordering::SeqCst);
        }
    }

    fn held(&self) -> bool {
        self.hold.lock().map(|hold| hold.is_some()).unwrap_or(false)
    }

    /// Hold the engine for the verdict, once: a save made from here on waits for it.
    pub(crate) async fn hold(&self) {
        if self.held() {
            return;
        }

        let guard = self.db.judging().await;

        if let Ok(mut hold) = self.hold.lock() {
            *hold = Some(guard);
        }
    }

    /// Push, then hold the engine, then pull ([`Database::replicate_then`]).
    pub(crate) async fn replicate(&self) -> Replicated {
        let replicated = self.db.replicate_then(async || self.hold().await).await;

        self.note(replicated.received);

        replicated
    }

    /// Hold the engine, then pull.
    pub(crate) async fn pull_replica(&self) -> Pulled {
        self.hold().await;

        let pulled = self.db.pull_replica().await;

        self.note(pulled.brought);

        pulled
    }

    /// Write `sql` as a pull lays what it brings, the engine held first as a pull holds it: for a
    /// test standing in for the pull.
    #[cfg(test)]
    pub(crate) async fn as_a_pull_brings(&self, sql: &str) {
        self.hold().await;
        self.db.as_a_pull_brings(sql).await;
    }
}

impl std::ops::Deref for Judging<'_> {
    type Target = Database;

    fn deref(&self) -> &Database {
        self.db
    }
}

/// The open workspace, where it is one of an organization, and the floors the organization records
/// for it: none where nobody is in or the organization lists no such workspace.
///
/// Read before the engine is held, as the launch does too (ticket 30), since it takes the member.
pub(crate) async fn recorded(
    app_state: &Shared,
) -> Option<(RemoteSyncWorkspace, Result<Option<Floors>, Error>)> {
    let workspace = { app_state.remote_sync.read().await.workspace() };
    let id = workspace.remote_id.clone()?;

    // the member before the replica, the order every act takes them in.
    let member = app_state.member.read().await;
    let organization = app_state.organization.read().await;

    let recorded = match (member.as_ref(), organization.as_ref()) {
        (Some(member), Some(store)) => {
            match store
                .workspaces(&member.verifying_key)
                .await
                .map(|workspaces| workspaces.into_iter().find(|workspace| workspace.id == id))
            {
                // the floors the organization records for it, where a step declared after 857
                // has run on it, rather than its version, which an upgrade moves past every
                // build before 857 to stop them (ticket 07).
                Ok(Some(workspace)) => lease::recorded_floors(store, &id, workspace.schema_version)
                    .await
                    .map(Some),
                Ok(None) => Ok(None),
                Err(error) => Err(error),
            }
        }
        _ => Ok(None),
    };

    Some((workspace, recorded))
}

/// The open workspace `workspace` judged on `db`, against the organization's record of it,
/// `recorded`, and the floors it keeps itself, and the verdict kept on the engine with the reason
/// it gave, which the state read carries (ticket 30).
///
/// Called with the engine held for the verdict ([`Database::judging`]), by the heartbeat and by
/// the launch (ticket 30).
pub(crate) async fn judged(
    db: &Database,
    workspace: &RemoteSyncWorkspace,
    recorded: Result<Option<Floors>, Error>,
) -> Option<HeldByVersion> {
    let id = workspace.remote_id.as_deref()?;
    let known = known();

    let (standing, held) = match (recorded, db.floors().await) {
        (Ok(recorded), Ok(own)) => {
            let standing = recorded
                .into_iter()
                .chain(own)
                .map(|floors| floors.standing(known))
                .fold(Standing::Writable, Standing::least);

            (
                standing,
                HeldByVersion::workspace(id, &workspace.name, standing),
            )
        }
        (Err(error), _) | (_, Err(error)) => {
            let last = db
                .last_verdict()
                .filter(|_| !matches!(error, Error::Integrity { .. }));

            crate::diagnostics::warn("workspace.floors.notRead")
                .with("workspace", id)
                .with("error", error.to_string())
                .with("kept", format!("{last:?}"))
                .write();

            if let Some((standing, reason)) = last {
                return HeldByVersion::workspace(id, &workspace.name, standing).map(|held| {
                    match reason {
                        Some(reason) => HeldByVersion { reason, ..held },
                        None => held,
                    }
                });
            }

            let standing = db.standing().least(Standing::ReadOnly);

            (
                standing,
                HeldByVersion::unjudged(id, &workspace.name, standing),
            )
        }
    };

    db.hold_because(standing, held.as_ref().map(|held| held.reason.clone()));

    held
}

/// What holds this machine by its version as the last verdicts left it, for the state read: the
/// refusal that kept a resume at the wall alone, where there is one and the wall stands on the
/// organization it is about, since nothing is open behind it; otherwise the open organization's
/// verdict and the open workspace's, each apart, the workspace's with the reason its verdict gave
/// (ticket 30). Judges nothing again.
pub(crate) async fn held_by_version(app_state: &Shared) -> Vec<HeldByVersion> {
    let selected = {
        let mut remote_sync = app_state.remote_sync.write().await;

        remote_sync
            .store_mut()
            .selected()
            .map(|held| held.id.clone())
    };

    if let Some(at_the_wall) = app_state
        .held_by_version
        .lock()
        .ok()
        .and_then(|held| held.clone())
        .filter(|at_the_wall| Some(&at_the_wall.organization_id) == selected.as_ref())
    {
        return vec![at_the_wall.held];
    }

    let organization = app_state
        .organization
        .read()
        .await
        .as_ref()
        .and_then(|store| HeldByVersion::organization(store.standing()));
    let (standing, reason) = app_state.db.read().await.verdict();
    let workspace = { app_state.remote_sync.read().await.workspace() };
    let workspace = workspace
        .remote_id
        .as_deref()
        .and_then(|id| HeldByVersion::workspace(id, &workspace.name, standing))
        .map(|held| match reason {
            Some(reason) => HeldByVersion { reason, ..held },
            None => held,
        });

    both(organization, workspace)
}

/// The organization's verdict and the open workspace's, each apart and the organization's first,
/// leaving out whichever holds nothing (ticket 16).
pub(crate) fn both(
    organization: Option<HeldByVersion>,
    workspace: Option<HeldByVersion>,
) -> Vec<HeldByVersion> {
    organization.into_iter().chain(workspace).collect()
}

/// What kept this machine at the wall for its version, and the organization it is about.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AtTheWall {
    pub organization_id: String,
    pub held: HeldByVersion,
}

/// Keep `held` as what kept this machine at the wall on the organization `organization_id`, or
/// forget what was kept where it is nothing.
pub(crate) fn hold_at_the_wall(
    app_state: &Shared,
    organization_id: &str,
    held: Option<HeldByVersion>,
) {
    if let Ok(mut slot) = app_state.held_by_version.lock() {
        *slot = held.map(|held| AtTheWall {
            organization_id: organization_id.to_string(),
            held,
        });
    }
}

/// Forget what kept this machine at the wall for its version, whichever organization it was about.
pub(crate) fn release_the_wall(app_state: &Shared) {
    if let Ok(mut slot) = app_state.held_by_version.lock() {
        *slot = None;
    }
}

/// Forget what kept this machine at the wall for its version where it was about the organization
/// `organization_id`, which this machine has let go of (ticket 27).
pub(crate) fn release_the_wall_of(app_state: &Shared, organization_id: &str) {
    if let Ok(mut slot) = app_state.held_by_version.lock()
        && slot
            .as_ref()
            .is_some_and(|at_the_wall| at_the_wall.organization_id == organization_id)
    {
        *slot = None;
    }
}

/// Whether this build may write to the organization `store`, as its last verdict says: what a way
/// in and the heartbeat ask before each write of their own.
pub(crate) fn writes_to(store: &OrganizationStore) -> bool {
    store.standing() == Standing::Writable
}

#[cfg(test)]
mod tests {
    use super::{HeldByVersion, VersionTarget, grants_full_access, judged};
    use crate::{
        database::{
            Database,
            floor::{FLOORS_UNREADABLE, Standing},
        },
        error::{Error, RefusalReason},
        machine::RemoteSyncWorkspace,
        persisted::Persisted,
        settings::Settings,
    };
    use serde_json::json;

    /// **Ticket 35's fifth criterion, the grant.** The healing pass writes to the workspace, so it
    /// runs only for a member whose grant on the open workspace has full access: a read-only
    /// credential's write would be refused at the push and held, and no grant is no write at all.
    #[test]
    fn only_a_full_access_grant_on_the_open_workspace_lets_the_pass_write() {
        use crate::{organization::session::WorkspaceCredential, turso::platform::AccessLevel};

        let held = |access| WorkspaceCredential {
            token: "a-credential".to_string(),
            access,
        };
        let credentials = std::collections::HashMap::from([
            ("south".to_string(), held(AccessLevel::FullAccess)),
            ("east".to_string(), held(AccessLevel::ReadOnly)),
        ]);

        assert!(grants_full_access(&credentials, "south"));
        assert!(!grants_full_access(&credentials, "east"));
        assert!(!grants_full_access(&credentials, "west"));
    }

    /// It crosses as the shell reads it: the target, the standing in one word, and the reason.
    #[test]
    fn a_hold_crosses_as_target_standing_and_reason() {
        let organization = HeldByVersion::organization(Standing::ReadOnly).expect("a hold");
        let workspace =
            HeldByVersion::workspace("w-1", "Ledger", Standing::Unreadable).expect("a hold");

        assert_eq!(
            serde_json::to_value(&organization).expect("serialised"),
            json!({
                "target": "organization",
                "standing": "readOnly",
                "reason": organization.reason,
            })
        );
        assert_eq!(
            serde_json::to_value(&workspace).expect("serialised"),
            json!({
                "target": { "workspace": "w-1" },
                "standing": "unreadable",
                "reason": workspace.reason,
            })
        );
        assert_eq!(
            workspace.target,
            VersionTarget::Workspace("w-1".to_string())
        );
    }

    /// Both verdicts are kept, the organization's first, and one that holds nothing is left out.
    #[test]
    fn both_verdicts_are_kept_apart() {
        let organization = HeldByVersion::organization(Standing::ReadOnly);
        let workspace = HeldByVersion::workspace("w-1", "Ledger", Standing::Unreadable);

        assert_eq!(
            super::both(organization.clone(), workspace.clone()),
            vec![
                organization.expect("a hold"),
                workspace.clone().expect("a hold")
            ]
        );
        assert_eq!(
            super::both(None, workspace.clone()),
            vec![workspace.expect("a hold")]
        );
        assert_eq!(super::both(None, None), Vec::new());
    }

    /// The engine over `name`'s scratch directory with nothing open, and the workspace `w-1` it
    /// is judged as.
    fn a_workspace(name: &str) -> (Database, RemoteSyncWorkspace) {
        let directory = crate::test::scratch(name);
        let mut settings =
            Persisted::<Settings>::load(directory.join("settings.json")).expect("settings");
        settings.database_path = directory.join("app.db");

        (
            Database::new(
                std::sync::Arc::new(tokio::sync::RwLock::new(settings)),
                crate::clock::System::shared(),
            ),
            RemoteSyncWorkspace {
                remote_id: Some("w-1".to_string()),
                name: "Ledger".to_string(),
                ..Default::default()
            },
        )
    }

    /// A read the engine could not answer, a busy one during a pull say.
    fn busy() -> Error {
        Error::Database {
            message: "database is locked".to_string(),
        }
    }

    /// **Effort 857, ticket 31's third criterion: a transient floor read keeps the last verdict**,
    /// as the organization's does (ticket 27). A read that fails says nothing about the floors, so
    /// a workspace judged writable stays writable and is not reported as upgraded by a newer
    /// version, and one judged read-only stays so with the reason it was given.
    #[tokio::test]
    async fn a_transient_floor_read_keeps_the_last_verdict() {
        let (db, workspace) = a_workspace("transient-floors");

        db.hold(Standing::Writable);

        assert_eq!(judged(&db, &workspace, Err(busy())).await, None);
        assert_eq!(db.verdict(), (Standing::Writable, None));

        let raised = HeldByVersion::workspace("w-1", "Ledger", Standing::ReadOnly);

        db.hold_because(
            Standing::ReadOnly,
            raised.as_ref().map(|held| held.reason.clone()),
        );

        assert_eq!(judged(&db, &workspace, Err(busy())).await, raised);
        assert_eq!(db.standing(), Standing::ReadOnly);
    }

    /// With no verdict yet to keep, a transient read fails closed, and says the floors could not
    /// be read rather than that a newer version upgraded the workspace.
    #[tokio::test]
    async fn a_transient_floor_read_before_any_verdict_fails_closed_without_naming_a_version() {
        let (db, workspace) = a_workspace("transient-floors-first");
        let held = judged(&db, &workspace, Err(busy()))
            .await
            .expect("held read-only");

        assert_eq!(held.standing, Standing::ReadOnly);
        assert_eq!(held.reason, FLOORS_UNREADABLE, "not the floors' reason");
        assert_eq!(db.verdict(), (Standing::ReadOnly, Some(held.reason)));
    }

    /// Floors that read wrong are not transient, and still fail closed over a writable verdict
    /// (ticket 27).
    #[tokio::test]
    async fn malformed_floors_fail_closed_over_the_last_verdict() {
        let (db, workspace) = a_workspace("malformed-floors");
        let malformed = Error::Integrity {
            message: "a floor of -1, which is no step number".to_string(),
        };

        db.hold(Standing::Writable);

        let held = judged(&db, &workspace, Err(malformed))
            .await
            .expect("held read-only");

        assert_eq!(held.standing, Standing::ReadOnly);
        assert_eq!(held.reason, FLOORS_UNREADABLE, "not the floors' reason");
        assert_eq!(db.standing(), Standing::ReadOnly);
    }

    /// The floors' reason is the refusal's own word as it crosses, so the interface reads one
    /// word for both (ticket 31).
    #[test]
    fn the_floors_reason_is_the_refusals_word() {
        assert_eq!(
            serde_json::to_value(RefusalReason::WorkspaceFloorsUnreadable).expect("serialised"),
            json!(FLOORS_UNREADABLE)
        );
    }

    /// A writable verdict holds nothing.
    #[test]
    fn a_writable_verdict_holds_nothing() {
        assert_eq!(HeldByVersion::organization(Standing::Writable), None);
        assert_eq!(
            HeldByVersion::workspace("w-1", "Ledger", Standing::Writable),
            None
        );
    }
}
