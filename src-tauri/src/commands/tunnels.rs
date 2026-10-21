use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, TcpListener, TcpStream, ToSocketAddrs};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use ssh2::{Channel, Listener, Session};
use tauri::{AppHandle, Emitter, State};
use tokio::sync::Mutex;

use crate::error::AppError;
use crate::terminal::{authenticated_ssh_session, bridge_ssh_channel, NativeSshManager};

const CHANNEL_OPEN_TIMEOUT: Duration = Duration::from_secs(10);
const SOCKS_HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(10);
const SOCKS_IO_POLL: Duration = Duration::from_millis(200);
const SOCKS_VERSION: u8 = 5;
const SOCKS_NO_AUTH: u8 = 0;
const SOCKS_COMMAND_CONNECT: u8 = 1;
#[cfg(test)]
const LOOPBACK_HOST: &str = "127.0.0.1";
const MAX_TUNNELS_TOTAL: usize = 64;
const MAX_TUNNELS_PER_TAB: usize = 16;
const MAX_CONNECTIONS_PER_TUNNEL: usize = 128;
const AUTOMATIC_REMOTE_PORT_START: u16 = 49152;
const AUTOMATIC_REMOTE_PORT_ATTEMPTS: usize = 16;

struct TunnelConnectionPermit(Arc<AtomicUsize>);

impl Drop for TunnelConnectionPermit {
    fn drop(&mut self) {
        self.0.fetch_sub(1, Ordering::AcqRel);
    }
}

fn acquire_connection(active: &Arc<AtomicUsize>) -> Option<TunnelConnectionPermit> {
    active
        .fetch_update(Ordering::AcqRel, Ordering::Acquire, |count| {
            (count < MAX_CONNECTIONS_PER_TUNNEL).then_some(count + 1)
        })
        .ok()
        .map(|_| TunnelConnectionPermit(active.clone()))
}

fn socks_reply(status: u8) -> [u8; 10] {
    [SOCKS_VERSION, status, 0, 1, 0, 0, 0, 0, 0, 0]
}

fn read_socks_bytes(
    socket: &mut TcpStream,
    buffer: &mut [u8],
    deadline: Instant,
    shutdown: &AtomicBool,
) -> Result<(), AppError> {
    let mut offset = 0;
    while offset < buffer.len() {
        if shutdown.load(Ordering::Acquire) {
            return Err(AppError::Generic("Tunnel stopped".to_string()));
        }
        if Instant::now() >= deadline {
            return Err(AppError::Ssh("SOCKS5 handshake timed out".to_string()));
        }
        match socket.read(&mut buffer[offset..]) {
            Ok(0) => return Err(AppError::Ssh("SOCKS5 client disconnected".to_string())),
            Ok(count) => offset += count,
            Err(error)
                if matches!(
                    error.kind(),
                    std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut
                ) => {}
            Err(error) => return Err(error.into()),
        }
    }
    Ok(())
}

fn negotiate_socks5(
    socket: &mut TcpStream,
    shutdown: &AtomicBool,
) -> Result<(String, u16), AppError> {
    let deadline = Instant::now() + SOCKS_HANDSHAKE_TIMEOUT;
    socket.set_read_timeout(Some(SOCKS_IO_POLL))?;
    socket.set_write_timeout(Some(SOCKS_IO_POLL))?;

    let mut greeting = [0u8; 2];
    read_socks_bytes(socket, &mut greeting, deadline, shutdown)?;
    if greeting[0] != SOCKS_VERSION || greeting[1] == 0 {
        let _ = socket.write_all(&[SOCKS_VERSION, 0xff]);
        return Err(AppError::Validation("Invalid SOCKS5 greeting".to_string()));
    }
    let mut methods = vec![0u8; greeting[1] as usize];
    read_socks_bytes(socket, &mut methods, deadline, shutdown)?;
    if !methods.contains(&SOCKS_NO_AUTH) {
        socket.write_all(&[SOCKS_VERSION, 0xff])?;
        return Err(AppError::Validation(
            "SOCKS5 client does not support no-authentication mode".to_string(),
        ));
    }
    socket.write_all(&[SOCKS_VERSION, SOCKS_NO_AUTH])?;

    let mut request = [0u8; 4];
    read_socks_bytes(socket, &mut request, deadline, shutdown)?;
    if request[0] != SOCKS_VERSION || request[2] != 0 {
        let _ = socket.write_all(&socks_reply(1));
        return Err(AppError::Validation("Invalid SOCKS5 request".to_string()));
    }
    if request[1] != SOCKS_COMMAND_CONNECT {
        socket.write_all(&socks_reply(7))?;
        return Err(AppError::Validation(
            "Only SOCKS5 CONNECT is supported".to_string(),
        ));
    }

    let host = match request[3] {
        1 => {
            let mut address = [0u8; 4];
            read_socks_bytes(socket, &mut address, deadline, shutdown)?;
            IpAddr::V4(Ipv4Addr::from(address)).to_string()
        }
        3 => {
            let mut length = [0u8; 1];
            read_socks_bytes(socket, &mut length, deadline, shutdown)?;
            if length[0] == 0 || length[0] > 253 {
                let _ = socket.write_all(&socks_reply(1));
                return Err(AppError::Validation(
                    "SOCKS5 destination host length is invalid".to_string(),
                ));
            }
            let mut host = vec![0u8; length[0] as usize];
            read_socks_bytes(socket, &mut host, deadline, shutdown)?;
            let host = match String::from_utf8(host) {
                Ok(host) => host,
                Err(_) => {
                    let _ = socket.write_all(&socks_reply(1));
                    return Err(AppError::Validation(
                        "SOCKS5 destination host is not UTF-8".to_string(),
                    ));
                }
            };
            if host.contains('\0') || host.chars().any(char::is_whitespace) {
                let _ = socket.write_all(&socks_reply(1));
                return Err(AppError::Validation(
                    "SOCKS5 destination host is invalid".to_string(),
                ));
            }
            host
        }
        4 => {
            let mut address = [0u8; 16];
            read_socks_bytes(socket, &mut address, deadline, shutdown)?;
            IpAddr::V6(Ipv6Addr::from(address)).to_string()
        }
        _ => {
            socket.write_all(&socks_reply(8))?;
            return Err(AppError::Validation(
                "SOCKS5 address type is unsupported".to_string(),
            ));
        }
    };
    let mut port = [0u8; 2];
    read_socks_bytes(socket, &mut port, deadline, shutdown)?;
    let port = u16::from_be_bytes(port);
    if port == 0 {
        let _ = socket.write_all(&socks_reply(1));
        return Err(AppError::Validation(
            "SOCKS5 destination port is invalid".to_string(),
        ));
    }

    socket.set_read_timeout(None)?;
    socket.set_write_timeout(None)?;
    Ok((host, port))
}

