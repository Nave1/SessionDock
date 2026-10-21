import { beforeEach, describe, expect, it, vi } from "vitest";
import { setSessionGroupMembers } from "../api/commands";

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("../api/native", () => ({ nativeInvoke: mocks.invoke }));

describe("session group commands", () => {
  beforeEach(() => mocks.invoke.mockReset());

  it("serializes nested membership request fields for Tauri", async () => {
    mocks.invoke.mockResolvedValue({});

    await setSessionGroupMembers("group-1", ["session-1", "session-2"]);

    expect(mocks.invoke).toHaveBeenCalledWith("set_session_group_members", {
      request: {
        group_id: "group-1",
        session_ids: ["session-1", "session-2"],
      },
    });
  });
});