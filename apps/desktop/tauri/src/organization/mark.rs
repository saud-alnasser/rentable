//! The one image an organization prints on its pages: a signature, or a seal.
//!
//! A receipt handed to a tenant carries the landlord's signature or seal (effort 835, requirement
//! 13), so the organization keeps one image, and every receipt and schedule it prints draws it at
//! the foot. It is the one row of `mark` in the organization database, the image sealed under the
//! content key as a workspace's name is, so every member's machine reads it after its pull,
//! offline included, and nobody outside the organization reads it at all.
//!
//! **Whoever carries `manageMark` sets it, and signs it** (effort 838, requirement 1). The gate
//! asks the flag of the verified row first, so a member without it is refused with a sentence
//! naming it; then the row is signed under the setter's certificate like every row that carries
//! authority, and read back only where the signature verifies and the certificate carries
//! `manageMark` (`authority::covers`). A member holds the database's credential and could write
//! the row directly, and an image printed as the organization's signature is worth forging: a row
//! no certificate carrying the flag signed is treated as no mark at all.
//!
//! *It was the owner's or an administrator's by the role word until effort 838, which made it a
//! flag the owner and the manager carry by default and any role or override may give.*
//!
//! **What is stored is checked by its bytes, not its name.** The file the open dialog chose is read
//! by the command, so an image never crosses the IPC boundary on its way in; anything over 512 KB,
//! or whose first bytes are not a PNG, a JPEG or a WebP, is refused before anything is written.

use serde::Serialize;

use base64::Engine;

use crate::error::{Error, RefusalReason};

use super::{
    permission::{self, Flag},
    session::{MemberSession, permissions_on_row},
    store::{MarkRecord, OrganizationStore, Signer},
    vault::{open_content, seal_content},
    workspace::signer_of,
};

/// The most a mark may weigh. A signature or a seal scanned for print is well under it, and it
/// is carried to every member's machine.
pub const MARK_LIMIT_BYTES: usize = 512 * 1024;

/// The column the image is sealed for, which binds the sealed bytes to where they are kept.
const COLUMN: &str = "mark.image_sealed";

/// The mark as the web layer draws it: what kind of image it is, and the image itself.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarkFacts {
    pub media_type: String,
    /// the image, base64, as an `img` takes it in a `data:` address.
    pub data: String,
}

/// What kind of image these bytes are, read from their first bytes, or nothing where they are
/// none of the three a mark may be.
pub fn media_type_of(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]) {
        Some("image/png")
    } else if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        Some("image/jpeg")
    } else if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        Some("image/webp")
    } else {
        None
    }
}

/// The refusal for a file of `length` bytes, over what a mark may weigh. Asked before the file is
/// read, so a file far past the limit is refused without being read into memory.
pub fn check_length(length: u64) -> Result<(), Error> {
    if length > MARK_LIMIT_BYTES as u64 {
        return Err(Error::refused(
            RefusalReason::MarkTooLarge,
            format!(
                "the image is {} KB, over the {} KB a mark may be",
                length.div_ceil(1024),
                MARK_LIMIT_BYTES / 1024
            ),
        ));
    }

    Ok(())
}

/// The refusal for an image this module will not keep, or its kind where it will keep it.
pub fn check_image(bytes: &[u8]) -> Result<&'static str, Error> {
    check_length(bytes.len() as u64)?;

    media_type_of(bytes).ok_or_else(|| {
        Error::refused(
            RefusalReason::MarkNotAnImage,
            "the file is not a PNG, JPEG or WebP image",
        )
    })
}

/// The organization's mark, opened, or nothing where none is set. Any signed-in member reads it.
///
/// **A row that does not verify is no mark.** It is never printed as the organization's, and the
/// reason is written to diagnostics rather than put in front of the reader, who can do nothing
/// about it but set the mark again.
pub async fn read_mark(
    store: &OrganizationStore,
    session: &MemberSession,
) -> Result<Option<MarkFacts>, Error> {
    session.settled()?;

    let mark = match store.mark(&session.verifying_key).await {
        Ok(Some(mark)) => mark,
        Ok(None) => return Ok(None),
        Err(Error::Integrity { message }) => {
            crate::diagnostics::warn("organization.mark.refused")
                .with("reason", &message)
                .write();

            return Ok(None);
        }
        Err(error) => return Err(error),
    };
    let image = open_content(&session.content_key, COLUMN, &mark.image_sealed)?;

    Ok(Some(MarkFacts {
        media_type: mark.media_type,
        data: base64::engine::general_purpose::STANDARD.encode(image),
    }))
}

