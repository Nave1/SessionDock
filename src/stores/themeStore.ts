import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemeMode = "dark" | "light" | "system";
export type AccentColor = "Blue" | "Cyan" | "Green" | "Purple" | "Orange";

const accentColors: Record<AccentColor, { accent: string; hover: string }> = {
  Blue: { accent: "#5b8af5", hover: "#7aa2f7" },
  Cyan: { accent: "#7dcfff", hover: "#89ddff" },
  Green: { accent: "#73daca", hover: "#95e6d3" },
  Purple: { accent: "#bb9af7", hover: "#c9abf7" },
  Orange: { accent: "#ff9e64", hover: "#ffb07a" },
};

interface ThemeState {
  mode: ThemeMode;
  accent: AccentColor;
  setMode: (mode: ThemeMode) => void;
  setAccent: (accent: AccentColor) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      mode: "dark",
      accent: "Blue",
      setMode: (mode) => {
        set({ mode });
        applyTheme(mode, useThemeStore.getState().accent);
      },
      setAccent: (accent) => {
        set({ accent });
        applyTheme(useThemeStore.getState().mode, accent);
      },
    }),
    { name: "sessiondock-theme" }
  )
);

function applyTheme(mode: ThemeMode, accent: AccentColor) {
  const root = document.documentElement;
  const isDark = mode === "dark" || (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const colors = accentColors[accent];

  root.style.setProperty("--color-dock-accent", colors.accent);
  root.style.setProperty("--color-dock-accent-hover", colors.hover);

  if (isDark) {
    root.classList.add("dark");
    root.classList.remove("light");
    root.style.setProperty("--color-dock-bg", "#0f0f14");
    root.style.setProperty("--color-dock-sidebar", "#16161e");
    root.style.setProperty("--color-dock-surface", "#1a1a24");
    root.style.setProperty("--color-dock-border", "#2a2a3a");
    root.style.setProperty("--color-dock-text", "#e4e4ef");
    root.style.setProperty("--color-dock-text-muted", "#8888a0");
  } else {
    root.classList.remove("dark");
    root.classList.add("light");
    root.style.setProperty("--color-dock-bg", "#f8f9fa");
    root.style.setProperty("--color-dock-sidebar", "#ffffff");
    root.style.setProperty("--color-dock-surface", "#f0f1f3");
    root.style.setProperty("--color-dock-border", "#e0e2e6");
    root.style.setProperty("--color-dock-text", "#1a1a2e");
    root.style.setProperty("--color-dock-text-muted", "#6b7080");
  }
}

// Apply theme on load
if (typeof window !== "undefined") {
  setTimeout(() => {
    const { mode, accent } = useThemeStore.getState();
    applyTheme(mode, accent);
  }, 0);

  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    const { mode, accent } = useThemeStore.getState();
    if (mode === "system") applyTheme("system", accent);
  });
}
