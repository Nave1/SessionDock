import type { Session, Folder } from "../types";
import { nativeInvoke } from "../api/native";
import { safePersistedBmcUrl } from "./bmcUrl";

export interface SafeExportData {
  version: "1.0";
  exported_at: string;
  application: "SessionDock";
  contains_credentials: false;
  sessions: SafeExportSession[];
  folders: Folder[];
  tags: string[];
}

export interface SafeExportSession {
  name: string;
  host: string;
  port: number;
  protocol: string;
  username?: string;
  authentication_method: string;
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
  tags: string[];
  bmc_use_https?: boolean;
  bmc_web_path?: string;
  bmc_console_url?: string;
  bmc_viewer_mode?: Session["bmc_viewer_mode"];
  bmc_open_console_automatically?: boolean;
  bmc_open_fullscreen?: boolean;
  bmc_timeout_seconds?: number;
  bmc_server_hostname?: string;
  bmc_server_serial_number?: string;
  bmc_rack?: string;
  bmc_rack_unit?: string;
  bmc_site?: string;
  bmc_redfish_enabled?: boolean;
  bmc_cookie_persistence?: Session["bmc_cookie_persistence"];
}

/**
 * Create a safe JSON export (no credentials, no secrets)
 */
export function createSafeExport(
  sessions: Session[],
  folders: Folder[],
  sessionTags: Map<string, string[]>,
): SafeExportData {
  const allTags = new Set<string>();
  sessionTags.forEach((tags) => tags.forEach((t) => allTags.add(t)));

  return {
    version: "1.0",
    exported_at: new Date().toISOString(),
    application: "SessionDock",
    contains_credentials: false,
    sessions: sessions.map((s) => ({
      name: s.name,
      host: s.host,
      port: s.port,
      protocol: s.protocol,
      username: s.username,
      authentication_method: s.authentication_method,
      folder_id: s.folder_id,
      device_type: s.device_type,
      vendor: s.vendor,
      model: s.model,
      description: s.description,
      notes: s.notes,
      favorite: s.favorite,
      startup_command: s.startup_command,
      connection_timeout: s.connection_timeout,
      keepalive_interval: s.keepalive_interval,
      tags: sessionTags.get(s.id) || [],
      bmc_use_https: s.protocol === "bmc" ? s.bmc_use_https : undefined,
      bmc_web_path: s.protocol === "bmc" ? s.bmc_web_path : undefined,
      bmc_console_url: s.protocol === "bmc" ? safePersistedBmcUrl(s.bmc_console_url) : undefined,
      bmc_viewer_mode: s.protocol === "bmc" ? s.bmc_viewer_mode : undefined,
      bmc_open_console_automatically: s.protocol === "bmc" ? s.bmc_open_console_automatically : undefined,
      bmc_open_fullscreen: s.protocol === "bmc" ? s.bmc_open_fullscreen : undefined,
      bmc_timeout_seconds: s.protocol === "bmc" ? s.bmc_timeout_seconds : undefined,
      bmc_server_hostname: s.protocol === "bmc" ? s.bmc_server_hostname : undefined,
      bmc_server_serial_number: s.protocol === "bmc" ? s.bmc_server_serial_number : undefined,
      bmc_rack: s.protocol === "bmc" ? s.bmc_rack : undefined,
      bmc_rack_unit: s.protocol === "bmc" ? s.bmc_rack_unit : undefined,
      bmc_site: s.protocol === "bmc" ? s.bmc_site : undefined,
      bmc_redfish_enabled: s.protocol === "bmc" ? s.bmc_redfish_enabled : undefined,
      bmc_cookie_persistence: s.protocol === "bmc" ? s.bmc_cookie_persistence : undefined,
    })),
    folders,
    tags: Array.from(allTags),
  };
}

/**
 * Create CSV export of non-secret session data
 */
