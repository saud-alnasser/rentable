use std::collections::{BTreeMap, HashMap};
use std::time::{Duration, Instant};

use reqwest::Method;
use serde_json::json;

use crate::error::Error;

use super::super::store::RemoteSyncWorkspace;
use super::test_server::{ScriptedResponse, TestDriveServer};
use super::{
    auth::{
        GoogleDriveConfig, GoogleTokenResponse, access_token_is_fresh, authorization_code_form,
        build_authorization_url, parse_token_response, pkce_challenge, random_url_safe_token,
        refresh_token_form,
    },
    conflict::{
        GoogleDriveConflictKind, GoogleDriveHeadObservation, GoogleDriveRecommendedMode,
        GoogleDriveResolvedHead, GoogleDriveSyncAction, GoogleDriveSyncMode,
        analyze_sync_resolution, content_hash_hex, did_remote_head_change_from_manifest,
        has_local_snapshot, is_cryptographic_content_hash, normalize_content_hash,
        should_refresh_remote_manifest_head,
    },
    files::{
        DriveEndpoints, DriveFiles, DriveUpload, GoogleDriveAccountDetails, escape_drive_query,
    },
    manifest::{
        GoogleDriveManifest, GoogleDriveManifestEntry, GoogleDriveManifestEntryOverrides,
        GoogleDriveManifestMetadata, build_google_drive_manifest_from_snapshots,
        build_manifest_entry_from_drive_file, compare_manifest_entries_newest_first,
        is_canonical_snapshot_filename, is_tracked_manifest_file_for_folder,
        normalize_google_drive_manifest,
    },
    metadata::{
        DriveFile, GoogleDriveSnapshotSource, parse_drive_number, parse_drive_snapshot_created_at,
        parse_drive_timestamp, try_parse_drive_snapshot_source,
    },
    retention::{choose_retained_workspace_snapshots, compare_drive_files_by_snapshot_recency},
    transport::{
        DriveRequest, DriveResponse, DriveRetryPolicy, DriveTransport, drive_error, is_retryable,
        parse_retry_after, retry_delay,
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

#[test]
fn snapshot_recency_orders_newest_first_then_falls_back_to_modified_time_then_id() {
    let older = snapshot("a", "manual", 100);
    let newer = snapshot("b", "manual", 200);
    assert_eq!(
        compare_drive_files_by_snapshot_recency(&newer, &older),
        std::cmp::Ordering::Less
    );

    let mut left = drive_file("a");
    left.modified_time = Some("2024-01-15T10:30:00.000Z".to_string());
    let mut right = drive_file("b");
    right.modified_time = Some("2024-02-15T10:30:00.000Z".to_string());
    assert_eq!(
        compare_drive_files_by_snapshot_recency(&right, &left),
        std::cmp::Ordering::Less
    );

    assert_eq!(
        compare_drive_files_by_snapshot_recency(&drive_file("b"), &drive_file("a")),
        std::cmp::Ordering::Less
    );
}

#[test]
fn retention_keeps_the_newest_snapshot_of_each_source() {
    let retained = choose_retained_workspace_snapshots(&[
        snapshot("old-manual", "manual", 100),
        snapshot("new-manual", "manual", 300),
        snapshot("old-autosave", "autosave", 50),
        snapshot("new-autosave", "autosave", 200),
    ]);

    let retained_ids = retained
        .iter()
        .map(|entry| entry.file.id.as_str())
        .collect::<Vec<_>>();

    assert_eq!(retained_ids, vec!["new-manual", "new-autosave"]);
}

#[test]
fn retention_skips_snapshots_with_no_recognisable_source() {
    let retained = choose_retained_workspace_snapshots(&[
        snapshot("unlabelled", "recovery", 500),
        snapshot("manual", "manual", 100),
    ]);

    assert_eq!(retained.len(), 1);
    assert_eq!(retained[0].file.id, "manual");
    assert_eq!(retained[0].source, GoogleDriveSnapshotSource::Manual);
}

#[test]
fn retention_returns_each_file_once_and_orders_the_result_by_recency() {
    let retained = choose_retained_workspace_snapshots(&[
        snapshot("autosave", "autosave", 400),
        snapshot("manual", "manual", 100),
    ]);

    let retained_ids = retained
        .iter()
        .map(|entry| entry.file.id.as_str())
        .collect::<Vec<_>>();

    assert_eq!(retained_ids, vec!["autosave", "manual"]);
}

#[test]
fn retention_of_nothing_retains_nothing() {
    assert!(choose_retained_workspace_snapshots(&[]).is_empty());
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

#[test]
fn content_hashes_normalize_to_lowercase_and_treat_blank_as_absent() {
    assert_eq!(
        normalize_content_hash(Some("  ABCdef  ")),
        Some("abcdef".to_string())
    );
    assert_eq!(normalize_content_hash(Some("   ")), None);
    assert_eq!(normalize_content_hash(Some("")), None);
    assert_eq!(normalize_content_hash(None), None);
}

#[test]
fn only_a_full_length_hex_digest_counts_as_a_cryptographic_hash() {
    let digest = "a".repeat(64);

    assert!(is_cryptographic_content_hash(Some(&digest)));
    assert!(is_cryptographic_content_hash(Some(&digest.to_uppercase())));
    assert!(!is_cryptographic_content_hash(Some(&"a".repeat(63))));
    assert!(!is_cryptographic_content_hash(Some(&"a".repeat(65))));
    assert!(!is_cryptographic_content_hash(Some(&"z".repeat(64))));
    assert!(!is_cryptographic_content_hash(None));
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

/// a workspace already in step with [`manifest`]: synced, holding the same
/// head, and having seen the manifest at its current time.
fn synced_workspace() -> RemoteSyncWorkspace {
    RemoteSyncWorkspace {
        id: "workspace-1".to_string(),
        remote_head_file_id: Some("head-1".to_string()),
        remote_head_revision: Some("7".to_string()),
        last_remote_updated_at: Some(1000),
        last_synced_at: Some(2000),
        last_snapshot_at: Some(1500),
        last_snapshot_filename: Some("snapshot-local.db".to_string()),
        ..RemoteSyncWorkspace::default()
    }
}

#[test]
fn a_local_snapshot_is_either_a_capture_time_or_a_filename() {
    assert!(!has_local_snapshot(&RemoteSyncWorkspace::default()));
    assert!(has_local_snapshot(&RemoteSyncWorkspace {
        last_snapshot_at: Some(1),
        ..RemoteSyncWorkspace::default()
    }));
    assert!(has_local_snapshot(&RemoteSyncWorkspace {
        last_snapshot_filename: Some("snapshot.db".to_string()),
        ..RemoteSyncWorkspace::default()
    }));
    assert!(!has_local_snapshot(&RemoteSyncWorkspace {
        last_snapshot_at: Some(0),
        last_snapshot_filename: Some(String::new()),
        ..RemoteSyncWorkspace::default()
    }));
}

#[test]
fn an_explicit_push_or_pull_is_carried_out_without_asking() {
    let pushed = analyze_sync_resolution(
        &synced_workspace(),
        Some(&manifest(1000)),
        GoogleDriveSyncMode::Push,
        &GoogleDriveHeadObservation::default(),
    );

    assert_eq!(pushed.action, GoogleDriveSyncAction::Pushed);
    assert!(!pushed.requires_resolution);
    assert_eq!(pushed.recommended_mode, GoogleDriveRecommendedMode::Push);

    let pulled = analyze_sync_resolution(
        &synced_workspace(),
        Some(&manifest(1000)),
        GoogleDriveSyncMode::Pull,
        &GoogleDriveHeadObservation::default(),
    );

    assert_eq!(pulled.action, GoogleDriveSyncAction::Pulled);
    assert!(!pulled.requires_resolution);
    assert_eq!(pulled.recommended_mode, GoogleDriveRecommendedMode::Pull);
}

#[test]
fn an_empty_remote_is_bootstrapped_by_pushing() {
    let resolution = analyze_sync_resolution(
        &RemoteSyncWorkspace::default(),
        None,
        GoogleDriveSyncMode::Sync,
        &GoogleDriveHeadObservation::default(),
    );

    assert_eq!(resolution.action, GoogleDriveSyncAction::Pushed);
    assert!(!resolution.requires_resolution);
    assert_eq!(resolution.conflict_kind, None);
}

#[test]
fn identical_content_needs_no_transfer() {
    let digest = "a".repeat(64);

    let resolution = analyze_sync_resolution(
        &synced_workspace(),
        Some(&manifest(1000)),
        GoogleDriveSyncMode::Sync,
        &GoogleDriveHeadObservation {
            local_content_hash: Some(digest.clone()),
            remote_content_hash: Some(digest.to_uppercase()),
            ..GoogleDriveHeadObservation::default()
        },
    );

    assert_eq!(resolution.action, GoogleDriveSyncAction::None);
    assert!(!resolution.requires_resolution);
    assert!(!resolution.should_mark_synced_without_pull);
}

#[test]
fn identical_content_the_workspace_has_never_synced_is_recorded_without_pulling() {
    let digest = "a".repeat(64);

    let resolution = analyze_sync_resolution(
        &RemoteSyncWorkspace {
            last_synced_at: None,
            ..synced_workspace()
        },
        Some(&manifest(1000)),
        GoogleDriveSyncMode::Sync,
        &GoogleDriveHeadObservation {
            local_content_hash: Some(digest.clone()),
            remote_content_hash: Some(digest),
            ..GoogleDriveHeadObservation::default()
        },
    );

    assert_eq!(resolution.action, GoogleDriveSyncAction::None);
    assert!(resolution.should_mark_synced_without_pull);
}

#[test]
fn a_first_sync_with_work_on_both_sides_is_a_link_conflict() {
    let resolution = analyze_sync_resolution(
        &RemoteSyncWorkspace {
            remote_head_file_id: None,
            remote_head_revision: None,
            last_synced_at: None,
            last_snapshot_at: Some(1500),
            last_snapshot_filename: Some("snapshot-local.db".to_string()),
            ..RemoteSyncWorkspace::default()
        },
        Some(&manifest(1000)),
        GoogleDriveSyncMode::Sync,
        &GoogleDriveHeadObservation::default(),
    );

    assert!(resolution.requires_resolution);
    assert_eq!(
        resolution.conflict_kind,
        Some(GoogleDriveConflictKind::Link)
    );
    assert_eq!(
        resolution.recommended_mode,
        GoogleDriveRecommendedMode::Push
    );
    assert_eq!(resolution.action, GoogleDriveSyncAction::None);
}

#[test]
fn divergence_after_a_successful_sync_is_a_sync_conflict() {
    let local_digest = "a".repeat(64);
    let remote_digest = "b".repeat(64);

    let resolution = analyze_sync_resolution(
        &synced_workspace(),
        Some(&manifest(3000)),
        GoogleDriveSyncMode::Sync,
        &GoogleDriveHeadObservation {
            local_content_hash: Some(local_digest),
            remote_content_hash: Some(remote_digest),
            ..GoogleDriveHeadObservation::default()
        },
    );

    assert!(resolution.requires_resolution);
    assert_eq!(
        resolution.conflict_kind,
        Some(GoogleDriveConflictKind::Sync)
    );
    assert_eq!(resolution.action, GoogleDriveSyncAction::None);
}

#[test]
fn a_sync_conflict_recommends_whichever_side_moved_last() {
    let local_digest = "a".repeat(64);
    let remote_digest = "b".repeat(64);
    let observation = GoogleDriveHeadObservation {
        local_content_hash: Some(local_digest),
        remote_content_hash: Some(remote_digest),
        ..GoogleDriveHeadObservation::default()
    };

    let local_is_newer = analyze_sync_resolution(
        &RemoteSyncWorkspace {
            last_snapshot_at: Some(5000),
            ..synced_workspace()
        },
        Some(&manifest(3000)),
        GoogleDriveSyncMode::Sync,
        &observation,
    );

    assert_eq!(
        local_is_newer.recommended_mode,
        GoogleDriveRecommendedMode::Push
    );

    let remote_is_newer = analyze_sync_resolution(
        &RemoteSyncWorkspace {
            last_snapshot_at: Some(1500),
            ..synced_workspace()
        },
        Some(&manifest(3000)),
        GoogleDriveSyncMode::Sync,
        &observation,
    );

    assert_eq!(
        remote_is_newer.recommended_mode,
        GoogleDriveRecommendedMode::Pull
    );
}

#[test]
fn a_remote_that_moved_alone_is_pulled_and_a_local_that_moved_alone_is_pushed() {
    let pulled = analyze_sync_resolution(
        &RemoteSyncWorkspace {
            last_snapshot_at: Some(500),
            last_synced_at: Some(2000),
            ..synced_workspace()
        },
        Some(&manifest(3000)),
        GoogleDriveSyncMode::Sync,
        &GoogleDriveHeadObservation::default(),
    );

    assert_eq!(pulled.action, GoogleDriveSyncAction::Pulled);
    assert!(!pulled.requires_resolution);
    assert_eq!(pulled.recommended_mode, GoogleDriveRecommendedMode::Pull);

    let pushed = analyze_sync_resolution(
        &RemoteSyncWorkspace {
            last_snapshot_at: Some(5000),
            ..synced_workspace()
        },
        Some(&manifest(1000)),
        GoogleDriveSyncMode::Sync,
        &GoogleDriveHeadObservation::default(),
    );

    assert_eq!(pushed.action, GoogleDriveSyncAction::Pushed);
    assert!(!pushed.requires_resolution);
    assert_eq!(pushed.recommended_mode, GoogleDriveRecommendedMode::Push);
}

#[test]
fn a_workspace_in_step_with_the_remote_does_nothing() {
    let resolution = analyze_sync_resolution(
        &synced_workspace(),
        Some(&manifest(1000)),
        GoogleDriveSyncMode::Sync,
        &GoogleDriveHeadObservation::default(),
    );

    assert_eq!(resolution.action, GoogleDriveSyncAction::None);
    assert!(!resolution.requires_resolution);
    assert_eq!(resolution.conflict_kind, None);
}

#[test]
fn a_head_observed_as_changed_makes_the_remote_count_as_moved() {
    let resolution = analyze_sync_resolution(
        &synced_workspace(),
        Some(&manifest(1000)),
        GoogleDriveSyncMode::Sync,
        &GoogleDriveHeadObservation {
            remote_head_changed: true,
            ..GoogleDriveHeadObservation::default()
        },
    );

    assert_eq!(resolution.action, GoogleDriveSyncAction::Pulled);
}

#[test]
fn the_manifest_head_is_refreshed_when_the_file_behind_it_moved_on() {
    let head = manifest(1000).head;

    let unchanged = GoogleDriveResolvedHead {
        file: drive_file("head-1"),
        content_hash: None,
        changed_from_manifest: false,
    };
    assert!(!should_refresh_remote_manifest_head(&head, &unchanged));

    let changed = GoogleDriveResolvedHead {
        changed_from_manifest: true,
        ..unchanged.clone()
    };
    assert!(should_refresh_remote_manifest_head(&head, &changed));

    let rehashed = GoogleDriveResolvedHead {
        content_hash: Some("c".repeat(64)),
        ..unchanged
    };
    assert!(should_refresh_remote_manifest_head(&head, &rehashed));
}

#[test]
fn a_head_file_differs_from_the_manifest_on_identity_revision_or_content() {
    let mut head = entry("head-1", 900);
    head.revision = "7".to_string();
    head.modified_time = Some("2024-01-15T10:30:00.000Z".to_string());
    head.size_bytes = Some(2048);
    head.md5_checksum = Some("md5".to_string());
    head.content_hash = Some("a".repeat(64));

    let matching = DriveFile {
        id: "head-1".to_string(),
        name: "snapshot-head-1.db".to_string(),
        version: Some("7".to_string()),
        modified_time: Some("2024-01-15T10:30:00.000Z".to_string()),
        size: Some("2048".to_string()),
        md5_checksum: Some("md5".to_string()),
        app_properties: Some(HashMap::from([(
            "rentableContentHash".to_string(),
            "A".repeat(64),
        )])),
        parents: None,
    };
    assert!(!did_remote_head_change_from_manifest(&head, &matching));

    for changed in [
        DriveFile {
            id: "other".to_string(),
            ..matching.clone()
        },
        DriveFile {
            version: Some("8".to_string()),
            ..matching.clone()
        },
        DriveFile {
            modified_time: Some("2024-02-15T10:30:00.000Z".to_string()),
            ..matching.clone()
        },
        DriveFile {
            size: Some("4096".to_string()),
            ..matching.clone()
        },
        DriveFile {
            md5_checksum: Some("different".to_string()),
            ..matching.clone()
        },
        DriveFile {
            app_properties: Some(HashMap::from([(
                "rentableContentHash".to_string(),
                "b".repeat(64),
            )])),
            ..matching.clone()
        },
    ] {
        assert!(
            did_remote_head_change_from_manifest(&head, &changed),
            "expected a difference to be detected in {changed:?}"
        );
    }
}

#[test]
fn a_head_file_stating_a_field_as_blank_is_not_treated_as_a_change() {
    let mut head = entry("head-1", 900);
    head.revision = "7".to_string();
    head.modified_time = Some("2024-01-15T10:30:00.000Z".to_string());
    head.md5_checksum = Some("md5".to_string());

    assert!(!did_remote_head_change_from_manifest(
        &head,
        &DriveFile {
            id: "head-1".to_string(),
            version: Some(String::new()),
            modified_time: Some(String::new()),
            size: Some(String::new()),
            md5_checksum: Some(String::new()),
            ..DriveFile::default()
        }
    ));
}

#[test]
fn a_head_file_missing_a_field_is_not_treated_as_a_change() {
    let mut head = entry("head-1", 900);
    head.revision = "7".to_string();
    head.size_bytes = Some(2048);
    head.md5_checksum = Some("md5".to_string());
    head.content_hash = Some("a".repeat(64));

    assert!(!did_remote_head_change_from_manifest(
        &head,
        &drive_file("head-1")
    ));
}

fn oauth_config() -> GoogleDriveConfig {
    GoogleDriveConfig {
        client_id: Some("client-id".to_string()),
        client_secret: Some("client-secret".to_string()),
        authorize_endpoint: "https://accounts.google.com/o/oauth2/v2/auth".to_string(),
        token_endpoint: "https://oauth2.googleapis.com/token".to_string(),
        drive_api_base_url: "https://www.googleapis.com/drive/v3".to_string(),
        scopes: vec![
            "https://www.googleapis.com/auth/drive.file".to_string(),
            "email".to_string(),
        ],
    }
}

/// the worked example from RFC 7636 appendix B. Google verifies the challenge
/// against the verifier we send later, so an encoding that is merely
/// self-consistent still fails against the live endpoint.
#[test]
fn the_pkce_challenge_matches_the_rfc_7636_worked_example() {
    assert_eq!(
        pkce_challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
        "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
    );
}

#[test]
fn a_random_token_is_unpadded_base64url_of_thirty_two_bytes() {
    let token = random_url_safe_token().expect("failed to draw a random token");

    assert_eq!(token.len(), 43);
    assert!(
        token
            .chars()
            .all(|character| character.is_ascii_alphanumeric()
                || character == '-'
                || character == '_'),
        "token left the base64url alphabet: {token}"
    );
}

#[test]
fn two_random_tokens_differ() {
    let first = random_url_safe_token().expect("failed to draw a random token");
    let second = random_url_safe_token().expect("failed to draw a random token");

    assert_ne!(first, second);
}

#[test]
fn the_authorization_url_carries_every_parameter_google_requires() {
    let url = build_authorization_url(
        &oauth_config(),
        "client-id",
        "http://127.0.0.1:5173/callback",
        "the-state",
        "the-challenge",
    )
    .expect("failed to build the authorization url");
    let parsed = url::Url::parse(&url).expect("the authorization url did not parse");
    let parameters = parsed
        .query_pairs()
        .map(|(key, value)| (key.into_owned(), value.into_owned()))
        .collect::<HashMap<_, _>>();

    assert_eq!(parsed.host_str(), Some("accounts.google.com"));
    assert_eq!(parsed.path(), "/o/oauth2/v2/auth");
    assert_eq!(
        parameters.get("client_id").map(String::as_str),
        Some("client-id")
    );
    assert_eq!(
        parameters.get("redirect_uri").map(String::as_str),
        Some("http://127.0.0.1:5173/callback")
    );
    assert_eq!(
        parameters.get("response_type").map(String::as_str),
        Some("code")
    );
    assert_eq!(
        parameters.get("scope").map(String::as_str),
        Some("https://www.googleapis.com/auth/drive.file email")
    );
    assert_eq!(
        parameters.get("access_type").map(String::as_str),
        Some("offline")
    );
    assert_eq!(
        parameters.get("include_granted_scopes").map(String::as_str),
        Some("true")
    );
    assert_eq!(
        parameters.get("prompt").map(String::as_str),
        Some("consent")
    );
    assert_eq!(
        parameters.get("state").map(String::as_str),
        Some("the-state")
    );
    assert_eq!(
        parameters.get("code_challenge").map(String::as_str),
        Some("the-challenge")
    );
    assert_eq!(
        parameters.get("code_challenge_method").map(String::as_str),
        Some("S256")
    );
}

/// the redirect and the scope list both carry characters that change meaning
/// unescaped, and a mis-encoded redirect is rejected by Google as a mismatch
/// rather than as a malformed request.
#[test]
fn the_authorization_url_escapes_the_values_it_carries() {
    let url = build_authorization_url(
        &oauth_config(),
        "client-id",
        "http://127.0.0.1:5173/callback",
        "the-state",
        "the-challenge",
    )
    .expect("failed to build the authorization url");

    assert!(
        url.contains("redirect_uri=http%3A%2F%2F127.0.0.1%3A5173%2Fcallback"),
        "the redirect uri was not escaped: {url}"
    );
    assert!(
        !url.contains("drive.file email"),
        "the scope separator was not escaped: {url}"
    );
}

fn token_payload(fields: serde_json::Value) -> GoogleTokenResponse {
    serde_json::from_value(fields).expect("failed to build a token payload")
}

/// the sixty-second skew is what stops a token that is valid *now* from
/// expiring mid-request, so the boundary itself is the interesting case.
#[test]
fn an_access_token_is_stale_once_it_is_inside_the_refresh_skew() {
    let now = 1_700_000_000_000;

    assert!(access_token_is_fresh("token", None, now));
    assert!(access_token_is_fresh("token", Some(now + 60_001), now));
    assert!(!access_token_is_fresh("token", Some(now + 60_000), now));
    assert!(!access_token_is_fresh("token", Some(now + 59_999), now));
    assert!(!access_token_is_fresh("token", Some(now - 1), now));
}

#[test]
fn an_absent_access_token_is_never_fresh() {
    let now = 1_700_000_000_000;

    assert!(!access_token_is_fresh("", None, now));
    assert!(!access_token_is_fresh("   ", Some(now + 600_000), now));
}

#[test]
fn the_authorization_code_grant_replays_the_redirect_and_the_verifier() {
    let form = authorization_code_form(
        "client-id",
        Some("client-secret"),
        "http://127.0.0.1:5173/callback",
        "the-verifier",
        "the-code",
    )
    .into_iter()
    .collect::<HashMap<_, _>>();

    assert_eq!(
        form.get("grant_type").map(String::as_str),
        Some("authorization_code")
    );
    assert_eq!(form.get("client_id").map(String::as_str), Some("client-id"));
    assert_eq!(
        form.get("client_secret").map(String::as_str),
        Some("client-secret")
    );
    assert_eq!(
        form.get("redirect_uri").map(String::as_str),
        Some("http://127.0.0.1:5173/callback")
    );
    assert_eq!(
        form.get("code_verifier").map(String::as_str),
        Some("the-verifier")
    );
    assert_eq!(form.get("code").map(String::as_str), Some("the-code"));
}

#[test]
fn the_refresh_grant_sends_only_the_refresh_token() {
    let form = refresh_token_form("client-id", Some("client-secret"), "the-refresh-token")
        .into_iter()
        .collect::<HashMap<_, _>>();

    assert_eq!(
        form.get("grant_type").map(String::as_str),
        Some("refresh_token")
    );
    assert_eq!(form.get("client_id").map(String::as_str), Some("client-id"));
    assert_eq!(
        form.get("client_secret").map(String::as_str),
        Some("client-secret")
    );
    assert_eq!(
        form.get("refresh_token").map(String::as_str),
        Some("the-refresh-token")
    );
    assert_eq!(form.get("code"), None);
    assert_eq!(form.get("redirect_uri"), None);
}

/// google issues the desktop client id without a secret, and sending an empty
/// one is a rejected request rather than an ignored field.
#[test]
fn a_grant_omits_the_client_secret_when_there_is_none_configured() {
    for form in [
        authorization_code_form("client-id", None, "http://127.0.0.1/callback", "v", "c"),
        refresh_token_form("client-id", None, "the-refresh-token"),
    ] {
        assert!(
            !form.iter().any(|(key, _)| key == "client_secret"),
            "an unconfigured client secret still reached the request: {form:?}"
        );
    }
}

#[test]
fn a_granted_token_carries_its_expiry_as_an_absolute_instant() {
    let now = 1_700_000_000_000;
    let tokens = parse_token_response(
        200,
        token_payload(json!({
            "access_token": "the-access-token",
            "refresh_token": "the-refresh-token",
            "expires_in": 3599,
        })),
        now,
    )
    .expect("a well-formed grant was rejected");

    assert_eq!(tokens.access_token, "the-access-token");
    assert_eq!(tokens.refresh_token.as_deref(), Some("the-refresh-token"));
    assert_eq!(tokens.expires_at, Some(now + 3_599_000));
}

/// the refresh grant returns no refresh token of its own, and no expiry is a
/// token google has not told us how to age out.
#[test]
fn a_grant_may_omit_the_refresh_token_and_the_expiry() {
    let tokens = parse_token_response(
        200,
        token_payload(json!({ "access_token": "the-access-token" })),
        1_700_000_000_000,
    )
    .expect("a well-formed grant was rejected");

    assert_eq!(tokens.refresh_token, None);
    assert_eq!(tokens.expires_at, None);
}

/// a spent or revoked grant is the one refusal the caller can act on: it means
/// relink, and nothing about retrying will change it.
#[test]
fn a_dead_grant_is_reported_as_a_failed_precondition() {
    let error = parse_token_response(
        400,
        token_payload(json!({
            "error": "invalid_grant",
            "error_description": "Token has been expired or revoked.",
        })),
        1_700_000_000_000,
    )
    .expect_err("a dead grant was accepted");

    assert!(matches!(error, Error::PreconditionFailed { .. }));
    assert!(
        error
            .to_string()
            .contains("Token has been expired or revoked."),
        "google's own description was dropped: {error}"
    );
}

#[test]
fn any_other_refusal_keeps_googles_reported_detail() {
    let error = parse_token_response(
        401,
        token_payload(json!({
            "error": "invalid_client",
            "error_description": "The OAuth client was not found.",
            "error_uri": "https://example.test/oauth",
        })),
        1_700_000_000_000,
    )
    .expect_err("a refused grant was accepted");

    let message = error.to_string();

    assert!(message.contains("401"), "the status was dropped: {message}");
    assert!(
        message.contains("invalid_client"),
        "the code was dropped: {message}"
    );
    assert!(
        message.contains("The OAuth client was not found."),
        "the description was dropped: {message}"
    );
    assert!(
        message.contains("https://example.test/oauth"),
        "the reference url was dropped: {message}"
    );
}

/// a 200 with no token in it is not a success, and treating it as one stores an
/// empty credential that fails at the next call instead of this one.
#[test]
fn a_success_status_without_a_token_is_still_a_failure() {
    let error = parse_token_response(200, token_payload(json!({})), 1_700_000_000_000)
        .expect_err("an empty grant was accepted");

    assert!(error.to_string().contains("200"));
}

/// a policy that retries as production does but waits in milliseconds, so a
/// test asserting that backoff happened does not pay seconds for the answer.
fn fast_retry_policy(attempts: u32) -> DriveRetryPolicy {
    DriveRetryPolicy {
        attempts,
        base_delay: Duration::from_millis(150),
        max_delay: Duration::from_millis(600),
    }
}

fn transport(attempts: u32) -> DriveTransport {
    DriveTransport::with_retry_policy(fast_retry_policy(attempts))
        .expect("failed to build the drive transport")
}

fn json_response(status: u16, body: serde_json::Value) -> ScriptedResponse {
    ScriptedResponse::new(status, body.to_string())
}

#[test]
fn a_status_that_cannot_succeed_unchanged_is_not_retried() {
    for status in [400, 401, 403, 404, 409, 412, 418, 200] {
        assert!(
            !is_retryable(&Method::GET, status),
            "{status} was treated as worth issuing again"
        );
    }
}

#[test]
fn rate_limiting_and_a_sick_server_are_retried_on_replay_safe_methods() {
    for status in [429, 500, 502, 503, 504] {
        for method in [Method::GET, Method::DELETE, Method::PATCH] {
            assert!(
                is_retryable(&method, status),
                "{method} {status} was given up on"
            );
        }
    }
}

/// the rule that stops a lost response becoming a second snapshot in the
/// user's Drive: a create is a POST, and a POST is never issued twice.
#[test]
fn a_post_is_never_retried_however_the_remote_refused() {
    for status in [429, 500, 502, 503, 504] {
        assert!(
            !is_retryable(&Method::POST, status),
            "a post was replayed after {status}"
        );
    }
}

#[test]
fn the_wait_doubles_with_each_refusal_and_stops_at_the_ceiling() {
    let policy = DriveRetryPolicy {
        attempts: 6,
        base_delay: Duration::from_millis(500),
        max_delay: Duration::from_secs(2),
    };

    assert_eq!(retry_delay(&policy, 1, None), Duration::from_millis(500));
    assert_eq!(retry_delay(&policy, 2, None), Duration::from_secs(1));
    assert_eq!(retry_delay(&policy, 3, None), Duration::from_secs(2));
    assert_eq!(
        retry_delay(&policy, 4, None),
        Duration::from_secs(2),
        "the doubling ran past the ceiling"
    );
    assert_eq!(
        retry_delay(&policy, 60, None),
        Duration::from_secs(2),
        "a large attempt count overflowed instead of capping"
    );
}

#[test]
fn the_remotes_own_retry_after_wins_over_the_computed_wait() {
    let policy = DriveRetryPolicy {
        attempts: 3,
        base_delay: Duration::from_millis(500),
        max_delay: Duration::from_secs(30),
    };

    assert_eq!(
        retry_delay(&policy, 1, Some(Duration::from_secs(7))),
        Duration::from_secs(7)
    );
}

/// a remote asking for an hour is not a reason to hang the application; the
/// ceiling applies to what it asked for as much as to what we computed.
#[test]
fn a_retry_after_beyond_the_ceiling_is_capped() {
    let policy = DriveRetryPolicy {
        attempts: 3,
        base_delay: Duration::from_millis(500),
        max_delay: Duration::from_secs(8),
    };

    assert_eq!(
        retry_delay(&policy, 1, Some(Duration::from_secs(3600))),
        Duration::from_secs(8)
    );
}

#[test]
fn retry_after_is_read_in_the_delta_seconds_form() {
    assert_eq!(parse_retry_after("30"), Some(Duration::from_secs(30)));
    assert_eq!(parse_retry_after("  12 "), Some(Duration::from_secs(12)));
    assert_eq!(parse_retry_after("0"), Some(Duration::ZERO));
}

/// the http-date form is legal and deliberately unread — falling through to
/// the computed backoff is a correct answer for it.
#[test]
fn a_retry_after_that_is_not_a_count_of_seconds_is_ignored() {
    assert_eq!(parse_retry_after("Wed, 21 Oct 2015 07:28:00 GMT"), None);
    assert_eq!(parse_retry_after(""), None);
    assert_eq!(parse_retry_after("soon"), None);
    assert_eq!(parse_retry_after("-5"), None);
}

#[test]
fn each_refusal_category_maps_onto_its_own_error() {
    let body = json!({ "error": { "message": "the remote said why" } }).to_string();

    let expected = [
        (400, "invalidInput"),
        (413, "invalidInput"),
        (422, "invalidInput"),
        (401, "preconditionFailed"),
        (403, "forbidden"),
        (404, "notFound"),
        (409, "integrity"),
        (412, "integrity"),
        (429, "network"),
        (500, "network"),
        (503, "network"),
    ];

    for (status, code) in expected {
        let error = drive_error(status, &body);
        let wire = serde_json::to_value(&error).expect("failed to serialize the error");

        assert_eq!(
            wire,
            json!({ "code": code, "message": "the remote said why" }),
            "unexpected mapping for {status}"
        );
    }
}

#[test]
fn a_refusal_message_is_read_from_either_envelope_google_uses() {
    assert_eq!(
        drive_error(
            404,
            &json!({ "error": { "message": "File not found: abc." } }).to_string()
        )
        .to_string(),
        "File not found: abc."
    );
    assert_eq!(
        drive_error(
            400,
            &json!({ "error": "invalid_request", "error_description": "missing parameter" })
                .to_string()
        )
        .to_string(),
        "missing parameter"
    );
}

/// a proxy's html error page carries no message, and the status is then the
/// only thing that says anything at all — so it has to survive into the text.
#[test]
fn a_body_that_is_not_an_envelope_still_reports_the_status() {
    for body in ["<html>502 Bad Gateway</html>", "", "{}", r#"{"error":{}}"#] {
        let message = drive_error(502, body).to_string();

        assert!(
            message.contains("502"),
            "the status was lost for body {body:?}: {message}"
        );
    }
}

#[test]
fn a_successful_response_yields_its_body_and_a_refusal_yields_its_error() {
    let success = DriveResponse {
        status: 200,
        body: b"the payload".to_vec(),
    };

    assert_eq!(success.into_success(), Ok(b"the payload".to_vec()));

    let refusal = DriveResponse {
        status: 404,
        body: json!({ "error": { "message": "gone" } })
            .to_string()
            .into_bytes(),
    };

    assert_eq!(
        refusal.into_success(),
        Err(Error::NotFound {
            message: "gone".to_string()
        })
    );
}

#[tokio::test]
async fn a_request_carries_the_access_token_as_a_bearer_credential() {
    let server = TestDriveServer::start(vec![json_response(
        200,
        json!({ "id": "file-1", "name": "snapshot.db" }),
    )])
    .await;

    let file: DriveFile = transport(1)
        .send_json(
            "ya29.the-access-token",
            &DriveRequest::get(server.url("/files/file-1")),
        )
        .await
        .expect("the request failed");

    assert_eq!(file.id, "file-1");
    assert_eq!(server.request_count(), 1);

    let request = server.request(0);

    assert_eq!(request.method, "GET");
    assert_eq!(request.target, "/files/file-1");
    assert_eq!(
        request.header("authorization"),
        Some("Bearer ya29.the-access-token")
    );
    assert!(request.body.is_empty(), "a read sent a body");
}

#[tokio::test]
async fn a_json_request_declares_its_content_type_and_sends_its_document() {
    let server = TestDriveServer::start(vec![json_response(
        200,
        json!({ "id": "folder-1", "name": "rentable" }),
    )])
    .await;
    let document = json!({ "name": "rentable", "mimeType": "application/vnd.google-apps.folder" });

    let created: DriveFile = transport(1)
        .send_json(
            "token",
            &DriveRequest::json(
                Method::POST,
                server.url("/files"),
                document.to_string().into_bytes(),
            ),
        )
        .await
        .expect("the request failed");

    assert_eq!(created.id, "folder-1");

    let request = server.request(0);

    assert_eq!(request.method, "POST");
    assert_eq!(
        request.header("content-type"),
        Some("application/json; charset=UTF-8")
    );
    assert_eq!(request.body_as_text(), document.to_string());
}

/// the boundary in the content type and the one delimiting the parts are one
/// value; where they disagree Drive reads the whole upload as a single part.
#[tokio::test]
async fn a_multipart_upload_declares_the_boundary_its_body_uses() {
    let server = TestDriveServer::start(vec![json_response(
        200,
        json!({ "id": "snapshot-1", "name": "snapshot.db" }),
    )])
    .await;
    let boundary = "rentable-0d1c2b3a";
    let body = format!("--{boundary}\r\n\r\n{{}}\r\n--{boundary}--");

    let uploaded: DriveFile = transport(1)
        .send_json(
            "token",
            &DriveRequest::multipart(
                Method::PATCH,
                server.url("/upload/files/snapshot-1?uploadType=multipart"),
                boundary,
                body.clone().into_bytes(),
            ),
        )
        .await
        .expect("the request failed");

    assert_eq!(uploaded.id, "snapshot-1");

    let request = server.request(0);

    assert_eq!(request.method, "PATCH");
    assert_eq!(
        request.target,
        "/upload/files/snapshot-1?uploadType=multipart"
    );
    assert_eq!(
        request.header("content-type"),
        Some(format!("multipart/related; boundary={boundary}").as_str())
    );
    assert_eq!(request.body_as_text(), body);
}

#[tokio::test]
async fn a_transient_refusal_is_issued_again_and_then_succeeds() {
    let server = TestDriveServer::start(vec![
        ScriptedResponse::new(503, "service unavailable"),
        json_response(200, json!({ "id": "file-1", "name": "snapshot.db" })),
    ])
    .await;

    let file: DriveFile = transport(3)
        .send_json("token", &DriveRequest::get(server.url("/files/file-1")))
        .await
        .expect("a retryable refusal was not retried");

    assert_eq!(file.id, "file-1");
    assert_eq!(server.request_count(), 2);
}

#[tokio::test]
async fn the_transport_waits_longer_before_each_further_attempt() {
    let server = TestDriveServer::start(vec![
        ScriptedResponse::new(503, ""),
        ScriptedResponse::new(503, ""),
        json_response(200, json!({ "id": "file-1", "name": "snapshot.db" })),
    ])
    .await;

    let started = Instant::now();

    transport(3)
        .send_json::<DriveFile>("token", &DriveRequest::get(server.url("/files/file-1")))
        .await
        .expect("the request failed");

    // 150ms before the second attempt and 300ms before the third: doubling,
    // rather than the same wait twice.
    assert!(
        started.elapsed() >= Duration::from_millis(450),
        "the waits did not lengthen: {:?}",
        started.elapsed()
    );
    assert_eq!(server.request_count(), 3);
}

/// asserted as a lower bound rather than an upper one: a machine can always be
/// slower than expected, so only "it waited at least this long" is a fact about
/// the code rather than about the machine.
#[tokio::test]
async fn a_rate_limit_is_waited_out_for_as_long_as_the_remote_asked() {
    let server = TestDriveServer::start(vec![
        ScriptedResponse::new(429, "").with_header("retry-after", "1"),
        json_response(200, json!({ "id": "file-1", "name": "snapshot.db" })),
    ])
    .await;

    // a ceiling above what the remote asks for, so this measures whether the
    // request was obeyed rather than whether it was capped — which is the
    // separate question `a_retry_after_beyond_the_ceiling_is_capped` answers.
    let transport = DriveTransport::with_retry_policy(DriveRetryPolicy {
        attempts: 2,
        base_delay: Duration::from_millis(150),
        max_delay: Duration::from_secs(5),
    })
    .expect("failed to build the drive transport");

    let started = Instant::now();

    transport
        .send_json::<DriveFile>("token", &DriveRequest::get(server.url("/files/file-1")))
        .await
        .expect("the request failed");

    // a whole second, where the policy's own backoff would have waited 150ms.
    assert!(
        started.elapsed() >= Duration::from_secs(1),
        "the remote's retry-after was ignored in favour of the computed wait: {:?}",
        started.elapsed()
    );
    assert_eq!(server.request_count(), 2);
}

/// the transport's other retry path: not a refusal, but no answer at all. A
/// dropped connection is the shape a flaky network actually takes.
#[tokio::test]
async fn a_dropped_connection_is_tried_again_on_a_replay_safe_method() {
    let server = TestDriveServer::start(vec![
        ScriptedResponse::hangup(),
        json_response(200, json!({ "id": "file-1", "name": "snapshot.db" })),
    ])
    .await;

    let file: DriveFile = transport(3)
        .send_json("token", &DriveRequest::get(server.url("/files/file-1")))
        .await
        .expect("a dropped connection was not retried");

    assert_eq!(file.id, "file-1");
    assert_eq!(server.request_count(), 2);
}

/// a create whose response was lost may still have created the file, so the
/// one thing that must not happen is sending it again.
#[tokio::test]
async fn a_dropped_connection_does_not_replay_a_create() {
    let server = TestDriveServer::start(vec![
        ScriptedResponse::hangup(),
        json_response(
            200,
            json!({ "id": "a-duplicate-file", "name": "duplicate.db" }),
        ),
    ])
    .await;

    let error = transport(3)
        .send_json::<DriveFile>(
            "token",
            &DriveRequest::json(Method::POST, server.url("/files"), b"{}".to_vec()),
        )
        .await
        .expect_err("a post was replayed after the connection dropped");

    assert!(
        matches!(error, Error::Network { .. }),
        "unexpected: {error:?}"
    );
    assert_eq!(server.request_count(), 1);
}

#[tokio::test]
async fn a_refusal_that_never_clears_gives_up_after_the_last_attempt() {
    let server = TestDriveServer::start(vec![
        ScriptedResponse::new(503, ""),
        ScriptedResponse::new(503, ""),
        ScriptedResponse::new(503, ""),
        json_response(200, json!({ "id": "never-reached", "name": "never.db" })),
    ])
    .await;

    let error = transport(3)
        .send_json::<DriveFile>("token", &DriveRequest::get(server.url("/files/file-1")))
        .await
        .expect_err("an unending refusal was reported as success");

    assert!(
        matches!(error, Error::Network { .. }),
        "unexpected: {error:?}"
    );
    assert_eq!(
        server.request_count(),
        3,
        "the transport kept going past its attempt budget"
    );
}

#[tokio::test]
async fn a_create_is_issued_once_however_the_remote_refused() {
    let server = TestDriveServer::start(vec![
        ScriptedResponse::new(503, ""),
        json_response(
            200,
            json!({ "id": "a-duplicate-file", "name": "duplicate.db" }),
        ),
    ])
    .await;

    let error = transport(3)
        .send_json::<DriveFile>(
            "token",
            &DriveRequest::json(Method::POST, server.url("/files"), b"{}".to_vec()),
        )
        .await
        .expect_err("a post was replayed");

    assert!(
        matches!(error, Error::Network { .. }),
        "unexpected: {error:?}"
    );
    assert_eq!(
        server.request_count(),
        1,
        "a create was issued twice, which is how a duplicate snapshot appears"
    );
}

#[tokio::test]
async fn a_refusal_reaches_the_caller_as_its_typed_error() {
    let server = TestDriveServer::start(vec![json_response(
        404,
        json!({ "error": { "message": "File not found: missing." } }),
    )])
    .await;

    let error = transport(3)
        .send_json::<DriveFile>("token", &DriveRequest::get(server.url("/files/missing")))
        .await
        .expect_err("a missing file was reported as found");

    assert_eq!(
        error,
        Error::NotFound {
            message: "File not found: missing.".to_string()
        }
    );
}

/// a caller that treats one status as an answer rather than a failure — an
/// absent file read as absent — has to see the status before it is mapped.
#[tokio::test]
async fn a_refused_status_is_visible_to_a_caller_that_reads_it_itself() {
    let server = TestDriveServer::start(vec![ScriptedResponse::new(404, "")]).await;

    let response = transport(3)
        .send("token", &DriveRequest::get(server.url("/files/missing")))
        .await
        .expect("a refusal was reported as no answer at all");

    assert_eq!(response.status, 404);
    assert!(!response.is_success());
}

#[tokio::test]
async fn a_download_yields_the_bytes_the_remote_sent() {
    let contents = vec![0x00, 0x01, 0xff, 0xfe, b'r', b'e', b'n', b't'];
    let server = TestDriveServer::start(vec![ScriptedResponse::new(200, contents.clone())]).await;

    let downloaded = transport(3)
        .send(
            "token",
            &DriveRequest::get(server.url("/files/snapshot-1?alt=media")),
        )
        .await
        .expect("the download failed")
        .into_success()
        .expect("the download was refused");

    assert_eq!(downloaded, contents);
}

#[tokio::test]
async fn a_delete_sends_no_body_and_answers_with_an_empty_success() {
    let server = TestDriveServer::start(vec![ScriptedResponse::new(204, "")]).await;

    let response = transport(3)
        .send("token", &DriveRequest::delete(server.url("/files/file-1")))
        .await
        .expect("the delete failed");

    assert!(response.is_success());
    assert_eq!(response.body, Vec::<u8>::new());

    let request = server.request(0);

    assert_eq!(request.method, "DELETE");
    assert_eq!(request.header("authorization"), Some("Bearer token"));
}

/// nothing in these tests may reach Google. Every request goes to a loopback
/// address the test itself bound, and this pins that rather than trusting it.
#[tokio::test]
async fn the_test_harness_serves_from_loopback_and_never_from_the_live_api() {
    let server = TestDriveServer::start(vec![json_response(
        200,
        json!({ "id": "file-1", "name": "snapshot.db" }),
    )])
    .await;
    let url = server.url("/files/file-1");

    assert!(
        url.starts_with("http://127.0.0.1:"),
        "the harness was not bound to loopback: {url}"
    );
}

fn drive_files(server: &TestDriveServer) -> DriveFiles {
    DriveFiles::with_transport(
        transport(1),
        DriveEndpoints {
            api_base_url: server.url(""),
            upload_base_url: server.url("/upload"),
        },
    )
}

fn drive_workspace() -> RemoteSyncWorkspace {
    RemoteSyncWorkspace {
        id: "workspace-1".to_string(),
        name: "Primary workspace".to_string(),
        ..RemoteSyncWorkspace::default()
    }
}

fn file_json(id: &str, name: &str) -> serde_json::Value {
    json!({ "id": id, "name": name })
}

fn snapshot_json(id: &str, name: &str, created_at: i64) -> serde_json::Value {
    json!({
        "id": id,
        "name": name,
        "appProperties": {
            "rentableType": "snapshot",
            "rentableSource": "autosave",
            "rentableCreatedAt": created_at.to_string(),
        },
    })
}

fn listing(files: Vec<serde_json::Value>) -> ScriptedResponse {
    json_response(200, json!({ "files": files }))
}

fn manifest_json() -> serde_json::Value {
    json!({
        "metadata": manifest_metadata_json(),
        "entries": [manifest_entry_json("head-1", "7", 3000)],
        "head": manifest_entry_json("head-1", "7", 3000),
    })
}

fn fixture_manifest() -> GoogleDriveManifest {
    normalize_google_drive_manifest(&manifest_json()).expect("the fixture manifest is not valid")
}

#[test]
fn a_quote_in_a_query_value_cannot_close_the_literal_it_sits_in() {
    assert_eq!(escape_drive_query("o'brien"), "o\\'brien");
    assert_eq!(escape_drive_query("'"), "\\'");
    assert_eq!(escape_drive_query("nothing to escape"), "nothing to escape");
}

#[test]
fn a_backslash_is_doubled_before_the_ones_quote_escaping_adds() {
    assert_eq!(escape_drive_query("a\\b"), "a\\\\b");

    // the pair together is what the other escaping order corrupts: the value's
    // own backslash would be read as escaping the escape, leaving the quote
    // free to close the literal and the rest of the value read as a query.
    assert_eq!(escape_drive_query("a\\'b"), "a\\\\\\'b");
}

#[test]
fn the_default_endpoints_are_googles_own() {
    let endpoints = DriveEndpoints::default();

    assert!(
        endpoints
            .api_base_url
            .starts_with("https://www.googleapis.com/drive/"),
        "the default api endpoint was {}",
        endpoints.api_base_url
    );
    assert!(
        endpoints
            .upload_base_url
            .starts_with("https://www.googleapis.com/upload/drive/"),
        "the default upload endpoint was {}",
        endpoints.upload_base_url
    );
}

#[tokio::test]
async fn a_listing_asks_for_the_fields_it_reads_and_answers_with_the_files() {
    let server = TestDriveServer::start(vec![listing(vec![
        file_json("file-1", "snapshot-1.db"),
        file_json("file-2", "snapshot-2.db"),
    ])])
    .await;

    let listed = drive_files(&server)
        .list("token", "trashed=false", 25, Some("modifiedTime desc"))
        .await
        .expect("the listing failed");

    assert_eq!(
        listed
            .iter()
            .map(|file| file.id.as_str())
            .collect::<Vec<_>>(),
        ["file-1", "file-2"]
    );

    let request = server.request(0);

    assert_eq!(request.method, "GET");
    assert!(request.target.starts_with("/files?"));
    assert!(request.target.contains("pageSize=25"));
    assert!(request.target.contains("spaces=drive"));
    assert!(request.target.contains("orderBy=modifiedTime+desc"));
    assert!(
        request.target.contains("md5Checksum") && request.target.contains("appProperties"),
        "the listing did not ask for the fields it reads: {}",
        request.target
    );
}

#[tokio::test]
async fn a_listing_orders_only_when_it_was_asked_to() {
    let server = TestDriveServer::start(vec![listing(vec![])]).await;

    drive_files(&server)
        .list("token", "trashed=false", 10, None)
        .await
        .expect("the listing failed");

    assert!(!server.request(0).target.contains("orderBy"));
}

#[tokio::test]
async fn finding_a_file_asks_the_remote_for_one() {
    let server =
        TestDriveServer::start(vec![listing(vec![file_json("file-1", "manifest.json")])]).await;

    let found = drive_files(&server)
        .find("token", "name='manifest.json'", None)
        .await
        .expect("the search failed");

    assert_eq!(found.map(|file| file.id), Some("file-1".to_string()));
    assert!(server.request(0).target.contains("pageSize=1"));
}

#[tokio::test]
async fn finding_nothing_is_an_answer_rather_than_a_failure() {
    let server = TestDriveServer::start(vec![listing(vec![])]).await;

    let found = drive_files(&server)
        .find("token", "name='manifest.json'", None)
        .await
        .expect("the search failed");

    assert!(found.is_none());
}

#[tokio::test]
async fn getting_a_file_asks_for_every_field_this_app_reads() {
    let server = TestDriveServer::start(vec![json_response(
        200,
        file_json("file-1", "snapshot-1.db"),
    )])
    .await;

    let file = drive_files(&server)
        .try_get("token", "file-1")
        .await
        .expect("the read failed");

    assert_eq!(
        file.map(|file| file.name),
        Some("snapshot-1.db".to_string())
    );

    let target = server.request(0).target;

    assert!(target.starts_with("/files/file-1?"));
    assert!(target.contains("appProperties"));
}

#[tokio::test]
async fn a_file_that_is_gone_reads_as_absent_rather_than_as_a_failure() {
    let server = TestDriveServer::start(vec![json_response(
        404,
        json!({ "error": { "message": "File not found: file-1." } }),
    )])
    .await;

    let file = drive_files(&server)
        .try_get("token", "file-1")
        .await
        .expect("a missing file was reported as a failure");

    assert!(file.is_none());
}

#[tokio::test]
async fn a_file_this_app_was_never_granted_reads_as_absent() {
    let server = TestDriveServer::start(vec![json_response(
        403,
        json!({
            "error": {
                "message": "The user has not granted the app 000 read access to the file 111."
            }
        }),
    )])
    .await;

    let file = drive_files(&server)
        .try_get("token", "file-1")
        .await
        .expect("an ungranted file was reported as a failure");

    assert!(file.is_none());
}

#[tokio::test]
async fn a_refusal_that_is_not_about_this_apps_grant_stays_a_refusal() {
    let server = TestDriveServer::start(vec![json_response(
        403,
        json!({ "error": { "message": "The user's Drive storage quota has been exceeded." } }),
    )])
    .await;

    assert!(matches!(
        drive_files(&server).try_get("token", "file-1").await,
        Err(Error::Forbidden { .. })
    ));
}

#[tokio::test]
async fn deleting_a_file_that_is_already_gone_is_success() {
    let server = TestDriveServer::start(vec![json_response(404, json!({}))]).await;

    drive_files(&server)
        .delete("token", "file-1")
        .await
        .expect("deleting an absent file was reported as a failure");

    let request = server.request(0);

    assert_eq!(request.method, "DELETE");
    assert_eq!(request.target, "/files/file-1");
    assert!(request.body.is_empty());
}

#[tokio::test]
async fn a_delete_the_remote_refuses_reaches_the_caller() {
    let server = TestDriveServer::start(vec![json_response(
        403,
        json!({ "error": { "message": "insufficient permissions" } }),
    )])
    .await;

    assert!(matches!(
        drive_files(&server).delete("token", "file-1").await,
        Err(Error::Forbidden { .. })
    ));
}

#[tokio::test]
async fn a_download_asks_for_the_media_and_yields_the_bytes() {
    let server =
        TestDriveServer::start(vec![ScriptedResponse::new(200, b"sqlite bytes".to_vec())]).await;

    let bytes = drive_files(&server)
        .download("token", "file-1")
        .await
        .expect("the download failed");

    assert_eq!(bytes, b"sqlite bytes".to_vec());
    assert!(server.request(0).target.contains("alt=media"));
}

#[tokio::test]
async fn creating_a_folder_posts_its_metadata_as_json() {
    let server = TestDriveServer::start(vec![json_response(
        200,
        file_json("folder-1", "Rentable Sync"),
    )])
    .await;

    let created = drive_files(&server)
        .create_metadata_file("token", &json!({ "name": "Rentable Sync" }))
        .await
        .expect("the folder was not created");

    assert_eq!(created.id, "folder-1");

    let request = server.request(0);

    assert_eq!(request.method, "POST");
    assert_eq!(
        request.header("content-type"),
        Some("application/json; charset=UTF-8")
    );
    assert_eq!(request.body_as_text(), "{\"name\":\"Rentable Sync\"}");
}

#[tokio::test]
async fn an_upload_sends_its_metadata_and_its_bytes_in_one_multipart_body() {
    let server = TestDriveServer::start(vec![json_response(
        200,
        file_json("file-1", "snapshot-1.db"),
    )])
    .await;

    drive_files(&server)
        .upload(
            "token",
            &DriveUpload {
                file_id: None,
                name: "snapshot-1.db".to_string(),
                parents: vec!["folder-1".to_string()],
                mime_type: "application/x-sqlite3".to_string(),
                app_properties: BTreeMap::from([(
                    "rentableType".to_string(),
                    "snapshot".to_string(),
                )]),
                content: b"sqlite bytes".to_vec(),
            },
        )
        .await
        .expect("the upload failed");

    let request = server.request(0);

    assert_eq!(request.method, "POST");
    assert!(request.target.starts_with("/upload/files?"));
    assert!(request.target.contains("uploadType=multipart"));

    let boundary = request
        .header("content-type")
        .and_then(|value| value.strip_prefix("multipart/related; boundary="))
        .expect("the upload declared no boundary")
        .to_string();
    let body = request.body_as_text();

    assert!(body.starts_with(&format!(
        "--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n"
    )));
    assert!(body.contains("\"name\":\"snapshot-1.db\""));
    assert!(body.contains("\"parents\":[\"folder-1\"]"));
    assert!(body.contains("\"rentableType\":\"snapshot\""));
    assert!(body.contains("\r\nContent-Type: application/x-sqlite3\r\n\r\nsqlite bytes"));
    assert!(body.ends_with(&format!("\r\n--{boundary}--")));
}

#[tokio::test]
async fn an_upload_naming_a_file_updates_it_and_does_not_move_it() {
    let server = TestDriveServer::start(vec![json_response(
        200,
        file_json("file-1", "snapshot-1.db"),
    )])
    .await;

    drive_files(&server)
        .upload(
            "token",
            &DriveUpload {
                file_id: Some("file-1".to_string()),
                name: "snapshot-1.db".to_string(),
                parents: vec!["folder-1".to_string()],
                mime_type: "application/x-sqlite3".to_string(),
                app_properties: BTreeMap::new(),
                content: b"sqlite bytes".to_vec(),
            },
        )
        .await
        .expect("the upload failed");

    let request = server.request(0);

    assert_eq!(request.method, "PATCH");
    assert!(request.target.starts_with("/upload/files/file-1?"));
    assert!(
        !request.body_as_text().contains("parents"),
        "an update named a parent, which asks drive to move the file"
    );
}

#[tokio::test]
async fn a_workspace_folder_is_found_by_the_identifier_it_recorded() {
    let server = TestDriveServer::start(vec![json_response(
        200,
        file_json("folder-1", "Primary workspace"),
    )])
    .await;
    let workspace = RemoteSyncWorkspace {
        remote_folder_id: Some("folder-1".to_string()),
        ..drive_workspace()
    };

    let folder = drive_files(&server)
        .resolve_existing_workspace_folder("token", &workspace)
        .await
        .expect("the folder was not resolved");

    assert_eq!(folder.map(|folder| folder.id), Some("folder-1".to_string()));
    assert_eq!(
        server.request_count(),
        1,
        "a folder the workspace already names should not be searched for"
    );
}

#[tokio::test]
async fn a_forgotten_folder_is_recovered_through_a_file_the_workspace_still_tracks() {
    let server = TestDriveServer::start(vec![
        json_response(404, json!({})),
        json_response(
            200,
            json!({ "id": "manifest-1", "name": "manifest.json", "parents": ["folder-1"] }),
        ),
        json_response(200, file_json("folder-1", "Primary workspace")),
    ])
    .await;
    let workspace = RemoteSyncWorkspace {
        remote_folder_id: Some("folder-gone".to_string()),
        remote_manifest_file_id: Some("manifest-1".to_string()),
        ..drive_workspace()
    };

    let folder = drive_files(&server)
        .resolve_existing_workspace_folder("token", &workspace)
        .await
        .expect("the folder was not resolved");

    assert_eq!(folder.map(|folder| folder.id), Some("folder-1".to_string()));
}

#[tokio::test]
async fn a_workspace_folder_is_found_by_its_workspace_property_under_the_root() {
    let server = TestDriveServer::start(vec![
        listing(vec![file_json("root-1", "Rentable Sync")]),
        listing(vec![file_json("folder-1", "Primary workspace")]),
    ])
    .await;

    let folder = drive_files(&server)
        .resolve_existing_workspace_folder("token", &drive_workspace())
        .await
        .expect("the folder was not resolved");

    assert_eq!(folder.map(|folder| folder.id), Some("folder-1".to_string()));

    let workspace_query = server.request(1).target;

    assert!(
        workspace_query.contains("rentableWorkspaceId") && workspace_query.contains("root-1"),
        "the workspace folder was not looked for under the root: {workspace_query}"
    );
}

#[tokio::test]
async fn the_most_recently_touched_workspace_folder_is_the_last_resort() {
    let server = TestDriveServer::start(vec![
        listing(vec![file_json("root-1", "Rentable Sync")]),
        listing(vec![]),
        listing(vec![file_json("folder-2", "Some other workspace")]),
    ])
    .await;

    let folder = drive_files(&server)
        .resolve_existing_workspace_folder("token", &drive_workspace())
        .await
        .expect("the folder was not resolved");

    assert_eq!(folder.map(|folder| folder.id), Some("folder-2".to_string()));
    assert!(
        server
            .request(2)
            .target
            .contains("orderBy=modifiedTime+desc")
    );
}

#[tokio::test]
async fn no_root_folder_means_this_workspace_has_no_folder_yet() {
    let server = TestDriveServer::start(vec![listing(vec![])]).await;

    let folder = drive_files(&server)
        .resolve_existing_workspace_folder("token", &drive_workspace())
        .await
        .expect("resolving reported a failure rather than an absence");

    assert!(folder.is_none());
}

#[tokio::test]
async fn ensuring_a_folder_creates_the_root_before_the_workspace_folder() {
    let server = TestDriveServer::start(vec![
        listing(vec![]),
        listing(vec![]),
        json_response(200, file_json("root-1", "Rentable Sync")),
        json_response(200, file_json("folder-1", "Primary workspace")),
    ])
    .await;

    let folder = drive_files(&server)
        .ensure_workspace_folder("token", &drive_workspace())
        .await
        .expect("the folder was not created");

    assert_eq!(folder.id, "folder-1");

    let root_creation = server.request(2).body_as_text();

    assert!(root_creation.contains("\"name\":\"Rentable Sync\""));
    assert!(root_creation.contains("application/vnd.google-apps.folder"));
    assert!(root_creation.contains("\"rentableType\":\"root\""));

    let folder_creation = server.request(3).body_as_text();

    assert!(folder_creation.contains("\"name\":\"Primary workspace\""));
    assert!(folder_creation.contains("\"parents\":[\"root-1\"]"));
    assert!(folder_creation.contains("\"rentableWorkspaceId\":\"workspace-1\""));
}

#[tokio::test]
async fn ensuring_a_folder_reuses_a_root_that_already_exists() {
    let server = TestDriveServer::start(vec![
        listing(vec![file_json("root-1", "Rentable Sync")]),
        listing(vec![]),
        listing(vec![]),
        listing(vec![file_json("root-1", "Rentable Sync")]),
        json_response(200, file_json("folder-1", "Primary workspace")),
    ])
    .await;

    let folder = drive_files(&server)
        .ensure_workspace_folder("token", &drive_workspace())
        .await
        .expect("the folder was not created");

    assert_eq!(folder.id, "folder-1");
    assert_eq!(
        server.request_count(),
        5,
        "a root folder that already exists was created a second time"
    );
}

#[tokio::test]
async fn snapshots_are_listed_by_property_and_by_name_without_repeating_one() {
    let server = TestDriveServer::start(vec![
        listing(vec![snapshot_json("file-1", "snapshot-new.db", 3000)]),
        listing(vec![
            snapshot_json("file-1", "snapshot-new.db", 3000),
            snapshot_json("file-2", "snapshot-old.db", 1000),
            file_json("file-3", "notes.txt"),
        ]),
    ])
    .await;

    let snapshots = drive_files(&server)
        .list_workspace_snapshot_files("token", "folder-1")
        .await
        .expect("the snapshots were not listed");

    assert_eq!(
        snapshots
            .iter()
            .map(|file| file.id.as_str())
            .collect::<Vec<_>>(),
        ["file-1", "file-2"],
        "a file was repeated, dropped, or ordered wrongly"
    );
}

#[tokio::test]
async fn a_file_named_unlike_a_snapshot_is_not_taken_for_one() {
    let server = TestDriveServer::start(vec![
        listing(vec![]),
        listing(vec![
            file_json("file-1", "holiday-snapshot-photos.zip"),
            file_json("file-2", "snapshot-1.txt"),
        ]),
    ])
    .await;

    let snapshots = drive_files(&server)
        .list_workspace_snapshot_files("token", "folder-1")
        .await
        .expect("the snapshots were not listed");

    assert!(
        snapshots.is_empty(),
        "a file this application never wrote was taken for a snapshot"
    );
}

#[tokio::test]
async fn a_manifest_is_found_in_the_folder_and_read() {
    let server = TestDriveServer::start(vec![
        listing(vec![json!({ "id": "manifest-1", "name": "manifest.json" })]),
        ScriptedResponse::new(200, manifest_json().to_string()),
    ])
    .await;

    let resolved = drive_files(&server)
        .resolve_manifest("token", &drive_workspace(), "folder-1")
        .await
        .expect("resolving the manifest failed")
        .expect("no manifest was resolved");

    assert_eq!(resolved.file.id, "manifest-1");
    assert_eq!(
        resolved.manifest.map(|manifest| manifest.head.file_id),
        Some("head-1".to_string())
    );
    assert!(server.request(0).target.contains("manifest.json"));
}

#[tokio::test]
async fn a_tracked_manifest_of_this_folder_is_read_without_a_search() {
    let server = TestDriveServer::start(vec![
        json_response(
            200,
            json!({
                "id": "manifest-1",
                "name": "manifest.json",
                "parents": ["folder-1"],
                "appProperties": { "rentableType": "manifest" },
            }),
        ),
        ScriptedResponse::new(200, manifest_json().to_string()),
    ])
    .await;
    let workspace = RemoteSyncWorkspace {
        remote_manifest_file_id: Some("manifest-1".to_string()),
        ..drive_workspace()
    };

    let resolved = drive_files(&server)
        .resolve_manifest("token", &workspace, "folder-1")
        .await
        .expect("resolving the manifest failed")
        .expect("no manifest was resolved");

    assert_eq!(resolved.file.id, "manifest-1");
    assert_eq!(
        server.request_count(),
        2,
        "a manifest the workspace already names was searched for anyway"
    );
}

#[tokio::test]
async fn a_tracked_manifest_belonging_to_another_folder_is_not_this_folders_manifest() {
    let server = TestDriveServer::start(vec![
        json_response(
            200,
            json!({
                "id": "manifest-elsewhere",
                "name": "manifest.json",
                "parents": ["folder-other"],
                "appProperties": { "rentableType": "manifest" },
            }),
        ),
        listing(vec![json!({ "id": "manifest-1", "name": "manifest.json" })]),
        ScriptedResponse::new(200, manifest_json().to_string()),
    ])
    .await;
    let workspace = RemoteSyncWorkspace {
        remote_manifest_file_id: Some("manifest-elsewhere".to_string()),
        ..drive_workspace()
    };

    let resolved = drive_files(&server)
        .resolve_manifest("token", &workspace, "folder-1")
        .await
        .expect("resolving the manifest failed")
        .expect("no manifest was resolved");

    assert_eq!(resolved.file.id, "manifest-1");
}

#[tokio::test]
async fn content_that_is_not_a_manifest_and_no_snapshots_to_rebuild_from_resolves_to_the_file_alone()
 {
    let server = TestDriveServer::start(vec![
        listing(vec![json!({ "id": "manifest-1", "name": "manifest.json" })]),
        ScriptedResponse::new(200, b"not json at all".to_vec()),
        listing(vec![]),
        listing(vec![]),
    ])
    .await;

    let resolved = drive_files(&server)
        .resolve_manifest("token", &drive_workspace(), "folder-1")
        .await
        .expect("resolving the manifest failed")
        .expect("no manifest file was resolved");

    assert_eq!(resolved.file.id, "manifest-1");
    assert!(
        resolved.manifest.is_none(),
        "unreadable content was read as a manifest"
    );
}

#[tokio::test]
async fn a_folder_holding_no_manifest_and_no_snapshots_resolves_to_nothing() {
    let server =
        TestDriveServer::start(vec![listing(vec![]), listing(vec![]), listing(vec![])]).await;

    let resolved = drive_files(&server)
        .resolve_manifest("token", &drive_workspace(), "folder-1")
        .await
        .expect("resolving reported a failure rather than an absence");

    assert!(resolved.is_none());
}

#[tokio::test]
async fn a_folder_whose_manifest_is_gone_has_one_rebuilt_from_the_snapshots_present() {
    let server = TestDriveServer::start(vec![
        listing(vec![]),
        listing(vec![snapshot_json("snap-1", "snapshot-1.db", 5_000)]),
        listing(vec![]),
        ScriptedResponse::new(200, b"the snapshot bytes".to_vec()),
        json_response(200, file_json("manifest-9", "manifest.json")),
    ])
    .await;

    let resolved = drive_files(&server)
        .resolve_manifest("token", &drive_workspace(), "folder-1")
        .await
        .expect("resolving the manifest failed")
        .expect("no manifest was rebuilt");

    assert_eq!(resolved.file.id, "manifest-9");
    assert_eq!(
        resolved
            .manifest
            .as_ref()
            .map(|manifest| manifest.head.file_id.as_str()),
        Some("snap-1")
    );
    assert_eq!(
        resolved
            .manifest
            .and_then(|manifest| manifest.head.content_hash),
        Some(content_hash_hex(b"the snapshot bytes")),
        "the rebuilt head was not fingerprinted from the bytes actually there"
    );

    let write = server.request(4);

    assert_eq!(write.method, "POST");
    assert!(write.body_as_text().contains("\"parents\":[\"folder-1\"]"));
}

#[tokio::test]
async fn a_manifest_that_cannot_be_read_is_rebuilt_over_rather_than_left_beside_a_new_one() {
    let server = TestDriveServer::start(vec![
        listing(vec![json!({ "id": "manifest-1", "name": "manifest.json" })]),
        ScriptedResponse::new(200, b"not json at all".to_vec()),
        listing(vec![snapshot_json("snap-1", "snapshot-1.db", 5_000)]),
        listing(vec![]),
        ScriptedResponse::new(200, b"the snapshot bytes".to_vec()),
        json_response(200, file_json("manifest-1", "manifest.json")),
    ])
    .await;

    let resolved = drive_files(&server)
        .resolve_manifest("token", &drive_workspace(), "folder-1")
        .await
        .expect("resolving the manifest failed")
        .expect("no manifest was rebuilt");

    assert_eq!(resolved.file.id, "manifest-1");

    let write = server.request(5);

    assert_eq!(write.method, "PATCH");
    assert!(
        write.target.contains("/files/manifest-1"),
        "the rebuild was written somewhere other than the unreadable manifest: {}",
        write.target
    );
}

#[tokio::test]
async fn saving_a_manifest_writes_it_into_the_folder_as_json() {
    let server = TestDriveServer::start(vec![
        listing(vec![]),
        json_response(200, file_json("manifest-2", "manifest.json")),
    ])
    .await;

    let saved = drive_files(&server)
        .save_manifest(
            "token",
            &drive_workspace(),
            "folder-1",
            None,
            &fixture_manifest(),
        )
        .await
        .expect("the manifest was not saved");

    assert_eq!(saved.file.id, "manifest-2");
    assert!(!saved.was_rebuilt);

    let body = server.request(1).body_as_text();

    assert!(body.contains("\"name\":\"manifest.json\""));
    assert!(body.contains("\"parents\":[\"folder-1\"]"));
    assert!(body.contains("\"rentableType\":\"manifest\""));
    assert!(body.contains("\"rentableWorkspaceId\":\"workspace-1\""));
    assert!(
        body.contains("\"fileId\": \"head-1\""),
        "the manifest itself never reached the body"
    );
}

#[tokio::test]
async fn saving_a_manifest_twice_leaves_the_folder_holding_one() {
    let server = TestDriveServer::start(vec![
        listing(vec![]),
        json_response(200, file_json("manifest-1", "manifest.json")),
        listing(vec![file_json("manifest-1", "manifest.json")]),
        json_response(200, file_json("manifest-1", "manifest.json")),
    ])
    .await;
    let files = drive_files(&server);
    let workspace = drive_workspace();

    let first = files
        .save_manifest("token", &workspace, "folder-1", None, &fixture_manifest())
        .await
        .expect("the first save failed");
    let second = files
        .save_manifest(
            "token",
            &workspace,
            "folder-1",
            Some(&first.file),
            &fixture_manifest(),
        )
        .await
        .expect("the second save failed");

    assert_eq!(second.file.id, first.file.id);
    assert!(!second.was_rebuilt);

    let rewrite = server.request(3);

    // a create is a POST, and Drive answers one by adding a file rather than by
    // replacing the one already there. Naming the file is the whole difference.
    assert_eq!(rewrite.method, "PATCH");
    assert!(
        rewrite.target.contains("/files/manifest-1"),
        "the second save did not name the first: {}",
        rewrite.target
    );
    assert!(
        !rewrite.body_as_text().contains("parents"),
        "an update named a parent, which asks drive to move the file"
    );
}

#[tokio::test]
async fn a_manifest_another_client_replaced_is_rebuilt_and_the_write_still_succeeds() {
    let server = TestDriveServer::start(vec![
        listing(vec![json!({
            "id": "manifest-1",
            "name": "manifest.json",
            "version": "9",
        })]),
        listing(vec![snapshot_json("snap-2", "snapshot-2.db", 6_000)]),
        listing(vec![]),
        ScriptedResponse::new(200, b"the snapshot bytes".to_vec()),
        json_response(200, file_json("manifest-1", "manifest.json")),
    ])
    .await;
    let expected = DriveFile {
        version: Some("3".to_string()),
        ..drive_file("manifest-1")
    };

    let saved = drive_files(&server)
        .save_manifest(
            "token",
            &drive_workspace(),
            "folder-1",
            Some(&expected),
            &fixture_manifest(),
        )
        .await
        .expect("a concurrent overwrite was reported as a failure");

    // drive offers no compare-and-set, so refusing the write would trade a
    // recoverable event for one the user has to act on. The snapshots are the
    // source of truth and the index is derived from them, so it is rebuilt and
    // the write goes through.
    assert!(saved.was_rebuilt);
    assert_eq!(saved.manifest.head.file_id, "snap-2");
    assert_eq!(saved.file.id, "manifest-1");

    // the index the caller was about to write is stale, not worthless: a folder
    // listing does not say which version of this application wrote a snapshot,
    // so a rebuild that ignored it would report "unknown" for something already
    // recorded.
    assert_eq!(saved.manifest.head.app_version, "1.0.0");
}

#[tokio::test]
async fn a_rebuilt_manifest_is_the_one_the_builder_would_have_produced_from_the_same_files() {
    let server = TestDriveServer::start(vec![
        listing(vec![]),
        listing(vec![snapshot_json("snap-1", "snapshot-1.db", 5_000)]),
        listing(vec![]),
        ScriptedResponse::new(200, b"the snapshot bytes".to_vec()),
        json_response(200, file_json("manifest-9", "manifest.json")),
    ])
    .await;

    let rebuilt = drive_files(&server)
        .resolve_manifest("token", &drive_workspace(), "folder-1")
        .await
        .expect("resolving the manifest failed")
        .and_then(|resolved| resolved.manifest)
        .expect("no manifest was rebuilt");

    let mut file = snapshot("snap-1", "autosave", 5_000);
    file.name = "snapshot-1.db".to_string();
    let expected = build_google_drive_manifest_from_snapshots(
        "workspace-1",
        "Primary workspace",
        &choose_retained_workspace_snapshots(&[file.clone()]),
        &file,
        &GoogleDriveManifestEntryOverrides {
            content_hash: Some(content_hash_hex(b"the snapshot bytes")),
            ..GoogleDriveManifestEntryOverrides::default()
        },
        None,
        rebuilt.metadata.updated_at,
    )
    .expect("the comparison manifest should build");

    assert_eq!(rebuilt, expected);
}

#[tokio::test]
async fn a_head_the_remote_no_longer_holds_has_no_state() {
    let server = TestDriveServer::start(vec![json_response(404, json!({}))]).await;

    let state = drive_files(&server)
        .resolve_remote_head_state("token", &fixture_manifest())
        .await
        .expect("resolving reported a failure rather than an absence");

    assert!(state.is_none());
}

#[tokio::test]
async fn an_unchanged_head_carrying_a_digest_is_taken_at_the_manifests_word() {
    let digest = "a".repeat(64);
    let mut manifest = fixture_manifest();
    manifest.head.content_hash = Some(digest.clone());

    let server = TestDriveServer::start(vec![json_response(
        200,
        file_json("head-1", "snapshot-head-1.db"),
    )])
    .await;

    let state = drive_files(&server)
        .resolve_remote_head_state("token", &manifest)
        .await
        .expect("resolving the head failed")
        .expect("the head was reported as gone");

    assert!(!state.changed_from_manifest);
    assert_eq!(state.content_hash, Some(digest));
    assert_eq!(
        server.request_count(),
        1,
        "a head that had not moved was downloaded to be hashed again"
    );
}

#[tokio::test]
async fn a_head_that_moved_on_is_hashed_from_the_bytes_the_remote_now_holds() {
    let bytes = b"the newer snapshot".to_vec();
    let server = TestDriveServer::start(vec![
        json_response(
            200,
            json!({ "id": "head-1", "name": "snapshot-head-1.db", "version": "9" }),
        ),
        ScriptedResponse::new(200, bytes.clone()),
    ])
    .await;

    let state = drive_files(&server)
        .resolve_remote_head_state("token", &fixture_manifest())
        .await
        .expect("resolving the head failed")
        .expect("the head was reported as gone");

    assert!(state.changed_from_manifest);
    assert_eq!(state.content_hash, Some(content_hash_hex(&bytes)));
}

#[tokio::test]
async fn a_head_whose_bytes_cannot_be_read_is_still_reported_as_present() {
    let server = TestDriveServer::start(vec![
        json_response(
            200,
            json!({ "id": "head-1", "name": "snapshot-head-1.db", "version": "9" }),
        ),
        json_response(
            403,
            json!({ "error": { "message": "The user's Drive storage quota has been exceeded." } }),
        ),
    ])
    .await;

    let state = drive_files(&server)
        .resolve_remote_head_state("token", &fixture_manifest())
        .await
        .expect("resolving the head failed")
        .expect("a head whose bytes could not be read was reported as gone");

    assert!(state.changed_from_manifest);
    assert!(state.content_hash.is_none());
}

#[tokio::test]
async fn the_account_read_asks_for_the_fields_it_maps_and_answers_with_them() {
    let server = TestDriveServer::start(vec![json_response(
        200,
        json!({
            "user": {
                "displayName": "Amal Nasser",
                "emailAddress": "amal@example.com",
                "photoLink": "https://lh3.example.com/a/amal",
                "permissionId": "17420938475",
            },
            "storageQuota": { "limit": "16106127360", "usage": "4294967296" },
        }),
    )])
    .await;

    let account = drive_files(&server)
        .read_account_details("ya29.the-access-token")
        .await
        .expect("the account read failed");

    assert_eq!(
        account,
        GoogleDriveAccountDetails {
            email: Some("amal@example.com".to_string()),
            display_name: Some("Amal Nasser".to_string()),
            avatar_url: Some("https://lh3.example.com/a/amal".to_string()),
            provider_user_id: Some("17420938475".to_string()),
            drive_quota_bytes: Some(16_106_127_360),
            drive_usage_bytes: Some(4_294_967_296),
        }
    );

    let request = server.request(0);

    assert_eq!(request.method, "GET");
    assert!(request.target.starts_with("/about?"));
    assert_eq!(
        request.header("authorization"),
        Some("Bearer ya29.the-access-token")
    );
    assert!(
        ["displayName", "emailAddress", "photoLink", "permissionId"]
            .iter()
            .all(|field| request.target.contains(field)),
        "the account read did not ask for the identity it maps: {}",
        request.target
    );
    assert!(
        request.target.contains("storageQuota"),
        "the account read did not ask for the storage figures: {}",
        request.target
    );
}

/// a name Drive omitted has to stay distinguishable from one it sent, because
/// the two callers of this read disagree about what to do with the absence —
/// linking labels the account by its address, refreshing keeps the name already
/// recorded. A fallback applied here would settle that for both of them.
#[tokio::test]
async fn a_name_or_address_that_is_only_whitespace_reads_as_absent() {
    let server = TestDriveServer::start(vec![json_response(
        200,
        json!({
            "user": { "displayName": "   ", "emailAddress": "  amal@example.com  " },
            "storageQuota": { "limit": "16106127360", "usage": "0" },
        }),
    )])
    .await;

    let account = drive_files(&server)
        .read_account_details("token")
        .await
        .expect("the account read failed");

    assert_eq!(account.email, Some("amal@example.com".to_string()));
    assert_eq!(account.display_name, None);
    assert_eq!(account.drive_usage_bytes, Some(0));
}

#[tokio::test]
async fn an_account_drive_described_nothing_about_reads_as_empty_rather_than_failing() {
    let server = TestDriveServer::start(vec![json_response(200, json!({}))]).await;

    let account = drive_files(&server)
        .read_account_details("token")
        .await
        .expect("the account read failed");

    assert_eq!(account, GoogleDriveAccountDetails::default());
}

/// an unlimited allowance is reported by omitting the limit, so an absent
/// figure has to stay absent — a zero here would read as a full disk.
#[tokio::test]
async fn a_storage_figure_that_is_not_a_whole_byte_count_is_absent_rather_than_zero() {
    let server = TestDriveServer::start(vec![json_response(
        200,
        json!({
            "user": { "emailAddress": "amal@example.com" },
            "storageQuota": { "usage": "not a number" },
        }),
    )])
    .await;

    let account = drive_files(&server)
        .read_account_details("token")
        .await
        .expect("the account read failed");

    assert_eq!(account.drive_quota_bytes, None);
    assert_eq!(account.drive_usage_bytes, None);
}
