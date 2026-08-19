use base64::{Engine, engine::general_purpose};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{
    AssertSqlSafe, Column, Pool, Row, Sqlite, Transaction, TypeInfo, ValueRef, sqlite::SqliteRow,
};

use crate::error::Error;

/// One statement and its bound values, as they arrive from the web layer.
///
/// `sql` is executed as written, so it is asserted safe at the point of execution rather
/// than being checked here. What makes that assertion hold is that the web layer composes
/// statements through its query builder and never concatenates a value into one: everything
/// variable travels in `params` and is bound, so the statement text is fixed by the code
/// that shipped rather than by anything a user typed.
#[derive(Debug, Serialize, Deserialize)]
pub struct SQLQuery {
    pub sql: String,
    pub params: Vec<Value>,
}

#[derive(Debug, PartialEq, Serialize, Deserialize)]
pub struct SQLRow {
    pub columns: Vec<String>,
    pub rows: Vec<Value>,
}

impl TryFrom<&SqliteRow> for SQLRow {
    type Error = Error;

    fn try_from(row: &SqliteRow) -> Result<Self, Self::Error> {
        Ok(Self {
            columns: row.columns().iter().map(|c| c.name().to_string()).collect(),
            rows: (0..row.len())
                .map(|index| value_at(row, index))
                .collect::<Result<Vec<Value>, Self::Error>>()?,
        })
    }
}

/// Converts one value by the storage class it carries, never by the type its column was
/// declared as.
///
/// The declared type answers a different question and is absent for every expression — a
/// count, a sum, anything not a plain column reference — which is how a numeric aggregate
/// came to arrive as null (#287). SQLite types values rather than columns in any case, so
/// even a plain column can hold a value its declaration did not predict.
///
/// A null carries no storage class of its own, so it is matched before the rest: the driver
/// answers with the column's declared type there, which would otherwise send a null down
/// whichever branch that type named.
///
/// The five classes below are all SQLite defines, so each decode is asked for the type the
/// value already reported and cannot fail. **Nothing here falls back to null** — that
/// fallback is what let the bug above ship silently, and an error is what a genuinely
/// unmapped value is.
fn value_at(row: &SqliteRow, index: usize) -> Result<Value, Error> {
    let raw = row.try_get_raw(index)?;

    if raw.is_null() {
        return Ok(Value::Null);
    }

    match raw.type_info().name() {
        "INTEGER" => Ok(Value::from(row.try_get::<i64, _>(index)?)),
        "REAL" => Ok(Value::from(row.try_get::<f64, _>(index)?)),
        "TEXT" => Ok(Value::String(row.try_get::<String, _>(index)?)),
        "BLOB" => Ok(Value::String(
            general_purpose::STANDARD.encode(row.try_get::<Vec<u8>, _>(index)?),
        )),
        other => Err(Error::Database {
            message: format!(
                "column {index} carries storage class {other}, which the proxy does not map"
            ),
        }),
    }
}

/// Refuses a statement that would open or close a transaction of its own.
///
/// **Both engines owe this and it is written once for that reason.** Batching is the only
/// transactional path this application has — a single statement that began a transaction would
/// leave one open across the command boundary, on a connection the next request has no reason to
/// be the same one.
fn reject_transaction_control(sql: &str) -> Result<(), Error> {
    let sql_upper = sql.trim().to_uppercase();

    if sql_upper.starts_with("BEGIN")
        || sql_upper.starts_with("COMMIT")
        || sql_upper.starts_with("ROLLBACK")
    {
        return Err(Error::InvalidInput {
            message: "BEGIN/COMMIT/ROLLBACK not allowed in single SQL execution. use batch execution instead.".to_string(),
        });
    }

    Ok(())
}

pub async fn execute_single_sql(
    pool: &Pool<Sqlite>,
    query: SQLQuery,
) -> Result<Vec<SQLRow>, Error> {
    #[cfg(debug_assertions)]
    log(Some(&query), None);

    reject_transaction_control(&query.sql)?;

    let mut q = sqlx::query(AssertSqlSafe(query.sql.as_str()));
    q = bind_params(q, &query.params);

    let rows = q.fetch_all(pool).await?;

    rows.iter().map(SQLRow::try_from).collect()
}

