//! Changes a replica holds that the workspace refuses, because an upgrade removed or renamed what
//! they name (effort 857, requirement 10, ticket 13).
//!
//! **What the engine does with them is the reason this file exists, and it was measured rather
//! than read** (`turso` 0.8.2, against a live account, 2026-10-07). An older build's captured
//! insert or update that names a column the remote has since dropped or renamed fails its push with
//! the remote's own refusal, `table <t> has no column named <c>` or `no such column: <c>`, and any
//! change in the same push that the remote can take lands beside the failure. Then:
//!
//! - **a second push answers `Ok` and drops the refused change** without a word, in the same
//!   session or after the replica is opened again;
//! - **a pull after the refusal answers `Ok` and drops it too**, and the replica reads the
//!   remote's rows without it;
//! - **a pull before any push fails** with `failed to replay local change after remote apply`,
//!   leaves the replica's file locked for that engine, and leaves the change in place for the next
//!   open. The cause the engine wraps is what tells it apart (`2 values for 1 columns` where a
//!   column was dropped), since the same words wrap a unique constraint two machines met.
//!
//! So the first refusal is the only moment the changes can still be kept, and keeping them means
//! nothing pushes or pulls that replica again: not the replication, not the last push of a
//! session, not a pull, not the next launch. That is recorded beside the replica as a file, since
//! a fact held in memory would not survive the restart an update is, and the engine's own
//! bookkeeping after the refusal is exactly what drops the changes. The file goes with the replica
//! when the person says to discard them ([`super::Database::discard_unsendable`]), and nothing
//! else removes it.
//!
//! **A record that cannot be written still holds the replica for the session** (ticket 26): the
//! hold is kept in memory as well, so no later push answers `Ok` and drops the changes, and the
//! failure is logged as an error. A restart forgets it, which a file it could not write could not
//! have prevented either.
//!
//! **The organization's replica is held the same way** (ticket 20), by the same record beside
//! `org-<id>.db`: `OrganizationStore::pushed` and `pulled` make neither call of a replica holding
//! it, and the person discards the changes from the sync card (`organization/session/unsent.rs`).
//! There the pull is usually first, since a sign-in and a resume pull before anything pushes, so
//! the engine's failure to replay is the refusal most often met.
//!
//! *Additions are not this case.* Captured changes push over an added column or table in either
//! order, as the effort's prototype measured (`an-older-replica-pushes-after-an-added-column`).

use std::{
    collections::HashSet,
    path::{Path, PathBuf},
    sync::{Mutex, PoisonError},
};

use crate::{
    diagnostics,
    error::{Error, RefusalReason},
};

/// The record beside a replica that its changes were refused, so nothing pushes or pulls it.
pub(crate) const MARKER: &str = "-unsendable";

/// What a push or a pull says when the changes it carries name something the workspace no longer
/// has: the remote's refusal of a statement naming a removed or renamed column or table, and the
/// organization's measured mismatch (`organization/store/format.rs`). The engine's failure to lay
/// the changes over a remote that changed shape under them carries one of these, or the count
/// mismatch [`counts_mismatch`] reads, as its cause.
///
/// **The engine's wrapper, `failed to replay local change`, is not a sign on its own** (ticket 26):
/// it wraps every failure of the replay, a unique constraint two machines met while offline among
/// them, and a replica held for that would stop syncing for good and be told it was upgraded.
const SIGNS: [&str; 4] = [
    "has no column named",
    "no such column",
    "no such table",
    "Number of arguments mismatch",
];

/// Whether `refusal`, a push's or a pull's failure as the engine words it, is changes the
/// workspace cannot take because it was upgraded under them.
pub(crate) fn names_what_the_upgrade_removed(refusal: &str) -> bool {
    SIGNS.iter().any(|sign| refusal.contains(sign)) || counts_mismatch(refusal)
}

