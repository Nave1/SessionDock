import { create } from "zustand";

export type ViewMode = "home" | "allSessions" | "favorites" | "recent" | "folder" | "settings" | "credentials" | "tags";

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

export interface TerminalTab {
  id: string;
  sessionId: string;
  sessionName: string;
  host: string;
  port?: number;
  protocol: string;
  username?: string;
  password?: string;
  status: ConnectionStatus;
  pinned: boolean;
}

interface AppState {
  // UI state
  sidebarWidth: number;
  currentView: ViewMode;
  selectedFolderId: string | null;
  commandPaletteOpen: boolean;

  // Tabs
  tabs: TerminalTab[];
  activeTabId: string | null;

  // Actions
  setSidebarWidth: (width: number) => void;
  setCurrentView: (view: ViewMode) => void;
  setSelectedFolderId: (id: string | null) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  addTab: (tab: TerminalTab) => void;
  removeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  updateTabStatus: (id: string, status: ConnectionStatus) => void;
  reorderTabs: (fromIndex: number, toIndex: number) => void;
}

export const useAppStore = create<AppState>((set) => ({
  sidebarWidth: 260,
  currentView: "home",
  selectedFolderId: null,
  commandPaletteOpen: false,
  tabs: [],
  activeTabId: null,

  setSidebarWidth: (width) => set({ sidebarWidth: width }),
  setCurrentView: (view) => set({ currentView: view }),
  setSelectedFolderId: (id) => set({ selectedFolderId: id }),
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

  reorderTabs: (fromIndex, toIndex) =>
    set((state) => {
      const newTabs = [...state.tabs];
      const [moved] = newTabs.splice(fromIndex, 1);
      newTabs.splice(toIndex, 0, moved);
      return { tabs: newTabs };
    }),
}));
