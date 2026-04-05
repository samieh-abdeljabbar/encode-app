use crate::services::{ai, quiz};
use crate::AppState;

#[tauri::command]
pub fn list_quizzes(
    state: tauri::State<'_, AppState>,
    subject_id: Option<i64>,
) -> Result<Vec<quiz::QuizListItem>, String> {
    state
        .db
        .with_conn(|conn| quiz::list_quizzes(conn, subject_id))
}

#[tauri::command]
pub fn delete_quiz(state: tauri::State<'_, AppState>, quiz_id: i64) -> Result<(), String> {
    state.db.with_conn(|conn| {
        quiz::delete_quiz(conn, quiz_id)?;
        crate::commands::export::mark_snapshot_dirty(conn)
    })
}

#[tauri::command]
pub async fn generate_quiz(
    state: tauri::State<'_, AppState>,
    chapter_id: i64,
    difficulty: String,
    question_count: i32,
    question_type: String,
) -> Result<quiz::QuizState, String> {
    // 1. Generate quiz with deterministic questions
    let mut quiz_state = state.db.with_conn(|conn| {
        quiz::generate_quiz(
            conn,
            chapter_id,
            &difficulty,
            question_count,
            &question_type,
        )
    })?;
    state.db
        .with_conn(crate::commands::export::mark_snapshot_dirty)?;

    // 2. Try AI enhancement if configured
    let config = state.config.read().map_err(|e| e.to_string())?.clone();
    if config.ai.provider != "none" {
        // Load section data for AI
        let sections = state.db.with_conn(|conn| {
            let mut stmt = conn
                .prepare(
                    "SELECT id, heading, body_markdown FROM chapter_sections
                     WHERE chapter_id = ?1 ORDER BY section_index",
                )
                .map_err(|e| e.to_string())?;
            let rows: Vec<(i64, Option<String>, String)> = stmt
                .query_map([chapter_id], |row| {
                    Ok((row.get(0)?, row.get(1)?, row.get(2)?))
                })
                .map_err(|e| e.to_string())?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?;
            Ok(rows)
        })?;

        match quiz::enhance_with_ai(
            &state.http,
            &config,
            &sections,
            &difficulty,
            question_count,
            &question_type,
        )
        .await
        {
            Ok(ai_questions) => {
                // Replace deterministic questions with AI-generated ones
                state.db.with_conn(|conn| {
                    quiz::replace_questions(conn, quiz_state.id, &ai_questions)?;
                    // Log success
                    ai::log_result(
                        conn,
                        "quiz.generate",
                        Ok(&ai::AiResponse {
                            content: String::new(),
                            provider: config.ai.provider.clone(),
                            model: String::new(),
                            latency_ms: 0,
                        }),
                    );
                    Ok(())
                })?;
                quiz_state.questions = ai_questions;
                quiz_state.attempts = quiz_state
                    .attempts
                    .iter()
                    .enumerate()
                    .map(|(i, _)| quiz::QuizAttemptInfo {
                        question_index: i as i64,
                        result: "unanswered".to_string(),
                    })
                    .collect();
            }
            Err(e) => {
                // Log failure, keep deterministic questions
                state.db.with_conn(|conn| {
                    ai::log_result(conn, "quiz.generate", Err(&e));
                    Ok(())
                })?;
            }
        }
    }

    Ok(quiz_state)
}

#[tauri::command]
pub async fn generate_subject_quiz(
    state: tauri::State<'_, AppState>,
    subject_id: i64,
    difficulty: String,
    question_count: i32,
    question_type: String,
) -> Result<quiz::QuizState, String> {
    let mut quiz_state = state.db.with_conn(|conn| {
        quiz::generate_subject_quiz(
            conn,
            subject_id,
            &difficulty,
            question_count,
            &question_type,
        )
    })?;
    state.db
        .with_conn(crate::commands::export::mark_snapshot_dirty)?;

    let config = state.config.read().map_err(|e| e.to_string())?.clone();
    if config.ai.provider != "none" {
        let sections = state.db.with_conn(|conn| {
            let mut stmt = conn
                .prepare(
                    "SELECT cs.id, cs.heading, cs.body_markdown
                     FROM chapter_sections cs
                     JOIN chapters ch ON ch.id = cs.chapter_id
                     WHERE ch.subject_id = ?1
                     ORDER BY ch.created_at, ch.id, cs.section_index",
                )
                .map_err(|e| e.to_string())?;
            let rows: Vec<(i64, Option<String>, String)> = stmt
                .query_map([subject_id], |row| {
                    Ok((row.get(0)?, row.get(1)?, row.get(2)?))
                })
                .map_err(|e| e.to_string())?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?;
            Ok(rows)
        })?;

        match quiz::enhance_with_ai(
            &state.http,
            &config,
            &sections,
            &difficulty,
            question_count,
            &question_type,
        )
        .await
        {
            Ok(ai_questions) => {
                state.db.with_conn(|conn| {
                    quiz::replace_questions(conn, quiz_state.id, &ai_questions)?;
                    ai::log_result(
                        conn,
                        "quiz.generate",
                        Ok(&ai::AiResponse {
                            content: String::new(),
                            provider: config.ai.provider.clone(),
                            model: String::new(),
                            latency_ms: 0,
                        }),
                    );
                    Ok(())
                })?;
                quiz_state.questions = ai_questions;
                quiz_state.attempts = quiz_state
                    .attempts
                    .iter()
                    .enumerate()
                    .map(|(i, _)| quiz::QuizAttemptInfo {
                        question_index: i as i64,
                        result: "unanswered".to_string(),
                    })
                    .collect();
            }
            Err(e) => {
                state.db.with_conn(|conn| {
                    ai::log_result(conn, "quiz.generate", Err(&e));
                    Ok(())
                })?;
            }
        }
    }

    Ok(quiz_state)
}

