use crate::error::AppError;
use crate::models::SerialPortInfo;

#[tauri::command]
pub fn list_serial_ports() -> Result<Vec<SerialPortInfo>, AppError> {
    let ports = serialport::available_ports()
        .map_err(|e| AppError::Serial(e.to_string()))?;

    Ok(ports
        .into_iter()
        .map(|p| SerialPortInfo {
            name: p.port_name,
            port_type: match p.port_type {
                serialport::SerialPortType::UsbPort(info) => {
                    format!("USB ({})", info.product.unwrap_or_default())
                }
                serialport::SerialPortType::PciPort => "PCI".to_string(),
                serialport::SerialPortType::BluetoothPort => "Bluetooth".to_string(),
                serialport::SerialPortType::Unknown => "Unknown".to_string(),
            },
        })
        .collect())
}
