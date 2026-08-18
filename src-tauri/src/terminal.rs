// Native SSH terminal backend using ssh2 (libssh2)
// No external processes (ssh.exe, cmd.exe) are launched.
// All SSH protocol handling happens in-process.

use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{TcpStream, ToSocketAddrs};
use std::sync::Arc;
use std::time::{Duration, Instant};
use ssh2::{Channel, Session};
use tokio::sync::Mutex;
use tauri::{AppHandle, Emitter};

use crate::error::AppError;

struct SshConnection {
    session: Session,
    channel: Channel,
}

struct ManagedSshConnection {
    transport: Mutex<SshConnection>,
    operation_lock: Mutex<()>,
}

// Safety: ssh2::Session and Channel are not Send/Sync by default,
// but we wrap them in a Mutex and only access from one task at a time.
unsafe impl Send for SshConnection {}
unsafe impl Sync for SshConnection {}

pub struct NativeSshManager {
    connections: Arc<Mutex<HashMap<String, Arc<ManagedSshConnection>>>>,
}

impl NativeSshManager {
    pub fn new() -> Self {
        Self {
            connections: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

fn open_ssh_session(host: &str, port: u16) -> Result<Session, AppError> {
    let target = format!("{}:{}", host, port);
    let addresses = (host, port)
        .to_socket_addrs()
        .map_err(|e| AppError::Ssh(format!("Address resolution failed for {}: {}", target, e)))?;
    let mut last_error = None;

    for socket_addr in addresses {
        match TcpStream::connect_timeout(&socket_addr, Duration::from_secs(10)) {
            Ok(tcp) => {
                tcp.set_nonblocking(false)
                    .map_err(|e| AppError::Ssh(format!("Socket setup failed for {}: {}", target, e)))?;

                let mut session = Session::new()
                    .map_err(|e| AppError::Ssh(format!("SSH initialization failed: {}", e)))?;
                session.set_timeout(10_000);
                session.set_tcp_stream(tcp);
                session.handshake()
                    .map_err(|e| AppError::Ssh(format!("SSH handshake with {} failed: {}", target, e)))?;
                return Ok(session);
            }
            Err(error) => last_error = Some(error),
        }
    }

    Err(AppError::Ssh(match last_error {
        Some(error) => format!("TCP connection to {} failed: {}", target, error),
        None => format!("Address resolution returned no addresses for {}", target),
    }))
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
    keepalive_secs: u32,
) -> Result<(), AppError> {
    let tab_id_owned = tab_id.to_string();

    let mut session = tokio::task::spawn_blocking({
        let host = host.to_string();
        move || open_ssh_session(&host, port)
    })
    .await
    .map_err(|e| AppError::Ssh(format!("Task error: {}", e)))??;

    // Try authentication methods directly without calling auth_methods()
    // auth_methods() sends a "none" request that some devices count as a
    // failed attempt, exhausting the allowed retry count.
    // Instead, try keyboard-interactive first (most common on network devices),
    // then fall back to password.

    let mut auth_success = false;
    let mut last_error = String::new();

    // Try keyboard-interactive first (most network devices use this)
    if !auth_success && !password.is_empty() {
        struct PasswordResponder { password: String }

        impl ssh2::KeyboardInteractivePrompt for PasswordResponder {
            fn prompt<'a>(
                &mut self,
                _username: &str,
                _instructions: &str,
                prompts: &[ssh2::Prompt<'a>],
            ) -> Vec<String> {
                prompts.iter().map(|_| self.password.clone()).collect()
            }
        }

        let mut responder = PasswordResponder { password: password.to_string() };
        match session.userauth_keyboard_interactive(username, &mut responder) {
            Ok(()) if session.authenticated() => {
                auth_success = true;
                log::info!("SSH keyboard-interactive auth succeeded");
            }
            Ok(()) => {
                last_error = "Keyboard-interactive: server did not confirm authentication".to_string();
            }
            Err(e) => {
                last_error = format!("Keyboard-interactive failed: {}", e);
                log::info!("SSH keyboard-interactive failed: {}", e);
            }
        }
    }

    // A failed method can consume the only permitted authentication attempt on
    // some appliances. Reconnect before trying password so fallback starts with
    // a clean server-side attempt counter.
    if !auth_success && !password.is_empty() {
        session = tokio::task::spawn_blocking({
            let host = host.to_string();
            move || open_ssh_session(&host, port)
        })
        .await
        .map_err(|e| AppError::Ssh(format!("Authentication retry task failed: {}", e)))?
        .map_err(|e| AppError::Ssh(format!("{}; password retry connection failed: {}", last_error, e)))?;

        match session.userauth_password(username, password) {
            Ok(()) if session.authenticated() => {
                auth_success = true;
                log::info!("SSH password auth succeeded");
            }
            Ok(()) => {
                if last_error.is_empty() {
                    last_error = "Password auth: server did not confirm".to_string();
                }
            }
            Err(e) => {
                last_error = if last_error.is_empty() {
                    format!("Password rejected: {}", e)
                } else {
                    format!("{}; password authentication failed: {}", last_error, e)
                };
            }
        }
    }

    if !auth_success {
        let detail = if last_error.is_empty() {
            "Authentication failed".to_string()
        } else {
            last_error
        };
        return Err(AppError::Ssh(detail));
    }

    session.set_keepalive(true, keepalive_secs);

    // Open channel and request PTY + shell
    let mut channel = session.channel_session()
        .map_err(|e| AppError::Ssh(format!("Channel error: {}", e)))?;

    channel.request_pty("xterm-256color", None, Some((80, 24, 0, 0)))
        .map_err(|e| AppError::Ssh(format!("PTY error: {}", e)))?;

    channel.shell()
        .map_err(|e| AppError::Ssh(format!("Shell error: {}", e)))?;

    // Set channel to non-blocking for reading
    session.set_blocking(false);

    let conn = Arc::new(ManagedSshConnection {
        transport: Mutex::new(SshConnection { session, channel }),
        operation_lock: Mutex::new(()),
    });

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
    let connections = manager.connections.clone();
    tokio::spawn(async move {
        let mut buf = [0u8; 4096];
        let mut next_keepalive = keepalive_deadline(keepalive_secs);
        let close_reason = loop {
            tokio::time::sleep(Duration::from_millis(20)).await;

            // Single lock acquisition per iteration — read stdout, stderr, check EOF
            let (result, stderr_data, is_eof, exit_status) = {
                let mut c = conn_reader.transport.lock().await;
                if next_keepalive.is_some_and(|deadline| Instant::now() >= deadline) {
                    match c.session.keepalive_send() {
                        Ok(seconds) => {
                            next_keepalive =
                                Some(Instant::now() + Duration::from_secs(seconds.max(1) as u64));
                        }
                        Err(error) if error.code() == ssh2::ErrorCode::Session(-37) => {
                            next_keepalive = Some(Instant::now() + Duration::from_secs(1));
                        }
                        Err(error) => {
                            log::warn!(
                                "SSH keepalive send failed; connection remains active: {error}"
                            );
                            next_keepalive = keepalive_retry_deadline(keepalive_secs);
                        }
                    }
                }
                let stdout_result = c.channel.read(&mut buf);
                let mut stderr_buf = [0u8; 4096];
                let stderr_n = c.channel.stderr().read(&mut stderr_buf).unwrap_or(0);
                let eof = c.channel.eof();
                let exit_status = if eof { c.channel.exit_status().ok() } else { None };
                (
                    stdout_result,
                    if stderr_n > 0 {
                        Some(String::from_utf8_lossy(&stderr_buf[..stderr_n]).to_string())
                    } else {
                        None
                    },
                    eof,
                    exit_status,
                )
            }; // Lock released here

            // Process stderr
            if let Some(data) = stderr_data {
                let _ = app_clone.emit(&format!("terminal-data-{}", tid), &data);
            }

            match result {
                Ok(0) if is_eof => {
                    break remote_close_reason(exit_status);
                }
                Ok(0) => continue,
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = app_clone.emit(&format!("terminal-data-{}", tid), &data);
                }
                Err(ref error) if is_nonfatal_io_error(error) => {
                    if is_eof {
                        break remote_close_reason(exit_status);
                    }
                }
                Err(error) => {
                    break format!("SSH transport read failed: {error}");
                }
            }
        };

        log::warn!("SSH session {} ended: {}", tid, close_reason);
        {
            let mut active = connections.lock().await;
            if active
                .get(&tid)
                .is_some_and(|current| Arc::ptr_eq(current, &conn_reader))
            {
                active.remove(&tid);
            }
        }
        let _ = app_clone.emit(&format!("terminal-close-detail-{}", tid), &close_reason);
        let _ = app_clone.emit(&format!("terminal-status-{}", tid), "disconnected");
    });

    Ok(())
}

fn keepalive_deadline(keepalive_secs: u32) -> Option<Instant> {
    (keepalive_secs > 0).then(|| Instant::now() + Duration::from_secs(keepalive_secs as u64))
}

fn keepalive_retry_deadline(keepalive_secs: u32) -> Option<Instant> {
    (keepalive_secs > 0).then(|| Instant::now() + Duration::from_secs(keepalive_secs.max(5) as u64))
}

fn remote_close_reason(exit_status: Option<i32>) -> String {
    match exit_status {
        Some(0) | None => "Remote host closed the SSH channel.".to_string(),
        Some(status) => format!("Remote host closed the SSH channel with exit status {status}."),
    }
}

fn is_nonfatal_io_error(error: &std::io::Error) -> bool {
    matches!(
        error.kind(),
        std::io::ErrorKind::WouldBlock
            | std::io::ErrorKind::Interrupted
            | std::io::ErrorKind::TimedOut
    ) || error.to_string().eq_ignore_ascii_case("transport read")
}

#[cfg(test)]
mod tests {
    use super::{
        is_nonfatal_io_error, keepalive_deadline, keepalive_retry_deadline, remote_close_reason,
    };

    #[test]
    fn keepalive_zero_disables_scheduling() {
        assert!(keepalive_deadline(0).is_none());
        assert!(keepalive_deadline(60).is_some());
        assert!(keepalive_retry_deadline(0).is_none());
        assert!(keepalive_retry_deadline(60).is_some());
    }

    #[test]
    fn remote_close_reason_includes_nonzero_exit_status() {
        assert_eq!(remote_close_reason(None), "Remote host closed the SSH channel.");
        assert_eq!(
            remote_close_reason(Some(255)),
            "Remote host closed the SSH channel with exit status 255."
        );
    }

    #[test]
    fn keeps_polling_after_nonfatal_transport_read_errors() {
        assert!(is_nonfatal_io_error(&std::io::Error::from(
            std::io::ErrorKind::WouldBlock,
        )));
        assert!(is_nonfatal_io_error(&std::io::Error::from(
            std::io::ErrorKind::Interrupted,
        )));
        assert!(is_nonfatal_io_error(&std::io::Error::other("transport read")));
        assert!(!is_nonfatal_io_error(&std::io::Error::other("connection reset")));
    }
}

/// Write data from xterm.js to the SSH channel
pub async fn write_ssh(
    manager: &NativeSshManager,
    tab_id: &str,
    data: &[u8],
) -> Result<(), AppError> {
    // Get the connection Arc without holding the outer lock during write
    let conn = {
        let conns = manager.connections.lock().await;
        conns.get(tab_id).cloned()
    };
    if let Some(conn) = conn {
        let _operation_guard = conn.operation_lock.lock().await;
        let deadline = Instant::now() + Duration::from_secs(10);
        let mut written = 0;

        while written < data.len() {
            let result = {
                let mut transport = conn.transport.lock().await;
                transport.channel.write(&data[written..])
            };

            match result {
                Ok(0) if Instant::now() < deadline => {
                    tokio::time::sleep(Duration::from_millis(5)).await;
                }
                Ok(0) => return Err(AppError::Ssh("SSH write timed out".to_string())),
                Ok(count) => written += count,
                Err(ref error) if is_nonfatal_io_error(error) && Instant::now() < deadline => {
                    tokio::time::sleep(Duration::from_millis(5)).await;
                }
                Err(error) => return Err(AppError::Ssh(format!("Write error: {error}"))),
            }
        }

        loop {
            let result = {
                let mut transport = conn.transport.lock().await;
                transport.channel.flush()
            };
            match result {
                Ok(()) => break,
                Err(ref error) if is_nonfatal_io_error(error) && Instant::now() < deadline => {
                    tokio::time::sleep(Duration::from_millis(5)).await;
                }
                Err(error) => return Err(AppError::Ssh(format!("Flush error: {error}"))),
            }
        }
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
    let conn = {
        let conns = manager.connections.lock().await;
        conns.get(tab_id).cloned()
    };
    if let Some(conn) = conn {
        let _operation_guard = conn.operation_lock.lock().await;
        let deadline = Instant::now() + Duration::from_secs(2);
        loop {
            let result = {
                let mut transport = conn.transport.lock().await;
                transport.channel.request_pty_size(cols, rows, None, None)
            };
            match result {
                Ok(()) => break,
                Err(ref error)
                    if error.code() == ssh2::ErrorCode::Session(-37)
                        && Instant::now() < deadline =>
                {
                    tokio::time::sleep(Duration::from_millis(5)).await;
                }
                Err(error) => return Err(AppError::Ssh(format!("Resize error: {error}"))),
            }
        }
    }
    Ok(())
}

/// Close an SSH connection
pub async fn close_ssh(
    manager: &NativeSshManager,
    tab_id: &str,
) -> Result<(), AppError> {
    let conn = {
        let mut conns = manager.connections.lock().await;
        conns.remove(tab_id)
    };
    if let Some(conn) = conn {
        let _operation_guard = conn.operation_lock.lock().await;
        let deadline = Instant::now() + Duration::from_secs(2);
        loop {
            let result = {
                let mut transport = conn.transport.lock().await;
                transport.channel.close()
            };
            match result {
                Ok(()) => break,
                Err(ref error)
                    if error.code() == ssh2::ErrorCode::Session(-37)
                        && Instant::now() < deadline =>
                {
                    tokio::time::sleep(Duration::from_millis(5)).await;
                }
                Err(error) => {
                    log::warn!("SSH channel close failed for {tab_id}: {error}");
                    break;
                }
            }
        }
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
