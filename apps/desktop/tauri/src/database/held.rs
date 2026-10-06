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
//! **And no longer than a pull may run** ([`APPLYING_LIMIT`]). A gate that never opens would
//! otherwise hold every request for good with nothing in the log, so a checkout still refused at
//! the limit logs `replica.connection.busyTimedOut`, hands its connection back, and answers an
//! error, which every caller already answers as a failed query.
//!
//! A connection's reads record the damage they meet beside the replica, as any watched connection
//! does (`corrupt.rs`); holding it changes nothing about what a damaged read means.

use std::{ops::Deref, sync::Mutex, time::Duration};

use tokio::sync::{Semaphore, SemaphorePermit};

use super::{
    bound::SYNC_BOUND,
    corrupt::{Watch, Watched},
};
use crate::diagnostics;

/// How many connections a replica holds.
///
/// Four: the interface rarely has more than a handful of requests in flight, and a fifth waits on
/// local work rather than on the network. Each is one more engine connection over the same file,
/// with nothing of its own on disk.
pub(crate) const SIZE: usize = 4;

/// How long a checkout waits before asking again whether the engine has finished applying a pull.
const APPLYING_PAUSE: Duration = Duration::from_millis(10);

/// How long a checkout waits out the engine applying a pull before it gives up.
///
/// **The sync bound's ceiling**, the longest a pull may run before it is given up and the gate
/// goes with it. The silence would be shorter, but nothing the engine does while it applies wakes a
/// checkout, so a checkout cannot tell a working apply from a stuck one, and the silence would cut
/// a large pull that is still writing.
pub(crate) const APPLYING_LIMIT: Duration = SYNC_BOUND.ceiling;

/// The connections one replica's requests are served on.
pub(crate) struct Held {
    free: Mutex<Vec<Watched>>,
    /// one permit per connection in `free`, so a checkout that holds a permit always finds one.
    permits: Semaphore,
    /// how many more times a checkout's probe answers `Busy` without asking the engine, so a test
    /// can hold the gate shut, or shut and then open, as the engine applying a pull does.
    #[cfg(test)]
    refusing: std::sync::atomic::AtomicUsize,
    /// how long a checkout waits out the engine applying a pull.
    applying_limit: Duration,
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
            #[cfg(test)]
            refusing: std::sync::atomic::AtomicUsize::new(0),
            applying_limit: APPLYING_LIMIT,
        })
    }

    /// One connection, for this caller alone until the [`Checkout`] is dropped.
    ///
    /// An error where the engine is still applying a pull at [`APPLYING_LIMIT`], with the
    /// connection handed back.
    pub(crate) async fn checkout(&self) -> Result<Checkout<'_>, turso::Error> {
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

        // Made before the wait, so a connection given up on, or a checkout dropped while it waits,
        // goes back to the free ones.
        let checkout = Checkout {
            connection: Some(connection),
            held: self,
            _permit: permit,
        };

        let started = tokio::time::Instant::now();

        while matches!(self.probe(&checkout).await, Err(turso::Error::Busy(_))) {
            if started.elapsed() >= self.applying_limit {
                diagnostics::warn("replica.connection.busyTimedOut")
                    .with("after_ms", self.applying_limit.as_millis().to_string())
                    .write();

                return Err(turso::Error::Error(format!(
                    "the replica was still busy applying a pull after {} seconds",
                    self.applying_limit.as_secs_f64()
                )));
            }

            tokio::time::sleep(APPLYING_PAUSE).await;
        }

        Ok(checkout)
    }

    /// Whether the engine would take a statement on `connection` now.
    async fn probe(&self, connection: &turso::Connection) -> Result<(), turso::Error> {
        #[cfg(test)]
        {
            use std::sync::atomic::Ordering;

            if self
                .refusing
                .fetch_update(Ordering::SeqCst, Ordering::SeqCst, |left| {
                    left.checked_sub(1)
                })
                .is_ok()
            {
                return Err(turso::Error::Busy("database is locked".to_string()));
            }
        }

        connection.prepare("SELECT 1").await.map(|_| ())
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

#[cfg(test)]
mod tests {
    use super::Held;
    use crate::{
        database::{Database, corrupt::Watch},
        sync::test::server::within,
        test::{diagnostics_log, scratch},
    };
    use std::{
        sync::atomic::Ordering,
        time::{Duration, Instant},
    };

    /// A replica engine with no remote, and its held connections, which give up a gate shut for
    /// longer than `limit`.
    async fn held(
        name: &str,
        limit: Duration,
    ) -> (std::path::PathBuf, turso::sync::Database, Held) {
        let directory = scratch(name);
        let engine = Database::open_replica(
            &crate::clock::System,
            &directory.join("app.db"),
            None,
            || async { Ok::<String, turso::Error>(String::new()) },
        )
        .await
        .expect("replica engine");
        let mut held = Held::open(&engine, &Watch::default(), 1)
            .await
            .expect("the held connections");
        held.applying_limit = limit;

        (directory, engine, held)
    }

    /// The lines of the test run's log that name `event`.
    fn logged(event: &str) -> usize {
        std::fs::read_dir(diagnostics_log())
            .expect("the test run's log directory")
            .filter_map(|entry| std::fs::read_to_string(entry.ok()?.path()).ok())
            .map(|contents| {
                contents
                    .lines()
                    .filter(|line| line.contains(&format!("\"{event}\"")))
                    .count()
            })
            .sum()
    }

    /// **A gate the engine never opens is given up at the limit, logged, and answered as an
    /// error** (effort 854, requirement 15), rather than holding every request for good with
    /// nothing in the log. The connection goes back, so the next request still finds one.
    #[test]
    fn a_checkout_gives_up_a_gate_that_never_opens() {
        within(Duration::from_secs(20), async {
            diagnostics_log();
            let before = logged("replica.connection.busyTimedOut");
            let (directory, engine, held) =
                held("held-gate-shut", Duration::from_millis(300)).await;
            held.refusing.store(usize::MAX, Ordering::SeqCst);

            let started = Instant::now();
            let answer = held.checkout().await;

            assert!(
                answer.is_err(),
                "a checkout went through a gate that never opened"
            );
            assert!(
                started.elapsed() < Duration::from_secs(2),
                "the checkout waited {:?} on a shut gate",
                started.elapsed()
            );
            drop(answer);
            assert_eq!(
                logged("replica.connection.busyTimedOut"),
                before + 1,
                "giving up the gate was not logged"
            );

            held.refusing.store(0, Ordering::SeqCst);
            assert!(
                held.checkout().await.is_ok(),
                "the connection given up on was not returned"
            );

            drop(held);
            drop(engine);
            let _ = std::fs::remove_dir_all(&directory);
        });
    }

    /// **A gate that opens within the limit is waited out**, as `connect()` waited for the engine
    /// to finish applying a pull, and the checkout runs.
    #[test]
    fn a_checkout_waits_out_a_gate_that_opens() {
        within(Duration::from_secs(20), async {
            let (directory, engine, held) = held("held-gate-opens", Duration::from_secs(5)).await;
            held.refusing.store(20, Ordering::SeqCst);

            let checkout = held
                .checkout()
                .await
                .expect("a gate that opened was given up");
            assert_eq!(held.refusing.load(Ordering::SeqCst), 0);
            checkout
                .prepare("SELECT 1")
                .await
                .expect("the connection runs");

            drop(checkout);
            drop(held);
            drop(engine);
            let _ = std::fs::remove_dir_all(&directory);
        });
    }
}
