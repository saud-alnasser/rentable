//! signing in: a password opens a vault, and what the vault held is what the member may do.
//!
//! **There is no check.** A sign-in derives a key from the password and tries to open the member's
//! vault with it; a wrong password derives a key like any other, that key fails the seal's tag,
//! and that is the whole of the failure. Nothing here compares anything against a stored value,
//! nothing returns a boolean a modified client could make true, and a client that skips the
//! failure has no secret key to go on with, so every grant stays sealed and no workspace opens.
//! The test named for criterion 9 performs exactly that skip.
//!
//! **It works with the network down.** The rows are read from the organization replica on this
//! machine, the vault opens on this machine, and the grant that reaches the organization database
//! is unsealed on this machine. A pull is attempted afterwards and its failure is an answer rather
//! than an error: the replica goes on serving what it holds, which is requirement 18 and what
//! removed the three-day window.
//!
//! **The rows are verified before they are believed.** Every member, workspace and grant passes
//! through `organization/authority/` against the verifying key this machine pinned when it
//! joined, and never one read out of the database. What the row says, once verified, is the truth.
//!
//! **Two ways to the row, one way through it.** A first run signs the owner in to the row it
//! just wrote, which the machine's record names ([`sign_in`]). At the wall a person types a
//! username and a password, and neither narrows the rows: usernames are sealed under the content
//! key, so the password is tried against each member's vault in turn and the username the opened
//! row carries is compared to the one typed, without case ([`sign_in_by_username`], effort 824,
//! requirement 19). A wrong password costs one derivation per member, which the spec accepts
//! rather than index around, because a plaintext or keyed username would tell whoever holds the
//! link who is in the organization. The three refusals, a wrong password, a username nobody
//! holds, and a username held by somebody whose password this is not, are one sentence, so
//! nothing says whether the username exists. Both ways end in the same unsealing.
//!
//! **What a session holds stays in this process.** The member's secret key, the organization
//! content key and the credential that reaches the organization database are in [`MemberSession`]
//! and nothing serialises it; what crosses to the web layer is [`SessionFacts`], facts about the
//! member and their workspaces, and no key ([[rules/credentials]], *Client boundary*).
//!
//! **A signed-in machine stays signed in, and what it keeps is the member key** (effort 826,
//! requirement 12). After a sign-in, an accepted invitation or a password change, the Argon2id
//! output that opens `sealed_secret_key` is filed in the operating system's credential store
//! ([`remember`](fn@remember)); the first state read of the next launch reads it back and opens the vault with
//! it ([`resume`]), and a sign-out or a disconnect deletes it. Nothing about it crosses to the web
//! layer, and it reaches no file this application writes.
//!
//! *Why the member key rather than the secret key it unseals: the seal on a vault is
//! authenticated over its salt and its cost, so a re-seal by anybody retires every key that ever
//! opened it. A key that no longer opens the vault is a failed resume, which forgets the entry and
//! leaves the wall up, and there is no staleness to compare against anything.*
//!
//! **A member is signed out of every machine by a number on their row** (effort 826, requirement
//! 22). `member.session_epoch` is which run of that member's sessions is the current one; a
//! session carries the number it opened under and the credential store's entry files it beside
//! the key (`<epoch>:<base64url key>`). [`end_elsewhere`] moves the number on and rewrites this
//! machine's entry, so every other machine's is behind: at its next launch [`resume`] refuses the
//! entry and forgets it, and a session already open ends at the next sync heartbeat, which asks
//! [`ended_elsewhere`]. [`end_member_sessions`] does the same to somebody else's row, under
//! `resetPassword`.
//!
//! **One machine is signed out by a number of its own** (effort 846, requirement 10), in
//! `machine_sign_out`, which only the member's other machines write and which the machine compares
//! with the number its own record last acknowledged ([`end_machine`], `machine.rs`).
//!
//! *Why a number and not a moment: two machines' clocks disagree, and a session opened on a
//! machine running a minute fast would survive a sign-out meant to end it. A number only ever
//! moves forward, and the comparison is the same on every machine that reads the row.*

