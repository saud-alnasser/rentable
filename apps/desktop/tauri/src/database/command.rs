use crate::{
    database::{
        Shared,
        proxy::{SQLQuery, SQLRow},
    },
    error::Error,
};

/// run one statement against the open workspace. Invoked as `plugin:database|execute_single_sql`,
/// on the path every query the interface makes takes, so its argument and its answer keep the
/// shape they had as an application command.
#[tauri::command(rename = "execute_single_sql")]
pub async fn database_execute_single_sql(
    db: tauri::State<'_, Shared>,
    query: SQLQuery,
) -> Result<Vec<SQLRow>, Error> {
    db.read().await.execute_single_sql(query).await
}

/// run several statements as one batch. Invoked as `plugin:database|execute_batch_sql`.
#[tauri::command(rename = "execute_batch_sql")]
pub async fn database_execute_batch_sql(
    db: tauri::State<'_, Shared>,
    queries: Vec<SQLQuery>,
) -> Result<Vec<Vec<SQLRow>>, Error> {
    db.read().await.execute_batch_sql(queries).await
}
