//! every workspace the signed-in member may bring up, brought up in the background (effort 857,
//! ticket 40).
//!
//! **Why.** `0008` adds columns every read names, so a member with a read-only grant cannot read a
//! workspace still behind it, and cannot add them either: they wait for somebody with full access
//! to bring it up. Opening it was the only way that happened, so they waited on somebody choosing
//! that workspace on this build. Now a machine on this build whose member holds full access brings
//! up every workspace it may after its sign-in, its resume and each heartbeat, without anybody
//! opening it, and a reader waits only as long as it takes such a machine to come online.
//!
//! **What runs is what opening runs, under the same lease** (ticket 03): every step shipped before
//! 857 and every addition this build knows, never an upgrade declared after 857, which waits for
//! the explicit act. The lease is taken at the organization's primary; the workspace is copied
//! before its first statement, as effort 838 requires, and the steps, the check against a fresh
//! database and the version row commit in one transaction or not at all (`apply.rs`).
//!
//! **Never where this machine may not write.** A member whose role is unsettled, an organization
//! this build holds read-only or past reading, an upgrade of the organization another member is
//! running (ticket 19), a workspace this build may not write, and a grant that is read-only: each
//! is left as it is, and nothing is sent. The organization is asked again before anything is
//! recorded, since it can change while a workspace is brought up.
//!
//! **One at a time.** Every bring-up on this machine passes one gate, `Shared::bringing_up`:
//! opening a workspace waits for it, and a beat that finds it taken leaves at once, so two never
//! run together. The gate is taken before the session and the replica, by both, so neither waits
//! on the other while holding them.
//!
//! **The open workspace is not slowed.** Nothing here touches the workspace engine, and the
//! interface opens nothing: a workspace is reached over its pipeline with the credential the
//! vault unsealed. The session and the replica are held only to read what is due, and to record
//! what was done, never across the copy or the steps.
//!
//! **A beat with nothing behind is cheap.** What is due is read from this machine's replica, so a
//! beat that finds nothing sends nothing and takes no lease.
//!
//! **A failure is logged and tried again on a later beat.** The workspace is left as the
//! transaction left it, the lease is let go of, and the workspace waits [`RETRY_AFTER_MS`] before
//! a beat takes it again, so a beat after every save does not copy it again each time.

use std::{collections::HashMap, path::PathBuf};

use crate::{
    clock,
    database::floor::Standing,
    diagnostics,
    error::{Error, RefusalReason},
    turso::platform::{AccessLevel, TursoPlatform},
};

use super::{
    LeaseAuthority, LeaseOutcome, MIGRATION_LEASE_LIFETIME_MS, PipelineLease, apply, copied,
    is_pending_over, level_of, logged, recorded_after, refuse_newer,
};
use crate::organization::{
    Shared,
    act::{self, Acting, Pull, if_member},
    session::{self, WorkspaceCredential, WorkspaceFacts},
    store, upgrade,
    workspace::{self, remote::Pipeline},
};

/// How long a workspace whose bring-up failed waits before a beat takes it again: the heartbeat's
/// own interval, so a beat after every save does not copy it each time.
pub const RETRY_AFTER_MS: i64 = 5 * 60 * 1_000;

/// What this machine's bring-ups keep between beats, behind the one gate they all pass: when each
/// workspace last failed.
#[derive(Debug, Default)]
pub struct Tried {
    failed_at: HashMap<String, i64>,
}

impl Tried {
    /// Whether a beat at `now` takes `workspace_id`: it has not failed, or it failed long enough
    /// ago.
    fn due(&self, workspace_id: &str, now: i64) -> bool {
        self.failed_at
            .get(workspace_id)
            .is_none_or(|at| now >= at + RETRY_AFTER_MS)
    }
}

/// What a beat did.
#[derive(Debug)]
pub enum Beat {
    /// another bring-up holds the gate, and this beat left it be.
    Busy,
    /// what each workspace taken answered, in the order taken; none where nothing was behind.
    Ran(Vec<(String, Result<(), Error>)>),
}

/// One workspace due, with what bringing it up needs once the session and the replica are let go
/// of.
struct Due {
    organization_id: String,
    member_id: String,
    /// the application's data directory, where the copy is written.
    directory: PathBuf,
    /// where the organization's primary takes statements, which the lease is taken at.
    organization_host: String,
    /// what the lease is taken under; `None` where this machine holds none.
    organization_credential: Option<String>,
    facts: WorkspaceFacts,
    held: WorkspaceCredential,
    /// the level the organization records for it.
    level: u32,
}

