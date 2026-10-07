//! the way in: what a link says about the organization it names, and the sign-in at the wall
//! that admits a person to the organization this machine has selected.
//!
//! **A link is parsed in `link.rs` and read there.** The web layer hands the text over and is
//! told which organization it names, which kind of link it is and when it lapses; the credential
//! the link carries and the verifying key it pins stay on this side ([[rules/credentials]],
//! *Client boundary*). There are two kinds and each takes the code first: a machine link goes to
//! `machine::connect`, which unseals the payload and then connects (`connect.rs`), recording the
//! organization and no member; an invitation link goes to [`accept_while`]. *A third kind, the
//! organization's own, reached the connect directly with a credential anybody could read off it,
//! and effort 828's requirement 16 retired it.*
//!
//! **Signing in is a username and a password against the held organization** (effort 824,
//! requirement 19). The wall asks for both; `session::sign_in_by_username` tries the password
//! against each member's vault and checks the username on the row that opens, and what happens
//! here is the rest of the act: the machine's record learns which member this person is. A wrong
//! password, a username nobody holds, and a username held by somebody whose password this is not
//! are refused with one sentence, and nothing says whether the username exists. *819's join
//! opened a sealed payload with the link's half of a secret and the password to find the member's
//! row, and its restore tried every vault by the organization's own link; requirement 18 retires
//! both, and the vault trial is the one way in now.*
//!
//! **Opening an invitation link is the other way in, and it is where a password is chosen**
//! (effort 826, requirements 8 and 9; effort 828, requirement 1). The link carries no legible
//! credential, so [`accept_while`] does everything and does it in one order: unseal the payload
//! with the code, reach the organization with the credential that comes out, judge the invitation row,
//! open the vault with the password the payload held, record the organization on this machine
//! beside any others it holds, reseal the vault under the password the person chose, spend the
//! invitation, record the member and sign them in. Nothing is recorded until the row has been
//! judged and the vault has opened, and a refusal past the reach leaves no replica on a machine
//! that does not hold the organization (effort 851, requirement 10). A reset is the same link freshly issued, so a member locked out by a
//! forgotten password comes back the same way. Nothing at the wall asks anybody to change a
//! password any more: the row's `must_change_password` is written false by the accept, and the
//! sign-in path reads it as false, because a person who reached the wall by the generated secret
//! typed nothing they were shown.
//!
//! **Nothing is reached before the code is typed.** `locator_inspect` opened the
//! replica with the link's clear credential and judged the invitation's standing before the
//! person had given anything; there is no clear credential to do that with now, so reading a link
//! is `link::read`, a decode, and the standing is judged here, inside the act that takes the code.
//! The four standings survive as the sentences [`invitation_refused`] writes.
//!
//! **Sign-out keeps the record.** Signing out drops the keys this process held and nothing else;
//! the record goes on naming the organization and the member, so the wall comes back up on the
//! same organization and the next sign-in finds the same replica. Forgetting the organization is
//! a disconnect (`session/forget.rs`), which is a different act.
//!
//! **How a link reaches the application.** A link is `rentable://join/...`, and the scheme is
//! registered with the operating system: by the installer on Windows and Linux, from the
//! `deep-link` plugin's configuration, and by `Info.plist` on macOS from the same; a development
//! build registers it for its own executable at startup. Opening the link opens the application,
//! or reaches the instance already running through the single-instance plugin, and the shell
//! puts the connect screen on with the link already in it. A person whose platform did not hand
//! the link over, a chat client that refuses unknown schemes, a link copied as text, pastes it
//! into the same screen; that is the fallback and not the design. Both are in
//! `organization/invitation/command.rs`'s `organization_invitation_link_take` and the shell's
//! listener, and the decision is recorded here because the join ticket made it.

use std::{
    path::Path,
    sync::{Arc, Mutex},
};

use crate::{
    credential::CredentialStore,
    diagnostics,
    error::{Error, RefusalReason},
    machine::RemoteSyncStore,
    persisted::Persisted,
    turso::consent::{Account, forget_platform_token},
};

use crate::organization::{
    HeldOrganization,
    authority::VERIFYING_KEY_BYTES,
    invitation::{
        InvitationStanding, connect,
        link::{HalfKind, JoinLink, open_payload},
    },
    member::vault::{ContentKey, KdfParams, MemberSecretKey, open_vault, reseal_vault_with_key},
    session::{
        CredentialSlot, MemberSession, content_key_of, forget_remembered, machine_named,
        machine_seen, open_session, refused_by_name, remember, repaired_after_the_pull,
        sign_in_by_username, sign_outs_acknowledged, writes_to,
    },
    setup::MINIMUM_PASSWORD_LENGTH,
    store::{FORMAT_VERSION, InvitationRecord, MemberRecord, OrganizationStore},
};

/// The one sentence an invitation that no longer opens is refused with: which of the three it is,
/// and the organization it was for, since the link names the organization and the invitation is
/// what is refused. `reason` is `Lapsed`, past its lifetime, where a new link is what the person
/// needs; `Consumed`, opened once already; or `Revoked`, the invitation this link was made for is
/// gone, or the member it named is.
///
/// *These were `LinkStanding`'s four values, answered to the connect screen before anybody had
/// typed anything, and then a `Refusal` enum of this file's own until effort 840 left the crate one
/// error type (ticket 47). Nothing reads a row before the code is out, so the standing is judged
/// inside the accept and survives as the reason a refusal carries.*
///
/// **It crosses as `Error::Refused` with the reason beside the message**, as a wrong code does
/// with `CodeWrong`. The screen draws its own sentence per standing, so what it needs is the word
/// and not the prose. *It offered the wall on a spent link until effort 851, when a spent link
/// stopped recording anything to land at.*
fn invitation_refused(organization_name: &str, reason: RefusalReason) -> Error {
    let why = match reason {
        RefusalReason::Lapsed => "has lapsed",
        RefusalReason::Consumed => "was already opened",
        // `Revoked`, the third; nothing here refuses an invitation with another.
        _ => "was revoked",
    };

    Error::Refused {
        reason,
        message: format!(
            "the invitation to {organization_name} {why}; ask whoever invited you for a new link"
        ),
    }
}

/// What a link is refused with on a machine that holds its organization (effort 851, requirement
/// 13, as the human settled it on 2026-10-05): whatever the standing, the "already used" sentence,
/// since the machine is on that organization's wall already and only a reset is let through.
fn standing_refused(organization_name: &str, held: bool, reason: RefusalReason) -> Error {
    invitation_refused(
        organization_name,
        if held {
            RefusalReason::Consumed
        } else {
            reason
        },
    )
}

/// [`accept_while`] with nobody signed in here, which is where the wall stands, as the tests
/// drive it.
#[cfg(test)]
#[allow(clippy::too_many_arguments)]
pub(crate) async fn accept<S, F, R>(
    credentials: &dyn CredentialStore,
    store_for: S,
    machine: &mut Persisted<RemoteSyncStore>,
    database_path: &Path,
    link: &JoinLink,
    code: &str,
    password: &str,
    kdf_params: KdfParams,
    now: i64,
) -> Result<(R, MemberSession), Error>
where
    S: FnOnce(CredentialSlot) -> F,
    F: std::future::Future<Output = Result<R, Error>>,
    R: std::borrow::Borrow<OrganizationStore>,
{
    accept_while(
        credentials,
        store_for,
        machine,
        database_path,
        link,
        code,
        password,
        kdf_params,
        now,
        false,
    )
    .await
}

/// Open an invitation link: the way in for an invited or a reset member (effort 826, requirements
/// 8 and 9; effort 828, requirement 1).
///
/// `store_for` opens a replica of the organization the link names against a credential slot, which
/// is how the reach happens *after* the unseal rather than before it; `machine` is this machine's
/// record, which may hold the organization already or nothing at all; `code` is the six characters
/// the issuer read out, and `password` is the one the person chose, held to the first run's floor
/// because a member's vault is sealed the way the owner's is.
///
/// **The order is what this function is.** Select the organization where this machine holds it
/// already, and stop there; unseal the payload with the code and the link's secret together; reach the
/// organization with the credential that comes out; judge the invitation row under the key the
/// link pins, refusing a lapsed, consumed or revoked one, and a removed member's, by name; open the
/// vault with the password the payload held; record the organization on this machine, beside any
/// others it holds, and select it; reseal the vault under the password the person chose, with `must_change_password`
/// written false; spend the invitation; and record which member this person is. **A spent link is
/// refused before anything is recorded** (effort 851, requirement 10): a link and its code admit
/// one machine, once, and the person is told to ask the owner or a manager for a new one. *Until
/// effort 851 a consumed link still connected a machine that held nothing, so a person setting a
/// second machine up with a spent link landed at the wall; that left the machine on the
/// organization's wall by a link that was supposed to be spent.*
///
/// **The code is checked by being used, and never by being compared.** A wrong one derives a key
/// like any other, that key fails the AEAD tag, and there is no stored verifier and no boolean a
/// modified client could make return true, which is the same shape a wrong password has. The one
/// refusal the clock decides is the link's own moment, which is refused before any key is derived,
/// because deriving for a link that is already dead is a free pass for whoever is guessing.
/// **`store_for` is how the reach happens after the unseal.** It is handed the slot the credential
/// lands in and answers a replica reading from it, and the replica comes back to the caller with
/// the session, because whoever called this is who goes on holding it. What it answers only has to
/// *be* an organization store: the application hands over one it opened for this accept, and a
/// test hands over the one it is already holding, which is the same read either way.
///
/// **A refusal past the reach leaves no replica behind** where this machine does not hold the
/// organization (effort 851, requirement 10): `database_path` is where this machine keeps its
/// data, the replica is let go of, and `connect::refused_after_reaching` takes its file away.
///
/// `session_open` is whether somebody is signed in on this machine as the link is opened (effort
/// 851, review).
///
/// **A session open here is left alone until the link goes through.** A link for a held
/// organization is selected at once only where nobody is in (`connect::held_here`); with somebody
/// signed in, a refused link leaves the record as it was, and the selection moves at the record,
/// once the vault has opened. The command ends the open session once the link has gone through,
/// or before the reach where the link names the open organization itself, whose replica is the
/// one the link is judged on.
#[allow(clippy::too_many_arguments)]
pub(crate) async fn accept_while<S, F, R>(
    credentials: &dyn CredentialStore,
    store_for: S,
    machine: &mut Persisted<RemoteSyncStore>,
    database_path: &Path,
    link: &JoinLink,
    code: &str,
    password: &str,
    kdf_params: KdfParams,
    now: i64,
    session_open: bool,
) -> Result<(R, MemberSession), Error>
where
    S: FnOnce(CredentialSlot) -> F,
    F: std::future::Future<Output = Result<R, Error>>,
    R: std::borrow::Borrow<OrganizationStore>,
{
    let no_invitation = || {
        Error::refused(
            RefusalReason::LinkNotAnInvitation,
            "this link carries no invitation; sign in with your username and password",
        )
    };
    let half = &link.half;

    if half.kind != HalfKind::Invitation {
        return Err(no_invitation());
    }

    // a link for an organization this machine holds opens that organization's wall (effort 851,
    // requirement 13, as the human settled it on 2026-10-05): where nobody is signed in it is
    // selected before anything is derived or reached, and either way it is judged on that
    // organization's own replica, which the command has let go of where it was the open one. Only
    // a reset link for one of its members goes through.
    let held = connect::held_here(machine, &link.organization_id, session_open)?;

    if password.chars().count() < MINIMUM_PASSWORD_LENGTH {
        return Err(Error::refused(
            RefusalReason::PasswordTooShort,
            format!(
                "the password needs at least {MINIMUM_PASSWORD_LENGTH} characters. it is the only \
                 thing between anybody holding the organization's records and reading them"
            ),
        ));
    }

    // the link's own moment, before any key is derived. What the seal binds includes this moment,
    // so a rewritten copy opens nothing either way; refusing here is what keeps a dead link from
    // costing an Argon2id pass per guess.
    if half.expires_at <= now {
        return Err(standing_refused(
            &link.organization_name,
            held,
            RefusalReason::Lapsed,
        ));
    }

    // the code and the link's secret together: the code keys the seal and the secret salts it, so
    // neither on its own derives anything (effort 828, requirement 1). What comes out is the
    // issuer's own grant on the organization database and the password their vault was made under.
    let payload = open_payload(code, &link.locator(), half, &link.credential, kdf_params)?;
    let vault_password = payload
        .vault_password
        .ok_or_else(|| standing_refused(&link.organization_name, held, RefusalReason::Revoked))?;

    // the reach, under the credential that was inside the link, held in the slot the replica reads
    // from and the session fills with the member's own on the way out ([[rules/credentials]]).
    // From here on a refusal has a replica on disk, so every one goes out through
    // `refused_after_reaching`, with the replica let go of first (effort 851, requirement 10).
    let credential: CredentialSlot = Arc::new(Mutex::new(Some(payload.credential.clone())));
    let reached = match store_for(Arc::clone(&credential)).await {
        Ok(reached) => reached,
        Err(refusal) => {
            return Err(connect::refused_after_reaching(
                machine,
                database_path,
                &link.organization_id,
                refusal,
            ));
        }
    };
    let accepted = accepted(
        credentials,
        reached.borrow(),
        machine,
        held,
        link,
        &payload.credential,
        &vault_password,
        password,
        &credential,
        kdf_params,
        now,
    )
    .await;

    match accepted {
        Ok(session) => Ok((reached, session)),
        Err(refusal) => {
            drop(reached);

            Err(connect::refused_after_reaching(
                machine,
                database_path,
                &link.organization_id,
                refusal,
            ))
        }
    }
}

