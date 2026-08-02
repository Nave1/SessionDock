import type { Folder } from "../types";

let activeFolderDragId: string | null = null;

export function setActiveFolderDrag(id: string | null): void {
  activeFolderDragId = id;
}

export function getActiveFolderDrag(): string | null {
  return activeFolderDragId;
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