/// Bring up, in the background, every workspace the signed-in member may: what a sign-in, a resume
/// and the heartbeat call once they have their answer. Returns at once.
pub(crate) fn in_the_background(app: &tauri::AppHandle) {
    use tauri::Manager;

    let app = app.clone();

    tauri::async_runtime::spawn(async move {
        let app_state = app.state::<Shared>();
        let clock = app.state::<clock::Shared>();

        here(app_state.inner(), clock.inner()).await;
    });
}

/// [`brought_up`] as production runs it: the lease at the organization's primary, each workspace
/// over its own pipeline, and the owner's account where this machine holds it, which the copy is
/// made on as well.
async fn here(app_state: &Shared, clock: &clock::Shared) {
    let Some(organization_id) = app_state
        .member
        .read()
        .await
        .as_ref()
        .map(|member| member.organization_id.clone())
    else {
        return;
    };
    // a keyring read and no request, which every read of the state pays for each organization.
    let account = act::owner_platform(app_state, &app_state.credentials, &organization_id).await;

    brought_up(
        app_state,
        &apply::SHIPPED,
        |host, credential| {
            credential.map(|credential| PipelineLease::new(Pipeline::of(host), credential))
        },
        Pipeline::of,
        account.as_ref(),
        || clock.now(),
    )
    .await;
}

/// Bring up every workspace due, one after another, through the gate: each the signed-in member
/// holds with full access, which this build may write, and which is behind a step opening runs.
///
/// `lease_of` is the lease authority at the organization's host under its credential, `pipeline_of`
/// where a workspace's hostname takes statements, and `account` the owner's account where this
/// machine holds it, which each workspace is copied on as well.
pub(crate) async fn brought_up<L, P>(
    app_state: &Shared,
    migrations: &apply::Migrations,
    lease_of: impl Fn(&str, Option<&str>) -> Option<L>,
    pipeline_of: impl Fn(&str) -> Pipeline,
    account: Option<&P>,
    now: impl Fn() -> i64,
) -> Beat
where
    L: LeaseAuthority,
    P: TursoPlatform,
{
    let Ok(mut tried) = app_state.bringing_up.try_lock() else {
        return Beat::Busy;
    };
    let mut ran: Vec<(String, Result<(), Error>)> = Vec::new();

    while let Some(due) = next_due(app_state, migrations, &tried, &ran, now()).await {
        let id = due.facts.id.clone();
        let answered = match lease_of(
            &due.organization_host,
            due.organization_credential.as_deref(),
        ) {
            Some(lease) => {
                one(
                    app_state,
                    migrations,
                    &due,
                    &lease,
                    &pipeline_of(&due.facts.database_hostname),
                    account,
                    &now,
                )
                .await
            }
            None => Err(Error::refused(
                RefusalReason::NoOrganizationCredential,
                "this machine holds no credential to the organization database, so it cannot take \
                 the lease to bring the workspace up",
            )),
        };

        match &answered {
            Ok(()) => {
                tried.failed_at.remove(&id);

                diagnostics::info("organization.migration.broughtUpBehind")
                    .with("workspace", id.as_str())
                    .write();
            }
            Err(refusal) => {
                tried.failed_at.insert(id.clone(), now());

                diagnostics::warn("organization.migration.notBroughtUpBehind")
                    .with("workspace", id.as_str())
                    .with("reason", refusal.to_string())
                    .write();
            }
        }

        ran.push((id, answered));
    }

    Beat::Ran(ran)
}

