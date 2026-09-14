//! a member changes their own password: their vault is re-sealed, and nothing else moves.
//!
//! **A password change touches one row, and three columns of it.** The vault holds a keypair
//! sealed under a key derived from the password; a new password is a new derivation over the
//! same keypair, so `sealed_secret_key`, `kdf_salt` and `kdf_params` are rewritten and the public
//! key stays. Every credential the member holds is sealed to that public key, so no grant is
//! re-sealed, no other member's row is read, and the write carries no signature because nothing
//! the chain vouches for has changed (`organization/store.rs::reseal_member`). A test asserts
//! every other row byte-identical rather than arguing it.
//!
//! **The floor is checked on the machine, and it is the whole defence.** There is no server to
//! slow a guess down, so the password's length is the only thing between anybody holding the
//! database and reading it; the interface says that rather than showing a meter, and the shell
//! refuses anything under the floor before the derivation runs. The floor is the first run's
//! (`setup::MINIMUM_PASSWORD_LENGTH`), because a member's vault is sealed the same way the
//! owner's is.
//!
//! **A reset is not here.** An administrator who does not know a member's password cannot
//! re-seal their vault, because nothing they hold opens it; what they can do is reissue the
//! member a fresh one from what they hold themselves, which is `invite::reissue_invitation`, and
//! a test in this module tries every key an administrator holds against a vault they did not
//! build and finds none of them opens it. That test is what keeps an escrow copy from arriving
//! as a convenience.

use crate::{diagnostics, error::Error};

use super::{
    session::{MemberSession, remember},
    setup::MINIMUM_PASSWORD_LENGTH,
    store::OrganizationStore,
    vault::{KdfParams, open_vault, reseal_vault_with_key},
};

