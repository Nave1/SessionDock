import { useTranslation } from "react-i18next";
import { useAppStore, ViewMode } from "../stores/appStore";
import { useSessionStore } from "../stores/sessionStore";
import { FolderTree } from "./tree/FolderTree";
import {
  Home,
  List,
  Star,
  Clock,
  Tag,
  KeyRound,
  Settings,
  Plus,
  FolderPlus,
  Search,
} from "lucide-react";

interface SidebarProps {
  width: number;
  onNewSession: () => void;
  onNewFolder: () => void;
}

const navItems: { view: ViewMode; icon: typeof Home; labelKey: string }[] = [
  { view: "home", icon: Home, labelKey: "sidebar.home" },
  { view: "allSessions", icon: List, labelKey: "sidebar.allSessions" },
  { view: "favorites", icon: Star, labelKey: "sidebar.favorites" },
  { view: "recent", icon: Clock, labelKey: "sidebar.recent" },
  { view: "tags", icon: Tag, labelKey: "sidebar.tags" },
  { view: "credentials", icon: KeyRound, labelKey: "sidebar.credentials" },
  { view: "settings", icon: Settings, labelKey: "sidebar.settings" },
];

export function Sidebar({ width, onNewSession, onNewFolder }: SidebarProps) {
  const { t } = useTranslation();
  const { currentView, setCurrentView, selectedFolderId, setSelectedFolderId } = useAppStore();
  const { folders, sessions } = useSessionStore();

  return (
    <aside
      className="flex flex-col h-full bg-dock-sidebar border-r border-dock-border"
      style={{ width: `${width}px`, minWidth: `${width}px` }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-dock-border">
        <div className="w-6 h-6 rounded bg-dock-accent flex items-center justify-center text-white text-xs font-bold">
          S
        </div>
        <span className="text-sm font-semibold text-dock-text">
          {t("app.name")}
        </span>
      </div>

      {/* Search */}
      <div className="px-3 py-2">
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-dock-bg border border-dock-border text-dock-text-muted text-xs">
          <Search size={13} />
          <span>{t("sidebar.search")}</span>
          <kbd className="ml-auto text-[10px] px-1 py-0.5 rounded bg-dock-border text-dock-text-muted">
            Ctrl+K
          </kbd>
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex gap-1 px-3 py-1">
        <button
          onClick={onNewSession}
          className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded text-xs bg-dock-accent/10 text-dock-accent hover:bg-dock-accent/20 transition-colors"
          title={t("sidebar.newSession")}
        >
          <Plus size={12} />
          <span>{t("sidebar.newSession")}</span>
        </button>
        <button
          onClick={onNewFolder}
          className="flex items-center justify-center gap-1 px-2 py-1.5 rounded text-xs bg-dock-surface text-dock-text-muted hover:text-dock-text hover:bg-dock-border transition-colors"
          title={t("sidebar.newFolder")}
        >
          <FolderPlus size={12} />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
        {navItems.map(({ view, icon: Icon, labelKey }) => (
          <button
            key={view}
            onClick={() => setCurrentView(view)}
            className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded text-xs transition-colors ${
              currentView === view
                ? "bg-dock-accent/15 text-dock-accent"
                : "text-dock-text-muted hover:text-dock-text hover:bg-dock-surface"
            }`}
          >
            <Icon size={14} />
            <span>{t(labelKey)}</span>
          </button>
        ))}

        {/* Folder tree separator */}
        <div className="pt-3 pb-1 px-2.5">
          <span className="text-[10px] uppercase tracking-wider text-dock-text-muted font-medium">
            {t("sidebar.folders")}
          </span>
        </div>

        {/* Folder tree */}
        <div className="px-1">
          <FolderTree
            folders={folders}
            sessions={sessions}
            selectedFolderId={selectedFolderId}
            onSelectFolder={(id) => {
              setSelectedFolderId(id);
              setCurrentView("folder");
            }}
            onSelectSession={() => {}}
          />
          {folders.length === 0 && (
            <div className="px-2.5 py-2 text-xs text-dock-text-muted italic">
              No folders yet
            </div>
          )}
        </div>
      </nav>
    </aside>
  );
}
