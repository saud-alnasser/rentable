//! what Drive says about a file, so that asking it does not reach through the
//! module that issues requests. A caller here wants to know what a file is, not
//! how one was fetched — the record, the keys this application carries its own
//! metadata under, and the decoders reading Drive's spellings back into values
//! are that one question. How a request is issued is [`super::transport`]'s.

use std::collections::HashMap;

use chrono::DateTime;
use serde::{Deserialize, Serialize};

/// the app-property keys Drive carries our own metadata under. Drive itself
/// imposes no schema on `appProperties`, so these strings are the whole
/// contract between a snapshot we wrote and a snapshot we later read back.
pub(crate) const SNAPSHOT_SOURCE_PROPERTY: &str = "rentableSource";
pub(crate) const SNAPSHOT_CREATED_AT_PROPERTY: &str = "rentableCreatedAt";
pub(crate) const SNAPSHOT_APP_VERSION_PROPERTY: &str = "rentableAppVersion";
pub(crate) const SNAPSHOT_CONTENT_HASH_PROPERTY: &str = "rentableContentHash";
pub(crate) const FILE_TYPE_PROPERTY: &str = "rentableType";
pub(crate) const WORKSPACE_ID_PROPERTY: &str = "rentableWorkspaceId";
/// which installation wrote a snapshot. Nothing reads it back; it is written so
/// that a user looking at two snapshots in Drive's own interface can tell which
/// machine each came from.
pub(crate) const DEVICE_ID_PROPERTY: &str = "rentableDeviceId";

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

/// why a snapshot on the remote was taken. Narrower than
/// [`crate::backup::BackupSource`] on purpose: a recovery snapshot is local-only
/// and never reaches Drive, so the remote vocabulary cannot express one.
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

    /// the wire spelling, which is what [`Self::parse`] reads back.
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::Manual => "manual",
            Self::Autosave => "autosave",
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

    /// which workspace this file says it belongs to.
    ///
    /// The remote's own answer, which is not always this machine's: a folder
    /// found by falling back to the most recently touched one was written by a
    /// workspace that may have been identified differently.
    pub(crate) fn declared_workspace_id(&self) -> Option<&str> {
        self.app_property(WORKSPACE_ID_PROPERTY)
            .map(str::trim)
            .filter(|workspace_id| !workspace_id.is_empty())
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

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use super::{
        DriveFile, GoogleDriveSnapshotSource, parse_drive_number, parse_drive_snapshot_created_at,
        parse_drive_timestamp, try_parse_drive_snapshot_source,
    };
    fn drive_file(id: &str) -> DriveFile {
        DriveFile {
            id: id.to_string(),
            name: format!("snapshot-{id}.db"),
            modified_time: None,
            version: None,
            size: None,
            md5_checksum: None,
            parents: None,
            app_properties: None,
        }
    }

    fn with_properties(mut file: DriveFile, properties: &[(&str, &str)]) -> DriveFile {
        file.app_properties = Some(
            properties
                .iter()
                .map(|(key, value)| (key.to_string(), value.to_string()))
                .collect::<HashMap<_, _>>(),
        );

        file
    }

    fn snapshot(id: &str, source: &str, created_at: i64) -> DriveFile {
        with_properties(
            drive_file(id),
            &[
                ("rentableSource", source),
                ("rentableCreatedAt", &created_at.to_string()),
            ],
        )
    }
    #[test]
    fn drive_numbers_parse_only_when_they_are_whole_byte_counts() {
        assert_eq!(parse_drive_number(Some("2048")), Some(2048));
        assert_eq!(parse_drive_number(Some("  2048  ")), Some(2048));
        assert_eq!(parse_drive_number(Some("")), None);
        assert_eq!(parse_drive_number(Some("not a number")), None);
        assert_eq!(parse_drive_number(None), None);
    }

    #[test]
    fn drive_timestamps_parse_from_rfc3339() {
        assert_eq!(
            parse_drive_timestamp(Some("2024-01-15T10:30:00.000Z")),
            Some(1_705_314_600_000)
        );
        assert_eq!(
            parse_drive_timestamp(Some("2024-01-15T13:30:00.000+03:00")),
            Some(1_705_314_600_000)
        );
        assert_eq!(parse_drive_timestamp(Some("15 January 2024")), None);
        assert_eq!(parse_drive_timestamp(Some("")), None);
        assert_eq!(parse_drive_timestamp(None), None);
    }

    #[test]
    fn snapshot_created_at_comes_from_the_app_property_and_must_be_positive() {
        assert_eq!(
            parse_drive_snapshot_created_at(&snapshot("a", "manual", 1_700_000_000_000)),
            Some(1_700_000_000_000)
        );
        assert_eq!(
            parse_drive_snapshot_created_at(&with_properties(
                drive_file("a"),
                &[("rentableCreatedAt", "0")]
            )),
            None
        );
        assert_eq!(
            parse_drive_snapshot_created_at(&with_properties(
                drive_file("a"),
                &[("rentableCreatedAt", "-5")]
            )),
            None
        );
        assert_eq!(parse_drive_snapshot_created_at(&drive_file("a")), None);
    }

    #[test]
    fn snapshot_sources_are_read_case_insensitively_and_otherwise_rejected() {
        assert_eq!(
            try_parse_drive_snapshot_source(&with_properties(
                drive_file("a"),
                &[("rentableSource", "  MANUAL ")]
            )),
            Some(GoogleDriveSnapshotSource::Manual)
        );
        assert_eq!(
            try_parse_drive_snapshot_source(&with_properties(
                drive_file("a"),
                &[("rentableSource", "autosave")]
            )),
            Some(GoogleDriveSnapshotSource::Autosave)
        );
        assert_eq!(
            try_parse_drive_snapshot_source(&with_properties(
                drive_file("a"),
                &[("rentableSource", "recovery")]
            )),
            None
        );
        assert_eq!(try_parse_drive_snapshot_source(&drive_file("a")), None);
    }
}
