mod db;
mod importer;
mod indexer;
mod vault;

use db::{Database, SearchResult, StreakInfo};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Arc;
use vault::Subject;

/// App state shared across all Tauri commands
struct AppState {
    vault_path: PathBuf,
    db: Arc<Database>,
    _watcher: Option<notify::RecommendedWatcher>,
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
    let config_path = state.vault_path.join(".encode").join("config.toml");
    let content = std::fs::read_to_string(&config_path).unwrap_or_default();

    let mut config = AppConfig {
        vault_path: state.vault_path.to_string_lossy().to_string(),
        ai_provider: "none".to_string(),
        ollama_model: "llama3.1:8b".to_string(),
        ollama_url: "http://localhost:11434".to_string(),
    };

    for line in content.lines() {
        let line = line.trim();
        if let Some(val) = line.strip_prefix("provider =") {
            config.ai_provider = val.trim().trim_matches('"').to_string();
        } else if let Some(val) = line.strip_prefix("ollama_model =") {
            config.ollama_model = val.trim().trim_matches('"').to_string();
        } else if let Some(val) = line.strip_prefix("ollama_url =") {
            config.ollama_url = val.trim().trim_matches('"').to_string();
        }
    }

    Ok(config)
}

#[tauri::command]
fn save_config(state: tauri::State<'_, AppState>, config: AppConfig) -> Result<(), String> {
    let toml = format!(
        r#"[ai]
provider = "{}"
ollama_model = "{}"
ollama_url = "{}"
"#,
        config.ai_provider, config.ollama_model, config.ollama_url
    );

    let config_path = state.vault_path.join(".encode").join("config.toml");
    std::fs::write(&config_path, toml).map_err(|e| format!("Failed to save config: {}", e))
}

#[tauri::command]
fn create_subject(state: tauri::State<'_, AppState>, name: String) -> Result<String, String> {
    vault::create_subject_dir(&state.vault_path, &name)
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

    // Initial index scan in background
    let db_clone = Arc::clone(&db);
    let vault_clone = vault_path.clone();
    std::thread::spawn(move || match indexer::scan_vault(&vault_clone, &db_clone) {
        Ok(count) => println!("Indexed {} files", count),
        Err(e) => eprintln!("Initial scan failed: {}", e),
    });

    // Start file watcher
    let watcher = indexer::start_watcher(vault_path.clone(), Arc::clone(&db)).ok();

    tauri::Builder::default()
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
        })
        .invoke_handler(tauri::generate_handler![
            init_vault,
            get_vault_path,
            list_subjects,
            list_files,
            read_vault_file,
            write_vault_file,
            search_vault,
            get_daily_commitment,
            save_daily_commitment,
            get_streak,
            get_config,
            save_config,
            create_subject,
            import_url,
            rebuild_index,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
