import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CircleStop, Network, Plus, RefreshCw, X } from "lucide-react";
import { nativeInvoke } from "../../api/native";
import { useToastStore } from "../../stores/toastStore";
import { type SshTunnelInfo, useTunnelStore } from "../../stores/tunnelStore";

interface TunnelPanelProps {
  tabId: string;
  onClose: () => void;
}

function parsePort(value: string, allowAuto: boolean): number | undefined {
  if (value === "" && allowAuto) return 0;
  if (!/^\d+$/.test(value)) return undefined;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return undefined;
  return port;
}

export function TunnelPanel({ tabId, onClose }: TunnelPanelProps) {
  const { t } = useTranslation();
  const addToast = useToastStore((state) => state.addToast);
  const allTunnels = useTunnelStore((state) => state.tunnels);
  const setPaneTunnels = useTunnelStore((state) => state.setPaneTunnels);
  const upsertTunnel = useTunnelStore((state) => state.upsertTunnel);
  const removeTunnel = useTunnelStore((state) => state.removeTunnel);
  const tunnels = allTunnels.filter((tunnel) => tunnel.tabId === tabId);
  const [mode, setMode] = useState<"local" | "remote" | "dynamic">("local");
  const [localPort, setLocalPort] = useState("");
  const [dynamicPort, setDynamicPort] = useState("");
  const [localHost, setLocalHost] = useState("");
  const [remoteHost, setRemoteHost] = useState("");
  const [remotePort, setRemotePort] = useState("");
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      setPaneTunnels(tabId, await nativeInvoke<SshTunnelInfo[]>("list_ssh_tunnels", { tabId }));
    } catch (error) {
      addToast("error", String(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [tabId]); // eslint-disable-line react-hooks/exhaustive-deps

  const resolvedLocalPort = parsePort(mode === "dynamic" ? dynamicPort : localPort, mode !== "remote");
  const resolvedRemotePort = mode === "dynamic" ? undefined : parsePort(remotePort, mode === "remote");
  const targetHost = mode === "local" ? remoteHost : localHost;
  const canStart = mode === "dynamic"
    ? resolvedLocalPort !== undefined
    : targetHost.trim().length > 0 && resolvedLocalPort !== undefined && resolvedRemotePort !== undefined;

  const start = async () => {
    if (!canStart || resolvedLocalPort === undefined) return;
    setStarting(true);
    try {
      const command = mode === "local" ? "start_local_tunnel" : mode === "remote" ? "start_remote_tunnel" : "start_dynamic_tunnel";
      const request = mode === "local"
        ? { tabId, localPort: resolvedLocalPort, remoteHost: remoteHost.trim(), remotePort: resolvedRemotePort }
        : mode === "remote"
          ? { tabId, remotePort: resolvedRemotePort, localHost: localHost.trim(), localPort: resolvedLocalPort }
          : { tabId, localPort: resolvedLocalPort };
      const tunnel = await nativeInvoke<SshTunnelInfo>(
        command,
        { request },
      );
      upsertTunnel(tunnel);
      if (mode === "local") setLocalPort("");
      else if (mode === "remote") setRemotePort("");
      else setDynamicPort("");
    } catch (error) {
      addToast("error", String(error));
    } finally {
      setStarting(false);
    }
  };

  const stop = async (tunnelId: string) => {
    try {
      await nativeInvoke("stop_ssh_tunnel", { tunnelId });
      removeTunnel(tunnelId);
    } catch (error) {
      addToast("error", String(error));
    }
  };

  return (
    <aside className="w-[320px] max-w-[45vw] min-w-[280px] h-full flex flex-col bg-dock-sidebar border-s border-dock-border" aria-label={t("tunnels.title")}>
      <div className="h-9 px-2 flex items-center gap-1 border-b border-dock-border flex-shrink-0">
        <Network size={14} className="text-dock-accent" />
        <h2 className="text-xs font-semibold text-dock-text flex-1">{t("tunnels.title")}</h2>
        <IconButton label={t("tunnels.refresh")} onClick={() => void refresh()} icon={RefreshCw} />
        <IconButton label={t("tunnels.close")} onClick={onClose} icon={X} />
      </div>

      <form className="p-3 border-b border-dock-border space-y-2" onSubmit={(event) => { event.preventDefault(); void start(); }}>
        <div className="grid grid-cols-3 rounded border border-dock-border bg-dock-bg p-0.5" role="group" aria-label={t("tunnels.forwardingMode")}>
          {(["local", "remote", "dynamic"] as const).map((option) => (
            <button key={option} type="button" aria-pressed={mode === option} onClick={() => setMode(option)} className={`h-6 rounded text-[10px] font-medium ${mode === option ? "bg-dock-surface text-dock-text shadow-sm" : "text-dock-text-muted hover:text-dock-text"}`}>
              {t(option === "local" ? "tunnels.localForward" : option === "remote" ? "tunnels.remoteForward" : "tunnels.dynamicForward")}
            </button>
          ))}
        </div>
        {mode === "local" ? (
          <EndpointFields hostLabel={t("tunnels.remoteHost")} host={remoteHost} setHost={setRemoteHost} portLabel={t("tunnels.remotePort")} port={remotePort} setPort={setRemotePort} portPlaceholder="5432" />
        ) : mode === "remote" ? (
          <EndpointFields hostLabel={t("tunnels.localHost")} host={localHost} setHost={setLocalHost} portLabel={t("tunnels.localPort")} port={localPort} setPort={setLocalPort} portPlaceholder="3000" />
        ) : null}
        <div className="flex items-end gap-2">
          <label className="flex-1 text-[10px] text-dock-text-muted">
            {t(mode === "remote" ? "tunnels.remotePort" : "tunnels.localPort")}
            <input value={mode === "local" ? localPort : mode === "remote" ? remotePort : dynamicPort} onChange={(event) => mode === "local" ? setLocalPort(event.target.value) : mode === "remote" ? setRemotePort(event.target.value) : setDynamicPort(event.target.value)} inputMode="numeric" dir="ltr" className="mt-1 w-full h-7 px-2 rounded border border-dock-border bg-dock-bg text-[11px] font-mono text-dock-text outline-none focus:border-dock-accent" placeholder={t("tunnels.automatic")} />
          </label>
          <button type="submit" disabled={!canStart || starting} className="h-7 px-2 flex items-center gap-1 rounded bg-dock-accent text-white text-[11px] disabled:opacity-40">
            <Plus size={12} />{starting ? t("tunnels.starting") : t("tunnels.start")}
          </button>
        </div>
        <p className="text-[10px] leading-4 text-dock-text-muted">{t(mode === "dynamic" ? "tunnels.socksNotice" : "tunnels.loopbackNotice")}</p>
      </form>

      <div className="flex-1 min-h-0 overflow-auto" aria-live="polite">
        {loading && <div className="p-4 text-center text-xs text-dock-text-muted">{t("tunnels.loading")}</div>}
        {!loading && tunnels.length === 0 && <div className="p-4 text-center text-xs text-dock-text-muted">{t("tunnels.empty")}</div>}
        {!loading && tunnels.map((tunnel) => (
          <div key={tunnel.id} className="h-12 px-2 grid grid-cols-[8px_minmax(0,1fr)_28px] items-center gap-2 border-b border-dock-border/60">
            <span className="w-2 h-2 rounded-full bg-emerald-500" title={t("tunnels.running")} />
            <div className="min-w-0" dir="ltr">
              <div className="truncate text-[11px] font-mono text-dock-text" title={tunnel.mode === "dynamic" ? `${tunnel.bindAddress}:${tunnel.bindPort} -> SOCKS5` : `${tunnel.bindAddress}:${tunnel.bindPort} -> ${tunnel.targetHost}:${tunnel.targetPort}`}>
                {tunnel.bindAddress}:{tunnel.bindPort} <span className="text-dock-text-muted">→</span> {tunnel.mode === "dynamic" ? "SOCKS5" : `${tunnel.targetHost}:${tunnel.targetPort}`}
              </div>
              <div className="text-[10px] text-dock-text-muted" dir="auto">{t(tunnel.mode === "local" ? "tunnels.localForward" : tunnel.mode === "remote" ? "tunnels.remoteForward" : "tunnels.dynamicForward")}</div>
            </div>
            <IconButton label={t("tunnels.stop")} onClick={() => void stop(tunnel.id)} icon={CircleStop} danger />
          </div>
        ))}
      </div>
    </aside>
  );
}

function EndpointFields({ hostLabel, host, setHost, portLabel, port, setPort, portPlaceholder }: { hostLabel: string; host: string; setHost: (value: string) => void; portLabel: string; port: string; setPort: (value: string) => void; portPlaceholder: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_78px] gap-2">
      <label className="min-w-0 text-[10px] text-dock-text-muted">
        {hostLabel}
        <input value={host} onChange={(event) => setHost(event.target.value)} dir="ltr" maxLength={253} className="mt-1 w-full h-7 px-2 rounded border border-dock-border bg-dock-bg text-[11px] font-mono text-dock-text outline-none focus:border-dock-accent" placeholder="127.0.0.1" />
      </label>
      <label className="text-[10px] text-dock-text-muted">
        {portLabel}
        <input value={port} onChange={(event) => setPort(event.target.value)} inputMode="numeric" dir="ltr" className="mt-1 w-full h-7 px-2 rounded border border-dock-border bg-dock-bg text-[11px] font-mono text-dock-text outline-none focus:border-dock-accent" placeholder={portPlaceholder} />
      </label>
    </div>
  );
}

function IconButton({ label, onClick, icon: Icon, danger = false }: { label: string; onClick: () => void; icon: typeof X; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} title={label} aria-label={label} className={`p-1 rounded hover:bg-dock-surface-hover ${danger ? "text-red-400" : "text-dock-text-muted hover:text-dock-text"}`}>
      <Icon size={13} />
    </button>
  );
}
