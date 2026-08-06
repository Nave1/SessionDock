import { describe, expect, it } from "vitest";
import {
  closeTerminalPane,
  countTerminalPanes,
  findFirstTerminalPane,
  splitTerminalPane,
  type TerminalPaneNode,
} from "../stores/appStore";

const root: TerminalPaneNode = { type: "pane", id: "root" };

describe("terminal pane layout", () => {
  it("splits a pane in the requested direction", () => {
    const layout = splitTerminalPane(root, "root", "horizontal", "second", "split-1");

    expect(layout).toEqual({
      type: "split",
      id: "split-1",
      direction: "horizontal",
      children: [root, { type: "pane", id: "second" }],
    });
    expect(countTerminalPanes(layout)).toBe(2);
  });

  it("supports nested layouts up to the store-enforced pane limit", () => {
    const two = splitTerminalPane(root, "root", "horizontal", "second", "split-1");
    const three = splitTerminalPane(two, "second", "vertical", "third", "split-2");
    const four = splitTerminalPane(three, "third", "horizontal", "fourth", "split-3");

    expect(countTerminalPanes(four)).toBe(4);
    expect(findFirstTerminalPane(four)).toBe("root");
  });

  it("collapses a split when one pane closes", () => {
    const layout = splitTerminalPane(root, "root", "horizontal", "second", "split-1");

    expect(closeTerminalPane(layout, "root")).toEqual({ type: "pane", id: "second" });
    expect(closeTerminalPane(root, "root")).toBeNull();
  });
});