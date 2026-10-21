use tauri::{AppHandle, State};

use crate::credential_vault::{self, CredentialVault};
use crate::db::Database;
use crate::error::AppError;
use crate::terminal::{
    JumpHostConfig, NativeSshManager, SerialManager, SshAuthentication, SshConnectConfig,
    TelnetManager,
};
use serde::{Deserialize, Serialize};

#[derive(Serialize)]
pub struct SshHostKeyInspection {
    host: String,
    address: String,
    port: u16,
    key_type: String,
    fingerprint: String,
    verification: crate::commands::known_hosts::HostKeyVerification,
}

#[tauri::command]
pub async fn inspect_ssh_host_key(
    db: State<'_, Database>,
    host: String,
    port: u16,
    jump_host_ids: Option<Vec<String>>,
) -> Result<SshHostKeyInspection, AppError> {
    let host = validate_ssh_endpoint(&host, port)?;

    let jump_hosts = resolve_jump_hosts(&db, jump_host_ids.as_deref().unwrap_or(&[]))?;
    let inspection = crate::terminal::inspect_ssh_route(&db, host, port, jump_hosts).await?;

    Ok(SshHostKeyInspection {
        host: inspection.host,
        address: inspection.address,
        port: inspection.port,
        key_type: inspection.key_type,
        fingerprint: inspection.fingerprint,
        verification: inspection.verification,
    })
}

/// Connect to SSH using native in-process SSH (no external ssh.exe)
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpawnTerminalRequest {
    tab_id: String,
    host: String,
    port: u16,
    protocol: String,
    username: Option<String>,
    password: Option<String>,
    authentication_method: Option<String>,
    credential_profile_id: Option<String>,
    private_key_reference: Option<String>,
    jump_host_ids: Option<Vec<String>>,
    keepalive_secs: Option<u32>,
    serial_baud_rate: Option<u32>,
}

#[tauri::command]
pub async fn spawn_terminal(
    app: AppHandle,
    db: State<'_, Database>,
    ssh_manager: State<'_, NativeSshManager>,
    log_manager: State<'_, super::terminal_logging::TerminalLogManager>,
    telnet_manager: State<'_, TelnetManager>,
    serial_manager: State<'_, SerialManager>,
    request: SpawnTerminalRequest,
) -> Result<(), AppError> {
    let SpawnTerminalRequest {
        tab_id,
        host,
        port,
        protocol,
        username,
        password,
        authentication_method,
        credential_profile_id,
        private_key_reference,
        jump_host_ids,
        keepalive_secs,
        serial_baud_rate,
    } = request;
    match protocol.as_str() {
        "ssh" => {
            let host = validate_ssh_endpoint(&host, port)?;
            let user = username.as_deref().unwrap_or("");
            let pass = password.as_deref().unwrap_or("");

            if user.is_empty() {
                return Err(AppError::Ssh("Username is required".to_string()));
            }

            let authentication = resolve_ssh_authentication(
                &db,
                authentication_method.as_deref().unwrap_or("password"),
                credential_profile_id.as_deref(),
                private_key_reference.as_deref(),
                pass,
            )?;
            let jump_hosts = resolve_jump_hosts(&db, jump_host_ids.as_deref().unwrap_or(&[]))?;

            crate::terminal::connect_ssh(
                &app,
                &ssh_manager,
                &log_manager,
                &db,
                SshConnectConfig {
                    tab_id,
                    host,
                    port,
                    username: user.to_string(),
                    authentication,
                    jump_hosts,
                    keepalive_secs: keepalive_secs.unwrap_or(60),
                },
            )
            .await?;
        }
        "telnet" => {
            crate::terminal::spawn_telnet(
                &app,
                &telnet_manager,
                &log_manager,
                &tab_id,
                &host,
                port,
            )
            .await?;
        }
        "serial" => {
            crate::terminal::connect_serial(
                &app,
                &serial_manager,
                &log_manager,
                &tab_id,
                &host,
                serial_baud_rate.unwrap_or(9600),
            )
            .await?;
        }
        _ => {
            return Err(AppError::Generic(format!(
                "Unsupported protocol: {}",
                protocol
            )));
        }
    }
    Ok(())
}

