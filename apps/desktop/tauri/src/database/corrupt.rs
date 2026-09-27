//! A replica found damaged is set aside and opened again from its remote.
//!
//! **Firefox's practice rather than a repair** (effort 838, requirement 17). A local replica holds
//! nothing the remote does not, except what this machine wrote and has not yet pushed, so a file
//! the engine cannot read is worth less than a fresh one pulled from the remote. It is renamed
//! rather than deleted, beside where it was, with every file the engine keeps beside it, so that
//! whoever looks later has what there was; and the log says what was set aside and that anything
//! not yet sent from it is lost.
//!
//! **What counts as damaged is what the engine says, and one thing it does not.** Measured on
//! turso 0.8.0-pre.12 against files written for the purpose:
//!
//! - A file that is not a database fails the engine's open. The sync kit flattens the error on the
//!   way out (`turso_sync_sdk_kit`'s `TursoAsyncOperation::resume` makes every failed operation a
//!   `TursoError::Error` carrying the text), so at the open the kind is gone and only turso_core's
//!   own words for `LimboError::NotADB`, "file is not a database", are left to read. Once open, a
//!   read keeps the kind, and `turso::Error::NotAdb` and `turso::Error::Corrupt` are matched as
//!   kinds.
//! - **A database cut short is never reported as corrupt.** Cut inside its first page, the open
//!   fails with a short read; cut further on, the open succeeds and a read of a missing page
//!   answers `Busy("database is locked")`, which is indistinguishable from a real lock; cut to its
//!   first page or two, the open never returns. So a truncated file is found before the engine is
//!   given it, by the file format's own record of its length: the header's page count against
//!   the bytes the file holds. That is read only where the
//!   write-ahead log is absent or empty, because only then is the main file the whole database; a
//!   checkpoint cut short leaves the log behind and the engine recovers from it.
//!
//! **Once per open.** A replica opened again that still fails is refused as any open is.

use std::{
    future::Future,
    io::Read,
    path::{Path, PathBuf},
};

use crate::diagnostics::{self, DiagnosticRecord};

/// The words turso_core gives `LimboError::NotADB`, which are all that reach the caller when the
/// sync engine's open fails (see the module comment).
const NOT_A_DATABASE: &str = "file is not a database";

/// The file format's header is the first hundred bytes of page 1.
const HEADER_LENGTH: usize = 100;

const MAGIC: &[u8; 16] = b"SQLite format 3\0";

/// Why a replica is set aside, in the words the log carries.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum Damage {
    /// the engine said the file is not a database, or is corrupt.
    Reported(String),
    /// the file holds fewer bytes than its own header says the database has.
    Truncated { holds: u64, claims: u64 },
}

impl Damage {
    fn describe(&self) -> String {
        match self {
            Damage::Reported(message) => message.clone(),
            Damage::Truncated { holds, claims } => {
                format!("the file holds {holds} bytes of the {claims} its header says it has")
            }
        }
    }
}

/// Whether an error from opening or reading a replica says the file is damaged.
pub(crate) fn reported(error: &turso::Error) -> Option<Damage> {
    match error {
        turso::Error::NotAdb(_) | turso::Error::Corrupt(_) => {
            Some(Damage::Reported(error.to_string()))
        }
        // the sync engine's open, where the kind has been flattened to text.
        turso::Error::Error(message) if message.contains(NOT_A_DATABASE) => {
            Some(Damage::Reported(message.clone()))
        }
        _ => None,
    }
}

