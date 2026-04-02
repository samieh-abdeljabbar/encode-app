use rusqlite::Connection;

/// Versions must be sequential starting from 1.
const MIGRATIONS: &[(u32, &str)] = &[
    (1, include_str!("../../migrations/001_foundation.sql")),
    (2, include_str!("../../migrations/002_section_status.sql")),
    (3, include_str!("../../migrations/003_teachback_miss_source.sql")),
    (4, include_str!("../../migrations/004_notes.sql")),
    (5, include_str!("../../migrations/005_ai_generated_source.sql")),
];

pub fn read_user_version(conn: &Connection) -> Result<u32, String> {
    conn.pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(|e| format!("Failed to read user_version: {e}"))
}

/// Run all migrations that haven't been applied yet.
pub fn run_all(conn: &Connection) -> Result<(), String> {
    let current = read_user_version(conn)?;

    for &(version, sql) in MIGRATIONS {
        if version > current {
            conn.execute_batch("BEGIN;")
                .map_err(|e| format!("Migration {version} BEGIN failed: {e}"))?;

            match conn.execute_batch(sql) {
                Ok(()) => {
                    conn.execute_batch("COMMIT;")
                        .map_err(|e| format!("Migration {version} COMMIT failed: {e}"))?;
                    // Set version AFTER commit succeeds so a crash between
                    // commit and pragma leaves the migration applied but
                    // unversioned — next launch re-runs it (safe due to IF NOT EXISTS).
                    conn.pragma_update(None, "user_version", version)
                        .map_err(|e| format!("Failed to set user_version to {version}: {e}"))?;
                }
                Err(e) => {
                    let _ = conn.execute_batch("ROLLBACK;");
                    return Err(format!("Migration {version} failed: {e}"));
                }
            }
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_migrations_are_idempotent() {
        let conn = Connection::open_in_memory().expect("open");
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();

        run_all(&conn).expect("first run");
        run_all(&conn).expect("second run (idempotent)");

        let version = read_user_version(&conn).unwrap();
        assert_eq!(version, 5);
    }

    #[test]
    fn test_migration_versions_are_sequential() {
        for (i, &(version, _)) in MIGRATIONS.iter().enumerate() {
            assert_eq!(
                version,
                (i + 1) as u32,
                "migration at index {i} should have version {}",
                i + 1
            );
        }
    }
}