/// The next workspace due at `now`, read under the session and the replica and let go of: none
/// where the member may not write the organization, or another member is upgrading it, and never
/// one this beat has already taken, or one whose last failure is too recent.
async fn next_due(
    app_state: &Shared,
    migrations: &apply::Migrations,
    tried: &Tried,
    ran: &[(String, Result<(), Error>)],
    now: i64,
) -> Option<Due> {
    let answered = if_member(app_state, Pull::No, async |Acting { member, store }| {
        if member.settled().is_err() || !session::writes_to(store) {
            return Ok(None);
        }

        if upgrade::under_way_elsewhere(store, Some(&member.member_id), store.clock().now())
            .await?
            .is_some()
        {
            return Ok(None);
        }

        let workspaces = store.workspaces(&member.verifying_key).await?;

        for workspace in &workspaces {
            if ran.iter().any(|(id, _)| *id == workspace.id) || !tried.due(&workspace.id, now) {
                continue;
            }

            let Ok(Some((facts, held))) =
                workspace::openable(member, &workspaces, &[], &workspace.id)
            else {
                continue;
            };

            if held.access != AccessLevel::FullAccess
                || !matches!(refuse_newer(store, &facts).await, Ok(Standing::Writable))
                || !is_pending_over(migrations, store, &facts).await?
            {
                continue;
            }

            let level = level_of(store, &facts.id, facts.schema_version).await?;
            let organization_host = app_state
                .remote_sync
                .write()
                .await
                .store_mut()
                .held(&member.organization_id)
                .map(|held| held.remote_url.trim_start_matches("libsql://").to_string())
                .unwrap_or_default();
            let organization_credential = member
                .organization_credential
                .lock()
                .ok()
                .and_then(|slot| slot.clone());

            return Ok(Some(Due {
                organization_id: member.organization_id.clone(),
                member_id: member.member_id.clone(),
                directory: store.directory().to_path_buf(),
                organization_host,
                organization_credential,
                facts,
                held,
                level,
            }));
        }

        Ok::<Option<Due>, Error>(None)
    })
    .await;

    match answered {
        Some(Ok(due)) => due,
        Some(Err(refusal)) => {
            diagnostics::warn("organization.migration.behindUnread")
                .with("reason", refusal.to_string())
                .write();

            None
        }
        None => None,
    }
}

/// Bring `due` up under the lease: taken, or left to whoever holds it; the copy, the steps and
/// the record; and the lease this run took let go of whatever happened.
async fn one<L: LeaseAuthority, P: TursoPlatform>(
    app_state: &Shared,
    migrations: &apply::Migrations,
    due: &Due,
    lease: &L,
    pipeline: &Pipeline,
    account: Option<&P>,
    now: &impl Fn() -> i64,
) -> Result<(), Error> {
    let taken_at = now();
    let until = match lease
        .take(
            &due.facts.id,
            &due.member_id,
            taken_at + MIGRATION_LEASE_LIFETIME_MS,
            taken_at,
        )
        .await?
    {
        LeaseOutcome::Held { until } => until,
        // somebody else is bringing it up: it is theirs, and a later beat finds it done.
        LeaseOutcome::HeldBy {
            holder_member_id,
            until,
        } => return Err(upgrade::under_way(&holder_member_id, until)),
    };

    let ran = run(app_state, migrations, due, pipeline, account, taken_at, now).await;

    // the take this run made, and never a later one of the same member's on another machine.
    if let Err(error) = lease
        .release_taken(&due.facts.id, &due.member_id, until)
        .await
    {
        diagnostics::warn("organization.migration.releaseFailed")
            .with("workspace", due.facts.id.as_str())
            .with("error", error.to_string().as_str())
            .write();
    }

    ran
}

/// The copy, the steps and the record, with the lease held.
///
/// **The record is written as an act writes**: under the session and the replica, asked again
/// whether the same member is in and whether this build may write the organization now. Where it
/// may not, the workspace stays brought up and unrecorded, which the next member to reach it finds
/// at its version and records ([`apply::bring_up`] runs nothing then).
async fn run<P: TursoPlatform>(
    app_state: &Shared,
    migrations: &apply::Migrations,
    due: &Due,
    pipeline: &Pipeline,
    account: Option<&P>,
    taken_at: i64,
    now: &impl Fn() -> i64,
) -> Result<(), Error> {
    let label = format!("schema-{}-to-{}", due.level, migrations.steps.known());

    copied(
        &due.directory,
        pipeline,
        &due.held.token,
        &due.facts.database_name,
        &label,
        taken_at,
        account,
    )
    .await?;

    let brought = apply::bring_up(
        pipeline,
        &due.held.token,
        migrations,
        due.facts.schema_version as usize,
        taken_at,
    )
    .await?;

    logged(&due.facts.id, due.level, &brought);

    let settled = i64::from(migrations.steps.settled());

    if_member(app_state, Pull::No, async |Acting { member, store }| {
        if member.organization_id != due.organization_id || member.member_id != due.member_id {
            return Err(Error::refused(
                RefusalReason::SignedOut,
                "the member who brought the workspace up is no longer signed in here, so it is \
                 recorded by the next member to reach it",
            ));
        }

        if !session::writes_to(store) {
            return Err(store::read_only_by_version());
        }

        if let Some(lease) =
            upgrade::under_way_elsewhere(store, Some(&member.member_id), store.clock().now())
                .await?
        {
            return Err(upgrade::under_way(
                &lease.holder_member_id,
                lease.expires_at,
            ));
        }

        recorded_after(
            store,
            &due.facts.id,
            due.facts.schema_version,
            settled,
            &brought,
            now,
        )
        .await
        .map(|_| ())
    })
    .await
    .unwrap_or_else(|| {
        Err(Error::refused(
            RefusalReason::SignedOut,
            "nobody is signed in to record the workspace brought up, so it is recorded by the next \
             member to reach it",
        ))
    })
}

