use crate::error::AppError;
use crate::models::SerialPortInfo;
use std::collections::HashSet;

#[tauri::command]
pub fn list_serial_ports() -> Result<Vec<SerialPortInfo>, AppError> {
    let mut ports = match serialport::available_ports() {
        Ok(ports) => ports
            .into_iter()
            .map(|port| SerialPortInfo {
                name: port.port_name,
                port_type: match port.port_type {
                    serialport::SerialPortType::UsbPort(info) => {
                        format!("USB ({})", info.product.unwrap_or_default())
                    }
                    serialport::SerialPortType::PciPort => "PCI".to_string(),
                    serialport::SerialPortType::BluetoothPort => "Bluetooth".to_string(),
                    serialport::SerialPortType::Unknown => "Unknown".to_string(),
                },
            })
            .collect(),
        Err(error) => {
            #[cfg(not(windows))]
            return Err(AppError::Serial(error.to_string()));

            #[cfg(windows)]
            {
                log::warn!("Native serial port discovery failed: {error}");
                Vec::new()
            }
        }
    };

    #[cfg(windows)]
    ports.extend(windows_registry_serial_ports()?);

    normalize_serial_ports(&mut ports);
    Ok(ports)
}

fn normalize_serial_ports(ports: &mut Vec<SerialPortInfo>) {
    let mut names = HashSet::new();
    ports.retain(|port| names.insert(port.name.to_ascii_lowercase()));
    ports.sort_by_key(|port| serial_port_sort_key(&port.name));
}

fn serial_port_sort_key(name: &str) -> (u8, u32, String) {
    let upper_name = name.to_ascii_uppercase();
    match upper_name
        .strip_prefix("COM")
        .and_then(|suffix| suffix.parse::<u32>().ok())
    {
        Some(number) => (0, number, upper_name),
        None => (1, u32::MAX, upper_name),
    }
}

#[cfg(windows)]
fn windows_registry_serial_ports() -> Result<Vec<SerialPortInfo>, AppError> {
    use std::io::ErrorKind;
    use winreg::enums::HKEY_LOCAL_MACHINE;
    use winreg::types::FromRegValue;
    use winreg::RegKey;

    let local_machine = RegKey::predef(HKEY_LOCAL_MACHINE);
    let key = match local_machine.open_subkey(r"HARDWARE\DEVICEMAP\SERIALCOMM") {
        Ok(key) => key,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(AppError::Serial(error.to_string())),
    };

    Ok(key
        .enum_values()
        .filter_map(Result::ok)
        .filter_map(|(_, value)| String::from_reg_value(&value).ok())
        .map(|name| SerialPortInfo {
            name,
            port_type: "Windows serial port".to_string(),
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn port(name: &str, port_type: &str) -> SerialPortInfo {
        SerialPortInfo {
            name: name.to_string(),
            port_type: port_type.to_string(),
        }
    }

    #[test]
    fn normalizes_duplicate_ports_and_sorts_com_numbers_naturally() {
        let mut ports = vec![
            port("COM10", "Windows serial port"),
            port("COM2", "USB"),
            port("com2", "Windows serial port"),
            port("ttyS0", "Unknown"),
            port("COM1", "PCI"),
        ];

        normalize_serial_ports(&mut ports);

        let names: Vec<_> = ports.iter().map(|port| port.name.as_str()).collect();
        assert_eq!(names, vec!["COM1", "COM2", "COM10", "ttyS0"]);
        assert_eq!(ports[1].port_type, "USB");
    }
}
