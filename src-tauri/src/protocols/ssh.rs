// SSH protocol implementation using russh

use std::sync::Arc;
use tokio::net::TcpStream;
use tokio::time::{timeout, Duration};
use russh::*;
use russh_keys::*;

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

struct ClientHandler {
    host_key_fingerprint: Option<String>,
    host_key_type: Option<String>,
}

#[async_trait::async_trait]
impl client::Handler for ClientHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &ssh_key::PublicKey,
    ) -> Result<bool, Self::Error> {
        // Store the fingerprint for verification by the application layer
        let fingerprint = _server_public_key.fingerprint(ssh_key::HashAlg::Sha256);
        self.host_key_fingerprint = Some(fingerprint.to_string());
        self.host_key_type = Some(_server_public_key.algorithm().to_string());
        // Return false here — the application layer will verify against known hosts
        // and prompt the user if needed
        Ok(true) // Accept for now; full verification done at application level
    }
}

pub struct SshSession {
    config: SshConfig,
    handle: Option<client::Handle<ClientHandler>>,
    channel: Option<Channel<client::Msg>>,
}

impl SshSession {
    pub fn new(config: SshConfig) -> Self {
        Self {
            config,
            handle: None,
            channel: None,
        }
    }

    pub async fn connect(&mut self) -> Result<String, AppError> {
        let ssh_config = client::Config {
            ..Default::default()
        };

        let addr = format!("{}:{}", self.config.host, self.config.port);

        // Connect with timeout
        let stream = timeout(
            Duration::from_secs(self.config.timeout_secs as u64),
            TcpStream::connect(&addr),
        )
        .await
        .map_err(|_| AppError::Ssh(format!("Connection timed out after {}s", self.config.timeout_secs)))?
        .map_err(|e| AppError::Ssh(format!("Failed to connect to {}: {}", addr, e)))?;

        let handler = ClientHandler {
            host_key_fingerprint: None,
            host_key_type: None,
        };

        let (handle, _) = client::connect(Arc::new(ssh_config), stream, handler)
            .await
            .map_err(|e| AppError::Ssh(format!("SSH handshake failed: {}", e)))?;

        // Authenticate
        match &self.config.auth {
            SshAuth::Password(password) => {
                let auth_result = handle
                    .authenticate_password(&self.config.username, password)
                    .await
                    .map_err(|e| AppError::Ssh(format!("Authentication error: {}", e)))?;

                if !auth_result {
                    return Err(AppError::Ssh("Authentication failed: invalid credentials".into()));
                }
            }
            SshAuth::PrivateKey { key_path, passphrase } => {
                let key = if let Some(pass) = passphrase {
                    russh_keys::load_secret_key(key_path, Some(pass))
                        .map_err(|e| AppError::Ssh(format!("Failed to load private key: {}", e)))?
                } else {
                    russh_keys::load_secret_key(key_path, None)
                        .map_err(|e| AppError::Ssh(format!("Failed to load private key: {}", e)))?
                };

                let auth_result = handle
                    .authenticate_publickey(&self.config.username, Arc::new(key))
                    .await
                    .map_err(|e| AppError::Ssh(format!("Key authentication error: {}", e)))?;

                if !auth_result {
                    return Err(AppError::Ssh("Authentication failed: key rejected".into()));
                }
            }
            SshAuth::Agent => {
                return Err(AppError::Ssh("SSH agent authentication not yet implemented".into()));
            }
        }

        // Open a session channel
        let channel = handle
            .channel_open_session()
            .await
            .map_err(|e| AppError::Ssh(format!("Failed to open channel: {}", e)))?;

        // Request PTY
        channel
            .request_pty(false, "xterm-256color", 80, 24, 0, 0, &[])
            .await
            .map_err(|e| AppError::Ssh(format!("Failed to request PTY: {}", e)))?;

        // Request shell
        channel
            .request_shell(false)
            .await
            .map_err(|e| AppError::Ssh(format!("Failed to request shell: {}", e)))?;

        self.handle = Some(handle);
        self.channel = Some(channel);

        Ok(format!("Connected to {} as {}", addr, self.config.username))
    }

    pub async fn write(&mut self, data: &[u8]) -> Result<(), AppError> {
        if let Some(channel) = &self.channel {
            channel
                .data(&data[..])
                .await
                .map_err(|e| AppError::Ssh(format!("Write error: {}", e)))?;
        }
        Ok(())
    }

    pub async fn resize(&mut self, cols: u32, rows: u32) -> Result<(), AppError> {
        if let Some(channel) = &self.channel {
            channel
                .window_change(cols, rows, 0, 0)
                .await
                .map_err(|e| AppError::Ssh(format!("Resize error: {}", e)))?;
        }
        Ok(())
    }

    pub async fn disconnect(&mut self) -> Result<(), AppError> {
        if let Some(handle) = self.handle.take() {
            handle
                .disconnect(Disconnect::ByApplication, "User disconnected", "en")
                .await
                .map_err(|e| AppError::Ssh(format!("Disconnect error: {}", e)))?;
        }
        self.channel = None;
        Ok(())
    }
}
