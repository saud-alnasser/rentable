//! the owner's own row repaired by the owner's machine where somebody below them wrote it, with the
//! owner's own keys and nothing read off the row (effort 838, the re-check of ticket 20).

use crate::{diagnostics, error::Error};

use crate::organization::role::{
    permission::{self},
    sent,
};
use crate::organization::{
    authority::{AdministratorKey, VERIFYING_KEY_BYTES},
    member::vault::{MemberSecretKey, Vault},
    setup::{ADMINISTRATOR_KEY_PURPOSE, owner_key_from},
    store::{MemberRecord, OrganizationStore, Signer},
};

/// Sign the owner's own row again under the root where it does not read as the owner's: what the
/// owner's machine does, with nobody acting, when a sign-in, a resume or a heartbeat finds it so
/// (effort 838, the human's decision after review round two). Answers whether it wrote.
///
/// **A demotion written around the command reads as granting nothing, and only the root undoes
/// it.** A member holding the credential who signs the owner's row naming a lower role, or
/// removed, fails on rank alone and reads uncovered, so the owner would hold no permissions and
/// no command of theirs would run to write the row again. The one machine that holds the root is
/// the owner's, so that machine repairs it the moment it reads it: the row is written again as the
/// owner's role, with no override, no removal and no offer's seal, and pushed. **The keys are the
/// owner's own**, the signing key their secret derives and the vault's public half their secret
/// opens, never the row's, which somebody below them wrote (the re-check of ticket 20); every other
/// column stands as it is (the sealed vault, the session epoch, the username).
///
/// **Only for the machine whose vault derives the key the organization is pinned to, and only
/// for its own row.** `secret` derives the organization key (`setup::owner_key_from`); where it is
/// not `verifying_key`, the caller is not the owner, founder or transferee, and nothing is read or
/// written. A manager's machine meeting their own demoted row therefore writes nothing: an
/// uncovered row is never saved (`session::refuse_unsettled`), and the owner removes the manager
/// and makes them an account again. A row that is gone is a deletion,
/// which the chain says it cannot stop (`authority/`): there is no vault left to keep, so nothing
/// is written and the point-in-time restore is the answer.
pub(in crate::organization) async fn repair_owner_row(
    store: &OrganizationStore,
    verifying_key: &[u8; VERIFYING_KEY_BYTES],
    member_id: &str,
    secret: &MemberSecretKey,
    now: i64,
) -> Result<bool, Error> {
    if owner_key_from(secret)?.verifying_key() != *verifying_key {
        return Ok(false);
    }

    let Some(row) = store.member(verifying_key, member_id).await? else {
        return Ok(false);
    };

    if row.role_id == permission::OWNER
        && row.override_mask == 0
        && row.removed_at.is_none()
        && row.effective == permission::OWNER_ROLE.mask
    {
        return Ok(false);
    }

    let key = AdministratorKey::from_bytes(&secret.derive_seed(ADMINISTRATOR_KEY_PURPOSE)?);
    let Some(root) = store
        .live_certificates(verifying_key, member_id)
        .await?
        .into_iter()
        .find(|certificate| {
            certificate.is_root() && certificate.signing_public_key == key.verifying_key()
        })
    else {
        return Ok(false);
    };

    store
        .write_member(
            &Signer {
                key: &key,
                certificate: &root,
            },
            // the keys come from what the owner's own secret derives and opens, never from the
            // row, which somebody below them wrote: a forged signing key re-signed under the root
            // would be the forger's at the owner's rank. The seal of an offer goes too.
            &MemberRecord {
                role_id: permission::OWNER.to_string(),
                override_mask: 0,
                removed_at: None,
                signing_public_key: key.verifying_key(),
                vault: Vault {
                    public_key: secret.public_key(),
                    ..row.vault.clone()
                },
                owner_seed_sealed: None,
                updated_at: now,
                ..row
            },
        )
        .await?;

    sent(
        store,
        "organization.owner.repairNotYetSent",
        "member",
        member_id,
    )
    .await;
    diagnostics::warn("organization.owner.rowRepaired")
        .with("member", member_id)
        .write();

    Ok(true)
}

