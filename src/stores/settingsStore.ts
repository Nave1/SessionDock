import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SettingsState {
  // General
  confirmCloseActive: boolean;
  startMinimized: boolean;
  defaultProtocol: string;
  defaultSshPort: number;
  defaultTelnetPort: number;
  language: string;

  // Terminal
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  cursorStyle: string;
  cursorBlink: boolean;
  scrollbackLines: number;
  copyOnSelect: boolean;
  bellMode: string;
  semanticTerminalColors: boolean;

  // SSH
  sshKeepalive: number;

  // Appearance
  animations: boolean;
  reducedMotion: boolean;

  // Actions
  updateSetting: <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      // General defaults
      confirmCloseActive: true,
      startMinimized: false,
      defaultProtocol: "SSH",
      defaultSshPort: 22,
      defaultTelnetPort: 23,
      language: "English",

      // Terminal defaults
      fontFamily: "JetBrains Mono, Cascadia Code, Consolas, monospace",
      fontSize: 14,
      lineHeight: 1.2,
      cursorStyle: "Block",
      cursorBlink: true,
      scrollbackLines: 10000,
      copyOnSelect: false,
      bellMode: "None",
      semanticTerminalColors: true,

      // SSH defaults
      sshKeepalive: 60,

      // Appearance defaults
      animations: true,
      reducedMotion: false,

      updateSetting: (key, value) =>
        set((state) => ({ ...state, [key]: value })),
    }),
    {
      name: "sessiondock-settings",
    }
  )
);
