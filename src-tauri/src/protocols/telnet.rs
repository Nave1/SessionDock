// Telnet protocol implementation
// Handles IAC (Interpret As Command) negotiation and raw TCP data transfer

use tokio::net::TcpStream;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::time::{timeout, Duration};

use crate::error::AppError;

// Telnet protocol constants
const IAC: u8 = 255;  // Interpret As Command
const WILL: u8 = 251;
const WONT: u8 = 252;
const DO: u8 = 253;
const DONT: u8 = 254;
const SB: u8 = 250;   // Sub-negotiation Begin
const SE: u8 = 240;   // Sub-negotiation End

// Telnet options
const OPT_ECHO: u8 = 1;
const OPT_SUPPRESS_GO_AHEAD: u8 = 3;
const OPT_TERMINAL_TYPE: u8 = 24;
const OPT_NAWS: u8 = 31; // Negotiate About Window Size

pub struct TelnetConfig {
    pub host: String,
    pub port: u16,
    pub timeout_secs: u32,
}

pub struct TelnetSession {
    config: TelnetConfig,
    stream: Option<TcpStream>,
}

impl TelnetSession {
    pub fn new(config: TelnetConfig) -> Self {
        Self {
            config,
            stream: None,
        }
    }

    pub async fn connect(&mut self) -> Result<(), AppError> {
        let addr = format!("{}:{}", self.config.host, self.config.port);

        let stream = timeout(
            Duration::from_secs(self.config.timeout_secs as u64),
            TcpStream::connect(&addr),
        )
        .await
        .map_err(|_| AppError::Telnet(format!("Connection timed out after {}s", self.config.timeout_secs)))?
        .map_err(|e| AppError::Telnet(format!("Failed to connect to {}: {}", addr, e)))?;

        self.stream = Some(stream);
        Ok(())
    }

    pub async fn read(&mut self, buf: &mut [u8]) -> Result<usize, AppError> {
        let stream = self.stream.as_mut()
            .ok_or_else(|| AppError::Telnet("Not connected".into()))?;

        let n = stream.read(buf).await
            .map_err(|e| AppError::Telnet(format!("Read error: {}", e)))?;

        Ok(n)
    }

    pub async fn write(&mut self, data: &[u8]) -> Result<(), AppError> {
        let stream = self.stream.as_mut()
            .ok_or_else(|| AppError::Telnet("Not connected".into()))?;

        stream.write_all(data).await
            .map_err(|e| AppError::Telnet(format!("Write error: {}", e)))?;

        Ok(())
    }

    pub async fn send_window_size(&mut self, cols: u16, rows: u16) -> Result<(), AppError> {
        let stream = self.stream.as_mut()
            .ok_or_else(|| AppError::Telnet("Not connected".into()))?;

        // IAC SB NAWS <width-hi> <width-lo> <height-hi> <height-lo> IAC SE
        let msg = [
            IAC, SB, OPT_NAWS,
            (cols >> 8) as u8, (cols & 0xFF) as u8,
            (rows >> 8) as u8, (rows & 0xFF) as u8,
            IAC, SE,
        ];

        stream.write_all(&msg).await
            .map_err(|e| AppError::Telnet(format!("NAWS error: {}", e)))?;

        Ok(())
    }

    /// Process incoming telnet data, handling IAC sequences.
    /// Returns the clean data with IAC sequences removed.
    pub fn process_incoming(&self, raw: &[u8]) -> (Vec<u8>, Vec<TelnetNegotiation>) {
        let mut data = Vec::new();
        let mut negotiations = Vec::new();
        let mut i = 0;

        while i < raw.len() {
            if raw[i] == IAC && i + 1 < raw.len() {
                match raw[i + 1] {
                    IAC => {
                        // Escaped IAC — literal 0xFF
                        data.push(IAC);
                        i += 2;
                    }
                    WILL | WONT | DO | DONT if i + 2 < raw.len() => {
                        negotiations.push(TelnetNegotiation {
                            command: raw[i + 1],
                            option: raw[i + 2],
                        });
                        i += 3;
                    }
                    SB => {
                        // Skip sub-negotiation
                        let mut j = i + 2;
                        while j + 1 < raw.len() {
                            if raw[j] == IAC && raw[j + 1] == SE {
                                j += 2;
                                break;
                            }
                            j += 1;
                        }
                        i = j;
                    }
                    _ => {
                        i += 2; // Skip unknown command
                    }
                }
            } else {
                data.push(raw[i]);
                i += 1;
            }
        }

        (data, negotiations)
    }

    /// Generate response to telnet negotiations
    pub fn respond_to_negotiation(&self, neg: &TelnetNegotiation) -> Vec<u8> {
        match neg.command {
            DO => {
                match neg.option {
                    OPT_TERMINAL_TYPE | OPT_NAWS | OPT_SUPPRESS_GO_AHEAD => {
                        vec![IAC, WILL, neg.option]
                    }
                    _ => vec![IAC, WONT, neg.option],
                }
            }
            WILL => {
                match neg.option {
                    OPT_ECHO | OPT_SUPPRESS_GO_AHEAD => {
                        vec![IAC, DO, neg.option]
                    }
                    _ => vec![IAC, DONT, neg.option],
                }
            }
            _ => vec![],
        }
    }

    pub async fn disconnect(&mut self) -> Result<(), AppError> {
        if let Some(mut stream) = self.stream.take() {
            let _ = stream.shutdown().await;
        }
        Ok(())
    }
}

pub struct TelnetNegotiation {
    pub command: u8,
    pub option: u8,
}
