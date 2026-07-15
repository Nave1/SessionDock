import { useTranslation } from "react-i18next";
import { useAppStore, ViewMode } from "../stores/appStore";
import { useSessionStore } from "../stores/sessionStore";
import { FolderTree } from "./tree/FolderTree";
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
  onNewSession: () => void;
  onNewFolder: () => void;
  onQuickConnect: () => void;
}

export function Sidebar({ width, onNewSession, onNewFolder, onQuickConnect }: SidebarProps) {
  const { t } = useTranslation();
  const { currentView, setCurrentView, selectedFolderId, setSelectedFolderId } = useAppStore();
  const { folders, sessions } = useSessionStore();

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
          onClick={onNewSession}
          className="flex-1 flex items-center justify-center gap-1 px-2 py-[6px] rounded-md text-[11px] font-medium bg-dock-surface text-dock-text-muted hover:text-dock-text hover:bg-dock-surface-hover"
          title={t("sidebar.newSession")}
        >
          <Plus size={11} />
          <span>Session</span>
        </button>
        <button
          onClick={onNewFolder}
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
          <div className="flex items-center justify-between px-2 mb-1.5">
            <span className="text-[10px] font-medium uppercase tracking-wider text-dock-text-muted">
              Folders
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
            onSelectSession={() => {}}
            onMoveSession={(sessionId, folderId) => {
              useSessionStore.getState().updateSessionInStore({
                ...sessions.find((s) => s.id === sessionId)!,
                folder_id: folderId,
              });
            }}
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
