import { create } from "zustand";

export type TransferStatus = "running" | "paused" | "completed" | "failed" | "cancelled";
export type TransferDirection = "upload" | "download";
export type TransferRequest =
  | { command: "start_sftp_upload"; args: { tabId: string; localPath: string; remotePath: string; overwrite: boolean } }
  | { command: "start_sftp_download"; args: { tabId: string; localPath: string; remotePath: string; overwrite: boolean } }
  | { command: "start_scp_upload"; args: { tabId: string; localPath: string; remotePath: string; overwrite: boolean } }
  | { command: "start_scp_download"; args: { tabId: string; localPath: string; remotePath: string; overwrite: boolean } };

export interface TransferEvent {
  id: string;
  name: string;
  direction: TransferDirection;
  transferred: number;
  total: number;
  status: TransferStatus;
  error?: string;
}

export interface TransferRecord extends TransferEvent {
  tabId: string;
  request?: TransferRequest;
  updatedAt: number;
}

interface TransferState {
  transfers: TransferRecord[];
  upsertTransfer: (tabId: string, event: TransferEvent) => void;
  attachRequest: (tabId: string, id: string, request: TransferRequest, name: string, direction: TransferDirection) => void;
  setTransferStatus: (id: string, status: TransferStatus) => void;
  cancelPaneTransfers: (tabId: string) => void;
  clearFinished: () => void;
}

const MAX_TRANSFER_HISTORY = 100;

export const useTransferStore = create<TransferState>((set) => ({
  transfers: [],

  upsertTransfer: (tabId, event) => set((state) => {
    const existing = state.transfers.find((transfer) => transfer.id === event.id);
    const next = existing
      ? state.transfers.map((transfer) => transfer.id === event.id
        ? { ...transfer, ...event, tabId, updatedAt: Date.now() }
        : transfer)
      : [{ ...event, tabId, updatedAt: Date.now() }, ...state.transfers];
    return { transfers: next.slice(0, MAX_TRANSFER_HISTORY) };
  }),

  attachRequest: (tabId, id, request, name, direction) => set((state) => {
    const existing = state.transfers.find((transfer) => transfer.id === id);
    const next = existing
      ? state.transfers.map((transfer) => transfer.id === id
        ? { ...transfer, request, tabId, updatedAt: Date.now() }
        : transfer)
      : [{ id, tabId, name, direction, transferred: 0, total: 0, status: "running" as const, request, updatedAt: Date.now() }, ...state.transfers];
    return { transfers: next.slice(0, MAX_TRANSFER_HISTORY) };
  }),

  setTransferStatus: (id, status) => set((state) => ({
    transfers: state.transfers.map((transfer) => transfer.id === id
      ? { ...transfer, status, updatedAt: Date.now() }
      : transfer),
  })),

  cancelPaneTransfers: (tabId) => set((state) => ({
    transfers: state.transfers.map((transfer) => transfer.tabId === tabId && (transfer.status === "running" || transfer.status === "paused")
      ? { ...transfer, status: "cancelled", updatedAt: Date.now() }
      : transfer),
  })),

  clearFinished: () => set((state) => ({
    transfers: state.transfers.filter((transfer) => transfer.status === "running" || transfer.status === "paused"),
  })),
}));