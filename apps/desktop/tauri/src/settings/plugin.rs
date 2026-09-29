use tauri::plugin::{Builder, TauriPlugin};

/// the settings' commands. The settings themselves are still the application state's, loaded in
/// the app's `.setup`; a command reads them when it is called, which is after that has run.
///
/// `build.rs` reads the handler below to write the plugin's permissions, so a command added to it
/// is allowed by the ACL with no second list to keep.
pub fn plugin() -> TauriPlugin<tauri::Wry> {
    Builder::new("settings")
        .invoke_handler(tauri::generate_handler![
            super::settings_get,
            super::settings_set,
        ])
        .build()
}
