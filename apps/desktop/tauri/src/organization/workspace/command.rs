//! the commands on a workspace: created, granted, withdrawn, deleted, opened (and brought up to
//! this build's schema under the lease), renamed, its credentials renewed, and reached on Turso
//! without being opened.

use serde::Serialize;
use tauri::Emitter;

use crate::{
    clock,
    credential::Credentials,
    database::floor::Standing,
    error::{Error, RefusalReason},
    machine::RemoteSyncState,
    organization::Shared,
};

use crate::organization::{
    act::{Acting, Pull, as_member, if_member, owner_platform, signed_in_owner_platform},
    lease::{self, MigrationPhase, PipelineLease},
    session::{MemberSession, WorkspaceFacts},
    workspace::{
        self,
        remote::{self, Collect, Pipeline, Reach},
    },
};
use crate::{
    database::proxy::{SQLQuery, SQLRow},
    turso::platform::AccessLevel,
};

/// Create a workspace on the account, migrated and granted to the owner. Owner only, at the
/// command: anybody else is told to ask the owner, before any request.
#[tauri::command(rename = "workspace_create")]
pub(crate) async fn organization_workspace_create(
    app_state: tauri::State<'_, Shared>,
    credentials: tauri::State<'_, Credentials>,
    clock: tauri::State<'_, clock::Shared>,
    name: String,
) -> Result<WorkspaceFacts, Error> {
    let platform = signed_in_owner_platform(&app_state, &credentials)
        .await
        .ok_or_else(|| {
            Error::refused(
                RefusalReason::OwnerMachineOnly,
                "only an owner can create a workspace, from the machine that connected the turso \
                  account. ask the owner",
            )
        })?;
    as_member(&app_state, Pull::No, async |Acting { member, store }| {
        workspace::create_workspace(store, member, &platform, Pipeline::of, &name, clock.now())
            .await
    })
    .await
}

/// Grant a workspace to a member. Full access re-seals the caller's own credential; read-only is
/// minted, which only the owner's machine can do.
#[tauri::command(rename = "workspace_grant")]
pub(crate) async fn organization_workspace_grant(
    app_state: tauri::State<'_, Shared>,
    credentials: tauri::State<'_, Credentials>,
    workspace_id: String,
    member_id: String,
    access: AccessLevel,
) -> Result<(), Error> {
    let platform = signed_in_owner_platform(&app_state, &credentials).await;
    as_member(&app_state, Pull::No, async |Acting { member, store }| {
        workspace::grant_workspace(
            store,
            member,
            platform.as_ref(),
            &workspace_id,
            &member_id,
            access,
        )
        .await
    })
    .await
}

/// Take a workspace back from a member: the grant row goes, and nothing is minted or rotated, so
/// the credential they already hold works until it expires as an ordinary removal's does. The act
/// is the one that gives; the owner's own grant is refused.
#[tauri::command(rename = "workspace_grant_withdraw")]
pub async fn organization_workspace_grant_withdraw(
    app_state: tauri::State<'_, Shared>,
    workspace_id: String,
    member_id: String,
) -> Result<(), Error> {
    as_member(&app_state, Pull::No, async |Acting { member, store }| {
        workspace::withdraw_grant(store, member, &workspace_id, &member_id).await
    })
    .await
}

/// Delete a workspace: the one moment requirement 4 permits deleting a database, through the one
/// intent the port takes for it. Owner only.
#[tauri::command(rename = "workspace_delete")]
pub(crate) async fn organization_workspace_delete(
    app_state: tauri::State<'_, Shared>,
    credentials: tauri::State<'_, Credentials>,
    workspace_id: String,
) -> Result<(), Error> {
    let platform = signed_in_owner_platform(&app_state, &credentials)
        .await
        .ok_or_else(|| {
            Error::refused(
                RefusalReason::OwnerMachineOnly,
                "only an owner can delete a workspace, from the machine that connected the turso \
                  account. ask the owner",
            )
        })?;
    as_member(&app_state, Pull::No, async |Acting { member, store }| {
        workspace::delete_workspace(store, member, &platform, &workspace_id).await
    })
    .await
}

/// The event the shell listens to while a workspace is being upgraded: which workspace, and where
/// the upgrade is, so a member watching sees it running rather than the application stuck.
pub const MIGRATION_EVENT: &str = "organization:migration";

/// What the event carries.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct MigrationNotice {
    workspace_id: String,
    #[serde(flatten)]
    phase: MigrationPhase,
}

