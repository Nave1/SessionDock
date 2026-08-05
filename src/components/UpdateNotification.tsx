import { useState, useEffect, useCallback, useRef } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { Download, X, RefreshCw, AlertTriangle } from "lucide-react";
import { useAppStore } from "../stores/appStore";
import { useAppVersion } from "../hooks/useAppVersion";

export function UpdateNotification() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateVersion, setUpdateVersion] = useState("");
  const [updateNotes, setUpdateNotes] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSessionWarning, setShowSessionWarning] = useState(false);
  const updateRef = useRef<Update | null>(null);

  const { version: installedVersion } = useAppVersion();
  const tabs = useAppStore((s) => s.tabs);
  const activeSessions = tabs.filter((t) => t.status === "connected" || t.status === "connecting");

  const checkForUpdate = useCallback(async () => {
    try {
      const update = await check();
      if (update) {
        updateRef.current = update;
        setUpdateAvailable(true);
        setUpdateVersion(update.version);
        setUpdateNotes(update.body || "");
      }
    } catch (checkError) {
      console.warn("Unable to check for SessionDock updates", checkError);
    }
  }, []);

  useEffect(() => {
    const initialTimer = window.setTimeout(checkForUpdate, 5000);
    const interval = window.setInterval(checkForUpdate, 6 * 60 * 60 * 1000);
    const checkWhenVisible = () => {
      if (document.visibilityState === "visible") void checkForUpdate();
    };
    document.addEventListener("visibilitychange", checkWhenVisible);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", checkWhenVisible);
      updateRef.current?.close();
    };
  }, [checkForUpdate]);

  const handleUpdateClick = () => {
    if (activeSessions.length > 0) {
      setShowSessionWarning(true);
    } else {
      performUpdate();
    }
  };

  const performUpdate = async () => {
    setShowSessionWarning(false);
    setDownloading(true);
    setError(null);
    setProgress(0);
    try {
      const update = updateRef.current ?? await check();
      if (!update) {
        setUpdateAvailable(false);
        setDownloading(false);
        return;
      }

      let downloadedBytes = 0;
      let totalBytes = 0;

      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          totalBytes = event.data.contentLength ?? 0;
        } else if (event.event === "Progress") {
          downloadedBytes += event.data.chunkLength;
          if (totalBytes > 0) setProgress(Math.min(100, Math.round((downloadedBytes / totalBytes) * 100)));
        } else if (event.event === "Finished") {
          setProgress(100);
        }
      });

      await relaunch();
    } catch (e) {
      setError(String(e));
      setDownloading(false);
    }
  };

  if (!updateAvailable || dismissed) return null;

  return (
    <>
      {/* Update notification */}
      <div className="fixed top-4 right-4 z-[200] w-80 bg-dock-sidebar border border-dock-accent/30 rounded-xl shadow-2xl overflow-hidden animate-fade-in">
        <div className="flex items-center justify-between px-4 py-3 border-b border-dock-border">
          <div className="flex items-center gap-2">
            <RefreshCw size={14} className="text-dock-accent" />
            <span className="text-[12px] font-semibold text-dock-text">Update Available</span>
          </div>
          <button onClick={() => setDismissed(true)} className="text-dock-text-muted hover:text-dock-text">
            <X size={14} />
          </button>
        </div>

        <div className="px-4 py-3 space-y-3">
          <div>
            <p className="text-[12px] text-dock-text">
              SessionDock <span className="font-semibold text-dock-accent">v{updateVersion}</span> is available
            </p>
            {installedVersion && (
              <p className="text-[11px] text-dock-text-muted mt-0.5">
                Installed: v{installedVersion}
              </p>
            )}
            {updateNotes && (
              <p className="text-[11px] text-dock-text-muted mt-2 line-clamp-3">{updateNotes}</p>
            )}
          </div>

          {error && <p className="text-[11px] text-red-400">{error}</p>}

          {downloading ? (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] text-dock-text-muted">
                <span>Downloading...</span>
                <span>{progress}%</span>
              </div>
              <div className="w-full h-1.5 bg-dock-border rounded-full overflow-hidden">
                <div className="h-full bg-dock-accent rounded-full transition-all" style={{ width: `${progress}%` }} />
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={handleUpdateClick}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-medium text-white bg-dock-accent hover:bg-dock-accent-hover"
              >
                <Download size={12} />
                Update Now
              </button>
              <button
                onClick={() => setDismissed(true)}
                className="px-3 py-2 rounded-lg text-[12px] text-dock-text-muted bg-dock-surface hover:bg-dock-surface-hover"
              >
                Later
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Active session warning modal */}
      {showSessionWarning && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60">
          <div className="w-full max-w-sm bg-dock-sidebar border border-dock-border rounded-xl shadow-2xl p-5 animate-fade-in">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={16} className="text-dock-warning" />
              <h3 className="text-[13px] font-semibold text-dock-text">Active Sessions</h3>
            </div>
            <p className="text-[12px] text-dock-text-muted mb-4">
              Installing the update will close {activeSessions.length} active terminal session{activeSessions.length !== 1 ? "s" : ""}.
              Unsaved terminal output will be lost.
            </p>
            <div className="flex gap-2">
              <button
                onClick={performUpdate}
                className="flex-1 px-3 py-2 rounded-lg text-[12px] font-medium text-white bg-dock-accent hover:bg-dock-accent-hover"
              >
                Install and Restart
              </button>
              <button
                onClick={() => setShowSessionWarning(false)}
                className="px-3 py-2 rounded-lg text-[12px] text-dock-text-muted bg-dock-surface hover:bg-dock-surface-hover"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
