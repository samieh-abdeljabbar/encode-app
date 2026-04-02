# Obsidian-Style Notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a personal wiki with markdown files on disk, `[[wikilinks]]`, backlinks, tags, full-text search, and interactive force-directed graph view — integrated into the Encode app.

**Architecture:** Markdown files in `~/Encode/notes/` are the source of truth. SQLite indexes metadata (titles, tags, links, FTS5) for fast search, backlink resolution, and graph queries. A Rust service handles CRUD + indexing. Frontend has 3 new pages (notes explorer, note editor, graph view) plus CodeMirror 6 extensions for wikilink/tag autocomplete.

**Tech Stack:** Rust/rusqlite (backend), React/TypeScript (frontend), CodeMirror 6 (editor), react-force-graph-2d (graph), Tauri IPC

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `src-tauri/migrations/004_notes.sql` | Notes tables + FTS5 |
| Create | `src-tauri/src/services/notes.rs` | Note CRUD, file I/O, indexing, frontmatter parsing |
| Create | `src-tauri/src/services/note_links.rs` | Wikilink parsing, backlink queries, graph data |
| Create | `src-tauri/src/commands/notes.rs` | Tauri IPC commands |
| Create | `src/pages/Notes.tsx` | Notes explorer page (file tree + list) |
| Create | `src/pages/NoteEditor.tsx` | Note editor page with backlinks sidebar |
| Create | `src/pages/Graph.tsx` | Interactive graph view |
| Create | `src/components/notes/FileTree.tsx` | Folder/file tree sidebar |
| Create | `src/components/notes/BacklinksPanel.tsx` | Linked + unlinked mentions panel |
| Create | `src/components/editor/cm-wikilink.ts` | CM6 wikilink autocomplete + decoration |
| Modify | `src-tauri/src/db/migrations.rs` | Register migration 004 |
| Modify | `src-tauri/src/services/mod.rs` | Add `pub mod notes; pub mod note_links;` |
| Modify | `src-tauri/src/commands/mod.rs` | Add `pub mod notes;` |
| Modify | `src-tauri/src/lib.rs` | Register all notes commands, ensure `~/Encode/notes/` dir |
| Modify | `src/lib/tauri.ts` | Add notes types + IPC wrappers |
| Modify | `src/App.tsx` | Add `/notes`, `/notes/:id`, `/graph` routes |
| Modify | `src/components/layout/Ribbon.tsx` | Add Notes icon |
| Modify | `src/components/layout/QuickSwitcher.tsx` | Include notes in search |
| Modify | `package.json` | Add `react-force-graph-2d` dependency |

---

### Task 1: Database Migration + Notes Service Types

**Files:**
- Create: `src-tauri/migrations/004_notes.sql`
- Create: `src-tauri/src/services/notes.rs`
- Create: `src-tauri/src/services/note_links.rs`
- Modify: `src-tauri/src/db/migrations.rs`
- Modify: `src-tauri/src/services/mod.rs`

- [ ] **Step 1: Create migration file**

Write `src-tauri/migrations/004_notes.sql`:

```sql
CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    file_path TEXT NOT NULL UNIQUE,
    subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
    content_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    modified_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS note_tags (
    note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    tag TEXT NOT NULL,
    PRIMARY KEY (note_id, tag)
);

CREATE TABLE IF NOT EXISTS note_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    target_title TEXT NOT NULL,
    target_note_id INTEGER REFERENCES notes(id) ON DELETE SET NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS note_fts USING fts5(
    note_id UNINDEXED, title, content, tokenize='porter'
);
```

- [ ] **Step 2: Register migration in `migrations.rs`**

Add to the `MIGRATIONS` array:

```rust
(4, include_str!("../../migrations/004_notes.sql")),
```

Update the idempotency test assertion from `assert_eq!(version, 3)` to `assert_eq!(version, 4)`.

- [ ] **Step 3: Create `notes.rs` with types only**

Write `src-tauri/src/services/notes.rs`:

```rust
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

/// Parse YAML frontmatter from markdown content.
/// Returns (frontmatter, body) where body is content after the closing ---.
pub fn parse_frontmatter(content: &str) -> (Option<Frontmatter>, &str) {
    if !content.starts_with("---\n") && !content.starts_with("---\r\n") {
        return (None, content);
    }
    // Find the closing ---
    let rest = &content[4..]; // skip opening "---\n"
    if let Some(end) = rest.find("\n---") {
        let yaml_str = &rest[..end];
        let body_start = end + 4; // skip "\n---"
        let body = rest[body_start..].trim_start_matches(['\n', '\r']);
        match serde_yaml_ng::from_str::<Frontmatter>(yaml_str) {
            Ok(fm) => (Some(fm), body),
            Err(_) => (None, content),
        }
    } else {
        (None, content)
    }
}

/// Build frontmatter YAML string.
pub fn build_frontmatter(title: &str, tags: &[String], subject: Option<&str>, created: &str, modified: &str) -> String {
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
    fm.push_str(&format!("created: {}\nmodified: {}\n", created, modified));
    fm.push_str("---\n\n");
    fm
}

pub fn notes_dir(vault: &Path) -> PathBuf {
    vault.join("notes")
}
```

- [ ] **Step 4: Create `note_links.rs` with types and parse function**

Write `src-tauri/src/services/note_links.rs`:

