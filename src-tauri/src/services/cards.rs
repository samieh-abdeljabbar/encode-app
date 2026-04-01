use rusqlite::Connection;
use serde::{Deserialize, Serialize};

#[derive(Serialize)]
pub struct CardInfo {
    pub id: i64,
    pub subject_id: i64,
    pub chapter_id: Option<i64>,
    pub source_type: String,
    pub prompt: String,
    pub answer: String,
    pub card_type: String,
    pub status: String,
    pub created_at: String,
    pub next_review: Option<String>,
    pub stability: Option<f64>,
    pub reps: Option<i64>,
    pub lapses: Option<i64>,
}

#[derive(Deserialize)]
pub struct CardCreateInput {
    pub subject_id: i64,
    pub chapter_id: Option<i64>,
    pub prompt: String,
    pub answer: String,
    pub card_type: String,
}

fn insert_card_with_schedule(
    conn: &Connection,
    subject_id: i64,
    chapter_id: Option<i64>,
    source_type: &str,
    prompt: &str,
    answer: &str,
    card_type: &str,
) -> Result<i64, String> {
    conn.execute(
        "INSERT INTO cards (subject_id, chapter_id, source_type, prompt, answer, card_type, status, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'active', datetime('now'))",
        rusqlite::params![subject_id, chapter_id, source_type, prompt, answer, card_type],
    )
    .map_err(|e| format!("Failed to create card: {e}"))?;

    let card_id = conn.last_insert_rowid();

    conn.execute(
        "INSERT INTO card_schedule (card_id, next_review, stability, difficulty, reps, lapses)
         VALUES (?1, datetime('now'), 1.0, 5.0, 0, 0)",
        [card_id],
    )
    .map_err(|e| format!("Failed to create schedule: {e}"))?;

    Ok(card_id)
}

fn get_card_info(conn: &Connection, card_id: i64) -> Result<CardInfo, String> {
    conn.query_row(
        "SELECT c.id, c.subject_id, c.chapter_id, c.source_type, c.prompt, c.answer,
                c.card_type, c.status, c.created_at,
                cs.next_review, cs.stability, cs.reps, cs.lapses
         FROM cards c
         LEFT JOIN card_schedule cs ON cs.card_id = c.id
         WHERE c.id = ?1",
        [card_id],
        |row| {
            Ok(CardInfo {
                id: row.get(0)?,
                subject_id: row.get(1)?,
                chapter_id: row.get(2)?,
                source_type: row.get(3)?,
                prompt: row.get(4)?,
                answer: row.get(5)?,
                card_type: row.get(6)?,
                status: row.get(7)?,
                created_at: row.get(8)?,
                next_review: row.get(9)?,
                stability: row.get(10)?,
                reps: row.get(11)?,
                lapses: row.get(12)?,
            })
        },
    )
    .map_err(|e| format!("Card not found: {e}"))
}

pub fn create_card(conn: &Connection, input: &CardCreateInput) -> Result<CardInfo, String> {
    let card_id = insert_card_with_schedule(
        conn,
        input.subject_id,
        input.chapter_id,
        "manual",
        &input.prompt,
        &input.answer,
        &input.card_type,
    )?;

    // If reversed, create the swapped card too
    if input.card_type == "reversed" {
        insert_card_with_schedule(
            conn,
            input.subject_id,
            input.chapter_id,
            "manual",
            &input.answer,
            &input.prompt,
            "reversed",
        )?;
    }

    get_card_info(conn, card_id)
}

