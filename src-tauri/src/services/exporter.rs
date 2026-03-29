//! Deterministic subject export — writes markdown bundles from SQLite data.

use rusqlite::Connection;
use std::path::Path;

/// Export a single subject as a markdown bundle.
pub fn export_subject(conn: &Connection, subject_id: i64, output_dir: &Path) -> Result<(), String> {
    let (slug, name, description): (String, String, String) = conn
        .query_row(
            "SELECT slug, name, COALESCE(description, '') FROM subjects WHERE id = ?1",
            rusqlite::params![subject_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|e| format!("Subject not found: {e}"))?;

    let subject_dir = output_dir.join(&slug);
    let chapters_dir = subject_dir.join("chapters");

    std::fs::create_dir_all(&chapters_dir)
        .map_err(|e| format!("Failed to create export directory: {e}"))?;

    // Write _subject.md
    let subject_md = format!(
        "---\nsubject: {name}\nslug: {slug}\ntype: subject\n---\n\n{description}\n"
    );
    atomic_write(&subject_dir.join("_subject.md"), &subject_md)?;

    // Create placeholder directories for future artifact types
    for dir in &["flashcards", "quizzes", "teach-backs"] {
        std::fs::create_dir_all(subject_dir.join(dir))
            .map_err(|e| format!("Failed to create {dir} directory: {e}"))?;
    }

    // Export chapters in creation order
    let mut chapter_stmt = conn
        .prepare(
            "SELECT id, title, slug, status, estimated_minutes, created_at
             FROM chapters WHERE subject_id = ?1 ORDER BY created_at",
        )
        .map_err(|e| format!("Failed to query chapters: {e}"))?;

    let chapters: Vec<(i64, String, String, String, Option<i64>, String)> = chapter_stmt
        .query_map(rusqlite::params![subject_id], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
                row.get(5)?,
            ))
        })
        .map_err(|e| format!("Failed to map chapters: {e}"))?
        .filter_map(|r| r.ok())
        .collect();

    let mut section_stmt = conn
        .prepare(
            "SELECT heading, body_markdown FROM chapter_sections
             WHERE chapter_id = ?1 ORDER BY section_index",
        )
        .map_err(|e| format!("Failed to prepare section query: {e}"))?;

    for (chapter_id, title, chapter_slug, status, est_min, created_at) in &chapters {
        let sections: Vec<(Option<String>, String)> = section_stmt
            .query_map(rusqlite::params![chapter_id], |row| {
                Ok((row.get(0)?, row.get(1)?))
            })
            .map_err(|e| format!("Failed to map sections: {e}"))?
            .filter_map(|r| r.ok())
            .collect();

        let mut content = format!(
            "---\nsubject: {name}\ntopic: {title}\ntype: chapter\nstatus: {status}\ncreated_at: {created_at}\n"
        );
        if let Some(mins) = est_min {
            content.push_str(&format!("estimated_minutes: {mins}\n"));
        }
        content.push_str("---\n\n");

        for (heading, body) in &sections {
            if let Some(h) = heading {
                content.push_str(&format!("## {h}\n\n"));
            }
            content.push_str(body);
            content.push_str("\n\n");
        }

        atomic_write(
            &chapters_dir.join(format!("{chapter_slug}.md")),
            content.trim_end(),
        )?;
    }

    Ok(())
}

/// Export all non-archived subjects.
pub fn export_all(conn: &Connection, output_dir: &Path) -> Result<u32, String> {
    let mut stmt = conn
        .prepare("SELECT id FROM subjects WHERE archived_at IS NULL ORDER BY name")
        .map_err(|e| format!("Failed to query subjects: {e}"))?;

    let ids: Vec<i64> = stmt
        .query_map([], |row| row.get(0))
        .map_err(|e| format!("Failed to map subject ids: {e}"))?
        .filter_map(|r| r.ok())
        .collect();

    let count = ids.len() as u32;
    for id in ids {
        export_subject(conn, id, output_dir)?;
    }
    Ok(count)
}

