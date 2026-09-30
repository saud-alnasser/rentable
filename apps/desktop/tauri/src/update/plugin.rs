use std::sync::Arc;

use tauri::plugin::{Builder, TauriPlugin};
use tauri::{Manager, async_runtime};
use tokio::sync::RwLock;

use crate::settings;
use crate::update::{Shared, Update};

/// the update's one command, which records the route back before an install, and the update
/// manager it writes through: made in the plugin's setup from the route back the last launch
/// left, and managed as [`Shared`]. The startup's bootstrap reads it as well.
///
/// Its setup reads the settings, so it is registered after the `settings` plugin.
///
/// `build.rs` reads the handler below to write the plugin's permissions, so a command added to it
/// is allowed by the ACL with no second list to keep.
pub fn plugin() -> TauriPlugin<tauri::Wry> {
    Builder::new("update")
        .invoke_handler(tauri::generate_handler![super::update_prepare])
        .setup(|app, _api| {
            let settings = app.state::<settings::Shared>().inner().clone();

            let update = async_runtime::block_on(Update::new(settings))
                .expect("failed to create update manager");

            app.manage::<Shared>(Arc::new(RwLock::new(update)));

            Ok(())
        })
        .build()
}
