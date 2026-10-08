//! the first run: an owner names an organization, chooses a username and sets a password, and
//! the organization exists on their own Turso account with them in it.
//!
//! **Three things are typed and nothing else.** The name, the username and the password. *Two
//! until effort 824's requirement 21 made an account a username; the owner's row carried an empty
//! address and an empty display name before it. Four for a day on 2026-09-15, when Turso began
//! refusing a create that names no group and the walk asked for the group's name outright; it is
//! a fourth thing again only where Turso has refused every name this machine can work out on its
//! own, which [`create_into_an_empty_group`] is.* The slug is discovered
//! (`turso/discovery/`), the database is created here, and every key is generated or
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
//! the owner's signing key. `vault::MemberSecretKey::derive_seed` is the derivation
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

mod command;
mod connect;
mod group;
mod rename;

pub use command::*;
pub use connect::*;
pub use group::*;
pub use rename::*;

use std::path::Path;

use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD as BASE64URL};
use serde::{Deserialize, Serialize};

use crate::{
    clock,
    credential::CredentialStore,
    diagnostics,
    error::{Error, RefusalReason},
    machine::{RemoteSyncStore, consented_organization},
    persisted::Persisted,
    turso::{
        consent::{Account, copy_pending_consent, move_pending_consent},
        discovery::{McpEndpoint, TursoOrganization},
        platform::{AccessLevel, DeletionIntent, TursoPlatform},
    },
};

use super::{
    HeldOrganization,
    authority::{AdministratorKey, OrganizationKey, certificate_id, issue_root_certificate},
    invitation::validate_username,
    member::vault::{
        KdfParams, MemberSecretKey, create_vault_with_secret_and_key, generate_content_key,
        seal_content, seal_to_public_key,
    },
    role::permission,
    session::{self, remember},
    store::{
        FORMAT_VERSION, GrantRecord, MemberLockRecord, MemberRecord, OrganizationNameRecord,
        OrganizationRecord, OrganizationStore, RoleRecord, Signer, leave_no_replica,
    },
};

/// What a member's grant to the organization database is minted for. Renewal is the grant
/// ticket's; until it lands, this is how long a first run's owner can sync the directory for.
pub const ORGANIZATION_CREDENTIAL_LIFETIME: &str = "4w";

pub const OWNER_ROLE: &str = "owner";

/// What an organization's own database is called on the Turso account: this, and the
/// organization's id. It is the whole of what marks a listed database as one of ours, which is
/// what [`one_organization_to_a_group`] reads, and why it is a constant rather than spelled
/// into the `format!` below and again into a refusal that has to recognise it.
pub const ORGANIZATION_DATABASE_PREFIX: &str = "org-";

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

/// The organization key an owner's open vault yields: **their own derivation, and nothing read
/// out of the database** (effort 828, requirement 22).
///
/// **There is one kind of owner.** A founder and an account that was handed the organization
/// both hold a key their own secret derives, and neither key is stored anywhere; what makes the
/// handover work is that the acceptance re-keys the directory under the new owner's derivation
/// and leaves a `succession` row saying so. So an owner's way back is their password, whichever
/// kind they are, and a founder who handed over derives a key that no longer matches anything.
///
/// *There were two kinds and one key until 2026-09-16, and this function read
/// `member.owner_seed_sealed` before deriving. Review round one found that a transferee's way
/// back then rested on a value read out of the very database that value is meant to judge: a
/// member holding a full-access grant could replace the seal and re-sign the directory, and the
/// recovery would pin their key. The seal branch is gone with the shape that needed it; the
/// column survives as the offer's carrier and is opened only by
/// `ownership::accept_ownership`, on a machine that already holds the old key.*
///
/// **Every caller that needs the owner's key reads it through here**, so no second derivation can
/// drift: `ownership::offer_ownership` and `ownership::accept_ownership` on a machine already signed in,
/// and `setup::connect_existing` on a machine that does not hold the organization yet. *The acts that certify a
/// signer read it too, through `ownership::organization_key_of`, until effort 838 issued every
/// certificate from its issuer's own.* What comes back
/// is compared or used to sign; it is never trusted because a column offered it.
pub fn owner_key_from(secret: &MemberSecretKey) -> Result<OrganizationKey, Error> {
    Ok(OrganizationKey::from_bytes(
        &secret.derive_seed(ORGANIZATION_KEY_PURPOSE)?,
    ))
}

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

/// What the web layer is told: the organization's id, and whether its rows have arrived. No key,
/// no token and no password is in it.
///
/// *It carried the organization's own join link until effort 828's requirement 16 retired that
/// link. The first run mints nothing to hand out now: an owner invites a member, and a member
/// makes their own second-machine link, each sealed under its code.*
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrganizationCreated {
    pub organization_id: String,
    /// whether the rows reached Turso before this answered. The replica keeps them either way and
    /// sends them with the next push; what a person needs to know is that an invitation made now
    /// opens an empty directory until they have.
    pub synced: bool,
}

