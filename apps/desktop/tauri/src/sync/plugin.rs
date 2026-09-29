use std::sync::Arc;

use tauri::plugin::{Builder, TauriPlugin};
use tauri::{Manager, async_runtime};
use tokio::sync::RwLock;

use crate::clock;
use crate::machine::{self, RemoteSync};
use crate::settings;

/// the workspace replica's own two commands: what this machine reads of its standing, and the
/// push on the way out. Its setup makes this machine's record (`machine::RemoteSync`, with the
/// replica's credential and whatever Turso last refused) from `remote-sync.json` and the settings,
/// and manages it as `machine::Shared`: **one value**, which the organization's commands write
/// through the same lock, so what is locked together stays together.
///
/// Its setup reads the settings, so it is registered after the `settings` plugin, and before the
/// `organization` plugin, whose setup holds the same record.
///
/// The replication and the workspace's rename are the organization's commands, because both reach
/// into the organization and `sync` names nothing of it (`guard/cycle.rs`).
///
/// `build.rs` reads the handler below to write the plugin's permissions, so a command added to it
/// is allowed by the ACL with no second list to keep.
pub fn plugin() -> TauriPlugin<tauri::Wry> {
    Builder::new("sync")
        .invoke_handler(tauri::generate_handler![
            super::command::sync_state_get,
            super::command::sync_push,
        ])
        .setup(|app, _api| {
            let data_dir = app
                .path()
                .app_data_dir()
                .expect("failed to get app data dir");
            let settings = app.state::<settings::Shared>().inner().clone();
            let clock = app.state::<clock::Shared>().inner().clone();

            let remote_sync = async_runtime::block_on(RemoteSync::new(
                settings,
                data_dir.join(RemoteSync::FILENAME),
                clock,
            ))
            .expect("failed to create remote sync manager");

            app.manage::<machine::Shared>(Arc::new(RwLock::new(remote_sync)));

            Ok(())
        })
        .build()
}
