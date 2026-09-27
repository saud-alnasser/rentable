//! applying the workspace schema to a database on the customer's account, over the wire.
//!
//! **A client applies migrations again, and it applies them the way the retired control plane did.** The
//! shipped `.sql` files are embedded by `build.rs` in the order `drizzle-kit` numbers them, split at
//! its statement breakpoints, and posted as one pipeline to the database's own HTTP endpoint,
//! which is `packages/turso-platform/migration.ts` in one function. A sync connection
//! cannot carry them: `0003` drops and renames tables, and the push that follows fails with *no
//! such table*, measured on 2026-08-20 (#552). So they go over `/v2/pipeline`, which
//! `database/test/workspace.rs` had already proved for its own tests, and which is promoted here
//! rather than written a second time.
//!
//! **The pipeline answers 200 with a per-statement result**, so a refused statement is in the body
//! rather than in the status, and reading it is the difference between a schema that was applied
//! and one that was merely sent.
//!
//! What is here is the runner. Which client applies a *pending* migration to a workspace that
//! already has rows, and under what lease, is the migration ticket's; creating a workspace already
//! at the current schema is this.
//!
//! **The same pipeline is what a workspace is copied over** before a pending migration changes it
//! (effort 838, tickets 28 and 30). [`OverThePipeline`] answers `backup.rs` the workspace's schema
//! and rows with the credential the migration goes over, in one transaction on one stream held
//! across requests, each value decoded from the pipeline's typed JSON into the storage class the
//! database holds it in, so the copy keeps integers, reals, text, blobs and nulls apart.

use std::{sync::PoisonError, time::Duration};

use base64::Engine as _;
use serde_json::{Value, json};

use crate::{
    backup,
    error::{Error, RefusalReason},
    http::build_client,
};

include!(concat!(env!("OUT_DIR"), "/workspace-migrations.rs"));

/// `drizzle-kit`'s own separator, which both runners split on.
const STATEMENT_BREAKPOINT: &str = "--> statement-breakpoint";

/// The whole shipped schema has to arrive; a pipeline that hung would leave a workspace half built.
const MIGRATION_TIMEOUT: Duration = Duration::from_secs(120);

/// How many migrations ship, which is what a workspace created here is recorded as being at.
pub fn shipped_version() -> i64 {
    WORKSPACE_MIGRATIONS.len() as i64
}

/// The statements of the first `up_to` shipped migrations, in order.
pub fn statements(up_to: usize) -> Vec<String> {
    statements_between(0, up_to)
}

/// The statements of the shipped migrations after the first `from` and up to `up_to`, in
/// order: what a workspace recorded at `from` needs to reach `up_to`.
pub fn statements_between(from: usize, up_to: usize) -> Vec<String> {
    WORKSPACE_MIGRATIONS
        .iter()
        .take(up_to)
        .skip(from)
        .flat_map(|(_, sql)| {
            sql.split(STATEMENT_BREAKPOINT)
                .map(|statement| statement.trim().to_string())
                .filter(|statement| !statement.is_empty())
                .collect::<Vec<String>>()
        })
        .collect()
}

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

/// Apply the first `up_to` shipped migrations to the database behind `pipeline`, with `token`.
///
/// One request carrying every statement and a close, in order. The token is the short-lived
/// credential minted for the migration and nothing else, and it is spent here and dropped.
pub async fn apply(pipeline: &Pipeline, token: &str, up_to: usize) -> Result<(), Error> {
    apply_between(pipeline, token, 0, up_to).await
}

