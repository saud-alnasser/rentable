#[tauri::command]
pub fn show_window(window: tauri::Window) {
    window.show().unwrap();
}
