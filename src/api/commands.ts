import { nativeInvoke } from "./native";
import type {
  Session,
  CreateSessionRequest,
  Folder,
  CreateFolderRequest,
  CredentialProfile,
  SearchResult,
  SerialPortInfo,
} from "../types";

// --- Sessions ---

export async function createSession(request: CreateSessionRequest): Promise<Session> {
  return nativeInvoke("create_session", { request });
}

export async function getSessions(folderId?: string): Promise<Session[]> {
  return nativeInvoke("get_sessions", { folderId });
}

export async function getSession(id: string): Promise<Session> {
  return nativeInvoke("get_session", { id });
}

export async function updateSession(request: Partial<Session> & { id: string; clear_folder?: boolean }): Promise<Session> {
  return nativeInvoke("update_session", { request });
}

export async function deleteSession(id: string): Promise<void> {
  return nativeInvoke("delete_session", { id });
}

export async function searchSessions(query: string): Promise<SearchResult[]> {
  return nativeInvoke("search_sessions", { query });
}

// --- Folders ---

export async function createFolder(request: CreateFolderRequest): Promise<Folder> {
  return nativeInvoke("create_folder", { request });
}

export async function getFolders(): Promise<Folder[]> {
  return nativeInvoke("get_folders");
}

export async function updateFolder(
  id: string,
  name?: string,
  parentId?: string,
  sortOrder?: number,
  clearParent = false,
): Promise<Folder> {
  return nativeInvoke("update_folder", { id, name, parentId, sortOrder, clearParent });
}

export async function deleteFolder(id: string, action: "move_to_parent" | "delete_all"): Promise<void> {
  return nativeInvoke("delete_folder", { id, action });
}

// --- Credentials ---

export async function storeCredential(request: {
  name: string;
  username: string;
  authentication_method: string;
  password?: string;
  description?: string;
}): Promise<CredentialProfile> {
  return nativeInvoke("store_credential", { request });
}

export async function getCredentialProfiles(): Promise<CredentialProfile[]> {
  return nativeInvoke("get_credential_profiles");
}

export async function deleteCredential(id: string): Promise<void> {
  return nativeInvoke("delete_credential", { id });
}

// --- Serial ---

export async function listSerialPorts(): Promise<SerialPortInfo[]> {
  return nativeInvoke("list_serial_ports");
}

// --- Graphical remote desktop ---

export async function launchVncViewer(host: string, port: number): Promise<void> {
  return nativeInvoke("launch_vnc_viewer", { host, port });
}

// --- Data maintenance ---

export async function clearRecentSessions(): Promise<void> {
  return nativeInvoke("clear_recent_sessions");
}

export async function resetApplicationData(): Promise<void> {
  return nativeInvoke("reset_application_data");
}
