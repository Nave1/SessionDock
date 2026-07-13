use tauri::State;
use crate::db::Database;
use crate::error::AppError;
use crate::models::*;

#[tauri::command]
pub fn create_folder(
    db: State<'_, Database>,
    request: CreateFolderRequest,
) -> Result<Folder, AppError> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let conn = db.conn();

    if request.name.trim().is_empty() {
        return Err(AppError::Validation("Folder name is required".into()));
    }

    // Determine sort order
    let sort_order: i32 = conn.query_row(
        "SELECT COALESCE(MAX(sort_order), 0) + 1 FROM folders WHERE parent_id IS ?1",
        rusqlite::params![request.parent_id],
        |row| row.get(0),
    )?;

    conn.execute(
        "INSERT INTO folders (id, name, parent_id, sort_order, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![id, request.name.trim(), request.parent_id, sort_order, now, now],
    )?;

    Ok(Folder {
        id,
        name: request.name.trim().to_string(),
        parent_id: request.parent_id,
        sort_order,
        created_at: now.clone(),
        updated_at: now,
    })
}

#[tauri::command]
pub fn get_folders(db: State<'_, Database>) -> Result<Vec<Folder>, AppError> {
    let conn = db.conn();
    let mut stmt = conn.prepare(
        "SELECT id, name, parent_id, sort_order, created_at, updated_at FROM folders ORDER BY sort_order, name COLLATE NOCASE"
    )?;

    let folders = stmt.query_map([], |row| {
        Ok(Folder {
            id: row.get(0)?,
            name: row.get(1)?,
            parent_id: row.get(2)?,
            sort_order: row.get(3)?,
            created_at: row.get(4)?,
            updated_at: row.get(5)?,
        })
    })?;

    let mut result = Vec::new();
    for folder in folders {
        result.push(folder?);
    }
    Ok(result)
}

#[tauri::command]
pub fn update_folder(
    db: State<'_, Database>,
    id: String,
    name: Option<String>,
    parent_id: Option<String>,
    sort_order: Option<i32>,
) -> Result<Folder, AppError> {
    let conn = db.conn();
    let now = chrono::Utc::now().to_rfc3339();

    let existing: Folder = conn.query_row(
        "SELECT id, name, parent_id, sort_order, created_at, updated_at FROM folders WHERE id = ?1",
        rusqlite::params![id],
        |row| {
            Ok(Folder {
                id: row.get(0)?,
                name: row.get(1)?,
                parent_id: row.get(2)?,
                sort_order: row.get(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        },
    ).map_err(|_| AppError::NotFound(format!("Folder not found: {}", id)))?;

    let new_name = name.unwrap_or(existing.name);
    let new_parent_id = parent_id.or(existing.parent_id);
    let new_sort_order = sort_order.unwrap_or(existing.sort_order);

    // Prevent circular reference
    if let Some(ref pid) = new_parent_id {
        if pid == &id {
            return Err(AppError::Validation("Folder cannot be its own parent".into()));
        }
    }

    conn.execute(
        "UPDATE folders SET name=?1, parent_id=?2, sort_order=?3, updated_at=?4 WHERE id=?5",
        rusqlite::params![new_name, new_parent_id, new_sort_order, now, id],
    )?;

    Ok(Folder {
        id,
        name: new_name,
        parent_id: new_parent_id,
        sort_order: new_sort_order,
        created_at: existing.created_at,
        updated_at: now,
    })
}

#[tauri::command]
pub fn delete_folder(
    db: State<'_, Database>,
    id: String,
    action: String,
) -> Result<(), AppError> {
    let conn = db.conn();

    match action.as_str() {
        "move_to_parent" => {
            // Get folder's parent
            let parent_id: Option<String> = conn.query_row(
                "SELECT parent_id FROM folders WHERE id = ?1",
                rusqlite::params![id],
                |row| row.get(0),
            ).map_err(|_| AppError::NotFound("Folder not found".into()))?;

            // Move sessions to parent folder
            conn.execute(
                "UPDATE sessions SET folder_id = ?1 WHERE folder_id = ?2",
                rusqlite::params![parent_id, id],
            )?;

            // Move child folders to parent
            conn.execute(
                "UPDATE folders SET parent_id = ?1 WHERE parent_id = ?2",
                rusqlite::params![parent_id, id],
            )?;

            // Delete the folder
            conn.execute("DELETE FROM folders WHERE id = ?1", rusqlite::params![id])?;
        }
        "delete_all" => {
            // Delete sessions in this folder
            conn.execute(
                "DELETE FROM sessions WHERE folder_id = ?1",
                rusqlite::params![id],
            )?;
            // Delete child folders recursively (SQLite cascade handles children via SET NULL)
            conn.execute("DELETE FROM folders WHERE id = ?1", rusqlite::params![id])?;
        }
        _ => {
            return Err(AppError::Validation(
                "Invalid action. Use 'move_to_parent' or 'delete_all'".into(),
            ));
        }
    }

    Ok(())
}
