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
    // **What this machine is holding, reconciled against what is on disk.** The tracked list is how
    // a later launch knows a replica exists at all; an entry whose file somebody deleted by hand
    // would otherwise sit there forever, and a machine that could not say what it holds cannot be
    // asked to stop holding it.
    forget_replicas_no_longer_on_disk(app_state).await;

    // **The membership check is the mint**, which is the whole reason this is not a separate call:
    // the control plane consults membership on every mint, so a refusal naming it is the service
    // saying this machine should not be holding that replica any more. Every other outcome leaves
    // the replica where it is.
    let standing = crate::sync::mint_workspace(app_state).await;

    let workspace = {
        let remote_sync = app_state.remote_sync.read().await;
        let workspace = remote_sync.workspace();

        workspace
            .remote_id
            .clone()
            .map(|id| (id, workspace.remote_url))
    };

    if matches!(standing, crate::sync::WorkspaceStanding::MembershipEnded)
        && let Some((workspace_id, _)) = workspace.as_ref()
    {
        release_replica(app_state, workspace_id).await;

        // **The machine has to end up somewhere a person can act from**, and an empty database is
        // not it: `connect()` opens a file with no schema, the first reconcile throws, and every
        // later launch repeats the whole thing because nothing cleared the workspace it was refused
        // from. So the workspace and the session both go, which drops this machine to the sign-in
        // wall — and signing in gives it a workspace again.
        {
            let mut remote_sync = app_state.remote_sync.write().await;

            if let Err(error) = remote_sync.forget_remote_workspace() {
                diagnostics::error("startup.replica.notForgotten")
                    .with("error", error.to_string())
                    .write();
            }

            if let Err(error) = remote_sync.forget_control_plane_session() {
                diagnostics::error("sync.session.notForgotten")
                    .with("error", error.to_string())
                    .write();
            }
        }

        let mut db = app_state.db.write().await;

        db.disconnect().await;

        return db.connect().await.err();
    }

    let remote_url = match standing {
        crate::sync::WorkspaceStanding::Minted(url) => Some(url),
        // **Offline falls back to the url this machine already recorded**, rather than to the
        // plain-file arm. Opening `sqlx` on the file the replica owns is two engines over one file,
        // which `database/mod.rs` says nothing reports until the corruption does.
        _ => workspace.as_ref().and_then(|(_, url)| url.clone()),
    };

    let mut db = app_state.db.write().await;

    // **Whatever is held is let go of first, and that is the one-file rule rather than tidiness.**
    // `sqlx` and `turso` are in disjoint locking domains, so a pool left open on a file the replica
    // is about to take would be a second writer nothing reports.
    db.disconnect().await;

    let Some((workspace_id, _)) = workspace else {
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

    // Every *other* replica this machine holds, asked the same question. The current one was just
    // answered by the mint above.
    release_replicas_membership_ended(app_state, Some(&workspace_id)).await;

    // **Tracked from the moment it exists**, so that a later launch knows this machine is holding a
    // workspace for an account and whose it is. Nothing else records it: the workspace record says
    // which workspace is *current*, and a machine can hold replicas for accounts nobody is signed
    // in as.
    {
        let mut remote_sync = app_state.remote_sync.write().await;
        let account_id = remote_sync.session_window().map(|window| window.account_id);

        if let Some(account_id) = account_id
            && let Err(error) =
                remote_sync.remember_replica(&workspace_id, &account_id, crate::timestamp::now())
        {
            diagnostics::error("startup.replica.notTracked")
                .with("error", error.to_string())
                .write();
        }
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

/// Let go of a replica this machine may no longer hold.
///
/// **Membership is what kept it, and membership has ended.** Until then a replica is kept
/// indefinitely — not deleted on sign-out and not on a timer, because somebody who signs out is
/// usually about to sign back in and a re-pull of a whole workspace is a cost nobody asked for.
/// What this answers is the other case: the account this machine held it for is no longer a member
/// of that workspace, so the file is a copy of a ledger nobody here has a right to.
///
/// *Directed by the human 2026-08-20.* Requirement 14's organization work is where membership
/// starts ending routinely; today it ends only where an operator ends it.
async fn release_replica(app_state: &AppState, workspace_id: &str) {
    let database_path = { app_state.settings.read().await.database_path.clone() };

    if crate::database::Database::remove_replica(&database_path, workspace_id) {
        diagnostics::info("startup.replica.released")
            .with("workspace", workspace_id)
            .write();
    }

    // **Forgotten whether or not a file was there.** A replica somebody deleted by hand is still
    // one this machine has stopped holding, and an entry nothing could clear would have every
    // launch looking for it forever.
    let mut remote_sync = app_state.remote_sync.write().await;

    if let Err(error) = remote_sync.forget_replica(workspace_id) {
        diagnostics::error("startup.replica.notForgotten")
            .with("error", error.to_string())
            .write();
    }
}

/// Ask, for every replica this machine holds, whether it is still allowed to hold it.
///
/// **This is the check over the tracked list**, and it is separate from the current workspace's
/// because that one is answered by the mint the startup path makes anyway. What this covers is the
/// rest: a machine that has held workspaces for more than one account, or one whose current
/// workspace is not the only replica on disk.
///
/// **A replica whose account cannot be authenticated as is left alone**, which is most of them
/// after a sign-out: the credentials went with it, so there is nobody to ask. Membership is what
/// keeps a replica, and a question that cannot be put is not an answer that membership ended.
async fn release_replicas_membership_ended(app_state: &AppState, current: Option<&str>) {
    let held = { app_state.remote_sync.read().await.local_replicas() };

    for replica in held {
        if current == Some(replica.workspace_id.as_str()) {
            continue;
        }

        if matches!(
            crate::sync::check_membership(app_state, &replica.workspace_id, &replica.account_id)
                .await,
            crate::sync::WorkspaceStanding::MembershipEnded
        ) {
            release_replica(app_state, &replica.workspace_id).await;
        }
    }
}

/// Drop tracked replicas whose files are gone.
///
/// **This deletes nothing.** It is the other direction: a file somebody removed by hand, or a
/// workspace released on an earlier launch that failed to write the store, leaves an entry naming
/// a replica this machine does not have. Membership is what removes a replica; this only stops the
/// list claiming ones that are not there.
async fn forget_replicas_no_longer_on_disk(app_state: &AppState) {
    let held = { app_state.remote_sync.read().await.local_replicas() };

    if held.is_empty() {
        return;
    }

    let database_path = { app_state.settings.read().await.database_path.clone() };

    let missing: Vec<String> = held
        .into_iter()
        .filter(|replica| {
            !crate::database::Database::replica_path(&database_path, &replica.workspace_id).exists()
        })
        .map(|replica| replica.workspace_id)
        .collect();

    if missing.is_empty() {
        return;
    }

    let mut remote_sync = app_state.remote_sync.write().await;

    for workspace_id in &missing {
        if let Err(error) = remote_sync.forget_replica(workspace_id) {
            diagnostics::error("startup.replica.notForgotten")
                .with("error", error.to_string())
                .write();
        }
    }
}
