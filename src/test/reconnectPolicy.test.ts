import { describe, expect, it } from "vitest";
import { blocksAutomaticReconnect, reconnectDelayMs } from "../utils/reconnectPolicy";

describe("reconnectDelayMs", () => {
  it("keeps disabled sessions opt-out", () => {
    expect(reconnectDelayMs("disabled", 1)).toBeNull();
  });

  it("allows exactly one retry in once mode", () => {
    expect(reconnectDelayMs("once", 1)).toBe(1_000);
    expect(reconnectDelayMs("once", 2)).toBeNull();
  });

  it("backs off automatic retries and caps the delay", () => {
    expect([1, 2, 3, 4, 5, 6, 20].map((attempt) => reconnectDelayMs("automatic", attempt)))
      .toEqual([1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000]);
  });

  it("rejects invalid attempt numbers", () => {
    expect(reconnectDelayMs("automatic", 0)).toBeNull();
    expect(reconnectDelayMs("automatic", -1)).toBeNull();
  });

  it("blocks retries for direct and jump-host authentication failures", () => {
    expect(blocksAutomaticReconnect("SSH error: Authentication stage failed: password rejected")).toBe(true);
    expect(blocksAutomaticReconnect("Jump host 'edge' stage AUTHENTICATION failed")).toBe(true);
    expect(blocksAutomaticReconnect("SSH error: TCP connection failed")).toBe(false);
  });
});