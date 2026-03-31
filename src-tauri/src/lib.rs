pub mod db;
mod commands;
mod services;

use db::Database;
use services::config::AppConfig;
use services::vault_fs::VaultFs;
use std::path::{Path, PathBuf};
use std::sync::RwLock;

pub struct AppState {
    pub db: Database,
    pub vault_path: PathBuf,
    pub config_path: PathBuf,
    pub config: RwLock<AppConfig>,
    pub vault_fs: VaultFs,
    pub http: reqwest::Client,
}

fn resolve_vault_path() -> PathBuf {
    dirs::home_dir()
        .expect("could not determine home directory")
        .join("Encode")
}

fn ensure_vault_dirs(vault: &Path) -> Result<(), String> {
    std::fs::create_dir_all(vault.join(".encode"))
        .map_err(|e| format!("Failed to create .encode directory: {e}"))
}

#[tauri::command]
fn get_config(state: tauri::State<'_, AppState>) -> Result<AppConfig, String> {
    let config = state.config.read().map_err(|e| format!("Config lock error: {e}"))?;
    Ok(config.clone())
}

#[tauri::command]
fn save_config(state: tauri::State<'_, AppState>, config: AppConfig) -> Result<(), String> {
    config.save(&state.config_path)?;
    let mut current = state.config.write().map_err(|e| format!("Config lock error: {e}"))?;
    *current = config;
    Ok(())
}

#[tauri::command]
fn get_vault_path(state: tauri::State<'_, AppState>) -> String {
    state.vault_path.display().to_string()
}

#[tauri::command]
fn get_schema_version(state: tauri::State<'_, AppState>) -> Result<u32, String> {
    state.db.schema_version()
}

#[tauri::command]
fn read_file(state: tauri::State<'_, AppState>, relative_path: String) -> Result<String, String> {
    state.vault_fs.read_file(&relative_path)
}

#[tauri::command]
fn write_file(
    state: tauri::State<'_, AppState>,
    relative_path: String,
    content: String,
) -> Result<(), String> {
    state.vault_fs.write_atomic(&relative_path, &content)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let vault_path = resolve_vault_path();
    ensure_vault_dirs(&vault_path).expect("failed to initialize vault directories");

    let encode_dir = vault_path.join(".encode");
    let db = Database::open(&encode_dir.join("encode.db")).expect("failed to open database");
    let config_path = encode_dir.join("config.toml");
    let config = AppConfig::load(&config_path).expect("failed to load config");

    let vault_fs = VaultFs::new(vault_path.clone());
    let http = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .expect("failed to build HTTP client");

    // Background scheduler for periodic export and snapshot
    {
        let vault = vault_path.clone();
        let db_file = encode_dir.join("encode.db");
        std::thread::spawn(move || {
            let export_interval = std::time::Duration::from_secs(15 * 60); // 15 minutes
            let snapshot_interval = std::time::Duration::from_secs(60 * 60); // 1 hour
            let mut last_export = std::time::Instant::now();
            let mut last_snapshot = std::time::Instant::now();

            loop {
                std::thread::sleep(std::time::Duration::from_secs(60));

                let needs_export = last_export.elapsed() >= export_interval;
                let needs_snapshot = last_snapshot.elapsed() >= snapshot_interval;

                if needs_export || needs_snapshot {
                    if let Ok(db) = Database::open(&db_file) {
                        if needs_export {
                            let export_dir = vault.join("exports");
                            let _ = db.with_conn(|conn| {
                                services::exporter::export_all(conn, &export_dir)?;
                                commands::export::touch_setting(conn, "last_export_at")
                            });
                            last_export = std::time::Instant::now();
                        }
                        if needs_snapshot {
                            let snap_dir = vault.join(".encode").join("snapshots");
                            let _ = services::snapshot::create_snapshot(&db_file, &snap_dir);
                            let _ = db.with_conn(|conn| {
                                commands::export::touch_setting(conn, "last_snapshot_at")
                            });
                            last_snapshot = std::time::Instant::now();
                        }
                    }
                }
            }
        });
    }

    let state = AppState {
        db,
        vault_path,
        config_path,
        config: RwLock::new(config),
        vault_fs,
        http,
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            get_config,
            save_config,
            get_vault_path,
            get_schema_version,
            read_file,
            write_file,
            commands::ai::check_ai_status,
            commands::cards::create_card,
            commands::cards::list_cards,
            commands::cards::update_card,
            commands::cards::get_practice_cards,
            commands::library::create_subject,
            commands::library::list_subjects,
            commands::library::delete_subject,
            commands::library::create_chapter,
            commands::library::list_chapters,
            commands::library::get_chapter_with_sections,
            commands::library::import_url,
            commands::library::search,
            commands::library::update_chapter_content,
            commands::library::save_image,
            commands::export::export_subject_cmd,
            commands::export::export_all_cmd,
            commands::export::create_snapshot_cmd,
            commands::export::get_export_status,
            commands::export::list_snapshots_cmd,
            commands::queue::get_queue_dashboard,
            commands::reader::load_reader_session,
            commands::reader::mark_section_read,
            commands::reader::submit_section_check,
            commands::reader::submit_synthesis,
            commands::review::get_due_cards,
            commands::review::submit_card_rating,
            commands::quiz::list_quizzes,
            commands::quiz::generate_quiz,
            commands::quiz::submit_quiz_answer,
            commands::quiz::submit_quiz_self_rating,
            commands::quiz::get_quiz,
            commands::quiz::complete_quiz,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
