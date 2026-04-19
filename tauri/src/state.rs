use std::sync::Arc;
use tokio::sync::RwLock;

use crate::{
    backup::Backup, database::Database, persisted::Persisted, remote_sync::RemoteSync,
    settings::Settings, update::Update,
};

pub struct AppState {
    pub db: Arc<RwLock<Database>>,
    pub settings: Arc<RwLock<Persisted<Settings>>>,
    pub backup: Arc<RwLock<Backup>>,
    pub remote_sync: Arc<RwLock<RemoteSync>>,
    pub update: Arc<RwLock<Update>>,
}
