import { describe, expect, it, vi } from "vitest";
import { clearFileDragPayload, hasFileDragType, LOCAL_FILE_DRAG_TYPE, readFileDragPayload, REMOTE_FILE_DRAG_TYPE, setFileDragPayload } from "../utils/fileDrag";

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

  it("recognizes and clears an internal drag when WebView2 hides its MIME types", () => {
    const dataTransfer = {
      types: [],
      effectAllowed: "none",
      setData: vi.fn(),
    } as unknown as DataTransfer;

    setFileDragPayload(dataTransfer, LOCAL_FILE_DRAG_TYPE, { name: "switch.cfg", path: "C:\\configs\\switch.cfg" });

    expect(hasFileDragType(dataTransfer, LOCAL_FILE_DRAG_TYPE)).toBe(true);
    expect(hasFileDragType(dataTransfer, REMOTE_FILE_DRAG_TYPE)).toBe(false);
    clearFileDragPayload();
    expect(hasFileDragType(dataTransfer, LOCAL_FILE_DRAG_TYPE)).toBe(false);
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