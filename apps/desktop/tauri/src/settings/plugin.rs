use std::path::PathBuf;
use std::sync::Arc;

use tauri::Manager;
use tauri::plugin::{Builder, TauriPlugin};
use tokio::sync::RwLock;

use crate::diagnostics;
use crate::persisted::Persisted;
use crate::settings::{Settings, Shared};

/// the settings' commands, and the settings themselves: loaded in the plugin's setup, with the
/// places this machine keeps its files at filled in, and managed as [`Shared`].
///
/// **Registered before every plugin whose state is built from them**: the database, this
/// machine's record and the update each read the settings in their own setup, which runs after
/// this one. It is also where the application data directory is made, and where a launch that
/// cannot find it fails.
///
/// `build.rs` reads the handler below to write the plugin's permissions, so a command added to it
/// is allowed by the ACL with no second list to keep.
pub fn plugin() -> TauriPlugin<tauri::Wry> {
    Builder::new("settings")
        .invoke_handler(tauri::generate_handler![
            super::settings_get,
            super::settings_set,
        ])
        .setup(|app, _api| {
            let data_dir = app
                .path()
                .app_data_dir()
                .expect("failed to get app data dir");

            std::fs::create_dir_all(&data_dir).expect("failed to create directory");

            // the log itself was installed by the diagnostics plugin's setup, which ran first.
            let diagnostics_dir = data_dir.join(diagnostics::DIRECTORY_NAME);

            // **Where a development build keeps its databases, and it is a fixed place now.**
            //
            // *It was `current_dir()`, which is not one.* The working directory a dev build is
            // launched with is whatever launched it, so the database moved when the launcher did,
            // and because `database_path` below is only written when it is empty, the first
            // launch after a move went on opening the old one. The crate moved to
            // `apps/desktop/tauri` and a machine that had run it before kept a database at the
            // repository root, indefinitely, with the seed scripts and the app disagreeing about
            // which file was the workspace.
            //
            // `CARGO_MANIFEST_DIR` is this crate's own directory, resolved when it is compiled, so
            // it names the same place however the binary is started. `data/` keeps the replica and
            // its six sidecar files out of the crate root, and it is git-ignored.
            let db_dir: PathBuf = if cfg!(debug_assertions) {
                let dev_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("data");
                std::fs::create_dir_all(&dev_dir).expect("failed to create directory");
                dev_dir
            } else {
                data_dir.clone()
            };

            let mut settings = Persisted::<Settings>::load(data_dir.join(Settings::FILENAME))
                .expect("failed to load settings");

            // **A development build always takes the path above; a release build keeps what it
            // was given.** A stored path is a person's choice in a shipped application (the
            // restore flow writes one), and it is a stale artefact in a checkout, left by whatever
            // directory a previous launch happened to start in.
            if cfg!(debug_assertions) || settings.database_path.as_os_str().is_empty() {
                settings.database_path = db_dir.join(Settings::DATABASE_FILENAME);
            }
            settings.recovery_path = data_dir.join(Settings::RECOVERY_FILENAME);
            settings.diagnostics_dir = diagnostics_dir;
            settings.version = env!("CARGO_PKG_VERSION").to_string();

            settings.commit().expect("failed to commit settings");

            app.manage::<Shared>(Arc::new(RwLock::new(settings)));

            Ok(())
        })
        .build()
}
