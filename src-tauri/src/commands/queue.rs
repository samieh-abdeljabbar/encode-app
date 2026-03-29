use crate::AppState;
use crate::services::queue;

#[tauri::command]
pub fn get_queue_dashboard(
    state: tauri::State<'_, AppState>,
) -> Result<queue::QueueDashboard, String> {
    state.db.with_conn(|conn| queue::get_dashboard(conn))
}
