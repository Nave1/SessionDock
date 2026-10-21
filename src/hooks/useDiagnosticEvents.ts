import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { type DiagnosticEvent, useDiagnosticStore } from "../stores/diagnosticStore";

export function useDiagnosticEvents(tabId: string, enabled: boolean): void {
  const upsertDiagnostic = useDiagnosticStore((state) => state.upsertDiagnostic);
  const cancelPaneDiagnostics = useDiagnosticStore((state) => state.cancelPaneDiagnostics);

  useEffect(() => {
    if (!enabled) return;
    const unlisten = listen<DiagnosticEvent>(`diagnostic-${tabId}`, ({ payload }) => {
      upsertDiagnostic(tabId, payload);
    });
    return () => {
      cancelPaneDiagnostics(tabId);
      void unlisten.then((dispose) => dispose());
    };
  }, [cancelPaneDiagnostics, enabled, tabId, upsertDiagnostic]);
}