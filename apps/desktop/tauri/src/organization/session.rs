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
//! joined, and never one read out of the database. What the machine remembers about a member,
//! their id and their role, locates the row; what the row says, once verified, is the truth.
//!
//! **What a session holds stays in this process.** The member's secret key, the organization
//! content key and the credential that reaches the organization database are in [`MemberSession`]
//! and nothing serialises it; what crosses to the web layer is [`SessionFacts`], facts about the
//! member and their workspaces, and no key ([[rules/credentials]], *Client boundary*).

use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};

use crate::error::Error;

use super::{
    JoinedOrganization,
    authority::VERIFYING_KEY_BYTES,
    store::OrganizationStore,
    vault::{
        CONTENT_KEY_BYTES, ContentKey, MemberSecretKey, open_content, open_vault,
        unseal_with_secret_key,
    },
};

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
    pub email: String,
    pub display_name: String,
    pub role: String,
    pub permissions: i64,
    pub must_change_password: bool,
    /// the workspaces this member holds a grant on, and only those.
    pub workspaces: Vec<WorkspaceFacts>,
}

/// Open `joined`'s member row in `store` with `password`.
///
/// The steps, and why in this order: the rows are read and verified first, so a forged row is
/// refused before any key is derived from the password; the vault is opened, which is the one
/// place a wrong password fails; the content key is unsealed, which is what makes any name
/// legible; and the grant on the organization database is unsealed into `credential`, which is
/// what lets the replica reach the remote from now on.
pub async fn sign_in(
    store: &OrganizationStore,
    joined: &JoinedOrganization,
    password: &str,
    credential: &CredentialSlot,
) -> Result<MemberSession, Error> {
    let verifying_key = verifying_key_of(joined)?;
    let members = store.members(&verifying_key).await?;
    let member = members
        .iter()
        .find(|member| member.id == joined.member_id)
        .ok_or_else(|| Error::NotFound {
            message: "this machine's member row is not in the organization any more".to_string(),
        })?;

    // the one place a password can fail, and it says only that the value did not open.
    let secret = open_vault(password, &member.vault)?;
    let content_key = {
        let bytes = unseal_with_secret_key(&secret, &member.sealed_content_key)?;

        ContentKey::from_bytes(
            <[u8; CONTENT_KEY_BYTES]>::try_from(bytes.as_slice()).map_err(|_| {
                Error::Integrity {
                    message: "the sealed content key is not a content key".to_string(),
                }
            })?,
        )
    };

    // the grant on the organization database itself, which every member holds: it is what the
    // replica syncs with from now on. Absent, the member reads what the replica already holds and
    // nothing new arrives, which is the offline case rather than a failure of signing in.
    let grants = store.grants(&verifying_key).await?;

    if let Some(grant) = grants
        .iter()
        .find(|grant| grant.member_id == member.id && grant.workspace_id == joined.id)
    {
        let token = unseal_with_secret_key(&secret, &grant.sealed_credential)?;

        *credential.lock().map_err(|_| Error::Internal {
            message: "the credential slot was poisoned".to_string(),
        })? = Some(String::from_utf8(token).map_err(|_| Error::Integrity {
            message: "the sealed credential is not text".to_string(),
        })?);
    }

    Ok(MemberSession {
        organization_id: joined.id.clone(),
        member_id: member.id.clone(),
        role: member.role.clone(),
        permissions: member.permissions,
        must_change_password: member.must_change_password,
        verifying_key,
        secret,
        content_key,
        organization_credential: Arc::clone(credential),
    })
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

    Ok(SessionFacts {
        organization_id: session.organization_id.clone(),
        organization_name,
        member_id: member.id.clone(),
        email: opened(
            &session.content_key,
            "member.email_sealed",
            &member.email_sealed,
        )?,
        display_name: opened(
            &session.content_key,
            "member.display_name_sealed",
            &member.display_name_sealed,
        )?,
        role: member.role.clone(),
        permissions: member.permissions,
        must_change_password: member.must_change_password,
        workspaces: workspace_facts,
    })
}

/// The key this machine pinned when it joined, as the chain takes it.
pub fn verifying_key_of(joined: &JoinedOrganization) -> Result<[u8; VERIFYING_KEY_BYTES], Error> {
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

    use super::{CredentialSlot, facts_of, sign_in};
    use crate::{
        organization::{
            JoinedOrganization,
            authority::{AdministratorKey, OrganizationKey, issue_certificate},
            setup::{CreateOrganization, Remote, create_organization},
            store::{GrantRecord, MemberRecord, OrganizationRecord, OrganizationStore, Signer},
            vault::{
                KdfParams, create_vault, create_vault_with_secret, generate_content_key,
                seal_content, seal_to_public_key, unseal_with_secret_key,
            },
        },
        persisted::Persisted,
        sync::{
            RemoteSyncStore,
            google::test::server::{ScriptedResponse, ScriptedServer},
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
        JoinedOrganization,
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
                password: PASSWORD,
            },
            test_cost(),
            1_757_000_000_000,
        )
        .await
        .expect("the first run failed");
        let joined = store.organizations[0].clone();

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
        assert_eq!(session.member_id, joined.member_id);
        assert!(!session.must_change_password);
        assert_eq!(facts.organization_name, "Acme");
        assert_eq!(facts.role, "owner");
        assert_eq!(facts.email, "");
        assert!(
            facts.workspaces.is_empty(),
            "a first run has no workspace yet"
        );

        // the grant on the organization database was unsealed into the slot the replica reads.
        let unsealed = credential.lock().expect("the slot").clone();

        assert_eq!(
            unsealed.as_deref(),
            Some(format!("token-for-org-{}-4w", joined.id).as_str())
        );
        assert_eq!(
            format!("{session:?}"),
            format!("MemberSession({} in {})", joined.member_id, joined.id)
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

    /// Requirement 17: two organizations on one machine, and one person with a different role in
    /// each. The second is one somebody else administers, in which this machine's person is a
    /// member who must still change their password.
    #[tokio::test]
    async fn two_organizations_on_one_machine_open_with_their_own_passwords_and_roles() {
        let directory = scratch("two");
        let (mut machine, store_a, joined_a) = created(&directory).await;

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
                    email_sealed: seal_content(
                        &content_key,
                        "member.email_sealed",
                        b"me@b.example",
                    )
                    .expect("sealed"),
                    display_name_sealed: seal_content(
                        &content_key,
                        "member.display_name_sealed",
                        b"Me",
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

        let joined_b = JoinedOrganization {
            id: "b".to_string(),
            name: "Beta".to_string(),
            verifying_key: base64::Engine::encode(
                &base64::engine::general_purpose::URL_SAFE_NO_PAD,
                organization_key.verifying_key(),
            ),
            remote_url: "libsql://org-b-other.aws-eu-west-1.turso.io".to_string(),
            member_id: "me-there".to_string(),
            role: "member".to_string(),
            joined_at: 1_757_000_000_001,
        };

        machine.organizations.push(joined_b.clone());
        machine.commit().expect("the record");

        // both are listed, and each opens with its own password and its own role.
        assert_eq!(machine.organizations.len(), 2);

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
        assert_eq!(facts.email, "me@b.example");
        assert_eq!(facts.display_name, "Me");

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
}
