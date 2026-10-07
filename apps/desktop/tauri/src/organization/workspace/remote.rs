//! a workspace reached on Turso over its database's `/v2/pipeline`, rather than through a replica
//! on this machine.
//!
//! **One client for every request a workspace's database is sent directly.** A migration applies
//! its schema over it (`lease/apply.rs`), a copy before a migration reads the workspace over it
//! (`backup.rs`, through [`OverThePipeline`]'s `Source`), and a workspace that is not open on this
//! machine is read and written over it (effort 846, requirement 15): [`query`] and [`batch`],
//! which the shell's `workspace_query` and `workspace_batch` commands run. *The client was
//! `lease/apply.rs`'s until effort 846, ticket 11, which moved it here to serve all three.*
//!
//! **No file, no switch.** A workspace reached here leaves nothing on this machine: no replica is
//! named, the window's open workspace is not touched, and what is read goes back to the caller and
//! nowhere else. That is why it needs Turso reachable: unreachable is `Error::Network`, naming the
//! workspace, and nothing was read or written.
//!
//! **What is reached is the signed record's, with the credential already unsealed.** The caller
//! names a workspace by its id and never a host or a token ([[rules/credentials]], *Client
//! boundary*): [`reach`] reads the hostname and the schema version off the workspace's verified
//! row, and the credential off the session the vault opened, so nothing is minted and a member who
//! is not the owner reaches what their grant reaches. A read-only grant's token is read-only at
//! Turso as well, which is where a write under it is refused. Before anything is sent it refuses a
//! workspace the reader holds no grant on, one a newer build upgraded, and one behind this build,
//! which opening once on this machine brings up to date.
//!
//! **Rows come back as `database/proxy.rs` answers them**: each cell decoded from the pipeline's
//! typed JSON into the storage class the database holds it in ([`decoded`]), and then through the
//! proxy's own mapping, so a workspace read here and one read through its replica answer alike. A
//! single statement may not open or close a transaction, as the proxy refuses; a batch runs between
//! `BEGIN` and `COMMIT` in one request, each step only where the one before it went, and rolls
//! back where one did not.
//!
//! **A credential Turso refuses is collected again, once** ([`reached`]): the organization replica
//! is pulled and the grants read again, as the heartbeat does after a lock-out, and the request is
//! sent once more under the credential that moved. Where nothing moved, or the second answer is
//! the same, it refuses.

use std::{sync::PoisonError, time::Duration};

use base64::Engine as _;
use serde_json::{Value, json};

use crate::{
    backup,
    database::proxy::{self, SQLQuery, SQLRow},
    diagnostics,
    error::{Error, RefusalReason},
    http::build_client,
    organization::{
        lease,
        session::{self, MemberSession, WorkspaceCredential, WorkspaceFacts},
        store::OrganizationStore,
    },
    turso::platform::AccessLevel,
};

/// The longest any one request may take: a whole schema, or a whole workspace's records, has to
/// arrive, and a pipeline that hung would leave the caller waiting on nothing.
const TIMEOUT: Duration = Duration::from_secs(120);

/// Where a database's pipeline endpoint is. A value so a test can point the runner at a scripted
/// server; production derives it from the hostname the Platform API answered with.
#[derive(Clone, Debug)]
pub struct Pipeline {
    url: String,
}

impl Pipeline {
    /// `https://<hostname>/v2/pipeline`, which is where a Turso database takes statements.
    pub fn of(hostname: &str) -> Self {
        Self {
            url: format!("https://{hostname}/v2/pipeline"),
        }
    }

    /// The endpoint, for the lease that posts to the organization database's own.
    pub fn url(&self) -> &str {
        &self.url
    }

    #[cfg(test)]
    pub(crate) fn at(base: &str) -> Self {
        Self {
            url: format!("{base}/v2/pipeline"),
        }
    }
}

/// How a stream's failures name a workspace's database.
const WORKSPACE_DATABASE: &str = "the workspace database";

/// How a stream's failures name the organization's database.
const ORGANIZATION_DATABASE: &str = "the organization database";

/// One statement, as the pipeline takes it.
pub(crate) fn execute(sql: &str) -> Value {
    json!({ "type": "execute", "stmt": { "sql": sql } })
}

/// Which of `results` the database refused first, where it refused one.
pub(crate) fn refused_at(results: &[Value]) -> Option<usize> {
    results
        .iter()
        .position(|result| result.get("type").and_then(Value::as_str) != Some("ok"))
}

/// The rows the `index`th of `results` read, each a list of the pipeline's typed cells.
pub(crate) fn rows_of(results: &[Value], index: usize) -> Vec<Value> {
    results
        .get(index)
        .and_then(|result| result.pointer("/response/result/rows"))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
}

/// A workspace read, migrated or reached over its pipeline, on one stream held by its baton.
///
/// **One stream, held across requests by its baton.** The pipeline keeps a stream open between
/// requests when a request does not close it, and answers a baton naming it, which the next
/// request hands back; so `BEGIN` in the first request and everything after it are one
/// transaction, however many requests it takes. Where an answer names a `base_url`, the requests
/// after it go there, which is how the stream stays on the server holding it. A copy reads over
/// it (effort 838, tickets 28 and 30), and its last request rolls back and closes; a migration
/// writes over it (`lease/apply.rs`), and its last request commits and closes; a workspace reached
/// from its card sends one request and closes it ([`query`], [`batch`]).
pub(crate) struct OverThePipeline<'a> {
    pipeline: &'a Pipeline,
    token: &'a str,
    stream: std::sync::Mutex<Stream>,
    /// what the stream is for, as the failures say it: `its copy`, `its migration`, `its
    /// upgrade`, or the workspace's name.
    doing: String,
    /// which database the failures name: the workspace's, or the organization's for the
    /// organization's upgrade and its copy (effort 857, ticket 24).
    database: &'static str,
    /// whether a 401 or a 403 is the credential's ([`Error::Credential`]), which the caller
    /// collects again, rather than the database's refusal, which a migration and a copy say.
    credential_refusals: bool,
}

/// Where a stream stands between two requests.
#[derive(Default)]
struct Stream {
    /// what the last answer named the stream by; none before the first request.
    baton: Option<String>,
    /// where the last answer said the stream's requests go, where it said.
    base_url: Option<String>,
}

impl<'a> OverThePipeline<'a> {
    /// A stream a copy reads the workspace over.
    pub(crate) fn new(pipeline: &'a Pipeline, token: &'a str) -> Self {
        Self::doing(pipeline, token, "its copy", false)
    }

    /// A stream a migration is applied over.
    pub(crate) fn migrating(pipeline: &'a Pipeline, token: &'a str) -> Self {
        Self::doing(pipeline, token, "its migration", false)
    }

