use crate::services::chunker;
use rusqlite::Connection;
use std::path::Path;

const WORDS_PER_MINUTE: f64 = 200.0;

fn run_in_transaction<T>(
    conn: &Connection,
    f: impl FnOnce() -> Result<T, String>,
) -> Result<T, String> {
    conn.execute_batch("BEGIN IMMEDIATE;")
        .map_err(|e| format!("Failed to begin transaction: {e}"))?;

    match f() {
        Ok(result) => {
            conn.execute_batch("COMMIT;")
                .map_err(|e| format!("Failed to commit transaction: {e}"))?;
            Ok(result)
        }
        Err(err) => {
            let _ = conn.execute_batch("ROLLBACK;");
            Err(err)
        }
    }
}

pub fn update_content(conn: &Connection, chapter_id: i64, markdown: &str) -> Result<(), String> {
    let sections = chunker::split_into_sections(markdown);
    let total_words: i32 = sections.iter().map(|s| s.word_count).sum();
    let estimated_minutes = (total_words as f64 / WORDS_PER_MINUTE).ceil() as i64;

    run_in_transaction(conn, || {
        conn.execute(
            "DELETE FROM chapter_sections WHERE chapter_id = ?1",
            [chapter_id],
        )
        .map_err(|e| format!("Failed to delete sections: {e}"))?;

        for section in &sections {
            conn.execute(
                "INSERT INTO chapter_sections (chapter_id, section_index, heading, body_markdown, word_count, status)
                 VALUES (?1, ?2, ?3, ?4, ?5, 'unseen')",
                rusqlite::params![
                    chapter_id,
                    section.section_index,
                    section.heading,
                    section.body_markdown,
                    section.word_count,
                ],
            )
            .map_err(|e| format!("Failed to insert section: {e}"))?;
        }

        conn.execute(
            "UPDATE chapters
             SET raw_markdown = ?2, estimated_minutes = ?3, updated_at = datetime('now')
             WHERE id = ?1",
            rusqlite::params![chapter_id, markdown, estimated_minutes],
        )
        .map_err(|e| format!("Failed to update chapter: {e}"))?;

        Ok(())
    })
}

pub fn move_chapter(conn: &Connection, chapter_id: i64, new_subject_id: i64) -> Result<(), String> {
    run_in_transaction(conn, || {
        conn.execute(
            "UPDATE chapters SET subject_id = ?2, updated_at = datetime('now') WHERE id = ?1",
            rusqlite::params![chapter_id, new_subject_id],
        )
        .map_err(|e| format!("Failed to move chapter: {e}"))?;

        conn.execute(
            "UPDATE cards SET subject_id = ?2 WHERE chapter_id = ?1",
            rusqlite::params![chapter_id, new_subject_id],
        )
        .map_err(|e| format!("Failed to update card subjects: {e}"))?;

        conn.execute(
            "UPDATE quizzes SET subject_id = ?2 WHERE chapter_id = ?1",
            rusqlite::params![chapter_id, new_subject_id],
        )
        .map_err(|e| format!("Failed to update quiz subjects: {e}"))?;

        conn.execute(
            "UPDATE teachbacks SET subject_id = ?2 WHERE chapter_id = ?1",
            rusqlite::params![chapter_id, new_subject_id],
        )
        .map_err(|e| format!("Failed to update teachback subjects: {e}"))?;

        conn.execute(
            "UPDATE study_events SET subject_id = ?2 WHERE chapter_id = ?1",
            rusqlite::params![chapter_id, new_subject_id],
        )
        .map_err(|e| format!("Failed to update study event subjects: {e}"))?;

        Ok(())
    })
}

