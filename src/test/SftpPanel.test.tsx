import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SftpPanel } from "../components/terminal/SftpPanel";
import { useTransferStore } from "../stores/transferStore";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  open: vi.fn(),
  save: vi.fn(),
}));

vi.mock("../api/native", () => ({ nativeInvoke: mocks.invoke }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: mocks.open, save: mocks.save }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe("SftpPanel", () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
    mocks.open.mockReset();
    mocks.save.mockReset();
    useTransferStore.setState({ transfers: [] });
  });

  it("loads the remote root and opens a directory", async () => {
    mocks.invoke
      .mockResolvedValueOnce([
        { name: "logs", path: "/logs", kind: "directory" },
        { name: "readme.txt", path: "/readme.txt", kind: "file", size: 12 },
      ])
      .mockResolvedValueOnce([]);

    render(<SftpPanel tabId="pane-1" onClose={vi.fn()} />);

    expect(await screen.findByText("logs")).toBeInTheDocument();
    fireEvent.doubleClick(screen.getByText("logs"));

    await waitFor(() => {
      expect(mocks.invoke).toHaveBeenNthCalledWith(2, "list_sftp_directory", {
        tabId: "pane-1",
        path: "/logs",
      });
    });
    expect(screen.getByLabelText("sftp.remotePath")).toHaveValue("/logs");
  });

  it("cancels an active transfer through the scoped command", async () => {
    mocks.invoke.mockImplementation(async (command: string) => command === "list_sftp_directory" ? [] : undefined);
    render(<SftpPanel tabId="pane-7" onClose={vi.fn()} />);

    act(() => {
      useTransferStore.getState().upsertTransfer("pane-7", {
        id: "transfer-1",
        name: "config.txt",
        direction: "download",
        transferred: 25,
        total: 100,
        status: "running",
      });
    });

    fireEvent.click(await screen.findByLabelText("sftp.cancel"));
    await waitFor(() => {
      expect(mocks.invoke).toHaveBeenCalledWith("cancel_sftp_transfer", {
        transferId: "transfer-1",
      });
    });
    expect(screen.queryByLabelText("sftp.cancel")).not.toBeInTheDocument();
  });

  it("uses SCP only after explicit upload confirmation", async () => {
    mocks.invoke.mockImplementation(async (command: string) => command === "list_sftp_directory" ? [] : "scp-transfer-1");
    mocks.open.mockResolvedValue("C:\\configs\\switch.cfg");
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<SftpPanel tabId="pane-scp" onClose={vi.fn()} />);

    await screen.findByText("sftp.empty");
    fireEvent.change(screen.getByLabelText("sftp.transferProtocol"), { target: { value: "scp" } });
    fireEvent.change(screen.getByLabelText("sftp.scpRemoteFile"), { target: { value: "/tmp/switch.cfg" } });
    fireEvent.click(screen.getByLabelText("sftp.upload"));

    await waitFor(() => {
      expect(mocks.invoke).toHaveBeenCalledWith("start_scp_upload", {
        tabId: "pane-scp",
        localPath: "C:\\configs\\switch.cfg",
        remotePath: "/tmp/switch.cfg",
        overwrite: true,
      });
    });
    expect(confirm).toHaveBeenCalledWith("sftp.confirmScpUpload");
    confirm.mockRestore();
  });
});
