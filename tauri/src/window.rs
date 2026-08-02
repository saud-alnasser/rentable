use crate::error::Error;

/// a window operation failing is never something the user can act on — the
/// shell either honoured the request or it did not.
fn shell_failure(error: tauri::Error) -> Error {
    Error::Internal {
        message: error.to_string(),
    }
}

#[tauri::command]
pub fn window_show(window: tauri::Window) -> Result<(), Error> {
    window.show().map_err(shell_failure)
}

#[tauri::command]
pub fn window_hide(window: tauri::Window) -> Result<(), Error> {
    window.hide().map_err(shell_failure)
}

#[tauri::command]
pub fn window_minimize(window: tauri::Window) -> Result<(), Error> {
    window.minimize().map_err(shell_failure)
}

#[tauri::command]
pub fn window_maximize(window: tauri::Window) -> Result<(), Error> {
    if window.is_maximized().map_err(shell_failure)? {
        window.unmaximize().map_err(shell_failure)
    } else {
        window.maximize().map_err(shell_failure)
    }
}

#[tauri::command]
pub fn window_drag(window: tauri::Window) -> Result<(), Error> {
    window.start_dragging().map_err(shell_failure)
}

#[tauri::command]
pub fn window_close(window: tauri::Window) -> Result<(), Error> {
    window.destroy().map_err(shell_failure)
}

#[tauri::command]
pub fn window_restart(app: tauri::AppHandle) -> Result<(), Error> {
    app.restart();
}