fn atomic_write(path: &Path, content: &str) -> Result<(), String> {
    let mut tmp_name = path.as_os_str().to_os_string();
    tmp_name.push(".tmp");
    let tmp = std::path::PathBuf::from(tmp_name);

    std::fs::write(&tmp, content).map_err(|e| format!("Failed to write {}: {e}", path.display()))?;
    std::fs::rename(&tmp, path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        format!("Failed to rename to {}: {e}", path.display())
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;

    fn setup_db_with_content() -> (Database, i64) {
        let db = Database::open_memory().expect("open");
        let subject_id = db
            .with_conn(|conn| {
                conn.execute(
                    "INSERT INTO subjects (slug, name, description) VALUES ('math', 'Mathematics', 'Core math topics')",
                    [],
                )
                .map_err(|e| e.to_string())?;
                let sid = conn.last_insert_rowid();

                conn.execute(
                    "INSERT INTO chapters (subject_id, title, slug, estimated_minutes) VALUES (?1, 'Algebra Basics', 'algebra-basics', 15)",
                    rusqlite::params![sid],
                )
                .map_err(|e| e.to_string())?;
                let cid = conn.last_insert_rowid();

                conn.execute(
                    "INSERT INTO chapter_sections (chapter_id, section_index, heading, body_markdown, word_count) VALUES (?1, 0, 'Variables', 'Variables represent unknown values.', 4)",
                    rusqlite::params![cid],
                )
                .map_err(|e| e.to_string())?;

                conn.execute(
                    "INSERT INTO chapter_sections (chapter_id, section_index, heading, body_markdown, word_count) VALUES (?1, 1, 'Equations', 'An equation states two expressions are equal.', 7)",
                    rusqlite::params![cid],
                )
                .map_err(|e| e.to_string())?;

                Ok(sid)
            })
            .expect("setup");
        (db, subject_id)
    }

    #[test]
    fn test_export_creates_directory_structure() {
        let (db, sid) = setup_db_with_content();
        let dir = tempfile::tempdir().expect("tmpdir");

        db.with_conn(|conn| export_subject(conn, sid, dir.path()))
            .expect("export");

        assert!(dir.path().join("math/_subject.md").exists());
        assert!(dir.path().join("math/chapters/algebra-basics.md").exists());
        assert!(dir.path().join("math/flashcards").is_dir());
        assert!(dir.path().join("math/quizzes").is_dir());
        assert!(dir.path().join("math/teach-backs").is_dir());
    }

    #[test]
    fn test_subject_md_has_correct_frontmatter() {
        let (db, sid) = setup_db_with_content();
        let dir = tempfile::tempdir().expect("tmpdir");

        db.with_conn(|conn| export_subject(conn, sid, dir.path()))
            .expect("export");

        let content = std::fs::read_to_string(dir.path().join("math/_subject.md")).expect("read");
        assert!(content.contains("subject: Mathematics"));
        assert!(content.contains("slug: math"));
        assert!(content.contains("type: subject"));
        assert!(content.contains("Core math topics"));
    }

    #[test]
    fn test_chapter_md_has_sections_in_order() {
        let (db, sid) = setup_db_with_content();
        let dir = tempfile::tempdir().expect("tmpdir");

        db.with_conn(|conn| export_subject(conn, sid, dir.path()))
            .expect("export");

        let content =
            std::fs::read_to_string(dir.path().join("math/chapters/algebra-basics.md")).expect("read");

        assert!(content.contains("subject: Mathematics"));
        assert!(content.contains("topic: Algebra Basics"));
        assert!(content.contains("type: chapter"));

        let vars_pos = content.find("## Variables").expect("Variables heading");
        let eqs_pos = content.find("## Equations").expect("Equations heading");
        assert!(vars_pos < eqs_pos, "sections should be in index order");
    }

    #[test]
    fn test_export_all_exports_every_subject() {
        let db = Database::open_memory().expect("open");
        db.with_conn(|conn| {
            conn.execute(
                "INSERT INTO subjects (slug, name) VALUES ('a', 'Subject A')",
                [],
            )
            .map_err(|e| e.to_string())?;
            conn.execute(
                "INSERT INTO subjects (slug, name) VALUES ('b', 'Subject B')",
                [],
            )
            .map_err(|e| e.to_string())?;
            Ok(())
        })
        .expect("setup");

        let dir = tempfile::tempdir().expect("tmpdir");
        let count = db
            .with_conn(|conn| export_all(conn, dir.path()))
            .expect("export_all");

        assert_eq!(count, 2);
        assert!(dir.path().join("a/_subject.md").exists());
        assert!(dir.path().join("b/_subject.md").exists());
    }

    #[test]
    fn test_export_skips_archived_subjects() {
        let db = Database::open_memory().expect("open");
        db.with_conn(|conn| {
            conn.execute(
                "INSERT INTO subjects (slug, name) VALUES ('active', 'Active')",
                [],
            )
            .map_err(|e| e.to_string())?;
            conn.execute(
                "INSERT INTO subjects (slug, name, archived_at) VALUES ('archived', 'Archived', datetime('now'))",
                [],
            )
            .map_err(|e| e.to_string())?;
            Ok(())
        })
        .expect("setup");

        let dir = tempfile::tempdir().expect("tmpdir");
        let count = db
            .with_conn(|conn| export_all(conn, dir.path()))
            .expect("export_all");

        assert_eq!(count, 1);
        assert!(dir.path().join("active/_subject.md").exists());
        assert!(!dir.path().join("archived").exists());
    }
}
