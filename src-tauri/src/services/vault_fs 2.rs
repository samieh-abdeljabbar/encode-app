use std::collections::HashMap;
use std::path::{Component, Path, PathBuf};
use std::sync::{Arc, RwLock};

/// Coordinated file access service.
/// Provides per-path locking and atomic writes via .tmp + rename.
pub struct VaultFs {
    vault_root: PathBuf,
    /// Cached canonical vault root — resolved once at construction to avoid
    /// a syscall on every validate_path call.
    canonical_root: PathBuf,
    /// Per-path lock map. Grows monotonically for the lifetime of the process.
    /// Acceptable for a single-user desktop app where the number of distinct
    /// file paths accessed in one session is bounded (hundreds, not millions).
    /// If this becomes a concern, add LRU eviction keyed on Arc::strong_count == 1.
    locks: RwLock<HashMap<PathBuf, Arc<RwLock<()>>>>,
}

impl VaultFs {
    pub fn new(vault_root: PathBuf) -> Self {
        // Canonicalize at construction. If the vault root doesn't exist yet,
        // create it so we can canonicalize.
        let _ = std::fs::create_dir_all(&vault_root);
        let canonical_root = vault_root
            .canonicalize()
            .unwrap_or_else(|_| vault_root.clone());

        Self {
            vault_root,
            canonical_root,
            locks: RwLock::new(HashMap::new()),
        }
    }

    fn path_lock(&self, path: &Path) -> Arc<RwLock<()>> {
        // Try read lock first (happy path: entry already exists)
        {
            let locks = self.locks.read().expect("lock map poisoned");
            if let Some(lock) = locks.get(path) {
                return lock.clone();
            }
        }
        // Miss: escalate to write lock
        let mut locks = self.locks.write().expect("lock map poisoned");
        locks
            .entry(path.to_path_buf())
            .or_insert_with(|| Arc::new(RwLock::new(())))
            .clone()
    }

    pub fn validate_path(&self, relative: &str) -> Result<PathBuf, String> {
        let rel = Path::new(relative);

        if rel.is_absolute() {
            return Err(format!("Absolute paths rejected: {relative}"));
        }

        for component in rel.components() {
            if matches!(component, Component::ParentDir) {
                return Err(format!("Path traversal rejected: {relative}"));
            }
        }

        let full = self.vault_root.join(rel);

        if full.exists() {
            let canonical = full
                .canonicalize()
                .map_err(|e| format!("Failed to canonicalize: {e}"))?;
            if !canonical.starts_with(&self.canonical_root) {
                return Err(format!("Path escapes vault: {relative}"));
            }
            Ok(canonical)
        } else {
            // Walk up to the nearest existing ancestor and verify containment
            let mut ancestor = full.as_path();
            loop {
                match ancestor.parent() {
                    Some(parent) if parent.exists() => {
                        let parent_canonical = parent
                            .canonicalize()
                            .map_err(|e| format!("Failed to canonicalize ancestor: {e}"))?;
                        if !parent_canonical.starts_with(&self.canonical_root) {
                            return Err(format!("Path escapes vault via ancestor: {relative}"));
                        }
                        return Ok(full);
                    }
                    Some(parent) => {
                        ancestor = parent;
                    }
                    None => {
                        return Err(format!("No valid ancestor found for: {relative}"));
                    }
                }
            }
        }
    }

    pub fn write_atomic(&self, relative: &str, content: &str) -> Result<(), String> {
        let target = self.validate_path(relative)?;
        let lock = self.path_lock(&target);
        let _guard = lock.write().map_err(|e| format!("Write lock error: {e}"))?;

        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create directory: {e}"))?;
        }

        let mut tmp_name = target.as_os_str().to_os_string();
        tmp_name.push(".tmp");
        let tmp = PathBuf::from(tmp_name);

        std::fs::write(&tmp, content).map_err(|e| format!("Failed to write tmp file: {e}"))?;
        std::fs::rename(&tmp, &target).map_err(|e| {
            let _ = std::fs::remove_file(&tmp);
            format!("Failed to rename tmp to target: {e}")
        })?;

        Ok(())
    }

    pub fn read_file(&self, relative: &str) -> Result<String, String> {
        let target = self.validate_path(relative)?;
        let lock = self.path_lock(&target);
        let _guard = lock.read().map_err(|e| format!("Read lock error: {e}"))?;

        std::fs::read_to_string(&target).map_err(|e| format!("Failed to read file: {e}"))
    }

    pub fn delete_file(&self, relative: &str) -> Result<(), String> {
        let target = self.validate_path(relative)?;
        let lock = self.path_lock(&target);
        let _guard = lock.write().map_err(|e| format!("Write lock error: {e}"))?;

        match std::fs::remove_file(&target) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(format!("Failed to delete file: {e}")),
        }
    }

    pub fn vault_root(&self) -> &Path {
        &self.vault_root
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_vault() -> (tempfile::TempDir, VaultFs) {
        let dir = tempfile::tempdir().expect("tmpdir");
        let vfs = VaultFs::new(dir.path().to_path_buf());
        (dir, vfs)
    }

    #[test]
    fn test_atomic_write_and_read() {
        let (_dir, vfs) = temp_vault();
        vfs.write_atomic("test.md", "hello").expect("write");
        let content = vfs.read_file("test.md").expect("read");
        assert_eq!(content, "hello");
    }

    #[test]
    fn test_write_creates_subdirectories() {
        let (_dir, vfs) = temp_vault();
        vfs.write_atomic("a/b/c.md", "nested").expect("write");
        let content = vfs.read_file("a/b/c.md").expect("read");
        assert_eq!(content, "nested");
    }

    #[test]
    fn test_path_traversal_rejected() {
        let (_dir, vfs) = temp_vault();
        let result = vfs.validate_path("../escape.md");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("traversal"));
    }

    #[test]
    fn test_absolute_path_rejected() {
        let (_dir, vfs) = temp_vault();
        let result = vfs.validate_path("/etc/passwd");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Absolute"));
    }

    #[test]
    fn test_delete_file() {
        let (_dir, vfs) = temp_vault();
        vfs.write_atomic("delete-me.md", "content").expect("write");
        vfs.delete_file("delete-me.md").expect("delete");
        let result = vfs.read_file("delete-me.md");
        assert!(result.is_err());
    }

    #[test]
    fn test_delete_nonexistent_is_ok() {
        let (_dir, vfs) = temp_vault();
        vfs.delete_file("does-not-exist.md")
            .expect("deleting nonexistent file should succeed");
    }

    #[test]
    fn test_tmp_file_preserves_extension() {
        let (dir, vfs) = temp_vault();
        vfs.write_atomic("notes.md", "content").expect("write");
        let bad_tmp = dir.path().join("notes.tmp");
        let good_tmp = dir.path().join("notes.md.tmp");
        assert!(!bad_tmp.exists(), "old-style .tmp should not exist");
        assert!(!good_tmp.exists(), ".md.tmp should be cleaned up after rename");
        assert!(dir.path().join("notes.md").exists());
    }

    #[test]
    fn test_nested_write_validates_ancestor() {
        let (_dir, vfs) = temp_vault();
        vfs.write_atomic("subjects/math/chapters/ch1.md", "content")
            .expect("nested write should succeed");
        let content = vfs
            .read_file("subjects/math/chapters/ch1.md")
            .expect("read");
        assert_eq!(content, "content");
    }
}
