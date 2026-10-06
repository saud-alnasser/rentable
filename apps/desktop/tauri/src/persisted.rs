use std::{
    ffi::OsString,
    fs,
    io::Write,
    ops::{Deref, DerefMut},
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};

use crate::{clock::Clock, diagnostics, error::Error};

/// a trait for types that can be persisted to disk.
pub trait Persistable: Serialize + for<'de> Deserialize<'de> + Default + Clone {
    /// called before commit to ensure internal state is valid.
    fn sanitize(&mut self);
}

#[derive(Clone)]
pub struct Persisted<T: Persistable> {
    data: T,
    path: PathBuf,
    dirty: bool,
}

impl<T> Persisted<T>
where
    T: Persistable,
{
    /// load from disk or create default; if the file doesn't exist, it will be created.
    ///
    /// **Strict**: content that does not parse is an `Integrity` error and the file is left as it
    /// is. What the application launches through is [`Self::recover`], which calls this.
    pub fn load(path: PathBuf) -> Result<Self, Error> {
        // read as bytes rather than as a string: a record holding bytes that are not text is
        // damaged content, and `read_to_string` would report it as a failure to read the file.
        match fs::read(&path) {
            Ok(contents) => {
                let mut data = Self::parsed(&contents)?;
                let before = Self::serialized(&data)?;
                data.sanitize();
                let after = Self::serialized(&data)?;

                let mut this = Self {
                    data,
                    path,
                    dirty: before != after,
                };

                if this.dirty {
                    this.commit()?;
                }

                Ok(this)
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                let mut this = Self {
                    data: T::default(),
                    path,
                    dirty: true,
                };

                this.commit()?;

                Ok(this)
            }
            Err(error) => Err(error.into()),
        }
    }

    /// Load the record the application launches with, and recover it where its content cannot be
    /// read (effort 854, requirement 17).
    ///
    /// **Content that does not parse** (an empty file, a write cut short, the zeroes a disk can
    /// leave) is set aside as `<name>.corrupt-<ms>`, the replicas' convention, and never deleted.
    /// The record then comes back from `<name>.bak`, the last good copy [`Self::commit`] keeps,
    /// or from the defaults where there is none, and the log says which.
    ///
    /// **A file the system will not let the application open** (locked by another process, no
    /// permission) is never recovered. Its content may be perfectly good, and defaults written
    /// over `remote-sync.json` would forget every organization this machine holds. The error names
    /// the file and the reason, and the launch shows it and stops (`lib.rs`).
    ///
    /// **A record whose file has gone** comes back from its copy in the same way (ticket 29), and
    /// is written back from it before anything else: started from the defaults, its first commit
    /// would write them over the copy as well, and every organization held would be forgotten.
    ///
    /// A record that loads cleanly with no copy beside it gains one, so an install from before
    /// this build has a last good copy from its first launch of it.
    pub fn recover(path: PathBuf, clock: &dyn Clock) -> Result<Self, Error> {
        if let Some(this) = Self::restored(&path, clock)? {
            return Ok(this);
        }

        match Self::load(path.clone()) {
            Ok(this) => {
                if !backup_of(&this.path).exists() {
                    let contents = fs::read(&this.path).map_err(|e| unopenable(&path, e.into()))?;
                    this.back_up(&contents);
                }

                Ok(this)
            }
            Err(Error::Integrity { message }) => Self::recovered(path, &message, clock),
            Err(error) => Err(unopenable(&path, error)),
        }
    }

    /// The record whose file has gone, back from its copy, or `None` where [`Self::load`] decides:
    /// the file is there (or cannot be looked at), or there is no copy to come back from. A copy
    /// that does not parse is set aside first, since the defaults' commit writes over its name.
    fn restored(path: &Path, clock: &dyn Clock) -> Result<Option<Self>, Error> {
        match fs::metadata(path) {
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            _ => return Ok(None),
        }

        let backup = backup_of(path);
        let contents = match fs::read(&backup) {
            Ok(contents) => contents,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(error) => return Err(unopenable(&backup, error.into())),
        };

        let data = match Self::parsed(&contents) {
            Ok(data) => data,
            Err(error) => {
                let kept = set_aside(&backup, clock.now())?;

                diagnostics::warn("persisted.corrupt.setAside")
                    .with("record", backup.display().to_string())
                    .with("keptAs", kept.display().to_string())
                    .with("damage", error.to_string())
                    .write();

                return Ok(None);
            }
        };

        let mut this = Self {
            data,
            path: path.to_path_buf(),
            dirty: true,
        };

        if let Err(error) = this.commit() {
            return Err(unopenable(&this.path, error));
        }

        diagnostics::warn("persisted.restored")
            .with("record", this.path.display().to_string())
            .write();

        Ok(Some(this))
    }

    /// the record whose content could not be read: set aside, then the copy or the defaults.
    fn recovered(path: PathBuf, damage: &str, clock: &dyn Clock) -> Result<Self, Error> {
        let at = clock.now();
        let kept = set_aside(&path, at)?;

        diagnostics::warn("persisted.corrupt.setAside")
            .with("record", path.display().to_string())
            .with("keptAs", kept.display().to_string())
            .with("damage", damage)
            .write();

        let backup = backup_of(&path);
        let copy = match fs::read(&backup) {
            Ok(contents) => match Self::parsed(&contents) {
                Ok(data) => Some(data),
                Err(_) => {
                    // the copy is damaged as well; it is kept the same way, since the commit
                    // below writes a new one over its name.
                    set_aside(&backup, at)?;
                    None
                }
            },
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
            Err(error) => return Err(unopenable(&backup, error.into())),
        };

        let event = if copy.is_some() {
            "persisted.recovered"
        } else {
            "persisted.reset"
        };

        let mut this = Self {
            data: copy.unwrap_or_default(),
            path,
            dirty: true,
        };

        if let Err(error) = this.commit() {
            return Err(unopenable(&this.path, error));
        }

        diagnostics::warn(event)
            .with("record", this.path.display().to_string())
            .write();

        Ok(this)
    }

    /// where the record is on disk, for a test that puts a machine's other files beside it.
    #[cfg(test)]
    pub(crate) fn path(&self) -> &std::path::Path {
        &self.path
    }

    /// commit/write changes to disk; only if any changes have been made.
    pub fn commit(&mut self) -> Result<(), Error> {
        if !self.dirty {
            return Ok(());
        }

        self.data.sanitize();

        let contents = self.contents()?;

        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent)?;
        }

        written_durably(&self.path, contents.as_bytes())?;

        self.dirty = false;

        // **The copy is written after the record, never before.** A copy of the previous record
        // would undo the last write if it were ever restored, and that write is often a forget
        // (`organization/session/forget.rs`). Written after the record reached the disk, the copy
        // lags it only while the record itself is already durable.
        self.back_up(contents.as_bytes());

        Ok(())
    }

    pub const fn inner(&self) -> &T {
        &self.data
    }

    /// Write the last good copy. **A copy that will not write fails nothing**: the record itself
    /// is on disk, and the commit that wrote it has succeeded. The log says so, and the next
    /// commit tries again.
    fn back_up(&self, contents: &[u8]) {
        let backup = backup_of(&self.path);

        if let Err(error) = written_durably(&backup, contents) {
            diagnostics::warn("persisted.backup.failed")
                .with("backup", backup.display().to_string())
                .with("error", error.to_string())
                .write();
        }
    }

    fn contents(&self) -> Result<String, Error> {
        serde_json::to_string_pretty(&self.data).map_err(|e| Error::Internal {
            message: e.to_string(),
        })
    }

    fn parsed(contents: &[u8]) -> Result<T, Error> {
        serde_json::from_slice::<T>(contents).map_err(|e| Error::Integrity {
            message: e.to_string(),
        })
    }

    fn serialized(data: &T) -> Result<String, Error> {
        serde_json::to_string(data).map_err(|e| Error::Internal {
            message: e.to_string(),
        })
    }
}

