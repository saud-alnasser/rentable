//! the Turso consent an earlier build left under the keyring's one entry, moved to the
//! organization it was granted for (effort 851, requirement 14, the plan's *Migration*).
//!
//! **Until effort 851 a machine kept one consent**, under the account `owner`, because it held
//! one organization. Each organization keeps its own now (`turso::consent`, `org:<id>`), and
//! `owner` is the pending slot a consent fills before its organization is known. A machine that
//! updates holds its owner's consent in that slot, and the record it converted at load
//! (`machine::RemoteSyncStore::sanitize`) says which organization the consent was over: the one
//! held organization that carries a Turso organization. This moves it there.
//!
//! **Once a launch, in the launch's first state read**, after the old shape is forgotten and
//! before the resume (`organization::session::state_of`), so nothing has asked for the owner's
//! platform yet when it runs. It is safe to run on every launch: it moves only where the pending
//! slot holds a token and exactly one held organization carries a Turso organization and no
//! consent of its own, and the move itself reads, sets, reads back and only then deletes. *A lazy
//! move inside the owner's platform lost because it leaves one token with two names for as long as
//! nobody happens to ask for it.*

use crate::{
    credential::CredentialStore,
    diagnostics,
    organization::Shared,
    turso::consent::{Account, holds_platform_token, move_pending_consent},
};

/// Move the consent an earlier build filed to the organization it was over, where that is one
/// organization this machine holds and the move has not happened yet.
///
/// **Best effort.** A credential store that does not answer leaves the consent where it was and
/// goes to the diagnostics log, never the token; the launch goes on, the machine reads as holding
/// no authority for the organization until the next launch moves it, and nothing is lost.
pub(crate) async fn move_the_consent(app_state: &Shared, credentials: &dyn CredentialStore) {
    let consented: Vec<String> = {
        let mut remote_sync = app_state.remote_sync.write().await;

        remote_sync
            .store_mut()
            .held_organizations
            .iter()
            .filter(|held| held.turso_organization.is_some())
            .map(|held| held.id.clone())
            .collect()
    };
    let mut without_a_consent = Vec::new();

    for organization_id in consented {
        match holds_platform_token(credentials, &Account::of(&organization_id)) {
            Ok(true) => {}
            Ok(false) => without_a_consent.push(organization_id),
            Err(error) => {
                diagnostics::error("upgrade.consent.notRead")
                    .with("error", error.to_string())
                    .write();

                return;
            }
        }
    }

    // two that lack one is not a record any build wrote, and guessing would hand one
    // organization's authority to the other.
    let [organization_id] = without_a_consent.as_slice() else {
        return;
    };

    match move_pending_consent(credentials, organization_id) {
        Ok(true) => diagnostics::info("upgrade.consent.moved")
            .with("organization", organization_id)
            .write(),
        Ok(false) => {}
        Err(error) => diagnostics::error("upgrade.consent.notMoved")
            .with("organization", organization_id)
            .with("error", error.to_string())
            .write(),
    }
}
