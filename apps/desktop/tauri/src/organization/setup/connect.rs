//! an organization that already exists connected to from a fresh machine by its owner, with the
//! password alone and the consent they filed on it.

use std::{
    path::Path,
    sync::{Arc, Mutex},
};

use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD as BASE64URL};

use crate::{
    clock,
    credential::CredentialStore,
    diagnostics,
    error::{Error, RefusalReason},
    machine::RemoteSyncStore,
    persisted::Persisted,
    turso::{
        discovery::{self, McpEndpoint, TursoOrganization},
        platform::{AccessLevel, TursoPlatform},
    },
};

use super::{ORGANIZATION_CREDENTIAL_LIFETIME, Remote, held_organization_id, owner_key_from};
use crate::organization::{
    HeldOrganization,
    authority::VERIFYING_KEY_BYTES,
    invitation::connect::{self, OrganizationFacts},
    member::vault::{ContentKey, open_content, open_vault},
    session::{self, CredentialSlot, MemberSession, Upgrade, content_key_of, sign_in_by_username},
    store::{FORMAT_VERSION, OrganizationRecord, OrganizationStore, leave_no_replica},
    workspace,
};

/// What a machine is told when the account it consented over holds no organization to connect to.
const NOTHING_TO_CONNECT_TO: &str =
    "this turso account holds no organization to connect to. go back and make one";

/// What anybody but the owner is told, whichever of the two comparisons caught them.
pub const ONLY_THE_OWNER_CONNECTS: &str = "only the owner can connect a machine with the \
     turso account. ask them for a link, or for a new one if yours has lapsed";

/// The organization, as the sign-in refusal names it before any vault has opened.
///
/// **The name is sealed until somebody is in.** `organization.name_sealed` opens with the content
/// key and the content key opens with a password, so a machine refusing a wrong password has no
/// name to put in the sentence. It says the sentence the wall says, through the wall's own
/// [`session::refused_by_name`], with the only name this machine has for the organization at that
/// moment.
pub(super) const ORGANIZATION_THIS_ACCOUNT_HOLDS: &str =
    "the organization this turso account holds";

