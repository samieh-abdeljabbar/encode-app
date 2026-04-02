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
        match serde_yaml_ng::from_str::<Frontmatter>(yaml_str) {
            Ok(fm) => (Some(fm), body),
            Err(_) => (None, content),
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

#[cfg(test)]
mod tests {
    use super::*;

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
}
