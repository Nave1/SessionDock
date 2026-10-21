import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { type TransferEvent, useTransferStore } from "../stores/transferStore";

export function useTransferEvents(tabId: string, enabled: boolean): void {
  const upsertTransfer = useTransferStore((state) => state.upsertTransfer);
  const cancelPaneTransfers = useTransferStore((state) => state.cancelPaneTransfers);

  useEffect(() => {
    if (!enabled) return;
    const unlisten = listen<TransferEvent>(`sftp-transfer-${tabId}`, ({ payload }) => {
      upsertTransfer(tabId, payload);
    });
    return () => {
      cancelPaneTransfers(tabId);
      void unlisten.then((dispose) => dispose());
    };
  }, [cancelPaneTransfers, enabled, tabId, upsertTransfer]);
}