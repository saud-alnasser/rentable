//! remote manifest concerns. The manifest-reconciliation port (#114) lands here.
//!
//! The manifest is the remote's index: which snapshots exist, and which one is
//! current. It is a file on someone else's storage, so nothing read out of it
//! is trusted until it has been through [`normalize_google_drive_manifest`].
//!
//! Producing one lives here too. The index is derived from the snapshots rather
//! than accumulated beside them, so the rule deciding what a manifest may say
//! and the code deciding what one does say are the same subject, and splitting
//! them would let a written index fail a read it was written to pass.

use std::cmp::Ordering;

use serde::{Deserialize, Serialize};

use crate::error::Error;

use super::conflict::normalize_content_hash;
use super::metadata::{
    DriveFile, FILE_TYPE_PROPERTY, GoogleDriveSnapshotSource, SNAPSHOT_APP_VERSION_PROPERTY,
    SNAPSHOT_CONTENT_HASH_PROPERTY, parse_drive_number, parse_drive_snapshot_created_at,
    parse_drive_timestamp, try_parse_drive_snapshot_source,
};
use super::retention::GoogleDriveRetainedSnapshot;

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

/// the shape of the manifest document this application writes. Recorded so a
/// later format can be told from this one; nothing reads it back yet.
const MANIFEST_VERSION: u8 = 1;

/// the remote a manifest declares itself to describe.
const MANIFEST_PROVIDER: &str = "googleDrive";

