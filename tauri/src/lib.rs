pub mod backup;
pub mod bootstrap;
pub mod database;
pub mod persisted;
pub mod settings;
pub mod state;
pub mod timestamp;
pub mod update;
pub mod window;

use database::Database;
use state::AppState;
use std::env;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{Manager, async_runtime};
use tauri_plugin_fs::FsExt;
use tokio::sync::RwLock;

use crate::backup::Backup;
use crate::persisted::Persisted;
use crate::settings::Settings;
use crate::update::Update;

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
            let data_dir = app
                .path()
                .app_data_dir()
                .expect("failed to get app data dir");

            app.fs_scope()
                .allow_directory(&data_dir, true)
                .expect("failed to allow directory");

            std::fs::create_dir_all(&data_dir).expect("failed to create directory");

            let db_dir: PathBuf = if cfg!(debug_assertions) {
                let current_dir = std::env::current_dir().expect("failed to get current dir");
                std::fs::create_dir_all(&current_dir).expect("failed to create directory");
                current_dir
            } else {
                data_dir.clone()
            };

            let handle = app.handle();

            async_runtime::block_on(async move {
                let mut settings = Persisted::<Settings>::load(data_dir.join(Settings::FILENAME))
                    .expect("failed to load settings");

                settings.default_database_path = db_dir.join(Database::FILENAME);
                settings.backup_dir = data_dir.join(Backup::BACKUP_DIRECTORY);
                settings.recovery_path = data_dir.join(Update::FILENAME);
                settings.version = env!("CARGO_PKG_VERSION").to_string();

                if settings.active_database_path.is_none() {
                    settings.active_database_path = Some(settings.default_database_path.clone());
                }

                settings.migration_dir = if cfg!(debug_assertions) {
                    PathBuf::from("migrations")
                } else {
                    handle
                        .path()
                        .resolve("migrations", tauri::path::BaseDirectory::Resource)
                        .expect("failed to resolve migrations")
                };

                settings.commit().expect("failed to commit settings");

                let settings = Arc::new(RwLock::new(settings));

                let db = Arc::new(RwLock::new(Database::new(settings.clone())));

                let backup = Arc::new(RwLock::new(
                    Backup::new(db.clone(), settings.clone())
                        .await
                        .expect("failed to create backup manager"),
                ));

                let update = Arc::new(RwLock::new(
                    Update::new(backup.clone(), settings.clone())
                        .await
                        .expect("failed to create update manager"),
                ));

                handle.manage(AppState {
                    db,
                    settings,
                    backup,
                    update,
                });
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            window::window_show,
            window::window_minimize,
            window::window_maximize,
            window::window_drag,
            window::window_close,
            window::window_restart,
            database::commands::db_execute_single_sql,
            database::commands::db_execute_batch_sql,
            settings::settings_get,
            settings::settings_set,
            backup::backup_list,
            backup::backup_create,
            backup::backup_restore,
            backup::backup_delete,
            update::update_prepare,
            bootstrap::bootstrap,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
