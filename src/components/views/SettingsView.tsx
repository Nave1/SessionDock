import { useState } from "react";
import { useTranslation } from "react-i18next";
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
        {activeTab === "about" && <AboutSettings />}
        {activeTab === "security" && <SecuritySettings />}
      </div>
    </div>
  );
}

function GeneralSettings() {
  return (
    <div className="space-y-6 max-w-lg">
      <SettingGroup title="Startup">
        <SettingToggle label="Restore open tabs on restart" defaultChecked />
        <SettingToggle label="Confirm before closing active sessions" defaultChecked />
        <SettingToggle label="Start minimized" />
      </SettingGroup>
      <SettingGroup title="Defaults">
        <SettingSelect
          label="Default protocol"
          options={["SSH", "Telnet", "Serial"]}
          defaultValue="SSH"
        />
        <SettingInput label="Default SSH port" defaultValue="22" type="number" />
        <SettingInput label="Default Telnet port" defaultValue="23" type="number" />
      </SettingGroup>
      <SettingGroup title="Language">
        <SettingSelect label="Language" options={["English", "עברית"]} defaultValue="English" />
      </SettingGroup>
    </div>
  );
}

function AppearanceSettings() {
  return (
    <div className="space-y-6 max-w-lg">
      <SettingGroup title="Theme">
        <SettingSelect label="Mode" options={["Dark", "Light", "System"]} defaultValue="Dark" />
        <SettingSelect
          label="Accent color"
          options={["Blue", "Cyan", "Green", "Purple", "Orange"]}
          defaultValue="Blue"
        />
      </SettingGroup>
      <SettingGroup title="Layout">
        <SettingSelect
          label="UI density"
          options={["Compact", "Comfortable"]}
          defaultValue="Compact"
        />
        <SettingToggle label="Animations" defaultChecked />
        <SettingToggle label="Reduced motion" />
      </SettingGroup>
    </div>
  );
}

function TerminalSettings() {
  return (
    <div className="space-y-6 max-w-lg">
      <SettingGroup title="Font">
        <SettingInput label="Font family" defaultValue="JetBrains Mono, Consolas, monospace" />
        <SettingInput label="Font size" defaultValue="14" type="number" />
        <SettingInput label="Line height" defaultValue="1.2" type="number" />
      </SettingGroup>
      <SettingGroup title="Cursor">
        <SettingSelect label="Cursor style" options={["Block", "Underline", "Bar"]} defaultValue="Block" />
        <SettingToggle label="Cursor blink" defaultChecked />
      </SettingGroup>
      <SettingGroup title="Behavior">
        <SettingInput label="Scrollback lines" defaultValue="10000" type="number" />
        <SettingToggle label="Copy on select" />
        <SettingSelect label="Bell" options={["None", "Sound", "Visual"]} defaultValue="None" />
      </SettingGroup>
    </div>
  );
}

function SecuritySettings() {
  return (
    <div className="space-y-6 max-w-lg">
      <SettingGroup title="Application Lock">
        <SettingSelect
          label="Lock mode"
          options={["Disabled", "On startup", "After idle timeout"]}
          defaultValue="Disabled"
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
  return (
    <div className="space-y-4 max-w-lg">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-xl bg-dock-accent flex items-center justify-center text-white text-lg font-bold">
          S
        </div>
        <div>
          <h3 className="text-sm font-semibold text-dock-text">SessionDock</h3>
          <p className="text-xs text-dock-text-muted">Version 0.1.0</p>
        </div>
      </div>
      <div className="space-y-2 text-xs text-dock-text-muted">
        <p>Platform: Windows x64</p>
        <p>License: MIT</p>
        <p>No telemetry • No analytics • No cloud</p>
      </div>
    </div>
  );
}

// --- Reusable setting components ---

function SettingGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-medium text-dock-text mb-3">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function SettingToggle({ label, defaultChecked }: { label: string; defaultChecked?: boolean }) {
  const [checked, setChecked] = useState(defaultChecked ?? false);
  return (
    <label className="flex items-center justify-between cursor-pointer">
      <span className="text-xs text-dock-text-muted">{label}</span>
      <button
        onClick={() => setChecked(!checked)}
        className={`w-8 h-4 rounded-full transition-colors ${
          checked ? "bg-dock-accent" : "bg-dock-border"
        }`}
      >
        <div
          className={`w-3 h-3 rounded-full bg-white transition-transform ${
            checked ? "translate-x-4.5" : "translate-x-0.5"
          }`}
        />
      </button>
    </label>
  );
}

function SettingSelect({
  label,
  options,
  defaultValue,
}: {
  label: string;
  options: string[];
  defaultValue: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-dock-text-muted">{label}</span>
      <select
        defaultValue={defaultValue}
        className="px-2 py-1 rounded bg-dock-bg border border-dock-border text-xs text-dock-text focus:border-dock-accent focus:outline-none"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    </div>
  );
}

function SettingInput({
  label,
  defaultValue,
  type = "text",
}: {
  label: string;
  defaultValue: string;
  type?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-dock-text-muted">{label}</span>
      <input
        type={type}
        defaultValue={defaultValue}
        className="w-48 px-2 py-1 rounded bg-dock-bg border border-dock-border text-xs text-dock-text focus:border-dock-accent focus:outline-none"
      />
    </div>
  );
}
