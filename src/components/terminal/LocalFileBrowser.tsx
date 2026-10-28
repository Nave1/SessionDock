import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { ChevronUp, File, Folder, FolderPlus, HardDrive, Pencil, RefreshCw, Trash2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { nativeInvoke } from "../../api/native";
import { useFileBrowserStore } from "../../stores/fileBrowserStore";
import { useToastStore } from "../../stores/toastStore";
import { clearFileDragPayload, hasFileDragType, LOCAL_FILE_DRAG_TYPE, readFileDragPayload, REMOTE_FILE_DRAG_TYPE, setFileDragPayload, type FileDragPayload } from "../../utils/fileDrag";
import { formatTransferSize } from "../../utils/sftp";

export interface LocalEntry {
  name: string;
  path: string;
  kind: "drive" | "directory" | "file" | "symlink";
  size?: number;
  modifiedAt?: number;
}

interface LocalDirectoryListing {
  path?: string;
  parentPath?: string;
  entries: LocalEntry[];
}

export interface LocalFileSelection {
  directoryPath?: string;
  entry?: LocalEntry;
}

interface LocalFileBrowserProps {
  onSelectionChange: (selection: LocalFileSelection) => void;
  onRemoteFileDrop?: (file: FileDragPayload, destinationDirectory: string) => void;
}

interface EditAction {
  kind: "mkdir" | "rename";
  value: string;
}

function validEntryName(name: string): boolean {
  return name.length > 0 && name !== "." && name !== ".." && !name.includes("/") && !name.includes("\\") && !name.includes("\0");
}

export function LocalFileBrowser({ onSelectionChange, onRemoteFileDrop }: LocalFileBrowserProps) {
  const { t } = useTranslation();
  const addToast = useToastStore((state) => state.addToast);
  const setLastLocalDirectory = useFileBrowserStore((state) => state.setLastLocalDirectory);
  const initialDirectory = useRef(useFileBrowserStore.getState().lastLocalDirectory).current;
  const dropDepth = useRef(0);
  const [listing, setListing] = useState<LocalDirectoryListing>({ entries: [] });
  const [pathInput, setPathInput] = useState("");
  const [selectedPath, setSelectedPath] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [editAction, setEditAction] = useState<EditAction>();
  const [dropActive, setDropActive] = useState(false);
  const selected = listing.entries.find((entry) => entry.path === selectedPath);

  const loadDirectory = useCallback(async (path?: string): Promise<boolean> => {
    setLoading(true);
    setError(undefined);
    try {
      const result = await nativeInvoke<LocalDirectoryListing>("list_local_directory", { path: path || null });
      setListing(result);
      setPathInput(result.path ?? "");
      setSelectedPath(undefined);
      setLastLocalDirectory(result.path);
      onSelectionChange({ directoryPath: result.path });
      return true;
    } catch (loadError) {
      setError(String(loadError));
      return false;
    } finally {
      setLoading(false);
    }
  }, [onSelectionChange, setLastLocalDirectory]);

  useEffect(() => {
    void (async () => {
      if (!await loadDirectory(initialDirectory) && initialDirectory) {
        setLastLocalDirectory(undefined);
        await loadDirectory();
      }
    })();
  }, [initialDirectory, loadDirectory, setLastLocalDirectory]);

  const selectEntry = (entry: LocalEntry) => {
    setSelectedPath(entry.path);
    onSelectionChange({ directoryPath: listing.path, entry });
  };

  const submitEdit = async () => {
    if (!editAction || !validEntryName(editAction.value)) return;
    try {
      if (editAction.kind === "mkdir" && listing.path) {
        await nativeInvoke("create_local_directory", { path: listing.path, name: editAction.value });
      } else if (editAction.kind === "rename" && selected) {
        await nativeInvoke("rename_local_entry", { path: selected.path, name: editAction.value });
      }
      setEditAction(undefined);
      await loadDirectory(listing.path);
    } catch (operationError) {
      addToast("error", String(operationError));
    }
  };

  const remove = async () => {
    if (!selected || selected.kind === "drive" || selected.kind === "symlink") return;
    if (!window.confirm(t("sftp.confirmDeleteLocal", { name: selected.name }))) return;
    try {
      await nativeInvoke("delete_local_entry", { path: selected.path });
      await loadDirectory(listing.path);
    } catch (operationError) {
      addToast("error", String(operationError));
    }
  };

  const acceptRemoteFileDrag = (event: DragEvent<HTMLElement>) => {
    if (!listing.path || !onRemoteFileDrop || !hasFileDragType(event.dataTransfer, REMOTE_FILE_DRAG_TYPE)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDropActive(true);
  };

  const dropRemoteFile = (event: DragEvent<HTMLElement>, destinationDirectory: string) => {
    event.preventDefault();
    const file = readFileDragPayload(event.dataTransfer, REMOTE_FILE_DRAG_TYPE);
    clearFileDragPayload();
    if (file) onRemoteFileDrop?.(file, destinationDirectory);
  };

  return (
    <section className="min-w-0 flex-1 flex flex-col border-e border-dock-border" aria-label={t("sftp.localComputer")}>
      <div className="h-8 px-2 flex items-center gap-1 border-b border-dock-border flex-shrink-0">
        <HardDrive size={13} className="text-dock-accent" />
        <span className="flex-1 text-[11px] font-semibold text-dock-text">{t("sftp.localComputer")}</span>
        <PaneButton label={t("sftp.refresh")} onClick={() => void loadDirectory(listing.path)} icon={RefreshCw} />
      </div>
      <form className="p-2 flex gap-1 border-b border-dock-border" onSubmit={(event) => { event.preventDefault(); void loadDirectory(pathInput || undefined); }}>
        <PaneButton label={t("sftp.parent")} onClick={() => void loadDirectory(listing.parentPath)} icon={ChevronUp} disabled={!listing.path} />
        <input value={pathInput} onChange={(event) => setPathInput(event.target.value)} dir="ltr" aria-label={t("sftp.localPath")} placeholder={t("sftp.thisPc")} className="min-w-0 flex-1 h-7 px-2 rounded border border-dock-border bg-dock-bg text-[11px] font-mono text-dock-text focus:outline-none focus:border-dock-accent" />
      </form>
      <div className="h-8 px-2 flex items-center gap-1 border-b border-dock-border flex-shrink-0">
        <PaneButton label={t("sftp.newFolder")} onClick={() => setEditAction({ kind: "mkdir", value: "" })} icon={FolderPlus} disabled={!listing.path} />
        <PaneButton label={t("sftp.rename")} onClick={() => selected && setEditAction({ kind: "rename", value: selected.name })} icon={Pencil} disabled={!selected || selected.kind === "drive"} />
        <PaneButton label={t("sftp.delete")} onClick={() => void remove()} icon={Trash2} disabled={!selected || selected.kind === "drive" || selected.kind === "symlink"} danger />
      </div>
      {editAction && (
        <form className="p-2 flex gap-1 border-b border-dock-border" onSubmit={(event) => { event.preventDefault(); void submitEdit(); }}>
          <input autoFocus value={editAction.value} onChange={(event) => setEditAction({ ...editAction, value: event.target.value })} aria-label={editAction.kind === "mkdir" ? t("sftp.newFolder") : t("sftp.rename")} className="min-w-0 flex-1 h-7 px-2 rounded border border-dock-accent bg-dock-bg text-xs text-dock-text outline-none" />
          <button type="submit" disabled={!validEntryName(editAction.value)} className="px-2 text-xs rounded bg-dock-accent text-white disabled:opacity-40">{t("session.save")}</button>
          <PaneButton label={t("session.cancel")} onClick={() => setEditAction(undefined)} icon={X} />
        </form>
      )}
      <div
        className={`relative flex-1 min-h-0 overflow-auto ${dropActive ? "bg-dock-accent-subtle outline outline-1 -outline-offset-1 outline-dock-accent" : ""}`}
        role="listbox"
        aria-label={t("sftp.localFiles")}
        onDragEnter={(event) => {
          if (!listing.path || !onRemoteFileDrop) return;
          acceptRemoteFileDrag(event);
          dropDepth.current += 1;
        }}
        onDragOver={acceptRemoteFileDrag}
        onDragLeave={() => {
          dropDepth.current = Math.max(0, dropDepth.current - 1);
          if (dropDepth.current === 0) setDropActive(false);
        }}
        onDrop={(event) => {
          dropDepth.current = 0;
          setDropActive(false);
          if (!listing.path || !onRemoteFileDrop) return;
          dropRemoteFile(event, listing.path);
        }}
      >
        {dropActive && <div className="pointer-events-none sticky top-0 z-10 bg-dock-accent px-2 py-1 text-center text-[10px] font-medium text-white">{t("sftp.dropToDownload")}</div>}
        {loading && <div className="p-4 text-center text-xs text-dock-text-muted">{t("sftp.loadingLocal")}</div>}
        {!loading && error && <div className="p-3 text-xs text-red-400 break-words" role="alert">{error}</div>}
        {!loading && !error && listing.entries.length === 0 && <div className="p-4 text-center text-xs text-dock-text-muted">{t("sftp.empty")}</div>}
        {!loading && !error && listing.entries.map((entry) => (
          <button key={entry.path} type="button" role="option" aria-selected={selectedPath === entry.path} draggable={entry.kind === "file"} onDragStart={(event) => {
            if (entry.kind === "file") setFileDragPayload(event.dataTransfer, LOCAL_FILE_DRAG_TYPE, { name: entry.name, path: entry.path });
          }} onDragEnd={clearFileDragPayload} onDragEnter={(event) => {
            if (entry.kind !== "directory") return;
            event.stopPropagation();
            acceptRemoteFileDrag(event);
            dropDepth.current += 1;
          }} onDragOver={(event) => {
            if (entry.kind !== "directory") return;
            event.stopPropagation();
            acceptRemoteFileDrag(event);
          }} onDragLeave={(event) => {
            if (entry.kind !== "directory") return;
            event.stopPropagation();
            dropDepth.current = Math.max(0, dropDepth.current - 1);
            if (dropDepth.current === 0) setDropActive(false);
          }} onDrop={(event) => {
            if (entry.kind !== "directory") return;
            event.stopPropagation();
            dropDepth.current = 0;
            setDropActive(false);
            dropRemoteFile(event, entry.path);
          }} onClick={() => selectEntry(entry)} onDoubleClick={() => {
            if (entry.kind === "drive" || entry.kind === "directory") void loadDirectory(entry.path);
          }} className={`w-full h-8 px-2 grid grid-cols-[18px_minmax(0,1fr)_62px] items-center gap-1 text-start border-b border-dock-border/40 hover:bg-dock-surface-hover focus:outline-none focus:bg-dock-surface-hover ${selectedPath === entry.path ? "bg-dock-surface" : ""}`}>
            {entry.kind === "drive" ? <HardDrive size={14} className="text-dock-accent" /> : entry.kind === "directory" ? <Folder size={14} className="text-amber-400" /> : <File size={14} className={entry.kind === "symlink" ? "text-dock-warning" : "text-dock-text-muted"} />}
            <span className="truncate text-[11px] text-dock-text" dir="auto" title={entry.name}>{entry.name}</span>
            <span className="text-[10px] text-dock-text-muted text-end tabular-nums">{entry.kind === "file" ? formatTransferSize(entry.size ?? 0) : ""}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function PaneButton({ label, onClick, icon: Icon, disabled = false, danger = false }: { label: string; onClick: () => void; icon: typeof X; disabled?: boolean; danger?: boolean }) {
  return <button type="button" onClick={onClick} disabled={disabled} title={label} aria-label={label} className={`p-1 rounded hover:bg-dock-surface-hover disabled:opacity-30 disabled:pointer-events-none ${danger ? "text-red-400" : "text-dock-text-muted hover:text-dock-text"}`}><Icon size={13} /></button>;
}