#[derive(Clone)]
pub struct SshTunnelManager {
    tunnels: Arc<Mutex<HashMap<String, ManagedTunnel>>>,
}

struct ManagedTunnel {
    info: SshTunnelInfo,
    shutdown: Arc<AtomicBool>,
}

impl SshTunnelManager {
    pub fn new() -> Self {
        Self {
            tunnels: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub async fn cancel_tab(&self, tab_id: &str) {
        let mut tunnels = self.tunnels.lock().await;
        let tunnel_ids = tunnels
            .iter()
            .filter(|(_, tunnel)| tunnel.info.tab_id == tab_id)
            .map(|(id, _)| id.clone())
            .collect::<Vec<_>>();
        for id in tunnel_ids {
            if let Some(tunnel) = tunnels.remove(&id) {
                tunnel.shutdown.store(true, Ordering::Release);
            }
        }
    }
}

async fn register_tunnel(
    registry: &Arc<Mutex<HashMap<String, ManagedTunnel>>>,
    info: SshTunnelInfo,
    shutdown: Arc<AtomicBool>,
) -> Result<(), AppError> {
    let mut tunnels = registry.lock().await;
    if tunnels.len() >= MAX_TUNNELS_TOTAL
        || tunnels
            .values()
            .filter(|tunnel| tunnel.info.tab_id == info.tab_id)
            .count()
            >= MAX_TUNNELS_PER_TAB
    {
        return Err(AppError::Validation(
            "Active SSH tunnel limit reached".to_string(),
        ));
    }
    tunnels.insert(info.id.clone(), ManagedTunnel { info, shutdown });
    Ok(())
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SshTunnelInfo {
    pub id: String,
    pub tab_id: String,
    pub mode: &'static str,
    pub bind_address: String,
    pub bind_port: u16,
    pub target_host: String,
    pub target_port: u16,
    pub status: &'static str,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartLocalTunnelRequest {
    tab_id: String,
    local_port: u16,
    remote_host: String,
    remote_port: u16,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartRemoteTunnelRequest {
    tab_id: String,
    remote_port: u16,
    local_host: String,
    local_port: u16,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartDynamicTunnelRequest {
    tab_id: String,
    local_port: u16,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TunnelErrorEvent {
    tunnel_id: String,
    message: String,
}

fn validate_remote_endpoint(host: &str, port: u16) -> Result<(), AppError> {
    if host.is_empty()
        || host.len() > 253
        || host.contains('\0')
        || host.chars().any(char::is_whitespace)
        || port == 0
    {
        return Err(AppError::Validation(
            "A valid remote host and port are required".to_string(),
        ));
    }
    Ok(())
}

fn bind_local_listener(port: u16) -> Result<TcpListener, AppError> {
    let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, port)).map_err(|error| {
        AppError::Ssh(format!(
            "Local tunnel could not bind to 127.0.0.1:{port}: {error}"
        ))
    })?;
    listener.set_nonblocking(true)?;
    Ok(listener)
}

async fn request_remote_listener(
    session: &Session,
    port: u16,
) -> Result<(Listener, u16), AppError> {
    let deadline = Instant::now() + CHANNEL_OPEN_TIMEOUT;
    loop {
        match session.channel_forward_listen(port, Some("127.0.0.1"), Some(16)) {
            Ok(listener) => return Ok(listener),
            Err(error)
                if error.code() == ssh2::ErrorCode::Session(-37) && Instant::now() < deadline =>
            {
                tokio::time::sleep(Duration::from_millis(5)).await;
            }
            Err(error) => {
                return Err(AppError::Ssh(format!(
                    "Remote tunnel could not bind to 127.0.0.1:{port}: {error}"
                )))
            }
        }
    }
}

fn automatic_remote_port_candidate() -> u16 {
    let bytes = uuid::Uuid::new_v4().into_bytes();
    let offset =
        u16::from_be_bytes([bytes[0], bytes[1]]) % (u16::MAX - AUTOMATIC_REMOTE_PORT_START);
    AUTOMATIC_REMOTE_PORT_START + offset
}

async fn open_remote_listener(session: &Session, port: u16) -> Result<(Listener, u16), AppError> {
    if port != 0 {
        return request_remote_listener(session, port).await;
    }

    match request_remote_listener(session, 0).await {
        Ok((listener, bound_port)) if bound_port != 0 => return Ok((listener, bound_port)),
        Ok((listener, _)) => drop(listener),
        Err(AppError::Ssh(_)) => {}
        Err(error) => return Err(error),
    }

    for _ in 0..AUTOMATIC_REMOTE_PORT_ATTEMPTS {
        let candidate = automatic_remote_port_candidate();
        if let Ok((listener, _)) = request_remote_listener(session, candidate).await {
            return Ok((listener, candidate));
        }
    }

    Err(AppError::Ssh(
        "Remote tunnel could not allocate a loopback server port".to_string(),
    ))
}

fn connect_local_target(host: &str, port: u16) -> Result<TcpStream, AppError> {
    let target = format!("{host}:{port}");
    let addresses = (host, port).to_socket_addrs().map_err(|error| {
        AppError::Ssh(format!(
            "Remote tunnel local target resolution failed for {target}: {error}"
        ))
    })?;
    let mut last_error = None;
    for address in addresses {
        match TcpStream::connect_timeout(&address, Duration::from_secs(10)) {
            Ok(socket) => return Ok(socket),
            Err(error) => last_error = Some(error),
        }
    }
    Err(AppError::Ssh(match last_error {
        Some(error) => format!("Remote tunnel local target {target} failed: {error}"),
        None => format!("Remote tunnel local target {target} resolved no addresses"),
    }))
}

fn open_direct_channel(
    session: &Session,
    remote_host: &str,
    remote_port: u16,
    origin_host: &str,
    origin_port: u16,
    shutdown: &AtomicBool,
) -> Result<Channel, AppError> {
    let deadline = Instant::now() + CHANNEL_OPEN_TIMEOUT;
    loop {
        if shutdown.load(Ordering::Acquire) {
            return Err(AppError::Generic("Tunnel stopped".to_string()));
        }
        match session.channel_direct_tcpip(
            remote_host,
            remote_port,
            Some((origin_host, origin_port)),
        ) {
            Ok(channel) => return Ok(channel),
            Err(error)
                if error.code() == ssh2::ErrorCode::Session(-37) && Instant::now() < deadline =>
            {
                std::thread::sleep(Duration::from_millis(5));
            }
            Err(error) => {
                return Err(AppError::Ssh(format!(
                    "SSH tunnel channel to {remote_host}:{remote_port} failed: {error}"
                )))
            }
        }
    }
}

fn run_local_tunnel(
    app: AppHandle,
    listener: TcpListener,
    session: Session,
    info: SshTunnelInfo,
    shutdown: Arc<AtomicBool>,
    registry: Arc<Mutex<HashMap<String, ManagedTunnel>>>,
    active_connections: Arc<AtomicUsize>,
) {
    while !shutdown.load(Ordering::Acquire) {
        let (socket, peer) = match listener.accept() {
            Ok(connection) => connection,
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(5));
                continue;
            }
            Err(error) => {
                let _ = app.emit(
                    &format!("tunnel-error-{}", info.tab_id),
                    TunnelErrorEvent {
                        tunnel_id: info.id.clone(),
                        message: format!("Local tunnel listener failed: {error}"),
                    },
                );
                break;
            }
        };

        let Some(connection_permit) = acquire_connection(&active_connections) else {
            continue;
        };

        let origin_host = peer.ip().to_string();
        let channel = match open_direct_channel(
            &session,
            &info.target_host,
            info.target_port,
            &origin_host,
            peer.port(),
            &shutdown,
        ) {
            Ok(channel) => channel,
            Err(error) => {
                let _ = app.emit(
                    &format!("tunnel-error-{}", info.tab_id),
                    TunnelErrorEvent {
                        tunnel_id: info.id.clone(),
                        message: error.to_string(),
                    },
                );
                continue;
            }
        };

        let connection_session = session.clone();
        let connection_shutdown = shutdown.clone();
        let _ = std::thread::Builder::new()
            .name("sessiondock-local-tunnel-connection".into())
            .spawn(move || {
                let _connection_permit = connection_permit;
                bridge_ssh_channel(socket, connection_session, channel, connection_shutdown)
            });
    }

    registry.blocking_lock().remove(&info.id);
}

fn run_remote_tunnel(
    app: AppHandle,
    mut listener: Listener,
    session: Session,
    info: SshTunnelInfo,
    shutdown: Arc<AtomicBool>,
    registry: Arc<Mutex<HashMap<String, ManagedTunnel>>>,
    active_connections: Arc<AtomicUsize>,
) {
    while !shutdown.load(Ordering::Acquire) {
        let channel = match listener.accept() {
            Ok(channel) => channel,
            Err(error) if error.code() == ssh2::ErrorCode::Session(-37) => {
                std::thread::sleep(Duration::from_millis(5));
                continue;
            }
            Err(error) => {
                let _ = app.emit(
                    &format!("tunnel-error-{}", info.tab_id),
                    TunnelErrorEvent {
                        tunnel_id: info.id.clone(),
                        message: format!("Remote tunnel listener failed: {error}"),
                    },
                );
                break;
            }
        };

        let Some(connection_permit) = acquire_connection(&active_connections) else {
            continue;
        };

        let socket = match connect_local_target(&info.target_host, info.target_port) {
            Ok(socket) => socket,
            Err(error) => {
                let _ = app.emit(
                    &format!("tunnel-error-{}", info.tab_id),
                    TunnelErrorEvent {
                        tunnel_id: info.id.clone(),
                        message: error.to_string(),
                    },
                );
                continue;
            }
        };

        let connection_session = session.clone();
        let connection_shutdown = shutdown.clone();
        let _ = std::thread::Builder::new()
            .name("sessiondock-remote-tunnel-connection".into())
            .spawn(move || {
                let _connection_permit = connection_permit;
                bridge_ssh_channel(socket, connection_session, channel, connection_shutdown)
            });
    }

    drop(listener);
    registry.blocking_lock().remove(&info.id);
}

fn run_socks_connection(
    mut socket: TcpStream,
    peer_host: String,
    peer_port: u16,
    session: Session,
    shutdown: Arc<AtomicBool>,
) {
    let (target_host, target_port) = match negotiate_socks5(&mut socket, &shutdown) {
        Ok(target) => target,
        Err(_) => return,
    };
    let mut channel = match open_direct_channel(
        &session,
        &target_host,
        target_port,
        &peer_host,
        peer_port,
        &shutdown,
    ) {
        Ok(channel) => channel,
        Err(_) => {
            let _ = socket.write_all(&socks_reply(5));
            return;
        }
    };
    if socket.write_all(&socks_reply(0)).is_err() {
        let _ = channel.close();
        return;
    }
    bridge_ssh_channel(socket, session, channel, shutdown);
}

fn run_dynamic_tunnel(
    app: AppHandle,
    listener: TcpListener,
    session: Session,
    info: SshTunnelInfo,
    shutdown: Arc<AtomicBool>,
    registry: Arc<Mutex<HashMap<String, ManagedTunnel>>>,
    active_connections: Arc<AtomicUsize>,
) {
    while !shutdown.load(Ordering::Acquire) {
        let (socket, peer) = match listener.accept() {
            Ok(connection) => connection,
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(5));
                continue;
            }
            Err(error) => {
                let _ = app.emit(
                    &format!("tunnel-error-{}", info.tab_id),
                    TunnelErrorEvent {
                        tunnel_id: info.id.clone(),
                        message: format!("SOCKS listener failed: {error}"),
                    },
                );
                break;
            }
        };

        let Some(connection_permit) = acquire_connection(&active_connections) else {
            continue;
        };

        let connection_session = session.clone();
        let connection_shutdown = shutdown.clone();
        let peer_host = peer.ip().to_string();
        let peer_port = peer.port();
        let _ = std::thread::Builder::new()
            .name("sessiondock-socks-connection".into())
            .spawn(move || {
                let _connection_permit = connection_permit;
                run_socks_connection(
                    socket,
                    peer_host,
                    peer_port,
                    connection_session,
                    connection_shutdown,
                )
            });
    }

