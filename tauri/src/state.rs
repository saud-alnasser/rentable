use std::{path::PathBuf, sync::Arc};
use tokio::sync::RwLock;

use crate::database::Database;

pub struct AppState {
    pub db: Arc<RwLock<Option<Database>>>,
    pub db_dir: PathBuf,
    pub migration_dir: PathBuf,
}