pub async fn execute_batch_sql(
    pool: &Pool<Sqlite>,
    queries: Vec<SQLQuery>,
) -> Result<Vec<Vec<SQLRow>>, Error> {
    #[cfg(debug_assertions)]
    log(None, Some(&queries));

    let mut tx: Transaction<'_, Sqlite> = pool.begin().await?;

    let mut results: Vec<Vec<SQLRow>> = vec![];

    for query in queries {
        let mut q: sqlx::query::Query<'_, Sqlite, sqlx::sqlite::SqliteArguments> =
            sqlx::query(AssertSqlSafe(query.sql.as_str()));
        q = bind_params(q, &query.params);

        let rows = q.fetch_all(&mut *tx).await.map_err(|e| Error::Database {
            message: format!("Error executing '{}': {}", query.sql, e),
        })?;

        results.push(
            rows.iter()
                .map(SQLRow::try_from)
                .collect::<Result<_, _>>()?,
        );
    }

    tx.commit().await?;

    Ok(results)
}

fn bind_params<'a>(
    mut query: sqlx::query::Query<'a, Sqlite, sqlx::sqlite::SqliteArguments>,
    params: &'a [Value],
) -> sqlx::query::Query<'a, Sqlite, sqlx::sqlite::SqliteArguments> {
    for p in params {
        match p {
            Value::String(s) => query = query.bind(s),
            Value::Number(n) => {
                if let Some(i) = n.as_i64() {
                    query = query.bind(i);
                } else if let Some(f) = n.as_f64() {
                    query = query.bind(f);
                } else {
                    query = query.bind(None::<String>);
                }
            }
            Value::Bool(b) => query = query.bind(*b),
            Value::Null => query = query.bind(None::<String>),
            _ => query = query.bind(None::<String>),
        }
    }

    query
}

/// Converts one value the replica answered with, by the storage class it carries.
///
/// **The other mapping has to reconstruct the storage class from a type name; this one is handed
/// it.** `turso::Value` *is* the storage class — the same five SQLite defines, as a Rust enum —
/// so the three properties `value_at` above is written to hold are structural here rather than
/// maintained: the declared type is not reachable to be consulted, null is a variant rather than
/// a case that has to be matched first, and the match is exhaustive so there is no fallback arm
/// to leave out.
///
/// What the two must agree on is the JSON, and nothing in either signature forces that.
/// `both_engines_map_every_storage_class_alike` is what does.
fn workspace_value(value: turso::Value) -> Value {
    match value {
        turso::Value::Null => Value::Null,
        turso::Value::Integer(integer) => Value::from(integer),
        turso::Value::Real(real) => Value::from(real),
        turso::Value::Text(text) => Value::String(text),
        turso::Value::Blob(bytes) => Value::String(general_purpose::STANDARD.encode(bytes)),
    }
}

/// Drains a result set into the shape the command answers with.
///
/// The column names are read once from the statement rather than per row, which is the only place
/// the two engines are asked for the same thing differently — `SqliteRow` carries its own columns
/// and `turso::Row` does not. A statement that matched nothing yields no rows from either, so the
/// names never reach the web layer on their own.
async fn workspace_rows(rows: &mut turso::Rows) -> Result<Vec<SQLRow>, Error> {
    let columns = rows.column_names();
    let mut collected: Vec<SQLRow> = vec![];

    while let Some(row) = rows.next().await? {
        collected.push(SQLRow {
            columns: columns.clone(),
            rows: (0..row.column_count())
                .map(|index| row.get_value(index).map(workspace_value))
                .collect::<Result<Vec<Value>, turso::Error>>()?,
        });
    }

    Ok(collected)
}

/// Binds the same values `bind_params` does, to the same rules.
///
/// A JSON number that is neither an `i64` nor an `f64`, and anything that is an array or an
/// object, binds as null — not because null is right, but because it is what the other arm has
/// always done, and an arm that disagreed here would change what a statement means by which
/// engine ran it.
fn workspace_params(params: &[Value]) -> Vec<turso::Value> {
    params
        .iter()
        .map(|param| match param {
            Value::String(text) => turso::Value::Text(text.clone()),
            Value::Number(number) => number
                .as_i64()
                .map(turso::Value::Integer)
                .or_else(|| number.as_f64().map(turso::Value::Real))
                .unwrap_or(turso::Value::Null),
            Value::Bool(flag) => turso::Value::Integer(i64::from(*flag)),
            _ => turso::Value::Null,
        })
        .collect()
}

