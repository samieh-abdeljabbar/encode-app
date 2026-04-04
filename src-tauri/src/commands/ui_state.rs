use crate::AppState;

fn get_setting(conn: &rusqlite::Connection, key: &str) -> Result<Option<String>, String> {
    let value = conn
        .query_row(
            "SELECT value FROM settings WHERE key = ?1",
            rusqlite::params![key],
            |row| row.get(0),
        )
        .ok();
    Ok(value)
}

fn set_setting(conn: &rusqlite::Connection, key: &str, value: &str) -> Result<(), String> {
    conn.execute(
        "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')",
        rusqlite::params![key, value],
    )
    .map_err(|e| format!("Failed to update {key}: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn get_last_surface(state: tauri::State<'_, AppState>) -> Result<Option<String>, String> {
    state.db.with_conn(|conn| get_setting(conn, "last_surface"))
}

#[tauri::command]
pub fn set_last_surface(
    state: tauri::State<'_, AppState>,
    route: String,
) -> Result<(), String> {
    state
        .db
        .with_conn(|conn| set_setting(conn, "last_surface", &route))
}