#[cfg(test)]
mod tests {
    use std::{
        collections::HashMap,
        sync::{Arc, Mutex},
    };

    use serde_json::json;
    use tokio::sync::RwLock;

    use super::{Beat, RETRY_AFTER_MS, brought_up};
    use crate::{
        backup,
        credential::{Credentials, Memory},
        database::{Database, floor::Standing},
        error::{Error, RefusalReason},
        machine::{RemoteSync, RemoteSyncStore},
        organization::{
            HeldOrganization, Shared,
            invitation::{
                AccountAndLink, Invitation, WorkspaceGrant, locator, make_account_and_link,
            },
            lease::{
                LeaseAuthority, LeaseOutcome, MigrationPhase, Pending, StoreLease, apply, upgrade,
            },
            member::vault::KdfParams,
            role::permission,
            session::{
                CredentialSlot, MemberSession, WorkspaceCredential, WorkspaceFacts, sign_in,
            },
            setup::{CreateOrganization, Remote, create_organization},
            store::{FORMAT_VERSION, OrganizationStore},
            upgrade::ORGANIZATION_LEASE,
            workspace::{create_workspace, openable, remote::Pipeline},
        },
        persisted::Persisted,
        settings::Settings,
        sync::test::{
            pipeline::LocalPipeline,
            server::{ScriptedResponse, ScriptedServer},
        },
        test::scratch,
        turso::{
            consent::TursoConsent,
            discovery::McpEndpoint,
            platform::{AccessLevel, InMemoryPlatform},
        },
        update::Update,
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

    fn slot() -> CredentialSlot {
        Arc::new(Mutex::new(None))
    }

    /// The lease as a test sees it: every take and every release in the order made, and, where
    /// `held_by` names somebody, every take answered as theirs.
    #[derive(Clone, Default)]
    struct Ledger {
        held_by: Option<String>,
        made: Arc<Mutex<Vec<String>>>,
    }

    impl Ledger {
        fn made(&self) -> Vec<String> {
            self.made.lock().expect("the ledger").clone()
        }

        fn note(&self, line: String) {
            self.made.lock().expect("the ledger").push(line);
        }
    }

    impl LeaseAuthority for Ledger {
        async fn take(
            &self,
            workspace_id: &str,
            _holder: &str,
            until: i64,
            _now: i64,
        ) -> Result<LeaseOutcome, Error> {
            self.note(format!("take {workspace_id}"));

            Ok(match &self.held_by {
                Some(other) => LeaseOutcome::HeldBy {
                    holder_member_id: other.clone(),
                    until,
                },
                None => LeaseOutcome::Held { until },
            })
        }

        async fn release(&self, workspace_id: &str, _holder: &str) -> Result<(), Error> {
            self.note(format!("release {workspace_id}"));

            Ok(())
        }

        async fn release_taken(
            &self,
            workspace_id: &str,
            _holder: &str,
            _until: i64,
        ) -> Result<(), Error> {
            self.note(format!("release {workspace_id}"));

            Ok(())
        }
    }

    /// The organization's state over one data directory, as the plugins' setups build it, with
    /// nothing open and nobody in. *Written out per module, as [[rules/testing]] asks.*
    async fn state_over(credentials: &Credentials, directory: &std::path::Path) -> Shared {
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
        Update::new(settings.clone(), &crate::clock::System)
            .await
            .expect("the update");

        Shared {
            db: Arc::new(RwLock::new(Database::new(
                settings.clone(),
                crate::clock::System::shared(),
            ))),
            settings,
            remote_sync: Arc::new(RwLock::new(remote_sync)),
            upgrade: Arc::new(crate::upgrade::Upgrader),
            credentials: Arc::clone(credentials),
            consent: Arc::new(TursoConsent::new()),
            organization: Arc::new(RwLock::new(None)),
            member: Arc::new(RwLock::new(None)),
            arriving_link: Arc::new(Mutex::new(None)),
            signed_out_elsewhere: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            held_by_version: Arc::new(std::sync::Mutex::new(None)),
            old_shape_check: tokio::sync::OnceCell::new(),
            bringing_up: Default::default(),
        }
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
            machine_id: "machine-two".to_string(),
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

    /// The password an invitation's vault was sealed under: the link's own secret and the code.
    fn secret_of(invited: &AccountAndLink) -> String {
        crate::organization::invitation::vault_password_of(
            &invited.join_link,
            &invited.code,
            test_cost(),
        )
    }

    /// One machine with the owner signed in, and a workspace per name, each at 7 as 0.20 leaves
    /// it, with a tenant, behind a database of its own; and a member on another machine holding a
    /// read-only grant on the first.
    struct Machine {
        app_state: Shared,
        directory: std::path::PathBuf,
        /// each workspace's id, in the order named.
        ids: Vec<String>,
        /// each workspace's database, by id.
        databases: HashMap<String, LocalPipeline>,
        /// each workspace's database address, by its hostname.
        hosts: HashMap<String, String>,
        reader: MemberSession,
    }

    impl Machine {
        async fn with(name: &str, workspaces: &[&str]) -> Self {
            let credentials: Credentials = Arc::new(Memory::new());
            let directory = scratch(name);
            let app_state = state_over(&credentials, &directory).await;
            let mut record = Persisted::<RemoteSyncStore>::load(directory.join("remote-sync.json"))
                .expect("the record");
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
                credentials.as_ref(),
                &crate::clock::System::shared(),
                &mut record,
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
            let joined = record.selected().cloned().expect("the record");
            let mut owner = sign_in(&store, &joined, OWNER_PASSWORD, &slot())
                .await
                .expect("the owner did not sign in");
            let born = LocalPipeline::start().await;
            let mut ids = Vec::new();
            let mut databases = HashMap::new();
            let mut hosts = HashMap::new();

            for name in workspaces {
                let workspace = create_workspace(
                    &store,
                    &mut owner,
                    &platform,
                    |_| Pipeline::at(&born.url("")),
                    name,
                    AT,
                )
                .await
                .expect("the workspace");
                let database = LocalPipeline::start().await;

                // the workspace as 0.20 leaves it: at 7 with a tenant, and the organization's
                // record of it at 7 with no floor record.
                apply::apply(&Pipeline::at(&database.url("")), "t", 7)
                    .await
                    .expect("the workspace at 7");
                database
                    .holding(&[
                        "INSERT INTO `tenant` (`id`, `national_id`, `name`, `phone`) \
                         VALUES ('t-1', '1000', 'Sami', '0500')"
                            .to_string(),
                    ])
                    .await;
                store
                    .record_schema_version(&workspace.id, 7, AT)
                    .await
                    .expect("the version 0.20 records");
                store
                    .connection()
                    .execute(
                        "DELETE FROM \"workspace_floor\" WHERE \"workspace_id\" = ?",
                        vec![turso::Value::Text(workspace.id.clone())],
                    )
                    .await
                    .expect("the record a build before 857 leaves");

                hosts.insert(workspace.database_hostname.clone(), database.url(""));
                databases.insert(workspace.id.clone(), database);
                ids.push(workspace.id);
            }

            let link = locator(&store, &owner).await.expect("the link");
            let invited = make_account_and_link(
                &store,
                &owner,
                None::<&InMemoryPlatform>,
                &link,
                Invitation {
                    username: "sami.staff",
                    role: permission::MEMBER,
                    workspaces: &[WorkspaceGrant {
                        id: ids[0].clone(),
                        access: AccessLevel::FullAccess,
                    }],
                },
                test_cost(),
                AT,
            )
            .await
            .expect("the member");
            let mut reader = sign_in(
                &store,
                &joined_as(&owner, &invited.member_id, permission::MEMBER),
                &secret_of(&invited),
                &slot(),
            )
            .await
            .expect("the member did not sign in");

            reader.must_change_password = false;
            reader
                .workspace_credentials
                .get_mut(&ids[0])
                .expect("a grant")
                .access = AccessLevel::ReadOnly;

            *app_state.organization.write().await = Some(store);
            *app_state.member.write().await = Some(owner);

            Self {
                app_state,
                directory,
                ids,
                databases,
                hosts,
                reader,
            }
        }

        /// The owner's grant on the workspace `at` made read-only.
        async fn reading_only(&self, at: usize) {
            self.app_state
                .member
                .write()
                .await
                .as_mut()
                .expect("the owner")
                .workspace_credentials
                .get_mut(&self.ids[at])
                .expect("a grant")
                .access = AccessLevel::ReadOnly;
        }

        /// A beat at `now`, over `lease`, on the shipped ladder.
        async fn beat(&self, lease: &Ledger, now: i64) -> Beat {
            brought_up(
                &self.app_state,
                &apply::SHIPPED,
                |_, _| Some(lease.clone()),
                |host| Pipeline::at(&self.hosts[host]),
                None::<&InMemoryPlatform>,
                || now,
            )
            .await
        }

        fn database(&self, at: usize) -> &LocalPipeline {
            &self.databases[&self.ids[at]]
        }

        /// The version the workspace `at` keeps itself.
        async fn version(&self, at: usize) -> i64 {
            let mut connection = self.database(at).connection().await;

            sqlx::query_scalar("SELECT version FROM schema_version")
                .fetch_one(&mut connection)
                .await
                .expect("the version")
        }

        /// How many requests each workspace's database has received.
        fn requests(&self) -> Vec<usize> {
            self.ids
                .iter()
                .map(|id| self.databases[id].request_count())
                .collect()
        }

        /// The workspace `at` as the owner's session opens it.
        async fn facts(&self, at: usize) -> (WorkspaceFacts, WorkspaceCredential) {
            let member = self.app_state.member.read().await;
            let member = member.as_ref().expect("the owner");
            let organization = self.app_state.organization.read().await;
            let store = organization.as_ref().expect("the replica");
            let workspaces = store
                .workspaces(&member.verifying_key)
                .await
                .expect("the workspaces");

            openable(member, &workspaces, &[], &self.ids[at])
                .expect("openable")
                .expect("a grant")
        }

        /// The level the organization records for the workspace `at`, from its floor record.
        async fn recorded_level(&self, at: usize) -> Option<u32> {
            let organization = self.app_state.organization.read().await;
            let store = organization.as_ref().expect("the replica");

            store
                .workspace_floor(&self.ids[at])
                .await
                .expect("the floor")
                .map(|floors| floors.level)
        }
    }

    /// The replica a read guard holds.
    fn store_of<'a>(
        organization: &'a tokio::sync::RwLockReadGuard<'_, Option<OrganizationStore>>,
    ) -> &'a OrganizationStore {
        organization.as_ref().expect("the replica")
    }

