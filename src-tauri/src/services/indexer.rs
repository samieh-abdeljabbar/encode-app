//! Incremental index reconciliation via content fingerprinting.
//! Compares fast non-cryptographic hashes of exported files against stored hashes
//! to determine which files need re-indexing.
//!
//! Functions are tested and ready — full wiring comes when stored hash
//! persistence is added to the settings table.
// TODO: wire into startup reconciliation when stored hash persistence is added
#![allow(dead_code)]

use std::collections::HashMap;
use std::path::Path;

/// Fast non-cryptographic fingerprint for change detection.
/// Not stable across Rust versions — only compare within the same build.
pub fn content_fingerprint(content: &str) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    content.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

/// Scan a directory tree and return a map of relative paths to content hashes.
pub fn scan_hashes(root: &Path) -> Result<HashMap<String, String>, String> {
    let mut hashes = HashMap::new();
    if !root.exists() {
        return Ok(hashes);
    }

    scan_dir_recursive(root, root, &mut hashes)?;
    Ok(hashes)
}

fn scan_dir_recursive(
    root: &Path,
    dir: &Path,
    hashes: &mut HashMap<String, String>,
) -> Result<(), String> {
    let entries =
        std::fs::read_dir(dir).map_err(|e| format!("Failed to read {}: {e}", dir.display()))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {e}"))?;
        let path = entry.path();

        if path.is_dir() {
            scan_dir_recursive(root, &path, hashes)?;
        } else if path.extension().is_some_and(|ext| ext == "md") {
            let content = std::fs::read_to_string(&path)
                .map_err(|e| format!("Failed to read {}: {e}", path.display()))?;

            let relative = path
                .strip_prefix(root)
                .map_err(|e| format!("Path prefix error: {e}"))?
                .to_string_lossy()
                .to_string();

            hashes.insert(relative, content_fingerprint(&content));
        }
    }
    Ok(())
}

/// Compare current file hashes against stored hashes.
/// Returns (added, changed, removed) file lists.
pub fn diff_hashes(
    current: &HashMap<String, String>,
    stored: &HashMap<String, String>,
) -> (Vec<String>, Vec<String>, Vec<String>) {
    let mut added = Vec::new();
    let mut changed = Vec::new();
    let mut removed = Vec::new();

    for (path, hash) in current {
        match stored.get(path) {
            None => added.push(path.clone()),
            Some(old_hash) if old_hash != hash => changed.push(path.clone()),
            _ => {}
        }
    }

    for path in stored.keys() {
        if !current.contains_key(path) {
            removed.push(path.clone());
        }
    }

    added.sort();
    changed.sort();
    removed.sort();

    (added, changed, removed)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_content_fingerprint_is_deterministic() {
        let h1 = content_fingerprint("hello world");
        let h2 = content_fingerprint("hello world");
        assert_eq!(h1, h2);
    }

    #[test]
    fn test_content_fingerprint_differs_for_different_content() {
        let h1 = content_fingerprint("hello");
        let h2 = content_fingerprint("world");
        assert_ne!(h1, h2);
    }

    #[test]
    fn test_scan_hashes_finds_md_files() {
        let dir = tempfile::tempdir().expect("tmpdir");
        let sub = dir.path().join("sub");
        std::fs::create_dir_all(&sub).unwrap();

        std::fs::write(dir.path().join("a.md"), "content a").unwrap();
        std::fs::write(sub.join("b.md"), "content b").unwrap();
        std::fs::write(dir.path().join("ignored.txt"), "not markdown").unwrap();

        let hashes = scan_hashes(dir.path()).expect("scan");
        assert_eq!(hashes.len(), 2);
        assert!(hashes.contains_key("a.md"));
        assert!(hashes.contains_key("sub/b.md"));
    }

    #[test]
    fn test_scan_empty_dir() {
        let dir = tempfile::tempdir().expect("tmpdir");
        let hashes = scan_hashes(dir.path()).expect("scan");
        assert!(hashes.is_empty());
    }

    #[test]
    fn test_scan_nonexistent_dir() {
        let hashes = scan_hashes(Path::new("/tmp/definitely-not-a-real-dir-12345")).expect("scan");
        assert!(hashes.is_empty());
    }

    #[test]
    fn test_diff_detects_added_files() {
        let current: HashMap<String, String> =
            [("new.md".into(), "hash1".into())].into_iter().collect();
        let stored: HashMap<String, String> = HashMap::new();

        let (added, changed, removed) = diff_hashes(&current, &stored);
        assert_eq!(added, vec!["new.md"]);
        assert!(changed.is_empty());
        assert!(removed.is_empty());
    }

    #[test]
    fn test_diff_detects_changed_files() {
        let current: HashMap<String, String> = [("file.md".into(), "new-hash".into())]
            .into_iter()
            .collect();
        let stored: HashMap<String, String> = [("file.md".into(), "old-hash".into())]
            .into_iter()
            .collect();

        let (added, changed, removed) = diff_hashes(&current, &stored);
        assert!(added.is_empty());
        assert_eq!(changed, vec!["file.md"]);
        assert!(removed.is_empty());
    }

    #[test]
    fn test_diff_detects_removed_files() {
        let current: HashMap<String, String> = HashMap::new();
        let stored: HashMap<String, String> =
            [("gone.md".into(), "hash".into())].into_iter().collect();

        let (added, changed, removed) = diff_hashes(&current, &stored);
        assert!(added.is_empty());
        assert!(changed.is_empty());
        assert_eq!(removed, vec!["gone.md"]);
    }

    #[test]
    fn test_diff_unchanged_files_produce_empty_results() {
        let hashes: HashMap<String, String> = [
            ("a.md".into(), "hash-a".into()),
            ("b.md".into(), "hash-b".into()),
        ]
        .into_iter()
        .collect();

        let (added, changed, removed) = diff_hashes(&hashes, &hashes);
        assert!(added.is_empty());
        assert!(changed.is_empty());
        assert!(removed.is_empty());
    }
}
