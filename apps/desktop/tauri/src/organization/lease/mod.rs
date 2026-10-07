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
//! **What opening runs is every step shipped before 857 and every addition** (effort 857, ticket
//! 03). A step declared after 857 as an upgrade can stop somebody, so it waits for the explicit
//! act of a holder of the permission to upgrade; the additions after it still run. The number
//! builds before 857 read, the organization's `workspace.schema_version`, follows the workspace
//! only through the steps shipped before 857, and the level additions take it to is recorded
//! beside its floors in `workspace_floor`, which is what says whether anything is pending here.
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
//! version row commit in one transaction on the workspace database (`apply.rs`), or none of it
//! does, and a failure anywhere releases the lease with the workspace exactly as it was. The
//! organization's record stays what is read before a replica is opened, and is written after the
//! commit as it always was. Where the two disagree, the workspace's row wins: a migration that
//! committed and was never recorded, the machine gone between the two, is found at the shipped
//! version by the next member to open it, who applies nothing and brings only the record up. The
//! copy is still taken first, since which of the two it is can only be read inside the
//! transaction.

pub mod apply;

use std::{future::Future, time::Duration};

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::{
    backup,
    database::floor::{self, Floors, Standing},
    diagnostics,
    error::{Error, RefusalReason},
    http::build_client,
    turso::platform::{AccessLevel, TursoPlatform},
};

