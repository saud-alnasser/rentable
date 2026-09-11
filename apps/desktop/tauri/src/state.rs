use std::sync::Arc;
use tokio::sync::RwLock;

use crate::{
    database::Database, organization::store::OrganizationStore, persisted::Persisted,
    settings::Settings, sync::RemoteSync, sync::turso::consent::TursoConsent, update::Update,
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
    /// the organization replica this machine has open, beside the workspace engine in `db`.
    ///
    /// **A second `turso::sync::Database` and not a third `Engine` arm**: `Engine` answers what
    /// the workspace is open as, and an organization is not a workspace. `None` until a member
    /// signs in to one, which is the sign-in ticket's to do; the slot is here so the two engines
    /// are held side by side by the same state rather than one of them hanging off the other.
    pub organization: Arc<RwLock<Option<OrganizationStore>>>,
}
