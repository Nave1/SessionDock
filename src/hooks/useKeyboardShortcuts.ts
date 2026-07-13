import { useEffect } from "react";

interface ShortcutHandlers {
  onCommandPalette: () => void;
}

export function useKeyboardShortcuts({ onCommandPalette }: ShortcutHandlers) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMod = e.ctrlKey || e.metaKey;

      // Command palette: Ctrl/Cmd + K
      if (isMod && e.key === "k") {
        e.preventDefault();
        onCommandPalette();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onCommandPalette]);
}
