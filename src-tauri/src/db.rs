use rusqlite::{params, Connection};
use serde::Serialize;
use std::path::Path;
use std::sync::Mutex;

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
            "INSERT OR REPLACE INTO file_index (file_path, subject, topic, file_type, word_count, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))",
            params![file_path, subject, topic, file_type, word_count as i64],
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