    /// What each workspace taken answered, by id, or a panic where the beat was busy.
    fn answers(beat: Beat) -> Vec<(String, Result<(), Error>)> {
        match beat {
            Beat::Ran(ran) => ran,
            Beat::Busy => panic!("the beat found another bring-up under way"),
        }
    }

    fn all_brought(beat: Beat) -> bool {
        let ran = answers(beat);

        !ran.is_empty() && ran.iter().all(|(_, answered)| answered.is_ok())
    }

    fn known() -> i64 {
        i64::from(apply::SHIPPED.steps.known())
    }

    /// **Ticket 40's first criterion** (effort 857, requirements 1 and 7). After a beat, each
    /// workspace the member holds with full access and which is behind steps opening runs is
    /// brought up to this build, one after the other, each under the lease taken and let go of
    /// before the next is taken, and copied before its first statement; the organization records
    /// the level each reached. A workspace held read-only is left as it is and sent nothing, and
    /// nothing is opened on this machine. A second beat finds nothing behind and sends nothing.
    #[tokio::test]
    async fn every_workspace_held_with_full_access_and_behind_is_brought_up_one_at_a_time() {
        let machine = Machine::with("behind-every", &["North", "South", "East"]).await;
        let lease = Ledger::default();

        machine.reading_only(2).await;

        let east_before = machine.database(2).request_count();
        let ran = answers(machine.beat(&lease, AT + 1).await);
        let taken: Vec<String> = ran.iter().map(|(id, _)| id.clone()).collect();
        let mut both = taken.clone();
        let mut expected = vec![machine.ids[0].clone(), machine.ids[1].clone()];

        both.sort();
        expected.sort();

        assert_eq!(both, expected, "not every workspace due was taken");
        assert!(ran.iter().all(|(_, answered)| answered.is_ok()), "{ran:?}");
        // each lease let go of before the next is taken, in the order they were taken.
        assert_eq!(
            lease.made(),
            taken
                .iter()
                .flat_map(|id| [format!("take {id}"), format!("release {id}")])
                .collect::<Vec<String>>(),
            "two bring-ups overlapped"
        );

        for at in [0, 1] {
            assert_eq!(machine.version(at).await, known(), "{at}");
            assert_eq!(
                machine.recorded_level(at).await,
                Some(known() as u32),
                "{at}"
            );

            let (facts, _) = machine.facts(at).await;
            let copies = std::fs::read_dir(backup::directory_of(
                &machine.directory,
                &facts.database_name,
            ))
            .expect("the copies")
            .count();

            assert!(copies > 0, "{at} was brought up without a copy");
        }

        assert_eq!(machine.version(2).await, 7);
        assert_eq!(machine.recorded_level(2).await, None);
        assert_eq!(
            machine.database(2).request_count(),
            east_before,
            "a workspace held read-only was sent something"
        );
        assert_eq!(
            machine
                .app_state
                .remote_sync
                .read()
                .await
                .workspace()
                .remote_id,
            None,
            "a workspace was opened"
        );

        // and the next beat finds nothing behind: no lease, and nothing sent.
        let requests = machine.requests();

        assert!(answers(machine.beat(&lease, AT + 2).await).is_empty());
        assert_eq!(lease.made().len(), 4);
        assert_eq!(machine.requests(), requests);
    }

