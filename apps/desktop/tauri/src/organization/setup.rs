//! the first run: an owner names an organization, chooses a username and sets a password, and
//! the organization exists on their own Turso account with them in it.
//!
//! **Three things are typed and nothing else.** The name, the username and the password. *Two
//! until effort 824's requirement 21 made an account a username; the owner's row carried an empty
//! address and an empty display name before it.* The slug is discovered
//! (`sync/turso/discovery.rs`), the group is whichever the consent was granted over, the database
//! is created here, and every key is generated or derived here. The consent itself happened before
//! this is reached, in a browser, and this module spends what it filed and asks nothing of the
//! person.
//!
//! **Either the run completes or it leaves nothing.** A database is created on the customer's
//! account early and everything after it can fail, so every failure past that point deletes the
//! database, as one this process created and could not finish, and removes the replica file. What
//! it leaves behind is the slug and the group, which are facts about the consent and stay true.
//!
//! # Where the keys live, which this ticket decides
//!
//! **The organization key is derived from the owner's vault secret and stored nowhere**, and so is
//! the owner's administrator signing key. `vault::MemberSecretKey::derive_seed` is the derivation
//! and says why. The two homes it rejects are the ones the alternatives had: a column in the
//! organization database, which is the database the key protects, and this machine's keyring,
//! which fails requirement 6 the day the owner installs on a second machine. A derived key follows
//! the owner's password to any machine, survives a password change because a change re-seals the
//! same secret, and is replaced by a reset because a reset replaces the secret, which is when
//! certificates are reissued. Nothing is written down.
//!
//! **The content key is drawn at random and sealed to the owner's public key** in their member
//! row, as it will be sealed to every member's; the plan's key schedule says so.
//!
//! **The owner's credential to the organization database is a grant like any other**, with the
//! organization's own id where a workspace's would be: a grant is a database credential sealed to
//! a member, and the directory is one of the databases a member holds a credential to. Renewing
//! it is the ticket that renews every grant.

use std::path::Path;

use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD as BASE64URL};
use serde::{Deserialize, Serialize};

use crate::{
    diagnostics,
    error::Error,
    persisted::Persisted,
    sync::{
        RemoteSyncStore,
        turso::{
            discovery::{self, McpEndpoint, TursoOrganization},
            platform::{AccessLevel, DeletionIntent, TursoPlatform},
        },
    },
};

use super::{
    HeldOrganization,
    authority::{AdministratorKey, OrganizationKey, issue_certificate},
    invite::validate_username,
    link::JoinLink,
    session::remember,
    store::{GrantRecord, MemberRecord, OrganizationRecord, OrganizationStore, Signer},
    vault::{
        KdfParams, create_vault_with_secret_and_key, generate_content_key, seal_content,
        seal_to_public_key,
    },
};

/// What a member's grant to the organization database is minted for. Renewal is the grant
/// ticket's; until it lands, this is how long a first run's owner can sync the directory for.
pub const ORGANIZATION_CREDENTIAL_LIFETIME: &str = "4w";

/// The read-only credential a join link carries never expires, because a link is a locator and a
/// locator does not go stale (requirement 23). `never` is Turso's own spelling for it.
pub const LINK_CREDENTIAL_LIFETIME: &str = "never";

pub const OWNER_ROLE: &str = "owner";

/// Every grantable act, as `packages/workspace-permission` masks them: seven flags, seven bits.
/// The package is the vocabulary and this is its value for the role that holds all of it. What
/// else an owner may do is not in this number, because requirement 5 keeps the acts that need the
/// Turso authority out of the table altogether.
pub const OWNER_PERMISSIONS: i64 = 0b111_1111;

/// The strength floor, checked on the machine. There is no server to slow a guess down, so the
/// password is the whole defence, and the floor is length because length is what an attacker
/// pays for. Twelve is the least the interface accepts and the sentence beside the field says why.
pub const MINIMUM_PASSWORD_LENGTH: usize = 12;

