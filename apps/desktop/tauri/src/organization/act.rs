//! acting as the signed-in member: the one way an organization command reaches the session and the
//! replica it acts on (effort 840, requirement 10).
//!
//! **The order is the behaviour, and this is where it is kept.** A command takes the session
//! for writing and then the replica for reading, both held until its act is done; it refuses with
//! the wall where either is missing, before anything is asked of the remote; and where the act
//! writes back a row that carries the session epoch, it pulls first, so the row is the
//! organization's rather than this machine's last sight of it (effort 826, requirement 22). A
//! command that needs another order (a check before its pull, a pull that depends on what it
//! reads) asks for no pull here and runs its own, saying why.
//!
//! **The clock is read where the act reads it**, not here: a moment taken before the pull would be
//! a different moment from the one each command writes today, so `Acting` carries no `now`. **Nor
//! is the machine record's lock taken here**: a command takes `remote_sync` where it takes it
//! today, before the session (the owner's platform), inside the act (an ownership accepted, a
//! workspace upgraded, a credential handed to the engine) or after it (a renamed workspace), and
//! holding it for the whole act would hold every heartbeat behind every organization act.
//!
//! **The owner's platform is here too** ([`owner_platform`]): the Platform API client a command
//! builds where this machine holds the Turso authority, which the commands of five sub-concepts
//! ask for before they act, so it is written once beside the one way they act.

use std::sync::Arc;

use crate::{
    credential::Credentials,
    error::{Error, RefusalReason},
    organization::Shared,
    turso::{
        consent::{Account, holds_platform_token},
        platform::{PlatformApi, PlatformEndpoint},
    },
};

use super::{
    session::{self, MemberSession},
    store::{MigrationLeaseRecord, OrganizationStore},
    upgrade,
};

/// What an act is handed: the signed-in member's session, for writing, and their organization
/// replica, both under the locks [`as_member`] took.
pub struct Acting<'a> {
    pub member: &'a mut MemberSession,
    pub store: &'a OrganizationStore,
}

/// Whether the replica is pulled between the check and the act.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Pull {
    /// the act writes back a row that carries the session epoch, or reads what another machine
    /// may have moved, so it reads after a pull. A pull that could not go is the offline case and
    /// the act goes on over what the replica holds.
    First,
    /// the act reads and writes what the replica holds, or runs its own pull.
    No,
}

