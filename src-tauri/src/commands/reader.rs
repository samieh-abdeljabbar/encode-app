use crate::services::{ai, reader};
use crate::AppState;

#[tauri::command]
pub fn load_reader_session(
    state: tauri::State<'_, AppState>,
    chapter_id: i64,
) -> Result<reader::ReaderSession, String> {
    state.db.with_conn(|conn| reader::get_reader_session(conn, chapter_id))
}

#[tauri::command]
pub fn mark_section_read(
    state: tauri::State<'_, AppState>,
    chapter_id: i64,
    section_index: i32,
) -> Result<(), String> {
    state.db.with_conn(|conn| reader::mark_section_seen(conn, chapter_id, section_index))
}

#[tauri::command]
pub fn submit_section_check(
    state: tauri::State<'_, AppState>,
    chapter_id: i64,
    section_index: i32,
    response: String,
    self_rating: String,
) -> Result<reader::CheckResult, String> {
    state.db.with_conn(|conn| {
        reader::process_check(conn, chapter_id, section_index, &response, &self_rating)
    })
}

#[tauri::command]
pub async fn generate_section_prompt(
    state: tauri::State<'_, AppState>,
    heading: Option<String>,
    body: String,
) -> Result<String, String> {
    let config = state.config.read().map_err(|e| e.to_string())?.clone();
    if config.ai.provider == "none" {
        // Fallback to deterministic
        return Ok(reader::generate_prompt(&heading, &body));
    }

    let section_context = format!(
        "Section: {}\n\n{}",
        heading.as_deref().unwrap_or("Untitled"),
        &body[..body.len().min(2000)]
    );

    let req = ai::AiRequest {
        feature: "reader.generate_prompt".to_string(),
        system_prompt: reader::READER_PROMPT_SYSTEM.to_string(),
        user_prompt: section_context,
        model_policy: "balanced".to_string(),
        timeout_ms: 30000,
    };

    match ai::ai_request(&state.http, &config.ai, &config.profile, req).await {
        Ok(response) => {
            let prompt = response.content.trim().to_string();
            state.db.with_conn(|conn| {
                ai::log_result(conn, "reader.generate_prompt", Ok(&response));
                Ok(())
            })?;
            if prompt.is_empty() {
                Ok(reader::generate_prompt(&heading, &body))
            } else {
                Ok(prompt)
            }
        }
        Err(e) => {
            state.db.with_conn(|conn| {
                ai::log_result(conn, "reader.generate_prompt", Err(&e));
                Ok(())
            })?;
            // Fallback to deterministic
            Ok(reader::generate_prompt(&heading, &body))
        }
    }
}

#[tauri::command]
pub fn submit_synthesis(
    state: tauri::State<'_, AppState>,
    chapter_id: i64,
    synthesis_text: String,
) -> Result<reader::SynthesisResult, String> {
    state.db.with_conn(|conn| reader::process_synthesis(conn, chapter_id, &synthesis_text))
}
