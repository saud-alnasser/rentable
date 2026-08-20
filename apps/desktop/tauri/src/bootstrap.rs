use crate::{
    diagnostics,
    error::Error,
    state::AppState,
    update::{Recovery, RecoveryStatus},
};

#[tauri::command]
pub async fn bootstrap(app_state: tauri::State<'_, AppState>) -> Result<Recovery, Error> {
    let version = app_state.settings.read().await.version.clone();

    diagnostics::info("startup.started")
        .with("version", version.as_str())
        .write();

    let mut update = app_state.update.write().await;

    // this machine is running the release it came from, so whatever the update did, it is over.
    // Either the user took the route back after a failure, or the install never happened.
    if update.recovery().status == RecoveryStatus::Pending
        && update.recovery().previous_version == version
        && update.recovery().target_version != version
    {
        let target_version = update.recovery().target_version.clone();
        let previous_version = update.recovery().previous_version.clone();

        match update.recovery().update_error.clone() {
            Some(error) => {
                diagnostics::warn("startup.recovery.wentBack")
                    .with("targetVersion", target_version)
                    .with("previousVersion", previous_version)
                    .with("error", error)
                    .write();
            }
            None => {
                diagnostics::info("startup.recovery.notInstalled")
                    .with("targetVersion", target_version)
                    .with("previousVersion", previous_version)
                    .write();
            }
        }

        update.resolve()?;
    }

    let error = open_database(&app_state).await;

    if let Some(error) = error.as_ref() {
        diagnostics::error("startup.database.unavailable")
            .with("error", error.to_string())
            .write();
    }

    let is_pending_target_recovery = update.recovery().status == RecoveryStatus::Pending
        && update.recovery().target_version == version
        && update.recovery().previous_version != version;

    if is_pending_target_recovery {
        match error.clone() {
            Some(err) => update.fail(Some(err.to_string()))?,
            None => update.resolve()?,
        }
    }

    if let Some(error) = error {
        if is_pending_target_recovery {
            return Ok(update.recovery().inner().clone());
        }

        return Err(error);
    }

    diagnostics::info("startup.completed")
        .with("version", version.as_str())
        .write();

    Ok(update.recovery().inner().clone())
}

/// Open this machine's database as whatever it should be right now.
///
/// **Called at startup and again the moment somebody signs in**, because those are the two points
/// at which the answer changes. A machine nobody has signed in on has no workspace to mint against,
/// so the first call opens a plain file; signing in is what gives it one, and without a second call
/// the replica would not arrive until the next launch. Acceptance criterion 4 is *signing in
/// reaches that user's workspace*, and *on the next launch* is not that.
///
/// **Whatever is held is let go of first, and that is the one-file rule rather than tidiness.**
/// `sqlx` and `turso` are in disjoint locking domains — `database/mod.rs` has the detail — so a
/// pool left open on the file the replica is about to take would be a second writer nothing
/// reports. Taking the engine out before building the next one is what makes the swap safe.
pub(crate) async fn open_database(app_state: &AppState) -> Option<Error> {
    // **Minted before the database lock is taken**, because it reaches the network, and holding the
    // one lock every query needs while waiting on a control plane would stall the application for
    // as long as the request takes.
    //
    // **A mint that failed falls back to the URL this machine already recorded, and that is the
    // offline case rather than a fallback for tidiness.** Opening the plain-file arm instead would
    // put `sqlx` on the file the replica owns — two engines over one file, which `database/mod.rs`
    // says nothing reports until the corruption does. `bootstrap_if_empty(false)` is what makes the
    // replica open anyway; the token function fails per request until a mint succeeds, and reads
    // and writes go on reaching the local file throughout, which is requirement 7.
    let minted = crate::sync::mint_workspace(app_state).await;

    let workspace = {
        let remote_sync = app_state.remote_sync.read().await;
        let workspace = remote_sync.workspace();

        workspace
            .remote_id
            .clone()
            .map(|id| (id, minted.or(workspace.remote_url)))
    };

    let mut db = app_state.db.write().await;

    // **Whatever is held is let go of first, and that is the one-file rule rather than tidiness.**
    // `sqlx` and `turso` are in disjoint locking domains, so a pool left open on a file the replica
    // is about to take would be a second writer nothing reports.
    db.disconnect().await;

    let Some((workspace_id, remote_url)) = workspace else {
        // **No workspace to open, and that is the ordinary state of a machine nobody has signed in
        // on.** The sign-in wall is what the web layer shows; the plain file behind this arm is
        // nobody's workspace, and it is what the seeded and test paths use.
        return db.connect().await.err();
    };

    let remote_sync = app_state.remote_sync.clone();

    if let Err(error) = db
        .connect_workspace(&workspace_id, remote_url, move || {
            let remote_sync = remote_sync.clone();

            // Resolved before every request rather than captured once, so a re-mint reaches the
            // next request without the replica being rebuilt.
            async move {
                remote_sync.read().await.workspace_token().ok_or_else(|| {
                    turso::Error::Error("this machine holds no workspace credential".to_string())
                })
            }
        })
        .await
    {
        return Some(error);
    }

    // **The schema arrives as replicated pages, so a replica that has never pulled has no tables**
    // — `turso_cdc` and its kin and nothing else. Everything the application does next reads
    // `contract`, `unit` and `payment`, so a first run that skipped this would sign in and then
    // fail on the next statement.
    //
    // **The pull is best-effort and the readiness check is what decides.** A replica that has
    // pulled before is usable whether or not this one succeeded, which is requirement 7; one that
    // never has is not usable at all, and requirement 3 already says a first run needs a network.
    // `is_ready` was written for this and had no caller until now.
    db.pull_replica().await;

    if !db.is_ready().await {
        return Some(Error::Network {
            message: "this workspace has not reached this machine yet. connect to the network and                       try again"
                .to_string(),
        });
    }

    None
}
