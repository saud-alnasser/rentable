//! The `migration_lease` table: which member is upgrading a workspace, and until when.

use crate::error::Error;

use super::{OrganizationStore, integer, text};

pub(super) const MIGRATION_LEASE: &str = "CREATE TABLE IF NOT EXISTS \"migration_lease\" (\
        \"workspace_id\" TEXT PRIMARY KEY NOT NULL, \
        \"holder_member_id\" TEXT NOT NULL, \
        \"expires_at\" INTEGER NOT NULL)";

/// A `migration_lease` row: which member is upgrading a workspace, and the moment after which
/// nobody is, whatever became of them.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MigrationLeaseRecord {
    pub workspace_id: String,
    pub holder_member_id: String,
    pub expires_at: i64,
}

impl OrganizationStore {
    /// The migration lease on a workspace, or nothing: who holds it and until when, as a value
    /// a human can read out of the row.
    pub async fn migration_lease(
        &self,
        workspace_id: &str,
    ) -> Result<Option<MigrationLeaseRecord>, Error> {
        let mut rows = self
            .connection
            .query(
                "SELECT \"holder_member_id\", \"expires_at\" FROM \"migration_lease\" \
                 WHERE \"workspace_id\" = ?",
                vec![turso::Value::Text(workspace_id.to_string())],
            )
            .await?;

        match rows.next().await? {
            Some(row) => Ok(Some(MigrationLeaseRecord {
                workspace_id: workspace_id.to_string(),
                holder_member_id: text(&row, 0)?,
                expires_at: integer(&row, 1)?,
            })),
            None => Ok(None),
        }
    }

    /// The connection, for the lease authority that runs the lease statements against a local
    /// primary (`organization/migration.rs::StoreLease`).
    pub(crate) fn lease_connection(&self) -> &turso::Connection {
        &self.connection
    }
}
