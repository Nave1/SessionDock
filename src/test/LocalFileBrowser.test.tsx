import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LocalFileBrowser } from "../components/terminal/LocalFileBrowser";
import { useFileBrowserStore } from "../stores/fileBrowserStore";

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("../api/native", () => ({ nativeInvoke: mocks.invoke }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe("LocalFileBrowser", () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
    localStorage.removeItem("sessiondock-file-browser");
    useFileBrowserStore.setState({ lastLocalDirectory: undefined });
  });

  it("loads drive roots, opens a directory, and reports file selection", async () => {
    mocks.invoke.mockImplementation(async (_command: string, args: { path?: string | null }) => {
      if (!args.path) return { entries: [{ name: "C:\\", path: "C:\\", kind: "drive" }] };
      return {
        path: "C:\\",
        entries: [{ name: "session.log", path: "C:\\session.log", kind: "file", size: 42 }],
      };
    });
    const onSelectionChange = vi.fn();
    render(<LocalFileBrowser onSelectionChange={onSelectionChange} />);

    fireEvent.doubleClick(await screen.findByText("C:\\"));
    fireEvent.click(await screen.findByText("session.log"));

    expect(mocks.invoke).toHaveBeenCalledWith("list_local_directory", { path: "C:\\" });
    expect(onSelectionChange).toHaveBeenLastCalledWith({
      directoryPath: "C:\\",
      entry: { name: "session.log", path: "C:\\session.log", kind: "file", size: 42 },
    });
  });

  it("creates, renames, and deletes through narrow local commands", async () => {
    mocks.invoke.mockImplementation(async (command: string) => {
      if (command === "list_local_directory") return {
        path: "C:\\configs",
        parentPath: "C:\\",
        entries: [{ name: "old.cfg", path: "C:\\configs\\old.cfg", kind: "file", size: 12 }],
      };
      return undefined;
    });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<LocalFileBrowser onSelectionChange={vi.fn()} />);

    await screen.findByText("old.cfg");
    fireEvent.click(screen.getByLabelText("sftp.newFolder"));
    fireEvent.change(screen.getByRole("textbox", { name: "sftp.newFolder" }), { target: { value: "archive" } });
    fireEvent.click(screen.getByText("session.save"));
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith("create_local_directory", { path: "C:\\configs", name: "archive" }));

    fireEvent.click(screen.getByText("old.cfg"));
    fireEvent.click(screen.getByLabelText("sftp.rename"));
    fireEvent.change(screen.getByRole("textbox", { name: "sftp.rename" }), { target: { value: "new.cfg" } });
    fireEvent.click(screen.getByText("session.save"));
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith("rename_local_entry", { path: "C:\\configs\\old.cfg", name: "new.cfg" }));

    fireEvent.click(screen.getByText("old.cfg"));
    fireEvent.click(screen.getByLabelText("sftp.delete"));
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith("delete_local_entry", { path: "C:\\configs\\old.cfg" }));
    expect(confirm).toHaveBeenCalledWith("sftp.confirmDeleteLocal");
    confirm.mockRestore();
  });

  it("restores the last successfully opened local directory", async () => {
    mocks.invoke.mockImplementation(async (_command: string, args: { path?: string | null }) => {
      if (!args.path) return { entries: [{ name: "C:\\", path: "C:\\", kind: "drive" }] };
      return { path: args.path, parentPath: undefined, entries: [] };
    });
    const first = render(<LocalFileBrowser onSelectionChange={vi.fn()} />);

    fireEvent.doubleClick(await screen.findByText("C:\\"));
    await waitFor(() => expect(useFileBrowserStore.getState().lastLocalDirectory).toBe("C:\\"));
    first.unmount();
    mocks.invoke.mockClear();

    render(<LocalFileBrowser onSelectionChange={vi.fn()} />);
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith("list_local_directory", { path: "C:\\" }));
  });
});