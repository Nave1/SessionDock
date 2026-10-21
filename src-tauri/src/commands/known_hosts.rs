use crate::db::Database;
use crate::error::AppError;
use serde::{Deserialize, Serialize};
use tauri::State;

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
    verify_host_key_for_database(&db, &host, port, &key_type, &fingerprint)
}

pub fn verify_host_key_for_database(
    db: &Database,
    host: &str,
    port: u16,
    key_type: &str,
    fingerprint: &str,
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
                    new_fingerprint: fingerprint.to_string(),
                    new_key_type: key_type.to_string(),
                })
            }
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(HostKeyVerification::Unknown {
            fingerprint: fingerprint.to_string(),
            key_type: key_type.to_string(),
        }),
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
    trust_host_key_for_database(&db, &host, port, &key_type, &fingerprint)
}

fn trust_host_key_for_database(
    db: &Database,
    host: &str,
    port: u16,
    key_type: &str,
    fingerprint: &str,
) -> Result<(), AppError> {
    let conn = db.conn();
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    let inserted = conn.execute(
        "INSERT OR IGNORE INTO known_hosts (id, host, port, key_type, fingerprint, trusted_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![id, host, port, key_type, fingerprint, now, now],
    )?;
    if inserted == 0 {
        return Err(AppError::Generic(
            "A trusted key already exists for this host. Review and remove it before trusting a replacement."
                .to_string(),
        ));
    }

    Ok(())
}

#[tauri::command]
pub fn remove_known_host(db: State<'_, Database>, id: String) -> Result<(), AppError> {
    let conn = db.conn();
    conn.execute(
        "DELETE FROM known_hosts WHERE id = ?1",
        rusqlite::params![id],
    )?;
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

#[cfg(test)]
mod tests {
    use super::{trust_host_key_for_database, verify_host_key_for_database, HostKeyVerification};
    use crate::db::Database;

    #[test]
    fn distinguishes_unknown_trusted_and_changed_host_keys() {
        let path = std::env::temp_dir().join(format!(
            "sessiondock-known-hosts-{}.db",
            uuid::Uuid::new_v4()
        ));
        let db = Database::new(&path).unwrap();

        assert!(matches!(
            verify_host_key_for_database(&db, "leaf.example", 22, "Ed25519", "SHA256:first")
                .unwrap(),
            HostKeyVerification::Unknown { .. }
        ));

        db.conn().execute(
            "INSERT INTO known_hosts (id, host, port, key_type, fingerprint) VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params!["known-1", "leaf.example", 22, "Ed25519", "SHA256:first"],
        ).unwrap();

        assert!(matches!(
            verify_host_key_for_database(&db, "leaf.example", 22, "Ed25519", "SHA256:first")
                .unwrap(),
            HostKeyVerification::Trusted
        ));
        assert!(matches!(
            verify_host_key_for_database(&db, "leaf.example", 22, "Ed25519", "SHA256:changed")
                .unwrap(),
            HostKeyVerification::Changed { .. }
        ));
        assert!(
            trust_host_key_for_database(&db, "leaf.example", 22, "Ed25519", "SHA256:changed")
                .is_err()
        );
        assert!(matches!(
            verify_host_key_for_database(&db, "leaf.example", 22, "Ed25519", "SHA256:first")
                .unwrap(),
            HostKeyVerification::Trusted
        ));

        drop(db);
        std::fs::remove_file(path).unwrap();
    }
}
