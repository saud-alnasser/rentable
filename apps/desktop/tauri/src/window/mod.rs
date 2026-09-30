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

#[tauri::command(rename = "close")]
pub async fn window_close(window: tauri::Window) -> Result<(), Error> {
    Ok(window.destroy()?)
}

#[tauri::command(rename = "restart")]
pub async fn window_restart(app: tauri::AppHandle) -> Result<(), Error> {
    app.restart();
}
