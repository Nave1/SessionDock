import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TunnelsView } from "../components/views/TunnelsView";
import { useAppStore } from "../stores/appStore";
import { type SshTunnelInfo, useTunnelStore } from "../stores/tunnelStore";

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("../api/native", () => ({ nativeInvoke: mocks.invoke }));
vi.mock("zustand/middleware", () => ({ persist: (initializer: unknown) => initializer }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string, values?: { count?: number }) => values ? `${key}:${values.count}` : key }),
}));

const tunnel: SshTunnelInfo = {
  id: "tunnel-1",
  tabId: "pane-1",
  mode: "local",
  bindAddress: "127.0.0.1",
  bindPort: 49152,
  targetHost: "db.internal",
  targetPort: 5432,
  status: "running",
};

describe("TunnelsView", () => {
  beforeEach(() => {
    mocks.invoke.mockReset().mockImplementation(async (command: string) => command === "list_ssh_tunnels" ? [tunnel] : undefined);
    useTunnelStore.setState({ tunnels: [] });
    useAppStore.setState({
      currentView: "tunnels",
      activeTabId: null,
      tabs: [{
        id: "tab-1",
        sessionId: "session-1",
        sessionName: "Core switch",
        host: "192.0.2.10",
        protocol: "ssh",
        status: "connected",
        pinned: false,
        paneLayout: { type: "pane", id: "pane-1" },
      }],
    });
  });

  it("loads all native tunnels and focuses the owning pane", async () => {
    render(<TunnelsView />);

    expect(await screen.findByText("127.0.0.1:49152")).toBeInTheDocument();
    expect(mocks.invoke).toHaveBeenCalledWith("list_ssh_tunnels", {});
    fireEvent.click(screen.getByRole("button", { name: "tunnelsWorkspace.focus" }));

    expect(useAppStore.getState()).toMatchObject({ activeTabId: "tab-1", currentView: "terminal" });
    expect(useAppStore.getState().tabs[0].activePaneId).toBe("pane-1");
  });

  it("opens the tunnel creator on a connected SSH pane", () => {
    render(<TunnelsView />);

    fireEvent.click(screen.getByRole("button", { name: "tunnelsWorkspace.start" }));

    expect(useAppStore.getState()).toMatchObject({ activeTabId: "tab-1", currentView: "terminal" });
    expect(useAppStore.getState().tabs[0]).toMatchObject({
      activePaneId: "pane-1",
      toolPaneId: "pane-1",
      toolPanel: "tunnels",
    });
  });

  it("stops a tunnel through the native manager", async () => {
    render(<TunnelsView />);
    fireEvent.click(await screen.findByRole("button", { name: "tunnels.stop" }));

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith("stop_ssh_tunnel", { tunnelId: "tunnel-1" }));
    expect(useTunnelStore.getState().tunnels).toEqual([]);
  });

  it("filters tunnels by forwarding mode", async () => {
    mocks.invoke.mockImplementation(async (command: string) => command === "list_ssh_tunnels" ? [
      tunnel,
      { ...tunnel, id: "tunnel-2", mode: "dynamic", bindPort: 43000, targetHost: "SOCKS5", targetPort: 0 },
    ] : undefined);
    render(<TunnelsView />);
    await screen.findByText("127.0.0.1:49152");
    fireEvent.click(screen.getByRole("button", { name: "tunnelsWorkspace.dynamic" }));

    expect(screen.queryByText("127.0.0.1:49152")).not.toBeInTheDocument();
    expect(screen.getByText("127.0.0.1:43000")).toBeInTheDocument();
  });
});