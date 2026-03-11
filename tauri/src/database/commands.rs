use crate::{
    database::{
        Database, migrations,
        proxy::{self, SQLQuery, SQLRow},
    },
    state::AppState,
};
use std::time::{SystemTime, UNIX_EPOCH};

fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

pub async fn connect_database(app_state: &AppState) -> Result<(), String> {
    let db_path = app_state.active_db_path.read().await.clone();
    let mut db = Database::new(db_path);

    db.connect().await?;

    let pool = db
        .pool_cloned()
        .ok_or("database not connected".to_string())?;

    let update_backup_timestamp = now_millis();
    let update_backup_path = {
        let settings = app_state.settings.read().await;
        settings.pending_update_backup_path(
            app_state.version,
            db.path(),
            update_backup_timestamp,
        )?
    };

    if let Some(backup_path) = update_backup_path {
        Database::create_backup_from_pool(&pool, &backup_path).await?;

        let mut settings = app_state.settings.write().await;
        settings.record_backup_created(update_backup_timestamp)?;
    }

    migrations::run(&pool, &app_state.migration_dir).await?;

    {
        let mut settings = app_state.settings.write().await;
        settings.record_connected_version(app_state.version)?;
    }

    let mut db_state = app_state.db.write().await;
    *db_state = Some(db);

    Ok(())
}

pub async fn reconnect_database(app_state: &AppState) -> Result<(), String> {
    let previous_db = {
        let mut db_state = app_state.db.write().await;

        db_state.take()
    };

    if let Some(db) = previous_db {
        db.disconnect().await;
    }

    connect_database(app_state).await
}

#[tauri::command]
pub async fn db_execute_single_sql(
    app_state: tauri::State<'_, AppState>,
    query: SQLQuery,
) -> Result<Vec<SQLRow>, String> {
    let pool = {
        let db_ref = app_state.db.read().await;
        let db = db_ref
            .as_ref()
            .ok_or("database not initialized".to_string())?;

        db.pool_cloned()
            .ok_or("database not connected".to_string())?
    };

    proxy::execute_single_sql(&pool, query).await
}

#[tauri::command]
pub async fn db_execute_batch_sql(
    app_state: tauri::State<'_, AppState>,
    queries: Vec<SQLQuery>,
) -> Result<Vec<Vec<SQLRow>>, String> {
    let pool = {
        let db_ref = app_state.db.read().await;
        let db = db_ref
            .as_ref()
            .ok_or("database not initialized".to_string())?;

        db.pool_cloned()
            .ok_or("database not connected".to_string())?
    };

    proxy::execute_batch_sql(&pool, queries).await
}

#[tauri::command]
pub async fn db_does_exist(app_state: tauri::State<'_, AppState>) -> Result<bool, String> {
    Ok(app_state.active_db_path.read().await.exists())
}

#[tauri::command]
pub async fn db_is_ready(app_state: tauri::State<'_, AppState>) -> Result<bool, String> {
    let pool = {
        let db_lock = app_state.db.read().await;
        let db = match db_lock.as_ref() {
            Some(db) => db,
            _ => return Ok(false),
        };

        match db.pool_cloned() {
            Some(pool) => pool,
            None => return Ok(false),
        }
    };

    Ok(Database::is_pool_ready(&pool).await)
}

#[tauri::command]
pub async fn db_connect(app_state: tauri::State<'_, AppState>) -> Result<(), String> {
    {
        let db_lock = app_state.db.read().await;

        if db_lock.is_some() {
            return Ok(());
        }
    }

    connect_database(app_state.inner()).await
}

#[tauri::command]
pub async fn db_disconnect(app_state: tauri::State<'_, AppState>) -> Result<(), String> {
    let db = {
        let mut lock = app_state.db.write().await;

        lock.take()
    };

    if let Some(db) = db {
        db.disconnect().await;
    }

    Ok(())
}

#[tauri::command]
pub async fn db_purge(app_state: tauri::State<'_, AppState>) -> Result<(), String> {
    let db_path = app_state.active_db_path.read().await.clone();

    let db = {
        let mut lock = app_state.db.write().await;

        lock.take()
    };

    if let Some(db) = db {
        db.purge().await?;
    } else {
        Database::purge_path(&db_path)?;
    }

    Ok(())
}