pub async fn workspace_execute_single_sql(
    connection: &turso::Connection,
    query: SQLQuery,
) -> Result<Vec<SQLRow>, Error> {
    #[cfg(debug_assertions)]
    log(Some(&query), None);

    reject_transaction_control(&query.sql)?;

    let mut rows = connection
        .query(&query.sql, workspace_params(&query.params))
        .await?;

    workspace_rows(&mut rows).await
}

pub async fn workspace_execute_batch_sql(
    connection: &turso::Connection,
    queries: Vec<SQLQuery>,
) -> Result<Vec<Vec<SQLRow>>, Error> {
    #[cfg(debug_assertions)]
    log(None, Some(&queries));

    // **`Connection::execute_batch` is not this**, and the name is the trap. It takes one string,
    // binds nothing, and — read at 0.8.0-pre.4 — splits the text and runs the statements one at a
    // time with no transaction around them. A batch that half-applied is the thing the web layer
    // sends a batch to avoid, so the transaction is opened here.
    //
    // `unchecked_transaction` rather than `transaction`, which takes `&mut Connection` to make
    // nesting a compile error; the connection arrives shared. Nesting is refused at runtime
    // instead, and there is nothing here that would nest.
    let transaction = connection.unchecked_transaction().await?;

    match workspace_batch(&transaction, queries).await {
        Ok(results) => {
            transaction.commit().await?;
            Ok(results)
        }
        Err(error) => {
            // Rolled back here rather than left to the drop. Dropping an unfinished transaction
            // only *records* what should happen to it, on `Connection::dangling_tx`, and acts on
            // that connection's next use — and a dropped connection goes back to the engine's
            // pool rather than away, so its next use is a later request, which would then find
            // itself inside this one's transaction.
            let _ = transaction.rollback().await;
            Err(error)
        }
    }
}

/// The statements of a batch, run in order on an open transaction.
///
/// Split out so the caller has one place to commit and one to roll back, rather than a rollback
/// on every early return.
async fn workspace_batch(
    connection: &turso::Connection,
    queries: Vec<SQLQuery>,
) -> Result<Vec<Vec<SQLRow>>, Error> {
    let mut results: Vec<Vec<SQLRow>> = vec![];

    for query in queries {
        let mut rows = connection
            .query(&query.sql, workspace_params(&query.params))
            .await
            .map_err(|error| Error::Database {
                message: format!("Error executing '{}': {}", query.sql, error),
            })?;

        results.push(workspace_rows(&mut rows).await?);
    }

    Ok(results)
}

#[allow(dead_code)]
fn log(single: Option<&SQLQuery>, batch: Option<&[SQLQuery]>) {
    if let Some(query) = single {
        println!(
            "[proxy] single sql: {}; params: {:?}",
            query.sql,
            query
                .params
                .iter()
                .map(|p| serde_json::to_string_pretty(&p.to_string()))
                .collect::<Vec<_>>()
        );
    }

    if let Some(queries) = batch {
        println!(
            "[proxy] batch sql: {} queries\n{}",
            queries.len(),
            queries
                .iter()
                .map(|q| format!(
                    "sql: {}; params: {:?}",
                    q.sql,
                    q.params
                        .iter()
                        .map(|p| serde_json::to_string_pretty(&p.to_string()))
                        .collect::<Vec<_>>()
                ))
                .collect::<Vec<_>>()
                .join("\n")
        );
    }
}

#[cfg(test)]
mod tests {
    use serde_json::{Value, json};
    use sqlx::{
        AssertSqlSafe, Pool, Sqlite,
        sqlite::{SqliteConnectOptions, SqlitePoolOptions},
    };

    use super::{
        SQLQuery, execute_single_sql, workspace_execute_batch_sql, workspace_execute_single_sql,
    };

    /// One connection, because every connection to an in-memory database gets a database of
    /// its own — a pool of two would lose the fixture between statements.
    async fn memory_pool(fixture: &[&str]) -> Pool<Sqlite> {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(SqliteConnectOptions::new().in_memory(true))
            .await
            .expect("in-memory pool");

        for statement in fixture {
            sqlx::query(AssertSqlSafe(*statement))
                .execute(&pool)
                .await
                .expect("fixture statement");
        }

        pool
    }

