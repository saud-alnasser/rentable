use tauri::plugin::{Builder, TauriPlugin};

/// the workspace replica's own two commands: what this machine reads of its standing, and the
/// push on the way out. It runs no setup and manages no state of its own. What its commands read
/// is this machine's record (`machine::RemoteSync`, with the replica's credential and whatever
/// Turso last refused), which the organization's commands write under the same lock, and it is
/// made in the app's `.setup` from the settings loaded there, after every plugin's setup has run.
/// A command reads it when it is called, which is after that.
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
        .build()
}