    registry.blocking_lock().remove(&info.id);
}

#[tauri::command]
pub async fn start_local_tunnel(
    app: AppHandle,
    ssh_manager: State<'_, NativeSshManager>,
    tunnel_manager: State<'_, SshTunnelManager>,
    request: StartLocalTunnelRequest,
) -> Result<SshTunnelInfo, AppError> {
    validate_remote_endpoint(&request.remote_host, request.remote_port)?;
    if request.tab_id.is_empty() || request.tab_id.len() > 128 || request.tab_id.contains('\0') {
        return Err(AppError::Validation(
            "Invalid terminal pane reference".to_string(),
        ));
    }

    let session = authenticated_ssh_session(&ssh_manager, &request.tab_id).await?;
    let listener = bind_local_listener(request.local_port)?;
    let local_port = listener.local_addr()?.port();
    let info = SshTunnelInfo {
        id: uuid::Uuid::new_v4().to_string(),
        tab_id: request.tab_id,
        mode: "local",
        bind_address: Ipv4Addr::LOCALHOST.to_string(),
        bind_port: local_port,
        target_host: request.remote_host,
        target_port: request.remote_port,
        status: "running",
    };
    let shutdown = Arc::new(AtomicBool::new(false));
    let registry = tunnel_manager.tunnels.clone();

    register_tunnel(&registry, info.clone(), shutdown.clone()).await?;

    let worker_info = info.clone();
    if let Err(error) = std::thread::Builder::new()
        .name("sessiondock-local-tunnel".into())
        .spawn({
            let worker_registry = registry.clone();
            move || {
                run_local_tunnel(
                    app,
                    listener,
                    session,
                    worker_info,
                    shutdown,
                    worker_registry,
                    Arc::new(AtomicUsize::new(0)),
                )
            }
        })
    {
        registry.lock().await.remove(&info.id);
        return Err(AppError::Ssh(format!("Local tunnel task failed: {error}")));
    }

    Ok(info)
}