```rust
use regex::Regex;
use rusqlite::Connection;
use serde::Serialize;
use std::sync::LazyLock;

static WIKILINK_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\[\[([^\]|]+)(?:\|[^\]]+)?\]\]").unwrap());

#[derive(Serialize)]
pub struct BacklinkInfo {
    pub note_id: i64,
    pub title: String,
    pub context: String,
}

#[derive(Serialize)]
pub struct LinkInfo {
    pub target_title: String,
    pub target_note_id: Option<i64>,
    pub resolved: bool,
}

#[derive(Serialize, Clone)]
pub struct GraphNode {
    pub id: i64,
    pub title: String,
    pub subject_id: Option<i64>,
    pub link_count: i32,
}

#[derive(Serialize, Clone)]
pub struct GraphEdge {
    pub source: i64,
    pub target: i64,
}

#[derive(Serialize)]
pub struct GraphData {
    pub nodes: Vec<GraphNode>,
    pub edges: Vec<GraphEdge>,
}

/// Extract all [[wikilink]] targets from markdown content.
/// Handles [[target]] and [[target|display text]] syntax.
pub fn parse_wikilinks(content: &str) -> Vec<String> {
    WIKILINK_RE
        .captures_iter(content)
        .map(|cap| cap[1].trim().to_string())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_wikilinks_basic() {
        let content = "See [[Binary Trees]] for details.";
        let links = parse_wikilinks(content);
        assert_eq!(links, vec!["Binary Trees"]);
    }

    #[test]
    fn test_parse_wikilinks_with_alias() {
        let content = "Check [[Binary Trees|trees]] and [[Graphs]].";
        let links = parse_wikilinks(content);
        assert_eq!(links, vec!["Binary Trees", "Graphs"]);
    }

    #[test]
    fn test_parse_wikilinks_empty() {
        let links = parse_wikilinks("No links here.");
        assert!(links.is_empty());
    }

    #[test]
    fn test_parse_wikilinks_multiple() {
        let content = "[[A]] links to [[B]] and [[C|see C]].";
        let links = parse_wikilinks(content);
        assert_eq!(links, vec!["A", "B", "C"]);
    }
}
```

- [ ] **Step 5: Register modules**

Add to `src-tauri/src/services/mod.rs`:
```rust
pub mod notes;
pub mod note_links;
```

- [ ] **Step 6: Add `serde_yaml_ng` dependency**

Add to `src-tauri/Cargo.toml` under `[dependencies]`:
```toml
serde_yaml_ng = "0.10"
```

- [ ] **Step 7: Run tests**

Run: `cd src-tauri && cargo test`

Expected: All tests pass including migration idempotency and wikilink parsing

- [ ] **Step 8: Commit**

```bash
git add src-tauri/migrations/004_notes.sql src-tauri/src/services/notes.rs src-tauri/src/services/note_links.rs src-tauri/src/services/mod.rs src-tauri/src/db/migrations.rs src-tauri/Cargo.toml
git commit -m "feat(notes): add migration, types, frontmatter parser, wikilink parser"
```

---

### Task 2: Notes Service — CRUD Operations

**Files:**
- Modify: `src-tauri/src/services/notes.rs`

- [ ] **Step 1: Write tests for create and get**

Add to bottom of `notes.rs`:

```rust
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
    fn test_create_note_writes_file_and_indexes() {
        let (db, tmp) = setup();
        db.with_conn(|conn| {
            let note = create_note(conn, tmp.path(), "My Note", None, None, "Hello world").unwrap();
            assert_eq!(note.title, "My Note");
            assert!(note.file_path.ends_with("my-note.md"));

            // File should exist
            let full_path = tmp.path().join("notes").join(&note.file_path);
            assert!(full_path.exists());

            // Content should have frontmatter
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
            let note = create_note(conn, tmp.path(), "Test Note", None, None, "Body text here").unwrap();
            let detail = get_note(conn, tmp.path(), note.id).unwrap();
            assert_eq!(detail.info.title, "Test Note");
            assert!(detail.content.contains("Body text here"));
            Ok(())
        }).expect("test failed");
    }

    #[test]
    fn test_create_note_in_folder() {
        let (db, tmp) = setup();
        db.with_conn(|conn| {
            let note = create_note(conn, tmp.path(), "Sub Note", Some("project/ideas"), None, "In a subfolder").unwrap();
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
            let note = create_note(conn, tmp.path(), "To Delete", None, None, "Gone soon").unwrap();
            let full_path = tmp.path().join("notes").join(&note.file_path);
            assert!(full_path.exists());

            delete_note(conn, tmp.path(), note.id).unwrap();
            assert!(!full_path.exists());

            // Should not be in DB
            let count: i64 = conn.query_row(
                "SELECT COUNT(*) FROM notes WHERE id = ?1", [note.id], |r| r.get(0)
            ).unwrap();
            assert_eq!(count, 0);
            Ok(())
        }).expect("test failed");
    }

    #[test]
    fn test_list_notes_filters_by_folder() {
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
}
```

- [ ] **Step 2: Implement CRUD functions**

Add these functions to `notes.rs` before `#[cfg(test)]`:

