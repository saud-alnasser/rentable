use tauri::plugin::{Builder, TauriPlugin};

/// the window's commands, and nothing else: it manages no state and runs no setup.
///
/// `build.rs` reads the handler below to write the plugin's permissions, so a command added to it
/// is allowed by the ACL with no second list to keep.
pub fn plugin() -> TauriPlugin<tauri::Wry> {
    Builder::new("window")
        .invoke_handler(tauri::generate_handler![
            super::window_show,
            super::window_hide,
            super::window_minimize,
            super::window_maximize,
            super::window_drag,
            super::window_close,
            super::window_restart,
        ])
        .build()
}
