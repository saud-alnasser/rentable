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
//! through `organization/authority.rs` against the verifying key this machine pinned when it
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
//! ([`remember`]); the first state read of the next launch reads it back and opens the vault with
//! it ([`resume`]), and a sign-out or a disconnect deletes it. Nothing about it crosses to the web
//! layer, and it reaches no file this application writes.
//!
//! *Why the member key rather than the secret key it unseals: the seal on a vault is
//! authenticated over its salt and its cost, so a re-seal by anybody retires every key that ever
//! opened it. A key that no longer opens the vault is a failed resume, which forgets the entry and
//! leaves the wall up, and there is no staleness to compare against anything.*

use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};

use serde::{Deserialize, Serialize};

use crate::{diagnostics, error::Error, keyring};

use crate::sync::turso::platform::AccessLevel;

use super::{
    HeldOrganization,
    authority::VERIFYING_KEY_BYTES,
    store::{MemberRecord, OrganizationStore},
    vault::{
        CONTENT_KEY_BYTES, ContentKey, MemberKey, MemberSecretKey, open_content,
        open_sealed_secret_key, open_vault, open_vault_with_key, unseal_with_secret_key,
    },
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
    pub role: String,
    pub permissions: i64,
    pub must_change_password: bool,
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
            return Err(Error::PreconditionFailed {
                message: "change your password before doing anything else".to_string(),
            });
        }

        Ok(())
    }
}

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
    pub role: String,
    pub permissions: i64,
    /// the workspaces this member holds a grant on, and only those.
    pub workspaces: Vec<WorkspaceFacts>,
    /// the owner's username, opened with the content key: whom a member is told to tell when
    /// the organization's account needs attention (requirement 25), and nothing else about them.
    pub owner_username: String,
}

/// Open the member row `joined` names in `store` with `password`.
///
/// The sign-in of a machine whose record already names the member: the first run's, which signs
/// the owner in to the row it just wrote. A record that names no member, which a connect by link
/// writes, is refused before any row is read; the person signs in at the wall, by username
/// ([`sign_in_by_username`]).
///
/// The steps, and why in this order: the rows are read and verified first, so a forged row is
/// refused before any key is derived from the password; the vault is opened, which is the one
/// place a wrong password fails; the content key is unsealed, which is what makes any name
/// legible; and the grant on the organization database is unsealed into `credential`, which is
/// what lets the replica reach the remote from now on.
pub async fn sign_in(
    store: &OrganizationStore,
    joined: &HeldOrganization,
    password: &str,
    credential: &CredentialSlot,
) -> Result<MemberSession, Error> {
    let verifying_key = verifying_key_of(joined)?;
    let member_id = joined
        .member_id
        .as_deref()
        .ok_or_else(|| Error::PreconditionFailed {
            message: format!("this machine holds {} and no member in it yet", joined.name),
        })?;
    let members = store.members(&verifying_key).await?;
    let member = members
        .iter()
        .find(|member| member.id == member_id)
        .ok_or_else(|| Error::NotFound {
            message: "this machine's member row is not in the organization any more".to_string(),
        })?;

    // a removal is a signed row rather than an absence, and it is read before the password is
    // tried: the vault would still open, and what it opens grants nothing any more.
    if member.role == super::permission::REMOVED {
        return Err(Error::Forbidden {
            message: format!("you were removed from {}", joined.name),
        });
    }

    // the one place a password can fail, and it says only that the value did not open.
    let secret = open_vault(password, &member.vault)?;
    let content_key = content_key_of(member, &secret)?;

    open_session(
        store,
        joined,
        verifying_key,
        member,
        secret,
        content_key,
        credential,
    )
    .await
}

