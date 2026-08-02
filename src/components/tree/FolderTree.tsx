import { useRef, useState, type MutableRefObject } from "react";
import {
  ChevronRight,
  ChevronDown,
  Folder as FolderIcon,
  FolderOpen,
  Trash2,
} from "lucide-react";
import type { Folder, Session } from "../../types";
import { canMoveFolder, getActiveFolderDrag, setActiveFolderDrag } from "../../utils/folderTree";

interface FolderTreeProps {
  folders: Folder[];
  sessions: Session[];
  selectedFolderId: string | null;
  onSelectFolder: (id: string) => void;
  onSelectSession: (session: Session) => void;
  onMoveSession?: (sessionId: string, folderId: string) => void;
  onMoveFolder?: (folderId: string, parentId?: string) => void;
  onDeleteFolder?: (folderId: string) => void;
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
}: FolderTreeProps) {
  const tree = buildTree(folders, sessions);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [rootDragOver, setRootDragOver] = useState(false);
  const draggedFolderIdRef = useRef<string | null>(null);
  const dropTargetFolderIdRef = useRef<string | null>(null);

  if (tree.length === 0) {
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
        />
      ))}
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
}: {
  node: TreeNode;
  depth: number;
  selectedFolderId: string | null;
  onSelectFolder: (id: string) => void;
  onSelectSession: (session: Session) => void;
  onMoveSession?: (sessionId: string, folderId: string) => void;
  onMoveFolder?: (folderId: string, parentId?: string) => void;
  onDeleteFolder?: (folderId: string) => void;
  canAcceptFolder: (folderId: string, targetId: string) => boolean;
  deleteConfirmId: string | null;
  setDeleteConfirmId: (id: string | null) => void;
  draggedFolderIdRef: MutableRefObject<string | null>;
  dropTargetFolderIdRef: MutableRefObject<string | null>;
  setRootDragOver: (active: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const [dragOver, setDragOver] = useState(false);
  const isSelected = selectedFolderId === node.folder.id;
  const hasChildren = node.children.length > 0 || node.sessions.length > 0;

  const handleDragOver = (e: React.DragEvent) => {
    const hasSession = e.dataTransfer.types.includes("application/sessiondock-session");
    const hasFolder = e.dataTransfer.types.includes("application/sessiondock-folder");
    const hasFolderFallback = e.dataTransfer.types.includes("text/plain") || Boolean(draggedFolderIdRef.current);
    if (hasSession || hasFolder || hasFolderFallback) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      dropTargetFolderIdRef.current = node.folder.id;
      setDragOver(true);
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
    if (data && onMoveSession) {
      const { id } = JSON.parse(data);
      onMoveSession(id, node.folder.id);
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
            />
          ))}
          {node.sessions.map((session) => (
            <button
              key={session.id}
              onClick={() => onSelectSession(session)}
              className="w-full flex items-center gap-1.5 px-2 py-1 rounded text-xs text-dock-text-muted hover:text-dock-text hover:bg-dock-surface transition-colors"
              style={{ paddingLeft: `${(depth + 1) * 12 + 8}px` }}
            >
              <ProtocolDot protocol={session.protocol} />
              <span className="truncate">{session.name}</span>
              <span className="ml-auto text-[10px] opacity-60">
                {session.host}
              </span>
            </button>
          ))}
        </>
      )}
    </div>
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
