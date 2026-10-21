import { beforeEach, describe, expect, it, vi } from "vitest";
import { listTerminalPaneIds, useAppStore } from "../stores/appStore";

vi.mock("zustand/middleware", () => ({
  persist: (initializer: unknown) => initializer,
}));

describe("active connection store actions", () => {
  beforeEach(() => {
    useAppStore.setState({
      tabs: [{
        id: "tab-1",
        sessionId: "session-1",
        sessionName: "Core",
        host: "192.0.2.10",
        protocol: "ssh",
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
      activeTabId: null,
    });
  });

  it("flattens split panes in display order", () => {
    const layout = useAppStore.getState().tabs[0].paneLayout!;
    expect(listTerminalPaneIds(layout)).toEqual(["pane-1", "pane-2"]);
  });

  it("targets explicit reconnect and disconnect signals to one pane", () => {
    useAppStore.getState().requestPaneReconnect("tab-1", "pane-2");
    useAppStore.getState().requestPaneDisconnect("tab-1", "pane-1");

    const tab = useAppStore.getState().tabs[0];
    expect(tab).toMatchObject({
      activePaneId: "pane-2",
      reconnectPaneId: "pane-2",
      reconnectToken: 1,
      disconnectPaneId: "pane-1",
      disconnectToken: 1,
    });
  });

  it("keeps split-pane status independent and aggregates the tab", () => {
    useAppStore.getState().updatePaneStatus("tab-1", "pane-1", "connected");
    useAppStore.getState().updatePaneStatus("tab-1", "pane-2", "disconnected");

    expect(useAppStore.getState().tabs[0]).toMatchObject({
      status: "connected",
      paneStatuses: {
        "pane-1": "connected",
        "pane-2": "disconnected",
      },
    });
  });
});