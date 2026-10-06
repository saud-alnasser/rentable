//! the Turso consent an earlier build left under the keyring's one entry, moved to the
//! organization it was granted for (effort 851, requirement 14, the plan's *Migration*).
//!
//! **Until effort 851 a machine kept one consent**, under the account `owner`, because it held
//! one organization. Each organization keeps its own now (`turso::consent`, `org:<id>`), and
//! `owner` is the pending slot a consent fills before its organization is known. A machine that
//! updates holds its owner's consent in that slot, and the load that converted the record it
//! wrote (`machine::RemoteSyncStore::sanitize`) names the organization the consent was over:
//! the one organization that build held (`machine::RemoteSyncStore::consent_to_move`). This moves
//! it there.
//!
//! **Once a launch, in the launch's first state read**, after the old shape is forgotten and
//! before the resume (`organization::session::state_of`), so nothing has asked for the owner's
//! platform yet when it runs. It moves only where the conversion named an organization, that
//! organization is still held, carries a Turso organization and has no consent of its own, and
//! the pending slot holds a token; the move itself reads, sets, reads back and only then deletes.
//! *A lazy move inside the owner's platform lost because it leaves one token with two names for
//! as long as nobody happens to ask for it.* *Until a review of effort 851 it moved on every
//! launch where exactly one held organization lacked a consent, which handed a setup's pending
//! consent to whichever organization that was.*

use crate::{
    credential::CredentialStore,
    diagnostics,
    organization::Shared,
    turso::consent::{Account, holds_platform_token, move_pending_consent},
};

/// Move the consent an earlier build filed to the organization it was over, where the load that
/// converted that build's record named one and the move has not happened yet.
///
/// **Best effort.** A credential store that does not answer leaves the consent where it was and
/// goes to the diagnostics log, never the token; the launch goes on, the machine reads as holding
/// no authority for the organization, and the name stays on the record so the next launch tries
/// again. Every other outcome, moved or nothing to move, takes the name off.
pub(crate) async fn move_the_consent(app_state: &Shared, credentials: &dyn CredentialStore) {
    let (organization_id, carries_a_turso_organization) = {
        let mut remote_sync = app_state.remote_sync.write().await;
        let store = remote_sync.store_mut();
        let Some(organization_id) = store.consent_to_move.clone() else {
            return;
        };
        let carries = store
            .held(&organization_id)
            .is_some_and(|held| held.turso_organization.is_some());

        (organization_id, carries)
    };

    let settled = if carries_a_turso_organization {
        move_to(credentials, &organization_id)
    } else {
        // forgotten since the conversion, or never the owner's: nothing to move it to.
        true
    };

    if !settled {
        return;
    }

    let mut remote_sync = app_state.remote_sync.write().await;
    let store = remote_sync.store_mut();

    store.consent_to_move = None;

    if let Err(error) = store.commit() {
        diagnostics::error("upgrade.consent.notSettled")
            .with("error", error.to_string())
            .write();
    }
}

/// The move itself, answering whether it is settled: moved, or nothing to move. A store that did
/// not answer is not settled.
fn move_to(credentials: &dyn CredentialStore, organization_id: &str) -> bool {
    match holds_platform_token(credentials, &Account::of(organization_id)) {
        Ok(true) => return true,
        Ok(false) => {}
        Err(error) => {
            diagnostics::error("upgrade.consent.notRead")
                .with("error", error.to_string())
                .write();

            return false;
        }
    }

    match move_pending_consent(credentials, organization_id) {
        Ok(true) => {
            diagnostics::info("upgrade.consent.moved")
                .with("organization", organization_id)
                .write();

            true
        }
        Ok(false) => true,
        Err(error) => {
            diagnostics::error("upgrade.consent.notMoved")
                .with("organization", organization_id)
                .with("error", error.to_string())
                .write();

            false
        }
    }
}