mod command;
mod epoch;
pub mod forget;
mod heartbeat;
mod machine;
mod remember;
mod replica;
mod signin;

pub use command::*;
// by name: `command` has an `ended_elsewhere` of its own, and the one this module's name
// reaches is the epoch's.
pub(crate) use epoch::end_elsewhere;
pub use epoch::{end_member_sessions, ended_elsewhere};
pub use machine::{MachineView, SEEN_REFRESH, machines};
pub(crate) use machine::{
    end_machine, machine_kept, machine_named, sign_outs_acknowledged, signed_out_here,
};
pub(crate) use remember::*;
pub(crate) use replica::leave_registry;
pub use signin::*;

use std::{
    collections::HashMap,
    future::Future,
    pin::Pin,
    sync::{Arc, Mutex},
};

use serde::{Deserialize, Serialize};

use crate::{
    backup, clock,
    credential::CredentialStore,
    error::{Error, RefusalReason},
    organization::Shared,
};

use crate::turso::platform::{AccessLevel, PlatformApi, TursoPlatform};

use super::{
    HeldOrganization,
    authority::VERIFYING_KEY_BYTES,
    member::vault::{
        CONTENT_KEY_BYTES, ContentKey, MemberSecretKey, open_content, unseal_with_secret_key,
    },
    role::permission::{self},
    setup::Remote,
    store::{MemberRecord, OrganizationStore, pins_of},
};

/// What a remembered member key is filed under. One service for every organization a machine
/// might hold; the account is what tells two of them apart.
pub(crate) const MEMBER_KEY_SERVICE: &str = "rentable.member-key";

/// The credential a replica syncs with, shared with the replica's token function.
///
/// Empty until a vault is open, which is what makes an open replica unable to reach the remote
/// before sign-in, and filled by the sign-in that unsealed the grant. A slot rather than a value
/// because the replica is built before the password is typed and asks for the token per request.
pub type CredentialSlot = Arc<Mutex<Option<String>>>;

/// A signed-in member, for the run of the process.
///
/// **Never serialised, never logged.** `Debug` says which member and nothing else.
pub struct MemberSession {
    pub organization_id: String,
    pub member_id: String,
    /// the kind of the role the member holds: `owner`, `manager`, `member` or `custom` (effort
    /// 838). A display fact, as the vault opened onto it; a gate reads the verified row
    /// ([`acting_row`]). *It was the word `administrator` for a manager, and `removed`, until
    /// ticket 15 retired the word.*
    pub role: String,
    pub permissions: i64,
    pub must_change_password: bool,
    /// the `member.session_epoch` this session opened under. Behind the row's, the session has
    /// been ended from another machine and the next heartbeat closes it ([`ended_elsewhere`]).
    pub session_epoch: i64,
    pub verifying_key: [u8; VERIFYING_KEY_BYTES],
    pub secret: MemberSecretKey,
    pub content_key: ContentKey,
    /// what the organization replica syncs with, unsealed from this member's grant.
    pub organization_credential: CredentialSlot,
    /// every workspace credential this member's grants held, unsealed, by workspace id. What a
    /// member can open is exactly this map, and nothing adds to it but a grant the vault opens.
    pub workspace_credentials: HashMap<String, WorkspaceCredential>,
}

/// One unsealed workspace credential and what it is good for.
#[derive(Clone)]
pub struct WorkspaceCredential {
    pub token: String,
    pub access: AccessLevel,
}

impl std::fmt::Debug for WorkspaceCredential {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "WorkspaceCredential({})", self.access.as_str())
    }
}

impl std::fmt::Debug for MemberSession {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            formatter,
            "MemberSession({} in {})",
            self.member_id, self.organization_id
        )
    }
}

impl MemberSession {
    /// Refuse every act but changing the password, for a member whose password has never been
    /// changed (requirement 10).
    ///
    /// **At the command, not at the screen.** A screen that declined to render the next page would
    /// leave every command reachable by anything that is not the screen; this is what each command
    /// asks before it does anything, and the sign-in ticket's own facts tell the interface to show
    /// the change-password surface first.
    pub fn settled(&self) -> Result<(), Error> {
        if self.must_change_password {
            return Err(Error::refused(
                RefusalReason::PasswordChangeRequired,
                "change your password before doing anything else",
            ));
        }

        Ok(())
    }
}

