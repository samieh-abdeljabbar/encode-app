use crate::AppState;
use crate::services::cards;
use crate::services::review;

#[tauri::command]
pub fn create_card(
    state: tauri::State<'_, AppState>,
    subject_id: i64,
    chapter_id: Option<i64>,
    prompt: String,
    answer: String,
    card_type: String,
) -> Result<cards::CardInfo, String> {
    let input = cards::CardCreateInput {
        subject_id,
        chapter_id,
        prompt,
        answer,
        card_type,
    };
    state.db.with_conn(|conn| cards::create_card(conn, &input))
}

#[tauri::command]
pub fn list_cards(
    state: tauri::State<'_, AppState>,
    subject_id: Option<i64>,
    search: Option<String>,
) -> Result<Vec<cards::CardInfo>, String> {
    state.db.with_conn(|conn| cards::list_cards(conn, subject_id, search.as_deref()))
}

#[tauri::command]
pub fn update_card(
    state: tauri::State<'_, AppState>,
    card_id: i64,
    prompt: Option<String>,
    answer: Option<String>,
    status: Option<String>,
) -> Result<cards::CardInfo, String> {
    state.db.with_conn(|conn| {
        cards::update_card(conn, card_id, prompt.as_deref(), answer.as_deref(), status.as_deref())
    })
}

#[tauri::command]
pub fn delete_card(
    state: tauri::State<'_, AppState>,
    card_id: i64,
) -> Result<(), String> {
    state.db.with_conn(|conn| cards::delete_card(conn, card_id))
}

#[tauri::command]
pub fn get_practice_cards(
    state: tauri::State<'_, AppState>,
    subject_id: Option<i64>,
    limit: i64,
) -> Result<Vec<review::DueCard>, String> {
    state.db.with_conn(|conn| cards::get_practice_cards(conn, subject_id, limit))
}