export function createCsvExport(sessions: Session[]): string {
  const headers = [
    "Name", "Host", "Port", "Protocol", "Username",
    "Device Type", "Vendor", "Model", "Description", "Favorite",
    "BMC HTTPS", "BMC Web Path", "BMC Console URL", "BMC Viewer Mode",
    "BMC Server Hostname", "BMC Serial Number", "BMC Site", "BMC Rack", "BMC Rack Unit",
  ];

  const rows = sessions.map((s) => [
    escapeCsv(s.name),
    escapeCsv(s.host),
    String(s.port),
    s.protocol,
    escapeCsv(s.username || ""),
    escapeCsv(s.device_type || ""),
    escapeCsv(s.vendor || ""),
    escapeCsv(s.model || ""),
    escapeCsv(s.description || ""),
    s.favorite ? "Yes" : "No",
    s.protocol === "bmc" && s.bmc_use_https ? "Yes" : "No",
    escapeCsv(s.protocol === "bmc" ? s.bmc_web_path || "" : ""),
    escapeCsv(s.protocol === "bmc" ? safePersistedBmcUrl(s.bmc_console_url) || "" : ""),
    s.protocol === "bmc" ? s.bmc_viewer_mode : "",
    escapeCsv(s.protocol === "bmc" ? s.bmc_server_hostname || "" : ""),
    escapeCsv(s.protocol === "bmc" ? s.bmc_server_serial_number || "" : ""),
    escapeCsv(s.protocol === "bmc" ? s.bmc_site || "" : ""),
    escapeCsv(s.protocol === "bmc" ? s.bmc_rack || "" : ""),
    escapeCsv(s.protocol === "bmc" ? s.bmc_rack_unit || "" : ""),
  ]);

  return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
}

function escapeCsv(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Parse CSV import data
 */
export function parseCsvImport(csv: string): Partial<Session>[] {
  const lines = csv.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const sessions: Partial<Session>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const session: Partial<Session> = {};

    headers.forEach((header, index) => {
      const value = values[index]?.trim();
      if (!value) return;

      switch (header) {
        case "name": session.name = value; break;
        case "host": session.host = value; break;
        case "port": session.port = parseInt(value) || 22; break;
        case "protocol":
          if (["ssh", "telnet", "serial", "bmc"].includes(value.toLowerCase())) {
            session.protocol = value.toLowerCase() as Session["protocol"];
          }
          break;
        case "username": session.username = value; break;
        case "device type": session.device_type = value; break;
        case "vendor": session.vendor = value; break;
        case "model": session.model = value; break;
        case "description": session.description = value; break;
        case "favorite": session.favorite = value.toLowerCase() === "yes"; break;
        case "bmc https": session.bmc_use_https = value.toLowerCase() === "yes"; break;
        case "bmc web path": session.bmc_web_path = value; break;
        case "bmc console url": session.bmc_console_url = safePersistedBmcUrl(value); break;
        case "bmc viewer mode":
          if (["web", "external-browser", "vnc"].includes(value)) {
            session.bmc_viewer_mode = value as Session["bmc_viewer_mode"];
          }
          break;
        case "bmc server hostname": session.bmc_server_hostname = value; break;
        case "bmc serial number": session.bmc_server_serial_number = value; break;
        case "bmc site": session.bmc_site = value; break;
        case "bmc rack": session.bmc_rack = value; break;
        case "bmc rack unit": session.bmc_rack_unit = value; break;
      }
    });

    if (session.name) sessions.push(session);
  }

  return sessions;
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

/**
 * Parse JSON import data
 */
export function parseJsonImport(json: string): SafeExportData | null {
  try {
    const data = JSON.parse(json);
    if (data.application === "SessionDock" && data.version) {
      return data as SafeExportData;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Download data as a file
 */
export async function saveTextFile(
  content: string,
  defaultPath: string,
  name: string,
  extensions: string[],
): Promise<string | null> {
  const { save } = await import("@tauri-apps/plugin-dialog");
  const path = await save({ defaultPath, filters: [{ name, extensions }] });
  if (!path) return null;
  await nativeInvoke("write_text_file_to_path", { path, content });
  return path;
}

export async function openTextFile(name: string, extensions: string[]): Promise<{ path: string; content: string } | null> {
  const { open } = await import("@tauri-apps/plugin-dialog");
  const path = await open({ multiple: false, directory: false, filters: [{ name, extensions }] });
  if (!path) return null;
  return { path, content: await nativeInvoke<string>("read_text_file_from_path", { path }) };
}
