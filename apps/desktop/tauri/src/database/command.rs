use crate::{
    database::proxy::{SQLQuery, SQLRow},
    error::Error,
    state::AppState,
};

/// run one statement against the open workspace. Invoked as `plugin:database|execute_single_sql`,
/// on the path every query the interface makes takes, so its argument and its answer keep the
/// shape they had as an application command.
#[tauri::command(rename = "execute_single_sql")]
pub async fn database_execute_single_sql(
    app_state: tauri::State<'_, AppState>,
    query: SQLQuery,
) -> Result<Vec<SQLRow>, Error> {
    app_state.db.read().await.execute_single_sql(query).await
}

/// run several statements as one batch. Invoked as `plugin:database|execute_batch_sql`.
#[tauri::command(rename = "execute_batch_sql")]
pub async fn database_execute_batch_sql(
    app_state: tauri::State<'_, AppState>,
    queries: Vec<SQLQuery>,
) -> Result<Vec<Vec<SQLRow>>, Error> {
    app_state.db.read().await.execute_batch_sql(queries).await
}
