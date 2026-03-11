pub mod commands;
pub mod database;
pub mod settings;
pub mod state;

use database::Database;
use settings::SettingsState;
use state::AppState;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::Manager;
use tauri_plugin_fs::FsExt;
use tokio::sync::RwLock;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(debug_assertions)]
    dotenvy::dotenv().ok();

    let mut updater_plugin = tauri_plugin_updater::Builder::new();

    if let Some(public_key) =
        option_env!("TAURI_UPDATER_PUBLIC_KEY").filter(|value| !value.trim().is_empty())
    {
        updater_plugin = updater_plugin.pubkey(public_key);
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(updater_plugin.build())
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            app.fs_scope().allow_directory(&app_data_dir, true)?;
            std::fs::create_dir_all(&app_data_dir)?;

            let db_dir: PathBuf = if cfg!(debug_assertions) {
                let current_dir = std::env::current_dir()?;
                std::fs::create_dir_all(&current_dir)?;
                current_dir
            } else {
                app_data_dir.clone()
            };

            let default_db_path = Database::default_path_in(&db_dir);
            let settings_path = app_data_dir.join("settings.json");
            let backup_dir = app_data_dir.join("backups");
            let settings_state = SettingsState::load(settings_path, backup_dir)?;
            let active_db_path = settings_state.resolved_database_path(&default_db_path);

            let migration_dir: PathBuf = if cfg!(debug_assertions) {
                PathBuf::from("migrations")
            } else {
                app.path()
                    .resolve("migrations", tauri::path::BaseDirectory::Resource)?
            };

            let app_state = AppState {
                db: Arc::new(RwLock::new(None)),
                default_db_path,
                active_db_path: Arc::new(RwLock::new(active_db_path)),
                migration_dir,
                settings: Arc::new(RwLock::new(settings_state)),
                version: env!("CARGO_PKG_VERSION"),
            };

            app.manage(app_state);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::greet,
            commands::window_show,
            commands::window_minimize,
            commands::window_toggle_maximize,
            commands::window_start_dragging,
            commands::window_close,
            commands::window_restart,
            database::commands::db_execute_single_sql,
            database::commands::db_execute_batch_sql,
            database::commands::db_does_exist,
            database::commands::db_is_ready,
            database::commands::db_connect,
            database::commands::db_disconnect,
            database::commands::db_purge,
            settings::settings_get,
            settings::settings_set_ending_soon_notice_days,
            settings::settings_set_database_path,
            settings::settings_reset_database_path,
            settings::settings_create_backup,
            settings::settings_delete_backup,
            settings::settings_restore_backup,
            settings::settings_proceed_failed_update,
            settings::settings_rollback_failed_update,
            settings::settings_mark_synced,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
