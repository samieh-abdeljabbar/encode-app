use crate::services::quiz;
use crate::AppState;

#[tauri::command]
pub fn list_quizzes(
    state: tauri::State<'_, AppState>,
    subject_id: Option<i64>,
) -> Result<Vec<quiz::QuizListItem>, String> {
    state.db.with_conn(|conn| quiz::list_quizzes(conn, subject_id))
}

#[tauri::command]
pub fn generate_quiz(
    state: tauri::State<'_, AppState>,
    chapter_id: i64,
) -> Result<quiz::QuizState, String> {
    state.db.with_conn(|conn| quiz::generate_quiz(conn, chapter_id))
}

#[tauri::command]
pub fn submit_quiz_answer(
    state: tauri::State<'_, AppState>,
    quiz_id: i64,
    question_index: i64,
    answer: String,
) -> Result<quiz::QuestionResult, String> {
    state.db.with_conn(|conn| quiz::submit_answer(conn, quiz_id, question_index, &answer))
}

#[tauri::command]
pub fn submit_quiz_self_rating(
    state: tauri::State<'_, AppState>,
    quiz_id: i64,
    question_index: i64,
    self_rating: String,
) -> Result<quiz::QuestionResult, String> {
    state.db.with_conn(|conn| quiz::submit_self_rating(conn, quiz_id, question_index, &self_rating))
}

#[tauri::command]
pub fn get_quiz(
    state: tauri::State<'_, AppState>,
    quiz_id: i64,
) -> Result<quiz::QuizState, String> {
    state.db.with_conn(|conn| quiz::get_quiz(conn, quiz_id))
}

#[tauri::command]
pub fn complete_quiz(
    state: tauri::State<'_, AppState>,
    quiz_id: i64,
) -> Result<quiz::QuizSummary, String> {
    state.db.with_conn(|conn| quiz::complete_quiz(conn, quiz_id))
}
