use crate::db::Database;
use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use walkdir::WalkDir;

/// Scan all markdown files in the vault and index them
pub fn scan_vault(vault_path: &Path, db: &Database) -> Result<usize, String> {
    db.execute("BEGIN")?;

    let result = (|| {
        db.clear_index()?;

        let mut count = 0;
        for entry in WalkDir::new(vault_path)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| {
                e.path().extension().is_some_and(|ext| ext == "md")
                    && !e.path().starts_with(vault_path.join(".encode"))
            })
        {
            let path = entry.path();
            if let Err(e) = index_single_file(path, vault_path, db) {
                eprintln!("Failed to index {:?}: {}", path, e);
            } else {
                count += 1;
            }
        }

        Ok(count)
    })();

    match result {
        Ok(count) => {
            db.execute("COMMIT")?;
            // Rebuild study sessions from tracking markdown files
            match rebuild_study_sessions(vault_path, db) {
                Ok(s) => println!("Rebuilt {} study sessions", s),
                Err(e) => eprintln!("Study session rebuild failed: {}", e),
            }
            Ok(count)
        }
        Err(e) => {
            let _ = db.execute("ROLLBACK");
            Err(e)
        }
    }
}

/// Rebuild study_sessions table from tracking/*.md files
pub fn rebuild_study_sessions(vault_path: &Path, db: &Database) -> Result<usize, String> {
    let tracking_dir = vault_path.join("tracking");
    if !tracking_dir.exists() {
        return Ok(0);
    }

    db.clear_study_sessions()?;

    let mut count = 0;
    let entries = std::fs::read_dir(&tracking_dir).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        if entry.path().extension().is_some_and(|ext| ext == "md") {
            let content = std::fs::read_to_string(entry.path()).unwrap_or_default();
            count += parse_and_index_sessions(&content, db)?;
        }
    }
    Ok(count)
}

/// Parse [!session] callout blocks from a tracking markdown file and insert into DB
fn parse_and_index_sessions(content: &str, db: &Database) -> Result<usize, String> {
    let mut count = 0;
    let mut id = String::new();
    let mut subject_name = String::new();
    let mut subject_slug = String::new();
    let mut duration: i64 = 0;
    let mut started = String::new();
    let mut completed = String::new();
    let mut in_session = false;

    for line in content.lines() {
        if let Some(rest) = line.strip_prefix("> [!session] id: ") {
            // Save previous session if we were in one
            if in_session && !id.is_empty() {
                db.record_study_session(&id, &subject_name, &subject_slug, duration, &started, &completed)?;
                count += 1;
            }
            id = rest.trim().to_string();
            subject_name.clear();
            subject_slug.clear();
            duration = 0;
            started.clear();
            completed.clear();
            in_session = true;
        } else if in_session {
            if let Some(val) = line.strip_prefix("> **Subject:** ") {
                subject_name = val.trim().to_string();
            } else if let Some(val) = line.strip_prefix("> **Subject Slug:** ") {
                subject_slug = val.trim().to_string();
            } else if let Some(val) = line.strip_prefix("> **Duration:** ") {
                duration = val.trim().parse().unwrap_or(0);
            } else if let Some(val) = line.strip_prefix("> **Started:** ") {
                started = val.trim().to_string();
            } else if let Some(val) = line.strip_prefix("> **Completed:** ") {
                completed = val.trim().to_string();
            } else if !line.starts_with('>') {
                in_session = false;
            }
        }
    }

    // Don't forget the last session
    if in_session && !id.is_empty() {
        db.record_study_session(&id, &subject_name, &subject_slug, duration, &started, &completed)?;
        count += 1;
    }

    Ok(count)
}

/// Index a single markdown file
fn index_single_file(path: &Path, vault_root: &Path, db: &Database) -> Result<(), String> {
    let content =
        std::fs::read_to_string(path).map_err(|e| format!("Failed to read {:?}: {}", path, e))?;

    let relative = path
        .strip_prefix(vault_root)
        .unwrap_or(path)
        .to_string_lossy()
        .to_string();

    let (subject, topic, file_type, status) = parse_frontmatter(&content);
    let word_count = content.split_whitespace().count();

    db.index_file(
        &relative,
        &subject.unwrap_or_default(),
        &topic.unwrap_or_default(),
        &content,
        &file_type.unwrap_or_default(),
        word_count,
        status.as_deref(),
    )
}

/// Extract frontmatter fields from markdown content
fn parse_frontmatter(content: &str) -> (Option<String>, Option<String>, Option<String>, Option<String>) {
    if !content.starts_with("---") {
        return (None, None, None, None);
    }

    let rest = &content[3..];
    let end = match rest.find("\n---") {
        Some(pos) => pos,
        None => return (None, None, None, None),
    };

    let yaml_block = &rest[1..end];
    let mut subject = None;
    let mut topic = None;
    let mut file_type = None;
    let mut status = None;

    for line in yaml_block.lines() {
        let line = line.trim();
        if let Some(val) = line.strip_prefix("subject:") {
            subject = Some(val.trim().trim_matches('"').trim_matches('\'').to_string());
        } else if let Some(val) = line.strip_prefix("topic:") {
            topic = Some(val.trim().trim_matches('"').trim_matches('\'').to_string());
        } else if let Some(val) = line.strip_prefix("type:") {
            file_type = Some(val.trim().trim_matches('"').trim_matches('\'').to_string());
        } else if let Some(val) = line.strip_prefix("status:") {
            status = Some(val.trim().trim_matches('"').trim_matches('\'').to_string());
        }
    }

    (subject, topic, file_type, status)
}

/// Start watching the vault directory for changes and re-index modified files
pub fn start_watcher(
    vault_path: PathBuf,
    db: Arc<Database>,
) -> Result<RecommendedWatcher, String> {
    let vault_root = vault_path.clone();

    let mut watcher =
        notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
            if let Ok(event) = res {
                match event.kind {
                    EventKind::Create(_) | EventKind::Modify(_) => {
                        for path in &event.paths {
                            if path.extension().is_some_and(|ext| ext == "md")
                                && !path.starts_with(vault_root.join(".encode"))
                            {
                                if let Err(e) = index_single_file(path, &vault_root, &db) {
                                    eprintln!("Re-index failed for {:?}: {}", path, e);
                                }
                            }
                        }
                    }
                    EventKind::Remove(_) => {
                        for path in &event.paths {
                            if path.extension().is_some_and(|ext| ext == "md") {
                                let relative = path
                                    .strip_prefix(&vault_root)
                                    .unwrap_or(path)
                                    .to_string_lossy()
                                    .to_string();
                                let _ = db.remove_file(&relative);
                            }
                        }
                    }
                    _ => {}
                }
            }
        })
        .map_err(|e| format!("Failed to create watcher: {}", e))?;

    watcher
        .watch(&vault_path, RecursiveMode::Recursive)
        .map_err(|e| format!("Failed to watch vault: {}", e))?;

    Ok(watcher)
}
