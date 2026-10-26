import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";

export type DiagnosticStatus = "running" | "completed" | "failed" | "cancelled";

export interface DiagnosticEvent {
  jobId: string;
  providerId: string;
  diagnosticId: string;
  command: string;
  status: DiagnosticStatus;
  stdout: string;
  stderr: string;
  exitCode?: number;
  truncated: boolean;
  error?: string;
}

export interface DiagnosticRecord extends DiagnosticEvent {
  tabId: string;
  updatedAt: number;
}

interface DiagnosticState {
  diagnostics: DiagnosticRecord[];
  upsertDiagnostic: (tabId: string, event: DiagnosticEvent) => void;
  attachDiagnostic: (tabId: string, event: DiagnosticEvent) => void;
  cancelPaneDiagnostics: (tabId: string) => void;
  clearFinished: () => void;
}

const MAX_DIAGNOSTIC_HISTORY = 100;
const MAX_DIAGNOSTIC_OUTPUT_LENGTH = 64 * 1024;
const MAX_DIAGNOSTIC_STORAGE_LENGTH = 4 * 1024 * 1024;

function compactOldestOutput(serialized: string): string | undefined {
  try {
    const stored = JSON.parse(serialized) as { state?: { diagnostics?: Array<Record<string, unknown>> } };
    const records = stored.state?.diagnostics;
    if (!Array.isArray(records)) return undefined;
    for (let index = records.length - 1; index >= 0; index -= 1) {
      const record = records[index];
      if (record.stdout || record.stderr) {
        record.stdout = "";
        record.stderr = "";
        record.truncated = true;
        return JSON.stringify(stored);
      }
    }
  } catch {
    return undefined;
  }
  return undefined;
}

const diagnosticStorage: StateStorage = {
  getItem: (name) => localStorage.getItem(name),
  removeItem: (name) => localStorage.removeItem(name),
  setItem: (name, value) => {
    let candidate = value;
    while (candidate.length > MAX_DIAGNOSTIC_STORAGE_LENGTH) {
      const compacted = compactOldestOutput(candidate);
      if (!compacted) break;
      candidate = compacted;
    }
    for (;;) {
      try {
        localStorage.setItem(name, candidate);
        return;
      } catch (error) {
        const compacted = compactOldestOutput(candidate);
        if (!compacted) throw error;
        candidate = compacted;
      }
    }
  },
};

function boundedString(value: unknown, maxLength: number): string | undefined {
  return typeof value === "string" && value.length <= maxLength ? value : undefined;
}

function restoreDiagnostics(persistedState: unknown): DiagnosticRecord[] {
  const records = (persistedState as { diagnostics?: unknown })?.diagnostics;
  if (!Array.isArray(records)) return [];
  const restored: DiagnosticRecord[] = [];
  for (const value of records.slice(0, MAX_DIAGNOSTIC_HISTORY)) {
    if (!value || typeof value !== "object") continue;
    const record = value as Partial<DiagnosticRecord>;
    const jobId = boundedString(record.jobId, 256);
    const tabId = boundedString(record.tabId, 128);
    const providerId = boundedString(record.providerId, 128);
    const diagnosticId = boundedString(record.diagnosticId, 128);
    const command = boundedString(record.command, 4_096);
    const stdout = boundedString(record.stdout, MAX_DIAGNOSTIC_OUTPUT_LENGTH);
    const stderr = boundedString(record.stderr, MAX_DIAGNOSTIC_OUTPUT_LENGTH);
    const status = record.status === "running" ? "cancelled" : record.status;
    if (!jobId || !tabId || !providerId || !diagnosticId || command === undefined || stdout === undefined || stderr === undefined) continue;
    if (!status || !["completed", "failed", "cancelled"].includes(status)) continue;
    restored.push({
      jobId,
      tabId,
      providerId,
      diagnosticId,
      command,
      status,
      stdout,
      stderr,
      exitCode: typeof record.exitCode === "number" && Number.isInteger(record.exitCode) ? record.exitCode : undefined,
      truncated: record.truncated === true,
      error: boundedString(record.error, 4_096),
      updatedAt: typeof record.updatedAt === "number" && Number.isFinite(record.updatedAt) ? record.updatedAt : Date.now(),
    });
  }
  return restored;
}

export const useDiagnosticStore = create<DiagnosticState>()(
  persist(
    (set) => ({
      diagnostics: [],

      upsertDiagnostic: (tabId, event) => set((state) => {
        const existing = state.diagnostics.some((diagnostic) => diagnostic.jobId === event.jobId);
        const next = existing
          ? state.diagnostics.map((diagnostic) => diagnostic.jobId === event.jobId
            ? { ...diagnostic, ...event, tabId, updatedAt: Date.now() }
            : diagnostic)
          : [{ ...event, tabId, updatedAt: Date.now() }, ...state.diagnostics];
        return { diagnostics: next.slice(0, MAX_DIAGNOSTIC_HISTORY) };
      }),

      attachDiagnostic: (tabId, event) => set((state) => {
        if (state.diagnostics.some((diagnostic) => diagnostic.jobId === event.jobId)) return state;
        return {
          diagnostics: [{ ...event, tabId, updatedAt: Date.now() }, ...state.diagnostics]
            .slice(0, MAX_DIAGNOSTIC_HISTORY),
        };
      }),

      cancelPaneDiagnostics: (tabId) => set((state) => ({
        diagnostics: state.diagnostics.map((diagnostic) => diagnostic.tabId === tabId && diagnostic.status === "running"
          ? { ...diagnostic, status: "cancelled", updatedAt: Date.now() }
          : diagnostic),
      })),

      clearFinished: () => set((state) => ({
        diagnostics: state.diagnostics.filter((diagnostic) => diagnostic.status === "running"),
      })),
    }),
    {
      name: "sessiondock-diagnostics",
      storage: createJSONStorage(() => diagnosticStorage),
      partialize: (state) => ({ diagnostics: state.diagnostics }),
      merge: (persistedState, currentState) => ({
        ...currentState,
        diagnostics: restoreDiagnostics(persistedState),
      }),
    },
  ),
);