    async fn select(pool: &Pool<Sqlite>, sql: &str) -> Vec<Value> {
        let rows = execute_single_sql(
            pool,
            SQLQuery {
                sql: sql.to_string(),
                params: vec![],
            },
        )
        .await
        .expect("query");

        rows.into_iter().next().expect("one row").rows
    }

    /// Runs a statement that arrives the way the command receives one — as JSON text, decoded
    /// into `SQLQuery` — and answers with the first column of every row it matched.
    ///
    /// The round trip through JSON is the point rather than ceremony: a statement composed on
    /// the web side carries its own literals, and non-ASCII ones have to survive the decoding
    /// before the engine ever sees them.
    async fn matched(pool: &Pool<Sqlite>, sql: &str, params: &[&str]) -> Vec<Value> {
        let request = json!({ "sql": sql, "params": params });
        let text = serde_json::to_string(&request).expect("serialize");
        let query: SQLQuery = serde_json::from_str(&text).expect("deserialize");

        execute_single_sql(pool, query)
            .await
            .expect("query")
            .into_iter()
            .map(|row| row.rows.into_iter().next().expect("one column"))
            .collect()
    }

    /// Folds a column the way `platform/database/search.ts` does — one nested `replace()` per
    /// substitution, over the column cast to text.
    ///
    /// The substitutions themselves are bound, so only the *shape* is written out here. The
    /// table of them lives on the web side and never reaches Rust, which is exactly why this
    /// file has to prove the shape works rather than restate the table.
    fn folded(column: &str, substitutions: usize) -> String {
        (0..substitutions).fold(format!("cast({column} as text)"), |folded, _| {
            format!("replace({folded}, ?, ?)")
        })
    }

    /// Search folds both sides of its comparison with nested `replace()` calls, and the whole
    /// expression is composed in TypeScript and executed here.
    ///
    /// The router tests run the same statement against `better-sqlite3` under Node, so nothing
    /// over there can tell whether *this* engine folds multi-byte text the same way — or
    /// whether the Arabic the statement carries survives being decoded from JSON at all.
    #[tokio::test]
    async fn arabic_text_folds_in_the_engine_this_binary_ships() {
        let pool = memory_pool(&[
            "create table tenant (name text)",
            // written with a hamzated alef, a fatha, and a tatweel — none of which the reader
            // searching for this person is going to reproduce.
            "insert into tenant (name) values ('أَحـمد'), ('سارة')",
        ])
        .await;

        let sql = format!(
            "select name from tenant where lower({}) like lower(?) escape '\\'",
            folded("name", 3)
        );

        assert_eq!(
            matched(
                &pool,
                &sql,
                &["أ", "ا", "\u{0640}", "", "\u{064E}", "", "%احمد%"]
            )
            .await,
            vec![json!("أَحـمد")],
            "the stored side was not folded, so a plainly written term found nothing"
        );
    }

    /// The `ESCAPE` clause travels as part of the statement text, and the character it names is
    /// a backslash — which is escaped once in the JSON the statement arrives in. A pattern
    /// carrying `%` matches that character rather than everything.
    #[tokio::test]
    async fn an_escaped_wildcard_matches_its_own_character() {
        let pool = memory_pool(&[
            "create table tenant (name text)",
            "insert into tenant (name) values ('50% deposit'), ('Sara')",
        ])
        .await;

        let sql = format!(
            "select name from tenant where lower({}) like lower(?) escape '\\'",
            folded("name", 0)
        );

        assert_eq!(
            matched(&pool, &sql, &["%50\\%%"]).await,
            vec![json!("50% deposit")],
            "the percent sign acted as a wildcard instead of matching itself"
        );
    }

    #[tokio::test]
    async fn an_integer_expression_arrives_as_a_number() {
        let pool = memory_pool(&[
            "create table t (id integer primary key)",
            "insert into t (id) values (1), (2), (3)",
        ])
        .await;

        assert_eq!(
            select(&pool, "select count(*) from t").await,
            vec![json!(3)]
        );
    }

    #[tokio::test]
    async fn a_real_expression_arrives_as_a_number() {
        let pool = memory_pool(&[
            "create table t (amount real)",
            "insert into t (amount) values (1.5), (2.25)",
        ])
        .await;

        assert_eq!(
            select(&pool, "select sum(amount) from t").await,
            vec![json!(3.75)]
        );
    }

