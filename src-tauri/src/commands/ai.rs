use crate::AppState;
use crate::services::ai;

#[tauri::command]
pub fn check_ai_status(
    state: tauri::State<'_, AppState>,
) -> Result<ai::AiStatus, String> {
    let config = state.config.read().map_err(|e| e.to_string())?;
    Ok(ai::check_status(&config.ai))
}

#[tauri::command]
pub fn list_ai_runs(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<ai::AiRunInfo>, String> {
    state.db.with_conn(|conn| ai::list_ai_runs(conn))
}
