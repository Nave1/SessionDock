import { useEffect, useRef, useState } from "react";
import { ExternalLink, MonitorUp } from "lucide-react";
import { launchVncViewer } from "../../api/commands";
import { type TerminalTab, useAppStore } from "../../stores/appStore";

export function VncViewerView({ tab, active }: { tab: TerminalTab; active: boolean }) {
  const launchedRef = useRef(false);
  const [error, setError] = useState<string>();
  const updateTabStatus = useAppStore((state) => state.updateTabStatus);
  const port = tab.port || 5900;

  const launch = async () => {
    launchedRef.current = true;
    setError(undefined);
    updateTabStatus(tab.id, "connecting");
    try {
      await launchVncViewer(tab.host, port);
      updateTabStatus(tab.id, "connected");
    } catch (cause) {
      launchedRef.current = false;
      setError(String(cause));
      updateTabStatus(tab.id, "error");
    }
  };

  useEffect(() => {
    if (active && !launchedRef.current) void launch();
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="h-full flex flex-col items-center justify-center gap-4 px-8 text-center bg-dock-bg">
      <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-sky-400/30 bg-sky-400/10 text-sky-400">
        <MonitorUp size={24} />
      </div>
      <div>
        <h2 className="text-sm font-semibold text-dock-text">RealVNC Viewer</h2>
        <p className="mt-1 text-xs text-dock-text-muted">{tab.host}:{port}</p>
      </div>
      <p className="max-w-md text-xs leading-5 text-dock-text-muted">
        The graphical desktop opens in RealVNC Viewer. Enter the VM&apos;s VNC credentials there when prompted.
      </p>
      {error && <p className="max-w-lg text-xs text-dock-error">{error}</p>}
      <button
        type="button"
        onClick={() => void launch()}
        className="inline-flex items-center gap-2 rounded bg-dock-accent px-3 py-2 text-xs font-medium text-white hover:bg-dock-accent-hover"
      >
        <ExternalLink size={14} />
        Open Viewer
      </button>
    </div>
  );
}