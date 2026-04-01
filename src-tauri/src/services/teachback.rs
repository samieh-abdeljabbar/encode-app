use rusqlite::Connection;
use serde::{Deserialize, Serialize};

pub const TEACHBACK_GENERATE_PROMPT: &str = r#"You are generating a teach-back prompt for a student. Given the chapter content below, create a single focused question that asks the student to explain a key concept in their own words. The question should require demonstrating understanding, not just recall. Ask them to include a concrete example. Return ONLY the question text, nothing else."#;

pub const TEACHBACK_EVALUATE_PROMPT: &str = r#"You are evaluating a student's teach-back explanation. Score each criterion 0-100:
- accuracy: factual correctness
- clarity: organization and flow
- completeness: covers key concepts
- example: includes a real, illustrative example
- jargon: technical terms are explained, not just dropped

Respond with JSON only:
{"scores":{"accuracy":N,"clarity":N,"completeness":N,"example":N,"jargon":N},"overall":N,"strongest":"one sentence","biggest_gap":"one sentence"}"#;

const DETERMINISTIC_PROMPT: &str = "Explain the key concepts from this chapter in your own words. Include at least one concrete example.";

#[derive(Serialize)]
pub struct TeachbackStart {
    pub id: i64,
    pub prompt: String,
    pub chapter_title: String,
    pub subject_name: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct RubricScores {
    pub accuracy: i32,
    pub clarity: i32,
    pub completeness: i32,
    pub example: i32,
    pub jargon: i32,
}

#[derive(Serialize)]
pub struct TeachbackResult {
    pub mastery: String,
    pub scores: RubricScores,
    pub overall: i32,
    pub strongest: String,
    pub biggest_gap: String,
    pub repair_card_id: Option<i64>,
    pub needs_self_rating: bool,
}

#[derive(Serialize)]
pub struct TeachbackListItem {
    pub id: i64,
    pub chapter_id: Option<i64>,
    pub chapter_title: String,
    pub subject_name: String,
    pub mastery: Option<String>,
    pub created_at: String,
}

fn mastery_band(overall: i32) -> &'static str {
    match overall {
        0..=39 => "weak",
        40..=59 => "developing",
        60..=79 => "solid",
        _ => "ready",
    }
}

pub fn start_teachback(conn: &Connection, chapter_id: i64) -> Result<TeachbackStart, String> {
    // Load chapter + subject info
    let (chapter_title, subject_id, subject_name): (String, i64, String) = conn
        .query_row(
            "SELECT ch.title, ch.subject_id, s.name
             FROM chapters ch
             JOIN subjects s ON s.id = ch.subject_id
             WHERE ch.id = ?1",
            [chapter_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|e| format!("Chapter not found: {e}"))?;

    // Verify chapter has sections
    let section_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM chapter_sections WHERE chapter_id = ?1",
            [chapter_id],
            |row| row.get(0),
        )
        .unwrap_or(0);

    if section_count == 0 {
        return Err("Chapter has no sections".to_string());
    }

    let prompt = DETERMINISTIC_PROMPT.to_string();

    conn.execute(
        "INSERT INTO teachbacks (subject_id, chapter_id, prompt, created_at)
         VALUES (?1, ?2, ?3, datetime('now'))",
        rusqlite::params![subject_id, chapter_id, prompt],
    )
    .map_err(|e| format!("Failed to create teachback: {e}"))?;

    let id = conn.last_insert_rowid();

    Ok(TeachbackStart {
        id,
        prompt,
        chapter_title,
        subject_name,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;

    fn setup() -> Database {
        let db = Database::open_memory().expect("open");
        db.with_conn(|conn| {
            conn.execute(
                "INSERT INTO subjects (slug, name, created_at) VALUES ('cs', 'CS', datetime('now'))",
                [],
            ).unwrap();
            conn.execute(
                "INSERT INTO chapters (subject_id, title, slug, status, estimated_minutes, created_at, updated_at)
                 VALUES (1, 'Data Structures', 'data-structures', 'mastering', 10, datetime('now'), datetime('now'))",
                [],
            ).unwrap();
            conn.execute(
                "INSERT INTO chapter_sections (chapter_id, section_index, heading, body_markdown, word_count, status)
                 VALUES (1, 0, 'Arrays', 'Arrays store elements in contiguous memory.', 6, 'checked_correct')",
                [],
            ).unwrap();
            Ok(())
        }).expect("setup");
        db
    }

    #[test]
    fn test_start_teachback_creates_record() {
        let db = setup();
        db.with_conn(|conn| {
            let result = start_teachback(conn, 1).unwrap();
            assert_eq!(result.chapter_title, "Data Structures");
            assert_eq!(result.subject_name, "CS");
            assert!(!result.prompt.is_empty());
            assert!(result.id > 0);

            let mastery: Option<String> = conn.query_row(
                "SELECT mastery FROM teachbacks WHERE id = ?1",
                [result.id],
                |row| row.get(0),
            ).unwrap();
            assert!(mastery.is_none());
            Ok(())
        }).expect("test failed");
    }
}