    /// A stream the organization's upgrade runs over, at its database's primary (effort 857,
    /// ticket 24, `organization/upgrade/primary.rs`).
    pub(crate) fn upgrading(pipeline: &'a Pipeline, token: &'a str) -> Self {
        Self::doing(pipeline, token, "its upgrade", false).of_the_organization()
    }

    /// A stream the copy of the organization taken before its upgrade reads it over.
    pub(crate) fn copying_the_organization(pipeline: &'a Pipeline, token: &'a str) -> Self {
        Self::new(pipeline, token).of_the_organization()
    }

    /// The same stream, its failures naming the organization's database.
    fn of_the_organization(self) -> Self {
        Self {
            database: ORGANIZATION_DATABASE,
            ..self
        }
    }

    /// A stream a workspace that is not open is read or written over, under the member's own
    /// credential, which Turso refusing is said as the credential's.
    fn reaching(pipeline: &'a Pipeline, token: &'a str, name: &str) -> Self {
        Self::doing(pipeline, token, name, true)
    }

    fn doing(
        pipeline: &'a Pipeline,
        token: &'a str,
        doing: &str,
        credential_refusals: bool,
    ) -> Self {
        Self {
            pipeline,
            token,
            stream: std::sync::Mutex::new(Stream::default()),
            doing: doing.to_string(),
            database: WORKSPACE_DATABASE,
            credential_refusals,
        }
    }

    /// Send `requests` on the stream, closing it after them where `close` says, and answer the
    /// result of each, in order, for the caller to read statement by statement.
    pub(crate) async fn exchanged(
        &self,
        requests: Vec<Value>,
        close: bool,
    ) -> Result<Vec<Value>, Error> {
        let doing = self.doing.as_str();
        let database = self.database;
        let (url, baton) = {
            let stream = self.stream.lock().unwrap_or_else(PoisonError::into_inner);
            let url = stream.base_url.as_deref().map_or_else(
                || self.pipeline.url.clone(),
                |base| format!("{}/v2/pipeline", base.trim_end_matches('/')),
            );

            (url, stream.baton.clone())
        };
        let mut requests = requests;

        if close {
            requests.push(json!({ "type": "close" }));
        }

        let client = build_client(TIMEOUT)?;
        let response = client
            .post(&url)
            .bearer_auth(self.token)
            .json(&json!({ "baton": baton, "requests": requests }))
            .send()
            .await
            .map_err(|error| Error::Network {
                message: format!("{database} could not be reached for {doing} ({error})"),
            })?;
        let status = response.status();

        if !status.is_success() {
            // the stream is gone with a request the server would not take.
            *self.stream.lock().unwrap_or_else(PoisonError::into_inner) = Stream::default();

            if self.credential_refusals
                && matches!(
                    status,
                    reqwest::StatusCode::UNAUTHORIZED | reqwest::StatusCode::FORBIDDEN
                )
            {
                return Err(Error::Credential {
                    message: format!(
                        "{database} refused the credential held for {doing} ({status})"
                    ),
                });
            }

            return Err(Error::refused(
                RefusalReason::DatabaseRefused,
                format!("{database} refused {doing} ({status})"),
            ));
        }

        let answered: Value = response.json().await.map_err(|_| Error::Integrity {
            message: format!(
                "{database} answered {doing} with something this application cannot \
                 read"
            ),
        })?;
        let baton = answered
            .get("baton")
            .and_then(Value::as_str)
            .map(str::to_string);
        let results = answered
            .get("results")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();

        {
            let mut stream = self.stream.lock().unwrap_or_else(PoisonError::into_inner);

            stream.baton = baton.clone();

            if let Some(base_url) = answered.get("base_url").and_then(Value::as_str) {
                stream.base_url = Some(base_url.to_string());
            }
        }

        // a refusal is the caller's to read and say; a stream that closed with nothing refused
        // is one the rest of the work has nowhere to go.
        if baton.is_none() && !close && refused_at(&results).is_none() {
            return Err(Error::Integrity {
                message: format!("{database} closed the stream of {doing} before it was done"),
            });
        }

        if results.len() < requests.len() && refused_at(&results).is_none() {
            return Err(Error::Integrity {
                message: format!("{database} answered {doing} with fewer results than it was sent"),
            });
        }

        Ok(results)
    }

    /// Send `sql` on the stream, closing it after where `close` says, and answer the rows it
    /// read, each a list of the pipeline's typed cells.
    async fn sent(&self, sql: &str, close: bool) -> Result<Vec<Value>, Error> {
        let results = self.exchanged(vec![execute(sql)], close).await?;

        if refused_at(&results) == Some(0) {
            return Err(Error::refused(
                RefusalReason::DatabaseRefused,
                format!("{} refused to be read for {}", self.database, self.doing),
            ));
        }

        Ok(rows_of(&results, 0))
    }

    /// Whether the server holds the stream open for another request.
    fn open(&self) -> bool {
        self.stream
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .baton
            .is_some()
    }

    /// Roll back and close a stream a migration failed on, where it is open: the workspace is then
    /// as it was. A rollback that cannot be sent is logged and not raised over the failure that
    /// caused it; the server rolls back a stream it lets go of in any case.
    pub(crate) async fn abandoned(&self) {
        if !self.open() {
            return;
        }

        if let Err(error) = self.exchanged(vec![execute("ROLLBACK")], true).await {
            diagnostics::warn("organization.migrate.rollbackNotSent")
                .with("error", error.to_string())
                .write();
        }
    }
}

impl backup::Source for OverThePipeline<'_> {
    async fn begin(&self) -> Result<(), Error> {
        self.sent("BEGIN", false).await?;

        Ok(())
    }

    async fn read(&self, sql: &str) -> Result<Vec<Vec<turso::Value>>, Error> {
        self.sent(sql, false)
            .await?
            .iter()
            .map(decoded_row)
            .collect()
    }

    async fn end(&self) -> Result<(), Error> {
        // a stream that was never opened, or that the server has already let go, has nothing to
        // roll back.
        if self.open() {
            self.sent("ROLLBACK", true).await?;
        }

        Ok(())
    }
}

/// Every row the `index`th of `results` read, each cell as the value the database holds.
pub(crate) fn decoded_rows(
    results: &[Value],
    index: usize,
) -> Result<Vec<Vec<turso::Value>>, Error> {
    rows_of(results, index).iter().map(decoded_row).collect()
}

/// One row of the pipeline's answer, each cell as the value the database holds.
pub(crate) fn decoded_row(row: &Value) -> Result<Vec<turso::Value>, Error> {
    row.as_array()
        .ok_or_else(|| unreadable("a row"))?
        .iter()
        .map(decoded)
        .collect()
}

