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
    google::auth::google_oauth_client_id, google::transport::GoogleDriveSyncCompleteInput,
    lock::GoogleDriveSyncLock, session::GoogleDriveLinkSession,
};

pub struct RemoteSync {
    pub(super) settings: Arc<RwLock<Persisted<Settings>>>,
    pub(super) store: Persisted<RemoteSyncStore>,
    pub(super) auth_sessions: Arc<Mutex<HashMap<String, GoogleDriveLinkSession>>>,
    pub(super) google_drive_sync_lock: Option<GoogleDriveSyncLock>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum RemoteSyncProvider {
    #[default]
    Local,
    GoogleDrive,
    /// Of record remotely, replicated onto this machine.
    ///
    /// Additive to the serde representation on purpose: a store written before this variant
    /// existed holds `"local"` or `"googleDrive"` and deserialises unchanged, and `Local` is
    /// both the default and the value an unconfigured install already had. That is what makes
    /// an update cost nobody their workspace structurally rather than by care.
    Hosted,
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
    pub provider: RemoteSyncProvider,
    pub status: RemoteSyncAccountStatus,
    pub email: String,
    pub display_name: String,
    pub avatar_url: Option<String>,
    pub provider_user_id: Option<String>,
    pub drive_quota_bytes: Option<i64>,
    pub drive_usage_bytes: Option<i64>,
    pub app_usage_bytes: Option<i64>,
    pub token_expires_at: Option<i64>,
    pub refresh_token_available: bool,
    pub last_synced_at: Option<i64>,
    pub last_error: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct RemoteSyncWorkspace {
    pub id: String,
    pub account_id: Option<String>,
    pub provider: RemoteSyncProvider,
    pub name: String,
    pub local_database_path: PathBuf,
    /// which workspace the remote holds, as the remote itself names it.
    ///
    /// Recorded when a sync settles, and compared against what a later reading
    /// finds: a folder that answers for this workspace while naming a different
    /// one is intact but is not the remote this workspace agreed with, and no
    /// direction between them is safe to choose without the user. Absent for a
    /// workspace linked before this was recorded, which is why a disagreement
    /// needs both sides — an install that never wrote one cannot be wrong about it.
    pub remote_workspace_id: Option<String>,
    pub remote_folder_id: Option<String>,
    pub remote_manifest_file_id: Option<String>,
    pub remote_head_file_id: Option<String>,
    pub remote_head_revision: Option<String>,
    pub last_remote_updated_at: Option<i64>,
    pub last_synced_at: Option<i64>,
    pub last_snapshot_at: Option<i64>,
    pub last_snapshot_filename: Option<String>,
    pub last_error: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct StoredGoogleDriveCredentials {
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
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteSyncState {
    pub accounts: Vec<RemoteSyncAccount>,
    pub workspace: RemoteSyncWorkspace,
    pub startup_prompt_enabled: bool,
    pub google_drive_ready: bool,
    pub device_id: String,
}

impl Default for RemoteSyncStore {
    fn default() -> Self {
        Self {
            accounts: Vec::new(),
            workspace: RemoteSyncWorkspace::default(),
            startup_prompt_enabled: true,
            device_id: String::new(),
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
        self.workspace.account_id = sanitize_optional_string(self.workspace.account_id.clone());
        self.workspace.name = sanitize_string(&self.workspace.name);
        self.workspace.remote_workspace_id =
            sanitize_optional_string(self.workspace.remote_workspace_id.clone());
        self.workspace.remote_folder_id =
            sanitize_optional_string(self.workspace.remote_folder_id.clone());
        self.workspace.remote_manifest_file_id =
            sanitize_optional_string(self.workspace.remote_manifest_file_id.clone());
        self.workspace.remote_head_file_id =
            sanitize_optional_string(self.workspace.remote_head_file_id.clone());
        self.workspace.remote_head_revision =
            sanitize_optional_string(self.workspace.remote_head_revision.clone());
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
            google_drive_sync_lock: None,
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

    pub fn mark_google_drive_synced(
        &mut self,
        input: GoogleDriveSyncCompleteInput,
    ) -> Result<(), Error> {
        let workspace_id = sanitize_string(&input.workspace_id);
        let workspace_name = sanitize_optional_string(input.workspace_name);
        let account_id = sanitize_string(&input.account_id);
        let synced_at = timestamp::now();

        if self.store.workspace.account_id.as_deref() != Some(account_id.as_str()) {
            return Err(Error::Forbidden {
                message: "workspace is not linked to the requested google drive account"
                    .to_string(),
            });
        }

        if !workspace_id.is_empty() {
            self.store.workspace.id = workspace_id.clone();
        }

        if let Some(workspace_name) = workspace_name {
            self.store.workspace.name = workspace_name;
        }

        // the caller names the workspace the remote holds; a remote that named
        // none is one this machine is seeding, so its identity is this workspace's.
        let remote_workspace_id = if workspace_id.is_empty() {
            self.store.workspace.id.clone()
        } else {
            workspace_id
        };

        self.store.workspace.provider = RemoteSyncProvider::GoogleDrive;
        self.store.workspace.remote_workspace_id = Some(remote_workspace_id);
        self.store.workspace.remote_folder_id = Some(sanitize_string(&input.remote_folder_id));
        self.store.workspace.remote_manifest_file_id =
            Some(sanitize_string(&input.remote_manifest_file_id));
        self.store.workspace.remote_head_file_id =
            Some(sanitize_string(&input.remote_head_file_id));
        self.store.workspace.remote_head_revision =
            Some(sanitize_string(&input.remote_head_revision));
        self.store.workspace.last_remote_updated_at = Some(input.remote_updated_at);
        self.store.workspace.last_synced_at = Some(synced_at);
        self.store.workspace.last_error = None;
        self.store.workspace.updated_at = synced_at;

        if let Some(account) = self
            .store
            .accounts
            .iter_mut()
            .find(|account| account.id == account_id)
        {
            account.status = RemoteSyncAccountStatus::Ready;
            account.drive_quota_bytes = input.drive_quota_bytes.or(account.drive_quota_bytes);
            account.drive_usage_bytes = input.drive_usage_bytes.or(account.drive_usage_bytes);
            account.app_usage_bytes = input.app_usage_bytes.or(account.app_usage_bytes);
            account.last_synced_at = Some(synced_at);
            account.last_error = None;
            account.updated_at = synced_at;
        }

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

        let linked_google_drive_account_ids: HashSet<String> = self
            .store
            .workspace
            .account_id
            .clone()
            .filter(|_| self.store.workspace.provider == RemoteSyncProvider::GoogleDrive)
            .into_iter()
            .collect();

        let removed_google_drive_account_ids = self
            .store
            .accounts
            .iter()
            .filter(|account| {
                account.provider == RemoteSyncProvider::GoogleDrive
                    && !linked_google_drive_account_ids.contains(&account.id)
            })
            .map(|account| account.id.clone())
            .collect::<Vec<_>>();

        self.store.accounts.retain(|account| {
            account.provider != RemoteSyncProvider::GoogleDrive
                || linked_google_drive_account_ids.contains(&account.id)
        });

        for removed_account_id in removed_google_drive_account_ids {
            let _ = self.delete_google_drive_credentials(&removed_account_id);
        }

        let retained_google_drive_account_ids = self
            .store
            .accounts
            .iter()
            .map(|account| account.id.clone())
            .collect::<HashSet<_>>();

        let missing_linked_account = self.store.workspace.provider
            == RemoteSyncProvider::GoogleDrive
            && self
                .store
                .workspace
                .account_id
                .as_ref()
                .map(|account_id| !retained_google_drive_account_ids.contains(account_id))
                .unwrap_or(true);

        if missing_linked_account {
            Self::reset_workspace_to_local(&mut self.store.workspace, now);
            changed = true;
        }

        let mut refresh_token_account_ids = HashSet::new();

        for account_id in self.store.accounts.iter().map(|account| account.id.clone()) {
            if self
                .load_google_drive_credentials(&account_id)?
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
            google_drive_ready: google_oauth_client_id().is_some(),
            device_id: self.store.device_id.clone(),
        }
    }

    pub(super) fn default_workspace(path: PathBuf, now: i64) -> RemoteSyncWorkspace {
        RemoteSyncWorkspace {
            id: format!("workspace-{}", now),
            account_id: None,
            provider: RemoteSyncProvider::Local,
            name: "Primary workspace".to_string(),
            local_database_path: path,
            remote_workspace_id: None,
            remote_folder_id: None,
            remote_manifest_file_id: None,
            remote_head_file_id: None,
            remote_head_revision: None,
            last_remote_updated_at: None,
            last_synced_at: None,
            last_snapshot_at: None,
            last_snapshot_filename: None,
            last_error: None,
            created_at: now,
            updated_at: now,
        }
    }

    pub(super) fn reset_workspace_to_local(workspace: &mut RemoteSyncWorkspace, now: i64) {
        workspace.account_id = None;
        workspace.provider = RemoteSyncProvider::Local;
        workspace.remote_workspace_id = None;
        workspace.remote_folder_id = None;
        workspace.remote_manifest_file_id = None;
        workspace.remote_head_file_id = None;
        workspace.remote_head_revision = None;
        workspace.last_remote_updated_at = None;
        workspace.last_synced_at = None;
        workspace.last_error = None;
        workspace.updated_at = now;
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

pub(super) fn sanitize_filename(value: &str) -> String {
    value
        .chars()
        .map(|character| match character {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '-',
            other => other,
        })
        .collect::<String>()
        .trim()
        .to_string()
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

    use super::{RemoteSync, RemoteSyncProvider, slugify};
    use crate::{
        persisted::Persisted, settings::Settings,
        sync::google::auth::clear_test_google_drive_credentials_store,
    };

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

    /// The whole of what "additive to the serde representation" is worth, asserted rather than
    /// reasoned about: a store written before `Hosted` existed holds one of the other two
    /// strings, and adding a variant must not change what those two mean. A rename or a
    /// reordering would pass every other test in this file and fail this one.
    #[test]
    fn a_store_written_before_hosted_existed_still_reads_as_what_it_was() {
        for (written, expected) in [
            ("\"local\"", RemoteSyncProvider::Local),
            ("\"googleDrive\"", RemoteSyncProvider::GoogleDrive),
            ("\"hosted\"", RemoteSyncProvider::Hosted),
        ] {
            let read: RemoteSyncProvider =
                serde_json::from_str(written).expect("a persisted provider should still read");

            assert_eq!(read, expected, "{written} changed meaning");
            assert_eq!(
                serde_json::to_string(&expected).expect("a provider should write"),
                written,
                "{written} no longer round-trips"
            );
        }
    }

    /// `Local` is both the default and the value an unconfigured install already had. That is
    /// what makes an update cost nobody their workspace structurally rather than by care, so it
    /// is pinned here rather than left to the `#[default]` attribute being noticed in review.
    #[test]
    fn an_absent_provider_is_still_local() {
        assert_eq!(RemoteSyncProvider::default(), RemoteSyncProvider::Local);
    }

    #[test]
    fn initializes_default_workspace_from_managed_database_path() {
        clear_test_google_drive_credentials_store();

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
                assert_eq!(state.workspace.provider, RemoteSyncProvider::Local);

                let _ = std::fs::remove_dir_all(&root);
            });
    }

    #[test]
    fn reconcile_tracks_managed_database_path_changes() {
        clear_test_google_drive_credentials_store();

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
