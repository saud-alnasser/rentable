//! a pending migration reaches a workspace under a lease, and an older build refuses a newer one.
//!
//! **Whichever client notices, upgrades.** A workspace is recorded at the schema version it was
//! last migrated to; a build that ships more migrations than that finds a pending migration on
//! open, takes the lease for that workspace with a deadline, applies the tail of the shipped
//! migrations over the wire under its own full-access credential, records the new version, and
//! releases the lease. No machine is special: any member may hold the lease, because the
//! alternatives were rejected in the plan, and an organization whose owner is away still
//! upgrades. The trigger is a client opening the workspace, never a sweep.
//!
//! **The lease is taken where it is atomic.** The organization replica on this machine is a
//! replica, and two machines writing the same row into two replicas both believe they hold it
//! until a sync says otherwise, which is too late for a migration that has begun. So the lease is
//! taken against the organization database's primary, through the same `/v2/pipeline` a
//! migration itself goes over, as one conditional upsert followed by a read of the row in one
//! request: the row names whoever holds it, and the answer is that name. A test double runs the
//! same statements against a local primary, and two clients racing for it is a test.
//!
//! **A leaked lease expires.** The row carries `expires_at`, the lease lifetime after it was
//! taken, and a lease whose holder died holds the workspace only until then: the conditional
//! upsert takes a row whose deadline has passed. The deadline is a moment a human can read out
//! of the row, and the interface says whose lease it is waiting on and until when.
//!
//! **An older build refuses a newer schema and reads nothing** (requirement 24). A workspace
//! recorded above the version this build ships is refused at open, before the replica is
//! touched, with the two numbers and what to do; there is nothing else on offer, because rows
//! this build was not written against are the harm the requirement exists to prevent.
//!
//! **A member watching sees it running.** The upgrade reports its phase as it goes, and the shell
//! puts the phase on the loading screen: applying, or waiting on another member's lease. It is
//! the one moment the local replica is not enough, and the screen says so rather than sitting
//! still.
//!
//! **A copy is taken before the first statement** (effort 838, requirement 13, ticket 28). A
//! pending migration drops and renames tables on the database every member reads, and one that
//! finished wrong would leave nothing to go back to. So once the lease is held, and before the
//! migrations are applied, the holder reads the workspace over the same pipeline, with the same
//! credential, into a file of its own under the data directory, labelled
//! `schema-<from>-to-<to>` (`backup.rs`); and where this machine holds the owner's Turso account,
//! makes a protected copy of the workspace database there as well. A member's machine holds no
//! account and makes only the first. A local copy that cannot be written releases the lease, as a
//! failed migration does, and refuses with `CopyNotTaken`: nothing is applied. A copy the account
//! refuses is logged, and the migration goes on with the local copy.
//!
//! **The workspace keeps its own version, and the organization's record follows it** (effort 838,
//! requirement 15, ticket 32). The tail, the check of what it made and the workspace's own
//! version row commit in one transaction on the workspace database (`migrate.rs`), or none of it
//! does, and a failure anywhere releases the lease with the workspace exactly as it was. The
//! organization's record stays what is read before a replica is opened, and is written after the
//! commit as it always was. Where the two disagree, the workspace's row wins: a migration that
//! committed and was never recorded, the machine gone between the two, is found at the shipped
//! version by the next member to open it, who applies nothing and brings only the record up. The
//! copy is still taken first, since which of the two it is can only be read inside the
//! transaction.

use std::{future::Future, time::Duration};

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::{
    backup, diagnostics,
    error::{Error, RefusalReason},
    http::build_client,
    sync::turso::platform::{AccessLevel, TursoPlatform},
};

use super::{
    migrate::{self, OverThePipeline, Pipeline},
    session::{MemberSession, WorkspaceCredential, WorkspaceFacts},
    store::{MigrationLeaseRecord, OrganizationStore},
};

/// How long a lease stands after it is taken: a migration that has not finished in this long
/// has died, and the workspace is somebody else's to upgrade from then on. The retired control
/// plane's migration credential lifetime, for the same reason.
pub const MIGRATION_LEASE_LIFETIME_MS: i64 = 30 * 60 * 1_000;

/// How long a client waiting on another's lease sleeps between looks.
pub const LEASE_POLL_INTERVAL: Duration = Duration::from_secs(3);

/// Where an upgrade is, as the shell tells whoever is watching.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "phase", rename_all = "camelCase")]
pub enum MigrationPhase {
    /// this client holds the lease and is applying the migrations.
    Applying { from: i64, to: i64 },
    /// another member holds the lease; this client waits and looks again.
    #[serde(rename_all = "camelCase")]
    Waiting {
        holder_member_id: String,
        until: i64,
    },
    /// the workspace is at the shipped version.
    Done,
}

/// What taking a lease answered.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum LeaseOutcome {
    /// this member holds it until `until`.
    Held { until: i64 },
    /// somebody else holds it until `until`, and the deadline has not passed.
    HeldBy {
        holder_member_id: String,
        until: i64,
    },
}

/// Where a lease is taken: the organization database's primary, or a local stand-in for it.
pub trait LeaseAuthority {
    /// Take the lease on `workspace_id` for `holder` until `until`, unless somebody else holds
    /// it and their deadline is after `now`. Atomic at the authority.
    fn take(
        &self,
        workspace_id: &str,
        holder: &str,
        until: i64,
        now: i64,
    ) -> impl Future<Output = Result<LeaseOutcome, Error>> + Send;

    /// Let go of the lease, where `holder` holds it.
    fn release(
        &self,
        workspace_id: &str,
        holder: &str,
    ) -> impl Future<Output = Result<(), Error>> + Send;
}

/// The upsert that takes a lease where the old one lapsed or is this holder's own, and the read
/// that says who holds it afterwards. Two statements, one connection, and the read is the answer.
const TAKE: &str = "INSERT INTO \"migration_lease\" (\"workspace_id\", \"holder_member_id\", \
                    \"expires_at\") VALUES (?, ?, ?) \
                    ON CONFLICT(\"workspace_id\") DO UPDATE SET \
                    \"holder_member_id\" = excluded.\"holder_member_id\", \
                    \"expires_at\" = excluded.\"expires_at\" \
                    WHERE \"migration_lease\".\"expires_at\" <= ? \
                    OR \"migration_lease\".\"holder_member_id\" = excluded.\"holder_member_id\"";
