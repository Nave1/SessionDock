// Telnet protocol implementation
// Plain TCP with Telnet option negotiation (IAC)

use crate::error::AppError;

pub struct TelnetConfig {
    pub host: String,
    pub port: u16,
    pub timeout_secs: u32,
}

pub struct TelnetSession {
    _config: TelnetConfig,
}

impl TelnetSession {
    pub fn new(config: TelnetConfig) -> Self {
        Self { _config: config }
    }

    pub async fn connect(&mut self) -> Result<(), AppError> {
        // TODO: Implement Telnet connection in Phase 7
        Err(AppError::Telnet("Telnet not yet implemented".into()))
    }
}