/// How a database's hostname becomes the replica's remote.
///
/// **An input rather than a `format!`, because `turso.io` answers wildcard DNS.** Every name
/// under it resolves to Turso's load balancer, so a unit test that derived a remote from a fake
/// hostname would push to a real server with a fake token. Production hands in [`Remote::libsql`];
/// a test hands in [`Remote::none`] and the replica stays on this machine.
///
/// **It is also how the upgrade of an older organization reaches that remote** (effort 838,
/// ticket 23), which runs only once a push and a pull have both gone: the libsql remote is the
/// replica's own, and no remote is a machine offline. A test that needs the upgrade to find the
/// remote reached hands in [`Remote::answering`], which keeps the replica on this machine and
/// answers every push and pull as gone.
#[derive(Clone, Copy, Debug)]
pub enum Remote {
    /// `libsql://<hostname>`, which is what the sync engine takes.
    Libsql,
    /// no remote: the replica is local, and a push has nowhere to go.
    None,
    /// no remote, and every push and pull answered as gone: a test's stand-in for a machine
    /// online, where there is no remote it could reach.
    #[cfg(test)]
    Answering,
}

impl Remote {
    pub fn libsql() -> Self {
        Self::Libsql
    }

    #[cfg(test)]
    pub(crate) fn none() -> Self {
        Self::None
    }

    #[cfg(test)]
    pub(crate) fn answering() -> Self {
        Self::Answering
    }

    fn url_for(self, hostname: &str) -> Option<String> {
        match self {
            Self::Libsql => Some(format!("libsql://{hostname}")),
            Self::None => None,
            #[cfg(test)]
            Self::Answering => None,
        }
    }
}

