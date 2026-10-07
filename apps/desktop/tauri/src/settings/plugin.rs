use std::path::{Path, PathBuf};
use std::sync::Arc;

use tauri::Manager;
use tauri::plugin::{Builder, TauriPlugin};
use tokio::sync::RwLock;

use crate::clock;
use crate::error::Error;
use crate::settings::Shared;

/// the settings' commands, and the settings themselves: loaded in the plugin's setup, with the
/// places this machine keeps its files at filled in, and managed as [`Shared`].
///
/// **Registered before every plugin whose state is built from them**: the database, this
/// machine's record and the update each read the settings in their own setup, which runs after
/// this one. It is also where the application data directory is made, and where a launch that
/// cannot find or make it fails, with a message naming the directory (`lib.rs`).
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
            let data_dir = app.path().app_data_dir()?;

            std::fs::create_dir_all(&data_dir).map_err(|error| directory(&data_dir, error))?;

            // **Where a development build keeps its databases, and it is a fixed place now.**
            //
            // *It was `current_dir()`, which is not one.* The working directory a dev build is
            // launched with is whatever launched it, so the database moved when the launcher did,
            // and because `database_path` is only written when it is empty, the first launch after
            // a move went on opening the old one. The crate moved to `apps/desktop/tauri` and a
            // machine that had run it before kept a database at the repository root,
            // indefinitely, with the seed scripts and the app disagreeing about which file was the
            // workspace.
            //
            // `CARGO_MANIFEST_DIR` is this crate's own directory, resolved when it is compiled, so
            // it names the same place however the binary is started. `data/` keeps the replica and
            // its six sidecar files out of the crate root, and it is git-ignored.
            let db_dir: PathBuf = if cfg!(debug_assertions) {
                let dev_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("data");
                std::fs::create_dir_all(&dev_dir).map_err(|error| directory(&dev_dir, error))?;
                dev_dir
            } else {
                data_dir.clone()
            };

            // the log itself was installed by the diagnostics plugin's setup, which ran first. An
            // error here is the launch's to show, naming the file (`lib.rs`).
            let clock = app.state::<clock::Shared>().inner().clone();
            let settings = super::open(&data_dir, &db_dir, clock.as_ref())?;

            app.manage::<Shared>(Arc::new(RwLock::new(settings)));

            Ok(())
        })
        .build()
}

/// a directory the launch could not make, named, as the message at launch shows it.
fn directory(path: &Path, error: std::io::Error) -> Error {
    Error::Io {
        message: format!("{} could not be made: {error}", path.display()),
    }
}
