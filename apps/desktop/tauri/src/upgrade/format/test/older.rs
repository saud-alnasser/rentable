//! an organization of format 1, as the build before effort 838 left it, written the way that
//! build wrote it: its schema, its people and their vaults, and every row signed under format 1's
//! rules (ticket 29 moved it here from the foot of the runner). What a finished upgrade of it
//! leaves is [`assert_upgraded`], and what a member does to make an upgraded one look older is
//! [`made_to_look_older`].

use std::{
    collections::HashMap,
    path::{Path, PathBuf},
};

use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD as BASE64URL};

use crate::organization::{
    HeldOrganization,
    authority::{
        AdministratorKey, Authority, Chain, FormatOneCertificate, GrantAuthority,
        InvitationAuthority, MarkAuthority, OrganizationKey, SuccessionAuthority,
        WorkspaceAuthority, sign_succession,
    },
    member::vault::{
        ContentKey, KdfParams, MemberKey, MemberSecretKey, Vault, create_vault_with_secret_and_key,
        generate_content_key, open_content, seal_content, seal_to_public_key,
    },
    role::permission::{self, Flag, MANAGER_ROLE, MEMBER_ROLE, OWNER_ROLE},
    setup::{ADMINISTRATOR_KEY_PURPOSE, owner_key_from},
    store::{FORMAT_VERSION, OrganizationStore, SuccessionRecord},
};
use crate::test::scratch;
use crate::upgrade::format::{
    chain::FORMAT_ONE_ACTS,
    runner::Opened,
    signature::{FormatOneMember, FormatOneRow, issue_format_one_certificate, sign_format_one},
};

pub(crate) const ORGANIZATION_ID: &str = "7f3a";
pub(crate) const NOW: i64 = 1_758_000_000_000;
pub(crate) const EARLIER: i64 = 1_757_000_000_000;
pub(crate) const ORGANIZATION_CREDENTIAL: &str = "the-organization-credential";
/// mina's own grant on the organization database: a credential of her own, so a test can tell
/// which grant a machine pulled with.
pub(crate) const MINAS_CREDENTIAL: &str = "minas-organization-credential";

