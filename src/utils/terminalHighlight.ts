/**
 * Semantic Terminal Highlighting Engine
 *
 * Applies contextual ANSI foreground colors to terminal output BEFORE writing
 * to xterm.js. This is non-destructive because:
 * - xterm.js copy/paste returns plain text (strips ANSI)
 * - xterm.js SearchAddon searches the text buffer (ignores ANSI)
 * - SSH/Telnet/Serial bytes are never modified (this runs client-side after receive)
 *
 * Rules:
 * - Never modifies data sent TO the remote device
 * - Skips all data containing ANSI or terminal control sequences
 * - Validates candidates (e.g. IP octet range check)
 * - Handles priority: longer/negative matches override shorter/positive ones
 */

// ANSI foreground colors (24-bit true color)
const COLORS = {
  ip: "\x1b[38;2;45;212;191m",         // #2DD4BF teal
  mac: "\x1b[38;2;34;211;238m",        // #22D3EE cyan
  iface: "\x1b[38;2;96;165;250m",      // #60A5FA blue
  vlan: "\x1b[38;2;192;132;252m",      // #C084FC purple
  up: "\x1b[38;2;74;222;128m",         // #4ADE80 green
  down: "\x1b[38;2;248;113;113m",      // #F87171 red
  warn: "\x1b[38;2;251;191;36m",       // #FBBF24 amber
  time: "\x1b[38;2;148;163;184m",      // #94A3B8 muted gray
  latency: "\x1b[38;2;56;189;248m",     // #38BDF8 sky
  reset: "\x1b[39m",                    // Reset foreground only
};

const DECORATION_COLORS = {
  ip: "#2DD4BF",
  mac: "#22D3EE",
  iface: "#60A5FA",
  vlan: "#C084FC",
  up: "#4ADE80",
  down: "#F87171",
  warn: "#FBBF24",
  time: "#94A3B8",
  latency: "#38BDF8",
} as const;

export interface TerminalHighlight {
  start: number;
  length: number;
  color: string;
}

// === PATTERNS ===

// IPv4 with optional CIDR
const RE_IPV4 = /\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})(\/\d{1,2})?\b/g;

// MAC addresses: colon, dash, and Cisco dotted
const RE_MAC_COLON = /\b([0-9a-fA-F]{2}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2})\b/g;
const RE_MAC_DASH = /\b([0-9a-fA-F]{2}-[0-9a-fA-F]{2}-[0-9a-fA-F]{2}-[0-9a-fA-F]{2}-[0-9a-fA-F]{2}-[0-9a-fA-F]{2})\b/g;
const RE_MAC_DOT = /\b([0-9a-fA-F]{4}\.[0-9a-fA-F]{4}\.[0-9a-fA-F]{4})\b/g;

// Interface names (conservative patterns with required digit)
const RE_IFACE = /\b((?:Ethernet|Eth|Et|GigabitEthernet|Gi|TenGigabitEthernet|Te|TwentyFiveGigE|Twe|FortyGigE|Fo|HundredGigE|Hu|Fa|FastEthernet|Management|Mgmt|Loopback|Lo|Port-[Cc]hannel|Po|Tunnel|Serial|Vlan|Vl)\d[\w./:-]*|(?:eth|ens|eno|enp|wlan|bond)\d[\w./:-]*)\b/g;

// VLAN with number
const RE_VLAN = /\b((?:VLAN|Vlan|vlan)\s*)(\d{1,4})\b/g;

// Timestamps HH:MM:SS
const RE_TIME = /\b(\d{1,2}:\d{2}:\d{2}(?:\.\d+)?)\b/g;

// Common Cisco/network-device ping output
const RE_PING_SUCCESS = /!{2,}|\bSuccess rate is \d+ percent(?: \(\d+\/\d+\))?/gi;
const RE_PING_FAILURE = /\bSuccess rate is 0 percent(?: \(0\/\d+\))?/gi;
const RE_LATENCY = /\b(?:time[=<]\s*)?\d+(?:\.\d+)?\s*ms\b/gi;

// Status keywords - NEGATIVE (higher priority, checked first)
const NEGATIVE_WORDS = [
  "disconnected", "err-disabled", "errdisabled", "notconnect", "unreachable",
  "administratively down", "line protocol is down",
  "inactive", "disabled", "down", "failed", "failure", "error",
  "denied", "timeout", "timed out", "rejected", "offline", "closed", "blocked",
];

// Status keywords - POSITIVE
const POSITIVE_WORDS = [
  "established", "connected", "reachable", "successful",
  "line protocol is up",
  "active", "enabled", "up", "success", "online", "running", "ready", "passed",
];