#[tauri::command]
pub async fn start_remote_tunnel(
    app: AppHandle,
    ssh_manager: State<'_, NativeSshManager>,
    tunnel_manager: State<'_, SshTunnelManager>,
    request: StartRemoteTunnelRequest,
) -> Result<SshTunnelInfo, AppError> {
    validate_remote_endpoint(&request.local_host, request.local_port)?;
    if request.tab_id.is_empty() || request.tab_id.len() > 128 || request.tab_id.contains('\0') {
        return Err(AppError::Validation(
            "Invalid terminal pane reference".to_string(),
        ));
    }

    let session = authenticated_ssh_session(&ssh_manager, &request.tab_id).await?;
    let (listener, bound_port) = open_remote_listener(&session, request.remote_port).await?;
    let info = SshTunnelInfo {
        id: uuid::Uuid::new_v4().to_string(),
        tab_id: request.tab_id,
        mode: "remote",
        bind_address: Ipv4Addr::LOCALHOST.to_string(),
        bind_port: bound_port,
        target_host: request.local_host,
        target_port: request.local_port,
        status: "running",
    };
    let shutdown = Arc::new(AtomicBool::new(false));
    let registry = tunnel_manager.tunnels.clone();
    register_tunnel(&registry, info.clone(), shutdown.clone()).await?;

    let worker_info = info.clone();
    if let Err(error) = std::thread::Builder::new()
        .name("sessiondock-remote-tunnel".into())
        .spawn({
            let worker_registry = registry.clone();
            move || {
                run_remote_tunnel(
                    app,
                    listener,
                    session,
                    worker_info,
                    shutdown,
                    worker_registry,
                    Arc::new(AtomicUsize::new(0)),
                )
            }
        })
    {
        registry.lock().await.remove(&info.id);
        return Err(AppError::Ssh(format!("Remote tunnel task failed: {error}")));
    }

    Ok(info)
}

