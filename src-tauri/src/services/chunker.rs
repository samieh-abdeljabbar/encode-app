/// Deterministic section splitting for chapter content.
/// Splits markdown on H2 (`## `) headings and computes word counts.

#[derive(Debug, Clone)]
pub struct SectionData {
    pub section_index: i32,
    pub heading: Option<String>,
    pub body_markdown: String,
    pub word_count: i32,
}

/// Extract a heading from a markdown line if it starts with #, ##, or ###.
/// Returns Some((level, title)) for heading lines, None otherwise.
fn parse_heading(line: &str) -> Option<(u8, String)> {
    let trimmed = line.trim_start();
    if let Some(rest) = trimmed.strip_prefix("### ") {
        Some((3, rest.trim().to_string()))
    } else if let Some(rest) = trimmed.strip_prefix("## ") {
        Some((2, rest.trim().to_string()))
    } else { trimmed.strip_prefix("# ").map(|rest| (1, rest.trim().to_string())) }
}

/// Split markdown content into sections on heading boundaries (H1, H2, H3).
/// Content before the first heading becomes section 0 with no heading.
/// Empty sections (heading only, no body) are preserved with word_count 0.
pub fn split_into_sections(markdown: &str) -> Vec<SectionData> {
    let mut sections: Vec<SectionData> = Vec::new();
    let mut current_heading: Option<String> = None;
    let mut current_body = String::new();
    let mut has_content_before_first_heading = false;

    for line in markdown.lines() {
        if let Some((_level, title)) = parse_heading(line) {
            // Flush the previous section
            if !current_body.is_empty() || current_heading.is_some() || has_content_before_first_heading {
                let body = current_body.trim().to_string();
                let wc = count_words(&body);
                sections.push(SectionData {
                    section_index: sections.len() as i32,
                    heading: current_heading.take(),
                    body_markdown: body,
                    word_count: wc,
                });
            }
            current_heading = Some(title);
            current_body = String::new();
        } else {
            if current_heading.is_none() && sections.is_empty() && !line.trim().is_empty() {
                has_content_before_first_heading = true;
            }
            current_body.push_str(line);
            current_body.push('\n');
        }
    }

    // Flush the last section
    let body = current_body.trim().to_string();
    if !body.is_empty() || current_heading.is_some() {
        let wc = count_words(&body);
        sections.push(SectionData {
            section_index: sections.len() as i32,
            heading: current_heading,
            body_markdown: body,
            word_count: wc,
        });
    }

    sections
}

fn count_words(text: &str) -> i32 {
    text.split_whitespace().count() as i32
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_split_on_h2_boundaries() {
        let md = "## Introduction\nThis is the intro.\n\n## Methods\nWe used X.\n\n## Results\nWe found Y.";
        let sections = split_into_sections(md);
        assert_eq!(sections.len(), 3);
        assert_eq!(sections[0].heading.as_deref(), Some("Introduction"));
        assert_eq!(sections[1].heading.as_deref(), Some("Methods"));
        assert_eq!(sections[2].heading.as_deref(), Some("Results"));
    }

    #[test]
    fn test_content_before_first_heading_becomes_section_0() {
        let md = "Some preamble text.\n\n## First Section\nBody here.";
        let sections = split_into_sections(md);
        assert_eq!(sections.len(), 2);
        assert_eq!(sections[0].heading, None);
        assert!(sections[0].body_markdown.contains("preamble"));
        assert_eq!(sections[0].section_index, 0);
        assert_eq!(sections[1].heading.as_deref(), Some("First Section"));
    }

    #[test]
    fn test_word_counts_are_computed() {
        let md = "## Section\nOne two three four five.";
        let sections = split_into_sections(md);
        assert_eq!(sections.len(), 1);
        assert_eq!(sections[0].word_count, 5);
    }

    #[test]
    fn test_empty_body_section_preserved() {
        let md = "## Empty Section\n## Next Section\nSome content.";
        let sections = split_into_sections(md);
        assert_eq!(sections.len(), 2);
        assert_eq!(sections[0].heading.as_deref(), Some("Empty Section"));
        assert_eq!(sections[0].word_count, 0);
        assert_eq!(sections[0].body_markdown, "");
    }

    #[test]
    fn test_no_headings_produces_single_section() {
        let md = "Just plain text with no headings at all.\nMultiple lines.";
        let sections = split_into_sections(md);
        assert_eq!(sections.len(), 1);
        assert_eq!(sections[0].heading, None);
        assert_eq!(sections[0].section_index, 0);
        assert!(sections[0].word_count > 0);
    }

    #[test]
    fn test_empty_input_produces_no_sections() {
        let sections = split_into_sections("");
        assert_eq!(sections.len(), 0);
    }

    #[test]
    fn test_section_indices_are_sequential() {
        let md = "## A\naa\n## B\nbb\n## C\ncc";
        let sections = split_into_sections(md);
        for (i, s) in sections.iter().enumerate() {
            assert_eq!(s.section_index, i as i32);
        }
    }

    #[test]
    fn test_h1_and_h3_are_split_boundaries() {
        let md = "# Main Title\nIntro text.\n## Sub Section\nSub text.\n### Detail\nDetail text.";
        let sections = split_into_sections(md);
        assert_eq!(sections.len(), 3);
        assert_eq!(sections[0].heading.as_deref(), Some("Main Title"));
        assert_eq!(sections[1].heading.as_deref(), Some("Sub Section"));
        assert_eq!(sections[2].heading.as_deref(), Some("Detail"));
    }

    #[test]
    fn test_h1_only_content_splits_correctly() {
        let md = "# Chapter One\nFirst content.\n# Chapter Two\nSecond content.";
        let sections = split_into_sections(md);
        assert_eq!(sections.len(), 2);
        assert_eq!(sections[0].heading.as_deref(), Some("Chapter One"));
        assert_eq!(sections[1].heading.as_deref(), Some("Chapter Two"));
    }
}