pub fn list_cards(
    conn: &Connection,
    subject_id: Option<i64>,
    search: Option<&str>,
) -> Result<Vec<CardInfo>, String> {
    let mut sql = String::from(
        "SELECT c.id, c.subject_id, c.chapter_id, c.source_type, c.prompt, c.answer,
                c.card_type, c.status, c.created_at,
                cs.next_review, cs.stability, cs.reps, cs.lapses
         FROM cards c
         LEFT JOIN card_schedule cs ON cs.card_id = c.id
         WHERE c.status != 'buried'",
    );

    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    let mut param_idx = 1;

    if let Some(sid) = subject_id {
        sql.push_str(&format!(" AND c.subject_id = ?{param_idx}"));
        params.push(Box::new(sid));
        param_idx += 1;
    }

    if let Some(q) = search {
        if !q.is_empty() {
            let like = format!("%{q}%");
            sql.push_str(&format!(
                " AND (c.prompt LIKE ?{param_idx} OR c.answer LIKE ?{})",
                param_idx + 1
            ));
            params.push(Box::new(like.clone()));
            params.push(Box::new(like));
        }
    }

    sql.push_str(" ORDER BY c.created_at DESC LIMIT 100");

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();

    let cards = stmt
        .query_map(param_refs.as_slice(), |row| {
            Ok(CardInfo {
                id: row.get(0)?,
                subject_id: row.get(1)?,
                chapter_id: row.get(2)?,
                source_type: row.get(3)?,
                prompt: row.get(4)?,
                answer: row.get(5)?,
                card_type: row.get(6)?,
                status: row.get(7)?,
                created_at: row.get(8)?,
                next_review: row.get(9)?,
                stability: row.get(10)?,
                reps: row.get(11)?,
                lapses: row.get(12)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(cards)
}

pub fn update_card(
    conn: &Connection,
    card_id: i64,
    prompt: Option<&str>,
    answer: Option<&str>,
    status: Option<&str>,
) -> Result<CardInfo, String> {
    if let Some(p) = prompt {
        conn.execute(
            "UPDATE cards SET prompt = ?2 WHERE id = ?1",
            rusqlite::params![card_id, p],
        )
        .map_err(|e| e.to_string())?;
    }
    if let Some(a) = answer {
        conn.execute(
            "UPDATE cards SET answer = ?2 WHERE id = ?1",
            rusqlite::params![card_id, a],
        )
        .map_err(|e| e.to_string())?;
    }
    if let Some(s) = status {
        conn.execute(
            "UPDATE cards SET status = ?2 WHERE id = ?1",
            rusqlite::params![card_id, s],
        )
        .map_err(|e| e.to_string())?;
    }

    get_card_info(conn, card_id)
}

pub fn delete_card(conn: &Connection, card_id: i64) -> Result<(), String> {
    conn.execute("DELETE FROM card_reviews WHERE card_id = ?1", [card_id])
        .map_err(|e| format!("Failed to delete card reviews: {e}"))?;
    conn.execute("DELETE FROM card_schedule WHERE card_id = ?1", [card_id])
        .map_err(|e| format!("Failed to delete card schedule: {e}"))?;
    conn.execute("DELETE FROM cards WHERE id = ?1", [card_id])
        .map_err(|e| format!("Failed to delete card: {e}"))?;
    Ok(())
}

pub fn get_practice_cards(
    conn: &Connection,
    subject_id: Option<i64>,
    limit: i64,
) -> Result<Vec<crate::services::review::DueCard>, String> {
    let sql = if let Some(sid) = subject_id {
        format!(
            "SELECT c.id, c.subject_id, c.chapter_id, c.source_type, c.prompt, c.answer, c.card_type,
                    cs.stability, cs.difficulty, cs.reps, cs.lapses
             FROM cards c
             JOIN card_schedule cs ON cs.card_id = c.id
             WHERE c.status = 'active' AND c.subject_id = {sid}
             ORDER BY cs.last_reviewed ASC NULLS FIRST
             LIMIT {limit}"
        )
    } else {
        format!(
            "SELECT c.id, c.subject_id, c.chapter_id, c.source_type, c.prompt, c.answer, c.card_type,
                    cs.stability, cs.difficulty, cs.reps, cs.lapses
             FROM cards c
             JOIN card_schedule cs ON cs.card_id = c.id
             WHERE c.status = 'active'
             ORDER BY cs.last_reviewed ASC NULLS FIRST
             LIMIT {limit}"
        )
    };

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;

    let cards = stmt
        .query_map([], |row| {
            Ok(crate::services::review::DueCard {
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
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(cards)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;

    fn setup_db() -> Database {
        let db = Database::open_memory().expect("open");
        db.with_conn(|conn| {
            conn.execute(
                "INSERT INTO subjects (slug, name, created_at) VALUES ('test', 'Test', datetime('now'))",
                [],
            ).unwrap();
            Ok(())
        });
        db
    }

    #[test]
    fn test_create_basic_card() {
        let db = setup_db();
        db.with_conn(|conn| {
            let input = CardCreateInput {
                subject_id: 1,
                chapter_id: None,
                prompt: "What is X?".to_string(),
                answer: "X is Y.".to_string(),
                card_type: "basic".to_string(),
            };
            let card = create_card(conn, &input).unwrap();
            assert_eq!(card.prompt, "What is X?");
            assert_eq!(card.card_type, "basic");
            assert_eq!(card.source_type, "manual");
            assert!(card.next_review.is_some());
            Ok(())
        });
    }

    #[test]
    fn test_create_reversed_creates_two_cards() {
        let db = setup_db();
        db.with_conn(|conn| {
            let input = CardCreateInput {
                subject_id: 1,
                chapter_id: None,
                prompt: "Front".to_string(),
                answer: "Back".to_string(),
                card_type: "reversed".to_string(),
            };
            create_card(conn, &input).unwrap();

            let count: i64 = conn.query_row("SELECT COUNT(*) FROM cards", [], |r| r.get(0)).unwrap();
            assert_eq!(count, 2);

            // Second card has swapped prompt/answer
            let reversed: String = conn.query_row(
                "SELECT prompt FROM cards WHERE id = 2", [], |r| r.get(0)
            ).unwrap();
            assert_eq!(reversed, "Back");
            Ok(())
        });
    }

    #[test]
    fn test_create_cloze_card() {
        let db = setup_db();
        db.with_conn(|conn| {
            let input = CardCreateInput {
                subject_id: 1,
                chapter_id: None,
                prompt: "The {{mitochondria}} is the powerhouse".to_string(),
                answer: "Energy production organelle".to_string(),
                card_type: "cloze".to_string(),
            };
            let card = create_card(conn, &input).unwrap();
            assert_eq!(card.card_type, "cloze");
            assert!(card.prompt.contains("{{mitochondria}}"));
            Ok(())
        });
    }

    #[test]
    fn test_list_cards_filters_by_subject() {
        let db = setup_db();
        db.with_conn(|conn| {
            conn.execute(
                "INSERT INTO subjects (slug, name, created_at) VALUES ('other', 'Other', datetime('now'))",
                [],
            ).unwrap();

            let input1 = CardCreateInput {
                subject_id: 1, chapter_id: None,
                prompt: "A".to_string(), answer: "B".to_string(), card_type: "basic".to_string(),
            };
            let input2 = CardCreateInput {
                subject_id: 2, chapter_id: None,
                prompt: "C".to_string(), answer: "D".to_string(), card_type: "basic".to_string(),
            };
            create_card(conn, &input1).unwrap();
            create_card(conn, &input2).unwrap();

            let all = list_cards(conn, None, None).unwrap();
            assert_eq!(all.len(), 2);

            let filtered = list_cards(conn, Some(1), None).unwrap();
            assert_eq!(filtered.len(), 1);
            assert_eq!(filtered[0].prompt, "A");
            Ok(())
        });
    }

    #[test]
    fn test_list_cards_search() {
        let db = setup_db();
        db.with_conn(|conn| {
            let input = CardCreateInput {
                subject_id: 1, chapter_id: None,
                prompt: "What is photosynthesis?".to_string(),
                answer: "Plants convert light".to_string(),
                card_type: "basic".to_string(),
            };
            create_card(conn, &input).unwrap();

            let results = list_cards(conn, None, Some("photo")).unwrap();
            assert_eq!(results.len(), 1);

            let empty = list_cards(conn, None, Some("quantum")).unwrap();
            assert_eq!(empty.len(), 0);
            Ok(())
        });
    }

    #[test]
    fn test_update_card_prompt() {
        let db = setup_db();
        db.with_conn(|conn| {
            let input = CardCreateInput {
                subject_id: 1, chapter_id: None,
                prompt: "Old".to_string(), answer: "Answer".to_string(), card_type: "basic".to_string(),
            };
            let card = create_card(conn, &input).unwrap();

            let updated = update_card(conn, card.id, Some("New"), None, None).unwrap();
            assert_eq!(updated.prompt, "New");
            assert_eq!(updated.answer, "Answer");
            Ok(())
        });
    }

    #[test]
    fn test_update_card_status_suspend() {
        let db = setup_db();
        db.with_conn(|conn| {
            let input = CardCreateInput {
                subject_id: 1, chapter_id: None,
                prompt: "Q".to_string(), answer: "A".to_string(), card_type: "basic".to_string(),
            };
            let card = create_card(conn, &input).unwrap();

            let updated = update_card(conn, card.id, None, None, Some("suspended")).unwrap();
            assert_eq!(updated.status, "suspended");
            Ok(())
        });
    }

    #[test]
    fn test_practice_returns_all_active() {
        let db = setup_db();
        db.with_conn(|conn| {
            // Create 2 cards — both with future next_review (not due)
            for i in 0..2 {
                let input = CardCreateInput {
                    subject_id: 1, chapter_id: None,
                    prompt: format!("Q{i}"), answer: format!("A{i}"), card_type: "basic".to_string(),
                };
                create_card(conn, &input).unwrap();
                conn.execute(
                    &format!("UPDATE card_schedule SET next_review = datetime('now', '+7 days') WHERE card_id = {}", i + 1),
                    [],
                ).unwrap();
            }

            // get_due_cards would return 0 (not due), but practice returns all
            let practice = get_practice_cards(conn, None, 50).unwrap();
            assert_eq!(practice.len(), 2);
            Ok(())
        });
    }
}
