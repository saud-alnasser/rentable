//! the one way this application reaches the operating system's credential store.
//!
//! Three calls over a service and an account: file a value, read what is filed, leave nothing.
//! A caller names its own service and account, so this module holds no opinion about what is in
//! the store and nothing here has to be widened when a second kind of credential arrives.
//!
//! **It sits at the crate root because no area owns the store.** The Turso consent files the
//! Platform API token under its own service, and a module under `sync/` or under
//! `organization/` would make one area the other's dependency for no reason beyond where the
//! first caller happened to be written.
//!
//! **Nothing here crosses the IPC boundary** ([[rules/credentials]], *Client boundary*). There
//! is no command in this module, and what it hands back reaches callers in this crate only.
//!
//! **A test runs over a process-wide fake keyed the same way**, so a test asserts on what was
//! filed rather than on a mocked store's idea of it, and a test run leaves nothing behind on
//! whatever machine it ran on. The fake is one map for every service, which is why a test that
//! touches it takes `take_the_credential_store` first.

#[cfg(test)]
use std::{
    collections::HashMap,
    sync::{
        Mutex, OnceLock,
        atomic::{AtomicBool, Ordering},
    },
};

#[cfg(not(test))]
use keyring::{Entry as KeyringEntry, Error as KeyringError};

use crate::error::Error;

/// File a value, replacing whatever was filed under the same service and account.
#[cfg(not(test))]
pub(crate) fn store(service: &str, account: &str, value: &str) -> Result<(), Error> {
    entry(service, account)?
        .set_password(value)
        .map_err(|error| refused("store", service, error))
}

/// What is filed under a service and an account, and `None` where nothing is.
///
/// **Nothing filed is `None`; a store that would not answer is still an error.** They are
/// different facts about the machine. The first says this application was never given the
/// credential, which whoever asks can arrange to be given again; the second says the store is
/// locked or absent, which they cannot. A read that flattened the two would report a locked
/// keychain as a credential nobody ever granted, and send the caller to grant it again.
#[cfg(not(test))]
pub(crate) fn read(service: &str, account: &str) -> Result<Option<String>, Error> {
    match entry(service, account)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(KeyringError::NoEntry) => Ok(None),
        Err(error) => Err(refused("read", service, error)),
    }
}

/// Leave nothing under a service and an account.
///
/// A store holding no entry is already in the state this asks for, so a missing entry is the
/// outcome rather than a failure: the caller asked for the entry to be gone.
#[cfg(not(test))]
pub(crate) fn forget(service: &str, account: &str) -> Result<(), Error> {
    match entry(service, account)?.delete_credential() {
        Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
        Err(error) => Err(refused("forget", service, error)),
    }
}

#[cfg(not(test))]
fn entry(service: &str, account: &str) -> Result<KeyringEntry, Error> {
    KeyringEntry::new(service, account).map_err(|error| refused("open", service, error))
}

#[cfg(not(test))]
fn refused(action: &str, service: &str, error: KeyringError) -> Error {
    refusal(action, service, &error.to_string())
}

/// **The value never reaches this message.** A credential in an error string is a credential in
/// whatever reads that string, and an error from here crosses to the web layer. The service is
/// named because it is what makes the failure diagnosable, and a service name is a name rather
/// than a secret.
fn refusal(action: &str, service: &str, detail: &str) -> Error {
    Error::Credential {
        message: format!("failed to {action} the credential under {service}: {detail}"),
    }
}

/// the credential store a test has. It stands in for exactly the three calls above, keyed the
/// way the real store is keyed, so what a test files under one service is invisible to a read
/// of another.
#[cfg(test)]
pub(crate) fn store(service: &str, account: &str, value: &str) -> Result<(), Error> {
    if refusal_armed().swap(false, Ordering::SeqCst) {
        return Err(refusal(
            "store",
            service,
            "the test store was told to refuse",
        ));
    }

    fake()
        .lock()
        .map_err(|_| fake_poisoned())?
        .insert(keyed(service, account), value.to_string());

    Ok(())
}

#[cfg(test)]
pub(crate) fn read(service: &str, account: &str) -> Result<Option<String>, Error> {
    Ok(fake()
        .lock()
        .map_err(|_| fake_poisoned())?
        .get(&keyed(service, account))
        .cloned())
}

#[cfg(test)]
pub(crate) fn forget(service: &str, account: &str) -> Result<(), Error> {
    fake()
        .lock()
        .map_err(|_| fake_poisoned())?
        .remove(&keyed(service, account));

    Ok(())
}

/// **Make the fake refuse the next store**, and nothing after it.
///
/// It is the only way the refusal path is reachable from a test at all: a real store refuses
/// when the platform's keychain is locked, absent, or out of room, and nothing a test run can
/// arrange puts a machine in any of those states.
#[cfg(test)]
pub(crate) fn refuse_the_next_store() {
    refusal_armed().store(true, Ordering::SeqCst);
}

#[cfg(test)]
fn keyed(service: &str, account: &str) -> (String, String) {
    (service.to_string(), account.to_string())
}

#[cfg(test)]
fn fake() -> &'static Mutex<HashMap<(String, String), String>> {
    static STORE: OnceLock<Mutex<HashMap<(String, String), String>>> = OnceLock::new();

    STORE.get_or_init(|| Mutex::new(HashMap::new()))
}

