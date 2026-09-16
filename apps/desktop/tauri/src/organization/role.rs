//! what a member may do, changed from their row: the role they are called, the acts they carry,
//! and the certificate that follows both.
//!
//! **The role is a name and the permissions are the truth** (effort 826, requirement 6). A role is
//! the bundle somebody was invited as and the word the members list shows; what a command asks
//! before it acts is the number on the verified row, so widening and narrowing are writes to that
//! number and the role travels with them as the label.
//!
//! **Giving somebody an act that signs rows is the owner's alone.** Six of the seven acts write a
//! signed row, and a row is only accepted from a member a certificate names; only the owner's
//! vault derives the organization key that issues one. So a holder of `changeRole` who is not the
//! owner narrows anybody and widens only with `renameWorkspace`, the one act that signs nothing
//! (`workspace::rename_workspace` writes the sealed name outside the signature), and the refusal
//! names the owner. *Rejected in the plan: sealing the organization key into every
//! administrator's vault, which is a second master secret that a removal cannot rotate off the
//! replica already on somebody's disk.*
//!
//! **The certificate follows the permissions, in the same call.** A member gaining their first
//! signing act is issued `cert-<member id>` over the `signing_public_key` their row has carried
//! since it was written; a member losing their last has the rows their certificate signed
//! re-signed under the actor and the certificate written back revoked, which is the pair
//! `removal::retire_member` performs and this reuses rather than repeats
//! (`store::re_sign_rows_of_certificate`, `Certificate::revoked`). `workspace::signer_of` is
//! untouched: a widened member signs because a certificate names their key, never because
//! something read their role.
//!
//! **Nobody changes their own row and nobody changes the owner's.** The first keeps the act an act
//! on somebody else, so an administrator cannot grant themselves what they were not given; the
//! second is requirement 6's, and the organization is the owner's.

use crate::{diagnostics, error::Error};

use super::{
    authority::{OrganizationKey, issue_certificate},
    invite::{MemberFacts, members},
    permission::{self, Administration},
    session::{MemberSession, acting_row, permissions_on_row},
    setup::{ORGANIZATION_KEY_PURPOSE, owner_key_from},
    store::{MemberRecord, OrganizationStore, Signer},
    vault::{SECRET_KEY_BYTES, open_vault, seal_to_public_key, unseal_with_secret_key},
    workspace::signer_of,
};

/// The one act that signs nothing. Everything else in the table writes a row an administrator
/// certificate has to stand behind, which is what makes widening into it the owner's.
const SIGNS_NOTHING: Administration = Administration::RenameWorkspace;

/// Whether a stored permission value carries any act that writes a signed row.
///
/// Read here and by `invite::write_account`, which needs the same answer for the same reason: a
/// row carrying one of these acts is only worth writing where the certificate behind it can be
/// issued, and issuing one is the owner's.
pub(super) fn signs_rows(permissions: i64) -> bool {
    Administration::ALL
        .iter()
        .filter(|act| **act != SIGNS_NOTHING)
        .any(|act| permission::permits(permissions, *act))
}

/// What somebody who is not the owner is told when they ask for ownership to be transferred.
pub const ONLY_THE_OWNER_TRANSFERS: &str =
    "only the owner can hand the organization over. it is theirs";

/// The organization key the acting session yields, read the one way there is (effort 828,
/// requirement 22).
///
/// **The row is read, and not the session.** A session carries the secret a password opened and
/// nothing about where the owner's key comes from, so the seal has to be read off the acting
/// member's own verified row every time. `setup::owner_key_from` is what decides between the seal
/// and the derivation; this is the pair of it for a machine that is already signed in.
///
/// It answers a key for anybody, because the caller has already refused anybody but the owner:
/// what a member's secret derives here is simply not the organization's, and the certificate it
/// would issue verifies against nothing.
pub(super) async fn owner_key_of(
    store: &OrganizationStore,
    session: &MemberSession,
) -> Result<OrganizationKey, Error> {
    let row = acting_row(store, session).await?;

    owner_key_from(&session.secret, row.owner_seed_sealed.as_deref())
}

