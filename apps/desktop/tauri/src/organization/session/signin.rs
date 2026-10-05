//! the two ways to a member's row: the first run's owner and the wall's username and password,
//! each ending in the same unsealing; and what the owner's machine repairs on the way in.

use crate::{
    credential::CredentialStore,
    diagnostics,
    error::{Error, RefusalReason},
};

use super::{
    CredentialSlot, MemberSession, content_key_of, open_session, opened, remember, verifying_key_of,
};
use crate::organization::{
    HeldOrganization,
    authority::VERIFYING_KEY_BYTES,
    member::vault::{MemberSecretKey, open_vault, open_vault_with_key},
    role::permission::{self},
    store::{MemberRecord, OrganizationStore},
};

/// Open the member row `joined` names in `store` with `password`.
///
/// The sign-in of a machine whose record already names the member: the first run's, which signs
/// the owner in to the row it just wrote. A record that names no member, which a connect by link
/// writes, is refused before any row is read; the person signs in at the wall, by username
/// ([`sign_in_by_username`]).
///
/// The steps, and why in this order: the rows are read and verified first, so a forged row is
/// refused before any key is derived from the password; the vault is opened, which is the one
/// place a wrong password fails; the content key is unsealed, which is what makes any name
/// legible; and the grant on the organization database is unsealed into `credential`, which is
/// what lets the replica reach the remote from now on.
pub async fn sign_in(
    store: &OrganizationStore,
    joined: &HeldOrganization,
    password: &str,
    credential: &CredentialSlot,
) -> Result<MemberSession, Error> {
    let verifying_key = verifying_key_of(joined)?;
    let member_id = joined.member_id.as_deref().ok_or_else(|| {
        Error::refused(
            RefusalReason::NoMemberYet,
            format!("this machine holds {} and no member in it yet", joined.name),
        )
    })?;
    let members = store.members(&verifying_key).await?;
    let member = members
        .iter()
        .find(|member| member.id == member_id)
        .ok_or_else(|| {
            Error::refused(
                RefusalReason::SignInAgain,
                "this machine's member row is not in the organization any more",
            )
        })?;

    let removed = || {
        Error::refused(
            RefusalReason::YouWereRemoved,
            format!("you were removed from {}", joined.name),
        )
    };

    // the one place a password can fail, and it says only that the value did not open. A removal
    // is a signed row rather than an absence, and the vault would still open onto grants that
    // grant nothing: on a removed row a value that does not open says the removal and not the
    // password, and one that opens says it too, unless it is the owner's own vault meeting a
    // removal written from below, which their machine repairs (`owner_row_repaired`).
    let secret = match open_vault(password, &member.vault) {
        Ok(secret) => secret,
        Err(_) if member.removed_at.is_some() => return Err(removed()),
        Err(refusal) => return Err(refusal),
    };
    let repaired = owner_row_repaired(store, &verifying_key, member, &secret).await;
    let member = repaired.as_ref().unwrap_or(member);

    if member.removed_at.is_some() {
        return Err(removed());
    }

    let content_key = content_key_of(&member.sealed_content_key, &secret)?;

    open_session(
        store,
        joined,
        verifying_key,
        member,
        secret,
        content_key,
        credential,
    )
    .await
}

/// The owner's own row read again after their machine repaired it (`ownership::repair_owner_row`), or
/// `None` where nothing was written: a sign-in or a resume that has just opened `member`'s vault
/// asks it before it reads anything off the row, so an owner whose row somebody below them
/// demoted or removed is signed in as the owner. Anybody else's machine writes nothing here.
///
/// **A repair that could not be made is a diagnostic and never a refusal**: the sign-in goes on
/// with the row as it reads, which is what it did before, and the next heartbeat asks again.
pub(super) async fn owner_row_repaired(
    store: &OrganizationStore,
    verifying_key: &[u8; VERIFYING_KEY_BYTES],
    member: &MemberRecord,
    secret: &MemberSecretKey,
) -> Option<MemberRecord> {
    match crate::organization::ownership::repair_owner_row(
        store,
        verifying_key,
        &member.id,
        secret,
        store.clock().now(),
    )
    .await
    {
        Ok(true) => store.member(verifying_key, &member.id).await.ok().flatten(),
        Ok(false) => None,
        Err(refusal) => {
            diagnostics::warn("organization.owner.rowNotRepaired")
                .with("reason", refusal.to_string())
                .write();

            None
        }
    }
}

