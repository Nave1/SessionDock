use tauri::State;
use crate::db::Database;
use crate::error::AppError;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct KnownHost {
    pub id: String,
    pub host: String,
    pub port: u16,
    pub key_type: String,
    pub fingerprint: String,
    pub trusted_at: String,
    pub updated_at: String,
}

#[tauri::command]
pub fn get_known_hosts(db: State<'_, Database>) -> Result<Vec<KnownHost>, AppError> {
    let conn = db.conn();
    let mut stmt = conn.prepare(
        "SELECT id, host, port, key_type, fingerprint, trusted_at, updated_at FROM known_hosts ORDER BY host"
    )?;

    let hosts = stmt.query_map([], |row| {
        Ok(KnownHost {
            id: row.get(0)?,
            host: row.get(1)?,
            port: row.get(2)?,
            key_type: row.get(3)?,
            fingerprint: row.get(4)?,
            trusted_at: row.get(5)?,
            updated_at: row.get(6)?,
        })
    })?;

    let mut result = Vec::new();
    for host in hosts {
        result.push(host?);
    }
    Ok(result)
}

#[tauri::command]
pub fn verify_host_key(
    db: State<'_, Database>,
    host: String,
    port: u16,
    key_type: String,
    fingerprint: String,
) -> Result<HostKeyVerification, AppError> {
    let conn = db.conn();

    match conn.query_row(
        "SELECT fingerprint, key_type FROM known_hosts WHERE host = ?1 AND port = ?2",
        rusqlite::params![host, port],
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
    ) {
        Ok((stored_fingerprint, stored_key_type)) => {
            if stored_fingerprint == fingerprint && stored_key_type == key_type {
                Ok(HostKeyVerification::Trusted)
            } else {
                Ok(HostKeyVerification::Changed {
                    old_fingerprint: stored_fingerprint,
                    old_key_type: stored_key_type,
                    new_fingerprint: fingerprint,
                    new_key_type: key_type,
                })
            }
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => {
            Ok(HostKeyVerification::Unknown {
                fingerprint,
                key_type,
            })
        }
        Err(e) => Err(AppError::Database(e)),
    }
}

#[tauri::command]
pub fn trust_host_key(
    db: State<'_, Database>,
    host: String,
    port: u16,
    key_type: String,
    fingerprint: String,
) -> Result<(), AppError> {
    let conn = db.conn();
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT OR REPLACE INTO known_hosts (id, host, port, key_type, fingerprint, trusted_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![id, host, port, key_type, fingerprint, now, now],
    )?;

    Ok(())
}

#[tauri::command]
pub fn remove_known_host(db: State<'_, Database>, id: String) -> Result<(), AppError> {
    let conn = db.conn();
    conn.execute("DELETE FROM known_hosts WHERE id = ?1", rusqlite::params![id])?;
    Ok(())
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "status")]
pub enum HostKeyVerification {
    #[serde(rename = "trusted")]
    Trusted,
    #[serde(rename = "unknown")]
    Unknown {
        fingerprint: String,
        key_type: String,
    },
    #[serde(rename = "changed")]
    Changed {
        old_fingerprint: String,
        old_key_type: String,
        new_fingerprint: String,
        new_key_type: String,
    },
}
