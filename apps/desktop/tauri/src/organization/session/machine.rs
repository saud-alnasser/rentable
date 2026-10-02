//! one of a member's machines: named, listed, and signed out on its own (effort 846, requirements 9
//! to 11).
//!
//! **A number per machine that only the member's other machines write.** Signing every other
//! machine out moves `member.session_epoch` ([`end_elsewhere`](super::end_elsewhere)), which cannot
//! single one out. Signing one out moves that machine's row in `machine_sign_out` on instead, and
//! the machine compares it with the number it last acknowledged, which its own record keeps
//! (`HeldOrganization::machine_signed_out`): above it, the machine was signed out from elsewhere.
//! The record takes the number at every sign-in by password or by an opened vault and never at a
//! resume, so the same password signs a machine back in, and a machine closed when it was ended
//! meets the wall at its next launch. The comparison is made where the epoch's is, at the resume
//! (`remember::resumed`), on the heartbeat (`heartbeat::ended_elsewhere`), and before every act
//! (`acting_row`, against the number the open session took), so a machine ended by a pull cannot
//! act in the window before its heartbeat.
//!
//! **A machine that has not run this version would not read its row**, so it is not signed out on
//! its own: the name row it writes is what says it has ([`MachineView::may_end_alone`]). Signing
//! every other machine out still reaches it.
//!
//! **Nothing here is signed**, as nothing in the registry is: a holder of the organization
//! credential could end another member's machine or rename a row, which is the availability limit
//! the epoch already carries (the human, 2026-09-15). The command keeps an honest client to the
//! reader's own machines.

use serde::{Deserialize, Serialize};

use crate::{
    diagnostics,
    error::{Error, RefusalReason},
    machine::name,
};

use super::{MemberSession, acting_row, opened};
use crate::organization::{
    HeldOrganization,
    member::vault::{ContentKey, seal_content},
    store::OrganizationStore,
};

/// How often the heartbeat says this machine is still here: hourly, so a machine's last seen in
/// its member's list is its last contact rather than its last launch (effort 846, requirement 9),
/// without a write on every heartbeat.
pub const SEEN_REFRESH: i64 = 60 * 60 * 1000;

/// The column a machine's name is sealed under, which the seal binds as associated data.
const NAME_COLUMN: &str = "machine_name.name";

/// One machine signed in as the reader, as their account section lists it (effort 846,
/// requirement 9).
///
/// **Facts about a machine and never a credential** ([[rules/credentials]], *Client boundary*):
/// its id in the registry, the name it gave itself, and two moments.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MachineView {
    pub id: String,
    /// what its operating system calls it, opened with the content key, trimmed and held to 64
    /// characters. `None` on a machine that has not named itself, which is one that has not run
    /// this version, and on one whose operating system gave no name: the interface says what it
    /// says for either, and never the id.
    pub name: Option<String>,
    /// when it last said it was here: a sign-in, a launch, or the hourly heartbeat.
    pub seen_at: i64,
    /// when it joined the organization.
    pub created_at: i64,
    /// whether it is the machine this list was read on, which is listed first.
    pub is_this_machine: bool,
    /// whether it can be signed out on its own: another machine of the reader's that has run this
    /// version, which is what its name row says (requirement 10). A machine that has not would
    /// not read its sign-out, and *sign out all other machines* is what reaches it.
    pub may_end_alone: bool,
}

/// The number a sign-in acknowledges for this machine and `member_id`: what
/// `HeldOrganization::machine_signed_out` takes at every sign-in by password or by an opened vault
/// (`join::admit`, the invitation accept, the first run and the owner's connect), and never at a
/// resume. A record with no machine id yet has nothing to acknowledge.
pub(crate) async fn sign_outs_acknowledged(
    store: &OrganizationStore,
    machine_id: &str,
    member_id: &str,
) -> Result<i64, Error> {
    if machine_id.is_empty() {
        return Ok(0);
    }

    store.machine_signed_out(machine_id, member_id).await
}

/// Whether another machine signed this one out on its own since it last acknowledged a number
/// (effort 846, requirement 10): asked beside the epoch at the resume and on the heartbeat, off
/// the replica as it stands.
pub(crate) async fn signed_out_here(
    store: &OrganizationStore,
    held: &HeldOrganization,
    member_id: &str,
) -> Result<bool, Error> {
    if held.machine_id.is_empty() {
        return Ok(false);
    }

    Ok(store
        .machine_signed_out(&held.machine_id, member_id)
        .await?
        > held.machine_signed_out)
}

