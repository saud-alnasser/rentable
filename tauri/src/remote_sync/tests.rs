use super::{
    GoogleDriveAccountAuthInput, GoogleDriveLinkCompleteInput, GoogleDriveLinkFailure,
    GoogleDriveLinkOutcome, GoogleDriveLinkSession, GoogleDriveLinkSessionLookupInput,
    GoogleDriveLinkSessionStatus, GoogleDrivePreparePushInput, GoogleDriveSyncLockAcquireInput,
    GoogleDriveSyncLockReleaseInput, GoogleOAuthTokens, RemoteSync, RemoteSyncProvider,
    clear_test_google_drive_credentials_store, content_hash_hex, google_drive_push_snapshot_source,
    percent_decode, slugify, validate_google_drive_pull_content_hash,
};
use crate::{backup::BackupSource, error::Error, persisted::Persisted, settings::Settings};
use std::{collections::HashMap, path::PathBuf, sync::Arc};
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
            let mut redeemed = pending_link_session();
            redeemed.status = GoogleDriveLinkSessionStatus::Completed;
            redeemed.tokens = Some(GoogleOAuthTokens {
                access_token: "access-token".to_string(),
                refresh_token: Some("refresh-token".to_string()),
                expires_at: Some(999),
            });

            remote_sync
                .auth_sessions
                .lock()
                .expect("failed to lock auth sessions")
                .insert(redeemed.session_id.clone(), redeemed);

            let state = remote_sync
                .complete_google_drive_link(GoogleDriveLinkCompleteInput {
                    session_id: "session-1".to_string(),
                    email: "person@example.com".to_string(),
                    display_name: "Person Example".to_string(),
                    avatar_url: Some("https://example.com/avatar.png".to_string()),
                    provider_user_id: Some("provider-user-1".to_string()),
                    drive_quota_bytes: Some(1000),
                    drive_usage_bytes: Some(250),
                    app_usage_bytes: Some(125),
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
                        authorization_code: Some("code".to_string()),
                        error: Some("error".to_string()),
                        ..pending_link_session()
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

fn pending_link_session() -> GoogleDriveLinkSession {
    GoogleDriveLinkSession {
        session_id: "session-1".to_string(),
        expected_state: "the-state".to_string(),
        code_verifier: "the-verifier".to_string(),
        redirect_uri: "http://127.0.0.1:5173/callback".to_string(),
        status: GoogleDriveLinkSessionStatus::Pending,
        authorization_code: None,
        error: None,
        tokens: None,
    }
}

fn callback_query(pairs: &[(&str, &str)]) -> HashMap<String, String> {
    pairs
        .iter()
        .map(|(key, value)| (key.to_string(), value.to_string()))
        .collect()
}

#[test]
fn a_callback_carrying_a_matching_state_and_a_code_authorizes_the_session() {
    let mut session = pending_link_session();
    let outcome = session.read_callback(&callback_query(&[
        ("code", "the-code"),
        ("state", "the-state"),
    ]));

    assert!(session.settle(outcome));
    assert_eq!(session.status, GoogleDriveLinkSessionStatus::Completed);
    assert_eq!(session.authorization_code.as_deref(), Some("the-code"));
    assert_eq!(session.error, None);
}

/// the state is the only thing tying a callback to the session that started it,
/// so a mismatch is an unrelated or forged callback and its code is not kept.
#[test]
fn a_callback_whose_state_does_not_match_fails_without_keeping_the_code() {
    let mut session = pending_link_session();
    let outcome = session.read_callback(&callback_query(&[
        ("code", "the-code"),
        ("state", "a-different-state"),
    ]));

    assert!(session.settle(outcome));
    assert_eq!(session.status, GoogleDriveLinkSessionStatus::Error);
    assert_eq!(session.authorization_code, None);
    assert!(
        session
            .error
            .as_deref()
            .is_some_and(|error| error.contains("state")),
        "the failure did not name the state mismatch: {:?}",
        session.error
    );
}

#[test]
fn a_callback_without_an_authorization_code_fails_the_session() {
    for query in [
        callback_query(&[("state", "the-state")]),
        callback_query(&[("code", "   "), ("state", "the-state")]),
    ] {
        let mut session = pending_link_session();
        let outcome = session.read_callback(&query);

        assert!(session.settle(outcome));
        assert_eq!(session.status, GoogleDriveLinkSessionStatus::Error);
        assert_eq!(session.authorization_code, None);
    }
}

/// `access_denied` is google's own code and the caller branches on it to tell a
/// user who declined consent from one who hit a real failure.
#[test]
fn a_callback_carrying_googles_own_error_preserves_it_verbatim() {
    let mut session = pending_link_session();
    let outcome = session.read_callback(&callback_query(&[("error", "access_denied")]));

    assert!(session.settle(outcome));
    assert_eq!(session.status, GoogleDriveLinkSessionStatus::Error);
    assert_eq!(session.error.as_deref(), Some("access_denied"));
}

#[test]
fn cancelling_a_pending_session_clears_everything_it_held() {
    let mut session = pending_link_session();
    session.authorization_code = Some("the-code".to_string());
    session.error = Some("an earlier error".to_string());

    session.cancel();

    assert_eq!(session.status, GoogleDriveLinkSessionStatus::Cancelled);
    assert_eq!(session.authorization_code, None);
    assert_eq!(session.error, None);
}

/// cancelling after the code was redeemed is the path the link flow takes when
/// a later step fails. The tokens are already in hand, and abandoning the
/// session has to drop them rather than leave them in a map nobody prunes.
#[test]
fn cancelling_a_redeemed_session_drops_the_tokens_it_was_holding() {
    let mut session = pending_link_session();
    session.status = GoogleDriveLinkSessionStatus::Completed;
    session.authorization_code = Some("the-code".to_string());
    session.tokens = Some(GoogleOAuthTokens {
        access_token: "the-access-token".to_string(),
        refresh_token: Some("the-refresh-token".to_string()),
        expires_at: Some(999),
    });

    session.cancel();

    assert_eq!(session.status, GoogleDriveLinkSessionStatus::Cancelled);
    assert!(
        session.tokens.is_none(),
        "a cancelled session kept its tokens"
    );
    assert_eq!(session.authorization_code, None);
}

/// the callback server and the user's cancellation race by construction. The
/// callback must not overwrite the cancellation, or a link the user abandoned
/// completes anyway.
#[test]
fn a_callback_arriving_after_cancellation_does_not_revive_the_session() {
    let mut session = pending_link_session();

    session.cancel();

    let outcome = session.read_callback(&callback_query(&[
        ("code", "the-code"),
        ("state", "the-state"),
    ]));

    assert!(!session.settle(outcome));
    assert_eq!(session.status, GoogleDriveLinkSessionStatus::Cancelled);
    assert_eq!(session.authorization_code, None);
}

/// a code is redeemable once, and google answers a replay by invalidating the
/// tokens it already issued.
#[test]
fn an_authorization_code_is_taken_only_once() {
    let mut session = pending_link_session();
    session.authorization_code = Some("the-code".to_string());

    assert_eq!(
        session.take_authorization_code().as_deref(),
        Some("the-code")
    );
    assert_eq!(session.take_authorization_code(), None);
}

#[test]
fn a_settled_session_keeps_its_first_outcome() {
    let mut session = pending_link_session();
    let authorized = session.read_callback(&callback_query(&[
        ("code", "the-first-code"),
        ("state", "the-state"),
    ]));

    assert!(session.settle(authorized));
    assert!(!session.settle(GoogleDriveLinkOutcome::Failed(
        GoogleDriveLinkFailure::MissingAuthorizationCode
    )));
    assert_eq!(session.status, GoogleDriveLinkSessionStatus::Completed);
    assert_eq!(
        session.authorization_code.as_deref(),
        Some("the-first-code")
    );
}

/// the fresh path is what runs before nearly every drive call, and it must
/// answer without a network round trip.
#[test]
fn a_fresh_stored_token_is_returned_without_refreshing() {
    clear_test_google_drive_credentials_store();

    Runtime::new()
        .expect("failed to create tokio runtime")
        .block_on(async {
            let root = unique_dir("remote-sync-google-drive-fresh-token");
            std::fs::create_dir_all(&root).expect("failed to create test root");

            let settings_path = root.join(Settings::FILENAME);
            let mut settings =
                Persisted::<Settings>::load(settings_path).expect("failed to load settings");
            settings.database_path = root.join("active.db");
            settings.commit().expect("failed to commit settings");

            let settings = Arc::new(RwLock::new(settings));
            let remote_sync = RemoteSync::new(settings, root.join(RemoteSync::FILENAME))
                .await
                .expect("failed to initialize remote sync");

            remote_sync
                .upsert_google_drive_credentials(
                    "account-1",
                    Some("the-access-token".to_string()),
                    Some("the-refresh-token".to_string()),
                    Some(crate::timestamp::now() + 10 * 60_000),
                    crate::timestamp::now(),
                )
                .expect("failed to store credentials");

            let fresh = remote_sync
                .fresh_google_drive_access_token(&GoogleDriveAccountAuthInput {
                    account_id: "account-1".to_string(),
                })
                .expect("failed to read the stored token");

            assert_eq!(fresh.as_deref(), Some("the-access-token"));

            let _ = std::fs::remove_dir_all(&root);
        });
}

/// an expired token with no refresh token behind it cannot be recovered, and
/// the caller has to be told to link again rather than to retry.
#[test]
fn an_expired_token_with_nothing_to_refresh_from_demands_a_relink() {
    clear_test_google_drive_credentials_store();

    Runtime::new()
        .expect("failed to create tokio runtime")
        .block_on(async {
            let root = unique_dir("remote-sync-google-drive-relink");
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
                .upsert_google_drive_credentials(
                    "account-1",
                    Some("the-access-token".to_string()),
                    None,
                    Some(crate::timestamp::now() - 60_000),
                    crate::timestamp::now(),
                )
                .expect("failed to store credentials");

            let input = GoogleDriveAccountAuthInput {
                account_id: "account-1".to_string(),
            };

            assert_eq!(
                remote_sync
                    .fresh_google_drive_access_token(&input)
                    .expect("failed to read the stored token"),
                None
            );

            let error = remote_sync
                .refresh_google_drive_access_token(input)
                .await
                .expect_err("an unrefreshable account was accepted");

            assert!(
                matches!(error, Error::PreconditionFailed { .. }),
                "expected a relink to be demanded, got {error:?}"
            );

            let _ = std::fs::remove_dir_all(&root);
        });
}
