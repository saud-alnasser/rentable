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
//!   open.
//!
//! So the first refusal is the only moment the changes can still be kept, and keeping them means
//! nothing pushes or pulls that replica again: not the replication, not the last push of a
//! session, not a pull, not the next launch. That is recorded beside the replica as a file, since
//! a fact held in memory would not survive the restart an update is, and the engine's own
//! bookkeeping after the refusal is exactly what drops the changes. The file goes with the replica
//! when the person says to discard them ([`super::Database::discard_unsendable`]), and nothing
//! else removes it.
//!
//! *Additions are not this case.* Captured changes push over an added column or table in either
//! order, as the effort's prototype measured (`an-older-replica-pushes-after-an-added-column`).

use std::path::{Path, PathBuf};

use crate::{
    diagnostics,
    error::{Error, RefusalReason},
};

/// The record beside a replica that its changes were refused, so nothing pushes or pulls it.
pub(crate) const MARKER: &str = "-unsendable";

/// What a push or a pull says when the changes it carries name something the workspace no longer
/// has: the remote's refusal of a statement naming a removed or renamed column or table, the
/// organization's measured mismatch (`organization/store/format.rs`), and the engine's own failure
/// to lay the changes over a remote that changed shape under them.
const SIGNS: [&str; 5] = [
    "has no column named",
    "no such column",
    "no such table",
    "Number of arguments mismatch",
    "failed to replay local change",
];

/// Whether `refusal`, a push's or a pull's failure as the engine words it, is changes the
/// workspace cannot take because it was upgraded under them.
pub(crate) fn names_what_the_upgrade_removed(refusal: &str) -> bool {
    SIGNS.iter().any(|sign| refusal.contains(sign))
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

/// Where the record beside `replica` lies.
pub(crate) fn marker(replica: &Path) -> PathBuf {
    PathBuf::from(format!("{}{MARKER}", replica.display()))
}

/// Whether the changes `replica` holds were refused.
pub(crate) fn held(replica: &Path) -> bool {
    marker(replica).exists()
}

/// Record that the changes `replica` holds were refused, saying so in the log with what the remote
/// said. A record that cannot be written is logged too; the replication still answers the refusal.
pub(crate) fn hold(replica: &Path, refusal: &str) {
    let written = std::fs::write(marker(replica), b"");

    diagnostics::warn("database.unsendable.held")
        .with("replica", replica.display().to_string())
        .with("refusal", refusal)
        .with("recorded", written.is_ok().to_string())
        .write();
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
}
