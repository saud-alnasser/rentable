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

#[derive(Debug, Serialize, Deserialize)]
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

pub async fn execute_single_sql(
    pool: &Pool<Sqlite>,
    query: SQLQuery,
) -> Result<Vec<SQLRow>, Error> {
    #[cfg(debug_assertions)]
    log(Some(&query), None);

    let sql_upper = query.sql.trim().to_uppercase();
    if sql_upper.starts_with("BEGIN")
        || sql_upper.starts_with("COMMIT")
        || sql_upper.starts_with("ROLLBACK")
    {
        return Err(Error::InvalidInput {
            message: "BEGIN/COMMIT/ROLLBACK not allowed in single SQL execution. use batch execution instead.".to_string(),
        });
    }

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

    use super::{SQLQuery, execute_single_sql};

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
