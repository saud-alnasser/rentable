//! a member locked until somebody above them unlocks them (effort 851, requirements 31 to 37).
//!
//! **What locks.** An account an invitation makes is locked from its creation, and an account
//! whose password is reset is locked again (`invitation::write_account` writes the row for both).
//! A locked member signs in, sets their password, signs their own machines out and reads what their
//! role shows; every other act of the organization refuses them (`session::acting_row`). Record
//! writes are the interface's to mask, as every record flag is.
//!
//! **What unlocks.** [`unlock_member`], by the owner or a holder of `assignRole` or
//! `overrideMember` who outranks the member, once the member has set a password of their own, so
//! the person unlocking knows the right person got in. Nobody unlocks themselves.
//!
//! **The lock is signed** (`store::MemberLockRecord`), and a row that does not verify reads locked,
//! so a locked member writing an unlocked row into their own replica unlocks nobody. A member with
//! no row reads unlocked, which is every member carried over from before the table, until
//! [`lock_unset_accounts`] locks those of them who never set a password.

use crate::{diagnostics, error::Error};

use crate::organization::{
    HeldOrganization,
    authority::{AdministratorKey, VERIFYING_KEY_BYTES},
    invitation::writable_account,
    member::vault::MemberSecretKey,
    role::{
        permission::{self, Flag},
        sent,
    },
    session::{MemberSession, actor, rank_of},
    setup::ADMINISTRATOR_KEY_PURPOSE,
    store::{MemberLockRecord, OrganizationStore, Signer, member_lock_authority},
    workspace::signer_of,
};

use crate::error::RefusalReason;

/// Unlock a member (effort 851, requirement 34): an unlocked row about them, signed by the actor.
///
/// **The owner, or a holder of `assignRole` or `overrideMember` who outranks the member**, as the
/// row-kind table has it (`authority::covers`), and refused by name before anything is written:
/// the actor's own account (nobody unlocks themselves), the owner's (never locked), a removed or
/// unsettled one, one not below the actor, and **one whose password is not yet their own**, since
/// the point of the unlock is that the person unlocking has seen the right person get in and choose
/// one. A locked actor is refused before any of it (`session::acting_row`).
pub async fn unlock_member(
    store: &OrganizationStore,
    session: &MemberSession,
    member_id: &str,
    now: i64,
) -> Result<(), Error> {
    session.settled()?;

    let actor = actor(store, session).await?;

    permission::require_any(
        actor.row.effective,
        &[Flag::AssignRole, Flag::OverrideMember],
    )?;

    if member_id == session.member_id {
        return Err(Error::refused(
            RefusalReason::NotYourself,
            "you cannot unlock your own account. an owner or a manager above you unlocks it",
        ));
    }

    let members = store.members(&session.verifying_key).await?;
    let member = writable_account(
        &members,
        member_id,
        "the owner's account is never locked, so it is not unlocked",
    )?;

    actor.outranks(
        rank_of(store, session, member).await?,
        "that member's role is not below yours, so they are unlocked by somebody who ranks above \
         them",
    )?;

    if member.must_change_password {
        return Err(Error::refused(
            RefusalReason::AccountNotSetUp,
            "that account has no password of its own yet. it is unlocked once they have opened \
             their link and chosen one",
        ));
    }

    let (key, certificate) = signer_of(store, session).await?;

    store
        .write_member_lock(
            &Signer {
                key: &key,
                certificate: &certificate,
            },
            &MemberLockRecord {
                member_id: member_id.to_string(),
                locked: false,
                updated_at: now,
            },
        )
        .await?;

    sent(
        store,
        "organization.member.unlockNotYetSent",
        "member",
        member_id,
    )
    .await;
    diagnostics::info("organization.member.unlocked")
        .with("member", member_id)
        .write();

    Ok(())
}

