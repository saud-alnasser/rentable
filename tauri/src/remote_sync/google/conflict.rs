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
use super::transport::{DriveFile, SNAPSHOT_CONTENT_HASH_PROPERTY, parse_drive_number};

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
