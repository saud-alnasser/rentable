//! a stand-in for a database's `/v2/pipeline`, running what it is sent against a real local SQLite.
//!
//! **Why not a script.** [`super::server::ScriptedServer`] answers what a test wrote down, which
//! is right for a request's shape and wrong for a transaction: whether a refusal part way leaves
//! every table as it was is the engine's answer, and a script would be the test agreeing with
//! itself. So this runs each statement on a connection of its own per stream, held between
//! requests by a baton as the real server holds one, and answers in the pipeline's typed JSON
//! (effort 838, ticket 32).
//!
//! **What it speaks is what this application sends**: `execute` with positional arguments of the
//! five typed values, `batch` with `ok`, `error`, `not`, `and` and `or` conditions, and `close`,
//! on a baton or on none. *Arguments arrived with effort 846, ticket 11, when a workspace that is
//! not open came to be read and written over the pipeline with the web layer's bound values.* A stream
//! closed, or let go by a request that did not keep it, rolls back whatever it left open, as the
//! server does. It never names a `base_url`.
//!
//! **Two things a test may ask of it.** [`LocalPipeline::refusing`] answers one statement with an
//! error, once, without running it, which is a statement the database refused; and
//! [`LocalPipeline::after`] answers its first requests from a script before it runs anything, for
//! a test whose subject is what is read over the pipeline before the migration rather than the
//! migration.

use std::{
    collections::{HashMap, VecDeque},
    path::{Path, PathBuf},
    str::FromStr,
    sync::Arc,
};

use bytes::Bytes;
use http_body_util::{BodyExt, Full};
use hyper::{Request, Response, body::Incoming, server::conn::http1, service::service_fn};
use hyper_util::rt::TokioIo;
use serde_json::{Value, json};
use sqlx::{
    AssertSqlSafe, ConnectOptions, Connection, Row,
    sqlite::{SqliteConnectOptions, SqliteConnection},
};
use tokio::{net::TcpListener, sync::Mutex};

use super::server::{RecordedRequest, ScriptedResponse};

/// Everything the stand-in keeps between requests, under one lock, so requests are answered one
/// at a time in the order they arrive.
#[derive(Default)]
struct State {
    streams: HashMap<String, SqliteConnection>,
    batons: u64,
    script: VecDeque<ScriptedResponse>,
    refusing: Option<String>,
}

/// A loopback server taking `/v2/pipeline` requests against one SQLite file.
pub(crate) struct LocalPipeline {
    base_url: String,
    path: PathBuf,
    state: Arc<Mutex<State>>,
    /// kept apart from the rest, so reading what arrived needs no await.
    recorded: Arc<std::sync::Mutex<Vec<RecordedRequest>>>,
}

impl LocalPipeline {
    /// A stand-in over an empty database of its own.
    pub(crate) async fn start() -> Self {
        Self::after(Vec::new()).await
    }

    /// A stand-in that answers its first requests from `script`, then runs the rest.
    pub(crate) async fn after(script: Vec<ScriptedResponse>) -> Self {
        let directory = crate::test::scratch("pipeline");

        let path = directory.join("primary.db");
        let listener = TcpListener::bind(("127.0.0.1", 0))
            .await
            .expect("failed to bind the stand-in pipeline");
        let address = listener.local_addr().expect("the stand-in's address");
        let state = Arc::new(Mutex::new(State {
            script: script.into(),
            ..State::default()
        }));
        let recorded = Arc::new(std::sync::Mutex::new(Vec::new()));

        tokio::spawn({
            let state = Arc::clone(&state);
            let recorded = Arc::clone(&recorded);
            let path = path.clone();

            async move {
                while let Ok((stream, _)) = listener.accept().await {
                    let state = Arc::clone(&state);
                    let recorded = Arc::clone(&recorded);
                    let path = path.clone();

                    tokio::spawn(async move {
                        let service = service_fn(move |request| {
                            let state = Arc::clone(&state);
                            let recorded = Arc::clone(&recorded);
                            let path = path.clone();

                            async move { answer(state, recorded, &path, request).await }
                        });

                        let _ = http1::Builder::new()
                            .serve_connection(TokioIo::new(stream), service)
                            .await;
                    });
                }
            }
        });

        let pipeline = Self {
            base_url: format!("http://{address}"),
            path,
            state,
            recorded,
        };

        // the file exists from the start, so a test can read it before anything is sent.
        pipeline.connection().await.close().await.expect("closed");

        pipeline
    }

    /// An absolute URL for `path`, which must start with `/` or be empty.
    pub(crate) fn url(&self, path: &str) -> String {
        format!("{}{path}", self.base_url)
    }

