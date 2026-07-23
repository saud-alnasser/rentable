use super::{
    GoogleDriveLinkCompleteInput, GoogleDriveLinkSession, GoogleDriveLinkSessionLookupInput,
    GoogleDriveLinkSessionStatus, GoogleDrivePreparePushInput, GoogleDriveSyncLockAcquireInput,
    GoogleDriveSyncLockReleaseInput, RemoteSync, RemoteSyncProvider,
    clear_test_google_drive_credentials_store, content_hash_hex, google_drive_push_snapshot_source,
    percent_decode, slugify, validate_google_drive_pull_content_hash,
};
use crate::{backup::BackupSource, persisted::Persisted, settings::Settings};
use std::{path::PathBuf, sync::Arc};
use tokio::{runtime::Runtime, sync::RwLock};

fn unique_dir(name: &str) -> PathBuf {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .expect("system time before unix epoch")
        .as_nanos();

    std::env::temp_dir()
        .join("rentable-tests")
        .join(format!("{}-{}", name, nanos))
}

#[test]
fn initializes_default_workspace_from_managed_database_path() {
    clear_test_google_drive_credentials_store();

    Runtime::new()
        .expect("failed to create tokio runtime")
        .block_on(async {
            let root = unique_dir("remote-sync-default-profile");
            std::fs::create_dir_all(&root).expect("failed to create test root");

            let settings_path = root.join(Settings::FILENAME);
            let mut settings =
                Persisted::<Settings>::load(settings_path).expect("failed to load settings");
            settings.database_path = root.join("app.db");
            settings.commit().expect("failed to commit settings");

            let settings = Arc::new(RwLock::new(settings));
            let mut remote_sync = RemoteSync::new(settings, root.join(RemoteSync::FILENAME))
                .await
                .expect("failed to initialize remote sync");

            let state = remote_sync.get_state().await.expect("failed to get state");
            assert_eq!(state.workspace.local_database_path, root.join("app.db"));
            assert_eq!(state.workspace.provider, RemoteSyncProvider::Local);

            let _ = std::fs::remove_dir_all(&root);
        });
}

#[test]
fn reconcile_tracks_managed_database_path_changes() {
    clear_test_google_drive_credentials_store();

    Runtime::new()
        .expect("failed to create tokio runtime")
        .block_on(async {
            let root = unique_dir("remote-sync-reconcile-path-change");
            std::fs::create_dir_all(&root).expect("failed to create test root");

            let settings_path = root.join(Settings::FILENAME);
            let mut settings =
                Persisted::<Settings>::load(settings_path).expect("failed to load settings");
            settings.database_path = root.join("first.db");
            settings.commit().expect("failed to commit settings");

            let settings = Arc::new(RwLock::new(settings));
            let mut remote_sync =
                RemoteSync::new(settings.clone(), root.join(RemoteSync::FILENAME))
                    .await
                    .expect("failed to initialize remote sync");

            {
                let mut settings = settings.write().await;
                settings.database_path = root.join("second.db");
                settings.commit().expect("failed to update settings");
            }

            let state = remote_sync.get_state().await.expect("failed to get state");
            assert_eq!(state.workspace.local_database_path, root.join("second.db"));

            let _ = std::fs::remove_dir_all(&root);
        });
}

#[test]
fn completes_google_drive_link_on_workspace() {
    clear_test_google_drive_credentials_store();

    Runtime::new()
        .expect("failed to create tokio runtime")
        .block_on(async {
            let root = unique_dir("remote-sync-google-drive-link");
            std::fs::create_dir_all(&root).expect("failed to create test root");

            let settings_path = root.join(Settings::FILENAME);
            let mut settings =
                Persisted::<Settings>::load(settings_path).expect("failed to load settings");
            settings.database_path = root.join("active.db");
            settings.commit().expect("failed to commit settings");

            let settings = Arc::new(RwLock::new(settings));
            let mut remote_sync = RemoteSync::new(settings, root.join(RemoteSync::FILENAME))
                .await
                .expect("failed to initialize remote sync");
            let state = remote_sync
                .complete_google_drive_link(GoogleDriveLinkCompleteInput {
                    email: "person@example.com".to_string(),
                    display_name: "Person Example".to_string(),
                    avatar_url: Some("https://example.com/avatar.png".to_string()),
                    provider_user_id: Some("provider-user-1".to_string()),
                    drive_quota_bytes: Some(1000),
                    drive_usage_bytes: Some(250),
                    app_usage_bytes: Some(125),
                    access_token: "access-token".to_string(),
                    refresh_token: Some("refresh-token".to_string()),
                    token_expires_at: Some(999),
                })
                .await
                .expect("failed to complete google drive link");

            assert_eq!(state.workspace.provider, RemoteSyncProvider::GoogleDrive);
            assert_eq!(
                state.workspace.account_id.as_deref(),
                Some("google-drive-person-example-com")
            );
            assert_eq!(state.accounts.len(), 1);

            let _ = std::fs::remove_dir_all(&root);
        });
}

