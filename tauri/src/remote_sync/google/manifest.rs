//! remote manifest concerns. The manifest-reconciliation port (#114) lands here.
//!
//! The manifest is the remote's index: which snapshots exist, and which one is
//! current. It is a file on someone else's storage, so nothing read out of it
//! is trusted until it has been through [`normalize_google_drive_manifest`].

use std::cmp::Ordering;

use serde::{Deserialize, Serialize};

use crate::error::Error;

use super::conflict::normalize_content_hash;
use super::transport::{
    DriveFile, FILE_TYPE_PROPERTY, GoogleDriveSnapshotSource, SNAPSHOT_APP_VERSION_PROPERTY,
    SNAPSHOT_CONTENT_HASH_PROPERTY, parse_drive_number, parse_drive_snapshot_created_at,
    parse_drive_timestamp, try_parse_drive_snapshot_source,
};

/// what the manifest says about itself, rather than about any one snapshot.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleDriveManifestMetadata {
    pub version: u8,
    pub provider: String,
    pub workspace_id: String,
    pub workspace_name: String,
    pub updated_at: i64,
}

/// one snapshot, as the manifest records it. A snapshot is identified by the
/// pair `(file_id, revision)`: Drive keeps the identifier stable across a
/// rewrite, so the revision is what distinguishes one version of a file from
/// the next.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleDriveManifestEntry {
    pub file_id: String,
    pub filename: String,
    pub created_at: i64,
    pub source: GoogleDriveSnapshotSource,
    pub app_version: String,
    pub revision: String,
    #[serde(default)]
    pub modified_time: Option<String>,
    #[serde(default)]
    pub size_bytes: Option<i64>,
    #[serde(default)]
    pub md5_checksum: Option<String>,
    #[serde(default)]
    pub content_hash: Option<String>,
}

/// the remote index in full.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleDriveManifest {
    pub metadata: GoogleDriveManifestMetadata,
    pub entries: Vec<GoogleDriveManifestEntry>,
    pub head: GoogleDriveManifestEntry,
}

/// values a caller already knows and wants used in place of what the Drive
/// file says. A field left `None` is not an override — it defers to the file,
/// then to the previous entry, then to a default.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct GoogleDriveManifestEntryOverrides {
    pub filename: Option<String>,
    pub created_at: Option<i64>,
    pub source: Option<GoogleDriveSnapshotSource>,
    pub app_version: Option<String>,
    pub revision: Option<String>,
    pub modified_time: Option<String>,
    pub size_bytes: Option<i64>,
    pub md5_checksum: Option<String>,
    pub content_hash: Option<String>,
}

impl GoogleDriveManifestEntry {
    /// whether two records describe the same version of the same file.
    fn is_same_snapshot_as(&self, other: &Self) -> bool {
        self.file_id == other.file_id && self.revision == other.revision
    }
}

/// read a manifest off the remote into a value the rest of the application may
/// rely on, repairing what is repairable and rejecting what is not.
///
/// Rejected as [`Error::Integrity`]: an absent `metadata`, `head`, or
/// `entries`; an `entries` that is not a list; and any entry whose fields do
/// not describe a snapshot this application could have written. Each is a
/// manifest that cannot be acted on at all, and guessing at one risks pushing
/// over a snapshot that is still someone's only copy.
///
/// Repaired silently: duplicate records of one snapshot are collapsed, keeping
/// the first; content hashes are normalised; and a head missing from the entry
/// list is reinstated at its front. The last is the reconciliation that matters
/// — a manifest whose head is not among its entries would otherwise hide the
/// current snapshot from every operation that walks the list.
pub fn normalize_google_drive_manifest(
    raw: &serde_json::Value,
) -> Result<GoogleDriveManifest, Error> {
    let metadata = raw
        .get("metadata")
        .filter(|value| !value.is_null())
        .ok_or_else(|| corrupt("google drive manifest is missing metadata"))?;

    let head = raw
        .get("head")
        .filter(|value| !value.is_null())
        .ok_or_else(|| corrupt("google drive manifest is missing its head snapshot entry"))?;

    let entries = raw
        .get("entries")
        .and_then(serde_json::Value::as_array)
        .ok_or_else(|| corrupt("google drive manifest is missing its snapshot entries"))?;

    let metadata: GoogleDriveManifestMetadata =
        serde_json::from_value(metadata.clone()).map_err(|error| {
            corrupt(&format!(
                "google drive manifest metadata is unreadable: {error}"
            ))
        })?;

    let head = normalize_manifest_entry(head)?;

    let mut normalized_entries: Vec<GoogleDriveManifestEntry> = Vec::with_capacity(entries.len());

    for entry in entries {
        let entry = normalize_manifest_entry(entry)?;

        if !normalized_entries
            .iter()
            .any(|existing| existing.is_same_snapshot_as(&entry))
        {
            normalized_entries.push(entry);
        }
    }

    if !normalized_entries
        .iter()
        .any(|entry| entry.is_same_snapshot_as(&head))
    {
        normalized_entries.insert(0, head.clone());
    }

    Ok(GoogleDriveManifest {
        metadata,
        entries: normalized_entries,
        head,
    })
}

fn normalize_manifest_entry(raw: &serde_json::Value) -> Result<GoogleDriveManifestEntry, Error> {
    let mut entry: GoogleDriveManifestEntry =
        serde_json::from_value(raw.clone()).map_err(|error| {
            corrupt(&format!(
                "google drive manifest snapshot entry is unreadable: {error}"
            ))
        })?;

    entry.content_hash = normalize_content_hash(entry.content_hash.as_deref());

    Ok(entry)
}

