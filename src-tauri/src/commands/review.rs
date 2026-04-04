use crate::services::review;
use crate::AppState;

#[tauri::command]
pub fn get_due_cards(
    state: tauri::State<'_, AppState>,
    limit: i64,
) -> Result<Vec<review::DueCard>, String> {
    state
        .db
        .with_conn(|conn| review::get_due_cards(conn, limit))
}

#[tauri::command]
pub fn submit_card_rating(
    state: tauri::State<'_, AppState>,
    card_id: i64,
    rating: i32,
) -> Result<review::RatingResult, String> {
    state
        .db
        .with_conn(|conn| review::submit_rating(conn, card_id, rating))
}
