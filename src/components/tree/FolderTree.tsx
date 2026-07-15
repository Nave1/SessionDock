import { useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  Folder as FolderIcon,
  FolderOpen,
} from "lucide-react";
import type { Folder, Session } from "../../types";

interface FolderTreeProps {
  folders: Folder[];
  sessions: Session[];
  selectedFolderId: string | null;
  onSelectFolder: (id: string) => void;
  onSelectSession: (session: Session) => void;
  onMoveSession?: (sessionId: string, folderId: string) => void;
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
}: FolderTreeProps) {
  const tree = buildTree(folders, sessions);

  if (tree.length === 0) {
    return null;
  }

  return (
    <div className="space-y-0.5">
      {tree.map((node) => (
        <TreeNodeItem
          key={node.folder.id}
          node={node}
          depth={0}
          selectedFolderId={selectedFolderId}
          onSelectFolder={onSelectFolder}
          onSelectSession={onSelectSession}
          onMoveSession={onMoveSession}
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
}: {
  node: TreeNode;
  depth: number;
  selectedFolderId: string | null;
  onSelectFolder: (id: string) => void;
  onSelectSession: (session: Session) => void;
  onMoveSession?: (sessionId: string, folderId: string) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const [dragOver, setDragOver] = useState(false);
  const isSelected = selectedFolderId === node.folder.id;
  const hasChildren = node.children.length > 0 || node.sessions.length > 0;

  const handleDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes("application/sessiondock-session")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDragOver(true);
    }
  };

  const handleDragLeave = () => setDragOver(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const data = e.dataTransfer.getData("application/sessiondock-session");
    if (data && onMoveSession) {
      const { id } = JSON.parse(data);
      onMoveSession(id, node.folder.id);
    }
  };

  return (
    <div>
      <button
        onClick={() => {
          onSelectFolder(node.folder.id);
          if (hasChildren) setExpanded(!expanded);
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`w-full flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors ${
          dragOver
            ? "bg-dock-accent/25 text-dock-accent ring-1 ring-dock-accent"
            : isSelected
              ? "bg-dock-accent/15 text-dock-accent"
              : "text-dock-text-muted hover:text-dock-text hover:bg-dock-surface"
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
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
          <span className="ml-auto text-[10px] text-dock-text-muted">
            {node.sessions.length}
          </span>
        )}
      </button>

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
