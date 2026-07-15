// Native SSH terminal backend using ssh2 (libssh2)
// No external processes (ssh.exe, cmd.exe) are launched.
// All SSH protocol handling happens in-process.

use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::sync::Arc;
use std::time::Duration;
use ssh2::{Channel, Session};
use tokio::sync::Mutex;
use tauri::{AppHandle, Emitter};

use crate::error::AppError;

struct SshConnection {
    session: Session,
    channel: Channel,
}

// Safety: ssh2::Session and Channel are not Send/Sync by default,
// but we wrap them in a Mutex and only access from one task at a time.
unsafe impl Send for SshConnection {}
unsafe impl Sync for SshConnection {}

pub struct NativeSshManager {
    connections: Arc<Mutex<HashMap<String, Arc<Mutex<SshConnection>>>>>,
}

impl NativeSshManager {
    pub fn new() -> Self {
        Self {
            connections: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

/// Connect to an SSH server using password authentication.
/// Returns immediately after shell is opened.
/// Spawns a background task to stream output to the frontend.
pub async fn connect_ssh(
    app: &AppHandle,
    manager: &NativeSshManager,
    tab_id: &str,
    host: &str,
    port: u16,
    username: &str,
    password: &str,
) -> Result<(), AppError> {
    let addr = format!("{}:{}", host, port);
    let tab_id_owned = tab_id.to_string();

    // TCP connect with timeout (blocking, run in spawn_blocking)
    let tcp = tokio::task::spawn_blocking({
        let addr = addr.clone();
        move || {
            TcpStream::connect_timeout(
                &addr.parse().map_err(|e| AppError::Ssh(format!("Invalid address: {}", e)))?,
                Duration::from_secs(10),
            ).map_err(|e| AppError::Ssh(format!("Connection failed: {}", e)))
        }
    })
    .await
    .map_err(|e| AppError::Ssh(format!("Task error: {}", e)))??;

    tcp.set_nonblocking(false)
        .map_err(|e| AppError::Ssh(format!("Socket error: {}", e)))?;

    // SSH handshake
    let mut session = Session::new()
        .map_err(|e| AppError::Ssh(format!("SSH init error: {}", e)))?;
    session.set_tcp_stream(tcp);
    session.handshake()
        .map_err(|e| AppError::Ssh(format!("SSH handshake failed: {}", e)))?;

    // Authenticate with password
    session.userauth_password(username, password)
        .map_err(|e| {
            if e.to_string().contains("Authentication failed") ||
               e.to_string().contains("USERAUTH") {
                AppError::Ssh("Authentication failed: incorrect username or password".to_string())
            } else {
                AppError::Ssh(format!("Authentication error: {}", e))
            }
        })?;

    if !session.authenticated() {
        return Err(AppError::Ssh("Authentication failed".to_string()));
    }

    // Open channel and request PTY + shell
    let mut channel = session.channel_session()
        .map_err(|e| AppError::Ssh(format!("Channel error: {}", e)))?;

    channel.request_pty("xterm-256color", None, Some((80, 24, 0, 0)))
        .map_err(|e| AppError::Ssh(format!("PTY error: {}", e)))?;

    channel.shell()
        .map_err(|e| AppError::Ssh(format!("Shell error: {}", e)))?;

    // Set channel to non-blocking for reading
    session.set_blocking(false);

    let conn = Arc::new(Mutex::new(SshConnection { session, channel }));

    // Store connection
    {
        let mut conns = manager.connections.lock().await;
        conns.insert(tab_id_owned.clone(), conn.clone());
    }

    // Emit connected status
    let _ = app.emit(&format!("terminal-status-{}", tab_id), "connected");

    // Spawn background reader task
    let app_clone = app.clone();
    let tid = tab_id_owned.clone();
    let conn_reader = conn.clone();
    tokio::spawn(async move {
        let mut buf = [0u8; 4096];
        loop {
            tokio::time::sleep(Duration::from_millis(10)).await;

            let result = {
                let mut c = conn_reader.lock().await;
                c.channel.read(&mut buf)
            };

            match result {
                Ok(0) => {
                    // Channel closed
                    let _ = app_clone.emit(&format!("terminal-status-{}", tid), "disconnected");
                    break;
                }
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = app_clone.emit(&format!("terminal-data-{}", tid), &data);
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    // No data available, also check stderr
                    let stderr_result = {
                        let mut c = conn_reader.lock().await;
                        c.channel.stderr().read(&mut buf)
                    };
                    if let Ok(n) = stderr_result {
                        if n > 0 {
                            let data = String::from_utf8_lossy(&buf[..n]).to_string();
                            let _ = app_clone.emit(&format!("terminal-data-{}", tid), &data);
                        }
                    }
                    // Check if EOF
                    let eof = {
                        let c = conn_reader.lock().await;
                        c.channel.eof()
                    };
                    if eof {
                        let _ = app_clone.emit(&format!("terminal-status-{}", tid), "disconnected");
                        break;
                    }
                }
                Err(_) => {
                    let _ = app_clone.emit(&format!("terminal-status-{}", tid), "disconnected");
                    break;
                }
            }
        }
    });

    Ok(())
}

/// Write data from xterm.js to the SSH channel
pub async fn write_ssh(
    manager: &NativeSshManager,
    tab_id: &str,
    data: &[u8],
) -> Result<(), AppError> {
    let conns = manager.connections.lock().await;
    if let Some(conn) = conns.get(tab_id) {
        let mut c = conn.lock().await;
        c.session.set_blocking(true);
        c.channel.write_all(data)
            .map_err(|e| AppError::Ssh(format!("Write error: {}", e)))?;
        c.channel.flush()
            .map_err(|e| AppError::Ssh(format!("Flush error: {}", e)))?;
        c.session.set_blocking(false);
    }
    Ok(())
}

/// Resize the PTY
pub async fn resize_ssh(
    manager: &NativeSshManager,
    tab_id: &str,
    cols: u32,
    rows: u32,
) -> Result<(), AppError> {
    let conns = manager.connections.lock().await;
    if let Some(conn) = conns.get(tab_id) {
        let mut c = conn.lock().await;
        c.session.set_blocking(true);
        let _ = c.channel.request_pty_size(cols, rows, None, None);
        c.session.set_blocking(false);
    }
    Ok(())
}

/// Close an SSH connection
pub async fn close_ssh(
    manager: &NativeSshManager,
    tab_id: &str,
) -> Result<(), AppError> {
    let mut conns = manager.connections.lock().await;
    if let Some(conn) = conns.remove(tab_id) {
        let mut c = conn.lock().await;
        c.session.set_blocking(true);
        let _ = c.channel.send_eof();
        let _ = c.channel.close();
        let _ = c.channel.wait_close();
    }
    Ok(())
}

// --- Telnet process-based backend (kept as-is, separate from SSH) ---

use std::process::Stdio;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::process::{Child, Command};

pub struct TelnetProcess {
    stdin: Option<tokio::process::ChildStdin>,
    _child: Child,
}

pub struct TelnetManager {
    processes: Arc<Mutex<HashMap<String, TelnetProcess>>>,
}

impl TelnetManager {
    pub fn new() -> Self {
        Self {
            processes: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

pub async fn spawn_telnet(
    app: &AppHandle,
    manager: &TelnetManager,
    tab_id: &str,
    host: &str,
    port: u16,
) -> Result<(), AppError> {
    let mut cmd = Command::new("telnet");
    cmd.arg(host).arg(port.to_string());
    cmd.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let mut child = cmd.spawn()
        .map_err(|e| AppError::Telnet(format!("Failed to start Telnet: {}", e)))?;

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
                    Ok(0) => { let _ = app2.emit(&format!("terminal-status-{}", tid), "disconnected"); break; }
                    Ok(n) => { let _ = app2.emit(&format!("terminal-data-{}", tid), &String::from_utf8_lossy(&buf[..n]).to_string()); }
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
                    Ok(n) => { let _ = app3.emit(&format!("terminal-data-{}", tid), &String::from_utf8_lossy(&buf[..n]).to_string()); }
                    Err(_) => break,
                }
            }
        });
    }

    let _ = app.emit(&format!("terminal-status-{}", tab_id), "connected");
    let mut procs = manager.processes.lock().await;
    procs.insert(tab_id.to_string(), TelnetProcess { stdin, _child: child });
    Ok(())
}

pub async fn write_telnet(manager: &TelnetManager, tab_id: &str, data: &[u8]) -> Result<(), AppError> {
    let mut procs = manager.processes.lock().await;
    if let Some(proc) = procs.get_mut(tab_id) {
        if let Some(stdin) = &mut proc.stdin {
            stdin.write_all(data).await.map_err(|e| AppError::Generic(format!("Write: {}", e)))?;
            stdin.flush().await.map_err(|e| AppError::Generic(format!("Flush: {}", e)))?;
        }
    }
    Ok(())
}

pub async fn close_telnet(manager: &TelnetManager, tab_id: &str) -> Result<(), AppError> {
    let mut procs = manager.processes.lock().await;
    if let Some(mut proc) = procs.remove(tab_id) {
        let _ = proc._child.kill().await;
    }
    Ok(())
}
