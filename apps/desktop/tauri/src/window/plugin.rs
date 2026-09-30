use tauri::plugin::{Builder, TauriPlugin};

/// the window's commands, and nothing else: it manages no state and runs no setup.
///
/// **Named `frame`, not `window`.** Tauri registers its own core plugins, `window` among them,
/// after the builder's, and a plugin registered under a taken name replaces the one before it. A
/// plugin named `window` would be dropped for Tauri's, and `plugin:window|drag` would reach
/// Tauri's commands rather than these. The test in `guard/acl.rs` refuses a core plugin's name.
///
/// `build.rs` reads the handler below to write the plugin's permissions, so a command added to it
/// is allowed by the ACL with no second list to keep.
pub fn plugin() -> TauriPlugin<tauri::Wry> {
    Builder::new("frame")
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
