import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTunnelEvents } from "../hooks/useTunnelEvents";
import { useToastStore } from "../stores/toastStore";
import { useTunnelStore } from "../stores/tunnelStore";

const mocks = vi.hoisted(() => ({
  listen: vi.fn(),
  handler: undefined as ((event: { payload: { tunnelId: string; message: string } }) => void) | undefined,
  dispose: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({ listen: mocks.listen }));

function EventBridge({ enabled = true }: { enabled?: boolean }) {
  useTunnelEvents("pane-1", enabled);
  return null;
}

describe("tunnel runtime state", () => {
  beforeEach(() => {
    useTunnelStore.setState({ tunnels: [] });
    useToastStore.setState({ toasts: [] });
    mocks.handler = undefined;
    mocks.dispose.mockReset();
    mocks.listen.mockReset().mockImplementation(async (_event, handler) => {
      mocks.handler = handler;
      return mocks.dispose;
    });
  });

  it("reports tunnel errors while the pane panel is closed", async () => {
    render(<EventBridge />);
    await waitFor(() => expect(mocks.listen).toHaveBeenCalledWith("tunnel-error-pane-1", expect.any(Function)));

    act(() => mocks.handler?.({ payload: { tunnelId: "tunnel-1", message: "Target refused connection" } }));

    expect(useToastStore.getState().toasts[0]).toMatchObject({ type: "error", message: "Target refused connection" });
  });

  it("clears pane-owned inventory when its SSH pane unmounts", async () => {
    useTunnelStore.setState({
      tunnels: [{ id: "tunnel-1", tabId: "pane-1", mode: "local", bindAddress: "127.0.0.1", bindPort: 49152, targetHost: "db.internal", targetPort: 5432, status: "running" }],
    });
    const view = render(<EventBridge />);
    await waitFor(() => expect(mocks.listen).toHaveBeenCalled());
    view.unmount();

    expect(useTunnelStore.getState().tunnels).toEqual([]);
    await waitFor(() => expect(mocks.dispose).toHaveBeenCalled());
  });

  it("does not subscribe non-SSH panes", () => {
    render(<EventBridge enabled={false} />);
    expect(mocks.listen).not.toHaveBeenCalled();
  });
});