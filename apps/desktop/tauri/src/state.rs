use std::sync::Arc;
use tokio::sync::RwLock;

use crate::{
    database::Database, persisted::Persisted, settings::Settings, sync::RemoteSync, update::Update,
};

pub struct AppState {
    pub db: Arc<RwLock<Database>>,
    pub settings: Arc<RwLock<Persisted<Settings>>>,
    pub remote_sync: Arc<RwLock<RemoteSync>>,
    pub update: Arc<RwLock<Update>>,
}
