use crate::services::queue;
use crate::AppState;
use serde::Serialize;

#[derive(Serialize)]
pub struct NavigationChapter {
    pub id: i64,
    pub subject_id: i64,
    pub title: String,
    pub slug: String,
    pub status: String,
    pub estimated_minutes: Option<i64>,
    pub created_at: String,
    pub section_count: i64,
    pub checked_count: i64,
    pub subject_name: String,
}

#[tauri::command]
pub fn get_queue_dashboard(
    state: tauri::State<'_, AppState>,
) -> Result<queue::QueueDashboard, String> {
    state.db.with_conn(queue::get_dashboard)
}

#[tauri::command]
pub fn get_progress_report(
    state: tauri::State<'_, AppState>,
) -> Result<queue::ProgressReport, String> {
    state.db.with_conn(queue::get_progress)
}

#[tauri::command]
pub fn list_navigation_chapters(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<NavigationChapter>, String> {
    state.db.with_conn(|conn| {
        let mut stmt = conn
            .prepare(
                "SELECT c.id, c.subject_id, c.title, c.slug, c.status, c.estimated_minutes, c.created_at,
                        COUNT(cs.id) as section_count,
                        COUNT(CASE WHEN cs.status IN ('checked_correct', 'checked_partial', 'checked_off_track') THEN 1 END) as checked_count,
                        s.name
                 FROM chapters c
                 JOIN subjects s ON s.id = c.subject_id
                 LEFT JOIN chapter_sections cs ON cs.chapter_id = c.id
                 WHERE s.archived_at IS NULL
                 GROUP BY c.id
                 ORDER BY s.name, c.created_at",
            )
            .map_err(|e| e.to_string())?;

        let chapters = stmt
            .query_map([], |row| {
                Ok(NavigationChapter {
                    id: row.get(0)?,
                    subject_id: row.get(1)?,
                    title: row.get(2)?,
                    slug: row.get(3)?,
                    status: row.get(4)?,
                    estimated_minutes: row.get(5)?,
                    created_at: row.get(6)?,
                    section_count: row.get(7)?,
                    checked_count: row.get(8)?,
                    subject_name: row.get(9)?,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;

        Ok(chapters)
    })
}
