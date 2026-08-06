use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub protocol: Protocol,
    pub username: Option<String>,
    pub credential_profile_id: Option<String>,
    pub authentication_method: AuthMethod,
    pub private_key_reference: Option<String>,
    pub folder_id: Option<String>,
    pub device_type: Option<String>,
    pub vendor: Option<String>,
    pub model: Option<String>,
    pub description: Option<String>,
    pub notes: Option<String>,
    pub favorite: bool,
    pub startup_command: Option<String>,
    pub connection_timeout: u32,
    pub keepalive_interval: u32,
    pub terminal_profile_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub last_connected_at: Option<String>,
    pub connection_count: u32,
    pub bmc_use_https: bool,
    pub bmc_web_path: Option<String>,
    pub bmc_console_url: Option<String>,
    pub bmc_viewer_mode: BmcViewerMode,
    pub bmc_ignore_tls_errors: bool,
    pub bmc_open_console_automatically: bool,
    pub bmc_open_fullscreen: bool,
    pub bmc_timeout_seconds: u32,
    pub bmc_server_hostname: Option<String>,
    pub bmc_server_serial_number: Option<String>,
    pub bmc_rack: Option<String>,
    pub bmc_rack_unit: Option<String>,
    pub bmc_site: Option<String>,
    pub bmc_redfish_enabled: bool,
    pub bmc_cookie_persistence: BmcCookiePersistence,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateSessionRequest {
    pub name: String,
    pub host: String,
    pub port: u16,
    pub protocol: Protocol,
    pub username: Option<String>,
    pub credential_profile_id: Option<String>,
    pub authentication_method: AuthMethod,
    pub private_key_reference: Option<String>,
    pub folder_id: Option<String>,
    pub device_type: Option<String>,
    pub vendor: Option<String>,
    pub model: Option<String>,
    pub description: Option<String>,
    pub notes: Option<String>,
    pub favorite: bool,
    pub startup_command: Option<String>,
    pub connection_timeout: Option<u32>,
    pub keepalive_interval: Option<u32>,
    pub terminal_profile_id: Option<String>,
    pub tags: Option<Vec<String>>,
    pub bmc_use_https: Option<bool>,
    pub bmc_web_path: Option<String>,
    pub bmc_console_url: Option<String>,
    pub bmc_viewer_mode: Option<BmcViewerMode>,
    pub bmc_ignore_tls_errors: Option<bool>,
    pub bmc_open_console_automatically: Option<bool>,
    pub bmc_open_fullscreen: Option<bool>,
    pub bmc_timeout_seconds: Option<u32>,
    pub bmc_server_hostname: Option<String>,
    pub bmc_server_serial_number: Option<String>,
    pub bmc_rack: Option<String>,
    pub bmc_rack_unit: Option<String>,
    pub bmc_site: Option<String>,
    pub bmc_redfish_enabled: Option<bool>,
    pub bmc_cookie_persistence: Option<BmcCookiePersistence>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateSessionRequest {
    pub id: String,
    pub name: Option<String>,
    pub host: Option<String>,
    pub port: Option<u16>,
    pub protocol: Option<Protocol>,
    pub username: Option<String>,
    pub credential_profile_id: Option<String>,
    pub authentication_method: Option<AuthMethod>,
    pub folder_id: Option<String>,
    pub clear_folder: Option<bool>,
    pub device_type: Option<String>,
    pub vendor: Option<String>,
    pub model: Option<String>,
    pub description: Option<String>,
    pub notes: Option<String>,
    pub favorite: Option<bool>,
    pub tags: Option<Vec<String>>,
    pub bmc_use_https: Option<bool>,
    pub bmc_web_path: Option<String>,
    pub bmc_console_url: Option<String>,
    pub bmc_viewer_mode: Option<BmcViewerMode>,
    pub bmc_ignore_tls_errors: Option<bool>,
    pub bmc_open_console_automatically: Option<bool>,
    pub bmc_open_fullscreen: Option<bool>,
    pub bmc_timeout_seconds: Option<u32>,
    pub bmc_server_hostname: Option<String>,
    pub bmc_server_serial_number: Option<String>,
    pub bmc_rack: Option<String>,
    pub bmc_rack_unit: Option<String>,
    pub bmc_site: Option<String>,
    pub bmc_redfish_enabled: Option<bool>,
    pub bmc_cookie_persistence: Option<BmcCookiePersistence>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Protocol {
    Ssh,
    Telnet,
    Serial,
    Bmc,
    Vnc,
}

impl Protocol {
    pub fn as_str(&self) -> &str {
        match self {
            Protocol::Ssh => "ssh",
            Protocol::Telnet => "telnet",
            Protocol::Serial => "serial",
            Protocol::Bmc => "bmc",
            Protocol::Vnc => "vnc",
        }
    }

    pub fn from_str(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "ssh" => Protocol::Ssh,
            "telnet" => Protocol::Telnet,
            "serial" => Protocol::Serial,
            "bmc" => Protocol::Bmc,
            "vnc" => Protocol::Vnc,
            _ => Protocol::Ssh,
        }
    }

    pub fn default_port(&self) -> u16 {
        match self {
            Protocol::Ssh => 22,
            Protocol::Telnet => 23,
            Protocol::Serial => 0,
            Protocol::Bmc => 443,
            Protocol::Vnc => 5900,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum BmcViewerMode {
    Web,
    ExternalBrowser,
    Vnc,
}

impl BmcViewerMode {
    pub fn as_str(&self) -> &str {
        match self {
            Self::Web => "web",
            Self::ExternalBrowser => "external-browser",
            Self::Vnc => "vnc",
        }
    }

    pub fn from_str(value: &str) -> Self {
        match value {
            "external-browser" => Self::ExternalBrowser,
            "vnc" => Self::Vnc,
            _ => Self::Web,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum BmcCookiePersistence {
    Tab,
    Application,
    Persistent,
}

impl BmcCookiePersistence {
    pub fn as_str(&self) -> &str {
        match self {
            Self::Tab => "tab",
            Self::Application => "application",
            Self::Persistent => "persistent",
        }
    }

    pub fn from_str(value: &str) -> Self {
        match value {
            "tab" => Self::Tab,
            "persistent" => Self::Persistent,
            _ => Self::Application,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AuthMethod {
    Password,
    PrivateKey,
    SshAgent,
    Manual,
}

impl AuthMethod {
    pub fn as_str(&self) -> &str {
        match self {
            AuthMethod::Password => "password",
            AuthMethod::PrivateKey => "private_key",
            AuthMethod::SshAgent => "ssh_agent",
            AuthMethod::Manual => "manual",
        }
    }

    pub fn from_str(s: &str) -> Self {
        match s {
            "password" => AuthMethod::Password,
            "private_key" => AuthMethod::PrivateKey,
            "ssh_agent" => AuthMethod::SshAgent,
            "manual" => AuthMethod::Manual,
            _ => AuthMethod::Password,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Folder {
    pub id: String,
    pub name: String,
    pub parent_id: Option<String>,
    pub sort_order: i32,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateFolderRequest {
    pub name: String,
    pub parent_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CredentialProfile {
    pub id: String,
    pub name: String,
    pub username: String,
    pub authentication_method: AuthMethod,
    pub vault_reference: String,
    pub description: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateCredentialRequest {
    pub name: String,
    pub username: String,
    pub authentication_method: AuthMethod,
    pub password: Option<String>,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tag {
    pub id: String,
    pub name: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub session: Session,
    pub folder_path: Option<String>,
    pub tags: Vec<String>,
    pub rank: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SerialPortInfo {
    pub name: String,
    pub port_type: String,
}
