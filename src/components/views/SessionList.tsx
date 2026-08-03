import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Star, ExternalLink, GripVertical, Pencil, Trash2, X } from "lucide-react";
import { useSessionStore } from "../../stores/sessionStore";
import { useToastStore } from "../../stores/toastStore";
import { deleteSession, updateSession } from "../../api/commands";
import type { Session } from "../../types";
import { beginSessionPointerDrag } from "../../utils/folderTree";

interface SessionListProps {
  sessions: Session[];
  title: string;
  onConnect: (session: Session) => void;
  onEdit: (session: Session) => void;
}

export function SessionList({ sessions, title, onConnect, onEdit: _onEdit }: SessionListProps) {
  const { t } = useTranslation();
  const [editingSession, setEditingSession] = useState<Session | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const { folders, updateSessionInStore, removeSession } = useSessionStore();
  const addToast = useToastStore((s) => s.addToast);

  if (sessions.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-xs text-dock-text-muted">{t("home.noSessions")}</p>
      </div>
    );
  }

  const handleDelete = async (session: Session) => {
    try {
      await deleteSession(session.id);
      removeSession(session.id);
      setDeleteConfirm(null);
      addToast("success", `"${session.name}" deleted`);
    } catch (error) {
      addToast("error", `Failed to delete session: ${String(error)}`);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4">
      <h2 className="text-sm font-medium text-dock-text mb-3">{title}</h2>
      <div className="space-y-1">
        {sessions.map((session) => (
          <div
            key={session.id}
            onPointerDown={(event) => beginSessionPointerDrag(event.nativeEvent, session.id)}
            className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-dock-surface transition-colors group cursor-pointer"
            onDoubleClick={() => onConnect(session)}
          >
            {/* Drag handle */}
            <GripVertical size={12} className="text-dock-text-muted opacity-0 group-hover:opacity-50 flex-shrink-0 cursor-grab" />

            {/* Protocol badge */}
            <span
              className={`text-[10px] font-mono px-1.5 py-0.5 rounded flex-shrink-0 ${
                session.protocol === "ssh"
                  ? "bg-emerald-500/10 text-emerald-400"
                  : session.protocol === "telnet"
                    ? "bg-amber-500/10 text-amber-400"
                    : "bg-blue-500/10 text-blue-400"
              }`}
            >
              {session.protocol.toUpperCase()}
            </span>

            {/* Name */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-dock-text truncate">
                  {session.name}
                </span>
                {session.favorite && (
                  <Star size={10} className="text-amber-400 fill-amber-400 flex-shrink-0" />
                )}
              </div>
              <span className="text-[10px] text-dock-text-muted">
                {session.host}{session.port > 0 && session.port !== 22 ? `:${session.port}` : ""}
                {session.username && ` • ${session.username}`}
              </span>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={(e) => { e.stopPropagation(); onConnect(session); }}
                className="p-1.5 rounded hover:bg-dock-accent/20 text-dock-accent"
                title={t("session.connect")}
              >
                <ExternalLink size={12} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setEditingSession(session); }}
                className="p-1.5 rounded hover:bg-dock-surface-hover text-dock-text-muted hover:text-dock-text"
                title="Edit"
              >
                <Pencil size={12} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setDeleteConfirm(session.id); }}
                className="p-1.5 rounded hover:bg-red-500/10 text-dock-text-muted hover:text-red-400"
                title="Delete"
              >
                <Trash2 size={12} />
              </button>
            </div>

            {/* Delete confirmation inline */}
            {deleteConfirm === session.id && (
              <div className="absolute right-4 flex items-center gap-1 bg-dock-sidebar border border-dock-border rounded-md px-2 py-1 shadow-lg z-20">
                <span className="text-[11px] text-dock-text-muted mr-1">Delete?</span>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(session); }}
                  className="px-2 py-0.5 rounded text-[11px] bg-red-500/20 text-red-400 hover:bg-red-500/30"
                >
                  Yes
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setDeleteConfirm(null); }}
                  className="px-2 py-0.5 rounded text-[11px] bg-dock-surface text-dock-text-muted hover:text-dock-text"
                >
                  No
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Edit Session Dialog */}
      {editingSession && (
        <EditSessionDialog
          session={editingSession}
          folders={folders}
          onSave={async (updated) => {
            try {
              const saved = await updateSession({
                ...updated,
                clear_folder: !updated.folder_id,
              });
              updateSessionInStore(saved);
              setEditingSession(null);
              addToast("success", `"${saved.name}" updated`);
            } catch (error) {
              addToast("error", `Failed to update session: ${String(error)}`);
            }
          }}
          onClose={() => setEditingSession(null)}
        />
      )}
    </div>
  );
}