    /// The database file, which a test may open as a plain SQLite file between requests.
    pub(crate) fn path(&self) -> &Path {
        &self.path
    }

    /// A connection of the test's own to the database, outside any stream.
    pub(crate) async fn connection(&self) -> SqliteConnection {
        options(&self.path)
            .connect()
            .await
            .expect("the stand-in's database")
    }

    /// Run `statements` on the database directly, as whatever built it before this test did.
    pub(crate) async fn holding(&self, statements: &[String]) {
        let mut connection = self.connection().await;

        for statement in statements {
            sqlx::query(AssertSqlSafe(statement.as_str()))
                .execute(&mut connection)
                .await
                .unwrap_or_else(|error| panic!("{statement}: {error}"));
        }

        connection.close().await.expect("closed");
    }

    /// Answer the next statement whose text is `statement` with an error, without running it.
    pub(crate) async fn refusing(&self, statement: &str) {
        self.state.lock().await.refusing = Some(statement.to_string());
    }

    pub(crate) fn request_count(&self) -> usize {
        self.recorded.lock().expect("the record").len()
    }

    /// The `index`th request the stand-in received, in arrival order.
    pub(crate) fn request(&self, index: usize) -> RecordedRequest {
        let recorded = self.recorded.lock().expect("the record");

        recorded.get(index).cloned().unwrap_or_else(|| {
            panic!(
                "the stand-in received {} requests, not {}",
                recorded.len(),
                index + 1
            )
        })
    }
}

fn options(path: &Path) -> SqliteConnectOptions {
    SqliteConnectOptions::from_str("sqlite:")
        .expect("options")
        .filename(path)
        .create_if_missing(true)
        .foreign_keys(false)
}

async fn answer(
    state: Arc<Mutex<State>>,
    recorded: Arc<std::sync::Mutex<Vec<RecordedRequest>>>,
    path: &Path,
    request: Request<Incoming>,
) -> Result<Response<Full<Bytes>>, std::io::Error> {
    let target = request
        .uri()
        .path_and_query()
        .map(ToString::to_string)
        .unwrap_or_default();
    let headers: Vec<(String, String)> = request
        .headers()
        .iter()
        .map(|(name, value)| {
            (
                name.as_str().to_string(),
                value.to_str().unwrap_or_default().to_string(),
            )
        })
        .collect();
    let method = request.method().to_string();
    let body = request
        .into_body()
        .collect()
        .await
        .map(|collected| String::from_utf8_lossy(&collected.to_bytes()).into_owned())
        .unwrap_or_default();
    let mut state = state.lock().await;

    recorded
        .lock()
        .expect("the record")
        .push(RecordedRequest::new(method, target, body.clone(), headers));

    if let Some(scripted) = state.script.pop_front() {
        return match scripted {
            ScriptedResponse::Respond { status, body, .. } => Ok(respond(status, body)),
            ScriptedResponse::Hangup => Err(std::io::Error::other("hung up")),
        };
    }

    let Ok(sent) = serde_json::from_str::<Value>(&body) else {
        return Ok(respond(400, b"not json".to_vec()));
    };
    let mut connection = match sent.get("baton").and_then(Value::as_str) {
        Some(baton) => match state.streams.remove(baton) {
            Some(connection) => connection,
            None => return Ok(respond(400, b"no stream holds that baton".to_vec())),
        },
        None => options(path)
            .connect()
            .await
            .expect("a stream's connection"),
    };
    let mut results = Vec::new();
    let mut closed = false;

    for request in sent
        .get("requests")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
    {
        let result = match request.get("type").and_then(Value::as_str) {
            Some("execute") => {
                match run(&mut connection, &mut state.refusing, &request["stmt"]).await {
                    Ok(result) => {
                        json!({ "type": "ok", "response": { "type": "execute", "result": result } })
                    }
                    Err(error) => error,
                }
            }
            Some("batch") => {
                let mut outcomes: Vec<Option<bool>> = Vec::new();
                let mut step_results = Vec::new();
                let mut step_errors = Vec::new();

                for step in request["batch"]["steps"]
                    .as_array()
                    .cloned()
                    .unwrap_or_default()
                {
                    if !holds(&step["condition"], &outcomes) {
                        outcomes.push(None);
                        step_results.push(Value::Null);
                        step_errors.push(Value::Null);

                        continue;
                    }

                    match run(&mut connection, &mut state.refusing, &step["stmt"]).await {
                        Ok(result) => {
                            outcomes.push(Some(true));
                            step_results.push(result);
                            step_errors.push(Value::Null);
                        }
                        Err(error) => {
                            outcomes.push(Some(false));
                            step_results.push(Value::Null);
                            step_errors.push(error["error"].clone());
                        }
                    }
                }

                json!({ "type": "ok", "response": { "type": "batch", "result": {
                    "step_results": step_results, "step_errors": step_errors
                } } })
            }
            Some("close") => {
                closed = true;

                json!({ "type": "ok", "response": { "type": "close" } })
            }
            _ => json!({ "type": "error", "error": { "message": "not a request this speaks" } }),
        };

        results.push(result);
    }

    let baton = if closed {
        // whatever the stream left open is rolled back as it goes.
        let _ = sqlx::query("ROLLBACK").execute(&mut connection).await;
        let _ = connection.close().await;

        None
    } else {
        state.batons += 1;

        let baton = format!("baton-{}", state.batons);

        state.streams.insert(baton.clone(), connection);

        Some(baton)
    };

    Ok(respond(
        200,
        json!({ "baton": baton, "base_url": null, "results": results })
            .to_string()
            .into_bytes(),
    ))
}

