import { create } from "zustand";

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

export const useDiagnosticStore = create<DiagnosticState>((set) => ({
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
}));