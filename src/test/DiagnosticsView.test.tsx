import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DiagnosticsView } from "../components/views/DiagnosticsView";
import { useAppStore } from "../stores/appStore";
import { useDiagnosticStore } from "../stores/diagnosticStore";

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), writeText: vi.fn() }));

vi.mock("../api/native", () => ({ nativeInvoke: mocks.invoke }));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({ writeText: mocks.writeText }));
vi.mock("zustand/middleware", () => ({
  createJSONStorage: () => undefined,
  persist: (initializer: unknown) => initializer,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string, values?: { count?: number; defaultValue?: string; index?: number }) => values?.defaultValue ?? (values?.count !== undefined ? `${key}:${values.count}` : values?.index !== undefined ? `${key}:${values.index}` : key) }),
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
    mocks.writeText.mockReset().mockResolvedValue(undefined);
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

    expect(useAppStore.getState()).toMatchObject({ activeTabId: "tab-1", currentView: "terminal" });
    expect(useAppStore.getState().tabs[0].activePaneId).toBe("pane-1");
  });

  it("allows selecting and copying raw diagnostic output", async () => {
    render(<DiagnosticsView />);

    const rawOutput = screen.getByText("Arista vEOS 4.32.0F");
    expect(rawOutput).toHaveClass("select-text");
    fireEvent.click(screen.getByRole("button", { name: "deviceInfo.copyRawOutput" }));

    await waitFor(() => expect(mocks.writeText).toHaveBeenCalledWith("Arista vEOS 4.32.0F"));
  });

  it("asks for a target before opening Device Info", () => {
    render(<DiagnosticsView />);

    fireEvent.click(screen.getByRole("button", { name: "diagnosticsWorkspace.start" }));

    const dialog = screen.getByRole("dialog", { name: "diagnosticsWorkspace.chooseTarget" });
    expect(dialog).toBeInTheDocument();
    expect(useAppStore.getState()).toMatchObject({ activeTabId: null, currentView: "diagnostics" });

    fireEvent.click(within(dialog).getByText("Leaf switch"));

    expect(useAppStore.getState()).toMatchObject({ activeTabId: "tab-1", currentView: "terminal" });
    expect(useAppStore.getState().tabs[0]).toMatchObject({
      activePaneId: "pane-1",
      toolPaneId: "pane-1",
      toolPanel: "device",
    });
  });

  it("opens Device Info on the connected device explicitly selected by the user", () => {
    useAppStore.setState((state) => ({
      activeTabId: "tab-1",
      tabs: [...state.tabs, {
        id: "tab-2",
        sessionId: "session-2",
        sessionName: "Core switch",
        host: "192.0.2.20",
        protocol: "ssh",
        status: "connected",
        pinned: false,
        paneLayout: { type: "pane", id: "pane-2" },
      }],
    }));
    render(<DiagnosticsView />);

    fireEvent.click(screen.getByRole("button", { name: "diagnosticsWorkspace.start" }));
    fireEvent.click(screen.getByText("Core switch"));

    expect(useAppStore.getState()).toMatchObject({ activeTabId: "tab-2", currentView: "terminal" });
    expect(useAppStore.getState().tabs[1]).toMatchObject({ toolPaneId: "pane-2", toolPanel: "device" });
  });

  it("opens Quick Connect when no SSH device is connected", () => {
    useAppStore.setState({ tabs: [], activeTabId: null });
    const onQuickConnect = vi.fn();
    render(<DiagnosticsView onQuickConnect={onQuickConnect} />);

    fireEvent.click(screen.getByRole("button", { name: "diagnosticsWorkspace.start" }));

    expect(onQuickConnect).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
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