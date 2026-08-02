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
