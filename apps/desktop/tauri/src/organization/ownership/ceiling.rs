//! the owner's root brought up to every flag this build knows (effort 857, requirement 3): a flag
//! added since the root was issued reaches the owner, the built-in roles that carry it by default,
//! and every certificate whose standing then reaches further than it, at the owner's first sign-in
//! on the build that added it.

use std::collections::HashMap;

use crate::{
    diagnostics,
    error::{Error, RefusalReason},
};

use crate::organization::{
    authority::{
        AdministratorKey, Certificate, Chain, VERIFYING_KEY_BYTES, issue_root_certificate, revoke,
        unused_certificate_id,
    },
    member::vault::MemberSecretKey,
    role::{
        Standing,
        certificate::reissue_what_it_issued,
        in_one_transaction,
        permission::{self, BUILT_IN, OWNER_ROLE},
        reissue_within, sent,
    },
    setup::{ADMINISTRATOR_KEY_PURPOSE, owner_key_from},
    store::{OrganizationStore, RoleRecord, Signer},
};

/// What somebody is told who asks for an upgrade before the owner has opened this version of
/// rentable (effort 857, ticket 15): until the owner's machine has run [`widen_root`], a
/// permission this version added is in nobody's certificate, the owner's included. The upgrade
/// command is ticket 07's; the refusal is here, beside the one act that ends it.
pub const THE_OWNER_HAS_NOT_OPENED_THIS_VERSION: &str =
    "the owner has not opened this version of rentable yet, and upgrading waits until they have";

/// Whether the owner has opened this version: a live root's ceiling holds every flag this build's
/// owner role carries, which [`widen_root`] makes true at the owner's first sign-in on it and
/// nothing else does once the organization exists. Asked by the upgrade (ticket 07).
pub(in crate::organization) async fn owner_has_opened_this_version(
    store: &OrganizationStore,
    organization_verifying_key: &[u8; VERIFYING_KEY_BYTES],
) -> Result<bool, Error> {
    let (certificates, revocations) = store.chain_rows().await?;
    let chain = Chain::new(organization_verifying_key, &certificates, &revocations);

    Ok(certificates.iter().any(|certificate| {
        certificate.is_root()
            && OWNER_ROLE.mask & !certificate.ceiling == 0
            && chain.live(&certificate.id).is_ok()
    }))
}

/// [`owner_has_opened_this_version`] as the refusal an act waiting on it makes, by name
/// ([`RefusalReason::OwnerNotUpdated`]): what the upgrade refuses a manager with (ticket 07).
pub(in crate::organization) async fn refuse_until_the_owner_has_opened_this_version(
    store: &OrganizationStore,
    organization_verifying_key: &[u8; VERIFYING_KEY_BYTES],
) -> Result<(), Error> {
    if owner_has_opened_this_version(store, organization_verifying_key).await? {
        return Ok(());
    }

    Err(Error::refused(
        RefusalReason::OwnerNotUpdated,
        THE_OWNER_HAS_NOT_OPENED_THIS_VERSION,
    ))
}