/// The heartbeat's repair of the owner's own row (`ownership::repair_owner_row`), on the session this
/// machine holds open, taking what the row says once it is written. On every machine but the
/// owner's it writes nothing. **Nothing comes back**, since the heartbeat has nothing to do with
/// the answer and this module answers no question with a yes or a no.
pub(crate) async fn repair_own_row(store: &OrganizationStore, session: &mut MemberSession) {
    let Some(row) = store
        .member(&session.verifying_key, &session.member_id)
        .await
        .ok()
        .flatten()
    else {
        return;
    };

    if let Some(repaired) =
        owner_row_repaired(store, &session.verifying_key, &row, &session.secret).await
    {
        session.role = permission::OWNER.to_string();
        session.permissions = repaired.effective;
    }
}

/// Write this machine into the organization's registry, naming whoever is signed in on it
/// (effort 828, requirement 15).
///
/// The one write three of the four acts share: a sign-in passes the member, from `join::admit`
/// at the wall and from the first run's own sign-in; a sign-out passes `None`; and the first
/// state read of a launch passes whoever the record names, which is what registers a machine
/// that came back signed in without anybody typing a password. A connect is the fourth and
/// registers through `connect::connect`, because that is where the id is drawn.
///
/// **Nothing here is a refusal, and nothing comes back.** A machine whose row could not be
/// written or could not be sent still holds the organization and its person is still signed in;
/// what is lost is that the registry is a day out of date, and the next launch writes it again.
/// There is nothing for a caller to act on, so this answers with nothing and writes what happened
/// to the diagnostics log, the way [`remember`](fn@remember) does.
///
/// **A record with no `machine_id` writes nothing**, which is a record from before this build on
/// the way to its first launch under it: `state_of` (`command.rs`) is what gives it one, and until
/// it has one there is no row to write.
pub async fn machine_seen(
    store: &OrganizationStore,
    held: &HeldOrganization,
    member_id: Option<&str>,
    now: i64,
) {
    if held.machine_id.is_empty() {
        return;
    }

    if let Err(refusal) = store.machine_seen(&held.machine_id, member_id, now).await {
        diagnostics::warn("organization.machine.notSeen")
            .with("organization", held.id.as_str())
            .with("reason", refusal.to_string())
            .write();

        return;
    }

    if !store.push().await {
        diagnostics::warn("organization.machine.seenNotYetSent")
            .with("organization", held.id.as_str())
            .write();
    }
}

/// Find the member `username` and `password` name in `held`'s replica, and open their vault:
/// the sign-in at the wall (effort 824, requirement 19).
///
/// The password is tried against each member's vault in turn, a removed member's excepted, and
/// the sealed username on the row that opens is compared to the one typed, trimmed and without
/// case. The three refusals are one sentence: a password that opens no vault, a username nobody
/// holds, and a username held by a member whose password this is not are told apart by nothing,
/// because a password that opens somebody else's vault is not a fact to hand out, and neither is
/// whether a username is in the organization. The module comment says why nothing narrows the
/// rows first.
/// The one sentence for every pair that does not open a place: a wrong password, an unknown
/// username, another member's password, and a handed password somebody revoked. It names the
/// organization and nothing about the account.
pub fn refused_by_name(organization_name: &str) -> Error {
    Error::refused(
        RefusalReason::CredentialsWrong,
        format!("the username and password do not open a place in {organization_name}"),
    )
}

pub(crate) async fn sign_in_by_username(
    credentials: &dyn CredentialStore,
    store: &OrganizationStore,
    held: &HeldOrganization,
    username: &str,
    password: &str,
    credential: &CredentialSlot,
) -> Result<MemberSession, Error> {
    let verifying_key = verifying_key_of(held)?;
    let wanted = username.trim().to_lowercase();
    let members = store.members(&verifying_key).await?;
    let refused = || refused_by_name(&held.name);

    let mut found = None;

    // every vault the password opens is asked whose it is, and the walk goes on past one that
    // is somebody else's. Two members who chose the same password each open under it, since a
    // vault is its own salt, and the one that opens first is whoever joined first: stopping
    // there would refuse the later of the two at the wall for as long as they share it.
    //
    // a removed row is asked too, and passed over unless it is the owner's own meeting a removal
    // written from below, which their machine repairs here (`owner_row_repaired`).
    for member in &members {
        let Ok((secret, member_key)) = open_vault_with_key(password, &member.vault) else {
            continue;
        };
        let content_key = content_key_of(&member.sealed_content_key, &secret)?;
        let carried = opened(
            &content_key,
            "member.username_sealed",
            &member.username_sealed,
        )?;

        if carried.trim().to_lowercase() == wanted {
            let member = owner_row_repaired(store, &verifying_key, member, &secret)
                .await
                .unwrap_or_else(|| member.clone());

            if member.removed_at.is_some() {
                continue;
            }

            found = Some((member, secret, member_key, content_key));
            break;
        }
    }

    let Some((member, secret, member_key, content_key)) = found else {
        return Err(refused());
    };

    // a vault still sealed under the generated secret its invitation link carries is opened by
    // that link and by nothing typed at the wall (effort 826, ticket 03): the secret was never
    // shown to anybody, so whoever types it here decoded a link, and a link that was revoked has
    // to open nothing. The refusal is the one sentence, since it says no more than a wrong password.
    if member.must_change_password {
        return Err(refused());
    }

    let session = open_session(
        store,
        held,
        verifying_key,
        &member,
        secret,
        content_key,
        credential,
    )
    .await?;

    remember(
        credentials,
        &held.id,
        &session.member_id,
        session.session_epoch,
        &member_key,
    );

    Ok(session)
}

