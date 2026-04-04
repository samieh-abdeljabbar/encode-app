use crate::services::{exporter, snapshot};
use crate::AppState;
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct ExportStatus {
    pub last_export_at: Option<String>,
    pub last_snapshot_at: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct SnapshotInfo {
    pub name: String,
}

pub fn touch_setting(conn: &rusqlite::Connection, key: &str) -> Result<(), String> {
    conn.execute(
        "INSERT INTO settings (key, value, updated_at) VALUES (?1, datetime('now'), datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = datetime('now'), updated_at = datetime('now')",
        rusqlite::params![key],
    )
    .map_err(|e| format!("Failed to update {key}: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn export_subject_cmd(
    state: tauri::State<'_, AppState>,
    subject_id: i64,
) -> Result<(), String> {
    let export_dir = state.vault_path.join("exports");
    state.db.with_conn(|conn| {
        exporter::export_subject(conn, subject_id, &export_dir)?;
        touch_setting(conn, "last_export_at")
    })
}

#[tauri::command]
pub fn export_all_cmd(state: tauri::State<'_, AppState>) -> Result<u32, String> {
    let export_dir = state.vault_path.join("exports");
    state.db.with_conn(|conn| {
        let count = exporter::export_all(conn, &export_dir)?;
        touch_setting(conn, "last_export_at")?;
        Ok(count)
    })
}

#[tauri::command]
pub fn create_snapshot_cmd(state: tauri::State<'_, AppState>) -> Result<String, String> {
    let db_path = state.vault_path.join(".encode").join("encode.db");
    let snap_dir = state.vault_path.join(".encode").join("snapshots");
    let path = snapshot::create_snapshot(&db_path, &snap_dir)?;

    state
        .db
        .with_conn(|conn| touch_setting(conn, "last_snapshot_at"))?;

    Ok(path.display().to_string())
}

#[tauri::command]
pub fn get_export_status(state: tauri::State<'_, AppState>) -> Result<ExportStatus, String> {
    state.db.with_conn(|conn| {
        let last_export_at: Option<String> = conn
            .query_row(
                "SELECT value FROM settings WHERE key = 'last_export_at'",
                [],
                |row| row.get(0),
            )
            .ok();

        let last_snapshot_at: Option<String> = conn
            .query_row(
                "SELECT value FROM settings WHERE key = 'last_snapshot_at'",
                [],
                |row| row.get(0),
            )
            .ok();

        Ok(ExportStatus {
            last_export_at,
            last_snapshot_at,
        })
    })
}

#[tauri::command]
pub fn list_snapshots_cmd(state: tauri::State<'_, AppState>) -> Result<Vec<SnapshotInfo>, String> {
    let snap_dir = state.vault_path.join(".encode").join("snapshots");
    let names = snapshot::list_snapshots(&snap_dir)?;
    Ok(names
        .into_iter()
        .map(|name| SnapshotInfo { name })
        .collect())
}
