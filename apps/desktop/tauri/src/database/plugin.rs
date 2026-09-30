use std::sync::Arc;

use tauri::Manager;
use tauri::plugin::{Builder, TauriPlugin};
use tokio::sync::RwLock;

use crate::clock;
use crate::database::{Database, Shared};
use crate::settings;

/// the two commands every query the interface makes goes through, and the database they run
/// against: made in the plugin's setup, with nothing open yet, and managed as [`Shared`]. It is
/// opened by the startup's bootstrap, which the interface asks for once the window exists.
///
/// Its setup reads the settings, so it is registered after the `settings` plugin.
///
/// `build.rs` reads the handler below to write the plugin's permissions, so a command added to it
/// is allowed by the ACL with no second list to keep.
pub fn plugin() -> TauriPlugin<tauri::Wry> {
    Builder::new("database")
        .invoke_handler(tauri::generate_handler![
            super::command::database_execute_single_sql,
            super::command::database_execute_batch_sql,
        ])
        .setup(|app, _api| {
            let settings = app.state::<settings::Shared>().inner().clone();
            let clock = app.state::<clock::Shared>().inner().clone();

            app.manage::<Shared>(Arc::new(RwLock::new(Database::new(settings, clock))));

            Ok(())
        })
        .build()
}
