use serde::{Deserialize, Serialize};

use crate::{error::Error, timestamp};

use super::store::{RemoteSync, sanitize_string};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleDriveSyncLockAcquireInput {
    pub workspace_id: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleDriveSyncLockLease {
    pub lease_id: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleDriveSyncLockReleaseInput {
    pub lease_id: String,
}

#[derive(Clone, Debug)]
pub(super) struct GoogleDriveSyncLock {
    pub(super) lease_id: String,
    pub(super) workspace_id: String,
}

impl RemoteSync {
    pub fn acquire_google_drive_sync_lock(
        &mut self,
        input: GoogleDriveSyncLockAcquireInput,
    ) -> Result<GoogleDriveSyncLockLease, Error> {
        let workspace_id = sanitize_string(&input.workspace_id);

        if workspace_id.is_empty() {
            return Err(Error::InvalidInput {
                message: "a google drive sync lock needs a workspace".to_string(),
            });
        }

        if let Some(existing_lock) = &self.google_drive_sync_lock {
            return Err(Error::Busy {
                message: format!(
                    "a google drive sync is already running for workspace {}",
                    existing_lock.workspace_id
                ),
            });
        }

        let lease_id = format!("google-drive-sync-{}-{}", workspace_id, timestamp::now());
        self.google_drive_sync_lock = Some(GoogleDriveSyncLock {
            lease_id: lease_id.clone(),
            workspace_id,
        });

        Ok(GoogleDriveSyncLockLease { lease_id })
    }

    pub fn release_google_drive_sync_lock(&mut self, input: GoogleDriveSyncLockReleaseInput) {
        let lease_id = sanitize_string(&input.lease_id);

        if self
            .google_drive_sync_lock
            .as_ref()
            .map(|lock| lock.lease_id == lease_id)
            .unwrap_or(false)
        {
            self.google_drive_sync_lock = None;
        }
    }
}
