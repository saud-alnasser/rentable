use crate::{database::Database, database::commands::reconnect_database, state::AppState};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

pub const DEFAULT_ENDING_SOON_NOTICE_DAYS: u16 = 60;
const RELEASES_BASE_URL: &str = "https://github.com/saud-alnasser/rentable/releases";

fn default_ending_soon_notice_days() -> u16 {
    DEFAULT_ENDING_SOON_NOTICE_DAYS
}

fn now_millis() -> i64 {
    system_time_to_millis(SystemTime::now())
}

fn normalize_version(version: &str) -> String {
    version.trim().trim_start_matches('v').to_string()
}

fn update_backup_name(version: &str, timestamp: i64) -> String {
    format!(
        "backup-v{}-update-{}.db",
        normalize_version(version),
        timestamp
    )
}

fn manual_backup_name(timestamp: i64) -> String {
    format!("backup-{}.db", timestamp)
}

fn release_url_for_version(version: Option<&str>) -> String {
    match version
        .map(normalize_version)
        .filter(|value| !value.is_empty())
    {
        Some(version) => format!("{RELEASES_BASE_URL}/tag/v{version}"),
        None => RELEASES_BASE_URL.to_string(),
    }
}

fn parse_update_backup_name(name: &str) -> Option<(&str, &str)> {
    let rest = name.strip_prefix("backup-v")?.strip_suffix(".db")?;
    let (version, timestamp) = rest.split_once("-update-")?;

    if version.is_empty() || timestamp.is_empty() || !timestamp.chars().all(|c| c.is_ascii_digit())
    {
        return None;
    }

    Some((version, timestamp))
}

fn is_protected_backup_name(name: &str) -> bool {
    parse_update_backup_name(name).is_some()
}

fn is_update_backup_for_version(name: &str, version: &str) -> bool {
    parse_update_backup_name(name)
        .map(|(backup_version, _)| backup_version == normalize_version(version))
        .unwrap_or(false)
}

