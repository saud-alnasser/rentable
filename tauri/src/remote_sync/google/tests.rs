use std::collections::HashMap;

use serde_json::json;

use crate::error::Error;

use super::super::store::RemoteSyncWorkspace;
use super::{
    auth::{
        GoogleDriveConfig, GoogleTokenResponse, access_token_is_fresh, authorization_code_form,
        build_authorization_url, parse_token_response, pkce_challenge, random_url_safe_token,
        refresh_token_form,
    },
    conflict::{
        GoogleDriveConflictKind, GoogleDriveHeadObservation, GoogleDriveRecommendedMode,
        GoogleDriveResolvedHead, GoogleDriveSyncAction, GoogleDriveSyncMode,
        analyze_sync_resolution, did_remote_head_change_from_manifest, has_local_snapshot,
        is_cryptographic_content_hash, normalize_content_hash, should_refresh_remote_manifest_head,
    },
    manifest::{
        GoogleDriveManifest, GoogleDriveManifestEntry, GoogleDriveManifestEntryOverrides,
        GoogleDriveManifestMetadata, build_manifest_entry_from_drive_file,
        compare_manifest_entries_newest_first, is_canonical_snapshot_filename,
        is_tracked_manifest_file_for_folder, normalize_google_drive_manifest,
    },
    retention::{choose_retained_workspace_snapshots, compare_drive_files_by_snapshot_recency},
    transport::{
        DriveFile, GoogleDriveSnapshotSource, parse_drive_number, parse_drive_snapshot_created_at,
        parse_drive_timestamp, try_parse_drive_snapshot_source,
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
