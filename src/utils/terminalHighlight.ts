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
 * - Skips text segments that already contain ANSI escape sequences
 * - Skips text with cursor movement / screen control sequences
 * - Only processes plain-text segments between ANSI codes
 * - Validates candidates (e.g. IP octet range check)
 * - Handles priority: longer/negative matches override shorter/positive ones
 */

// ANSI foreground colors (24-bit true color)
const COLORS = {
  ip: "\x1b[38;2;209;109;255m",        // #D16DFF pink-purple
  mac: "\x1b[38;2;34;211;238m",        // #22D3EE cyan
  iface: "\x1b[38;2;96;165;250m",      // #60A5FA blue
  vlan: "\x1b[38;2;192;132;252m",      // #C084FC purple
  up: "\x1b[38;2;74;222;128m",         // #4ADE80 green
  down: "\x1b[38;2;248;113;113m",      // #F87171 red
  warn: "\x1b[38;2;251;191;36m",       // #FBBF24 amber
  time: "\x1b[38;2;148;163;184m",      // #94A3B8 muted gray
  reset: "\x1b[39m",                    // Reset foreground only
};

// === PATTERNS ===

// IPv4 with optional CIDR
const RE_IPV4 = /\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})(\/\d{1,2})?\b/g;

// MAC addresses: colon, dash, and Cisco dotted
const RE_MAC_COLON = /\b([0-9a-fA-F]{2}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2})\b/g;
const RE_MAC_DASH = /\b([0-9a-fA-F]{2}-[0-9a-fA-F]{2}-[0-9a-fA-F]{2}-[0-9a-fA-F]{2}-[0-9a-fA-F]{2}-[0-9a-fA-F]{2})\b/g;
const RE_MAC_DOT = /\b([0-9a-fA-F]{4}\.[0-9a-fA-F]{4}\.[0-9a-fA-F]{4})\b/g;

// Interface names (conservative patterns with required digit)
const RE_IFACE = /\b((?:Ethernet|Et|GigabitEthernet|Gi|TenGigabitEthernet|Te|FortyGigE|HundredGigE|Fa|FastEthernet|Management|Mgmt|Loopback|Lo|Port-[Cc]hannel|Po|Tunnel|Serial|Vlan)\d[\d/]*|(?:eth|ens|eno|enp|wlan|bond)\d[\w]*)\b/g;

// VLAN with number
const RE_VLAN = /\b((?:VLAN|Vlan|vlan)\s*)(\d{1,4})\b/g;

// Timestamps HH:MM:SS
const RE_TIME = /\b(\d{1,2}:\d{2}:\d{2}(?:\.\d+)?)\b/g;

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

// === ANSI DETECTION ===

// Detects if text contains cursor movement, screen control, or alternate buffer sequences
// NOTE: Does NOT include 'm' (SGR/colors) — those are simple and safe to highlight around
const RE_COMPLEX_ANSI = /\x1b\[[\d;]*[ABCDHJKfhl]|\x1b\[\?|\x1b\]|\x1b\(|\x1b\)/;
const RE_ANY_ANSI = /\x1b\[/;

/**
 * Split text into segments: ANSI escape sequences and plain text.
 * Only plain-text segments get highlighted.
 */
function splitAnsiSegments(text: string): { isAnsi: boolean; content: string }[] {
  const segments: { isAnsi: boolean; content: string }[] = [];
  const re = /(\x1b\[[^a-zA-Z]*[a-zA-Z]|\x1b\][^\x07]*\x07|\x1b[()][^\x1b])/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ isAnsi: false, content: text.slice(lastIndex, match.index) });
    }
    segments.push({ isAnsi: true, content: match[0] });
    lastIndex = re.lastIndex;
  }

  if (lastIndex < text.length) {
    segments.push({ isAnsi: false, content: text.slice(lastIndex) });
  }

  return segments;
}

/**
 * Apply semantic colors to a plain-text segment.
 * Returns the segment with ANSI color codes wrapping matched tokens.
 */
function highlightPlainText(text: string): string {
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

  // Priority order: negative > positive > warning > MAC > IP > interface > VLAN > time
  addMatch(RE_NEGATIVE, COLORS.down);
  addMatch(RE_POSITIVE, COLORS.up);
  addMatch(RE_WARNING, COLORS.warn);
  addMatch(RE_MAC_COLON, COLORS.mac);
  addMatch(RE_MAC_DASH, COLORS.mac);
  addMatch(RE_MAC_DOT, COLORS.mac);
  addMatch(RE_IPV4, COLORS.ip, (ip) => isValidIPv4(ip.replace(/\/\d+$/, "")));
  addMatch(RE_IFACE, COLORS.iface);
  addMatch(RE_VLAN, COLORS.vlan);
  addMatch(RE_TIME, COLORS.time);

  if (replacements.length === 0) return text;

  // Sort by start position and build result
  replacements.sort((a, b) => a.start - b.start);
  let result = "";
  let pos = 0;
  for (const r of replacements) {
    result += text.slice(pos, r.start);
    result += r.color + text.slice(r.start, r.end) + COLORS.reset;
    pos = r.end;
  }
  result += text.slice(pos);
  return result;
}

/**
 * Main entry point: apply semantic highlighting to terminal output.
 *
 * - If disabled, returns text unchanged.
 * - Skips text with complex ANSI (cursor moves, screen ops).
 * - For text with simple ANSI (colors), highlights only plain segments.
 * - Validates all candidates before coloring.
 */
export function highlightTerminalOutput(text: string, enabled: boolean): string {
  if (!enabled || !text) return text;

  // Skip very short fragments (likely partial sequences)
  if (text.length < 3) return text;

  // If text has complex control sequences (cursor movement, alternate screen, etc.)
  // pass through completely — these are fullscreen apps, not line-based output
  if (RE_COMPLEX_ANSI.test(text)) return text;

  // If text has no ANSI at all, highlight the whole thing
  if (!RE_ANY_ANSI.test(text)) {
    return highlightPlainText(text);
  }

  // Text has simple ANSI (e.g. existing colors from device).
  // Split into ANSI sequences and plain text, only highlight plain parts.
  const segments = splitAnsiSegments(text);
  let result = "";
  for (const seg of segments) {
    if (seg.isAnsi) {
      result += seg.content;
    } else {
      result += highlightPlainText(seg.content);
    }
  }
  return result;
}
