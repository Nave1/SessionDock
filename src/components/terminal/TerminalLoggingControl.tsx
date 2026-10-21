import { useCallback, useEffect, useState } from "react";
import { Circle } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { useTranslation } from "react-i18next";
import { nativeInvoke } from "../../api/native";

interface TerminalLogStatus {
  active: boolean;
  path: string | null;
}

export function TerminalLoggingControl({ tabId }: { tabId: string }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<TerminalLogStatus>({ active: false, path: null });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    nativeInvoke<TerminalLogStatus>("get_terminal_logging_status", { tabId })
      .then((nextStatus) => { if (mounted) setStatus(nextStatus); })
      .catch(() => {});
    return () => { mounted = false; };
  }, [tabId]);

  const toggle = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (status.active) {
        setStatus(await nativeInvoke<TerminalLogStatus>("stop_terminal_logging", { tabId }));
        return;
      }
      if (!window.confirm(t("terminalLogging.warning"))) return;
      const directory = await open({
        directory: true,
        multiple: false,
        title: t("terminalLogging.chooseFolder"),
      });
      if (typeof directory !== "string") return;
      setStatus(await nativeInvoke<TerminalLogStatus>("start_terminal_logging", { tabId, directory }));
    } catch (error) {
      window.alert(t("terminalLogging.error", { error: String(error) }));
    } finally {
      setBusy(false);
    }
  }, [busy, status.active, t, tabId]);

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      disabled={busy}
      className={`flex h-6 items-center gap-1 rounded px-1.5 text-[10px] font-semibold disabled:opacity-50 ${status.active ? "bg-red-500/15 text-red-400" : "text-dock-text-muted hover:bg-dock-surface-hover hover:text-dock-text"}`}
      title={status.active ? `${t("terminalLogging.stop")}\n${status.path ?? ""}` : t("terminalLogging.start")}
      aria-label={status.active ? t("terminalLogging.stop") : t("terminalLogging.start")}
    >
      <Circle size={9} fill={status.active ? "currentColor" : "none"} />
      {status.active && <span>{t("terminalLogging.recording")}</span>}
    </button>
  );
}
