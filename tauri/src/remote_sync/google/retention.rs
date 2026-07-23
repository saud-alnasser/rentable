//! remote retention concerns: which snapshots pushes produce. The retention port
//! (#114) lands here.

use crate::backup::BackupSource;

use super::transport::GoogleDrivePreparePushInput;

pub(crate) fn google_drive_push_snapshot_source(
    input: Option<&GoogleDrivePreparePushInput>,
) -> BackupSource {
    if input.map(|entry| entry.manual).unwrap_or(false) {
        BackupSource::Manual
    } else {
        BackupSource::Autosave
    }
}