/// The schema of format 1, as the build before effort 838 creates it: every table the build before effort
/// 838 made, the role word and the seven-act mask on the member row, and
/// `administrator_certificate` with its unsigned `revoked_at`. Written out rather than read
/// from anywhere, because nothing in this build writes it any more.
pub(crate) const FORMAT_ONE_SCHEMA: [&str; 11] = [
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

// the seven acts of format 1, as the build before effort 838 numbered them in `permission::Administration`.
pub(crate) const INVITE_MEMBER: i64 = 1 << 0;
pub(crate) const REMOVE_MEMBER: i64 = 1 << 1;
pub(crate) const CHANGE_ROLE: i64 = 1 << 2;
pub(crate) const RENAME_WORKSPACE: i64 = 1 << 3;
pub(crate) const RENAME_MEMBER: i64 = 1 << 5;
pub(crate) const GRANT_WORKSPACE: i64 = 1 << 6;

/// The cheapest vault cost Argon2id takes, so a test seals in milliseconds.
pub(crate) fn test_cost() -> KdfParams {
    KdfParams {
        memory_kib: 1024,
        iterations: 2,
        lanes: 1,
    }
}

/// One person in the older organization: their vault, the key it was opened with, and the
/// signing key its secret derives.
pub(crate) struct Person {
    pub(crate) id: &'static str,
    pub(crate) username: &'static str,
    pub(crate) password: &'static str,
    pub(crate) vault: Vault,
    pub(crate) secret: MemberSecretKey,
    pub(crate) member_key: MemberKey,
    pub(crate) signing: AdministratorKey,
    pub(crate) role: &'static str,
    pub(crate) permissions: i64,
    pub(crate) session_epoch: i64,
    pub(crate) must_change_password: bool,
}

impl Person {
    /// A person of the fixture, with a vault sealed under the password their id gives them.
    pub(crate) fn new(
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
pub(crate) struct Older {
    pub(crate) directory: PathBuf,
    pub(crate) path: PathBuf,
    pub(crate) held: HeldOrganization,
    pub(crate) organization_key: OrganizationKey,
    pub(crate) content_key: ContentKey,
    pub(crate) people: HashMap<&'static str, Person>,
    pub(crate) certificates: HashMap<&'static str, FormatOneCertificate>,
}

impl Older {
    /// The person of the fixture with this id.
    pub(crate) fn person(&self, id: &str) -> &Person {
        self.people.get(id).expect("a person of the fixture")
    }

    /// The format 1 certificate the fixture issued this person.
    pub(crate) fn certificate(&self, id: &str) -> &FormatOneCertificate {
        self.certificates
            .get(id)
            .expect("a certificate of the fixture")
    }

    /// The organization key a machine of this organization pinned.
    pub(crate) fn pinned(&self) -> [u8; 32] {
        self.organization_key.verifying_key()
    }

    /// The record a machine this person signed in on keeps.
    pub(crate) fn held_by(&self, id: &str) -> HeldOrganization {
        HeldOrganization {
            member_id: Some(id.to_string()),
            ..self.held.clone()
        }
    }

    /// The organization's replica on this machine, with no remote.
    pub(crate) async fn open(&self) -> OrganizationStore {
        OrganizationStore::open(crate::clock::System::shared(), &self.path, None, || async {
            Ok::<String, turso::Error>(String::new())
        })
        .await
        .expect("the replica")
    }

    /// What the owner's vault opens, as the sign-in hands it to the upgrade.
    pub(crate) fn owners_vault(&self) -> Opened {
        Opened {
            member_id: "owner".to_string(),
            secret: owner_secret(self),
        }
    }
}

/// The secret the owner's password opens their vault to.
pub(crate) fn owner_secret(older: &Older) -> MemberSecretKey {
    let owner = older.person("owner");

    crate::organization::member::vault::open_vault(owner.password, &owner.vault)
        .expect("the owner's vault")
}

/// Run one statement on the replica, as the old build or somebody around the store would.
pub(crate) async fn run(store: &OrganizationStore, sql: &str, values: Vec<turso::Value>) {
    store
        .connection()
        .execute(sql, values)
        .await
        .unwrap_or_else(|error| panic!("{sql}: {error}"));
}

/// A text value for a statement.
pub(crate) fn text(value: &str) -> turso::Value {
    turso::Value::Text(value.to_string())
}

/// A blob value for a statement.
pub(crate) fn bytes(value: &[u8]) -> turso::Value {
    turso::Value::Blob(value.to_vec())
}

/// Write a format 1 certificate row as the old build wrote it.
pub(crate) async fn write_certificate(
    store: &OrganizationStore,
    certificate: &FormatOneCertificate,
) {
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
pub(crate) async fn write_member(
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
pub(crate) async fn write_grant(
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
pub(crate) async fn write_workspace(
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
pub(crate) async fn write_invitation(
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
pub(crate) async fn write_mark(
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
pub(crate) async fn older(name: &str) -> Older {
    let directory = scratch(name);
    let path = OrganizationStore::replica_path(&directory.join("app.db"), ORGANIZATION_ID);
    let store = OrganizationStore::open(crate::clock::System::shared(), &path, None, || async {
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
        machine_signed_out: 0,
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
pub(crate) async fn another_machine(from: &Path) -> OrganizationStore {
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
        crate::clock::System::shared(),
        &OrganizationStore::replica_path(&elsewhere.join("app.db"), ORGANIZATION_ID),
        None,
        || async { Err(turso::Error::Misuse("no remote".into())) },
    )
    .await
    .expect("their replica did not open")
}

/// The mask of these flags.
pub(crate) fn mask(flags: &[Flag]) -> i64 {
    permission::mask_of(flags)
}

/// Every record flag, delete included: what the old build let every member do.
pub(crate) fn records() -> i64 {
    mask(&permission::RECORD_FLAGS)
}

/// What each member of the fixture ends with, as the plan's *Migration* maps them.
pub(crate) fn expected_effective(id: &str) -> i64 {
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
/// on another machine holding no key but the pinned one: the shipped format and nothing of
/// format 1; every member where they could stand before; one live certificate each, under the id
/// format 1 gave it; and every workspace, grant, invitation and the mark verified.
pub(crate) async fn assert_upgraded(store: &OrganizationStore, older: &Older, pinned: &[u8; 32]) {
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

/// What a member holding the credential does to an upgraded organization to make it look
/// older, every step of it through the database: the `format` row deleted; format 1's
/// certificate table made again, holding the owner's genuine format 1 certificate; the role
/// word and the mask put back on the member table; and a promotion mina once held under
/// format 1, administrator with every act, signed by the owner, replayed onto her row.
pub(crate) async fn made_to_look_older(older: &Older, store: &OrganizationStore) {
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
