//! This machine's record: what it holds, in `remote-sync.json`, and the holder the process reads
//! and writes it through.
//!
//! The record is the workspace this machine has open, the replicas it keeps and whose they are,
//! the organization it holds, the Turso organization its consent is over, and the moment it last
//! reached Turso. The holder, `RemoteSync`, keeps it beside what this process alone knows: the
//! credential the member's vault unsealed for the replica, and whatever Turso last refused. Both
//! sit behind the one lock `AppState` holds, so a forget or an opening moves them together.
//!
//! **A module of its own, below the modules that write it.** It was `sync/store.rs` until effort
//! 840, and `organization` reached into `sync` for it while `sync`'s commands reached back into
//! `organization`. It names neither: the organization this machine holds is described here
//! (`HeldOrganization`), with the kinds a role is recorded as, because that is what the record
//! keeps; `organization` re-exports both where its own code names them.

mod record;

pub use record::{
    CUSTOM, HeldOrganization, KINDS, MANAGER, MEMBER, OWNER, RemoteSync, RemoteSyncState,
    RemoteSyncStore, RemoteSyncWorkspace, consented_organization,
};

use std::{future::Future, path::PathBuf, pin::Pin};

use tokio::sync::RwLock;

use crate::clock::Clock;

/// Where the workspace database lives on this machine, read live, because the record follows it:
/// every reconcile compares what it holds against this and writes the new place when it moved.
///
/// **A port rather than the settings themselves**, which is what keeps this module below the ones
/// that write it: the settings are served by a module that reaches the application state, and the
/// state holds this record, so naming them here would put the record back on a cycle. The
/// settings answer it (`settings.rs`); a test answers it with any settings file it likes.
pub trait DatabasePath: Send + Sync {
    fn database_path(&self) -> Pin<Box<dyn Future<Output = PathBuf> + Send + '_>>;
}

/// Record on this machine that a replication went through just now.
///
/// **Called wherever one completes, and there are three such places**: the replication, which is
/// the heartbeat and the "check now" control, in both its arms; the push on the way out; and the
/// pull `bootstrap` makes at sign-in. `Database` holds the engine and not the record, so the
/// moment is written by the callers that hold both. A record that cannot be written is a
/// diagnostic rather than a failed replication: the replication itself went.
pub(crate) async fn note_reached(remote_sync: &RwLock<RemoteSync>, clock: &dyn Clock) {
    let mut remote_sync = remote_sync.write().await;

    if let Err(error) = remote_sync.note_reached(clock.now()) {
        crate::diagnostics::error("sync.lastReached.notRecorded")
            .with("error", error.to_string())
            .write();
    }
}
