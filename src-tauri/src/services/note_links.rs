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

pub fn update_links(
    conn: &rusqlite::Connection,
    note_id: i64,
    targets: &[String],
) -> Result<(), String> {
    conn.execute(
        "DELETE FROM note_links WHERE source_note_id = ?1",
        [note_id],
    )
    .map_err(|e| e.to_string())?;
    for target in targets {
        conn.execute(
            "INSERT INTO note_links (source_note_id, target_title) VALUES (?1, ?2)",
            rusqlite::params![note_id, target],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn parse_wikilinks(content: &str) -> Vec<String> {
    WIKILINK_RE
        .captures_iter(content)
        .map(|cap| cap[1].trim().to_string())
        .collect()
}

pub fn resolve_links(conn: &Connection) -> Result<(), String> {
    conn.execute(
        "UPDATE note_links SET target_note_id = (
            SELECT n.id FROM notes n WHERE n.title = note_links.target_title
        )",
        [],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn get_backlinks(conn: &Connection, note_id: i64) -> Result<Vec<BacklinkInfo>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT n.id, n.title, '' as context
             FROM note_links nl
             JOIN notes n ON n.id = nl.source_note_id
             WHERE nl.target_note_id = ?1
             ORDER BY n.title",
        )
        .map_err(|e| e.to_string())?;
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
    let mut stmt = conn
        .prepare(
            "SELECT nl.target_title, nl.target_note_id
             FROM note_links nl WHERE nl.source_note_id = ?1
             ORDER BY nl.target_title",
        )
        .map_err(|e| e.to_string())?;
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
    let mut stmt = conn
        .prepare(
            "SELECT n.id, n.title, n.subject_id,
                    (SELECT COUNT(*) FROM note_links nl WHERE nl.target_note_id = n.id) as link_count
             FROM notes n ORDER BY n.title",
        )
        .map_err(|e| e.to_string())?;
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

    let mut edge_stmt = conn
        .prepare(
            "SELECT source_note_id, target_note_id FROM note_links WHERE target_note_id IS NOT NULL",
        )
        .map_err(|e| e.to_string())?;
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
    let mut visited = std::collections::HashSet::new();
    let mut queue = std::collections::VecDeque::new();
    visited.insert(note_id);
    queue.push_back((note_id, 0));

    while let Some((current, d)) = queue.pop_front() {
        if d >= depth {
            continue;
        }
        // Outgoing
        let mut out_stmt = conn
            .prepare(
                "SELECT target_note_id FROM note_links WHERE source_note_id = ?1 AND target_note_id IS NOT NULL",
            )
            .map_err(|e| e.to_string())?;
        let outs: Vec<i64> = out_stmt
            .query_map([current], |row| row.get(0))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        // Incoming
        let mut in_stmt = conn
            .prepare("SELECT source_note_id FROM note_links WHERE target_note_id = ?1")
            .map_err(|e| e.to_string())?;
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

    // Build subgraph from visited IDs
    let ids: Vec<i64> = visited.into_iter().collect();
    if ids.is_empty() {
        return Ok(GraphData {
            nodes: vec![],
            edges: vec![],
        });
    }

    let placeholders: String = ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");

    let node_query = format!(
        "SELECT n.id, n.title, n.subject_id,
                (SELECT COUNT(*) FROM note_links nl WHERE nl.target_note_id = n.id)
         FROM notes n WHERE n.id IN ({})",
        placeholders
    );
    let mut node_stmt = conn.prepare(&node_query).map_err(|e| e.to_string())?;
    let id_params: Vec<Box<dyn rusqlite::types::ToSql>> = ids
        .iter()
        .map(|id| Box::new(*id) as Box<dyn rusqlite::types::ToSql>)
        .collect();
    let param_refs: Vec<&dyn rusqlite::types::ToSql> =
        id_params.iter().map(|b| b.as_ref()).collect();
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

    // Edges between visited nodes
    let edge_query = format!(
        "SELECT source_note_id, target_note_id FROM note_links
         WHERE target_note_id IS NOT NULL AND source_note_id IN ({0}) AND target_note_id IN ({0})",
        placeholders
    );
    let mut edge_stmt = conn.prepare(&edge_query).map_err(|e| e.to_string())?;
    let mut double_params: Vec<Box<dyn rusqlite::types::ToSql>> = ids
        .iter()
        .map(|id| Box::new(*id) as Box<dyn rusqlite::types::ToSql>)
        .collect();
    double_params.extend(
        ids.iter()
            .map(|id| Box::new(*id) as Box<dyn rusqlite::types::ToSql>),
    );
    let double_refs: Vec<&dyn rusqlite::types::ToSql> =
        double_params.iter().map(|b| b.as_ref()).collect();
    let edges: Vec<GraphEdge> = edge_stmt
        .query_map(double_refs.as_slice(), |row| {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_wikilinks_basic() {
        let links = parse_wikilinks("See [[Binary Trees]] for details.");
        assert_eq!(links, vec!["Binary Trees"]);
    }

    #[test]
    fn test_parse_wikilinks_with_alias() {
        let links = parse_wikilinks("Check [[Binary Trees|trees]] and [[Graphs]].");
        assert_eq!(links, vec!["Binary Trees", "Graphs"]);
    }

    #[test]
    fn test_parse_wikilinks_empty() {
        assert!(parse_wikilinks("No links here.").is_empty());
    }

    #[test]
    fn test_parse_wikilinks_multiple() {
        let links = parse_wikilinks("[[A]] links to [[B]] and [[C|see C]].");
        assert_eq!(links, vec!["A", "B", "C"]);
    }

    use crate::db::Database;
    use crate::services::notes;

    fn setup() -> (Database, tempfile::TempDir) {
        let db = Database::open_memory().expect("open");
        db.with_conn(|conn| {
            conn.execute(
                "INSERT INTO subjects (slug, name, created_at) VALUES ('cs', 'CS', datetime('now'))",
                [],
            )
            .unwrap();
            Ok(())
        })
        .expect("setup");
        let tmp = tempfile::tempdir().expect("tmpdir");
        std::fs::create_dir_all(tmp.path().join("notes")).unwrap();
        (db, tmp)
    }

    #[test]
    fn test_update_and_get_backlinks() {
        let (db, tmp) = setup();
        db.with_conn(|conn| {
            let _a = notes::create_note(
                conn,
                tmp.path(),
                "Note A",
                None,
                None,
                None,
                "Links to [[Note B]]",
            )
            .unwrap();
            let b =
                notes::create_note(conn, tmp.path(), "Note B", None, None, None, "Standalone")
                    .unwrap();
            resolve_links(conn).unwrap();
            let backlinks = get_backlinks(conn, b.id).unwrap();
            assert_eq!(backlinks.len(), 1);
            assert_eq!(backlinks[0].title, "Note A");
            Ok(())
        })
        .expect("test failed");
    }

    #[test]
    fn test_get_outgoing_links() {
        let (db, tmp) = setup();
        db.with_conn(|conn| {
            let a = notes::create_note(
                conn,
                tmp.path(),
                "Note A",
                None,
                None,
                None,
                "Links to [[Note B]] and [[Missing]]",
            )
            .unwrap();
            let _b =
                notes::create_note(conn, tmp.path(), "Note B", None, None, None, "Exists")
                    .unwrap();
            resolve_links(conn).unwrap();
            let outgoing = get_outgoing_links(conn, a.id).unwrap();
            assert_eq!(outgoing.len(), 2);
            let resolved: Vec<_> = outgoing.iter().filter(|l| l.resolved).collect();
            let unresolved: Vec<_> = outgoing.iter().filter(|l| !l.resolved).collect();
            assert_eq!(resolved.len(), 1);
            assert_eq!(unresolved.len(), 1);
            Ok(())
        })
        .expect("test failed");
    }

    #[test]
    fn test_get_graph_data() {
        let (db, tmp) = setup();
        db.with_conn(|conn| {
            let _a =
                notes::create_note(conn, tmp.path(), "A", None, None, None, "Links to [[B]]")
                    .unwrap();
            let _b =
                notes::create_note(conn, tmp.path(), "B", None, None, None, "Links to [[A]]")
                    .unwrap();
            resolve_links(conn).unwrap();
            let graph = get_graph_data(conn).unwrap();
            assert_eq!(graph.nodes.len(), 2);
            assert_eq!(graph.edges.len(), 2);
            Ok(())
        })
        .expect("test failed");
    }

    #[test]
    fn test_get_local_graph_depth() {
        let (db, tmp) = setup();
        db.with_conn(|conn| {
            let a =
                notes::create_note(conn, tmp.path(), "A", None, None, None, "Links to [[B]]")
                    .unwrap();
            let _b =
                notes::create_note(conn, tmp.path(), "B", None, None, None, "Links to [[C]]")
                    .unwrap();
            let _c = notes::create_note(conn, tmp.path(), "C", None, None, None, "Leaf").unwrap();
            resolve_links(conn).unwrap();

            let local1 = get_local_graph(conn, a.id, 1).unwrap();
            assert_eq!(local1.nodes.len(), 2); // A and B

            let local2 = get_local_graph(conn, a.id, 2).unwrap();
            assert_eq!(local2.nodes.len(), 3); // A, B, and C
            Ok(())
        })
        .expect("test failed");
    }
}