/// Find the member `username` and `password` name in `held`'s replica, and open their vault:
/// the sign-in at the wall (effort 824, requirement 19).
///
/// The password is tried against each member's vault in turn, a removed member's excepted, and
/// the sealed username on the row that opens is compared to the one typed, trimmed and without
/// case. The three refusals are one sentence: a password that opens no vault, a username nobody
/// holds, and a username held by a member whose password this is not are told apart by nothing,
/// because a password that opens somebody else's vault is not a fact to hand out, and neither is
/// whether a username is in the organization. The module comment says why nothing narrows the
/// rows first.
/// The one sentence for every pair that does not open a place: a wrong password, an unknown
/// username, another member's password, and a handed password somebody revoked. It names the
/// organization and nothing about the account.
pub fn refused_by_name(organization_name: &str) -> Error {
    Error::Forbidden {
        message: format!("the username and password do not open a place in {organization_name}"),
    }
}

pub async fn sign_in_by_username(
    store: &OrganizationStore,
    held: &HeldOrganization,
    username: &str,
    password: &str,
    credential: &CredentialSlot,
) -> Result<MemberSession, Error> {
    let verifying_key = verifying_key_of(held)?;
    let wanted = username.trim().to_lowercase();
    let members = store.members(&verifying_key).await?;
    let refused = || refused_by_name(&held.name);

    let mut found = None;

    for member in members
        .iter()
        .filter(|member| member.role != super::permission::REMOVED)
    {
        if let Ok((secret, member_key)) = open_vault_with_key(password, &member.vault) {
            found = Some((member, secret, member_key));
            break;
        }
    }

    let Some((member, secret, member_key)) = found else {
        return Err(refused());
    };

    let content_key = content_key_of(member, &secret)?;
    let carried = opened(
        &content_key,
        "member.username_sealed",
        &member.username_sealed,
    )?;

    if carried.trim().to_lowercase() != wanted {
        return Err(refused());
    }

    // a vault still sealed under the generated secret its invitation link carries is opened by
    // that link and by nothing typed at the wall (effort 826, ticket 03): the secret was never
    // shown to anybody, so whoever types it here decoded a link, and a link that was revoked has
    // to open nothing. The refusal is the one sentence, since it says no more than a wrong password.
    if member.must_change_password {
        return Err(refused());
    }

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

    remember(&held.id, &session.member_id, &member_key);

    Ok(session)
}

/// File the key that opens this member's vault, so the next launch opens it without asking.
///
/// **A store that refuses is a diagnostic and never a failure.** A locked keychain, a Linux
/// machine with no secret service, a store out of room: the person is signed in either way, and
/// what they lose is not being asked again next time. Nothing here is on the path of anything the
/// person asked for, so there is no refusal for them to act on.
pub(crate) fn remember(organization_id: &str, member_id: &str, member_key: &MemberKey) {
    let filed = keyring::store(
        MEMBER_KEY_SERVICE,
        &account_of(organization_id, member_id),
        &member_key.encode(),
    );

    match filed {
        Ok(()) => diagnostics::info("organization.session.remembered")
            .with("organization", organization_id)
            .with("member", member_id)
            .write(),
        Err(refusal) => diagnostics::warn("organization.session.notRemembered")
            .with("organization", organization_id)
            .with("member", member_id)
            // the value never reaches a keyring error (`keyring.rs`), so this carries the reason
            // and no part of the key.
            .with("reason", refusal.to_string())
            .write(),
    }
}

/// Leave nothing under this member's entry. What a sign-out and a disconnect do, and what a
/// resume that did not open the vault does to the key it just tried.
///
/// A refusal is a diagnostic for the reason [`remember`]'s is: the caller is doing something else
/// and there is nothing here for the person to act on. An entry that was never filed is already
/// in the state this asks for.
pub(crate) fn forget_remembered(organization_id: &str, member_id: &str) {
    if let Err(refusal) =
        keyring::forget(MEMBER_KEY_SERVICE, &account_of(organization_id, member_id))
    {
        diagnostics::warn("organization.session.notForgotten")
            .with("organization", organization_id)
            .with("member", member_id)
            .with("reason", refusal.to_string())
            .write();
    }
}

