import { useDeferredValue, useEffect, useState } from "react";
import { CircleStop, ExternalLink, Network, RefreshCw, Search, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { nativeInvoke } from "../../api/native";
import { listTerminalPaneIds, useAppStore } from "../../stores/appStore";
import { type SshTunnelInfo, useTunnelStore } from "../../stores/tunnelStore";
import { useToastStore } from "../../stores/toastStore";

type TunnelFilter = "all" | SshTunnelInfo["mode"];

export function TunnelsView() {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<TunnelFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase());
  const tunnels = useTunnelStore((state) => state.tunnels);
  const setAllTunnels = useTunnelStore((state) => state.setAllTunnels);
  const removeTunnel = useTunnelStore((state) => state.removeTunnel);
  const { tabs, setActiveTab, setActivePane, setCurrentView } = useAppStore();
  const addToast = useToastStore((state) => state.addToast);

  const refresh = async () => {
    setLoading(true);
    setError(undefined);
    try {
      setAllTunnels(await nativeInvoke<SshTunnelInfo[]>("list_ssh_tunnels", {}));
    } catch (refreshError) {
      setError(String(refreshError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const ownerFor = (tunnel: SshTunnelInfo) => tabs.find((tab) =>
    listTerminalPaneIds(tab.paneLayout ?? { type: "pane", id: tab.id }).includes(tunnel.tabId));
  const visibleTunnels = tunnels.filter((tunnel) => {
    if (filter !== "all" && tunnel.mode !== filter) return false;
    if (!deferredQuery) return true;
    const owner = ownerFor(tunnel);
    return [tunnel.mode, tunnel.bindAddress, String(tunnel.bindPort), tunnel.targetHost, String(tunnel.targetPort), owner?.sessionName, owner?.host]
      .some((value) => value?.toLocaleLowerCase().includes(deferredQuery));
  });

  const focusOwner = (tunnel: SshTunnelInfo) => {
    const owner = ownerFor(tunnel);
    if (!owner) return;
    setActiveTab(owner.id);
    setActivePane(owner.id, tunnel.tabId);
    setCurrentView("recent");
  };

  const stop = async (tunnel: SshTunnelInfo) => {
    try {
      await nativeInvoke("stop_ssh_tunnel", { tunnelId: tunnel.id });
      removeTunnel(tunnel.id);
    } catch (stopError) {
      addToast("error", String(stopError));
    }
  };

  const modeCount = (mode: SshTunnelInfo["mode"]) => tunnels.filter((tunnel) => tunnel.mode === mode).length;

  return (
    <div className="flex h-full min-h-0 flex-col bg-dock-bg">
      <header className="border-b border-dock-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Network size={16} className="text-dock-accent" />
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-dock-text">{t("tunnelsWorkspace.title")}</h2>
            <p className="text-[10px] text-dock-text-muted">{t("tunnelsWorkspace.summary", { count: tunnels.length })}</p>
          </div>
          <TunnelCount label={t("tunnelsWorkspace.local")} count={modeCount("local")} />
          <TunnelCount label={t("tunnelsWorkspace.remote")} count={modeCount("remote")} />
          <TunnelCount label={t("tunnelsWorkspace.dynamic")} count={modeCount("dynamic")} />
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2 border-b border-dock-border px-4 py-2">
        <div className="flex h-7 min-w-48 max-w-sm flex-1 items-center gap-2 rounded border border-dock-border bg-dock-sidebar px-2">
          <Search size={12} className="text-dock-text-muted" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("tunnelsWorkspace.search")} className="min-w-0 flex-1 bg-transparent text-[11px] text-dock-text outline-none placeholder:text-dock-text-muted" />
          {query && <button type="button" onClick={() => setQuery("")} className="text-dock-text-muted hover:text-dock-text" aria-label={t("tunnelsWorkspace.clearSearch")}><X size={11} /></button>}
        </div>
        <div className="flex h-7 rounded border border-dock-border bg-dock-sidebar p-0.5" role="group" aria-label={t("tunnelsWorkspace.filterMode")}>
          {(["all", "local", "remote", "dynamic"] as const).map((option) => (
            <button key={option} type="button" aria-pressed={filter === option} onClick={() => setFilter(option)} className={`rounded px-2 text-[10px] font-medium ${filter === option ? "bg-dock-surface text-dock-text" : "text-dock-text-muted hover:text-dock-text"}`}>
              {t(`tunnelsWorkspace.${option}`)}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => void refresh()} disabled={loading} className="flex h-7 items-center gap-1 rounded border border-dock-border px-2 text-[10px] text-dock-text-muted hover:text-dock-text disabled:opacity-40" title={t("tunnels.refresh")}>
          <RefreshCw size={11} className={loading ? "animate-spin" : ""} />
          <span>{t("tunnelsWorkspace.refresh")}</span>
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-3">
        {loading ? (
          <div className="flex h-full items-center justify-center text-xs text-dock-text-muted">{t("tunnels.loading")}</div>
        ) : error ? (
          <div className="p-3 text-xs text-red-400" role="alert">{error}</div>
        ) : tunnels.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-center text-xs text-dock-text-muted"><span>{t("tunnelsWorkspace.empty")}</span><span className="text-[10px]">{t("tunnelsWorkspace.emptyHint")}</span></div>
        ) : visibleTunnels.length === 0 ? (
          <div className="px-2 py-4 text-xs text-dock-text-muted">{t("tunnelsWorkspace.noMatches")}</div>
        ) : (
          <div className="min-w-[680px]">
            <div className="grid grid-cols-[100px_minmax(180px,1.2fr)_28px_minmax(180px,1.2fr)_minmax(150px,1fr)_100px] gap-2 border-b border-dock-border px-2.5 py-1.5 text-[9px] font-semibold uppercase text-dock-text-muted">
              <span>{t("tunnelsWorkspace.mode")}</span>
              <span>{t("tunnelsWorkspace.listener")}</span>
              <span />
              <span>{t("tunnelsWorkspace.target")}</span>
              <span>{t("tunnelsWorkspace.connection")}</span>
              <span className="text-end">{t("tunnelsWorkspace.actions")}</span>
            </div>
            {visibleTunnels.map((tunnel) => {
              const owner = ownerFor(tunnel);
              return (
                <div key={tunnel.id} className="grid min-h-11 grid-cols-[100px_minmax(180px,1.2fr)_28px_minmax(180px,1.2fr)_minmax(150px,1fr)_100px] items-center gap-2 border-b border-dock-border/70 px-2.5 py-1.5 hover:bg-dock-surface">
                  <span className="w-fit rounded bg-dock-sidebar px-1.5 py-0.5 text-[9px] font-semibold uppercase text-dock-text-muted">{t(`tunnelsWorkspace.${tunnel.mode}`)}</span>
                  <code className="truncate text-[10px] text-dock-text" dir="ltr">{tunnel.bindAddress}:{tunnel.bindPort}</code>
                  <span className="text-center text-dock-text-muted" aria-hidden="true">→</span>
                  <code className="truncate text-[10px] text-dock-text" dir="ltr">{tunnel.mode === "dynamic" ? "SOCKS5" : `${tunnel.targetHost}:${tunnel.targetPort}`}</code>
                  <div className="min-w-0">
                    <p className="truncate text-[10px] text-dock-text">{owner?.sessionName ?? t("tunnelsWorkspace.closedConnection")}</p>
                    {owner && <p className="truncate font-mono text-[9px] text-dock-text-muted" dir="ltr">{owner.host}</p>}
                  </div>
                  <div className="flex justify-end gap-0.5">
                    {owner && <ActionButton label={t("tunnelsWorkspace.focus")} onClick={() => focusOwner(tunnel)} icon={ExternalLink} />}
                    <ActionButton label={t("tunnels.stop")} onClick={() => void stop(tunnel)} icon={CircleStop} danger />
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

function TunnelCount({ label, count }: { label: string; count: number }) {
  return <div className="min-w-14 text-end"><span className="text-xs font-semibold tabular-nums text-emerald-400">{count}</span><span className="ms-1 text-[9px] text-dock-text-muted">{label}</span></div>;
}

function ActionButton({ label, onClick, icon: Icon, danger = false }: { label: string; onClick: () => void; icon: typeof X; danger?: boolean }) {
  return <button type="button" onClick={onClick} className={`p-1.5 ${danger ? "text-dock-text-muted hover:text-red-400" : "text-dock-text-muted hover:text-dock-accent"}`} title={label} aria-label={label}><Icon size={12} /></button>;
}