use crate::services::reader;
use crate::AppState;

#[tauri::command]
pub fn load_reader_session(
    state: tauri::State<'_, AppState>,
    chapter_id: i64,
) -> Result<reader::ReaderSession, String> {
    state.db.with_conn(|conn| reader::get_reader_session(conn, chapter_id))
}

#[tauri::command]
pub fn mark_section_read(
    state: tauri::State<'_, AppState>,
    chapter_id: i64,
    section_index: i32,
) -> Result<(), String> {
    state.db.with_conn(|conn| reader::mark_section_seen(conn, chapter_id, section_index))
}

#[tauri::command]
pub fn submit_section_check(
    state: tauri::State<'_, AppState>,
    chapter_id: i64,
    section_index: i32,
    response: String,
    self_rating: String,
) -> Result<reader::CheckResult, String> {
    state.db.with_conn(|conn| {
        reader::process_check(conn, chapter_id, section_index, &response, &self_rating)
    })
}

#[tauri::command]
pub fn submit_synthesis(
    state: tauri::State<'_, AppState>,
    chapter_id: i64,
    synthesis_text: String,
) -> Result<reader::SynthesisResult, String> {
    state.db.with_conn(|conn| reader::process_synthesis(conn, chapter_id, &synthesis_text))
}
