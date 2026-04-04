use rusqlite::Connection;
use serde::Serialize;

#[derive(Serialize)]
pub struct ReaderChapter {
    pub id: i64,
    pub subject_id: i64,
    pub subject_name: String,
    pub title: String,
    pub status: String,
    pub estimated_minutes: Option<i64>,
}

#[derive(Serialize)]
pub struct ReaderSection {
    pub id: i64,
    pub section_index: i32,
    pub heading: Option<String>,
    pub body_markdown: String,
    pub word_count: i32,
    pub status: String,
    pub prompt: String,
}

#[derive(Serialize)]
pub struct ReaderSession {
    pub chapter: ReaderChapter,
    pub sections: Vec<ReaderSection>,
    pub current_index: i32,
}

#[derive(Serialize)]
pub struct CheckResult {
    pub outcome: String,
    pub can_retry: bool,
    pub repair_card_created: bool,
    pub chapter_complete: bool,
    pub feedback: Option<String>,
    pub evaluated_by_ai: bool,
}

#[derive(Serialize)]
pub struct SynthesisResult {
    pub success: bool,
    pub new_status: String,
}

pub const READER_PROMPT_SYSTEM: &str = r#"You are generating a comprehension check question for a student who just read a section of study material. Create ONE focused question that tests whether they understood the key concept.

Rules:
- Ask "why" or "how" questions, not "what" questions
- The question should require understanding, not just recall
- Keep it to 1-2 sentences
- Don't reference the section by name — just ask the question directly
- Return ONLY the question text, nothing else"#;

pub const READER_CHECK_SYSTEM: &str = r#"You are evaluating a student's short written response to a reading-comprehension check.

Return ONLY valid JSON in this shape:
{"rating":"correct|partial|off_track","feedback":"one short sentence"}

Rules:
- "correct" means the response captures the main idea accurately
- "partial" means the response shows some understanding but misses or blurs an important point
- "off_track" means the response misses the point, is too vague, or is not grounded in the section
- Keep feedback to one short, plain sentence
- Do not add markdown, explanation, or extra keys"#;

pub fn generate_prompt(heading: &Option<String>, body: &str) -> String {
    let text = format!(
        "{} {}",
        heading.as_deref().unwrap_or(""),
        &body[..body.len().min(400)]
    )
    .to_lowercase();

    if text.contains("step")
        || text.contains("process")
        || text.contains("procedure")
        || text.contains("how to")
    {
        "What are the main steps or process described in this section?".to_string()
    } else if text.contains(" vs ")
        || text.contains("compar")
        || text.contains("difference")
        || text.contains("distinguish")
    {
        "What are the key differences or similarities discussed?".to_string()
    } else if text.contains("define")
        || text.contains("definition")
        || text.contains("meaning")
        || text.contains("concept")
    {
        "Explain the key concept from this section in your own words.".to_string()
    } else {
        "Summarize the main idea of this section in 2-3 sentences.".to_string()
    }
}

pub fn get_section_context(
    conn: &Connection,
    chapter_id: i64,
    section_index: i32,
) -> Result<(String, Option<String>, String), String> {
    conn.query_row(
        "SELECT ch.title, cs.heading, cs.body_markdown
         FROM chapter_sections cs
         JOIN chapters ch ON ch.id = cs.chapter_id
         WHERE cs.chapter_id = ?1 AND cs.section_index = ?2",
        rusqlite::params![chapter_id, section_index],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    )
    .map_err(|e| format!("Section not found: {e}"))
}

fn tokenize(text: &str) -> Vec<String> {
    text.to_lowercase()
        .split(|c: char| !c.is_alphanumeric())
        .filter(|token| token.len() >= 4)
        .map(ToString::to_string)
        .collect()
}

