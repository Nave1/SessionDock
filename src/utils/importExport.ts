import type { Session, Folder } from "../types";

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
        case "protocol": session.protocol = value as Session["protocol"]; break;
        case "username": session.username = value; break;
        case "device type": session.device_type = value; break;
        case "vendor": session.vendor = value; break;
        case "model": session.model = value; break;
        case "description": session.description = value; break;
        case "favorite": session.favorite = value.toLowerCase() === "yes"; break;
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
export function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
