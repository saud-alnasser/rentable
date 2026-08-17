//! connecting a workspace to a Google account, and disconnecting it.
//!
//! Each flow runs to completion in one call. Authorization happens in a browser
//! this application does not control, so the call is outstanding for as long as
//! the user takes — which is why it reports how far it has got as it goes, and
//! why abandoning it is a second call rather than a returned value.
//!
//! Nothing here decides anything about the remote's contents. What the folder
//! holds is [`super::inspection`]'s to read and say.

use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tauri_plugin_opener::OpenerExt;

use crate::{
    backup::{Backup, BackupSource},
    diagnostics,
    error::Error,
    state::AppState,
};

use super::google::files::DriveFiles;
use super::inspection::{
    GoogleDriveLinkPreparation, inspect_google_drive_workspace, linked_google_drive_account_id,
};
use super::lock::{GoogleDriveSyncLockAcquireInput, GoogleDriveSyncLockReleaseInput};
use super::session::{
    GoogleDriveDisconnectInput, GoogleDriveLinkCompleteInput, GoogleDriveLinkSessionLookupInput,
    GoogleDriveLinkSessionResult, GoogleDriveLinkSessionStatus,
};
use super::store::RemoteSyncState;
use super::workspace::sync_backup_manifest_to_active_workspace;

/// the event a link reports its progress on. One call cannot return twice, and
/// the interface has something different to say before and after the user has
/// answered the consent screen.
pub const GOOGLE_DRIVE_LINK_PHASE_EVENT: &str = "rentable:google-drive-link-phase";

/// how far a link attempt has got.
#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum GoogleDriveLinkPhase {
    /// the authorization page is open and the user has not answered it yet.
    Authorizing,
    /// the user has answered, and the account is being read and recorded.
    Finalizing,
}

/// Google's own code for a consent screen the user declined. It arrives as a
/// failure and means the user said no, which is not the same thing.
const OAUTH_ACCESS_DENIED: &str = "access_denied";

/// how long an authorization may stay outstanding. Long enough for a user to
/// find the browser window, sign in, and read the consent screen.
const AUTHORIZATION_TIMEOUT: Duration = Duration::from_secs(5 * 60);

/// how often the callback's outcome is looked for. The callback lands on a
/// thread of its own, so this only bounds how quickly the flow notices.
const AUTHORIZATION_POLL_INTERVAL: Duration = Duration::from_millis(750);

/// link this workspace to a Google account, from the authorization request to
/// the question the remote's contents raise.
///
/// The returned preparation is the whole outcome: the workspace is linked either
/// way, and `requires_resolution` says whether anything may transfer yet.
///
/// Fails with [`Error::Cancelled`] where the user abandoned the attempt — from
/// this application through [`cancel_google_drive_link`], or by declining the
/// consent screen. Nothing went wrong in that case and nothing is worth showing.
pub async fn link_google_drive_workspace(
    app: &AppHandle,
    app_state: &AppState,
) -> Result<GoogleDriveLinkPreparation, Error> {
    let session = {
        let mut remote_sync = app_state.remote_sync.write().await;
        remote_sync.begin_google_drive_link().inspect_err(|error| {
            diagnostics::error("sync.link.startFailed")
                .with("error", error.to_string())
                .write()
        })?
    };

    diagnostics::info("sync.link.started")
        .with("session", session.session_id.as_str())
        .write();

    if let Err(error) = app
        .opener()
        .open_url(session.authorization_url.clone(), None::<&str>)
    {
        abandon_session(app_state, &session.session_id).await;

        return Err(Error::Internal {
            message: format!("could not open the google authorization page: {error}"),
        });
    }

    emit_phase(app, GoogleDriveLinkPhase::Authorizing);

    if let Err(error) = await_authorization(app_state, &session.session_id).await {
        abandon_session(app_state, &session.session_id).await;

        return Err(error);
    }

    emit_phase(app, GoogleDriveLinkPhase::Finalizing);

    match finish_link(app_state, &session.session_id).await {
        Ok(preparation) => {
            diagnostics::info("sync.link.completed")
                .with("workspace", preparation.state.workspace.id.as_str())
                .with(
                    "account",
                    preparation
                        .state
                        .workspace
                        .account_id
                        .clone()
                        .unwrap_or_default(),
                )
                .write();

            Ok(preparation)
        }
        Err(error) => {
            abandon_session(app_state, &session.session_id).await;

            diagnostics::error("sync.link.failed")
                .with("error", error.to_string())
                .write();

            Err(error)
        }
    }
}

