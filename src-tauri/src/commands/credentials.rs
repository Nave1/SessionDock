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

    validate_credential_fields(
        &request.name,
        &request.username,
        &request.authentication_method,
        request.password.as_deref(),
        false,
    )?;

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
pub fn get_credential_secret(
    db: State<'_, Database>,
    id: String,
) -> Result<Option<String>, AppError> {
    validate_profile_id(&id)?;
    let vault_reference: String = db
        .conn()
        .query_row(
            "SELECT vault_reference FROM credential_profiles WHERE id = ?1",
            rusqlite::params![id],
            |row| row.get(0),
        )
        .map_err(|_| AppError::NotFound("Credential profile not found".into()))?;
    credential_vault::get_vault().get_secret(&vault_reference)
}

#[tauri::command]
pub fn update_credential(
    db: State<'_, Database>,
    request: UpdateCredentialRequest,
) -> Result<CredentialProfile, AppError> {
    validate_profile_id(&request.id)?;
    let (vault_reference, created_at): (String, String) = db
        .conn()
        .query_row(
            "SELECT vault_reference, created_at FROM credential_profiles WHERE id = ?1",
            rusqlite::params![request.id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|_| AppError::NotFound("Credential profile not found".into()))?;
    let vault = credential_vault::get_vault();
    let existing_secret = vault.get_secret(&vault_reference)?;
    validate_credential_fields(
        &request.name,
        &request.username,
        &request.authentication_method,
        request.password.as_deref(),
        existing_secret.is_some(),
    )?;

    let replacement = request
        .password
        .as_deref()
        .filter(|secret| !secret.is_empty());
    if let Some(secret) = replacement {
        vault.store_secret(&vault_reference, secret)?;
    }

    let now = chrono::Utc::now().to_rfc3339();
    let update_result = db.conn().execute(
        "UPDATE credential_profiles SET name = ?1, username = ?2, authentication_method = ?3, description = ?4, updated_at = ?5 WHERE id = ?6",
        rusqlite::params![
            request.name.trim(),
            request.username.trim(),
            request.authentication_method.as_str(),
            request.description,
            now,
            request.id,
        ],
    );
    if let Err(error) = update_result {
        if replacement.is_some() {
            match existing_secret {
                Some(secret) => {
                    let _ = vault.store_secret(&vault_reference, &secret);
                }
                None => {
                    let _ = vault.delete_secret(&vault_reference);
                }
            }
        }
        return Err(AppError::Database(error));
    }

    Ok(CredentialProfile {
        id: request.id,
        name: request.name.trim().to_string(),
        username: request.username.trim().to_string(),
        authentication_method: request.authentication_method,
        vault_reference,
        description: request.description,
        created_at,
        updated_at: now,
    })
}

fn validate_profile_id(id: &str) -> Result<(), AppError> {
    if id.is_empty() || id.len() > 128 || id.contains('\0') {
        return Err(AppError::Validation(
            "Invalid credential profile reference".into(),
        ));
    }
    Ok(())
}

fn validate_credential_fields(
    name: &str,
    username: &str,
    method: &AuthMethod,
    password: Option<&str>,
    has_existing_secret: bool,
) -> Result<(), AppError> {
    if name.trim().is_empty() || username.trim().is_empty() {
        return Err(AppError::Validation(
            "Credential name and username are required".into(),
        ));
    }
    if name.len() > 120
        || username.len() > 256
        || password.is_some_and(|secret| secret.len() > 4096)
    {
        return Err(AppError::Validation(
            "Credential profile fields are too long".into(),
        ));
    }
    if name.contains('\0')
        || username.contains('\0')
        || password.is_some_and(|secret| secret.contains('\0'))
    {
        return Err(AppError::Validation(
            "Credential profile contains invalid characters".into(),
        ));
    }
    if matches!(method, AuthMethod::Password)
        && !has_existing_secret
        && !password.is_some_and(|secret| !secret.is_empty())
    {
        return Err(AppError::Validation(
            "A password is required for password credential profiles".into(),
        ));
    }
    Ok(())
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
    validate_profile_id(&id)?;
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

#[cfg(test)]
mod tests {
    use super::validate_credential_fields;
    use crate::models::AuthMethod;

    #[test]
    fn password_profiles_require_a_vault_secret() {
        assert!(
            validate_credential_fields("Network", "admin", &AuthMethod::Password, None, false)
                .is_err()
        );
        assert!(validate_credential_fields(
            "Network",
            "admin",
            &AuthMethod::Password,
            Some(""),
            false
        )
        .is_err());
        assert!(validate_credential_fields(
            "Network",
            "admin",
            &AuthMethod::Password,
            Some("secret"),
            false
        )
        .is_ok());
        assert!(
            validate_credential_fields("Network", "admin", &AuthMethod::Password, None, true)
                .is_ok()
        );
    }
}