pub fn save_image(vault_path: &Path, data: &[u8], extension: &str) -> Result<String, String> {
    let extension = extension.trim().to_ascii_lowercase();
    if extension.is_empty() || !extension.chars().all(|c| c.is_ascii_alphanumeric()) {
        return Err("Invalid image extension".to_string());
    }

    let uuid = format!(
        "{:x}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    );
    let relative_path = format!("images/{uuid}.{extension}");
    let full_path = vault_path.join(&relative_path);

    // Create images directory if needed
    if let Some(parent) = full_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Failed to create images dir: {e}"))?;
    }

    std::fs::write(&full_path, data).map_err(|e| format!("Failed to save image: {e}"))?;

    Ok(relative_path)
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
            conn.execute(
                "INSERT INTO chapters (subject_id, title, slug, status, created_at, updated_at)
                 VALUES (1, 'Test Chapter', 'test', 'new', datetime('now'), datetime('now'))",
                [],
            ).unwrap();
            // Insert initial sections
            conn.execute(
                "INSERT INTO chapter_sections (chapter_id, section_index, heading, body_markdown, word_count, status)
                 VALUES (1, 0, 'Old Section', 'Old content.', 2, 'checked_correct')",
                [],
            ).unwrap();
            Ok(())
        }).expect("test");
        db
    }

    #[test]
    fn test_update_content_replaces_sections() {
        let db = setup_db();
        db.with_conn(|conn| {
            let markdown =
                "## New Section 1\n\nNew content here.\n\n## New Section 2\n\nMore content.";
            update_content(conn, 1, markdown).unwrap();

            let count: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM chapter_sections WHERE chapter_id = 1",
                    [],
                    |r| r.get(0),
                )
                .unwrap();
            assert_eq!(count, 2);
            Ok(())
        })
        .expect("test");
    }

    #[test]
    fn test_update_content_resets_status_to_unseen() {
        let db = setup_db();
        db.with_conn(|conn| {
            let markdown = "## Fresh\n\nNew stuff.";
            update_content(conn, 1, markdown).unwrap();

            let status: String = conn.query_row(
                "SELECT status FROM chapter_sections WHERE chapter_id = 1 AND section_index = 0",
                [], |r| r.get(0),
            ).unwrap();
            assert_eq!(status, "unseen");
            Ok(())
        })
        .expect("test");
    }

    #[test]
    fn test_update_content_recalculates_minutes() {
        let db = setup_db();
        db.with_conn(|conn| {
            // ~200 words = ~1 minute
            let words: Vec<String> = (0..200).map(|i| format!("word{i}")).collect();
            let markdown = format!("## Section\n\n{}", words.join(" "));
            update_content(conn, 1, &markdown).unwrap();

            let minutes: i64 = conn
                .query_row(
                    "SELECT estimated_minutes FROM chapters WHERE id = 1",
                    [],
                    |r| r.get(0),
                )
                .unwrap();
            assert_eq!(minutes, 1);
            let raw_markdown: String = conn
                .query_row("SELECT raw_markdown FROM chapters WHERE id = 1", [], |r| {
                    r.get(0)
                })
                .unwrap();
            assert_eq!(raw_markdown, markdown);
            Ok(())
        })
        .expect("test");
    }

    #[test]
    fn test_save_image() {
        let dir = std::env::temp_dir().join("encode_test_images");
        let _ = std::fs::remove_dir_all(&dir);
        let data = b"fake png data";
        let result = save_image(&dir, data, "png").unwrap();
        assert!(result.starts_with("images/"));
        assert!(result.ends_with(".png"));
        assert!(dir.join(&result).exists());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_move_chapter_updates_subject() {
        let db = Database::open_memory().expect("open");
        db.with_conn(|conn| {
            conn.execute(
                "INSERT INTO subjects (slug, name, created_at) VALUES ('a', 'Subject A', datetime('now'))",
                [],
            ).unwrap();
            conn.execute(
                "INSERT INTO subjects (slug, name, created_at) VALUES ('b', 'Subject B', datetime('now'))",
                [],
            ).unwrap();
            conn.execute(
                "INSERT INTO chapters (subject_id, title, slug, status, estimated_minutes, created_at, updated_at)
                 VALUES (1, 'Ch1', 'ch1', 'new', 5, datetime('now'), datetime('now'))",
                [],
            ).unwrap();
            conn.execute(
                "INSERT INTO cards (subject_id, chapter_id, source_type, prompt, answer, card_type, status, created_at)
                 VALUES (1, 1, 'manual', 'Q', 'A', 'basic', 'active', datetime('now'))",
                [],
            ).unwrap();
            conn.execute(
                "INSERT INTO quizzes (subject_id, chapter_id, scope_type, generated_at)
                 VALUES (1, 1, 'chapter', datetime('now'))",
                [],
            ).unwrap();
            conn.execute(
                "INSERT INTO teachbacks (subject_id, chapter_id, prompt, created_at)
                 VALUES (1, 1, 'Explain', datetime('now'))",
                [],
            ).unwrap();
            conn.execute(
                "INSERT INTO study_events (subject_id, chapter_id, event_type, created_at)
                 VALUES (1, 1, 'section_check_submitted', datetime('now'))",
                [],
            ).unwrap();

            move_chapter(conn, 1, 2).unwrap();

            let subject_id: i64 = conn.query_row(
                "SELECT subject_id FROM chapters WHERE id = 1",
                [],
                |r| r.get(0),
            ).unwrap();
            assert_eq!(subject_id, 2);
            let card_subject: i64 = conn.query_row(
                "SELECT subject_id FROM cards WHERE chapter_id = 1",
                [],
                |r| r.get(0),
            ).unwrap();
            assert_eq!(card_subject, 2);
            let quiz_subject: i64 = conn.query_row(
                "SELECT subject_id FROM quizzes WHERE chapter_id = 1",
                [],
                |r| r.get(0),
            ).unwrap();
            assert_eq!(quiz_subject, 2);
            let teachback_subject: i64 = conn.query_row(
                "SELECT subject_id FROM teachbacks WHERE chapter_id = 1",
                [],
                |r| r.get(0),
            ).unwrap();
            assert_eq!(teachback_subject, 2);
            let event_subject: i64 = conn.query_row(
                "SELECT subject_id FROM study_events WHERE chapter_id = 1",
                [],
                |r| r.get(0),
            ).unwrap();
            assert_eq!(event_subject, 2);
            Ok(())
        }).expect("test failed");
    }

    #[test]
    fn test_save_image_rejects_invalid_extension() {
        let dir = std::env::temp_dir().join("encode_test_images_invalid");
        let _ = std::fs::remove_dir_all(&dir);
        let err = save_image(&dir, b"data", "../png").unwrap_err();
        assert!(err.contains("Invalid image extension"));
    }
}
