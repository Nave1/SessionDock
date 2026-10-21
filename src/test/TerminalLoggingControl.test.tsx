import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TerminalLoggingControl } from "../components/terminal/TerminalLoggingControl";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  open: vi.fn(),
}));

vi.mock("../api/native", () => ({ nativeInvoke: mocks.invoke }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: mocks.open }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe("TerminalLoggingControl", () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
    mocks.open.mockReset();
    vi.restoreAllMocks();
    mocks.invoke.mockResolvedValue({ active: false, path: null });
  });

  it("does not choose a folder or start logging without explicit confirmation", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<TerminalLoggingControl tabId="pane-1" />);

    fireEvent.click(await screen.findByRole("button", { name: "terminalLogging.start" }));

    expect(mocks.open).not.toHaveBeenCalled();
    expect(mocks.invoke).not.toHaveBeenCalledWith("start_terminal_logging", expect.anything());
  });

  it("passes only the selected directory and shows the active path", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mocks.open.mockResolvedValue("C:\\secure\\logs");
    mocks.invoke.mockImplementation(async (command: string) => {
      if (command === "start_terminal_logging") {
        return { active: true, path: "C:\\secure\\logs\\sessiondock-20260101-pane.log" };
      }
      return { active: false, path: null };
    });
    render(<TerminalLoggingControl tabId="pane-2" />);

    fireEvent.click(await screen.findByRole("button", { name: "terminalLogging.start" }));

    await waitFor(() => {
      expect(mocks.invoke).toHaveBeenCalledWith("start_terminal_logging", {
        tabId: "pane-2",
        directory: "C:\\secure\\logs",
      });
    });
    const stopButton = await screen.findByRole("button", { name: "terminalLogging.stop" });
    expect(stopButton).toHaveAttribute("title", expect.stringContaining("sessiondock-20260101-pane.log"));
    expect(screen.getByText("terminalLogging.recording")).toBeInTheDocument();
  });

  it("stops the active backend logger explicitly", async () => {
    mocks.invoke.mockResolvedValueOnce({ active: true, path: "C:\\secure\\session.log" });
    mocks.invoke.mockResolvedValueOnce({ active: false, path: null });
    render(<TerminalLoggingControl tabId="pane-3" />);

    fireEvent.click(await screen.findByRole("button", { name: "terminalLogging.stop" }));

    await waitFor(() => {
      expect(mocks.invoke).toHaveBeenCalledWith("stop_terminal_logging", { tabId: "pane-3" });
    });
    expect(await screen.findByRole("button", { name: "terminalLogging.start" })).toBeInTheDocument();
  });
});
