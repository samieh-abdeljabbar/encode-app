use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use regex::Regex;

use crate::services::ai::{self, AiRequest};
use crate::services::config::AppConfig;

pub fn quiz_generate_prompt(
    difficulty: &str,
    question_count: i32,
    question_type_filter: &str,
) -> String {
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
        "math_input" => "\nIMPORTANT: Generate ONLY math_input questions.",
        "step_order" => "\nIMPORTANT: Generate ONLY step_order questions.",
        "code_output" => "\nIMPORTANT: Generate ONLY code_output questions.",
        "complete_snippet" => "\nIMPORTANT: Generate ONLY complete_snippet questions.",
        _ => "", // "mixed" — no constraint
    };

    format!(
        r#"You are an expert quiz question designer. Generate quiz questions from the study material below.

CRITICAL RULES:
1. REPHRASE concepts — NEVER copy sentences from the source material. Use different wording.
2. Each question tests ONE specific concept, not multiple concepts.
3. Questions must be answerable from the material but require UNDERSTANDING, not just recognition.
4. For multiple choice: each distractor must represent a realistic misconception or common error. Never use absurd distractors. All options must be similar in length and structure. Never use "all of the above" or "none of the above".
5. For short answer: ask "why" or "how", not "what". Constrain to "In 1-2 sentences, explain..."
6. For fill-in-the-blank: rephrase the sentence — do NOT copy verbatim from the material and blank out a word. The blank must be a key term that carries conceptual weight.
7. For true/false: require explanation in the prompt stem — don't make statements that can be guessed.
8. For true/false: "correct_answer" must be EXACTLY "True" or "False". Do not include any explanation in that field.
9. For math_input: provide "question_data" with "grader", "accepted_answers", optional "prompt_latex", and optional "tolerance". Use "expression_equivalence" only for algebraic expressions; use "numeric" for numeric results.
10. For step_order: provide "question_data" with "items" and "correct_order". "correct_answer" should summarize the intended sequence in plain text.
11. For code_output: provide "question_data" with "language" and "snippet". "correct_answer" must be the exact output text.
12. For complete_snippet: provide "question_data" with "language", "starter_code", "placeholder_token", and "accepted_answers". The placeholder token must appear in starter_code.

{difficulty_guidance}
{type_constraint}

Generate exactly {question_count} questions.

Return a JSON array of question objects. Each question must have:
- "question_type": one of "short_answer", "multiple_choice", "true_false", "fill_blank", "math_input", "step_order", "code_output", "complete_snippet"
- "prompt": the question text (rephrased from source material)
- "options": array of 4 strings (for multiple_choice only, null otherwise)
- "correct_answer": the correct answer
- "section_index": which section (0-indexed) this question is about
- "question_data": null for the original four question types, otherwise an object matching the type-specific schema above

Return ONLY valid JSON, no markdown fences."#,
        question_count = question_count,
        difficulty_guidance = difficulty_guidance,
        type_constraint = type_constraint
    )
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
#[serde(untagged)]
pub enum QuizQuestionData {
    MathInput(MathInputQuestionData),
    StepOrder(StepOrderQuestionData),
    CodeOutput(CodeOutputQuestionData),
    CompleteSnippet(CompleteSnippetQuestionData),
}

