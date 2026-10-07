//! A release of rentable, found, downloaded and installed from here rather than from the webview.
//!
//! **The bytes of a download are held in the application's state** (effort 857, requirement 12),
//! beside the `Update` that verified them, so a release downloaded in the background outlives the
//! window and can be installed when the person quits. The updater plugin's own JavaScript surface
//! cannot do that: it installs only with a relaunch, and only from a webview still holding the
//! download.
//!
//! What installs is [`Installer`], which the plugin's `Update` answers and a test answers with a
//! stand-in, so the quit path is exercised without a network or an installer.

use std::sync::Arc;

use serde::Serialize;
use tokio::sync::{Mutex, RwLock};

use crate::{diagnostics, error::Error};

use super::Update;

/// what the download reports while it runs: the bytes so far and, where the server said, of how
/// many.
pub const PROGRESS_EVENT: &str = "update:progress";

/// a release that can be installed from bytes already downloaded and verified.
pub trait Installer: Send + Sync {
    /// the version the release installs.
    fn version(&self) -> String;

    /// Run the installer over `bytes`. With `relaunch` the new version starts once it is
    /// installed; without it, nothing starts.
    ///
    /// **On Windows a successful install does not return**: the plugin launches the installer and
    /// exits the process. Elsewhere it returns, and starting again is the caller's.
    fn install(&self, bytes: &[u8], relaunch: bool) -> Result<(), Error>;
}

impl Installer for tauri_plugin_updater::Update {
    fn version(&self) -> String {
        self.version.clone()
    }

    fn install(&self, bytes: &[u8], relaunch: bool) -> Result<(), Error> {
        self.clone()
            .restart_after_install(relaunch)
            .install(bytes)
            .map_err(failure)
    }
}

/// a release downloaded and verified, waiting to be installed.
pub struct Downloaded {
    pub release: Box<dyn Installer>,
    pub bytes: Vec<u8>,
}

/// what this run knows of releases: the last one a check found, whether it is being downloaded,
/// and the one downloaded.
#[derive(Default)]
pub struct Releases {
    pub found: Option<tauri_plugin_updater::Update>,
    pub downloading: bool,
    pub downloaded: Option<Downloaded>,
}

/// the releases as the update plugin manages them.
pub type Held = Arc<Mutex<Releases>>;

/// What a check found.
///
/// **No release is an answer, not a failure**, so it is an outcome here. The other two a person
/// is told apart are errors in the crate's own shape: offline is [`Error::Network`], and anything
/// else is a failure of its own variant ([`failure`]).
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "outcome", rename_all = "camelCase")]
pub enum Checked {
    #[serde(rename_all = "camelCase")]
    Available {
        current_version: String,
        version: String,
        /// the manifest's `pub_date`, as it was published.
        date: Option<String>,
        body: Option<String>,
        raw_json: serde_json::Value,
    },
    NoRelease,
}

impl Checked {
    pub fn available(update: &tauri_plugin_updater::Update) -> Self {
        Self::Available {
            current_version: update.current_version.clone(),
            version: update.version.clone(),
            date: update
                .raw_json
                .get("pub_date")
                .and_then(serde_json::Value::as_str)
                .map(str::to_string),
            body: update.body.clone(),
            raw_json: update.raw_json.clone(),
        }
    }
}

/// what a download reports while it runs.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    pub version: String,
    pub downloaded: u64,
    pub content_length: Option<u64>,
}

/// the release a download finished with.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Fetched {
    pub version: String,
}

/// What a check answered, with "none published" read as no release.
///
/// **Only a missing manifest, or one naming no newer version, is no release.** The plugin says
/// [`tauri_plugin_updater::Error::ReleaseNotFound`] where no endpoint answered with a success, and
/// keeps the status to its log, so a server error and the 404 the release address answers before
/// any release carries a manifest arrive as the same error. Where it says so, each address in
/// `endpoints` is asked again ([`missing`]): a 404 is no release, and anything else is a failure,
/// since reading a server that is down as no release would tell a person held by a floor that
/// they are up to date while a newer release is out (ticket 29 of effort 857).
pub async fn outcome<T>(
    result: Result<Option<T>, tauri_plugin_updater::Error>,
    endpoints: &[String],
) -> Result<Option<T>, Error> {
    match result {
        Ok(found) => Ok(found),
        Err(tauri_plugin_updater::Error::ReleaseNotFound) => {
            missing(endpoints).await.map(|()| None)
        }
        Err(error) => Err(failure(error)),
    }
}

