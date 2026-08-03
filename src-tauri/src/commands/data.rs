use crate::credential_vault::{self, CredentialVault};
use crate::db::Database;
use crate::error::AppError;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Serialize, Deserialize)]
pub struct ExportData {
    pub version: String,
    pub exported_at: String,
    pub application: String,
    pub contains_credentials: bool,
    pub sessions: Vec<serde_json::Value>,
    pub folders: Vec<serde_json::Value>,
    pub tags: Vec<String>,
    pub credential_profiles: Option<Vec<serde_json::Value>>,
}

/// Export all sessions and folders as safe JSON (no credentials)
#[tauri::command]
pub fn export_sessions_json(db: State<'_, Database>) -> Result<String, AppError> {
    let conn = db.conn();

    // Get all sessions
    let mut stmt = conn.prepare("SELECT * FROM sessions ORDER BY name")?;
    let sessions: Vec<serde_json::Value> = stmt
        .query_map([], |row| {
            Ok(serde_json::json!({
                "name": row.get::<_, String>(1)?,
                "host": row.get::<_, String>(2)?,
                "port": row.get::<_, u16>(3)?,
                "protocol": row.get::<_, String>(4)?,
                "username": row.get::<_, Option<String>>(5)?,
                "authentication_method": row.get::<_, String>(7)?,
                "device_type": row.get::<_, Option<String>>(10)?,
                "vendor": row.get::<_, Option<String>>(11)?,
                "model": row.get::<_, Option<String>>(12)?,
                "description": row.get::<_, Option<String>>(13)?,
                "notes": row.get::<_, Option<String>>(14)?,
                "favorite": row.get::<_, i32>(15)? != 0,
            }))
        })?
        .filter_map(|r| r.ok())
        .collect();

    // Get all folders
    let mut folder_stmt =
        conn.prepare("SELECT id, name, parent_id, sort_order FROM folders ORDER BY sort_order")?;
    let folders: Vec<serde_json::Value> = folder_stmt
        .query_map([], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "name": row.get::<_, String>(1)?,
                "parent_id": row.get::<_, Option<String>>(2)?,
                "sort_order": row.get::<_, i32>(3)?,
            }))
        })?
        .filter_map(|r| r.ok())
        .collect();

    // Get all tags
    let mut tag_stmt = conn.prepare("SELECT name FROM tags ORDER BY name")?;
    let tags: Vec<String> = tag_stmt
        .query_map([], |row| row.get(0))?
        .filter_map(|r| r.ok())
        .collect();

    let export = ExportData {
        version: "1.0".to_string(),
        exported_at: chrono::Utc::now().to_rfc3339(),
        application: "SessionDock".to_string(),
        contains_credentials: false,
        sessions,
        folders,
        tags,
        credential_profiles: None,
    };

    serde_json::to_string_pretty(&export)
        .map_err(|e| AppError::Generic(format!("Serialization error: {}", e)))
}

/// Export sessions as CSV (non-secret fields only)
#[tauri::command]
pub fn export_sessions_csv(db: State<'_, Database>) -> Result<String, AppError> {
    let conn = db.conn();
    let mut stmt = conn.prepare(
        "SELECT name, host, port, protocol, username, device_type, vendor, model, description, favorite FROM sessions ORDER BY name"
    )?;

    let mut csv = String::from(
        "Name,Host,Port,Protocol,Username,Device Type,Vendor,Model,Description,Favorite\n",
    );

    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, u16>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, Option<String>>(4)?,
            row.get::<_, Option<String>>(5)?,
            row.get::<_, Option<String>>(6)?,
            row.get::<_, Option<String>>(7)?,
            row.get::<_, Option<String>>(8)?,
            row.get::<_, i32>(9)?,
        ))
    })?;

    for row in rows {
        let (name, host, port, protocol, username, device_type, vendor, model, desc, fav) = row?;
        csv.push_str(&format!(
            "{},{},{},{},{},{},{},{},{},{}\n",
            escape_csv(&name),
            escape_csv(&host),
            port,
            protocol,
            escape_csv(&username.unwrap_or_default()),
            escape_csv(&device_type.unwrap_or_default()),
            escape_csv(&vendor.unwrap_or_default()),
            escape_csv(&model.unwrap_or_default()),
            escape_csv(&desc.unwrap_or_default()),
            if fav != 0 { "Yes" } else { "No" },
        ));
    }

    Ok(csv)
}

