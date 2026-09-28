//! a remote the owner's upgrade pushes to and pulls from, answering as a test tells it (ticket 29
//! moved it here from the foot of `upgrade.rs`).

use std::sync::{Arc, Mutex};

use crate::{
    backup,
    organization::{
        store::OrganizationStore,
        upgrade::{Pushed, Replication},
    },
    turso::platform::InMemoryPlatform,
};

/// A remote that answers every push and every pull as it is told, mints what it is told to on
/// the owner's account, copies on the account it holds, and says which were asked for, in
/// order.
pub(crate) struct Answering {
    pub(crate) push: Pushed,
    pub(crate) pull: bool,
    pub(crate) mint: Option<&'static str>,
    pub(crate) account: Option<Arc<InMemoryPlatform>>,
    pub(crate) asked: Mutex<Vec<&'static str>>,
}

impl Answering {
    /// A remote answering every push with `push` and every pull with `pull`, on a machine
    /// that holds no authority to mint with.
    pub(crate) fn new(push: bool, pull: bool) -> Self {
        Self {
            push: if push { Pushed::Went } else { Pushed::DidNotGo },
            pull,
            mint: None,
            account: None,
            asked: Mutex::new(Vec::new()),
        }
    }

    /// The same remote, on a machine holding `account`, which the copy is made on.
    pub(crate) fn holding(self, account: &Arc<InMemoryPlatform>) -> Self {
        Self {
            account: Some(Arc::clone(account)),
            ..self
        }
    }

    /// The same remote, answering every push as `push`.
    pub(crate) fn pushing(self, push: Pushed) -> Self {
        Self { push, ..self }
    }

    /// The same remote, on a machine whose account mints `token`.
    pub(crate) fn minting(self, token: &'static str) -> Self {
        Self {
            mint: Some(token),
            ..self
        }
    }

    /// Which of push, pull and mint were asked for, in order.
    pub(crate) fn asked(&self) -> Vec<&'static str> {
        self.asked.lock().expect("the record").clone()
    }
}

impl Replication for Answering {
    /// Records the push and answers as told.
    async fn push(&self, _: &OrganizationStore) -> Pushed {
        self.asked.lock().expect("the record").push("push");
        self.push
    }

    /// Records the pull and answers as told.
    async fn pull(&self, _: &OrganizationStore) -> bool {
        self.asked.lock().expect("the record").push("pull");
        self.pull
    }

    /// Records the mint and answers with what it was told to mint.
    async fn minted(&self, _: &str) -> Option<String> {
        self.asked.lock().expect("the record").push("mint");
        self.mint.map(str::to_string)
    }

    /// Records the copy, and makes it as production does on the account it holds.
    async fn copied(&self, database_name: &str, label: &str, at: i64) -> Option<String> {
        self.asked.lock().expect("the record").push("copy");

        backup::remote_copy(self.account.as_ref()?, database_name, label, at)
            .await
            .ok()
    }
}

/// A machine online: every push and pull goes.
pub(crate) fn online() -> Answering {
    Answering::new(true, true)
}
