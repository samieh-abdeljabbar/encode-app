//! SQLite snapshot service — periodic database backups with rotation.

use std::path::{Path, PathBuf};

const MAX_SNAPSHOTS: usize = 5;

/// Create a timestamped copy of the database file.
pub fn create_snapshot(db_path: &Path, snapshot_dir: &Path) -> Result<PathBuf, String> {
    std::fs::create_dir_all(snapshot_dir)
        .map_err(|e| format!("Failed to create snapshot directory: {e}"))?;

    let timestamp = chrono::Utc::now().format("%Y%m%d-%H%M%S");
    let snapshot_name = format!("encode-{timestamp}.db");
    let snapshot_path = snapshot_dir.join(&snapshot_name);

    std::fs::copy(db_path, &snapshot_path)
        .map_err(|e| format!("Failed to copy database: {e}"))?;

    rotate_snapshots(snapshot_dir)?;

    Ok(snapshot_path)
}

/// List available snapshots sorted by name (newest first).
pub fn list_snapshots(snapshot_dir: &Path) -> Result<Vec<String>, String> {
    if !snapshot_dir.exists() {
        return Ok(Vec::new());
    }

    let mut entries: Vec<String> = std::fs::read_dir(snapshot_dir)
        .map_err(|e| format!("Failed to read snapshot directory: {e}"))?
        .filter_map(|entry| {
            let entry = entry.ok()?;
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with("encode-") && name.ends_with(".db") {
                Some(name)
            } else {
                None
            }
        })
        .collect();

    entries.sort_unstable_by(|a, b| b.cmp(a));
    Ok(entries)
}

fn rotate_snapshots(snapshot_dir: &Path) -> Result<(), String> {
    let snapshots = list_snapshots(snapshot_dir)?;
    if snapshots.len() > MAX_SNAPSHOTS {
        for old in &snapshots[MAX_SNAPSHOTS..] {
            let _ = std::fs::remove_file(snapshot_dir.join(old));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_db(dir: &Path) -> PathBuf {
        let db_path = dir.join("encode.db");
        std::fs::write(&db_path, "test database content").expect("write db");
        db_path
    }

    #[test]
    fn test_create_snapshot_copies_file() {
        let dir = tempfile::tempdir().expect("tmpdir");
        let db_path = create_test_db(dir.path());
        let snap_dir = dir.path().join("snapshots");

        let result = create_snapshot(&db_path, &snap_dir).expect("snapshot");
        assert!(result.exists());

        let content = std::fs::read_to_string(&result).expect("read");
        assert_eq!(content, "test database content");
    }

    #[test]
    fn test_list_snapshots_returns_newest_first() {
        let dir = tempfile::tempdir().expect("tmpdir");
        let snap_dir = dir.path().join("snapshots");
        std::fs::create_dir_all(&snap_dir).unwrap();

        std::fs::write(snap_dir.join("encode-20260101-120000.db"), "a").unwrap();
        std::fs::write(snap_dir.join("encode-20260301-120000.db"), "c").unwrap();
        std::fs::write(snap_dir.join("encode-20260201-120000.db"), "b").unwrap();

        let list = list_snapshots(&snap_dir).expect("list");
        assert_eq!(list[0], "encode-20260301-120000.db");
        assert_eq!(list[1], "encode-20260201-120000.db");
        assert_eq!(list[2], "encode-20260101-120000.db");
    }

    #[test]
    fn test_rotation_keeps_max_5() {
        let dir = tempfile::tempdir().expect("tmpdir");
        let db_path = create_test_db(dir.path());
        let snap_dir = dir.path().join("snapshots");
        std::fs::create_dir_all(&snap_dir).unwrap();

        // Create 6 pre-existing snapshots
        for i in 0..6 {
            std::fs::write(
                snap_dir.join(format!("encode-2026010{i}-120000.db")),
                "data",
            )
            .unwrap();
        }

        // Creating one more triggers rotation
        create_snapshot(&db_path, &snap_dir).expect("snapshot");

        let list = list_snapshots(&snap_dir).expect("list");
        assert!(list.len() <= MAX_SNAPSHOTS, "should keep at most {MAX_SNAPSHOTS} snapshots, got {}", list.len());
    }

    #[test]
    fn test_list_empty_dir_returns_empty() {
        let dir = tempfile::tempdir().expect("tmpdir");
        let list = list_snapshots(&dir.path().join("nonexistent")).expect("list");
        assert!(list.is_empty());
    }

    #[test]
    fn test_list_ignores_non_snapshot_files() {
        let dir = tempfile::tempdir().expect("tmpdir");
        let snap_dir = dir.path().join("snapshots");
        std::fs::create_dir_all(&snap_dir).unwrap();

        std::fs::write(snap_dir.join("encode-20260101-120000.db"), "ok").unwrap();
        std::fs::write(snap_dir.join("random-file.txt"), "ignore").unwrap();
        std::fs::write(snap_dir.join("not-a-snapshot.db"), "ignore").unwrap();

        let list = list_snapshots(&snap_dir).expect("list");
        assert_eq!(list.len(), 1);
    }
}
