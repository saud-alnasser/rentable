//! signing in with Google, and connecting a workspace to a folder under that
//! identity.
//!
//! **Two acts, not one.** They ran as a single call until 2026-08-18: signing in
//! happened *inside* linking, so a person could not have an account without also
//! having a folder, and identity could not be reached at all except through the
//! one surface Drive owns. Here they are separate, and the ordering between them
//! is a precondition rather than a sequence — [`link_google_drive_workspace`]
//! consumes an identity, and only signs one in where there is none to consume.
//!
//! Each flow still runs to completion in one call. Authorization happens in a
//! browser this application does not control, so the call is outstanding for as
//! long as the user takes — which is why it reports how far it has got as it
//! goes, and why abandoning it is a second call rather than a returned value.
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

use super::control;
use super::google::files::DriveFiles;
use super::inspection::{
    GoogleDriveLinkPreparation, inspect_google_drive_workspace, linked_google_drive_account_id,
};
use super::lock::{GoogleDriveSyncLockAcquireInput, GoogleDriveSyncLockReleaseInput};
use super::session::{
    GoogleDriveAccountAuthInput, GoogleDriveDisconnectInput, GoogleDriveLinkInput,
    GoogleSignInCompleteInput, GoogleSignInSessionLookupInput, GoogleSignInSessionResult,
    GoogleSignInSessionStatus, GoogleSignOutInput,
};
use super::store::RemoteSyncState;
use super::workspace::sync_backup_manifest_to_active_workspace;

/// the event a sign-in reports its progress on. One call cannot return twice,
/// and the interface has something different to say before and after the user
/// has answered the consent screen.
///
/// It belongs to signing in rather than to linking, and that is observable: a
/// link that reuses an identity emits nothing at all, because nothing about it
/// is outstanding in a browser.
pub const GOOGLE_SIGN_IN_PHASE_EVENT: &str = "rentable:google-sign-in-phase";

/// how far a sign-in has got.
#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum GoogleSignInPhase {
    /// the authorization page is open and the user has not answered it yet.
    Authorizing,
    /// the user has answered, and the account is being read and recorded.
    Finalizing,
}