/// Re-issue the owner's root with every flag this build's owner role carries, where it lacks one:
/// what the owner's machine does, with nobody acting, at a sign-in, a resume or a heartbeat
/// (effort 857, requirement 3, and the plan's *Migration*). Answers whether it wrote.
///
/// **Why a new root at all.** A root carries the owner's mask as it was when it was issued, under
/// the organization key's signature, and a role row is covered only where its mask sits inside its
/// signer's ceiling, the root's included (`authority::covers`). So a flag added since is one no
/// certificate in the organization carries: the owner cannot sign a role holding it, a manager
/// cannot give it by override, and the manager role cannot carry it by default. Only the holder of
/// the organization key can issue a wider root, and that is the owner's machine.
///
/// **In order, in one transaction**, on the pattern of the handover's re-signing
/// (`accept_ownership`), with the key unchanged: a new root, under a fresh id, with the owner's
/// whole mask; what the old one issued issued again from it under the same ids, and what the old
/// one signed signed again under it; the old one revoked by it. Then each built-in role gains the
/// flags its default carries among those the old root lacked, keeping any other edit the owner
/// made to it; and every live member whose standing now reaches further than their certificate is
/// issued one that holds it (`role::reissue_within`). Every row and certificate verifies
/// afterwards, on this build and on an earlier one, since a mask is a number to both.
///
/// **Once, and recorded by the root itself.** It runs only where the live root lacks a flag this
/// build's owner role carries, and it leaves a root that lacks none, so a second sign-in writes
/// nothing, and a role the owner edits afterwards to drop a flag keeps it dropped. The next flag
/// added takes the same path at the owner's first sign-in on the build that adds it.
///
/// **Only the owner's machine**, as [`repair_owner_row`](super::repair_owner_row) decides it:
/// `secret` derives the pinned key, and a live root names the signing key it derives. On every
/// other machine nothing is read past that and nothing is written.
pub(in crate::organization) async fn widen_root(
    store: &OrganizationStore,
    organization_verifying_key: &[u8; VERIFYING_KEY_BYTES],
    member_id: &str,
    secret: &MemberSecretKey,
    now: i64,
) -> Result<bool, Error> {
    let organization_key = owner_key_from(secret)?;

    if organization_key.verifying_key() != *organization_verifying_key {
        return Ok(false);
    }

    let key = AdministratorKey::from_bytes(&secret.derive_seed(ADMINISTRATOR_KEY_PURPOSE)?);
    let roots: Vec<Certificate> = store
        .live_certificates(organization_verifying_key, member_id)
        .await?
        .into_iter()
        .filter(|certificate| {
            certificate.is_root() && certificate.signing_public_key == key.verifying_key()
        })
        .collect();

    // the flags this build's owner holds that the root the owner signs with does not: nothing
    // where a root of theirs holds every one, or where none of theirs is live here.
    let Some(added) = roots
        .iter()
        .map(|root| OWNER_ROLE.mask & !root.ceiling)
        .min_by_key(|added| added.count_ones())
        .filter(|added| *added != 0)
    else {
        return Ok(false);
    };

    in_one_transaction(store, async {
        let issued_at = now.to_string();
        let root = issue_root_certificate(
            &organization_key,
            &unused_certificate_id(&store.certificates().await?, member_id, &issued_at),
            member_id,
            &key.verifying_key(),
            &issued_at,
        );

        store.write_certificate(&root).await?;

        let signer = Signer {
            key: &key,
            certificate: &root,
        };

        // what the old root issued, issued again from the new one under the same ids, and what it
        // signed, signed again under the new one, before it is revoked: a revocation retires
        // everything below the certificate it names.
        for old in &roots {
            reissue_what_it_issued(store, organization_verifying_key, &signer, old).await?;
        }

        let retiring: Vec<&str> = roots.iter().map(|old| old.id.as_str()).collect();

        store
            .re_sign_rows_of_certificates_but(organization_verifying_key, &retiring, &signer, &[])
            .await?;

        for old in &roots {
            store
                .write_revocation(&revoke(&key, &root, old, &issued_at)?)
                .await?;
        }

        // each built-in role gains what its default carries among the flags added, and keeps
        // everything else the owner set on it. The owner's role is a constant and has no row.
        for role in store.roles(organization_verifying_key).await? {
            let Some(built_in) = BUILT_IN
                .iter()
                .find(|built_in| built_in.id != permission::OWNER && built_in.id == role.id)
            else {
                continue;
            };
            let gained = built_in.mask & added & !role.mask;

            if gained != 0 {
                store
                    .write_role(
                        &signer,
                        &RoleRecord {
                            mask: role.mask | gained,
                            ..role
                        },
                    )
                    .await?;
            }
        }

        // and every live member whose standing now reaches further than a certificate they hold
        // is issued one that holds it, from the new root. Read after the roles are written, so
        // each row's effective permissions are what the roles now give.
        let ranks: HashMap<String, i64> = store
            .roles(organization_verifying_key)
            .await?
            .into_iter()
            .map(|role| (role.id, role.rank))
            .collect();

        for member in store.members(organization_verifying_key).await? {
            if member.removed_at.is_some() || member.role_id == permission::OWNER {
                continue;
            }

            let Some(rank) = ranks.get(&member.role_id).copied() else {
                continue;
            };

            if !store
                .live_certificates(organization_verifying_key, &member.id)
                .await?
                .iter()
                .any(|certificate| member.effective & !certificate.ceiling != 0)
            {
                continue;
            }

            reissue_within(
                store,
                organization_verifying_key,
                &signer,
                &member.id,
                Some((
                    &member.signing_public_key,
                    Standing {
                        role_id: &member.role_id,
                        override_mask: member.override_mask,
                        effective: member.effective,
                        rank,
                    },
                )),
                now,
            )
            .await?;
        }

        Ok(())
    })
    .await?;

    sent(
        store,
        "organization.owner.rootWidenedNotYetSent",
        "member",
        member_id,
    )
    .await;
    diagnostics::info("organization.owner.rootWidened")
        .with("member", member_id)
        .with("flags", added.to_string())
        .write();

    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::{
        THE_OWNER_HAS_NOT_OPENED_THIS_VERSION, owner_has_opened_this_version,
        refuse_until_the_owner_has_opened_this_version,
    };
    use crate::credential::{CredentialStore, Memory};
    use crate::error::{Error, RefusalReason};
    use crate::machine::RemoteSyncStore;
    use crate::organization::HeldOrganization;
    use crate::organization::authority::{
        Certificate, Chain, VERIFYING_KEY_BYTES, root_issued_with,
    };
    use crate::organization::invitation::link::Locator;
    use crate::organization::invitation::{
        AccountAndLink, Invitation, WorkspaceGrant, locator, make_account_and_link,
    };
    use crate::organization::member::vault::KdfParams;
    use crate::organization::ownership::organization_key_of;
    use crate::organization::role::permission::{self, Flag};
    use crate::organization::role::{assign_role, create_role, set_override, set_role_mask};
    use crate::organization::session::{CredentialSlot, MemberSession, sign_in};
    use crate::organization::setup::{CreateOrganization, Remote, create_organization};
    use crate::organization::store::{OrganizationStore, RoleRecord, Signer, TABLES};
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

    /// The flag effort 857 added, which no root issued before it carries.
    fn upgrade_data() -> i64 {
        permission::mask_of(&[Flag::UpgradeData])
    }

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
    /// together, as the person opening the link has them.
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
            name_signed_at: 0,
            lock_marked: false,
            own_lock_latched: Vec::new(),
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

    /// The organization as a build from before effort 857 left it, written before anybody else
    /// joins: the root's ceiling the owner's mask as it was then, under the organization key, and
    /// the manager role's mask the manager's as it was then, under that root. Everything made
    /// afterwards is issued and signed under those, as the earlier build issued and signed it.
    async fn as_before_857(store: &OrganizationStore, owner: &MemberSession) {
        let (key, root) = signer_of(store, owner).await.expect("the root");
        let manager = store
            .roles(&owner.verifying_key)
            .await
            .expect("the roles")
            .into_iter()
            .find(|role| role.id == permission::MANAGER)
            .expect("the manager role");

        // the role first, under the root as it stands: once the root lacks the flag, it covers no
        // role carrying it.
        store
            .write_role(
                &Signer {
                    key: &key,
                    certificate: &root,
                },
                &RoleRecord {
                    mask: manager.mask & !upgrade_data(),
                    ..manager
                },
            )
            .await
            .expect("the manager role as it was");
        store
            .write_certificate(&root_issued_with(
                &organization_key_of(owner).expect("the organization key"),
                &root,
                root.ceiling & !upgrade_data(),
            ))
            .await
            .expect("the root as it was");

        assert!(!permission::permits(
            the_root(store, &owner.verifying_key).await.ceiling,
            Flag::UpgradeData
        ));
    }

    /// A member of this organization, made by `by`, unlocked by them and signed in, with their
    /// password change settled the way an accept settles it.
    async fn a_member(
        store: &OrganizationStore,
        by: &MemberSession,
        link: &Locator,
        username: &'static str,
        role: &str,
        workspace_id: &str,
    ) -> (AccountAndLink, MemberSession) {
        let workspaces = full(&[workspace_id.to_string()]);
        let invited = make_account_and_link(
            store,
            by,
            None::<&InMemoryPlatform>,
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

        crate::organization::member::lock::unlocked_for_a_test(store, by, &invited.member_id)
            .await
            .expect("the member is unlocked");

        let mut session = sign_in(
            store,
            &joined_as(by, &invited.member_id, role),
            &secret_of(&invited),
            &slot(),
        )
        .await
        .expect("the invited member did not sign in");
        session.must_change_password = false;

        (invited, session)
    }

    /// The owner signing in again on this machine.
    async fn the_owner_signs_in(store: &OrganizationStore, owner: &MemberSession) -> MemberSession {
        sign_in(
            store,
            &joined_as(owner, &owner.member_id, permission::OWNER),
            PASSWORD,
            &slot(),
        )
        .await
        .expect("the owner signs in")
    }

    /// Every row of the organization, cell by cell, so a sign-in that wrote something is caught
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

    /// How many rows a table holds as they lie, verified by nobody.
    async fn rows_in(store: &OrganizationStore, table: &str) -> usize {
        let mut rows = store
            .connection()
            .query(&format!("SELECT COUNT(*) FROM \"{table}\""), ())
            .await
            .expect("the count");
        let row = rows.next().await.expect("a row").expect("the count");

        match row.get_value(0).expect("a value") {
            turso::Value::Integer(count) => usize::try_from(count).expect("a count"),
            other => panic!("not a count: {other:?}"),
        }
    }

    /// **Every signed row verifies**: each table's verified reader returns every row the table
    /// holds, so none was refused and none left out, and the member and role readers, which
    /// refuse the whole read on one row that does not verify, read.
    async fn every_row_verifies(store: &OrganizationStore, key: &[u8; VERIFYING_KEY_BYTES]) {
        let read = [
            (
                "member",
                store.members(key).await.expect("the member rows").len(),
            ),
            ("role", store.roles(key).await.expect("the role rows").len()),
            (
                "workspace",
                store.workspaces(key).await.expect("the workspaces").len(),
            ),
            ("grant", store.grants(key).await.expect("the grants").len()),
            (
                "invitation",
                store.invitations(key).await.expect("the invitations").len(),
            ),
            (
                "workspace_override",
                store
                    .workspace_overrides(key)
                    .await
                    .expect("the overrides")
                    .len(),
            ),
            (
                "mark",
                usize::from(store.mark(key).await.expect("the mark").is_some()),
            ),
            (
                "organization_name",
                usize::from(
                    store
                        .organization_name(key)
                        .await
                        .expect("the name")
                        .is_some(),
                ),
            ),
            (
                "member_lock",
                store
                    .signed_member_locks(key)
                    .await
                    .expect("the locks")
                    .len(),
            ),
        ];

        for (table, verified) in read {
            assert_eq!(
                verified,
                rows_in(store, table).await,
                "a {table} row does not verify"
            );
        }

        for member in store.members(key).await.expect("the member rows") {
            assert_eq!(
                member.effective,
                permission::effective(
                    store
                        .role_standing(key, &member.role_id)
                        .await
                        .expect("the role")
                        .0,
                    member.override_mask
                ),
                "{}'s row reads as granting nothing",
                member.id
            );
        }
    }

    /// The live root, the one the owner signs with.
    async fn the_root(store: &OrganizationStore, key: &[u8; VERIFYING_KEY_BYTES]) -> Certificate {
        let (certificates, revocations) = store.chain_rows().await.expect("the chain");
        let chain = Chain::new(key, &certificates, &revocations);
        let mut roots: Vec<Certificate> = certificates
            .iter()
            .filter(|certificate| certificate.is_root() && chain.live(&certificate.id).is_ok())
            .cloned()
            .collect();

        assert_eq!(roots.len(), 1, "{} roots are live", roots.len());

        roots.pop().expect("the root")
    }

    /// The one live certificate a member holds: **every live member holds exactly one**, and this
    /// fails where they hold none or two.
    async fn the_certificate(
        store: &OrganizationStore,
        key: &[u8; VERIFYING_KEY_BYTES],
        member_id: &str,
    ) -> Certificate {
        let mut live = store
            .live_certificates(key, member_id)
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

    /// The ids of every certificate that is not live, revoked or broken.
    async fn not_live(store: &OrganizationStore, key: &[u8; VERIFYING_KEY_BYTES]) -> Vec<String> {
        let (certificates, revocations) = store.chain_rows().await.expect("the chain");
        let chain = Chain::new(key, &certificates, &revocations);
        let mut ids: Vec<String> = certificates
            .iter()
            .filter(|certificate| chain.live(&certificate.id).is_err())
            .map(|certificate| certificate.id.clone())
            .collect();

        ids.sort();
        ids
    }

    /// The manager role's mask as its verified row carries it.
    async fn managers_mask(store: &OrganizationStore, key: &[u8; VERIFYING_KEY_BYTES]) -> i64 {
        store
            .role_standing(key, permission::MANAGER)
            .await
            .expect("the manager role")
            .0
    }

    /// A copy of the replica as another machine would hold it, opened as a second store. Every
    /// read through it verifies against the key given rather than the one the database carries.
    async fn another_machine(
        directory: &std::path::Path,
        organization_id: &str,
    ) -> OrganizationStore {
        let elsewhere = scratch("ceiling-elsewhere");

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

    fn reason_of(error: &Error) -> RefusalReason {
        match error {
            Error::Refused { reason, .. } => *reason,
            other => panic!("not a refusal: {other:?}"),
        }
    }

    /// **Criteria 1 and 3 of ticket 15.** An organization from before effort 857: a manager, who
    /// has made an account of their own, a member, and a custom role's holder, with the mark and a
    /// workspace override the root signed. Before the owner signs in on this build, the manager
    /// cannot give `upgradeData` by override and the owner cannot sign a role carrying it.
    ///
    /// The owner signs in, and afterwards **one root is live, carrying the owner's whole mask**;
    /// the old one is revoked, and so is the manager's old certificate, and nothing else: every
    /// certificate that was live is live, the one the manager issued included. The manager holds
    /// one certificate, carrying the manager's whole mask. Every row verifies, on this machine and
    /// on a copy of the replica read as another machine reads it. Then the manager gives the flag
    /// by override, and the owner signs a role carrying it, whose holder's certificate carries it.
    #[tokio::test]
    async fn the_owners_first_sign_in_re_issues_the_root_and_every_row_and_certificate_verifies() {
        let credentials = Memory::new();
        let directory = scratch("ceiling-root");
        let (store, owner, link, workspace_id) = owned(&credentials, &directory).await;
        let key = owner.verifying_key;

        as_before_857(&store, &owner).await;

        let (_, max) = a_member(
            &store,
            &owner,
            &link,
            "max.manager",
            permission::MANAGER,
            &workspace_id,
        )
        .await;
        let (_, sami) = a_member(
            &store,
            &owner,
            &link,
            "sami.staff",
            permission::MEMBER,
            &workspace_id,
        )
        .await;
        let (_, celia) = a_member(
            &store,
            &max,
            &link,
            "celia.staff",
            permission::MEMBER,
            &workspace_id,
        )
        .await;
        let lead = create_role(
            &store,
            &owner,
            "Lead",
            permission::MEMBER_ROLE.mask | permission::mask_of(&[Flag::InviteMember]),
            permission::MANAGER,
            NOW,
        )
        .await
        .expect("the owner makes a role")
        .id;
        let (_, lena) = a_member(
            &store,
            &owner,
            &link,
            "lena.lead",
            permission::MEMBER,
            &workspace_id,
        )
        .await;

        assign_role(&store, &owner, &lena.member_id, &lead, None, NOW)
            .await
            .expect("lena leads");
        crate::organization::mark::set_mark(
            &store,
            &owner,
            &[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 13],
            NOW,
        )
        .await
        .expect("the owner sets the mark");
        crate::organization::role::set_workspace_override(
            &store,
            &owner,
            &sami.member_id,
            &workspace_id,
            permission::mask_of(&[Flag::DeleteUnit]),
            0,
        )
        .await
        .expect("the owner pins something for sami");

        let old_root = the_root(&store, &key).await;
        let maxs_before = the_certificate(&store, &key, &max.member_id).await;
        let celias = the_certificate(&store, &key, &celia.member_id).await;
        let lenas = the_certificate(&store, &key, &lena.member_id).await;
        let not_live_before = not_live(&store, &key).await;

        assert!(!permission::permits(maxs_before.ceiling, Flag::UpgradeData));
        assert_eq!(
            celias.issuer_certificate_id.as_deref(),
            Some(maxs_before.id.as_str())
        );
        every_row_verifies(&store, &key).await;

        // before: the flag is out of everybody's reach.
        set_override(&store, &max, &sami.member_id, upgrade_data(), NOW)
            .await
            .expect_err("a manager gave a flag their certificate does not carry");
        create_role(
            &store,
            &owner,
            "Upkeep",
            permission::MEMBER_ROLE.mask | upgrade_data(),
            permission::MANAGER,
            NOW,
        )
        .await
        .expect_err("the owner signed a role their root does not cover");

        let owner = the_owner_signs_in(&store, &owner).await;
        let root = the_root(&store, &key).await;

        assert_ne!(root.id, old_root.id);
        assert_eq!(root.member_id, owner.member_id);
        assert_eq!(root.ceiling, permission::OWNER_ROLE.mask);
        assert_eq!(root.signing_public_key, old_root.signing_public_key);

        // revoked by a row naming it, and the only certificates that stopped are the old root and
        // the manager's old one.
        assert!(
            store
                .revocations()
                .await
                .expect("the revocations")
                .iter()
                .any(|revocation| revocation.certificate_id == old_root.id
                    && revocation.revoker_certificate_id == root.id)
        );

        let mut stopped = not_live_before.clone();

        stopped.extend([old_root.id.clone(), maxs_before.id.clone()]);
        stopped.sort();

        assert_eq!(not_live(&store, &key).await, stopped);

        // the manager holds one certificate, carrying the manager's whole mask; what they issued
        // stands, and the lead, whose standing did not move, keeps the one they held, issued again
        // from the new root as everything the old one issued is.
        let maxs = the_certificate(&store, &key, &max.member_id).await;
        let lenas_now = the_certificate(&store, &key, &lena.member_id).await;

        assert_ne!(maxs.id, maxs_before.id);
        assert_eq!(maxs.ceiling, permission::MANAGER_ROLE.mask);
        assert_eq!(maxs.rank, permission::MANAGER_ROLE.rank);
        assert_eq!(
            the_certificate(&store, &key, &celia.member_id).await.id,
            celias.id
        );
        assert_eq!(
            Certificate {
                issuer_certificate_id: Some(root.id.clone()),
                signature: lenas_now.signature.clone(),
                ..lenas
            },
            lenas_now
        );
        assert_eq!(
            managers_mask(&store, &key).await,
            permission::MANAGER_ROLE.mask
        );

        // every row, here and as another machine reads the replica.
        every_row_verifies(&store, &key).await;
        every_row_verifies(
            &another_machine(&directory, &owner.organization_id).await,
            &key,
        )
        .await;

        // and the flag is in reach: the manager gives it by override, and the owner signs a role
        // carrying it, whose holder's certificate carries it.
        let given = set_override(&store, &max, &sami.member_id, upgrade_data(), NOW + 1)
            .await
            .expect("the manager gives the flag");

        assert!(permission::permits(given.permissions, Flag::UpgradeData));

        let upkeep = create_role(
            &store,
            &owner,
            "Upkeep",
            permission::MEMBER_ROLE.mask | upgrade_data(),
            permission::MANAGER,
            NOW + 1,
        )
        .await
        .expect("the owner signs a role carrying the flag")
        .id;

        assign_role(&store, &owner, &lena.member_id, &upkeep, None, NOW + 2)
            .await
            .expect("lena keeps up");

        assert!(permission::permits(
            the_certificate(&store, &key, &lena.member_id).await.ceiling,
            Flag::UpgradeData
        ));
        every_row_verifies(&store, &key).await;
    }

    /// **Criterion 2 of ticket 15.** The stored manager role gains `upgradeData` as a signed
    /// write, once: unedited, it becomes the manager's whole mask; edited by the owner before, it
    /// keeps the edit and gains the flag alone. The owner then edits it to drop the flag, signs in
    /// again, and it stays dropped, with nothing written by that sign-in.
    #[tokio::test]
    async fn the_manager_role_gains_the_flag_once_and_keeps_the_owners_edits() {
        let edited_out = permission::mask_of(&[Flag::ManageMark, Flag::RenameWorkspace]);

        for edit in [None, Some(edited_out)] {
            let credentials = Memory::new();
            let directory = scratch("ceiling-manager-role");
            let (store, owner, _, _) = owned(&credentials, &directory).await;
            let key = owner.verifying_key;

            as_before_857(&store, &owner).await;

            if let Some(edit) = edit {
                set_role_mask(
                    &store,
                    &owner,
                    permission::MANAGER,
                    managers_mask(&store, &key).await & !edit,
                    NOW,
                )
                .await
                .expect("the owner edits the manager role");
            }

            let before = managers_mask(&store, &key).await;

            assert!(!permission::permits(before, Flag::UpgradeData));

            let owner = the_owner_signs_in(&store, &owner).await;
            let after = managers_mask(&store, &key).await;

            assert_eq!(after, before | upgrade_data(), "edit {edit:?}");
            assert_eq!(
                after,
                permission::MANAGER_ROLE.mask & !edit.unwrap_or(0),
                "edit {edit:?}"
            );

            // the owner drops it again, and the next sign-in leaves it dropped.
            set_role_mask(
                &store,
                &owner,
                permission::MANAGER,
                after & !upgrade_data(),
                NOW + 1,
            )
            .await
            .expect("the owner drops the flag from the manager role");

            let rows_before = every_row(&store).await;

            the_owner_signs_in(&store, &owner).await;

            assert_eq!(managers_mask(&store, &key).await, after & !upgrade_data());
            assert_eq!(every_row(&store).await, rows_before, "edit {edit:?}");
        }
    }

    /// **Criterion 4 of ticket 15.** A manager's sign-in and a member's write nothing and leave the
    /// root as it was; the owner's first writes, and their second writes nothing.
    #[tokio::test]
    async fn only_the_owners_first_sign_in_writes() {
        let credentials = Memory::new();
        let directory = scratch("ceiling-who-writes");
        let (store, owner, link, workspace_id) = owned(&credentials, &directory).await;
        let key = owner.verifying_key;

        as_before_857(&store, &owner).await;

        let (max_invited, max) = a_member(
            &store,
            &owner,
            &link,
            "max.manager",
            permission::MANAGER,
            &workspace_id,
        )
        .await;
        let (sami_invited, sami) = a_member(
            &store,
            &owner,
            &link,
            "sami.staff",
            permission::MEMBER,
            &workspace_id,
        )
        .await;
        let rows = every_row(&store).await;

        for (invited, session, role) in [
            (&max_invited, &max, permission::MANAGER),
            (&sami_invited, &sami, permission::MEMBER),
        ] {
            sign_in(
                &store,
                &joined_as(&owner, &session.member_id, role),
                &secret_of(invited),
                &slot(),
            )
            .await
            .expect("they sign in");

            assert_eq!(every_row(&store).await, rows, "{role}'s sign-in wrote");
        }

        assert!(!permission::permits(
            the_root(&store, &key).await.ceiling,
            Flag::UpgradeData
        ));

        let owner = the_owner_signs_in(&store, &owner).await;
        let widened = every_row(&store).await;

        assert_ne!(widened, rows, "the owner's first sign-in wrote nothing");

        the_owner_signs_in(&store, &owner).await;

        assert_eq!(
            every_row(&store).await,
            widened,
            "the owner's second sign-in wrote"
        );
    }

    /// **Criterion 5 of ticket 15.** Until the owner has opened this version, asking whether they
    /// have answers no and the upgrade's refusal names it; once they have signed in on it, both
    /// say so. An organization made on this version needs nothing.
    #[tokio::test]
    async fn until_the_owner_has_opened_this_version_the_upgrade_is_refused_by_name() {
        let credentials = Memory::new();
        let directory = scratch("ceiling-refusal");
        let (store, owner, _, _) = owned(&credentials, &directory).await;
        let key = owner.verifying_key;

        assert!(
            owner_has_opened_this_version(&store, &key)
                .await
                .expect("the answer")
        );
        refuse_until_the_owner_has_opened_this_version(&store, &key)
            .await
            .expect("an organization made on this version waits for nothing");

        as_before_857(&store, &owner).await;

        assert!(
            !owner_has_opened_this_version(&store, &key)
                .await
                .expect("the answer")
        );

        let refused = refuse_until_the_owner_has_opened_this_version(&store, &key)
            .await
            .expect_err("the upgrade was let through before the owner opened this version");

        assert_eq!(reason_of(&refused), RefusalReason::OwnerNotUpdated);
        assert!(
            matches!(&refused, Error::Refused { message, .. } if message == THE_OWNER_HAS_NOT_OPENED_THIS_VERSION)
        );

        the_owner_signs_in(&store, &owner).await;

        assert!(
            owner_has_opened_this_version(&store, &key)
                .await
                .expect("the answer")
        );
        refuse_until_the_owner_has_opened_this_version(&store, &key)
            .await
            .expect("the owner has opened this version");
    }
}
