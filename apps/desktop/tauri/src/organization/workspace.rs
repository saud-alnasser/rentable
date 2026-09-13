//! a workspace: created on the customer's account by its owner, granted to members as credentials
//! sealed to their keys, and opened by whoever holds a grant.
//!
//! **Only an owner creates or destroys one, and that is forced rather than chosen.** Creating a
//! workspace creates a database, which needs the Turso authority requirement 5 keeps on the
//! owner's machine and out of every database; an administrator has nothing to create a database
//! with. The refusal is at the command, before any request, and it says to ask the owner.
//!
//! **A grant is a credential sealed to the member's X25519 public key**, which is the property the
//! whole asymmetric design exists for: an administrator grants a workspace to a member whose
//! password they do not know, by sealing to a public half, and a member can be added to a second
//! workspace long after they joined. A full-access grant is made from the granter's own
//! credential, re-sealed, so an administrator grants what they can reach themselves and nothing
//! more (requirement 13's limit, at the grant); a read-only grant is a credential Turso mints at
//! that level, which needs the platform authority and is therefore the owner's to make.
//!
//! **A credential has an expiry, and renewal is the owner's machine minting fresh ones and
//! re-sealing them to every member who still holds a grant.** Removal is what stops renewing,
//! and the credential dying at its expiry is what ends an ordinary removal; the removal ticket
//! relies on this path rather than assuming it.
//!
//! **Deletion is the one moment requirement 4 permits it**, and it goes through the explicit
//! intent the port requires. Nothing else in the organization reaches deletion.

use std::collections::HashMap;

use crate::{
    diagnostics,
    error::Error,
    sync::turso::platform::{AccessLevel, DeletionIntent, TursoPlatform},
};

use super::{
    authority::AdministratorKey,
    migrate::{self, Pipeline},
    permission::{self, Administration},
    session::{MemberSession, WorkspaceCredential, WorkspaceFacts},
    store::{GrantRecord, OrganizationStore, Signer, WorkspaceRecord},
    vault::{open_content, seal_content, seal_to_public_key},
};

/// How long a member's workspace credential lives before renewal has to replace it. Renewal runs
/// on the owner's machine; what happens when it lapses is the removal ticket's ordinary path.
pub const WORKSPACE_CREDENTIAL_LIFETIME: &str = "4w";

/// How long before a credential expires the owner's machine renews it. Credentials are minted at
/// four weeks; renewing within a week of expiry means an owner who launches the application at
/// least weekly never lets one lapse. An owner who launches less often than that lets it lapse,
/// which is the inherent limit of having no server ([[contexts/desktop/organization]]).
pub const CREDENTIAL_RENEWAL_WINDOW_MS: i64 = 7 * 24 * 60 * 60 * 1000;

/// The credential the migration itself spends, and nothing else: minted, spent, dropped.
pub const MIGRATION_CREDENTIAL_LIFETIME: &str = "30m";

/// The signer a session is, for the rows it writes: the administrator key derived from its secret
/// and the certificate that authorises it, read off the replica.
pub async fn signer_of(
    store: &OrganizationStore,
    session: &MemberSession,
) -> Result<(AdministratorKey, super::authority::Certificate), Error> {
    let key = AdministratorKey::from_bytes(
        &session
            .secret
            .derive_seed(super::setup::ADMINISTRATOR_KEY_PURPOSE)?,
    );
    let certificate = store
        .certificates()
        .await?
        .into_iter()
        .find(|certificate| {
            certificate.member_id == session.member_id
                && certificate.signing_public_key == key.verifying_key()
                && certificate.revoked_at.is_none()
        })
        .ok_or_else(|| Error::Forbidden {
            message: "you hold no administrator certificate in this organization".to_string(),
        })?;

    Ok((key, certificate))
}

/// Create a workspace on the account: a database, migrated to the shipped schema, recorded as a
/// signed row, and granted to the owner.
///
/// `pipeline_for` says where a database's pipeline endpoint is given its hostname, so a test can
/// point the migration at a scripted server; production derives it from the hostname.
pub async fn create_workspace<P: TursoPlatform>(
    store: &OrganizationStore,
    session: &mut MemberSession,
    platform: &P,
    pipeline_for: impl Fn(&str) -> Pipeline,
    name: &str,
    now: i64,
) -> Result<WorkspaceFacts, Error> {
    session.settled()?;
    require_owner(session, "create a workspace")?;

    let name = name.trim();

    if name.is_empty() {
        return Err(Error::InvalidInput {
            message: "the workspace needs a name".to_string(),
        });
    }

    let (key, certificate) = signer_of(store, session).await?;
    let id = random_id()?;
    let database_name = format!("ws-{id}");
    let database = platform.create_database(&database_name).await?;

    // from here on a database exists that nothing refers to, so every failure removes it.
    let finished = finish_workspace(
        store,
        session,
        platform,
        &pipeline_for(&database.hostname),
        &key,
        &certificate,
        &id,
        &database_name,
        &database.hostname,
        name,
        now,
    )
    .await;

    match finished {
        Ok(facts) => Ok(facts),
        Err(error) => {
            if let Err(removal) = platform
                .delete_database(&database_name, DeletionIntent::CreatedAndUnreferenced)
                .await
            {
                diagnostics::error("organization.workspace.databaseLeftBehind")
                    .with("database", database_name.as_str())
                    .with("error", removal.to_string())
                    .write();
            }

            Err(error)
        }
    }
}

#[allow(clippy::too_many_arguments)]
async fn finish_workspace<P: TursoPlatform>(
    store: &OrganizationStore,
    session: &mut MemberSession,
    platform: &P,
    pipeline: &Pipeline,
    key: &AdministratorKey,
    certificate: &super::authority::Certificate,
    id: &str,
    database_name: &str,
    hostname: &str,
    name: &str,
    now: i64,
) -> Result<WorkspaceFacts, Error> {
    // the schema, applied with a credential minted for it and nothing else.
    let migration_credential = platform
        .mint_token(
            database_name,
            MIGRATION_CREDENTIAL_LIFETIME,
            AccessLevel::FullAccess,
        )
        .await?;
    let version = migrate::shipped_version();

    migrate::apply(pipeline, &migration_credential, version as usize).await?;

    // the owner's own credential, sealed to the owner.
    let credential = platform
        .mint_token(
            database_name,
            WORKSPACE_CREDENTIAL_LIFETIME,
            AccessLevel::FullAccess,
        )
        .await?;
    let signer = Signer { key, certificate };

    store
        .write_workspace(
            &signer,
            &WorkspaceRecord {
                id: id.to_string(),
                name_sealed: seal_content(
                    &session.content_key,
                    "workspace.name_sealed",
                    name.as_bytes(),
                )?,
                database_name: database_name.to_string(),
                database_hostname: hostname.to_string(),
                schema_version: version,
                created_at: now,
                updated_at: now,
            },
        )
        .await?;
    store
        .write_grant(
            &signer,
            &GrantRecord {
                member_id: session.member_id.clone(),
                workspace_id: id.to_string(),
                sealed_credential: seal_to_public_key(
                    &session.secret.public_key(),
                    credential.as_bytes(),
                )?,
                access_level: AccessLevel::FullAccess.as_str().to_string(),
                credential_expires_at: super::setup::credential_expiry(&credential),
            },
        )
        .await?;

    if !store.push().await {
        diagnostics::warn("organization.workspace.notYetSent")
            .with("workspace", id)
            .write();
    }

    session.workspace_credentials.insert(
        id.to_string(),
        WorkspaceCredential {
            token: credential,
            access: AccessLevel::FullAccess,
        },
    );

    diagnostics::info("organization.workspace.created")
        .with("workspace", id)
        .write();

    Ok(WorkspaceFacts {
        id: id.to_string(),
        name: name.to_string(),
        database_name: database_name.to_string(),
        database_hostname: hostname.to_string(),
        schema_version: version,
        access_level: AccessLevel::FullAccess.as_str().to_string(),
    })
}

