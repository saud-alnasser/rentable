use tauri::plugin::{Builder, TauriPlugin};

/// the update's one command, which records the route back before an install. The update manager
/// itself is still the application state's, made in the app's `.setup`; the command reads it when
/// it is called, which is after that has run.
///
/// `build.rs` reads the handler below to write the plugin's permissions, so a command added to it
/// is allowed by the ACL with no second list to keep.
pub fn plugin() -> TauriPlugin<tauri::Wry> {
    Builder::new("update")
        .invoke_handler(tauri::generate_handler![super::update_prepare])
        .build()
}