/// abandon whatever link is outstanding, and undo one that has already been
/// recorded.
///
/// Both halves are needed because a link becomes cancellable twice: while the
/// consent screen is open, and again once the remote's contents have raised a
/// question the user answers by backing out. Linking creates nothing on the
/// remote, so there is never a folder left behind by either.
pub async fn cancel_google_drive_link(app_state: &AppState) -> Result<RemoteSyncState, Error> {
    let state = {
        let mut remote_sync = app_state.remote_sync.write().await;
        remote_sync.cancel_google_drive_links()?;
        remote_sync.get_state().await?
    };

    let Some(account_id) = linked_google_drive_account_id(&state) else {
        return Ok(state);
    };

    let state = {
        let mut remote_sync = app_state.remote_sync.write().await;
        remote_sync
            .disconnect_google_drive_account(GoogleDriveDisconnectInput { account_id })
            .await?
    };

    diagnostics::info("sync.link.cancelled")
        .with("workspace", state.workspace.id.as_str())
        .write();

    sync_backup_manifest_to_active_workspace(app_state, &state).await?;

    Ok(state)
}

/// disconnect this workspace from the account it is linked to, keeping one
/// current snapshot of it on this machine.
///
/// A workspace that stops syncing keeps its data and loses its history: the
/// automatic snapshots existed to be pushed, and there is nowhere left to push
/// them. The newest survives so the local copy is still recoverable.
pub async fn unlink_google_drive_workspace(app_state: &AppState) -> Result<RemoteSyncState, Error> {
    let state = {
        let mut remote_sync = app_state.remote_sync.write().await;
        remote_sync.get_state().await?
    };

    let Some(account_id) = linked_google_drive_account_id(&state) else {
        return Err(Error::PreconditionFailed {
            message: "workspace is not linked to a google drive account".to_string(),
        });
    };

    let lease = {
        let mut remote_sync = app_state.remote_sync.write().await;
        remote_sync.acquire_google_drive_sync_lock(GoogleDriveSyncLockAcquireInput {
            workspace_id: state.workspace.id.clone(),
        })?
    };

    let unlinked = unlink_under_lease(app_state, &account_id).await;

    {
        let mut remote_sync = app_state.remote_sync.write().await;
        remote_sync.release_google_drive_sync_lock(GoogleDriveSyncLockReleaseInput {
            lease_id: lease.lease_id,
        });
    }

    let state = unlinked?;

    diagnostics::info("sync.unlink.completed")
        .with("workspace", state.workspace.id.as_str())
        .write();

    sync_backup_manifest_to_active_workspace(app_state, &state).await?;

    Ok(state)
}

async fn unlink_under_lease(
    app_state: &AppState,
    account_id: &str,
) -> Result<RemoteSyncState, Error> {
    let workspace = {
        let mut remote_sync = app_state.remote_sync.write().await;
        remote_sync.get_state().await?.workspace
    };

    let entry = {
        let mut backup = app_state.backup.write().await;
        backup.sync_manifest_workspace(Some(&workspace))?;
        backup
            .create_managed(BackupSource::Autosave, None, false)
            .await?
    };

    {
        let mut remote_sync = app_state.remote_sync.write().await;
        remote_sync.record_snapshot_for_workspace(&entry)?;
    }

    {
        let mut backup = app_state.backup.write().await;
        drop_superseded_autosaves(&mut backup, &entry.filename).await;
    }

    let mut remote_sync = app_state.remote_sync.write().await;
    remote_sync
        .disconnect_google_drive_account(GoogleDriveDisconnectInput {
            account_id: account_id.to_string(),
        })
        .await
}

