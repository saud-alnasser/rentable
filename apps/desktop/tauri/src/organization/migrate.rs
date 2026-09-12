//! applying the workspace schema to a database on the customer's account, over the wire.
//!
//! **A client applies migrations again, and it applies them the way the control plane did.** The
//! shipped `.sql` files are embedded by `build.rs` in the order `drizzle-kit` numbers them, split at
//! its statement breakpoints, and posted as one pipeline to the database's own HTTP endpoint,
//! which is `apps/control-plane/src/workspace/migration.ts` in one function. A sync connection
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

use std::time::Duration;

use serde_json::{Value, json};

use crate::{error::Error, http::build_client};

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
        return Err(Error::PreconditionFailed {
            message: format!(
                "the workspace database refused its schema ({status}). the workspace was not created"
            ),
        });
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
                return Err(Error::PreconditionFailed {
                    message: format!(
                        "statement {index} of the workspace schema was refused by the database. \
                         the workspace was not created"
                    ),
                });
            }
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use crate::sync::google::test::server::{ScriptedResponse, ScriptedServer};

    use super::{
        Pipeline, WORKSPACE_MIGRATIONS, apply, shipped_version, statements, statements_between,
    };

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
    async fn a_database_that_refuses_the_request_is_a_precondition_and_a_dropped_one_is_network() {
        let refusing = ScriptedServer::start(vec![ScriptedResponse::new(401, "")]).await;
        let dropping = ScriptedServer::start(vec![ScriptedResponse::hangup()]).await;

        assert!(matches!(
            apply(&Pipeline::at(&refusing.url("")), "t", 1).await,
            Err(crate::error::Error::PreconditionFailed { .. })
        ));
        assert!(matches!(
            apply(&Pipeline::at(&dropping.url("")), "t", 1).await,
            Err(crate::error::Error::Network { .. })
        ));
    }
}