#[cfg(test)]
mod tests {
    use crate::credential::{CredentialStore, Memory};
    use crate::error::{Error, RefusalReason};
    use crate::machine::RemoteSyncStore;
    use crate::organization::HeldOrganization;
    use crate::organization::authority::{AdministratorKey, Certificate};
    use crate::organization::invitation::link::Locator;
    use crate::organization::invitation::{
        AccountAndLink, Invitation, WorkspaceGrant, locator, make_account_and_link,
    };
    use crate::organization::member::removal;
    use crate::organization::member::vault::KdfParams;
    use crate::organization::role::permission::{self, Flag};
    use crate::organization::role::{assign_role, create_role};
    use crate::organization::session::{CredentialSlot, MemberSession, sign_in};
    use crate::organization::setup::{CreateOrganization, Remote, create_organization};
    use crate::organization::store::{MemberRecord, OrganizationStore, Signer, TABLES};
    use crate::organization::workspace::remote::Pipeline;
    use crate::organization::workspace::{create_workspace, signer_of};
    use crate::persisted::Persisted;
    use crate::sync::test::server::{ScriptedResponse, ScriptedServer};
    use crate::test::scratch;
    use crate::turso::discovery::McpEndpoint;
    use crate::turso::platform::{AccessLevel, InMemoryPlatform};
    use serde_json::json;
    use std::sync::{Arc, Mutex};

    const PASSWORD: &str = "the owners password";

    const NOW: i64 = 1_757_000_000_000;

    fn test_cost() -> KdfParams {
        KdfParams {
            memory_kib: 1024,
            iterations: 2,
            lanes: 1,
        }
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
        crate::organization::invitation::vault_password_of(
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
            format: None,
            machine_signed_out: 0,
            turso_organization: None,
            workspace_id: None,
            name_signed: false,
        }
    }

