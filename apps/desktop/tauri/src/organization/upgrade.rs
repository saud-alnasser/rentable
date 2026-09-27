//! an organization an earlier version made, upgraded in place by its owner's machine (effort 838,
//! requirement 11 as the human amended it on 2026-09-26, tickets 22 and 23).
//!
//! **Only the owner, because every row of this format is signed from the root**, and the root is
//! the organization key, which the owner's vault secret derives (`setup::owner_key_from`) and no
//! other vault does. A vault is the owner's exactly when that key is the key the machine pinned,
//! followed along any handover format 1 signed ([`settled`]), the test `role::repair_owner_row`
//! makes. **Nothing else about the owner is read off a row**: not the role word, not
//! `must_change_password`, not an unsigned `revoked_at` on their certificate. Anybody else who meets
//! an organization of an earlier format, at a sign-in, a resume, a connect, a join or a machine
//! link, is refused with `OrganizationOlder` and the sentence that it waits for its owner, and
//! nothing is written (`store::waits_for_its_owner`).
//!
//! **Where it runs: before the format is refused**, at a sign-in with a password
//! ([`with_password`]), a launch resume with the remembered key ([`with_remembered_key`]) and
//! `setup::connect_existing` ([`with_the_owners_password`]). Each finds the vault first, reading
//! the member rows as they lie, because a password cannot be tried against a vault that has not
//! been read; what it takes from them is the vault and nothing else. The rows, and the member's
//! own grant after them, are read through the first change of format due ([`reading`], ticket
//! 29), so nothing here reads a format of its own.
//!
//! **Every machine pulls before it answers** (ticket 23). A member's machine unseals its own grant
//! on the organization database, judged under the rules the row was signed in, and pulls with it:
//! where what arrives is this format, the owner has upgraded and the ordinary sign-in follows;
//! where it is still older, or the pull did not go, the member waits for the owner.
//!
//! **The owner's machine upgrades only against the organization's latest state** (ticket 23): what
//! the old build left captured is pushed first, since a row captured under the columns the upgrade
//! drops cannot share a push with the drop, then what the others wrote is pulled. Where either
//! does not go, nothing is written and the owner is refused with `OrganizationUpgradeOffline`,
//! asking for a connection: an upgrade made offline would be pushed after a remote that had moved
//! on, and a second owner machine could make one of its own. Where the pull brings this format,
//! another machine of the owner's got there first and nothing is written.
//!
//! **Each way the upgrade can stand still names its way out** (ticket 25). An owner whose grant on
//! the organization database has lapsed, or is gone, has one minted on their own Turso account
//! before the push, the way `setup::connect_existing` mints one. Changes the old build captured
//! that an already reshaped remote refuses for good are `OrganizationChangesUnsendable`, which
//! says that disconnecting this machine and connecting it again drops them. A member's machine
//! whose pull was refused over a lapsed or missing credential is `OrganizationCredentialLapsed`,
//! which says it needs a new link, rather than waiting for an owner it cannot hear from.
//!
//! **An organization once of this format is never transformed again** (ticket 25). The `format`
//! row is unsigned and every member holds the database's credential, so an upgraded organization
//! can be made to look older: its row deleted, format 1's certificate table and member columns
//! put back, and a promotion a member once held under format 1 replayed onto their row. Two
//! things stop the owner's machine re-reading that as format 1, and neither lives where a member
//! can write: the machine's own record of having read the organization in this format
//! (`HeldOrganization::format`), which refuses every change starting below it, and, on a machine
//! with no such record, the change's own check of the directory as it stands, which for format 1
//! is a root certificate the organization key signed. Either refuses the transform, and nothing is
//! written. What is still finished is the last step alone, the `format` row, where nothing of
//! format 1 is left: that writes back what the directory already is.
//!
//! **Each change of format is a file of its own** (ticket 26), listed in order in
//! `transition::TRANSITIONS`, and what each one does to the directory is said there. This file is
//! what they share: the vault, the owner, the grant and the mint, following the owner, the push and
//! the pull, the refusal of an organization this machine has read in a later format, then one
//! transaction that walks the list from the format the organization is in to the one this build
//! ships ([`walked`]), with the `format` row last, then the push. It is handed the list end to end
//! and counts the format it ships from it, so a test walks a list of its own through the same
//! sign-in; production hands it `transition::TRANSITIONS`.
//!
//! **A copy is taken before the transaction** (ticket 27). Once every change due has said it may
//! run, and before the first write, the organization as it stands after the pull is copied to a
//! file of its own under the data directory, labelled `format-<from>-to-<to>` (`backup.rs`), and
//! where this machine holds the owner's Turso account, to a protected database there as well
//! ([`Replication::copied`]). A local copy that cannot be taken refuses the upgrade with
//! `CopyNotTaken`, and nothing is written; a copy the account refuses is logged, and the upgrade
//! goes on. The runner takes it, so every change of format listed after this one is copied too.
//!
//! **And the organization is checked before the transaction commits** (ticket 33, requirement
//! 15): after the last change and the `format` row, SQLite's structural check passes and the
//! schema is the one a fresh organization of the format it arrives at is built with, less the
//! tables a change leaves alone, compared by structure so a table reshaped in place compares by
//! its columns and not by the statement the engine rewrote for it ([`checked`], `schema.rs`). A
//! check that fails rolls the whole walk back and refuses with `ShapeNotAsBuilt`.

use crate::{
    backup, diagnostics,
    error::{Error, RefusalReason},
    schema,
    sync::turso::platform::{AccessLevel, PlatformApi, TursoPlatform},
};