/// What ending a member's sessions answered with: whether the bump reached the organization
/// database, or is still waiting on this machine for a connection.
///
/// **A fact about a push and not a credential** ([[rules/credentials]], *Client boundary*). It
/// crosses because the sentence the person reads turns on it: "they were signed out" is false
/// while the number is only on this replica, and the machines are still open until the next
/// heartbeat with a connection carries it.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionsEnded {
    pub sent: bool,
}

/// The acting member's own row on this replica, which is what every act reads before it does
/// anything (effort 826, requirements 6 and 22).
///
/// **The row and not the session.** [`MemberSession::permissions`] is the snapshot taken when the
/// vault opened, and nothing rewrites it for the life of the process: a member narrowed out of an
/// act would go on performing it until they signed in again, and for the one act that signs
/// nothing (`workspace::rename_workspace`) there is no second line of defence behind it, because
/// a retired certificate is what refuses the others and a partial narrowing retires none. Read
/// here instead, the narrowing reaches an open session as soon as the replica has the row, which
/// is the next sync heartbeat. The snapshot stays on the session because `SessionFacts` carries
/// it to the interface, which draws controls from it.
///
/// **One row, verified on its own**, through [`OrganizationStore::member`]: a row somebody else
/// tampered with refuses the members list by name, and must not also refuse every act of every
/// member who did nothing.
///
/// Off the replica as it stands, without a pull of its own: the heartbeat is what pulls, and an
/// act that paid for a pull of its own would put a network round trip in front of every gate.
///
/// Three standings are refused rather than read: a row that is gone, one that came back
/// `removed`, and one whose `session_epoch` has moved past the session's, which is a member
/// whose sessions were ended from another machine and whose heartbeat has not yet signed this
/// one out. The third is what keeps a revoked machine from acting in the window before its
/// heartbeat, and in particular from ending everybody else's sessions and filing its own key
/// under a number past the revocation.
pub async fn acting_row(
    store: &OrganizationStore,
    session: &MemberSession,
) -> Result<MemberRecord, Error> {
    let member = store
        .member(&session.verifying_key, &session.member_id)
        .await?
        .ok_or_else(|| {
            Error::refused(
                RefusalReason::SignInAgain,
                "your member row is not in the organization any more. sign in again",
            )
        })?;

    if member.removed_at.is_some() {
        return Err(Error::refused(
            RefusalReason::YouWereRemoved,
            "you were removed from this organization",
        ));
    }

    if session.session_epoch < member.session_epoch {
        return Err(Error::refused(
            RefusalReason::SessionsEnded,
            "your sessions were ended from another machine. sign in again",
        ));
    }

    Ok(member)
}

/// What the acting member's row says they may do, which is what every act's gate asks: the
/// permissions of [`acting_row`], with its three refusals in front.
pub async fn permissions_on_row(
    store: &OrganizationStore,
    session: &MemberSession,
) -> Result<i64, Error> {
    Ok(acting_row(store, session).await?.effective)
}

/// Who is acting, as the chain reads them (effort 838): their verified row, which says what they
/// may do and whether they are the owner, and the rank of the role it names.
///
/// **The row and never the session's snapshot.** [`MemberSession::role`] is what the vault opened
/// onto and outlives a narrowing, a removal and a handover; a gate that asked it would let a
/// founder's open session go on acting as the owner after they handed the organization on. Every
/// gate an act on somebody else's account makes reads this instead.
pub struct Actor {
    pub row: MemberRecord,
    /// the rank of the actor's role, off its verified row, or the owner's constant.
    pub rank: i64,
}

