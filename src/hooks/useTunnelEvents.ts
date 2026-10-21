import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useToastStore } from "../stores/toastStore";
import { useTunnelStore } from "../stores/tunnelStore";

interface TunnelErrorEvent {
  tunnelId: string;
  message: string;
}

export function useTunnelEvents(tabId: string, enabled: boolean): void {
  const addToast = useToastStore((state) => state.addToast);
  const clearPaneTunnels = useTunnelStore((state) => state.clearPaneTunnels);

  useEffect(() => {
    if (!enabled) return;
    const unlisten = listen<TunnelErrorEvent>(`tunnel-error-${tabId}`, ({ payload }) => {
      addToast("error", payload.message);
    });
    return () => {
      clearPaneTunnels(tabId);
      void unlisten.then((dispose) => dispose());
    };
  }, [addToast, clearPaneTunnels, enabled, tabId]);
}