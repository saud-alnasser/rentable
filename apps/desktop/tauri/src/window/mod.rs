//! the application window: the frameless shell's own controls, served as the `frame` plugin, since
//! `window` is the name of Tauri's own (see `plugin.rs`).
//!
//! Each command keeps its crate-unique Rust name and answers to the name without the feature
//! prefix, since the plugin supplies it: `window_show` is invoked as `plugin:frame|show`.
//!
//! **Every command is `async`.** Tauri runs a plugin's synchronous command on the event loop's
//! thread while it holds the plugin store's lock, and a window call there sends the window a message
//! whose handler asks for the same lock, so `show` would wait on itself and the window would never
//! appear. An `async` command runs once the lock is released (`guard/acl.rs` holds it).

mod plugin;

pub use plugin::plugin;

use tauri::Manager;

use crate::error::Error;

#[tauri::command(rename = "show")]
pub async fn window_show(window: tauri::Window) -> Result<(), Error> {
    Ok(window.show()?)
}

#[tauri::command(rename = "hide")]
pub async fn window_hide(window: tauri::Window) -> Result<(), Error> {
    Ok(window.hide()?)
}

#[tauri::command(rename = "minimize")]
pub async fn window_minimize(window: tauri::Window) -> Result<(), Error> {
    Ok(window.minimize()?)
}

#[tauri::command(rename = "maximize")]
pub async fn window_maximize(window: tauri::Window) -> Result<(), Error> {
    if window.is_maximized()? {
        Ok(window.unmaximize()?)
    } else {
        Ok(window.maximize()?)
    }
}

#[tauri::command(rename = "drag")]
pub async fn window_drag(window: tauri::Window) -> Result<(), Error> {
    Ok(window.start_dragging()?)
}

/// The last step of quitting: the frontend has hidden the window and pushed the workspace before
/// it calls this (`startup/close.ts`), so a release downloaded and not yet installed is installed
/// here, without starting it, before the window goes (effort 857, requirement 12). On Windows a
/// successful install exits the process; anything that goes wrong leaves the quit to go on.
#[tauri::command(rename = "close")]
pub async fn window_close(window: tauri::Window) -> Result<(), Error> {
    crate::update::command::at_quit(window.app_handle()).await;

    Ok(window.destroy()?)
}

#[tauri::command(rename = "restart")]
pub async fn window_restart(app: tauri::AppHandle) -> Result<(), Error> {
    app.restart();
}
