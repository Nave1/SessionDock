import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ChevronUp,
  File,
  Folder,
  FolderPlus,
  Pause,
  Pencil,
  Play,
  RefreshCw,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { nativeInvoke } from "../../api/native";
import { useToastStore } from "../../stores/toastStore";
import {
  type TransferRecord,
  type TransferRequest,
  useTransferStore,
} from "../../stores/transferStore";
import type { TerminalTransferProtocol } from "../../stores/appStore";
import {
  formatTransferSize,
  joinRemotePath,
  parentRemotePath,
  sortSftpEntries,
  type SftpEntry,
  type SftpSortKey,
} from "../../utils/sftp";
import { LocalFileBrowser, type LocalFileSelection } from "./LocalFileBrowser";

interface SftpPanelProps {
  tabId: string;
  onClose: () => void;
  initialTransferProtocol?: TerminalTransferProtocol;
}

interface EditAction {
  kind: "mkdir" | "rename";
  value: string;
}

function fileName(path: string): string {
  const components = path.split(/[\\/]/).filter(Boolean);
  return components[components.length - 1] ?? "upload";
}

function joinLocalPath(parent: string, name: string): string {
  const separator = parent.includes("\\") ? "\\" : "/";
  return parent.endsWith("/") || parent.endsWith("\\") ? `${parent}${name}` : `${parent}${separator}${name}`;
}

function validEntryName(name: string): boolean {
  return name.length > 0 && name !== "." && name !== ".." && !name.includes("/") && !name.includes("\\") && !name.includes("\0");
}

