import { useEffect, useRef, useCallback, useState } from "react";
import { Terminal as XTerm, type IDecoration, type IMarker } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { nativeInvoke } from "../../api/native";
import { listen } from "@tauri-apps/api/event";
import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Search, RotateCw, Trash2, Copy, ClipboardPaste, X, ChevronUp, ChevronDown, Columns2, Rows2, FolderOpen, Network, Code2, Cpu, ListChecks } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSettingsStore } from "../../stores/settingsStore";
import { useAppStore, type TerminalAuxiliaryPanel, type TerminalTransferProtocol } from "../../stores/appStore";
import { useTransferEvents } from "../../hooks/useTransferEvents";
import { useTunnelEvents } from "../../hooks/useTunnelEvents";
import { useDiagnosticEvents } from "../../hooks/useDiagnosticEvents";
import { findTerminalHighlights } from "../../utils/terminalHighlight";
import { getTerminalContextMenuAction, getTerminalShortcutAction } from "../../utils/terminalInteraction";
import { fitTerminalWhenVisible } from "../../utils/terminalLayout";
import { shouldPromptForPassword, type SshAuthenticationMethod } from "../../utils/sshAuthentication";
import { blocksAutomaticReconnect, reconnectDelayMs, RECONNECT_STABLE_RESET_MS } from "../../utils/reconnectPolicy";
import type { ReconnectMode } from "../../types";
import { SftpPanel } from "./SftpPanel";
import { TunnelPanel } from "./TunnelPanel";
import { SnippetPanel } from "./SnippetPanel";
import { DeviceInfoPanel } from "./DeviceInfoPanel";
import { MultiExecPanel } from "./MultiExecPanel";
import { TerminalLoggingControl } from "./TerminalLoggingControl";
import type { DeviceContext } from "../../device/providers";
import "@xterm/xterm/css/xterm.css";

interface SemanticDecorationLine {
  marker: IMarker;
  signature: string;
  decorations: IDecoration[];
}

interface SshHostKeyInspection {
  host: string;
  address: string;
  port: number;
  key_type: string;
  fingerprint: string;
  verification:
    | { status: "trusted" }
    | { status: "unknown"; fingerprint: string; key_type: string }
    | {
        status: "changed";
        old_fingerprint: string;
        old_key_type: string;
        new_fingerprint: string;
        new_key_type: string;
      };
}

function clearSemanticDecorations(lines: SemanticDecorationLine[]) {
  for (const line of lines.splice(0)) {
    for (const decoration of line.decorations) decoration.dispose();
    line.marker.dispose();
  }
}

function refreshSemanticDecorations(term: XTerm, lines: SemanticDecorationLine[]) {
  const buffer = term.buffer.active;
  if (buffer.type !== "normal") return;

  const cursorLine = buffer.baseY + buffer.cursorY;
  const firstLine = Math.max(0, cursorLine - term.rows - 2);

  for (let lineIndex = firstLine; lineIndex <= cursorLine; lineIndex++) {
    const bufferLine = buffer.getLine(lineIndex);
    if (!bufferLine) continue;

    const text = bufferLine.translateToString(true);
    const existingIndex = lines.findIndex((line) => line.marker.line === lineIndex);
    const existing = existingIndex >= 0 ? lines[existingIndex] : undefined;
    if (existing?.signature === text) continue;

    if (existing) {
      for (const decoration of existing.decorations) decoration.dispose();
      existing.marker.dispose();
      lines.splice(existingIndex, 1);
    }

    const highlights = findTerminalHighlights(text).filter(({ start, length }) => {
      for (let column = start; column < start + length; column++) {
        if (!bufferLine.getCell(column)?.isFgDefault()) return false;
      }
      return true;
    });
    if (highlights.length === 0) continue;

    const marker = term.registerMarker(lineIndex - cursorLine);
    if (!marker) continue;

    const decorations = highlights.flatMap(({ start, length, color }) => {
      const decoration = term.registerDecoration({
        marker,
        x: start,
        width: length,
        foregroundColor: color,
        layer: "top",
      });
      return decoration ? [decoration] : [];
    });
    if (decorations.length > 0) lines.push({ marker, signature: text, decorations });
    else marker.dispose();
  }

  for (let index = lines.length - 1; index >= 0; index--) {
    if (lines[index].marker.isDisposed) lines.splice(index, 1);
  }
  while (lines.length > 2000) {
    const oldest = lines.shift();
    if (!oldest) break;
    for (const decoration of oldest.decorations) decoration.dispose();
    oldest.marker.dispose();
  }
}

