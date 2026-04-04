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
    state.db.with_conn(ai::list_ai_runs)
}

#[tauri::command]
pub async fn ask_inline_question(
    state: tauri::State<'_, AppState>,
    context: String,
    question: String,
) -> Result<String, String> {
    let config = state.config.read().map_err(|e| e.to_string())?.clone();
    if config.ai.provider == "none" {
        return Err("AI provider must be configured to use Ask AI".to_string());
    }

    let system = "You are a helpful study assistant. The student has highlighted some text and is asking a question about it. Answer clearly and concisely in 2-4 sentences. Focus on explanation, not just restating the text.".to_string();
    let user = format!("Highlighted text:\n{context}\n\nQuestion: {question}");

    let req = ai::AiRequest {
        feature: "inline.question".to_string(),
        system_prompt: system,
        user_prompt: user,
        model_policy: "balanced".to_string(),
        timeout_ms: 60000,
    };

    let response = ai::ai_request(&state.http, &config.ai, &config.profile, req).await?;

    state.db.with_conn(|conn| {
        ai::log_result(conn, "inline.question", Ok(&response));
        Ok(())
    })?;

    Ok(response.content)
}
