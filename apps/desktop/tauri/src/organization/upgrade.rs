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
//! been read; what it takes from them is the vault and nothing else.
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
//! ships ([`walked`]), with the `format` row last, then the push.
//!
//! **A copy is taken before the transaction** (ticket 27). Once every change due has said it may
//! run, and before the first write, the organization as it stands after the pull is copied to a
//! file of its own under the data directory, labelled `format-<from>-to-<to>` (`backup.rs`), and
//! where this machine holds the owner's Turso account, to a protected database there as well
//! ([`Replication::copied`]). A local copy that cannot be written refuses the upgrade with
//! `CopyNotTaken`, and nothing is written; a copy the account refuses is logged, and the upgrade
//! goes on. The runner takes it, so every change of format listed after this one is copied too.

use crate::{
    backup, diagnostics,
    error::{Error, RefusalReason},
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
    store::{OrganizationStore, grant_authority, waits_for_its_owner},
    transition::{
        TRANSITIONS, Transition, Upgrading,
        two::{Judge, signed_as_its_own},
    },
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
    if !store.is_older().await? {
        return Ok(());
    }

    let pinned = verifying_key_of(held)?;
    let opened = vault_opened_by(store, &settled(store, &pinned).await?, username, password)
        .await?
        .ok_or_else(|| refused_by_name(&held.name))?;

    upgrade(
        store,
        remote,
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
    if !store.is_older().await? {
        return Ok(());
    }

    let member_id = held.member_id.as_deref().ok_or_else(waits_for_its_owner)?;
    let (filed_epoch, member_key) = remembered(&held.id, member_id)?;
    let member = store
        .format_one_members()
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
    if !store.is_older().await? {
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
    let opened = vault_opened_by(store, &key, username, password)
        .await?
        .ok_or_else(refused)?;

    upgrade(
        store,
        remote,
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
/// they lie.
///
/// **Every row is tried**, a removed one and one still waiting on its invitation link included:
/// which vault is the owner's is decided by the key it derives, never by a column beside it, so a
/// `must_change_password` somebody wrote onto the owner's row hides nothing. What anybody else's
/// vault opens is a member's wait for the owner, and past the upgrade the ordinary sign-in refuses
/// what it refuses.
///
/// **Where more than one row's vault opens, the owner's row is the one they signed as their own**
/// (ticket 25): its format 1 signature verifies under the format 1 certificate `key` issued to that
/// row's member, naming the key the vault derives ([`signed_as_its_own`]). A member holding the
/// credential can copy the owner's vault onto a row of their own, signature and all, since
/// `member.v2` never signed a member's id; what they cannot copy is a certificate issued to that
/// row. Where none of them is, the first is taken, as before, and the copies are logged.
async fn vault_opened_by(
    store: &OrganizationStore,
    key: &[u8; VERIFYING_KEY_BYTES],
    username: &str,
    password: &str,
) -> Result<Option<Opened>, Error> {
    let wanted = username.trim().to_lowercase();
    let mut opening = Vec::new();

    for member in store.format_one_members().await? {
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
        let certificates = store.format_one_certificates().await?;

        if let Some(own) = opening
            .iter()
            .position(|(member, secret)| signed_as_its_own(key, &certificates, member, secret))
        {
            let (member, secret) = opening.swap_remove(own);

            return Ok(Some(Opened {
                member_id: member.id,
                secret,
            }));
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
/// gone, then, for the owner alone, a push and a pull, every change of format [`walked`] in one
/// transaction, and a push of what it wrote.
#[allow(clippy::too_many_arguments)]
async fn upgrade(
    store: &OrganizationStore,
    remote: &impl Replication,
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
        let grant = own_grant(store, organization_id, &key, opened, owners_signing_key).await?;

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
        return follow_the_owner(store, remote, reach).await;
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
    if !store.is_older().await? {
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
        TRANSITIONS,
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
/// (ticket 26). The upgrade walks [`TRANSITIONS`]; a test hands in a list of its own.
///
/// **The format it is in is 1 wherever anything of format 1 is left, and otherwise the `format`
/// row** (`OrganizationStore::format_as_it_stands`, which says why, and what no row reads as). An
/// organization already in the last format is walked through nothing, and its row is all that is
/// written.
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
    let from = store.format_as_it_stands().await?;
    let to = transitions.len() as i64 + 1;
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
        remote.copied(&database, &label, upgrading.now).await;
    }

    in_one_transaction(store, async {
        for transition in &due {
            (transition.run)(upgrading).await?;
        }

        store.write_format_version(to).await
    })
    .await
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
/// credential its own grant held, and goes on where what arrived is this format or a newer one,
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
) -> Result<(), Error> {
    let pulled = remote.pull(store).await;

    if pulled && !store.is_older().await? {
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

/// What the grant of `opened`'s member on the organization database holds, where one verifies:
/// the credential their replica pulls with, and when it dies.
///
/// `owners_signing_key` is the owner's, where `opened` is the owner's vault: their certificate is
/// judged by its key alone, so an unsigned `revoked_at` on it revokes nothing.
async fn own_grant(
    store: &OrganizationStore,
    organization_id: &str,
    key: &[u8; VERIFYING_KEY_BYTES],
    opened: &Opened,
    owners_signing_key: Option<[u8; VERIFYING_KEY_BYTES]>,
) -> Result<Option<OwnGrant>, Error> {
    let directory = store.format_one_directory().await?;
    let (certificates, revocations) = store.chain_rows_if_any().await?;
    let role_rows = store.role_rows_if_any().await?;
    let judge = Judge::new(
        key,
        &directory,
        owners_signing_key.as_ref(),
        &certificates,
        &revocations,
        &role_rows,
    );
    let Some(grant) = directory.grants.iter().find(|grant| {
        grant.record.member_id == opened.member_id && grant.record.workspace_id == organization_id
    }) else {
        return Ok(None);
    };

    if judge
        .row(
            &grant.certificate_id,
            grant_authority(&grant.record),
            &grant.signature,
        )
        .is_err()
    {
        return Ok(None);
    }

    let token = String::from_utf8(unseal_with_secret_key(
        &opened.secret,
        &grant.record.sealed_credential,
    )?)
    .map_err(|_| Error::Integrity {
        message: "a sealed credential is not text".to_string(),
    })?;

    Ok(Some(OwnGrant {
        token,
        expires_at: grant
            .record
            .credential_expires_at
            .as_deref()
            .and_then(|at| at.parse::<i64>().ok()),
    }))
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
        collections::HashMap,
        path::{Path, PathBuf},
        sync::{Arc, Mutex},
    };

    use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD as BASE64URL};
    use serde_json::json;

    use super::{
        ItsRemote, Opened, Pushed, Replication, classified, signing_key_of, vault_opened_by,
        walked, with_password, with_remembered_key, with_the_owners_password,
    };
    use crate::{
        backup,
        error::{Error, RefusalReason},
        keyring::take_the_credential_store,
        organization::{
            HeldOrganization,
            authority::{
                AdministratorKey, Authority, Chain, FormatOneCertificate, FormatOneMember,
                FormatOneRow, GrantAuthority, InvitationAuthority, MarkAuthority, OrganizationKey,
                SuccessionAuthority, WorkspaceAuthority, issue_format_one_certificate,
                sign_format_one, sign_succession,
            },
            connect,
            invite::rename_member,
            link::Locator,
            permission::{self, Flag, MANAGER_ROLE, MEMBER_ROLE, OWNER_ROLE},
            role::{follow_succession, in_one_transaction},
            session::{
                CredentialSlot, Resumption, refused_by_name, remember, resume, sign_in_by_username,
            },
            setup::{ADMINISTRATOR_KEY_PURPOSE, Remote, connect_existing, owner_key_from},
            store::{FORMAT_VERSION, OrganizationStore, RoleRecord, Signer, SuccessionRecord},
            transition::{
                Pending, TRANSITIONS, Transition, Upgrading,
                two::{FORMAT_ONE_ACTS, Step, applied, carried_by, planned},
            },
            vault::{
                ContentKey, KdfParams, MemberKey, MemberSecretKey, Vault,
                create_vault_with_secret_and_key, generate_content_key, open_content, seal_content,
                seal_to_public_key,
            },
            workspace::grant_workspace,
        },
        persisted::Persisted,
        sync::{
            RemoteSyncStore,
            test::server::{ScriptedResponse, ScriptedServer},
            turso::{
                discovery::McpEndpoint,
                platform::{AccessLevel, InMemoryPlatform},
            },
        },
    };

    const ORGANIZATION_ID: &str = "7f3a";
    const NOW: i64 = 1_758_000_000_000;
    const EARLIER: i64 = 1_757_000_000_000;
    const ORGANIZATION_CREDENTIAL: &str = "the-organization-credential";
    /// mina's own grant on the organization database: a credential of her own, so a test can tell
    /// which grant a machine pulled with.
    const MINAS_CREDENTIAL: &str = "minas-organization-credential";

    /// The schema of format 1, as `origin/main` creates it: every table the build before effort
    /// 838 made, the role word and the seven-act mask on the member row, and
    /// `administrator_certificate` with its unsigned `revoked_at`. Written out rather than read
    /// from anywhere, because nothing in this build writes it any more.
    const FORMAT_ONE_SCHEMA: [&str; 11] = [
        "CREATE TABLE IF NOT EXISTS \"organization\" (\
            \"id\" TEXT PRIMARY KEY NOT NULL, \
            \"name_sealed\" BLOB NOT NULL, \
            \"verifying_key\" BLOB NOT NULL, \
            \"remote_url\" TEXT NOT NULL, \
            \"created_at\" INTEGER NOT NULL)",
        "CREATE TABLE IF NOT EXISTS \"member\" (\
            \"id\" TEXT PRIMARY KEY NOT NULL, \
            \"username_sealed\" BLOB NOT NULL, \
            \"public_key\" BLOB NOT NULL, \
            \"signing_public_key\" BLOB NOT NULL, \
            \"sealed_secret_key\" BLOB NOT NULL, \
            \"sealed_content_key\" BLOB NOT NULL, \
            \"kdf_salt\" BLOB NOT NULL, \
            \"kdf_params\" TEXT NOT NULL, \
            \"role\" TEXT NOT NULL, \
            \"permissions\" INTEGER NOT NULL, \
            \"must_change_password\" INTEGER NOT NULL, \
            \"certificate_id\" TEXT NOT NULL, \
            \"signature\" BLOB NOT NULL, \
            \"created_at\" INTEGER NOT NULL, \
            \"updated_at\" INTEGER NOT NULL, \
            \"session_epoch\" INTEGER NOT NULL DEFAULT 0, \
            \"owner_seed_sealed\" BLOB)",
        "CREATE TABLE IF NOT EXISTS \"administrator_certificate\" (\
            \"id\" TEXT PRIMARY KEY NOT NULL, \
            \"member_id\" TEXT NOT NULL, \
            \"signing_public_key\" BLOB NOT NULL, \
            \"signature_by_organization_key\" BLOB NOT NULL, \
            \"issued_at\" TEXT NOT NULL, \
            \"revoked_at\" TEXT)",
        "CREATE TABLE IF NOT EXISTS \"workspace\" (\
            \"id\" TEXT PRIMARY KEY NOT NULL, \
            \"name_sealed\" BLOB NOT NULL, \
            \"database_name\" TEXT NOT NULL, \
            \"database_hostname\" TEXT NOT NULL, \
            \"schema_version\" INTEGER NOT NULL, \
            \"certificate_id\" TEXT NOT NULL, \
            \"signature\" BLOB NOT NULL, \
            \"created_at\" INTEGER NOT NULL, \
            \"updated_at\" INTEGER NOT NULL)",
        "CREATE TABLE IF NOT EXISTS \"grant\" (\
            \"member_id\" TEXT NOT NULL, \
            \"workspace_id\" TEXT NOT NULL, \
            \"sealed_credential\" BLOB NOT NULL, \
            \"access_level\" TEXT NOT NULL, \
            \"credential_expires_at\" TEXT, \
            \"certificate_id\" TEXT NOT NULL, \
            \"signature\" BLOB NOT NULL, \
            PRIMARY KEY (\"member_id\", \"workspace_id\"))",
        "CREATE TABLE IF NOT EXISTS \"invitation\" (\
            \"id\" TEXT PRIMARY KEY NOT NULL, \
            \"member_id\" TEXT NOT NULL, \
            \"expires_at\" INTEGER NOT NULL, \
            \"consumed_at\" INTEGER, \
            \"sealed_secret\" BLOB NOT NULL, \
            \"issued_by\" TEXT NOT NULL, \
            \"certificate_id\" TEXT NOT NULL, \
            \"signature\" BLOB NOT NULL, \
            \"created_at\" INTEGER NOT NULL)",
        "CREATE TABLE IF NOT EXISTS \"migration_lease\" (\
            \"workspace_id\" TEXT PRIMARY KEY NOT NULL, \
            \"holder_member_id\" TEXT NOT NULL, \
            \"expires_at\" INTEGER NOT NULL)",
        "CREATE TABLE IF NOT EXISTS \"machine_link\" (\
            \"id\" TEXT PRIMARY KEY NOT NULL, \
            \"member_id\" TEXT NOT NULL, \
            \"expires_at\" INTEGER NOT NULL, \
            \"consumed_at\" INTEGER, \
            \"created_at\" INTEGER NOT NULL)",
        "CREATE TABLE IF NOT EXISTS \"machine\" (\
            \"id\" TEXT PRIMARY KEY NOT NULL, \
            \"member_id\" TEXT, \
            \"seen_at\" INTEGER NOT NULL, \
            \"created_at\" INTEGER NOT NULL)",
        "CREATE TABLE IF NOT EXISTS \"succession\" (\
            \"id\" TEXT PRIMARY KEY NOT NULL, \
            \"offered_member_id\" TEXT NOT NULL, \
            \"offered_by\" TEXT NOT NULL, \
            \"offered_at\" INTEGER NOT NULL, \
            \"old_verifying_key\" BLOB NOT NULL, \
            \"new_verifying_key\" BLOB, \
            \"accepted_at\" INTEGER, \
            \"signature\" BLOB NOT NULL)",
        "CREATE TABLE IF NOT EXISTS \"mark\" (\
            \"id\" TEXT PRIMARY KEY NOT NULL, \
            \"image_sealed\" BLOB NOT NULL, \
            \"media_type\" TEXT NOT NULL, \
            \"updated_by\" TEXT NOT NULL, \
            \"updated_at\" INTEGER NOT NULL, \
            \"certificate_id\" TEXT NOT NULL, \
            \"signature\" BLOB NOT NULL)",
    ];

    // the seven acts of format 1, as `origin/main`'s `permission::Administration` numbered them.
    const INVITE_MEMBER: i64 = 1 << 0;
    const REMOVE_MEMBER: i64 = 1 << 1;
    const CHANGE_ROLE: i64 = 1 << 2;
    const RENAME_WORKSPACE: i64 = 1 << 3;
    const RENAME_MEMBER: i64 = 1 << 5;
    const GRANT_WORKSPACE: i64 = 1 << 6;

    /// The cheapest vault cost Argon2id takes, so a test seals in milliseconds.
    fn test_cost() -> KdfParams {
        KdfParams {
            memory_kib: 1024,
            iterations: 2,
            lanes: 1,
        }
    }

    /// A directory of this test's own under the system's temporary directory.
    fn scratch(name: &str) -> PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|elapsed| elapsed.as_nanos())
            .unwrap_or_default();
        let directory = std::env::temp_dir().join(format!("rentable-upgrade-{name}-{nanos:x}"));
        std::fs::create_dir_all(&directory).expect("scratch directory");

        directory
    }

    /// A credential slot holding nothing yet.
    fn slot() -> CredentialSlot {
        Arc::new(Mutex::new(None))
    }

    /// A remote that answers every push and every pull as it is told, mints what it is told to on
    /// the owner's account, copies on the account it holds, and says which were asked for, in
    /// order.
    struct Answering {
        push: Pushed,
        pull: bool,
        mint: Option<&'static str>,
        account: Option<Arc<InMemoryPlatform>>,
        asked: Mutex<Vec<&'static str>>,
    }

    impl Answering {
        /// A remote answering every push with `push` and every pull with `pull`, on a machine
        /// that holds no authority to mint with.
        fn new(push: bool, pull: bool) -> Self {
            Self {
                push: if push { Pushed::Went } else { Pushed::DidNotGo },
                pull,
                mint: None,
                account: None,
                asked: Mutex::new(Vec::new()),
            }
        }

        /// The same remote, on a machine holding `account`, which the copy is made on.
        fn holding(self, account: &Arc<InMemoryPlatform>) -> Self {
            Self {
                account: Some(Arc::clone(account)),
                ..self
            }
        }

        /// The same remote, answering every push as `push`.
        fn pushing(self, push: Pushed) -> Self {
            Self { push, ..self }
        }

        /// The same remote, on a machine whose account mints `token`.
        fn minting(self, token: &'static str) -> Self {
            Self {
                mint: Some(token),
                ..self
            }
        }

        /// Which of push, pull and mint were asked for, in order.
        fn asked(&self) -> Vec<&'static str> {
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
    fn online() -> Answering {
        Answering::new(true, true)
    }

    /// A remote a member's machine pulls from, which says what credential the pull was made with,
    /// and where `owner_upgraded` is set, brings the owner's upgrade with it: what arrives is the
    /// owner's sign-in on another machine, run here on the same database, which is what the two
    /// replicas are to each other once a push and a pull have run between them.
    struct MemberPull<'a> {
        older: &'a Older,
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

                with_password(
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

    /// One person in the older organization: their vault, the key it was opened with, and the
    /// signing key its secret derives.
    struct Person {
        id: &'static str,
        username: &'static str,
        password: &'static str,
        vault: Vault,
        secret: MemberSecretKey,
        member_key: MemberKey,
        signing: AdministratorKey,
        role: &'static str,
        permissions: i64,
        session_epoch: i64,
        must_change_password: bool,
    }

    impl Person {
        /// A person of the fixture, with a vault sealed under the password their id gives them.
        fn new(
            id: &'static str,
            username: &'static str,
            role: &'static str,
            permissions: i64,
            session_epoch: i64,
        ) -> Self {
            let password = match id {
                "owner" => "the owners own password",
                "adam" => "a password adam chose",
                "lena" => "a password lena chose",
                "mina" => "a password mina chose",
                _ => "a password nobody types",
            };
            let (vault, secret, member_key) =
                create_vault_with_secret_and_key(password, test_cost()).expect("a vault");
            let signing = AdministratorKey::from_bytes(
                &secret
                    .derive_seed(ADMINISTRATOR_KEY_PURPOSE)
                    .expect("the signing seed"),
            );

            Self {
                id,
                username,
                password,
                vault,
                secret,
                member_key,
                signing,
                role,
                permissions,
                session_epoch,
                must_change_password: id == "pia",
            }
        }
    }

    /// An organization of format 1 on this machine, as the build before effort 838 left it, and
    /// what the test needs to act in it.
    struct Older {
        directory: PathBuf,
        path: PathBuf,
        held: HeldOrganization,
        organization_key: OrganizationKey,
        content_key: ContentKey,
        people: HashMap<&'static str, Person>,
        certificates: HashMap<&'static str, FormatOneCertificate>,
    }

    impl Older {
        /// The person of the fixture with this id.
        fn person(&self, id: &str) -> &Person {
            self.people.get(id).expect("a person of the fixture")
        }

        /// The format 1 certificate the fixture issued this person.
        fn certificate(&self, id: &str) -> &FormatOneCertificate {
            self.certificates
                .get(id)
                .expect("a certificate of the fixture")
        }

        /// The organization key a machine of this organization pinned.
        fn pinned(&self) -> [u8; 32] {
            self.organization_key.verifying_key()
        }

        /// The record a machine this person signed in on keeps.
        fn held_by(&self, id: &str) -> HeldOrganization {
            HeldOrganization {
                member_id: Some(id.to_string()),
                ..self.held.clone()
            }
        }

        /// The organization's replica on this machine, with no remote.
        async fn open(&self) -> OrganizationStore {
            OrganizationStore::open(&self.path, None, || async {
                Ok::<String, turso::Error>(String::new())
            })
            .await
            .expect("the replica")
        }

        /// What the owner's vault opens, as the sign-in hands it to the upgrade.
        fn owners_vault(&self) -> Opened {
            Opened {
                member_id: "owner".to_string(),
                secret: owner_secret(self),
            }
        }
    }

    /// The secret the owner's password opens their vault to.
    fn owner_secret(older: &Older) -> MemberSecretKey {
        let owner = older.person("owner");

        crate::organization::vault::open_vault(owner.password, &owner.vault)
            .expect("the owner's vault")
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

    /// Run one statement on the replica, as the old build or somebody around the store would.
    async fn run(store: &OrganizationStore, sql: &str, values: Vec<turso::Value>) {
        store
            .connection()
            .execute(sql, values)
            .await
            .unwrap_or_else(|error| panic!("{sql}: {error}"));
    }

    /// A text value for a statement.
    fn text(value: &str) -> turso::Value {
        turso::Value::Text(value.to_string())
    }

    /// A blob value for a statement.
    fn bytes(value: &[u8]) -> turso::Value {
        turso::Value::Blob(value.to_vec())
    }

    /// Write a format 1 certificate row as the old build wrote it.
    async fn write_certificate(store: &OrganizationStore, certificate: &FormatOneCertificate) {
        run(
            store,
            "INSERT INTO \"administrator_certificate\" VALUES (?, ?, ?, ?, ?, ?)",
            vec![
                text(&certificate.id),
                text(&certificate.member_id),
                bytes(&certificate.signing_public_key),
                bytes(&certificate.signature_by_organization_key),
                text(&certificate.issued_at),
                certificate
                    .revoked_at
                    .as_deref()
                    .map_or(turso::Value::Null, text),
            ],
        )
        .await;
    }

    /// A member row of format 1, signed `member.v2` under `certificate` by `signer`.
    #[allow(clippy::too_many_arguments)]
    async fn write_member(
        store: &OrganizationStore,
        content_key: &ContentKey,
        person: &Person,
        signer: &AdministratorKey,
        certificate: &FormatOneCertificate,
        owner_seed_sealed: Option<&[u8]>,
        updated_at: i64,
    ) {
        let signature = sign_format_one(
            signer,
            certificate,
            FormatOneRow::Member(FormatOneMember {
                public_key: &person.vault.public_key,
                signing_public_key: &person.signing.verifying_key(),
                role: person.role,
                permissions: person.permissions,
                owner_seed_sealed,
            }),
        );

        run(
            store,
            "INSERT INTO \"member\" VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            vec![
                text(person.id),
                bytes(
                    &seal_content(
                        content_key,
                        "member.username_sealed",
                        person.username.as_bytes(),
                    )
                    .expect("the username"),
                ),
                bytes(&person.vault.public_key),
                bytes(&person.signing.verifying_key()),
                bytes(&person.vault.sealed_secret_key),
                bytes(
                    &seal_to_public_key(&person.vault.public_key, &content_key.to_bytes())
                        .expect("the content key"),
                ),
                bytes(&person.vault.kdf_salt),
                text(&person.vault.kdf_params.encode()),
                text(person.role),
                turso::Value::Integer(person.permissions),
                turso::Value::Integer(i64::from(person.must_change_password)),
                text(&certificate.id),
                bytes(&signature),
                turso::Value::Integer(EARLIER),
                turso::Value::Integer(updated_at),
                turso::Value::Integer(person.session_epoch),
                owner_seed_sealed.map_or(turso::Value::Null, bytes),
            ],
        )
        .await;
    }

    /// A grant row as format 1 signs it, under `certificate` by `signer`, or with its signature
    /// broken where it is `forged`: what the fixture writes, and what a machine still on the old
    /// build writes after the upgrade.
    #[allow(clippy::too_many_arguments)]
    async fn write_grant(
        store: &OrganizationStore,
        member: &Person,
        workspace_id: &str,
        credential: &str,
        access_level: &str,
        signer: &AdministratorKey,
        certificate: &FormatOneCertificate,
        forged: bool,
    ) {
        let sealed = seal_to_public_key(&member.vault.public_key, credential.as_bytes())
            .expect("the credential");
        let mut signature = sign_format_one(
            signer,
            certificate,
            FormatOneRow::Unchanged(Authority::Grant(GrantAuthority {
                member_id: member.id,
                workspace_id,
                sealed_credential: &sealed,
                access_level,
                credential_expires_at: Some("1760000000000"),
            })),
        );

        if forged {
            signature[0] ^= 0xff;
        }

        run(
            store,
            "INSERT OR REPLACE INTO \"grant\" \
             (\"member_id\", \"workspace_id\", \"sealed_credential\", \"access_level\", \
              \"credential_expires_at\", \"certificate_id\", \"signature\") \
             VALUES (?, ?, ?, ?, ?, ?, ?)",
            vec![
                text(member.id),
                text(workspace_id),
                bytes(&sealed),
                text(access_level),
                text("1760000000000"),
                text(&certificate.id),
                bytes(&signature),
            ],
        )
        .await;
    }

    /// A workspace row as format 1 signs it.
    async fn write_workspace(
        store: &OrganizationStore,
        content_key: &ContentKey,
        id: &str,
        workspace: WorkspaceAuthority<'_>,
        signer: &AdministratorKey,
        certificate: &FormatOneCertificate,
    ) {
        run(
            store,
            "INSERT OR REPLACE INTO \"workspace\" \
             (\"id\", \"name_sealed\", \"database_name\", \"database_hostname\", \
              \"schema_version\", \"certificate_id\", \"signature\", \"created_at\", \
              \"updated_at\") \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            vec![
                text(id),
                bytes(
                    &seal_content(content_key, "workspace.name_sealed", id.as_bytes())
                        .expect("the name"),
                ),
                text(workspace.database_name),
                text(workspace.database_hostname),
                turso::Value::Integer(9),
                text(&certificate.id),
                bytes(&sign_format_one(
                    signer,
                    certificate,
                    FormatOneRow::Unchanged(Authority::Workspace(workspace)),
                )),
                turso::Value::Integer(EARLIER),
                turso::Value::Integer(EARLIER),
            ],
        )
        .await;
    }

    /// An invitation row as format 1 signs it.
    async fn write_invitation(
        store: &OrganizationStore,
        id: &str,
        member_id: &str,
        issued_by: &Person,
        certificate: &FormatOneCertificate,
    ) {
        let pending_until = NOW + 7 * 24 * 60 * 60 * 1000;

        run(
            store,
            "INSERT OR REPLACE INTO \"invitation\" \
             (\"id\", \"member_id\", \"expires_at\", \"consumed_at\", \"sealed_secret\", \
              \"issued_by\", \"certificate_id\", \"signature\", \"created_at\") \
             VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?)",
            vec![
                text(id),
                text(member_id),
                turso::Value::Integer(pending_until),
                bytes(b"the issuer's sealed copy"),
                text(issued_by.id),
                text(&certificate.id),
                bytes(&sign_format_one(
                    &issued_by.signing,
                    certificate,
                    FormatOneRow::Unchanged(Authority::Invitation(InvitationAuthority {
                        id,
                        member_id,
                        expires_at: pending_until,
                    })),
                )),
                turso::Value::Integer(EARLIER),
            ],
        )
        .await;
    }

    /// The mark as format 1 signs it.
    async fn write_mark(
        store: &OrganizationStore,
        content_key: &ContentKey,
        image: &[u8],
        set_by: &Person,
        certificate: &FormatOneCertificate,
        updated_at: i64,
    ) {
        let image = seal_content(content_key, "mark.image_sealed", image).expect("the mark");

        run(
            store,
            "INSERT OR REPLACE INTO \"mark\" \
             (\"id\", \"image_sealed\", \"media_type\", \"updated_by\", \"updated_at\", \
              \"certificate_id\", \"signature\") \
             VALUES ('mark', ?, 'image/png', ?, ?, ?, ?)",
            vec![
                bytes(&image),
                text(set_by.id),
                turso::Value::Integer(updated_at),
                text(&certificate.id),
                bytes(&sign_format_one(
                    &set_by.signing,
                    certificate,
                    FormatOneRow::Unchanged(Authority::Mark(MarkAuthority {
                        image_sealed: &image,
                        media_type: "image/png",
                        updated_by: set_by.id,
                        updated_at,
                    })),
                )),
            ],
        )
        .await;
    }

    /// The organization every test here starts from, in the main-branch shape: the owner; an
    /// administrator the owner narrowed, standing offered the organization; a member granted
    /// administration acts; a plain member; a removed member, whose certificate is revoked; a
    /// member whose invitation is pending; a workspace with a full-access and a read-only grant;
    /// the mark; and a member row and a grant that do not verify.
    async fn older(name: &str) -> Older {
        let directory = scratch(name);
        let path = OrganizationStore::replica_path(&directory.join("app.db"), ORGANIZATION_ID);
        let store = OrganizationStore::open(&path, None, || async {
            Ok::<String, turso::Error>(String::new())
        })
        .await
        .expect("the replica");

        for statement in FORMAT_ONE_SCHEMA {
            run(&store, statement, Vec::new()).await;
        }

        let owner = Person::new("owner", "olivia.owner", "owner", FORMAT_ONE_ACTS, 3);
        let organization_key = owner_key_from(&owner.secret).expect("the organization key");
        let content_key = generate_content_key().expect("a content key");
        let people = [
            owner,
            // narrowed by the owner: no renaming or granting a workspace, and no reset.
            Person::new(
                "adam",
                "adam.admin",
                "administrator",
                INVITE_MEMBER | REMOVE_MEMBER | CHANGE_ROLE | RENAME_MEMBER,
                5,
            ),
            Person::new(
                "lena",
                "lena.lead",
                "member",
                RENAME_WORKSPACE | GRANT_WORKSPACE,
                1,
            ),
            Person::new("mina", "mina.member", "member", 0, 2),
            Person::new("rafi", "rafi.removed", "removed", 0, 4),
            Person::new("pia", "pia.pending", "member", 0, 0),
            Person::new(
                "mallory",
                "mallory.forged",
                "administrator",
                FORMAT_ONE_ACTS,
                0,
            ),
        ]
        .into_iter()
        .map(|person| (person.id, person))
        .collect::<HashMap<_, _>>();
        let certificate = |id: &str| {
            issue_format_one_certificate(
                &organization_key,
                &format!("cert-{id}"),
                id,
                &people[id].signing.verifying_key(),
                &EARLIER.to_string(),
            )
        };
        let owners = certificate("owner");
        let adams = certificate("adam");
        let lenas = certificate("lena");
        // the removal revoked it by writing the column, which is all format 1 asked.
        let rafis = FormatOneCertificate {
            revoked_at: Some((EARLIER + 10).to_string()),
            ..certificate("rafi")
        };

        run(
            &store,
            "INSERT INTO \"organization\" VALUES (?, ?, ?, ?, ?)",
            vec![
                text(ORGANIZATION_ID),
                bytes(
                    &seal_content(&content_key, "organization.name_sealed", b"Acme Rentals")
                        .expect("the name"),
                ),
                bytes(&organization_key.verifying_key()),
                text("libsql://org-7f3a-an-org.aws-eu-west-1.turso.io"),
                turso::Value::Integer(EARLIER),
            ],
        )
        .await;

        for issued in [&owners, &adams, &lenas, &rafis] {
            write_certificate(&store, issued).await;
        }

        let owner = &people["owner"];
        let adam = &people["adam"];
        let lena = &people["lena"];
        let mina = &people["mina"];
        // the organization offered to adam and not accepted yet: the seal on his row and the
        // succession row the organization key signed.
        let seal = seal_to_public_key(&adam.vault.public_key, &organization_key.to_bytes())
            .expect("the offer's seal");

        write_member(
            &store,
            &content_key,
            owner,
            &owner.signing,
            &owners,
            None,
            EARLIER,
        )
        .await;
        write_member(
            &store,
            &content_key,
            adam,
            &owner.signing,
            &owners,
            Some(&seal),
            EARLIER,
        )
        .await;
        write_member(
            &store,
            &content_key,
            lena,
            &owner.signing,
            &owners,
            None,
            EARLIER,
        )
        .await;
        write_member(
            &store,
            &content_key,
            mina,
            &adam.signing,
            &adams,
            None,
            EARLIER,
        )
        .await;
        write_member(
            &store,
            &content_key,
            &people["rafi"],
            &owner.signing,
            &owners,
            None,
            EARLIER + 10,
        )
        .await;
        write_member(
            &store,
            &content_key,
            &people["pia"],
            &adam.signing,
            &adams,
            None,
            EARLIER,
        )
        .await;
        // signed with mallory's own key under adam's certificate, which does not name it.
        write_member(
            &store,
            &content_key,
            &people["mallory"],
            &people["mallory"].signing,
            &adams,
            None,
            EARLIER,
        )
        .await;

        store
            .write_succession(&SuccessionRecord {
                id: "offer".to_string(),
                offered_member_id: "adam".to_string(),
                offered_by: "owner".to_string(),
                offered_at: EARLIER,
                old_verifying_key: organization_key.verifying_key(),
                new_verifying_key: None,
                accepted_at: None,
                signature: sign_succession(
                    &organization_key,
                    SuccessionAuthority {
                        id: "offer",
                        offered_member_id: "adam",
                        offered_by: "owner",
                        offered_at: EARLIER,
                        old_verifying_key: &organization_key.verifying_key(),
                        new_verifying_key: None,
                        accepted_at: None,
                    },
                ),
            })
            .await
            .expect("the offer");

        write_workspace(
            &store,
            &content_key,
            "north",
            WorkspaceAuthority {
                database_name: "ws-north",
                database_hostname: "ws-north-an-org.aws-eu-west-1.turso.io",
            },
            &owner.signing,
            &owners,
        )
        .await;

        // the organization's own database, for the owner and for mina, whose remembered session
        // pulls with it; north at full access for lena, and for mina granted by lena under her
        // own certificate; north read-only for adam, which only the owner mints; and a grant
        // somebody wrote for lena at the owner's name, which does not verify.
        write_grant(
            &store,
            owner,
            ORGANIZATION_ID,
            ORGANIZATION_CREDENTIAL,
            "full-access",
            &owner.signing,
            &owners,
            false,
        )
        .await;
        write_grant(
            &store,
            mina,
            ORGANIZATION_ID,
            MINAS_CREDENTIAL,
            "full-access",
            &owner.signing,
            &owners,
            false,
        )
        .await;
        write_grant(
            &store,
            lena,
            "north",
            "north-full",
            "full-access",
            &owner.signing,
            &owners,
            false,
        )
        .await;
        write_grant(
            &store,
            mina,
            "north",
            "north-full",
            "full-access",
            &lena.signing,
            &lenas,
            false,
        )
        .await;
        write_grant(
            &store,
            adam,
            "north",
            "north-read",
            "read-only",
            &owner.signing,
            &owners,
            false,
        )
        .await;
        write_grant(
            &store,
            lena,
            ORGANIZATION_ID,
            ORGANIZATION_CREDENTIAL,
            "full-access",
            &owner.signing,
            &owners,
            true,
        )
        .await;

        write_invitation(&store, "invitation-pia", "pia", adam, &adams).await;
        write_mark(&store, &content_key, b"a seal", adam, &adams, EARLIER).await;

        drop(store);

        let held = HeldOrganization {
            id: ORGANIZATION_ID.to_string(),
            name: "Acme Rentals".to_string(),
            verifying_key: BASE64URL.encode(organization_key.verifying_key()),
            remote_url: "libsql://org-7f3a-an-org.aws-eu-west-1.turso.io".to_string(),
            machine_id: String::new(),
            member_id: Some("owner".to_string()),
            role: Some("owner".to_string()),
            joined_at: EARLIER,
            format: None,
        };
        let certificates = [
            ("owner", owners),
            ("adam", adams),
            ("lena", lenas),
            ("rafi", rafis),
        ]
        .into_iter()
        .collect();

        Older {
            directory,
            path,
            held,
            organization_key,
            content_key,
            people,
            certificates,
        }
    }

    /// A copy of the replica as another machine would hold it, opened as a second store that
    /// holds no key but the verifying key the machine pinned.
    async fn another_machine(from: &Path) -> OrganizationStore {
        let elsewhere = scratch("elsewhere");

        for entry in std::fs::read_dir(from).expect("the directory") {
            let path = entry.expect("an entry").path();
            let name = path
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or_default()
                .to_string();

            if name.starts_with("org-") {
                std::fs::copy(&path, elsewhere.join(&name)).expect("the copy");
            }
        }

        OrganizationStore::open(
            &OrganizationStore::replica_path(&elsewhere.join("app.db"), ORGANIZATION_ID),
            None,
            || async { Err(turso::Error::Misuse("no remote".into())) },
        )
        .await
        .expect("their replica did not open")
    }

    /// The reason a result was refused for, where it was refused.
    fn reason_of<T>(result: &Result<T, Error>) -> Option<RefusalReason> {
        match result {
            Err(Error::Refused { reason, .. }) => Some(*reason),
            _ => None,
        }
    }

    /// The mask of these flags.
    fn mask(flags: &[Flag]) -> i64 {
        permission::mask_of(flags)
    }

    /// Every record flag, delete included: what the old build let every member do.
    fn records() -> i64 {
        mask(&permission::RECORD_FLAGS)
    }

    /// What each member of the fixture ends with, as the plan's *Migration* maps them.
    fn expected_effective(id: &str) -> i64 {
        match id {
            "owner" => OWNER_ROLE.mask,
            "adam" => {
                mask(&[
                    Flag::InviteMember,
                    Flag::RemoveMember,
                    Flag::AssignRole,
                    Flag::OverrideMember,
                    Flag::RenameMember,
                    Flag::ManageMark,
                    Flag::ManageRoles,
                ]) | records()
            }
            "lena" => mask(&[Flag::RenameWorkspace, Flag::GrantWorkspace]) | records(),
            "mina" | "pia" => records(),
            _ => 0,
        }
    }

    /// Everything a finished upgrade of the fixture leaves, read as this format reads it, here and
    /// on another machine holding no key but the pinned one: format 2 and nothing of format 1;
    /// every member where they could stand before; one live certificate each, under the id format
    /// 1 gave it; and every workspace, grant, invitation and the mark verified.
    async fn assert_upgraded(store: &OrganizationStore, older: &Older, pinned: &[u8; 32]) {
        assert_eq!(
            store.format().await.expect("the format"),
            Some(FORMAT_VERSION)
        );
        assert!(!store.is_older().await.expect("the format"));
        assert!(
            !store
                .carries_format_one()
                .await
                .expect("what is left of format 1")
        );

        let tables = store.tables().await.expect("the tables");

        for table in crate::organization::store::TABLES {
            assert!(
                tables.iter().any(|name| name == table),
                "{table} is missing"
            );
        }

        assert!(
            !tables
                .iter()
                .any(|name| name == "administrator_certificate")
        );

        let roles = store.roles(pinned).await.expect("the roles");

        assert_eq!(
            roles
                .iter()
                .map(|role| (role.id.as_str(), role.mask, role.rank))
                .collect::<Vec<_>>(),
            vec![
                ("manager", MANAGER_ROLE.mask, MANAGER_ROLE.rank),
                ("member", MEMBER_ROLE.mask, MEMBER_ROLE.rank),
            ]
        );

        let members = store.members(pinned).await.expect("the members");
        let mut standing = members
            .iter()
            .map(|member| {
                (
                    member.id.as_str(),
                    member.role_id.as_str(),
                    member.effective,
                    member.removed_at,
                )
            })
            .collect::<Vec<_>>();

        standing.sort();

        assert_eq!(
            standing,
            vec![
                ("adam", "manager", expected_effective("adam"), None),
                ("lena", "manager", expected_effective("lena"), None),
                ("mina", "member", expected_effective("mina"), None),
                ("owner", "owner", expected_effective("owner"), None),
                ("pia", "member", expected_effective("pia"), None),
                ("rafi", "member", 0, Some(EARLIER + 10)),
            ]
        );
        assert!(members.iter().all(|member| member.covered));
        assert!(
            members
                .iter()
                .all(|member| member.owner_seed_sealed.is_none())
        );

        for member in &members {
            if member.id != "mallory" {
                assert_eq!(
                    member.session_epoch,
                    older.person(&member.id).session_epoch,
                    "{}",
                    member.id
                );
            }
        }

        let (certificates, revocations) = store.chain_rows().await.expect("the chain");
        let chain = Chain::new(pinned, &certificates, &revocations);
        let mut ids = certificates
            .iter()
            .map(|certificate| certificate.id.as_str())
            .collect::<Vec<_>>();

        ids.sort_unstable();

        assert_eq!(
            ids,
            vec![
                "cert-adam",
                "cert-lena",
                "cert-mina",
                "cert-owner",
                "cert-pia"
            ]
        );

        for certificate in &certificates {
            chain
                .live(&certificate.id)
                .unwrap_or_else(|error| panic!("{} does not verify: {error}", certificate.id));
        }

        let grants = store.grants(pinned).await.expect("the grants");

        assert_eq!(
            grants
                .iter()
                .map(|grant| (
                    grant.member_id.as_str(),
                    grant.workspace_id.as_str(),
                    grant.access_level.as_str()
                ))
                .collect::<Vec<_>>(),
            vec![
                ("adam", "north", "read-only"),
                ("lena", "north", "full-access"),
                ("mina", ORGANIZATION_ID, "full-access"),
                ("mina", "north", "full-access"),
                ("owner", ORGANIZATION_ID, "full-access"),
            ]
        );
        assert_eq!(
            store
                .workspaces(pinned)
                .await
                .expect("the workspaces")
                .iter()
                .map(|workspace| workspace.id.as_str())
                .collect::<Vec<_>>(),
            vec!["north"]
        );
        assert_eq!(
            store
                .invitations(pinned)
                .await
                .expect("the invitations")
                .iter()
                .map(|invitation| (invitation.id.as_str(), invitation.member_id.as_str()))
                .collect::<Vec<_>>(),
            vec![("invitation-pia", "pia")]
        );

        let mark = store.mark(pinned).await.expect("the mark").expect("a mark");

        assert_eq!(
            open_content(&older.content_key, "mark.image_sealed", &mark.image_sealed)
                .expect("the image"),
            b"a seal"
        );
        assert!(
            store
                .successions()
                .await
                .expect("the successions")
                .iter()
                .all(|succession| succession.accepted_at.is_some()),
            "a standing offer was not withdrawn"
        );
    }

    /// The mapping itself, one case per kind of member format 1 had: exactly what each could do,
    /// every record act included, as a role and an override.
    #[test]
    fn each_member_of_format_one_keeps_exactly_what_they_could_do() {
        let owner = carried_by("owner", FORMAT_ONE_ACTS, true);

        assert_eq!(
            (owner.role_id.as_str(), owner.override_mask, owner.effective),
            ("owner", 0, OWNER_ROLE.mask)
        );

        // an administrator the owner narrowed: their acts, `changeRole` as two, every record act,
        // and the mark and the roles.
        let narrowed = carried_by(
            "administrator",
            INVITE_MEMBER | CHANGE_ROLE | RENAME_MEMBER,
            false,
        );

        assert_eq!(narrowed.role_id, "manager");
        assert_eq!(
            narrowed.effective,
            mask(&[
                Flag::InviteMember,
                Flag::AssignRole,
                Flag::OverrideMember,
                Flag::RenameMember,
                Flag::ManageMark,
                Flag::ManageRoles,
            ]) | records()
        );
        assert_eq!(
            permission::effective(MANAGER_ROLE.mask, narrowed.override_mask),
            narrowed.effective
        );

        // an administrator with every act is a manager with nothing switched.
        let whole = carried_by("administrator", FORMAT_ONE_ACTS, false);

        assert_eq!(whole.effective, MANAGER_ROLE.mask);
        assert_eq!(whole.override_mask, 0);

        // a member granted administration acts: a manager holding exactly those, and the records.
        let lead = carried_by("member", GRANT_WORKSPACE | RENAME_WORKSPACE, false);

        assert_eq!(lead.role_id, "manager");
        assert_eq!(
            lead.effective,
            mask(&[Flag::GrantWorkspace, Flag::RenameWorkspace]) | records()
        );
        assert_eq!(
            permission::effective(MANAGER_ROLE.mask, lead.override_mask),
            lead.effective
        );

        // a plain member: the member role, with delete switched on for every kind.
        let member = carried_by("member", 0, false);

        assert_eq!(member.role_id, "member");
        assert_eq!(member.effective, records());
        assert_eq!(
            member.override_mask,
            mask(&[
                Flag::DeleteComplex,
                Flag::DeleteUnit,
                Flag::DeleteTenant,
                Flag::DeleteContract,
                Flag::DeletePayment,
            ])
        );

        // a removed member: a member, removed, with nothing.
        let removed = carried_by("removed", 0, false);

        assert_eq!(
            (
                removed.role_id.as_str(),
                removed.override_mask,
                removed.removed
            ),
            ("member", 0, true)
        );

        // **ticket 23's seventh criterion**: a row saying owner that is not the key holder's is
        // read as the old build read it, its acts off its own `permissions` column, and the mark
        // and the roles an administrator keeps.
        let forged_owner = carried_by("owner", INVITE_MEMBER, false);

        assert_eq!(forged_owner.role_id, "manager");
        assert_eq!(
            forged_owner.effective,
            mask(&[Flag::InviteMember, Flag::ManageMark, Flag::ManageRoles]) | records()
        );
        assert_eq!(
            carried_by("owner", 0, false).effective,
            mask(&[Flag::ManageMark, Flag::ManageRoles]) | records()
        );

        // nothing any of them ends with is the owner's.
        for standing in [narrowed, whole, lead, member, forged_owner] {
            assert_eq!(
                standing.effective & mask(&permission::OWNER_ONLY),
                0,
                "{standing:?}"
            );
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

    /// **Ticket 22's fifth criterion.** An upgrade cut short on this machine before the `format`
    /// row, inside its transaction, leaves the organization exactly as it was, still older, and
    /// the owner's next sign-in completes it.
    #[tokio::test]
    async fn an_upgrade_cut_short_in_its_transaction_leaves_nothing_and_the_next_sign_in_completes_it()
     {
        let older = older("cut-short").await;
        let store = older.open().await;
        let owner = older.person("owner");
        let before = contents(&store).await;
        let opened = older.owners_vault();
        let key = signing_key_of(&opened.secret).expect("the signing key");
        let plan = planned(&store, &older.organization_key, &key, &opened, NOW)
            .await
            .expect("the plan");
        // the plan is everything before the `format` row, which the runner writes after it.
        let before_the_format = &plan.steps;
        let cut = in_one_transaction(&store, async {
            applied(&store, &key, plan.root.as_ref(), before_the_format).await?;

            Err::<(), _>(Error::Internal {
                message: "the upgrade was cut short before the format row".to_string(),
            })
        })
        .await;

        assert!(
            matches!(&cut, Err(Error::Internal { message }) if message.contains("cut short")),
            "the upgrade was not cut short where the test cut it: {cut:?}"
        );
        assert!(store.is_older().await.expect("the format"));
        assert_eq!(store.format().await.expect("the format"), None);
        assert_eq!(
            contents(&store).await,
            before,
            "the cut left something behind"
        );

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
        .expect("the next sign-in did not complete the upgrade");

        assert_upgraded(&store, &older, &older.pinned()).await;
    }

    /// **Ticket 23's third criterion.** Every state the upgrade's order can leave behind it, on
    /// this machine or on a remote a push reached part of: each prefix of its writes, from the
    /// first statement of the reshape to everything but the `format` row, committed as it stands.
    ///
    /// Each is recognised as unfinished: it reads as older, never as format 2 and never as a
    /// stranger's. A member's sign-in is told the organization waits for its owner, and writes
    /// nothing. The owner's next sign-in, a minute later and from any machine, since nothing in it
    /// is this machine's, finishes it into exactly what a whole upgrade leaves, and runs no
    /// statement of the reshape twice; except, since ticket 25, a state that already holds the
    /// root and still carries format 1, which no machine transforms and the upgrading machine's
    /// own push completes.
    #[tokio::test]
    async fn every_partial_state_the_upgrade_can_leave_is_recognised_and_the_owner_finishes_it() {
        let steps = {
            let older = older("partial-plan").await;
            let store = older.open().await;
            let opened = older.owners_vault();
            let key = signing_key_of(&opened.secret).expect("the signing key");

            planned(&store, &older.organization_key, &key, &opened, NOW)
                .await
                .expect("the plan")
                .steps
                .len()
        };

        // every step of the plan written is everything but the `format` row, which the runner
        // writes after it.
        for written in 1..=steps {
            let older = older(&format!("partial-{written}")).await;
            let store = older.open().await;
            let opened = older.owners_vault();
            let key = signing_key_of(&opened.secret).expect("the signing key");
            let plan = planned(&store, &older.organization_key, &key, &opened, NOW)
                .await
                .expect("the plan");

            assert_eq!(plan.steps.len(), steps);

            applied(&store, &key, plan.root.as_ref(), &plan.steps[..written])
                .await
                .unwrap_or_else(|error| panic!("{written}: the partial upgrade: {error}"));

            assert!(
                store.is_older().await.expect("the format"),
                "{written}: a partial upgrade read as this format"
            );
            assert_eq!(
                reason_of(&store.refuse_another_format().await),
                Some(RefusalReason::OrganizationOlder),
                "{written}"
            );

            // a member meeting it waits for the owner, and nothing is written.
            let before = contents(&store).await;
            let mina = older.person("mina");
            let refused = with_password(
                &store,
                &online(),
                &older.held_by("mina"),
                mina.username,
                mina.password,
                &slot(),
                NOW + 60_000,
            )
            .await;

            assert_eq!(
                reason_of(&refused),
                Some(RefusalReason::OrganizationOlder),
                "{written}: {refused:?}"
            );
            assert_eq!(contents(&store).await, before, "{written}: a member wrote");

            // the owner finishes it, running only what the table still needs.
            let reshape_done = plan
                .steps
                .iter()
                .take(written)
                .filter(|step| matches!(step, Step::Reshape(_)))
                .count();
            let reshape_left = store
                .format_one_reshape()
                .await
                .expect("what the reshape still needs")
                .len();

            assert_eq!(
                reshape_done + reshape_left,
                plan.steps
                    .iter()
                    .filter(|step| matches!(step, Step::Reshape(_)))
                    .count(),
                "{written}: a statement of the reshape would run twice"
            );

            let owner = older.person("owner");
            let rooted = plan.steps[..written].iter().any(
                |step| matches!(step, Step::Certificate(certificate) if certificate.is_root()),
            );
            let carries = store
                .carries_format_one()
                .await
                .expect("what is left of format 1");
            let finished = with_password(
                &store,
                &online(),
                &older.held,
                owner.username,
                owner.password,
                &slot(),
                NOW + 60_000,
            )
            .await;

            if rooted && carries {
                // **ticket 25's second criterion narrows this one**: past the root, a machine
                // that has not read the organization in this format transforms nothing, since a
                // root is what an organization of this format holds, and a member can make one
                // look older. The rest arrives with the push of the machine that made the upgrade,
                // which holds all of it.
                assert_eq!(
                    reason_of(&finished),
                    Some(RefusalReason::OrganizationOlder),
                    "{written}: {finished:?}"
                );
                assert_eq!(
                    contents(&store).await,
                    before,
                    "{written}: the owner's machine transformed an organization holding a root"
                );

                applied(&store, &key, plan.root.as_ref(), &plan.steps[written..])
                    .await
                    .unwrap_or_else(|error| panic!("{written}: the rest of the upgrade: {error}"));
                store
                    .write_format()
                    .await
                    .unwrap_or_else(|error| panic!("{written}: the format row: {error}"));
            } else {
                finished.unwrap_or_else(|error| {
                    panic!("{written}: the owner did not finish it: {error}")
                });
            }

            assert_upgraded(&store, &older, &older.pinned()).await;

            drop(store);

            let elsewhere = another_machine(&older.directory).await;

            assert_upgraded(&elsewhere, &older, &older.pinned()).await;
        }
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
        let copy = format!("org-7f3a-format-1-to-2-{}", NOW / 1000);

        assert_eq!(
            copies_in(&older),
            vec![format!("format-1-to-2-{NOW}.sqlite")]
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
        run(&store, "UPDATE \"format\" SET \"version\" = 3", Vec::new()).await;

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

    /// What a member holding the credential does to an upgraded organization to make it look
    /// older, every step of it through the database: the `format` row deleted; format 1's
    /// certificate table made again, holding the owner's genuine format 1 certificate; the role
    /// word and the mask put back on the member table; and a promotion mina once held under
    /// format 1, administrator with every act, signed by the owner, replayed onto her row.
    async fn made_to_look_older(older: &Older, store: &OrganizationStore) {
        let owner = older.person("owner");
        let mina = older.person("mina");

        run(store, "DELETE FROM \"format\"", Vec::new()).await;
        run(store, FORMAT_ONE_SCHEMA[2], Vec::new()).await;
        write_certificate(store, older.certificate("owner")).await;
        run(
            store,
            "ALTER TABLE \"member\" ADD COLUMN \"role\" TEXT NOT NULL DEFAULT 'member'",
            Vec::new(),
        )
        .await;
        run(
            store,
            "ALTER TABLE \"member\" ADD COLUMN \"permissions\" INTEGER NOT NULL DEFAULT 0",
            Vec::new(),
        )
        .await;

        let promotion = sign_format_one(
            &owner.signing,
            older.certificate("owner"),
            FormatOneRow::Member(FormatOneMember {
                public_key: &mina.vault.public_key,
                signing_public_key: &mina.signing.verifying_key(),
                role: "administrator",
                permissions: FORMAT_ONE_ACTS,
                owner_seed_sealed: None,
            }),
        );

        run(
            store,
            "UPDATE \"member\" SET \"role\" = 'administrator', \"permissions\" = ?, \
             \"certificate_id\" = 'cert-owner', \"signature\" = ? WHERE \"id\" = 'mina'",
            vec![turso::Value::Integer(FORMAT_ONE_ACTS), bytes(&promotion)],
        )
        .await;
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

        // what the refusal keeps from happening: planned over this state, the replayed row reads
        // as an administrator of format 1 and would be signed from the root as a manager.
        {
            let opened = older.owners_vault();
            let key = signing_key_of(&opened.secret).expect("the signing key");
            let plan = planned(&store, &older.organization_key, &key, &opened, NOW)
                .await
                .expect("the plan");

            assert!(
                plan.steps.iter().any(|step| matches!(
                    step,
                    Step::Member(member) if member.id == "mina" && member.role_id == "manager"
                )),
                "the replayed promotion would not have been carried; the test proves nothing"
            );
        }

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

    /// **Ticket 25's third criterion.** A member holding a custom role, in an organization whose
    /// `role` table holds that role's verified row: the upgrade judges members against the role
    /// rows that verify, so the holder is carried in their role, the role row is signed again
    /// from the root, and they read afterwards with what the role gives. The plan is made directly,
    /// since the owner's sign-in refuses an organization holding a root before it plans.
    #[tokio::test]
    async fn the_holder_of_a_custom_role_is_carried_in_it() {
        let (older, store) = upgraded("custom-role").await;
        let owner = older.person("owner");
        let pinned = older.pinned();
        let root = store
            .live_certificate(&pinned, "owner", &owner.signing.verifying_key())
            .await
            .expect("the chain")
            .expect("the root");
        let signer = Signer {
            key: &owner.signing,
            certificate: &root,
        };
        let leasing = RoleRecord {
            id: "role-leasing".to_string(),
            kind: "custom".to_string(),
            name_sealed: seal_content(&older.content_key, "role.name_sealed", b"Leasing")
                .expect("the name"),
            mask: MEMBER_ROLE.mask | mask(&[Flag::InviteMember]),
            rank: 500_000,
        };

        store.write_role(&signer, &leasing).await.expect("the role");

        let pia = store
            .member(&pinned, "pia")
            .await
            .expect("the member")
            .expect("pia");

        store
            .write_member(
                &signer,
                &crate::organization::store::MemberRecord {
                    role_id: leasing.id.clone(),
                    override_mask: 0,
                    ..pia
                },
            )
            .await
            .expect("pia in the custom role");

        made_to_look_older(&older, &store).await;

        let opened = older.owners_vault();
        let key = signing_key_of(&opened.secret).expect("the signing key");
        let plan = planned(&store, &older.organization_key, &key, &opened, NOW + 60_000)
            .await
            .expect("the plan");

        assert!(
            plan.steps.iter().any(|step| matches!(
                step,
                Step::Member(member) if member.id == "pia" && member.role_id == "role-leasing"
            )),
            "the holder of a custom role was not carried in it"
        );
        assert!(
            !plan
                .steps
                .iter()
                .any(|step| matches!(step, Step::Drop(dropped) if dropped.row.id() == "pia")),
            "the holder of a custom role was dropped"
        );
        assert!(
            plan.steps.iter().any(
                |step| matches!(step, Step::Role(role) if role.id == "role-leasing" && role.rank == 500_000)
            ),
            "the custom role was not signed again"
        );

        in_one_transaction(
            &store,
            applied(&store, &key, plan.root.as_ref(), &plan.steps),
        )
        .await
        .expect("the plan applied");

        let pia = store
            .members(&pinned)
            .await
            .expect("the members")
            .into_iter()
            .find(|member| member.id == "pia")
            .expect("pia");

        assert_eq!(pia.role_id, "role-leasing");
        assert_eq!(pia.effective, leasing.mask);
        assert!(pia.covered);
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

    /// **Ticket 25's tenth criterion.** An organization whose replica has no `succession` table,
    /// which a build before effort 828 made: the plan meets it the way `settled` does, with no
    /// offer to withdraw, and the owner's sign-in upgrades it.
    #[tokio::test]
    async fn the_plan_meets_a_replica_without_a_succession_table() {
        let older = older("no-succession").await;
        let store = older.open().await;
        let owner = older.person("owner");

        run(&store, "DROP TABLE \"succession\"", Vec::new()).await;

        let opened = older.owners_vault();
        let key = signing_key_of(&opened.secret).expect("the signing key");
        let plan = planned(&store, &older.organization_key, &key, &opened, NOW)
            .await
            .expect("a replica without a succession table could not be planned");

        assert!(
            !plan
                .steps
                .iter()
                .any(|step| matches!(step, Step::WithdrawOffer(_)))
        );

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

        assert_upgraded(&store, &older, &older.pinned()).await;
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

        let opened = vault_opened_by(&store, &older.pinned(), owner.username, owner.password)
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
    /// table of its own and one row in it (ticket 26).
    const NEXT: Transition = Transition {
        from: FORMAT_VERSION,
        name: "the next format",
        refused: nothing_refused,
        run: the_next_format,
    };

    /// A check that refuses no directory.
    fn nothing_refused<'a>(_: &'a Upgrading<'a>) -> Pending<'a, Option<&'static str>> {
        Box::pin(async { Ok(None) })
    }

    /// The next format's table, and its one row.
    fn the_next_format<'a>(upgrading: &'a Upgrading<'a>) -> Pending<'a, ()> {
        Box::pin(async move {
            run(
                upgrading.store,
                "CREATE TABLE \"next\" (\"id\" TEXT PRIMARY KEY NOT NULL)",
                Vec::new(),
            )
            .await;
            run(
                upgrading.store,
                "INSERT INTO \"next\" (\"id\") VALUES (?)",
                vec![text("next")],
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
            store.format_as_it_stands().await.expect("the format"),
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
            vec![format!("format-1-to-2-{NOW}.sqlite")]
        );

        let copy = backup::contents_of(
            &backup::directory_of(&older.directory, "org-7f3a")
                .join(format!("format-1-to-2-{NOW}.sqlite")),
        )
        .await;

        assert_eq!(before.len(), FORMAT_ONE_SCHEMA.len());
        assert_eq!(copy, before, "the copy is not the organization as it stood");
        assert_ne!(
            contents(&store).await,
            copy,
            "the upgrade changed nothing, so the copy proves nothing"
        );

        let name = format!("org-7f3a-format-1-to-2-{}", NOW / 1000);

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
            vec![format!("format-1-to-2-{NOW}.sqlite")]
        );
        assert_upgraded(&store, &older, &older.pinned()).await;
    }
}