/// Apply the shipped migrations after the first `from` and up to `up_to`: what a workspace
/// already at `from` needs. `token` is whatever credential the caller holds on the database; a
/// pending migration is applied under the member's own full-access credential, because any member
/// may hold the lease (`organization/migration.rs`).
pub async fn apply_between(
    pipeline: &Pipeline,
    token: &str,
    from: usize,
    up_to: usize,
) -> Result<(), Error> {
    let client = build_client(MIGRATION_TIMEOUT)?;

    let mut requests: Vec<Value> = statements_between(from, up_to)
        .into_iter()
        .map(|sql| json!({ "type": "execute", "stmt": { "sql": sql } }))
        .collect();

    requests.push(json!({ "type": "close" }));

    let response = client
        .post(&pipeline.url)
        .bearer_auth(token)
        .json(&json!({ "requests": requests }))
        .send()
        .await
        .map_err(|error| Error::Network {
            message: format!(
                "the workspace database could not be reached to apply its schema ({error})"
            ),
        })?;

    let status = response.status();

    if !status.is_success() {
        return Err(Error::refused(
            RefusalReason::DatabaseRefused,
            format!(
                "the workspace database refused its schema ({status}). the workspace was not created"
            ),
        ));
    }

    let answered: Value = response.json().await.map_err(|_| Error::Integrity {
        message: "the workspace database answered the schema with something this application \
                  cannot read"
            .to_string(),
    })?;

    if let Some(results) = answered.get("results").and_then(Value::as_array) {
        for (index, result) in results.iter().enumerate() {
            if result.get("type").and_then(Value::as_str) == Some("error") {
                // the statement is not quoted: it is the shipped SQL, and the index names it.
                return Err(Error::refused(
                    RefusalReason::DatabaseRefused,
                    format!(
                        "statement {index} of the workspace schema was refused by the database. \
                         the workspace was not created"
                    ),
                ));
            }
        }
    }

    Ok(())
}

/// A workspace as a copy reads it before a pending migration changes it (effort 838, tickets 28
/// and 30): what the database behind `pipeline` answers, read with `token`, the credential the
/// migration goes over, and never written.
///
/// **One stream, held across requests by its baton.** The pipeline keeps a stream open between
/// requests when a request does not close it, and answers a baton naming it, which the next
/// request hands back; so `BEGIN` in the first request and every read after it are one transaction,
/// and the copy is of one moment however many requests it takes. Where an answer names a
/// `base_url`, the requests after it go there, which is how the stream stays on the server holding
/// it. The last request rolls back and closes. Nothing else here holds a stream: every other
/// request to a pipeline is one request, closed.
pub(crate) struct OverThePipeline<'a> {
    pipeline: &'a Pipeline,
    token: &'a str,
    stream: std::sync::Mutex<Stream>,
}

/// Where the stream a copy reads over stands between two requests.
#[derive(Default)]
struct Stream {
    /// what the last answer named the stream by; none before the first request.
    baton: Option<String>,
    /// where the last answer said the stream's requests go, where it said.
    base_url: Option<String>,
}

impl<'a> OverThePipeline<'a> {
    pub(crate) fn new(pipeline: &'a Pipeline, token: &'a str) -> Self {
        Self {
            pipeline,
            token,
            stream: std::sync::Mutex::new(Stream::default()),
        }
    }

