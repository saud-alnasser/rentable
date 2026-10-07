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
        Database,
        floor::{self, Floors, Standing},
    },
    error::{Error, RefusalReason},
    machine::RemoteSyncWorkspace,
    organization::{
        Shared,
        lease::{self, apply},
        store::OrganizationStore,
    },
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
    pub fn unjudged(id: &str, name: &str, standing: Standing) -> Option<Self> {
        match standing {
            Standing::ReadOnly => Some(Self {
                target: VersionTarget::Workspace(id.to_string()),
                standing,
                reason: format!(
                    "this version could not read which versions of rentable may write {name}, so \
                     it writes nothing to it until it can"
                ),
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
/// **Floors that cannot be read are not writable** (ticket 27): a record the organization holds
/// and cannot answer, or floors the workspace keeps and cannot read, hold it read-only, or
/// unreadable where it was, until a verdict reads them. The answer says the floors could not be
/// read, and the diagnostics say why.
///
/// Answers what holds the workspace, or nothing where this build may write it.
pub(crate) async fn workspace_judged(app_state: &Shared) -> Option<HeldByVersion> {
    replicated_then_judged(app_state, async |_| ()).await.1
}

/// Run `replication` on the open workspace and judge the workspace over what it brought
/// ([`workspace_judged`]), answering both: what the heartbeat does with a workspace's pull.
///
/// **Under one hold of the engine** (`Database::judging`, ticket 27): a save the interface makes
/// while the pull runs waits for the verdict over what it brought, so a raise the pull brought
/// refuses it, rather than letting it commit on the replica between the two. The organization's
/// record of the workspace is read first, since the organization's pull has already brought it,
/// and the member and the replica are let go of before the engine is held.
pub(crate) async fn replicated_then_judged<T>(
    app_state: &Shared,
    replication: impl AsyncFnOnce(&Database) -> T,
) -> (T, Option<HeldByVersion>) {
    let recorded = recorded(app_state).await;
    let db = app_state.db.read().await;
    let judging = db.judging().await;
    let replicated = replication(&db).await;
    let held = match recorded {
        Some((workspace, recorded)) => judged(&db, &workspace, recorded).await,
        None => None,
    };

    drop(judging);

    (replicated, held)
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
            let standing = db.standing().least(Standing::ReadOnly);

            crate::diagnostics::warn("workspace.floors.notRead")
                .with("workspace", id)
                .with("error", error.to_string())
                .write();

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
    use super::{HeldByVersion, VersionTarget};
    use crate::database::floor::Standing;
    use serde_json::json;

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