/// `<name>.bak` beside the record: the last content a commit wrote.
fn backup_of(path: &Path) -> PathBuf {
    beside(path, ".bak")
}

/// `path` with `suffix` after its whole name, so `remote-sync.json` keeps its `.json`.
fn beside(path: &Path, suffix: &str) -> PathBuf {
    let mut name = OsString::from(path.as_os_str());
    name.push(suffix);
    PathBuf::from(name)
}

/// Rename a file whose content cannot be read to `<name>.corrupt-<at>`, and say where it went.
fn set_aside(path: &Path, at: i64) -> Result<PathBuf, Error> {
    let kept = beside(path, &format!(".corrupt-{at}"));

    fs::rename(path, &kept).map_err(|error| unopenable(path, error.into()))?;

    Ok(kept)
}

/// Write `contents` to `path` so that what is on disk is either the previous content or this,
/// and this has reached the disk before the rename commits it.
///
/// Written beside the file and moved over it: the record is rewritten on every replication that
/// goes through, and a process that dies between the truncate and the flush of an in-place write
/// leaves a record the next launch cannot read. A rename is atomic on every platform this ships
/// to, but it can reach the disk before the bytes it names, so the staging file is synced first.
/// On Unix the directory is synced as well, so the rename itself survives a power cut; Windows
/// cannot open a directory that way, and NTFS journals the rename.
fn written_durably(path: &Path, contents: &[u8]) -> std::io::Result<()> {
    let staging = beside(path, ".tmp");

    let mut file = fs::File::create(&staging)?;
    file.write_all(contents)?;
    file.sync_all()?;
    drop(file);

    fs::rename(&staging, path)?;

    #[cfg(unix)]
    if let Some(parent) = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
    {
        fs::File::open(parent)?.sync_all()?;
    }

    Ok(())
}

