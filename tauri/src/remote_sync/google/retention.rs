//! remote retention concerns: which snapshots pushes produce, and which
//! survive a cleanup. The retention port (#114) lands here.

use std::cmp::Ordering;
use std::collections::{HashMap, HashSet};

use crate::backup::BackupSource;

use super::metadata::{
    DriveFile, GoogleDriveSnapshotSource, parse_drive_snapshot_created_at, parse_drive_timestamp,
    try_parse_drive_snapshot_source,
};
use super::transport::GoogleDrivePreparePushInput;

/// a snapshot a cleanup keeps, paired with the source it was kept for.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GoogleDriveRetainedSnapshot {
    pub file: DriveFile,
    pub source: GoogleDriveSnapshotSource,
}

pub(crate) fn google_drive_push_snapshot_source(
    input: Option<&GoogleDrivePreparePushInput>,
) -> BackupSource {
    if input.map(|entry| entry.manual).unwrap_or(false) {
        BackupSource::Manual
    } else {
        BackupSource::Autosave
    }
}

/// the newest snapshot of each source, which is the whole remote retention
/// policy: one manual copy and one automatic one. Deleting everything else is
/// the caller's job — this decides only what survives.
///
/// A file declaring no source this application recognises is never retained,
/// and a caller must not delete it on the strength of this answer: it is not
/// ours to judge.
pub fn choose_retained_workspace_snapshots(
    snapshot_files: &[DriveFile],
) -> Vec<GoogleDriveRetainedSnapshot> {
    let mut sorted_files = snapshot_files.iter().collect::<Vec<_>>();
    sorted_files.sort_by(|left, right| compare_drive_files_by_snapshot_recency(left, right));

    let mut latest_by_source: HashMap<GoogleDriveSnapshotSource, &DriveFile> = HashMap::new();

    for file in sorted_files {
        let Some(source) = try_parse_drive_snapshot_source(file) else {
            continue;
        };

        latest_by_source.entry(source).or_insert(file);
    }

    let mut retained: Vec<GoogleDriveRetainedSnapshot> = Vec::new();
    let mut retained_ids: HashSet<String> = HashSet::new();

    for source in [
        GoogleDriveSnapshotSource::Manual,
        GoogleDriveSnapshotSource::Autosave,
    ] {
        let Some(file) = latest_by_source.get(&source) else {
            continue;
        };

        if retained_ids.insert(file.id.clone()) {
            retained.push(GoogleDriveRetainedSnapshot {
                file: (*file).clone(),
                source,
            });
        }
    }

    retained
        .sort_by(|left, right| compare_drive_files_by_snapshot_recency(&left.file, &right.file));

    retained
}

/// newest first. Capture time is what a snapshot is ordered by; Drive's own
/// modification time only breaks a tie, because a file rewritten in place
/// still represents the moment it was captured. The identifier breaks the
/// remaining tie, so the order is total and a cleanup is reproducible.
pub fn compare_drive_files_by_snapshot_recency(left: &DriveFile, right: &DriveFile) -> Ordering {
    let left_created_at = parse_drive_snapshot_created_at(left).unwrap_or(0);
    let right_created_at = parse_drive_snapshot_created_at(right).unwrap_or(0);

    right_created_at
        .cmp(&left_created_at)
        .then_with(|| {
            let left_modified_at =
                parse_drive_timestamp(left.modified_time.as_deref()).unwrap_or(0);
            let right_modified_at =
                parse_drive_timestamp(right.modified_time.as_deref()).unwrap_or(0);

            right_modified_at.cmp(&left_modified_at)
        })
        .then_with(|| right.id.cmp(&left.id))
}
