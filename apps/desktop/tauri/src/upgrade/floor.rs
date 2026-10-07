//! the floors of one database, and where this build stands against them (effort 857, requirements
//! 2 and 13).
//!
//! **Three numbers, in the numbering of the steps** (`upgrade/step.rs`). `level` is the step the
//! data has taken, additions included; `read` is the step a build must know to read it, and `write`
//! the step a build must know to write it. [`Floors::standing`] judges a build that knows step
//! `known` against them: [`Standing::Unreadable`] below the read floor, [`Standing::ReadOnly`] at
//! or above it and below the write floor, and [`Standing::Writable`] at or above both, whatever the
//! level, since a step that moved no floor stops nobody.
//!
//! **Data from before this effort has no floor record, and reads as floors equal to its version**
//! (requirement 13): a workspace at `schema_version` 7 reads `{ level: 7, read: 7, write: 7 }`, and
//! an organization of format 3 reads `{ level: 3, read: 3, write: 3 }`, which is exactly what every
//! build released before it enforced. Nothing is written to make that true, so no workspace or
//! organization is touched to carry it: [`workspace`] and [`organization`] read, and never create
//! a table or a row.
//!
//! **Where the record is**: the workspace's own `data_floor` row, beside its `schema_version` row,
//! and the organization's `organization_floor` row. Both are written by the explicit upgrade, inside
//! its transaction, and neither exists before an upgrade has run; until one has, the version is
//! the record.

use crate::{error::Error, organization::store::OrganizationStore};

/// The one-row table a workspace keeps its floors in, beside `schema_version`.
pub const WORKSPACE_FLOOR_TABLE: &str = "data_floor";

/// The workspace's own version: one row, or none before the table was first written.
const WORKSPACE_VERSION_TABLE: &str = "schema_version";

/// The floors of one database, in the numbering of its steps.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Floors {
    /// the step the data has taken, additions included.
    pub level: u32,
    /// the step a build must know to read it.
    pub read: u32,
    /// the step a build must know to write it.
    pub write: u32,
}

/// What a build may do with a database, judged against its floors.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Standing {
    /// at or above both floors: it reads and writes.
    Writable,
    /// at or above the read floor and below the write floor: it reads, and writes nothing.
    ReadOnly,
    /// below the read floor: it reads nothing.
    Unreadable,
}

impl Floors {
    /// The floors of data from before this effort, which has no floor record: every one at its
    /// version, since every build released before it refused any version above its own.
    pub fn legacy(version: u32) -> Self {
        Self {
            level: version,
            read: version,
            write: version,
        }
    }

    /// Where a build knowing step `known` stands against these floors.
    pub fn standing(&self, known: u32) -> Standing {
        if known < self.read {
            Standing::Unreadable
        } else if known < self.write {
            Standing::ReadOnly
        } else {
            Standing::Writable
        }
    }
}

/// The floors of a workspace, read from its own database: its `data_floor` row where an upgrade
/// wrote one, and otherwise its `schema_version` row, as [`Floors::legacy`] reads it. `None` where
/// it has neither, which is a workspace whose version only the organization's record holds.
///
/// Reads and writes nothing: a table that is not there is looked for, never made.
pub async fn workspace(connection: &turso::Connection) -> Result<Option<Floors>, Error> {
    let tables = tables(connection).await?;

    if tables.iter().any(|table| table == WORKSPACE_FLOOR_TABLE) {
        if let Some(floors) = recorded(
            connection,
            &format!(
                "SELECT \"level\", \"read\", \"write\" FROM \"{WORKSPACE_FLOOR_TABLE}\" \
                 WHERE \"id\" = 1"
            ),
        )
        .await?
        {
            return Ok(Some(floors));
        }
    }

    if !tables.iter().any(|table| table == WORKSPACE_VERSION_TABLE) {
        return Ok(None);
    }

    let mut rows = connection
        .query(
            &format!("SELECT \"version\" FROM \"{WORKSPACE_VERSION_TABLE}\" WHERE \"id\" = 1"),
            (),
        )
        .await?;

    match rows.next().await? {
        Some(row) => Ok(Some(Floors::legacy(step(&row, 0)?))),
        None => Ok(None),
    }
}

/// The floors of an organization, read from its replica: its `organization_floor` row where an
/// upgrade wrote one, and otherwise its `format` row, as [`Floors::legacy`] reads it. `None` where
/// it has no format row, which is an organization of format 1 or one whose upgrade was cut short,
/// and the existing refusal of another format answers that.
///
/// Reads and writes nothing.
pub async fn organization(store: &OrganizationStore) -> Result<Option<Floors>, Error> {
    if let Some((level, read, write)) = store.floor_recorded().await? {
        return Ok(Some(Floors {
            level: number(level)?,
            read: number(read)?,
            write: number(write)?,
        }));
    }

    store
        .format()
        .await?
        .map(|format| number(format).map(Floors::legacy))
        .transpose()
}

