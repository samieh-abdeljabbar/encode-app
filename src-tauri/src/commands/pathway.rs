use crate::services::{ai, pathway};
use crate::AppState;

#[tauri::command]
pub async fn generate_pathway_outline(
    state: tauri::State<'_, AppState>,
    topic: String,
    mastery: String,
    scope: String,
) -> Result<pathway::PathwayOutline, String> {
    let config = state.config.read().map_err(|e| e.to_string())?.clone();
    if config.ai.provider == "none" {
        return Err("AI provider must be configured to generate learning pathways".to_string());
    }

    let (system, user) = pathway::outline_prompt(&topic, &mastery, &scope);
    let req = ai::AiRequest {
        feature: "pathway.outline".to_string(),
        system_prompt: system,
        user_prompt: user,
        model_policy: "balanced".to_string(),
        timeout_ms: 60000,
    };

    let response = ai::ai_request(&state.http, &config.ai, &config.profile, req).await?;

    state.db.with_conn(|conn| {
        ai::log_result(conn, "pathway.outline", Ok(&response));
        Ok(())
    })?;

    let outline: pathway::PathwayOutline = serde_json::from_str(&response.content).map_err(
        |e| {
            format!(
                "Failed to parse outline: {e}. Raw: {}",
                &response.content[..200.min(response.content.len())]
            )
        },
    )?;

    Ok(outline)
}

#[tauri::command]
pub async fn generate_pathway_chapter(
    state: tauri::State<'_, AppState>,
    topic: String,
    mastery: String,
    title: String,
    description: String,
    chapter_index: i32,
    total_chapters: i32,
) -> Result<pathway::ChapterContent, String> {
    let config = state.config.read().map_err(|e| e.to_string())?.clone();

    let (system, user) = pathway::chapter_content_prompt(
        &topic,
        &mastery,
        &title,
        &description,
        chapter_index,
        total_chapters,
    );
    let req = ai::AiRequest {
        feature: "pathway.chapter".to_string(),
        system_prompt: system,
        user_prompt: user,
        model_policy: "balanced".to_string(),
        timeout_ms: 90000,
    };

    let response = ai::ai_request(&state.http, &config.ai, &config.profile, req).await?;

    state.db.with_conn(|conn| {
        ai::log_result(conn, "pathway.chapter", Ok(&response));
        Ok(())
    })?;

    let content: pathway::ChapterContent = serde_json::from_str(&response.content)
        .map_err(|e| format!("Failed to parse chapter content: {e}"))?;

    Ok(content)
}

#[tauri::command]
pub fn create_pathway_subject(
    state: tauri::State<'_, AppState>,
    subject_name: String,
    chapters: Vec<(pathway::ChapterOutline, pathway::ChapterContent)>,
) -> Result<pathway::PathwayResult, String> {
    state
        .db
        .with_conn(|conn| pathway::create_pathway(conn, &subject_name, &chapters))
}
