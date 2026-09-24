use std::path::PathBuf;

use crate::{error::Error, persisted::Persistable, state::AppState};
use serde::{Deserialize, Deserializer, Serialize};

const DEFAULT_ENDING_SOON_NOTICE_DAYS: u16 = 60;

/// whether the application draws light or dark, as the reader chose it.
///
/// `System` follows the operating system and is what a file written before this key reads as,
/// so an installed copy keeps working without its settings being rewritten. The webview resolves
/// it; nothing on this side draws.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Appearance {
    #[default]
    System,
    Light,
    Dark,
}

/// application settings stored in json file.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub ending_soon_notice_days: u16,
    pub database_path: PathBuf,
    pub recovery_path: PathBuf,
    pub diagnostics_dir: PathBuf,
    pub locale: Option<String>,
    pub appearance: Appearance,
    pub version: String,
}

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct SettingsStored {
    ending_soon_notice_days: u16,
    database_path: PathBuf,
    default_database_path: PathBuf,
    active_database_path: Option<PathBuf>,
    recovery_path: PathBuf,
    diagnostics_dir: PathBuf,
    locale: Option<String>,
    appearance: Appearance,
    version: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            ending_soon_notice_days: DEFAULT_ENDING_SOON_NOTICE_DAYS,
            database_path: PathBuf::new(),
            recovery_path: PathBuf::new(),
            diagnostics_dir: PathBuf::new(),
            locale: None,
            appearance: Appearance::System,
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
            recovery_path: value.recovery_path,
            diagnostics_dir: value.diagnostics_dir,
            locale: value.locale,
            appearance: value.appearance,
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
    pub appearance: Option<Appearance>,
}

#[tauri::command]
pub async fn settings_get(app_state: tauri::State<'_, AppState>) -> Result<Settings, Error> {
    let settings = app_state.settings.read().await;
    Ok(settings.inner().clone())
}

#[tauri::command]
pub async fn settings_set(
    app_state: tauri::State<'_, AppState>,
    changeset: SettingsChangeset,
) -> Result<Settings, Error> {
    settings_set_inner(app_state.inner(), changeset).await
}

pub async fn settings_set_inner(
    app_state: &AppState,
    changeset: SettingsChangeset,
) -> Result<Settings, Error> {
    if let Some(days) = changeset.ending_soon_notice_days {
        if days == 0 {
            return Err(Error::InvalidInput {
                message: "ending soon notice window must be greater than zero".to_string(),
            });
        }
    }

    let mut settings = app_state.settings.write().await;

    if let Some(days) = changeset.ending_soon_notice_days {
        settings.ending_soon_notice_days = days;
    }

    if let Some(locale) = changeset.locale {
        settings.locale = Some(locale);
    }

    if let Some(appearance) = changeset.appearance {
        settings.appearance = appearance;
    }

    settings.commit()?;

    Ok(settings.inner().clone())
}

#[cfg(test)]
mod tests {
    use super::{Appearance, Settings, SettingsChangeset};
    use std::path::PathBuf;

    /// A settings file written by an earlier version still loads, `migrationDir` and all.
    ///
    /// The keys are left in the fixture deliberately: the client applies no migrations any more
    /// and keeps no snapshots (#569), so neither field is on `Settings`. What this now also pins
    /// is that an installed copy's settings file does not have to be rewritten to be readable.
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

    /// A file written before the appearance existed reads as following the system.
    #[test]
    fn reads_a_file_without_an_appearance_as_system() {
        let settings = serde_json::from_str::<Settings>(
            r#"{ "endingSoonNoticeDays": 60, "locale": "ar", "version": "0.14.0" }"#,
        )
        .expect("failed to deserialize settings without an appearance");

        assert_eq!(settings.appearance, Appearance::System);
    }

    /// The key is written as the webview reads it, and read back as it was written.
    #[test]
    fn round_trips_the_appearance() {
        for appearance in [Appearance::System, Appearance::Light, Appearance::Dark] {
            let settings = Settings {
                appearance,
                ..Settings::default()
            };

            let json = serde_json::to_value(&settings).expect("failed to serialize settings");
            let read = serde_json::from_value::<Settings>(json.clone())
                .expect("failed to deserialize settings");

            assert_eq!(read.appearance, appearance);
            assert!(json.get("appearance").is_some());
        }

        let json = serde_json::to_value(Settings {
            appearance: Appearance::Dark,
            ..Settings::default()
        })
        .expect("failed to serialize settings");
        assert_eq!(json["appearance"], "dark");
    }

    /// A changeset names the appearance in the same words, and one that leaves it out changes
    /// nothing about it.
    #[test]
    fn reads_the_appearance_from_a_changeset() {
        let changeset =
            serde_json::from_str::<SettingsChangeset>(r#"{ "appearance": "light" }"#).unwrap();
        assert_eq!(changeset.appearance, Some(Appearance::Light));

        let changeset = serde_json::from_str::<SettingsChangeset>(r#"{ "locale": "en" }"#).unwrap();
        assert_eq!(changeset.appearance, None);
    }
}
