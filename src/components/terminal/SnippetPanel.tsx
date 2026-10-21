import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Code2, Pencil, Plus, Save, Search, Star, Trash2, X } from "lucide-react";
import { nativeInvoke } from "../../api/native";

interface SnippetPanelProps {
  tabId: string;
  onClose: () => void;
}

interface Snippet {
  id: string;
  name: string;
  command: string;
  description?: string;
  category?: string;
  vendor?: string;
  device_type?: string;
  favorite: boolean;
  destructive: boolean;
}

interface SnippetDraft {
  name: string;
  command: string;
  description: string;
  category: string;
  vendor: string;
  favorite: boolean;
  destructive: boolean;
}

const emptyDraft: SnippetDraft = {
  name: "",
  command: "",
  description: "",
  category: "",
  vendor: "",
  favorite: false,
  destructive: false,
};

export function SnippetPanel({ tabId, onClose }: SnippetPanelProps) {
  const { t } = useTranslation();
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [editingId, setEditingId] = useState<string | null>();
  const [draft, setDraft] = useState<SnippetDraft>(emptyDraft);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      setSnippets(await nativeInvoke<Snippet[]>("get_snippets"));
    } catch (loadError) {
      setError(String(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const beginCreate = () => {
    setEditingId(null);
    setDraft(emptyDraft);
  };

  const beginEdit = (snippet: Snippet) => {
    setEditingId(snippet.id);
    setDraft({
      name: snippet.name,
      command: snippet.command,
      description: snippet.description ?? "",
      category: snippet.category ?? "",
      vendor: snippet.vendor ?? "",
      favorite: snippet.favorite,
      destructive: snippet.destructive,
    });
  };

  const save = async () => {
    if (!draft.name.trim() || !draft.command.trim()) return;
    setSaving(true);
    setError(undefined);
    try {
      const request = {
        name: draft.name.trim(),
        command: draft.command,
        description: draft.description.trim(),
        category: draft.category.trim(),
        vendor: draft.vendor.trim(),
        favorite: draft.favorite,
        destructive: draft.destructive,
      };
      if (editingId) {
        await nativeInvoke("update_snippet", { request: { id: editingId, ...request } });
      } else {
        await nativeInvoke("create_snippet", { request });
      }
      setEditingId(undefined);
      setDraft(emptyDraft);
      await load();
    } catch (saveError) {
      setError(String(saveError));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (snippet: Snippet) => {
    if (!window.confirm(t("snippets.confirmDelete", { name: snippet.name }))) return;
    try {
      await nativeInvoke("delete_snippet", { id: snippet.id });
      setSnippets((current) => current.filter((item) => item.id !== snippet.id));
    } catch (deleteError) {
      setError(String(deleteError));
    }
  };

  const toggleFavorite = async (snippet: Snippet) => {
    try {
      await nativeInvoke("update_snippet", { request: { id: snippet.id, favorite: !snippet.favorite } });
      setSnippets((current) => current
        .map((item) => item.id === snippet.id ? { ...item, favorite: !item.favorite } : item)
        .sort((left, right) => Number(right.favorite) - Number(left.favorite) || left.name.localeCompare(right.name)));
    } catch (favoriteError) {
      setError(String(favoriteError));
    }
  };

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filtered = normalizedQuery
    ? snippets.filter((snippet) => [snippet.name, snippet.command, snippet.description, snippet.category, snippet.vendor]
      .some((value) => value?.toLocaleLowerCase().includes(normalizedQuery)))
    : snippets;
  const formOpen = editingId !== undefined;

  return (
    <aside className="w-[360px] max-w-[50vw] min-w-[300px] h-full flex flex-col bg-dock-sidebar border-s border-dock-border" aria-label={t("snippets.title")}>
      <div className="h-9 px-2 flex items-center gap-1 border-b border-dock-border flex-shrink-0">
        <Code2 size={14} className="text-dock-accent" />
        <h2 className="text-xs font-semibold text-dock-text flex-1">{t("snippets.title")}</h2>
        <IconButton label={t("snippets.new")} onClick={beginCreate} icon={Plus} />
        <IconButton label={t("snippets.close")} onClick={onClose} icon={X} />
      </div>

      <div className="p-2 border-b border-dock-border">
        <label className="h-7 px-2 flex items-center gap-2 rounded border border-dock-border bg-dock-bg focus-within:border-dock-accent">
          <Search size={12} className="text-dock-text-muted" />
          <span className="sr-only">{t("snippets.search")}</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("snippets.search")} className="min-w-0 flex-1 bg-transparent text-[11px] text-dock-text outline-none placeholder:text-dock-text-muted" />
        </label>
      </div>

      {formOpen && (
        <form className="p-3 space-y-2 border-b border-dock-border" onSubmit={(event) => { event.preventDefault(); void save(); }}>
          <TextField label={t("snippets.name")} value={draft.name} onChange={(name) => setDraft((current) => ({ ...current, name }))} maxLength={120} />
          <label className="block text-[10px] text-dock-text-muted">
            {t("snippets.command")}
            <textarea value={draft.command} onChange={(event) => setDraft((current) => ({ ...current, command: event.target.value }))} dir="ltr" maxLength={8192} rows={3} className="mt-1 w-full resize-y px-2 py-1 rounded border border-dock-border bg-dock-bg text-[11px] leading-4 font-mono text-dock-text outline-none focus:border-dock-accent" />
          </label>
          <TextField label={t("snippets.description")} value={draft.description} onChange={(description) => setDraft((current) => ({ ...current, description }))} maxLength={500} />
          <div className="grid grid-cols-2 gap-2">
            <TextField label={t("snippets.category")} value={draft.category} onChange={(category) => setDraft((current) => ({ ...current, category }))} maxLength={80} />
            <TextField label={t("snippets.vendor")} value={draft.vendor} onChange={(vendor) => setDraft((current) => ({ ...current, vendor }))} maxLength={80} />
          </div>
          <div className="flex items-center gap-3 text-[10px] text-dock-text-muted">
            <CheckField label={t("snippets.favorite")} checked={draft.favorite} onChange={(favorite) => setDraft((current) => ({ ...current, favorite }))} />
            <CheckField label={t("snippets.destructive")} checked={draft.destructive} onChange={(destructive) => setDraft((current) => ({ ...current, destructive }))} />
            <span className="flex-1" />
            <button type="button" onClick={() => setEditingId(undefined)} className="h-7 px-2 rounded text-dock-text-muted hover:bg-dock-surface-hover">{t("snippets.cancel")}</button>
            <button type="submit" disabled={saving || !draft.name.trim() || !draft.command.trim()} className="h-7 px-2 flex items-center gap-1 rounded bg-dock-accent text-white disabled:opacity-40">
              <Save size={12} />{t("snippets.save")}
            </button>
          </div>
        </form>
      )}

      {error && <div role="alert" className="px-3 py-2 border-b border-red-500/30 bg-red-500/10 text-[10px] text-red-400 break-words">{error}</div>}

      <div className="flex-1 min-h-0 overflow-auto" aria-live="polite">
        {loading && <div className="p-4 text-center text-xs text-dock-text-muted">{t("snippets.loading")}</div>}
        {!loading && filtered.length === 0 && <div className="p-4 text-center text-xs text-dock-text-muted">{t(query ? "snippets.noResults" : "snippets.empty")}</div>}
        {!loading && filtered.map((snippet) => (
          <article key={snippet.id} className="px-2 py-2 border-b border-dock-border/60">
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => void toggleFavorite(snippet)} title={t("snippets.favorite")} aria-label={t("snippets.favorite")} className={`p-1 rounded hover:bg-dock-surface-hover ${snippet.favorite ? "text-amber-400" : "text-dock-text-muted"}`}>
                <Star size={12} fill={snippet.favorite ? "currentColor" : "none"} />
              </button>
              <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-dock-text" title={snippet.name}>{snippet.name}</span>
              {snippet.destructive && <span className="px-1 py-0.5 rounded bg-red-500/15 text-[9px] font-semibold text-red-400">{t("snippets.destructive")}</span>}
              <IconButton label={t("snippets.edit")} onClick={() => beginEdit(snippet)} icon={Pencil} />
              <IconButton label={t("snippets.delete")} onClick={() => void remove(snippet)} icon={Trash2} danger />
            </div>
            <pre className="mt-1 px-2 py-1.5 overflow-x-auto rounded bg-dock-bg text-[10px] leading-4 font-mono text-dock-text whitespace-pre-wrap break-words" dir="ltr">{snippet.command}</pre>
            {(snippet.description || snippet.category || snippet.vendor) && (
              <div className="mt-1 flex items-center gap-1 text-[9px] text-dock-text-muted">
                {snippet.category && <span>{snippet.category}</span>}
                {snippet.vendor && <span>· {snippet.vendor}</span>}
                {snippet.description && <span className="min-w-0 truncate">· {snippet.description}</span>}
              </div>
            )}
            <button type="button" onClick={() => void nativeInvoke("write_terminal", { tabId, data: snippet.command, protocol: "ssh" }).catch((insertError) => setError(String(insertError)))} className="mt-2 h-7 w-full rounded border border-dock-border text-[10px] font-medium text-dock-text hover:bg-dock-surface-hover">
              {t("snippets.insert")}
            </button>
          </article>
        ))}
      </div>
    </aside>
  );
}

function TextField({ label, value, onChange, maxLength }: { label: string; value: string; onChange: (value: string) => void; maxLength: number }) {
  return (
    <label className="block min-w-0 text-[10px] text-dock-text-muted">
      {label}
      <input value={value} onChange={(event) => onChange(event.target.value)} maxLength={maxLength} className="mt-1 w-full h-7 px-2 rounded border border-dock-border bg-dock-bg text-[11px] text-dock-text outline-none focus:border-dock-accent" />
    </label>
  );
}

function CheckField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="flex items-center gap-1"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />{label}</label>;
}

function IconButton({ label, onClick, icon: Icon, danger = false }: { label: string; onClick: () => void; icon: typeof X; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} title={label} aria-label={label} className={`p-1 rounded hover:bg-dock-surface-hover ${danger ? "text-red-400" : "text-dock-text-muted hover:text-dock-text"}`}>
      <Icon size={13} />
    </button>
  );
}