/// The tables a database holds, read from it.
async fn tables(connection: &turso::Connection) -> Result<Vec<String>, Error> {
    let mut rows = connection
        .query("SELECT name FROM sqlite_master WHERE type = 'table'", ())
        .await?;
    let mut names = Vec::new();

    while let Some(row) = rows.next().await? {
        if let turso::Value::Text(name) = row.get_value(0)? {
            names.push(name);
        }
    }

    Ok(names)
}

/// The floors one row records, read by `query`, where it holds one.
async fn recorded(connection: &turso::Connection, query: &str) -> Result<Option<Floors>, Error> {
    let mut rows = connection.query(query, ()).await?;

    match rows.next().await? {
        Some(row) => Ok(Some(Floors {
            level: step(&row, 0)?,
            read: step(&row, 1)?,
            write: step(&row, 2)?,
        })),
        None => Ok(None),
    }
}

/// The step number in column `index` of `row`.
fn step(row: &turso::Row, index: usize) -> Result<u32, Error> {
    match row.get_value(index)? {
        turso::Value::Integer(value) => number(value),
        other => Err(Error::Integrity {
            message: format!("a floor or a version held {other:?} where a step number belongs"),
        }),
    }
}

/// A stored version or floor as a step number, which is never negative.
fn number(value: i64) -> Result<u32, Error> {
    u32::try_from(value).map_err(|_| Error::Integrity {
        message: format!("a floor or a version of {value}, which is no step number"),
    })
}

#[cfg(test)]
mod tests {
    use super::{Floors, Standing, organization, workspace};
    use crate::organization::store::{FORMAT_VERSION, OrganizationStore};

    /// **Ticket 01's fourth criterion.** Below, at and above each floor, for floors apart and
    /// together.
    #[test]
    fn a_build_is_judged_below_at_and_above_each_floor() {
        let apart = Floors {
            level: 9,
            read: 5,
            write: 8,
        };
        let together = Floors::legacy(7);
        let cases = [
            // (floors, the build knows, it stands)
            (apart, 4, Standing::Unreadable),
            (apart, 5, Standing::ReadOnly),
            (apart, 6, Standing::ReadOnly),
            (apart, 7, Standing::ReadOnly),
            (apart, 8, Standing::Writable),
            (apart, 9, Standing::Writable),
            (apart, 10, Standing::Writable),
            (together, 6, Standing::Unreadable),
            (together, 7, Standing::Writable),
            (together, 8, Standing::Writable),
            (Floors::legacy(0), 0, Standing::Writable),
        ];

        for (floors, known, expected) in cases {
            assert_eq!(
                floors.standing(known),
                expected,
                "a build knowing {known} against {floors:?}"
            );
        }
    }

    /// A level above what the build knows stops nobody by itself: what it took past the floors
    /// were additions.
    #[test]
    fn a_level_past_the_build_with_floors_it_meets_is_writable() {
        let floors = Floors {
            level: 12,
            read: 7,
            write: 7,
        };

        assert_eq!(floors.standing(7), Standing::Writable);
    }

    #[test]
    fn data_with_no_record_has_every_floor_at_its_version() {
        assert_eq!(
            Floors::legacy(7),
            Floors {
                level: 7,
                read: 7,
                write: 7
            }
        );
        assert_eq!(
            Floors::legacy(3),
            Floors {
                level: 3,
                read: 3,
                write: 3
            }
        );
    }

    /// Every table, and every row of each, as the database holds them: what "writes nothing" is
    /// held to.
    async fn everything(connection: &turso::Connection) -> Vec<(String, Vec<String>)> {
        let mut tables = Vec::new();
        let mut rows = connection
            .query(
                "SELECT name, sql FROM sqlite_master WHERE type = 'table' ORDER BY name",
                (),
            )
            .await
            .expect("the tables");

        while let Some(row) = rows.next().await.expect("a table") {
            let name = match row.get_value(0).expect("a name") {
                turso::Value::Text(name) => name,
                other => panic!("a table named {other:?}"),
            };

            tables.push(name);
        }

        let mut everything = Vec::new();

        for table in tables {
            let mut rows = connection
                .query(&format!("SELECT * FROM \"{table}\""), ())
                .await
                .expect("the rows");
            let mut held = Vec::new();

            while let Some(row) = rows.next().await.expect("a row") {
                held.push(format!(
                    "{:?}",
                    (0..row.column_count())
                        .map(|index| row.get_value(index).expect("a value"))
                        .collect::<Vec<_>>()
                ));
            }

            everything.push((table, held));
        }

        everything
    }

    async fn memory() -> turso::Connection {
        turso::Builder::new_local(":memory:")
            .build()
            .await
            .expect("an in-memory database")
            .connect()
            .expect("a connection")
    }

