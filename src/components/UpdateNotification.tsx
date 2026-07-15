import { useState, useEffect, useCallback } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { Download, X, RefreshCw } from "lucide-react";

export function UpdateNotification() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateVersion, setUpdateVersion] = useState("");
  const [updateNotes, setUpdateNotes] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkForUpdate = useCallback(async () => {
    try {
      const update = await check();
      if (update) {
        setUpdateAvailable(true);
        setUpdateVersion(update.version);
        setUpdateNotes(update.body || "");
      }
    } catch (e) {
      // Silently fail — user can manually check
      console.log("Update check failed:", e);
    }
  }, []);

  useEffect(() => {
    // Check for updates 5 seconds after launch
    const timer = setTimeout(checkForUpdate, 5000);
    return () => clearTimeout(timer);
  }, [checkForUpdate]);

  const handleUpdate = async () => {
    setDownloading(true);
    setError(null);
    try {
      const update = await check();
      if (!update) return;

      await update.downloadAndInstall((event) => {
        if (event.event === "Progress") {
          const { contentLength, chunkLength } = event.data as { contentLength: number; chunkLength: number };
          if (contentLength) {
            setProgress(Math.round((chunkLength / contentLength) * 100));
          }
        }
      });

      // Relaunch the app after install
      await relaunch();
    } catch (e) {
      setError(String(e));
      setDownloading(false);
    }
  };

  if (!updateAvailable || dismissed) return null;

  return (
    <div className="fixed top-4 right-4 z-[200] w-80 bg-dock-sidebar border border-dock-accent/30 rounded-lg shadow-2xl overflow-hidden animate-in slide-in-from-top">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-dock-border">
        <div className="flex items-center gap-2">
          <RefreshCw size={14} className="text-dock-accent" />
          <span className="text-xs font-semibold text-dock-text">Update Available</span>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="text-dock-text-muted hover:text-dock-text"
        >
          <X size={14} />
        </button>
      </div>

      {/* Content */}
      <div className="px-4 py-3 space-y-3">
        <div>
          <p className="text-xs text-dock-text">
            SessionDock <span className="font-semibold text-dock-accent">v{updateVersion}</span> is available.
          </p>
          {updateNotes && (
            <p className="text-[11px] text-dock-text-muted mt-1 line-clamp-3">
              {updateNotes}
            </p>
          )}
        </div>

        {error && (
          <p className="text-[11px] text-dock-error">{error}</p>
        )}

        {downloading ? (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px] text-dock-text-muted">
              <span>Downloading...</span>
              <span>{progress}%</span>
            </div>
            <div className="w-full h-1.5 bg-dock-border rounded-full overflow-hidden">
              <div
                className="h-full bg-dock-accent rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={handleUpdate}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded text-xs text-white bg-dock-accent hover:bg-dock-accent-hover transition-colors"
            >
              <Download size={12} />
              Update Now
            </button>
            <button
              onClick={() => setDismissed(true)}
              className="px-3 py-2 rounded text-xs text-dock-text-muted hover:text-dock-text bg-dock-surface hover:bg-dock-border transition-colors"
            >
              Later
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