```rust
fn slugify(title: &str) -> String {
    title
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}

fn resolve_subject_id(conn: &Connection, subject_name: Option<&str>) -> Option<i64> {
    subject_name.and_then(|name| {
        conn.query_row(
            "SELECT id FROM subjects WHERE name = ?1",
            [name],
            |row| row.get(0),
        ).ok()
    })
}

fn get_tags_for_note(conn: &Connection, note_id: i64) -> Vec<String> {
    let mut stmt = conn.prepare("SELECT tag FROM note_tags WHERE note_id = ?1 ORDER BY tag").unwrap();
    stmt.query_map([note_id], |row| row.get(0))
        .unwrap()
        .filter_map(|r| r.ok())
        .collect()
}

fn index_note(conn: &Connection, note_id: i64, title: &str, body: &str, tags: &[String]) -> Result<(), String> {
    // Update FTS
    conn.execute("DELETE FROM note_fts WHERE note_id = ?1", [note_id])
        .map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO note_fts (note_id, title, content) VALUES (?1, ?2, ?3)",
        rusqlite::params![note_id, title, body],
    ).map_err(|e| e.to_string())?;

    // Update tags
    conn.execute("DELETE FROM note_tags WHERE note_id = ?1", [note_id])
        .map_err(|e| e.to_string())?;
    for tag in tags {
        conn.execute(
            "INSERT OR IGNORE INTO note_tags (note_id, tag) VALUES (?1, ?2)",
            rusqlite::params![note_id, tag.to_lowercase()],
        ).map_err(|e| e.to_string())?;
    }

    Ok(())
}

fn note_info_from_row(conn: &Connection, id: i64, title: String, file_path: String, subject_id: Option<i64>, created_at: String, modified_at: String) -> NoteInfo {
    let subject_name: Option<String> = subject_id.and_then(|sid| {
        conn.query_row("SELECT name FROM subjects WHERE id = ?1", [sid], |r| r.get(0)).ok()
    });
    let tags = get_tags_for_note(conn, id);
    NoteInfo { id, title, file_path, subject_id, subject_name, tags, created_at, modified_at }
}

pub fn create_note(
    conn: &Connection,
    vault: &Path,
    title: &str,
    folder: Option<&str>,
    subject_name: Option<&str>,
    body: &str,
) -> Result<NoteInfo, String> {
    let slug = slugify(title);
    let file_name = format!("{slug}.md");
    let relative_path = match folder {
        Some(f) => format!("{}/{}", f.trim_matches('/'), file_name),
        None => file_name,
    };

    let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S").to_string();
    let subject_id = resolve_subject_id(conn, subject_name);
    let tags: Vec<String> = Vec::new();

    let frontmatter = build_frontmatter(title, &tags, subject_name, &now, &now);
    let full_content = format!("{frontmatter}{body}");
    let hash = content_hash(&full_content);

    // Write file
    let full_path = notes_dir(vault).join(&relative_path);
    if let Some(parent) = full_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Failed to create folder: {e}"))?;
    }
    std::fs::write(&full_path, &full_content).map_err(|e| format!("Failed to write note: {e}"))?;

    // Insert into SQLite
    conn.execute(
        "INSERT INTO notes (title, file_path, subject_id, content_hash, created_at, modified_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
        rusqlite::params![title, relative_path, subject_id, hash, now],
    ).map_err(|e| format!("Failed to index note: {e}"))?;

    let id = conn.last_insert_rowid();
    index_note(conn, id, title, body, &tags)?;

    Ok(note_info_from_row(conn, id, title.to_string(), relative_path, subject_id, now.clone(), now))
}

pub fn get_note(conn: &Connection, vault: &Path, note_id: i64) -> Result<NoteDetail, String> {
    let (title, file_path, subject_id, created_at, modified_at): (String, String, Option<i64>, String, String) = conn
        .query_row(
            "SELECT title, file_path, subject_id, created_at, modified_at FROM notes WHERE id = ?1",
            [note_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
        )
        .map_err(|e| format!("Note not found: {e}"))?;

    let full_path = notes_dir(vault).join(&file_path);
    let raw_content = std::fs::read_to_string(&full_path)
        .map_err(|e| format!("Failed to read note file: {e}"))?;

    let (_, body) = parse_frontmatter(&raw_content);
    let info = note_info_from_row(conn, note_id, title, file_path, subject_id, created_at, modified_at);

    Ok(NoteDetail { info, content: body.to_string() })
}

pub fn update_note(
    conn: &Connection,
    vault: &Path,
    note_id: i64,
    new_body: &str,
) -> Result<NoteInfo, String> {
    let (title, file_path, subject_id, created_at): (String, String, Option<i64>, String) = conn
        .query_row(
            "SELECT title, file_path, subject_id, created_at FROM notes WHERE id = ?1",
            [note_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .map_err(|e| format!("Note not found: {e}"))?;

    let tags = get_tags_for_note(conn, note_id);
    let subject_name: Option<String> = subject_id.and_then(|sid| {
        conn.query_row("SELECT name FROM subjects WHERE id = ?1", [sid], |r| r.get(0)).ok()
    });

    let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S").to_string();
    let frontmatter = build_frontmatter(&title, &tags, subject_name.as_deref(), &created_at, &now);
    let full_content = format!("{frontmatter}{new_body}");
    let hash = content_hash(&full_content);

    let full_path = notes_dir(vault).join(&file_path);
    std::fs::write(&full_path, &full_content).map_err(|e| format!("Failed to write note: {e}"))?;

    conn.execute(
        "UPDATE notes SET content_hash = ?2, modified_at = ?3 WHERE id = ?1",
        rusqlite::params![note_id, hash, now],
    ).map_err(|e| e.to_string())?;

    index_note(conn, note_id, &title, new_body, &tags)?;

    // Update links
    let links = crate::services::note_links::parse_wikilinks(new_body);
    crate::services::note_links::update_links(conn, note_id, &links)?;

    Ok(note_info_from_row(conn, note_id, title, file_path, subject_id, created_at, now))
}

pub fn delete_note(conn: &Connection, vault: &Path, note_id: i64) -> Result<(), String> {
    let file_path: String = conn
        .query_row("SELECT file_path FROM notes WHERE id = ?1", [note_id], |row| row.get(0))
        .map_err(|e| format!("Note not found: {e}"))?;

    let full_path = notes_dir(vault).join(&file_path);
    if full_path.exists() {
        std::fs::remove_file(&full_path).map_err(|e| format!("Failed to delete file: {e}"))?;
    }

    conn.execute("DELETE FROM note_fts WHERE note_id = ?1", [note_id]).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM notes WHERE id = ?1", [note_id]).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn list_notes(
    conn: &Connection,
    folder: Option<&str>,
    subject_id: Option<i64>,
    tag: Option<&str>,
) -> Result<Vec<NoteInfo>, String> {
    let mut conditions = Vec::new();
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(f) = folder {
        conditions.push(format!("n.file_path LIKE ?{}", params.len() + 1));
        params.push(Box::new(format!("{}/%", f.trim_matches('/'))));
    }
    if let Some(sid) = subject_id {
        conditions.push(format!("n.subject_id = ?{}", params.len() + 1));
        params.push(Box::new(sid));
    }
    if let Some(t) = tag {
        conditions.push(format!("EXISTS (SELECT 1 FROM note_tags nt WHERE nt.note_id = n.id AND nt.tag = ?{})", params.len() + 1));
        params.push(Box::new(t.to_lowercase()));
    }

    let where_clause = if conditions.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", conditions.join(" AND "))
    };

    let query = format!(
        "SELECT n.id, n.title, n.file_path, n.subject_id, n.created_at, n.modified_at
         FROM notes n {where_clause}
         ORDER BY n.modified_at DESC
         LIMIT 200"
    );

    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();

    let rows = stmt
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
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let notes = rows.into_iter()
        .map(|(id, title, file_path, subject_id, created_at, modified_at)| {
            note_info_from_row(conn, id, title, file_path, subject_id, created_at, modified_at)
        })
        .collect();

    Ok(notes)
}

pub fn search_notes(conn: &Connection, query: &str) -> Result<Vec<NoteSearchResult>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT f.note_id, n.title, snippet(note_fts, 2, '<b>', '</b>', '...', 32), n.file_path
             FROM note_fts f
             JOIN notes n ON n.id = f.note_id
             WHERE note_fts MATCH ?1
             ORDER BY rank
             LIMIT 50"
        )
        .map_err(|e| e.to_string())?;

    let results = stmt
        .query_map([query], |row| {
            Ok(NoteSearchResult {
                note_id: row.get(0)?,
                title: row.get(1)?,
                snippet: row.get(2)?,
                file_path: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(results)
}

pub fn rename_note(
    conn: &Connection,
    vault: &Path,
    note_id: i64,
    new_title: &str,
) -> Result<NoteInfo, String> {
    let (old_title, old_path, subject_id, created_at): (String, String, Option<i64>, String) = conn
        .query_row(
            "SELECT title, file_path, subject_id, created_at FROM notes WHERE id = ?1",
            [note_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .map_err(|e| format!("Note not found: {e}"))?;

    let new_slug = slugify(new_title);
    let old_file = Path::new(&old_path);
    let parent = old_file.parent().map(|p| p.to_str().unwrap_or("")).unwrap_or("");
    let new_relative = if parent.is_empty() {
        format!("{new_slug}.md")
    } else {
        format!("{parent}/{new_slug}.md")
    };

    let old_full = notes_dir(vault).join(&old_path);
    let new_full = notes_dir(vault).join(&new_relative);

    // Read content, update frontmatter title, write to new path
    let raw = std::fs::read_to_string(&old_full).map_err(|e| format!("Read failed: {e}"))?;
    let (_, body) = parse_frontmatter(&raw);

    let tags = get_tags_for_note(conn, note_id);
    let subject_name: Option<String> = subject_id.and_then(|sid| {
        conn.query_row("SELECT name FROM subjects WHERE id = ?1", [sid], |r| r.get(0)).ok()
    });
    let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S").to_string();
    let new_fm = build_frontmatter(new_title, &tags, subject_name.as_deref(), &created_at, &now);
    let new_content = format!("{new_fm}{body}");
    let hash = content_hash(&new_content);

    std::fs::write(&new_full, &new_content).map_err(|e| format!("Write failed: {e}"))?;
    if old_full != new_full {
        let _ = std::fs::remove_file(&old_full);
    }

    conn.execute(
        "UPDATE notes SET title = ?2, file_path = ?3, content_hash = ?4, modified_at = ?5 WHERE id = ?1",
        rusqlite::params![note_id, new_title, new_relative, hash, now],
    ).map_err(|e| e.to_string())?;

    // Update backlinks: any note_links targeting old_title should now target new_title
    conn.execute(
        "UPDATE note_links SET target_title = ?2 WHERE target_title = ?1",
        rusqlite::params![old_title, new_title],
    ).map_err(|e| e.to_string())?;

    // Also update the actual [[old_title]] text in other files
    update_backlink_references(conn, vault, &old_title, new_title)?;

    index_note(conn, note_id, new_title, body, &tags)?;

    Ok(note_info_from_row(conn, note_id, new_title.to_string(), new_relative, subject_id, created_at, now))
}

fn update_backlink_references(conn: &Connection, vault: &Path, old_title: &str, new_title: &str) -> Result<(), String> {
    // Find all notes that link to the old title
    let mut stmt = conn.prepare(
        "SELECT DISTINCT n.id, n.file_path FROM notes n
         JOIN note_links nl ON nl.source_note_id = n.id
         WHERE nl.target_title = ?1"
    ).map_err(|e| e.to_string())?;

    let refs: Vec<(i64, String)> = stmt
        .query_map([new_title], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let old_link = format!("[[{}]]", old_title);
    let new_link = format!("[[{}]]", new_title);
    let old_link_alias = format!("[[{}|", old_title);
    let new_link_alias = format!("[[{}|", new_title);

    for (_, file_path) in refs {
        let full_path = notes_dir(vault).join(&file_path);
        if let Ok(content) = std::fs::read_to_string(&full_path) {
            let updated = content
                .replace(&old_link, &new_link)
                .replace(&old_link_alias, &new_link_alias);
            if updated != content {
                let _ = std::fs::write(&full_path, &updated);
            }
        }
    }

    Ok(())
}

pub fn list_folders(vault: &Path) -> Result<Vec<String>, String> {
    let dir = notes_dir(vault);
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut folders = Vec::new();
    collect_folders(&dir, &dir, &mut folders)?;
    folders.sort();
    Ok(folders)
}

fn collect_folders(base: &Path, current: &Path, folders: &mut Vec<String>) -> Result<(), String> {
    let entries = std::fs::read_dir(current).map_err(|e| e.to_string())?;
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        if entry.file_type().map_err(|e| e.to_string())?.is_dir() {
            let name = entry.file_name().to_string_lossy().to_string();
            if !name.starts_with('.') {
                let relative = entry.path().strip_prefix(base).unwrap().to_string_lossy().to_string();
                folders.push(relative.clone());
                collect_folders(base, &entry.path(), folders)?;
            }
        }
    }
    Ok(())
}

pub fn create_folder(vault: &Path, path: &str) -> Result<(), String> {
    let full = notes_dir(vault).join(path);
    std::fs::create_dir_all(&full).map_err(|e| format!("Failed to create folder: {e}"))
}

pub fn get_note_titles(conn: &Connection) -> Result<Vec<(i64, String)>, String> {
    let mut stmt = conn.prepare("SELECT id, title FROM notes ORDER BY title")
        .map_err(|e| e.to_string())?;
    let titles = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(titles)
}
```