/**
 * Prompt the user for input inside the xterm.js terminal.
 * If masked=true, input is hidden (for passwords).
 * Returns the entered string, or empty string if cancelled (Escape/Ctrl+C).
 */
function promptInTerminal(term: XTerm, prompt: string, masked: boolean): Promise<string> {
  return new Promise((resolve) => {
    let input = "";
    term.write(prompt);

    const disposable = term.onData((data) => {
      const code = data.charCodeAt(0);

      if (data === "\r" || data === "\n") {
        // Enter — submit
        term.writeln("");
        disposable.dispose();
        resolve(input);
      } else if (data === "\x7f" || data === "\b") {
        // Backspace
        if (input.length > 0) {
          input = input.slice(0, -1);
          term.write("\b \b");
        }
      } else if (data === "\x03" || data === "\x1b") {
        // Ctrl+C or Escape — cancel
        term.writeln("");
        disposable.dispose();
        resolve("");
      } else if (code >= 32) {
        // Printable character
        input += data;
        if (masked) {
          term.write("*");
        } else {
          term.write(data);
        }
      }
    });
  });
}

interface TerminalViewProps {
  tabId: string;
  statusTabId?: string;
  host: string;
  port: number;
  protocol: string;
  username?: string;
  password?: string;
  authenticationMethod?: SshAuthenticationMethod;
  credentialProfileId?: string;
  privateKeyReference?: string;
  jumpHostIds?: string[];
  serialBaudRate?: number;
  keepaliveInterval?: number;
  reconnectMode?: ReconnectMode;
  canSplit?: boolean;
  canClosePane?: boolean;
  onSplitRight?: () => void;
  onSplitDown?: () => void;
  onClosePane?: () => void;
  reconnectToken?: number;
  disconnectToken?: number;
  deviceContext?: DeviceContext;
  initialAuxiliaryPanel?: TerminalAuxiliaryPanel;
  initialTransferProtocol?: TerminalTransferProtocol;
  requestedAuxiliaryPanel?: TerminalAuxiliaryPanel;
  requestedTransferProtocol?: TerminalTransferProtocol;
  toolRequestToken?: number;
}