impl Actor {
    /// Refuse, with `reason` and `refusal`, unless the verified row is the owner's and carries
    /// `flag`: the one member the root certificate names, and the one who holds the Turso
    /// authority's acts (`permission::OWNER_ONLY`). The flag is asked as well as the role, so each
    /// act is answered by the bit that names it. A row that says it was removed never reaches here
    /// ([`acting_row`] refuses it first). **The one owner check**: `workspace::require_owner` is
    /// this, for a caller that has not read the actor yet.
    pub fn require_owner(
        &self,
        flag: permission::Flag,
        reason: RefusalReason,
        refusal: &str,
    ) -> Result<(), Error> {
        if self.row.role_id == permission::OWNER && permission::permits(self.row.effective, flag) {
            Ok(())
        } else {
            Err(Error::refused(reason, refusal))
        }
    }

    /// Refuse unless a role of `rank` ranks strictly below the actor's (requirement 7): a member
    /// acts on a role, or on a member holding it, only from above.
    pub fn outranks(&self, rank: i64, refusal: &str) -> Result<(), Error> {
        if rank < self.rank {
            Ok(())
        } else {
            Err(Error::refused(RefusalReason::RankNotAbove, refusal))
        }
    }
}

/// The acting member and the rank their role holds: [`acting_row`], with its three refusals in
/// front, and the role's verified row read for its rank.
pub async fn actor(store: &OrganizationStore, session: &MemberSession) -> Result<Actor, Error> {
    let row = acting_row(store, session).await?;
    let (_, rank) = store
        .role_standing(&session.verifying_key, &row.role_id)
        .await?;

    Ok(Actor { row, rank })
}

/// The rank of the role a member's verified row names: what [`Actor::outranks`] is asked about
/// before an act on their account.
///
/// **On a row its certificate no longer covers, the rank they are certified at** (effort 838, the
/// focused review of ticket 20): the role such a row names is content nobody covering it wrote,
/// and it may be above them, below them or gone. What stands is the highest of their live
/// certificates, or the member's rank where they hold none, so the removal that is the one act on
/// such a row is made by somebody above the member as they stand.
pub async fn rank_of(
    store: &OrganizationStore,
    session: &MemberSession,
    member: &MemberRecord,
) -> Result<i64, Error> {
    if !member.covered {
        return Ok(store
            .live_certificates(&session.verifying_key, &member.id)
            .await?
            .iter()
            .map(|certificate| certificate.rank)
            .max()
            .unwrap_or(permission::MEMBER_ROLE.rank));
    }

    Ok(store
        .role_standing(&session.verifying_key, &member.role_id)
        .await?
        .1)
}

/// Refuse an act on a member whose row its certificate no longer covers, naming what is to be
/// done instead: the member removed, and made an account again, by somebody ranked above them
/// (effort 838, the re-check of ticket 20). **An uncovered row is never saved**: it is content
/// anybody holding the credential may have written, and nothing the directory holds says which of
/// its fields are genuine, so every act on it would carry a forger's content forward as
/// authority. A rename or a reset writes the row back as it stands, an assignment would lift a
/// removal the forger re-signed and certify a signing key the forger put on it, and an override,
/// a link, a grant or ending sessions builds on it. A removal is the one act asked of it, and it
/// is not asked here. *An assignment saved such a row until the re-check.*
pub fn refuse_unsettled(member: &MemberRecord) -> Result<(), Error> {
    if member.covered {
        return Ok(());
    }

    Err(Error::refused(RefusalReason::RoleUnsettled, UNSETTLED))
}

/// What an act on a member whose row is uncovered meets, and what it says to do instead.
pub const UNSETTLED: &str = "this member's row was written by somebody who could not write it, so \
     nothing is done for them but their removal. somebody ranked above them removes them and \
     makes them an account again. nothing was changed";

/// One workspace as the web layer learns of it: its name opened with the content key, and where
/// its database is. No credential.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceFacts {
    pub id: String,
    pub name: String,
    pub database_name: String,
    pub database_hostname: String,
    pub schema_version: i64,
    /// what this member's grant on it is good for, `full-access` or `read-only`.
    pub access_level: String,
    /// the record flags pinned for this member in this workspace, whatever they hold across the
    /// organization (effort 838, requirement 12 as amended a third time, and at review round one).
    /// Zero where nothing is.
    pub pinned: i64,
    /// which of the pinned flags are on; the rest of them are off.
    pub granted: i64,
    /// what this member may do in this workspace before the grant is read: their permissions
    /// across the organization with what is pinned set as it is granted
    /// (`permission::effective_in_workspace`). What the web layer answers a record procedure by,
    /// with a read-only grant's writes cleared.
    pub permissions: i64,
}