/// Write a lock row for every member who has none, and then the organization's marker (effort
/// 851, requirements 35 and 36): what the machine of a member able to sign the rows does, with
/// nobody acting, at a sign-in, a resume or a heartbeat, beside the repair of the owner's row.
/// Answers how many rows it wrote.
///
/// **Before the marker**, a member with no row is one carried over from before the lock: locked
/// where their password is not yet their own and they hold no consumed invitation, which is what
/// says the person arrived, and unlocked otherwise. **Once the organization is marked**, or this
/// machine has latched that it was (`held`), a member with no row is somebody's deletion and reads
/// locked, so the row written is locked: writing it unlocked would undo the marker. The owner is
/// never written, and a member with a row, verifying or not, already has what somebody chose.
///
/// **Who writes**: the machine whose member's live certificate covers the row
/// (`authority::covers`): the owner's, or an outranking holder of `assignRole` or
/// `overrideMember`'s, so every row it writes verifies. **The marker is the owner's own lock row**,
/// which only the root covers, so only the owner's machine writes it, and only once every member
/// waiting has a row. Nothing is written where the replica lacks the table (one an earlier build
/// made, before the pull that completes it).
pub(in crate::organization) async fn lock_unset_accounts(
    store: &OrganizationStore,
    verifying_key: &[u8; VERIFYING_KEY_BYTES],
    member_id: &str,
    secret: &MemberSecretKey,
    held: Option<&HeldOrganization>,
    now: i64,
) -> Result<usize, Error> {
    if !store
        .tables()
        .await?
        .iter()
        .any(|table| table == "member_lock")
    {
        return Ok(0);
    }

    let key = AdministratorKey::from_bytes(&secret.derive_seed(ADMINISTRATOR_KEY_PURPOSE)?);
    let Some(certificate) = store
        .live_certificate(verifying_key, member_id, &key.verifying_key())
        .await?
    else {
        return Ok(0);
    };
    let signer = Signer {
        key: &key,
        certificate: &certificate,
    };
    let members = store.members(verifying_key).await?;
    let locks = store.member_locks(verifying_key).await?;
    let marked = locks.marked || held.is_some_and(|held| held.lock_marked);
    let arrived: Vec<String> = store
        .invitations(verifying_key)
        .await?
        .into_iter()
        .filter(|invitation| invitation.consumed_at.is_some())
        .map(|invitation| invitation.member_id)
        .collect();
    let mut written = 0;

    for member in members.iter().filter(|member| {
        member.covered
            && member.removed_at.is_none()
            && member.role_id != permission::OWNER
            && !locks.rows.contains_key(&member.id)
    }) {
        let lock = MemberLockRecord {
            member_id: member.id.clone(),
            locked: marked || (member.must_change_password && !arrived.contains(&member.id)),
            updated_at: now,
        };

        if !store.covered(&signer, member_lock_authority(&lock)).await? {
            continue;
        }

        store.write_member_lock(&signer, &lock).await?;
        written += 1;
    }

    // and the marker, from the owner's machine alone, once every member it found has a row.
    let owner = members
        .iter()
        .find(|member| member.covered && member.role_id == permission::OWNER);

    if certificate.is_root()
        && !locks.marked
        && let Some(owner) = owner.filter(|owner| owner.id == member_id)
    {
        store
            .write_member_lock(
                &signer,
                &MemberLockRecord {
                    member_id: owner.id.clone(),
                    locked: false,
                    updated_at: now,
                },
            )
            .await?;
        written += 1;
    }

    if written > 0 {
        sent(
            store,
            "organization.member.locksNotYetSent",
            "member",
            member_id,
        )
        .await;
        diagnostics::info("organization.member.locksWritten")
            .with("count", written.to_string())
            .with("marked", marked.to_string())
            .write();
    }

    Ok(written)
}

