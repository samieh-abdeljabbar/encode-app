use crate::services::{note_links, notes};
use crate::AppState;

#[tauri::command]
pub fn create_note(
    state: tauri::State<'_, AppState>,
    title: String,
    folder: Option<String>,
    subject_id: Option<i64>,
    chapter_id: Option<i64>,
    content: String,
) -> Result<notes::NoteInfo, String> {
    state.db.with_conn(|conn| {
        notes::create_note(
            conn,
            &state.vault_path,
            &title,
            folder.as_deref(),
            subject_id,
            chapter_id,
            &content,
        )
    })
}

#[tauri::command]
pub fn get_note(
    state: tauri::State<'_, AppState>,
    note_id: i64,
) -> Result<notes::NoteDetail, String> {
    state
        .db
        .with_conn(|conn| notes::get_note(conn, &state.vault_path, note_id))
}

#[tauri::command]
pub fn update_note(
    state: tauri::State<'_, AppState>,
    note_id: i64,
    content: String,
) -> Result<notes::NoteInfo, String> {
    state
        .db
        .with_conn(|conn| notes::update_note(conn, &state.vault_path, note_id, &content))
}

#[tauri::command]
pub fn delete_note(state: tauri::State<'_, AppState>, note_id: i64) -> Result<(), String> {
    state
        .db
        .with_conn(|conn| notes::delete_note(conn, &state.vault_path, note_id))
}

#[tauri::command]
pub fn list_notes(
    state: tauri::State<'_, AppState>,
    folder: Option<String>,
    subject_id: Option<i64>,
    chapter_id: Option<i64>,
    tag: Option<String>,
) -> Result<Vec<notes::NoteInfo>, String> {
    state.db.with_conn(|conn| {
        notes::list_notes(
            conn,
            folder.as_deref(),
            subject_id,
            chapter_id,
            tag.as_deref(),
        )
    })
}

#[tauri::command]
pub fn rename_note(
    state: tauri::State<'_, AppState>,
    note_id: i64,
    new_title: String,
) -> Result<notes::NoteInfo, String> {
    state
        .db
        .with_conn(|conn| notes::rename_note(conn, &state.vault_path, note_id, &new_title))
}

#[tauri::command]
pub fn search_notes(
    state: tauri::State<'_, AppState>,
    query: String,
) -> Result<Vec<notes::NoteSearchResult>, String> {
    state.db.with_conn(|conn| notes::search_notes(conn, &query))
}

#[tauri::command]
pub fn get_backlinks(
    state: tauri::State<'_, AppState>,
    note_id: i64,
) -> Result<Vec<note_links::BacklinkInfo>, String> {
    state
        .db
        .with_conn(|conn| note_links::get_backlinks(conn, note_id))
}

#[tauri::command]
pub fn get_outgoing_links(
    state: tauri::State<'_, AppState>,
    note_id: i64,
) -> Result<Vec<note_links::LinkInfo>, String> {
    state
        .db
        .with_conn(|conn| note_links::get_outgoing_links(conn, note_id))
}

#[tauri::command]
pub fn get_graph_data(state: tauri::State<'_, AppState>) -> Result<note_links::GraphData, String> {
    state.db.with_conn(note_links::get_graph_data)
}

#[tauri::command]
pub fn get_local_graph(
    state: tauri::State<'_, AppState>,
    note_id: i64,
    depth: i32,
) -> Result<note_links::GraphData, String> {
    state
        .db
        .with_conn(|conn| note_links::get_local_graph(conn, note_id, depth))
}

#[tauri::command]
pub fn list_note_folders(state: tauri::State<'_, AppState>) -> Result<Vec<String>, String> {
    notes::list_folders(&state.vault_path)
}

#[tauri::command]
pub fn create_note_folder(state: tauri::State<'_, AppState>, path: String) -> Result<(), String> {
    notes::create_folder(&state.vault_path, &path)
}

#[tauri::command]
pub fn move_note(
    state: tauri::State<'_, AppState>,
    note_id: i64,
    target_folder: Option<String>,
) -> Result<notes::NoteInfo, String> {
    state.db.with_conn(|conn| {
        notes::move_note(conn, &state.vault_path, note_id, target_folder.as_deref())
    })
}

#[tauri::command]
pub fn delete_note_folder(state: tauri::State<'_, AppState>, path: String) -> Result<(), String> {
    notes::delete_folder(&state.vault_path, &path)
}

#[tauri::command]
pub fn get_note_titles(state: tauri::State<'_, AppState>) -> Result<Vec<(i64, String)>, String> {
    state.db.with_conn(notes::get_note_titles)
}
