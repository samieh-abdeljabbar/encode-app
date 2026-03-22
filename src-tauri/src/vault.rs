use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, Deserialize)]
pub struct Subject {
    pub slug: String,
    pub name: String,
    pub path: String,
    pub chapter_count: usize,
    pub flashcard_count: usize,
    pub quiz_count: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FileEntry {
    pub file_path: String,
    pub subject: Option<String>,
    pub topic: Option<String>,
    pub file_type: Option<String>,
    pub word_count: Option<usize>,
    pub updated_at: Option<String>,
}

/// Returns the default vault path: ~/Encode
pub fn default_vault_path() -> PathBuf {
    dirs::home_dir()
        .expect("Could not determine home directory")
        .join("Encode")
}

/// Creates the vault directory structure if it doesn't exist.
pub fn init_vault(vault_path: &Path) -> Result<(), String> {
    let dirs_to_create = [
        vault_path.to_path_buf(),
        vault_path.join("subjects"),
        vault_path.join("daily"),
        vault_path.join("captures"),
        vault_path.join(".encode"),
    ];

    for dir in &dirs_to_create {
        fs::create_dir_all(dir).map_err(|e| format!("Failed to create {:?}: {}", dir, e))?;
    }

    // Create default config.toml if it doesn't exist
    let config_path = vault_path.join(".encode").join("config.toml");
    if !config_path.exists() {
        let default_config = r#"[ai]
provider = "none"
ollama_model = "llama3.1:8b"
ollama_url = "http://localhost:11434"
"#;
        fs::write(&config_path, default_config)
            .map_err(|e| format!("Failed to write config: {}", e))?;
    }

    Ok(())
}

/// Create a new subject with its full folder structure
pub fn create_subject_dir(vault_path: &Path, name: &str) -> Result<String, String> {
    let slug: String = name
        .trim()
        .replace(' ', "-")
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '-')
        .collect();

    if slug.is_empty() {
        return Err("Subject name cannot be empty".to_string());
    }

    let subject_path = vault_path.join("subjects").join(&slug);
    let subdirs = ["chapters", "flashcards", "quizzes", "teach-backs", "maps"];
    for subdir in &subdirs {
        fs::create_dir_all(subject_path.join(subdir))
            .map_err(|e| format!("Failed to create {}: {}", subdir, e))?;
    }

    let meta = format!(
        "---\nsubject: {}\ntype: subject\ncreated_at: {}\n---\n\n# {}\n",
        name,
        chrono::Local::now().format("%Y-%m-%dT%H:%M:%S"),
        name
    );
    fs::write(subject_path.join("_subject.md"), meta)
        .map_err(|e| format!("Failed to write _subject.md: {}", e))?;

    Ok(slug)
}

/// List all subjects in the vault
pub fn list_subjects(vault_path: &Path) -> Result<Vec<Subject>, String> {
    let subjects_dir = vault_path.join("subjects");
    if !subjects_dir.exists() {
        return Ok(vec![]);
    }

    let mut subjects = Vec::new();
    let entries = fs::read_dir(&subjects_dir)
        .map_err(|e| format!("Failed to read subjects dir: {}", e))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        let slug = path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        let name = slug.replace('-', " ");

        let count_md_files = |subdir: &str| -> usize {
            let dir = path.join(subdir);
            if !dir.exists() {
                return 0;
            }
            fs::read_dir(dir)
                .map(|entries| {
                    entries
                        .flatten()
                        .filter(|e| e.path().extension().is_some_and(|ext| ext == "md"))
                        .count()
                })
                .unwrap_or(0)
        };

        subjects.push(Subject {
            name,
            path: path.to_string_lossy().to_string(),
            chapter_count: count_md_files("chapters"),
            flashcard_count: count_md_files("flashcards"),
            quiz_count: count_md_files("quizzes"),
            slug,
        });
    }

    subjects.sort_by(|a, b| a.slug.cmp(&b.slug));
    Ok(subjects)
}

/// Read a file from the vault. Path is relative to vault root.
pub fn read_file(vault_path: &Path, relative_path: &str) -> Result<String, String> {
    let full_path = vault_path.join(relative_path);
    fs::read_to_string(&full_path)
        .map_err(|e| format!("Failed to read {:?}: {}", full_path, e))
}

/// Write content to a file in the vault. Creates parent directories if needed.
pub fn write_file(vault_path: &Path, relative_path: &str, content: &str) -> Result<(), String> {
    let full_path = vault_path.join(relative_path);
    if let Some(parent) = full_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }
    fs::write(&full_path, content)
        .map_err(|e| format!("Failed to write {:?}: {}", full_path, e))
}

/// Delete a file from the vault.
pub fn delete_file(vault_path: &Path, relative_path: &str) -> Result<(), String> {
    let full_path = vault_path.join(relative_path);
    if !full_path.exists() {
        return Err(format!("File not found: {:?}", full_path));
    }
    fs::remove_file(&full_path)
        .map_err(|e| format!("Failed to delete {:?}: {}", full_path, e))
}

/// List markdown files in a subject folder, optionally filtered by type subdirectory
pub fn list_files(
    vault_path: &Path,
    subject: &str,
    file_type: Option<&str>,
) -> Result<Vec<FileEntry>, String> {
    let base = vault_path.join("subjects").join(subject);
    let search_dir = match file_type {
        Some(ft) => base.join(ft),
        None => base,
    };

    if !search_dir.exists() {
        return Ok(vec![]);
    }

    let mut files = Vec::new();
    collect_md_files(&search_dir, vault_path, &mut files)?;
    files.sort_by(|a, b| a.file_path.cmp(&b.file_path));
    Ok(files)
}

fn collect_md_files(
    dir: &Path,
    vault_root: &Path,
    files: &mut Vec<FileEntry>,
) -> Result<(), String> {
    let entries = fs::read_dir(dir).map_err(|e| format!("Failed to read dir: {}", e))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_md_files(&path, vault_root, files)?;
        } else if path.extension().is_some_and(|ext| ext == "md") {
            let relative = path
                .strip_prefix(vault_root)
                .unwrap_or(&path)
                .to_string_lossy()
                .to_string();

            let content = fs::read_to_string(&path).unwrap_or_default();
            let (subject, topic, file_type) = parse_frontmatter_fields(&content);
            let word_count = content.split_whitespace().count();

            let updated_at = fs::metadata(&path)
                .and_then(|m| m.modified())
                .ok()
                .map(|t| {
                    chrono::DateTime::<chrono::Utc>::from(t)
                        .format("%Y-%m-%dT%H:%M:%S")
                        .to_string()
                });

            files.push(FileEntry {
                file_path: relative,
                subject,
                topic,
                file_type,
                word_count: Some(word_count),
                updated_at,
            });
        }
    }
    Ok(())
}

/// Quick frontmatter field extraction without full YAML parsing
fn parse_frontmatter_fields(content: &str) -> (Option<String>, Option<String>, Option<String>) {
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