/// Grant a workspace to a member, at `access`.
///
/// **Full access is the granter's own credential re-sealed to the member**, so a granter hands out
/// what they can reach and nothing more. **Read-only is minted**, which needs the platform
/// authority, so `platform` is `Some` on the owner's machine and `None` anywhere else, and a
/// read-only grant from anywhere else is refused for want of authority rather than for want of a
/// button.
///
/// The act is [`Administration::GrantWorkspace`], which requirement 4 of effort 826 separated from
/// inviting: giving somebody a workspace they can already sign in to is a different thing from
/// making the account, and an organization may want an administrator who does one and not the
/// other.
pub async fn grant_workspace<P: TursoPlatform>(
    store: &OrganizationStore,
    session: &MemberSession,
    platform: Option<&P>,
    workspace_id: &str,
    member_id: &str,
    access: AccessLevel,
) -> Result<(), Error> {
    session.settled()?;
    permission::require(session.permissions, Administration::GrantWorkspace)?;

    let (key, certificate) = signer_of(store, session).await?;
    let members = store.members(&session.verifying_key).await?;
    let member = members
        .iter()
        .find(|member| member.id == member_id)
        .ok_or_else(|| Error::NotFound {
            message: "that member is not in this organization".to_string(),
        })?;
    let workspaces = store.workspaces(&session.verifying_key).await?;
    let workspace = workspaces
        .iter()
        .find(|workspace| workspace.id == workspace_id)
        .ok_or_else(|| Error::NotFound {
            message: "that workspace is not in this organization".to_string(),
        })?;

    let credential = match access {
        AccessLevel::FullAccess => session
            .workspace_credentials
            .get(workspace_id)
            .filter(|held| held.access == AccessLevel::FullAccess)
            .map(|held| held.token.clone())
            .ok_or_else(|| Error::Forbidden {
                message: "you can grant only a workspace you hold full access to yourself"
                    .to_string(),
            })?,
        AccessLevel::ReadOnly => {
            let platform = platform.ok_or_else(|| Error::Forbidden {
                message: "a read-only grant is minted on the owner's machine. ask the owner"
                    .to_string(),
            })?;

            platform
                .mint_token(
                    &workspace.database_name,
                    WORKSPACE_CREDENTIAL_LIFETIME,
                    AccessLevel::ReadOnly,
                )
                .await?
        }
    };

    store
        .write_grant(
            &Signer {
                key: &key,
                certificate: &certificate,
            },
            &GrantRecord {
                member_id: member.id.clone(),
                workspace_id: workspace.id.clone(),
                sealed_credential: seal_to_public_key(
                    &member.vault.public_key,
                    credential.as_bytes(),
                )?,
                access_level: access.as_str().to_string(),
                credential_expires_at: super::setup::credential_expiry(&credential),
            },
        )
        .await?;

    if !store.push().await {
        diagnostics::warn("organization.grant.notYetSent")
            .with("workspace", workspace_id)
            .with("member", member_id)
            .write();
    }

    Ok(())
}

/// Delete a workspace: its database, through the one intent requirement 4 permits, and its rows.
pub async fn delete_workspace<P: TursoPlatform>(
    store: &OrganizationStore,
    session: &mut MemberSession,
    platform: &P,
    workspace_id: &str,
) -> Result<(), Error> {
    session.settled()?;
    require_owner(session, "delete a workspace")?;

    let workspaces = store.workspaces(&session.verifying_key).await?;
    let workspace = workspaces
        .iter()
        .find(|workspace| workspace.id == workspace_id)
        .ok_or_else(|| Error::NotFound {
            message: "that workspace is not in this organization".to_string(),
        })?;

    platform
        .delete_database(
            &workspace.database_name,
            DeletionIntent::WorkspaceDeletedByHuman,
        )
        .await?;
    store.delete_workspace(workspace_id).await?;
    session.workspace_credentials.remove(workspace_id);

    if !store.push().await {
        diagnostics::warn("organization.workspace.removalNotYetSent")
            .with("workspace", workspace_id)
            .write();
    }

    Ok(())
}

/// Rename a workspace, for whoever carries `renameWorkspace` on their row: the owner, by the
/// package's default masks, and anybody a row was widened for. The name is sealed under the
/// content key and written outside the signature, as the plan keeps it, so every replica reads
/// it on its next pull and nothing has to be re-signed.
pub async fn rename_workspace(
    store: &OrganizationStore,
    session: &MemberSession,
    workspace_id: &str,
    name: &str,
    now: i64,
) -> Result<(), Error> {
    session.settled()?;
    permission::require(session.permissions, Administration::RenameWorkspace)?;

    let name = name.trim();

    if name.is_empty() {
        return Err(Error::InvalidInput {
            message: "the workspace needs a name".to_string(),
        });
    }

    if !store
        .workspaces(&session.verifying_key)
        .await?
        .iter()
        .any(|workspace| workspace.id == workspace_id)
    {
        return Err(Error::NotFound {
            message: "that workspace is not in this organization".to_string(),
        });
    }

    store
        .rename_workspace(
            workspace_id,
            &seal_content(
                &session.content_key,
                "workspace.name_sealed",
                name.as_bytes(),
            )?,
            now,
        )
        .await?;

    if !store.push().await {
        diagnostics::warn("organization.workspace.renameNotYetSent")
            .with("workspace", workspace_id)
            .write();
    }

    Ok(())
}

/// Whether any grant's credential expires within `window_ms` of `now`, so the owner's machine
/// should renew before it lapses. A grant whose token never expires has no recorded expiry and is
/// never due. This is the cheap check the owner's machine runs so it does not mint on every launch,
/// only when something is close.
pub async fn credentials_due(
    store: &OrganizationStore,
    session: &MemberSession,
    window_ms: i64,
    now: i64,
) -> Result<bool, Error> {
    session.settled()?;

    let grants = store.grants(&session.verifying_key).await?;

    Ok(grants.iter().any(|grant| {
        grant
            .credential_expires_at
            .as_deref()
            .and_then(|at| at.parse::<i64>().ok())
            .is_some_and(|expiry| expiry - now <= window_ms)
    }))
}