/// Whether another machine signed this one out on its own since `session` opened (effort 846,
/// requirement 10): [`signed_out_here`] asked of the open session, which carries the number it
/// opened under, so every act asks it ([`acting_row`]) without taking the machine record's lock.
pub(crate) async fn ended_alone(
    store: &OrganizationStore,
    session: &MemberSession,
) -> Result<bool, Error> {
    if session.machine_id.is_empty() {
        return Ok(false);
    }

    Ok(store
        .machine_signed_out(&session.machine_id, &session.member_id)
        .await?
        > session.machine_signed_out)
}

/// Write the name this machine's operating system gives it, where its row says otherwise or there
/// is none (effort 846, requirement 11): at a sign-in, at a launch that came back signed in, and on
/// the heartbeat. Answers whether it wrote, so the caller knows whether there is anything to push.
///
/// **Nothing here is a refusal.** A name that could not be written is a list reading as it did,
/// and the next heartbeat tries again.
pub(crate) async fn machine_named(
    store: &OrganizationStore,
    held: &HeldOrganization,
    content_key: &ContentKey,
    now: i64,
) -> bool {
    match named(
        store,
        held,
        content_key,
        name::this_machine().as_deref(),
        now,
    )
    .await
    {
        Ok(wrote) => wrote,
        Err(refusal) => {
            diagnostics::warn("organization.machine.notNamed")
                .with("organization", held.id.as_str())
                .with("reason", refusal.to_string())
                .write();

            false
        }
    }
}

/// The write behind [`machine_named`], with the name handed in.
///
/// **Only where the name differs**, read open rather than compared sealed: a seal draws a fresh
/// nonce, so the bytes of an unchanged name differ every time and a comparison of them would
/// rewrite the row on every call. A replica that does not hold the table yet writes nothing, and
/// the heartbeat after the pull that brings it writes the row.
async fn named(
    store: &OrganizationStore,
    held: &HeldOrganization,
    content_key: &ContentKey,
    name: Option<&str>,
    now: i64,
) -> Result<bool, Error> {
    if held.machine_id.is_empty() || !store.tables().await?.iter().any(|t| t == "machine_name") {
        return Ok(false);
    }

    let wanted = name.and_then(name::trimmed);
    let standing = store
        .machine_names()
        .await?
        .into_iter()
        .find(|row| row.id == held.machine_id);

    if let Some(row) = &standing
        && opened_name(content_key, row.name_sealed.as_deref()) == wanted
    {
        return Ok(false);
    }

    let sealed = wanted
        .as_deref()
        .map(|name| seal_content(content_key, NAME_COLUMN, name.as_bytes()))
        .transpose()?;

    store
        .write_machine_name(&held.machine_id, sealed.as_deref(), now)
        .await?;

    Ok(true)
}

/// What the heartbeat keeps true of this machine while it is signed in: its name, and that it is
/// still here, said at most once an hour (effort 846, requirements 9 and 11). What it wrote is
/// pushed, best effort.
pub(crate) async fn machine_kept(
    store: &OrganizationStore,
    held: &HeldOrganization,
    session: &MemberSession,
    now: i64,
) {
    if held.machine_id.is_empty() {
        return;
    }

    let mut wrote = machine_named(store, held, &session.content_key, now).await;

    let stale = match store.machine(&held.machine_id).await {
        Ok(row) => row.is_none_or(|row| now - row.seen_at >= SEEN_REFRESH),
        Err(refusal) => {
            diagnostics::warn("organization.machine.notSeen")
                .with("organization", held.id.as_str())
                .with("reason", refusal.to_string())
                .write();

            false
        }
    };

    if stale {
        match store
            .machine_seen(&held.machine_id, Some(&session.member_id), now)
            .await
        {
            Ok(()) => wrote = true,
            Err(refusal) => diagnostics::warn("organization.machine.notSeen")
                .with("organization", held.id.as_str())
                .with("reason", refusal.to_string())
                .write(),
        }
    }

    if wrote && !store.push().await {
        diagnostics::warn("organization.machine.seenNotYetSent")
            .with("organization", held.id.as_str())
            .write();
    }
}

