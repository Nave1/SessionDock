export type SftpEntryKind = "directory" | "file" | "symlink";

export interface SftpEntry {
  name: string;
  path: string;
  kind: SftpEntryKind;
  size?: number;
  modifiedAt?: number;
  permissions?: number;
}

export type SftpSortKey = "name" | "size" | "modified";

export function joinRemotePath(parent: string, name: string): string {
  const cleanName = name.replace(/^\/+/, "");
  return parent === "/" ? `/${cleanName}` : `${parent.replace(/\/$/, "")}/${cleanName}`;
}

export function parentRemotePath(path: string): string {
  if (path === "/") return "/";
  const components = path.split("/").filter(Boolean);
  components.pop();
  return components.length === 0 ? "/" : `/${components.join("/")}`;
}

export function sortSftpEntries(entries: SftpEntry[], key: SftpSortKey): SftpEntry[] {
  return [...entries].sort((left, right) => {
    const directoryOrder = Number(right.kind === "directory") - Number(left.kind === "directory");
    if (directoryOrder !== 0) return directoryOrder;
    if (key === "size") return (left.size ?? 0) - (right.size ?? 0) || left.name.localeCompare(right.name);
    if (key === "modified") return (right.modifiedAt ?? 0) - (left.modifiedAt ?? 0) || left.name.localeCompare(right.name);
    return left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
  });
}

export function formatTransferSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}
