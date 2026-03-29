use std::sync::Arc;
use tokio::sync::RwLock;

use crate::{
    backup::Backup, database::Database, persisted::Persisted, settings::Settings, update::Update,
};

pub struct AppState {
    pub db: Arc<RwLock<Database>>,
    pub settings: Arc<RwLock<Persisted<Settings>>>,
    pub backup: Arc<RwLock<Backup>>,
    pub update: Arc<RwLock<Update>>,
}