#[tauri::command]
pub async fn start_dynamic_tunnel(
    app: AppHandle,
    ssh_manager: State<'_, NativeSshManager>,
    tunnel_manager: State<'_, SshTunnelManager>,
    request: StartDynamicTunnelRequest,
) -> Result<SshTunnelInfo, AppError> {
    if request.tab_id.is_empty() || request.tab_id.len() > 128 || request.tab_id.contains('\0') {
        return Err(AppError::Validation(
            "Invalid terminal pane reference".to_string(),
        ));
    }

    let session = authenticated_ssh_session(&ssh_manager, &request.tab_id).await?;
    let listener = bind_local_listener(request.local_port)?;
    let local_port = listener.local_addr()?.port();
    let info = SshTunnelInfo {
        id: uuid::Uuid::new_v4().to_string(),
        tab_id: request.tab_id,
        mode: "dynamic",
        bind_address: Ipv4Addr::LOCALHOST.to_string(),
        bind_port: local_port,
        target_host: "SOCKS5".to_string(),
        target_port: 0,
        status: "running",
    };
    let shutdown = Arc::new(AtomicBool::new(false));
    let registry = tunnel_manager.tunnels.clone();
    register_tunnel(&registry, info.clone(), shutdown.clone()).await?;

    let worker_info = info.clone();
    if let Err(error) = std::thread::Builder::new()
        .name("sessiondock-socks-tunnel".into())
        .spawn({
            let worker_registry = registry.clone();
            move || {
                run_dynamic_tunnel(
                    app,
                    listener,
                    session,
                    worker_info,
                    shutdown,
                    worker_registry,
                    Arc::new(AtomicUsize::new(0)),
                )
            }
        })
    {
        registry.lock().await.remove(&info.id);
        return Err(AppError::Ssh(format!("SOCKS tunnel task failed: {error}")));
    }

    Ok(info)
}