/// Open a workspace this member holds a grant on: record it as this machine's current workspace,
/// hold the credential the vault unsealed for the replica, and open the replica.
///
/// **The credential never leaves Rust.** What comes back is the workspace as a fact; the token is
/// in the sync state's own hands and the replica asks it per request.
#[tauri::command(rename = "workspace_open")]
pub(crate) async fn organization_workspace_open(
    app: tauri::AppHandle,
    app_state: tauri::State<'_, Shared>,
    credentials: tauri::State<'_, Credentials>,
    clock: tauri::State<'_, clock::Shared>,
    workspace_id: String,
) -> Result<WorkspaceFacts, Error> {
    // one bring-up at a time on this machine (effort 857, ticket 40): opening waits for one the
    // background is running, which may be of this very workspace. Taken before the session and
    // the replica, as the background takes it, so neither waits on the other while holding them.
    let one_at_a_time = app_state.bringing_up.lock().await;
    // the pull is its own, after the settled check rather than before it: a member whose role
    // is unsettled is refused before anything is asked of the remote.
    let (facts, credential) = as_member(&app_state, Pull::No, async |Acting { member, store }| {
        member.settled()?;

        // requirement 24: the guard below turns on `schema_version`, and a version another machine
        // raised reaches this one as a replicated row rather than a push. Pull the organization
        // replica first, so the guard reads what the account holds now and not what this machine
        // last saw: without it an older build reads a stale row, passes the guard, and then the
        // workspace replica pulls the migrated pages it cannot understand. The lease serialises the
        // writers; this is what keeps a reader from opening across one.
        store.pull().await;

        let workspaces = store.workspaces(&member.verifying_key).await?;
        // what is pinned for the member there is a fact the answer draws, read off every member
        // row; a directory refusing that read refuses the members list by name, and is not a
        // reason to refuse opening a workspace the member holds a grant on, which it never was.
        // Nothing reads the answer's `permissions`: a record procedure is answered by the
        // session's, which `api/context.ts` reads for the workspace open.
        let workspace_overrides = store
            .workspace_overrides(&member.verifying_key)
            .await
            .unwrap_or_default();
        let (mut facts, credential) =
            workspace::openable(member, &workspaces, &workspace_overrides, &workspace_id)?
                .ok_or_else(|| {
                    Error::refused(
                        RefusalReason::NoGrant,
                        "you hold no grant on that workspace",
                    )
                })?;

        // a workspace this build was not written against is refused here, before the replica is
        // named, and nothing of it is read; one it may read and not write is let through, and
        // nothing is written to it (effort 857, ticket 04).
        let standing = lease::refuse_newer(store, &facts).await?;

        // requirement 20: a workspace behind what this build ships is brought up to it, under a
        // lease taken at the organization database's primary, by whichever member opened it:
        // every step shipped before 857 and every addition, and never an upgrade declared after
        // (effort 857, ticket 03), which waits for the explicit act.
        // The organization credential in the session's slot is what the lease is taken under,
        // and the member's own workspace credential is what the migrations go over. Only where
        // this build may write it.
        if standing == Standing::Writable && lease::is_pending(store, &facts).await? {
            let organization_credential = member
                .organization_credential
                .lock()
                .ok()
                .and_then(|slot| slot.clone())
                .ok_or_else(|| Error::refused(RefusalReason::NoOrganizationCredential, "this machine holds no credential to the organization database, so                               it cannot take the lease to upgrade the workspace"))?;
            let organization_host = {
                let mut remote_sync = app_state.remote_sync.write().await;

                remote_sync
                    .store_mut()
                    .held(&member.organization_id)
                    .map(|held| held.remote_url.trim_start_matches("libsql://").to_string())
                    .unwrap_or_default()
            };
            let lease =
                PipelineLease::new(Pipeline::of(&organization_host), &organization_credential);
            // the owner's account, where this machine holds its authority: the workspace is
            // copied there as well as here before the migration (effort 838, ticket 28). A
            // member's machine holds none and copies to this machine alone.
            let account =
                owner_platform(&app_state, &credentials, &member.organization_id).await;
            let notice = |phase: MigrationPhase| {
                let _ = app.emit(
                    MIGRATION_EVENT,
                    MigrationNotice {
                        workspace_id: workspace_id.clone(),
                        phase,
                    },
                );
            };

            facts.schema_version = lease::upgrade(
                lease::Pending {
                    store,
                    session: member,
                    facts: &facts,
                    held: &credential,
                    pipeline: &Pipeline::of(&facts.database_hostname),
                    account: account.as_ref(),
                },
                &lease,
                || tokio::time::sleep(lease::LEASE_POLL_INTERVAL),
                notice,
                || clock.now(),
            )
            .await?;
        }

        Ok((facts, credential))
    })
    .await?;

    drop(one_at_a_time);

    {
        let permissions = app_state
            .member
            .read()
            .await
            .as_ref()
            .map(|member| member.permissions)
            .unwrap_or_default();
        let mut remote_sync = app_state.remote_sync.write().await;

        remote_sync.open_organization_workspace(
            &facts.id,
            &facts.name,
            &format!("libsql://{}", facts.database_hostname),
            permissions,
            &credential.token,
        )?;
    }

    if let Some(error) = workspace::open_database(&app_state, clock.as_ref()).await {
        return Err(error);
    }

    Ok(facts)
}