/// Mint fresh credentials for every workspace and the organization database, and re-seal each to
/// every member who still holds a grant. The owner's machine, with the platform authority.
///
/// A member with no grant row gets nothing, which is what an ordinary removal is: their existing
/// credential dies at its expiry and nobody else is disturbed.
pub async fn renew_credentials<P: TursoPlatform>(
    store: &OrganizationStore,
    session: &mut MemberSession,
    platform: &P,
    organization_database: &str,
) -> Result<usize, Error> {
    session.settled()?;
    require_owner(session, "renew credentials")?;

    let (key, certificate) = signer_of(store, session).await?;
    let signer = Signer {
        key: &key,
        certificate: &certificate,
    };
    // a removed member is not renewed: their row stands as `removed` and their grant was deleted,
    // but a grant row replayed onto the database by a member who still holds the organization
    // credential would otherwise be re-sealed a fresh credential here. Skipping them by role is
    // what closes that half of F2; ticket 23 revokes a removed administrator's certificate for the
    // other half.
    let members: HashMap<String, [u8; 32]> = store
        .members(&session.verifying_key)
        .await?
        .into_iter()
        .filter(|member| member.role != permission::REMOVED)
        .map(|member| (member.id, member.vault.public_key))
        .collect();
    let workspaces = store.workspaces(&session.verifying_key).await?;
    let grants = store.grants(&session.verifying_key).await?;
    let mut renewed = 0;

    // one mint per database and level, shared by every member at that level: a credential is
    // per database rather than per member, and minting one per member would be one revocation
    // radius pretending to be many.
    let mut minted: HashMap<(String, AccessLevel), String> = HashMap::new();

    for grant in &grants {
        let Some(access) = AccessLevel::parse(&grant.access_level) else {
            continue;
        };
        let Some(public_key) = members.get(&grant.member_id) else {
            continue;
        };
        let database_name = if grant.workspace_id == session.organization_id {
            organization_database.to_string()
        } else {
            match workspaces
                .iter()
                .find(|workspace| workspace.id == grant.workspace_id)
            {
                Some(workspace) => workspace.database_name.clone(),
                None => continue,
            }
        };
        let credential = match minted.get(&(database_name.clone(), access)) {
            Some(credential) => credential.clone(),
            None => {
                let credential = platform
                    .mint_token(&database_name, WORKSPACE_CREDENTIAL_LIFETIME, access)
                    .await?;

                minted.insert((database_name.clone(), access), credential.clone());

                credential
            }
        };

        store
            .write_grant(
                &signer,
                &GrantRecord {
                    member_id: grant.member_id.clone(),
                    workspace_id: grant.workspace_id.clone(),
                    sealed_credential: seal_to_public_key(public_key, credential.as_bytes())?,
                    access_level: access.as_str().to_string(),
                    credential_expires_at: super::setup::credential_expiry(&credential),
                },
            )
            .await?;

        // the owner's own, held in this process, moves with the row.
        if grant.member_id == session.member_id {
            if grant.workspace_id == session.organization_id {
                if let Ok(mut slot) = session.organization_credential.lock() {
                    *slot = Some(credential.clone());
                }
            } else {
                session.workspace_credentials.insert(
                    grant.workspace_id.clone(),
                    WorkspaceCredential {
                        token: credential.clone(),
                        access,
                    },
                );
            }
        }

        renewed += 1;
    }

    if !store.push().await {
        diagnostics::warn("organization.credentials.renewalNotYetSent").write();
    }

    Ok(renewed)
}

/// The workspace a member is about to open, with the name opened and the credential their vault
/// holds for it. `None` is a workspace this member holds no grant on, which is not theirs to open.
pub fn openable(
    session: &MemberSession,
    workspaces: &[WorkspaceRecord],
    workspace_id: &str,
) -> Result<Option<(WorkspaceFacts, WorkspaceCredential)>, Error> {
    let Some(held) = session.workspace_credentials.get(workspace_id) else {
        return Ok(None);
    };
    let Some(workspace) = workspaces
        .iter()
        .find(|workspace| workspace.id == workspace_id)
    else {
        return Ok(None);
    };
    let name = String::from_utf8(open_content(
        &session.content_key,
        "workspace.name_sealed",
        &workspace.name_sealed,
    )?)
    .map_err(|_| Error::Integrity {
        message: "the workspace name did not open as text".to_string(),
    })?;

    Ok(Some((
        WorkspaceFacts {
            id: workspace.id.clone(),
            name,
            database_name: workspace.database_name.clone(),
            database_hostname: workspace.database_hostname.clone(),
            schema_version: workspace.schema_version,
            access_level: held.access.as_str().to_string(),
        },
        held.clone(),
    )))
}

fn require_owner(session: &MemberSession, what: &str) -> Result<(), Error> {
    if session.role == permission::OWNER {
        Ok(())
    } else {
        Err(Error::Forbidden {
            message: format!("only an owner can {what}. ask the owner"),
        })
    }
}

