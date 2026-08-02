use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::PathBuf,
    sync::Mutex,
};

use crate::{diagnostics::DiagnosticRecord, error::Error};

/// the stem every diagnostics file is named from: `rentable.log` while it is
/// being written to, `rentable.1.log` and upward once rotated.
const FILE_STEM: &str = "rentable";

/// what bounds the diagnostics on disk.
///
/// The two together are the bound: the log occupies at most `max_files` files
/// of `max_file_bytes` each. Rotation happens *before* a line is written rather
/// than after, so a file only exceeds its size when a single line does.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RotationLimits {
    pub max_file_bytes: u64,
    /// how many files are kept, the one being written to included.
    pub max_files: usize,
}

impl RotationLimits {
    /// two megabytes in four files. Enough to hold several sessions of a
    /// desktop application that logs events rather than requests, and small
    /// enough to attach to a message.
    pub const DEFAULT: Self = Self {
        max_file_bytes: 512 * 1024,
        max_files: 4,
    };

    /// the most the diagnostics may occupy, barring a single line larger than
    /// `max_file_bytes`.
    pub const fn max_total_bytes(&self) -> u64 {
        self.max_file_bytes * self.max_files as u64
    }
}

/// an append-only log of lines, kept within [`RotationLimits`].
///
/// Writes are serialized against each other, and every one opens the file
/// afresh: the log is small, written a few times a minute at most, and a handle
/// held open across a rotation — or across a user deleting the directory — is
/// a handle writing to a file nobody can find.
pub struct DiagnosticLog {
    directory: PathBuf,
    limits: RotationLimits,
    guard: Mutex<()>,
}

impl DiagnosticLog {
    /// open a log in `directory`, creating the directory if it is not there.
    pub fn new(directory: PathBuf, limits: RotationLimits) -> Result<Self, Error> {
        fs::create_dir_all(&directory)?;

        Ok(Self {
            directory,
            limits,
            guard: Mutex::new(()),
        })
    }

    /// write one event, redacted, stamped with the time it was written.
    ///
    /// Redaction happens here rather than in the caller because this is the
    /// only door to the file: a record on disk has passed through it by
    /// construction, and no future caller can reach around it.
    pub fn append(&self, record: DiagnosticRecord, at: i64) -> Result<(), Error> {
        self.append_line(&record.redacted().to_line(at))
    }

    fn append_line(&self, line: &str) -> Result<(), Error> {
        // a panic while writing a diagnostic must not silence every diagnostic
        // afterwards, so a poisoned guard is taken rather than propagated.
        let _guard = self
            .guard
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());

        let path = self.current_path();
        let written = fs::metadata(&path).map(|file| file.len()).unwrap_or(0);
        let addition = line.len() as u64 + 1;

        if written > 0 && written + addition > self.limits.max_file_bytes {
            self.rotate()?;
        }

        let mut file = OpenOptions::new().create(true).append(true).open(&path)?;

        writeln!(file, "{line}")?;