use super::{
    HeldOrganization,
    authority::{AdministratorKey, VERIFYING_KEY_BYTES, verify_succession},
    role::{authority_of, in_one_transaction},
    session::{
        CredentialSlot, content_key_of, opened, refused_by_name, remembered, verifying_key_of,
    },
    setup::{
        ADMINISTRATOR_KEY_PURPOSE, ORGANIZATION_CREDENTIAL_LIFETIME, ORGANIZATION_DATABASE_PREFIX,
        owner_key_from,
    },
    store::{OrganizationStore, waits_for_its_owner},
    transition::{Sought, TRANSITIONS, Transition, Upgrading},
    vault::{MemberSecretKey, open_sealed_secret_key, open_vault, unseal_with_secret_key},
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
/// this machine holds its authority, or `setup::OnTheAccount` on the connect, which carries the
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
fn classified(refusal: &str) -> Pushed {
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

/// A vault a password or a remembered key opened, and the member row it sits on.
pub(crate) struct Opened {
    pub(crate) member_id: String,
    pub(crate) secret: MemberSecretKey,
}

/// Upgrade the organization `held` names where it is of an earlier format and `password` opens
/// its owner's vault under `username`, or follow the owner's upgrade where it opens anybody
/// else's: the sign-in at the wall.
///
/// Nothing happens to an organization of this format or a newer one, and the caller's refusal of
/// the format follows either way. A username and password that open no vault are the wall's one
/// sentence, as a sign-in on this format says it. Where `held` says this machine has read the
/// organization in this format, nothing is transformed ([`upgrade`]).
pub(crate) async fn with_password(
    store: &OrganizationStore,
    remote: &impl Replication,
    held: &HeldOrganization,
    username: &str,
    password: &str,
    credential: &CredentialSlot,
    now: i64,
) -> Result<(), Error> {
    with_password_over(
        TRANSITIONS,
        store,
        remote,
        held,
        username,
        password,
        credential,
        now,
    )
    .await
}

/// [`with_password`] over `transitions`, the changes of format this runner walks and counts the
/// format it ships from: [`TRANSITIONS`] in production, and a list of a test's own under test.
#[allow(clippy::too_many_arguments)]
pub(crate) async fn with_password_over(
    transitions: &[Transition],
    store: &OrganizationStore,
    remote: &impl Replication,
    held: &HeldOrganization,
    username: &str,
    password: &str,
    credential: &CredentialSlot,
    now: i64,
) -> Result<(), Error> {
    if !store.is_older_than(shipped(transitions)).await? {
        return Ok(());
    }

    let reading = reading(store, transitions).await?;
    let pinned = verifying_key_of(held)?;
    let opened = vault_opened_by(
        store,
        reading,
        &settled(store, &pinned).await?,
        username,
        password,
    )
    .await?
    .ok_or_else(|| refused_by_name(&held.name))?;

    upgrade(
        store,
        remote,
        transitions,
        reading,
        &held.id,
        &pinned,
        &opened,
        credential,
        held.format,
        now,
    )
    .await
}

/// Upgrade the organization `held` names where it is of an earlier format and the key this machine
/// filed for the member it names opens the owner's vault, or follow the owner's upgrade where it
/// opens anybody else's: the launch resume, with no password.
///
/// Nothing happens to an organization of this format or a newer one. Otherwise, where the key
/// cannot be used, nothing is written and the resume is refused: with [`remembered`]'s refusal
/// where no key is filed or what is filed is not an entry this build wrote, with `SignInAgain`
/// where the key was filed before the member's sessions were ended from another machine, and as
/// waiting for its owner where the machine's record names no member, the member has no row, or
/// the key opens no vault. The resume then leaves the person at the wall, where their password
/// does what the key could not.
pub(crate) async fn with_remembered_key(
    store: &OrganizationStore,
    remote: &impl Replication,
    held: &HeldOrganization,
    credential: &CredentialSlot,
    now: i64,
) -> Result<(), Error> {
    if !store.is_older_than(shipped(TRANSITIONS)).await? {
        return Ok(());
    }

    let member_id = held.member_id.as_deref().ok_or_else(waits_for_its_owner)?;
    let (filed_epoch, member_key) = remembered(&held.id, member_id)?;
    let reading = reading(store, TRANSITIONS).await?;
    let member = (reading.members)(store)
        .await?
        .into_iter()
        .find(|member| member.id == member_id)
        .ok_or_else(waits_for_its_owner)?;

    if filed_epoch < member.session_epoch {
        return Err(Error::refused(
            RefusalReason::SignInAgain,
            "the sessions this key opened were ended from another machine",
        ));
    }

    let secret =
        open_sealed_secret_key(&member_key, &member.vault).map_err(|_| waits_for_its_owner())?;
    let pinned = verifying_key_of(held)?;
    let opened = Opened {
        member_id: member.id,
        secret,
    };

    upgrade(
        store,
        remote,
        TRANSITIONS,
        reading,
        &held.id,
        &pinned,
        &opened,
        credential,
        held.format,
        now,
    )
    .await
}

/// Upgrade the organization a machine connecting on the owner's Turso account has just pulled,
/// where it is of an earlier format: `setup::connect_existing`, before the format is refused.
///
/// There is no pinned key yet on this path, so the key the password derives is judged against the
/// organization row's, which is the comparison that path makes of every owner
/// (`setup::the_owners_key`); the rows are then judged under it. `credential` already holds what
/// the consent minted. `refused` is the sentence that path gives a pair that opens nothing. A
/// machine connecting has read nothing of the organization before, so what stops it transforming
/// one of this format made to look older is the root certificate that format holds ([`upgrade`]).
pub(crate) async fn with_the_owners_password(
    store: &OrganizationStore,
    remote: &impl Replication,
    username: &str,
    password: &str,
    credential: &CredentialSlot,
    now: i64,
    refused: impl Fn() -> Error,
) -> Result<(), Error> {
    if !store.is_older_than(shipped(TRANSITIONS)).await? {
        return Ok(());
    }

    let organization = store
        .organization()
        .await?
        .ok_or_else(|| Error::Integrity {
            message: "the database this turso account holds carries no organization of ours"
                .to_string(),
        })?;
    let key = settled(store, &organization.verifying_key).await?;
    let reading = reading(store, TRANSITIONS).await?;
    let opened = vault_opened_by(store, reading, &key, username, password)
        .await?
        .ok_or_else(refused)?;

    upgrade(
        store,
        remote,
        TRANSITIONS,
        reading,
        &organization.id,
        &organization.verifying_key,
        &opened,
        credential,
        None,
        now,
    )
    .await
}

/// The vault `password` opens under `username`, among the member rows of an older organization as
/// they lie, read through `reading`, the first change of format due ([`reading`]).
///
/// **Every row is tried**, a removed one and one still waiting on its invitation link included:
/// which vault is the owner's is decided by the key it derives, never by a column beside it, so a
/// `must_change_password` somebody wrote onto the owner's row hides nothing. What anybody else's
/// vault opens is a member's wait for the owner, and past the upgrade the ordinary sign-in refuses
/// what it refuses.
///
/// **Where more than one row's vault opens, the owner's row is the one they signed as their own**
/// (ticket 25), as the change's own reader judges it (`Transition::signed_as_its_own`); for format
/// 1, its signature verifies under the format 1 certificate `key` issued to that row's member,
/// naming the key the vault derives. A member holding the credential can copy the owner's vault
/// onto a row of their own, signature and all, since `member.v2` never signed a member's id; what
/// they cannot copy is a certificate issued to that row. Where none of them is, the first is
/// taken, as before, and the copies are logged.
async fn vault_opened_by(
    store: &OrganizationStore,
    reading: &Transition,
    key: &[u8; VERIFYING_KEY_BYTES],
    username: &str,
    password: &str,
) -> Result<Option<Opened>, Error> {
    let wanted = username.trim().to_lowercase();
    let mut opening = Vec::new();

    for member in (reading.members)(store).await? {
        let Ok(secret) = open_vault(password, &member.vault) else {
            continue;
        };
        let content_key = content_key_of(&member.sealed_content_key, &secret)?;
        let carried = opened(
            &content_key,
            "member.username_sealed",
            &member.username_sealed,
        )?;

        if carried.trim().to_lowercase() == wanted {
            opening.push((member, secret));
        }
    }

    if opening.len() > 1 {
        for place in 0..opening.len() {
            let (member, secret) = &opening[place];
            let sought = Sought {
                store,
                key,
                member_id: &member.id,
            };

            if (reading.signed_as_its_own)(&sought, secret).await? {
                let (member, secret) = opening.swap_remove(place);

                return Ok(Some(Opened {
                    member_id: member.id,
                    secret,
                }));
            }
        }

        diagnostics::warn("organization.upgrade.vaultOnSeveralRows")
            .with("rows", opening.len().to_string())
            .write();
    }

    Ok(opening.into_iter().next().map(|(member, secret)| Opened {
        member_id: member.id,
        secret,
    }))
}

/// Upgrade an older organization where `opened` is the owner's vault, or follow the owner's
/// upgrade where it is anybody else's: the member's own credential taken from their grant where
/// the machine holds none, the owner's minted on their own account where theirs is lapsed or
/// gone, then, for the owner alone, a push and a pull, every change of format in `transitions`
/// [`walked`] in one transaction, and a push of what it wrote. The grant is read through
/// `reading`, the first change due.
#[allow(clippy::too_many_arguments)]
async fn upgrade(
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
/// (ticket 26). The upgrade walks the list it was handed, [`TRANSITIONS`] in production.
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
async fn walked(
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
/// (`schema.rs`), so the statement the engine rewrote for it needs no declaring. Built each time
/// rather than kept: it runs once an upgrade.
async fn checked(
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

/// What the machine's own credential on the organization database comes to, before the pull
/// that spends it.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Reach {
    /// one the machine held already, or one a grant held that has not lapsed.
    Held,
    /// the grant's credential died at the expiry it records.
    Lapsed,
    /// no grant on the organization database verifies for this member.
    Missing,
}

impl Reach {
    /// How the log names it.
    fn as_str(self) -> &'static str {
        match self {
            Self::Held => "held",
            Self::Lapsed => "lapsed",
            Self::Missing => "missing",
        }
    }
}

/// A machine that is not the owner's, meeting an older organization: it pulls, with the
/// credential its own grant held, and goes on where what arrived is the format `shipped`, the one
/// the owner's upgrade walks to, or a newer one,
/// which the caller then reads or refuses. Where the organization is still older, or the pull did
/// not go, it waits for its owner, and nothing was written to the organization.
///
/// **A pull refused over a credential that is lapsed or gone is told apart** (ticket 25): that
/// machine would wait for its owner for ever, since it cannot hear whether the owner has upgraded,
/// so it is told it needs a new link from its organization instead.
async fn follow_the_owner(
    store: &OrganizationStore,
    remote: &impl Replication,
    reach: Reach,
    shipped: i64,
) -> Result<(), Error> {
    let pulled = remote.pull(store).await;

    if pulled && !store.is_older_than(shipped).await? {
        return Ok(());
    }

    if !pulled && reach != Reach::Held {
        diagnostics::info("organization.upgrade.credentialLapsed")
            .with("reach", reach.as_str())
            .write();

        return Err(Error::refused(
            RefusalReason::OrganizationCredentialLapsed,
            "this machine's own credential on the organization is lapsed or gone, so it cannot \
             learn whether the owner has upgraded it. it needs a new link from its organization; \
             nothing was written to the organization",
        ));
    }

    Err(waits_for_its_owner())
}

/// The refusal of an owner whose machine holds changes an earlier build captured that the
/// organization, reshaped by another of the owner's machines, refuses at every push: nothing was
/// written, and disconnecting this machine and connecting it again drops those changes and is the
/// way on (ticket 25).
fn changes_unsendable(organization_id: &str) -> Error {
    diagnostics::warn("organization.upgrade.changesUnsendable")
        .with("organization", organization_id)
        .write();

    Error::refused(
        RefusalReason::OrganizationChangesUnsendable,
        "this machine holds changes an earlier version made that the upgraded organization \
         refuses. disconnecting this machine and connecting it again drops those unsent changes; \
         nothing was written to the organization",
    )
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

/// The refusal of an owner whose upgrade could not reach the organization's latest state: nothing
/// was written, and the upgrade runs at their next sign-in, resume or connect that can reach it.
fn needs_a_connection(organization_id: &str, why: &str) -> Error {
    diagnostics::info("organization.upgrade.offline")
        .with("organization", organization_id)
        .with("reason", why)
        .write();

    Error::refused(
        RefusalReason::OrganizationUpgradeOffline,
        format!(
            "{why}, and the organization is upgraded only against its latest state. connect and \
             sign in again; nothing was changed"
        ),
    )
}

/// The key the organization is on now: the one `pinned`, followed along every completed
/// succession this replica holds that the key in hand signed, as `role::follow_succession` walks
/// them. A format 1 handover re-keyed the directory and left exactly such a row, so a machine
/// that pinned the key it replaced settles here on the key that replaced it.
///
/// **Each link is checked against the key the last one handed over**, so a row somebody wrote is
/// followed nowhere. Where the succession table is missing, the pin stands.
async fn settled(
    store: &OrganizationStore,
    pinned: &[u8; VERIFYING_KEY_BYTES],
) -> Result<[u8; VERIFYING_KEY_BYTES], Error> {
    let successions = store.successions_if_any().await?;
    let mut key = *pinned;

    // bounded by the number of rows there are, so a cycle somebody wrote is a walk that ends.
    for _ in 0..successions.len() {
        let next = successions.iter().find(|succession| {
            succession.old_verifying_key == key
                && succession.accepted_at.is_some()
                && verify_succession(&key, authority_of(succession), &succession.signature).is_ok()
        });

        match next.and_then(|succession| succession.new_verifying_key) {
            Some(new) => key = new,
            None => break,
        }
    }

    Ok(key)
}

/// A member's own grant on the organization database: the credential it holds and when that
/// dies, where the grant recorded it.
struct OwnGrant {
    token: String,
    expires_at: Option<i64>,
}

impl OwnGrant {
    /// Whether the credential died at or before `now`, by the expiry the grant recorded; one that
    /// recorded none never lapses.
    fn lapsed(&self, now: i64) -> bool {
        self.expires_at.is_some_and(|expiry| expiry <= now)
    }
}

/// What the grant of the member `sought` on the organization database holds, where one verifies
/// as `reading`, the first change due, judges it: the credential their replica pulls with,
/// unsealed with the `secret` their vault opened to, and when it dies.
///
/// `owners_signing_key` is the owner's, where the member sought is the owner: their certificate is
/// judged by its key alone, so an unsigned `revoked_at` on it revokes nothing.
async fn own_grant(
    reading: &Transition,
    sought: &Sought<'_>,
    organization_id: &str,
    secret: &MemberSecretKey,
    owners_signing_key: Option<[u8; VERIFYING_KEY_BYTES]>,
) -> Result<Option<OwnGrant>, Error> {
    let Some(grant) = (reading.grant)(sought, organization_id, owners_signing_key.as_ref()).await?
    else {
        return Ok(None);
    };

    let token = String::from_utf8(unseal_with_secret_key(secret, &grant.sealed_credential)?)
        .map_err(|_| Error::Integrity {
            message: "a sealed credential is not text".to_string(),
        })?;

    Ok(Some(OwnGrant {
        token,
        expires_at: grant
            .credential_expires_at
            .as_deref()
            .and_then(|at| at.parse::<i64>().ok()),
    }))
}

/// The format a runner handed `transitions` ships: the one after the last of them.
fn shipped(transitions: &[Transition]) -> i64 {
    transitions.len() as i64 + 1
}

/// The change of format whose readers find a vault and a grant in the organization as it stands
/// (ticket 29): the first due, the one starting from the format it is in; or, where it is in the
/// format `transitions` ship and only its `format` row is missing or wrong, the last, whose
/// readers read the format it arrives at. The runner itself reads no format.
async fn reading<'t>(
    store: &OrganizationStore,
    transitions: &'t [Transition],
) -> Result<&'t Transition, Error> {
    let from = store.format_as_it_stands(shipped(transitions)).await?;

    transitions
        .iter()
        .find(|transition| transition.from >= from)
        .or(transitions.last())
        .ok_or_else(waits_for_its_owner)
}

/// The key the owner signs rows with, which their own secret derives and the root names.
pub(crate) fn signing_key_of(secret: &MemberSecretKey) -> Result<AdministratorKey, Error> {
    Ok(AdministratorKey::from_bytes(
        &secret.derive_seed(ADMINISTRATOR_KEY_PURPOSE)?,
    ))
}

/// The error for a credential slot a panic left poisoned.
fn poisoned() -> Error {
    Error::Internal {
        message: "the credential slot was poisoned".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use std::{
        cell::Cell,
        sync::{Arc, Mutex},
    };

    use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD as BASE64URL};
    use serde_json::json;

    use super::{
        ItsRemote, Pushed, Replication, checked, classified, signing_key_of, vault_opened_by,
        walked, with_password, with_password_over, with_remembered_key, with_the_owners_password,
    };
    use crate::{
        backup,
        error::{Error, RefusalReason},
        keyring::take_the_credential_store,
        organization::{
            HeldOrganization,
            authority::{
                Chain, OrganizationKey, SuccessionAuthority, WorkspaceAuthority, sign_succession,
            },
            connect,
            invite::rename_member,
            link::Locator,
            permission::OWNER_ROLE,
            role::follow_succession,
            session::{
                CredentialSlot, Resumption, refused_by_name, remember, resume, sign_in_by_username,
            },
            setup::{Remote, connect_existing},
            store::{self, FORMAT_VERSION, GrantRecord, OrganizationStore, SuccessionRecord},
            transition::{
                Pending, Sought, TRANSITIONS, Transition, Unjudged, Upgrading,
                test::{
                    older::{
                        EARLIER, FORMAT_ONE_SCHEMA, MINAS_CREDENTIAL, NOW, ORGANIZATION_CREDENTIAL,
                        ORGANIZATION_ID, Older, Person, another_machine, assert_upgraded,
                        expected_effective, made_to_look_older, older, run, text, write_grant,
                        write_invitation, write_mark, write_member, write_workspace,
                    },
                    remote::{Answering, online},
                },
            },
            vault::{MemberSecretKey, open_content},
            workspace::grant_workspace,
        },
        persisted::Persisted,
        schema,
        sync::{
            RemoteSyncStore,
            test::server::{ScriptedResponse, ScriptedServer},
            turso::{
                discovery::McpEndpoint,
                platform::{AccessLevel, InMemoryPlatform},
            },
        },
    };

    /// A credential slot holding nothing yet.
    fn slot() -> CredentialSlot {
        Arc::new(Mutex::new(None))
    }

    /// A remote a member's machine pulls from, which says what credential the pull was made with,
    /// and where `owner_upgraded` is set, brings the owner's upgrade with it: what arrives is the
    /// owner's sign-in on another machine, run here on the same database over `transitions`,
    /// which is what the two replicas are to each other once a push and a pull have run between
    /// them.
    struct MemberPull<'a> {
        older: &'a Older,
        transitions: &'a [Transition],
        slot: CredentialSlot,
        owner_upgraded: bool,
        pulled_with: Mutex<Vec<Option<String>>>,
    }

    impl Replication for MemberPull<'_> {
        /// A member's machine never pushes to an older organization, so a push fails the test.
        async fn push(&self, _: &OrganizationStore) -> Pushed {
            panic!("a member's machine pushed to an older organization")
        }

        /// A member's machine mints nothing: it holds no account.
        async fn minted(&self, _: &str) -> Option<String> {
            panic!("a member's machine asked the owner's account for a credential")
        }

        /// A member's machine copies nothing: it never upgrades.
        async fn copied(&self, _: &str, _: &str, _: i64) -> Option<String> {
            panic!("a member's machine copied the organization on the owner's account")
        }

        /// Records the credential the pull was made with, runs the owner's upgrade where it is set
        /// to, and answers as gone.
        async fn pull(&self, store: &OrganizationStore) -> bool {
            self.pulled_with
                .lock()
                .expect("the record")
                .push(self.slot.lock().expect("the slot").clone());

            if self.owner_upgraded {
                let owner = self.older.person("owner");

                with_password_over(
                    self.transitions,
                    store,
                    &online(),
                    &self.older.held,
                    owner.username,
                    owner.password,
                    &slot(),
                    NOW,
                )
                .await
                .expect("the owner's upgrade on the other machine");
            }

            true
        }
    }

    /// Everything the organization database holds, table by table and row by row: a write
    /// anywhere changes it.
    async fn contents(store: &OrganizationStore) -> Vec<(String, Vec<Vec<turso::Value>>)> {
        let mut contents = Vec::new();

        for table in store.tables().await.expect("the tables") {
            let mut rows = store
                .connection()
                .query(&format!("SELECT * FROM \"{table}\" ORDER BY rowid"), ())
                .await
                .expect("the rows");
            let mut values = Vec::new();

            while let Some(row) = rows.next().await.expect("a row") {
                values.push(
                    (0..row.column_count())
                        .map(|index| row.get_value(index).expect("a value"))
                        .collect(),
                );
            }

            contents.push((table, values));
        }

        contents
    }

    /// The reason a result was refused for, where it was refused.
    fn reason_of<T>(result: &Result<T, Error>) -> Option<RefusalReason> {
        match result {
            Err(Error::Refused { reason, .. }) => Some(*reason),
            _ => None,
        }
    }

    /// **Ticket 22's second, third and ninth criteria.** The owner signs in on this build with
    /// their password, online: the organization reads as format 2, with the three built-in roles,
    /// no `administrator_certificate`, and every member standing where they could stand before;
    /// the credential the owner's grant held is in the slot; what did not verify is gone; the
    /// standing offer is withdrawn; and every session epoch is the one the row carried. The push
    /// of what the old build captured came first, then the pull, then the push of the upgrade.
    #[tokio::test]
    async fn the_owners_sign_in_upgrades_the_organization_and_everybody_keeps_what_they_could_do() {
        let older = older("sign-in").await;
        let store = older.open().await;
        let owner = older.person("owner");
        let credential = slot();
        let remote = online();

        assert!(store.is_older().await.expect("the format"));

        with_password(
            &store,
            &remote,
            &older.held,
            owner.username,
            owner.password,
            &credential,
            NOW,
        )
        .await
        .expect("the owner's sign-in did not upgrade the organization");

        assert_eq!(remote.asked(), vec!["push", "pull", "copy", "push"]);

        store
            .refuse_another_format()
            .await
            .expect("the upgraded organization was refused");

        let session = sign_in_by_username(
            &store,
            &older.held,
            owner.username,
            owner.password,
            &credential,
        )
        .await
        .expect("the owner did not sign in after the upgrade");

        assert_eq!(session.role, "owner");
        assert_eq!(session.permissions, OWNER_ROLE.mask);
        assert_eq!(
            credential.lock().expect("the slot").as_deref(),
            Some(ORGANIZATION_CREDENTIAL)
        );

        let columns = store.columns_of("member").await.expect("the columns");

        assert!(
            !columns
                .iter()
                .any(|column| column == "role" || column == "permissions")
        );

        assert_upgraded(&store, &older, &older.pinned()).await;

        let members = store.members(&older.pinned()).await.expect("the members");
        let row = |id: &str| {
            members
                .iter()
                .find(|member| member.id == id)
                .unwrap_or_else(|| panic!("{id} was not carried"))
        };

        assert!(row("pia").must_change_password);
        assert!(!members.iter().any(|member| member.id == "mallory"));
        assert!(
            store
                .live_certificates(&older.pinned(), "rafi")
                .await
                .expect("the certificates")
                .is_empty()
        );

        // every live member's certificate is issued from the root, its ceiling what they end
        // with and its key the one their row carries.
        let (certificates, revocations) = store.chain_rows().await.expect("the chain");
        let pinned = older.pinned();
        let chain = Chain::new(&pinned, &certificates, &revocations);
        let root = chain
            .live_certificates_of("owner")
            .into_iter()
            .find(|certificate| certificate.is_root())
            .expect("the owner holds the root");

        for id in ["adam", "lena", "mina", "pia"] {
            let held = chain.live_certificates_of(id);

            assert_eq!(held.len(), 1, "{id}");
            assert_eq!(
                held[0].issuer_certificate_id.as_deref(),
                Some(root.id.as_str())
            );
            assert_eq!(held[0].ceiling, row(id).effective, "{id}");
            assert_eq!(
                held[0].signing_public_key,
                row(id).signing_public_key,
                "{id}"
            );
        }
    }

    /// **Ticket 22's fourth criterion.** A second store on the same database, holding no key but
    /// the verifying key it pinned, reads every member, role, certificate, workspace, grant,
    /// invitation and mark row verified; and what the administrator and the member granted
    /// administration acts sign afterwards, with the owner nowhere in it, verifies there too.
    #[tokio::test]
    async fn every_upgraded_row_and_every_act_signed_afterwards_verifies_on_another_machine() {
        let older = older("elsewhere").await;
        let store = older.open().await;
        let owner = older.person("owner");

        with_password(
            &store,
            &online(),
            &older.held,
            owner.username,
            owner.password,
            &slot(),
            NOW,
        )
        .await
        .expect("the upgrade");

        // the administrator renames the plain member, and the member granted administration acts
        // grants north to the pending one at full access. Each signs under the certificate the
        // upgrade issued them.
        let adam = older.person("adam");
        let adams = sign_in_by_username(
            &store,
            &older.held_by("adam"),
            adam.username,
            adam.password,
            &slot(),
        )
        .await
        .expect("the administrator did not sign in after the upgrade");

        assert_eq!(adams.role, "manager");

        rename_member(&store, &adams, "mina", "mina.renamed", NOW + 1)
            .await
            .expect("the manager could not rename a member");

        let lena = older.person("lena");
        let lenas = sign_in_by_username(
            &store,
            &older.held_by("lena"),
            lena.username,
            lena.password,
            &slot(),
        )
        .await
        .expect("the member granted administration acts did not sign in after the upgrade");

        grant_workspace(
            &store,
            &lenas,
            None::<&InMemoryPlatform>,
            "north",
            "pia",
            AccessLevel::FullAccess,
        )
        .await
        .expect("the member granted administration acts could not grant a workspace");

        drop(store);

        let elsewhere = another_machine(&older.directory).await;
        let pinned = older.pinned();

        assert_eq!(
            elsewhere.format().await.expect("the format"),
            Some(FORMAT_VERSION)
        );

        let members = elsewhere.members(&pinned).await.expect("the members");

        assert_eq!(members.len(), 6);
        assert!(members.iter().all(|member| member.covered), "{members:?}");

        let mina = members
            .iter()
            .find(|member| member.id == "mina")
            .expect("mina");

        assert_eq!(
            open_content(
                &older.content_key,
                "member.username_sealed",
                &mina.username_sealed
            )
            .expect("the username"),
            b"mina.renamed"
        );
        assert_eq!(elsewhere.roles(&pinned).await.expect("the roles").len(), 2);

        let (certificates, revocations) = elsewhere.chain_rows().await.expect("the chain");
        let chain = Chain::new(&pinned, &certificates, &revocations);

        for certificate in &certificates {
            chain
                .live(&certificate.id)
                .unwrap_or_else(|error| panic!("{} does not verify: {error}", certificate.id));
        }

        assert_eq!(certificates.len(), 5, "the root and one per live member");
        assert_eq!(
            elsewhere
                .workspaces(&pinned)
                .await
                .expect("the workspaces")
                .len(),
            1
        );
        assert!(
            elsewhere
                .grants(&pinned)
                .await
                .expect("the grants")
                .iter()
                .any(|grant| grant.member_id == "pia" && grant.workspace_id == "north")
        );
        assert_eq!(
            elsewhere
                .invitations(&pinned)
                .await
                .expect("the invitations")
                .len(),
            1
        );
        assert!(elsewhere.mark(&pinned).await.expect("the mark").is_some());
    }

    /// **Ticket 23's fourth criterion.** Two of the owner's machines, one after the other on one
    /// database: the first upgrades, and the second, whose pull brought that, finds the upgrade
    /// done and writes nothing, the first's schema change above all.
    #[tokio::test]
    async fn a_second_owner_machine_finds_the_upgrade_done_and_replays_nothing() {
        let _turn = take_the_credential_store().await;
        let older = older("two-owners").await;
        let store = older.open().await;
        let owner = older.person("owner");

        with_password(
            &store,
            &online(),
            &older.held,
            owner.username,
            owner.password,
            &slot(),
            NOW,
        )
        .await
        .expect("the first machine's upgrade");

        let upgraded = contents(&store).await;
        let second = online();

        with_password(
            &store,
            &second,
            &older.held,
            owner.username,
            owner.password,
            &slot(),
            NOW + 60_000,
        )
        .await
        .expect("the second machine's sign-in");

        remember(
            ORGANIZATION_ID,
            "owner",
            owner.session_epoch,
            &owner.member_key,
        );
        with_remembered_key(&store, &second, &older.held, &slot(), NOW + 60_000)
            .await
            .expect("the second machine's resume");

        assert!(second.asked().is_empty(), "{:?}", second.asked());
        assert_eq!(
            contents(&store).await,
            upgraded,
            "the second machine wrote to an upgraded organization"
        );
        assert_upgraded(&store, &older, &older.pinned()).await;
    }

    /// **Ticket 23's first criterion.** The owner's upgrade runs only once what the machine holds
    /// has been pushed and a pull has completed. Offline, with the push refused, or with the pull
    /// refused, nothing is written, the organization is still older, and the owner is told the
    /// upgrade needs a connection; a pull is not tried after a push that failed.
    #[tokio::test]
    async fn offline_or_with_the_push_or_the_pull_failing_nothing_is_written() {
        let _turn = take_the_credential_store().await;
        let older = older("offline").await;
        let store = older.open().await;
        let owner = older.person("owner");
        let before = contents(&store).await;

        remember(
            ORGANIZATION_ID,
            "owner",
            owner.session_epoch,
            &owner.member_key,
        );

        for (case, push, pull, asked) in [
            ("offline", false, false, vec!["push"]),
            ("the push refused", false, true, vec!["push"]),
            ("the pull refused", true, false, vec!["push", "pull"]),
        ] {
            let remote = Answering::new(push, pull);
            let refused = with_password(
                &store,
                &remote,
                &older.held,
                owner.username,
                owner.password,
                &slot(),
                NOW,
            )
            .await;

            assert_eq!(
                reason_of(&refused),
                Some(RefusalReason::OrganizationUpgradeOffline),
                "{case}: {refused:?}"
            );
            assert!(
                refused
                    .expect_err("refused")
                    .to_string()
                    .contains("nothing was changed"),
                "{case}"
            );
            assert_eq!(remote.asked(), asked, "{case}");

            let remote = Answering::new(push, pull);
            let refused = with_remembered_key(&store, &remote, &older.held, &slot(), NOW).await;

            assert_eq!(
                reason_of(&refused),
                Some(RefusalReason::OrganizationUpgradeOffline),
                "{case}, the resume: {refused:?}"
            );
            assert_eq!(
                contents(&store).await,
                before,
                "{case}: something was written"
            );
            assert!(store.is_older().await.expect("the format"), "{case}");
        }
    }

    /// **Ticket 23's second criterion.** A member's machine holding a format 1 replica pulls
    /// before it answers, with the credential the member's own format 1 grant holds. While what
    /// arrives is still format 1, the sign-in and the resume wait for the owner and write nothing;
    /// once the owner has upgraded on their own machine and the pull brings it, both go through.
    #[tokio::test]
    async fn a_member_pulls_first_and_follows_the_owner_once_the_owner_has_upgraded() {
        let _turn = take_the_credential_store().await;
        let older = older("member-pulls").await;
        let store = older.open().await;
        let mina = older.person("mina");
        let before = contents(&store).await;

        remember(
            ORGANIZATION_ID,
            "mina",
            mina.session_epoch,
            &mina.member_key,
        );

        // the owner has not upgraded: the pull brings format 1 again.
        let credential = slot();
        let remote = MemberPull {
            older: &older,
            transitions: TRANSITIONS,
            slot: Arc::clone(&credential),
            owner_upgraded: false,
            pulled_with: Mutex::new(Vec::new()),
        };
        let refused = with_password(
            &store,
            &remote,
            &older.held_by("mina"),
            mina.username,
            mina.password,
            &credential,
            NOW,
        )
        .await;

        assert_eq!(
            reason_of(&refused),
            Some(RefusalReason::OrganizationOlder),
            "{refused:?}"
        );
        assert_eq!(
            *remote.pulled_with.lock().expect("the record"),
            vec![Some(MINAS_CREDENTIAL.to_string())],
            "the member did not pull with their own grant"
        );

        let credential = slot();
        let remote = MemberPull {
            older: &older,
            transitions: TRANSITIONS,
            slot: Arc::clone(&credential),
            owner_upgraded: false,
            pulled_with: Mutex::new(Vec::new()),
        };
        let refused =
            with_remembered_key(&store, &remote, &older.held_by("mina"), &credential, NOW).await;

        assert_eq!(
            reason_of(&refused),
            Some(RefusalReason::OrganizationOlder),
            "the resume: {refused:?}"
        );
        assert_eq!(
            *remote.pulled_with.lock().expect("the record"),
            vec![Some(MINAS_CREDENTIAL.to_string())]
        );
        assert_eq!(contents(&store).await, before, "a member wrote");

        // the owner has upgraded on their machine: the resume's pull brings it, and the resume
        // goes through into the ordinary one.
        let credential = slot();
        let remote = MemberPull {
            older: &older,
            transitions: TRANSITIONS,
            slot: Arc::clone(&credential),
            owner_upgraded: true,
            pulled_with: Mutex::new(Vec::new()),
        };

        with_remembered_key(&store, &remote, &older.held_by("mina"), &credential, NOW)
            .await
            .expect("the member's resume did not follow the owner's upgrade");
        store
            .refuse_another_format()
            .await
            .expect("the member's machine still read the organization as older");

        match resume(&store, &older.held_by("mina"), &credential).await {
            Ok(Resumption::Opened(session)) => assert_eq!(session.role, "member"),
            other => panic!("mina did not resume after the owner's upgrade: {other:?}"),
        }

        // and the sign-in, on a machine whose replica is behind in the same way: here the rows
        // are already this format, so it only has to be let through.
        let credential = slot();
        let remote = MemberPull {
            older: &older,
            transitions: TRANSITIONS,
            slot: Arc::clone(&credential),
            owner_upgraded: false,
            pulled_with: Mutex::new(Vec::new()),
        };

        with_password(
            &store,
            &remote,
            &older.held_by("mina"),
            mina.username,
            mina.password,
            &credential,
            NOW,
        )
        .await
        .expect("the member's sign-in was held after the owner's upgrade");

        let session = sign_in_by_username(
            &store,
            &older.held_by("mina"),
            mina.username,
            mina.password,
            &credential,
        )
        .await
        .expect("mina did not sign in after the owner's upgrade");

        assert_eq!(session.role, "member");
    }

    /// **Ticket 23's second criterion, the sign-in's pull.** The same as the resume above, with
    /// the password: the member's pull brings the owner's upgrade, and the sign-in goes through.
    #[tokio::test]
    async fn a_members_sign_in_follows_an_upgrade_its_pull_brings() {
        let older = older("member-sign-in-pulls").await;
        let store = older.open().await;
        let mina = older.person("mina");
        let credential = slot();
        let remote = MemberPull {
            older: &older,
            transitions: TRANSITIONS,
            slot: Arc::clone(&credential),
            owner_upgraded: true,
            pulled_with: Mutex::new(Vec::new()),
        };

        with_password(
            &store,
            &remote,
            &older.held_by("mina"),
            mina.username,
            mina.password,
            &credential,
            NOW,
        )
        .await
        .expect("the member's sign-in did not follow the owner's upgrade");

        assert_eq!(
            *remote.pulled_with.lock().expect("the record"),
            vec![Some(MINAS_CREDENTIAL.to_string())]
        );

        let session = sign_in_by_username(
            &store,
            &older.held_by("mina"),
            mina.username,
            mina.password,
            &credential,
        )
        .await
        .expect("mina did not sign in after the owner's upgrade");

        assert_eq!(session.role, "member");
    }

    /// **Ticket 23's fifth criterion.** A machine still on the old build signs a workspace, a
    /// grant, an invitation and the mark after the upgrade, the way format 1 signs them, under
    /// the certificate id format 1 gave each signer; the owner's old build signs a read-only
    /// grant. None of it makes the directory unreadable: another machine reads every one of them
    /// verified, since each certificate the upgrade issued kept that id and that key.
    #[tokio::test]
    async fn a_row_an_old_build_signs_after_the_upgrade_is_read_verified() {
        let older = older("old-build").await;
        let store = older.open().await;
        let owner = older.person("owner");

        with_password(
            &store,
            &online(),
            &older.held,
            owner.username,
            owner.password,
            &slot(),
            NOW,
        )
        .await
        .expect("the upgrade");

        let lena = older.person("lena");
        let adam = older.person("adam");

        // lena's old build: a workspace renamed into place and north granted to pia.
        write_workspace(
            &store,
            &older.content_key,
            "south",
            WorkspaceAuthority {
                database_name: "ws-south",
                database_hostname: "ws-south-an-org.aws-eu-west-1.turso.io",
            },
            &lena.signing,
            older.certificate("lena"),
        )
        .await;
        write_grant(
            &store,
            older.person("pia"),
            "north",
            "north-full",
            "full-access",
            &lena.signing,
            older.certificate("lena"),
            false,
        )
        .await;
        // adam's old build: an invitation and a new mark.
        write_invitation(
            &store,
            "invitation-mina",
            "mina",
            adam,
            older.certificate("adam"),
        )
        .await;
        write_mark(
            &store,
            &older.content_key,
            b"a new seal",
            adam,
            older.certificate("adam"),
            NOW + 5,
        )
        .await;
        // the owner's old build: a read-only grant, which only the root signs.
        write_grant(
            &store,
            lena,
            "south",
            "south-read",
            "read-only",
            &owner.signing,
            older.certificate("owner"),
            false,
        )
        .await;

        drop(store);

        let elsewhere = another_machine(&older.directory).await;
        let pinned = older.pinned();
        let grants = elsewhere
            .grants(&pinned)
            .await
            .expect("an old build's grant made the grants unreadable");

        assert!(
            grants
                .iter()
                .any(|grant| grant.member_id == "pia" && grant.workspace_id == "north")
        );
        assert!(grants.iter().any(|grant| grant.member_id == "lena"
            && grant.workspace_id == "south"
            && grant.access_level == "read-only"));
        assert!(
            elsewhere
                .workspaces(&pinned)
                .await
                .expect("an old build's workspace made the workspaces unreadable")
                .iter()
                .any(|workspace| workspace.id == "south")
        );
        assert!(
            elsewhere
                .invitations(&pinned)
                .await
                .expect("an old build's invitation made the invitations unreadable")
                .iter()
                .any(|invitation| invitation.id == "invitation-mina")
        );

        let mark = elsewhere
            .mark(&pinned)
            .await
            .expect("an old build's mark made the mark unreadable")
            .expect("a mark");

        assert_eq!(
            open_content(&older.content_key, "mark.image_sealed", &mark.image_sealed)
                .expect("the image"),
            b"a new seal"
        );
        elsewhere
            .members(&pinned)
            .await
            .expect("the members were unreadable");
    }

    /// **Ticket 23's sixth criterion, the certificate.** An unsigned `revoked_at` somebody wrote
    /// onto the owner's format 1 certificate is not read: the owner's sign-in upgrades the
    /// organization, their credential is found under it, and every row it signed is carried.
    #[tokio::test]
    async fn an_unsigned_revocation_of_the_owners_certificate_is_ignored() {
        let older = older("owner-revoked").await;
        let store = older.open().await;
        let owner = older.person("owner");

        run(
            &store,
            "UPDATE \"administrator_certificate\" SET \"revoked_at\" = '1' WHERE \"id\" = 'cert-owner'",
            Vec::new(),
        )
        .await;

        let credential = slot();

        with_password(
            &store,
            &online(),
            &older.held,
            owner.username,
            owner.password,
            &credential,
            NOW,
        )
        .await
        .expect("a revocation nobody signed stopped the owner's upgrade");

        assert_eq!(
            credential.lock().expect("the slot").as_deref(),
            Some(ORGANIZATION_CREDENTIAL)
        );
        assert_upgraded(&store, &older, &older.pinned()).await;
    }

    /// **Ticket 23's sixth criterion, the column.** `must_change_password` written onto the
    /// owner's row neither hides their vault nor stops the upgrade, and it is not carried onto
    /// them: they sign in on this format afterwards.
    #[tokio::test]
    async fn must_change_password_on_the_owners_row_hides_nothing() {
        let older = older("owner-must-change").await;
        let store = older.open().await;
        let owner = older.person("owner");

        run(
            &store,
            "UPDATE \"member\" SET \"must_change_password\" = 1 WHERE \"id\" = 'owner'",
            Vec::new(),
        )
        .await;

        let credential = slot();

        with_password(
            &store,
            &online(),
            &older.held,
            owner.username,
            owner.password,
            &credential,
            NOW,
        )
        .await
        .expect("the column stopped the owner's upgrade");

        assert_upgraded(&store, &older, &older.pinned()).await;

        let session = sign_in_by_username(
            &store,
            &older.held,
            owner.username,
            owner.password,
            &credential,
        )
        .await
        .expect("the owner did not sign in after the upgrade");

        assert_eq!(session.role, "owner");
    }

    /// **Ticket 23's sixth criterion, the pin.** The organization was handed over in format 1:
    /// the directory is on the new owner's key, and a completed succession signed by the old key
    /// says so. A machine that pinned the old key has the new owner sign in: the pin is settled
    /// along the succession before the owner is looked for, the organization is upgraded, and the
    /// ordinary walk afterwards pins the new key and signs the owner in.
    #[tokio::test]
    async fn a_pin_a_format_one_handover_left_stale_is_settled_before_the_owner_is_looked_for() {
        let older = older("stale-pin").await;
        let store = older.open().await;
        let owner = older.person("owner");
        let founders = OrganizationKey::generate().expect("the key before the handover");
        let completed = SuccessionAuthority {
            id: "handover",
            offered_member_id: "owner",
            offered_by: "adam",
            offered_at: EARLIER - 10,
            old_verifying_key: &founders.verifying_key(),
            new_verifying_key: Some(&older.pinned()),
            accepted_at: Some(EARLIER - 5),
        };

        store
            .write_succession(&SuccessionRecord {
                id: "handover".to_string(),
                offered_member_id: "owner".to_string(),
                offered_by: "adam".to_string(),
                offered_at: EARLIER - 10,
                old_verifying_key: founders.verifying_key(),
                new_verifying_key: Some(older.pinned()),
                accepted_at: Some(EARLIER - 5),
                signature: sign_succession(&founders, completed),
            })
            .await
            .expect("the handover");

        let stale = HeldOrganization {
            verifying_key: BASE64URL.encode(founders.verifying_key()),
            ..older.held.clone()
        };

        with_password(
            &store,
            &online(),
            &stale,
            owner.username,
            owner.password,
            &slot(),
            NOW,
        )
        .await
        .expect("a stale pin stopped the owner's upgrade");

        assert_eq!(
            store.format().await.expect("the format"),
            Some(FORMAT_VERSION)
        );

        let mut machine = Persisted::<RemoteSyncStore>::load(older.directory.join("m.json"))
            .expect("the machine");

        machine.organization = Some(stale);

        assert_eq!(
            follow_succession(&store, &mut machine)
                .await
                .expect("the walk"),
            Some(older.pinned())
        );

        let held = machine.organization.clone().expect("the record");
        let session = sign_in_by_username(&store, &held, owner.username, owner.password, &slot())
            .await
            .expect("the owner did not sign in after the upgrade");

        assert_eq!(session.role, "owner");
    }

    /// **Ticket 22's sixth criterion.** Opened first by anybody but its owner, at a sign-in, a
    /// resume or a connect, the organization is refused as waiting for its owner and nothing is
    /// written to it, the members' pulls having brought nothing newer. A pair that opens no vault
    /// is the wall's one sentence, as any sign-in's.
    #[tokio::test]
    async fn opened_first_by_a_member_it_waits_for_its_owner_and_nothing_is_written() {
        let _turn = take_the_credential_store().await;
        let older = older("member-first").await;
        let store = older.open().await;
        let before = contents(&store).await;

        // the sign-in, by the administrator and by a plain member.
        for id in ["adam", "mina"] {
            let person = older.person(id);
            let refused = with_password(
                &store,
                &online(),
                &older.held_by(id),
                person.username,
                person.password,
                &slot(),
                NOW,
            )
            .await;

            assert_eq!(
                reason_of(&refused),
                Some(RefusalReason::OrganizationOlder),
                "{id}: {refused:?}"
            );
        }

        // a wrong password.
        let refused = with_password(
            &store,
            &online(),
            &older.held,
            "olivia.owner",
            "not the owners password",
            &slot(),
            NOW,
        )
        .await;

        assert_eq!(refused, Err(refused_by_name(&older.held.name)));

        // the resume, with the key mina's machine filed at her last sign-in.
        let mina = older.person("mina");

        remember(
            ORGANIZATION_ID,
            "mina",
            mina.session_epoch,
            &mina.member_key,
        );

        let refused =
            with_remembered_key(&store, &online(), &older.held_by("mina"), &slot(), NOW).await;

        assert_eq!(
            reason_of(&refused),
            Some(RefusalReason::OrganizationOlder),
            "{refused:?}"
        );

        // the connect by link, as any member's machine makes it.
        let mut machine = Persisted::<RemoteSyncStore>::load(older.directory.join("m.json"))
            .expect("the machine");
        let refused = connect::connect(
            &store,
            &mut machine,
            &Locator::new(
                ORGANIZATION_ID,
                "Acme Rentals",
                &older.pinned(),
                &older.held.remote_url,
            ),
            "a credential",
            NOW,
        )
        .await;

        assert_eq!(
            reason_of(&refused),
            Some(RefusalReason::OrganizationOlder),
            "{refused:?}"
        );
        assert!(machine.organization.is_none());

        // and the refusal every way in meets says whose it is to open.
        let refused = store.refuse_another_format().await;

        assert_eq!(reason_of(&refused), Some(RefusalReason::OrganizationOlder));
        assert!(
            refused
                .expect_err("refused")
                .to_string()
                .contains("waits for its owner to open it in this version")
        );

        assert_eq!(
            contents(&store).await,
            before,
            "a refusal wrote to the organization"
        );
        assert!(store.is_older().await.expect("the format"));
    }

    /// **Ticket 22's seventh and ninth criteria, the resume.** The owner's machine launches with
    /// the key it remembers and no password, and the organization is upgraded the way a sign-in
    /// upgrades it; afterwards the owner's session and the key mina's machine filed before the
    /// upgrade both resume, because every epoch was kept.
    #[tokio::test]
    async fn the_owners_resume_upgrades_it_and_every_remembered_session_survives() {
        let _turn = take_the_credential_store().await;
        let older = older("resume").await;
        let store = older.open().await;
        let owner = older.person("owner");
        let mina = older.person("mina");

        remember(
            ORGANIZATION_ID,
            "owner",
            owner.session_epoch,
            &owner.member_key,
        );
        remember(
            ORGANIZATION_ID,
            "mina",
            mina.session_epoch,
            &mina.member_key,
        );

        let credential = slot();

        with_remembered_key(&store, &online(), &older.held, &credential, NOW)
            .await
            .expect("the owner's resume did not upgrade the organization");

        assert_eq!(
            store.format().await.expect("the format"),
            Some(FORMAT_VERSION)
        );
        assert_eq!(
            credential.lock().expect("the slot").as_deref(),
            Some(ORGANIZATION_CREDENTIAL)
        );

        for (id, role) in [("owner", "owner"), ("mina", "member")] {
            match resume(&store, &older.held_by(id), &slot()).await {
                Ok(Resumption::Opened(session)) => {
                    assert_eq!(session.role, role, "{id}");
                    assert_eq!(
                        session.session_epoch,
                        older.person(id).session_epoch,
                        "{id}"
                    );
                }
                other => panic!("{id} did not resume after the upgrade: {other:?}"),
            }
        }
    }

    /// The listing a group holding the older organization answers.
    fn holding_the_organization() -> Vec<ScriptedResponse> {
        vec![
            ScriptedResponse::new(
                200,
                json!({ "jsonrpc": "2.0", "id": 1, "result": { "protocolVersion": "2025-06-18" } })
                    .to_string(),
            ),
            ScriptedResponse::new(
                200,
                json!({
                    "jsonrpc": "2.0",
                    "id": 3,
                    "result": { "content": [{ "type": "text", "text": json!([{
                        "Name": "org-7f3a",
                        "hostname": "org-7f3a-an-org.aws-eu-west-1.turso.io",
                        "group": "rentable"
                    }]).to_string() }] }
                })
                .to_string(),
            ),
        ]
    }

    /// **Ticket 22's seventh criterion, the connect.** A machine connecting on the owner's Turso
    /// account with the owner's password, and reaching the remote, upgrades the organization it
    /// pulled the same way, and ends holding it with the owner signed in; another member's
    /// password there waits for the owner, and the machine holds nothing. So does the owner's,
    /// with the remote out of reach.
    #[tokio::test]
    async fn the_connect_on_the_owners_account_upgrades_it_the_same_way() {
        let _turn = take_the_credential_store().await;
        let platform = Arc::new(InMemoryPlatform::new("an-org"));

        // the account holds the organization's database and the workspace's, which is what the
        // consent mints for.
        platform.holding_unprotected("org-7f3a");
        platform.holding_unprotected("ws-north");

        // anybody else's password first, which leaves the machine holding nothing.
        let first = older("connect-member").await;
        let mcp = ScriptedServer::start(holding_the_organization()).await;
        let mut machine = Persisted::<RemoteSyncStore>::load(first.directory.join("second.json"))
            .expect("the machine");
        let adam = first.person("adam");
        let refused = connect_existing(
            &mut machine,
            "a-platform-token",
            &McpEndpoint::at(&mcp.url("")),
            |_| Arc::clone(&platform),
            Remote::answering(),
            &first.directory.join("app.db"),
            adam.username,
            adam.password,
            NOW,
        )
        .await
        .map(|_| ());

        assert_eq!(
            reason_of(&refused),
            Some(RefusalReason::OrganizationOlder),
            "{refused:?}"
        );
        assert!(machine.organization.is_none());

        // the owner's, offline.
        let offline = older("connect-offline").await;
        let mcp = ScriptedServer::start(holding_the_organization()).await;
        let mut machine = Persisted::<RemoteSyncStore>::load(offline.directory.join("second.json"))
            .expect("the machine");
        let owner = offline.person("owner");
        let refused = connect_existing(
            &mut machine,
            "a-platform-token",
            &McpEndpoint::at(&mcp.url("")),
            |_| Arc::clone(&platform),
            Remote::none(),
            &offline.directory.join("app.db"),
            owner.username,
            owner.password,
            NOW,
        )
        .await
        .map(|_| ());

        assert_eq!(
            reason_of(&refused),
            Some(RefusalReason::OrganizationUpgradeOffline),
            "{refused:?}"
        );
        assert!(machine.organization.is_none());

        // and the owner's, online.
        let older = older("connect-owner").await;
        let mcp = ScriptedServer::start(holding_the_organization()).await;
        let mut machine = Persisted::<RemoteSyncStore>::load(older.directory.join("second.json"))
            .expect("the machine");
        let owner = older.person("owner");
        let (held, replica, session) = connect_existing(
            &mut machine,
            "a-platform-token",
            &McpEndpoint::at(&mcp.url("")),
            |_| Arc::clone(&platform),
            Remote::answering(),
            &older.directory.join("app.db"),
            owner.username,
            owner.password,
            NOW,
        )
        .await
        .expect("the owner's connect did not upgrade the organization");

        assert_eq!(held.id, ORGANIZATION_ID);
        assert_eq!(session.role, "owner");
        assert_eq!(
            replica.format().await.expect("the format"),
            Some(FORMAT_VERSION)
        );

        // ticket 27: the connect's upgrade was copied first, on this machine and on the account
        // the connect holds, protected there; neither refused connect copied anything.
        let copy = crate::backup::remote_name(
            "org-7f3a",
            &format!("format-1-to-{FORMAT_VERSION}"),
            NOW / 1000,
        );

        assert_eq!(
            copies_in(&older),
            vec![format!("format-1-to-{FORMAT_VERSION}-{NOW}.sqlite")]
        );
        assert!(copies_in(&first).is_empty());
        assert!(copies_in(&offline).is_empty());
        assert_eq!(
            platform.copies(),
            vec![("org-7f3a".to_string(), copy.clone())]
        );
        assert!(
            platform
                .databases()
                .iter()
                .any(|database| database.name == copy && database.delete_protection),
            "the connect's copy on the account is not protected"
        );
        assert_eq!(
            replica
                .members(&older.pinned())
                .await
                .expect("the members")
                .len(),
            6
        );
    }

    /// **Ticket 22's eighth criterion.** An organization of format 3 is not an older one: the
    /// owner's password upgrades nothing in it, the refusal names the update, and nothing is
    /// written.
    #[tokio::test]
    async fn a_newer_format_is_refused_naming_the_update_and_nothing_is_written() {
        let older = older("newer").await;
        let store = older.open().await;
        let owner = older.person("owner");

        with_password(
            &store,
            &online(),
            &older.held,
            owner.username,
            owner.password,
            &slot(),
            NOW,
        )
        .await
        .expect("the upgrade");
        run(
            &store,
            "UPDATE \"format\" SET \"version\" = ?",
            vec![turso::Value::Integer(FORMAT_VERSION + 1)],
        )
        .await;

        let before = contents(&store).await;
        let remote = online();

        with_password(
            &store,
            &remote,
            &older.held,
            owner.username,
            owner.password,
            &slot(),
            NOW,
        )
        .await
        .expect("a newer organization was treated as an older one");
        with_the_owners_password(
            &store,
            &remote,
            owner.username,
            owner.password,
            &slot(),
            NOW,
            || Error::Internal {
                message: "a newer organization was treated as an older one".to_string(),
            },
        )
        .await
        .expect("a newer organization was treated as an older one");

        assert!(remote.asked().is_empty());

        let refused = store.refuse_another_format().await;

        assert_eq!(reason_of(&refused), Some(RefusalReason::OrganizationNewer));
        assert!(
            refused
                .expect_err("refused")
                .to_string()
                .contains("made by a newer version")
        );
        assert_eq!(
            contents(&store).await,
            before,
            "a refusal wrote to the organization"
        );
    }

    // ticket 25: an upgraded organization is never upgraded again, and every stuck case names its
    // way out.

    /// A moment after every grant in the fixture has lapsed: they record an expiry of
    /// `1760000000000`.
    const LAPSED: i64 = 1_761_000_000_000;

    /// The fixture, upgraded by the owner's sign-in online.
    async fn upgraded(name: &str) -> (Older, OrganizationStore) {
        let older = older(name).await;
        let store = older.open().await;
        let owner = older.person("owner");

        with_password(
            &store,
            &online(),
            &older.held,
            owner.username,
            owner.password,
            &slot(),
            NOW,
        )
        .await
        .expect("the upgrade");

        (older, store)
    }

    /// The record a machine keeps once it has read the organization in this format.
    fn read_in_this_format(held: &HeldOrganization) -> HeldOrganization {
        HeldOrganization {
            format: Some(FORMAT_VERSION),
            ..held.clone()
        }
    }

    /// **Ticket 25's first criterion.** Upgrade; delete the `format` row; make the old table and
    /// columns again; replay mina's old promotion; then sign in and resume as the owner, on the
    /// machine that keeps having read the organization in this format. Nothing is written, and
    /// the replayed row grants nothing: it verifies under no format this build reads, and mina
    /// holds exactly the certificate the upgrade issued her.
    #[tokio::test]
    async fn an_organization_read_in_this_format_is_never_transformed_again() {
        let _turn = take_the_credential_store().await;
        let (older, store) = upgraded("never-again").await;
        let owner = older.person("owner");
        let pinned = older.pinned();
        let held = read_in_this_format(&older.held);

        made_to_look_older(&older, &store).await;

        assert!(store.is_older().await.expect("the format"));

        // what the refusal keeps from happening, a plan over this state carrying the replayed
        // row as a manager signed from the root, is shown at the foot of `transition/two.rs`.

        let before = contents(&store).await;
        let remote = online();
        let refused = with_password(
            &store,
            &remote,
            &held,
            owner.username,
            owner.password,
            &slot(),
            NOW + 60_000,
        )
        .await;

        assert_eq!(
            reason_of(&refused),
            Some(RefusalReason::OrganizationOlder),
            "the sign-in: {refused:?}"
        );

        remember(
            ORGANIZATION_ID,
            "owner",
            owner.session_epoch,
            &owner.member_key,
        );

        let refused = with_remembered_key(&store, &remote, &held, &slot(), NOW + 60_000).await;

        assert_eq!(
            reason_of(&refused),
            Some(RefusalReason::OrganizationOlder),
            "the resume: {refused:?}"
        );
        assert_eq!(
            contents(&store).await,
            before,
            "an organization read in this format was transformed again"
        );

        // the replayed row grants nothing: it verifies under no format this build reads, and the
        // only certificate mina holds is the member's the upgrade issued her.
        assert!(
            store.member(&pinned, "mina").await.is_err(),
            "the replayed format 1 row verified as a row of this format"
        );

        let certificates = store
            .live_certificates(&pinned, "mina")
            .await
            .expect("the certificates");

        assert_eq!(certificates.len(), 1);
        assert_eq!(certificates[0].ceiling, expected_effective("mina"));
    }

    /// **Ticket 25's second criterion.** The same organization, made to look older the same way,
    /// met by the owner on a machine that keeps no record of having read it in this format: a
    /// sign-in, a resume and a connect on the Turso account. Each refuses to transform it, since
    /// it holds a root certificate the organization key signed, and nothing is written.
    #[tokio::test]
    async fn without_that_record_a_root_the_organization_key_signed_refuses_the_transform() {
        let _turn = take_the_credential_store().await;
        let (older, store) = upgraded("a-root-refuses").await;
        let owner = older.person("owner");

        made_to_look_older(&older, &store).await;

        let before = contents(&store).await;

        assert_eq!(older.held.format, None);

        let refused = with_password(
            &store,
            &online(),
            &older.held,
            owner.username,
            owner.password,
            &slot(),
            NOW + 60_000,
        )
        .await;

        assert_eq!(
            reason_of(&refused),
            Some(RefusalReason::OrganizationOlder),
            "the sign-in: {refused:?}"
        );

        remember(
            ORGANIZATION_ID,
            "owner",
            owner.session_epoch,
            &owner.member_key,
        );

        let refused = with_remembered_key(&store, &online(), &older.held, &slot(), NOW).await;

        assert_eq!(
            reason_of(&refused),
            Some(RefusalReason::OrganizationOlder),
            "the resume: {refused:?}"
        );

        let refused = with_the_owners_password(
            &store,
            &online(),
            owner.username,
            owner.password,
            &Arc::new(Mutex::new(Some(ORGANIZATION_CREDENTIAL.to_string()))),
            NOW,
            || Error::Internal {
                message: "the pair opened nothing".to_string(),
            },
        )
        .await;

        assert_eq!(
            reason_of(&refused),
            Some(RefusalReason::OrganizationOlder),
            "the connect: {refused:?}"
        );
        assert_eq!(
            contents(&store).await,
            before,
            "an organization holding a root was transformed"
        );
    }

    /// **Ticket 25's fourth criterion, the stray row.** A `format` row written into an
    /// organization still in format 1's shape reads as unfinished: it is refused as older, a
    /// member's pull creates nothing in it, a member waits for the owner, and the owner's sign-in
    /// upgrades it. *It read as this format until ticket 25, and every sign-in failed on
    /// `role_id`.*
    #[tokio::test]
    async fn a_format_row_beside_format_ones_shape_reads_as_unfinished() {
        let older = older("stray-format").await;
        let store = older.open().await;

        store.write_format().await.expect("the stray row");

        assert_eq!(
            store.format().await.expect("the format"),
            Some(FORMAT_VERSION)
        );
        assert!(store.is_older().await.expect("the format"));
        assert_eq!(
            reason_of(&store.refuse_another_format().await),
            Some(RefusalReason::OrganizationOlder)
        );

        let before = contents(&store).await;

        assert!(
            !store.complete_schema().await.expect("the completion"),
            "a pull created tables in an organization still in format 1's shape"
        );

        let mina = older.person("mina");
        let refused = with_password(
            &store,
            &online(),
            &older.held_by("mina"),
            mina.username,
            mina.password,
            &slot(),
            NOW,
        )
        .await;

        assert_eq!(
            reason_of(&refused),
            Some(RefusalReason::OrganizationOlder),
            "{refused:?}"
        );
        assert_eq!(contents(&store).await, before, "a member wrote");

        let owner = older.person("owner");

        with_password(
            &store,
            &online(),
            &older.held,
            owner.username,
            owner.password,
            &slot(),
            NOW,
        )
        .await
        .expect("the owner's sign-in did not upgrade it");

        assert_upgraded(&store, &older, &older.pinned()).await;
    }

    /// **Ticket 25's fourth criterion, the dropped table.** An upgraded organization whose
    /// `format` table somebody dropped reads as older and carries nothing of format 1, so the
    /// upgrade's last step is all that is left, and it creates the table and writes the row:
    /// on a machine with no record of the format, and on one that has read it in this format.
    #[tokio::test]
    async fn a_dropped_format_table_is_created_by_the_last_step() {
        for known in [None, Some(FORMAT_VERSION)] {
            let (older, store) = upgraded("format-dropped").await;
            let owner = older.person("owner");

            run(&store, "DROP TABLE \"format\"", Vec::new()).await;

            assert!(store.is_older().await.expect("the format"), "{known:?}");
            assert!(
                !store
                    .carries_format_one()
                    .await
                    .expect("what is left of format 1"),
                "{known:?}"
            );

            with_password(
                &store,
                &online(),
                &HeldOrganization {
                    format: known,
                    ..older.held.clone()
                },
                owner.username,
                owner.password,
                &slot(),
                NOW + 60_000,
            )
            .await
            .unwrap_or_else(|error| panic!("{known:?}: the last step failed: {error}"));

            assert_upgraded(&store, &older, &older.pinned()).await;
        }
    }

    /// **Ticket 29's first criterion.** A `format` row set to 1, 0 or below on an upgraded
    /// organization, with nothing of format 1 left, reads as the shipped format where every table
    /// of it stands (ticket 53): no change is due, the owner's sign-in writes the row back and
    /// nothing else, takes no copy, and signs in, on a machine that has read the organization in
    /// this format and on one that has not. *Read as written after ticket 26, it made format 1's
    /// change due, which the machine's record or the root refused, and everybody was locked out;
    /// it read as format 2 until format 3 was added.*
    #[tokio::test]
    async fn a_format_row_below_two_with_nothing_of_format_one_left_is_written_back() {
        for row in [1, 0, -1] {
            for read_before in [false, true] {
                let (older, store) = upgraded(&format!("low-row-{row}-{read_before}")).await;
                let owner = older.person("owner");
                let held = if read_before {
                    read_in_this_format(&older.held)
                } else {
                    older.held.clone()
                };

                run(
                    &store,
                    "UPDATE \"format\" SET \"version\" = ?",
                    vec![turso::Value::Integer(row)],
                )
                .await;

                assert!(store.is_older().await.expect("the format"), "{row}");
                assert_eq!(
                    store
                        .format_as_it_stands(FORMAT_VERSION)
                        .await
                        .expect("the format"),
                    FORMAT_VERSION,
                    "{row}"
                );

                let before = contents_but_the_next(&store).await;
                let remote = online();
                let credential = slot();

                with_password(
                    &store,
                    &remote,
                    &held,
                    owner.username,
                    owner.password,
                    &credential,
                    NOW + 60_000,
                )
                .await
                .unwrap_or_else(|error| panic!("{row}, read before {read_before}: {error}"));

                assert_eq!(
                    store.format().await.expect("the format"),
                    Some(FORMAT_VERSION),
                    "{row}"
                );
                assert_eq!(
                    contents_but_the_next(&store).await,
                    before,
                    "{row}: more than the row was written"
                );
                assert_eq!(remote.asked(), vec!["push", "pull", "push"], "{row}");

                store
                    .refuse_another_format()
                    .await
                    .unwrap_or_else(|error| panic!("{row}: still refused: {error}"));
                sign_in_by_username(&store, &held, owner.username, owner.password, &credential)
                    .await
                    .unwrap_or_else(|error| panic!("{row}: the owner did not sign in: {error}"));
            }
        }
    }

    /// **Ticket 25's fifth criterion.** The owner's grant on the organization database lapsed, or
    /// gone: the upgrade has a credential minted on the owner's own account before it pushes, and
    /// that is the one it pushes and pulls with. A grant that lives is spent as it is, and nothing
    /// is minted.
    #[tokio::test]
    async fn a_lapsed_or_missing_owner_grant_is_renewed_on_the_owners_account_before_the_push() {
        const MINTED: &str = "a-credential-the-owners-account-minted";

        for case in ["lapsed", "missing", "living"] {
            let older = older(&format!("owner-grant-{case}")).await;
            let store = older.open().await;
            let owner = older.person("owner");
            let now = match case {
                "lapsed" => LAPSED,
                _ => NOW,
            };

            if case == "missing" {
                run(
                    &store,
                    "DELETE FROM \"grant\" WHERE \"member_id\" = 'owner' AND \"workspace_id\" = ?",
                    vec![text(ORGANIZATION_ID)],
                )
                .await;
            }

            let remote = online().minting(MINTED);
            let credential = slot();

            with_password(
                &store,
                &remote,
                &older.held,
                owner.username,
                owner.password,
                &credential,
                now,
            )
            .await
            .unwrap_or_else(|error| panic!("{case}: {error}"));

            let (asked, held) = match case {
                "living" => (
                    vec!["push", "pull", "copy", "push"],
                    ORGANIZATION_CREDENTIAL,
                ),
                _ => (vec!["mint", "push", "pull", "copy", "push"], MINTED),
            };

            assert_eq!(remote.asked(), asked, "{case}");
            assert_eq!(
                credential.lock().expect("the slot").as_deref(),
                Some(held),
                "{case}"
            );
            assert_eq!(
                store.format().await.expect("the format"),
                Some(FORMAT_VERSION),
                "{case}"
            );
        }
    }

    /// **Ticket 25's fifth criterion, the mint.** The production remote mints the way
    /// `setup::connect_existing` does: the organization's database, for four weeks, at full access,
    /// on the owner's account; and a machine holding no authority mints nothing.
    #[tokio::test]
    async fn the_owners_account_mints_what_the_connect_mints() {
        let platform = Arc::new(InMemoryPlatform::new("an-org"));

        platform.holding_unprotected("org-7f3a");

        let minted = ItsRemote {
            account: Some(Arc::clone(&platform)),
        }
        .minted("org-7f3a")
        .await;

        assert_eq!(minted.as_deref(), Some("token-for-org-7f3a-4w-full-access"));
        assert_eq!(
            platform.minted(),
            vec![(
                "org-7f3a".to_string(),
                crate::organization::setup::ORGANIZATION_CREDENTIAL_LIFETIME.to_string(),
                AccessLevel::FullAccess
            )]
        );
        assert_eq!(
            ItsRemote::<InMemoryPlatform> { account: None }
                .minted("org-7f3a")
                .await,
            None
        );
    }

    /// **Ticket 25's sixth criterion.** A member's machine whose pull was refused, with its own
    /// grant on the organization database lapsed or gone, is told it needs a new link from its
    /// organization, not that it waits for its owner; nothing is written. With a grant that lives,
    /// a refused pull is the offline case, and it waits for the owner as before; so does a lapsed
    /// grant whose pull went after all. The sentence in English and Arabic is held by the message
    /// tests, which require one for every reason.
    #[tokio::test]
    async fn a_member_whose_credential_is_lapsed_or_gone_is_told_it_needs_a_new_link() {
        for (case, pulls, reason) in [
            ("lapsed", false, RefusalReason::OrganizationCredentialLapsed),
            (
                "missing",
                false,
                RefusalReason::OrganizationCredentialLapsed,
            ),
            ("living", false, RefusalReason::OrganizationOlder),
            (
                "lapsed, the pull went",
                true,
                RefusalReason::OrganizationOlder,
            ),
        ] {
            let older = older("member-credential").await;
            let store = older.open().await;
            let mina = older.person("mina");
            let now = if case.starts_with("lapsed") {
                LAPSED
            } else {
                NOW
            };

            if case == "missing" {
                run(
                    &store,
                    "DELETE FROM \"grant\" WHERE \"member_id\" = 'mina' AND \"workspace_id\" = ?",
                    vec![text(ORGANIZATION_ID)],
                )
                .await;
            }

            let before = contents(&store).await;
            let refused = with_password(
                &store,
                &Answering::new(true, pulls),
                &older.held_by("mina"),
                mina.username,
                mina.password,
                &slot(),
                now,
            )
            .await;

            assert_eq!(reason_of(&refused), Some(reason), "{case}: {refused:?}");

            if reason == RefusalReason::OrganizationCredentialLapsed {
                assert!(
                    refused
                        .expect_err("refused")
                        .to_string()
                        .contains("needs a new link from its organization"),
                    "{case}"
                );
            }

            assert_eq!(contents(&store).await, before, "{case}: a member wrote");
        }
    }

    /// **Ticket 25's seventh criterion.** The owner's machine holds changes the old build
    /// captured, which a remote another of the owner's machines already reshaped refuses with
    /// the measured `Number of arguments mismatch`: the sign-in and the resume are refused with a
    /// reason of their own, saying that disconnecting and connecting again drops those changes,
    /// nothing is pulled, and nothing is written.
    #[tokio::test]
    async fn changes_a_reshaped_remote_refuses_give_their_own_reason_and_nothing_is_written() {
        let _turn = take_the_credential_store().await;
        let older = older("unsendable").await;
        let store = older.open().await;
        let owner = older.person("owner");
        let before = contents(&store).await;

        assert_eq!(
            classified("Number of arguments mismatch: expected 2, got 3"),
            Pushed::Unsendable
        );
        assert_eq!(classified("error sending request"), Pushed::DidNotGo);

        let remote = online().pushing(Pushed::Unsendable);
        let refused = with_password(
            &store,
            &remote,
            &older.held,
            owner.username,
            owner.password,
            &slot(),
            NOW,
        )
        .await;

        assert_eq!(
            reason_of(&refused),
            Some(RefusalReason::OrganizationChangesUnsendable),
            "{refused:?}"
        );
        assert!(
            refused
                .expect_err("refused")
                .to_string()
                .contains("disconnecting this machine and connecting it again drops those")
        );
        assert_eq!(remote.asked(), vec!["push"]);

        remember(
            ORGANIZATION_ID,
            "owner",
            owner.session_epoch,
            &owner.member_key,
        );

        let refused = with_remembered_key(
            &store,
            &online().pushing(Pushed::Unsendable),
            &older.held,
            &slot(),
            NOW,
        )
        .await;

        assert_eq!(
            reason_of(&refused),
            Some(RefusalReason::OrganizationChangesUnsendable),
            "the resume: {refused:?}"
        );
        assert_eq!(contents(&store).await, before, "something was written");
        assert!(store.is_older().await.expect("the format"));
    }

    /// **Ticket 25's eighth criterion.** The removed member's format 1 certificate carries an
    /// unsigned `revoked_at`. A workspace they signed under it is carried, and the upgrade
    /// re-signs it from the root; a grant, an invitation and a member row they signed under it
    /// are not.
    #[tokio::test]
    async fn a_workspace_row_is_carried_whatever_an_unsigned_revocation_says() {
        let older = older("revoked-workspace").await;
        let store = older.open().await;
        let owner = older.person("owner");
        let rafi = older.person("rafi");
        let rafis = older.certificate("rafi");
        let rhea = Person::new("rhea", "rhea.recruit", "member", 0, 0);

        assert!(
            rafis.revoked_at.is_some(),
            "the fixture's revocation is gone"
        );

        write_workspace(
            &store,
            &older.content_key,
            "east",
            WorkspaceAuthority {
                database_name: "ws-east",
                database_hostname: "ws-east-an-org.aws-eu-west-1.turso.io",
            },
            &rafi.signing,
            rafis,
        )
        .await;
        write_grant(
            &store,
            older.person("mina"),
            "east",
            "east-full",
            "full-access",
            &rafi.signing,
            rafis,
            false,
        )
        .await;
        write_invitation(&store, "invitation-rafi", "mina", rafi, rafis).await;
        write_member(
            &store,
            &older.content_key,
            &rhea,
            &rafi.signing,
            rafis,
            None,
            EARLIER,
        )
        .await;

        with_password(
            &store,
            &online(),
            &older.held,
            owner.username,
            owner.password,
            &slot(),
            NOW,
        )
        .await
        .expect("the upgrade");

        let pinned = older.pinned();

        assert!(
            store
                .workspaces(&pinned)
                .await
                .expect("the workspaces")
                .iter()
                .any(|workspace| workspace.id == "east"),
            "a workspace signed under a certificate with an unsigned revocation was dropped"
        );
        assert!(
            !store
                .grants(&pinned)
                .await
                .expect("the grants")
                .iter()
                .any(|grant| grant.workspace_id == "east"),
            "a grant signed under a revoked certificate was carried"
        );
        assert!(
            !store
                .invitations(&pinned)
                .await
                .expect("the invitations")
                .iter()
                .any(|invitation| invitation.id == "invitation-rafi"),
            "an invitation signed under a revoked certificate was carried"
        );
        assert!(
            !store
                .members(&pinned)
                .await
                .expect("the members")
                .iter()
                .any(|member| member.id == "rhea"),
            "a member row signed under a revoked certificate was carried"
        );
    }

    /// **Ticket 25's eleventh criterion.** A copy of the owner's member row, under another id and
    /// read first, opens with the owner's password as the owner's own does, signature and all,
    /// since `member.v2` never signed a member's id. The owner's row is the one signed under the
    /// format 1 certificate issued to that row, and the upgrade makes that one the owner.
    #[tokio::test]
    async fn where_the_owners_vault_opens_on_a_copy_the_owners_own_row_is_taken() {
        let older = older("vault-copy").await;
        let store = older.open().await;
        let owner = older.person("owner");

        run(
            &store,
            "INSERT INTO \"member\" SELECT 'a-copy', \"username_sealed\", \"public_key\", \
             \"signing_public_key\", \"sealed_secret_key\", \"sealed_content_key\", \"kdf_salt\", \
             \"kdf_params\", \"role\", \"permissions\", \"must_change_password\", \
             \"certificate_id\", \"signature\", ?, \"updated_at\", \"session_epoch\", \
             \"owner_seed_sealed\" FROM \"member\" WHERE \"id\" = 'owner'",
            vec![turso::Value::Integer(EARLIER - 1)],
        )
        .await;

        assert_eq!(
            store
                .format_one_members()
                .await
                .expect("the members")
                .first()
                .map(|member| member.id.as_str()),
            Some("a-copy"),
            "the copy is not read first; the test proves nothing"
        );

        let opened = vault_opened_by(
            &store,
            &TRANSITIONS[0],
            &older.pinned(),
            owner.username,
            owner.password,
        )
        .await
        .expect("the vaults")
        .expect("a vault opened");

        assert_eq!(opened.member_id, "owner");

        let credential = slot();

        with_password(
            &store,
            &online(),
            &older.held,
            owner.username,
            owner.password,
            &credential,
            NOW,
        )
        .await
        .expect("the upgrade");

        let members = store.members(&older.pinned()).await.expect("the members");

        assert_eq!(
            members
                .iter()
                .find(|member| member.id == "owner")
                .map(|member| member.role_id.as_str()),
            Some("owner")
        );
        assert_eq!(
            credential.lock().expect("the slot").as_deref(),
            Some(ORGANIZATION_CREDENTIAL),
            "the owner's own grant was not the one found"
        );
    }

    /// A change from the format this build ships to the one after it, which no build ships: a
    /// table of its own and one row in it (ticket 26), and readers of the shipped format that say
    /// they were asked (ticket 29).
    const NEXT: Transition = Transition {
        from: FORMAT_VERSION,
        name: "the next format",
        members: the_next_formats_members,
        signed_as_its_own: the_next_formats_own,
        grant: the_next_formats_grant,
        refused: nothing_refused,
        run: the_next_format,
        built: the_next_format_fresh,
        kept: &[],
    };

    /// The next format's one table.
    const NEXT_TABLE: &str = "CREATE TABLE \"next\" (\"id\" TEXT PRIMARY KEY NOT NULL)";

    thread_local! {
        /// How often the next format's readers were asked, on this test's thread.
        static READ_BY_THE_NEXT: Cell<usize> = const { Cell::new(0) };
    }

    /// The change that makes the shipped format, whose readers read it.
    fn the_shipped_formats_change() -> &'static Transition {
        TRANSITIONS.last().expect("a change of format")
    }

    /// Count one read through the next format's readers.
    fn read_by_the_next() {
        READ_BY_THE_NEXT.with(|reads| reads.set(reads.get() + 1));
    }

    /// The member rows of the shipped format, counted.
    fn the_next_formats_members(store: &OrganizationStore) -> Pending<'_, Vec<Unjudged>> {
        read_by_the_next();

        (the_shipped_formats_change().members)(store)
    }

    /// Whether a row of the shipped format is its member's own, counted.
    fn the_next_formats_own<'a>(
        sought: &'a Sought<'a>,
        secret: &'a MemberSecretKey,
    ) -> Pending<'a, bool> {
        read_by_the_next();

        (the_shipped_formats_change().signed_as_its_own)(sought, secret)
    }

    /// A member's grant in the shipped format, counted.
    fn the_next_formats_grant<'a>(
        sought: &'a Sought<'a>,
        organization_id: &'a str,
        owners_signing_key: Option<&'a [u8; 32]>,
    ) -> Pending<'a, Option<GrantRecord>> {
        read_by_the_next();

        (the_shipped_formats_change().grant)(sought, organization_id, owners_signing_key)
    }

    /// A check that refuses no directory.
    fn nothing_refused<'a>(_: &'a Upgrading<'a>) -> Pending<'a, Option<&'static str>> {
        Box::pin(async { Ok(None) })
    }

    /// The next format's table, and its one row.
    fn the_next_format<'a>(upgrading: &'a Upgrading<'a>) -> Pending<'a, ()> {
        Box::pin(async move {
            run(upgrading.store, NEXT_TABLE, Vec::new()).await;
            run(
                upgrading.store,
                "INSERT INTO \"next\" (\"id\") VALUES (?)",
                vec![text("next")],
            )
            .await;

            Ok(())
        })
    }

    /// A fresh organization of the next format: this build's, and the next format's table.
    fn the_next_format_fresh(connection: &turso::Connection) -> Pending<'_, ()> {
        Box::pin(async move {
            store::install(connection).await?;
            connection.execute(NEXT_TABLE, ()).await?;

            Ok(())
        })
    }

    /// The next format's writes, and a column it leaves behind on `machine`, which no fresh
    /// organization of the next format has.
    fn the_next_format_leaving_a_column<'a>(upgrading: &'a Upgrading<'a>) -> Pending<'a, ()> {
        Box::pin(async move {
            the_next_format(upgrading).await?;
            run(
                upgrading.store,
                "ALTER TABLE \"machine\" ADD COLUMN \"left_behind\" INTEGER",
                Vec::new(),
            )
            .await;

            Ok(())
        })
    }

    /// The next format's writes, and then a failure before the runner reaches the `format` row.
    fn the_next_format_cut_short<'a>(upgrading: &'a Upgrading<'a>) -> Pending<'a, ()> {
        Box::pin(async move {
            the_next_format(upgrading).await?;

            Err(Error::Internal {
                message: "the next format was cut short".to_string(),
            })
        })
    }

    /// A check that refuses every directory.
    fn every_directory_refused<'a>(_: &'a Upgrading<'a>) -> Pending<'a, Option<&'static str>> {
        Box::pin(async { Ok(Some("the next format refuses this directory")) })
    }

    /// Every change this build holds, and `next` after them.
    fn and_then(next: Transition) -> Vec<Transition> {
        TRANSITIONS.iter().copied().chain([next]).collect()
    }

    /// The contents of every table but `format` and `next`, which the next format writes.
    async fn contents_but_the_next(
        store: &OrganizationStore,
    ) -> Vec<(String, Vec<Vec<turso::Value>>)> {
        contents(store)
            .await
            .into_iter()
            .filter(|(table, _)| table != "format" && table != "next")
            .collect()
    }

    /// Walk `transitions` over `store` as the owner of `older`, on a machine that has read the
    /// organization in the format this build ships.
    async fn walked_by_the_owner(
        older: &Older,
        store: &OrganizationStore,
        transitions: &[Transition],
    ) -> Result<(), Error> {
        let opened = older.owners_vault();
        let signing_key = signing_key_of(&opened.secret).expect("the signing key");
        let key = older.organization_key.verifying_key();
        let upgrading = Upgrading {
            store,
            key: &key,
            organization_key: &older.organization_key,
            signing_key: &signing_key,
            opened: &opened,
            now: NOW + 60_000,
        };

        walked(
            &upgrading,
            &online(),
            transitions,
            ORGANIZATION_ID,
            Some(FORMAT_VERSION),
        )
        .await
    }

    /// **Ticket 26's fifth criterion.** A change from the shipped format to the next, registered
    /// under test only after every change this build holds, is walked by the same runner for an
    /// organization in the shipped format: it alone runs, inside the transaction, and the `format`
    /// row names the format after it. Nothing of an earlier change runs again, and the machine's
    /// record of the shipped format refuses nothing that starts there.
    #[tokio::test]
    async fn an_organization_in_the_shipped_format_is_walked_through_the_next_by_the_same_runner() {
        let (older, store) = upgraded("the-next-format").await;
        let before = contents_but_the_next(&store).await;

        assert_eq!(
            store
                .format_as_it_stands(FORMAT_VERSION)
                .await
                .expect("the format"),
            FORMAT_VERSION
        );

        walked_by_the_owner(&older, &store, &and_then(NEXT))
            .await
            .expect("the walk to the next format");

        assert_eq!(
            store.format().await.expect("the format"),
            Some(FORMAT_VERSION + 1)
        );
        assert_eq!(
            contents(&store)
                .await
                .into_iter()
                .find(|(table, _)| table == "next")
                .map(|(_, rows)| rows),
            Some(vec![vec![text("next")]]),
            "the next format's change did not run"
        );
        assert!(
            copies_in(&older)
                .iter()
                .any(|copy| copy.starts_with(&format!(
                    "format-{FORMAT_VERSION}-to-{}-",
                    FORMAT_VERSION + 1
                ))),
            "the runner took no copy before the next format: {:?}",
            copies_in(&older)
        );
        assert_eq!(
            contents_but_the_next(&store).await,
            before,
            "a change before the shipped format ran again"
        );
    }

    /// The next format cut short inside the runner's transaction leaves nothing, the `format` row
    /// included; and one whose own check refuses the directory writes nothing at all.
    #[tokio::test]
    async fn the_next_format_cut_short_or_refused_leaves_the_shipped_format_as_it_was() {
        let (older, store) = upgraded("the-next-format-refused").await;
        let before = contents(&store).await;
        let cut = walked_by_the_owner(
            &older,
            &store,
            &and_then(Transition {
                run: the_next_format_cut_short,
                ..NEXT
            }),
        )
        .await;

        assert!(
            matches!(&cut, Err(Error::Internal { message }) if message.contains("cut short")),
            "the walk was not cut short where the test cut it: {cut:?}"
        );
        assert_eq!(
            contents(&store).await,
            before,
            "the cut left something behind"
        );

        let refused = walked_by_the_owner(
            &older,
            &store,
            &and_then(Transition {
                refused: every_directory_refused,
                ..NEXT
            }),
        )
        .await;

        assert_eq!(
            reason_of(&refused),
            Some(RefusalReason::OrganizationOlder),
            "{refused:?}"
        );
        assert_eq!(contents(&store).await, before, "a refused change wrote");
    }

    /// **Ticket 33's first criterion.** A change that leaves a column behind is checked after it
    /// and the `format` row, inside the transaction: the organization is not what a fresh one of
    /// the format it arrives at is, so the whole walk is rolled back, the `format` row and the
    /// change's own table with it, and the refusal is `ShapeNotAsBuilt`, naming the table.
    #[tokio::test]
    async fn a_change_that_leaves_a_column_behind_is_rolled_back_and_refused() {
        let (older, store) = upgraded("a-column-left-behind").await;
        let before = contents(&store).await;
        let refused = walked_by_the_owner(
            &older,
            &store,
            &and_then(Transition {
                run: the_next_format_leaving_a_column,
                ..NEXT
            }),
        )
        .await;

        assert!(
            matches!(
                &refused,
                Err(Error::Refused { reason: RefusalReason::ShapeNotAsBuilt, message })
                    if message.contains("table machine is not as a fresh database has it")
            ),
            "{refused:?}"
        );
        assert_eq!(
            contents(&store).await,
            before,
            "the refused walk left something"
        );
        assert!(
            !store
                .columns_of("machine")
                .await
                .expect("the columns")
                .iter()
                .any(|column| column == "left_behind"),
            "the column was kept"
        );
        assert_eq!(
            store.format().await.expect("the format"),
            Some(FORMAT_VERSION)
        );

        walked_by_the_owner(&older, &store, &and_then(NEXT))
            .await
            .expect("the same walk without the column left behind");
    }

    /// **Ticket 33's second criterion, as ticket 38 compares it.** The format 1 organization
    /// upgraded by its owner's sign-in passes the check. Its `member` table, reshaped in place, is
    /// recorded by the engine otherwise than a fresh organization records it (its added columns
    /// last, with defaults), and compares equal all the same, by its columns: no statement is
    /// declared for it.
    #[tokio::test]
    async fn the_format_one_organization_upgraded_is_as_a_fresh_one_is_built() {
        let (_, store) = upgraded("checked-from-format-one").await;
        let fresh_database = turso::Builder::new_local(":memory:")
            .build()
            .await
            .expect("an in-memory engine");
        let fresh_connection = fresh_database.connect().expect("a connection");

        (TRANSITIONS[0].built)(&fresh_connection)
            .await
            .expect("a fresh organization");

        let recorded = member_statement(store.connection()).await;
        let fresh = member_statement(&fresh_connection).await;

        assert_ne!(
            schema::normalised(&recorded),
            schema::normalised(&fresh),
            "the reshaped member table reads as a fresh one's statement, so this test no longer \
             shows that the check compares structure"
        );

        checked(&store, TRANSITIONS, FORMAT_VERSION)
            .await
            .expect("the upgraded organization is as a fresh one is built");
    }

    /// The statement `connection` records for the `member` table.
    async fn member_statement(connection: &turso::Connection) -> String {
        let mut rows = connection
            .query(
                "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'member'",
                (),
            )
            .await
            .expect("the member table");

        match rows
            .next()
            .await
            .expect("a row")
            .map(|row| row.get_value(0))
        {
            Some(Ok(turso::Value::Text(statement))) => statement,
            other => panic!("the member table's statement: {other:?}"),
        }
    }

    /// **Ticket 29's third criterion, the owner.** The owner's sign-in, handed every change this
    /// build holds and a test-only next one, walks an organization in the shipped format to the
    /// next: the next format's own readers find the vault and the owner's grant, a copy is taken,
    /// the change runs, and the `format` row names the format after it. Nothing of an earlier
    /// change runs again.
    #[tokio::test]
    async fn the_owners_sign_in_walks_an_organization_in_the_shipped_format_to_the_next() {
        let (older, store) = upgraded("next-by-sign-in").await;
        let owner = older.person("owner");
        let before = contents_but_the_next(&store).await;
        let remote = online();
        let credential = slot();

        READ_BY_THE_NEXT.with(|reads| reads.set(0));

        with_password_over(
            &and_then(NEXT),
            &store,
            &remote,
            &read_in_this_format(&older.held),
            owner.username,
            owner.password,
            &credential,
            NOW + 60_000,
        )
        .await
        .expect("the owner's sign-in did not walk to the next format");

        assert!(
            READ_BY_THE_NEXT.with(Cell::get) > 0,
            "the vault and the grant were not read through the next format's readers"
        );
        assert_eq!(
            credential.lock().expect("the slot").as_deref(),
            Some(ORGANIZATION_CREDENTIAL),
            "the owner's own grant was not the one found"
        );
        assert_eq!(remote.asked(), vec!["push", "pull", "copy", "push"]);
        assert_eq!(
            store.format().await.expect("the format"),
            Some(FORMAT_VERSION + 1)
        );
        assert_eq!(
            contents(&store)
                .await
                .into_iter()
                .find(|(table, _)| table == "next")
                .map(|(_, rows)| rows),
            Some(vec![vec![text("next")]]),
            "the next format's change did not run"
        );
        assert!(
            copies_in(&older)
                .iter()
                .any(|copy| copy.starts_with(&format!(
                    "format-{FORMAT_VERSION}-to-{}-",
                    FORMAT_VERSION + 1
                ))),
            "the sign-in took no copy before the next format: {:?}",
            copies_in(&older)
        );
        assert_eq!(
            contents_but_the_next(&store).await,
            before,
            "a change before the shipped format ran again"
        );
    }

    /// **Ticket 29's third criterion, the member.** A member's sign-in over the same list, on an
    /// organization in the shipped format, pulls with the grant the next format's readers found
    /// and waits for its owner, writing nothing; once the owner's sign-in on another machine has
    /// walked it to the next format, the member's pull brings that and the sign-in follows.
    #[tokio::test]
    async fn a_members_sign_in_waits_for_the_next_format_and_follows_once_the_owner_has() {
        let (older, store) = upgraded("next-member").await;
        let mina = older.person("mina");
        let transitions = and_then(NEXT);
        let before = contents(&store).await;
        let credential = slot();
        let remote = MemberPull {
            older: &older,
            transitions: &transitions,
            slot: Arc::clone(&credential),
            owner_upgraded: false,
            pulled_with: Mutex::new(Vec::new()),
        };
        let refused = with_password_over(
            &transitions,
            &store,
            &remote,
            &older.held_by("mina"),
            mina.username,
            mina.password,
            &credential,
            NOW + 60_000,
        )
        .await;

        assert_eq!(
            reason_of(&refused),
            Some(RefusalReason::OrganizationOlder),
            "{refused:?}"
        );
        assert_eq!(
            *remote.pulled_with.lock().expect("the record"),
            vec![Some(MINAS_CREDENTIAL.to_string())],
            "the member did not pull with their own grant"
        );
        assert_eq!(contents(&store).await, before, "a member wrote");

        let credential = slot();
        let remote = MemberPull {
            older: &older,
            transitions: &transitions,
            slot: Arc::clone(&credential),
            owner_upgraded: true,
            pulled_with: Mutex::new(Vec::new()),
        };

        with_password_over(
            &transitions,
            &store,
            &remote,
            &older.held_by("mina"),
            mina.username,
            mina.password,
            &credential,
            NOW + 60_000,
        )
        .await
        .expect("the member's sign-in did not follow the owner to the next format");

        assert_eq!(
            *remote.pulled_with.lock().expect("the record"),
            vec![Some(MINAS_CREDENTIAL.to_string())]
        );
        assert_eq!(
            store.format().await.expect("the format"),
            Some(FORMAT_VERSION + 1)
        );
    }

    /// The name of every copy on this machine of the organization `older` holds.
    fn copies_in(older: &Older) -> Vec<String> {
        let directory = backup::directory_of(&older.directory, &format!("org-{ORGANIZATION_ID}"));
        let mut names: Vec<String> = std::fs::read_dir(directory)
            .map(|entries| {
                entries
                    .flatten()
                    .map(|entry| entry.file_name().to_string_lossy().into_owned())
                    .collect()
            })
            .unwrap_or_default();

        names.sort();
        names
    }

    /// **Ticket 27's third criterion.** The owner's upgrade copies the organization before it
    /// changes anything: the copy on this machine, opened as a plain SQLite file, holds every table
    /// and row the organization held before and none of the changes, and the account the machine
    /// holds has a protected copy seeded from the organization database. The copy comes after the
    /// pull and before the push of the upgrade.
    #[tokio::test]
    async fn the_owners_upgrade_copies_the_organization_as_it_stood_before_changing_it() {
        let older = older("copied").await;
        let store = older.open().await;
        let owner = older.person("owner");
        let platform = Arc::new(InMemoryPlatform::new("an-org"));

        platform.holding_unprotected("org-7f3a");

        let before = contents(&store).await;
        let remote = online().holding(&platform);

        with_password(
            &store,
            &remote,
            &older.held,
            owner.username,
            owner.password,
            &slot(),
            NOW,
        )
        .await
        .expect("the upgrade");

        assert_eq!(remote.asked(), vec!["push", "pull", "copy", "push"]);
        assert_eq!(
            copies_in(&older),
            vec![format!("format-1-to-{FORMAT_VERSION}-{NOW}.sqlite")]
        );

        let copy = backup::contents_of(
            &backup::directory_of(&older.directory, "org-7f3a")
                .join(format!("format-1-to-{FORMAT_VERSION}-{NOW}.sqlite")),
        )
        .await;

        assert_eq!(before.len(), FORMAT_ONE_SCHEMA.len());
        assert_eq!(copy, before, "the copy is not the organization as it stood");
        assert_ne!(
            contents(&store).await,
            copy,
            "the upgrade changed nothing, so the copy proves nothing"
        );

        let name = crate::backup::remote_name(
            "org-7f3a",
            &format!("format-1-to-{FORMAT_VERSION}"),
            NOW / 1000,
        );

        assert_eq!(
            platform.copies(),
            vec![("org-7f3a".to_string(), name.clone())]
        );
        assert!(
            platform
                .databases()
                .iter()
                .any(|database| database.name == name && database.delete_protection),
            "the copy on the account is not protected"
        );
    }

    /// **Ticket 27's fourth criterion.** A copy that cannot be written on this machine refuses the
    /// upgrade with `CopyNotTaken`, naming the directory, and the organization is as it was: still
    /// of format 1, every row unchanged, and nothing asked of the account.
    #[tokio::test]
    async fn a_copy_that_cannot_be_written_refuses_the_upgrade_and_changes_nothing() {
        let older = older("copy-refused").await;
        let store = older.open().await;
        let owner = older.person("owner");
        let platform = Arc::new(InMemoryPlatform::new("an-org"));

        platform.holding_unprotected("org-7f3a");

        // a file where the directory of copies would go, so nothing can be made under it.
        std::fs::write(older.directory.join(backup::DIRECTORY_NAME), b"in the way")
            .expect("the obstacle");

        let before = contents(&store).await;
        let remote = online().holding(&platform);
        let refused = with_password(
            &store,
            &remote,
            &older.held,
            owner.username,
            owner.password,
            &slot(),
            NOW,
        )
        .await;

        assert_eq!(
            reason_of(&refused),
            Some(RefusalReason::CopyNotTaken),
            "{refused:?}"
        );
        assert!(
            refused.expect_err("refused").to_string().contains(
                &backup::directory_of(&older.directory, "org-7f3a")
                    .display()
                    .to_string()
            ),
            "the refusal does not name the directory"
        );
        assert_eq!(remote.asked(), vec!["push", "pull"]);
        assert!(store.is_older().await.expect("the format"));
        assert_eq!(contents(&store).await, before, "a refused upgrade wrote");
        assert!(platform.copies().is_empty());
    }

    /// **Ticket 27's fifth criterion.** A copy the account refuses is logged, as
    /// `backup.remoteCopyRefused`, and the upgrade goes on with the copy on this machine.
    #[tokio::test]
    async fn a_copy_the_account_refuses_leaves_the_upgrade_going_on() {
        let older = older("remote-copy-refused").await;
        let store = older.open().await;
        let owner = older.person("owner");
        let platform = Arc::new(InMemoryPlatform::new("an-org"));

        platform.holding_unprotected("org-7f3a");
        platform.refuse_next(
            crate::sync::turso::platform::PlatformError::AccountRefused {
                what: "copy the database",
            },
        );

        let remote = online().holding(&platform);

        with_password(
            &store,
            &remote,
            &older.held,
            owner.username,
            owner.password,
            &slot(),
            NOW,
        )
        .await
        .expect("a refused copy on the account stopped the upgrade");

        assert_eq!(remote.asked(), vec!["push", "pull", "copy", "push"]);
        assert!(platform.copies().is_empty());
        assert_eq!(
            copies_in(&older),
            vec![format!("format-1-to-{FORMAT_VERSION}-{NOW}.sqlite")]
        );
        assert_upgraded(&store, &older, &older.pinned()).await;
    }
}