/// Connect this machine to the organization the consented group already holds, and sign the owner
/// in to it (effort 828, requirement 14).
///
/// **The order is what this function is**, and each step of it has to have passed before the next
/// one is possible at all.
///
/// The listing says which database the organization is, where it is, and which Turso account the
/// consent is over; the account is recorded at once, because it is a fact about the consent and
/// stays true whatever this run goes on to do. A full-access credential of the ordinary four-week
/// lifetime is minted for that database on the consent, which is the same rule every mint follows:
/// only the owner's machine mints, and this mints on the owner's own consent. The replica opens
/// under it and pulls.
///
/// **The registry is not read here, and it gates nothing** (requirement 15, as the human corrected
/// it on 2026-09-20). This way in used to be shut while a machine an owner or an administrator was
/// on had been seen inside the presence window, on the reading that such a machine could hand out a
/// link instead. The owner is handed no link, so what the gate did was leave the owner outside
/// their own organization with a sentence pointing at something nobody could give them. An account
/// is held on as many machines as its holder signs in on (requirement 20), and this is one of them.
///
/// **The trust anchor is the owner's password, and the database is never asked to vouch for
/// itself.** The member rows are read unverified, which is what
/// [`OrganizationStore::members_unverified`] exists for and its only use; the password is tried
/// against each vault until one opens carrying the username that was typed; and the secret that
/// vault yields re-derives the organization key, exactly as [`finish`](super::finish) derived it when the
/// organization was created. Its public half has to be the organization row's `verifying_key`, and
/// every member row has to verify against it. A manager's password opens a manager's vault and
/// derives something else, so it fails both, which is what makes this the owner's alone
/// by construction rather than by a role a row claims.
///
/// **An organization an earlier version made is upgraded here, by this password, first** (effort
/// 838, tickets 22 and 23). Pulled and found to be of format 1, or part way through an upgrade cut
/// short, it is upgraded or finished in place where the password opens the owner's vault and the
/// remote answers (`upgrade::with_the_owners_password`), and refused as waiting for its owner
/// where it opens anybody else's; everything below then reads it in this format.
///
/// **Nothing the unverified read yielded reaches the session.** Past the comparison, the sign-in
/// is the wall's own [`sign_in_by_username`] over the verified rows, so the member, the vault and
/// the grants a session is built from all came through the chain. It is a second derivation of the
/// same password, and what it buys is that a session is opened on the one path every other
/// sign-in takes.
///
/// **Then the grants are renewed, before anything is written down.** An organization whose every
/// machine has been gone for over four weeks has nothing but lapsed grants, and a session's own
/// credential comes from a grant, so an owner signed in without this would hold a dead credential
/// until something else renewed it. It runs on the authority this machine now holds, and a failure
/// leaves the machine holding nothing rather than holding a connection that reaches nothing.
///
/// The record and the registry row are [`connect::record`]'s, as they are for a link, and they go
/// in last for that reason: everything that can refuse has refused by then.
///
/// **A refusal after the pull leaves nothing behind.** The replica is on disk from the open
/// onwards, so a run that was refused would otherwise leave a machine that does not hold the
/// organization holding a copy of every sealed row it has, and the wrong-password refusal is the
/// one somebody would meet on purpose. Everything past the open runs as one fallible piece and
/// every way out of it goes through [`leave_no_replica`]; what the walk is told is exactly what it
/// was told before, since each arm returns the error it always returned.
#[allow(clippy::too_many_arguments)]
pub(crate) async fn connect_existing<P, F>(
    credentials: &dyn CredentialStore,
    upgrade: &dyn Upgrade,
    clock: &clock::Shared,
    store: &mut Persisted<RemoteSyncStore>,
    platform_token: &str,
    mcp: &McpEndpoint,
    platform_for: F,
    remote: Remote,
    database_path: &Path,
    username: &str,
    password: &str,
    now: i64,
) -> Result<(HeldOrganization, OrganizationStore, MemberSession), Error>
where
    P: TursoPlatform + Sync,
    F: Fn(TursoOrganization) -> P,
{
    // a machine holds one organization, so this is refused before the account is even asked what
    // it holds. The way to another is a disconnect.
    connect::refuse_while_held(store)?;

    let nothing_to_connect_to =
        || Error::refused(RefusalReason::NothingToConnectTo, NOTHING_TO_CONNECT_TO);
    let (organization, databases) = discovery::group_databases(platform_token, mcp)
        .await?
        .ok_or_else(nothing_to_connect_to)?;
    let database = databases
        .iter()
        .find(|database| held_organization_id(&database.name).is_some())
        .ok_or_else(nothing_to_connect_to)?;
    let organization_id = held_organization_id(&database.name)
        .ok_or_else(nothing_to_connect_to)?
        .to_string();

    // which account the consent is over, recorded now: it is what every Platform API path this
    // machine builds afterwards is made of, and it stays true whether or not this run connects.
    store.remember_consent_organization(organization.clone());
    store.commit()?;

    let platform = platform_for(organization);
    let credential: CredentialSlot = Arc::new(Mutex::new(Some(
        platform
            .mint_token(
                &database.name,
                ORGANIZATION_CREDENTIAL_LIFETIME,
                AccessLevel::FullAccess,
            )
            .await?,
    )));
    let remote_url = format!("libsql://{}", database.hostname);
    let slot = Arc::clone(&credential);
    let replica = OrganizationStore::open(
        clock.clone(),
        &OrganizationStore::replica_path(database_path, &organization_id),
        remote.url_for(&database.hostname),
        move || {
            let slot = Arc::clone(&slot);

            async move {
                slot.lock()
                    .ok()
                    .and_then(|slot| slot.clone())
                    .ok_or_else(|| turso::Error::Misuse("no credential is held".into()))
            }
        },
    )
    .await?;

    // **everything past the open is one fallible run, so one place takes the replica away again.**
    // A refusal here leaves a pulled copy of every sealed row on a machine that did not connect,
    // and the wrong-password refusal is the one somebody would meet on purpose. What the walk is
    // told is unchanged: each arm below returns exactly the error it returned before.
    let connected = async {
        if !replica.pull().await && replica.organization().await?.is_none() {
            return Err(Error::Network {
                message: "the organization could not be reached. the account is right; try again                           once the connection is back"
                    .to_string(),
            });
        }

        // an organization an earlier version made is upgraded here where the password is its
        // owner's, and refused as waiting for its owner where it is anybody else's; one of another
        // format is refused before its row is read or any credential renewed in it (effort 838,
        // requirement 11 as amended, ticket 22).
        upgrade.on_connect(
            &replica,
            remote,
            &platform,
            username,
            password,
            &credential,
            now,
            &|| session::refused_by_name(ORGANIZATION_THIS_ACCOUNT_HOLDS),
        )
        .await?;
        replica.refuse_another_format().await?;

        let row = replica
            .organization()
            .await?
            .filter(|row| row.id == organization_id)
            .ok_or_else(|| Error::Integrity {
                message: "the database this turso account holds carries no organization of ours"
                    .to_string(),
            })?;

        let (verifying_key, content_key) =
            the_owners_key(&replica, &row, username, password).await?;
        let name = opened_text(&content_key, "organization.name_sealed", &row.name_sealed)?;
        let verifying_key = BASE64URL.encode(verifying_key);
        let signing_in = HeldOrganization {
            id: organization_id.clone(),
            name: name.clone(),
            verifying_key: verifying_key.clone(),
            remote_url: remote_url.clone(),
            machine_id: String::new(),
            member_id: None,
            role: None,
            joined_at: now,
            format: Some(FORMAT_VERSION),
            // a record for the sign-in alone, with no machine yet: `connect::record` below draws
            // the machine and acknowledges for it.
            machine_signed_out: 0,
            turso_organization: None,
            workspace_id: None,
            name_signed: false,
        };
        let mut session =
            sign_in_by_username(
                credentials,
                &replica,
                &signing_in,
                username,
                password,
                &credential,
            )
            .await?;

        // every grant fresh, the owner's included, so the credential the session holds is one that
        // lives: nothing renewed while every machine was gone.
        workspace::renew_credentials(&replica, &mut session, &platform, &database.name).await?;

        let held = connect::record(
            &replica,
            store,
            OrganizationFacts {
                id: organization_id.clone(),
                name,
                verifying_key,
                remote_url: remote_url.clone(),
            },
            Some((&session.member_id, &session.role)),
            now,
        )
        .await?;

        // the session opened over `signing_in`, which had no machine yet; it is open on the one
        // the record just drew, under the number the record acknowledged, so a sign-out of this
        // machine alone reaches its acts as it reaches any other session's (effort 846,
        // requirement 10).
        session.machine_id = held.machine_id.clone();
        session.machine_signed_out = held.machine_signed_out;

        // the machine names itself as it signs in (effort 846, requirement 11), carried by the
        // push below with its row in the registry.
        session::machine_named(&replica, &held, &session.content_key, now).await;

        if !replica.push().await {
            diagnostics::warn("organization.connectedToExisting.notYetSent")
                .with("organization", held.id.as_str())
                .write();
        }

        Ok((held, session))
    }
    .await;

    let (held, session) = match connected {
        Ok(connected) => connected,
        Err(refusal) => {
            // the replica is let go of before its files are: on Windows a file this process still
            // has open cannot be deleted, which is the order `forget` keeps for the same reason.
            drop(replica);
            leave_no_replica(database_path, &organization_id);

            return Err(refusal);
        }
    };

    diagnostics::info("organization.connectedToExisting")
        .with("organization", held.id.as_str())
        .write();

    Ok((held, replica, session))
}

