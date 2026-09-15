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

use std::{future::Future, time::Duration};

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::{diagnostics, error::Error, http::build_client};

use super::{
    migrate::{self, Pipeline},
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
            return Err(Error::PreconditionFailed {
                message: format!(
                    "the organization database refused the migration lease ({status})"
                ),
            });
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
                return Err(Error::PreconditionFailed {
                    message: "the organization database refused the migration lease".to_string(),
                });
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
        return Err(Error::PreconditionFailed {
            message: format!(
                "{} was upgraded by a newer rentable (schema {}, and this one knows {}). update \
                 rentable to open it; nothing in it was read",
                facts.name, facts.schema_version, shipped
            ),
        });
    }

    Ok(())
}

/// Whether the workspace is behind what this build ships.
pub fn is_pending(facts: &WorkspaceFacts) -> bool {
    facts.schema_version < migrate::shipped_version()
}

/// What is being upgraded: the workspace as `openable` handed it over, the member opening it,
/// the credential they hold on it, and where its database takes statements.
pub struct Pending<'a> {
    pub store: &'a OrganizationStore,
    pub session: &'a MemberSession,
    pub facts: &'a WorkspaceFacts,
    pub held: &'a WorkspaceCredential,
    pub pipeline: &'a Pipeline,
}

/// Bring a workspace up to the shipped schema, under a lease, or wait while another member does.
///
/// The migrations go over `pending.held`, the member's own credential on the workspace, because
/// any member may hold the lease. `wait` is how the client sleeps between looks while somebody
/// else holds it, and `report` is told each phase. Answers the version the workspace is at when
/// it returns, which is the shipped one unless the wait ran out.
pub async fn upgrade<L, W, F, R>(
    pending: Pending<'_>,
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
{
    let Pending {
        store,
        session,
        facts,
        held,
        pipeline,
    } = pending;
    let shipped = migrate::shipped_version();
    let mut current = facts.schema_version;

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

                let applied = migrate::apply_between(
                    pipeline,
                    &held.token,
                    current as usize,
                    shipped as usize,
                )
                .await;

                // the lease goes whatever happened: a migration that failed is somebody's to try
                // again, and a lease held over a failure would make them wait out the deadline.
                let released = lease.release(&facts.id, &session.member_id).await;

                applied?;
                released?;

                store
                    .record_schema_version(&facts.id, shipped, now())
                    .await?;

                if !store.push().await {
                    diagnostics::warn("organization.migration.versionNotYetSent")
                        .with("workspace", facts.id.as_str())
                        .write();
                }

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
        error::Error,
        organization::{
            HeldOrganization,
            invite::{Invitation, Invited, WorkspaceGrant, invite_member, organization_link},
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
    fn secret_of(invited: &Invited) -> String {
        crate::organization::invite::vault_password_of(invited, test_cost())
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
        let pipeline = ScriptedServer::start(vec![ScriptedResponse::new(
            200,
            json!({ "results": [] }).to_string(),
        )])
        .await;
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
        let link = organization_link(&store, &owner).await.expect("the link");
        let invited = invite_member(
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

        openable(session, &workspaces, workspace_id)
            .expect("openable")
            .expect("a grant")
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

        let pipeline = ScriptedServer::start(vec![ScriptedResponse::new(
            200,
            json!({ "results": [] }).to_string(),
        )])
        .await;
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

        // one pipeline request, carrying the last migration's statements and a close, under the
        // member's own credential.
        let request = pipeline.request(0);
        let body: serde_json::Value = serde_json::from_str(&request.body).expect("json");
        let sent = body["requests"].as_array().expect("requests").len();

        assert_eq!(
            sent,
            migrate::statements_between(shipped as usize - 1, shipped as usize).len() + 1
        );
        assert_eq!(
            request.header("authorization"),
            Some(format!("Bearer {}", held.token).as_str())
        );

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

        let refusing = ScriptedServer::start(vec![ScriptedResponse::new(
            200,
            json!({ "results": [{ "type": "error", "error": { "message": "no" } }] }).to_string(),
        )])
        .await;
        let (facts, held) = facts_of(&store, &member, &workspace_id).await;
        let failed = upgrade(
            Pending {
                store: &store,
                session: &member,
                facts: &facts,
                held: &held,
                pipeline: &Pipeline::at(&refusing.url("")),
            },
            &lease,
            || async {},
            |_| {},
            || AT + 4,
        )
        .await;

        assert!(
            matches!(failed, Err(Error::PreconditionFailed { .. })),
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
            matches!(refused, Err(Error::PreconditionFailed { ref message })
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
}
