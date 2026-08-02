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

#[cfg(test)]
mod tests {
    use std::{path::PathBuf, sync::Arc};

    use tokio::{runtime::Runtime, sync::RwLock};

    use super::{GoogleDriveSyncLockAcquireInput, GoogleDriveSyncLockReleaseInput};
    use crate::{
        error::Error,
        persisted::Persisted,
        settings::Settings,
        sync::{RemoteSync, google::auth::clear_test_google_drive_credentials_store},
    };

    fn unique_dir(name: &str) -> PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("system time before unix epoch")
            .as_nanos();

        std::env::temp_dir()
            .join("rentable-tests")
            .join(format!("{}-{}", name, nanos))
    }

    async fn setup_remote_sync(root: &std::path::Path) -> RemoteSync {
        std::fs::create_dir_all(root).expect("failed to create test root");

        let settings_path = root.join(Settings::FILENAME);
        let mut settings =
            Persisted::<Settings>::load(settings_path).expect("failed to load settings");
        settings.database_path = root.join("app.db");
        settings.commit().expect("failed to commit settings");

        RemoteSync::new(
            Arc::new(RwLock::new(settings)),
            root.join(RemoteSync::FILENAME),
        )
        .await
        .expect("failed to initialize remote sync")
    }

    #[test]
    fn sync_lock_acquire_returns_a_workspace_scoped_lease() {
        clear_test_google_drive_credentials_store();

        Runtime::new()
            .expect("failed to create tokio runtime")
            .block_on(async {
                let root = unique_dir("remote-sync-lock-lease");
                let mut remote_sync = setup_remote_sync(&root).await;

                let lease = remote_sync
                    .acquire_google_drive_sync_lock(GoogleDriveSyncLockAcquireInput {
                        workspace_id: "workspace-1".to_string(),
                    })
                    .expect("failed to acquire free sync lock");

                assert!(
                    lease.lease_id.starts_with("google-drive-sync-workspace-1-"),
                    "unexpected lease id shape: {}",
                    lease.lease_id
                );

                let _ = std::fs::remove_dir_all(&root);
            });
    }

    #[test]
    fn sync_lock_requires_a_workspace_id() {
        clear_test_google_drive_credentials_store();

        Runtime::new()
            .expect("failed to create tokio runtime")
            .block_on(async {
                let root = unique_dir("remote-sync-lock-requires-workspace");
                let mut remote_sync = setup_remote_sync(&root).await;

                let error = remote_sync
                    .acquire_google_drive_sync_lock(GoogleDriveSyncLockAcquireInput {
                        workspace_id: String::new(),
                    })
                    .expect_err("expected an empty workspace id to be rejected");

                assert_eq!(
                    error,
                    Error::InvalidInput {
                        message: "a google drive sync lock needs a workspace".to_string()
                    }
                );

                let _ = std::fs::remove_dir_all(&root);
            });
    }

    #[test]
    fn sync_lock_is_exclusive_and_names_the_holder() {
        clear_test_google_drive_credentials_store();

        Runtime::new()
            .expect("failed to create tokio runtime")
            .block_on(async {
                let root = unique_dir("remote-sync-lock-exclusive");
                let mut remote_sync = setup_remote_sync(&root).await;

                remote_sync
                    .acquire_google_drive_sync_lock(GoogleDriveSyncLockAcquireInput {
                        workspace_id: "workspace-1".to_string(),
                    })
                    .expect("failed to acquire free sync lock");

                let error = remote_sync
                    .acquire_google_drive_sync_lock(GoogleDriveSyncLockAcquireInput {
                        workspace_id: "workspace-2".to_string(),
                    })
                    .expect_err("expected a held lock to reject a second acquire");

                assert_eq!(
                    error,
                    Error::Busy {
                        message: "a google drive sync is already running for workspace workspace-1"
                            .to_string()
                    }
                );

                let _ = std::fs::remove_dir_all(&root);
            });
    }

    #[test]
    fn sync_lock_release_frees_only_with_the_matching_lease() {
        clear_test_google_drive_credentials_store();

        Runtime::new()
            .expect("failed to create tokio runtime")
            .block_on(async {
                let root = unique_dir("remote-sync-lock-release");
                let mut remote_sync = setup_remote_sync(&root).await;

                let lease = remote_sync
                    .acquire_google_drive_sync_lock(GoogleDriveSyncLockAcquireInput {
                        workspace_id: "workspace-1".to_string(),
                    })
                    .expect("failed to acquire free sync lock");

                // a release with the wrong lease id is ignored; the lock stays held.
                remote_sync.release_google_drive_sync_lock(GoogleDriveSyncLockReleaseInput {
                    lease_id: "not-the-lease".to_string(),
                });
                remote_sync
                    .acquire_google_drive_sync_lock(GoogleDriveSyncLockAcquireInput {
                        workspace_id: "workspace-2".to_string(),
                    })
                    .expect_err("expected the lock to survive a mismatched release");

                // releasing with the matching lease frees the lock for the next acquire.
                remote_sync.release_google_drive_sync_lock(GoogleDriveSyncLockReleaseInput {
                    lease_id: lease.lease_id,
                });
                remote_sync
                    .acquire_google_drive_sync_lock(GoogleDriveSyncLockAcquireInput {
                        workspace_id: "workspace-2".to_string(),
                    })
                    .expect("failed to acquire the lock after a matching release");

                let _ = std::fs::remove_dir_all(&root);
            });
    }
}