/// What the web layer is told about a signed-in member.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionFacts {
    pub organization_id: String,
    pub organization_name: String,
    pub member_id: String,
    /// the one thing that names this member, opened with the content key.
    pub username: String,
    /// the kind of the role this member holds: `owner`, `manager`, `member` or `custom` (effort
    /// 838, requirement 8). *It was the word `owner`, `administrator` or `member` until then.*
    pub role: String,
    /// the role the member row names, by id.
    pub role_id: String,
    /// a custom role's name, opened with the content key; empty on the three built-in roles, whose
    /// names the interface gives in the reader's language.
    pub role_name: String,
    /// how high the role stands.
    pub rank: i64,
    /// the flags switched for this member alone. Zero on the owner's row.
    #[serde(rename = "override")]
    pub override_mask: i64,
    /// what the member may do across the organization: their role's mask exclusive-or'd with their
    /// override, read off the verified row now. What they may do in one workspace is that
    /// workspace's own `permissions` with a read-only grant's writes cleared, which the web layer
    /// folds for the workspace it has open; this still answers for administration.
    pub permissions: i64,
    /// the workspaces this member holds a grant on, and only those.
    pub workspaces: Vec<WorkspaceFacts>,
    /// the owner's username, opened with the content key: whom a member is told to tell when
    /// the organization's account needs attention (requirement 25), and nothing else about them.
    pub owner_username: String,
    /// whether this reader has been offered the organization and has not accepted yet (effort
    /// 828, requirement 22), which is what puts the acceptance in their account section.
    ///
    /// **A fact about a standing offer and never the offer itself**: what the seal on the row
    /// carries stays in Rust ([[rules/credentials]], *Client boundary*), and the offered person
    /// needs to know only that it is there and whose it is, which the owner's username beside it
    /// already says.
    pub ownership_offered: bool,
}

/// Move an open session onto the key a succession handed over, and take what its own row says
/// under that key (effort 828, requirement 22).
///
/// **The role and the permissions are re-read rather than carried**, because a handover is the
/// one act that changes them under a session that is open somewhere else: the founder who handed
/// over is a manager now, and a session that kept `owner` would pass every gate that
/// reads it and sign a certificate under a key that certifies nothing. The row is read
/// before anything on the session moves, so a row the new key does not find leaves the session as
/// it was and the caller says so; the other snapshot fields stay, since the epoch is compared
/// against the row on every act and the password standing is the vault's.
pub(crate) async fn repin(
    store: &OrganizationStore,
    session: &mut MemberSession,
    key: [u8; VERIFYING_KEY_BYTES],
) -> Result<(), Error> {
    let member = store
        .member(&key, &session.member_id)
        .await?
        .ok_or_else(|| {
            Error::refused(
                RefusalReason::MemberGone,
                "this member's row is not in the organization any more",
            )
        })?;

    let role = super::role::kind_of(&store.roles(&key).await?, &member.role_id);

    session.verifying_key = key;
    session.role = role;
    session.permissions = member.effective;

    Ok(())
}

