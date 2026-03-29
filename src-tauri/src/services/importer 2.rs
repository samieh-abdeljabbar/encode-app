//! URL import pipeline: fetch HTML, convert to markdown, split into sections.

use regex::Regex;
use std::sync::LazyLock;

// Static compiled regexes — compiled once, reused on every call.
static RE_STRIP: LazyLock<Vec<Regex>> = LazyLock::new(|| {
    ["script", "style", "nav", "footer", "header", "noscript"]
        .iter()
        .map(|tag| Regex::new(&format!(r"(?is)<{tag}[^>]*>.*?</{tag}>")).unwrap())
        .collect()
});

static RE_HEADINGS: LazyLock<Vec<(String, Regex)>> = LazyLock::new(|| {
    (1..=6)
        .rev()
        .map(|level| {
            let prefix = "#".repeat(level);
            let re = Regex::new(&format!(r"(?is)<h{level}[^>]*>(.*?)</h{level}>")).unwrap();
            (prefix, re)
        })
        .collect()
});

static RE_P: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?is)<p[^>]*>(.*?)</p>").unwrap());
static RE_A: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"(?is)<a[^>]*href="([^"]*)"[^>]*>(.*?)</a>"#).unwrap());
static RE_STRONG: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?is)<(?:strong|b)[^>]*>(.*?)</(?:strong|b)>").unwrap());
static RE_EM: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?is)<(?:em|i)[^>]*>(.*?)</(?:em|i)>").unwrap());
static RE_LI: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?is)<li[^>]*>(.*?)</li>").unwrap());
static RE_PRE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?is)<pre[^>]*><code[^>]*>(.*?)</code></pre>").unwrap());
static RE_CODE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?is)<code[^>]*>(.*?)</code>").unwrap());
static RE_BR: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)<br\s*/?>").unwrap());
static RE_TAGS: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"<[^>]+>").unwrap());
static RE_BLANKS: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\n{3,}").unwrap());
static RE_TITLE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?is)<title[^>]*>(.*?)</title>").unwrap());
static RE_H1: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?is)<h1[^>]*>(.*?)</h1>").unwrap());

pub fn html_to_markdown(html: &str) -> String {
    let mut result = html.to_string();

    for re in RE_STRIP.iter() {
        result = re.replace_all(&result, "").to_string();
    }

    for (prefix, re) in RE_HEADINGS.iter() {
        result = re
            .replace_all(&result, |caps: &regex::Captures| {
                format!("{prefix} {}", caps[1].trim())
            })
            .to_string();
    }

    result = RE_P
        .replace_all(&result, |caps: &regex::Captures| {
            format!("{}\n\n", caps[1].trim())
        })
        .to_string();

    result = RE_A
        .replace_all(&result, |caps: &regex::Captures| {
            format!("[{}]({})", caps[2].trim(), &caps[1])
        })
        .to_string();

    result = RE_STRONG.replace_all(&result, "**$1**").to_string();
    result = RE_EM.replace_all(&result, "*$1*").to_string();

    result = RE_LI
        .replace_all(&result, |caps: &regex::Captures| {
            format!("- {}", caps[1].trim())
        })
        .to_string();

    result = RE_PRE.replace_all(&result, "```\n$1\n```").to_string();
    result = RE_CODE.replace_all(&result, "`$1`").to_string();
    result = RE_BR.replace_all(&result, "\n").to_string();
    result = RE_TAGS.replace_all(&result, "").to_string();

    result = result
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&nbsp;", " ");

    result = RE_BLANKS.replace_all(&result, "\n\n").to_string();

    result.trim().to_string()
}

fn first_tag_text(html: &str, re: &Regex) -> Option<String> {
    re.captures(html).and_then(|c| {
        let t = c[1].trim().to_string();
        if t.is_empty() {
            None
        } else {
            Some(t)
        }
    })
}

pub fn extract_title(html: &str) -> Option<String> {
    first_tag_text(html, &RE_TITLE).or_else(|| first_tag_text(html, &RE_H1))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_strips_script_and_style_tags() {
        let html = "<p>Hello</p><script>alert('x')</script><style>.a{}</style><p>World</p>";
        let md = html_to_markdown(html);
        assert!(!md.contains("alert"));
        assert!(!md.contains(".a{}"));
        assert!(md.contains("Hello"));
        assert!(md.contains("World"));
    }

    #[test]
    fn test_converts_headings() {
        let html = "<h1>Title</h1><h2>Section</h2><h3>Sub</h3>";
        let md = html_to_markdown(html);
        assert!(md.contains("# Title"));
        assert!(md.contains("## Section"));
        assert!(md.contains("### Sub"));
    }

    #[test]
    fn test_converts_paragraphs() {
        let html = "<p>First paragraph.</p><p>Second paragraph.</p>";
        let md = html_to_markdown(html);
        assert!(md.contains("First paragraph."));
        assert!(md.contains("Second paragraph."));
    }

    #[test]
    fn test_converts_links() {
        let html = r#"<a href="https://example.com">Click here</a>"#;
        let md = html_to_markdown(html);
        assert!(md.contains("[Click here](https://example.com)"));
    }

    #[test]
    fn test_converts_bold_and_italic() {
        let html = "<strong>bold</strong> and <em>italic</em>";
        let md = html_to_markdown(html);
        assert!(md.contains("**bold**"));
        assert!(md.contains("*italic*"));
    }

    #[test]
    fn test_converts_list_items() {
        let html = "<ul><li>First</li><li>Second</li></ul>";
        let md = html_to_markdown(html);
        assert!(md.contains("- First"));
        assert!(md.contains("- Second"));
    }

    #[test]
    fn test_strips_remaining_html_tags() {
        let html = "<div class='wrapper'><span>Text</span></div>";
        let md = html_to_markdown(html);
        assert!(!md.contains("<div"));
        assert!(!md.contains("<span"));
        assert!(md.contains("Text"));
    }

    #[test]
    fn test_decodes_html_entities() {
        let html = "<p>A &amp; B &lt; C &gt; D &quot;E&quot;</p>";
        let md = html_to_markdown(html);
        assert!(md.contains("A & B < C > D \"E\""));
    }

    #[test]
    fn test_extract_title_from_title_tag() {
        let html = "<html><head><title>My Page</title></head><body></body></html>";
        assert_eq!(extract_title(html), Some("My Page".to_string()));
    }

    #[test]
    fn test_extract_title_from_h1() {
        let html = "<html><body><h1>Main Heading</h1></body></html>";
        assert_eq!(extract_title(html), Some("Main Heading".to_string()));
    }

    #[test]
    fn test_extract_title_prefers_title_tag() {
        let html = "<title>Page Title</title><h1>Heading</h1>";
        assert_eq!(extract_title(html), Some("Page Title".to_string()));
    }
}
