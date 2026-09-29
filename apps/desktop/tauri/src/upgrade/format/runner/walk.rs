//! the owner's upgrade itself: the push and the pull before it, the copy, one transaction that walks
//! every change due, the check before it commits, and the push after.

use crate::{backup, diagnostics, error::Error, schema};

use crate::organization::{
    authority::VERIFYING_KEY_BYTES,
    role::in_one_transaction,
    session::CredentialSlot,
    setup::{ORGANIZATION_DATABASE_PREFIX, owner_key_from},
    store::{OrganizationStore, waits_for_its_owner},
};

use super::{
    Opened, Pushed, Reach, Replication, changes_unsendable, follow_the_owner, needs_a_connection,
    own_grant, poisoned, settled, shipped, signing_key_of,
};
use crate::upgrade::format::{Sought, Transition, Upgrading};

/// Upgrade an older organization where `opened` is the owner's vault, or follow the owner's
/// upgrade where it is anybody else's: the member's own credential taken from their grant where
/// the machine holds none, the owner's minted on their own account where theirs is lapsed or
/// gone, then, for the owner alone, a push and a pull, every change of format in `transitions`
/// [`walked`] in one transaction, and a push of what it wrote. The grant is read through
/// `reading`, the first change due.
#[allow(clippy::too_many_arguments)]
pub(super) async fn upgrade(
    store: &OrganizationStore,
    remote: &impl Replication,
    transitions: &[Transition],
    reading: &Transition,
    organization_id: &str,
    pinned: &[u8; VERIFYING_KEY_BYTES],
    opened: &Opened,
    credential: &CredentialSlot,
    known_format: Option<i64>,
    now: i64,
) -> Result<(), Error> {
    let organization_key = owner_key_from(&opened.secret)?;
    let signing_key = signing_key_of(&opened.secret)?;
    // the key the organization is on now, followed from the pin along any handover this replica
    // holds, so a pin a format 1 handover left behind is settled before the owner is looked for.
    let key = settled(store, pinned).await?;
    let owner = organization_key.verifying_key() == key;
    let shipped = shipped(transitions);
    let mut reach = Reach::Held;

    // the member's own credential on the organization database, where the machine holds none
    // yet: their grant, judged under the rules of the format that signed it, and unsealed with the
    // secret that opened their vault. The owner's certificate is judged by its key alone.
    if credential
        .lock()
        .map_err(|_| poisoned())?
        .as_deref()
        .is_none()
    {
        let owners_signing_key = owner.then(|| signing_key.verifying_key());
        let sought = Sought {
            store,
            key: &key,
            member_id: &opened.member_id,
        };
        let grant = own_grant(
            reading,
            &sought,
            organization_id,
            &opened.secret,
            owners_signing_key,
        )
        .await?;

        reach = match &grant {
            None => Reach::Missing,
            Some(grant) if grant.lapsed(now) => Reach::Lapsed,
            Some(_) => Reach::Held,
        };

        // the owner's lapsed or missing grant is renewed on their own account before the push
        // spends it, as the connect on the account mints one; a machine without the authority
        // goes on with what the grant held, and the push says whether that reached anything.
        let minted = if owner && reach != Reach::Held {
            remote
                .minted(&format!("{ORGANIZATION_DATABASE_PREFIX}{organization_id}"))
                .await
        } else {
            None
        };

        if minted.is_some() {
            diagnostics::info("organization.upgrade.credentialRenewed")
                .with("organization", organization_id)
                .with("was", reach.as_str())
                .write();

            reach = Reach::Held;
        }

        if let Some(token) = minted.or(grant.map(|grant| grant.token)) {
            *credential.lock().map_err(|_| poisoned())? = Some(token);
        }
    }

    if !owner {
        return follow_the_owner(store, remote, reach, shipped).await;
    }

    // what the old build left captured goes first, since a row captured under the columns the
    // upgrade drops cannot share a push with the drop; then what the others wrote. Either not
    // going is a refusal, and nothing has been written.
    match remote.push(store).await {
        Pushed::Went => {}
        Pushed::Unsendable => return Err(changes_unsendable(organization_id)),
        Pushed::DidNotGo => {
            return Err(needs_a_connection(
                organization_id,
                "what this machine holds could not be sent",
            ));
        }
    }

    if !remote.pull(store).await {
        return Err(needs_a_connection(
            organization_id,
            "what the others wrote could not be brought",
        ));
    }

    // another machine of the owner's got there first, and what arrived is this format, or a
    // newer one, which the caller refuses.
    if !store.is_older_than(shipped).await? {
        return Ok(());
    }

    // what arrived can carry a handover, so the owner is looked for again under what it settles.
    let key = settled(store, pinned).await?;

    if organization_key.verifying_key() != key {
        return Err(waits_for_its_owner());
    }

    let upgrading = Upgrading {
        store,
        key: &key,
        organization_key: &organization_key,
        signing_key: &signing_key,
        opened,
        now,
    };

    walked(
        &upgrading,
        remote,
        transitions,
        organization_id,
        known_format,
    )
    .await?;

    if remote.push(store).await != Pushed::Went {
        diagnostics::warn("organization.upgrade.notYetSent")
            .with("organization", organization_id)
            .write();
    }

    diagnostics::info("organization.upgraded")
        .with("organization", organization_id)
        .write();

    Ok(())
}

