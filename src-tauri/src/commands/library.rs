use crate::services::chunker;
use crate::services::importer;
use crate::AppState;
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct Subject {
    pub id: i64,
    pub slug: String,
    pub name: String,
    pub description: String,
    pub chapter_count: i64,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
pub struct Chapter {
    pub id: i64,
    pub subject_id: i64,
    pub title: String,
    pub slug: String,
    pub status: String,
    pub estimated_minutes: Option<i64>,
    pub created_at: String,
    pub section_count: i64,
    pub checked_count: i64,
}

#[derive(Debug, Serialize)]
pub struct Section {
    pub id: i64,
    pub section_index: i32,
    pub heading: Option<String>,
    pub body_markdown: String,
    pub word_count: i32,
}

#[derive(Debug, Serialize)]
pub struct ChapterWithSections {
    pub chapter: Chapter,
    pub sections: Vec<Section>,
}

#[derive(Debug, Serialize)]
pub struct SearchResult {
    pub chapter_id: i64,
    pub chapter_title: String,
    pub subject_name: String,
    pub section_heading: Option<String>,
    pub snippet: String,
}

const WORDS_PER_MINUTE: f64 = 200.0;

fn estimate_reading_minutes(sections: &[chunker::SectionData]) -> i64 {
    let total_words: i32 = sections.iter().map(|s| s.word_count).sum();
    (total_words as f64 / WORDS_PER_MINUTE).ceil() as i64
}

fn row_to_chapter(row: &rusqlite::Row) -> rusqlite::Result<Chapter> {
    Ok(Chapter {
        id: row.get(0)?,
        subject_id: row.get(1)?,
        title: row.get(2)?,
        slug: row.get(3)?,
        status: row.get(4)?,
        estimated_minutes: row.get(5)?,
        created_at: row.get(6)?,
        section_count: row.get(7)?,
        checked_count: row.get(8)?,
    })
}

fn slugify(name: &str) -> String {
    name.trim()
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}

fn insert_sections(
    conn: &rusqlite::Connection,
    chapter_id: i64,
    sections: &[chunker::SectionData],
) -> Result<(), String> {
    let mut stmt = conn
        .prepare(
            "INSERT INTO chapter_sections (chapter_id, section_index, heading, body_markdown, word_count)
             VALUES (?1, ?2, ?3, ?4, ?5)",
        )
        .map_err(|e| format!("Failed to prepare section insert: {e}"))?;

    for s in sections {
        stmt.execute(rusqlite::params![
            chapter_id,
            s.section_index,
            s.heading,
            s.body_markdown,
            s.word_count,
        ])
        .map_err(|e| format!("Failed to insert section {}: {e}", s.section_index))?;
    }
    Ok(())
}

#[tauri::command]
pub fn create_subject(
    state: tauri::State<'_, AppState>,
    name: String,
) -> Result<Subject, String> {
    let slug = slugify(&name);
    state.db.with_conn(|conn| {
        conn.execute(
            "INSERT INTO subjects (slug, name) VALUES (?1, ?2)",
            rusqlite::params![slug, name.trim()],
        )
        .map_err(|e| format!("Failed to create subject: {e}"))?;

        let id = conn.last_insert_rowid();
        Ok(Subject {
            id,
            slug,
            name: name.trim().to_string(),
            description: String::new(),
            chapter_count: 0,
            created_at: chrono::Utc::now().to_rfc3339(),
        })
    })
}

#[tauri::command]
pub fn list_subjects(state: tauri::State<'_, AppState>) -> Result<Vec<Subject>, String> {
    state.db.with_conn(|conn| {
        let mut stmt = conn
            .prepare(
                "SELECT s.id, s.slug, s.name, COALESCE(s.description, ''), s.created_at,
                        (SELECT COUNT(*) FROM chapters c WHERE c.subject_id = s.id) as chapter_count
                 FROM subjects s
                 WHERE s.archived_at IS NULL
                 ORDER BY s.name",
            )
            .map_err(|e| format!("Failed to query subjects: {e}"))?;

        let subjects = stmt
            .query_map([], |row| {
                Ok(Subject {
                    id: row.get(0)?,
                    slug: row.get(1)?,
                    name: row.get(2)?,
                    description: row.get(3)?,
                    created_at: row.get(4)?,
                    chapter_count: row.get(5)?,
                })
            })
            .map_err(|e| format!("Failed to map subjects: {e}"))?
            .filter_map(|r| r.ok())
            .collect();

        Ok(subjects)
    })
}

#[tauri::command]
pub fn delete_subject(state: tauri::State<'_, AppState>, id: i64) -> Result<(), String> {
    state.db.with_conn(|conn| {
        conn.execute("DELETE FROM subjects WHERE id = ?1", rusqlite::params![id])
            .map_err(|e| format!("Failed to delete subject: {e}"))?;
        Ok(())
    })
}

#[tauri::command]
pub fn create_chapter(
    state: tauri::State<'_, AppState>,
    subject_id: i64,
    title: String,
    content: String,
) -> Result<Chapter, String> {
    let slug = slugify(&title);
    let sections = chunker::split_into_sections(&content);
    let estimated_minutes = estimate_reading_minutes(&sections);

    state.db.with_conn(|conn| {
        conn.execute(
            "INSERT INTO chapters (subject_id, title, slug, estimated_minutes)
             VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![subject_id, title.trim(), slug, estimated_minutes],
        )
        .map_err(|e| format!("Failed to create chapter: {e}"))?;

        let chapter_id = conn.last_insert_rowid();
        insert_sections(conn, chapter_id, &sections)?;

        Ok(Chapter {
            id: chapter_id,
            subject_id,
            title: title.trim().to_string(),
            slug,
            status: "new".to_string(),
            estimated_minutes: Some(estimated_minutes),
            created_at: chrono::Utc::now().to_rfc3339(),
            section_count: sections.len() as i64,
            checked_count: 0,
        })
    })
}

#[tauri::command]
pub fn list_chapters(
    state: tauri::State<'_, AppState>,
    subject_id: i64,
) -> Result<Vec<Chapter>, String> {
    state.db.with_conn(|conn| {
        let mut stmt = conn
            .prepare(
                "SELECT c.id, c.subject_id, c.title, c.slug, c.status, c.estimated_minutes, c.created_at,
                        COUNT(cs.id) as section_count,
                        COUNT(CASE WHEN cs.status IN ('checked_correct', 'checked_partial', 'checked_off_track') THEN 1 END) as checked_count
                 FROM chapters c
                 LEFT JOIN chapter_sections cs ON cs.chapter_id = c.id
                 WHERE c.subject_id = ?1
                 GROUP BY c.id
                 ORDER BY c.created_at",
            )
            .map_err(|e| format!("Failed to query chapters: {e}"))?;

        let chapters = stmt
            .query_map(rusqlite::params![subject_id], row_to_chapter)
            .map_err(|e| format!("Failed to map chapters: {e}"))?
            .filter_map(|r| r.ok())
            .collect();

        Ok(chapters)
    })
}

#[tauri::command]
pub fn get_chapter_with_sections(
    state: tauri::State<'_, AppState>,
    chapter_id: i64,
) -> Result<ChapterWithSections, String> {
    state.db.with_conn(|conn| {
        let chapter = conn
            .query_row(
                "SELECT c.id, c.subject_id, c.title, c.slug, c.status, c.estimated_minutes, c.created_at,
                        COUNT(cs.id) as section_count,
                        COUNT(CASE WHEN cs.status IN ('checked_correct', 'checked_partial', 'checked_off_track') THEN 1 END) as checked_count
                 FROM chapters c
                 LEFT JOIN chapter_sections cs ON cs.chapter_id = c.id
                 WHERE c.id = ?1
                 GROUP BY c.id",
                rusqlite::params![chapter_id],
                row_to_chapter,
            )
            .map_err(|e| format!("Chapter not found: {e}"))?;

        let mut stmt = conn
            .prepare(
                "SELECT id, section_index, heading, body_markdown, word_count
                 FROM chapter_sections WHERE chapter_id = ?1 ORDER BY section_index",
            )
            .map_err(|e| format!("Failed to query sections: {e}"))?;

        let sections = stmt
            .query_map(rusqlite::params![chapter_id], |row| {
                Ok(Section {
                    id: row.get(0)?,
                    section_index: row.get(1)?,
                    heading: row.get(2)?,
                    body_markdown: row.get(3)?,
                    word_count: row.get(4)?,
                })
            })
            .map_err(|e| format!("Failed to map sections: {e}"))?
            .filter_map(|r| r.ok())
            .collect();

        Ok(ChapterWithSections { chapter, sections })
    })
}

#[tauri::command]
pub async fn import_url(
    state: tauri::State<'_, AppState>,
    url: String,
    subject_id: i64,
) -> Result<Chapter, String> {
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("Only http:// and https:// URLs are supported".to_string());
    }

    let response = state
        .http
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch URL: {e}"))?;

    let html = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {e}"))?;

    let title = importer::extract_title(&html).unwrap_or_else(|| "Imported Article".to_string());
    let markdown = importer::html_to_markdown(&html);
    let slug = slugify(&title);
    let sections = chunker::split_into_sections(&markdown);
    let estimated_minutes = estimate_reading_minutes(&sections);

    state.db.with_conn(|conn| {
        conn.execute(
            "INSERT INTO sources (subject_id, kind, title, source_url, normalized_markdown)
             VALUES (?1, 'url', ?2, ?3, ?4)",
            rusqlite::params![subject_id, title, url, markdown],
        )
        .map_err(|e| format!("Failed to insert source: {e}"))?;

        let source_id = conn.last_insert_rowid();

        conn.execute(
            "INSERT INTO chapters (subject_id, source_id, title, slug, estimated_minutes)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![subject_id, source_id, title, slug, estimated_minutes],
        )
        .map_err(|e| format!("Failed to insert chapter: {e}"))?;

        let chapter_id = conn.last_insert_rowid();
        insert_sections(conn, chapter_id, &sections)?;

        Ok(Chapter {
            id: chapter_id,
            subject_id,
            title,
            slug,
            status: "new".to_string(),
            estimated_minutes: Some(estimated_minutes),
            created_at: chrono::Utc::now().to_rfc3339(),
            section_count: sections.len() as i64,
            checked_count: 0,
        })
    })
}

