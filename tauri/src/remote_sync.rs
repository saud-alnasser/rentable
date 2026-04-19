use std::{
    collections::{HashMap, HashSet},
    fs,
    io::{Read, Write},
    net::TcpListener,
    path::PathBuf,
    sync::{Arc, Mutex},
    time::Duration,
};

use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
#[cfg(not(test))]
use keyring::{Entry as KeyringEntry, Error as KeyringError};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tokio::sync::RwLock;

use crate::{
    backup::{BackupEntry, BackupRecoveryKind, BackupSource},
    persisted::{Persistable, Persisted},
    settings::Settings,
    state::AppState,
    timestamp,
};

const GOOGLE_DRIVE_AUTHORIZE_ENDPOINT: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_DRIVE_TOKEN_ENDPOINT: &str = "https://oauth2.googleapis.com/token";
const GOOGLE_DRIVE_API_BASE_URL: &str = "https://www.googleapis.com/drive/v3";
const GOOGLE_DRIVE_SCOPE_DRIVE_FILE: &str = "https://www.googleapis.com/auth/drive.file";
const GOOGLE_DRIVE_SCOPE_DRIVE_METADATA: &str =
    "https://www.googleapis.com/auth/drive.metadata.readonly";
const GOOGLE_DRIVE_SCOPE_EMAIL: &str = "email";
const GOOGLE_DRIVE_SCOPE_PROFILE: &str = "profile";
#[cfg(not(test))]
const GOOGLE_DRIVE_KEYRING_SERVICE: &str = concat!(env!("CARGO_PKG_NAME"), ".google-drive");