    #[tokio::test]
    async fn a_text_expression_arrives_as_text() {
        let pool = memory_pool(&["create table t (id integer primary key)"]).await;

        assert_eq!(
            select(&pool, "select 'settled' as verdict").await,
            vec![json!("settled")]
        );
    }

    #[tokio::test]
    async fn each_storage_class_survives_the_boundary() {
        let pool = memory_pool(&[
            "create table v (i integer, r real, t text, b blob, n text)",
            "insert into v (i, r, t, b, n) values (7, 1.5, 'seven', x'0102', null)",
        ])
        .await;

        assert_eq!(
            select(&pool, "select i, r, t, b, n from v").await,
            vec![
                json!(7),
                json!(1.5),
                json!("seven"),
                // the proxy base64-encodes blobs, and the in-memory transport on the
                // TypeScript side reproduces that encoding — the two shapes must agree.
                json!("AQI="),
                Value::Null,
            ]
        );
    }

    /// SQLite types values, not columns. REAL affinity cannot coerce this text, so the value
    /// is stored with TEXT storage class under a column still declared `real` — and what
    /// comes back has to follow the value.
    #[tokio::test]
    async fn a_value_converts_by_its_storage_class_not_its_declared_type() {
        let pool = memory_pool(&[
            "create table v (amount real)",
            "insert into v (amount) values ('not a number')",
        ])
        .await;

        assert_eq!(
            select(&pool, "select amount from v").await,
            vec![json!("not a number")]
        );
    }

    /// The fixture both engines are given, written as plain DDL so neither is handed anything
    /// the other could not have been.
    const BOTH_ENGINES_FIXTURE: &[&str] = &[
        "create table v (i integer, r real, t text, b blob, n text)",
        "insert into v (i, r, t, b, n) values (7, 1.5, 'seven', x'0102', null)",
        "insert into v (i, r, t, b, n) values (11, 2.25, 'eleven', x'ff00', null)",
        // REAL affinity cannot coerce this, so the value is stored with TEXT storage class under
        // a column still declared `real`. An engine reading declarations instead of values
        // answers differently here and nowhere else.
        "create table w (amount real)",
        "insert into w (amount) values ('not a number')",
    ];

    /// The questions, asked identically of both.
    fn both_engines_statements() -> Vec<SQLQuery> {
        [
            // every storage class `value_at` names, plus a null, in one row shape.
            ("select i, r, t, b, n from v order by i", vec![]),
            // **the aggregates, which is #287.** An expression has no declared column type, so an
            // engine consulting one has nothing to consult and the value arrives as null.
            ("select count(*), sum(r), max(t), min(b) from v", vec![]),
            // a bound parameter, so the two binders are held to each other as well as the two
            // decoders.
            ("select i from v where t = ?", vec![json!("eleven")]),
            (
                "select i from v where r > ? and n is null order by i",
                vec![json!(1.75)],
            ),
            // the value that contradicts its column.
            ("select amount from w", vec![]),
        ]
        .into_iter()
        .map(|(sql, params)| SQLQuery {
            sql: sql.to_string(),
            params,
        })
        .collect()
    }

