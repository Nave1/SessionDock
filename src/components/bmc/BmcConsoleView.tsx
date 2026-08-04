import { useEffect, useRef, useState } from "react";
import { ExternalLink, LoaderCircle } from "lucide-react";
import { open } from "@tauri-apps/plugin-shell";
import type { TerminalTab } from "../../stores/appStore";
import { useAppStore } from "../../stores/appStore";
import { closeBmcWebview, createBmcWebview, setBmcWebviewBounds, setBmcWebviewVisible } from "../../api/bmc";
import { normalizeBmcUrl } from "../../utils/bmcUrl";
import { BmcConsoleToolbar } from "./BmcConsoleToolbar";

export function BmcConsoleView({ tab, active }: { tab: TerminalTab; active: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string>();
  const updateTabStatus = useAppStore((state) => state.updateTabStatus);
  const bmc = tab.bmc;
  const urlResult = (() => {
    try {
      return { url: normalizeBmcUrl(bmc?.bmc_console_url || {
        host: tab.host,
        port: tab.port,
        useHttps: bmc?.bmc_use_https,
        path: bmc?.bmc_web_path,
      }) };
    } catch (cause) {
      return { error: String(cause) };
    }
  })();
  const url = urlResult.url || "";
  const external = bmc?.bmc_viewer_mode === "external-browser";

  useEffect(() => {
    if (!external || !active || !url) return;
    void open(url);
    updateTabStatus(tab.id, "connected");
  }, [active, external, tab.id, updateTabStatus, url]);

  useEffect(() => {
    if (external || !url) return;
    const element = hostRef.current;
    if (!element) return;
    let disposed = false;
    let created = false;

    const bounds = () => {
      const rect = element.getBoundingClientRect();
      return { connectionId: tab.id, x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    };
    const create = async () => {
      try {
        await createBmcWebview({
          ...bounds(),
          url,
          cookiePersistence: bmc?.bmc_cookie_persistence || "application",
        });
        created = true;
        if (disposed) {
          await closeBmcWebview(tab.id, bmc?.bmc_cookie_persistence === "tab");
          return;
        }
        await setBmcWebviewVisible(tab.id, active);
        updateTabStatus(tab.id, "connected");
      } catch (cause) {
        if (!disposed) {
          setError(String(cause));
          updateTabStatus(tab.id, "error");
        }
      }
    };
    const observer = new ResizeObserver(() => {
      if (created) void setBmcWebviewBounds(bounds());
    });
    observer.observe(element);
    void create();

    return () => {
      disposed = true;
      observer.disconnect();
      if (created) void closeBmcWebview(tab.id, bmc?.bmc_cookie_persistence === "tab");
    };
  }, [bmc?.bmc_cookie_persistence, external, tab.id, updateTabStatus, url]);

  useEffect(() => {
    if (!external) void setBmcWebviewVisible(tab.id, active).catch(() => undefined);
  }, [active, external, tab.id]);

  if (urlResult.error) {
    return <div className="h-full flex items-center justify-center text-xs text-red-400">{urlResult.error}</div>;
  }

  if (external) {
    return <div className="h-full flex flex-col items-center justify-center gap-3 text-dock-text-muted"><ExternalLink size={24} /><span className="text-sm">Console opened in your default browser</span><button className="text-xs text-dock-accent" onClick={() => void open(url)}>Open again</button></div>;
  }

  return (
    <div className="h-full flex flex-col bg-dock-bg">
      <BmcConsoleToolbar connectionId={tab.id} url={url} />
      <div ref={hostRef} className="relative flex-1 min-h-0">
        <div className="absolute inset-0 flex items-center justify-center text-dock-text-muted">
          {error ? <span className="text-xs text-red-400">{error}</span> : <LoaderCircle size={20} className="animate-spin" />}
        </div>
      </div>
    </div>
  );
}