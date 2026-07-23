//! the transfer surface: push, pull, and fingerprint shapes. The Rust Drive HTTP
//! transport (#116) and the ported Drive operations (#117) land here.

use serde::{Deserialize, Serialize};

use crate::backup::BackupSource;

pub(crate) const GOOGLE_DRIVE_API_BASE_URL: &str = "https://www.googleapis.com/drive/v3";

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