/// assemble a manifest from the snapshots a workspace folder actually holds.
///
/// This is how every manifest comes to exist. The index is derived rather than
/// accumulated — a concurrent write can lose it, and the snapshots it describes
/// survive — so writing one after a push and rebuilding one another client
/// clobbered are the same call with different inputs, and neither can produce
/// an index the other would not have.
///
/// `head_file` is the snapshot the manifest names as current. It heads the
/// result wherever `retained` produced nothing, because a manifest with no head
/// is not a manifest and the alternative is an absence every reader would have
/// to carry a second case for.
///
/// `previous` is what a folder listing cannot say: the application version that
/// wrote a snapshot, its checksum, its content hash. `now` is both the time the
/// manifest records for itself and the capture time of last resort.
///
/// Fails with [`Error::Integrity`] where a file declares no source this
/// application recognises and the caller supplied none, for the reason
/// [`build_manifest_entry_from_drive_file`] gives.
pub fn build_google_drive_manifest_from_snapshots(
    workspace_id: &str,
    workspace_name: &str,
    retained: &[GoogleDriveRetainedSnapshot],
    head_file: &DriveFile,
    head_overrides: &GoogleDriveManifestEntryOverrides,
    previous: Option<&GoogleDriveManifest>,
    now: i64,
) -> Result<GoogleDriveManifest, Error> {
    let fallback_for = |file_id: &str| {
        previous.map(|previous| {
            previous
                .entries
                .iter()
                .find(|entry| entry.file_id == file_id)
                .unwrap_or(&previous.head)
        })
    };

    let mut entries: Vec<GoogleDriveManifestEntry> = Vec::with_capacity(retained.len());

    for snapshot in retained {
        let overrides = if snapshot.file.id == head_file.id {
            GoogleDriveManifestEntryOverrides {
                source: head_overrides.source.or(Some(snapshot.source)),
                ..head_overrides.clone()
            }
        } else {
            GoogleDriveManifestEntryOverrides {
                source: Some(snapshot.source),
                ..GoogleDriveManifestEntryOverrides::default()
            }
        };
        let entry = build_manifest_entry_from_drive_file(
            &snapshot.file,
            fallback_for(&snapshot.file.id),
            &overrides,
            now,
        )?;

        if !entries
            .iter()
            .any(|existing| existing.is_same_snapshot_as(&entry))
        {
            entries.push(entry);
        }
    }

    entries.sort_by(compare_manifest_entries_newest_first);

    let head = match entries.first() {
        Some(entry) => entry.clone(),
        None => build_manifest_entry_from_drive_file(
            head_file,
            fallback_for(&head_file.id),
            head_overrides,
            now,
        )?,
    };

    if !entries.iter().any(|entry| entry.is_same_snapshot_as(&head)) {
        entries.insert(0, head.clone());
        entries.sort_by(compare_manifest_entries_newest_first);
    }

    Ok(GoogleDriveManifest {
        metadata: GoogleDriveManifestMetadata {
            version: MANIFEST_VERSION,
            provider: MANIFEST_PROVIDER.to_string(),
            workspace_id: workspace_id.to_string(),
            workspace_name: workspace_name.to_string(),
            updated_at: now,
        },
        entries,
        head,
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

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use serde_json::json;

    use super::{
        GoogleDriveManifest, GoogleDriveManifestEntry, GoogleDriveManifestEntryOverrides,
        GoogleDriveManifestMetadata, build_google_drive_manifest_from_snapshots,
        build_manifest_entry_from_drive_file, compare_manifest_entries_newest_first,
        is_canonical_snapshot_filename, is_tracked_manifest_file_for_folder,
        normalize_google_drive_manifest,
    };
    use crate::{
        error::Error,
        sync::google::{
            metadata::{DriveFile, GoogleDriveSnapshotSource},
            retention::choose_retained_workspace_snapshots,
        },
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
    fn manifest_entry_json(file_id: &str, revision: &str, created_at: i64) -> serde_json::Value {
        json!({
            "fileId": file_id,
            "filename": format!("snapshot-{file_id}.db"),
            "createdAt": created_at,
            "source": "autosave",
            "appVersion": "1.0.0",
            "revision": revision,
            "modifiedTime": null,
            "sizeBytes": null,
            "md5Checksum": null,
            "contentHash": null,
        })
    }

    fn manifest_metadata_json() -> serde_json::Value {
        json!({
            "version": 1,
            "provider": "googleDrive",
            "workspaceId": "workspace-1",
            "workspaceName": "Primary workspace",
            "updatedAt": 1_700_000_000_000i64,
        })
    }
    fn entry(file_id: &str, created_at: i64) -> GoogleDriveManifestEntry {
        GoogleDriveManifestEntry {
            file_id: file_id.to_string(),
            filename: format!("snapshot-{file_id}.db"),
            created_at,
            source: GoogleDriveSnapshotSource::Autosave,
            app_version: "1.0.0".to_string(),
            revision: "1".to_string(),
            modified_time: None,
            size_bytes: None,
            md5_checksum: None,
            content_hash: None,
        }
    }
    #[test]
    fn a_manifest_without_metadata_head_or_entries_is_rejected_as_corrupt() {
        for raw in [
            json!({ "head": manifest_entry_json("a", "1", 100), "entries": [] }),
            json!({ "metadata": manifest_metadata_json(), "entries": [] }),
            json!({ "metadata": manifest_metadata_json(), "head": manifest_entry_json("a", "1", 100) }),
            json!({
                "metadata": manifest_metadata_json(),
                "head": manifest_entry_json("a", "1", 100),
                "entries": "not an array",
            }),
        ] {
            assert!(
                matches!(
                    normalize_google_drive_manifest(&raw),
                    Err(Error::Integrity { .. })
                ),
                "expected a corrupt manifest to be rejected: {raw}"
            );
        }
    }

    #[test]
    fn a_manifest_entry_with_an_unrecognised_source_is_rejected_as_corrupt() {
        let mut head = manifest_entry_json("a", "1", 100);
        head["source"] = json!("recovery");

        let raw = json!({
            "metadata": manifest_metadata_json(),
            "head": head,
            "entries": [],
        });

        assert!(matches!(
            normalize_google_drive_manifest(&raw),
            Err(Error::Integrity { .. })
        ));
    }

    #[test]
    fn normalizing_a_manifest_lowercases_content_hashes_and_drops_duplicate_entries() {
        let mut head = manifest_entry_json("a", "1", 100);
        head["contentHash"] = json!("  ABC123  ");

        let raw = json!({
            "metadata": manifest_metadata_json(),
            "head": head.clone(),
            "entries": [head.clone(), head, manifest_entry_json("b", "1", 200)],
        });

        let manifest = normalize_google_drive_manifest(&raw).expect("manifest should normalize");

        assert_eq!(manifest.head.content_hash, Some("abc123".to_string()));
        assert_eq!(manifest.entries.len(), 2);
        assert_eq!(manifest.entries[0].file_id, "a");
        assert_eq!(manifest.entries[1].file_id, "b");
    }

    #[test]
    fn an_entry_differing_only_by_revision_is_kept_as_its_own_entry() {
        let raw = json!({
            "metadata": manifest_metadata_json(),
            "head": manifest_entry_json("a", "2", 200),
            "entries": [manifest_entry_json("a", "1", 100), manifest_entry_json("a", "2", 200)],
        });

        let manifest = normalize_google_drive_manifest(&raw).expect("manifest should normalize");

        assert_eq!(manifest.entries.len(), 2);
    }

    #[test]
    fn reconciliation_reinstates_a_head_the_entry_list_had_lost() {
        let raw = json!({
            "metadata": manifest_metadata_json(),
            "head": manifest_entry_json("head", "9", 900),
            "entries": [manifest_entry_json("other", "1", 100)],
        });

        let manifest = normalize_google_drive_manifest(&raw).expect("manifest should normalize");

        assert_eq!(manifest.entries.len(), 2);
        assert_eq!(manifest.entries[0].file_id, "head");
        assert_eq!(manifest.entries[1].file_id, "other");
    }

    #[test]
    fn a_head_already_present_in_the_entries_is_not_duplicated() {
        let raw = json!({
            "metadata": manifest_metadata_json(),
            "head": manifest_entry_json("head", "9", 900),
            "entries": [manifest_entry_json("head", "9", 900)],
        });

        let manifest = normalize_google_drive_manifest(&raw).expect("manifest should normalize");

        assert_eq!(manifest.entries.len(), 1);
    }
    #[test]
    fn manifest_entries_order_newest_first_then_by_modified_time_then_by_file_id() {
        assert_eq!(
            compare_manifest_entries_newest_first(&entry("a", 200), &entry("b", 100)),
            std::cmp::Ordering::Less
        );

        let mut older = entry("a", 100);
        older.modified_time = Some("2024-01-15T10:30:00.000Z".to_string());
        let mut newer = entry("b", 100);
        newer.modified_time = Some("2024-02-15T10:30:00.000Z".to_string());
        assert_eq!(
            compare_manifest_entries_newest_first(&newer, &older),
            std::cmp::Ordering::Less
        );

        assert_eq!(
            compare_manifest_entries_newest_first(&entry("b", 100), &entry("a", 100)),
            std::cmp::Ordering::Less
        );
    }

    #[test]
    fn a_manifest_entry_is_built_from_the_drive_files_own_metadata() {
        let mut file = with_properties(
            drive_file("file-1"),
            &[
                ("rentableSource", "manual"),
                ("rentableCreatedAt", "1700000000000"),
                ("rentableAppVersion", "2.3.4"),
                ("rentableContentHash", "ABC123"),
            ],
        );
        file.name = "snapshot-1.db".to_string();
        file.version = Some("7".to_string());
        file.size = Some("2048".to_string());
        file.md5_checksum = Some("md5".to_string());
        file.modified_time = Some("2024-01-15T10:30:00.000Z".to_string());

        let built = build_manifest_entry_from_drive_file(
            &file,
            None,
            &GoogleDriveManifestEntryOverrides::default(),
            1,
        )
        .expect("entry should build");

        assert_eq!(built.file_id, "file-1");
        assert_eq!(built.filename, "snapshot-1.db");
        assert_eq!(built.created_at, 1_700_000_000_000);
        assert_eq!(built.source, GoogleDriveSnapshotSource::Manual);
        assert_eq!(built.app_version, "2.3.4");
        assert_eq!(built.revision, "7");
        assert_eq!(built.size_bytes, Some(2048));
        assert_eq!(built.md5_checksum, Some("md5".to_string()));
        assert_eq!(built.content_hash, Some("abc123".to_string()));
    }

    #[test]
    fn building_an_entry_falls_back_through_the_previous_entry_then_to_defaults() {
        let mut file = drive_file("file-1");
        file.name = String::new();
        file.app_properties = Some(HashMap::from([(
            "rentableSource".to_string(),
            "autosave".to_string(),
        )]));

        let fallback = GoogleDriveManifestEntry {
            filename: "previous.db".to_string(),
            app_version: "1.0.0".to_string(),
            revision: "3".to_string(),
            size_bytes: Some(512),
            ..entry("file-1", 555)
        };

        let built = build_manifest_entry_from_drive_file(
            &file,
            Some(&fallback),
            &GoogleDriveManifestEntryOverrides::default(),
            1,
        )
        .expect("entry should build");

        assert_eq!(built.filename, "previous.db");
        assert_eq!(built.created_at, 555);
        assert_eq!(built.app_version, "1.0.0");
        assert_eq!(built.revision, "3");
        assert_eq!(built.size_bytes, Some(512));

        let bare = build_manifest_entry_from_drive_file(
            &file,
            None,
            &GoogleDriveManifestEntryOverrides::default(),
            4242,
        )
        .expect("entry should build");

        assert_eq!(bare.filename, "snapshot.db");
        assert_eq!(bare.created_at, 4242);
        assert_eq!(bare.app_version, "unknown");
        assert_eq!(bare.revision, "4242");
    }

    #[test]
    fn overrides_win_over_everything_the_drive_file_says() {
        let file = with_properties(
            drive_file("file-1"),
            &[("rentableSource", "autosave"), ("rentableCreatedAt", "100")],
        );

        let built = build_manifest_entry_from_drive_file(
            &file,
            None,
            &GoogleDriveManifestEntryOverrides {
                filename: Some("chosen.db".to_string()),
                created_at: Some(999),
                source: Some(GoogleDriveSnapshotSource::Manual),
                content_hash: Some("DEADBEEF".to_string()),
                ..GoogleDriveManifestEntryOverrides::default()
            },
            1,
        )
        .expect("entry should build");

        assert_eq!(built.filename, "chosen.db");
        assert_eq!(built.created_at, 999);
        assert_eq!(built.source, GoogleDriveSnapshotSource::Manual);
        assert_eq!(built.content_hash, Some("deadbeef".to_string()));
    }

    #[test]
    fn a_drive_file_with_no_source_cannot_become_a_manifest_entry() {
        let result = build_manifest_entry_from_drive_file(
            &drive_file("file-1"),
            None,
            &GoogleDriveManifestEntryOverrides::default(),
            1,
        );

        assert!(matches!(result, Err(Error::Integrity { .. })));
    }

    #[test]
    fn a_manifest_built_from_snapshots_heads_the_newest_and_lists_every_retained_one() {
        let newest = snapshot("file-new", "manual", 3_000);
        let older = snapshot("file-old", "autosave", 1_000);
        let retained = choose_retained_workspace_snapshots(&[older, newest.clone()]);

        let built = build_google_drive_manifest_from_snapshots(
            "workspace-1",
            "Primary workspace",
            &retained,
            &newest,
            &GoogleDriveManifestEntryOverrides::default(),
            None,
            7_000,
        )
        .expect("the manifest should build");

        assert_eq!(built.head.file_id, "file-new");
        assert_eq!(built.head.source, GoogleDriveSnapshotSource::Manual);
        assert_eq!(
            built
                .entries
                .iter()
                .map(|entry| entry.file_id.as_str())
                .collect::<Vec<_>>(),
            vec!["file-new", "file-old"]
        );
        assert_eq!(
            built.metadata,
            GoogleDriveManifestMetadata {
                version: 1,
                provider: "googleDrive".to_string(),
                workspace_id: "workspace-1".to_string(),
                workspace_name: "Primary workspace".to_string(),
                updated_at: 7_000,
            }
        );
    }

    #[test]
    fn a_rebuild_keeps_what_only_the_previous_manifest_knew() {
        let file = snapshot("file-1", "autosave", 2_000);
        let retained = choose_retained_workspace_snapshots(&[file.clone()]);
        let mut previous_entry = entry("file-1", 2_000);
        previous_entry.app_version = "1.2.3".to_string();
        previous_entry.md5_checksum = Some("recorded-before".to_string());
        let previous = GoogleDriveManifest {
            entries: vec![previous_entry.clone()],
            head: previous_entry,
            ..manifest(1_000)
        };

        let built = build_google_drive_manifest_from_snapshots(
            "workspace-1",
            "Primary workspace",
            &retained,
            &file,
            &GoogleDriveManifestEntryOverrides::default(),
            Some(&previous),
            7_000,
        )
        .expect("the manifest should build");

        // a rebuild reads a folder listing, and a listing says nothing about the
        // version that wrote a snapshot or the checksum Drive computed for it. The
        // index is derived from the snapshots, so what it knew and they do not say
        // is carried rather than reset to a default.
        assert_eq!(built.head.app_version, "1.2.3");
        assert_eq!(built.head.md5_checksum, Some("recorded-before".to_string()));
    }

    #[test]
    fn a_rebuild_of_a_folder_holding_one_snapshot_heads_it_even_where_it_was_not_retained() {
        let head_file = snapshot("file-1", "autosave", 2_000);

        let built = build_google_drive_manifest_from_snapshots(
            "workspace-1",
            "Primary workspace",
            &[],
            &head_file,
            &GoogleDriveManifestEntryOverrides::default(),
            None,
            7_000,
        )
        .expect("the manifest should build");

        // a manifest has to name a head, so the file the caller nominated is the
        // answer wherever the retained set produced none. Without this the index
        // would have to be absent rather than empty, and every reader would carry a
        // second case for it.
        assert_eq!(built.head.file_id, "file-1");
        assert_eq!(built.entries, vec![built.head.clone()]);
    }

    #[test]
    fn a_manifest_file_is_recognised_by_name_type_and_parent_together() {
        let manifest_file = DriveFile {
            id: "manifest".to_string(),
            name: "manifest.json".to_string(),
            parents: Some(vec!["folder-1".to_string()]),
            app_properties: Some(HashMap::from([(
                "rentableType".to_string(),
                " Manifest ".to_string(),
            )])),
            ..DriveFile::default()
        };

        assert!(is_tracked_manifest_file_for_folder(
            Some(&manifest_file),
            "folder-1"
        ));
        assert!(!is_tracked_manifest_file_for_folder(
            Some(&manifest_file),
            "another-folder"
        ));
        assert!(!is_tracked_manifest_file_for_folder(None, "folder-1"));

        assert!(!is_tracked_manifest_file_for_folder(
            Some(&DriveFile {
                name: "notes.json".to_string(),
                ..manifest_file.clone()
            }),
            "folder-1"
        ));
        assert!(!is_tracked_manifest_file_for_folder(
            Some(&DriveFile {
                app_properties: None,
                ..manifest_file.clone()
            }),
            "folder-1"
        ));
        assert!(!is_tracked_manifest_file_for_folder(
            Some(&DriveFile {
                parents: None,
                ..manifest_file
            }),
            "folder-1"
        ));
    }

    #[test]
    fn a_snapshot_filename_is_canonical_only_with_the_expected_prefix_and_extension() {
        assert!(is_canonical_snapshot_filename(Some("snapshot-2024.db")));
        assert!(is_canonical_snapshot_filename(Some("  SNAPSHOT-2024.DB  ")));
        assert!(!is_canonical_snapshot_filename(Some("backup-2024.db")));
        assert!(!is_canonical_snapshot_filename(Some(
            "snapshot-2024.sqlite"
        )));
        assert!(!is_canonical_snapshot_filename(None));
    }

    /// a manifest whose head is `head-1` at revision `7`, updated at `1000`.
    fn manifest(updated_at: i64) -> GoogleDriveManifest {
        let mut head = entry("head-1", 900);
        head.revision = "7".to_string();

        GoogleDriveManifest {
            metadata: GoogleDriveManifestMetadata {
                version: 1,
                provider: "googleDrive".to_string(),
                workspace_id: "workspace-1".to_string(),
                workspace_name: "Primary workspace".to_string(),
                updated_at,
            },
            entries: vec![head.clone()],
            head,
        }
    }
}
