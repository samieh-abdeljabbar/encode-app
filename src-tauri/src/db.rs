use rusqlite::{params, Connection};
use serde::Serialize;
use std::path::Path;
use std::sync::Mutex;
use regex::Regex;

pub struct Database {
    conn: Mutex<Connection>,
}

#[derive(Debug, Serialize)]
pub struct SearchResult {
    pub file_path: String,
    pub subject: String,
    pub topic: String,
    pub excerpt: String,
}

#[derive(Debug, Serialize)]
pub struct StreakInfo {
    pub current: u32,
    pub longest: u32,
    pub today_completed: bool,
}

impl Database {
    /// Open or create the SQLite database and run migrations
    pub fn open(vault_path: &Path) -> Result<Self, String> {
        let db_path = vault_path.join(".encode").join("encode.db");

        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create db directory: {}", e))?;
        }

        let conn =
            Connection::open(&db_path).map_err(|e| format!("Failed to open database: {}", e))?;

        let migration_sql = include_str!("../migrations/001_initial.sql");
        conn.execute_batch(migration_sql)
            .map_err(|e| format!("Failed to run migrations: {}", e))?;

        let migration_002 = include_str!("../migrations/002_study_sessions.sql");
        conn.execute_batch(migration_002)
            .map_err(|e| format!("Failed to run migration 002: {}", e))?;

        // Migration 003: add status column (idempotent — ALTER TABLE fails silently if column exists)
        let _ = conn.execute_batch("ALTER TABLE file_index ADD COLUMN status TEXT DEFAULT 'unread'");

