use tauri::State;
use crate::db::Database;
use crate::error::AppError;
use crate::models::*;

#[tauri::command]
pub fn create_session(
    db: State<'_, Database>,
    request: CreateSessionRequest,
) -> Result<Session, AppError> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let conn = db.conn();

    // Validate required fields
    if request.name.trim().is_empty() {
        return Err(AppError::Validation("Session name is required".into()));
    }

    conn.execute(
        "INSERT INTO sessions (id, name, host, port, protocol, username, credential_profile_id, authentication_method, private_key_reference, folder_id, device_type, vendor, model, description, notes, favorite, startup_command, connection_timeout, keepalive_interval, terminal_profile_id, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22)",
        rusqlite::params![
            id,
            request.name.trim(),
            request.host.trim(),
            request.port,
            request.protocol.as_str(),
            request.username,
            request.credential_profile_id,
            request.authentication_method.as_str(),
            request.private_key_reference,
            request.folder_id,
            request.device_type,
            request.vendor,
            request.model,
            request.description,
            request.notes,
            request.favorite as i32,
            request.startup_command,
            request.connection_timeout.unwrap_or(30),
            request.keepalive_interval.unwrap_or(60),
            request.terminal_profile_id,
            now,
            now,
        ],
    )?;

    // Handle tags
    if let Some(tags) = &request.tags {
        for tag_name in tags {
            let tag_id = ensure_tag(&conn, tag_name)?;
            conn.execute(
                "INSERT OR IGNORE INTO session_tags (session_id, tag_id) VALUES (?1, ?2)",
                rusqlite::params![id, tag_id],
            )?;
        }
    }

    get_session_by_id(&conn, &id)
}

#[tauri::command]
pub fn get_sessions(
    db: State<'_, Database>,
    folder_id: Option<String>,
) -> Result<Vec<Session>, AppError> {
    let conn = db.conn();
    let mut stmt = if let Some(fid) = &folder_id {
        let mut s = conn.prepare(
            "SELECT * FROM sessions WHERE folder_id = ?1 ORDER BY name COLLATE NOCASE"
        )?;
        let sessions = query_sessions(&mut s, rusqlite::params![fid])?;
        return Ok(sessions);
    } else {
        conn.prepare("SELECT * FROM sessions ORDER BY name COLLATE NOCASE")?
    };
    query_sessions(&mut stmt, [])
}

#[tauri::command]
pub fn get_session(
    db: State<'_, Database>,
    id: String,
) -> Result<Session, AppError> {
    let conn = db.conn();
    get_session_by_id(&conn, &id)
}

#[tauri::command]
pub fn update_session(
    db: State<'_, Database>,
    request: UpdateSessionRequest,
) -> Result<Session, AppError> {
    let conn = db.conn();
    let now = chrono::Utc::now().to_rfc3339();

    // Build dynamic update
    let existing = get_session_by_id(&conn, &request.id)?;

    let name = request.name.unwrap_or(existing.name);
    let host = request.host.unwrap_or(existing.host);
    let port = request.port.unwrap_or(existing.port);
    let protocol = request.protocol.unwrap_or(existing.protocol);
    let favorite = request.favorite.unwrap_or(existing.favorite);

    conn.execute(
        "UPDATE sessions SET name=?1, host=?2, port=?3, protocol=?4, favorite=?5, device_type=?6, vendor=?7, model=?8, description=?9, notes=?10, folder_id=?11, updated_at=?12 WHERE id=?13",
        rusqlite::params![
            name,
            host,
            port,
            protocol.as_str(),
            favorite as i32,
            request.device_type.or(existing.device_type),
            request.vendor.or(existing.vendor),
            request.model.or(existing.model),
            request.description.or(existing.description),
            request.notes.or(existing.notes),
            request.folder_id.or(existing.folder_id),
            now,
            request.id,
        ],
    )?;

    // Update tags if provided
    if let Some(tags) = &request.tags {
        conn.execute(
            "DELETE FROM session_tags WHERE session_id = ?1",
            rusqlite::params![request.id],
        )?;
        for tag_name in tags {
            let tag_id = ensure_tag(&conn, tag_name)?;
            conn.execute(
                "INSERT OR IGNORE INTO session_tags (session_id, tag_id) VALUES (?1, ?2)",
                rusqlite::params![request.id, tag_id],
            )?;
        }
    }

    get_session_by_id(&conn, &request.id)
}

#[tauri::command]
pub fn delete_session(
    db: State<'_, Database>,
    id: String,
) -> Result<(), AppError> {
    let conn = db.conn();
    conn.execute("DELETE FROM sessions WHERE id = ?1", rusqlite::params![id])?;
    Ok(())
}