// --- Edit Session Dialog ---

function EditSessionDialog({ session, folders, onSave, onClose }: {
  session: Session;
  folders: { id: string; name: string }[];
  onSave: (session: Session) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState({ ...session });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    await onSave({ ...form, updated_at: new Date().toISOString() });
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-full max-w-lg bg-dock-sidebar border border-dock-border rounded-xl shadow-2xl overflow-hidden animate-fade-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-dock-border">
          <h2 className="text-[13px] font-semibold text-dock-text">Edit Session</h2>
          <button onClick={onClose} className="text-dock-text-muted hover:text-dock-text">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
          {/* Name */}
          <Field label={t("session.name")} value={form.name} onChange={(v) => setForm((p) => ({ ...p, name: v }))} required />

          {/* Host */}
          <Field label={t("session.host")} value={form.host} onChange={(v) => setForm((p) => ({ ...p, host: v }))} />

          {/* Port */}
          <Field label={t("session.port")} value={String(form.port)} type="number" onChange={(v) => setForm((p) => ({ ...p, port: parseInt(v) || 22 }))} />

          {/* Protocol */}
          <div>
            <label className="block text-[11px] text-dock-text-muted mb-1.5">{t("session.protocol")}</label>
            <div className="flex gap-1">
              {(["ssh", "telnet", "serial"] as const).map((p) => (
                <button key={p} type="button" onClick={() => setForm((prev) => ({ ...prev, protocol: p }))}
                  className={`px-3 py-1.5 rounded text-[11px] font-medium ${form.protocol === p ? "bg-dock-accent text-white" : "bg-dock-surface text-dock-text-muted"}`}
                >{p.toUpperCase()}</button>
              ))}
            </div>
          </div>

          {/* Username */}
          <Field label={t("session.username")} value={form.username || ""} onChange={(v) => setForm((p) => ({ ...p, username: v || undefined }))} />

          <div>
            <label className="block text-[11px] text-dock-text-muted mb-1.5">{t("session.folder")}</label>
            <select
              value={form.folder_id || ""}
              onChange={(e) => setForm((p) => ({ ...p, folder_id: e.target.value || undefined }))}
              className="w-full px-3 py-2 rounded-lg bg-dock-bg border border-dock-border text-[12px] text-dock-text focus:border-dock-accent focus:outline-none"
            >
              <option value="">No folder</option>
              {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
            </select>
          </div>

          {/* Device info */}
          <div className="grid grid-cols-3 gap-3">
            <Field label={t("session.deviceType")} value={form.device_type || ""} onChange={(v) => setForm((p) => ({ ...p, device_type: v || undefined }))} />
            <Field label={t("session.vendor")} value={form.vendor || ""} onChange={(v) => setForm((p) => ({ ...p, vendor: v || undefined }))} />
            <Field label={t("session.model")} value={form.model || ""} onChange={(v) => setForm((p) => ({ ...p, model: v || undefined }))} />
          </div>

          {/* Description */}
          <Field label={t("session.description")} value={form.description || ""} onChange={(v) => setForm((p) => ({ ...p, description: v || undefined }))} />

          {/* Favorite */}
          <label className="flex items-center gap-2 text-[11px] text-dock-text-muted cursor-pointer">
            <input type="checkbox" checked={form.favorite} onChange={(e) => setForm((p) => ({ ...p, favorite: e.target.checked }))} className="rounded border-dock-border" />
            {t("session.favorite")}
          </label>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-3 border-t border-dock-border">
            <button type="button" onClick={onClose}
              className="px-4 py-2 rounded-lg text-[12px] text-dock-text-muted bg-dock-surface hover:bg-dock-surface-hover">
              {t("session.cancel")}
            </button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 rounded-lg text-[12px] text-white bg-dock-accent hover:bg-dock-accent-hover">
              {saving ? "Saving..." : t("session.save")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", required }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean;
}) {
  return (
    <div>
      <label className="block text-[11px] text-dock-text-muted mb-1.5">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} required={required}
        className="w-full px-3 py-2 rounded-lg bg-dock-bg border border-dock-border text-[12px] text-dock-text placeholder-dock-text-muted focus:border-dock-accent focus:outline-none" />
    </div>
  );
}
