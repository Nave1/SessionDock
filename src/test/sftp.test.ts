import { describe, expect, it } from "vitest";
import { joinRemotePath, parentRemotePath, sortSftpEntries, type SftpEntry } from "../utils/sftp";

const entries: SftpEntry[] = [
  { name: "z.log", path: "/z.log", kind: "file", size: 2, modifiedAt: 20 },
  { name: "apps", path: "/apps", kind: "directory", modifiedAt: 10 },
  { name: "a.log", path: "/a.log", kind: "file", size: 8, modifiedAt: 30 },
];

describe("SFTP navigation", () => {
  it("joins and ascends POSIX remote paths", () => {
    expect(joinRemotePath("/", "home")).toBe("/home");
    expect(joinRemotePath("/srv", "logs")).toBe("/srv/logs");
    expect(parentRemotePath("/srv/logs")).toBe("/srv");
    expect(parentRemotePath("/srv")).toBe("/");
    expect(parentRemotePath("/")).toBe("/");
  });

  it("keeps directories first for every sort mode", () => {
    expect(sortSftpEntries(entries, "name").map((entry) => entry.name)).toEqual(["apps", "a.log", "z.log"]);
    expect(sortSftpEntries(entries, "size").map((entry) => entry.name)).toEqual(["apps", "z.log", "a.log"]);
    expect(sortSftpEntries(entries, "modified").map((entry) => entry.name)).toEqual(["apps", "a.log", "z.log"]);
  });
});