/// The Argon2id cost a vault is sealed at when it is made here: `m = 256 MiB, t = 3, p = 1`,
/// measured at 257 to 273 ms in release by ticket 06. It is data in a column rather than a
/// constant the vault knows, so raising it is a re-seal on the next sign-in.
pub const SHIPPING_KDF: KdfParams = KdfParams {
    memory_kib: 256 * 1024,
    iterations: 3,
    lanes: 1,
};

/// The two purposes the owner's secret is turned into signing keys for.
pub const ORGANIZATION_KEY_PURPOSE: &str = "organization-key";
pub const ADMINISTRATOR_KEY_PURPOSE: &str = "administrator-key";

/// The three things a first run is given.
#[derive(Clone, Debug)]
pub struct CreateOrganization<'a> {
    pub name: &'a str,
    /// the owner's own username, under `invite::validate_username`'s rules like every other.
    pub username: &'a str,
    pub password: &'a str,
}

/// What the web layer is told: the organization's id and the link the owner can hand out. No key,
/// no token and no password is in it.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrganizationCreated {
    pub organization_id: String,
    pub join_link: String,
    /// whether the rows reached Turso before this answered. The replica keeps them either way and
    /// sends them with the next push; what a person needs to know is that the link works once
    /// they have arrived.
    pub synced: bool,
}

/// How a database's hostname becomes the replica's remote.
///
/// **An input rather than a `format!`, because `turso.io` answers wildcard DNS.** Every name
/// under it resolves to Turso's load balancer, so a unit test that derived a remote from a fake
/// hostname would push to a real server with a fake token. Production hands in [`Remote::libsql`];
/// a test hands in [`Remote::none`] and the replica stays on this machine.
#[derive(Clone, Copy, Debug)]
pub enum Remote {
    /// `libsql://<hostname>`, which is what the sync engine takes.
    Libsql,
    /// no remote: the replica is local, and a push has nowhere to go.
    None,
}

impl Remote {
    pub fn libsql() -> Self {
        Self::Libsql
    }

    #[cfg(test)]
    pub(crate) fn none() -> Self {
        Self::None
    }

    fn url_for(self, hostname: &str) -> Option<String> {
        match self {
            Self::Libsql => Some(format!("libsql://{hostname}")),
            Self::None => None,
        }
    }
}

/// Create an organization on the consented account, with `request`'s owner in it.
///
/// `platform_for` builds the Platform API client once the organization slug is known, which on a
/// first run into an empty group is only after the MCP server has created the first database;
/// `discovery.rs` says why that database cannot be created any other way.
#[allow(clippy::too_many_arguments)]
pub async fn create_organization<P, F>(
    store: &mut Persisted<RemoteSyncStore>,
    platform_token: &str,
    mcp: &McpEndpoint,
    platform_for: F,
    remote: Remote,
    database_path: &Path,
    request: CreateOrganization<'_>,
    kdf_params: KdfParams,
    now: i64,
) -> Result<(OrganizationCreated, OrganizationStore), Error>
where
    P: TursoPlatform,
    F: Fn(TursoOrganization) -> P,
{
    let name = request.name.trim();
    let username = request.username.trim();

    if name.is_empty() {
        return Err(Error::InvalidInput {
            message: "the organization needs a name".to_string(),
        });
    }

    // the owner is the first member, so nobody holds the username yet; the shape is the whole
    // check, and it is the same check an invitation makes.
    validate_username(username)?;

    if request.password.chars().count() < MINIMUM_PASSWORD_LENGTH {
        return Err(Error::InvalidInput {
            message: format!(
                "the password needs at least {MINIMUM_PASSWORD_LENGTH} characters. it is the only \
                 thing between anybody holding the organization's records and reading them"
            ),
        });
    }

    let organization_id = random_id()?;
    let database_name = format!("org-{organization_id}");

    // the database, and the slug it is created under or read from.
    let (organization, hostname) = match discovery::organization(store, platform_token, mcp).await?
    {
        Some(organization) => {
            let database = platform_for(organization.clone())
                .create_database(&database_name)
                .await?;

            (organization, database.hostname)
        }
        None => {
            let first =
                discovery::create_first_database(platform_token, mcp, &database_name).await?;

            store.turso_organization = Some(first.organization.clone());
            store.commit()?;

            (first.organization, first.hostname)
        }
    };
    let platform = platform_for(organization);

    // from here on a database exists that nothing refers to yet, so every failure removes it.
    let finished = finish(
        &platform,
        store,
        remote,
        database_path,
        &organization_id,
        &database_name,
        &hostname,
        name,
        username,
        request.password,
        kdf_params,
        now,
    )
    .await;

    match finished {
        Ok(finished) => Ok(finished),
        Err(error) => {
            leave_nothing(&platform, database_path, &organization_id, &database_name).await;

            Err(error)
        }
    }
}

