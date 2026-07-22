use std::{
    collections::HashMap,
    io::{Read, Write},
    net::TcpListener,
    sync::{Arc, Mutex},
    time::Duration,
};

use serde::{Deserialize, Serialize};

use crate::timestamp;

use super::google::auth::{google_oauth_client_id, parse_http_request_path, parse_query_map};
use super::store::{
    RemoteSync, RemoteSyncAccount, RemoteSyncAccountStatus, RemoteSyncProvider, RemoteSyncState,
    sanitize_optional_string, sanitize_string, slugify,
};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum GoogleDriveLinkSessionStatus {
    #[default]
    Pending,
    Completed,
    Error,
    Cancelled,
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

#[derive(Clone, Debug)]
pub(super) struct GoogleDriveLinkSession {
    pub(super) session_id: String,
    pub(super) expected_state: String,
    pub(super) status: GoogleDriveLinkSessionStatus,
    pub(super) authorization_code: Option<String>,
    pub(super) state: Option<String>,
    pub(super) error: Option<String>,
}

const GOOGLE_DRIVE_LINK_POLL_INTERVAL: Duration = Duration::from_millis(200);
const GOOGLE_DRIVE_LINK_TIMEOUT: Duration = Duration::from_secs(5 * 60);

impl RemoteSync {
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
