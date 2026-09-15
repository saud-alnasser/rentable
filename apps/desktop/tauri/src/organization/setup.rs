//! the first run: an owner names an organization, chooses a username and sets a password, and
//! the organization exists on their own Turso account with them in it.
//!
//! **Three things are typed and nothing else.** The name, the username and the password. *Two
//! until effort 824's requirement 21 made an account a username; the owner's row carried an empty
//! address and an empty display name before it. Four for a day on 2026-09-15, when Turso began
//! refusing a create that names no group and the walk asked for the group's name outright; it is
//! a fourth thing again only where Turso has refused every name this machine can work out on its
//! own, which [`create_into_an_empty_group`] is.* The slug is discovered
//! (`sync/turso/discovery.rs`), the database is created here, and every key is generated or
//! derived here. The consent itself happened before this is reached, in a browser, and this
//! module spends what it filed and asks almost nothing of the person.
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

/// What an organization's own database is called on the Turso account: this, and the
/// organization's id. It is the whole of what marks a listed database as one of ours, which is
/// what [`one_organization_to_a_group`] reads, and why it is a constant rather than spelled
/// into the `format!` below and again into a refusal that has to recognise it.
pub const ORGANIZATION_DATABASE_PREFIX: &str = "org-";

/// Every grantable act, as `packages/workspace-permission` masks them: seven flags, seven bits.
/// The package is the vocabulary and this is its value for the role that holds all of it. What
/// else an owner may do is not in this number, because requirement 5 keeps the acts that need the
/// Turso authority out of the table altogether.
pub const OWNER_PERMISSIONS: i64 = 0b111_1111;

/// What Turso calls the group a new organization is made with, and the second name a first
/// create tries. It is Turso's word rather than this application's, and it is never shown to
/// anybody: what it buys is one more account that nobody has to be asked anything on.
const TURSO_DEFAULT_GROUP: &str = "default";

/// What a run refused over the group begins its message with, so the walk can tell that one
/// refusal from every other and draw the field.
///
/// **A fixed phrase rather than a sentence.** `organization/setup.ts` matches on it to decide
/// whether to ask for the group at all, so it is the one part of this message that is a contract;
/// what follows it is Turso's own words and is free to change with them.
pub const THE_GROUP_IS_NEEDED: &str = "the turso group's name is needed";

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