/// Everything after the database exists: the credentials, the keys, the rows, the push, and the
/// record of this machine having joined.
#[allow(clippy::too_many_arguments)]
async fn finish<P: TursoPlatform>(
    platform: &P,
    store: &mut Persisted<RemoteSyncStore>,
    remote: Remote,
    database_path: &Path,
    organization_id: &str,
    database_name: &str,
    hostname: &str,
    name: &str,
    username: &str,
    password: &str,
    kdf_params: KdfParams,
    now: i64,
) -> Result<(OrganizationCreated, OrganizationStore), Error> {
    // the MCP first-create leaves a database unprotected, and the Platform API's own create
    // protects inside itself, so this is idempotent where it is redundant and load-bearing where
    // it is not.
    platform.protect_database(database_name).await?;

    let owner_credential = platform
        .mint_token(
            database_name,
            ORGANIZATION_CREDENTIAL_LIFETIME,
            AccessLevel::FullAccess,
        )
        .await?;
    // read-only: what a join link carries reads the directory and writes nothing to it, which is
    // what keeps a link found in a chat history a locator.
    let link_credential = platform
        .mint_token(
            database_name,
            LINK_CREDENTIAL_LIFETIME,
            AccessLevel::ReadOnly,
        )
        .await?;
    // what every other machine reaches the organization at, and what the rows record. The
    // replica on this machine is opened against it where there is one to open against.
    let remote_url = format!("libsql://{hostname}");
    let replica_remote = remote.url_for(hostname);

    // the owner's keys: the vault their password opens, the key that opens it, and the two
    // signing keys that follow from its secret.
    let (vault, secret, member_key) = create_vault_with_secret_and_key(password, kdf_params)?;
    let organization_key =
        OrganizationKey::from_bytes(&secret.derive_seed(ORGANIZATION_KEY_PURPOSE)?);
    let administrator_key =
        AdministratorKey::from_bytes(&secret.derive_seed(ADMINISTRATOR_KEY_PURPOSE)?);
    let verifying_key = organization_key.verifying_key();
    let member_id = random_id()?;
    let certificate = issue_certificate(
        &organization_key,
        &format!("cert-{member_id}"),
        &member_id,
        &administrator_key.verifying_key(),
        &now.to_string(),
    );
    let content_key = generate_content_key()?;

    // the replica, its schema, and the rows.
    let replica = OrganizationStore::replica_path(database_path, organization_id);
    let token = owner_credential.clone();
    let organization_store = OrganizationStore::open(&replica, replica_remote, move || {
        let token = token.clone();
        async move { Ok::<String, turso::Error>(token) }
    })
    .await?;

    organization_store.install_schema().await?;
    organization_store
        .write_organization(&OrganizationRecord {
            id: organization_id.to_string(),
            name_sealed: seal_content(&content_key, "organization.name_sealed", name.as_bytes())?,
            verifying_key,
            remote_url: remote_url.clone(),
            // sealed rather than in the clear: a member whose vault is open makes a link from it,
            // and a reader of the database alone gets no credential out of it.
            link_credential_sealed: seal_content(
                &content_key,
                "organization.link_credential_sealed",
                link_credential.as_bytes(),
            )?,
            created_at: now,
        })
        .await?;
    organization_store.write_certificate(&certificate).await?;

    let signer = Signer {
        key: &administrator_key,
        certificate: &certificate,
    };

    organization_store
        .write_member(
            &signer,
            &MemberRecord {
                id: member_id.clone(),
                username_sealed: seal_content(
                    &content_key,
                    "member.username_sealed",
                    username.as_bytes(),
                )?,
                sealed_content_key: seal_to_public_key(&vault.public_key, &content_key.to_bytes())?,
                vault: vault.clone(),
                // the owner's row carries the verifying half of the key it signs with, written
                // here because this is one of the two moments a fresh vault secret is in hand
                // (`invite::issue` is the other). It is what a widening certifies against.
                signing_public_key: administrator_key.verifying_key(),
                role: OWNER_ROLE.to_string(),
                permissions: OWNER_PERMISSIONS,
                must_change_password: false,
                created_at: now,
                updated_at: now,
            },
        )
        .await?;
    organization_store
        .write_grant(
            &signer,
            &GrantRecord {
                member_id: member_id.clone(),
                workspace_id: organization_id.to_string(),
                sealed_credential: seal_to_public_key(
                    &vault.public_key,
                    owner_credential.as_bytes(),
                )?,
                access_level: "full-access".to_string(),
                credential_expires_at: credential_expiry(&owner_credential),
            },
        )
        .await?;

    // best effort, as every push here is: what could not be sent stays captured and goes with
    // the next one. The answer says which, because a link handed out before the rows arrived
    // opens an empty directory until they do.
    let synced = organization_store.push().await;

    if !synced {
        diagnostics::warn("organization.created.notYetSent")
            .with("organization", organization_id)
            .write();
    }

    // the one organization this machine holds, from now: the owner's, with their member row
    // recorded from the outset.
    store.organization = Some(HeldOrganization {
        id: organization_id.to_string(),
        name: name.to_string(),
        verifying_key: BASE64URL.encode(verifying_key),
        remote_url: remote_url.clone(),
        member_id: Some(member_id.clone()),
        role: Some(OWNER_ROLE.to_string()),
        joined_at: now,
    });
    store.commit()?;

    // the machine stays signed in as the owner from here (effort 826, requirement 12). After the
    // record is committed, because the entry is read back against what the record names.
    remember(organization_id, &member_id, &member_key);

    let join_link = JoinLink::new(
        organization_id,
        name,
        &verifying_key,
        &remote_url,
        &link_credential,
    )
    .encode()?;

    diagnostics::info("organization.created")
        .with("organization", organization_id)
        .write();

    Ok((
        OrganizationCreated {
            organization_id: organization_id.to_string(),
            join_link,
            synced,
        },
        organization_store,
    ))
}