fn resolve_jump_hosts(
    db: &Database,
    jump_host_ids: &[String],
) -> Result<Vec<JumpHostConfig>, AppError> {
    if jump_host_ids.len() > 5 {
        return Err(AppError::Validation(
            "SSH jump-host chains are limited to 5 hops".into(),
        ));
    }

    let mut unique = std::collections::HashSet::new();
    let mut jump_hosts = Vec::with_capacity(jump_host_ids.len());
    for jump_host_id in jump_host_ids {
        if jump_host_id.is_empty()
            || jump_host_id.len() > 128
            || jump_host_id.contains('\0')
            || !unique.insert(jump_host_id)
        {
            return Err(AppError::Validation(
                "Jump-host chain contains an invalid or duplicate session reference".into(),
            ));
        }

        let (name, host, port, username, credential_profile_id, method, private_key_reference) = {
            let conn = db.conn();
            conn.query_row(
                "SELECT name, host, port, username, credential_profile_id, authentication_method, private_key_reference FROM sessions WHERE id = ?1 AND protocol = 'ssh'",
                rusqlite::params![jump_host_id],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, u16>(2)?,
                        row.get::<_, Option<String>>(3)?,
                        row.get::<_, Option<String>>(4)?,
                        row.get::<_, String>(5)?,
                        row.get::<_, Option<String>>(6)?,
                    ))
                },
            )
            .map_err(|_| AppError::NotFound("Jump-host SSH session not found".into()))?
        };

        let host = validate_ssh_endpoint(&host, port)?;
        let username = username
            .filter(|value| !value.trim().is_empty())
            .ok_or_else(|| {
                AppError::Validation(format!("Jump host '{name}' requires a username"))
            })?;
        let authentication = resolve_ssh_authentication(
            db,
            &method,
            credential_profile_id.as_deref(),
            private_key_reference.as_deref(),
            "",
        )
        .map_err(|error| AppError::Ssh(format!("Jump host '{name}' authentication: {error}")))?;

        jump_hosts.push(JumpHostConfig {
            name,
            host,
            port,
            username,
            authentication,
        });
    }
    Ok(jump_hosts)
}

fn validate_ssh_endpoint(host: &str, port: u16) -> Result<String, AppError> {
    let host = host.trim();
    if host.is_empty()
        || host.len() > 253
        || host.contains('\0')
        || host.chars().any(char::is_whitespace)
        || port == 0
    {
        return Err(AppError::Validation(
            "A valid SSH host and port are required".into(),
        ));
    }
    Ok(host.to_string())
}

fn resolve_ssh_authentication(
    db: &Database,
    method: &str,
    credential_profile_id: Option<&str>,
    private_key_reference: Option<&str>,
    provided_password: &str,
) -> Result<SshAuthentication, AppError> {
    match method {
        "password" | "manual" => {
            let password = if !provided_password.is_empty() {
                provided_password.to_string()
            } else {
                credential_secret(db, credential_profile_id, method)?
                    .ok_or_else(|| AppError::Ssh("Password is required".into()))?
            };
            Ok(SshAuthentication::Password(password))
        }
        "private_key" => {
            let key_path = crate::terminal::validate_private_key_path(
                private_key_reference.unwrap_or_default(),
            )?;
            let passphrase = credential_secret(db, credential_profile_id, method)?;
            Ok(SshAuthentication::PrivateKey {
                key_path,
                passphrase,
            })
        }
        "ssh_agent" => Ok(SshAuthentication::Agent),
        _ => Err(AppError::Validation(
            "Unsupported SSH authentication method".into(),
        )),
    }
}

