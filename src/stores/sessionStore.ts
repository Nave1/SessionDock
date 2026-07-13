import { create } from "zustand";
import type { Session, Folder, CredentialProfile, SearchResult } from "../types";

interface SessionState {
  sessions: Session[];
  folders: Folder[];
  credentials: CredentialProfile[];
  searchResults: SearchResult[];
  searchQuery: string;
  isLoading: boolean;

  setSessions: (sessions: Session[]) => void;
  addSession: (session: Session) => void;
  updateSessionInStore: (session: Session) => void;
  removeSession: (id: string) => void;

  setFolders: (folders: Folder[]) => void;
  addFolder: (folder: Folder) => void;
  updateFolderInStore: (folder: Folder) => void;
  removeFolder: (id: string) => void;

  setCredentials: (credentials: CredentialProfile[]) => void;
  setSearchResults: (results: SearchResult[]) => void;
  setSearchQuery: (query: string) => void;
  setIsLoading: (loading: boolean) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  sessions: [],
  folders: [],
  credentials: [],
  searchResults: [],
  searchQuery: "",
  isLoading: false,

  setSessions: (sessions) => set({ sessions }),
  addSession: (session) =>
    set((state) => ({ sessions: [...state.sessions, session] })),
  updateSessionInStore: (session) =>
    set((state) => ({
      sessions: state.sessions.map((s) => (s.id === session.id ? session : s)),
    })),
  removeSession: (id) =>
    set((state) => ({
      sessions: state.sessions.filter((s) => s.id !== id),
    })),

  setFolders: (folders) => set({ folders }),
  addFolder: (folder) =>
    set((state) => ({ folders: [...state.folders, folder] })),
  updateFolderInStore: (folder) =>
    set((state) => ({
      folders: state.folders.map((f) => (f.id === folder.id ? folder : f)),
    })),
  removeFolder: (id) =>
    set((state) => ({
      folders: state.folders.filter((f) => f.id !== id),
    })),

  setCredentials: (credentials) => set({ credentials }),
  setSearchResults: (results) => set({ searchResults: results }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setIsLoading: (loading) => set({ isLoading: loading }),
}));