/// Change the signed-in member's password. The current one has to open the vault first, so a
/// machine left unlocked cannot be used to lock its person out; the new one has to reach the
/// floor. What clears `must_change_password` is exactly this, which is what ends a joined
/// member's requirement to change.
pub async fn change_password(
    store: &OrganizationStore,
    session: &mut MemberSession,
    current: &str,
    new: &str,
    kdf_params: KdfParams,
    now: i64,
) -> Result<(), Error> {
    if new.chars().count() < MINIMUM_PASSWORD_LENGTH {
        return Err(Error::InvalidInput {
            message: format!(
                "the password needs at least {MINIMUM_PASSWORD_LENGTH} characters. it is the only \
                 thing between anybody holding the organization's records and reading them"
            ),
        });
    }

    let members = store.members(&session.verifying_key).await?;
    let member = members
        .iter()
        .find(|member| member.id == session.member_id)
        .ok_or_else(|| Error::NotFound {
            message: "this member's row is not in the organization any more".to_string(),
        })?;

    // the current password, tried against the row rather than trusted from the session: a
    // wrong one says only that the value did not open.
    let opened = open_vault(current, &member.vault)?;

    if opened.public_key() != session.secret.public_key() {
        return Err(Error::Integrity {
            message: "the vault the password opened is not the one this session holds".to_string(),
        });
    }

    let (vault, member_key) = reseal_vault_with_key(&session.secret, new, kdf_params)?;

    store
        .reseal_member(&session.member_id, &vault, false, now)
        .await?;

    // the entry this machine stays signed in on, rewritten in the same call: what was filed
    // before this opened the old seal and opens nothing now (effort 826, requirement 12).
    remember(
        &session.organization_id,
        &session.member_id,
        session.session_epoch,
        &member_key,
    );

    if !store.push().await {
        diagnostics::warn("organization.password.notYetSent")
            .with("member", session.member_id.as_str())
            .write();
    }

    session.must_change_password = false;

    diagnostics::info("organization.password.changed")
        .with("member", session.member_id.as_str())
        .write();

    Ok(())
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use serde_json::json;

    use super::change_password;
    use crate::{
        error::Error,
        keyring::{self, take_the_credential_store},
        organization::{
            HeldOrganization,
            invite::{
                Invitation, Invited, WorkspaceGrant, invite_member, organization_link,
                reissue_invitation,
            },
            migrate::Pipeline,
            permission,
            session::{CredentialSlot, MEMBER_KEY_SERVICE, MemberSession, read_entry, sign_in},
            setup::{
                ADMINISTRATOR_KEY_PURPOSE, CreateOrganization, MINIMUM_PASSWORD_LENGTH,
                ORGANIZATION_KEY_PURPOSE, Remote, create_organization,
            },
            store::{OrganizationStore, TABLES},
            vault::{KdfParams, MemberKey, open_sealed_secret_key, unseal_with_secret_key},
            workspace::{create_workspace, grant_workspace},
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

    const OWNER_PASSWORD: &str = "the owners password";
    const AT: i64 = 1_757_000_000_000;

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
        let directory = std::env::temp_dir().join(format!("rentable-password-{name}-{nanos:x}"));
        std::fs::create_dir_all(&directory).expect("scratch directory");

        directory
    }

    fn slot() -> CredentialSlot {
        Arc::new(Mutex::new(None))
    }
    /// No platform authority in hand, which is every session here but the owner's with one.
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

    /// The password an invitation's vault was sealed under: the link's secret and the code
    /// together open it, which is what the person opening the link does (effort 826, requirement
    /// 23). `reader` is any session over this organization. *It was the link's secret alone until
    /// that requirement made the code the other half.*
    async fn secret_of(
        store: &OrganizationStore,
        reader: &MemberSession,
        invited: &Invited,
    ) -> String {
        crate::organization::invite::vault_password_of(store, reader, invited, test_cost()).await
    }

    fn joined_as(owner: &MemberSession, member_id: &str, role: &str) -> HeldOrganization {
        HeldOrganization {
            id: owner.organization_id.clone(),
            name: "Acme".to_string(),
            verifying_key: base64::Engine::encode(
                &base64::engine::general_purpose::URL_SAFE_NO_PAD,
                owner.verifying_key,
            ),
            remote_url: String::new(),
            member_id: Some(member_id.to_string()),
            role: Some(role.to_string()),
            joined_at: 0,
        }
    }

    /// Every cell of every table, as bytes, keyed by table and row position: what "byte-identical"
    /// is asserted over.
    async fn every_row(store: &OrganizationStore) -> Vec<(String, Vec<Option<Vec<u8>>>)> {
        let mut rows_out = Vec::new();

        for table in TABLES {
            let mut rows = store
                .connection()
                .query(&format!("SELECT * FROM \"{table}\" ORDER BY 1"), ())
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

    /// An organization: its owner signed in, two workspaces, an administrator holding the first,
    /// and a member holding both. Everybody has signed in once and changed nothing yet.
    async fn organization(
        directory: &std::path::Path,
    ) -> (
        OrganizationStore,
        MemberSession,
        (String, String),
        (String, String),
        (String, String),
    ) {
        let mut machine = Persisted::<RemoteSyncStore>::load(directory.join("remote-sync.json"))
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
        let (_, store) = create_organization(
            &mut machine,
            "a-platform-token",
            &McpEndpoint::at(&mcp.url("")),
            |_| Arc::clone(&platform),
            Remote::none(),
            &directory.join("app.db"),
            CreateOrganization {
                name: "Acme",
                username: "olivia",
                password: OWNER_PASSWORD,
            },
            test_cost(),
            AT,
        )
        .await
        .expect("the first run failed");
        let joined = machine.organization.clone().expect("the record");
        let mut owner = sign_in(&store, &joined, OWNER_PASSWORD, &slot())
            .await
            .expect("the owner did not sign in");
        let pipeline = ScriptedServer::start(vec![
            ScriptedResponse::new(200, json!({ "results": [] }).to_string()),
            ScriptedResponse::new(200, json!({ "results": [] }).to_string()),
        ])
        .await;
        let north = create_workspace(
            &store,
            &mut owner,
            &platform,
            |_| Pipeline::at(&pipeline.url("")),
            "North",
            AT,
        )
        .await
        .expect("the first workspace");
        let south = create_workspace(
            &store,
            &mut owner,
            &platform,
            |_| Pipeline::at(&pipeline.url("")),
            "South",
            AT,
        )
        .await
        .expect("the second workspace");
        let link = organization_link(&store, &owner).await.expect("the link");
        let administrator = invite_member(
            &store,
            &owner,
            no_platform(),
            &link,
            Invitation {
                username: "ada.admin",
                role: permission::ADMINISTRATOR,
                workspaces: &full(std::slice::from_ref(&north.id)),
            },
            test_cost(),
            AT,
        )
        .await
        .expect("the administrator");
        let member = invite_member(
            &store,
            &owner,
            no_platform(),
            &link,
            Invitation {
                username: "sami.staff",
                role: permission::MEMBER,
                workspaces: &full(&[north.id.clone(), south.id.clone()]),
            },
            test_cost(),
            AT,
        )
        .await
        .expect("the member");

        let administrator = (
            administrator.member_id.clone(),
            secret_of(&store, &owner, &administrator).await,
        );
        let member = (
            member.member_id.clone(),
            secret_of(&store, &owner, &member).await,
        );

        (store, owner, (north.id, south.id), administrator, member)
    }

    /// Criterion 13's first half: a change re-seals the member's own vault and leaves every other
    /// row byte-identical, and the member's own row differs in the vault columns, the flag and
    /// the timestamp and nothing else.
    #[tokio::test]
    async fn a_password_change_touches_the_members_own_vault_and_no_other_row() {
        let directory = scratch("change");
        let (store, owner, (north, south), _, (member_id, generated)) =
            organization(&directory).await;
        let joined = joined_as(&owner, &member_id, permission::MEMBER);
        let credential = slot();
        let mut session = sign_in(&store, &joined, &generated, &credential)
            .await
            .expect("the member did not sign in");

        assert!(session.must_change_password);

        let before = every_row(&store).await;

        change_password(
            &store,
            &mut session,
            &generated,
            "a password of their own choosing",
            test_cost(),
            AT + 1,
        )
        .await
        .expect("the change failed");

        assert!(!session.must_change_password);

        let after = every_row(&store).await;

        assert_eq!(before.len(), after.len(), "a row appeared or disappeared");

        let mut changed = 0;

        for ((table, was), (_, is)) in before.iter().zip(after.iter()) {
            if was == is {
                continue;
            }

            changed += 1;
            assert_eq!(table, "member", "a {table} row changed");
            // id, username, the public key and the signing public key are the first four; the
            // sealed secret key, the content key, the salt and the params follow; role,
            // permissions, the flag, the certificate, the signature, created_at, updated_at
            // close the row.
            assert_eq!(was[0], is[0], "the id changed");
            assert_eq!(
                was[0].as_deref(),
                Some(member_id.as_bytes()),
                "somebody else's row changed"
            );
            assert_eq!(was[1], is[1], "the username changed");
            assert_eq!(was[2], is[2], "the public key changed");
            assert_eq!(was[3], is[3], "the signing public key changed");
            assert_ne!(was[4], is[4], "the sealed secret key did not change");
            assert_eq!(was[5], is[5], "the sealed content key changed");
            assert_ne!(was[6], is[6], "the salt did not change");
            assert_eq!(was[8], is[8], "the role changed");
            assert_eq!(was[9], is[9], "the permissions changed");
            assert_ne!(was[10], is[10], "the flag did not clear");
            assert_eq!(was[11], is[11], "the certificate changed");
            assert_eq!(was[12], is[12], "the signature changed");
            assert_eq!(was[13], is[13], "created_at changed");
        }

        assert_eq!(changed, 1, "{changed} rows changed");

        // the new password opens the same place, with the same grants, and the old one is dead.
        let again = sign_in(&store, &joined, "a password of their own choosing", &slot())
            .await
            .expect("the new password did not open the vault");

        assert!(!again.must_change_password);
        assert!(again.workspace_credentials.contains_key(&north));
        assert!(again.workspace_credentials.contains_key(&south));
        assert!(
            sign_in(&store, &joined, &generated, &slot()).await.is_err(),
            "the old password still opens the vault"
        );
    }

    /// The floor, and the current password: a new password under the floor is refused before
    /// any derivation, and a wrong current password is refused saying only that the value did
    /// not open. Neither writes.
    #[tokio::test]
    async fn the_floor_and_the_current_password_are_both_checked_before_anything_is_written() {
        let directory = scratch("floor");
        let (store, owner, _, _, (member_id, generated)) = organization(&directory).await;
        let joined = joined_as(&owner, &member_id, permission::MEMBER);
        let mut session = sign_in(&store, &joined, &generated, &slot())
            .await
            .expect("the member did not sign in");
        let before = every_row(&store).await;

        let short = "x".repeat(MINIMUM_PASSWORD_LENGTH - 1);
        let refused =
            change_password(&store, &mut session, &generated, &short, test_cost(), AT).await;

        assert!(
            matches!(refused, Err(Error::InvalidInput { .. })),
            "{refused:?}"
        );

        let wrong = change_password(
            &store,
            &mut session,
            "not the password",
            "a password of their own choosing",
            test_cost(),
            AT,
        )
        .await;

        assert!(wrong.is_err(), "a wrong current password changed it");
        assert!(session.must_change_password, "a refusal cleared the flag");
        assert_eq!(before, every_row(&store).await, "a refusal wrote something");
    }

    /// Criterion 13's second half, and the constraint: no key an administrator holds opens a
    /// vault that administrator did not build. Every thirty-two-byte secret the owner and the
    /// administrator hold is tried as a member key against every other member's vault, and their
    /// secret keys are tried against every other member's sealed content key.
    #[tokio::test]
    async fn no_key_an_administrator_holds_opens_a_vault_they_did_not_build() {
        let directory = scratch("escrow");
        let (store, owner, _, (admin_id, admin_password), (member_id, member_password)) =
            organization(&directory).await;
        let administrator = sign_in(
            &store,
            &joined_as(&owner, &admin_id, permission::ADMINISTRATOR),
            &admin_password,
            &slot(),
        )
        .await
        .expect("the administrator did not sign in");
        let members = store
            .members(&owner.verifying_key)
            .await
            .expect("the members");

        // the member's vault is one the owner wrote and the member now holds; after they change
        // their password it is one nobody but the member built.
        let mut member = sign_in(
            &store,
            &joined_as(&owner, &member_id, permission::MEMBER),
            &member_password,
            &slot(),
        )
        .await
        .expect("the member did not sign in");

        change_password(
            &store,
            &mut member,
            &member_password,
            "a password of their own choosing",
            test_cost(),
            AT + 1,
        )
        .await
        .expect("the change failed");

        let members_after = store
            .members(&owner.verifying_key)
            .await
            .expect("the members");

        for (who, holder) in [("owner", &owner), ("administrator", &administrator)] {
            let mut held: Vec<[u8; 32]> = vec![
                holder.secret.to_bytes(),
                holder.content_key.to_bytes(),
                holder.secret.public_key(),
                holder
                    .secret
                    .derive_seed(ORGANIZATION_KEY_PURPOSE)
                    .expect("a seed"),
                holder
                    .secret
                    .derive_seed(ADMINISTRATOR_KEY_PURPOSE)
                    .expect("a seed"),
            ];

            // and the verifying key, which everybody holds.
            held.push(holder.verifying_key);

            for vault_owner in members.iter().chain(members_after.iter()) {
                if vault_owner.id == holder.member_id {
                    continue;
                }

                for key in &held {
                    assert!(
                        open_sealed_secret_key(&MemberKey::from_bytes(*key), &vault_owner.vault)
                            .is_err(),
                        "a key the {who} holds opened {}'s vault",
                        vault_owner.id
                    );
                }

                assert!(
                    unseal_with_secret_key(&holder.secret, &vault_owner.sealed_content_key)
                        .is_err(),
                    "the {who}'s secret opened {}'s sealed content key",
                    vault_owner.id
                );
            }
        }

        // and the members list carries the same number of vaults as members: no second copy of
        // any vault, sealed to anybody, exists in any table.
        assert_eq!(members_after.len(), 3);
    }

    /// Requirement 13: a reset is a reissue from what the resetting administrator holds, without
    /// the member's previous password, and it says which workspaces it could not restore.
    #[tokio::test]
    async fn a_reset_restores_what_the_administrator_reaches_and_names_what_they_do_not() {
        let directory = scratch("reset");
        let (store, owner, (north, south), (admin_id, admin_password), (member_id, _)) =
            organization(&directory).await;
        let administrator = sign_in(
            &store,
            &joined_as(&owner, &admin_id, permission::ADMINISTRATOR),
            &admin_password,
            &slot(),
        )
        .await
        .expect("the administrator did not sign in");
        let mut administrator = administrator;

        // the administrator has settled, and holds north and not south.
        change_password(
            &store,
            &mut administrator,
            &admin_password,
            "the administrators own password",
            test_cost(),
            AT + 1,
        )
        .await
        .expect("the administrator's change failed");
        assert!(administrator.workspace_credentials.contains_key(&north));
        assert!(!administrator.workspace_credentials.contains_key(&south));

        let link = organization_link(&store, &administrator)
            .await
            .expect("the link");
        let reset = reissue_invitation(
            &store,
            &administrator,
            no_platform(),
            &link,
            &member_id,
            test_cost(),
            AT + 2,
        )
        .await
        .expect("the reset failed");

        assert_eq!(
            reset
                .unreachable_workspaces
                .iter()
                .map(|workspace| (workspace.id.as_str(), workspace.name.as_str()))
                .collect::<Vec<_>>(),
            vec![(south.as_str(), "South")]
        );

        // the member signs in with the generated password, holds north, and waits on south.
        let member = sign_in(
            &store,
            &joined_as(&owner, &member_id, permission::MEMBER),
            &secret_of(&store, &owner, &reset).await,
            &slot(),
        )
        .await
        .expect("the reset member did not sign in");

        assert!(member.must_change_password);
        assert!(member.workspace_credentials.contains_key(&north));
        assert!(!member.workspace_credentials.contains_key(&south));

        // somebody who does reach south grants it again, with nothing but the public key.
        grant_workspace::<InMemoryPlatform>(
            &store,
            &owner,
            None,
            &south,
            &member_id,
            AccessLevel::FullAccess,
        )
        .await
        .expect("the owner could not grant south again");

        let member = sign_in(
            &store,
            &joined_as(&owner, &member_id, permission::MEMBER),
            &secret_of(&store, &owner, &reset).await,
            &slot(),
        )
        .await
        .expect("the member did not sign in again");

        assert!(member.workspace_credentials.contains_key(&south));
    }

    /// **Effort 826, requirement 12.** A change rewrites the entry this machine stays signed in
    /// on, in the same call: what was filed before it opened the old seal and opens nothing now,
    /// so a launch after a change that left the old key behind would meet the wall.
    #[tokio::test]
    async fn a_password_change_rewrites_the_key_this_machine_stays_signed_in_on() {
        let _turn = take_the_credential_store().await;
        let directory = scratch("change-remembers");
        let (store, owner, _, _, (member_id, generated)) = organization(&directory).await;
        let joined = joined_as(&owner, &member_id, permission::MEMBER);
        let account = format!("{}:{member_id}", owner.organization_id);
        let mut session = sign_in(&store, &joined, &generated, &slot())
            .await
            .expect("the member did not sign in");

        // what the sign-in on the generated password filed, which the change has to replace.
        keyring::store(MEMBER_KEY_SERVICE, &account, "whatever was filed before")
            .expect("the store would not take the value");

        let chosen = "a password of their own choosing";

        change_password(
            &store,
            &mut session,
            &generated,
            chosen,
            test_cost(),
            AT + 1,
        )
        .await
        .expect("the change failed");

        let filed = keyring::read(MEMBER_KEY_SERVICE, &account)
            .expect("the store would not answer")
            .expect("the change filed no key");
        let (_, key) = read_entry(&filed).expect("what was filed is not a remembered session");
        let row = store
            .members(&owner.verifying_key)
            .await
            .expect("the members")
            .into_iter()
            .find(|row| row.id == member_id)
            .expect("the member row");

        assert!(!filed.contains(chosen), "the password was filed");
        assert_eq!(
            open_sealed_secret_key(&key, &row.vault)
                .expect("the filed key did not open the resealed vault")
                .public_key(),
            session.secret.public_key()
        );
    }
}