/// Every machine signed in as the reader, this one first and then the one most lately seen
/// (effort 846, requirement 9), however long ago each was seen: a laptop closed for a month still
/// holds a remembered key, and it is the one the reader most needs to end. Another member's
/// machines are never in it, since the member is the session's.
pub async fn machines(
    store: &OrganizationStore,
    session: &MemberSession,
    held: &HeldOrganization,
) -> Result<Vec<MachineView>, Error> {
    session.settled()?;
    acting_row(store, session).await?;

    let names = store.machine_names().await?;
    let mut machines: Vec<MachineView> = store
        .machines_of(&session.member_id)
        .await?
        .into_iter()
        .map(|machine| {
            let row = names.iter().find(|row| row.id == machine.id);
            let is_this_machine = !held.machine_id.is_empty() && machine.id == held.machine_id;

            MachineView {
                name: row
                    .and_then(|row| opened_name(&session.content_key, row.name_sealed.as_deref())),
                seen_at: machine.seen_at,
                created_at: machine.created_at,
                is_this_machine,
                may_end_alone: row.is_some() && !is_this_machine,
                id: machine.id,
            }
        })
        .collect();

    // stable, so the rest keep the store's order: the one most lately seen first.
    machines.sort_by_key(|machine| !machine.is_this_machine);

    Ok(machines)
}

/// Sign one of the reader's other machines out, and stay signed in here (effort 846, requirement
/// 10).
///
/// **The member is the session's, never the caller's**, so this reaches only the reader's own
/// machines. Refused: this machine itself (signing out here is the sign-out), a machine that is not
/// signed in as the reader, and one that has not run this version, which would not read its row;
/// *sign out all other machines* is what reaches that one. The number on the machine's row moves
/// one past the greatest this replica holds, the machine stops naming the reader so it leaves the
/// list at once, and nothing about the password or the epoch moves.
///
/// **What comes back is whether it reached the organization database**, as
/// [`end_elsewhere`](super::end_elsewhere)'s does: offline, the sign-out waits on this machine,
/// and the heartbeat's own push carries it once there is a connection.
pub(crate) async fn end_machine(
    store: &OrganizationStore,
    session: &MemberSession,
    held: &HeldOrganization,
    machine_id: &str,
    now: i64,
) -> Result<bool, Error> {
    session.settled()?;

    // the acting row, with a session behind its epoch refused, as `end_elsewhere` refuses it: a
    // machine whose sessions were ended has nothing left to end anybody else's with.
    acting_row(store, session).await?;

    if machine_id == held.machine_id {
        return Err(Error::refused(
            RefusalReason::NotYourself,
            "this is the machine you are on. sign out here instead",
        ));
    }

    let signed_in_as_you = store
        .machine(machine_id)
        .await?
        .is_some_and(|machine| machine.member_id.as_deref() == Some(session.member_id.as_str()));

    if !signed_in_as_you {
        return Err(Error::refused(
            RefusalReason::MachineMissing,
            "that machine is not signed in as you any more",
        ));
    }

    if !store
        .machine_names()
        .await?
        .iter()
        .any(|row| row.id == machine_id)
    {
        return Err(Error::refused(
            RefusalReason::MachineNotUpdated,
            "that machine has not run this version of rentable, so it would not read a sign-out of \
             its own. sign out all other machines instead, which reaches it. nothing was changed",
        ));
    }

    let epoch = store
        .machine_signed_out(machine_id, &session.member_id)
        .await?
        + 1;

    store
        .set_machine_signed_out(machine_id, &session.member_id, epoch, now)
        .await?;
    store
        .clear_member_from_machine(machine_id, &session.member_id)
        .await?;

    let sent = store.push().await;

    if !sent {
        diagnostics::warn("organization.session.machineEndedNotYetSent")
            .with("member", session.member_id.as_str())
            .write();
    }

    diagnostics::info("organization.session.machineEnded")
        .with("member", session.member_id.as_str())
        .write();

    Ok(sent)
}

