export type TerminalShortcutAction = "search" | "copy" | "paste" | "disconnect";

interface TerminalKeyEvent {
  type: string;
  key: string;
  ctrlKey: boolean;
}

export function getTerminalShortcutAction(
  event: TerminalKeyEvent,
  hasSelection: boolean,
): TerminalShortcutAction | null {
  if (event.type !== "keydown" || !event.ctrlKey) return null;

  switch (event.key.toLowerCase()) {
    case "f":
      return "search";
    case "c":
      return hasSelection ? "copy" : null;
    case "v":
      return "paste";
    case "q":
      return "disconnect";
    default:
      return null;
  }
}

export function getTerminalContextMenuAction(hasSelection: boolean): "copy" | "paste" {
  return hasSelection ? "copy" : "paste";
}