        Ok(())
    }

    fn current_path(&self) -> PathBuf {
        self.directory.join(format!("{FILE_STEM}.log"))
    }

    fn rotated_path(&self, index: usize) -> PathBuf {
        self.directory.join(format!("{FILE_STEM}.{index}.log"))
    }

    fn rotate(&self) -> Result<(), Error> {
        if self.limits.max_files <= 1 {
            return fs::remove_file(self.current_path()).map_err(Error::from);
        }

        self.age_rotated_files()?;

        fs::rename(self.current_path(), self.rotated_path(1))?;

        Ok(())
    }

    fn age_rotated_files(&self) -> Result<(), Error> {
        for generation in (1..self.limits.max_files).rev() {
            let file = self.rotated_path(generation);

            if !file.exists() {
                continue;
            }

            if generation + 1 >= self.limits.max_files {
                fs::remove_file(&file)?;
            } else {
                fs::rename(&file, self.rotated_path(generation + 1))?;
            }
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::{DiagnosticLog, RotationLimits};
    use crate::diagnostics::{DiagnosticLevel, DiagnosticRecord, REDACTED};

    fn unique_dir(name: &str) -> PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("system time before unix epoch")
            .as_nanos();

        std::env::temp_dir()
            .join("rentable-tests")
            .join(format!("diagnostics-{name}-{nanos}"))
    }

    fn event(name: &str) -> DiagnosticRecord {
        DiagnosticRecord::new(DiagnosticLevel::Info, name)
    }

    fn written_files(directory: &PathBuf) -> Vec<PathBuf> {
        let mut files: Vec<PathBuf> = std::fs::read_dir(directory)
            .expect("failed to read the diagnostics directory")
            .map(|entry| entry.expect("failed to read a diagnostics entry").path())
            .collect();

        files.sort();
        files
    }

    /// the criterion the ticket asks for, asserted against the file rather than
    /// against the redaction function: writing is the only door to disk, so a
    /// record that arrives unredacted arrives unredacted for every caller.
    #[test]
    fn a_secret_never_reaches_the_file_by_any_route() {
        let directory = unique_dir("redaction");
        let log = DiagnosticLog::new(directory.clone(), RotationLimits::DEFAULT)
            .expect("failed to open the log");

        let leaks = [
            event("account.linked").with("refreshToken", "1//04dXmSecret"),
            event("sync.push.failed").with("error", "denied for Bearer ya29.leaked"),
            // the shape a token exchange fails in: a form body quoted whole, under
            // a field name that says nothing about what it carries.
            event("sync.token.refreshFailed").with(
                "error",
                "POST /token failed: grant_type=refresh_token&client_secret=GOCSPX-3fLeaked",
            ),
            // arriving from the webview, where the event name is not a literal
            // this crate wrote.
            event("failed for ya29.leaked").with("stage", "upload"),
        ];

        for leak in leaks {
            log.append(leak, 1_754_000_000_000)
                .expect("failed to append");
        }

        let contents = std::fs::read_to_string(directory.join("rentable.log"))
            .expect("failed to read the log");

        for secret in ["1//04dXmSecret", "ya29.leaked", "GOCSPX-3fLeaked"] {
            assert!(!contents.contains(secret), "{secret} reached the file");
        }

        assert!(
            contents.contains("grant_type=refresh_token"),
            "redaction took the request with the secret, leaving nothing to diagnose"
        );
        assert!(contents.contains(REDACTED));

        std::fs::remove_dir_all(&directory).ok();
    }

    #[test]
    fn the_log_stays_within_its_limits_however_much_is_written() {
        let directory = unique_dir("rotation");
        let limits = RotationLimits {
            max_file_bytes: 512,
            max_files: 3,
        };
        let log = DiagnosticLog::new(directory.clone(), limits).expect("failed to open the log");

        for index in 0..400 {
            log.append(
                event("sync.pull.completed").with("run", index.to_string()),
                index,
            )
            .expect("failed to append");
        }

        let files = written_files(&directory);
        let total: u64 = files
            .iter()
            .map(|file| {
                std::fs::metadata(file)
                    .expect("failed to measure a diagnostics file")
                    .len()
            })
            .sum();

        assert_eq!(files.len(), limits.max_files);
        assert!(
            total <= limits.max_total_bytes(),
            "{total} bytes exceeds the {} the limits promise",
            limits.max_total_bytes()
        );

        std::fs::remove_dir_all(&directory).ok();
    }

    /// the one exception the limits document: an event too large for a file is
    /// written whole rather than truncated, because half a JSON line is not an
    /// event. It is pinned so that the overshoot stays one line's worth.
    #[test]
    fn one_event_larger_than_a_file_is_written_whole() {
        let directory = unique_dir("oversized");
        let limits = RotationLimits {
            max_file_bytes: 128,
            max_files: 2,
        };
        let log = DiagnosticLog::new(directory.clone(), limits).expect("failed to open the log");
        let oversized = "x".repeat(512);

        log.append(event("backup.createFailed").with("error", &oversized), 1)
            .expect("failed to append");

        let contents = std::fs::read_to_string(directory.join("rentable.log"))
            .expect("failed to read the log");

        assert!(contents.contains(&oversized), "the event was truncated");
        assert!(
            contents.len() as u64 > limits.max_file_bytes,
            "this test no longer exercises an oversized event"
        );

        std::fs::remove_dir_all(&directory).ok();
    }

    #[test]
    fn rotation_discards_the_oldest_events_and_keeps_the_newest() {
        let directory = unique_dir("recency");
        let log = DiagnosticLog::new(
            directory.clone(),
            RotationLimits {
                max_file_bytes: 256,
                max_files: 2,
            },
        )
        .expect("failed to open the log");

        for index in 0..40 {
            log.append(
                event("startup.completed").with("run", index.to_string()),
                index,
            )
            .expect("failed to append");
        }

        let current = std::fs::read_to_string(directory.join("rentable.log"))
            .expect("failed to read the log");
        let everything: String = written_files(&directory)
            .iter()
            .map(|file| std::fs::read_to_string(file).expect("failed to read a diagnostics file"))
            .collect();

        assert!(
            current.contains(r#""run":"39""#),
            "the newest event is gone"
        );
        assert!(
            !everything.contains(r#""run":"0""#),
            "the oldest event survived a rotation that should have discarded it"
        );

        std::fs::remove_dir_all(&directory).ok();
    }
}
