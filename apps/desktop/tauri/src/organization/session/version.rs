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
    database::floor::{self, Standing},
    error::{Error, RefusalReason},
    organization::{
        Shared,
        lease::{self, apply},
        store::OrganizationStore,
    },
};

/// What a version holds: the organization, or one workspace by its id.
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
/// Answers what holds the workspace, or nothing where this build may write it.
pub(crate) async fn workspace_judged(app_state: &Shared) -> Option<HeldByVersion> {
    let workspace = { app_state.remote_sync.read().await.workspace() };
    let id = workspace.remote_id.clone()?;
    let known = known();

    // the member before the replica, the order every act takes them in.
    let recorded =
        {
            let member = app_state.member.read().await;
            let organization = app_state.organization.read().await;

            match (member.as_ref(), organization.as_ref()) {
                (Some(member), Some(store)) => {
                    match store.workspaces(&member.verifying_key).await.ok().and_then(
                        |workspaces| workspaces.into_iter().find(|workspace| workspace.id == id),
                    ) {
                        // the floors the organization records for it, where a step declared after 857
                        // has run on it, rather than its version, which an upgrade moves past every
                        // build before 857 to stop them (ticket 07).
                        Some(workspace) => {
                            lease::recorded_floors(store, &id, workspace.schema_version)
                                .await
                                .ok()
                        }
                        None => None,
                    }
                }
                _ => None,
            }
        };
    let db = app_state.db.read().await;
    let mut standing = recorded
        .map(|floors| floors.standing(known))
        .unwrap_or(Standing::Writable);

    if let Ok(Some(floors)) = db.floors().await {
        standing = standing.least(floors.standing(known));
    }

    db.hold(standing);

    HeldByVersion::workspace(&id, &workspace.name, standing)
}

/// What holds this machine by its version as the last verdicts left it, for the state read: the
/// refusal that kept a resume at the wall alone, where there is one, since nothing is open behind
/// it; otherwise the open organization's verdict and the open workspace's, each apart. Judges
/// nothing again.
pub(crate) async fn held_by_version(app_state: &Shared) -> Vec<HeldByVersion> {
    if let Some(held) = app_state
        .held_by_version
        .lock()
        .ok()
        .and_then(|held| held.clone())
    {
        return vec![held];
    }

    let organization = app_state
        .organization
        .read()
        .await
        .as_ref()
        .and_then(|store| HeldByVersion::organization(store.standing()));
    let standing = app_state.db.read().await.standing();
    let workspace = { app_state.remote_sync.read().await.workspace() };
    let workspace = workspace
        .remote_id
        .as_deref()
        .and_then(|id| HeldByVersion::workspace(id, &workspace.name, standing));

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

/// Keep `held` as what kept this machine at the wall, or forget it where it is nothing.
pub(crate) fn hold_at_the_wall(app_state: &Shared, held: Option<HeldByVersion>) {
    if let Ok(mut slot) = app_state.held_by_version.lock() {
        *slot = held;
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
