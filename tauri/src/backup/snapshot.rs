use std::{fs, path::Path, time::UNIX_EPOCH};

use crate::timestamp;

pub(super) struct SnapshotFileInfo {
    pub(super) filename: String,
    pub(super) created_at: i64,
}

pub(super) fn list_snapshot_files(backup_dir: &Path) -> Result<Vec<SnapshotFileInfo>, String> {
    let mut snapshots = fs::read_dir(backup_dir)
        .map_err(|error| error.to_string())?
        .filter_map(|entry| entry.ok())
        .filter_map(|entry| {
            let path = entry.path();
            let file_type = entry.file_type().ok()?;
            if !file_type.is_file() {
                return None;
            }

            let filename = path.file_name()?.to_str()?.to_string();
            if !is_snapshot_filename(&filename) {
                return None;
            }

            Some(SnapshotFileInfo {
                created_at: snapshot_timestamp_from_path(&path),
                filename,
            })
        })
        .collect::<Vec<_>>();

    snapshots.sort_by(|left, right| {
        right
            .created_at
            .cmp(&left.created_at)
            .then_with(|| right.filename.cmp(&left.filename))
    });

    Ok(snapshots)
}

fn is_snapshot_filename(filename: &str) -> bool {
    filename.starts_with("snapshot-") && filename.ends_with(".db")
}

fn snapshot_timestamp_from_path(path: &Path) -> i64 {
    path.file_name()
        .and_then(|filename| filename.to_str())
        .and_then(snapshot_timestamp_from_filename)
        .or_else(|| {
            fs::metadata(path)
                .ok()
                .and_then(|metadata| metadata.modified().ok())
                .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
                .and_then(|duration| i64::try_from(duration.as_secs()).ok())
        })
        .unwrap_or_else(timestamp::now)
}

fn snapshot_timestamp_from_filename(filename: &str) -> Option<i64> {
    filename
        .strip_prefix("snapshot-")
        .and_then(|filename| filename.strip_suffix(".db"))
        .and_then(|timestamp| timestamp.parse::<i64>().ok())
        .filter(|timestamp| *timestamp > 0)
}
