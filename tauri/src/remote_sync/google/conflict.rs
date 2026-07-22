//! content fingerprints and pull validation. The conflict-analysis port (#114) lands
//! here.

use sha2::{Digest, Sha256};

use std::fs;

use crate::{state::AppState, timestamp};

pub(crate) fn content_hash_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

pub(crate) fn validate_google_drive_pull_content_hash(
    expected_content_hash: Option<&str>,
    bytes: &[u8],
) -> Result<(), String> {
    let Some(expected_content_hash) = expected_content_hash
        .map(|value| value.trim().to_ascii_lowercase())
        .filter(|value| !value.is_empty())
    else {
        return Ok(());
    };

    let actual_content_hash = content_hash_hex(bytes);
    if actual_content_hash != expected_content_hash {
        return Err("remote snapshot content hash mismatch".to_string());
    }

    Ok(())
}

pub(crate) async fn current_workspace_content_hash(app_state: &AppState) -> Result<String, String> {
    let temp_path = {
        let settings = app_state.settings.read().await;
        settings.backup_dir.join(format!(
            ".workspace-fingerprint-{}-{}.db",
            timestamp::now(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|duration| duration.as_nanos())
                .unwrap_or_default()
        ))
    };

    {
        let mut db = app_state.db.write().await;

        if !db.is_ready().await {
            db.reconnect().await.map_err(|error| {
                format!("database not ready to fingerprint current workspace: {error}")
            })?;
        }

        if !db.is_ready().await {
            return Err("database not ready to fingerprint current workspace".to_string());
        }

        db.create_backup(&temp_path).await?;
    }

    let bytes = fs::read(&temp_path).map_err(|error| error.to_string());
    let _ = fs::remove_file(&temp_path);

    Ok(content_hash_hex(&bytes?))
}
