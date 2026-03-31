use rusqlite::Connection;
use serde::Serialize;

#[derive(Serialize, Clone)]
pub struct QueueItem {
    pub item_type: String,
    pub score: i32,
    pub title: String,
    pub subtitle: String,
    pub reason: String,
    pub estimated_minutes: i32,
    pub target_id: i64,
    pub target_route: String,
}

#[derive(Serialize)]
pub struct QueueSummary {
    pub due_cards: i64,
    pub chapters_in_progress: i64,
    pub sections_studied_today: i64,
    pub chapters_completed: i64,
    pub total_cards: i64,
    pub quizzes_passed: i64,
}

#[derive(Serialize)]
pub struct QueueDashboard {
    pub summary: QueueSummary,
    pub items: Vec<QueueItem>,
}

fn get_summary(conn: &Connection) -> Result<QueueSummary, String> {
    let due_cards: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM card_schedule WHERE next_review <= datetime('now')",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let chapters_in_progress: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM chapters WHERE status IN ('reading', 'awaiting_synthesis')",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let sections_studied_today: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM study_events WHERE event_type = 'section_check_submitted' AND created_at >= date('now')",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let chapters_completed: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM chapters WHERE status IN ('mastering', 'stable')",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let total_cards: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM cards WHERE status = 'active'",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let quizzes_passed: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM quizzes WHERE score >= 0.8",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    Ok(QueueSummary {
        due_cards,
        chapters_in_progress,
        sections_studied_today,
        chapters_completed,
        total_cards,
        quizzes_passed,
    })
}

