use regex::Regex;
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
}
