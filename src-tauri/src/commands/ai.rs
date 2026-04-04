use crate::services::{ai, cards, notes, quiz};
use crate::AppState;
use chrono::Utc;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};

#[derive(Serialize)]
pub struct CardStudyHelpResponse {
    pub explanation: String,
    pub mnemonic: String,
    pub note_markdown: String,
    pub subject_id: i64,
    pub chapter_id: Option<i64>,
}

#[derive(Deserialize)]
struct CardStudyHelpPayload {
    explanation: String,
    mnemonic: String,
}

#[derive(Deserialize)]
struct QuizMissedHelpPayload {
    items: Vec<QuizMissedHelpItem>,
}

#[derive(Deserialize)]
struct QuizMissedHelpItem {
    question_index: i64,
    explanation: String,
    mnemonic: String,
}

struct IncorrectQuizAttempt {
    question_index: i64,
    question: quiz::QuizQuestion,
    user_answer: String,
}

type IncorrectQuizAttemptBundle = (Option<i64>, Option<i64>, Vec<IncorrectQuizAttempt>);

fn ensure_ai_available(config: &crate::services::config::AppConfig) -> Result<(), String> {
    if config.ai.provider == "none" {
        return Err("AI provider must be configured to use Study Help".to_string());
    }

    Ok(())
}

fn timestamp_label() -> String {
    Utc::now().format("%Y-%m-%d %H:%M UTC").to_string()
}

fn quote_block(value: &str) -> String {
    value
        .trim()
        .lines()
        .map(|line| format!("> {line}"))
        .collect::<Vec<_>>()
        .join("\n")
}

fn extract_json_block(content: &str) -> &str {
    let trimmed = content.trim();
    let without_fence = trimmed
        .strip_prefix("```json")
        .or_else(|| trimmed.strip_prefix("```"))
        .unwrap_or(trimmed);
    let without_suffix = without_fence
        .strip_suffix("```")
        .unwrap_or(without_fence)
        .trim();

    if let (Some(start), Some(end)) = (
        without_suffix.find(['{', '[']),
        without_suffix.rfind(['}', ']']),
    ) {
        &without_suffix[start..=end]
    } else {
        without_suffix
    }
}

fn parse_ai_json<T: for<'de> Deserialize<'de>>(content: &str) -> Result<T, String> {
    let json_block = extract_json_block(content);
    serde_json::from_str(json_block)
        .map_err(|e| format!("Study Help response was not valid JSON: {e}"))
}

fn build_card_note_markdown(
    prompt: &str,
    answer: &str,
    explanation: &str,
    mnemonic: &str,
) -> String {
    format!(
        "## Card Help - {}\n{}\n\n**Answer**\n{}\n\n**Explanation**\n{}\n\n**Mnemonic**\n{}",
        timestamp_label(),
        quote_block(prompt),
        answer.trim(),
        explanation.trim(),
        mnemonic.trim(),
    )
}

fn build_quiz_note_markdown(
    attempts: &[IncorrectQuizAttempt],
    help_items: &[QuizMissedHelpItem],
) -> Result<String, String> {
    let mut sections = vec![format!("## Quiz Help - {}", timestamp_label())];

    for attempt in attempts {
        let help = help_items
            .iter()
            .find(|item| item.question_index == attempt.question_index)
            .ok_or_else(|| {
                format!(
                    "Study Help response was missing question {}",
                    attempt.question_index + 1
                )
            })?;

        sections.push(format!(
            "### Question {}\n{}\n\n**Your answer**\n{}\n\n**Correct answer**\n{}\n\n**Explanation**\n{}\n\n**Mnemonic**\n{}",
            attempt.question_index + 1,
            quote_block(&attempt.question.prompt),
            attempt.user_answer.trim(),
            attempt.question.correct_answer.trim(),
            help.explanation.trim(),
            help.mnemonic.trim(),
        ));
    }

    Ok(sections.join("\n\n"))
}

fn load_incorrect_quiz_attempts(
    conn: &Connection,
    quiz_id: i64,
) -> Result<IncorrectQuizAttemptBundle, String> {
    let (subject_id, chapter_id): (Option<i64>, Option<i64>) = conn
        .query_row(
            "SELECT subject_id, chapter_id FROM quizzes WHERE id = ?1",
            [quiz_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| format!("Quiz not found: {e}"))?;

    let mut stmt = conn
        .prepare(
            "SELECT question_index, question_json, user_answer
             FROM quiz_attempts
             WHERE quiz_id = ?1 AND result = 'incorrect'
             ORDER BY question_index ASC",
        )
        .map_err(|e| format!("Failed to prepare quiz help query: {e}"))?;

    let attempts = stmt
        .query_map([quiz_id], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?.unwrap_or_default(),
            ))
        })
        .map_err(|e| format!("Failed to load quiz attempts: {e}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to read quiz attempts: {e}"))?
        .into_iter()
        .map(|(question_index, question_json, user_answer)| {
            let question = serde_json::from_str::<quiz::QuizQuestion>(&question_json)
                .map_err(|e| format!("Failed to parse quiz question: {e}"))?;
            Ok(IncorrectQuizAttempt {
                question_index,
                question,
                user_answer,
            })
        })
        .collect::<Result<Vec<_>, String>>()?;

    Ok((subject_id, chapter_id, attempts))
}