export function SftpPanel({ tabId, onClose, initialTransferProtocol = "sftp" }: SftpPanelProps) {
  const { t } = useTranslation();
  const addToast = useToastStore((state) => state.addToast);
  const [path, setPath] = useState("/");
  const [pathInput, setPathInput] = useState("/");
  const [entries, setEntries] = useState<SftpEntry[]>([]);
  const [sortKey, setSortKey] = useState<SftpSortKey>("name");
  const [selectedPath, setSelectedPath] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [editAction, setEditAction] = useState<EditAction>();
  const [localSelection, setLocalSelection] = useState<LocalFileSelection>({});
  const allTransfers = useTransferStore((state) => state.transfers);
  const attachRequest = useTransferStore((state) => state.attachRequest);
  const setTransferStatus = useTransferStore((state) => state.setTransferStatus);
  const [transferProtocol, setTransferProtocol] = useState<TerminalTransferProtocol>(initialTransferProtocol);
  const [scpRemotePath, setScpRemotePath] = useState("/");
  const transfers = allTransfers.filter((transfer) => transfer.tabId === tabId).slice(0, 25);

  useEffect(() => {
    setTransferProtocol(initialTransferProtocol);
  }, [initialTransferProtocol]);

  const loadDirectory = useCallback(async (nextPath: string) => {
    setLoading(true);
    setError(undefined);
    try {
      const result = await nativeInvoke<SftpEntry[]>("list_sftp_directory", { tabId, path: nextPath });
      setEntries(result);
      setPath(nextPath);
      setPathInput(nextPath);
      setSelectedPath(undefined);
    } catch (loadError) {
      setError(String(loadError));
    } finally {
      setLoading(false);
    }
  }, [tabId]);

  useEffect(() => {
    void loadDirectory("/");
  }, [loadDirectory]);

  const sortedEntries = useMemo(() => sortSftpEntries(entries, sortKey), [entries, sortKey]);
  const selected = entries.find((entry) => entry.path === selectedPath);

  const startTransfer = async (request: TransferRequest) => {
    const run = async (overwrite: boolean) => {
      const args = { ...request.args, overwrite };
      const id = await nativeInvoke<string>(request.command, args);
      const direction = request.command.endsWith("_upload") ? "upload" : "download";
      attachRequest(tabId, id, { ...request, args } as TransferRequest, fileName(args.localPath), direction);
    };

    try {
      await run(request.args.overwrite);
    } catch (transferError) {
      const message = String(transferError);
      if (message.includes("destination already exists") && window.confirm(t("sftp.confirmOverwrite"))) {
        await run(true);
      } else {
        addToast("error", message);
      }
    }
  };

  const upload = async () => {
    const localPath = localSelection.entry?.kind === "file" ? localSelection.entry.path : undefined;
    if (!localPath) return;
    if (transferProtocol === "scp") {
      if (!window.confirm(t("sftp.confirmScpUpload", { path: scpRemotePath }))) return;
      await startTransfer({
        command: "start_scp_upload",
        args: { tabId, localPath, remotePath: scpRemotePath, overwrite: true },
      });
      return;
    }
    await startTransfer({
      command: "start_sftp_upload",
      args: { tabId, localPath, remotePath: joinRemotePath(path, fileName(localPath)), overwrite: false },
    });
  };

  const download = async () => {
    const remotePath = transferProtocol === "scp" ? scpRemotePath : selected?.path;
    if (!remotePath || (transferProtocol === "sftp" && (!selected || selected.kind === "directory"))) return;
    if (!localSelection.directoryPath) return;
    const localPath = joinLocalPath(localSelection.directoryPath, transferProtocol === "scp" ? fileName(remotePath) : selected!.name);
    await startTransfer({
      command: transferProtocol === "scp" ? "start_scp_download" : "start_sftp_download",
      args: { tabId, localPath, remotePath, overwrite: false },
    });
  };

  const submitEdit = async () => {
    if (!editAction || !validEntryName(editAction.value)) return;
    try {
      if (editAction.kind === "mkdir") {
        await nativeInvoke("create_sftp_directory", { tabId, path: joinRemotePath(path, editAction.value) });
      } else if (selected) {
        await nativeInvoke("rename_sftp_entry", {
          tabId,
          sourcePath: selected.path,
          destinationPath: joinRemotePath(parentRemotePath(selected.path), editAction.value),
        });
      }
      setEditAction(undefined);
      await loadDirectory(path);
    } catch (operationError) {
      addToast("error", String(operationError));
    }
  };

  const remove = async () => {
    if (!selected || !window.confirm(t("sftp.confirmDelete", { name: selected.name }))) return;
    try {
      await nativeInvoke("delete_sftp_entry", { tabId, path: selected.path, isDirectory: selected.kind === "directory" });
      await loadDirectory(path);
    } catch (operationError) {
      addToast("error", String(operationError));
    }
  };

  const setTransferState = async (transfer: TransferRecord, action: "pause" | "resume" | "cancel") => {
    const command = `${action}_sftp_transfer`;
    try {
      await nativeInvoke(command, { transferId: transfer.id });
      setTransferStatus(transfer.id, action === "pause" ? "paused" : action === "resume" ? "running" : "cancelled");
    } catch (operationError) {
      addToast("error", String(operationError));
    }
  };

  return (
    <aside className="w-[min(760px,80vw)] min-w-0 max-w-full h-full flex flex-col overflow-hidden bg-dock-sidebar border-s border-dock-border" aria-label={t("sftp.files")}>
      <div className="h-9 px-2 flex items-center gap-1 border-b border-dock-border flex-shrink-0">
        <Folder size={14} className="text-dock-accent" />
        <h2 className="text-xs font-semibold text-dock-text flex-1">{t("sftp.files")}</h2>
        <IconButton label={t("sftp.upload")} onClick={() => void upload()} icon={ArrowUpFromLine} disabled={localSelection.entry?.kind !== "file"} />
        <IconButton label={t("sftp.download")} onClick={() => void download()} icon={ArrowDownToLine} disabled={!localSelection.directoryPath || (transferProtocol === "sftp" ? !selected || selected.kind === "directory" : scpRemotePath === "/" || !scpRemotePath.startsWith("/"))} />
        <select value={transferProtocol} onChange={(event) => setTransferProtocol(event.target.value as TerminalTransferProtocol)} aria-label={t("sftp.transferProtocol")} className="h-6 bg-dock-bg border border-dock-border rounded text-[10px] text-dock-text px-1">
          <option value="sftp">SFTP</option>
          <option value="scp">SCP</option>
        </select>
        <IconButton label={t("sftp.close")} onClick={onClose} icon={X} />
      </div>

      {transferProtocol === "scp" && (
        <div className="p-2 border-b border-dock-border">
          <label className="block text-[10px] font-medium text-dock-text-muted mb-1" htmlFor={`scp-path-${tabId}`}>{t("sftp.scpRemoteFile")}</label>
          <input id={`scp-path-${tabId}`} value={scpRemotePath} onChange={(event) => setScpRemotePath(event.target.value)} dir="ltr" spellCheck={false} className="w-full h-7 px-2 rounded border border-dock-border bg-dock-bg text-[11px] font-mono text-dock-text focus:outline-none focus:border-dock-accent" />
          <p className="mt-1 text-[10px] text-dock-text-muted">{t("sftp.scpNotice")}</p>
        </div>
      )}
      <div className="flex-1 min-h-0 flex">
        <LocalFileBrowser onSelectionChange={setLocalSelection} />
        <section className="min-w-0 flex-1 flex flex-col" aria-label={t("sftp.remoteComputer")}>
          <div className="h-8 px-2 flex items-center gap-1 border-b border-dock-border flex-shrink-0">
            <Folder size={13} className="text-dock-accent" />
            <span className="flex-1 text-[11px] font-semibold text-dock-text">{t("sftp.remoteComputer")}</span>
            <IconButton label={t("sftp.refresh")} onClick={() => void loadDirectory(path)} icon={RefreshCw} />
          </div>
          <form className="p-2 flex gap-1 border-b border-dock-border" onSubmit={(event) => { event.preventDefault(); void loadDirectory(pathInput); }}>
            <IconButton label={t("sftp.parent")} onClick={() => void loadDirectory(parentRemotePath(path))} icon={ChevronUp} disabled={path === "/"} />
            <input value={pathInput} onChange={(event) => setPathInput(event.target.value)} dir="ltr" aria-label={t("sftp.remotePath")} className="min-w-0 flex-1 h-7 px-2 rounded border border-dock-border bg-dock-bg text-[11px] font-mono text-dock-text focus:outline-none focus:border-dock-accent" />
          </form>
          <div className="h-8 px-2 flex items-center gap-1 border-b border-dock-border flex-shrink-0">
            <IconButton label={t("sftp.newFolder")} onClick={() => setEditAction({ kind: "mkdir", value: "" })} icon={FolderPlus} />
            <IconButton label={t("sftp.rename")} onClick={() => selected && setEditAction({ kind: "rename", value: selected.name })} icon={Pencil} disabled={!selected} />
            <IconButton label={t("sftp.delete")} onClick={() => void remove()} icon={Trash2} disabled={!selected} danger />
            <select value={sortKey} onChange={(event) => setSortKey(event.target.value as SftpSortKey)} aria-label={t("sftp.sortBy")} className="ms-auto h-6 bg-dock-bg border border-dock-border rounded text-[10px] text-dock-text px-1">
              <option value="name">{t("sftp.name")}</option><option value="size">{t("sftp.size")}</option><option value="modified">{t("sftp.modified")}</option>
            </select>
          </div>
          {editAction && (
            <form className="p-2 flex gap-1 border-b border-dock-border" onSubmit={(event) => { event.preventDefault(); void submitEdit(); }}>
              <input autoFocus value={editAction.value} onChange={(event) => setEditAction({ ...editAction, value: event.target.value })} aria-label={editAction.kind === "mkdir" ? t("sftp.newFolder") : t("sftp.rename")} className="min-w-0 flex-1 h-7 px-2 rounded border border-dock-accent bg-dock-bg text-xs text-dock-text outline-none" />
              <button type="submit" disabled={!validEntryName(editAction.value)} className="px-2 text-xs rounded bg-dock-accent text-white disabled:opacity-40">{t("session.save")}</button>
              <IconButton label={t("session.cancel")} onClick={() => setEditAction(undefined)} icon={X} />
            </form>
          )}
          <div className="flex-1 min-h-0 overflow-auto" role="listbox" aria-label={t("sftp.remoteFiles")}>
            {loading && <div className="p-4 text-center text-xs text-dock-text-muted">{t("sftp.loading")}</div>}
            {!loading && error && <div className="p-3 text-xs text-red-400 break-words" role="alert">{error}</div>}
            {!loading && !error && sortedEntries.length === 0 && <div className="p-4 text-center text-xs text-dock-text-muted">{t("sftp.empty")}</div>}
            {!loading && !error && sortedEntries.map((entry) => (
              <button key={entry.path} type="button" role="option" aria-selected={selectedPath === entry.path} onClick={() => setSelectedPath(entry.path)} onDoubleClick={() => entry.kind === "directory" ? void loadDirectory(entry.path) : setSelectedPath(entry.path)} className={`w-full h-8 px-2 grid grid-cols-[18px_minmax(0,1fr)_70px] items-center gap-1 text-start border-b border-dock-border/40 hover:bg-dock-surface-hover focus:outline-none focus:bg-dock-surface-hover ${selectedPath === entry.path ? "bg-dock-surface" : ""}`}>
                {entry.kind === "directory" ? <Folder size={14} className="text-amber-400" /> : <File size={14} className="text-dock-text-muted" />}
                <span className="truncate text-[11px] text-dock-text" dir="auto" title={entry.name}>{entry.name}</span>
                <span className="text-[10px] text-dock-text-muted text-end tabular-nums">{entry.kind === "directory" ? "" : formatTransferSize(entry.size ?? 0)}</span>
              </button>
            ))}
          </div>
        </section>
      </div>

      {transfers.length > 0 && (
        <section className="max-h-[38%] overflow-auto border-t border-dock-border" aria-label={t("sftp.transfers")}>
          <div className="sticky top-0 h-7 px-2 flex items-center bg-dock-sidebar border-b border-dock-border text-[10px] font-semibold uppercase text-dock-text-muted">{t("sftp.transfers")}</div>
          {transfers.map((transfer) => {
            const percent = transfer.total > 0 ? Math.min(100, Math.round((transfer.transferred / transfer.total) * 100)) : 0;
            return (
              <div key={transfer.id} className="p-2 border-b border-dock-border/60">
                <div className="flex items-center gap-1">
                  {transfer.direction === "upload" ? <ArrowUpFromLine size={12} /> : <ArrowDownToLine size={12} />}
                  <span className="min-w-0 flex-1 truncate text-[11px] text-dock-text" title={transfer.name}>{transfer.name}</span>
                  <span className="text-[10px] text-dock-text-muted tabular-nums">{transfer.status === "completed" ? "100%" : `${percent}%`}</span>
                  {transfer.status === "running" && <IconButton label={t("sftp.pause")} onClick={() => void setTransferState(transfer, "pause")} icon={Pause} />}
                  {transfer.status === "paused" && <IconButton label={t("sftp.resume")} onClick={() => void setTransferState(transfer, "resume")} icon={Play} />}
                  {(transfer.status === "running" || transfer.status === "paused") && <IconButton label={t("sftp.cancel")} onClick={() => void setTransferState(transfer, "cancel")} icon={X} />}
                  {transfer.status === "failed" && transfer.request && <IconButton label={t("sftp.retry")} onClick={() => void startTransfer(transfer.request!)} icon={RotateCcw} />}
                </div>
                <div className="mt-1 h-1 bg-dock-border overflow-hidden"><div className={`h-full ${transfer.status === "failed" ? "bg-red-500" : transfer.status === "completed" ? "bg-emerald-500" : "bg-dock-accent"}`} style={{ width: `${transfer.status === "completed" ? 100 : percent}%` }} /></div>
                {transfer.error && <div className="mt-1 text-[10px] text-red-400 line-clamp-2" title={transfer.error}>{transfer.error}</div>}
              </div>
            );
          })}
        </section>
      )}
    </aside>
  );
}

function IconButton({ label, onClick, icon: Icon, disabled = false, danger = false }: { label: string; onClick: () => void; icon: typeof X; disabled?: boolean; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={label} aria-label={label} className={`p-1 rounded hover:bg-dock-surface-hover disabled:opacity-30 disabled:pointer-events-none ${danger ? "text-red-400" : "text-dock-text-muted hover:text-dock-text"}`}>
      <Icon size={13} />
    </button>
  );
}
