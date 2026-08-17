use std::{
    fs,
    ops::{Deref, DerefMut},
    path::PathBuf,
};

use serde::{Deserialize, Serialize};

use crate::error::Error;

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
    pub fn load(path: PathBuf) -> Result<Self, Error> {
        match fs::read_to_string(&path) {
            Ok(contents) => {
                let mut data =
                    serde_json::from_str::<T>(&contents).map_err(|e| Error::Integrity {
                        message: e.to_string(),
                    })?;
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

    /// commit/write changes to disk; only if any changes have been made.
    pub fn commit(&mut self) -> Result<(), Error> {
        if !self.dirty {
            return Ok(());
        }

        self.data.sanitize();

        let contents = serde_json::to_string_pretty(&self.data).map_err(|e| Error::Internal {
            message: e.to_string(),
        })?;

        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent)?;
        }

        fs::write(&self.path, contents)?;

        self.dirty = false;

        Ok(())
    }

    pub const fn inner(&self) -> &T {
        &self.data
    }

    fn serialized(data: &T) -> Result<String, Error> {
        serde_json::to_string(data).map_err(|e| Error::Internal {
            message: e.to_string(),
        })
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
    use std::{
        fs,
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };

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

    fn unique_path(name: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time before unix epoch")
            .as_nanos();

        std::env::temp_dir()
            .join("rentable-tests")
            .join(format!("{}-{}.json", name, nanos))
    }

    #[test]
    fn load_sanitizes_existing_data_and_persists_it() {
        let path = unique_path("persisted-load-sanitizes");
        fs::create_dir_all(path.parent().expect("temp file should have parent"))
            .expect("failed to create temp parent");
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
        let path = unique_path("persisted-load-creates-parent");

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
        let path = unique_path("persisted-load-invalid-json");
        fs::create_dir_all(path.parent().expect("temp file should have parent"))
            .expect("failed to create temp parent");
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
}
