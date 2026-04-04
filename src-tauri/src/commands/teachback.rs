use crate::services::{ai, teachback};
use crate::AppState;
use rusqlite::OptionalExtension;

fn chapter_body(conn: &rusqlite::Connection, chapter_id: i64) -> Result<String, String> {
    let raw_markdown: String = conn
        .query_row(
            "SELECT raw_markdown FROM chapters WHERE id = ?1",
            [chapter_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .unwrap_or_default();

    if !raw_markdown.trim().is_empty() {
        return Ok(raw_markdown);
    }

    let mut stmt = conn
        .prepare(
            "SELECT heading, body_markdown FROM chapter_sections
             WHERE chapter_id = ?1 ORDER BY section_index",
        )
        .map_err(|e| e.to_string())?;
    let texts: Vec<String> = stmt
        .query_map([chapter_id], |row| {
            let heading: Option<String> = row.get(0)?;
            let body: String = row.get(1)?;
            Ok(if let Some(h) = heading {
                format!("## {h}\n\n{body}")
            } else {
                body
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(texts.join("\n\n"))
}

#[tauri::command]
pub async fn start_teachback(
    state: tauri::State<'_, AppState>,
    chapter_id: i64,
) -> Result<teachback::TeachbackStart, String> {
    let mut result = state
        .db
        .with_conn(|conn| teachback::start_teachback(conn, chapter_id))?;

    let config = state.config.read().map_err(|e| e.to_string())?.clone();
    if config.ai.provider != "none" {
        let sections_text = state.db.with_conn(|conn| chapter_body(conn, chapter_id))?;

        let ai_req = ai::AiRequest {
            feature: "teachback.generate_prompt".to_string(),
            system_prompt: teachback::TEACHBACK_GENERATE_PROMPT.to_string(),
            user_prompt: format!("Chapter: {}\n\n{}", result.chapter_title, sections_text),
            model_policy: "balanced".to_string(),
            timeout_ms: 60000,
        };

        match ai::ai_request(&state.http, &config.ai, &config.profile, ai_req).await {
            Ok(response) => {
                let ai_prompt = response.content.trim().to_string();
                if !ai_prompt.is_empty() {
                    state.db.with_conn(|conn| {
                        conn.execute(
                            "UPDATE teachbacks SET prompt = ?2 WHERE id = ?1",
                            rusqlite::params![result.id, ai_prompt],
                        )
                        .map_err(|e| e.to_string())?;
                        ai::log_result(conn, "teachback.generate_prompt", Ok(&response));
                        Ok(())
                    })?;
                    result.prompt = ai_prompt;
                }
            }
            Err(e) => {
                state.db.with_conn(|conn| {
                    ai::log_result(conn, "teachback.generate_prompt", Err(&e));
                    Ok(())
                })?;
            }
        }
    }

    Ok(result)
}

#[tauri::command]
pub async fn submit_teachback(
    state: tauri::State<'_, AppState>,
    teachback_id: i64,
    response: String,
) -> Result<teachback::TeachbackResult, String> {
    let config = state.config.read().map_err(|e| e.to_string())?.clone();

    if config.ai.provider == "none" {
        return Ok(teachback::TeachbackResult {
            mastery: String::new(),
            scores: teachback::RubricScores {
                accuracy: 0,
                clarity: 0,
                completeness: 0,
                example: 0,
                jargon: 0,
            },
            overall: 0,
            strongest: String::new(),
            biggest_gap: String::new(),
            repair_card_id: None,
            needs_self_rating: true,
        });
    }

    let (chapter_id, prompt) = state.db.with_conn(|conn| {
        let row: (Option<i64>, String) = conn
            .query_row(
                "SELECT chapter_id, prompt FROM teachbacks WHERE id = ?1",
                [teachback_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|e| format!("Teachback not found: {e}"))?;
        Ok(row)
    })?;

    let sections_text = if let Some(ch_id) = chapter_id {
        state.db.with_conn(|conn| chapter_body(conn, ch_id))?
    } else {
        String::new()
    };

    let ai_req = ai::AiRequest {
        feature: "teachback.evaluate".to_string(),
        system_prompt: teachback::TEACHBACK_EVALUATE_PROMPT.to_string(),
        user_prompt: format!(
            "Prompt given: {}\n\nChapter content:\n{}\n\nStudent's explanation:\n{}",
            prompt, sections_text, response
        ),
        model_policy: "strong_reasoning".to_string(),
        timeout_ms: 90000,
    };

    match ai::ai_request(&state.http, &config.ai, &config.profile, ai_req).await {
        Ok(ai_response) => match serde_json::from_str::<serde_json::Value>(&ai_response.content) {
            Ok(json) => {
                let scores = teachback::RubricScores {
                    accuracy: json["scores"]["accuracy"].as_i64().unwrap_or(50) as i32,
                    clarity: json["scores"]["clarity"].as_i64().unwrap_or(50) as i32,
                    completeness: json["scores"]["completeness"].as_i64().unwrap_or(50) as i32,
                    example: json["scores"]["example"].as_i64().unwrap_or(50) as i32,
                    jargon: json["scores"]["jargon"].as_i64().unwrap_or(50) as i32,
                };
                let strongest = json["strongest"].as_str().unwrap_or("").to_string();
                let biggest_gap = json["biggest_gap"].as_str().unwrap_or("").to_string();

                let result = state.db.with_conn(|conn| {
                    ai::log_result(conn, "teachback.evaluate", Ok(&ai_response));
                    teachback::finalize_teachback(
                        conn,
                        teachback_id,
                        &response,
                        &scores,
                        &strongest,
                        &biggest_gap,
                        None,
                    )
                })?;
                Ok(result)
            }
            Err(_) => {
                state.db.with_conn(|conn| {
                    ai::log_result(
                        conn,
                        "teachback.evaluate",
                        Err("Failed to parse AI response as JSON"),
                    );
                    Ok(())
                })?;
                Ok(teachback::TeachbackResult {
                    mastery: String::new(),
                    scores: teachback::RubricScores {
                        accuracy: 0,
                        clarity: 0,
                        completeness: 0,
                        example: 0,
                        jargon: 0,
                    },
                    overall: 0,
                    strongest: String::new(),
                    biggest_gap: String::new(),
                    repair_card_id: None,
                    needs_self_rating: true,
                })
            }
        },
        Err(e) => {
            state.db.with_conn(|conn| {
                ai::log_result(conn, "teachback.evaluate", Err(&e));
                Ok(())
            })?;
            Ok(teachback::TeachbackResult {
                mastery: String::new(),
                scores: teachback::RubricScores {
                    accuracy: 0,
                    clarity: 0,
                    completeness: 0,
                    example: 0,
                    jargon: 0,
                },
                overall: 0,
                strongest: String::new(),
                biggest_gap: String::new(),
                repair_card_id: None,
                needs_self_rating: true,
            })
        }
    }
}

#[tauri::command]
pub fn submit_teachback_self_rating(
    state: tauri::State<'_, AppState>,
    teachback_id: i64,
    response: String,
    ratings: teachback::RubricScores,
) -> Result<teachback::TeachbackResult, String> {
    state
        .db
        .with_conn(|conn| teachback::submit_self_rating(conn, teachback_id, &response, &ratings))
}

#[tauri::command]
pub fn list_teachbacks(
    state: tauri::State<'_, AppState>,
    subject_id: Option<i64>,
) -> Result<Vec<teachback::TeachbackListItem>, String> {
    state
        .db
        .with_conn(|conn| teachback::list_teachbacks(conn, subject_id))
}
