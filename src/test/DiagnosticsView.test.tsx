import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DiagnosticsView } from "../components/views/DiagnosticsView";
import { useAppStore } from "../stores/appStore";
import { useDiagnosticStore } from "../stores/diagnosticStore";

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("../api/native", () => ({ nativeInvoke: mocks.invoke }));
vi.mock("zustand/middleware", () => ({ persist: (initializer: unknown) => initializer }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string, values?: { count?: number; defaultValue?: string }) => values?.defaultValue ?? (values?.count !== undefined ? `${key}:${values.count}` : key) }),
}));

const completedDiagnostic = {
  jobId: "job-1",
  tabId: "pane-1",
  providerId: "arista-eos",
  diagnosticId: "eos-platform",
  command: "show version",
  status: "completed" as const,
  stdout: "Arista vEOS 4.32.0F",
  stderr: "",
  exitCode: 0,
  truncated: false,
  updatedAt: 1,
};

describe("DiagnosticsView", () => {
  beforeEach(() => {
    mocks.invoke.mockReset().mockResolvedValue(undefined);
    useAppStore.setState({
      currentView: "diagnostics",
      activeTabId: null,
      tabs: [{
        id: "tab-1",
        sessionId: "session-1",
        sessionName: "Leaf switch",
        host: "192.0.2.10",
        protocol: "ssh",
        status: "connected",
        pinned: false,
        paneLayout: { type: "pane", id: "pane-1" },
      }],
    });
    useDiagnosticStore.setState({ diagnostics: [completedDiagnostic] });
  });

  it("shows raw output and focuses the owning pane", () => {
    render(<DiagnosticsView />);

    expect(screen.getByText("Arista vEOS 4.32.0F")).toBeInTheDocument();
    expect(screen.getByText("Leaf switch")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "diagnosticsWorkspace.focus" }));

    expect(useAppStore.getState()).toMatchObject({ activeTabId: "tab-1", currentView: "recent" });
    expect(useAppStore.getState().tabs[0].activePaneId).toBe("pane-1");
  });

  it("cancels active work through the native diagnostics manager", async () => {
    useDiagnosticStore.setState({ diagnostics: [{ ...completedDiagnostic, status: "running", stdout: "", exitCode: undefined }] });
    render(<DiagnosticsView />);
    fireEvent.click(screen.getByRole("button", { name: "deviceInfo.cancelDiagnostic" }));

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith("cancel_ssh_diagnostic", { jobId: "job-1" }));
  });

  it("reruns on the owning pane through the allowlisted request", async () => {
    mocks.invoke.mockResolvedValue("job-2");
    render(<DiagnosticsView />);
    fireEvent.click(screen.getByRole("button", { name: "diagnosticsWorkspace.rerun" }));

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith("start_ssh_diagnostic", {
      request: {
        tabId: "pane-1",
        providerId: "arista-eos",
        diagnosticId: "eos-platform",
      },
    }));
    expect(useDiagnosticStore.getState().diagnostics[0]).toMatchObject({ jobId: "job-2", status: "running" });
  });

  it("clears finished history but keeps active checks", () => {
    useDiagnosticStore.setState({ diagnostics: [
      completedDiagnostic,
      { ...completedDiagnostic, jobId: "job-2", status: "running", stdout: "", exitCode: undefined },
    ] });
    render(<DiagnosticsView />);
    fireEvent.click(screen.getByRole("button", { name: "diagnosticsWorkspace.clearFinished" }));

    expect(useDiagnosticStore.getState().diagnostics.map((diagnostic) => diagnostic.jobId)).toEqual(["job-2"]);
  });
});