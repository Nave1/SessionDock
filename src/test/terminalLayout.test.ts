import { describe, expect, it, vi } from "vitest";
import { fitTerminalWhenVisible } from "../utils/terminalLayout";

describe("fitTerminalWhenVisible", () => {
  it("defers fitting until the terminal container has layout dimensions", () => {
    const container = { clientWidth: 0, clientHeight: 0 };
    const fit = vi.fn();

    expect(fitTerminalWhenVisible(container, fit)).toBe(false);
    expect(fit).not.toHaveBeenCalled();

    container.clientWidth = 960;
    container.clientHeight = 540;

    expect(fitTerminalWhenVisible(container, fit)).toBe(true);
    expect(fit).toHaveBeenCalledOnce();
  });
});