/// Whether a batch step's `condition` holds, given what the steps before it came to: `Some(true)`
/// ran and answered ok, `Some(false)` ran and failed, `None` did not run.
fn holds(condition: &Value, outcomes: &[Option<bool>]) -> bool {
    let step = |condition: &Value| {
        condition["step"]
            .as_u64()
            .and_then(|step| outcomes.get(step as usize).copied().flatten())
    };

    match condition.get("type").and_then(Value::as_str) {
        None => true,
        Some("ok") => step(condition) == Some(true),
        Some("error") => step(condition) == Some(false),
        Some("not") => !holds(&condition["cond"], outcomes),
        Some("and") => condition["conds"]
            .as_array()
            .is_some_and(|conds| conds.iter().all(|cond| holds(cond, outcomes))),
        Some("or") => condition["conds"]
            .as_array()
            .is_some_and(|conds| conds.iter().any(|cond| holds(cond, outcomes))),
        Some(_) => false,
    }
}

/// Run one statement, or refuse it where the test said to: the execute result, or the whole
/// error result.
async fn run(
    connection: &mut SqliteConnection,
    refusing: &mut Option<String>,
    statement: &Value,
) -> Result<Value, Value> {
    let sql = statement["sql"].as_str().unwrap_or_default();

    if refusing.as_deref() == Some(sql) {
        *refusing = None;

        return Err(json!({ "type": "error", "error": { "message": "refused by the test" } }));
    }

    let mut query = sqlx::query(AssertSqlSafe(sql)).persistent(false);

    for argument in statement
        .get("args")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
    {
        let value = &argument["value"];

        query = match argument["type"].as_str() {
            Some("integer") => query.bind(
                value
                    .as_str()
                    .and_then(|text| text.parse::<i64>().ok())
                    .expect("an integer argument"),
            ),
            Some("float") => query.bind(value.as_f64().expect("a float argument")),
            Some("text") => query.bind(value.as_str().expect("a text argument").to_string()),
            Some("blob") => query.bind(
                base64::Engine::decode(
                    &base64::engine::general_purpose::STANDARD_NO_PAD,
                    argument["base64"]
                        .as_str()
                        .expect("a blob argument")
                        .trim_end_matches('='),
                )
                .expect("base64"),
            ),
            _ => query.bind(None::<String>),
        };
    }

    let rows = query
        .fetch_all(&mut *connection)
        .await
        .map_err(|error| json!({ "type": "error", "error": { "message": error.to_string() } }))?;
    let cols: Vec<Value> = rows
        .first()
        .map(|row| {
            row.columns()
                .iter()
                .map(|column| json!({ "name": sqlx::Column::name(column) }))
                .collect()
        })
        .unwrap_or_default();
    let rows: Vec<Value> = rows
        .iter()
        .map(|row| {
            Value::Array(
                crate::backup::values_of(row)
                    .into_iter()
                    .map(|value| match value {
                        turso::Value::Null => json!({ "type": "null" }),
                        turso::Value::Integer(integer) => {
                            json!({ "type": "integer", "value": integer.to_string() })
                        }
                        turso::Value::Real(real) => json!({ "type": "float", "value": real }),
                        turso::Value::Text(text) => json!({ "type": "text", "value": text }),
                        turso::Value::Blob(bytes) => json!({
                            "type": "blob",
                            "base64": base64::Engine::encode(
                                &base64::engine::general_purpose::STANDARD,
                                bytes
                            )
                        }),
                    })
                    .collect(),
            )
        })
        .collect();

    Ok(json!({ "cols": cols, "rows": rows, "affected_row_count": 0, "last_insert_rowid": null }))
}

fn respond(status: u16, body: Vec<u8>) -> Response<Full<Bytes>> {
    Response::builder()
        .status(status)
        .body(Full::new(Bytes::from(body)))
        .expect("a response")
}
