//! remote retention concerns: which snapshots pushes produce, and which
//! survive a cleanup. The retention port (#114) lands here.

use std::cmp::Ordering;
use std::collections::{HashMap, HashSet};

use super::metadata::{
    DriveFile, GoogleDriveSnapshotSource, parse_drive_snapshot_created_at, parse_drive_timestamp,
    try_parse_drive_snapshot_source,
};

/// a snapshot a cleanup keeps, paired with the source it was kept for.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GoogleDriveRetainedSnapshot {
    pub file: DriveFile,
    pub source: GoogleDriveSnapshotSource,
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

/// the snapshots a cleanup may delete, in the order they were given.
///
/// Not simply the ones retention did not keep, and the difference is the whole
/// point: a snapshot declaring a source this application does not recognise is
/// never retained, and that is not a judgement that it is stale — it is this
/// policy having no opinion about a file it cannot account for. Evicting one on
/// the strength of an absent opinion is exactly what the rule above refuses.
pub fn choose_evictable_workspace_snapshots<'a>(
    snapshot_files: &'a [DriveFile],
    retained_file_ids: &[&str],
) -> Vec<&'a DriveFile> {
    let retained_file_ids = retained_file_ids.iter().copied().collect::<HashSet<_>>();

    snapshot_files
        .iter()
        .filter(|file| {
            !retained_file_ids.contains(file.id.as_str())
                && try_parse_drive_snapshot_source(file).is_some()
        })
        .collect()
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

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use super::{
        choose_evictable_workspace_snapshots, choose_retained_workspace_snapshots,
        compare_drive_files_by_snapshot_recency,
    };
    use crate::sync::google::metadata::{DriveFile, GoogleDriveSnapshotSource};
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

    #[test]
    fn everything_retention_did_not_keep_is_evictable() {
        let files = [
            snapshot("kept", "autosave", 400),
            snapshot("older", "autosave", 300),
            snapshot("oldest", "autosave", 100),
        ];

        let evictable = choose_evictable_workspace_snapshots(&files, &["kept"]);

        assert_eq!(
            evictable
                .iter()
                .map(|file| file.id.as_str())
                .collect::<Vec<_>>(),
            ["older", "oldest"]
        );
    }

    /// the asymmetry the whole rule turns on: not retained and evictable are two
    /// different answers, and a source this application cannot read produces the
    /// first without producing the second.
    #[test]
    fn a_snapshot_whose_source_cannot_be_read_is_neither_retained_nor_evictable() {
        let files = [
            snapshot("unlabelled", "recovery", 500),
            snapshot("kept", "manual", 100),
        ];

        assert!(
            choose_retained_workspace_snapshots(&files)
                .iter()
                .all(|entry| entry.file.id != "unlabelled")
        );
        assert!(
            choose_evictable_workspace_snapshots(&files, &["kept"]).is_empty(),
            "a snapshot this application cannot account for was offered up for deletion"
        );
    }

    #[test]
    fn a_snapshot_declaring_no_properties_at_all_is_not_evictable() {
        let files = [drive_file("named-like-ours")];
        let evictable = choose_evictable_workspace_snapshots(&files, &[]);

        assert!(
            evictable.is_empty(),
            "a file recognised only by its name was offered up for deletion"
        );
    }

    #[test]
    fn nothing_can_be_evicted_from_nothing() {
        assert!(choose_evictable_workspace_snapshots(&[], &["kept"]).is_empty());
    }
}
