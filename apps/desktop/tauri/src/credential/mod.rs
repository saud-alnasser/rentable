//! the one way this application reaches a credential store, as a port.
//!
//! Three calls over a service and an account: file a value, read what is filed, leave nothing.
//! A caller names its own service and account, so this module holds no opinion about what is in
//! the store and nothing here has to be widened when a second kind of credential arrives.
//!
//! **Two adapters, and which one runs is decided by whoever builds the store, never by a build
//! flag.** `Os` is the operating system's own store and is what the application manages at
//! launch (`lib.rs`), before anything that reads it. `Memory` is a test's, one per test, keyed the
//! same way, so a test asserts on what was filed rather than on a mocked store's idea of it, and a
//! test run leaves nothing behind on whatever machine it ran on. *It was one process-wide fake
//! swapped in by `cfg(test)` until effort 840, and every test that touched it took turns on one
//! lock.*
//!
//! **It sits at the crate root because no area owns the store.** The Turso consent files the
//! Platform API token under its own service and a session files a member's key under another,
//! and a module under `turso/` or under `organization/` would make one area the other's
//! dependency for no reason beyond where the first caller happened to be written.
//!
//! **Nothing here crosses the IPC boundary** ([[rules/credentials]], *Client boundary*). There
//! is no command in this module, and what it hands back reaches callers in this crate only. A
//! command takes the store as managed state and hands it down; it never hands back what it read.

#[cfg(test)]
mod memory;
mod system;

use std::sync::Arc;

use crate::error::Error;

#[cfg(test)]
pub(crate) use memory::Memory;
pub(crate) use system::Os;

/// A store of credentials, keyed by a service and an account.
///
/// **Nothing filed is `None`; a store that would not answer is still an error.** They are
/// different facts about the machine. The first says this application was never given the
/// credential, which whoever asks can arrange to be given again; the second says the store is
/// locked or absent, which they cannot. A read that flattened the two would report a locked
/// keychain as a credential nobody ever granted, and send the caller to grant it again.
pub(crate) trait CredentialStore: Send + Sync {
    /// File a value, replacing whatever was filed under the same service and account.
    fn set(&self, service: &str, account: &str, value: &str) -> Result<(), Error>;

    /// What is filed under a service and an account, and `None` where nothing is.
    fn get(&self, service: &str, account: &str) -> Result<Option<String>, Error>;

    /// Leave nothing under a service and an account.
    ///
    /// A store holding no entry is already in the state this asks for, so a missing entry is the
    /// outcome rather than a failure: the caller asked for the entry to be gone.
    fn delete(&self, service: &str, account: &str) -> Result<(), Error>;
}

/// The store as the application holds it: managed once at launch, and cloned into whatever
/// outlives a command, such as a Platform API client.
pub(crate) type Credentials = Arc<dyn CredentialStore>;

/// **The value never reaches this message.** A credential in an error string is a credential in
/// whatever reads that string, and an error from here crosses to the web layer. The service is
/// named because it is what makes the failure diagnosable, and a service name is a name rather
/// than a secret.
fn refusal(action: &str, service: &str, detail: &str) -> Error {
    Error::Credential {
        message: format!("failed to {action} the credential under {service}: {detail}"),
    }
}
