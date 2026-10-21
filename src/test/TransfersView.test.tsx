import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TransfersView } from "../components/views/TransfersView";
import { useAppStore } from "../stores/appStore";
import { useTransferStore } from "../stores/transferStore";

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("../api/native", () => ({ nativeInvoke: mocks.invoke }));
vi.mock("zustand/middleware", () => ({ persist: (initializer: unknown) => initializer }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string, values?: { count?: number }) => values ? `${key}:${values.count}` : key }),
}));

describe("TransfersView", () => {
  beforeEach(() => {
    mocks.invoke.mockReset().mockResolvedValue(undefined);
    useAppStore.setState({
      currentView: "transfers",
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
    useTransferStore.setState({
      transfers: [{
        id: "transfer-1",
        tabId: "pane-1",
        name: "config.cfg",
        direction: "download",
        transferred: 25,
        total: 100,
        status: "running",
        updatedAt: 1,
      }],
    });
  });

  it("shows runtime progress and focuses the owning pane", () => {
    render(<TransfersView />);

    expect(screen.getByText("config.cfg")).toBeInTheDocument();
    expect(screen.getByText("Core switch")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "transfers.focus" }));

    expect(useAppStore.getState()).toMatchObject({ activeTabId: "tab-1", currentView: "recent" });
    expect(useAppStore.getState().tabs[0].activePaneId).toBe("pane-1");
  });

  it("pauses through the native transfer manager", async () => {
    render(<TransfersView />);
    fireEvent.click(screen.getByRole("button", { name: "sftp.pause" }));

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith("pause_sftp_transfer", { transferId: "transfer-1" }));
    expect(useTransferStore.getState().transfers[0].status).toBe("paused");
  });

  it("clears finished history but keeps active work", () => {
    useTransferStore.setState((state) => ({
      transfers: [...state.transfers, {
        id: "transfer-2",
        tabId: "pane-1",
        name: "done.cfg",
        direction: "upload",
        transferred: 100,
        total: 100,
        status: "completed",
        updatedAt: 2,
      }],
    }));
    render(<TransfersView />);
    fireEvent.click(screen.getByRole("button", { name: "transfers.clearFinished" }));

    expect(useTransferStore.getState().transfers.map((transfer) => transfer.id)).toEqual(["transfer-1"]);
  });

  it("retries a failed transfer on its owning pane", async () => {
    useTransferStore.setState({
      transfers: [{
        id: "failed-1",
        tabId: "pane-1",
        name: "config.cfg",
        direction: "upload",
        transferred: 10,
        total: 100,
        status: "failed",
        error: "network failure",
        request: {
          command: "start_sftp_upload",
          args: { tabId: "pane-1", localPath: "C:\\config.cfg", remotePath: "/config.cfg", overwrite: false },
        },
        updatedAt: 1,
      }],
    });
    mocks.invoke.mockResolvedValue("retry-1");
    render(<TransfersView />);
    fireEvent.click(screen.getByRole("button", { name: "sftp.retry" }));

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith("start_sftp_upload", {
      tabId: "pane-1",
      localPath: "C:\\config.cfg",
      remotePath: "/config.cfg",
      overwrite: false,
    }));
    expect(useTransferStore.getState().transfers[0]).toMatchObject({ id: "retry-1", status: "running" });
  });
});