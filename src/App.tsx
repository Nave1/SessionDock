import { useEffect, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { MainContent } from "./components/MainContent";
import { CommandPalette } from "./components/CommandPalette";
import { SessionForm } from "./components/forms/SessionForm";
import { FolderForm } from "./components/forms/FolderForm";
import { QuickConnect, type QuickConnectConfig } from "./components/forms/QuickConnect";
import { ToastContainer } from "./components/ToastContainer";
import { UpdateNotification } from "./components/UpdateNotification";
import { useAppStore } from "./stores/appStore";
import { useSessionStore } from "./stores/sessionStore";
import { useToastStore } from "./stores/toastStore";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { createFolder, createSession, getFolders, getSessions, updateSession } from "./api/commands";
import { importFolderHierarchy, parseCsvImportData, parseJsonImport } from "./utils/importExport";
import type { CreateSessionRequest, CreateFolderRequest, Session } from "./types";
import { safePersistedBmcUrl } from "./utils/bmcUrl";

function App() {
  const commandPaletteOpen = useAppStore((s) => s.commandPaletteOpen);
  const setCommandPaletteOpen = useAppStore((s) => s.setCommandPaletteOpen);
  const [sessionFormOpen, setSessionFormOpen] = useState(false);
  const [sessionFormFolderId, setSessionFormFolderId] = useState<string | undefined>();
  const [editingSession, setEditingSession] = useState<Session | null>(null);
  const [folderFormOpen, setFolderFormOpen] = useState(false);
  const [folderFormParentId, setFolderFormParentId] = useState<string | undefined>();
  const [quickConnectOpen, setQuickConnectOpen] = useState(false);
  const sidebarWidth = useAppStore((s) => s.sidebarWidth);
  const setSidebarWidth = useAppStore((s) => s.setSidebarWidth);
  const addTab = useAppStore((s) => s.addTab);
  const folders = useSessionStore((s) => s.folders);
  const { addSession, addFolder, setSessions, setFolders, setIsLoading } = useSessionStore();
  const addToast = useToastStore((s) => s.addToast);

  useKeyboardShortcuts({ onCommandPalette: () => setCommandPaletteOpen(true) });

  const openSessionForm = (folderId?: string) => {
    setSessionFormFolderId(folderId);
    setSessionFormOpen(true);
  };

  const openFolderForm = (parentId?: string) => {
    setFolderFormParentId(parentId);
    setFolderFormOpen(true);
  };

  useEffect(() => {
    let cancelled = false;

    const loadSavedData = async () => {
      setIsLoading(true);
      try {
        const [savedSessions, savedFolders] = await Promise.all([getSessions(), getFolders()]);
        if (!cancelled) {
          setSessions(savedSessions);
          setFolders(savedFolders);
        }
      } catch (error) {
        if (!cancelled) addToast("error", `Failed to load saved data: ${String(error)}`);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void loadSavedData();
    return () => { cancelled = true; };
  }, [addToast, setFolders, setIsLoading, setSessions]);

  const handleCreateSession = async (data: CreateSessionRequest) => {
    try {
      const session = await createSession(data);
      addSession(session);
      setSessionFormOpen(false);
      addToast("success", `Session "${data.name}" created`);
    } catch (error) {
      addToast("error", `Failed to create session: ${String(error)}`);
    }
  };

  const handleUpdateSession = async (data: CreateSessionRequest) => {
    if (!editingSession) return;
    try {
      const session = await updateSession({
        ...editingSession,
        ...data,
        id: editingSession.id,
        clear_folder: !data.folder_id,
      });
      useSessionStore.getState().updateSessionInStore(session);
      setEditingSession(null);
      addToast("success", `Session "${session.name}" updated`);
    } catch (error) {
      addToast("error", `Failed to update session: ${String(error)}`);
    }
  };

  const handleCreateFolder = async (data: CreateFolderRequest) => {
    try {
      const folder = await createFolder(data);
      addFolder(folder);
      setFolderFormOpen(false);
      addToast("success", `Folder "${data.name}" created`);
    } catch (error) {
      addToast("error", `Failed to create folder: ${String(error)}`);
    }
  };

  const handleQuickConnect = (config: QuickConnectConfig) => {
    const tabId = crypto.randomUUID();
    addTab({
      id: tabId,
      sessionId: tabId,
      sessionName: config.username ? `${config.username}@${config.host}` : config.host,
      host: config.host,
      port: config.port,
      protocol: config.protocol,
      username: config.username || undefined,
      password: config.password || undefined,
      status: "connecting",
      pinned: false,
      bmc: config.protocol === "bmc" ? config : undefined,
    });
    setQuickConnectOpen(false);
    addToast("info", `Connecting to ${config.host}...`);

    // If user wants to save, create a session
    if (config.saveAsSession) {
      const request: CreateSessionRequest = {
        name: config.host,
        host: config.host,
        port: config.port,
        protocol: config.protocol,
        username: config.username || undefined,
        authentication_method: "password" as const,
        favorite: false,
        connection_timeout: 30,
        keepalive_interval: 60,
        bmc_use_https: config.bmc_use_https,
        bmc_web_path: config.bmc_web_path,
        bmc_console_url: safePersistedBmcUrl(config.bmc_console_url),
        bmc_viewer_mode: config.bmc_viewer_mode,
        bmc_ignore_tls_errors: false,
        bmc_open_console_automatically: config.bmc_open_console_automatically,
        bmc_open_fullscreen: config.bmc_open_fullscreen,
        bmc_timeout_seconds: config.bmc_timeout_seconds,
        bmc_server_hostname: config.bmc_server_hostname,
        bmc_server_serial_number: config.bmc_server_serial_number,
        bmc_rack: config.bmc_rack,
        bmc_rack_unit: config.bmc_rack_unit,
        bmc_site: config.bmc_site,
        bmc_redfish_enabled: config.bmc_redfish_enabled,
        bmc_cookie_persistence: config.bmc_cookie_persistence,
      };
      void createSession(request)
        .then(addSession)
        .catch((error) => addToast("error", `Failed to save session: ${String(error)}`));
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
          const data = parseJsonImport(text);
          if (data) {
            const folderIds = await importFolderHierarchy(data.folders, createFolder);
            let count = 0;
            for (const s of data.sessions) {
              await createSession({
                name: s.name || "Imported",
                host: s.host || "",
                port: s.port || 22,
                protocol: s.protocol === "telnet" || s.protocol === "serial" || s.protocol === "bmc" || s.protocol === "vnc" ? s.protocol : "ssh",
                username: s.username,
                authentication_method: s.authentication_method === "private_key" || s.authentication_method === "ssh_agent" || s.authentication_method === "manual" ? s.authentication_method : "password",
                favorite: s.favorite || false,
                connection_timeout: s.connection_timeout || 30,
                keepalive_interval: s.keepalive_interval || 60,
                device_type: s.device_type,
                vendor: s.vendor,
                model: s.model,
                description: s.description,
                notes: s.notes,
                startup_command: s.startup_command,
                folder_id: s.folder_id ? folderIds.get(s.folder_id) : undefined,
                tags: s.tags,
                bmc_use_https: s.bmc_use_https,
                bmc_web_path: s.bmc_web_path,
                bmc_console_url: safePersistedBmcUrl(s.bmc_console_url),
                bmc_viewer_mode: s.bmc_viewer_mode,
                bmc_open_console_automatically: s.bmc_open_console_automatically,
                bmc_open_fullscreen: s.bmc_open_fullscreen,
                bmc_timeout_seconds: s.bmc_timeout_seconds,
                bmc_server_hostname: s.bmc_server_hostname,
                bmc_server_serial_number: s.bmc_server_serial_number,
                bmc_rack: s.bmc_rack,
                bmc_rack_unit: s.bmc_rack_unit,
                bmc_site: s.bmc_site,
                bmc_redfish_enabled: s.bmc_redfish_enabled,
                bmc_cookie_persistence: s.bmc_cookie_persistence,
              });
              count++;
            }
            const [savedSessions, savedFolders] = await Promise.all([getSessions(), getFolders()]);
            setSessions(savedSessions);
            setFolders(savedFolders);
            addToast("success", `Imported ${count} sessions and ${folderIds.size} folders`);
          } else {
            addToast("error", "Invalid JSON format");
          }
        } else if (file.name.endsWith(".csv")) {
          const imported = parseCsvImportData(text);
          if (imported.sessions.length === 0) { addToast("error", "CSV file is empty"); return; }
          const folderIds = await importFolderHierarchy(imported.folders, createFolder);
          let count = 0;
          for (const importedSession of imported.sessions) {
              const protocol = importedSession.protocol === "telnet" || importedSession.protocol === "serial" || importedSession.protocol === "bmc" || importedSession.protocol === "vnc" ? importedSession.protocol : "ssh";
              await createSession({
                name: importedSession.name || "Imported",
                host: importedSession.host || "",
                port: importedSession.port ?? (protocol === "ssh" ? 22 : protocol === "telnet" ? 23 : protocol === "bmc" ? 443 : protocol === "vnc" ? 5900 : 0),
                protocol,
                username: importedSession.username,
                authentication_method: "password",
                favorite: importedSession.favorite ?? false,
                connection_timeout: 30,
                keepalive_interval: 60,
                folder_id: importedSession.folder_id ? folderIds.get(importedSession.folder_id) : undefined,
                device_type: importedSession.device_type,
                vendor: importedSession.vendor,
                model: importedSession.model,
                description: importedSession.description,
                bmc_use_https: importedSession.bmc_use_https,
                bmc_web_path: importedSession.bmc_web_path,
                bmc_console_url: safePersistedBmcUrl(importedSession.bmc_console_url),
                bmc_viewer_mode: importedSession.bmc_viewer_mode,
                bmc_server_hostname: importedSession.bmc_server_hostname,
                bmc_server_serial_number: importedSession.bmc_server_serial_number,
                bmc_site: importedSession.bmc_site,
                bmc_rack: importedSession.bmc_rack,
                bmc_rack_unit: importedSession.bmc_rack_unit,
              });
              count++;
          }
          const [savedSessions, savedFolders] = await Promise.all([getSessions(), getFolders()]);
          setSessions(savedSessions);
          setFolders(savedFolders);
          addToast("success", `Imported ${count} sessions and ${folderIds.size} folders from CSV`);
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
        onResize={setSidebarWidth}
        onNewSession={openSessionForm}
        onEditSession={setEditingSession}
        onNewFolder={openFolderForm}
        onQuickConnect={() => setQuickConnectOpen(true)}
      />
      <MainContent
        onNewSession={() => openSessionForm()}
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
          initialFolderId={sessionFormFolderId}
        />
      )}

      {editingSession && (
        <SessionForm
          onSubmit={handleUpdateSession}
          onCancel={() => setEditingSession(null)}
          folders={folders.map((f) => ({ id: f.id, name: f.name }))}
          initialSession={editingSession}
        />
      )}

      {folderFormOpen && (
        <FolderForm
          onSubmit={handleCreateFolder}
          onCancel={() => setFolderFormOpen(false)}
          folders={folders.map((f) => ({ id: f.id, name: f.name }))}
          initialParentId={folderFormParentId}
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