/// Undo a first run that did not finish: the database this process created, and the replica
/// file. Best effort, and what could not be removed is written to the diagnostics log rather than
/// hidden behind the error the person is about to read.
async fn leave_nothing<P: TursoPlatform>(
    platform: &P,
    database_path: &Path,
    organization_id: &str,
    database_name: &str,
) {
    if let Err(error) = platform
        .delete_database(database_name, DeletionIntent::CreatedAndUnreferenced)
        .await
    {
        diagnostics::error("organization.setup.databaseLeftBehind")
            .with("database", database_name)
            .with("error", error.to_string())
            .write();
    }

    crate::database::Database::remove_replica_files(&OrganizationStore::replica_path(
        database_path,
        organization_id,
    ));
}

/// When a minted credential dies, read off its own `exp` claim, as milliseconds. `None` where the
/// token carries none, which is what `never` mints.
///
/// The claim is unsigned and unverified here, and nothing refuses on it; it is a fact recorded
/// beside the grant so a renewal can be scheduled before the credential is refused.
pub fn credential_expiry(token: &str) -> Option<String> {
    let payload = token.split('.').nth(1)?;
    let json = BASE64URL.decode(payload).ok()?;
    let claims: serde_json::Value = serde_json::from_slice(&json).ok()?;
    let seconds = claims.get("exp")?.as_i64()?;

    (seconds > 0).then(|| (seconds * 1000).to_string())
}

