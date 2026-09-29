pub mod backup;
pub mod clock;
// private, and it stays that way: what it hands back is a credential, so its callers are in
// this crate and nowhere else ([[rules/credentials]], *Client boundary*).
mod credential;
pub mod database;
pub mod diagnostics;
pub mod error;
// test-only: the structural guards, which hold the tree to rules/module-layout and ship nothing.
#[cfg(test)]
mod guard;
pub mod http;
pub mod machine;
pub mod organization;
pub mod persisted;
pub mod print;
pub mod schema;
pub mod settings;
pub mod startup;
pub mod state;
pub mod sync;
// test-only: the scaffolding every test in the crate shares.
#[cfg(test)]
mod test;
pub mod transfer;
pub mod turso;
pub mod update;
pub mod upgrade;
pub mod window;

use database::Database;
use state::AppState;
use std::env;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::{Manager, async_runtime};
use tauri_plugin_fs::FsExt;
use tokio::sync::RwLock;

use crate::machine::RemoteSync;
use crate::persisted::Persisted;
use crate::settings::Settings;
use crate::turso::consent::TursoConsent;
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
        // the credential store, managed before any plugin so that whatever reads it finds it.
        .manage::<credential::Credentials>(Arc::new(credential::Os))
        // the clock, managed the same way and for the same reason.
        .manage::<clock::Shared>(clock::System::shared())
        // first, so that a second launch with a link on its command line reaches the instance
        // already running rather than starting another: the `deep-link` feature hands the
        // arguments to the deep-link plugin below, whose handler is the one place a link lands.
        .plugin(tauri_plugin_single_instance::init(
            |app, _arguments, _cwd| {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                }
            },
        ))
        // the application's own features, each an inline plugin. `diagnostics` first of them, so
        // that its setup installs the log before anything after it can fail. None of them reads
        // a window in its setup, since no window exists until every plugin's setup has run.
        .plugin(diagnostics::plugin())
        .plugin(window::plugin())
        .plugin(settings::plugin())
        .plugin(database::plugin())
        .plugin(print::plugin())
        .plugin(update::plugin())
        .plugin(transfer::plugin())
        .plugin(startup::plugin())
        .plugin(sync::plugin())
        .plugin(organization::plugin())
        .plugin(tauri_plugin_deep_link::init())
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

            let clock = app.state::<clock::Shared>().inner().clone();
            // the log itself was installed by the diagnostics plugin's setup, which ran first.
            let diagnostics_dir = data_dir.join(diagnostics::DIRECTORY_NAME);

            // **Where a development build keeps its databases, and it is a fixed place now.**
            //
            // *It was `current_dir()`, which is not one.* The working directory a dev build is
            // launched with is whatever launched it, so the database moved when the launcher did
            // — and because `database_path` below is only written when it is empty, the first
            // launch after a move went on opening the old one. The crate moved to
            // `apps/desktop/tauri` and a machine that had run it before kept a database at the
            // repository root, indefinitely, with the seed scripts and the app disagreeing about
            // which file was the workspace.
            //
            // `CARGO_MANIFEST_DIR` is this crate's own directory, resolved when it is compiled, so
            // it names the same place however the binary is started. `data/` keeps the replica and
            // its six sidecar files out of the crate root, and it is git-ignored.
            let db_dir: PathBuf = if cfg!(debug_assertions) {
                let dev_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("data");
                std::fs::create_dir_all(&dev_dir).expect("failed to create directory");
                dev_dir
            } else {
                data_dir.clone()
            };

            let handle = app.handle();

            async_runtime::block_on(async move {
                let mut settings = Persisted::<Settings>::load(data_dir.join(Settings::FILENAME))
                    .expect("failed to load settings");

                // **A development build always takes the path above; a release build keeps what
                // it was given.** A stored path is a person's choice in a shipped application —
                // the restore flow writes one — and it is a stale artefact in a checkout, left by
                // whatever directory a previous launch happened to start in.
                if cfg!(debug_assertions) || settings.database_path.as_os_str().is_empty() {
                    settings.database_path = db_dir.join(Database::FILENAME);
                }
                settings.recovery_path = data_dir.join(Update::FILENAME);
                settings.diagnostics_dir = diagnostics_dir;
                settings.version = env!("CARGO_PKG_VERSION").to_string();

                settings.commit().expect("failed to commit settings");

                let settings = Arc::new(RwLock::new(settings));

                let db = Arc::new(RwLock::new(Database::new(settings.clone(), clock.clone())));

                let remote_sync = Arc::new(RwLock::new(
                    RemoteSync::new(
                        settings.clone(),
                        data_dir.join(RemoteSync::FILENAME),
                        clock.clone(),
                    )
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
                    consent: Arc::new(TursoConsent::new()),
                    organization: Arc::new(RwLock::new(None)),
                    member: Arc::new(RwLock::new(None)),
                    arriving_link: Arc::new(Mutex::new(None)),
                    signed_out_elsewhere: Arc::new(std::sync::atomic::AtomicBool::new(false)),
                    old_shape_check: tokio::sync::OnceCell::new(),
                });
            });

            // a `rentable://` link: the one this process was launched with, and any opened while
            // it runs. Here and not in the organization plugin's setup, because it shows the main
            // window and holds the link in the state managed above, and a plugin's setup runs
            // before either exists (`organization/invitation/arrival.rs`).
            organization::invitation::arrival::receive(app);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            upgrade::record::earlier_find,
            upgrade::record::earlier_read,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