#[cfg(test)]
mod tests {
    use crate::credential::{CredentialStore, Memory};
    use crate::machine::RemoteSyncStore;
    use crate::organization::HeldOrganization;
    use crate::organization::authority::{
        AdministratorKey, OrganizationKey, issue_root_certificate,
    };
    use crate::organization::member::vault::{
        KdfParams, create_vault_with_secret, generate_content_key, seal_content,
        seal_to_public_key, unseal_with_secret_key,
    };
    use crate::organization::role::permission;
    use crate::organization::session::{CredentialSlot, facts_of, sign_in};
    use crate::organization::setup::{CreateOrganization, Remote, create_organization};
    use crate::organization::store::{
        GrantRecord, MemberRecord, OrganizationRecord, OrganizationStore, RoleRecord, Signer,
    };
    use crate::persisted::Persisted;
    use crate::sync::test::server::{ScriptedResponse, ScriptedServer};
    use crate::test::scratch;
    use crate::turso::discovery::McpEndpoint;
    use crate::turso::platform::InMemoryPlatform;
    use serde_json::json;
    use std::sync::{Arc, Mutex};

    const PASSWORD: &str = "a long enough password";

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

    /// An organization a first run made, on this machine, with no remote: the owner's vault,
    /// their grant on the organization database, and the machine's record of having joined.
    async fn created(
        credentials: &dyn CredentialStore,
        directory: &std::path::Path,
    ) -> (
        Persisted<RemoteSyncStore>,
        OrganizationStore,
        HeldOrganization,
    ) {
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
            1_757_000_000_000,
        )
        .await
        .expect("the first run failed");
        let joined = store.selected().cloned().expect("the record");