pub fn evaluate_response_deterministic(
    heading: &Option<String>,
    body: &str,
    response: &str,
) -> (String, String) {
    let trimmed = response.trim();
    if trimmed.len() < 12 {
        return (
            "off_track".to_string(),
            "Your answer is too short to show the main idea yet.".to_string(),
        );
    }

    let section_tokens = tokenize(&format!(
        "{} {}",
        heading.as_deref().unwrap_or(""),
        &body[..body.len().min(800)]
    ));
    let response_tokens = tokenize(trimmed);

    let overlap = response_tokens
        .iter()
        .filter(|token| section_tokens.contains(token))
        .count();

    if overlap >= 3 && trimmed.len() >= 30 {
        (
            "correct".to_string(),
            "You captured the main idea of the section.".to_string(),
        )
    } else if overlap >= 1 && trimmed.len() >= 18 {
        (
            "partial".to_string(),
            "You have part of it, but tighten the key idea before moving on."
                .to_string(),
        )
    } else {
        (
            "off_track".to_string(),
            "Your answer misses the main point of the section.".to_string(),
        )
    }
}

pub fn get_reader_session(conn: &Connection, chapter_id: i64) -> Result<ReaderSession, String> {
    let chapter = conn
        .query_row(
            "SELECT ch.id, ch.subject_id, s.name, ch.title, ch.status, ch.estimated_minutes
             FROM chapters ch
             JOIN subjects s ON s.id = ch.subject_id
             WHERE ch.id = ?1",
            [chapter_id],
            |row| {
                Ok(ReaderChapter {
                    id: row.get(0)?,
                    subject_id: row.get(1)?,
                    subject_name: row.get(2)?,
                    title: row.get(3)?,
                    status: row.get(4)?,
                    estimated_minutes: row.get(5)?,
                })
            },
        )
        .map_err(|e| format!("Chapter not found: {e}"))?;

    let mut stmt = conn
        .prepare(
            "SELECT id, section_index, heading, body_markdown, word_count, status
             FROM chapter_sections WHERE chapter_id = ?1
             ORDER BY section_index",
        )
        .map_err(|e| e.to_string())?;

    let sections: Vec<ReaderSection> = stmt
        .query_map([chapter_id], |row| {
            let heading: Option<String> = row.get(2)?;
            let body: String = row.get(3)?;
            let prompt = generate_prompt(&heading, &body);
            Ok(ReaderSection {
                id: row.get(0)?,
                section_index: row.get(1)?,
                heading,
                body_markdown: body,
                word_count: row.get(4)?,
                status: row.get(5)?,
                prompt,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let current_index = sections
        .iter()
        .find(|s| s.status == "unseen" || s.status == "seen")
        .map(|s| s.section_index)
        .unwrap_or(0);

    Ok(ReaderSession {
        chapter,
        sections,
        current_index,
    })
}

pub fn mark_section_seen(
    conn: &Connection,
    chapter_id: i64,
    section_index: i32,
) -> Result<(), String> {
    conn.execute(
        "UPDATE chapter_sections SET status = 'seen' WHERE chapter_id = ?1 AND section_index = ?2 AND status = 'unseen'",
        rusqlite::params![chapter_id, section_index],
    )
    .map_err(|e| e.to_string())?;

    // Transition chapter to 'reading' if still 'new'
    conn.execute(
        "UPDATE chapters SET status = 'reading', updated_at = datetime('now') WHERE id = ?1 AND status = 'new'",
        [chapter_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

pub fn process_check(
    conn: &Connection,
    chapter_id: i64,
    section_index: i32,
    response: &str,
    self_rating: &str,
    feedback: Option<String>,
    evaluated_by_ai: bool,
) -> Result<CheckResult, String> {
    // Get current section status
    let current_status: String = conn
        .query_row(
            "SELECT status FROM chapter_sections WHERE chapter_id = ?1 AND section_index = ?2",
            rusqlite::params![chapter_id, section_index],
            |row| row.get(0),
        )
        .map_err(|e| format!("Section not found: {e}"))?;

    let mut can_retry = false;
    let mut repair_card_created = false;

    match self_rating {
        "correct" => {
            conn.execute(
                "UPDATE chapter_sections SET status = 'checked_correct' WHERE chapter_id = ?1 AND section_index = ?2",
                rusqlite::params![chapter_id, section_index],
            ).map_err(|e| e.to_string())?;
        }
        "partial" => {
            if current_status == "seen" {
                // First attempt partial — mark as checked_partial but allow one retry
                can_retry = true;
                conn.execute(
                    "UPDATE chapter_sections SET status = 'checked_partial' WHERE chapter_id = ?1 AND section_index = ?2",
                    rusqlite::params![chapter_id, section_index],
                ).map_err(|e| e.to_string())?;
            } else {
                // Second attempt or already checked_partial — finalize, no more retries
                conn.execute(
                    "UPDATE chapter_sections SET status = 'checked_partial' WHERE chapter_id = ?1 AND section_index = ?2",
                    rusqlite::params![chapter_id, section_index],
                ).map_err(|e| e.to_string())?;
            }
        }
        "off_track" => {
            conn.execute(
                "UPDATE chapter_sections SET status = 'checked_off_track' WHERE chapter_id = ?1 AND section_index = ?2",
                rusqlite::params![chapter_id, section_index],
            ).map_err(|e| e.to_string())?;

            // Create repair card
            let heading: Option<String> = conn
                .query_row(
                    "SELECT heading FROM chapter_sections WHERE chapter_id = ?1 AND section_index = ?2",
                    rusqlite::params![chapter_id, section_index],
                    |row| row.get(0),
                )
                .map_err(|e| e.to_string())?;

            let subject_id: i64 = conn
                .query_row(
                    "SELECT subject_id FROM chapters WHERE id = ?1",
                    [chapter_id],
                    |row| row.get(0),
                )
                .map_err(|e| e.to_string())?;

            let prompt = format!("Review: {}", heading.as_deref().unwrap_or("this section"));

            conn.execute(
                "INSERT INTO cards (subject_id, chapter_id, source_type, prompt, answer, card_type, status, created_at)
                 VALUES (?1, ?2, 'repair', ?3, ?4, 'basic', 'active', datetime('now'))",
                rusqlite::params![subject_id, chapter_id, prompt, response],
            ).map_err(|e| e.to_string())?;

            let card_id = conn.last_insert_rowid();

            conn.execute(
                "INSERT INTO card_schedule (card_id, next_review, stability, difficulty, reps, lapses)
                 VALUES (?1, datetime('now'), 1.0, 5.0, 0, 0)",
                [card_id],
            ).map_err(|e| e.to_string())?;

            repair_card_created = true;
        }
        _ => return Err(format!("Invalid self_rating: {self_rating}")),
    }

    // Log study event
    let subject_id: i64 = conn
        .query_row(
            "SELECT subject_id FROM chapters WHERE id = ?1",
            [chapter_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let payload = serde_json::json!({
        "section_index": section_index,
        "rating": self_rating,
        "response_length": response.len(),
        "evaluated_by_ai": evaluated_by_ai,
    });

    conn.execute(
        "INSERT INTO study_events (subject_id, chapter_id, event_type, payload_json, created_at)
         VALUES (?1, ?2, 'section_check_submitted', ?3, datetime('now'))",
        rusqlite::params![subject_id, chapter_id, payload.to_string()],
    )
    .map_err(|e| e.to_string())?;

    // Check if all sections are done
    let unchecked_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM chapter_sections WHERE chapter_id = ?1 AND status IN ('unseen', 'seen')",
            [chapter_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let chapter_complete = unchecked_count == 0 && !can_retry;

    if chapter_complete {
        conn.execute(
            "UPDATE chapters SET status = 'awaiting_synthesis', updated_at = datetime('now') WHERE id = ?1",
            [chapter_id],
        ).map_err(|e| e.to_string())?;
    }

    Ok(CheckResult {
        outcome: self_rating.to_string(),
        can_retry,
        repair_card_created,
        chapter_complete,
        feedback,
        evaluated_by_ai,
    })
}

pub fn process_synthesis(
    conn: &Connection,
    chapter_id: i64,
    _synthesis_text: &str,
) -> Result<SynthesisResult, String> {
    // Verify chapter is awaiting synthesis
    let current_status: String = conn
        .query_row(
            "SELECT status FROM chapters WHERE id = ?1",
            [chapter_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("Chapter not found: {e}"))?;

    if current_status != "awaiting_synthesis" {
        return Err(format!(
            "Chapter is not awaiting synthesis (current: {current_status})"
        ));
    }

    conn.execute(
        "UPDATE chapters SET status = 'ready_for_quiz', updated_at = datetime('now') WHERE id = ?1",
        [chapter_id],
    )
    .map_err(|e| e.to_string())?;

    // Log study event
    let subject_id: i64 = conn
        .query_row(
            "SELECT subject_id FROM chapters WHERE id = ?1",
            [chapter_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO study_events (subject_id, chapter_id, event_type, created_at)
         VALUES (?1, ?2, 'synthesis_completed', datetime('now'))",
        rusqlite::params![subject_id, chapter_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(SynthesisResult {
        success: true,
        new_status: "ready_for_quiz".to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;

    fn setup_test_db() -> Database {
        let db = Database::open_memory().expect("Failed to open test DB");
        // open_memory() already runs all migrations — no need to call run_all again
        db.with_conn(|conn| {
            conn.execute(
                "INSERT INTO subjects (slug, name, created_at) VALUES ('test', 'Test Subject', datetime('now'))",
                [],
            ).map_err(|e| e.to_string())?;
            conn.execute(
                "INSERT INTO chapters (subject_id, title, slug, status, created_at, updated_at)
                 VALUES (1, 'Test Chapter', 'test-chapter', 'new', datetime('now'), datetime('now'))",
                [],
            ).map_err(|e| e.to_string())?;
            conn.execute(
                "INSERT INTO chapter_sections (chapter_id, section_index, heading, body_markdown, word_count, status)
                 VALUES (1, 0, 'Introduction', 'This is the intro.', 4, 'unseen')",
                [],
            ).map_err(|e| e.to_string())?;
            conn.execute(
                "INSERT INTO chapter_sections (chapter_id, section_index, heading, body_markdown, word_count, status)
                 VALUES (1, 1, 'Steps to follow', 'Step 1: do this. Step 2: do that.', 8, 'unseen')",
                [],
            ).map_err(|e| e.to_string())?;
            Ok(())
        }).expect("Failed to seed test DB");
        db
    }

    #[test]
    fn test_generate_prompt_procedural() {
        let prompt = generate_prompt(&Some("Steps to follow".to_string()), "Step 1: do this.");
        assert!(prompt.contains("steps or process"));
    }

    #[test]
    fn test_generate_prompt_comparison() {
        let prompt = generate_prompt(&Some("X vs Y".to_string()), "Comparing two approaches.");
        assert!(prompt.contains("differences or similarities"));
    }

    #[test]
    fn test_generate_prompt_definition() {
        let prompt = generate_prompt(
            &Some("Definition of Entropy".to_string()),
            "The definition is...",
        );
        assert!(prompt.contains("key concept"));
    }

    #[test]
    fn test_generate_prompt_default() {
        let prompt = generate_prompt(&Some("Overview".to_string()), "General content here.");
        assert!(prompt.contains("Summarize"));
    }

    #[test]
    fn test_load_session() {
        let db = setup_test_db();
        db.with_conn(|conn| {
            let session = get_reader_session(conn, 1).unwrap();
            assert_eq!(session.chapter.title, "Test Chapter");
            assert_eq!(session.sections.len(), 2);
            assert_eq!(session.current_index, 0);
            assert_eq!(session.sections[0].status, "unseen");
            Ok(())
        })
        .unwrap();
    }

    #[test]
    fn test_mark_seen_transitions_chapter() {
        let db = setup_test_db();
        db.with_conn(|conn| {
            mark_section_seen(conn, 1, 0).unwrap();
            let status: String = conn
                .query_row("SELECT status FROM chapters WHERE id = 1", [], |row| {
                    row.get(0)
                })
                .map_err(|e| e.to_string())?;
            assert_eq!(status, "reading");
            Ok(())
        })
        .unwrap();
    }

    #[test]
    fn test_check_correct_advances() {
        let db = setup_test_db();
        db.with_conn(|conn| {
            mark_section_seen(conn, 1, 0).unwrap();
            let result = process_check(conn, 1, 0, "my answer", "correct", None, false).unwrap();
            assert_eq!(result.outcome, "correct");
            assert!(!result.can_retry);
            assert!(!result.repair_card_created);
            Ok(())
        })
        .unwrap();
    }

    #[test]
    fn test_check_partial_allows_retry_once() {
        let db = setup_test_db();
        db.with_conn(|conn| {
            mark_section_seen(conn, 1, 0).unwrap();
            let r1 = process_check(conn, 1, 0, "partial answer", "partial", None, false).unwrap();
            assert!(r1.can_retry);

            let r2 = process_check(conn, 1, 0, "better answer", "partial", None, false).unwrap();
            assert!(!r2.can_retry);
            Ok(())
        })
        .unwrap();
    }

    #[test]
    fn test_check_off_track_creates_repair_card() {
        let db = setup_test_db();
        db.with_conn(|conn| {
            mark_section_seen(conn, 1, 0).unwrap();
            let result =
                process_check(conn, 1, 0, "wrong answer", "off_track", None, false).unwrap();
            assert!(result.repair_card_created);

            let card_count: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM cards WHERE chapter_id = 1 AND source_type = 'repair'",
                    [],
                    |row| row.get(0),
                )
                .map_err(|e| e.to_string())?;
            assert_eq!(card_count, 1);
            Ok(())
        })
        .unwrap();
    }

    #[test]
    fn test_all_sections_checked_triggers_synthesis() {
        let db = setup_test_db();
        db.with_conn(|conn| {
            mark_section_seen(conn, 1, 0).unwrap();
            mark_section_seen(conn, 1, 1).unwrap();
            process_check(conn, 1, 0, "answer", "correct", None, false).unwrap();
            let result =
                process_check(conn, 1, 1, "answer", "correct", None, false).unwrap();
            assert!(result.chapter_complete);

            let status: String = conn
                .query_row("SELECT status FROM chapters WHERE id = 1", [], |row| {
                    row.get(0)
                })
                .map_err(|e| e.to_string())?;
            assert_eq!(status, "awaiting_synthesis");
            Ok(())
        })
        .unwrap();
    }

    #[test]
    fn test_synthesis_transitions_to_ready_for_quiz() {
        let db = setup_test_db();
        db.with_conn(|conn| {
            // Complete all sections first
            mark_section_seen(conn, 1, 0).unwrap();
            mark_section_seen(conn, 1, 1).unwrap();
            process_check(conn, 1, 0, "a", "correct", None, false).unwrap();
            process_check(conn, 1, 1, "a", "correct", None, false).unwrap();

            let result = process_synthesis(conn, 1, "My synthesis").unwrap();
            assert!(result.success);
            assert_eq!(result.new_status, "ready_for_quiz");
            Ok(())
        })
        .unwrap();
    }

    #[test]
    fn test_study_events_logged() {
        let db = setup_test_db();
        db.with_conn(|conn| {
            mark_section_seen(conn, 1, 0).unwrap();
            process_check(conn, 1, 0, "answer", "correct", None, false).unwrap();

            let count: i64 = conn.query_row(
                "SELECT COUNT(*) FROM study_events WHERE event_type = 'section_check_submitted'",
                [], |row| row.get(0)
            ).map_err(|e| e.to_string())?;
            assert_eq!(count, 1);
            Ok(())
        })
        .unwrap();
    }
}