export function TerminalView({
  tabId,
  statusTabId = tabId,
  host,
  port,
  protocol,
  username,
  password,
  authenticationMethod = "password",
  credentialProfileId,
  privateKeyReference,
  jumpHostIds = [],
  serialBaudRate = 9600,
  keepaliveInterval = 60,
  reconnectMode = "disabled",
  canSplit = true,
  canClosePane = false,
  onSplitRight,
  onSplitDown,
  onClosePane,
  reconnectToken,
  disconnectToken,
  deviceContext = {},
  initialAuxiliaryPanel,
  initialTransferProtocol,
  requestedAuxiliaryPanel,
  requestedTransferProtocol,
  toolRequestToken,
}: TerminalViewProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const connectedRef = useRef(false);
  const connectionStateRef = useRef<"connecting" | "connected" | "disconnected">("connecting");
  const reconnectTimerRef = useRef<number | null>(null);
  const stableConnectionTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectInProgressRef = useRef(false);
  const reconnectBlockedRef = useRef(false);
  const explicitDisconnectRef = useRef(false);
  const hasConnectedRef = useRef(false);
  const scheduleReconnectRef = useRef<() => void>(() => {});
  const lastReconnectTokenRef = useRef(reconnectToken);
  const lastDisconnectTokenRef = useRef(disconnectToken);
  const updatePaneStatus = useAppStore((state) => state.updatePaneStatus);
  useTransferEvents(tabId, protocol === "ssh");
  useTunnelEvents(tabId, protocol === "ssh");
  useDiagnosticEvents(tabId, protocol === "ssh");
  const [searchOpen, setSearchOpen] = useState(false);
  const [paneConnected, setPaneConnected] = useState(false);
  const [auxiliaryPanel, setAuxiliaryPanel] = useState<TerminalAuxiliaryPanel | null>(initialAuxiliaryPanel ?? null);
  const [searchQuery, setSearchQuery] = useState("");
  const [terminalLogRevision, setTerminalLogRevision] = useState(0);
  const [scheduledReconnect, setScheduledReconnect] = useState<{ attempt: number; seconds: number } | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (toolRequestToken && requestedAuxiliaryPanel) setAuxiliaryPanel(requestedAuxiliaryPanel);
  }, [requestedAuxiliaryPanel, toolRequestToken]);

  const clearReconnectTimers = useCallback(() => {
    if (reconnectTimerRef.current !== null) window.clearTimeout(reconnectTimerRef.current);
    if (stableConnectionTimerRef.current !== null) window.clearTimeout(stableConnectionTimerRef.current);
    reconnectTimerRef.current = null;
    stableConnectionTimerRef.current = null;
    setScheduledReconnect(null);
  }, []);

  const connectToHost = useCallback(async () => {
    if (connectedRef.current) return;
    connectedRef.current = true;
    connectionStateRef.current = "connecting";
    updatePaneStatus(statusTabId, tabId, "connecting");

    const term = terminalRef.current;
    if (!term) return;

    const endpoint = protocol === "serial" ? `${host} at ${serialBaudRate.toLocaleString()} bps` : `${host}:${port}`;
    term.writeln(`\x1b[38;2;251;191;36mConnecting\x1b[39m to \x1b[38;2;209;109;255m${endpoint}\x1b[39m via ${protocol.toUpperCase()}...`);
    term.writeln("");

    let finalUsername = username || "";
    let finalPassword = password || "";

    if (protocol === "ssh") {
      try {
        while (true) {
          const inspection = await nativeInvoke<SshHostKeyInspection>("inspect_ssh_host_key", {
            host,
            port,
            jumpHostIds,
          });
          if (inspection.verification.status === "changed") {
            reconnectBlockedRef.current = true;
            const changed = inspection.verification;
            term.writeln("\x1b[38;2;248;113;113mHOST KEY CHANGED - connection blocked.\x1b[39m");
            term.writeln(`Host: ${inspection.host}:${inspection.port} (${inspection.address})`);
            term.writeln(`Previous: ${changed.old_key_type} ${changed.old_fingerprint}`);
            term.writeln(`Presented: ${changed.new_key_type} ${changed.new_fingerprint}`);
            term.writeln("Verify the server identity and remove the trusted key from Settings before reconnecting.");
            connectedRef.current = false;
            connectionStateRef.current = "disconnected";
            updatePaneStatus(statusTabId, tabId, "host_key_warning");
            return;
          }
          if (inspection.verification.status === "trusted") break;

          const trusted = window.confirm(
            `Trust this SSH host key?\n\nHost: ${inspection.host}:${inspection.port}\nAddress: ${inspection.address}\nAlgorithm: ${inspection.key_type}\nFingerprint: ${inspection.fingerprint}\n\nConfirm this fingerprint through a trusted channel before continuing.`,
          );
          if (!trusted) {
            reconnectBlockedRef.current = true;
            term.writeln("\x1b[38;2;248;113;113mConnection cancelled: host key was not trusted.\x1b[39m");
            connectedRef.current = false;
            connectionStateRef.current = "disconnected";
            updatePaneStatus(statusTabId, tabId, "host_key_warning");
            return;
          }
          await nativeInvoke("trust_host_key", {
            host: inspection.host,
            port: inspection.port,
            keyType: inspection.key_type,
            fingerprint: inspection.fingerprint,
          });
        }
      } catch (error) {
        term.writeln(`\x1b[38;2;248;113;113mHost-key verification failed: ${error}\x1b[39m`);
        connectedRef.current = false;
        connectionStateRef.current = "disconnected";
        updatePaneStatus(statusTabId, tabId, "host_key_warning");
        return;
      }
    }

    // Prompt for username in terminal if not provided
    if (!finalUsername && protocol === "ssh") {
      finalUsername = await promptInTerminal(term, "Username: ", false);
      if (!finalUsername) {
        term.writeln("\x1b[38;2;248;113;113mConnection cancelled.\x1b[39m");
        connectedRef.current = false;
        return;
      }
    }

    // Prompt for password in terminal if not provided
    if (shouldPromptForPassword(protocol, authenticationMethod, finalPassword, credentialProfileId)) {
      finalPassword = await promptInTerminal(term, "Password: ", true);
      if (!finalPassword) {
        term.writeln("\x1b[38;2;248;113;113mConnection cancelled.\x1b[39m");
        connectedRef.current = false;
        return;
      }
    }

    term.writeln(`\x1b[38;2;251;191;36mAuthenticating...\x1b[39m`);

    try {
      await nativeInvoke("spawn_terminal", {
        request: {
          tabId,
          host,
          port,
          protocol,
          username: finalUsername || null,
          password: finalPassword || null,
          authenticationMethod,
          credentialProfileId: credentialProfileId || null,
          privateKeyReference: privateKeyReference || null,
          jumpHostIds,
          keepaliveSecs: keepaliveInterval,
          serialBaudRate,
        },
      });
      if (protocol === "ssh") {
        await nativeInvoke("resize_terminal", {
          tabId,
          cols: term.cols,
          rows: term.rows,
        });
      }
      term.focus();
    } catch (err) {
      if (blocksAutomaticReconnect(err)) reconnectBlockedRef.current = true;
      term.writeln(`\x1b[38;2;248;113;113mConnection failed: ${err}\x1b[39m`);
      connectedRef.current = false;
      connectionStateRef.current = "disconnected";
      updatePaneStatus(statusTabId, tabId, "error");
    }
  }, [tabId, statusTabId, host, port, protocol, username, password, authenticationMethod, credentialProfileId, privateKeyReference, jumpHostIds, serialBaudRate, keepaliveInterval, updatePaneStatus]);

  const performReconnect = useCallback(async (manual: boolean) => {
    const term = terminalRef.current;
    if (!term) return;
    clearReconnectTimers();
    explicitDisconnectRef.current = false;
    if (manual) {
      reconnectAttemptRef.current = 0;
      reconnectBlockedRef.current = false;
    }
    reconnectInProgressRef.current = true;
    connectedRef.current = false;
    connectionStateRef.current = "connecting";
    updatePaneStatus(statusTabId, tabId, "reconnecting");
    try {
      await nativeInvoke("close_terminal", { tabId, protocol });
      setTerminalLogRevision((revision) => revision + 1);
    } catch { /* ignore close errors */ }
    // Wait for connection to fully close before reconnecting
    await new Promise(r => setTimeout(r, 500));
    term.reset();
    term.clear();
    await connectToHost();
    if (!connectedRef.current) {
      reconnectInProgressRef.current = false;
      scheduleReconnectRef.current();
    }
  }, [clearReconnectTimers, connectToHost, protocol, statusTabId, tabId, updatePaneStatus]);

  const scheduleReconnect = useCallback(() => {
    if (explicitDisconnectRef.current || reconnectBlockedRef.current || !hasConnectedRef.current) return;
    if (shouldPromptForPassword(protocol, authenticationMethod, password || "", credentialProfileId)) {
      connectionStateRef.current = "disconnected";
      updatePaneStatus(statusTabId, tabId, "disconnected");
      terminalRef.current?.writeln("Press Enter to reconnect.");
      return;
    }
    if (stableConnectionTimerRef.current !== null) {
      window.clearTimeout(stableConnectionTimerRef.current);
      stableConnectionTimerRef.current = null;
    }
    const attempt = reconnectAttemptRef.current + 1;
    const delay = reconnectDelayMs(reconnectMode, attempt);
    if (delay === null) {
      connectionStateRef.current = "disconnected";
      updatePaneStatus(statusTabId, tabId, "disconnected");
      terminalRef.current?.writeln("Press Enter to reconnect.");
      return;
    }
    reconnectAttemptRef.current = attempt;
    connectionStateRef.current = "connecting";
    updatePaneStatus(statusTabId, tabId, "reconnecting");
    setScheduledReconnect({ attempt, seconds: Math.ceil(delay / 1_000) });
    terminalRef.current?.writeln(t("reconnect.scheduled", {
      attempt,
      seconds: Math.ceil(delay / 1_000),
    }));
    reconnectTimerRef.current = window.setTimeout(() => {
      reconnectTimerRef.current = null;
      setScheduledReconnect(null);
      void performReconnect(false);
    }, delay);
  }, [authenticationMethod, credentialProfileId, password, performReconnect, protocol, reconnectMode, statusTabId, t, tabId, updatePaneStatus]);

  scheduleReconnectRef.current = scheduleReconnect;

  const handleReconnect = useCallback(() => {
    void performReconnect(true);
  }, [performReconnect]);

  useEffect(() => {
    if (reconnectToken === undefined || reconnectToken === lastReconnectTokenRef.current) return;
    lastReconnectTokenRef.current = reconnectToken;
    handleReconnect();
  }, [reconnectToken, handleReconnect]);

  const handleClear = useCallback(() => {
    terminalRef.current?.clear();
  }, []);

  const handleCopy = useCallback(() => {
    const sel = terminalRef.current?.getSelection();
    if (sel) writeText(sel).catch(() => {});
  }, []);

  const handlePaste = useCallback(async () => {
    const text = await readText().catch(() => null);
    if (text) nativeInvoke("write_terminal", { tabId, data: text, protocol }).catch(() => {});
  }, [tabId, protocol]);

  const handleDisconnect = useCallback(async () => {
    if (connectionStateRef.current === "disconnected") return;
    explicitDisconnectRef.current = true;
    clearReconnectTimers();
    await nativeInvoke("close_terminal", { tabId, protocol }).catch(() => {});
    setTerminalLogRevision((revision) => revision + 1);
    reconnectInProgressRef.current = false;
    connectedRef.current = false;
    connectionStateRef.current = "disconnected";
    updatePaneStatus(statusTabId, tabId, "disconnected");
    terminalRef.current?.writeln("Press Enter to reconnect.");
  }, [clearReconnectTimers, protocol, statusTabId, tabId, updatePaneStatus]);

  useEffect(() => {
    if (disconnectToken === undefined || disconnectToken === lastDisconnectTokenRef.current) return;
    lastDisconnectTokenRef.current = disconnectToken;
    void handleDisconnect();
  }, [disconnectToken, handleDisconnect]);

  const cancelReconnect = useCallback(() => {
    explicitDisconnectRef.current = true;
    clearReconnectTimers();
    reconnectInProgressRef.current = false;
    connectedRef.current = false;
    connectionStateRef.current = "disconnected";
    updatePaneStatus(statusTabId, tabId, "disconnected");
    terminalRef.current?.writeln("Press Enter to reconnect.");
  }, [clearReconnectTimers, statusTabId, tabId, updatePaneStatus]);

  // Search functions
  const handleSearchNext = useCallback(() => {
    if (searchQuery && searchAddonRef.current) {
      searchAddonRef.current.findNext(searchQuery);
    }
  }, [searchQuery]);

  const handleSearchPrev = useCallback(() => {
    if (searchQuery && searchAddonRef.current) {
      searchAddonRef.current.findPrevious(searchQuery);
    }
  }, [searchQuery]);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchQuery("");
    searchAddonRef.current?.clearDecorations();
    terminalRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    const terminalSettings = useSettingsStore.getState();

    const terminal = new XTerm({
      theme: {
        background: "#0a0a0f",
        foreground: "#e8e8f0",
        cursor: "#5b8af5",
        cursorAccent: "#0a0a0f",
        selectionBackground: "#5b8af540",
        black: "#16161e",
        red: "#ef4444",
        green: "#4ade80",
        yellow: "#f59e0b",
        blue: "#7aa2f7",
        magenta: "#bb9af7",
        cyan: "#7dcfff",
        white: "#c0caf5",
        brightBlack: "#414868",
        brightRed: "#ef4444",
        brightGreen: "#4ade80",
        brightYellow: "#f59e0b",
        brightBlue: "#7aa2f7",
        brightMagenta: "#bb9af7",
        brightCyan: "#7dcfff",
        brightWhite: "#e8e8f0",
      },
      fontFamily: terminalSettings.fontFamily,
      fontSize: terminalSettings.fontSize,
      lineHeight: terminalSettings.lineHeight,
      cursorBlink: terminalSettings.cursorBlink,
      cursorStyle: terminalSettings.cursorStyle.toLowerCase() as "block" | "underline" | "bar",
      scrollback: terminalSettings.scrollbackLines,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon();
    const webLinksAddon = new WebLinksAddon();

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(searchAddon);
    terminal.loadAddon(webLinksAddon);

    const terminalContainer = containerRef.current;
    terminal.open(terminalContainer);
    fitTerminalWhenVisible(terminalContainer, () => fitAddon.fit());

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;
    searchAddonRef.current = searchAddon;
    const semanticDecorations: SemanticDecorationLine[] = [];

    // CRITICAL: Remote terminal input must be forwarded UNCHANGED.
    // Semantic highlighting must NEVER intercept, modify, delay, or parse this path.
    // No trim, no ANSI injection, no local echo, no command buffering.
    terminal.onData((data) => {
      if (connectionStateRef.current === "disconnected" && (data === "\r" || data === "\n")) {
        handleReconnect();
        return;
      }
      nativeInvoke("write_terminal", { tabId, data, protocol }).catch(() => {});
    });

    const selectionDisposable = terminal.onSelectionChange(() => {
      if (useSettingsStore.getState().copyOnSelect && terminal.hasSelection()) {
        void writeText(terminal.getSelection());
      }
    });

    const bellDisposable = terminal.onBell(() => {
      if (useSettingsStore.getState().bellMode !== "Visual") return;
      terminalContainer.classList.remove("terminal-visual-bell");
      void terminalContainer.offsetWidth;
      terminalContainer.classList.add("terminal-visual-bell");
    });

    const unsubscribeSettings = useSettingsStore.subscribe((settings, previous) => {
      terminal.options.fontFamily = settings.fontFamily;
      terminal.options.fontSize = settings.fontSize;
      terminal.options.lineHeight = settings.lineHeight;
      terminal.options.cursorBlink = settings.cursorBlink;
      terminal.options.cursorStyle = settings.cursorStyle.toLowerCase() as "block" | "underline" | "bar";
      terminal.options.scrollback = settings.scrollbackLines;
      if (settings.fontFamily !== previous.fontFamily || settings.fontSize !== previous.fontSize || settings.lineHeight !== previous.lineHeight) {
        fitTerminalWhenVisible(terminalContainer, () => fitAddon.fit());
      }
    });

    // Preserve Ctrl+C as SIGINT unless text is selected. Local shortcuts are
    // intercepted before xterm forwards them to the remote host.
    terminal.attachCustomKeyEventHandler((e) => {
      const action = getTerminalShortcutAction(e, terminal.hasSelection());
      switch (action) {
        case "search":
          setSearchOpen(true);
          setTimeout(() => searchInputRef.current?.focus(), 50);
          return false;
        case "copy":
          handleCopy();
          return false;
        case "paste":
          handlePaste();
          return false;
        case "disconnect":
          handleDisconnect();
          return false;
        default:
          return true;
      }
    });

    // Always parse the exact remote payload first. Semantic colors are visual
    // cell decorations and never enter xterm's terminal data stream.
    const unlistenData = listen<string>(`terminal-data-${tabId}`, (event) => {
      if (event.payload) {
        const colorsEnabled = useSettingsStore.getState().semanticTerminalColors;
        terminal.write(event.payload, () => {
          if (colorsEnabled) refreshSemanticDecorations(terminal, semanticDecorations);
          else clearSemanticDecorations(semanticDecorations);
        });
      }
    });

    // Listen for status changes
    let disconnectReason = "";
    const unlistenCloseDetail = listen<string>(`terminal-close-detail-${tabId}`, (event) => {
      disconnectReason = event.payload;
    });
    const unlistenStatus = listen<string>(`terminal-status-${tabId}`, (event) => {
      if (event.payload === "connected") {
        reconnectInProgressRef.current = false;
        reconnectBlockedRef.current = false;
        hasConnectedRef.current = true;
        setScheduledReconnect(null);
        connectionStateRef.current = "connected";
        setPaneConnected(true);
        updatePaneStatus(statusTabId, tabId, "connected");
        if (stableConnectionTimerRef.current !== null) window.clearTimeout(stableConnectionTimerRef.current);
        stableConnectionTimerRef.current = window.setTimeout(() => {
          reconnectAttemptRef.current = 0;
          stableConnectionTimerRef.current = null;
        }, RECONNECT_STABLE_RESET_MS);
      }
      if (event.payload === "disconnected") {
        terminal.writeln("");
        const detail = disconnectReason || "The connection ended without a reason from the remote host.";
        terminal.writeln(`\x1b[38;2;251;191;36mConnection closed: ${detail}\x1b[39m`);
        disconnectReason = "";
        connectedRef.current = false;
        connectionStateRef.current = "disconnected";
        setPaneConnected(false);
        if (explicitDisconnectRef.current) {
          updatePaneStatus(statusTabId, tabId, "disconnected");
          terminal.writeln("Press Enter to reconnect.");
        } else if (!reconnectInProgressRef.current) {
          scheduleReconnectRef.current();
        }
      }
    });

    // Resize
    const resizeObserver = new ResizeObserver(() => {
      fitTerminalWhenVisible(terminalContainer, () => fitAddon.fit());
    });
    resizeObserver.observe(terminalContainer);

    terminal.onResize(({ cols, rows }) => {
      if (protocol === "ssh") nativeInvoke("resize_terminal", { tabId, cols, rows }).catch(() => {});
    });

    // Deferring startup lets React Strict Mode cancel its development-only
    // effect replay before an SSH attempt begins on a disposed terminal.
    const connectTimer = window.setTimeout(() => connectToHost(), 0);

    return () => {
      window.clearTimeout(connectTimer);
      explicitDisconnectRef.current = true;
      clearReconnectTimers();
      connectedRef.current = false;
      clearSemanticDecorations(semanticDecorations);
      selectionDisposable.dispose();
      bellDisposable.dispose();
      unsubscribeSettings();
      resizeObserver.disconnect();
      unlistenData.then((fn) => fn());
      unlistenCloseDetail.then((fn) => fn());
      unlistenStatus.then((fn) => fn());
      terminal.dispose();
      nativeInvoke("close_terminal", { tabId, protocol }).catch(() => {});
    };
  }, [tabId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col w-full h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 h-8 overflow-x-auto bg-dock-sidebar border-b border-dock-border flex-shrink-0">
        <ToolbarBtn icon={RotateCw} title="Reconnect" onClick={handleReconnect} />
        {scheduledReconnect && (
          <button
            type="button"
            onClick={cancelReconnect}
            className="flex h-6 items-center gap-1 rounded bg-amber-400/10 px-1.5 text-[10px] font-medium text-amber-300 hover:bg-amber-400/20"
            title={t("reconnect.cancel")}
            aria-label={t("reconnect.cancel")}
          >
            <RotateCw size={10} className="animate-spin" />
            <span>{t("reconnect.scheduled", scheduledReconnect)}</span>
            <X size={10} />
          </button>
        )}
        <ToolbarBtn icon={Columns2} title="Split right" onClick={() => onSplitRight?.()} disabled={!canSplit || !onSplitRight} />
        <ToolbarBtn icon={Rows2} title="Split down" onClick={() => onSplitDown?.()} disabled={!canSplit || !onSplitDown} />
        {canClosePane && onClosePane && <ToolbarBtn icon={X} title="Close pane" onClick={onClosePane} />}
        {protocol === "ssh" && <ToolbarBtn icon={FolderOpen} title={t("sftp.files")} onClick={() => setAuxiliaryPanel((panel) => panel === "files" ? null : "files")} />}
        {protocol === "ssh" && <ToolbarBtn icon={Network} title={t("tunnels.title")} onClick={() => setAuxiliaryPanel((panel) => panel === "tunnels" ? null : "tunnels")} />}
        {protocol === "ssh" && <ToolbarBtn icon={Code2} title={t("snippets.title")} onClick={() => setAuxiliaryPanel((panel) => panel === "snippets" ? null : "snippets")} />}
        {protocol === "ssh" && <ToolbarBtn icon={Cpu} title={t("deviceInfo.title")} onClick={() => setAuxiliaryPanel((panel) => panel === "device" ? null : "device")} />}
        {protocol === "ssh" && <ToolbarBtn icon={ListChecks} title={t("multiExec.title")} onClick={() => setAuxiliaryPanel((panel) => panel === "multiExec" ? null : "multiExec")} />}
        <TerminalLoggingControl key={`${tabId}-${terminalLogRevision}`} tabId={tabId} />
        <ToolbarBtn icon={Search} title="Search (Ctrl+F)" onClick={() => { setSearchOpen(true); setTimeout(() => searchInputRef.current?.focus(), 50); }} />
        <div className="w-px h-4 bg-dock-border mx-1" />
        <ToolbarBtn icon={Copy} title="Copy" onClick={handleCopy} />
        <ToolbarBtn icon={ClipboardPaste} title="Paste" onClick={handlePaste} />
        <ToolbarBtn icon={Trash2} title="Clear" onClick={handleClear} />
      </div>

      {/* Search bar */}
      {searchOpen && (
        <div className="flex items-center gap-2 px-3 h-8 bg-dock-surface border-b border-dock-border flex-shrink-0 animate-fade-in">
          <Search size={12} className="text-dock-text-muted" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); if (e.target.value) searchAddonRef.current?.findNext(e.target.value); }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (e.shiftKey) handleSearchPrev();
                else handleSearchNext();
              }
              if (e.key === "Escape") closeSearch();
            }}
            placeholder="Search terminal..."
            className="flex-1 bg-transparent text-[12px] text-dock-text placeholder-dock-text-muted outline-none"
          />
          <button onClick={handleSearchPrev} className="p-0.5 rounded hover:bg-dock-border text-dock-text-muted" title="Previous"><ChevronUp size={14} /></button>
          <button onClick={handleSearchNext} className="p-0.5 rounded hover:bg-dock-border text-dock-text-muted" title="Next"><ChevronDown size={14} /></button>
          <button onClick={closeSearch} className="p-0.5 rounded hover:bg-dock-border text-dock-text-muted" title="Close"><X size={14} /></button>
        </div>
      )}

      <div className="flex flex-1 min-h-0 min-w-0">
        {/* Terminal */}
        <div
          ref={containerRef}
          className="flex-1 min-w-0 xterm-container"
          data-tab-id={tabId}
          onContextMenu={(e) => {
            e.preventDefault();
            if (getTerminalContextMenuAction(terminalRef.current?.hasSelection() ?? false) === "copy") {
              handleCopy();
            } else {
              handlePaste();
            }
          }}
        />
        {protocol === "ssh" && paneConnected && auxiliaryPanel === "files" && <SftpPanel tabId={tabId} initialTransferProtocol={requestedTransferProtocol ?? initialTransferProtocol} onClose={() => setAuxiliaryPanel(null)} />}
        {protocol === "ssh" && auxiliaryPanel === "tunnels" && <TunnelPanel tabId={tabId} onClose={() => setAuxiliaryPanel(null)} />}
        {protocol === "ssh" && auxiliaryPanel === "snippets" && <SnippetPanel tabId={tabId} onClose={() => setAuxiliaryPanel(null)} />}
        {protocol === "ssh" && auxiliaryPanel === "device" && <DeviceInfoPanel tabId={tabId} context={deviceContext} onClose={() => setAuxiliaryPanel(null)} />}
        {protocol === "ssh" && auxiliaryPanel === "multiExec" && <MultiExecPanel tabId={tabId} onClose={() => setAuxiliaryPanel(null)} />}
      </div>
    </div>
  );
}

function ToolbarBtn({ icon: Icon, title, onClick, disabled = false }: {
  icon: typeof Search;
  title: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="p-1.5 rounded text-dock-text-muted hover:bg-dock-surface-hover hover:text-dock-text disabled:opacity-30 disabled:pointer-events-none"
      title={title}
      aria-label={title}
    >
      <Icon size={13} />
    </button>
  );
}