/// Hand the organization to another account: they become the owner, the owner becomes an
/// administrator, and the key that signs every row does not change (effort 828, requirement 22).
///
/// **Nothing is re-signed and nothing is re-keyed.** The organization key's seed is sealed to the
/// new owner's public key, the way the content key already reaches every member, and written into
/// the nullable `member.owner_seed_sealed`. Their vault opens it on any machine, so the key
/// travels with the person rather than with this machine, and every row in the directory still
/// verifies against the key it was written under. *Rejected in the plan: deriving a fresh key from
/// the new owner's password and re-signing every row, which rewrites the whole directory for one
/// act.*
///
/// **The password is asked for and tried against the row**, the way `removal::delete_organization`
/// and `password::change_password` try one, so a wrong one refuses before a single row is written
/// and a machine somebody walked away from is not a way to give their organization away.
///
/// **The Turso account does not move** (spec, *Out of Scope*). The authority is a token in one
/// machine's keyring, granted by the person who consented, and no row holds it: until the new
/// owner grants the consent on their own machine, minting and renewal run on the founder's or not
/// at all. The sync section on their machine says so and offers the reconnect that exists.
///
/// The two rows are written under the old owner's own signer, which is what makes this the last
/// act of that key's holder being the only one.
pub async fn transfer_ownership(
    store: &OrganizationStore,
    session: &MemberSession,
    member_id: &str,
    password: &str,
    now: i64,
) -> Result<MemberFacts, Error> {
    session.settled()?;

    if session.role != permission::OWNER {
        return Err(Error::Forbidden {
            message: ONLY_THE_OWNER_TRANSFERS.to_string(),
        });
    }

    if member_id == session.member_id {
        return Err(Error::InvalidInput {
            message: "you are the owner already. name the account that is to have it".to_string(),
        });
    }

    let rows = store.members(&session.verifying_key).await?;
    let owner = rows
        .iter()
        .find(|member| member.id == session.member_id)
        .ok_or_else(|| Error::NotFound {
            message: "your member row is not in the organization any more. sign in again"
                .to_string(),
        })?;
    let member = rows
        .iter()
        .find(|member| member.id == member_id)
        .ok_or_else(|| Error::NotFound {
            message: "that member is not in this organization".to_string(),
        })?;

    if member.role == permission::REMOVED {
        return Err(Error::PreconditionFailed {
            message: "that member was removed. invite them again if they are to come back"
                .to_string(),
        });
    }

    // the password, tried against the owner's own row rather than trusted from the session: a
    // wrong one says only that the value did not open, and nothing has been written.
    let opened = open_vault(password, &owner.vault)?;

    if opened.public_key() != session.secret.public_key() {
        return Err(Error::Integrity {
            message: "the vault the password opened is not the one this session holds".to_string(),
        });
    }

    // the seed itself, and not the key built from it: what is sealed has to be the thirty-two
    // bytes the new owner's machine will build the same key out of.
    let seed = match &owner.owner_seed_sealed {
        Some(sealed) => {
            let opened = unseal_with_secret_key(&opened, sealed)?;

            <[u8; SECRET_KEY_BYTES]>::try_from(opened.as_slice()).map_err(|_| Error::Integrity {
                message: "the organization seed sealed to you is not a seed".to_string(),
            })?
        }
        None => opened.derive_seed(ORGANIZATION_KEY_PURPOSE)?,
    };
    let organization_key = OrganizationKey::from_bytes(&seed);

    // and the key is checked against what the directory was written under before anything moves,
    // so a seal that opened to the wrong bytes cannot be passed on.
    if organization_key.verifying_key() != session.verifying_key {
        return Err(Error::Integrity {
            message: "the organization key your vault holds is not the one this directory was \
                      signed under"
                .to_string(),
        });
    }

    let (key, certificate) = signer_of(store, session).await?;
    let signer = Signer {
        key: &key,
        certificate: &certificate,
    };

    store
        .write_member(
            &signer,
            &MemberRecord {
                role: permission::OWNER.to_string(),
                permissions: permission::mask_of_role(permission::OWNER),
                owner_seed_sealed: Some(seal_to_public_key(&member.vault.public_key, &seed)?),
                updated_at: now,
                ..member.clone()
            },
        )
        .await?;
    store
        .write_member(
            &signer,
            &MemberRecord {
                role: permission::ADMINISTRATOR.to_string(),
                permissions: permission::mask_of_role(permission::ADMINISTRATOR),
                // the seed leaves the old owner's row where it was on it: they keep the key they
                // already hold, and taking it off would be re-signing the directory under a key
                // nobody holds. What stops them transferring again is the role, which is now an
                // administrator's, and every act that certifies a signer is held to the same line.
                updated_at: now,
                ..owner.clone()
            },
        )
        .await?;

    // the new owner signs rows from here on, so they need a certificate over the key their row has
    // carried since it was written. An administrator already holds one and it still stands, since
    // neither their key nor the organization's changed.
    let certified = store.certificates().await?.into_iter().any(|certificate| {
        certificate.member_id == member_id
            && certificate.signing_public_key == member.signing_public_key
            && certificate.revoked_at.is_none()
    });

    if !certified {
        store
            .write_certificate(&issue_certificate(
                &organization_key,
                &format!("cert-{member_id}"),
                member_id,
                &member.signing_public_key,
                &now.to_string(),
            ))
            .await?;
    }

    if !store.push().await {
        diagnostics::warn("organization.member.ownershipNotYetSent")
            .with("member", member_id)
            .write();
    }

    diagnostics::info("organization.member.ownershipTransferred")
        .with("member", member_id)
        .write();

    members(store, session, now)
        .await?
        .into_iter()
        .find(|member| member.id == member_id)
        .ok_or_else(|| Error::Integrity {
            message: "the new owner's row did not read back".to_string(),
        })
}