/// Sixteen random bytes as hex: an organization id, a member id. Lowercase hex is inside what a
/// Turso database name may carry, so `org-<id>` is a valid name at 36 characters.
fn random_id() -> Result<String, Error> {
    #[cfg(test)]
    if let Some(id) = fixed_ids().lock().ok().and_then(|mut ids| ids.pop_front()) {
        return Ok(id);
    }

    let mut bytes = [0_u8; 16];

    getrandom::fill(&mut bytes).map_err(|error| Error::Internal {
        message: format!("failed to draw an id: {error}"),
    })?;

    Ok(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
}

/// Ids a test has fixed in advance, drawn in order, so a scripted reply can name what a run is
/// about to create. Empty outside a test that asked, and never consulted in a shipping build.
#[cfg(test)]
fn fixed_ids() -> &'static std::sync::Mutex<std::collections::VecDeque<String>> {
    static IDS: std::sync::OnceLock<std::sync::Mutex<std::collections::VecDeque<String>>> =
        std::sync::OnceLock::new();

    IDS.get_or_init(|| std::sync::Mutex::new(std::collections::VecDeque::new()))
}

#[cfg(test)]
fn draw_these_ids_next(ids: &[&str]) {
    let mut fixed = fixed_ids().lock().expect("the fixed ids lock");

    fixed.clear();
    fixed.extend(ids.iter().map(|id| id.to_string()));
}

