use std::{path::PathBuf, sync::Arc};
use tokio::sync::RwLock;

use crate::{database::Database, settings::SettingsState};

pub struct AppState {
    pub db: Arc<RwLock<Option<Database>>>,
    pub default_db_path: PathBuf,
    pub active_db_path: Arc<RwLock<PathBuf>>,
    pub migration_dir: PathBuf,
    pub settings: Arc<RwLock<SettingsState>>,
    pub version: &'static str,
}
