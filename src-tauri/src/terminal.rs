// Native SSH terminal backend using ssh2 (libssh2)
// No external processes (ssh.exe, cmd.exe) are launched.
// All SSH protocol handling happens in-process.

use ssh2::{Channel, Session, Sftp};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{Ipv4Addr, SocketAddr, TcpListener, TcpStream, ToSocketAddrs};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::sync::Mutex as StdMutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;

use crate::commands::known_hosts::HostKeyVerification;
use crate::commands::terminal_logging::TerminalLogManager;
use crate::db::Database;
use crate::error::AppError;
use crate::protocols::serial::{SerialConfig, SerialSession};

struct SshConnection {
    session: Session,
    channel: Channel,
    _jump_bridges: Vec<JumpBridge>,
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

pub enum SshAuthentication {
    Password(String),
    PrivateKey {
        key_path: PathBuf,
        passphrase: Option<String>,
    },
    Agent,
}

pub struct JumpHostConfig {
    pub name: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub authentication: SshAuthentication,
}

pub struct SshConnectConfig {
    pub tab_id: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub authentication: SshAuthentication,
    pub jump_hosts: Vec<JumpHostConfig>,
    pub keepalive_secs: u32,
}

type TrustedHostKeys = HashMap<(String, u16), (String, String)>;

pub struct RouteHostKeyInspection {
    pub host: String,
    pub address: String,
    pub port: u16,
    pub key_type: String,
    pub fingerprint: String,
    pub verification: HostKeyVerification,
}

struct JumpBridge {
    address: SocketAddr,
    shutdown: Arc<AtomicBool>,
    worker: Option<std::thread::JoinHandle<()>>,
}

impl Drop for JumpBridge {
    fn drop(&mut self) {
        self.shutdown.store(true, Ordering::Release);
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}

struct JumpTransport {
    session: Session,
    channel: Channel,
}

// Safety: the bridge thread exclusively owns the libssh2 session and channel.
unsafe impl Send for JumpTransport {}

impl NativeSshManager {
    pub fn new() -> Self {
        Self {
            connections: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

pub(crate) fn open_ssh_session(host: &str, port: u16) -> Result<(Session, SocketAddr), AppError> {
    let target = format!("{}:{}", host, port);
    let addresses = (host, port)
        .to_socket_addrs()
        .map_err(|e| AppError::Ssh(format!("Address resolution failed for {}: {}", target, e)))?;
    let mut last_error = None;

    for socket_addr in addresses {
        match TcpStream::connect_timeout(&socket_addr, Duration::from_secs(10)) {
            Ok(tcp) => {
                tcp.set_nonblocking(false).map_err(|e| {
                    AppError::Ssh(format!("Socket setup failed for {}: {}", target, e))
                })?;

                let session = open_ssh_session_on_stream(tcp, &target)?;
                return Ok((session, socket_addr));
            }
            Err(error) => last_error = Some(error),
        }
    }

    Err(AppError::Ssh(match last_error {
        Some(error) => format!("TCP connection to {} failed: {}", target, error),
        None => format!("Address resolution returned no addresses for {}", target),
    }))
}

fn open_ssh_session_on_stream(tcp: TcpStream, target: &str) -> Result<Session, AppError> {
    tcp.set_nonblocking(false)
        .map_err(|error| AppError::Ssh(format!("Socket setup failed for {target}: {error}")))?;
    let mut session = Session::new()
        .map_err(|error| AppError::Ssh(format!("SSH initialization failed: {error}")))?;
    session.set_timeout(10_000);
    session.set_tcp_stream(tcp);
    session
        .handshake()
        .map_err(|error| AppError::Ssh(format!("SSH handshake with {target} failed: {error}")))?;
    Ok(session)
}

fn start_jump_bridge(
    session: Session,
    next_host: &str,
    next_port: u16,
) -> Result<JumpBridge, AppError> {
    let channel = session
        .channel_direct_tcpip(next_host, next_port, Some(("127.0.0.1", 0)))
        .map_err(|error| {
            AppError::Ssh(format!(
                "Jump-host forwarding to {next_host}:{next_port} failed: {error}"
            ))
        })?;
    let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0))
        .map_err(|error| AppError::Ssh(format!("Jump-host bridge setup failed: {error}")))?;
    let address = listener
        .local_addr()
        .map_err(|error| AppError::Ssh(format!("Jump-host bridge address failed: {error}")))?;
    listener
        .set_nonblocking(true)
        .map_err(|error| AppError::Ssh(format!("Jump-host bridge setup failed: {error}")))?;
    let shutdown = Arc::new(AtomicBool::new(false));
    let worker_shutdown = shutdown.clone();
    let transport = JumpTransport { session, channel };

    let worker = std::thread::Builder::new()
        .name("sessiondock-proxyjump".into())
        .spawn(move || run_jump_bridge(listener, transport, worker_shutdown))
        .map_err(|error| AppError::Ssh(format!("Jump-host bridge task failed: {error}")))?;

    Ok(JumpBridge {
        address,
        shutdown,
        worker: Some(worker),
    })
}

fn run_jump_bridge(listener: TcpListener, transport: JumpTransport, shutdown: Arc<AtomicBool>) {
    let socket = loop {
        match listener.accept() {
            Ok((socket, _)) => break socket,
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                if shutdown.load(Ordering::Acquire) {
                    return;
                }
                std::thread::sleep(Duration::from_millis(2));
            }
            Err(_) => return,
        }
    };
    let JumpTransport { session, channel } = transport;
    bridge_ssh_channel(socket, session, channel, shutdown);
}

pub(crate) fn bridge_ssh_channel(
    mut socket: TcpStream,
    session: Session,
    mut channel: Channel,
    shutdown: Arc<AtomicBool>,
) {
    if socket.set_nonblocking(true).is_err() {
        return;
    }
    session.set_blocking(false);
    let mut from_socket = Vec::new();
    let mut from_channel = Vec::new();
    let mut buffer = [0u8; 16 * 1024];

    while !shutdown.load(Ordering::Acquire) {
        let mut progressed = false;

        if from_socket.is_empty() {
            match socket.read(&mut buffer) {
                Ok(0) => break,
                Ok(count) => {
                    from_socket.extend_from_slice(&buffer[..count]);
                    progressed = true;
                }
                Err(error) if is_nonfatal_io_error(&error) => {}
                Err(_) => break,
            }
        }
        if !from_socket.is_empty() {
            match channel.write(&from_socket) {
                Ok(0) => {}
                Ok(count) => {
                    from_socket.drain(..count);
                    progressed = true;
                }
                Err(error) if is_nonfatal_io_error(&error) => {}
                Err(_) => break,
            }
        }

        if from_channel.is_empty() {
            match channel.read(&mut buffer) {
                Ok(0) if channel.eof() => break,
                Ok(0) => {}
                Ok(count) => {
                    from_channel.extend_from_slice(&buffer[..count]);
                    progressed = true;
                }
                Err(error) if is_nonfatal_io_error(&error) => {}
                Err(_) => break,
            }
        }
        if !from_channel.is_empty() {
            match socket.write(&from_channel) {
                Ok(0) => {}
                Ok(count) => {
                    from_channel.drain(..count);
                    progressed = true;
                }
                Err(error) if is_nonfatal_io_error(&error) => {}
                Err(_) => break,
            }
        }

        if !progressed {
            std::thread::sleep(Duration::from_millis(2));
        }
    }

    let _ = channel.close();
}

fn open_ssh_session_through_bridge(
    bridge: &JumpBridge,
    target_host: &str,
    target_port: u16,
) -> Result<Session, AppError> {
    let tcp =
        TcpStream::connect_timeout(&bridge.address, Duration::from_secs(10)).map_err(|error| {
            AppError::Ssh(format!(
                "Jump-host bridge connection for {target_host}:{target_port} failed: {error}"
            ))
        })?;
    open_ssh_session_on_stream(tcp, &format!("{target_host}:{target_port}"))
}

/// Connect to an SSH server using password authentication.
/// Returns immediately after shell is opened.
/// Spawns a background task to stream output to the frontend.
pub async fn connect_ssh(
    app: &AppHandle,
    manager: &NativeSshManager,
    log_manager: &TerminalLogManager,
    db: &Database,
    config: SshConnectConfig,
) -> Result<(), AppError> {
    let SshConnectConfig {
        tab_id,
        host,
        port,
        username,
        authentication,
        jump_hosts,
        keepalive_secs,
    } = config;
    let trusted_host_keys = load_trusted_host_keys(db, &host, port, &jump_hosts)?;

    let (session, jump_bridges) = tokio::task::spawn_blocking({
        let host = host.clone();
        let username = username.clone();
        move || {
            open_ssh_route(
                &host,
                port,
                &username,
                authentication,
                jump_hosts,
                &trusted_host_keys,
            )
        }
    })
    .await
    .map_err(|e| AppError::Ssh(format!("Task error: {}", e)))??;

    session.set_keepalive(true, keepalive_secs);

    // Open channel and request PTY + shell
    let mut channel = session
        .channel_session()
        .map_err(|e| AppError::Ssh(format!("Channel error: {}", e)))?;

    channel
        .request_pty("xterm-256color", None, Some((80, 24, 0, 0)))
        .map_err(|e| AppError::Ssh(format!("PTY error: {}", e)))?;

    channel
        .shell()
        .map_err(|e| AppError::Ssh(format!("Shell error: {}", e)))?;

    // Set channel to non-blocking for reading
    session.set_blocking(false);

    let conn = Arc::new(ManagedSshConnection {
        transport: Mutex::new(SshConnection {
            session,
            channel,
            _jump_bridges: jump_bridges,
        }),
        operation_lock: Mutex::new(()),
    });

    // Store connection
    {
        let mut conns = manager.connections.lock().await;
        conns.insert(tab_id.clone(), conn.clone());
    }

    // Emit connected status
    let _ = app.emit(&format!("terminal-status-{}", tab_id), "connected");

    // Spawn background reader task
    let app_clone = app.clone();
    let tid = tab_id.clone();
    let conn_reader = conn.clone();
    let connections = manager.connections.clone();
    let output_log_manager = log_manager.clone();
    tokio::spawn(async move {
        let mut buf = [0u8; 4096];
        let mut next_keepalive = keepalive_deadline(keepalive_secs);
        let close_reason = loop {
            tokio::time::sleep(Duration::from_millis(20)).await;

            // Single lock acquisition per iteration — read stdout, stderr, check EOF
            let _operation_guard = conn_reader.operation_lock.lock().await;
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
                let exit_status = if eof {
                    c.channel.exit_status().ok()
                } else {
                    None
                };
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
                if let Err(error) = output_log_manager.append(&tid, data.as_bytes()).await {
                    log::warn!("Terminal log write failed for pane {tid}: {error}");
                }
                let _ = app_clone.emit(&format!("terminal-data-{}", tid), &data);
            }

            match result {
                Ok(0) if is_eof => {
                    break remote_close_reason(exit_status);
                }
                Ok(0) => continue,
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    if let Err(error) = output_log_manager.append(&tid, data.as_bytes()).await {
                        log::warn!("Terminal log write failed for pane {tid}: {error}");
                    }
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

fn open_ssh_route(
    target_host: &str,
    target_port: u16,
    target_username: &str,
    target_authentication: SshAuthentication,
    jump_hosts: Vec<JumpHostConfig>,
    trusted_host_keys: &TrustedHostKeys,
) -> Result<(Session, Vec<JumpBridge>), AppError> {
    if jump_hosts.is_empty() {
        let (mut session, _) = open_ssh_session(target_host, target_port)?;
        enforce_trusted_host_key(&session, trusted_host_keys, target_host, target_port)?;
        authenticate_ssh(&mut session, target_username, target_authentication)?;
        return Ok((session, Vec::new()));
    }

    let mut bridges = Vec::with_capacity(jump_hosts.len());
    let mut jump_hosts = jump_hosts.into_iter();
    let first = jump_hosts
        .next()
        .expect("jump host route checked as non-empty");
    let (mut current_session, _) = open_ssh_session(&first.host, first.port)
        .map_err(|error| jump_stage_error(&first.name, "TCP", error))?;
    enforce_trusted_host_key(&current_session, trusted_host_keys, &first.host, first.port)
        .map_err(|error| jump_stage_error(&first.name, "HOST_KEY", error))?;
    authenticate_ssh(&mut current_session, &first.username, first.authentication)
        .map_err(|error| jump_stage_error(&first.name, "AUTHENTICATION", error))?;

    for next in jump_hosts {
        let bridge = start_jump_bridge(current_session, &next.host, next.port)
            .map_err(|error| jump_stage_error(&next.name, "FORWARD", error))?;
        let mut next_session = open_ssh_session_through_bridge(&bridge, &next.host, next.port)
            .map_err(|error| jump_stage_error(&next.name, "SSH_HANDSHAKE", error))?;
        enforce_trusted_host_key(&next_session, trusted_host_keys, &next.host, next.port)
            .map_err(|error| jump_stage_error(&next.name, "HOST_KEY", error))?;
        authenticate_ssh(&mut next_session, &next.username, next.authentication)
            .map_err(|error| jump_stage_error(&next.name, "AUTHENTICATION", error))?;
        bridges.push(bridge);
        current_session = next_session;
    }

    let bridge = start_jump_bridge(current_session, target_host, target_port)
        .map_err(|error| jump_stage_error(target_host, "FORWARD", error))?;
    let mut target_session = open_ssh_session_through_bridge(&bridge, target_host, target_port)?;
    enforce_trusted_host_key(&target_session, trusted_host_keys, target_host, target_port)?;
    authenticate_ssh(&mut target_session, target_username, target_authentication)?;
    bridges.push(bridge);
    Ok((target_session, bridges))
}

pub async fn inspect_ssh_route(
    db: &Database,
    target_host: String,
    target_port: u16,
    jump_hosts: Vec<JumpHostConfig>,
) -> Result<RouteHostKeyInspection, AppError> {
    let known_host_keys = load_known_host_keys(db, &target_host, target_port, &jump_hosts)?;
    tokio::task::spawn_blocking(move || {
        inspect_ssh_route_blocking(target_host, target_port, jump_hosts, known_host_keys)
    })
    .await
    .map_err(|error| AppError::Ssh(format!("Host-key inspection task failed: {error}")))?
}

fn inspect_ssh_route_blocking(
    target_host: String,
    target_port: u16,
    jump_hosts: Vec<JumpHostConfig>,
    known_host_keys: TrustedHostKeys,
) -> Result<RouteHostKeyInspection, AppError> {
    if jump_hosts.is_empty() {
        let (session, address) = open_ssh_session(&target_host, target_port)?;
        return inspect_session_host_key(
            &session,
            &known_host_keys,
            target_host,
            target_port,
            address.ip().to_string(),
        );
    }

    let mut bridges = Vec::with_capacity(jump_hosts.len());
    let mut jump_hosts = jump_hosts.into_iter();
    let first = jump_hosts
        .next()
        .expect("jump host route checked as non-empty");
    let (mut current_session, address) = open_ssh_session(&first.host, first.port)
        .map_err(|error| jump_stage_error(&first.name, "TCP", error))?;
    let inspection = inspect_session_host_key(
        &current_session,
        &known_host_keys,
        first.host.clone(),
        first.port,
        address.ip().to_string(),
    )?;
    if !matches!(inspection.verification, HostKeyVerification::Trusted) {
        return Ok(inspection);
    }
    authenticate_ssh(&mut current_session, &first.username, first.authentication)
        .map_err(|error| jump_stage_error(&first.name, "AUTHENTICATION", error))?;
    let mut previous_name = first.name;

    for next in jump_hosts {
        let bridge = start_jump_bridge(current_session, &next.host, next.port)
            .map_err(|error| jump_stage_error(&next.name, "FORWARD", error))?;
        let mut next_session = open_ssh_session_through_bridge(&bridge, &next.host, next.port)
            .map_err(|error| jump_stage_error(&next.name, "SSH_HANDSHAKE", error))?;
        let inspection = inspect_session_host_key(
            &next_session,
            &known_host_keys,
            next.host.clone(),
            next.port,
            format!("via {previous_name}"),
        )?;
        if !matches!(inspection.verification, HostKeyVerification::Trusted) {
            return Ok(inspection);
        }
        authenticate_ssh(&mut next_session, &next.username, next.authentication)
            .map_err(|error| jump_stage_error(&next.name, "AUTHENTICATION", error))?;
        bridges.push(bridge);
        current_session = next_session;
        previous_name = next.name;
    }

    let bridge = start_jump_bridge(current_session, &target_host, target_port)
        .map_err(|error| jump_stage_error(&target_host, "FORWARD", error))?;
    let target_session = open_ssh_session_through_bridge(&bridge, &target_host, target_port)?;
    bridges.push(bridge);
    inspect_session_host_key(
        &target_session,
        &known_host_keys,
        target_host,
        target_port,
        format!("via {previous_name}"),
    )
}

fn inspect_session_host_key(
    session: &Session,
    known_host_keys: &TrustedHostKeys,
    host: String,
    port: u16,
    address: String,
) -> Result<RouteHostKeyInspection, AppError> {
    let (key_type, fingerprint) = ssh_host_key_details(session)?;
    let verification = match known_host_keys.get(&(host.clone(), port)) {
        Some((old_key_type, old_fingerprint))
            if old_key_type == &key_type && old_fingerprint == &fingerprint =>
        {
            HostKeyVerification::Trusted
        }
        Some((old_key_type, old_fingerprint)) => HostKeyVerification::Changed {
            old_fingerprint: old_fingerprint.clone(),
            old_key_type: old_key_type.clone(),
            new_fingerprint: fingerprint.clone(),
            new_key_type: key_type.clone(),
        },
        None => HostKeyVerification::Unknown {
            fingerprint: fingerprint.clone(),
            key_type: key_type.clone(),
        },
    };
    Ok(RouteHostKeyInspection {
        host,
        address,
        port,
        key_type,
        fingerprint,
        verification,
    })
}

fn jump_stage_error(name: &str, stage: &str, error: AppError) -> AppError {
    AppError::Ssh(format!(
        "Jump host '{name}' failed at stage {stage}: {error}"
    ))
}

fn ecdsa_public_key_path(private_key_path: &Path) -> Option<PathBuf> {
    const MAX_PUBLIC_KEY_BYTES: u64 = 16 * 1024;

    let mut public_key_path = private_key_path.as_os_str().to_os_string();
    public_key_path.push(".pub");
    let public_key_path = PathBuf::from(public_key_path);
    let metadata = std::fs::metadata(&public_key_path).ok()?;
    if !metadata.is_file() || metadata.len() > MAX_PUBLIC_KEY_BYTES {
        return None;
    }
    let public_key = std::fs::read_to_string(&public_key_path).ok()?;
    public_key
        .split_whitespace()
        .next()
        .is_some_and(|algorithm| algorithm.starts_with("ecdsa-sha2-"))
        .then_some(public_key_path)
}

fn authenticate_ssh(
    session: &mut Session,
    username: &str,
    authentication: SshAuthentication,
) -> Result<(), AppError> {
    match authentication {
        SshAuthentication::Password(password) => {
            struct PasswordResponder {
                password: String,
            }

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

            let mut responder = PasswordResponder {
                password: password.clone(),
            };
            let keyboard_error = match session
                .userauth_keyboard_interactive(username, &mut responder)
            {
                Ok(()) if session.authenticated() => return Ok(()),
                Ok(()) => "server did not confirm keyboard-interactive authentication".to_string(),
                Err(error) => format!("keyboard-interactive rejected: {error}"),
            };

            session
                .userauth_password(username, &password)
                .map_err(|_| {
                    AppError::Ssh(format!(
                        "Authentication stage failed: {keyboard_error}; password rejected"
                    ))
                })?;
        }
        SshAuthentication::PrivateKey {
            key_path,
            passphrase,
        } => {
            let public_key_path = ecdsa_public_key_path(&key_path);
            session
                .userauth_pubkey_file(
                    username,
                    public_key_path.as_deref(),
                    &key_path,
                    passphrase.as_deref(),
                )
                .map_err(|_| {
                    AppError::Ssh(
                        "Authentication stage failed: private key was rejected; verify the key format and passphrase"
                            .into(),
                    )
                })?;
        }
        SshAuthentication::Agent => {
            let mut agent = session.agent().map_err(|_| {
                AppError::Ssh("Authentication stage failed: SSH agent is unavailable".into())
            })?;
            agent.connect().map_err(|_| {
                AppError::Ssh("Authentication stage failed: could not connect to SSH agent".into())
            })?;
            agent.list_identities().map_err(|_| {
                AppError::Ssh(
                    "Authentication stage failed: could not list SSH agent identities".into(),
                )
            })?;

            let identities = agent.identities().map_err(|_| {
                AppError::Ssh(
                    "Authentication stage failed: could not read SSH agent identities".into(),
                )
            })?;
            let mut authenticated = false;
            for identity in identities {
                if agent.userauth(username, &identity).is_ok() && session.authenticated() {
                    authenticated = true;
                    break;
                }
            }
            let _ = agent.disconnect();
            if !authenticated {
                return Err(AppError::Ssh(
                    "Authentication stage failed: SSH agent offered no accepted identity".into(),
                ));
            }
        }
    }

    if session.authenticated() {
        Ok(())
    } else {
        Err(AppError::Ssh(
            "Authentication stage failed: server did not confirm authentication".into(),
        ))
    }
}

pub(crate) fn ssh_host_key_details(session: &Session) -> Result<(String, String), AppError> {
    let (_, key_type) = session.host_key().ok_or_else(|| {
        AppError::Ssh("Host-key stage failed: server did not provide a host key".into())
    })?;
    let hash = session
        .host_key_hash(ssh2::HashType::Sha256)
        .ok_or_else(|| {
            AppError::Ssh("Host-key stage failed: SHA-256 fingerprint is unavailable".into())
        })?;
    let fingerprint = hash
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<Vec<_>>()
        .join(":");
    Ok((format!("{key_type:?}"), format!("SHA256:{fingerprint}")))
}

fn load_trusted_host_keys(
    db: &Database,
    target_host: &str,
    target_port: u16,
    jump_hosts: &[JumpHostConfig],
) -> Result<TrustedHostKeys, AppError> {
    let trusted = load_known_host_keys(db, target_host, target_port, jump_hosts)?;
    for jump in jump_hosts {
        if !trusted.contains_key(&(jump.host.clone(), jump.port)) {
            return Err(AppError::Ssh(format!(
                "Host-key stage failed: {}:{} has not been trusted",
                jump.host, jump.port
            )));
        }
    }
    if !trusted.contains_key(&(target_host.to_string(), target_port)) {
        return Err(AppError::Ssh(format!(
            "Host-key stage failed: {target_host}:{target_port} has not been trusted"
        )));
    }
    Ok(trusted)
}

fn load_known_host_keys(
    db: &Database,
    target_host: &str,
    target_port: u16,
    jump_hosts: &[JumpHostConfig],
) -> Result<TrustedHostKeys, AppError> {
    let mut endpoints = jump_hosts
        .iter()
        .map(|jump| (jump.host.as_str(), jump.port))
        .collect::<Vec<_>>();
    endpoints.push((target_host, target_port));

    let conn = db.conn();
    let mut trusted = TrustedHostKeys::with_capacity(endpoints.len());
    for (host, port) in endpoints {
        let expected = match conn.query_row(
            "SELECT key_type, fingerprint FROM known_hosts WHERE host = ?1 AND port = ?2",
            rusqlite::params![host, port],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        ) {
            Ok(value) => value,
            Err(rusqlite::Error::QueryReturnedNoRows) => continue,
            Err(error) => return Err(AppError::Database(error)),
        };
        trusted.insert((host.to_string(), port), expected);
    }
    Ok(trusted)
}

fn enforce_trusted_host_key(
    session: &Session,
    trusted_host_keys: &TrustedHostKeys,
    host: &str,
    port: u16,
) -> Result<(), AppError> {
    let (key_type, fingerprint) = ssh_host_key_details(session)?;
    match trusted_host_keys.get(&(host.to_string(), port)) {
        Some((expected_type, expected_fingerprint))
            if expected_type == &key_type && expected_fingerprint == &fingerprint =>
        {
            Ok(())
        }
        Some(_) => Err(AppError::Ssh(
            "Host-key stage failed: the server key changed; connection blocked".into(),
        )),
        None => Err(AppError::Ssh(
            "Host-key stage failed: the server key has not been trusted".into(),
        )),
    }
}

pub fn validate_private_key_path(value: &str) -> Result<PathBuf, AppError> {
    let trimmed = value.trim();
    if trimmed.is_empty() || trimmed.len() > 4096 || trimmed.contains('\0') {
        return Err(AppError::Validation(
            "A valid private key path is required".into(),
        ));
    }

    let path = Path::new(trimmed);
    if !path.is_absolute() {
        return Err(AppError::Validation(
            "Private key path must be absolute".into(),
        ));
    }
    if !path.is_file() {
        return Err(AppError::Validation(
            "Configured private key file is unavailable".into(),
        ));
    }
    Ok(path.to_path_buf())
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
        ecdsa_public_key_path, is_nonfatal_io_error, keepalive_deadline, keepalive_retry_deadline,
        remote_close_reason, validate_private_key_path,
    };
    use std::path::PathBuf;

    #[test]
    fn keepalive_zero_disables_scheduling() {
        assert!(keepalive_deadline(0).is_none());
        assert!(keepalive_deadline(60).is_some());
        assert!(keepalive_retry_deadline(0).is_none());
        assert!(keepalive_retry_deadline(60).is_some());
    }

    #[test]
    fn remote_close_reason_includes_nonzero_exit_status() {
        assert_eq!(
            remote_close_reason(None),
            "Remote host closed the SSH channel."
        );
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
        assert!(is_nonfatal_io_error(&std::io::Error::other(
            "transport read"
        )));
        assert!(!is_nonfatal_io_error(&std::io::Error::other(
            "connection reset"
        )));
    }

    #[test]
    fn validates_private_key_paths_without_reading_key_material() {
        let path = std::env::temp_dir().join(format!("sessiondock-key-{}", uuid::Uuid::new_v4()));
        std::fs::write(&path, "test fixture").unwrap();

        assert_eq!(
            validate_private_key_path(path.to_str().unwrap()).unwrap(),
            path
        );
        assert!(validate_private_key_path("").is_err());
        assert!(validate_private_key_path("relative-key").is_err());
        assert!(validate_private_key_path(std::env::temp_dir().to_str().unwrap()).is_err());

        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn selects_only_bounded_ecdsa_public_keys_for_file_authentication() {
        let private_key =
            std::env::temp_dir().join(format!("sessiondock-key-{}", uuid::Uuid::new_v4()));
        let mut public_key = private_key.as_os_str().to_os_string();
        public_key.push(".pub");
        let public_key = PathBuf::from(public_key);

        std::fs::write(&public_key, "ssh-rsa AAAA fixture").unwrap();
        assert_eq!(ecdsa_public_key_path(&private_key), None);

        std::fs::write(&public_key, "ecdsa-sha2-nistp256 AAAA fixture").unwrap();
        assert_eq!(
            ecdsa_public_key_path(&private_key),
            Some(public_key.clone())
        );

        std::fs::write(&public_key, vec![b'x'; 16 * 1024 + 1]).unwrap();
        assert_eq!(ecdsa_public_key_path(&private_key), None);

        std::fs::remove_file(public_key).unwrap();
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
        let result = {
            let mut transport = conn.transport.lock().await;
            transport.channel.request_pty_size(cols, rows, None, None)
        };
        if let Err(error) = result {
            return Err(AppError::Ssh(format!("Resize error: {error}")));
        }
    }
    Ok(())
}

pub(crate) async fn authenticated_ssh_session(
    manager: &NativeSshManager,
    tab_id: &str,
) -> Result<Session, AppError> {
    let connection = {
        let connections = manager.connections.lock().await;
        connections.get(tab_id).cloned()
    }
    .ok_or_else(|| AppError::Ssh("SSH connection is not available".to_string()))?;

    let _operation_guard = connection.operation_lock.lock().await;
    let session = {
        let transport = connection.transport.lock().await;
        transport.session.clone()
    };
    Ok(session)
}

pub async fn open_sftp(manager: &NativeSshManager, tab_id: &str) -> Result<Sftp, AppError> {
    let session = authenticated_ssh_session(manager, tab_id).await?;
    let deadline = Instant::now() + Duration::from_secs(10);

    loop {
        match session.sftp() {
            Ok(sftp) => return Ok(sftp),
            Err(error)
                if error.code() == ssh2::ErrorCode::Session(-37) && Instant::now() < deadline =>
            {
                tokio::time::sleep(Duration::from_millis(5)).await;
            }
            Err(error) => {
                return Err(AppError::Ssh(format!(
                    "Unable to initialize the SFTP subsystem: {error}"
                )))
            }
        }
    }
}

/// Close an SSH connection
pub async fn close_ssh(manager: &NativeSshManager, tab_id: &str) -> Result<(), AppError> {
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

#[cfg(test)]
mod ssh_live_tests {
    use super::{
        authenticate_ssh, authenticated_ssh_session, close_ssh, enforce_trusted_host_key,
        is_nonfatal_io_error, open_sftp, open_ssh_route, open_ssh_session, resize_ssh, write_ssh,
        JumpHostConfig, ManagedSshConnection, NativeSshManager, SshAuthentication, SshConnection,
        TrustedHostKeys,
    };
    use crate::commands::scp::live_smoke_scp;
    use crate::commands::sftp::live_smoke_sftp;
    use crate::commands::tunnels::live_smoke_tunnels;
    use std::collections::HashMap;
    use std::io::Read;
    use std::path::PathBuf;
    use std::sync::Arc;
    use std::time::Duration;
    use tokio::sync::Mutex;

    fn fixture_value(name: &str) -> String {
        std::env::var(name).unwrap_or_else(|_| panic!("Missing live fixture value: {name}"))
    }

    #[test]
    #[ignore = "requires scripts/ssh_integration_fixture.py --rust-smoke"]
    fn live_direct_ssh_handshake_against_fixture() {
        let host = fixture_value("SESSIONDOCK_SSH_FIXTURE_HOST");
        assert_eq!(host, "127.0.0.1", "live fixture must be loopback-only");
        let target_port = fixture_value("SESSIONDOCK_SSH_FIXTURE_TARGET_PORT")
            .parse::<u16>()
            .expect("fixture target port must be valid");
        let trusted_keys = HashMap::from([(
            (host.clone(), target_port),
            (
                fixture_value("SESSIONDOCK_SSH_FIXTURE_KEY_TYPE"),
                fixture_value("SESSIONDOCK_SSH_FIXTURE_FINGERPRINT"),
            ),
        )]);

        let (session, _) =
            open_ssh_session(&host, target_port).expect("direct SSH handshake should complete");
        eprintln!(
            "live SSH smoke: negotiated KEX {}",
            session.methods(ssh2::MethodType::Kex).unwrap_or("unknown")
        );
        enforce_trusted_host_key(&session, &trusted_keys, &host, target_port)
            .expect("direct SSH host key should be trusted");
        session
            .disconnect(None, "fixture handshake complete", None)
            .expect("direct SSH session should disconnect cleanly");
    }

    #[test]
    #[ignore = "requires scripts/ssh_integration_fixture.py --rust-smoke"]
    fn live_direct_ssh_auth_against_fixture() {
        let host = fixture_value("SESSIONDOCK_SSH_FIXTURE_HOST");
        let target_port = fixture_value("SESSIONDOCK_SSH_FIXTURE_TARGET_PORT")
            .parse::<u16>()
            .expect("fixture target port must be valid");
        let username = fixture_value("SESSIONDOCK_SSH_FIXTURE_USERNAME");
        let key_path = PathBuf::from(fixture_value("SESSIONDOCK_SSH_FIXTURE_CLIENT_KEY"));
        let trusted_keys = HashMap::from([(
            (host.clone(), target_port),
            (
                fixture_value("SESSIONDOCK_SSH_FIXTURE_KEY_TYPE"),
                fixture_value("SESSIONDOCK_SSH_FIXTURE_FINGERPRINT"),
            ),
        )]);

        let (mut session, _) =
            open_ssh_session(&host, target_port).expect("direct SSH handshake should complete");
        eprintln!(
            "live SSH smoke: negotiated KEX {}",
            session.methods(ssh2::MethodType::Kex).unwrap_or("unknown")
        );
        enforce_trusted_host_key(&session, &trusted_keys, &host, target_port)
            .expect("direct SSH host key should be trusted");
        authenticate_ssh(
            &mut session,
            &username,
            SshAuthentication::PrivateKey {
                key_path,
                passphrase: None,
            },
        )
        .expect("direct SSH private-key authentication should complete");
        assert!(session.authenticated());
        session
            .disconnect(None, "fixture authentication complete", None)
            .expect("authenticated SSH session should disconnect cleanly");
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    #[ignore = "requires scripts/ssh_integration_fixture.py --rust-smoke"]
    async fn live_ssh_sftp_and_tunnels_against_fixture() {
        const TAB_ID: &str = "live-ssh-smoke";

        let host = fixture_value("SESSIONDOCK_SSH_FIXTURE_HOST");
        assert_eq!(host, "127.0.0.1", "live fixture must be loopback-only");
        let target_port = fixture_value("SESSIONDOCK_SSH_FIXTURE_TARGET_PORT")
            .parse::<u16>()
            .expect("fixture target port must be valid");
        let jump_port = fixture_value("SESSIONDOCK_SSH_FIXTURE_JUMP_PORT")
            .parse::<u16>()
            .expect("fixture jump port must be valid");
        let echo_port = fixture_value("SESSIONDOCK_SSH_FIXTURE_ECHO_PORT")
            .parse::<u16>()
            .expect("fixture echo port must be valid");
        let username = fixture_value("SESSIONDOCK_SSH_FIXTURE_USERNAME");
        let key_path = PathBuf::from(fixture_value("SESSIONDOCK_SSH_FIXTURE_CLIENT_KEY"));
        let key_type = fixture_value("SESSIONDOCK_SSH_FIXTURE_KEY_TYPE");
        let fingerprint = fixture_value("SESSIONDOCK_SSH_FIXTURE_FINGERPRINT");
        let trusted_keys: TrustedHostKeys = HashMap::from([
            (
                (host.clone(), jump_port),
                (key_type.clone(), fingerprint.clone()),
            ),
            ((host.clone(), target_port), (key_type, fingerprint)),
        ]);

        let route_host = host.clone();
        let route_username = username.clone();
        let route_key = key_path.clone();
        let (session, jump_bridges) = tokio::task::spawn_blocking(move || {
            open_ssh_route(
                &route_host,
                target_port,
                &route_username,
                SshAuthentication::PrivateKey {
                    key_path: route_key.clone(),
                    passphrase: None,
                },
                vec![JumpHostConfig {
                    name: "fixture-jump".to_string(),
                    host: route_host.clone(),
                    port: jump_port,
                    username: route_username.clone(),
                    authentication: SshAuthentication::PrivateKey {
                        key_path: route_key,
                        passphrase: None,
                    },
                }],
                &trusted_keys,
            )
        })
        .await
        .expect("live SSH route task should complete")
        .expect("live SSH route should connect");
        eprintln!("live SSH smoke: route connected");

        let mut command = session
            .channel_session()
            .expect("live SSH command channel should open");
        command
            .exec("fixture-info")
            .expect("fixture command should execute");
        let mut output = String::new();
        command
            .read_to_string(&mut output)
            .expect("fixture command output should be readable");
        assert!(output.contains("SessionDock SSH integration fixture"));
        command
            .wait_close()
            .expect("fixture command should close cleanly");
        eprintln!("live SSH smoke: command completed");

        let mut channel = session
            .channel_session()
            .expect("live SSH shell channel should open");
        channel
            .request_pty("xterm-256color", None, Some((80, 24, 0, 0)))
            .expect("live SSH PTY should open");
        channel.shell().expect("live SSH shell should open");
        session.set_blocking(false);

        let manager = NativeSshManager::new();
        manager.connections.lock().await.insert(
            TAB_ID.to_string(),
            Arc::new(ManagedSshConnection {
                transport: Mutex::new(SshConnection {
                    session,
                    channel,
                    _jump_bridges: jump_bridges,
                }),
                operation_lock: Mutex::new(()),
            }),
        );
        eprintln!("live SSH smoke: managed shell registered");

        tokio::time::sleep(Duration::from_secs(1)).await;
        resize_ssh(&manager, TAB_ID, 80, 24)
            .await
            .expect("managed SSH shell should be resizable");
        eprintln!("live SSH smoke: shell resized");

        for _ in 0..5 {
            tokio::time::sleep(Duration::from_millis(20)).await;
            let connection = manager
                .connections
                .lock()
                .await
                .get(TAB_ID)
                .cloned()
                .expect("managed shell should remain registered");
            let mut transport = connection.transport.lock().await;
            let mut stdout = [0u8; 4096];
            let stdout_result = transport.channel.read(&mut stdout);
            let mut stderr = [0u8; 4096];
            let stderr_result = transport.channel.stderr().read(&mut stderr);
            assert!(
                stdout_result.is_ok() || stdout_result.as_ref().is_err_and(is_nonfatal_io_error),
                "post-resize stdout poll failed: {stdout_result:?}"
            );
            assert!(
                stderr_result.is_ok() || stderr_result.as_ref().is_err_and(is_nonfatal_io_error),
                "post-resize stderr poll failed: {stderr_result:?}"
            );
        }

        write_ssh(&manager, TAB_ID, b"fixture-info\r")
            .await
            .expect("managed SSH shell input should be writable");
        eprintln!("live SSH smoke: shell input written");

        open_sftp(&manager, TAB_ID)
            .await
            .expect("managed SFTP subsystem should initialize");
        eprintln!("live SSH smoke: SFTP initialized");
        live_smoke_sftp(&manager, TAB_ID)
            .await
            .expect("managed SFTP operations should pass");
        eprintln!("live SSH smoke: SFTP operations completed");
        live_smoke_scp(&manager, TAB_ID)
            .await
            .expect("managed SCP operations should pass");
        eprintln!("live SSH smoke: SCP operations completed");
        let tunnel_session = authenticated_ssh_session(&manager, TAB_ID)
            .await
            .expect("authenticated tunnel session should be available");
        live_smoke_tunnels(tunnel_session, echo_port)
            .await
            .expect("local, remote, and SOCKS tunnel smoke checks should pass");
        eprintln!("live SSH smoke: tunnels completed");
        close_ssh(&manager, TAB_ID)
            .await
            .expect("live SSH session should close cleanly");
        eprintln!("live SSH smoke: session closed");
    }
}

struct ManagedSerialConnection {
    session: StdMutex<SerialSession>,
    closed: AtomicBool,
}

pub struct SerialManager {
    connections: Arc<Mutex<HashMap<String, Arc<ManagedSerialConnection>>>>,
}

impl SerialManager {
    pub fn new() -> Self {
        Self {
            connections: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

fn validate_serial_config(port_name: &str, baud_rate: u32) -> Result<(), AppError> {
    if port_name.trim().is_empty() || port_name.len() > 256 || port_name.contains('\0') {
        return Err(AppError::Validation(
            "A valid serial port name is required".into(),
        ));
    }
    if !(300..=4_000_000).contains(&baud_rate) {
        return Err(AppError::Validation(
            "Serial speed must be between 300 and 4000000 bps".into(),
        ));
    }
    Ok(())
}

pub async fn connect_serial(
    app: &AppHandle,
    manager: &SerialManager,
    log_manager: &TerminalLogManager,
    tab_id: &str,
    port_name: &str,
    baud_rate: u32,
) -> Result<(), AppError> {
    validate_serial_config(port_name, baud_rate)?;

    let mut session = SerialSession::new(SerialConfig {
        port_name: port_name.trim().to_string(),
        baud_rate,
        data_bits: 8,
        stop_bits: 1,
        parity: "none".into(),
        flow_control: "none".into(),
    });
    let session = tokio::task::spawn_blocking(move || {
        session.connect()?;
        Ok::<_, AppError>(session)
    })
    .await
    .map_err(|error| AppError::Serial(format!("Serial connection task failed: {error}")))??;

    let connection = Arc::new(ManagedSerialConnection {
        session: StdMutex::new(session),
        closed: AtomicBool::new(false),
    });
    manager
        .connections
        .lock()
        .await
        .insert(tab_id.to_string(), connection.clone());

    let _ = app.emit(&format!("terminal-status-{tab_id}"), "connected");
    let app_clone = app.clone();
    let tab_id_owned = tab_id.to_string();
    let output_log_manager = log_manager.clone();
    tokio::task::spawn_blocking(move || {
        let mut buffer = [0_u8; 4096];
        while !connection.closed.load(Ordering::Acquire) {
            let result = connection
                .session
                .lock()
                .map_err(|_| AppError::Serial("Serial connection lock was poisoned".into()))
                .and_then(|mut active| active.read(&mut buffer));
            match result {
                Ok(0) => continue,
                Ok(count) => {
                    let data = String::from_utf8_lossy(&buffer[..count]).to_string();
                    if let Err(error) =
                        output_log_manager.append_blocking(&tab_id_owned, data.as_bytes())
                    {
                        log::warn!("Terminal log write failed for pane {tab_id_owned}: {error}");
                    }
                    let _ = app_clone.emit(&format!("terminal-data-{tab_id_owned}"), data);
                }
                Err(error) => {
                    let reason = error.to_string();
                    let _ =
                        app_clone.emit(&format!("terminal-close-detail-{tab_id_owned}"), &reason);
                    break;
                }
            }
        }
        let _ = app_clone.emit(&format!("terminal-status-{tab_id_owned}"), "disconnected");
    });
    Ok(())
}

pub async fn write_serial(
    manager: &SerialManager,
    tab_id: &str,
    data: &[u8],
) -> Result<(), AppError> {
    let connection = manager.connections.lock().await.get(tab_id).cloned();
    if let Some(connection) = connection {
        let data = data.to_vec();
        tokio::task::spawn_blocking(move || {
            connection
                .session
                .lock()
                .map_err(|_| AppError::Serial("Serial connection lock was poisoned".into()))?
                .write(&data)
        })
        .await
        .map_err(|error| AppError::Serial(format!("Serial write task failed: {error}")))??;
    }
    Ok(())
}

pub async fn close_serial(manager: &SerialManager, tab_id: &str) -> Result<(), AppError> {
    let connection = manager.connections.lock().await.remove(tab_id);
    if let Some(connection) = connection {
        connection.closed.store(true, Ordering::Release);
        tokio::task::spawn_blocking(move || {
            connection
                .session
                .lock()
                .map_err(|_| AppError::Serial("Serial connection lock was poisoned".into()))?
                .disconnect()
        })
        .await
        .map_err(|error| AppError::Serial(format!("Serial close task failed: {error}")))??;
    }
    Ok(())
}

#[cfg(test)]
mod serial_tests {
    use super::validate_serial_config;

    #[test]
    fn validates_serial_port_and_speed() {
        assert!(validate_serial_config("COM3", 115_200).is_ok());
        assert!(validate_serial_config("", 9_600).is_err());
        assert!(validate_serial_config("COM3", 0).is_err());
        assert!(validate_serial_config("COM3", 4_000_001).is_err());
    }
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
    log_manager: &TerminalLogManager,
    tab_id: &str,
    host: &str,
    port: u16,
) -> Result<(), AppError> {
    let mut cmd = Command::new("telnet");
    cmd.arg(host).arg(port.to_string());
    cmd.stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(target_os = "windows")]
    {
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| AppError::Telnet(format!("Failed to start Telnet: {}", e)))?;

    let stdin = child.stdin.take();
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let tab_id_owned = tab_id.to_string();
    let app_clone = app.clone();

    if let Some(mut stdout) = stdout {
        let tid = tab_id_owned.clone();
        let app2 = app_clone.clone();
        let output_log_manager = log_manager.clone();
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
                        if let Err(error) = output_log_manager.append(&tid, data.as_bytes()).await {
                            log::warn!("Terminal log write failed for pane {tid}: {error}");
                        }
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
        let output_log_manager = log_manager.clone();
        tokio::spawn(async move {
            let mut buf = [0u8; 4096];
            loop {
                match stderr.read(&mut buf).await {
                    Ok(0) => break,
                    Ok(n) => {
                        let data = String::from_utf8_lossy(&buf[..n]).to_string();
                        if let Err(error) = output_log_manager.append(&tid, data.as_bytes()).await {
                            log::warn!("Terminal log write failed for pane {tid}: {error}");
                        }
                        let _ = app3.emit(&format!("terminal-data-{}", tid), &data);
                    }
                    Err(_) => break,
                }
            }
        });
    }

    let _ = app.emit(&format!("terminal-status-{}", tab_id), "connected");
    let mut procs = manager.processes.lock().await;
    procs.insert(
        tab_id.to_string(),
        TelnetProcess {
            stdin,
            _child: child,
        },
    );
    Ok(())
}

pub async fn write_telnet(
    manager: &TelnetManager,
    tab_id: &str,
    data: &[u8],
) -> Result<(), AppError> {
    let mut procs = manager.processes.lock().await;
    if let Some(proc) = procs.get_mut(tab_id) {
        if let Some(stdin) = &mut proc.stdin {
            stdin
                .write_all(data)
                .await
                .map_err(|e| AppError::Generic(format!("Write: {}", e)))?;
            stdin
                .flush()
                .await
                .map_err(|e| AppError::Generic(format!("Flush: {}", e)))?;
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
