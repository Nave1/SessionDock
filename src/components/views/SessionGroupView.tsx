import { useEffect, useState } from "react";
import { Check, Pencil, PlugZap, Save, Search, Trash2, Users, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  deleteSessionGroup,
  getSessionGroupMembers,
  setSessionGroupMembers,
  updateSessionGroup,
} from "../../api/commands";
import { useAppStore } from "../../stores/appStore";
import { useSessionStore } from "../../stores/sessionStore";
import { useToastStore } from "../../stores/toastStore";
import type { Session } from "../../types";

const MAX_CONNECT_ALL_SESSIONS = 25;

export function SessionGroupView() {
  const { t } = useTranslation();
  const selectedGroupId = useAppStore((state) => state.selectedGroupId);
  const addTab = useAppStore((state) => state.addTab);
  const setCurrentView = useAppStore((state) => state.setCurrentView);
  const setSelectedGroupId = useAppStore((state) => state.setSelectedGroupId);
  const { groups, sessions, updateGroupInStore, removeGroup } = useSessionStore();
  const addToast = useToastStore((state) => state.addToast);
  const [memberIds, setMemberIds] = useState<Set<string>>(new Set());
  const [draftMemberIds, setDraftMemberIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [managing, setManaging] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const group = groups.find((item) => item.id === selectedGroupId);

  useEffect(() => {
    let cancelled = false;
    if (!selectedGroupId) {
      setLoading(false);
      setMemberIds(new Set());
      setDraftMemberIds(new Set());
      return;
    }
    setLoading(true);
    void getSessionGroupMembers(selectedGroupId)
      .then((ids) => {
        if (cancelled) return;
        const members = new Set(ids);
        setMemberIds(members);
        setDraftMemberIds(new Set(members));
      })
      .catch((error) => {
        if (!cancelled) addToast("error", `${t("groups.loadFailed")}: ${String(error)}`);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [addToast, selectedGroupId, t]);

  if (!group) {
    return <div className="h-full flex items-center justify-center text-xs text-dock-text-muted">{t("groups.selectGroup")}</div>;
  }

  const memberSessions = sessions.filter((session) => memberIds.has(session.id));
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleSessions = (managing ? sessions : memberSessions).filter((session) =>
    !normalizedQuery
    || session.name.toLocaleLowerCase().includes(normalizedQuery)
    || session.host.toLocaleLowerCase().includes(normalizedQuery)
    || session.username?.toLocaleLowerCase().includes(normalizedQuery),
  );
  const membershipChanged = memberIds.size !== draftMemberIds.size
    || [...memberIds].some((id) => !draftMemberIds.has(id));

  const connectSession = (session: Session) => {
    addTab({
      id: crypto.randomUUID(),
      sessionId: session.id,
      sessionName: session.name,
      host: session.host,
      port: session.port,
      protocol: session.protocol,
      username: session.username,
      status: "connecting",
      pinned: false,
      bmc: session.protocol === "bmc" ? session : undefined,
    });
    setCurrentView("recent");
  };

  const connectAll = () => {
    if (memberSessions.length === 0) return;
    if (memberSessions.length > MAX_CONNECT_ALL_SESSIONS) {
      addToast("error", t("groups.connectLimit", { count: MAX_CONNECT_ALL_SESSIONS }));
      return;
    }
    if (memberSessions.length > 10 && !window.confirm(t("groups.connectConfirm", { count: memberSessions.length }))) return;
    memberSessions.forEach(connectSession);
  };

  const saveMembership = async () => {
    setSaving(true);
    try {
      const updated = await setSessionGroupMembers(group.id, [...draftMemberIds]);
      setMemberIds(new Set(draftMemberIds));
      updateGroupInStore(updated);
      setManaging(false);
      addToast("success", t("groups.membersSaved"));
    } catch (error) {
      addToast("error", `${t("groups.saveFailed")}: ${String(error)}`);
    } finally {
      setSaving(false);
    }
  };

  const renameGroup = async () => {
    const name = window.prompt(t("groups.namePrompt"), group.name)?.trim();
    if (!name || name === group.name) return;
    try {
      updateGroupInStore(await updateSessionGroup(group.id, name));
    } catch (error) {
      addToast("error", `${t("groups.renameFailed")}: ${String(error)}`);
    }
  };

  const removeCurrentGroup = async () => {
    if (!window.confirm(t("groups.deleteConfirm", { name: group.name }))) return;
    try {
      await deleteSessionGroup(group.id);
      removeGroup(group.id);
      setSelectedGroupId(null);
      setCurrentView("allSessions");
    } catch (error) {
      addToast("error", `${t("groups.deleteFailed")}: ${String(error)}`);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-dock-bg">
      <header className="flex min-h-14 items-center gap-3 border-b border-dock-border px-4 py-2">
        <Users size={16} className="text-dock-accent" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-dock-text">{group.name}</h2>
          <p className="text-[10px] text-dock-text-muted">{t("groups.memberCount", { count: memberIds.size })}</p>
        </div>
        <button type="button" onClick={connectAll} disabled={loading || memberSessions.length === 0} className="flex h-7 items-center gap-1.5 rounded bg-dock-accent px-2.5 text-[11px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-40">
          <PlugZap size={12} />
          {t("groups.connectAll")}
        </button>
        <button type="button" onClick={() => { setManaging((value) => !value); setDraftMemberIds(new Set(memberIds)); }} className="h-7 rounded bg-dock-surface px-2.5 text-[11px] text-dock-text-muted hover:text-dock-text">
          {managing ? t("groups.done") : t("groups.manage")}
        </button>
        <button type="button" onClick={() => void renameGroup()} className="p-1.5 text-dock-text-muted hover:text-dock-text" title={t("groups.rename")}><Pencil size={13} /></button>
        <button type="button" onClick={() => void removeCurrentGroup()} className="p-1.5 text-dock-text-muted hover:text-red-400" title={t("groups.delete")}><Trash2 size={13} /></button>
      </header>

      <div className="flex items-center gap-2 border-b border-dock-border px-4 py-2">
        <div className="flex h-7 min-w-0 max-w-sm flex-1 items-center gap-2 rounded border border-dock-border bg-dock-sidebar px-2">
          <Search size={12} className="text-dock-text-muted" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("groups.searchSessions")} className="min-w-0 flex-1 bg-transparent text-[11px] text-dock-text outline-none placeholder:text-dock-text-muted" />
          {query && <button type="button" onClick={() => setQuery("")} className="text-dock-text-muted hover:text-dock-text"><X size={11} /></button>}
        </div>
        {managing && (
          <button type="button" onClick={() => void saveMembership()} disabled={!membershipChanged || saving} className="flex h-7 items-center gap-1.5 rounded bg-dock-accent px-2.5 text-[11px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-40">
            <Save size={12} />
            {saving ? t("groups.saving") : t("groups.saveMembers")}
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {loading ? (
          <p className="px-2 py-4 text-xs text-dock-text-muted">{t("groups.loading")}</p>
        ) : visibleSessions.length === 0 ? (
          <p className="px-2 py-4 text-xs text-dock-text-muted">{managing ? t("groups.noMatchingSessions") : t("groups.noMembers")}</p>
        ) : (
          <div className="space-y-1">
            {visibleSessions.map((session) => {
              const selected = draftMemberIds.has(session.id);
              return (
                <div key={session.id} className="flex min-h-10 items-center gap-2 rounded px-2.5 py-1.5 hover:bg-dock-surface">
                  {managing && (
                    <button type="button" role="checkbox" aria-checked={selected} aria-label={t("groups.toggleMembership", { name: session.name })} onClick={() => setDraftMemberIds((current) => {
                      const next = new Set(current);
                      if (next.has(session.id)) next.delete(session.id); else next.add(session.id);
                      return next;
                    })} className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border ${selected ? "border-dock-accent bg-dock-accent text-white" : "border-dock-border text-transparent"}`}>
                      <Check size={11} />
                    </button>
                  )}
                  <span className="w-12 flex-shrink-0 text-[9px] font-medium uppercase text-dock-text-muted">{session.protocol}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-dock-text">{session.name}</p>
                    <p className="truncate text-[10px] text-dock-text-muted">{session.host}{session.username ? ` · ${session.username}` : ""}</p>
                  </div>
                  {!managing && <button type="button" onClick={() => connectSession(session)} className="p-1.5 text-dock-text-muted hover:text-dock-accent" title={t("session.connect")}><PlugZap size={12} /></button>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}