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
    // Open a file input to select JSON/CSV file
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,.csv";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();

      try {
        if (file.name.endsWith(".json")) {
          const data = JSON.parse(text);
          if (data.sessions && Array.isArray(data.sessions)) {
            let count = 0;
            for (const s of data.sessions) {
              addSession({
                id: crypto.randomUUID(),
                name: s.name || "Imported",
                host: s.host || "",
                port: s.port || 22,
                protocol: s.protocol || "ssh",
                username: s.username,
                authentication_method: s.authentication_method || "password",
                favorite: s.favorite || false,
                connection_timeout: s.connection_timeout || 30,
                keepalive_interval: s.keepalive_interval || 60,
                connection_count: 0,
                device_type: s.device_type,
                vendor: s.vendor,
                model: s.model,
                description: s.description,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              });
              count++;
            }
            addToast("success", `Imported ${count} sessions`);
          } else {
            addToast("error", "Invalid JSON format");
          }
        } else if (file.name.endsWith(".csv")) {
          const lines = text.split("\n").filter((l: string) => l.trim());
          if (lines.length < 2) { addToast("error", "CSV file is empty"); return; }
          let count = 0;
          for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(",");
            if (cols[0]) {
              addSession({
                id: crypto.randomUUID(),
                name: cols[0]?.trim().replace(/^"|"$/g, "") || "Imported",
                host: cols[1]?.trim().replace(/^"|"$/g, "") || "",
                port: parseInt(cols[2]) || 22,
                protocol: (cols[3]?.trim() as "ssh" | "telnet" | "serial") || "ssh",
                username: cols[4]?.trim().replace(/^"|"$/g, ""),
                authentication_method: "password",
                favorite: false,
                connection_timeout: 30,
                keepalive_interval: 60,
                connection_count: 0,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              });
              count++;
            }
          }
          addToast("success", `Imported ${count} sessions from CSV`);
        }
      } catch {
        addToast("error", "Failed to parse import file");
      }
    };
    input.click();
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-dock-bg">
      <Sidebar
        width={sidebarWidth}
        onNewSession={() => setSessionFormOpen(true)}
        onNewFolder={() => setFolderFormOpen(true)}
        onQuickConnect={() => setQuickConnectOpen(true)}
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
