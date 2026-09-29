//! a member's username: the rules it fits, the one check that it is not taken, and the rename that
//! writes it back (effort 824, requirements 21 and 23).

use crate::{
    diagnostics,
    error::{Error, RefusalReason},
};

use super::{MemberFacts, members, opened};
use crate::organization::{
    member::vault::seal_content,
    role::permission::{self, Flag},
    session::{MemberSession, actor, rank_of, refuse_unsettled},
    store::{MemberRecord, OrganizationStore, Signer},
    workspace::signer_of,
};

/// The bounds a username fits: short enough for a row and a chip, long enough to be somebody.
pub const USERNAME_MINIMUM_LENGTH: usize = 3;
pub const USERNAME_MAXIMUM_LENGTH: usize = 32;

/// The one sentence a username outside the rules is refused with, here and by every form.
pub const USERNAME_RULES: &str = "a username is three to thirty-two characters of letters, digits, dots, underscores and hyphens";

/// The one sentence a username somebody else holds is refused with.
pub const USERNAME_TAKEN: &str = "that username is already taken in this organization";

/// Check a username against requirement 21's rules: three to thirty-two characters, each an
/// ASCII letter, a digit, `.`, `_` or `-`. The caller trims first; a space inside is refused
/// like any other character outside the set.
pub fn validate_username(username: &str) -> Result<(), Error> {
    let allowed = username
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'));
    let fits = (USERNAME_MINIMUM_LENGTH..=USERNAME_MAXIMUM_LENGTH).contains(&username.len());

    if !allowed || !fits {
        return Err(Error::refused(
            RefusalReason::UsernameInvalid,
            USERNAME_RULES,
        ));
    }

    Ok(())
}

/// Refuse a username another member already holds, compared without case: `alice` and `Alice`
/// are one username. Every member still in is opened under the caller's content key, because
/// usernames are sealed and nothing else can compare them; a removed member's is free again.
/// `except` is the member whose own row is not counted, which a rename needs so a member can
/// keep their username under another case; an invitation passes `None`.
pub async fn refuse_taken_username(
    store: &OrganizationStore,
    session: &MemberSession,
    username: &str,
    except: Option<&str>,
) -> Result<(), Error> {
    let wanted = username.to_lowercase();

    for member in store
        .members(&session.verifying_key)
        .await?
        .iter()
        .filter(|member| member.removed_at.is_none())
        .filter(|member| except != Some(member.id.as_str()))
    {
        let held = opened(session, "member.username_sealed", &member.username_sealed)?;

        if held.to_lowercase() == wanted {
            return Err(Error::refused(RefusalReason::UsernameTaken, USERNAME_TAKEN));
        }
    }

    Ok(())
}

