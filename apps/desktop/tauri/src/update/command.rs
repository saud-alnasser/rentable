//! The updater's commands: a check, a download held in the application's state, and an install
//! now. Each builds its updater from the updater plugin's configuration, so the endpoint and the
//! public key are `tauri.conf.json`'s `plugins.updater` (the key overridden at build time where
//! `TAURI_UPDATER_PUBLIC_KEY` is set, `lib.rs`).
//!
//! Installing at quit is not a command: the quit path calls [`at_quit`] once it has pushed.

use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_updater::UpdaterExt;

use crate::{error::Error, settings};

use super::Shared;
use super::release::{
    self, AtQuit, Checked, Downloaded, Fetched, Held, PROGRESS_EVENT, Progress, failure,
};

/// Invoked as `plugin:update|check`.
///
/// No release is the `noRelease` outcome; offline is a `network` error, and any other failure is
/// an error of its own code. A release found is held for the download.
#[tauri::command(rename = "check")]
pub async fn update_check(app: AppHandle, releases: State<'_, Held>) -> Result<Checked, Error> {
    let updater = app.updater().map_err(failure)?;
    let found = release::outcome(updater.check().await)?;
    let mut releases = releases.lock().await;

    Ok(match found {
        Some(update) => {
            let checked = Checked::available(&update);
            releases.found = Some(update);

            checked
        }
        None => {
            releases.found = None;

            Checked::NoRelease
        }
    })
}

/// Invoked as `plugin:update|download`.
///
/// Downloads the release the last check found and holds its bytes, verified, in the application's
/// state, reporting each chunk as [`PROGRESS_EVENT`]. A release already downloaded answers at
/// once; a download already running is `busy`.
#[tauri::command(rename = "download")]
pub async fn update_download(app: AppHandle, releases: State<'_, Held>) -> Result<Fetched, Error> {
    let found = {
        let mut releases = releases.lock().await;

        let Some(found) = releases.found.clone() else {
            return Err(Error::PreconditionFailed {
                message: "no release was found to download; check first".to_string(),
            });
        };

        if let Some(downloaded) = &releases.downloaded
            && downloaded.release.version() == found.version
        {
            return Ok(Fetched {
                version: found.version,
            });
        }

        if releases.downloading {
            return Err(Error::Busy {
                message: "a release is already being downloaded".to_string(),
            });
        }

        releases.downloading = true;

        found
    };

    let version = found.version.clone();
    let mut downloaded: u64 = 0;
    let bytes = found
        .download(
            |chunk, content_length| {
                downloaded += chunk as u64;

                let _ = app.emit(
                    PROGRESS_EVENT,
                    Progress {
                        version: version.clone(),
                        downloaded,
                        content_length,
                    },
                );
            },
            || {},
        )
        .await;

    let mut releases = releases.lock().await;
    releases.downloading = false;

    let bytes = bytes.map_err(failure)?;
    releases.downloaded = Some(Downloaded {
        release: Box::new(found),
        bytes,
    });

    Ok(Fetched { version })
}

/// Invoked as `plugin:update|install`.
///
/// Writes the route back, installs the downloaded release and starts it. On Windows the installer
/// starts it and this never returns; elsewhere the application restarts into it.
#[tauri::command(rename = "install")]
pub async fn update_install(
    app: AppHandle,
    releases: State<'_, Held>,
    update: State<'_, Shared>,
    settings: State<'_, settings::Shared>,
) -> Result<(), Error> {
    let running = settings.read().await.version.clone();

    release::install_now(&releases, &update, &running).await?;

    app.restart();
}

/// **Install a downloaded release as the application quits**, without starting it.
///
/// The quit path calls this once it has pushed the workspace and before the window goes. Nothing
/// it meets stops the quit: a failure is in diagnostics, and the release is left for the next run
/// to find again.
pub async fn at_quit(app: &AppHandle) -> AtQuit {
    let (Some(releases), Some(update), Some(settings)) = (
        app.try_state::<Held>(),
        app.try_state::<Shared>(),
        app.try_state::<settings::Shared>(),
    ) else {
        return AtQuit::NothingHeld;
    };

    let running = settings.read().await.version.clone();

    release::install_at_quit(&releases, &update, &running).await
}