    /// Send `sql` on the stream, closing it after where `close` says, and answer the rows it
    /// read, each a list of the pipeline's typed cells.
    async fn sent(&self, sql: &str, close: bool) -> Result<Vec<Value>, Error> {
        let (url, baton) = {
            let stream = self.stream.lock().unwrap_or_else(PoisonError::into_inner);
            let url = stream.base_url.as_deref().map_or_else(
                || self.pipeline.url.clone(),
                |base| format!("{}/v2/pipeline", base.trim_end_matches('/')),
            );

            (url, stream.baton.clone())
        };
        let mut requests = vec![json!({ "type": "execute", "stmt": { "sql": sql } })];

        if close {
            requests.push(json!({ "type": "close" }));
        }

        let client = build_client(MIGRATION_TIMEOUT)?;
        let response = client
            .post(&url)
            .bearer_auth(self.token)
            .json(&json!({ "baton": baton, "requests": requests }))
            .send()
            .await
            .map_err(|error| Error::Network {
                message: format!(
                    "the workspace database could not be reached to copy it ({error})"
                ),
            })?;
        let status = response.status();

        if !status.is_success() {
            return Err(Error::refused(
                RefusalReason::DatabaseRefused,
                format!("the workspace database refused to be read for its copy ({status})"),
            ));
        }

        let answered: Value = response.json().await.map_err(|_| Error::Integrity {
            message: "the workspace database answered its copy with something this application \n                 cannot read"
                .to_string(),
        })?;
        let baton = answered
            .get("baton")
            .and_then(Value::as_str)
            .map(str::to_string);

        if baton.is_none() && !close {
            return Err(Error::Integrity {
                message: "the workspace database closed the copy's read before it was done"
                    .to_string(),
            });
        }

        {
            let mut stream = self.stream.lock().unwrap_or_else(PoisonError::into_inner);

            stream.baton = baton;

            if let Some(base_url) = answered.get("base_url").and_then(Value::as_str) {
                stream.base_url = Some(base_url.to_string());
            }
        }

        let first = answered
            .pointer("/results/0")
            .ok_or_else(|| Error::Integrity {
                message: "the workspace database answered its copy with no result".to_string(),
            })?;

        if first.get("type").and_then(Value::as_str) == Some("error") {
            return Err(Error::refused(
                RefusalReason::DatabaseRefused,
                "the workspace database refused to be read for its copy",
            ));
        }

        Ok(first
            .pointer("/response/result/rows")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default())
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
        let opened = self
            .stream
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .baton
            .is_some();

        if opened {
            self.sent("ROLLBACK", true).await?;
        }

        Ok(())
    }
}

/// One row of the pipeline's answer, each cell as the value the database holds.
fn decoded_row(row: &Value) -> Result<Vec<turso::Value>, Error> {
    row.as_array()
        .ok_or_else(|| unreadable("a row"))?
        .iter()
        .map(decoded)
        .collect()
}