- [ ] **Step 3: Run tests**

Run: `cd src-tauri && cargo test services::notes::tests`

Expected: All 5 tests pass

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/services/notes.rs
git commit -m "feat(notes): add CRUD operations, search, rename, folder management"
```

---

### Task 3: Note Links Service — Backlinks, Graph Data

**Files:**
- Modify: `src-tauri/src/services/note_links.rs`

- [ ] **Step 1: Write tests**

Add to `mod tests` in `note_links.rs`:

```rust
    use crate::db::Database;
    use crate::services::notes;
    use std::path::Path;

    fn setup() -> (Database, tempfile::TempDir) {
        let db = Database::open_memory().expect("open");
        db.with_conn(|conn| {
            conn.execute(
                "INSERT INTO subjects (slug, name, created_at) VALUES ('cs', 'CS', datetime('now'))",
                [],
            ).unwrap();
            Ok(())
        }).expect("setup");
        let tmp = tempfile::tempdir().expect("tmpdir");
        std::fs::create_dir_all(tmp.path().join("notes")).unwrap();
        (db, tmp)
    }

    #[test]
    fn test_update_and_get_backlinks() {
        let (db, tmp) = setup();
        db.with_conn(|conn| {
            let note_a = notes::create_note(conn, tmp.path(), "Note A", None, None, "Links to [[Note B]]").unwrap();
            let note_b = notes::create_note(conn, tmp.path(), "Note B", None, None, "Standalone note").unwrap();

            let links = parse_wikilinks("Links to [[Note B]]");
            update_links(conn, note_a.id, &links).unwrap();
            resolve_links(conn).unwrap();

            let backlinks = get_backlinks(conn, note_b.id).unwrap();
            assert_eq!(backlinks.len(), 1);
            assert_eq!(backlinks[0].title, "Note A");
            Ok(())
        }).expect("test failed");
    }

    #[test]
    fn test_get_graph_data() {
        let (db, tmp) = setup();
        db.with_conn(|conn| {
            let a = notes::create_note(conn, tmp.path(), "A", None, None, "Links to [[B]]").unwrap();
            let b = notes::create_note(conn, tmp.path(), "B", None, None, "Links to [[A]]").unwrap();

            update_links(conn, a.id, &parse_wikilinks("Links to [[B]]")).unwrap();
            update_links(conn, b.id, &parse_wikilinks("Links to [[A]]")).unwrap();
            resolve_links(conn).unwrap();

            let graph = get_graph_data(conn).unwrap();
            assert_eq!(graph.nodes.len(), 2);
            assert_eq!(graph.edges.len(), 2);
            Ok(())
        }).expect("test failed");
    }

    #[test]
    fn test_get_local_graph() {
        let (db, tmp) = setup();
        db.with_conn(|conn| {
            let a = notes::create_note(conn, tmp.path(), "A", None, None, "Links to [[B]]").unwrap();
            let b = notes::create_note(conn, tmp.path(), "B", None, None, "Links to [[C]]").unwrap();
            let c = notes::create_note(conn, tmp.path(), "C", None, None, "Leaf node").unwrap();

            update_links(conn, a.id, &parse_wikilinks("Links to [[B]]")).unwrap();
            update_links(conn, b.id, &parse_wikilinks("Links to [[C]]")).unwrap();
            resolve_links(conn).unwrap();

            // Depth 1 from A: should see A and B only
            let local = get_local_graph(conn, a.id, 1).unwrap();
            assert_eq!(local.nodes.len(), 2);

            // Depth 2 from A: should see A, B, and C
            let local2 = get_local_graph(conn, a.id, 2).unwrap();
            assert_eq!(local2.nodes.len(), 3);
            Ok(())
        }).expect("test failed");
    }