/// Mint fresh credentials for every grant and re-seal them, on the owner's machine. Answers with
/// how many grants were renewed.
#[tauri::command(rename = "workspace_renew_credentials")]
pub(crate) async fn organization_workspace_renew_credentials(
    app_state: tauri::State<'_, Shared>,
    credentials: tauri::State<'_, Credentials>,
) -> Result<usize, Error> {
    let platform = signed_in_owner_platform(&app_state, &credentials)
        .await
        .ok_or_else(|| {
            Error::refused(
                RefusalReason::OwnerMachineOnly,
                "credentials are renewed on the owner's machine, which holds the turso authority",
            )
        })?;
    // the renewal seals to every member's public key as the row carries it, so the rows are read
    // after a pull rather than off this machine's last sight of them: a vault reset on another
    // machine since would otherwise have its grants sealed to the key it no longer holds, and
    // that member could open nothing at all.
    as_member(&app_state, Pull::First, async |Acting { member, store }| {
        let organization_database = format!("org-{}", member.organization_id);

        let renewed =
            workspace::renew_credentials(store, member, &platform, &organization_database).await?;

        hold_renewed_token(&app_state, member).await;

        Ok(renewed)
    })
    .await
}

/// Hand the sync engine the credential the session now holds for the open workspace, where a
/// renewal or a rotation moved it.
///
/// **The engine reads its token off `RemoteSync`, and a renewal writes the session.** Every other
/// member's engine learns of a moved credential through `reconnect`, which compares the rows
/// against the session; the acting owner's session already carries the new one, so nothing there
/// moves and the engine goes on under the token that was just rotated away. This is the one
/// place the owner's own engine is told.
pub(crate) async fn hold_renewed_token(app_state: &Shared, member: &MemberSession) {
    let mut remote_sync = app_state.remote_sync.write().await;
    let current = remote_sync.workspace();

    if let Some(remote_id) = current.remote_id.as_deref()
        && let Some(held) = member.workspace_credentials.get(remote_id)
        && remote_sync.workspace_token().as_deref() != Some(held.token.as_str())
    {
        remote_sync.hold_organization_workspace_token(&held.token);
    }
}

/// Renew credentials if any is close to lapsing, on the owner's machine, best effort. Answers
/// whether it renewed. This is what keeps an organization syncing past the four-week credential
/// lifetime: the owner's machine, which is the only one holding the platform authority, calls it
/// after sign-in, and it mints only when something is within the renewal window rather than on
/// every launch. A machine that is not the owner's, or holds no authority, or is not signed in,
/// answers `false` and does nothing, so the caller can fire it and forget it. It never blocks
/// sign-in, which works offline (requirement 18).
#[tauri::command(rename = "workspace_renew_due")]
pub(crate) async fn organization_workspace_renew_due(
    app_state: tauri::State<'_, Shared>,
    credentials: tauri::State<'_, Credentials>,
    clock: tauri::State<'_, clock::Shared>,
) -> Result<bool, Error> {
    let Some(platform) = signed_in_owner_platform(&app_state, &credentials).await else {
        return Ok(false);
    };
    // nobody signed in answers `false` rather than the wall, and the pull is its own, after the
    // settled check: an unsettled role answers `false` before anything is asked of the remote.
    if_member(&app_state, Pull::No, async |Acting { member, store }| {
        // an organization this build may not write is not renewed from it: the renewal mints at
        // Turso before it writes, and the write would be refused (effort 857, ticket 05). It waits
        // for this machine to update, or for a machine already updated to renew it.
        if member.settled().is_err() || !crate::organization::session::writes_to(store) {
            return Ok(false);
        }

        // after a pull, for the reason `organization_workspace_renew_credentials` gives.
        store.pull().await;

        let now = clock.now();
        if !workspace::credentials_due(store, member, workspace::CREDENTIAL_RENEWAL_WINDOW_MS, now)
            .await?
        {
            return Ok(false);
        }

        let organization_database = format!("org-{}", member.organization_id);
        workspace::renew_credentials(store, member, &platform, &organization_database).await?;
        hold_renewed_token(&app_state, member).await;

        Ok(true)
    })
    .await
    .unwrap_or(Ok(false))
}