// Status keywords - WARNING
const WARNING_WORDS = [
  "connecting", "warning", "pending", "degraded", "retrying",
  "unknown", "initializing", "authenticating", "waiting",
];

// Build regex from word lists (longer matches first to avoid partial coloring)
function buildWordRegex(words: string[]): RegExp {
  const sorted = [...words].sort((a, b) => b.length - a.length);
  const escaped = sorted.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`\\b(${escaped.join("|")})\\b`, "gi");
}

const RE_NEGATIVE = buildWordRegex(NEGATIVE_WORDS);
const RE_POSITIVE = buildWordRegex(POSITIVE_WORDS);
const RE_WARNING = buildWordRegex(WARNING_WORDS);

// === VALIDATORS ===

function isValidIPv4(ip: string): boolean {
  const parts = ip.split(".");
  return parts.length === 4 && parts.every(p => {
    const n = parseInt(p, 10);
    return n >= 0 && n <= 255 && String(n) === p; // no leading zeros
  });
}

// Allow tabs and line endings, but bypass any data that performs terminal
// control. This keeps prompts, cursor movement, paging, and fullscreen apps raw.
const RE_TERMINAL_CONTROL = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;

/**
 * Apply semantic colors to a plain-text segment.
 * Returns the segment with ANSI color codes wrapping matched tokens.
 */
export function findTerminalHighlights(text: string): TerminalHighlight[] {
  // Track which character positions are already highlighted (priority system)
  const highlighted = new Uint8Array(text.length); // 0 = free, 1 = taken
  const replacements: { start: number; end: number; color: string }[] = [];

  function addMatch(regex: RegExp, color: string, validator?: (match: string) => boolean) {
    regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      // Check if range is free
      let free = true;
      for (let i = start; i < end; i++) {
        if (highlighted[i]) { free = false; break; }
      }
      if (!free) continue;
      // Validate if needed
      if (validator && !validator(m[1] || m[0])) continue;
      // Mark as taken
      for (let i = start; i < end; i++) highlighted[i] = 1;
      replacements.push({ start, end, color });
    }
  }

  // Priority order: failures > success > warning > network tokens > timing
  addMatch(RE_PING_FAILURE, DECORATION_COLORS.down);
  addMatch(RE_NEGATIVE, DECORATION_COLORS.down);
  addMatch(RE_PING_SUCCESS, DECORATION_COLORS.up);
  addMatch(RE_POSITIVE, DECORATION_COLORS.up);
  addMatch(RE_WARNING, DECORATION_COLORS.warn);
  addMatch(RE_MAC_COLON, DECORATION_COLORS.mac);
  addMatch(RE_MAC_DASH, DECORATION_COLORS.mac);
  addMatch(RE_MAC_DOT, DECORATION_COLORS.mac);
  addMatch(RE_IPV4, DECORATION_COLORS.ip, (ip) => isValidIPv4(ip.replace(/\/\d+$/, "")));
  addMatch(RE_IFACE, DECORATION_COLORS.iface);
  addMatch(RE_VLAN, DECORATION_COLORS.vlan);
  addMatch(RE_TIME, DECORATION_COLORS.time);
  addMatch(RE_LATENCY, DECORATION_COLORS.latency);

  return replacements
    .sort((a, b) => a.start - b.start)
    .map(({ start, end, color }) => ({ start, length: end - start, color }));
}

function highlightPlainText(text: string): string {
  const replacements = findTerminalHighlights(text);

  if (replacements.length === 0) return text;

  let result = "";
  let pos = 0;
  for (const r of replacements) {
    result += text.slice(pos, r.start);
    const ansiColor = Object.entries(DECORATION_COLORS).find(([, hex]) => hex === r.color)?.[0] as keyof typeof COLORS;
    result += COLORS[ansiColor] + text.slice(r.start, r.start + r.length) + COLORS.reset;
    pos = r.start + r.length;
  }
  result += text.slice(pos);
  return result;
}

/**
 * Main entry point: apply semantic highlighting to terminal output.
 *
 * - If disabled, returns text unchanged.
 * - Skips all ANSI and control data. Native device formatting always wins.
 * - Validates all candidates before coloring.
 */
export function highlightTerminalOutput(text: string, enabled: boolean): string {
  if (!enabled || !text) return text;

  // Skip very short fragments (likely partial tokens).
  if (text.length < 3) return text;

  if (text.includes("\x1b") || RE_TERMINAL_CONTROL.test(text)) return text;

  return highlightPlainText(text);
}