/// Run `act` as the signed-in member, or refuse with the wall where nobody is signed in.
///
/// **An act refused because another machine signed this one out on its own puts the wall up**
/// (effort 846, requirement 10): the act's gate (`session::acting_row`) refused it after a pull
/// brought the sign-out, and the machine goes where the heartbeat would have sent it, through the
/// same sign-out, rather than holding a session every act refuses until the heartbeat comes round.
/// Asked again here, under the locks the act held, so only that refusal does it; the wall goes up
/// once they are let go of, since the sign-out takes them itself.
pub async fn as_member<T>(
    app_state: &Shared,
    pull: Pull,
    act: impl AsyncFnOnce(Acting<'_>) -> Result<T, Error>,
) -> Result<T, Error> {
    let acted = if_member(app_state, pull, async move |Acting { member, store }| {
        // **While another member upgrades the organization the act writes nothing either**
        // (effort 857, ticket 19): nothing of this machine's lands between the upgrade's steps,
        // and the refusal names the upgrade as the reason.
        let upgrading =
            match upgrade::under_way_elsewhere(store, Some(&member.member_id), store.clock().now())
                .await
            {
                Ok(upgrading) => upgrading,
                Err(error) => return (Err(error), false),
            };
        // **Below the organization's write floor the act writes nothing** (effort 857, ticket
        // 05): the replica's connection refuses every write for the act's length, and the
        // refusal is answered with the version as the reason. A read goes on, so the acts that
        // only read need nothing of their own.
        let held = match store.hold_writes().await {
            Ok(held) => held,
            Err(error) => return (Err(error), false),
        };

        if !held
            && upgrading.is_some()
            && let Err(error) = store.hold_every_write().await
        {
            return (Err(error), false);
        }

        let acted = act(Acting {
            member: &mut *member,
            store,
        })
        .await;

        if held || upgrading.is_some() {
            store.release_writes().await;
        }

        let acted = acted
            .map_err(|error| refused_by_version(held, error))
            .map_err(|error| refused_by_upgrade(upgrading.as_ref(), error));
        let ended_alone = matches!(
            acted,
            Err(Error::Refused {
                reason: RefusalReason::SessionsEnded,
                ..
            })
        ) && session::ended_alone(store, member).await.unwrap_or(false);

        (acted, ended_alone)
    })
    .await;

    match acted {
        Some((acted, ended_alone)) => {
            if ended_alone {
                session::signed_out_from_elsewhere(app_state, app_state.credentials.as_ref()).await;
            }

            acted
        }
        None => Err(signed_out()),
    }
}

/// Run `act` as the signed-in member, or answer `None` where nobody is signed in, for the callers
/// whose answer to an empty machine is not a refusal: a best-effort renewal, and the recovery the
/// sync dispatcher runs. Nothing is pulled on a machine nobody is signed in to.
pub async fn if_member<T>(
    app_state: &Shared,
    pull: Pull,
    act: impl AsyncFnOnce(Acting<'_>) -> T,
) -> Option<T> {
    let mut member = app_state.member.write().await;
    let store = app_state.organization.read().await;
    let Ok((member, store)) = signed_in(&mut member, &store) else {
        return None;
    };

    if pull == Pull::First {
        store.pull().await;
    }

    Some(act(Acting { member, store }).await)
}

/// The signed-in member and their organization replica, or the wall.
pub(super) fn signed_in<'a>(
    member: &'a mut Option<MemberSession>,
    store: &'a Option<OrganizationStore>,
) -> Result<(&'a mut MemberSession, &'a OrganizationStore), Error> {
    match (member.as_mut(), store.as_ref()) {
        (Some(member), Some(store)) => Ok((member, store)),
        _ => Err(signed_out()),
    }
}

/// The engine's refusal of a write during an act its standing `held` to reading, as the refusal a
/// person is told; any other error as it came.
fn refused_by_version(held: bool, error: Error) -> Error {
    if held && crate::database::floor::refused_a_write(&error) {
        Error::refused(
            RefusalReason::OrganizationReadOnlyByVersion,
            "a newer version of rentable upgraded the organization, and this version can read it \
             but not write to it. update rentable to make changes; nothing was written",
        )
    } else {
        error
    }
}

/// The engine's refusal of a write during an act held while another member's upgrade of the
/// organization runs, as the refusal a person is told; any other error as it came.
fn refused_by_upgrade(upgrading: Option<&MigrationLeaseRecord>, error: Error) -> Error {
    match upgrading {
        Some(lease) if crate::database::floor::refused_a_write(&error) => {
            upgrade::under_way(&lease.holder_member_id, lease.expires_at)
        }
        _ => error,
    }
}

/// The refusal the wall answers with.
fn signed_out() -> Error {
    Error::refused(
        RefusalReason::SignedOut,
        "nobody is signed in to an organization on this machine",
    )
}

/// The Platform API client this machine can build for the organization `organization_id`, where it
/// holds that organization's authority and knows the Turso organization it is over: the owner's
/// machine after a consent, and nobody else's. `None` is not a failure; it is what makes a
/// read-only grant, a create and a delete the owner's, at the command.
///
/// **That organization's consent and slug, and no other's** (effort 851, requirement 14): the
/// token is read from the organization's own keyring entry at every call the client makes, and
/// the slug is the one its own consent was granted over, so an owner of two organizations on two
/// Turso accounts reaches each with its own.
pub(super) async fn owner_platform(
    app_state: &Shared,
    credentials: &Credentials,
    organization_id: &str,
) -> Option<PlatformApi> {
    owner_platform_at(
        app_state,
        credentials,
        organization_id,
        PlatformEndpoint::production(),
    )
    .await
}

/// The same, for the organization the signed-in member acts in, which is what every owner-only
/// command acts on. `None` where nobody is signed in, and the act refuses with the wall.
///
/// **The session is read and let go of before the record is taken**, so this keeps the order every
/// command takes them in: the record before the session, never inside it.
pub(super) async fn signed_in_owner_platform(
    app_state: &Shared,
    credentials: &Credentials,
) -> Option<PlatformApi> {
    let organization_id = app_state
        .member
        .read()
        .await
        .as_ref()?
        .organization_id
        .clone();

    owner_platform(app_state, credentials, &organization_id).await
}

/// [`owner_platform`] against `endpoint`, which a test points at a loopback server.
pub(super) async fn owner_platform_at(
    app_state: &Shared,
    credentials: &Credentials,
    organization_id: &str,
    endpoint: PlatformEndpoint,
) -> Option<PlatformApi> {
    let account = Account::of(organization_id);

    if !holds_platform_token(credentials.as_ref(), &account).unwrap_or(false) {
        return None;
    }

    let mut remote_sync = app_state.remote_sync.write().await;
    let organization = remote_sync
        .store_mut()
        .consent_organization(Some(organization_id))
        .cloned()?;

    Some(PlatformApi::new(
        endpoint,
        organization,
        account,
        Arc::clone(credentials),
    ))
}