/// Change what a member is called and what they may do, and keep their certificate in step.
///
/// `permissions` is written as given rather than derived from `role`, which is the whole of
/// requirement 6's second half: a role is a bundle to start from and a single act can be added to
/// or taken off a row afterwards. What comes back is the member as the list will show them.
pub async fn change_role(
    store: &OrganizationStore,
    session: &MemberSession,
    member_id: &str,
    role: &str,
    permissions: i64,
    now: i64,
) -> Result<MemberFacts, Error> {
    session.settled()?;
    permission::require(
        permissions_on_row(store, session).await?,
        Administration::ChangeRole,
    )?;

    if member_id == session.member_id {
        return Err(Error::Forbidden {
            message: "you cannot change your own role or permissions. another administrator can"
                .to_string(),
        });
    }

    if role != permission::ADMINISTRATOR && role != permission::MEMBER {
        return Err(Error::InvalidInput {
            message: "a member is an administrator or a member".to_string(),
        });
    }

    let rows = store.members(&session.verifying_key).await?;
    let member = rows
        .iter()
        .find(|member| member.id == member_id)
        .ok_or_else(|| Error::NotFound {
            message: "that member is not in this organization".to_string(),
        })?;

    if member.role == permission::OWNER {
        return Err(Error::Forbidden {
            message: "an owner's role is not changed. the organization is theirs".to_string(),
        });
    }

    if member.role == permission::REMOVED {
        return Err(Error::PreconditionFailed {
            message: "that member was removed. invite them again if they are to come back"
                .to_string(),
        });
    }

    // the one widening that needs the organization key, refused before anything is written. The
    // role is held to the same line as the acts, because `administrator` is the word for carrying
    // every one of them and a row that says so without a certificate behind it is a promise the
    // chain will not keep.
    let widens = Administration::ALL.iter().any(|act| {
        *act != SIGNS_NOTHING
            && permission::permits(permissions, *act)
            && !permission::permits(member.permissions, *act)
    }) || (role == permission::ADMINISTRATOR
        && member.role != permission::ADMINISTRATOR);

    if widens && session.role != permission::OWNER {
        return Err(Error::Forbidden {
            message: "only an owner can give somebody an act that signs rows, because certifying \
                      a signer needs the organization key. ask the owner, or change what they may \
                      do without it"
                .to_string(),
        });
    }

    let (key, certificate) = signer_of(store, session).await?;
    let signer = Signer {
        key: &key,
        certificate: &certificate,
    };
    let signed_before = signs_rows(member.permissions);
    let signs_now = signs_rows(permissions);

    store
        .write_member(
            &signer,
            &MemberRecord {
                role: role.to_string(),
                permissions,
                updated_at: now,
                ..member.clone()
            },
        )
        .await?;

    if signs_now && !signed_before {
        // their first signing act: the owner certifies the key the row has carried since it was
        // written, which is the key `workspace::signer_of` will derive from their own vault. The
        // owner's own key is read through `owner_key_from`, so an owner who was given the
        // organization certifies with the seed sealed onto their row rather than with one their
        // secret would derive (effort 828, requirement 22).
        let organization_key = owner_key_of(store, session).await?;

        store
            .write_certificate(&issue_certificate(
                &organization_key,
                &format!("cert-{member_id}"),
                member_id,
                &member.signing_public_key,
                &now.to_string(),
            ))
            .await?;
    }

    if signed_before && !signs_now {
        // their last one: the rows their certificate signed move under the actor, who holds
        // authority over them, before it is written back revoked, so retiring it bricks nothing.
        // A row they newly sign under it afterwards is refused on read as revoked.
        if let Some(theirs) = store.certificates().await?.into_iter().find(|certificate| {
            certificate.member_id == member_id && certificate.revoked_at.is_none()
        }) {
            store
                .re_sign_rows_of_certificate(&session.verifying_key, &theirs.id, &signer)
                .await?;
            store
                .write_certificate(&theirs.revoked(&now.to_string()))
                .await?;
        }
    }

    if !store.push().await {
        diagnostics::warn("organization.member.roleNotYetSent")
            .with("member", member_id)
            .write();
    }

    diagnostics::info("organization.member.roleChanged")
        .with("member", member_id)
        .with("role", role)
        .write();

    // read back through the routine the list draws from, so what the caller is handed is what the
    // members list will show.
    members(store, session, now)
        .await?
        .into_iter()
        .find(|member| member.id == member_id)
        .ok_or_else(|| Error::Integrity {
            message: "the changed member's row did not read back".to_string(),
        })
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use serde_json::json;

    use super::{ONLY_THE_OWNER_TRANSFERS, change_role, signs_rows, transfer_ownership};
    use crate::{
        error::Error,
        organization::{
            HeldOrganization,
            authority::{AdministratorKey, OrganizationKey},
            invite::{AccountAndLink, Invitation, WorkspaceGrant, locator, make_account_and_link},
            link::Locator,
            migrate::Pipeline,
            permission::{self, Administration},
            session::{CredentialSlot, MemberSession, sign_in},
            setup::{
                ADMINISTRATOR_KEY_PURPOSE, CreateOrganization, ORGANIZATION_KEY_PURPOSE, Remote,
                create_organization, owner_key_from,
            },
            store::{OrganizationStore, Signer, TABLES},
            vault::{KdfParams, open_vault, unseal_with_secret_key},
            workspace::{create_workspace, signer_of},
        },
        persisted::Persisted,
        sync::{
            RemoteSyncStore,
            test::server::{ScriptedResponse, ScriptedServer},
            turso::{
                discovery::McpEndpoint,
                platform::{AccessLevel, InMemoryPlatform},
            },
        },
    };

    const PASSWORD: &str = "the owners password";
    const NOW: i64 = 1_757_000_000_000;

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
        let directory = std::env::temp_dir().join(format!("rentable-role-{name}-{nanos:x}"));
        std::fs::create_dir_all(&directory).expect("scratch directory");

        directory
    }

    fn slot() -> CredentialSlot {
        Arc::new(Mutex::new(None))
    }

    /// No platform authority in hand, which is every session here: nothing this module does mints
    /// anything.
    fn no_platform() -> Option<&'static InMemoryPlatform> {
        None
    }

    /// Full access on each workspace named, which is what every invitation here grants.
    fn full(ids: &[String]) -> Vec<WorkspaceGrant> {
        ids.iter()
            .map(|id| WorkspaceGrant {
                id: id.clone(),
                access: AccessLevel::FullAccess,
            })
            .collect()
    }

    /// The password an invitation's vault was sealed under: the link's own secret and the code
    /// together open the payload the link carries, which is what the person opening the link does
    /// (effort 828, requirement 1). *It was the link's secret alone until effort 826 made the code
    /// the other half, and it read the row's `code_seal` until effort 828 moved the seal into the
    /// link's text.*
    fn secret_of(invited: &AccountAndLink) -> String {
        crate::organization::invite::vault_password_of(
            &invited.join_link,
            &invited.code,
            test_cost(),
        )
    }

    /// The machine's record of a member who joined.
    fn joined_as(owner: &MemberSession, member_id: &str, role: &str) -> HeldOrganization {
        HeldOrganization {
            id: owner.organization_id.clone(),
            name: "Acme".to_string(),
            verifying_key: base64::Engine::encode(
                &base64::engine::general_purpose::URL_SAFE_NO_PAD,
                owner.verifying_key,
            ),
            remote_url: String::new(),
            machine_id: "machine-one".to_string(),
            member_id: Some(member_id.to_string()),
            role: Some(role.to_string()),
            joined_at: 0,
        }
    }

    /// An organization with its owner signed in and one workspace, on a fake account.
    async fn owned(
        directory: &std::path::Path,
    ) -> (OrganizationStore, MemberSession, Locator, String) {
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
            NOW,
        )
        .await
        .expect("the first run failed");
        let joined = store.organization.clone().expect("the record");
        let mut owner = sign_in(&organization, &joined, PASSWORD, &slot())
            .await
            .expect("the owner did not sign in");
        let pipeline = ScriptedServer::start(vec![ScriptedResponse::new(
            200,
            json!({ "results": [] }).to_string(),
        )])
        .await;
        let workspace = create_workspace(
            &organization,
            &mut owner,
            &platform,
            |_| Pipeline::at(&pipeline.url("")),
            "North",
            NOW,
        )
        .await
        .expect("the workspace");
        let link = locator(&organization, &owner)
            .await
            .expect("the organization's link");

        (organization, owner, link, workspace.id)
    }

    /// A member of this organization, invited and signed in, with their password change settled
    /// the way an accept settles it.
    async fn a_member(
        store: &OrganizationStore,
        owner: &MemberSession,
        link: &Locator,
        username: &'static str,
        role: &str,
        workspace_id: &str,
    ) -> (AccountAndLink, MemberSession) {
        let workspaces = full(&[workspace_id.to_string()]);
        let invited = make_account_and_link(
            store,
            owner,
            no_platform(),
            link,
            Invitation {
                username,
                role,
                workspaces: &workspaces,
            },
            test_cost(),
            NOW,
        )
        .await
        .expect("the invitation failed");
        let mut session = sign_in(
            store,
            &joined_as(owner, &invited.member_id, role),
            &secret_of(&invited),
            &slot(),
        )
        .await
        .expect("the invited member did not sign in");
        session.must_change_password = false;

        (invited, session)
    }

    /// Every row of the organization, cell by cell, so a refusal that wrote something is caught
    /// wherever it wrote it.
    async fn every_row(store: &OrganizationStore) -> Vec<(String, Vec<Option<Vec<u8>>>)> {
        let mut rows_out = Vec::new();

        for table in TABLES {
            let mut rows = store
                .connection()
                .query(&format!("SELECT * FROM \"{table}\" ORDER BY 1, 2"), ())
                .await
                .expect("the rows");

            while let Some(row) = rows.next().await.expect("a row") {
                let mut cells = Vec::new();

                for index in 0..row.column_count() {
                    cells.push(match row.get_value(index).expect("a value") {
                        turso::Value::Text(text) => Some(text.into_bytes()),
                        turso::Value::Blob(blob) => Some(blob),
                        turso::Value::Integer(value) => Some(value.to_be_bytes().to_vec()),
                        turso::Value::Real(value) => Some(value.to_be_bytes().to_vec()),
                        turso::Value::Null => None,
                    });
                }

                rows_out.push((table.to_string(), cells));
            }
        }

        rows_out
    }

    /// What a member's row carries now, read through the verified reader, so a row that stopped
    /// verifying fails here rather than reading back as though nothing had happened.
    async fn row_of(
        store: &OrganizationStore,
        owner: &MemberSession,
        member_id: &str,
    ) -> (String, i64) {
        let member = store
            .members(&owner.verifying_key)
            .await
            .expect("the rows verify")
            .into_iter()
            .find(|member| member.id == member_id)
            .expect("the member row");

        (member.role, member.permissions)
    }

    /// Whether a live certificate names this member, which is what `workspace::signer_of` looks
    /// for and the whole of what lets them sign a row.
    async fn certified(store: &OrganizationStore, member_id: &str) -> bool {
        store
            .certificates()
            .await
            .expect("the certificates")
            .into_iter()
            .any(|certificate| {
                certificate.member_id == member_id && certificate.revoked_at.is_none()
            })
    }

    /// A copy of the replica as another machine would hold it, opened as a second store. Every
    /// read through it verifies against the key the link pinned rather than the one the database
    /// carries, which is what "verifies on every other client" means here.
    async fn another_machine(
        directory: &std::path::Path,
        organization_id: &str,
    ) -> OrganizationStore {
        let elsewhere = scratch("elsewhere");

        for entry in std::fs::read_dir(directory).expect("the directory") {
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
            &OrganizationStore::replica_path(&elsewhere.join("app.db"), organization_id),
            None,
            || async { Err(turso::Error::Misuse("no remote".into())) },
        )
        .await
        .expect("their replica did not open")
    }

    /// The act table's one act that writes no signed row, which is what makes it the one a
    /// non-owner may hand out. A change here is a change to who needs the organization key.
    #[test]
    fn every_act_but_renaming_a_workspace_signs_a_row() {
        for act in Administration::ALL {
            assert_eq!(
                signs_rows(permission::mask_of(&[act])),
                act != Administration::RenameWorkspace,
                "{}",
                act.name()
            );
        }

        assert!(!signs_rows(0));
    }

    /// Requirement 6: both fields are written on the row, re-signed, and the answer is the member
    /// as the list will show them. An act that signs nothing earns no certificate.
    #[tokio::test]
    async fn the_role_and_the_acts_are_written_re_signed_and_read_back() {
        let directory = scratch("write");
        let (store, owner, link, workspace_id) = owned(&directory).await;
        let (invited, _) = a_member(
            &store,
            &owner,
            &link,
            "sami.staff",
            permission::MEMBER,
            &workspace_id,
        )
        .await;
        let widened = permission::mask_of(&[Administration::RenameWorkspace]);

        let changed = change_role(
            &store,
            &owner,
            &invited.member_id,
            permission::MEMBER,
            widened,
            NOW + 1,
        )
        .await
        .expect("the change failed");

        assert_eq!(changed.id, invited.member_id);
        assert_eq!(changed.username, "sami.staff");
        assert_eq!(changed.role, permission::MEMBER);
        assert_eq!(changed.permissions, widened);
        assert_eq!(
            changed
                .workspaces
                .iter()
                .map(|workspace| workspace.id.clone())
                .collect::<Vec<_>>(),
            vec![workspace_id.clone()],
            "the change moved what the member holds"
        );

        // on the row, verified, and not only in the answer.
        assert_eq!(
            row_of(&store, &owner, &invited.member_id).await,
            (permission::MEMBER.to_string(), widened)
        );

        // renaming a workspace writes the sealed name outside the signature, so it needs no
        // certificate and none was issued.
        assert!(!certified(&store, &invited.member_id).await);

        // and the role travels with the acts: an administrator by name, with the acts the owner
        // chose rather than the ones the bundle carries.
        let named = change_role(
            &store,
            &owner,
            &invited.member_id,
            permission::ADMINISTRATOR,
            permission::mask_of(&[Administration::RenameMember]),
            NOW + 2,
        )
        .await
        .expect("the second change failed");

        assert_eq!(named.role, permission::ADMINISTRATOR);
        assert_eq!(
            named.permissions,
            permission::mask_of(&[Administration::RenameMember])
        );
    }

    /// The refusals, each before anything is written: nobody changes their own row, nobody
    /// changes the owner's, a member with no act changes nobody, a role this build does not ship
    /// is not written, and a member who is not here is not found.
    #[tokio::test]
    async fn the_refusals_come_before_any_write() {
        let directory = scratch("refusals");
        let (store, owner, link, workspace_id) = owned(&directory).await;
        let (invited, sami) = a_member(
            &store,
            &owner,
            &link,
            "sami.staff",
            permission::MEMBER,
            &workspace_id,
        )
        .await;
        let (_, ada) = a_member(
            &store,
            &owner,
            &link,
            "ada.admin",
            permission::ADMINISTRATOR,
            &workspace_id,
        )
        .await;
        let owner_id = owner.member_id.clone();
        let before = every_row(&store).await;

        let own = change_role(&store, &owner, &owner_id, permission::MEMBER, 0, NOW + 1)
            .await
            .expect_err("the owner changed their own row");

        assert!(matches!(own, Error::Forbidden { .. }), "{own:?}");
        assert!(own.to_string().contains("your own"), "{own}");

        let theirs = change_role(&store, &ada, &owner_id, permission::MEMBER, 0, NOW + 1)
            .await
            .expect_err("an administrator changed the owner's row");

        assert!(matches!(theirs, Error::Forbidden { .. }), "{theirs:?}");
        assert!(theirs.to_string().contains("owner"), "{theirs}");

        let without = change_role(
            &store,
            &sami,
            &invited.member_id,
            permission::MEMBER,
            0,
            NOW + 1,
        )
        .await
        .expect_err("a member with no act changed a role");

        assert!(without.to_string().contains("changeRole"), "{without}");

        let unknown = change_role(&store, &owner, &invited.member_id, "superuser", 0, NOW + 1)
            .await
            .expect_err("a role this build never heard of was written");

        assert!(matches!(unknown, Error::InvalidInput { .. }), "{unknown:?}");

        let missing = change_role(&store, &owner, "nobody", permission::MEMBER, 0, NOW + 1)
            .await
            .expect_err("a member who is not here was changed");

        assert!(matches!(missing, Error::NotFound { .. }), "{missing:?}");

        assert_eq!(every_row(&store).await, before, "a refusal wrote something");
    }

    /// Requirement 6's owner-only sentence: a holder of `changeRole` who is not the owner narrows
    /// anybody and widens only with `renameWorkspace`, the one act that signs nothing, and the
    /// refusal names the owner.
    #[tokio::test]
    async fn a_non_owner_narrows_anybody_and_widens_only_with_the_act_that_signs_nothing() {
        let directory = scratch("owner-only");
        let (store, owner, link, workspace_id) = owned(&directory).await;
        let (_, ada) = a_member(
            &store,
            &owner,
            &link,
            "ada.admin",
            permission::ADMINISTRATOR,
            &workspace_id,
        )
        .await;
        let (sami, _) = a_member(
            &store,
            &owner,
            &link,
            "sami.staff",
            permission::MEMBER,
            &workspace_id,
        )
        .await;
        let renaming = permission::mask_of(&[Administration::RenameWorkspace]);

        // the one widening an administrator may make.
        change_role(
            &store,
            &ada,
            &sami.member_id,
            permission::MEMBER,
            renaming,
            NOW + 1,
        )
        .await
        .expect("an administrator could not hand out the act that signs nothing");

        // and every other one, refused with a sentence naming the owner.
        for act in Administration::ALL
            .iter()
            .filter(|act| **act != Administration::RenameWorkspace)
        {
            let refusal = change_role(
                &store,
                &ada,
                &sami.member_id,
                permission::MEMBER,
                renaming | permission::mask_of(&[*act]),
                NOW + 2,
            )
            .await
            .err()
            .unwrap_or_else(|| panic!("an administrator handed out {}", act.name()));

            assert!(
                matches!(refusal, Error::Forbidden { .. }),
                "{}: {refusal:?}",
                act.name()
            );
            assert!(
                refusal.to_string().contains("owner"),
                "{}: {refusal}",
                act.name()
            );
        }

        // the role is held to the same line, because `administrator` is the word for carrying
        // every act and a row saying so with no certificate behind it is a promise nothing keeps.
        let named = change_role(
            &store,
            &ada,
            &sami.member_id,
            permission::ADMINISTRATOR,
            renaming,
            NOW + 2,
        )
        .await
        .expect_err("an administrator named another one");

        assert!(named.to_string().contains("owner"), "{named}");

        // and narrowing is theirs to do: the act they handed out, taken back.
        change_role(
            &store,
            &ada,
            &sami.member_id,
            permission::MEMBER,
            0,
            NOW + 3,
        )
        .await
        .expect("an administrator could not narrow a member");

        assert_eq!(
            row_of(&store, &owner, &sami.member_id).await,
            (permission::MEMBER.to_string(), 0)
        );
    }

    /// Criterion 7: a member widened with `inviteMember` can invite, and the invited row verifies
    /// on every other client; narrowed back, a row they newly sign is refused.
    #[tokio::test]
    async fn a_first_signing_act_is_certified_and_the_last_one_lost_retires_the_certificate() {
        let directory = scratch("certificate");
        let (store, owner, link, workspace_id) = owned(&directory).await;
        let (sami, opened) = a_member(
            &store,
            &owner,
            &link,
            "sami.staff",
            permission::MEMBER,
            &workspace_id,
        )
        .await;

        assert!(!certified(&store, &sami.member_id).await);

        // widened by the owner: their first signing act, and the certificate the owner issues over
        // the key their row has carried since it was written.
        change_role(
            &store,
            &owner,
            &sami.member_id,
            permission::MEMBER,
            permission::mask_of(&[Administration::InviteMember]),
            NOW + 1,
        )
        .await
        .expect("the widening failed");

        assert!(certified(&store, &sami.member_id).await);

        // what was certified is the key they derive from their own vault secret, read off their
        // row: the whole reason the column exists.
        let theirs_to_sign_with = AdministratorKey::from_bytes(
            &opened
                .secret
                .derive_seed(ADMINISTRATOR_KEY_PURPOSE)
                .expect("the signing seed"),
        )
        .verifying_key();
        let certificate = store
            .certificates()
            .await
            .expect("the certificates")
            .into_iter()
            .find(|certificate| certificate.member_id == sami.member_id)
            .expect("their certificate");

        assert_eq!(certificate.signing_public_key, theirs_to_sign_with);
        assert_eq!(
            store
                .members(&owner.verifying_key)
                .await
                .expect("the rows")
                .into_iter()
                .find(|member| member.id == sami.member_id)
                .expect("their row")
                .signing_public_key,
            theirs_to_sign_with
        );

        // and they invite, which is a row signed under that certificate. Their session is opened
        // after the widening, because what a session may do is what the row said when it opened.
        let mut widened = sign_in(
            &store,
            &joined_as(&owner, &sami.member_id, permission::MEMBER),
            &secret_of(&sami),
            &slot(),
        )
        .await
        .expect("the widened member did not sign in");
        widened.must_change_password = false;

        let workspaces = full(&[workspace_id.clone()]);
        let theirs = make_account_and_link(
            &store,
            &widened,
            no_platform(),
            &link,
            Invitation {
                username: "noor.new",
                role: permission::MEMBER,
                workspaces: &workspaces,
            },
            test_cost(),
            NOW + 2,
        )
        .await
        .expect("a widened member could not invite");

        // on a second machine, verified against the key the link pinned.
        let elsewhere = another_machine(&directory, &owner.organization_id).await;
        let rows = elsewhere
            .members(&owner.verifying_key)
            .await
            .expect("the invited row does not verify on another machine");

        assert!(
            rows.iter().any(|member| member.id == theirs.member_id),
            "the row a widened member signed is not on the other machine"
        );

        drop(elsewhere);

        // narrowed back: the rows their certificate signed move under the owner, and the
        // certificate is written back revoked.
        change_role(
            &store,
            &owner,
            &sami.member_id,
            permission::MEMBER,
            0,
            NOW + 3,
        )
        .await
        .expect("the narrowing failed");

        assert!(!certified(&store, &sami.member_id).await);
        assert!(
            store.members(&owner.verifying_key).await.is_ok(),
            "retiring the certificate bricked the rows it had signed"
        );
        assert!(
            signer_of(&store, &widened).await.is_err(),
            "a narrowed member still finds a certificate to sign under"
        );

        // and a row they sign under it anyway is refused on read, by name.
        let revoked = store
            .certificates()
            .await
            .expect("the certificates")
            .into_iter()
            .find(|certificate| certificate.member_id == sami.member_id)
            .expect("their certificate");
        let key = AdministratorKey::from_bytes(
            &widened
                .secret
                .derive_seed(ADMINISTRATOR_KEY_PURPOSE)
                .expect("the signing seed"),
        );
        let row = store
            .members(&owner.verifying_key)
            .await
            .expect("the rows")
            .into_iter()
            .find(|member| member.id == theirs.member_id)
            .expect("the row they had signed");

        store
            .write_member(
                &Signer {
                    key: &key,
                    certificate: &revoked,
                },
                &row,
            )
            .await
            .expect("the write itself is not what refuses");

        let refusal = store
            .members(&owner.verifying_key)
            .await
            .expect_err("a row signed under a revoked certificate was accepted");

        assert!(refusal.to_string().contains("revoked"), "{refusal}");
    }

    /// **A narrowing that leaves the certificate standing still reaches the open session.**
    ///
    /// The case the test above does not cover, and the one requirement 6 makes the control
    /// surface: a member loses one act and keeps another that signs. `signed_before &&
    /// !signs_now` is false, so their certificate is not retired, and until the gates read the
    /// row their session went on carrying the bit the owner had just taken off. What refuses them
    /// here is `session::permissions_on_row`, and the refusal names the act they reached for.
    #[tokio::test]
    async fn a_member_narrowed_out_of_one_act_is_refused_on_their_open_session_by_name() {
        let directory = scratch("narrowed");
        let (store, owner, link, workspace_id) = owned(&directory).await;
        let (sami, theirs) = a_member(
            &store,
            &owner,
            &link,
            "sami.staff",
            permission::ADMINISTRATOR,
            &workspace_id,
        )
        .await;

        // the owner takes inviting off and leaves removing, which is the whole of the case: the
        // member still signs rows, so the certificate stays live.
        change_role(
            &store,
            &owner,
            &sami.member_id,
            permission::ADMINISTRATOR,
            permission::mask_of(&[Administration::RemoveMember]),
            NOW + 1,
        )
        .await
        .expect("the narrowing failed");

        assert!(
            certified(&store, &sami.member_id).await,
            "the narrowing retired the certificate, so this is the other test's case"
        );
        assert!(
            permission::permits(theirs.permissions, Administration::InviteMember),
            "the session stopped carrying the act on its own, and there is nothing left to refuse"
        );

        let workspaces = full(&[workspace_id.clone()]);
        let refusal = make_account_and_link(
            &store,
            &theirs,
            no_platform(),
            &link,
            Invitation {
                username: "noor.new",
                role: permission::MEMBER,
                workspaces: &workspaces,
            },
            test_cost(),
            NOW + 2,
        )
        .await
        .expect_err("a member narrowed out of inviteMember invited somebody");

        assert!(
            matches!(refusal, Error::Forbidden { .. }),
            "the refusal is not a forbidden: {refusal}"
        );
        assert!(
            refusal.to_string().contains("inviteMember"),
            "the refusal does not name the act: {refusal}"
        );

        // nobody was written: the gate is before the work, as every other refusal here is.
        assert!(
            !store
                .members(&owner.verifying_key)
                .await
                .expect("the rows")
                .iter()
                .any(|member| member.id != sami.member_id && member.id != owner.member_id),
            "the refused invitation wrote a member row"
        );

        // and the act they kept is still theirs, off the same row.
        assert_eq!(
            crate::organization::session::permissions_on_row(&store, &theirs)
                .await
                .expect("their row"),
            permission::mask_of(&[Administration::RemoveMember])
        );
    }
    // -------------------------------------------------------------------------------------
    // Effort 828, requirement 22: ownership is transferred by the owner.
    // -------------------------------------------------------------------------------------

    /// **Criterion 22, the first half.** The transfer swaps the two rows and the key that signs
    /// every row in the organization does not change, so nothing is re-signed and every row still
    /// verifies.
    ///
    /// The verifying key is read three ways and all three are the same key: the one the old
    /// owner's session pinned, the one the organization row carries, and the one the new owner's
    /// own vault now yields out of the seal the transfer wrote. That last one is the whole of the
    /// mechanism: their password opens their vault, their vault opens the seed, and the seed is
    /// the founder's.
    #[tokio::test]
    async fn a_transfer_swaps_the_roles_and_every_row_still_verifies_against_the_unchanged_key() {
        let directory = scratch("transfer");
        let (store, owner, link, workspace_id) = owned(&directory).await;
        let (ada, _) = a_member(
            &store,
            &owner,
            &link,
            "ada.admin",
            permission::ADMINISTRATOR,
            &workspace_id,
        )
        .await;
        let key_before = owner.verifying_key;

        let handed = transfer_ownership(&store, &owner, &ada.member_id, PASSWORD, NOW + 1)
            .await
            .expect("the transfer failed");

        assert_eq!(handed.id, ada.member_id);
        assert_eq!(handed.role, permission::OWNER);

        // the two rows, read through the verified reader against the key that has not moved. A row
        // that stopped verifying refuses this read by name rather than coming back changed.
        assert_eq!(
            row_of(&store, &owner, &ada.member_id).await,
            (
                permission::OWNER.to_string(),
                permission::mask_of_role(permission::OWNER)
            )
        );
        assert_eq!(
            row_of(&store, &owner, &owner.member_id).await,
            (
                permission::ADMINISTRATOR.to_string(),
                permission::mask_of_role(permission::ADMINISTRATOR)
            )
        );

        // every row of every signed table verifies, which is what "nothing is re-signed" has to
        // mean.
        let rows = store
            .members(&key_before)
            .await
            .expect("every member row verifies against the unchanged key");

        store
            .workspaces(&key_before)
            .await
            .expect("every workspace row verifies against the unchanged key");
        store
            .grants(&key_before)
            .await
            .expect("every grant row verifies against the unchanged key");

        // and the key itself: the organization row's, and the one the new owner's vault yields
        // through the seal the transfer put on their row.
        let organization = store
            .organization()
            .await
            .expect("the organization row")
            .expect("the organization row is there");

        assert_eq!(organization.verifying_key, key_before);

        let new_owner = rows
            .iter()
            .find(|member| member.id == ada.member_id)
            .expect("the new owner's row");
        let sealed = new_owner
            .owner_seed_sealed
            .as_deref()
            .expect("the new owner's row carries no sealed seed");
        let theirs = open_vault(&secret_of(&ada), &new_owner.vault).expect("the new owner's vault");

        assert_eq!(
            owner_key_from(&theirs, Some(sealed))
                .expect("the sealed seed did not open")
                .verifying_key(),
            key_before
        );

        // the seal is theirs alone: the old owner's secret does not open it, and what the new
        // owner's own secret derives is not the organization's key either.
        assert!(
            unseal_with_secret_key(&owner.secret, sealed).is_err(),
            "the old owner's secret opened the seal written for the new owner"
        );
        assert_ne!(
            OrganizationKey::from_bytes(
                &theirs
                    .derive_seed(ORGANIZATION_KEY_PURPOSE)
                    .expect("a seed")
            )
            .verifying_key(),
            key_before,
            "the new owner's own derivation happened to be the organization's key"
        );

        // the old owner's row keeps the seal it never had, and both sign rows: the certificate an
        // administrator already held still stands, since neither key moved.
        assert!(
            rows.iter()
                .find(|member| member.id == owner.member_id)
                .expect("the old owner's row")
                .owner_seed_sealed
                .is_none(),
            "the founder's row was given a seal it never needed"
        );
        assert!(certified(&store, &ada.member_id).await);
        assert!(certified(&store, &owner.member_id).await);
    }

    /// **Criterion 22, the refusals.** The old owner is an administrator and can no longer hand
    /// the organization on; an administrator was never able to; and a wrong password is refused
    /// before a single row is written.
    ///
    /// The old owner's refusal is read off a session the wall reopens, because that is what a
    /// person meets: the role in hand is the one their row now carries.
    #[tokio::test]
    async fn the_old_owner_cannot_transfer_again_and_an_administrator_never_could() {
        let directory = scratch("transfer-refusals");
        let (store, owner, link, workspace_id) = owned(&directory).await;
        let (ada, ada_session) = a_member(
            &store,
            &owner,
            &link,
            "ada.admin",
            permission::ADMINISTRATOR,
            &workspace_id,
        )
        .await;
        let (sami, _) = a_member(
            &store,
            &owner,
            &link,
            "sami.staff",
            permission::MEMBER,
            &workspace_id,
        )
        .await;

        // an administrator, before anything has moved.
        let before = every_row(&store).await;
        let refused = transfer_ownership(
            &store,
            &ada_session,
            &sami.member_id,
            &secret_of(&ada),
            NOW + 1,
        )
        .await
        .expect_err("an administrator handed the organization on");

        assert!(
            matches!(refused, Error::Forbidden { ref message } if message == ONLY_THE_OWNER_TRANSFERS),
            "{refused:?}"
        );
        assert_eq!(every_row(&store).await, before, "a refusal wrote something");

        // a wrong password, from the owner. Nothing is written, and the refusal says only that the
        // value did not open ([[rules/credentials]]).
        let wrong = transfer_ownership(
            &store,
            &owner,
            &ada.member_id,
            "not the owners password",
            NOW + 1,
        )
        .await
        .expect_err("a wrong password handed the organization on");

        assert!(matches!(wrong, Error::Integrity { .. }), "{wrong:?}");
        assert_eq!(
            every_row(&store).await,
            before,
            "a wrong password wrote something"
        );

        // naming themselves is not a transfer either, and it writes nothing.
        let own = transfer_ownership(&store, &owner, &owner.member_id, PASSWORD, NOW + 1)
            .await
            .expect_err("the owner handed the organization to themselves");

        assert!(matches!(own, Error::InvalidInput { .. }), "{own:?}");
        assert_eq!(every_row(&store).await, before, "a refusal wrote something");

        // and now the real one, after which the founder is an administrator and is refused by the
        // same sentence the administrator above met.
        transfer_ownership(&store, &owner, &ada.member_id, PASSWORD, NOW + 1)
            .await
            .expect("the transfer failed");

        let founder = sign_in(
            &store,
            &joined_as(&owner, &owner.member_id, permission::ADMINISTRATOR),
            PASSWORD,
            &slot(),
        )
        .await
        .expect("the old owner did not sign in");

        assert_eq!(founder.role, permission::ADMINISTRATOR);

        let again = transfer_ownership(&store, &founder, &sami.member_id, PASSWORD, NOW + 2)
            .await
            .expect_err("the old owner handed the organization on again");

        assert!(
            matches!(again, Error::Forbidden { ref message } if message == ONLY_THE_OWNER_TRANSFERS),
            "{again:?}"
        );
    }

    /// A member who was never an administrator can be given the organization, and the transfer is
    /// what certifies them: they hold no certificate before it and one after, so the acts that
    /// sign rows are theirs.
    #[tokio::test]
    async fn a_member_given_the_organization_is_certified_by_the_transfer() {
        let directory = scratch("transfer-member");
        let (store, owner, link, workspace_id) = owned(&directory).await;
        let (sami, _) = a_member(
            &store,
            &owner,
            &link,
            "sami.staff",
            permission::MEMBER,
            &workspace_id,
        )
        .await;

        assert!(!certified(&store, &sami.member_id).await);

        transfer_ownership(&store, &owner, &sami.member_id, PASSWORD, NOW + 1)
            .await
            .expect("the transfer failed");

        assert!(certified(&store, &sami.member_id).await);

        // and the certificate verifies against the key that has not changed, which is what reading
        // every row back through it proves.
        store
            .members(&owner.verifying_key)
            .await
            .expect("every member row verifies against the unchanged key");
    }
}
