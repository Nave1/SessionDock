import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Eye, EyeOff, X } from "lucide-react";
import { getCredentialSecret } from "../../api/commands";
import type { CredentialProfile } from "../../types";

interface CredentialFormProps {
  onSubmit: (data: CredentialFormData) => void;
  onCancel: () => void;
  initialProfile?: CredentialProfile;
}

export interface CredentialFormData {
  name: string;
  username: string;
  authentication_method: "password" | "private_key" | "ssh_agent" | "manual";
  password?: string;
  description?: string;
}

export function CredentialForm({ onSubmit, onCancel, initialProfile }: CredentialFormProps) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState<CredentialFormData>({
    name: initialProfile?.name ?? "",
    username: initialProfile?.username ?? "",
    authentication_method: initialProfile?.authentication_method ?? "password",
    description: initialProfile?.description,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loadingSecret, setLoadingSecret] = useState(false);
  const [secretMissing, setSecretMissing] = useState(false);

  const togglePasswordVisibility = async () => {
    if (showPassword) {
      setShowPassword(false);
      return;
    }
    if (initialProfile && formData.password === undefined) {
      setLoadingSecret(true);
      try {
        const password = await getCredentialSecret(initialProfile.id);
        setSecretMissing(password === null && initialProfile.authentication_method === "password");
        setFormData((current) => ({ ...current, password: password ?? undefined }));
      } catch {
        setSecretMissing(initialProfile.authentication_method === "password");
      } finally {
        setLoadingSecret(false);
      }
    }
    setShowPassword(true);
  };

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
            {initialProfile ? t("credentials.editTitle") : t("credentials.newTitle")}
          </h2>
          <button onClick={onCancel} className="text-dock-text-muted hover:text-dock-text">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Profile name */}
          <div>
            <label className="block text-xs text-dock-text-muted mb-1.5">
              {t("sshAuth.profileName")}
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
              {t("sshAuth.authenticationMethod")}
            </label>
            <select
              value={formData.authentication_method}
              onChange={(e) => setFormData((p) => ({
                ...p,
                authentication_method: e.target.value as CredentialFormData["authentication_method"],
              }))}
              className="w-full px-3 py-2 rounded bg-dock-bg border border-dock-border text-xs text-dock-text focus:border-dock-accent focus:outline-none"
            >
              <option value="password">{t("session.password")}</option>
              <option value="private_key">{t("sshAuth.privateKey")}</option>
            </select>
          </div>

          {(formData.authentication_method === "password" || formData.authentication_method === "private_key") && (
            <div>
              <label className="block text-xs text-dock-text-muted mb-1.5">
                {formData.authentication_method === "private_key" ? t("sshAuth.privateKeyPassphrase") : t("session.password")}
              </label>
              <div className="flex gap-1">
              <input
                type={showPassword ? "text" : "password"}
                value={formData.password || ""}
                onChange={(e) => { setSecretMissing(false); setFormData((p) => ({ ...p, password: e.target.value })); }}
                placeholder={formData.authentication_method === "private_key" ? t("sshAuth.encryptedKeyPassphrase") : t("sshAuth.vaultPassword")}
                aria-label={formData.authentication_method === "private_key" ? t("sshAuth.privateKeyPassphrase") : t("session.password")}
                required={formData.authentication_method === "password" && (!initialProfile || secretMissing)}
                disabled={loadingSecret}
                autoComplete="current-password"
                className="min-w-0 flex-1 px-3 py-2 rounded bg-dock-bg border border-dock-border text-xs text-dock-text placeholder-dock-text-muted focus:border-dock-accent focus:outline-none disabled:opacity-50"
              />
              <button type="button" onClick={() => { void togglePasswordVisibility(); }} disabled={loadingSecret} className="rounded bg-dock-surface px-2 text-dock-text-muted hover:text-dock-text disabled:opacity-50" title={showPassword ? t("credentials.hidePassword") : t("credentials.showPassword")} aria-label={showPassword ? t("credentials.hidePassword") : t("credentials.showPassword")}>
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
              </div>
              {secretMissing && <p className="mt-1 text-[10px] text-dock-error">{t("credentials.missingPassword")}</p>}
              <p className="mt-1 text-[10px] text-dock-text-muted">
                {t("sshAuth.vaultNotice")}
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
              {initialProfile ? t("credentials.update") : t("credentials.save")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
