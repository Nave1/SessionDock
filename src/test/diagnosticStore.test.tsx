import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDiagnosticEvents } from "../hooks/useDiagnosticEvents";
import { useDiagnosticStore } from "../stores/diagnosticStore";

const mocks = vi.hoisted(() => ({
  listen: vi.fn(),
  handler: undefined as ((event: { payload: Record<string, unknown> }) => void) | undefined,
  dispose: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({ listen: mocks.listen }));

function EventBridge({ enabled = true }: { enabled?: boolean }) {
  useDiagnosticEvents("pane-1", enabled);
  return null;
}

describe("diagnostic runtime state", () => {
  beforeEach(() => {
    localStorage.removeItem("sessiondock-diagnostics");
    useDiagnosticStore.setState({ diagnostics: [] });
    mocks.dispose.mockReset();
    mocks.handler = undefined;
    mocks.listen.mockReset().mockImplementation(async (_event, handler) => {
      mocks.handler = handler;
      return mocks.dispose;
    });
  });

  it("captures pane diagnostic events without the Device Info panel", async () => {
    const view = render(<EventBridge />);
    await waitFor(() => expect(mocks.listen).toHaveBeenCalledWith("diagnostic-pane-1", expect.any(Function)));

    act(() => {
      mocks.handler?.({
        payload: {
          jobId: "job-1",
          providerId: "linux",
          diagnosticId: "linux-identity",
          command: "uname -a",
          status: "running",
          stdout: "",
          stderr: "",
          truncated: false,
        },
      });
    });

    expect(useDiagnosticStore.getState().diagnostics[0]).toMatchObject({
      jobId: "job-1",
      tabId: "pane-1",
      status: "running",
    });
    view.unmount();
    await waitFor(() => expect(mocks.dispose).toHaveBeenCalled());
    expect(useDiagnosticStore.getState().diagnostics[0].status).toBe("cancelled");
  });

  it("does not subscribe non-SSH panes", () => {
    render(<EventBridge enabled={false} />);
    expect(mocks.listen).not.toHaveBeenCalled();
  });

  it("does not overwrite a completed event when command startup resolves later", () => {
    const event = {
      jobId: "job-2",
      providerId: "linux",
      diagnosticId: "linux-identity",
      command: "uname -a",
      status: "completed" as const,
      stdout: "Linux host",
      stderr: "",
      exitCode: 0,
      truncated: false,
    };
    const store = useDiagnosticStore.getState();
    store.upsertDiagnostic("pane-1", event);
    store.attachDiagnostic("pane-1", { ...event, status: "running", stdout: "", exitCode: undefined });

    expect(useDiagnosticStore.getState().diagnostics[0]).toMatchObject({ status: "completed", stdout: "Linux host" });
  });

  it("persists bounded diagnostic history until finished records are cleared", () => {
    useDiagnosticStore.getState().upsertDiagnostic("pane-1", {
      jobId: "job-persisted",
      providerId: "linux",
      diagnosticId: "linux-identity",
      command: "uname -a",
      status: "completed",
      stdout: "Linux host",
      stderr: "",
      exitCode: 0,
      truncated: false,
    });

    const saved = JSON.parse(localStorage.getItem("sessiondock-diagnostics") ?? "null");
    expect(saved.state.diagnostics).toEqual([
      expect.objectContaining({ jobId: "job-persisted", status: "completed", stdout: "Linux host" }),
    ]);

    useDiagnosticStore.getState().clearFinished();
    const cleared = JSON.parse(localStorage.getItem("sessiondock-diagnostics") ?? "null");
    expect(cleared.state.diagnostics).toEqual([]);
  });

  it("sanitizes persisted history and cancels stale running jobs on rehydrate", async () => {
    localStorage.setItem("sessiondock-diagnostics", JSON.stringify({
      state: {
        diagnostics: [
          {
            jobId: "job-stale",
            tabId: "pane-1",
            providerId: "linux",
            diagnosticId: "linux-identity",
            command: "uname -a",
            status: "running",
            stdout: "partial output",
            stderr: "",
            truncated: false,
            updatedAt: 10,
          },
          { jobId: "malformed", status: "completed" },
        ],
      },
      version: 0,
    }));

    await useDiagnosticStore.persist.rehydrate();

    expect(useDiagnosticStore.getState().diagnostics).toEqual([
      expect.objectContaining({ jobId: "job-stale", status: "cancelled", stdout: "partial output" }),
    ]);
  });
});