#[tauri::command]
pub async fn submit_quiz_answer(
    state: tauri::State<'_, AppState>,
    quiz_id: i64,
    question_index: i64,
    answer: String,
) -> Result<quiz::QuestionResult, String> {
    // First, do the standard submission
    let mut result = state
        .db
        .with_conn(|conn| quiz::submit_answer(conn, quiz_id, question_index, &answer))?;
    state.db
        .with_conn(crate::commands::export::mark_snapshot_dirty)?;

    // If it needs self-rating (short answer), try AI evaluation
    if result.needs_self_rating {
        let config = state.config.read().map_err(|e| e.to_string())?.clone();
        if config.ai.provider != "none" {
            // Get the question data
            let question_data = state.db.with_conn(|conn| {
                let qjson: String = conn
                    .query_row(
                        "SELECT question_json FROM quiz_attempts WHERE quiz_id = ?1 AND question_index = ?2",
                        rusqlite::params![quiz_id, question_index],
                        |row| row.get(0),
                    )
                    .map_err(|e| e.to_string())?;
                let q: quiz::QuizQuestion =
                    serde_json::from_str(&qjson).map_err(|e| e.to_string())?;
                Ok(q)
            })?;

            match quiz::evaluate_with_ai(
                &state.http,
                &config,
                &question_data.prompt,
                &question_data.correct_answer,
                &answer,
            )
            .await
            {
                Ok((verdict, explanation)) => {
                    // Update the attempt with AI verdict
                    state.db.with_conn(|conn| {
                        let eval_json = serde_json::json!({
                            "verdict": verdict,
                            "explanation": explanation,
                        });
                        conn.execute(
                            "UPDATE quiz_attempts SET result = ?3, evaluation_json = ?4
                             WHERE quiz_id = ?1 AND question_index = ?2",
                            rusqlite::params![
                                quiz_id,
                                question_index,
                                verdict,
                                eval_json.to_string()
                            ],
                        )
                        .map_err(|e| e.to_string())?;

                        // Create repair card if needed
                        let mut repair_card_id = None;
                        if verdict == "incorrect" || verdict == "partial" {
                            let (subject_id, chapter_id) = quiz::get_quiz_ids_pub(conn, quiz_id)?;
                            repair_card_id = Some(quiz::create_repair_card_pub(
                                conn,
                                subject_id,
                                chapter_id,
                                &question_data.prompt,
                                &question_data.correct_answer,
                            )?);
                        }

                        ai::log_result(
                            conn,
                            "quiz.evaluate",
                            Ok(&ai::AiResponse {
                                content: String::new(),
                                provider: config.ai.provider.clone(),
                                model: String::new(),
                                latency_ms: 0,
                            }),
                        );

                        result = quiz::QuestionResult {
                            verdict,
                            correct_answer: question_data.correct_answer.clone(),
                            explanation: Some(explanation),
                            repair_card_id,
                            needs_self_rating: false,
                        };

                        Ok(())
                    })?;
                }
                Err(e) => {
                    // Log failure, keep needs_self_rating = true
                    state.db.with_conn(|conn| {
                        ai::log_result(conn, "quiz.evaluate", Err(&e));
                        Ok(())
                    })?;
                }
            }
        }
    }

    Ok(result)
}

#[tauri::command]
pub fn submit_quiz_self_rating(
    state: tauri::State<'_, AppState>,
    quiz_id: i64,
    question_index: i64,
    self_rating: String,
) -> Result<quiz::QuestionResult, String> {
    state.db.with_conn(|conn| {
        let result = quiz::submit_self_rating(conn, quiz_id, question_index, &self_rating)?;
        crate::commands::export::mark_snapshot_dirty(conn)?;
        Ok(result)
    })
}

#[tauri::command]
pub fn get_quiz(
    state: tauri::State<'_, AppState>,
    quiz_id: i64,
) -> Result<quiz::QuizState, String> {
    state.db.with_conn(|conn| quiz::get_quiz(conn, quiz_id))
}

#[tauri::command]
pub fn complete_quiz(
    state: tauri::State<'_, AppState>,
    quiz_id: i64,
) -> Result<quiz::QuizSummary, String> {
    state.db.with_conn(|conn| {
        let summary = quiz::complete_quiz(conn, quiz_id)?;
        crate::commands::export::mark_snapshot_dirty(conn)?;
        Ok(summary)
    })
}
