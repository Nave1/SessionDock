import { useState } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import type { CreateSessionRequest } from "../../types";

interface SessionFormProps {
  onSubmit: (data: CreateSessionRequest) => void;
  onCancel: () => void;
  folders: { id: string; name: string }[];
  initialFolderId?: string;
}

export function SessionForm({ onSubmit, onCancel, folders, initialFolderId }: SessionFormProps) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState<CreateSessionRequest>({
    name: "",
    host: "",
    port: 22,
    protocol: "ssh",
    authentication_method: "password",
    favorite: false,
    folder_id: initialFolderId,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || (!formData.host.trim() && formData.protocol !== "serial")) return;
    onSubmit(formData);
  };

  const handleProtocolChange = (protocol: "ssh" | "telnet" | "serial") => {
    const defaultPorts = { ssh: 22, telnet: 23, serial: 0 };
    setFormData((prev) => ({ ...prev, protocol, port: defaultPorts[protocol] }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-xl bg-dock-sidebar border border-dock-border rounded-lg shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-dock-border">
          <h2 className="text-sm font-semibold text-dock-text">
            {t("sidebar.newSession")}
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
            <div className="flex gap-1">
              {(["ssh", "telnet", "serial"] as const).map((p) => (
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
          <Field
            label={t("session.username")}
            value={formData.username || ""}
            onChange={(v) => setFormData((p) => ({ ...p, username: v }))}
            placeholder="admin"
          />

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
          <div className="grid grid-cols-3 gap-3">
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