/// A typed cell as the pipeline sends it: `null`; `integer` with its value as a string, since
/// JSON cannot carry every 64-bit integer; `float` as a number; `text`; and `blob` as base64,
/// with or without its padding.
pub(crate) fn decoded(cell: &Value) -> Result<turso::Value, Error> {
    let value = cell.get("value");

    match cell.get("type").and_then(Value::as_str) {
        Some("null") => Ok(turso::Value::Null),
        Some("integer") => value
            .and_then(|value| {
                value
                    .as_str()
                    .and_then(|text| text.parse().ok())
                    .or_else(|| value.as_i64())
            })
            .map(turso::Value::Integer)
            .ok_or_else(|| unreadable("an integer")),
        Some("float") => value
            .and_then(Value::as_f64)
            .map(turso::Value::Real)
            .ok_or_else(|| unreadable("a real")),
        Some("text") => value
            .and_then(Value::as_str)
            .map(|text| turso::Value::Text(text.to_string()))
            .ok_or_else(|| unreadable("a text")),
        Some("blob") => cell
            .get("base64")
            .and_then(Value::as_str)
            .and_then(|encoded| {
                base64::engine::general_purpose::STANDARD_NO_PAD
                    .decode(encoded.trim_end_matches('='))
                    .ok()
            })
            .map(turso::Value::Blob)
            .ok_or_else(|| unreadable("a blob")),
        _ => Err(unreadable("a value")),
    }
}

/// The failure of a read that answered `what` in a shape this application cannot read: a row, a
/// cell of a storage class it does not know, or a value that does not parse as its class says.
pub(crate) fn unreadable(what: &str) -> Error {
    Error::Integrity {
        message: format!("the database answered with {what} this application cannot read"),
    }
}

/// A value bound to a statement, as the pipeline takes it: the encoding [`decoded`] reads.
pub(crate) fn argument(value: turso::Value) -> Value {
    match value {
        turso::Value::Null => json!({ "type": "null" }),
        turso::Value::Integer(integer) => {
            json!({ "type": "integer", "value": integer.to_string() })
        }
        turso::Value::Real(real) => json!({ "type": "float", "value": real }),
        turso::Value::Text(text) => json!({ "type": "text", "value": text }),
        turso::Value::Blob(bytes) => json!({
            "type": "blob",
            "base64": base64::engine::general_purpose::STANDARD_NO_PAD.encode(bytes),
        }),
    }
}

/// One statement of the web layer's, its values bound by the rules the proxy binds them by.
fn statement(query: &SQLQuery) -> Value {
    json!({
        "sql": query.sql,
        "args": proxy::workspace_params(&query.params)
            .into_iter()
            .map(argument)
            .collect::<Vec<Value>>(),
    })
}

/// What one statement answered, as the proxy answers it: one row per row, each carrying the
/// statement's column names, and each cell mapped as `proxy.rs` maps a replica's.
fn answered_rows(result: Option<&Value>) -> Result<Vec<SQLRow>, Error> {
    let columns: Vec<String> = result
        .and_then(|result| result.get("cols"))
        .and_then(Value::as_array)
        .map(|columns| {
            columns
                .iter()
                .map(|column| {
                    column
                        .get("name")
                        .and_then(Value::as_str)
                        .unwrap_or_default()
                        .to_string()
                })
                .collect()
        })
        .unwrap_or_default();

    result
        .and_then(|result| result.get("rows"))
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or_default()
        .iter()
        .map(|row| {
            Ok(SQLRow {
                columns: columns.clone(),
                rows: decoded_row(row)?
                    .into_iter()
                    .map(proxy::workspace_value)
                    .collect(),
            })
        })
        .collect()
}

/// What the database said refusing a statement, in its own words.
fn refusal_of(error: Option<&Value>) -> String {
    error
        .and_then(|error| error.get("message"))
        .and_then(Value::as_str)
        .unwrap_or("refused")
        .to_string()
}

/// A workspace that is not open on this machine, as [`reach`] found it on the signed record: what
/// it is, the credential the session holds on it, and where its database takes statements.
pub(crate) struct Reach {
    facts: WorkspaceFacts,
    credential: WorkspaceCredential,
    pipeline: Pipeline,
}

impl Reach {
    fn stream(&self) -> OverThePipeline<'_> {
        OverThePipeline::reaching(&self.pipeline, &self.credential.token, &self.facts.name)
    }

    /// `failure` as the reader is told it: a Turso this machine could not reach says so, naming
    /// the workspace, and everything else is as it was.
    fn said(&self, failure: Error) -> Error {
        match failure {
            Error::Network { message } => Error::Network {
                message: format!(
                    "{} is read from turso, which this machine could not reach, so nothing was \
                     read or written. try again once it is online ({message})",
                    self.facts.name
                ),
            },
            other => other,
        }
    }
}

/// Find the workspace `workspace_id` names on the signed record, for `session`, and refuse it
/// before anything is sent where it cannot be reached: no grant, a schema newer than this build,
/// or a schema behind it. `pipeline_of` is where a hostname takes statements, which a test points
/// at a loopback server.
pub(crate) async fn reach(
    store: &OrganizationStore,
    session: &MemberSession,
    workspace_id: &str,
    pipeline_of: impl Fn(&str) -> Pipeline,
) -> Result<Reach, Error> {
    reach_over(
        &lease::apply::SHIPPED,
        store,
        session,
        workspace_id,
        pipeline_of,
    )
    .await
}

/// [`reach`] over `migrations`, a ladder of a test's own under test.
pub(crate) async fn reach_over(
    migrations: &lease::apply::Migrations,
    store: &OrganizationStore,
    session: &MemberSession,
    workspace_id: &str,
    pipeline_of: impl Fn(&str) -> Pipeline,
) -> Result<Reach, Error> {
    session.settled()?;

    let workspaces = store.workspaces(&session.verifying_key).await?;
    let (facts, credential) = super::openable(session, &workspaces, &[], workspace_id)?
        .ok_or_else(|| {
            Error::refused(
                RefusalReason::NoGrant,
                "you hold no grant on that workspace",
            )
        })?;

    lease::refuse_newer(store, &facts).await?;

    // a workspace behind this build is brought up by opening it, under the lease, which this
    // path never takes: what is read here would be in a shape this build was not written for,
    // and what is written would be refused by it. A read-only grant cannot bring it up even then,
    // and reads it as it is where nothing pending is a step a reader needs (effort 857, ticket
    // 37), since a read-only grant writes nothing here either.
    let reads_as_it_is = credential.access != AccessLevel::FullAccess
        && !lease::holds_a_reader_over(migrations, store, &facts).await?;

    if !reads_as_it_is && lease::is_pending_over(migrations, store, &facts).await? {
        return Err(if credential.access == AccessLevel::FullAccess {
            Error::refused(
                RefusalReason::WorkspaceNeedsOpening,
                format!(
                    "{} is behind this version of rentable. open it once on this machine to bring \
                     it up to date; nothing in it was read or written",
                    facts.name
                ),
            )
        } else {
            Error::refused(
                RefusalReason::WorkspaceBehind,
                format!(
                    "{} is behind this version and read-only access cannot bring it up. ask a \
                     member with full access to open it once",
                    facts.name
                ),
            )
        });
    }

    Ok(Reach {
        pipeline: pipeline_of(&facts.database_hostname),
        facts,
        credential,
    })
}

