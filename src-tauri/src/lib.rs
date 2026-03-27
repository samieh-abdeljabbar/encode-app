mod ai;
mod db;
mod importer;
mod indexer;
mod vault;

use db::{
    Database, DueCard, QueryResult, QuizHistoryPoint, SearchResult, StreakInfo, SubjectGrade,
    SubjectMastery, SubjectStudyTime, WeakTopic,
};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use tauri::Emitter;
use vault::Subject;

const AI_ACTIVITY_LIMIT: usize = 30;
static AI_REQUEST_COUNTER: AtomicU64 = AtomicU64::new(1);

/// App state shared across all Tauri commands
struct AppState {
    vault_path: PathBuf,
    db: Arc<Database>,
    _watcher: Option<notify::RecommendedWatcher>,
    sandboxes: Mutex<HashMap<String, db::SandboxDb>>,
    ai_activity: Mutex<VecDeque<AiActivityEntry>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiActivityEntry {
    pub request_id: String,
    pub feature: String,
    pub provider: String,
    pub model_or_command: String,
    pub status: String,
    pub started_at: String,
    pub duration_ms: Option<u64>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DailyCommitment {
    pub date: String,
    pub cue: String,
    pub action: String,
    pub completed: bool,
    pub completed_at: Option<String>,
    pub reflection: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AppConfig {
    pub vault_path: String,
    pub ai_provider: String,
    pub ollama_model: String,
    pub ollama_url: String,
    pub openai_model: String,
    pub deepseek_model: String,
    pub claude_model: String,
    pub gemini_model: String,
    pub api_key: String,
    pub cli_command: String,
    pub cli_args: Vec<String>,
    pub cli_workdir: String,
    // User profile for personalized AI
    pub user_role: String,
    pub user_hobbies: String,
    pub user_learning_style: String,
    // Pomodoro timer settings (stored as seconds)
    pub pomodoro_study_secs: u32,
    pub pomodoro_break_secs: u32,
    pub pomodoro_long_break_secs: u32,
    // Quick timer presets (seconds, e.g. [1500, 1800, 2700, 3600])
    pub quick_timers: Vec<u32>,
    pub pomodoro_sound_enabled: bool,
    pub pomodoro_notifications_enabled: bool,
}

fn default_app_config(vault_path: &std::path::Path) -> AppConfig {
    AppConfig {
        vault_path: vault_path.to_string_lossy().to_string(),
        ai_provider: "none".to_string(),
        ollama_model: "llama3.1:8b".to_string(),
        ollama_url: "http://localhost:11434".to_string(),
        openai_model: "gpt-4o-mini".to_string(),
        deepseek_model: "deepseek-chat".to_string(),
        claude_model: "claude-sonnet-4-20250514".to_string(),
        gemini_model: "gemini-2.0-flash".to_string(),
        api_key: String::new(),
        cli_command: String::new(),
        cli_args: Vec::new(),
        cli_workdir: String::new(),
        user_role: String::new(),
        user_hobbies: String::new(),
        user_learning_style: String::new(),
        pomodoro_study_secs: 1500,
        pomodoro_break_secs: 300,
        pomodoro_long_break_secs: 900,
        quick_timers: vec![1500, 1800, 2700, 3600],
        pomodoro_sound_enabled: true,
        pomodoro_notifications_enabled: true,
    }
}

fn parse_string_list(value: &str) -> Vec<String> {
    let trimmed = value.trim();
    if trimmed.starts_with('[') && trimmed.ends_with(']') {
        return trimmed[1..trimmed.len() - 1]
            .split(',')
            .map(|part| part.trim().trim_matches('"').trim_matches('\'').to_string())
            .filter(|part| !part.is_empty())
            .collect();
    }

    trimmed
        .trim_matches('"')
        .split('\n')
        .map(|part| part.trim().to_string())
        .filter(|part| !part.is_empty())
        .collect()
}

fn format_string_list(values: &[String]) -> String {
    format!(
        "[{}]",
        values
            .iter()
            .map(|value| format!("\"{}\"", escape_toml_string(value)))
            .collect::<Vec<_>>()
            .join(", ")
    )
}

fn read_app_config(vault_path: &std::path::Path) -> AppConfig {
    let config_path = vault_path.join(".encode").join("config.toml");
    let content = std::fs::read_to_string(&config_path).unwrap_or_default();
    let mut config = default_app_config(vault_path);

    for line in content.lines() {
        let line = line.trim();
        if let Some(val) = line.strip_prefix("provider =") {
            config.ai_provider = val.trim().trim_matches('"').to_string();
        } else if let Some(val) = line.strip_prefix("ollama_model =") {
            config.ollama_model = val.trim().trim_matches('"').to_string();
        } else if let Some(val) = line.strip_prefix("ollama_url =") {
            config.ollama_url = val.trim().trim_matches('"').to_string();
        } else if let Some(val) = line.strip_prefix("openai_model =") {
            config.openai_model = val.trim().trim_matches('"').to_string();
        } else if let Some(val) = line.strip_prefix("deepseek_model =") {
            config.deepseek_model = val.trim().trim_matches('"').to_string();
        } else if let Some(val) = line.strip_prefix("claude_model =") {
            config.claude_model = val.trim().trim_matches('"').to_string();
        } else if let Some(val) = line.strip_prefix("gemini_model =") {
            config.gemini_model = val.trim().trim_matches('"').to_string();
        } else if let Some(val) = line.strip_prefix("api_key =") {
            config.api_key = val.trim().trim_matches('"').to_string();
        } else if let Some(val) = line.strip_prefix("cli_command =") {
            config.cli_command = val.trim().trim_matches('"').to_string();
        } else if let Some(val) = line.strip_prefix("cli_args =") {
            config.cli_args = parse_string_list(val);
        } else if let Some(val) = line.strip_prefix("cli_workdir =") {
            config.cli_workdir = val.trim().trim_matches('"').to_string();
        } else if let Some(val) = line.strip_prefix("user_role =") {
            config.user_role = val.trim().trim_matches('"').to_string();
        } else if let Some(val) = line.strip_prefix("user_hobbies =") {
            config.user_hobbies = val.trim().trim_matches('"').to_string();
        } else if let Some(val) = line.strip_prefix("user_learning_style =") {
            config.user_learning_style = val.trim().trim_matches('"').to_string();
        } else if let Some(val) = line.strip_prefix("study_secs =") {
            config.pomodoro_study_secs = val.trim().trim_matches('"').parse().unwrap_or(1500);
        } else if let Some(val) = line.strip_prefix("break_secs =") {
            config.pomodoro_break_secs = val.trim().trim_matches('"').parse().unwrap_or(300);
        } else if let Some(val) = line.strip_prefix("long_break_secs =") {
            config.pomodoro_long_break_secs = val.trim().trim_matches('"').parse().unwrap_or(900);
        } else if let Some(val) = line.strip_prefix("quick_timers =") {
            let cleaned = val.trim().trim_matches('"');
            let parsed: Vec<u32> = cleaned
                .split(',')
                .filter_map(|s| s.trim().parse().ok())
                .collect();
            if !parsed.is_empty() {
                config.quick_timers = parsed;
            }
        } else if let Some(val) = line.strip_prefix("sound_enabled =") {
            config.pomodoro_sound_enabled = matches!(val.trim(), "true" | "\"true\"");
        } else if let Some(val) = line.strip_prefix("notifications_enabled =") {
            config.pomodoro_notifications_enabled = matches!(val.trim(), "true" | "\"true\"");
        } else if let Some(val) = line.strip_prefix("study_minutes =") {
            config.pomodoro_study_secs =
                val.trim().trim_matches('"').parse::<u32>().unwrap_or(25) * 60;
        } else if let Some(val) = line.strip_prefix("break_minutes =") {
            config.pomodoro_break_secs =
                val.trim().trim_matches('"').parse::<u32>().unwrap_or(5) * 60;
        } else if let Some(val) = line.strip_prefix("long_break_minutes =") {
            config.pomodoro_long_break_secs =
                val.trim().trim_matches('"').parse::<u32>().unwrap_or(15) * 60;
        }
    }

    config
}

fn model_for_provider(config: &AppConfig) -> String {
    match config.ai_provider.as_str() {
        "ollama" => config.ollama_model.clone(),
        "openai" => config.openai_model.clone(),
        "deepseek" => config.deepseek_model.clone(),
        "claude" => config.claude_model.clone(),
        "gemini" => config.gemini_model.clone(),
        "cli" => {
            if config.cli_command.trim().is_empty() {
                "cli".to_string()
            } else {
                config.cli_command.clone()
            }
        }
        _ => String::new(),
    }
}

fn next_ai_request_id() -> String {
    format!(
        "ai-{}-{}",
        chrono::Utc::now().timestamp_millis(),
        AI_REQUEST_COUNTER.fetch_add(1, Ordering::Relaxed)
    )
}

fn cli_command_basename(command: &str) -> String {
    Path::new(command)
        .file_name()
        .and_then(|value| value.to_str())
        .filter(|value| !value.is_empty())
        .unwrap_or("cli")
        .to_string()
}

fn model_or_command_for_activity(runtime: &ai::AiRuntimeConfig) -> String {
    if runtime.provider == "cli" {
        return cli_command_basename(&runtime.cli_command);
    }

    if runtime.model.trim().is_empty() {
        runtime.provider.clone()
    } else {
        runtime.model.clone()
    }
}

fn sanitize_ai_activity_error(error: &str) -> String {
    static API_KEY_QUERY_RE: OnceLock<regex::Regex> = OnceLock::new();
    static BEARER_RE: OnceLock<regex::Regex> = OnceLock::new();
    static API_KEY_HEADER_RE: OnceLock<regex::Regex> = OnceLock::new();
    static WHITESPACE_RE: OnceLock<regex::Regex> = OnceLock::new();

    let mut sanitized = error.to_string();

    sanitized = API_KEY_QUERY_RE
        .get_or_init(|| regex::Regex::new(r"key=[^&\s]+").expect("valid api key regex"))
        .replace_all(&sanitized, "key=[redacted]")
        .into_owned();
    sanitized = BEARER_RE
        .get_or_init(|| regex::Regex::new(r"Bearer\s+[^\s]+").expect("valid bearer regex"))
        .replace_all(&sanitized, "Bearer [redacted]")
        .into_owned();
    sanitized = API_KEY_HEADER_RE
        .get_or_init(|| regex::Regex::new(r"x-api-key[=:]\s*[^\s,]+").expect("valid header regex"))
        .replace_all(&sanitized, "x-api-key=[redacted]")
        .into_owned();
    sanitized = WHITESPACE_RE
        .get_or_init(|| regex::Regex::new(r"\s+").expect("valid whitespace regex"))
        .replace_all(&sanitized, " ")
        .into_owned()
        .trim()
        .to_string();

    if sanitized.len() > 300 {
        format!("{}...", &sanitized[..300])
    } else {
        sanitized
    }
}

fn push_activity_entry(
    buffer: &mut VecDeque<AiActivityEntry>,
    entry: AiActivityEntry,
    limit: usize,
) {
    buffer.push_back(entry);
    while buffer.len() > limit {
        buffer.pop_front();
    }
}

fn record_ai_activity(state: &AppState, app: &tauri::AppHandle, entry: AiActivityEntry) {
    match state.ai_activity.lock() {
        Ok(mut activity) => push_activity_entry(&mut activity, entry.clone(), AI_ACTIVITY_LIMIT),
        Err(err) => {
            log::warn!(target: "ai_activity", "failed_to_store_activity error={}", err);
            return;
        }
    }

    match entry.status.as_str() {
        "start" => log::info!(
            target: "ai_activity",
            "request_id={} feature={} provider={} model_or_command={} status={} started_at={}",
            entry.request_id,
            entry.feature,
            entry.provider,
            entry.model_or_command,
            entry.status,
            entry.started_at,
        ),
        "success" => log::info!(
            target: "ai_activity",
            "request_id={} feature={} provider={} model_or_command={} status={} duration_ms={}",
            entry.request_id,
            entry.feature,
            entry.provider,
            entry.model_or_command,
            entry.status,
            entry.duration_ms.unwrap_or_default(),
        ),
        _ => log::warn!(
            target: "ai_activity",
            "request_id={} feature={} provider={} model_or_command={} status={} duration_ms={} error={}",
            entry.request_id,
            entry.feature,
            entry.provider,
            entry.model_or_command,
            entry.status,
            entry.duration_ms.unwrap_or_default(),
            entry.error.as_deref().unwrap_or(""),
        ),
    }

    if let Err(err) = app.emit("ai-activity-updated", &entry) {
        log::warn!(
            target: "ai_activity",
            "failed_to_emit_activity_event request_id={} error={}",
            entry.request_id,
            err
        );
    }
}

// === Tauri Commands ===

#[tauri::command]
fn init_vault(state: tauri::State<'_, AppState>) -> Result<String, String> {
    vault::init_vault(&state.vault_path)?;
    Ok(state.vault_path.to_string_lossy().to_string())
}

#[tauri::command]
fn get_vault_path(state: tauri::State<'_, AppState>) -> String {
    state.vault_path.to_string_lossy().to_string()
}

#[tauri::command]
fn list_subjects(state: tauri::State<'_, AppState>) -> Result<Vec<Subject>, String> {
    vault::list_subjects(&state.vault_path)
}

#[tauri::command]
fn list_files(
    state: tauri::State<'_, AppState>,
    subject: String,
    file_type: Option<String>,
) -> Result<Vec<vault::FileEntry>, String> {
    vault::list_files(&state.vault_path, &subject, file_type.as_deref())
}

#[tauri::command]
fn read_vault_file(state: tauri::State<'_, AppState>, path: String) -> Result<String, String> {
    vault::read_file(&state.vault_path, &path)
}

#[tauri::command]
fn write_vault_file(
    state: tauri::State<'_, AppState>,
    path: String,
    content: String,
) -> Result<(), String> {
    vault::write_file(&state.vault_path, &path, &content)
}

#[tauri::command]
fn delete_vault_file(state: tauri::State<'_, AppState>, path: String) -> Result<(), String> {
    vault::delete_file(&state.vault_path, &path)?;
    // Also remove from search index
    state.db.remove_file(&path)?;
    Ok(())
}

#[tauri::command]
fn create_vault_directory(state: tauri::State<'_, AppState>, path: String) -> Result<(), String> {
    vault::create_directory(&state.vault_path, &path)
}

#[tauri::command]
fn delete_vault_directory(state: tauri::State<'_, AppState>, path: String) -> Result<(), String> {
    vault::delete_directory(&state.vault_path, &path)
}

#[tauri::command]
fn rename_vault_directory(
    state: tauri::State<'_, AppState>,
    old_path: String,
    new_path: String,
) -> Result<(), String> {
    vault::rename_directory(&state.vault_path, &old_path, &new_path)
}

#[tauri::command]
fn search_vault(
    state: tauri::State<'_, AppState>,
    query: String,
) -> Result<Vec<SearchResult>, String> {
    state.db.search(&query)
}

#[tauri::command]
fn get_daily_commitment(
    state: tauri::State<'_, AppState>,
    date: String,
) -> Result<Option<DailyCommitment>, String> {
    let path = format!("daily/{}.md", date);
    match vault::read_file(&state.vault_path, &path) {
        Ok(content) => Ok(Some(parse_daily_markdown(&content, &date))),
        Err(_) => Ok(None),
    }
}

#[tauri::command]
fn save_daily_commitment(
    state: tauri::State<'_, AppState>,
    commitment: DailyCommitment,
) -> Result<(), String> {
    let markdown = format_daily_markdown(&commitment);
    let path = format!("daily/{}.md", commitment.date);
    vault::write_file(&state.vault_path, &path, &markdown)?;

    state.db.save_daily(
        &commitment.date,
        &commitment.action,
        commitment.completed,
        commitment.completed_at.as_deref(),
    )?;

    Ok(())
}

#[tauri::command]
fn get_streak(state: tauri::State<'_, AppState>) -> Result<StreakInfo, String> {
    state.db.get_streak()
}

#[tauri::command]
fn get_config(state: tauri::State<'_, AppState>) -> Result<AppConfig, String> {
    Ok(read_app_config(&state.vault_path))
}

fn escape_toml_string(s: &str) -> String {
    s.chars()
        .filter(|c| !c.is_control())
        .collect::<String>()
        .replace('\\', "\\\\")
        .replace('"', "\\\"")
}

#[tauri::command]
fn save_config(state: tauri::State<'_, AppState>, config: AppConfig) -> Result<(), String> {
    let toml = format!(
        r#"[ai]
provider = "{}"
ollama_model = "{}"
ollama_url = "{}"
openai_model = "{}"
deepseek_model = "{}"
claude_model = "{}"
gemini_model = "{}"
api_key = "{}"
cli_command = "{}"
cli_args = {}
cli_workdir = "{}"

[profile]
user_role = "{}"
user_hobbies = "{}"
user_learning_style = "{}"

[pomodoro]
study_secs = {}
break_secs = {}
long_break_secs = {}
quick_timers = "{}"
sound_enabled = {}
notifications_enabled = {}
"#,
        escape_toml_string(&config.ai_provider),
        escape_toml_string(&config.ollama_model),
        escape_toml_string(&config.ollama_url),
        escape_toml_string(&config.openai_model),
        escape_toml_string(&config.deepseek_model),
        escape_toml_string(&config.claude_model),
        escape_toml_string(&config.gemini_model),
        escape_toml_string(&config.api_key),
        escape_toml_string(&config.cli_command),
        format_string_list(&config.cli_args),
        escape_toml_string(&config.cli_workdir),
        escape_toml_string(&config.user_role),
        escape_toml_string(&config.user_hobbies),
        escape_toml_string(&config.user_learning_style),
        config.pomodoro_study_secs,
        config.pomodoro_break_secs,
        config.pomodoro_long_break_secs,
        config
            .quick_timers
            .iter()
            .map(|t| t.to_string())
            .collect::<Vec<_>>()
            .join(","),
        config.pomodoro_sound_enabled,
        config.pomodoro_notifications_enabled,
    );

    let config_path = state.vault_path.join(".encode").join("config.toml");
    std::fs::write(&config_path, toml).map_err(|e| format!("Failed to save config: {}", e))
}

#[tauri::command]
fn create_subject(state: tauri::State<'_, AppState>, name: String) -> Result<String, String> {
    vault::create_subject_dir(&state.vault_path, &name)
}

#[tauri::command]
fn delete_subject(state: tauri::State<'_, AppState>, slug: String) -> Result<(), String> {
    // Read subject name before deleting files (needed for quiz_history cleanup)
    let subject_md_path = state
        .vault_path
        .join("subjects")
        .join(&slug)
        .join("_subject.md");
    let subject_name = std::fs::read_to_string(&subject_md_path)
        .ok()
        .and_then(|content| {
            content
                .lines()
                .find(|l| l.starts_with("subject:"))
                .map(|l| l.trim_start_matches("subject:").trim().to_string())
        });

    vault::delete_subject(&state.vault_path, &slug)?;
    // Clean up DB entries for this subject's files
    let prefix = format!("subjects/{}/", slug);
    state.db.remove_files_by_prefix(&prefix)?;

    // Clean up quiz history by subject name
    if let Some(name) = subject_name {
        state.db.delete_quiz_history_by_subject(&name)?;
    }
    // Clean up study sessions by slug
    state.db.delete_study_sessions_by_subject(&slug)?;
    Ok(())
}

#[tauri::command]
async fn import_url(
    state: tauri::State<'_, AppState>,
    url: String,
    subject: String,
    topic: Option<String>,
) -> Result<String, String> {
    let vault_path = state.vault_path.clone();
    tauri::async_runtime::spawn_blocking(move || {
        importer::import_url(&vault_path, &url, &subject, topic.as_deref())
    })
    .await
    .map_err(|e| format!("Import task failed: {}", e))?
}

#[tauri::command]
fn rebuild_index(state: tauri::State<'_, AppState>) -> Result<usize, String> {
    indexer::scan_vault(&state.vault_path, &state.db)
}

#[tauri::command]
async fn check_ollama(url: String) -> Result<bool, String> {
    let client = reqwest::Client::new();
    match client
        .get(&format!("{}/api/tags", url))
        .timeout(std::time::Duration::from_secs(3))
        .send()
        .await
    {
        Ok(resp) => Ok(resp.status().is_success()),
        Err(_) => Ok(false),
    }
}

#[tauri::command]
async fn list_ollama_models(url: String) -> Result<Vec<String>, String> {
    let client = reqwest::Client::new();
    match client
        .get(&format!("{}/api/tags", url))
        .timeout(std::time::Duration::from_secs(5))
        .send()
        .await
    {
        Ok(resp) => {
            let text = resp.text().await.map_err(|e| e.to_string())?;
            let parsed: serde_json::Value =
                serde_json::from_str(&text).map_err(|e| e.to_string())?;
            let models = parsed["models"]
                .as_array()
                .map(|arr| {
                    arr.iter()
                        .filter_map(|m| m["name"].as_str().map(|s| s.to_string()))
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default();
            Ok(models)
        }
        Err(_) => Ok(vec![]),
    }
}

#[tauri::command]
fn get_due_cards(state: tauri::State<'_, AppState>) -> Result<Vec<DueCard>, String> {
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    state.db.get_due_cards(&today)
}

#[tauri::command]
fn get_due_count(state: tauri::State<'_, AppState>) -> Result<u32, String> {
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    state.db.get_due_count(&today)
}

#[tauri::command]
fn update_card_schedule(
    state: tauri::State<'_, AppState>,
    card_id: String,
    file_path: String,
    next_review: String,
    interval_days: f64,
    ease_factor: f64,
    last_reviewed: String,
) -> Result<(), String> {
    state.db.upsert_card_schedule(
        &card_id,
        &file_path,
        &next_review,
        interval_days,
        ease_factor,
        &last_reviewed,
    )
}

#[tauri::command]
fn get_at_risk_cards(state: tauri::State<'_, AppState>) -> Result<Vec<DueCard>, String> {
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    state.db.get_at_risk_cards(&today, 3)
}

#[tauri::command]
fn delete_card_schedule(state: tauri::State<'_, AppState>, card_id: String) -> Result<(), String> {
    state.db.delete_card_schedule(&card_id)
}

#[tauri::command]
fn rename_vault_file(
    state: tauri::State<'_, AppState>,
    old_path: String,
    new_path: String,
) -> Result<(), String> {
    vault::rename_file(&state.vault_path, &old_path, &new_path)?;
    // Update index: remove old, let watcher re-index new
    state.db.remove_file(&old_path)?;
    Ok(())
}

#[tauri::command]
fn record_quiz_result(
    state: tauri::State<'_, AppState>,
    subject: String,
    topic: String,
    bloom_level: u32,
    correct: bool,
) -> Result<(), String> {
    state
        .db
        .record_quiz_result(&subject, &topic, bloom_level, correct)
}

#[tauri::command]
fn get_subject_grades(state: tauri::State<'_, AppState>) -> Result<Vec<SubjectGrade>, String> {
    state.db.get_subject_grades()
}

#[tauri::command]
async fn ai_request_cmd(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    feature: String,
    system_prompt: String,
    user_prompt: String,
    max_tokens: u32,
) -> Result<ai::AiResponse, String> {
    let config = read_app_config(&state.vault_path);
    let runtime = ai::AiRuntimeConfig {
        provider: config.ai_provider.clone(),
        model: model_for_provider(&config),
        url: config.ollama_url.clone(),
        api_key: if config.api_key.is_empty() {
            None
        } else {
            Some(config.api_key.clone())
        },
        cli_command: config.cli_command.clone(),
        cli_args: config.cli_args.clone(),
        cli_workdir: if config.cli_workdir.trim().is_empty() {
            state.vault_path.to_string_lossy().to_string()
        } else {
            config.cli_workdir.clone()
        },
    };

    if runtime.provider == "none" || runtime.provider.trim().is_empty() {
        return Err("No AI provider configured".to_string());
    }

    let request_id = next_ai_request_id();
    let started_at = chrono::Utc::now().to_rfc3339();
    let model_or_command = model_or_command_for_activity(&runtime);

    record_ai_activity(
        &state,
        &app,
        AiActivityEntry {
            request_id: request_id.clone(),
            feature: feature.clone(),
            provider: runtime.provider.clone(),
            model_or_command: model_or_command.clone(),
            status: "start".to_string(),
            started_at: started_at.clone(),
            duration_ms: None,
            error: None,
        },
    );

    let started = std::time::Instant::now();
    match ai::ai_request(&runtime, &system_prompt, &user_prompt, max_tokens).await {
        Ok(response) => {
            record_ai_activity(
                &state,
                &app,
                AiActivityEntry {
                    request_id,
                    feature,
                    provider: runtime.provider.clone(),
                    model_or_command,
                    status: "success".to_string(),
                    started_at,
                    duration_ms: Some(started.elapsed().as_millis() as u64),
                    error: None,
                },
            );
            Ok(response)
        }
        Err(error) => {
            let sanitized_error = sanitize_ai_activity_error(&error);
            record_ai_activity(
                &state,
                &app,
                AiActivityEntry {
                    request_id,
                    feature,
                    provider: runtime.provider.clone(),
                    model_or_command,
                    status: "failure".to_string(),
                    started_at,
                    duration_ms: Some(started.elapsed().as_millis() as u64),
                    error: Some(sanitized_error),
                },
            );
            Err(error)
        }
    }
}

#[tauri::command]
async fn test_ai_connection(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    provider: String,
    model: String,
    url: String,
    api_key: String,
    cli_command: String,
    cli_args: Vec<String>,
    cli_workdir: String,
) -> Result<String, String> {
    let runtime = ai::AiRuntimeConfig {
        provider,
        model,
        url,
        api_key: if api_key.is_empty() {
            None
        } else {
            Some(api_key)
        },
        cli_command,
        cli_args,
        cli_workdir,
    };

    if runtime.provider == "none" || runtime.provider.trim().is_empty() {
        return Err("No AI provider configured".to_string());
    }

    let request_id = next_ai_request_id();
    let started_at = chrono::Utc::now().to_rfc3339();
    let model_or_command = model_or_command_for_activity(&runtime);

    record_ai_activity(
        &state,
        &app,
        AiActivityEntry {
            request_id: request_id.clone(),
            feature: "settings_connection_test".to_string(),
            provider: runtime.provider.clone(),
            model_or_command: model_or_command.clone(),
            status: "start".to_string(),
            started_at: started_at.clone(),
            duration_ms: None,
            error: None,
        },
    );

    let started = std::time::Instant::now();
    match ai::ai_request(&runtime, "Reply with exactly: OK", "Test connection", 10).await {
        Ok(result) => {
            record_ai_activity(
                &state,
                &app,
                AiActivityEntry {
                    request_id,
                    feature: "settings_connection_test".to_string(),
                    provider: runtime.provider.clone(),
                    model_or_command,
                    status: "success".to_string(),
                    started_at,
                    duration_ms: Some(started.elapsed().as_millis() as u64),
                    error: None,
                },
            );
            Ok(result.text)
        }
        Err(error) => {
            let sanitized_error = sanitize_ai_activity_error(&error);
            record_ai_activity(
                &state,
                &app,
                AiActivityEntry {
                    request_id,
                    feature: "settings_connection_test".to_string(),
                    provider: runtime.provider.clone(),
                    model_or_command,
                    status: "failure".to_string(),
                    started_at,
                    duration_ms: Some(started.elapsed().as_millis() as u64),
                    error: Some(sanitized_error),
                },
            );
            Err(error)
        }
    }
}

#[tauri::command]
fn get_ai_activity(state: tauri::State<'_, AppState>) -> Result<Vec<AiActivityEntry>, String> {
    let activity = state.ai_activity.lock().map_err(|e| e.to_string())?;
    Ok(activity.iter().rev().cloned().collect())
}

// === Subject Mastery ===

#[tauri::command]
fn get_subject_mastery(
    state: tauri::State<'_, AppState>,
    subject: String,
) -> Result<SubjectMastery, String> {
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    state.db.get_subject_mastery(&subject, &today)
}

// === Quiz Analytics ===

#[tauri::command]
fn get_quiz_history_timeline(
    state: tauri::State<'_, AppState>,
    subject: Option<String>,
) -> Result<Vec<QuizHistoryPoint>, String> {
    state.db.get_quiz_history_timeline(subject.as_deref())
}

#[tauri::command]
fn get_weak_topics(
    state: tauri::State<'_, AppState>,
    subject: Option<String>,
) -> Result<Vec<WeakTopic>, String> {
    state.db.get_weak_topics(subject.as_deref())
}

// === SQL Sandbox ===

#[tauri::command]
fn create_sandbox(state: tauri::State<'_, AppState>, setup_sql: String) -> Result<String, String> {
    let sandbox = db::SandboxDb::new()?;
    sandbox.execute_setup(&setup_sql)?;
    let id = format!("sandbox-{}", chrono::Utc::now().timestamp_millis());
    let mut sandboxes = state.sandboxes.lock().map_err(|e| e.to_string())?;
    sandboxes.insert(id.clone(), sandbox);
    Ok(id)
}

#[tauri::command]
fn execute_sandbox_query(
    state: tauri::State<'_, AppState>,
    sandbox_id: String,
    query: String,
) -> Result<QueryResult, String> {
    let sandboxes = state.sandboxes.lock().map_err(|e| e.to_string())?;
    let sandbox = sandboxes
        .get(&sandbox_id)
        .ok_or_else(|| "Sandbox not found. It may have been cleaned up.".to_string())?;
    sandbox.execute_query(&query)
}

#[tauri::command]
fn destroy_sandbox(state: tauri::State<'_, AppState>, sandbox_id: String) -> Result<(), String> {
    let mut sandboxes = state.sandboxes.lock().map_err(|e| e.to_string())?;
    sandboxes.remove(&sandbox_id);
    Ok(())
}

// === Study Session Tracking ===

#[tauri::command]
fn record_pomodoro_session(
    state: tauri::State<'_, AppState>,
    id: String,
    subject_name: String,
    subject_slug: String,
    duration_secs: i64,
    started_at: String,
    completed_at: String,
) -> Result<(), String> {
    // Build the tracking markdown file for today
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let tracking_path = format!("tracking/{}.md", today);

    let session_block = format!(
        "\n> [!session] id: {}\n> **Subject:** {}\n> **Subject Slug:** {}\n> **Duration:** {}\n> **Started:** {}\n> **Completed:** {}\n",
        id, subject_name, subject_slug, duration_secs, started_at, completed_at
    );

    // Read existing file or create new with frontmatter
    let full_path = state.vault_path.join(&tracking_path);
    let content = if full_path.exists() {
        let existing = std::fs::read_to_string(&full_path)
            .map_err(|e| format!("Failed to read tracking file: {}", e))?;
        format!("{}{}", existing, session_block)
    } else {
        format!(
            "---\ntype: tracking\ndate: {}\n---\n\n# Study Sessions: {}\n{}",
            today, today, session_block
        )
    };

    vault::write_file(&state.vault_path, &tracking_path, &content)?;

    // Also insert into SQLite for fast aggregation
    state.db.record_study_session(
        &id,
        &subject_name,
        &subject_slug,
        duration_secs,
        &started_at,
        &completed_at,
    )?;

    Ok(())
}

#[tauri::command]
fn get_study_time_by_subject(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<SubjectStudyTime>, String> {
    state.db.get_study_time_by_subject()
}

#[tauri::command]
fn get_todays_study_time(state: tauri::State<'_, AppState>) -> Result<u32, String> {
    state.db.get_todays_study_time()
}

// === Helpers ===

fn parse_daily_markdown(content: &str, date: &str) -> DailyCommitment {
    let mut cue = String::new();
    let mut action = String::new();
    let mut completed = false;
    let mut completed_at = None;
    let mut reflection = None;
    let mut in_reflection = false;
    let mut reflection_lines = Vec::new();

    for line in content.lines() {
        if let Some(val) = line.strip_prefix("**Cue:**") {
            cue = val.trim().to_string();
            in_reflection = false;
        } else if let Some(val) = line.strip_prefix("**Action:**") {
            action = val.trim().to_string();
            in_reflection = false;
        } else if let Some(val) = line.strip_prefix("**Completed:**") {
            completed = val.trim() == "true";
            in_reflection = false;
        } else if let Some(val) = line.strip_prefix("**Completed at:**") {
            completed_at = Some(val.trim().to_string());
            in_reflection = false;
        } else if let Some(val) = line.strip_prefix("**Reflection:**") {
            in_reflection = true;
            let first = val.trim();
            if !first.is_empty() {
                reflection_lines.push(first.to_string());
            }
        } else if in_reflection {
            reflection_lines.push(line.to_string());
        }
    }

    if !reflection_lines.is_empty() {
        reflection = Some(reflection_lines.join("\n").trim().to_string());
    }

    DailyCommitment {
        date: date.to_string(),
        cue,
        action,
        completed,
        completed_at,
        reflection,
    }
}

fn format_daily_markdown(c: &DailyCommitment) -> String {
    let mut md = format!(
        "---\ntype: daily\ndate: {}\n---\n\n# Daily Commitment: {}\n\n**Cue:** {}\n**Action:** {}\n**Completed:** {}",
        c.date, c.date, c.cue, c.action, c.completed
    );
    if let Some(ref at) = c.completed_at {
        md.push_str(&format!("\n**Completed at:** {}", at));
    }
    if let Some(ref r) = c.reflection {
        md.push_str(&format!("\n**Reflection:** {}", r));
    }
    md.push('\n');
    md
}

// === App Entry Point ===

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let vault_path = vault::default_vault_path();

    // Initialize vault directory structure
    vault::init_vault(&vault_path).expect("Failed to initialize vault");

    // Open database
    let db = Arc::new(Database::open(&vault_path).expect("Failed to open database"));

    // Initial index scan + orphan cleanup in background
    let db_clone = Arc::clone(&db);
    let vault_clone = vault_path.clone();
    std::thread::spawn(move || {
        match indexer::scan_vault(&vault_clone, &db_clone) {
            Ok(count) => println!("Indexed {} files", count),
            Err(e) => eprintln!("Initial scan failed: {}", e),
        }
        // Clean up orphaned sr_schedule entries
        match db_clone.cleanup_orphaned_sr_schedules(&vault_clone) {
            Ok(removed) => {
                if removed > 0 {
                    println!("Cleaned up {} orphaned sr_schedule entries", removed)
                }
            }
            Err(e) => eprintln!("SR schedule cleanup failed: {}", e),
        }
        // Clean up quiz_history and study_sessions for deleted subjects
        if let Ok(subjects) = vault::list_subjects(&vault_clone) {
            let names: Vec<String> = subjects.iter().map(|s| s.name.clone()).collect();
            let slugs: Vec<String> = subjects.iter().map(|s| s.slug.clone()).collect();
            if let Err(e) = db_clone.cleanup_orphaned_quiz_history(&names) {
                eprintln!("Quiz history cleanup failed: {}", e);
            }
            if let Err(e) = db_clone.cleanup_orphaned_study_sessions(&slugs) {
                eprintln!("Study session cleanup failed: {}", e);
            }
        }
    });

    // Start file watcher
    let watcher = indexer::start_watcher(vault_path.clone(), Arc::clone(&db)).ok();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .manage(AppState {
            vault_path,
            db,
            _watcher: watcher,
            sandboxes: Mutex::new(HashMap::new()),
            ai_activity: Mutex::new(VecDeque::new()),
        })
        .invoke_handler(tauri::generate_handler![
            init_vault,
            get_vault_path,
            list_subjects,
            list_files,
            read_vault_file,
            write_vault_file,
            delete_vault_file,
            create_vault_directory,
            delete_vault_directory,
            rename_vault_directory,
            search_vault,
            get_daily_commitment,
            save_daily_commitment,
            get_streak,
            get_config,
            save_config,
            create_subject,
            delete_subject,
            import_url,
            rebuild_index,
            check_ollama,
            list_ollama_models,
            ai_request_cmd,
            test_ai_connection,
            get_ai_activity,
            get_due_cards,
            get_due_count,
            get_at_risk_cards,
            update_card_schedule,
            delete_card_schedule,
            rename_vault_file,
            get_subject_mastery,
            record_quiz_result,
            get_subject_grades,
            get_quiz_history_timeline,
            get_weak_topics,
            create_sandbox,
            execute_sandbox_query,
            destroy_sandbox,
            record_pomodoro_session,
            get_study_time_by_subject,
            get_todays_study_time,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ai_activity_buffer_enforces_retention_limit() {
        let mut entries = VecDeque::new();
        for i in 0..35 {
            push_activity_entry(
                &mut entries,
                AiActivityEntry {
                    request_id: format!("req-{}", i),
                    feature: "quiz_generate".to_string(),
                    provider: "cli".to_string(),
                    model_or_command: "encode-claude-cli.sh".to_string(),
                    status: "success".to_string(),
                    started_at: chrono::Utc::now().to_rfc3339(),
                    duration_ms: Some(10),
                    error: None,
                },
                30,
            );
        }

        assert_eq!(entries.len(), 30);
        assert_eq!(
            entries.front().map(|entry| entry.request_id.as_str()),
            Some("req-5")
        );
        assert_eq!(
            entries.back().map(|entry| entry.request_id.as_str()),
            Some("req-34")
        );
    }

    #[test]
    fn sanitize_ai_activity_error_redacts_secrets() {
        let input = "Gemini returned 403 for https://example.com?key=abc123 Authorization: Bearer secret-token x-api-key=super-secret";
        let sanitized = sanitize_ai_activity_error(input);

        assert!(!sanitized.contains("abc123"));
        assert!(!sanitized.contains("secret-token"));
        assert!(!sanitized.contains("super-secret"));
        assert!(sanitized.contains("key=[redacted]"));
        assert!(sanitized.contains("Bearer [redacted]"));
        assert!(sanitized.contains("x-api-key=[redacted]"));
    }

    #[test]
    fn cli_activity_uses_command_basename() {
        let runtime = ai::AiRuntimeConfig {
            provider: "cli".to_string(),
            model: "/Users/test/scripts/encode-claude-cli.sh".to_string(),
            url: String::new(),
            api_key: None,
            cli_command: "/Users/test/scripts/encode-claude-cli.sh".to_string(),
            cli_args: vec!["--model".to_string(), "sonnet".to_string()],
            cli_workdir: "/tmp".to_string(),
        };

        assert_eq!(
            model_or_command_for_activity(&runtime),
            "encode-claude-cli.sh"
        );
    }
}
