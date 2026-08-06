export type Protocol = "ssh" | "telnet" | "serial" | "bmc" | "vnc";
export type BmcViewerMode = "web" | "external-browser" | "vnc";
export type BmcCookiePersistence = "tab" | "application" | "persistent";

export interface BmcSessionConfig {
  bmc_use_https: boolean;
  bmc_web_path?: string;
  bmc_console_url?: string;
  bmc_viewer_mode: BmcViewerMode;
  bmc_ignore_tls_errors: boolean;
  bmc_open_console_automatically: boolean;
  bmc_open_fullscreen: boolean;
  bmc_timeout_seconds: number;
  bmc_server_hostname?: string;
  bmc_server_serial_number?: string;
  bmc_rack?: string;
  bmc_rack_unit?: string;
  bmc_site?: string;
  bmc_redfish_enabled: boolean;
  bmc_cookie_persistence: BmcCookiePersistence;
}

export interface Session extends BmcSessionConfig {
  id: string;
  name: string;
  host: string;
  port: number;
  protocol: Protocol;
  username?: string;
  credential_profile_id?: string;
  authentication_method: "password" | "private_key" | "ssh_agent" | "manual";
  private_key_reference?: string;
  folder_id?: string;
  device_type?: string;
  vendor?: string;
  model?: string;
  description?: string;
  notes?: string;
  favorite: boolean;
  startup_command?: string;
  connection_timeout: number;
  keepalive_interval: number;
  terminal_profile_id?: string;
  created_at: string;
  updated_at: string;
  last_connected_at?: string;
  connection_count: number;
}

export interface CreateSessionRequest extends Partial<BmcSessionConfig> {
  name: string;
  host: string;
  port: number;
  protocol: Protocol;
  username?: string;
  credential_profile_id?: string;
  authentication_method: "password" | "private_key" | "ssh_agent" | "manual";
  private_key_reference?: string;
  folder_id?: string;
  device_type?: string;
  vendor?: string;
  model?: string;
  description?: string;
  notes?: string;
  favorite: boolean;
  startup_command?: string;
  connection_timeout?: number;
  keepalive_interval?: number;
  terminal_profile_id?: string;
  tags?: string[];
}

export interface Folder {
  id: string;
  name: string;
  parent_id?: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface CreateFolderRequest {
  name: string;
  parent_id?: string;
}

export interface CredentialProfile {
  id: string;
  name: string;
  username: string;
  authentication_method: "password" | "private_key" | "ssh_agent" | "manual";
  vault_reference: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface Tag {
  id: string;
  name: string;
  created_at: string;
}

export interface SearchResult {
  session: Session;
  folder_path?: string;
  tags: string[];
  rank: number;
}

export interface SerialPortInfo {
  name: string;
  port_type: string;
}

export interface TerminalProfile {
  id: string;
  name: string;
  font_family: string;
  font_size: number;
  line_height: number;
  theme: string;
  cursor_style: "block" | "underline" | "bar";
  cursor_blink: boolean;
  scrollback_limit: number;
}
