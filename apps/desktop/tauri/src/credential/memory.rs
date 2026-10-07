//! the credential store a test has: one per test, keyed the way the real store is keyed, so what
//! a test files under one service is invisible to a read of another, and what one test files is
//! invisible to every other test in the process.

use std::{
    collections::HashMap,
    sync::{
        Mutex,
        atomic::{AtomicBool, Ordering},
    },
};

use crate::error::Error;

use super::{CredentialStore, refusal};

/// What is filed, by service and account.
type Entries = HashMap<(String, String), String>;

/// A store held in memory, empty when it is made.
#[derive(Default)]
pub(crate) struct Memory {
    entries: Mutex<Entries>,
    refusal_armed: AtomicBool,
    read_refusal_armed: AtomicBool,
}

impl Memory {
    pub(crate) fn new() -> Self {
        Self::default()
    }

    /// **Make this store refuse the next store**, and nothing after it.
    ///
    /// It is the only way the refusal path is reachable from a test at all: a real store refuses
    /// when the platform's keychain is locked, absent, or out of room, and nothing a test run can
    /// arrange puts a machine in any of those states.
    pub(crate) fn refuse_the_next_store(&self) {
        self.refusal_armed.store(true, Ordering::SeqCst);
    }

    /// **Make this store refuse the next read**, and nothing after it.
    ///
    /// A store that will not answer is a different fact from a store holding nothing, and this
    /// is how a test reaches the first: a real store refuses a read when the keychain is locked
    /// or access to it is denied, which a test run cannot arrange either.
    pub(crate) fn refuse_the_next_read(&self) {
        self.read_refusal_armed.store(true, Ordering::SeqCst);
    }

    fn entries(&self) -> Result<std::sync::MutexGuard<'_, Entries>, Error> {
        self.entries.lock().map_err(|_| poisoned())
    }
}

impl CredentialStore for Memory {
    fn set(&self, service: &str, account: &str, value: &str) -> Result<(), Error> {
        if self.refusal_armed.swap(false, Ordering::SeqCst) {
            return Err(refusal(
                "store",
                service,
                "the test store was told to refuse",
            ));
        }

        self.entries()?
            .insert(keyed(service, account), value.to_string());

        Ok(())
    }

    fn get(&self, service: &str, account: &str) -> Result<Option<String>, Error> {
        if self.read_refusal_armed.swap(false, Ordering::SeqCst) {
            return Err(refusal(
                "read",
                service,
                "the test store was told to refuse",
            ));
        }

        Ok(self.entries()?.get(&keyed(service, account)).cloned())
    }

    fn delete(&self, service: &str, account: &str) -> Result<(), Error> {
        self.entries()?.remove(&keyed(service, account));

        Ok(())
    }
}

fn keyed(service: &str, account: &str) -> (String, String) {
    (service.to_string(), account.to_string())
}

/// the map is only ever held for a read or a write, so a poisoned lock means a panic elsewhere
/// rather than anything the caller did.
fn poisoned() -> Error {
    Error::Internal {
        message: "failed to lock the test credential store".to_string(),
    }
}

mod tests {
    use crate::{credential::CredentialStore, error::Error};

    use super::Memory;

    const SERVICE: &str = "rentable.test-credential";
    const OTHER_SERVICE: &str = "rentable.test-credential-elsewhere";
    const ACCOUNT: &str = "someone";
    const OTHER_ACCOUNT: &str = "somebody-else";
    const VALUE: &str = "the-value-nobody-else-may-read";

    #[test]
    fn an_entry_nobody_filed_reads_as_nothing() {
        let store = Memory::new();

        assert_eq!(
            store
                .get(SERVICE, ACCOUNT)
                .expect("the store would not answer"),
            None,
            "an unfiled entry read as something"
        );
    }

    #[test]
    fn a_filed_value_reads_back_and_a_forget_leaves_nothing() {
        let store = Memory::new();

        store
            .set(SERVICE, ACCOUNT, VALUE)
            .expect("the store would not take the value");

        assert_eq!(
            store
                .get(SERVICE, ACCOUNT)
                .expect("the store would not answer"),
            Some(VALUE.to_string())
        );

        store
            .delete(SERVICE, ACCOUNT)
            .expect("the store would not forget the value");

        assert_eq!(
            store
                .get(SERVICE, ACCOUNT)
                .expect("the store would not answer"),
            None,
            "the entry outlived the forget"
        );
    }

    /// the key is the pair, so a second credential filed here is invisible to the first's
    /// reader however close the two names are.
    #[test]
    fn the_service_and_the_account_are_both_part_of_the_key() {
        let store = Memory::new();

        store
            .set(SERVICE, ACCOUNT, "the first")
            .expect("the store would not take the value");
        store
            .set(SERVICE, OTHER_ACCOUNT, "the second")
            .expect("the store would not take the value");
        store
            .set(OTHER_SERVICE, ACCOUNT, "the third")
            .expect("the store would not take the value");

        assert_eq!(
            store
                .get(SERVICE, ACCOUNT)
                .expect("the store would not answer"),
            Some("the first".to_string())
        );
        assert_eq!(
            store
                .get(SERVICE, OTHER_ACCOUNT)
                .expect("the store would not answer"),
            Some("the second".to_string())
        );
        assert_eq!(
            store
                .get(OTHER_SERVICE, ACCOUNT)
                .expect("the store would not answer"),
            Some("the third".to_string())
        );

        store
            .delete(SERVICE, ACCOUNT)
            .expect("the store would not forget the value");

        assert_eq!(
            store
                .get(SERVICE, OTHER_ACCOUNT)
                .expect("the store would not answer"),
            Some("the second".to_string()),
            "forgetting one account emptied another"
        );
    }

    /// **a refusal says what failed and never what was being filed**, which is the whole of
    /// what a caller may pass on: every error from here crosses to the web layer.
    #[test]
    fn a_refused_store_is_a_credential_error_that_does_not_quote_the_value() {
        let store = Memory::new();

        store.refuse_the_next_store();

        let refusal = store
            .set(SERVICE, ACCOUNT, VALUE)
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
            store
                .get(SERVICE, ACCOUNT)
                .expect("the store would not answer"),
            None,
            "a refused store filed the value anyway"
        );
    }
}
