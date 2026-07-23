//! OAuth, credentials, and the link-callback parsing. The OAuth and link state-machine
//! port (#115) lands here.

use std::collections::HashMap;

#[cfg(not(test))]
use keyring::{Entry as KeyringEntry, Error as KeyringError};
use serde::{Deserialize, Serialize};

#[cfg(test)]
use std::sync::Mutex;

use super::super::store::{RemoteSync, StoredGoogleDriveCredentials, sanitize_optional_string};
use super::transport::GOOGLE_DRIVE_API_BASE_URL;

const GOOGLE_DRIVE_AUTHORIZE_ENDPOINT: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_DRIVE_TOKEN_ENDPOINT: &str = "https://oauth2.googleapis.com/token";
const GOOGLE_DRIVE_SCOPE_DRIVE_FILE: &str = "https://www.googleapis.com/auth/drive.file";
const GOOGLE_DRIVE_SCOPE_DRIVE_METADATA: &str =
    "https://www.googleapis.com/auth/drive.metadata.readonly";
const GOOGLE_DRIVE_SCOPE_EMAIL: &str = "email";
const GOOGLE_DRIVE_SCOPE_PROFILE: &str = "profile";
#[cfg(not(test))]
const GOOGLE_DRIVE_KEYRING_SERVICE: &str = concat!(env!("CARGO_PKG_NAME"), ".google-drive");

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

impl RemoteSync {
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

    pub(crate) fn upsert_google_drive_credentials(
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
    pub(crate) fn load_google_drive_credentials(
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
    pub(crate) fn load_google_drive_credentials(
        &self,
        account_id: &str,
    ) -> Result<Option<StoredGoogleDriveCredentials>, String> {
        let store = test_google_drive_credentials_store()
            .lock()
            .map_err(|_| "failed to lock test google drive credentials store".to_string())?;

        Ok(store.get(account_id).cloned())
    }

    #[cfg(not(test))]
    pub(crate) fn save_google_drive_credentials(
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
    pub(crate) fn save_google_drive_credentials(
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
    pub(crate) fn delete_google_drive_credentials(&self, account_id: &str) -> Result<(), String> {
        let entry = self.google_drive_keyring_entry(account_id)?;

        match entry.delete_credential() {
            Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
            Err(error) => Err(format_keyring_error("delete", account_id, error)),
        }
    }

    #[cfg(test)]
    pub(crate) fn delete_google_drive_credentials(&self, account_id: &str) -> Result<(), String> {
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
}

pub(crate) fn google_oauth_client_id() -> Option<String> {
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
pub(crate) fn clear_test_google_drive_credentials_store() {
    if let Ok(mut store) = test_google_drive_credentials_store().lock() {
        store.clear();
    }
}

pub(crate) fn parse_http_request_path(request: &str) -> Option<&str> {
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

pub(crate) fn parse_query_map(path: &str) -> HashMap<String, String> {
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

pub(crate) fn percent_decode(value: &str) -> String {
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
