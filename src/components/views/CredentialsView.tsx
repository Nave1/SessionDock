import { useState } from "react";
import { KeyRound, Plus, Trash2 } from "lucide-react";
import { deleteCredential, storeCredential } from "../../api/commands";
import { useSessionStore } from "../../stores/sessionStore";
import { useToastStore } from "../../stores/toastStore";
import { CredentialForm, type CredentialFormData } from "../forms/CredentialForm";

export function CredentialsView() {
  const credentials = useSessionStore((state) => state.credentials);
  const setCredentials = useSessionStore((state) => state.setCredentials);
  const addToast = useToastStore((state) => state.addToast);
  const [formOpen, setFormOpen] = useState(false);

  const createProfile = async (data: CredentialFormData) => {
    try {
      const profile = await storeCredential({
        ...data,
        password: data.password || undefined,
      });
      setCredentials([...credentials, profile].sort((first, second) => first.name.localeCompare(second.name)));
      setFormOpen(false);
      addToast("success", `Credential profile "${profile.name}" created`);
    } catch (error) {
      addToast("error", `Failed to create credential profile: ${String(error)}`);
    }
  };

  const removeProfile = async (id: string, name: string) => {
    if (!window.confirm(`Delete credential profile "${name}"? Sessions using it will prompt for credentials.`)) return;
    try {
      await deleteCredential(id);
      setCredentials(credentials.filter((credential) => credential.id !== id));
      addToast("success", `Credential profile "${name}" deleted`);
    } catch (error) {
      addToast("error", `Failed to delete credential profile: ${String(error)}`);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-4 py-5 sm:px-6 sm:py-6">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-base font-semibold text-dock-text">Credential Profiles</h1>
            <p className="mt-1 text-xs text-dock-text-muted">Secrets stay in the operating system credential vault.</p>
          </div>
          <button
            onClick={() => setFormOpen(true)}
            className="flex items-center gap-1.5 rounded bg-dock-accent px-3 py-2 text-xs font-medium text-white hover:bg-dock-accent-hover"
          >
            <Plus size={13} />
            New Profile
          </button>
        </div>

        {credentials.length === 0 ? (
          <div className="border-y border-dock-border py-10 text-center">
            <KeyRound size={22} className="mx-auto mb-2 text-dock-text-muted" />
            <p className="text-xs text-dock-text-muted">No credential profiles configured.</p>
          </div>
        ) : (
          <div className="divide-y divide-dock-border border-y border-dock-border">
            {credentials.map((credential) => (
              <div key={credential.id} className="flex items-center gap-3 py-3">
                <KeyRound size={15} className="shrink-0 text-dock-accent" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium text-dock-text">{credential.name}</div>
                  <div className="truncate text-[11px] text-dock-text-muted">
                    {credential.username} · {credential.authentication_method === "private_key" ? "Private key passphrase" : "Password"}
                  </div>
                </div>
                <button
                  onClick={() => void removeProfile(credential.id, credential.name)}
                  title="Delete credential profile"
                  className="p-2 text-dock-text-muted hover:text-dock-error"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {formOpen && <CredentialForm onSubmit={(data) => void createProfile(data)} onCancel={() => setFormOpen(false)} />}
    </div>
  );
}