#[test]
fn cancels_google_drive_link_session_without_erroring() {
    clear_test_google_drive_credentials_store();

    Runtime::new()
        .expect("failed to create tokio runtime")
        .block_on(async {
            let root = unique_dir("remote-sync-google-drive-cancel-link");
            std::fs::create_dir_all(&root).expect("failed to create test root");

            let settings_path = root.join(Settings::FILENAME);
            let mut settings =
                Persisted::<Settings>::load(settings_path).expect("failed to load settings");
            settings.database_path = root.join("active.db");
            settings.commit().expect("failed to commit settings");

            let settings = Arc::new(RwLock::new(settings));
            let mut remote_sync = RemoteSync::new(settings, root.join(RemoteSync::FILENAME))
                .await
                .expect("failed to initialize remote sync");

            remote_sync
                .auth_sessions
                .lock()
                .expect("failed to lock auth sessions")
                .insert(
                    "session-1".to_string(),
                    GoogleDriveLinkSession {
                        session_id: "session-1".to_string(),
                        expected_state: "state-1".to_string(),
                        status: GoogleDriveLinkSessionStatus::Pending,
                        authorization_code: Some("code".to_string()),
                        state: Some("state-1".to_string()),
                        error: Some("error".to_string()),
                    },
                );

            remote_sync
                .cancel_google_drive_link(GoogleDriveLinkSessionLookupInput {
                    session_id: "session-1".to_string(),
                })
                .expect("failed to cancel google drive link session");

            let result = remote_sync
                .get_google_drive_link_result(GoogleDriveLinkSessionLookupInput {
                    session_id: "session-1".to_string(),
                })
                .expect("failed to get cancelled link session result");

            assert_eq!(result.status, GoogleDriveLinkSessionStatus::Cancelled);
            assert!(result.authorization_code.is_none());
            assert!(result.state.is_none());
            assert!(result.error.is_none());

            let _ = std::fs::remove_dir_all(&root);
        });
}

#[test]
fn slugify_and_percent_decode_are_stable() {
    assert_eq!(slugify("Person Example+1"), "person-example-1");
    assert_eq!(percent_decode("hello%20world%2Btest"), "hello world+test");
}

async fn setup_remote_sync(root: &std::path::Path) -> RemoteSync {
    std::fs::create_dir_all(root).expect("failed to create test root");

    let settings_path = root.join(Settings::FILENAME);
    let mut settings = Persisted::<Settings>::load(settings_path).expect("failed to load settings");
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

            assert_eq!(error, "GOOGLE_DRIVE_SYNC_WORKSPACE_REQUIRED");

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

            assert_eq!(error, "GOOGLE_DRIVE_SYNC_LOCKED:workspace-1");

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

#[test]
fn manual_prepare_push_uses_manual_source() {
    assert_eq!(
        google_drive_push_snapshot_source(Some(&GoogleDrivePreparePushInput { manual: true })),
        BackupSource::Manual
    );
}

#[test]
fn automatic_prepare_push_defaults_to_autosave() {
    assert_eq!(
        google_drive_push_snapshot_source(None),
        BackupSource::Autosave
    );
    assert_eq!(
        google_drive_push_snapshot_source(Some(&GoogleDrivePreparePushInput { manual: false })),
        BackupSource::Autosave
    );
}

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
