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
            Ok(count)
        }
        Err(e) => {
            let _ = db.execute("ROLLBACK");
            Err(e)
        }
    }
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

    let (subject, topic, file_type) = parse_frontmatter(&content);
    let word_count = content.split_whitespace().count();

    db.index_file(
        &relative,
        &subject.unwrap_or_default(),
        &topic.unwrap_or_default(),
        &content,
        &file_type.unwrap_or_default(),
        word_count,
    )
}

/// Extract frontmatter fields from markdown content
fn parse_frontmatter(content: &str) -> (Option<String>, Option<String>, Option<String>) {
    if !content.starts_with("---") {
        return (None, None, None);
    }

    let rest = &content[3..];
    let end = match rest.find("\n---") {
        Some(pos) => pos,
        None => return (None, None, None),
    };

    let yaml_block = &rest[1..end];
    let mut subject = None;
    let mut topic = None;
    let mut file_type = None;

    for line in yaml_block.lines() {
        let line = line.trim();
        if let Some(val) = line.strip_prefix("subject:") {
            subject = Some(val.trim().trim_matches('"').trim_matches('\'').to_string());
        } else if let Some(val) = line.strip_prefix("topic:") {
            topic = Some(val.trim().trim_matches('"').trim_matches('\'').to_string());
        } else if let Some(val) = line.strip_prefix("type:") {
            file_type = Some(val.trim().trim_matches('"').trim_matches('\'').to_string());
        }
    }

    (subject, topic, file_type)
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