/// Unlock `member_id` under `by`'s certificate, with no password asked of them: what a test whose
/// subject is not the lock does to the members it makes act, since every account starts locked
/// (effort 851). Refused, as the store refuses an unlock, where `by` does not cover it; under the
/// owner's root it never is.
#[cfg(test)]
pub(crate) async fn unlocked_for_a_test(
    store: &OrganizationStore,
    by: &MemberSession,
    member_id: &str,
) -> Result<(), Error> {
    let (key, certificate) = signer_of(store, by).await?;

    store
        .write_member_lock(
            &Signer {
                key: &key,
                certificate: &certificate,
            },
            &MemberLockRecord {
                member_id: member_id.to_string(),
                locked: false,
                updated_at: 0,
            },
        )
        .await
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use serde_json::json;

    use super::unlock_member;
    use crate::test::scratch;
    use crate::{
        credential::{CredentialStore, Memory},
        error::{Error, RefusalReason},
        machine::RemoteSyncStore,
        organization::{
            HeldOrganization,
            invitation::{
                WorkspaceGrant, create_account, make_link, members, standings, unset_password,
                vault_password_of,
            },
            member::{password::change_password, vault::KdfParams},
            role::{
                assign_role,
                permission::{self, Flag},
                roles,
            },
            session::{CredentialSlot, MemberSession, facts_of, machines, sign_in},
            setup::{CreateOrganization, Remote, create_organization},
            store::{MemberLockRecord, OrganizationStore, Signer, TABLES},
            workspace::{create_workspace, remote::Pipeline, rename_workspace, signer_of},
        },
        persisted::Persisted,
        sync::test::server::{ScriptedResponse, ScriptedServer},
        turso::{
            discovery::McpEndpoint,
            platform::{AccessLevel, InMemoryPlatform},
        },
    };

    const OWNER_PASSWORD: &str = "the owners password";
    const CHOSEN: &str = "a password of their own";
    const AT: i64 = 1_757_000_000_000;

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

    fn no_platform() -> Option<&'static InMemoryPlatform> {
        None
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
            machine_id: format!("machine-{member_id}"),
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
            own_lock_latched: None,
        }
    }

    fn reason_of(error: &Error) -> RefusalReason {
        match error {
            Error::Refused { reason, .. } => *reason,
            other => panic!("expected a refusal, got {other:?}"),
        }
    }

    /// Every cell of every table, so a refusal that wrote something is caught wherever it wrote.
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

    /// An organization made with its owner signed in and one workspace, North.
    async fn owned(
        credentials: &dyn CredentialStore,
        directory: &std::path::Path,
    ) -> (OrganizationStore, MemberSession, String) {
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
            credentials,
            &crate::clock::System::shared(),
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
                group: None,
            },
            test_cost(),
            AT,
        )
        .await
        .expect("the first run failed");
        let joined = machine.selected().cloned().expect("the record");
        let mut owner = sign_in(&store, &joined, OWNER_PASSWORD, &slot())
            .await
            .expect("the owner did not sign in");
        let pipeline = crate::sync::test::pipeline::LocalPipeline::start().await;
        let north = create_workspace(
            &store,
            &mut owner,
            &platform,
            |_| Pipeline::at(&pipeline.url("")),
            "North",
            AT,
        )
        .await
        .expect("the workspace");

        (store, owner, north.id)
    }

    /// One person's account: its id, the session its person opened with the password its link
    /// carries, and that password, which choosing their own replaces.
    struct Account {
        id: String,
        session: MemberSession,
        generated: String,
    }

    /// An account `maker` makes in `role` with `override_mask` and full access on North, signed in
    /// with the password its link carries: what a person opening their link holds before they
    /// choose a password.
    async fn an_account(
        store: &OrganizationStore,
        maker: &MemberSession,
        username: &str,
        role: &str,
        override_mask: i64,
        north: &str,
    ) -> Account {
        let made = create_account(
            store,
            maker,
            no_platform(),
            username,
            role,
            override_mask,
            &[WorkspaceGrant {
                id: north.to_string(),
                access: AccessLevel::FullAccess,
            }],
            test_cost(),
            AT,
        )
        .await
        .expect("the account");
        let link = crate::organization::invitation::locator(store, maker)
            .await
            .expect("the link");
        let link = make_link(
            store,
            maker,
            no_platform(),
            &link,
            &made.id,
            crate::organization::invitation::TEST_LIFETIME_HOURS,
            test_cost(),
            AT,
        )
        .await
        .expect("the account's link");
        let generated = vault_password_of(&link.link, &link.code, test_cost());
        let session = sign_in(
            store,
            &joined_as(maker, &made.id, role),
            &generated,
            &slot(),
        )
        .await
        .expect("the account did not sign in");

        Account {
            id: made.id,
            session,
            generated,
        }
    }

    impl Account {
        /// The person chooses a password of their own: what settles the account and is the one
        /// thing that makes it possible to unlock.
        async fn chooses_a_password(
            &mut self,
            credentials: &dyn CredentialStore,
            store: &OrganizationStore,
        ) {
            change_password(
                credentials,
                store,
                &mut self.session,
                &self.generated,
                CHOSEN,
                test_cost(),
                AT + 1,
            )
            .await
            .expect("the password change");
        }
    }

    /// Whether `member_id` reads as locked off this replica, as every reader asks it.
    async fn locked(store: &OrganizationStore, owner: &MemberSession, member_id: &str) -> bool {
        let member = store
            .member(&owner.verifying_key, member_id)
            .await
            .expect("the row")
            .expect("the member");

        store
            .member_locked(&owner.verifying_key, &member, false)
            .await
            .expect("the lock")
    }

    /// Whether the lock row about `member_id` verifies, and what it says where it does.
    async fn verified_lock(
        store: &OrganizationStore,
        owner: &MemberSession,
        member_id: &str,
    ) -> Option<bool> {
        store
            .signed_member_locks(&owner.verifying_key)
            .await
            .expect("the locks")
            .into_iter()
            .find(|(_, lock)| lock.member_id == member_id)
            .map(|(_, lock)| lock.locked)
    }

    /// **Criteria 31 and 37.** An account is locked from its creation under a lock that
    /// verifies, and stays locked once its person has chosen a password; unlocked by the owner it
    /// reads unlocked, and a reset locks it again under a lock that verifies.
    #[tokio::test]
    async fn an_account_starts_locked_stays_locked_through_its_password_and_a_reset_locks_it_again()
    {
        let credentials = Memory::new();
        let directory = scratch("lock-starts");
        let (store, owner, north) = owned(&credentials, &directory).await;
        let mut sami =
            an_account(&store, &owner, "sami.staff", permission::MEMBER, 0, &north).await;

        assert!(
            locked(&store, &owner, &sami.id).await,
            "a new account is not locked"
        );
        assert_eq!(
            verified_lock(&store, &owner, &sami.id).await,
            Some(true),
            "a new account's lock does not verify"
        );

        sami.chooses_a_password(&credentials, &store).await;

        assert!(
            locked(&store, &owner, &sami.id).await,
            "choosing a password unlocked the account"
        );

        unlock_member(&store, &owner, &sami.id, AT + 2)
            .await
            .expect("the owner unlocks sami");

        assert!(!locked(&store, &owner, &sami.id).await);
        assert_eq!(verified_lock(&store, &owner, &sami.id).await, Some(false));

        unset_password(&store, &owner, no_platform(), &sami.id, test_cost(), AT + 3)
            .await
            .expect("the reset");

        assert!(
            locked(&store, &owner, &sami.id).await,
            "a reset left the account unlocked"
        );
        assert_eq!(
            verified_lock(&store, &owner, &sami.id).await,
            Some(true),
            "the reset's lock does not verify"
        );
    }

    /// **Criterion 32, the Rust half.** A locked manager who has chosen a password signs in
    /// again, reads the members, the roles, their own machines and their own facts, and is
    /// refused, as locked, an invitation, a role change, a rename of a workspace and an unlock,
    /// none of which writes anything. Their facts and their standing say they are locked; once the
    /// owner unlocks them, the rename goes through.
    #[tokio::test]
    async fn a_locked_member_signs_in_and_reads_and_is_refused_every_other_act() {
        let credentials = Memory::new();
        let directory = scratch("lock-acts");
        let (store, owner, north) = owned(&credentials, &directory).await;
        let sami = an_account(&store, &owner, "sami.staff", permission::MEMBER, 0, &north).await;
        let mut ada = an_account(
            &store,
            &owner,
            "ada.manager",
            permission::MANAGER,
            0,
            &north,
        )
        .await;

        // the password change, which a locked member keeps, and the sign-in with it.
        ada.chooses_a_password(&credentials, &store).await;

        let mut held = joined_as(&owner, &ada.id, permission::MANAGER);
        let session = sign_in(&store, &held, CHOSEN, &slot())
            .await
            .expect("a locked member signs in");

        let before = every_row(&store).await;
        let refusals = [
            (
                "the invitation",
                create_account(
                    &store,
                    &session,
                    no_platform(),
                    "noor.new",
                    permission::MEMBER,
                    0,
                    &[],
                    test_cost(),
                    AT + 2,
                )
                .await
                .map(|_| ()),
            ),
            (
                "the role change",
                assign_role(&store, &session, &sami.id, permission::MEMBER, None, AT + 2)
                    .await
                    .map(|_| ()),
            ),
            (
                "the rename",
                rename_workspace(&store, &session, &north, "Renamed", AT + 2).await,
            ),
            (
                "the unlock",
                unlock_member(&store, &session, &sami.id, AT + 2).await,
            ),
        ];

        for (act, outcome) in refusals {
            let refusal = outcome.expect_err(act);

            assert_eq!(reason_of(&refusal), RefusalReason::Locked, "{act}");
        }
        assert_eq!(
            every_row(&store).await,
            before,
            "a refused act wrote something"
        );

        // the reads go on.
        assert!(
            members(&store, &session)
                .await
                .expect("the members")
                .iter()
                .any(|member| member.id == sami.id)
        );
        assert!(!roles(&store, &session).await.expect("the roles").is_empty());
        machines(&store, &session, &held)
            .await
            .expect("their own machines");
        assert!(
            facts_of(&store, &session, &mut held)
                .await
                .expect("their facts")
                .locked,
            "a locked member's facts say unlocked"
        );

        let standing = standings(&store, &owner, AT + 3)
            .await
            .expect("the standings")
            .into_iter()
            .find(|standing| standing.member_id == ada.id)
            .expect("ada's standing");

        assert!(standing.locked);
        assert!(standing.password_set);

        // and once the owner unlocks them, the same act goes through.
        unlock_member(&store, &owner, &ada.id, AT + 4)
            .await
            .expect("the owner unlocks ada");
        rename_workspace(&store, &session, &north, "Renamed", AT + 5)
            .await
            .expect("an unlocked manager renames the workspace");
        assert!(
            !facts_of(&store, &session, &mut held)
                .await
                .expect("their facts")
                .locked
        );
    }

    /// **Criterion 34.** The owner, and an outranking manager holding `assignRole`, unlock a
    /// locked member who has chosen a password. A manager holding neither `assignRole` nor
    /// `overrideMember`, a manager who does not outrank the member, the member themselves and an
    /// unlock before the password is set are each refused by name, and none of them writes.
    #[tokio::test]
    async fn the_owner_or_an_outranking_holder_of_either_flag_unlocks_once_the_password_is_set() {
        let credentials = Memory::new();
        let directory = scratch("lock-who");
        let (store, owner, north) = owned(&credentials, &directory).await;
        let mut ada = an_account(
            &store,
            &owner,
            "ada.manager",
            permission::MANAGER,
            0,
            &north,
        )
        .await;
        let mut max = an_account(
            &store,
            &owner,
            "max.manager",
            permission::MANAGER,
            0,
            &north,
        )
        .await;
        // a manager with both flags that unlock switched off.
        let mut rita = an_account(
            &store,
            &owner,
            "rita.manager",
            permission::MANAGER,
            permission::mask_of(&[Flag::AssignRole, Flag::OverrideMember]),
            &north,
        )
        .await;
        let mut sami =
            an_account(&store, &owner, "sami.staff", permission::MEMBER, 0, &north).await;
        let noor = an_account(&store, &owner, "noor.new", permission::MEMBER, 0, &north).await;

        for account in [&mut ada, &mut max, &mut rita, &mut sami] {
            account.chooses_a_password(&credentials, &store).await;
        }

        // the owner unlocks the three managers.
        for account in [&ada, &max, &rita] {
            unlock_member(&store, &owner, &account.id, AT + 2)
                .await
                .expect("the owner unlocks a manager");

            assert!(!locked(&store, &owner, &account.id).await);
        }

        let before = every_row(&store).await;
        let refused = [
            (
                "a manager holding neither flag",
                unlock_member(&store, &rita.session, &sami.id, AT + 3).await,
                RefusalReason::RoleLacksAct,
            ),
            (
                "a manager who does not outrank them",
                unlock_member(&store, &ada.session, &max.id, AT + 3).await,
                RefusalReason::RankNotAbove,
            ),
            (
                "an unlocked member unlocking themselves",
                unlock_member(&store, &ada.session, &ada.id, AT + 3).await,
                RefusalReason::NotYourself,
            ),
            (
                "a locked member unlocking themselves",
                unlock_member(&store, &sami.session, &sami.id, AT + 3).await,
                RefusalReason::Locked,
            ),
            (
                "an unlock before the password is set",
                unlock_member(&store, &owner, &noor.id, AT + 3).await,
                RefusalReason::AccountNotSetUp,
            ),
            (
                "the owner's account",
                unlock_member(&store, &ada.session, &owner.member_id, AT + 3).await,
                RefusalReason::OwnerProtected,
            ),
        ];

        for (case, outcome, reason) in refused {
            let refusal = outcome.expect_err(case);

            assert_eq!(reason_of(&refusal), reason, "{case}: {refusal}");

            // refused by the act, before the store is asked to write anything.
            if reason == RefusalReason::RoleLacksAct {
                assert!(
                    refusal
                        .to_string()
                        .contains("your role does not include assignRole or overrideMember"),
                    "{case}: {refusal}"
                );
            }
        }
        assert_eq!(
            every_row(&store).await,
            before,
            "a refused unlock wrote something"
        );
        assert!(locked(&store, &owner, &sami.id).await);
        assert!(locked(&store, &owner, &noor.id).await);

        // an outranking manager holding assignRole unlocks the member, under a lock that verifies.
        unlock_member(&store, &ada.session, &sami.id, AT + 4)
            .await
            .expect("an outranking manager unlocks a member");

        assert!(!locked(&store, &owner, &sami.id).await);
        assert_eq!(verified_lock(&store, &owner, &sami.id).await, Some(false));
    }

    /// **Criterion 35.** A locked member writes an unlocked row about themselves straight into
    /// their replica under their own certificate, which covers no lock: they still read as
    /// locked. A lock row whose `locked` column is flipped under a genuine signature reads locked
    /// too, and a forged lock about the owner locks nobody.
    #[tokio::test]
    async fn an_unlock_nobody_able_to_sign_it_wrote_leaves_the_member_locked() {
        let credentials = Memory::new();
        let directory = scratch("lock-forged");
        let (store, owner, north) = owned(&credentials, &directory).await;
        let mut sami =
            an_account(&store, &owner, "sami.staff", permission::MEMBER, 0, &north).await;

        sami.chooses_a_password(&credentials, &store).await;

        let (key, certificate) = signer_of(&store, &sami.session)
            .await
            .expect("sami's signer");
        let theirs = Signer {
            key: &key,
            certificate: &certificate,
        };

        // through the store, the unlock is refused before it is written.
        assert_eq!(
            reason_of(
                &store
                    .write_member_lock(
                        &theirs,
                        &MemberLockRecord {
                            member_id: sami.id.clone(),
                            locked: false,
                            updated_at: AT + 2,
                        },
                    )
                    .await
                    .expect_err("sami's own unlock was written")
            ),
            RefusalReason::RoleLacksAct
        );

        // around it, as somebody holding the credential writes, it is written and read as locked.
        store
            .write_member_lock_around_the_check(
                &theirs,
                &MemberLockRecord {
                    member_id: sami.id.clone(),
                    locked: false,
                    updated_at: AT + 2,
                },
            )
            .await
            .expect("the unlock written around the store");

        assert!(
            locked(&store, &owner, &sami.id).await,
            "an unlock sami signed unlocked sami"
        );
        assert_eq!(verified_lock(&store, &owner, &sami.id).await, None);
        assert_eq!(
            reason_of(
                &rename_workspace(&store, &sami.session, &north, "Mine", AT + 3)
                    .await
                    .expect_err("sami acted after unlocking themselves")
            ),
            RefusalReason::Locked
        );

        // a genuine lock with its column flipped reads locked.
        unset_password(&store, &owner, no_platform(), &sami.id, test_cost(), AT + 4)
            .await
            .expect("the reset");
        store
            .connection()
            .execute(
                "UPDATE \"member_lock\" SET \"locked\" = 0 WHERE \"member_id\" = ?",
                vec![turso::Value::Text(sami.id.clone())],
            )
            .await
            .expect("the column flipped");

        assert!(
            locked(&store, &owner, &sami.id).await,
            "a flipped column unlocked sami"
        );

        // and a lock about the owner, whoever wrote it, locks nobody.
        store
            .write_member_lock_around_the_check(
                &theirs,
                &MemberLockRecord {
                    member_id: owner.member_id.clone(),
                    locked: true,
                    updated_at: AT + 5,
                },
            )
            .await
            .expect("a lock about the owner");

        assert!(
            !locked(&store, &owner, &owner.member_id).await,
            "a forged lock locked the owner"
        );
        rename_workspace(&store, &owner, &north, "Still the owner's", AT + 6)
            .await
            .expect("the owner acts past a forged lock");
    }

    /// **Criterion 36.** An organization from before the lock, with one member who set a password
    /// and one who was invited and never did: the member's machine, which holds neither flag that
    /// locks, writes nothing; once the owner's machine opens it, the first is unlocked and the
    /// second is locked under a lock that verifies. The owner is never among them.
    #[tokio::test]
    async fn an_organization_from_before_the_lock_locks_only_who_never_set_a_password() {
        let credentials = Memory::new();
        let directory = scratch("lock-backfill");
        let (store, owner, north) = owned(&credentials, &directory).await;
        let mut ada = an_account(
            &store,
            &owner,
            "ada.manager",
            permission::MANAGER,
            0,
            &north,
        )
        .await;
        let noor = an_account(&store, &owner, "noor.new", permission::MEMBER, 0, &north).await;

        ada.chooses_a_password(&credentials, &store).await;

        // what an organization made before this change holds: no lock at all.
        store
            .connection()
            .execute("DELETE FROM \"member_lock\"", ())
            .await
            .expect("the organization before the lock");

        assert!(!locked(&store, &owner, &ada.id).await);
        assert!(!locked(&store, &owner, &noor.id).await);

        // the member's machine opens it, and covers nobody's lock.
        let mut sami =
            an_account(&store, &owner, "sami.staff", permission::MEMBER, 0, &north).await;

        sami.chooses_a_password(&credentials, &store).await;
        store
            .connection()
            .execute(
                "DELETE FROM \"member_lock\" WHERE \"member_id\" = ?",
                vec![turso::Value::Text(sami.id.clone())],
            )
            .await
            .expect("sami before the lock");
        sign_in(
            &store,
            &joined_as(&owner, &sami.id, permission::MEMBER),
            CHOSEN,
            &slot(),
        )
        .await
        .expect("sami signs in");

        assert_eq!(
            verified_lock(&store, &owner, &noor.id).await,
            None,
            "a machine that covers no lock wrote one"
        );

        // the owner's machine opens it.
        let held = joined_as(&owner, &owner.member_id, permission::OWNER);

        sign_in(&store, &held, OWNER_PASSWORD, &slot())
            .await
            .expect("the owner signs in");

        assert!(
            !locked(&store, &owner, &ada.id).await,
            "a member who set a password was locked"
        );
        assert!(!locked(&store, &owner, &sami.id).await);
        assert!(
            locked(&store, &owner, &noor.id).await,
            "a member who never set a password was left unlocked"
        );
        assert_eq!(verified_lock(&store, &owner, &noor.id).await, Some(true));
        // every member carried over has a row of their own, and the owner's marker follows them.
        assert_eq!(verified_lock(&store, &owner, &ada.id).await, Some(false));
        assert_eq!(verified_lock(&store, &owner, &sami.id).await, Some(false));
        assert_eq!(
            verified_lock(&store, &owner, &owner.member_id).await,
            Some(false),
            "the owner's machine wrote no marker"
        );
    }

    /// **Requirement 35, the marker and the latch.** Once the owner's machine has written the
    /// marker, a locked member who deletes their lock row reads locked on every machine. A machine
    /// that has seen the marker keeps reading them locked when the marker row goes too, an entry
    /// opened afresh from its record included, and the owner's latched machine writes the marker
    /// back and locks them rather than carrying them over. Only a machine that never saw the
    /// marker reads the carry-over.
    #[tokio::test]
    async fn deleting_a_lock_unlocks_nobody_once_the_organization_is_marked() {
        let credentials = Memory::new();
        let directory = scratch("lock-marker");
        let (store, owner, north) = owned(&credentials, &directory).await;

        assert_eq!(
            verified_lock(&store, &owner, &owner.member_id).await,
            Some(false),
            "a new organization is not marked"
        );

        let mut sami =
            an_account(&store, &owner, "sami.staff", permission::MEMBER, 0, &north).await;
        let mut ada = an_account(
            &store,
            &owner,
            "ada.manager",
            permission::MANAGER,
            0,
            &north,
        )
        .await;

        sami.chooses_a_password(&credentials, &store).await;
        ada.chooses_a_password(&credentials, &store).await;
        unlock_member(&store, &owner, &ada.id, AT + 2)
            .await
            .expect("the owner unlocks ada");

        // ada's machine reads the organization, and latches the marker in its record.
        let mut adas = joined_as(&owner, &ada.id, permission::MANAGER);
        let ada_session = sign_in(&store, &adas, CHOSEN, &slot())
            .await
            .expect("ada signs in");

        facts_of(&store, &ada_session, &mut adas)
            .await
            .expect("ada's facts");

        assert!(adas.lock_marked, "reading the marker latched nothing");

        // sami deletes their own row.
        let delete = |member_id: String| {
            let store = &store;

            async move {
                store
                    .connection()
                    .execute(
                        "DELETE FROM \"member_lock\" WHERE \"member_id\" = ?",
                        vec![turso::Value::Text(member_id)],
                    )
                    .await
                    .expect("the row deleted");
            }
        };

        delete(sami.id.clone()).await;

        assert!(
            locked(&store, &owner, &sami.id).await,
            "a deleted lock unlocked sami under the marker"
        );
        assert_eq!(
            reason_of(
                &rename_workspace(&store, &sami.session, &north, "Mine", AT + 3)
                    .await
                    .expect_err("sami acted after deleting their lock")
            ),
            RefusalReason::Locked
        );

        // and the marker with it.
        delete(owner.member_id.clone()).await;

        let sami_row = store
            .member(&owner.verifying_key, &sami.id)
            .await
            .expect("the row")
            .expect("sami");

        assert!(
            !store
                .member_locked(&owner.verifying_key, &sami_row, false)
                .await
                .expect("the lock"),
            "a machine that never saw the marker does not read the carry-over"
        );
        assert!(
            store
                .member_locked(&owner.verifying_key, &sami_row, adas.lock_marked)
                .await
                .expect("the lock"),
            "ada's record forgot the marker"
        );

        let standing_of_sami = |standings: Vec<crate::organization::invitation::MemberStanding>| {
            standings
                .into_iter()
                .find(|standing| standing.member_id == sami.id)
                .expect("sami's standing")
                .locked
        };

        assert!(
            standing_of_sami(
                standings(&store, &ada_session, AT + 4)
                    .await
                    .expect("standings")
            ),
            "ada's open session forgot the marker"
        );

        let again = sign_in(&store, &adas, CHOSEN, &slot())
            .await
            .expect("ada signs in again");

        assert!(
            standing_of_sami(standings(&store, &again, AT + 4).await.expect("standings")),
            "a session opened from ada's record forgot the marker"
        );

        // the owner's latched machine marks it again, and sami stays locked.
        let mut owners = joined_as(&owner, &owner.member_id, permission::OWNER);

        owners.lock_marked = true;
        sign_in(&store, &owners, OWNER_PASSWORD, &slot())
            .await
            .expect("the owner signs in");

        assert_eq!(
            verified_lock(&store, &owner, &owner.member_id).await,
            Some(false)
        );
        assert_eq!(verified_lock(&store, &owner, &sami.id).await, Some(true));
        assert!(locked(&store, &owner, &sami.id).await);
    }

    /// **A promotion does not lock again.** A manager unlocks a member; the owner then makes the
    /// member a manager too, which the manager's lock no longer covers. The lock is signed again
    /// by the owner as it stood, so the member stays unlocked, and a locked member promoted stays
    /// locked.
    #[tokio::test]
    async fn a_member_given_a_higher_role_keeps_their_lock_as_it_stood() {
        let credentials = Memory::new();
        let directory = scratch("lock-promotion");
        let (store, owner, north) = owned(&credentials, &directory).await;
        let mut ada = an_account(
            &store,
            &owner,
            "ada.manager",
            permission::MANAGER,
            0,
            &north,
        )
        .await;
        let mut sami =
            an_account(&store, &owner, "sami.staff", permission::MEMBER, 0, &north).await;
        let mut noor = an_account(&store, &owner, "noor.new", permission::MEMBER, 0, &north).await;

        for account in [&mut ada, &mut sami, &mut noor] {
            account.chooses_a_password(&credentials, &store).await;
        }

        unlock_member(&store, &owner, &ada.id, AT + 2)
            .await
            .expect("the owner unlocks ada");
        unlock_member(&store, &ada.session, &sami.id, AT + 3)
            .await
            .expect("ada unlocks sami");

        for promoted in [&sami.id, &noor.id] {
            assign_role(&store, &owner, promoted, permission::MANAGER, None, AT + 4)
                .await
                .expect("the owner promotes them");
        }

        assert!(
            !locked(&store, &owner, &sami.id).await,
            "a promotion locked sami again"
        );
        assert_eq!(verified_lock(&store, &owner, &sami.id).await, Some(false));
        assert!(
            locked(&store, &owner, &noor.id).await,
            "a promotion unlocked noor"
        );
        assert_eq!(verified_lock(&store, &owner, &noor.id).await, Some(true));
    }

    /// **A lock never refuses a removal or a reset.** A lead holding `assignRole` unlocks a
    /// member; a head ranked above them, holding `removeMember` and neither flag that signs a
    /// lock, removes the lead. The removal goes through, and the lock the lead signed, which
    /// nobody could sign again, reads locked. *A reset cannot meet such a lock*: its actor holds
    /// every flag the account holds (`invitation::reseal_account`), and so covers whatever the
    /// account's certificate unlocked; the re-sign leaves the lock either way.
    #[tokio::test]
    async fn a_removal_goes_through_whatever_locks_the_retired_certificate_signed() {
        let credentials = Memory::new();
        let directory = scratch("lock-retired");
        let (store, owner, north) = owned(&credentials, &directory).await;
        let lead = crate::organization::role::create_role(
            &store,
            &owner,
            "Lead",
            permission::MEMBER_ROLE.mask | permission::mask_of(&[Flag::AssignRole]),
            permission::MANAGER,
            AT,
        )
        .await
        .expect("the lead role")
        .id;
        let head = crate::organization::role::create_role(
            &store,
            &owner,
            "Head",
            permission::MEMBER_ROLE.mask | permission::mask_of(&[Flag::RemoveMember]),
            permission::MANAGER,
            AT,
        )
        .await
        .expect("the head role")
        .id;
        let mut accounts = Vec::new();

        for (name, role) in [
            ("hana.head", head.as_str()),
            ("leo.lead", lead.as_str()),
            ("nora.staff", permission::MEMBER),
        ] {
            let mut account = an_account(&store, &owner, name, role, 0, &north).await;

            account.chooses_a_password(&credentials, &store).await;

            if role != permission::MEMBER {
                unlock_member(&store, &owner, &account.id, AT + 2)
                    .await
                    .expect("the owner unlocks them");
            }

            accounts.push(account);
        }

        let [hana, leo, nora] =
            <[Account; 3]>::try_from(accounts).unwrap_or_else(|_| panic!("three accounts"));
        let mut hana_session = hana.session;

        unlock_member(&store, &leo.session, &nora.id, AT + 3)
            .await
            .expect("leo unlocks nora");
        assert!(!locked(&store, &owner, &nora.id).await);

        crate::organization::member::removal::remove_member(
            &store,
            &mut hana_session,
            no_platform(),
            "org-database",
            &leo.id,
            false,
            AT + 5,
        )
        .await
        .expect("a lock refused the removal");

        assert!(
            locked(&store, &owner, &nora.id).await,
            "a lock nobody signed again read unlocked after the removal"
        );
    }
}