/// describe a Drive file as a manifest entry, preferring what the caller
/// supplies, then what the file carries, then what the manifest already said,
/// and only then a default.
///
/// `now` supplies the capture time of last resort, for a file that declares
/// none and has no previous entry to inherit one from.
///
/// Fails with [`Error::Integrity`] where the file declares no source this
/// application recognises: a snapshot whose origin is unknown cannot be
/// retained or evicted correctly, and inventing one would silently make it
/// eligible for deletion.
pub fn build_manifest_entry_from_drive_file(
    file: &DriveFile,
    fallback: Option<&GoogleDriveManifestEntry>,
    overrides: &GoogleDriveManifestEntryOverrides,
    now: i64,
) -> Result<GoogleDriveManifestEntry, Error> {
    let created_at = overrides
        .created_at
        .or_else(|| parse_drive_snapshot_created_at(file))
        .or_else(|| fallback.map(|entry| entry.created_at))
        .or_else(|| parse_drive_timestamp(file.modified_time.as_deref()))
        .unwrap_or(now);

    let source = match overrides.source {
        Some(source) => source,
        None => try_parse_drive_snapshot_source(file).ok_or_else(|| {
            corrupt(&format!(
                "google drive snapshot {} is missing a valid source",
                file.id
            ))
        })?,
    };

    let filename = overrides
        .filename
        .clone()
        .unwrap_or_else(|| file.name.clone());
    let filename = if filename.is_empty() {
        fallback
            .map(|entry| entry.filename.clone())
            .filter(|filename| !filename.is_empty())
            .unwrap_or_else(|| "snapshot.db".to_string())
    } else {
        filename
    };

    Ok(GoogleDriveManifestEntry {
        file_id: file.id.clone(),
        filename,
        created_at,
        source,
        app_version: overrides
            .app_version
            .clone()
            .or_else(|| {
                file.app_property(SNAPSHOT_APP_VERSION_PROPERTY)
                    .map(str::to_string)
            })
            .or_else(|| fallback.map(|entry| entry.app_version.clone()))
            .unwrap_or_else(|| "unknown".to_string()),
        revision: overrides
            .revision
            .clone()
            .or_else(|| file.version.clone())
            .or_else(|| fallback.map(|entry| entry.revision.clone()))
            .unwrap_or_else(|| created_at.to_string()),
        modified_time: overrides
            .modified_time
            .clone()
            .or_else(|| file.modified_time.clone())
            .or_else(|| fallback.and_then(|entry| entry.modified_time.clone())),
        size_bytes: overrides
            .size_bytes
            .or_else(|| parse_drive_number(file.size.as_deref()))
            .or_else(|| fallback.and_then(|entry| entry.size_bytes)),
        md5_checksum: overrides
            .md5_checksum
            .clone()
            .or_else(|| file.md5_checksum.clone())
            .or_else(|| fallback.and_then(|entry| entry.md5_checksum.clone())),
        content_hash: normalize_content_hash(
            overrides
                .content_hash
                .clone()
                .or_else(|| {
                    file.app_property(SNAPSHOT_CONTENT_HASH_PROPERTY)
                        .map(str::to_string)
                })
                .or_else(|| fallback.and_then(|entry| entry.content_hash.clone()))
                .as_deref(),
        ),
    })
}

/// the name every manifest file carries.
pub(super) const MANIFEST_FILENAME: &str = "manifest.json";

/// the `rentableType` value marking a file as a manifest.
pub(super) const MANIFEST_FILE_TYPE: &str = "manifest";

/// whether a file is this workspace's manifest, rather than a file that merely
/// looks like one.
///
/// All three checks are needed: the name is not reserved, the type property is
/// absent on anything the user put there themselves, and a manifest belonging
/// to a different workspace's folder is a different workspace's manifest.
pub fn is_tracked_manifest_file_for_folder(file: Option<&DriveFile>, folder_id: &str) -> bool {
    let Some(file) = file else {
        return false;
    };

    if file.name != MANIFEST_FILENAME {
        return false;
    }

    if file
        .app_property(FILE_TYPE_PROPERTY)
        .map(|value| value.trim().to_ascii_lowercase())
        .as_deref()
        != Some(MANIFEST_FILE_TYPE)
    {
        return false;
    }

    file.parents.as_ref().is_some_and(|parents| {
        parents
            .iter()
            .any(|parent_id| parent_id.trim() == folder_id)
    })
}

/// whether a filename is one this application would have written. A folder can
/// hold anything the user dropped into it, and only files matching the shape
/// we produce are ours to retain or evict.
pub fn is_canonical_snapshot_filename(filename: Option<&str>) -> bool {
    let normalized = filename.unwrap_or_default().trim().to_ascii_lowercase();

    normalized.starts_with("snapshot-") && normalized.ends_with(".db")
}

/// newest first, on the same three keys the Drive file ordering uses and for
/// the same reasons.
pub fn compare_manifest_entries_newest_first(
    left: &GoogleDriveManifestEntry,
    right: &GoogleDriveManifestEntry,
) -> Ordering {
    right
        .created_at
        .cmp(&left.created_at)
        .then_with(|| {
            let left_modified_at =
                parse_drive_timestamp(left.modified_time.as_deref()).unwrap_or(0);
            let right_modified_at =
                parse_drive_timestamp(right.modified_time.as_deref()).unwrap_or(0);

            right_modified_at.cmp(&left_modified_at)
        })
        .then_with(|| right.file_id.cmp(&left.file_id))
}

fn corrupt(message: &str) -> Error {
    Error::Integrity {
        message: message.to_string(),
    }
}
