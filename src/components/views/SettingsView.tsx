import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useThemeStore, ThemeMode, AccentColor } from "../../stores/themeStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useAppVersion } from "../../hooks/useAppVersion";
import { useSessionStore } from "../../stores/sessionStore";
import { useToastStore } from "../../stores/toastStore";
import {
  clearRecentSessions,
  createFolder,
  createSession,
  getFolders,
  getSessions,
  resetApplicationData,
} from "../../api/commands";
import { createCsvExport, createSafeExport, importFolderHierarchy, openTextFile, parseCsvImportData, parseJsonImport, saveTextFile, type SafeExportData, type SafeExportSession } from "../../utils/importExport";
import { decryptBackup, encryptBackup } from "../../utils/encryptedBackup";
import { safePersistedBmcUrl } from "../../utils/bmcUrl";
import type { CreateSessionRequest, Session } from "../../types";
import {
  Settings as SettingsIcon,
  Monitor,
  Palette,
  Terminal,
  Shield,
  Database,
  Info,
  Globe,
} from "lucide-react";

type SettingsTab = "general" | "appearance" | "terminal" | "ssh" | "security" | "data" | "about";

export function SettingsView() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");

  const tabs: { id: SettingsTab; icon: typeof Monitor; label: string }[] = [
    { id: "general", icon: SettingsIcon, label: t("settings.general") },
    { id: "appearance", icon: Palette, label: t("settings.appearance") },
    { id: "terminal", icon: Terminal, label: t("settings.terminal") },
    { id: "ssh", icon: Globe, label: t("settings.ssh") },
    { id: "security", icon: Shield, label: t("settings.security") },
    { id: "data", icon: Database, label: t("settings.data") },
    { id: "about", icon: Info, label: t("settings.about") },
  ];

  return (
    <div className="flex h-full">
      {/* Settings nav */}
      <div className="w-48 border-r border-dock-border py-4 space-y-0.5">
        {tabs.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`w-full flex items-center gap-2 px-4 py-2 text-xs transition-colors ${
              activeTab === id
                ? "bg-dock-accent/15 text-dock-accent border-r-2 border-dock-accent"
                : "text-dock-text-muted hover:text-dock-text hover:bg-dock-surface"
            }`}
          >
            <Icon size={14} />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* Settings content */}
      <div className="flex-1 overflow-y-auto p-6">
        <h2 className="text-lg font-semibold text-dock-text mb-6">
          {tabs.find((t) => t.id === activeTab)?.label}
        </h2>

        {activeTab === "general" && <GeneralSettings />}
        {activeTab === "appearance" && <AppearanceSettings />}
        {activeTab === "terminal" && <TerminalSettings />}
        {activeTab === "ssh" && <SshSettings />}
        {activeTab === "about" && <AboutSettings />}
        {activeTab === "security" && <SecuritySettings />}
        {activeTab === "data" && <DataSettings />}
      </div>
    </div>
  );
}

function GeneralSettings() {
  const s = useSettingsStore();
  return (
    <div className="space-y-6 max-w-lg">
      <SettingGroup title="Startup">
        <LiveToggle label="Restore open tabs on restart" checked={s.restoreTabs} onChange={(v) => s.updateSetting("restoreTabs", v)} />
        <LiveToggle label="Confirm before closing active sessions" checked={s.confirmCloseActive} onChange={(v) => s.updateSetting("confirmCloseActive", v)} />
        <LiveToggle label="Start minimized" checked={s.startMinimized} onChange={(v) => s.updateSetting("startMinimized", v)} />
      </SettingGroup>
      <SettingGroup title="Defaults">
        <LiveSelect label="Default protocol" options={["SSH", "Telnet", "Serial"]} value={s.defaultProtocol} onChange={(v) => s.updateSetting("defaultProtocol", v)} />
        <LiveInput label="Default SSH port" value={String(s.defaultSshPort)} type="number" onChange={(v) => s.updateSetting("defaultSshPort", parseInt(v) || 22)} />
        <LiveInput label="Default Telnet port" value={String(s.defaultTelnetPort)} type="number" onChange={(v) => s.updateSetting("defaultTelnetPort", parseInt(v) || 23)} />
      </SettingGroup>
      <SettingGroup title="Language">
        <LiveSelect label="Language" options={["English", "עברית"]} value={s.language} onChange={(v) => s.updateSetting("language", v)} />
      </SettingGroup>
    </div>
  );
}