/// The error a launch shows when a record cannot be opened or written: the file, and why. Only a
/// failure of the file system is one; anything else is returned as it was.
fn unopenable(path: &Path, error: Error) -> Error {
    let Error::Io { message } = error else {
        return error;
    };

    diagnostics::error("persisted.unopenable")
        .with("record", path.display().to_string())
        .with("error", message.clone())
        .write();

    Error::Io {
        message: format!("{} could not be opened: {message}", path.display()),
    }
}

impl<T> Deref for Persisted<T>
where
    T: Persistable,
{
    type Target = T;

    fn deref(&self) -> &Self::Target {
        &self.data
    }
}

impl<T> DerefMut for Persisted<T>
where
    T: Persistable,
{
    fn deref_mut(&mut self) -> &mut Self::Target {
        self.dirty = true;
        &mut self.data
    }
}

#[cfg(test)]
mod tests {
    use super::{Error, Persistable, Persisted};
    use serde::{Deserialize, Serialize};
    use std::fs;

    use crate::clock::Fixed;
    use crate::test::scratch;

    #[derive(Clone, Default, Serialize, Deserialize)]
    struct TestData {
        value: u8,
    }

    impl Persistable for TestData {
        fn sanitize(&mut self) {
            if self.value == 0 {
                self.value = 7;
            }
        }
    }

