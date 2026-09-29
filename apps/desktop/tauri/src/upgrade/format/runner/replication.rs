//! the remote an upgrade reaches: what a push that failed was refused for, and the push and the pull
//! either side of the transaction, on this machine's replica or on the owner's account.

use crate::{
    backup, diagnostics,
    turso::platform::{AccessLevel, PlatformApi, TursoPlatform},
};

use crate::organization::{
    setup::{ORGANIZATION_CREDENTIAL_LIFETIME, Remote},
    store::OrganizationStore,
};

/// What the remote said to a push this measured failure is in: changes captured under a column
/// set a later statement dropped (`OrganizationStore::format_one_reshape`).
const ARGUMENTS_MISMATCH: &str = "Number of arguments mismatch";

/// What a push came to.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Pushed {
    /// the remote took everything this machine held.
    Went,
    /// it did not reach the remote, or the remote did not take it for now: the offline case.
    DidNotGo,
    /// the remote refused changes an earlier build captured under columns it has since dropped,
    /// and will refuse them at every push after (ticket 25).
    Unsendable,
}

/// How the upgrade reaches the organization's remote and the owner's own account: send what this
/// machine holds, bring what the others wrote, and mint the owner a credential where theirs is
/// gone.
///
/// **A seam, because the upgrade's answer depends on the remote's.** Production hands in
/// [`ItsRemote`], the remote the replica was opened against and the owner's Turso account where
/// this machine holds its authority, or [`OnTheAccount`] on the connect, which carries the
/// account the connect was consented on; a test hands in a remote
/// that answers as it is told, since there is no remote here to reach.
pub(crate) trait Replication {
    /// Send what `store` holds to its remote, and say what came of it.
    async fn push(&self, store: &OrganizationStore) -> Pushed;
    /// Bring what the others wrote into `store`; whether a pull completed, whatever it brought.
    async fn pull(&self, store: &OrganizationStore) -> bool;
    /// A credential on `database_name` minted through the owner's own Turso account, the way
    /// `setup::connect_existing` mints one, or `None` where this machine holds no authority or the
    /// account would not mint.
    async fn minted(&self, database_name: &str) -> Option<String>;
    /// A protected copy of `database_name` made on the owner's own Turso account before its format
    /// changes, labelled `label` and stamped `at`, and what it is called; `None` where this machine
    /// holds no authority or the account would not make one, which the upgrade goes on from.
    async fn copied(&self, database_name: &str, label: &str, at: i64) -> Option<String>;
}

/// The remote the replica was opened against, and the Turso account `account` reaches where this
/// machine holds the owner's authority over it.
pub(crate) struct ItsRemote<P = PlatformApi> {
    pub(crate) account: Option<P>,
}

impl<P: TursoPlatform + Sync> Replication for ItsRemote<P> {
    /// The replica's own push.
    async fn push(&self, store: &OrganizationStore) -> Pushed {
        pushed(store).await
    }

    /// The replica's own pull.
    async fn pull(&self, store: &OrganizationStore) -> bool {
        pulled(store).await
    }

    /// A full-access credential for four weeks, as the connect on the account mints one.
    async fn minted(&self, database_name: &str) -> Option<String> {
        let account = self.account.as_ref()?;

        match account
            .mint_token(
                database_name,
                ORGANIZATION_CREDENTIAL_LIFETIME,
                AccessLevel::FullAccess,
            )
            .await
        {
            Ok(token) => Some(token),
            Err(refusal) => {
                diagnostics::info("organization.upgrade.notMinted")
                    .with("reason", refusal.to_string())
                    .write();

                None
            }
        }
    }

    /// A copy seeded from the organization database, as `backup::remote_copy` makes one.
    async fn copied(&self, database_name: &str, label: &str, at: i64) -> Option<String> {
        let account = self.account.as_ref()?;

        backup::remote_copy(account, database_name, label, at)
            .await
            .ok()
    }
}

/// The connect's remote, and the owner's Turso account the connect was consented on: how the
/// upgrade of an older organization reaches both from `setup::connect_existing` (effort 838,
/// tickets 23 and 27). The account is the one the connect minted its credential on, so the copy
/// taken before the upgrade is made there too, as [`ItsRemote`] makes it on a sign-in. *It was in
/// `organization/setup.rs` until effort 840 (ticket 48).*
pub(crate) struct OnTheAccount<'a, P> {
    pub(crate) remote: Remote,
    pub(crate) account: &'a P,
}

impl<P: TursoPlatform> Replication for OnTheAccount<'_, P> {
    async fn push(&self, store: &OrganizationStore) -> Pushed {
        match self.remote {
            Remote::Libsql => pushed(store).await,
            Remote::None => Pushed::DidNotGo,
            #[cfg(test)]
            Remote::Answering => Pushed::Went,
        }
    }

    async fn pull(&self, store: &OrganizationStore) -> bool {
        match self.remote {
            Remote::Libsql => pulled(store).await,
            Remote::None => false,
            #[cfg(test)]
            Remote::Answering => true,
        }
    }

    /// Nothing: the connect has minted the credential it upgrades under already, on this same
    /// account, before the replica was opened.
    async fn minted(&self, _: &str) -> Option<String> {
        None
    }

    /// A copy seeded from the organization database on the account the connect holds, as
    /// `backup::remote_copy` makes one.
    async fn copied(&self, database_name: &str, label: &str, at: i64) -> Option<String> {
        backup::remote_copy(self.account, database_name, label, at)
            .await
            .ok()
    }
}

/// The replica's own push, told apart by what the remote answered: a column set it no longer has
/// is refused for good, and anything else is the offline case. A push that did not go is logged.
pub(crate) async fn pushed(store: &OrganizationStore) -> Pushed {
    match store.pushed().await {
        Ok(()) => Pushed::Went,
        Err(refusal) => {
            let refusal = refusal.to_string();

            diagnostics::info("organization.upgrade.notPushed")
                .with("reason", refusal.as_str())
                .write();

            classified(&refusal)
        }
    }
}

/// What a push the remote refused with `refusal` came to: the measured mismatch is refused for
/// good, and anything else is the offline case.
pub(super) fn classified(refusal: &str) -> Pushed {
    if refusal.contains(ARGUMENTS_MISMATCH) {
        Pushed::Unsendable
    } else {
        Pushed::DidNotGo
    }
}

/// The replica's own pull, where it completed, whatever it brought; a pull that did not is logged
/// and answered as not gone.
pub(crate) async fn pulled(store: &OrganizationStore) -> bool {
    match store.pulled().await {
        Ok(_) => true,
        Err(refusal) => {
            diagnostics::info("organization.upgrade.notPulled")
                .with("reason", refusal.to_string())
                .write();

            false
        }
    }
}
