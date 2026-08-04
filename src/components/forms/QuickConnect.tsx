import { useState } from "react";
import { useTranslation } from "react-i18next";
import { X, AlertTriangle } from "lucide-react";
import type { BmcSessionConfig, Protocol } from "../../types";
import { BmcSessionFields } from "./BmcSessionFields";

interface QuickConnectProps {
  onConnect: (config: QuickConnectConfig) => void;
  onCancel: () => void;
}

export interface QuickConnectConfig extends Partial<BmcSessionConfig> {
  host: string;
  port: number;
  protocol: Protocol;
  username: string;
  password: string;
  saveAsSession: boolean;
}

export function QuickConnect({ onConnect, onCancel }: QuickConnectProps) {
  const { t } = useTranslation();
  const [config, setConfig] = useState<QuickConnectConfig>({
    host: "",
    port: 22,
    protocol: "ssh",
    username: "",
    password: "",
    saveAsSession: false,
  });
  const [showTelnetWarning, setShowTelnetWarning] = useState(false);

  const handleConnect = () => {
    if (config.protocol === "telnet" && !showTelnetWarning) {
      setShowTelnetWarning(true);
      return;
    }
    onConnect(config);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && config.host.trim()) {
      e.preventDefault();
      handleConnect();
    }
  };

  const handleProtocolChange = (protocol: Protocol) => {
    const ports = { ssh: 22, telnet: 23, serial: 0, bmc: 443 };
    setConfig((prev) => ({ ...prev, protocol, port: ports[protocol], ...(protocol === "bmc" ? { bmc_use_https: true, bmc_viewer_mode: "web", bmc_timeout_seconds: 30, bmc_redfish_enabled: true, bmc_cookie_persistence: "tab" } : {}) }));
    setShowTelnetWarning(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md max-h-[90vh] bg-dock-sidebar border border-dock-border rounded-lg shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-dock-border">
          <h2 className="text-sm font-semibold text-dock-text">
            {t("home.quickConnect")}
          </h2>
          <button onClick={onCancel} className="text-dock-text-muted hover:text-dock-text">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[calc(90vh-49px)] overflow-y-auto">
          {/* Protocol */}
          <div className="flex gap-1">
            {(["ssh", "telnet", "serial", "bmc"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => handleProtocolChange(p)}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                  config.protocol === p
                    ? "bg-dock-accent text-white"
                    : "bg-dock-surface text-dock-text-muted hover:text-dock-text"
                }`}
              >
                {p.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Telnet warning */}
          {showTelnetWarning && (
            <div className="flex items-start gap-2 p-3 rounded bg-dock-warning/10 border border-dock-warning/30">
              <AlertTriangle size={14} className="text-dock-warning flex-shrink-0 mt-0.5" />
              <div className="text-xs text-dock-warning">
                <p className="font-medium mb-1">Telnet is insecure</p>
                <p className="text-dock-text-muted">
                  Traffic is unencrypted. Credentials may be exposed on the network. Use SSH where available.
                </p>
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => onConnect(config)}
                    className="px-2 py-1 rounded bg-dock-warning/20 text-dock-warning text-xs hover:bg-dock-warning/30"
                  >
                    Connect anyway
                  </button>
                  <button
                    onClick={() => { handleProtocolChange("ssh"); }}
                    className="px-2 py-1 rounded bg-dock-surface text-dock-text-muted text-xs hover:text-dock-text"
                  >
                    Switch to SSH
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Host */}
          {config.protocol !== "serial" && (
            <div>
              <label className="block text-xs text-dock-text-muted mb-1.5">
                {t("session.host")}
              </label>
              <input
                type="text"
                value={config.host}
                onChange={(e) => setConfig((p) => ({ ...p, host: e.target.value }))}
                onKeyDown={handleKeyDown}
                placeholder="192.168.1.1 or hostname"
                autoFocus
                className="w-full px-3 py-2 rounded bg-dock-bg border border-dock-border text-xs text-dock-text placeholder-dock-text-muted focus:border-dock-accent focus:outline-none"
              />
            </div>
          )}

          {/* Port */}
          {config.protocol !== "serial" && (
            <div>
              <label className="block text-xs text-dock-text-muted mb-1.5">
                {t("session.port")}
              </label>
              <input
                type="number"
                value={config.port}
                onChange={(e) => setConfig((p) => ({ ...p, port: parseInt(e.target.value) || 0 }))}
                className="w-full px-3 py-2 rounded bg-dock-bg border border-dock-border text-xs text-dock-text focus:border-dock-accent focus:outline-none"
              />
            </div>
          )}

          {/* Username */}
          <div>
            <label className="block text-xs text-dock-text-muted mb-1.5">
              {t("session.username")}
            </label>
            <input
              type="text"
              value={config.username}
              onChange={(e) => setConfig((p) => ({ ...p, username: e.target.value }))}
              onKeyDown={handleKeyDown}
              placeholder="(optional - SSH will prompt if needed)"
              className="w-full px-3 py-2 rounded bg-dock-bg border border-dock-border text-xs text-dock-text placeholder-dock-text-muted focus:border-dock-accent focus:outline-none"
            />
          </div>

          {/* Password */}
          {(config.protocol === "ssh" || config.protocol === "bmc") && (
            <div>
              <label className="block text-xs text-dock-text-muted mb-1.5">
                {t("session.password")}
              </label>
              <input
                type="password"
                value={config.password}
                onChange={(e) => setConfig((p) => ({ ...p, password: e.target.value }))}
                onKeyDown={handleKeyDown}
                placeholder="Enter password"
                className="w-full px-3 py-2 rounded bg-dock-bg border border-dock-border text-xs text-dock-text placeholder-dock-text-muted focus:border-dock-accent focus:outline-none"
              />
            </div>
          )}

          {config.protocol === "bmc" && (
            <BmcSessionFields value={config} onChange={(patch) => setConfig((previous) => ({ ...previous, ...patch }))} />
          )}

          {/* Save option */}
          <label className="flex items-center gap-2 text-xs text-dock-text-muted cursor-pointer">
            <input
              type="checkbox"
              checked={config.saveAsSession}
              onChange={(e) => setConfig((p) => ({ ...p, saveAsSession: e.target.checked }))}
              className="rounded border-dock-border"
            />
            Save as session after connecting
          </label>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2 border-t border-dock-border">
            <button
              onClick={onCancel}
              className="px-4 py-2 rounded text-xs text-dock-text-muted hover:text-dock-text bg-dock-surface hover:bg-dock-border transition-colors"
            >
              {t("session.cancel")}
            </button>
            <button
              onClick={handleConnect}
              disabled={config.protocol !== "serial" && !config.host.trim()}
              className="px-4 py-2 rounded text-xs text-white bg-dock-accent hover:bg-dock-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t("session.connect")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