        Ok(Database {
            conn: Mutex::new(conn),
        })
    }

    /// Upsert a file into the search index
    pub fn index_file(
        &self,
        file_path: &str,
        subject: &str,
        topic: &str,
        content: &str,
        file_type: &str,
        word_count: usize,
        status: Option<&str>,
    ) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;

        conn.execute(
            "DELETE FROM vault_fts WHERE file_path = ?1",
            params![file_path],
        )
        .map_err(|e| format!("FTS delete failed: {}", e))?;

        conn.execute(
            "INSERT INTO vault_fts (file_path, subject, topic, content) VALUES (?1, ?2, ?3, ?4)",
            params![file_path, subject, topic, content],
        )
        .map_err(|e| format!("FTS insert failed: {}", e))?;

        conn.execute(
            "INSERT OR REPLACE INTO file_index (file_path, subject, topic, file_type, word_count, updated_at, status)
             VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'), ?6)",
            params![file_path, subject, topic, file_type, word_count as i64, status.unwrap_or("unread")],
        )
        .map_err(|e| format!("file_index upsert failed: {}", e))?;

        Ok(())
    }

    /// Remove a file from the index
    pub fn remove_file(&self, file_path: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "DELETE FROM vault_fts WHERE file_path = ?1",
            params![file_path],
        )
        .map_err(|e| e.to_string())?;
        conn.execute(
            "DELETE FROM file_index WHERE file_path = ?1",
            params![file_path],
        )
        .map_err(|e| e.to_string())?;
        // Also clean up flashcard schedules for this file
        conn.execute(
            "DELETE FROM sr_schedule WHERE file_path = ?1",
            params![file_path],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    /// Remove all DB entries for files matching a path prefix (e.g. "subjects/my-subject/")
    pub fn remove_files_by_prefix(&self, prefix: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        // Escape LIKE wildcards for defense-in-depth
        let escaped = prefix.replace('%', "\\%").replace('_', "\\_");
        let pattern = format!("{}%", escaped);
        conn.execute("DELETE FROM vault_fts WHERE file_path LIKE ?1 ESCAPE '\\'", params![pattern])
            .map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM file_index WHERE file_path LIKE ?1 ESCAPE '\\'", params![pattern])
            .map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM sr_schedule WHERE file_path LIKE ?1 ESCAPE '\\'", params![pattern])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    /// Remove quiz_history entries for subjects that no longer exist
    pub fn cleanup_orphaned_quiz_history(&self, valid_subjects: &[String]) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        if valid_subjects.is_empty() {
            conn.execute("DELETE FROM quiz_history", [])
                .map_err(|e| e.to_string())?;
        } else {
            let placeholders: Vec<String> = (1..=valid_subjects.len()).map(|i| format!("?{}", i)).collect();
            let sql = format!(
                "DELETE FROM quiz_history WHERE subject NOT IN ({})",
                placeholders.join(", ")
            );
            let params: Vec<&dyn rusqlite::types::ToSql> = valid_subjects.iter().map(|s| s as &dyn rusqlite::types::ToSql).collect();
            conn.execute(&sql, params.as_slice())
                .map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    /// Full-text search across the vault
    pub fn search(&self, query: &str) -> Result<Vec<SearchResult>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT file_path, subject, topic,
                        snippet(vault_fts, 3, '<mark>', '</mark>', '...', 30) as excerpt
                 FROM vault_fts
                 WHERE vault_fts MATCH ?1
                 ORDER BY rank
                 LIMIT 20",
            )
            .map_err(|e| format!("Search prepare failed: {}", e))?;

        let results = stmt
            .query_map(params![query], |row| {
                Ok(SearchResult {
                    file_path: row.get(0)?,
                    subject: row.get(1)?,
                    topic: row.get(2)?,
                    excerpt: row.get(3)?,
                })
            })
            .map_err(|e| format!("Search query failed: {}", e))?
            .filter_map(|r| r.ok())
            .collect();

        Ok(results)
    }

    /// Save or update a daily streak entry
    pub fn save_daily(
        &self,
        date: &str,
        text: &str,
        completed: bool,
        completed_at: Option<&str>,
    ) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT OR REPLACE INTO daily_streaks (date, commitment_text, completed, completed_at)
             VALUES (?1, ?2, ?3, ?4)",
            params![date, text, completed as i32, completed_at],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    /// Calculate current streak and longest streak
    pub fn get_streak(&self) -> Result<StreakInfo, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let today = chrono::Local::now().format("%Y-%m-%d").to_string();

        let today_completed: bool = conn
            .query_row(
                "SELECT completed FROM daily_streaks WHERE date = ?1",
                params![today],
                |row| row.get::<_, i32>(0).map(|v| v != 0),
            )
            .unwrap_or(false);

        let mut stmt = conn
            .prepare("SELECT date FROM daily_streaks WHERE completed = 1 ORDER BY date DESC")
            .map_err(|e| e.to_string())?;

        let dates: Vec<String> = stmt
            .query_map([], |row| row.get(0))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        let current = calculate_current_streak(&dates, &today);
        let longest = calculate_longest_streak(&dates);

        Ok(StreakInfo {
            current,
            longest,
            today_completed,
        })
    }

    /// Clear all indexed data (for rebuild)
    pub fn clear_index(&self) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute_batch("DELETE FROM vault_fts; DELETE FROM file_index;")
            .map_err(|e| e.to_string())
    }

    /// Execute a raw SQL statement (for transaction control)
    pub fn execute(&self, sql: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute_batch(sql).map_err(|e| e.to_string())
    }

    /// Get count of cards due for review
    pub fn get_due_count(&self, today: &str) -> Result<u32, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let count: u32 = conn
            .query_row(
                "SELECT COUNT(*) FROM sr_schedule WHERE next_review <= ?1",
                params![today],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        Ok(count)
    }

    /// Get all cards due for review
    pub fn get_due_cards(&self, today: &str) -> Result<Vec<DueCard>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT card_id, file_path, interval_days, ease_factor, next_review, last_reviewed
                 FROM sr_schedule WHERE next_review <= ?1 ORDER BY next_review ASC",
            )
            .map_err(|e| e.to_string())?;

        let cards = stmt
            .query_map(params![today], |row| {
                Ok(DueCard {
                    card_id: row.get(0)?,
                    file_path: row.get(1)?,
                    interval_days: row.get(2)?,
                    ease_factor: row.get(3)?,
                    next_review: row.get(4)?,
                    last_reviewed: row.get(5)?,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;

        Ok(cards)
    }

    /// Get cards at risk of lapse (due within threshold_days, with long intervals)
    pub fn get_at_risk_cards(&self, today: &str, threshold_days: i32) -> Result<Vec<DueCard>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT card_id, file_path, interval_days, ease_factor, next_review, last_reviewed
                 FROM sr_schedule
                 WHERE next_review > ?1
                   AND next_review <= date(?1, '+' || ?2 || ' days')
                   AND interval_days > 14
                 ORDER BY next_review ASC",
            )
            .map_err(|e| e.to_string())?;

        let cards = stmt
            .query_map(params![today, threshold_days], |row| {
                Ok(DueCard {
                    card_id: row.get(0)?,
                    file_path: row.get(1)?,
                    interval_days: row.get(2)?,
                    ease_factor: row.get(3)?,
                    next_review: row.get(4)?,
                    last_reviewed: row.get(5)?,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;

        Ok(cards)
    }

    /// Upsert a card's review schedule
    pub fn upsert_card_schedule(
        &self,
        card_id: &str,
        file_path: &str,
        next_review: &str,
        interval_days: f64,
        ease_factor: f64,
        last_reviewed: &str,
    ) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT OR REPLACE INTO sr_schedule (card_id, file_path, next_review, interval_days, ease_factor, last_reviewed)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![card_id, file_path, next_review, interval_days, ease_factor, last_reviewed],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }
}

#[derive(Debug, Serialize)]
pub struct DueCard {
    pub card_id: String,
    pub file_path: String,
    pub interval_days: f64,
    pub ease_factor: f64,
    pub next_review: String,
    pub last_reviewed: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct SubjectGrade {
    pub subject: String,
    pub total_quizzes: u32,
    pub avg_score: f64,
    pub last_quiz_date: Option<String>,
}

impl Database {
    pub fn record_quiz_result(
        &self, subject: &str, topic: &str, bloom_level: u32, correct: bool,
    ) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO quiz_history (subject, topic, bloom_level, correct) VALUES (?1, ?2, ?3, ?4)",
            params![subject, topic, bloom_level, if correct { 1 } else { 0 }],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn delete_quiz_history_by_subject(&self, subject: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "DELETE FROM quiz_history WHERE subject = ?1",
            params![subject],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn get_subject_grades(&self) -> Result<Vec<SubjectGrade>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn.prepare(
            "SELECT subject,
                    COUNT(DISTINCT attempted_at) as total_quizzes,
                    ROUND(100.0 * SUM(CASE WHEN correct THEN 1 ELSE 0 END) / COUNT(*), 1) as avg_score,
                    MAX(attempted_at) as last_quiz_date
             FROM quiz_history
             GROUP BY subject
             ORDER BY subject"
        ).map_err(|e| e.to_string())?;

        let grades = stmt.query_map([], |row| {
            Ok(SubjectGrade {
                subject: row.get(0)?,
                total_quizzes: row.get(1)?,
                avg_score: row.get(2)?,
                last_quiz_date: row.get(3)?,
            })
        }).map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

        Ok(grades)
    }
}

#[derive(Debug, Serialize)]
pub struct SubjectMastery {
    pub subject: String,
    pub chapters_total: u32,
    pub chapters_read: u32,
    pub avg_quiz_score: f64,
    pub cards_total: u32,
    pub cards_due: u32,
}

impl Database {
    pub fn get_subject_mastery(&self, subject: &str, today: &str) -> Result<SubjectMastery, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;

        let chapters_total: u32 = conn.query_row(
            "SELECT COUNT(*) FROM file_index WHERE subject = ?1 AND file_type = 'chapters'",
            params![subject], |row| row.get(0),
        ).unwrap_or(0);

        let chapters_read: u32 = conn.query_row(
            "SELECT COUNT(*) FROM file_index WHERE subject = ?1 AND file_type = 'chapters' AND status = 'digested'",
            params![subject], |row| row.get(0),
        ).unwrap_or(0);

        let avg_quiz_score: f64 = conn.query_row(
            "SELECT COALESCE(ROUND(100.0 * SUM(CASE WHEN correct THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1), 0)
             FROM quiz_history WHERE subject = ?1",
            params![subject], |row| row.get(0),
        ).unwrap_or(0.0);

        let cards_total: u32 = conn.query_row(
            "SELECT COUNT(*) FROM sr_schedule s
             JOIN file_index f ON s.file_path = f.file_path
             WHERE f.subject = ?1",
            params![subject], |row| row.get(0),
        ).unwrap_or(0);

        let cards_due: u32 = conn.query_row(
            "SELECT COUNT(*) FROM sr_schedule s
             JOIN file_index f ON s.file_path = f.file_path
             WHERE f.subject = ?1 AND s.next_review <= ?2",
            params![subject, today], |row| row.get(0),
        ).unwrap_or(0);

        Ok(SubjectMastery { subject: subject.to_string(), chapters_total, chapters_read, avg_quiz_score, cards_total, cards_due })
    }
}

#[derive(Debug, Serialize)]
pub struct QuizHistoryPoint {
    pub date: String,
    pub subject: String,
    pub total_questions: u32,
    pub correct_count: u32,
    pub score_pct: f64,
}

#[derive(Debug, Serialize)]
pub struct WeakTopic {
    pub subject: String,
    pub topic: String,
    pub bloom_level: u32,
    pub total: u32,
    pub correct: u32,
    pub accuracy_pct: f64,
}

impl Database {
    pub fn get_quiz_history_timeline(&self, subject: Option<&str>) -> Result<Vec<QuizHistoryPoint>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let (sql, params_vec): (String, Vec<Box<dyn rusqlite::types::ToSql>>) = if let Some(subj) = subject {
            (
                "SELECT DATE(attempted_at) as date, subject,
                        COUNT(*) as total_questions,
                        SUM(CASE WHEN correct THEN 1 ELSE 0 END) as correct_count,
                        ROUND(100.0 * SUM(CASE WHEN correct THEN 1 ELSE 0 END) / COUNT(*), 1) as score_pct
                 FROM quiz_history
                 WHERE subject = ?1
                 GROUP BY DATE(attempted_at), subject
                 ORDER BY date ASC".to_string(),
                vec![Box::new(subj.to_string()) as Box<dyn rusqlite::types::ToSql>],
            )
        } else {
            (
                "SELECT DATE(attempted_at) as date, subject,
                        COUNT(*) as total_questions,
                        SUM(CASE WHEN correct THEN 1 ELSE 0 END) as correct_count,
                        ROUND(100.0 * SUM(CASE WHEN correct THEN 1 ELSE 0 END) / COUNT(*), 1) as score_pct
                 FROM quiz_history
                 GROUP BY DATE(attempted_at), subject
                 ORDER BY date ASC".to_string(),
                vec![],
            )
        };
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let param_refs: Vec<&dyn rusqlite::types::ToSql> = params_vec.iter().map(|p| p.as_ref()).collect();
        let results = stmt
            .query_map(param_refs.as_slice(), |row| {
                Ok(QuizHistoryPoint {
                    date: row.get(0)?,
                    subject: row.get(1)?,
                    total_questions: row.get(2)?,
                    correct_count: row.get(3)?,
                    score_pct: row.get(4)?,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        Ok(results)
    }

    pub fn get_weak_topics(&self, subject: Option<&str>) -> Result<Vec<WeakTopic>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let (sql, params_vec): (String, Vec<Box<dyn rusqlite::types::ToSql>>) = if let Some(subj) = subject {
            (
                "SELECT subject, topic, bloom_level,
                        COUNT(*) as total,
                        SUM(CASE WHEN correct THEN 1 ELSE 0 END) as correct,
                        ROUND(100.0 * SUM(CASE WHEN correct THEN 1 ELSE 0 END) / COUNT(*), 1) as accuracy_pct
                 FROM quiz_history
                 WHERE subject = ?1
                 GROUP BY subject, topic, bloom_level
                 HAVING COUNT(*) >= 3
                 ORDER BY accuracy_pct ASC
                 LIMIT 10".to_string(),
                vec![Box::new(subj.to_string()) as Box<dyn rusqlite::types::ToSql>],
            )
        } else {
            (
                "SELECT subject, topic, bloom_level,
                        COUNT(*) as total,
                        SUM(CASE WHEN correct THEN 1 ELSE 0 END) as correct,
                        ROUND(100.0 * SUM(CASE WHEN correct THEN 1 ELSE 0 END) / COUNT(*), 1) as accuracy_pct
                 FROM quiz_history
                 GROUP BY subject, topic, bloom_level
                 HAVING COUNT(*) >= 3
                 ORDER BY accuracy_pct ASC
                 LIMIT 10".to_string(),
                vec![],
            )
        };
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let param_refs: Vec<&dyn rusqlite::types::ToSql> = params_vec.iter().map(|p| p.as_ref()).collect();
        let results = stmt
            .query_map(param_refs.as_slice(), |row| {
                Ok(WeakTopic {
                    subject: row.get(0)?,
                    topic: row.get(1)?,
                    bloom_level: row.get(2)?,
                    total: row.get(3)?,
                    correct: row.get(4)?,
                    accuracy_pct: row.get(5)?,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        Ok(results)
    }
}

#[derive(Debug, Serialize)]
pub struct SubjectStudyTime {
    pub subject_name: String,
    pub subject_slug: String,
    pub total_seconds: u32,
    pub session_count: u32,
}

impl Database {
    pub fn record_study_session(
        &self,
        id: &str,
        subject_name: &str,
        subject_slug: &str,
        duration_secs: i64,
        started_at: &str,
        completed_at: &str,
    ) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT OR REPLACE INTO study_sessions (id, subject_name, subject_slug, duration_secs, started_at, completed_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![id, subject_name, subject_slug, duration_secs, started_at, completed_at],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn get_study_time_by_subject(&self) -> Result<Vec<SubjectStudyTime>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT subject_name, subject_slug, SUM(duration_secs) as total_seconds, COUNT(*) as session_count
                 FROM study_sessions
                 GROUP BY subject_slug
                 ORDER BY total_seconds DESC",
            )
            .map_err(|e| e.to_string())?;

        let results = stmt
            .query_map([], |row| {
                Ok(SubjectStudyTime {
                    subject_name: row.get(0)?,
                    subject_slug: row.get(1)?,
                    total_seconds: row.get(2)?,
                    session_count: row.get(3)?,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;

        Ok(results)
    }

    pub fn get_todays_study_time(&self) -> Result<u32, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let today = chrono::Local::now().format("%Y-%m-%d").to_string();
        let total: u32 = conn
            .query_row(
                "SELECT COALESCE(SUM(duration_secs), 0) FROM study_sessions WHERE completed_at LIKE ?1",
                params![format!("{}%", today)],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        Ok(total)
    }

    pub fn delete_study_sessions_by_subject(&self, slug: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "DELETE FROM study_sessions WHERE subject_slug = ?1",
            params![slug],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn cleanup_orphaned_study_sessions(&self, valid_slugs: &[String]) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        if valid_slugs.is_empty() {
            conn.execute("DELETE FROM study_sessions", [])
                .map_err(|e| e.to_string())?;
        } else {
            let placeholders: Vec<String> = (1..=valid_slugs.len()).map(|i| format!("?{}", i)).collect();
            let sql = format!(
                "DELETE FROM study_sessions WHERE subject_slug NOT IN ({})",
                placeholders.join(", ")
            );
            let params: Vec<&dyn rusqlite::types::ToSql> =
                valid_slugs.iter().map(|s| s as &dyn rusqlite::types::ToSql).collect();
            conn.execute(&sql, params.as_slice())
                .map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    pub fn clear_study_sessions(&self) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM study_sessions", [])
            .map_err(|e| e.to_string())?;
        Ok(())
    }
}

impl Database {
    /// Delete a single card's schedule entry
    pub fn delete_card_schedule(&self, card_id: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM sr_schedule WHERE card_id = ?1", params![card_id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    /// Remove orphaned sr_schedule entries where the file no longer exists
    /// or the card_id is no longer present in the file
    pub fn cleanup_orphaned_sr_schedules(&self, vault_path: &Path) -> Result<usize, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT card_id, file_path FROM sr_schedule")
            .map_err(|e| e.to_string())?;

        let entries: Vec<(String, String)> = stmt
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        let card_id_re = Regex::new(r">\s*\[!card\]\s*id:\s*(\S+)").unwrap();
        let mut to_delete: Vec<String> = Vec::new();
        // Cache file contents to avoid re-reading
        let mut file_cards: std::collections::HashMap<String, Vec<String>> =
            std::collections::HashMap::new();

        for (card_id, file_path) in &entries {
            let full_path = vault_path.join(file_path);
            if !full_path.exists() {
                to_delete.push(card_id.clone());
                continue;
            }

            let card_ids = file_cards.entry(file_path.clone()).or_insert_with(|| {
                match std::fs::read_to_string(&full_path) {
                    Ok(content) => card_id_re
                        .captures_iter(&content)
                        .filter_map(|cap| cap.get(1).map(|m| m.as_str().to_string()))
                        .collect(),
                    Err(_) => Vec::new(),
                }
            });

            if !card_ids.contains(card_id) {
                to_delete.push(card_id.clone());
            }
        }

        let removed = to_delete.len();
        for id in &to_delete {
            conn.execute("DELETE FROM sr_schedule WHERE card_id = ?1", params![id])
                .map_err(|e| e.to_string())?;
        }

        Ok(removed)
    }
}

// ─── SQL Sandbox for Code Quiz Execution ───────────────

#[derive(Debug, Serialize)]
pub struct QueryResult {
    pub columns: Vec<String>,
    pub rows: Vec<Vec<String>>,
    pub row_count: usize,
}

pub struct SandboxDb {
    conn: Connection,
}

impl SandboxDb {
    pub fn new() -> Result<Self, String> {
        let conn = Connection::open_in_memory()
            .map_err(|e| format!("Failed to open sandbox: {}", e))?;
        // Set a busy timeout for safety
        conn.busy_timeout(std::time::Duration::from_secs(5))
            .map_err(|e| format!("Failed to set timeout: {}", e))?;
        Ok(SandboxDb { conn })
    }

    pub fn execute_setup(&self, sql: &str) -> Result<(), String> {
        self.conn.execute_batch(sql)
            .map_err(|e| format!("Setup SQL failed: {}", e))
    }

    pub fn execute_query(&self, sql: &str) -> Result<QueryResult, String> {
        // Only allow SELECT and WITH for safety
        let trimmed = sql.trim().to_uppercase();
        if !trimmed.starts_with("SELECT") && !trimmed.starts_with("WITH") {
            return Err("Only SELECT queries are allowed in the sandbox.".to_string());
        }

        let mut stmt = self.conn.prepare(sql)
            .map_err(|e| format!("Query error: {}", e))?;

        let column_count = stmt.column_count();
        let columns: Vec<String> = (0..column_count)
            .map(|i| stmt.column_name(i).unwrap_or("?").to_string())
            .collect();

        let mut rows: Vec<Vec<String>> = Vec::new();
        let mut row_iter = stmt.query([])
            .map_err(|e| format!("Query execution failed: {}", e))?;

        while let Some(row) = row_iter.next().map_err(|e| format!("Row fetch failed: {}", e))? {
            if rows.len() >= 100 { break; } // Max 100 rows
            let mut values: Vec<String> = Vec::new();
            for i in 0..column_count {
                let val: String = row.get::<_, rusqlite::types::Value>(i)
                    .map(|v| match v {
                        rusqlite::types::Value::Null => "NULL".to_string(),
                        rusqlite::types::Value::Integer(n) => n.to_string(),
                        rusqlite::types::Value::Real(f) => f.to_string(),
                        rusqlite::types::Value::Text(s) => s,
                        rusqlite::types::Value::Blob(_) => "[BLOB]".to_string(),
                    })
                    .unwrap_or_else(|_| "?".to_string());
                values.push(val);
            }
            rows.push(values);
        }

        let row_count = rows.len();
        Ok(QueryResult { columns, rows, row_count })
    }
}

fn calculate_current_streak(dates: &[String], today: &str) -> u32 {
    if dates.is_empty() {
        return 0;
    }

    let mut streak = 0u32;
    let mut expected = chrono::NaiveDate::parse_from_str(today, "%Y-%m-%d")
        .unwrap_or_else(|_| chrono::Local::now().date_naive());

    for date_str in dates {
        if let Ok(date) = chrono::NaiveDate::parse_from_str(date_str, "%Y-%m-%d") {
            if date == expected {
                streak += 1;
                expected -= chrono::Duration::days(1);
            } else if date < expected {
                break;
            }
        }
    }

    streak
}

fn calculate_longest_streak(dates: &[String]) -> u32 {
    if dates.is_empty() {
        return 0;
    }

    let mut parsed: Vec<chrono::NaiveDate> = dates
        .iter()
        .filter_map(|d| chrono::NaiveDate::parse_from_str(d, "%Y-%m-%d").ok())
        .collect();
    parsed.sort();
    parsed.dedup();

    if parsed.is_empty() {
        return 0;
    }

    let mut longest = 1u32;
    let mut current = 1u32;

    for window in parsed.windows(2) {
        if window[1] - window[0] == chrono::Duration::days(1) {
            current += 1;
            longest = longest.max(current);
        } else {
            current = 1;
        }
    }

    longest
}
