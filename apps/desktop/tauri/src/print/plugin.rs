use tauri::plugin::{Builder, TauriPlugin};

/// the one command that takes the page on the print sheet to paper or to a file. It manages no
/// state and runs no setup: the print window it may open is opened when the command is called,
/// long after every window exists.
///
/// `build.rs` reads the handler below to write the plugin's permissions, so a command added to it
/// is allowed by the ACL with no second list to keep.
pub fn plugin() -> TauriPlugin<tauri::Wry> {
    Builder::new("print")
        .invoke_handler(tauri::generate_handler![super::print_page])
        .build()
}