/// Whether the file at `replica` is shorter than the database its header describes.
///
/// A file that does not exist, is empty, or cannot be read is not called truncated here: the first
/// two are a replica not yet made, and the third is the engine's to answer. A file that is not a
/// database at all is the engine's too, and it says so.
pub(crate) fn truncated(replica: &Path) -> Option<Damage> {
    let wal = PathBuf::from(format!("{}-wal", replica.display()));

    if std::fs::metadata(&wal).is_ok_and(|log| log.len() > 0) {
        return None;
    }

    let mut file = std::fs::File::open(replica).ok()?;
    let holds = file.metadata().ok()?.len();

    if holds == 0 {
        return None;
    }

    let mut header = Vec::with_capacity(HEADER_LENGTH);
    file.by_ref()
        .take(HEADER_LENGTH as u64)
        .read_to_end(&mut header)
        .ok()?;

    // cut inside its own header: the engine answers a short read on page 1, which is not a kind.
    if header.len() < HEADER_LENGTH {
        return header
            .starts_with(&MAGIC[..header.len().min(MAGIC.len())])
            .then_some(Damage::Truncated {
                holds,
                claims: HEADER_LENGTH as u64,
            });
    }

    if &header[..16] != MAGIC {
        return None;
    }

    let page_size = match u16::from_be_bytes([header[16], header[17]]) {
        1 => 65_536,
        size => u64::from(size),
    };
    let pages = u64::from(u32::from_be_bytes([
        header[28], header[29], header[30], header[31],
    ]));

    // **The page count is read whatever the header's validity marker says.** SQLite trusts it only
    // where the change counter at 24 equals the version-valid-for number at 92, and turso writes
    // neither as SQLite does: measured on 0.8.0-pre.12, a replica checkpointed whole carries a
    // change counter of 1, its library version at 92, and a page count equal to its length. A
    // replica is written by nothing but turso, so its count is what is held to.
    if pages == 0 {
        return None;
    }

    let claims = pages * page_size;

    (holds < claims).then_some(Damage::Truncated { holds, claims })
}

/// Rename the replica and every file the engine keeps beside it to `<name>.corrupt-<at>`, and say
/// what now carries that name. A file that will not move is left, and the open that follows meets
/// it and is refused as any open is.
pub(crate) fn set_aside(replica: &Path, at: i64) -> Vec<PathBuf> {
    super::Database::replica_files(replica)
        .into_iter()
        .filter_map(|file| {
            let kept = PathBuf::from(format!("{}.corrupt-{at}", file.display()));

            std::fs::rename(&file, &kept).ok().map(|()| kept)
        })
        .collect()
}

/// What the log says of a replica set aside.
pub(crate) fn record(replica: &Path, damage: &Damage, kept: &[PathBuf]) -> DiagnosticRecord {
    diagnostics::warn("replica.corrupt.setAside")
        .with("replica", replica.display().to_string())
        .with("damage", damage.describe())
        .with(
            "keptAs",
            kept.iter()
                .map(|path| path.display().to_string())
                .collect::<Vec<_>>()
                .join(", "),
        )
        .with(
            "lost",
            "anything written on this machine and not yet sent to the remote",
        )
}

/// Open a replica, and where it is found damaged, set it aside and open it once more.
///
/// `open` builds the engine over `replica` and makes its first read; a damaged file answers there
/// or before it, in [`truncated`]. The second open's failure, whatever it is, is the answer.
pub(crate) async fn opened_once_more<T, F, Fut>(replica: &Path, open: F) -> Result<T, turso::Error>
where
    F: Fn() -> Fut,
    Fut: Future<Output = Result<T, turso::Error>>,
{
    let damage = match truncated(replica) {
        Some(damage) => damage,
        None => match open().await {
            Ok(opened) => return Ok(opened),
            Err(error) => match reported(&error) {
                Some(damage) => damage,
                None => return Err(error),
            },
        },
    };

    let kept = set_aside(replica, crate::timestamp::now());
    record(replica, &damage, &kept).write();

    open().await
}

#[cfg(test)]
mod tests {
    use super::{Damage, opened_once_more, record, reported, truncated};
    use crate::database::Database;
    use std::{
        path::{Path, PathBuf},
        sync::atomic::{AtomicUsize, Ordering},
    };

