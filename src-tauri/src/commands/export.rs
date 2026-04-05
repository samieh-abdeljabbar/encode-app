use crate::services::{exporter, snapshot};
use crate::AppState;
use chrono::{DateTime, Duration, NaiveDateTime, Utc};
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct ExportStatus {
    pub last_export_at: Option<String>,
    pub last_snapshot_at: Option<String>,
    pub export_dirty: bool,
    pub snapshot_dirty: bool,
    pub next_export_due_at: Option<String>,
    pub next_snapshot_due_at: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct SnapshotInfo {
    pub name: String,
}

const EXPORT_DIRTY_KEY: &str = "export_dirty";
const SNAPSHOT_DIRTY_KEY: &str = "snapshot_dirty";
const LAST_EXPORT_KEY: &str = "last_export_at";
const LAST_SNAPSHOT_KEY: &str = "last_snapshot_at";
const TIMESTAMP_FORMAT: &str = "%Y-%m-%d %H:%M:%S";
pub const EXPORT_INTERVAL_MINUTES: i64 = 15;
pub const SNAPSHOT_INTERVAL_MINUTES: i64 = 60;

fn now_string() -> String {
    Utc::now().format(TIMESTAMP_FORMAT).to_string()
}

fn parse_timestamp(value: &str) -> Option<DateTime<Utc>> {
    NaiveDateTime::parse_from_str(value, TIMESTAMP_FORMAT)
        .ok()
        .map(|naive| DateTime::<Utc>::from_naive_utc_and_offset(naive, Utc))
}

fn upsert_setting(conn: &rusqlite::Connection, key: &str, value: &str) -> Result<(), String> {
    conn.execute(
        "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = ?2, updated_at = datetime('now')",
        rusqlite::params![key, value],
    )
    .map_err(|e| format!("Failed to update {key}: {e}"))?;
    Ok(())
}

fn get_setting(conn: &rusqlite::Connection, key: &str) -> Result<Option<String>, String> {
    conn.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        rusqlite::params![key],
        |row| row.get(0),
    )
    .map(Some)
    .or_else(|err| match err {
        rusqlite::Error::QueryReturnedNoRows => Ok(None),
        _ => Err(format!("Failed to read {key}: {err}")),
    })
}

fn set_dirty_flag(conn: &rusqlite::Connection, key: &str, value: bool) -> Result<(), String> {
    upsert_setting(conn, key, if value { "1" } else { "0" })
}

fn get_dirty_flag(conn: &rusqlite::Connection, key: &str) -> Result<bool, String> {
    Ok(matches!(get_setting(conn, key)?.as_deref(), Some("1")))
}

fn compute_next_due_at(
    last_run_at: Option<&str>,
    dirty: bool,
    interval: Duration,
    now: DateTime<Utc>,
) -> Option<String> {
    if !dirty {
        return None;
    }

    let due = last_run_at
        .and_then(parse_timestamp)
        .map(|last_run_at| last_run_at + interval)
        .unwrap_or(now);

    Some(due.format(TIMESTAMP_FORMAT).to_string())
}

pub fn is_due_at(
    last_run_at: Option<&str>,
    dirty: bool,
    interval: Duration,
    now: DateTime<Utc>,
) -> bool {
    if !dirty {
        return false;
    }

    match last_run_at.and_then(parse_timestamp) {
        Some(last_run_at) => now >= last_run_at + interval,
        None => true,
    }
}

pub fn touch_setting(conn: &rusqlite::Connection, key: &str) -> Result<(), String> {
    upsert_setting(conn, key, &now_string())
}

pub fn mark_export_dirty(conn: &rusqlite::Connection) -> Result<(), String> {
    set_dirty_flag(conn, EXPORT_DIRTY_KEY, true)?;
    set_dirty_flag(conn, SNAPSHOT_DIRTY_KEY, true)
}

pub fn mark_snapshot_dirty(conn: &rusqlite::Connection) -> Result<(), String> {
    set_dirty_flag(conn, SNAPSHOT_DIRTY_KEY, true)
}

pub fn record_successful_export(conn: &rusqlite::Connection) -> Result<(), String> {
    touch_setting(conn, LAST_EXPORT_KEY)?;
    set_dirty_flag(conn, EXPORT_DIRTY_KEY, false)
}

pub fn record_successful_snapshot(conn: &rusqlite::Connection) -> Result<(), String> {
    touch_setting(conn, LAST_SNAPSHOT_KEY)?;
    set_dirty_flag(conn, SNAPSHOT_DIRTY_KEY, false)
}

