use std::sync::Arc;
use tokio::sync::RwLock;

use crate::{
    database::Database, persisted::Persisted, settings::Settings, sync::RemoteSync,
    sync::turso::consent::TursoConsent, update::Update,
};

pub struct AppState {
    pub db: Arc<RwLock<Database>>,
    pub settings: Arc<RwLock<Persisted<Settings>>>,
    pub remote_sync: Arc<RwLock<RemoteSync>>,
    pub update: Arc<RwLock<Update>>,
    /// the Turso consents this process has started.
    ///
    /// **Not behind an `RwLock` like the four above**, because it holds its own lock over the
    /// one map it has. A second lock around it would be held across the token exchange, which
    /// is a network round trip, and would stop the interface reading how far any consent had
    /// got while any other consent was being redeemed.
    pub consent: Arc<TursoConsent>,
}