/// Whether every release address says it has no manifest: `Ok` where each answered 404, offline
/// where one could not be reached, and a failure naming the status where one answered anything
/// else. No address at all is a failure too, since nothing said there was no release.
async fn missing(endpoints: &[String]) -> Result<(), Error> {
    if endpoints.is_empty() {
        return Err(Error::Internal {
            message: "no release address is configured to look for updates at".to_string(),
        });
    }

    let client = crate::http::build_client(std::time::Duration::from_secs(30))?;

    for endpoint in endpoints {
        let response = client
            .get(endpoint)
            .header(reqwest::header::ACCEPT, "application/json")
            .send()
            .await
            .map_err(|error| Error::Network {
                message: format!("the release address could not be reached: {error}"),
            })?;
        let status = response.status();

        if status != reqwest::StatusCode::NOT_FOUND {
            return Err(Error::Internal {
                message: format!("the release address answered {status} rather than a release"),
            });
        }
    }

    Ok(())
}

/// An updater error in the crate's shape: offline as [`Error::Network`], a release that fails
/// its signature as [`Error::Integrity`], and the rest as what they are.
///
/// A request that never got an answer, or a download the server would not serve, is offline. A
/// manifest that arrived and would not read is not: that is a failure of the release, and trying
/// later from a better connection would not change it.
pub fn failure(error: tauri_plugin_updater::Error) -> Error {
    use tauri_plugin_updater::Error as Updater;

    let message = error.to_string();

    match error {
        Updater::Reqwest(error) if !error.is_decode() => Error::Network { message },
        Updater::Network(_) => Error::Network { message },
        Updater::Minisign(_)
        | Updater::Base64(_)
        | Updater::SignatureUtf8(_)
        | Updater::SignedVersionMismatch { .. }
        | Updater::MissingSignedVersion => Error::Integrity { message },
        Updater::Io(_) => Error::Io { message },
        _ => Error::Internal { message },
    }
}

/// What the quit path did about a downloaded release.
#[derive(Debug, PartialEq, Eq)]
pub enum AtQuit {
    /// nothing was downloaded.
    NothingHeld,
    /// the installer ran, without relaunching. On Windows this is never returned: the process
    /// has exited.
    Installed { version: String },
    /// it was not installed, and quitting goes on.
    NotInstalled,
}

/// Write the route back, then run the installer over the held release.
///
/// `None` where nothing is downloaded. The release stays held unless the installer ran: a route
/// back that could not be written, or an install that failed, leaves it to try again.
async fn install(
    releases: &Mutex<Releases>,
    update: &RwLock<Update>,
    running: &str,
    relaunch: bool,
) -> Option<Result<String, Error>> {
    let mut releases = releases.lock().await;
    let downloaded = releases.downloaded.take()?;
    let version = downloaded.release.version();

    // the route back first, as an install from the webview always wrote it: after the installer
    // is the case that does not happen.
    let installed = match update.write().await.prepare(running, &version).await {
        Ok(_) => downloaded.release.install(&downloaded.bytes, relaunch),
        Err(error) => Err(error),
    };

    match installed {
        Ok(()) => Some(Ok(version)),
        Err(error) => {
            releases.downloaded = Some(downloaded);

            Some(Err(error))
        }
    }
}

/// Install a downloaded release now, and have it start once installed.
///
/// The route back is written first ([`Update::prepare`]); a record that cannot be written, or an
/// install that fails, leaves the release held to try again.
pub async fn install_now(
    releases: &Mutex<Releases>,
    update: &RwLock<Update>,
    running: &str,
) -> Result<String, Error> {
    install(releases, update, running, true)
        .await
        .unwrap_or_else(|| {
            Err(Error::PreconditionFailed {
                message: "no release is downloaded to install".to_string(),
            })
        })
}

