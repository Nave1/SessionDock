use crate::db::Database;
use crate::error::AppError;
use serde::{Deserialize, Serialize};
use tauri::State;

const MAX_NAME_LEN: usize = 120;
const MAX_COMMAND_LEN: usize = 8_192;
const MAX_DESCRIPTION_LEN: usize = 500;
const MAX_METADATA_LEN: usize = 80;

fn validate_id(id: &str) -> Result<(), AppError> {
    uuid::Uuid::parse_str(id)
        .map(|_| ())
        .map_err(|_| AppError::Validation("Invalid snippet ID".into()))
}

fn validate_required(
    value: &str,
    field: &str,
    max_len: usize,
    trim: bool,
) -> Result<String, AppError> {
    let normalized = if trim { value.trim() } else { value };
    if normalized.trim().is_empty() {
        return Err(AppError::Validation(format!("{field} is required")));
    }
    if normalized.chars().count() > max_len {
        return Err(AppError::Validation(format!(
            "{field} must not exceed {max_len} characters"
        )));
    }
    if field == "Name" && normalized.chars().any(char::is_control) {
        return Err(AppError::Validation(
            "Name must not contain control characters".into(),
        ));
    }
    Ok(normalized.to_string())
}

fn validate_optional(
    value: Option<String>,
    field: &str,
    max_len: usize,
) -> Result<Option<String>, AppError> {
    value
        .map(|value| {
            let normalized = value.trim();
            if normalized.chars().count() > max_len {
                return Err(AppError::Validation(format!(
                    "{field} must not exceed {max_len} characters"
                )));
            }
            Ok((!normalized.is_empty()).then(|| normalized.to_string()))
        })
        .transpose()
        .map(Option::flatten)
}

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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSnippetRequest {
    pub id: String,
    pub name: Option<String>,
    pub command: Option<String>,
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
    for s in snippets {
        result.push(s?);
    }
    Ok(result)
}

#[tauri::command]
pub fn create_snippet(
    db: State<'_, Database>,
    request: CreateSnippetRequest,
) -> Result<Snippet, AppError> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let conn = db.conn();
    let name = validate_required(&request.name, "Name", MAX_NAME_LEN, true)?;
    let command = validate_required(&request.command, "Command", MAX_COMMAND_LEN, false)?;
    let description = validate_optional(request.description, "Description", MAX_DESCRIPTION_LEN)?;
    let category = validate_optional(request.category, "Category", MAX_METADATA_LEN)?;
    let vendor = validate_optional(request.vendor, "Vendor", MAX_METADATA_LEN)?;
    let device_type = validate_optional(request.device_type, "Device type", MAX_METADATA_LEN)?;
    let favorite = request.favorite.unwrap_or(false);
    let destructive = request.destructive.unwrap_or(false);

    conn.execute(
        "INSERT INTO command_snippets (id, name, command, description, category, vendor, device_type, favorite, destructive, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
        rusqlite::params![&id, &name, &command, &description, &category, &vendor, &device_type, favorite as i32, destructive as i32, &now, &now],
    )?;

    Ok(Snippet {
        id,
        name,
        command,
        description,
        category,
        vendor,
        device_type,
        favorite,
        destructive,
        created_at: now.clone(),
        updated_at: now,
    })
}

