use tauri::{AppHandle, State};

use crate::error::AppError;
use crate::terminal::{NativeSshManager, TelnetManager};

/// Connect to SSH using native in-process SSH (no external ssh.exe)
#[tauri::command]
pub async fn spawn_terminal(
    app: AppHandle,
    ssh_manager: State<'_, NativeSshManager>,
    telnet_manager: State<'_, TelnetManager>,
    tab_id: String,
    host: String,
    port: u16,
    protocol: String,
    username: Option<String>,
    password: Option<String>,
) -> Result<(), AppError> {
    match protocol.as_str() {
        "ssh" => {
            let user = username.as_deref().unwrap_or("");
            let pass = password.as_deref().unwrap_or("");

            if user.is_empty() {
                return Err(AppError::Ssh("Username is required for SSH connection".to_string()));
            }

            crate::terminal::connect_ssh(
                &app,
                &ssh_manager,
                &tab_id,
                &host,
                port,
                user,
                pass,
            ).await?;
        }
        "telnet" => {
            crate::terminal::spawn_telnet(
                &app,
                &telnet_manager,
                &tab_id,
                &host,
                port,
            ).await?;
        }
        _ => {
            return Err(AppError::Generic(format!("Unsupported protocol: {}", protocol)));
        }
    }
    Ok(())
}

/// Write terminal input from xterm.js to the connection
#[tauri::command]
pub async fn write_terminal(
    ssh_manager: State<'_, NativeSshManager>,
    telnet_manager: State<'_, TelnetManager>,
    tab_id: String,
    data: String,
    protocol: Option<String>,
) -> Result<(), AppError> {
    let proto = protocol.as_deref().unwrap_or("ssh");
    match proto {
        "telnet" => {
            crate::terminal::write_telnet(&telnet_manager, &tab_id, data.as_bytes()).await
        }
        _ => {
            crate::terminal::write_ssh(&ssh_manager, &tab_id, data.as_bytes()).await
        }
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
pub async fn close_terminal(
    ssh_manager: State<'_, NativeSshManager>,
    telnet_manager: State<'_, TelnetManager>,
    tab_id: String,
    protocol: Option<String>,
) -> Result<(), AppError> {
    let proto = protocol.as_deref().unwrap_or("ssh");
    match proto {
        "telnet" => crate::terminal::close_telnet(&telnet_manager, &tab_id).await,
        _ => crate::terminal::close_ssh(&ssh_manager, &tab_id).await,
    }
}
