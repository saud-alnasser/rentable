//! what the organization's commands read and write, managed by its plugin (`plugin.rs`).

use std::sync::{Arc, Mutex, atomic::AtomicBool};
use tokio::sync::RwLock;

use crate::{credential::Credentials, database, machine, settings, turso::consent::TursoConsent};

use super::{
    session::{MemberSession, Upgrades},
    store::OrganizationStore,
};

/// The organization's state as its plugin manages it: its own, and a handle on each of the four
/// other plugins' values its commands act on. Named as every plugin's managed value is
/// (`settings::Shared`, `machine::Shared`); the facts a state read answers the shell with are
/// `session::OrganizationState`, which is another thing.
///
/// **The four handles are the very values those plugins manage**, cloned out of the application
/// state by type in the plugin's setup, so a lock taken through one of them is the lock every other
/// reader takes: `remote_sync` above all, which the `sync` plugin's commands write too. Held here
/// rather than asked for per command because the organization's work passes them down together,
/// through the act, the session and the opening of the workspace database (`workspace/open.rs`).
pub struct Shared {
    /// the workspace database, as the `database` plugin manages it.
    pub db: database::Shared,
    /// the settings, as the `settings` plugin manages them.
    pub settings: settings::Shared,
    /// this machine's record, as the `sync` plugin manages it.
    pub remote_sync: machine::Shared,
    /// the upgrade that brings an older install forward, as the `upgrade` plugin manages it: the
    /// port the session runs it through (`session::Upgrade`).
    pub(crate) upgrade: Upgrades,
    /// the credential store, as `lib.rs` manages it for every plugin: what an act refused because
    /// this machine was signed out on its own forgets the remembered key from as it puts the wall
    /// up (`act::as_member`, effort 846, requirement 10), where the act itself was handed none.
    pub(crate) credentials: Credentials,
    /// the Turso consents this process has started.
    ///
    /// **Not behind an `RwLock` like the handles above**, because it holds its own lock over the
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
    /// `organization_session_state_get` does before anything opens the replica
    /// (`upgrade/shape.rs`). Set once the check has run to completion; a check that
    /// failed leaves it empty, so the next read tries again rather than reading past it.
    pub old_shape_check: tokio::sync::OnceCell<()>,
}
