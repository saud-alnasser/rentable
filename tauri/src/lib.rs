pub mod commands;
pub mod database;
pub mod state;

use state::AppState;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::Manager;
#[cfg(not(debug_assertions))]
use tauri::path::BaseDirectory;
use tauri_plugin_fs::FsExt;
use tokio::sync::RwLock;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(debug_assertions)]
    dotenvy::dotenv().ok();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let db_dir: PathBuf = if cfg!(debug_assertions) {
                let dir = std::env::current_dir()?;
                std::fs::create_dir_all(&dir)?;
                dir
            } else {
                let app_data_dir = app.path().app_data_dir()?;
                app.fs_scope().allow_directory(&app_data_dir, true)?;
                std::fs::create_dir_all(&app_data_dir)?;
                app_data_dir
            };

            let migration_dir: PathBuf = if cfg!(debug_assertions) {
                PathBuf::from("migrations")
            } else {
                app.path()
                    .resolve("migrations", tauri::path::BaseDirectory::Resource)?
            };

            let app_state = AppState {
                db: Arc::new(RwLock::new(None)),
                db_dir,
                migration_dir,
            };

            app.manage(app_state);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::greet,
            commands::window_show,
            database::commands::db_execute_single_sql,
            database::commands::db_execute_batch_sql,
            database::commands::db_does_exist,
            database::commands::db_is_ready,
            database::commands::db_connect,
            database::commands::db_disconnect,
            database::commands::db_purge,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
