pub mod bootstrap;
pub mod database;
pub mod diagnostics;
pub mod error;
pub mod export;
pub mod http;
mod import;
pub mod persisted;
pub mod settings;
pub mod state;
pub mod sync;
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

use crate::diagnostics::{DiagnosticLog, RotationLimits};
use crate::persisted::Persisted;
use crate::settings::Settings;
use crate::sync::RemoteSync;
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
        .plugin(tauri_plugin_dialog::init())
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

            let diagnostics_dir = data_dir.join(diagnostics::DIRECTORY_NAME);

            // installed before anything else can fail, so that what fails next
            // is recorded. A log that cannot be opened is the one failure with
            // nowhere to report itself.
            match DiagnosticLog::new(diagnostics_dir.clone(), RotationLimits::DEFAULT) {
                Ok(log) => diagnostics::install(log),
                Err(error) => eprintln!("failed to open the diagnostics log: {error}"),
            }

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

                if settings.database_path.as_os_str().is_empty() {
                    settings.database_path = db_dir.join(Database::FILENAME);
                }
                settings.recovery_path = data_dir.join(Update::FILENAME);
                settings.diagnostics_dir = diagnostics_dir;
                settings.version = env!("CARGO_PKG_VERSION").to_string();

                settings.commit().expect("failed to commit settings");

                let settings = Arc::new(RwLock::new(settings));

                let db = Arc::new(RwLock::new(Database::new(settings.clone())));

                let remote_sync = Arc::new(RwLock::new(
                    RemoteSync::new(settings.clone(), data_dir.join(RemoteSync::FILENAME))
                        .await
                        .expect("failed to create remote sync manager"),
                ));

                let update = Arc::new(RwLock::new(
                    Update::new(settings.clone())
                        .await
                        .expect("failed to create update manager"),
                ));

                handle.manage(AppState {
                    db,
                    settings,
                    remote_sync,
                    update,
                });
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            window::window_show,
            window::window_hide,
            window::window_minimize,
            window::window_maximize,
            window::window_drag,
            window::window_close,
            window::window_restart,
            database::commands::db_execute_single_sql,
            database::commands::db_execute_batch_sql,
            settings::settings_get,
            settings::settings_set,
            diagnostics::diagnostics_write,
            sync::remote_sync_state_get,
            sync::remote_sync_renew_session,
            sync::google_sign_in,
            sync::google_sign_out,
            export::export_write,
            export::export_write_workbook,
            import::import_read,
            import::import_read_book,
            update::update_prepare,
            bootstrap::bootstrap,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