/// Find the vault `password` opens under `username`, and answer the organization key its secret
/// re-derives with the content key that vault holds.
///
/// **The comparison is the whole of what makes this the owner's.** The derived key's public half
/// is compared with the organization row's, and every member row is read again and verified
/// against the derived key; anybody whose vault derives something else fails both. The row's key
/// is the thing being judged and never the judge, which is the rule `authority/` states and the
/// one thing a way in built on a consent alone could have quietly broken.
async fn the_owners_key(
    replica: &OrganizationStore,
    row: &OrganizationRecord,
    username: &str,
    password: &str,
) -> Result<([u8; VERIFYING_KEY_BYTES], ContentKey), Error> {
    let refused = || session::refused_by_name(ORGANIZATION_THIS_ACCOUNT_HOLDS);
    let only_the_owner = || Error::refused(RefusalReason::OwnerOnly, ONLY_THE_OWNER_CONNECTS);
    let wanted = username.trim().to_lowercase();
    let members = replica.members_unverified().await?;
    let mut opened = None;

    // past any vault the password opens that is somebody else's, as the wall walks them: two
    // members who chose the same password each open under it, and the owner is not always the
    // one who opens first.
    for member in members.iter().filter(|member| member.removed_at.is_none()) {
        let Ok(secret) = open_vault(password, &member.vault) else {
            continue;
        };
        let content_key = content_key_of(&member.sealed_content_key, &secret)?;
        let carried = opened_text(
            &content_key,
            "member.username_sealed",
            &member.username_sealed,
        )?;

        if carried.trim().to_lowercase() == wanted {
            opened = Some((member, secret, content_key));
            break;
        }
    }

    let Some((member, secret, content_key)) = opened else {
        return Err(refused());
    };

    // a vault still sealed under the secret an invitation link carries opens for whoever decoded
    // that link and for nobody typing at a wall, which is the wall's own rule and is said here in
    // the wall's own sentence.
    if member.must_change_password {
        return Err(refused());
    }

    // the password alone, and no column read (requirement 22). A founder and an account that was
    // handed the organization both derive the key their own secret yields, because the acceptance
    // re-keyed the directory under the new owner's derivation; a founder who handed over derives
    // a key that matches nothing here and is refused as the manager they now are. **Nothing
    // about who the owner is comes off a row**, which is what a way back read out of the database
    // it judges would have meant.
    let verifying_key = owner_key_from(&secret)
        .map_err(|_| only_the_owner())?
        .verifying_key();

    if verifying_key != row.verifying_key {
        return Err(only_the_owner());
    }

    // and every row read again, through the chain, against the key that was just proved. A row
    // that does not check means the key is not the one these rows were written under, whatever
    // the organization row says.
    replica
        .members(&verifying_key)
        .await
        .map_err(|_| only_the_owner())?;

    Ok((verifying_key, content_key))
}

/// A sealed column, opened as text.
fn opened_text(key: &ContentKey, column: &str, sealed: &[u8]) -> Result<String, Error> {
    String::from_utf8(open_content(key, column, sealed)?).map_err(|_| Error::Integrity {
        message: format!("{column} did not open as text"),
    })
}

#[cfg(test)]
mod tests {
    use crate::credential::{CredentialStore, Memory};
    use crate::database::Database;
    use crate::error::{Error, RefusalReason};
    use crate::machine::{RemoteSync, RemoteSyncStore};
    use crate::organization::Shared;
    use crate::organization::act::{Acting, Pull, as_member};
    use crate::organization::authority::OrganizationKey;
    use crate::organization::invitation::link::JoinLink;
    use crate::organization::invitation::{
        AccountAndLink, Invitation, join, locator, make_account_and_link,
    };
    use crate::organization::member::vault::KdfParams;
    use crate::organization::role::permission;
    use crate::organization::session::{self, CredentialSlot, MemberSession, sign_in};
    use crate::organization::setup::{
        BASE64URL, CreateOrganization, ONLY_THE_OWNER_CONNECTS, ORGANIZATION_CREDENTIAL_LIFETIME,
        ORGANIZATION_KEY_PURPOSE, ORGANIZATION_THIS_ACCOUNT_HOLDS, OWNER_ROLE, Remote,
        connect_existing, create_organization, draw_these_ids_next,
    };
    use crate::organization::store::OrganizationStore;
    use crate::organization::workspace::WORKSPACE_CREDENTIAL_LIFETIME;
    use crate::persisted::Persisted;
    use crate::settings::Settings;
    use crate::sync::test::server::{ScriptedResponse, ScriptedServer};
    use crate::test::scratch;
    use crate::turso::consent::{TursoConsent, platform_token, store_platform_token};
    use crate::turso::discovery::McpEndpoint;
    use crate::turso::platform::{AccessLevel, InMemoryPlatform};
    use crate::update::Update;
    use base64::Engine as _;
    use serde_json::json;
    use std::sync::{Arc, Mutex};
    use tokio::sync::RwLock;

    const TOKEN: &str = "a-platform-token";

    const PASSWORD: &str = "a long enough password";

    fn test_cost() -> KdfParams {
        KdfParams {
            memory_kib: 1024,
            iterations: 2,
            lanes: 1,
        }
    }

    fn handshake() -> ScriptedResponse {
        ScriptedResponse::new(
            200,
            json!({ "jsonrpc": "2.0", "id": 1, "result": { "protocolVersion": "2025-06-18" } })
                .to_string(),
        )
    }

    fn listing(records: serde_json::Value) -> ScriptedResponse {
        ScriptedResponse::new(
            200,
            json!({
                "jsonrpc": "2.0",
                "id": 3,
                "result": { "content": [{ "type": "text", "text": records.to_string() }] }
            })
            .to_string(),
        )
    }

    /// The listing a group that already holds a database answers, so the slug is read and the
    /// Platform API creates the organization's database.
    fn populated_group() -> Vec<ScriptedResponse> {
        vec![
            handshake(),
            listing(json!([{
                "Name": "ledger",
                "hostname": "ledger-an-org.aws-eu-west-1.turso.io",
                "group": "rentable"
            }])),
        ]
    }

