//! the organization database: its schema, and the queries over it.
//!
//! **A replica like any workspace.** The organization's records live in one database on the
//! customer's Turso account, and each member's machine holds a `turso::sync` replica of it, opened
//! beside the workspace engine rather than inside it. `database/mod.rs` says why there is no third
//! `Engine` arm: `Engine` answers what the workspace is open as, and an organization is not a
//! workspace. Two engines over two files is what that module permits; two over one file is what it
//! forbids, and the organization replica is `org-<id>.db` beside `ws-<id>.db`, never the same file.
//!
//! **What the retired control plane's four tables knew lives here, sealed and signed, and one of
//! the four has no successor.** `account` and `membership` become `member` and `grant`; `workspace` keeps
//! its name and loses the `.unique()` owner that held every account to one workspace; `session`
//! is gone, because requirement 18 removes the window it existed for, and a faithful port would
//! re-add it. Every name and address is a `_sealed` column under the organization content key,
//! so a member holding only the database, or only what a join link carries, reads none of them.
//! Every authority field is under a signature `organization/authority.rs` checks, so a member who
//! can write every row, which Turso's whole-database credential makes every member, still cannot
//! forge one.
//!
//! **This module signs on the way in and verifies on the way out, and there is no read that
//! skips the check.** A row that fails verification refuses the read that found it, naming the row
//! and the check, rather than being dropped and the rest used: a forged row in the directory is an
//! event, and a reader that quietly skipped it would show a directory that looked whole. What to
//! show a person is the sign-in ticket's; that the store refuses is this one's.
//!
//! **What this module does not know.** Passwords, and whether one opens anything: the vault's.
//! Who may sign in: ticket 10's. What to seal a name under: the caller holds the content key and
//! hands this module ciphertext. The store is the shape of the rows and the signatures over them,
//! and nothing else.

use std::path::{Path, PathBuf};

use crate::{database::Database, error::Error};

use super::{
    authority::{
        Authority, Certificate, GrantAuthority, InvitationAuthority, MemberAuthority,
        VERIFYING_KEY_BYTES, WorkspaceAuthority, sign, verify,
    },
    vault::{KDF_SALT_BYTES, KdfParams, PUBLIC_KEY_BYTES, SealedInvitation, Vault},
};

/// The seven tables, in the order the schema creates them. A test pins this list against what
/// the database reports, so a table added anywhere is added here or fails there.
pub const TABLES: [&str; 7] = [
    "organization",
    "member",
    "administrator_certificate",
    "workspace",
    "grant",
    "invitation",
    "migration_lease",
];

/// The schema, as the plan's data model gives it.
///
/// **No foreign keys and no `UNIQUE` on an owner.** The first for the reason the workspace schema
/// gives: this database is replicated to machines that write to it offline, so a constraint met on
/// one replica can be violated by the merge. The second is requirement 1: an organization holds
/// several workspaces, and nothing constrains an account to one.
///
/// `grant` is quoted everywhere because it is a keyword in most dialects, and a statement that
/// works in SQLite and fails elsewhere is a statement worth spelling defensively once.
const SCHEMA: [&str; 7] = [
    "CREATE TABLE IF NOT EXISTS \"organization\" (\
        \"id\" TEXT PRIMARY KEY NOT NULL, \
        \"name_sealed\" BLOB NOT NULL, \
        \"verifying_key\" BLOB NOT NULL, \
        \"remote_url\" TEXT NOT NULL, \
        \"link_credential_sealed\" BLOB NOT NULL, \
        \"created_at\" INTEGER NOT NULL)",
    "CREATE TABLE IF NOT EXISTS \"member\" (\
        \"id\" TEXT PRIMARY KEY NOT NULL, \
        \"username_sealed\" BLOB NOT NULL, \
        \"public_key\" BLOB NOT NULL, \
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
        \"updated_at\" INTEGER NOT NULL)",
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
        \"sealed_payload\" BLOB NOT NULL, \
        \"kdf_salt\" BLOB NOT NULL, \
        \"kdf_params\" TEXT NOT NULL, \
        \"expires_at\" INTEGER NOT NULL, \
        \"consumed_at\" INTEGER, \
        \"certificate_id\" TEXT NOT NULL, \
        \"signature\" BLOB NOT NULL, \
        \"created_at\" INTEGER NOT NULL)",
    "CREATE TABLE IF NOT EXISTS \"migration_lease\" (\
        \"workspace_id\" TEXT PRIMARY KEY NOT NULL, \
        \"holder_member_id\" TEXT NOT NULL, \
        \"expires_at\" INTEGER NOT NULL)",
];

/// The one `organization` row.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct OrganizationRecord {
    pub id: String,
    /// the name, sealed under the content key by the caller.
    pub name_sealed: Vec<u8>,
    /// the organization's Ed25519 verifying key, **stored here for a second machine to compare
    /// against and never to verify with.** A reader verifies against the key its join link pinned;
    /// this column is what lets it notice the two disagree.
    pub verifying_key: [u8; VERIFYING_KEY_BYTES],
    pub remote_url: String,
    /// the read-only credential every join link carries, sealed under the content key: any
    /// member whose vault is open can make a link, and nobody holding the database alone can use
    /// it.
    pub link_credential_sealed: Vec<u8>,
    pub created_at: i64,
}

/// A `member` row as a caller writes and reads it. The certificate and the signature are the
/// store's: put on by [`OrganizationStore::write_member`] and checked by
/// [`OrganizationStore::members`], so a record in a caller's hands has already been verified.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MemberRecord {
    pub id: String,
    /// the username, sealed under the content key by the caller. The one thing that names a
    /// member: there is no address and no display name beside it (effort 824, requirement 21).
    pub username_sealed: Vec<u8>,
    /// the member's keypair as the vault shapes it: the public half, the sealed secret half, and
    /// the derivation that seal used.
    pub vault: Vault,
    /// the organization content key, sealed to this member's public key.
    pub sealed_content_key: Vec<u8>,
    /// `packages/workspace-permission`'s vocabulary. Nothing here interprets it.
    pub role: String,
    pub permissions: i64,
    pub must_change_password: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

/// A `workspace` row. Only the database identity is under signature; the name and the schema
/// version are not, as the plan says.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct WorkspaceRecord {
    pub id: String,
    pub name_sealed: Vec<u8>,
    pub database_name: String,
    pub database_hostname: String,
    pub schema_version: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

/// A `migration_lease` row: which member is upgrading a workspace, and the moment after which
/// nobody is, whatever became of them.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MigrationLeaseRecord {
    pub workspace_id: String,
    pub holder_member_id: String,
    pub expires_at: i64,
}

/// A `grant` row, the whole of which is under signature.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GrantRecord {
    pub member_id: String,
    pub workspace_id: String,
    /// the workspace credential, sealed to the member's public key by the caller.
    pub sealed_credential: Vec<u8>,
    pub access_level: String,
    pub credential_expires_at: Option<String>,
}

/// An `invitation` row: what a joining member opens with the link's secret and their generated
/// password, and how long it stands. The id, the sealed payload and the expiry are under signature;
/// `member_id` names whose invitation it is for the dashboard, and the derivation fields are the
/// invitation's own, as a vault's are a member's: rewriting them breaks the invitation and nothing
/// else.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct InvitationRecord {
    pub id: String,
    pub member_id: String,
    pub sealed: SealedInvitation,
    pub expires_at: i64,
    pub consumed_at: Option<i64>,
    pub created_at: i64,
}

/// Who is writing: an administrator's key and the certificate that makes it an authority.
///
/// Taken together so that `authority::sign` can refuse a key the certificate does not name, once,
/// at the write, rather than every reader discovering it afterwards.
pub struct Signer<'a> {
    pub key: &'a super::authority::AdministratorKey,
    pub certificate: &'a Certificate,
}

/// The organization replica on this machine.
///
/// `Debug` says which file it is over and nothing about the rows, which is all a log line needs.
pub struct OrganizationStore {
    database: turso::sync::Database,
    connection: turso::Connection,
}

impl std::fmt::Debug for OrganizationStore {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("OrganizationStore")
    }
}

impl OrganizationStore {
    /// Where one organization's replica lives: `org-<id>.db` beside `app.db` and beside every
    /// `ws-<id>.db`, for the reason `Database::replica_path` gives. Two organizations on one
    /// machine never meet, and neither meets a workspace.
    pub fn replica_path(database_path: &Path, organization_id: &str) -> PathBuf {
        let directory = database_path.parent().unwrap_or_else(|| Path::new("."));

        directory.join(format!("org-{organization_id}.db"))
    }

