import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTransferEvents } from "../hooks/useTransferEvents";
import { useTransferStore } from "../stores/transferStore";

const mocks = vi.hoisted(() => ({
  listen: vi.fn(),
  handler: undefined as ((event: { payload: Record<string, unknown> }) => void) | undefined,
  dispose: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({ listen: mocks.listen }));

function EventBridge({ enabled = true }: { enabled?: boolean }) {
  useTransferEvents("pane-1", enabled);
  return null;
}

describe("transfer runtime state", () => {
  beforeEach(() => {
    useTransferStore.setState({ transfers: [] });
    mocks.dispose.mockReset();
    mocks.handler = undefined;
    mocks.listen.mockReset().mockImplementation(async (_event, handler) => {
      mocks.handler = handler;
      return mocks.dispose;
    });
  });

  it("captures pane transfer events without the Files panel", async () => {
    const view = render(<EventBridge />);
    await waitFor(() => expect(mocks.listen).toHaveBeenCalledWith("sftp-transfer-pane-1", expect.any(Function)));

    act(() => {
      mocks.handler?.({
        payload: {
          id: "transfer-1",
          name: "config.cfg",
          direction: "upload",
          transferred: 32,
          total: 64,
          status: "running",
        },
      });
    });

    expect(useTransferStore.getState().transfers[0]).toMatchObject({
      id: "transfer-1",
      tabId: "pane-1",
      transferred: 32,
      status: "running",
    });
    view.unmount();
    await waitFor(() => expect(mocks.dispose).toHaveBeenCalled());
    expect(useTransferStore.getState().transfers[0].status).toBe("cancelled");
  });

  it("does not subscribe non-SSH panes", () => {
    render(<EventBridge enabled={false} />);
    expect(mocks.listen).not.toHaveBeenCalled();
  });

  it("preserves retry data when progress arrives before command completion", () => {
    const request = {
      command: "start_sftp_upload" as const,
      args: { tabId: "pane-1", localPath: "C:\\config.cfg", remotePath: "/config.cfg", overwrite: false },
    };
    const store = useTransferStore.getState();
    store.upsertTransfer("pane-1", { id: "transfer-2", name: "config.cfg", direction: "upload", transferred: 1, total: 2, status: "running" });
    store.attachRequest("pane-1", "transfer-2", request, "config.cfg", "upload");

    expect(useTransferStore.getState().transfers[0].request).toEqual(request);
  });
});