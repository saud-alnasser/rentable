use tauri::plugin::{Builder, TauriPlugin};

/// the bootstrap, which the interface asks for as it starts. It runs no setup of its own: what it
/// opens is the application state's, made in the app's `.setup`, and the interface asks only once
/// that has run and the window exists.
///
/// `build.rs` reads the handler below to write the plugin's permissions, so a command added to it
/// is allowed by the ACL with no second list to keep.
pub fn plugin() -> TauriPlugin<tauri::Wry> {
    Builder::new("startup")
        .invoke_handler(tauri::generate_handler![super::bootstrap])
        .build()
}
