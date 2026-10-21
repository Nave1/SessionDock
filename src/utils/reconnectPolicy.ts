import type { ReconnectMode } from "../types";

export const RECONNECT_STABLE_RESET_MS = 30_000;
const MAX_RECONNECT_DELAY_MS = 30_000;

export function reconnectDelayMs(mode: ReconnectMode, attempt: number): number | null {
  if (attempt < 1 || mode === "disabled" || (mode === "once" && attempt > 1)) return null;
  const exponent = Math.min(attempt - 1, 5);
  return Math.min(1_000 * (2 ** exponent), MAX_RECONNECT_DELAY_MS);
}

export function blocksAutomaticReconnect(error: unknown): boolean {
  const message = String(error);
  return message.includes("Authentication stage failed")
    || message.includes("stage AUTHENTICATION failed");
}