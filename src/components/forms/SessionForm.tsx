import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp, Plus, Trash2, X } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import type { CreateSessionRequest, Session } from "../../types";
import { useSessionStore } from "../../stores/sessionStore";
import { BmcSessionFields } from "./BmcSessionFields";
import { SerialConnectionFields } from "./SerialConnectionFields";
import { safePersistedBmcUrl } from "../../utils/bmcUrl";
import { isEligibleJumpHost, moveJumpHostId } from "../../utils/sshJumpHosts";
import { useSettingsStore } from "../../stores/settingsStore";

interface SessionFormProps {
  onSubmit: (data: CreateSessionRequest) => void;
  onCancel: () => void;
  folders: { id: string; name: string }[];
  initialFolderId?: string;
  initialSession?: Session;
}

export function SessionForm({ onSubmit, onCancel, folders, initialFolderId, initialSession }: SessionFormProps) {
  const { t } = useTranslation();
  const credentials = useSessionStore((state) => state.credentials);
  const sessions = useSessionStore((state) => state.sessions);
  const settings = useSettingsStore.getState();
  const defaultProtocol = settings.defaultProtocol.toLowerCase() as "ssh" | "telnet" | "serial";
  const [jumpHostSelection, setJumpHostSelection] = useState("");
  const [formData, setFormData] = useState<CreateSessionRequest>(() => initialSession
    ? { ...initialSession }
    : {
        name: "",
        host: "",
        port: defaultProtocol === "telnet" ? settings.defaultTelnetPort : defaultProtocol === "serial" ? 0 : settings.defaultSshPort,
        protocol: defaultProtocol,
        authentication_method: "password",
        favorite: false,
        reconnect_mode: "disabled",
        serial_baud_rate: 9600,
        connection_timeout: 30,
        keepalive_interval: settings.sshKeepalive,
        folder_id: initialFolderId,
      });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.host.trim()) return;
    try {
      onSubmit({
        ...formData,
        bmc_console_url: formData.protocol === "bmc" ? safePersistedBmcUrl(formData.bmc_console_url) : undefined,
      });
    } catch {
      return;
    }
  };

  const handleProtocolChange = (protocol: CreateSessionRequest["protocol"]) => {
    const currentSettings = useSettingsStore.getState();
    const defaultPorts = { ssh: currentSettings.defaultSshPort, telnet: currentSettings.defaultTelnetPort, serial: 0, bmc: 443, vnc: 5900 };
    setFormData((prev) => ({ ...prev, protocol, port: defaultPorts[protocol], ...(protocol === "serial" ? { serial_baud_rate: prev.serial_baud_rate || 9600 } : {}), ...(protocol === "bmc" ? { bmc_use_https: true, bmc_viewer_mode: "web", bmc_timeout_seconds: 30, bmc_redfish_enabled: true, bmc_cookie_persistence: "application" } : {}) }));
  };

  const compatibleCredentials = credentials.filter(
    (credential) => credential.authentication_method === formData.authentication_method,
  );
  const selectedJumpHostIds = formData.jump_host_ids || [];
  const eligibleJumpHosts = sessions.filter((session) => (
    isEligibleJumpHost(session, initialSession?.id, selectedJumpHostIds)
  ));

  const moveJumpHost = (index: number, direction: -1 | 1) => {
    setFormData((previous) => ({
      ...previous,
      jump_host_ids: moveJumpHostId(selectedJumpHostIds, index, direction),
    }));
  };

  const selectPrivateKey = async () => {
    const selected = await open({
      multiple: false,
      directory: false,
    });
    if (typeof selected === "string") {
      setFormData((previous) => ({ ...previous, private_key_reference: selected }));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-4">
      <div className="w-full max-w-xl max-h-[calc(100vh-1rem)] sm:max-h-[calc(100vh-2rem)] bg-dock-sidebar border border-dock-border rounded-lg shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-dock-border">
          <h2 className="text-sm font-semibold text-dock-text">
            {initialSession ? `Edit ${initialSession.name}` : t("sidebar.newSession")}
          </h2>
          <button onClick={onCancel} className="text-dock-text-muted hover:text-dock-text">
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Protocol selector */}
          <div>
            <label className="block text-xs text-dock-text-muted mb-1.5">
              {t("session.protocol")}
            </label>
            <div className="flex flex-wrap gap-1">
              {(["ssh", "telnet", "serial", "bmc", "vnc"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => handleProtocolChange(p)}
                  className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                    formData.protocol === p
                      ? "bg-dock-accent text-white"
                      : "bg-dock-surface text-dock-text-muted hover:text-dock-text"
                  }`}
                >
                  {p.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Name */}
          <Field
            label={t("session.name")}
            value={formData.name}
            onChange={(v) => setFormData((p) => ({ ...p, name: v }))}
            placeholder="e.g. Core-Switch-01"
            required
          />

          {formData.protocol === "bmc" && (
            <BmcSessionFields value={formData} onChange={(patch) => setFormData((previous) => ({ ...previous, ...patch }))} />
          )}

          {formData.protocol === "vnc" && (
            <div className="rounded border border-cyan-400/30 bg-cyan-400/10 p-3 text-xs leading-5 text-dock-text-muted">
              VNC opens the VM desktop in RealVNC Viewer. Enter the VM address and its VNC port below; the usual port is 5900. On the first connection, select Remember password in RealVNC Viewer to sign in automatically next time.
            </div>
          )}

          {formData.protocol === "serial" && (
            <SerialConnectionFields
              portName={formData.host}
              baudRate={formData.serial_baud_rate || 9600}
              onPortNameChange={(host) => setFormData((previous) => ({ ...previous, host }))}
              onBaudRateChange={(serial_baud_rate) => setFormData((previous) => ({ ...previous, serial_baud_rate }))}
            />
          )}

          {/* Host (not for serial) */}
          {formData.protocol !== "serial" && (
            <Field
              label={t("session.host")}
              value={formData.host}
              onChange={(v) => setFormData((p) => ({ ...p, host: v }))}
              placeholder="e.g. 192.168.1.1 or switch-01.lab.local"
              required
            />
          )}

          {/* Port (not for serial) */}
          {formData.protocol !== "serial" && (
            <Field
              label={t("session.port")}
              value={String(formData.port)}
              onChange={(v) => setFormData((p) => ({ ...p, port: parseInt(v) || 0 }))}
              type="number"
            />
          )}

          {/* Username */}
          {formData.protocol !== "vnc" && (
            <Field
              label={t("session.username")}
              value={formData.username || ""}
              onChange={(v) => setFormData((p) => ({ ...p, username: v }))}
              placeholder="admin"
            />
          )}

          {formData.protocol === "ssh" && (
            <div className="space-y-3 rounded border border-dock-border bg-dock-surface/40 p-3">
              <div>
                <label className="block text-xs text-dock-text-muted mb-1.5">{t("sshAuth.authentication")}</label>
                <select
                  value={formData.authentication_method}
                  onChange={(event) => setFormData((previous) => ({
                    ...previous,
                    authentication_method: event.target.value as CreateSessionRequest["authentication_method"],
                    credential_profile_id: undefined,
                  }))}
                  className="w-full px-3 py-2 rounded bg-dock-bg border border-dock-border text-xs text-dock-text focus:border-dock-accent focus:outline-none"
                >
                  <option value="password">{t("sshAuth.passwordInteractive")}</option>
                  <option value="private_key">{t("sshAuth.privateKey")}</option>
                  <option value="ssh_agent">{t("sshAuth.sshAgent")}</option>
                  <option value="manual">{t("sshAuth.askEachTime")}</option>
                </select>
              </div>

              {(formData.authentication_method === "password" || formData.authentication_method === "private_key") && (
                <div>
                  <label className="block text-xs text-dock-text-muted mb-1.5">
                    {t("sshAuth.credentialProfile")} ({formData.authentication_method === "private_key" ? t("sshAuth.optionalPassphrase") : t("sshAuth.optional")})
                  </label>
                  <select
                    value={formData.credential_profile_id || ""}
                    onChange={(event) => {
                      const credential = compatibleCredentials.find((item) => item.id === event.target.value);
                      setFormData((previous) => ({
                        ...previous,
                        credential_profile_id: credential?.id,
                        username: credential?.username || previous.username,
                      }));
                    }}
                    className="w-full px-3 py-2 rounded bg-dock-bg border border-dock-border text-xs text-dock-text focus:border-dock-accent focus:outline-none"
                  >
                    <option value="">{formData.authentication_method === "private_key" ? t("sshAuth.noPassphrase") : t("sshAuth.promptWhenConnecting")}</option>
                    {compatibleCredentials.map((credential) => (
                      <option key={credential.id} value={credential.id}>{credential.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {formData.authentication_method === "private_key" && (
                <div>
                  <label className="block text-xs text-dock-text-muted mb-1.5">{t("sshAuth.privateKeyFile")}</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={formData.private_key_reference || ""}
                      onChange={(event) => setFormData((previous) => ({ ...previous, private_key_reference: event.target.value }))}
                      placeholder={t("sshAuth.selectPrivateKey")}
                      required
                      className="min-w-0 flex-1 px-3 py-2 rounded bg-dock-bg border border-dock-border text-xs text-dock-text placeholder-dock-text-muted focus:border-dock-accent focus:outline-none"
                    />
                    <button type="button" onClick={() => void selectPrivateKey()} className="px-3 py-2 rounded text-xs bg-dock-surface text-dock-text hover:bg-dock-surface-hover">
                      {t("sshAuth.browse")}
                    </button>
                  </div>
                  <p className="mt-1 text-[10px] text-dock-text-muted">{t("sshAuth.keyLocationNotice")}</p>
                </div>
              )}

              {formData.authentication_method === "ssh_agent" && (
                <p className="text-[10px] text-dock-text-muted">{t("sshAuth.agentNotice")}</p>
              )}

              <div className="border-t border-dock-border pt-3">
                <label className="block text-xs text-dock-text-muted mb-1.5">{t("sshAuth.jumpHosts")}</label>
                <div className="flex gap-2">
                  <select
                    value={jumpHostSelection}
                    onChange={(event) => setJumpHostSelection(event.target.value)}
                    disabled={selectedJumpHostIds.length >= 5 || eligibleJumpHosts.length === 0}
                    className="min-w-0 flex-1 px-3 py-2 rounded bg-dock-bg border border-dock-border text-xs text-dock-text focus:border-dock-accent focus:outline-none disabled:opacity-50"
                  >
                    <option value="">{t("sshAuth.selectJumpHost")}</option>
                    {eligibleJumpHosts.map((session) => (
                      <option key={session.id} value={session.id}>{session.name} ({session.host}:{session.port})</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={!jumpHostSelection || selectedJumpHostIds.length >= 5}
                    onClick={() => {
                      if (!jumpHostSelection) return;
                      setFormData((previous) => ({
                        ...previous,
                        jump_host_ids: [...(previous.jump_host_ids || []), jumpHostSelection],
                      }));
                      setJumpHostSelection("");
                    }}
                    className="rounded bg-dock-surface p-2 text-dock-text hover:bg-dock-surface-hover disabled:opacity-40"
                    title={t("sshAuth.addJumpHost")}
                    aria-label={t("sshAuth.addJumpHost")}
                  >
                    <Plus size={15} />
                  </button>
                </div>

                {selectedJumpHostIds.length > 0 && (
                  <div className="mt-2 divide-y divide-dock-border overflow-hidden rounded border border-dock-border">
                    {selectedJumpHostIds.map((sessionId, index) => {
                      const session = sessions.find((item) => item.id === sessionId);
                      return (
                        <div key={sessionId} className="flex items-center gap-2 px-2 py-1.5">
                          <span className="w-4 shrink-0 text-center text-[10px] text-dock-text-muted">{index + 1}</span>
                          <span className="min-w-0 flex-1 truncate text-xs text-dock-text" dir="ltr">
                            {session ? `${session.name} (${session.host}:${session.port})` : t("sshAuth.missingJumpHost")}
                          </span>
                          <button type="button" disabled={index === 0} onClick={() => moveJumpHost(index, -1)} className="rounded p-1 text-dock-text-muted hover:text-dock-text disabled:opacity-30" title={t("sshAuth.moveJumpHostUp")} aria-label={t("sshAuth.moveJumpHostUp")}><ChevronUp size={13} /></button>
                          <button type="button" disabled={index === selectedJumpHostIds.length - 1} onClick={() => moveJumpHost(index, 1)} className="rounded p-1 text-dock-text-muted hover:text-dock-text disabled:opacity-30" title={t("sshAuth.moveJumpHostDown")} aria-label={t("sshAuth.moveJumpHostDown")}><ChevronDown size={13} /></button>
                          <button type="button" onClick={() => setFormData((previous) => ({ ...previous, jump_host_ids: selectedJumpHostIds.filter((id) => id !== sessionId) }))} className="rounded p-1 text-dock-text-muted hover:text-red-400" title={t("sshAuth.removeJumpHost")} aria-label={t("sshAuth.removeJumpHost")}><Trash2 size={13} /></button>
                        </div>
                      );
                    })}
                  </div>
                )}
                <p className="mt-1 text-[10px] text-dock-text-muted">{t("sshAuth.jumpHostNotice")}</p>
              </div>
            </div>
          )}

          {/* Folder */}
          {formData.protocol !== "bmc" && formData.protocol !== "vnc" && (
            <div>
              <label className="block text-xs text-dock-text-muted mb-1.5">
                {t("reconnect.mode")}
              </label>
              <select
                value={formData.reconnect_mode || "disabled"}
                onChange={(event) => setFormData((previous) => ({
                  ...previous,
                  reconnect_mode: event.target.value as CreateSessionRequest["reconnect_mode"],
                }))}
                className="w-full px-3 py-2 rounded bg-dock-bg border border-dock-border text-xs text-dock-text focus:border-dock-accent focus:outline-none"
              >
                <option value="disabled">{t("reconnect.disabled")}</option>
                <option value="once">{t("reconnect.once")}</option>
                <option value="automatic">{t("reconnect.automatic")}</option>
              </select>
              <p className="mt-1 text-[10px] text-dock-text-muted">{t("reconnect.notice")}</p>
            </div>
          )}

          {/* Folder */}
          <div>
            <label className="block text-xs text-dock-text-muted mb-1.5">
              {t("session.folder")}
            </label>
            <select
              value={formData.folder_id || ""}
              onChange={(e) => setFormData((p) => ({ ...p, folder_id: e.target.value || undefined }))}
              className="w-full px-3 py-2 rounded bg-dock-bg border border-dock-border text-xs text-dock-text focus:border-dock-accent focus:outline-none"
            >
              <option value="">No folder</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>

          {/* Device info */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field
              label={t("session.deviceType")}
              value={formData.device_type || ""}
              onChange={(v) => setFormData((p) => ({ ...p, device_type: v }))}
              placeholder="Switch"
            />
            <Field
              label={t("session.vendor")}
              value={formData.vendor || ""}
              onChange={(v) => setFormData((p) => ({ ...p, vendor: v }))}
              placeholder="Cisco"
            />
            <Field
              label={t("session.model")}
              value={formData.model || ""}
              onChange={(v) => setFormData((p) => ({ ...p, model: v }))}
              placeholder="C9300"
            />
          </div>

          {/* Description */}
          <Field
            label={t("session.description")}
            value={formData.description || ""}
            onChange={(v) => setFormData((p) => ({ ...p, description: v }))}
            placeholder="Main distribution switch, rack A3"
          />

          {/* Tags */}
          <Field
            label={t("session.tags")}
            value={formData.tags?.join(", ") || ""}
            onChange={(v) => setFormData((p) => ({ ...p, tags: v.split(",").map((t) => t.trim()).filter(Boolean) }))}
            placeholder="production, datacenter, spine"
          />

          {/* Favorite */}
          <label className="flex items-center gap-2 text-xs text-dock-text-muted cursor-pointer">
            <input
              type="checkbox"
              checked={formData.favorite}
              onChange={(e) => setFormData((p) => ({ ...p, favorite: e.target.checked }))}
              className="rounded border-dock-border"
            />
            {t("session.favorite")}
          </label>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2 border-t border-dock-border">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 rounded text-xs text-dock-text-muted hover:text-dock-text bg-dock-surface hover:bg-dock-border transition-colors"
            >
              {t("session.cancel")}
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded text-xs text-white bg-dock-accent hover:bg-dock-accent-hover transition-colors"
            >
              {t("session.save")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs text-dock-text-muted mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="w-full px-3 py-2 rounded bg-dock-bg border border-dock-border text-xs text-dock-text placeholder-dock-text-muted focus:border-dock-accent focus:outline-none"
      />
    </div>
  );
}