#[tauri::command]
pub async fn list_ssh_tunnels(
    manager: State<'_, SshTunnelManager>,
    tab_id: Option<String>,
) -> Result<Vec<SshTunnelInfo>, AppError> {
    if tab_id
        .as_ref()
        .is_some_and(|id| id.len() > 128 || id.contains('\0'))
    {
        return Err(AppError::Validation(
            "Invalid terminal pane reference".to_string(),
        ));
    }
    let tunnels = manager.tunnels.lock().await;
    Ok(tunnels
        .values()
        .filter(|tunnel| tab_id.as_ref().map_or(true, |id| tunnel.info.tab_id == *id))
        .map(|tunnel| tunnel.info.clone())
        .collect())
}

#[tauri::command]
pub async fn stop_ssh_tunnel(
    manager: State<'_, SshTunnelManager>,
    tunnel_id: String,
) -> Result<(), AppError> {
    if tunnel_id.is_empty() || tunnel_id.len() > 128 || tunnel_id.contains('\0') {
        return Err(AppError::Validation("Invalid tunnel reference".to_string()));
    }
    let tunnel = manager
        .tunnels
        .lock()
        .await
        .remove(&tunnel_id)
        .ok_or_else(|| AppError::NotFound("SSH tunnel not found".to_string()))?;
    tunnel.shutdown.store(true, Ordering::Release);
    Ok(())
}

