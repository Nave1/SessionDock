use std::path::PathBuf;
use std::process::Command;

use crate::error::AppError;

#[tauri::command]
pub fn launch_vnc_viewer(host: String, port: u16) -> Result<(), AppError> {
    let endpoint = vnc_endpoint(&host, port)?;
    let executable = find_vnc_viewer().ok_or_else(|| AppError::Generic(
        "RealVNC Viewer was not found. Install VNC Viewer from realvnc.com, then try again."
            .to_string(),
    ))?;

    Command::new(&executable)
        .arg(endpoint)
        .spawn()
        .map_err(|error| AppError::Generic(format!(
            "Failed to launch RealVNC Viewer at {}: {error}",
            executable.display(),
        )))?;
    Ok(())
}

fn vnc_endpoint(host: &str, port: u16) -> Result<String, AppError> {
    let host = host.trim();
    if host.is_empty()
        || host.starts_with('-')
        || host.chars().any(|character| character.is_control() || character.is_whitespace())
    {
        return Err(AppError::Generic("Enter a valid VNC hostname or IP address.".to_string()));
    }
    if port == 0 {
        return Err(AppError::Generic("VNC port must be between 1 and 65535.".to_string()));
    }

    let formatted_host = if host.contains(':') && !(host.starts_with('[') && host.ends_with(']')) {
        format!("[{host}]")
    } else {
        host.to_string()
    };
    Ok(format!("{formatted_host}::{port}"))
}

fn find_vnc_viewer() -> Option<PathBuf> {
    let mut candidates = Vec::new();
    for variable in ["ProgramFiles", "ProgramFiles(x86)"] {
        if let Some(root) = std::env::var_os(variable) {
            candidates.push(PathBuf::from(root).join("RealVNC/VNC Viewer/vncviewer.exe"));
        }
    }
    candidates.into_iter().find(|path| path.is_file()).or_else(|| {
        std::env::var_os("PATH").and_then(|path| {
            std::env::split_paths(&path)
                .map(|directory| directory.join("vncviewer.exe"))
                .find(|candidate| candidate.is_file())
        })
    })
}

#[cfg(test)]
mod tests {
    use super::vnc_endpoint;

    #[test]
    fn formats_vnc_endpoints_without_exposing_credentials() {
        assert_eq!(vnc_endpoint("vm.example", 5900).unwrap(), "vm.example::5900");
        assert_eq!(vnc_endpoint("2001:db8::10", 5901).unwrap(), "[2001:db8::10]::5901");
    }

    #[test]
    fn rejects_option_like_or_empty_hosts() {
        assert!(vnc_endpoint("", 5900).is_err());
        assert!(vnc_endpoint("--help", 5900).is_err());
        assert!(vnc_endpoint("bad host", 5900).is_err());
        assert!(vnc_endpoint("vm.example", 0).is_err());
    }
}