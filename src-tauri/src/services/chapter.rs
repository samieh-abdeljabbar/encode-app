use rusqlite::Connection;
use crate::services::chunker;

pub fn update_content(conn: &Connection, chapter_id: i64, markdown: &str) -> Result<(), String> {
    // Delete existing sections
    conn.execute(
        "DELETE FROM chapter_sections WHERE chapter_id = ?1",
        [chapter_id],
    ).map_err(|e| format!("Failed to delete sections: {e}"))?;

    // Re-chunk the markdown
    let sections = chunker::split_into_sections(markdown);

    // Insert new sections
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
        ).map_err(|e| format!("Failed to insert section: {e}"))?;
    }

    // Update chapter estimated_minutes and updated_at
    let total_words: i32 = sections.iter().map(|s| s.word_count).sum();
    let estimated_minutes = (total_words as f64 / 200.0).ceil() as i64;

    conn.execute(
        "UPDATE chapters SET estimated_minutes = ?2, updated_at = datetime('now') WHERE id = ?1",
        rusqlite::params![chapter_id, estimated_minutes],
    ).map_err(|e| format!("Failed to update chapter: {e}"))?;

    Ok(())
}

pub fn move_chapter(conn: &Connection, chapter_id: i64, new_subject_id: i64) -> Result<(), String> {
    conn.execute(
        "UPDATE chapters SET subject_id = ?2, updated_at = datetime('now') WHERE id = ?1",
        rusqlite::params![chapter_id, new_subject_id],
    ).map_err(|e| format!("Failed to move chapter: {e}"))?;

    // Also update any cards that belong to this chapter
    conn.execute(
        "UPDATE cards SET subject_id = ?2 WHERE chapter_id = ?1",
        rusqlite::params![chapter_id, new_subject_id],
    ).map_err(|e| format!("Failed to update card subjects: {e}"))?;

    Ok(())
}

pub fn save_image(vault_path: &std::path::Path, data: &[u8], extension: &str) -> Result<String, String> {
    let uuid = format!("{:x}", std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos());
    let relative_path = format!("images/{uuid}.{extension}");
    let full_path = vault_path.join(&relative_path);

    // Create images directory if needed
    if let Some(parent) = full_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create images dir: {e}"))?;
    }

    std::fs::write(&full_path, data)
        .map_err(|e| format!("Failed to save image: {e}"))?;

    Ok(relative_path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;

    fn setup_db() -> Database {
        let db = Database::open_memory().expect("open");
        let _ = db.with_conn(|conn| {
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
        });
        db
    }

    #[test]
    fn test_update_content_replaces_sections() {
        let db = setup_db();
        let _ = db.with_conn(|conn| {
            let markdown = "## New Section 1\n\nNew content here.\n\n## New Section 2\n\nMore content.";
            update_content(conn, 1, markdown).unwrap();

            let count: i64 = conn.query_row(
                "SELECT COUNT(*) FROM chapter_sections WHERE chapter_id = 1",
                [], |r| r.get(0),
            ).unwrap();
            assert_eq!(count, 2);
            Ok(())
        });
    }

    #[test]
    fn test_update_content_resets_status_to_unseen() {
        let db = setup_db();
        let _ = db.with_conn(|conn| {
            let markdown = "## Fresh\n\nNew stuff.";
            update_content(conn, 1, markdown).unwrap();

            let status: String = conn.query_row(
                "SELECT status FROM chapter_sections WHERE chapter_id = 1 AND section_index = 0",
                [], |r| r.get(0),
            ).unwrap();
            assert_eq!(status, "unseen");
            Ok(())
        });
    }

    #[test]
    fn test_update_content_recalculates_minutes() {
        let db = setup_db();
        let _ = db.with_conn(|conn| {
            // ~200 words = ~1 minute
            let words: Vec<String> = (0..200).map(|i| format!("word{i}")).collect();
            let markdown = format!("## Section\n\n{}", words.join(" "));
            update_content(conn, 1, &markdown).unwrap();

            let minutes: i64 = conn.query_row(
                "SELECT estimated_minutes FROM chapters WHERE id = 1",
                [], |r| r.get(0),
            ).unwrap();
            assert_eq!(minutes, 1);
            Ok(())
        });
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

            move_chapter(conn, 1, 2).unwrap();

            let subject_id: i64 = conn.query_row(
                "SELECT subject_id FROM chapters WHERE id = 1",
                [],
                |r| r.get(0),
            ).unwrap();
            assert_eq!(subject_id, 2);
            Ok(())
        }).expect("test failed");
    }
}
