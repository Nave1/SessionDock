import { ExternalLink, RefreshCw, ShieldCheck } from "lucide-react";
import { open } from "@tauri-apps/plugin-shell";
import { reloadBmcWebview } from "../../api/bmc";
import { redactSensitiveUrl } from "../../utils/bmcUrl";

export function BmcConsoleToolbar({ connectionId, url }: { connectionId: string; url: string }) {
  return (
    <div className="h-10 px-3 flex items-center gap-2 border-b border-dock-border bg-dock-sidebar">
      <button className="p-1.5 text-dock-text-muted hover:text-dock-text" title="Reload console" onClick={() => void reloadBmcWebview(connectionId)}>
        <RefreshCw size={14} />
      </button>
      <button className="p-1.5 text-dock-text-muted hover:text-dock-text" title="Open in browser" onClick={() => void open(url)}>
        <ExternalLink size={14} />
      </button>
      <div className="h-4 w-px bg-dock-border" />
      <ShieldCheck size={13} className="text-emerald-400" />
      <span className="text-[11px] text-dock-text-muted truncate">Restricted WebView · {redactSensitiveUrl(url)}</span>
    </div>
  );
}