/// Install a downloaded release as the application quits, without starting it.
///
/// **Called after the quit path has pushed the workspace**, and **never in its way**: whatever
/// goes wrong is written to diagnostics and quitting goes on.
pub async fn install_at_quit(
    releases: &Mutex<Releases>,
    update: &RwLock<Update>,
    running: &str,
) -> AtQuit {
    match install(releases, update, running, false).await {
        None => AtQuit::NothingHeld,
        Some(Ok(version)) => {
            diagnostics::info("update.atQuit.installed")
                .with("version", version.clone())
                .write();

            AtQuit::Installed { version }
        }
        Some(Err(error)) => {
            diagnostics::warn("update.atQuit.notInstalled")
                .with("error", format!("{error:?}"))
                .write();

            AtQuit::NotInstalled
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{AtQuit, Downloaded, Installer, Releases, failure, install_at_quit, install_now};
    use crate::error::Error;
    use crate::persisted::Persisted;
    use crate::settings::Settings;
    use crate::sync::test::server::{ScriptedResponse, ScriptedServer};
    use crate::test::scratch;
    use crate::update::{RecoveryStatus, Update};
    use std::path::{Path, PathBuf};
    use std::sync::{Arc, Mutex as Recorded};
    use tokio::runtime::Runtime;
    use tokio::sync::{Mutex, RwLock};

    /// what the stand-in saw when it was asked to install: the bytes, whether it was to relaunch,
    /// and the route back as it stood on disk at that moment.
    #[derive(Debug, Clone)]
    struct Call {
        bytes: Vec<u8>,
        relaunch: bool,
        recovery: Option<(RecoveryStatus, String, String)>,
    }

    /// an installer that installs nothing: it records the call, and fails where told to.
    struct Stub {
        version: String,
        recovery_path: PathBuf,
        fails: bool,
        calls: Arc<Recorded<Vec<Call>>>,
    }

    impl Installer for Stub {
        fn version(&self) -> String {
            self.version.clone()
        }

        fn install(&self, bytes: &[u8], relaunch: bool) -> Result<(), Error> {
            let recovery = std::fs::read_to_string(&self.recovery_path)
                .ok()
                .and_then(|text| serde_json::from_str::<crate::update::Recovery>(&text).ok())
                .map(|r| (r.status, r.previous_version, r.target_version));

            self.calls.lock().expect("calls").push(Call {
                bytes: bytes.to_vec(),
                relaunch,
                recovery,
            });

            if self.fails {
                return Err(Error::Io {
                    message: "the installer would not start".to_string(),
                });
            }

            Ok(())
        }
    }

    async fn route_back(root: &Path) -> RwLock<Update> {
        std::fs::create_dir_all(root).expect("failed to create test root");

        let mut settings = Persisted::<Settings>::load(root.join(Settings::FILENAME))
            .expect("failed to load settings");
        settings.recovery_path = root.join(Update::FILENAME);
        settings.version = "0.5.1".to_string();
        settings.commit().expect("failed to commit settings");

        let update = Update::new(
            Arc::new(tokio::sync::RwLock::new(settings)),
            &crate::clock::System,
        )
        .await
        .expect("failed to create update manager");

        RwLock::new(update)
    }

    fn holding(root: &Path, fails: bool) -> (Mutex<Releases>, Arc<Recorded<Vec<Call>>>) {
        let calls = Arc::new(Recorded::new(Vec::new()));
        let releases = Releases {
            downloaded: Some(Downloaded {
                release: Box::new(Stub {
                    version: "0.5.2".to_string(),
                    recovery_path: root.join(Update::FILENAME),
                    fails,
                    calls: calls.clone(),
                }),
                bytes: vec![1, 2, 3],
            }),
            ..Releases::default()
        };

        (Mutex::new(releases), calls)
    }

    /// **The quit path installs a downloaded release without relaunching it** (effort 857,
    /// requirement 12), and the route back is written before the installer runs, so the version
    /// that arrives can name the one it displaced.
    #[test]
    fn quitting_installs_a_downloaded_release_without_relaunching_after_the_route_back() {
        Runtime::new().expect("runtime").block_on(async {
            let root = scratch("update-release-at-quit");
            let update = route_back(&root).await;
            let (releases, calls) = holding(&root, false);

            let done = install_at_quit(&releases, &update, "0.5.1").await;

            assert_eq!(
                done,
                AtQuit::Installed {
                    version: "0.5.2".to_string()
                }
            );
            let calls = calls.lock().expect("calls").clone();
            assert_eq!(calls.len(), 1, "{calls:?}");
            assert!(!calls[0].relaunch, "the quit path relaunched: {calls:?}");
            assert_eq!(calls[0].bytes, vec![1, 2, 3]);
            assert_eq!(
                calls[0].recovery,
                Some((
                    RecoveryStatus::Pending,
                    "0.5.1".to_string(),
                    "0.5.2".to_string()
                )),
                "the route back was not written before the install"
            );

            let _ = std::fs::remove_dir_all(root);
        });
    }

    /// **A failed install never blocks quitting**: the quit path returns, says it did not
    /// install, and the release is let go.
    #[test]
    fn a_failed_install_at_quit_returns_and_quitting_goes_on() {
        Runtime::new().expect("runtime").block_on(async {
            let root = scratch("update-release-at-quit-fails");
            let update = route_back(&root).await;
            let (releases, calls) = holding(&root, true);

            let done = install_at_quit(&releases, &update, "0.5.1").await;

            assert_eq!(done, AtQuit::NotInstalled);
            assert_eq!(calls.lock().expect("calls").len(), 1);

            let _ = std::fs::remove_dir_all(root);
        });
    }

    /// with nothing downloaded, quitting installs nothing and writes no route back.
    #[test]
    fn quitting_with_nothing_downloaded_installs_nothing() {
        Runtime::new().expect("runtime").block_on(async {
            let root = scratch("update-release-at-quit-nothing");
            let update = route_back(&root).await;
            let releases = Mutex::new(Releases::default());

            let done = install_at_quit(&releases, &update, "0.5.1").await;

            assert_eq!(done, AtQuit::NothingHeld);
            assert!(!update.read().await.recovery().has_data());

            let _ = std::fs::remove_dir_all(root);
        });
    }

    /// **The route back on screen holds the install up at quit as it does now**: the running
    /// version is the pending target of an update nobody has judged, so the release is not
    /// installed and quitting goes on.
    #[test]
    fn a_pending_route_back_holds_the_install_at_quit_without_blocking_it() {
        Runtime::new().expect("runtime").block_on(async {
            let root = scratch("update-release-at-quit-pending");
            let update = route_back(&root).await;
            update
                .write()
                .await
                .prepare("0.5.0", "0.5.1")
                .await
                .expect("failed to seed the route back");
            let (releases, calls) = holding(&root, false);

            let done = install_at_quit(&releases, &update, "0.5.1").await;

            assert_eq!(done, AtQuit::NotInstalled);
            assert!(calls.lock().expect("calls").is_empty());

            let _ = std::fs::remove_dir_all(root);
        });
    }

    /// **Install now relaunches**, after writing the route back.
    #[test]
    fn installing_now_relaunches_after_the_route_back() {
        Runtime::new().expect("runtime").block_on(async {
            let root = scratch("update-release-now");
            let update = route_back(&root).await;
            let (releases, calls) = holding(&root, false);

            let version = install_now(&releases, &update, "0.5.1")
                .await
                .expect("failed to install");

            assert_eq!(version, "0.5.2");
            let calls = calls.lock().expect("calls").clone();
            assert_eq!(calls.len(), 1, "{calls:?}");
            assert!(calls[0].relaunch, "install now did not relaunch");
            assert_eq!(
                calls[0].recovery.as_ref().map(|r| r.0.clone()),
                Some(RecoveryStatus::Pending),
                "the route back was not written before the install"
            );

            let _ = std::fs::remove_dir_all(root);
        });
    }

    /// a failed install now says so and keeps the release, so it can be tried again.
    #[test]
    fn a_failed_install_now_keeps_the_release_to_try_again() {
        Runtime::new().expect("runtime").block_on(async {
            let root = scratch("update-release-now-fails");
            let update = route_back(&root).await;
            let (releases, _) = holding(&root, true);

            let error = install_now(&releases, &update, "0.5.1")
                .await
                .expect_err("a failed install was reported as done");

            assert!(matches!(error, Error::Io { .. }), "got {error:?}");
            assert!(releases.lock().await.downloaded.is_some());

            let _ = std::fs::remove_dir_all(root);
        });
    }

    /// install now with nothing downloaded is refused, and writes no route back.
    #[test]
    fn installing_now_with_nothing_downloaded_is_refused() {
        Runtime::new().expect("runtime").block_on(async {
            let root = scratch("update-release-now-nothing");
            let update = route_back(&root).await;
            let releases = Mutex::new(Releases::default());

            let error = install_now(&releases, &update, "0.5.1")
                .await
                .expect_err("nothing was downloaded");

            assert!(
                matches!(error, Error::PreconditionFailed { .. }),
                "got {error:?}"
            );
            assert!(!update.read().await.recovery().has_data());

            let _ = std::fs::remove_dir_all(root);
        });
    }

    /// **No release published is no release, not a failure** (effort 857, requirement 11): the
    /// release address answering that it has no manifest.
    #[test]
    fn a_missing_manifest_reads_as_no_release() {
        Runtime::new().expect("runtime").block_on(async {
            let server = ScriptedServer::start(vec![ScriptedResponse::new(404, "Not Found")]).await;

            let checked = super::outcome::<()>(
                Err(tauri_plugin_updater::Error::ReleaseNotFound),
                &[server.url("/latest.json")],
            )
            .await;

            assert_eq!(checked, Ok(None));
            assert_eq!(server.request_count(), 1);
        });
    }

    /// a manifest naming no newer version is no release, and one naming a newer one is found;
    /// neither asks the release address again.
    #[test]
    fn no_newer_version_reads_as_no_release() {
        Runtime::new().expect("runtime").block_on(async {
            let server = ScriptedServer::start(Vec::new()).await;
            let address = [server.url("/latest.json")];

            assert_eq!(super::outcome::<()>(Ok(None), &address).await, Ok(None));
            assert_eq!(super::outcome(Ok(Some(())), &address).await, Ok(Some(())));
            assert_eq!(server.request_count(), 0);
        });
    }

    /// **A release address that answers with an error is a failure, never no release** (ticket 29
    /// of effort 857). The plugin reads any status but a success as no manifest, and keeps the
    /// status to its log, so a server down would tell a person held by a floor that they are up to
    /// date while a newer release is out.
    #[test]
    fn a_release_address_answering_with_an_error_reads_as_a_failure() {
        Runtime::new().expect("runtime").block_on(async {
            let server =
                ScriptedServer::start(vec![ScriptedResponse::new(503, "Service Unavailable")])
                    .await;

            let checked = super::outcome::<()>(
                Err(tauri_plugin_updater::Error::ReleaseNotFound),
                &[server.url("/latest.json")],
            )
            .await;

            assert!(
                matches!(checked, Err(Error::Internal { .. })),
                "a server error read as {checked:?}"
            );
        });
    }

    /// **Offline reads as the network, apart from every other failure** (effort 857,
    /// requirement 11): a release address that cannot be reached is a reason to try later.
    #[test]
    fn an_unreachable_release_address_reads_as_offline() {
        Runtime::new().expect("runtime").block_on(async {
            // a port nothing listens on: the connection is refused on this machine, and nothing
            // leaves it.
            let port = std::net::TcpListener::bind("127.0.0.1:0")
                .and_then(|listener| listener.local_addr())
                .expect("a free port")
                .port();
            let refused = crate::http::build_client(std::time::Duration::from_secs(5))
                .expect("a client")
                .get(format!("http://127.0.0.1:{port}/latest.json"))
                .send()
                .await
                .expect_err("nothing listens there");

            let error = failure(tauri_plugin_updater::Error::Reqwest(refused));

            assert!(matches!(error, Error::Network { .. }), "got {error:?}");
        });
    }

    /// a download the server would not serve reads as the network too.
    #[test]
    fn a_download_the_server_would_not_serve_reads_as_offline() {
        let error = failure(tauri_plugin_updater::Error::Network(
            "Download request failed with status: 503".to_string(),
        ));

        assert!(matches!(error, Error::Network { .. }), "got {error:?}");
    }

    /// a release that fails its signature is a failure of integrity, never offline.
    #[test]
    fn a_release_that_fails_its_signature_reads_as_a_failure() {
        let error = failure(tauri_plugin_updater::Error::SignatureUtf8(
            "not base64".to_string(),
        ));

        assert!(matches!(error, Error::Integrity { .. }), "got {error:?}");

        let error = failure(tauri_plugin_updater::Error::TargetsNotFound(vec![
            "windows-x86_64".to_string(),
        ]));

        assert!(matches!(error, Error::Internal { .. }), "got {error:?}");
    }
}
