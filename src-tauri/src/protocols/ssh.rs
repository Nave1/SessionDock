// SSH protocol implementation
// Will be expanded in Phase 6 with full russh integration

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
    // Will hold the russh session handle
    _config: SshConfig,
}

impl SshSession {
    pub fn new(config: SshConfig) -> Self {
        Self { _config: config }
    }

    pub async fn connect(&mut self) -> Result<(), AppError> {
        // TODO: Implement full SSH connection in Phase 6
        Err(AppError::Ssh("SSH not yet implemented".into()))
    }
}
