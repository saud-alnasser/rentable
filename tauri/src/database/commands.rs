use crate::{
    database::proxy::{SQLQuery, SQLRow},
    state::AppState,
};

#[tauri::command]
pub async fn db_execute_single_sql(
    app_state: tauri::State<'_, AppState>,
    query: SQLQuery,
) -> Result<Vec<SQLRow>, String> {
    app_state.db.read().await.execute_single_sql(query).await
}

#[tauri::command]
pub async fn db_execute_batch_sql(
    app_state: tauri::State<'_, AppState>,
    queries: Vec<SQLQuery>,
) -> Result<Vec<Vec<SQLRow>>, String> {
    app_state.db.read().await.execute_batch_sql(queries).await
}
