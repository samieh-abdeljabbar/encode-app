use rusqlite::Connection;
use serde::{Deserialize, Serialize};

use crate::services::ai::{self, AiRequest};
use crate::services::config::AppConfig;

pub fn quiz_generate_prompt(difficulty: &str, question_count: i32, question_type_filter: &str) -> String {
    let difficulty_guidance = match difficulty {
        "beginner" => "Difficulty: BEGINNER. Test understanding using the same context as the material. Focus on definitions, explanations, and comparisons. Use more multiple choice and true/false. Provide scaffolding in question stems. Target Bloom's levels: Remember and Understand.",
        "expert" => "Difficulty: EXPERT. Test analysis and evaluation in novel contexts. Require synthesis of multiple concepts from different sections. Prefer short answer questions that require detailed explanation. Ask students to compare, critique, or design. Target Bloom's levels: Analyze and Evaluate.",
        _ => "Difficulty: INTERMEDIATE. Test application and analysis. Use related but different contexts from the source material. Ask students to predict outcomes, solve problems, or explain relationships. Mix question types evenly. Target Bloom's levels: Apply and Analyze.",
    };

    let type_constraint = match question_type_filter {
        "multiple_choice" => "\nIMPORTANT: Generate ONLY multiple_choice questions.",
        "short_answer" => "\nIMPORTANT: Generate ONLY short_answer questions.",
        "true_false" => "\nIMPORTANT: Generate ONLY true_false questions.",
        "fill_blank" => "\nIMPORTANT: Generate ONLY fill_blank questions.",
        _ => "", // "mixed" — no constraint
    };

    format!(r#"You are an expert quiz question designer. Generate quiz questions from the study material below.

CRITICAL RULES:
1. REPHRASE concepts — NEVER copy sentences from the source material. Use different wording.
2. Each question tests ONE specific concept, not multiple concepts.
3. Questions must be answerable from the material but require UNDERSTANDING, not just recognition.
4. For multiple choice: each distractor must represent a realistic misconception or common error. Never use absurd distractors. All options must be similar in length and structure. Never use "all of the above" or "none of the above".
5. For short answer: ask "why" or "how", not "what". Constrain to "In 1-2 sentences, explain..."
6. For fill-in-the-blank: rephrase the sentence — do NOT copy verbatim from the material and blank out a word. The blank must be a key term that carries conceptual weight.
7. For true/false: require explanation — don't make statements that can be guessed.

{difficulty_guidance}
{type_constraint}

Generate exactly {question_count} questions.

Return a JSON array of question objects. Each question must have:
- "question_type": one of "short_answer", "multiple_choice", "true_false", "fill_blank"
- "prompt": the question text (rephrased from source material)
- "options": array of 4 strings (for multiple_choice only, null otherwise)
- "correct_answer": the correct answer
- "section_index": which section (0-indexed) this question is about

Return ONLY valid JSON, no markdown fences."#, question_count = question_count, difficulty_guidance = difficulty_guidance, type_constraint = type_constraint)
}

pub const QUIZ_EVALUATE_SYSTEM_PROMPT: &str = r#"You are evaluating a student's answer to a quiz question.

Return a JSON object with:
- "verdict": "correct", "partial", or "incorrect"
- "explanation": brief explanation (1-2 sentences). If incorrect, explain WHY the answer is wrong and what the correct understanding is. If partial, explain what was missing.

Rules:
- Be fair but rigorous — the answer must demonstrate understanding, not just pattern matching
- "partial" means the student showed some understanding but missed key points or was vague
- "correct" means the core concept is accurately captured, even if wording differs from the exact answer
- "incorrect" means a fundamental misconception or completely wrong answer
- Always explain the reasoning, especially for wrong answers — this is where learning happens
- Return ONLY valid JSON, no markdown fences"#;

#[derive(Serialize, Deserialize, Clone)]
pub struct QuizQuestion {
    pub question_type: String,
    pub prompt: String,
    pub options: Option<Vec<String>>,
    pub correct_answer: String,
    pub section_id: i64,
    pub section_heading: Option<String>,
}

#[derive(Serialize)]
pub struct QuestionResult {
    pub verdict: String,
    pub correct_answer: String,
    pub explanation: Option<String>,
    pub repair_card_id: Option<i64>,
    pub needs_self_rating: bool,
}

#[derive(Serialize)]
pub struct QuizAttemptInfo {
    pub question_index: i64,
    pub result: String,
}

#[derive(Serialize)]
pub struct QuizState {
    pub id: i64,
    pub chapter_id: i64,
    pub chapter_title: String,
    pub questions: Vec<QuizQuestion>,
    pub attempts: Vec<QuizAttemptInfo>,
    pub score: Option<f64>,
}

#[derive(Serialize)]
pub struct QuizSummary {
    pub score: f64,
    pub total: i64,
    pub correct: i64,
    pub partial: i64,
    pub incorrect: i64,
    pub repair_cards_created: i64,
    pub retest_scheduled: bool,
}

#[derive(Serialize)]
pub struct QuizListItem {
    pub id: i64,
    pub chapter_id: Option<i64>,
    pub chapter_title: String,
    pub subject_name: String,
    pub score: Option<f64>,
    pub question_count: i64,
    pub generated_at: String,
}

pub fn list_quizzes(conn: &Connection, subject_id: Option<i64>) -> Result<Vec<QuizListItem>, String> {
    let mut sql = String::from(
        "SELECT q.id, q.chapter_id, COALESCE(ch.title, 'Unknown'), s.name, q.score,
                (SELECT COUNT(*) FROM quiz_attempts qa WHERE qa.quiz_id = q.id), q.generated_at
         FROM quizzes q
         LEFT JOIN chapters ch ON ch.id = q.chapter_id
         JOIN subjects s ON s.id = q.subject_id
         WHERE 1=1",
    );

    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(sid) = subject_id {
        sql.push_str(" AND q.subject_id = ?1");
        params.push(Box::new(sid));
    }

    sql.push_str(" ORDER BY q.generated_at DESC LIMIT 50");

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();

    let items = stmt
        .query_map(param_refs.as_slice(), |row| {
            Ok(QuizListItem {
                id: row.get(0)?,
                chapter_id: row.get(1)?,
                chapter_title: row.get(2)?,
                subject_name: row.get(3)?,
                score: row.get(4)?,
                question_count: row.get(5)?,
                generated_at: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(items)
}

pub fn delete_quiz(conn: &Connection, quiz_id: i64) -> Result<(), String> {
    // Delete attempts first (FK constraint)
    conn.execute("DELETE FROM quiz_attempts WHERE quiz_id = ?1", [quiz_id])
        .map_err(|e| format!("Failed to delete quiz attempts: {e}"))?;
    conn.execute("DELETE FROM quizzes WHERE id = ?1", [quiz_id])
        .map_err(|e| format!("Failed to delete quiz: {e}"))?;
    Ok(())
}

pub fn generate_quiz(conn: &Connection, chapter_id: i64, difficulty: &str, question_count: i32, question_type_filter: &str) -> Result<QuizState, String> {
    // Query chapter
    let (subject_id, title, status): (i64, String, String) = conn
        .query_row(
            "SELECT subject_id, title, status FROM chapters WHERE id = ?1",
            [chapter_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|e| format!("Chapter not found: {e}"))?;

    // Validate status
    if status != "ready_for_quiz" && status != "mastering" && status != "stable" {
        return Err(format!(
            "Chapter is not ready for quiz (current status: {status})"
        ));
    }

    // Query sections
    let mut stmt = conn
        .prepare(
            "SELECT id, section_index, heading, body_markdown, word_count
             FROM chapter_sections WHERE chapter_id = ?1
             ORDER BY section_index",
        )
        .map_err(|e| format!("Failed to prepare sections query: {e}"))?;

    let sections: Vec<(i64, i32, Option<String>, String, i32)> = stmt
        .query_map([chapter_id], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
            ))
        })
        .map_err(|e| format!("Failed to query sections: {e}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    if sections.is_empty() {
        return Err("Chapter has no sections".to_string());
    }

    // Build input for deterministic question generation
    let section_data: Vec<(i64, Option<String>, String)> = sections
        .iter()
        .map(|(id, _idx, heading, body, _wc)| (*id, heading.clone(), body.clone()))
        .collect();

    let max_q = std::cmp::min(question_count as usize, section_data.len());
    let questions = generate_questions_deterministic(&section_data, max_q, question_type_filter);

    // Insert quiz
    let config = serde_json::json!({"use_ai": false, "difficulty": difficulty, "question_count": question_count, "question_type": question_type_filter});
    conn.execute(
        "INSERT INTO quizzes (subject_id, chapter_id, scope_type, config_json, generated_at)
         VALUES (?1, ?2, 'chapter', ?3, datetime('now'))",
        rusqlite::params![subject_id, chapter_id, config.to_string()],
    )
    .map_err(|e| format!("Failed to insert quiz: {e}"))?;

    let quiz_id = conn.last_insert_rowid();

    // Insert quiz_attempts — one per question
    let mut attempts = Vec::new();
    for (idx, question) in questions.iter().enumerate() {
        let question_json =
            serde_json::to_string(question).map_err(|e| format!("Failed to serialize question: {e}"))?;

        conn.execute(
            "INSERT INTO quiz_attempts (quiz_id, question_index, question_json, result, created_at)
             VALUES (?1, ?2, ?3, 'unanswered', datetime('now'))",
            rusqlite::params![quiz_id, idx as i64, question_json],
        )
        .map_err(|e| format!("Failed to insert quiz attempt: {e}"))?;

        attempts.push(QuizAttemptInfo {
            question_index: idx as i64,
            result: "unanswered".to_string(),
        });
    }

    Ok(QuizState {
        id: quiz_id,
        chapter_id,
        chapter_title: title,
        questions,
        attempts,
        score: None,
    })
}

pub fn generate_questions_deterministic(
    sections: &[(i64, Option<String>, String)],
    max_questions: usize,
    question_type_filter: &str,
) -> Vec<QuizQuestion> {
    let base_cycle = [
        "short_answer",
        "multiple_choice",
        "short_answer",
        "true_false",
        "short_answer",
        "multiple_choice",
        "fill_blank",
        "short_answer",
    ];

    // Filter type_cycle based on question_type_filter
    let type_cycle: Vec<&str> = match question_type_filter {
        "multiple_choice" => vec!["multiple_choice"],
        "short_answer" => vec!["short_answer"],
        "true_false" => vec!["true_false"],
        "fill_blank" => vec!["fill_blank"],
        _ => base_cycle.to_vec(), // "mixed" or unknown — use full cycle
    };

    let mut questions = Vec::new();

    // Collect all headings for MC distractors
    let all_headings: Vec<String> = sections
        .iter()
        .filter_map(|(_, h, _)| h.clone())
        .collect();

    for i in 0..max_questions {
        let (section_id, heading, body) = &sections[i];
        let qtype = type_cycle[i % type_cycle.len()];
        let heading_display = heading
            .as_deref()
            .unwrap_or("this section")
            .to_string();

        let question = match qtype {
            "short_answer" => generate_short_answer(*section_id, heading, &heading_display, body),
            "multiple_choice" => generate_multiple_choice(
                *section_id,
                heading,
                &heading_display,
                body,
                i,
                &all_headings,
            ),
            "true_false" => generate_true_false(*section_id, heading, &heading_display, body, i),
            "fill_blank" => generate_fill_blank(*section_id, heading, &heading_display, body),
            _ => generate_short_answer(*section_id, heading, &heading_display, body),
        };

        questions.push(question);
    }

    questions
}

fn generate_short_answer(
    section_id: i64,
    heading: &Option<String>,
    heading_display: &str,
    body: &str,
) -> QuizQuestion {
    let text = format!(
        "{} {}",
        heading.as_deref().unwrap_or(""),
        &body[..body.len().min(400)]
    )
    .to_lowercase();

    let prompt = if text.contains("step")
        || text.contains("process")
        || text.contains("procedure")
        || text.contains("how to")
    {
        format!("What are the main steps or process described in '{heading_display}'?")
    } else if text.contains("vs")
        || text.contains("compar")
        || text.contains("difference")
    {
        format!("What are the key differences discussed in '{heading_display}'?")
    } else if text.contains("define")
        || text.contains("definition")
        || text.contains("meaning")
        || text.contains("concept")
    {
        format!("Explain the key concept from '{heading_display}' in your own words.")
    } else {
        format!("Summarize the main idea of '{heading_display}' in 2-3 sentences.")
    };

    let correct_answer = body.chars().take(200).collect::<String>();

    QuizQuestion {
        question_type: "short_answer".to_string(),
        prompt,
        options: None,
        correct_answer,
        section_id,
        section_heading: heading.clone(),
    }
}

fn generate_multiple_choice(
    section_id: i64,
    heading: &Option<String>,
    heading_display: &str,
    body: &str,
    section_index: usize,
    all_headings: &[String],
) -> QuizQuestion {
    let prompt = format!(
        "Which of the following best describes the topic of '{heading_display}'?"
    );

    // Correct answer: heading text or first sentence of body
    let correct_answer = heading
        .clone()
        .unwrap_or_else(|| first_sentence(body).to_string());

    // Generate distractors from other section headings
    let mut distractors: Vec<String> = all_headings
        .iter()
        .filter(|h| {
            heading
                .as_ref()
                .map(|own| own != *h)
                .unwrap_or(true)
        })
        .take(3)
        .cloned()
        .collect();

    // Pad with generic alternatives if not enough distractors
    let generic = [
        "None of the above",
        "All of the above",
        "This topic is not covered",
    ];
    let mut gi = 0;
    while distractors.len() < 3 && gi < generic.len() {
        distractors.push(generic[gi].to_string());
        gi += 1;
    }

    // Build options and shuffle deterministically using section_index as seed
    let mut options = vec![correct_answer.clone()];
    options.extend(distractors);

    // Deterministic shuffle: rotate by section_index
    let rotate_by = section_index % options.len();
    options.rotate_left(rotate_by);

    QuizQuestion {
        question_type: "multiple_choice".to_string(),
        prompt,
        options: Some(options),
        correct_answer,
        section_id,
        section_heading: heading.clone(),
    }
}

fn generate_true_false(
    section_id: i64,
    heading: &Option<String>,
    heading_display: &str,
    body: &str,
    section_index: usize,
) -> QuizQuestion {
    let sentence = first_sentence(body);

    let prompt = if section_index % 2 == 0 {
        format!("True or False: {sentence}")
    } else {
        format!(
            "True or False: The section '{heading_display}' primarily discusses {sentence}"
        )
    };

    // Keep it simple for deterministic mode — always true
    QuizQuestion {
        question_type: "true_false".to_string(),
        prompt,
        options: None,
        correct_answer: "True".to_string(),
        section_id,
        section_heading: heading.clone(),
    }
}

fn generate_fill_blank(
    section_id: i64,
    heading: &Option<String>,
    heading_display: &str,
    body: &str,
) -> QuizQuestion {
    match heading {
        Some(h) => {
            let body_preview: String = body.chars().take(100).collect();
            QuizQuestion {
                question_type: "fill_blank".to_string(),
                prompt: format!("The section titled '____' covers: {body_preview}"),
                options: None,
                correct_answer: h.clone(),
                section_id,
                section_heading: Some(h.clone()),
            }
        }
        None => {
            // Fall back to short_answer if no heading
            generate_short_answer(section_id, heading, heading_display, body)
        }
    }
}

fn first_sentence(text: &str) -> &str {
    text.split('.')
        .next()
        .unwrap_or(text)
        .trim()
}

fn create_repair_card(
    conn: &Connection,
    subject_id: i64,
    chapter_id: Option<i64>,
    question: &QuizQuestion,
    user_answer: &str,
) -> Result<i64, String> {
    let prompt = question.prompt.clone();
    let answer = question.correct_answer.clone();

    conn.execute(
        "INSERT INTO cards (subject_id, chapter_id, source_type, prompt, answer, card_type, status, created_at)
         VALUES (?1, ?2, 'quiz_miss', ?3, ?4, 'basic', 'active', datetime('now'))",
        rusqlite::params![subject_id, chapter_id, prompt, answer],
    )
    .map_err(|e| format!("Failed to create repair card: {e}"))?;

    let card_id = conn.last_insert_rowid();

    conn.execute(
        "INSERT INTO card_schedule (card_id, next_review, stability, difficulty, reps, lapses)
         VALUES (?1, datetime('now'), 1.0, 5.0, 0, 0)",
        [card_id],
    )
    .map_err(|e| format!("Failed to create card schedule: {e}"))?;

    Ok(card_id)
}

pub fn submit_answer(
    conn: &Connection,
    quiz_id: i64,
    question_index: i64,
    user_answer: &str,
) -> Result<QuestionResult, String> {
    // Load the quiz_attempt
    let (question_json, current_result): (String, String) = conn
        .query_row(
            "SELECT question_json, result FROM quiz_attempts WHERE quiz_id = ?1 AND question_index = ?2",
            rusqlite::params![quiz_id, question_index],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| format!("Quiz attempt not found: {e}"))?;

    if current_result != "unanswered" {
        return Err("Question already answered".to_string());
    }

    // Deserialize question
    let question: QuizQuestion =
        serde_json::from_str(&question_json).map_err(|e| format!("Failed to parse question: {e}"))?;

    // Evaluate based on type
    match question.question_type.as_str() {
        "short_answer" => {
            // Short answer needs self-rating — store the answer but don't finalize
            let evaluation = serde_json::json!({
                "needs_self_rating": true,
                "user_answer": user_answer,
            });

            conn.execute(
                "UPDATE quiz_attempts SET user_answer = ?3, evaluation_json = ?4 WHERE quiz_id = ?1 AND question_index = ?2",
                rusqlite::params![quiz_id, question_index, user_answer, evaluation.to_string()],
            )
            .map_err(|e| format!("Failed to update attempt: {e}"))?;

            // Log study event
            log_quiz_event(conn, quiz_id, question_index, "quiz_answer_submitted")?;

            Ok(QuestionResult {
                verdict: user_answer.to_string(),
                correct_answer: question.correct_answer,
                explanation: None,
                repair_card_id: None,
                needs_self_rating: true,
            })
        }
        "multiple_choice" | "true_false" | "fill_blank" => {
            let verdict = if matches_answer(user_answer, &question.correct_answer, &question.question_type) {
                "correct"
            } else {
                "incorrect"
            };

            let mut repair_card_id = None;

            // Create repair card for incorrect answers
            if verdict == "incorrect" {
                let (subject_id, chapter_id) = get_quiz_ids(conn, quiz_id)?;
                let card_id = create_repair_card(conn, subject_id, chapter_id, &question, user_answer)?;
                repair_card_id = Some(card_id);
            }

            let evaluation = serde_json::json!({
                "verdict": verdict,
                "repair_card_id": repair_card_id,
            });

            conn.execute(
                "UPDATE quiz_attempts SET user_answer = ?3, evaluation_json = ?4, result = ?5
                 WHERE quiz_id = ?1 AND question_index = ?2",
                rusqlite::params![
                    quiz_id,
                    question_index,
                    user_answer,
                    evaluation.to_string(),
                    verdict,
                ],
            )
            .map_err(|e| format!("Failed to update attempt: {e}"))?;

            // Log study event
            log_quiz_event(conn, quiz_id, question_index, "quiz_answer_submitted")?;

            Ok(QuestionResult {
                verdict: verdict.to_string(),
                correct_answer: question.correct_answer,
                explanation: None,
                repair_card_id,
                needs_self_rating: false,
            })
        }
        _ => Err(format!("Unknown question type: {}", question.question_type)),
    }
}

pub fn submit_self_rating(
    conn: &Connection,
    quiz_id: i64,
    question_index: i64,
    self_rating: &str,
) -> Result<QuestionResult, String> {
    // Load existing attempt
    let (question_json, evaluation_json, current_result): (String, Option<String>, String) = conn
        .query_row(
            "SELECT question_json, evaluation_json, result FROM quiz_attempts WHERE quiz_id = ?1 AND question_index = ?2",
            rusqlite::params![quiz_id, question_index],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|e| format!("Quiz attempt not found: {e}"))?;

    // Validate it was marked as needs_self_rating
    if current_result != "unanswered" {
        return Err("Question already rated".to_string());
    }

    let eval_str = evaluation_json.ok_or("No evaluation data found — answer first")?;
    let eval: serde_json::Value =
        serde_json::from_str(&eval_str).map_err(|e| format!("Failed to parse evaluation: {e}"))?;

    if eval.get("needs_self_rating").and_then(|v| v.as_bool()) != Some(true) {
        return Err("This question does not require self-rating".to_string());
    }

    // Validate self_rating value
    if self_rating != "correct" && self_rating != "partial" && self_rating != "incorrect" {
        return Err(format!("Invalid self_rating: {self_rating}"));
    }

    let question: QuizQuestion =
        serde_json::from_str(&question_json).map_err(|e| format!("Failed to parse question: {e}"))?;

    let user_answer = eval
        .get("user_answer")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let mut repair_card_id = None;

    // Create repair card for partial/incorrect
    if self_rating == "partial" || self_rating == "incorrect" {
        let (subject_id, chapter_id) = get_quiz_ids(conn, quiz_id)?;
        let card_id = create_repair_card(conn, subject_id, chapter_id, &question, &user_answer)?;
        repair_card_id = Some(card_id);
    }

    let new_evaluation = serde_json::json!({
        "verdict": self_rating,
        "self_rated": true,
        "user_answer": user_answer,
        "repair_card_id": repair_card_id,
    });

    conn.execute(
        "UPDATE quiz_attempts SET evaluation_json = ?3, result = ?4
         WHERE quiz_id = ?1 AND question_index = ?2",
        rusqlite::params![quiz_id, question_index, new_evaluation.to_string(), self_rating],
    )
    .map_err(|e| format!("Failed to update attempt: {e}"))?;

    Ok(QuestionResult {
        verdict: self_rating.to_string(),
        correct_answer: question.correct_answer,
        explanation: None,
        repair_card_id,
        needs_self_rating: false,
    })
}

pub fn complete_quiz(conn: &Connection, quiz_id: i64) -> Result<QuizSummary, String> {
    // Count results
    let mut stmt = conn
        .prepare("SELECT result, COUNT(*) FROM quiz_attempts WHERE quiz_id = ?1 GROUP BY result")
        .map_err(|e| format!("Failed to prepare results query: {e}"))?;

    let result_counts: Vec<(String, i64)> = stmt
        .query_map([quiz_id], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|e| format!("Failed to query results: {e}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let mut correct: i64 = 0;
    let mut partial: i64 = 0;
    let mut incorrect: i64 = 0;
    let mut unanswered: i64 = 0;

    for (result, count) in &result_counts {
        match result.as_str() {
            "correct" => correct = *count,
            "partial" => partial = *count,
            "incorrect" => incorrect = *count,
            "unanswered" => unanswered = *count,
            _ => {}
        }
    }

    if unanswered > 0 {
        return Err(format!(
            "Quiz not complete: {unanswered} question(s) still unanswered"
        ));
    }

    let total = correct + partial + incorrect;
    if total == 0 {
        return Err("Quiz has no questions".to_string());
    }

    let score = correct as f64 / total as f64;

    // Update quiz score
    conn.execute(
        "UPDATE quizzes SET score = ?2 WHERE id = ?1",
        rusqlite::params![quiz_id, score],
    )
    .map_err(|e| format!("Failed to update quiz score: {e}"))?;

    // Get chapter_id
    let chapter_id: Option<i64> = conn
        .query_row(
            "SELECT chapter_id FROM quizzes WHERE id = ?1",
            [quiz_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("Failed to get quiz chapter: {e}"))?;

    let mut retest_scheduled = false;

    if let Some(cid) = chapter_id {
        if score >= 0.8 {
            // Transition chapter ready_for_quiz → mastering
            conn.execute(
                "UPDATE chapters SET status = 'mastering', updated_at = datetime('now')
                 WHERE id = ?1 AND status = 'ready_for_quiz'",
                [cid],
            )
            .map_err(|e| format!("Failed to update chapter status: {e}"))?;
        } else {
            // Schedule retest
            let config = serde_json::json!({
                "use_ai": false,
                "retest_after": "scheduled",
            });
            conn.execute(
                "UPDATE quizzes SET config_json = ?2 WHERE id = ?1",
                rusqlite::params![quiz_id, config.to_string()],
            )
            .map_err(|e| format!("Failed to update quiz config: {e}"))?;

            retest_scheduled = true;
        }
    }

    // Count repair cards created from evaluation_json
    let repair_cards_created: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM quiz_attempts
             WHERE quiz_id = ?1 AND evaluation_json LIKE '%repair_card_id%'
             AND evaluation_json NOT LIKE '%\"repair_card_id\":null%'
             AND evaluation_json NOT LIKE '%\"repair_card_id\": null%'",
            [quiz_id],
            |row| row.get(0),
        )
        .unwrap_or(0);

    // Log study event
    let subject_id: Option<i64> = conn
        .query_row(
            "SELECT subject_id FROM quizzes WHERE id = ?1",
            [quiz_id],
            |row| row.get(0),
        )
        .ok();

    let payload = serde_json::json!({
        "quiz_id": quiz_id,
        "score": score,
        "correct": correct,
        "partial": partial,
        "incorrect": incorrect,
    });

    conn.execute(
        "INSERT INTO study_events (subject_id, chapter_id, quiz_id, event_type, payload_json, created_at)
         VALUES (?1, ?2, ?3, 'quiz_completed', ?4, datetime('now'))",
        rusqlite::params![subject_id, chapter_id, quiz_id, payload.to_string()],
    )
    .map_err(|e| format!("Failed to log study event: {e}"))?;

    Ok(QuizSummary {
        score,
        total,
        correct,
        partial,
        incorrect,
        repair_cards_created,
        retest_scheduled,
    })
}

pub fn get_quiz(conn: &Connection, quiz_id: i64) -> Result<QuizState, String> {
    // Load quiz
    let (chapter_id, score): (i64, Option<f64>) = conn
        .query_row(
            "SELECT chapter_id, score FROM quizzes WHERE id = ?1",
            [quiz_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| format!("Quiz not found: {e}"))?;

    // Load chapter title
    let chapter_title: String = conn
        .query_row(
            "SELECT title FROM chapters WHERE id = ?1",
            [chapter_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("Chapter not found: {e}"))?;

    // Load all attempts
    let mut stmt = conn
        .prepare(
            "SELECT question_index, question_json, result
             FROM quiz_attempts WHERE quiz_id = ?1
             ORDER BY question_index",
        )
        .map_err(|e| format!("Failed to prepare attempts query: {e}"))?;

    let rows: Vec<(i64, String, String)> = stmt
        .query_map([quiz_id], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
        .map_err(|e| format!("Failed to query attempts: {e}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let mut questions = Vec::new();
    let mut attempts = Vec::new();

    for (question_index, question_json, result) in &rows {
        let question: QuizQuestion = serde_json::from_str(question_json)
            .map_err(|e| format!("Failed to parse question: {e}"))?;
        questions.push(question);
        attempts.push(QuizAttemptInfo {
            question_index: *question_index,
            result: result.clone(),
        });
    }

    Ok(QuizState {
        id: quiz_id,
        chapter_id,
        chapter_title,
        questions,
        attempts,
        score,
    })
}

// --- Helper functions ---

fn matches_answer(user_answer: &str, correct_answer: &str, question_type: &str) -> bool {
    match question_type {
        "multiple_choice" | "true_false" => {
            user_answer.trim().eq_ignore_ascii_case(correct_answer.trim())
        }
        "fill_blank" => user_answer.trim().eq_ignore_ascii_case(correct_answer.trim()),
        _ => false,
    }
}

fn get_quiz_ids(conn: &Connection, quiz_id: i64) -> Result<(i64, Option<i64>), String> {
    conn.query_row(
        "SELECT subject_id, chapter_id FROM quizzes WHERE id = ?1",
        [quiz_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )
    .map_err(|e| format!("Failed to get quiz info: {e}"))
}

fn log_quiz_event(
    conn: &Connection,
    quiz_id: i64,
    question_index: i64,
    event_type: &str,
) -> Result<(), String> {
    let (subject_id, chapter_id): (Option<i64>, Option<i64>) = conn
        .query_row(
            "SELECT subject_id, chapter_id FROM quizzes WHERE id = ?1",
            [quiz_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| format!("Failed to get quiz for event: {e}"))?;

    let payload = serde_json::json!({
        "quiz_id": quiz_id,
        "question_index": question_index,
    });

    conn.execute(
        "INSERT INTO study_events (subject_id, chapter_id, quiz_id, event_type, payload_json, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))",
        rusqlite::params![subject_id, chapter_id, quiz_id, event_type, payload.to_string()],
    )
    .map_err(|e| format!("Failed to log study event: {e}"))?;

    Ok(())
}

// --- Public wrappers for command layer ---

pub fn get_quiz_ids_pub(conn: &Connection, quiz_id: i64) -> Result<(i64, Option<i64>), String> {
    get_quiz_ids(conn, quiz_id)
}

pub fn create_repair_card_pub(
    conn: &Connection,
    subject_id: i64,
    chapter_id: Option<i64>,
    prompt: &str,
    correct_answer: &str,
) -> Result<i64, String> {
    let question = QuizQuestion {
        question_type: "short_answer".to_string(),
        prompt: prompt.to_string(),
        options: None,
        correct_answer: correct_answer.to_string(),
        section_id: 0,
        section_heading: None,
    };
    create_repair_card(conn, subject_id, chapter_id, &question, "")
}

// --- Async AI functions ---

/// Try to generate quiz questions using AI. Returns Ok with questions on success,
/// Err on failure (caller should fall back to deterministic).
pub async fn enhance_with_ai(
    http: &reqwest::Client,
    config: &AppConfig,
    sections: &[(i64, Option<String>, String)],
    difficulty: &str,
    question_count: i32,
    question_type_filter: &str,
) -> Result<Vec<QuizQuestion>, String> {
    let mut user_prompt = String::from("Generate quiz questions from these chapter sections:\n\n");
    for (idx, (section_id, heading, body)) in sections.iter().enumerate() {
        let h = heading.as_deref().unwrap_or("Untitled");
        let truncated = &body[..body.len().min(500)];
        user_prompt.push_str(&format!(
            "--- Section {} (id={}) ---\n## {}\n{}\n\n",
            idx, section_id, h, truncated
        ));
    }

    let request = AiRequest {
        feature: "quiz.generate".to_string(),
        system_prompt: quiz_generate_prompt(difficulty, question_count, question_type_filter),
        user_prompt,
        model_policy: "balanced".to_string(),
        timeout_ms: 90000, // 90s — CLI providers can be slow
    };

    let response = ai::ai_request(http, &config.ai, &config.profile, request).await?;

    // Parse the JSON response
    let content = response.content.trim();
    // Strip markdown fences if present
    let json_str = if content.starts_with("```") {
        content
            .trim_start_matches("```json")
            .trim_start_matches("```")
            .trim_end_matches("```")
            .trim()
    } else {
        content
    };

    #[derive(Deserialize)]
    struct AiQuestion {
        question_type: String,
        prompt: String,
        options: Option<Vec<String>>,
        correct_answer: String,
        section_index: usize,
    }

    let ai_questions: Vec<AiQuestion> =
        serde_json::from_str(json_str).map_err(|e| format!("Failed to parse AI response: {e}"))?;

    // Map AI questions to QuizQuestion, matching section_index to section data
    let questions: Vec<QuizQuestion> = ai_questions
        .into_iter()
        .filter_map(|aq| {
            let (section_id, heading, _) = sections.get(aq.section_index)?;
            Some(QuizQuestion {
                question_type: aq.question_type,
                prompt: aq.prompt,
                options: aq.options,
                correct_answer: aq.correct_answer,
                section_id: *section_id,
                section_heading: heading.clone(),
            })
        })
        .collect();

    if questions.is_empty() {
        return Err("AI returned no valid questions".to_string());
    }

    Ok(questions)
}

/// Try to evaluate a short-answer response using AI.
/// Returns Ok((verdict, explanation)) on success, Err on failure.
pub async fn evaluate_with_ai(
    http: &reqwest::Client,
    config: &AppConfig,
    question_prompt: &str,
    correct_answer: &str,
    user_answer: &str,
) -> Result<(String, String), String> {
    let user_prompt = format!(
        "Question: {}\n\nExpected answer: {}\n\nStudent's answer: {}",
        question_prompt, correct_answer, user_answer
    );

    let request = AiRequest {
        feature: "quiz.evaluate".to_string(),
        system_prompt: QUIZ_EVALUATE_SYSTEM_PROMPT.to_string(),
        user_prompt,
        model_policy: "balanced".to_string(),
        timeout_ms: 60000, // 60s — CLI providers can be slow
    };

    let response = ai::ai_request(http, &config.ai, &config.profile, request).await?;

    let content = response.content.trim();
    let json_str = if content.starts_with("```") {
        content
            .trim_start_matches("```json")
            .trim_start_matches("```")
            .trim_end_matches("```")
            .trim()
    } else {
        content
    };

    #[derive(Deserialize)]
    struct EvalResult {
        verdict: String,
        explanation: String,
    }

    let eval: EvalResult =
        serde_json::from_str(json_str).map_err(|e| format!("Failed to parse AI eval: {e}"))?;

    // Validate verdict
    if !["correct", "partial", "incorrect"].contains(&eval.verdict.as_str()) {
        return Err(format!("Invalid verdict from AI: {}", eval.verdict));
    }

    Ok((eval.verdict, eval.explanation))
}

/// Replace quiz questions in the database after AI enhancement.
pub fn replace_questions(
    conn: &Connection,
    quiz_id: i64,
    questions: &[QuizQuestion],
) -> Result<(), String> {
    // Delete existing attempts
    conn.execute("DELETE FROM quiz_attempts WHERE quiz_id = ?1", [quiz_id])
        .map_err(|e| format!("Failed to clear attempts: {e}"))?;

    // Insert new questions
    for (idx, question) in questions.iter().enumerate() {
        let qjson = serde_json::to_string(question)
            .map_err(|e| format!("Failed to serialize question: {e}"))?;
        conn.execute(
            "INSERT INTO quiz_attempts (quiz_id, question_index, question_json, result, created_at)
             VALUES (?1, ?2, ?3, 'unanswered', datetime('now'))",
            rusqlite::params![quiz_id, idx as i64, qjson],
        )
        .map_err(|e| format!("Failed to insert AI question: {e}"))?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;

    fn setup_quiz_db() -> Database {
        let db = Database::open_memory().expect("open");
        db.with_conn(|conn| {
            conn.execute(
                "INSERT INTO subjects (slug, name, created_at) VALUES ('test', 'Test', datetime('now'))",
                [],
            ).unwrap();
            conn.execute(
                "INSERT INTO chapters (subject_id, title, slug, status, created_at, updated_at)
                 VALUES (1, 'Test Chapter', 'test-chapter', 'ready_for_quiz', datetime('now'), datetime('now'))",
                [],
            ).unwrap();
            // Add 4 sections
            for i in 0..4 {
                conn.execute(
                    "INSERT INTO chapter_sections (chapter_id, section_index, heading, body_markdown, word_count, status)
                     VALUES (1, ?1, ?2, ?3, 20, 'checked_correct')",
                    rusqlite::params![i, format!("Section {}", i + 1), format!("This is the content for section {}. It covers important concepts.", i + 1)],
                ).unwrap();
            }
            Ok(())
        });
        db
    }

    #[test]
    fn test_generate_quiz_creates_questions() {
        let db = setup_quiz_db();
        db.with_conn(|conn| {
            let quiz = generate_quiz(conn, 1, "intermediate", 8, "mixed").unwrap();
            assert_eq!(quiz.questions.len(), 4); // min(8, 4)
            assert_eq!(quiz.attempts.len(), 4);
            assert!(quiz.attempts.iter().all(|a| a.result == "unanswered"));
            Ok(())
        });
    }

    #[test]
    fn test_generate_quiz_rejects_wrong_status() {
        let db = setup_quiz_db();
        db.with_conn(|conn| {
            conn.execute("UPDATE chapters SET status = 'reading' WHERE id = 1", []).unwrap();
            let result = generate_quiz(conn, 1, "intermediate", 8, "mixed");
            assert!(result.is_err());
            Ok(())
        });
    }

    #[test]
    fn test_submit_mc_answer_correct() {
        let db = setup_quiz_db();
        db.with_conn(|conn| {
            let quiz = generate_quiz(conn, 1, "intermediate", 8, "mixed").unwrap();
            // Find an MC question
            if let Some((idx, q)) = quiz.questions.iter().enumerate().find(|(_, q)| q.question_type == "multiple_choice") {
                let result = submit_answer(conn, quiz.id, idx as i64, &q.correct_answer).unwrap();
                assert_eq!(result.verdict, "correct");
                assert!(result.repair_card_id.is_none());
            }
            Ok(())
        });
    }

    #[test]
    fn test_submit_mc_answer_incorrect_creates_repair() {
        let db = setup_quiz_db();
        db.with_conn(|conn| {
            let quiz = generate_quiz(conn, 1, "intermediate", 8, "mixed").unwrap();
            if let Some((idx, _)) = quiz.questions.iter().enumerate().find(|(_, q)| q.question_type == "multiple_choice") {
                let result = submit_answer(conn, quiz.id, idx as i64, "wrong answer").unwrap();
                assert_eq!(result.verdict, "incorrect");
                assert!(result.repair_card_id.is_some());
            }
            Ok(())
        });
    }

    #[test]
    fn test_short_answer_needs_self_rating() {
        let db = setup_quiz_db();
        db.with_conn(|conn| {
            let quiz = generate_quiz(conn, 1, "intermediate", 8, "mixed").unwrap();
            if let Some((idx, _)) = quiz.questions.iter().enumerate().find(|(_, q)| q.question_type == "short_answer") {
                let result = submit_answer(conn, quiz.id, idx as i64, "my answer").unwrap();
                assert!(result.needs_self_rating);
            }
            Ok(())
        });
    }

    #[test]
    fn test_complete_quiz_passing() {
        let db = setup_quiz_db();
        db.with_conn(|conn| {
            let quiz = generate_quiz(conn, 1, "intermediate", 8, "mixed").unwrap();
            // Answer all questions correctly
            for (idx, q) in quiz.questions.iter().enumerate() {
                if q.question_type == "short_answer" {
                    submit_answer(conn, quiz.id, idx as i64, "my answer").unwrap();
                    submit_self_rating(conn, quiz.id, idx as i64, "correct").unwrap();
                } else {
                    submit_answer(conn, quiz.id, idx as i64, &q.correct_answer).unwrap();
                }
            }
            let summary = complete_quiz(conn, quiz.id).unwrap();
            assert_eq!(summary.score, 1.0);
            assert!(!summary.retest_scheduled);

            // Check chapter status advanced
            let status: String = conn.query_row(
                "SELECT status FROM chapters WHERE id = 1", [], |row| row.get(0)
            ).unwrap();
            assert_eq!(status, "mastering");
            Ok(())
        });
    }

    #[test]
    fn test_complete_quiz_failing_schedules_retest() {
        let db = setup_quiz_db();
        db.with_conn(|conn| {
            let quiz = generate_quiz(conn, 1, "intermediate", 8, "mixed").unwrap();
            // Answer all incorrectly
            for (idx, q) in quiz.questions.iter().enumerate() {
                if q.question_type == "short_answer" {
                    submit_answer(conn, quiz.id, idx as i64, "wrong").unwrap();
                    submit_self_rating(conn, quiz.id, idx as i64, "incorrect").unwrap();
                } else {
                    submit_answer(conn, quiz.id, idx as i64, "wrong").unwrap();
                }
            }
            let summary = complete_quiz(conn, quiz.id).unwrap();
            assert!(summary.score < 0.8);
            assert!(summary.retest_scheduled);

            // Chapter should still be ready_for_quiz
            let status: String = conn.query_row(
                "SELECT status FROM chapters WHERE id = 1", [], |row| row.get(0)
            ).unwrap();
            assert_eq!(status, "ready_for_quiz");
            Ok(())
        });
    }

    #[test]
    fn test_get_quiz_returns_state() {
        let db = setup_quiz_db();
        db.with_conn(|conn| {
            let quiz = generate_quiz(conn, 1, "intermediate", 8, "mixed").unwrap();
            let state = get_quiz(conn, quiz.id).unwrap();
            assert_eq!(state.id, quiz.id);
            assert_eq!(state.chapter_title, "Test Chapter");
            assert_eq!(state.questions.len(), 4);
            Ok(())
        });
    }
}