/// Whether `refusal` says a statement carried more or fewer values than its table has columns, in
/// either of the engine's wordings: `2 values for 1 columns` (the replay's, measured live where a
/// column was dropped) or `table pay has 3 values for 2 columns`.
fn counts_mismatch(refusal: &str) -> bool {
    refusal.match_indices(" values for ").any(|(at, sign)| {
        let before = refusal[..at].chars().next_back();
        let after = &refusal[at + sign.len()..];
        let digits = after.chars().take_while(char::is_ascii_digit).count();

        before.is_some_and(|c| c.is_ascii_digit())
            && digits > 0
            && after[digits..].starts_with(" column")
    })
}

/// The refusal a replication answers while the replica holds such changes.
pub(crate) fn refusal() -> Error {
    Error::refused(
        RefusalReason::ChangesUnsendableAfterUpgrade,
        "this machine holds changes it had not sent when the workspace was upgraded, and the \
         upgrade removed what they name. they are kept on this machine, and nothing is sent or \
         brought until they are discarded",
    )
}

/// The refusal a push or a pull of the organization's replica answers while it holds such changes
/// (effort 857, ticket 20): the same reason as a workspace's, said of the organization.
pub(crate) fn organization_refusal() -> Error {
    Error::refused(
        RefusalReason::ChangesUnsendableAfterUpgrade,
        "this machine holds changes to the organization it had not sent when the organization was \
         upgraded, and the upgrade removed what they name. they are kept on this machine, and \
         nothing of the organization is sent or brought until they are discarded",
    )
}

/// Where the record beside `replica` lies.
pub(crate) fn marker(replica: &Path) -> PathBuf {
    PathBuf::from(format!("{}{MARKER}", replica.display()))
}

/// The replicas held this session whose record could not be written (ticket 26).
static UNRECORDED: Mutex<Option<HashSet<PathBuf>>> = Mutex::new(None);

/// Whether the changes `replica` holds were refused: recorded beside it, or held in memory this
/// session where the record could not be written.
pub(crate) fn held(replica: &Path) -> bool {
    marker(replica).is_file()
        || UNRECORDED
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .as_ref()
            .is_some_and(|held| held.contains(replica))
}

/// Record that the changes `replica` holds were refused, saying so in the log with what the remote
/// said, and answer whether the record was written. **One that cannot be written holds the replica
/// in memory for the rest of the session** and is logged as an error, so nothing pushes or pulls
/// it until a discard or a restart.
pub(crate) fn hold(replica: &Path, refusal: &str) -> bool {
    match std::fs::write(marker(replica), b"") {
        Ok(()) => {
            diagnostics::warn("database.unsendable.held")
                .with("replica", replica.display().to_string())
                .with("refusal", refusal)
                .write();

            true
        }
        Err(failure) => {
            UNRECORDED
                .lock()
                .unwrap_or_else(PoisonError::into_inner)
                .get_or_insert_with(HashSet::new)
                .insert(replica.to_path_buf());

            diagnostics::error("database.unsendable.notRecorded")
                .with("replica", replica.display().to_string())
                .with("refusal", refusal)
                .with("failure", failure.to_string())
                .write();

            false
        }
    }
}

/// Let go of the hold kept in memory for `replica`, once its changes are discarded.
pub(crate) fn forget(replica: &Path) {
    if let Some(held) = UNRECORDED
        .lock()
        .unwrap_or_else(PoisonError::into_inner)
        .as_mut()
    {
        held.remove(replica);
    }
}

#[cfg(test)]
mod tests {
    use super::names_what_the_upgrade_removed;