function AppearanceSettings() {
  const { mode, setMode, accent, setAccent } = useThemeStore();
  const s = useSettingsStore();

  return (
    <div className="space-y-6 max-w-lg">
      <SettingGroup title="Theme">
        <div className="flex items-center justify-between">
          <span className="text-xs text-dock-text-muted">Mode</span>
          <div className="flex gap-1">
            {(["dark", "light", "system"] as ThemeMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-3 py-1.5 rounded text-xs capitalize transition-colors ${
                  mode === m
                    ? "bg-dock-accent text-white"
                    : "bg-dock-surface text-dock-text-muted hover:text-dock-text"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-dock-text-muted">Accent color</span>
          <div className="flex gap-1">
            {(["Blue", "Cyan", "Green", "Purple", "Orange"] as AccentColor[]).map((c) => (
              <button
                key={c}
                onClick={() => setAccent(c)}
                className={`w-6 h-6 rounded-full border-2 transition-all ${
                  accent === c ? "border-dock-text scale-110" : "border-transparent"
                }`}
                style={{ backgroundColor: c === "Blue" ? "#5b8af5" : c === "Cyan" ? "#7dcfff" : c === "Green" ? "#73daca" : c === "Purple" ? "#bb9af7" : "#ff9e64" }}
                title={c}
              />
            ))}
          </div>
        </div>
      </SettingGroup>
      <SettingGroup title="Layout">
        <LiveSelect label="UI density" options={["Compact", "Comfortable"]} value={s.uiDensity} onChange={(v) => s.updateSetting("uiDensity", v)} />
        <LiveToggle label="Animations" checked={s.animations} onChange={(v) => s.updateSetting("animations", v)} />
        <LiveToggle label="Reduced motion" checked={s.reducedMotion} onChange={(v) => s.updateSetting("reducedMotion", v)} />
      </SettingGroup>
    </div>
  );
}

function TerminalSettings() {
  const s = useSettingsStore();
  return (
    <div className="space-y-6 max-w-lg">
      <SettingGroup title="Font">
        <LiveInput label="Font family" value={s.fontFamily} onChange={(v) => s.updateSetting("fontFamily", v)} />
        <LiveInput label="Font size" value={String(s.fontSize)} type="number" onChange={(v) => s.updateSetting("fontSize", parseInt(v) || 14)} />
        <LiveInput label="Line height" value={String(s.lineHeight)} type="number" onChange={(v) => s.updateSetting("lineHeight", parseFloat(v) || 1.2)} />
      </SettingGroup>
      <SettingGroup title="Cursor">
        <LiveSelect label="Cursor style" options={["Block", "Underline", "Bar"]} value={s.cursorStyle} onChange={(v) => s.updateSetting("cursorStyle", v)} />
        <LiveToggle label="Cursor blink" checked={s.cursorBlink} onChange={(v) => s.updateSetting("cursorBlink", v)} />
      </SettingGroup>
      <SettingGroup title="Behavior">
        <LiveInput label="Scrollback lines" value={String(s.scrollbackLines)} type="number" onChange={(v) => s.updateSetting("scrollbackLines", parseInt(v) || 10000)} />
        <LiveToggle label="Copy on select" checked={s.copyOnSelect} onChange={(v) => s.updateSetting("copyOnSelect", v)} />
        <LiveSelect label="Bell" options={["None", "Sound", "Visual"]} value={s.bellMode} onChange={(v) => s.updateSetting("bellMode", v)} />
        <LiveToggle label="Semantic output colors" checked={s.semanticTerminalColors} onChange={(v) => s.updateSetting("semanticTerminalColors", v)} />
      </SettingGroup>
    </div>
  );
}

function SecuritySettings() {
  return (
    <div className="space-y-6 max-w-lg">
      <SettingGroup title="Application Lock">
        <LiveSelect
          label="Lock mode"
          options={["Disabled", "On startup", "After idle timeout"]}
          value="Disabled"
          onChange={() => {}}
        />
      </SettingGroup>
      <SettingGroup title="Credential Vault">
        <div className="px-3 py-2 rounded bg-dock-success/10 border border-dock-success/20 text-xs text-dock-success">
          ✓ OS credential vault available (Windows Credential Manager)
        </div>
      </SettingGroup>
    </div>
  );
}

function AboutSettings() {
  const { version, loading } = useAppVersion();

  return (
    <div className="space-y-4 max-w-lg">
      <div className="flex items-center gap-3 mb-6">
        <img src="/icon-48.png" alt="" aria-hidden="true" width="48" height="48" className="w-12 h-12" />
        <div>
          <h3 className="text-sm font-semibold text-dock-text">SessionDock</h3>
          <p className="text-xs text-dock-text-muted">
            {loading ? "Loading version..." : `Version ${version || "Unknown"}`}
          </p>
        </div>
      </div>
      <div className="space-y-2 text-xs text-dock-text-muted">
        <p>Platform: Windows x64</p>
        <p>License: MIT</p>
        <p>No telemetry • No analytics • No cloud</p>
      </div>
      <div className="pt-4 border-t border-dock-border">
        <button
          onClick={() => { import("@tauri-apps/plugin-shell").then(m => m.open("https://github.com/Nave1/SessionDock")); }}
          className="text-xs text-dock-accent hover:text-dock-accent-hover"
        >
          GitHub Repository →
        </button>
      </div>
    </div>
  );
}

// --- Reusable setting components ---

function SshSettings() {
  const s = useSettingsStore();
  return (
    <div className="space-y-6 max-w-lg">
      <SettingGroup title="Connection">
        <LiveInput label="Default timeout (seconds)" value={String(s.sshTimeout)} type="number" onChange={(v) => s.updateSetting("sshTimeout", parseInt(v) || 30)} />
        <LiveInput label="Keepalive interval (seconds)" value={String(s.sshKeepalive)} type="number" onChange={(v) => s.updateSetting("sshKeepalive", parseInt(v) || 60)} />
        <LiveSelect label="Default auth method" options={["Password", "Private Key", "SSH Agent"]} value={s.defaultAuthMethod} onChange={(v) => s.updateSetting("defaultAuthMethod", v)} />
      </SettingGroup>
      <SettingGroup title="Host Key Verification">
        <LiveToggle label="Verify host keys" checked={s.verifyHostKeys} onChange={(v) => s.updateSetting("verifyHostKeys", v)} />
        <LiveToggle label="Warn on changed host keys" checked={s.warnChangedHostKeys} onChange={(v) => s.updateSetting("warnChangedHostKeys", v)} />
      </SettingGroup>
      <SettingGroup title="SSH Agent">
        <LiveToggle label="Use SSH agent when available" checked={s.useSshAgent} onChange={(v) => s.updateSetting("useSshAgent", v)} />
        <LiveSelect label="Agent type" options={["Auto-detect", "OpenSSH", "Pageant"]} value={s.sshAgentType} onChange={(v) => s.updateSetting("sshAgentType", v)} />
      </SettingGroup>
    </div>
  );
}

function DataSettings() {
  const { sessions, folders, setSessions, setFolders, setCredentials } = useSessionStore();
  const addToast = useToastStore((state) => state.addToast);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const safeExport = () => createSafeExport(sessions, folders, new Map());
  const dateStamp = new Date().toISOString().slice(0, 10);

  const runAction = async (name: string, action: () => Promise<void>) => {
    setBusyAction(name);
    try {
      await action();
    } catch (error) {
      addToast("error", `${name} failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusyAction(null);
    }
  };

  const refreshData = async () => {
    const [savedSessions, savedFolders] = await Promise.all([getSessions(), getFolders()]);
    setSessions(savedSessions);
    setFolders(savedFolders);
  };

  const importData = async (data: SafeExportData) => {
    const folderIds = await importFolderHierarchy(data.folders, createFolder);
    let imported = 0;
    for (const session of data.sessions) {
      await createSession(toCreateSessionRequest(session, folderIds));
      imported++;
    }
    await refreshData();
    addToast("success", `Imported ${imported} sessions and ${folderIds.size} folders`);
  };

  const importJsonContent = async (content: string) => {
    const data = parseJsonImport(content);
    if (!data) throw new Error("The selected file is not a valid SessionDock export");
    await importData(data);
  };

  const importCsvContent = async (content: string) => {
    const parsed = parseCsvImportData(content);
    if (parsed.sessions.length === 0) throw new Error("The CSV file does not contain any sessions");
    const folderIds = await importFolderHierarchy(parsed.folders, createFolder);
    for (const session of parsed.sessions) await createSession(toCreateSessionRequest(session, folderIds));
    await refreshData();
    addToast("success", `Imported ${parsed.sessions.length} sessions and ${folderIds.size} folders`);
  };

  const actionButton = (name: string, label: string, action: () => Promise<void>, danger = false) => (
    <button
      onClick={() => void runAction(name, action)}
      disabled={busyAction !== null}
      className={`w-full px-3 py-2 rounded text-xs transition-colors text-left disabled:opacity-50 ${
        danger
          ? "bg-dock-error/10 text-dock-error border border-dock-error/20 hover:bg-dock-error/20"
          : "bg-dock-surface text-dock-text-muted hover:text-dock-text hover:bg-dock-border"
      }`}
    >
      {busyAction === name ? `${label}...` : label}
    </button>
  );

  return (
    <div className="space-y-6 max-w-lg">
      <SettingGroup title="Database">
        <div className="flex items-center justify-between">
          <span className="text-xs text-dock-text-muted">Location</span>
          <span className="text-xs text-dock-text font-mono truncate max-w-[280px]">
            %APPDATA%\com.sessiondock.app\sessiondock.db
          </span>
        </div>
      </SettingGroup>
      <SettingGroup title="Export">
        <div className="space-y-2">
          {actionButton("Export JSON", "Export all sessions (JSON)", async () => {
            const path = await saveTextFile(
              JSON.stringify(safeExport(), null, 2),
              `sessiondock-${dateStamp}.json`,
              "JSON",
              ["json"],
            );
            if (path) addToast("success", `JSON export saved to ${path}`);
          })}
          {actionButton("Export CSV", "Export all sessions (CSV)", async () => {
            const path = await saveTextFile(createCsvExport(sessions, folders), `sessiondock-${dateStamp}.csv`, "CSV", ["csv"]);
            if (path) addToast("success", `CSV export saved to ${path}`);
          })}
          {actionButton("Encrypted backup", "Create encrypted backup", async () => {
            const password = window.prompt("Enter a password for this backup:");
            if (!password) return;
            const confirmation = window.prompt("Confirm the backup password:");
            if (password !== confirmation) throw new Error("The passwords do not match");
            const encrypted = await encryptBackup(JSON.stringify(safeExport()), password);
            const path = await saveTextFile(
              encrypted,
              `sessiondock-${dateStamp}.sessiondock-backup`,
              "SessionDock Backup",
              ["sessiondock-backup"],
            );
            if (path) addToast("success", `Encrypted backup saved to ${path}`);
          })}
        </div>
      </SettingGroup>
      <SettingGroup title="Import">
        <div className="space-y-2">
          {actionButton("Import JSON", "Import from JSON file", async () => {
            const file = await openTextFile("JSON", ["json"]);
            if (file) await importJsonContent(file.content);
          })}
          {actionButton("Import CSV", "Import from CSV file", async () => {
            const file = await openTextFile("CSV", ["csv"]);
            if (file) await importCsvContent(file.content);
          })}
          {actionButton("Restore backup", "Restore encrypted backup", async () => {
            const file = await openTextFile("SessionDock Backup", ["sessiondock-backup"]);
            if (!file) return;
            const password = window.prompt("Enter the backup password:");
            if (!password) return;
            await importJsonContent(await decryptBackup(file.content, password));
          })}
        </div>
      </SettingGroup>
      <SettingGroup title="Danger Zone">
        <div className="space-y-2">
          {actionButton("Clear recent sessions", "Clear recent sessions", async () => {
            await clearRecentSessions();
            setSessions(sessions.map((session) => ({ ...session, last_connected_at: undefined, connection_count: 0 })));
            addToast("success", "Recent session history cleared");
          }, true)}
          {actionButton("Reset application data", "Reset all application data", async () => {
            if (!window.confirm("Delete all sessions, folders, credentials, snippets, and local application data? This cannot be undone.")) return;
            await resetApplicationData();
            setSessions([]);
            setFolders([]);
            setCredentials([]);
            localStorage.clear();
            window.location.reload();
          }, true)}
        </div>
      </SettingGroup>
    </div>
  );
}

function toCreateSessionRequest(
  session: SafeExportSession | Partial<Session>,
  folderIds = new Map<string, string>(),
): CreateSessionRequest {
  const protocol = session.protocol === "telnet" || session.protocol === "serial" || session.protocol === "bmc"
    ? session.protocol
    : "ssh";
  const authenticationMethod = session.authentication_method === "private_key"
    || session.authentication_method === "ssh_agent"
    || session.authentication_method === "manual"
    ? session.authentication_method
    : "password";

  return {
    name: session.name?.trim() || "Imported session",
    host: session.host || "",
    port: session.port ?? (protocol === "ssh" ? 22 : protocol === "telnet" ? 23 : 0),
    protocol,
    username: session.username,
    authentication_method: authenticationMethod,
    folder_id: session.folder_id ? folderIds.get(session.folder_id) : undefined,
    device_type: session.device_type,
    vendor: session.vendor,
    model: session.model,
    description: session.description,
    notes: session.notes,
    favorite: session.favorite ?? false,
    startup_command: session.startup_command,
    connection_timeout: session.connection_timeout ?? 30,
    keepalive_interval: session.keepalive_interval ?? 60,
    tags: "tags" in session ? session.tags : undefined,
    bmc_use_https: session.bmc_use_https,
    bmc_web_path: session.bmc_web_path,
    bmc_console_url: safePersistedBmcUrl(session.bmc_console_url),
    bmc_viewer_mode: session.bmc_viewer_mode,
    bmc_open_console_automatically: session.bmc_open_console_automatically,
    bmc_open_fullscreen: session.bmc_open_fullscreen,
    bmc_timeout_seconds: session.bmc_timeout_seconds,
    bmc_server_hostname: session.bmc_server_hostname,
    bmc_server_serial_number: session.bmc_server_serial_number,
    bmc_rack: session.bmc_rack,
    bmc_rack_unit: session.bmc_rack_unit,
    bmc_site: session.bmc_site,
    bmc_redfish_enabled: session.bmc_redfish_enabled,
    bmc_cookie_persistence: session.bmc_cookie_persistence,
  };
}

function SettingGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-medium text-dock-text mb-3">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function LiveToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between cursor-pointer">
      <span className="text-xs text-dock-text-muted">{label}</span>
      <button
        onClick={() => onChange(!checked)}
        className={`w-8 h-4 rounded-full transition-colors ${checked ? "bg-dock-accent" : "bg-dock-border"}`}
      >
        <div className={`w-3 h-3 rounded-full bg-white transition-transform ${checked ? "translate-x-4.5" : "translate-x-0.5"}`} />
      </button>
    </label>
  );
}

function LiveSelect({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-dock-text-muted">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-2 py-1 rounded bg-dock-bg border border-dock-border text-xs text-dock-text focus:border-dock-accent focus:outline-none"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    </div>
  );
}

function LiveInput({ label, value, type = "text", onChange }: { label: string; value: string; type?: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-dock-text-muted">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-48 px-2 py-1 rounded bg-dock-bg border border-dock-border text-xs text-dock-text focus:border-dock-accent focus:outline-none"
      />
    </div>
  );
}