/// Keep `image` as the organization's mark, signed by whoever sets it, replacing any there was,
/// and send it.
pub async fn set_mark(
    store: &OrganizationStore,
    session: &MemberSession,
    image: &[u8],
    now: i64,
) -> Result<MarkFacts, Error> {
    session.settled()?;
    permission::require(permissions_on_row(store, session).await?, Flag::ManageMark)?;

    let media_type = check_image(image)?;
    let (key, certificate) = signer_of(store, session).await?;

    store
        .write_mark(
            &Signer {
                key: &key,
                certificate: &certificate,
            },
            &MarkRecord {
                image_sealed: seal_content(&session.content_key, COLUMN, image)?,
                media_type: media_type.to_string(),
                updated_by: session.member_id.clone(),
                updated_at: now,
            },
        )
        .await?;

    if !store.push().await {
        crate::diagnostics::warn("organization.mark.notYetSent").write();
    }

    Ok(MarkFacts {
        media_type: media_type.to_string(),
        data: base64::engine::general_purpose::STANDARD.encode(image),
    })
}

/// Remove the organization's mark, and send that.
pub async fn clear_mark(store: &OrganizationStore, session: &MemberSession) -> Result<(), Error> {
    session.settled()?;
    permission::require(permissions_on_row(store, session).await?, Flag::ManageMark)?;

    store.clear_mark().await?;

    if !store.push().await {
        crate::diagnostics::warn("organization.mark.removalNotYetSent").write();
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use serde_json::json;

    use super::*;
    use crate::{
        organization::{
            HeldOrganization,
            authority::{AdministratorKey, Issue, certificate_id, issue_certificate},
            session::{CredentialSlot, sign_in},
            setup::{CreateOrganization, Remote, create_organization},
            store::MemberRecord,
            vault::{KdfParams, MemberSecretKey, create_vault_with_secret, seal_to_public_key},
        },
        persisted::Persisted,
        sync::{
            RemoteSyncStore,
            test::server::{ScriptedResponse, ScriptedServer},
            turso::{discovery::McpEndpoint, platform::InMemoryPlatform},
        },
    };

    const PASSWORD: &str = "the owners password";
    const OTHER_PASSWORD: &str = "the members password";
    const PNG: &[u8] = &[
        0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 13, 1, 2,
    ];

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
        let directory = std::env::temp_dir().join(format!("rentable-mark-{name}-{nanos:x}"));
        std::fs::create_dir_all(&directory).expect("scratch directory");

        directory
    }

    fn slot() -> CredentialSlot {
        Arc::new(Mutex::new(None))
    }

    fn signing_key_of(secret: &MemberSecretKey) -> [u8; 32] {
        AdministratorKey::from_bytes(
            &secret
                .derive_seed(crate::organization::setup::ADMINISTRATOR_KEY_PURPOSE)
                .expect("the signing seed"),
        )
        .verifying_key()
    }

    /// An organization a first run made on this machine, and its owner signed in.
    async fn owned(
        directory: &std::path::Path,
    ) -> (OrganizationStore, HeldOrganization, MemberSession) {
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
                group: None,
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

        (organization, joined, session)
    }

    /// Another account in the organization under `role`, written by the owner, and signed in.
    /// **Everybody is certified**, as the delegated chain certifies every live member: a
    /// certificate issued from the owner's, carrying what the role and the override give them and
    /// the role's rank, so the rows they sign verify where it covers them and nowhere else.
    async fn another(
        store: &OrganizationStore,
        owner: &MemberSession,
        id: &str,
        role: &str,
        override_mask: i64,
    ) -> MemberSession {
        let (key, certificate) = signer_of(store, owner).await.expect("the signer");
        let (vault, secret) =
            create_vault_with_secret(OTHER_PASSWORD, test_cost()).expect("a vault");
        let signing_public_key = signing_key_of(&secret);

        store
            .write_member(
                &Signer {
                    key: &key,
                    certificate: &certificate,
                },
                &MemberRecord {
                    id: id.to_string(),
                    username_sealed: seal_content(
                        &owner.content_key,
                        "member.username_sealed",
                        id.as_bytes(),
                    )
                    .expect("sealed"),
                    sealed_content_key: seal_to_public_key(
                        &vault.public_key,
                        &owner.content_key.to_bytes(),
                    )
                    .expect("sealed"),
                    vault,
                    signing_public_key,
                    role_id: permission::role_id_of_word(role).to_string(),
                    override_mask,
                    removed_at: None,
                    effective: 0,
                    must_change_password: false,
                    created_at: 1_757_000_000_000,
                    updated_at: 1_757_000_000_000,
                    session_epoch: 0,
                    owner_seed_sealed: None,
                },
            )
            .await
            .expect("the member");

        let (mask, rank) = store
            .role_standing(&owner.verifying_key, permission::role_id_of_word(role))
            .await
            .expect("the role");

        store
            .write_certificate(
                &issue_certificate(
                    &key,
                    &certificate,
                    Issue {
                        id: &certificate_id(id, "1757000000000"),
                        member_id: id,
                        signing_public_key: &signing_public_key,
                        ceiling: permission::effective(mask, override_mask),
                        rank,
                        issued_at: "1757000000000",
                    },
                )
                .expect("the certificate"),
            )
            .await
            .expect("the certificate");

        let held = HeldOrganization {
            id: owner.organization_id.clone(),
            name: "Acme".to_string(),
            verifying_key: base64::Engine::encode(
                &base64::engine::general_purpose::URL_SAFE_NO_PAD,
                owner.verifying_key,
            ),
            remote_url: String::new(),
            machine_id: "machine-one".to_string(),
            member_id: Some(id.to_string()),
            role: Some(role.to_string()),
            joined_at: 1_757_000_000_001,
        };

        sign_in(store, &held, OTHER_PASSWORD, &slot())
            .await
            .expect("they did not sign in")
    }

    #[test]
    fn an_image_is_known_by_its_first_bytes() {
        assert_eq!(media_type_of(PNG), Some("image/png"));
        assert_eq!(media_type_of(&[0xFF, 0xD8, 0xFF, 0xE0]), Some("image/jpeg"));
        assert_eq!(
            media_type_of(b"RIFF\x10\x00\x00\x00WEBPVP8 "),
            Some("image/webp")
        );
        assert_eq!(media_type_of(b"%PDF-1.7"), None);
        assert_eq!(media_type_of(b"GIF89a"), None);
    }

    #[test]
    fn an_image_over_the_limit_or_of_another_kind_is_refused_with_its_reason() {
        let mut large = PNG.to_vec();
        large.resize(MARK_LIMIT_BYTES + 1, 0);

        assert!(matches!(
            check_image(&large),
            Err(Error::Refused {
                reason: RefusalReason::MarkTooLarge,
                ..
            })
        ));
        assert!(matches!(
            check_length(3 * 1024 * 1024 * 1024),
            Err(Error::Refused {
                reason: RefusalReason::MarkTooLarge,
                ..
            })
        ));
        assert!(matches!(
            check_image(b"%PDF-1.7"),
            Err(Error::Refused {
                reason: RefusalReason::MarkNotAnImage,
                ..
            })
        ));

        let mut largest = PNG.to_vec();
        largest.resize(MARK_LIMIT_BYTES, 0);

        assert_eq!(check_image(&largest).expect("at the limit"), "image/png");
    }

    #[tokio::test]
    async fn the_owner_and_a_manager_set_and_clear_the_mark_sealed_and_signed() {
        let directory = scratch("roles");
        let (store, _, owner) = owned(&directory).await;

        assert_eq!(read_mark(&store, &owner).await.expect("the read"), None);

        let set = set_mark(&store, &owner, PNG, 1_757_000_000_001)
            .await
            .expect("the owner could not set the mark");

        assert_eq!(set.media_type, "image/png");
        assert_eq!(
            read_mark(&store, &owner).await.expect("the read"),
            Some(set)
        );

        let stored = store
            .mark(&owner.verifying_key)
            .await
            .expect("the row verifies")
            .expect("a mark");

        assert_ne!(
            stored.image_sealed, PNG,
            "the image was stored in the clear"
        );
        assert_eq!(stored.updated_by, owner.member_id);

        let manager = another(&store, &owner, "member-admin", permission::ADMINISTRATOR, 0).await;

        set_mark(
            &store,
            &manager,
            &[0xFF, 0xD8, 0xFF, 0xE0],
            1_757_000_000_002,
        )
        .await
        .expect("a manager could not replace the mark");
        assert_eq!(
            read_mark(&store, &owner)
                .await
                .expect("the read")
                .expect("a mark")
                .media_type,
            "image/jpeg"
        );

        clear_mark(&store, &manager)
            .await
            .expect("a manager could not remove the mark");
        assert_eq!(read_mark(&store, &owner).await.expect("the read"), None);
    }

    #[tokio::test]
    async fn a_member_reads_the_mark_and_is_refused_changing_it() {
        let directory = scratch("member");
        let (store, _, owner) = owned(&directory).await;
        let set = set_mark(&store, &owner, PNG, 1_757_000_000_001)
            .await
            .expect("the owner could not set the mark");
        let member = another(&store, &owner, "member-b", permission::MEMBER, 0).await;

        assert_eq!(
            read_mark(&store, &member).await.expect("the read"),
            Some(set)
        );

        for refusal in [
            set_mark(&store, &member, PNG, 1_757_000_000_002)
                .await
                .map(|_| ())
                .expect_err("a member set the mark"),
            clear_mark(&store, &member)
                .await
                .expect_err("a member removed the mark"),
        ] {
            assert!(
                matches!(
                    refusal,
                    Error::Refused {
                        reason: RefusalReason::RoleLacksAct,
                        ..
                    }
                ),
                "{refusal:?}"
            );
        }

        assert!(read_mark(&store, &owner).await.expect("the read").is_some());
    }

    /// **The mark is `manageMark`, not a role** (effort 838). A manager whose override switches the
    /// flag off is refused setting and clearing it, naming the flag, and a member whose override
    /// switches it on sets and clears it, the row they sign verifying on read because their
    /// certificate carries the flag.
    #[tokio::test]
    async fn setting_and_clearing_the_mark_follow_manage_mark_and_not_the_role() {
        let directory = scratch("flag");
        let (store, _, owner) = owned(&directory).await;
        let manage_mark = permission::mask_of(&[Flag::ManageMark]);
        let narrowed = another(
            &store,
            &owner,
            "member-admin",
            permission::ADMINISTRATOR,
            manage_mark,
        )
        .await;
        let widened = another(&store, &owner, "member-b", permission::MEMBER, manage_mark).await;

        assert!(!permission::permits(narrowed.permissions, Flag::ManageMark));
        assert!(permission::permits(widened.permissions, Flag::ManageMark));

        for refusal in [
            set_mark(&store, &narrowed, PNG, 1_757_000_000_001)
                .await
                .map(|_| ())
                .expect_err("a manager without manageMark set the mark"),
            clear_mark(&store, &narrowed)
                .await
                .expect_err("a manager without manageMark removed the mark"),
        ] {
            assert!(
                matches!(
                    refusal,
                    Error::Refused {
                        reason: RefusalReason::RoleLacksAct,
                        ref message,
                    } if message.contains("manageMark")
                ),
                "{refusal:?}"
            );
        }

        assert_eq!(read_mark(&store, &owner).await.expect("the read"), None);

        let set = set_mark(&store, &widened, PNG, 1_757_000_000_002)
            .await
            .expect("a member holding manageMark could not set the mark");

        assert_eq!(
            read_mark(&store, &owner).await.expect("the read"),
            Some(set),
            "the mark a holder of manageMark signed did not verify"
        );

        clear_mark(&store, &widened)
            .await
            .expect("a member holding manageMark could not remove the mark");
        assert_eq!(read_mark(&store, &owner).await.expect("the read"), None);
    }

    /// The finding that made the mark a signed row: a member holds the database's credential and
    /// the content key, so they can write the row straight into the database. What they write is
    /// signed by nobody with a certificate, and it is read as no mark rather than printed.
    #[tokio::test]
    async fn a_mark_written_around_the_gate_is_never_read_as_the_organizations() {
        let directory = scratch("forged");
        let (store, _, owner) = owned(&directory).await;
        let member = another(&store, &owner, "member-b", permission::MEMBER, 0).await;
        let forged = seal_content(&member.content_key, COLUMN, PNG).expect("sealed");

        store
            .connection()
            .execute(
                "INSERT OR REPLACE INTO \"mark\" \
                 (\"id\", \"image_sealed\", \"media_type\", \"updated_by\", \"updated_at\", \
                  \"certificate_id\", \"signature\") \
                 VALUES ('mark', ?, 'image/png', ?, 1757000000003, ?, ?)",
                vec![
                    turso::Value::Blob(forged),
                    turso::Value::Text(owner.member_id.clone()),
                    turso::Value::Text(
                        signer_of(&store, &owner)
                            .await
                            .expect("the owner's certificate")
                            .1
                            .id,
                    ),
                    turso::Value::Blob(vec![0; 64]),
                ],
            )
            .await
            .expect("the forged row");

        assert_eq!(read_mark(&store, &member).await.expect("the read"), None);
        assert_eq!(read_mark(&store, &owner).await.expect("the read"), None);
    }

    #[tokio::test]
    async fn a_mark_set_on_one_machine_is_read_from_another_machines_replica() {
        let directory = scratch("elsewhere");
        let (store, joined, owner) = owned(&directory).await;

        set_mark(&store, &owner, PNG, 1_757_000_000_001)
            .await
            .expect("the owner could not set the mark");

        // another machine's replica, as a pull leaves it: the organization's files copied across.
        let elsewhere = scratch("other-machine");

        for entry in std::fs::read_dir(&directory).expect("the directory") {
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

        let theirs = OrganizationStore::open(
            &OrganizationStore::replica_path(&elsewhere.join("app.db"), &joined.id),
            None,
            || async { Err(turso::Error::Misuse("no remote".into())) },
        )
        .await
        .expect("their replica did not open");
        let mark = theirs
            .mark(&owner.verifying_key)
            .await
            .expect("the row verifies there")
            .expect("the mark did not arrive");

        assert_eq!(
            open_content(&owner.content_key, COLUMN, &mark.image_sealed).expect("the image"),
            PNG
        );
    }
}
