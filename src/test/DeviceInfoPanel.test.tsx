import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DeviceInfoPanel } from "../components/terminal/DeviceInfoPanel";
import { useDiagnosticStore } from "../stores/diagnosticStore";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

vi.mock("../api/native", () => ({ nativeInvoke: mocks.invoke }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe("DeviceInfoPanel", () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
    useDiagnosticStore.setState({ diagnostics: [] });
    mocks.invoke.mockResolvedValue(undefined);
  });

  it("shows configured provider evidence and inserts the exact command without executing", async () => {
    render(
      <DeviceInfoPanel
        tabId="pane-arista"
        context={{ vendor: "Arista", deviceType: "Switch", model: "DCS-7050" }}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("Arista EOS")).toBeInTheDocument();
    expect(screen.getByText("deviceInfo.confidence.high")).toBeInTheDocument();
    expect(screen.getByText("deviceInfo.sources.configured-metadata")).toBeInTheDocument();
    const command = screen.getByText("show interfaces status").closest("article");
    expect(command).not.toBeNull();
    fireEvent.click(within(command!).getByRole("button", { name: "deviceInfo.insert" }));

    await waitFor(() => {
      expect(mocks.invoke).toHaveBeenCalledWith("write_terminal", {
        tabId: "pane-arista",
        data: "show interfaces status",
        protocol: "ssh",
      });
    });
  });

  it("does not guess commands for unknown metadata", () => {
    render(
      <DeviceInfoPanel
        tabId="pane-unknown"
        context={{ vendor: "Unknown Networks", deviceType: "Switch" }}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("Generic SSH")).toBeInTheDocument();
    expect(screen.getByText("deviceInfo.confidence.low")).toBeInTheDocument();
    expect(screen.getByText("deviceInfo.sources.fallback")).toBeInTheDocument();
    expect(screen.getByText("deviceInfo.noProviderCommands")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "deviceInfo.insert" })).not.toBeInTheDocument();
  });

  it("runs an allowlisted diagnostic by ID and exposes raw output", async () => {
    mocks.invoke.mockResolvedValueOnce("job-1");
    render(<DeviceInfoPanel tabId="pane-diagnostic" context={{ vendor: "Arista", deviceType: "Switch" }} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "deviceInfo.diagnostics" }));
    const diagnostic = screen.getByText("show version").closest("article");
    fireEvent.click(within(diagnostic!).getByRole("button", { name: "deviceInfo.runDiagnostic" }));

    await waitFor(() => {
      expect(mocks.invoke).toHaveBeenCalledWith("start_ssh_diagnostic", {
        request: {
          tabId: "pane-diagnostic",
          providerId: "arista-eos",
          diagnosticId: "eos-platform",
        },
      });
    });
    act(() => {
      useDiagnosticStore.getState().upsertDiagnostic("pane-diagnostic", {
          jobId: "job-1",
          providerId: "arista-eos",
          diagnosticId: "eos-platform",
          command: "show version",
          status: "completed",
          stdout: "Arista vEOS 4.32.0F",
          stderr: "",
          exitCode: 0,
          truncated: false,
      });
    });

    expect(await screen.findByText("Arista vEOS 4.32.0F")).toBeInTheDocument();
    expect(screen.getByText("deviceInfo.status.completed")).toBeInTheDocument();
    expect(screen.getByText(/deviceInfo.exitCode/)).toBeInTheDocument();
  });
});