import { useEffect, useRef, useCallback, useState } from "react";
import { Terminal as XTerm, type IDecoration, type IMarker } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { nativeInvoke } from "../../api/native";
import { listen } from "@tauri-apps/api/event";
import { Search, RotateCw, Trash2, Copy, ClipboardPaste, X, ChevronUp, ChevronDown } from "lucide-react";
import { useSettingsStore } from "../../stores/settingsStore";
import { findTerminalHighlights } from "../../utils/terminalHighlight";
import "@xterm/xterm/css/xterm.css";

interface SemanticDecorationLine {
  marker: IMarker;
  signature: string;
  decorations: IDecoration[];
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
          if (!masked) {
            term.write("\b \b");
          }
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
  host: string;
  port: number;
  protocol: string;
  username?: string;
  password?: string;
}

export function TerminalView({ tabId, host, port, protocol, username, password }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const connectedRef = useRef(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  const connectToHost = useCallback(async () => {
    if (connectedRef.current) return;
    connectedRef.current = true;

    const term = terminalRef.current;
    if (!term) return;

    term.writeln(`\x1b[38;2;251;191;36mConnecting\x1b[39m to \x1b[38;2;209;109;255m${host}:${port}\x1b[39m via ${protocol.toUpperCase()}...`);
    term.writeln("");

    let finalUsername = username || "";
    let finalPassword = password || "";

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
    if (!finalPassword && protocol === "ssh") {
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
        tabId,
        host,
        port,
        protocol,
        username: finalUsername || null,
        password: finalPassword || null,
      });
    } catch (err) {
      term.writeln(`\x1b[38;2;248;113;113mConnection failed: ${err}\x1b[39m`);
      connectedRef.current = false;
    }
  }, [tabId, host, port, protocol, username, password]);

  const handleReconnect = useCallback(async () => {
    const term = terminalRef.current;
    if (!term) return;
    connectedRef.current = false;
    term.writeln("");
    term.writeln("\x1b[38;2;251;191;36m--- Reconnecting ---\x1b[39m");
    try {
      await nativeInvoke("close_terminal", { tabId, protocol });
    } catch { /* ignore close errors */ }
    // Wait for connection to fully close before reconnecting
    await new Promise(r => setTimeout(r, 500));
    connectToHost();
  }, [tabId, protocol, connectToHost]);

  const handleClear = useCallback(() => {
    terminalRef.current?.clear();
  }, []);

  const handleCopy = useCallback(() => {
    const sel = terminalRef.current?.getSelection();
    if (sel) navigator.clipboard.writeText(sel);
  }, []);

  const handlePaste = useCallback(async () => {
    const text = await navigator.clipboard.readText();
    if (text) nativeInvoke("write_terminal", { tabId, data: text, protocol }).catch(() => {});
  }, [tabId, protocol]);

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
      fontFamily: "JetBrains Mono, Cascadia Code, Consolas, monospace",
      fontSize: 14,
      lineHeight: 1.2,
      cursorBlink: true,
      cursorStyle: "block",
      scrollback: 10000,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon();
    const webLinksAddon = new WebLinksAddon();

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(searchAddon);
    terminal.loadAddon(webLinksAddon);

    terminal.open(containerRef.current);
    fitAddon.fit();

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;
    searchAddonRef.current = searchAddon;
    const semanticDecorations: SemanticDecorationLine[] = [];

    // CRITICAL: Remote terminal input must be forwarded UNCHANGED.
    // Semantic highlighting must NEVER intercept, modify, delay, or parse this path.
    // No trim, no ANSI injection, no local echo, no command buffering.
    terminal.onData((data) => {
      nativeInvoke("write_terminal", { tabId, data, protocol }).catch(() => {});
    });

    // Ctrl+F to open search (intercept before terminal)
    terminal.attachCustomKeyEventHandler((e) => {
      if (e.ctrlKey && e.key === "f" && e.type === "keydown") {
        setSearchOpen(true);
        setTimeout(() => searchInputRef.current?.focus(), 50);
        return false; // prevent terminal from receiving it
      }
      return true;
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
    const unlistenStatus = listen<string>(`terminal-status-${tabId}`, (event) => {
      if (event.payload === "disconnected") {
        terminal.writeln("");
        terminal.writeln("\x1b[38;2;251;191;36mConnection closed.\x1b[39m");
        connectedRef.current = false;
      }
    });

    // Resize
    const resizeObserver = new ResizeObserver(() => { fitAddon.fit(); });
    resizeObserver.observe(containerRef.current);

    terminal.onResize(({ cols, rows }) => {
      nativeInvoke("resize_terminal", { tabId, cols, rows }).catch(() => {});
    });

    // Deferring startup lets React Strict Mode cancel its development-only
    // effect replay before an SSH attempt begins on a disposed terminal.
    const connectTimer = window.setTimeout(() => connectToHost(), 0);

    return () => {
      window.clearTimeout(connectTimer);
      connectedRef.current = false;
      clearSemanticDecorations(semanticDecorations);
      resizeObserver.disconnect();
      unlistenData.then((fn) => fn());
      unlistenStatus.then((fn) => fn());
      terminal.dispose();
      nativeInvoke("close_terminal", { tabId, protocol }).catch(() => {});
    };
  }, [tabId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col w-full h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 h-8 bg-dock-sidebar border-b border-dock-border flex-shrink-0">
        <ToolbarBtn icon={RotateCw} title="Reconnect" onClick={handleReconnect} />
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
              if (e.key === "Enter") { e.shiftKey ? handleSearchPrev() : handleSearchNext(); }
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

      {/* Terminal */}
      <div
        ref={containerRef}
        className="flex-1 xterm-container"
        data-tab-id={tabId}
        onContextMenu={(e) => {
          e.preventDefault();
          // TODO: context menu
        }}
      />
    </div>
  );
}

function ToolbarBtn({ icon: Icon, title, onClick }: { icon: typeof Search; title: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="p-1.5 rounded hover:bg-dock-surface-hover text-dock-text-muted hover:text-dock-text"
      title={title}
    >
      <Icon size={13} />
    </button>
  );
}