#[cfg(test)]
fn refusal_armed() -> &'static AtomicBool {
    static ARMED: AtomicBool = AtomicBool::new(false);

    &ARMED
}

/// the fake is only ever held for a map read or write, so a poisoned lock means a panic
/// elsewhere rather than anything the caller did.
#[cfg(test)]
fn fake_poisoned() -> Error {
    Error::Internal {
        message: "failed to lock the test credential store".to_string(),
    }
}

/// a test's turn on the fake above, which is one static every test in the process shares: a
/// value one test filed is what another's assertion reads, and a test that emptied it leaves a
/// request from a third with nothing to spend, unless they take turns. Held for the whole test,
/// across its awaits, which is why the lock is tokio's.
///
/// **One turn covers every service.** The fake is one map, so a test holding the turn for one
/// credential holds it for every other, and a test that takes the turn and then calls something
/// which takes it again deadlocks. Take it once, at the top of the test.
#[cfg(test)]
pub(crate) type CredentialStoreTurn = tokio::sync::MutexGuard<'static, ()>;

#[cfg(test)]
pub(crate) async fn take_the_credential_store() -> CredentialStoreTurn {
    static TURN: OnceLock<tokio::sync::Mutex<()>> = OnceLock::new();

    TURN.get_or_init(|| tokio::sync::Mutex::new(()))
        .lock()
        .await
}

#[cfg(test)]
mod tests {
    use crate::error::Error;

    use super::{
        CredentialStoreTurn, forget, read, refuse_the_next_store, store, take_the_credential_store,
    };

    const SERVICE: &str = "rentable.test-credential";
    const OTHER_SERVICE: &str = "rentable.test-credential-elsewhere";
    const ACCOUNT: &str = "someone";
    const OTHER_ACCOUNT: &str = "somebody-else";
    const VALUE: &str = "the-value-nobody-else-may-read";

    /// an empty store under every key these tests touch, held for the whole test.
    async fn an_empty_store() -> CredentialStoreTurn {
        let turn = take_the_credential_store().await;

        for (service, account) in [
            (SERVICE, ACCOUNT),
            (SERVICE, OTHER_ACCOUNT),
            (OTHER_SERVICE, ACCOUNT),
        ] {
            forget(service, account).expect("the test store would not empty");
        }

        turn
    }

    #[tokio::test]
    async fn an_entry_nobody_filed_reads_as_nothing() {
        let _turn = an_empty_store().await;

        assert_eq!(
            read(SERVICE, ACCOUNT).expect("the store would not answer"),
            None,
            "an unfiled entry read as something"
        );
    }

    #[tokio::test]
    async fn a_filed_value_reads_back_and_a_forget_leaves_nothing() {
        let _turn = an_empty_store().await;

        store(SERVICE, ACCOUNT, VALUE).expect("the store would not take the value");

        assert_eq!(
            read(SERVICE, ACCOUNT).expect("the store would not answer"),
            Some(VALUE.to_string())
        );

        forget(SERVICE, ACCOUNT).expect("the store would not forget the value");

        assert_eq!(
            read(SERVICE, ACCOUNT).expect("the store would not answer"),
            None,
            "the entry outlived the forget"
        );
    }

    /// the key is the pair, so a second credential filed here is invisible to the first's
    /// reader however close the two names are.
    #[tokio::test]
    async fn the_service_and_the_account_are_both_part_of_the_key() {
        let _turn = an_empty_store().await;

        store(SERVICE, ACCOUNT, "the first").expect("the store would not take the value");
        store(SERVICE, OTHER_ACCOUNT, "the second").expect("the store would not take the value");
        store(OTHER_SERVICE, ACCOUNT, "the third").expect("the store would not take the value");

        assert_eq!(
            read(SERVICE, ACCOUNT).expect("the store would not answer"),
            Some("the first".to_string())
        );
        assert_eq!(
            read(SERVICE, OTHER_ACCOUNT).expect("the store would not answer"),
            Some("the second".to_string())
        );
        assert_eq!(
            read(OTHER_SERVICE, ACCOUNT).expect("the store would not answer"),
            Some("the third".to_string())
        );

        forget(SERVICE, ACCOUNT).expect("the store would not forget the value");

        assert_eq!(
            read(SERVICE, OTHER_ACCOUNT).expect("the store would not answer"),
            Some("the second".to_string()),
            "forgetting one account emptied another"
        );
    }

    /// **a refusal says what failed and never what was being filed**, which is the whole of
    /// what a caller may pass on: every error from here crosses to the web layer.
    #[tokio::test]
    async fn a_refused_store_is_a_credential_error_that_does_not_quote_the_value() {
        let _turn = an_empty_store().await;

        refuse_the_next_store();

        let refusal = store(SERVICE, ACCOUNT, VALUE)
            .expect_err("the store took a value it was told to refuse");

        assert!(
            matches!(refusal, Error::Credential { .. }),
            "a refused store reported something other than a credential failure: {refusal}"
        );
        assert!(
            !refusal.to_string().contains(VALUE),
            "the refusal quoted the value: {refusal}"
        );
        assert_eq!(
            read(SERVICE, ACCOUNT).expect("the store would not answer"),
            None,
            "a refused store filed the value anyway"
        );
    }
}
