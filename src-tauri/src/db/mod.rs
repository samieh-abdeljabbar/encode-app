mod migrations;

use rusqlite::Connection;
use std::path::Path;
use std::sync::Mutex;

pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    fn init(conn: Connection) -> Result<Self, String> {
        let db = Self {
            conn: Mutex::new(conn),
        };
        db.with_conn(migrations::run_all)?;
        Ok(db)
    }

    pub fn open(path: &Path) -> Result<Self, String> {
        let conn = Connection::open(path).map_err(|e| format!("Failed to open database: {e}"))?;
        conn.execute_batch("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;")
            .map_err(|e| format!("Failed to set PRAGMAs: {e}"))?;
        Self::init(conn)
    }

    /// Open an in-memory database for testing. Available in test and integration test builds.
    #[cfg(any(test, feature = "test-utils"))]
    pub fn open_memory() -> Result<Self, String> {
        let conn = Connection::open_in_memory()
            .map_err(|e| format!("Failed to open in-memory db: {e}"))?;
        conn.execute_batch("PRAGMA foreign_keys = ON;")
            .map_err(|e| format!("Failed to enable foreign keys: {e}"))?;
        Self::init(conn)
    }

    pub fn schema_version(&self) -> Result<u32, String> {
        self.with_conn(migrations::read_user_version)
    }

    pub fn with_conn<F, T>(&self, f: F) -> Result<T, String>
    where
        F: FnOnce(&Connection) -> Result<T, String>,
    {
        let conn = self.conn.lock().map_err(|e| format!("Lock error: {e}"))?;
        f(&conn)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_open_memory_and_migrate() {
        let db = Database::open_memory().expect("should open in-memory db");
        let version = db.schema_version().expect("should read version");
        assert!(version >= 1, "schema version should be at least 1");
    }

    #[test]
    fn test_tables_exist() {
        let db = Database::open_memory().expect("should open");
        db.with_conn(|conn| {
            let tables: Vec<String> = conn
                .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
                .map_err(|e| e.to_string())?
                .query_map([], |row| row.get(0))
                .map_err(|e| e.to_string())?
                .filter_map(|r| r.ok())
                .collect();

            let expected = vec![
                "ai_runs",
                "card_reviews",
                "card_schedule",
                "cards",
                "chapter_sections",
                "chapters",
                "quiz_attempts",
                "quizzes",
                "sections_fts",
                "settings",
                "sources",
                "study_events",
                "subjects",
                "teachbacks",
            ];

            for table in &expected {
                assert!(
                    tables.contains(&table.to_string()),
                    "missing table: {table}, found: {tables:?}"
                );
            }
            Ok(())
        })
        .expect("table check should pass");
    }

    #[test]
    fn test_foreign_keys_enabled() {
        let db = Database::open_memory().expect("should open");
        db.with_conn(|conn| {
            let fk: i32 = conn
                .pragma_query_value(None, "foreign_keys", |row| row.get(0))
                .map_err(|e| e.to_string())?;
            assert_eq!(fk, 1, "foreign_keys should be enabled");
            Ok(())
        })
        .expect("fk check should pass");
    }

    #[test]
    fn test_wal_configured_at_open_not_migration() {
        // WAL should be set by Database::open, not by migration SQL.
        // Verify the migration file does NOT contain PRAGMA journal_mode.
        let migration_sql = include_str!("../../migrations/001_foundation.sql");
        assert!(
            !migration_sql.contains("PRAGMA journal_mode"),
            "WAL should not be in migration SQL — it belongs in Database::open()"
        );
    }

    // --- CHECK constraint tests ---

    fn setup_subject(conn: &Connection) -> i64 {
        conn.execute(
            "INSERT INTO subjects (slug, name) VALUES ('test', 'Test Subject')",
            [],
        )
        .unwrap();
        conn.last_insert_rowid()
    }

    fn setup_chapter(conn: &Connection, subject_id: i64) -> i64 {
        conn.execute(
            "INSERT INTO chapters (subject_id, title, slug) VALUES (?1, 'Ch1', 'ch1')",
            [subject_id],
        )
        .unwrap();
        conn.last_insert_rowid()
    }

    #[test]
    fn test_check_sources_kind_rejects_invalid() {
        let db = Database::open_memory().expect("open");
        db.with_conn(|conn| {
            let sid = setup_subject(conn);
            let result = conn.execute(
                "INSERT INTO sources (subject_id, kind, title) VALUES (?1, 'invalid', 'Test')",
                [sid],
            );
            assert!(result.is_err(), "should reject invalid sources.kind");
            Ok(())
        })
        .unwrap();
    }

    #[test]
    fn test_check_chapters_status_rejects_invalid() {
        let db = Database::open_memory().expect("open");
        db.with_conn(|conn| {
            let sid = setup_subject(conn);
            let result = conn.execute(
                "INSERT INTO chapters (subject_id, title, slug, status) VALUES (?1, 'Ch', 'ch', 'bogus')",
                [sid],
            );
            assert!(result.is_err(), "should reject invalid chapters.status");
            Ok(())
        })
        .unwrap();
    }

    #[test]
    fn test_check_cards_source_type_rejects_invalid() {
        let db = Database::open_memory().expect("open");
        db.with_conn(|conn| {
            let sid = setup_subject(conn);
            let result = conn.execute(
                "INSERT INTO cards (subject_id, source_type, prompt, answer) VALUES (?1, 'bad', 'Q', 'A')",
                [sid],
            );
            assert!(result.is_err(), "should reject invalid cards.source_type");
            Ok(())
        })
        .unwrap();
    }

    #[test]
    fn test_check_cards_card_type_rejects_invalid() {
        let db = Database::open_memory().expect("open");
        db.with_conn(|conn| {
            let sid = setup_subject(conn);
            let result = conn.execute(
                "INSERT INTO cards (subject_id, source_type, prompt, answer, card_type) VALUES (?1, 'manual', 'Q', 'A', 'bad')",
                [sid],
            );
            assert!(result.is_err(), "should reject invalid cards.card_type");
            Ok(())
        })
        .unwrap();
    }

    #[test]
    fn test_check_cards_status_rejects_invalid() {
        let db = Database::open_memory().expect("open");
        db.with_conn(|conn| {
            let sid = setup_subject(conn);
            let result = conn.execute(
                "INSERT INTO cards (subject_id, source_type, prompt, answer, status) VALUES (?1, 'manual', 'Q', 'A', 'deleted')",
                [sid],
            );
            assert!(result.is_err(), "should reject invalid cards.status");
            Ok(())
        })
        .unwrap();
    }

    #[test]
    fn test_check_quizzes_scope_type_rejects_invalid() {
        let db = Database::open_memory().expect("open");
        db.with_conn(|conn| {
            let sid = setup_subject(conn);
            let result = conn.execute(
                "INSERT INTO quizzes (subject_id, scope_type) VALUES (?1, 'exam')",
                [sid],
            );
            assert!(result.is_err(), "should reject invalid quizzes.scope_type");
            Ok(())
        })
        .unwrap();
    }

    #[test]
    fn test_check_quiz_attempts_result_rejects_invalid() {
        let db = Database::open_memory().expect("open");
        db.with_conn(|conn| {
            let sid = setup_subject(conn);
            conn.execute(
                "INSERT INTO quizzes (subject_id, scope_type) VALUES (?1, 'chapter')",
                [sid],
            )
            .unwrap();
            let qid = conn.last_insert_rowid();
            let result = conn.execute(
                "INSERT INTO quiz_attempts (quiz_id, question_index, question_json, result) VALUES (?1, 0, '{}', 'wrong')",
                [qid],
            );
            assert!(result.is_err(), "should reject invalid quiz_attempts.result");
            Ok(())
        })
        .unwrap();
    }

    #[test]
    fn test_check_teachbacks_mastery_rejects_invalid() {
        let db = Database::open_memory().expect("open");
        db.with_conn(|conn| {
            let sid = setup_subject(conn);
            let result = conn.execute(
                "INSERT INTO teachbacks (subject_id, prompt, mastery) VALUES (?1, 'Explain X', 'expert')",
                [sid],
            );
            assert!(result.is_err(), "should reject invalid teachbacks.mastery");
            Ok(())
        })
        .unwrap();
    }

    #[test]
    fn test_check_teachbacks_mastery_allows_null() {
        let db = Database::open_memory().expect("open");
        db.with_conn(|conn| {
            let sid = setup_subject(conn);
            conn.execute(
                "INSERT INTO teachbacks (subject_id, prompt) VALUES (?1, 'Explain X')",
                [sid],
            )
            .map_err(|e| e.to_string())?;
            Ok(())
        })
        .unwrap();
    }

    // --- FTS tests ---

    #[test]
    fn test_fts_insert_trigger_indexes_content() {
        let db = Database::open_memory().expect("open");
        db.with_conn(|conn| {
            let sid = setup_subject(conn);
            let cid = setup_chapter(conn, sid);

            conn.execute(
                "INSERT INTO chapter_sections (chapter_id, section_index, heading, body_markdown, word_count) VALUES (?1, 0, 'Normalization', 'Database normalization reduces redundancy and improves data integrity.', 8)",
                [cid],
            )
            .map_err(|e| e.to_string())?;

            // Search for "normalization" — should find the section
            let count: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM sections_fts WHERE sections_fts MATCH 'normalization'",
                    [],
                    |row| row.get(0),
                )
                .map_err(|e| e.to_string())?;

            assert_eq!(count, 1, "FTS should find the inserted section");
            Ok(())
        })
        .unwrap();
    }

    #[test]
    fn test_fts_delete_trigger_removes_content() {
        let db = Database::open_memory().expect("open");
        db.with_conn(|conn| {
            let sid = setup_subject(conn);
            let cid = setup_chapter(conn, sid);

            conn.execute(
                "INSERT INTO chapter_sections (chapter_id, section_index, heading, body_markdown, word_count) VALUES (?1, 0, 'Indexes', 'B-tree indexes speed up queries.', 6)",
                [cid],
            )
            .map_err(|e| e.to_string())?;

            let section_id = conn.last_insert_rowid();

            conn.execute("DELETE FROM chapter_sections WHERE id = ?1", [section_id])
                .map_err(|e| e.to_string())?;

            let count: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM sections_fts WHERE sections_fts MATCH 'indexes'",
                    [],
                    |row| row.get(0),
                )
                .map_err(|e| e.to_string())?;

            assert_eq!(count, 0, "FTS should remove deleted section");
            Ok(())
        })
        .unwrap();
    }

    #[test]
    fn test_fts_readback_returns_actual_text() {
        let db = Database::open_memory().expect("open");
        db.with_conn(|conn| {
            let sid = setup_subject(conn);
            let cid = setup_chapter(conn, sid);

            conn.execute(
                "INSERT INTO chapter_sections (chapter_id, section_index, heading, body_markdown, word_count) VALUES (?1, 0, 'Joins', 'Inner joins combine rows from two tables based on a related column.', 11)",
                [cid],
            )
            .map_err(|e| e.to_string())?;

            // SELECT actual text, not just COUNT — this was the readback bug
            let (heading, body): (String, String) = conn
                .query_row(
                    "SELECT heading, body FROM sections_fts WHERE sections_fts MATCH 'joins'",
                    [],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .map_err(|e| e.to_string())?;

            assert_eq!(heading, "Joins");
            assert!(body.contains("Inner joins"), "body should contain the inserted text");
            Ok(())
        })
        .unwrap();
    }

    // --- Settings table test ---

    #[test]
    fn test_settings_table_works() {
        let db = Database::open_memory().expect("open");
        db.with_conn(|conn| {
            conn.execute(
                "INSERT INTO settings (key, value) VALUES ('theme', 'midnight')",
                [],
            )
            .map_err(|e| e.to_string())?;

            let val: String = conn
                .query_row(
                    "SELECT value FROM settings WHERE key = 'theme'",
                    [],
                    |row| row.get(0),
                )
                .map_err(|e| e.to_string())?;

            assert_eq!(val, "midnight");
            Ok(())
        })
        .unwrap();
    }
}
