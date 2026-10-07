//! a store of the organization on a file of its own, replicating nowhere: where the organization's
//! upgrade runs its changes of format on this machine, over what the primary holds (effort 857,
//! ticket 24, `organization/upgrade/primary.rs`).
//!
//! **It is the organization's store in every way a change of format reads it**: the same clock,
//! the same changes of format declared, the same methods. What differs is that it has no remote,
//! so nothing on it is pushed or pulled, and that its connection notes what it runs in a
//! [`Replay`], which keeps nothing until it is started: what fills it from the primary is not kept,
//! and what the changes write after is.

use std::{path::Path, sync::Arc};

use crate::{
    database::{Database, corrupt, replay::Replay},
    error::Error,
};

use super::OrganizationStore;

impl OrganizationStore {
    /// A store at `path` beside this one's settings, replicating nowhere, noting what it runs in
    /// `replay`. The file is the caller's to remove, once the store is let go.
    pub(crate) async fn scratch(&self, path: &Path, replay: Arc<Replay>) -> Result<Self, Error> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let database = Database::open_replica(self.clock.as_ref(), path, None, || async {
            Ok::<String, turso::Error>(String::new())
        })
        .await?;
        // an empty watch: damage met on a file that is thrown away is marked nowhere.
        let connection = corrupt::Watched::replaying(
            database.connect().await?,
            corrupt::Watch::default(),
            replay,
        );

        Ok(Self {
            database,
            connection,
            path: path.to_path_buf(),
            clock: self.clock.clone(),
            bound: self.bound,
            standing: std::sync::Mutex::new(
                *self
                    .standing
                    .lock()
                    .unwrap_or_else(std::sync::PoisonError::into_inner),
            ),
            format_steps: self.format_steps,
        })
    }

    /// Run `sql` with `values` bound in order: what fills a scratch store with what another
    /// database holds, a row or a part of the schema at a time.
    pub(crate) async fn laid(&self, sql: &str, values: Vec<turso::Value>) -> Result<(), Error> {
        self.connection.execute(sql, values).await?;

        Ok(())
    }
}
