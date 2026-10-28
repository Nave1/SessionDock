import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActiveConnectionsView } from "../components/views/ActiveConnectionsView";
import { useAppStore } from "../stores/appStore";

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("../api/native", () => ({ nativeInvoke: mocks.invoke }));
vi.mock("zustand/middleware", () => ({
  persist: (initializer: unknown) => initializer,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string, values?: { count?: number; index?: number }) => values ? `${key}:${values.count ?? values.index}` : key }),
}));

describe("ActiveConnectionsView", () => {
  beforeEach(() => {
    mocks.invoke.mockReset().mockResolvedValue(undefined);
    useAppStore.setState({
      currentView: "activeConnections",
      activeTabId: null,
      tabs: [{
        id: "tab-1",
        sessionId: "session-1",
        sessionName: "Core switch",
        host: "192.0.2.10",
        port: 22,
        protocol: "ssh",
        username: "operator",
        status: "connected",
        pinned: false,
        paneLayout: {
          type: "split",
          id: "split-1",
          direction: "horizontal",
          children: [
            { type: "pane", id: "pane-1" },
            { type: "pane", id: "pane-2" },
          ],
        },
      }],
    });
  });

  it("lists each split pane and focuses the selected connection", () => {
    render(<ActiveConnectionsView />);

    expect(screen.getAllByText("Core switch")).toHaveLength(2);
    fireEvent.click(screen.getAllByRole("button", { name: "activeConnections.focus" })[1]);

    expect(useAppStore.getState()).toMatchObject({
      activeTabId: "tab-1",
      currentView: "terminal",
    });
    expect(useAppStore.getState().tabs[0].activePaneId).toBe("pane-2");
  });

  it("routes disconnect through the owning terminal pane", () => {
    render(<ActiveConnectionsView />);
    fireEvent.click(screen.getAllByRole("button", { name: "session.disconnect" })[1]);

    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(useAppStore.getState().tabs[0]).toMatchObject({
      disconnectPaneId: "pane-2",
      disconnectToken: 1,
    });
  });

  it("closes the backend before removing a split pane", async () => {
    render(<ActiveConnectionsView />);
    fireEvent.click(screen.getAllByRole("button", { name: "activeConnections.close" })[0]);

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith("close_terminal", {
      tabId: "pane-1",
      protocol: "ssh",
    }));
    expect(useAppStore.getState().tabs).toHaveLength(1);
    expect(useAppStore.getState().tabs[0].paneLayout).toEqual({ type: "pane", id: "pane-2" });
  });
});