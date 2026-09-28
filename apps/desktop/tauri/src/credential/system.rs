//! the operating system's credential store: the Windows Credential Manager, the macOS keychain,
//! or the Secret Service on Linux, whichever `keyring` reaches on the platform it was built for.
//!
//! **The service and the account are handed to the platform exactly as the caller named them**,
//! so an entry filed by an earlier build is the entry this one reads. A service name is data on
//! installed machines.

use keyring::{Entry as KeyringEntry, Error as KeyringError};

use crate::error::Error;

use super::{CredentialStore, refusal};

/// The operating system's store. Holds nothing of its own: every call opens the entry it names.
pub(crate) struct Os;

impl CredentialStore for Os {
    fn set(&self, service: &str, account: &str, value: &str) -> Result<(), Error> {
        entry(service, account)?
            .set_password(value)
            .map_err(|error| refusal("store", service, &error.to_string()))
    }

    fn get(&self, service: &str, account: &str) -> Result<Option<String>, Error> {
        match entry(service, account)?.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(KeyringError::NoEntry) => Ok(None),
            Err(error) => Err(refusal("read", service, &error.to_string())),
        }
    }

    fn delete(&self, service: &str, account: &str) -> Result<(), Error> {
        match entry(service, account)?.delete_credential() {
            Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
            Err(error) => Err(refusal("forget", service, &error.to_string())),
        }
    }
}

fn entry(service: &str, account: &str) -> Result<KeyringEntry, Error> {
    KeyringEntry::new(service, account)
        .map_err(|error| refusal("open", service, &error.to_string()))
}
