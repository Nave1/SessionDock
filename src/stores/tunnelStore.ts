import { create } from "zustand";

export interface SshTunnelInfo {
  id: string;
  tabId: string;
  mode: "local" | "remote" | "dynamic";
  bindAddress: string;
  bindPort: number;
  targetHost: string;
  targetPort: number;
  status: "running";
}

interface TunnelState {
  tunnels: SshTunnelInfo[];
  setAllTunnels: (tunnels: SshTunnelInfo[]) => void;
  setPaneTunnels: (tabId: string, tunnels: SshTunnelInfo[]) => void;
  upsertTunnel: (tunnel: SshTunnelInfo) => void;
  removeTunnel: (id: string) => void;
  clearPaneTunnels: (tabId: string) => void;
}

export const useTunnelStore = create<TunnelState>((set) => ({
  tunnels: [],
  setAllTunnels: (tunnels) => set({ tunnels }),
  setPaneTunnels: (tabId, tunnels) => set((state) => ({
    tunnels: [...state.tunnels.filter((tunnel) => tunnel.tabId !== tabId), ...tunnels],
  })),
  upsertTunnel: (tunnel) => set((state) => ({
    tunnels: state.tunnels.some((item) => item.id === tunnel.id)
      ? state.tunnels.map((item) => item.id === tunnel.id ? tunnel : item)
      : [...state.tunnels, tunnel],
  })),
  removeTunnel: (id) => set((state) => ({
    tunnels: state.tunnels.filter((tunnel) => tunnel.id !== id),
  })),
  clearPaneTunnels: (tabId) => set((state) => ({
    tunnels: state.tunnels.filter((tunnel) => tunnel.tabId !== tabId),
  })),
}));