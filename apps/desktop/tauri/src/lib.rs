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

    let launched = tauri::Builder::default()
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
        .run(tauri::generate_context!());

    if let Err(error) = launched {
        cannot_start(&error);
    }
}

/// **A launch that cannot start says why, and stops** (effort 854, requirement 17).
///
/// A plugin's setup returns its error rather than panicking, and the one a person can meet is a
/// record the system will not let the application open: `remote-sync.json` locked by another
/// process, or a file with no permission. That record is never started over, since it holds every
/// organization this machine has, so the launch shows a message naming the file, in both languages
/// ([`notice`]), logs the reason under `startup.failed`, and exits non-zero.
///
/// The message is the operating system's own, through `rfd`, because nothing of Tauri's is left
/// to show one: no window has been made, and the dialog plugin's setup has not run.
fn cannot_start(error: &tauri::Error) -> ! {
    let reason = match error {
        tauri::Error::PluginInitialization(_, reason) => reason.clone(),
        error => error.to_string(),
    };

    let mut failed = diagnostics::error("startup.failed").with("error", reason.clone());
    if let Some(record) = persisted::unopenable_record(&reason) {
        failed = failed.with("record", record.display().to_string());
    }
    failed.write();
    eprintln!("rentable could not start: {reason}");

    let notice = notice(&reason);

    #[cfg(any(target_os = "macos", windows, target_os = "linux"))]
    rfd::MessageDialog::new()
        .set_level(rfd::MessageLevel::Error)
        .set_title(notice.title)
        .set_description(notice.description)
        .set_buttons(rfd::MessageButtons::Ok)
        .show();

    std::process::exit(1);
}

/// what the message at a launch that cannot start says.
#[derive(Debug)]
struct Notice {
    title: String,
    description: String,
}

/// **The message at a launch that cannot start, in Arabic and in English** (effort 854, ticket
/// 36). The language a person chose lives in `settings.json`, which may be the very file that
/// would not open, so the message says everything in both rather than guess one.
///
/// It names the file where the failure was a record that would not open, and says what to do.
/// **The reason itself is never shown**: it is a developer's text, in English only, and it is in
/// the log under `startup.failed` (`rules/api-layer`, *Errors*).
fn notice(reason: &str) -> Notice {
    let title = "تعذّر تشغيل rentable / rentable could not start".to_string();

    let description = match persisted::unopenable_record(reason) {
        Some(path) => format!(
            "تعذّر على rentable فتح ملف يحتاجه ليبدأ. أغلق أي برنامج آخر قد يستخدم هذا الملف، \
             أو تأكد من أن لديك إذنًا بفتحه، ثم افتح rentable مرة أخرى.\n\n\
             rentable could not open a file it needs to start. close any other program that may \
             be using this file, or make sure you are allowed to open it, then open rentable \
             again.\n\n{}",
            path.display()
        ),
        None => "تعذّر على rentable أن يبدأ. افتح rentable مرة أخرى، وإن تكرر ذلك فأعد تشغيل \
                 الجهاز ثم حاول مجددًا.\n\n\
                 rentable could not start. open rentable again, and if this keeps happening, \
                 restart the computer and try once more."
            .to_string(),
    };

    Notice { title, description }
}

#[cfg(test)]
mod tests {
    use super::notice;
    use crate::persisted::unopenable_message;
    use std::path::Path;

    /// what Windows says of a file another process holds: the developer's text the message
    /// never shows.
    const LOCKED: &str = "The process cannot access the file because it is being used by \
                          another process. (os error 32)";

    fn arabic(text: &str) -> bool {
        text.chars().any(|c| ('\u{0600}'..='\u{06FF}').contains(&c))
    }

    fn english(text: &str) -> bool {
        text.contains("rentable could not")
    }

    /// **Lower case throughout**, as `rules/frontend` asks of every description: a capital on a
    /// second sentence beside a first in lower case reads as two styles. `named` is a file the
    /// message shows as it is, whatever its case.
    fn lower_case(text: &str, named: &str) -> bool {
        !text
            .replace(named, "")
            .chars()
            .any(|c| c.is_ascii_uppercase())
    }

    /// **A locked record is named, in both languages, and the reason stays in the log** (effort
    /// 854, requirement 17, ticket 36): the language setting may be the file that would not open,
    /// so the message cannot pick one.
    #[test]
    fn a_locked_record_is_named_in_both_languages_without_the_system_text() {
        let path = Path::new("C:/Users/someone/AppData/Roaming/rentable/remote-sync.json");
        let notice = notice(&unopenable_message(path, LOCKED));

        assert!(arabic(&notice.title), "no Arabic title: {notice:?}");
        assert!(english(&notice.title), "no English title: {notice:?}");
        assert!(
            arabic(&notice.description),
            "no Arabic sentence: {notice:?}"
        );
        assert!(
            english(&notice.description),
            "no English sentence: {notice:?}"
        );
        assert!(
            notice.description.contains(&path.display().to_string()),
            "the file is not named: {notice:?}"
        );
        assert!(
            !notice.description.contains("os error")
                && !notice.description.contains("process cannot"),
            "the system's text is shown: {notice:?}"
        );
        assert!(
            !notice.description.contains("could not be opened:"),
            "the developer's message is shown: {notice:?}"
        );
        assert!(
            lower_case(&notice.title, "")
                && lower_case(&notice.description, &path.display().to_string()),
            "a sentence opens with a capital: {notice:?}"
        );
    }

    /// a launch that failed on anything else says so in both languages, and shows no reason.
    #[test]
    fn any_other_failure_reads_in_both_languages_without_its_reason() {
        let notice = notice("the updater plugin's key is malformed");

        assert!(
            arabic(&notice.title) && english(&notice.title),
            "{notice:?}"
        );
        assert!(arabic(&notice.description), "{notice:?}");
        assert!(english(&notice.description), "{notice:?}");
        assert!(!notice.description.contains("malformed"), "{notice:?}");
        assert!(
            lower_case(&notice.title, "") && lower_case(&notice.description, ""),
            "a sentence opens with a capital: {notice:?}"
        );
    }
}