fn escape_csv(value: &str) -> String {
    if value.contains(',') || value.contains('"') || value.contains('\n') {
        format!("\"{}\"", value.replace('"', "\"\""))
    } else {
        value.to_string()
    }
}

/// Import sessions from JSON
#[tauri::command]
pub fn import_sessions_json(db: State<'_, Database>, json_data: String) -> Result<u32, AppError> {
    let data: ExportData = serde_json::from_str(&json_data)
        .map_err(|e| AppError::Validation(format!("Invalid import data: {}", e)))?;

    if data.application != "SessionDock" {
        return Err(AppError::Validation("Not a SessionDock export file".into()));
    }

    let conn = db.conn();
    let mut imported = 0u32;

    for session in &data.sessions {
        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        let name = session["name"].as_str().unwrap_or("Unnamed");
        let host = session["host"].as_str().unwrap_or("");
        let port = session["port"].as_u64().unwrap_or(22) as u16;
        let protocol = session["protocol"].as_str().unwrap_or("ssh");
        let username = session["username"].as_str();
        let auth_method = session["authentication_method"]
            .as_str()
            .unwrap_or("password");
        let device_type = session["device_type"].as_str();
        let vendor = session["vendor"].as_str();
        let model = session["model"].as_str();
        let description = session["description"].as_str();
        let favorite = session["favorite"].as_bool().unwrap_or(false);

        conn.execute(
            "INSERT INTO sessions (id, name, host, port, protocol, username, authentication_method, device_type, vendor, model, description, favorite, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
            rusqlite::params![id, name, host, port, protocol, username, auth_method, device_type, vendor, model, description, favorite as i32, now, now],
        )?;

        imported += 1;
    }

    Ok(imported)
}

#[tauri::command]
pub fn clear_recent_sessions(db: State<'_, Database>) -> Result<(), AppError> {
    let conn = db.conn();
    conn.execute(
        "UPDATE sessions SET last_connected_at = NULL, connection_count = 0",
        [],
    )?;
    conn.execute("DELETE FROM recently_closed_tabs", [])?;
    Ok(())
}

#[tauri::command]
pub fn reset_application_data(db: State<'_, Database>) -> Result<(), AppError> {
    let mut conn = db.conn();
    let transaction = conn.transaction()?;

    let vault_references: Vec<String> = {
        let mut statement =
            transaction.prepare("SELECT vault_reference FROM credential_profiles")?;
        let rows = statement.query_map([], |row| row.get(0))?;
        rows.collect::<Result<Vec<_>, _>>()?
    };

    transaction.execute("DELETE FROM recently_closed_tabs", [])?;
    transaction.execute("DELETE FROM session_tags", [])?;
    transaction.execute("DELETE FROM sessions", [])?;
    transaction.execute("DELETE FROM folders", [])?;
    transaction.execute("DELETE FROM tags", [])?;
    transaction.execute("DELETE FROM credential_profiles", [])?;
    transaction.execute("DELETE FROM known_hosts", [])?;
    transaction.execute("DELETE FROM command_snippets", [])?;
    transaction.execute("DELETE FROM application_settings", [])?;
    transaction.commit()?;

    let vault = credential_vault::get_vault();
    for reference in vault_references {
        vault.delete_secret(&reference)?;
    }
    Ok(())
}

/// Get credential secret for connection (internal use only, never exposed to frontend display)
pub fn get_credential_secret(
    db: &Database,
    credential_profile_id: &str,
) -> Result<String, AppError> {
    let conn = db.conn();
    let vault_ref: String = conn
        .query_row(
            "SELECT vault_reference FROM credential_profiles WHERE id = ?1",
            rusqlite::params![credential_profile_id],
            |row| row.get(0),
        )
        .map_err(|_| AppError::NotFound("Credential profile not found".into()))?;

    let vault = credential_vault::get_vault();
    vault
        .get_secret(&vault_ref)?
        .ok_or_else(|| AppError::CredentialVault("Secret not found in vault".into()))
}
