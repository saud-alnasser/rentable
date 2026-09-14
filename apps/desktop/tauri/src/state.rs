use std::sync::{Arc, Mutex, atomic::AtomicBool};
use tokio::sync::RwLock;

use crate::{
    database::Database,
    organization::{session::MemberSession, store::OrganizationStore},
    persisted::Persisted,
    settings::Settings,
    sync::RemoteSync,
    sync::turso::consent::TursoConsent,
    update::Update,
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
    /// the member signed in to that organization, for the run of the process: their keys and
    /// the credential their password unsealed. `None` is the wall. Nothing in it is serialised;
    /// the facts about it cross to the web layer as `SessionFacts`.
    pub member: Arc<RwLock<Option<MemberSession>>>,
    /// a `rentable://` link the operating system handed this process and the shell has not taken
    /// yet: the one it was launched with, or one opened before the webview was listening. The
    /// shell takes it once at startup; every later arrival reaches it as an event as well.
    pub arriving_link: Arc<Mutex<Option<String>>>,
    /// whether the session this machine held was ended from another machine, as the last resume
    /// or sync heartbeat found it (effort 826, requirement 22).
    ///
    /// **A standing rather than an error**: it is what the wall says while it is up, and nothing
    /// went wrong. Set where the member's row is found to have moved past the session, and
    /// cleared by the next state read that finds somebody signed in, which is every way back in.
    pub signed_out_elsewhere: Arc<AtomicBool>,
    /// whether this launch has checked the shape of what the machine holds, which the first
    /// `organization_state_get` does before anything opens the replica
    /// (`organization/forget.rs`). Set once the check has run to completion; a check that
    /// failed leaves it empty, so the next read tries again rather than reading past it.
    pub old_shape_check: tokio::sync::OnceCell<()>,
}
