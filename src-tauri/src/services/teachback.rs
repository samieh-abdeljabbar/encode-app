use rusqlite::Connection;
use serde::{Deserialize, Serialize};

use crate::services::cards;

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

/// Core function that writes the evaluation result to DB and optionally creates a repair card.
/// Called by both AI evaluation path and self-rating path.
pub fn finalize_teachback(
    conn: &Connection,
    teachback_id: i64,
    response: &str,
    scores: &RubricScores,
    strongest: &str,
    biggest_gap: &str,
    chapter_id_override: Option<i64>,
) -> Result<TeachbackResult, String> {
    let overall =
        (scores.accuracy + scores.clarity + scores.completeness + scores.example + scores.jargon)
            / 5;
    let mastery = mastery_band(overall).to_string();

    // Query subject_id and chapter_id once for both repair card and study event
    let (subject_id, chapter_id): (i64, Option<i64>) = conn
        .query_row(
            "SELECT subject_id, chapter_id FROM teachbacks WHERE id = ?1",
            [teachback_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| format!("Teachback not found: {e}"))?;

    // Create repair card if weak or developing
    let mut repair_card_id = None;
    if mastery == "weak" || mastery == "developing" {
        let ch_id = chapter_id_override.or(chapter_id);
        let card_id = cards::insert_card_with_schedule_pub(
            conn,
            subject_id,
            ch_id,
            "teachback_miss",
            biggest_gap,
            &format!("Review: {}", biggest_gap),
            "basic",
        )?;
        repair_card_id = Some(card_id);
    }

    let eval_json = serde_json::json!({
        "scores": {
            "accuracy": scores.accuracy,
            "clarity": scores.clarity,
            "completeness": scores.completeness,
            "example": scores.example,
            "jargon": scores.jargon,
        },
        "overall": overall,
        "strongest": strongest,
        "biggest_gap": biggest_gap,
        "repair_card_id": repair_card_id,
    });

    conn.execute(
        "UPDATE teachbacks SET response = ?2, evaluation_json = ?3, mastery = ?4 WHERE id = ?1",
        rusqlite::params![teachback_id, response, eval_json.to_string(), mastery],
    )
    .map_err(|e| format!("Failed to update teachback: {e}"))?;

    // Log study event (reuse subject_id from above)
    conn.execute(
        "INSERT INTO study_events (subject_id, event_type, created_at) VALUES (?1, 'teachback', datetime('now'))",
        [subject_id],
    )
    .map_err(|e| format!("Failed to log study event: {e}"))?;

    Ok(TeachbackResult {
        mastery,
        scores: scores.clone(),
        overall,
        strongest: strongest.to_string(),
        biggest_gap: biggest_gap.to_string(),
        repair_card_id,
        needs_self_rating: false,
    })
}

/// No-AI mode: user rates themselves on each rubric criterion.
pub fn submit_self_rating(
    conn: &Connection,
    teachback_id: i64,
    response: &str,
    ratings: &RubricScores,
) -> Result<TeachbackResult, String> {
    let criteria = [
        ("Accuracy", ratings.accuracy),
        ("Clarity", ratings.clarity),
        ("Completeness", ratings.completeness),
        ("Concrete example", ratings.example),
        ("Jargon explanation", ratings.jargon),
    ];
    let (weakest_name, _) = criteria.iter().min_by_key(|(_, score)| score).unwrap();
    let (strongest_name, _) = criteria.iter().max_by_key(|(_, score)| score).unwrap();

    finalize_teachback(
        conn,
        teachback_id,
        response,
        ratings,
        &format!("{strongest_name} was your strongest area"),
        &format!("{weakest_name} needs more work"),
        None,
    )
}

pub fn list_teachbacks(
    conn: &Connection,
    subject_id: Option<i64>,
) -> Result<Vec<TeachbackListItem>, String> {
    let query = if subject_id.is_some() {
        "SELECT t.id, t.chapter_id, COALESCE(ch.title, 'Unknown'), s.name, t.mastery, t.created_at
         FROM teachbacks t
         JOIN subjects s ON s.id = t.subject_id
         LEFT JOIN chapters ch ON ch.id = t.chapter_id
         WHERE t.subject_id = ?1
         ORDER BY t.created_at DESC
         LIMIT 50"
    } else {
        "SELECT t.id, t.chapter_id, COALESCE(ch.title, 'Unknown'), s.name, t.mastery, t.created_at
         FROM teachbacks t
         JOIN subjects s ON s.id = t.subject_id
         LEFT JOIN chapters ch ON ch.id = t.chapter_id
         ORDER BY t.created_at DESC
         LIMIT 50"
    };

    let mut stmt = conn.prepare(query).map_err(|e| e.to_string())?;

    let rows = if let Some(sid) = subject_id {
        stmt.query_map([sid], |row| {
            Ok(TeachbackListItem {
                id: row.get(0)?,
                chapter_id: row.get(1)?,
                chapter_title: row.get(2)?,
                subject_name: row.get(3)?,
                mastery: row.get(4)?,
                created_at: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?
    } else {
        stmt.query_map([], |row| {
            Ok(TeachbackListItem {
                id: row.get(0)?,
                chapter_id: row.get(1)?,
                chapter_title: row.get(2)?,
                subject_name: row.get(3)?,
                mastery: row.get(4)?,
                created_at: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?
    };

    Ok(rows)
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

            let mastery: Option<String> = conn
                .query_row(
                    "SELECT mastery FROM teachbacks WHERE id = ?1",
                    [result.id],
                    |row| row.get(0),
                )
                .unwrap();
            assert!(mastery.is_none());
            Ok(())
        })
        .expect("test failed");
    }

    #[test]
    fn test_submit_teachback_solid_no_repair_card() {
        let db = setup();
        db.with_conn(|conn| {
            let start = start_teachback(conn, 1).unwrap();
            let scores = RubricScores {
                accuracy: 80,
                clarity: 75,
                completeness: 65,
                example: 70,
                jargon: 60,
            };
            let result = finalize_teachback(
                conn,
                start.id,
                "My explanation of arrays...",
                &scores,
                "Good accuracy",
                "Missing linked list comparison",
                None,
            )
            .unwrap();
            assert_eq!(result.mastery, "solid"); // avg = 70
            assert!(result.repair_card_id.is_none());
            assert!(!result.needs_self_rating);

            let mastery: String = conn
                .query_row(
                    "SELECT mastery FROM teachbacks WHERE id = ?1",
                    [start.id],
                    |row| row.get(0),
                )
                .unwrap();
            assert_eq!(mastery, "solid");
            Ok(())
        })
        .expect("test failed");
    }

    #[test]
    fn test_submit_teachback_weak_creates_repair_card() {
        let db = setup();
        db.with_conn(|conn| {
            let start = start_teachback(conn, 1).unwrap();
            let scores = RubricScores {
                accuracy: 30,
                clarity: 20,
                completeness: 25,
                example: 10,
                jargon: 15,
            };
            let result = finalize_teachback(
                conn,
                start.id,
                "I don't remember",
                &scores,
                "Attempted",
                "Missed all key concepts",
                None,
            )
            .unwrap();
            assert_eq!(result.mastery, "weak"); // avg = 20
            assert!(result.repair_card_id.is_some());

            let card_source: String = conn
                .query_row(
                    "SELECT source_type FROM cards WHERE id = ?1",
                    [result.repair_card_id.unwrap()],
                    |row| row.get(0),
                )
                .unwrap();
            assert_eq!(card_source, "teachback_miss");
            Ok(())
        })
        .expect("test failed");
    }

    #[test]
    fn test_submit_teachback_developing_creates_repair_card() {
        let db = setup();
        db.with_conn(|conn| {
            let start = start_teachback(conn, 1).unwrap();
            let scores = RubricScores {
                accuracy: 55,
                clarity: 50,
                completeness: 45,
                example: 40,
                jargon: 50,
            };
            let result = finalize_teachback(
                conn,
                start.id,
                "Arrays are data structures",
                &scores,
                "Basic understanding",
                "No concrete example",
                None,
            )
            .unwrap();
            assert_eq!(result.mastery, "developing"); // avg = 48
            assert!(result.repair_card_id.is_some());
            Ok(())
        })
        .expect("test failed");
    }

    #[test]
    fn test_self_rating_computes_mastery() {
        let db = setup();
        db.with_conn(|conn| {
            let start = start_teachback(conn, 1).unwrap();
            let ratings = RubricScores {
                accuracy: 100,
                clarity: 50,
                completeness: 100,
                example: 0,
                jargon: 50,
            };
            let result = submit_self_rating(conn, start.id, "My explanation", &ratings).unwrap();
            // avg = (100+50+100+0+50)/5 = 60 → solid
            assert_eq!(result.overall, 60);
            assert_eq!(result.mastery, "solid");
            Ok(())
        })
        .expect("test failed");
    }

    #[test]
    fn test_list_teachbacks() {
        let db = setup();
        db.with_conn(|conn| {
            let start = start_teachback(conn, 1).unwrap();
            let scores = RubricScores {
                accuracy: 80,
                clarity: 80,
                completeness: 80,
                example: 80,
                jargon: 80,
            };
            finalize_teachback(
                conn,
                start.id,
                "Great explanation",
                &scores,
                "All good",
                "Minor gaps",
                None,
            )
            .unwrap();

            let all = list_teachbacks(conn, None).unwrap();
            assert_eq!(all.len(), 1);
            assert_eq!(all[0].chapter_title, "Data Structures");
            assert_eq!(all[0].mastery, Some("ready".to_string()));

            let filtered = list_teachbacks(conn, Some(1)).unwrap();
            assert_eq!(filtered.len(), 1);

            let empty = list_teachbacks(conn, Some(999)).unwrap();
            assert_eq!(empty.len(), 0);
            Ok(())
        })
        .expect("test failed");
    }
}