/// A typed cell as the pipeline sends it: `null`; `integer` with its value as a string, since
/// JSON cannot carry every 64-bit integer; `float` as a number; `text`; and `blob` as base64,
/// with or without its padding.
fn decoded(cell: &Value) -> Result<turso::Value, Error> {
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

/// The failure of a copy's read that answered `what` in a shape this application cannot read: a
/// row, a cell of a storage class it does not know, or a value that does not parse as its class
/// says.
fn unreadable(what: &str) -> Error {
    Error::Integrity {
        message: format!(
            "the workspace database answered its copy with {what} this application cannot read"
        ),
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use crate::sync::test::server::{ScriptedResponse, ScriptedServer};

    use super::{
        OverThePipeline, Pipeline, WORKSPACE_MIGRATIONS, apply, shipped_version, statements,
        statements_between,
    };
    use crate::backup;

    /// A workspace at version `from` needs exactly the migrations after it, and none of the ones
    /// it already has; the whole set is the same as starting from nothing.
    #[test]
    fn the_statements_between_two_versions_are_the_tail_and_nothing_before_it() {
        let all = statements(WORKSPACE_MIGRATIONS.len());
        let first = statements(1);
        let rest = statements_between(1, WORKSPACE_MIGRATIONS.len());

        assert_eq!(first.len() + rest.len(), all.len());
        assert_eq!([first.clone(), rest.clone()].concat(), all);
        assert_eq!(statements_between(0, WORKSPACE_MIGRATIONS.len()), all);
        assert!(
            statements_between(WORKSPACE_MIGRATIONS.len(), WORKSPACE_MIGRATIONS.len()).is_empty()
        );
    }

    /// The embedded set against the directory it was mirrored from: the same guard
    /// `database/version.rs` keeps over the count, over the contents.
    #[test]
    fn the_embedded_migrations_are_the_shipped_files_in_order() {
        let folder = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("migrations");
        let mut files: Vec<std::path::PathBuf> = std::fs::read_dir(&folder)
            .expect("the migrations directory")
            .filter_map(|entry| entry.ok())
            .map(|entry| entry.path())
            .filter(|path| path.extension().is_some_and(|kind| kind == "sql"))
            .collect();

        files.sort();

        assert_eq!(WORKSPACE_MIGRATIONS.len(), files.len());
        assert_eq!(
            shipped_version(),
            i64::from(crate::database::version::WORKSPACE_SCHEMA_VERSION)
        );

        for ((name, sql), file) in WORKSPACE_MIGRATIONS.iter().zip(files) {
            assert_eq!(Some(*name), file.file_name().and_then(|name| name.to_str()));
            assert_eq!(*sql, std::fs::read_to_string(&file).expect("a migration"));
        }
    }

    #[test]
    fn the_statements_split_at_the_breakpoints_and_carry_every_concept() {
        let all = statements(WORKSPACE_MIGRATIONS.len());

        assert!(all.len() > 7, "{} statements", all.len());
        assert!(
            all.iter()
                .all(|statement| !statement.contains("statement-breakpoint"))
        );
        assert!(all.iter().any(|statement| statement.contains("`contract`")));
        assert_eq!(statements(0), Vec::<String>::new());
    }

    #[tokio::test]
    async fn the_schema_goes_as_one_pipeline_with_the_credential_and_a_close() {
        let server = ScriptedServer::start(vec![ScriptedResponse::new(
            200,
            json!({ "results": [{ "type": "ok" }, { "type": "ok" }] }).to_string(),
        )])
        .await;

        apply(&Pipeline::at(&server.url("")), "a-migration-token", 1)
            .await
            .expect("the schema was refused");

        let request = server.request(0);
        let body: serde_json::Value = serde_json::from_str(&request.body).expect("json");
        let requests = body["requests"].as_array().expect("requests");

        assert_eq!(request.method, "POST");
        assert_eq!(request.target, "/v2/pipeline");
        assert_eq!(
            request.header("authorization"),
            Some("Bearer a-migration-token")
        );
        assert_eq!(requests.len(), statements(1).len() + 1);
        assert_eq!(requests.last().expect("a close")["type"], "close");
        assert_eq!(requests[0]["type"], "execute");
    }

    /// The pipeline answers 200 with a refusal inside, and that is a failure here.
    #[tokio::test]
    async fn a_refused_statement_inside_a_200_is_a_failure_that_names_the_statement() {
        let server = ScriptedServer::start(vec![ScriptedResponse::new(
            200,
            json!({ "results": [{ "type": "ok" }, { "type": "error", "error": { "message": "no such table" } }] })
                .to_string(),
        )])
        .await;

        let error = apply(&Pipeline::at(&server.url("")), "t", 1)
            .await
            .expect_err("a refused statement was read as applied");

        assert!(error.to_string().contains("statement 1"), "{error}");
        assert!(
            !error.to_string().contains("no such table"),
            "the database's words reached the message"
        );
    }

    #[tokio::test]
    async fn a_database_that_refuses_the_request_is_a_refusal_and_a_dropped_one_is_network() {
        let refusing = ScriptedServer::start(vec![ScriptedResponse::new(401, "")]).await;
        let dropping = ScriptedServer::start(vec![ScriptedResponse::hangup()]).await;

        assert!(matches!(
            apply(&Pipeline::at(&refusing.url("")), "t", 1).await,
            Err(crate::error::Error::Refused {
                reason: crate::error::RefusalReason::DatabaseRefused,
                ..
            })
        ));
        assert!(matches!(
            apply(&Pipeline::at(&dropping.url("")), "t", 1).await,
            Err(crate::error::Error::Network { .. })
        ));
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
        let data = std::env::temp_dir().join(format!(
            "rentable-migrate-paged-{:x}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|elapsed| elapsed.as_nanos())
                .unwrap_or_default()
        ));
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
}