/// Whether [`reached`] asks for the credential the session holds, or for one collected again.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Collect {
    Held,
    Again,
}

/// Collect again what the organization database holds for `session`: the replica pulled, and the
/// grants read and unsealed again, as the heartbeat does after a refused replication.
pub(crate) async fn collect_again(
    store: &OrganizationStore,
    session: &mut MemberSession,
) -> Result<(), Error> {
    store.pull().await;
    session::refresh_credentials(store, session).await?;

    Ok(())
}

/// Where [`reached`] finds the workspace: the signed-in member's session behind the shell's
/// locks, or a test's own session.
pub(crate) trait Resolve {
    /// The workspace, as [`reach`] finds it, under the credential the session holds or one
    /// collected again first.
    fn reach(&mut self, collect: Collect) -> impl Future<Output = Result<Reach, Error>> + Send;
}

/// What is sent to a workspace reached on Turso: one statement ([`query`]) or a batch
/// ([`batch`]).
pub(crate) trait Statements: Sync {
    type Answer: Send;

    fn sent(&self, reach: &Reach) -> impl Future<Output = Result<Self::Answer, Error>> + Send;
}

impl Statements for SQLQuery {
    type Answer = Vec<SQLRow>;

    fn sent(&self, reach: &Reach) -> impl Future<Output = Result<Self::Answer, Error>> + Send {
        query(reach, self)
    }
}

impl Statements for [SQLQuery] {
    type Answer = Vec<Vec<SQLRow>>;

    fn sent(&self, reach: &Reach) -> impl Future<Output = Result<Self::Answer, Error>> + Send {
        batch(reach, self)
    }
}

/// Send `statements` to the workspace `resolver` reaches, and where Turso refuses the credential,
/// reach it once more having collected the credentials again, and send them once more where the
/// credential moved. A credential that did not move, or that is refused a second time, refuses.
pub(crate) async fn reached<S: Statements + ?Sized>(
    resolver: &mut (impl Resolve + Send),
    statements: &S,
) -> Result<S::Answer, Error> {
    let held = resolver.reach(Collect::Held).await?;

    match statements.sent(&held).await {
        Err(Error::Credential { .. }) => {
            let again = resolver.reach(Collect::Again).await?;
            let refused = |reach: &Reach| Error::Credential {
                message: format!(
                    "turso refused the credential this machine holds for {}, and collecting it \
                     again did not help. nothing was read or written",
                    reach.facts.name
                ),
            };

            if again.credential.token == held.credential.token {
                return Err(refused(&again));
            }

            match statements.sent(&again).await {
                Err(Error::Credential { .. }) => Err(refused(&again)),
                other => other,
            }
        }
        other => other,
    }
}

/// Run one statement on the workspace and answer its rows, as the proxy runs one on a replica. A
/// statement that would open or close a transaction is refused before anything is sent.
pub(crate) async fn query(reach: &Reach, query: &SQLQuery) -> Result<Vec<SQLRow>, Error> {
    proxy::reject_transaction_control(&query.sql)?;

    let results = reach
        .stream()
        .exchanged(
            vec![json!({ "type": "execute", "stmt": statement(query) })],
            true,
        )
        .await
        .map_err(|failure| reach.said(failure))?;
    let result = results.first();

    if result.and_then(|result| result.get("type")) != Some(&json!("ok")) {
        return Err(Error::Database {
            message: format!(
                "Error executing '{}': {}",
                query.sql,
                refusal_of(result.and_then(|result| result.get("error")))
            ),
        });
    }

    answered_rows(result.and_then(|result| result.pointer("/response/result")))
}