/// Rename the workspace this machine has open, on the organization database, and on this
/// machine's own record of it so the rail reads the new name before the next pull. What
/// `organization_workspace_rename` calls; both live here because the name is the organization's.
pub(crate) async fn rename_current_workspace(app_state: &Shared, name: &str) -> Result<(), Error> {
    let workspace_id = {
        let remote_sync = app_state.remote_sync.read().await;

        remote_sync.workspace().remote_id.ok_or_else(|| {
            Error::refused(
                RefusalReason::NoWorkspaceOpen,
                "no workspace is open on this machine",
            )
        })?
    };

    as_member(app_state, Pull::No, async |Acting { member, store }| {
        workspace::rename_workspace(store, member, &workspace_id, name, store.clock().now()).await
    })
    .await?;

    let mut remote_sync = app_state.remote_sync.write().await;

    remote_sync.rename_held_workspace(name.trim())
}

/// Rename the current workspace, on every machine signed in to it.
///
/// **One command for the whole act, and the interface observes it.** The name lives on the
/// organization database's workspace row, sealed under the content key and outside the
/// signature, as the plan puts it, so whoever carries `renameWorkspace` writes it and every
/// replica reads it on its next pull. Answers with the state, so the caller reads the name it
/// just set rather than the one it had.
///
/// The name is validated by the form before it gets here and again by the shell, which is what
/// stores it. Nothing is validated in between: a third opinion in the middle would be the one
/// that goes stale.
#[tauri::command(rename = "workspace_rename")]
pub async fn organization_workspace_rename(
    app_state: tauri::State<'_, Shared>,
    name: String,
) -> Result<RemoteSyncState, Error> {
    rename_current_workspace(app_state.inner(), &name).await?;

    let mut remote_sync = app_state.remote_sync.write().await;
    remote_sync.get_state().await
}

/// The workspace a command names, reached on Turso for the signed-in member: under the
/// credential their session holds, or, where Turso refused that one, after collecting the
/// credentials again, which hands the sync engine any that moved for the open workspace too.
struct Signed<'a> {
    app_state: &'a Shared,
    workspace_id: &'a str,
}

impl remote::Resolve for Signed<'_> {
    async fn reach(&mut self, collect: Collect) -> Result<Reach, Error> {
        let app_state = self.app_state;
        let workspace_id = self.workspace_id;

        as_member(app_state, Pull::No, async |Acting { member, store }| {
            if collect == Collect::Again {
                remote::collect_again(store, member).await?;
                hold_renewed_token(app_state, member).await;
            }

            remote::reach(store, member, workspace_id, Pipeline::of).await
        })
        .await
    }
}

/// Run one statement on a workspace that need not be open on this machine, directly on Turso, and
/// answer its rows as `execute_single_sql` answers a replica's (effort 846, requirement 15).
///
/// **Nothing is opened, switched or written to this machine.** The window's open workspace stays
/// open, no replica is named, and the credential is the one the vault already unsealed for that
/// workspace: nothing is minted, and the caller names the workspace and never a host or a token
/// ([[rules/credentials]], *Client boundary*). The refusals are [`remote::reach`]'s and
/// [`remote::reached`]'s.
#[tauri::command(rename = "workspace_query")]
pub(crate) async fn organization_workspace_query(
    app_state: tauri::State<'_, Shared>,
    workspace_id: String,
    query: SQLQuery,
) -> Result<Vec<SQLRow>, Error> {
    remote::reached(
        &mut Signed {
            app_state: app_state.inner(),
            workspace_id: &workspace_id,
        },
        &query,
    )
    .await
}

/// Run several statements on a workspace that need not be open on this machine, as one
/// transaction directly on Turso, and answer each one's rows as `execute_batch_sql` does: all of
/// them, or none of them kept. Otherwise as [`organization_workspace_query`].
#[tauri::command(rename = "workspace_batch")]
pub(crate) async fn organization_workspace_batch(
    app_state: tauri::State<'_, Shared>,
    workspace_id: String,
    queries: Vec<SQLQuery>,
) -> Result<Vec<Vec<SQLRow>>, Error> {
    remote::reached(
        &mut Signed {
            app_state: app_state.inner(),
            workspace_id: &workspace_id,
        },
        queries.as_slice(),
    )
    .await
}