    /// Open the replica, through the same construction the workspace engine uses.
    ///
    /// **A second `turso::sync::Database`, not a second `Engine` arm.** Built through
    /// [`Database::open_replica`] so that the crypto-provider guard and `bootstrap_if_empty(false)`
    /// are the ones the workspace already runs under, and so that whatever that function learns
    /// about the engine, this one learns too.
    pub async fn open<F, Fut>(
        path: &Path,
        remote_url: Option<String>,
        auth_token: F,
    ) -> Result<Self, Error>
    where
        F: Fn() -> Fut + Send + Sync + 'static,
        Fut: std::future::Future<Output = std::result::Result<String, turso::Error>>
            + Send
            + 'static,
    {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let database = Database::open_replica(path, remote_url, auth_token).await?;
        let connection = database.connect().await?;

        Ok(Self {
            database,
            connection,
        })
    }

    /// Create the seven tables where they do not exist.
    ///
    /// Issued through the sync connection, so on the machine that creates the organization the
    /// schema is captured as change data and reaches the remote with the first push; every other
    /// machine receives it as pages and the statements here find the tables already there.
    /// `CREATE TABLE` replicates this way where a drop-and-rename does not, which is the finding
    /// `database/test/workspace.rs` records and the reason this schema is never migrated by
    /// renaming.
    pub async fn install_schema(&self) -> Result<(), Error> {
        for statement in SCHEMA {
            self.connection.execute(statement, ()).await?;
        }

        Ok(())
    }

    /// Send what this machine wrote. A failure is an answer, as `Database::push_replica` says:
    /// what could not be sent stays captured and goes with the next push.
    pub async fn push(&self) -> bool {
        self.database.push().await.is_ok()
    }

    /// Bring what the remote has, and say whether anything arrived.
    pub async fn pull(&self) -> bool {
        matches!(self.database.pull().await, Ok(true))
    }

    /// The tables this database holds, read from the database rather than from [`TABLES`], which
    /// is what lets a test compare the two.
    pub async fn tables(&self) -> Result<Vec<String>, Error> {
        let mut rows = self
            .connection
            .query(
                "SELECT name FROM sqlite_master WHERE type = 'table' \
                 AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'turso_%' \
                 AND name NOT LIKE '\\_\\_%' ESCAPE '\\' ORDER BY name",
                (),
            )
            .await?;
        let mut names = Vec::new();

        while let Some(row) = rows.next().await? {
            names.push(text(&row, 0)?);
        }

        Ok(names)
    }

    // the organization row

    pub async fn write_organization(&self, organization: &OrganizationRecord) -> Result<(), Error> {
        self.connection
            .execute(
                "INSERT OR REPLACE INTO \"organization\" \
                 (\"id\", \"name_sealed\", \"verifying_key\", \"remote_url\", \
                  \"link_credential_sealed\", \"created_at\") \
                 VALUES (?, ?, ?, ?, ?, ?)",
                vec![
                    turso::Value::Text(organization.id.clone()),
                    turso::Value::Blob(organization.name_sealed.clone()),
                    turso::Value::Blob(organization.verifying_key.to_vec()),
                    turso::Value::Text(organization.remote_url.clone()),
                    turso::Value::Blob(organization.link_credential_sealed.clone()),
                    turso::Value::Integer(organization.created_at),
                ],
            )
            .await?;

        Ok(())
    }

    pub async fn organization(&self) -> Result<Option<OrganizationRecord>, Error> {
        let mut rows = self
            .connection
            .query(
                "SELECT \"id\", \"name_sealed\", \"verifying_key\", \"remote_url\", \
                        \"link_credential_sealed\", \"created_at\" \
                 FROM \"organization\" LIMIT 1",
                (),
            )
            .await?;

        let Some(row) = rows.next().await? else {
            return Ok(None);
        };

        Ok(Some(OrganizationRecord {
            id: text(&row, 0)?,
            name_sealed: blob(&row, 1)?,
            verifying_key: fixed::<VERIFYING_KEY_BYTES>(&row, 2, "verifying_key")?,
            remote_url: text(&row, 3)?,
            link_credential_sealed: blob(&row, 4)?,
            created_at: integer(&row, 5)?,
        }))
    }

    // certificates

    /// Write a certificate as issued or as revoked. The signature it carries is the organization
    /// key's and was made when it was issued; this module checks it on every read of a row it
    /// authorises, and never makes one.
    pub async fn write_certificate(&self, certificate: &Certificate) -> Result<(), Error> {
        self.connection
            .execute(
                "INSERT OR REPLACE INTO \"administrator_certificate\" \
                 (\"id\", \"member_id\", \"signing_public_key\", \"signature_by_organization_key\", \
                  \"issued_at\", \"revoked_at\") \
                 VALUES (?, ?, ?, ?, ?, ?)",
                vec![
                    turso::Value::Text(certificate.id.clone()),
                    turso::Value::Text(certificate.member_id.clone()),
                    turso::Value::Blob(certificate.signing_public_key.to_vec()),
                    turso::Value::Blob(certificate.signature_by_organization_key.clone()),
                    turso::Value::Text(certificate.issued_at.clone()),
                    optional_text(certificate.revoked_at.as_deref()),
                ],
            )
            .await?;

        Ok(())
    }

    /// Every certificate, revoked ones included: a revoked certificate is still what a row names,
    /// and `verify` is what says the row is refused for it.
    pub async fn certificates(&self) -> Result<Vec<Certificate>, Error> {
        let mut rows = self
            .connection
            .query(
                "SELECT \"id\", \"member_id\", \"signing_public_key\", \
                        \"signature_by_organization_key\", \"issued_at\", \"revoked_at\" \
                 FROM \"administrator_certificate\" ORDER BY \"id\"",
                (),
            )
            .await?;
        let mut certificates = Vec::new();

        while let Some(row) = rows.next().await? {
            certificates.push(Certificate {
                id: text(&row, 0)?,
                member_id: text(&row, 1)?,
                signing_public_key: fixed::<VERIFYING_KEY_BYTES>(&row, 2, "signing_public_key")?,
                signature_by_organization_key: blob(&row, 3)?,
                issued_at: text(&row, 4)?,
                revoked_at: nullable_text(&row, 5)?,
            });
        }

        Ok(certificates)
    }

    // members

    /// Write a member row, signed by `signer` over the fields the plan puts under signature.
    pub async fn write_member(
        &self,
        signer: &Signer<'_>,
        member: &MemberRecord,
    ) -> Result<(), Error> {
        let signature = sign(
            signer.key,
            signer.certificate,
            Authority::Member(MemberAuthority {
                public_key: &member.vault.public_key,
                role: &member.role,
                permissions: member.permissions,
            }),
        )?;

        self.connection
            .execute(
                "INSERT OR REPLACE INTO \"member\" \
                 (\"id\", \"username_sealed\", \"public_key\", \
                  \"sealed_secret_key\", \"sealed_content_key\", \"kdf_salt\", \"kdf_params\", \
                  \"role\", \"permissions\", \"must_change_password\", \"certificate_id\", \
                  \"signature\", \"created_at\", \"updated_at\") \
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                vec![
                    turso::Value::Text(member.id.clone()),
                    turso::Value::Blob(member.username_sealed.clone()),
                    turso::Value::Blob(member.vault.public_key.to_vec()),
                    turso::Value::Blob(member.vault.sealed_secret_key.clone()),
                    turso::Value::Blob(member.sealed_content_key.clone()),
                    turso::Value::Blob(member.vault.kdf_salt.to_vec()),
                    turso::Value::Text(member.vault.kdf_params.encode()),
                    turso::Value::Text(member.role.clone()),
                    turso::Value::Integer(member.permissions),
                    turso::Value::Integer(i64::from(member.must_change_password)),
                    turso::Value::Text(signer.certificate.id.clone()),
                    turso::Value::Blob(signature),
                    turso::Value::Integer(member.created_at),
                    turso::Value::Integer(member.updated_at),
                ],
            )
            .await?;