#[tauri::command]
pub fn check_ai_status(state: tauri::State<'_, AppState>) -> Result<ai::AiStatus, String> {
    let config = state.config.read().map_err(|e| e.to_string())?;
    Ok(ai::check_status(&config.ai))
}

#[tauri::command]
pub fn list_ai_runs(state: tauri::State<'_, AppState>) -> Result<Vec<ai::AiRunInfo>, String> {
    state.db.with_conn(ai::list_ai_runs)
}

#[tauri::command]
pub async fn ask_inline_question(
    state: tauri::State<'_, AppState>,
    context: String,
    question: String,
) -> Result<String, String> {
    let config = state.config.read().map_err(|e| e.to_string())?.clone();
    ensure_ai_available(&config)?;

    let req = ai::AiRequest {
        feature: "inline.question".to_string(),
        system_prompt: "You are a helpful study assistant. The student has highlighted some text and is asking a question about it. Answer clearly and concisely in 2-4 sentences. Focus on explanation, not just restating the text.".to_string(),
        user_prompt: format!("Highlighted text:\n{context}\n\nQuestion: {question}"),
        model_policy: "balanced".to_string(),
        timeout_ms: 60_000,
    };

    let response = match ai::ai_request(&state.http, &config.ai, &config.profile, req).await {
        Ok(response) => response,
        Err(error) => {
            state.db.with_conn(|conn| {
                ai::log_result(conn, "inline.question", Err(error.as_str()));
                Ok(())
            })?;
            return Err(error);
        }
    };

    state.db.with_conn(|conn| {
        ai::log_result(conn, "inline.question", Ok(&response));
        Ok(())
    })?;

    Ok(response.content)
}

#[tauri::command]
pub async fn generate_card_study_help(
    state: tauri::State<'_, AppState>,
    card_id: i64,
) -> Result<CardStudyHelpResponse, String> {
    let config = state.config.read().map_err(|e| e.to_string())?.clone();
    ensure_ai_available(&config)?;

    let card = state
        .db
        .with_conn(|conn| cards::get_card_info_pub(conn, card_id))?;

    let req = ai::AiRequest {
        feature: "card.study_help".to_string(),
        system_prompt: "You are a study coach helping the student remember a flashcard they are struggling with. Return JSON only with keys: explanation, mnemonic. Keep explanation to 2-4 sentences. Make the mnemonic specific, memorable, and tied to the actual answer.".to_string(),
        user_prompt: format!(
            "Card prompt:\n{}\n\nCorrect answer:\n{}\n\nCard type: {}\n\nReturn JSON only.",
            card.prompt, card.answer, card.card_type
        ),
        model_policy: "balanced".to_string(),
        timeout_ms: 60_000,
    };

    let response = match ai::ai_request(&state.http, &config.ai, &config.profile, req).await {
        Ok(response) => response,
        Err(error) => {
            state.db.with_conn(|conn| {
                ai::log_result(conn, "card.study_help", Err(error.as_str()));
                Ok(())
            })?;
            return Err(error);
        }
    };

    state.db.with_conn(|conn| {
        ai::log_result(conn, "card.study_help", Ok(&response));
        Ok(())
    })?;

    let payload: CardStudyHelpPayload = parse_ai_json(&response.content)?;
    let note_markdown = build_card_note_markdown(
        &card.prompt,
        &card.answer,
        &payload.explanation,
        &payload.mnemonic,
    );

    Ok(CardStudyHelpResponse {
        explanation: payload.explanation,
        mnemonic: payload.mnemonic,
        note_markdown,
        subject_id: card.subject_id,
        chapter_id: card.chapter_id,
    })
}

#[tauri::command]
pub fn save_card_study_help_note(
    state: tauri::State<'_, AppState>,
    card_id: i64,
    note_markdown: String,
) -> Result<notes::StudyHelpNoteResult, String> {
    state.db.with_conn(|conn| {
        let card = cards::get_card_info_pub(conn, card_id)?;
        notes::append_to_study_help_note(
            conn,
            &state.vault_path,
            Some(card.subject_id),
            card.chapter_id,
            &note_markdown,
            1,
        )
    })
}

