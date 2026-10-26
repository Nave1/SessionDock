import { create } from "zustand";
import { persist } from "zustand/middleware";

interface FileBrowserState {
  lastLocalDirectory?: string;
  setLastLocalDirectory: (path?: string) => void;
}

function validPersistedPath(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 && value.length <= 32_768 && !value.includes("\0")
    ? value
    : undefined;
}

export const useFileBrowserStore = create<FileBrowserState>()(
  persist(
    (set) => ({
      lastLocalDirectory: undefined,
      setLastLocalDirectory: (path) => set({ lastLocalDirectory: validPersistedPath(path) }),
    }),
    {
      name: "sessiondock-file-browser",
      partialize: (state) => ({ lastLocalDirectory: state.lastLocalDirectory }),
      merge: (persistedState, currentState) => ({
        ...currentState,
        lastLocalDirectory: validPersistedPath((persistedState as Partial<FileBrowserState>)?.lastLocalDirectory),
      }),
    },
  ),
);