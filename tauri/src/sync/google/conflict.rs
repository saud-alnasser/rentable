//! content fingerprints and pull validation. The conflict-analysis port (#114) lands
//! here.
//!
//! Conflict analysis decides, from what is already known about both sides,
//! whether a sync may proceed on its own and in which direction — or whether
//! the two have diverged far enough that only the user can choose. It reads no
//! files and issues no requests: everything it needs is passed to it, so the
//! decision can be exercised across every divergence case by calling it.

use sha2::{Digest, Sha256};

use serde::{Deserialize, Serialize};

use crate::error::Error;

use super::super::store::RemoteSyncWorkspace;
use super::manifest::{GoogleDriveManifest, GoogleDriveManifestEntry};
use super::metadata::{DriveFile, SNAPSHOT_CONTENT_HASH_PROPERTY, parse_drive_number};

/// the length of a SHA-256 digest written as hexadecimal.
const CONTENT_HASH_LENGTH: usize = 64;

pub(crate) fn content_hash_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

/// one spelling for a hash, so that two of them can be compared at all.
/// A blank hash is returned as absent, because "" and "not recorded" mean the
/// same thing here and only one of them should have to be handled downstream.
pub fn normalize_content_hash(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_ascii_lowercase)
}

/// whether a hash is a full digest rather than a weaker fingerprint. Drive's
/// own checksums and older metadata both appear in the same field, so a value
/// being present is not enough to compare content by.
pub fn is_cryptographic_content_hash(value: Option<&str>) -> bool {
    normalize_content_hash(value).is_some_and(|value| {
        value.len() == CONTENT_HASH_LENGTH && value.bytes().all(|byte| byte.is_ascii_hexdigit())
    })
}

/// what a sync run was asked to do. `Sync` is the only mode that may decide
/// for itself; `Push` and `Pull` are the user having already decided.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum GoogleDriveSyncMode {
    Sync,
    Push,
    Pull,
}

/// what a sync run did.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum GoogleDriveSyncAction {
    None,
    Pushed,
    Pulled,
}

/// the direction offered to the user when they have to choose. Narrower than
/// [`GoogleDriveSyncMode`]: "decide for me" is not an answer to a conflict.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum GoogleDriveRecommendedMode {
    Push,
    Pull,
}

/// why the user is being asked.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum GoogleDriveConflictKind {
    /// both sides hold work and this is the first sync between them.
    Link,
    /// both sides have moved since they last agreed.
    Sync,
    /// the remote cannot be read as a manifest.
    Corrupt,
    /// the remote is intact but no longer the one this workspace was linked to.
    Relink,
}

/// the head snapshot as the remote currently reports it, which is not
/// necessarily what the manifest claims it is.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GoogleDriveResolvedHead {
    pub file: DriveFile,
    pub content_hash: Option<String>,
    pub changed_from_manifest: bool,
}

/// what a caller has already found out about both sides. Every field is
/// optional because establishing any of it costs a request or a database read,
/// and the modes that do not need it do not pay for it.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct GoogleDriveHeadObservation {
    pub local_content_hash: Option<String>,
    pub remote_content_hash: Option<String>,
    pub remote_head_revision: Option<String>,
    pub remote_head_changed: bool,
    pub remote_head: Option<GoogleDriveResolvedHead>,
    pub should_refresh_manifest_head: bool,
}

/// the decision, and the bookkeeping that follows from it.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GoogleDriveSyncResolution {
    pub action: GoogleDriveSyncAction,
    pub requires_resolution: bool,
    pub recommended_mode: GoogleDriveRecommendedMode,
    pub conflict_kind: Option<GoogleDriveConflictKind>,
    /// the two sides already agree, but the workspace has not recorded that it
    /// has seen this remote state. Nothing transfers; the record catches up.
    pub should_mark_synced_without_pull: bool,
    /// the manifest's head no longer describes the file it points at, so the
    /// manifest itself needs rewriting.
    pub should_refresh_manifest_head: bool,
    pub remote_head: Option<GoogleDriveResolvedHead>,
}