const READ: &str = "SELECT \"holder_member_id\", \"expires_at\" FROM \"migration_lease\" \
                    WHERE \"workspace_id\" = ?";
const RELEASE: &str = "DELETE FROM \"migration_lease\" \
                       WHERE \"workspace_id\" = ? AND \"holder_member_id\" = ?";

/// The lease authority production uses: the organization database's primary, over its
/// pipeline, under the member's own organization credential.
pub struct PipelineLease {
    pipeline: Pipeline,
    credential: String,
}

impl PipelineLease {
    pub fn new(pipeline: Pipeline, credential: &str) -> Self {
        Self {
            pipeline,
            credential: credential.to_string(),
        }
    }

    async fn post(&self, requests: Vec<Value>) -> Result<Value, Error> {
        let client = build_client(Duration::from_secs(30))?;
        let response = client
            .post(self.pipeline.url())
            .bearer_auth(&self.credential)
            .json(&json!({ "requests": requests }))
            .send()
            .await
            .map_err(|error| Error::Network {
                message: format!(
                    "the organization database could not be reached to take the migration lease \
                     ({error})"
                ),
            })?;
        let status = response.status();

        if !status.is_success() {
            return Err(Error::refused(
                RefusalReason::DatabaseRefused,
                format!("the organization database refused the migration lease ({status})"),
            ));
        }

        response.json().await.map_err(|_| Error::Integrity {
            message: "the organization database answered the lease with something this \
                      application cannot read"
                .to_string(),
        })
    }
}

fn execute(sql: &str, args: Vec<Value>) -> Value {
    json!({ "type": "execute", "stmt": { "sql": sql, "args": args } })
}

fn text_arg(value: &str) -> Value {
    json!({ "type": "text", "value": value })
}

fn integer_arg(value: i64) -> Value {
    json!({ "type": "integer", "value": value.to_string() })
}

impl LeaseAuthority for PipelineLease {
    async fn take(
        &self,
        workspace_id: &str,
        holder: &str,
        until: i64,
        now: i64,
    ) -> Result<LeaseOutcome, Error> {
        let answered = self
            .post(vec![
                execute(
                    TAKE,
                    vec![
                        text_arg(workspace_id),
                        text_arg(holder),
                        integer_arg(until),
                        integer_arg(now),
                    ],
                ),
                execute(READ, vec![text_arg(workspace_id)]),
                json!({ "type": "close" }),
            ])
            .await?;
        let results = answered
            .get("results")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();

        for result in &results {
            if result.get("type").and_then(Value::as_str) == Some("error") {
                return Err(Error::refused(
                    RefusalReason::DatabaseRefused,
                    "the organization database refused the migration lease",
                ));
            }
        }

        // the read is the second result: one row, holder and deadline.
        let row = results
            .get(1)
            .and_then(|result| result.pointer("/response/result/rows/0"))
            .and_then(Value::as_array)
            .ok_or_else(|| Error::Integrity {
                message: "the migration lease was taken and the row could not be read back"
                    .to_string(),
            })?;
        let holder_read = row
            .first()
            .and_then(|cell| cell.get("value"))
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
        let until_read = row
            .get(1)
            .and_then(|cell| cell.get("value"))
            .and_then(|value| {
                value
                    .as_i64()
                    .or_else(|| value.as_str().and_then(|text| text.parse().ok()))
            })
            .unwrap_or(until);

        Ok(outcome(holder, &holder_read, until_read))
    }

    async fn release(&self, workspace_id: &str, holder: &str) -> Result<(), Error> {
        self.post(vec![
            execute(RELEASE, vec![text_arg(workspace_id), text_arg(holder)]),
            json!({ "type": "close" }),
        ])
        .await
        .map(|_| ())
    }
}

/// The same statements against the organization store's own connection: the authority for a
/// test, and for an organization with no remote, where the local file is the primary.
pub struct StoreLease<'a> {
    store: &'a OrganizationStore,
}

impl<'a> StoreLease<'a> {
    pub fn new(store: &'a OrganizationStore) -> Self {
        Self { store }
    }
}

impl LeaseAuthority for StoreLease<'_> {
    async fn take(
        &self,
        workspace_id: &str,
        holder: &str,
        until: i64,
        now: i64,
    ) -> Result<LeaseOutcome, Error> {
        let connection = self.store.lease_connection();

        connection
            .execute(
                TAKE,
                vec![
                    turso::Value::Text(workspace_id.to_string()),
                    turso::Value::Text(holder.to_string()),
                    turso::Value::Integer(until),
                    turso::Value::Integer(now),
                ],
            )
            .await?;

        let lease = self
            .store
            .migration_lease(workspace_id)
            .await?
            .ok_or_else(|| Error::Integrity {
                message: "the migration lease was taken and the row could not be read back"
                    .to_string(),
            })?;

        Ok(outcome(holder, &lease.holder_member_id, lease.expires_at))
    }

    async fn release(&self, workspace_id: &str, holder: &str) -> Result<(), Error> {
        self.store
            .lease_connection()
            .execute(
                RELEASE,
                vec![
                    turso::Value::Text(workspace_id.to_string()),
                    turso::Value::Text(holder.to_string()),
                ],
            )
            .await?;

        Ok(())
    }
}

fn outcome(holder: &str, holder_read: &str, until: i64) -> LeaseOutcome {
    if holder_read == holder {
        LeaseOutcome::Held { until }
    } else {
        LeaseOutcome::HeldBy {
            holder_member_id: holder_read.to_string(),
            until,
        }
    }
}

/// Requirement 24: a workspace recorded above the version this build ships is refused, with the
/// two numbers and what to do, before anything of it is read.
pub fn refuse_newer(facts: &WorkspaceFacts) -> Result<(), Error> {
    let shipped = migrate::shipped_version();

    if facts.schema_version > shipped {
        return Err(Error::refused(
            RefusalReason::WorkspaceNewer,
            format!(
                "{} was upgraded by a newer rentable (schema {}, and this one knows {}). update \
                 rentable to open it; nothing in it was read",
                facts.name, facts.schema_version, shipped
            ),
        ));
    }

    Ok(())
}

/// Whether the workspace is behind what this build ships.
pub fn is_pending(facts: &WorkspaceFacts) -> bool {
    facts.schema_version < migrate::shipped_version()
}