/// The authority this machine holds, for a first run.
///
/// **Refused before anything is asked of anybody.** A consent the person abandoned filed no
/// token, so a first run reached without one stops here, having created nothing, and the answer
/// says what to do: grant the consent. Requirement 5's re-consent, at the one place a first run
/// spends the authority.
pub fn authority() -> Result<String, Error> {
    crate::sync::turso::consent::platform_token().map_err(|_| Error::NotConfigured {
        message: "this machine holds no turso authority. connect the turso account first, then \
                  create the organization"
            .to_string(),
    })
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use serde_json::json;

    use super::{
        CreateOrganization, MINIMUM_PASSWORD_LENGTH, OWNER_PERMISSIONS, OWNER_ROLE, Remote,
        SHIPPING_KDF, create_organization, credential_expiry,
    };
    use crate::{
        organization::{
            authority::{AdministratorKey, OrganizationKey},
            invite::USERNAME_RULES,
            link::JoinLink,
            vault::{
                CONTENT_KEY_BYTES, ContentKey, KdfParams, open_content, open_vault,
                unseal_with_secret_key,
            },
        },
        persisted::Persisted,
        sync::{
            RemoteSyncStore,
            test::server::{ScriptedResponse, ScriptedServer},
            turso::{
                discovery::McpEndpoint,
                platform::{AccessLevel, DeletionIntent, InMemoryPlatform, PlatformError},
            },
        },
    };

    const TOKEN: &str = "a-platform-token";
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
        let directory = std::env::temp_dir().join(format!("rentable-setup-{name}-{nanos:x}"));
        std::fs::create_dir_all(&directory).expect("scratch directory");

        directory
    }

    fn handshake() -> ScriptedResponse {
        ScriptedResponse::new(
            200,
            json!({ "jsonrpc": "2.0", "id": 1, "result": { "protocolVersion": "2025-06-18" } })
                .to_string(),
        )
    }

    fn listing(records: serde_json::Value) -> ScriptedResponse {
        ScriptedResponse::new(
            200,
            json!({
                "jsonrpc": "2.0",
                "id": 3,
                "result": { "content": [{ "type": "text", "text": records.to_string() }] }
            })
            .to_string(),
        )
    }

    fn created() -> ScriptedResponse {
        ScriptedResponse::new(
            200,
            json!({ "jsonrpc": "2.0", "id": 2, "result": { "content": [] } }).to_string(),
        )
    }

    /// The listing a group that already holds a database answers, so the slug is read and the
    /// Platform API creates the organization's database.
    fn populated_group() -> Vec<ScriptedResponse> {
        vec![
            handshake(),
            listing(json!([{
                "Name": "ledger",
                "hostname": "ledger-an-org.aws-eu-west-1.turso.io",
                "group": "rentable"
            }])),
        ]
    }

    fn store(directory: &std::path::Path) -> Persisted<RemoteSyncStore> {
        Persisted::<RemoteSyncStore>::load(directory.join("remote-sync.json")).expect("the store")
    }

    /// A first run against a group that already holds a database: the common shape of every
    /// unit test here, and the whole of what a first run writes.
    #[tokio::test]
    async fn a_first_run_creates_the_database_the_keys_the_rows_and_the_link_from_a_name_a_username_and_a_password()
     {
        let directory = scratch("first");
        let mut store = store(&directory);
        let mcp = ScriptedServer::start(populated_group()).await;
        let platform = Arc::new(InMemoryPlatform::new("an-org"));
        let database_path = directory.join("app.db");

        let (outcome, organization) = create_organization(
            &mut store,
            TOKEN,
            &McpEndpoint::at(&mcp.url("")),
            |_| Arc::clone(&platform),
            Remote::none(),
            &database_path,
            CreateOrganization {
                name: "  Acme Rentals ",
                username: " Olivia.Owner ",
                password: PASSWORD,
            },
            test_cost(),
            1_757_000_000_000,
        )
        .await
        .expect("the first run failed");

        // the database: created, protected, and two credentials minted for it.
        let databases = platform.databases();
        let database_name = format!("org-{}", outcome.organization_id);

        assert_eq!(databases.len(), 1);
        assert_eq!(databases[0].name, database_name);
        assert!(databases[0].delete_protection);
        assert_eq!(
            platform.minted(),
            vec![
                (
                    database_name.clone(),
                    "4w".to_string(),
                    AccessLevel::FullAccess
                ),
                (
                    database_name.clone(),
                    "never".to_string(),
                    AccessLevel::ReadOnly
                )
            ]
        );
        assert!(platform.deleted().is_empty());
        assert!(
            !outcome.synced,
            "nothing was pushed, because there was no remote"
        );

        // the link: the organization, its key, its remote, and the read-only credential.
        let link = JoinLink::decode(&outcome.join_link).expect("the link decodes");

        assert_eq!(link.organization_id, outcome.organization_id);
        assert_eq!(
            link.remote_url,
            format!("libsql://{database_name}-an-org.aws-eu-west-1.turso.io")
        );
        assert_eq!(
            link.read_only_credential,
            format!("token-for-{database_name}-never-read-only")
        );

        // the rows, verified against the key the link carries and nothing else.
        let key = link.verifying_key_bytes().expect("a key");
        let members = organization.members(&key).await.expect("the members");
        let grants = organization.grants(&key).await.expect("the grants");
        let row = organization
            .organization()
            .await
            .expect("the organization")
            .expect("a row");

        assert_eq!(members.len(), 1);
        assert_eq!(members[0].role, OWNER_ROLE);
        assert_eq!(members[0].permissions, OWNER_PERMISSIONS);
        assert!(!members[0].must_change_password);
        assert_eq!(members[0].vault.kdf_params, test_cost());
        assert_eq!(grants.len(), 1);
        assert_eq!(grants[0].member_id, members[0].id);
        assert_eq!(grants[0].workspace_id, outcome.organization_id);
        assert_eq!(grants[0].access_level, "full-access");
        assert_eq!(row.verifying_key, key);
        assert_eq!(row.remote_url, link.remote_url);

        // the organization key follows from the owner's password and from nothing stored: the
        // vault opens, the seed is derived, and its verifying key is the one the link pinned.
        let secret = open_vault(PASSWORD, &members[0].vault).expect("the owner's vault");
        let derived = OrganizationKey::from_bytes(
            &secret
                .derive_seed(super::ORGANIZATION_KEY_PURPOSE)
                .expect("a seed"),
        );

        assert_eq!(derived.verifying_key(), key);
        assert!(open_vault("the wrong password", &members[0].vault).is_err());

        // and so does the key they sign rows with, whose verifying half the row carries: it is
        // what a certificate over them names, and the row is the only copy of it anybody but the
        // owner will ever hold (effort 826, requirement 6).
        assert_eq!(
            members[0].signing_public_key,
            AdministratorKey::from_bytes(
                &secret
                    .derive_seed(super::ADMINISTRATOR_KEY_PURPOSE)
                    .expect("a seed"),
            )
            .verifying_key()
        );

        // the owner's row carries the username as typed, trimmed, sealed under the content key
        // the vault unseals, and the raw column carries none of it.
        let content_key = ContentKey::from_bytes(
            <[u8; CONTENT_KEY_BYTES]>::try_from(
                unseal_with_secret_key(&secret, &members[0].sealed_content_key)
                    .expect("the content key")
                    .as_slice(),
            )
            .expect("a content key"),
        );

        assert_eq!(
            open_content(
                &content_key,
                "member.username_sealed",
                &members[0].username_sealed
            )
            .expect("the owner's username"),
            b"Olivia.Owner"
        );
        assert!(
            !members[0]
                .username_sealed
                .windows(b"Olivia".len())
                .any(|window| window == b"Olivia"),
            "the username is legible in the sealed column"
        );

        // this machine holds it, with the name as typed and the owner as its member.
        let joined = store.organization.clone().expect("the record");

        assert_eq!(joined.id, outcome.organization_id);
        assert_eq!(joined.name, "Acme Rentals");
        assert_eq!(joined.member_id.as_deref(), Some(members[0].id.as_str()));
        assert_eq!(joined.role.as_deref(), Some(OWNER_ROLE));
        assert_eq!(joined.verifying_key, link.verifying_key);

        // and the slug was asked for once and remembered.
        assert_eq!(
            store.turso_organization.as_ref().map(|o| o.slug.as_str()),
            Some("an-org")
        );
        assert_eq!(
            mcp.request_count(),
            2,
            "handshake and listing, and nothing else"
        );
    }

    /// Requirement 3's ordinary first run: an empty group, so the first database is created
    /// through the MCP server, the slug and the group are read off the listing that follows, and
    /// the Platform API protects what it did not create.
    #[tokio::test]
    async fn a_first_run_into_an_empty_group_creates_the_first_database_through_mcp() {
        let directory = scratch("empty");
        let mut store = store(&directory);
        let platform = Arc::new(InMemoryPlatform::new("acme-co"));
        let database_path = directory.join("app.db");

        // the ids a first run draws are fixed for this test, so the listing that answers the
        // create can carry the record the create will have made.
        super::draw_these_ids_next(&["0ffice0ffice0ffice0ffice0ffice00", "0wner"]);

        let mcp = ScriptedServer::start(vec![
            handshake(),
            listing(json!([])),
            handshake(),
            created(),
            listing(json!([{
                "Name": "org-0ffice0ffice0ffice0ffice0ffice00",
                "hostname": "org-0ffice0ffice0ffice0ffice0ffice00-acme-co.aws-eu-west-1.turso.io",
                "group": "rentable-empty"
            }])),
        ])
        .await;

        let (outcome, organization) = create_organization(
            &mut store,
            TOKEN,
            &McpEndpoint::at(&mcp.url("")),
            |_| Arc::clone(&platform),
            Remote::none(),
            &database_path,
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

        let database_name = format!("org-{}", outcome.organization_id);
        let create = mcp.request(3);
        let payload: serde_json::Value = serde_json::from_str(&create.body).expect("json");

        assert_eq!(payload["params"]["name"], "create_database");
        assert_eq!(payload["params"]["arguments"]["name"], database_name);
        assert_eq!(mcp.request_count(), 5);

        // the platform created nothing and protected the one the MCP server made.
        let databases = platform.databases();

        assert_eq!(databases.len(), 1);
        assert_eq!(databases[0].name, database_name);
        assert!(databases[0].delete_protection);
        assert_eq!(
            store
                .turso_organization
                .as_ref()
                .map(|o| (o.slug.as_str(), o.group.as_str())),
            Some(("acme-co", "rentable-empty"))
        );

        let link = JoinLink::decode(&outcome.join_link).expect("the link decodes");

        assert_eq!(
            link.remote_url,
            format!("libsql://{database_name}-acme-co.aws-eu-west-1.turso.io")
        );
        assert_eq!(
            organization
                .members(&link.verifying_key_bytes().expect("a key"))
                .await
                .expect("the members")
                .len(),
            1
        );
    }

    /// Either the run completes or it leaves nothing. A failure after the database exists
    /// deletes it as one this process created and could not finish, removes the replica file,
    /// and records no organization on this machine.
    #[tokio::test]
    async fn a_first_run_that_fails_after_the_database_exists_leaves_nothing() {
        let directory = scratch("rollback");
        let mut store = store(&directory);
        let mcp = ScriptedServer::start(populated_group()).await;
        let platform = Arc::new(InMemoryPlatform::new("an-org"));
        let database_path = directory.join("app.db");

        // create, protect, then the first mint is refused by the account.
        platform.refuse_nth(
            3,
            PlatformError::AccountRefused {
                what: "mint a token for this workspace",
            },
        );

        let error = create_organization(
            &mut store,
            TOKEN,
            &McpEndpoint::at(&mcp.url("")),
            |_| Arc::clone(&platform),
            Remote::none(),
            &database_path,
            CreateOrganization {
                name: "Acme",
                username: "olivia",
                password: PASSWORD,
            },
            test_cost(),
            1_757_000_000_000,
        )
        .await
        .expect_err("a first run that could not mint reported an organization");

        assert!(error.to_string().contains("account"), "{error}");

        let deleted = platform.deleted();

        assert_eq!(deleted.len(), 1);
        assert!(deleted[0].0.starts_with("org-"));
        assert_eq!(deleted[0].1, DeletionIntent::CreatedAndUnreferenced);
        assert!(
            platform.databases().is_empty(),
            "the database was left behind"
        );
        assert!(store.organization.is_none());
        assert!(
            !std::fs::read_dir(&directory)
                .expect("the directory")
                .flatten()
                .any(|entry| entry.file_name().to_string_lossy().starts_with("org-")),
            "a replica file was left behind"
        );
    }

    /// The three things typed are checked before anything is asked of Turso, and a username
    /// outside requirement 21's rules is refused with the sentence an invitation refuses with.
    #[tokio::test]
    async fn an_empty_name_a_bad_username_or_a_short_password_is_refused_before_any_request() {
        let directory = scratch("refused");
        let mut store = store(&directory);
        let mcp = ScriptedServer::start(populated_group()).await;
        let platform = Arc::new(InMemoryPlatform::new("an-org"));
        let database_path = directory.join("app.db");
        let too_short = "a".repeat(MINIMUM_PASSWORD_LENGTH - 1);
        let too_long = "o".repeat(33);

        for (name, username, password) in [
            ("   ", "olivia", PASSWORD),
            ("Acme", "olivia", too_short.as_str()),
            ("Acme", "ol", PASSWORD),
            ("Acme", too_long.as_str(), PASSWORD),
            ("Acme", "olivia owner", PASSWORD),
            ("Acme", "olivia@acme.example", PASSWORD),
        ] {
            let error = create_organization(
                &mut store,
                TOKEN,
                &McpEndpoint::at(&mcp.url("")),
                |_| Arc::clone(&platform),
                Remote::none(),
                &database_path,
                CreateOrganization {
                    name,
                    username,
                    password,
                },
                test_cost(),
                1_757_000_000_000,
            )
            .await
            .expect_err("bad input was accepted");

            assert!(
                matches!(error, crate::error::Error::InvalidInput { .. }),
                "{error:?}"
            );

            if username != "olivia" {
                assert_eq!(error.to_string(), USERNAME_RULES, "{username:?}");
            }
        }

        assert_eq!(mcp.request_count(), 0);
        assert!(platform.databases().is_empty());
    }

    #[test]
    fn a_credential_says_when_it_dies_and_a_credential_minted_forever_says_nothing() {
        let claims = |exp: serde_json::Value| {
            let payload = base64::Engine::encode(
                &base64::engine::general_purpose::URL_SAFE_NO_PAD,
                json!({ "id": "db", "exp": exp }).to_string(),
            );
            format!("header.{payload}.signature")
        };

        assert_eq!(
            credential_expiry(&claims(json!(1_760_000_000))),
            Some("1760000000000".to_string())
        );
        assert_eq!(credential_expiry(&claims(json!(null))), None);
        assert_eq!(credential_expiry("not a jwt"), None);
    }

    #[test]
    fn the_shipping_cost_is_the_one_ticket_06_measured() {
        assert_eq!(SHIPPING_KDF.memory_kib, 256 * 1024);
        assert_eq!(SHIPPING_KDF.iterations, 3);
        assert_eq!(SHIPPING_KDF.lanes, 1);
    }
}