/// decide what a sync run should do.
///
/// In `Push` or `Pull` the user has already chosen and the answer is that
/// choice. In `Sync` the decision rests on two questions — has the remote moved
/// since this workspace last saw it, and has the local workspace moved since it
/// last synced — and the interesting answer is when both are yes.
///
/// Content hashes settle both questions when they are available, because equal
/// content is not a conflict however far the timestamps have drifted. Without
/// them the fallback is capture times against the last sync, which is why a
/// caller that can afford to fingerprint both sides should.
///
/// A conflict is never resolved here. The result says a user must choose and
/// which way to lean; acting on it is the caller's.
pub fn analyze_sync_resolution(
    workspace: &RemoteSyncWorkspace,
    manifest: Option<&GoogleDriveManifest>,
    mode: GoogleDriveSyncMode,
    observation: &GoogleDriveHeadObservation,
) -> GoogleDriveSyncResolution {
    let settled = |action, recommended_mode| GoogleDriveSyncResolution {
        action,
        requires_resolution: false,
        recommended_mode,
        conflict_kind: None,
        should_mark_synced_without_pull: false,
        should_refresh_manifest_head: observation.should_refresh_manifest_head,
        remote_head: observation.remote_head.clone(),
    };

    match mode {
        GoogleDriveSyncMode::Push => {
            return settled(
                GoogleDriveSyncAction::Pushed,
                GoogleDriveRecommendedMode::Push,
            );
        }
        GoogleDriveSyncMode::Pull => {
            return settled(
                GoogleDriveSyncAction::Pulled,
                GoogleDriveRecommendedMode::Pull,
            );
        }
        GoogleDriveSyncMode::Sync => {}
    }

    // no manifest is an empty remote, and an empty remote is filled rather
    // than reconciled with.
    let Some(manifest) = manifest else {
        return settled(
            GoogleDriveSyncAction::Pushed,
            GoogleDriveRecommendedMode::Push,
        );
    };

    let local_content_hash = normalize_content_hash(observation.local_content_hash.as_deref());
    let remote_content_hash = normalize_content_hash(
        observation
            .remote_content_hash
            .as_deref()
            .or(manifest.head.content_hash.as_deref()),
    );
    let local_matches_remote =
        local_content_hash.is_some() && local_content_hash == remote_content_hash;

    let remote_head_revision = observation
        .remote_head_revision
        .as_deref()
        .or(Some(manifest.head.revision.as_str()));
    let known_head_revision = workspace.remote_head_revision.as_deref().unwrap_or("");
    let remote_changed = manifest.metadata.updated_at
        > workspace.last_remote_updated_at.unwrap_or(0)
        || remote_head_revision != Some(known_head_revision)
        || observation.remote_head_changed;

    let has_synced = workspace.last_synced_at.unwrap_or(0) != 0;
    let has_remote_head_file = workspace
        .remote_head_file_id
        .as_deref()
        .is_some_and(|file_id| !file_id.is_empty());

    if local_matches_remote {
        return GoogleDriveSyncResolution {
            action: GoogleDriveSyncAction::None,
            requires_resolution: false,
            recommended_mode: GoogleDriveRecommendedMode::Pull,
            conflict_kind: None,
            should_mark_synced_without_pull: remote_changed || !has_synced || !has_remote_head_file,
            should_refresh_manifest_head: observation.should_refresh_manifest_head
                || observation.remote_head_changed,
            remote_head: observation.remote_head.clone(),
        };
    }

    // work on both sides and nothing yet agreed between them: there is no last
    // sync to reason from, so neither side can be called the newer one.
    if has_local_snapshot(workspace) && !has_synced && !has_remote_head_file {
        return GoogleDriveSyncResolution {
            action: GoogleDriveSyncAction::None,
            requires_resolution: true,
            recommended_mode: GoogleDriveRecommendedMode::Push,
            conflict_kind: Some(GoogleDriveConflictKind::Link),
            should_mark_synced_without_pull: false,
            should_refresh_manifest_head: observation.should_refresh_manifest_head,
            remote_head: observation.remote_head.clone(),
        };
    }

    let last_synced_at = workspace.last_synced_at.unwrap_or(0);
    let local_snapshot_at = workspace.last_snapshot_at.unwrap_or(0);
    let local_changed = match (&local_content_hash, &remote_content_hash) {
        (Some(local), Some(remote)) => local != remote,
        _ => local_snapshot_at > last_synced_at || !has_remote_head_file,
    };

    if remote_changed && local_changed && last_synced_at > 0 {
        return GoogleDriveSyncResolution {
            action: GoogleDriveSyncAction::None,
            requires_resolution: true,
            recommended_mode: if local_snapshot_at >= manifest.metadata.updated_at {
                GoogleDriveRecommendedMode::Push
            } else {
                GoogleDriveRecommendedMode::Pull
            },
            conflict_kind: Some(GoogleDriveConflictKind::Sync),
            should_mark_synced_without_pull: false,
            should_refresh_manifest_head: observation.should_refresh_manifest_head,
            remote_head: observation.remote_head.clone(),
        };
    }

    let action = if remote_changed {
        GoogleDriveSyncAction::Pulled
    } else if local_changed {
        GoogleDriveSyncAction::Pushed
    } else {
        GoogleDriveSyncAction::None
    };

    settled(
        action,
        if remote_changed && !local_changed {
            GoogleDriveRecommendedMode::Pull
        } else {
            GoogleDriveRecommendedMode::Push
        },
    )
}