/// Rename a member: their row written back with the username re-sealed under the content key,
/// signed by whoever renamed them, and pushed like every other write (effort 824, requirement
/// 23). The act is [`Flag::RenameMember`], which requirement 4 of effort 826 gave a bit
/// of its own: it was held to inviting while the two were one decision, and an organization may
/// want somebody who corrects a spelling without being able to make an account. Nothing else on
/// the row moves: the vault, the role, the grants and the certificate are exactly as they were, so
/// a member renamed while signed in elsewhere goes on working under their own password.
///
/// A session renaming its own row is refused: an account's name is given by a holder of the flag
/// and changed by one, never by its holder, which is what keeps the rename an act on somebody
/// else's row and the actor's signature meaningful as such. `except` on the uniqueness check is the
/// member's own id, so `alice` may become `Alice` without being refused as taken by herself.
///
/// **From above, like every other act on an account** (effort 838, requirement 7): the owner's row
/// is refused, and so is a member whose role does not rank below the renamer's, and one whose
/// override switches a flag the renamer's certificate does not carry. The rename writes the row
/// again under the renamer's certificate, and the chain accepts that only from a certificate
/// ranked above the member and holding every flag their override switches; each is refused here
/// by name, before anything is written. The role's own mask is not the renamer's to hold: its
/// role row's signer vouched for it. *None of the three was asked until the review of effort 838
/// found a manager's rename of the owner writing a row every reader refused, and the directory
/// read by nobody; the third asked for every flag the member held until review round two bounded
/// a member row by its override.*
///
/// **A row its certificate no longer covers is not renamed** (`session::refuse_unsettled`): the
/// rename keeps every field but the username, so it would make the role somebody below the member
/// named real under the renamer's signature. The member is removed and made an account again. *A
/// rename saved such a row until the focused review of ticket 20 found it laundering a forged
/// promotion.*
pub async fn rename_member(
    store: &OrganizationStore,
    session: &MemberSession,
    member_id: &str,
    username: &str,
    now: i64,
) -> Result<MemberFacts, Error> {
    session.settled()?;

    let actor = actor(store, session).await?;

    permission::require(actor.row.effective, Flag::RenameMember)?;

    if member_id == session.member_id {
        return Err(Error::refused(
            RefusalReason::NotYourself,
            "you cannot rename yourself. somebody else who renames members can",
        ));
    }

    let username = username.trim();

    validate_username(username)?;

    let rows = store.members(&session.verifying_key).await?;
    let member = rows
        .iter()
        .find(|member| member.id == member_id)
        .ok_or_else(|| {
            Error::refused(
                RefusalReason::MemberMissing,
                "that member is not in this organization",
            )
        })?;

    if member.role_id == permission::OWNER {
        return Err(Error::refused(
            RefusalReason::OwnerProtected,
            "an owner is not renamed. their row is signed by their own certificate alone",
        ));
    }

    // a rename signs the row again with every other field kept, which on a row its certificate
    // no longer covers would make the role somebody below the member named real (the focused
    // review of ticket 20).
    refuse_unsettled(member)?;

    if member.removed_at.is_some() {
        return Err(Error::refused(
            RefusalReason::MemberRemoved,
            "that member was removed. invite them again if they are to come back",
        ));
    }

    actor.outranks(
        rank_of(store, session, member).await?,
        "that member's role is not below yours, so they are renamed by somebody who ranks above \
         them",
    )?;

    let (key, certificate) = signer_of(store, session).await?;

    // the row is written again under the renamer's certificate, which the chain accepts only
    // where it carries every flag the member's override switches (effort 838, the row-kind table).
    if let Some(flag) = permission::first_not_held(certificate.ceiling, member.override_mask) {
        return Err(Error::refused(
            RefusalReason::RoleLacksAct,
            format!(
                "that member has {flag} switched for them, and you do not hold it, so their row \
                 cannot be signed by you. somebody who holds it renames them"
            ),
        ));
    }

    refuse_taken_username(store, session, username, Some(member_id)).await?;

    let signer = Signer {
        key: &key,
        certificate: &certificate,
    };

    store
        .write_member(
            &signer,
            &MemberRecord {
                username_sealed: seal_content(
                    &session.content_key,
                    "member.username_sealed",
                    username.as_bytes(),
                )?,
                updated_at: now,
                ..member.clone()
            },
        )
        .await?;

    if !store.push().await {
        diagnostics::warn("organization.member.renameNotYetSent")
            .with("member", member_id)
            .write();
    }

    diagnostics::info("organization.member.renamed")
        .with("member", member_id)
        .write();

    // read back through the same routine the list draws from, so what the caller is handed is
    // what the members list will show.
    members(store, session)
        .await?
        .into_iter()
        .find(|member| member.id == member_id)
        .ok_or_else(|| Error::Integrity {
            message: "the renamed member's row did not read back".to_string(),
        })
}

#[cfg(test)]
mod tests {
    use crate::credential::{CredentialStore, Memory};
    use crate::error::{Error, RefusalReason};
    use crate::machine::RemoteSyncStore;
    use crate::organization::HeldOrganization;
    use crate::organization::invitation::link::{JoinLink, Locator};
    use crate::organization::invitation::{
        AccountAndLink, Invitation, USERNAME_RULES, USERNAME_TAKEN, WorkspaceGrant, create_account,
        locator, make_account_and_link, make_link, rename_member, validate_username,
    };
    use crate::organization::lease::apply::Pipeline;
    use crate::organization::member::vault::KdfParams;
    use crate::organization::role::permission;
    use crate::organization::session::{CredentialSlot, MemberSession, sign_in};
    use crate::organization::setup::{CreateOrganization, Remote, create_organization};
    use crate::organization::store::OrganizationStore;
    use crate::organization::workspace::create_workspace;
    use crate::persisted::Persisted;
    use crate::sync::test::server::{ScriptedResponse, ScriptedServer};
    use crate::test::scratch;
    use crate::turso::discovery::McpEndpoint;
    use crate::turso::platform::{AccessLevel, InMemoryPlatform};
    use serde_json::json;
    use std::sync::{Arc, Mutex};