/// [`accept_while`] past the reach: the invitation judged on the replica the link's credential
/// reached, the vault opened, and only then the organization recorded, the vault resealed, the invitation
/// spent and the member signed in.
///
/// **The standing is judged before anything is recorded** (effort 851, requirement 10). The
/// invitation rows are read under the key the link pins (`JoinLink::verifying_key_bytes`), which
/// is the key a connect would record, so a lapsed, consumed or revoked invitation, and a member
/// who has been removed, are refused while this machine's record, the registry and the remembered
/// keys are as they were. *Until effort 851 the organization was recorded first and the row judged
/// against the record, so a spent link opened on a machine that held nothing left that machine on
/// the organization's wall.*
///
/// **And the record waits for the vault.** A wrong password inside the payload, which is what an
/// altered link amounts to, is refused with nothing recorded either; `connect::connect` runs once
/// the vault has opened.
#[allow(clippy::too_many_arguments)]
async fn accepted(
    credentials: &dyn CredentialStore,
    store: &OrganizationStore,
    machine: &mut Persisted<RemoteSyncStore>,
    held: bool,
    link: &JoinLink,
    link_credential: &str,
    vault_password: &str,
    password: &str,
    credential: &CredentialSlot,
    kdf_params: KdfParams,
    now: i64,
) -> Result<MemberSession, Error> {
    let half = &link.half;

    // an organization another version made is refused before any row of it is read (effort 838,
    // requirement 11), judged over what the reach pulled; and one this build may read and not
    // write is refused too, since an accept writes a vault, a spent row and a registry row
    // (effort 857, ticket 04).
    store.refuse_unwritable().await?;

    // the name a refusal says: the link's, which is what the record is written from. On a machine
    // holding the organization every standing is refused as already used (`standing_refused`).
    let name = link.organization_name.clone();
    let refused = |reason| standing_refused(&name, held, reason);
    let verifying_key = link.verifying_key_bytes()?;
    let invitations = store.invitations(&verifying_key).await?;
    let invitation: &InvitationRecord = invitations
        .iter()
        .find(|invitation| invitation.id == half.id)
        .ok_or_else(|| refused(RefusalReason::Revoked))?;

    match InvitationStanding::of(invitation, now) {
        InvitationStanding::Open => {}
        InvitationStanding::Lapsed => {
            return Err(refused(RefusalReason::Lapsed));
        }
        InvitationStanding::Consumed => {
            return Err(refused(RefusalReason::Consumed));
        }
    }

    let members = store.members(&verifying_key).await?;
    let member: &MemberRecord = members
        .iter()
        .find(|member| member.id == invitation.member_id)
        .ok_or_else(|| refused(RefusalReason::Revoked))?;

    if member.removed_at.is_some() {
        return Err(refused(RefusalReason::Revoked));
    }

    // on a machine that holds the organization, a reset alone goes through (effort 851,
    // requirement 13): a member whose password was reset comes back on the machine they work
    // from. A reset is a member who opened a link once already, whose consumed invitation stays
    // as the record of it (`invitation/account.rs`); an invitation for somebody who never arrived
    // adds nobody to a machine already on this organization's wall.
    let a_reset = invitations.iter().any(|other| {
        other.member_id == member.id && other.id != invitation.id && other.consumed_at.is_some()
    });

    if held && !a_reset {
        return Err(refused(RefusalReason::Consumed));
    }

    // that password is the one thing that opens this vault; a link somebody altered says no more
    // than a wrong password would.
    let secret = open_vault(vault_password, &member.vault).map_err(|_| refused_by_name(&name))?;
    let content_key = content_key_of(&member.sealed_content_key, &secret)?;

    // the vault is open, so this is the first moment the organization is recorded on this
    // machine: the registry row and the record, beside any other organization it holds, naming
    // nobody yet, and selected. **What the record was before is kept where this accept adds the
    // organization**, so a failure before the reseal forgets it again (`forgotten_again`).
    let before = (!held).then(|| RemoteSyncStore::clone(machine));
    let held = connect::connect(store, machine, &link.locator(), link_credential, now).await?;
    let resealed = resealed(
        credentials,
        store,
        &held,
        verifying_key,
        member,
        (secret, content_key),
        password,
        credential,
        kdf_params,
        now,
    )
    .await;
    let session = match resealed {
        Ok(session) => session,
        Err(refusal) => {
            // and the registry row the connect pushed goes with the record, so the same link
            // opened again registers this machine once (effort 851, review).
            if let Some(before) = before {
                connect::unregistered(store, &held).await;
                forgotten_again(credentials, machine, before, &held.id, &member.id);
            }

            return Err(refusal);
        }
    };

    // **past the reseal there is no undoing** (effort 851, review): the vault opens under the
    // password the person chose and nothing else, so forgetting the organization here would leave
    // them a link that is no longer theirs to open and no machine to sign in at. A failure from
    // here keeps the organization held, with their own lock latched, and the wall signs them in.
    let admitted = admitted(store, machine, &held, invitation, session, now).await;

    if admitted.is_err() {
        kept(machine, &held, &member.id);
    }

    admitted
}

/// [`accepted`] past the connect and up to the point of no return: the rest of a sign-in, and the
/// vault resealed under the password the person chose.
#[allow(clippy::too_many_arguments)]
async fn resealed(
    credentials: &dyn CredentialStore,
    store: &OrganizationStore,
    held: &HeldOrganization,
    verifying_key: [u8; VERIFYING_KEY_BYTES],
    member: &MemberRecord,
    (secret, content_key): (MemberSecretKey, ContentKey),
    password: &str,
    credential: &CredentialSlot,
    kdf_params: KdfParams,
    now: i64,
) -> Result<MemberSession, Error> {
    // the rest of a sign-in: every grant the vault holds, the organization's into the slot the
    // replica pushes under from here on, over the link's credential that is in it now.
    let session = open_session(
        store,
        held,
        verifying_key,
        member,
        secret,
        content_key,
        credential,
    )
    .await?;

    // the password they chose, over the same keypair: nothing sealed to them is touched, and the
    // generated secret opens nothing from now on.
    let (vault, member_key) = reseal_vault_with_key(&session.secret, password, kdf_params)?;

    store.reseal_member(&member.id, &vault, false, now).await?;

    // this machine stays signed in from here, on the key the password they just chose derives
    // (effort 826, requirement 12). Filed after the row is written, so a re-seal that did not
    // land leaves no key behind for a vault it does not open.
    remember(
        credentials,
        &held.id,
        &session.member_id,
        session.session_epoch,
        &member_key,
    );

    Ok(session)
}

/// [`accepted`] past the reseal: the invitation spent and the record naming the member.
async fn admitted(
    store: &OrganizationStore,
    machine: &mut Persisted<RemoteSyncStore>,
    held: &HeldOrganization,
    invitation: &InvitationRecord,
    mut session: MemberSession,
    now: i64,
) -> Result<MemberSession, Error> {
    store.consume_invitation(&invitation.id, now).await?;

    if !store.push().await {
        diagnostics::warn("organization.invitation.acceptedNotYetSent")
            .with("invitation", invitation.id.as_str())
            .write();
    }

    // an accepted invitation is a sign-in, so the registry learns who is on this machine (effort
    // 828, requirement 15): the row `connect::connect` wrote above names nobody yet. The machine
    // names itself first, so the push the registry makes carries both (effort 846, requirement 11).
    machine_named(store, held, &session.content_key, now).await;
    machine_seen(store, held, Some(&session.member_id), now).await;

    session.must_change_password = false;

    // and a sign-in acknowledges whatever signed this machine out on its own before, so the
    // password the person just chose keeps it in (effort 846, requirement 10).
    let machine_signed_out =
        sign_outs_acknowledged(store, &held.machine_id, &session.member_id).await?;

    // **and their own lock is latched from the join on** (effort 851, requirement 35). An
    // invitation is issued by a build that locks the member it names, so this member with no lock
    // row that verifies reads as locked on this machine from the first: otherwise a locked invitee
    // could delete their own row and the owner's marker from their replica before this machine
    // had ever read the marker, and read unlocked. **Theirs alone**: the organization's marker is
    // latched only by reading it, so a member carried over with no row of their own is judged here
    // as the organization stands, in the directory and in a role change (requirements 33 and 36).
    session.own_lock_latched = true;

    //
    // **Beside every member latched here already** (effort 851, review): on a machine that holds
    // the organization this is a reset let through, and the member latched before it keeps their
    // own lock (`HeldOrganization::latching`).
    machine.hold(
        HeldOrganization {
            member_id: Some(session.member_id.clone()),
            role: Some(session.role.clone()),
            format: Some(FORMAT_VERSION),
            machine_signed_out,
            ..held.clone()
        }
        .latching(&session.member_id),
    );
    machine.commit()?;

    diagnostics::info("organization.invitation.accepted")
        .with("organization", held.id.as_str())
        .with("member", session.member_id.as_str())
        .with("role", session.role.as_str())
        .write();

    Ok(session)
}

/// Keep the organization an accept failed for past the reseal (effort 851, review): held as the
/// connect recorded it, naming nobody, with `member_id`'s own lock latched as the accept would have
/// latched it (`HeldOrganization::own_lock_latched`), so the person signs in at the wall with the
/// password they chose and reads as locked there whatever their replica later holds.
///
/// Best effort, as [`forgotten_again`] is: a record that could not be written goes to the
/// diagnostics log, and the connect's record, which holds the organization, is what stands.
fn kept(machine: &mut Persisted<RemoteSyncStore>, held: &HeldOrganization, member_id: &str) {
    machine.hold(held.clone().latching(member_id));

    if let Err(error) = machine.commit() {
        diagnostics::error("organization.invitation.notKept")
            .with("organization", held.id.as_str())
            .with("error", error.to_string())
            .write();
    }
}

/// Forget the organization an accept added and then failed before the reseal for (effort 851,
/// requirements 10 and 13): the record as it was before, the remembered key the accept may have
/// filed, and any consent filed under the organization. Its replica goes with the refusal
/// (`connect::refused_after_reaching`), once this machine no longer holds it.
///
/// **What `session::forget_one` takes, without its reach.** That routine forgets a held organization
/// through the application's shared state, whose record lock this accept is running under, and it
/// moves the selection to the first organization still held; an accept that did not finish leaves
/// the record exactly as it found it, the selection and the current workspace included, so a retry
/// with the same link adds the organization rather than finding it held and refusing the link as
/// used. *Until this, a failure past the connect left the organization held with nobody signed in
/// and the invitation unspent.* **Only before the reseal**: past it the vault answers to the
/// password the person chose, and [`kept`] keeps the organization for the wall.
///
/// Best effort, as a forget is: what could not be undone goes to the diagnostics log, and the
/// person reads the refusal that brought them here.
fn forgotten_again(
    credentials: &dyn CredentialStore,
    machine: &mut Persisted<RemoteSyncStore>,
    before: RemoteSyncStore,
    organization_id: &str,
    member_id: &str,
) {
    **machine = before;

    if let Err(error) = machine.commit() {
        diagnostics::error("organization.invitation.notForgotten")
            .with("organization", organization_id)
            .with("error", error.to_string())
            .write();
    }

    forget_remembered(credentials, organization_id, member_id);

    if let Err(error) = forget_platform_token(credentials, &Account::of(organization_id)) {
        diagnostics::error("organization.invitation.consentNotForgotten")
            .with("organization", organization_id)
            .with("error", error.to_string())
            .write();
    }
}

/// Admit a person to an organization this machine holds, by username and password: the sign-in
/// at the wall.
///
/// `store` is the held organization's replica on this machine and `credential` its slot, empty
/// on the way in and holding the member's own credential on the way out, which `sign_in_by_username`
/// fills from the grant the vault unsealed; the push that spends an invitation goes out under
/// that. `held` is what the record names, which a connect wrote with no member and a first run
/// or an earlier sign-in wrote with one; either way the person is found by what they typed, and
/// the record is written back naming them.
///
/// **The replica is pulled once the vault is open**, and before the sign-in acknowledges anything
/// (effort 846, ticket 30). The slot is empty until the vault fills it, so the replica opened for
/// a password has pulled nothing since the last session on this machine; a sign-out of this
/// machine alone made in between is on Turso and not here, and a number read before the pull
/// would open the session under a mark the next pull leaves behind. A pull that could not go is
/// the offline case, and the replica goes on serving what it holds.
#[allow(clippy::too_many_arguments)]
pub(crate) async fn admit(
    credentials: &dyn CredentialStore,
    store: &OrganizationStore,
    machine: &mut Persisted<RemoteSyncStore>,
    held: &HeldOrganization,
    username: &str,
    password: &str,
    credential: &CredentialSlot,
    now: i64,
) -> Result<MemberSession, Error> {
    admitted_after(
        credentials,
        store,
        machine,
        held,
        username,
        password,
        credential,
        now,
        async || store.pulled().await.is_ok(),
    )
    .await
}

