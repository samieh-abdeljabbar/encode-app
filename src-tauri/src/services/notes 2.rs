use chrono::Utc;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};

#[derive(Serialize, Clone)]
pub struct NoteInfo {
    pub id: i64,
    pub title: String,
    pub file_path: String,
    pub subject_id: Option<i64>,
    pub subject_name: Option<String>,
    pub tags: Vec<String>,
    pub created_at: String,
    pub modified_at: String,
}

#[derive(Serialize)]
pub struct NoteDetail {
    pub info: NoteInfo,
    pub content: String,
}

#[derive(Serialize)]
pub struct NoteSearchResult {
    pub note_id: i64,
    pub title: String,
    pub snippet: String,
    pub file_path: String,
}

#[derive(Deserialize)]
pub struct Frontmatter {
    pub title: Option<String>,
    pub tags: Option<Vec<String>>,
    pub subject: Option<String>,
    pub created: Option<String>,
    pub modified: Option<String>,
}

pub fn content_hash(content: &str) -> String {
    let mut hasher = DefaultHasher::new();
    content.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

pub fn parse_frontmatter(content: &str) -> (Option<Frontmatter>, &str) {
    if !content.starts_with("---\n") && !content.starts_with("---\r\n") {
        return (None, content);
    }
    let rest = &content[4..];
    if let Some(end) = rest.find("\n---") {
        let yaml_str = &rest[..end];
        let body_start = end + 4;
        let body = rest[body_start..].trim_start_matches(['\n', '\r']);
        // Always strip the frontmatter text from body, even if YAML parsing fails
        match serde_yaml_ng::from_str::<Frontmatter>(yaml_str) {
            Ok(fm) => (Some(fm), body),
            Err(_) => (None, body), // Still return body WITHOUT frontmatter
        }
    } else {
        (None, content)
    }
}

pub fn build_frontmatter(
    title: &str,
    tags: &[String],
    subject: Option<&str>,
    created: &str,
    modified: &str,
) -> String {
    let mut fm = format!("---\ntitle: \"{}\"\n", title.replace('"', "\\\""));
    if !tags.is_empty() {
        fm.push_str("tags:\n");
        for tag in tags {
            fm.push_str(&format!("  - {}\n", tag));
        }
    }
    if let Some(s) = subject {
        fm.push_str(&format!("subject: \"{}\"\n", s.replace('"', "\\\"")));
    }
    fm.push_str(&format!(
        "created: {}\nmodified: {}\n",
        created, modified
    ));
    fm.push_str("---\n\n");
    fm
}

pub fn notes_dir(vault: &Path) -> PathBuf {
    vault.join("notes")
}

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

pub fn slugify(title: &str) -> String {
    let lower = title.to_lowercase();
    let slug: String = lower
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect();
    // Collapse multiple dashes and trim leading/trailing dashes
    let mut result = String::new();
    let mut prev_dash = false;
    for ch in slug.chars() {
        if ch == '-' {
            if !prev_dash && !result.is_empty() {
                result.push('-');
            }
            prev_dash = true;
        } else {
            result.push(ch);
            prev_dash = false;
        }
    }
    // Trim trailing dash
    if result.ends_with('-') {
        result.pop();
    }
    result
}

pub fn resolve_subject_id(conn: &Connection, subject_name: &str) -> Option<i64> {
    conn.query_row(
        "SELECT id FROM subjects WHERE name = ?1",
        [subject_name],
        |row| row.get(0),
    )
    .ok()
}

pub fn get_tags_for_note(conn: &Connection, note_id: i64) -> Vec<String> {
    let mut stmt = match conn.prepare("SELECT tag FROM note_tags WHERE note_id = ?1 ORDER BY tag") {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };
    let result = match stmt.query_map([note_id], |row| row.get::<_, String>(0)) {
        Ok(rows) => rows.filter_map(|r| r.ok()).collect(),
        Err(_) => Vec::new(),
    };
    result
}

pub fn index_note(
    conn: &Connection,
    note_id: i64,
    title: &str,
    body: &str,
    tags: &[String],
) -> Result<(), String> {
    // Upsert FTS: delete old entry then insert new
    conn.execute("DELETE FROM note_fts WHERE note_id = ?1", [note_id])
        .map_err(|e| format!("FTS delete failed: {e}"))?;
    conn.execute(
        "INSERT INTO note_fts (note_id, title, content) VALUES (?1, ?2, ?3)",
        rusqlite::params![note_id, title, body],
    )
    .map_err(|e| format!("FTS insert failed: {e}"))?;

    // Replace tags
    conn.execute("DELETE FROM note_tags WHERE note_id = ?1", [note_id])
        .map_err(|e| format!("Tags delete failed: {e}"))?;
    for tag in tags {
        conn.execute(
            "INSERT INTO note_tags (note_id, tag) VALUES (?1, ?2)",
            rusqlite::params![note_id, tag],
        )
        .map_err(|e| format!("Tag insert failed: {e}"))?;
    }

    Ok(())
}

pub fn note_info_from_row(
    conn: &Connection,
    id: i64,
    title: String,
    file_path: String,
    subject_id: Option<i64>,
    created_at: String,
    modified_at: String,
) -> NoteInfo {
    let tags = get_tags_for_note(conn, id);
    let subject_name = subject_id.and_then(|sid| {
        conn.query_row("SELECT name FROM subjects WHERE id = ?1", [sid], |row| {
            row.get(0)
        })
        .ok()
    });
    NoteInfo {
        id,
        title,
        file_path,
        subject_id,
        subject_name,
        tags,
        created_at,
        modified_at,
    }
}

// ---------------------------------------------------------------------------
// Public CRUD
// ---------------------------------------------------------------------------

pub fn create_note(
    conn: &Connection,
    vault: &Path,
    title: &str,
    folder: Option<&str>,
    subject_name: Option<&str>,
    body: &str,
) -> Result<NoteInfo, String> {
    let slug = slugify(title);
    let filename = format!("{slug}.md");
    let rel_path = match folder {
        Some(f) if !f.is_empty() => format!("{f}/{filename}"),
        _ => filename,
    };

    let now = Utc::now().format("%Y-%m-%dT%H:%M:%S").to_string();
    let subject_id = subject_name.and_then(|name| resolve_subject_id(conn, name));

    let frontmatter = build_frontmatter(title, &[], subject_name, &now, &now);
    let full_content = format!("{frontmatter}{body}");
    let hash = content_hash(&full_content);

    // Write file atomically
    let dir = match folder {
        Some(f) if !f.is_empty() => notes_dir(vault).join(f),
        _ => notes_dir(vault),
    };
    std::fs::create_dir_all(&dir).map_err(|e| format!("Failed to create dir: {e}"))?;

    let file_path = dir.join(format!("{slug}.md"));
    let tmp_path = dir.join(format!(".{slug}.md.tmp"));
    std::fs::write(&tmp_path, &full_content)
        .map_err(|e| format!("Failed to write temp file: {e}"))?;
    std::fs::rename(&tmp_path, &file_path)
        .map_err(|e| format!("Failed to rename temp file: {e}"))?;

    // Insert into SQLite
    conn.execute(
        "INSERT INTO notes (title, file_path, subject_id, content_hash, created_at, modified_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![title, rel_path, subject_id, hash, now, now],
    )
    .map_err(|e| format!("Failed to insert note: {e}"))?;

    let note_id = conn.last_insert_rowid();

    // Index for FTS
    index_note(conn, note_id, title, body, &[])?;

    // Parse and store wikilinks
    let targets = crate::services::note_links::parse_wikilinks(body);
    crate::services::note_links::update_links(conn, note_id, &targets)?;

    Ok(note_info_from_row(
        conn, note_id, title.to_string(), rel_path, subject_id, now.clone(), now,
    ))
}

pub fn get_note(conn: &Connection, vault: &Path, note_id: i64) -> Result<NoteDetail, String> {
    let (title, file_path, subject_id, created_at, modified_at): (
        String,
        String,
        Option<i64>,
        String,
        String,
    ) = conn
        .query_row(
            "SELECT title, file_path, subject_id, created_at, modified_at FROM notes WHERE id = ?1",
            [note_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
        )
        .map_err(|e| format!("Note not found: {e}"))?;

    let full_path = notes_dir(vault).join(&file_path);
    let raw_content = std::fs::read_to_string(&full_path)
        .map_err(|e| format!("Failed to read note file: {e}"))?;

    // Strip frontmatter — only return the body to the editor.
    // Also handle corrupted files with multiple frontmatter blocks by stripping repeatedly.
    let mut body = raw_content.as_str();
    loop {
        let (_, stripped) = parse_frontmatter(body);
        if stripped.len() == body.len() {
            break; // No more frontmatter to strip
        }
        body = stripped;
    }

    let info = note_info_from_row(conn, note_id, title, file_path, subject_id, created_at, modified_at);

    Ok(NoteDetail { info, content: body.to_string() })
}

pub fn update_note(
    conn: &Connection,
    vault: &Path,
    note_id: i64,
    new_body: &str,
) -> Result<NoteInfo, String> {
    let (title, file_path, subject_id, created_at, subject_name): (
        String,
        String,
        Option<i64>,
        String,
        Option<String>,
    ) = conn
        .query_row(
            "SELECT n.title, n.file_path, n.subject_id, n.created_at, s.name
             FROM notes n LEFT JOIN subjects s ON s.id = n.subject_id
             WHERE n.id = ?1",
            [note_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
        )
        .map_err(|e| format!("Note not found: {e}"))?;

    // Parse existing tags from current file to preserve them
    let full_path = notes_dir(vault).join(&file_path);
    let old_content = std::fs::read_to_string(&full_path)
        .map_err(|e| format!("Failed to read note file: {e}"))?;
    let (old_fm, _) = parse_frontmatter(&old_content);
    let tags: Vec<String> = old_fm.and_then(|fm| fm.tags).unwrap_or_default();

    let now = Utc::now().format("%Y-%m-%dT%H:%M:%S").to_string();
    let frontmatter = build_frontmatter(
        &title,
        &tags,
        subject_name.as_deref(),
        &created_at,
        &now,
    );
    let full_content = format!("{frontmatter}{new_body}");
    let hash = content_hash(&full_content);

    // Write file atomically
    let parent = full_path.parent().ok_or("No parent dir")?;
    let tmp_path = parent.join(format!(".{}.tmp", full_path.file_name().unwrap().to_string_lossy()));
    std::fs::write(&tmp_path, &full_content)
        .map_err(|e| format!("Failed to write temp file: {e}"))?;
    std::fs::rename(&tmp_path, &full_path)
        .map_err(|e| format!("Failed to rename temp file: {e}"))?;

    // Update SQLite
    conn.execute(
        "UPDATE notes SET content_hash = ?2, modified_at = ?3 WHERE id = ?1",
        rusqlite::params![note_id, hash, now],
    )
    .map_err(|e| format!("Failed to update note: {e}"))?;

    // Re-index
    index_note(conn, note_id, &title, new_body, &tags)?;

    // Update wikilinks
    let targets = crate::services::note_links::parse_wikilinks(new_body);
    crate::services::note_links::update_links(conn, note_id, &targets)?;

    Ok(note_info_from_row(
        conn, note_id, title, file_path, subject_id, created_at, now,
    ))
}

pub fn delete_note(
    conn: &Connection,
    vault: &Path,
    note_id: i64,
) -> Result<(), String> {
    let file_path: String = conn
        .query_row("SELECT file_path FROM notes WHERE id = ?1", [note_id], |row| {
            row.get(0)
        })
        .map_err(|e| format!("Note not found: {e}"))?;

    let full_path = notes_dir(vault).join(&file_path);
    if full_path.exists() {
        std::fs::remove_file(&full_path)
            .map_err(|e| format!("Failed to delete file: {e}"))?;
    }

    // Clean FTS
    conn.execute("DELETE FROM note_fts WHERE note_id = ?1", [note_id])
        .map_err(|e| format!("FTS delete failed: {e}"))?;

    // Delete from notes (cascades to note_tags, note_links)
    conn.execute("DELETE FROM notes WHERE id = ?1", [note_id])
        .map_err(|e| format!("Failed to delete note: {e}"))?;

    Ok(())
}

pub fn list_notes(
    conn: &Connection,
    folder: Option<&str>,
    subject_id: Option<i64>,
    tag: Option<&str>,
) -> Result<Vec<NoteInfo>, String> {
    let mut sql = String::from(
        "SELECT DISTINCT n.id, n.title, n.file_path, n.subject_id, n.created_at, n.modified_at
         FROM notes n",
    );

    let mut conditions: Vec<String> = Vec::new();
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    let mut param_idx = 1;

    if tag.is_some() {
        sql.push_str(" JOIN note_tags nt ON nt.note_id = n.id");
    }

    if let Some(f) = folder {
        conditions.push(format!("n.file_path LIKE ?{param_idx}"));
        params.push(Box::new(format!("{f}/%")));
        param_idx += 1;
    }

    if let Some(sid) = subject_id {
        conditions.push(format!("n.subject_id = ?{param_idx}"));
        params.push(Box::new(sid));
        param_idx += 1;
    }

    if let Some(t) = tag {
        conditions.push(format!("nt.tag = ?{param_idx}"));
        params.push(Box::new(t.to_string()));
        let _ = param_idx; // suppress unused warning
    }

    if !conditions.is_empty() {
        sql.push_str(" WHERE ");
        sql.push_str(&conditions.join(" AND "));
    }

    sql.push_str(" ORDER BY n.modified_at DESC");

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();

    let notes = stmt
        .query_map(param_refs.as_slice(), |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<i64>>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .map(|(id, title, file_path, subject_id, created_at, modified_at)| {
            note_info_from_row(conn, id, title, file_path, subject_id, created_at, modified_at)
        })
        .collect();

    Ok(notes)
}

pub fn search_notes(conn: &Connection, query: &str) -> Result<Vec<NoteSearchResult>, String> {
    // Sanitize: wrap each term in quotes to prevent FTS5 syntax injection
    let safe_query: String = query
        .split_whitespace()
        .map(|term| format!("\"{}\"", term.replace('"', "")))
        .collect::<Vec<_>>()
        .join(" ");

    if safe_query.is_empty() {
        return Ok(Vec::new());
    }

    let mut stmt = conn
        .prepare(
            "SELECT f.note_id, n.title, snippet(note_fts, 2, '<mark>', '</mark>', '...', 32), n.file_path
             FROM note_fts f
             JOIN notes n ON n.id = f.note_id
             WHERE note_fts MATCH ?1
             ORDER BY rank
             LIMIT 50",
        )
        .map_err(|e| format!("Search prepare failed: {e}"))?;

    let results = stmt
        .query_map([&safe_query], |row| {
            Ok(NoteSearchResult {
                note_id: row.get(0)?,
                title: row.get(1)?,
                snippet: row.get(2)?,
                file_path: row.get(3)?,
            })
        })
        .map_err(|e| format!("Search query failed: {e}"))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(results)
}

pub fn rename_note(
    conn: &Connection,
    vault: &Path,
    note_id: i64,
    new_title: &str,
) -> Result<NoteInfo, String> {
    let (old_title, old_file_path, subject_id, created_at, subject_name): (
        String,
        String,
        Option<i64>,
        String,
        Option<String>,
    ) = conn
        .query_row(
            "SELECT n.title, n.file_path, n.subject_id, n.created_at, s.name
             FROM notes n LEFT JOIN subjects s ON s.id = n.subject_id
             WHERE n.id = ?1",
            [note_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
        )
        .map_err(|e| format!("Note not found: {e}"))?;

    let new_slug = slugify(new_title);
    let new_filename = format!("{new_slug}.md");

    // Determine folder from old path
    let old_path = PathBuf::from(&old_file_path);
    let folder = old_path.parent().and_then(|p| {
        let s = p.to_string_lossy().to_string();
        if s.is_empty() || s == "." { None } else { Some(s) }
    });

    let new_rel_path = match &folder {
        Some(f) => format!("{f}/{new_filename}"),
        None => new_filename,
    };

    // Read existing file to get body and tags
    let old_full_path = notes_dir(vault).join(&old_file_path);
    let old_content = std::fs::read_to_string(&old_full_path)
        .map_err(|e| format!("Failed to read note file: {e}"))?;
    let (old_fm, body) = parse_frontmatter(&old_content);
    let tags: Vec<String> = old_fm.and_then(|fm| fm.tags).unwrap_or_default();

    let now = Utc::now().format("%Y-%m-%dT%H:%M:%S").to_string();
    let frontmatter = build_frontmatter(new_title, &tags, subject_name.as_deref(), &created_at, &now);
    let full_content = format!("{frontmatter}{body}");
    let hash = content_hash(&full_content);

    // Write new file
    let new_full_path = notes_dir(vault).join(&new_rel_path);
    let parent = new_full_path.parent().ok_or("No parent dir")?;
    std::fs::create_dir_all(parent).map_err(|e| format!("Failed to create dir: {e}"))?;
    let tmp_path = parent.join(format!(".{new_slug}.md.tmp"));
    std::fs::write(&tmp_path, &full_content)
        .map_err(|e| format!("Failed to write temp file: {e}"))?;
    std::fs::rename(&tmp_path, &new_full_path)
        .map_err(|e| format!("Failed to rename temp file: {e}"))?;

    // Delete old file (if it's different from new)
    if old_full_path != new_full_path && old_full_path.exists() {
        std::fs::remove_file(&old_full_path)
            .map_err(|e| format!("Failed to remove old file: {e}"))?;
    }

    // Update SQLite
    conn.execute(
        "UPDATE notes SET title = ?2, file_path = ?3, content_hash = ?4, modified_at = ?5 WHERE id = ?1",
        rusqlite::params![note_id, new_title, new_rel_path, hash, now],
    )
    .map_err(|e| format!("Failed to update note: {e}"))?;

    // Re-index
    index_note(conn, note_id, new_title, body, &tags)?;

    // Update backlinks: find all notes that link to old_title and update them
    let mut link_stmt = conn
        .prepare(
            "SELECT DISTINCT nl.source_note_id, n.file_path
             FROM note_links nl
             JOIN notes n ON n.id = nl.source_note_id
             WHERE nl.target_title = ?1",
        )
        .map_err(|e| format!("Backlink query failed: {e}"))?;

    let linking_notes: Vec<(i64, String)> = link_stmt
        .query_map([&old_title], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    for (linking_id, linking_path) in &linking_notes {
        let linking_full = notes_dir(vault).join(linking_path);
        if let Ok(linking_content) = std::fs::read_to_string(&linking_full) {
            let updated = linking_content.replace(
                &format!("[[{old_title}]]"),
                &format!("[[{new_title}]]"),
            );
            if updated != linking_content {
                let link_parent = linking_full.parent().ok_or("No parent dir")?;
                let link_tmp = link_parent.join(format!(
                    ".{}.tmp",
                    linking_full.file_name().unwrap().to_string_lossy()
                ));
                std::fs::write(&link_tmp, &updated)
                    .map_err(|e| format!("Failed to write backlink temp: {e}"))?;
                std::fs::rename(&link_tmp, &linking_full)
                    .map_err(|e| format!("Failed to rename backlink temp: {e}"))?;

                // Update hash in DB
                let link_hash = content_hash(&updated);
                conn.execute(
                    "UPDATE notes SET content_hash = ?2, modified_at = ?3 WHERE id = ?1",
                    rusqlite::params![linking_id, link_hash, now],
                )
                .map_err(|e| format!("Failed to update linking note: {e}"))?;
            }
        }
    }

    // Update note_links.target_title for all links pointing to old title
    conn.execute(
        "UPDATE note_links SET target_title = ?2 WHERE target_title = ?1",
        rusqlite::params![old_title, new_title],
    )
    .map_err(|e| format!("Failed to update link targets: {e}"))?;

    Ok(note_info_from_row(
        conn, note_id, new_title.to_string(), new_rel_path, subject_id, created_at, now,
    ))
}

pub fn move_note(
    conn: &Connection,
    vault: &Path,
    note_id: i64,
    target_folder: Option<&str>,
) -> Result<NoteInfo, String> {
    let (title, old_file_path, subject_id, created_at): (
        String,
        String,
        Option<i64>,
        String,
    ) = conn
        .query_row(
            "SELECT title, file_path, subject_id, created_at
             FROM notes WHERE id = ?1",
            [note_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .map_err(|e| format!("Note not found: {e}"))?;

    // Determine filename from old path
    let old_path = PathBuf::from(&old_file_path);
    let filename = old_path
        .file_name()
        .ok_or("No filename")?
        .to_string_lossy()
        .to_string();

    let new_rel_path = match target_folder {
        Some(f) if !f.is_empty() => format!("{f}/{filename}"),
        _ => filename.clone(),
    };

    // If the path is the same, nothing to do
    if new_rel_path == old_file_path {
        return Ok(note_info_from_row(
            conn, note_id, title, old_file_path, subject_id, created_at.clone(), created_at,
        ));
    }

    // Read existing file content
    let old_full_path = notes_dir(vault).join(&old_file_path);
    let content = std::fs::read_to_string(&old_full_path)
        .map_err(|e| format!("Failed to read note file: {e}"))?;
    let hash = content_hash(&content);

    // Write to new location
    let new_full_path = notes_dir(vault).join(&new_rel_path);
    let parent = new_full_path.parent().ok_or("No parent dir")?;
    std::fs::create_dir_all(parent).map_err(|e| format!("Failed to create dir: {e}"))?;

    let slug = new_full_path
        .file_stem()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    let tmp_path = parent.join(format!(".{slug}.md.tmp"));
    std::fs::write(&tmp_path, &content)
        .map_err(|e| format!("Failed to write temp file: {e}"))?;
    std::fs::rename(&tmp_path, &new_full_path)
        .map_err(|e| format!("Failed to rename temp file: {e}"))?;

    // Delete old file (if different)
    if old_full_path != new_full_path && old_full_path.exists() {
        std::fs::remove_file(&old_full_path)
            .map_err(|e| format!("Failed to remove old file: {e}"))?;
    }

    let now = Utc::now().format("%Y-%m-%dT%H:%M:%S").to_string();

    // Update SQLite
    conn.execute(
        "UPDATE notes SET file_path = ?2, content_hash = ?3, modified_at = ?4 WHERE id = ?1",
        rusqlite::params![note_id, new_rel_path, hash, now],
    )
    .map_err(|e| format!("Failed to update note: {e}"))?;

    Ok(note_info_from_row(
        conn, note_id, title, new_rel_path, subject_id, created_at, now,
    ))
}

pub fn delete_folder(vault: &Path, folder: &str) -> Result<(), String> {
    let dir = notes_dir(vault).join(folder);
    if !dir.exists() {
        return Ok(());
    }
    // Only delete if empty (no files inside)
    let has_files = std::fs::read_dir(&dir)
        .map_err(|e| format!("Failed to read folder: {e}"))?
        .any(|entry| {
            entry
                .ok()
                .map(|e| e.file_type().ok().map(|ft| ft.is_file()).unwrap_or(false))
                .unwrap_or(false)
        });
    if has_files {
        return Err("Folder is not empty — move or delete its notes first".to_string());
    }
    std::fs::remove_dir_all(&dir).map_err(|e| format!("Failed to delete folder: {e}"))?;
    Ok(())
}

pub fn list_folders(vault: &Path) -> Result<Vec<String>, String> {
    let base = notes_dir(vault);
    if !base.exists() {
        return Ok(Vec::new());
    }

    let mut folders = Vec::new();
    for entry in walkdir::WalkDir::new(&base)
        .min_depth(1)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        if entry.file_type().is_dir() {
            if let Ok(rel) = entry.path().strip_prefix(&base) {
                folders.push(rel.to_string_lossy().to_string());
            }
        }
    }
    folders.sort();
    Ok(folders)
}

pub fn create_folder(vault: &Path, path: &str) -> Result<(), String> {
    let dir = notes_dir(vault).join(path);
    std::fs::create_dir_all(&dir).map_err(|e| format!("Failed to create folder: {e}"))
}

pub fn get_note_titles(conn: &Connection) -> Result<Vec<(i64, String)>, String> {
    let mut stmt = conn
        .prepare("SELECT id, title FROM notes ORDER BY title")
        .map_err(|e| e.to_string())?;
    let titles = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(titles)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;

    fn setup() -> (Database, tempfile::TempDir) {
        let db = Database::open_memory().expect("open");
        db.with_conn(|conn| {
            conn.execute(
                "INSERT INTO subjects (slug, name, created_at) VALUES ('cs', 'Computer Science', datetime('now'))",
                [],
            ).unwrap();
            Ok(())
        }).expect("setup");
        let tmp = tempfile::tempdir().expect("tmpdir");
        std::fs::create_dir_all(tmp.path().join("notes")).unwrap();
        (db, tmp)
    }

    #[test]
    fn test_content_hash_deterministic() {
        let h1 = content_hash("hello");
        let h2 = content_hash("hello");
        assert_eq!(h1, h2);
        assert_ne!(content_hash("hello"), content_hash("world"));
    }

    #[test]
    fn test_parse_frontmatter_basic() {
        let content =
            "---\ntitle: \"My Note\"\ntags:\n  - rust\n  - test\n---\n\nBody content here.";
        let (fm, body) = parse_frontmatter(content);
        assert!(fm.is_some());
        let fm = fm.unwrap();
        assert_eq!(fm.title.unwrap(), "My Note");
        assert_eq!(fm.tags.unwrap(), vec!["rust", "test"]);
        assert_eq!(body, "Body content here.");
    }

    #[test]
    fn test_parse_frontmatter_no_frontmatter() {
        let content = "Just plain text";
        let (fm, body) = parse_frontmatter(content);
        assert!(fm.is_none());
        assert_eq!(body, "Just plain text");
    }

    #[test]
    fn test_build_frontmatter() {
        let fm = build_frontmatter(
            "Test",
            &["rust".to_string()],
            Some("CS"),
            "2026-01-01",
            "2026-01-02",
        );
        assert!(fm.contains("title: \"Test\""));
        assert!(fm.contains("- rust"));
        assert!(fm.contains("subject: \"CS\""));
        assert!(fm.starts_with("---\n"));
        assert!(fm.contains("---\n\n"));
    }

    #[test]
    fn test_slugify() {
        assert_eq!(slugify("My Note"), "my-note");
        assert_eq!(slugify("Hello   World!"), "hello-world");
        assert_eq!(slugify("Rust & Systems"), "rust-systems");
        assert_eq!(slugify("  Leading Spaces  "), "leading-spaces");
    }

    #[test]
    fn test_create_note_writes_file_and_indexes() {
        let (db, tmp) = setup();
        db.with_conn(|conn| {
            let note = create_note(conn, tmp.path(), "My Note", None, None, "Hello world").unwrap();
            assert_eq!(note.title, "My Note");
            assert!(note.file_path.ends_with("my-note.md"));
            let full_path = tmp.path().join("notes").join(&note.file_path);
            assert!(full_path.exists());
            let content = std::fs::read_to_string(&full_path).unwrap();
            assert!(content.contains("title: \"My Note\""));
            assert!(content.contains("Hello world"));
            Ok(())
        }).expect("test failed");
    }

    #[test]
    fn test_get_note_returns_content() {
        let (db, tmp) = setup();
        db.with_conn(|conn| {
            let note = create_note(conn, tmp.path(), "Test Note", None, None, "Body text").unwrap();
            let detail = get_note(conn, tmp.path(), note.id).unwrap();
            assert_eq!(detail.info.title, "Test Note");
            assert!(detail.content.contains("Body text"));
            Ok(())
        }).expect("test failed");
    }

    #[test]
    fn test_create_note_in_folder() {
        let (db, tmp) = setup();
        db.with_conn(|conn| {
            let note = create_note(conn, tmp.path(), "Sub Note", Some("project/ideas"), None, "In subfolder").unwrap();
            assert!(note.file_path.starts_with("project/ideas/"));
            let full_path = tmp.path().join("notes").join(&note.file_path);
            assert!(full_path.exists());
            Ok(())
        }).expect("test failed");
    }

    #[test]
    fn test_delete_note_removes_file_and_index() {
        let (db, tmp) = setup();
        db.with_conn(|conn| {
            let note = create_note(conn, tmp.path(), "To Delete", None, None, "Gone").unwrap();
            let full_path = tmp.path().join("notes").join(&note.file_path);
            assert!(full_path.exists());
            delete_note(conn, tmp.path(), note.id).unwrap();
            assert!(!full_path.exists());
            let count: i64 = conn.query_row("SELECT COUNT(*) FROM notes WHERE id = ?1", [note.id], |r| r.get(0)).unwrap();
            assert_eq!(count, 0);
            Ok(())
        }).expect("test failed");
    }

    #[test]
    fn test_list_notes_filters() {
        let (db, tmp) = setup();
        db.with_conn(|conn| {
            create_note(conn, tmp.path(), "Root Note", None, None, "At root").unwrap();
            create_note(conn, tmp.path(), "Project Note", Some("projects"), None, "In projects").unwrap();
            let all = list_notes(conn, None, None, None).unwrap();
            assert_eq!(all.len(), 2);
            let filtered = list_notes(conn, Some("projects"), None, None).unwrap();
            assert_eq!(filtered.len(), 1);
            assert_eq!(filtered[0].title, "Project Note");
            Ok(())
        }).expect("test failed");
    }

    #[test]
    fn test_search_notes() {
        let (db, tmp) = setup();
        db.with_conn(|conn| {
            create_note(conn, tmp.path(), "Rust Guide", None, None, "Rust is a systems programming language").unwrap();
            create_note(conn, tmp.path(), "Python Guide", None, None, "Python is great for scripting").unwrap();
            let results = search_notes(conn, "systems programming").unwrap();
            assert_eq!(results.len(), 1);
            assert_eq!(results[0].title, "Rust Guide");
            Ok(())
        }).expect("test failed");
    }

    #[test]
    fn test_rename_note() {
        let (db, tmp) = setup();
        db.with_conn(|conn| {
            let note = create_note(conn, tmp.path(), "Old Title", None, None, "Content").unwrap();
            let renamed = rename_note(conn, tmp.path(), note.id, "New Title").unwrap();
            assert_eq!(renamed.title, "New Title");
            assert!(renamed.file_path.contains("new-title"));
            // Old file should be gone
            let old_path = tmp.path().join("notes").join(&note.file_path);
            assert!(!old_path.exists());
            // New file should exist
            let new_path = tmp.path().join("notes").join(&renamed.file_path);
            assert!(new_path.exists());
            Ok(())
        }).expect("test failed");
    }
}
