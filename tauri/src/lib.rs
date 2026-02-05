pub mod commands;
pub mod database;
pub mod state;

use state::AppState;
use std::path::PathBuf;
use std::{fs, sync::Arc};
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
            let db_dir = {
                let scope = app.fs_scope();
                let app_data_directory = app.path().app_data_dir()?;
                scope.allow_directory(&app_data_directory, true)?;

                let db_dir = &app_data_directory.display().to_string();
                fs::create_dir_all(format!("{}", db_dir))?;

                Ok(PathBuf::from(db_dir))
            }
            .unwrap_or_else(|err: tauri::Error| panic!("{}", err));

            #[cfg(not(debug_assertions))]
            let migration_dir = app.path().resolve("migrations", BaseDirectory::Resource)?;
            #[cfg(debug_assertions)]
            let migration_dir = PathBuf::new().join("migrations");

            let app_state = AppState {
                db: Arc::new(RwLock::new(None)),
                db_dir: db_dir,
                migration_dir: migration_dir,
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