        Ok(())
    }

    /// Re-seal a member's vault under a new password, and say whether they still have to change
    /// it. The one write on a member row that carries no signature, and deliberately: the public
    /// key, the role and the permissions are what the chain signs, and none of them moves here.
    /// A member re-sealing their own vault writes nothing an authority has to vouch for, which is
    /// what makes a password change a write a member may perform on a database they hold full
    /// access to (ticket 07). A vault whose public key differs from the row's is refused, because
    /// that would be a new keypair, and a new keypair is a signed write.
    pub async fn reseal_member(
        &self,
        member_id: &str,
        vault: &Vault,
        must_change_password: bool,
        now: i64,
    ) -> Result<(), Error> {
        let mut rows = self
            .connection
            .query(
                "SELECT \"public_key\" FROM \"member\" WHERE \"id\" = ?",
                vec![turso::Value::Text(member_id.to_string())],
            )
            .await?;
        let row = rows.next().await?.ok_or_else(|| Error::NotFound {
            message: "that member is not in this organization".to_string(),
        })?;

        if blob(&row, 0)? != vault.public_key {
            return Err(Error::Integrity {
                message: "a vault re-sealed under a password keeps its keypair; this one did not"
                    .to_string(),
            });
        }

        self.connection
            .execute(
                "UPDATE \"member\" SET \"sealed_secret_key\" = ?, \"kdf_salt\" = ?, \
                 \"kdf_params\" = ?, \"must_change_password\" = ?, \"updated_at\" = ? \
                 WHERE \"id\" = ?",
                vec![
                    turso::Value::Blob(vault.sealed_secret_key.clone()),
                    turso::Value::Blob(vault.kdf_salt.to_vec()),
                    turso::Value::Text(vault.kdf_params.encode()),
                    turso::Value::Integer(i64::from(must_change_password)),
                    turso::Value::Integer(now),
                    turso::Value::Text(member_id.to_string()),
                ],
            )
            .await?;

        Ok(())
    }

    /// Every member, each verified against the chain before it is returned.
    ///
    /// `organization_verifying_key` is the one the caller pinned from its join link, never the
    /// `organization` row's, for the reason `authority::verify` gives.
    pub async fn members(
        &self,
        organization_verifying_key: &[u8; VERIFYING_KEY_BYTES],
    ) -> Result<Vec<MemberRecord>, Error> {
        Ok(self
            .signed_members(organization_verifying_key)
            .await?
            .into_iter()
            .map(|(_, member)| member)
            .collect())
    }

    /// Every member, each verified, paired with the id of the certificate that signed it. The
    /// public [`OrganizationStore::members`] drops the id; [`OrganizationStore::re_sign_rows_of_certificate`]
    /// is what needs it, because a record alone does not say which certificate stands behind it.
    async fn signed_members(
        &self,
        organization_verifying_key: &[u8; VERIFYING_KEY_BYTES],
    ) -> Result<Vec<(String, MemberRecord)>, Error> {
        let certificates = self.certificates().await?;
        let mut rows = self
            .connection
            .query(
                "SELECT \"id\", \"username_sealed\", \"public_key\", \
                        \"sealed_secret_key\", \"sealed_content_key\", \"kdf_salt\", \"kdf_params\", \
                        \"role\", \"permissions\", \"must_change_password\", \"certificate_id\", \
                        \"signature\", \"created_at\", \"updated_at\" \
                 FROM \"member\" ORDER BY \"created_at\", \"id\"",
                (),
            )
            .await?;
        let mut members = Vec::new();

        while let Some(row) = rows.next().await? {
            let id = text(&row, 0)?;
            let public_key = fixed::<PUBLIC_KEY_BYTES>(&row, 2, "public_key")?;
            let role = text(&row, 7)?;
            let permissions = integer(&row, 8)?;
            let certificate_id = text(&row, 10)?;
            let signature = blob(&row, 11)?;

            verified(
                organization_verifying_key,
                &certificates,
                "member",
                &id,
                &certificate_id,
                Authority::Member(MemberAuthority {
                    public_key: &public_key,
                    role: &role,
                    permissions,
                }),
                &signature,
            )?;

            members.push((
                certificate_id,
                MemberRecord {
                    id,
                    username_sealed: blob(&row, 1)?,
                    vault: Vault {
                        public_key,
                        sealed_secret_key: blob(&row, 3)?,
                        kdf_salt: fixed::<KDF_SALT_BYTES>(&row, 5, "kdf_salt")?,
                        kdf_params: KdfParams::parse(&text(&row, 6)?)?,
                    },
                    sealed_content_key: blob(&row, 4)?,
                    role,
                    permissions,
                    must_change_password: integer(&row, 9)? != 0,
                    created_at: integer(&row, 12)?,
                    updated_at: integer(&row, 13)?,
                },
            ));
        }

        Ok(members)
    }

    // workspaces

    pub async fn write_workspace(
        &self,
        signer: &Signer<'_>,
        workspace: &WorkspaceRecord,
    ) -> Result<(), Error> {
        let signature = sign(
            signer.key,
            signer.certificate,
            Authority::Workspace(WorkspaceAuthority {
                database_name: &workspace.database_name,
                database_hostname: &workspace.database_hostname,
            }),
        )?;

        self.connection
            .execute(
                "INSERT OR REPLACE INTO \"workspace\" \
                 (\"id\", \"name_sealed\", \"database_name\", \"database_hostname\", \
                  \"schema_version\", \"certificate_id\", \"signature\", \"created_at\", \
                  \"updated_at\") \
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                vec![
                    turso::Value::Text(workspace.id.clone()),
                    turso::Value::Blob(workspace.name_sealed.clone()),
                    turso::Value::Text(workspace.database_name.clone()),
                    turso::Value::Text(workspace.database_hostname.clone()),
                    turso::Value::Integer(workspace.schema_version),
                    turso::Value::Text(signer.certificate.id.clone()),
                    turso::Value::Blob(signature),
                    turso::Value::Integer(workspace.created_at),
                    turso::Value::Integer(workspace.updated_at),
                ],
            )
            .await?;

        Ok(())
    }

    /// Every workspace, each verified before it is returned.
    pub async fn workspaces(
        &self,
        organization_verifying_key: &[u8; VERIFYING_KEY_BYTES],
    ) -> Result<Vec<WorkspaceRecord>, Error> {
        Ok(self
            .signed_workspaces(organization_verifying_key)
            .await?
            .into_iter()
            .map(|(_, workspace)| workspace)
            .collect())
    }

    /// Every workspace, each verified, paired with the id of the certificate that signed it.
    async fn signed_workspaces(
        &self,
        organization_verifying_key: &[u8; VERIFYING_KEY_BYTES],
    ) -> Result<Vec<(String, WorkspaceRecord)>, Error> {
        let certificates = self.certificates().await?;
        let mut rows = self
            .connection
            .query(
                "SELECT \"id\", \"name_sealed\", \"database_name\", \"database_hostname\", \
                        \"schema_version\", \"certificate_id\", \"signature\", \"created_at\", \
                        \"updated_at\" \
                 FROM \"workspace\" ORDER BY \"created_at\", \"id\"",
                (),
            )
            .await?;
        let mut workspaces = Vec::new();

        while let Some(row) = rows.next().await? {
            let id = text(&row, 0)?;
            let database_name = text(&row, 2)?;
            let database_hostname = text(&row, 3)?;
            let certificate_id = text(&row, 5)?;
            let signature = blob(&row, 6)?;

            verified(
                organization_verifying_key,
                &certificates,
                "workspace",
                &id,
                &certificate_id,
                Authority::Workspace(WorkspaceAuthority {
                    database_name: &database_name,
                    database_hostname: &database_hostname,
                }),
                &signature,
            )?;

            workspaces.push((
                certificate_id,
                WorkspaceRecord {
                    id,
                    name_sealed: blob(&row, 1)?,
                    database_name,
                    database_hostname,
                    schema_version: integer(&row, 4)?,
                    created_at: integer(&row, 7)?,
                    updated_at: integer(&row, 8)?,
                },
            ));
        }

        Ok(workspaces)
    }

    // grants

    pub async fn write_grant(&self, signer: &Signer<'_>, grant: &GrantRecord) -> Result<(), Error> {
        let signature = sign(
            signer.key,
            signer.certificate,
            Authority::Grant(GrantAuthority {
                member_id: &grant.member_id,
                workspace_id: &grant.workspace_id,
                sealed_credential: &grant.sealed_credential,
                access_level: &grant.access_level,
                credential_expires_at: grant.credential_expires_at.as_deref(),
            }),
        )?;

        self.connection
            .execute(
                "INSERT OR REPLACE INTO \"grant\" \
                 (\"member_id\", \"workspace_id\", \"sealed_credential\", \"access_level\", \
                  \"credential_expires_at\", \"certificate_id\", \"signature\") \
                 VALUES (?, ?, ?, ?, ?, ?, ?)",
                vec![
                    turso::Value::Text(grant.member_id.clone()),
                    turso::Value::Text(grant.workspace_id.clone()),
                    turso::Value::Blob(grant.sealed_credential.clone()),
                    turso::Value::Text(grant.access_level.clone()),
                    optional_text(grant.credential_expires_at.as_deref()),
                    turso::Value::Text(signer.certificate.id.clone()),
                    turso::Value::Blob(signature),
                ],
            )
            .await?;

        Ok(())
    }

    /// Every grant, each verified before it is returned.
    pub async fn grants(
        &self,
        organization_verifying_key: &[u8; VERIFYING_KEY_BYTES],
    ) -> Result<Vec<GrantRecord>, Error> {
        Ok(self
            .signed_grants(organization_verifying_key)
            .await?
            .into_iter()
            .map(|(_, grant)| grant)
            .collect())
    }

    /// Every grant, each verified, paired with the id of the certificate that signed it.
    async fn signed_grants(
        &self,
        organization_verifying_key: &[u8; VERIFYING_KEY_BYTES],
    ) -> Result<Vec<(String, GrantRecord)>, Error> {
        let certificates = self.certificates().await?;
        let mut rows = self
            .connection
            .query(
                "SELECT \"member_id\", \"workspace_id\", \"sealed_credential\", \"access_level\", \
                        \"credential_expires_at\", \"certificate_id\", \"signature\" \
                 FROM \"grant\" ORDER BY \"member_id\", \"workspace_id\"",
                (),
            )
            .await?;
        let mut grants = Vec::new();

        while let Some(row) = rows.next().await? {
            let grant = GrantRecord {
                member_id: text(&row, 0)?,
                workspace_id: text(&row, 1)?,
                sealed_credential: blob(&row, 2)?,
                access_level: text(&row, 3)?,
                credential_expires_at: nullable_text(&row, 4)?,
            };
            let certificate_id = text(&row, 5)?;
            let signature = blob(&row, 6)?;

            verified(
                organization_verifying_key,
                &certificates,
                "grant",
                &format!("{}/{}", grant.member_id, grant.workspace_id),
                &certificate_id,
                Authority::Grant(GrantAuthority {
                    member_id: &grant.member_id,
                    workspace_id: &grant.workspace_id,
                    sealed_credential: &grant.sealed_credential,
                    access_level: &grant.access_level,
                    credential_expires_at: grant.credential_expires_at.as_deref(),
                }),
                &signature,
            )?;

            grants.push((certificate_id, grant));
        }

        Ok(grants)
    }

    // invitations

    pub async fn write_invitation(
        &self,
        signer: &Signer<'_>,
        invitation: &InvitationRecord,
    ) -> Result<(), Error> {
        let signature = sign(
            signer.key,
            signer.certificate,
            Authority::Invitation(InvitationAuthority {
                id: &invitation.id,
                sealed_payload: &invitation.sealed.sealed_payload,
                expires_at: invitation.expires_at,
            }),
        )?;

        self.connection
            .execute(
                "INSERT OR REPLACE INTO \"invitation\" \
                 (\"id\", \"member_id\", \"sealed_payload\", \"kdf_salt\", \"kdf_params\", \
                  \"expires_at\", \"consumed_at\", \"certificate_id\", \"signature\", \
                  \"created_at\") \
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                vec![
                    turso::Value::Text(invitation.id.clone()),
                    turso::Value::Text(invitation.member_id.clone()),
                    turso::Value::Blob(invitation.sealed.sealed_payload.clone()),
                    turso::Value::Blob(invitation.sealed.kdf_salt.to_vec()),
                    turso::Value::Text(invitation.sealed.kdf_params.encode()),
                    turso::Value::Integer(invitation.expires_at),
                    invitation
                        .consumed_at
                        .map_or(turso::Value::Null, turso::Value::Integer),
                    turso::Value::Text(signer.certificate.id.clone()),
                    turso::Value::Blob(signature),
                    turso::Value::Integer(invitation.created_at),
                ],
            )
            .await?;

        Ok(())
    }

    /// Every invitation, each verified before it is returned.
    pub async fn invitations(
        &self,
        organization_verifying_key: &[u8; VERIFYING_KEY_BYTES],
    ) -> Result<Vec<InvitationRecord>, Error> {
        Ok(self
            .signed_invitations(organization_verifying_key)
            .await?
            .into_iter()
            .map(|(_, invitation)| invitation)
            .collect())
    }

    /// Every invitation, each verified, paired with the id of the certificate that signed it.
    async fn signed_invitations(
        &self,
        organization_verifying_key: &[u8; VERIFYING_KEY_BYTES],
    ) -> Result<Vec<(String, InvitationRecord)>, Error> {
        let certificates = self.certificates().await?;
        let mut rows = self
            .connection
            .query(
                "SELECT \"id\", \"member_id\", \"sealed_payload\", \"kdf_salt\", \"kdf_params\", \
                        \"expires_at\", \"consumed_at\", \"certificate_id\", \"signature\", \
                        \"created_at\" \
                 FROM \"invitation\" ORDER BY \"created_at\", \"id\"",
                (),
            )
            .await?;
        let mut invitations = Vec::new();

        while let Some(row) = rows.next().await? {
            let id = text(&row, 0)?;
            let sealed_payload = blob(&row, 2)?;
            let expires_at = integer(&row, 5)?;
            let certificate_id = text(&row, 7)?;
            let signature = blob(&row, 8)?;

            verified(
                organization_verifying_key,
                &certificates,
                "invitation",
                &id,
                &certificate_id,
                Authority::Invitation(InvitationAuthority {
                    id: &id,
                    sealed_payload: &sealed_payload,
                    expires_at,
                }),
                &signature,
            )?;

            invitations.push((
                certificate_id,
                InvitationRecord {
                    id,
                    member_id: text(&row, 1)?,
                    sealed: SealedInvitation {
                        sealed_payload,
                        kdf_salt: fixed::<KDF_SALT_BYTES>(&row, 3, "kdf_salt")?,
                        kdf_params: KdfParams::parse(&text(&row, 4)?)?,
                    },
                    expires_at,
                    consumed_at: match row.get_value(6)? {
                        turso::Value::Integer(value) => Some(value),
                        _ => None,
                    },
                    created_at: integer(&row, 9)?,
                },
            ));
        }

        Ok(invitations)
    }

    /// Mark an invitation consumed. Unsigned on purpose: the machine that consumes it holds no
    /// administrator key, and a consumed invitation is spent whether or not the mark is trusted,
    /// because the member row it pointed at now has a password of the member's own.
    pub async fn consume_invitation(&self, id: &str, now: i64) -> Result<(), Error> {
        self.connection
            .execute(
                "UPDATE \"invitation\" SET \"consumed_at\" = ? WHERE \"id\" = ?",
                vec![
                    turso::Value::Integer(now),
                    turso::Value::Text(id.to_string()),
                ],
            )
            .await?;

        Ok(())
    }

    /// Revoke an invitation: the row goes, and the link that named it finds nothing.
    pub async fn delete_invitation(&self, id: &str) -> Result<(), Error> {
        self.connection
            .execute(
                "DELETE FROM \"invitation\" WHERE \"id\" = ?",
                vec![turso::Value::Text(id.to_string())],
            )
            .await?;

        Ok(())
    }

    /// Rename a workspace. Unsigned, as the plan keeps the name: the database identity is what
    /// the chain signs, and the name is content, sealed under the content key by the caller.
    pub async fn rename_workspace(
        &self,
        workspace_id: &str,
        name_sealed: &[u8],
        now: i64,
    ) -> Result<(), Error> {
        self.connection
            .execute(
                "UPDATE \"workspace\" SET \"name_sealed\" = ?, \"updated_at\" = ? \
                 WHERE \"id\" = ?",
                vec![
                    turso::Value::Blob(name_sealed.to_vec()),
                    turso::Value::Integer(now),
                    turso::Value::Text(workspace_id.to_string()),
                ],
            )
            .await?;

        Ok(())
    }

    /// Record that a workspace's database is at `version`. Unsigned, deliberately: the plan puts
    /// the schema version outside the signature so that whichever member applied the migration
    /// can say so, and a member has no signing key.
    pub async fn record_schema_version(
        &self,
        workspace_id: &str,
        version: i64,
        now: i64,
    ) -> Result<(), Error> {
        self.connection
            .execute(
                "UPDATE \"workspace\" SET \"schema_version\" = ?, \"updated_at\" = ? \
                 WHERE \"id\" = ?",
                vec![
                    turso::Value::Integer(version),
                    turso::Value::Integer(now),
                    turso::Value::Text(workspace_id.to_string()),
                ],
            )
            .await?;

        Ok(())
    }

    /// The migration lease on a workspace, or nothing: who holds it and until when, as a value
    /// a human can read out of the row.
    pub async fn migration_lease(
        &self,
        workspace_id: &str,
    ) -> Result<Option<MigrationLeaseRecord>, Error> {
        let mut rows = self
            .connection
            .query(
                "SELECT \"holder_member_id\", \"expires_at\" FROM \"migration_lease\" \
                 WHERE \"workspace_id\" = ?",
                vec![turso::Value::Text(workspace_id.to_string())],
            )
            .await?;

        match rows.next().await? {
            Some(row) => Ok(Some(MigrationLeaseRecord {
                workspace_id: workspace_id.to_string(),
                holder_member_id: text(&row, 0)?,
                expires_at: integer(&row, 1)?,
            })),
            None => Ok(None),
        }
    }

    /// The connection, for the lease authority that runs the lease statements against a local
    /// primary (`organization/migration.rs::StoreLease`).
    pub(crate) fn lease_connection(&self) -> &turso::Connection {
        &self.connection
    }

    /// Remove one grant: what a reset does with a grant it cannot re-seal, because the vault it
    /// was sealed to is gone and a grant nobody can open is a sign-in that fails.
    pub async fn delete_grant(&self, member_id: &str, workspace_id: &str) -> Result<(), Error> {
        self.connection
            .execute(
                "DELETE FROM \"grant\" WHERE \"member_id\" = ? AND \"workspace_id\" = ?",
                vec![
                    turso::Value::Text(member_id.to_string()),
                    turso::Value::Text(workspace_id.to_string()),
                ],
            )
            .await?;

        Ok(())
    }

    /// Remove a workspace's row and every grant on it, for the one moment requirement 4 permits
    /// it; the database it names is the port's to remove first.
    pub async fn delete_workspace(&self, workspace_id: &str) -> Result<(), Error> {
        self.connection
            .execute(
                "DELETE FROM \"grant\" WHERE \"workspace_id\" = ?",
                vec![turso::Value::Text(workspace_id.to_string())],
            )
            .await?;
        self.connection
            .execute(
                "DELETE FROM \"workspace\" WHERE \"id\" = ?",
                vec![turso::Value::Text(workspace_id.to_string())],
            )
            .await?;

        Ok(())
    }

    /// Re-sign every row a certificate signed, under `signer`, and say how many rows moved.
    ///
    /// **The one routine reset, removal and any future revocation share, so the three cannot
    /// drift.** An administrator's certificate is retired two ways: a reset replaces it with a key
    /// derived from a fresh vault secret (`invite::issue`), and a removal writes it back revoked
    /// (`removal::remove_member`). Either way, `authority::verify` then refuses every row the old
    /// certificate signed, because the row's signature no longer matches the key the certificate
    /// carries (reset) or the certificate is revoked (removal), and `members`/`grants`/
    /// `invitations`/`workspaces` refuse the whole read on the first such row. So before the
    /// certificate is retired, the rows it signed are re-signed under the acting administrator, who
    /// already holds authority over them: the resetting owner, or the removing owner or
    /// administrator. After it, those rows name the actor's certificate and verify under it, and
    /// retiring the old certificate bricks nothing.
    ///
    /// The rows are read through the verified readers, so a row that does not verify under the
    /// still-live old certificate refuses the whole operation rather than being re-signed blind;
    /// the actor never launders a forgery into their own signature. Each row is written back
    /// through the ordinary `write_*` path, which stamps `signer`'s certificate id and a fresh
    /// signature and leaves every other column as it stood.
    pub async fn re_sign_rows_of_certificate(
        &self,
        organization_verifying_key: &[u8; VERIFYING_KEY_BYTES],
        certificate_id: &str,
        signer: &Signer<'_>,
    ) -> Result<usize, Error> {
        if signer.certificate.id == certificate_id {
            return Err(Error::Integrity {
                message: "a certificate cannot re-sign its own rows onto itself".to_string(),
            });
        }

        let mut re_signed = 0;

        for (signed_by, member) in self.signed_members(organization_verifying_key).await? {
            if signed_by == certificate_id {
                self.write_member(signer, &member).await?;
                re_signed += 1;
            }
        }

        for (signed_by, workspace) in self.signed_workspaces(organization_verifying_key).await? {
            if signed_by == certificate_id {
                self.write_workspace(signer, &workspace).await?;
                re_signed += 1;
            }
        }

        for (signed_by, grant) in self.signed_grants(organization_verifying_key).await? {
            if signed_by == certificate_id {
                self.write_grant(signer, &grant).await?;
                re_signed += 1;
            }
        }

        for (signed_by, invitation) in self.signed_invitations(organization_verifying_key).await? {
            if signed_by == certificate_id {
                self.write_invitation(signer, &invitation).await?;
                re_signed += 1;
            }
        }

        Ok(re_signed)
    }

    /// The connection, for a test that has to write a row the store would never write.
    #[cfg(test)]
    pub(crate) fn connection(&self) -> &turso::Connection {
        &self.connection
    }
}