    /// The refusals the live run read off Turso and the engine, word for word, are told apart from
    /// a remote that could not be reached or answered something else.
    #[test]
    fn a_refusal_naming_what_an_upgrade_removed_is_told_apart() {
        for refusal in [
            "sync engine operation failed: database sync engine error: failed to execute sql: \
             Error { message: \"SQLite error: table pay has no column named note\", code: \
             \"SQLITE_UNKNOWN\" }",
            "sync engine operation failed: database sync engine error: failed to execute sql: \
             Error { message: \"SQLite error: no such column: note\", code: \"SQLITE_UNKNOWN\" }",
            "sync engine operation failed: database sync engine error: failed to replay local \
             change after remote apply: database error: 3 values for 2 columns",
            "Number of arguments mismatch: expected 2, got 3",
            "no such table: main.complex",
        ] {
            assert!(names_what_the_upgrade_removed(refusal), "{refusal}");
        }

        for other in [
            "sync engine operation failed: error sending request for url",
            "status=402, body={\"error\":\"BLOCKED: quota exceeded\"}",
            "status=401, body=",
            "push timed out",
        ] {
            assert!(!names_what_the_upgrade_removed(other), "{other}");
        }
    }

    /// **Ticket 26 (correctness 2).** The engine wraps every failure to lay captured changes over
    /// the remote in the same words, so the wrapper alone says nothing about an upgrade. Two
    /// machines adding a tenant with the same phone while offline is a replay conflict, not a
    /// workspace that changed shape, and holding the replica for it would stop it syncing for good.
    ///
    /// The first unique refusal and the one over the pipeline are word for word what a live run
    /// read on 2026-10-07 (`turso` 0.8.2): two replicas wrote the same unique phone, one pushed,
    /// and the other's pull and push answered these.
    #[test]
    fn a_conflict_the_replay_meets_is_not_what_an_upgrade_removed() {
        for conflict in [
            "sync engine operation failed: database sync engine error: failed to replay local \
             change after remote apply: database error: UNIQUE constraint failed: tenant.phone",
            "sync engine operation failed: database sync engine error: failed to replay local \
             change after remote apply: database error: NOT NULL constraint failed: tenant.name",
            "sync engine operation failed: database sync engine error: failed to replay local \
             change after remote apply: database error: CHECK constraint failed: amount > 0",
            "sync engine operation failed: database sync engine error: failed to replay local \
             change after remote apply: database error: FOREIGN KEY constraint failed",
            "sync engine operation failed: database sync engine error: failed to execute sql: \
             Error { message: \"SQLite error: UNIQUE constraint failed: tenant.phone\", code: \
             \"SQLITE_CONSTRAINT\" }",
            "failed to replay local change after remote apply",
        ] {
            assert!(!names_what_the_upgrade_removed(conflict), "{conflict}");
        }

        // the replay's own words for a change naming what an upgrade removed still hold it.
        for removed in [
            "failed to replay local change after remote apply: database error: 2 values for 1 \
             columns",
            "failed to replay local change after remote apply: database error: table pay has 3 \
             values for 2 columns",
            "failed to replay local change after remote apply: database error: no such column: \
             note",
            "failed to replay local change after remote apply: database error: no such table: \
             complex",
        ] {
            assert!(names_what_the_upgrade_removed(removed), "{removed}");
        }
    }

    /// **Ticket 26 (correctness 11).** A record that cannot be written still holds the replica for
    /// as long as this process runs, since the next push would answer `Ok` and drop the changes;
    /// and only a discard lets go of it.
    #[test]
    fn a_hold_that_cannot_be_recorded_is_held_for_the_session() {
        use super::{forget, held, hold, marker};
        use std::path::Path;

        // no directory holds this replica, so nothing can be written beside it.
        let replica = crate::test::scratch("unsendable-unwritable")
            .join("missing")
            .join("ws-north.db");

        assert!(!held(&replica));

        assert!(
            !hold(&replica, "SQLite error: table pay has no column named note"),
            "the record was written"
        );
        assert!(!marker(&replica).exists());
        assert!(held(&replica), "a hold that was not recorded is forgotten");

        forget(&replica);

        assert!(!held(&replica), "a discard left the hold");

        let _ = std::fs::remove_dir_all(replica.parent().and_then(Path::parent).expect("scratch"));
    }
}
