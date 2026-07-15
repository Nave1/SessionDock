// SSH protocol implementation
// Uses tokio for async TCP + russh for SSH protocol

use tokio::net::TcpStream;
use tokio::time::{timeout, Duration};

use crate::error::AppError;

pub struct SshConfig {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth: SshAuth,
    pub timeout_secs: u32,
    pub keepalive_secs: u32,
}

pub enum SshAuth {
    Password(String),
    PrivateKey { key_path: String, passphrase: Option<String> },
    Agent,
}

pub struct SshSession {
    config: SshConfig,
    connected: bool,
}

impl SshSession {
    pub fn new(config: SshConfig) -> Self {
        Self {
            config,
            connected: false,
        }
    }

    pub async fn connect(&mut self) -> Result<String, AppError> {
        let addr = format!("{}:{}", self.config.host, self.config.port);

        // Verify the host is reachable with a TCP connection first
        let _stream = timeout(
            Duration::from_secs(self.config.timeout_secs as u64),
            TcpStream::connect(&addr),
        )
        .await
        .map_err(|_| AppError::Ssh(format!(
            "Connection timed out after {}s", self.config.timeout_secs
        )))?
        .map_err(|e| AppError::Ssh(format!(
            "Failed to connect to {}: {}", addr, e
        )))?;

        // TODO: Full russh handshake + authentication
        // For now, verify TCP connectivity
        self.connected = true;

        Ok(format!("Connected to {} as {}", addr, self.config.username))
    }

    pub async fn write(&mut self, _data: &[u8]) -> Result<(), AppError> {
        if !self.connected {
            return Err(AppError::Ssh("Not connected".into()));
        }
        // TODO: Send data through SSH channel
        Ok(())
    }

    pub async fn resize(&mut self, _cols: u32, _rows: u32) -> Result<(), AppError> {
        if !self.connected {
            return Err(AppError::Ssh("Not connected".into()));
        }
        // TODO: Send window change request
        Ok(())
    }

    pub async fn disconnect(&mut self) -> Result<(), AppError> {
        self.connected = false;
        Ok(())
    }

    pub fn is_connected(&self) -> bool {
        self.connected
    }
}
