import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { BmcSessionConfig, Protocol } from "../types";

export type ViewMode = "home" | "allSessions" | "favorites" | "recent" | "folder" | "group" | "activeConnections" | "transfers" | "tunnels" | "diagnostics" | "settings" | "credentials" | "tags";

export type ConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "disconnected"
  | "auth_failed"
  | "host_key_warning"
  | "timeout"
  | "error"
  | "reconnecting";

export type TerminalSplitDirection = "horizontal" | "vertical";

export interface TerminalPane {
  type: "pane";
  id: string;
}

export interface TerminalSplit {
  type: "split";
  id: string;
  direction: TerminalSplitDirection;
  children: [TerminalPaneNode, TerminalPaneNode];
}

export type TerminalPaneNode = TerminalPane | TerminalSplit;

export function countTerminalPanes(node: TerminalPaneNode): number {
  return node.type === "pane"
    ? 1
    : countTerminalPanes(node.children[0]) + countTerminalPanes(node.children[1]);
}

export function findFirstTerminalPane(node: TerminalPaneNode): string {
  return node.type === "pane" ? node.id : findFirstTerminalPane(node.children[0]);
}

export function listTerminalPaneIds(node: TerminalPaneNode): string[] {
  return node.type === "pane"
    ? [node.id]
    : [...listTerminalPaneIds(node.children[0]), ...listTerminalPaneIds(node.children[1])];
}

export function splitTerminalPane(
  node: TerminalPaneNode,
  paneId: string,
  direction: TerminalSplitDirection,
  newPaneId: string,
  splitId: string,
): TerminalPaneNode {
  if (node.type === "pane") {
    return node.id === paneId
      ? {
          type: "split",
          id: splitId,
          direction,
          children: [node, { type: "pane", id: newPaneId }],
        }
      : node;
  }
  return {
    ...node,
    children: [
      splitTerminalPane(node.children[0], paneId, direction, newPaneId, splitId),
      splitTerminalPane(node.children[1], paneId, direction, newPaneId, splitId),
    ],
  };
}

export function closeTerminalPane(node: TerminalPaneNode, paneId: string): TerminalPaneNode | null {
  if (node.type === "pane") return node.id === paneId ? null : node;
  const first = closeTerminalPane(node.children[0], paneId);
  const second = closeTerminalPane(node.children[1], paneId);
  if (!first) return second;
  if (!second) return first;
  return { ...node, children: [first, second] };
}

export interface TerminalTab {
  id: string;
  sessionId: string;
  sessionName: string;
  host: string;
  port?: number;
  protocol: Protocol;
  username?: string;
  password?: string;
  serialBaudRate?: number;
  status: ConnectionStatus;
  paneStatuses?: Record<string, ConnectionStatus>;
  pinned: boolean;
  bmc?: Partial<BmcSessionConfig>;
  paneLayout?: TerminalPaneNode;
  activePaneId?: string;
  reconnectPaneId?: string;
  reconnectToken?: number;
  disconnectPaneId?: string;
  disconnectToken?: number;
}

interface AppState {
  // UI state
  sidebarWidth: number;
  currentView: ViewMode;
  selectedFolderId: string | null;
  selectedGroupId: string | null;
  commandPaletteOpen: boolean;

  // Tabs
  tabs: TerminalTab[];
  activeTabId: string | null;

  // Actions
  setSidebarWidth: (width: number) => void;
  setCurrentView: (view: ViewMode) => void;
  setSelectedFolderId: (id: string | null) => void;
  setSelectedGroupId: (id: string | null) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  addTab: (tab: TerminalTab) => void;
  removeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  updateTabStatus: (id: string, status: ConnectionStatus) => void;
  updatePaneStatus: (tabId: string, paneId: string, status: ConnectionStatus) => void;
  reorderTabs: (fromIndex: number, toIndex: number) => void;
  splitTabPane: (tabId: string, paneId: string, direction: TerminalSplitDirection) => void;
  closeTabPane: (tabId: string, paneId: string) => void;
  setActivePane: (tabId: string, paneId: string) => void;
  requestTabReconnect: (tabId: string) => void;
  requestPaneReconnect: (tabId: string, paneId: string) => void;
  requestPaneDisconnect: (tabId: string, paneId: string) => void;
}

