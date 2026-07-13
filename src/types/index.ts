export interface Session {
  id: string;
  name: string;
  host: string;
  port: number;
  protocol: "ssh" | "telnet" | "serial";
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

export interface CreateSessionRequest {
  name: string;
  host: string;
  port: number;
  protocol: "ssh" | "telnet" | "serial";
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