/// Open the member the record names with the key this machine filed at their last sign-in: the
/// launch that goes straight past the wall (effort 826, requirement 12).
///
/// The same unsealing every sign-in performs, starting one step further in: there is no password
/// and no derivation, because the derivation's output is what was filed. The rows are read and
/// verified first, as [`sign_in`] reads them, so a forged row is refused before the key is spent.
///
/// **Any failure forgets the entry and leaves the wall up.** Nothing filed, a value that is not a
/// key, a member row that is gone or removed, and a vault resealed by anybody since are one
/// outcome to the person: they sign in. The entry is deleted rather than kept, so the next launch
/// does not try a key that has already been shown not to open anything.
pub(crate) async fn resume(
    store: &OrganizationStore,
    held: &HeldOrganization,
    credential: &CredentialSlot,
) -> Result<MemberSession, Error> {
    let member_id = held
        .member_id
        .clone()
        .ok_or_else(|| Error::PreconditionFailed {
            message: format!("this machine holds {} and no member in it yet", held.name),
        })?;
    let resumed = resumed(store, held, &member_id, credential).await;

    if resumed.is_err() {
        forget_remembered(&held.id, &member_id);
    }

    resumed
}

/// The resume itself, so that [`resume`] has one place to forget the entry from.
async fn resumed(
    store: &OrganizationStore,
    held: &HeldOrganization,
    member_id: &str,
    credential: &CredentialSlot,
) -> Result<MemberSession, Error> {
    let filed =
        keyring::read(MEMBER_KEY_SERVICE, &account_of(&held.id, member_id))?.ok_or_else(|| {
            Error::NotFound {
                message: "this machine remembers no key for the member it holds".to_string(),
            }
        })?;
    let member_key = MemberKey::decode(&filed)?;
    let verifying_key = verifying_key_of(held)?;
    let members = store.members(&verifying_key).await?;
    let member = members
        .iter()
        .find(|member| member.id == member_id)
        .ok_or_else(|| Error::NotFound {
            message: "this machine's member row is not in the organization any more".to_string(),
        })?;

    // as `sign_in` reads it: a removal is a signed row rather than an absence, and the vault
    // would still open onto grants that grant nothing.
    if member.role == super::permission::REMOVED {
        return Err(Error::Forbidden {
            message: format!("you were removed from {}", held.name),
        });
    }

    let secret = open_sealed_secret_key(&member_key, &member.vault)?;
    let content_key = content_key_of(member, &secret)?;

    open_session(
        store,
        held,
        verifying_key,
        member,
        secret,
        content_key,
        credential,
    )
    .await
}

