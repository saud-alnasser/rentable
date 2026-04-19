pub mod backup;
pub mod bootstrap;
pub mod database;
pub mod persisted;
pub mod remote_sync;
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
use crate::remote_sync::RemoteSync;
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

                if settings.database_path.as_os_str().is_empty() {
                    settings.database_path = db_dir.join(Database::FILENAME);
                }
                settings.backup_dir = data_dir.join(Backup::BACKUP_DIRECTORY);
                settings.recovery_path = data_dir.join(Update::FILENAME);
                settings.version = env!("CARGO_PKG_VERSION").to_string();

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

                let remote_sync = Arc::new(RwLock::new(
                    RemoteSync::new(settings.clone(), data_dir.join(RemoteSync::FILENAME))
                        .await
                        .expect("failed to create remote sync manager"),
                ));

                {
                    let workspace = {
                        let remote_sync = remote_sync.read().await;
                        Some(remote_sync.workspace())
                    };

                    backup
                        .write()
                        .await
                        .sync_manifest_workspace(workspace.as_ref())
                        .expect("failed to sync backup manifest workspace");
                }

                let update = Arc::new(RwLock::new(
                    Update::new(backup.clone(), settings.clone())
                        .await
                        .expect("failed to create update manager"),
                ));

                handle.manage(AppState {
                    db,
                    settings,
                    backup,
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
            backup::backup_list,
            backup::backup_create,
            backup::backup_restore,
            backup::backup_delete,
            remote_sync::remote_sync_state_get,
            remote_sync::remote_sync_snapshot_now,
            remote_sync::remote_sync_autosave_now,
            remote_sync::remote_sync_google_drive_config_get,
            remote_sync::remote_sync_google_drive_begin_link,
            remote_sync::remote_sync_google_drive_get_link_result,
            remote_sync::remote_sync_google_drive_cancel_link,
            remote_sync::remote_sync_google_drive_complete_link,
            remote_sync::remote_sync_google_drive_get_account_auth,
            remote_sync::remote_sync_google_drive_update_account,
            remote_sync::remote_sync_google_drive_disconnect_account,
            remote_sync::remote_sync_google_drive_acquire_lock,
            remote_sync::remote_sync_google_drive_release_lock,
            remote_sync::remote_sync_google_drive_get_local_fingerprint,
            remote_sync::remote_sync_google_drive_prepare_push,
            remote_sync::remote_sync_google_drive_mark_synced,
            remote_sync::remote_sync_google_drive_apply_pull,
            update::update_prepare,
            bootstrap::bootstrap,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