    fn scratch(name: &str) -> PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|elapsed| elapsed.as_nanos())
            .unwrap_or_default();
        let directory = std::env::temp_dir().join(format!("rentable-corrupt-{name}-{nanos}"));
        std::fs::create_dir_all(&directory).expect("scratch directory");

        directory
    }

    fn names_in(directory: &Path) -> Vec<String> {
        let mut names: Vec<String> = std::fs::read_dir(directory)
            .expect("the directory")
            .flatten()
            .map(|entry| entry.file_name().to_string_lossy().into_owned())
            .collect();
        names.sort();

        names
    }

    /// Every file that was there before is there still, under `<name>.corrupt-<ms>`.
    fn every_file_kept(directory: &Path, before: &[String]) {
        let after = names_in(directory);

        for name in before {
            assert!(
                after
                    .iter()
                    .any(|kept| kept.starts_with(&format!("{name}.corrupt-"))),
                "{name} was not set aside: {after:?}"
            );
        }
    }

    /// A replica holding a table of rows, closed with everything in the main file.
    async fn written(replica: &Path) {
        let database = Database::open_replica(replica, None, || async {
            Ok::<String, turso::Error>(String::new())
        })
        .await
        .expect("replica engine");
        let connection = database.connect().await.expect("replica connection");

        connection
            .execute(
                "create table tenant (id integer primary key, name text)",
                (),
            )
            .await
            .expect("the schema");
        for row in 0..2000 {
            connection
                .execute(
                    &format!(
                        "insert into tenant (name) values ('{}')",
                        "x".repeat(200 + row % 7)
                    ),
                    (),
                )
                .await
                .expect("a row");
        }
        // answers a row, which `execute` reports as a misuse after the checkpoint has run.
        let _ = connection
            .execute("PRAGMA wal_checkpoint(TRUNCATE)", ())
            .await;

        drop(connection);
        drop(database);

        assert_eq!(
            std::fs::metadata(format!("{}-wal", replica.display()))
                .map(|log| log.len())
                .unwrap_or_default(),
            0,
            "the fixture left rows in the log, so the main file is not the whole database"
        );
    }

    /// Opened through the application's own path, against a remote that hangs up, which is enough
    /// to see the reopened replica reach for it.
    async fn reopened(
        replica: &Path,
    ) -> (
        turso::sync::Database,
        crate::sync::test::server::ScriptedServer,
    ) {
        use crate::sync::test::server::{ScriptedResponse, ScriptedServer};

        let remote =
            ScriptedServer::start((0..8).map(|_| ScriptedResponse::hangup()).collect()).await;
        let database = Database::open_replica(replica, Some(remote.url("")), || async {
            Ok::<String, turso::Error>("a-credential".to_string())
        })
        .await
        .expect("the replica was not opened again");

        (database, remote)
    }

    /// The reopened replica holds none of the old one and asks its remote for the database.
    async fn pulled_again(
        database: &turso::sync::Database,
        remote: &crate::sync::test::server::ScriptedServer,
    ) {
        assert!(
            !Database::is_replica_ready(database).await,
            "the replica opened again still held a schema"
        );

        let _ = database.pull().await;

        assert!(
            remote.request_count() > 0,
            "the replica opened again did not ask its remote for the database"
        );
    }

    /// Criterion 17, a file that is not a database.
    #[tokio::test]
    async fn a_replica_that_is_not_a_database_is_set_aside_and_pulled_again() {
        let directory = scratch("not-a-database");
        let replica = directory.join("ws-north.db");
        // a real replica, so its sync metadata is the engine's own, with its database overwritten.
        written(&replica).await;
        let junk: Vec<u8> = (0..20_000u32)
            .map(|at| (at.wrapping_mul(2_654_435_761) >> 13) as u8)
            .collect();
        std::fs::write(&replica, &junk).expect("the damaged file");

        let before = names_in(&directory);
        assert!(
            before.iter().any(|name| name == "ws-north.db-info"),
            "the fixture holds no sync metadata to set aside: {before:?}"
        );

        let (database, remote) = reopened(&replica).await;

        every_file_kept(&directory, &before);
        let kept = names_in(&directory);
        let original = directory.join(
            kept.iter()
                .find(|name| name.starts_with("ws-north.db.corrupt-"))
                .expect("the file"),
        );
        assert_eq!(
            std::fs::read(original).expect("the file kept"),
            junk,
            "the file set aside is not the one that was there"
        );

        pulled_again(&database, &remote).await;

        drop(database);
        let _ = std::fs::remove_dir_all(&directory);
    }

    /// Criterion 17, a real replica cut short at a page boundary and inside its first page, which
    /// the engine does not report as corrupt at all (see the module comment).
    #[tokio::test]
    async fn a_truncated_replica_is_set_aside_and_pulled_again() {
        for (cut, keep) in [("half", None), ("header", Some(50u64))] {
            let directory = scratch(&format!("truncated-{cut}"));
            let replica = directory.join("org-north.db");

            written(&replica).await;

            let length = std::fs::metadata(&replica).expect("the file").len();
            let keep = keep.unwrap_or(length / 2 / 4096 * 4096);
            std::fs::OpenOptions::new()
                .write(true)
                .open(&replica)
                .and_then(|file| file.set_len(keep))
                .expect("the cut");

            assert!(
                truncated(&replica).is_some(),
                "a file cut to {keep} of {length} bytes read as whole"
            );

            let before = names_in(&directory);
            let (database, remote) = reopened(&replica).await;

            every_file_kept(&directory, &before);

            pulled_again(&database, &remote).await;

            drop(database);
            let _ = std::fs::remove_dir_all(&directory);
        }
    }

    /// A whole replica is never set aside.
    #[tokio::test]
    async fn a_whole_replica_is_left_where_it_is() {
        let directory = scratch("whole");
        let replica = directory.join("ws-north.db");

        written(&replica).await;

        let database = Database::open_replica(&replica, None, || async {
            Ok::<String, turso::Error>(String::new())
        })
        .await
        .expect("replica engine");
        assert!(Database::is_replica_ready(&database).await, "the rows went");
        drop(database);

        assert!(
            !names_in(&directory)
                .iter()
                .any(|name| name.contains(".corrupt-")),
            "a whole replica was set aside"
        );
        let _ = std::fs::remove_dir_all(&directory);
    }

    /// A main file shorter than its header, beside a log holding frames, is a checkpoint the engine
    /// has yet to finish rather than damage, and is left for the engine to recover.
    #[test]
    fn a_short_file_beside_its_log_is_not_called_truncated() {
        let directory = scratch("beside-its-log");
        let replica = directory.join("ws-north.db");
        let mut header = b"SQLite format 3 ".to_vec();
        header.resize(4096, 0);
        header[16..18].copy_from_slice(&4096u16.to_be_bytes());
        header[28..32].copy_from_slice(&3u32.to_be_bytes());
        std::fs::write(&replica, &header).expect("the file");

        assert!(truncated(&replica).is_some(), "the fixture is not short");

        std::fs::write(format!("{}-wal", replica.display()), b"frames").expect("the log");

        assert_eq!(truncated(&replica), None);
        let _ = std::fs::remove_dir_all(&directory);
    }

    /// Once per open: a second failure is the answer, even where it says the same thing.
    #[tokio::test]
    async fn a_replica_is_opened_once_more_and_no_more() {
        let directory = scratch("once");
        let replica = directory.join("ws-north.db");
        std::fs::write(&replica, b"not a database, twice").expect("the file");
        let opens = AtomicUsize::new(0);

        let answer: Result<(), turso::Error> = opened_once_more(&replica, || {
            opens.fetch_add(1, Ordering::SeqCst);

            async { Err(turso::Error::NotAdb("file is not a database".to_string())) }
        })
        .await;

        assert!(matches!(answer, Err(turso::Error::NotAdb(_))), "{answer:?}");
        assert_eq!(
            opens.load(Ordering::SeqCst),
            2,
            "the replica was not opened exactly twice"
        );
        let _ = std::fs::remove_dir_all(&directory);
    }

    /// Nothing else an open can answer sets a replica aside: offline, a refused credential, a lock.
    #[test]
    fn only_damage_sets_a_replica_aside() {
        for error in [
            turso::Error::Error("sync engine operation failed: http error".to_string()),
            turso::Error::Busy("database is locked".to_string()),
            turso::Error::Misuse("no credential is unsealed yet".to_string()),
            turso::Error::IoError(std::io::ErrorKind::NotFound, "open"),
        ] {
            assert_eq!(reported(&error), None, "{error:?} set a replica aside");
        }

        assert!(reported(&turso::Error::Corrupt("page 3".to_string())).is_some());
        assert!(
            reported(&turso::Error::Error(
                "sync engine operation failed: database sync engine error: unable to open \
                 database file: file is not a database"
                    .to_string()
            ))
            .is_some()
        );
    }

    /// The log names the file, what it was kept as, and that what was not sent is lost.
    #[test]
    fn the_log_names_what_was_set_aside_and_what_was_lost() {
        let replica = Path::new("C:/rentable/ws-north.db");
        let kept = [PathBuf::from("C:/rentable/ws-north.db.corrupt-17")];

        let line = record(
            replica,
            &Damage::Truncated {
                holds: 4096,
                claims: 8192,
            },
            &kept,
        );

        assert_eq!(line.event, "replica.corrupt.setAside");
        assert!(line.fields["replica"].contains("ws-north.db"));
        assert!(line.fields["keptAs"].contains("ws-north.db.corrupt-17"));
        assert!(line.fields["damage"].contains("4096"));
        assert!(line.fields["lost"].contains("not yet sent"));
    }
}
