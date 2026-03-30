use std::path::PathBuf;

use crate::{database::Database, persisted::Persistable, state::AppState};
use serde::{Deserialize, Serialize};

const DEFAULT_ENDING_SOON_NOTICE_DAYS: u16 = 60;

/// application settings stored in json file.
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub ending_soon_notice_days: u16,
    pub default_database_path: PathBuf,
    pub active_database_path: Option<PathBuf>,
    pub migration_dir: PathBuf,
    pub backup_dir: PathBuf,
    pub recovery_path: PathBuf,
    pub locale: Option<String>,
    pub version: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            ending_soon_notice_days: DEFAULT_ENDING_SOON_NOTICE_DAYS,
            default_database_path: PathBuf::new(),
            active_database_path: None,
            migration_dir: PathBuf::new(),
            backup_dir: PathBuf::new(),
            recovery_path: PathBuf::new(),
            locale: None,
            version: String::new(),
        }
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
    ending_soon_notice_days: Option<u16>,
    database_path: Option<String>,
    locale: Option<String>,
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
    if let Some(days) = changeset.ending_soon_notice_days {
        if days == 0 {
            return Err("ending soon notice window must be greater than zero".to_string());
        }
    }

    let mut switched_database_target: Option<PathBuf> = None;
    let mut switched_database_previous: Option<Option<PathBuf>> = None;

    let pending_database_path = if let Some(raw_path) = changeset.database_path.clone() {
        let (normalized_path, target_path, previous_path) = {
            let settings = app_state.settings.read().await;
            let normalized_path = Database::normalize_path(Some(raw_path))?;
            let target_path = normalized_path
                .clone()
                .unwrap_or_else(|| settings.default_database_path.clone());
            let previous_path = settings.active_database_path.clone();

            (normalized_path, target_path, previous_path)
        };

        switched_database_target = Some(target_path.clone());
        switched_database_previous = Some(previous_path.clone());

        {
            let mut settings = app_state.settings.write().await;
            settings.active_database_path = Some(target_path);
        }

        let reconnect_result = {
            let mut db = app_state.db.write().await;
            db.reconnect().await
        };

        if let Err(error) = reconnect_result {
            {
                let mut settings = app_state.settings.write().await;
                settings.active_database_path = previous_path.clone();
            }

            let mut db = app_state.db.write().await;
            db.reconnect().await.unwrap_or_else(|reconnect_error| {
                panic_database_path_switch_failure(
                    "rolling back the previous database connection",
                    previous_path.as_ref(),
                    switched_database_target
                        .as_ref()
                        .expect("database switch target should exist during rollback"),
                    reconnect_error,
                )
            });

            return Err(error);
        }

        Some(normalized_path)
    } else {
        None
    };

    let mut settings = app_state.settings.write().await;

    if let Some(days) = changeset.ending_soon_notice_days {
        settings.ending_soon_notice_days = days;
    }

    if changeset.database_path.is_some() {
        settings.active_database_path = pending_database_path.flatten();
    }

    if let Some(locale) = changeset.locale {
        settings.locale = Some(locale);
    }

    if let Err(error) = settings.commit() {
        if let (Some(target_path), Some(previous_path)) = (
            switched_database_target.as_ref(),
            switched_database_previous.as_ref(),
        ) {
            panic_database_path_switch_failure(
                "persisting settings after the runtime database switch",
                previous_path.as_ref(),
                target_path,
                error,
            );
        }

        return Err(error);
    }

    Ok(settings.inner().clone())
}

fn panic_database_path_switch_failure(
    phase: &str,
    previous_path: Option<&PathBuf>,
    target_path: &PathBuf,
    error: impl std::fmt::Display,
) -> ! {
    let previous_path = previous_path
        .map(|path| path.display().to_string())
        .unwrap_or_else(|| "<default database path>".to_string());

    panic!(
        "fatal: database path switch entered an unrecoverable state during {} (previous persisted path: {}, runtime target path: {}): {}",
        phase,
        previous_path,
        target_path.display(),
        error,
    );
}