/// The three things a first run is given, and a fourth where it has already been refused without
/// one.
#[derive(Clone, Debug)]
pub struct CreateOrganization<'a> {
    pub name: &'a str,
    /// the owner's own username, under `invite::validate_username`'s rules like every other.
    pub username: &'a str,
    pub password: &'a str,
    /// the Turso group the person picked on the consent screen, where they were asked for it.
    /// It is a name rather than a credential ([[rules/credentials]], *Client boundary*), and it
    /// is `None` on every run that has not been refused over the group:
    /// [`create_into_an_empty_group`] asks the account what the group is called and then tries
    /// three names of its own, and the walk shows no field until all of that has answered
    /// nothing.
    pub group: Option<&'a str>,
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
///
/// **A group is asked for almost never, and checked where one was.** A group that already holds
/// anything named itself in the listing, so nothing needs to be typed and a name that is not it
/// is refused here, by both names, before anything is created. An empty group tells this machine
/// nothing about itself, so there [`create_into_an_empty_group`] learns the name where the
/// account will say it, and tries the names it can work out after that, before the walk asks for
/// one at all.
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
    // a field that was drawn and left blank is a field that was not answered, and the walk only
    // draws it after Turso has refused everything else: there is nothing to refuse it with here
    // that the cascade below does not say better.
    let typed_group = request
        .group
        .map(str::trim)
        .filter(|group| !group.is_empty());

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
    let database_name = format!("{ORGANIZATION_DATABASE_PREFIX}{organization_id}");

    // the database, and the slug it is created under or read from.
    let (organization, hostname) = match discovery::organization(store, platform_token, mcp).await?
    {
        Some(consented) => {
            // **a group that was typed is checked first, and the check keeps the consent.** What
            // the consent is over is already known here, from the listing or from this machine's
            // own store, so a name that is not it is a typing mistake rather than a wrong
            // account, and giving the consent back over one would cost the person the browser
            // round trip. Nothing is typed on this path ordinarily: the listing named the group,
            // so the walk never asked.
            if let Some(typed_group) = typed_group
                && consented.organization.group != typed_group
            {
                return Err(Error::PreconditionFailed {
                    message: format!(
                        "the group this consent is over is called `{}`, not `{typed_group}`",
                        consented.organization.group
                    ),
                });
            }

            // **before the create, so a refusal leaves the account exactly as it was.** Where
            // the group was answered out of this machine's own store there is no listing to
            // read, and none is needed: the only way a slug got there is a run that reached
            // this check and passed it.
            if let Some(databases) = consented.databases.as_deref() {
                if let Err(refusal) = one_organization_to_a_group(databases) {
                    abandon_the_consent(store);

                    return Err(refusal);
                }
            }

            let organization = consented.organization;
            let database = platform_for(organization.clone())
                .create_database(&database_name)
                .await?;

            (organization, database.hostname)
        }
        None => {
            // **a port built with no organization in it, because the one call made through it
            // here names none.** `group_named` asks the single Platform API endpoint that takes
            // no slug, and then the groups under the username it answers; everything that builds
            // a path out of a slug is on the other side of this branch, where there is one.
            let probe = platform_for(TursoOrganization {
                slug: String::new(),
                group: String::new(),
            });
            let first = create_into_an_empty_group(
                &probe,
                platform_token,
                mcp,
                &database_name,
                typed_group,
            )
            .await?;

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

/// Create the first database in a group that holds none, learning the group's name where the
/// account will say it and naming it by guess only where nothing would.
///
/// **The name is asked for before it is guessed at** (ticket 21). Two places on the customer's
/// own account know what the group is called: the MCP server, where its tool set offers a way to
/// list groups, and the Platform API, whose one slug-free endpoint names the person and whose
/// groups listing sits under that username. Both are reads, both pick the group by the uuid the
/// consent's token carries, and either of them answering ends this: the create is made with the
/// name it gave and nothing else is tried.
///
/// **The cascade below is what runs where neither answered, unchanged.** Three names, in the
/// order that costs a person least: no group at all, which is the tool's own default and what
/// worked until 2026-09-15; `default`, which is what Turso calls the group a new organization is
/// made with; and the group uuid the consent's own token carries, which names the consented group
/// exactly without anybody knowing what it is called. A refusal that speaks of the group moves to
/// the next name, because that is Turso saying the group is what it could not settle. **Every
/// other refusal is the answer and is returned as it stands**, whether it is a plan's limit, a
/// name Turso will not take or an account that needs attention, since two more requests would
/// only be told the same thing more slowly.
///
/// **Where a name was given, it is the only attempt.** The walk shows the field after everything
/// above was refused, so a name arriving here means it was, and trying any of it again would put
/// the person back where they started.
async fn create_into_an_empty_group<P: TursoPlatform>(
    platform: &P,
    platform_token: &str,
    mcp: &McpEndpoint,
    database_name: &str,
    typed_group: Option<&str>,
) -> Result<discovery::FirstDatabase, Error> {
    if let Some(group) = typed_group {
        let first =
            discovery::create_first_database(platform_token, mcp, database_name, Some(group))
                .await?;
        named_the_group(TYPED);

        return Ok(first);
    }

    let group_uuid = discovery::group_uuid_of(platform_token);

    if let Some((named_by, group)) =
        learn_the_group(platform, platform_token, mcp, group_uuid.as_deref()).await
    {
        let first =
            discovery::create_first_database(platform_token, mcp, database_name, Some(&group))
                .await?;
        named_the_group(named_by);

        return Ok(first);
    }

    let mut attempts = vec![None, Some(TURSO_DEFAULT_GROUP)];

    // a token carrying no such claim has nothing to add: the attempt would be the first one
    // again, and one request that has already been refused is enough.
    if let Some(group_uuid) = group_uuid.as_deref() {
        attempts.push(Some(group_uuid));
    }

    let mut refusal = String::new();

    for group in attempts {
        match discovery::create_first_database(platform_token, mcp, database_name, group).await {
            Ok(first) => {
                named_the_group(CASCADE);

                return Ok(first);
            }
            Err(error) if is_about_the_group(&error) => {
                refusal = turso_reason(&error).unwrap_or_default().to_string();
            }
            Err(error) => return Err(error),
        }
    }

    Err(Error::PreconditionFailed {
        message: format!(
            "{THE_GROUP_IS_NEEDED}. turso refused every group this application could name on its \
             own, and said: {refusal}"
        ),
    })
}

/// What the consented group is called, from whichever of the two ways knew, and which one that
/// was.
///
/// **A probe that failed answered nothing.** Both calls exist to save a person a question, and
/// neither is on the path to anything: a refusal, an unreachable moment or a reply in a shape
/// this cannot read goes to the diagnostics log and the run carries on to the cascade, exactly as
/// it did before either probe existed. Turning one of them into the reason a first run stopped
/// would be a worse first run than the one this ticket set out to fix.
async fn learn_the_group<P: TursoPlatform>(
    platform: &P,
    platform_token: &str,
    mcp: &McpEndpoint,
    group_uuid: Option<&str>,
) -> Option<(&'static str, String)> {
    match discovery::group_from_mcp(platform_token, mcp, group_uuid).await {
        Ok(Some(group)) => return Some((MCP, group)),
        Ok(None) => {}
        Err(error) => diagnostics::warn("organization.setup.groupNotReadFromMcp")
            .with("error", error.to_string())
            .write(),
    }

    match platform.group_named(platform_token, group_uuid).await {
        Ok(Some(group)) => Some((PLATFORM, group)),
        Ok(None) => None,
        Err(error) => {
            diagnostics::warn("organization.setup.groupNotReadFromPlatform")
                .with("error", error.to_string())
                .write();

            None
        }
    }
}

/// The four ways the group a first database is created in can be named, as the diagnostics line
/// spells them.
const MCP: &str = "mcp";
const PLATFORM: &str = "platform";
const CASCADE: &str = "cascade";
const TYPED: &str = "typed";

/// Record which of them it was.
///
/// **The name itself is not in the line.** A group's name is the customer's own, and what a
/// reading of this file needs is which way answered: the two probes are new and the account they
/// are asked of is not this machine's, so whether either of them works in the field is a thing
/// nobody can see any other way.
fn named_the_group(by: &str) {
    diagnostics::info("organization.setup.groupNamed")
        .with("by", by)
        .write();
}

/// Turso's own reason inside a refused create, where what came back is one.
fn turso_reason(error: &Error) -> Option<&str> {
    match error {
        Error::PreconditionFailed { message } => Some(
            message
                .strip_prefix(discovery::CREATE_REFUSED)
                .unwrap_or(message),
        ),
        _ => None,
    }
}

/// Whether Turso refused over the group, which is the one refusal another name could answer.
fn is_about_the_group(error: &Error) -> bool {
    turso_reason(error).is_some_and(|reason| reason.to_lowercase().contains("group"))
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
                session_epoch: 0,
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
        // this machine's id in the registry of connected machines (effort 828, requirement 15),
        // drawn where a connect draws it: the moment the machine starts holding the organization.
        // The row itself is written by the sign-in that follows, which is where the credential
        // the push goes out under comes from.
        machine_id: random_id()?,
        member_id: Some(member_id.clone()),
        role: Some(OWNER_ROLE.to_string()),
        joined_at: now,
    });
    store.commit()?;

    // the machine stays signed in as the owner from here (effort 826, requirement 12). After the
    // record is committed, because the entry is read back against what the record names.
    // the first epoch, the one the owner's row was just written with.
    remember(organization_id, &member_id, 0, &member_key);

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

/// Refuse a group that already holds an organization, naming the database that is in the way.
///
/// **A group holds one organization** (requirement 21 of effort 826). The consent is granted
/// over one group and the organization lives in it, so a second organization in the same group
/// would put two sets of records behind one grant, and the owner ruled that out. The person
/// picks another group, or another Turso account, and the sentence says so.
///
/// **Only a name this application would have written counts.** A Free or Developer account has
/// exactly one group and it holds whatever else the person keeps on that account, so refusing
/// on any database at all would refuse the accounts most first runs arrive on. The mark is the
/// name [`create_organization`] gives an organization's database and nothing else.
fn one_organization_to_a_group(databases: &[String]) -> Result<(), Error> {
    let held = databases.iter().find(|name| {
        name.strip_prefix(ORGANIZATION_DATABASE_PREFIX)
            .is_some_and(|id| !id.is_empty())
    });

    match held {
        // the name is the customer's own and is said back to them, because it is what they look
        // for in Turso's dashboard to decide whether to delete it or pick elsewhere.
        Some(held) => Err(Error::PreconditionFailed {
            message: format!(
                "this group already holds the organization database `{held}`; a group holds \
                 one organization, so pick another group or another Turso account"
            ),
        }),
        None => Ok(()),
    }
}

/// Give the consent back, so the person can grant another one over another group or account.
///
/// **The token and the slug go together.** The slug is a fact about the consent that is being
/// abandoned, and a machine that kept it would build every Platform API path of the next
/// consent out of the account this one was over. The next run looks the slug up again, which is
/// what [`discovery::organization`] does when the store answers nothing.
///
/// Best effort in both halves: what the person reads is the refusal that brought them here, and
/// a credential store that would not empty goes to the diagnostics log rather than taking the
/// refusal's place on the screen.
fn abandon_the_consent(store: &mut Persisted<RemoteSyncStore>) {
    if let Err(error) = crate::sync::turso::consent::forget_platform_token() {
        diagnostics::error("organization.setup.consentNotForgotten")
            .with("error", error.to_string())
            .write();
    }

    store.turso_organization = None;

    if let Err(error) = store.commit() {
        diagnostics::error("organization.setup.consentNotForgotten")
            .with("error", error.to_string())
            .write();
    }
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

    use base64::Engine as _;
    use serde_json::json;

    use super::{
        BASE64URL, CreateOrganization, MINIMUM_PASSWORD_LENGTH, ORGANIZATION_DATABASE_PREFIX,
        OWNER_PERMISSIONS, OWNER_ROLE, Remote, SHIPPING_KDF, THE_GROUP_IS_NEEDED,
        create_organization, credential_expiry,
    };
    use crate::{
        error::Error,
        keyring::take_the_credential_store,
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
                consent::{platform_token, store_platform_token},
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

    /// What Turso answered a create that named no group on 2026-09-15, in its own words.
    const NO_GROUP_NAMED: &str =
        "HTTP 403: group-scoped tokens must specify a group in the request";

    /// And what it answers a create naming a group the consent is not over.
    const NO_SUCH_GROUP: &str = "group `default` does not exist in this organization";

    /// The group uuid a consent token carries, which is the third name a first create tries.
    const CONSENTED_GROUP_UUID: &str = "6f5b6f60-1d4a-4b4a-9c2e-0b0a1d2c3e4f";

    /// A create the tool refused: a result flagged `isError` carrying Turso's own reason, which
    /// is the shape `create_database` answers a refusal in rather than a JSON-RPC error.
    fn create_refused(reason: &str) -> ScriptedResponse {
        ScriptedResponse::new(
            200,
            json!({
                "jsonrpc": "2.0",
                "id": 2,
                "result": {
                    "isError": true,
                    "content": [{ "type": "text", "text": reason }]
                }
            })
            .to_string(),
        )
    }

    /// What `tools/list` answers, carrying whichever tool names the server offers.
    fn tools(names: &[&str]) -> ScriptedResponse {
        let offered = names
            .iter()
            .map(|name| json!({ "name": name, "inputSchema": { "type": "object" } }))
            .collect::<Vec<_>>();

        ScriptedResponse::new(
            200,
            json!({ "jsonrpc": "2.0", "id": 4, "result": { "tools": offered } }).to_string(),
        )
    }

    /// The tool set read on 2026-09-11, which offers no way to name a group. Every test whose
    /// group is named some other way scripts it, so the first probe answers nothing and the run
    /// carries on to the second.
    fn no_group_tool() -> ScriptedResponse {
        tools(&["list_databases", "create_database"])
    }

    /// And the groups a server that does offer one lists, in the shape Turso's own API sends.
    fn groups(records: serde_json::Value) -> ScriptedResponse {
        ScriptedResponse::new(
            200,
            json!({
                "jsonrpc": "2.0",
                "id": 5,
                "result": { "content": [{ "type": "text", "text": records.to_string() }] }
            })
            .to_string(),
        )
    }

    /// A consent token in the shape Turso issues one: three base64url segments, the middle
    /// carrying the claims. Only the group uuid is read out of it, and only here in Rust
    /// ([[rules/credentials]], *Client boundary*).
    fn token_naming_the_group() -> String {
        format!(
            "{}.{}.a-signature",
            BASE64URL.encode("{}"),
            BASE64URL.encode(json!({ "group_uuid": CONSENTED_GROUP_UUID }).to_string())
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

    /// **Requirement 21 of effort 826.** The consent landed on a group that already holds an
    /// organization, so the run is refused before it creates anything, the refusal names the
    /// database that is in the way, and the consent is given back so the person can grant
    /// another over another group or another Turso account.
    #[tokio::test]
    async fn a_group_already_holding_an_organization_refuses_the_run_and_gives_the_consent_back() {
        // taken once, at the top: the refusal reads and empties the same credential store the
        // fake keeps for the whole process.
        let _turn = take_the_credential_store().await;

        store_platform_token(TOKEN).expect("the test credential store would not take the token");

        let directory = scratch("one-organization");
        let mut store = store(&directory);
        let mcp = ScriptedServer::start(vec![
            handshake(),
            listing(json!([
                {
                    "Name": "ledger",
                    "hostname": "ledger-an-org.aws-eu-west-1.turso.io",
                    "group": "rentable"
                },
                {
                    "Name": "org-7f3a",
                    "hostname": "org-7f3a-an-org.aws-eu-west-1.turso.io",
                    "group": "rentable"
                }
            ])),
        ])
        .await;
        let platform = Arc::new(InMemoryPlatform::new("an-org"));

        let refusal = create_organization(
            &mut store,
            TOKEN,
            &McpEndpoint::at(&mcp.url("")),
            |_| Arc::clone(&platform),
            Remote::none(),
            &directory.join("app.db"),
            CreateOrganization {
                name: "Acme Rentals",
                username: "olivia.owner",
                password: PASSWORD,
                group: None,
            },
            test_cost(),
            1_757_000_000_000,
        )
        .await
        .expect_err("a group already holding an organization was built into again");

        assert!(
            matches!(refusal, Error::PreconditionFailed { .. }),
            "{refusal:?}"
        );
        assert_eq!(
            refusal.to_string(),
            "this group already holds the organization database `org-7f3a`; a group holds \
             one organization, so pick another group or another Turso account"
        );

        // nothing was created: no database, no credential, and nothing deleted either, because
        // there was never anything to undo.
        assert!(
            platform.databases().is_empty(),
            "a database was created on a group that was about to be refused"
        );
        assert!(platform.minted().is_empty(), "a credential was minted");
        assert!(platform.deleted().is_empty(), "something was cleaned up");
        assert!(store.organization.is_none());

        // and the consent is abandoned: the token is gone from the credential store, and so is
        // the slug it was read under, so the next consent is looked up rather than assumed.
        assert!(
            platform_token().is_err(),
            "the refused consent left its authority on this machine"
        );
        assert_eq!(store.turso_organization, None);
    }

    /// **Ticket 17.** The group the person typed is the one the first create names, so a name
    /// that is not the consent's group is refused before anything is created, by both names, and
    /// the consent stays where it is: what went wrong is a word on the form.
    #[tokio::test]
    async fn a_typed_group_that_is_not_the_consented_one_is_refused_by_name_and_keeps_the_consent()
    {
        let _turn = take_the_credential_store().await;

        store_platform_token(TOKEN).expect("the test credential store would not take the token");

        let directory = scratch("another-group");
        let mut store = store(&directory);
        let mcp = ScriptedServer::start(populated_group()).await;
        let platform = Arc::new(InMemoryPlatform::new("an-org"));

        let refusal = create_organization(
            &mut store,
            TOKEN,
            &McpEndpoint::at(&mcp.url("")),
            |_| Arc::clone(&platform),
            Remote::none(),
            &directory.join("app.db"),
            CreateOrganization {
                name: "Acme Rentals",
                username: "olivia.owner",
                password: PASSWORD,
                group: Some("rentabel"),
            },
            test_cost(),
            1_757_000_000_000,
        )
        .await
        .expect_err("a group the consent is not over was built into");

        assert!(
            matches!(refusal, Error::PreconditionFailed { .. }),
            "{refusal:?}"
        );
        assert_eq!(
            refusal.to_string(),
            "the group this consent is over is called `rentable`, not `rentabel`"
        );

        // nothing was created, and the authority is still this machine's: the person retypes the
        // group on the step they are on rather than granting a second consent.
        assert!(
            platform.databases().is_empty(),
            "a database was created on a refused run"
        );
        assert!(store.organization.is_none());
        assert!(platform_token().is_ok());
    }

    /// The other half of the same rule: a group holding databases of the person's own is the
    /// ordinary Free or Developer account, and it is not a refusal. Only the name this
    /// application writes counts, so a name that merely carries the word does not.
    #[tokio::test]
    async fn a_group_holding_unrelated_databases_is_not_a_refusal() {
        let _turn = take_the_credential_store().await;

        store_platform_token(TOKEN).expect("the test credential store would not take the token");

        let directory = scratch("unrelated-databases");
        let mut store = store(&directory);
        let mcp = ScriptedServer::start(vec![
            handshake(),
            listing(json!([
                {
                    "Name": "ledger",
                    "hostname": "ledger-an-org.aws-eu-west-1.turso.io",
                    "group": "rentable"
                },
                {
                    "Name": "my-org",
                    "hostname": "my-org-an-org.aws-eu-west-1.turso.io",
                    "group": "rentable"
                },
                {
                    "Name": "org-7f3a",
                    "hostname": "org-7f3a-an-org.aws-eu-west-1.turso.io",
                    "group": "somebody-elses-group"
                }
            ])),
        ])
        .await;
        let platform = Arc::new(InMemoryPlatform::new("an-org"));

        let (created, _organization) = create_organization(
            &mut store,
            TOKEN,
            &McpEndpoint::at(&mcp.url("")),
            |_| Arc::clone(&platform),
            Remote::none(),
            &directory.join("app.db"),
            CreateOrganization {
                name: "Acme Rentals",
                username: "olivia.owner",
                password: PASSWORD,
                group: None,
            },
            test_cost(),
            1_757_000_000_000,
        )
        .await
        .expect("a group holding the person's own databases was refused");

        assert_eq!(
            platform.databases().len(),
            1,
            "the organization's database was not created"
        );
        assert_eq!(
            platform.databases()[0].name,
            format!("org-{}", created.organization_id)
        );
        // and the authority the run spent is still this machine's, because nothing was refused.
        assert!(platform_token().is_ok());
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
                group: Some(" rentable "),
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
        // the one credential a link carries legibly, and the one that never lapses: the
        // organization's own (effort 828, requirement 4).
        assert_eq!(
            link.clear_credential(),
            Some(format!("token-for-{database_name}-never-read-only").as_str())
        );
        assert_eq!(link.half(), None);

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
    /// the Platform API protects what it did not create. **The create names no group and is
    /// taken**, which is the account nobody is asked anything on.
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
            no_group_tool(),
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
                group: None,
            },
            test_cost(),
            1_757_000_000_000,
        )
        .await
        .expect("the first run failed");

        let database_name = format!("org-{}", outcome.organization_id);
        let create = mcp.request(5);
        let payload: serde_json::Value = serde_json::from_str(&create.body).expect("json");

        assert_eq!(payload["params"]["name"], "create_database");
        assert_eq!(
            payload["params"]["arguments"],
            json!({ "name": database_name }),
            "the first attempt names no group, since the tool defaults to the token's own"
        );
        assert_eq!(mcp.request_count(), 7);

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

    /// **Ticket 21.** The first run learns what the group is called from the MCP server's own
    /// group listing, creates with that name, and tries nothing else: the cascade below is what
    /// runs where nobody could say the name, and this is a run where somebody could.
    #[tokio::test]
    async fn a_group_the_mcp_server_listed_is_the_name_the_first_create_uses() {
        let directory = scratch("learned-from-mcp");
        let mut store = store(&directory);
        let platform = Arc::new(InMemoryPlatform::new("acme-co"));

        super::draw_these_ids_next(&["0ffice0ffice0ffice0ffice0ffice00", "0wner"]);

        let mcp = ScriptedServer::start(vec![
            handshake(),
            listing(json!([])),
            handshake(),
            tools(&["list_databases", "create_database", "list_groups"]),
            groups(json!({ "groups": [
                { "name": "rents", "uuid": "11111111-1111-4111-8111-111111111111" },
                { "name": "rentable-empty", "uuid": CONSENTED_GROUP_UUID }
            ] })),
            handshake(),
            created(),
            listing(json!([{
                "Name": "org-0ffice0ffice0ffice0ffice0ffice00",
                "hostname": "org-0ffice0ffice0ffice0ffice0ffice00-acme-co.aws-eu-west-1.turso.io",
                "group": "rentable-empty"
            }])),
        ])
        .await;

        let (outcome, _organization) = create_organization(
            &mut store,
            &token_naming_the_group(),
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
            1_757_000_000_000,
        )
        .await
        .expect("the first run failed");

        let payload: serde_json::Value = serde_json::from_str(&mcp.request(6).body).expect("json");

        assert_eq!(payload["params"]["name"], "create_database");
        assert_eq!(
            payload["params"]["arguments"],
            json!({
                "name": format!("org-{}", outcome.organization_id),
                "group": "rentable-empty"
            }),
            "the create did not name the group the listing had just given it"
        );
        assert_eq!(
            mcp.request_count(),
            8,
            "one create, and no attempt of the cascade"
        );
        assert_eq!(platform.databases().len(), 1);
    }

    /// And where the server offers no group tool, the Platform API is the second way to ask: the
    /// name it gives is the one the create uses, and the cascade is not reached either.
    #[tokio::test]
    async fn a_server_with_no_group_tool_falls_to_the_name_the_platform_gives() {
        let directory = scratch("learned-from-platform");
        let mut store = store(&directory);
        let platform = Arc::new(InMemoryPlatform::new("acme-co"));

        platform.naming_the_group("rentable-empty");
        super::draw_these_ids_next(&["0ffice0ffice0ffice0ffice0ffice00", "0wner"]);

        let mcp = ScriptedServer::start(vec![
            handshake(),
            listing(json!([])),
            handshake(),
            no_group_tool(),
            handshake(),
            created(),
            listing(json!([{
                "Name": "org-0ffice0ffice0ffice0ffice0ffice00",
                "hostname": "org-0ffice0ffice0ffice0ffice0ffice00-acme-co.aws-eu-west-1.turso.io",
                "group": "rentable-empty"
            }])),
        ])
        .await;

        let (outcome, _organization) = create_organization(
            &mut store,
            &token_naming_the_group(),
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
            1_757_000_000_000,
        )
        .await
        .expect("the first run failed");

        let payload: serde_json::Value = serde_json::from_str(&mcp.request(5).body).expect("json");

        assert_eq!(
            payload["params"]["arguments"],
            json!({
                "name": format!("org-{}", outcome.organization_id),
                "group": "rentable-empty"
            }),
            "the create did not name the group the platform gave it"
        );
        assert_eq!(
            mcp.request_count(),
            7,
            "one create, and no attempt of the cascade"
        );
    }

    /// **Ticket 18, and what ticket 21 left of it.** Where neither way could name the group,
    /// Turso refusing a create over it is Turso saying the group is what it could not settle, so
    /// the run tries the next name it has rather than the person: no group, then Turso's own
    /// `default`, then the group uuid the consent token carries. Only where all three are refused
    /// is anybody asked anything, and the sentence that asks begins with the fixed phrase the
    /// walk reads and carries Turso's last reason so the person can see what they are answering.
    #[tokio::test]
    async fn the_first_create_tries_three_names_before_the_walk_asks_for_one() {
        let directory = scratch("cascade");
        let mut store = store(&directory);
        let platform = Arc::new(InMemoryPlatform::new("acme-co"));
        let token = token_naming_the_group();

        let mcp = ScriptedServer::start(vec![
            handshake(),
            listing(json!([])),
            handshake(),
            no_group_tool(),
            handshake(),
            create_refused(NO_GROUP_NAMED),
            handshake(),
            create_refused("group `default` not found"),
            handshake(),
            create_refused(NO_SUCH_GROUP),
        ])
        .await;

        let refusal = create_organization(
            &mut store,
            &token,
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
            1_757_000_000_000,
        )
        .await
        .expect_err("a run refused three times over the group reported an organization");

        // the three attempts, in order, and each naming exactly what it meant to.
        let arguments = |index: usize| {
            serde_json::from_str::<serde_json::Value>(&mcp.request(index).body).expect("json")
                ["params"]["arguments"]
                .clone()
        };
        let database_name = arguments(5)["name"].as_str().expect("a name").to_string();

        assert!(database_name.starts_with(ORGANIZATION_DATABASE_PREFIX));
        assert_eq!(arguments(5), json!({ "name": database_name }));
        assert_eq!(
            arguments(7),
            json!({ "name": database_name, "group": "default" })
        );
        assert_eq!(
            arguments(9),
            json!({ "name": database_name, "group": CONSENTED_GROUP_UUID }),
            "the group uuid the consent token carries is the last name tried"
        );
        assert_eq!(
            mcp.request_count(),
            10,
            "the probe that learned nothing, then a handshake and a create per attempt"
        );

        // and the refusal asks for the one thing left: the fixed phrase first, so the walk can
        // tell it from every other refusal, and Turso's last words after it.
        assert!(
            matches!(refusal, Error::PreconditionFailed { .. }),
            "{refusal:?}"
        );
        assert!(
            refusal.to_string().starts_with(THE_GROUP_IS_NEEDED),
            "{refusal}"
        );
        assert!(refusal.to_string().ends_with(NO_SUCH_GROUP), "{refusal}");

        // nothing was created, and the slug was not written down: there is no organization to
        // read one out of yet.
        assert!(platform.databases().is_empty());
        assert!(store.organization.is_none());
        assert_eq!(store.turso_organization, None);
    }

    /// The other half of the same rule: a refusal that is not about the group is the answer, so
    /// it comes back as Turso said it and the next two names are never tried. Retrying a plan's
    /// limit under another group would spend two more requests to be told the same thing.
    #[tokio::test]
    async fn a_first_create_refused_for_anything_but_the_group_is_answered_at_once() {
        let directory = scratch("not-the-group");
        let mut store = store(&directory);
        let platform = Arc::new(InMemoryPlatform::new("acme-co"));

        let mcp = ScriptedServer::start(vec![
            handshake(),
            listing(json!([])),
            handshake(),
            no_group_tool(),
            handshake(),
            create_refused("your plan allows 1 database and you have 1"),
        ])
        .await;

        let refusal = create_organization(
            &mut store,
            &token_naming_the_group(),
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
            1_757_000_000_000,
        )
        .await
        .expect_err("a plan limit was read as a group this application could rename around");

        assert_eq!(
            refusal.to_string(),
            "turso could not create the organization's database: your plan allows 1 database \
             and you have 1"
        );
        assert_eq!(
            mcp.request_count(),
            6,
            "the handshake, the listing, the probe, and one attempt"
        );
        assert!(platform.databases().is_empty());
    }

    /// And where the walk did ask, the name it was given is the only attempt: the three above
    /// have already been refused, so trying them again would put the person back where they
    /// started.
    #[tokio::test]
    async fn a_group_the_walk_asked_for_is_the_only_name_the_first_create_tries() {
        let directory = scratch("asked");
        let mut store = store(&directory);
        let platform = Arc::new(InMemoryPlatform::new("acme-co"));

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

        let (outcome, _organization) = create_organization(
            &mut store,
            &token_naming_the_group(),
            &McpEndpoint::at(&mcp.url("")),
            |_| Arc::clone(&platform),
            Remote::none(),
            &directory.join("app.db"),
            CreateOrganization {
                name: "Acme",
                username: "olivia",
                password: PASSWORD,
                group: Some(" rentable-empty "),
            },
            test_cost(),
            1_757_000_000_000,
        )
        .await
        .expect("the first run failed");

        let payload: serde_json::Value = serde_json::from_str(&mcp.request(3).body).expect("json");

        // trimmed, because a name pasted out of Turso's own screen brings what came with it.
        assert_eq!(
            payload["params"]["arguments"],
            json!({
                "name": format!("org-{}", outcome.organization_id),
                "group": "rentable-empty"
            })
        );
        assert_eq!(mcp.request_count(), 5, "one attempt, and no cascade");
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
                group: None,
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
    /// **The group is not among them**: it is asked for only after Turso has refused every name
    /// this application can work out, so a run that carries none is the ordinary one.
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
                    group: None,
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