    /// **Never two at once.** A beat that finds a bring-up under way on this machine leaves at
    /// once, takes no lease and sends nothing; the next beat after it brings the workspace up.
    #[tokio::test]
    async fn a_beat_while_a_bring_up_is_under_way_leaves_it_be() {
        let machine = Machine::with("behind-busy", &["North"]).await;
        let lease = Ledger::default();
        let requests = machine.requests();

        {
            let _under_way = machine.app_state.bringing_up.lock().await;

            assert!(matches!(machine.beat(&lease, AT + 1).await, Beat::Busy));
        }

        assert!(lease.made().is_empty());
        assert_eq!(machine.requests(), requests);
        assert!(all_brought(machine.beat(&lease, AT + 2).await));
        assert_eq!(machine.version(0).await, known());
    }

    /// **The organization's standing.** In an organization a newer rentable took past what this
    /// build writes, a beat brings nothing up: no lease, nothing sent, the workspace at 7.
    #[tokio::test]
    async fn nothing_is_brought_up_in_an_organization_this_build_may_not_write() {
        let machine = Machine::with("behind-read-only", &["North"]).await;
        let lease = Ledger::default();

        {
            let organization = machine.app_state.organization.read().await;
            let store = store_of(&organization);

            store
                .record_floors(FORMAT_VERSION + 1, FORMAT_VERSION, FORMAT_VERSION + 1)
                .await;
            assert_eq!(
                store.refuse_another_format().await.expect("readable"),
                Standing::ReadOnly
            );
        }

        let requests = machine.requests();

        assert!(answers(machine.beat(&lease, AT + 1).await).is_empty());
        assert!(lease.made().is_empty());
        assert_eq!(machine.requests(), requests);
        assert_eq!(machine.version(0).await, 7);
    }