```

- [ ] **Step 2: Implement link functions**

Add to `note_links.rs` before `#[cfg(test)]`:

```rust
pub fn update_links(conn: &Connection, note_id: i64, targets: &[String]) -> Result<(), String> {
    conn.execute("DELETE FROM note_links WHERE source_note_id = ?1", [note_id])
        .map_err(|e| e.to_string())?;
    for target in targets {
        conn.execute(
            "INSERT INTO note_links (source_note_id, target_title) VALUES (?1, ?2)",
            rusqlite::params![note_id, target],
        ).map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn resolve_links(conn: &Connection) -> Result<(), String> {
    conn.execute(
        "UPDATE note_links SET target_note_id = (
            SELECT n.id FROM notes n WHERE n.title = note_links.target_title
        )",
        [],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn get_backlinks(conn: &Connection, note_id: i64) -> Result<Vec<BacklinkInfo>, String> {
    let mut stmt = conn.prepare(
        "SELECT n.id, n.title, '' as context
         FROM note_links nl
         JOIN notes n ON n.id = nl.source_note_id
         WHERE nl.target_note_id = ?1
         ORDER BY n.title"
    ).map_err(|e| e.to_string())?;

    let links = stmt
        .query_map([note_id], |row| {
            Ok(BacklinkInfo {
                note_id: row.get(0)?,
                title: row.get(1)?,
                context: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(links)
}

pub fn get_outgoing_links(conn: &Connection, note_id: i64) -> Result<Vec<LinkInfo>, String> {
    let mut stmt = conn.prepare(
        "SELECT nl.target_title, nl.target_note_id
         FROM note_links nl
         WHERE nl.source_note_id = ?1
         ORDER BY nl.target_title"
    ).map_err(|e| e.to_string())?;

    let links = stmt
        .query_map([note_id], |row| {
            let target_note_id: Option<i64> = row.get(1)?;
            Ok(LinkInfo {
                target_title: row.get(0)?,
                target_note_id,
                resolved: target_note_id.is_some(),
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(links)
}

pub fn get_graph_data(conn: &Connection) -> Result<GraphData, String> {
    // All notes as nodes
    let mut stmt = conn.prepare(
        "SELECT n.id, n.title, n.subject_id,
                (SELECT COUNT(*) FROM note_links nl WHERE nl.target_note_id = n.id) as link_count
         FROM notes n
         ORDER BY n.title"
    ).map_err(|e| e.to_string())?;

    let nodes: Vec<GraphNode> = stmt
        .query_map([], |row| {
            Ok(GraphNode {
                id: row.get(0)?,
                title: row.get(1)?,
                subject_id: row.get(2)?,
                link_count: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    // All resolved links as edges
    let mut edge_stmt = conn.prepare(
        "SELECT source_note_id, target_note_id FROM note_links WHERE target_note_id IS NOT NULL"
    ).map_err(|e| e.to_string())?;

    let edges: Vec<GraphEdge> = edge_stmt
        .query_map([], |row| {
            Ok(GraphEdge {
                source: row.get(0)?,
                target: row.get(1)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(GraphData { nodes, edges })
}

pub fn get_local_graph(conn: &Connection, note_id: i64, depth: i32) -> Result<GraphData, String> {
    // BFS from note_id
    let mut visited = std::collections::HashSet::new();
    let mut queue = std::collections::VecDeque::new();
    visited.insert(note_id);
    queue.push_back((note_id, 0));

    while let Some((current, d)) = queue.pop_front() {
        if d >= depth {
            continue;
        }
        // Outgoing links
        let mut out_stmt = conn.prepare(
            "SELECT target_note_id FROM note_links WHERE source_note_id = ?1 AND target_note_id IS NOT NULL"
        ).map_err(|e| e.to_string())?;
        let outs: Vec<i64> = out_stmt
            .query_map([current], |row| row.get(0))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        // Incoming links
        let mut in_stmt = conn.prepare(
            "SELECT source_note_id FROM note_links WHERE target_note_id = ?1"
        ).map_err(|e| e.to_string())?;
        let ins: Vec<i64> = in_stmt
            .query_map([current], |row| row.get(0))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        for neighbor in outs.into_iter().chain(ins) {
            if visited.insert(neighbor) {
                queue.push_back((neighbor, d + 1));
            }
        }
    }

    // Build subgraph from visited set
    let ids: Vec<i64> = visited.into_iter().collect();
    let placeholders: String = ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");

    let node_query = format!(
        "SELECT n.id, n.title, n.subject_id,
                (SELECT COUNT(*) FROM note_links nl WHERE nl.target_note_id = n.id) as link_count
         FROM notes n WHERE n.id IN ({placeholders})"
    );
    let mut node_stmt = conn.prepare(&node_query).map_err(|e| e.to_string())?;
    let id_refs: Vec<Box<dyn rusqlite::types::ToSql>> = ids.iter().map(|id| Box::new(*id) as Box<dyn rusqlite::types::ToSql>).collect();
    let param_refs: Vec<&dyn rusqlite::types::ToSql> = id_refs.iter().map(|b| b.as_ref()).collect();

    let nodes: Vec<GraphNode> = node_stmt
        .query_map(param_refs.as_slice(), |row| {
            Ok(GraphNode {
                id: row.get(0)?,
                title: row.get(1)?,
                subject_id: row.get(2)?,
                link_count: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let edge_query = format!(
        "SELECT source_note_id, target_note_id FROM note_links
         WHERE target_note_id IS NOT NULL
           AND source_note_id IN ({placeholders})
           AND target_note_id IN ({placeholders})",
    );
    let mut edge_stmt = conn.prepare(&edge_query).map_err(|e| e.to_string())?;
    let mut double_ids = id_refs.clone();
    double_ids.extend(ids.iter().map(|id| Box::new(*id) as Box<dyn rusqlite::types::ToSql>));
    let double_refs: Vec<&dyn rusqlite::types::ToSql> = double_ids.iter().map(|b| b.as_ref()).collect();

    let edges: Vec<GraphEdge> = edge_stmt
        .query_map(double_refs.as_slice(), |row| {
            Ok(GraphEdge { source: row.get(0)?, target: row.get(1)? })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(GraphData { nodes, edges })
}
```