    /// **Ticket 01's fifth criterion, on a workspace.** A workspace at `schema_version` 7 with no
    /// floor record reads every floor at 7, and nothing in it changes.
    #[tokio::test]
    async fn a_workspace_with_no_floor_record_reads_its_version_and_writes_nothing() {
        let connection = memory().await;

        connection
            .execute(
                "CREATE TABLE \"schema_version\" (\"id\" INTEGER PRIMARY KEY CHECK (\"id\" = 1), \
                 \"version\" INTEGER NOT NULL)",
                (),
            )
            .await
            .expect("the version table");
        connection
            .execute(
                "INSERT INTO \"schema_version\" (\"id\", \"version\") VALUES (1, 7)",
                (),
            )
            .await
            .expect("the version row");
        connection
            .execute("CREATE TABLE \"payment\" (\"id\" TEXT PRIMARY KEY)", ())
            .await
            .expect("a table");

        let before = everything(&connection).await;
        let floors = workspace(&connection).await.expect("the floors");

        assert_eq!(floors, Some(Floors::legacy(7)));
        assert_eq!(everything(&connection).await, before);
    }

    /// A workspace whose version table was never written has no floors of its own to read.
    #[tokio::test]
    async fn a_workspace_with_no_version_row_has_no_floors_of_its_own() {
        let connection = memory().await;
        let before = everything(&connection).await;

        assert_eq!(workspace(&connection).await.expect("the floors"), None);
        assert_eq!(everything(&connection).await, before);
    }

    /// A workspace an upgrade recorded floors in reads them rather than its version.
    #[tokio::test]
    async fn a_workspace_with_a_floor_record_reads_it() {
        let connection = memory().await;

        for statement in [
            "CREATE TABLE \"schema_version\" (\"id\" INTEGER PRIMARY KEY, \"version\" INTEGER)",
            "INSERT INTO \"schema_version\" VALUES (1, 9)",
            "CREATE TABLE \"data_floor\" (\"id\" INTEGER PRIMARY KEY CHECK (\"id\" = 1), \
             \"level\" INTEGER NOT NULL, \"read\" INTEGER NOT NULL, \"write\" INTEGER NOT NULL)",
            "INSERT INTO \"data_floor\" VALUES (1, 9, 7, 8)",
        ] {
            connection.execute(statement, ()).await.expect(statement);
        }

        assert_eq!(
            workspace(&connection).await.expect("the floors"),
            Some(Floors {
                level: 9,
                read: 7,
                write: 8
            })
        );
    }

    async fn store(name: &str) -> OrganizationStore {
        let path = crate::test::scratch(name).join("org.db");

        OrganizationStore::open(crate::clock::System::shared(), &path, None, || async {
            Err(turso::Error::Misuse("no remote".into()))
        })
        .await
        .expect("a store")
    }

    /// **Ticket 01's fifth criterion, on an organization.** An organization of this build's format
    /// with no floor record reads every floor at its format, and nothing in it changes.
    #[tokio::test]
    async fn an_organization_with_no_floor_record_reads_its_format_and_writes_nothing() {
        let store = store("floor-organization").await;

        store.install_schema().await.expect("the schema");
        store.write_format().await.expect("the format row");

        let before = everything(store.connection()).await;
        let floors = organization(&store).await.expect("the floors");

        assert_eq!(floors, Some(Floors::legacy(FORMAT_VERSION as u32)));
        assert_eq!(everything(store.connection()).await, before);
    }

    /// An organization with no format row, format 1's or one cut short, has no floors of its own,
    /// and the read leaves it as it was.
    #[tokio::test]
    async fn an_organization_with_no_format_row_has_no_floors_of_its_own() {
        let store = store("floor-no-format").await;
        let before = everything(store.connection()).await;

        assert_eq!(organization(&store).await.expect("the floors"), None);
        assert_eq!(everything(store.connection()).await, before);
    }

    /// An organization an upgrade recorded floors in reads them rather than its format.
    #[tokio::test]
    async fn an_organization_with_a_floor_record_reads_it() {
        let store = store("floor-recorded").await;

        store.install_schema().await.expect("the schema");
        store.write_format().await.expect("the format row");

        for statement in [
            "CREATE TABLE \"organization_floor\" (\"id\" TEXT PRIMARY KEY NOT NULL, \
             \"level\" INTEGER NOT NULL, \"read\" INTEGER NOT NULL, \"write\" INTEGER NOT NULL, \
             \"written_at\" INTEGER NOT NULL)",
            "INSERT INTO \"organization_floor\" VALUES ('floor', 5, 3, 4, 0)",
        ] {
            store
                .connection()
                .execute(statement, ())
                .await
                .expect(statement);
        }

        assert_eq!(
            organization(&store).await.expect("the floors"),
            Some(Floors {
                level: 5,
                read: 3,
                write: 4
            })
        );
    }
}