    /// A directory of its own per test, because the replica is a real file with real sidecars
    /// beside it.
    fn scratch_directory(name: &str) -> std::path::PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|elapsed| elapsed.as_nanos())
            .unwrap_or_default();

        let path = std::env::temp_dir().join(format!("rentable-{name}-{nanos}"));
        std::fs::create_dir_all(&path).expect("scratch directory");

        path
    }

    /// A replica engine over a file of its own, holding the fixture, with no remote to reach.
    ///
    /// Built through [`crate::database::Database::open_replica`] rather than through the builder
    /// directly, so what runs here is the construction the application does — including
    /// `bootstrap_if_empty(false)`, which is what makes an engine with no reachable remote a
    /// usable local database rather than nothing at all.
    async fn replica_holding(path: &std::path::Path, fixture: &[&str]) -> turso::sync::Database {
        let database = crate::database::Database::open_replica(path, None, || async {
            Ok::<String, turso::Error>(String::new())
        })
        .await
        .expect("replica engine");

        let connection = database.connect().await.expect("replica connection");

        for statement in fixture {
            connection
                .execute(*statement, ())
                .await
                .expect("fixture statement");
        }

        database
    }

    /// **Two mappings that must agree, and nothing but this makes them.**
    ///
    /// `proxy.rs` decodes a row twice — once over `sqlx`, once over `turso` — and no other test
    /// in this repository touches either. The TypeScript suite cannot: `memory.ts` is a third
    /// transport that never crosses the language boundary.
    ///
    /// The answers are compared to *each other* rather than to a written-out expectation. A
    /// mistake made identically in both is one this cannot catch; a mistake made in one is the
    /// only kind that has ever shipped from here.
    #[tokio::test]
    async fn both_engines_map_every_storage_class_alike() {
        let directory = scratch_directory("proxy-both-engines");
        let pool = memory_pool(BOTH_ENGINES_FIXTURE).await;
        let replica = replica_holding(&directory.join("app.db"), BOTH_ENGINES_FIXTURE).await;
        let connection = replica.connect().await.expect("replica connection");

        for query in both_engines_statements() {
            let sql = query.sql.clone();
            let params = query.params.clone();

            let local = execute_single_sql(
                &pool,
                SQLQuery {
                    sql: sql.clone(),
                    params,
                },
            )
            .await
            .unwrap_or_else(|error| panic!("sqlx refused '{sql}': {error}"));

            let workspace = workspace_execute_single_sql(&connection, query)
                .await
                .unwrap_or_else(|error| panic!("the replica refused '{sql}': {error}"));

            assert_eq!(
                local, workspace,
                "the two engines disagreed about '{sql}' - one of the two mappings is wrong"
            );
        }

        drop(connection);
        drop(replica);
        let _ = std::fs::remove_dir_all(&directory);
    }

    /// **The property the batch transport rests on, observed rather than inferred.**
    ///
    /// `execute_single_sql` refuses `BEGIN`/`COMMIT`/`ROLLBACK`, so batching is the only
    /// transactional path this application has, and the whole-workspace import is one batch of
    /// roughly six and a half thousand statements. A batch that half-applied would leave a
    /// workspace nobody could describe.
    ///
    /// `Connection::execute_batch` would not give this: read at 0.8.0-pre.4 it splits the text
    /// and runs the statements one at a time with nothing around them, which is why the
    /// transaction is opened by hand.
    #[tokio::test]
    async fn a_batch_that_fails_partway_leaves_the_replica_as_it_was() {
        let directory = scratch_directory("proxy-batch-rollback");
        let replica = replica_holding(
            &directory.join("app.db"),
            &["create table t (id integer primary key)"],
        )
        .await;
        let connection = replica.connect().await.expect("replica connection");

        let inserting = |ids: &[i64]| {
            ids.iter()
                .map(|id| SQLQuery {
                    sql: "insert into t (id) values (?)".to_string(),
                    params: vec![json!(id)],
                })
                .collect::<Vec<_>>()
        };

        let count = async |connection: &turso::Connection| {
            workspace_execute_single_sql(
                connection,
                SQLQuery {
                    sql: "select count(*) from t".to_string(),
                    params: vec![],
                },
            )
            .await
            .expect("count")
            .into_iter()
            .next()
            .expect("one row")
            .rows
        };

        // **A batch that commits, first.** Without it the assertion below passes on a batch path
        // that never wrote anything at all, which is the same count and a different world.
        workspace_execute_batch_sql(&connection, inserting(&[1, 2]))
            .await
            .expect("a batch of two distinct inserts was refused");

        assert_eq!(count(&connection).await, vec![json!(2)]);

        let refusal = workspace_execute_batch_sql(&connection, inserting(&[3, 1])).await;

        assert!(
            refusal.is_err(),
            "a batch inserting a primary key that is already there was accepted"
        );

        assert_eq!(
            count(&connection).await,
            vec![json!(2)],
            "the insert before the failing one was kept, so the batch is not one unit"
        );

        drop(connection);
        drop(replica);
        let _ = std::fs::remove_dir_all(&directory);
    }

    /// A null reports its column's declared type rather than a storage class of its own, so
    /// it is the one case where the declared type is still consulted.
    #[tokio::test]
    async fn a_null_arrives_as_null_whatever_its_column_was_declared() {
        let pool = memory_pool(&[
            "create table v (i integer, r real, t text, b blob)",
            "insert into v (i, r, t, b) values (null, null, null, null)",
        ])
        .await;

        assert_eq!(
            select(&pool, "select i, r, t, b from v").await,
            vec![Value::Null, Value::Null, Value::Null, Value::Null]
        );
    }
}
