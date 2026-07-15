import { useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { MainContent } from "./components/MainContent";
import { CommandPalette } from "./components/CommandPalette";
import { SessionForm } from "./components/forms/SessionForm";
import { FolderForm } from "./components/forms/FolderForm";
import { QuickConnect } from "./components/forms/QuickConnect";
import { ToastContainer } from "./components/ToastContainer";
import { UpdateNotification } from "./components/UpdateNotification";
import { useAppStore } from "./stores/appStore";
import { useSessionStore } from "./stores/sessionStore";
import { useToastStore } from "./stores/toastStore";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import type { CreateSessionRequest, CreateFolderRequest } from "./types";

function App() {
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [sessionFormOpen, setSessionFormOpen] = useState(false);
  const [folderFormOpen, setFolderFormOpen] = useState(false);
  const [quickConnectOpen, setQuickConnectOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const sidebarWidth = useAppStore((s) => s.sidebarWidth);
  const addTab = useAppStore((s) => s.addTab);
  const folders = useSessionStore((s) => s.folders);
  const { addSession, addFolder } = useSessionStore();
  const addToast = useToastStore((s) => s.addToast);

  useKeyboardShortcuts({ onCommandPalette: () => setCommandPaletteOpen(true) });

  const handleCreateSession = (data: CreateSessionRequest) => {
    const session = {
      ...data,
      id: crypto.randomUUID(),
      connection_timeout: data.connection_timeout ?? 30,
      keepalive_interval: data.keepalive_interval ?? 60,
      connection_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    addSession(session);
    setSessionFormOpen(false);
    addToast("success", `Session "${data.name}" created`);
  };

  const handleCreateFolder = (data: CreateFolderRequest) => {
    const folder = {
      ...data,
      id: crypto.randomUUID(),
      sort_order: folders.length,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    addFolder(folder);
    setFolderFormOpen(false);
    addToast("success", `Folder "${data.name}" created`);
  };

  const handleQuickConnect = (config: { host: string; port: number; protocol: "ssh" | "telnet" | "serial"; username: string; saveAsSession: boolean }) => {
    const tabId = crypto.randomUUID();
    addTab({
      id: tabId,
      sessionId: tabId,
      sessionName: config.host,
      host: config.host,
      protocol: config.protocol,
      status: "connecting",
      pinned: false,
    });
    setQuickConnectOpen(false);
    addToast("info", `Connecting to ${config.host}...`);

    // If user wants to save, create a session
    if (config.saveAsSession) {
      const session = {
        id: crypto.randomUUID(),
        name: config.host,
        host: config.host,
        port: config.port,
        protocol: config.protocol,
        username: config.username || undefined,
        authentication_method: "password" as const,
        favorite: false,
        connection_timeout: 30,
        keepalive_interval: 60,
        connection_count: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      addSession(session);
    }
  };

  const handleImport = () => {
    setImportOpen(!importOpen);
    useAppStore.getState().setCurrentView("home");
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-dock-bg">
      <Sidebar
        width={sidebarWidth}
        onNewSession={() => setSessionFormOpen(true)}
        onNewFolder={() => setFolderFormOpen(true)}
      />
      <MainContent
        onNewSession={() => setSessionFormOpen(true)}
        onNewFolder={() => setFolderFormOpen(true)}
        onQuickConnect={() => setQuickConnectOpen(true)}
        onImport={handleImport}
      />

      {commandPaletteOpen && (
        <CommandPalette onClose={() => setCommandPaletteOpen(false)} />
      )}

      {sessionFormOpen && (
        <SessionForm
          onSubmit={handleCreateSession}
          onCancel={() => setSessionFormOpen(false)}
          folders={folders.map((f) => ({ id: f.id, name: f.name }))}
        />
      )}

      {folderFormOpen && (
        <FolderForm
          onSubmit={handleCreateFolder}
          onCancel={() => setFolderFormOpen(false)}
          folders={folders.map((f) => ({ id: f.id, name: f.name }))}
        />
      )}

      {quickConnectOpen && (
        <QuickConnect
          onConnect={handleQuickConnect}
          onCancel={() => setQuickConnectOpen(false)}
        />
      )}

      <ToastContainer />
      <UpdateNotification />
    </div>
  );
}

export default App;
