import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TunnelPanel } from "../components/terminal/TunnelPanel";
import { useTunnelStore } from "../stores/tunnelStore";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

vi.mock("../api/native", () => ({ nativeInvoke: mocks.invoke }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe("TunnelPanel", () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
    useTunnelStore.setState({ tunnels: [] });
  });

  it("starts a loopback tunnel with automatic local port allocation", async () => {
    mocks.invoke
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({
        id: "tunnel-1",
        tabId: "pane-1",
        mode: "local",
        bindAddress: "127.0.0.1",
        bindPort: 49152,
        targetHost: "db.internal",
        targetPort: 5432,
        status: "running",
      });

    render(<TunnelPanel tabId="pane-1" onClose={vi.fn()} />);
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith("list_ssh_tunnels", { tabId: "pane-1" }));
    fireEvent.change(screen.getByLabelText("tunnels.remoteHost"), { target: { value: "db.internal" } });
    fireEvent.change(screen.getByLabelText("tunnels.remotePort"), { target: { value: "5432" } });
    fireEvent.click(screen.getByRole("button", { name: "tunnels.start" }));

    await waitFor(() => {
      expect(mocks.invoke).toHaveBeenCalledWith("start_local_tunnel", {
        request: {
          tabId: "pane-1",
          localPort: 0,
          remoteHost: "db.internal",
          remotePort: 5432,
        },
      });
    });
    expect(await screen.findByText(/49152/)).toBeInTheDocument();
  });

  it("starts remote forwarding with automatic server port allocation", async () => {
    mocks.invoke
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({
        id: "tunnel-remote",
        tabId: "pane-1",
        mode: "remote",
        bindAddress: "127.0.0.1",
        bindPort: 42000,
        targetHost: "127.0.0.1",
        targetPort: 3000,
        status: "running",
      });

    render(<TunnelPanel tabId="pane-1" onClose={vi.fn()} />);
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith("list_ssh_tunnels", { tabId: "pane-1" }));
    fireEvent.click(screen.getByRole("button", { name: "tunnels.remoteForward" }));
    fireEvent.change(screen.getByLabelText("tunnels.localHost"), { target: { value: "127.0.0.1" } });
    fireEvent.change(screen.getByLabelText("tunnels.localPort"), { target: { value: "3000" } });
    fireEvent.click(screen.getByRole("button", { name: "tunnels.start" }));

    await waitFor(() => {
      expect(mocks.invoke).toHaveBeenCalledWith("start_remote_tunnel", {
        request: {
          tabId: "pane-1",
          remotePort: 0,
          localHost: "127.0.0.1",
          localPort: 3000,
        },
      });
    });
    expect(await screen.findByText(/42000/)).toBeInTheDocument();
    expect(screen.getAllByText("tunnels.remoteForward")).toHaveLength(2);
  });

  it("starts a loopback SOCKS5 proxy with automatic port allocation", async () => {
    mocks.invoke
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({
        id: "tunnel-dynamic",
        tabId: "pane-1",
        mode: "dynamic",
        bindAddress: "127.0.0.1",
        bindPort: 43000,
        targetHost: "SOCKS5",
        targetPort: 0,
        status: "running",
      });

    render(<TunnelPanel tabId="pane-1" onClose={vi.fn()} />);
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith("list_ssh_tunnels", { tabId: "pane-1" }));
    fireEvent.click(screen.getByRole("button", { name: "tunnels.dynamicForward" }));
    fireEvent.click(screen.getByRole("button", { name: "tunnels.start" }));

    await waitFor(() => {
      expect(mocks.invoke).toHaveBeenCalledWith("start_dynamic_tunnel", {
        request: { tabId: "pane-1", localPort: 0 },
      });
    });
    expect(await screen.findByText(/43000/)).toBeInTheDocument();
    expect(screen.getAllByText("tunnels.dynamicForward")).toHaveLength(2);
    expect(screen.getByText("tunnels.socksNotice")).toBeInTheDocument();
  });

  it("stops an active tunnel", async () => {
    mocks.invoke
      .mockResolvedValueOnce([{
        id: "tunnel-2",
        tabId: "pane-2",
        mode: "local",
        bindAddress: "127.0.0.1",
        bindPort: 8080,
        targetHost: "web.internal",
        targetPort: 80,
        status: "running",
      }])
      .mockResolvedValueOnce(undefined);

    render(<TunnelPanel tabId="pane-2" onClose={vi.fn()} />);
    fireEvent.click(await screen.findByLabelText("tunnels.stop"));

    await waitFor(() => {
      expect(mocks.invoke).toHaveBeenCalledWith("stop_ssh_tunnel", { tunnelId: "tunnel-2" });
    });
    expect(screen.queryByLabelText("tunnels.stop")).not.toBeInTheDocument();
  });
});