/// [`admit`], with the pull that follows the vault's opening given rather than made: the one step
/// a test stands in for, since nothing here serves a pull, so what a pull would bring is written
/// where the pull is made. It answers whether the pull went.
#[allow(clippy::too_many_arguments)]
pub(crate) async fn admitted_after(
    credentials: &dyn CredentialStore,
    store: &OrganizationStore,
    machine: &mut Persisted<RemoteSyncStore>,
    held: &HeldOrganization,
    username: &str,
    password: &str,
    credential: &CredentialSlot,
    now: i64,
    pull: impl AsyncFnOnce() -> bool,
) -> Result<MemberSession, Error> {
    // a row still carrying `must_change_password` is one whose invitation link has not been
    // opened, and the wall refuses it inside the sign-in itself; every session that reaches here
    // has a password of its own, so nothing about the flag is acted on (effort 826, ticket 03).
    let mut session =
        sign_in_by_username(credentials, store, held, username, password, credential).await?;

    // the credential the vault just unsealed is what the pull goes out under, so this is the
    // first moment it can; what it brings is what the number below is read from.
    let pulled = pull().await;

    // **and the floors judged over what it brought, before anything is written** (effort 857,
    // ticket 04): below the read floor the sign-in is refused by name, and below the write floor
    // it goes on read-only, writing nothing to the organization from here; the session's state
    // says which (`heldByVersion`).
    store.refuse_another_format().await?;

    // the owner's own row, where somebody below them wrote it, repaired on their machine now that
    // the pull is in and the organization may be written; a removed row that stays removed is
    // the wall's one sentence, as a removed row is refused at the vault.
    repaired_after_the_pull(store, &mut session, Some(held), || {
        refused_by_name(&held.name)
    })
    .await?;

    // and the members carried over from before the lock, locked by the first machine able to sign
    // it, over the rows that pull brought and never over a replica it could not bring up to date
    // (effort 851, requirement 36).
    if writes_to(store) {
        crate::organization::member::lock::carry_locks_over(store, &session, Some(held), pulled)
            .await;
    }

    // a sign-in reads the organization in this build's format and in no other, so the record keeps
    // that it has (effort 838, ticket 25); and it acknowledges whatever signed this machine out on
    // its own before, as Turso holds it, so the same password keeps it in (effort 846,
    // requirement 10). The session opened under the number the replica held before the pull, and
    // takes the one after it.
    let acknowledged = sign_outs_acknowledged(store, &held.machine_id, &session.member_id).await?;

    session.machine_signed_out = session.machine_signed_out.max(acknowledged);

    let filled = HeldOrganization {
        member_id: Some(session.member_id.clone()),
        role: Some(session.role.clone()),
        format: Some(FORMAT_VERSION),
        machine_signed_out: acknowledged,
        ..held.clone()
    };

    // the registry learns who is on this machine (effort 828, requirement 15), and the machine's
    // name with it (effort 846, requirement 11). After the sign-in, because the push it makes goes
    // out under the credential the vault just unsealed; and only where this build may write the
    // organization (effort 857, ticket 04).
    if writes_to(store) {
        machine_named(store, &filled, &session.content_key, now).await;
        machine_seen(store, &filled, Some(&session.member_id), now).await;
    }

    machine.hold(filled);
    machine.commit()?;

    diagnostics::info("organization.signedIn")
        .with("organization", held.id.as_str())
        .with("role", session.role.as_str())
        .write();

    Ok(session)
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use serde_json::json;
    use tokio::sync::RwLock;

    use super::{accept, admit};
    use crate::organization::invitation::accepted_here;
    use crate::test::scratch;
    use crate::{
        credential::{CredentialStore, Memory},
        database::Database,
        error::{Error, RefusalReason},
        machine::{RemoteSync, RemoteSyncStore},
        organization::Shared,
        organization::{
            HeldOrganization,
            invitation::{
                Invitation, TEST_LIFETIME_MS, WorkspaceGrant, connect,
                link::{
                    CODE_MISSING, CODE_REFUSED, Half, HalfKind, JoinLink, LinkKind, Locator,
                    open_payload,
                },
                locator, make_account_and_link,
            },
            member::vault::{KdfParams, open_sealed_secret_key},
            role::permission,
            session::{CredentialSlot, MEMBER_KEY_SERVICE, MemberSession, read_entry, sign_in},
            setup::{CreateOrganization, Remote, create_organization},
            store::OrganizationStore,
            workspace::create_workspace,
            workspace::remote::Pipeline,
        },
        persisted::Persisted,
        settings::Settings,
        sync::test::server::{ScriptedResponse, ScriptedServer},
        turso::{
            consent::TursoConsent,
            discovery::McpEndpoint,
            platform::{AccessLevel, InMemoryPlatform},
        },
        update::Update,
    };

    const PASSWORD: &str = "the owners password";
    const ISSUED_AT: i64 = 1_757_000_000_000;

    fn test_cost() -> KdfParams {
        KdfParams {
            memory_kib: 1024,
            iterations: 2,
            lanes: 1,
        }
    }

    fn slot() -> CredentialSlot {
        Arc::new(Mutex::new(None))
    }
    /// No platform authority in hand, which is every session here but the owner's with one.
    fn no_platform() -> Option<&'static InMemoryPlatform> {
        None
    }

    /// Full access on each workspace named, which is what every invitation here grants.
    fn full(ids: &[String]) -> Vec<WorkspaceGrant> {
        ids.iter()
            .map(|id| WorkspaceGrant {
                id: id.clone(),
                access: AccessLevel::FullAccess,
            })
            .collect()
    }

    /// A second machine's record, connected to the organization by its link: the organization
    /// named, and no member yet, which is what a person signs in against at the wall.
    async fn connected_machine(
        directory: &std::path::Path,
        store: &OrganizationStore,
        link: &Locator,
    ) -> (Persisted<RemoteSyncStore>, HeldOrganization) {
        let mut machine = Persisted::<RemoteSyncStore>::load(directory.join(RemoteSync::FILENAME))
            .expect("the store");

        assert!(
            machine.selected().is_none(),
            "the second machine has prior state"
        );

        let held = connect::connect(store, &mut machine, link, REACHED_WITH, ISSUED_AT + 1)
            .await
            .expect("the connect failed");

        assert_eq!(held.member_id, None);

        (machine, held)
    }

    /// An organization with its owner signed in, one workspace, and one member invited into it:
    /// the store with two members every test here runs over, the organization's locator (the four
    /// clear fields every link seals a payload onto; nothing connects with it alone), and the
    /// member's invitation link. The replica the owner wrote is what a connected machine reads once
    /// it has pulled; the pull itself is `organization/store/`'s and is not what this module
    /// proves.
    async fn invited(
        credentials: &dyn CredentialStore,
        directory: &std::path::Path,
    ) -> (
        OrganizationStore,
        MemberSession,
        Locator,
        JoinLink,
        String,
        String,
    ) {
        let mut store = Persisted::<RemoteSyncStore>::load(directory.join("remote-sync.json"))
            .expect("the store");
        let mcp = ScriptedServer::start(vec![
            ScriptedResponse::new(
                200,
                json!({ "jsonrpc": "2.0", "id": 1, "result": {} }).to_string(),
            ),
            ScriptedResponse::new(
                200,
                json!({
                    "jsonrpc": "2.0",
                    "id": 3,
                    "result": { "content": [{ "type": "text", "text": json!([{
                        "Name": "ledger",
                        "hostname": "ledger-an-org.aws-eu-west-1.turso.io",
                        "group": "rentable"
                    }]).to_string() }] }
                })
                .to_string(),
            ),
        ])
        .await;
        let platform = Arc::new(InMemoryPlatform::new("an-org"));
        let (_, organization) = create_organization(
            credentials,
            &crate::clock::System::shared(),
            &mut store,
            "a-platform-token",
            &McpEndpoint::at(&mcp.url("")),
            |_| Arc::clone(&platform),
            Remote::none(),
            &directory.join("app.db"),
            CreateOrganization {
                name: "Acme",
                username: "olivia",
                password: PASSWORD,
                group: None,
            },
            test_cost(),
            ISSUED_AT,
        )
        .await
        .expect("the first run failed");
        let joined = store.selected().cloned().expect("the record");
        let mut owner = sign_in(&organization, &joined, PASSWORD, &slot())
            .await
            .expect("the owner did not sign in");
        let pipeline = crate::sync::test::pipeline::LocalPipeline::start().await;
        let workspace = create_workspace(
            &organization,
            &mut owner,
            &platform,
            |_| Pipeline::at(&pipeline.url("")),
            "North",
            ISSUED_AT,
        )
        .await
        .expect("the workspace");
        let link = locator(&organization, &owner)
            .await
            .expect("the organization's link");
        let invited = make_account_and_link(
            &organization,
            &owner,
            no_platform(),
            &link,
            Invitation {
                username: "sami.staff",
                role: permission::MEMBER,
                workspaces: &full(std::slice::from_ref(&workspace.id)),
            },
            test_cost(),
            ISSUED_AT,
        )
        .await
        .expect("the invitation failed");
        let invitation = JoinLink::decode(&invited.join_link).expect("the invitation's link");

        assert_eq!(
            invitation.organization_id, link.organization_id,
            "an invitation link is the organization's locator with a sealed payload in it"
        );
        assert_eq!(invitation.verifying_key, link.verifying_key);
        assert_eq!(invitation.remote_url, link.remote_url);
        assert!(
            !invitation.credential.is_empty(),
            "an invitation link carries no sealed payload"
        );
        assert_eq!(
            Some(invitation.half.id.as_str()),
            Some(invited.invitation_id.as_str())
        );

        (
            organization,
            owner,
            link,
            invitation,
            workspace.id,
            invited.code,
        )
    }

    /// The password the invited member chooses when they open their link.
    const CHOSEN: &str = "a password sami chose";

    /// What a caller holds by the time it reaches `connect::connect`: the credential the link's
    /// code unsealed, which the replica handed in stands for here.
    const REACHED_WITH: &str = "the-credential-the-code-opened";

    /// `invitation` opened on a machine that holds nothing, choosing `password`: what a person
    /// does with the link they were sent, on the machine they were sent it on. The accept records
    /// the organization itself, so nothing connects first (effort 828, requirement 1).
    async fn opened(
        credentials: &dyn CredentialStore,
        directory: &std::path::Path,
        store: &OrganizationStore,
        invitation: &JoinLink,
        code: &str,
        password: &str,
        now: i64,
    ) -> (Persisted<RemoteSyncStore>, Result<MemberSession, Error>) {
        let mut machine = Persisted::<RemoteSyncStore>::load(directory.join(RemoteSync::FILENAME))
            .expect("the store");

        assert!(
            machine.selected().is_none(),
            "the second machine has prior state"
        );

        let session = accept_on(
            credentials,
            &mut machine,
            store,
            invitation,
            code,
            password,
            now,
        )
        .await;

        (machine, session)
    }

    /// The accept, over one machine's record and the replica this test already holds.
    ///
    /// **The replica is handed in rather than opened.** In the application `reached` (`command.rs`)
    /// answers with one it opened against the credential the code unsealed; here the organization
    /// is a local file every test in this module shares, and what the accept does with it is the
    /// same read either way.
    ///
    /// **The machine's data directory is the one its record is in**, which is where a refusal
    /// looks for a replica to take away. The shared file is the owner's, in another directory, so
    /// nothing here takes it; the test that a refusal does take one opens a replica of its own
    /// beside the machine's record.
    async fn accept_on(
        credentials: &dyn CredentialStore,
        machine: &mut Persisted<RemoteSyncStore>,
        store: &OrganizationStore,
        link: &JoinLink,
        code: &str,
        password: &str,
        now: i64,
    ) -> Result<MemberSession, Error> {
        let database_path = database_path_of(machine);

        accept(
            credentials,
            |_| async { Ok::<_, Error>(store) },
            machine,
            &database_path,
            link,
            code,
            password,
            test_cost(),
            now,
        )
        .await
        .map(|(_, session)| session)
    }

    /// Where a machine keeps its data: beside its record, as `app.db` would be.
    fn database_path_of(machine: &Persisted<RemoteSyncStore>) -> std::path::PathBuf {
        machine.path().with_file_name(Database::FILENAME)
    }

    /// What a machine's record names, once something has recorded an organization on it.
    fn held_by(machine: &Persisted<RemoteSyncStore>) -> HeldOrganization {
        machine
            .selected()
            .cloned()
            .expect("the machine holds no organization")
    }

    /// The invitation naming `member_id`, as the rows hold it: `(expires_at, consumed_at)`, the
    /// most recent where there are several.
    async fn invitation_of(
        store: &OrganizationStore,
        session: &MemberSession,
        member_id: &str,
    ) -> Option<(i64, Option<i64>)> {
        store
            .invitations(&session.verifying_key)
            .await
            .expect("the invitations")
            .into_iter()
            .filter(|invitation| invitation.member_id == member_id)
            .max_by_key(|invitation| invitation.created_at)
            .map(|invitation| (invitation.expires_at, invitation.consumed_at))
    }

    /// Effort 851, criterion 31: **an account an invitation makes is locked, under a lock that
    /// verifies, and opening its link and choosing a password leaves it locked.** The person is in
    /// and their password is their own, which is what the directory says; what they may do waits
    /// on an owner or a manager.
    #[tokio::test]
    async fn an_invited_member_is_still_locked_after_opening_their_link_and_choosing_a_password() {
        let credentials = Memory::new();
        let directory = scratch("join-locked");
        let (store, owner, _, invitation, _, code) = invited(&credentials, &directory).await;
        let (_, session) = opened(
            &credentials,
            &directory.join("sami"),
            &store,
            &invitation,
            &code,
            CHOSEN,
            ISSUED_AT + 1,
        )
        .await;
        let session = session.expect("the invitation did not open");
        let member = store
            .member(&owner.verifying_key, &session.member_id)
            .await
            .expect("the row")
            .expect("sami's row");

        assert!(!member.must_change_password, "the join set no password");
        assert!(
            store
                .member_locked(&owner.verifying_key, &member, false)
                .await
                .expect("the lock"),
            "the join unlocked the account"
        );
        assert_eq!(
            store
                .signed_member_locks(&owner.verifying_key)
                .await
                .expect("the locks")
                .into_iter()
                .find(|(_, lock)| lock.member_id == session.member_id)
                .map(|(signer, lock)| (signer, lock.locked)),
            Some((
                crate::organization::workspace::signer_of(&store, &owner)
                    .await
                    .expect("the owner's signer")
                    .1
                    .id,
                true
            )),
            "the lock is not the inviter's, or does not verify"
        );
    }

    /// Effort 851, requirement 35: **an invitee cannot unlock themselves before their machine has
    /// read the marker.** Their machine joined and latched their own lock as it did; they then
    /// delete their own lock row and the owner's marker from the replica. They still read as
    /// locked, in the session the join opened and in one opened afresh from the record, and an
    /// organization act is refused as locked.
    #[tokio::test]
    async fn an_invitee_who_deletes_their_lock_and_the_marker_still_reads_locked() {
        let credentials = Memory::new();
        let directory = scratch("join-lock-deleted");
        let (store, owner, _, invitation, workspace_id, code) =
            invited(&credentials, &directory).await;
        let (machine, session) = opened(
            &credentials,
            &directory.join("sami"),
            &store,
            &invitation,
            &code,
            CHOSEN,
            ISSUED_AT + 1,
        )
        .await;
        let session = session.expect("the invitation did not open");

        for member_id in [&session.member_id, &owner.member_id] {
            store
                .connection()
                .execute(
                    "DELETE FROM \"member_lock\" WHERE \"member_id\" = ?",
                    vec![turso::Value::Text(member_id.clone())],
                )
                .await
                .expect("the row deleted");
        }

        let held = held_by(&machine);
        let member = store
            .member(&owner.verifying_key, &session.member_id)
            .await
            .expect("the row")
            .expect("sami's row");

        assert_eq!(
            held.own_lock_latched,
            vec![session.member_id.clone()],
            "the join latched no lock of the invitee's own"
        );
        assert!(
            store
                .member_locked(&owner.verifying_key, &member, true)
                .await
                .expect("the lock"),
            "deleting the lock and the marker unlocked the invitee on their own machine"
        );

        let again = sign_in(&store, &held, CHOSEN, &slot())
            .await
            .expect("sami signs in again");

        for session in [&session, &again] {
            match crate::organization::workspace::rename_workspace(
                &store,
                session,
                &workspace_id,
                "Mine",
                ISSUED_AT + 2,
            )
            .await
            {
                Err(Error::Refused { reason, .. }) => assert_eq!(reason, RefusalReason::Locked),
                other => panic!("the invitee's act was not refused as locked: {other:?}"),
            }
        }
    }

    /// Effort 851, requirements 33 and 36: **the join latches the joiner's own lock and nobody
    /// else's.** On an organization the owner has not marked, a manager joins by their link and is
    /// unlocked; a peer who set a password has no lock row. On the manager's machine the
    /// directory reads the peer unlocked, in the session the join opened and in one opened afresh
    /// from the record, and a role the manager gives the peer does not lock them.
    #[tokio::test]
    async fn a_joiners_machine_reads_a_peer_with_no_lock_as_the_unmarked_organization_stands() {
        let credentials = Memory::new();
        let directory = scratch("join-lock-own");
        let (store, owner, link, invitation, workspace_id, code) =
            invited(&credentials, &directory).await;
        let manager = make_account_and_link(
            &store,
            &owner,
            no_platform(),
            &link,
            Invitation {
                username: "ada.manager",
                role: permission::MANAGER,
                workspaces: &full(std::slice::from_ref(&workspace_id)),
            },
            test_cost(),
            ISSUED_AT,
        )
        .await
        .expect("the manager's invitation");
        let (machine, ada) = opened(
            &credentials,
            &directory.join("ada"),
            &store,
            &JoinLink::decode(&manager.join_link).expect("the manager's link"),
            &manager.code,
            CHOSEN,
            ISSUED_AT + 1,
        )
        .await;
        let ada = ada.expect("the manager's invitation did not open");

        crate::organization::member::lock::unlocked_for_a_test(&store, &owner, &ada.member_id)
            .await
            .expect("the owner unlocks ada");

        // sami arrives by their own link and chooses a password, and then has no lock row: a
        // member carried over from before the lock, who reads unlocked until the owner marks.
        let (_, sami) = opened(
            &credentials,
            &directory.join("sami"),
            &store,
            &invitation,
            &code,
            "a password sami chose too",
            ISSUED_AT + 1,
        )
        .await;
        let sami = sami.expect("sami's invitation did not open").member_id;

        for member_id in [&sami, &owner.member_id] {
            store
                .connection()
                .execute(
                    "DELETE FROM \"member_lock\" WHERE \"member_id\" = ?",
                    vec![turso::Value::Text(member_id.clone())],
                )
                .await
                .expect("the row deleted");
        }

        let sami_locked = async |session: &MemberSession| {
            crate::organization::invitation::standings(&store, session, ISSUED_AT + 2)
                .await
                .expect("the standings")
                .into_iter()
                .find(|standing| standing.member_id == sami)
                .expect("sami's standing")
                .locked
        };
        let held = held_by(&machine);

        assert!(
            !sami_locked(&ada).await,
            "the join's session read a member with no lock row locked"
        );

        crate::organization::role::assign_role(
            &store,
            &ada,
            &sami,
            permission::MEMBER,
            None,
            ISSUED_AT + 3,
        )
        .await
        .expect("ada gives sami a role");

        assert_ne!(
            store
                .member_locks(&owner.verifying_key)
                .await
                .expect("the locks")
                .rows
                .get(&sami),
            Some(&true),
            "a role given on the joiner's machine locked sami"
        );

        // and a session opened afresh from ada's record, whose sign-in writes the rows it finds
        // missing, reads sami as the organization stands.
        let again = sign_in(&store, &held, CHOSEN, &slot())
            .await
            .expect("ada signs in again");

        assert!(
            !sami_locked(&again).await,
            "a session from the joiner's record read a member with no lock row locked"
        );
    }

    /// Effort 828, requirement 1: **reading a link is a decode, and it reaches nothing.**
    ///
    /// An invitation link names the organization, says which kind of link it is and says when it
    /// lapses, and the read touches no replica, which is what makes it answerable before anybody
    /// has typed a code. A link for an invitation nobody issued reads exactly like one for an
    /// invitation that stands, because a decode has no row to tell them apart; which it is, is what
    /// the accept answers, and the test below it is where that is pinned.
    #[tokio::test]
    async fn reading_a_link_is_a_decode_and_says_nothing_about_the_row() {
        let credentials = Memory::new();
        let directory = scratch("read");
        let (_, owner, link, invitation, _, _) = invited(&credentials, &directory).await;

        let shape =
            crate::organization::invitation::link::read(&invitation.encode().expect("the link"))
                .expect("the invitation link could not be read");

        assert_eq!(shape.organization_name, "Acme");
        assert_eq!(shape.organization_id, owner.organization_id);
        assert_eq!(shape.kind, LinkKind::Invitation);
        assert_eq!(
            shape.expires_at,
            ISSUED_AT + TEST_LIFETIME_MS,
            "the invitation link does not lapse with its row"
        );

        // the same link with its id pointed at an invitation nobody issued reads the same: a
        // decode has no row in front of it.
        let gone = link.sealed(
            &invitation.credential,
            Half {
                id: "an-invitation-nobody-issued".to_string(),
                ..invitation.half.clone()
            },
        );

        assert_eq!(
            crate::organization::invitation::link::read(&gone.encode().expect("the link"))
                .expect("the gone link could not be read")
                .kind,
            LinkKind::Invitation
        );
    }

    /// Criterion 19 and effort 826's criterion 8: over a store with two members, the owner signs
    /// in by username and password on a machine that connected by link and knew no member, in
    /// whatever case and spacing the username was typed, and the record then names them and their
    /// role, on disk. The invited member opens their link on their own machine choosing a
    /// password: their vault is resealed under it, the invitation is spent, the record names
    /// them, and they are signed in with nothing left to change. The password they chose is what
    /// admits them at the wall from then on, the secret the link carried opens nothing, and the
    /// link opened a second time is refused as already opened.
    #[tokio::test]
    async fn the_owner_signs_in_at_the_wall_and_the_invited_member_opens_their_link() {
        let credentials = Memory::new();
        let directory = scratch("admit");
        let (store, owner, link, invitation, workspace_id, code) =
            invited(&credentials, &directory).await;

        // the owner, on a second machine, by the username the first run took and their password,
        // in another case. The credential slot holds the member's own on the way out.
        let owners = scratch("admit-owner");
        let (mut machine, held) = connected_machine(&owners, &store, &link).await;
        let credential = slot();
        let session = admit(
            &credentials,
            &store,
            &mut machine,
            &held,
            "Olivia",
            PASSWORD,
            &credential,
            ISSUED_AT,
        )
        .await
        .expect("the owner did not sign in");

        assert_eq!(session.role, permission::OWNER);
        assert_eq!(session.member_id, owner.member_id);
        assert_eq!(session.permissions, owner.permissions);
        assert!(!session.must_change_password);
        assert_eq!(
            session.workspace_credentials[&workspace_id].token,
            owner.workspace_credentials[&workspace_id].token
        );
        assert_eq!(
            credential.lock().expect("the slot").as_deref(),
            owner
                .organization_credential
                .lock()
                .expect("the slot")
                .as_deref()
        );

        let recorded = machine.selected().expect("the record");

        assert_eq!(recorded.id, link.organization_id);
        assert_eq!(recorded.verifying_key, link.verifying_key);
        assert_eq!(
            recorded.member_id.as_deref(),
            Some(owner.member_id.as_str())
        );
        assert_eq!(recorded.role.as_deref(), Some(permission::OWNER));
        assert_eq!(
            recorded.joined_at,
            ISSUED_AT + 1,
            "the connect's moment stays"
        );

        let written = std::fs::read_to_string(owners.join(RemoteSync::FILENAME)).expect("the file");

        assert!(
            written.contains(&owner.member_id),
            "the record on disk names nobody"
        );
        assert!(
            !written.contains(PASSWORD),
            "the password reached the record"
        );

        // the member, on their own machine, by the link they were sent and a password they chose.
        let theirs = scratch("admit-member");

        assert_eq!(
            invitation_of(&store, &owner, &session.member_id).await,
            None,
            "the owner has an invitation"
        );

        let (mut their_machine, member) = opened(
            &credentials,
            &theirs,
            &store,
            &invitation,
            &code,
            CHOSEN,
            ISSUED_AT + 3,
        )
        .await;
        let member = member.expect("the member could not open their link");
        let their_held = held_by(&their_machine);

        // the accept recorded the organization on a machine that held nothing, which is why the
        // person never had to connect first (effort 828, requirement 1).
        assert_eq!(their_held.id, link.organization_id);
        assert_eq!(their_held.verifying_key, link.verifying_key);
        assert_eq!(their_held.joined_at, ISSUED_AT + 3);

        assert_eq!(member.role, permission::MEMBER);
        assert_eq!(member.permissions, permission::MEMBER_ROLE.mask);
        assert!(
            !member.must_change_password,
            "opening the link left the member with a password to change"
        );
        assert!(member.workspace_credentials.contains_key(&workspace_id));
        assert_eq!(
            member.workspace_credentials[&workspace_id].token,
            owner.workspace_credentials[&workspace_id].token
        );
        assert_eq!(
            invitation_of(&store, &owner, &member.member_id).await,
            Some((ISSUED_AT + TEST_LIFETIME_MS, Some(ISSUED_AT + 3))),
            "the invitation was not spent"
        );

        let recorded = their_machine.selected().expect("the record");

        assert_eq!(
            recorded.member_id.as_deref(),
            Some(member.member_id.as_str())
        );
        assert_eq!(recorded.role.as_deref(), Some(permission::MEMBER));

        let row = store
            .members(&owner.verifying_key)
            .await
            .expect("the rows")
            .into_iter()
            .find(|row| row.id == member.member_id)
            .expect("the member's row");

        assert!(!row.must_change_password, "the row still says to change");

        let written = std::fs::read_to_string(theirs.join(RemoteSync::FILENAME)).expect("the file");
        let secret = invitation.half.secret.clone();

        assert!(
            !written.contains(CHOSEN),
            "the chosen password reached the record"
        );
        assert!(
            !written.contains(&secret),
            "the link's secret reached the record"
        );

        // from now on the wall admits them on the password they chose, and on nothing else.
        let again = admit(
            &credentials,
            &store,
            &mut their_machine,
            &their_held,
            " Sami.Staff ",
            CHOSEN,
            &slot(),
            ISSUED_AT,
        )
        .await
        .expect("the chosen password does not admit the member");

        assert!(!again.must_change_password);
        assert!(
            admit(
                &credentials,
                &store,
                &mut their_machine,
                &their_held,
                "sami.staff",
                &secret,
                &slot(),
                ISSUED_AT,
            )
            .await
            .is_err(),
            "the link's secret still opens the vault"
        );

        // the link opened again on the member's own machine, which holds the organization: its wall
        // is selected and the link is judged there, a consumed invitation refused by name (effort
        // 851, requirements 10 and 13).
        let again = accept(
            &credentials,
            |_| async { Ok::<_, Error>(&store) },
            &mut their_machine,
            &theirs.join(Database::FILENAME),
            &invitation,
            &code,
            "another password entirely",
            test_cost(),
            ISSUED_AT + 4,
        )
        .await;

        assert!(
            matches!(again.as_ref().map(|_| ()), Err(Error::Refused { reason: RefusalReason::Consumed, message })
                if message.contains("Acme")),
            "a consumed invitation opened again was not refused as already used"
        );
        assert_eq!(
            invitation_of(&store, &owner, &member.member_id).await,
            Some((ISSUED_AT + TEST_LIFETIME_MS, Some(ISSUED_AT + 3))),
            "the second opening moved the invitation"
        );

        // and on a third machine that holds nothing, the same spent link is refused with nothing
        // recorded: the row is judged before the organization is (effort 851, requirement 10).
        // *It landed that machine connected, at the wall, until then.* What is left on disk is
        // `a_spent_invitation_link_records_nothing_on_either_machine`'s.
        let third = scratch("admit-third");
        let (spent_machine, spent) = opened(
            &credentials,
            &third,
            &store,
            &invitation,
            &code,
            CHOSEN,
            ISSUED_AT + 5,
        )
        .await;

        assert!(
            matches!(
                spent,
                Err(Error::Refused {
                    reason: RefusalReason::Consumed,
                    ..
                })
            ),
            "{spent:?}"
        );
        assert!(
            spent_machine.selected().is_none(),
            "a spent link recorded the organization"
        );
    }

    /// Criterion 19's refusals, over the same two members once the member has opened their link:
    /// the wrong password, a username nobody holds, and a username somebody holds with another
    /// member's password are each refused with the same one sentence, so nothing says whether the
    /// username exists; nothing is recorded, and the invitation is as the accept left it.
    #[tokio::test]
    async fn the_wrong_password_an_unknown_username_and_another_members_password_are_one_sentence()
    {
        let credentials = Memory::new();
        let directory = scratch("refused");
        let (store, owner, link, invitation, _, code) = invited(&credentials, &directory).await;
        let (_, member) = opened(
            &credentials,
            &scratch("refused-member"),
            &store,
            &invitation,
            &code,
            CHOSEN,
            ISSUED_AT + 2,
        )
        .await;
        let member_id = member.expect("the member").member_id;
        let (mut machine, held) =
            connected_machine(&scratch("refused-machine"), &store, &link).await;
        let mut sentences = Vec::new();

        for (username, password) in [
            ("sami.staff", "not the password"),
            ("olivia", "not the password"),
            ("nobody.here", PASSWORD),
            ("nobody.here", CHOSEN),
            ("sami.staff", PASSWORD),
            ("olivia", CHOSEN),
            ("", PASSWORD),
            ("", "not the password"),
        ] {
            let refused = admit(
                &credentials,
                &store,
                &mut machine,
                &held,
                username,
                password,
                &slot(),
                ISSUED_AT,
            )
            .await
            .expect_err(&format!("{username:?} signed in with {password:?}"));

            assert!(
                matches!(
                    refused,
                    Error::Refused {
                        reason: crate::error::RefusalReason::CredentialsWrong,
                        ..
                    }
                ),
                "{username:?} with {password:?}: {refused:?}"
            );
            sentences.push(refused.to_string());
        }

        sentences.dedup();

        assert_eq!(
            sentences,
            vec!["the username and password do not open a place in Acme".to_string()],
            "the refusals differ"
        );
        assert_eq!(
            machine
                .selected()
                .and_then(|held| held.member_id.as_deref()),
            None,
            "a refusal recorded a member"
        );
        assert_eq!(
            invitation_of(&store, &owner, &member_id).await,
            Some((ISSUED_AT + TEST_LIFETIME_MS, Some(ISSUED_AT + 2))),
            "a refusal moved the invitation"
        );
    }

    /// What an accept refuses before it opens anything: a password under the floor, and a link
    /// under a machine half, which is what an account with a password is handed and invites nobody.
    /// Nothing is recorded and the invitation is not spent by either.
    #[tokio::test]
    async fn an_accept_refuses_a_short_password_and_a_link_with_no_half() {
        let credentials = Memory::new();
        let directory = scratch("accept-refused");
        let (store, owner, link, invitation, _, code) = invited(&credentials, &directory).await;
        let mut machine = Persisted::<RemoteSyncStore>::load(
            scratch("accept-refused-machine").join(RemoteSync::FILENAME),
        )
        .expect("the machine");
        let member_id = {
            let members = store
                .members(&owner.verifying_key)
                .await
                .expect("the members");

            members
                .iter()
                .find(|member| member.id != owner.member_id)
                .expect("the invited member")
                .id
                .clone()
        };

        let refused = accept_on(
            &credentials,
            &mut machine,
            &store,
            &invitation,
            &code,
            "short",
            ISSUED_AT + 2,
        )
        .await;

        assert!(
            matches!(
                refused,
                Err(Error::Refused {
                    reason: crate::error::RefusalReason::PasswordTooShort,
                    ..
                })
            ),
            "{refused:?}"
        );

        // a link that is not an invitation's: the same locator and payload under a machine half,
        // which is what an account with a password is handed and is refused here by name.
        let a_machines = link.sealed(
            &invitation.credential,
            Half {
                kind: HalfKind::Machine,
                ..invitation.half.clone()
            },
        );
        let refused = accept_on(
            &credentials,
            &mut machine,
            &store,
            &a_machines,
            &code,
            CHOSEN,
            ISSUED_AT + 2,
        )
        .await;

        assert!(
            matches!(
                refused,
                Err(Error::Refused {
                    reason: crate::error::RefusalReason::LinkNotAnInvitation,
                    ..
                })
            ),
            "{refused:?}"
        );
        assert_eq!(
            machine.selected(),
            None,
            "a refusal recorded the organization"
        );
        assert_eq!(
            invitation_of(&store, &owner, &member_id).await,
            Some((ISSUED_AT + TEST_LIFETIME_MS, None)),
            "a refusal spent the invitation"
        );
    }

    /// Effort 851, criteria 1 and 13, for an invitation link: **a link for another organization is
    /// an add, and one for an organization held is judged on its replica.**
    ///
    /// A machine already holding another organization opens the link: the person is admitted, the
    /// machine holds both, the new one is selected, and the other's entry is as it was. Opened on a
    /// machine that holds the link's organization already, the link is judged on that
    /// organization's replica (requirement 13, as the human settled it on 2026-10-05): an unused
    /// invitation for somebody who never arrived is refused as already used, nobody is admitted, no
    /// key is filed, the invitation is not spent and the record is the same file.
    #[tokio::test]
    async fn an_invitation_for_another_organization_adds_it_and_an_unused_one_for_a_held_organization_is_refused()
     {
        let credentials = Memory::new();
        let directory = scratch("accept-adds");
        let (store, owner, link, invitation, _, code) = invited(&credentials, &directory).await;
        let (_, held) = connected_machine(&scratch("accept-adds-template"), &store, &link).await;
        let another = HeldOrganization {
            id: "another".to_string(),
            name: "Other".to_string(),
            machine_id: "machine-of-another".to_string(),
            member_id: Some("member-of-another".to_string()),
            ..held.clone()
        };

        // a machine holding another organization: the link adds the link's.
        let mut elsewhere = Persisted::<RemoteSyncStore>::load(
            scratch("accept-adds-elsewhere").join(RemoteSync::FILENAME),
        )
        .expect("the machine");

        elsewhere.hold(another.clone());
        elsewhere.commit().expect("the record");

        let session = accept_on(
            &credentials,
            &mut elsewhere,
            &store,
            &invitation,
            &code,
            CHOSEN,
            ISSUED_AT + 2,
        )
        .await
        .expect("the link for another organization was refused");

        assert_eq!(
            elsewhere
                .held_organizations
                .iter()
                .map(|held| held.id.as_str())
                .collect::<Vec<_>>(),
            vec!["another", link.organization_id.as_str()],
            "the machine does not hold both"
        );
        assert_eq!(
            elsewhere.selected().map(|held| held.id.as_str()),
            Some(link.organization_id.as_str()),
            "the new organization is not the selected one"
        );
        assert_eq!(
            elsewhere.held("another"),
            Some(&another),
            "the add touched the other organization's entry"
        );
        assert_eq!(
            elsewhere
                .selected()
                .and_then(|held| held.member_id.as_deref()),
            Some(session.member_id.as_str())
        );

        // a machine holding the link's organization beside another, which is selected: the link
        // selects its organization and is judged on its replica, where an unused invitation for
        // somebody who never arrived is refused as already used with the record as it was.
        let invited = scratch("accept-selects-machine");
        let made = make_account_and_link(
            &store,
            &owner,
            no_platform(),
            &link,
            Invitation {
                username: "noor",
                role: permission::MEMBER,
                workspaces: &[],
            },
            test_cost(),
            ISSUED_AT + 3,
        )
        .await
        .expect("a second invitation");
        let second_link = JoinLink::decode(&made.join_link).expect("the second link");
        let mut machine = Persisted::<RemoteSyncStore>::load(invited.join(RemoteSync::FILENAME))
            .expect("the machine");
        let holding = held.clone();

        machine.hold(another.clone());
        machine.hold(holding.clone());
        machine.commit().expect("the record");

        let record = std::fs::read(machine.path()).expect("the record");
        let accepted = accept(
            &credentials,
            |_| async { Ok::<_, Error>(&store) },
            &mut machine,
            &invited.join(Database::FILENAME),
            &second_link,
            &made.code,
            CHOSEN,
            test_cost(),
            ISSUED_AT + 4,
        )
        .await;

        assert!(
            matches!(
                accepted.as_ref().map(|_| ()),
                Err(Error::Refused {
                    reason: RefusalReason::Consumed,
                    ..
                })
            ),
            "an unused invitation for a held organization was not refused as already used"
        );
        assert_eq!(
            std::fs::read(machine.path()).expect("the record"),
            record,
            "the refusal wrote the record"
        );
        assert_eq!(
            machine.selected(),
            Some(&holding),
            "the held organization was not selected, or its entry changed"
        );
        assert_eq!(machine.held("another"), Some(&another));
        assert_eq!(machine.held_organizations.len(), 2, "something was added");
        assert_eq!(
            invitation_of(&store, &owner, &made.member_id).await,
            Some((ISSUED_AT + 3 + TEST_LIFETIME_MS, None)),
            "the invitation was spent"
        );
        assert_eq!(
            credentials
                .get(
                    MEMBER_KEY_SERVICE,
                    &format!("{}:{}", second_link.organization_id, made.member_id)
                )
                .expect("the store would not answer"),
            None,
            "a key was filed"
        );
    }

    /// A link whose invitation row is gone is refused by name, and the machine it was opened on
    /// records nothing. A reset is what takes a row away now: it deletes the account's unspent
    /// invitation and issues another, so a link somebody kept points at nothing and is told so.
    /// *The row was taken here by a revoke, under effort 826's requirement 15, until effort 828
    /// found nothing calling it; the row is deleted directly instead. The machine landed at the
    /// wall until effort 851's requirement 10 judged the row before recording anything.*
    #[tokio::test]
    async fn a_link_whose_invitation_row_is_gone_is_refused_and_records_nothing() {
        let credentials = Memory::new();
        let directory = scratch("revoked");
        let (store, owner, link, _, _, _) = invited(&credentials, &directory).await;
        let gone = make_account_and_link(
            &store,
            &owner,
            no_platform(),
            &link,
            Invitation {
                username: "gone.member",
                role: permission::MEMBER,
                workspaces: &[],
            },
            test_cost(),
            ISSUED_AT,
        )
        .await
        .expect("the invitation failed");
        let their_link = JoinLink::decode(&gone.join_link).expect("the link");

        store
            .delete_invitation(&gone.invitation_id)
            .await
            .expect("the invitation row could not be deleted");

        let (machine, refused) = opened(
            &credentials,
            &scratch("revoked-machine"),
            &store,
            &their_link,
            &gone.code,
            CHOSEN,
            ISSUED_AT + 2,
        )
        .await;

        assert!(
            matches!(refused, Err(Error::Refused { reason: RefusalReason::Revoked, ref message })
                if message.contains("Acme")),
            "{refused:?}"
        );
        // the code was right and the organization was reached, but the row is judged before
        // anything is recorded, so the machine holds nothing (effort 851, requirement 10).
        assert!(
            machine.selected().is_none(),
            "a refused link recorded the organization"
        );
    }

    /// A member whose invitation lapsed before they opened it is refused by name, with the lapse
    /// said, since a reissue is what they need; the record is not filled and the invitation is not
    /// spent. A reissue is a fresh link: the lapsed one then stands revoked, and the fresh one
    /// admits them on a password of their choosing (effort 826, requirement 9).
    #[tokio::test]
    async fn a_lapsed_invitation_refuses_the_link_by_name_and_a_reissue_admits() {
        let credentials = Memory::new();
        let directory = scratch("lapsed");
        let (store, owner, link, _, _, _) = invited(&credentials, &directory).await;
        let late = make_account_and_link(
            &store,
            &owner,
            no_platform(),
            &link,
            Invitation {
                username: "late.member",
                role: permission::MEMBER,
                workspaces: &[],
            },
            test_cost(),
            ISSUED_AT,
        )
        .await
        .expect("the second invitation failed");
        let their_link = JoinLink::decode(&late.join_link).expect("the link");
        let after = ISSUED_AT + TEST_LIFETIME_MS;
        let theirs = scratch("lapsed-machine");

        let (mut machine, refused) = opened(
            &credentials,
            &theirs,
            &store,
            &their_link,
            &late.code,
            CHOSEN,
            after,
        )
        .await;

        assert!(
            matches!(refused, Err(Error::Refused { reason: RefusalReason::Lapsed, ref message })
                if message.contains("Acme")),
            "{refused:?}"
        );
        // refused on the link's own moment, before any key was derived, so nothing was reached and
        // the machine holds nothing (effort 828, requirement 1).
        assert_eq!(
            machine.selected(),
            None,
            "a lapsed link reached the organization"
        );
        assert_eq!(
            invitation_of(&store, &owner, &late.member_id).await,
            Some((after, None))
        );

        let reissued = crate::organization::invitation::reset_account(
            &store,
            &owner,
            no_platform(),
            &link,
            &late.member_id,
            test_cost(),
            after,
        )
        .await
        .expect("the reissue failed");
        let fresh = JoinLink::decode(&reissued.join_link).expect("the fresh link");

        assert_ne!(fresh, their_link, "a reissue handed the same link");

        let refused = accept_on(
            &credentials,
            &mut machine,
            &store,
            &their_link,
            &late.code,
            CHOSEN,
            after + 1,
        )
        .await;

        assert!(
            matches!(
                refused,
                Err(Error::Refused {
                    reason: RefusalReason::Lapsed,
                    ..
                })
            ),
            "the lapsed link still opens: {refused:?}"
        );

        let member = accept_on(
            &credentials,
            &mut machine,
            &store,
            &fresh,
            &reissued.code,
            CHOSEN,
            after + 1,
        )
        .await
        .expect("the reissued member could not open their link");

        assert!(!member.must_change_password);
        assert_eq!(
            invitation_of(&store, &owner, &late.member_id).await,
            Some((after + TEST_LIFETIME_MS, Some(after + 1)))
        );
    }

    /// Effort 826, requirement 9: a member who forgot their password is reset, and the reset is a
    /// fresh link. Their old password stops admitting them the moment the reset is made, the link
    /// admits them on a new one, and what they held is theirs again.
    #[tokio::test]
    async fn a_reset_link_brings_a_member_who_forgot_their_password_back() {
        let credentials = Memory::new();
        let directory = scratch("reset");
        let (store, owner, link, invitation, workspace_id, code) =
            invited(&credentials, &directory).await;
        let theirs = scratch("reset-machine");
        let (mut machine, member) = opened(
            &credentials,
            &theirs,
            &store,
            &invitation,
            &code,
            CHOSEN,
            ISSUED_AT + 2,
        )
        .await;
        let member = member.expect("the member");
        let held = held_by(&machine);

        let reset = crate::organization::invitation::reset_account(
            &store,
            &owner,
            no_platform(),
            &link,
            &member.member_id,
            test_cost(),
            ISSUED_AT + 3,
        )
        .await
        .expect("the reset failed");
        let fresh = JoinLink::decode(&reset.join_link).expect("the reset link");

        assert!(
            admit(
                &credentials,
                &store,
                &mut machine,
                &held,
                "sami.staff",
                CHOSEN,
                &slot(),
                ISSUED_AT,
            )
            .await
            .is_err(),
            "the forgotten password still opens the reset vault"
        );

        // on the machine that holds the organization, the one they work from: a reset link is the
        // one link let through there (effort 851, requirement 13, as the human settled it).
        let back = accept_on(
            &credentials,
            &mut machine,
            &store,
            &fresh,
            &reset.code,
            "a new password sami chose",
            ISSUED_AT + 4,
        )
        .await
        .expect("the reset link did not admit the member");

        assert_eq!(back.member_id, member.member_id);
        assert!(!back.must_change_password);
        assert!(back.workspace_credentials.contains_key(&workspace_id));
        assert!(
            admit(
                &credentials,
                &store,
                &mut machine,
                &held,
                "sami.staff",
                "a new password sami chose",
                &slot(),
                ISSUED_AT,
            )
            .await
            .is_ok(),
            "the new password does not admit the member at the wall"
        );
    }

    /// Signing out leaves the record naming the organization with its member: the sign-out
    /// drops the keys this process held and the replica, and the record on disk is exactly what
    /// the sign-in wrote. Driven through the routine `organization_session_sign_out` calls, over
    /// the organization's state built the way the plugins' setups build it.
    #[tokio::test]
    async fn signing_out_leaves_the_record_naming_the_organization_with_its_member() {
        let credentials = Memory::new();
        let directory = scratch("sign-out");
        let (store, owner, link, _, _, _) = invited(&credentials, &directory).await;
        let theirs = scratch("sign-out-machine");
        let (mut machine, held) = connected_machine(&theirs, &store, &link).await;
        let session = admit(
            &credentials,
            &store,
            &mut machine,
            &held,
            "olivia",
            PASSWORD,
            &slot(),
            ISSUED_AT,
        )
        .await
        .expect("the owner did not sign in");
        let signed_in = machine.selected().cloned().expect("the record");

        drop(machine);

        // the organization's state over the second machine's directory, with the person in.
        let app_state = state_over(&theirs).await;

        *app_state.organization.write().await = Some(store);
        *app_state.member.write().await = Some(session);

        crate::organization::session::sign_out(&app_state, &credentials).await;

        assert!(
            app_state.member.read().await.is_none(),
            "the keys were kept"
        );
        assert!(
            app_state.organization.read().await.is_none(),
            "the replica was kept"
        );

        let recorded = app_state
            .remote_sync
            .write()
            .await
            .store_mut()
            .selected()
            .cloned();

        assert_eq!(recorded.as_ref(), Some(&signed_in));
        assert_eq!(
            recorded.as_ref().and_then(|held| held.member_id.as_deref()),
            Some(owner.member_id.as_str())
        );

        let written = std::fs::read_to_string(theirs.join(RemoteSync::FILENAME)).expect("the file");

        assert!(written.contains(&link.organization_id));
        assert!(written.contains(&owner.member_id));
    }

    /// The organization's state over one data directory, as the plugins' setups build it, with
    /// nothing open and nobody in. `remote-sync.json` is loaded from the directory, so a test
    /// writes the record it wants first. *`session/forget.rs` keeps the same builder; a fixture is
    /// written out per module ([[rules/testing]]).*
    async fn state_over(directory: &std::path::Path) -> Shared {
        let mut settings =
            Persisted::<Settings>::load(directory.join(Settings::FILENAME)).expect("the settings");
        settings.database_path = directory.join(Database::FILENAME);
        settings.recovery_path = directory.join(Update::FILENAME);
        settings.commit().expect("the settings");

        let settings = Arc::new(RwLock::new(settings));
        let remote_sync = RemoteSync::new(
            settings.clone(),
            directory.join(RemoteSync::FILENAME),
            crate::clock::System::shared(),
        )
        .await
        .expect("the sync record");
        // the update is the `update` plugin's and no part of this state, and it is made as a launch
        // makes it, so the directory holds the file a launch leaves.
        Update::new(settings.clone(), &crate::clock::System)
            .await
            .expect("the update");

        Shared {
            db: Arc::new(RwLock::new(Database::new(
                settings.clone(),
                crate::clock::System::shared(),
            ))),
            settings,
            remote_sync: Arc::new(RwLock::new(remote_sync)),
            upgrade: Arc::new(crate::upgrade::Upgrader),
            credentials: Arc::new(crate::credential::Memory::new()),
            consent: Arc::new(TursoConsent::new()),
            organization: Arc::new(RwLock::new(None)),
            member: Arc::new(RwLock::new(None)),
            arriving_link: Arc::new(Mutex::new(None)),
            signed_out_elsewhere: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            held_by_version: Arc::new(std::sync::Mutex::new(None)),
            old_shape_check: tokio::sync::OnceCell::new(),
            bringing_up: Default::default(),
        }
    }

    /// Effort 826, requirement 23 and effort 828, requirement 1: **the code is a key half and not
    /// a check, and it is the only thing between a found link and the directory.**
    ///
    /// A link whose secret is right and whose code is wrong opens neither the payload nor the
    /// vault; the link's own expiry is bound into the seal, so a rewritten copy opens nothing;
    /// a link past that moment is refused before any key is derived and reaches nothing; no code
    /// at all is refused as input; and the right code unseals the credential, reaches the
    /// organization, records it on a machine that held nothing, and spends the invitation.
    ///
    /// **Nothing here leans on the clock for the refusal a wrong code gets.** Every wrong-code
    /// read below runs at a moment the link is open at, so what refuses them is the tag.
    #[tokio::test]
    async fn the_link_secret_alone_opens_neither_the_payload_nor_the_vault() {
        let credentials = Memory::new();
        use crate::organization::{
            invitation::link::{code_salt, payload_context},
            member::vault::{derive_member_key, open_under_member_key, open_vault},
        };

        let directory = scratch("code");
        let (store, owner, link, invitation, _, code) = invited(&credentials, &directory).await;
        let half = invitation.half.clone();
        let sealed = invitation.credential.clone();
        let theirs = scratch("code-machine");

        assert_eq!(half.expires_at, ISSUED_AT + TEST_LIFETIME_MS);
        assert_eq!(code.chars().count(), 6, "the code is not six characters");
        assert!(
            code.chars().all(|character| character.is_ascii_digit()
                || (character.is_ascii_uppercase() && !matches!(character, 'I' | 'L' | 'O' | 'U'))),
            "the code is spelled outside its alphabet: {code}"
        );

        // the link's secret is not the vault's password, and it is not the code either: neither
        // the payload nor the vault opens on it.
        let bytes =
            base64::Engine::decode(&base64::engine::general_purpose::URL_SAFE_NO_PAD, &sealed)
                .expect("the sealed payload is base64url");
        let salt = code_salt(&half.secret).expect("the salt");
        let context = payload_context(&invitation.locator(), &half);

        for wrong in [half.secret.as_str(), "ABCDEF", "000000"] {
            let key = derive_member_key(wrong, &salt, test_cost()).expect("a key");

            assert!(
                open_under_member_key(&key, &context, &bytes).is_err(),
                "{wrong:?} opened the payload"
            );
        }

        let member_row = store
            .members(&owner.verifying_key)
            .await
            .expect("the members")
            .into_iter()
            .find(|member| member.id != owner.member_id)
            .expect("the invited member");

        assert!(
            open_vault(&half.secret, &member_row.vault).is_err(),
            "the link's secret opens the invited vault on its own"
        );

        // the expiry is bound into the seal: a link whose moment somebody moved opens nothing on
        // the right code, so the clock has bought the person rewriting it nothing.
        let rewritten = link.sealed(
            &sealed,
            Half {
                expires_at: half.expires_at + 600_000,
                ..half.clone()
            },
        );
        let mut machine = Persisted::<RemoteSyncStore>::load(theirs.join(RemoteSync::FILENAME))
            .expect("the machine");
        let refused = accept_on(
            &credentials,
            &mut machine,
            &store,
            &rewritten,
            &code,
            CHOSEN,
            ISSUED_AT + 1,
        )
        .await;

        assert!(
            matches!(refused, Err(Error::Refused { reason: crate::error::RefusalReason::CodeWrong, ref message }) if message == CODE_REFUSED),
            "a rewritten expiry opened the payload: {refused:?}"
        );

        // a wrong code, at a moment the link is open at: the tag refuses it, by name.
        let refused = accept_on(
            &credentials,
            &mut machine,
            &store,
            &invitation,
            "ABCDEF",
            CHOSEN,
            ISSUED_AT + 1,
        )
        .await;

        assert!(
            matches!(refused, Err(Error::Refused { reason: crate::error::RefusalReason::CodeWrong, ref message }) if message == CODE_REFUSED),
            "{refused:?}"
        );

        // no code at all is about what the person did, and is refused as input.
        let refused = accept_on(
            &credentials,
            &mut machine,
            &store,
            &invitation,
            "   ",
            CHOSEN,
            ISSUED_AT + 1,
        )
        .await;

        assert!(
            matches!(refused, Err(Error::Refused { reason: crate::error::RefusalReason::CodeMissing, ref message }) if message == CODE_MISSING),
            "{refused:?}"
        );

        // the link's own moment, past: refused as a lapsed link before any key is derived.
        let refused = accept_on(
            &credentials,
            &mut machine,
            &store,
            &invitation,
            &code,
            CHOSEN,
            half.expires_at,
        )
        .await;

        assert!(
            matches!(refused, Err(Error::Refused { reason: RefusalReason::Lapsed, ref message })
                if message.contains("Acme")),
            "{refused:?}"
        );

        // none of the four reached anything: the machine holds no organization, because the
        // credential that would reach one is what the code was standing in front of.
        assert_eq!(
            machine.selected(),
            None,
            "a refused code reached the organization"
        );

        // and the right code opens the payload, reaches the organization, records it and spends
        // the invitation.
        let member = accept_on(
            &credentials,
            &mut machine,
            &store,
            &invitation,
            &code,
            CHOSEN,
            ISSUED_AT + 2,
        )
        .await
        .expect("the right code did not open the invitation");

        assert!(!member.must_change_password);
        assert_eq!(held_by(&machine).id, link.organization_id);
        assert_eq!(
            held_by(&machine).member_id.as_deref(),
            Some(member.member_id.as_str())
        );

        let spent = invitation_row(&store, &owner, &half.id).await;

        assert_eq!(spent.consumed_at, Some(ISSUED_AT + 2));

        // the payload the link carried is the issuer's own grant on the organization database,
        // which is the credential the machine read the rows with.
        let payload = open_payload(&code, &invitation.locator(), &half, &sealed, test_cost())
            .expect("the payload");

        assert_eq!(
            Some(payload.credential.as_str()),
            owner
                .organization_credential
                .lock()
                .expect("the slot")
                .as_deref()
        );
        assert_eq!(half.kind, HalfKind::Invitation);
    }

    /// One invitation row, verified, by its id.
    async fn invitation_row(
        store: &OrganizationStore,
        session: &MemberSession,
        invitation_id: &str,
    ) -> crate::organization::store::InvitationRecord {
        store
            .invitations(&session.verifying_key)
            .await
            .expect("the invitations")
            .into_iter()
            .find(|row| row.id == invitation_id)
            .expect("the invitation row")
    }

    /// Criterion 15 against the rows a real invitation wrote: given the link's contents and a
    /// credential that reads every row, no username or workspace name is legible.
    /// `store/` proves it over hand-written rows; this is the same read over what `invite` and
    /// `create_workspace` actually write.
    ///
    /// **The code, the vault password and the organization credential are swept for too** (effort
    /// 826, requirement 23; effort 828, requirement 1). The code is what the link holder does not
    /// have, the vault password is what the two together open, and the credential is what reads
    /// the directory: any one of them legible in a cell, or in a link's text, would hand a link
    /// holder what the code stands in front of. The password and the code are read out of the
    /// issuer's own sealed copy, which is the one place either is recoverable at all and needs the
    /// owner's open vault to reach.
    #[tokio::test]
    async fn the_rows_a_link_holder_reads_carry_no_username_and_no_workspace_name() {
        let credentials = Memory::new();
        let directory = scratch("legible");
        let (store, owner, link, invitation, _, code) = invited(&credentials, &directory).await;
        let invitation_text = invitation.encode().expect("the invitation link");
        let half = invitation.half.clone();
        let link_secret = half.secret.clone();
        let row = store
            .invitations(&owner.verifying_key)
            .await
            .expect("the invitations")
            .into_iter()
            .find(|row| row.id == half.id)
            .expect("the invitation row");
        let issuers_copy = String::from_utf8(
            crate::organization::member::vault::unseal_with_secret_key(
                &owner.secret,
                &row.sealed_secret,
            )
            .expect("the issuer's copy"),
        )
        .expect("the issuer's copy is text");
        let held: Vec<&str> = issuers_copy.split('\n').collect();
        let (vault_password, sealed_link_secret, sealed_code) = (held[0], held[1], held[2]);

        assert_eq!(
            sealed_link_secret, link_secret,
            "the issuer's copy does not hold the link's own secret"
        );
        assert_eq!(
            sealed_code, code,
            "the issuer's copy does not hold the code"
        );

        // the credential the link seals is what reads the directory, so it is swept for the way
        // the vault password is (effort 828, requirement 1).
        let credential = owner
            .organization_credential
            .lock()
            .expect("the slot")
            .clone()
            .expect("the owner holds a credential");
        let secrets = [
            "sami.staff",
            "olivia",
            "North",
            "Acme",
            PASSWORD,
            link_secret.as_str(),
            code.as_str(),
            vault_password,
            credential.as_str(),
        ];
        let mut cells = 0;

        for table in crate::organization::store::TABLES {
            let mut rows = store
                .connection()
                .query(&format!("SELECT * FROM \"{table}\""), ())
                .await
                .expect("the rows");

            while let Some(row) = rows.next().await.expect("a row") {
                for index in 0..row.column_count() {
                    let bytes = match row.get_value(index).expect("a value") {
                        turso::Value::Text(text) => text.into_bytes(),
                        turso::Value::Blob(blob) => blob,
                        _ => continue,
                    };

                    cells += 1;

                    for secret in secrets {
                        assert!(
                            !bytes
                                .windows(secret.len())
                                .any(|window| window == secret.as_bytes()),
                            "{secret:?} is legible in a {table} column to anybody holding the \
                             link and the database"
                        );
                    }
                }
            }
        }

        assert!(
            cells > 30,
            "the secrecy test read almost nothing: {cells} cells"
        );

        // and the link's own text carries the organization's name, which is the one name criterion
        // 15 permits, and its own secret, by design, and still no username, no workspace name, no
        // code, no vault password and no credential.
        for secret in [
            "sami.staff",
            "olivia",
            "North",
            PASSWORD,
            code.as_str(),
            vault_password,
            credential.as_str(),
        ] {
            assert!(
                !invitation_text.contains(secret),
                "{secret:?} is in the invitation link"
            );
        }
        assert_eq!(link.organization_name, "Acme");

        // and the locator every link is built from carries no credential at all (effort 828,
        // requirement 16), so there is nothing legible left for a link holder to read off it.
        assert!(
            ![&link.organization_id, &link.verifying_key, &link.remote_url]
                .iter()
                .any(|field| field.contains(&credential)),
            "the locator carries the owner's grant"
        );
    }

    /// Live, at the human's request, and admitted in [[rules/testing]] under *Tests that reach a
    /// live remote* as criterion 6: **an organization provisioned on machine A is restored on
    /// machine B from the link, the username, the password and one consent, with A offline.**
    ///
    /// Two machines are two application data directories in one process, and A is offline in
    /// the sense that matters: its replica is closed and nothing of its directory is read after
    /// the provisioning; B starts from an empty directory and is handed the link text, the
    /// owner's username and password, and the consent's product. The consent's product is the
    /// platform token, read from the environment as every live test here reads it, and it is the
    /// one thing the credential store holds in common between the two, because this test has one
    /// store. What the test cannot cover is two operating-system accounts and two keyrings;
    /// what it does cover is that nothing about the organization is machine-local, which is the
    /// property. The member is admitted on a third directory the same way, by their username and
    /// the password they were handed. Both databases are deleted by the same run. *Under effort
    /// 824 a machine connects by the link and then signs in at the wall; the two steps are what
    /// 819's one restore was.*
    ///
    /// ```text
    /// RENTABLE_LIVE_TURSO=1 TURSO_CONSENT_TOKEN=… TURSO_ORG=… TURSO_GROUP=… \
    ///   cargo test --manifest-path ./apps/desktop/tauri/Cargo.toml \
    ///   restore_live -- --test-threads=1 --ignored --nocapture
    /// ```
    #[tokio::test]
    #[ignore = "reaches a live Turso account and creates two databases; see the doc comment"]
    async fn restore_live_a_second_machine_restores_the_organization_with_the_first_offline() {
        use crate::{
            organization::{
                setup::{CreateOrganization, Remote, create_organization},
                store::OrganizationStore,
                workspace::create_workspace,
            },
            turso::{
                consent::{Account, store_platform_token},
                discovery::{McpEndpoint, TursoOrganization},
                platform::{
                    AccessLevel, DeletionIntent, PlatformApi, PlatformEndpoint, TursoPlatform,
                },
            },
        };

        let credentials = Arc::new(Memory::new());

        let read = |name: &str| {
            std::env::var(name)
                .ok()
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| {
                    panic!("{name} is needed for a live run; see the doc comment above")
                })
        };

        assert_eq!(
            read("RENTABLE_LIVE_TURSO"),
            "1",
            "a live run is armed by RENTABLE_LIVE_TURSO=1 as well as by --ignored"
        );

        let token = read("TURSO_CONSENT_TOKEN");
        store_platform_token(credentials.as_ref(), &token).expect("failed to file the token");

        let organization = TursoOrganization {
            slug: read("TURSO_ORG"),
            group: read("TURSO_GROUP"),
        };
        let now = || {
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|elapsed| elapsed.as_millis() as i64)
                .unwrap_or_default()
        };

        // machine A: the first run, a workspace, and an invitation, all pushed to the account.
        let machine_a = scratch("live-a");
        let mut store_a = Persisted::<RemoteSyncStore>::load(machine_a.join("remote-sync.json"))
            .expect("A's store");
        let (created, organization_a) = create_organization(
            credentials.as_ref(),
            &crate::clock::System::shared(),
            &mut store_a,
            &token,
            &McpEndpoint::production(),
            |organization| {
                PlatformApi::new(
                    PlatformEndpoint::production(),
                    organization,
                    Account::Pending,
                    credentials.clone(),
                )
            },
            Remote::libsql(),
            &machine_a.join("app.db"),
            CreateOrganization {
                name: "t819-18 restore",
                username: "olivia",
                password: PASSWORD,
                // named rather than left to the cascade: this run is against a real account and
                // the group it is over is already in hand, so the live test spends one request
                // rather than three on its way to what it actually measures.
                group: Some(organization.group.as_str()),
            },
            test_cost(),
            now(),
        )
        .await
        .expect("the live first run failed");
        let organization_database = format!("org-{}", created.organization_id);
        // the first run moved the consent to the organization it made (effort 851, requirement
        // 14), so everything after it spends that organization's own.
        let platform = PlatformApi::new(
            PlatformEndpoint::production(),
            organization.clone(),
            Account::of(&created.organization_id),
            credentials.clone(),
        );

        eprintln!("created {organization_database}");
        assert!(
            created.synced,
            "the first run's rows did not reach the account"
        );

        let joined_a = store_a.selected().cloned().expect("the record on A");
        let mut owner_a = sign_in(&organization_a, &joined_a, PASSWORD, &slot())
            .await
            .expect("the owner did not sign in on A");
        let workspace = create_workspace(
            &organization_a,
            &mut owner_a,
            &platform,
            Pipeline::of,
            "North",
            now(),
        )
        .await
        .expect("the live workspace failed");

        eprintln!("created {}", workspace.database_name);

        let link_a = locator(&organization_a, &owner_a).await.expect("the link");
        let invited = make_account_and_link(
            &organization_a,
            &owner_a,
            no_platform(),
            &link_a,
            Invitation {
                username: "sami.staff",
                role: permission::MEMBER,
                workspaces: &full(std::slice::from_ref(&workspace.id)),
            },
            test_cost(),
            now(),
        )
        .await
        .expect("the invitation failed");

        assert!(
            organization_a.push().await,
            "the invitation's rows did not reach the account"
        );

        // machine A goes offline: its replica is closed and its directory is not read again.
        drop(owner_a);
        drop(organization_a);
        drop(store_a);

        let link = link_a;
        // what a link carries now (effort 828, requirement 16): the issuer's own grant, sealed
        // under the code they read out. B opens the invitation's payload with the code it was
        // handed and reaches the organization with what comes out, which is the accept's own path.
        let invitation = JoinLink::decode(&invited.join_link).expect("the invitation link");
        let reached_with = open_payload(
            &invited.code,
            &invitation.locator(),
            &invitation.half,
            &invitation.credential,
            test_cost(),
        )
        .expect("the code did not open the invitation's payload")
        .credential;

        // a machine that has never seen the organization: its replica opened against the remote
        // with that credential, pulled, and the organization recorded with no member.
        let reach = |directory: &std::path::Path| {
            let link = link.clone();
            let reached_with = reached_with.clone();
            let path =
                OrganizationStore::replica_path(&directory.join("app.db"), &link.organization_id);

            async move {
                let credential: CredentialSlot = Arc::new(Mutex::new(Some(reached_with)));
                let slot = Arc::clone(&credential);
                let store = OrganizationStore::open(
                    crate::clock::System::shared(),
                    &path,
                    Some(link.remote_url.clone()),
                    move || {
                        let slot = Arc::clone(&slot);

                        async move {
                            slot.lock()
                                .ok()
                                .and_then(|slot| slot.clone())
                                .ok_or_else(|| turso::Error::Misuse("no credential".into()))
                        }
                    },
                )
                .await
                .expect("the replica did not open");

                assert!(store.pull().await, "nothing was pulled from the account");

                (store, credential)
            }
        };

        // machine B: an empty directory, the link, and the owner's username and password.
        let machine_b = scratch("live-b");
        let (organization_b, credential_b) = reach(&machine_b).await;
        let (mut store_b, held_b) = connected_machine(&machine_b, &organization_b, &link).await;
        let restored = admit(
            credentials.as_ref(),
            &organization_b,
            &mut store_b,
            &held_b,
            "olivia",
            PASSWORD,
            &credential_b,
            ISSUED_AT,
        )
        .await
        .expect("the owner did not sign in on B");

        eprintln!("restored the owner on B as {}", restored.role);
        assert_eq!(restored.role, permission::OWNER);
        assert_eq!(
            Some(restored.member_id.as_str()),
            joined_a.member_id.as_deref()
        );
        assert!(
            restored.workspace_credentials.contains_key(&workspace.id),
            "the restored owner does not hold the workspace"
        );

        // the rows on B verify against the key the link carried, and say what A wrote.
        let members_b = organization_b
            .members(&restored.verifying_key)
            .await
            .expect("B's rows did not verify");
        let grants_b = organization_b
            .grants(&restored.verifying_key)
            .await
            .expect("B's grants did not verify");

        assert_eq!(members_b.len(), 2);
        assert!(grants_b.iter().any(
            |grant| grant.member_id == restored.member_id && grant.workspace_id == workspace.id
        ));

        // the one consent: the authority is not in any row B pulled, and the token the consent
        // produced is what lets B act as the owner again.
        let minted = platform
            .mint_token(&workspace.database_name, "5m", AccessLevel::ReadOnly)
            .await
            .expect("B could not act on the account with the consent's authority");

        assert!(!minted.is_empty());

        // machine C: the member, by the invitation link they were sent and a password they chose.
        // Nothing connects C first: the accept unseals the credential and records the organization
        // itself (effort 828, requirement 1).
        let machine_c = scratch("live-c");
        let (organization_c, _) = reach(&machine_c).await;
        let mut store_c = Persisted::<RemoteSyncStore>::load(machine_c.join(RemoteSync::FILENAME))
            .expect("C's record");
        let member_c = accept_on(
            credentials.as_ref(),
            &mut store_c,
            &organization_c,
            &JoinLink::decode(&invited.join_link).expect("the invitation link"),
            &invited.code,
            CHOSEN,
            now(),
        )
        .await
        .expect("the member could not open their link on C");

        eprintln!("restored the member on C as {}", member_c.role);
        assert_eq!(member_c.role, permission::MEMBER);
        assert!(!member_c.must_change_password);

        // and the member's credential opens the workspace: a replica of it pulls the schema.
        let held = member_c.workspace_credentials[&workspace.id].token.clone();
        let workspace_c = crate::database::Database::open_replica(
            &crate::clock::System,
            &machine_c.join("workspace.db"),
            Some(format!("libsql://{}", workspace.database_hostname)),
            move || {
                let held = held.clone();
                async move { Ok::<String, turso::Error>(held) }
            },
        )
        .await
        .expect("C's workspace replica");

        assert!(
            workspace_c.pull().await.is_ok(),
            "C could not pull the workspace"
        );
        assert!(
            crate::database::Database::is_replica_ready(
                &workspace_c.connect().await.expect("a connection")
            )
            .await,
            "the workspace C pulled holds no schema"
        );

        drop(workspace_c);
        drop(organization_c);
        drop(organization_b);

        for name in [
            workspace.database_name.as_str(),
            organization_database.as_str(),
        ] {
            platform
                .delete_database(name, DeletionIntent::CreatedAndUnreferenced)
                .await
                .unwrap_or_else(|error| {
                    panic!("the live delete of {name} failed, and it is left behind: {error:?}")
                });

            eprintln!("removed {name}");
        }
    }

    /// **Effort 826, requirement 12.** Opening an invitation leaves the machine signed in across a
    /// relaunch: the key the chosen password derives is filed under the member's entry, and it is
    /// the key that opens the vault the accept just resealed rather than the one the link carried.
    #[tokio::test]
    async fn an_accepted_invitation_files_the_key_the_chosen_password_derives() {
        let credentials = Memory::new();
        let directory = scratch("accept-remembers");
        let (store, owner, _, invitation, _, code) = invited(&credentials, &directory).await;
        let theirs = scratch("accept-remembers-member");
        let (_, member) = opened(
            &credentials,
            &theirs,
            &store,
            &invitation,
            &code,
            CHOSEN,
            ISSUED_AT + 3,
        )
        .await;
        let member = member.expect("the member could not open their link");
        let filed = credentials
            .get(
                MEMBER_KEY_SERVICE,
                &format!("{}:{}", member.organization_id, member.member_id),
            )
            .expect("the store would not answer")
            .expect("the accept filed no key");
        let (_, key) = read_entry(&filed).expect("what was filed is not a remembered session");
        let rows = store
            .members(&owner.verifying_key)
            .await
            .expect("the members");
        let row = rows
            .iter()
            .find(|row| row.id == member.member_id)
            .expect("the member row");

        assert_eq!(
            open_sealed_secret_key(&key, &row.vault)
                .expect("the filed key did not open the resealed vault")
                .public_key(),
            member.secret.public_key()
        );
        assert!(!filed.contains(CHOSEN), "the password was filed");
    }

    /// The organization's replica in `from`, copied into `to`: a machine's own replica, as a
    /// link's credential would have pulled it, since nothing here serves a pull.
    fn replica_copied(from: &std::path::Path, to: &std::path::Path) {
        for name in replica_files_in(from) {
            std::fs::copy(from.join(&name), to.join(&name)).expect("the copy");
        }
    }

    /// Every file in `directory` that is an organization's replica or one of its sidecars.
    fn replica_files_in(directory: &std::path::Path) -> Vec<String> {
        std::fs::read_dir(directory)
            .expect("the directory")
            .filter_map(|entry| {
                entry
                    .expect("an entry")
                    .file_name()
                    .to_str()
                    .map(str::to_string)
            })
            .filter(|name| name.starts_with("org-"))
            .collect()
    }

    /// A replica of the organization opened from what `directory` holds, with no remote.
    async fn replica_in(directory: &std::path::Path, organization_id: &str) -> OrganizationStore {
        OrganizationStore::open(
            crate::clock::System::shared(),
            &OrganizationStore::replica_path(&directory.join(Database::FILENAME), organization_id),
            None,
            || async { Err(turso::Error::Misuse("no remote".into())) },
        )
        .await
        .expect("the replica did not open")
    }

    /// Effort 851, requirement 10 and criterion 10, for an invitation link: **a link and its code
    /// admit one machine, once.**
    ///
    /// Used once, then opened again on the machine that used it and on a machine holding nothing:
    /// each second opening is refused as already used, the machine's record is the same file byte
    /// for byte, and no remembered key is filed. **The machine that holds the organization keeps
    /// its replica**, since that file is the one it works from; the machine that holds nothing is
    /// left with no `org-*` file at all, though the link's credential reached the organization and
    /// pulled it. Each machine here opens a replica of its own beside its record, which is what
    /// makes the second half something a test can see.
    #[tokio::test]
    async fn a_spent_invitation_link_records_nothing_on_either_machine() {
        let credentials = Memory::new();
        let directory = scratch("spent");
        let (store, _, _, invitation, _, code) = invited(&credentials, &directory).await;

        // used once, on the machine it was sent to.
        let first = scratch("spent-first");
        let (mut first_machine, member) = opened(
            &credentials,
            &first,
            &store,
            &invitation,
            &code,
            CHOSEN,
            ISSUED_AT + 3,
        )
        .await;
        let member = member.expect("the member could not open their link");
        let account = format!("{}:{}", member.organization_id, member.member_id);

        // opened again on that machine, over the replica it works from: the organization is held,
        // so it is selected and the link judged there, refused as already used (effort 851,
        // requirements 10 and 13).
        replica_copied(&directory, &first);

        let theirs = replica_in(&first, &member.organization_id).await;
        let record = std::fs::read(first.join(RemoteSync::FILENAME)).expect("the record");
        let filed = credentials
            .get(MEMBER_KEY_SERVICE, &account)
            .expect("the store would not answer");
        let again = accept(
            &credentials,
            move |_| async move { Ok::<_, Error>(theirs) },
            &mut first_machine,
            &first.join(Database::FILENAME),
            &invitation,
            &code,
            "another password entirely",
            test_cost(),
            ISSUED_AT + 4,
        )
        .await;

        assert!(
            matches!(
                again.as_ref().map(|_| ()),
                Err(Error::Refused {
                    reason: RefusalReason::Consumed,
                    ..
                })
            ),
            "a spent link opened again on the machine that used it was not refused as already used"
        );
        assert_eq!(
            std::fs::read(first.join(RemoteSync::FILENAME)).expect("the record"),
            record,
            "the second opening changed the record"
        );
        assert_eq!(
            credentials
                .get(MEMBER_KEY_SERVICE, &account)
                .expect("the store would not answer"),
            filed,
            "the second opening filed a key"
        );
        assert!(
            !replica_files_in(&first).is_empty(),
            "a link for the organization this machine holds took its replica away"
        );

        // and on a machine holding nothing, with a replica the link's credential pulled.
        let elsewhere = scratch("spent-elsewhere");

        replica_copied(&directory, &elsewhere);

        let pulled = replica_in(&elsewhere, &member.organization_id).await;
        let mut machine = Persisted::<RemoteSyncStore>::load(elsewhere.join(RemoteSync::FILENAME))
            .expect("the store");
        let record = std::fs::read(elsewhere.join(RemoteSync::FILENAME)).expect("the record");
        let nothing_filed = Memory::new();

        assert!(!replica_files_in(&elsewhere).is_empty());

        let refused = accept(
            &nothing_filed,
            move |_| async move { Ok::<_, Error>(pulled) },
            &mut machine,
            &elsewhere.join(Database::FILENAME),
            &invitation,
            &code,
            CHOSEN,
            test_cost(),
            ISSUED_AT + 5,
        )
        .await
        .map(|(_, session)| session);

        assert!(
            matches!(
                refused,
                Err(Error::Refused {
                    reason: RefusalReason::Consumed,
                    ..
                })
            ),
            "{refused:?}"
        );
        assert!(machine.selected().is_none(), "the spent link recorded");
        assert_eq!(
            std::fs::read(elsewhere.join(RemoteSync::FILENAME)).expect("the record"),
            record,
            "the spent link changed the record"
        );
        assert_eq!(
            nothing_filed
                .get(MEMBER_KEY_SERVICE, &account)
                .expect("the store would not answer"),
            None,
            "the spent link filed a key"
        );
        assert_eq!(
            replica_files_in(&elsewhere),
            Vec::<String>::new(),
            "the spent link left the replica it pulled"
        );
    }

    /// Effort 851, requirements 10 and 13: **an accept that fails past the connect forgets the
    /// organization it added.** The link's replica on a machine holding nothing carries a grant
    /// the invitee's vault does not open, so the accept records the organization and then fails.
    /// The record is the same file byte for byte and no `org-*` file is left; the same link opened
    /// again, over a replica that reads, admits the person.
    #[tokio::test]
    async fn an_accept_that_fails_past_the_connect_leaves_nothing_and_the_link_admits_after() {
        let credentials = Memory::new();
        let directory = scratch("join-fails-past-connect");
        let (_store, owner, _, invitation, _, code) = invited(&credentials, &directory).await;
        let elsewhere = scratch("join-fails-past-connect-machine");

        replica_copied(&directory, &elsewhere);

        let broken = replica_in(&elsewhere, &invitation.organization_id).await;
        let (key, certificate) = crate::organization::workspace::signer_of(&broken, &owner)
            .await
            .expect("the owner's signer");
        let grant = broken
            .grants(&owner.verifying_key)
            .await
            .expect("the grants")
            .into_iter()
            .find(|grant| grant.member_id != owner.member_id)
            .expect("the invitee's grant");

        broken
            .write_grant(
                &crate::organization::store::Signer {
                    key: &key,
                    certificate: &certificate,
                },
                &crate::organization::store::GrantRecord {
                    sealed_credential: vec![0; 96],
                    ..grant
                },
            )
            .await
            .expect("the grant their vault does not open");

        let mut machine = Persisted::<RemoteSyncStore>::load(elsewhere.join(RemoteSync::FILENAME))
            .expect("the store");
        let record = std::fs::read(elsewhere.join(RemoteSync::FILENAME)).expect("the record");
        let filed = Memory::new();
        let failed = accept(
            &filed,
            move |_| async move { Ok::<_, Error>(broken) },
            &mut machine,
            &elsewhere.join(Database::FILENAME),
            &invitation,
            &code,
            CHOSEN,
            test_cost(),
            ISSUED_AT + 3,
        )
        .await
        .map(|(_, session)| session);

        assert!(failed.is_err(), "the accept went through: {failed:?}");
        assert!(
            machine.selected().is_none(),
            "the failed accept kept the organization"
        );
        assert_eq!(
            std::fs::read(elsewhere.join(RemoteSync::FILENAME)).expect("the record"),
            record,
            "the failed accept changed the record"
        );
        assert_eq!(
            replica_files_in(&elsewhere),
            Vec::<String>::new(),
            "the failed accept left the replica it pulled"
        );
        // the same link, over a replica that reads.
        replica_copied(&directory, &elsewhere);

        let pulled = replica_in(&elsewhere, &invitation.organization_id).await;
        let admitted = accept(
            &filed,
            move |_| async move { Ok::<_, Error>(pulled) },
            &mut machine,
            &elsewhere.join(Database::FILENAME),
            &invitation,
            &code,
            CHOSEN,
            test_cost(),
            ISSUED_AT + 4,
        )
        .await
        .map(|(_, session)| session);

        let session = admitted.expect("the same link did not admit after the failed accept");

        assert_eq!(
            machine.selected().map(|held| held.id.as_str()),
            Some(invitation.organization_id.as_str())
        );
        assert_eq!(
            machine.selected().and_then(|held| held.member_id.clone()),
            Some(session.member_id)
        );
    }

    /// Effort 851, the review of requirement 10: **an accept that fails past the reseal keeps the
    /// organization.** The vault answers to the password the person chose from the reseal on, so
    /// a failure after it, here the spend of the invitation refused by the replica, leaves the
    /// organization held on their machine with their own lock latched, and they sign in at the
    /// wall with the password they chose.
    #[tokio::test]
    async fn an_accept_that_fails_past_the_reseal_keeps_the_organization_for_the_wall() {
        let credentials = Memory::new();
        let directory = scratch("join-fails-past-reseal");
        let (store, _, _, invitation, _, code) = invited(&credentials, &directory).await;

        store
            .connection()
            .execute(
                "CREATE TRIGGER \"invitation_unspent\" BEFORE UPDATE ON \"invitation\" \
                 BEGIN SELECT RAISE(ABORT, 'the spend is refused'); END",
                (),
            )
            .await
            .expect("the trigger");

        let (mut machine, failed) = opened(
            &credentials,
            &directory.join("sami"),
            &store,
            &invitation,
            &code,
            CHOSEN,
            ISSUED_AT + 1,
        )
        .await;

        assert!(failed.is_err(), "the accept went through: {failed:?}");

        let member_id = store
            .invitations(&invitation.verifying_key_bytes().expect("the key"))
            .await
            .expect("the invitations")
            .into_iter()
            .find(|row| row.id == invitation.half.id)
            .expect("the invitation")
            .member_id;
        let recorded = Persisted::<RemoteSyncStore>::load(machine.path().to_path_buf())
            .expect("the record")
            .selected()
            .cloned()
            .expect("the failed accept forgot the organization");

        assert_eq!(recorded.id, invitation.organization_id);
        assert_eq!(recorded.own_lock_latched, vec![member_id.clone()]);

        let held = held_by(&machine);
        let session = admit(
            &credentials,
            &store,
            &mut machine,
            &held,
            "sami.staff",
            CHOSEN,
            &slot(),
            ISSUED_AT + 2,
        )
        .await
        .expect("the password sami chose did not sign them in at the wall");

        assert_eq!(session.member_id, member_id);
        assert!(session.own_lock_latched, "the wall forgot sami's own lock");
    }

    /// Effort 851, the review of requirements 9 and 13: **a link refused while somebody is signed
    /// in leaves them signed in, and the record as it was; one that goes through signs them out
    /// and opens its own session.**
    ///
    /// Olivia is signed in on her own organization, and the machine holds a second one beside it,
    /// not open. The second organization's spent invitation and a machine link for it are each
    /// refused as already used, through the routines the commands call, and after both Olivia is
    /// still in, her replica is still held, and the record is the same file: the second
    /// organization was not selected under her open session. A reset link for that organization
    /// then goes through, and only then is she signed out, with the reset member's session in
    /// her place and the second organization selected. *Until the review the session ended before
    /// the link was judged, so each refusal here left her signed out while the screen had her in.*
    #[tokio::test]
    async fn a_link_refused_while_signed_in_leaves_the_session_and_the_record_as_they_were() {
        use crate::organization::invitation::{connected_here, make_link, reset_account};

        let credentials = Memory::new();
        let first = scratch("signed-in-ours");
        let (ours, _, ours_link, _, _, _) = invited(&credentials, &first).await;
        let second = scratch("signed-in-theirs");
        let (theirs, their_owner, their_link, their_invitation, _, their_code) =
            invited(&credentials, &second).await;

        // sami opens the second organization's invitation on a machine of their own, which spends
        // it, and is made a machine link for another.
        let (_, sami) = opened(
            &credentials,
            &second.join("sami"),
            &theirs,
            &their_invitation,
            &their_code,
            CHOSEN,
            ISSUED_AT + 2,
        )
        .await;
        let sami = sami.expect("sami could not open their link");
        let machine_link = make_link(
            &theirs,
            &their_owner,
            no_platform(),
            &their_link,
            &sami.member_id,
            72,
            test_cost(),
            ISSUED_AT + 3,
        )
        .await
        .expect("the machine link");

        // olivia's machine: her organization, signed in, and the second held beside it, not open.
        let here = scratch("signed-in-machine");
        let (mut machine, held) = connected_machine(&here, &ours, &ours_link).await;
        let session = admit(
            &credentials,
            &ours,
            &mut machine,
            &held,
            "olivia",
            PASSWORD,
            &slot(),
            ISSUED_AT + 4,
        )
        .await
        .expect("olivia did not sign in");

        connect::connect(
            &theirs,
            &mut machine,
            &their_link,
            REACHED_WITH,
            ISSUED_AT + 4,
        )
        .await
        .expect("the second organization was not held");
        machine.select(&ours_link.organization_id);
        machine.commit().expect("the record");
        drop(machine);

        let app_state = state_over(&here).await;

        *app_state.organization.write().await = Some(ours);
        *app_state.member.write().await = Some(session);

        let record = std::fs::read(here.join(RemoteSync::FILENAME)).expect("the record");

        replica_copied(&second, &here);

        let replica = replica_in(&here, &their_link.organization_id).await;
        let spent = accepted_here(
            &app_state,
            &credentials,
            move |_| async move { Ok::<_, Error>(replica) },
            &their_invitation,
            &their_code,
            CHOSEN,
            test_cost(),
            ISSUED_AT + 5,
        )
        .await;

        assert!(
            matches!(
                spent,
                Err(Error::Refused {
                    reason: RefusalReason::Consumed,
                    ..
                })
            ),
            "the spent invitation was not refused as already used: {spent:?}"
        );

        let reached_nothing = connected_here(
            &app_state,
            &credentials,
            |_| async {
                Err::<OrganizationStore, _>(Error::Internal {
                    message: "a refused machine link reached a replica".to_string(),
                })
            },
            &JoinLink::decode(&machine_link.link).expect("the machine link"),
            &machine_link.code,
            test_cost(),
            ISSUED_AT + 6,
        )
        .await;

        assert!(
            matches!(
                reached_nothing,
                Err(Error::Refused {
                    reason: RefusalReason::Consumed,
                    ..
                })
            ),
            "the machine link was not refused as already used: {reached_nothing:?}"
        );
        assert_eq!(
            app_state
                .member
                .read()
                .await
                .as_ref()
                .map(|member| member.organization_id.clone()),
            Some(ours_link.organization_id.clone()),
            "a refused link signed olivia out"
        );
        assert!(
            app_state.organization.read().await.is_some(),
            "a refused link let go of olivia's replica"
        );
        assert_eq!(
            std::fs::read(here.join(RemoteSync::FILENAME)).expect("the record"),
            record,
            "a refused link changed the record under olivia's session"
        );

        // a reset link for the second organization goes through, and that is what ends her session.
        let reset = reset_account(
            &theirs,
            &their_owner,
            no_platform(),
            &their_link,
            &sami.member_id,
            test_cost(),
            ISSUED_AT + 7,
        )
        .await
        .expect("the reset");
        let fresh = JoinLink::decode(&reset.join_link).expect("the reset link");

        replica_copied(&second, &here);

        let replica = replica_in(&here, &fresh.organization_id).await;

        accepted_here(
            &app_state,
            &credentials,
            move |_| async move { Ok::<_, Error>(replica) },
            &fresh,
            &reset.code,
            "a new password sami chose",
            test_cost(),
            ISSUED_AT + 8,
        )
        .await
        .expect("the reset link did not go through");

        let member = app_state.member.read().await;
        let member = member
            .as_ref()
            .expect("nobody is signed in after the reset");

        assert_eq!(member.organization_id, fresh.organization_id);
        assert_eq!(member.member_id, sami.member_id);
        assert_eq!(
            app_state
                .remote_sync
                .write()
                .await
                .store_mut()
                .selected()
                .map(|held| held.id.clone()),
            Some(fresh.organization_id.clone()),
            "the second organization is not the one selected"
        );
    }

    /// Effort 851, the review of requirement 35: **a reset let through on a machine that holds
    /// the organization latches its member beside whoever was latched there first.** Sami joined
    /// on this machine by an invitation and is held to their own lock; Noor joined elsewhere, is
    /// reset, and opens the reset link here. Both are latched afterwards, and Sami still reads as
    /// held to their own lock when they sign in at the wall. *The entry held one id until the
    /// review, so Noor's reset dropped Sami's latch.*
    #[tokio::test]
    async fn a_reset_let_through_on_a_held_machine_keeps_the_lock_latched_for_whoever_joined_first()
    {
        let credentials = Memory::new();
        let directory = scratch("latched-two");
        let (store, owner, link, invitation, _, code) = invited(&credentials, &directory).await;
        let (mut machine, sami) = opened(
            &credentials,
            &directory.join("sami"),
            &store,
            &invitation,
            &code,
            CHOSEN,
            ISSUED_AT + 1,
        )
        .await;
        let sami = sami.expect("sami could not open their link");
        let noor = make_account_and_link(
            &store,
            &owner,
            no_platform(),
            &link,
            Invitation {
                username: "noor",
                role: permission::MEMBER,
                workspaces: &[],
            },
            test_cost(),
            ISSUED_AT + 2,
        )
        .await
        .expect("noor's invitation");
        let (_, joined) = opened(
            &credentials,
            &directory.join("noor"),
            &store,
            &JoinLink::decode(&noor.join_link).expect("noor's link"),
            &noor.code,
            CHOSEN,
            ISSUED_AT + 3,
        )
        .await;

        joined.expect("noor could not open their link");

        let reset = crate::organization::invitation::reset_account(
            &store,
            &owner,
            no_platform(),
            &link,
            &noor.member_id,
            test_cost(),
            ISSUED_AT + 4,
        )
        .await
        .expect("the reset");

        accept_on(
            &credentials,
            &mut machine,
            &store,
            &JoinLink::decode(&reset.join_link).expect("the reset link"),
            &reset.code,
            "a new password noor chose",
            ISSUED_AT + 5,
        )
        .await
        .expect("noor's reset link did not go through on sami's machine");

        assert_eq!(
            held_by(&machine).own_lock_latched,
            vec![sami.member_id.clone(), noor.member_id.clone()],
            "the reset did not latch noor beside sami"
        );

        let held = held_by(&machine);
        let session = admit(
            &credentials,
            &store,
            &mut machine,
            &held,
            "sami.staff",
            CHOSEN,
            &slot(),
            ISSUED_AT + 6,
        )
        .await
        .expect("sami could not sign in at the wall");

        assert!(
            session.own_lock_latched,
            "noor's reset dropped sami's own lock"
        );
    }

    /// Effort 851, the review of requirement 10: **an accept that fails before the reseal takes
    /// back the registry row its connect wrote.** The reseal is refused by the replica, so the
    /// accept forgets the organization it added; the registry holds the machines it held before,
    /// and the row the connect pushed is deleted with it rather than left on Turso for a retry to
    /// add a second beside.
    #[tokio::test]
    async fn an_accept_that_fails_before_the_reseal_takes_its_registry_row_back() {
        let credentials = Memory::new();
        let directory = scratch("join-unregisters");
        let (store, _, _, invitation, _, code) = invited(&credentials, &directory).await;
        let registered = machines_in(&store).await;

        store
            .connection()
            .execute(
                "CREATE TRIGGER \"member_unresealed\" BEFORE UPDATE ON \"member\" \
                 BEGIN SELECT RAISE(ABORT, 'the reseal is refused'); END",
                (),
            )
            .await
            .expect("the trigger");

        let (machine, failed) = opened(
            &credentials,
            &directory.join("sami"),
            &store,
            &invitation,
            &code,
            CHOSEN,
            ISSUED_AT + 1,
        )
        .await;

        assert!(failed.is_err(), "the accept went through: {failed:?}");
        assert!(
            machine.selected().is_none(),
            "the failed accept kept the organization"
        );
        assert_eq!(
            machines_in(&store).await,
            registered,
            "the failed accept left its registry row"
        );
    }

    /// The ids in the organization's machine registry, in order.
    async fn machines_in(store: &OrganizationStore) -> Vec<String> {
        let mut rows = store
            .connection()
            .query("SELECT \"id\" FROM \"machine\" ORDER BY \"id\"", ())
            .await
            .expect("the registry");
        let mut ids = Vec::new();

        while let Some(row) = rows.next().await.expect("a row") {
            ids.push(row.get::<String>(0).expect("an id"));
        }

        ids
    }

    /// Everything the organization database holds, table by table and row by row, as a test
    /// compares it before and after a refusal: a write anywhere changes it.
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

    /// Turn this build's organization into format 1 as the main branch shapes it, keeping its
    /// rows: no `format`, `role`, `certificate` or `revocation` table, the role word and the
    /// seven-act mask on the member row where this format has a role, an override and a removal,
    /// and format 1's `administrator_certificate` with its unsigned `revoked_at`. The refusal is
    /// made before any row is read, so what the rows say does not matter; the shape is what every
    /// way in has to recognise, and it is checked against the main branch's here.
    async fn as_format_one(store: &OrganizationStore) {
        for statement in [
            "DROP TABLE \"format\"",
            "DROP TABLE \"workspace_override\"",
            "DROP TABLE \"machine_sign_out\"",
            "DROP TABLE \"machine_name\"",
            "DROP TABLE \"organization_name\"",
            "DROP TABLE \"member_lock\"",
            "DROP TABLE \"machine_version\"",
            "DROP TABLE \"workspace_floor\"",
            "DROP TABLE \"organization_floor\"",
            "DROP TABLE \"role\"",
            "DROP TABLE \"certificate\"",
            "DROP TABLE \"revocation\"",
            "ALTER TABLE \"member\" ADD COLUMN \"role\" TEXT NOT NULL DEFAULT 'member'",
            "ALTER TABLE \"member\" ADD COLUMN \"permissions\" INTEGER NOT NULL DEFAULT 0",
            "ALTER TABLE \"member\" DROP COLUMN \"role_id\"",
            "ALTER TABLE \"member\" DROP COLUMN \"override\"",
            "ALTER TABLE \"member\" DROP COLUMN \"removed_at\"",
            "CREATE TABLE \"administrator_certificate\" (\
                \"id\" TEXT PRIMARY KEY NOT NULL, \
                \"member_id\" TEXT NOT NULL, \
                \"signing_public_key\" BLOB NOT NULL, \
                \"signature_by_organization_key\" BLOB NOT NULL, \
                \"issued_at\" TEXT NOT NULL, \
                \"revoked_at\" TEXT)",
        ] {
            store
                .connection()
                .execute(statement, ())
                .await
                .unwrap_or_else(|error| panic!("{statement}: {error}"));
        }

        // the main branch's eleven tables, and its member row's columns.
        assert_eq!(
            store.tables().await.expect("the tables"),
            vec![
                "administrator_certificate",
                "grant",
                "invitation",
                "machine",
                "machine_link",
                "mark",
                "member",
                "migration_lease",
                "organization",
                "succession",
                "workspace",
            ]
        );

        let mut columns = store.columns_of("member").await.expect("the columns");
        let mut main = vec![
            "id",
            "username_sealed",
            "public_key",
            "signing_public_key",
            "sealed_secret_key",
            "sealed_content_key",
            "kdf_salt",
            "kdf_params",
            "role",
            "permissions",
            "must_change_password",
            "certificate_id",
            "signature",
            "created_at",
            "updated_at",
            "session_epoch",
            "owner_seed_sealed",
        ];

        columns.sort();
        main.sort_unstable();

        assert_eq!(columns, main);
        assert!(store.is_older().await.expect("the format"));
    }

    /// Effort 838, tickets 22 and 23, at the join: **an organization an earlier version made,
    /// opened first by an invited member, waits for its owner, and nothing is written to it.**
    ///
    /// The organization is this build's first run turned into format 1 in the main branch's shape
    /// ([`as_format_one`]). The link opens, since the code is right, and the accept is refused
    /// before any row is read: nothing on the organization moves, the invitation stands unspent,
    /// and the machine records nothing. *It took the `format` table away from this build's shape
    /// until ticket 23, which is an upgrade's last row missing rather than format 1.*
    #[tokio::test]
    async fn an_older_organization_opened_first_by_an_invited_member_waits_for_its_owner() {
        let credentials = Memory::new();
        let directory = scratch("older");
        let (store, _, _, invitation, _, code) = invited(&credentials, &directory).await;

        as_format_one(&store).await;

        let before = contents(&store).await;
        let (machine, refused) = opened(
            &credentials,
            &scratch("older-machine"),
            &store,
            &invitation,
            &code,
            CHOSEN,
            ISSUED_AT + 3,
        )
        .await;

        assert!(
            matches!(
                &refused,
                Err(Error::Refused {
                    reason: RefusalReason::OrganizationOlder,
                    message,
                }) if message.contains("waits for its owner")
            ),
            "{:?}",
            refused.map(|session| session.member_id)
        );
        assert_eq!(
            contents(&store).await,
            before,
            "the refusal wrote to the organization"
        );
        assert!(machine.selected().is_none());
    }

    /// **Effort 857, ticket 04, on a link.** A newer rentable raised the organization's floors, and
    /// what the reach pulled carries the raise. Past the read floor the accept is refused as
    /// `OrganizationNewer`; past the write floor alone it is refused as
    /// `OrganizationReadOnlyByVersion`, since an accept reseals a vault, spends its row and
    /// registers the machine. Either way nothing is written to the organization after the reach,
    /// the invitation stands unspent, and the machine records nothing.
    #[tokio::test]
    async fn a_link_to_an_organization_past_the_floors_is_refused_and_writes_nothing() {
        use crate::organization::store::FORMAT_VERSION;

        for (name, read, reason) in [
            (
                "unreadable",
                FORMAT_VERSION + 1,
                RefusalReason::OrganizationNewer,
            ),
            (
                "read-only",
                FORMAT_VERSION,
                RefusalReason::OrganizationReadOnlyByVersion,
            ),
        ] {
            let credentials = Memory::new();
            let directory = scratch(&format!("floors-{name}"));
            let (store, _, _, invitation, _, code) = invited(&credentials, &directory).await;

            store
                .record_floors(FORMAT_VERSION + 1, read, FORMAT_VERSION + 1)
                .await;

            let before = contents(&store).await;
            let (machine, refused) = opened(
                &credentials,
                &scratch(&format!("floors-{name}-machine")),
                &store,
                &invitation,
                &code,
                CHOSEN,
                ISSUED_AT + 3,
            )
            .await;

            assert!(
                matches!(&refused, Err(Error::Refused { reason: refused, .. }) if *refused == reason),
                "{name}: {:?}",
                refused.map(|session| session.member_id)
            );
            assert_eq!(
                contents(&store).await,
                before,
                "{name}: the refusal wrote to the organization"
            );
            assert!(
                machine.selected().is_none(),
                "{name}: the machine recorded it"
            );
        }
    }
}
