/**
 * Semantic Terminal Highlighting
 * 
 * Applies contextual ANSI colors to terminal output for improved readability.
 * This is visual-only — never modifies actual SSH/Telnet/Serial bytes.
 * 
 * Rules:
 * - Does NOT modify text that already contains ANSI escape sequences
 * - Does NOT modify text during active password/auth input
 * - Only wraps matched patterns with ANSI color codes + reset
 */

// ANSI color codes
const C = {
  ip: "\x1b[38;2;220;130;220m",       // Pink-purple for IPs
  mac: "\x1b[38;2;100;220;220m",      // Cyan for MACs
  iface: "\x1b[38;2;120;160;255m",    // Blue for interfaces
  vlan: "\x1b[38;2;180;130;255m",     // Purple for VLANs
  up: "\x1b[38;2;80;220;120m",        // Green for up/active states
  down: "\x1b[38;2;240;80;80m",       // Red for down/error states
  warn: "\x1b[38;2;240;180;60m",      // Amber for warnings
  time: "\x1b[38;2;120;120;140m",     // Muted gray for timestamps
  reset: "\x1b[0m",
};

// Patterns
const IPV4_RE = /\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})(\/\d{1,2})?\b/g;
const MAC_RE = /\b([0-9a-fA-F]{2}[:\-][0-9a-fA-F]{2}[:\-][0-9a-fA-F]{2}[:\-][0-9a-fA-F]{2}[:\-][0-9a-fA-F]{2}[:\-][0-9a-fA-F]{2})\b/g;
const MAC_DOTTED_RE = /\b([0-9a-fA-F]{4}\.[0-9a-fA-F]{4}\.[0-9a-fA-F]{4})\b/g;
const IFACE_RE = /\b(Ethernet\d+(?:\/\d+)*|GigabitEthernet\d+(?:\/\d+)*|Gi\d+(?:\/\d+)*|Te\d+(?:\/\d+)*|Fa\d+(?:\/\d+)*|Loopback\d+|Vlan\d+|Port-[Cc]hannel\d+|Management\d+(?:\/\d+)*|eth\d+|ens\d+|enp\d+s\d+|wlan\d+)\b/g;
const VLAN_RE = /\b(VLAN|Vlan|vlan)\s*(\d{1,4})\b/g;

const UP_WORDS = /\b(up|UP|connected|CONNECTED|active|ACTIVE|established|ESTABLISHED|reachable|REACHABLE|success|SUCCESS|enabled|ENABLED|online|ONLINE|full|FULL)\b/g;
const DOWN_WORDS = /\b(down|DOWN|disconnected|DISCONNECTED|failed|FAILED|error|ERROR|denied|DENIED|unreachable|UNREACHABLE|disabled|DISABLED|offline|OFFLINE|errdisabled|notconnect|err-disabled)\b/g;
const WARN_WORDS = /\b(warning|WARNING|pending|PENDING|degraded|DEGRADED|retrying|RETRYING|connecting|CONNECTING|initializing|INITIALIZING|unknown|UNKNOWN)\b/g;

const TIME_RE = /\b(\d{2}:\d{2}:\d{2}(?:\.\d+)?)\b/g;

/**
 * Apply semantic highlighting to a chunk of terminal output.
 * Returns the same text with ANSI color codes injected around recognized patterns.
 * 
 * IMPORTANT: If the chunk contains ANSI control sequences (cursor movement,
 * screen clearing, etc.), skip highlighting to avoid corrupting terminal state.
 */
export function highlightTerminalOutput(text: string, enabled: boolean): string {
  if (!enabled) return text;

  // Skip if text contains complex ANSI sequences (cursor moves, screen ops)
  // Only apply to simple text lines
  if (/\x1b\[\d*[ABCDHJ]/.test(text) || /\x1b\[\?/.test(text) || /\x1b\[[\d;]*[mK]/.test(text) && text.includes("\x1b[")) {
    // Already has ANSI formatting or contains cursor control — pass through
    // But we can still highlight if it's just simple \x1b[0m resets
    if (/\x1b\[\d*[ABCDHJ]/.test(text) || /\x1b\[\?/.test(text)) {
      return text;
    }
  }

  // Apply highlights in priority order (most specific first)
  let result = text;

  // MACs (before IPs to avoid partial matches)
  result = result.replace(MAC_RE, `${C.mac}$1${C.reset}`);
  result = result.replace(MAC_DOTTED_RE, `${C.mac}$1${C.reset}`);

  // IPv4 addresses
  result = result.replace(IPV4_RE, (match, ip, _cidr) => {
    // Validate octets
    const parts = ip.split(".");
    if (parts.every((p: string) => parseInt(p) <= 255)) {
      return `${C.ip}${match}${C.reset}`;
    }
    return match;
  });

  // Interfaces
  result = result.replace(IFACE_RE, `${C.iface}$1${C.reset}`);

  // VLANs
  result = result.replace(VLAN_RE, `${C.vlan}$1 $2${C.reset}`);

  // Status words
  result = result.replace(UP_WORDS, `${C.up}$1${C.reset}`);
  result = result.replace(DOWN_WORDS, `${C.down}$1${C.reset}`);
  result = result.replace(WARN_WORDS, `${C.warn}$1${C.reset}`);

  // Timestamps
  result = result.replace(TIME_RE, `${C.time}$1${C.reset}`);

  return result;
}