fn get_due_card_items(conn: &Connection) -> Result<Vec<QueueItem>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT c.id, c.prompt, c.source_type, s.name,
                    cs.stability, cs.next_review,
                    CAST((julianday('now') - julianday(cs.next_review)) AS INTEGER) as overdue_days
             FROM cards c
             JOIN card_schedule cs ON cs.card_id = c.id
             JOIN subjects s ON s.id = c.subject_id
             WHERE c.status = 'active' AND cs.next_review <= datetime('now')
             ORDER BY cs.next_review ASC
             LIMIT 20",
        )
        .map_err(|e| e.to_string())?;

    let items = stmt
        .query_map([], |row| {
            let id: i64 = row.get(0)?;
            let prompt: String = row.get(1)?;
            let source_type: String = row.get(2)?;
            let subject_name: String = row.get(3)?;
            let stability: f64 = row.get(4)?;
            let overdue_days: i64 = row.get(6)?;

            let item_type = if source_type == "repair" {
                "repair_card"
            } else {
                "due_card"
            };

            let base = if item_type == "repair_card" { 75 } else { 60 };
            let overdue_boost = if overdue_days > 1 { 25.min(overdue_days as i32 * 5) } else { 0 };
            let stability_boost = if stability < 3.0 { 10 } else { 0 };
            let score = (base + overdue_boost + stability_boost).min(100);

            let reason = if overdue_days > 0 {
                format!("Overdue by {} day{}", overdue_days, if overdue_days == 1 { "" } else { "s" })
            } else {
                "Due now".to_string()
            };

            Ok(QueueItem {
                item_type: item_type.to_string(),
                score,
                title: prompt,
                subtitle: subject_name,
                reason,
                estimated_minutes: 1,
                target_id: id,
                target_route: "/review".to_string(),
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(items)
}

fn get_chapter_items(conn: &Connection) -> Result<Vec<QueueItem>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT ch.id, ch.title, ch.status, ch.estimated_minutes, s.name
             FROM chapters ch
             JOIN subjects s ON s.id = ch.subject_id
             WHERE ch.status IN ('new', 'reading', 'awaiting_synthesis')
             ORDER BY ch.updated_at DESC
             LIMIT 20",
        )
        .map_err(|e| e.to_string())?;

    let items = stmt
        .query_map([], |row| {
            let id: i64 = row.get(0)?;
            let title: String = row.get(1)?;
            let status: String = row.get(2)?;
            let est_min: Option<i64> = row.get(3)?;
            let subject_name: String = row.get(4)?;

            let (item_type, score, reason, route) = match status.as_str() {
                "reading" => (
                    "continue_reading",
                    55, // base 40 + 15 momentum (simplified: assume recent)
                    "In progress".to_string(),
                    format!("/reader?chapter={id}"),
                ),
                "awaiting_synthesis" => (
                    "synthesis_required",
                    50,
                    "All sections done — synthesis needed".to_string(),
                    format!("/reader?chapter={id}"),
                ),
                _ => (
                    "new_chapter",
                    20,
                    "Not started".to_string(),
                    format!("/chapter?id={id}"),
                ),
            };

            Ok(QueueItem {
                item_type: item_type.to_string(),
                score,
                title,
                subtitle: subject_name,
                reason,
                estimated_minutes: est_min.unwrap_or(5) as i32,
                target_id: id,
                target_route: route,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(items)
}

fn get_quiz_items(conn: &Connection) -> Result<Vec<QueueItem>, String> {
    let mut items = Vec::new();

    // Chapters at ready_for_quiz without a passing quiz
    let mut stmt = conn
        .prepare(
            "SELECT ch.id, ch.title, s.name
             FROM chapters ch
             JOIN subjects s ON s.id = ch.subject_id
             WHERE ch.status = 'ready_for_quiz'
               AND NOT EXISTS (
                   SELECT 1 FROM quizzes q
                   WHERE q.chapter_id = ch.id AND q.score >= 0.8
               )
             ORDER BY ch.updated_at DESC
             LIMIT 10",
        )
        .map_err(|e| e.to_string())?;

    let available = stmt
        .query_map([], |row| {
            let id: i64 = row.get(0)?;
            let title: String = row.get(1)?;
            let subject_name: String = row.get(2)?;
            Ok(QueueItem {
                item_type: "quiz_available".to_string(),
                score: 45,
                title,
                subtitle: subject_name,
                reason: "Ready for quiz".to_string(),
                estimated_minutes: 5,
                target_id: id,
                target_route: format!("/quiz?chapter={id}"),
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    items.extend(available);

    // Failed quizzes past 48-hour cooldown
    let mut retake_stmt = conn
        .prepare(
            "SELECT ch.id, ch.title, s.name
             FROM chapters ch
             JOIN subjects s ON s.id = ch.subject_id
             WHERE ch.status = 'ready_for_quiz'
               AND EXISTS (
                   SELECT 1 FROM quizzes q
                   WHERE q.chapter_id = ch.id
                     AND q.score IS NOT NULL
                     AND q.score < 0.8
                     AND datetime(q.generated_at, '+2 days') <= datetime('now')
               )
               AND NOT EXISTS (
                   SELECT 1 FROM quizzes q
                   WHERE q.chapter_id = ch.id AND q.score >= 0.8
               )
             ORDER BY ch.updated_at DESC
             LIMIT 10",
        )
        .map_err(|e| e.to_string())?;

    let retakes = retake_stmt
        .query_map([], |row| {
            let id: i64 = row.get(0)?;
            let title: String = row.get(1)?;
            let subject_name: String = row.get(2)?;
            Ok(QueueItem {
                item_type: "quiz_retake".to_string(),
                score: 60, // 45 base + 15 cooldown elapsed
                title,
                subtitle: subject_name,
                reason: "Cooldown elapsed — retake available".to_string(),
                estimated_minutes: 5,
                target_id: id,
                target_route: format!("/quiz?chapter={id}"),
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    items.extend(retakes);

    Ok(items)
}

pub fn get_dashboard(conn: &Connection) -> Result<QueueDashboard, String> {
    let summary = get_summary(conn)?;

    let mut items = Vec::new();
    items.extend(get_due_card_items(conn)?);
    items.extend(get_chapter_items(conn)?);
    items.extend(get_quiz_items(conn)?);

    // Sort by score descending, then by estimated_minutes ascending (tie-breaker)
    items.sort_by(|a, b| {
        b.score.cmp(&a.score).then(a.estimated_minutes.cmp(&b.estimated_minutes))
    });

    items.truncate(20);

    Ok(QueueDashboard { summary, items })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;

    fn setup_test_db() -> Database {
        let db = Database::open_memory().expect("Failed to open test DB");
        db.with_conn(|conn| {
            conn.execute(
                "INSERT INTO subjects (slug, name, created_at) VALUES ('physics', 'Physics', datetime('now'))",
                [],
            ).unwrap();
            Ok(())
        }).expect("Failed to insert test subject");
        db
    }

    #[test]
    fn test_empty_dashboard() {
        let db = setup_test_db();
        db.with_conn(|conn| {
            let dash = get_dashboard(conn).unwrap();
            assert_eq!(dash.summary.due_cards, 0);
            assert_eq!(dash.summary.chapters_in_progress, 0);
            assert_eq!(dash.items.len(), 0);
            Ok(())
        }).expect("test_empty_dashboard failed");
    }

    #[test]
    fn test_new_chapter_appears_in_queue() {
        let db = setup_test_db();
        db.with_conn(|conn| {
            conn.execute(
                "INSERT INTO chapters (subject_id, title, slug, status, estimated_minutes, created_at, updated_at)
                 VALUES (1, 'Intro to Physics', 'intro', 'new', 10, datetime('now'), datetime('now'))",
                [],
            ).unwrap();
            let dash = get_dashboard(conn).unwrap();
            assert_eq!(dash.items.len(), 1);
            assert_eq!(dash.items[0].item_type, "new_chapter");
            assert_eq!(dash.items[0].score, 20);
            Ok(())
        }).expect("test_new_chapter_appears_in_queue failed");
    }

    #[test]
    fn test_reading_chapter_scores_higher_than_new() {
        let db = setup_test_db();
        db.with_conn(|conn| {
            conn.execute(
                "INSERT INTO chapters (subject_id, title, slug, status, estimated_minutes, created_at, updated_at)
                 VALUES (1, 'New Chapter', 'new-ch', 'new', 10, datetime('now'), datetime('now'))",
                [],
            ).unwrap();
            conn.execute(
                "INSERT INTO chapters (subject_id, title, slug, status, estimated_minutes, created_at, updated_at)
                 VALUES (1, 'Reading Chapter', 'reading-ch', 'reading', 10, datetime('now'), datetime('now'))",
                [],
            ).unwrap();
            let dash = get_dashboard(conn).unwrap();
            assert!(dash.items[0].score > dash.items[1].score);
            assert_eq!(dash.items[0].item_type, "continue_reading");
            Ok(())
        }).expect("test_reading_chapter_scores_higher_than_new failed");
    }

    #[test]
    fn test_due_card_appears_in_queue() {
        let db = setup_test_db();
        db.with_conn(|conn| {
            conn.execute(
                "INSERT INTO cards (subject_id, source_type, prompt, answer, card_type, status, created_at)
                 VALUES (1, 'manual', 'What is force?', 'F=ma', 'basic', 'active', datetime('now'))",
                [],
            ).unwrap();
            conn.execute(
                "INSERT INTO card_schedule (card_id, next_review, stability, difficulty, reps, lapses)
                 VALUES (1, datetime('now', '-1 hour'), 2.0, 5.0, 1, 0)",
                [],
            ).unwrap();
            let dash = get_dashboard(conn).unwrap();
            assert_eq!(dash.summary.due_cards, 1);
            let card_items: Vec<_> = dash.items.iter().filter(|i| i.item_type == "due_card").collect();
            assert_eq!(card_items.len(), 1);
            Ok(())
        }).expect("test_due_card_appears_in_queue failed");
    }

    #[test]
    fn test_repair_card_scores_higher_than_due_card() {
        let db = setup_test_db();
        db.with_conn(|conn| {
            // Regular card
            conn.execute(
                "INSERT INTO cards (subject_id, source_type, prompt, answer, card_type, status, created_at)
                 VALUES (1, 'manual', 'Regular card', 'Answer', 'basic', 'active', datetime('now'))",
                [],
            ).unwrap();
            conn.execute(
                "INSERT INTO card_schedule (card_id, next_review, stability, difficulty, reps, lapses)
                 VALUES (1, datetime('now', '-1 hour'), 5.0, 5.0, 1, 0)",
                [],
            ).unwrap();
            // Repair card
            conn.execute(
                "INSERT INTO cards (subject_id, source_type, prompt, answer, card_type, status, created_at)
                 VALUES (1, 'repair', 'Repair card', 'Answer', 'basic', 'active', datetime('now'))",
                [],
            ).unwrap();
            conn.execute(
                "INSERT INTO card_schedule (card_id, next_review, stability, difficulty, reps, lapses)
                 VALUES (2, datetime('now', '-1 hour'), 5.0, 5.0, 1, 0)",
                [],
            ).unwrap();
            let dash = get_dashboard(conn).unwrap();
            let repair = dash.items.iter().find(|i| i.item_type == "repair_card").unwrap();
            let due = dash.items.iter().find(|i| i.item_type == "due_card").unwrap();
            assert!(repair.score > due.score);
            Ok(())
        }).expect("test_repair_card_scores_higher_than_due_card failed");
    }

    #[test]
    fn test_summary_counts_sections_studied_today() {
        let db = setup_test_db();
        db.with_conn(|conn| {
            conn.execute(
                "INSERT INTO study_events (subject_id, event_type, created_at)
                 VALUES (1, 'section_check_submitted', datetime('now'))",
                [],
            ).unwrap();
            conn.execute(
                "INSERT INTO study_events (subject_id, event_type, created_at)
                 VALUES (1, 'section_check_submitted', datetime('now'))",
                [],
            ).unwrap();
            let dash = get_dashboard(conn).unwrap();
            assert_eq!(dash.summary.sections_studied_today, 2);
            Ok(())
        }).expect("test_summary_counts_sections_studied_today failed");
    }

    #[test]
    fn test_items_sorted_by_score_descending() {
        let db = setup_test_db();
        db.with_conn(|conn| {
            conn.execute(
                "INSERT INTO chapters (subject_id, title, slug, status, estimated_minutes, created_at, updated_at)
                 VALUES (1, 'New', 'new', 'new', 10, datetime('now'), datetime('now'))",
                [],
            ).unwrap();
            conn.execute(
                "INSERT INTO chapters (subject_id, title, slug, status, estimated_minutes, created_at, updated_at)
                 VALUES (1, 'Reading', 'reading', 'reading', 10, datetime('now'), datetime('now'))",
                [],
            ).unwrap();
            conn.execute(
                "INSERT INTO chapters (subject_id, title, slug, status, estimated_minutes, created_at, updated_at)
                 VALUES (1, 'Synthesis', 'synthesis', 'awaiting_synthesis', 10, datetime('now'), datetime('now'))",
                [],
            ).unwrap();
            let dash = get_dashboard(conn).unwrap();
            for i in 1..dash.items.len() {
                assert!(dash.items[i - 1].score >= dash.items[i].score);
            }
            Ok(())
        }).expect("test_items_sorted_by_score_descending failed");
    }
}