fn system_time_to_millis(time: SystemTime) -> i64 {
    time.duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

fn normalize_database_path(path: Option<String>) -> Result<Option<PathBuf>, String> {
    let Some(raw_path) = path else {
        return Ok(None);
    };

    let trimmed_path = raw_path.trim();

    if trimmed_path.is_empty() {
        return Ok(None);
    }

    let mut normalized_path = PathBuf::from(trimmed_path);

    if !normalized_path.is_absolute() {
        normalized_path = std::env::current_dir()
            .map_err(|e| e.to_string())?
            .join(normalized_path);
    }

    if trimmed_path.ends_with('/') || trimmed_path.ends_with('\\') || normalized_path.is_dir() {
        normalized_path = normalized_path.join(Database::DB_NAME);
    }

    Ok(Some(normalized_path))
}

fn list_backups(backup_dir: &Path) -> Result<Vec<BackupEntry>, String> {
    let mut backups = Vec::new();

    if !backup_dir.exists() {
        return Ok(backups);
    }

    for entry in fs::read_dir(backup_dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();

        if !path.is_file() {
            continue;
        }

        if path.extension().and_then(|value| value.to_str()) != Some("db") {
            continue;
        }

        let created_at = entry
            .metadata()
            .ok()
            .and_then(|metadata| metadata.modified().ok())
            .map(system_time_to_millis)
            .unwrap_or_default();

        let name = entry.file_name().to_string_lossy().into_owned();

        backups.push(BackupEntry {
            is_protected: is_protected_backup_name(&name),
            name,
            created_at,
        });
    }

    backups.sort_by(|left, right| {
        right
            .created_at
            .cmp(&left.created_at)
            .then_with(|| right.name.cmp(&left.name))
    });

    Ok(backups)
}

fn resolve_backup_path(backup_dir: &Path, name: &str) -> Result<PathBuf, String> {
    let backup = list_backups(backup_dir)?
        .into_iter()
        .find(|backup| backup.name == name)
        .ok_or("backup not found".to_string())?;

    Ok(backup_dir.join(backup.name))
}

async fn snapshot(app_state: &AppState) -> Result<SettingsSnapshot, String> {
    let current_database_path = app_state.active_db_path.read().await.clone();
    let settings = app_state.settings.read().await;

    settings.snapshot(app_state, &current_database_path)
}

async fn replace_active_database_from_backup(
    app_state: &AppState,
    backup_path: &Path,
) -> Result<(), String> {
    let active_db_path = app_state.active_db_path.read().await.clone();
    let db = {
        let mut db_state = app_state.db.write().await;

        db_state.take()
    };

    if let Some(db) = db {
        db.disconnect().await;
    }

    Database::purge_path(&active_db_path)?;

    if let Some(parent) = active_db_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    fs::copy(backup_path, &active_db_path).map_err(|e| e.to_string())?;

    Ok(())
}

#[derive(Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum UpdateRecoveryStatus {
    #[default]
    Pending,
    RolledBack,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistedUpdateRecovery {
    pub failed_version: String,
    #[serde(default)]
    pub previous_version: Option<String>,
    pub backup_name: String,
    pub error: String,
    #[serde(default)]
    pub status: UpdateRecoveryStatus,
    #[serde(default)]
    pub detected_at: i64,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistedSettings {
    #[serde(default = "default_ending_soon_notice_days")]
    pub ending_soon_notice_days: u16,
    #[serde(default)]
    pub database_path: Option<String>,
    #[serde(default)]
    pub last_app_version: Option<String>,
    #[serde(default)]
    pub last_sync_at: Option<i64>,
    #[serde(default)]
    pub last_backup_at: Option<i64>,
    #[serde(default)]
    pub update_recovery: Option<PersistedUpdateRecovery>,
    #[serde(default)]
    pub locale: Option<String>,
}

impl Default for PersistedSettings {
    fn default() -> Self {
        Self {
            ending_soon_notice_days: DEFAULT_ENDING_SOON_NOTICE_DAYS,
            database_path: None,
            last_app_version: None,
            last_sync_at: None,
            last_backup_at: None,
            update_recovery: None,
            locale: None,
        }
    }
}

impl PersistedSettings {
    fn sanitize(&mut self) {
        if self.ending_soon_notice_days == 0 {
            self.ending_soon_notice_days = DEFAULT_ENDING_SOON_NOTICE_DAYS;
        }

        self.last_app_version = self
            .last_app_version
            .as_deref()
            .map(normalize_version)
            .filter(|value| !value.is_empty());

        if let Some(recovery) = self.update_recovery.as_mut() {
            recovery.failed_version = normalize_version(&recovery.failed_version);
            recovery.previous_version = recovery
                .previous_version
                .as_deref()
                .map(normalize_version)
                .filter(|value| !value.is_empty());
            recovery.backup_name = recovery.backup_name.trim().to_string();
            recovery.error = recovery.error.trim().to_string();

            if recovery.failed_version.is_empty()
                || recovery.backup_name.is_empty()
                || recovery.error.is_empty()
            {
                self.update_recovery = None;
            }
        }
    }
}

pub struct SettingsState {
    path: PathBuf,
    backup_dir: PathBuf,
    pub data: PersistedSettings,
}

impl SettingsState {
    pub fn load(path: PathBuf, backup_dir: PathBuf) -> Result<Self, String> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }

        fs::create_dir_all(&backup_dir).map_err(|e| e.to_string())?;

        let mut data = if path.exists() {
            fs::read_to_string(&path)
                .ok()
                .and_then(|contents| serde_json::from_str::<PersistedSettings>(&contents).ok())
                .unwrap_or_default()
        } else {
            PersistedSettings::default()
        };

        data.sanitize();

        let settings = Self {
            path,
            backup_dir,
            data,
        };

        settings.save()?;

        Ok(settings)
    }

    pub fn save(&self) -> Result<(), String> {
        let contents = serde_json::to_string_pretty(&self.data).map_err(|e| e.to_string())?;
        fs::write(&self.path, contents).map_err(|e| e.to_string())
    }

    pub fn resolved_database_path(&self, default_db_path: &Path) -> PathBuf {
        self.data
            .database_path
            .as_ref()
            .map(PathBuf::from)
            .unwrap_or_else(|| default_db_path.to_path_buf())
    }

    pub fn pending_update_backup_path(
        &self,
        current_version: &str,
        db_path: &Path,
        timestamp: i64,
    ) -> Result<Option<PathBuf>, String> {
        let normalized_current_version = normalize_version(current_version);

        if !db_path.exists() || normalized_current_version.is_empty() {
            return Ok(None);
        }

        if self.data.last_app_version.as_deref() == Some(normalized_current_version.as_str()) {
            return Ok(None);
        }

        if list_backups(&self.backup_dir)?.into_iter().any(|backup| {
            backup.is_protected
                && is_update_backup_for_version(&backup.name, &normalized_current_version)
        }) {
            return Ok(None);
        }

        Ok(Some(self.backup_dir.join(update_backup_name(
            &normalized_current_version,
            timestamp,
        ))))
    }

    pub fn update_backup_name_for_version(&self, version: &str) -> Result<Option<String>, String> {
        Ok(list_backups(&self.backup_dir)?
            .into_iter()
            .find(|backup| {
                backup.is_protected && is_update_backup_for_version(&backup.name, version)
            })
            .map(|backup| backup.name))
    }

    pub fn record_backup_created(&mut self, timestamp: i64) -> Result<(), String> {
        self.data.last_backup_at = Some(timestamp);
        self.save()
    }

    pub fn record_update_failure(
        &mut self,
        failed_version: &str,
        previous_version: Option<String>,
        backup_name: &str,
        error: &str,
    ) -> Result<(), String> {
        let failed_version = normalize_version(failed_version);
        let backup_name = backup_name.trim();
        let error = error.trim();

        if failed_version.is_empty() || backup_name.is_empty() || error.is_empty() {
            return Err(
                "cannot record update recovery without a failed version, backup, and error"
                    .to_string(),
            );
        }

        self.data.update_recovery = Some(PersistedUpdateRecovery {
            failed_version,
            previous_version: previous_version
                .as_deref()
                .map(normalize_version)
                .filter(|value| !value.is_empty()),
            backup_name: backup_name.to_string(),
            error: error.to_string(),
            status: UpdateRecoveryStatus::Pending,
            detected_at: now_millis(),
        });

        self.save()
    }

    pub fn clear_update_recovery(&mut self) -> Result<(), String> {
        if self.data.update_recovery.is_none() {
            return Ok(());
        }

        self.data.update_recovery = None;
        self.save()
    }

    pub fn current_update_recovery(
        &self,
        current_version: &str,
    ) -> Option<PersistedUpdateRecovery> {
        let recovery = self.data.update_recovery.clone()?;

        if recovery.failed_version != normalize_version(current_version) {
            return None;
        }

        Some(recovery)
    }

    pub fn mark_update_recovery_rolled_back(
        &mut self,
        current_version: &str,
    ) -> Result<(), String> {
        let recovery = self
            .data
            .update_recovery
            .as_mut()
            .ok_or("no failed update recovery is available".to_string())?;

        if recovery.failed_version != normalize_version(current_version) {
            return Err("no failed update recovery is available for this app version".to_string());
        }

        recovery.status = UpdateRecoveryStatus::RolledBack;
        self.save()
    }

    pub fn record_connected_version(&mut self, version: &str) -> Result<(), String> {
        let normalized_version = normalize_version(version);

        if normalized_version.is_empty() {
            self.data.last_app_version = None;
        } else {
            self.data.last_app_version = Some(normalized_version);
        }

        self.data.update_recovery = None;

        self.save()
    }

    pub fn snapshot(
        &self,
        app_state: &AppState,
        current_database_path: &Path,
    ) -> Result<SettingsSnapshot, String> {
        Ok(SettingsSnapshot {
            version: app_state.version.to_string(),
            ending_soon_notice_days: self.data.ending_soon_notice_days,
            current_database_path: current_database_path.to_string_lossy().into_owned(),
            default_database_path: app_state.default_db_path.to_string_lossy().into_owned(),
            using_default_database_path: current_database_path
                == app_state.default_db_path.as_path(),
            last_sync_at: self.data.last_sync_at,
            last_backup_at: self.data.last_backup_at,
            update_recovery: self.current_update_recovery_snapshot(app_state.version),
            backups: list_backups(&self.backup_dir)?,
            locale: self.data.locale.clone(),
        })
    }

    fn current_update_recovery_snapshot(
        &self,
        current_version: &str,
    ) -> Option<UpdateRecoverySnapshot> {
        let recovery = self.current_update_recovery(current_version)?;

        Some(UpdateRecoverySnapshot {
            failed_version: recovery.failed_version,
            previous_version: recovery.previous_version.clone(),
            backup_name: recovery.backup_name,
            error: recovery.error,
            status: recovery.status,
            detected_at: recovery.detected_at,
            previous_release_url: release_url_for_version(recovery.previous_version.as_deref()),
        })
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupEntry {
    pub is_protected: bool,
    pub name: String,
    pub created_at: i64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsSnapshot {
    pub version: String,
    pub ending_soon_notice_days: u16,
    pub current_database_path: String,
    pub default_database_path: String,
    pub using_default_database_path: bool,
    pub last_sync_at: Option<i64>,
    pub last_backup_at: Option<i64>,
    pub update_recovery: Option<UpdateRecoverySnapshot>,
    pub backups: Vec<BackupEntry>,
    pub locale: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateRecoverySnapshot {
    pub failed_version: String,
    pub previous_version: Option<String>,
    pub backup_name: String,
    pub error: String,
    pub status: UpdateRecoveryStatus,
    pub detected_at: i64,
    pub previous_release_url: String,
}

#[tauri::command]
pub async fn settings_get(
    app_state: tauri::State<'_, AppState>,
) -> Result<SettingsSnapshot, String> {
    snapshot(app_state.inner()).await
}

#[tauri::command]
pub async fn settings_set_ending_soon_notice_days(
    app_state: tauri::State<'_, AppState>,
    days: u16,
) -> Result<SettingsSnapshot, String> {
    if days == 0 {
        return Err("ending soon notice window must be greater than zero".to_string());
    }

    {
        let mut settings = app_state.settings.write().await;
        settings.data.ending_soon_notice_days = days;
        settings.save()?;
    }

    snapshot(app_state.inner()).await
}

#[tauri::command]
pub async fn settings_set_database_path(
    app_state: tauri::State<'_, AppState>,
    path: Option<String>,
) -> Result<SettingsSnapshot, String> {
    let next_database_path = normalize_database_path(path)?;
    let target_db_path = next_database_path
        .clone()
        .unwrap_or_else(|| app_state.default_db_path.clone());
    let previous_db_path = app_state.active_db_path.read().await.clone();

    {
        let mut active_db_path = app_state.active_db_path.write().await;
        *active_db_path = target_db_path;
    }

    if let Err(error) = reconnect_database(app_state.inner()).await {
        {
            let mut active_db_path = app_state.active_db_path.write().await;
            *active_db_path = previous_db_path;
        }

        reconnect_database(app_state.inner()).await?;
        return Err(error);
    }

    {
        let mut settings = app_state.settings.write().await;
        settings.data.database_path =
            next_database_path.map(|value| value.to_string_lossy().into_owned());
        settings.save()?;
    }

    snapshot(app_state.inner()).await
}

#[tauri::command]
pub async fn settings_reset_database_path(
    app_state: tauri::State<'_, AppState>,
) -> Result<SettingsSnapshot, String> {
    settings_set_database_path(app_state, None).await
}

#[tauri::command]
pub async fn settings_create_backup(
    app_state: tauri::State<'_, AppState>,
) -> Result<SettingsSnapshot, String> {
    let timestamp = now_millis();
    let backup_path = {
        let settings = app_state.settings.read().await;

        settings.backup_dir.join(manual_backup_name(timestamp))
    };

    let pool = {
        let db_state = app_state.db.read().await;
        let db = db_state
            .as_ref()
            .ok_or("database not initialized".to_string())?;

        db.pool_cloned()
            .ok_or("database not connected".to_string())?
    };

    Database::create_backup_from_pool(&pool, &backup_path).await?;

    {
        let mut settings = app_state.settings.write().await;
        settings.record_backup_created(timestamp)?;
    }

    snapshot(app_state.inner()).await
}

#[tauri::command]
pub async fn settings_restore_backup(
    app_state: tauri::State<'_, AppState>,
    name: String,
) -> Result<SettingsSnapshot, String> {
    let backup_path = {
        let settings = app_state.settings.read().await;

        resolve_backup_path(&settings.backup_dir, &name)?
    };

    replace_active_database_from_backup(app_state.inner(), &backup_path).await?;

    reconnect_database(app_state.inner()).await?;

    snapshot(app_state.inner()).await
}

#[tauri::command]
pub async fn settings_proceed_failed_update(
    app_state: tauri::State<'_, AppState>,
) -> Result<SettingsSnapshot, String> {
    {
        let mut settings = app_state.settings.write().await;
        settings.clear_update_recovery()?;
    }

    snapshot(app_state.inner()).await
}

#[tauri::command]
pub async fn settings_rollback_failed_update(
    app_state: tauri::State<'_, AppState>,
) -> Result<SettingsSnapshot, String> {
    let recovery = {
        let settings = app_state.settings.read().await;
        settings
            .current_update_recovery(app_state.version)
            .ok_or("no failed update recovery is available".to_string())?
    };

    let backup_path = {
        let settings = app_state.settings.read().await;
        resolve_backup_path(&settings.backup_dir, &recovery.backup_name)?
    };

    replace_active_database_from_backup(app_state.inner(), &backup_path).await?;

    {
        let mut settings = app_state.settings.write().await;
        settings.mark_update_recovery_rolled_back(app_state.version)?;
    }

    snapshot(app_state.inner()).await
}

#[tauri::command]
pub async fn settings_delete_backup(
    app_state: tauri::State<'_, AppState>,
    name: String,
) -> Result<SettingsSnapshot, String> {
    let (backup_path, is_protected) = {
        let settings = app_state.settings.read().await;

        let backup = list_backups(&settings.backup_dir)?
            .into_iter()
            .find(|backup| backup.name == name)
            .ok_or("backup not found".to_string())?;

        (settings.backup_dir.join(&backup.name), backup.is_protected)
    };

    if is_protected {
        return Err("protected update backups cannot be deleted".to_string());
    }

    fs::remove_file(&backup_path).map_err(|e| e.to_string())?;

    snapshot(app_state.inner()).await
}

#[tauri::command]
pub async fn settings_mark_synced(
    app_state: tauri::State<'_, AppState>,
    timestamp: Option<i64>,
) -> Result<SettingsSnapshot, String> {
    {
        let mut settings = app_state.settings.write().await;
        settings.data.last_sync_at = Some(timestamp.unwrap_or_else(now_millis));
        settings.save()?;
    }

    snapshot(app_state.inner()).await
}

#[tauri::command]
pub async fn settings_set_locale(
    app_state: tauri::State<'_, AppState>,
    locale: String,
) -> Result<SettingsSnapshot, String> {
    {
        let mut settings = app_state.settings.write().await;
        settings.data.locale = Some(locale);
        settings.save()?;
    }

    snapshot(app_state.inner()).await
}

#[cfg(test)]
mod tests {
    use super::{
        is_protected_backup_name, is_update_backup_for_version, manual_backup_name,
        release_url_for_version, update_backup_name,
    };

    #[test]
    fn update_backup_names_are_marked_protected() {
        let name = update_backup_name("0.3.0", 34242);

        assert_eq!(name, "backup-v0.3.0-update-34242.db");
        assert!(is_protected_backup_name(&name));
    }

    #[test]
    fn protected_backup_detection_rejects_non_update_names() {
        assert_eq!(manual_backup_name(34242), "backup-34242.db");
        assert!(!is_protected_backup_name("backup-34242.db"));
        assert!(!is_protected_backup_name("backup-v0.3.0-update-latest.db"));
    }

    #[test]
    fn protected_backup_version_matching_uses_normalized_versions() {
        assert!(is_update_backup_for_version(
            "backup-v0.3.0-update-34242.db",
            "v0.3.0"
        ));
        assert!(!is_update_backup_for_version(
            "backup-v0.3.0-update-34242.db",
            "0.4.0"
        ));
    }

    #[test]
    fn release_urls_point_to_tagged_versions() {
        assert_eq!(
            release_url_for_version(Some("v0.2.0")),
            "https://github.com/saud-alnasser/rentable/releases/tag/v0.2.0"
        );
        assert_eq!(
            release_url_for_version(None),
            "https://github.com/saud-alnasser/rentable/releases"
        );
    }
}
