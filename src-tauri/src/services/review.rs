use crate::services::fsrs;
use rusqlite::Connection;
use serde::Serialize;

#[derive(Serialize)]
pub struct DueCard {
    pub id: i64,
    pub subject_id: i64,
    pub chapter_id: Option<i64>,
    pub source_type: String,
    pub prompt: String,
    pub answer: String,
    pub card_type: String,
    pub stability: f64,
    pub difficulty: f64,
    pub reps: i64,
    pub lapses: i64,
}

#[derive(Serialize)]
pub struct RatingResult {
    pub next_review_days: i64,
    pub new_stability: f64,
    pub cards_remaining: i64,
}

pub fn get_due_cards(conn: &Connection, limit: i64) -> Result<Vec<DueCard>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT c.id, c.subject_id, c.chapter_id, c.source_type, c.prompt, c.answer, c.card_type,
                    cs.stability, cs.difficulty, cs.reps, cs.lapses
             FROM cards c
             JOIN card_schedule cs ON cs.card_id = c.id
             WHERE c.status = 'active' AND cs.next_review <= datetime('now')
             ORDER BY cs.next_review ASC
             LIMIT ?1",
        )
        .map_err(|e| format!("Failed to query due cards: {e}"))?;

    let cards = stmt
        .query_map([limit], |row| {
            Ok(DueCard {
                id: row.get(0)?,
                subject_id: row.get(1)?,
                chapter_id: row.get(2)?,
                source_type: row.get(3)?,
                prompt: row.get(4)?,
                answer: row.get(5)?,
                card_type: row.get(6)?,
                stability: row.get(7)?,
                difficulty: row.get(8)?,
                reps: row.get(9)?,
                lapses: row.get(10)?,
            })
        })
        .map_err(|e| format!("Failed to map due cards: {e}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(cards)
}

pub fn submit_rating(conn: &Connection, card_id: i64, rating: i32) -> Result<RatingResult, String> {
    // 1. Read current schedule state
    let (stability, difficulty, reps, lapses): (f64, f64, i64, i64) = conn
        .query_row(
            "SELECT stability, difficulty, reps, lapses FROM card_schedule WHERE card_id = ?1",
            [card_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .map_err(|e| format!("Card schedule not found: {e}"))?;

    // 2. Run FSRS calculation
    let state = fsrs::ScheduleState {
        stability,
        difficulty,
        reps,
        lapses,
    };
    let output = fsrs::schedule(&state, rating);

    // 3. Update card_schedule
    conn.execute(
        "UPDATE card_schedule SET
            next_review = datetime('now', '+' || ?2 || ' days'),
            stability = ?3, difficulty = ?4, reps = ?5, lapses = ?6,
            last_reviewed = datetime('now')
         WHERE card_id = ?1",
        rusqlite::params![
            card_id,
            output.next_review_days,
            output.new_stability,
            output.new_difficulty,
            output.new_reps,
            output.new_lapses,
        ],
    )
    .map_err(|e| format!("Failed to update schedule: {e}"))?;

    // 4. Insert card_reviews row
    conn.execute(
        "INSERT INTO card_reviews (card_id, rating, reviewed_at, scheduled_days, stability, difficulty)
         VALUES (?1, ?2, datetime('now'), ?3, ?4, ?5)",
        rusqlite::params![
            card_id,
            rating,
            output.next_review_days,
            output.new_stability,
            output.new_difficulty,
        ],
    )
    .map_err(|e| format!("Failed to insert review: {e}"))?;

    // 5. Log study event
    let subject_id: Option<i64> = conn
        .query_row(
            "SELECT subject_id FROM cards WHERE id = ?1",
            [card_id],
            |row| row.get(0),
        )
        .ok();

    let payload = serde_json::json!({ "card_id": card_id, "rating": rating });
    conn.execute(
        "INSERT INTO study_events (subject_id, card_id, event_type, payload_json, created_at)
         VALUES (?1, ?2, 'card_reviewed', ?3, datetime('now'))",
        rusqlite::params![subject_id, card_id, payload.to_string()],
    )
    .map_err(|e| format!("Failed to log event: {e}"))?;

    // 6. Count remaining due cards
    let remaining: i64 = conn
        .query_row(
            "SELECT COUNT(*)
             FROM card_schedule cs
             JOIN cards c ON c.id = cs.card_id
             WHERE c.status = 'active' AND cs.next_review <= datetime('now')",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    Ok(RatingResult {
        next_review_days: output.next_review_days,
        new_stability: output.new_stability,
        cards_remaining: remaining,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;

    fn setup_test_db_with_card() -> Database {
        let db = Database::open_memory().expect("Failed to open test DB");
        db.with_conn(|conn| {
            conn.execute(
                "INSERT INTO subjects (slug, name, created_at) VALUES ('test', 'Test', datetime('now'))",
                [],
            )
            .map_err(|e| e.to_string())?;
            conn.execute(
                "INSERT INTO cards (subject_id, source_type, prompt, answer, card_type, status, created_at)
                 VALUES (1, 'repair', 'What is X?', 'X is Y.', 'basic', 'active', datetime('now'))",
                [],
            )
            .map_err(|e| e.to_string())?;
            conn.execute(
                "INSERT INTO card_schedule (card_id, next_review, stability, difficulty, reps, lapses)
                 VALUES (1, datetime('now', '-1 hour'), 1.0, 5.0, 0, 0)",
                [],
            )
            .map_err(|e| e.to_string())?;
            Ok(())
        })
        .expect("setup failed");
        db
    }

    #[test]
    fn test_get_due_cards_returns_due() {
        let db = setup_test_db_with_card();
        db.with_conn(|conn| {
            let cards = get_due_cards(conn, 50)?;
            assert_eq!(cards.len(), 1);
            assert_eq!(cards[0].prompt, "What is X?");
            Ok(())
        })
        .expect("test failed");
    }

    #[test]
    fn test_get_due_cards_excludes_future() {
        let db = setup_test_db_with_card();
        db.with_conn(|conn| {
            // Move card to future
            conn.execute(
                "UPDATE card_schedule SET next_review = datetime('now', '+7 days') WHERE card_id = 1",
                [],
            )
            .map_err(|e| e.to_string())?;
            let cards = get_due_cards(conn, 50)?;
            assert_eq!(cards.len(), 0);
            Ok(())
        })
        .expect("test failed");
    }

    #[test]
    fn test_submit_rating_updates_schedule() {
        let db = setup_test_db_with_card();
        db.with_conn(|conn| {
            let result = submit_rating(conn, 1, 3)?; // Good
            assert_eq!(result.next_review_days, 5); // new card + Good = 5 days
            assert_eq!(result.cards_remaining, 0); // card now in future
            Ok(())
        })
        .expect("test failed");
    }

    #[test]
    fn test_submit_rating_counts_only_active_due_cards() {
        let db = setup_test_db_with_card();
        db.with_conn(|conn| {
            conn.execute(
                "INSERT INTO cards (subject_id, source_type, prompt, answer, card_type, status, created_at)
                 VALUES (1, 'manual', 'Suspended?', 'Nope', 'basic', 'suspended', datetime('now'))",
                [],
            )
            .map_err(|e| e.to_string())?;
            conn.execute(
                "INSERT INTO card_schedule (card_id, next_review, stability, difficulty, reps, lapses)
                 VALUES (2, datetime('now', '-1 hour'), 1.0, 5.0, 0, 0)",
                [],
            )
            .map_err(|e| e.to_string())?;

            let result = submit_rating(conn, 1, 3)?;
            assert_eq!(result.cards_remaining, 0);
            Ok(())
        })
        .expect("test failed");
    }

    #[test]
    fn test_submit_rating_creates_review_record() {
        let db = setup_test_db_with_card();
        db.with_conn(|conn| {
            submit_rating(conn, 1, 3)?;
            let count: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM card_reviews WHERE card_id = 1",
                    [],
                    |row| row.get(0),
                )
                .map_err(|e| e.to_string())?;
            assert_eq!(count, 1);
            Ok(())
        })
        .expect("test failed");
    }

    #[test]
    fn test_submit_rating_logs_study_event() {
        let db = setup_test_db_with_card();
        db.with_conn(|conn| {
            submit_rating(conn, 1, 3)?;
            let count: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM study_events WHERE event_type = 'card_reviewed'",
                    [],
                    |row| row.get(0),
                )
                .map_err(|e| e.to_string())?;
            assert_eq!(count, 1);
            Ok(())
        })
        .expect("test failed");
    }
}