    const PASSWORD: &str = "the owners password";

    /// The password somebody chooses when they open the first link made for their account, and
    /// the one that admits them at the wall from then on.
    const CHOSEN: &str = "a password sami chose";

    /// When the members list is read, where a test reads one. The standing of a pending
    /// invitation is the one thing on that list that turns on the clock.
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

    /// The machine's record of a member who joined, as the join ticket will write one.
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
        }
    }

    /// An organization with its owner signed in and one workspace, on a fake account.
    async fn owned(
        credentials: &dyn CredentialStore,
        directory: &std::path::Path,
    ) -> (
        OrganizationStore,
        MemberSession,
        Locator,
        String,
        Arc<InMemoryPlatform>,
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

        let (created, organization) = create_organization(
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
        let joined = store.organization.clone().expect("the record");
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
            1_757_000_000_000,
        )
        .await
        .expect("the workspace");
        let link = locator(&organization, &owner)
            .await
            .expect("the organization's locator");

        assert_eq!(link.organization_id, created.organization_id);

        (organization, owner, link, workspace.id, platform)
    }

    /// A machine's record with nothing on it, which is what a new machine is.
    fn fresh_machine(directory: &std::path::Path) -> Persisted<RemoteSyncStore> {
        let machine = Persisted::<RemoteSyncStore>::load(directory.join("remote-sync.json"))
            .expect("the store");

        assert!(
            machine.organization.is_none(),
            "the machine has prior state"
        );

        machine
    }

    /// One account opened on a machine of its own: the owner makes its link, the person opens it
    /// and chooses a password, and what comes back is their session and their machine's id.
    async fn opened_as(
        credentials: &dyn CredentialStore,
        store: &OrganizationStore,
        owner: &MemberSession,
        link: &Locator,
        member_id: &str,
        name: &str,
        now: i64,
    ) -> (MemberSession, String) {
        let made = make_link(
            store,
            owner,
            no_platform(),
            link,
            member_id,
            test_cost(),
            now,
        )
        .await
        .expect("the link could not be made");
        let directory = scratch(&format!("opened-{name}"));
        let mut machine = fresh_machine(&directory);
        let (_, session) = crate::organization::invitation::join::accept(
            credentials,
            |_| async { Ok::<_, Error>(store) },
            &mut machine,
            &JoinLink::decode(&made.link).expect("the link"),
            &made.code,
            CHOSEN,
            test_cost(),
            now + 1,
        )
        .await
        .expect("the account could not be opened");
        let machine_id = machine
            .organization
            .as_ref()
            .expect("the record")
            .machine_id
            .clone();

        (session, machine_id)
    }

    /// An account made by `maker` in `role_id` with `override_mask`, into no workspace.
    async fn made(
        store: &OrganizationStore,
        maker: &MemberSession,
        username: &str,
        role_id: &str,
        override_mask: i64,
    ) -> Result<super::MemberFacts, Error> {
        create_account(
            store,
            maker,
            no_platform(),
            username,
            role_id,
            override_mask,
            &[],
            test_cost(),
            NOW,
        )
        .await
    }

    /// Requirement 21's rules, at their limits: three and thirty-two characters are accepted,
    /// two and thirty-three refused, and any character outside letters, digits, `.`, `_` and `-`
    /// is refused, with the one sentence every form repeats.
    #[test]
    fn a_username_is_three_to_thirty_two_of_letters_digits_dot_underscore_and_hyphen() {
        let longest = "x".repeat(32);
        let too_long = "x".repeat(33);
        let accepted = ["abc", "a.b", "a_b", "a-b", "A1.b_C-9", longest.as_str()];
        let refused = [
            "",
            "ab",
            too_long.as_str(),
            "a b",
            " abc",
            "a@b.c",
            "ab!",
            "ali/ce",
            "élan",
            "ahmed\u{200b}",
            "a\tb",
        ];

        for username in accepted {
            assert!(
                validate_username(username).is_ok(),
                "{username:?} was refused"
            );
        }

        for username in refused {
            let error = validate_username(username).expect_err(username);

            assert!(
                matches!(
                    error,
                    Error::Refused {
                        reason: crate::error::RefusalReason::UsernameInvalid,
                        ..
                    }
                ),
                "{error:?}"
            );
            assert_eq!(error.to_string(), USERNAME_RULES, "{username:?}");
        }
    }

    /// A username is unique in the organization without regard to case: once `alice` is in,
    /// `Alice` is refused with the one sentence, and so is the owner's own under another case.
    /// The refusal for a username outside the rules is the other sentence, and it comes first.
    #[tokio::test]
    async fn a_username_already_held_is_refused_in_any_case() {
        let credentials = Memory::new();
        let directory = scratch("taken");
        let (store, owner, link, _, _) = owned(&credentials, &directory).await;
        let invite = |username: &'static str| {
            let store = &store;
            let owner = &owner;
            let link = &link;

            async move {
                make_account_and_link(
                    store,
                    owner,
                    no_platform(),
                    link,
                    Invitation {
                        username,
                        role: permission::MEMBER,
                        workspaces: &[],
                    },
                    test_cost(),
                    1,
                )
                .await
            }
        };

        invite("alice").await.expect("the first alice was refused");

        for taken in ["Alice", "ALICE", " alice ", "OLIVIA"] {
            let error = invite(taken).await.expect_err(taken);

            assert!(
                matches!(
                    error,
                    Error::Refused {
                        reason: crate::error::RefusalReason::UsernameTaken,
                        ..
                    }
                ),
                "{error:?}"
            );
            assert_eq!(error.to_string(), USERNAME_TAKEN, "{taken:?}");
        }

        for outside in ["al", "al ice", "alice@acme.example"] {
            let error = invite(outside).await.expect_err(outside);

            assert_eq!(error.to_string(), USERNAME_RULES, "{outside:?}");
        }

        let members = crate::organization::invitation::members(&store, &owner)
            .await
            .expect("the members");
        let mut usernames: Vec<&str> = members
            .iter()
            .map(|member| member.username.as_str())
            .collect();
        usernames.sort_unstable();

        assert_eq!(usernames, vec!["alice", "olivia"]);
    }

    /// The certificate a member's row names, read off the replica: which signer stands behind it.
    async fn signed_by(store: &OrganizationStore, member_id: &str) -> String {
        let mut rows = store
            .connection()
            .query(
                "SELECT \"certificate_id\", \"updated_at\" FROM \"member\" WHERE \"id\" = ?",
                vec![turso::Value::Text(member_id.to_string())],
            )
            .await
            .expect("the row");
        let row = rows
            .next()
            .await
            .expect("a row")
            .expect("the member row exists");

        match row.get_value(0).expect("the certificate id") {
            turso::Value::Text(id) => id,
            other => panic!("certificate_id is {other:?}"),
        }
    }

    /// Requirement 23: a rename by the owner is what the members list reads back; the row is
    /// signed by whoever renamed it rather than by whoever wrote it before, and nothing else on
    /// it moves, so the member still signs in under their own password. A member keeps their
    /// own username under another case, because their own row is not counted as taking it.
    #[tokio::test]
    async fn a_rename_is_read_back_by_the_members_list_and_the_row_is_signed_by_the_renamer() {
        let credentials = Memory::new();
        let directory = scratch("rename");
        let (store, owner, link, workspace_id, _) = owned(&credentials, &directory).await;

        // a manager invites the member, so the member's row is signed under the
        // manager's certificate and a rename by the owner has a signer to change.
        let admin = make_account_and_link(
            &store,
            &owner,
            no_platform(),
            &link,
            Invitation {
                username: "ada.admin",
                role: permission::MANAGER,
                workspaces: &full(std::slice::from_ref(&workspace_id)),
            },
            test_cost(),
            1,
        )
        .await
        .expect("the manager");
        let mut ada = sign_in(
            &store,
            &joined_as(&owner, &admin.member_id, permission::MANAGER),
            &secret_of(&admin),
            &slot(),
        )
        .await
        .expect("the manager did not sign in");
        ada.must_change_password = false;

        let sami = make_account_and_link(
            &store,
            &ada,
            no_platform(),
            &link,
            Invitation {
                username: "sami",
                role: permission::MEMBER,
                workspaces: &full(std::slice::from_ref(&workspace_id)),
            },
            test_cost(),
            2,
        )
        .await
        .expect("the member");

        // signed under the manager's live certificate, the one `signer_of` finds for them.
        let (_, managers_certificate) = crate::organization::workspace::signer_of(&store, &ada)
            .await
            .expect("the manager's signer");

        assert_eq!(
            signed_by(&store, &sami.member_id).await,
            managers_certificate.id
        );

        let renamed = rename_member(&store, &owner, &sami.member_id, " Sami.Staff ", 3)
            .await
            .expect("the rename failed");

        assert_eq!(renamed.id, sami.member_id);
        assert_eq!(renamed.username, "Sami.Staff");
        assert_eq!(renamed.role, permission::MEMBER);
        assert_eq!(
            renamed
                .workspaces
                .iter()
                .map(|workspace| workspace.id.clone())
                .collect::<Vec<_>>(),
            vec![workspace_id.clone()]
        );

        let listed = crate::organization::invitation::members(&store, &owner)
            .await
            .expect("the members")
            .into_iter()
            .find(|member| member.id == sami.member_id)
            .expect("the renamed member is listed");

        assert_eq!(listed.username, "Sami.Staff");

        // signed by the owner now, whose certificate is the one `signer_of` finds for them.
        let (_, owners_certificate) = crate::organization::workspace::signer_of(&store, &owner)
            .await
            .expect("the owner's signer");

        assert_eq!(
            signed_by(&store, &sami.member_id).await,
            owners_certificate.id
        );

        let row = store
            .members(&owner.verifying_key)
            .await
            .expect("the rows")
            .into_iter()
            .find(|member| member.id == sami.member_id)
            .expect("the row");

        assert_eq!(row.updated_at, 3);
        assert_eq!(row.created_at, 2);
        assert!(row.must_change_password, "the rename settled the member");

        // nothing else moved: the same password opens the same vault and reaches the same
        // workspace.
        let member = sign_in(
            &store,
            &joined_as(&owner, &sami.member_id, permission::MEMBER),
            &secret_of(&sami),
            &slot(),
        )
        .await
        .expect("the renamed member did not sign in");

        assert!(member.workspace_credentials.contains_key(&workspace_id));

        // their own username under another case is theirs to keep.
        let lowered = rename_member(&store, &owner, &sami.member_id, "sami.staff", 4)
            .await
            .expect("a member could not keep their username under another case");

        assert_eq!(lowered.username, "sami.staff");
    }

    /// The three refusals: a username somebody else holds, in any case; a session renaming its
    /// own row; a session whose row does not carry the act. And the rules sentence comes before
    /// the uniqueness one, as it does on an invitation.
    #[tokio::test]
    async fn a_rename_is_refused_for_a_taken_username_for_ones_own_row_and_without_the_act() {
        let credentials = Memory::new();
        let directory = scratch("rename-refused");
        let (store, owner, link, _, _) = owned(&credentials, &directory).await;
        let invite = |username: &'static str| {
            let store = &store;
            let owner = &owner;
            let link = &link;

            async move {
                make_account_and_link(
                    store,
                    owner,
                    no_platform(),
                    link,
                    Invitation {
                        username,
                        role: permission::MEMBER,
                        workspaces: &[],
                    },
                    test_cost(),
                    1,
                )
                .await
                .expect("the invitation failed")
            }
        };
        let sami = invite("sami").await;
        let bob = invite("bob").await;

        for taken in ["Bob", "BOB", " bob ", "olivia", "OLIVIA"] {
            let error = rename_member(&store, &owner, &sami.member_id, taken, 2)
                .await
                .expect_err(taken);

            assert!(
                matches!(
                    error,
                    Error::Refused {
                        reason: crate::error::RefusalReason::UsernameTaken,
                        ..
                    }
                ),
                "{error:?}"
            );
            assert_eq!(error.to_string(), USERNAME_TAKEN, "{taken:?}");
        }

        for outside in ["sa", "sa mi", "sami@acme.example", ""] {
            let error = rename_member(&store, &owner, &sami.member_id, outside, 2)
                .await
                .expect_err(outside);

            assert_eq!(error.to_string(), USERNAME_RULES, "{outside:?}");
        }

        let error = rename_member(&store, &owner, &owner.member_id, "olivia.owner", 2)
            .await
            .expect_err("the owner renamed themselves");

        assert!(
            matches!(
                error,
                Error::Refused {
                    reason: crate::error::RefusalReason::NotYourself,
                    ..
                }
            ),
            "{error:?}"
        );
        assert!(error.to_string().contains("yourself"), "{error}");

        let mut member = sign_in(
            &store,
            &joined_as(&owner, &sami.member_id, permission::MEMBER),
            &secret_of(&sami),
            &slot(),
        )
        .await
        .expect("the member did not sign in");
        member.must_change_password = false;

        let error = rename_member(&store, &member, &bob.member_id, "robert", 2)
            .await
            .expect_err("a member renamed somebody");

        assert!(
            matches!(
                error,
                Error::Refused {
                    reason: crate::error::RefusalReason::RoleLacksAct,
                    ..
                }
            ),
            "{error:?}"
        );
        assert!(error.to_string().contains("renameMember"), "{error}");

        let error = rename_member(&store, &owner, "nobody", "robert", 2)
            .await
            .expect_err("a member who is not there was renamed");

        assert!(
            matches!(
                error,
                Error::Refused {
                    reason: crate::error::RefusalReason::MemberMissing,
                    ..
                }
            ),
            "{error:?}"
        );

        // and nothing was written by any of them.
        let mut usernames: Vec<String> = crate::organization::invitation::members(&store, &owner)
            .await
            .expect("the members")
            .into_iter()
            .map(|member| member.username)
            .collect();
        usernames.sort_unstable();

        assert_eq!(usernames, vec!["bob", "olivia", "sami"]);
    }

    /// **A rename is from above, like every other act on an account** (the review of effort 838,
    /// round one). A manager renaming the owner is refused as the owner's row, one renaming another
    /// manager as not below them, and one renaming themselves as their own; each refusal writes
    /// nothing and the directory still reads on every machine. Below them, the rename is made.
    /// *A manager's rename of the owner wrote a member row every reader refused until then, and
    /// the directory was read by nobody.*
    #[tokio::test]
    async fn a_rename_is_refused_of_the_owner_at_or_above_the_renamer_and_of_oneself() {
        let credentials = Memory::new();
        let directory = scratch("rename-rank");
        let (store, owner, link, _, _) = owned(&credentials, &directory).await;
        let ada = made(&store, &owner, "ada.manager", permission::MANAGER, 0)
            .await
            .expect("the owner could not make a manager");
        let bea = made(&store, &owner, "bea.manager", permission::MANAGER, 0)
            .await
            .expect("the owner could not make a manager");
        let mo = made(&store, &owner, "mo.staff", permission::MEMBER, 0)
            .await
            .expect("the owner could not make a member");
        let (ada_session, _) =
            opened_as(&credentials, &store, &owner, &link, &ada.id, "ada", NOW + 1).await;
        let certificates = store.certificates().await.expect("the certificates");

        for (member_id, reason, what) in [
            (
                owner.member_id.as_str(),
                RefusalReason::OwnerProtected,
                "a manager renamed the owner",
            ),
            (
                bea.id.as_str(),
                RefusalReason::RankNotAbove,
                "a manager renamed another manager",
            ),
            (
                ada.id.as_str(),
                RefusalReason::NotYourself,
                "a manager renamed themselves",
            ),
        ] {
            let error = rename_member(&store, &ada_session, member_id, "renamed", NOW + 2)
                .await
                .expect_err(what);

            assert!(
                matches!(&error, Error::Refused { reason: refused, .. } if *refused == reason),
                "{what}: {error:?}"
            );
            store
                .members(&owner.verifying_key)
                .await
                .unwrap_or_else(|error| {
                    panic!("{what}, and the directory stopped reading: {error:?}")
                });
        }

        assert_eq!(
            store.certificates().await.expect("the certificates"),
            certificates,
            "a refused rename moved a certificate"
        );

        let renamed = rename_member(&store, &ada_session, &mo.id, "mo.renamed", NOW + 3)
            .await
            .expect("a manager could not rename a member below them");

        assert_eq!(renamed.username, "mo.renamed");

        let mut usernames: Vec<String> = crate::organization::invitation::members(&store, &owner)
            .await
            .expect("the directory reads")
            .into_iter()
            .map(|member| member.username)
            .collect();
        usernames.sort_unstable();

        assert_eq!(
            usernames,
            vec!["ada.manager", "bea.manager", "mo.renamed", "olivia"]
        );
    }
}
