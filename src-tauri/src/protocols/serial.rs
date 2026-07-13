// Serial protocol implementation using the serialport crate

use std::io::{Read, Write};
use std::time::Duration;

use crate::error::AppError;

pub struct SerialConfig {
    pub port_name: String,
    pub baud_rate: u32,
    pub data_bits: u8,
    pub stop_bits: u8,
    pub parity: String,
    pub flow_control: String,
}

pub struct SerialSession {
    config: SerialConfig,
    port: Option<Box<dyn serialport::SerialPort>>,
}

impl SerialSession {
    pub fn new(config: SerialConfig) -> Self {
        Self {
            config,
            port: None,
        }
    }

    pub fn connect(&mut self) -> Result<(), AppError> {
        let data_bits = match self.config.data_bits {
            5 => serialport::DataBits::Five,
            6 => serialport::DataBits::Six,
            7 => serialport::DataBits::Seven,
            8 => serialport::DataBits::Eight,
            _ => serialport::DataBits::Eight,
        };

        let stop_bits = match self.config.stop_bits {
            1 => serialport::StopBits::One,
            2 => serialport::StopBits::Two,
            _ => serialport::StopBits::One,
        };

        let parity = match self.config.parity.to_lowercase().as_str() {
            "none" => serialport::Parity::None,
            "odd" => serialport::Parity::Odd,
            "even" => serialport::Parity::Even,
            _ => serialport::Parity::None,
        };

        let flow_control = match self.config.flow_control.to_lowercase().as_str() {
            "none" => serialport::FlowControl::None,
            "hardware" | "rtscts" => serialport::FlowControl::Hardware,
            "software" | "xonxoff" => serialport::FlowControl::Software,
            _ => serialport::FlowControl::None,
        };

        let port = serialport::new(&self.config.port_name, self.config.baud_rate)
            .data_bits(data_bits)
            .stop_bits(stop_bits)
            .parity(parity)
            .flow_control(flow_control)
            .timeout(Duration::from_millis(100))
            .open()
            .map_err(|e| {
                let msg = match e.kind() {
                    serialport::ErrorKind::NoDevice => {
                        format!("Serial port '{}' not found", self.config.port_name)
                    }
                    serialport::ErrorKind::InvalidInput => {
                        format!("Invalid serial configuration: {}", e)
                    }
                    serialport::ErrorKind::Io(io_kind) => match io_kind {
                        std::io::ErrorKind::PermissionDenied => {
                            format!("Permission denied for port '{}'. The port may be in use.", self.config.port_name)
                        }
                        _ => format!("IO error opening port: {}", e),
                    },
                    _ => format!("Failed to open serial port: {}", e),
                };
                AppError::Serial(msg)
            })?;

        self.port = Some(port);
        Ok(())
    }

    pub fn read(&mut self, buf: &mut [u8]) -> Result<usize, AppError> {
        let port = self.port.as_mut()
            .ok_or_else(|| AppError::Serial("Not connected".into()))?;

        match port.read(buf) {
            Ok(n) => Ok(n),
            Err(ref e) if e.kind() == std::io::ErrorKind::TimedOut => Ok(0),
            Err(e) => Err(AppError::Serial(format!("Read error: {}", e))),
        }
    }

    pub fn write(&mut self, data: &[u8]) -> Result<(), AppError> {
        let port = self.port.as_mut()
            .ok_or_else(|| AppError::Serial("Not connected".into()))?;

        port.write_all(data)
            .map_err(|e| AppError::Serial(format!("Write error: {}", e)))?;

        port.flush()
            .map_err(|e| AppError::Serial(format!("Flush error: {}", e)))?;

        Ok(())
    }

    pub fn disconnect(&mut self) -> Result<(), AppError> {
        self.port = None;
        Ok(())
    }

    pub fn is_connected(&self) -> bool {
        self.port.is_some()
    }
}
