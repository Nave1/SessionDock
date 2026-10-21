import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MultiExecPanel } from "../components/terminal/MultiExecPanel";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  listen: vi.fn(),
  eventHandler: undefined as ((event: { payload: Record<string, unknown> }) => void) | undefined,
  tabs: [] as Array<Record<string, unknown>>,
}));

vi.mock("../api/native", () => ({ nativeInvoke: mocks.invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen: mocks.listen }));
vi.mock("../stores/appStore", () => ({
  useAppStore: (selector: (state: { tabs: Array<Record<string, unknown>> }) => unknown) => selector({ tabs: mocks.tabs }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function sshTab(id: string, name: string, host: string) {
  return {
    id,
    sessionId: `session-${id}`,
    sessionName: name,
    host,
    protocol: "ssh",
    status: "connected",
    pinned: false,
  };
}

describe("MultiExecPanel", () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
    mocks.listen.mockReset();
    mocks.eventHandler = undefined;
    mocks.listen.mockImplementation(async (_event: string, handler: typeof mocks.eventHandler) => {
      mocks.eventHandler = handler;
      return vi.fn();
    });
    mocks.tabs = [
      sshTab("pane-owner", "Leaf 01", "10.0.0.11"),
      sshTab("pane-target", "Leaf 02", "10.0.0.12"),
    ];
  });

  it("reviews and executes the exact command on only selected pane IDs", async () => {
    mocks.invoke.mockImplementation(async (command: string) => {
      if (command === "classify_multi_exec_command") {
        return { risk: "read_only", reasons: ["recognized_read_only"] };
      }
      if (command === "start_multi_exec") return "batch-1";
      return undefined;
    });
    render(<MultiExecPanel tabId="pane-owner" onClose={vi.fn()} />);

    fireEvent.click(screen.getByText("Leaf 02").closest("label")!.querySelector("input")!);
    fireEvent.change(screen.getByRole("textbox", { name: "multiExec.command" }), { target: { value: "show version" } });
    fireEvent.click(screen.getByRole("button", { name: "multiExec.review" }));

    expect(await screen.findByText("multiExec.risk.read_only")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "multiExec.execute" }));

    await waitFor(() => {
      expect(mocks.invoke).toHaveBeenCalledWith("start_multi_exec", {
        request: {
          ownerTabId: "pane-owner",
          targetTabIds: ["pane-owner", "pane-target"],
          command: "show version",
          acknowledgedRisk: false,
          confirmation: null,
        },
      });
    });
  });

  it("requires acknowledgement and the exact target-count phrase for high risk", async () => {
    mocks.invoke.mockImplementation(async (command: string) => command === "classify_multi_exec_command"
      ? { risk: "high_risk", reasons: ["destructive_keyword"] }
      : "batch-high-risk");
    render(<MultiExecPanel tabId="pane-owner" onClose={vi.fn()} />);

    fireEvent.change(screen.getByRole("textbox", { name: "multiExec.command" }), { target: { value: "reload" } });
    fireEvent.click(screen.getByRole("button", { name: "multiExec.review" }));
    const execute = await screen.findByRole("button", { name: "multiExec.execute" });
    expect(execute).toBeDisabled();

    fireEvent.click(screen.getByText("multiExec.acknowledgeRisk").closest("label")!.querySelector("input")!);
    fireEvent.change(screen.getByLabelText("multiExec.confirmation"), { target: { value: "EXECUTE 2 TARGETS" } });
    expect(execute).toBeDisabled();
    fireEvent.change(screen.getByLabelText("multiExec.confirmation"), { target: { value: "EXECUTE 1 TARGETS" } });
    expect(execute).toBeEnabled();
  });

  it("renders raw per-target output from native events", async () => {
    mocks.invoke.mockImplementation(async (command: string) => command === "classify_multi_exec_command"
      ? { risk: "read_only", reasons: ["recognized_read_only"] }
      : "batch-output");
    render(<MultiExecPanel tabId="pane-owner" onClose={vi.fn()} />);

    act(() => {
      mocks.eventHandler?.({
        payload: {
          batchId: "batch-output",
          targetTabId: "pane-owner",
          command: "show version",
          risk: "read_only",
          status: "completed",
          stdout: "Arista vEOS 4.32.0F",
          stderr: "",
          exitCode: 0,
          truncated: false,
        },
      });
    });

    expect(await screen.findByText("Arista vEOS 4.32.0F")).toBeInTheDocument();
    expect(screen.getByText("multiExec.status.completed")).toBeInTheDocument();
    expect(screen.getByText(/multiExec.exitCode/)).toBeInTheDocument();
  });

  it("cancels a running batch by its backend-issued ID", async () => {
    mocks.invoke.mockResolvedValue(undefined);
    render(<MultiExecPanel tabId="pane-owner" onClose={vi.fn()} />);

    act(() => {
      mocks.eventHandler?.({
        payload: {
          batchId: "batch-running",
          targetTabId: "pane-owner",
          command: "show version",
          risk: "read_only",
          status: "running",
          stdout: "",
          stderr: "",
          truncated: false,
        },
      });
    });
    fireEvent.click(await screen.findByRole("button", { name: "multiExec.cancel" }));

    await waitFor(() => {
      expect(mocks.invoke).toHaveBeenCalledWith("cancel_multi_exec", { batchId: "batch-running" });
    });
  });
});