/// The rest of a sign-in, once the password has opened `member`'s vault and the content key is
/// unsealed: every grant the vault holds, the organization's into `credential` and the
/// workspaces' into the session.
pub(crate) async fn open_session(
    store: &OrganizationStore,
    held: &HeldOrganization,
    verifying_key: [u8; VERIFYING_KEY_BYTES],
    member: &MemberRecord,
    secret: MemberSecretKey,
    content_key: ContentKey,
    credential: &CredentialSlot,
) -> Result<MemberSession, Error> {
    // the grant on the organization database itself, which every member holds: it is what the
    // replica syncs with from now on. Absent, the member reads what the replica already holds and
    // nothing new arrives, which is the offline case rather than a failure of signing in.
    let grants = store.grants(&verifying_key).await?;
    let mut workspace_credentials = HashMap::new();

    for grant in grants.iter().filter(|grant| grant.member_id == member.id) {
        let token = String::from_utf8(unseal_with_secret_key(&secret, &grant.sealed_credential)?)
            .map_err(|_| Error::Integrity {
            message: "a sealed credential is not text".to_string(),
        })?;

        if grant.workspace_id == held.id {
            *credential.lock().map_err(|_| Error::Internal {
                message: "the credential slot was poisoned".to_string(),
            })? = Some(token);
        } else if let Some(access) = AccessLevel::parse(&grant.access_level) {
            workspace_credentials.insert(
                grant.workspace_id.clone(),
                WorkspaceCredential { token, access },
            );
        }
    }

    let role = super::role::kind_of(&store.roles(&verifying_key).await?, &member.role_id);

    Ok(MemberSession {
        organization_id: held.id.clone(),
        member_id: member.id.clone(),
        role,
        permissions: member.effective,
        must_change_password: member.must_change_password,
        session_epoch: member.session_epoch,
        verifying_key,
        secret,
        content_key,
        organization_credential: Arc::clone(credential),
        workspace_credentials,
    })
}

/// Read the session's grants again and unseal whatever changed: the credential a lock-out
/// rotated and the owner re-sealed, or a workspace granted since sign-in. Answers whether any
/// credential moved, which is what a caller retries a refused sync on.
///
/// **This is the whole of a remaining member's recovery after a lock-out**, and it needs no human
/// step: their organization credential was not rotated, so the replica pulls the re-sealed grant,
/// and the next request to the workspace goes out under it. A grant that is gone leaves the
/// credential in hand until its expiry, which is what an ordinary removal is.
pub async fn refresh_credentials(
    store: &OrganizationStore,
    session: &mut MemberSession,
) -> Result<bool, Error> {
    let grants = store.grants(&session.verifying_key).await?;
    let mut moved = false;

    for grant in grants
        .iter()
        .filter(|grant| grant.member_id == session.member_id)
    {
        let token = String::from_utf8(unseal_with_secret_key(
            &session.secret,
            &grant.sealed_credential,
        )?)
        .map_err(|_| Error::Integrity {
            message: "a sealed credential is not text".to_string(),
        })?;

        if grant.workspace_id == session.organization_id {
            let mut slot = session
                .organization_credential
                .lock()
                .map_err(|_| Error::Internal {
                    message: "the credential slot was poisoned".to_string(),
                })?;

            if slot.as_deref() != Some(token.as_str()) {
                *slot = Some(token);
                moved = true;
            }
        } else if let Some(access) = AccessLevel::parse(&grant.access_level) {
            let held = session.workspace_credentials.get(&grant.workspace_id);

            if held.is_none_or(|held| held.token != token || held.access != access) {
                session.workspace_credentials.insert(
                    grant.workspace_id.clone(),
                    WorkspaceCredential { token, access },
                );
                moved = true;
            }
        }
    }

    Ok(moved)
}