/// What one member's entry is filed under: the organization, and their row in it.
///
/// Both halves, because a machine that forgets one organization and connects to another must not
/// find the first one's key waiting under the second one's name.
fn account_of(organization_id: &str, member_id: &str) -> String {
    format!("{organization_id}:{member_id}")
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

    Ok(MemberSession {
        organization_id: held.id.clone(),
        member_id: member.id.clone(),
        role: member.role.clone(),
        permissions: member.permissions,
        must_change_password: member.must_change_password,
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
        .ok_or_else(|| Error::NotFound {
            message: "this member's row is not in the organization any more".to_string(),
        })?;
    let grants = store.grants(key).await?;
    let workspaces = store.workspaces(key).await?;

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
        .find(|candidate| candidate.role == super::permission::OWNER)
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
        role: member.role.clone(),
        permissions: member.permissions,
        workspaces: workspace_facts,
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

/// The organization content key, unsealed from `member`'s row with the secret their vault
/// yielded: what makes any name legible.
pub(crate) fn content_key_of(
    member: &MemberRecord,
    secret: &MemberSecretKey,
) -> Result<ContentKey, Error> {
    let bytes = unseal_with_secret_key(secret, &member.sealed_content_key)?;

    Ok(ContentKey::from_bytes(
        <[u8; CONTENT_KEY_BYTES]>::try_from(bytes.as_slice()).map_err(|_| Error::Integrity {
            message: "the sealed content key is not a content key".to_string(),
        })?,
    ))
}

/// A sealed column as text, or empty where it was sealed empty.
fn opened(key: &ContentKey, column: &str, sealed: &[u8]) -> Result<String, Error> {
    let bytes = open_content(key, column, sealed)?;

    String::from_utf8(bytes).map_err(|_| Error::Integrity {
        message: format!("{column} did not open as text"),
    })
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use serde_json::json;

    use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD as BASE64URL};

    use super::{
        CredentialSlot, MEMBER_KEY_SERVICE, facts_of, resume, sign_in, sign_in_by_username,
    };
    use crate::{
        keyring::{self, refuse_the_next_store, take_the_credential_store},
        organization::{
            HeldOrganization,
            authority::{AdministratorKey, OrganizationKey, issue_certificate},
            setup::{CreateOrganization, Remote, create_organization},
            store::{GrantRecord, MemberRecord, OrganizationRecord, OrganizationStore, Signer},
            vault::{
                KdfParams, MEMBER_KEY_BYTES, MemberKey, create_vault, create_vault_with_secret,
                generate_content_key, open_sealed_secret_key, reseal_vault, seal_content,
                seal_to_public_key, unseal_with_secret_key,
            },
        },
        persisted::Persisted,
        sync::{
            RemoteSyncStore,
            test::server::{ScriptedResponse, ScriptedServer},
            turso::{discovery::McpEndpoint, platform::InMemoryPlatform},
        },
    };

    const PASSWORD: &str = "a long enough password";

    fn test_cost() -> KdfParams {
        KdfParams {
            memory_kib: 1024,
            iterations: 2,
            lanes: 1,
        }
    }

    fn scratch(name: &str) -> std::path::PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|elapsed| elapsed.as_nanos())
            .unwrap_or_default();
        let directory = std::env::temp_dir().join(format!("rentable-session-{name}-{nanos:x}"));
        std::fs::create_dir_all(&directory).expect("scratch directory");

        directory
    }

    fn slot() -> CredentialSlot {
        Arc::new(Mutex::new(None))
    }

    /// An organization a first run made, on this machine, with no remote: the owner's vault,
    /// their grant on the organization database, and the machine's record of having joined.
    async fn created(
        directory: &std::path::Path,
    ) -> (
        Persisted<RemoteSyncStore>,
        OrganizationStore,
        HeldOrganization,
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
            },
            test_cost(),
            1_757_000_000_000,
        )
        .await
        .expect("the first run failed");
        let joined = store.organization.clone().expect("the record");

        (store, organization, joined)
    }

    #[tokio::test]
    async fn a_password_opens_the_vault_with_no_remote_and_the_facts_follow_from_the_rows() {
        let directory = scratch("opens");
        let (_, store, joined) = created(&directory).await;
        let credential = slot();

        let session = sign_in(&store, &joined, PASSWORD, &credential)
            .await
            .expect("the password did not open the vault");
        let facts = facts_of(&store, &session).await.expect("the facts");

        assert_eq!(session.role, "owner");
        assert_eq!(
            Some(session.member_id.as_str()),
            joined.member_id.as_deref()
        );
        assert!(!session.must_change_password);
        assert_eq!(facts.organization_name, "Acme");
        assert_eq!(facts.role, "owner");
        assert_eq!(facts.username, "olivia");
        assert_eq!(facts.owner_username, "olivia");
        assert!(
            facts.workspaces.is_empty(),
            "a first run has no workspace yet"
        );

        // the grant on the organization database was unsealed into the slot the replica reads.
        let unsealed = credential.lock().expect("the slot").clone();

        assert_eq!(
            unsealed.as_deref(),
            Some(format!("token-for-org-{}-4w-full-access", joined.id).as_str())
        );
        assert_eq!(
            format!("{session:?}"),
            format!("MemberSession({} in {})", session.member_id, joined.id)
        );
    }

    #[tokio::test]
    async fn a_wrong_password_opens_nothing_and_says_only_that() {
        let directory = scratch("wrong");
        let (_, store, joined) = created(&directory).await;
        let credential = slot();

        let refusal = sign_in(&store, &joined, "the wrong password", &credential)
            .await
            .expect_err("a wrong password opened the vault");

        assert!(
            matches!(refusal, crate::error::Error::Integrity { .. }),
            "{refusal:?}"
        );
        assert_eq!(refusal.to_string(), "the sealed value did not open");
        assert!(
            credential.lock().expect("the slot").is_none(),
            "a wrong password unsealed a credential"
        );
    }

    /// **Criterion 9.** The sign-in check is replaced with one that always succeeds, and the
    /// workspace still cannot be opened. There is no check to replace: a client that ignores the
    /// vault refusing to open and carries on has only a secret the password did not produce, and
    /// no grant opens under it. Performed here with exactly such a secret.
    #[tokio::test]
    async fn a_client_that_skips_the_password_check_still_cannot_open_a_grant() {
        let directory = scratch("skip");
        let (_, store, joined) = created(&directory).await;
        let key = super::verifying_key_of(&joined).expect("the key");
        let grant = store
            .grants(&key)
            .await
            .expect("the grants")
            .into_iter()
            .find(|grant| grant.workspace_id == joined.id)
            .expect("the owner's grant on the organization");
        let member = store.members(&key).await.expect("the members").remove(0);

        // the modified client: the vault "opened", and what it has to go on is a secret of its own.
        let (_, not_the_secret) =
            create_vault_with_secret("whatever the client decided", test_cost()).expect("a vault");

        assert!(
            unseal_with_secret_key(&not_the_secret, &grant.sealed_credential).is_err(),
            "a grant opened under a secret the password did not produce"
        );
        assert!(
            unseal_with_secret_key(&not_the_secret, &member.sealed_content_key).is_err(),
            "the content key opened under a secret the password did not produce"
        );

        // and nothing in this module can be made to answer yes: no function returns a bool, and
        // nothing compares a password against anything.
        let source = include_str!("session.rs");
        let shipping = source
            .split("#[cfg(test)]")
            .next()
            .expect("the shipping half");

        assert!(
            !shipping.contains("-> bool"),
            "a boolean check appeared in sign-in"
        );
        assert!(
            !shipping.contains("password =="),
            "a password comparison appeared in sign-in"
        );
    }

    #[tokio::test]
    async fn a_member_who_must_change_their_password_is_refused_by_the_guard() {
        let directory = scratch("guard");
        let (_, store, joined) = created(&directory).await;
        let mut session = sign_in(&store, &joined, PASSWORD, &slot())
            .await
            .expect("the password did not open the vault");

        session
            .settled()
            .expect("an owner who chose their password was refused");

        session.must_change_password = true;

        let refusal = session
            .settled()
            .expect_err("a member who must change their password was let through");

        assert!(
            matches!(refusal, crate::error::Error::PreconditionFailed { .. }),
            "{refusal:?}"
        );
        assert!(
            refusal.to_string().contains("change your password"),
            "{refusal}"
        );
    }

    /// **A machine that holds the organization and no member yet cannot sign in this way.** A
    /// connect by link records no member; the wall's sign-in finds the row by username
    /// (`sign_in_by_username`, tested in `join.rs`), and this one refuses a record with no
    /// member before any row is read.
    #[tokio::test]
    async fn a_record_with_no_member_is_refused_before_any_row_is_read() {
        let directory = scratch("no-member");
        let (_, store, joined) = created(&directory).await;
        let connected = HeldOrganization {
            member_id: None,
            role: None,
            ..joined
        };

        let refusal = sign_in(&store, &connected, PASSWORD, &slot())
            .await
            .expect_err("a record naming no member signed in");

        assert!(
            matches!(refusal, crate::error::Error::PreconditionFailed { .. }),
            "{refusal:?}"
        );
        assert!(refusal.to_string().contains("no member"), "{refusal}");
    }

    /// Two organizations, and one person with a different role in each: the second is one
    /// somebody else administers, in which this machine's person is a member who must still
    /// change their password. Each opens with its own password and its own role, and one
    /// password does not open the other. *819's requirement 17 had a machine hold both at once;
    /// effort 824's requirement 17 has it hold one, so the two records here are two machines'.*
    #[tokio::test]
    async fn two_organizations_open_with_their_own_passwords_and_roles() {
        let directory = scratch("two");
        let (_, store_a, joined_a) = created(&directory).await;

        // the second organization, made elsewhere: its owner's chain, and this person as a member.
        let organization_key = OrganizationKey::generate().expect("a key");
        let administrator_key = AdministratorKey::generate().expect("a key");
        let certificate = issue_certificate(
            &organization_key,
            "cert-their-owner",
            "their-owner",
            &administrator_key.verifying_key(),
            "1757000000000",
        );
        let content_key = generate_content_key().expect("a content key");
        let vault = create_vault("the other password", test_cost()).expect("a vault");
        let credential = "token-for-org-b";
        let store_b = OrganizationStore::open(&directory.join("org-b.db"), None, || async {
            Ok::<String, turso::Error>(String::new())
        })
        .await
        .expect("the second replica");

        store_b.install_schema().await.expect("the schema");
        store_b
            .write_organization(&OrganizationRecord {
                id: "b".to_string(),
                name_sealed: seal_content(&content_key, "organization.name_sealed", b"Beta")
                    .expect("sealed"),
                verifying_key: organization_key.verifying_key(),
                remote_url: "libsql://org-b-other.aws-eu-west-1.turso.io".to_string(),
                link_credential_sealed: seal_content(
                    &content_key,
                    "organization.link_credential_sealed",
                    b"a-read-only-credential",
                )
                .expect("sealed"),
                created_at: 1_757_000_000_000,
            })
            .await
            .expect("the organization row");
        store_b
            .write_certificate(&certificate)
            .await
            .expect("the certificate");

        let signer = Signer {
            key: &administrator_key,
            certificate: &certificate,
        };

        store_b
            .write_member(
                &signer,
                &MemberRecord {
                    id: "me-there".to_string(),
                    username_sealed: seal_content(
                        &content_key,
                        "member.username_sealed",
                        b"me.there",
                    )
                    .expect("sealed"),
                    sealed_content_key: seal_to_public_key(
                        &vault.public_key,
                        &content_key.to_bytes(),
                    )
                    .expect("sealed"),
                    vault: vault.clone(),
                    role: "member".to_string(),
                    permissions: 0,
                    must_change_password: true,
                    created_at: 1_757_000_000_000,
                    updated_at: 1_757_000_000_000,
                },
            )
            .await
            .expect("the member");
        store_b
            .write_grant(
                &signer,
                &GrantRecord {
                    member_id: "me-there".to_string(),
                    workspace_id: "b".to_string(),
                    sealed_credential: seal_to_public_key(&vault.public_key, credential.as_bytes())
                        .expect("sealed"),
                    access_level: "full-access".to_string(),
                    credential_expires_at: None,
                },
            )
            .await
            .expect("the grant");

        let joined_b = HeldOrganization {
            id: "b".to_string(),
            name: "Beta".to_string(),
            verifying_key: base64::Engine::encode(
                &base64::engine::general_purpose::URL_SAFE_NO_PAD,
                organization_key.verifying_key(),
            ),
            remote_url: "libsql://org-b-other.aws-eu-west-1.turso.io".to_string(),
            member_id: Some("me-there".to_string()),
            role: Some("member".to_string()),
            joined_at: 1_757_000_000_001,
        };

        // each opens with its own password and its own role.
        let a = sign_in(&store_a, &joined_a, PASSWORD, &slot())
            .await
            .expect("the first organization did not open");
        let b_slot = slot();
        let b = sign_in(&store_b, &joined_b, "the other password", &b_slot)
            .await
            .expect("the second organization did not open");

        assert_eq!(a.role, "owner");
        assert_eq!(b.role, "member");
        assert!(b.must_change_password);
        assert_eq!(
            b_slot.lock().expect("the slot").as_deref(),
            Some(credential)
        );

        let facts = facts_of(&store_b, &b).await.expect("the facts");

        assert_eq!(facts.organization_name, "Beta");
        assert_eq!(facts.username, "me.there");

        // and one password does not open the other organization.
        assert!(
            sign_in(&store_b, &joined_b, PASSWORD, &slot())
                .await
                .is_err()
        );
        assert!(
            sign_in(&store_a, &joined_a, "the other password", &slot())
                .await
                .is_err()
        );
    }

    /// **Criterion 1.** A sign-in at the wall files the key that opened the vault, under the
    /// service and the account the launch reads it back from, and what is filed is the member key
    /// rather than anything else: it opens the same vault, and it is thirty-two bytes of base64url
    /// with no password anywhere in it.
    #[tokio::test]
    async fn a_sign_in_files_the_member_key_and_a_resume_opens_the_vault_with_it() {
        let _turn = take_the_credential_store().await;
        let directory = scratch("remember");
        let (_, store, joined) = created(&directory).await;
        let member_id = joined.member_id.clone().expect("the record names a member");
        let account = format!("{}:{member_id}", joined.id);

        // the first run filed the owner's key already; emptied, so what is read back below is
        // what this sign-in filed.
        keyring::forget(MEMBER_KEY_SERVICE, &account).expect("the store would not forget");

        let session = sign_in_by_username(&store, &joined, "olivia", PASSWORD, &slot())
            .await
            .expect("the sign-in failed");
        let filed = keyring::read(MEMBER_KEY_SERVICE, &account)
            .expect("the store would not answer")
            .expect("the sign-in filed nothing");
        let bytes = BASE64URL
            .decode(&filed)
            .expect("what was filed is not base64url");

        assert_eq!(bytes.len(), MEMBER_KEY_BYTES);
        assert!(!filed.contains(PASSWORD), "the password was filed");

        // it is the key that opens this member's vault, and it opens it.
        let members = store
            .members(&super::verifying_key_of(&joined).expect("the key"))
            .await
            .expect("the members");
        let member = members
            .iter()
            .find(|member| member.id == member_id)
            .expect("the member row");
        let key = MemberKey::decode(&filed).expect("what was filed is not a key");

        assert_eq!(
            open_sealed_secret_key(&key, &member.vault)
                .expect("the filed key did not open the vault")
                .public_key(),
            session.secret.public_key()
        );

        // and the resume the next launch performs reaches the same session, with no password.
        let credential = slot();
        let resumed = resume(&store, &joined, &credential)
            .await
            .expect("the resume failed");

        assert_eq!(resumed.member_id, member_id);
        assert_eq!(resumed.role, "owner");
        assert_eq!(resumed.secret.public_key(), session.secret.public_key());
        assert_eq!(
            credential.lock().expect("the slot").as_deref(),
            Some(format!("token-for-org-{}-4w-full-access", joined.id).as_str()),
            "the resume unsealed no credential for the replica"
        );
    }

    /// **Criterion 1, the stale key.** A reset elsewhere reseals the vault, which retires every
    /// key that ever opened it: the salt and the cost are authenticated into the seal, so there is
    /// nothing to compare and the failure is the AEAD tag. The entry goes, and the wall is what
    /// the person meets.
    #[tokio::test]
    async fn a_vault_resealed_elsewhere_leaves_the_remembered_key_opening_nothing() {
        let _turn = take_the_credential_store().await;
        let directory = scratch("stale");
        let (_, store, joined) = created(&directory).await;
        let member_id = joined.member_id.clone().expect("the record names a member");
        let account = format!("{}:{member_id}", joined.id);
        let session = sign_in_by_username(&store, &joined, "olivia", PASSWORD, &slot())
            .await
            .expect("the sign-in failed");

        assert!(
            keyring::read(MEMBER_KEY_SERVICE, &account)
                .expect("the store would not answer")
                .is_some()
        );

        // the reset, performed by somebody else and arriving on the replica: the same keypair
        // under a password this machine has never seen.
        let resealed = reseal_vault(
            &session.secret,
            "a password chosen somewhere else",
            test_cost(),
        )
        .expect("the reseal failed");

        store
            .reseal_member(&member_id, &resealed, false, 1_757_000_000_001)
            .await
            .expect("the row would not be written");

        let refusal = resume(&store, &joined, &slot())
            .await
            .expect_err("a key that opens nothing resumed a session");

        assert!(
            matches!(refusal, crate::error::Error::Integrity { .. }),
            "{refusal:?}"
        );
        assert_eq!(
            keyring::read(MEMBER_KEY_SERVICE, &account).expect("the store would not answer"),
            None,
            "a key that opens nothing was kept"
        );
    }

    /// **Criterion 2, the refusal half, at the sign-in.** A store that will not take the key is a
    /// diagnostic: the person is in, and what they lose is being asked again next launch.
    #[tokio::test]
    async fn a_store_that_refuses_the_key_does_not_refuse_the_sign_in() {
        let _turn = take_the_credential_store().await;
        let directory = scratch("refused");
        let (_, store, joined) = created(&directory).await;
        let member_id = joined.member_id.clone().expect("the record names a member");
        let account = format!("{}:{member_id}", joined.id);

        keyring::forget(MEMBER_KEY_SERVICE, &account).expect("the store would not forget");
        refuse_the_next_store();

        let session = sign_in_by_username(&store, &joined, "olivia", PASSWORD, &slot())
            .await
            .expect("a refused store failed the sign-in");

        assert_eq!(session.member_id, member_id);
        assert_eq!(
            keyring::read(MEMBER_KEY_SERVICE, &account).expect("the store would not answer"),
            None,
            "the store took a value it was told to refuse"
        );

        // and the launch after it meets the wall rather than an error.
        let refusal = resume(&store, &joined, &slot())
            .await
            .expect_err("a launch with nothing filed resumed a session");

        assert!(
            matches!(refusal, crate::error::Error::NotFound { .. }),
            "{refusal:?}"
        );
    }

    /// A record naming no member has nothing to resume: a machine connected by the organization's
    /// link is in that state, and the person signs in at the wall.
    #[tokio::test]
    async fn a_record_with_no_member_has_nothing_to_resume() {
        let _turn = take_the_credential_store().await;
        let directory = scratch("resume-no-member");
        let (_, store, joined) = created(&directory).await;
        let connected = HeldOrganization {
            member_id: None,
            role: None,
            ..joined
        };

        let refusal = resume(&store, &connected, &slot())
            .await
            .expect_err("a record naming no member resumed a session");

        assert!(
            matches!(refusal, crate::error::Error::PreconditionFailed { .. }),
            "{refusal:?}"
        );
        assert!(refusal.to_string().contains("no member"), "{refusal}");
    }

    /// The key a member key encodes to reads back as the same key, and anything else reads back as
    /// a value that opens nothing rather than as a panic.
    #[tokio::test]
    async fn what_is_filed_reads_back_as_the_same_key_and_nothing_else_reads_back_at_all() {
        let key = MemberKey::from_bytes([7_u8; MEMBER_KEY_BYTES]);
        let encoded = key.encode();

        assert_eq!(
            BASE64URL
                .decode(&encoded)
                .expect("not base64url")
                .as_slice(),
            [7_u8; MEMBER_KEY_BYTES].as_slice()
        );
        assert!(MemberKey::decode("not base64url at all ***").is_err());
        assert!(
            MemberKey::decode(&BASE64URL.encode([7_u8; 16])).is_err(),
            "a value of the wrong width read back as a key"
        );
    }
}
