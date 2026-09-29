pub mod backup;
pub mod bootstrap;
pub mod clock;
// private, and it stays that way: what it hands back is a credential, so its callers are in
// this crate and nowhere else ([[rules/credentials]], *Client boundary*).
mod credential;
pub mod database;
pub mod diagnostics;
pub mod error;
pub mod export;
// test-only: the structural guards, which hold the tree to rules/module-layout and ship nothing.
#[cfg(test)]
mod guard;
pub mod http;
mod import;
pub mod machine;
pub mod organization;
pub mod persisted;
pub mod print;
pub mod schema;
pub mod settings;
pub mod state;
pub mod sync;
// test-only: the scaffolding every test in the crate shares.
#[cfg(test)]
mod test;
pub mod turso;
pub mod update;
pub mod upgrade;
pub mod window;

use database::Database;
use state::AppState;
use std::env;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager, async_runtime};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_fs::FsExt;
use tokio::sync::RwLock;

use crate::diagnostics::{DiagnosticLog, RotationLimits};
use crate::machine::RemoteSync;
use crate::persisted::Persisted;
use crate::settings::Settings;
use crate::turso::consent::TursoConsent;
use crate::update::Update;

/// The event the shell listens to for a link that arrives while it is running.
pub const LINK_ARRIVED_EVENT: &str = "organization:link";

/// A `rentable://` link reached this process: hold it for the shell to take, and tell the shell.
/// Held as well as announced because the two races both happen: a launch hands the link over
/// before the webview exists, and an arrival while running finds the webview listening.
fn arrive(handle: &tauri::AppHandle, link: String) {
    if let Some(state) = handle.try_state::<AppState>()
        && let Ok(mut arriving) = state.arriving_link.lock()
    {
        *arriving = Some(link.clone());
    }

    if let Err(error) = handle.emit(LINK_ARRIVED_EVENT, link) {
        diagnostics::warn("organization.link.notAnnounced")
            .with("error", error.to_string().as_str())
            .write();
    }

    if let Some(window) = handle.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

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
            let diagnostics_dir = data_dir.join(diagnostics::DIRECTORY_NAME);

            // installed before anything else can fail, so that what fails next
            // is recorded. A log that cannot be opened is the one failure with
            // nowhere to report itself.
            match DiagnosticLog::new(diagnostics_dir.clone(), RotationLimits::DEFAULT) {
                Ok(log) => diagnostics::install(log, clock.clone()),
                Err(error) => eprintln!("failed to open the diagnostics log: {error}"),
            }

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

            // **How a join link reaches the application** (`organization/invitation/join.rs`
            // records the decision). The `rentable` scheme is registered with the operating system
            // by the installer on Windows and Linux and by `Info.plist` on macOS, from the plugin's
            // configuration; a development build has no installer, so it registers the scheme for
            // its own executable here, and a failure to is logged rather than fatal, because the
            // join screen also takes a pasted link.
            #[cfg(all(debug_assertions, any(windows, target_os = "linux")))]
            if let Err(error) = app.deep_link().register_all() {
                diagnostics::warn("organization.link.schemeNotRegistered")
                    .with("error", error.to_string().as_str())
                    .write();
            }

            // a link opened while the application runs, or forwarded by the second launch the
            // single-instance plugin turned away: held for the shell to take, and announced to it.
            let handle = app.handle().clone();

            app.deep_link().on_open_url(move |event| {
                let Some(link) = event.urls().first().map(|url| url.to_string()) else {
                    return;
                };

                arrive(&handle, link);
            });

            // the link this process was launched with, if any.
            if let Ok(Some(urls)) = app.deep_link().get_current()
                && let Some(link) = urls.first().map(|url| url.to_string())
            {
                arrive(app.handle(), link);
            }

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
            database::command::db_execute_single_sql,
            database::command::db_execute_batch_sql,
            settings::settings_get,
            settings::settings_set,
            diagnostics::diagnostics_write,
            sync::remote_sync_state_get,
            organization::workspace::remote_sync_rename_workspace,
            organization::session::remote_sync_replicate,
            sync::remote_sync_push,
            organization::setup::organization_consent_begin,
            organization::setup::organization_consent_result,
            organization::setup::organization_consent_disconnect,
            organization::setup::organization_create,
            organization::setup::organization_group_inspect,
            organization::setup::organization_connect_existing,
            organization::session::organization_disconnect,
            organization::member::organization_delete,
            organization::session::organization_state_get,
            organization::session::organization_sign_in,
            organization::session::organization_sign_out,
            organization::workspace::workspace_create,
            organization::workspace::workspace_grant,
            organization::workspace::workspace_grant_withdraw,
            organization::workspace::workspace_delete,
            organization::workspace::workspace_open,
            organization::workspace::organization_renew_credentials,
            organization::workspace::organization_renew_due,
            organization::invitation::member_create,
            organization::invitation::member_link_make,
            organization::invitation::member_password_unset,
            organization::role::organization_roles,
            organization::role::role_create,
            organization::role::role_rename,
            organization::role::role_set_mask,
            organization::role::role_move,
            organization::role::role_delete,
            organization::role::member_assign_role,
            organization::role::member_set_override,
            organization::role::member_set_workspace_override,
            organization::ownership::member_offer_ownership,
            organization::ownership::member_withdraw_offer,
            organization::ownership::ownership_accept,
            organization::member::member_rename,
            organization::mark::organization_mark_get,
            organization::mark::organization_mark_set,
            organization::mark::organization_mark_clear,
            organization::member::member_remove,
            organization::member::member_lock_out_cost,
            organization::member::member_end_sessions,
            organization::session::organization_session_end_elsewhere,
            organization::member::organization_change_password,
            organization::setup::organization_account_refusal_detail,
            organization::invitation::invitation_accept,
            organization::invitation::machine_connect,
            organization::member::organization_members,
            organization::member::organization_member_standings,
            organization::invitation::organization_link_take,
            organization::invitation::organization_link_read,
            organization::setup::organization_reconnect_authority,
            export::export_write,
            export::export_write_workbook,
            print::print_page,
            import::import_read,
            import::import_read_book,
            upgrade::record::earlier_find,
            upgrade::record::earlier_read,
            update::update_prepare,
            bootstrap::bootstrap,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