/// Run `queries` on the workspace as one transaction and answer each one's rows, as the proxy runs
/// a batch on a replica: `BEGIN`, each statement only where the one before it went, and `COMMIT`,
/// or `ROLLBACK` where any of them did not. One request, closed, so the server holds nothing open
/// after it whatever it answered. A step that would open or close a transaction of its own is
/// refused before anything is sent, as [`query`] refuses one: the batch's own `BEGIN` and `COMMIT`
/// are the only ones it carries.
pub(crate) async fn batch(reach: &Reach, queries: &[SQLQuery]) -> Result<Vec<Vec<SQLRow>>, Error> {
    for query in queries {
        proxy::reject_transaction_control(&query.sql)?;
    }

    let after = |step: usize| json!({ "type": "ok", "step": step });
    let committed = queries.len() + 1;
    let steps: Vec<Value> =
        std::iter::once(json!({ "stmt": { "sql": "BEGIN" } }))
            .chain(queries.iter().enumerate().map(
                |(index, query)| json!({ "stmt": statement(query), "condition": after(index) }),
            ))
            .chain([
                json!({ "stmt": { "sql": "COMMIT" }, "condition": after(committed - 1) }),
                json!({
                    "stmt": { "sql": "ROLLBACK" },
                    "condition": { "type": "not", "cond": after(committed) },
                }),
            ])
            .collect();
    let results = reach
        .stream()
        .exchanged(
            vec![json!({ "type": "batch", "batch": { "steps": steps } })],
            true,
        )
        .await
        .map_err(|failure| reach.said(failure))?;
    let answered = results.first();

    if answered.and_then(|result| result.get("type")) != Some(&json!("ok")) {
        return Err(Error::Database {
            message: format!(
                "the batch was refused, and nothing of it was kept: {}",
                refusal_of(answered.and_then(|result| result.get("error")))
            ),
        });
    }

    let batch = answered.and_then(|result| result.pointer("/response/result"));
    let step = |field: &str, index: usize| {
        batch
            .and_then(|batch| batch.get(field))
            .and_then(|answers| answers.get(index))
            .filter(|answer| !answer.is_null())
    };

    // the first step that did not go, which every step after it did not run behind. The
    // statement is quoted as the proxy quotes it: it is the web layer's own, and never a value.
    if let Some(index) = (0..=committed).find(|index| {
        step("step_errors", *index).is_some() || step("step_results", *index).is_none()
    }) {
        let what = match index {
            0 => "BEGIN",
            at if at == committed => "COMMIT",
            at => queries[at - 1].sql.as_str(),
        };

        return Err(Error::Database {
            message: format!(
                "Error executing '{what}': {}, and nothing of the batch was kept",
                refusal_of(step("step_errors", index))
            ),
        });
    }

    (1..committed)
        .map(|index| answered_rows(step("step_results", index)))
        .collect()
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use serde_json::{Value, json};

    use super::{Collect, OverThePipeline, Pipeline, Reach, Resolve, batch, query, reach, reached};
    use crate::{
        backup,
        credential::Memory,
        database::proxy::{SQLQuery, execute_single_sql},
        error::{Error, RefusalReason},
        machine::RemoteSyncStore,
        organization::{
            member::vault::KdfParams,
            session::{CredentialSlot, MemberSession, sign_in},
            setup::{CreateOrganization, Remote, create_organization},
            store::OrganizationStore,
            workspace::create_workspace,
        },
        persisted::Persisted,
        sync::test::{
            pipeline::LocalPipeline,
            server::{RecordedRequest, ScriptedResponse, ScriptedServer},
        },
        test::scratch,
        turso::{discovery::McpEndpoint, platform::InMemoryPlatform},
    };

    const PASSWORD: &str = "the owners password";

    /// An organization a first run made in `directory`, its owner signed in, and one workspace at
    /// the shipped schema whose database is `pipeline`: what the signed record says of it, with the
    /// owner's credential on it in the session.
    async fn holding_a_workspace(
        directory: &std::path::Path,
        pipeline: &LocalPipeline,
    ) -> (OrganizationStore, MemberSession, String) {
        let credentials = Memory::new();
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
        let slot: CredentialSlot = Arc::new(Mutex::new(None));
        let (_, organization) = create_organization(
            &credentials,
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
            KdfParams {
                memory_kib: 1024,
                iterations: 2,
                lanes: 1,
            },
            1_757_000_000_000,
        )
        .await
        .expect("the first run failed");
        let joined = store.selected().cloned().expect("the record");
        let mut owner = sign_in(&organization, &joined, PASSWORD, &slot)
            .await
            .expect("the owner did not sign in");
        let facts = create_workspace(
            &organization,
            &mut owner,
            &platform,
            |_| Pipeline::at(&pipeline.url("")),
            "North",
            1_757_000_000_000,
        )
        .await
        .expect("the create failed");

        (organization, owner, facts.id)
    }

    /// What `reach` found, pointed at `pipeline` whatever the hostname, with the hostname it was
    /// asked for kept in `asked`.
    async fn reached_at(
        store: &OrganizationStore,
        owner: &MemberSession,
        workspace_id: &str,
        pipeline: &LocalPipeline,
        asked: &Mutex<Vec<String>>,
    ) -> Result<Reach, Error> {
        reach(store, owner, workspace_id, |hostname| {
            asked.lock().expect("asked").push(hostname.to_string());
            Pipeline::at(&pipeline.url(""))
        })
        .await
    }

    fn sql(text: &str, params: Vec<Value>) -> SQLQuery {
        SQLQuery {
            sql: text.to_string(),
            params,
        }
    }

    fn body(request: &RecordedRequest) -> Value {
        serde_json::from_str(&request.body).expect("json")
    }

    /// Every file under `directory`, by its path relative to it.
    fn files_under(directory: &std::path::Path) -> Vec<String> {
        fn walk(root: &std::path::Path, at: &std::path::Path, found: &mut Vec<String>) {
            for entry in std::fs::read_dir(at).expect("readable") {
                let path = entry.expect("an entry").path();

                if path.is_dir() {
                    walk(root, &path, found);
                } else {
                    found.push(
                        path.strip_prefix(root)
                            .expect("under the root")
                            .display()
                            .to_string(),
                    );
                }
            }
        }

        let mut found = Vec::new();

        walk(directory, directory, &mut found);
        found.sort();
        found
    }

    /// **Ticket 11's first criterion.** A statement goes to the pipeline of the hostname the
    /// signed workspace record names, with the credential the owner's session unsealed for it,
    /// and to nowhere else; and neither command leaves a file in the data directory (the fifth).
    #[tokio::test]
    async fn a_statement_goes_to_the_records_hostname_with_the_members_token_and_leaves_no_file() {
        let directory = scratch("remote-host");
        let pipeline = LocalPipeline::start().await;
        let (store, owner, workspace_id) = holding_a_workspace(&directory, &pipeline).await;
        let workspaces = store
            .workspaces(&owner.verifying_key)
            .await
            .expect("the rows");
        let hostname = workspaces[0].database_hostname.clone();
        let token = owner.workspace_credentials[&workspace_id].token.clone();
        let before = pipeline.request_count();
        let files = files_under(&directory);
        let asked = Mutex::new(Vec::new());
        let target = reached_at(&store, &owner, &workspace_id, &pipeline, &asked)
            .await
            .expect("the workspace was not reached");

        batch(
            &target,
            &[sql(
                "INSERT INTO `complex` (`id`, `name`, `location`) VALUES (?, ?, ?)",
                vec![json!("c-1"), json!("North Towers"), json!("Riyadh")],
            )],
        )
        .await
        .expect("the batch");

        let rows = query(&target, &sql("SELECT `name` FROM `complex`", vec![]))
            .await
            .expect("the query");

        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].rows, vec![json!("North Towers")]);
        assert_eq!(*asked.lock().expect("asked"), vec![hostname]);
        assert_eq!(pipeline.request_count(), before + 2);

        for index in before..before + 2 {
            let request = pipeline.request(index);

            assert_eq!(request.target, "/v2/pipeline");
            assert_eq!(
                request.header("authorization"),
                Some(format!("Bearer {token}").as_str())
            );
        }

        assert_eq!(files_under(&directory), files, "a file was left behind");
    }

    /// The statements both ends are asked, and the fixture they are asked of: every storage class,
    /// an integer past 2^31, a real, text, a null and a blob, an aggregate, bound values, and a
    /// value that contradicts its column.
    const FIXTURE: &[&str] = &[
        "create table v (i integer, r real, t text, b blob, n text)",
        "insert into v (i, r, t, b, n) values (7, 1.5, 'seven', x'0102', null)",
        "insert into v (i, r, t, b, n) values (1757000000000, 2.25, 'eleven', x'ff00', null)",
        "insert into v (i, r, t, b, n) values (-9007199254740993, 1e300, 'خالد', x'', null)",
        "create table w (amount real)",
        "insert into w (amount) values ('not a number')",
    ];

    fn questions() -> Vec<SQLQuery> {
        vec![
            sql("select i, r, t, b, n from v order by i", vec![]),
            sql("select count(*), sum(r), max(t), min(b) from v", vec![]),
            sql("select i from v where t = ?", vec![json!("eleven")]),
            sql(
                "select i, t from v where i > ? and r > ? and n is null order by i",
                vec![json!(2_147_483_648_i64), json!(1.75)],
            ),
            sql(
                "select ? as flag, ? as absent",
                vec![json!(true), Value::Null],
            ),
            sql("select amount from w", vec![]),
            sql("select i from v where i = -1", vec![]),
        ]
    }

    /// **Ticket 11's second criterion.** A statement read over the pipeline answers exactly what
    /// `database/proxy.rs` answers for it on a plain SQLite: integers past 2^31, reals, text,
    /// null and blobs, aggregates and bound values, column names and all.
    #[tokio::test]
    async fn values_map_as_the_proxy_maps_them() {
        let directory = scratch("remote-values");
        let pipeline = LocalPipeline::start().await;
        let (store, owner, workspace_id) = holding_a_workspace(&directory, &pipeline).await;
        let local = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(sqlx::sqlite::SqliteConnectOptions::new().in_memory(true))
            .await
            .expect("in-memory pool");

        pipeline
            .holding(
                &FIXTURE
                    .iter()
                    .map(|line| line.to_string())
                    .collect::<Vec<_>>(),
            )
            .await;

        for line in FIXTURE {
            sqlx::query(sqlx::AssertSqlSafe(*line))
                .execute(&local)
                .await
                .expect("fixture");
        }

        let target = reached_at(&store, &owner, &workspace_id, &pipeline, &Mutex::default())
            .await
            .expect("reached");

        for question in questions() {
            let text = question.sql.clone();
            let expected = execute_single_sql(&local, sql(&text, question.params.clone()))
                .await
                .unwrap_or_else(|error| panic!("sqlx refused '{text}': {error}"));
            let remote = query(&target, &question)
                .await
                .unwrap_or_else(|error| panic!("the pipeline refused '{text}': {error}"));

            assert_eq!(remote, expected, "the two disagreed about '{text}'");
        }

        let batched = batch(&target, &questions()).await.expect("the batch");

        for (question, rows) in questions().into_iter().zip(batched) {
            let text = question.sql.clone();
            let expected = execute_single_sql(&local, question).await.expect("sqlx");

            assert_eq!(rows, expected, "the batch disagreed about '{text}'");
        }

        // past 2^31 and past 2^53 both arrive as the integer they are.
        let wide = query(&target, &sql("select i from v order by i", vec![]))
            .await
            .expect("the query");

        assert_eq!(wide[0].rows, vec![json!(-9_007_199_254_740_993_i64)]);
        assert_eq!(wide[2].rows, vec![json!(1_757_000_000_000_i64)]);
    }

    /// **Ticket 11's third criterion.** A batch is `BEGIN`, its steps each behind the one before,
    /// and `COMMIT`, in one closed request; a step that fails keeps none of the steps before it,
    /// and names the one that failed. A single statement that opens or closes a transaction is
    /// refused before anything is sent.
    #[tokio::test]
    async fn a_batch_runs_between_begin_and_commit_and_rolls_back_on_a_failing_step() {
        let directory = scratch("remote-batch");
        let pipeline = LocalPipeline::start().await;
        let (store, owner, workspace_id) = holding_a_workspace(&directory, &pipeline).await;

        pipeline
            .holding(&["create table t (id integer primary key)".to_string()])
            .await;

        let target = reached_at(&store, &owner, &workspace_id, &pipeline, &Mutex::default())
            .await
            .expect("reached");
        let inserting = |ids: &[i64]| {
            ids.iter()
                .map(|id| sql("insert into t (id) values (?)", vec![json!(id)]))
                .collect::<Vec<_>>()
        };
        let count = async || {
            query(&target, &sql("select count(*) from t", vec![]))
                .await
                .expect("count")[0]
                .rows
                .clone()
        };

        batch(&target, &inserting(&[1, 2]))
            .await
            .expect("a batch of two distinct inserts was refused");
        assert_eq!(count().await, vec![json!(2)]);

        let sent = body(&pipeline.request(pipeline.request_count() - 2));
        let steps: Vec<&str> = sent["requests"][0]["batch"]["steps"]
            .as_array()
            .expect("steps")
            .iter()
            .map(|step| step["stmt"]["sql"].as_str().expect("sql"))
            .collect();

        assert_eq!(
            steps,
            vec![
                "BEGIN",
                "insert into t (id) values (?)",
                "insert into t (id) values (?)",
                "COMMIT",
                "ROLLBACK"
            ]
        );
        assert_eq!(sent["requests"][1]["type"], "close");
        assert_eq!(sent["baton"], Value::Null);

        let refused = batch(&target, &inserting(&[3, 1, 4])).await;

        assert!(
            matches!(&refused, Err(Error::Database { message })
                if message.contains("insert into t") && message.contains("nothing of the batch")),
            "{refused:?}"
        );
        assert_eq!(
            count().await,
            vec![json!(2)],
            "the insert before the failing one was kept, so the batch is not one unit"
        );

        let requests = pipeline.request_count();

        for control in ["BEGIN", "commit", "  ROLLBACK"] {
            let refused = query(&target, &sql(control, vec![])).await;

            assert!(
                matches!(refused, Err(Error::InvalidInput { .. })),
                "{control}: {refused:?}"
            );
        }

        assert_eq!(pipeline.request_count(), requests, "a transaction was sent");
    }

    /// **Effort 846, ticket 28.** A batch with a step that opens or closes a transaction of its
    /// own is refused before anything is sent, as a single statement is: a `COMMIT` in a step
    /// would end the batch's transaction and leave the steps after it running outside one.
    #[tokio::test]
    async fn a_batch_with_a_step_that_opens_or_closes_a_transaction_is_refused_with_nothing_sent() {
        let directory = scratch("remote-batch-control");
        let pipeline = LocalPipeline::start().await;
        let (store, owner, workspace_id) = holding_a_workspace(&directory, &pipeline).await;
        let target = reached_at(&store, &owner, &workspace_id, &pipeline, &Mutex::default())
            .await
            .expect("reached");
        let requests = pipeline.request_count();

        for control in ["COMMIT", "begin", "  ROLLBACK"] {
            let refused = batch(
                &target,
                &[
                    sql("SELECT 1", vec![]),
                    sql(control, vec![]),
                    sql("SELECT 2", vec![]),
                ],
            )
            .await;

            assert!(
                matches!(refused, Err(Error::InvalidInput { .. })),
                "{control}: {refused:?}"
            );
        }

        assert_eq!(pipeline.request_count(), requests, "a batch was sent");
    }

    /// **Ticket 11's fourth criterion, the refusals before anything is sent.** A workspace the
    /// reader holds no grant on; one a newer build upgraded; and one behind this build, which
    /// opening once on this machine brings up to date, or which a read-only grant is told to ask a
    /// member with full access to open. Nothing reaches the pipeline for any of them.
    #[tokio::test]
    async fn a_workspace_with_no_grant_or_another_schema_is_refused_before_any_request() {
        let directory = scratch("remote-refusals");
        let pipeline = LocalPipeline::start().await;
        let (store, mut owner, workspace_id) = holding_a_workspace(&directory, &pipeline).await;
        let requests = pipeline.request_count();
        let reason = |result: Result<Reach, Error>| match result {
            Err(Error::Refused { reason, message }) => (reason, message),
            Err(other) => panic!("not a refusal: {other:?}"),
            Ok(_) => panic!("reached"),
        };

        let (no_grant, _) =
            reason(reached_at(&store, &owner, "ws-nobody", &pipeline, &Mutex::default()).await);

        assert_eq!(no_grant, RefusalReason::NoGrant);

        let shipped = crate::organization::lease::apply::shipped_version();

        // the organization's record of a workspace a build before 857 created: its version, and no
        // floor record, which this build writes at creation and which would be judged instead.
        store
            .connection()
            .execute(
                "DELETE FROM \"workspace_floor\" WHERE \"workspace_id\" = ?",
                vec![turso::Value::Text(workspace_id.clone())],
            )
            .await
            .expect("the record a build before 857 leaves");

        // the version is outside the signature, recorded by whichever member migrated it.
        store
            .record_schema_version(&workspace_id, shipped + 1, 1_757_000_000_001)
            .await
            .expect("the version");

        let (newer, _) =
            reason(reached_at(&store, &owner, &workspace_id, &pipeline, &Mutex::default()).await);

        assert_eq!(newer, RefusalReason::WorkspaceNewer);

        store
            .record_schema_version(&workspace_id, shipped - 1, 1_757_000_000_002)
            .await
            .expect("the version");

        let (behind, message) =
            reason(reached_at(&store, &owner, &workspace_id, &pipeline, &Mutex::default()).await);

        assert_eq!(behind, RefusalReason::WorkspaceNeedsOpening);
        assert!(
            message.contains("open it once on this machine"),
            "{message}"
        );

        owner
            .workspace_credentials
            .get_mut(&workspace_id)
            .expect("held")
            .access = crate::turso::platform::AccessLevel::ReadOnly;

        // behind a step a reader needs, the last one shipped before 857: a read-only grant is let
        // past a step a reader does not need, which is all a workspace at `shipped - 1` is behind
        // while `0007` is the last step this build ships (effort 857, ticket 37).
        store
            .record_schema_version(
                &workspace_id,
                i64::from(crate::organization::lease::apply::SHIPPED.steps.settled()) - 1,
                1_757_000_000_003,
            )
            .await
            .expect("the version");

        let (read_only, _) =
            reason(reached_at(&store, &owner, &workspace_id, &pipeline, &Mutex::default()).await);

        assert_eq!(read_only, RefusalReason::WorkspaceBehind);
        assert_eq!(pipeline.request_count(), requests, "a request was sent");
    }

    /// **Ticket 11's fourth criterion, unreachable.** A Turso this machine cannot reach is
    /// `Error::Network`, naming the workspace and saying nothing was read or written, for a
    /// statement and for a batch alike.
    #[tokio::test]
    async fn an_unreachable_turso_says_so_naming_the_workspace() {
        let directory = scratch("remote-unreachable");
        let pipeline = LocalPipeline::start().await;
        let (store, owner, workspace_id) = holding_a_workspace(&directory, &pipeline).await;
        let dropping =
            ScriptedServer::start(vec![ScriptedResponse::hangup(), ScriptedResponse::hangup()])
                .await;
        let target = reach(&store, &owner, &workspace_id, |_| {
            Pipeline::at(&dropping.url(""))
        })
        .await
        .expect("reached");

        for failed in [
            query(&target, &sql("select 1", vec![])).await.map(|_| ()),
            batch(&target, &[sql("select 1", vec![])]).await.map(|_| ()),
        ] {
            assert!(
                matches!(&failed, Err(Error::Network { message })
                    if message.starts_with("North ")
                        && message.contains("nothing was read or written")),
                "{failed:?}"
            );
        }
    }

    /// The owner's session, reached at `url` whatever the hostname, collecting the credentials
    /// again where asked, as the shell's own resolver does behind its locks.
    struct Session<'a> {
        store: &'a OrganizationStore,
        owner: &'a mut MemberSession,
        workspace_id: &'a str,
        url: String,
        /// what each look asked for, in order.
        asked: Vec<Collect>,
    }

    impl Resolve for Session<'_> {
        async fn reach(&mut self, collect: Collect) -> Result<Reach, Error> {
            self.asked.push(collect);

            if collect == Collect::Again {
                super::collect_again(self.store, self.owner).await?;
            }

            let url = self.url.clone();

            reach(self.store, self.owner, self.workspace_id, |_| {
                Pipeline::at(&url)
            })
            .await
        }
    }

    /// **Ticket 11's fourth criterion, a refused credential.** A 401 collects the credentials
    /// again, once, and the request goes again under the one that moved; a credential that did not
    /// move, or that is refused again, refuses, after exactly one more request.
    #[tokio::test]
    async fn a_refused_credential_is_collected_again_once() {
        let directory = scratch("remote-collect");
        let held = LocalPipeline::start().await;
        let (store, mut owner, workspace_id) = holding_a_workspace(&directory, &held).await;
        let token = owner.workspace_credentials[&workspace_id].token.clone();
        // the first answer refuses the stale credential, and the rest are the database's.
        let pipeline = LocalPipeline::after(vec![ScriptedResponse::new(401, "")]).await;
        let stale = |owner: &mut MemberSession| {
            // a credential the organization has since re-sealed: the session still holds the
            // old one, and the grant row holds the one that works.
            owner
                .workspace_credentials
                .get_mut(&workspace_id)
                .expect("held")
                .token = "a-rotated-away-token".to_string();
        };

        pipeline
            .holding(&["create table t (id integer primary key)".to_string()])
            .await;
        stale(&mut owner);

        let mut session = Session {
            store: &store,
            owner: &mut owner,
            workspace_id: &workspace_id,
            url: pipeline.url(""),
            asked: Vec::new(),
        };
        let rows = reached(&mut session, &sql("select count(*) from t", vec![]))
            .await
            .expect("the retry under the collected credential");

        assert_eq!(rows[0].rows, vec![json!(0)]);
        assert_eq!(session.asked, vec![Collect::Held, Collect::Again]);
        assert_eq!(pipeline.request_count(), 2);
        assert_eq!(
            pipeline.request(0).header("authorization"),
            Some("Bearer a-rotated-away-token")
        );
        assert_eq!(
            pipeline.request(1).header("authorization"),
            Some(format!("Bearer {token}").as_str())
        );

        // refused under the credential the grant holds as well: one more request, then refused.
        let refusing = ScriptedServer::start(vec![
            ScriptedResponse::new(403, ""),
            ScriptedResponse::new(403, ""),
            ScriptedResponse::new(403, ""),
        ])
        .await;

        stale(&mut owner);

        let refused = reached(
            &mut Session {
                store: &store,
                owner: &mut owner,
                workspace_id: &workspace_id,
                url: refusing.url(""),
                asked: Vec::new(),
            },
            [sql("select 1", vec![])].as_slice(),
        )
        .await;

        assert!(
            matches!(&refused, Err(Error::Credential { message })
                if message.contains("North") && message.contains("collecting it again")),
            "{refused:?}"
        );
        assert_eq!(refusing.request_count(), 2);

        // and a credential that did not move is not sent again: the session already holds the
        // one the grant row holds.
        let unmoved = ScriptedServer::start(vec![
            ScriptedResponse::new(401, ""),
            ScriptedResponse::new(401, ""),
        ])
        .await;
        let refused = reached(
            &mut Session {
                store: &store,
                owner: &mut owner,
                workspace_id: &workspace_id,
                url: unmoved.url(""),
                asked: Vec::new(),
            },
            &sql("select 1", vec![]),
        )
        .await;

        assert!(
            matches!(refused, Err(Error::Credential { .. })),
            "{refused:?}"
        );
        assert_eq!(unmoved.request_count(), 1);
    }

    /// One answer on a stream the pipeline holds open: `rows` of typed cells, the baton, and where
    /// the stream's next requests go.
    fn streamed(rows: Vec<Vec<serde_json::Value>>, base_url: Option<&str>) -> ScriptedResponse {
        ScriptedResponse::new(
            200,
            json!({ "baton": "a-baton", "base_url": base_url, "results": [
                { "type": "ok", "response": { "type": "execute", "result": { "cols": [], "rows": rows } } }
            ] })
            .to_string(),
        )
    }

    fn integer(value: i64) -> serde_json::Value {
        json!({ "type": "integer", "value": value.to_string() })
    }

    fn text(value: &str) -> serde_json::Value {
        json!({ "type": "text", "value": value })
    }

    /// **Ticket 30's third criterion.** A workspace is copied in one transaction on one stream,
    /// the baton handed back and the `base_url` followed, and a table larger than a page is read
    /// a page at a time after the last rowid it has, so no one answer holds the whole table.
    #[tokio::test]
    async fn a_workspace_is_copied_in_one_transaction_a_page_at_a_time() {
        let rows = backup::PAGE + 1;
        let page = |ids: std::ops::Range<usize>| -> Vec<Vec<serde_json::Value>> {
            ids.map(|id| vec![integer(id as i64), integer(id as i64)])
                .collect()
        };
        // where the stream is held, which the first answer names as its `base_url`.
        let held = ScriptedServer::start(vec![
            streamed(
                vec![vec![
                    text("table"),
                    text("note"),
                    text("CREATE TABLE \"note\" (\"id\" INTEGER PRIMARY KEY)"),
                ]],
                None,
            ),
            streamed(vec![vec![integer(rows as i64)]], None),
            streamed(page(1..backup::PAGE + 1), None),
            streamed(page(backup::PAGE + 1..rows + 1), None),
            ScriptedResponse::new(
                200,
                json!({ "baton": null, "base_url": null, "results": [
                    { "type": "ok", "response": { "type": "execute", "result": { "cols": [], "rows": [] } } },
                    { "type": "ok", "response": { "type": "close" } }
                ] })
                .to_string(),
            ),
        ])
        .await;
        let first = ScriptedServer::start(vec![streamed(Vec::new(), Some(&held.url("")))]).await;
        let pipeline = Pipeline::at(&first.url(""));
        let data = crate::test::scratch("migrate-paged");
        let path = backup::local_copy(
            &OverThePipeline::new(&pipeline, "a-token"),
            &data,
            "ws-1",
            "schema-3-to-4",
            1,
        )
        .await
        .expect("the copy");
        let copy = backup::contents_of(&path).await;

        assert_eq!(copy.len(), 1);
        assert_eq!(copy[0].1.len(), rows, "the copy is not the whole table");

        // the transaction opened where the pipeline is, and everything after it went where the
        // stream is held, with its baton.
        assert_eq!(first.request_count(), 1);
        assert_eq!(held.request_count(), 5);

        let body = |request: crate::sync::test::server::RecordedRequest| -> serde_json::Value {
            serde_json::from_str(&request.body).expect("json")
        };
        let opened = body(first.request(0));

        assert_eq!(opened["baton"], serde_json::Value::Null);
        assert_eq!(opened["requests"][0]["stmt"]["sql"], "BEGIN");
        assert_eq!(opened["requests"].as_array().expect("requests").len(), 1);

        let sent: Vec<serde_json::Value> = (0..5).map(|index| body(held.request(index))).collect();

        assert!(sent.iter().all(|sent| sent["baton"] == "a-baton"));

        let sql = |index: usize| {
            sent[index]["requests"][0]["stmt"]["sql"]
                .as_str()
                .expect("sql")
                .to_string()
        };

        assert!(sql(1).starts_with("SELECT COUNT(*)"), "{}", sql(1));
        assert_eq!(sql(2), backup::paging("note", None));
        assert_eq!(sql(3), backup::paging("note", Some(backup::PAGE as i64)));
        assert!(sql(3).contains(&format!("LIMIT {}", backup::PAGE)));
        assert_eq!(sql(4), "ROLLBACK");
        assert_eq!(sent[4]["requests"][1]["type"], "close");
    }

    /// **Effort 857, ticket 24.** The organization's upgrade and its copy reach the
    /// organization's database, and a failure on either names that database, never a workspace's.
    #[tokio::test]
    async fn the_organizations_streams_name_the_organizations_database() {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("a free port");
        let address = listener.local_addr().expect("its address");

        // nothing listens there once it is let go, so every request fails to connect.
        drop(listener);

        let pipeline = Pipeline::at(&format!("http://{address}"));

        for stream in [
            OverThePipeline::upgrading(&pipeline, "t"),
            OverThePipeline::copying_the_organization(&pipeline, "t"),
        ] {
            let failed = stream
                .exchanged(vec![super::execute("SELECT 1")], true)
                .await
                .expect_err("nothing listens");
            let said = failed.to_string();

            assert!(matches!(failed, Error::Network { .. }), "{failed:?}");
            assert!(said.contains("the organization database"), "{said}");
            assert!(!said.contains("workspace"), "{said}");
        }
    }
}
