use std::sync::Arc;

use tauri::plugin::{Builder, TauriPlugin};
use tauri::{Manager, async_runtime};
use tokio::sync::{Mutex, RwLock};

use crate::update::release::{Held, Releases};
use crate::update::{Shared, Update};
use crate::{clock, settings};

/// the update's commands: the one that records the route back before an install from the webview,
/// and the updater's own check, download and install (`command.rs`). Its setup manages the update
/// manager they write through, made from the route back the last launch left, as [`Shared`], which
/// the startup's bootstrap reads as well; and the releases found and downloaded in this run, empty,
/// as [`Held`], which the quit path reads.
///
/// Its setup reads the settings, so it is registered after the `settings` plugin.
///
/// `build.rs` reads the handler below to write the plugin's permissions, so a command added to it
/// is allowed by the ACL with no second list to keep.
pub fn plugin() -> TauriPlugin<tauri::Wry> {
    Builder::new("update")
        .invoke_handler(tauri::generate_handler![
            super::update_prepare,
            super::command::update_check,
            super::command::update_download,
            super::command::update_install,
        ])
        .setup(|app, _api| {
            let settings = app.state::<settings::Shared>().inner().clone();
            let clock = app.state::<clock::Shared>().inner().clone();

            // an error here is the launch's to show, naming the file (`lib.rs`).
            let update = async_runtime::block_on(Update::new(settings, clock.as_ref()))?;

            app.manage::<Shared>(Arc::new(RwLock::new(update)));
            app.manage::<Held>(Arc::new(Mutex::new(Releases::default())));

            Ok(())
        })
        .build()
}
