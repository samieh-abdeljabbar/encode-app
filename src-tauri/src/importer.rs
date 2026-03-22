use regex::Regex;
use std::path::Path;

/// Fetch a URL and convert its content to a markdown file in the vault.
/// Returns the relative path of the created file.
pub fn import_url(
    vault_path: &Path,
    url: &str,
    subject_slug: &str,
    topic: Option<&str>,
) -> Result<String, String> {
    // Fetch the HTML
    let html = reqwest::blocking::get(url)
        .map_err(|e| format!("Failed to fetch URL: {}", e))?
        .text()
        .map_err(|e| format!("Failed to read response: {}", e))?;

    // Extract title from <title> tag
    let title = extract_title(&html).unwrap_or_else(|| "Imported Page".to_string());
    let topic_name = topic.unwrap_or(&title);

    // Convert HTML to markdown-like text
    let content = html_to_markdown(&html);
    let word_count = content.split_whitespace().count();
    let read_minutes = (word_count as f64 / 200.0).ceil() as usize;

    // Build the markdown file
    let now = chrono::Local::now().format("%Y-%m-%dT%H:%M:%S").to_string();
    let slug = topic_name
        .to_lowercase()
        .replace(' ', "-")
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '-')
        .collect::<String>();

    let markdown = format!(
        "---\nsubject: {subject}\ntopic: {topic}\nsource_url: {url}\nimported_at: {now}\nword_count: {wc}\nestimated_read_minutes: {rm}\nstatus: unread\n---\n\n{content}",
        subject = subject_slug.replace('-', " "),
        topic = topic_name,
        url = url,
        now = now,
        wc = word_count,
        rm = read_minutes,
        content = content,
    );

    // Save to vault
    let relative_path = format!("subjects/{}/chapters/{}.md", subject_slug, slug);
    crate::vault::write_file(vault_path, &relative_path, &markdown)?;

    Ok(relative_path)
}

fn extract_title(html: &str) -> Option<String> {
    let re = Regex::new(r"(?i)<title[^>]*>(.*?)</title>").ok()?;
    re.captures(html)
        .and_then(|cap| cap.get(1))
        .map(|m| decode_entities(m.as_str().trim()))
}

/// Simple HTML to markdown converter.
/// Strips tags while preserving structure (headings, paragraphs, lists).
fn html_to_markdown(html: &str) -> String {
    let mut text = html.to_string();

    // Remove script and style blocks entirely
    let script_re = Regex::new(r"(?is)<(script|style|nav|footer|header)[^>]*>.*?</\1>").unwrap();
    text = script_re.replace_all(&text, "").to_string();

    // Convert headings
    for level in (1..=6).rev() {
        let h_re = Regex::new(&format!(r"(?is)<h{}[^>]*>(.*?)</h{}>", level, level)).unwrap();
        let prefix = "#".repeat(level);
        text = h_re
            .replace_all(&text, |caps: &regex::Captures| {
                format!("\n\n{} {}\n\n", prefix, strip_tags(caps.get(1).map_or("", |m| m.as_str())).trim())
            })
            .to_string();
    }

    // Convert paragraphs to double newlines
    let p_re = Regex::new(r"(?is)<p[^>]*>(.*?)</p>").unwrap();
    text = p_re
        .replace_all(&text, |caps: &regex::Captures| {
            format!("\n\n{}\n", strip_tags(caps.get(1).map_or("", |m| m.as_str())).trim())
        })
        .to_string();

    // Convert list items
    let li_re = Regex::new(r"(?is)<li[^>]*>(.*?)</li>").unwrap();
    text = li_re
        .replace_all(&text, |caps: &regex::Captures| {
            format!("\n- {}", strip_tags(caps.get(1).map_or("", |m| m.as_str())).trim())
        })
        .to_string();

    // Convert <br> to newlines
    let br_re = Regex::new(r"(?i)<br\s*/?>").unwrap();
    text = br_re.replace_all(&text, "\n").to_string();

    // Convert bold/italic
    let bold_re = Regex::new(r"(?is)<(strong|b)>(.*?)</\1>").unwrap();
    text = bold_re.replace_all(&text, "**$2**").to_string();

    let italic_re = Regex::new(r"(?is)<(em|i)>(.*?)</\1>").unwrap();
    text = italic_re.replace_all(&text, "*$2*").to_string();

    // Convert links
    let link_re = Regex::new(r#"(?is)<a[^>]*href="([^"]*)"[^>]*>(.*?)</a>"#).unwrap();
    text = link_re.replace_all(&text, "[$2]($1)").to_string();

    // Strip all remaining HTML tags
    text = strip_tags(&text);

    // Decode HTML entities
    text = decode_entities(&text);

    // Clean up excessive whitespace
    let multi_newline = Regex::new(r"\n{3,}").unwrap();
    text = multi_newline.replace_all(&text, "\n\n").to_string();

    text.trim().to_string()
}

fn strip_tags(html: &str) -> String {
    let tag_re = Regex::new(r"<[^>]+>").unwrap();
    tag_re.replace_all(html, "").to_string()
}

fn decode_entities(text: &str) -> String {
    text.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&apos;", "'")
        .replace("&nbsp;", " ")
        .replace("&#x27;", "'")
        .replace("&#x2F;", "/")
}
