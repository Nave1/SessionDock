import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SftpPanel } from "../components/terminal/SftpPanel";
import { useTransferStore } from "../stores/transferStore";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

vi.mock("../api/native", () => ({ nativeInvoke: mocks.invoke }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe("SftpPanel", () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
    useTransferStore.setState({ transfers: [] });
  });

  it("loads the remote root and opens a directory", async () => {
    mocks.invoke.mockImplementation(async (command: string, args: { path?: string }) => {
      if (command === "list_local_directory") return { entries: [] };
      if (command === "list_sftp_directory" && args.path === "/") return [
        { name: "logs", path: "/logs", kind: "directory" },
        { name: "readme.txt", path: "/readme.txt", kind: "file", size: 12 },
      ];
      return [];
    });

    render(<SftpPanel tabId="pane-1" onClose={vi.fn()} />);

    expect(await screen.findByText("logs")).toBeInTheDocument();
    fireEvent.doubleClick(screen.getByText("logs"));

    await waitFor(() => {
      expect(mocks.invoke).toHaveBeenCalledWith("list_sftp_directory", {
        tabId: "pane-1",
        path: "/logs",
      });
    });
    expect(screen.getByLabelText("sftp.remotePath")).toHaveValue("/logs");
  });

  it("cancels an active transfer through the scoped command", async () => {
    mocks.invoke.mockImplementation(async (command: string) => command === "list_local_directory" ? { entries: [] } : []);
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
    mocks.invoke.mockImplementation(async (command: string) => {
      if (command === "list_local_directory") return {
        path: "C:\\configs",
        parentPath: "C:\\",
        entries: [{ name: "switch.cfg", path: "C:\\configs\\switch.cfg", kind: "file", size: 128 }],
      };
      if (command === "list_sftp_directory") return [];
      return "scp-transfer-1";
    });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<SftpPanel tabId="pane-scp" onClose={vi.fn()} />);

    await screen.findByText("sftp.empty");
    fireEvent.click(screen.getByText("switch.cfg"));
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

  it("downloads the selected remote file into the current local directory", async () => {
    mocks.invoke.mockImplementation(async (command: string) => {
      if (command === "list_local_directory") return { path: "C:\\downloads", parentPath: "C:\\", entries: [] };
      if (command === "list_sftp_directory") return [{ name: "backup.cfg", path: "/backup.cfg", kind: "file", size: 64 }];
      return "download-transfer-1";
    });
    render(<SftpPanel tabId="pane-download" onClose={vi.fn()} />);

    fireEvent.click(await screen.findByText("backup.cfg"));
    fireEvent.click(screen.getByLabelText("sftp.download"));

    await waitFor(() => {
      expect(mocks.invoke).toHaveBeenCalledWith("start_sftp_download", {
        tabId: "pane-download",
        localPath: "C:\\downloads\\backup.cfg",
        remotePath: "/backup.cfg",
        overwrite: false,
      });
    });
  });

  it("uploads a local file dropped onto the remote pane", async () => {
    mocks.invoke.mockImplementation(async (command: string) => {
      if (command === "list_local_directory") return {
        path: "C:\\configs",
        entries: [{ name: "switch.cfg", path: "C:\\configs\\switch.cfg", kind: "file", size: 128 }],
      };
      if (command === "list_sftp_directory") return [];
      return "upload-transfer-1";
    });
    render(<SftpPanel tabId="pane-drop-upload" onClose={vi.fn()} />);
    const localFile = (await screen.findByText("switch.cfg")).closest("button")!;
    const payloads = new Map<string, string>();
    const dragTransfer = {
      effectAllowed: "none",
      setData: (type: string, value: string) => payloads.set(type, value),
    };
    fireEvent.dragStart(localFile, { dataTransfer: dragTransfer });

    const remotePane = screen.getByRole("listbox", { name: "sftp.remoteFiles" });
    const dropTransfer = {
      types: [],
      dropEffect: "none",
      getData: (type: string) => payloads.get(type) ?? "",
    };
    fireEvent.dragOver(remotePane, { dataTransfer: dropTransfer });
    fireEvent.drop(remotePane, { dataTransfer: dropTransfer });

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith("start_sftp_upload", {
      tabId: "pane-drop-upload",
      localPath: "C:\\configs\\switch.cfg",
      remotePath: "/switch.cfg",
      overwrite: false,
    }));
  });

  it("uploads a local file into the remote folder it is dropped onto", async () => {
    mocks.invoke.mockImplementation(async (command: string) => {
      if (command === "list_local_directory") return {
        path: "C:\\configs",
        entries: [{ name: "switch.cfg", path: "C:\\configs\\switch.cfg", kind: "file", size: 128 }],
      };
      if (command === "list_sftp_directory") return [{ name: "archive", path: "/archive", kind: "directory" }];
      return "upload-transfer-2";
    });
    render(<SftpPanel tabId="pane-folder-upload" onClose={vi.fn()} />);
    const payloads = new Map<string, string>();
    fireEvent.dragStart((await screen.findByText("switch.cfg")).closest("button")!, {
      dataTransfer: { effectAllowed: "none", setData: (type: string, value: string) => payloads.set(type, value) },
    });
    const remoteFolder = screen.getByText("archive").closest("button")!;
    const dropTransfer = { types: [], dropEffect: "none", getData: (type: string) => payloads.get(type) ?? "" };
    fireEvent.dragOver(remoteFolder, { dataTransfer: dropTransfer });
    fireEvent.drop(remoteFolder, { dataTransfer: dropTransfer });

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith("start_sftp_upload", {
      tabId: "pane-folder-upload",
      localPath: "C:\\configs\\switch.cfg",
      remotePath: "/archive/switch.cfg",
      overwrite: false,
    }));
  });

  it("downloads a remote file dropped onto the local pane", async () => {
    mocks.invoke.mockImplementation(async (command: string) => {
      if (command === "list_local_directory") return { path: "C:\\downloads", entries: [] };
      if (command === "list_sftp_directory") return [{ name: "backup.cfg", path: "/backup.cfg", kind: "file", size: 64 }];
      return "download-transfer-1";
    });
    render(<SftpPanel tabId="pane-drop-download" onClose={vi.fn()} />);
    const remoteFile = (await screen.findByText("backup.cfg")).closest("button")!;
    const payloads = new Map<string, string>();
    fireEvent.dragStart(remoteFile, {
      dataTransfer: {
        effectAllowed: "none",
        setData: (type: string, value: string) => payloads.set(type, value),
      },
    });

    const localPane = screen.getByRole("listbox", { name: "sftp.localFiles" });
    const dropTransfer = {
      types: ["application/sessiondock-remote-file"],
      dropEffect: "none",
      getData: (type: string) => payloads.get(type) ?? "",
    };
    fireEvent.dragOver(localPane, { dataTransfer: dropTransfer });
    fireEvent.drop(localPane, { dataTransfer: dropTransfer });

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith("start_sftp_download", {
      tabId: "pane-drop-download",
      localPath: "C:\\downloads\\backup.cfg",
      remotePath: "/backup.cfg",
      overwrite: false,
    }));
  });

  it("downloads a remote file into the local folder it is dropped onto", async () => {
    mocks.invoke.mockImplementation(async (command: string) => {
      if (command === "list_local_directory") return {
        path: "C:\\downloads",
        entries: [{ name: "archive", path: "C:\\downloads\\archive", kind: "directory" }],
      };
      if (command === "list_sftp_directory") return [{ name: "backup.cfg", path: "/backup.cfg", kind: "file", size: 64 }];
      return "download-transfer-2";
    });
    render(<SftpPanel tabId="pane-folder-download" onClose={vi.fn()} />);
    const payloads = new Map<string, string>();
    fireEvent.dragStart((await screen.findByText("backup.cfg")).closest("button")!, {
      dataTransfer: { effectAllowed: "none", setData: (type: string, value: string) => payloads.set(type, value) },
    });
    const localFolder = screen.getByText("archive").closest("button")!;
    const dropTransfer = { types: [], dropEffect: "none", getData: (type: string) => payloads.get(type) ?? "" };
    fireEvent.dragOver(localFolder, { dataTransfer: dropTransfer });
    fireEvent.drop(localFolder, { dataTransfer: dropTransfer });

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith("start_sftp_download", {
      tabId: "pane-folder-download",
      localPath: "C:\\downloads\\archive\\backup.cfg",
      remotePath: "/backup.cfg",
      overwrite: false,
    }));
  });

  it("requires confirmation before an SCP upload started by dropping a local file", async () => {
    mocks.invoke.mockImplementation(async (command: string) => {
      if (command === "list_local_directory") return {
        path: "C:\\configs",
        entries: [{ name: "switch.cfg", path: "C:\\configs\\switch.cfg", kind: "file", size: 128 }],
      };
      if (command === "list_sftp_directory") return [];
      return "scp-drop-transfer-1";
    });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<SftpPanel tabId="pane-scp-drop" onClose={vi.fn()} />);
    const localFile = (await screen.findByText("switch.cfg")).closest("button")!;
    fireEvent.change(screen.getByLabelText("sftp.transferProtocol"), { target: { value: "scp" } });
    const payloads = new Map<string, string>();
    fireEvent.dragStart(localFile, {
      dataTransfer: {
        effectAllowed: "none",
        setData: (type: string, value: string) => payloads.set(type, value),
      },
    });
    const remotePane = screen.getByRole("listbox", { name: "sftp.remoteFiles" });
    const dropTransfer = {
      types: ["application/sessiondock-local-file"],
      dropEffect: "none",
      getData: (type: string) => payloads.get(type) ?? "",
    };
    fireEvent.drop(remotePane, { dataTransfer: dropTransfer });

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith("start_scp_upload", {
      tabId: "pane-scp-drop",
      localPath: "C:\\configs\\switch.cfg",
      remotePath: "/switch.cfg",
      overwrite: true,
    }));
    expect(confirm).toHaveBeenCalledWith("sftp.confirmScpUpload");
    confirm.mockRestore();
  });
});