/// What the web layer is told about `session`, read off the replica now rather than remembered
/// from sign-in, so a row that changed under the member is what the screen shows. Every row is
/// verified on the way, and the names are opened with the content key the session holds.
pub async fn facts_of(
    store: &OrganizationStore,
    session: &MemberSession,
) -> Result<SessionFacts, Error> {
    let key = &session.verifying_key;
    let members = store.members(key).await?;
    let member = members
        .iter()
        .find(|member| member.id == session.member_id)
        .ok_or_else(|| {
            Error::refused(
                RefusalReason::MemberGone,
                "this member's row is not in the organization any more",
            )
        })?;
    let grants = store.grants(key).await?;
    let workspaces = store.workspaces(key).await?;
    let workspace_overrides = store.workspace_overrides(key).await?;
    let role = super::role::held_role(session, &store.roles(key).await?, &member.role_id)?;

    // what this member holds a grant on, with the names opened for the screen. The grant on the
    // organization database is not a workspace and is not listed.
    let workspace_facts = grants
        .iter()
        .filter(|grant| {
            grant.member_id == member.id && grant.workspace_id != session.organization_id
        })
        .filter_map(|grant| {
            workspaces
                .iter()
                .find(|workspace| workspace.id == grant.workspace_id)
                .map(|workspace| (grant, workspace))
        })
        .map(|(grant, workspace)| {
            let (pinned, granted) = pins_of(&workspace_overrides, &member.id, &workspace.id);

            Ok(WorkspaceFacts {
                id: workspace.id.clone(),
                name: opened(
                    &session.content_key,
                    "workspace.name_sealed",
                    &workspace.name_sealed,
                )?,
                database_name: workspace.database_name.clone(),
                database_hostname: workspace.database_hostname.clone(),
                schema_version: workspace.schema_version,
                access_level: grant.access_level.clone(),
                pinned,
                granted,
                permissions: super::role::permission::effective_in_workspace(
                    member.effective,
                    pinned,
                    granted,
                ),
            })
        })
        .collect::<Result<Vec<_>, Error>>()?;

    let organization_name = match store.organization().await? {
        Some(organization) => opened(
            &session.content_key,
            "organization.name_sealed",
            &organization.name_sealed,
        )?,
        None => String::new(),
    };

    let owner_username = match members
        .iter()
        .find(|candidate| candidate.role_id == super::role::permission::OWNER)
    {
        Some(owner) => opened(
            &session.content_key,
            "member.username_sealed",
            &owner.username_sealed,
        )?,
        None => String::new(),
    };

    Ok(SessionFacts {
        organization_id: session.organization_id.clone(),
        organization_name,
        owner_username,
        member_id: member.id.clone(),
        username: opened(
            &session.content_key,
            "member.username_sealed",
            &member.username_sealed,
        )?,
        role: role.kind,
        role_id: member.role_id.clone(),
        role_name: role.name,
        rank: role.rank,
        override_mask: member.override_mask,
        permissions: member.effective,
        workspaces: workspace_facts,
        ownership_offered: super::ownership::standing_offer(store, key)
            .await?
            .is_some_and(|offer| offer.offered_member_id == member.id),
    })
}

/// The key this machine pinned when it joined, as the chain takes it.
pub fn verifying_key_of(joined: &HeldOrganization) -> Result<[u8; VERIFYING_KEY_BYTES], Error> {
    use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD as BASE64URL};

    let bytes = BASE64URL
        .decode(&joined.verifying_key)
        .map_err(|_| Error::Integrity {
            message: "this machine's record of the organization carries no key".to_string(),
        })?;

    <[u8; VERIFYING_KEY_BYTES]>::try_from(bytes.as_slice()).map_err(|_| Error::Integrity {
        message: "this machine's record of the organization carries no key".to_string(),
    })
}

/// The organization content key, unsealed from the `sealed_content_key` a member's row carries
/// with the secret their vault yielded: what makes any name legible. The row is either format's,
/// so the upgrade of an older organization opens it the same way (`upgrade/format/runner/`).
pub(crate) fn content_key_of(
    sealed_content_key: &[u8],
    secret: &MemberSecretKey,
) -> Result<ContentKey, Error> {
    let bytes = unseal_with_secret_key(secret, sealed_content_key)?;

    Ok(ContentKey::from_bytes(
        <[u8; CONTENT_KEY_BYTES]>::try_from(bytes.as_slice()).map_err(|_| Error::Integrity {
            message: "the sealed content key is not a content key".to_string(),
        })?,
    ))
}

/// A sealed column as text, or empty where it was sealed empty.
pub(crate) fn opened(key: &ContentKey, column: &str, sealed: &[u8]) -> Result<String, Error> {
    let bytes = open_content(key, column, sealed)?;

    String::from_utf8(bytes).map_err(|_| Error::Integrity {
        message: format!("{column} did not open as text"),
    })
}

// what an older install left: the port the organization reaches the upgrade through

/// A future the upgrade port answers with.
pub(crate) type Upgrading<'a> = Pin<Box<dyn Future<Output = Result<(), Error>> + Send + 'a>>;