/// Create an organization on the consented account, with `request`'s owner in it.
///
/// `platform_for` builds the Platform API client once the organization slug is known, which on a
/// first run into an empty group is only after the MCP server has created the first database;
/// `turso/discovery/` says why that database cannot be created any other way.
///
/// **A group is asked for almost never, and checked where one was.** A group that already holds
/// anything named itself in the listing, so nothing needs to be typed and a name that is not it
/// is refused here, by both names, before anything is created. An empty group tells this machine
/// nothing about itself, so there [`create_into_an_empty_group`] learns the name where the
/// account will say it, and tries the names it can work out after that, before the walk asks for
/// one at all.
#[allow(clippy::too_many_arguments)]
pub(crate) async fn create_organization<P, F>(
    credentials: &dyn CredentialStore,
    clock: &clock::Shared,
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
    // the name is held to the rule a rename is (effort 851, requirement 23).
    let name = organization_name(request.name)?;
    let username = request.username.trim();
    // a field that was drawn and left blank is a field that was not answered, and the walk only
    // draws it after Turso has refused everything else: there is nothing to refuse it with here
    // that the cascade below does not say better.
    let typed_group = request
        .group
        .map(str::trim)
        .filter(|group| !group.is_empty());

    // the owner is the first member, so nobody holds the username yet; the shape is the whole
    // check, and it is the same check an invitation makes.
    validate_username(username)?;

    if request.password.chars().count() < MINIMUM_PASSWORD_LENGTH {
        return Err(Error::refused(
            RefusalReason::PasswordTooShort,
            format!(
                "the password needs at least {MINIMUM_PASSWORD_LENGTH} characters. it is the only \
                 thing between anybody holding the organization's records and reading them"
            ),
        ));
    }

    let organization_id = random_id()?;
    let database_name = format!("{ORGANIZATION_DATABASE_PREFIX}{organization_id}");

    // the database, and the slug it is created under or read from: the pending consent's, never
    // that of an organization this machine already holds, since the one being made is none of them
    // (effort 851, requirement 14).
    let consented = consented_organization(store, None, platform_token, mcp).await?;
    let (organization, hostname) = match consented {
        Some(consented) => {
            // an organization this machine holds over the same group takes this consent as its
            // own before anything here can refuse, since Turso has been seen to stop accepting
            // the one it had once this one was granted.
            share_the_consent(store, credentials, &consented.organization);

            // **a group that was typed is checked first, and the check keeps the consent.** What
            // the consent is over is already known here, from the listing or from this machine's
            // own store, so a name that is not it is a typing mistake rather than a wrong
            // account, and giving the consent back over one would cost the person the browser
            // round trip. Nothing is typed on this path ordinarily: the listing named the group,
            // so the walk never asked.
            if let Some(typed_group) = typed_group
                && consented.organization.group != typed_group
            {
                return Err(Error::refused(
                    RefusalReason::GroupMismatch,
                    format!(
                        "the group this consent is over is called `{}`, not `{typed_group}`",
                        consented.organization.group
                    ),
                ));
            }

            // **before the create, so a refusal leaves the account exactly as it was.** Where
            // the group was answered out of this machine's own store there is no listing to
            // read, and none is needed: the only way a slug got there is a run that reached
            // this check and passed it.
            if let Some(databases) = consented.databases.as_deref() {
                if let Err(refusal) = one_organization_to_a_group(databases) {
                    abandon_the_consent(store, credentials);

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

            store.remember_consent_organization(None, first.organization.clone());
            store.commit()?;

            (first.organization, first.hostname)
        }
    };
    let platform = platform_for(organization);

    // from here on a database exists that nothing refers to yet, so every failure removes it.
    let finished = finish(
        credentials,
        clock,
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
    credentials: &dyn CredentialStore,
    clock: &clock::Shared,
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
    // what every other machine reaches the organization at, and what the rows record. The
    // replica on this machine is opened against it where there is one to open against.
    let remote_url = format!("libsql://{hostname}");
    let replica_remote = remote.url_for(hostname);

    // the owner's keys: the vault their password opens, the key that opens it, and the two
    // signing keys that follow from its secret.
    let (vault, secret, member_key) = create_vault_with_secret_and_key(password, kdf_params)?;
    let organization_key = owner_key_from(&secret)?;
    let administrator_key =
        AdministratorKey::from_bytes(&secret.derive_seed(ADMINISTRATOR_KEY_PURPOSE)?);
    let verifying_key = organization_key.verifying_key();
    let member_id = random_id()?;
    // the root: the one certificate the organization key signs, the owner's, carrying every flag
    // (effort 838). Every other certificate is issued down from it.
    let certificate = issue_root_certificate(
        &organization_key,
        &certificate_id(&member_id, &now.to_string()),
        &member_id,
        &administrator_key.verifying_key(),
        &now.to_string(),
    );
    let content_key = generate_content_key()?;

    // the replica, its schema, and the rows.
    let replica = OrganizationStore::replica_path(database_path, organization_id);
    let token = owner_credential.clone();
    let organization_store =
        OrganizationStore::open(clock.clone(), &replica, replica_remote, move || {
            let token = token.clone();
            async move { Ok::<String, turso::Error>(token) }
        })
        .await?;

    organization_store.install_schema().await?;
    organization_store.write_born_format(now).await?;
    let name_sealed = seal_content(&content_key, "organization.name_sealed", name.as_bytes())?;

    organization_store
        .write_organization(&OrganizationRecord {
            id: organization_id.to_string(),
            name_sealed: name_sealed.clone(),
            verifying_key,
            remote_url: remote_url.clone(),
            created_at: now,
        })
        .await?;
    organization_store.write_certificate(&certificate).await?;

    let signer = Signer {
        key: &administrator_key,
        certificate: &certificate,
    };

    // the two built-in roles that are rows, signed by the root, before any member row names one
    // (effort 838, requirement 3). The owner's role is a constant and is not among them.
    for built_in in [permission::MANAGER_ROLE, permission::MEMBER_ROLE] {
        organization_store
            .write_role(
                &signer,
                &RoleRecord {
                    id: built_in.id.to_string(),
                    kind: built_in.id.to_string(),
                    name_sealed: Vec::new(),
                    mask: built_in.mask,
                    rank: built_in.rank,
                },
            )
            .await?;
    }

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
                role_id: permission::OWNER.to_string(),
                override_mask: 0,
                removed_at: None,
                effective: permission::OWNER_ROLE.mask,
                covered: true,
                must_change_password: false,
                created_at: now,
                updated_at: now,
                session_epoch: 0,
                // the founder's key is derived from the secret just drawn and is stored nowhere,
                // which is what the column is `None` for here and on every row but a transferee's
                // (effort 828, requirement 22).
                owner_seed_sealed: None,
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

    // the name under the root's signature from the first (effort 851, requirement 29): the same
    // sealed bytes as the organization row, which builds before the signed name go on reading.
    organization_store
        .write_organization_name(
            &signer,
            &OrganizationNameRecord {
                name_sealed,
                updated_at: now,
            },
        )
        .await?;

    // and marked from the first (effort 851, requirement 35): the owner's own lock row, which says
    // to every reader that a member with no row is somebody's deletion and reads locked. Here
    // because nobody is carried over in an organization made a moment ago, and the backfill that
    // writes it elsewhere runs only after a pull (`member::lock::carry_locks_over`).
    organization_store
        .write_member_lock(
            &signer,
            &MemberLockRecord {
                member_id: member_id.clone(),
                locked: false,
                updated_at: now,
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

    // this machine's id in the registry of connected machines (effort 828, requirement 15),
    // drawn where a connect draws it: the moment the machine starts holding the organization.
    // The row itself is written by the sign-in that follows, which is where the credential
    // the push goes out under comes from.
    let machine_id = random_id()?;
    // the first run is a sign-in, and acknowledges what it finds for this machine, which in an
    // organization made a moment ago is nothing (effort 846, requirement 10).
    let machine_signed_out =
        session::sign_outs_acknowledged(&organization_store, &machine_id, &member_id).await?;

    // an organization this machine holds from now, beside any others, and selected: the owner's,
    // with their member row recorded from the outset, and the Turso organization the consent it
    // was made on is over.
    store.hold_consented(HeldOrganization {
        id: organization_id.to_string(),
        name: name.to_string(),
        verifying_key: BASE64URL.encode(verifying_key),
        remote_url: remote_url.clone(),
        machine_id,
        member_id: Some(member_id.clone()),
        role: Some(OWNER_ROLE.to_string()),
        joined_at: now,
        // it was made in this build's format, which is the first reading of it there is (effort
        // 838, ticket 25).
        format: Some(FORMAT_VERSION),
        machine_signed_out,
        turso_organization: None,
        workspace_id: None,
        name_signed: false,
        name_signed_at: 0,
        lock_marked: false,
        own_lock_latched: Vec::new(),
    });
    store.commit()?;

    // the machine stays signed in as the owner from here (effort 826, requirement 12). After the
    // record is committed, because the entry is read back against what the record names.
    // the first epoch, the one the owner's row was just written with.
    remember(credentials, organization_id, &member_id, 0, &member_key);

    // and the consent this was made on becomes the organization's own (effort 851, requirement
    // 14), now that its id is known and the record holds it.
    settle_the_consent(credentials, organization_id);

    diagnostics::info("organization.created")
        .with("organization", organization_id)
        .write();

    Ok((
        OrganizationCreated {
            organization_id: organization_id.to_string(),
            synced,
        },
        organization_store,
    ))
}

/// Give the pending consent back, so the person can grant another one over another group or
/// account. Only the pending slot and the Turso organization looked up for it: an organization this
/// machine already holds keeps its own consent (effort 851, requirement 14).
///
/// **The token and the slug go together.** The slug is a fact about the consent that is being
/// abandoned, and a machine that kept it would build every Platform API path of the next
/// consent out of the account this one was over. The next run looks the slug up again, which is
/// what [`consented_organization`] does when the store answers nothing.
///
/// Best effort in both halves: what the person reads is the refusal that brought them here, and
/// a credential store that would not empty goes to the diagnostics log rather than taking the
/// refusal's place on the screen.
fn abandon_the_consent(store: &mut Persisted<RemoteSyncStore>, credentials: &dyn CredentialStore) {
    if let Err(error) = crate::turso::consent::forget_platform_token(credentials, &Account::Pending)
    {
        diagnostics::error("organization.setup.consentNotForgotten")
            .with("error", error.to_string())
            .write();
    }

    store.forget_consent_organization(None);

    if let Err(error) = store.commit() {
        diagnostics::error("organization.setup.consentNotForgotten")
            .with("error", error.to_string())
            .write();
    }
}

/// File the pending consent as the own consent of every organization this machine holds over
/// `over`, the Turso organization and group a setup or a connect just learned it is granted over.
///
/// **Turso appears to keep one consent per account working**, which one owner's machine suggests
/// and nothing has measured: the organization's own token was refused as `invalid api token` on
/// 2026-10-06 after its owner granted a second consent on the same account in an add-organization
/// walk ([[references/turso]], *Failure handling*). The consent just granted is the one Turso
/// surely accepts, so an organization already held over the same group is handed it as soon as the
/// walk knows that, whether or not the walk goes on to make or connect anything.
///
/// **The same group, not only the same slug.** A consent is scoped to the group picked on Turso's
/// screen, so a token over another group of the same account cannot mint over this organization's
/// database; handing it over would trade a refusal the app recovers from for one it cannot.
///
/// Best effort: what could not be filed goes to the diagnostics log, never the token, and the
/// organization keeps what it had.
pub(crate) fn share_the_consent(
    store: &RemoteSyncStore,
    credentials: &dyn CredentialStore,
    over: &TursoOrganization,
) {
    for held in store
        .held_organizations
        .iter()
        .filter(|held| held.turso_organization.as_ref() == Some(over))
    {
        match copy_pending_consent(credentials, &held.id) {
            Ok(true) => diagnostics::info("organization.setup.consentShared")
                .with("organization", held.id.as_str())
                .write(),
            Ok(false) => {}
            Err(error) => diagnostics::error("organization.setup.consentNotShared")
                .with("organization", held.id.as_str())
                .with("error", error.to_string())
                .write(),
        }
    }
}

/// Move the pending consent to the organization `organization_id`, which a first run, a connect and
/// a reconnect do once the organization is held (effort 851, requirement 14).
///
/// **Best effort, after the record is committed**, because nothing about the organization is
/// undone for it: a move that did not finish leaves the token in the pending slot
/// (`turso::consent::move_pending_consent`), the next launch moves it (`upgrade/consent.rs`), and
/// until then this machine reads as holding no authority for the organization. What went wrong goes
/// to the diagnostics log, never the token.
pub(crate) fn settle_the_consent(credentials: &dyn CredentialStore, organization_id: &str) {
    if let Err(error) = move_pending_consent(credentials, organization_id) {
        diagnostics::error("organization.setup.consentNotMoved")
            .with("organization", organization_id)
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

    leave_no_replica(database_path, organization_id);
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
    if let Some(id) = FIXED_IDS.with_borrow_mut(|ids| ids.pop_front()) {
        return Ok(id);
    }

    let mut bytes = [0_u8; 16];

    getrandom::fill(&mut bytes).map_err(|error| Error::Internal {
        message: format!("failed to draw an id: {error}"),
    })?;

    Ok(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
}

// Ids a test has fixed in advance, drawn in order, so a scripted reply can name what a run is
// about to create. Empty outside a test that asked, and never consulted in a shipping build.
//
// **One list per thread, which is one per test.** A test runs on a thread of its own and its
// runtime is that thread's, so what one test fixed is never drawn by a run in another. It was one
// list for the process until effort 840, and the tests that fixed ids took turns on the credential
// store's lock, which is what kept two of them from drawing each other's.
#[cfg(test)]
thread_local! {
    static FIXED_IDS: std::cell::RefCell<std::collections::VecDeque<String>> =
        const { std::cell::RefCell::new(std::collections::VecDeque::new()) };
}

#[cfg(test)]
fn draw_these_ids_next(ids: &[&str]) {
    FIXED_IDS.with_borrow_mut(|fixed| {
        fixed.clear();
        fixed.extend(ids.iter().map(|id| id.to_string()));
    });
}

/// The authority this machine holds, for a first run: the pending consent, which is the one a
/// setup, a connect and a reconnect run on, because each of them runs before the consent belongs
/// to an organization this machine holds (effort 851, requirement 14). They move it to the
/// organization's own entry once its id is known ([`settle_the_consent`]).
///
/// **Refused before anything is asked of anybody.** A consent the person abandoned filed no
/// token, so a first run reached without one stops here, having created nothing, and the answer
/// says what to do: grant the consent. Requirement 5's re-consent, at the one place a first run
/// spends the authority.
///
/// **Only an absent token is "not connected"** (effort 854, requirement 19). A store that will
/// not answer, locked or denied, passes through as the credential error it is, so the owner is
/// not sent to grant a consent that may still be filed.
pub(crate) fn authority(credentials: &dyn CredentialStore) -> Result<String, Error> {
    crate::turso::consent::platform_token(credentials, &Account::Pending).map_err(|error| {
        match error {
            Error::Refused {
                reason: RefusalReason::TursoNotConnected,
                ..
            } => Error::refused(
                RefusalReason::TursoNotConnected,
                "this machine holds no turso authority. connect the turso account first, then \
                  create the organization",
            ),
            error => error,
        }
    })
}

#[cfg(test)]
mod tests {
    use super::{
        CreateOrganization, MINIMUM_PASSWORD_LENGTH, ORGANIZATION_DATABASE_PREFIX,
        ORGANIZATION_NAME_LIMIT, OWNER_ROLE, OrganizationCreated, Remote, SHIPPING_KDF,
        create_organization, credential_expiry,
    };
    use crate::credential::Memory;
    use crate::error::{Error, RefusalReason};
    use crate::machine::RemoteSyncStore;
    use crate::organization::authority::{AdministratorKey, OrganizationKey};
    use crate::organization::invitation::USERNAME_RULES;
    use crate::organization::invitation::link::Locator;
    use crate::organization::member::vault::{
        CONTENT_KEY_BYTES, ContentKey, KdfParams, open_content, open_vault, unseal_with_secret_key,
    };
    use crate::organization::role::permission;
    use crate::persisted::Persisted;
    use crate::sync::test::server::{ScriptedResponse, ScriptedServer};
    use crate::test::scratch;
    use crate::turso::discovery::McpEndpoint;
    use crate::turso::platform::{AccessLevel, DeletionIntent, InMemoryPlatform, account_refused};
    use serde_json::json;
    use std::sync::Arc;

    const TOKEN: &str = "a-platform-token";

    const PASSWORD: &str = "a long enough password";

    fn test_cost() -> KdfParams {
        KdfParams {
            memory_kib: 1024,
            iterations: 2,
            lanes: 1,
        }
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

    // -------------------------------------------------------------------------------------
    // Effort 828, requirement 14: the account connects to the organization the group holds.
    // -------------------------------------------------------------------------------------

    /// A first run against a group that already holds a database: the common shape of every
    /// unit test here, and the whole of what a first run writes.
    #[tokio::test]
    async fn a_first_run_creates_the_database_the_keys_the_rows_and_the_link_from_a_name_a_username_and_a_password()
     {
        let credentials = Memory::new();
        let directory = scratch("first");
        let mut store = store(&directory);
        let mcp = ScriptedServer::start(populated_group()).await;
        let platform = Arc::new(InMemoryPlatform::new("an-org"));
        let database_path = directory.join("app.db");

        let (outcome, organization) = create_organization(
            &credentials,
            &crate::clock::System::shared(),
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
        // one mint, and it lapses: the owner's own four-week grant. *A second, read-only and
        // never expiring, was minted for the organization's own link until effort 828's
        // requirement 16 retired that link.*
        assert_eq!(
            platform.minted(),
            vec![(
                database_name.clone(),
                "4w".to_string(),
                AccessLevel::FullAccess
            )]
        );
        assert!(platform.deleted().is_empty());
        assert!(
            !outcome.synced,
            "nothing was pushed, because there was no remote"
        );

        // the organization row, where the machine learns what a link would carry: the id, the
        // remote and the key. The first run hands out nothing (effort 828, requirement 16).
        let held = store
            .selected()
            .cloned()
            .expect("the first run recorded no organization");

        assert_eq!(held.id, outcome.organization_id);
        assert_eq!(
            held.remote_url,
            format!("libsql://{database_name}-an-org.aws-eu-west-1.turso.io")
        );

        // the rows, verified against the key the record pins and nothing else.
        let key = Locator {
            organization_id: held.id.clone(),
            organization_name: held.name.clone(),
            verifying_key: held.verifying_key.clone(),
            remote_url: held.remote_url.clone(),
        }
        .verifying_key_bytes()
        .expect("a key");
        let members = organization.members(&key).await.expect("the members");
        let grants = organization.grants(&key).await.expect("the grants");
        let row = organization
            .organization()
            .await
            .expect("the organization")
            .expect("a row");

        assert_eq!(members.len(), 1);
        assert_eq!(members[0].role_id, OWNER_ROLE);
        assert!(!members[0].must_change_password);
        assert_eq!(members[0].vault.kdf_params, test_cost());
        assert_eq!(grants.len(), 1);
        assert_eq!(grants[0].member_id, members[0].id);
        assert_eq!(grants[0].workspace_id, outcome.organization_id);
        assert_eq!(grants[0].access_level, "full-access");
        assert_eq!(row.verifying_key, key);
        assert_eq!(row.remote_url, held.remote_url);
        // exactly the three roles (effort 838, criterion 3): the owner is the constant, held by
        // the one member through the root, which carries every flag; the manager and the member
        // are rows with the masks and ranks the package gives them.
        assert_eq!(members[0].role_id, permission::OWNER);
        assert_eq!(members[0].override_mask, 0);
        assert_eq!(members[0].effective, permission::OWNER_ROLE.mask);
        assert_eq!(
            organization
                .roles(&key)
                .await
                .expect("the roles")
                .into_iter()
                .map(|role| (role.id, role.kind, role.mask, role.rank))
                .collect::<Vec<_>>(),
            [permission::MANAGER_ROLE, permission::MEMBER_ROLE]
                .map(|built_in| (
                    built_in.id.to_string(),
                    built_in.id.to_string(),
                    built_in.mask,
                    built_in.rank
                ))
                .to_vec()
        );

        let certificates = organization.certificates().await.expect("the certificates");

        assert_eq!(certificates.len(), 1);
        assert!(certificates[0].is_root());
        assert_eq!(certificates[0].member_id, members[0].id);
        assert_eq!(certificates[0].ceiling, permission::OWNER_ROLE.mask);
        assert_eq!(certificates[0].rank, permission::OWNER_ROLE.rank);

        // and the format it was made in, which is what a build of another format refuses it by
        // (effort 838, requirement 11).
        assert_eq!(
            organization.format().await.expect("the format"),
            Some(crate::organization::store::FORMAT_VERSION)
        );

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
        let joined = store.selected().cloned().expect("the record");

        assert_eq!(joined.id, outcome.organization_id);
        assert_eq!(joined.name, "Acme Rentals");
        assert_eq!(joined.member_id.as_deref(), Some(members[0].id.as_str()));
        assert_eq!(joined.role.as_deref(), Some(OWNER_ROLE));
        assert_eq!(joined.verifying_key, held.verifying_key);

        // and the slug was asked for once and remembered.
        assert_eq!(
            store
                .consent_organization(Some(&joined.id))
                .map(|o| o.slug.as_str()),
            Some("an-org")
        );
        assert_eq!(
            mcp.request_count(),
            2,
            "handshake and listing, and nothing else"
        );
    }

    /// One first run on this machine's record, into the group `listing` names, on the Turso
    /// organization `slug`.
    async fn a_first_run(
        credentials: &Memory,
        store: &mut Persisted<RemoteSyncStore>,
        directory: &std::path::Path,
        listing: Vec<ScriptedResponse>,
        slug: &str,
        name: &str,
    ) -> Result<OrganizationCreated, Error> {
        let mcp = ScriptedServer::start(listing).await;
        let platform = Arc::new(InMemoryPlatform::new(slug));

        create_organization(
            credentials,
            &crate::clock::System::shared(),
            store,
            TOKEN,
            &McpEndpoint::at(&mcp.url("")),
            |_| Arc::clone(&platform),
            Remote::none(),
            &directory.join("app.db"),
            CreateOrganization {
                name,
                username: "olivia",
                password: PASSWORD,
                group: None,
            },
            test_cost(),
            1_757_000_000_000,
        )
        .await
        .map(|(created, _)| created)
    }

    /// **Effort 851, criterion 1: setting up a second organization on a machine that holds one.**
    ///
    /// The first run succeeds beside the organization already held, the record holds both, the
    /// new one is selected, and the first one's entry is as it was, its own Turso organization
    /// included: each knows the account its own consent was over (requirement 14). **A first run
    /// into a group that already holds an organization is still refused**, whatever else the
    /// machine holds, and the record is left as it was.
    #[tokio::test]
    async fn a_machine_holding_an_organization_sets_up_another_and_a_held_group_is_still_refused() {
        let credentials = Memory::new();
        let directory = scratch("second-first-run");
        let mut store = store(&directory);
        let first = a_first_run(
            &credentials,
            &mut store,
            &directory,
            populated_group(),
            "an-org",
            "Acme",
        )
        .await
        .expect("the first run failed");
        let first_entry = store
            .held(&first.organization_id)
            .cloned()
            .expect("the first organization");

        let second = a_first_run(
            &credentials,
            &mut store,
            &directory,
            vec![
                handshake(),
                listing(json!([{
                    "Name": "ledger",
                    "hostname": "ledger-another-org.aws-eu-west-1.turso.io",
                    "group": "elsewhere"
                }])),
            ],
            "another-org",
            "Beta",
        )
        .await
        .expect("a second organization was refused on a machine holding one");

        assert_eq!(
            store
                .held_organizations
                .iter()
                .map(|held| held.id.as_str())
                .collect::<Vec<_>>(),
            vec![
                first.organization_id.as_str(),
                second.organization_id.as_str()
            ]
        );
        assert_eq!(
            store.selected().map(|held| held.id.as_str()),
            Some(second.organization_id.as_str()),
            "the new organization is not selected"
        );
        assert_eq!(
            store.held(&first.organization_id),
            Some(&first_entry),
            "the second first run touched the first organization's entry"
        );
        assert_eq!(
            store
                .consent_organization(Some(&second.organization_id))
                .map(|organization| organization.slug.as_str()),
            Some("another-org")
        );
        assert_eq!(
            store
                .consent_organization(Some(&first.organization_id))
                .map(|organization| organization.slug.as_str()),
            Some("an-org")
        );

        // a group that holds an organization already: refused, and nothing recorded.
        let before = std::fs::read(store.path()).expect("the record");
        let refused = a_first_run(
            &credentials,
            &mut store,
            &directory,
            vec![
                handshake(),
                listing(json!([{
                    "Name": format!("{ORGANIZATION_DATABASE_PREFIX}7f3a"),
                    "hostname": "org-7f3a-third-org.aws-eu-west-1.turso.io",
                    "group": "taken"
                }])),
            ],
            "third-org",
            "Gamma",
        )
        .await;

        assert!(
            matches!(
                refused,
                Err(Error::Refused {
                    reason: RefusalReason::GroupHoldsOrganization,
                    ..
                })
            ),
            "{refused:?}"
        );
        assert_eq!(store.held_organizations.len(), 2);
        assert_eq!(
            store.selected().map(|held| held.id.as_str()),
            Some(second.organization_id.as_str())
        );
        assert_eq!(
            std::fs::read(store.path()).expect("the record"),
            before,
            "the refused run wrote the record"
        );
    }

    /// **A consent granted over a held organization's group becomes that organization's own,
    /// even where the first run is refused** (the link refused on 2026-10-06). An owner adding an
    /// organization grants a second consent on the same Turso account over the group the first
    /// one lives in, and Turso stops accepting the first's: the run is refused as the group
    /// already holding an organization and gives the pending consent back, and the organization
    /// keeps the newer consent as its own.
    #[tokio::test]
    async fn a_consent_over_a_held_organizations_group_becomes_its_own_though_the_run_is_refused() {
        use crate::turso::consent::{
            Account, holds_platform_token, platform_token, store_platform_token,
        };

        let credentials = Memory::new();
        let directory = scratch("first-run-shares");
        let mut store = store(&directory);

        store_platform_token(&credentials, "the-older-consent").expect("the first consent");

        let first = a_first_run(
            &credentials,
            &mut store,
            &directory,
            populated_group(),
            "an-org",
            "Acme",
        )
        .await
        .expect("the first run failed");
        let own = Account::of(&first.organization_id);

        assert_eq!(
            platform_token(&credentials, &own).as_deref(),
            Ok("the-older-consent")
        );

        store_platform_token(&credentials, "a-newer-consent").expect("the newer consent");

        let database = format!("{ORGANIZATION_DATABASE_PREFIX}{}", first.organization_id);
        let refused = a_first_run(
            &credentials,
            &mut store,
            &directory,
            vec![
                handshake(),
                listing(json!([{
                    "Name": database,
                    "hostname": format!("{database}-an-org.aws-eu-west-1.turso.io"),
                    "group": "rentable"
                }])),
            ],
            "an-org",
            "Beta",
        )
        .await;

        assert!(
            matches!(
                refused,
                Err(Error::Refused {
                    reason: RefusalReason::GroupHoldsOrganization,
                    ..
                })
            ),
            "{refused:?}"
        );
        assert_eq!(
            platform_token(&credentials, &own).as_deref(),
            Ok("a-newer-consent"),
            "the organization kept a consent Turso no longer accepts"
        );
        assert!(
            !holds_platform_token(&credentials, &Account::Pending).expect("the store"),
            "the refused run kept the pending consent"
        );
    }

    /// Either the run completes or it leaves nothing. A failure after the database exists
    /// deletes it as one this process created and could not finish, removes the replica file,
    /// and records no organization on this machine.
    #[tokio::test]
    async fn a_first_run_that_fails_after_the_database_exists_leaves_nothing() {
        let credentials = Memory::new();
        let directory = scratch("rollback");
        let mut store = store(&directory);
        let mcp = ScriptedServer::start(populated_group()).await;
        let platform = Arc::new(InMemoryPlatform::new("an-org"));
        let database_path = directory.join("app.db");

        // create, protect, then the first mint is refused by the account.
        platform.refuse_nth(3, account_refused("mint a token for this workspace"));

        let error = create_organization(
            &credentials,
            &crate::clock::System::shared(),
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
        assert!(store.selected().is_none());
        assert!(
            !std::fs::read_dir(&directory)
                .expect("the directory")
                .flatten()
                .any(|entry| entry.file_name().to_string_lossy().starts_with("org-")),
            "a replica file was left behind"
        );
    }

    /// The three things typed are checked before anything is asked of Turso, and a username
    /// outside requirement 21's rules is refused with the sentence an invitation refuses with. A
    /// name one character past `ORGANIZATION_NAME_LIMIT` is refused as a rename refuses it
    /// (effort 851, criterion 23).
    /// **The group is not among them**: it is asked for only after Turso has refused every name
    /// this application can work out, so a run that carries none is the ordinary one.
    #[tokio::test]
    async fn an_empty_name_a_bad_username_or_a_short_password_is_refused_before_any_request() {
        let credentials = Memory::new();
        let directory = scratch("refused");
        let mut store = store(&directory);
        let mcp = ScriptedServer::start(populated_group()).await;
        let platform = Arc::new(InMemoryPlatform::new("an-org"));
        let database_path = directory.join("app.db");
        let too_short = "a".repeat(MINIMUM_PASSWORD_LENGTH - 1);
        let too_long = "o".repeat(33);
        let name_too_long = "n".repeat(ORGANIZATION_NAME_LIMIT + 1);

        for (name, username, password) in [
            ("   ", "olivia", PASSWORD),
            (name_too_long.as_str(), "olivia", PASSWORD),
            ("Acme", "olivia", too_short.as_str()),
            ("Acme", "ol", PASSWORD),
            ("Acme", too_long.as_str(), PASSWORD),
            ("Acme", "olivia owner", PASSWORD),
            ("Acme", "olivia@acme.example", PASSWORD),
        ] {
            let error = create_organization(
                &credentials,
                &crate::clock::System::shared(),
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
                matches!(error, crate::error::Error::Refused { .. }),
                "{error:?}"
            );

            if username != "olivia" {
                assert_eq!(error.to_string(), USERNAME_RULES, "{username:?}");
            }

            if name == name_too_long {
                assert!(
                    matches!(
                        error,
                        Error::Refused {
                            reason: RefusalReason::OrganizationNameTooLong,
                            ..
                        }
                    ),
                    "{error:?}"
                );
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

    /// Requirement 19: a setup, a connect or a reconnect that cannot read the store is told the
    /// store would not answer, and is not sent to grant a consent that may still be filed. A
    /// store holding nothing is still not connected.
    #[test]
    fn a_store_that_will_not_answer_is_a_credential_error_and_an_empty_one_is_not_connected() {
        let credentials = Memory::new();
        crate::turso::consent::store_platform_token(&credentials, "a-filed-consent")
            .expect("failed to file the test token");

        credentials.refuse_the_next_read();

        let error = super::authority(&credentials)
            .expect_err("setup found authority in a store that would not answer");

        assert!(
            matches!(error, Error::Credential { .. }),
            "a failing store was reported as something other than a credential error: {error:?}"
        );

        assert_eq!(
            super::authority(&credentials).as_deref(),
            Ok("a-filed-consent"),
            "the refusal outlived the one read it was armed for"
        );

        let absent =
            super::authority(&Memory::new()).expect_err("setup found authority in an empty store");

        assert!(
            matches!(
                absent,
                Error::Refused {
                    reason: RefusalReason::TursoNotConnected,
                    ..
                }
            ),
            "{absent:?}"
        );
        assert!(
            absent.to_string().contains("create the organization"),
            "{absent}"
        );
    }
}
