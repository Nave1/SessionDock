import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SettingsState {
  // General
  restoreTabs: boolean;
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
  sshTimeout: number;
  sshKeepalive: number;
  defaultAuthMethod: string;
  verifyHostKeys: boolean;
  warnChangedHostKeys: boolean;
  useSshAgent: boolean;
  sshAgentType: string;

  // Appearance
  uiDensity: string;
  animations: boolean;
  reducedMotion: boolean;
  accentColor: string;

  // Actions
  updateSetting: <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      // General defaults
      restoreTabs: true,
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
      sshTimeout: 30,
      sshKeepalive: 60,
      defaultAuthMethod: "Password",
      verifyHostKeys: true,
      warnChangedHostKeys: true,
      useSshAgent: true,
      sshAgentType: "Auto-detect",

      // Appearance defaults
      uiDensity: "Compact",
      animations: true,
      reducedMotion: false,
      accentColor: "Blue",

      updateSetting: (key, value) =>
        set((state) => ({ ...state, [key]: value })),
    }),
    {
      name: "sessiondock-settings",
    }
  )
);
