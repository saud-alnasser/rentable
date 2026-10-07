use std::sync::Arc;

use tauri::Manager;
use tauri::plugin::{Builder, TauriPlugin};

use crate::{
    clock,
    credential::CredentialStore,
    error::Error,
    organization::{
        HeldOrganization, Shared,
        session::{AccountCopy, Build, CredentialSlot, Upgrade, Upgrades, Upgrading},
        setup::Remote,
        store::OrganizationStore,
    },
    turso::platform::PlatformApi,
};

use super::{
    consent,
    format::runner::{self, ItsRemote, OnTheAccount},
    shape,
    step::Ladder,
};

/// the two commands that find and read the records 0.12.0 and 0.13.0 kept in `app.db`
/// (`record.rs`), and the upgrade the organization's session runs, managed as
/// `organization::session::Upgrades`: the port through which the session reaches this module
/// without naming it. The organization plugin's setup takes it, so this plugin is registered
/// before that one. What the commands read is the settings, managed in the `settings` plugin's
/// setup, and a command reads them when it is called, which is after that.
///
/// `build.rs` reads the handler below to write the plugin's permissions, so a command added to it
/// is allowed by the ACL with no second list to keep.
pub fn plugin() -> TauriPlugin<tauri::Wry> {
    Builder::new("upgrade")
        .invoke_handler(tauri::generate_handler![
            super::record::upgrade_earlier_find,
            super::record::upgrade_earlier_read,
        ])
        .setup(|app, _api| {
            app.manage::<Upgrades>(Arc::new(Upgrader));

            Ok(())
        })
        .build()
}

/// The upgrade, as the session's port asks for it: each method is the runner's or the old-shape
/// check's own, with the remote it has always been handed.
pub struct Upgrader;

impl Upgrade for Upgrader {
    fn with_password<'a>(
        &'a self,
        store: &'a OrganizationStore,
        account: Option<PlatformApi>,
        held: &'a HeldOrganization,
        username: &'a str,
        password: &'a str,
        credential: &'a CredentialSlot,
        now: i64,
    ) -> Upgrading<'a> {
        Box::pin(async move {
            runner::with_password(
                store,
                &ItsRemote { account },
                held,
                username,
                password,
                credential,
                now,
            )
            .await
        })
    }

    fn with_remembered_key<'a>(
        &'a self,
        credentials: &'a dyn CredentialStore,
        store: &'a OrganizationStore,
        account: Option<PlatformApi>,
        held: &'a HeldOrganization,
        credential: &'a CredentialSlot,
        now: i64,
    ) -> Upgrading<'a> {
        Box::pin(async move {
            runner::with_remembered_key(
                credentials,
                store,
                &ItsRemote { account },
                held,
                credential,
                now,
            )
            .await
        })
    }

    fn on_connect<'a>(
        &'a self,
        store: &'a OrganizationStore,
        remote: Remote,
        account: &'a dyn AccountCopy,
        username: &'a str,
        password: &'a str,
        credential: &'a CredentialSlot,
        now: i64,
        refused: &'a (dyn Fn() -> Error + Send + Sync),
    ) -> Upgrading<'a> {
        Box::pin(async move {
            runner::with_the_owners_password(
                store,
                &OnTheAccount { remote, account },
                username,
                password,
                credential,
                now,
                refused,
            )
            .await
        })
    }

    fn forget_old_shape<'a>(
        &'a self,
        state: &'a Shared,
        credentials: &'a dyn CredentialStore,
        clock: &'a clock::Shared,
    ) -> Upgrading<'a> {
        Box::pin(async move {
            shape::forget_old_shape(state, credentials, clock)
                .await
                .map(|_| ())
        })
    }

    fn move_the_consent<'a>(
        &'a self,
        state: &'a Shared,
        credentials: &'a dyn CredentialStore,
    ) -> Upgrading<'a> {
        Box::pin(async move {
            consent::move_the_consent(state, credentials).await;

            Ok(())
        })
    }

    fn build(&self) -> Build {
        Build {
            rentable: env!("CARGO_PKG_VERSION"),
            workspace_known: Ladder::Workspace.known(),
            format_known: Ladder::Format.known(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::Upgrader;
    use crate::organization::session::{Build, Upgrade};
    use crate::upgrade::step::Ladder;

    /// **The port answers what this build ships** (effort 857, requirement 4): the version in
    /// `Cargo.toml` and the highest step `step.rs` declares on each ladder, which is what every
    /// machine records in the organization's `machine_version`.
    #[test]
    fn the_port_answers_what_this_build_knows() {
        assert_eq!(
            Upgrader.build(),
            Build {
                rentable: env!("CARGO_PKG_VERSION"),
                workspace_known: Ladder::Workspace.known(),
                format_known: Ladder::Format.known(),
            }
        );
    }
}