/// What the session asks of the upgrade that brings an older install forward (`upgrade/`).
///
/// **A port, as the clock and the credential store are**, so that the organization names nothing
/// of `upgrade` while `upgrade` reads the organization's store, chain and vaults: the `upgrade`
/// plugin manages its implementation as [`Upgrades`], and the organization's state holds it
/// (effort 840, requirement 15; `guard/cycle.rs` holds it). **Here, in the session, because the
/// session is what opens an organization**: a sign-in, a resume and a connect each open a vault,
/// and the upgrade runs on the vault they open; and the launch's first state read runs the check
/// of the old shape before anything opens the replica.
pub(crate) trait Upgrade: Send + Sync {
    /// Upgrade the organization `held` names where it is of an earlier format and `password` opens
    /// its owner's vault under `username`, or follow the owner's upgrade where it opens anybody
    /// else's: the sign-in at the wall, before the format is refused (`upgrade/format/runner/`,
    /// `with_password`). `account` is the owner's Turso account where this machine holds its
    /// authority, which renews a lapsed grant before the upgrade pushes.
    #[allow(clippy::too_many_arguments)]
    fn with_password<'a>(
        &'a self,
        store: &'a OrganizationStore,
        account: Option<PlatformApi>,
        held: &'a HeldOrganization,
        username: &'a str,
        password: &'a str,
        credential: &'a CredentialSlot,
        now: i64,
    ) -> Upgrading<'a>;

    /// Upgrade the organization `held` names where it is of an earlier format and the key this
    /// machine filed for the member it names opens the owner's vault, or follow the owner's upgrade
    /// where it opens anybody else's: the launch resume, with no password
    /// (`upgrade/format/runner/`, `with_remembered_key`). `account` is as
    /// [`Upgrade::with_password`] takes it.
    fn with_remembered_key<'a>(
        &'a self,
        credentials: &'a dyn CredentialStore,
        store: &'a OrganizationStore,
        account: Option<PlatformApi>,
        held: &'a HeldOrganization,
        credential: &'a CredentialSlot,
        now: i64,
    ) -> Upgrading<'a>;

    /// Upgrade the organization a machine connecting on the owner's Turso account has just pulled,
    /// where it is of an earlier format: `setup::connect_existing`, before the format is refused
    /// (`upgrade/format/runner/`, `with_the_owners_password`). `remote` is the connect's remote and
    /// `account` the account it was consented on; `refused` is the sentence that path gives a pair
    /// that opens nothing.
    #[allow(clippy::too_many_arguments)]
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
    ) -> Upgrading<'a>;

    /// Forget what the machine holds where its shape is the old one: the first thing the launch's
    /// first state read does, before a resume opens anything (`upgrade/shape.rs`).
    fn forget_old_shape<'a>(
        &'a self,
        state: &'a Shared,
        credentials: &'a dyn CredentialStore,
        clock: &'a clock::Shared,
    ) -> Upgrading<'a>;
}

/// The upgrade port as the `upgrade` plugin manages it and the organization's state holds it.
pub(crate) type Upgrades = Arc<dyn Upgrade>;

/// The copy the connect's upgrade takes of the organization database before its format changes,
/// made on the Turso account the connect holds, as `backup::remote_copy` makes one.
///
/// **A trait object where the connect is generic over its platform**, since a port method cannot
/// be: every platform answers it, and the upgrade reads the copy through it.
pub(crate) trait AccountCopy: Sync {
    fn remote_copy<'a>(
        &'a self,
        database: &'a str,
        label: &'a str,
        at: i64,
    ) -> Pin<Box<dyn Future<Output = Result<String, Error>> + Send + 'a>>;
}

impl<P: TursoPlatform + Sync> AccountCopy for P {
    fn remote_copy<'a>(
        &'a self,
        database: &'a str,
        label: &'a str,
        at: i64,
    ) -> Pin<Box<dyn Future<Output = Result<String, Error>> + Send + 'a>> {
        Box::pin(backup::remote_copy(self, database, label, at))
    }
}
