use std::{
    collections::{HashMap, HashSet},
    path::PathBuf,
    sync::{Arc, Mutex},
};

use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;

use crate::{
    backup::BackupEntry,
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
    ) -> Result<Self, String> {
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

    pub async fn get_state(&mut self) -> Result<RemoteSyncState, String> {
        self.reconcile().await?;
        Ok(self.snapshot_state())
    }

    pub fn workspace(&self) -> RemoteSyncWorkspace {
        self.store.workspace.clone()
    }

    pub fn record_snapshot_for_workspace(&mut self, entry: &BackupEntry) -> Result<(), String> {
        self.store.workspace.last_snapshot_at = Some(entry.created_at);
        self.store.workspace.last_snapshot_filename = Some(entry.filename.clone());
        self.store.workspace.updated_at = timestamp::now();

        self.store.commit()
    }

    pub fn mark_google_drive_synced(
        &mut self,
        input: GoogleDriveSyncCompleteInput,
    ) -> Result<(), String> {
        let workspace_id = sanitize_string(&input.workspace_id);
        let workspace_name = sanitize_optional_string(input.workspace_name);
        let account_id = sanitize_string(&input.account_id);
        let synced_at = timestamp::now();

        if self.store.workspace.account_id.as_deref() != Some(account_id.as_str()) {
            return Err(
                "workspace is not linked to the requested google drive account".to_string(),
            );
        }

        if !workspace_id.is_empty() {
            self.store.workspace.id = workspace_id;
        }

        if let Some(workspace_name) = workspace_name {
            self.store.workspace.name = workspace_name;
        }

        self.store.workspace.provider = RemoteSyncProvider::GoogleDrive;
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

    async fn reconcile(&mut self) -> Result<(), String> {
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
