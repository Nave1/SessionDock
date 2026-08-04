import { beforeEach, describe, it, expect, vi } from "vitest";
import { createCsvExport, parseCsvImport, createSafeExport, openTextFile, parseJsonImport, saveTextFile } from "../utils/importExport";
import type { Session, Folder } from "../types";

const fileMocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  open: vi.fn(),
  save: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: fileMocks.invoke }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: fileMocks.open, save: fileMocks.save }));

beforeEach(() => {
  vi.clearAllMocks();
});

const mockSession: Session = {
  id: "test-1",
  name: "Core-Switch-01",
  host: "192.168.1.1",
  port: 22,
  protocol: "ssh",
  username: "admin",
  authentication_method: "password",
  favorite: true,
  connection_timeout: 30,
  keepalive_interval: 60,
  connection_count: 5,
  device_type: "Switch",
  vendor: "Cisco",
  model: "C9300",
  description: "Main distribution switch",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  last_connected_at: "2026-07-01T00:00:00Z",
  bmc_use_https: true,
  bmc_viewer_mode: "web",
  bmc_ignore_tls_errors: false,
  bmc_open_console_automatically: false,
  bmc_open_fullscreen: false,
  bmc_timeout_seconds: 30,
  bmc_redfish_enabled: true,
  bmc_cookie_persistence: "application",
};

const mockFolder: Folder = {
  id: "folder-1",
  name: "Data Center",
  sort_order: 0,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("CSV Export", () => {
  it("creates valid CSV with headers", () => {
    const csv = createCsvExport([mockSession]);
    const lines = csv.split("\n");
    expect(lines[0]).toContain("Name");
    expect(lines[0]).toContain("Host");
    expect(lines[0]).toContain("Protocol");
    expect(lines.length).toBe(2);
  });

  it("does not include passwords", () => {
    const csv = createCsvExport([mockSession]);
    expect(csv.toLowerCase()).not.toContain("password");
    // Should not have credential_profile_id or vault references
    expect(csv).not.toContain("credential_profile_id");
  });

  it("escapes commas in values", () => {
    const session = { ...mockSession, description: "Has, comma" };
    const csv = createCsvExport([session]);
    expect(csv).toContain('"Has, comma"');
  });

  it("omits a BMC console URL containing a ticket", () => {
    const bmc = { ...mockSession, protocol: "bmc" as const, bmc_console_url: "https://bmc.lab/console?ticket=secret" };
    expect(createCsvExport([bmc])).not.toContain("secret");
    expect(createSafeExport([bmc], [], new Map()).sessions[0].bmc_console_url).toBeUndefined();
  });
});

describe("CSV Import", () => {
  it("parses CSV correctly", () => {
    const csv = "Name,Host,Port,Protocol,Username\nSwitch-01,10.0.0.1,22,ssh,admin";
    const sessions = parseCsvImport(csv);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].name).toBe("Switch-01");
    expect(sessions[0].host).toBe("10.0.0.1");
    expect(sessions[0].port).toBe(22);
    expect(sessions[0].protocol).toBe("ssh");
  });

  it("handles empty CSV", () => {
    expect(parseCsvImport("")).toHaveLength(0);
    expect(parseCsvImport("Name,Host\n")).toHaveLength(0);
  });

  it("handles quoted fields", () => {
    const csv = 'Name,Host,Description\n"Switch, Main","10.0.0.1","A ""special"" device"';
    const sessions = parseCsvImport(csv);
    expect(sessions[0].name).toBe("Switch, Main");
    expect(sessions[0].description).toBe('A "special" device');
  });
});

describe("JSON Export", () => {
  it("creates safe export without credentials", () => {
    const tags = new Map<string, string[]>();
    tags.set("test-1", ["production", "datacenter"]);

    const exported = createSafeExport([mockSession], [mockFolder], tags);

    expect(exported.version).toBe("1.0");
    expect(exported.application).toBe("SessionDock");
    expect(exported.contains_credentials).toBe(false);
    expect(exported.sessions).toHaveLength(1);
    expect(exported.folders).toHaveLength(1);
    expect(exported.tags).toContain("production");
  });

  it("excludes IDs from exported sessions", () => {
    const tags = new Map<string, string[]>();
    const exported = createSafeExport([mockSession], [], tags);
    const session = exported.sessions[0];
    // The exported session should not have an 'id' field
    expect("id" in session).toBe(false);
  });

  it("excludes credential_profile_id", () => {
    const sessionWithCred = { ...mockSession, credential_profile_id: "cred-123" };
    const tags = new Map<string, string[]>();
    const exported = createSafeExport([sessionWithCred], [], tags);
    expect(JSON.stringify(exported)).not.toContain("cred-123");
  });
});

describe("JSON Import", () => {
  it("parses valid SessionDock export", () => {
    const data = {
      version: "1.0",
      application: "SessionDock",
      exported_at: "2026-01-01",
      contains_credentials: false,
      sessions: [],
      folders: [],
      tags: [],
    };
    const result = parseJsonImport(JSON.stringify(data));
    expect(result).not.toBeNull();
    expect(result?.application).toBe("SessionDock");
  });

  it("rejects invalid JSON", () => {
    expect(parseJsonImport("not json")).toBeNull();
    expect(parseJsonImport('{"foo": "bar"}')).toBeNull();
  });
});

describe("Native file dialogs", () => {
  it("writes the selected save path through the native command", async () => {
    fileMocks.save.mockResolvedValue("C:\\Exports\\sessions.json");
    fileMocks.invoke.mockResolvedValue(undefined);

    await expect(saveTextFile("export data", "sessions.json", "JSON", ["json"]))
      .resolves.toBe("C:\\Exports\\sessions.json");
    expect(fileMocks.invoke).toHaveBeenCalledWith("write_text_file_to_path", {
      path: "C:\\Exports\\sessions.json",
      content: "export data",
    });
  });

  it("reads the selected open path through the native command", async () => {
    fileMocks.open.mockResolvedValue("C:\\Exports\\sessions.json");
    fileMocks.invoke.mockResolvedValue("import data");

    await expect(openTextFile("JSON", ["json"])).resolves.toEqual({
      path: "C:\\Exports\\sessions.json",
      content: "import data",
    });
    expect(fileMocks.invoke).toHaveBeenCalledWith("read_text_file_from_path", {
      path: "C:\\Exports\\sessions.json",
    });
  });
});
