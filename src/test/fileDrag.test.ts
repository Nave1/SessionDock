import { describe, expect, it, vi } from "vitest";
import { LOCAL_FILE_DRAG_TYPE, readFileDragPayload, setFileDragPayload } from "../utils/fileDrag";

describe("file drag payloads", () => {
  it("round-trips a bounded internal file payload", () => {
    const values = new Map<string, string>();
    const dataTransfer = {
      effectAllowed: "none",
      setData: (type: string, value: string) => values.set(type, value),
      getData: (type: string) => values.get(type) ?? "",
    } as unknown as DataTransfer;

    setFileDragPayload(dataTransfer, LOCAL_FILE_DRAG_TYPE, { name: "switch.cfg", path: "C:\\configs\\switch.cfg" });

    expect(dataTransfer.effectAllowed).toBe("copy");
    expect(readFileDragPayload(dataTransfer, LOCAL_FILE_DRAG_TYPE)).toEqual({
      name: "switch.cfg",
      path: "C:\\configs\\switch.cfg",
    });
  });

  it("rejects malformed and oversized payloads", () => {
    const getData = vi.fn()
      .mockReturnValueOnce("not-json")
      .mockReturnValueOnce(JSON.stringify({ name: "", path: "/tmp/file" }))
      .mockReturnValueOnce("x".repeat(33_025));
    const dataTransfer = { getData } as unknown as DataTransfer;

    expect(readFileDragPayload(dataTransfer, LOCAL_FILE_DRAG_TYPE)).toBeUndefined();
    expect(readFileDragPayload(dataTransfer, LOCAL_FILE_DRAG_TYPE)).toBeUndefined();
    expect(readFileDragPayload(dataTransfer, LOCAL_FILE_DRAG_TYPE)).toBeUndefined();
  });
});