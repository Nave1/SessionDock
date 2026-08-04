import { useAppStore } from "../stores/appStore";
import { useSessionStore } from "../stores/sessionStore";
import { HomeView } from "./views/HomeView";
import { SettingsView } from "./views/SettingsView";
import { SessionList } from "./views/SessionList";
import { TerminalTabs } from "./TerminalTabs";
import { TerminalView } from "./terminal/TerminalView";
import { BmcConsoleView } from "./bmc/BmcConsoleView";
import type { Session } from "../types";

interface MainContentProps {
  onNewSession: () => void;
  onNewFolder: () => void;
  onQuickConnect: () => void;
  onImport: () => void;
}

export function MainContent({ onNewSession, onNewFolder, onQuickConnect, onImport }: MainContentProps) {
  const { currentView, tabs, activeTabId, addTab, selectedFolderId } = useAppStore();
  const { sessions } = useSessionStore();

  const handleConnect = (session: Session) => {
    addTab({
      id: crypto.randomUUID(),
      sessionId: session.id,
      sessionName: session.name,
      host: session.host,
      port: session.port,
      protocol: session.protocol,
      status: "connecting",
      pinned: false,
      bmc: session.protocol === "bmc" ? session : undefined,
    });
  };

  const filteredSessions = selectedFolderId && currentView === "folder"
    ? sessions.filter((s) => s.folder_id === selectedFolderId)
    : sessions;

  const favoriteSessions = sessions.filter((s) => s.favorite);
  const activeTab = tabs.find((t) => t.id === activeTabId);

  // Only show terminal when no specific view is selected (user clicked a tab, not a nav item)
  const isNavView = currentView === "settings" || currentView === "home" || currentView === "credentials" || currentView === "tags";
  const showTerminal = activeTab && !isNavView;

  return (
    <main className="flex-1 flex flex-col overflow-hidden">
      {tabs.length > 0 && <TerminalTabs />}

      <div className="flex-1 overflow-hidden relative">
        {/* Terminal layer — always mounted for each tab, visibility toggled */}
        {tabs.map((tab) => {
          const sess = sessions.find((s) => s.id === tab.sessionId);
          return (
            <div
              key={tab.id}
              className={`absolute inset-0 ${showTerminal && tab.id === activeTabId ? "z-10" : "z-0 hidden"}`}
            >
              {tab.protocol === "bmc" ? (
                <BmcConsoleView tab={tab} active={showTerminal === true && tab.id === activeTabId} />
              ) : (
                <TerminalView
                  tabId={tab.id}
                  host={tab.host}
                  port={tab.port ?? sess?.port ?? (tab.protocol === "ssh" ? 22 : 23)}
                  protocol={tab.protocol}
                  username={tab.username ?? sess?.username}
                  password={tab.password}
                />
              )}
            </div>
          );
        })}

        {/* Views layer */}
        <div className={`absolute inset-0 ${showTerminal ? "hidden" : "z-10"}`}>
          {currentView === "settings" ? (
            <SettingsView />
          ) : currentView === "allSessions" ? (
            <SessionList sessions={sessions} title="All Sessions" onConnect={handleConnect} onEdit={() => {}} />
          ) : currentView === "favorites" ? (
            <SessionList sessions={favoriteSessions} title="Favorites" onConnect={handleConnect} onEdit={() => {}} />
          ) : currentView === "folder" ? (
            <SessionList sessions={filteredSessions} title="Folder Sessions" onConnect={handleConnect} onEdit={() => {}} />
          ) : (
            <HomeView onNewSession={onNewSession} onNewFolder={onNewFolder} onQuickConnect={onQuickConnect} onImport={onImport} />
          )}
        </div>
      </div>
    </main>
  );
}
