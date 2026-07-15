use tauri::{AppHandle, State};

use crate::error::AppError;
use crate::terminal::{self, ProcessManager};

#[tauri::command]
pub async fn spawn_terminal(
    app: AppHandle,
    process_manager: State<'_, ProcessManager>,
    tab_id: String,
    host: String,
    port: u16,
    protocol: String,
    username: Option<String>,
) -> Result<(), AppError> {
    match protocol.as_str() {
        "ssh" => {
            terminal::spawn_ssh(
                &app,
                &process_manager,
                &tab_id,
                &host,
                port,
                username.as_deref(),
            ).await?;
        }
        "telnet" => {
            terminal::spawn_telnet(
                &app,
                &process_manager,
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

#[tauri::command]
pub async fn write_terminal(
    process_manager: State<'_, ProcessManager>,
    tab_id: String,
    data: String,
) -> Result<(), AppError> {
    terminal::write_to_process(&process_manager, &tab_id, data.as_bytes()).await
}

#[tauri::command]
pub async fn close_terminal(
    process_manager: State<'_, ProcessManager>,
    tab_id: String,
) -> Result<(), AppError> {
    terminal::kill_process(&process_manager, &tab_id).await
}
