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

async fn record_update_failure_if_needed(
    app_state: &AppState,
    previous_version: Option<String>,
    backup_name: Option<&str>,
    error: &str,
) -> Result<(), String> {
    let Some(backup_name) = backup_name else {
        return Ok(());
    };

    let mut settings = app_state.settings.write().await;

    settings.record_update_failure(app_state.version, previous_version, backup_name, error)
}

pub async fn connect_database(app_state: &AppState) -> Result<(), String> {
    let db_path = app_state.active_db_path.read().await.clone();
    let mut db = Database::new(db_path);

    db.connect().await?;

    let pool = db
        .pool_cloned()
        .ok_or("database not connected".to_string())?;

    let update_backup_timestamp = now_millis();
    let (previous_version, update_backup_path) = {
        let settings = app_state.settings.read().await;

        (
            settings.data.last_app_version.clone(),
            settings.pending_update_backup_path(
                app_state.version,
                db.path(),
                update_backup_timestamp,
            )?,
        )
    };

    let mut update_backup_name = None;

    if let Some(backup_path) = update_backup_path.as_ref() {
        Database::create_backup_from_pool(&pool, &backup_path).await?;
        update_backup_name = backup_path
            .file_name()
            .map(|value| value.to_string_lossy().into_owned());

        let mut settings = app_state.settings.write().await;
        settings.record_backup_created(update_backup_timestamp)?;
    }

    if let Err(error) = migrations::run(&pool, &app_state.migration_dir).await {
        record_update_failure_if_needed(
            app_state,
            previous_version.clone(),
            update_backup_name.as_deref(),
            &error,
        )
        .await?;

        return Err(error);
    }

    if let Err(error) = {
        let mut settings = app_state.settings.write().await;
        settings.record_connected_version(app_state.version)
    } {
        record_update_failure_if_needed(
            app_state,
            previous_version,
            update_backup_name.as_deref(),
            &error,
        )
        .await?;

        return Err(error);
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
