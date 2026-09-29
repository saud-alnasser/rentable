use tauri::Manager;
use tauri::plugin::{Builder, TauriPlugin};

use crate::clock;
use crate::diagnostics::{DIRECTORY_NAME, DiagnosticLog, RotationLimits, install};

/// the diagnostics log and the one command the interface writes to it through.
///
/// **Registered before every other feature's plugin**, and its setup is where the log is
/// installed, so whatever fails in a setup that runs after it is recorded. A log that cannot be
/// opened is the one failure with nowhere to report itself. The clock it stamps events with is
/// managed on the builder, before any plugin, so it is there to read.
///
/// `build.rs` reads the handler below to write the plugin's permissions, so a command added to it
/// is allowed by the ACL with no second list to keep.
pub fn plugin() -> TauriPlugin<tauri::Wry> {
    Builder::new("diagnostics")
        .invoke_handler(tauri::generate_handler![super::diagnostics_write])
        .setup(|app, _api| {
            // a data directory that cannot be found is left to the app's `.setup`, which fails
            // the launch on it as it always has.
            let Ok(data_dir) = app.path().app_data_dir() else {
                return Ok(());
            };
            let clock = app.state::<clock::Shared>().inner().clone();

            match DiagnosticLog::new(data_dir.join(DIRECTORY_NAME), RotationLimits::DEFAULT) {
                Ok(log) => install(log, clock),
                Err(error) => eprintln!("failed to open the diagnostics log: {error}"),
            }

            Ok(())
        })
        .build()
}