    fn store(directory: &std::path::Path) -> Persisted<RemoteSyncStore> {
        Persisted::<RemoteSyncStore>::load(directory.join("remote-sync.json")).expect("the store")
    }

    // -------------------------------------------------------------------------------------
    // Effort 828, requirement 14: the account connects to the organization the group holds.
    // -------------------------------------------------------------------------------------

    /// The id every fixture below creates its organization under, so a listing can name
    /// `org-<id>` as a literal and a replica can be found at a known path.
    const HELD_ID: &str = "7f3a";

    const HELD_DATABASE: &str = "org-7f3a";

    const HELD_HOSTNAME: &str = "org-7f3a-an-org.aws-eu-west-1.turso.io";

    /// The listing a group holding the organization answers: the database that was there before,
    /// and ours beside it with the address a replica of it opens at.
    fn holding_the_organization() -> Vec<ScriptedResponse> {
        vec![
            handshake(),
            listing(json!([
                {
                    "Name": "ledger",
                    "hostname": "ledger-an-org.aws-eu-west-1.turso.io",
                    "group": "rentable"
                },
                {
                    "Name": HELD_DATABASE,
                    "hostname": HELD_HOSTNAME,
                    "group": "rentable"
                }
            ])),
        ]
    }

    const FOUR_WEEKS_MS: i64 = 28 * 24 * 60 * 60 * 1000;

    const SIX_DAYS_MS: i64 = 6 * 24 * 60 * 60 * 1000;

    const ISSUED_AT: i64 = 1_757_000_000_000;

    const MANAGERS_PASSWORD: &str = "a password adam chose";

    fn slot() -> CredentialSlot {
        Arc::new(Mutex::new(None))
    }

