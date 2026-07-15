import { useEffect, useRef, useCallback } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "@xterm/xterm/css/xterm.css";

interface TerminalViewProps {
  tabId: string;
  host: string;
  port: number;
  protocol: string;
  username?: string;
}

export function TerminalView({ tabId, host, port, protocol, username }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const connectedRef = useRef(false);

  const connectToHost = useCallback(async () => {
    if (connectedRef.current) return;
    connectedRef.current = true;

    const term = terminalRef.current;
    if (!term) return;

    term.writeln(`\x1b[36mConnecting to ${host}:${port} via ${protocol.toUpperCase()}...\x1b[0m`);
    term.writeln("");

    try {
      await invoke("spawn_terminal", {
        tabId,
        host,
        port,
        protocol,
        username: username || null,
      });
    } catch (err) {
      term.writeln(`\x1b[31mConnection failed: ${err}\x1b[0m`);
      connectedRef.current = false;
    }
  }, [tabId, host, port, protocol, username]);

  useEffect(() => {
    if (!containerRef.current) return;

    const terminal = new XTerm({
      theme: {
        background: "#0f0f14",
        foreground: "#e4e4ef",
        cursor: "#5b8af5",
        cursorAccent: "#0f0f14",
        selectionBackground: "#5b8af540",
        black: "#1a1a24",
        red: "#f7768e",
        green: "#73daca",
        yellow: "#e0af68",
        blue: "#7aa2f7",
        magenta: "#bb9af7",
        cyan: "#7dcfff",
        white: "#c0caf5",
        brightBlack: "#414868",
        brightRed: "#f7768e",
        brightGreen: "#73daca",
        brightYellow: "#e0af68",
        brightBlue: "#7aa2f7",
        brightMagenta: "#bb9af7",
        brightCyan: "#7dcfff",
        brightWhite: "#e4e4ef",
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

    // Send keystrokes to backend
    terminal.onData((data) => {
      invoke("write_terminal", { tabId, data }).catch(() => {});
    });

    // Listen for data from backend
    const unlistenData = listen<string>(`terminal-data-${tabId}`, (event) => {
      if (event.payload) {
        terminal.write(event.payload);
      }
    });

    // Listen for status changes
    const unlistenStatus = listen<string>(`terminal-status-${tabId}`, (event) => {
      if (event.payload === "disconnected") {
        terminal.writeln("");
        terminal.writeln("\x1b[33mConnection closed.\x1b[0m");
        connectedRef.current = false;
      }
    });

    // Resize
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
    });
    resizeObserver.observe(containerRef.current);

    // Start connection
    connectToHost();

    return () => {
      resizeObserver.disconnect();
      unlistenData.then((fn) => fn());
      unlistenStatus.then((fn) => fn());
      terminal.dispose();
      // Kill the process when tab is closed
      invoke("close_terminal", { tabId }).catch(() => {});
    };
  }, [tabId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={containerRef}
      className="w-full h-full xterm-container"
      data-tab-id={tabId}
    />
  );
}