#[tauri::command]
pub fn update_chapter_content(
    state: tauri::State<'_, AppState>,
    chapter_id: i64,
    markdown: String,
) -> Result<(), String> {
    state.db.with_conn(|conn| {
        crate::services::chapter::update_content(conn, chapter_id, &markdown)
    })
}

#[tauri::command]
pub fn save_image(
    state: tauri::State<'_, AppState>,
    data: Vec<u8>,
    extension: String,
) -> Result<String, String> {
    crate::services::chapter::save_image(&state.vault_path, &data, &extension)
}

#[tauri::command]
pub fn search(
    state: tauri::State<'_, AppState>,
    query: String,
) -> Result<Vec<SearchResult>, String> {
    if query.trim().is_empty() {
        return Ok(Vec::new());
    }

    // Escape FTS5 special characters by wrapping terms in quotes
    let safe_query = query
        .split_whitespace()
        .map(|term| format!("\"{term}\""))
        .collect::<Vec<_>>()
        .join(" ");

    state.db.with_conn(|conn| {
        let mut stmt = conn
            .prepare(
                "SELECT cs.chapter_id, ch.title, s.name,
                        cs.heading, snippet(sections_fts, 1, '<mark>', '</mark>', '...', 30)
                 FROM sections_fts
                 JOIN chapter_sections cs ON cs.id = sections_fts.rowid
                 JOIN chapters ch ON ch.id = cs.chapter_id
                 JOIN subjects s ON s.id = ch.subject_id
                 WHERE sections_fts MATCH ?1
                 LIMIT 20",
            )
            .map_err(|e| format!("Search query failed: {e}"))?;

        let results = stmt
            .query_map(rusqlite::params![safe_query], |row| {
                Ok(SearchResult {
                    chapter_id: row.get(0)?,
                    chapter_title: row.get(1)?,
                    subject_name: row.get(2)?,
                    section_heading: row.get(3)?,
                    snippet: row.get(4)?,
                })
            })
            .map_err(|e| format!("Search map failed: {e}"))?
            .filter_map(|r| r.ok())
            .collect();

        Ok(results)
    })
}