- [ ] **Step 3: Run tests**

Run: `cd src-tauri && cargo test services::note_links::tests`

Expected: All 6 tests pass (3 existing + 3 new)

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/services/note_links.rs
git commit -m "feat(notes): add backlinks, graph data, local graph with BFS"
```

---

### Task 4: Tauri Commands + Registration

**Files:**
- Create: `src-tauri/src/commands/notes.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Create commands file**

Write `src-tauri/src/commands/notes.rs` following the pattern from `commands/quiz.rs`. Each command wraps the corresponding service function, passing `state.vault_path` and `state.db.with_conn(...)`.

Commands to create:
- `create_note(title, folder, subject_name, content)` → NoteInfo
- `get_note(note_id)` → NoteDetail
- `update_note(note_id, content)` → NoteInfo
- `delete_note(note_id)` → ()
- `list_notes(folder, subject_id, tag)` → Vec<NoteInfo>
- `rename_note(note_id, new_title)` → NoteInfo
- `search_notes(query)` → Vec<NoteSearchResult>
- `get_backlinks(note_id)` → Vec<BacklinkInfo>
- `get_outgoing_links(note_id)` → Vec<LinkInfo>
- `get_graph_data()` → GraphData
- `get_local_graph(note_id, depth)` → GraphData
- `list_note_folders()` → Vec<String>
- `create_note_folder(path)` → ()
- `get_note_titles()` → Vec<(i64, String)>