#[tauri::command]
pub async fn create_quiz_missed_help_note(
    state: tauri::State<'_, AppState>,
    quiz_id: i64,
) -> Result<notes::StudyHelpNoteResult, String> {
    let config = state.config.read().map_err(|e| e.to_string())?.clone();
    ensure_ai_available(&config)?;

    let (subject_id, chapter_id, attempts) =
        state.db.with_conn(|conn| load_incorrect_quiz_attempts(conn, quiz_id))?;

    if attempts.is_empty() {
        return Err("There are no incorrect quiz answers to generate help for".to_string());
    }

    let quiz_prompt = attempts
        .iter()
        .map(|attempt| {
            format!(
                "- question_index: {}\n  question: {}\n  user_answer: {}\n  correct_answer: {}",
                attempt.question_index,
                attempt.question.prompt,
                attempt.user_answer,
                attempt.question.correct_answer,
            )
        })
        .collect::<Vec<_>>()
        .join("\n");

    let req = ai::AiRequest {
        feature: "quiz.missed_help".to_string(),
        system_prompt: "You are a study coach helping a learner review quiz misses. Return JSON only in the shape {\"items\":[{\"question_index\":0,\"explanation\":\"...\",\"mnemonic\":\"...\"}]}. Include one item for every provided question_index. Keep explanations concise and memory hooks concrete.".to_string(),
        user_prompt: format!(
            "Generate help for these incorrect quiz answers:\n{quiz_prompt}\n\nReturn JSON only."
        ),
        model_policy: "balanced".to_string(),
        timeout_ms: 90_000,
    };

    let response = match ai::ai_request(&state.http, &config.ai, &config.profile, req).await {
        Ok(response) => response,
        Err(error) => {
            state.db.with_conn(|conn| {
                ai::log_result(conn, "quiz.missed_help", Err(error.as_str()));
                Ok(())
            })?;
            return Err(error);
        }
    };

    state.db.with_conn(|conn| {
        ai::log_result(conn, "quiz.missed_help", Ok(&response));
        Ok(())
    })?;

    let payload: QuizMissedHelpPayload = parse_ai_json(&response.content)?;
    let note_markdown = build_quiz_note_markdown(&attempts, &payload.items)?;

    state.db.with_conn(|conn| {
        notes::append_to_study_help_note(
            conn,
            &state.vault_path,
            subject_id,
            chapter_id,
            &note_markdown,
            attempts.len() as i64,
        )
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_json_block_handles_code_fences() {
        let content = "```json\n{\"explanation\":\"A\",\"mnemonic\":\"B\"}\n```";
        assert_eq!(
            extract_json_block(content),
            "{\"explanation\":\"A\",\"mnemonic\":\"B\"}"
        );
    }

    #[test]
    fn test_build_card_note_markdown_contains_expected_sections() {
        let markdown = build_card_note_markdown(
            "What is ATP?",
            "Energy currency",
            "It stores usable cellular energy.",
            "A Tiny Power-pack",
        );

        assert!(markdown.contains("## Card Help - "));
        assert!(markdown.contains("> What is ATP?"));
        assert!(markdown.contains("**Answer**"));
        assert!(markdown.contains("**Explanation**"));
        assert!(markdown.contains("**Mnemonic**"));
    }

    fn make_attempt(index: i64, prompt: &str, correct: &str, user: &str) -> IncorrectQuizAttempt {
        IncorrectQuizAttempt {
            question_index: index,
            question: quiz::QuizQuestion {
                question_type: "short_answer".to_string(),
                prompt: prompt.to_string(),
                options: None,
                correct_answer: correct.to_string(),
                section_id: 1,
                section_heading: None,
                question_data: None,
            },
            user_answer: user.to_string(),
        }
    }

    fn make_help(index: i64, explanation: &str, mnemonic: &str) -> QuizMissedHelpItem {
        QuizMissedHelpItem {
            question_index: index,
            explanation: explanation.to_string(),
            mnemonic: mnemonic.to_string(),
        }
    }

    #[test]
    fn test_build_quiz_note_markdown_happy_path() {
        let attempts = vec![
            make_attempt(0, "What is ATP?", "Energy currency", "Protein"),
            make_attempt(2, "What is DNA?", "Genetic material", "Dunno"),
        ];
        let items = vec![
            make_help(0, "ATP stores energy", "A Tiny Power-pack"),
            make_help(2, "DNA encodes genes", "Do Not Alter"),
        ];

        let md = build_quiz_note_markdown(&attempts, &items).unwrap();

        assert!(md.contains("## Quiz Help - "));
        assert!(md.contains("### Question 1"));
        assert!(md.contains("> What is ATP?"));
        assert!(md.contains("**Your answer**\nProtein"));
        assert!(md.contains("**Correct answer**\nEnergy currency"));
        assert!(md.contains("A Tiny Power-pack"));
        assert!(md.contains("### Question 3"));
        assert!(md.contains("Do Not Alter"));
    }

    #[test]
    fn test_build_quiz_note_markdown_missing_index_returns_error() {
        let attempts = vec![
            make_attempt(0, "What is ATP?", "Energy currency", "Protein"),
        ];
        let items = vec![
            make_help(5, "Wrong index", "Oops"),
        ];

        let result = build_quiz_note_markdown(&attempts, &items);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("missing question 1"));
    }
}
