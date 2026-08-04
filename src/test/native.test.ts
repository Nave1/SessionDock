import { afterEach, describe, expect, it, vi } from "vitest";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { NATIVE_RUNTIME_REQUIRED, nativeInvoke } from "../api/native";

afterEach(() => {
  clearMocks();
  Reflect.deleteProperty(globalThis, "isTauri");
});

describe("native runtime guard", () => {
  it("returns an actionable error in browser preview", () => {
    expect(() => nativeInvoke("get_sessions")).toThrow(NATIVE_RUNTIME_REQUIRED);
  });

  it("delegates to Tauri IPC in the desktop runtime", async () => {
    Object.defineProperty(globalThis, "isTauri", { value: true, configurable: true });
    const handler = vi.fn(() => [{ id: "session-1" }]);
    mockIPC(handler);

    await expect(nativeInvoke("get_sessions", { folderId: null }))
      .resolves.toEqual([{ id: "session-1" }]);
    expect(handler).toHaveBeenCalledWith("get_sessions", { folderId: null });
  });
});