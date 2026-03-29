use crate::AppState;
use crate::services::ai;

#[tauri::command]
pub fn check_ai_status(
    state: tauri::State<'_, AppState>,
) -> Result<ai::AiStatus, String> {
    let config = state.config.read().map_err(|e| e.to_string())?;
    Ok(ai::check_status(&config.ai))
}
