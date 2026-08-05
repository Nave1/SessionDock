import { useEffect, useRef, useState, type MutableRefObject } from "react";
import {
  ChevronRight,
  ChevronDown,
  Download,
  FilePlus2,
  Folder as FolderIcon,
  FolderPlus,
  FolderOpen,
  Pencil,
  Trash2,
} from "lucide-react";
import type { Folder, Session } from "../../types";
import { beginSessionPointerDrag, canMoveFolder, getActiveFolderDrag, getActiveSessionDrag, setActiveFolderDrag, setActiveSessionDrag, shouldSuppressSessionClick } from "../../utils/folderTree";

interface FolderTreeProps {
  folders: Folder[];
  sessions: Session[];
  selectedFolderId: string | null;
  onSelectFolder: (id: string) => void;
  onSelectSession: (session: Session) => void;
  onMoveSession?: (sessionId: string, folderId?: string) => void;
  onMoveFolder?: (folderId: string, parentId?: string) => void;
  onDeleteFolder?: (folderId: string) => void;
  onCreateSessionInFolder?: (folderId: string) => void;
  onCreateFolderInFolder?: (folderId: string) => void;
  onRenameFolder?: (folder: Folder) => void;
  onExportFolder?: (folderId: string, format: "json" | "csv") => void;
  onEditSession?: (session: Session) => void;
}

interface TreeNode {
  folder: Folder;
  children: TreeNode[];
  sessions: Session[];
}

