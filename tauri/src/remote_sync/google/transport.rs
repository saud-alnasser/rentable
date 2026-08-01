//! the transfer surface: push, pull, and fingerprint shapes. The Rust Drive HTTP
//! transport (#116) and the ported Drive operations (#117) land here.

use std::collections::HashMap;

use chrono::DateTime;
use serde::{Deserialize, Serialize};

use crate::backup::BackupSource;

pub(crate) const GOOGLE_DRIVE_API_BASE_URL: &str = "https://www.googleapis.com/drive/v3";

/// the app-property keys Drive carries our own metadata under. Drive itself
/// imposes no schema on `appProperties`, so these strings are the whole
/// contract between a snapshot we wrote and a snapshot we later read back.
pub(crate) const SNAPSHOT_SOURCE_PROPERTY: &str = "rentableSource";
pub(crate) const SNAPSHOT_CREATED_AT_PROPERTY: &str = "rentableCreatedAt";
pub(crate) const SNAPSHOT_APP_VERSION_PROPERTY: &str = "rentableAppVersion";
pub(crate) const SNAPSHOT_CONTENT_HASH_PROPERTY: &str = "rentableContentHash";
pub(crate) const FILE_TYPE_PROPERTY: &str = "rentableType";

/// a file as Drive describes it. Every field beyond the identity pair is
/// optional because Drive returns only what the query asked for.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DriveFile {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub modified_time: Option<String>,
    #[serde(default)]
    pub version: Option<String>,
    #[serde(default)]
    pub size: Option<String>,
    #[serde(default)]
    pub md5_checksum: Option<String>,
    #[serde(default)]
    pub parents: Option<Vec<String>>,
    #[serde(default)]
    pub app_properties: Option<HashMap<String, String>>,
}

/// why a snapshot on the remote was taken. Narrower than [`BackupSource`] on
/// purpose: a recovery snapshot is local-only and never reaches Drive, so the
/// remote vocabulary cannot express one.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum GoogleDriveSnapshotSource {
    Manual,
    Autosave,
}

impl GoogleDriveSnapshotSource {
    /// read a source from the wire spelling, accepting the surrounding
    /// whitespace and casing a hand-edited manifest may carry.
    pub(crate) fn parse(value: &str) -> Option<Self> {
        match value.trim().to_ascii_lowercase().as_str() {
            "manual" => Some(Self::Manual),
            "autosave" => Some(Self::Autosave),
            _ => None,
        }
    }
}

impl DriveFile {
    pub(crate) fn app_property(&self, key: &str) -> Option<&str> {
        self.app_properties
            .as_ref()
            .and_then(|properties| properties.get(key))
            .map(String::as_str)
    }
}

/// a byte count as Drive spells it. Drive sends sizes as decimal strings, and
/// anything that is not one tells us nothing about the file's size.
pub(crate) fn parse_drive_number(value: Option<&str>) -> Option<i64> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .and_then(|value| value.parse::<i64>().ok())
}

/// an RFC 3339 instant as epoch milliseconds, which is how every timestamp is
/// carried inside the application.
pub(crate) fn parse_drive_timestamp(value: Option<&str>) -> Option<i64> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .and_then(|value| DateTime::parse_from_rfc3339(value).ok())
        .map(|timestamp| timestamp.timestamp_millis())
}

/// when the snapshot was taken, according to the metadata we wrote with it.
/// A non-positive value is treated as absent: it cannot be a real capture time
/// and is what an unset or truncated property parses to.
pub(crate) fn parse_drive_snapshot_created_at(file: &DriveFile) -> Option<i64> {
    file.app_property(SNAPSHOT_CREATED_AT_PROPERTY)
        .map(str::trim)
        .and_then(|value| value.parse::<i64>().ok())
        .filter(|created_at| *created_at > 0)
}

/// the snapshot's source, or `None` where the file does not declare one this
/// application recognises.
pub(crate) fn try_parse_drive_snapshot_source(
    file: &DriveFile,
) -> Option<GoogleDriveSnapshotSource> {
    file.app_property(SNAPSHOT_SOURCE_PROPERTY)
        .and_then(GoogleDriveSnapshotSource::parse)
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
