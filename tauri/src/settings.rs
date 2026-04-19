use std::path::PathBuf;

use crate::{persisted::Persistable, state::AppState};
use serde::{Deserialize, Deserializer, Serialize};

const DEFAULT_ENDING_SOON_NOTICE_DAYS: u16 = 60;

/// application settings stored in json file.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub ending_soon_notice_days: u16,
    pub database_path: PathBuf,
    pub migration_dir: PathBuf,
    pub backup_dir: PathBuf,
    pub recovery_path: PathBuf,
    pub locale: Option<String>,
    pub version: String,
}

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct SettingsStored {
    ending_soon_notice_days: u16,
    database_path: PathBuf,
    default_database_path: PathBuf,
    active_database_path: Option<PathBuf>,
    migration_dir: PathBuf,
    backup_dir: PathBuf,
    recovery_path: PathBuf,
    locale: Option<String>,
    version: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            ending_soon_notice_days: DEFAULT_ENDING_SOON_NOTICE_DAYS,
            database_path: PathBuf::new(),
            migration_dir: PathBuf::new(),
            backup_dir: PathBuf::new(),
            recovery_path: PathBuf::new(),
            locale: None,
            version: String::new(),
        }
    }
}

impl From<SettingsStored> for Settings {
    fn from(value: SettingsStored) -> Self {
        let database_path = if !value.database_path.as_os_str().is_empty() {
            value.database_path
        } else if let Some(active_database_path) = value.active_database_path {
            active_database_path
        } else {
            value.default_database_path
        };

        Self {
            ending_soon_notice_days: value.ending_soon_notice_days,
            database_path,
            migration_dir: value.migration_dir,
            backup_dir: value.backup_dir,
            recovery_path: value.recovery_path,
            locale: value.locale,
            version: value.version,
        }
    }
}

impl<'de> Deserialize<'de> for Settings {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        SettingsStored::deserialize(deserializer).map(Into::into)
    }
}

impl Persistable for Settings {
    fn sanitize(&mut self) {
        if self.ending_soon_notice_days == 0 {
            self.ending_soon_notice_days = DEFAULT_ENDING_SOON_NOTICE_DAYS;
        }

        if let Some(locale) = &self.locale {
            let trimmed = locale.trim();
            self.locale = if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            };
        }
    }
}

impl Settings {
    pub const FILENAME: &'static str = "settings.json";
}

#[derive(Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SettingsChangeset {
    pub ending_soon_notice_days: Option<u16>,
    pub locale: Option<String>,
}

#[tauri::command]
pub async fn settings_get(app_state: tauri::State<'_, AppState>) -> Result<Settings, String> {
    let settings = app_state.settings.read().await;
    Ok(settings.inner().clone())
}

#[tauri::command]
pub async fn settings_set(
    app_state: tauri::State<'_, AppState>,
    changeset: SettingsChangeset,
) -> Result<Settings, String> {
    settings_set_inner(app_state.inner(), changeset).await
}

pub async fn settings_set_inner(
    app_state: &AppState,
    changeset: SettingsChangeset,
) -> Result<Settings, String> {
    if let Some(days) = changeset.ending_soon_notice_days {
        if days == 0 {
            return Err("ending soon notice window must be greater than zero".to_string());
        }
    }

    let mut settings = app_state.settings.write().await;

    if let Some(days) = changeset.ending_soon_notice_days {
        settings.ending_soon_notice_days = days;
    }

    if let Some(locale) = changeset.locale {
        settings.locale = Some(locale);
    }

    settings.commit()?;

    Ok(settings.inner().clone())
}

#[cfg(test)]
mod tests {
    use super::Settings;
    use std::path::PathBuf;

    #[test]
    fn deserializes_legacy_database_paths_preferring_active_path() {
        let settings = serde_json::from_str::<Settings>(
            r#"{
                "endingSoonNoticeDays": 45,
                "defaultDatabasePath": "default.db",
                "activeDatabasePath": "active.db",
                "migrationDir": "migrations",
                "backupDir": "snapshots",
                "recoveryPath": "recovery.json",
                "locale": "en",
                "version": "1.0.0"
            }"#,
        )
        .expect("failed to deserialize legacy settings");

        assert_eq!(settings.database_path, PathBuf::from("active.db"));
        assert_eq!(settings.ending_soon_notice_days, 45);
    }
}
