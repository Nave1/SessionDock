use tauri::State;
use crate::db::Database;
use crate::error::AppError;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Snippet {
    pub id: String,
    pub name: String,
    pub command: String,
    pub description: Option<String>,
    pub category: Option<String>,
    pub vendor: Option<String>,
    pub device_type: Option<String>,
    pub favorite: bool,
    pub destructive: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateSnippetRequest {
    pub name: String,
    pub command: String,
    pub description: Option<String>,
    pub category: Option<String>,
    pub vendor: Option<String>,
    pub device_type: Option<String>,
    pub favorite: Option<bool>,
    pub destructive: Option<bool>,
}

#[tauri::command]
pub fn get_snippets(db: State<'_, Database>) -> Result<Vec<Snippet>, AppError> {
    let conn = db.conn();
    let mut stmt = conn.prepare(
        "SELECT id, name, command, description, category, vendor, device_type, favorite, destructive, created_at, updated_at FROM command_snippets ORDER BY favorite DESC, name COLLATE NOCASE"
    )?;

    let snippets = stmt.query_map([], |row| {
        Ok(Snippet {
            id: row.get(0)?,
            name: row.get(1)?,
            command: row.get(2)?,
            description: row.get(3)?,
            category: row.get(4)?,
            vendor: row.get(5)?,
            device_type: row.get(6)?,
            favorite: row.get::<_, i32>(7)? != 0,
            destructive: row.get::<_, i32>(8)? != 0,
            created_at: row.get(9)?,
            updated_at: row.get(10)?,
        })
    })?;

    let mut result = Vec::new();
    for s in snippets { result.push(s?); }
    Ok(result)
}

#[tauri::command]
pub fn create_snippet(db: State<'_, Database>, request: CreateSnippetRequest) -> Result<Snippet, AppError> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let conn = db.conn();

    if request.name.trim().is_empty() || request.command.trim().is_empty() {
        return Err(AppError::Validation("Name and command are required".into()));
    }

    conn.execute(
        "INSERT INTO command_snippets (id, name, command, description, category, vendor, device_type, favorite, destructive, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
        rusqlite::params![id, request.name.trim(), request.command, request.description, request.category, request.vendor, request.device_type, request.favorite.unwrap_or(false) as i32, request.destructive.unwrap_or(false) as i32, now, now],
    )?;

    Ok(Snippet {
        id, name: request.name, command: request.command,
        description: request.description, category: request.category,
        vendor: request.vendor, device_type: request.device_type,
        favorite: request.favorite.unwrap_or(false),
        destructive: request.destructive.unwrap_or(false),
        created_at: now.clone(), updated_at: now,
    })
}

#[tauri::command]
pub fn update_snippet(db: State<'_, Database>, id: String, name: Option<String>, command: Option<String>, description: Option<String>, category: Option<String>, vendor: Option<String>, device_type: Option<String>, favorite: Option<bool>, destructive: Option<bool>) -> Result<(), AppError> {
    let conn = db.conn();
    let now = chrono::Utc::now().to_rfc3339();

    if let Some(n) = &name { conn.execute("UPDATE command_snippets SET name=?1, updated_at=?2 WHERE id=?3", rusqlite::params![n, now, id])?; }
    if let Some(c) = &command { conn.execute("UPDATE command_snippets SET command=?1, updated_at=?2 WHERE id=?3", rusqlite::params![c, now, id])?; }
    if let Some(d) = &description { conn.execute("UPDATE command_snippets SET description=?1, updated_at=?2 WHERE id=?3", rusqlite::params![d, now, id])?; }
    if let Some(cat) = &category { conn.execute("UPDATE command_snippets SET category=?1, updated_at=?2 WHERE id=?3", rusqlite::params![cat, now, id])?; }
    if let Some(v) = &vendor { conn.execute("UPDATE command_snippets SET vendor=?1, updated_at=?2 WHERE id=?3", rusqlite::params![v, now, id])?; }
    if let Some(dt) = &device_type { conn.execute("UPDATE command_snippets SET device_type=?1, updated_at=?2 WHERE id=?3", rusqlite::params![dt, now, id])?; }
    if let Some(f) = favorite { conn.execute("UPDATE command_snippets SET favorite=?1, updated_at=?2 WHERE id=?3", rusqlite::params![f as i32, now, id])?; }
    if let Some(d) = destructive { conn.execute("UPDATE command_snippets SET destructive=?1, updated_at=?2 WHERE id=?3", rusqlite::params![d as i32, now, id])?; }

    Ok(())
}

#[tauri::command]
pub fn delete_snippet(db: State<'_, Database>, id: String) -> Result<(), AppError> {
    let conn = db.conn();
    conn.execute("DELETE FROM command_snippets WHERE id = ?1", rusqlite::params![id])?;
    Ok(())
}