function buildTree(folders: Folder[], sessions: Session[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  // Create nodes
  for (const folder of folders) {
    map.set(folder.id, { folder, children: [], sessions: [] });
  }

  // Assign sessions to folders
  for (const session of sessions) {
    if (session.folder_id) {
      const node = map.get(session.folder_id);
      if (node) node.sessions.push(session);
    }
  }

  // Build hierarchy
  for (const folder of folders) {
    const node = map.get(folder.id)!;
    if (folder.parent_id) {
      const parent = map.get(folder.parent_id);
      if (parent) {
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    } else {
      roots.push(node);
    }
  }

  return roots;
}

export function FolderTree({
  folders,
  sessions,
  selectedFolderId,
  onSelectFolder,
  onSelectSession,
  onMoveSession,
  onMoveFolder,
  onDeleteFolder,
  onCreateSessionInFolder,
  onCreateFolderInFolder,
  onRenameFolder,
  onExportFolder,
  onEditSession,
}: FolderTreeProps) {
  const tree = buildTree(folders, sessions);
  const unfiledSessions = sessions.filter((session) => !session.folder_id);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [rootDragOver, setRootDragOver] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ folder: Folder; x: number; y: number } | null>(null);
  const [sessionContextMenu, setSessionContextMenu] = useState<{ session: Session; x: number; y: number } | null>(null);
  const [unfiledDragOver, setUnfiledDragOver] = useState(false);
  const draggedFolderIdRef = useRef<string | null>(null);
  const dropTargetFolderIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!contextMenu && !sessionContextMenu) return;
    const close = () => {
      setContextMenu(null);
      setSessionContextMenu(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("click", close);
    window.addEventListener("blur", close);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("blur", close);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [contextMenu, sessionContextMenu]);

  useEffect(() => {
    const handleSessionMove = (event: Event) => {
      const { sessionId, folderId } = (event as CustomEvent<{ sessionId: string; folderId?: string }>).detail;
      onMoveSession?.(sessionId, folderId);
    };
    window.addEventListener("sessiondock:move-session", handleSessionMove);
    return () => window.removeEventListener("sessiondock:move-session", handleSessionMove);
  }, [onMoveSession]);

  if (tree.length === 0 && unfiledSessions.length === 0) {
    return null;
  }

  return (
    <div className="space-y-0.5">
      <div
        data-folder-root
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          dropTargetFolderIdRef.current = "__root__";
          setRootDragOver(true);
          const folderId = draggedFolderIdRef.current || getActiveFolderDrag();
          if (folderId) {
            onMoveFolder?.(folderId, undefined);
            draggedFolderIdRef.current = null;
            setActiveFolderDrag(null);
            dropTargetFolderIdRef.current = null;
          }
        }}
        onDragLeave={(e) => {
          if (e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) return;
          if (dropTargetFolderIdRef.current === "__root__") dropTargetFolderIdRef.current = null;
          setRootDragOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          const folderId = draggedFolderIdRef.current || getActiveFolderDrag();
          if (folderId) onMoveFolder?.(folderId, undefined);
          draggedFolderIdRef.current = null;
          setActiveFolderDrag(null);
          dropTargetFolderIdRef.current = null;
          setRootDragOver(false);
        }}
        className={`mx-1 mb-1 flex items-center justify-center gap-1.5 rounded border border-dashed px-2 py-1.5 text-[11px] ${
          rootDragOver
            ? "border-dock-accent bg-dock-accent/20 text-dock-accent"
            : "border-dock-border/70 text-dock-text-muted"
        }`}
      >
        <FolderIcon size={12} />
        Top level
      </div>
      {tree.map((node) => (
        <TreeNodeItem
          key={node.folder.id}
          node={node}
          depth={0}
          selectedFolderId={selectedFolderId}
          onSelectFolder={onSelectFolder}
          onSelectSession={onSelectSession}
          onMoveSession={onMoveSession}
          onMoveFolder={onMoveFolder}
          onDeleteFolder={onDeleteFolder}
          canAcceptFolder={(folderId, targetId) => canMoveFolder(folders, folderId, targetId)}
          deleteConfirmId={deleteConfirmId}
          setDeleteConfirmId={setDeleteConfirmId}
          draggedFolderIdRef={draggedFolderIdRef}
          dropTargetFolderIdRef={dropTargetFolderIdRef}
          setRootDragOver={setRootDragOver}
          onOpenContextMenu={(folder, x, y) => {
            setSessionContextMenu(null);
            setContextMenu({ folder, x, y });
          }}
          onOpenSessionContextMenu={(session, x, y) => {
            setContextMenu(null);
            setSessionContextMenu({ session, x, y });
          }}
        />
      ))}
      <div
        data-session-unfiled
        className={`mt-2 min-h-8 border-t pt-1 ${unfiledDragOver ? "border-dock-accent bg-dock-accent/10" : "border-dock-border"}`}
          onDragOver={(event) => {
            if (!getActiveSessionDrag() && !event.dataTransfer.types.includes("application/sessiondock-session")) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            setUnfiledDragOver(true);
            const sessionId = getActiveSessionDrag();
            if (sessionId) {
              onMoveSession?.(sessionId, undefined);
              setActiveSessionDrag(null);
            }
          }}
          onDragLeave={(event) => {
            if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
            setUnfiledDragOver(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            const payload = event.dataTransfer.getData("application/sessiondock-session");
            const sessionId = getActiveSessionDrag() || (payload ? JSON.parse(payload).id : null);
            if (sessionId) onMoveSession?.(sessionId, undefined);
            setActiveSessionDrag(null);
            setUnfiledDragOver(false);
          }}
      >
        <div className="px-2 py-1 text-[10px] font-medium uppercase text-dock-text-muted">
          Unfiled · Drop here {unfiledSessions.length > 0 && `(${unfiledSessions.length})`}
        </div>
        {unfiledSessions.map((session) => (
          <SessionTreeItem key={session.id} session={session} onSelectSession={onSelectSession} onOpenContextMenu={(selected, x, y) => setSessionContextMenu({ session: selected, x, y })} depth={0} />
        ))}
      </div>
      {contextMenu && (
        <div
          role="menu"
          className="fixed z-[70] min-w-44 rounded-md border border-dock-border bg-dock-sidebar py-1 shadow-2xl"
          style={{ left: Math.min(contextMenu.x, window.innerWidth - 190), top: Math.min(contextMenu.y, window.innerHeight - 190) }}
          onClick={(event) => event.stopPropagation()}
        >
          <ContextMenuButton icon={FilePlus2} label="New session" onClick={() => {
            onCreateSessionInFolder?.(contextMenu.folder.id);
            setContextMenu(null);
          }} />
          <ContextMenuButton icon={FolderPlus} label="New folder" onClick={() => {
            onCreateFolderInFolder?.(contextMenu.folder.id);
            setContextMenu(null);
          }} />
          <ContextMenuButton icon={Pencil} label="Rename folder" onClick={() => {
            onRenameFolder?.(contextMenu.folder);
            setContextMenu(null);
          }} />
          <div className="my-1 border-t border-dock-border" />
          <ContextMenuButton icon={Download} label="Export as JSON" onClick={() => {
            onExportFolder?.(contextMenu.folder.id, "json");
            setContextMenu(null);
          }} />
          <ContextMenuButton icon={Download} label="Export as CSV" onClick={() => {
            onExportFolder?.(contextMenu.folder.id, "csv");
            setContextMenu(null);
          }} />
          <div className="my-1 border-t border-dock-border" />
          <ContextMenuButton icon={Trash2} label="Delete folder" danger onClick={() => {
            setDeleteConfirmId(contextMenu.folder.id);
            setContextMenu(null);
          }} />
        </div>
      )}
      {sessionContextMenu && (
        <div
          role="menu"
          className="fixed z-[70] min-w-44 rounded-md border border-dock-border bg-dock-sidebar py-1 shadow-2xl"
          style={{ left: Math.min(sessionContextMenu.x, window.innerWidth - 190), top: Math.min(sessionContextMenu.y, window.innerHeight - 80) }}
          onClick={(event) => event.stopPropagation()}
        >
          <ContextMenuButton icon={Pencil} label="Edit session" onClick={() => {
            onEditSession?.(sessionContextMenu.session);
            setSessionContextMenu(null);
          }} />
        </div>
      )}
    </div>
  );
}