#[tauri::command]
pub fn update_snippet(
    db: State<'_, Database>,
    request: UpdateSnippetRequest,
) -> Result<(), AppError> {
    let UpdateSnippetRequest {
        id,
        name,
        command,
        description,
        category,
        vendor,
        device_type,
        favorite,
        destructive,
    } = request;
    validate_id(&id)?;
    let name = name
        .map(|value| validate_required(&value, "Name", MAX_NAME_LEN, true))
        .transpose()?;
    let command = command
        .map(|value| validate_required(&value, "Command", MAX_COMMAND_LEN, false))
        .transpose()?;
    let description = description
        .map(|value| {
            validate_optional(Some(value), "Description", MAX_DESCRIPTION_LEN)
                .map(|value| value.unwrap_or_default())
        })
        .transpose()?;
    let category = category
        .map(|value| {
            validate_optional(Some(value), "Category", MAX_METADATA_LEN)
                .map(|value| value.unwrap_or_default())
        })
        .transpose()?;
    let vendor = vendor
        .map(|value| {
            validate_optional(Some(value), "Vendor", MAX_METADATA_LEN)
                .map(|value| value.unwrap_or_default())
        })
        .transpose()?;
    let device_type = device_type
        .map(|value| {
            validate_optional(Some(value), "Device type", MAX_METADATA_LEN)
                .map(|value| value.unwrap_or_default())
        })
        .transpose()?;
    let mut conn = db.conn();
    let transaction = conn.transaction()?;
    let now = chrono::Utc::now().to_rfc3339();
    let exists = transaction.query_row(
        "SELECT EXISTS(SELECT 1 FROM command_snippets WHERE id = ?1)",
        [&id],
        |row| row.get::<_, bool>(0),
    )?;
    if !exists {
        return Err(AppError::NotFound("Command snippet not found".into()));
    }

    if let Some(n) = &name {
        transaction.execute(
            "UPDATE command_snippets SET name=?1, updated_at=?2 WHERE id=?3",
            rusqlite::params![n, now, id],
        )?;
    }
    if let Some(c) = &command {
        transaction.execute(
            "UPDATE command_snippets SET command=?1, updated_at=?2 WHERE id=?3",
            rusqlite::params![c, now, id],
        )?;
    }
    if let Some(d) = &description {
        transaction.execute(
            "UPDATE command_snippets SET description=?1, updated_at=?2 WHERE id=?3",
            rusqlite::params![d, now, id],
        )?;
    }
    if let Some(cat) = &category {
        transaction.execute(
            "UPDATE command_snippets SET category=?1, updated_at=?2 WHERE id=?3",
            rusqlite::params![cat, now, id],
        )?;
    }
    if let Some(v) = &vendor {
        transaction.execute(
            "UPDATE command_snippets SET vendor=?1, updated_at=?2 WHERE id=?3",
            rusqlite::params![v, now, id],
        )?;
    }
    if let Some(dt) = &device_type {
        transaction.execute(
            "UPDATE command_snippets SET device_type=?1, updated_at=?2 WHERE id=?3",
            rusqlite::params![dt, now, id],
        )?;
    }
    if let Some(f) = favorite {
        transaction.execute(
            "UPDATE command_snippets SET favorite=?1, updated_at=?2 WHERE id=?3",
            rusqlite::params![f as i32, now, id],
        )?;
    }
    if let Some(d) = destructive {
        transaction.execute(
            "UPDATE command_snippets SET destructive=?1, updated_at=?2 WHERE id=?3",
            rusqlite::params![d as i32, now, id],
        )?;
    }

    transaction.commit()?;
    Ok(())
}

#[tauri::command]
pub fn delete_snippet(db: State<'_, Database>, id: String) -> Result<(), AppError> {
    validate_id(&id)?;
    let conn = db.conn();
    let changed = conn.execute(
        "DELETE FROM command_snippets WHERE id = ?1",
        rusqlite::params![id],
    )?;
    if changed == 0 {
        return Err(AppError::NotFound("Command snippet not found".into()));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{validate_id, validate_required, UpdateSnippetRequest, MAX_COMMAND_LEN};

    #[test]
    fn command_validation_preserves_exact_content() {
        let command = "  show interfaces status\n";
        assert_eq!(
            validate_required(command, "Command", MAX_COMMAND_LEN, false).unwrap(),
            command
        );
    }

    #[test]
    fn validation_rejects_empty_oversized_and_malformed_inputs() {
        assert!(validate_required(" \n", "Command", MAX_COMMAND_LEN, false).is_err());
        assert!(validate_required(
            &"x".repeat(MAX_COMMAND_LEN + 1),
            "Command",
            MAX_COMMAND_LEN,
            false
        )
        .is_err());
        assert!(validate_required("bad\nname", "Name", 120, true).is_err());
        assert!(validate_id("not-a-uuid").is_err());
    }

    #[test]
    fn update_request_deserializes_camel_case_fields() {
        let request: UpdateSnippetRequest = serde_json::from_value(serde_json::json!({
            "id": "2ce1ce8f-d483-45be-8c61-d1df9a2d77a1",
            "deviceType": "switch",
            "favorite": true
        }))
        .unwrap();

        assert_eq!(request.device_type.as_deref(), Some("switch"));
        assert_eq!(request.favorite, Some(true));
    }
}