        (store, organization, joined)
    }

    #[tokio::test]
    async fn a_password_opens_the_vault_with_no_remote_and_the_facts_follow_from_the_rows() {
        let credentials = Memory::new();
        let directory = scratch("opens");
        let (_, store, joined) = created(&credentials, &directory).await;
        let credential = slot();

        let session = sign_in(&store, &joined, PASSWORD, &credential)
            .await
            .expect("the password did not open the vault");
        let facts = facts_of(&store, &session).await.expect("the facts");

        assert_eq!(session.role, "owner");
        assert_eq!(
            Some(session.member_id.as_str()),
            joined.member_id.as_deref()
        );
        assert!(!session.must_change_password);
        assert_eq!(facts.organization_name, "Acme");
        assert_eq!(facts.role, "owner");
        assert_eq!(facts.username, "olivia");
        assert_eq!(facts.owner_username, "olivia");
        assert!(
            facts.workspaces.is_empty(),
            "a first run has no workspace yet"
        );

        // the grant on the organization database was unsealed into the slot the replica reads.
        let unsealed = credential.lock().expect("the slot").clone();

        assert_eq!(
            unsealed.as_deref(),
            Some(format!("token-for-org-{}-4w-full-access", joined.id).as_str())
        );
        assert_eq!(
            format!("{session:?}"),
            format!("MemberSession({} in {})", session.member_id, joined.id)
        );
    }

    #[tokio::test]
    async fn a_wrong_password_opens_nothing_and_says_only_that() {
        let credentials = Memory::new();
        let directory = scratch("wrong");
        let (_, store, joined) = created(&credentials, &directory).await;
        let credential = slot();

        let refusal = sign_in(&store, &joined, "the wrong password", &credential)
            .await
            .expect_err("a wrong password opened the vault");

        assert!(
            matches!(refusal, crate::error::Error::Integrity { .. }),
            "{refusal:?}"
        );
        assert_eq!(refusal.to_string(), "the sealed value did not open");
        assert!(
            credential.lock().expect("the slot").is_none(),
            "a wrong password unsealed a credential"
        );
    }

    /// **Criterion 9.** The sign-in check is replaced with one that always succeeds, and the
    /// workspace still cannot be opened. There is no check to replace: a client that ignores the
    /// vault refusing to open and carries on has only a secret the password did not produce, and
    /// no grant opens under it. Performed here with exactly such a secret.
    #[tokio::test]
    async fn a_client_that_skips_the_password_check_still_cannot_open_a_grant() {
        let credentials = Memory::new();
        let directory = scratch("skip");
        let (_, store, joined) = created(&credentials, &directory).await;
        let key = crate::organization::session::verifying_key_of(&joined).expect("the key");
        let grant = store
            .grants(&key)
            .await
            .expect("the grants")
            .into_iter()
            .find(|grant| grant.workspace_id == joined.id)
            .expect("the owner's grant on the organization");
        let member = store.members(&key).await.expect("the members").remove(0);

        // the modified client: the vault "opened", and what it has to go on is a secret of its own.
        let (_, not_the_secret) =
            create_vault_with_secret("whatever the client decided", test_cost()).expect("a vault");

        assert!(
            unseal_with_secret_key(&not_the_secret, &grant.sealed_credential).is_err(),
            "a grant opened under a secret the password did not produce"
        );
        assert!(
            unseal_with_secret_key(&not_the_secret, &member.sealed_content_key).is_err(),
            "the content key opened under a secret the password did not produce"
        );

        // and nothing in this module can be made to answer yes: no function returns a bool, and
        // nothing compares a password against anything. The module is these four files, and the
        // shipping half of each is what comes before its tests.
        for source in [
            include_str!("mod.rs"),
            include_str!("signin.rs"),
            include_str!("remember.rs"),
            include_str!("epoch.rs"),
        ] {
            let shipping = source
                .split("\n#[cfg(test)]\nmod tests {")
                .next()
                .expect("the shipping half");

            assert!(
                !shipping.contains("-> bool"),
                "a boolean check appeared in sign-in"
            );
            assert!(
                !shipping.contains("password =="),
                "a password comparison appeared in sign-in"
            );
        }
    }

    #[tokio::test]
    async fn a_member_who_must_change_their_password_is_refused_by_the_guard() {
        let credentials = Memory::new();
        let directory = scratch("guard");
        let (_, store, joined) = created(&credentials, &directory).await;
        let mut session = sign_in(&store, &joined, PASSWORD, &slot())
            .await
            .expect("the password did not open the vault");

        session
            .settled()
            .expect("an owner who chose their password was refused");

        session.must_change_password = true;

        let refusal = session
            .settled()
            .expect_err("a member who must change their password was let through");

        assert!(
            matches!(
                refusal,
                crate::error::Error::Refused {
                    reason: crate::error::RefusalReason::PasswordChangeRequired,
                    ..
                }
            ),
            "{refusal:?}"
        );
        assert!(
            refusal.to_string().contains("change your password"),
            "{refusal}"
        );
    }

    /// **A machine that holds the organization and no member yet cannot sign in this way.** A
    /// connect by link records no member; the wall's sign-in finds the row by username
    /// (`sign_in_by_username`, tested in `invitation/join.rs`), and this one refuses a record with
    /// no member before any row is read.
    #[tokio::test]
    async fn a_record_with_no_member_is_refused_before_any_row_is_read() {
        let credentials = Memory::new();
        let directory = scratch("no-member");
        let (_, store, joined) = created(&credentials, &directory).await;
        let connected = HeldOrganization {
            member_id: None,
            role: None,
            ..joined
        };

        let refusal = sign_in(&store, &connected, PASSWORD, &slot())
            .await
            .expect_err("a record naming no member signed in");

        assert!(
            matches!(
                refusal,
                crate::error::Error::Refused {
                    reason: crate::error::RefusalReason::NoMemberYet,
                    ..
                }
            ),
            "{refusal:?}"
        );
        assert!(refusal.to_string().contains("no member"), "{refusal}");
    }

    /// Two organizations, and one person with a different role in each: the second is one
    /// somebody else administers, in which this machine's person is a member who must still
    /// change their password. Each opens with its own password and its own role, and one
    /// password does not open the other. *819's requirement 17 had a machine hold both at once;
    /// effort 824's requirement 17 has it hold one, so the two records here are two machines'.*
    #[tokio::test]
    async fn two_organizations_open_with_their_own_passwords_and_roles() {
        let credentials = Memory::new();
        let directory = scratch("two");
        let (_, store_a, joined_a) = created(&credentials, &directory).await;

        // the second organization, made elsewhere: its owner's chain, and this person as a member.
        let organization_key = OrganizationKey::generate().expect("a key");
        let administrator_key = AdministratorKey::generate().expect("a key");
        let certificate = issue_root_certificate(
            &organization_key,
            "cert-their-owner",
            "their-owner",
            &administrator_key.verifying_key(),
            "1757000000000",
        );
        let content_key = generate_content_key().expect("a content key");
        let (vault, their_secret) =
            create_vault_with_secret("the other password", test_cost()).expect("a vault");
        let credential = "token-for-org-b";
        let store_b = OrganizationStore::open(
            crate::clock::System::shared(),
            &directory.join("org-b.db"),
            None,
            || async { Ok::<String, turso::Error>(String::new()) },
        )
        .await
        .expect("the second replica");

        store_b.install_schema().await.expect("the schema");
        store_b
            .write_organization(&OrganizationRecord {
                id: "b".to_string(),
                name_sealed: seal_content(&content_key, "organization.name_sealed", b"Beta")
                    .expect("sealed"),
                verifying_key: organization_key.verifying_key(),
                remote_url: "libsql://org-b-other.aws-eu-west-1.turso.io".to_string(),
                created_at: 1_757_000_000_000,
            })
            .await
            .expect("the organization row");
        store_b
            .write_certificate(&certificate)
            .await
            .expect("the certificate");

        let signer = Signer {
            key: &administrator_key,
            certificate: &certificate,
        };

        for built_in in [permission::MANAGER_ROLE, permission::MEMBER_ROLE] {
            store_b
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
                .await
                .expect("a role");
        }

        store_b
            .write_member(
                &signer,
                &MemberRecord {
                    id: "me-there".to_string(),
                    username_sealed: seal_content(
                        &content_key,
                        "member.username_sealed",
                        b"me.there",
                    )
                    .expect("sealed"),
                    sealed_content_key: seal_to_public_key(
                        &vault.public_key,
                        &content_key.to_bytes(),
                    )
                    .expect("sealed"),
                    vault: vault.clone(),
                    signing_public_key: AdministratorKey::from_bytes(
                        &their_secret
                            .derive_seed(crate::organization::setup::ADMINISTRATOR_KEY_PURPOSE)
                            .expect("the signing seed"),
                    )
                    .verifying_key(),
                    role_id: permission::MEMBER.to_string(),
                    override_mask: 0,
                    removed_at: None,
                    effective: 0,
                    covered: true,
                    must_change_password: true,
                    created_at: 1_757_000_000_000,
                    updated_at: 1_757_000_000_000,
                    session_epoch: 0,
                    owner_seed_sealed: None,
                },
            )
            .await
            .expect("the member");
        store_b
            .write_grant(
                &signer,
                &GrantRecord {
                    member_id: "me-there".to_string(),
                    workspace_id: "b".to_string(),
                    sealed_credential: seal_to_public_key(&vault.public_key, credential.as_bytes())
                        .expect("sealed"),
                    access_level: "full-access".to_string(),
                    credential_expires_at: None,
                },
            )
            .await
            .expect("the grant");

        let joined_b = HeldOrganization {
            id: "b".to_string(),
            name: "Beta".to_string(),
            verifying_key: base64::Engine::encode(
                &base64::engine::general_purpose::URL_SAFE_NO_PAD,
                organization_key.verifying_key(),
            ),
            remote_url: "libsql://org-b-other.aws-eu-west-1.turso.io".to_string(),
            machine_id: "machine-one".to_string(),
            member_id: Some("me-there".to_string()),
            role: Some("member".to_string()),
            joined_at: 1_757_000_000_001,
            format: None,
            machine_signed_out: 0,
            turso_organization: None,
            workspace_id: None,
            name_signed: false,
        };

        // each opens with its own password and its own role.
        let a = sign_in(&store_a, &joined_a, PASSWORD, &slot())
            .await
            .expect("the first organization did not open");
        let b_slot = slot();
        let b = sign_in(&store_b, &joined_b, "the other password", &b_slot)
            .await
            .expect("the second organization did not open");

        assert_eq!(a.role, "owner");
        assert_eq!(b.role, "member");
        assert!(b.must_change_password);
        assert_eq!(
            b_slot.lock().expect("the slot").as_deref(),
            Some(credential)
        );

        let facts = facts_of(&store_b, &b).await.expect("the facts");

        assert_eq!(facts.organization_name, "Beta");
        assert_eq!(facts.username, "me.there");

        // and one password does not open the other organization.
        assert!(
            sign_in(&store_b, &joined_b, PASSWORD, &slot())
                .await
                .is_err()
        );
        assert!(
            sign_in(&store_a, &joined_a, "the other password", &slot())
                .await
                .is_err()
        );
    }
}
