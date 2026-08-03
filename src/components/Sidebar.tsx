import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore, ViewMode } from "../stores/appStore";
import { useSessionStore } from "../stores/sessionStore";
import { FolderTree } from "./tree/FolderTree";
import { getActiveFolderDrag, setActiveFolderDrag } from "../utils/folderTree";
import { deleteFolder, updateFolder, updateSession } from "../api/commands";
import { useToastStore } from "../stores/toastStore";
import { createCsvExport, createSafeExport, saveTextFile } from "../utils/importExport";
import {
  Home,
  List,
  Star,
  Clock,
  Settings,
  Plus,
  FolderPlus,
  Search,
  Zap,
} from "lucide-react";

interface SidebarProps {
  width: number;
  onNewSession: (folderId?: string) => void;
  onNewFolder: (parentId?: string) => void;
  onQuickConnect: () => void;
}

export function Sidebar({ width, onNewSession, onNewFolder, onQuickConnect }: SidebarProps) {
  const { t } = useTranslation();
  const { currentView, setCurrentView, selectedFolderId, setSelectedFolderId, addTab } = useAppStore();
  const { folders, sessions, moveFolder, deleteFolderPreservingContents } = useSessionStore();
  const addToast = useToastStore((state) => state.addToast);
  const [rootDragOver, setRootDragOver] = useState(false);

  const handleMoveFolder = async (folderId: string, parentId?: string) => {
    try {
      await updateFolder(folderId, undefined, parentId, undefined, !parentId);
      moveFolder(folderId, parentId);
    } catch (error) {
      addToast("error", `Failed to move folder: ${String(error)}`);
    }
  };

  const handleExportFolder = async (folderId: string, format: "json" | "csv") => {
    const includedIds = new Set([folderId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const folder of folders) {
        if (folder.parent_id && includedIds.has(folder.parent_id) && !includedIds.has(folder.id)) {
          includedIds.add(folder.id);
          changed = true;
        }
      }
    }

    const includedFolders = folders.filter((folder) => includedIds.has(folder.id));
    const includedSessions = sessions.filter((session) => session.folder_id && includedIds.has(session.folder_id));
    const rootName = folders.find((folder) => folder.id === folderId)?.name || "folder";
    const filename = rootName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "folder";
    if (format === "json") {
      await saveTextFile(
        JSON.stringify(createSafeExport(includedSessions, includedFolders, new Map()), null, 2),
        `${filename}.json`,
        "JSON",
        ["json"],
      );
    } else {
      await saveTextFile(createCsvExport(includedSessions), `${filename}.csv`, "CSV", ["csv"]);
    }
    addToast("success", `Exported ${includedSessions.length} sessions from ${rootName}`);
  };

  const navItems: { view: ViewMode; icon: typeof Home; label: string }[] = [
    { view: "home", icon: Home, label: t("sidebar.home") },
    { view: "favorites", icon: Star, label: t("sidebar.favorites") },
    { view: "recent", icon: Clock, label: t("sidebar.recent") },
    { view: "allSessions", icon: List, label: t("sidebar.allSessions") },
  ];

  return (
    <aside
      className="flex flex-col h-full bg-dock-sidebar border-r border-dock-border"
      style={{ width: `${width}px`, minWidth: `${width}px` }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 h-12 border-b border-dock-border flex-shrink-0">
        <div className="w-5 h-5 rounded bg-dock-accent flex items-center justify-center">
          <span className="text-[10px] font-bold text-white">S</span>
        </div>
        <span className="text-[13px] font-semibold text-dock-text tracking-tight">
          SessionDock
        </span>
      </div>

      {/* Search trigger */}
      <div className="px-3 pt-3 pb-1">
        <button
          onClick={() => useAppStore.getState().setCommandPaletteOpen(true)}
          className="w-full flex items-center gap-2 px-2.5 py-[7px] rounded-md bg-dock-bg border border-dock-border text-dock-text-muted text-[12px] hover:border-dock-text-muted/30"
        >
          <Search size={12} />
          <span className="flex-1 text-left">{t("sidebar.search")}</span>
          <kbd className="text-[10px] px-1 py-0.5 rounded bg-dock-border/60 text-dock-text-muted font-mono">⌘K</kbd>
        </button>
      </div>

      {/* Actions */}
      <div className="flex gap-1 px-3 py-2">
        <button
          onClick={onQuickConnect}
          className="flex items-center justify-center gap-1.5 px-2.5 py-[6px] rounded-md text-[11px] font-medium bg-dock-accent/10 text-dock-accent hover:bg-dock-accent/15"
          title="Quick Connect"
        >
          <Zap size={11} />
          <span>Connect</span>
        </button>
        <button
          onClick={() => onNewSession()}
          className="flex-1 flex items-center justify-center gap-1 px-2 py-[6px] rounded-md text-[11px] font-medium bg-dock-surface text-dock-text-muted hover:text-dock-text hover:bg-dock-surface-hover"
          title={t("sidebar.newSession")}
        >
          <Plus size={11} />
          <span>Session</span>
        </button>
        <button
          onClick={() => onNewFolder()}
          className="flex items-center justify-center px-2 py-[6px] rounded-md text-[11px] bg-dock-surface text-dock-text-muted hover:text-dock-text hover:bg-dock-surface-hover"
          title={t("sidebar.newFolder")}
        >
          <FolderPlus size={11} />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 pt-1 pb-2">
        <div className="space-y-0.5">
          {navItems.map(({ view, icon: Icon, label }) => (
            <button
              key={view}
              onClick={() => setCurrentView(view)}
              className={`w-full flex items-center gap-2.5 px-2.5 py-[7px] rounded-md text-[12px] font-medium ${
                currentView === view
                  ? "bg-dock-accent/10 text-dock-accent"
                  : "text-dock-text-muted hover:text-dock-text hover:bg-dock-surface"
              }`}
            >
              <Icon size={14} strokeWidth={currentView === view ? 2 : 1.5} />
              <span>{label}</span>
              {view === "favorites" && sessions.filter(s => s.favorite).length > 0 && (
                <span className="ml-auto text-[10px] text-dock-text-muted tabular-nums">
                  {sessions.filter(s => s.favorite).length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Separator */}
        <div className="my-3 mx-2 border-t border-dock-border" />

        {/* Folder tree */}
        <div className="px-0.5">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setRootDragOver(true);
              const folderId = getActiveFolderDrag();
              if (folderId) {
                void handleMoveFolder(folderId, undefined);
                setActiveFolderDrag(null);
              }
            }}
            onDragLeave={() => setRootDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setRootDragOver(false); }}
            className={`flex items-center justify-between px-2 mb-1.5 rounded border border-dashed ${
              rootDragOver ? "border-dock-accent bg-dock-accent/15" : "border-transparent"
            }`}
            title="Drop a folder here to move it to the top level"
          >
            <span className="text-[10px] font-medium uppercase tracking-wider text-dock-text-muted">
              Folders · Top level
            </span>
            <span className="text-[10px] text-dock-text-muted tabular-nums">{folders.length}</span>
          </div>
          <FolderTree
            folders={folders}
            sessions={sessions}
            selectedFolderId={selectedFolderId}
            onSelectFolder={(id) => {
              setSelectedFolderId(id);
              setCurrentView("folder");
            }}
            onSelectSession={(session) => {
              addTab({
                id: crypto.randomUUID(),
                sessionId: session.id,
                sessionName: session.name,
                host: session.host,
                port: session.port,
                protocol: session.protocol,
                username: session.username,
                status: "connecting",
                pinned: false,
              });
            }}
            onMoveSession={async (sessionId, folderId) => {
              try {
                const updated = await updateSession({ id: sessionId, folder_id: folderId, clear_folder: !folderId });
                useSessionStore.getState().updateSessionInStore(updated);
              } catch (error) {
                addToast("error", `Failed to move session: ${String(error)}`);
              }
            }}
            onMoveFolder={(folderId, parentId) => void handleMoveFolder(folderId, parentId)}
            onDeleteFolder={async (folderId) => {
              try {
                await deleteFolder(folderId, "move_to_parent");
                deleteFolderPreservingContents(folderId);
                if (selectedFolderId === folderId) {
                  setSelectedFolderId(null);
                  setCurrentView("allSessions");
                }
              } catch (error) {
                addToast("error", `Failed to delete folder: ${String(error)}`);
              }
            }}
            onCreateSessionInFolder={onNewSession}
            onCreateFolderInFolder={onNewFolder}
            onRenameFolder={async (folder) => {
              const name = window.prompt("Folder name:", folder.name)?.trim();
              if (!name || name === folder.name) return;
              try {
                const updated = await updateFolder(folder.id, name);
                useSessionStore.getState().updateFolderInStore(updated);
                addToast("success", `Folder renamed to "${name}"`);
              } catch (error) {
                addToast("error", `Failed to rename folder: ${String(error)}`);
              }
            }}
            onExportFolder={(folderId, format) => void handleExportFolder(folderId, format)}
          />
          {folders.length === 0 && (
            <p className="px-2.5 py-3 text-[11px] text-dock-text-muted italic">
              No folders yet
            </p>
          )}
        </div>
      </nav>

      {/* Bottom settings */}
      <div className="px-2 py-2 border-t border-dock-border flex-shrink-0">
        <button
          onClick={() => setCurrentView("settings")}
          className={`w-full flex items-center gap-2.5 px-2.5 py-[7px] rounded-md text-[12px] font-medium ${
            currentView === "settings"
              ? "bg-dock-accent/10 text-dock-accent"
              : "text-dock-text-muted hover:text-dock-text hover:bg-dock-surface"
          }`}
        >
          <Settings size={14} strokeWidth={1.5} />
          <span>{t("sidebar.settings")}</span>
        </button>
      </div>
    </aside>
  );
}
