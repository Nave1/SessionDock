import { useAppStore } from "../stores/appStore";
import { useSessionStore } from "../stores/sessionStore";
import { HomeView } from "./views/HomeView";
import { SettingsView } from "./views/SettingsView";
import { SessionList } from "./views/SessionList";
import { TerminalTabs } from "./TerminalTabs";

interface MainContentProps {
  onNewSession: () => void;
  onNewFolder: () => void;
}

export function MainContent({ onNewSession, onNewFolder }: MainContentProps) {
  const { currentView, tabs, addTab, selectedFolderId } = useAppStore();
  const { sessions } = useSessionStore();

  const handleConnect = (session: { id: string; name: string; host: string; protocol: string }) => {
    addTab({
      id: crypto.randomUUID(),
      sessionId: session.id,
      sessionName: session.name,
      host: session.host,
      protocol: session.protocol,
      status: "connecting",
      pinned: false,
    });
  };

  const filteredSessions = selectedFolderId && currentView === "folder"
    ? sessions.filter((s) => s.folder_id === selectedFolderId)
    : sessions;

  const favoriteSessions = sessions.filter((s) => s.favorite);

  return (
    <main className="flex-1 flex flex-col overflow-hidden">
      {/* Terminal tabs bar */}
      {tabs.length > 0 && <TerminalTabs />}

      {/* Content area */}
      <div className="flex-1 overflow-hidden">
        {tabs.length > 0 ? (
          <div className="w-full h-full bg-dock-bg flex items-center justify-center text-dock-text-muted text-sm font-mono">
            <div className="text-center space-y-2">
              <p className="text-dock-text">Terminal session active</p>
              <p className="text-xs">xterm.js will render here when Tauri backend is connected</p>
            </div>
          </div>
        ) : currentView === "home" ? (
          <HomeView onNewSession={onNewSession} onNewFolder={onNewFolder} />
        ) : currentView === "settings" ? (
          <SettingsView />
        ) : currentView === "allSessions" ? (
          <SessionList
            sessions={sessions}
            title="All Sessions"
            onConnect={handleConnect}
            onEdit={() => {}}
          />
        ) : currentView === "favorites" ? (
          <SessionList
            sessions={favoriteSessions}
            title="Favorites"
            onConnect={handleConnect}
            onEdit={() => {}}
          />
        ) : currentView === "folder" ? (
          <SessionList
            sessions={filteredSessions}
            title="Folder Sessions"
            onConnect={handleConnect}
            onEdit={() => {}}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-dock-text-muted text-sm">
            {currentView} view
          </div>
        )}
      </div>
    </main>
  );
}