/// What is being upgraded: the workspace as `openable` handed it over, the member opening it,
/// the credential they hold on it, where its database takes statements, and the owner's Turso
/// account where this machine holds it, which the copy before the migration is made on too.
pub struct Pending<'a, P> {
    pub store: &'a OrganizationStore,
    pub session: &'a MemberSession,
    pub facts: &'a WorkspaceFacts,
    pub held: &'a WorkspaceCredential,
    pub pipeline: &'a Pipeline,
    /// `None` on a member's machine, which makes the copy on this machine alone.
    pub account: Option<&'a P>,
}

/// Let go of the lease on a path that already has its answer: a failure here is logged and the
/// answer stands, since the lease runs out at its deadline whatever happens.
async fn release_after<L: LeaseAuthority>(lease: &L, workspace_id: &str, holder: &str) {
    if let Err(error) = lease.release(workspace_id, holder).await {
        diagnostics::warn("organization.migration.releaseFailed")
            .with("workspace", workspace_id)
            .with("error", error.to_string().as_str())
            .write();
    }
}

/// Bring a workspace up to the shipped schema, under a lease, or wait while another member does.
///
/// The migrations go over `pending.held`, the member's own credential on the workspace, because
/// any member may hold the lease. `wait` is how the client sleeps between looks while somebody
/// else holds it, and `report` is told each phase. Answers the version the workspace is at when
/// it returns, which is the shipped one unless the wait ran out.
///
/// The workspace is copied once the lease is held and before anything is applied (ticket 28): a
/// copy that cannot be written releases the lease and refuses with `CopyNotTaken`.
pub async fn upgrade<L, W, F, R, P>(
    pending: Pending<'_, P>,
    lease: &L,
    wait: W,
    report: R,
    now: impl Fn() -> i64,
) -> Result<i64, Error>
where
    L: LeaseAuthority,
    W: Fn() -> F,
    F: Future<Output = ()>,
    R: Fn(MigrationPhase),
    P: TursoPlatform,
{
    let Pending {
        store,
        session,
        facts,
        held,
        pipeline,
        account,
    } = pending;
    let shipped = migrate::shipped_version();
    let mut current = facts.schema_version;

    // a read-only credential cannot write the schema, so a holder of one takes no lease: the
    // lease would be spent on a refusal from the database and held, for as long as that takes,
    // against whoever could apply the migrations. What they are owed is the sentence, and the
    // workspace opens for them once a member with full access has opened it.
    if current < shipped && held.access != AccessLevel::FullAccess {
        return Err(Error::refused(
            RefusalReason::WorkspaceBehind,
            format!(
                "{} is behind this version and read-only access cannot bring it up. ask a member with full access to open it once",
                facts.name
            ),
        ));
    }

    while current < shipped {
        let taken_at = now();
        let until = taken_at + MIGRATION_LEASE_LIFETIME_MS;

        match lease
            .take(&facts.id, &session.member_id, until, taken_at)
            .await?
        {
            LeaseOutcome::Held { until } => {
                report(MigrationPhase::Applying {
                    from: current,
                    to: shipped,
                });
                diagnostics::info("organization.migration.applying")
                    .with("workspace", facts.id.as_str())
                    .with("from", current.to_string().as_str())
                    .with("to", shipped.to_string().as_str())
                    .with("until", until.to_string().as_str())
                    .write();

                // the workspace as it stands, before the first statement, over the pipeline and
                // with the credential the migrations go over. A copy that could not be taken
                // releases the lease at once, as a failed migration does, and nothing is applied.
                let label = format!("schema-{current}-to-{shipped}");
                let copied = backup::local_copy(
                    &OverThePipeline::new(pipeline, &held.token),
                    store.directory(),
                    &facts.database_name,
                    &label,
                    taken_at,
                )
                .await;

                if let Err(refusal) = copied {
                    // the copy's refusal is the answer, and a release that fails too is logged
                    // rather than put in its place; the lease runs out on its own.
                    release_after(lease, &facts.id, &session.member_id).await;

                    return Err(refusal);
                }

                // refused or made, the account's copy is logged where it is made, and the
                // migration goes on with the local copy either way.
                if let Some(account) = account
                    && !backup::remote_copy_made(store.directory(), &facts.database_name, &label)
                    && let Ok(name) =
                        backup::remote_copy(account, &facts.database_name, &label, taken_at).await
                {
                    backup::remember_remote_copy(
                        store.directory(),
                        &facts.database_name,
                        &label,
                        &name,
                    );
                }

                let applied = migrate::apply_between(
                    pipeline,
                    &held.token,
                    current as usize,
                    shipped as usize,
                )
                .await;

                // the version is recorded and sent before the lease goes: a waiting client
                // breaks its wait the moment the lease is free and reads the version to decide
                // whether to take it, so a lease released first is a window in which the same
                // statements are applied twice. A migration that failed was rolled back whole and
                // releases at once, since it is somebody's to try again and a lease held over a
                // failure would make them wait out the deadline.
                match applied {
                    Err(refusal) => {
                        release_after(lease, &facts.id, &session.member_id).await;

                        return Err(refusal);
                    }
                    // the workspace's own row already said the shipped version: a migration that
                    // committed and was never recorded, and only the record is brought up.
                    Ok(migrate::Migrated::AlreadyAt(version)) => {
                        diagnostics::info("organization.migration.alreadyAt")
                            .with("workspace", facts.id.as_str())
                            .with("recorded", current.to_string().as_str())
                            .with("at", version.to_string().as_str())
                            .write();
                    }
                    Ok(migrate::Migrated::Applied { from, to }) => {
                        diagnostics::info("organization.migration.applied")
                            .with("workspace", facts.id.as_str())
                            .with("from", from.to_string().as_str())
                            .with("to", to.to_string().as_str())
                            .write();
                    }
                }

                // the migration has committed, so a record that fails still lets the lease go:
                // held, it would keep everybody else waiting out its deadline over a workspace
                // already at the shipped version, which the next taker finds and records.
                if let Err(refusal) = store.record_schema_version(&facts.id, shipped, now()).await {
                    release_after(lease, &facts.id, &session.member_id).await;

                    return Err(refusal);
                }

                if !store.push().await {
                    diagnostics::warn("organization.migration.versionNotYetSent")
                        .with("workspace", facts.id.as_str())
                        .write();
                }

                lease.release(&facts.id, &session.member_id).await?;

                current = shipped;
            }
            LeaseOutcome::HeldBy {
                holder_member_id,
                until,
            } => {
                report(MigrationPhase::Waiting {
                    holder_member_id: holder_member_id.clone(),
                    until,
                });

                // look again after a sleep: the other client records the version and releases,
                // or its deadline passes and the next take is this client's.
                while now() < until {
                    wait().await;
                    store.pull().await;

                    let recorded = store
                        .workspaces(&session.verifying_key)
                        .await?
                        .into_iter()
                        .find(|workspace| workspace.id == facts.id)
                        .map(|workspace| workspace.schema_version)
                        .unwrap_or(current);

                    if recorded >= shipped {
                        current = recorded;
                        break;
                    }

                    if store
                        .migration_lease(&facts.id)
                        .await?
                        .is_none_or(|lease| lease.holder_member_id != holder_member_id)
                    {
                        break;
                    }
                }

                if current < shipped && now() >= until {
                    // the deadline passed with nothing recorded: the next turn of the loop takes
                    // the lease, because the row's deadline is behind `now`.
                    continue;
                }
            }
        }
    }

    report(MigrationPhase::Done);

    Ok(current)
}

