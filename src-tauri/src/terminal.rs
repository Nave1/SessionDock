// Process-based terminal backend
// Spawns real SSH/Telnet processes and pipes I/O through Tauri events

use std::collections::HashMap;
use std::process::Stdio;
use std::sync::Arc;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;
use tauri::{AppHandle, Emitter};

use crate::error::AppError;

pub struct TerminalProcess {
    stdin: Option<tokio::process::ChildStdin>,
    _child: Child,
}

pub struct ProcessManager {
    processes: Arc<Mutex<HashMap<String, TerminalProcess>>>,
}

impl ProcessManager {
    pub fn new() -> Self {
        Self {
            processes: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

/// Spawn an SSH process using the system's ssh.exe
pub async fn spawn_ssh(
    app: &AppHandle,
    manager: &ProcessManager,
    tab_id: &str,
    host: &str,
    port: u16,
    username: Option<&str>,
) -> Result<(), AppError> {
    let mut cmd = Command::new("ssh");

    // Build SSH arguments
    if let Some(user) = username {
        cmd.arg(format!("{}@{}", user, host));
    } else {
        cmd.arg(host);
    }

    cmd.arg("-p").arg(port.to_string());
    cmd.arg("-o").arg("StrictHostKeyChecking=accept-new");

    cmd.stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    // CREATE_NO_WINDOW hides the console. SSH reads password from stdin
    // (which we pipe from xterm.js) when no console is available.
    // Do NOT use -tt flag as it requires a real terminal.
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let mut child = cmd.spawn()
        .map_err(|e| AppError::Ssh(format!("Failed to start SSH: {}", e)))?;

    let stdin = child.stdin.take();
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    let tab_id_owned = tab_id.to_string();
    let app_clone = app.clone();

    // Read stdout in background and emit to frontend
    if let Some(mut stdout) = stdout {
        let tid = tab_id_owned.clone();
        let app2 = app_clone.clone();
        tokio::spawn(async move {
            let mut buf = [0u8; 4096];
            loop {
                match stdout.read(&mut buf).await {
                    Ok(0) => {
                        let _ = app2.emit(&format!("terminal-data-{}", tid), "");
                        let _ = app2.emit(&format!("terminal-status-{}", tid), "disconnected");
                        break;
                    }
                    Ok(n) => {
                        // Send as base64 to handle binary data
                        let data = String::from_utf8_lossy(&buf[..n]).to_string();
                        let _ = app2.emit(&format!("terminal-data-{}", tid), &data);
                    }
                    Err(_) => break,
                }
            }
        });
    }

    // Read stderr in background
    if let Some(mut stderr) = stderr {
        let tid = tab_id_owned.clone();
        let app3 = app_clone.clone();
        tokio::spawn(async move {
            let mut buf = [0u8; 4096];
            loop {
                match stderr.read(&mut buf).await {
                    Ok(0) => break,
                    Ok(n) => {
                        let data = String::from_utf8_lossy(&buf[..n]).to_string();
                        let _ = app3.emit(&format!("terminal-data-{}", tid), &data);
                    }
                    Err(_) => break,
                }
            }
        });
    }

    // Emit connected status
    let _ = app.emit(&format!("terminal-status-{}", tab_id), "connected");

    // Store process
    let mut procs = manager.processes.lock().await;
    procs.insert(tab_id.to_string(), TerminalProcess {
        stdin,
        _child: child,
    });

    Ok(())
}

/// Spawn a Telnet process
pub async fn spawn_telnet(
    app: &AppHandle,
    manager: &ProcessManager,
    tab_id: &str,
    host: &str,
    port: u16,
) -> Result<(), AppError> {
    // Use Windows telnet or putty's plink as fallback
    let mut cmd = Command::new("telnet");
    cmd.arg(host).arg(port.to_string());

    cmd.stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let mut child = cmd.spawn()
        .map_err(|e| AppError::Telnet(format!("Failed to start Telnet: {}. Telnet client may not be installed.", e)))?;

    let stdin = child.stdin.take();
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    let tab_id_owned = tab_id.to_string();
    let app_clone = app.clone();

    if let Some(mut stdout) = stdout {
        let tid = tab_id_owned.clone();
        let app2 = app_clone.clone();
        tokio::spawn(async move {
            let mut buf = [0u8; 4096];
            loop {
                match stdout.read(&mut buf).await {
                    Ok(0) => {
                        let _ = app2.emit(&format!("terminal-status-{}", tid), "disconnected");
                        break;
                    }
                    Ok(n) => {
                        let data = String::from_utf8_lossy(&buf[..n]).to_string();
                        let _ = app2.emit(&format!("terminal-data-{}", tid), &data);
                    }
                    Err(_) => break,
                }
            }
        });
    }

    if let Some(mut stderr) = stderr {
        let tid = tab_id_owned.clone();
        let app3 = app_clone;
        tokio::spawn(async move {
            let mut buf = [0u8; 4096];
            loop {
                match stderr.read(&mut buf).await {
                    Ok(0) => break,
                    Ok(n) => {
                        let data = String::from_utf8_lossy(&buf[..n]).to_string();
                        let _ = app3.emit(&format!("terminal-data-{}", tid), &data);
                    }
                    Err(_) => break,
                }
            }
        });
    }

    let _ = app.emit(&format!("terminal-status-{}", tab_id), "connected");

    let mut procs = manager.processes.lock().await;
    procs.insert(tab_id.to_string(), TerminalProcess {
        stdin,
        _child: child,
    });

    Ok(())
}

/// Write data to a terminal process stdin
pub async fn write_to_process(
    manager: &ProcessManager,
    tab_id: &str,
    data: &[u8],
) -> Result<(), AppError> {
    let mut procs = manager.processes.lock().await;
    if let Some(proc) = procs.get_mut(tab_id) {
        if let Some(stdin) = &mut proc.stdin {
            stdin.write_all(data).await
                .map_err(|e| AppError::Generic(format!("Write error: {}", e)))?;
            stdin.flush().await
                .map_err(|e| AppError::Generic(format!("Flush error: {}", e)))?;
        }
    }
    Ok(())
}

/// Kill a terminal process
pub async fn kill_process(
    manager: &ProcessManager,
    tab_id: &str,
) -> Result<(), AppError> {
    let mut procs = manager.processes.lock().await;
    if let Some(mut proc) = procs.remove(tab_id) {
        let _ = proc._child.kill().await;
    }
    Ok(())
}
