export const LOCAL_FILE_DRAG_TYPE = "application/sessiondock-local-file";
export const REMOTE_FILE_DRAG_TYPE = "application/sessiondock-remote-file";

export interface FileDragPayload {
  name: string;
  path: string;
}

const MAX_DRAG_PAYLOAD_LENGTH = 33_024;
const INTERNAL_DRAG_SENTINEL = "SessionDock internal file transfer";
let activeFileDrag: { type: string; payload: FileDragPayload } | undefined;

function isValidFileDragPayload(payload: Partial<FileDragPayload>): payload is FileDragPayload {
  return typeof payload.name === "string"
    && payload.name.length > 0
    && payload.name.length <= 255
    && typeof payload.path === "string"
    && payload.path.length > 0
    && payload.path.length <= 32_768
    && !payload.path.includes("\0");
}

export function hasFileDragType(dataTransfer: DataTransfer, type: string): boolean {
  return Array.from(dataTransfer.types ?? []).includes(type) || activeFileDrag?.type === type;
}

export function setFileDragPayload(dataTransfer: DataTransfer, type: string, payload: FileDragPayload): void {
  const serialized = JSON.stringify(payload);
  if (!isValidFileDragPayload(payload) || serialized.length > MAX_DRAG_PAYLOAD_LENGTH) {
    activeFileDrag = undefined;
    return;
  }
  activeFileDrag = { type, payload: { ...payload } };
  dataTransfer.effectAllowed = "copy";
  dataTransfer.setData("text/plain", INTERNAL_DRAG_SENTINEL);
  try {
    dataTransfer.setData(type, serialized);
  } catch {
    return;
  }
}

export function clearFileDragPayload(): void {
  activeFileDrag = undefined;
}

export function readFileDragPayload(dataTransfer: DataTransfer, type: string): FileDragPayload | undefined {
  let raw = "";
  try {
    raw = dataTransfer.getData(type);
  } catch {
    raw = "";
  }
  if (!raw) return activeFileDrag?.type === type ? { ...activeFileDrag.payload } : undefined;
  if (raw.length > MAX_DRAG_PAYLOAD_LENGTH) return undefined;
  try {
    const payload = JSON.parse(raw) as Partial<FileDragPayload>;
    if (!isValidFileDragPayload(payload)) return undefined;
    return { name: payload.name, path: payload.path };
  } catch {
    return activeFileDrag?.type === type ? { ...activeFileDrag.payload } : undefined;
  }
}