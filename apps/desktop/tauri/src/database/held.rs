//! The connections a workspace replica serves its requests on, opened with the engine.
//!
//! **A request never asks the engine for a connection once the engine is open** (effort 854,
//! requirement 15). `turso::sync::Database::connect` takes the sync engine's own mutex, a
//! synchronous one that a push or a pull holds for the whole of its wait on the network, and it
//! blocks its thread rather than yielding while it waits (`turso_sync_sdk_kit`'s `rsapi.rs`). A
//! connection per request therefore stalled every query behind a pull the network never answered,
//! whatever lock the application held, and no timeout around it could fire. A connection that
//! already exists is not held: measured on 2026-10-06, one opened before a pull stalled ran a
//! query and an insert in 50 ms ([[efforts/854-bugs-and-edge-cases-across-the-app/evidence/research/a-stalled-sync-holds-connect]]).
//!
//! So [`Held::open`] opens [`SIZE`] of them when the engine is built, before any push or pull can
//! run, and a request checks one out for itself alone ([`Held::checkout`]). Alone, because a batch
//! opens a transaction on its connection and two callers sharing one would share it. A request
//! that finds every connection out waits for one to come back, which is a wait on local work only.
//!
//! **A checkout waits out the engine applying what a pull brought**, as `connect()` did. While the
//! engine writes a pull's changes into the replica, every one of its connections answers `Busy`
//! to a statement it is asked to prepare (`turso_sdk_kit`'s `SyncBusyGate`), and a request that
//! used to wait at `connect()` for that to finish would otherwise be refused instead. The apply is
//! local work, and a pull that stops answering partway is given up by its bound
//! (`database/bound.rs`), which lets the gate go with it.
//!
//! A connection's reads record the damage they meet beside the replica, as any watched connection
//! does (`corrupt.rs`); holding it changes nothing about what a damaged read means.

use std::{ops::Deref, sync::Mutex, time::Duration};

use tokio::sync::{Semaphore, SemaphorePermit};

use super::corrupt::{Watch, Watched};

/// How many connections a replica holds.
///
/// Four: the interface rarely has more than a handful of requests in flight, and a fifth waits on
/// local work rather than on the network. Each is one more engine connection over the same file,
/// with nothing of its own on disk.
pub(crate) const SIZE: usize = 4;

/// How long a checkout waits before asking again whether the engine has finished applying a pull.
const APPLYING_PAUSE: Duration = Duration::from_millis(10);

/// The connections one replica's requests are served on.
pub(crate) struct Held {
    free: Mutex<Vec<Watched>>,
    /// one permit per connection in `free`, so a checkout that holds a permit always finds one.
    permits: Semaphore,
}

impl Held {
    /// Open `size` connections to `engine`, each watched by `watch`.
    ///
    /// **Called before the engine is handed to anything that pushes or pulls**, which is the only
    /// moment `connect()` is sure not to wait on the network.
    pub(crate) async fn open(
        engine: &turso::sync::Database,
        watch: &Watch,
        size: usize,
    ) -> Result<Self, turso::Error> {
        let mut free = Vec::with_capacity(size);

        for _ in 0..size {
            free.push(Watched::new(
                watch.note(engine.connect().await)?,
                watch.clone(),
            ));
        }

        Ok(Held {
            free: Mutex::new(free),
            permits: Semaphore::new(size),
        })
    }

    /// One connection, for this caller alone until the [`Checkout`] is dropped.
    pub(crate) async fn checkout(&self) -> Checkout<'_> {
        // **The semaphore is never closed**, so an acquire only ever answers a permit.
        let Ok(permit) = self.permits.acquire().await else {
            unreachable!("the held connections' semaphore is never closed")
        };

        let connection = self
            .free
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .pop();
        let Some(connection) = connection else {
            unreachable!("a permit was granted with no connection free")
        };

        while matches!(
            connection.prepare("SELECT 1").await,
            Err(turso::Error::Busy(_))
        ) {
            tokio::time::sleep(APPLYING_PAUSE).await;
        }

        Checkout {
            connection: Some(connection),
            held: self,
            _permit: permit,
        }
    }
}

/// A connection checked out of [`Held`], returned to it when dropped.
pub(crate) struct Checkout<'a> {
    connection: Option<Watched>,
    held: &'a Held,
    /// released after the connection is back, which `Drop` puts it before the fields are dropped.
    _permit: SemaphorePermit<'a>,
}

impl Deref for Checkout<'_> {
    type Target = Watched;

    fn deref(&self) -> &Watched {
        match &self.connection {
            Some(connection) => connection,
            None => unreachable!("a checkout's connection is taken only as it is dropped"),
        }
    }
}

impl Drop for Checkout<'_> {
    fn drop(&mut self) {
        if let Some(connection) = self.connection.take() {
            self.held
                .free
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .push(connection);
        }
    }
}