- [ ] **Step 2: Register module and commands**

Add `pub mod notes;` to `commands/mod.rs`.

Register all 14 commands in `lib.rs` invoke_handler.

Also in `lib.rs` `run()` function, ensure `~/Encode/notes/` dir exists:

```rust
ensure_vault_dirs(&vault_path).expect("failed to initialize vault directories");
// After the existing line above, add:
std::fs::create_dir_all(vault_path.join("notes")).ok();
```

- [ ] **Step 3: Verify compilation and tests**

Run: `cd src-tauri && cargo check && cargo test`

Expected: Compiles clean, all tests pass

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands/notes.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs
git commit -m "feat(notes): add Tauri IPC commands and register"
```

---

### Task 5: Frontend IPC Wrappers + Ribbon + Route

**Files:**
- Modify: `src/lib/tauri.ts`
- Modify: `src/App.tsx`
- Modify: `src/components/layout/Ribbon.tsx`
- Install: `react-force-graph-2d`

- [ ] **Step 1: Install react-force-graph-2d**

Run: `npm install react-force-graph-2d`

- [ ] **Step 2: Add IPC types and wrappers to `tauri.ts`**

Add all note types (NoteInfo, NoteDetail, NoteSearchResult, BacklinkInfo, LinkInfo, GraphNode, GraphEdge, GraphData) and 14 IPC wrapper functions.

- [ ] **Step 3: Add routes to App.tsx**

Add imports for Notes, NoteEditor, Graph pages and routes:
- `/notes` → Notes
- `/notes/:id` → NoteEditor
- `/graph` → Graph

- [ ] **Step 4: Add ribbon icon**

Add `StickyNote` to lucide-react imports in Ribbon.tsx. Add a nav item:
```typescript
{ path: "/notes", icon: StickyNote, label: "Notes" }
```

- [ ] **Step 5: Create placeholder pages**

Create `src/pages/Notes.tsx`, `src/pages/NoteEditor.tsx`, `src/pages/Graph.tsx` as minimal placeholders.

- [ ] **Step 6: Verify TypeScript compiles**

Run: `npx tsc --noEmit && npx biome check .`

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(notes): add IPC wrappers, routes, ribbon icon, placeholder pages"
```

