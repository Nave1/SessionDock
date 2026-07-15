import { create } from "zustand";

export type ThemeMode = "dark" | "light" | "system";

interface ThemeState {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  mode: "dark",
  setMode: (mode) => {
    set({ mode });
    applyTheme(mode);
  },
}));

function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  const isDark = mode === "dark" || (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);

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

// Listen for system theme changes
if (typeof window !== "undefined") {
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    const { mode } = useThemeStore.getState();
    if (mode === "system") applyTheme("system");
  });
}