pub struct RemoteSync {
    settings: Arc<RwLock<Persisted<Settings>>>,
    store: Persisted<RemoteSyncStore>,
    auth_sessions: Arc<Mutex<HashMap<String, GoogleDriveLinkSession>>>,
    google_drive_sync_lock: Option<GoogleDriveSyncLock>,
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

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum GoogleDriveLinkSessionStatus {
    #[default]
    Pending,
    Completed,
    Error,
    Cancelled,
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

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleDriveConfig {
    pub client_id: Option<String>,
    pub client_secret: Option<String>,
    pub authorize_endpoint: String,
    pub token_endpoint: String,
    pub drive_api_base_url: String,
    pub scopes: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleDriveLinkSessionStart {
    pub session_id: String,
    pub redirect_uri: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleDriveLinkSessionResult {
    pub session_id: String,
    pub status: GoogleDriveLinkSessionStatus,
    pub authorization_code: Option<String>,
    pub state: Option<String>,
    pub error: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleDriveLinkSessionCreateInput {
    pub state: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleDriveLinkSessionLookupInput {
    pub session_id: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleDriveLinkCompleteInput {
    pub email: String,
    pub display_name: String,
    pub avatar_url: Option<String>,
    pub provider_user_id: Option<String>,
    pub drive_quota_bytes: Option<i64>,
    pub drive_usage_bytes: Option<i64>,
    pub app_usage_bytes: Option<i64>,
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub token_expires_at: Option<i64>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleDriveAccountAuthInput {
    pub account_id: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleDriveAccountAuth {
    pub account_id: String,
    pub access_token: String,
    pub refresh_token: String,
    pub token_expires_at: Option<i64>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleDriveAccountUpdateInput {
    pub account_id: String,
    pub email: Option<String>,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
    pub provider_user_id: Option<String>,
    pub drive_quota_bytes: Option<i64>,
    pub drive_usage_bytes: Option<i64>,
    pub app_usage_bytes: Option<i64>,
    pub access_token: Option<String>,
    pub refresh_token: Option<String>,
    pub token_expires_at: Option<i64>,
    pub status: Option<RemoteSyncAccountStatus>,
    pub error: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleDriveDisconnectInput {
    pub account_id: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleDrivePreparedPush {
    pub workspace_id: String,
    pub account_id: String,
    pub filename: String,
    pub created_at: i64,
    pub source: BackupSource,
    pub app_version: String,
    pub contents_base64: String,
    pub content_hash: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleDrivePreparePushInput {
    #[serde(default)]
    pub manual: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleDriveLocalFingerprint {
    pub content_hash: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleDriveSyncLockAcquireInput {
    pub workspace_id: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleDriveSyncLockLease {
    pub lease_id: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleDriveSyncLockReleaseInput {
    pub lease_id: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleDriveSyncCompleteInput {
    pub workspace_id: String,
    pub workspace_name: Option<String>,
    pub account_id: String,
    pub remote_folder_id: String,
    pub remote_manifest_file_id: String,
    pub remote_head_file_id: String,
    pub remote_head_revision: String,
    pub remote_updated_at: i64,
    pub drive_quota_bytes: Option<i64>,
    pub drive_usage_bytes: Option<i64>,
    pub app_usage_bytes: Option<i64>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleDriveApplyPullInput {
    pub workspace_id: String,
    pub workspace_name: Option<String>,
    pub account_id: String,
    pub filename: String,
    pub app_version: String,
    pub contents_base64: String,
    pub content_hash: Option<String>,
    pub remote_folder_id: String,
    pub remote_manifest_file_id: String,
    pub remote_head_file_id: String,
    pub remote_head_revision: String,
    pub remote_updated_at: i64,
    pub drive_quota_bytes: Option<i64>,
    pub drive_usage_bytes: Option<i64>,
    pub app_usage_bytes: Option<i64>,
}

#[derive(Clone, Debug)]
struct GoogleDriveLinkSession {
    session_id: String,
    expected_state: String,
    status: GoogleDriveLinkSessionStatus,
    authorization_code: Option<String>,
    state: Option<String>,
    error: Option<String>,
}

const GOOGLE_DRIVE_LINK_POLL_INTERVAL: Duration = Duration::from_millis(200);
const GOOGLE_DRIVE_LINK_TIMEOUT: Duration = Duration::from_secs(5 * 60);

#[derive(Clone, Debug)]
struct GoogleDriveSyncLock {
    lease_id: String,
    workspace_id: String,
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

    pub fn get_google_drive_config(&self) -> GoogleDriveConfig {
        GoogleDriveConfig {
            client_id: google_oauth_client_id(),
            client_secret: google_oauth_client_secret(),
            authorize_endpoint: GOOGLE_DRIVE_AUTHORIZE_ENDPOINT.to_string(),
            token_endpoint: GOOGLE_DRIVE_TOKEN_ENDPOINT.to_string(),
            drive_api_base_url: GOOGLE_DRIVE_API_BASE_URL.to_string(),
            scopes: google_drive_scopes(),
        }
    }

    pub fn acquire_google_drive_sync_lock(
        &mut self,
        input: GoogleDriveSyncLockAcquireInput,
    ) -> Result<GoogleDriveSyncLockLease, String> {
        let workspace_id = sanitize_string(&input.workspace_id);

        if workspace_id.is_empty() {
            return Err("GOOGLE_DRIVE_SYNC_WORKSPACE_REQUIRED".to_string());
        }

        if let Some(existing_lock) = &self.google_drive_sync_lock {
            return Err(format!(
                "GOOGLE_DRIVE_SYNC_LOCKED:{}",
                existing_lock.workspace_id
            ));
        }

        let lease_id = format!("google-drive-sync-{}-{}", workspace_id, timestamp::now());
        self.google_drive_sync_lock = Some(GoogleDriveSyncLock {
            lease_id: lease_id.clone(),
            workspace_id,
        });

        Ok(GoogleDriveSyncLockLease { lease_id })
    }

    pub fn release_google_drive_sync_lock(&mut self, input: GoogleDriveSyncLockReleaseInput) {
        let lease_id = sanitize_string(&input.lease_id);

        if self
            .google_drive_sync_lock
            .as_ref()
            .map(|lock| lock.lease_id == lease_id)
            .unwrap_or(false)
        {
            self.google_drive_sync_lock = None;
        }
    }

    pub fn record_snapshot_for_workspace(&mut self, entry: &BackupEntry) -> Result<(), String> {
        self.store.workspace.last_snapshot_at = Some(entry.created_at);
        self.store.workspace.last_snapshot_filename = Some(entry.filename.clone());
        self.store.workspace.updated_at = timestamp::now();

        self.store.commit()
    }

    pub fn begin_google_drive_link(
        &mut self,
        input: GoogleDriveLinkSessionCreateInput,
    ) -> Result<GoogleDriveLinkSessionStart, String> {
        if google_oauth_client_id().is_none() {
            return Err("GOOGLE_OAUTH_CLIENT_ID is not configured".to_string());
        }

        let expected_state = sanitize_string(&input.state);

        if expected_state.is_empty() {
            return Err("oauth state is required".to_string());
        }

        let listener = TcpListener::bind("127.0.0.1:0").map_err(|error| error.to_string())?;
        let port = listener
            .local_addr()
            .map_err(|error| error.to_string())?
            .port();

        let session_id = format!("google-drive-link-{}", timestamp::now());
        let redirect_uri = format!("http://127.0.0.1:{port}/callback");

        {
            let mut sessions = self
                .auth_sessions
                .lock()
                .map_err(|_| "failed to lock oauth sessions".to_string())?;

            sessions.insert(
                session_id.clone(),
                GoogleDriveLinkSession {
                    session_id: session_id.clone(),
                    expected_state,
                    status: GoogleDriveLinkSessionStatus::Pending,
                    authorization_code: None,
                    state: None,
                    error: None,
                },
            );
        }

        let sessions = self.auth_sessions.clone();
        let session_id_for_thread = session_id.clone();

        std::thread::spawn(move || {
            if let Err(error) =
                handle_google_drive_callback(listener, sessions.clone(), &session_id_for_thread)
            {
                if let Ok(mut sessions) = sessions.lock() {
                    if let Some(session) = sessions.get_mut(&session_id_for_thread) {
                        session.status = GoogleDriveLinkSessionStatus::Error;
                        session.error = Some(error);
                    }
                }
            }
        });

        Ok(GoogleDriveLinkSessionStart {
            session_id,
            redirect_uri,
        })
    }

    pub fn get_google_drive_link_result(
        &self,
        input: GoogleDriveLinkSessionLookupInput,
    ) -> Result<GoogleDriveLinkSessionResult, String> {
        let session_id = sanitize_string(&input.session_id);

        let sessions = self
            .auth_sessions
            .lock()
            .map_err(|_| "failed to lock oauth sessions".to_string())?;

        let session = sessions
            .get(&session_id)
            .ok_or("oauth session not found".to_string())?;

        Ok(GoogleDriveLinkSessionResult {
            session_id: session.session_id.clone(),
            status: session.status.clone(),
            authorization_code: session.authorization_code.clone(),
            state: session.state.clone(),
            error: session.error.clone(),
        })
    }

    pub fn cancel_google_drive_link(
        &mut self,
        input: GoogleDriveLinkSessionLookupInput,
    ) -> Result<(), String> {
        let session_id = sanitize_string(&input.session_id);

        if session_id.is_empty() {
            return Err("oauth session id is required".to_string());
        }

        let mut sessions = self
            .auth_sessions
            .lock()
            .map_err(|_| "failed to lock oauth sessions".to_string())?;

        if let Some(session) = sessions.get_mut(&session_id) {
            session.status = GoogleDriveLinkSessionStatus::Cancelled;
            session.authorization_code = None;
            session.state = None;
            session.error = None;
        }

        Ok(())
    }

    pub async fn complete_google_drive_link(
        &mut self,
        input: GoogleDriveLinkCompleteInput,
    ) -> Result<RemoteSyncState, String> {
        let now = timestamp::now();
        let email = sanitize_string(&input.email).to_lowercase();
        let display_name = sanitize_string(&input.display_name);
        let resolved_display_name = if display_name.is_empty() {
            email.clone()
        } else {
            display_name.clone()
        };
        let provider_user_id = sanitize_optional_string(input.provider_user_id);
        let avatar_url = sanitize_optional_string(input.avatar_url);
        let access_token = sanitize_string(&input.access_token);
        let refresh_token = sanitize_optional_string(input.refresh_token);

        if email.is_empty() {
            return Err("google account email is required".to_string());
        }

        if access_token.is_empty() {
            return Err("google access token is required".to_string());
        }

        let account_index = self.store.accounts.iter().position(|account| {
            account.email.eq_ignore_ascii_case(&email)
                || provider_user_id
                    .as_ref()
                    .zip(account.provider_user_id.as_ref())
                    .map(|(left, right)| left == right)
                    .unwrap_or(false)
        });

        let account_id = if let Some(index) = account_index {
            let account = &mut self.store.accounts[index];
            account.provider = RemoteSyncProvider::GoogleDrive;
            account.status = RemoteSyncAccountStatus::Ready;
            account.email = email.clone();
            account.display_name = resolved_display_name.clone();
            account.avatar_url = avatar_url.clone();
            account.provider_user_id = provider_user_id.clone();
            account.drive_quota_bytes = input.drive_quota_bytes;
            account.drive_usage_bytes = input.drive_usage_bytes;
            account.app_usage_bytes = input.app_usage_bytes;
            account.token_expires_at = input.token_expires_at;
            account.refresh_token_available = refresh_token
                .as_ref()
                .map(|token| !token.is_empty())
                .unwrap_or(account.refresh_token_available);
            account.last_error = None;
            account.updated_at = now;
            account.id.clone()
        } else {
            let account_id = format!("google-drive-{}", slugify(&email));
            self.store.accounts.push(RemoteSyncAccount {
                id: account_id.clone(),
                provider: RemoteSyncProvider::GoogleDrive,
                status: RemoteSyncAccountStatus::Ready,
                email: email.clone(),
                display_name: resolved_display_name.clone(),
                avatar_url: avatar_url.clone(),
                provider_user_id: provider_user_id.clone(),
                drive_quota_bytes: input.drive_quota_bytes,
                drive_usage_bytes: input.drive_usage_bytes,
                app_usage_bytes: input.app_usage_bytes,
                token_expires_at: input.token_expires_at,
                refresh_token_available: refresh_token
                    .as_ref()
                    .map(|token| !token.is_empty())
                    .unwrap_or(false),
                last_synced_at: None,
                last_error: None,
                created_at: now,
                updated_at: now,
            });
            account_id
        };

        let credentials = self.upsert_google_drive_credentials(
            &account_id,
            Some(access_token),
            refresh_token,
            input.token_expires_at,
            now,
        )?;

        if let Some(account) = self
            .store
            .accounts
            .iter_mut()
            .find(|account| account.id == account_id)
        {
            account.refresh_token_available = !credentials.refresh_token.trim().is_empty();
        }

        if self.store.workspace.id.is_empty() {
            self.store.workspace = Self::default_workspace(self.current_database_path().await, now);
        }

        self.store.workspace.account_id = Some(account_id.clone());
        self.store.workspace.provider = RemoteSyncProvider::GoogleDrive;
        if self.store.workspace.name.trim().is_empty() {
            self.store.workspace.name = resolved_display_name;
        }
        self.store.workspace.updated_at = now;
        self.store.workspace.last_error = None;

        self.store.commit()?;
        self.get_state().await
    }

    pub fn get_google_drive_account_auth(
        &self,
        input: GoogleDriveAccountAuthInput,
    ) -> Result<GoogleDriveAccountAuth, String> {
        let account_id = sanitize_string(&input.account_id);

        let credentials = self
            .load_google_drive_credentials(&account_id)?
            .ok_or("google drive credentials not found".to_string())?;

        Ok(GoogleDriveAccountAuth {
            account_id,
            access_token: credentials.access_token.clone(),
            refresh_token: credentials.refresh_token.clone(),
            token_expires_at: credentials.token_expires_at,
        })
    }

    pub async fn update_google_drive_account(
        &mut self,
        input: GoogleDriveAccountUpdateInput,
    ) -> Result<RemoteSyncState, String> {
        let GoogleDriveAccountUpdateInput {
            account_id,
            email,
            display_name,
            avatar_url,
            provider_user_id,
            drive_quota_bytes,
            drive_usage_bytes,
            app_usage_bytes,
            access_token,
            refresh_token,
            token_expires_at,
            status,
            error,
        } = input;

        let account_id = sanitize_string(&account_id);
        let now = timestamp::now();
        let should_update_credentials =
            access_token.is_some() || refresh_token.is_some() || token_expires_at.is_some();

        let account_index = self
            .store
            .accounts
            .iter()
            .position(|account| account.id == account_id)
            .ok_or("google drive account not found".to_string())?;

        {
            let account = &mut self.store.accounts[account_index];

            if let Some(email) = email {
                let email = sanitize_string(&email).to_lowercase();
                if !email.is_empty() {
                    account.email = email;
                }
            }

            if let Some(display_name) = display_name {
                let display_name = sanitize_string(&display_name);
                if !display_name.is_empty() {
                    account.display_name = display_name;
                }
            }

            if let Some(avatar_url) = avatar_url {
                account.avatar_url = sanitize_optional_string(Some(avatar_url));
            }

            if let Some(provider_user_id) = provider_user_id {
                account.provider_user_id = sanitize_optional_string(Some(provider_user_id));
            }

            account.drive_quota_bytes = drive_quota_bytes.or(account.drive_quota_bytes);
            account.drive_usage_bytes = drive_usage_bytes.or(account.drive_usage_bytes);
            account.app_usage_bytes = app_usage_bytes.or(account.app_usage_bytes);
            account.token_expires_at = token_expires_at.or(account.token_expires_at);
            account.status = status.unwrap_or(RemoteSyncAccountStatus::Ready);
            account.last_error = sanitize_optional_string(error);
            account.updated_at = now;
        }

        if should_update_credentials {
            let credentials = self.upsert_google_drive_credentials(
                &account_id,
                access_token,
                sanitize_optional_string(refresh_token),
                token_expires_at,
                now,
            )?;

            self.store.accounts[account_index].refresh_token_available =
                !credentials.refresh_token.trim().is_empty();
        }

        self.store.commit()?;
        self.get_state().await
    }

    pub async fn disconnect_google_drive_account(
        &mut self,
        input: GoogleDriveDisconnectInput,
    ) -> Result<RemoteSyncState, String> {
        let account_id = sanitize_string(&input.account_id);

        self.store
            .accounts
            .retain(|account| account.id != account_id);
        self.delete_google_drive_credentials(&account_id)?;

        if self.store.workspace.account_id.as_deref() == Some(account_id.as_str()) {
            Self::reset_workspace_to_local(&mut self.store.workspace, timestamp::now());
        }

        self.store.commit()?;
        self.get_state().await
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

    async fn current_database_path(&self) -> PathBuf {
        let settings = self.settings.read().await;

        settings.database_path.clone()
    }

    fn upsert_google_drive_credentials(
        &self,
        account_id: &str,
        access_token: Option<String>,
        refresh_token: Option<String>,
        token_expires_at: Option<i64>,
        updated_at: i64,
    ) -> Result<StoredGoogleDriveCredentials, String> {
        let access_token = sanitize_optional_string(access_token);
        let refresh_token = sanitize_optional_string(refresh_token);
        let mut credentials = self.load_google_drive_credentials(account_id)?.unwrap_or(
            StoredGoogleDriveCredentials {
                account_id: account_id.to_string(),
                access_token: String::new(),
                refresh_token: String::new(),
                token_expires_at: None,
                updated_at,
            },
        );

        if let Some(access_token) = access_token {
            credentials.access_token = access_token;
        }

        if let Some(refresh_token) = refresh_token {
            credentials.refresh_token = refresh_token;
        }

        credentials.token_expires_at = token_expires_at.or(credentials.token_expires_at);
        credentials.updated_at = updated_at;

        if credentials.access_token.trim().is_empty() {
            return Err("google drive access token is required".to_string());
        }

        self.save_google_drive_credentials(&credentials)?;

        Ok(credentials)
    }

    #[cfg(not(test))]
    fn load_google_drive_credentials(
        &self,
        account_id: &str,
    ) -> Result<Option<StoredGoogleDriveCredentials>, String> {
        let entry = self.google_drive_keyring_entry(account_id)?;
        let payload = match entry.get_password() {
            Ok(payload) => payload,
            Err(KeyringError::NoEntry) => return Ok(None),
            Err(error) => return Err(format_keyring_error("read", account_id, error)),
        };

        serde_json::from_str::<StoredGoogleDriveCredentials>(&payload)
            .map(Some)
            .map_err(|error| {
                format!(
                    "failed to decode stored google drive credentials for {account_id}: {error}"
                )
            })
    }

    #[cfg(test)]
    fn load_google_drive_credentials(
        &self,
        account_id: &str,
    ) -> Result<Option<StoredGoogleDriveCredentials>, String> {
        let store = test_google_drive_credentials_store()
            .lock()
            .map_err(|_| "failed to lock test google drive credentials store".to_string())?;

        Ok(store.get(account_id).cloned())
    }

    #[cfg(not(test))]
    fn save_google_drive_credentials(
        &self,
        credentials: &StoredGoogleDriveCredentials,
    ) -> Result<(), String> {
        let entry = self.google_drive_keyring_entry(&credentials.account_id)?;
        let payload = serde_json::to_string(credentials)
            .map_err(|error| format!("failed to encode google drive credentials: {error}"))?;

        entry
            .set_password(&payload)
            .map_err(|error| format_keyring_error("store", &credentials.account_id, error))
    }

    #[cfg(test)]
    fn save_google_drive_credentials(
        &self,
        credentials: &StoredGoogleDriveCredentials,
    ) -> Result<(), String> {
        let mut store = test_google_drive_credentials_store()
            .lock()
            .map_err(|_| "failed to lock test google drive credentials store".to_string())?;

        store.insert(credentials.account_id.clone(), credentials.clone());
        Ok(())
    }

    #[cfg(not(test))]
    fn delete_google_drive_credentials(&self, account_id: &str) -> Result<(), String> {
        let entry = self.google_drive_keyring_entry(account_id)?;

        match entry.delete_credential() {
            Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
            Err(error) => Err(format_keyring_error("delete", account_id, error)),
        }
    }

    #[cfg(test)]
    fn delete_google_drive_credentials(&self, account_id: &str) -> Result<(), String> {
        let mut store = test_google_drive_credentials_store()
            .lock()
            .map_err(|_| "failed to lock test google drive credentials store".to_string())?;

        store.remove(account_id);
        Ok(())
    }

    #[cfg(not(test))]
    fn google_drive_keyring_entry(&self, account_id: &str) -> Result<KeyringEntry, String> {
        KeyringEntry::new(GOOGLE_DRIVE_KEYRING_SERVICE, account_id)
            .map_err(|error| format_keyring_error("create", account_id, error))
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

    fn default_workspace(path: PathBuf, now: i64) -> RemoteSyncWorkspace {
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

    fn reset_workspace_to_local(workspace: &mut RemoteSyncWorkspace, now: i64) {
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

async fn sync_backup_manifest_to_active_workspace(
    app_state: &AppState,
    state: &RemoteSyncState,
) -> Result<(), String> {
    let mut backup = app_state.backup.write().await;
    backup.sync_manifest_workspace(Some(&state.workspace))
}

fn content_hash_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn validate_google_drive_pull_content_hash(
    expected_content_hash: Option<&str>,
    bytes: &[u8],
) -> Result<(), String> {
    let Some(expected_content_hash) = expected_content_hash
        .map(|value| value.trim().to_ascii_lowercase())
        .filter(|value| !value.is_empty())
    else {
        return Ok(());
    };

    let actual_content_hash = content_hash_hex(bytes);
    if actual_content_hash != expected_content_hash {
        return Err("remote snapshot content hash mismatch".to_string());
    }

    Ok(())
}

async fn current_workspace_content_hash(app_state: &AppState) -> Result<String, String> {
    let temp_path = {
        let settings = app_state.settings.read().await;
        settings.backup_dir.join(format!(
            ".workspace-fingerprint-{}-{}.db",
            timestamp::now(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|duration| duration.as_nanos())
                .unwrap_or_default()
        ))
    };

    {
        let mut db = app_state.db.write().await;

        if !db.is_ready().await {
            db.reconnect().await.map_err(|error| {
                format!("database not ready to fingerprint current workspace: {error}")
            })?;
        }

        if !db.is_ready().await {
            return Err("database not ready to fingerprint current workspace".to_string());
        }

        db.create_backup(&temp_path).await?;
    }

    let bytes = fs::read(&temp_path).map_err(|error| error.to_string());
    let _ = fs::remove_file(&temp_path);

    Ok(content_hash_hex(&bytes?))
}

fn google_drive_push_snapshot_source(input: Option<&GoogleDrivePreparePushInput>) -> BackupSource {
    if input.map(|entry| entry.manual).unwrap_or(false) {
        BackupSource::Manual
    } else {
        BackupSource::Autosave
    }
}

#[tauri::command]
pub async fn remote_sync_state_get(
    app_state: tauri::State<'_, AppState>,
) -> Result<RemoteSyncState, String> {
    let state = {
        let mut remote_sync = app_state.remote_sync.write().await;
        remote_sync.get_state().await?
    };

    sync_backup_manifest_to_active_workspace(app_state.inner(), &state).await?;
    Ok(state)
}

#[tauri::command]
pub async fn remote_sync_snapshot_now(
    app_state: tauri::State<'_, AppState>,
) -> Result<RemoteSyncState, String> {
    let workspace = {
        let mut remote_sync = app_state.remote_sync.write().await;
        remote_sync.get_state().await?.workspace
    };
    let entry = {
        let mut backup = app_state.backup.write().await;
        backup.sync_manifest_workspace(Some(&workspace))?;
        backup.create(false).await?
    };

    let mut remote_sync = app_state.remote_sync.write().await;
    remote_sync.record_snapshot_for_workspace(&entry)?;
    let state = remote_sync.get_state().await?;
    drop(remote_sync);

    {
        let mut backup = app_state.backup.write().await;
        let _ = backup.cleanup_retained().await;
    }

    Ok(state)
}

#[tauri::command]
pub async fn remote_sync_autosave_now(
    app_state: tauri::State<'_, AppState>,
) -> Result<RemoteSyncState, String> {
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

    let mut remote_sync = app_state.remote_sync.write().await;
    remote_sync.record_snapshot_for_workspace(&entry)?;
    let state = remote_sync.get_state().await?;
    drop(remote_sync);

    {
        let mut backup = app_state.backup.write().await;
        let _ = backup.cleanup_retained().await;
    }

    Ok(state)
}

#[tauri::command]
pub async fn remote_sync_google_drive_config_get(
    app_state: tauri::State<'_, AppState>,
) -> Result<GoogleDriveConfig, String> {
    let remote_sync = app_state.remote_sync.read().await;
    Ok(remote_sync.get_google_drive_config())
}

#[tauri::command]
pub async fn remote_sync_google_drive_begin_link(
    app_state: tauri::State<'_, AppState>,
    input: GoogleDriveLinkSessionCreateInput,
) -> Result<GoogleDriveLinkSessionStart, String> {
    let mut remote_sync = app_state.remote_sync.write().await;
    remote_sync.begin_google_drive_link(input)
}

#[tauri::command]
pub async fn remote_sync_google_drive_get_link_result(
    app_state: tauri::State<'_, AppState>,
    input: GoogleDriveLinkSessionLookupInput,
) -> Result<GoogleDriveLinkSessionResult, String> {
    let remote_sync = app_state.remote_sync.read().await;
    remote_sync.get_google_drive_link_result(input)
}

#[tauri::command]
pub async fn remote_sync_google_drive_cancel_link(
    app_state: tauri::State<'_, AppState>,
    input: GoogleDriveLinkSessionLookupInput,
) -> Result<(), String> {
    let mut remote_sync = app_state.remote_sync.write().await;
    remote_sync.cancel_google_drive_link(input)
}

#[tauri::command]
pub async fn remote_sync_google_drive_complete_link(
    app_state: tauri::State<'_, AppState>,
    input: GoogleDriveLinkCompleteInput,
) -> Result<RemoteSyncState, String> {
    let state = {
        let mut remote_sync = app_state.remote_sync.write().await;
        remote_sync.complete_google_drive_link(input).await?
    };

    sync_backup_manifest_to_active_workspace(app_state.inner(), &state).await?;
    Ok(state)
}

#[tauri::command]
pub async fn remote_sync_google_drive_get_account_auth(
    app_state: tauri::State<'_, AppState>,
    input: GoogleDriveAccountAuthInput,
) -> Result<GoogleDriveAccountAuth, String> {
    let remote_sync = app_state.remote_sync.read().await;
    remote_sync.get_google_drive_account_auth(input)
}

#[tauri::command]
pub async fn remote_sync_google_drive_update_account(
    app_state: tauri::State<'_, AppState>,
    input: GoogleDriveAccountUpdateInput,
) -> Result<RemoteSyncState, String> {
    let mut remote_sync = app_state.remote_sync.write().await;
    remote_sync.update_google_drive_account(input).await
}

#[tauri::command]
pub async fn remote_sync_google_drive_disconnect_account(
    app_state: tauri::State<'_, AppState>,
    input: GoogleDriveDisconnectInput,
) -> Result<RemoteSyncState, String> {
    let state = {
        let mut remote_sync = app_state.remote_sync.write().await;
        remote_sync.disconnect_google_drive_account(input).await?
    };

    sync_backup_manifest_to_active_workspace(app_state.inner(), &state).await?;
    Ok(state)
}

#[tauri::command]
pub async fn remote_sync_google_drive_acquire_lock(
    app_state: tauri::State<'_, AppState>,
    input: GoogleDriveSyncLockAcquireInput,
) -> Result<GoogleDriveSyncLockLease, String> {
    let mut remote_sync = app_state.remote_sync.write().await;
    remote_sync.acquire_google_drive_sync_lock(input)
}

#[tauri::command]
pub async fn remote_sync_google_drive_release_lock(
    app_state: tauri::State<'_, AppState>,
    input: GoogleDriveSyncLockReleaseInput,
) -> Result<(), String> {
    let mut remote_sync = app_state.remote_sync.write().await;
    remote_sync.release_google_drive_sync_lock(input);
    Ok(())
}

#[tauri::command]
pub async fn remote_sync_google_drive_get_local_fingerprint(
    app_state: tauri::State<'_, AppState>,
) -> Result<GoogleDriveLocalFingerprint, String> {
    Ok(GoogleDriveLocalFingerprint {
        content_hash: current_workspace_content_hash(app_state.inner()).await?,
    })
}

#[tauri::command]
pub async fn remote_sync_google_drive_prepare_push(
    app_state: tauri::State<'_, AppState>,
    input: Option<GoogleDrivePreparePushInput>,
) -> Result<GoogleDrivePreparedPush, String> {
    let (workspace, account_id) = {
        let mut remote_sync = app_state.remote_sync.write().await;
        let workspace = remote_sync.get_state().await?.workspace;

        if workspace.provider != RemoteSyncProvider::GoogleDrive {
            return Err("workspace is not linked to Google Drive".to_string());
        }

        let account_id = workspace
            .account_id
            .clone()
            .ok_or("workspace is missing a linked Google Drive account".to_string())?;

        (workspace, account_id)
    };

    let entry = {
        let mut backup = app_state.backup.write().await;
        backup.sync_manifest_workspace(Some(&workspace))?;
        if google_drive_push_snapshot_source(input.as_ref()) == BackupSource::Manual {
            backup.create(false).await?
        } else {
            backup
                .create_managed_retaining_previous(BackupSource::Autosave, None, false)
                .await?
        }
    };

    let (contents_base64, content_hash, app_version) = {
        let settings = app_state.settings.read().await;
        let path = settings.backup_dir.join(&entry.filename);
        let bytes = fs::read(&path).map_err(|error| error.to_string())?;
        (
            BASE64.encode(&bytes),
            content_hash_hex(&bytes),
            settings.version.clone(),
        )
    };

    let mut remote_sync = app_state.remote_sync.write().await;
    remote_sync.record_snapshot_for_workspace(&entry)?;

    Ok(GoogleDrivePreparedPush {
        workspace_id: workspace.id,
        account_id,
        filename: entry.filename,
        created_at: entry.created_at,
        source: entry.source,
        app_version,
        contents_base64,
        content_hash,
    })
}

#[cfg(test)]
mod google_drive_prepare_push_tests {
    use super::{
        BackupSource, GoogleDrivePreparePushInput, content_hash_hex,
        google_drive_push_snapshot_source, validate_google_drive_pull_content_hash,
    };

    #[test]
    fn manual_prepare_push_uses_manual_source() {
        assert_eq!(
            google_drive_push_snapshot_source(Some(&GoogleDrivePreparePushInput { manual: true })),
            BackupSource::Manual
        );
    }

    #[test]
    fn automatic_prepare_push_defaults_to_autosave() {
        assert_eq!(
            google_drive_push_snapshot_source(None),
            BackupSource::Autosave
        );
        assert_eq!(
            google_drive_push_snapshot_source(Some(&GoogleDrivePreparePushInput { manual: false })),
            BackupSource::Autosave
        );
    }

    #[test]
    fn content_hash_hex_is_stable() {
        assert_eq!(
            content_hash_hex(b"hello"),
            "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
        );
    }

    #[test]
    fn pull_content_hash_validation_accepts_matching_hash() {
        assert!(
            validate_google_drive_pull_content_hash(
                Some("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"),
                b"hello"
            )
            .is_ok()
        );
    }

    #[test]
    fn pull_content_hash_validation_rejects_mismatched_hash() {
        assert!(
            validate_google_drive_pull_content_hash(
                Some("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
                b"hello"
            )
            .is_err()
        );
    }
}

#[tauri::command]
pub async fn remote_sync_google_drive_mark_synced(
    app_state: tauri::State<'_, AppState>,
    input: GoogleDriveSyncCompleteInput,
) -> Result<RemoteSyncState, String> {
    {
        let mut remote_sync = app_state.remote_sync.write().await;
        remote_sync.mark_google_drive_synced(input)?;
    }

    {
        let mut backup = app_state.backup.write().await;
        let _ = backup.cleanup_retained().await;
    }

    let state = {
        let mut remote_sync = app_state.remote_sync.write().await;
        remote_sync.get_state().await?
    };

    sync_backup_manifest_to_active_workspace(app_state.inner(), &state).await?;
    Ok(state)
}

#[tauri::command]
pub async fn remote_sync_google_drive_apply_pull(
    app_state: tauri::State<'_, AppState>,
    input: GoogleDriveApplyPullInput,
) -> Result<RemoteSyncState, String> {
    let workspace_id = sanitize_string(&input.workspace_id);
    let account_id = sanitize_string(&input.account_id);
    let filename = sanitize_filename(&input.filename);

    if workspace_id.is_empty() || account_id.is_empty() {
        return Err("workspace and account are required for pull".to_string());
    }

    let (backup_dir, current_version) = {
        let settings = app_state.settings.read().await;
        (settings.backup_dir.clone(), settings.version.clone())
    };

    if sanitize_string(&input.app_version) != current_version {
        return Err("remote snapshot app version does not match current app version".to_string());
    }

    let workspace = {
        let mut remote_sync = app_state.remote_sync.write().await;
        Some(remote_sync.get_state().await?.workspace)
    };

    {
        let mut backup = app_state.backup.write().await;
        backup.sync_manifest_workspace(workspace.as_ref())?;
        let _ = backup
            .create_managed(
                BackupSource::Recovery,
                Some(BackupRecoveryKind::Sync),
                false,
            )
            .await?;
    }

    let temp_filename = if filename.is_empty() {
        format!("remote-sync-{}.db", timestamp::now())
    } else {
        format!("remote-sync-{}-{}", timestamp::now(), filename)
    };
    let temp_path = backup_dir.join(temp_filename);
    let expected_content_hash = sanitize_optional_string(input.content_hash);
    let bytes = BASE64
        .decode(input.contents_base64.as_bytes())
        .map_err(|error| error.to_string())?;

    validate_google_drive_pull_content_hash(expected_content_hash.as_deref(), &bytes)?;

    fs::write(&temp_path, bytes).map_err(|error| error.to_string())?;

    let restore_result = {
        let mut db = app_state.db.write().await;
        db.restore_backup(&temp_path).await
    };

    let _ = fs::remove_file(&temp_path);
    restore_result?;

    let pulled_entry = {
        let mut backup = app_state.backup.write().await;
        backup.sync_manifest_workspace(workspace.as_ref())?;
        backup
            .create_managed_retaining_previous(BackupSource::Autosave, None, false)
            .await?
    };

    let state = {
        let mut remote_sync = app_state.remote_sync.write().await;
        remote_sync.record_snapshot_for_workspace(&pulled_entry)?;
        remote_sync.mark_google_drive_synced(GoogleDriveSyncCompleteInput {
            workspace_id,
            workspace_name: input.workspace_name,
            account_id,
            remote_folder_id: input.remote_folder_id,
            remote_manifest_file_id: input.remote_manifest_file_id,
            remote_head_file_id: input.remote_head_file_id,
            remote_head_revision: input.remote_head_revision,
            remote_updated_at: input.remote_updated_at,
            drive_quota_bytes: input.drive_quota_bytes,
            drive_usage_bytes: input.drive_usage_bytes,
            app_usage_bytes: input.app_usage_bytes,
        })?;
        remote_sync.get_state().await?
    };

    {
        let mut backup = app_state.backup.write().await;
        let _ = backup.cleanup_retained().await;
    }

    sync_backup_manifest_to_active_workspace(app_state.inner(), &state).await?;
    Ok(state)
}

fn google_oauth_client_id() -> Option<String> {
    std::env::var("GOOGLE_OAUTH_CLIENT_ID")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn google_oauth_client_secret() -> Option<String> {
    std::env::var("GOOGLE_OAUTH_CLIENT_SECRET")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn google_drive_scopes() -> Vec<String> {
    vec![
        GOOGLE_DRIVE_SCOPE_DRIVE_FILE.to_string(),
        GOOGLE_DRIVE_SCOPE_DRIVE_METADATA.to_string(),
        GOOGLE_DRIVE_SCOPE_EMAIL.to_string(),
        GOOGLE_DRIVE_SCOPE_PROFILE.to_string(),
    ]
}

#[cfg(not(test))]
fn format_keyring_error(action: &str, account_id: &str, error: KeyringError) -> String {
    format!("failed to {action} google drive credentials for {account_id}: {error}")
}

#[cfg(test)]
fn test_google_drive_credentials_store()
-> &'static Mutex<HashMap<String, StoredGoogleDriveCredentials>> {
    use std::sync::OnceLock;

    static STORE: OnceLock<Mutex<HashMap<String, StoredGoogleDriveCredentials>>> = OnceLock::new();

    STORE.get_or_init(|| Mutex::new(HashMap::new()))
}

#[cfg(test)]
fn clear_test_google_drive_credentials_store() {
    if let Ok(mut store) = test_google_drive_credentials_store().lock() {
        store.clear();
    }
}

fn sanitize_string(value: &str) -> String {
    value.trim().to_string()
}

fn sanitize_optional_string(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn sanitize_filename(value: &str) -> String {
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

fn slugify(value: &str) -> String {
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

fn parse_http_request_path(request: &str) -> Option<&str> {
    let first_line = request.lines().next()?;
    let mut segments = first_line.split_whitespace();
    let method = segments.next()?;
    let path = segments.next()?;

    if method.eq_ignore_ascii_case("GET") {
        Some(path)
    } else {
        None
    }
}

fn parse_query_map(path: &str) -> HashMap<String, String> {
    let query = path
        .split_once('?')
        .map(|(_, query)| query)
        .unwrap_or_default();
    let mut map = HashMap::new();

    for segment in query.split('&').filter(|segment| !segment.is_empty()) {
        let (key, value) = segment.split_once('=').unwrap_or((segment, ""));
        map.insert(percent_decode(key), percent_decode(value));
    }

    map
}

fn percent_decode(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut index = 0;
    let mut output = Vec::with_capacity(bytes.len());

    while index < bytes.len() {
        match bytes[index] {
            b'+' => {
                output.push(b' ');
                index += 1;
            }
            b'%' if index + 2 < bytes.len() => {
                let high = (bytes[index + 1] as char).to_digit(16);
                let low = (bytes[index + 2] as char).to_digit(16);

                if let (Some(high), Some(low)) = (high, low) {
                    output.push(((high << 4) | low) as u8);
                    index += 3;
                } else {
                    output.push(bytes[index]);
                    index += 1;
                }
            }
            byte => {
                output.push(byte);
                index += 1;
            }
        }
    }

    String::from_utf8_lossy(&output).to_string()
}

fn handle_google_drive_callback(
    listener: TcpListener,
    auth_sessions: Arc<Mutex<HashMap<String, GoogleDriveLinkSession>>>,
    session_id: &str,
) -> Result<(), String> {
    listener
        .set_nonblocking(true)
        .map_err(|error| error.to_string())?;

    let started_at = std::time::Instant::now();
    let (mut stream, _) = loop {
        match listener.accept() {
            Ok(connection) => break connection,
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                let status = {
                    let sessions = auth_sessions
                        .lock()
                        .map_err(|_| "failed to lock oauth sessions".to_string())?;

                    sessions
                        .get(session_id)
                        .map(|session| session.status.clone())
                };

                match status {
                    Some(GoogleDriveLinkSessionStatus::Pending) => {
                        if started_at.elapsed() >= GOOGLE_DRIVE_LINK_TIMEOUT {
                            return Err("GOOGLE_DRIVE_LINK_TIMED_OUT".to_string());
                        }

                        std::thread::sleep(GOOGLE_DRIVE_LINK_POLL_INTERVAL);
                    }
                    Some(_) | None => return Ok(()),
                }
            }
            Err(error) => return Err(error.to_string()),
        }
    };

    let _ = stream.set_read_timeout(Some(Duration::from_secs(30)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(30)));

    let mut buffer = [0_u8; 16 * 1024];
    let count = stream
        .read(&mut buffer)
        .map_err(|error| error.to_string())?;
    let request = String::from_utf8_lossy(&buffer[..count]).to_string();
    let path = parse_http_request_path(&request)
        .ok_or("failed to parse oauth callback request".to_string())?;
    let query = parse_query_map(path);

    let mut html_message =
        "Google Drive account linked. You can close this window now.".to_string();

    {
        let mut sessions = auth_sessions
            .lock()
            .map_err(|_| "failed to lock oauth sessions".to_string())?;

        let session = sessions
            .get_mut(session_id)
            .ok_or("oauth session not found".to_string())?;

        if let Some(error) = query.get("error") {
            session.status = GoogleDriveLinkSessionStatus::Error;
            session.error = Some(error.clone());
            html_message =
                format!("Google Drive linking failed: {error}. You can close this window.");
        } else {
            let returned_state = query.get("state").cloned();
            let authorization_code = query.get("code").cloned();

            if returned_state.as_deref() != Some(session.expected_state.as_str()) {
                session.status = GoogleDriveLinkSessionStatus::Error;
                session.error =
                    Some("oauth callback state did not match the active session".to_string());
                html_message = "Google Drive linking failed because the callback state did not match the app session. You can close this window.".to_string();
            } else if authorization_code
                .as_deref()
                .unwrap_or_default()
                .trim()
                .is_empty()
            {
                session.status = GoogleDriveLinkSessionStatus::Error;
                session.error =
                    Some("oauth callback did not include an authorization code".to_string());
                html_message = "Google Drive linking failed because the callback did not include an authorization code. You can close this window.".to_string();
            } else {
                session.status = GoogleDriveLinkSessionStatus::Completed;
                session.authorization_code = authorization_code;
                session.state = returned_state;
                session.error = None;
            }
        }
    }

    let body = format!(
        "<!doctype html><html><head><meta charset=\"utf-8\"><title>Rentable</title></head><body style=\"font-family: system-ui, sans-serif; padding: 32px;\"><h2>Rentable</h2><p>{html_message}</p></body></html>"
    );
    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.len(),
        body
    );

    stream
        .write_all(response.as_bytes())
        .map_err(|error| error.to_string())?;

    Ok(())
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
    use super::{
        GoogleDriveLinkCompleteInput, GoogleDriveLinkSession, GoogleDriveLinkSessionLookupInput,
        GoogleDriveLinkSessionStatus, RemoteSync, RemoteSyncProvider,
        clear_test_google_drive_credentials_store, percent_decode, slugify,
    };
    use crate::{persisted::Persisted, settings::Settings};
    use std::{path::PathBuf, sync::Arc};
    use tokio::{runtime::Runtime, sync::RwLock};

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

    #[test]
    fn completes_google_drive_link_on_workspace() {
        clear_test_google_drive_credentials_store();

        Runtime::new()
            .expect("failed to create tokio runtime")
            .block_on(async {
                let root = unique_dir("remote-sync-google-drive-link");
                std::fs::create_dir_all(&root).expect("failed to create test root");

                let settings_path = root.join(Settings::FILENAME);
                let mut settings =
                    Persisted::<Settings>::load(settings_path).expect("failed to load settings");
                settings.database_path = root.join("active.db");
                settings.commit().expect("failed to commit settings");

                let settings = Arc::new(RwLock::new(settings));
                let mut remote_sync = RemoteSync::new(settings, root.join(RemoteSync::FILENAME))
                    .await
                    .expect("failed to initialize remote sync");
                let state = remote_sync
                    .complete_google_drive_link(GoogleDriveLinkCompleteInput {
                        email: "person@example.com".to_string(),
                        display_name: "Person Example".to_string(),
                        avatar_url: Some("https://example.com/avatar.png".to_string()),
                        provider_user_id: Some("provider-user-1".to_string()),
                        drive_quota_bytes: Some(1000),
                        drive_usage_bytes: Some(250),
                        app_usage_bytes: Some(125),
                        access_token: "access-token".to_string(),
                        refresh_token: Some("refresh-token".to_string()),
                        token_expires_at: Some(999),
                    })
                    .await
                    .expect("failed to complete google drive link");

                assert_eq!(state.workspace.provider, RemoteSyncProvider::GoogleDrive);
                assert_eq!(
                    state.workspace.account_id.as_deref(),
                    Some("google-drive-person-example-com")
                );
                assert_eq!(state.accounts.len(), 1);

                let _ = std::fs::remove_dir_all(&root);
            });
    }

    #[test]
    fn cancels_google_drive_link_session_without_erroring() {
        clear_test_google_drive_credentials_store();

        Runtime::new()
            .expect("failed to create tokio runtime")
            .block_on(async {
                let root = unique_dir("remote-sync-google-drive-cancel-link");
                std::fs::create_dir_all(&root).expect("failed to create test root");

                let settings_path = root.join(Settings::FILENAME);
                let mut settings =
                    Persisted::<Settings>::load(settings_path).expect("failed to load settings");
                settings.database_path = root.join("active.db");
                settings.commit().expect("failed to commit settings");

                let settings = Arc::new(RwLock::new(settings));
                let mut remote_sync = RemoteSync::new(settings, root.join(RemoteSync::FILENAME))
                    .await
                    .expect("failed to initialize remote sync");

                remote_sync
                    .auth_sessions
                    .lock()
                    .expect("failed to lock auth sessions")
                    .insert(
                        "session-1".to_string(),
                        GoogleDriveLinkSession {
                            session_id: "session-1".to_string(),
                            expected_state: "state-1".to_string(),
                            status: GoogleDriveLinkSessionStatus::Pending,
                            authorization_code: Some("code".to_string()),
                            state: Some("state-1".to_string()),
                            error: Some("error".to_string()),
                        },
                    );

                remote_sync
                    .cancel_google_drive_link(GoogleDriveLinkSessionLookupInput {
                        session_id: "session-1".to_string(),
                    })
                    .expect("failed to cancel google drive link session");

                let result = remote_sync
                    .get_google_drive_link_result(GoogleDriveLinkSessionLookupInput {
                        session_id: "session-1".to_string(),
                    })
                    .expect("failed to get cancelled link session result");

                assert_eq!(result.status, GoogleDriveLinkSessionStatus::Cancelled);
                assert!(result.authorization_code.is_none());
                assert!(result.state.is_none());
                assert!(result.error.is_none());

                let _ = std::fs::remove_dir_all(&root);
            });
    }

    #[test]
    fn slugify_and_percent_decode_are_stable() {
        assert_eq!(slugify("Person Example+1"), "person-example-1");
        assert_eq!(percent_decode("hello%20world%2Btest"), "hello world+test");
    }
}