    #[test]
    fn load_sanitizes_existing_data_and_persists_it() {
        let path = scratch("persisted-load-sanitizes").join("data.json");
        fs::write(&path, r#"{"value":0}"#).expect("failed to seed test file");

        let persisted =
            Persisted::<TestData>::load(path.clone()).expect("failed to load persisted");

        assert_eq!(persisted.inner().value, 7);
        assert!(
            fs::read_to_string(&path)
                .expect("failed to read sanitized file")
                .contains('7')
        );

        let _ = fs::remove_file(&path);
    }

    #[test]
    fn load_creates_missing_parent_directories_for_new_files() {
        let path = scratch("persisted-load-creates-parent")
            .join("parent")
            .join("data.json");

        let persisted =
            Persisted::<TestData>::load(path.clone()).expect("failed to create persisted");

        assert_eq!(persisted.inner().value, 7);
        assert!(path.exists());

        let _ = fs::remove_file(&path);
        if let Some(root) = path.parent().and_then(|parent| parent.parent()) {
            let _ = fs::remove_dir_all(root);
        }
    }

    #[test]
    fn load_returns_error_for_invalid_json_without_overwriting_file() {
        let path = scratch("persisted-load-invalid-json").join("data.json");
        fs::write(&path, "{invalid json").expect("failed to seed invalid file");

        let error = match Persisted::<TestData>::load(path.clone()) {
            Ok(_) => panic!("expected load to fail"),
            Err(error) => error,
        };

        assert!(matches!(error, Error::Integrity { .. }), "got {error:?}");
        assert_eq!(
            fs::read_to_string(&path).expect("failed to re-read invalid file"),
            "{invalid json"
        );

        let _ = fs::remove_file(&path);
    }

    /// what a record can be found holding after a crash or a disk that lost a write: nothing, a
    /// write cut short, the zeroes some file systems leave behind, and bytes that are not text.
    const DAMAGED: [(&str, &[u8]); 4] = [
        ("empty", b""),
        ("truncated", br#"{"val"#),
        ("zero-filled", &[0; 64]),
        ("not-text", &[0xff; 16]),
    ];

    const AT: i64 = 1_700_000_000_000;

    fn kept_aside(directory: &std::path::Path) -> std::path::PathBuf {
        directory.join(format!("data.json.corrupt-{AT}"))
    }

    #[test]
    fn a_damaged_record_with_no_copy_starts_from_the_defaults_and_is_kept_aside() {
        for (name, bytes) in DAMAGED {
            let directory = scratch(&format!("persisted-recover-default-{name}"));
            let path = directory.join("data.json");
            fs::write(&path, bytes).expect("the damaged record");

            let recovered = Persisted::<TestData>::recover(path.clone(), &Fixed(AT))
                .unwrap_or_else(|error| panic!("{name}: {error:?}"));

            assert_eq!(recovered.inner().value, 7, "{name}: not the defaults");
            assert_eq!(
                fs::read(kept_aside(&directory)).expect("the damaged record was not kept"),
                bytes,
                "{name}: the damaged record was not kept as it was"
            );
            assert_eq!(
                Persisted::<TestData>::load(path).expect("the record").value,
                7,
                "{name}: the defaults were not written"
            );

            let _ = fs::remove_dir_all(directory);
        }
    }

    #[test]
    fn a_damaged_record_comes_back_from_its_last_good_copy() {
        for (name, bytes) in DAMAGED {
            let directory = scratch(&format!("persisted-recover-backup-{name}"));
            let path = directory.join("data.json");
            fs::write(&path, bytes).expect("the damaged record");
            fs::write(directory.join("data.json.bak"), r#"{"value":42}"#).expect("the copy");

            let recovered = Persisted::<TestData>::recover(path.clone(), &Fixed(AT))
                .unwrap_or_else(|error| panic!("{name}: {error:?}"));

            assert_eq!(recovered.inner().value, 42, "{name}: not the copy");
            assert_eq!(
                fs::read(kept_aside(&directory)).expect("the damaged record was not kept"),
                bytes
            );
            assert_eq!(
                Persisted::<TestData>::load(path).expect("the record").value,
                42,
                "{name}: the copy was not written back"
            );

            let _ = fs::remove_dir_all(directory);
        }
    }

    #[test]
    fn a_damaged_record_and_a_damaged_copy_start_from_the_defaults_and_keep_both() {
        let directory = scratch("persisted-recover-both-damaged");
        let path = directory.join("data.json");
        fs::write(&path, b"").expect("the damaged record");
        fs::write(directory.join("data.json.bak"), b"{").expect("the damaged copy");

        let recovered =
            Persisted::<TestData>::recover(path.clone(), &Fixed(AT)).expect("the recovery");

        assert_eq!(recovered.inner().value, 7);
        assert_eq!(
            fs::read(directory.join(format!("data.json.bak.corrupt-{AT}")))
                .expect("the damaged copy was not kept"),
            b"{"
        );

        let _ = fs::remove_dir_all(directory);
    }

    #[test]
    fn a_commit_leaves_the_copy_equal_to_the_record() {
        let directory = scratch("persisted-commit-backup");
        let path = directory.join("data.json");

        let mut persisted = Persisted::<TestData>::load(path.clone()).expect("the record");
        persisted.value = 9;
        persisted.commit().expect("the commit");

        assert_eq!(
            fs::read(directory.join("data.json.bak")).expect("no copy was written"),
            fs::read(&path).expect("the record")
        );

        let _ = fs::remove_dir_all(directory);
    }

    /// **A record whose file has gone comes back from its copy**, and is written back before a
    /// commit can put the defaults over the copy (effort 854, ticket 29).
    #[test]
    fn a_missing_record_comes_back_from_its_last_good_copy() {
        let directory = scratch("persisted-recover-missing-backup");
        let path = directory.join("data.json");
        fs::write(directory.join("data.json.bak"), r#"{"value":42}"#).expect("the copy");

        let recovered =
            Persisted::<TestData>::recover(path.clone(), &Fixed(AT)).expect("the recovery");

        assert_eq!(recovered.inner().value, 42, "not the copy");
        assert_eq!(
            Persisted::<TestData>::load(path.clone())
                .expect("the record")
                .value,
            42,
            "the copy was not written back"
        );
        assert_eq!(
            fs::read(directory.join("data.json.bak")).expect("the copy is gone"),
            fs::read(&path).expect("the record")
        );

        let _ = fs::remove_dir_all(directory);
    }

    #[test]
    fn a_missing_record_with_no_copy_starts_from_the_defaults() {
        let directory = scratch("persisted-recover-missing-default");
        let path = directory.join("data.json");

        let recovered =
            Persisted::<TestData>::recover(path.clone(), &Fixed(AT)).expect("the recovery");

        assert_eq!(recovered.inner().value, 7);
        assert_eq!(
            Persisted::<TestData>::load(path).expect("the record").value,
            7
        );

        let _ = fs::remove_dir_all(directory);
    }

    /// a copy that cannot be read is kept aside the same way, rather than written over.
    #[test]
    fn a_missing_record_with_a_damaged_copy_starts_from_the_defaults_and_keeps_the_copy() {
        let directory = scratch("persisted-recover-missing-damaged-copy");
        let path = directory.join("data.json");
        fs::write(directory.join("data.json.bak"), b"{").expect("the damaged copy");

        let recovered =
            Persisted::<TestData>::recover(path.clone(), &Fixed(AT)).expect("the recovery");

        assert_eq!(recovered.inner().value, 7);
        assert_eq!(
            fs::read(directory.join(format!("data.json.bak.corrupt-{AT}")))
                .expect("the damaged copy was not kept"),
            b"{"
        );

        let _ = fs::remove_dir_all(directory);
    }

    /// a record written before this build kept a copy gains one on its first recovery.
    #[test]
    fn a_good_record_with_no_copy_gains_one() {
        let directory = scratch("persisted-recover-gains-backup");
        let path = directory.join("data.json");
        fs::write(&path, r#"{"value":5}"#).expect("the record");

        let recovered =
            Persisted::<TestData>::recover(path.clone(), &Fixed(AT)).expect("the recovery");

        assert_eq!(recovered.inner().value, 5);
        assert_eq!(
            fs::read(directory.join("data.json.bak")).expect("no copy was written"),
            fs::read(&path).expect("the record")
        );

        let _ = fs::remove_dir_all(directory);
    }

    /// **A record the system will not let the app open is never overwritten**: it could be
    /// holding every organization this machine has, and defaults written over it would forget
    /// them all. The error names the file, which is what the message at launch shows.
    #[test]
    fn a_locked_record_is_left_untouched_and_named() {
        let directory = scratch("persisted-recover-locked");
        let path = directory.join("data.json");
        fs::write(&path, r#"{"value":5}"#).expect("the record");

        let lock = locked(&path);
        let error = match Persisted::<TestData>::recover(path.clone(), &Fixed(AT)) {
            Ok(_) => panic!("a locked record was read"),
            Err(error) => error,
        };
        drop(lock);
        unlock(&path);

        assert!(matches!(error, Error::Io { .. }), "got {error:?}");
        assert!(
            error.to_string().contains(&path.display().to_string()),
            "the error does not name the file: {error}"
        );
        assert_eq!(fs::read(&path).expect("the record"), br#"{"value":5}"#);
        assert_eq!(
            fs::read_dir(&directory).expect("the directory").count(),
            1,
            "something was written beside a record that could not be opened"
        );

        let _ = fs::remove_dir_all(directory);
    }

    /// another process holding the file with no sharing, as Windows reports a locked file.
    #[cfg(windows)]
    fn locked(path: &std::path::Path) -> Option<fs::File> {
        use std::os::windows::fs::OpenOptionsExt;

        Some(
            fs::OpenOptions::new()
                .read(true)
                .share_mode(0)
                .open(path)
                .expect("the lock"),
        )
    }

    #[cfg(windows)]
    fn unlock(_path: &std::path::Path) {}

    /// no permission to read it, which is what a locked file comes to on Unix.
    #[cfg(unix)]
    fn locked(path: &std::path::Path) -> Option<fs::File> {
        use std::os::unix::fs::PermissionsExt;

        fs::set_permissions(path, fs::Permissions::from_mode(0o000)).expect("the lock");
        None
    }

    #[cfg(unix)]
    fn unlock(path: &std::path::Path) {
        use std::os::unix::fs::PermissionsExt;

        fs::set_permissions(path, fs::Permissions::from_mode(0o644)).expect("the unlock");
    }
}