/// drop every automatic snapshot but `survivor`.
///
/// A snapshot that cannot be deleted is left where it is: the unlink itself has
/// already succeeded by this point, and failing it over a file that is merely
/// still on disk would report a disconnection that did happen as one that did
/// not.
async fn drop_superseded_autosaves(backup: &mut Backup, survivor: &str) {
    let Ok(entries) = backup.list().await else {
        return;
    };

    let obsolete = entries
        .into_iter()
        .filter(|entry| entry.source == BackupSource::Autosave && entry.filename != survivor)
        .collect::<Vec<_>>();

    for entry in obsolete {
        let _ = backup.delete(&entry.filename).await;
    }
}

/// what a link session's state means to the flow waiting on it.
#[derive(Debug, PartialEq, Eq)]
enum Authorization {
    /// the consent screen has not been answered yet.
    Waiting,
    /// it was answered, and there is a code to redeem.
    Granted,
    /// it will not be answered, and nothing further is worth waiting for.
    Refused(Error),
}

/// wait for the consent screen to be answered, however it is answered.
async fn await_authorization(app_state: &AppState, session_id: &str) -> Result<(), Error> {
    let deadline = Instant::now() + AUTHORIZATION_TIMEOUT;

    loop {
        let result = {
            let remote_sync = app_state.remote_sync.read().await;
            remote_sync.get_google_drive_link_result(lookup(session_id))?
        };

        match read_authorization(&result) {
            Authorization::Granted => return Ok(()),
            Authorization::Refused(error) => return Err(error),
            Authorization::Waiting => {}
        }

        if Instant::now() >= deadline {
            return Err(Error::TimedOut {
                message: "google drive authorization was not completed in time".to_string(),
            });
        }

        tokio::time::sleep(AUTHORIZATION_POLL_INTERVAL).await;
    }
}

/// read a settled session as an answer. Separate from the waiting because
/// deciding what an answer means is the part worth exercising, and polling is
/// not.
fn read_authorization(result: &GoogleDriveLinkSessionResult) -> Authorization {
    match result.status {
        GoogleDriveLinkSessionStatus::Pending => Authorization::Waiting,
        GoogleDriveLinkSessionStatus::Completed => Authorization::Granted,
        GoogleDriveLinkSessionStatus::Cancelled => Authorization::Refused(link_cancelled()),
        GoogleDriveLinkSessionStatus::Error => {
            Authorization::Refused(match result.error.as_deref() {
                // the user answered the consent screen, and the answer was no.
                // Reporting that as a failure would put an error in front of
                // somebody who already knows what they did.
                Some(OAUTH_ACCESS_DENIED) => link_cancelled(),
                Some(error) => Error::PreconditionFailed {
                    message: format!("google drive authorization failed: {error}"),
                },
                None => Error::PreconditionFailed {
                    message: "google drive authorization did not complete".to_string(),
                },
            })
        }
    }
}

/// redeem the authorization, record the account it belongs to, and read what its
/// remote already holds.
async fn finish_link(
    app_state: &AppState,
    session_id: &str,
) -> Result<GoogleDriveLinkPreparation, Error> {
    if was_abandoned(app_state, session_id).await {
        return Err(link_cancelled());
    }

    let access_token = {
        let mut remote_sync = app_state.remote_sync.write().await;
        remote_sync
            .exchange_google_drive_link_code(lookup(session_id))
            .await?
            .access_token
    };

    let files = DriveFiles::new()?;
    let details = files.read_account_details(&access_token).await?;
    let email = details.email.clone().unwrap_or_default();

    // the account read is the last thing that takes time, and the user can
    // abandon the link across it. Asking again here is what turns that into a
    // cancellation rather than a workspace linked to an account nobody asked
    // for; a cancellation landing after this point still cannot record one,
    // because cancelling drops the tokens the completion needs.
    if was_abandoned(app_state, session_id).await {
        return Err(link_cancelled());
    }

    let state = {
        let mut remote_sync = app_state.remote_sync.write().await;
        remote_sync
            .complete_google_drive_link(GoogleDriveLinkCompleteInput {
                session_id: session_id.to_string(),
                display_name: details
                    .display_name
                    .clone()
                    .unwrap_or_else(|| email.clone()),
                email,
                avatar_url: details.avatar_url.clone(),
                provider_user_id: details.provider_user_id.clone(),
                drive_quota_bytes: details.drive_quota_bytes,
                drive_usage_bytes: details.drive_usage_bytes,
                // what the folder holds is not known until it has been read, and
                // a workspace being linked has no folder recorded to read.
                app_usage_bytes: Some(0),
            })
            .await?
    };

    sync_backup_manifest_to_active_workspace(app_state, &state).await?;

    inspect_google_drive_workspace(app_state, &files, &access_token).await
}

