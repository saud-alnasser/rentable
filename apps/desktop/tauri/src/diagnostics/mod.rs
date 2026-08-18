//! structured diagnostics, written locally and bounded.
//!
//! Nothing collects diagnostics from this application, so a failure on someone's
//! machine is investigable only if that machine kept a record of it. Every event is one JSON object on one
//! line: greppable, parseable without a format definition travelling beside it,
//! and still readable by the person who has to send it in.
//!
//! Secrets are removed by the sink rather than by callers — see
//! [`DiagnosticRecord::redacted`].

mod command;
mod record;
mod writer;

// a glob, because `#[tauri::command]` also generates a macro the handler list
// resolves through, and naming the function alone leaves it behind.
pub use command::*;
pub use record::{DiagnosticLevel, DiagnosticRecord, REDACTED};
pub use writer::{DiagnosticLog, RotationLimits};

use std::sync::OnceLock;

use crate::timestamp;

/// the diagnostics directory, under the application data directory.
pub const DIRECTORY_NAME: &str = "logs";

static LOG: OnceLock<DiagnosticLog> = OnceLock::new();

/// point the process at a log, once, during setup.
///
/// Nothing else in this crate takes a log as an argument. An event is written
/// from wherever the thing happened — a migration, a snapshot, a failed
/// request — and threading a sink to each of those would make every signature
/// along the way a logging concern. The sink itself stays testable by being an
/// ordinary value: [`DiagnosticLog`] is constructed directly wherever it is
/// under test, and never through here.
///
/// A second call is ignored: the first log installed is the one the process
/// writes to.
pub fn install(log: DiagnosticLog) {
    let _ = LOG.set(log);
}

/// an event to describe and then [`DiagnosticRecord::write`].
pub fn info(event: impl Into<String>) -> DiagnosticRecord {
    DiagnosticRecord::new(DiagnosticLevel::Info, event)
}

/// an event that is not a failure but is worth finding later.
pub fn warn(event: impl Into<String>) -> DiagnosticRecord {
    DiagnosticRecord::new(DiagnosticLevel::Warn, event)
}

/// a failure.
pub fn error(event: impl Into<String>) -> DiagnosticRecord {
    DiagnosticRecord::new(DiagnosticLevel::Error, event)
}

impl DiagnosticRecord {
    /// write this event to the log [`install`] was given.
    ///
    /// Before `install`, and when the write fails, the event is dropped and the
    /// caller is not told. Diagnostics exist to explain a failure and must
    /// never cause one — and a logger whose failures have to be handled is a
    /// logger that gets called less.
    pub fn write(self) {
        let Some(log) = LOG.get() else {
            return;
        };

        let _ = log.append(self, timestamp::now());
    }
}