    /// **The organization's upgrade** (ticket 19). While another member holds the organization's
    /// upgrade lease, a beat brings nothing up; once they let it go, the next beat does.
    #[tokio::test]
    async fn nothing_is_brought_up_while_another_member_upgrades_the_organization() {
        let machine = Machine::with("behind-upgrading", &["North"]).await;
        let lease = Ledger::default();

        {
            let organization = machine.app_state.organization.read().await;
            let store = store_of(&organization);
            let now = store.clock().now();

            StoreLease::new(store)
                .take(ORGANIZATION_LEASE, "another-manager", now + 60_000, now)
                .await
                .expect("the organization's lease");
        }

        let requests = machine.requests();

        assert!(answers(machine.beat(&lease, AT + 1).await).is_empty());
        assert!(lease.made().is_empty());
        assert_eq!(machine.requests(), requests);
        assert_eq!(machine.version(0).await, 7);

        {
            let organization = machine.app_state.organization.read().await;

            StoreLease::new(store_of(&organization))
                .release(ORGANIZATION_LEASE, "another-manager")
                .await
                .expect("let go");
        }

        assert!(all_brought(machine.beat(&lease, AT + 2).await));
        assert_eq!(machine.version(0).await, known());
    }

    /// **A failure is logged and tried again on a later beat.** A step the database refuses
    /// leaves the workspace at 7 with the lease let go of; a beat soon after leaves it be, and one
    /// [`RETRY_AFTER_MS`] after the failure brings it up.
    #[tokio::test]
    async fn a_failure_is_tried_again_on_a_later_beat() {
        let machine = Machine::with("behind-failure", &["North"]).await;
        let lease = Ledger::default();
        let north = machine.ids[0].clone();
        let first_of_0007 = apply::statements_between(7, 8)
            .into_iter()
            .next()
            .expect("a statement of 0007");

        machine.database(0).refusing(&first_of_0007).await;

        let ran = answers(machine.beat(&lease, AT + 1).await);

        assert_eq!(ran.len(), 1);
        assert!(ran[0].1.is_err(), "{ran:?}");
        assert_eq!(machine.version(0).await, 7);
        assert_eq!(machine.recorded_level(0).await, None);
        assert_eq!(
            lease.made(),
            vec![format!("take {north}"), format!("release {north}")]
        );

        let requests = machine.requests();

        assert!(answers(machine.beat(&lease, AT + 2).await).is_empty());
        assert_eq!(machine.requests(), requests);
        assert_eq!(lease.made().len(), 2);

        assert!(all_brought(
            machine.beat(&lease, AT + 1 + RETRY_AFTER_MS).await
        ));
        assert_eq!(machine.version(0).await, known());
        assert_eq!(machine.recorded_level(0).await, Some(known() as u32));
    }