/// settle a session nobody is going to finish. Its own failure is never the one
/// worth reporting — something else already went wrong, or the user asked.
async fn abandon_session(app_state: &AppState, session_id: &str) {
    let mut remote_sync = app_state.remote_sync.write().await;
    let _ = remote_sync.cancel_google_drive_link(lookup(session_id));
}

/// whether the user has abandoned this attempt since it was last looked at.
///
/// A session that can no longer be read is treated as abandoned: there is
/// nothing left to finish it against either way.
async fn was_abandoned(app_state: &AppState, session_id: &str) -> bool {
    let remote_sync = app_state.remote_sync.read().await;

    remote_sync
        .get_google_drive_link_result(lookup(session_id))
        .map(|result| result.status == GoogleDriveLinkSessionStatus::Cancelled)
        .unwrap_or(true)
}

fn lookup(session_id: &str) -> GoogleDriveLinkSessionLookupInput {
    GoogleDriveLinkSessionLookupInput {
        session_id: session_id.to_string(),
    }
}

fn link_cancelled() -> Error {
    Error::Cancelled {
        message: "google drive linking was cancelled".to_string(),
    }
}

/// tell the interface how far the link has got. A phase that does not arrive
/// costs a label, so it is never worth failing the link over.
fn emit_phase(app: &AppHandle, phase: GoogleDriveLinkPhase) {
    let _ = app.emit(GOOGLE_DRIVE_LINK_PHASE_EVENT, phase);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn settled(status: GoogleDriveLinkSessionStatus, error: Option<&str>) -> Authorization {
        read_authorization(&GoogleDriveLinkSessionResult {
            session_id: "session-1".to_string(),
            status,
            error: error.map(str::to_string),
        })
    }

    #[test]
    fn a_consent_screen_still_open_is_waited_on() {
        assert_eq!(
            settled(GoogleDriveLinkSessionStatus::Pending, None),
            Authorization::Waiting
        );
    }

    #[test]
    fn a_consent_screen_answered_yes_is_granted() {
        assert_eq!(
            settled(GoogleDriveLinkSessionStatus::Completed, None),
            Authorization::Granted
        );
    }

    /// the two ways a user says no. Google reports a declined consent screen as
    /// a failure, and reporting it onward as one would put an error in front of
    /// somebody who already knows what they did.
    #[test]
    fn both_ways_of_saying_no_read_as_a_cancellation() {
        for outcome in [
            settled(GoogleDriveLinkSessionStatus::Cancelled, None),
            settled(
                GoogleDriveLinkSessionStatus::Error,
                Some(OAUTH_ACCESS_DENIED),
            ),
        ] {
            assert!(
                matches!(outcome, Authorization::Refused(Error::Cancelled { .. })),
                "a refusal by the user was not read as a cancellation: {outcome:?}"
            );
        }
    }

    #[test]
    fn a_provider_failure_keeps_its_own_wording() {
        let Authorization::Refused(error) =
            settled(GoogleDriveLinkSessionStatus::Error, Some("invalid_scope"))
        else {
            panic!("a failed authorization was not refused");
        };

        assert!(matches!(error, Error::PreconditionFailed { .. }));
        assert!(
            error.to_string().contains("invalid_scope"),
            "the provider's own reason was dropped: {error}"
        );
    }

    #[test]
    fn a_failure_with_no_reason_is_still_a_refusal() {
        assert!(matches!(
            settled(GoogleDriveLinkSessionStatus::Error, None),
            Authorization::Refused(Error::PreconditionFailed { .. })
        ));
    }
}
