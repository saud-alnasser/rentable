use std::{
    collections::{HashMap, HashSet},
    path::PathBuf,
    sync::{Arc, Mutex},
};

use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;

use crate::{
    backup::BackupEntry,
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
    pub last_snapshot_at: Option<i64>,
    pub last_snapshot_filename: Option<String>,
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
        self.workspace.last_snapshot_filename =
            sanitize_optional_string(self.workspace.last_snapshot_filename.clone());
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

    pub fn record_snapshot_for_workspace(&mut self, entry: &BackupEntry) -> Result<(), Error> {
        self.store.workspace.last_snapshot_at = Some(entry.created_at);
        self.store.workspace.last_snapshot_filename = Some(entry.filename.clone());
        self.store.workspace.updated_at = timestamp::now();

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
            last_snapshot_at: None,
            last_snapshot_filename: None,
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