fn credential_secret(
    db: &Database,
    credential_profile_id: Option<&str>,
    expected_method: &str,
) -> Result<Option<String>, AppError> {
    let Some(profile_id) = credential_profile_id else {
        return Ok(None);
    };
    if profile_id.is_empty() || profile_id.len() > 128 || profile_id.contains('\0') {
        return Err(AppError::Validation(
            "Invalid credential profile reference".into(),
        ));
    }

    let conn = db.conn();
    let (vault_reference, profile_method): (String, String) = conn
        .query_row(
            "SELECT vault_reference, authentication_method FROM credential_profiles WHERE id = ?1",
            rusqlite::params![profile_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|_| AppError::NotFound("Credential profile not found".into()))?;
    drop(conn);

    if profile_method != expected_method
        && !(expected_method == "manual" && profile_method == "password")
    {
        return Err(AppError::Validation(
            "Credential profile does not match the selected authentication method".into(),
        ));
    }

    credential_vault::get_vault().get_secret(&vault_reference)
}

#[cfg(test)]
mod tests {
    use super::{resolve_jump_hosts, resolve_ssh_authentication, validate_ssh_endpoint};
    use crate::db::Database;
    use crate::terminal::SshAuthentication;

    #[test]
    fn resolves_non_secret_ssh_authentication_requests() {
        let db_path =
            std::env::temp_dir().join(format!("sessiondock-auth-{}.db", uuid::Uuid::new_v4()));
        let key_path =
            std::env::temp_dir().join(format!("sessiondock-auth-key-{}", uuid::Uuid::new_v4()));
        std::fs::write(&key_path, "fixture").unwrap();
        let db = Database::new(&db_path).unwrap();

        assert!(matches!(
            resolve_ssh_authentication(&db, "password", None, None, "ephemeral").unwrap(),
            SshAuthentication::Password(secret) if secret == "ephemeral"
        ));
        assert!(matches!(
            resolve_ssh_authentication(&db, "private_key", None, key_path.to_str(), "").unwrap(),
            SshAuthentication::PrivateKey {
                passphrase: None,
                ..
            }
        ));
        assert!(matches!(
            resolve_ssh_authentication(&db, "ssh_agent", None, None, "").unwrap(),
            SshAuthentication::Agent
        ));
        assert!(resolve_ssh_authentication(&db, "unsupported", None, None, "").is_err());

        drop(db);
        std::fs::remove_file(key_path).unwrap();
        std::fs::remove_file(db_path).unwrap();
    }

    #[test]
    fn validates_and_resolves_agent_backed_jump_hosts() {
        let db_path = std::env::temp_dir().join(format!(
            "sessiondock-jump-resolution-{}.db",
            uuid::Uuid::new_v4()
        ));
        let db = Database::new(&db_path).unwrap();
        db.conn()
            .execute(
                "INSERT INTO sessions (id, name, host, port, protocol, username, authentication_method) VALUES ('jump-1', 'Bastion', 'bastion.example', 2222, 'ssh', 'ops', 'ssh_agent')",
                [],
            )
            .unwrap();

        let route = resolve_jump_hosts(&db, &["jump-1".into()]).unwrap();
        assert_eq!(route.len(), 1);
        assert_eq!(route[0].host, "bastion.example");
        assert_eq!(route[0].port, 2222);
        assert!(resolve_jump_hosts(&db, &["jump-1".into(), "jump-1".into()]).is_err());
        assert!(resolve_jump_hosts(&db, &["missing".into()]).is_err());
        assert!(validate_ssh_endpoint("bad host", 22).is_err());
        assert!(validate_ssh_endpoint("host.example", 0).is_err());

        drop(db);
        std::fs::remove_file(db_path).unwrap();
    }
}

/// Write terminal input from xterm.js to the connection
#[tauri::command]
pub async fn write_terminal(
    ssh_manager: State<'_, NativeSshManager>,
    telnet_manager: State<'_, TelnetManager>,
    serial_manager: State<'_, SerialManager>,
    tab_id: String,
    data: String,
    protocol: Option<String>,
) -> Result<(), AppError> {
    let proto = protocol.as_deref().unwrap_or("ssh");
    match proto {
        "telnet" => crate::terminal::write_telnet(&telnet_manager, &tab_id, data.as_bytes()).await,
        "serial" => crate::terminal::write_serial(&serial_manager, &tab_id, data.as_bytes()).await,
        _ => crate::terminal::write_ssh(&ssh_manager, &tab_id, data.as_bytes()).await,
    }
}

/// Resize terminal PTY
#[tauri::command]
pub async fn resize_terminal(
    ssh_manager: State<'_, NativeSshManager>,
    tab_id: String,
    cols: u32,
    rows: u32,
) -> Result<(), AppError> {
    crate::terminal::resize_ssh(&ssh_manager, &tab_id, cols, rows).await
}

/// Close a terminal connection
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn close_terminal(
    ssh_manager: State<'_, NativeSshManager>,
    sftp_transfer_manager: State<'_, super::sftp::SftpTransferManager>,
    tunnel_manager: State<'_, super::tunnels::SshTunnelManager>,
    diagnostics_manager: State<'_, super::diagnostics::DiagnosticsManager>,
    multi_exec_manager: State<'_, super::multi_exec::MultiExecManager>,
    log_manager: State<'_, super::terminal_logging::TerminalLogManager>,
    telnet_manager: State<'_, TelnetManager>,
    serial_manager: State<'_, SerialManager>,
    tab_id: String,
    protocol: Option<String>,
) -> Result<(), AppError> {
    let proto = protocol.as_deref().unwrap_or("ssh");
    sftp_transfer_manager.cancel_tab(&tab_id).await;
    tunnel_manager.cancel_tab(&tab_id).await;
    diagnostics_manager.cancel_tab(&tab_id).await;
    multi_exec_manager.cancel_tab(&tab_id).await;
    log_manager.stop_tab(&tab_id).await;
    match proto {
        "telnet" => crate::terminal::close_telnet(&telnet_manager, &tab_id).await,
        "serial" => crate::terminal::close_serial(&serial_manager, &tab_id).await,
        _ => crate::terminal::close_ssh(&ssh_manager, &tab_id).await,
    }
}