    /// **A workspace another member is bringing up is theirs.** Where the lease answers
    /// somebody else's, nothing is copied or sent, and the workspace stays as they will leave it.
    #[tokio::test]
    async fn a_workspace_somebody_else_holds_the_lease_on_is_left_to_them() {
        let machine = Machine::with("behind-held", &["North"]).await;
        let lease = Ledger {
            held_by: Some("another-member".to_string()),
            ..Ledger::default()
        };
        let requests = machine.requests();
        let ran = answers(machine.beat(&lease, AT + 1).await);

        assert!(
            matches!(
                ran.as_slice(),
                [(
                    _,
                    Err(Error::Refused {
                        reason: RefusalReason::UpgradeUnderWay,
                        ..
                    })
                )]
            ),
            "{ran:?}"
        );
        assert_eq!(machine.requests(), requests);
        assert_eq!(machine.version(0).await, 7);
    }

    /// **Ticket 40's third criterion, the other half.** On the shipped ladder, a member with a
    /// read-only grant is refused a workspace at 7 as `WorkspaceBehind`; once a machine whose
    /// member holds full access has brought it up in the background, without anybody opening it,
    /// the reader opens it with nothing sent and reads every record over Turso, `0008`'s column
    /// among what they read.
    #[tokio::test]
    async fn a_reader_opens_once_a_full_access_machine_has_brought_the_workspace_up() {
        use crate::{
            database::proxy::SQLQuery,
            organization::workspace::remote::{query, reach},
        };

        let machine = Machine::with("behind-reader", &["North"]).await;
        let lease = Ledger::default();
        let north = machine.ids[0].clone();
        let pipeline = Pipeline::at(&machine.database(0).url(""));
        let opened_by_the_reader = async || {
            let organization = machine.app_state.organization.read().await;
            let store = store_of(&organization);
            let workspaces = store
                .workspaces(&machine.reader.verifying_key)
                .await
                .expect("the workspaces");
            let (facts, held) = openable(&machine.reader, &workspaces, &[], &north)
                .expect("openable")
                .expect("a grant");

            assert_eq!(held.access, AccessLevel::ReadOnly);

            upgrade(
                Pending {
                    store,
                    session: &machine.reader,
                    facts: &facts,
                    held: &held,
                    pipeline: &pipeline,
                    account: None::<&InMemoryPlatform>,
                },
                &StoreLease::new(store),
                || async {},
                |phase| assert_eq!(phase, MigrationPhase::Done, "a reader was told {phase:?}"),
                || AT + 3,
            )
            .await
        };

        assert!(
            matches!(
                opened_by_the_reader().await,
                Err(Error::Refused {
                    reason: RefusalReason::WorkspaceBehind,
                    ..
                })
            ),
            "the reader was not held behind 0007 and 0008"
        );
        assert!(all_brought(machine.beat(&lease, AT + 1).await));

        let requests = machine.requests();
        let opened = opened_by_the_reader().await;

        assert!(opened.is_ok(), "{opened:?}");
        assert_eq!(machine.requests(), requests, "the reader sent something");

        let organization = machine.app_state.organization.read().await;
        let target = reach(store_of(&organization), &machine.reader, &north, |_| {
            Pipeline::at(&machine.database(0).url(""))
        })
        .await
        .expect("the reader reached the workspace");
        let tenants = query(
            &target,
            &SQLQuery {
                sql: "SELECT id FROM tenant WHERE merged_into IS NULL".to_string(),
                params: vec![],
            },
        )
        .await
        .expect("the tenants");

        assert_eq!(tenants.len(), 1, "{tenants:?}");
    }
}
