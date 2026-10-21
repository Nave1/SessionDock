import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SnippetPanel } from "../components/terminal/SnippetPanel";

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("../api/native", () => ({ nativeInvoke: mocks.invoke }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const snippet = {
  id: "snippet-1",
  name: "Show interfaces",
  command: "show interfaces status",
  description: "Read-only interface summary",
  category: "Diagnostics",
  vendor: "Arista",
  favorite: true,
  destructive: false,
};

describe("SnippetPanel", () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
    mocks.invoke.mockImplementation(async (command: string) => command === "get_snippets" ? [snippet] : undefined);
  });

  it("shows the exact command and inserts it without executing", async () => {
    render(<SnippetPanel tabId="pane-1" onClose={vi.fn()} />);

    expect(await screen.findByText("show interfaces status")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "snippets.insert" }));

    await waitFor(() => {
      expect(mocks.invoke).toHaveBeenCalledWith("write_terminal", {
        tabId: "pane-1",
        data: "show interfaces status",
        protocol: "ssh",
      });
    });
  });

  it("creates a snippet and refreshes the list", async () => {
    mocks.invoke
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({ id: "snippet-2" })
      .mockResolvedValueOnce([snippet]);
    render(<SnippetPanel tabId="pane-2" onClose={vi.fn()} />);

    await screen.findByText("snippets.empty");
    fireEvent.click(screen.getByLabelText("snippets.new"));
    fireEvent.change(screen.getByLabelText("snippets.name"), { target: { value: "Show interfaces" } });
    fireEvent.change(screen.getByLabelText("snippets.command"), { target: { value: "show interfaces status" } });
    fireEvent.click(screen.getByRole("button", { name: "snippets.save" }));

    await waitFor(() => {
      expect(mocks.invoke).toHaveBeenCalledWith("create_snippet", {
        request: expect.objectContaining({
          name: "Show interfaces",
          command: "show interfaces status",
          destructive: false,
        }),
      });
    });
    expect(await screen.findByText("show interfaces status")).toBeInTheDocument();
  });

  it("sends snippet updates through the typed request payload", async () => {
    render(<SnippetPanel tabId="pane-3" onClose={vi.fn()} />);

    await screen.findByText("show interfaces status");
    fireEvent.click(screen.getByRole("button", { name: "snippets.favorite" }));

    await waitFor(() => {
      expect(mocks.invoke).toHaveBeenCalledWith("update_snippet", {
        request: { id: "snippet-1", favorite: false },
      });
    });
  });
});