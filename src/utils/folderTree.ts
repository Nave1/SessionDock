import type { Folder } from "../types";

let activeFolderDragId: string | null = null;
let activeSessionDragId: string | null = null;
let suppressSessionClick = false;

export function setActiveFolderDrag(id: string | null): void {
  activeFolderDragId = id;
}

export function getActiveFolderDrag(): string | null {
  return activeFolderDragId;
}

export function setActiveSessionDrag(id: string | null): void {
  activeSessionDragId = id;
}

export function getActiveSessionDrag(): string | null {
  return activeSessionDragId;
}

export function beginSessionPointerDrag(event: PointerEvent, sessionId: string): void {
  if (event.button !== 0) return;

  const startX = event.clientX;
  const startY = event.clientY;
  let moved = false;
  let highlightedTarget: HTMLElement | null = null;

  const clearHighlight = () => {
    highlightedTarget?.removeAttribute("data-session-drag-active");
    highlightedTarget = null;
  };

  const findTarget = (x: number, y: number) => document
    .elementFromPoint(x, y)
    ?.closest<HTMLElement>("[data-folder-id], [data-session-unfiled]") ?? null;

  const handlePointerMove = (pointerEvent: PointerEvent) => {
    if (!moved && Math.hypot(pointerEvent.clientX - startX, pointerEvent.clientY - startY) < 5) return;
    moved = true;
    activeSessionDragId = sessionId;
    pointerEvent.preventDefault();

    const target = findTarget(pointerEvent.clientX, pointerEvent.clientY);
    if (target === highlightedTarget) return;
    clearHighlight();
    highlightedTarget = target;
    highlightedTarget?.setAttribute("data-session-drag-active", "true");
  };

  const handlePointerUp = (pointerEvent: PointerEvent) => {
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", handlePointerUp);
    window.removeEventListener("pointercancel", handlePointerCancel);

    const target = findTarget(pointerEvent.clientX, pointerEvent.clientY);
    clearHighlight();
    activeSessionDragId = null;
    if (!moved || !target) return;

    suppressSessionClick = true;
    window.setTimeout(() => { suppressSessionClick = false; }, 0);
    window.dispatchEvent(new CustomEvent("sessiondock:move-session", {
      detail: {
        sessionId,
        folderId: target.hasAttribute("data-session-unfiled") ? undefined : target.dataset.folderId,
      },
    }));
  };

  const handlePointerCancel = () => {
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", handlePointerUp);
    window.removeEventListener("pointercancel", handlePointerCancel);
    clearHighlight();
    activeSessionDragId = null;
  };

  window.addEventListener("pointermove", handlePointerMove, { passive: false });
  window.addEventListener("pointerup", handlePointerUp);
  window.addEventListener("pointercancel", handlePointerCancel);
}

export function shouldSuppressSessionClick(): boolean {
  return suppressSessionClick;
}

export function canMoveFolder(folders: Folder[], folderId: string, targetId: string): boolean {
  if (folderId === targetId) return false;

  let current = folders.find((folder) => folder.id === targetId);
  const visited = new Set<string>();
  while (current?.parent_id && !visited.has(current.id)) {
    if (current.parent_id === folderId) return false;
    visited.add(current.id);
    current = folders.find((folder) => folder.id === current?.parent_id);
  }
  return true;
}