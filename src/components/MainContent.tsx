import { useAppStore } from "../stores/appStore";
import { useSessionStore } from "../stores/sessionStore";
import { HomeView } from "./views/HomeView";
import { SettingsView } from "./views/SettingsView";
import { SessionList } from "./views/SessionList";
import { TerminalTabs } from "./TerminalTabs";
import { TerminalView } from "./terminal/TerminalView";

interface MainContentProps {
  onNewSession: () => void;
  onNewFolder: () => void;
  onQuickConnect: () => void;
  onImport: () => void;
}

export function MainContent({ onNewSession, onNewFolder, onQuickConnect, onImport }: MainContentProps) {
  const { currentView, tabs, activeTabId, addTab, selectedFolderId } = useAppStore();
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
  const activeTab = tabs.find((t) => t.id === activeTabId);

  // Show terminal when a tab is active and view is not explicitly set to something else
  const showTerminal = activeTab && (currentView === "home" || currentView === "allSessions" || currentView === "favorites" || currentView === "folder" || currentView === "recent");

  return (
    <main className="flex-1 flex flex-col overflow-hidden">
      {/* Terminal tabs bar — always shown when tabs exist */}
      {tabs.length > 0 && <TerminalTabs />}

      {/* Content area */}
      <div className="flex-1 overflow-hidden relative">
        {/* Terminal layer — rendered behind but visible when active */}
        {activeTab && (
          <div className={`absolute inset-0 ${showTerminal ? "z-10" : "z-0 hidden"}`}>
            <TerminalView
              tabId={activeTab.id}
              onData={(_data) => {
                // TODO: send to backend via Tauri
              }}
              onResize={(_cols, _rows) => {
                // TODO: send resize to backend
              }}
            />
          </div>
        )}

        {/* Views layer */}
        <div className={`absolute inset-0 ${showTerminal ? "hidden" : "z-10"}`}>
          {currentView === "home" && !activeTab ? (
            <HomeView onNewSession={onNewSession} onNewFolder={onNewFolder} onQuickConnect={onQuickConnect} onImport={onImport} />
          ) : currentView === "settings" ? (
            <SettingsView />
          ) : currentView === "allSessions" && !showTerminal ? (
            <SessionList
              sessions={sessions}
              title="All Sessions"
              onConnect={handleConnect}
              onEdit={() => {}}
            />
          ) : currentView === "favorites" && !showTerminal ? (
            <SessionList
              sessions={favoriteSessions}
              title="Favorites"
              onConnect={handleConnect}
              onEdit={() => {}}
            />
          ) : currentView === "folder" && !showTerminal ? (
            <SessionList
              sessions={filteredSessions}
              title="Folder Sessions"
              onConnect={handleConnect}
              onEdit={() => {}}
            />
          ) : !showTerminal ? (
            <HomeView onNewSession={onNewSession} onNewFolder={onNewFolder} onQuickConnect={onQuickConnect} onImport={onImport} />
          ) : null}
        </div>
      </div>
    </main>
  );
}