/// whether the manifest's record of its head has fallen behind the file it
/// points at. A rewritten head leaves the manifest describing content that is
/// no longer there, and every later comparison would be against a stale hash.
pub fn should_refresh_remote_manifest_head(
    head: &GoogleDriveManifestEntry,
    remote_head: &GoogleDriveResolvedHead,
) -> bool {
    if remote_head.changed_from_manifest {
        return true;
    }

    let manifest_content_hash = normalize_content_hash(head.content_hash.as_deref());
    let remote_content_hash = normalize_content_hash(remote_head.content_hash.as_deref());

    remote_content_hash.is_some() && remote_content_hash != manifest_content_hash
}

/// whether this workspace holds a snapshot of its own — either a capture time
/// or the filename of one.
pub fn has_local_snapshot(workspace: &RemoteSyncWorkspace) -> bool {
    workspace.last_snapshot_at.unwrap_or(0) != 0
        || workspace
            .last_snapshot_filename
            .as_deref()
            .is_some_and(|filename| !filename.is_empty())
}

/// a field Drive did not populate, told apart from one it populated as blank.
/// Both mean "this says nothing about the file", and only the first arrives as
/// `None`.
fn stated(value: Option<&str>) -> Option<&str> {
    value.filter(|value| !value.is_empty())
}

/// whether the file Drive reports is the one the manifest describes.
///
/// Each field is compared only when the file states it: Drive returns only the
/// fields a query asked for, so an unstated value is silence rather than a
/// difference, and treating it as a change would make every partial response
/// look like a conflict.
pub fn did_remote_head_change_from_manifest(
    head: &GoogleDriveManifestEntry,
    file: &DriveFile,
) -> bool {
    if file.id != head.file_id {
        return true;
    }

    if stated(file.version.as_deref()).is_some_and(|version| version != head.revision) {
        return true;
    }

    if stated(file.modified_time.as_deref())
        .is_some_and(|modified_time| Some(modified_time) != stated(head.modified_time.as_deref()))
    {
        return true;
    }

    if parse_drive_number(file.size.as_deref()).is_some_and(|size| Some(size) != head.size_bytes) {
        return true;
    }

    if stated(file.md5_checksum.as_deref())
        .is_some_and(|checksum| Some(checksum) != stated(head.md5_checksum.as_deref()))
    {
        return true;
    }

    let file_content_hash =
        normalize_content_hash(file.app_property(SNAPSHOT_CONTENT_HASH_PROPERTY));
    let manifest_content_hash = normalize_content_hash(head.content_hash.as_deref());

    file_content_hash.is_some() && file_content_hash != manifest_content_hash
}

pub(crate) fn validate_google_drive_pull_content_hash(
    expected_content_hash: Option<&str>,
    bytes: &[u8],
) -> Result<(), Error> {
    let Some(expected_content_hash) = expected_content_hash
        .map(|value| value.trim().to_ascii_lowercase())
        .filter(|value| !value.is_empty())
    else {
        return Ok(());
    };

    let actual_content_hash = content_hash_hex(bytes);
    if actual_content_hash != expected_content_hash {
        return Err(Error::Integrity {
            message: "remote snapshot content hash mismatch".to_string(),
        });
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{content_hash_hex, validate_google_drive_pull_content_hash};

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

    use std::collections::HashMap;

    use super::{
        GoogleDriveConflictKind, GoogleDriveHeadObservation, GoogleDriveRecommendedMode,
        GoogleDriveResolvedHead, GoogleDriveSyncAction, GoogleDriveSyncMode,
        analyze_sync_resolution, did_remote_head_change_from_manifest, has_local_snapshot,
        is_cryptographic_content_hash, normalize_content_hash, should_refresh_remote_manifest_head,
    };
    use crate::sync::{
        google::manifest::{
            GoogleDriveManifest, GoogleDriveManifestEntry, GoogleDriveManifestMetadata,
        },
        google::metadata::{DriveFile, GoogleDriveSnapshotSource},
        store::RemoteSyncWorkspace,
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
}