/// Walk `transitions` over the organization, from the format it is in to the one after the last of
/// them, in one transaction, and write the `format` row last: what every change of format shares
/// (ticket 26). The upgrade walks the list it was handed, [`TRANSITIONS`](crate::upgrade::format::TRANSITIONS) in production.
///
/// **The format it is in is 1 wherever anything of format 1 is left, and otherwise the `format`
/// row, never below 2** (`OrganizationStore::format_as_it_stands`, which says why, and what no row
/// reads as). An organization already in the last format is walked through nothing, and its row is
/// all that is written.
///
/// **Nothing is written until every change due has said it may run** (ticket 25). An organization
/// this machine has read in a later format than a change starts from, by `known_format`, its own
/// record, has been made to look older, from rows a member can put back; each change's own check
/// refuses the directory as it stands on grounds of its own. Either refusal writes nothing.
///
/// **Then a copy, before the transaction** (ticket 27): the organization as it stands, to a file
/// under the data directory, and where `remote` holds the owner's account, to a protected database
/// there. A local copy that cannot be written refuses the walk with `CopyNotTaken` and nothing is
/// written. An organization walked through nothing is not copied: all that is written is the
/// `format` row, which says what its directory already is.
pub(super) async fn walked(
    upgrading: &Upgrading<'_>,
    remote: &impl Replication,
    transitions: &[Transition],
    organization_id: &str,
    known_format: Option<i64>,
) -> Result<(), Error> {
    let store = upgrading.store;
    let to = shipped(transitions);
    let from = store.format_as_it_stands(to).await?;
    let due: Vec<&Transition> = transitions
        .iter()
        .filter(|transition| transition.from >= from)
        .collect();

    for transition in &due {
        if known_format.is_some_and(|format| transition.from < format) {
            return Err(upgraded_already(
                organization_id,
                transition.name,
                "this machine has read the organization in this format",
            ));
        }

        if let Some(why) = (transition.refused)(upgrading).await? {
            return Err(upgraded_already(organization_id, transition.name, why));
        }
    }

    if !due.is_empty() {
        let database = format!("{ORGANIZATION_DATABASE_PREFIX}{organization_id}");
        let label = format!("format-{from}-to-{to}");

        backup::local_copy(store, store.directory(), &database, &label, upgrading.now).await?;
        if !backup::remote_copy_made(store.directory(), &database, &label)
            && let Some(name) = remote.copied(&database, &label, upgrading.now).await
        {
            backup::remember_remote_copy(store.directory(), &database, &label, &name);
        }
    }

    in_one_transaction(store, async {
        for transition in &due {
            (transition.run)(upgrading).await?;
        }

        store.write_format_version(to).await?;

        checked(store, transitions, to).await
    })
    .await
}

/// Refuse with `ShapeNotAsBuilt` unless the organization, read inside the walk's transaction, is
/// what a fresh organization of format `to` is (ticket 33): built on an empty in-memory database
/// by the last of `transitions`, the list the runner was handed, so a test's own list is checked
/// against its own format. The tables any change of the list leaves alone are left out on both
/// sides. A table a change reshapes in place is compared by its structure, as every table is
/// (`schema/`), so the statement the engine rewrote for it needs no declaring. Built each time
/// rather than kept: it runs once an upgrade.
pub(super) async fn checked(
    store: &OrganizationStore,
    transitions: &[Transition],
    to: i64,
) -> Result<(), Error> {
    let last = transitions.last().ok_or_else(|| Error::Internal {
        message: "a walk with no change of format has no format to be checked against".to_string(),
    })?;
    let fresh_database = turso::Builder::new_local(":memory:").build().await?;
    let fresh_connection = fresh_database.connect()?;

    (last.built)(&fresh_connection).await?;

    let kept: Vec<&str> = transitions
        .iter()
        .flat_map(|transition| transition.kept.iter().copied())
        .collect();
    let fresh = schema::read_engine(&fresh_connection)
        .await?
        .shape
        .without(&kept);
    let found = store.found().await?;
    let found = schema::Found {
        shape: found.shape.without(&kept),
        ..found
    };

    schema::as_built(&format!("the organization at format {to}"), &found, &fresh)
}

/// The refusal of an owner's upgrade of an organization that has been of this format and has
/// been made to look older since (ticket 25): nothing was written to the organization. What it
/// meets is the refusal every way in meets for an older organization, since the row that would
/// say otherwise is the one that was taken away; the log says which change of format, `transition`,
/// was refused, and which fact refused it.
fn upgraded_already(organization_id: &str, transition: &str, why: &str) -> Error {
    diagnostics::warn("organization.upgrade.refusedAgain")
        .with("organization", organization_id)
        .with("transition", transition)
        .with("reason", why)
        .write();

    waits_for_its_owner()
}