/// One row's verdict, through the only verifier there is.
///
/// A row naming a certificate that does not exist fails here as well: an unknown certificate is
/// an authority nobody issued, which is the same thing as a forged one from where a reader stands.
fn verified(
    organization_verifying_key: &[u8; VERIFYING_KEY_BYTES],
    certificates: &[Certificate],
    table: &str,
    id: &str,
    certificate_id: &str,
    authority: Authority<'_>,
    signature: &[u8],
) -> Result<(), Error> {
    let certificate = certificates
        .iter()
        .find(|certificate| certificate.id == certificate_id)
        .ok_or_else(|| Error::Integrity {
            message: format!(
                "the {table} row {id} names a certificate nobody issued ({certificate_id}), \
                 and is refused"
            ),
        })?;

    verify(
        organization_verifying_key,
        certificate,
        authority,
        signature,
    )
    .map_err(|error| Error::Integrity {
        message: format!("the {table} row {id} is refused: {error}"),
    })
}

fn text(row: &turso::Row, index: usize) -> Result<String, Error> {
    match row.get_value(index)? {
        turso::Value::Text(value) => Ok(value),
        other => Err(unexpected(index, "text", &other)),
    }
}

fn nullable_text(row: &turso::Row, index: usize) -> Result<Option<String>, Error> {
    match row.get_value(index)? {
        turso::Value::Text(value) => Ok(Some(value)),
        turso::Value::Null => Ok(None),
        other => Err(unexpected(index, "text or null", &other)),
    }
}

