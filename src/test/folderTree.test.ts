import { describe, expect, it } from "vitest";
import { canMoveFolder } from "../utils/folderTree";
import type { Folder } from "../types";

const folder = (id: string, parent_id?: string): Folder => ({
  id,
  name: id,
  parent_id,
  sort_order: 0,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
});

describe("folder nesting", () => {
  const folders = [folder("root"), folder("child", "root"), folder("grandchild", "child"), folder("other")];

  it("allows moving a folder into an unrelated folder", () => {
    expect(canMoveFolder(folders, "child", "other")).toBe(true);
  });

  it("prevents moving a folder into itself", () => {
    expect(canMoveFolder(folders, "child", "child")).toBe(false);
  });

  it("prevents moving a folder into its descendant", () => {
    expect(canMoveFolder(folders, "root", "grandchild")).toBe(false);
  });
});