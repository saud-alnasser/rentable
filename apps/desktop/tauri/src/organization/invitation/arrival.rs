//! how a `rentable://` link reaches the running application: held for the shell to take, and
//! announced to it (`join.rs` records the decision).
//!
//! **Received in the app's `.setup`, and never in a plugin's.** A link the launch hands over is
//! held in the organization's state and shows the hidden main window, and a plugin's setup runs
//! before the window exists: the windows the configuration declares are made after every plugin's
//! setup and just before the app's `.setup`. The state is the organization plugin's, managed in
//! its setup, so it is there by then. Received any earlier, the link would not be shown, and a
//! launch by link while the application was closed would open nothing.

use tauri::{Emitter, Manager};
use tauri_plugin_deep_link::DeepLinkExt;

use crate::{diagnostics, organization::Shared};

/// The event the shell listens to for a link that arrives while it is running.
pub const LINK_ARRIVED_EVENT: &str = "organization:link";

/// Register the scheme where a build has no installer to, listen for links opened while the
/// application runs, and take the one it was launched with. Called from the app's `.setup`, once
/// the windows exist and the organization's state is managed.
pub fn receive(app: &tauri::App) {
    // **How a join link reaches the application** (`organization/invitation/join.rs` records the
    // decision). The `rentable` scheme is registered with the operating system by the installer on
    // Windows and Linux and by `Info.plist` on macOS, from the plugin's configuration; a
    // development build has no installer, so it registers the scheme for its own executable here,
    // and a failure to is logged rather than fatal, because the join screen also takes a pasted
    // link.
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
}

/// A `rentable://` link reached this process: hold it for the shell to take, and tell the shell.
/// Held as well as announced because the two races both happen: a launch hands the link over
/// before the webview exists, and an arrival while running finds the webview listening.
fn arrive(handle: &tauri::AppHandle, link: String) {
    if let Some(state) = handle.try_state::<Shared>()
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

#[cfg(test)]
mod tests {
    use std::path::Path;

    /// **A launch by link while the application is closed still shows the window**, as far as a
    /// test reaches it: the links are received in the app's `.setup`, which runs once the windows
    /// exist, after the organization plugin whose setup manages the state they are held in, and no
    /// plugin receives them in its own setup, which runs before any window exists. That the window
    /// then shows is the person's check, since no window exists under test.
    #[test]
    fn links_are_received_once_the_window_and_the_state_exist() {
        let lib = include_str!("../../lib.rs");
        let registered = lib
            .find(".plugin(organization::plugin())")
            .expect("lib.rs does not register the organization plugin");
        let setup = lib.find(".setup(|app|").expect("lib.rs has no app setup");
        let received = lib
            .find("arrival::receive(app)")
            .expect("lib.rs's setup receives no links");

        assert!(
            registered < setup && setup < received,
            "the links are received outside the app's setup, or before the organization plugin \
             that manages their state is registered"
        );
        assert!(
            include_str!("../plugin.rs").contains("app.manage(Shared {"),
            "the organization plugin's setup does not manage the state a link is held in"
        );

        let source = Path::new(env!("CARGO_MANIFEST_DIR")).join("src");

        for entry in std::fs::read_dir(&source)
            .expect("cannot read src/")
            .flatten()
        {
            let plugin = entry.path().join("plugin.rs");

            if let Ok(text) = std::fs::read_to_string(&plugin) {
                assert!(
                    !text.contains("arrival::receive") && !text.contains("deep_link()"),
                    "{} receives links, and a plugin's setup runs before any window exists",
                    plugin.display()
                );
            }
        }
    }
}
