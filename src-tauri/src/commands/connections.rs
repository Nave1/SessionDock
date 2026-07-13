use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use tauri::{AppHandle, Emitter, State};

use crate::credential_vault::{self, CredentialVault};
use crate::db::Database;
use crate::error::AppError;
use crate::protocols::ssh::{SshAuth, SshConfig, SshSession};
use crate::protocols::telnet::{TelnetConfig, TelnetSession};

/// Manages active terminal connections
pub struct ConnectionManager {
    ssh_sessions: Arc<Mutex<HashMap<String, SshSession>>>,
    telnet_sessions: Arc<Mutex<HashMap<String, TelnetSession>>>,
}

impl ConnectionManager {
    pub fn new() -> Self {
        Self {
            ssh_sessions: Arc::new(Mutex::new(HashMap::new())),
            telnet_sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

#[tauri::command]
pub async fn connect_ssh(
    app: AppHandle,
    db: State<'_, Database>,
    connection_manager: State<'_, ConnectionManager>,
    tab_id: String,
    session_id: String,
) -> Result<String, AppError> {
    let conn = db.conn();

    // Get session details
    let (host, port, username, credential_profile_id, auth_method, timeout, keepalive): (
        String, u16, Option<String>, Option<String>, String, u32, u32,
    ) = conn
        .query_row(
            "SELECT host, port, username, credential_profile_id, authentication_method, connection_timeout, keepalive_interval FROM sessions WHERE id = ?1",
            rusqlite::params![session_id],
            |row| Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
                row.get(5)?,
                row.get(6)?,
            )),
        )
        .map_err(|_| AppError::NotFound("Session not found".into()))?;

    let username = username.unwrap_or_default();

    // Resolve authentication
    let auth = match auth_method.as_str() {
        "password" => {
            if let Some(cred_id) = &credential_profile_id {
                let vault_ref: String = conn
                    .query_row(
                        "SELECT vault_reference FROM credential_profiles WHERE id = ?1",
                        rusqlite::params![cred_id],
                        |row| row.get(0),
                    )
                    .map_err(|_| AppError::NotFound("Credential profile not found".into()))?;

                let vault = credential_vault::get_vault();
                let password = vault.get_secret(&vault_ref)?
                    .ok_or_else(|| AppError::CredentialVault("Password not found in vault".into()))?;

                SshAuth::Password(password)
            } else {
                return Err(AppError::Ssh("No credential profile assigned".into()));
            }
        }
        "private_key" => {
            // Get the private key path from session
            let key_path: Option<String> = conn
                .query_row(
                    "SELECT private_key_reference FROM sessions WHERE id = ?1",
                    rusqlite::params![session_id],
                    |row| row.get(0),
                )
                .map_err(|_| AppError::NotFound("Session not found".into()))?;

            let key_path = key_path
                .ok_or_else(|| AppError::Ssh("No private key configured".into()))?;

            // Check if there's a passphrase stored
            let passphrase = if let Some(cred_id) = &credential_profile_id {
                let vault_ref: String = conn
                    .query_row(
                        "SELECT vault_reference FROM credential_profiles WHERE id = ?1",
                        rusqlite::params![cred_id],
                        |row| row.get(0),
                    )
                    .unwrap_or_default();

                if !vault_ref.is_empty() {
                    let vault = credential_vault::get_vault();
                    vault.get_secret(&vault_ref)?
                } else {
                    None
                }
            } else {
                None
            };

            SshAuth::PrivateKey { key_path, passphrase }
        }
        "ssh_agent" => SshAuth::Agent,
        _ => {
            return Err(AppError::Ssh("Manual authentication requires user input".into()));
        }
    };

    let config = SshConfig {
        host: host.clone(),
        port,
        username,
        auth,
        timeout_secs: timeout,
        keepalive_secs: keepalive,
    };

    let mut session = SshSession::new(config);
    let result = session.connect().await?;

    // Store the session
    let mut sessions = connection_manager.ssh_sessions.lock().await;
    sessions.insert(tab_id.clone(), session);

    // Update last_connected_at
    let now = chrono::Utc::now().to_rfc3339();
    let _ = conn.execute(
        "UPDATE sessions SET last_connected_at = ?1, connection_count = connection_count + 1 WHERE id = ?2",
        rusqlite::params![now, session_id],
    );

    // Emit connected status
    let _ = app.emit(&format!("terminal-status-{}", tab_id), "connected");

    Ok(result)
}

#[tauri::command]
pub async fn connect_telnet(
    app: AppHandle,
    connection_manager: State<'_, ConnectionManager>,
    tab_id: String,
    host: String,
    port: u16,
    timeout_secs: u32,
) -> Result<(), AppError> {
    let config = TelnetConfig {
        host: host.clone(),
        port,
        timeout_secs,
    };

    let mut session = TelnetSession::new(config);
    session.connect().await?;

    let mut sessions = connection_manager.telnet_sessions.lock().await;
    sessions.insert(tab_id.clone(), session);

    let _ = app.emit(&format!("terminal-status-{}", tab_id), "connected");

    Ok(())
}

#[tauri::command]
pub async fn terminal_write(
    connection_manager: State<'_, ConnectionManager>,
    tab_id: String,
    data: Vec<u8>,
    protocol: String,
) -> Result<(), AppError> {
    match protocol.as_str() {
        "ssh" => {
            let mut sessions = connection_manager.ssh_sessions.lock().await;
            if let Some(session) = sessions.get_mut(&tab_id) {
                session.write(&data).await?;
            }
        }
        "telnet" => {
            let mut sessions = connection_manager.telnet_sessions.lock().await;
            if let Some(session) = sessions.get_mut(&tab_id) {
                session.write(&data).await?;
            }
        }
        _ => {}
    }
    Ok(())
}

#[tauri::command]
pub async fn terminal_resize(
    connection_manager: State<'_, ConnectionManager>,
    tab_id: String,
    cols: u32,
    rows: u32,
    protocol: String,
) -> Result<(), AppError> {
    match protocol.as_str() {
        "ssh" => {
            let mut sessions = connection_manager.ssh_sessions.lock().await;
            if let Some(session) = sessions.get_mut(&tab_id) {
                session.resize(cols, rows).await?;
            }
        }
        "telnet" => {
            let mut sessions = connection_manager.telnet_sessions.lock().await;
            if let Some(session) = sessions.get_mut(&tab_id) {
                session.send_window_size(cols as u16, rows as u16).await?;
            }
        }
        _ => {}
    }
    Ok(())
}

#[tauri::command]
pub async fn disconnect_terminal(
    app: AppHandle,
    connection_manager: State<'_, ConnectionManager>,
    tab_id: String,
    protocol: String,
) -> Result<(), AppError> {
    match protocol.as_str() {
        "ssh" => {
            let mut sessions = connection_manager.ssh_sessions.lock().await;
            if let Some(mut session) = sessions.remove(&tab_id) {
                session.disconnect().await?;
            }
        }
        "telnet" => {
            let mut sessions = connection_manager.telnet_sessions.lock().await;
            if let Some(mut session) = sessions.remove(&tab_id) {
                session.disconnect().await?;
            }
        }
        _ => {}
    }

    let _ = app.emit(&format!("terminal-status-{}", tab_id), "disconnected");
    Ok(())
}