#[tauri::command]
pub fn search_sessions(
    db: State<'_, Database>,
    query: String,
) -> Result<Vec<SearchResult>, AppError> {
    let conn = db.conn();

    if query.trim().is_empty() {
        return Ok(vec![]);
    }

    let search_term = format!("{}*", query.trim().replace('"', "\"\""));

    // Use FTS5 for ranked search
    let mut stmt = conn.prepare(
        "SELECT s.*, rank
         FROM sessions_fts fts
         JOIN sessions s ON s.rowid = fts.rowid
         WHERE sessions_fts MATCH ?1
         ORDER BY rank
         LIMIT 50"
    )?;

    let results = stmt.query_map(rusqlite::params![search_term], |row| {
        Ok((row_to_session(row)?, row.get::<_, f64>(22)?))
    })?;

    let mut search_results = Vec::new();
    for result in results {
        let (session, rank) = result?;
        let tags = get_session_tags(&conn, &session.id)?;
        let folder_path = if let Some(fid) = &session.folder_id {
            get_folder_path(&conn, fid).ok()
        } else {
            None
        };
        search_results.push(SearchResult {
            session,
            folder_path,
            tags,
            rank: -rank, // FTS5 rank is negative (lower is better)
        });
    }

    // Also do a direct host/IP match if it looks like an IP
    if !search_results.iter().any(|r| r.session.host.contains(query.trim())) {
        let mut ip_stmt = conn.prepare(
            "SELECT * FROM sessions WHERE host LIKE ?1 ORDER BY name LIMIT 10"
        )?;
        let like_term = format!("%{}%", query.trim());
        let ip_results = query_sessions(&mut ip_stmt, rusqlite::params![like_term])?;
        for session in ip_results {
            if !search_results.iter().any(|r| r.session.id == session.id) {
                let tags = get_session_tags(&conn, &session.id)?;
                let folder_path = if let Some(fid) = &session.folder_id {
                    get_folder_path(&conn, fid).ok()
                } else {
                    None
                };
                search_results.push(SearchResult {
                    session,
                    folder_path,
                    tags,
                    rank: 0.5,
                });
            }
        }
    }

    Ok(search_results)
}

// --- Helper functions ---

fn get_session_by_id(conn: &rusqlite::Connection, id: &str) -> Result<Session, AppError> {
    conn.query_row(
        "SELECT * FROM sessions WHERE id = ?1",
        rusqlite::params![id],
        |row| row_to_session(row),
    )
    .map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => {
            AppError::NotFound(format!("Session not found: {}", id))
        }
        other => AppError::Database(other),
    })
}

fn row_to_session(row: &rusqlite::Row<'_>) -> rusqlite::Result<Session> {
    Ok(Session {
        id: row.get(0)?,
        name: row.get(1)?,
        host: row.get(2)?,
        port: row.get::<_, u16>(3)?,
        protocol: Protocol::from_str(&row.get::<_, String>(4)?),
        username: row.get(5)?,
        credential_profile_id: row.get(6)?,
        authentication_method: AuthMethod::from_str(&row.get::<_, String>(7)?),
        private_key_reference: row.get(8)?,
        folder_id: row.get(9)?,
        device_type: row.get(10)?,
        vendor: row.get(11)?,
        model: row.get(12)?,
        description: row.get(13)?,
        notes: row.get(14)?,
        favorite: row.get::<_, i32>(15)? != 0,
        startup_command: row.get(16)?,
        connection_timeout: row.get(17)?,
        keepalive_interval: row.get(18)?,
        terminal_profile_id: row.get(19)?,
        created_at: row.get(20)?,
        updated_at: row.get(21)?,
        last_connected_at: row.get(22)?,
        connection_count: row.get(23)?,
    })
}

fn query_sessions<P: rusqlite::Params>(
    stmt: &mut rusqlite::Statement<'_>,
    params: P,
) -> Result<Vec<Session>, AppError> {
    let rows = stmt.query_map(params, |row| row_to_session(row))?;
    let mut sessions = Vec::new();
    for row in rows {
        sessions.push(row?);
    }
    Ok(sessions)
}

fn ensure_tag(conn: &rusqlite::Connection, name: &str) -> Result<String, AppError> {
    let trimmed = name.trim();
    match conn.query_row(
        "SELECT id FROM tags WHERE name = ?1",
        rusqlite::params![trimmed],
        |row| row.get::<_, String>(0),
    ) {
        Ok(id) => Ok(id),
        Err(rusqlite::Error::QueryReturnedNoRows) => {
            let id = uuid::Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO tags (id, name) VALUES (?1, ?2)",
                rusqlite::params![id, trimmed],
            )?;
            Ok(id)
        }
        Err(e) => Err(AppError::Database(e)),
    }
}

fn get_session_tags(conn: &rusqlite::Connection, session_id: &str) -> Result<Vec<String>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT t.name FROM tags t JOIN session_tags st ON st.tag_id = t.id WHERE st.session_id = ?1"
    )?;
    let tags = stmt.query_map(rusqlite::params![session_id], |row| row.get(0))?;
    let mut result = Vec::new();
    for tag in tags {
        result.push(tag?);
    }
    Ok(result)
}

fn get_folder_path(conn: &rusqlite::Connection, folder_id: &str) -> Result<String, AppError> {
    let mut path_parts = Vec::new();
    let mut current_id = Some(folder_id.to_string());

    while let Some(id) = current_id {
        let result = conn.query_row(
            "SELECT name, parent_id FROM folders WHERE id = ?1",
            rusqlite::params![id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?)),
        );
        match result {
            Ok((name, parent_id)) => {
                path_parts.push(name);
                current_id = parent_id;
            }
            Err(_) => break,
        }
    }

    path_parts.reverse();
    Ok(path_parts.join(" / "))
}
