import { useDeferredValue, useState } from "react";
import { Activity, ExternalLink, Power, RotateCw, Search, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { nativeInvoke } from "../../api/native";
import {
  listTerminalPaneIds,
  type ConnectionStatus,
  type TerminalTab,
  useAppStore,
} from "../../stores/appStore";
import { useToastStore } from "../../stores/toastStore";

type StatusFilter = "all" | "connected" | "attention";

interface ConnectionRow {
  tab: TerminalTab;
  paneId: string;
  status: ConnectionStatus;
  paneIndex: number;
  paneCount: number;
}

const TERMINAL_PROTOCOLS = new Set(["ssh", "telnet", "serial"]);
const ATTENTION_STATUSES = new Set<ConnectionStatus>([
  "disconnected",
  "auth_failed",
  "host_key_warning",
  "timeout",
  "error",
]);

export function ActiveConnectionsView() {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase());
  const {
    tabs,
    removeTab,
    closeTabPane,
    setActiveTab,
    setActivePane,
    setCurrentView,
    requestPaneReconnect,
    requestPaneDisconnect,
  } = useAppStore();
  const addToast = useToastStore((state) => state.addToast);

  const rows = tabs.flatMap<ConnectionRow>((tab) => {
    const paneIds = listTerminalPaneIds(tab.paneLayout ?? { type: "pane", id: tab.id });
    return paneIds.map((paneId, paneIndex) => ({
      tab,
      paneId,
      status: tab.paneStatuses?.[paneId] ?? tab.status,
      paneIndex,
      paneCount: paneIds.length,
    }));
  });
  const connectedCount = rows.filter(({ status }) => status === "connected").length;
  const transitionalCount = rows.filter(({ status }) => status === "connecting" || status === "reconnecting").length;
  const attentionCount = rows.filter(({ status }) => ATTENTION_STATUSES.has(status)).length;
  const visibleRows = rows.filter(({ tab, status }) => {
    if (statusFilter === "connected" && status !== "connected") return false;
    if (statusFilter === "attention" && !ATTENTION_STATUSES.has(status)) return false;
    if (!deferredQuery) return true;
    return [tab.sessionName, tab.host, tab.username, tab.protocol, String(tab.port ?? "")]
      .some((value) => value?.toLocaleLowerCase().includes(deferredQuery));
  });

  const focusPane = (row: ConnectionRow) => {
    setActiveTab(row.tab.id);
    setActivePane(row.tab.id, row.paneId);
    setCurrentView("recent");
  };

  const closePane = async (row: ConnectionRow) => {
    try {
      if (TERMINAL_PROTOCOLS.has(row.tab.protocol)) {
        await nativeInvoke("close_terminal", { tabId: row.paneId, protocol: row.tab.protocol });
      }
      if (row.paneCount > 1) closeTabPane(row.tab.id, row.paneId);
      else removeTab(row.tab.id);
    } catch (error) {
      addToast("error", `${t("activeConnections.closeFailed")}: ${String(error)}`);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-dock-bg">
      <header className="border-b border-dock-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Activity size={16} className="text-dock-accent" />
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-dock-text">{t("activeConnections.title")}</h2>
            <p className="text-[10px] text-dock-text-muted">{t("activeConnections.summary", { count: rows.length })}</p>
          </div>
          <StatusCount label={t("activeConnections.connected")} count={connectedCount} tone="connected" />
          <StatusCount label={t("activeConnections.transitioning")} count={transitionalCount} tone="transitioning" />
          <StatusCount label={t("activeConnections.attention")} count={attentionCount} tone="attention" />
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2 border-b border-dock-border px-4 py-2">
        <div className="flex h-7 min-w-48 max-w-sm flex-1 items-center gap-2 rounded border border-dock-border bg-dock-sidebar px-2">
          <Search size={12} className="text-dock-text-muted" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("activeConnections.search")} className="min-w-0 flex-1 bg-transparent text-[11px] text-dock-text outline-none placeholder:text-dock-text-muted" />
          {query && <button type="button" onClick={() => setQuery("")} className="text-dock-text-muted hover:text-dock-text" aria-label={t("activeConnections.clearSearch")}><X size={11} /></button>}
        </div>
        <div className="flex h-7 rounded border border-dock-border bg-dock-sidebar p-0.5" role="group" aria-label={t("activeConnections.filterStatus")}>
          {(["all", "connected", "attention"] as const).map((filter) => (
            <button key={filter} type="button" aria-pressed={statusFilter === filter} onClick={() => setStatusFilter(filter)} className={`rounded px-2 text-[10px] font-medium ${statusFilter === filter ? "bg-dock-surface text-dock-text" : "text-dock-text-muted hover:text-dock-text"}`}>
              {t(`activeConnections.${filter}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-3">
        {rows.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-dock-text-muted">{t("activeConnections.empty")}</div>
        ) : visibleRows.length === 0 ? (
          <div className="px-2 py-4 text-xs text-dock-text-muted">{t("activeConnections.noMatches")}</div>
        ) : (
          <div className="min-w-[620px]">
            <div className="grid grid-cols-[minmax(180px,1.5fr)_90px_minmax(170px,1.2fr)_105px_120px] gap-2 border-b border-dock-border px-2.5 py-1.5 text-[9px] font-semibold uppercase text-dock-text-muted">
              <span>{t("activeConnections.connection")}</span>
              <span>{t("activeConnections.protocol")}</span>
              <span>{t("activeConnections.endpoint")}</span>
              <span>{t("activeConnections.status")}</span>
              <span className="text-end">{t("activeConnections.actions")}</span>
            </div>
            {visibleRows.map((row) => {
              const canDisconnect = TERMINAL_PROTOCOLS.has(row.tab.protocol)
                && (row.status === "connected" || row.status === "connecting" || row.status === "reconnecting");
              const canReconnect = TERMINAL_PROTOCOLS.has(row.tab.protocol) && ATTENTION_STATUSES.has(row.status);
              return (
                <div key={`${row.tab.id}:${row.paneId}`} className="grid min-h-11 grid-cols-[minmax(180px,1.5fr)_90px_minmax(170px,1.2fr)_105px_120px] items-center gap-2 border-b border-dock-border/70 px-2.5 py-1.5 hover:bg-dock-surface">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-dock-text">{row.tab.sessionName}</p>
                    <p className="truncate text-[9px] text-dock-text-muted">{row.paneCount > 1 ? t("activeConnections.pane", { index: row.paneIndex + 1, count: row.paneCount }) : row.paneId}</p>
                  </div>
                  <span className="w-fit rounded bg-dock-sidebar px-1.5 py-0.5 text-[9px] font-semibold uppercase text-dock-text-muted">{row.tab.protocol}</span>
                  <div className="min-w-0 font-mono text-[10px] text-dock-text-muted">
                    <p className="truncate" dir="ltr">{row.tab.host}{row.tab.port ? `:${row.tab.port}` : ""}</p>
                    {row.tab.username && <p className="truncate" dir="ltr">{row.tab.username}</p>}
                  </div>
                  <ConnectionStatusLabel status={row.status} />
                  <div className="flex justify-end gap-0.5">
                    <ActionButton label={t("activeConnections.focus")} onClick={() => focusPane(row)} icon={ExternalLink} />
                    {canDisconnect && <ActionButton label={t("session.disconnect")} onClick={() => requestPaneDisconnect(row.tab.id, row.paneId)} icon={Power} />}
                    {canReconnect && <ActionButton label={t("session.reconnect")} onClick={() => requestPaneReconnect(row.tab.id, row.paneId)} icon={RotateCw} />}
                    <ActionButton label={t("activeConnections.close")} onClick={() => void closePane(row)} icon={X} danger />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusCount({ label, count, tone }: { label: string; count: number; tone: "connected" | "transitioning" | "attention" }) {
  const color = tone === "connected" ? "text-emerald-400" : tone === "transitioning" ? "text-amber-400" : "text-red-400";
  return <div className="min-w-16 text-end"><span className={`text-xs font-semibold tabular-nums ${color}`}>{count}</span><span className="ms-1 text-[9px] text-dock-text-muted">{label}</span></div>;
}

function ConnectionStatusLabel({ status }: { status: ConnectionStatus }) {
  const { t } = useTranslation();
  const tone = status === "connected" ? "bg-emerald-400" : status === "connecting" || status === "reconnecting" ? "bg-amber-400" : status === "idle" || status === "disconnected" ? "bg-zinc-500" : "bg-red-400";
  return <span className="flex items-center gap-1.5 text-[10px] text-dock-text-muted"><span className={`h-1.5 w-1.5 rounded-full ${tone}`} /><span className="truncate">{t(`activeConnections.statuses.${status}`)}</span></span>;
}

function ActionButton({ label, onClick, icon: Icon, danger = false }: { label: string; onClick: () => void; icon: typeof X; danger?: boolean }) {
  return <button type="button" onClick={onClick} className={`p-1.5 ${danger ? "text-dock-text-muted hover:text-red-400" : "text-dock-text-muted hover:text-dock-accent"}`} title={label} aria-label={label}><Icon size={12} /></button>;
}