use super::workspace::remote::{OverThePipeline, Pipeline};
use super::{
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

/// Requirement 24, as the floor verdict (effort 857, ticket 04): the workspace as the
/// organization's record holds it, judged before anything of it is read.
///
/// **The record's `schema_version` is the workspace's legacy floor**: every build released before
/// effort 857 refuses a number above its own, so it reads as floors equal to it
/// ([`Floors::legacy`]). Below the read floor the workspace is refused as `WorkspaceNewer`, with
/// the two numbers and what to do, which now means exactly that; below the write floor it is
/// let through as [`Standing::ReadOnly`]; otherwise it is [`Standing::Writable`]. The workspace's
/// own floors, which it records beside its version, are judged once its replica has pulled
/// (`workspace/open.rs`).
///
/// **Where the organization records floors for the workspace, they are what is judged**
/// ([`recorded_floors`]): the explicit upgrade moves `schema_version` past every build before 857
/// to stop them, which a build from 857 on, reading the floors, may still read or read-only (effort
/// 857, ticket 07).
pub async fn refuse_newer(
    store: &OrganizationStore,
    facts: &WorkspaceFacts,
) -> Result<Standing, Error> {
    let shipped = apply::shipped_version();
    let floors = recorded_floors(store, &facts.id, facts.schema_version).await?;
    let standing = floors.standing(floor::number(shipped)?);

    if standing == Standing::Unreadable {
        return Err(newer(&facts.name, facts.schema_version, shipped));
    }

    Ok(standing)
}

/// The floors the organization records for a workspace whose `schema_version` is `recorded`: its
/// `workspace_floor` row where a step declared after 857 has run on it, and otherwise the version
/// read as floors equal to it ([`Floors::legacy`]), which is what every build before 857 enforced.
///
/// **The row wins over the version**, since the version is moved past every build before 857 when
/// an upgrade has to stop them (effort 857, ticket 07), and the row is what a build from 857 on
/// is judged by.
pub async fn recorded_floors(
    store: &OrganizationStore,
    workspace_id: &str,
    recorded: i64,
) -> Result<Floors, Error> {
    match store.workspace_floor(workspace_id).await? {
        Some(floors) => Ok(floors),
        None => Ok(Floors::legacy(floor::number(recorded)?)),
    }
}

/// The refusal of a workspace below its read floor: a newer rentable upgraded it, `level` against
/// the `known` step this build ships, and nothing of it was read.
pub fn newer(name: &str, level: i64, known: i64) -> Error {
    Error::refused(
        RefusalReason::WorkspaceNewer,
        format!(
            "{name} was upgraded by a newer rentable (schema {level}, and this one knows {known}). \
             update rentable to open it; nothing in it was read"
        ),
    )
}

/// Whether opening the workspace runs anything on it: a step shipped before 857 or an addition
/// above the level the organization records for it ([`level_of`]), which this build knows. A step
/// declared after 857 as an upgrade is never pending here; it waits for the explicit act (effort
/// 857, ticket 03).
pub async fn is_pending(store: &OrganizationStore, facts: &WorkspaceFacts) -> Result<bool, Error> {
    is_pending_over(&apply::SHIPPED, store, facts).await
}

/// [`is_pending`] over `migrations`, a ladder of a test's own under test.
pub async fn is_pending_over(
    migrations: &apply::Migrations,
    store: &OrganizationStore,
    facts: &WorkspaceFacts,
) -> Result<bool, Error> {
    let level = level_of(store, &facts.id, facts.schema_version).await?;

    Ok(pending_from(migrations, level))
}

/// Whether a workspace at `level` has anything opening runs above it.
fn pending_from(migrations: &apply::Migrations, level: u32) -> bool {
    !migrations.steps.on_open(level, &[]).is_empty()
}

/// The level the organization records for a workspace: its `workspace_floor` row's, where a step
/// declared after 857 has run on it, and otherwise its `schema_version`, `recorded`. Every step
/// opening runs up to it has run, since whoever took it there ran every one it knew (ticket 03).
async fn level_of(
    store: &OrganizationStore,
    workspace_id: &str,
    recorded: i64,
) -> Result<u32, Error> {
    let recorded = floor::number(recorded)?;

    Ok(store
        .workspace_floor(workspace_id)
        .await?
        .map_or(recorded, |floors| floors.level.max(recorded)))
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

/// Run on a workspace every step opening it runs, under a lease, or wait while another member
/// does: each step shipped before 857, as 0.20 ran them, and each addition declared after
/// (effort 857, ticket 03). A step declared after 857 as an upgrade is left for the explicit act,
/// and the additions after it still run.
///
/// The steps go over `pending.held`, the member's own credential on the workspace, because any
/// member may hold the lease. `wait` is how the client sleeps between looks while somebody else
/// holds it, and `report` is told each phase. Answers the `schema_version` the organization
/// records for the workspace when it returns.
///
/// **That number is what builds before 857 read, and an addition never moves it**: it follows the
/// workspace only as far as the last step shipped before 857 ([`Steps::settled`]). Past that, the
/// first step to run records the floors in the workspace and in the organization's
/// `workspace_floor`, as they were read before it with the level the steps took it to.
///
/// The workspace is copied once the lease is held and before anything is applied (ticket 28): a
/// copy that cannot be written releases the lease and refuses with `CopyNotTaken`.
///
/// [`Steps::settled`]: crate::database::step::Steps::settled
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
    upgrade_over(&apply::SHIPPED, pending, lease, wait, report, now).await
}

/// [`upgrade`] over `migrations`, a ladder of a test's own under test.
pub async fn upgrade_over<L, W, F, R, P>(
    migrations: &apply::Migrations,
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
    let known = migrations.steps.known();
    let settled = i64::from(migrations.steps.settled());
    let mut recorded = facts.schema_version;
    let mut level = level_of(store, &facts.id, recorded).await?;

    // a read-only credential cannot write the schema, so a holder of one takes no lease: the
    // lease would be spent on a refusal from the database and held, for as long as that takes,
    // against whoever could apply the migrations. What they are owed is the sentence, and the
    // workspace opens for them once a member with full access has opened it.
    if pending_from(migrations, level) && held.access != AccessLevel::FullAccess {
        return Err(Error::refused(
            RefusalReason::WorkspaceBehind,
            format!(
                "{} is behind this version and read-only access cannot bring it up. ask a member with full access to open it once",
                facts.name
            ),
        ));
    }

    while pending_from(migrations, level) {
        let taken_at = now();
        let until = taken_at + MIGRATION_LEASE_LIFETIME_MS;

        match lease
            .take(&facts.id, &session.member_id, until, taken_at)
            .await?
        {
            LeaseOutcome::Held { until } => {
                report(MigrationPhase::Applying {
                    from: i64::from(level),
                    to: i64::from(known),
                });
                diagnostics::info("organization.migration.applying")
                    .with("workspace", facts.id.as_str())
                    .with("from", level.to_string().as_str())
                    .with("to", known.to_string().as_str())
                    .with("until", until.to_string().as_str())
                    .write();

                // the workspace as it stands, before the first statement, over the pipeline and
                // with the credential the migrations go over. A copy that could not be taken
                // releases the lease at once, as a failed migration does, and nothing is applied.
                let label = format!("schema-{level}-to-{known}");
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

                let brought = apply::bring_up(
                    pipeline,
                    &held.token,
                    migrations,
                    recorded as usize,
                    taken_at,
                )
                .await;

                // the version is recorded and sent before the lease goes: a waiting client
                // breaks its wait the moment the lease is free and reads the version to decide
                // whether to take it, so a lease released first is a window in which the same
                // statements are applied twice. A migration that failed was rolled back whole and
                // releases at once, since it is somebody's to try again and a lease held over a
                // failure would make them wait out the deadline.
                let brought = match brought {
                    Err(refusal) => {
                        release_after(lease, &facts.id, &session.member_id).await;

                        return Err(refusal);
                    }
                    Ok(brought) => brought,
                };

                if brought.ran.is_empty() {
                    // the workspace's own record already said every step this build runs had
                    // run: a migration that committed and was never recorded, and only the
                    // record is brought up.
                    diagnostics::info("organization.migration.alreadyAt")
                        .with("workspace", facts.id.as_str())
                        .with("recorded", level.to_string().as_str())
                        .with("at", brought.version.to_string().as_str())
                        .write();
                } else {
                    diagnostics::info("organization.migration.applied")
                        .with("workspace", facts.id.as_str())
                        .with("from", brought.from.to_string().as_str())
                        .with("to", brought.version.to_string().as_str())
                        .with(
                            "steps",
                            brought
                                .ran
                                .iter()
                                .map(u32::to_string)
                                .collect::<Vec<String>>()
                                .join(",")
                                .as_str(),
                        )
                        .write();
                }

                // the migration has committed, so a record that fails still lets the lease go:
                // held, it would keep everybody else waiting out its deadline over a workspace
                // already brought up, which the next taker finds and records. The number builds
                // before 857 read follows only the steps shipped before 857.
                let legacy = recorded.max(i64::from(brought.version).min(settled));
                let written = async {
                    if legacy != recorded {
                        store
                            .record_schema_version(&facts.id, legacy, now())
                            .await?;
                    }

                    if let Some(floors) = brought.floors
                        && store.workspace_floor(&facts.id).await? != Some(floors)
                    {
                        store
                            .record_workspace_floor(&facts.id, floors, now())
                            .await?;
                    }

                    Ok::<(), Error>(())
                }
                .await;

                if let Err(refusal) = written {
                    release_after(lease, &facts.id, &session.member_id).await;

                    return Err(refusal);
                }

                if !store.push().await {
                    diagnostics::warn("organization.migration.versionNotYetSent")
                        .with("workspace", facts.id.as_str())
                        .write();
                }

                lease.release(&facts.id, &session.member_id).await?;

                recorded = legacy;

                // whatever was run, this client is done: what it could not run waits for the
                // explicit upgrade, or for a build that may write the workspace.
                break;
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

                    recorded = store
                        .workspaces(&session.verifying_key)
                        .await?
                        .into_iter()
                        .find(|workspace| workspace.id == facts.id)
                        .map(|workspace| workspace.schema_version)
                        .unwrap_or(recorded);
                    level = level_of(store, &facts.id, recorded).await?;

                    if !pending_from(migrations, level) {
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

                if pending_from(migrations, level) && now() >= until {
                    // the deadline passed with nothing recorded: the next turn of the loop takes
                    // the lease, because the row's deadline is behind `now`.
                    continue;
                }
            }
        }
    }

    report(MigrationPhase::Done);

    Ok(recorded)
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
    use crate::credential::{CredentialStore, Memory};

    use std::sync::{Arc, Mutex};

    use serde_json::json;

    use super::{
        LeaseAuthority, LeaseOutcome, MIGRATION_LEASE_LIFETIME_MS, MigrationPhase, Pending,
        StoreLease, is_pending, is_pending_over, refuse_newer, upgrade, upgrade_over,
    };
    use crate::test::scratch;
    use crate::{
        backup,
        database::{
            floor::{Floors, Standing},
            step::{FORMAT_STEPS, Kind, Step, Steps, WORKSPACE_STEPS},
        },
        error::{Error, RefusalReason},
        machine::RemoteSyncStore,
        organization::{
            HeldOrganization,
            invitation::{
                AccountAndLink, Invitation, WorkspaceGrant, locator, make_account_and_link,
            },
            lease::apply,
            member::vault::KdfParams,
            role::permission,
            session::{CredentialSlot, MemberSession, WorkspaceFacts, sign_in},
            setup::{CreateOrganization, Remote, create_organization},
            store::OrganizationStore,
            workspace::remote::Pipeline,
            workspace::{create_workspace, openable},
        },
        persisted::Persisted,
        sync::test::{
            pipeline::LocalPipeline,
            server::{ScriptedResponse, ScriptedServer},
        },
        turso::{
            discovery::McpEndpoint,
            platform::{AccessLevel, InMemoryPlatform, account_refused},
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

    /// An organization with one workspace, its owner and a member both signed in and settled.
    async fn organization(
        credentials: &dyn CredentialStore,
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
            .holding(&apply::statements(apply::shipped_version() as usize - 1))
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
        let credentials = Memory::new();
        let directory = scratch("race");
        let (store, owner, member, workspace_id) = organization(&credentials, &directory).await;
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
        let credentials = Memory::new();
        let directory = scratch("pending");
        let (store, owner, member, workspace_id) = organization(&credentials, &directory).await;
        let shipped = apply::shipped_version();

        // the workspace was migrated by an older build: one migration short.
        store
            .record_schema_version(&workspace_id, shipped - 1, AT)
            .await
            .expect("the older version");

        let (facts, held) = facts_of(&store, &member, &workspace_id).await;

        assert!(
            is_pending(&store, &facts)
                .await
                .expect("whether it is pending")
        );
        refuse_newer(&store, &facts)
            .await
            .expect("a pending workspace is not a newer one");

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
            apply::statements_between(shipped as usize - 1, shipped as usize)
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
        assert!(
            !is_pending(&store, &facts)
                .await
                .expect("whether it is pending")
        );
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
        let credentials = Memory::new();
        let directory = scratch("already-at");
        let (store, _, member, workspace_id) = organization(&credentials, &directory).await;
        let shipped = apply::shipped_version();
        let pipeline = LocalPipeline::start().await;

        apply::apply(&Pipeline::at(&pipeline.url("")), "t", shipped as usize)
            .await
            .expect("the migration that committed");
        store
            .record_schema_version(&workspace_id, shipped - 1, AT)
            .await
            .expect("the record left behind");

        let (facts, held) = facts_of(&store, &member, &workspace_id).await;
        let before = pipeline.request_count();

        assert!(
            is_pending(&store, &facts)
                .await
                .expect("whether it is pending")
        );

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
        let credentials = Memory::new();
        let directory = scratch("waiting");
        let (store, owner, member, workspace_id) = organization(&credentials, &directory).await;
        let shipped = apply::shipped_version();

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
        let credentials = Memory::new();
        let directory = scratch("newer");
        let (store, _, member, workspace_id) = organization(&credentials, &directory).await;
        let shipped = apply::shipped_version();

        store
            .record_schema_version(&workspace_id, shipped + 1, AT)
            .await
            .expect("the newer version");

        let (facts, _) = facts_of(&store, &member, &workspace_id).await;
        let refused = refuse_newer(&store, &facts).await;

        assert!(
            matches!(refused, Err(Error::Refused { reason: crate::error::RefusalReason::WorkspaceNewer, ref message })
                if message.contains(&format!("schema {}", shipped + 1))
                    && message.contains(&format!("knows {shipped}"))
                    && message.contains("update rentable")),
            "{refused:?}"
        );
        assert!(
            !is_pending(&store, &facts)
                .await
                .expect("whether it is pending"),
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
        let credentials = Memory::new();
        let directory = scratch("copied");
        let (store, owner, _, workspace_id) = organization(&credentials, &directory).await;
        let shipped = apply::shipped_version();

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
        let credentials = Memory::new();
        let directory = scratch("copy-refused");
        let (store, owner, _, workspace_id) = organization(&credentials, &directory).await;
        let shipped = apply::shipped_version();

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

        let migration = apply::statements_between(shipped as usize - 1, shipped as usize);

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
        let credentials = Memory::new();
        let directory = scratch("remote-copy-refused");
        let (store, owner, _, workspace_id) = organization(&credentials, &directory).await;
        let shipped = apply::shipped_version();

        store
            .record_schema_version(&workspace_id, shipped - 1, AT)
            .await
            .expect("the older version");

        let (facts, held) = facts_of(&store, &owner, &workspace_id).await;
        let platform = InMemoryPlatform::new("an-org");

        platform.holding_unprotected(&facts.database_name);
        platform.refuse_next(account_refused("copy the database"));

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

    /// A member invited by `owner` into `workspace_id` with full access, holding `role`, and
    /// signed in on this machine: a manager, beside the member [`organization`] invites.
    async fn invited(
        store: &OrganizationStore,
        owner: &MemberSession,
        workspace_id: &str,
        username: &str,
        role: &str,
    ) -> MemberSession {
        let link = locator(store, owner).await.expect("the link");
        let invited = make_account_and_link(
            store,
            owner,
            no_platform(),
            &link,
            Invitation {
                username,
                role,
                workspaces: &full(&[workspace_id.to_string()]),
            },
            test_cost(),
            AT,
        )
        .await
        .expect("the invitation");
        let mut session = sign_in(
            store,
            &joined_as(owner, &invited.member_id, role),
            &secret_of(&invited),
            &slot(),
        )
        .await
        .expect("the invited member did not sign in");

        session.must_change_password = false;
        session
    }

    /// A step declared after effort 857, of `kind`.
    const fn after_857(kind: Kind, describes: &'static str) -> Step {
        Step {
            kind,
            describes,
            shipped_before_857: false,
        }
    }

    /// An upgrade declared after effort 857, raising the write floor to `number`.
    const fn later_upgrade(number: u32) -> Step {
        after_857(
            Kind::Upgrade {
                read_floor: None,
                write_floor: Some(number),
                needs_owner: false,
            },
            "aLaterUpgrade",
        )
    }

    /// An addition declared after effort 857.
    const ADDITION: Step = after_857(Kind::Addition, "aLaterAddition");

    /// A fake addition's SQL: a table, and a column that may be empty on a table that has rows.
    const ADDITION_SQL: &str = "CREATE TABLE `receipt_note` (`id` text PRIMARY KEY NOT NULL, \
                                `note` text);--> statement-breakpoint\n\
                                ALTER TABLE `payment` ADD `memo` text;";

    /// A fake upgrade's SQL: a renamed column, which an older build would write to in vain.
    const UPGRADE_SQL: &str = "ALTER TABLE `payment` RENAME COLUMN `note` TO `remark`;";

    /// The shipped workspace ladder with `later` after it: a ladder of the test's own, since no
    /// step declared after 857 has shipped yet.
    fn workspace_ladder(later: &[(&'static str, &'static str, Step)]) -> apply::Migrations {
        let files: Vec<(&'static str, &'static str)> = apply::WORKSPACE_MIGRATIONS
            .iter()
            .copied()
            .chain(later.iter().map(|(name, sql, _)| (*name, *sql)))
            .collect();
        let declared: Vec<Step> = WORKSPACE_STEPS
            .iter()
            .copied()
            .chain(later.iter().map(|(_, _, step)| *step))
            .collect();

        apply::Migrations {
            files: Box::leak(files.into_boxed_slice()),
            steps: Steps {
                first: 1,
                declared: Box::leak(declared.into_boxed_slice()),
            },
        }
    }

    /// The shipped changes of format with `later` after them.
    fn format_ladder(later: &[Step]) -> Steps {
        let declared: Vec<Step> = FORMAT_STEPS
            .iter()
            .copied()
            .chain(later.iter().copied())
            .collect();

        Steps {
            first: 2,
            declared: Box::leak(declared.into_boxed_slice()),
        }
    }

    /// The integers `sql` reads off the workspace database behind `pipeline`, row by row.
    async fn read_off(pipeline: &LocalPipeline, sql: &str) -> Vec<Vec<i64>> {
        use sqlx::Row;

        let mut connection = pipeline.connection().await;
        let rows = sqlx::query(sqlx::AssertSqlSafe(sql))
            .fetch_all(&mut connection)
            .await
            .unwrap_or_else(|error| panic!("{sql}: {error}"));

        rows.iter()
            .map(|row| (0..row.len()).map(|at| row.get::<i64, _>(at)).collect())
            .collect()
    }

    /// The tables, and the columns of `table`, on the workspace database behind `pipeline`.
    async fn shape_of(pipeline: &LocalPipeline, table: &str) -> (Vec<String>, Vec<String>) {
        use sqlx::Row;

        let mut connection = pipeline.connection().await;
        let tables = sqlx::query("SELECT name FROM sqlite_master WHERE type = 'table'")
            .fetch_all(&mut connection)
            .await
            .expect("the tables")
            .iter()
            .map(|row| row.get::<String, _>(0))
            .collect();
        let columns = sqlx::query(sqlx::AssertSqlSafe(format!(
            "SELECT name FROM pragma_table_info('{table}')"
        )))
        .fetch_all(&mut connection)
        .await
        .expect("the columns")
        .iter()
        .map(|row| row.get::<String, _>(0))
        .collect();

        (tables, columns)
    }

    /// The workspace opened by `session` on a build shipping `migrations`: the lease taken on the
    /// organization's own store, the copy taken, and whatever opening runs, run. Answers the
    /// `schema_version` the organization records for it afterwards.
    async fn opened_by(
        store: &OrganizationStore,
        session: &MemberSession,
        workspace_id: &str,
        pipeline: &LocalPipeline,
        migrations: &apply::Migrations,
    ) -> i64 {
        let (facts, held) = facts_of(store, session, workspace_id).await;

        upgrade_over(
            migrations,
            Pending {
                store,
                session,
                facts: &facts,
                held: &held,
                pipeline: &Pipeline::at(&pipeline.url("")),
                account: no_platform(),
            },
            &StoreLease::new(store),
            || async {},
            |_| {},
            || AT + 1,
        )
        .await
        .expect("the workspace did not open")
    }

    /// **Ticket 03's first criterion, the workspace.** A workspace at 5 and one at 6, behind steps
    /// shipped before 857, open on this build exactly as on 0.20: the first full-access member to
    /// open it, a member here, runs every step to 7 under the lease, the organization's record
    /// follows to 7, and nothing of effort 857's records is written into either.
    #[tokio::test]
    async fn a_workspace_behind_a_step_shipped_before_857_is_brought_up_by_the_first_member() {
        for behind in [5_i64, 6] {
            let credentials = Memory::new();
            let directory = scratch(&format!("shipped-{behind}"));
            let (store, _, member, workspace_id) = organization(&credentials, &directory).await;
            let pipeline = LocalPipeline::start().await;

            apply::apply(&Pipeline::at(&pipeline.url("")), "t", behind as usize)
                .await
                .expect("the workspace as an older build left it");
            store
                .record_schema_version(&workspace_id, behind, AT)
                .await
                .expect("the older version");

            let (facts, _) = facts_of(&store, &member, &workspace_id).await;

            assert!(
                is_pending(&store, &facts).await.expect("pending"),
                "{behind}"
            );

            let reached =
                opened_by(&store, &member, &workspace_id, &pipeline, &apply::SHIPPED).await;

            assert_eq!(reached, 7, "{behind}");
            assert_eq!(
                read_off(&pipeline, "SELECT version FROM schema_version").await,
                vec![vec![7]],
                "{behind}"
            );

            let (tables, payment) = shape_of(&pipeline, "payment").await;

            assert!(
                payment.iter().any(|column| column == "direction"),
                "{behind}"
            );
            assert!(
                !tables
                    .iter()
                    .any(|table| table == "applied_step" || table == "data_floor"),
                "{behind}: a record of 857 was written into a workspace only 0.20's steps reached"
            );

            let (facts, _) = facts_of(&store, &member, &workspace_id).await;

            assert_eq!(facts.schema_version, 7, "{behind}");
            assert!(
                !is_pending(&store, &facts).await.expect("pending"),
                "{behind}"
            );
            assert_eq!(
                store
                    .workspace_floor(&workspace_id)
                    .await
                    .expect("the floor"),
                None,
                "{behind}"
            );
        }
    }

    /// **Ticket 03's second and fourth criteria.** A workspace and an organization whose only
    /// pending step is an addition declared after 857, opened on this build by a member, and
    /// again from the start by a manager. The addition is applied to the workspace under the
    /// lease and moves neither legacy number; `data_floor` and `workspace_floor` hold the level it
    /// took the workspace to beside the floors read before it; the organization is completed by
    /// any member with `format` left at 3 and `organization_floor` written the same way; and both
    /// are read-write, the rows in place, and nothing pending after.
    #[tokio::test]
    async fn a_pending_addition_arrives_for_a_member_and_a_manager_and_moves_no_floor() {
        for role in [permission::MEMBER, permission::MANAGER] {
            let credentials = Memory::new();
            let directory = scratch(&format!("addition-{role}"));
            let (store, owner, _, workspace_id) = organization(&credentials, &directory).await;
            let store = store.declaring(format_ladder(&[ADDITION]));
            let opener = invited(&store, &owner, &workspace_id, "nadia.opens", role).await;
            let migrations = workspace_ladder(&[("0007_fake_addition", ADDITION_SQL, ADDITION)]);
            let pipeline = LocalPipeline::start().await;

            apply::apply(&Pipeline::at(&pipeline.url("")), "t", 7)
                .await
                .expect("the workspace at 7");
            pipeline
                .holding(&[
                    "INSERT INTO `tenant` (`id`, `national_id`, `name`, `phone`) \
                     VALUES ('t-1', '1000', 'Sami', '0500')"
                        .to_string(),
                ])
                .await;

            let (facts, _) = facts_of(&store, &opener, &workspace_id).await;

            assert!(
                is_pending_over(&migrations, &store, &facts)
                    .await
                    .expect("pending"),
                "{role}"
            );

            // the organization, as the pull completes it on any member's machine.
            assert!(
                store.complete_schema().await.expect("the completion"),
                "{role}"
            );
            assert_eq!(store.format().await.expect("the format"), Some(3), "{role}");
            assert_eq!(
                store.floors().await.expect("the floors"),
                Some(Floors {
                    level: 4,
                    read: 3,
                    write: 3
                }),
                "{role}"
            );
            assert_eq!(
                store.refuse_another_format().await.expect("readable"),
                Standing::Writable,
                "{role}"
            );
            assert!(
                !store.complete_schema().await.expect("the completion"),
                "{role}: the organization was completed twice"
            );

            // the workspace, as opening it runs the addition under the lease.
            let reached = opened_by(&store, &opener, &workspace_id, &pipeline, &migrations).await;

            assert_eq!(reached, 7, "{role}: the legacy number moved");

            let (tables, payment) = shape_of(&pipeline, "payment").await;

            assert!(tables.iter().any(|table| table == "receipt_note"), "{role}");
            assert!(payment.iter().any(|column| column == "memo"), "{role}");
            assert_eq!(
                read_off(&pipeline, "SELECT version FROM schema_version").await,
                vec![vec![8]],
                "{role}"
            );
            assert!(
                read_off(&pipeline, "SELECT step FROM applied_step")
                    .await
                    .is_empty(),
                "{role}: a step at or under the version is listed"
            );
            assert_eq!(
                read_off(&pipeline, "SELECT level, read, write FROM data_floor").await,
                vec![vec![8, 7, 7]],
                "{role}"
            );
            assert_eq!(
                read_off(&pipeline, "SELECT count(*) FROM tenant").await,
                vec![vec![1]],
                "{role}: a row went"
            );

            let floors = Floors {
                level: 8,
                read: 7,
                write: 7,
            };
            let (facts, _) = facts_of(&store, &opener, &workspace_id).await;

            assert_eq!(facts.schema_version, 7, "{role}");
            assert_eq!(
                store
                    .workspace_floor(&workspace_id)
                    .await
                    .expect("the floor"),
                Some(floors),
                "{role}"
            );
            assert_eq!(
                floors.standing(migrations.steps.known()),
                Standing::Writable
            );
            assert_eq!(
                refuse_newer(&store, &facts).await.expect("readable"),
                Standing::Writable
            );
            assert!(
                !is_pending_over(&migrations, &store, &facts)
                    .await
                    .expect("pending"),
                "{role}"
            );

            // read-write: the workspace takes a write in the shape the addition made.
            pipeline
                .holding(&[
                    "INSERT INTO `receipt_note` (`id`, `note`) VALUES ('r-1', 'paid')".to_string(),
                ])
                .await;
        }
    }

    /// **Ticket 03's last criterion.** A workspace and an organization whose pending steps are an
    /// upgrade declared after 857 and an addition declared after it: opening runs nothing of the
    /// upgrade, still runs the addition, lists it in `applied_step` above a version that stays at
    /// 7, and leaves both read-write with both floors and both legacy numbers where they were.
    #[tokio::test]
    async fn a_later_upgrade_waits_and_the_addition_after_it_still_arrives() {
        let credentials = Memory::new();
        let directory = scratch("later-upgrade");
        let (store, _, member, workspace_id) = organization(&credentials, &directory).await;
        let store = store.declaring(format_ladder(&[later_upgrade(4), ADDITION]));
        let migrations = workspace_ladder(&[
            ("0007_fake_upgrade", UPGRADE_SQL, later_upgrade(8)),
            ("0008_fake_addition", ADDITION_SQL, ADDITION),
        ]);
        let pipeline = LocalPipeline::start().await;

        apply::apply(&Pipeline::at(&pipeline.url("")), "t", 7)
            .await
            .expect("the workspace at 7");

        // the organization: completed, its format left at 3, and the level past the upgrade.
        assert!(store.complete_schema().await.expect("the completion"));
        assert_eq!(store.format().await.expect("the format"), Some(3));
        assert_eq!(
            store.floors().await.expect("the floors"),
            Some(Floors {
                level: 5,
                read: 3,
                write: 3
            })
        );
        assert_eq!(
            store.refuse_another_format().await.expect("readable"),
            Standing::Writable
        );

        // the workspace: the upgrade passed over, the addition run.
        let reached = opened_by(&store, &member, &workspace_id, &pipeline, &migrations).await;

        assert_eq!(reached, 7);

        let (tables, payment) = shape_of(&pipeline, "payment").await;

        assert!(
            payment.iter().any(|column| column == "note")
                && !payment.iter().any(|column| column == "remark"),
            "the upgrade ran: {payment:?}"
        );
        assert!(tables.iter().any(|table| table == "receipt_note"));
        assert!(payment.iter().any(|column| column == "memo"));
        assert_eq!(
            read_off(&pipeline, "SELECT version FROM schema_version").await,
            vec![vec![7]]
        );
        assert_eq!(
            read_off(&pipeline, "SELECT step FROM applied_step").await,
            vec![vec![9]]
        );
        assert_eq!(
            read_off(&pipeline, "SELECT level, read, write FROM data_floor").await,
            vec![vec![9, 7, 7]]
        );

        let (facts, _) = facts_of(&store, &member, &workspace_id).await;
        let floors = Floors {
            level: 9,
            read: 7,
            write: 7,
        };

        assert_eq!(facts.schema_version, 7);
        assert_eq!(
            store
                .workspace_floor(&workspace_id)
                .await
                .expect("the floor"),
            Some(floors)
        );
        assert_eq!(
            floors.standing(migrations.steps.known()),
            Standing::Writable
        );
        assert_eq!(
            refuse_newer(&store, &facts).await.expect("readable"),
            Standing::Writable
        );
        assert!(
            !is_pending_over(&migrations, &store, &facts)
                .await
                .expect("pending")
        );

        // a second opening runs nothing, and sends nothing to the workspace.
        let before = pipeline.request_count();

        assert_eq!(
            opened_by(&store, &member, &workspace_id, &pipeline, &migrations).await,
            7
        );
        assert_eq!(pipeline.request_count(), before);
    }
}