#[cfg(test)]
pub(crate) async fn live_smoke_tunnels(session: Session, echo_port: u16) -> Result<(), AppError> {
    const PROBE: &[u8] = b"sessiondock-rust-smoke";

    let exchange = |socket: &mut TcpStream| -> Result<(), AppError> {
        socket.set_read_timeout(Some(Duration::from_secs(5)))?;
        socket.set_write_timeout(Some(Duration::from_secs(5)))?;
        socket.write_all(PROBE)?;
        let mut response = vec![0_u8; PROBE.len()];
        socket.read_exact(&mut response)?;
        if response != PROBE {
            return Err(AppError::Ssh("Tunnel smoke echo mismatch".to_string()));
        }
        Ok(())
    };

    let local_listener = bind_local_listener(0)?;
    local_listener.set_nonblocking(false)?;
    let local_address = local_listener.local_addr()?;
    let local_shutdown = Arc::new(AtomicBool::new(false));
    let local_worker_shutdown = local_shutdown.clone();
    let local_session = session.clone();
    let local_worker = std::thread::spawn(move || -> Result<(), AppError> {
        let (socket, peer) = local_listener.accept()?;
        let channel = open_direct_channel(
            &local_session,
            LOOPBACK_HOST,
            echo_port,
            &peer.ip().to_string(),
            peer.port(),
            &local_worker_shutdown,
        )?;
        bridge_ssh_channel(socket, local_session, channel, local_worker_shutdown);
        Ok(())
    });
    let mut local_client = TcpStream::connect(local_address)?;
    exchange(&mut local_client)?;
    local_shutdown.store(true, Ordering::Release);
    drop(local_client);
    local_worker
        .join()
        .map_err(|_| AppError::Ssh("Local tunnel smoke worker panicked".to_string()))??;

    let socks_listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0))?;
    let socks_address = socks_listener.local_addr()?;
    let mut socks_client = TcpStream::connect(socks_address)?;
    let (socks_server, socks_peer) = socks_listener.accept()?;
    let socks_shutdown = Arc::new(AtomicBool::new(false));
    let socks_worker_shutdown = socks_shutdown.clone();
    let socks_session = session.clone();
    let socks_worker = std::thread::spawn(move || {
        run_socks_connection(
            socks_server,
            socks_peer.ip().to_string(),
            socks_peer.port(),
            socks_session,
            socks_worker_shutdown,
        )
    });
    socks_client.set_read_timeout(Some(Duration::from_secs(5)))?;
    socks_client.set_write_timeout(Some(Duration::from_secs(5)))?;
    socks_client.write_all(&[SOCKS_VERSION, 1, SOCKS_NO_AUTH])?;
    let mut method = [0_u8; 2];
    socks_client.read_exact(&mut method)?;
    if method != [SOCKS_VERSION, SOCKS_NO_AUTH] {
        return Err(AppError::Ssh(
            "SOCKS smoke authentication negotiation failed".to_string(),
        ));
    }
    let [port_high, port_low] = echo_port.to_be_bytes();
    socks_client.write_all(&[
        SOCKS_VERSION,
        SOCKS_COMMAND_CONNECT,
        0,
        1,
        127,
        0,
        0,
        1,
        port_high,
        port_low,
    ])?;
    let mut reply = [0_u8; 10];
    socks_client.read_exact(&mut reply)?;
    if reply[1] != 0 {
        return Err(AppError::Ssh(format!(
            "SOCKS smoke CONNECT failed with reply {}",
            reply[1]
        )));
    }
    exchange(&mut socks_client)?;
    socks_shutdown.store(true, Ordering::Release);
    drop(socks_client);
    socks_worker
        .join()
        .map_err(|_| AppError::Ssh("SOCKS smoke worker panicked".to_string()))?;

    let (mut remote_listener, remote_port) = open_remote_listener(&session, 0).await?;
    let remote_shutdown = Arc::new(AtomicBool::new(false));
    let remote_worker_shutdown = remote_shutdown.clone();
    let remote_session = session.clone();
    let remote_worker = std::thread::spawn(move || -> Result<(), AppError> {
        let deadline = Instant::now() + CHANNEL_OPEN_TIMEOUT;
        let channel = loop {
            match remote_listener.accept() {
                Ok(channel) => break channel,
                Err(error)
                    if error.code() == ssh2::ErrorCode::Session(-37)
                        && Instant::now() < deadline =>
                {
                    std::thread::sleep(Duration::from_millis(5));
                }
                Err(error) => {
                    return Err(AppError::Ssh(format!(
                        "Remote tunnel smoke accept failed: {error}"
                    )))
                }
            }
        };
        let socket = connect_local_target(LOOPBACK_HOST, echo_port)?;
        bridge_ssh_channel(socket, remote_session, channel, remote_worker_shutdown);
        Ok(())
    });
    let mut remote_client = TcpStream::connect((Ipv4Addr::LOCALHOST, remote_port))?;
    exchange(&mut remote_client)?;
    remote_shutdown.store(true, Ordering::Release);
    drop(remote_client);
    remote_worker
        .join()
        .map_err(|_| AppError::Ssh("Remote tunnel smoke worker panicked".to_string()))??;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        acquire_connection, automatic_remote_port_candidate, bind_local_listener,
        connect_local_target, negotiate_socks5, register_tunnel, validate_remote_endpoint,
        ManagedTunnel, SshTunnelInfo, SshTunnelManager, AUTOMATIC_REMOTE_PORT_START,
        MAX_CONNECTIONS_PER_TUNNEL, MAX_TUNNELS_PER_TAB,
    };
    use std::io::{Read, Write};
    use std::net::{Ipv4Addr, TcpListener, TcpStream};
    use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
    use std::sync::Arc;

    #[test]
    fn validates_remote_tunnel_endpoints() {
        assert!(validate_remote_endpoint("db.internal", 5432).is_ok());
        assert!(validate_remote_endpoint("", 5432).is_err());
        assert!(validate_remote_endpoint("bad host", 5432).is_err());
        assert!(validate_remote_endpoint("db.internal", 0).is_err());
    }

    #[test]
    fn automatic_remote_ports_stay_in_the_dynamic_range() {
        for _ in 0..64 {
            assert!(automatic_remote_port_candidate() >= AUTOMATIC_REMOTE_PORT_START);
        }
    }

    #[test]
    fn binds_only_to_loopback_and_reports_port_conflicts() {
        let listener = bind_local_listener(0).unwrap();
        let address = listener.local_addr().unwrap();
        assert!(address.ip().is_loopback());
        assert_ne!(address.port(), 0);
        assert!(bind_local_listener(address.port()).is_err());
    }

    #[test]
    fn connects_remote_forwarding_to_the_selected_local_target() {
        let target = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let socket =
            connect_local_target("127.0.0.1", target.local_addr().unwrap().port()).unwrap();
        assert!(socket.peer_addr().unwrap().ip().is_loopback());
    }

    fn connected_sockets() -> (TcpStream, TcpStream) {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let client = TcpStream::connect(listener.local_addr().unwrap()).unwrap();
        let (server, _) = listener.accept().unwrap();
        (client, server)
    }

    #[test]
    fn negotiates_socks5_domain_connect_requests() {
        let (mut client, mut server) = connected_sockets();
        let shutdown = AtomicBool::new(false);
        let worker = std::thread::spawn(move || negotiate_socks5(&mut server, &shutdown));
        client.write_all(&[5, 1, 0]).unwrap();
        let mut method = [0u8; 2];
        client.read_exact(&mut method).unwrap();
        assert_eq!(method, [5, 0]);
        client
            .write_all(&[
                5, 1, 0, 3, 11, b'd', b'b', b'.', b'i', b'n', b't', b'e', b'r', b'n', b'a', b'l',
                0x15, 0x38,
            ])
            .unwrap();
        assert_eq!(
            worker.join().unwrap().unwrap(),
            ("db.internal".into(), 5432)
        );
    }

    #[test]
    fn rejects_socks5_clients_without_no_authentication() {
        let (mut client, mut server) = connected_sockets();
        let shutdown = AtomicBool::new(false);
        let worker = std::thread::spawn(move || negotiate_socks5(&mut server, &shutdown));
        client.write_all(&[5, 1, 2]).unwrap();
        let mut response = [0u8; 2];
        client.read_exact(&mut response).unwrap();
        assert_eq!(response, [5, 0xff]);
        assert!(worker.join().unwrap().is_err());
    }

    #[test]
    fn rejects_unsupported_socks5_commands() {
        let (mut client, mut server) = connected_sockets();
        let shutdown = AtomicBool::new(false);
        let worker = std::thread::spawn(move || negotiate_socks5(&mut server, &shutdown));
        client.write_all(&[5, 1, 0]).unwrap();
        let mut method = [0u8; 2];
        client.read_exact(&mut method).unwrap();
        client.write_all(&[5, 3, 0, 1]).unwrap();
        let mut response = [0u8; 10];
        client.read_exact(&mut response).unwrap();
        assert_eq!(response[1], 7);
        assert!(worker.join().unwrap().is_err());
    }

    #[test]
    fn negotiates_socks5_ipv6_connect_requests() {
        let (mut client, mut server) = connected_sockets();
        let shutdown = AtomicBool::new(false);
        let worker = std::thread::spawn(move || negotiate_socks5(&mut server, &shutdown));
        client.write_all(&[5, 1, 0]).unwrap();
        let mut method = [0u8; 2];
        client.read_exact(&mut method).unwrap();
        let mut request = vec![5, 1, 0, 4];
        request.extend_from_slice(&std::net::Ipv6Addr::LOCALHOST.octets());
        request.extend_from_slice(&443u16.to_be_bytes());
        client.write_all(&request).unwrap();
        assert_eq!(worker.join().unwrap().unwrap(), ("::1".into(), 443));
    }

    #[test]
    fn bounds_concurrent_connections_per_tunnel() {
        let active = Arc::new(AtomicUsize::new(0));
        let mut permits = (0..MAX_CONNECTIONS_PER_TUNNEL)
            .map(|_| acquire_connection(&active).unwrap())
            .collect::<Vec<_>>();
        assert!(acquire_connection(&active).is_none());
        permits.pop();
        assert!(acquire_connection(&active).is_some());
    }

    #[test]
    fn cancels_stalled_socks5_handshakes() {
        let (_client, mut server) = connected_sockets();
        let shutdown = Arc::new(AtomicBool::new(false));
        let worker_shutdown = shutdown.clone();
        let worker = std::thread::spawn(move || negotiate_socks5(&mut server, &worker_shutdown));
        shutdown.store(true, Ordering::Release);
        assert!(worker.join().unwrap().is_err());
    }

    #[tokio::test]
    async fn cancels_only_tunnels_owned_by_the_closed_tab() {
        let manager = SshTunnelManager::new();
        let owned_shutdown = Arc::new(AtomicBool::new(false));
        let other_shutdown = Arc::new(AtomicBool::new(false));
        let info = |id: &str, tab_id: &str| SshTunnelInfo {
            id: id.into(),
            tab_id: tab_id.into(),
            mode: "local",
            bind_address: "127.0.0.1".into(),
            bind_port: 5000,
            target_host: "db.internal".into(),
            target_port: 5432,
            status: "running",
        };
        let mut tunnels = manager.tunnels.lock().await;
        tunnels.insert(
            "owned".into(),
            ManagedTunnel {
                info: info("owned", "tab-1"),
                shutdown: owned_shutdown.clone(),
            },
        );
        tunnels.insert(
            "other".into(),
            ManagedTunnel {
                info: info("other", "tab-2"),
                shutdown: other_shutdown.clone(),
            },
        );
        drop(tunnels);

        manager.cancel_tab("tab-1").await;

        assert!(owned_shutdown.load(Ordering::Acquire));
        assert!(!other_shutdown.load(Ordering::Acquire));
        let tunnels = manager.tunnels.lock().await;
        assert!(!tunnels.contains_key("owned"));
        assert!(tunnels.contains_key("other"));
    }

    #[tokio::test]
    async fn bounds_active_tunnels_per_tab() {
        let manager = SshTunnelManager::new();
        for index in 0..MAX_TUNNELS_PER_TAB {
            register_tunnel(
                &manager.tunnels,
                SshTunnelInfo {
                    id: format!("tunnel-{index}"),
                    tab_id: "tab-1".into(),
                    mode: "dynamic",
                    bind_address: "127.0.0.1".into(),
                    bind_port: 40000 + index as u16,
                    target_host: "SOCKS5".into(),
                    target_port: 0,
                    status: "running",
                },
                Arc::new(AtomicBool::new(false)),
            )
            .await
            .unwrap();
        }
        let result = register_tunnel(
            &manager.tunnels,
            SshTunnelInfo {
                id: "too-many".into(),
                tab_id: "tab-1".into(),
                mode: "dynamic",
                bind_address: "127.0.0.1".into(),
                bind_port: 50000,
                target_host: "SOCKS5".into(),
                target_port: 0,
                status: "running",
            },
            Arc::new(AtomicBool::new(false)),
        )
        .await;
        assert!(result.is_err());
    }
}
