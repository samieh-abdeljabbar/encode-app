use crate::services::{ai, reader};
use crate::AppState;

fn normalize_reader_rating(value: &str) -> String {
    match value {
        "correct" => "correct".to_string(),
        "partial" => "partial".to_string(),
        "off_track" => "off_track".to_string(),
        _ => "partial".to_string(),
    }
}

#[tauri::command]
pub fn load_reader_session(
    state: tauri::State<'_, AppState>,
    chapter_id: i64,
) -> Result<reader::ReaderSession, String> {
    state
        .db
        .with_conn(|conn| reader::get_reader_session(conn, chapter_id))
}

#[tauri::command]
pub fn mark_section_read(
    state: tauri::State<'_, AppState>,
    chapter_id: i64,
    section_index: i32,
) -> Result<(), String> {
    state
        .db
        .with_conn(|conn| reader::mark_section_seen(conn, chapter_id, section_index))
}

#[tauri::command]
pub async fn submit_section_check(
    state: tauri::State<'_, AppState>,
    chapter_id: i64,
    section_index: i32,
    response: String,
    self_rating: Option<String>,
    use_ai: Option<bool>,
) -> Result<reader::CheckResult, String> {
    let config = state.config.read().map_err(|e| e.to_string())?.clone();
    let ai_status = ai::check_status(&config.ai);
    let ai_available =
        ai_status.provider != "none" && ai_status.configured && ai_status.has_api_key;
    let should_use_ai = use_ai.unwrap_or(ai_available) && ai_available;

    let (rating, feedback, evaluated_by_ai) = if should_use_ai {
        let (_chapter_title, heading, body) = state
            .db
            .with_conn(|conn| reader::get_section_context(conn, chapter_id, section_index))?;

        let section_context = format!(
            "Section heading: {}\n\nSection body:\n{}\n\nStudent response:\n{}",
            heading.as_deref().unwrap_or("Untitled"),
            &body[..body.len().min(2000)],
            response
        );

        let req = ai::AiRequest {
            feature: "reader.section_check".to_string(),
            system_prompt: reader::READER_CHECK_SYSTEM.to_string(),
            user_prompt: section_context,
            model_policy: "balanced".to_string(),
            timeout_ms: 30000,
        };

        match ai::ai_request(&state.http, &config.ai, &config.profile, req).await {
            Ok(ai_response) => {
                state.db.with_conn(|conn| {
                    ai::log_result(conn, "reader.section_check", Ok(&ai_response));
                    Ok(())
                })?;

                match serde_json::from_str::<serde_json::Value>(&ai_response.content) {
                    Ok(json) => {
                        let rating =
                            normalize_reader_rating(json["rating"].as_str().unwrap_or("partial"));
                        let feedback = json["feedback"]
                            .as_str()
                            .map(|s| s.trim().to_string())
                            .filter(|s| !s.is_empty())
                            .or_else(|| {
                                Some("AI checked your response against the section.".to_string())
                            });
                        (rating, feedback, true)
                    }
                    Err(_) => {
                        let fallback = reader::evaluate_response_deterministic(&heading, &body, &response);
                        (fallback.0, Some(fallback.1), false)
                    }
                }
            }
            Err(e) => {
                state.db.with_conn(|conn| {
                    ai::log_result(conn, "reader.section_check", Err(&e));
                    Ok(())
                })?;
                let fallback =
                    reader::evaluate_response_deterministic(&heading, &body, &response);
                (fallback.0, Some(fallback.1), false)
            }
        }
    } else if let Some(rating) = self_rating {
        (rating, None, false)
    } else {
        let (_chapter_title, heading, body) = state
            .db
            .with_conn(|conn| reader::get_section_context(conn, chapter_id, section_index))?;
        let fallback = reader::evaluate_response_deterministic(&heading, &body, &response);
        (fallback.0, Some(fallback.1), false)
    };

    state.db.with_conn(|conn| {
        reader::process_check(
            conn,
            chapter_id,
            section_index,
            &response,
            &rating,
            feedback,
            evaluated_by_ai,
        )
    })
}

#[tauri::command]
pub async fn generate_section_prompt(
    state: tauri::State<'_, AppState>,
    heading: Option<String>,
    body: String,
    use_ai: Option<bool>,
) -> Result<String, String> {
    let config = state.config.read().map_err(|e| e.to_string())?.clone();
    let ai_status = ai::check_status(&config.ai);
    let ai_available =
        ai_status.provider != "none" && ai_status.configured && ai_status.has_api_key;
    let should_use_ai = use_ai.unwrap_or(ai_available) && ai_available;

    if !should_use_ai {
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
    state
        .db
        .with_conn(|conn| reader::process_synthesis(conn, chapter_id, &synthesis_text))
}