/// A sealed name opened and held to the cap, or `None` where there is none or it does not open:
/// a row somebody wrote around the command reads as a machine with no name rather than refusing
/// the list.
fn opened_name(content_key: &ContentKey, sealed: Option<&[u8]>) -> Option<String> {
    sealed
        .and_then(|sealed| opened(content_key, NAME_COLUMN, sealed).ok())
        .and_then(|name| name::trimmed(&name))
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use serde_json::json;

    use super::{end_machine, machines, named, sign_outs_acknowledged, signed_out_here};
    use crate::credential::{CredentialStore, Memory};
    use crate::error::{Error, RefusalReason};
    use crate::machine::RemoteSyncStore;
    use crate::organization::HeldOrganization;
    use crate::organization::authority::AdministratorKey;
    use crate::organization::member::vault::{
        KdfParams, MemberKey, create_vault_with_secret, open_vault, seal_content,
        seal_to_public_key,
    };
    use crate::organization::role::permission;
    use crate::organization::session::{
        CredentialSlot, MEMBER_KEY_SERVICE, MemberSession, Resumption, end_elsewhere, resume,
        sign_in,
    };
    use crate::organization::setup::{
        ADMINISTRATOR_KEY_PURPOSE, CreateOrganization, Remote, create_organization,
    };
    use crate::organization::store::{MemberRecord, OrganizationStore, Signer};
    use crate::organization::workspace::signer_of;
    use crate::persisted::Persisted;
    use crate::sync::test::server::{ScriptedResponse, ScriptedServer};
    use crate::test::scratch;
    use crate::turso::discovery::McpEndpoint;
    use crate::turso::platform::InMemoryPlatform;

    const PASSWORD: &str = "a long enough password";

    const NOW: i64 = 1_760_000_000_000;

    const DAY: i64 = 24 * 60 * 60 * 1000;

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
    /// their grant on the organization database, and the machine's record of having joined, which
    /// carries the machine id the first run drew. *`epoch.rs` keeps the same fixture; one is
    /// written out per module ([[rules/testing]]).*
    async fn created(
        credentials: &dyn CredentialStore,
        directory: &std::path::Path,
    ) -> (OrganizationStore, HeldOrganization) {
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
        let joined = store.organization.clone().expect("the record");

        assert!(!joined.machine_id.is_empty(), "the first run drew no id");

        (organization, joined)
    }

    /// The same replica opened again: another machine, as far as the rows go, once a push and a
    /// pull have run between them. There is no remote here, so the file is what they share.
    async fn elsewhere(directory: &std::path::Path, held: &HeldOrganization) -> OrganizationStore {
        OrganizationStore::open(
            crate::clock::System::shared(),
            &OrganizationStore::replica_path(&directory.join("app.db"), &held.id),
            None,
            || async { Ok::<String, turso::Error>(String::new()) },
        )
        .await
        .expect("the other machine's replica")
    }

    /// Another machine's record of the same organization: the same member, its own machine id.
    fn on(machine_id: &str, held: &HeldOrganization) -> HeldOrganization {
        HeldOrganization {
            machine_id: machine_id.to_string(),
            ..held.clone()
        }
    }

    /// A machine signed in as the session's member, seen at `seen_at`, and named `name` where it
    /// is given one: what a machine on this version writes at its sign-in.
    async fn signed_in_on(
        store: &OrganizationStore,
        held: &HeldOrganization,
        session: &MemberSession,
        name: Option<&str>,
        seen_at: i64,
    ) {
        store
            .machine_seen(&held.machine_id, Some(&session.member_id), seen_at)
            .await
            .expect("the machine did not register");
        named(store, held, &session.content_key, name, seen_at)
            .await
            .expect("the machine did not name itself");
    }

    /// Another member of the organization, written under the owner's authority and signed in.
    async fn a_member(
        store: &OrganizationStore,
        owner: &MemberSession,
        joined: &HeldOrganization,
        id: &str,
        username: &str,
    ) -> MemberSession {
        let (key, certificate) = signer_of(store, owner).await.expect("the owner's signer");
        let signer = Signer {
            key: &key,
            certificate: &certificate,
        };
        let password = "a password of their own";
        let (vault, secret) = create_vault_with_secret(password, test_cost()).expect("a vault");

        store
            .write_member(
                &signer,
                &MemberRecord {
                    id: id.to_string(),
                    username_sealed: seal_content(
                        &owner.content_key,
                        "member.username_sealed",
                        username.as_bytes(),
                    )
                    .expect("sealed"),
                    sealed_content_key: seal_to_public_key(
                        &vault.public_key,
                        &owner.content_key.to_bytes(),
                    )
                    .expect("sealed"),
                    vault: vault.clone(),
                    signing_public_key: AdministratorKey::from_bytes(
                        &secret
                            .derive_seed(ADMINISTRATOR_KEY_PURPOSE)
                            .expect("the signing seed"),
                    )
                    .verifying_key(),
                    role_id: permission::MEMBER.to_string(),
                    override_mask: 0,
                    removed_at: None,
                    effective: 0,
                    covered: true,
                    must_change_password: false,
                    created_at: 1_757_000_000_000,
                    updated_at: 1_757_000_000_000,
                    session_epoch: 0,
                    owner_seed_sealed: None,
                },
            )
            .await
            .expect("the member row");

        let verifying_key =
            crate::organization::session::verifying_key_of(joined).expect("the key");
        let members = store.members(&verifying_key).await.expect("the members");
        let member = members
            .iter()
            .find(|member| member.id == id)
            .expect("the row just written");
        let secret = open_vault(password, &member.vault).expect("their password did not open");
        let content_key =
            crate::organization::session::content_key_of(&member.sealed_content_key, &secret)
                .expect("the content key");

        crate::organization::session::open_session(
            store,
            joined,
            verifying_key,
            member,
            secret,
            content_key,
            &slot(),
        )
        .await
        .expect("their session")
    }

    fn refused_for(error: &Error) -> Option<RefusalReason> {
        match error {
            Error::Refused { reason, .. } => Some(*reason),
            _ => None,
        }
    }

    /// **Criterion 9 at the store and session.** Two stores over one replica, each its own
    /// machine: each lists both, itself first and flagged. A machine last seen thirty days ago is
    /// listed, one with no name row lists no name and cannot be ended alone, and another member's
    /// machine is in neither list.
    #[tokio::test]
    async fn every_machine_signed_in_as_the_reader_is_listed_this_one_first() {
        let credentials = Memory::new();
        let directory = scratch("machines-listed");
        let (store, here) = created(&credentials, &directory).await;
        let there = on("machine-there", &here);
        let second = elsewhere(&directory, &here).await;
        let a = sign_in(&store, &here, PASSWORD, &slot())
            .await
            .expect("this machine did not sign in");
        let b = sign_in(&second, &there, PASSWORD, &slot())
            .await
            .expect("the other machine did not sign in");

        signed_in_on(&store, &here, &a, Some("Olivia's Desk"), NOW - 2 * DAY).await;
        signed_in_on(&second, &there, &b, Some("Olivia's Laptop"), NOW - 1000).await;
        // a machine that signed in before this version and has not been back for a month: in the
        // registry, with no name row.
        store
            .machine_seen("machine-old", Some(&a.member_id), NOW - 30 * DAY)
            .await
            .expect("the old machine");

        let sami = a_member(&store, &a, &here, "member-sami", "sami.staff").await;

        signed_in_on(
            &store,
            &on("machine-sami", &here),
            &sami,
            Some("Sami's Laptop"),
            NOW,
        )
        .await;

        let listed = machines(&store, &a, &here).await.expect("the list");
        let ids: Vec<&str> = listed.iter().map(|machine| machine.id.as_str()).collect();

        assert_eq!(
            ids,
            vec![here.machine_id.as_str(), "machine-there", "machine-old"],
            "this machine is not first, or the rest are not the most lately seen first"
        );
        assert!(listed[0].is_this_machine);
        assert!(!listed[1].is_this_machine && !listed[2].is_this_machine);
        assert_eq!(listed[0].name.as_deref(), Some("Olivia's Desk"));
        assert_eq!(listed[1].name.as_deref(), Some("Olivia's Laptop"));
        assert_eq!(listed[1].seen_at, NOW - 1000);
        assert_eq!(
            listed[2].name, None,
            "a machine with no name row was given one"
        );
        assert_eq!(listed[2].seen_at, NOW - 30 * DAY);
        assert_eq!(
            listed
                .iter()
                .map(|machine| machine.may_end_alone)
                .collect::<Vec<_>>(),
            vec![false, true, false],
            "this machine, or one that has not run this version, can be ended alone"
        );

        let theirs = machines(&second, &b, &there).await.expect("the other list");

        assert_eq!(theirs[0].id, "machine-there");
        assert!(theirs[0].is_this_machine);
        assert_eq!(theirs.len(), 3);
        assert!(
            !theirs.iter().any(|machine| machine.id == "machine-sami"),
            "another member's machine was listed"
        );

        // and what crosses is names and moments: the view carries nothing sealed.
        let crossed = serde_json::to_value(&listed[1]).expect("the view serialises");

        assert_eq!(
            crossed,
            json!({
                "id": "machine-there",
                "name": "Olivia's Laptop",
                "seenAt": NOW - 1000,
                "createdAt": NOW - 1000,
                "isThisMachine": false,
                "mayEndAlone": true,
            })
        );
    }

    /// **Criterion 10, the refusals.** Ending this machine is refused; so is ending a machine
    /// that has not run this version, and one not signed in as the reader. Nothing is written by
    /// any of them.
    #[tokio::test]
    async fn this_machine_an_old_one_and_somebody_elses_are_not_ended_alone() {
        let credentials = Memory::new();
        let directory = scratch("machines-refused");
        let (store, here) = created(&credentials, &directory).await;
        let a = sign_in(&store, &here, PASSWORD, &slot())
            .await
            .expect("this machine did not sign in");

        signed_in_on(&store, &here, &a, Some("Olivia's Desk"), NOW).await;
        store
            .machine_seen("machine-old", Some(&a.member_id), NOW - 30 * DAY)
            .await
            .expect("the old machine");

        let sami = a_member(&store, &a, &here, "member-sami", "sami.staff").await;

        signed_in_on(
            &store,
            &on("machine-sami", &here),
            &sami,
            Some("Sami's Laptop"),
            NOW,
        )
        .await;

        let own = end_machine(&store, &a, &here, &here.machine_id, NOW)
            .await
            .expect_err("this machine was ended from itself");

        assert_eq!(
            refused_for(&own),
            Some(RefusalReason::NotYourself),
            "{own:?}"
        );

        let old = end_machine(&store, &a, &here, "machine-old", NOW)
            .await
            .expect_err("a machine older than this version was ended alone");

        assert_eq!(
            refused_for(&old),
            Some(RefusalReason::MachineNotUpdated),
            "{old:?}"
        );
        assert!(
            old.to_string().contains("sign out all other machines"),
            "{old}"
        );

        let theirs = end_machine(&store, &a, &here, "machine-sami", NOW)
            .await
            .expect_err("another member's machine was ended");

        assert_eq!(
            refused_for(&theirs),
            Some(RefusalReason::MachineMissing),
            "{theirs:?}"
        );

        for machine in [here.machine_id.as_str(), "machine-old"] {
            assert_eq!(
                store
                    .machine_signed_out(machine, &a.member_id)
                    .await
                    .expect("the number"),
                0,
                "a refused act wrote a sign-out for {machine}"
            );
        }
        assert_eq!(
            store
                .machine_signed_out("machine-sami", "member-sami")
                .await
                .expect("the number"),
            0
        );
        assert_eq!(
            store
                .machine("machine-old")
                .await
                .expect("the row")
                .and_then(|machine| machine.member_id),
            Some(a.member_id.clone()),
            "a refused act took the member off the old machine"
        );
        assert_eq!(
            store
                .machine("machine-sami")
                .await
                .expect("the row")
                .and_then(|machine| machine.member_id),
            Some("member-sami".to_string())
        );
    }

    /// **Criterion 10, offline.** Ending a machine against a remote that answers nothing writes
    /// the sign-out on this replica, takes the machine off the list, and says it was not sent.
    #[tokio::test]
    async fn ending_a_machine_offline_says_it_was_not_sent() {
        let credentials = Memory::new();
        let directory = scratch("machines-offline");
        let (store, here) = created(&credentials, &directory).await;
        let there = on("machine-there", &here);
        let a = sign_in(&store, &here, PASSWORD, &slot())
            .await
            .expect("this machine did not sign in");

        signed_in_on(&store, &here, &a, Some("Olivia's Desk"), NOW).await;
        signed_in_on(&store, &there, &a, Some("Olivia's Laptop"), NOW).await;
        drop(store);

        // the same replica, reopened against a remote that answers nothing.
        let server =
            ScriptedServer::start((0..8).map(|_| ScriptedResponse::hangup()).collect()).await;
        let offline = OrganizationStore::open(
            crate::clock::System::shared(),
            &OrganizationStore::replica_path(&directory.join("app.db"), &here.id),
            Some(server.url("")),
            || async { Ok::<String, turso::Error>("a-credential".to_string()) },
        )
        .await
        .expect("the replica did not reopen against the remote");

        let sent = end_machine(&offline, &a, &here, "machine-there", NOW + 1)
            .await
            .expect("the machine was not ended");

        assert!(!sent, "a sign-out that reached nothing was reported sent");
        assert_eq!(
            offline
                .machine_signed_out("machine-there", &a.member_id)
                .await
                .expect("the number"),
            1
        );
        assert_eq!(
            machines(&offline, &a, &here)
                .await
                .expect("the list")
                .iter()
                .map(|machine| machine.id.clone())
                .collect::<Vec<_>>(),
            vec![here.machine_id.clone()],
            "the ended machine is still listed"
        );
    }

    /// **Criterion 10, a machine closed when it was ended.** Its resume is refused on the rows it
    /// already holds, before its key is spent: the key filed here opens nothing, and the answer is
    /// still the sign-out rather than a key that failed. Signed in again, the number is
    /// acknowledged, and the same resume goes through.
    #[tokio::test]
    async fn a_machine_closed_when_it_was_ended_is_refused_at_resume_before_its_key_is_spent() {
        let credentials = Memory::new();
        let directory = scratch("machines-resume");
        let (store, b) = created(&credentials, &directory).await;
        let a = on("machine-a", &b);
        let second = elsewhere(&directory, &b).await;
        let b_session = sign_in(&store, &b, PASSWORD, &slot())
            .await
            .expect("machine B did not sign in");
        let a_session = sign_in(&second, &a, PASSWORD, &slot())
            .await
            .expect("machine A did not sign in");
        let member_id = b_session.member_id.clone();
        let account = format!("{}:{member_id}", b.id);
        let filed = credentials
            .get(MEMBER_KEY_SERVICE, &account)
            .expect("the store would not answer")
            .expect("the first run filed nothing");

        signed_in_on(&store, &b, &b_session, Some("Olivia's Laptop"), NOW).await;
        signed_in_on(&second, &a, &a_session, Some("Olivia's Desk"), NOW).await;

        end_machine(&second, &a_session, &a, &b.machine_id, NOW + 1)
            .await
            .expect("machine A could not end machine B");

        assert!(
            signed_out_here(&store, &b, &member_id)
                .await
                .expect("the standing")
        );
        assert!(
            !signed_out_here(&second, &a, &member_id)
                .await
                .expect("the standing"),
            "the machine that ended B was ended too"
        );

        // a key that opens nothing, filed under B's entry: a check made after the key is spent
        // would answer that it failed to open.
        credentials
            .set(
                MEMBER_KEY_SERVICE,
                &account,
                &format!("0:{}", MemberKey::from_bytes([7; 32]).encode()),
            )
            .expect("the store would not take the value");

        let standing = resume(&credentials, &store, &b, &slot())
            .await
            .expect("the resume failed rather than answering the sign-out");

        assert!(
            matches!(standing, Resumption::SignedOutElsewhere),
            "{standing:?}"
        );
        assert_eq!(
            credentials
                .get(MEMBER_KEY_SERVICE, &account)
                .expect("the store would not answer"),
            None,
            "the entry outlived the sign-out"
        );

        // signed in again, the number is acknowledged on the record, and the next launch resumes.
        let acknowledged = HeldOrganization {
            machine_signed_out: sign_outs_acknowledged(&store, &b.machine_id, &member_id)
                .await
                .expect("the number"),
            ..b.clone()
        };

        assert_eq!(acknowledged.machine_signed_out, 1);

        credentials
            .set(MEMBER_KEY_SERVICE, &account, &filed)
            .expect("the store would not take the value");

        let resumed = resume(&credentials, &store, &acknowledged, &slot())
            .await
            .expect("the resume failed");

        assert!(
            matches!(resumed, Resumption::Opened(_)),
            "an acknowledged sign-out ended the machine again"
        );
    }

    /// **Criterion 10, every other machine.** Ending every other session clears the reader from
    /// every machine's row but this one, so the list stops showing what it ended; another
    /// member's machine keeps its row.
    #[tokio::test]
    async fn ending_every_other_session_clears_the_reader_from_every_other_machine() {
        let credentials = Memory::new();
        let directory = scratch("machines-all-others");
        let (store, here) = created(&credentials, &directory).await;
        let mut a = sign_in(&store, &here, PASSWORD, &slot())
            .await
            .expect("this machine did not sign in");

        signed_in_on(&store, &here, &a, Some("Olivia's Desk"), NOW).await;
        signed_in_on(
            &store,
            &on("machine-there", &here),
            &a,
            Some("Olivia's Laptop"),
            NOW,
        )
        .await;
        store
            .machine_seen("machine-old", Some(&a.member_id), NOW - 30 * DAY)
            .await
            .expect("the old machine");

        let sami = a_member(&store, &a, &here, "member-sami", "sami.staff").await;

        signed_in_on(
            &store,
            &on("machine-sami", &here),
            &sami,
            Some("Sami's Laptop"),
            NOW,
        )
        .await;

        let machine_id = here.machine_id.clone();

        end_elsewhere(&credentials, &store, &mut a, &machine_id, NOW + 1)
            .await
            .expect("ending every other session failed");

        assert_eq!(
            store
                .machines_of(&a.member_id)
                .await
                .expect("the machines")
                .iter()
                .map(|machine| machine.id.clone())
                .collect::<Vec<_>>(),
            vec![here.machine_id.clone()],
            "an ended machine still names the reader"
        );
        assert_eq!(
            store
                .machine("machine-sami")
                .await
                .expect("the row")
                .and_then(|machine| machine.member_id),
            Some("member-sami".to_string()),
            "another member's machine was cleared"
        );
    }

    /// **Criterion 11.** The name is sealed, so the stored bytes do not hold it; an unchanged
    /// name is not written again; a long one is held to sixty-four characters; and a machine
    /// whose system gives no name still writes its row, so it can be ended alone.
    #[tokio::test]
    async fn the_name_is_sealed_written_once_and_capped() {
        let credentials = Memory::new();
        let directory = scratch("machines-named");
        let (store, here) = created(&credentials, &directory).await;
        let a = sign_in(&store, &here, PASSWORD, &slot())
            .await
            .expect("this machine did not sign in");

        assert!(
            named(
                &store,
                &here,
                &a.content_key,
                Some("  Olivia's Laptop "),
                NOW
            )
            .await
            .expect("the name")
        );

        let first = name_row(&store, &here.machine_id).await;
        let sealed = first.name_sealed.clone().expect("a sealed name");

        assert!(
            !sealed
                .windows(b"Olivia".len())
                .any(|window| window == b"Olivia"),
            "the name is stored in the clear"
        );

        // the same name again writes nothing: the bytes and the moment are as they were.
        assert!(
            !named(
                &store,
                &here,
                &a.content_key,
                Some("Olivia's Laptop"),
                NOW + 1
            )
            .await
            .expect("the name")
        );
        assert_eq!(name_row(&store, &here.machine_id).await, first);

        // a long name is held to the cap on the way in.
        let long = "x".repeat(80);

        assert!(
            named(&store, &here, &a.content_key, Some(&long), NOW + 2)
                .await
                .expect("the name")
        );

        store
            .machine_seen(&here.machine_id, Some(&a.member_id), NOW)
            .await
            .expect("the row");

        let listed = machines(&store, &a, &here).await.expect("the list");

        assert_eq!(listed[0].name, Some("x".repeat(64)));

        // and a machine with no name from its system writes its row all the same.
        let quiet = on("machine-quiet", &here);

        assert!(
            named(&store, &quiet, &a.content_key, None, NOW)
                .await
                .expect("the name")
        );
        assert_eq!(name_row(&store, "machine-quiet").await.name_sealed, None);

        store
            .machine_seen("machine-quiet", Some(&a.member_id), NOW - 1)
            .await
            .expect("the row");

        let quiet_view = machines(&store, &a, &here)
            .await
            .expect("the list")
            .into_iter()
            .find(|machine| machine.id == "machine-quiet")
            .expect("the quiet machine");

        assert_eq!(quiet_view.name, None);
        assert!(quiet_view.may_end_alone);
    }

    /// One machine's name row, which the test above expects to stand.
    async fn name_row(
        store: &OrganizationStore,
        id: &str,
    ) -> crate::organization::store::MachineNameRecord {
        store
            .machine_names()
            .await
            .expect("the names")
            .into_iter()
            .find(|row| row.id == id)
            .expect("the name row")
    }
}