/// an identity a flow may act under, and a token that proves it.
struct GoogleIdentity {
    account_id: String,
    access_token: String,
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

/// sign in with Google, and nothing else.
///
/// No folder is chosen and no workspace is touched — the provider is left
/// exactly as it was. That is the point rather than an omission: an identity is
/// something this application can hold on its own, which requirement 3 needs it
/// to be, because a hosted workspace has an owner and a local one has none.
///
/// Fails with [`Error::Cancelled`] where the user declined the consent screen or
/// abandoned the attempt. Nothing went wrong in that case and nothing is worth
/// showing.
pub async fn sign_in_with_google(
    app: &AppHandle,
    app_state: &AppState,
) -> Result<RemoteSyncState, Error> {
    let session_id = authorize_with_google(app, app_state).await?;

    let identity = match finish_sign_in(app_state, &session_id, false).await {
        Ok(identity) => identity,
        Err(error) => {
            abandon_session(app_state, &session_id).await;

            diagnostics::error("sync.signIn.failed")
                .with("error", error.to_string())
                .write();

            return Err(error);
        }
    };

    {
        let mut remote_sync = app_state.remote_sync.write().await;

        // the sign-in stood on its own, so nothing may take it back on the strength
        // of having started it — `forget_google_sign_in_session` is where that is
        // argued.
        remote_sync.forget_google_sign_in_session(lookup(&session_id))?;
    }

    diagnostics::info("sync.signIn.completed")
        .with("account", identity.account_id.as_str())
        .write();

    // and the second half of what signing in is worth (#550): a session, so that *signed in
    // three days ago* is a lifetime this machine was issued rather than a flag it sets about
    // itself. Best effort — `establish_session` argues why a failure here is not a failed
    // sign-in.
    control::establish_session(app_state, &identity.account_id, &identity.access_token).await;

    let mut remote_sync = app_state.remote_sync.write().await;
    remote_sync.get_state().await
}

/// give up the identity this machine holds, keeping whatever is linked under it.
///
/// A workspace still on Drive is left linked and unable to sync, saying so in
/// terms the settings surface already renders — `sign_out_of_google` on the
/// store is where that choice is argued. Signing out of a machine that holds no
/// identity is a refusal rather than a silent success: nothing happened, and
/// reporting that something did is worse than saying so.
pub async fn sign_out_of_google(app_state: &AppState) -> Result<RemoteSyncState, Error> {
    let account_id = {
        let remote_sync = app_state.remote_sync.read().await;
        remote_sync
            .signed_in_google_account()?
            .map(|account| account.id)
    };

    let Some(account_id) = account_id else {
        return Err(Error::PreconditionFailed {
            message: "this machine is not signed in to google".to_string(),
        });
    };

    let state = {
        let mut remote_sync = app_state.remote_sync.write().await;
        remote_sync
            .sign_out_of_google(GoogleSignOutInput {
                account_id: account_id.clone(),
            })
            .await?
    };

    diagnostics::info("sync.signOut.completed")
        .with("account", account_id.as_str())
        .with("workspace", state.workspace.id.as_str())
        .write();

    Ok(state)
}

/// link this workspace to a Google account, from whatever identity is available
/// through to the question the remote's contents raise.
///
/// The returned preparation is the whole outcome: the workspace is linked either
/// way, and `requires_resolution` says whether anything may transfer yet.
///
/// **Signing in happens here only where it has to.** An identity this machine
/// already holds is used as it stands, so the consent screen does not open and
/// no phase is emitted — which is what makes *linking does not re-authorize*
/// something a caller observes rather than something this comment claims.
///
/// Fails with [`Error::Cancelled`] where the user abandoned the attempt — from
/// this application through [`cancel_google_drive_link`], or by declining the
/// consent screen. Nothing went wrong in that case and nothing is worth showing.
pub async fn link_google_drive_workspace(
    app: &AppHandle,
    app_state: &AppState,
) -> Result<GoogleDriveLinkPreparation, Error> {
    let (identity, session_id) = match reusable_google_identity(app_state).await? {
        Some(identity) => (identity, None),
        None => {
            let session_id = authorize_with_google(app, app_state).await?;

            match finish_sign_in(app_state, &session_id, true).await {
                Ok(identity) => (identity, Some(session_id)),
                Err(error) => {
                    abandon_session(app_state, &session_id).await;

                    diagnostics::error("sync.link.failed")
                        .with("error", error.to_string())
                        .write();

                    return Err(error);
                }
            }
        }
    };

    match link_workspace_to_identity(app_state, &identity).await {
        Ok(preparation) => {
            diagnostics::info("sync.link.completed")
                .with("workspace", preparation.state.workspace.id.as_str())
                .with("account", identity.account_id.as_str())
                .with("signedIn", session_id.is_some().to_string())
                .write();

            Ok(preparation)
        }
        Err(error) => {
            // only a sign-in this attempt ran is undone with it. An identity
            // that was already here was not this attempt's to establish, and so
            // is not its to take back.
            if let Some(session_id) = session_id {
                abandon_session(app_state, &session_id).await;
            }

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
///
/// **What it does to the identity is the part the split changed.** Cancelling
/// undoes the attempt, and an attempt that had to sign in on the way past signed
/// somebody in — so that account goes, exactly as it did when the two acts were
/// one, and backing out still leaves no credential behind that nobody asked for.
/// An identity the attempt merely *used* is left alone: it was established by
/// some other act, and a link is not entitled to take back something it did not
/// do.
pub async fn cancel_google_drive_link(app_state: &AppState) -> Result<RemoteSyncState, Error> {
    let (established_account_ids, state) = {
        let mut remote_sync = app_state.remote_sync.write().await;
        let established_account_ids = remote_sync.cancel_google_sign_ins()?;

        (established_account_ids, remote_sync.get_state().await?)
    };

    if established_account_ids.is_empty() && linked_google_drive_account_id(&state).is_none() {
        // nothing was outstanding and nothing was recorded, so there is nothing
        // to undo — and a manifest written for a workspace that did not move is
        // work done to report a cancellation that cancelled nothing.
        return Ok(state);
    }

    let mut state = match linked_google_drive_account_id(&state) {
        Some(_) => {
            let mut remote_sync = app_state.remote_sync.write().await;
            remote_sync.unlink_workspace_from_google_drive().await?
        }
        None => state,
    };

    for account_id in established_account_ids {
        let mut remote_sync = app_state.remote_sync.write().await;
        state = remote_sync
            .disconnect_google_drive_account(GoogleDriveDisconnectInput { account_id })
            .await?;
    }

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
            remote_sync.get_google_sign_in_result(lookup(session_id))?
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
fn read_authorization(result: &GoogleSignInSessionResult) -> Authorization {
    match result.status {
        GoogleSignInSessionStatus::Pending => Authorization::Waiting,
        GoogleSignInSessionStatus::Completed => Authorization::Granted,
        GoogleSignInSessionStatus::Cancelled => Authorization::Refused(link_cancelled()),
        GoogleSignInSessionStatus::Error => {
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

/// the identity this machine already holds, where it holds one that still works.
///
/// `None` means signing in is unavoidable, and it means that for two reasons
/// deliberately collapsed into one: nobody is signed in, or the stored grant is
/// dead. The caller does the same thing either way — it opens the consent screen
/// — and a caller that had to tell them apart would be deciding something it has
/// no better information about than this does.
///
/// **A refusal that is not the grant's death is not collapsed with them**, and
/// that distinction is load-bearing: a refresh that failed because the network
/// is down would otherwise open a consent screen in front of somebody whose
/// credentials are fine, and against a Google that cannot be reached either.
async fn reusable_google_identity(app_state: &AppState) -> Result<Option<GoogleIdentity>, Error> {
    let Some(account) = ({
        let remote_sync = app_state.remote_sync.read().await;
        remote_sync.signed_in_google_account()?
    }) else {
        return Ok(None);
    };

    let input = GoogleDriveAccountAuthInput {
        account_id: account.id.clone(),
    };

    let fresh = {
        let remote_sync = app_state.remote_sync.read().await;
        remote_sync.fresh_google_drive_access_token(&input)?
    };

    let access_token = match fresh {
        Some(access_token) => access_token,
        None => {
            let mut remote_sync = app_state.remote_sync.write().await;

            match remote_sync.refresh_google_drive_access_token(input).await {
                Ok(refreshed) => refreshed.access_token,
                Err(Error::PreconditionFailed { .. }) => return Ok(None),
                Err(error) => return Err(error),
            }
        }
    };

    Ok(Some(GoogleIdentity {
        account_id: account.id,
        access_token,
    }))
}

/// open the consent screen and wait for it to be answered.
///
/// Answers with the session the answer landed on. Everything the redemption
/// needs is held against that session inside this process, so the session id is
/// the whole of what a caller carries.
async fn authorize_with_google(app: &AppHandle, app_state: &AppState) -> Result<String, Error> {
    let session = {
        let mut remote_sync = app_state.remote_sync.write().await;
        remote_sync.begin_google_sign_in().inspect_err(|error| {
            diagnostics::error("sync.signIn.startFailed")
                .with("error", error.to_string())
                .write()
        })?
    };

    diagnostics::info("sync.signIn.started")
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

    emit_phase(app, GoogleSignInPhase::Authorizing);

    if let Err(error) = await_authorization(app_state, &session.session_id).await {
        abandon_session(app_state, &session.session_id).await;

        return Err(error);
    }

    emit_phase(app, GoogleSignInPhase::Finalizing);

    Ok(session.session_id)
}

/// redeem the authorization and record the person it belongs to.
///
/// Reads the profile through Drive's own `about` endpoint, which is what the
/// scopes this application already requests can answer with. **That is a
/// dependency on Drive that identity should not have**, and it is the one thing
/// this split leaves behind: it goes when the Drive transport does (#554), and
/// moving it earlier would mean a second endpoint and a second test server for a
/// read that is about to move anyway.
///
/// `establishes_identity_for_attempt` says whether abandoning the caller's
/// attempt takes this identity with it — see `complete_google_sign_in`.
async fn finish_sign_in(
    app_state: &AppState,
    session_id: &str,
    establishes_identity_for_attempt: bool,
) -> Result<GoogleIdentity, Error> {
    if was_abandoned(app_state, session_id).await {
        return Err(link_cancelled());
    }

    let access_token = {
        let mut remote_sync = app_state.remote_sync.write().await;
        remote_sync
            .exchange_google_sign_in_code(lookup(session_id))
            .await?
            .access_token
    };

    let files = DriveFiles::new()?;
    let details = files.read_account_details(&access_token).await?;
    let email = details.email.clone().unwrap_or_default();

    // the profile read is the last thing that takes time, and the user can
    // abandon the attempt across it. Asking again here is what turns that into a
    // cancellation rather than an account nobody asked for; a cancellation
    // landing after this point still cannot record one, because cancelling
    // drops the tokens the completion needs.
    if was_abandoned(app_state, session_id).await {
        return Err(link_cancelled());
    }

    let mut remote_sync = app_state.remote_sync.write().await;
    let signed_in = remote_sync
        .complete_google_sign_in(
            GoogleSignInCompleteInput {
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
                // an identity on its own has no folder recorded to read.
                app_usage_bytes: Some(0),
            },
            establishes_identity_for_attempt,
        )
        .await?;

    Ok(GoogleIdentity {
        account_id: signed_in.account_id,
        access_token,
    })
}

/// record the workspace against an identity, and read what its remote holds.
///
/// The identity is a precondition here rather than a step: nothing in this
/// function can sign anybody in, which is what stops linking from quietly
/// becoming the only way to have an account again.
async fn link_workspace_to_identity(
    app_state: &AppState,
    identity: &GoogleIdentity,
) -> Result<GoogleDriveLinkPreparation, Error> {
    let state = {
        let mut remote_sync = app_state.remote_sync.write().await;
        remote_sync
            .link_workspace_to_google_drive(GoogleDriveLinkInput {
                account_id: identity.account_id.clone(),
            })
            .await?
    };

    sync_backup_manifest_to_active_workspace(app_state, &state).await?;

    let files = DriveFiles::new()?;

    inspect_google_drive_workspace(app_state, &files, &identity.access_token).await
}

/// settle a session nobody is going to finish. Its own failure is never the one
/// worth reporting — something else already went wrong, or the user asked.
async fn abandon_session(app_state: &AppState, session_id: &str) {
    let mut remote_sync = app_state.remote_sync.write().await;
    let _ = remote_sync.cancel_google_sign_in(lookup(session_id));
}

/// whether the user has abandoned this attempt since it was last looked at.
///
/// A session that can no longer be read is treated as abandoned: there is
/// nothing left to finish it against either way.
async fn was_abandoned(app_state: &AppState, session_id: &str) -> bool {
    let remote_sync = app_state.remote_sync.read().await;

    remote_sync
        .get_google_sign_in_result(lookup(session_id))
        .map(|result| result.status == GoogleSignInSessionStatus::Cancelled)
        .unwrap_or(true)
}

fn lookup(session_id: &str) -> GoogleSignInSessionLookupInput {
    GoogleSignInSessionLookupInput {
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
fn emit_phase(app: &AppHandle, phase: GoogleSignInPhase) {
    let _ = app.emit(GOOGLE_SIGN_IN_PHASE_EVENT, phase);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn settled(status: GoogleSignInSessionStatus, error: Option<&str>) -> Authorization {
        read_authorization(&GoogleSignInSessionResult {
            session_id: "session-1".to_string(),
            status,
            error: error.map(str::to_string),
        })
    }

    #[test]
    fn a_consent_screen_still_open_is_waited_on() {
        assert_eq!(
            settled(GoogleSignInSessionStatus::Pending, None),
            Authorization::Waiting
        );
    }

    #[test]
    fn a_consent_screen_answered_yes_is_granted() {
        assert_eq!(
            settled(GoogleSignInSessionStatus::Completed, None),
            Authorization::Granted
        );
    }

    /// the two ways a user says no. Google reports a declined consent screen as
    /// a failure, and reporting it onward as one would put an error in front of
    /// somebody who already knows what they did.
    #[test]
    fn both_ways_of_saying_no_read_as_a_cancellation() {
        for outcome in [
            settled(GoogleSignInSessionStatus::Cancelled, None),
            settled(GoogleSignInSessionStatus::Error, Some(OAUTH_ACCESS_DENIED)),
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
            settled(GoogleSignInSessionStatus::Error, Some("invalid_scope"))
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
            settled(GoogleSignInSessionStatus::Error, None),
            Authorization::Refused(Error::PreconditionFailed { .. })
        ));
    }
}