    /// An organization with its owner signed in and one workspace, on a fake account.
    async fn owned(
        credentials: &dyn CredentialStore,
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
            credentials,
            &crate::clock::System::shared(),
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
        let joined = store.selected().cloned().expect("the record");
        let mut owner = sign_in(&organization, &joined, PASSWORD, &slot())
            .await
            .expect("the owner did not sign in");
        let pipeline = crate::sync::test::pipeline::LocalPipeline::start().await;
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
            crate::clock::System::shared(),
            &OrganizationStore::replica_path(&elsewhere.join("app.db"), organization_id),
            None,
            || async { Err(turso::Error::Misuse("no remote".into())) },
        )
        .await
        .expect("their replica did not open")
    }

    // -------------------------------------------------------------------------------------
    // Effort 838, requirements 3 to 7 and 9: roles, assignment and the override.
    // -------------------------------------------------------------------------------------

    /// The word a refusal carries, or a panic naming what came back instead.
    fn reason_of(error: &Error) -> RefusalReason {
        match error {
            Error::Refused { reason, .. } => *reason,
            other => panic!("not a refusal: {other:?}"),
        }
    }

    /// A member's row, read through the verified reader.
    async fn member_row(
        store: &OrganizationStore,
        owner: &MemberSession,
        id: &str,
    ) -> MemberRecord {
        store
            .members(&owner.verifying_key)
            .await
            .expect("the rows verify")
            .into_iter()
            .find(|member| member.id == id)
            .expect("the member row")
    }

    /// The one live certificate a member holds: **every live member holds exactly one**, and this
    /// fails where they hold none or two.
    async fn the_certificate(
        store: &OrganizationStore,
        owner: &MemberSession,
        member_id: &str,
    ) -> Certificate {
        let mut live = store
            .live_certificates(&owner.verifying_key, member_id)
            .await
            .expect("the certificates");

        assert_eq!(
            live.len(),
            1,
            "{member_id} holds {} live certificates",
            live.len()
        );

        live.pop().expect("the certificate")
    }

    /// A custom role made by the owner, directly below `after`.
    async fn a_role(
        store: &OrganizationStore,
        owner: &MemberSession,
        name: &str,
        mask: i64,
        after: &str,
    ) -> String {
        create_role(store, owner, name, mask, after, NOW)
            .await
            .unwrap_or_else(|error| panic!("the owner could not make {name}: {error:?}"))
            .id
    }

    /// A member signed in, given `role_id` by the owner.
    async fn holding_role(
        store: &OrganizationStore,
        owner: &MemberSession,
        link: &Locator,
        username: &'static str,
        role_id: &str,
        workspace_id: &str,
    ) -> MemberSession {
        let (_, session) = a_member(
            store,
            owner,
            link,
            username,
            permission::MEMBER,
            workspace_id,
        )
        .await;

        if role_id != permission::MEMBER {
            assign_role(store, owner, &session.member_id, role_id, None, NOW)
                .await
                .unwrap_or_else(|error| panic!("{username} was not given {role_id}: {error:?}"));
        }

        session
    }

    /// Sign `victim`'s row again under `forger`'s certificate, around the store, as the role given
    /// and removed where asked: a demotion written by somebody holding the credential.
    async fn demoted_around_the_store(
        store: &OrganizationStore,
        owner: &MemberSession,
        forger: &MemberSession,
        victim_id: &str,
        role_id: &str,
        removed_at: Option<i64>,
    ) {
        let (key, certificate) = signer_of(store, forger).await.expect("the forger signs");

        store
            .write_member_around_the_check(
                &Signer {
                    key: &key,
                    certificate: &certificate,
                },
                &MemberRecord {
                    role_id: role_id.to_string(),
                    override_mask: 0,
                    removed_at,
                    ..member_row(store, owner, victim_id).await
                },
            )
            .await
            .expect("written around the store");
    }

    /// A lead: the member role's flags with `inviteMember` and `grantWorkspace`, below the
    /// manager, signed in.
    async fn a_lead(
        store: &OrganizationStore,
        owner: &MemberSession,
        link: &Locator,
        workspace_id: &str,
    ) -> MemberSession {
        let lead = a_role(
            store,
            owner,
            "Lead",
            permission::MEMBER_ROLE.mask
                | permission::mask_of(&[Flag::InviteMember, Flag::GrantWorkspace]),
            permission::MANAGER,
        )
        .await;

        holding_role(store, owner, link, "lena", &lead, workspace_id).await
    }

    /// **The owner's machine repairs a forged demotion of the owner's row at sign-in, with nobody
    /// acting.** A lead signs the owner's row naming the member role, and then removed, around the
    /// store; every other machine reads the owner with no permissions. The owner signs in on their
    /// own machine, which holds the root, and afterwards every machine reads the owner as the
    /// owner with every flag, the vault and the username as they were.
    #[tokio::test]
    async fn the_owners_machine_repairs_a_forged_demotion_of_the_owners_row_at_sign_in() {
        let credentials = Memory::new();
        let directory = scratch("owner-repair");
        let (store, owner, link, workspace_id) = owned(&credentials, &directory).await;
        let lead = a_role(
            &store,
            &owner,
            "Lead",
            permission::MEMBER_ROLE.mask
                | permission::mask_of(&[Flag::InviteMember, Flag::GrantWorkspace]),
            permission::MANAGER,
        )
        .await;
        let lena = holding_role(&store, &owner, &link, "lena", &lead, &workspace_id).await;
        let before = member_row(&store, &owner, &owner.member_id).await;

        for removed_at in [None, Some(NOW + 1)] {
            demoted_around_the_store(
                &store,
                &owner,
                &lena,
                &owner.member_id,
                permission::MEMBER,
                removed_at,
            )
            .await;

            assert_eq!(
                member_row(
                    &another_machine(&directory, &owner.organization_id).await,
                    &owner,
                    &owner.member_id
                )
                .await
                .effective,
                0
            );

            let signed_in = sign_in(
                &store,
                &joined_as(&owner, &owner.member_id, permission::OWNER),
                PASSWORD,
                &slot(),
            )
            .await
            .expect("the owner signs in");

            assert_eq!(signed_in.permissions, permission::OWNER_ROLE.mask);

            for machine in [
                &store,
                &another_machine(&directory, &owner.organization_id).await,
            ] {
                let row = member_row(machine, &owner, &owner.member_id).await;

                assert_eq!(row.role_id, permission::OWNER);
                assert_eq!(row.removed_at, None);
                assert_eq!(row.effective, permission::OWNER_ROLE.mask);
                assert_eq!(row.vault, before.vault);
                assert_eq!(row.username_sealed, before.username_sealed);
                assert_eq!(row.session_epoch, before.session_epoch);
            }
        }
    }

    /// **A non-owner's machine repairs nothing.** A lead signs a manager's own row naming the
    /// member role around the store. The manager signs in on their machine and still reads with
    /// no permissions: their vault does not derive the organization key, so their machine does not
    /// and cannot write the row, and the repair routine answers that it wrote nothing. The owner
    /// does not save it either, an assignment included, and removes the manager instead.
    #[tokio::test]
    async fn a_managers_machine_does_not_repair_their_own_demoted_row_and_the_owner_removes_them() {
        let credentials = Memory::new();
        let directory = scratch("manager-no-repair");
        let (store, mut owner, link, workspace_id) = owned(&credentials, &directory).await;
        let lead = a_role(
            &store,
            &owner,
            "Lead",
            permission::MEMBER_ROLE.mask
                | permission::mask_of(&[Flag::InviteMember, Flag::GrantWorkspace]),
            permission::MANAGER,
        )
        .await;
        let lena = holding_role(&store, &owner, &link, "lena", &lead, &workspace_id).await;
        let (invited, manny) = a_member(
            &store,
            &owner,
            &link,
            "manny",
            permission::MEMBER,
            &workspace_id,
        )
        .await;

        assign_role(
            &store,
            &owner,
            &manny.member_id,
            permission::MANAGER,
            None,
            NOW,
        )
        .await
        .expect("manny is a manager");
        demoted_around_the_store(
            &store,
            &owner,
            &lena,
            &manny.member_id,
            permission::MEMBER,
            None,
        )
        .await;

        let rows_before = every_row(&store).await;
        let signed_in = sign_in(
            &store,
            &joined_as(&owner, &manny.member_id, permission::MANAGER),
            &secret_of(&invited),
            &slot(),
        )
        .await
        .expect("manny signs in");

        assert_eq!(signed_in.permissions, 0);
        assert!(
            !super::repair_owner_row(
                &store,
                &owner.verifying_key,
                &manny.member_id,
                &signed_in.secret,
                NOW + 1,
            )
            .await
            .expect("the repair answers")
        );
        assert_eq!(
            every_row(&store).await,
            rows_before,
            "a manager's machine wrote"
        );
        assert_eq!(
            member_row(&store, &owner, &manny.member_id).await.effective,
            0
        );

        assert_eq!(
            reason_of(
                &assign_role(
                    &store,
                    &owner,
                    &manny.member_id,
                    permission::MANAGER,
                    None,
                    NOW + 2,
                )
                .await
                .expect_err("the owner saved an uncovered row")
            ),
            RefusalReason::RoleUnsettled
        );
        removal::remove_member(
            &store,
            &mut owner,
            no_platform(),
            "org-database",
            &manny.member_id,
            false,
            NOW + 3,
        )
        .await
        .expect("the owner removes manny");

        let row = member_row(
            &another_machine(&directory, &owner.organization_id).await,
            &owner,
            &manny.member_id,
        )
        .await;

        assert!(row.removed_at.is_some());
        assert_eq!(row.effective, 0);
    }

    /// **The owner's repair takes the owner's own keys, never the row's** (the re-check of ticket
    /// 20). A lead signs the owner's row naming the member role with a signing key the lead
    /// generated and an offer's seal, around the store. The owner signs in, and the repaired row,
    /// on every machine, names the key the owner's root certificate names, the vault's public half
    /// the owner's secret opens, and no seal.
    #[tokio::test]
    async fn the_owners_repair_takes_the_owners_own_keys_and_never_the_rows() {
        let credentials = Memory::new();
        let directory = scratch("owner-repair-keys");
        let (store, owner, link, workspace_id) = owned(&credentials, &directory).await;
        let lena = a_lead(&store, &owner, &link, &workspace_id).await;
        let root = the_certificate(&store, &owner, &owner.member_id).await;
        let forger = AdministratorKey::generate().expect("a key");
        let (key, certificate) = signer_of(&store, &lena).await.expect("lena signs");

        assert!(root.is_root());

        store
            .write_member_around_the_check(
                &Signer {
                    key: &key,
                    certificate: &certificate,
                },
                &MemberRecord {
                    role_id: permission::MEMBER.to_string(),
                    signing_public_key: forger.verifying_key(),
                    owner_seed_sealed: Some(b"a seal of the forger's".to_vec()),
                    ..member_row(&store, &owner, &owner.member_id).await
                },
            )
            .await
            .expect("written around the store");

        let signed_in = sign_in(
            &store,
            &joined_as(&owner, &owner.member_id, permission::OWNER),
            PASSWORD,
            &slot(),
        )
        .await
        .expect("the owner signs in");

        for machine in [
            &store,
            &another_machine(&directory, &owner.organization_id).await,
        ] {
            let row = member_row(machine, &owner, &owner.member_id).await;

            assert_eq!(row.role_id, permission::OWNER);
            assert_eq!(row.signing_public_key, root.signing_public_key);
            assert_ne!(row.signing_public_key, forger.verifying_key());
            assert_eq!(row.vault.public_key, signed_in.secret.public_key());
            assert_eq!(row.owner_seed_sealed, None);
        }
    }
}
