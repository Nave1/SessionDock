import { invoke } from "@tauri-apps/api/core";
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
  return invoke("create_session", { request });
}

export async function getSessions(folderId?: string): Promise<Session[]> {
  return invoke("get_sessions", { folderId });
}

export async function getSession(id: string): Promise<Session> {
  return invoke("get_session", { id });
}

export async function updateSession(request: Partial<Session> & { id: string; clear_folder?: boolean }): Promise<Session> {
  return invoke("update_session", { request });
}

export async function deleteSession(id: string): Promise<void> {
  return invoke("delete_session", { id });
}

export async function searchSessions(query: string): Promise<SearchResult[]> {
  return invoke("search_sessions", { query });
}

// --- Folders ---

export async function createFolder(request: CreateFolderRequest): Promise<Folder> {
  return invoke("create_folder", { request });
}

export async function getFolders(): Promise<Folder[]> {
  return invoke("get_folders");
}

export async function updateFolder(
  id: string,
  name?: string,
  parentId?: string,
  sortOrder?: number,
  clearParent = false,
): Promise<Folder> {
  return invoke("update_folder", { id, name, parentId, sortOrder, clearParent });
}

export async function deleteFolder(id: string, action: "move_to_parent" | "delete_all"): Promise<void> {
  return invoke("delete_folder", { id, action });
}

// --- Credentials ---

export async function storeCredential(request: {
  name: string;
  username: string;
  authentication_method: string;
  password?: string;
  description?: string;
}): Promise<CredentialProfile> {
  return invoke("store_credential", { request });
}

export async function getCredentialProfiles(): Promise<CredentialProfile[]> {
  return invoke("get_credential_profiles");
}

export async function deleteCredential(id: string): Promise<void> {
  return invoke("delete_credential", { id });
}

// --- Serial ---

export async function listSerialPorts(): Promise<SerialPortInfo[]> {
  return invoke("list_serial_ports");
}

// --- Data maintenance ---

export async function clearRecentSessions(): Promise<void> {
  return invoke("clear_recent_sessions");
}

export async function resetApplicationData(): Promise<void> {
  return invoke("reset_application_data");
}
