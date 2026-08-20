use std::{
    collections::{HashMap, HashSet},
    path::PathBuf,
    sync::{Arc, Mutex},
};

use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;

use crate::{
    error::Error,
    persisted::{Persistable, Persisted},
    settings::Settings,
    timestamp,
};

use super::{
    control::{SessionWindow, control_plane_url},
    google::auth::google_oauth_client_id,
    session::GoogleSignInSession,
};

pub struct RemoteSync {
    pub(super) settings: Arc<RwLock<Persisted<Settings>>>,
    pub(super) store: Persisted<RemoteSyncStore>,
    pub(super) auth_sessions: Arc<Mutex<HashMap<String, GoogleSignInSession>>>,
    /// the Turso credential the replica syncs with, for as long as this process runs.
    ///
    /// **In memory rather than in the store or the keyring, and that is the shape rather than a
    /// shortcut.** It is short-lived by construction — three days, and re-minted by reaching the
    /// control plane — so a copy that outlived the process would be a credential on disk with
    /// nothing gained: the mint is what a machine needs on the next launch anyway, and it needs a
    /// session for that rather than this. The store is serialised to a plain file, so a field here
    /// is exactly the field that must not be in it.
    pub(super) workspace_token: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum RemoteSyncAccountStatus {
    #[default]
    Pending,
    Ready,
    NeedsReconnect,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct RemoteSyncAccount {
    pub id: String,
    pub status: RemoteSyncAccountStatus,
    pub email: String,
    pub display_name: String,
    pub avatar_url: Option<String>,
    /// who Google says this is - the OpenID `sub` claim, which is what the control-plane API
    /// keys an account by.
    ///
    /// *It held Drive's `permissionId` until Drive sync retired: the same person under a scheme
    /// nothing else here spoke. One scheme is left and it is the API's.*
    pub provider_user_id: Option<String>,
    pub token_expires_at: Option<i64>,
    pub refresh_token_available: bool,
    pub last_error: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct RemoteSyncWorkspace {
    pub id: String,
    pub name: String,
    pub local_database_path: PathBuf,
    /// the control plane's own id for this workspace, learned at sign-in.
    ///
    /// **Separate from `id`, which is this machine's and predates any account.** They could have
    /// been collapsed and were not: `id` is what every local record and every diagnostic already
    /// names, and rewriting it on first sign-in would rename a workspace under everything holding
    /// it. This is the name the mint answers to, and it is `None` on a machine that has never
    /// reached a control plane.
    pub remote_id: Option<String>,
    /// what the replica syncs against, `libsql://` and all. `None` until something has minted.
    ///
    /// **A URL is not a credential** and crosses to TypeScript with the rest of the state; the
    /// token it is reached with does not ([[rules/credentials]], under *Client boundary*).
    pub remote_url: Option<String>,
    pub last_error: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct StoredGoogleCredentials {
    pub account_id: String,
    pub access_token: String,
    pub refresh_token: String,
    pub token_expires_at: Option<i64>,
    pub updated_at: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct RemoteSyncStore {
    pub accounts: Vec<RemoteSyncAccount>,
    pub workspace: RemoteSyncWorkspace,
    pub startup_prompt_enabled: bool,
    pub device_id: String,
    /// how much longer this machine may go on replicating (#550).
    ///
    /// **Persisted rather than held for the run of the process**, which is the whole of what
    /// requirement 15 asks for: a signed-in client works offline for *three days*, and a window
    /// that started again at every launch would be a window measured in one sitting. Absent on
    /// every machine that has not signed in to a control plane, which today is all of them.
    pub control_plane_session: Option<SessionWindow>,
    /// every workspace replica this machine holds, and whose it is.
    ///
    /// **A replica is kept indefinitely and membership is what keeps it.** It is not deleted on
    /// sign-out and not deleted on a timer: somebody who signs out is usually about to sign back
    /// in, and re-pulling a whole workspace to serve that is a cost nobody asked for. What ends a
    /// replica is the account it belongs to ceasing to be a member of the workspace it holds —
    /// then it is a copy of a ledger this machine has no right to, and it goes.
    ///
    /// *Directed by the human 2026-08-20.* Today an account owns its one workspace and membership
    /// ends only where an operator ends it, so this mostly answers *still yours*. It is built now
    /// because requirement 14's organization work is where membership starts ending routinely, and
    /// a machine that had been keeping replicas with no rule for removing them would by then be
    /// holding workspaces its owner was removed from months earlier.
    ///
    /// A list because one machine can hold replicas for several accounts.
    pub replicas: Vec<LocalReplica>,
}

/// one workspace replica on this machine, and the account whose membership keeps it.
#[derive(Clone, Debug, Serialize, Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct LocalReplica {
    /// the control plane's id for the workspace, which is what the file is named for.
    pub workspace_id: String,
    /// the account this machine held it for. **A replica is only ever checkable while somebody
    /// can sign in as this account**, which is why it is recorded rather than inferred.
    pub account_id: String,
    pub created_at: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteSyncState {
    pub accounts: Vec<RemoteSyncAccount>,
    pub workspace: RemoteSyncWorkspace,
    pub startup_prompt_enabled: bool,
    /// whether this build was given an OAuth client to sign in with.
    ///
    /// *It was `google_drive_ready` and reported this same fact: the client id is the OAuth
    /// registration's, and it was Drive's only in the sense that Drive was the only thing that
    /// spent it.*
    pub google_sign_in_ready: bool,
    /// whether this build was told where a control plane is. Reported for the same reason
    /// `google_sign_in_ready` is: a capability the caller can see, rather than one it discovers
    /// by a call failing.
    pub control_plane_ready: bool,
    /// the window, and **never the token that goes with it** (#550).
    ///
    /// Two moments cross the boundary and the credential does not. They are facts *about* a
    /// credential rather than one, exactly as `RemoteSyncAccount::token_expires_at` already is,
    /// and the side that decides whether to keep replicating cannot do so without them.
    pub session: Option<SessionWindow>,
    pub device_id: String,
}

impl Default for RemoteSyncStore {
    fn default() -> Self {
        Self {
            accounts: Vec::new(),
            workspace: RemoteSyncWorkspace::default(),
            startup_prompt_enabled: true,
            device_id: String::new(),
            control_plane_session: None,
            replicas: Vec::new(),
        }
    }
}

impl Persistable for RemoteSyncStore {
    fn sanitize(&mut self) {
        for account in self.accounts.iter_mut() {
            account.id = sanitize_string(&account.id);
            account.email = sanitize_string(&account.email);
            account.display_name = sanitize_string(&account.display_name);
            account.avatar_url = sanitize_optional_string(account.avatar_url.clone());
            account.provider_user_id = sanitize_optional_string(account.provider_user_id.clone());
            account.last_error = sanitize_optional_string(account.last_error.clone());

            if account.created_at <= 0 {
                account.created_at = timestamp::now();
            }

            if account.updated_at <= 0 {
                account.updated_at = account.created_at;
            }
        }

        self.workspace.id = sanitize_string(&self.workspace.id);
        self.workspace.name = sanitize_string(&self.workspace.name);
        self.workspace.last_error = sanitize_optional_string(self.workspace.last_error.clone());

        if self.workspace.name.is_empty() {
            self.workspace.name = "Primary workspace".to_string();
        }

        if self.workspace.created_at <= 0 {
            self.workspace.created_at = timestamp::now();
        }

        if self.workspace.updated_at <= 0 {
            self.workspace.updated_at = self.workspace.created_at;
        }

        self.device_id = sanitize_string(&self.device_id);

        if self.device_id.is_empty() {
            self.device_id = format!("device-{}", timestamp::now());
        }

        self.accounts.retain(|account| !account.id.is_empty());

        // A window naming no account cannot be signed out of and cannot be renewed, so it is
        // not a window — it is a row nothing can act on, and keeping it would leave a hosted
        // workspace asking for a sign-in it had no way to complete.
        if let Some(session) = self.control_plane_session.as_mut() {
            session.account_id = sanitize_string(&session.account_id);
        }

        self.control_plane_session
            .take_if(|session| session.account_id.is_empty() || session.expires_at <= 0);
    }
}

impl RemoteSync {
    pub const FILENAME: &'static str = "remote-sync.json";

    pub async fn new(
        settings: Arc<RwLock<Persisted<Settings>>>,
        path: PathBuf,
    ) -> Result<Self, Error> {
        let store = Persisted::<RemoteSyncStore>::load(path)?;
        let mut this = Self {
            settings,
            store,
            auth_sessions: Arc::new(Mutex::new(HashMap::new())),
            workspace_token: None,
        };
        this.reconcile().await?;
        Ok(this)
    }

    pub async fn get_state(&mut self) -> Result<RemoteSyncState, Error> {
        self.reconcile().await?;
        Ok(self.snapshot_state())
    }

    pub fn workspace(&self) -> RemoteSyncWorkspace {
        self.store.workspace.clone()
    }

    /// who this machine is signed in as, or nobody.
    ///
    /// **A row is not a sign-in**, which is why the status is what decides rather than the row
    /// existing: the account outlives its credentials on purpose, so that whatever was recorded
    /// under it can still say what it is waiting for. `NeedsReconnect` is written in exactly the
    /// places that have just deleted those credentials, and it is the one status that means this
    /// machine no longer holds this identity.
    ///
    /// At most one identity is held at a time, because a sign-in signs out of every other account
    /// on its way through. So the first match is the only match rather than the one iteration
    /// order happened to reach, and `$lib/sync/account` answers the same question the same way on
    /// the other side of the boundary.
    pub(crate) fn signed_in_account_id(&self) -> Option<String> {
        self.store
            .accounts
            .iter()
            .find(|account| account.status != RemoteSyncAccountStatus::NeedsReconnect)
            .map(|account| account.id.clone())
    }

    /// Stop naming a workspace this machine may no longer open.
    ///
    /// **Called where membership ended**, and it is what gives somebody a route back: a machine
    /// that kept naming a workspace it is refused from would re-mint, be refused, and reach the
    /// same dead end on every launch forever.
    pub(crate) fn forget_remote_workspace(&mut self) -> Result<(), Error> {
        if self.store.workspace.remote_id.is_none() && self.store.workspace.remote_url.is_none() {
            return Ok(());
        }

        self.store.workspace.remote_id = None;
        self.store.workspace.remote_url = None;
        self.store.workspace.updated_at = timestamp::now();

        self.store.commit()
    }

    /// Note that this machine holds a replica of `workspace_id` for `account_id`.
    ///
    /// Idempotent, and it does **not** move `created_at` on a workspace already held: the record
    /// is of when this machine started keeping it, and re-recording it on every launch would make
    /// that number the launch time and tell nobody anything.
    pub(crate) fn remember_replica(
        &mut self,
        workspace_id: &str,
        account_id: &str,
        now: i64,
    ) -> Result<(), Error> {
        if self
            .store
            .replicas
            .iter()
            .any(|replica| replica.workspace_id == workspace_id)
        {
            return Ok(());
        }

        self.store.replicas.push(LocalReplica {
            workspace_id: workspace_id.to_string(),
            account_id: account_id.to_string(),
            created_at: now,
        });

        self.store.commit()
    }

    /// every replica this machine is holding, whether or not anybody is signed in.
    pub(crate) fn local_replicas(&self) -> Vec<LocalReplica> {
        self.store.replicas.clone()
    }

    /// Stop tracking one, because its file has been deleted.
    pub(crate) fn forget_replica(&mut self, workspace_id: &str) -> Result<(), Error> {
        let before = self.store.replicas.len();

        self.store
            .replicas
            .retain(|replica| replica.workspace_id != workspace_id);

        if self.store.replicas.len() == before {
            return Ok(());
        }

        self.store.commit()
    }

    /// the replica's credential, if this process has minted one.
    pub(crate) fn workspace_token(&self) -> Option<String> {
        self.workspace_token.clone()
    }

    /// Hold the credential the replica syncs with, replacing whatever was there.
    ///
    /// **Replacing rather than appending is the whole point**: the engine resolves the token before
    /// every request, so a re-mint reaches the next request without the replica being rebuilt.
    pub(super) fn hold_workspace_token(&mut self, token: &str) {
        self.workspace_token = Some(token.to_string());
    }

    /// Remember which workspace this machine belongs to, as the control plane names it.
    ///
    /// Written at sign-in and again at every mint, because the second is where the URL arrives.
    /// **Neither is a credential**, so both are persisted with the rest of the store rather than
    /// filed in the platform's credential store.
    pub(super) fn record_remote_workspace(
        &mut self,
        remote_id: &str,
        remote_url: Option<&str>,
    ) -> Result<(), Error> {
        let workspace = &mut self.store.workspace;

        // **The URL is carried forward only for the workspace it belongs to.** A sign-in names the
        // workspace and not its URL, so carrying the stored one is what keeps a machine able to
        // open offline; carrying it across a *different* workspace would hand this account the
        // previous one's database, which is the pair being internally inconsistent on disk rather
        // than merely stale.
        let same_workspace = workspace.remote_id.as_deref() == Some(remote_id);
        let url = remote_url.map(str::to_string).or_else(|| {
            same_workspace
                .then(|| workspace.remote_url.clone())
                .flatten()
        });

        if same_workspace && workspace.remote_url == url {
            return Ok(());
        }

        workspace.remote_id = Some(remote_id.to_string());
        workspace.remote_url = url;
        workspace.updated_at = timestamp::now();

        self.store.commit()
    }

    async fn reconcile(&mut self) -> Result<(), Error> {
        let current_database_path = self.current_database_path().await;
        let now = timestamp::now();
        let mut changed = false;

        if self.store.device_id.is_empty() {
            self.store.device_id = format!("device-{}", now);
            changed = true;
        }

        if self.store.workspace.id.is_empty() {
            self.store.workspace = Self::default_workspace(current_database_path.clone(), now);
            changed = true;
        }

        if self.store.workspace.local_database_path != current_database_path {
            self.store.workspace.local_database_path = current_database_path;
            self.store.workspace.updated_at = now;
            changed = true;
        }

        if self.store.workspace.name.trim().is_empty() {
            self.store.workspace.name = "Primary workspace".to_string();
            changed = true;
        }

        if self.store.startup_prompt_enabled {
            self.store.startup_prompt_enabled = false;
            changed = true;
        }

        // an account nothing links is an identity, not litter.
        //
        // Until 2026-08-18 this reconcile deleted every Google account the workspace was not
        // linked to, along with its credentials — which was consistent while signing in *was*
        // linking, because an account with no link had been reached by no route. Signing in is
        // its own act now, and with Drive retired there is no link for one to be missing from:
        // an account row is somebody who signed in, and pruning it would undo the act on the
        // next state read.
        let mut refresh_token_account_ids = HashSet::new();

        for account_id in self.store.accounts.iter().map(|account| account.id.clone()) {
            if self
                .load_google_credentials(&account_id)?
                .map(|credentials| !credentials.refresh_token.trim().is_empty())
                .unwrap_or(false)
            {
                refresh_token_account_ids.insert(account_id);
            }
        }

        for account in self.store.accounts.iter_mut() {
            account.refresh_token_available = refresh_token_account_ids.contains(&account.id);
        }

        if changed {
            self.store.commit()?;
        }

        Ok(())
    }

    pub(super) async fn current_database_path(&self) -> PathBuf {
        let settings = self.settings.read().await;

        settings.database_path.clone()
    }

    fn snapshot_state(&self) -> RemoteSyncState {
        RemoteSyncState {
            accounts: self.store.accounts.clone(),
            workspace: self.store.workspace.clone(),
            startup_prompt_enabled: self.store.startup_prompt_enabled,
            google_sign_in_ready: google_oauth_client_id().is_some(),
            control_plane_ready: control_plane_url().is_some(),
            session: self.store.control_plane_session.clone(),
            device_id: self.store.device_id.clone(),
        }
    }

    pub(super) fn default_workspace(path: PathBuf, now: i64) -> RemoteSyncWorkspace {
        RemoteSyncWorkspace {
            id: format!("workspace-{}", now),
            name: "Primary workspace".to_string(),
            local_database_path: path,
            // A machine that has never reached a control plane belongs to no workspace it can
            // name. Both arrive at the first sign-in.
            remote_id: None,
            remote_url: None,
            last_error: None,
            created_at: now,
            updated_at: now,
        }
    }
}

pub(super) fn sanitize_string(value: &str) -> String {
    value.trim().to_string()
}

pub(super) fn sanitize_optional_string(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

pub(super) fn slugify(value: &str) -> String {
    let mut slug = String::new();

    for character in value.chars() {
        if character.is_ascii_alphanumeric() {
            slug.push(character.to_ascii_lowercase());
        } else if !slug.ends_with('-') {
            slug.push('-');
        }
    }

    slug.trim_matches('-').to_string().if_empty_then("profile")
}

trait StringExt {
    fn if_empty_then(self, fallback: &str) -> String;
}

impl StringExt for String {
    fn if_empty_then(self, fallback: &str) -> String {
        if self.trim().is_empty() {
            fallback.to_string()
        } else {
            self
        }
    }
}

#[cfg(test)]
mod tests {
    use std::{path::PathBuf, sync::Arc};

    use tokio::{runtime::Runtime, sync::RwLock};

    use super::{RemoteSync, RemoteSyncStore, slugify};
    use crate::{persisted::Persisted, settings::Settings};

    fn unique_dir(name: &str) -> PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("system time before unix epoch")
            .as_nanos();

        std::env::temp_dir()
            .join("rentable-tests")
            .join(format!("{}-{}", name, nanos))
    }

    /// **A replica is tracked when it is opened, and tracking it twice does not move it.**
    ///
    /// The `created_at` is when this machine started holding the workspace. Re-recording on every
    /// launch would make it the launch time, which tells nobody anything.
    #[test]
    fn a_replica_is_tracked_once_with_the_account_that_keeps_it() {
        let mut remote_sync = a_remote_sync("track");

        remote_sync
            .remember_replica("ws-1", "account-1", 1_000)
            .expect("remembering");
        remote_sync
            .remember_replica("ws-1", "account-1", 9_999)
            .expect("remembering again");

        let held = remote_sync.local_replicas();

        assert_eq!(held.len(), 1, "one workspace was tracked twice");
        assert_eq!(held[0].workspace_id, "ws-1");
        assert_eq!(
            held[0].account_id, "account-1",
            "a replica does not record whose membership keeps it"
        );
        assert_eq!(
            held[0].created_at, 1_000,
            "re-tracking moved the moment it was created"
        );
    }

    /// **One machine can hold replicas for several accounts**, and forgetting one leaves the rest.
    #[test]
    fn forgetting_one_replica_leaves_the_others() {
        let mut remote_sync = a_remote_sync("forget");

        remote_sync
            .remember_replica("ws-1", "account-1", 1_000)
            .expect("first");
        remote_sync
            .remember_replica("ws-2", "account-2", 1_000)
            .expect("second");

        remote_sync.forget_replica("ws-1").expect("forgetting");

        let held = remote_sync.local_replicas();

        assert_eq!(held.len(), 1);
        assert_eq!(
            held[0].workspace_id, "ws-2",
            "the wrong replica was forgotten"
        );
    }

    /// Forgetting one nothing tracks is a no-op rather than an error: a replica deleted by hand is
    /// still one this machine has stopped holding.
    #[test]
    fn forgetting_a_replica_nothing_tracks_is_not_a_failure() {
        let mut remote_sync = a_remote_sync("forget-unknown");

        remote_sync
            .forget_replica("ws-nothing")
            .expect("forgetting");

        assert!(remote_sync.local_replicas().is_empty());
    }

    fn a_remote_sync(name: &str) -> RemoteSync {
        RemoteSync {
            settings: Arc::new(RwLock::new(
                Persisted::<Settings>::load(
                    unique_dir(&format!("{name}-settings")).join("settings.json"),
                )
                .expect("settings"),
            )),
            store: Persisted::<RemoteSyncStore>::load(unique_dir(name).join("store.json"))
                .expect("store"),
            auth_sessions: Arc::new(std::sync::Mutex::new(std::collections::HashMap::new())),
            workspace_token: None,
        }
    }

    #[test]
    fn slugify_is_stable() {
        assert_eq!(slugify("Person Example+1"), "person-example-1");
    }

    /// A store written while the mode existed still reads, and that is the whole of the
    /// migration: `provider` is **dropped rather than migrated**, because `RemoteSyncStore` and
    /// every struct under it derive `Deserialize` without `deny_unknown_fields`, so serde
    /// ignores a field no type claims. An install holding `"local"` or `"googleDrive"` loads
    /// unchanged and writes the field away on its next commit.
    ///
    /// Asserted rather than reasoned about: adding `deny_unknown_fields` anywhere on this path
    /// would make every store on a developer machine unreadable, and nothing else in this file
    /// would notice.
    #[test]
    fn a_store_written_while_the_mode_existed_still_reads() {
        for written in ["\"local\"", "\"googleDrive\"", "\"hosted\""] {
            let store: RemoteSyncStore = serde_json::from_str(&format!(
                "{{\"workspace\":{{\"id\":\"workspace-1\",\"provider\":{written},\"name\":\"Primary workspace\"}},\"accounts\":[{{\"id\":\"account-1\",\"provider\":{written},\"email\":\"person@example.com\"}}]}}"
            ))
            .expect("a store written with a provider should still read");

            assert_eq!(
                store.workspace.id, "workspace-1",
                "{written} lost the workspace"
            );
            assert_eq!(store.accounts.len(), 1, "{written} lost the account");
        }
    }

    #[test]
    fn initializes_default_workspace_from_managed_database_path() {
        Runtime::new()
            .expect("failed to create tokio runtime")
            .block_on(async {
                let root = unique_dir("remote-sync-default-profile");
                std::fs::create_dir_all(&root).expect("failed to create test root");

                let settings_path = root.join(Settings::FILENAME);
                let mut settings =
                    Persisted::<Settings>::load(settings_path).expect("failed to load settings");
                settings.database_path = root.join("app.db");
                settings.commit().expect("failed to commit settings");

                let settings = Arc::new(RwLock::new(settings));
                let mut remote_sync = RemoteSync::new(settings, root.join(RemoteSync::FILENAME))
                    .await
                    .expect("failed to initialize remote sync");

                let state = remote_sync.get_state().await.expect("failed to get state");
                assert_eq!(state.workspace.local_database_path, root.join("app.db"));

                let _ = std::fs::remove_dir_all(&root);
            });
    }

    #[test]
    fn reconcile_tracks_managed_database_path_changes() {
        Runtime::new()
            .expect("failed to create tokio runtime")
            .block_on(async {
                let root = unique_dir("remote-sync-reconcile-path-change");
                std::fs::create_dir_all(&root).expect("failed to create test root");

                let settings_path = root.join(Settings::FILENAME);
                let mut settings =
                    Persisted::<Settings>::load(settings_path).expect("failed to load settings");
                settings.database_path = root.join("first.db");
                settings.commit().expect("failed to commit settings");

                let settings = Arc::new(RwLock::new(settings));
                let mut remote_sync =
                    RemoteSync::new(settings.clone(), root.join(RemoteSync::FILENAME))
                        .await
                        .expect("failed to initialize remote sync");

                {
                    let mut settings = settings.write().await;
                    settings.database_path = root.join("second.db");
                    settings.commit().expect("failed to update settings");
                }

                let state = remote_sync.get_state().await.expect("failed to get state");
                assert_eq!(state.workspace.local_database_path, root.join("second.db"));

                let _ = std::fs::remove_dir_all(&root);
            });
    }
}
