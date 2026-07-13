import { useState } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";

interface CredentialFormProps {
  onSubmit: (data: CredentialFormData) => void;
  onCancel: () => void;
}

export interface CredentialFormData {
  name: string;
  username: string;
  authentication_method: "password" | "private_key" | "ssh_agent" | "manual";
  password?: string;
  description?: string;
}

export function CredentialForm({ onSubmit, onCancel }: CredentialFormProps) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState<CredentialFormData>({
    name: "",
    username: "",
    authentication_method: "password",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.username.trim()) return;
    onSubmit(formData);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md bg-dock-sidebar border border-dock-border rounded-lg shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-dock-border">
          <h2 className="text-sm font-semibold text-dock-text">
            New Credential Profile
          </h2>
          <button onClick={onCancel} className="text-dock-text-muted hover:text-dock-text">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Profile name */}
          <div>
            <label className="block text-xs text-dock-text-muted mb-1.5">
              Profile Name
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
              placeholder="e.g. Network Admin, Lab Credentials"
              required
              autoFocus
              className="w-full px-3 py-2 rounded bg-dock-bg border border-dock-border text-xs text-dock-text placeholder-dock-text-muted focus:border-dock-accent focus:outline-none"
            />
          </div>

          {/* Username */}
          <div>
            <label className="block text-xs text-dock-text-muted mb-1.5">
              {t("session.username")}
            </label>
            <input
              type="text"
              value={formData.username}
              onChange={(e) => setFormData((p) => ({ ...p, username: e.target.value }))}
              placeholder="admin"
              required
              className="w-full px-3 py-2 rounded bg-dock-bg border border-dock-border text-xs text-dock-text placeholder-dock-text-muted focus:border-dock-accent focus:outline-none"
            />
          </div>

          {/* Auth method */}
          <div>
            <label className="block text-xs text-dock-text-muted mb-1.5">
              Authentication Method
            </label>
            <select
              value={formData.authentication_method}
              onChange={(e) => setFormData((p) => ({
                ...p,
                authentication_method: e.target.value as CredentialFormData["authentication_method"],
              }))}
              className="w-full px-3 py-2 rounded bg-dock-bg border border-dock-border text-xs text-dock-text focus:border-dock-accent focus:outline-none"
            >
              <option value="password">Password</option>
              <option value="private_key">Private Key</option>
              <option value="ssh_agent">SSH Agent</option>
              <option value="manual">Manual (ask each time)</option>
            </select>
          </div>

          {/* Password (only for password auth) */}
          {formData.authentication_method === "password" && (
            <div>
              <label className="block text-xs text-dock-text-muted mb-1.5">
                {t("session.password")}
              </label>
              <input
                type="password"
                value={formData.password || ""}
                onChange={(e) => setFormData((p) => ({ ...p, password: e.target.value }))}
                placeholder="Will be stored securely in OS vault"
                className="w-full px-3 py-2 rounded bg-dock-bg border border-dock-border text-xs text-dock-text placeholder-dock-text-muted focus:border-dock-accent focus:outline-none"
              />
              <p className="mt-1 text-[10px] text-dock-text-muted">
                Stored in Windows Credential Manager / macOS Keychain. Never in plain text.
              </p>
            </div>
          )}

          {/* Description */}
          <div>
            <label className="block text-xs text-dock-text-muted mb-1.5">
              {t("session.description")}
            </label>
            <input
              type="text"
              value={formData.description || ""}
              onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
              placeholder="Optional description"
              className="w-full px-3 py-2 rounded bg-dock-bg border border-dock-border text-xs text-dock-text placeholder-dock-text-muted focus:border-dock-accent focus:outline-none"
            />
          </div>

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
              Save Profile
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