fn blob(row: &turso::Row, index: usize) -> Result<Vec<u8>, Error> {
    match row.get_value(index)? {
        turso::Value::Blob(value) => Ok(value),
        other => Err(unexpected(index, "a blob", &other)),
    }
}

fn integer(row: &turso::Row, index: usize) -> Result<i64, Error> {
    match row.get_value(index)? {
        turso::Value::Integer(value) => Ok(value),
        other => Err(unexpected(index, "an integer", &other)),
    }
}

/// A blob of exactly `N` bytes, which every key column is.
fn fixed<const N: usize>(row: &turso::Row, index: usize, column: &str) -> Result<[u8; N], Error> {
    let bytes = blob(row, index)?;

    <[u8; N]>::try_from(bytes.as_slice()).map_err(|_| Error::Integrity {
        message: format!(
            "the organization database holds a {column} of {} bytes where {N} were expected",
            bytes.len()
        ),
    })
}

fn optional_text(value: Option<&str>) -> turso::Value {
    match value {
        Some(value) => turso::Value::Text(value.to_string()),
        None => turso::Value::Null,
    }
}

/// The value is described by its storage class and never quoted: a column here may hold a
/// sealed value or a key, and neither belongs in an error string.
fn unexpected(index: usize, expected: &str, found: &turso::Value) -> Error {
    let class = match found {
        turso::Value::Null => "null",
        turso::Value::Integer(_) => "an integer",
        turso::Value::Real(_) => "a real",
        turso::Value::Text(_) => "text",
        turso::Value::Blob(_) => "a blob",
    };

    Error::Integrity {
        message: format!(
            "the organization database answered column {index} with {class} where {expected} was \
             expected"
        ),
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::{
        GrantRecord, MemberRecord, OrganizationRecord, OrganizationStore, Signer, TABLES,
        WorkspaceRecord,
    };
    use crate::organization::{
        authority::{AdministratorKey, Certificate, OrganizationKey, issue_certificate},
        vault::{
            ContentKey, KdfParams, create_vault, generate_content_key, open_content, seal_content,
            seal_to_public_key,
        },
    };

    /// A cost cheap enough to run in a suite, written out as a caller writes one.
    fn test_cost() -> KdfParams {
        KdfParams {
            memory_kib: 1024,
            iterations: 2,
            lanes: 1,
        }
    }

    fn scratch(name: &str) -> PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|elapsed| elapsed.as_nanos())
            .unwrap_or_default();
        let directory = std::env::temp_dir().join(format!("rentable-org-{name}-{nanos:x}"));
        std::fs::create_dir_all(&directory).expect("scratch directory");

        directory
    }

    /// An organization with one administrator, as ticket 09 will create one: an organization key,
    /// an administrator key, and the certificate that joins them.
    struct Chain {
        organization_key: OrganizationKey,
        administrator_key: AdministratorKey,
        certificate: Certificate,
        content_key: ContentKey,
    }

    impl Chain {
        fn new() -> Self {
            let organization_key = OrganizationKey::generate().expect("an organization key");
            let administrator_key = AdministratorKey::generate().expect("an administrator key");
            let certificate = issue_certificate(
                &organization_key,
                "cert-owner",
                "member-owner",
                &administrator_key.verifying_key(),
                "1757000000000",
            );

            Self {
                organization_key,
                administrator_key,
                certificate,
                content_key: generate_content_key().expect("a content key"),
            }
        }

        fn signer(&self) -> Signer<'_> {
            Signer {
                key: &self.administrator_key,
                certificate: &self.certificate,
            }
        }

        fn verifying_key(&self) -> [u8; 32] {
            self.organization_key.verifying_key()
        }

        fn sealed(&self, column: &str, plaintext: &str) -> Vec<u8> {
            seal_content(&self.content_key, column, plaintext.as_bytes()).expect("failed to seal")
        }

        fn member(&self, id: &str, username: &str, role: &str) -> MemberRecord {
            let vault = create_vault("a password", test_cost()).expect("a vault");
            let sealed_content_key =
                seal_to_public_key(&vault.public_key, &self.content_key.to_bytes())
                    .expect("failed to seal the content key");

            MemberRecord {
                id: id.to_string(),
                username_sealed: self.sealed("member.username_sealed", username),
                vault,
                sealed_content_key,
                role: role.to_string(),
                permissions: if role == "owner" { 63 } else { 0 },
                must_change_password: role != "owner",
                created_at: 1_757_000_000_000,
                updated_at: 1_757_000_000_000,
            }
        }

        fn workspace(&self, id: &str, name: &str) -> WorkspaceRecord {
            WorkspaceRecord {
                id: id.to_string(),
                name_sealed: self.sealed("workspace.name_sealed", name),
                database_name: format!("ws-{id}"),
                database_hostname: format!("ws-{id}-acme.aws-eu-west-1.turso.io"),
                schema_version: 5,
                created_at: 1_757_000_000_000,
                updated_at: 1_757_000_000_000,
            }
        }
    }

    async fn open(directory: &std::path::Path) -> OrganizationStore {
        let store = OrganizationStore::open(&directory.join("org-acme.db"), None, || async {
            Ok::<String, turso::Error>(String::new())
        })
        .await
        .expect("the organization replica");

        store.install_schema().await.expect("the schema");

        store
    }

    /// The organization every populated test starts from: one owner, one member, two workspaces,
    /// and a grant on each. **Two workspaces of one organization**, which is criterion 1 and the
    /// thing `workspace.ownerAccountId` being `.unique()` prevented.
    async fn populated(store: &OrganizationStore, chain: &Chain) {
        store
            .write_organization(&OrganizationRecord {
                id: "acme".to_string(),
                name_sealed: chain.sealed("organization.name_sealed", "Acme Rentals"),
                verifying_key: chain.verifying_key(),
                remote_url: "libsql://org-acme-acme.aws-eu-west-1.turso.io".to_string(),
                link_credential_sealed: chain.sealed(
                    "organization.link_credential_sealed",
                    "a-read-only-credential",
                ),
                created_at: 1_757_000_000_000,
            })
            .await
            .expect("the organization row");
        store
            .write_certificate(&chain.certificate)
            .await
            .expect("the certificate");

        let signer = chain.signer();

        for member in [
            chain.member("member-owner", "olivia.owner", "owner"),
            chain.member("member-staff", "sami.staff", "member"),
        ] {
            store
                .write_member(&signer, &member)
                .await
                .expect("a member");
        }

        for workspace in [
            chain.workspace("north", "North Properties"),
            chain.workspace("south", "South Properties"),
        ] {
            store
                .write_workspace(&signer, &workspace)
                .await
                .expect("a workspace");
            store
                .write_grant(
                    &signer,
                    &GrantRecord {
                        member_id: "member-staff".to_string(),
                        workspace_id: workspace.id.clone(),
                        sealed_credential: b"a sealed workspace credential".to_vec(),
                        access_level: "full-access".to_string(),
                        credential_expires_at: Some("1757600000000".to_string()),
                    },
                )
                .await
                .expect("a grant");
        }
    }

    // criterion 1: the schema, and two workspaces of one organization

    #[tokio::test]
    async fn the_seven_tables_exist_and_an_organization_holds_two_workspaces_at_once() {
        let directory = scratch("schema");
        let store = open(&directory).await;
        let chain = Chain::new();

        let mut expected: Vec<String> = TABLES.iter().map(|table| table.to_string()).collect();
        expected.sort();
        assert_eq!(store.tables().await.expect("the tables"), expected);

        populated(&store, &chain).await;

        let workspaces = store
            .workspaces(&chain.verifying_key())
            .await
            .expect("the workspaces");

        assert_eq!(
            workspaces.len(),
            2,
            "one organization holds one workspace only"
        );
        assert_eq!(workspaces[0].database_name, "ws-north");
        assert_eq!(workspaces[1].database_name, "ws-south");

        // nothing constrains an account to one workspace: there is no owner column to constrain.
        let mut columns = store
            .connection()
            .query("PRAGMA table_info(\"workspace\")", ())
            .await
            .expect("the workspace columns");
        let mut names = Vec::new();

        while let Some(row) = columns.next().await.expect("a column row") {
            names.push(super::text(&row, 1).expect("a column name"));
        }

        assert!(
            !names.iter().any(|name| name.contains("owner")),
            "the workspace table carries an owner column: {names:?}"
        );
        assert!(names.contains(&"database_name".to_string()));
        assert!(names.contains(&"schema_version".to_string()));

        // and the schema is idempotent, which is what a second machine runs into.
        store.install_schema().await.expect("the schema, again");
    }

    // criterion 2: the boundary

    /// **No rents domain table appears in the organization database**, in the shape the
    /// control plane's `boundary.test.ts` had before it retired. The domain tables are
    /// read from the shipped workspace migrations rather than listed here, so an eighth concept
    /// added to the workspace arrives in this test without anybody remembering to add it.
    #[tokio::test]
    async fn no_rents_domain_table_and_no_session_table_appears_in_the_organization_schema() {
        let directory = scratch("boundary");
        let store = open(&directory).await;

        let tables = store.tables().await.expect("the tables");
        let mut expected: Vec<String> = TABLES.iter().map(|table| table.to_string()).collect();
        expected.sort();

        assert_eq!(
            tables, expected,
            "a table was declared that TABLES does not name"
        );

        let migrations = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("migrations");
        let mut domain_tables = Vec::new();

        for entry in std::fs::read_dir(&migrations).expect("the migrations directory") {
            let path = entry.expect("an entry").path();

            if path.extension().is_some_and(|kind| kind == "sql") {
                let sql = std::fs::read_to_string(&path).expect("a migration");

                for statement in sql.split("--> statement-breakpoint") {
                    let statement = statement.trim();

                    if let Some(rest) = statement.strip_prefix("CREATE TABLE `") {
                        let name = rest.split('`').next().unwrap_or_default();

                        if !name.starts_with("__") && name != "idmap" {
                            domain_tables.push(name.to_string());
                        }
                    }
                }
            }
        }

        assert!(
            domain_tables.len() >= 7,
            "the boundary test found almost no domain tables: {domain_tables:?}"
        );

        for domain in &domain_tables {
            assert!(
                !tables.contains(domain),
                "the rents domain table {domain} appears in the organization database"
            );
        }

        // requirement 18: the table whose absence is the requirement.
        assert!(!tables.iter().any(|table| table == "session"));
    }

    // criterion 15: what a link and a read-only credential yield

    /// Given only what a join link carries, the organization id, its verifying key and the remote,
    /// and a credential that reads every row, no username, organization name or workspace name is
    /// legible. Asserted against populated rows rather than an empty table, over the raw bytes of
    /// every column of every table.
    #[tokio::test]
    async fn a_link_holder_reads_no_username_no_organization_name_and_no_workspace_name() {
        let directory = scratch("link");
        let store = open(&directory).await;
        let chain = Chain::new();

        populated(&store, &chain).await;

        let secrets = [
            "olivia.owner",
            "sami.staff",
            "olivia",
            "sami",
            "North Properties",
            "South Properties",
            "Acme Rentals",
            "a-read-only-credential",
        ];
        let mut cells = 0;

        for table in TABLES {
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
                             database"
                        );
                    }
                }
            }
        }

        assert!(
            cells > 20,
            "the secrecy test read almost nothing: {cells} cells"
        );

        // the verified rows are readable, and still say nothing, because the link carries no
        // content key and a member's sealed copy opens only with their password.
        let members = store
            .members(&chain.verifying_key())
            .await
            .expect("the members");
        let stranger = generate_content_key().expect("a key the link does not carry");

        assert_eq!(members.len(), 2);
        assert!(
            open_content(
                &stranger,
                "member.username_sealed",
                &members[0].username_sealed
            )
            .is_err(),
            "a username opened without the organization's content key"
        );
        assert_eq!(
            open_content(
                &chain.content_key,
                "member.username_sealed",
                &members[0].username_sealed
            )
            .expect("the owner's username"),
            b"olivia.owner"
        );
    }

    // criterion 16, and the ticket's own: every write signs, every read verifies

    #[tokio::test]
    async fn what_was_written_signed_is_read_back_verified() {
        let directory = scratch("signed");
        let store = open(&directory).await;
        let chain = Chain::new();

        populated(&store, &chain).await;

        let key = chain.verifying_key();
        let members = store.members(&key).await.expect("the members");
        let grants = store.grants(&key).await.expect("the grants");
        let organization = store
            .organization()
            .await
            .expect("the organization")
            .expect("an organization row");

        assert_eq!(members[0].id, "member-owner");
        assert_eq!(members[0].role, "owner");
        assert!(!members[0].must_change_password);
        assert_eq!(members[1].role, "member");
        assert!(members[1].must_change_password);
        assert_eq!(members[1].vault.kdf_params, test_cost());
        assert_eq!(grants.len(), 2);
        assert_eq!(grants[0].access_level, "full-access");
        assert_eq!(
            grants[0].credential_expires_at.as_deref(),
            Some("1757600000000")
        );
        assert_eq!(organization.verifying_key, key);
    }

    /// **A member who writes another member's row with an altered role is rejected by every
    /// other client on read**, which is criterion 16 performed exactly: the write goes through the
    /// connection, as a full-access member's would, and the store's read refuses it by name.
    #[tokio::test]
    async fn a_row_another_member_altered_is_refused_on_read_and_named() {
        let directory = scratch("altered");
        let store = open(&directory).await;
        let chain = Chain::new();

        populated(&store, &chain).await;

        store
            .connection()
            .execute(
                "UPDATE \"member\" SET \"role\" = 'owner', \"permissions\" = 63 \
                 WHERE \"id\" = 'member-staff'",
                (),
            )
            .await
            .expect("the hostile write");

        let refusal = store
            .members(&chain.verifying_key())
            .await
            .expect_err("an altered role was read and used");

        assert!(
            refusal.to_string().contains("member-staff"),
            "the refusal does not name the row: {refusal}"
        );
        assert!(
            refusal.to_string().contains("refused"),
            "the refusal does not say so: {refusal}"
        );

        // the other tables are unaffected, and read.
        assert_eq!(
            store
                .workspaces(&chain.verifying_key())
                .await
                .expect("the workspaces")
                .len(),
            2
        );
    }

    #[tokio::test]
    async fn a_row_signed_under_a_revoked_or_unknown_certificate_is_refused() {
        let directory = scratch("revoked");
        let store = open(&directory).await;
        let chain = Chain::new();

        populated(&store, &chain).await;

        // revocation is a row: the same certificate, written back with `revoked_at` set.
        store
            .write_certificate(&chain.certificate.revoked("1757100000000"))
            .await
            .expect("the revocation");

        let refusal = store
            .grants(&chain.verifying_key())
            .await
            .expect_err("a grant under a revoked certificate was read");

        assert!(refusal.to_string().contains("revoked"), "{refusal}");

        // and a row naming a certificate nobody issued is a forgery from where a reader stands.
        store
            .connection()
            .execute(
                "UPDATE \"workspace\" SET \"certificate_id\" = 'cert-nobody' WHERE \"id\" = 'north'",
                (),
            )
            .await
            .expect("the hostile write");

        let refusal = store
            .workspaces(&chain.verifying_key())
            .await
            .expect_err("a workspace under an unknown certificate was read");

        assert!(refusal.to_string().contains("nobody issued"), "{refusal}");
        assert!(refusal.to_string().contains("north"), "{refusal}");
    }

    /// A reader verifies against the key its link pinned, so a database rewritten under another
    /// organization key, `organization.verifying_key` included, verifies for nobody who joined
    /// through a real link.
    #[tokio::test]
    async fn a_database_signed_under_another_key_verifies_for_nobody_holding_the_real_one() {
        let directory = scratch("otherkey");
        let store = open(&directory).await;
        let chain = Chain::new();
        let impostor = Chain::new();

        populated(&store, &impostor).await;

        let refusal = store
            .members(&chain.verifying_key())
            .await
            .expect_err("rows signed under another organization key were read");

        assert!(refusal.to_string().contains("member-owner"), "{refusal}");
    }

    /// **The re-signing routine, and what it buys: a certificate that signed rows can be retired
    /// without bricking them.** An administrator's certificate signs one of every kind of row.
    /// While it stands every read verifies; revoked, every read that finds one of its rows is
    /// refused (F3). Re-signed under the owner first, the same revocation refuses nothing, and a
    /// fresh row still signed under the retired certificate is refused, which is what a removed
    /// administrator's forgery is.
    #[tokio::test]
    async fn re_signing_a_certificates_rows_lets_it_be_retired_without_bricking_them() {
        use super::InvitationRecord;
        use crate::organization::vault::{INVITATION_SECRET_BYTES, seal_invitation};

        let directory = scratch("resign");
        let store = open(&directory).await;
        let chain = Chain::new();

        store
            .write_organization(&OrganizationRecord {
                id: "acme".to_string(),
                name_sealed: chain.sealed("organization.name_sealed", "Acme"),
                verifying_key: chain.verifying_key(),
                remote_url: "libsql://org-acme.turso.io".to_string(),
                link_credential_sealed: chain.sealed("organization.link_credential_sealed", "ro"),
                created_at: 1_757_000_000_000,
            })
            .await
            .expect("the organization row");
        store
            .write_certificate(&chain.certificate)
            .await
            .expect("the owner certificate");
        store
            .write_member(
                &chain.signer(),
                &chain.member("member-owner", "olivia", "owner"),
            )
            .await
            .expect("the owner member");

        // an administrator certified under the same organization key, who signs one of every kind
        // of row: a member, a workspace, a grant and an invitation.
        let admin_key = AdministratorKey::generate().expect("an administrator key");
        let admin_certificate = issue_certificate(
            &chain.organization_key,
            "cert-admin",
            "member-admin",
            &admin_key.verifying_key(),
            "1757000000000",
        );

        store
            .write_certificate(&admin_certificate)
            .await
            .expect("the administrator certificate");

        let admin_signer = Signer {
            key: &admin_key,
            certificate: &admin_certificate,
        };

        store
            .write_member(
                &admin_signer,
                &chain.member("member-x", "member-x", "member"),
            )
            .await
            .expect("member-x");
        store
            .write_workspace(&admin_signer, &chain.workspace("w", "W"))
            .await
            .expect("the workspace");
        store
            .write_grant(
                &admin_signer,
                &GrantRecord {
                    member_id: "member-x".to_string(),
                    workspace_id: "w".to_string(),
                    sealed_credential: b"a sealed credential".to_vec(),
                    access_level: "full-access".to_string(),
                    credential_expires_at: None,
                },
            )
            .await
            .expect("the grant");

        let sealed = seal_invitation(
            &[7_u8; INVITATION_SECRET_BYTES],
            "a-generated-password",
            test_cost(),
            b"a payload",
        )
        .expect("a sealed invitation");

        store
            .write_invitation(
                &admin_signer,
                &InvitationRecord {
                    id: "inv-1".to_string(),
                    member_id: "member-x".to_string(),
                    sealed,
                    expires_at: 1_757_600_000_000,
                    consumed_at: None,
                    created_at: 1_757_000_000_000,
                },
            )
            .await
            .expect("the invitation");

        let key = chain.verifying_key();

        // everything verifies while the certificate stands.
        assert_eq!(store.members(&key).await.expect("members").len(), 2);
        assert_eq!(store.workspaces(&key).await.expect("workspaces").len(), 1);
        assert_eq!(store.grants(&key).await.expect("grants").len(), 1);
        assert_eq!(store.invitations(&key).await.expect("invitations").len(), 1);

        // F3: revoked without re-signing first, every read that finds one of its rows is refused.
        store
            .write_certificate(&admin_certificate.revoked("1757100000000"))
            .await
            .expect("the revocation");

        let refusal = store
            .members(&key)
            .await
            .expect_err("a row under a revoked certificate was read");

        assert!(refusal.to_string().contains("revoked"), "{refusal}");
        assert!(refusal.to_string().contains("member-x"), "{refusal}");

        // restore the certificate, re-sign its rows under the owner, then revoke: nothing bricks,
        // and one of every kind of row moved.
        store
            .write_certificate(&admin_certificate)
            .await
            .expect("un-revoke");

        let moved = store
            .re_sign_rows_of_certificate(&key, "cert-admin", &chain.signer())
            .await
            .expect("the re-sign");

        assert_eq!(moved, 4, "one of every kind of row was re-signed");

        store
            .write_certificate(&admin_certificate.revoked("1757100000000"))
            .await
            .expect("the revocation, again");

        assert_eq!(store.members(&key).await.expect("members after").len(), 2);
        assert_eq!(
            store
                .workspaces(&key)
                .await
                .expect("workspaces after")
                .len(),
            1
        );
        assert_eq!(store.grants(&key).await.expect("grants after").len(), 1);
        assert_eq!(
            store
                .invitations(&key)
                .await
                .expect("invitations after")
                .len(),
            1
        );

        // a fresh row still signed under the retired certificate is refused: re-signing moved the
        // old rows, it did not resurrect the certificate.
        store
            .write_member(
                &Signer {
                    key: &admin_key,
                    certificate: &admin_certificate.revoked("1757100000000"),
                },
                &chain.member("member-y", "member-y", "member"),
            )
            .await
            .expect("the hostile write");

        let refusal = store
            .members(&key)
            .await
            .expect_err("a fresh row under the revoked certificate was read");

        assert!(refusal.to_string().contains("revoked"), "{refusal}");

        // and the routine refuses to re-sign a certificate's rows onto itself.
        assert!(
            store
                .re_sign_rows_of_certificate(&key, &chain.certificate.id, &chain.signer())
                .await
                .is_err(),
            "a certificate re-signed its own rows onto itself"
        );
    }

    #[test]
    fn a_replica_is_named_for_its_organization_beside_the_workspaces() {
        let base = std::path::Path::new("C:/rentable/app.db");

        let path = OrganizationStore::replica_path(base, "acme");

        assert_eq!(path.parent(), base.parent());
        assert_eq!(
            path.file_name().and_then(|name| name.to_str()),
            Some("org-acme.db")
        );
        assert_ne!(path, crate::database::Database::replica_path(base, "acme"));
    }

    // the plan's untested capability: two synced databases open at once

    /// **Two `turso::sync` engines are open at once and work is done on both.** The plan records
    /// this as an untested capability of `turso` 0.8.0-pre.7 that would first appear as a hang on
    /// turso's IO thread. Both engines here have no remote, which is the construction the
    /// application runs offline; the live test below does the same with two remotes.
    #[tokio::test]
    async fn the_organization_replica_and_a_workspace_replica_are_open_at_once() {
        let directory = scratch("two");
        let store = open(&directory).await;
        let chain = Chain::new();

        let workspace = crate::database::Database::open_replica(
            &directory.join("ws-north.db"),
            None,
            || async { Ok::<String, turso::Error>(String::new()) },
        )
        .await
        .expect("the workspace replica");
        let ledger = workspace.connect().await.expect("the workspace connection");

        // interleaved work on both, so neither engine is idle while the other is used.
        ledger
            .execute(
                "CREATE TABLE complex (id TEXT PRIMARY KEY, name TEXT NOT NULL)",
                (),
            )
            .await
            .expect("the workspace schema");
        populated(&store, &chain).await;
        ledger
            .execute(
                "INSERT INTO complex (id, name) VALUES ('c1', 'North Tower')",
                (),
            )
            .await
            .expect("a workspace row");

        let members = store
            .members(&chain.verifying_key())
            .await
            .expect("the members");
        let mut rows = ledger
            .query("SELECT count(*) FROM complex", ())
            .await
            .expect("the count");
        let row = rows.next().await.expect("a row").expect("one row");

        assert_eq!(members.len(), 2);
        assert_eq!(super::integer(&row, 0).expect("a count"), 1);
        assert_eq!(store.tables().await.expect("the tables").len(), 7);
    }

    /// Live, at the human's request: **machine A writes, machine B reads it back**, against a
    /// database this run provisions through `sync/turso/platform.rs` and removes at the end.
    /// Admitted by name in [[rules/testing]] under *Tests that reach a live remote*, as the sixth
    /// property: whether the organization lives on the remote rather than on the machine that made
    /// it. `#[ignore]`, and it panics rather than skipping when its variables are absent, for the
    /// reason `sync/turso/discovery.rs` gives.
    ///
    /// ```text
    /// RENTABLE_LIVE_TURSO=1 TURSO_CONSENT_TOKEN=… TURSO_ORG=… TURSO_GROUP=… \
    ///   cargo test --manifest-path ./apps/desktop/tauri/Cargo.toml \
    ///   organization_live -- --test-threads=1 --ignored --nocapture
    /// ```
    #[tokio::test]
    #[ignore = "reaches a live Turso account and creates a database; see the doc comment"]
    async fn organization_live_a_second_machine_reads_what_the_first_wrote() {
        use crate::sync::turso::{
            consent::store_platform_token,
            discovery::TursoOrganization,
            platform::{DeletionIntent, PlatformApi, PlatformEndpoint, TursoPlatform},
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
        let name = format!("t819-08-{nonce:x}");

        let database = platform
            .create_database(&name)
            .await
            .expect("the live create failed");
        let token = platform
            .mint_token(
                &name,
                "1h",
                crate::sync::turso::platform::AccessLevel::FullAccess,
            )
            .await
            .expect("the live mint failed");
        let remote_url = format!("libsql://{}", database.hostname);

        eprintln!("created {name} at {remote_url}");

        let chain = Chain::new();
        let machine_a = scratch("live-a");
        let machine_b = scratch("live-b");

        let token_for = |token: String| {
            move || {
                let token = token.clone();
                async move { Ok::<String, turso::Error>(token) }
            }
        };

        // machine A: schema, rows, push.
        let store_a = OrganizationStore::open(
            &machine_a.join("org-live.db"),
            Some(remote_url.clone()),
            token_for(token.clone()),
        )
        .await
        .expect("machine A's replica");

        store_a.install_schema().await.expect("the schema on A");
        populated(&store_a, &chain).await;

        assert!(store_a.push().await, "machine A could not push");

        // machine B: a fresh directory, a pull, and the rows verified against the pinned key.
        let store_b = OrganizationStore::open(
            &machine_b.join("org-live.db"),
            Some(remote_url.clone()),
            token_for(token.clone()),
        )
        .await
        .expect("machine B's replica");

        assert!(store_b.pull().await, "nothing arrived on machine B");

        let members = store_b
            .members(&chain.verifying_key())
            .await
            .expect("machine B could not read the members");
        let workspaces = store_b
            .workspaces(&chain.verifying_key())
            .await
            .expect("machine B could not read the workspaces");

        assert_eq!(
            members.len(),
            2,
            "machine B did not read what machine A wrote"
        );
        assert_eq!(workspaces.len(), 2);
        assert_eq!(
            open_content(
                &chain.content_key,
                "member.username_sealed",
                &members[1].username_sealed
            )
            .expect("the sealed username did not survive the round trip"),
            b"sami.staff"
        );

        eprintln!(
            "machine B read {} members and {} workspaces",
            members.len(),
            workspaces.len()
        );

        // both engines are open against real remotes at this point, and both worked.
        drop(store_a);
        drop(store_b);

        platform
            .delete_database(&name, DeletionIntent::CreatedAndUnreferenced)
            .await
            .expect("the live delete failed, and the database is left behind");

        eprintln!("removed {name}");
    }
}