#[derive(Serialize, Deserialize, Clone)]
pub struct MathInputQuestionData {
    pub grader: String,
    pub prompt_latex: Option<String>,
    pub accepted_answers: Vec<String>,
    pub tolerance: Option<f64>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct StepOrderQuestionData {
    pub items: Vec<String>,
    pub correct_order: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct CodeOutputQuestionData {
    pub language: String,
    pub snippet: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct CompleteSnippetQuestionData {
    pub language: String,
    pub starter_code: String,
    pub placeholder_token: String,
    pub accepted_answers: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct QuizQuestion {
    pub question_type: String,
    pub prompt: String,
    pub options: Option<Vec<String>>,
    pub correct_answer: String,
    pub section_id: i64,
    pub section_heading: Option<String>,
    pub question_data: Option<QuizQuestionData>,
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
    pub chapter_id: Option<i64>,
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

pub fn list_quizzes(
    conn: &Connection,
    subject_id: Option<i64>,
) -> Result<Vec<QuizListItem>, String> {
    let mut sql = String::from(
        "SELECT q.id, q.chapter_id,
                CASE
                    WHEN q.scope_type = 'subject' THEN s.name || ' Subject Test'
                    ELSE COALESCE(ch.title, 'Unknown')
                END,
                s.name, q.score,
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

fn select_quiz_sections(
    sections: &[(i64, Option<String>, String)],
    max_questions: usize,
) -> Vec<(i64, Option<String>, String)> {
    if sections.is_empty() || max_questions == 0 {
        return Vec::new();
    }

    let take_count = std::cmp::min(max_questions, sections.len());
    if take_count >= sections.len() {
        return sections.to_vec();
    }

    (0..take_count)
        .map(|i| {
            let idx = i * sections.len() / take_count;
            sections[idx].clone()
        })
        .collect()
}

fn select_question_indices(total: usize, target_count: usize) -> Vec<usize> {
    if total == 0 || target_count == 0 {
        return Vec::new();
    }

    if target_count >= total {
        return (0..total).collect();
    }

    (0..target_count)
        .map(|i| i * total / target_count)
        .collect()
}

pub fn generate_quiz(
    conn: &Connection,
    chapter_id: i64,
    difficulty: &str,
    question_count: i32,
    question_type_filter: &str,
) -> Result<QuizState, String> {
    // Query chapter
    let (subject_id, title, _status): (i64, String, String) = conn
        .query_row(
            "SELECT subject_id, title, status FROM chapters WHERE id = ?1",
            [chapter_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|e| format!("Chapter not found: {e}"))?;

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

    let questions =
        generate_questions_deterministic(&section_data, question_count as usize, question_type_filter)?;

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
        let question_json = serde_json::to_string(question)
            .map_err(|e| format!("Failed to serialize question: {e}"))?;

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
        chapter_id: Some(chapter_id),
        chapter_title: title,
        questions,
        attempts,
        score: None,
    })
}

pub fn generate_subject_quiz(
    conn: &Connection,
    subject_id: i64,
    difficulty: &str,
    question_count: i32,
    question_type_filter: &str,
) -> Result<QuizState, String> {
    let subject_name: String = conn
        .query_row("SELECT name FROM subjects WHERE id = ?1", [subject_id], |row| {
            row.get(0)
        })
        .map_err(|e| format!("Subject not found: {e}"))?;

    let mut stmt = conn
        .prepare(
            "SELECT cs.id, cs.heading, cs.body_markdown
             FROM chapter_sections cs
             JOIN chapters ch ON ch.id = cs.chapter_id
             WHERE ch.subject_id = ?1
             ORDER BY ch.created_at, ch.id, cs.section_index",
        )
        .map_err(|e| format!("Failed to prepare subject sections query: {e}"))?;

    let sections = stmt
        .query_map([subject_id], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, Option<String>>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .map_err(|e| format!("Failed to query subject sections: {e}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    if sections.is_empty() {
        return Err("Subject has no sections yet".to_string());
    }

    let questions =
        generate_questions_deterministic(&sections, question_count as usize, question_type_filter)?;

    let config = serde_json::json!({
        "use_ai": false,
        "difficulty": difficulty,
        "question_count": question_count,
        "question_type": question_type_filter,
        "mode": "subject_test"
    });
    conn.execute(
        "INSERT INTO quizzes (subject_id, chapter_id, scope_type, config_json, generated_at)
         VALUES (?1, NULL, 'subject', ?2, datetime('now'))",
        rusqlite::params![subject_id, config.to_string()],
    )
    .map_err(|e| format!("Failed to insert subject quiz: {e}"))?;

    let quiz_id = conn.last_insert_rowid();

    let mut attempts = Vec::new();
    for (idx, question) in questions.iter().enumerate() {
        let question_json = serde_json::to_string(question)
            .map_err(|e| format!("Failed to serialize question: {e}"))?;

        conn.execute(
            "INSERT INTO quiz_attempts (quiz_id, question_index, question_json, result, created_at)
             VALUES (?1, ?2, ?3, 'unanswered', datetime('now'))",
            rusqlite::params![quiz_id, idx as i64, question_json],
        )
        .map_err(|e| format!("Failed to insert subject quiz attempt: {e}"))?;

        attempts.push(QuizAttemptInfo {
            question_index: idx as i64,
            result: "unanswered".to_string(),
        });
    }

    Ok(QuizState {
        id: quiz_id,
        chapter_id: None,
        chapter_title: format!("{subject_name} Subject Test"),
        questions,
        attempts,
        score: None,
    })
}

pub fn generate_questions_deterministic(
    sections: &[(i64, Option<String>, String)],
    max_questions: usize,
    question_type_filter: &str,
) -> Result<Vec<QuizQuestion>, String> {
    let standard_cycle = [
        "short_answer",
        "multiple_choice",
        "short_answer",
        "true_false",
        "short_answer",
        "multiple_choice",
        "fill_blank",
        "short_answer",
    ];

    let mixed_cycle = [
        "short_answer",
        "multiple_choice",
        "math_input",
        "true_false",
        "step_order",
        "short_answer",
        "code_output",
        "fill_blank",
        "complete_snippet",
        "short_answer",
    ];

    if sections.is_empty() || max_questions == 0 {
        return Ok(Vec::new());
    }

    let target_count = std::cmp::min(max_questions, sections.len());
    let all_headings: Vec<String> = sections.iter().filter_map(|(_, h, _)| h.clone()).collect();

    match question_type_filter {
        "multiple_choice" | "short_answer" | "true_false" | "fill_blank" => {
            let selected_sections = select_quiz_sections(sections, target_count);
            Ok(selected_sections
                .iter()
                .enumerate()
                .map(|(i, (section_id, heading, body))| {
                    build_standard_question(
                        question_type_filter,
                        *section_id,
                        heading,
                        body,
                        i,
                        &all_headings,
                    )
                })
                .collect())
        }
        "math_input" | "step_order" | "code_output" | "complete_snippet" => {
            let eligible_questions: Vec<QuizQuestion> = sections
                .iter()
                .filter_map(|(section_id, heading, body)| {
                    build_interactive_question(question_type_filter, *section_id, heading, body)
                })
                .collect();

            if eligible_questions.len() < target_count {
                return Err(format!(
                    "Not enough eligible material to generate {target_count} {question_type_filter} question(s). Try Mixed, add more relevant material, or choose another question type."
                ));
            }

            let indices = select_question_indices(eligible_questions.len(), target_count);
            Ok(indices
                .into_iter()
                .map(|index| eligible_questions[index].clone())
                .collect())
        }
        _ => {
            let selected_sections = select_quiz_sections(sections, target_count);
            let questions = selected_sections
                .iter()
                .enumerate()
                .map(|(i, (section_id, heading, body))| {
                    let desired_type = mixed_cycle[i % mixed_cycle.len()];
                    if let Some(interactive) =
                        build_interactive_question(desired_type, *section_id, heading, body)
                    {
                        interactive
                    } else {
                        let fallback_type = standard_cycle[i % standard_cycle.len()];
                        build_standard_question(
                            fallback_type,
                            *section_id,
                            heading,
                            body,
                            i,
                            &all_headings,
                        )
                    }
                })
                .collect();
            Ok(questions)
        }
    }
}

fn build_standard_question(
    question_type: &str,
    section_id: i64,
    heading: &Option<String>,
    body: &str,
    section_index: usize,
    all_headings: &[String],
) -> QuizQuestion {
    let heading_display = heading.as_deref().unwrap_or("this section").to_string();

    match question_type {
        "multiple_choice" => generate_multiple_choice(
            section_id,
            heading,
            &heading_display,
            body,
            section_index,
            all_headings,
        ),
        "true_false" => {
            generate_true_false(section_id, heading, &heading_display, body, section_index)
        }
        "fill_blank" => generate_fill_blank(section_id, heading, &heading_display, body),
        _ => generate_short_answer(section_id, heading, &heading_display, body),
    }
}

fn build_interactive_question(
    question_type: &str,
    section_id: i64,
    heading: &Option<String>,
    body: &str,
) -> Option<QuizQuestion> {
    let heading_display = heading.as_deref().unwrap_or("this section").to_string();

    match question_type {
        "math_input" => generate_math_input(section_id, heading, &heading_display, body),
        "step_order" => generate_step_order(section_id, heading, &heading_display, body),
        "code_output" => generate_code_output(section_id, heading, &heading_display, body),
        "complete_snippet" => {
            generate_complete_snippet(section_id, heading, &heading_display, body)
        }
        _ => None,
    }
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
    } else if text.contains("vs") || text.contains("compar") || text.contains("difference") {
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
        question_data: None,
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
    let prompt = format!("Which of the following best describes the topic of '{heading_display}'?");

    // Correct answer: heading text or first sentence of body
    let correct_answer = heading
        .clone()
        .unwrap_or_else(|| first_sentence(body).to_string());

    // Generate distractors from other section headings
    let mut distractors: Vec<String> = all_headings
        .iter()
        .filter(|h| heading.as_ref().map(|own| own != *h).unwrap_or(true))
        .take(3)
        .cloned()
        .collect();

    // Pad with generic alternatives if not enough distractors
    let generic = [
        "This concept is unrelated to the topic",
        "The opposite relationship applies",
        "This applies only in specific edge cases",
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
        question_data: None,
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
    let is_true = section_index % 2 == 0;

    let prompt = if is_true {
        format!("True or False: {sentence}")
    } else {
        format!(
            "True or False: The following statement is FALSE: The section '{heading_display}' primarily discusses {sentence}"
        )
    };

    QuizQuestion {
        question_type: "true_false".to_string(),
        prompt,
        options: None,
        correct_answer: if is_true { "True" } else { "False" }.to_string(),
        section_id,
        section_heading: heading.clone(),
        question_data: None,
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
                question_data: None,
            }
        }
        None => {
            // Fall back to short_answer if no heading
            generate_short_answer(section_id, heading, heading_display, body)
        }
    }
}

fn generate_math_input(
    section_id: i64,
    heading: &Option<String>,
    heading_display: &str,
    body: &str,
) -> Option<QuizQuestion> {
    let expression = extract_math_expression(body)?;
    let is_expression = expression.chars().any(|ch| ch.is_ascii_alphabetic());
    let correct_answer = if is_expression {
        expression.clone()
    } else {
        evaluate_expression(&expression)
            .map(format_number)
            .unwrap_or_else(|| expression.clone())
    };
    let accepted_answers = if is_expression {
        vec![expression.clone()]
    } else {
        vec![correct_answer.clone(), expression.clone()]
    };

    Some(QuizQuestion {
        question_type: "math_input".to_string(),
        prompt: if is_expression {
            format!(
                "Enter an equivalent expression for the relationship highlighted in '{heading_display}'."
            )
        } else {
            format!("Evaluate the expression from '{heading_display}'.")
        },
        options: None,
        correct_answer: correct_answer.clone(),
        section_id,
        section_heading: heading.clone(),
        question_data: Some(QuizQuestionData::MathInput(MathInputQuestionData {
            grader: if is_expression {
                "expression_equivalence".to_string()
            } else {
                "numeric".to_string()
            },
            prompt_latex: Some(expression),
            accepted_answers,
            tolerance: Some(if is_expression { 1e-6 } else { 1e-4 }),
        })),
    })
}

fn generate_step_order(
    section_id: i64,
    heading: &Option<String>,
    heading_display: &str,
    body: &str,
) -> Option<QuizQuestion> {
    let steps = extract_steps(body)?;
    let mut scrambled = steps.clone();
    scrambled.rotate_left(1);

    Some(QuizQuestion {
        question_type: "step_order".to_string(),
        prompt: format!("Arrange the steps from '{heading_display}' in the correct order."),
        options: None,
        correct_answer: steps.join(" -> "),
        section_id,
        section_heading: heading.clone(),
        question_data: Some(QuizQuestionData::StepOrder(StepOrderQuestionData {
            items: scrambled,
            correct_order: steps,
        })),
    })
}

fn generate_code_output(
    section_id: i64,
    heading: &Option<String>,
    heading_display: &str,
    body: &str,
) -> Option<QuizQuestion> {
    let (language, snippet) = extract_code_block(body)?;
    let correct_output = derive_output_from_code(&language, &snippet)?;

    Some(QuizQuestion {
        question_type: "code_output".to_string(),
        prompt: format!("What is the output of this {language} snippet from '{heading_display}'?"),
        options: None,
        correct_answer: correct_output.clone(),
        section_id,
        section_heading: heading.clone(),
        question_data: Some(QuizQuestionData::CodeOutput(CodeOutputQuestionData {
            language,
            snippet,
        })),
    })
}

fn generate_complete_snippet(
    section_id: i64,
    heading: &Option<String>,
    heading_display: &str,
    body: &str,
) -> Option<QuizQuestion> {
    let (language, snippet) = extract_code_block(body)?;
    let (starter_code, accepted_answers, placeholder_token) =
        build_complete_snippet_prompt(&snippet)?;

    Some(QuizQuestion {
        question_type: "complete_snippet".to_string(),
        prompt: format!("Complete the missing part of this {language} snippet from '{heading_display}'."),
        options: None,
        correct_answer: accepted_answers.first()?.clone(),
        section_id,
        section_heading: heading.clone(),
        question_data: Some(QuizQuestionData::CompleteSnippet(CompleteSnippetQuestionData {
            language,
            starter_code,
            placeholder_token,
            accepted_answers,
        })),
    })
}

fn first_sentence(text: &str) -> &str {
    text.split('.').next().unwrap_or(text).trim()
}

fn extract_math_expression(body: &str) -> Option<String> {
    let block_regex = Regex::new(r"(?s)\$\$([^$]+)\$\$").ok()?;
    if let Some(captures) = block_regex.captures(body) {
        return captures.get(1).map(|m| m.as_str().trim().to_string());
    }

    let inline_regex = Regex::new(r"\$([^$\n]+)\$").ok()?;
    if let Some(captures) = inline_regex.captures(body) {
        return captures.get(1).map(|m| m.as_str().trim().to_string());
    }

    let expr_regex =
        Regex::new(r"(?m)([A-Za-z0-9().\s+\-*/^]{3,}[+\-*/^=][A-Za-z0-9().\s+\-*/^]+)").ok()?;
    expr_regex
        .captures(body)
        .and_then(|captures| captures.get(1))
        .map(|m| m.as_str().trim().to_string())
}

fn extract_steps(body: &str) -> Option<Vec<String>> {
    let list_regex = Regex::new(r"(?m)^\s*(?:[-*]|\d+[.)])\s+(.+)$").ok()?;
    let steps: Vec<String> = list_regex
        .captures_iter(body)
        .filter_map(|captures| captures.get(1))
        .map(|m| m.as_str().trim().trim_end_matches('.').to_string())
        .filter(|step| !step.is_empty())
        .collect();

    if steps.len() >= 3 {
        Some(steps)
    } else {
        None
    }
}

fn extract_code_block(body: &str) -> Option<(String, String)> {
    let code_regex = Regex::new(r"(?s)```(python|js|javascript)\n(.*?)```").ok()?;
    let captures = code_regex.captures(body)?;
    let language = captures.get(1)?.as_str();
    let snippet = captures.get(2)?.as_str().trim().to_string();
    Some((
        if language == "js" {
            "javascript".to_string()
        } else {
            language.to_string()
        },
        snippet,
    ))
}

fn derive_output_from_code(language: &str, snippet: &str) -> Option<String> {
    let outputs: Vec<String> = snippet
        .lines()
        .filter_map(|line| extract_logged_literal(language, line))
        .collect();

    if outputs.is_empty() {
        None
    } else {
        Some(outputs.join("\n"))
    }
}

fn build_complete_snippet_prompt(snippet: &str) -> Option<(String, Vec<String>, String)> {
    if let Some((literal, inner)) = extract_first_string_literal(snippet) {
        let starter_code = snippet.replacen(&literal, "__", 1);
        return Some((starter_code, vec![literal, inner], "__".to_string()));
    }

    let number_regex = Regex::new(r"\b\d+(?:\.\d+)?\b").ok()?;
    let number_match = number_regex.find(snippet)?;
    let starter_code = snippet.replacen(number_match.as_str(), "__", 1);
    Some((
        starter_code,
        vec![number_match.as_str().to_string()],
        "__".to_string(),
    ))
}

fn extract_logged_literal(language: &str, line: &str) -> Option<String> {
    let trimmed = line.trim();
    let inner = match language {
        "python" => trimmed.strip_prefix("print(")?.strip_suffix(')')?,
        "javascript" => trimmed
            .strip_prefix("console.log(")?
            .trim_end_matches(';')
            .strip_suffix(')')?,
        _ => return None,
    }
    .trim();

    if let Some((_literal, inner_literal)) = parse_string_literal(inner) {
        return Some(inner_literal);
    }

    if inner.parse::<f64>().is_ok() {
        return Some(inner.to_string());
    }

    None
}

fn extract_first_string_literal(snippet: &str) -> Option<(String, String)> {
    for (index, ch) in snippet.char_indices() {
        if ch == '"' || ch == '\'' {
            let remainder = &snippet[index..];
            if let Some((literal, inner)) = parse_string_literal(remainder) {
                return Some((literal, inner));
            }
        }
    }
    None
}

fn parse_string_literal(value: &str) -> Option<(String, String)> {
    let quote = value.chars().next()?;
    if quote != '"' && quote != '\'' {
        return None;
    }

    let remainder = &value[quote.len_utf8()..];
    let end = remainder.find(quote)?;
    let inner = remainder[..end].to_string();
    let literal = format!("{quote}{inner}{quote}");
    Some((literal, inner))
}

fn evaluate_expression(expression: &str) -> Option<f64> {
    let normalized = normalize_math_expression(expression);
    normalized.parse::<meval::Expr>().ok()?.eval().ok()
}

fn normalize_math_expression(expression: &str) -> String {
    expression
        .replace('$', "")
        .replace("\\cdot", "*")
        .replace("\\times", "*")
        .replace('−', "-")
        .replace('÷', "/")
        .trim()
        .to_string()
}

fn format_number(value: f64) -> String {
    let rounded = (value * 1_000_000.0).round() / 1_000_000.0;
    if (rounded.fract()).abs() < 1e-9 {
        format!("{}", rounded as i64)
    } else {
        format!("{rounded}")
    }
}

fn create_repair_card(
    conn: &Connection,
    subject_id: i64,
    chapter_id: Option<i64>,
    question: &QuizQuestion,
    _user_answer: &str,
) -> Result<i64, String> {
    let prompt = question.prompt.clone();
    let answer = match &question.question_data {
        Some(QuizQuestionData::CodeOutput(data)) => {
            format!("Snippet:\n```{}\n{}\n```\n\nOutput:\n```text\n{}\n```", data.language, data.snippet, question.correct_answer)
        }
        Some(QuizQuestionData::CompleteSnippet(data)) => {
            let accepted = data
                .accepted_answers
                .first()
                .cloned()
                .unwrap_or_else(|| question.correct_answer.clone());
            format!(
                "Complete the snippet:\n```{}\n{}\n```\n\nMissing code:\n```{}\n{}\n```",
                data.language, data.starter_code, data.language, accepted
            )
        }
        Some(QuizQuestionData::MathInput(data)) => data
            .prompt_latex
            .clone()
            .unwrap_or_else(|| question.correct_answer.clone()),
        Some(QuizQuestionData::StepOrder(data)) => data.correct_order.join("\n"),
        None => question.correct_answer.clone(),
    };

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
    let question: QuizQuestion = serde_json::from_str(&question_json)
        .map_err(|e| format!("Failed to parse question: {e}"))?;

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
        "multiple_choice"
        | "true_false"
        | "fill_blank"
        | "math_input"
        | "step_order"
        | "code_output"
        | "complete_snippet" => {
            let verdict = if is_auto_graded_correct(
                &question,
                user_answer,
                quiz_id,
                question_index,
            ) {
                "correct"
            } else {
                "incorrect"
            };

            let mut repair_card_id = None;

            // Create repair card for incorrect answers
            if verdict == "incorrect" {
                let (subject_id, chapter_id) = get_quiz_ids(conn, quiz_id)?;
                let card_id =
                    create_repair_card(conn, subject_id, chapter_id, &question, user_answer)?;
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
                correct_answer: format_feedback_answer(&question),
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

    let question: QuizQuestion = serde_json::from_str(&question_json)
        .map_err(|e| format!("Failed to parse question: {e}"))?;

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
        rusqlite::params![
            quiz_id,
            question_index,
            new_evaluation.to_string(),
            self_rating
        ],
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
    let (subject_id, chapter_id, score): (i64, Option<i64>, Option<f64>) = conn
        .query_row(
            "SELECT subject_id, chapter_id, score FROM quizzes WHERE id = ?1",
            [quiz_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|e| format!("Quiz not found: {e}"))?;

    // Load chapter title
    let chapter_title: String = if let Some(cid) = chapter_id {
        conn.query_row("SELECT title FROM chapters WHERE id = ?1", [cid], |row| {
            row.get(0)
        })
        .map_err(|e| format!("Chapter not found: {e}"))?
    } else {
        let subject_name: String = conn
            .query_row("SELECT name FROM subjects WHERE id = ?1", [subject_id], |row| {
                row.get(0)
            })
            .map_err(|e| format!("Subject not found: {e}"))?;
        format!("{subject_name} Subject Test")
    };

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

fn is_auto_graded_correct(
    question: &QuizQuestion,
    user_answer: &str,
    quiz_id: i64,
    question_index: i64,
) -> bool {
    match question.question_type.as_str() {
        "multiple_choice" | "true_false" | "fill_blank" => {
            let normalized_user =
                normalize_auto_graded_answer(user_answer, &question.question_type);
            let normalized_correct =
                normalize_auto_graded_answer(&question.correct_answer, &question.question_type);
            normalized_user
                .trim()
                .eq_ignore_ascii_case(normalized_correct.trim())
        }
        "math_input" => matches_math_answer(question, user_answer, quiz_id, question_index),
        "step_order" => matches_step_order_answer(question, user_answer),
        "code_output" => {
            normalize_code_answer(user_answer)
                == normalize_code_answer(&question.correct_answer)
        }
        "complete_snippet" => matches_complete_snippet(question, user_answer),
        _ => false,
    }
}

#[cfg(test)]
fn matches_answer(user_answer: &str, correct_answer: &str, question_type: &str) -> bool {
    let question = QuizQuestion {
        question_type: question_type.to_string(),
        prompt: String::new(),
        options: None,
        correct_answer: correct_answer.to_string(),
        section_id: 0,
        section_heading: None,
        question_data: None,
    };

    is_auto_graded_correct(&question, user_answer, 0, 0)
}

fn normalize_auto_graded_answer(answer: &str, question_type: &str) -> String {
    match question_type {
        "true_false" => {
            let trimmed = answer.trim();
            let lower = trimmed.to_ascii_lowercase();
            if lower.starts_with("true") {
                "True".to_string()
            } else if lower.starts_with("false") {
                "False".to_string()
            } else {
                trimmed.to_string()
            }
        }
        _ => answer.trim().to_string(),
    }
}

fn matches_math_answer(
    question: &QuizQuestion,
    user_answer: &str,
    quiz_id: i64,
    question_index: i64,
) -> bool {
    let Some(QuizQuestionData::MathInput(data)) = &question.question_data else {
        return false;
    };

    let normalized_user = normalize_math_expression(user_answer);
    if normalized_user.is_empty() {
        return false;
    }

    let accepted_exact = data
        .accepted_answers
        .iter()
        .map(|answer| normalize_math_expression(answer))
        .any(|answer| answer.eq_ignore_ascii_case(&normalized_user));
    if accepted_exact {
        return true;
    }

    let tolerance = data.tolerance.unwrap_or(1e-6);
    match data.grader.as_str() {
        "numeric" => {
            let expected = data
                .accepted_answers
                .iter()
                .find_map(|answer| evaluate_expression(answer));
            let actual = evaluate_expression(&normalized_user);
            match (actual, expected) {
                (Some(actual), Some(expected)) => (actual - expected).abs() <= tolerance,
                _ => false,
            }
        }
        "expression_equivalence" => {
            let expected = data.accepted_answers.first().map(String::as_str);
            if let Some(expected) = expected {
                expressions_equivalent(expected, &normalized_user, quiz_id, question_index, tolerance)
            } else {
                false
            }
        }
        _ => false,
    }
}

fn expressions_equivalent(
    expected: &str,
    actual: &str,
    quiz_id: i64,
    question_index: i64,
    tolerance: f64,
) -> bool {
    let expected_expr = normalize_math_expression(expected).parse::<meval::Expr>().ok();
    let actual_expr = normalize_math_expression(actual).parse::<meval::Expr>().ok();
    let (Some(expected_expr), Some(actual_expr)) = (expected_expr, actual_expr) else {
        return false;
    };

    let expected_vars = extract_expression_variables(expected);
    let actual_vars = extract_expression_variables(actual);
    if expected_vars != actual_vars {
        return false;
    }

    let sample_points = sample_expression_points(quiz_id, question_index, 5);
    for sample in sample_points {
        let context = expected_vars
            .iter()
            .map(|var| (var.as_str(), sample))
            .collect::<Vec<_>>();

        let expected_value = expected_expr.eval_with_context(context.clone());
        let actual_value = actual_expr.eval_with_context(context);
        match (expected_value, actual_value) {
            (Ok(expected_value), Ok(actual_value)) => {
                if (expected_value - actual_value).abs() > tolerance {
                    return false;
                }
            }
            _ => return false,
        }
    }

    true
}

fn extract_expression_variables(expression: &str) -> Vec<String> {
    let regex = Regex::new(r"\b[a-zA-Z]\w*\b").expect("valid variable regex");
    let mut variables: Vec<String> = regex
        .captures_iter(&normalize_math_expression(expression))
        .filter_map(|captures| captures.get(0))
        .map(|capture| capture.as_str().to_string())
        .filter(|name| !matches!(name.as_str(), "pi" | "e"))
        .collect();
    variables.sort();
    variables.dedup();
    variables
}

fn sample_expression_points(quiz_id: i64, question_index: i64, count: usize) -> Vec<f64> {
    let base = (quiz_id + question_index + 1) as f64;
    (0..count)
        .map(|index| {
            let offset = (index as f64) * 0.75;
            if index % 2 == 0 {
                base / 2.0 + offset + 1.0
            } else {
                -(base / 3.0 + offset + 1.0)
            }
        })
        .collect()
}

fn matches_step_order_answer(question: &QuizQuestion, user_answer: &str) -> bool {
    let Some(QuizQuestionData::StepOrder(data)) = &question.question_data else {
        return false;
    };

    parse_step_order_answer(user_answer)
        .map(|steps| steps == data.correct_order)
        .unwrap_or(false)
}

fn parse_step_order_answer(answer: &str) -> Option<Vec<String>> {
    serde_json::from_str::<Vec<String>>(answer)
        .ok()
        .or_else(|| {
            let items: Vec<String> = answer
                .lines()
                .map(str::trim)
                .filter(|line| !line.is_empty())
                .map(ToString::to_string)
                .collect();
            if items.is_empty() {
                None
            } else {
                Some(items)
            }
        })
}

fn normalize_code_answer(answer: &str) -> String {
    answer
        .replace("\r\n", "\n")
        .lines()
        .map(str::trim_end)
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string()
}

fn matches_complete_snippet(question: &QuizQuestion, user_answer: &str) -> bool {
    let Some(QuizQuestionData::CompleteSnippet(data)) = &question.question_data else {
        return false;
    };

    let normalized_user = normalize_code_answer(user_answer);
    data.accepted_answers.iter().any(|answer| {
        let normalized_answer = normalize_code_answer(answer);
        normalized_user == normalized_answer
            || normalized_user == normalized_answer.trim_matches('"')
            || normalized_user == normalized_answer.trim_matches('\'')
            || normalized_user
                == normalize_code_answer(
                    &data
                        .starter_code
                        .replace(&data.placeholder_token, answer),
                )
    })
}

fn format_feedback_answer(question: &QuizQuestion) -> String {
    match &question.question_data {
        Some(QuizQuestionData::MathInput(data)) => data
            .prompt_latex
            .clone()
            .unwrap_or_else(|| question.correct_answer.clone()),
        Some(QuizQuestionData::StepOrder(data)) => data.correct_order.join("\n"),
        Some(QuizQuestionData::CodeOutput(_)) => question.correct_answer.clone(),
        Some(QuizQuestionData::CompleteSnippet(data)) => data
            .accepted_answers
            .first()
            .cloned()
            .unwrap_or_else(|| question.correct_answer.clone()),
        None => normalize_auto_graded_answer(&question.correct_answer, &question.question_type),
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
        question_data: None,
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
        question_data: Option<QuizQuestionData>,
    }

    let ai_questions: Vec<AiQuestion> =
        serde_json::from_str(json_str).map_err(|e| format!("Failed to parse AI response: {e}"))?;

    // Map AI questions to QuizQuestion, matching section_index to section data
    let questions: Vec<QuizQuestion> = ai_questions
        .into_iter()
        .filter_map(|aq| {
            let (section_id, heading, _) = sections.get(aq.section_index)?;
            let question_type = aq.question_type;
            if !is_supported_question_type(&question_type) {
                return None;
            }
            if !is_valid_ai_question(&question_type, aq.options.as_ref(), aq.question_data.as_ref()) {
                return None;
            }
            let correct_answer = match question_type.as_str() {
                "math_input" | "code_output" | "complete_snippet" => aq.correct_answer.trim().to_string(),
                _ => normalize_auto_graded_answer(&aq.correct_answer, &question_type),
            };
            Some(QuizQuestion {
                question_type,
                prompt: aq.prompt,
                options: aq.options,
                correct_answer,
                section_id: *section_id,
                section_heading: heading.clone(),
                question_data: aq.question_data,
            })
        })
        .collect();

    if questions.is_empty() {
        return Err("AI returned no valid questions".to_string());
    }

    Ok(questions)
}

fn is_supported_question_type(question_type: &str) -> bool {
    matches!(
        question_type,
        "short_answer"
            | "multiple_choice"
            | "true_false"
            | "fill_blank"
            | "math_input"
            | "step_order"
            | "code_output"
            | "complete_snippet"
    )
}

fn is_valid_ai_question(
    question_type: &str,
    options: Option<&Vec<String>>,
    question_data: Option<&QuizQuestionData>,
) -> bool {
    match question_type {
        "multiple_choice" => options.map(|items| items.len() == 4).unwrap_or(false),
        "short_answer" | "true_false" | "fill_blank" => question_data.is_none(),
        "math_input" => matches!(
            question_data,
            Some(QuizQuestionData::MathInput(MathInputQuestionData {
                accepted_answers,
                ..
            })) if !accepted_answers.is_empty()
        ),
        "step_order" => matches!(
            question_data,
            Some(QuizQuestionData::StepOrder(StepOrderQuestionData {
                items,
                correct_order,
            })) if !items.is_empty() && !correct_order.is_empty() && items.len() == correct_order.len()
        ),
        "code_output" => matches!(
            question_data,
            Some(QuizQuestionData::CodeOutput(CodeOutputQuestionData { language, snippet }))
                if matches!(language.as_str(), "python" | "javascript") && !snippet.trim().is_empty()
        ),
        "complete_snippet" => matches!(
            question_data,
            Some(QuizQuestionData::CompleteSnippet(CompleteSnippetQuestionData {
                language,
                starter_code,
                placeholder_token,
                accepted_answers,
            }))
                if matches!(language.as_str(), "python" | "javascript")
                    && !starter_code.trim().is_empty()
                    && starter_code.contains(placeholder_token)
                    && !accepted_answers.is_empty()
        ),
        _ => false,
    }
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
        }).expect("test setup");
        db
    }

    fn setup_interactive_quiz_db() -> Database {
        let db = Database::open_memory().expect("open");
        db.with_conn(|conn| {
            conn.execute(
                "INSERT INTO subjects (slug, name, created_at) VALUES ('interactive', 'Interactive', datetime('now'))",
                [],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO chapters (subject_id, title, slug, status, created_at, updated_at)
                 VALUES (1, 'Interactive Chapter', 'interactive-chapter', 'ready_for_quiz', datetime('now'), datetime('now'))",
                [],
            )
            .unwrap();

            let sections = [
                (
                    0,
                    "Algebra",
                    "Solve the expression $2 + 3 * 4$ to get a numeric result.",
                ),
                (
                    1,
                    "Procedure",
                    "1. Gather the inputs\n2. Normalize the values\n3. Return the result",
                ),
                (
                    2,
                    "Python Output",
                    "```python\nprint(\"alpha\")\nprint(\"beta\")\n```",
                ),
                (
                    3,
                    "JavaScript Snippet",
                    "```javascript\nconsole.log(\"ready\")\n```",
                ),
            ];

            for (section_index, heading, body) in sections {
                conn.execute(
                    "INSERT INTO chapter_sections (chapter_id, section_index, heading, body_markdown, word_count, status)
                     VALUES (1, ?1, ?2, ?3, 20, 'checked_correct')",
                    rusqlite::params![section_index, heading, body],
                )
                .unwrap();
            }
            Ok(())
        })
        .expect("test setup");
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
        })
        .expect("test setup");
    }

    #[test]
    fn test_generate_quiz_allows_early_status() {
        let db = setup_quiz_db();
        db.with_conn(|conn| {
            conn.execute("UPDATE chapters SET status = 'reading' WHERE id = 1", [])
                .unwrap();
            let quiz = generate_quiz(conn, 1, "intermediate", 8, "mixed").unwrap();
            assert_eq!(quiz.chapter_title, "Test Chapter");
            assert_eq!(quiz.questions.len(), 4);
            Ok(())
        })
        .expect("test setup");
    }

    #[test]
    fn test_generate_subject_quiz_creates_mixed_subject_quiz() {
        let db = setup_quiz_db();
        db.with_conn(|conn| {
            let quiz = generate_subject_quiz(conn, 1, "intermediate", 3, "mixed").unwrap();
            assert_eq!(quiz.chapter_id, None);
            assert_eq!(quiz.chapter_title, "Test Subject Test");
            assert_eq!(quiz.questions.len(), 3);
            assert_eq!(quiz.attempts.len(), 3);
            Ok(())
        })
        .expect("test setup");
    }

    #[test]
    fn test_true_false_normalization_accepts_explanatory_answer_field() {
        assert!(matches_answer("True", "True. This statement is correct.", "true_false"));
        assert!(matches_answer("False", "False: the claim is incorrect.", "true_false"));
        assert_eq!(
            normalize_auto_graded_answer("True. This statement is correct.", "true_false"),
            "True"
        );
    }

    #[test]
    fn test_math_input_numeric_grading_accepts_equivalent_numeric_answer() {
        let question = QuizQuestion {
            question_type: "math_input".to_string(),
            prompt: "Evaluate the expression.".to_string(),
            options: None,
            correct_answer: "14".to_string(),
            section_id: 1,
            section_heading: Some("Algebra".to_string()),
            question_data: Some(QuizQuestionData::MathInput(MathInputQuestionData {
                grader: "numeric".to_string(),
                prompt_latex: Some("2 + 3 * 4".to_string()),
                accepted_answers: vec!["14".to_string()],
                tolerance: Some(1e-6),
            })),
        };

        assert!(is_auto_graded_correct(&question, "14.0", 1, 0));
        assert!(!is_auto_graded_correct(&question, "15", 1, 0));
    }

    #[test]
    fn test_math_input_expression_equivalence_accepts_equivalent_form() {
        let question = QuizQuestion {
            question_type: "math_input".to_string(),
            prompt: "Enter an equivalent expression.".to_string(),
            options: None,
            correct_answer: "x^2 + 2*x + 1".to_string(),
            section_id: 1,
            section_heading: Some("Algebra".to_string()),
            question_data: Some(QuizQuestionData::MathInput(MathInputQuestionData {
                grader: "expression_equivalence".to_string(),
                prompt_latex: Some("x^2 + 2*x + 1".to_string()),
                accepted_answers: vec!["x^2 + 2*x + 1".to_string()],
                tolerance: Some(1e-6),
            })),
        };

        assert!(is_auto_graded_correct(&question, "(x + 1)^2", 2, 1));
        assert!(!is_auto_graded_correct(&question, "x^2 + 1", 2, 1));
    }

    #[test]
    fn test_step_order_grading_requires_correct_sequence() {
        let question = QuizQuestion {
            question_type: "step_order".to_string(),
            prompt: "Order the steps.".to_string(),
            options: None,
            correct_answer: "Gather -> Normalize -> Return".to_string(),
            section_id: 1,
            section_heading: Some("Procedure".to_string()),
            question_data: Some(QuizQuestionData::StepOrder(StepOrderQuestionData {
                items: vec![
                    "Normalize".to_string(),
                    "Gather".to_string(),
                    "Return".to_string(),
                ],
                correct_order: vec![
                    "Gather".to_string(),
                    "Normalize".to_string(),
                    "Return".to_string(),
                ],
            })),
        };

        assert!(is_auto_graded_correct(
            &question,
            r#"["Gather","Normalize","Return"]"#,
            1,
            2
        ));
        assert!(!is_auto_graded_correct(
            &question,
            r#"["Normalize","Gather","Return"]"#,
            1,
            2
        ));
    }

    #[test]
    fn test_complete_snippet_accepts_full_editor_submission() {
        let question = QuizQuestion {
            question_type: "complete_snippet".to_string(),
            prompt: "Complete the snippet.".to_string(),
            options: None,
            correct_answer: "\"ready\"".to_string(),
            section_id: 1,
            section_heading: Some("JavaScript".to_string()),
            question_data: Some(QuizQuestionData::CompleteSnippet(
                CompleteSnippetQuestionData {
                    language: "javascript".to_string(),
                    starter_code: "console.log(__)".to_string(),
                    placeholder_token: "__".to_string(),
                    accepted_answers: vec!["\"ready\"".to_string(), "ready".to_string()],
                },
            )),
        };

        assert!(is_auto_graded_correct(
            &question,
            "console.log(\"ready\")",
            1,
            3
        ));
        assert!(!is_auto_graded_correct(
            &question,
            "console.log(\"nope\")",
            1,
            3
        ));
    }

    #[test]
    fn test_generate_interactive_question_types_from_eligible_sections() {
        let db = setup_interactive_quiz_db();
        db.with_conn(|conn| {
            let math_quiz = generate_quiz(conn, 1, "intermediate", 1, "math_input").unwrap();
            assert_eq!(math_quiz.questions.len(), 1);
            assert_eq!(math_quiz.questions[0].question_type, "math_input");

            let step_quiz = generate_quiz(conn, 1, "intermediate", 1, "step_order").unwrap();
            assert_eq!(step_quiz.questions[0].question_type, "step_order");

            let output_quiz = generate_quiz(conn, 1, "intermediate", 1, "code_output").unwrap();
            assert_eq!(output_quiz.questions[0].question_type, "code_output");

            let snippet_quiz =
                generate_quiz(conn, 1, "intermediate", 1, "complete_snippet").unwrap();
            assert_eq!(snippet_quiz.questions[0].question_type, "complete_snippet");
            Ok(())
        })
        .expect("test setup");
    }

    #[test]
    fn test_generate_interactive_type_errors_when_material_is_missing() {
        let db = setup_quiz_db();
        db.with_conn(|conn| {
            let error = generate_quiz(conn, 1, "intermediate", 4, "math_input")
                .err()
                .expect("should fail for missing math material");
            assert!(error.contains("Not enough eligible material"));
            Ok(())
        })
        .expect("test setup");
    }

    #[test]
    fn test_submit_mc_answer_correct() {
        let db = setup_quiz_db();
        db.with_conn(|conn| {
            let quiz = generate_quiz(conn, 1, "intermediate", 8, "mixed").unwrap();
            // Find an MC question
            if let Some((idx, q)) = quiz
                .questions
                .iter()
                .enumerate()
                .find(|(_, q)| q.question_type == "multiple_choice")
            {
                let result = submit_answer(conn, quiz.id, idx as i64, &q.correct_answer).unwrap();
                assert_eq!(result.verdict, "correct");
                assert!(result.repair_card_id.is_none());
            }
            Ok(())
        })
        .expect("test setup");
    }

    #[test]
    fn test_submit_mc_answer_incorrect_creates_repair() {
        let db = setup_quiz_db();
        db.with_conn(|conn| {
            let quiz = generate_quiz(conn, 1, "intermediate", 8, "mixed").unwrap();
            if let Some((idx, _)) = quiz
                .questions
                .iter()
                .enumerate()
                .find(|(_, q)| q.question_type == "multiple_choice")
            {
                let result = submit_answer(conn, quiz.id, idx as i64, "wrong answer").unwrap();
                assert_eq!(result.verdict, "incorrect");
                assert!(result.repair_card_id.is_some());
            }
            Ok(())
        })
        .expect("test setup");
    }

    #[test]
    fn test_short_answer_needs_self_rating() {
        let db = setup_quiz_db();
        db.with_conn(|conn| {
            let quiz = generate_quiz(conn, 1, "intermediate", 8, "mixed").unwrap();
            if let Some((idx, _)) = quiz
                .questions
                .iter()
                .enumerate()
                .find(|(_, q)| q.question_type == "short_answer")
            {
                let result = submit_answer(conn, quiz.id, idx as i64, "my answer").unwrap();
                assert!(result.needs_self_rating);
            }
            Ok(())
        })
        .expect("test setup");
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
            let status: String = conn
                .query_row("SELECT status FROM chapters WHERE id = 1", [], |row| {
                    row.get(0)
                })
                .unwrap();
            assert_eq!(status, "mastering");
            Ok(())
        })
        .expect("test setup");
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
            let status: String = conn
                .query_row("SELECT status FROM chapters WHERE id = 1", [], |row| {
                    row.get(0)
                })
                .unwrap();
            assert_eq!(status, "ready_for_quiz");
            Ok(())
        })
        .expect("test setup");
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
        })
        .expect("test setup");
    }
}
