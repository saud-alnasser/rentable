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
pub mod sync;
// test-only: the scaffolding every test in the crate shares.
#[cfg(test)]
mod test;
pub mod transfer;
pub mod turso;
pub mod update;
pub mod upgrade;
pub mod window;

use std::sync::Arc;
use tauri::Manager;
use tauri_plugin_fs::FsExt;

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
        // **The application's own features, each an inline plugin, in the order their setups
        // run.** Each manages its own state in its setup, and a setup reads only what the builder
        // or an earlier setup managed, so the order is the order the state is built in:
        //
        // - `diagnostics` first, so that its setup installs the log before anything after it can
        //   fail.
        // - `settings`, whose setup makes the data directory and loads the settings, with the
        //   places this machine keeps its files at filled in.
        // - `database`, then `sync`, then `update`, each made from the settings: the workspace
        //   database with nothing open, this machine's record (`machine::Shared`, the one lock the
        //   organization's commands write through as well), and the route back.
        // - `upgrade`, whose setup manages the port the organization's session runs the upgrade
        //   of an older install through.
        // - `organization` after all four, since its state holds the database, the settings, the
        //   record and the upgrade port beside its own.
        //
        // The rest manage nothing and read the others' state when a command is called. None of
        // them reads a window in its setup, since no window exists until every plugin's setup has
        // run.
        .plugin(diagnostics::plugin())
        .plugin(window::plugin())
        .plugin(settings::plugin())
        .plugin(database::plugin())
        .plugin(sync::plugin())
        .plugin(update::plugin())
        .plugin(print::plugin())
        .plugin(transfer::plugin())
        .plugin(startup::plugin())
        .plugin(upgrade::plugin())
        .plugin(organization::plugin())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(updater_plugin.build())
        // what must run after every plugin's setup, and once the windows exist.
        .setup(|app| {
            // the webview's own reach into the data directory, through the `fs` plugin registered
            // above; the directory itself was made by the settings plugin's setup.
            let data_dir = app
                .path()
                .app_data_dir()
                .expect("failed to get app data dir");

            app.fs_scope()
                .allow_directory(&data_dir, true)
                .expect("failed to allow directory");

            // a `rentable://` link: the one this process was launched with, and any opened while
            // it runs. Here and not in the organization plugin's setup, because it shows the main
            // window, which a plugin's setup runs before, and holds the link in the organization's
            // state, which that setup managed (`organization/invitation/arrival.rs`).
            organization::invitation::arrival::receive(app);

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