function TreeNodeItem({
  node,
  depth,
  selectedFolderId,
  onSelectFolder,
  onSelectSession,
  onMoveSession,
  onMoveFolder,
  onDeleteFolder,
  canAcceptFolder,
  deleteConfirmId,
  setDeleteConfirmId,
  draggedFolderIdRef,
  dropTargetFolderIdRef,
  setRootDragOver,
  onOpenContextMenu,
  onOpenSessionContextMenu,
}: {
  node: TreeNode;
  depth: number;
  selectedFolderId: string | null;
  onSelectFolder: (id: string) => void;
  onSelectSession: (session: Session) => void;
  onMoveSession?: (sessionId: string, folderId?: string) => void;
  onMoveFolder?: (folderId: string, parentId?: string) => void;
  onDeleteFolder?: (folderId: string) => void;
  canAcceptFolder: (folderId: string, targetId: string) => boolean;
  deleteConfirmId: string | null;
  setDeleteConfirmId: (id: string | null) => void;
  draggedFolderIdRef: MutableRefObject<string | null>;
  dropTargetFolderIdRef: MutableRefObject<string | null>;
  setRootDragOver: (active: boolean) => void;
  onOpenContextMenu: (folder: Folder, x: number, y: number) => void;
  onOpenSessionContextMenu: (session: Session, x: number, y: number) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const [dragOver, setDragOver] = useState(false);
  const isSelected = selectedFolderId === node.folder.id;
  const hasChildren = node.children.length > 0 || node.sessions.length > 0;

  const handleDragOver = (e: React.DragEvent) => {
    const hasSession = e.dataTransfer.types.includes("application/sessiondock-session") || Boolean(getActiveSessionDrag());
    const hasFolder = e.dataTransfer.types.includes("application/sessiondock-folder");
    const hasFolderFallback = e.dataTransfer.types.includes("text/plain") || Boolean(draggedFolderIdRef.current);
    if (hasSession || hasFolder || hasFolderFallback) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      dropTargetFolderIdRef.current = node.folder.id;
      setDragOver(true);
      const sessionId = getActiveSessionDrag();
      if (sessionId) {
        onMoveSession?.(sessionId, node.folder.id);
        setActiveSessionDrag(null);
        setExpanded(true);
      }
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) return;
    if (dropTargetFolderIdRef.current === node.folder.id) dropTargetFolderIdRef.current = null;
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const data = e.dataTransfer.getData("application/sessiondock-session");
    const sessionId = getActiveSessionDrag() || (data ? JSON.parse(data).id : null);
    if (sessionId && onMoveSession) {
      onMoveSession(sessionId, node.folder.id);
      setActiveSessionDrag(null);
      setExpanded(true);
      return;
    }

    const folderData = e.dataTransfer.getData("application/sessiondock-folder");
    const fallbackData = e.dataTransfer.getData("text/plain");
    const draggedFolderId = draggedFolderIdRef.current
      || (folderData ? JSON.parse(folderData).id : undefined)
      || (fallbackData.startsWith("sessiondock-folder:") ? fallbackData.slice("sessiondock-folder:".length) : undefined);
    if (draggedFolderId && onMoveFolder) {
      const id = draggedFolderId;
      if (canAcceptFolder(id, node.folder.id)) {
        onMoveFolder(id, node.folder.id);
        setExpanded(true);
      }
    }
    draggedFolderIdRef.current = null;
    dropTargetFolderIdRef.current = null;
  };

  const handleFolderDragStart = (e: React.DragEvent) => {
    draggedFolderIdRef.current = node.folder.id;
    setActiveFolderDrag(node.folder.id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("application/sessiondock-folder", JSON.stringify({ id: node.folder.id }));
    e.dataTransfer.setData("text/plain", `sessiondock-folder:${node.folder.id}`);
  };

  const handleFolderDragEnd = (e: React.DragEvent) => {
    const rootAtPointer = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-folder-root]");
    const elementAtPointer = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-folder-id]");
    const targetId = elementAtPointer?.dataset.folderId || dropTargetFolderIdRef.current;
    const folderId = draggedFolderIdRef.current || getActiveFolderDrag();

    if (folderId && (rootAtPointer || targetId === "__root__") && onMoveFolder) {
      onMoveFolder(folderId, undefined);
    } else if (folderId && targetId && onMoveFolder && canAcceptFolder(folderId, targetId)) {
      onMoveFolder(folderId, targetId);
    }
    draggedFolderIdRef.current = null;
    setActiveFolderDrag(null);
    dropTargetFolderIdRef.current = null;
    setDragOver(false);
    setRootDragOver(false);
  };

  return (
    <div>
      <div
        data-folder-id={node.folder.id}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onOpenContextMenu(node.folder, event.clientX, event.clientY);
        }}
        className={`group w-full flex items-center rounded text-xs transition-colors ${
          dragOver
            ? "bg-dock-accent/25 text-dock-accent ring-1 ring-dock-accent"
            : isSelected
              ? "bg-dock-accent/15 text-dock-accent"
              : "text-dock-text-muted hover:text-dock-text hover:bg-dock-surface"
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        <button
          draggable
          onDragStart={handleFolderDragStart}
          onDragEnd={handleFolderDragEnd}
          onClick={() => {
            onSelectFolder(node.folder.id);
            if (hasChildren) setExpanded(!expanded);
          }}
          className="flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left cursor-grab active:cursor-grabbing"
        >
          {hasChildren ? (
            expanded ? (
              <ChevronDown size={12} />
            ) : (
              <ChevronRight size={12} />
            )
          ) : (
            <span className="w-3" />
          )}
          {expanded ? (
            <FolderOpen size={13} className="text-dock-warning" />
          ) : (
            <FolderIcon size={13} className="text-dock-text-muted" />
          )}
          <span className="truncate">{node.folder.name}</span>
          {node.sessions.length > 0 && (
            <span className="ml-auto text-[10px] text-dock-text-muted">{node.sessions.length}</span>
          )}
        </button>
        {onDeleteFolder && (
          <button
            onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(node.folder.id); }}
            className="p-1 mr-1 opacity-0 group-hover:opacity-100 text-dock-text-muted hover:text-red-400"
            title={`Delete ${node.folder.name}`}
            aria-label={`Delete ${node.folder.name}`}
          >
            <Trash2 size={11} />
          </button>
        )}
      </div>

      {deleteConfirmId === node.folder.id && (
        <div className="mx-2 my-1 p-2 rounded border border-dock-error/30 bg-dock-error/10 text-[11px] text-dock-text">
          <p>Delete “{node.folder.name}”? Its contents will move to the parent folder.</p>
          <div className="flex justify-end gap-2 mt-2">
            <button onClick={() => setDeleteConfirmId(null)} className="px-2 py-1 text-dock-text-muted hover:text-dock-text">Cancel</button>
            <button
              onClick={() => { onDeleteFolder?.(node.folder.id); setDeleteConfirmId(null); }}
              className="px-2 py-1 rounded bg-dock-error text-white"
            >
              Delete
            </button>
          </div>
        </div>
      )}

      {expanded && (
        <>
          {node.children.map((child) => (
            <TreeNodeItem
              key={child.folder.id}
              node={child}
              depth={depth + 1}
              selectedFolderId={selectedFolderId}
              onSelectFolder={onSelectFolder}
              onSelectSession={onSelectSession}
              onMoveSession={onMoveSession}
              onMoveFolder={onMoveFolder}
              onDeleteFolder={onDeleteFolder}
              canAcceptFolder={canAcceptFolder}
              deleteConfirmId={deleteConfirmId}
              setDeleteConfirmId={setDeleteConfirmId}
              draggedFolderIdRef={draggedFolderIdRef}
              dropTargetFolderIdRef={dropTargetFolderIdRef}
              setRootDragOver={setRootDragOver}
              onOpenContextMenu={onOpenContextMenu}
              onOpenSessionContextMenu={onOpenSessionContextMenu}
            />
          ))}
          {node.sessions.map((session) => (
            <SessionTreeItem key={session.id} session={session} onSelectSession={onSelectSession} onOpenContextMenu={onOpenSessionContextMenu} depth={depth + 1} />
          ))}
        </>
      )}
    </div>
  );
}

function ContextMenuButton({ icon: Icon, label, onClick, danger = false }: {
  icon: typeof FolderIcon;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs ${
        danger ? "text-dock-error hover:bg-dock-error/10" : "text-dock-text-muted hover:bg-dock-surface hover:text-dock-text"
      }`}
    >
      <Icon size={13} />
      <span>{label}</span>
    </button>
  );
}

