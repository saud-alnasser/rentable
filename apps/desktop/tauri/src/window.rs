use crate::error::Error;

#[tauri::command]
pub fn window_show(window: tauri::Window) -> Result<(), Error> {
    Ok(window.show()?)
}

#[tauri::command]
pub fn window_hide(window: tauri::Window) -> Result<(), Error> {
    Ok(window.hide()?)
}

#[tauri::command]
pub fn window_minimize(window: tauri::Window) -> Result<(), Error> {
    Ok(window.minimize()?)
}

#[tauri::command]
pub fn window_maximize(window: tauri::Window) -> Result<(), Error> {
    if window.is_maximized()? {
        Ok(window.unmaximize()?)
    } else {
        Ok(window.maximize()?)
    }
}

#[tauri::command]
pub fn window_drag(window: tauri::Window) -> Result<(), Error> {
    Ok(window.start_dragging()?)
}

#[tauri::command]
pub fn window_close(window: tauri::Window) -> Result<(), Error> {
    Ok(window.destroy()?)
}

#[tauri::command]
pub fn window_restart(app: tauri::AppHandle) -> Result<(), Error> {
    app.restart();
}
