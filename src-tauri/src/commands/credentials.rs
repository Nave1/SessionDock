use crate::credential_vault::{self, CredentialVault};
use crate::db::Database;
use crate::error::AppError;
use crate::models::*;
use tauri::State;

#[tauri::command]
pub fn store_credential(
    db: State<'_, Database>,
    request: CreateCredentialRequest,
) -> Result<CredentialProfile, AppError> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let vault_reference = format!("cred_{}", id);

    if request.name.trim().is_empty() {
        return Err(AppError::Validation("Credential name is required".into()));
    }
    if request.name.len() > 120 || request.username.len() > 256 {
        return Err(AppError::Validation(
            "Credential profile fields are too long".into(),
        ));
    }
    if request.name.contains('\0') || request.username.contains('\0') {
        return Err(AppError::Validation(
            "Credential profile contains invalid characters".into(),
        ));
    }

    let stored_secret = request
        .password
        .as_ref()
        .is_some_and(|secret| !secret.is_empty());
    if let Some(password) = request
        .password
        .as_ref()
        .filter(|secret| !secret.is_empty())
    {
        let vault = credential_vault::get_vault();
        vault.store_secret(&vault_reference, password)?;
    }

    // Store only non-secret metadata in SQLite
    let conn = db.conn();
    let insert_result = conn.execute(
        "INSERT INTO credential_profiles (id, name, username, authentication_method, vault_reference, description, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        rusqlite::params![
            id,
            request.name.trim(),
            request.username,
            request.authentication_method.as_str(),
            vault_reference,
            request.description,
            now,
            now,
        ],
    );
    if let Err(error) = insert_result {
        if stored_secret {
            let _ = credential_vault::get_vault().delete_secret(&vault_reference);
        }
        return Err(AppError::Database(error));
    }

    Ok(CredentialProfile {
        id,
        name: request.name.trim().to_string(),
        username: request.username,
        authentication_method: request.authentication_method,
        vault_reference,
        description: request.description,
        created_at: now.clone(),
        updated_at: now,
    })
}

#[tauri::command]
pub fn get_credential_profiles(
    db: State<'_, Database>,
) -> Result<Vec<CredentialProfile>, AppError> {
    let conn = db.conn();
    let mut stmt = conn.prepare(
        "SELECT id, name, username, authentication_method, vault_reference, description, created_at, updated_at
         FROM credential_profiles ORDER BY name COLLATE NOCASE"
    )?;

    let profiles = stmt.query_map([], |row| {
        Ok(CredentialProfile {
            id: row.get(0)?,
            name: row.get(1)?,
            username: row.get(2)?,
            authentication_method: AuthMethod::from_str(&row.get::<_, String>(3)?),
            vault_reference: row.get(4)?,
            description: row.get(5)?,
            created_at: row.get(6)?,
            updated_at: row.get(7)?,
        })
    })?;

    let mut result = Vec::new();
    for profile in profiles {
        result.push(profile?);
    }
    Ok(result)
}

#[tauri::command]
pub fn delete_credential(db: State<'_, Database>, id: String) -> Result<(), AppError> {
    let conn = db.conn();

    // Get vault reference before deleting
    let vault_ref: String = conn
        .query_row(
            "SELECT vault_reference FROM credential_profiles WHERE id = ?1",
            rusqlite::params![id],
            |row| row.get(0),
        )
        .map_err(|_| AppError::NotFound("Credential profile not found".into()))?;

    // Delete from OS vault
    let vault = credential_vault::get_vault();
    vault.delete_secret(&vault_ref)?;

    // Delete from database
    conn.execute(
        "DELETE FROM credential_profiles WHERE id = ?1",
        rusqlite::params![id],
    )?;

    Ok(())
}
