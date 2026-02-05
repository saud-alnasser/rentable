use crate::{
    database::{
        Database, migrations,
        proxy::{self, SQLQuery, SQLRow},
    },
    state::AppState,
};

#[tauri::command]
pub async fn db_execute_single_sql(
    app_state: tauri::State<'_, AppState>,
    query: SQLQuery,
) -> Result<Vec<SQLRow>, String> {
    let db_ref = app_state.db.read().await;
    let db = db_ref
        .as_ref()
        .ok_or("database not initialized".to_string())?;

    let pool = db.pool().ok_or("database not connected".to_string())?;

    proxy::execute_single_sql(&pool, query).await
}

#[tauri::command]
pub async fn db_execute_batch_sql(
    app_state: tauri::State<'_, AppState>,
    queries: Vec<SQLQuery>,
) -> Result<Vec<Vec<SQLRow>>, String> {
    let db_ref = app_state.db.read().await;
    let db = db_ref
        .as_ref()
        .ok_or("database not initialized".to_string())?;

    let pool = db.pool().ok_or("database not connected".to_string())?;

    proxy::execute_batch_sql(&pool, queries).await
}

#[tauri::command]
pub async fn db_does_exist(app_state: tauri::State<'_, AppState>) -> Result<bool, String> {
    Ok(app_state.db_dir.join(Database::DB_NAME).exists())
}

#[tauri::command]
pub async fn db_is_ready(app_state: tauri::State<'_, AppState>) -> Result<bool, String> {
    let db_lock = app_state.db.read().await;
    let db = match db_lock.as_ref() {
        Some(_db) => _db,
        _ => return Ok(false),
    };
    Ok(db.ready().await)
}

#[tauri::command]
pub async fn db_connect(app_state: tauri::State<'_, AppState>) -> Result<(), String> {
    {
        let db_lock = app_state.db.read().await;

        if db_lock.is_some() {
            return Err(String::from("database is already initialized."));
        }
    }

    let mut db = Database::new(app_state.db_dir.clone());

    db.connect().await?;

    migrations::run(
        db.pool().ok_or("database not connected".to_string())?,
        &app_state.migration_dir,
    )
    .await?;

    let mut db_state = app_state.db.write().await;
    *db_state = Some(db);

    Ok(())
}

#[tauri::command]
pub async fn db_disconnect(app_state: tauri::State<'_, AppState>) -> Result<(), String> {
    {
        let mut lock = app_state.db.write().await;

        if let Some(db) = lock.take() {
            db.disconnect().await;
        }
    };

    Ok(())
}

#[tauri::command]
pub async fn db_purge(app_state: tauri::State<'_, AppState>) -> Result<(), String> {
    {
        let mut lock = app_state.db.write().await;

        if let Some(db) = lock.take() {
            db.purge().await?;
        }
    }

    Ok(())
}
