export const LOCAL_FILE_DRAG_TYPE = "application/sessiondock-local-file";
export const REMOTE_FILE_DRAG_TYPE = "application/sessiondock-remote-file";

export interface FileDragPayload {
  name: string;
  path: string;
}

const MAX_DRAG_PAYLOAD_LENGTH = 33_024;
let activeFileDragType: string | undefined;

export function hasFileDragType(dataTransfer: DataTransfer, type: string): boolean {
  return Array.from(dataTransfer.types ?? []).includes(type) || activeFileDragType === type;
}

export function setFileDragPayload(dataTransfer: DataTransfer, type: string, payload: FileDragPayload): void {
  activeFileDragType = type;
  dataTransfer.effectAllowed = "copy";
  dataTransfer.setData(type, JSON.stringify(payload));
}

export function clearFileDragPayload(): void {
  activeFileDragType = undefined;
}

export function readFileDragPayload(dataTransfer: DataTransfer, type: string): FileDragPayload | undefined {
  const raw = dataTransfer.getData(type);
  if (!raw || raw.length > MAX_DRAG_PAYLOAD_LENGTH) return undefined;
  try {
    const payload = JSON.parse(raw) as Partial<FileDragPayload>;
    if (typeof payload.name !== "string" || !payload.name || payload.name.length > 255) return undefined;
    if (typeof payload.path !== "string" || !payload.path || payload.path.length > 32_768 || payload.path.includes("\0")) return undefined;
    return { name: payload.name, path: payload.path };
  } catch {
    return undefined;
  }
}