fn random_id() -> Result<String, Error> {
    let mut bytes = [0_u8; 16];

    getrandom::fill(&mut bytes).map_err(|error| Error::Internal {
        message: format!("failed to draw an id: {error}"),
    })?;

    Ok(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use serde_json::json;

    use super::{
        MIGRATION_CREDENTIAL_LIFETIME, WORKSPACE_CREDENTIAL_LIFETIME, create_workspace,
        credentials_due, delete_workspace, grant_workspace, openable, renew_credentials,
    };
    use crate::{
        organization::{
            HeldOrganization,
            migrate::Pipeline,
            permission,
            session::{CredentialSlot, MemberSession, sign_in},
            setup::{CreateOrganization, Remote, create_organization},
            store::{GrantRecord, MemberRecord, OrganizationStore, Signer},
            vault::{KdfParams, create_vault, seal_content, seal_to_public_key},
        },
        persisted::Persisted,
        sync::{
            RemoteSyncStore,
            test::server::{ScriptedResponse, ScriptedServer},
            turso::{
                discovery::McpEndpoint,
                platform::{AccessLevel, DeletionIntent, InMemoryPlatform},
            },
        },
    };

    const PASSWORD: &str = "the owners password";
    const OTHER_PASSWORD: &str = "the members password";

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
        let directory = std::env::temp_dir().join(format!("rentable-workspace-{name}-{nanos:x}"));
        std::fs::create_dir_all(&directory).expect("scratch directory");

        directory
    }

    fn slot() -> CredentialSlot {
        Arc::new(Mutex::new(None))
    }

    /// A pipeline that applies every statement it is sent.
    async fn applying_pipeline() -> ScriptedServer {
        ScriptedServer::start(vec![
            ScriptedResponse::new(200, json!({ "results": [] }).to_string()),
            ScriptedResponse::new(200, json!({ "results": [] }).to_string()),
            ScriptedResponse::new(200, json!({ "results": [] }).to_string()),
        ])
        .await
    }

    /// An organization a first run made on this machine, its owner signed in, and the fake
    /// account it lives on.
    async fn owned(
        directory: &std::path::Path,
    ) -> (
        Persisted<RemoteSyncStore>,
        OrganizationStore,
        HeldOrganization,
        MemberSession,
        Arc<InMemoryPlatform>,
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
        let session = sign_in(&organization, &joined, PASSWORD, &slot())
            .await
            .expect("the owner did not sign in");

        (store, organization, joined, session, platform)
    }

    /// A second member, written by the owner as an invitation will write one: a vault under a
    /// password the owner chose for them, the content key sealed to them, and no grant yet.
    async fn second_member(store: &OrganizationStore, owner: &MemberSession) -> HeldOrganization {
        let (key, certificate) = super::signer_of(store, owner).await.expect("the signer");
        let vault = create_vault(OTHER_PASSWORD, test_cost()).expect("a vault");

        store
            .write_member(
                &Signer {
                    key: &key,
                    certificate: &certificate,
                },
                &MemberRecord {
                    id: "member-b".to_string(),
                    username_sealed: seal_content(
                        &owner.content_key,
                        "member.username_sealed",
                        b"member-b",
                    )
                    .expect("sealed"),
                    sealed_content_key: seal_to_public_key(
                        &vault.public_key,
                        &owner.content_key.to_bytes(),
                    )
                    .expect("sealed"),
                    vault,
                    role: permission::MEMBER.to_string(),
                    permissions: 0,
                    must_change_password: false,
                    created_at: 1_757_000_000_000,
                    updated_at: 1_757_000_000_000,
                },
            )
            .await
            .expect("the member");

        HeldOrganization {
            id: owner.organization_id.clone(),
            name: "Acme".to_string(),
            verifying_key: base64::Engine::encode(
                &base64::engine::general_purpose::URL_SAFE_NO_PAD,
                owner.verifying_key,
            ),
            remote_url: String::new(),
            member_id: Some("member-b".to_string()),
            role: Some(permission::MEMBER.to_string()),
            joined_at: 1_757_000_000_001,
        }
    }

    /// An administrator of this organization, carrying every one of the seven grantable acts, and
    /// the record their machine would hold. Written directly rather than invited, because what is
    /// under test is the owner check and an invitation would only reach it the long way round.
    async fn an_administrator(
        store: &OrganizationStore,
        owner: &MemberSession,
    ) -> HeldOrganization {
        let (key, certificate) = super::signer_of(store, owner).await.expect("the signer");
        let vault = create_vault(OTHER_PASSWORD, test_cost()).expect("a vault");

        store
            .write_member(
                &Signer {
                    key: &key,
                    certificate: &certificate,
                },
                &MemberRecord {
                    id: "member-admin".to_string(),
                    username_sealed: seal_content(
                        &owner.content_key,
                        "member.username_sealed",
                        b"ada.admin",
                    )
                    .expect("sealed"),
                    sealed_content_key: seal_to_public_key(
                        &vault.public_key,
                        &owner.content_key.to_bytes(),
                    )
                    .expect("sealed"),
                    vault,
                    role: permission::ADMINISTRATOR.to_string(),
                    permissions: permission::mask_of_role(permission::ADMINISTRATOR),
                    must_change_password: false,
                    created_at: 1_757_000_000_000,
                    updated_at: 1_757_000_000_000,
                },
            )
            .await
            .expect("the administrator");

        HeldOrganization {
            id: owner.organization_id.clone(),
            name: "Acme".to_string(),
            verifying_key: base64::Engine::encode(
                &base64::engine::general_purpose::URL_SAFE_NO_PAD,
                owner.verifying_key,
            ),
            remote_url: String::new(),
            member_id: Some("member-admin".to_string()),
            role: Some(permission::ADMINISTRATOR.to_string()),
            joined_at: 1_757_000_000_002,
        }
    }

    #[tokio::test]
    async fn an_owner_creates_a_workspace_migrated_recorded_signed_and_granted() {
        let directory = scratch("create");
        let (_, store, _, mut owner, platform) = owned(&directory).await;
        let pipeline = applying_pipeline().await;

        let facts = create_workspace(
            &store,
            &mut owner,
            &platform,
            |_| Pipeline::at(&pipeline.url("")),
            "  North Properties ",
            1_757_000_000_000,
        )
        .await
        .expect("the create failed");

        assert_eq!(facts.name, "North Properties");
        assert_eq!(facts.database_name, format!("ws-{}", facts.id));
        assert_eq!(
            facts.schema_version,
            crate::organization::migrate::shipped_version()
        );
        assert_eq!(facts.access_level, "full-access");

        // the database exists, protected, and the migration was posted with its own credential.
        let databases = platform.databases();

        assert_eq!(databases.len(), 2, "the organization's and the workspace's");
        assert!(databases.iter().all(|database| database.delete_protection));

        let minted = platform.minted();

        assert_eq!(
            minted[minted.len() - 2],
            (
                facts.database_name.clone(),
                MIGRATION_CREDENTIAL_LIFETIME.to_string(),
                AccessLevel::FullAccess
            )
        );
        assert_eq!(
            minted[minted.len() - 1],
            (
                facts.database_name.clone(),
                WORKSPACE_CREDENTIAL_LIFETIME.to_string(),
                AccessLevel::FullAccess
            )
        );

        let migration = pipeline.request(0);

        assert_eq!(migration.target, "/v2/pipeline");
        assert!(
            migration
                .header("authorization")
                .expect("a bearer")
                .ends_with(&format!(
                    "{}-{}-full-access",
                    facts.database_name, MIGRATION_CREDENTIAL_LIFETIME
                ))
        );

        // the rows are signed and verified on the way back, and the owner holds the grant.
        let workspaces = store
            .workspaces(&owner.verifying_key)
            .await
            .expect("the rows");
        let grants = store
            .grants(&owner.verifying_key)
            .await
            .expect("the grants");

        assert_eq!(workspaces.len(), 1);
        assert_eq!(workspaces[0].database_hostname, facts.database_hostname);
        assert!(grants.iter().any(|grant| grant.workspace_id == facts.id
            && grant.member_id == owner.member_id
            && grant.access_level == "full-access"));
        assert!(owner.workspace_credentials.contains_key(&facts.id));
    }

    /// Requirement 1: two workspaces of one organization, both openable.
    #[tokio::test]
    async fn two_workspaces_of_one_organization_exist_and_both_open() {
        let directory = scratch("two");
        let (_, store, _, mut owner, platform) = owned(&directory).await;
        let pipeline = applying_pipeline().await;
        let mut ids = Vec::new();

        for name in ["North", "South"] {
            let facts = create_workspace(
                &store,
                &mut owner,
                &platform,
                |_| Pipeline::at(&pipeline.url("")),
                name,
                1_757_000_000_000,
            )
            .await
            .expect("the create failed");

            ids.push(facts.id);
        }

        let workspaces = store
            .workspaces(&owner.verifying_key)
            .await
            .expect("the rows");

        assert_eq!(workspaces.len(), 2);

        for id in &ids {
            let (facts, credential) = openable(&owner, &workspaces, id)
                .expect("the open")
                .expect("a grant the owner holds");
            let replica = crate::database::Database::open_replica(
                &crate::database::Database::replica_path(&directory.join("app.db"), id),
                None,
                move || {
                    let token = credential.token.clone();
                    async move { Ok::<String, turso::Error>(token) }
                },
            )
            .await
            .expect("the workspace replica");

            replica.connect().await.expect("a connection");
            assert!(["North", "South"].contains(&facts.name.as_str()));
        }
    }

    /// Requirement 11, at the command: creating is the owner's, and anybody else is told to ask.
    #[tokio::test]
    async fn anybody_but_the_owner_is_refused_a_create_and_a_delete_before_any_request() {
        let directory = scratch("refused");
        let (_, store, _, mut owner, platform) = owned(&directory).await;
        let joined_b = second_member(&store, &owner).await;
        let mut member = sign_in(&store, &joined_b, OTHER_PASSWORD, &slot())
            .await
            .expect("the member did not sign in");
        let pipeline = applying_pipeline().await;
        let databases_before = platform.databases().len();

        let refusal = create_workspace(
            &store,
            &mut member,
            &platform,
            |_| Pipeline::at(&pipeline.url("")),
            "Theirs",
            1_757_000_000_000,
        )
        .await
        .expect_err("a member created a workspace");

        assert!(
            matches!(refusal, crate::error::Error::Forbidden { .. }),
            "{refusal:?}"
        );
        assert!(refusal.to_string().contains("ask the owner"), "{refusal}");
        assert_eq!(
            platform.databases().len(),
            databases_before,
            "a request was made"
        );

        let facts = create_workspace(
            &store,
            &mut owner,
            &platform,
            |_| Pipeline::at(&pipeline.url("")),
            "Ours",
            1_757_000_000_000,
        )
        .await
        .expect("the owner's create failed");

        let refusal = delete_workspace(&store, &mut member, &platform, &facts.id)
            .await
            .expect_err("a member deleted a workspace");

        assert!(
            matches!(refusal, crate::error::Error::Forbidden { .. }),
            "{refusal:?}"
        );
        assert!(platform.deleted().is_empty(), "a database was deleted");
    }

    /// Requirement 5 of effort 826, and criterion 5: the acts that need the Turso authority are
    /// the owner's and cannot be granted. An administrator carrying **every** one of the seven
    /// grantable acts is still refused a create, a delete and a renewal, each with the sentence
    /// naming the owner, and nothing reaches the account.
    ///
    /// **The permissions are asserted first**, so that a refusal is read as the owner check
    /// answering rather than as a bit the administrator happened not to hold.
    #[tokio::test]
    async fn an_administrator_holding_all_seven_acts_is_refused_the_acts_that_need_the_authority() {
        let directory = scratch("authority");
        let (_, store, _, mut owner, platform) = owned(&directory).await;
        let joined = an_administrator(&store, &owner).await;
        let mut administrator = sign_in(&store, &joined, OTHER_PASSWORD, &slot())
            .await
            .expect("the administrator did not sign in");
        let pipeline = applying_pipeline().await;

        assert_eq!(
            administrator.permissions, 0b111_1111,
            "the administrator does not carry all seven acts"
        );
        for act in permission::Administration::ALL {
            assert!(
                permission::permits(administrator.permissions, act),
                "{}",
                act.name()
            );
        }

        let existing = create_workspace(
            &store,
            &mut owner,
            &platform,
            |_| Pipeline::at(&pipeline.url("")),
            "Ours",
            1,
        )
        .await
        .expect("the owner's create failed");
        let databases = platform.databases().len();
        let minted = platform.minted().len();

        let refusal = create_workspace(
            &store,
            &mut administrator,
            &platform,
            |_| Pipeline::at(&pipeline.url("")),
            "Theirs",
            2,
        )
        .await
        .expect_err("an administrator created a workspace");

        assert!(
            matches!(refusal, crate::error::Error::Forbidden { .. }),
            "{refusal:?}"
        );
        assert!(refusal.to_string().contains("ask the owner"), "{refusal}");

        let refusal = delete_workspace(&store, &mut administrator, &platform, &existing.id)
            .await
            .expect_err("an administrator deleted a workspace");

        assert!(
            matches!(refusal, crate::error::Error::Forbidden { .. }),
            "{refusal:?}"
        );
        assert!(refusal.to_string().contains("ask the owner"), "{refusal}");

        let refusal = renew_credentials(
            &store,
            &mut administrator,
            &platform,
            &format!("org-{}", owner.organization_id),
        )
        .await
        .expect_err("an administrator renewed the credentials");

        assert!(
            matches!(refusal, crate::error::Error::Forbidden { .. }),
            "{refusal:?}"
        );
        assert!(refusal.to_string().contains("ask the owner"), "{refusal}");

        // and none of the three reached the account.
        assert_eq!(platform.databases().len(), databases, "a database was made");
        assert!(platform.deleted().is_empty(), "a database was deleted");
        assert_eq!(platform.minted().len(), minted, "a credential was minted");
    }

    /// **The property the asymmetric design exists for.** A member is added to a second workspace
    /// after they joined, by an owner who does not know their password: the grant is sealed to
    /// their public key, and their next sign-in unseals it.
    #[tokio::test]
    async fn a_member_is_added_to_a_second_workspace_after_joining_without_their_password() {
        let directory = scratch("second");
        let (_, store, _, mut owner, platform) = owned(&directory).await;
        let joined_b = second_member(&store, &owner).await;
        let pipeline = applying_pipeline().await;

        let first = create_workspace(
            &store,
            &mut owner,
            &platform,
            |_| Pipeline::at(&pipeline.url("")),
            "First",
            1,
        )
        .await
        .expect("the first create failed");

        grant_workspace(
            &store,
            &owner,
            Some(&platform),
            &first.id,
            "member-b",
            AccessLevel::FullAccess,
        )
        .await
        .expect("the first grant failed");

        // the member joins, and holds the first.
        let member = sign_in(&store, &joined_b, OTHER_PASSWORD, &slot())
            .await
            .expect("the member did not sign in");

        assert_eq!(member.workspace_credentials.len(), 1);
        assert!(member.workspace_credentials.contains_key(&first.id));

        // later, a second workspace, granted with nothing but the member's public key on hand.
        let second = create_workspace(
            &store,
            &mut owner,
            &platform,
            |_| Pipeline::at(&pipeline.url("")),
            "Second",
            2,
        )
        .await
        .expect("the second create failed");

        grant_workspace(
            &store,
            &owner,
            Some(&platform),
            &second.id,
            "member-b",
            AccessLevel::FullAccess,
        )
        .await
        .expect("the second grant failed");

        let member = sign_in(&store, &joined_b, OTHER_PASSWORD, &slot())
            .await
            .expect("the member did not sign in again");
        let workspaces = store
            .workspaces(&owner.verifying_key)
            .await
            .expect("the rows");

        assert_eq!(member.workspace_credentials.len(), 2);
        assert_eq!(
            member.workspace_credentials[&second.id].token,
            owner.workspace_credentials[&second.id].token,
            "a full-access grant is the granter's own credential, re-sealed"
        );
        assert!(
            openable(&member, &workspaces, &second.id)
                .expect("the open")
                .is_some()
        );
        // and no credential was minted for the member: the six are the organization's two at
        // creation and each workspace's two, its migration's and its owner's.
        assert_eq!(
            platform.minted().len(),
            6,
            "a credential was minted for the member"
        );
    }

    /// A read-only grant is minted, which needs the platform authority; a granter without it is
    /// refused for want of authority, and a full-access grant is refused to a granter who does not
    /// hold the workspace themselves.
    #[tokio::test]
    async fn a_read_only_grant_is_minted_and_only_where_the_authority_is() {
        let directory = scratch("readonly");
        let (_, store, _, mut owner, platform) = owned(&directory).await;
        let _ = second_member(&store, &owner).await;
        let pipeline = applying_pipeline().await;
        let facts = create_workspace(
            &store,
            &mut owner,
            &platform,
            |_| Pipeline::at(&pipeline.url("")),
            "W",
            1,
        )
        .await
        .expect("the create failed");

        grant_workspace(
            &store,
            &owner,
            Some(&platform),
            &facts.id,
            "member-b",
            AccessLevel::ReadOnly,
        )
        .await
        .expect("the read-only grant failed");

        let last = platform.minted().last().cloned().expect("a mint");

        assert_eq!(
            last,
            (
                facts.database_name.clone(),
                WORKSPACE_CREDENTIAL_LIFETIME.to_string(),
                AccessLevel::ReadOnly
            )
        );

        let grants = store
            .grants(&owner.verifying_key)
            .await
            .expect("the grants");
        let theirs = grants
            .iter()
            .find(|grant| grant.member_id == "member-b")
            .expect("the member's grant");

        assert_eq!(theirs.access_level, "read-only");

        // no authority on this machine: refused, not minted.
        let refusal = grant_workspace::<InMemoryPlatform>(
            &store,
            &owner,
            None,
            &facts.id,
            "member-b",
            AccessLevel::ReadOnly,
        )
        .await
        .expect_err("a read-only grant was made with no authority");

        assert!(refusal.to_string().contains("owner's machine"), "{refusal}");

        // a granter who holds no full-access credential for the workspace grants nothing.
        let mut stranger = sign_in(&store, &store_joined(&owner), PASSWORD, &slot())
            .await
            .expect("the owner again");
        stranger.workspace_credentials.clear();

        let refusal = grant_workspace(
            &store,
            &stranger,
            Some(&platform),
            &facts.id,
            "member-b",
            AccessLevel::FullAccess,
        )
        .await
        .expect_err("a grant was made from nothing");

        assert!(
            refusal.to_string().contains("hold full access"),
            "{refusal}"
        );
    }

    fn store_joined(owner: &MemberSession) -> HeldOrganization {
        HeldOrganization {
            id: owner.organization_id.clone(),
            name: "Acme".to_string(),
            verifying_key: base64::Engine::encode(
                &base64::engine::general_purpose::URL_SAFE_NO_PAD,
                owner.verifying_key,
            ),
            remote_url: String::new(),
            member_id: Some(owner.member_id.clone()),
            role: Some(permission::OWNER.to_string()),
            joined_at: 0,
        }
    }

    /// Requirement 12 at the command: a member whose row does not carry `grantWorkspace` is refused
    /// a grant however the interface looks.
    #[tokio::test]
    async fn a_member_without_the_act_is_refused_a_grant_by_the_command() {
        let directory = scratch("act");
        let (_, store, _, mut owner, platform) = owned(&directory).await;
        let joined_b = second_member(&store, &owner).await;
        let pipeline = applying_pipeline().await;
        let facts = create_workspace(
            &store,
            &mut owner,
            &platform,
            |_| Pipeline::at(&pipeline.url("")),
            "W",
            1,
        )
        .await
        .expect("the create failed");
        let member = sign_in(&store, &joined_b, OTHER_PASSWORD, &slot())
            .await
            .expect("the member");

        let refusal = grant_workspace(
            &store,
            &member,
            Some(&platform),
            &facts.id,
            "member-b",
            AccessLevel::FullAccess,
        )
        .await
        .expect_err("a member without the act granted");

        assert!(
            matches!(refusal, crate::error::Error::Forbidden { .. }),
            "{refusal:?}"
        );
        assert!(refusal.to_string().contains("grantWorkspace"), "{refusal}");
    }

    /// Deletion goes through the one intent the port takes for it, and the rows go with it.
    #[tokio::test]
    async fn deleting_a_workspace_is_the_human_intent_and_removes_the_rows() {
        let directory = scratch("delete");
        let (_, store, _, mut owner, platform) = owned(&directory).await;
        let pipeline = applying_pipeline().await;
        let facts = create_workspace(
            &store,
            &mut owner,
            &platform,
            |_| Pipeline::at(&pipeline.url("")),
            "W",
            1,
        )
        .await
        .expect("the create failed");

        delete_workspace(&store, &mut owner, &platform, &facts.id)
            .await
            .expect("the delete failed");

        assert_eq!(
            platform.deleted(),
            vec![(
                facts.database_name.clone(),
                DeletionIntent::WorkspaceDeletedByHuman
            )]
        );
        assert!(
            store
                .workspaces(&owner.verifying_key)
                .await
                .expect("rows")
                .is_empty()
        );
        assert!(
            store
                .grants(&owner.verifying_key)
                .await
                .expect("grants")
                .iter()
                .all(|grant| grant.workspace_id != facts.id)
        );
        assert!(!owner.workspace_credentials.contains_key(&facts.id));
    }

    /// Ticket 24, F2's renewal half: a renewal seals nothing to a removed member, so a grant row
    /// replayed onto the database by a member who still holds the organization credential earns
    /// them no fresh credential. The member row stands as `removed` and the grant is kept, which is
    /// exactly what a replay leaves; the renewal skips it.
    #[tokio::test]
    async fn renew_credentials_seals_nothing_to_a_removed_member() {
        let directory = scratch("renew-removed");
        let (_, store, _, mut owner, platform) = owned(&directory).await;
        second_member(&store, &owner).await;
        let pipeline = applying_pipeline().await;
        let facts = create_workspace(
            &store,
            &mut owner,
            &platform,
            |_| Pipeline::at(&pipeline.url("")),
            "W",
            1,
        )
        .await
        .expect("the create failed");

        grant_workspace(
            &store,
            &owner,
            Some(&platform),
            &facts.id,
            "member-b",
            AccessLevel::FullAccess,
        )
        .await
        .expect("the grant failed");

        // member-b is removed, and their grant is left in place as a replay would leave it: the
        // row read as `removed`, the grant still present.
        let (key, certificate) = super::signer_of(&store, &owner).await.expect("the signer");
        let signer = Signer {
            key: &key,
            certificate: &certificate,
        };
        let mut member_b = store
            .members(&owner.verifying_key)
            .await
            .expect("members")
            .into_iter()
            .find(|member| member.id == "member-b")
            .expect("member-b");
        member_b.role = permission::REMOVED.to_string();
        store
            .write_member(&signer, &member_b)
            .await
            .expect("removed");

        let organization_database = format!("org-{}", owner.organization_id);
        let renewed = renew_credentials(&store, &mut owner, &platform, &organization_database)
            .await
            .expect("the renewal failed");

        // the owner's two grants renew, the removed member's does not: three grants stand and one
        // is skipped.
        assert_eq!(renewed, 2);
    }

    /// The documented limitation of an ordinary removal. A removed member who keeps a modified
    /// client and the organization-database credential can replay their own old, still-validly
    /// signed `role=member` row and grant: the authority a member row carries has no id, nonce, or
    /// monotonic field, and an ordinary removal deliberately does not rotate the credential so an
    /// offline colleague is not broken. The owner's next renewal cannot tell the replayed row from
    /// a legitimate one and re-seals them a fresh credential. This pins that as behaviour rather
    /// than leaving it to be found as a bug; the answer to a hostile departure is
    /// "remove and lock out now", which rotates the credential the replay rides on.
    #[tokio::test]
    async fn an_ordinary_removal_does_not_defeat_a_members_replay_of_their_own_row() {
        let directory = scratch("replay");
        let (_, store, _, mut owner, platform) = owned(&directory).await;
        second_member(&store, &owner).await;
        let pipeline = applying_pipeline().await;
        let facts = create_workspace(
            &store,
            &mut owner,
            &platform,
            |_| Pipeline::at(&pipeline.url("")),
            "W",
            1,
        )
        .await
        .expect("the create failed");

        grant_workspace(
            &store,
            &owner,
            Some(&platform),
            &facts.id,
            "member-b",
            AccessLevel::FullAccess,
        )
        .await
        .expect("the grant failed");

        let (key, certificate) = super::signer_of(&store, &owner).await.expect("the signer");
        let signer = Signer {
            key: &key,
            certificate: &certificate,
        };

        // what member-b holds from when they were a member: their own signed `role=member` row and
        // their grant. The owner's signature over them is deterministic, so writing them back under
        // the owner's signer reproduces the exact on-disk rows a replay puts back. That the store
        // cannot tell those from legitimately signed rows is the finding itself.
        let member_row = store
            .members(&owner.verifying_key)
            .await
            .expect("members")
            .into_iter()
            .find(|member| member.id == "member-b")
            .expect("member-b");
        let grant_row = store
            .grants(&owner.verifying_key)
            .await
            .expect("grants")
            .into_iter()
            .find(|grant| grant.member_id == "member-b")
            .expect("member-b grant");

        // an ordinary removal: the member row is re-signed `removed` and the grant is deleted.
        let mut removed = member_row.clone();
        removed.role = permission::REMOVED.to_string();
        store
            .write_member(&signer, &removed)
            .await
            .expect("removed");
        store
            .delete_grant("member-b", &facts.id)
            .await
            .expect("grant deleted");

        // renewal skips the removed member: the owner's two grants renew, member-b's does not.
        let organization_database = format!("org-{}", owner.organization_id);
        let after_removal =
            renew_credentials(&store, &mut owner, &platform, &organization_database)
                .await
                .expect("the renewal failed");
        assert_eq!(
            after_removal, 2,
            "an ordinary removal stops renewing the removed member"
        );

        // the replay: member-b puts their own historical rows back, flipping `removed` to `member`.
        store
            .write_member(&signer, &member_row)
            .await
            .expect("replayed member");
        store
            .write_grant(&signer, &grant_row)
            .await
            .expect("replayed grant");

        // and the owner's next renewal re-credentials them. This is the limitation requirement 14
        // now records: ordinary removal ends renewal, not a determined replay; lock-out is what
        // does, because it rotates the credential the replay rides on.
        let after_replay = renew_credentials(&store, &mut owner, &platform, &organization_database)
            .await
            .expect("the second renewal failed");
        assert_eq!(
            after_replay, 3,
            "the replay earns the removed member a fresh credential"
        );
    }

    /// Ticket 24, F4's cheap check: a credential within the window is due and one comfortably live
    /// is not, so the owner's machine mints when something is close rather than on every launch. A
    /// grant with no recorded expiry, which is a token that never expires, is never due.
    #[tokio::test]
    async fn credentials_due_answers_on_the_soonest_expiry() {
        let directory = scratch("due");
        let (_, store, _, owner, _) = owned(&directory).await;
        let now = 1_757_000_000_000_i64;
        let day = 24 * 60 * 60 * 1000_i64;

        // whatever the owner's organization grant records for its expiry, nothing is within a
        // second of now, so nothing is due.
        assert!(
            !credentials_due(&store, &owner, 1000, now)
                .await
                .expect("due read")
        );

        // a grant three days out is due within a week and not within a day.
        let (key, certificate) = super::signer_of(&store, &owner).await.expect("the signer");
        store
            .write_grant(
                &Signer {
                    key: &key,
                    certificate: &certificate,
                },
                &GrantRecord {
                    member_id: owner.member_id.clone(),
                    workspace_id: "ws-soon".to_string(),
                    sealed_credential: seal_to_public_key(
                        &owner.secret.public_key(),
                        b"a-credential",
                    )
                    .expect("sealed"),
                    access_level: AccessLevel::FullAccess.as_str().to_string(),
                    credential_expires_at: Some((now + 3 * day).to_string()),
                },
            )
            .await
            .expect("the grant");

        assert!(
            credentials_due(&store, &owner, 7 * day, now)
                .await
                .expect("due read")
        );
        assert!(
            !credentials_due(&store, &owner, day, now)
                .await
                .expect("due read")
        );
    }

    /// Renewal mints fresh credentials and re-seals them to every member who still holds a grant,
    /// one mint per database and level, and the owner's own move with the rows.
    #[tokio::test]
    async fn renewal_reseals_every_standing_grant_from_one_mint_per_database_and_level() {
        let directory = scratch("renew");
        let (_, store, _, mut owner, platform) = owned(&directory).await;
        let joined_b = second_member(&store, &owner).await;
        let pipeline = applying_pipeline().await;
        let facts = create_workspace(
            &store,
            &mut owner,
            &platform,
            |_| Pipeline::at(&pipeline.url("")),
            "W",
            1,
        )
        .await
        .expect("the create failed");

        grant_workspace(
            &store,
            &owner,
            Some(&platform),
            &facts.id,
            "member-b",
            AccessLevel::FullAccess,
        )
        .await
        .expect("the grant failed");

        let before = platform.minted().len();
        let organization_database = format!("org-{}", owner.organization_id);

        let renewed = renew_credentials(&store, &mut owner, &platform, &organization_database)
            .await
            .expect("the renewal failed");

        // three grants stand: the owner's on the organization, and two on the workspace.
        assert_eq!(renewed, 3);
        // two databases at full access: one mint each, shared by the two members of the workspace.
        assert_eq!(platform.minted().len(), before + 2);

        let member = sign_in(&store, &joined_b, OTHER_PASSWORD, &slot())
            .await
            .expect("the member");

        assert_eq!(
            member.workspace_credentials[&facts.id].token,
            owner.workspace_credentials[&facts.id].token,
            "the member's renewed grant is the same fresh credential the owner holds"
        );
        assert!(
            owner.workspace_credentials[&facts.id]
                .token
                .contains(WORKSPACE_CREDENTIAL_LIFETIME)
        );
    }

    /// A migration the database refuses leaves no workspace and no database behind.
    #[tokio::test]
    async fn a_create_whose_migration_fails_removes_the_database_it_made() {
        let directory = scratch("rollback");
        let (_, store, _, mut owner, platform) = owned(&directory).await;
        let pipeline = ScriptedServer::start(vec![ScriptedResponse::new(
            200,
            json!({ "results": [{ "type": "error", "error": { "message": "no" } }] }).to_string(),
        )])
        .await;

        let error = create_workspace(
            &store,
            &mut owner,
            &platform,
            |_| Pipeline::at(&pipeline.url("")),
            "W",
            1,
        )
        .await
        .expect_err("a workspace with no schema was reported");

        assert!(error.to_string().contains("was not created"), "{error}");
        assert_eq!(platform.deleted().len(), 1);
        assert_eq!(
            platform.deleted()[0].1,
            DeletionIntent::CreatedAndUnreferenced
        );
        assert!(
            store
                .workspaces(&owner.verifying_key)
                .await
                .expect("rows")
                .is_empty()
        );
    }
    /// Live, at the human's request, and admitted in [[rules/testing]] under *Tests that reach a
    /// live remote* as the fifth property's first instance: **a `read-only` grant's write is refused
    /// by Turso**, not by the interface. A workspace database is provisioned through the port,
    /// migrated over the wire, and opened twice: once with a read-only credential, whose pushed row
    /// Turso refuses, and once with a full-access one, whose push lands. The database is deleted by
    /// the same run. The other half of criterion 11, an administrator's delete refused for want of
    /// authority, needs no live account: the command refuses before any request, which
    /// `anybody_but_the_owner_is_refused_a_create_and_a_delete_before_any_request` performs.
    ///
    /// ```text
    /// RENTABLE_LIVE_TURSO=1 TURSO_CONSENT_TOKEN=… TURSO_ORG=… TURSO_GROUP=… \
    ///   cargo test --manifest-path ./apps/desktop/tauri/Cargo.toml \
    ///   workspace_live -- --test-threads=1 --ignored --nocapture
    /// ```
    #[tokio::test]
    #[ignore = "reaches a live Turso account and creates a database; see the doc comment"]
    async fn workspace_live_a_read_only_credential_is_refused_by_turso_and_a_full_one_is_not() {
        use crate::sync::turso::{
            consent::store_platform_token,
            discovery::TursoOrganization,
            platform::{PlatformApi, PlatformEndpoint, TursoPlatform},
        };

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
        store_platform_token(&read("TURSO_CONSENT_TOKEN")).expect("failed to file the token");

        let platform = PlatformApi::new(
            PlatformEndpoint::production(),
            TursoOrganization {
                slug: read("TURSO_ORG"),
                group: read("TURSO_GROUP"),
            },
        );
        let nonce = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|elapsed| elapsed.as_nanos())
            .unwrap_or_default();
        let name = format!("t819-14-{nonce:x}");
        let database = platform
            .create_database(&name)
            .await
            .expect("the live create failed");

        eprintln!("created {name} at {}", database.hostname);

        // the schema, with a credential minted for it, as a create does.
        let migration = platform
            .mint_token(
                &name,
                MIGRATION_CREDENTIAL_LIFETIME,
                AccessLevel::FullAccess,
            )
            .await
            .expect("the migration mint failed");

        crate::organization::migrate::apply(
            &Pipeline::of(&database.hostname),
            &migration,
            crate::organization::migrate::shipped_version() as usize,
        )
        .await
        .expect("the live migration failed");

        let read_only = platform
            .mint_token(&name, "1h", AccessLevel::ReadOnly)
            .await
            .expect("the read-only mint failed");
        let full_access = platform
            .mint_token(&name, "1h", AccessLevel::FullAccess)
            .await
            .expect("the full-access mint failed");
        let remote = format!("libsql://{}", database.hostname);
        let directory = scratch("live");

        let write_and_push = |replica: &'static str, token: String| {
            let path = directory.join(format!("{replica}.db"));
            let remote = remote.clone();

            async move {
                let engine =
                    crate::database::Database::open_replica(&path, Some(remote), move || {
                        let token = token.clone();
                        async move { Ok::<String, turso::Error>(token) }
                    })
                    .await
                    .expect("the replica");

                assert!(
                    engine.pull().await.is_ok(),
                    "the {replica} replica could not pull"
                );

                let connection = engine.connect().await.expect("a connection");

                connection
                    .execute(
                        "INSERT INTO complex (id, name, location) VALUES (?, ?, ?)",
                        vec![
                            turso::Value::Text(format!("c-{replica}")),
                            turso::Value::Text(format!("Live Tower {replica}")),
                            turso::Value::Text("nowhere".to_string()),
                        ],
                    )
                    .await
                    .expect("the local write");

                engine.push().await
            }
        };

        // requirement 11: the refusal comes from Turso, on the credential it minted.
        let refused = write_and_push("read-only", read_only).await;

        eprintln!("read-only push: {refused:?}");
        assert!(
            refused.is_err(),
            "turso accepted a write on a read-only credential"
        );

        let landed = write_and_push("full-access", full_access).await;

        eprintln!("full-access push: {landed:?}");
        assert!(
            landed.is_ok(),
            "turso refused a write on a full-access credential"
        );

        platform
            .delete_database(&name, DeletionIntent::CreatedAndUnreferenced)
            .await
            .expect("the live delete failed, and the database is left behind");

        eprintln!("removed {name}");
    }
}