---

### Task 6: Notes Explorer Page

**Files:**
- Create: `src/components/notes/FileTree.tsx`
- Modify: `src/pages/Notes.tsx`

Build the notes list page with:
- Left sidebar: FileTree component showing folders
- Center: notes list (title, tags, modified date), sortable
- Search bar at top
- "New Note" and "New Folder" buttons
- Click note → navigate to `/notes/:id`

- [ ] **Step 1: Build FileTree component**
- [ ] **Step 2: Build Notes page with list + search + filters**
- [ ] **Step 3: Verify TypeScript + lint**
- [ ] **Step 4: Commit**

```bash
git commit -m "feat(notes): implement notes explorer page with file tree"
```

---

### Task 7: Note Editor Page

**Files:**
- Modify: `src/pages/NoteEditor.tsx`
- Create: `src/components/notes/BacklinksPanel.tsx`

Build the note editor with:
- CodeMirror 6 editor (reuse existing setup from MarkdownEditor)
- Title editing in header
- Tags as pill chips
- Auto-save (debounced 1s)
- Right sidebar: BacklinksPanel showing linked mentions

- [ ] **Step 1: Build BacklinksPanel component**
- [ ] **Step 2: Build NoteEditor page with CM6, auto-save, header**
- [ ] **Step 3: Verify TypeScript + lint**
- [ ] **Step 4: Commit**

```bash
git commit -m "feat(notes): implement note editor with backlinks panel"
```

---

### Task 8: CodeMirror Wikilink Extension

**Files:**
- Create: `src/components/editor/cm-wikilink.ts`
- Modify: `src/pages/NoteEditor.tsx`

Build CM6 extensions:
- Wikilink autocomplete: on `[[` keystroke, show dropdown of note titles (fetched from `get_note_titles()`)
- Wikilink decoration: render `[[links]]` as styled clickable spans in live preview
- Tag autocomplete: on `#` at word boundary, show existing tags

- [ ] **Step 1: Build wikilink autocomplete extension**
- [ ] **Step 2: Build wikilink decoration extension**
- [ ] **Step 3: Wire into NoteEditor**
- [ ] **Step 4: Verify TypeScript + lint**
- [ ] **Step 5: Commit**

```bash
git commit -m "feat(notes): add CodeMirror wikilink autocomplete + decorations"
```

---

### Task 9: Graph View Page

**Files:**
- Modify: `src/pages/Graph.tsx`

Build interactive graph with:
- `react-force-graph-2d` component
- Load data from `get_graph_data()` IPC
- Click node → navigate to `/notes/:id`
- Hover → highlight connections
- Color nodes by subject
- Node size by link count
- Toolbar: search filter, toggle orphans
- Local graph toggle with depth slider

- [ ] **Step 1: Build graph page with react-force-graph-2d**
- [ ] **Step 2: Add toolbar with filters**
- [ ] **Step 3: Add local graph mode**
- [ ] **Step 4: Verify TypeScript + lint**
- [ ] **Step 5: Commit**

```bash
git commit -m "feat(notes): implement interactive force-directed graph view"
```

---

### Task 10: Quick Switcher Integration

**Files:**
- Modify: `src/components/layout/QuickSwitcher.tsx`

Extend the existing QuickSwitcher to include notes:
- Fetch note titles alongside subjects/chapters
- Show notes with a `StickyNote` icon
- Navigate to `/notes/:id` on selection

- [ ] **Step 1: Add notes to QuickSwitcher data loading**
- [ ] **Step 2: Verify TypeScript + lint**
- [ ] **Step 3: Commit**

```bash
git commit -m "feat(notes): add notes to quick switcher"
```

---

### Task 11: Integration Test

**Files:**
- Modify: `src-tauri/tests/integration_flow.rs`

- [ ] **Step 1: Add integration test**

```rust
#[test]
fn test_notes_full_flow() {
    let db = setup();
    // Uses tmpdir for vault — need to adapt setup or use separate vault path
    // Test: create → add wikilinks → verify backlinks → rename → verify updated → search → graph → delete
}
```

- [ ] **Step 2: Run integration tests**

Run: `cd src-tauri && cargo test --features test-utils`

- [ ] **Step 3: Commit**

```bash
git commit -m "test(notes): add integration test for full notes flow"
```

---

### Task 12: Final Verification

- [ ] **Step 1: Run full gate check**

```bash
npx tsc --noEmit && npx biome check . && cd src-tauri && cargo clippy && cargo test && cargo test --features test-utils
```

Expected: All pass

- [ ] **Step 2: Verify all files created/modified per file map**
