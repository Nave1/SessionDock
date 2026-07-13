import { useEffect, useRef } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";

interface TerminalViewProps {
  tabId: string;
  onData: (data: string) => void;
  onResize: (cols: number, rows: number) => void;
}

export function TerminalView({ tabId, onData, onResize }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

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

    // Handle user input
    terminal.onData((data) => {
      onData(data);
    });

    // Handle resize
    terminal.onResize(({ cols, rows }) => {
      onResize(cols, rows);
    });

    // Observe container resize
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
    });
    resizeObserver.observe(containerRef.current);

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // Initial resize notification
    onResize(terminal.cols, terminal.rows);

    return () => {
      resizeObserver.disconnect();
      terminal.dispose();
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

/**
 * Write data to a terminal instance from outside the component.
 * Use this for incoming data from the backend.
 */
export function writeToTerminal(tabId: string, data: string | Uint8Array) {
  const container = document.querySelector(`[data-tab-id="${tabId}"]`);
  if (!container) return;
  const event = new CustomEvent("terminal-data", { detail: { tabId, data } });
  window.dispatchEvent(event);
}
