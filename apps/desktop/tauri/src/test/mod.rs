//! scaffolding every test in the crate shares, where `database/test/` and `sync/test/` hold what
//! one module's tests share.
//!
//! A directory rather than a file, for the reason those two give: what tests need in common grows,
//! and the alternative is a filename that names two things.

use std::{
    path::PathBuf,
    sync::atomic::{AtomicUsize, Ordering},
};

/// how many directories this run has handed out, so two asked for in the same instant under the
/// same name are still two.
static HANDED_OUT: AtomicUsize = AtomicUsize::new(0);

/// A directory of this test's own under the system's temporary directory, made before it is
/// handed back.
///
/// **The one place a test makes one** (effort 840, requirement 13): it was written out in each
/// module that needed it, twenty-eight times, and `guard::error` holds that nothing else in the
/// crate names the temporary directory. A test that needs a path that does not exist yet joins
/// one onto this.
pub(crate) fn scratch(name: &str) -> PathBuf {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| elapsed.as_nanos())
        .unwrap_or_default();
    let count = HANDED_OUT.fetch_add(1, Ordering::Relaxed);
    let directory = std::env::temp_dir().join(format!("rentable-{name}-{nanos:x}-{count}"));

    std::fs::create_dir_all(&directory).expect("scratch directory");

    directory
}

/// The directory of the diagnostics log this test run writes to, installed by the first test that
/// asks for it.
///
/// **One log for the whole run**, because the process holds one (`diagnostics::install` keeps the
/// first it is given). A test that asserts a line was written reads it from here; nothing else in
/// the test run installs a log, so every line any test writes lands in it too.
pub(crate) fn diagnostics_log() -> &'static std::path::Path {
    static DIRECTORY: std::sync::OnceLock<PathBuf> = std::sync::OnceLock::new();

    DIRECTORY.get_or_init(|| {
        let directory = scratch("diagnostics");
        let log = crate::diagnostics::DiagnosticLog::new(
            directory.clone(),
            crate::diagnostics::RotationLimits::DEFAULT,
        )
        .expect("the test run's diagnostics log");

        crate::diagnostics::install(log, crate::clock::System::shared());

        directory
    })
}