function SessionTreeItem({ session, onSelectSession, onOpenContextMenu, depth }: {
  session: Session;
  onSelectSession: (session: Session) => void;
  onOpenContextMenu: (session: Session, x: number, y: number) => void;
  depth: number;
}) {
  return (
    <button
      onPointerDown={(event) => beginSessionPointerDrag(event.nativeEvent, session.id)}
      onClick={() => { if (!shouldSuppressSessionClick()) onSelectSession(session); }}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onOpenContextMenu(session, event.clientX, event.clientY);
      }}
      className="w-full flex items-center gap-1.5 px-2 py-1 rounded text-xs text-dock-text-muted hover:text-dock-text hover:bg-dock-surface transition-colors cursor-grab active:cursor-grabbing"
      style={{ paddingLeft: `${depth * 12 + 8}px` }}
    >
      <ProtocolDot protocol={session.protocol} />
      <span className="truncate">{session.name}</span>
      <span className="ml-auto text-[10px] opacity-60">{session.host}</span>
    </button>
  );
}

function ProtocolDot({ protocol }: { protocol: string }) {
  const colors = {
    ssh: "bg-dock-success",
    telnet: "bg-dock-warning",
    serial: "bg-dock-accent",
  };
  return (
    <div
      className={`w-1.5 h-1.5 rounded-full ${colors[protocol as keyof typeof colors] || "bg-dock-text-muted"}`}
    />
  );
}
