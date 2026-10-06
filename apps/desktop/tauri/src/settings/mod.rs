//! how this machine is set up, stored as `settings.json` and served as the `settings` plugin.
//!
//! Each command keeps its crate-unique Rust name and answers to the name without the feature
//! prefix, since the plugin supplies it: `settings_get` is invoked as `plugin:settings|get`.

mod plugin;

pub use plugin::plugin;

use std::{
    future::Future,
    path::{Path, PathBuf},
    pin::Pin,
    sync::Arc,
};

use crate::{
    clock::Clock,
    diagnostics,
    error::Error,
    machine::DatabasePath,
    persisted::{Persistable, Persisted},
};
use serde::{Deserialize, Deserializer, Serialize};
use tokio::sync::RwLock;

const DEFAULT_ENDING_SOON_NOTICE_DAYS: u16 = 60;

/// the settings as the plugin manages them, loaded once in its setup: every command reads and
/// writes them through this one lock, and the database, this machine's record and the update read
/// their paths off the same value.
pub type Shared = Arc<RwLock<Persisted<Settings>>>;

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
    /// whether the records an earlier version left in `app.db` have been brought in or put
    /// aside on this machine, so neither the way in nor the settings area offers them again.
    /// A file written before it existed reads as not yet.
    pub earlier_records_settled: bool,
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
    earlier_records_settled: bool,
}

/// The machine's record reads where the workspace database lives off the settings, as they are
/// when it asks.
impl DatabasePath for RwLock<Persisted<Settings>> {
    fn database_path(&self) -> Pin<Box<dyn Future<Output = PathBuf> + Send + '_>> {
        Box::pin(async move { self.read().await.database_path.clone() })
    }
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
            earlier_records_settled: false,
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
            earlier_records_settled: value.earlier_records_settled,
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
    /// the workspace database's file, in the directory `database_path` is set to at launch.
    /// `Database::FILENAME` is this name: the plugin's setup fills the path in, and it cannot
    /// name the database, which reads the settings.
    pub const DATABASE_FILENAME: &'static str = "app.db";
    /// the update's route back, in the data directory, for the same reason `Update::FILENAME`.
    pub const RECOVERY_FILENAME: &'static str = "recovery.json";
}

#[derive(Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SettingsChangeset {
    pub ending_soon_notice_days: Option<u16>,
    pub locale: Option<String>,
    pub appearance: Option<Appearance>,
    pub earlier_records_settled: Option<bool>,
}

#[tauri::command(rename = "get")]
pub async fn settings_get(settings: tauri::State<'_, Shared>) -> Result<Settings, Error> {
    let settings = settings.read().await;
    Ok(settings.inner().clone())
}

#[tauri::command(rename = "set")]
pub async fn settings_set(
    settings: tauri::State<'_, Shared>,
    changeset: SettingsChangeset,
) -> Result<Settings, Error> {
    settings_set_inner(settings.inner(), changeset).await
}

pub async fn settings_set_inner(
    settings: &Shared,
    changeset: SettingsChangeset,
) -> Result<Settings, Error> {
    if let Some(days) = changeset.ending_soon_notice_days {
        if days == 0 {
            return Err(Error::InvalidInput {
                message: "ending soon notice window must be greater than zero".to_string(),
            });
        }
    }

    let mut settings = settings.write().await;

    if let Some(days) = changeset.ending_soon_notice_days {
        settings.ending_soon_notice_days = days;
    }

    if let Some(locale) = changeset.locale {
        settings.locale = Some(locale);
    }

    if let Some(appearance) = changeset.appearance {
        settings.appearance = appearance;
    }

    if let Some(settled) = changeset.earlier_records_settled {
        settings.earlier_records_settled = settled;
    }

    settings.commit()?;

    Ok(settings.inner().clone())
}

/// Load this machine's settings from `data_dir`, with the places it keeps its files at filled in,
/// and commit them: what the plugin's setup manages.
///
/// `db_dir` is where the workspace database lives. **A development build always takes it; a
/// release build keeps what it was given.** A stored path is a person's choice in a shipped
/// application (the restore flow writes one), and it is a stale artefact in a checkout, left by
/// whatever directory a previous launch happened to start in.
///
/// A `settings.json` whose content cannot be read is recovered rather than refused, and one that
/// cannot be opened at all is the error, naming the file ([`Persisted::recover`]).
pub fn open(
    data_dir: &Path,
    db_dir: &Path,
    clock: &dyn Clock,
) -> Result<Persisted<Settings>, Error> {
    let mut settings = Persisted::<Settings>::recover(data_dir.join(Settings::FILENAME), clock)?;

    if cfg!(debug_assertions) || settings.database_path.as_os_str().is_empty() {
        settings.database_path = db_dir.join(Settings::DATABASE_FILENAME);
    }
    settings.recovery_path = data_dir.join(Settings::RECOVERY_FILENAME);
    settings.diagnostics_dir = data_dir.join(diagnostics::DIRECTORY_NAME);
    settings.version = env!("CARGO_PKG_VERSION").to_string();

    settings.commit()?;

    Ok(settings)
}

#[cfg(test)]
mod tests {
    use super::{Appearance, Settings, SettingsChangeset};
    use crate::{clock::Fixed, test::scratch};
    use std::path::PathBuf;

    /// **An empty `settings.json` does not stop the launch** (effort 854, criterion 17): the
    /// settings start from the defaults with this machine's places filled in, and the empty file
    /// is kept beside them.
    #[test]
    fn an_empty_settings_file_opens_with_the_defaults_and_is_kept_aside() {
        let data_dir = scratch("settings-open-empty");
        std::fs::write(data_dir.join(Settings::FILENAME), b"").expect("the empty settings");

        let settings = super::open(&data_dir, &data_dir, &Fixed(1_700_000_000_000))
            .expect("an empty settings file stopped the launch");

        assert_eq!(
            settings.ending_soon_notice_days,
            Settings::default().ending_soon_notice_days
        );
        assert_eq!(
            settings.recovery_path,
            data_dir.join(Settings::RECOVERY_FILENAME)
        );
        assert_eq!(
            std::fs::read(data_dir.join("settings.json.corrupt-1700000000000"))
                .expect("the empty file was not kept"),
            b""
        );

        let _ = std::fs::remove_dir_all(data_dir);
    }

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

    /// A file written before the earlier records were offered reads as not yet settled, and the
    /// key is written and read back in the words the webview uses.
    #[test]
    fn reads_and_round_trips_the_earlier_records_settled() {
        let settings = serde_json::from_str::<Settings>(
            r#"{ "endingSoonNoticeDays": 60, "locale": "en", "version": "0.14.0" }"#,
        )
        .expect("failed to deserialize settings without the key");
        assert!(!settings.earlier_records_settled);

        let json = serde_json::to_value(Settings {
            earlier_records_settled: true,
            ..Settings::default()
        })
        .expect("failed to serialize settings");
        assert_eq!(json["earlierRecordsSettled"], true);

        let read = serde_json::from_value::<Settings>(json).expect("failed to read it back");
        assert!(read.earlier_records_settled);

        let changeset =
            serde_json::from_str::<SettingsChangeset>(r#"{ "earlierRecordsSettled": true }"#)
                .unwrap();
        assert_eq!(changeset.earlier_records_settled, Some(true));
    }
}
