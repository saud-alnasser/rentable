pub mod commands;
pub mod models;
pub mod schema;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(debug_assertions)]
    {
        dotenvy::dotenv().ok();
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::greet,
            commands::show_window
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