export const useAppStore = create<AppState>()(persist((set) => ({
  sidebarWidth: 260,
  currentView: "home",
  selectedFolderId: null,
  selectedGroupId: null,
  commandPaletteOpen: false,
  tabs: [],
  activeTabId: null,

  setSidebarWidth: (width) => set({ sidebarWidth: Math.min(480, Math.max(200, width)) }),
  setCurrentView: (view) => set({ currentView: view }),
  setSelectedFolderId: (id) => set({ selectedFolderId: id }),
  setSelectedGroupId: (id) => set({ selectedGroupId: id }),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),

  addTab: (tab) =>
    set((state) => ({
      tabs: [...state.tabs, tab],
      activeTabId: tab.id,
    })),

  removeTab: (id) =>
    set((state) => {
      const newTabs = state.tabs.filter((t) => t.id !== id);
      const newActiveId =
        state.activeTabId === id
          ? newTabs[newTabs.length - 1]?.id ?? null
          : state.activeTabId;
      return { tabs: newTabs, activeTabId: newActiveId };
    }),

  setActiveTab: (id) => set({ activeTabId: id }),

  updateTabStatus: (id, status) =>
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === id ? { ...t, status } : t)),
    })),

  updatePaneStatus: (tabId, paneId, status) =>
    set((state) => ({
      tabs: state.tabs.map((tab) => {
        if (tab.id !== tabId) return tab;
        const paneStatuses = { ...tab.paneStatuses, [paneId]: status };
        const statuses = Object.values(paneStatuses);
        const aggregateStatus = statuses.includes("connected")
          ? "connected"
          : statuses.includes("reconnecting")
            ? "reconnecting"
            : statuses.includes("connecting")
              ? "connecting"
              : status;
        return { ...tab, status: aggregateStatus, paneStatuses };
      }),
    })),

  reorderTabs: (fromIndex, toIndex) =>
    set((state) => {
      const newTabs = [...state.tabs];
      const [moved] = newTabs.splice(fromIndex, 1);
      newTabs.splice(toIndex, 0, moved);
      return { tabs: newTabs };
    }),

  splitTabPane: (tabId, paneId, direction) =>
    set((state) => ({
      tabs: state.tabs.map((tab) => {
        if (tab.id !== tabId) return tab;
        const layout = tab.paneLayout ?? { type: "pane" as const, id: tab.id };
        if (countTerminalPanes(layout) >= 4) return tab;
        const newPaneId = crypto.randomUUID();
        return {
          ...tab,
          paneLayout: splitTerminalPane(layout, paneId, direction, newPaneId, crypto.randomUUID()),
          activePaneId: newPaneId,
        };
      }),
    })),

  closeTabPane: (tabId, paneId) =>
    set((state) => ({
      tabs: state.tabs.map((tab) => {
        if (tab.id !== tabId) return tab;
        const layout = tab.paneLayout ?? { type: "pane" as const, id: tab.id };
        if (countTerminalPanes(layout) === 1) return tab;
        const nextLayout = closeTerminalPane(layout, paneId);
        if (!nextLayout) return tab;
        return {
          ...tab,
          paneLayout: nextLayout,
          paneStatuses: Object.fromEntries(Object.entries(tab.paneStatuses ?? {}).filter(([id]) => id !== paneId)),
          activePaneId: tab.activePaneId === paneId
            ? findFirstTerminalPane(nextLayout)
            : tab.activePaneId,
        };
      }),
    })),

  setActivePane: (tabId, paneId) =>
    set((state) => ({
      tabs: state.tabs.map((tab) => tab.id === tabId ? { ...tab, activePaneId: paneId } : tab),
    })),

  requestTabReconnect: (tabId) =>
    set((state) => ({
      tabs: state.tabs.map((tab) => tab.id === tabId ? {
        ...tab,
        reconnectPaneId: tab.activePaneId ?? tab.id,
        reconnectToken: (tab.reconnectToken ?? 0) + 1,
      } : tab),
    })),

  requestPaneReconnect: (tabId, paneId) =>
    set((state) => ({
      tabs: state.tabs.map((tab) => tab.id === tabId ? {
        ...tab,
        activePaneId: paneId,
        reconnectPaneId: paneId,
        reconnectToken: (tab.reconnectToken ?? 0) + 1,
      } : tab),
    })),

  requestPaneDisconnect: (tabId, paneId) =>
    set((state) => ({
      tabs: state.tabs.map((tab) => tab.id === tabId ? {
        ...tab,
        disconnectPaneId: paneId,
        disconnectToken: (tab.disconnectToken ?? 0) + 1,
      } : tab),
    })),
}), {
  name: "sessiondock-app-ui",
  partialize: (state) => ({ sidebarWidth: state.sidebarWidth }),
}));
