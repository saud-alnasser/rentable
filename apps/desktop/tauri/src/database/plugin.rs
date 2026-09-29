use tauri::plugin::{Builder, TauriPlugin};

/// the two commands every query the interface makes goes through. The database itself is still
/// the application state's, opened in the app's `.setup`; a command reads it when it is called,
/// which is after that has run.
///
/// `build.rs` reads the handler below to write the plugin's permissions, so a command added to it
/// is allowed by the ACL with no second list to keep.
pub fn plugin() -> TauriPlugin<tauri::Wry> {
    Builder::new("database")
        .invoke_handler(tauri::generate_handler![
            super::command::database_execute_single_sql,
            super::command::database_execute_batch_sql,
        ])
        .build()
}