pub fn get_export_status_from_conn(conn: &rusqlite::Connection) -> Result<ExportStatus, String> {
    let now = Utc::now();
    let last_export_at = get_setting(conn, LAST_EXPORT_KEY)?;
    let last_snapshot_at = get_setting(conn, LAST_SNAPSHOT_KEY)?;
    let export_dirty = get_dirty_flag(conn, EXPORT_DIRTY_KEY)?;
    let snapshot_dirty = get_dirty_flag(conn, SNAPSHOT_DIRTY_KEY)?;

    Ok(ExportStatus {
        next_export_due_at: compute_next_due_at(
            last_export_at.as_deref(),
            export_dirty,
            Duration::minutes(EXPORT_INTERVAL_MINUTES),
            now,
        ),
        next_snapshot_due_at: compute_next_due_at(
            last_snapshot_at.as_deref(),
            snapshot_dirty,
            Duration::minutes(SNAPSHOT_INTERVAL_MINUTES),
            now,
        ),
        last_export_at,
        last_snapshot_at,
        export_dirty,
        snapshot_dirty,
    })
}

#[tauri::command]
pub fn export_subject_cmd(
    state: tauri::State<'_, AppState>,
    subject_id: i64,
) -> Result<(), String> {
    let export_dir = state.vault_path.join("exports");
    state.db.with_conn(|conn| {
        exporter::export_subject(conn, subject_id, &export_dir)?;
        touch_setting(conn, LAST_EXPORT_KEY)
    })
}

#[tauri::command]
pub fn export_all_cmd(state: tauri::State<'_, AppState>) -> Result<u32, String> {
    let export_dir = state.vault_path.join("exports");
    state.db.with_conn(|conn| {
        let count = exporter::export_all(conn, &export_dir)?;
        record_successful_export(conn)?;
        Ok(count)
    })
}

#[tauri::command]
pub fn create_snapshot_cmd(state: tauri::State<'_, AppState>) -> Result<String, String> {
    let db_path = state.vault_path.join(".encode").join("encode.db");
    let snap_dir = state.vault_path.join(".encode").join("snapshots");
    let path = snapshot::create_snapshot(&db_path, &snap_dir)?;

    state.db.with_conn(record_successful_snapshot)?;

    Ok(path.display().to_string())
}

#[tauri::command]
pub fn get_export_status(state: tauri::State<'_, AppState>) -> Result<ExportStatus, String> {
    state.db.with_conn(get_export_status_from_conn)
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;

    #[test]
    fn test_mark_export_dirty_marks_both_layers() {
        let db = Database::open_memory().expect("open");
        db.with_conn(|conn| {
            mark_export_dirty(conn)?;
            let status = get_export_status_from_conn(conn)?;
            assert!(status.export_dirty);
            assert!(status.snapshot_dirty);
            assert!(status.next_export_due_at.is_some());
            assert!(status.next_snapshot_due_at.is_some());
            Ok(())
        })
        .unwrap();
    }

    #[test]
    fn test_record_successful_export_clears_only_export_dirty() {
        let db = Database::open_memory().expect("open");
        db.with_conn(|conn| {
            mark_export_dirty(conn)?;
            record_successful_export(conn)?;
            let status = get_export_status_from_conn(conn)?;
            assert!(!status.export_dirty);
            assert!(status.snapshot_dirty);
            assert!(status.last_export_at.is_some());
            assert!(status.next_export_due_at.is_none());
            Ok(())
        })
        .unwrap();
    }

    #[test]
    fn test_record_successful_snapshot_clears_snapshot_dirty() {
        let db = Database::open_memory().expect("open");
        db.with_conn(|conn| {
            mark_snapshot_dirty(conn)?;
            record_successful_snapshot(conn)?;
            let status = get_export_status_from_conn(conn)?;
            assert!(!status.snapshot_dirty);
            assert!(status.last_snapshot_at.is_some());
            assert!(status.next_snapshot_due_at.is_none());
            Ok(())
        })
        .unwrap();
    }

    #[test]
    fn test_is_due_at_requires_dirty_flag() {
        let now = Utc::now();
        let old = (now - Duration::minutes(30))
            .format(TIMESTAMP_FORMAT)
            .to_string();

        assert!(!is_due_at(
            Some(&old),
            false,
            Duration::minutes(EXPORT_INTERVAL_MINUTES),
            now,
        ));
        assert!(is_due_at(
            Some(&old),
            true,
            Duration::minutes(EXPORT_INTERVAL_MINUTES),
            now,
        ));
        assert!(is_due_at(
            None,
            true,
            Duration::minutes(EXPORT_INTERVAL_MINUTES),
            now,
        ));
    }
}