    /// No platform authority in hand, which is what an invitation is issued with here.
    fn no_platform() -> Option<&'static InMemoryPlatform> {
        None
    }

    /// An organization on the account, created the ordinary way: the platform it lives on, its
    /// replica as the owner's machine left it, and that machine's own record.
    ///
    /// **A second machine opens the same replica file**, which is what `Remote::none()` makes
    /// possible: there is no remote to pull from here, so what a consent reaches is what this
    /// left on disk. It is the same read either way, which is the reason `invitation/join.rs` and
    /// `invitation/machine.rs` hand their own replicas in.
    async fn an_organization(
        credentials: &dyn CredentialStore,
        directory: &std::path::Path,
    ) -> (
        Arc<InMemoryPlatform>,
        OrganizationStore,
        Persisted<RemoteSyncStore>,
    ) {
        let mut owners_machine = store(directory);
        let mcp = ScriptedServer::start(populated_group()).await;
        let platform = Arc::new(InMemoryPlatform::new("an-org"));

        draw_these_ids_next(&[HELD_ID]);

        let (_, replica) = create_organization(
            credentials,
            &crate::clock::System::shared(),
            &mut owners_machine,
            TOKEN,
            &McpEndpoint::at(&mcp.url("")),
            |_| Arc::clone(&platform),
            Remote::none(),
            &directory.join("app.db"),
            CreateOrganization {
                name: "Acme Rentals",
                username: "olivia.owner",
                password: PASSWORD,
                group: None,
            },
            test_cost(),
            ISSUED_AT,
        )
        .await
        .expect("the first run failed");

        (platform, replica, owners_machine)
    }

    /// A machine that holds nothing, which is what a way in built on the consent starts from.
    fn fresh_machine(directory: &std::path::Path, name: &str) -> Persisted<RemoteSyncStore> {
        let machine = Persisted::<RemoteSyncStore>::load(directory.join(format!("{name}.json")))
            .expect("the store");

        assert!(machine.selected().is_none(), "the machine has prior state");

        machine
    }

    /// Every mint the platform was asked for after the first `already` of them.
    fn minted_since(
        platform: &InMemoryPlatform,
        already: usize,
    ) -> Vec<(String, String, AccessLevel)> {
        let mut minted = platform.minted();

        minted.split_off(already)
    }

    /// The owner's grant on the organization database, sealed, as it stands on the replica.
    async fn owners_grant(replica: &OrganizationStore, verifying_key: &[u8; 32]) -> Vec<u8> {
        replica
            .grants(verifying_key)
            .await
            .expect("the grants")
            .into_iter()
            .find(|grant| grant.workspace_id == HELD_ID)
            .expect("the owner holds a grant on the organization database")
            .sealed_credential
    }

    /// **Criterion 14, the first of its four cases.** The consent meets a group that already
    /// holds an organization, the owner types their username and password, and this machine ends
    /// up holding the organization with the owner signed in and every grant renewed.
    ///
    /// The name is the one sealed at creation, which nothing on this machine could have known
    /// before a vault opened; the key it pinned is the one the password re-derived rather than
    /// the one the row offered, and the two agree here because this is the owner.
    #[tokio::test]
    async fn the_owners_password_connects_this_machine_to_the_organization_the_group_holds() {
        let credentials = Memory::new();

        store_platform_token(&credentials, TOKEN)
            .expect("the test credential store would not take the token");

        let directory = scratch("connect-existing");
        let (platform, replica, owners_machine) = an_organization(&credentials, &directory).await;
        let held_before = owners_machine.selected().cloned().expect("the record");
        let owner = sign_in(&replica, &held_before, PASSWORD, &slot())
            .await
            .expect("the owner did not sign in");
        let grant_before = owners_grant(&replica, &owner.verifying_key).await;
        let mints_before = platform.minted().len();

        drop(replica);

        let mcp = ScriptedServer::start(holding_the_organization()).await;
        let mut machine = fresh_machine(&directory, "second-machine");
        let (held, replica, session) = connect_existing(
            &credentials,
            &crate::upgrade::Upgrader,
            &crate::clock::System::shared(),
            &mut machine,
            TOKEN,
            &McpEndpoint::at(&mcp.url("")),
            |_| Arc::clone(&platform),
            Remote::none(),
            &directory.join("app.db"),
            "olivia.owner",
            PASSWORD,
            ISSUED_AT + 1,
        )
        .await
        .expect("the owner could not connect to their own organization");

        // the machine holds it, under the name only an open vault could have read, at the address
        // the listing gave, and the record on disk says the same.
        assert_eq!(held.id, HELD_ID);
        assert_eq!(held.name, "Acme Rentals");
        assert_eq!(held.remote_url, format!("libsql://{HELD_HOSTNAME}"));
        assert_eq!(held.member_id.as_deref(), Some(session.member_id.as_str()));
        assert_eq!(held.role.as_deref(), Some(OWNER_ROLE));
        assert!(!held.machine_id.is_empty(), "the machine drew no id");
        assert_eq!(machine.selected(), Some(&held));

        // the owner is signed in, and what the machine pinned is what their password derived.
        assert_eq!(session.role, OWNER_ROLE);
        assert_eq!(
            held.verifying_key,
            BASE64URL.encode(
                OrganizationKey::from_bytes(
                    &session
                        .secret
                        .derive_seed(ORGANIZATION_KEY_PURPOSE)
                        .expect("the seed")
                )
                .verifying_key()
            )
        );

        // the machine is in the registry, named against the member who is on it.
        let registered = replica
            .connected_machines(&session.verifying_key, ISSUED_AT + 1)
            .await
            .expect("the registry");

        assert_eq!(registered.len(), 1);
        assert_eq!(registered[0].0.id, held.machine_id);
        assert_eq!(
            registered[0]
                .1
                .as_ref()
                .map(|member| member.role_id.as_str()),
            Some(OWNER_ROLE)
        );

        // **every grant is fresh.** Two mints since the consent: the full-access four-week
        // credential this connect minted for itself, and the renewal's, which re-sealed the
        // owner's grant to them. The in-memory platform's tokens carry no claims, so the lifetime
        // a grant is good for is what Turso was asked for, and both asked for four weeks.
        assert_eq!(
            minted_since(&platform, mints_before),
            vec![
                (
                    HELD_DATABASE.to_string(),
                    ORGANIZATION_CREDENTIAL_LIFETIME.to_string(),
                    AccessLevel::FullAccess
                ),
                (
                    HELD_DATABASE.to_string(),
                    WORKSPACE_CREDENTIAL_LIFETIME.to_string(),
                    AccessLevel::FullAccess
                ),
            ],
            "the connect minted its own credential and the renewal did not run"
        );
        assert_eq!(ORGANIZATION_CREDENTIAL_LIFETIME, "4w");
        assert_eq!(WORKSPACE_CREDENTIAL_LIFETIME, "4w");
        assert_ne!(
            owners_grant(&replica, &session.verifying_key).await,
            grant_before,
            "the owner's grant was not re-sealed"
        );
    }

    /// **The second case.** A manager's password opens a manager's vault, and the
    /// key that vault derives is not the organization's, so the connect is refused by name and
    /// the machine is left holding nothing.
    ///
    /// This is the whole of what makes the way in the owner's: nothing here reads a role off a
    /// row and believes it.
    #[tokio::test]
    async fn a_managers_password_is_refused_and_the_machine_holds_nothing() {
        let credentials = Memory::new();

        store_platform_token(&credentials, TOKEN)
            .expect("the test credential store would not take the token");

        let directory = scratch("connect-existing-manager");
        let (platform, replica, owners_machine) = an_organization(&credentials, &directory).await;
        let owner = sign_in(
            &replica,
            &owners_machine.selected().cloned().expect("the record"),
            PASSWORD,
            &slot(),
        )
        .await
        .expect("the owner did not sign in");
        let locator = locator(&replica, &owner)
            .await
            .expect("the organization's link");
        let invited = make_account_and_link(
            &replica,
            &owner,
            no_platform(),
            &locator,
            Invitation {
                username: "adam.admin",
                role: permission::MANAGER,
                workspaces: &[],
            },
            test_cost(),
            ISSUED_AT,
        )
        .await
        .expect("the invitation failed");
        let theirs = directory.join("adam");

        std::fs::create_dir_all(&theirs).expect("the manager's directory");

        let mut their_machine = fresh_machine(&theirs, "remote-sync");

        join::accept(
            &credentials,
            |_| async { Ok::<_, Error>(&replica) },
            &mut their_machine,
            &theirs.join("app.db"),
            &JoinLink::decode(&invited.join_link).expect("the invitation link"),
            &invited.code,
            MANAGERS_PASSWORD,
            test_cost(),
            ISSUED_AT + 1,
        )
        .await
        .expect("the manager could not open their link");

        drop(replica);

        // well past the window the register counts a machine as connected inside, which bears on
        // nothing here: the register gates no way in, and what refuses below is the key.
        let now = ISSUED_AT + 2 * FOUR_WEEKS_MS;
        let mcp = ScriptedServer::start(holding_the_organization()).await;
        let mut machine = fresh_machine(&directory, "second-machine");
        let refused = connect_existing(
            &credentials,
            &crate::upgrade::Upgrader,
            &crate::clock::System::shared(),
            &mut machine,
            TOKEN,
            &McpEndpoint::at(&mcp.url("")),
            |_| Arc::clone(&platform),
            Remote::none(),
            &directory.join("app.db"),
            "adam.admin",
            MANAGERS_PASSWORD,
            now,
        )
        .await
        .expect_err("a manager connected on the owner's account");

        assert!(
            matches!(refused, Error::Refused { reason: crate::error::RefusalReason::OwnerOnly, ref message } if message == ONLY_THE_OWNER_CONNECTS),
            "{refused:?}"
        );
        assert!(
            machine.selected().is_none(),
            "a refused connect left an organization on the machine"
        );
    }

    /// An organization that has been handed over, on a scratch directory of its own.
    ///
    /// The founder makes it, a manager opens their link on a machine of their own with a
    /// password they choose, and the two acts of requirement 22 run: the owner offers with their
    /// own password, and the offered account accepts on its own machine. What comes back is the
    /// account, the founder's session as it stood before the handover, and the platform, with the
    /// replica let go of so a connect can open one of its own.
    async fn handed_over(
        credentials: &dyn CredentialStore,
        directory: &std::path::Path,
    ) -> (Arc<InMemoryPlatform>, AccountAndLink, MemberSession) {
        let (platform, replica, owners_machine) = an_organization(credentials, directory).await;
        let held_before = owners_machine.selected().cloned().expect("the record");
        let owner = sign_in(&replica, &held_before, PASSWORD, &slot())
            .await
            .expect("the owner did not sign in");
        let locator = locator(&replica, &owner)
            .await
            .expect("the organization's link");
        let invited = make_account_and_link(
            &replica,
            &owner,
            no_platform(),
            &locator,
            Invitation {
                username: "adam.admin",
                role: permission::MANAGER,
                workspaces: &[],
            },
            test_cost(),
            ISSUED_AT,
        )
        .await
        .expect("the invitation failed");
        let theirs = directory.join("adam");

        std::fs::create_dir_all(&theirs).expect("the manager's directory");

        let mut their_machine = fresh_machine(&theirs, "remote-sync");
        let (_, mut their_session) = join::accept(
            credentials,
            |_| async { Ok::<_, Error>(&replica) },
            &mut their_machine,
            &theirs.join("app.db"),
            &JoinLink::decode(&invited.join_link).expect("the invitation link"),
            &invited.code,
            MANAGERS_PASSWORD,
            test_cost(),
            ISSUED_AT + 1,
        )
        .await
        .expect("the manager could not open their link");

        crate::organization::ownership::offer_ownership(
            &replica,
            &owner,
            &invited.member_id,
            PASSWORD,
            ISSUED_AT + 2,
        )
        .await
        .expect("the offer failed");
        crate::organization::ownership::accept_ownership(
            &replica,
            &mut their_session,
            &mut their_machine,
            MANAGERS_PASSWORD,
            ISSUED_AT + 3,
        )
        .await
        .expect("the acceptance failed");

        drop(replica);

        (platform, invited, owner)
    }

    /// **Criterion 22, the second half.** After a handover, the new owner connects a fresh machine
    /// with the Turso account and their own password alone.
    ///
    /// This is the same path as the first case above, with one thing changed: the account that
    /// types its password is the one that accepted the organization. Their own secret derives the
    /// key the directory is signed under now, because the acceptance re-keyed it under exactly
    /// that derivation, and **no column is read to decide it**, which is the whole of what
    /// requirement 22 was rewritten for.
    #[tokio::test]
    async fn the_new_owner_connects_a_fresh_machine_with_their_password_alone() {
        let credentials = Memory::new();

        store_platform_token(&credentials, TOKEN)
            .expect("the test credential store would not take the token");

        let directory = scratch("connect-existing-handed-over");
        let (platform, invited, owner) = handed_over(&credentials, &directory).await;

        // well past the window the register counts a machine as connected inside, which bears on
        // nothing here: the register gates no way in, and what lets the connect through is the key.
        let now = ISSUED_AT + 2 * FOUR_WEEKS_MS;
        let mcp = ScriptedServer::start(holding_the_organization()).await;
        let mut machine = fresh_machine(&directory, "third-machine");
        let (held, _, session) = connect_existing(
            &credentials,
            &crate::upgrade::Upgrader,
            &crate::clock::System::shared(),
            &mut machine,
            TOKEN,
            &McpEndpoint::at(&mcp.url("")),
            |_| Arc::clone(&platform),
            Remote::none(),
            &directory.join("app.db"),
            "adam.admin",
            MANAGERS_PASSWORD,
            now,
        )
        .await
        .expect("the new owner could not connect to the organization they were given");

        assert_eq!(held.id, HELD_ID);
        assert_eq!(held.name, "Acme Rentals");
        assert_eq!(held.role.as_deref(), Some(OWNER_ROLE));
        assert_eq!(session.role, OWNER_ROLE);
        assert_eq!(session.member_id, invited.member_id);

        // the key this machine pinned is the new owner's own derivation, and not the founder's:
        // the acceptance re-keyed the directory under it, so the rows this machine just pulled
        // verify against what its own password yields and against nothing else.
        assert_eq!(
            held.verifying_key,
            BASE64URL.encode(
                OrganizationKey::from_bytes(
                    &session
                        .secret
                        .derive_seed(ORGANIZATION_KEY_PURPOSE)
                        .expect("the seed")
                )
                .verifying_key()
            ),
            "the machine pinned a key the new owner's password does not derive"
        );
        assert_ne!(held.verifying_key, BASE64URL.encode(owner.verifying_key));
    }

    /// **Criterion 22, the founder afterwards.** Having handed the organization over, the founder
    /// is refused on this path as the manager they now are.
    ///
    /// **By construction rather than by a check.** Nothing here reads a role: the key the
    /// founder's password derives is simply not what the directory is signed under any more, so
    /// they fail the comparison exactly as any manager fails it. That is what closes review
    /// round one's second finding, where the founder went on connecting after a transfer because
    /// the key had not moved.
    #[tokio::test]
    async fn the_founder_is_refused_as_a_manager_after_handing_the_organization_over() {
        let credentials = Memory::new();

        store_platform_token(&credentials, TOKEN)
            .expect("the test credential store would not take the token");

        let directory = scratch("connect-existing-founder-after");
        let (platform, _, _) = handed_over(&credentials, &directory).await;

        let now = ISSUED_AT + 2 * FOUR_WEEKS_MS;
        let mcp = ScriptedServer::start(holding_the_organization()).await;
        let mut founders_machine = fresh_machine(&directory, "the-founders-next-machine");
        let refused = connect_existing(
            &credentials,
            &crate::upgrade::Upgrader,
            &crate::clock::System::shared(),
            &mut founders_machine,
            TOKEN,
            &McpEndpoint::at(&mcp.url("")),
            |_| Arc::clone(&platform),
            Remote::none(),
            &directory.join("app.db"),
            "olivia.owner",
            PASSWORD,
            now,
        )
        .await
        .expect_err("the founder connected after handing the organization over");

        assert!(
            matches!(refused, Error::Refused { reason: crate::error::RefusalReason::OwnerOnly, ref message } if message == ONLY_THE_OWNER_CONNECTS),
            "{refused:?}"
        );
        assert!(
            founders_machine.selected().is_none(),
            "a refused connect left an organization on the machine"
        );
    }

    /// **The third case, turned round on 2026-09-20.** A machine the owner is on, seen inside the
    /// presence window, stands in nobody's way: the consent connects this machine too and signs the
    /// owner in on it, and the machine that was already there keeps its session and its row.
    ///
    /// *This test used to assert the opposite.* The register shut this way in while an owner's or
    /// an administrator's machine had been seen inside the window, on the reading that such a
    /// machine could hand out a link instead. The owner is handed no link, so the owner meeting
    /// that refusal was pointed at something nobody could give them, which is what the human met in
    /// the closed build. An account is held on as many machines as its holder signs in on, and the
    /// register feeds the standing line on a card and gates nothing.
    #[tokio::test]
    async fn a_machine_seen_six_days_ago_leaves_the_way_in_open_and_keeps_its_own_session() {
        let credentials = Memory::new();

        store_platform_token(&credentials, TOKEN)
            .expect("the test credential store would not take the token");

        let directory = scratch("connect-existing-in-use");
        let (platform, replica, owners_machine) = an_organization(&credentials, &directory).await;
        let held = owners_machine.selected().cloned().expect("the record");
        let owner = sign_in(&replica, &held, PASSWORD, &slot())
            .await
            .expect("the owner did not sign in");
        let now = ISSUED_AT + 2 * FOUR_WEEKS_MS;

        // the owner's own machine, last heard from six days ago: inside the window, so it counts as
        // connected and the register says the owner is on it.
        session::machine_seen(&replica, &held, Some(&owner.member_id), now - SIX_DAYS_MS).await;

        drop(replica);

        let mcp = ScriptedServer::start(holding_the_organization()).await;
        let mut machine = fresh_machine(&directory, "second-machine");
        let (second, replica, session) = connect_existing(
            &credentials,
            &crate::upgrade::Upgrader,
            &crate::clock::System::shared(),
            &mut machine,
            TOKEN,
            &McpEndpoint::at(&mcp.url("")),
            |_| Arc::clone(&platform),
            Remote::none(),
            &directory.join("app.db"),
            "olivia.owner",
            PASSWORD,
            now,
        )
        .await
        .expect("the register shut the owner out of their own organization");

        assert_eq!(second.id, HELD_ID);
        assert_eq!(second.role.as_deref(), Some(OWNER_ROLE));
        assert_eq!(session.member_id, owner.member_id);
        assert_ne!(second.machine_id, held.machine_id);

        // both machines are in the register, each naming the owner: the one that was already there
        // and the one that just connected.
        let registered = replica
            .connected_machines(&session.verifying_key, now)
            .await
            .expect("the registry");
        let mut registered: Vec<_> = registered
            .iter()
            .map(|(machine, member)| {
                (
                    machine.id.as_str(),
                    member.as_ref().map(|member| member.id.as_str()),
                )
            })
            .collect();

        registered.sort_unstable();

        let mut expected = vec![
            (held.machine_id.as_str(), Some(owner.member_id.as_str())),
            (second.machine_id.as_str(), Some(owner.member_id.as_str())),
        ];

        expected.sort_unstable();

        assert_eq!(registered, expected);

        // and the first machine's session stands: signing in here ended nothing there, because the
        // epoch is what ends a session and no act moved it.
        assert!(
            !session::ended_elsewhere(&replica, &owner)
                .await
                .expect("the first machine's session could not be read"),
            "connecting a second machine ended the session on the first"
        );

        // the consent is kept, as it is on every connect that goes through.
        assert!(platform_token(&credentials).is_ok());
        assert!(machine.consent_organization().is_some());
    }

    /// **The fourth case.** A wrong password and a username nobody holds are one refusal, and it
    /// is the wall's own sentence: nothing here says which of the two it was, or whether the
    /// username is in the organization at all.
    ///
    /// **And the replica the run pulled is gone afterwards** (ticket 20, the review's eleventh
    /// finding). The refusal used to return with a full copy of every sealed row of the
    /// organization sitting in the data directory of a machine that does not hold it, and a wrong
    /// password is the refusal somebody would reach on purpose.
    ///
    /// *An organization per case, where there was one for both:* `Remote::none()` gives a consent
    /// nothing to read but the file the owner's own machine left, so the two are the same file
    /// here and the first case now takes it away.
    #[tokio::test]
    async fn a_wrong_username_or_password_meets_the_walls_one_sentence() {
        let credentials = Memory::new();

        for (machine_name, username, password) in [
            ("wrong-password", "olivia.owner", "not the owners password"),
            ("wrong-username", "nobody.here", PASSWORD),
        ] {
            store_platform_token(&credentials, TOKEN)
                .expect("the test credential store would not take the token");

            let directory = scratch(&format!("connect-existing-{machine_name}"));
            let (platform, replica, _) = an_organization(&credentials, &directory).await;

            drop(replica);

            let mcp = ScriptedServer::start(holding_the_organization()).await;
            let mut machine = fresh_machine(&directory, machine_name);
            let refused = connect_existing(
                &credentials,
                &crate::upgrade::Upgrader,
                &crate::clock::System::shared(),
                &mut machine,
                TOKEN,
                &McpEndpoint::at(&mcp.url("")),
                |_| Arc::clone(&platform),
                Remote::none(),
                &directory.join("app.db"),
                username,
                password,
                ISSUED_AT + 1,
            )
            .await
            .expect_err("a pair that opens nothing connected");

            assert_eq!(
                refused.to_string(),
                session::refused_by_name(ORGANIZATION_THIS_ACCOUNT_HOLDS).to_string(),
                "{machine_name}"
            );
            assert!(machine.selected().is_none(), "{machine_name}");
            assert!(
                !OrganizationStore::replica_path(&directory.join("app.db"), HELD_ID).exists(),
                "{machine_name} left the replica it pulled on disk"
            );

            // and the consent is untouched by either, so the person retypes where they are: this
            // is the refusal the walk has to tell from the one that gives the consent back, and
            // the authority is exactly where it was.
            assert!(platform_token(&credentials).is_ok(), "{machine_name}");
            assert!(
                machine.consent_organization().is_some(),
                "{machine_name} let the account the consent was over go"
            );
        }
    }

    /// The organization's state over one data directory, as the plugins' setups build it, with
    /// nothing open and nobody in. `remote-sync.json` is loaded from the directory, so a test
    /// writes the record it wants first. *`invitation/join.rs` keeps the same builder; a fixture is
    /// written out per module ([[rules/testing]]).*
    async fn state_over(directory: &std::path::Path) -> Shared {
        let mut settings =
            Persisted::<Settings>::load(directory.join(Settings::FILENAME)).expect("the settings");
        settings.database_path = directory.join(Database::FILENAME);
        settings.recovery_path = directory.join(Update::FILENAME);
        settings.commit().expect("the settings");

        let settings = Arc::new(RwLock::new(settings));
        let remote_sync = RemoteSync::new(
            settings.clone(),
            directory.join(RemoteSync::FILENAME),
            crate::clock::System::shared(),
        )
        .await
        .expect("the sync record");
        Update::new(settings.clone()).await.expect("the update");

        Shared {
            db: Arc::new(RwLock::new(Database::new(
                settings.clone(),
                crate::clock::System::shared(),
            ))),
            settings,
            remote_sync: Arc::new(RwLock::new(remote_sync)),
            upgrade: Arc::new(crate::upgrade::Upgrader),
            credentials: Arc::new(Memory::new()),
            consent: Arc::new(TursoConsent::new()),
            organization: Arc::new(RwLock::new(None)),
            member: Arc::new(RwLock::new(None)),
            arriving_link: Arc::new(Mutex::new(None)),
            signed_out_elsewhere: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            old_shape_check: tokio::sync::OnceCell::new(),
        }
    }

    /// **Effort 846, ticket 28: the session a connect on the account opens knows its machine.**
    /// The owner connects machine B to the organization their account holds; on machine A they
    /// sign B out by its row, and the pull brings it to B. With no heartbeat run, B's next
    /// organization act is refused as signed out from another machine and B is at the wall. A
    /// session opened with no machine id would read as never signed out alone, and act on.
    #[tokio::test]
    async fn an_owner_connected_on_the_account_is_refused_its_next_act_once_signed_out_alone() {
        let credentials = Memory::new();

        store_platform_token(&credentials, TOKEN)
            .expect("the test credential store would not take the token");

        let directory = scratch("connect-existing-ended-alone");
        let theirs = scratch("connect-existing-ended-alone-b");
        let (platform, replica, owners_machine) = an_organization(&credentials, &directory).await;
        let held_a = owners_machine.selected().cloned().expect("the record");

        drop(replica);

        let mcp = ScriptedServer::start(holding_the_organization()).await;
        let mut machine = Persisted::<RemoteSyncStore>::load(theirs.join(RemoteSync::FILENAME))
            .expect("the record");
        let (held_b, replica_b, session_b) = connect_existing(
            &credentials,
            &crate::upgrade::Upgrader,
            &crate::clock::System::shared(),
            &mut machine,
            TOKEN,
            &McpEndpoint::at(&mcp.url("")),
            |_| Arc::clone(&platform),
            Remote::none(),
            &directory.join("app.db"),
            "olivia.owner",
            PASSWORD,
            ISSUED_AT + 1,
        )
        .await
        .expect("the owner could not connect to their own organization");

        drop(machine);

        // B as a launch leaves it: its record on disk, its replica open and the owner signed in.
        let app_state = state_over(&theirs).await;

        *app_state.organization.write().await = Some(replica_b);
        *app_state.member.write().await = Some(session_b);

        // B on this version, named; A signed in as the same owner over the same replica.
        let machine_a = OrganizationStore::open(
            crate::clock::System::shared(),
            &OrganizationStore::replica_path(&directory.join("app.db"), HELD_ID),
            None,
            || async { Ok::<String, turso::Error>(String::new()) },
        )
        .await
        .expect("machine A's replica");

        machine_a
            .write_machine_name(&held_b.machine_id, None, ISSUED_AT + 1)
            .await
            .expect("the name row");

        let a = sign_in(&machine_a, &held_a, PASSWORD, &slot())
            .await
            .expect("machine A did not sign in");
        let act_on_b = async || {
            let held = held_b.clone();

            as_member(
                &app_state,
                Pull::First,
                async move |Acting { member, store }| session::machines(store, member, &held).await,
            )
            .await
        };

        act_on_b()
            .await
            .expect("B could not act before it was signed out");

        session::end_machine(&machine_a, &a, &held_a, &held_b.machine_id, ISSUED_AT + 2)
            .await
            .expect("A could not sign B out");

        // B pulls with its act, and no heartbeat has run.
        let refused = act_on_b()
            .await
            .expect_err("B acted after it was signed out on its own");

        assert!(
            matches!(
                refused,
                Error::Refused {
                    reason: RefusalReason::SessionsEnded,
                    ..
                }
            ),
            "{refused:?}"
        );
        assert!(
            app_state.member.read().await.is_none(),
            "B is not at the wall"
        );
        assert!(app_state.organization.read().await.is_none());
        assert!(
            app_state
                .signed_out_elsewhere
                .load(std::sync::atomic::Ordering::SeqCst),
            "the wall was not told which sign-out this was"
        );

        // and A acts as before.
        session::machines(&machine_a, &a, &held_a)
            .await
            .expect("A was refused with B");
    }
}