/// What the interface is told about a lease it is waiting on.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LeaseFacts {
    pub workspace_id: String,
    pub holder_member_id: String,
    pub expires_at: i64,
}

impl From<MigrationLeaseRecord> for LeaseFacts {
    fn from(record: MigrationLeaseRecord) -> Self {
        Self {
            workspace_id: record.workspace_id,
            holder_member_id: record.holder_member_id,
            expires_at: record.expires_at,
        }
    }
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use serde_json::json;

    use super::{
        LeaseAuthority, LeaseOutcome, MIGRATION_LEASE_LIFETIME_MS, MigrationPhase, Pending,
        StoreLease, is_pending, refuse_newer, upgrade,
    };
    use crate::{
        backup,
        error::{Error, RefusalReason},
        organization::{
            HeldOrganization,
            invite::{AccountAndLink, Invitation, WorkspaceGrant, locator, make_account_and_link},
            migrate::{self, Pipeline},
            permission,
            session::{CredentialSlot, MemberSession, WorkspaceFacts, sign_in},
            setup::{CreateOrganization, Remote, create_organization},
            store::OrganizationStore,
            vault::KdfParams,
            workspace::{create_workspace, openable},
        },
        persisted::Persisted,
        sync::{
            RemoteSyncStore,
            test::{
                pipeline::LocalPipeline,
                server::{ScriptedResponse, ScriptedServer},
            },
            turso::{
                discovery::McpEndpoint,
                platform::{AccessLevel, InMemoryPlatform, PlatformError},
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
        let directory = std::env::temp_dir().join(format!("rentable-migration-{name}-{nanos:x}"));
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

    /// An organization with one workspace, its owner and a member both signed in and settled.
    async fn organization(
        directory: &std::path::Path,
    ) -> (OrganizationStore, MemberSession, MemberSession, String) {
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
                group: None,
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
        let pipeline = LocalPipeline::start().await;
        let workspace = create_workspace(
            &store,
            &mut owner,
            &platform,
            |_| Pipeline::at(&pipeline.url("")),
            "North",
            AT,
        )
        .await
        .expect("the workspace");
        let link = locator(&store, &owner).await.expect("the link");
        let invited = make_account_and_link(
            &store,
            &owner,
            no_platform(),
            &link,
            Invitation {
                username: "sami.staff",
                role: permission::MEMBER,
                workspaces: &full(std::slice::from_ref(&workspace.id)),
            },
            test_cost(),
            AT,
        )
        .await
        .expect("the member");
        let mut member = sign_in(
            &store,
            &joined_as(&owner, &invited.member_id, permission::MEMBER),
            &secret_of(&invited),
            &slot(),
        )
        .await
        .expect("the member did not sign in");

        member.must_change_password = false;

        (store, owner, member, workspace.id)
    }

    /// The workspace as `openable` hands it to the command, at whichever version the row says.
    async fn facts_of(
        store: &OrganizationStore,
        session: &MemberSession,
        workspace_id: &str,
    ) -> (
        WorkspaceFacts,
        crate::organization::session::WorkspaceCredential,
    ) {
        let workspaces = store
            .workspaces(&session.verifying_key)
            .await
            .expect("the workspaces");

        openable(session, &workspaces, &[], workspace_id)
            .expect("openable")
            .expect("a grant")
    }

    /// The workspace on the account as it stood before its migration: two tables and a value of
    /// every storage class, in the order the listing names them and each row in the order it was
    /// written. The scripted pipeline answers the copy's reads with it, so it is exactly what the
    /// copy has to hold.
    fn workspace_before() -> Vec<(String, String, Vec<Vec<turso::Value>>)> {
        vec![
            (
                "contract".to_string(),
                "CREATE TABLE `contract` (`id` text PRIMARY KEY NOT NULL, `rent` real, \
                 `months` integer, `scan` blob, `note` text)"
                    .to_string(),
                vec![
                    vec![
                        turso::Value::Text("c-1".to_string()),
                        turso::Value::Real(1250.5),
                        turso::Value::Integer(12),
                        turso::Value::Blob(vec![0, 1, 2, 3]),
                        turso::Value::Null,
                    ],
                    vec![
                        turso::Value::Text("c-2".to_string()),
                        turso::Value::Real(-0.25),
                        turso::Value::Integer(i64::MAX),
                        turso::Value::Blob(Vec::new()),
                        turso::Value::Text("a note".to_string()),
                    ],
                ],
            ),
            (
                "tenant".to_string(),
                "CREATE TABLE `tenant` (`id` integer PRIMARY KEY, `name` text)".to_string(),
                vec![vec![
                    turso::Value::Integer(7),
                    turso::Value::Text("Sami".to_string()),
                ]],
            ),
        ]
    }

    /// How many requests the copy of [`workspace_before`] makes: the `BEGIN`, the listing, a
    /// count and a page per table, and the `ROLLBACK` that closes the stream.
    const READS: usize = 7;

    /// The pipeline's answer to one statement on a stream it holds open: `rows`, each value a
    /// typed cell as the database sends it, blobs in base64 with their padding, and the baton the
    /// next request hands back.
    fn answering(rows: &[Vec<turso::Value>]) -> ScriptedResponse {
        let cell = |value: &turso::Value| match value {
            turso::Value::Null => json!({ "type": "null" }),
            turso::Value::Integer(integer) => {
                json!({ "type": "integer", "value": integer.to_string() })
            }
            turso::Value::Real(real) => json!({ "type": "float", "value": real }),
            turso::Value::Text(text) => json!({ "type": "text", "value": text }),
            turso::Value::Blob(bytes) => json!({
                "type": "blob",
                "base64": base64::Engine::encode(&base64::engine::general_purpose::STANDARD, bytes)
            }),
        };
        let rows: Vec<Vec<serde_json::Value>> = rows
            .iter()
            .map(|row| row.iter().map(cell).collect())
            .collect();

        ScriptedResponse::new(
            200,
            json!({ "baton": "a-baton", "base_url": null, "results": [
                { "type": "ok", "response": { "type": "execute", "result": { "cols": [], "rows": rows } } }
            ] })
            .to_string(),
        )
    }

    /// The copy's reads of [`workspace_before`], answered in the order they are asked.
    fn as_it_stood() -> Vec<ScriptedResponse> {
        let workspace = workspace_before();
        let listing: Vec<Vec<turso::Value>> = workspace
            .iter()
            .map(|(name, statement, _)| {
                vec![
                    turso::Value::Text("table".to_string()),
                    turso::Value::Text(name.clone()),
                    turso::Value::Text(statement.clone()),
                ]
            })
            .collect();
        let mut script = vec![answering(&[]), answering(&listing)];

        for (_, _, rows) in &workspace {
            let paged: Vec<Vec<turso::Value>> = rows
                .iter()
                .enumerate()
                .map(|(index, row)| {
                    std::iter::once(turso::Value::Integer(index as i64 + 1))
                        .chain(row.iter().cloned())
                        .collect()
                })
                .collect();

            script.push(answering(&[vec![turso::Value::Integer(rows.len() as i64)]]));
            script.push(answering(&paged));
        }

        script.push(ScriptedResponse::new(
            200,
            json!({ "baton": null, "base_url": null, "results": [
                { "type": "ok", "response": { "type": "execute", "result": { "cols": [], "rows": [] } } },
                { "type": "ok", "response": { "type": "close" } }
            ] })
            .to_string(),
        ));

        script
    }

    /// The copy's reads, answered from [`as_it_stood`], then the migration run against a real
    /// database one migration short of the shipped version: the stand-in pipeline (ticket 32).
    async fn copied_then_applied() -> LocalPipeline {
        let pipeline = LocalPipeline::after(as_it_stood()).await;

        pipeline
            .holding(&migrate::statements(
                migrate::shipped_version() as usize - 1,
            ))
            .await;

        pipeline
    }

    /// How many requests a migration makes after the copy: `BEGIN` and the version read, the
    /// tail and the check, and the version row and `COMMIT`.
    const MIGRATING: usize = 3;

    /// The name of every copy of `facts`'s workspace on the machine whose data is in `directory`.
    fn copies_of(directory: &std::path::Path, facts: &WorkspaceFacts) -> Vec<String> {
        let mut names: Vec<String> =
            std::fs::read_dir(backup::directory_of(directory, &facts.database_name))
                .map(|entries| {
                    entries
                        .flatten()
                        .map(|entry| entry.file_name().to_string_lossy().into_owned())
                        .collect()
                })
                .unwrap_or_default();

        names.sort();
        names
    }

    /// Two clients race for one lease: one holds it, the other is told who does and until when;
    /// once it is released the other takes it; and a lease whose deadline has passed is anybody's.
    #[tokio::test]
    async fn two_clients_racing_for_the_lease_and_a_leaked_lease_that_expires() {
        let directory = scratch("race");
        let (store, owner, member, workspace_id) = organization(&directory).await;
        let lease = StoreLease::new(&store);
        let until = AT + MIGRATION_LEASE_LIFETIME_MS;

        let first = lease
            .take(&workspace_id, &owner.member_id, until, AT)
            .await
            .expect("the first take");
        let second = lease
            .take(&workspace_id, &member.member_id, until + 5, AT + 5)
            .await
            .expect("the second take");

        assert_eq!(first, LeaseOutcome::Held { until });
        assert_eq!(
            second,
            LeaseOutcome::HeldBy {
                holder_member_id: owner.member_id.clone(),
                until
            }
        );

        // the deadline is on the row, as a value a human reads out of it.
        let row = store
            .migration_lease(&workspace_id)
            .await
            .expect("the row")
            .expect("a lease");

        assert_eq!(row.holder_member_id, owner.member_id);
        assert_eq!(row.expires_at, until);

        // the holder takes it again without contest, and releases it; the other takes it.
        assert_eq!(
            lease
                .take(&workspace_id, &owner.member_id, until + 1, AT + 1)
                .await
                .expect("the retake"),
            LeaseOutcome::Held { until: until + 1 }
        );
        lease
            .release(&workspace_id, &owner.member_id)
            .await
            .expect("the release");
        assert_eq!(
            lease
                .take(&workspace_id, &member.member_id, until + 10, AT + 10)
                .await
                .expect("the take after release"),
            LeaseOutcome::Held { until: until + 10 }
        );

        // a release by somebody who does not hold it releases nothing.
        lease
            .release(&workspace_id, &owner.member_id)
            .await
            .expect("the other's release");
        assert!(
            store
                .migration_lease(&workspace_id)
                .await
                .expect("the row")
                .is_some()
        );

        // and a leaked lease: its holder is gone, the deadline passes, and the next take wins.
        let after = until + 10;

        assert_eq!(
            lease
                .take(&workspace_id, &owner.member_id, after + 1, after - 1)
                .await
                .expect("before the deadline"),
            LeaseOutcome::HeldBy {
                holder_member_id: member.member_id.clone(),
                until: until + 10
            }
        );
        assert_eq!(
            lease
                .take(
                    &workspace_id,
                    &owner.member_id,
                    after + MIGRATION_LEASE_LIFETIME_MS,
                    after
                )
                .await
                .expect("at the deadline"),
            LeaseOutcome::Held {
                until: after + MIGRATION_LEASE_LIFETIME_MS
            }
        );
    }

    /// A client that finds a pending migration takes the lease, applies the tail over the wire,
    /// records the version, and releases; a second client opening afterwards finds nothing to do.
    #[tokio::test]
    async fn a_pending_migration_is_applied_under_the_lease_and_recorded() {
        let directory = scratch("pending");
        let (store, owner, member, workspace_id) = organization(&directory).await;
        let shipped = migrate::shipped_version();

        // the workspace was migrated by an older build: one migration short.
        store
            .record_schema_version(&workspace_id, shipped - 1, AT)
            .await
            .expect("the older version");

        let (facts, held) = facts_of(&store, &member, &workspace_id).await;

        assert!(is_pending(&facts));
        refuse_newer(&facts).expect("a pending workspace is not a newer one");

        let pipeline = copied_then_applied().await;
        let phases = Mutex::new(Vec::new());
        let lease = StoreLease::new(&store);
        let clock = Mutex::new(AT + 1);

        let reached = upgrade(
            Pending {
                store: &store,
                session: &member,
                facts: &facts,
                held: &held,
                pipeline: &Pipeline::at(&pipeline.url("")),
                account: no_platform(),
            },
            &lease,
            || async {},
            |phase| phases.lock().expect("phases").push(phase),
            || {
                let mut clock = clock.lock().expect("the clock");
                *clock += 1;
                *clock
            },
        )
        .await
        .expect("the upgrade failed");

        assert_eq!(reached, shipped);
        assert_eq!(
            *phases.lock().expect("phases"),
            vec![
                MigrationPhase::Applying {
                    from: shipped - 1,
                    to: shipped
                },
                MigrationPhase::Done
            ]
        );

        // after the copy's reads, one transaction on one stream, its second request carrying the
        // last migration's statements as one batch, all under the member's own credential.
        assert_eq!(pipeline.request_count(), READS + MIGRATING);

        let request = pipeline.request(READS + 1);
        let body: serde_json::Value = serde_json::from_str(&request.body).expect("json");
        let steps: Vec<&str> = body["requests"][0]["batch"]["steps"]
            .as_array()
            .expect("the tail")
            .iter()
            .map(|step| step["stmt"]["sql"].as_str().expect("sql"))
            .collect();

        assert_eq!(
            steps,
            migrate::statements_between(shipped as usize - 1, shipped as usize)
        );

        for index in READS..READS + MIGRATING {
            assert_eq!(
                pipeline.request(index).header("authorization"),
                Some(format!("Bearer {}", held.token).as_str())
            );
        }

        // recorded, released, and nothing pending for the next client.
        let (facts, _) = facts_of(&store, &owner, &workspace_id).await;

        assert_eq!(facts.schema_version, shipped);
        assert!(!is_pending(&facts));
        assert!(
            store
                .migration_lease(&workspace_id)
                .await
                .expect("the row")
                .is_none()
        );

        // a member's machine holds no account, and copies the workspace to itself alone.
        assert_eq!(copies_of(&directory, &facts).len(), 1);
    }

    /// **Ticket 32's second criterion, at the upgrade.** A migration that committed on the
    /// workspace and was never recorded in the organization: the workspace's own row says the
    /// shipped version and the organization's record is one behind. The next member to open it
    /// applies nothing, and only the organization's record is brought up.
    #[tokio::test]
    async fn a_workspace_already_at_the_shipped_version_brings_up_only_the_record() {
        let directory = scratch("already-at");
        let (store, _, member, workspace_id) = organization(&directory).await;
        let shipped = migrate::shipped_version();
        let pipeline = LocalPipeline::start().await;

        migrate::apply(&Pipeline::at(&pipeline.url("")), "t", shipped as usize)
            .await
            .expect("the migration that committed");
        store
            .record_schema_version(&workspace_id, shipped - 1, AT)
            .await
            .expect("the record left behind");

        let (facts, held) = facts_of(&store, &member, &workspace_id).await;
        let before = pipeline.request_count();

        assert!(is_pending(&facts));

        let reached = upgrade(
            Pending {
                store: &store,
                session: &member,
                facts: &facts,
                held: &held,
                pipeline: &Pipeline::at(&pipeline.url("")),
                account: no_platform(),
            },
            &StoreLease::new(&store),
            || async {},
            |_| {},
            || AT + 1,
        )
        .await
        .expect("the upgrade failed");

        assert_eq!(reached, shipped);

        // the copy's reads, then the transaction opened, the row read, and rolled back: no
        // statement of the tail was sent.
        for index in before..pipeline.request_count() {
            let body = pipeline.request(index).body;

            assert!(!body.contains("\"batch\""), "the tail was sent: {body}");
            assert!(!body.contains("COMMIT"), "something was committed: {body}");
        }

        let (facts, _) = facts_of(&store, &member, &workspace_id).await;

        assert_eq!(facts.schema_version, shipped);
        assert!(
            store
                .migration_lease(&workspace_id)
                .await
                .expect("the row")
                .is_none()
        );
    }

    /// A second client arriving while the first holds the lease waits, told whose lease and until
    /// when, and goes on once the version is recorded; a failed migration releases the lease.
    #[tokio::test]
    async fn a_client_waits_on_anothers_lease_and_a_failure_releases_it() {
        let directory = scratch("waiting");
        let (store, owner, member, workspace_id) = organization(&directory).await;
        let shipped = migrate::shipped_version();

        store
            .record_schema_version(&workspace_id, shipped - 1, AT)
            .await
            .expect("the older version");

        let lease = StoreLease::new(&store);
        let until = AT + MIGRATION_LEASE_LIFETIME_MS;

        // the owner holds the lease, as a client that began before this one would.
        assert_eq!(
            lease
                .take(&workspace_id, &owner.member_id, until, AT)
                .await
                .expect("the owner's lease"),
            LeaseOutcome::Held { until }
        );

        let (facts, held) = facts_of(&store, &member, &workspace_id).await;
        let phases = Mutex::new(Vec::new());
        let looks = Mutex::new(0);
        let clock = Mutex::new(AT + 1);

        // the wait is where the other client finishes: on the second look the version is
        // recorded and the lease is gone.
        let reached = upgrade(
            Pending {
                store: &store,
                session: &member,
                facts: &facts,
                held: &held,
                pipeline: &Pipeline::at("http://127.0.0.1:1/never"),
                account: no_platform(),
            },
            &lease,
            || async {
                let nth = {
                    let mut looks = looks.lock().expect("looks");
                    *looks += 1;
                    *looks
                };

                if nth == 2 {
                    store
                        .record_schema_version(&workspace_id, shipped, AT + 2)
                        .await
                        .expect("the other client's record");
                    lease
                        .release(&workspace_id, &owner.member_id)
                        .await
                        .expect("the other client's release");
                }
            },
            |phase| phases.lock().expect("phases").push(phase),
            || {
                let mut clock = clock.lock().expect("the clock");
                *clock += 1;
                *clock
            },
        )
        .await
        .expect("the wait failed");

        assert_eq!(reached, shipped);
        assert_eq!(
            *phases.lock().expect("phases"),
            vec![
                MigrationPhase::Waiting {
                    holder_member_id: owner.member_id.clone(),
                    until
                },
                MigrationPhase::Done
            ]
        );
        assert_eq!(*looks.lock().expect("looks"), 2);

        // a migration the database refuses: the lease is released and the version stays.
        store
            .record_schema_version(&workspace_id, shipped - 1, AT + 3)
            .await
            .expect("the older version again");

        let refusing = ScriptedServer::start(
            as_it_stood()
                .into_iter()
                .chain([ScriptedResponse::new(
                    200,
                    json!({ "results": [{ "type": "error", "error": { "message": "no" } }] })
                        .to_string(),
                )])
                .collect(),
        )
        .await;
        let (facts, held) = facts_of(&store, &member, &workspace_id).await;
        let failed = upgrade(
            Pending {
                store: &store,
                session: &member,
                facts: &facts,
                held: &held,
                pipeline: &Pipeline::at(&refusing.url("")),
                account: no_platform(),
            },
            &lease,
            || async {},
            |_| {},
            || AT + 4,
        )
        .await;

        assert!(
            matches!(
                failed,
                Err(Error::Refused {
                    reason: crate::error::RefusalReason::DatabaseRefused,
                    ..
                })
            ),
            "{failed:?}"
        );
        assert!(
            store
                .migration_lease(&workspace_id)
                .await
                .expect("the row")
                .is_none()
        );

        let (facts, _) = facts_of(&store, &member, &workspace_id).await;

        assert_eq!(facts.schema_version, shipped - 1);
    }

    /// The production authority reads the row back out of the pipeline's answer, in the shape the
    /// database sends it: the second result's first row, holder then deadline, each a typed cell.
    #[tokio::test]
    async fn the_pipeline_lease_reads_the_holder_out_of_the_answer() {
        use super::PipelineLease;

        let answer = |holder: &str| {
            json!({ "results": [
                { "type": "ok", "response": { "type": "execute", "result": { "rows": [] } } },
                { "type": "ok", "response": { "type": "execute", "result": { "rows": [[
                    { "type": "text", "value": holder },
                    { "type": "integer", "value": "1757000900000" }
                ]] } } },
                { "type": "ok", "response": { "type": "close" } }
            ] })
            .to_string()
        };
        let primary = ScriptedServer::start(vec![
            ScriptedResponse::new(200, answer("m-1")),
            ScriptedResponse::new(200, answer("m-2")),
            ScriptedResponse::new(200, json!({ "results": [] }).to_string()),
        ])
        .await;
        let lease = PipelineLease::new(Pipeline::at(&primary.url("")), "an-org-credential");

        assert_eq!(
            lease
                .take("ws-1", "m-1", 1_757_000_900_000, 1_757_000_000_000)
                .await
                .expect("the take"),
            LeaseOutcome::Held {
                until: 1_757_000_900_000
            }
        );
        assert_eq!(
            lease
                .take("ws-1", "m-1", 1_757_000_900_000, 1_757_000_000_000)
                .await
                .expect("the take"),
            LeaseOutcome::HeldBy {
                holder_member_id: "m-2".to_string(),
                until: 1_757_000_900_000
            }
        );
        lease.release("ws-1", "m-1").await.expect("the release");

        // what went over: the upsert with its four arguments, the read, and a close, under the
        // organization credential.
        let request = primary.request(0);
        let body: serde_json::Value = serde_json::from_str(&request.body).expect("json");
        let requests = body["requests"].as_array().expect("requests");

        assert_eq!(requests.len(), 3);
        assert!(
            requests[0]["stmt"]["sql"]
                .as_str()
                .expect("sql")
                .contains("ON CONFLICT")
        );
        assert_eq!(
            requests[0]["stmt"]["args"].as_array().expect("args").len(),
            4
        );
        assert_eq!(
            request.header("authorization"),
            Some("Bearer an-org-credential")
        );
        let release: serde_json::Value =
            serde_json::from_str(&primary.request(2).body).expect("json");

        assert!(
            release["requests"][0]["stmt"]["sql"]
                .as_str()
                .expect("sql")
                .starts_with("DELETE FROM \"migration_lease\"")
        );
    }

    /// Requirement 24: a workspace above the shipped version is refused with the two numbers and
    /// what to do, and nothing of it is read. The refusal is a function of the facts alone, so
    /// nothing has touched the replica by the time it answers.
    #[tokio::test]
    async fn a_build_older_than_the_workspace_refuses_to_open_it_and_reads_nothing() {
        let directory = scratch("newer");
        let (store, _, member, workspace_id) = organization(&directory).await;
        let shipped = migrate::shipped_version();

        store
            .record_schema_version(&workspace_id, shipped + 1, AT)
            .await
            .expect("the newer version");

        let (facts, _) = facts_of(&store, &member, &workspace_id).await;
        let refused = refuse_newer(&facts);

        assert!(
            matches!(refused, Err(Error::Refused { reason: crate::error::RefusalReason::WorkspaceNewer, ref message })
                if message.contains(&format!("schema {}", shipped + 1))
                    && message.contains(&format!("knows {shipped}"))
                    && message.contains("update rentable")),
            "{refused:?}"
        );
        assert!(
            !is_pending(&facts),
            "a newer workspace is not a pending migration"
        );
    }

    /// **Ticket 28's second criterion.** A member holding the lease copies the workspace before
    /// the first statement: over the pipeline and under the credential the migration goes over,
    /// to a file of its own, which opened as a plain SQLite file holds every table and row the
    /// workspace held; and on the owner's account, where this machine holds it, a protected copy
    /// seeded from the workspace database.
    #[tokio::test]
    async fn a_pending_migration_copies_the_workspace_as_it_stood_before_applying() {
        let directory = scratch("copied");
        let (store, owner, _, workspace_id) = organization(&directory).await;
        let shipped = migrate::shipped_version();

        store
            .record_schema_version(&workspace_id, shipped - 1, AT)
            .await
            .expect("the older version");

        let (facts, held) = facts_of(&store, &owner, &workspace_id).await;
        let platform = InMemoryPlatform::new("an-org");

        platform.holding_unprotected(&facts.database_name);

        let pipeline = copied_then_applied().await;
        let reached = upgrade(
            Pending {
                store: &store,
                session: &owner,
                facts: &facts,
                held: &held,
                pipeline: &Pipeline::at(&pipeline.url("")),
                account: Some(&platform),
            },
            &StoreLease::new(&store),
            || async {},
            |_| {},
            || AT + 1,
        )
        .await
        .expect("the upgrade failed");

        assert_eq!(reached, shipped);

        // the reads came first, one transaction on one stream under the member's own credential,
        // and then the migration.
        assert_eq!(pipeline.request_count(), READS + MIGRATING);

        for index in 0..READS {
            let request = pipeline.request(index);
            let body: serde_json::Value = serde_json::from_str(&request.body).expect("json");
            let sql = body["requests"][0]["stmt"]["sql"].as_str().expect("sql");
            let expected = match index {
                0 => "BEGIN",
                last if last == READS - 1 => "ROLLBACK",
                _ => "SELECT",
            };

            assert!(
                sql.starts_with(expected),
                "request {index} was not a read: {}",
                request.body
            );
            assert_eq!(
                body["baton"].as_str(),
                (index > 0).then_some("a-baton"),
                "request {index} left the stream"
            );
            assert_eq!(
                request.header("authorization"),
                Some(format!("Bearer {}", held.token).as_str())
            );
        }

        let label = format!("schema-{}-to-{shipped}", shipped - 1);
        let name = format!("{label}-{}.sqlite", AT + 1);

        assert_eq!(copies_of(&directory, &facts), vec![name.clone()]);

        let copy = backup::contents_of(
            &backup::directory_of(&directory, &facts.database_name).join(&name),
        )
        .await;
        let before: Vec<(String, Vec<Vec<turso::Value>>)> = workspace_before()
            .into_iter()
            .map(|(table, _, rows)| (table, rows))
            .collect();

        assert_eq!(copy, before, "the copy is not the workspace as it stood");

        let remote = backup::remote_name(&facts.database_name, &label, (AT + 1) / 1000);

        assert_eq!(
            platform.copies(),
            vec![(facts.database_name.clone(), remote.clone())]
        );
        assert!(
            platform
                .databases()
                .iter()
                .any(|database| database.name == remote && database.delete_protection),
            "the copy on the account is not protected"
        );
    }

    /// **Ticket 28's third criterion.** A copy that cannot be written releases the lease and
    /// refuses with `CopyNotTaken`: no statement of the migration reaches the workspace, its
    /// version stays where it was, and nothing is asked of the account.
    #[tokio::test]
    async fn a_copy_that_cannot_be_written_releases_the_lease_and_applies_nothing() {
        let directory = scratch("copy-refused");
        let (store, owner, _, workspace_id) = organization(&directory).await;
        let shipped = migrate::shipped_version();

        store
            .record_schema_version(&workspace_id, shipped - 1, AT)
            .await
            .expect("the older version");

        // a file where the directory of copies would go, so nothing can be made under it.
        std::fs::write(directory.join(backup::DIRECTORY_NAME), b"in the way")
            .expect("the obstacle");

        let (facts, held) = facts_of(&store, &owner, &workspace_id).await;
        let platform = InMemoryPlatform::new("an-org");

        platform.holding_unprotected(&facts.database_name);

        let pipeline = copied_then_applied().await;
        let refused = upgrade(
            Pending {
                store: &store,
                session: &owner,
                facts: &facts,
                held: &held,
                pipeline: &Pipeline::at(&pipeline.url("")),
                account: Some(&platform),
            },
            &StoreLease::new(&store),
            || async {},
            |_| {},
            || AT + 1,
        )
        .await;

        assert!(
            matches!(
                &refused,
                Err(Error::Refused { reason: RefusalReason::CopyNotTaken, message })
                    if message.contains(
                        &backup::directory_of(&directory, &facts.database_name)
                            .display()
                            .to_string()
                    )
            ),
            "{refused:?}"
        );

        let migration = migrate::statements_between(shipped as usize - 1, shipped as usize);

        for index in 0..pipeline.request_count() {
            let body = pipeline.request(index).body;

            assert!(
                migration
                    .iter()
                    .all(|statement| !body.contains(statement.as_str())),
                "a statement of the migration was sent: {body}"
            );
        }

        assert!(
            store
                .migration_lease(&workspace_id)
                .await
                .expect("the row")
                .is_none(),
            "the lease was held over a copy that failed"
        );

        let (facts, _) = facts_of(&store, &owner, &workspace_id).await;

        assert_eq!(facts.schema_version, shipped - 1);
        assert!(platform.copies().is_empty());
    }

    /// **Ticket 28's fourth criterion.** A copy the account refuses is logged, as
    /// `backup.remoteCopyRefused`, and the migration goes on with the copy on this machine.
    #[tokio::test]
    async fn a_copy_the_account_refuses_leaves_the_migration_going_on() {
        let directory = scratch("remote-copy-refused");
        let (store, owner, _, workspace_id) = organization(&directory).await;
        let shipped = migrate::shipped_version();

        store
            .record_schema_version(&workspace_id, shipped - 1, AT)
            .await
            .expect("the older version");

        let (facts, held) = facts_of(&store, &owner, &workspace_id).await;
        let platform = InMemoryPlatform::new("an-org");

        platform.holding_unprotected(&facts.database_name);
        platform.refuse_next(PlatformError::AccountRefused {
            what: "copy the database",
        });

        let pipeline = copied_then_applied().await;
        let reached = upgrade(
            Pending {
                store: &store,
                session: &owner,
                facts: &facts,
                held: &held,
                pipeline: &Pipeline::at(&pipeline.url("")),
                account: Some(&platform),
            },
            &StoreLease::new(&store),
            || async {},
            |_| {},
            || AT + 1,
        )
        .await
        .expect("a refused copy on the account stopped the migration");

        assert_eq!(reached, shipped);
        assert_eq!(pipeline.request_count(), READS + MIGRATING);
        assert!(platform.copies().is_empty());
        assert_eq!(copies_of(&directory, &facts).len(), 1);

        let (facts, _) = facts_of(&store, &owner, &workspace_id).await;

        assert_eq!(facts.schema_version, shipped);
    }
}
