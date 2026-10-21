# Security Policy

## Reporting Vulnerabilities

If you discover a security vulnerability, please report it responsibly:

1. **Do NOT** open a public GitHub issue for security vulnerabilities.
2. Email: security@sessiondock.example (placeholder)
3. Include: description, reproduction steps, potential impact.
4. Allow reasonable time for a fix before public disclosure.

## Security Model

### Credential Storage

- **Windows**: Passwords and secrets are stored in Windows Credential Manager under the `sessiondock` service namespace.
- **macOS**: Passwords and secrets are stored in macOS Keychain under the `sessiondock` service identifier.
- **SQLite** contains only: credential profile names, usernames, authentication methods, and vault reference IDs. Never passwords.
- **Private keys** remain in their user-selected filesystem location. SessionDock stores only the path needed to reopen the file.

### What is stored where

| Data | Location | Encrypted |
|------|----------|-----------|
| Session metadata | SQLite | No (non-sensitive) |
| Folder structure | SQLite | No |
| Session groups and membership | SQLite | No |
| Credential profile names | SQLite | No |
| Usernames | SQLite | No |
| Passwords | OS Credential Vault | Yes (OS-managed) |
| Private key passphrases | OS Credential Vault | Yes (OS-managed) |
| Private key paths | SQLite | No |
| SSH host fingerprints | SQLite | No |
| Application settings | SQLite | No |
| Non-secret BMC metadata | SQLite | No |
| BMC console URLs with tokens/tickets | Ephemeral tab memory only | N/A |

### SSH Host Key Verification

- First connection: fingerprint displayed for user approval
- Subsequent connections: fingerprint compared to stored value
- Changed fingerprints: authentication is blocked and both old and presented fingerprints are shown
- Users can inspect and explicitly remove trusted host entries before establishing new trust
- The Rust backend performs the authoritative verification immediately before authentication; frontend confirmation cannot bypass it

### SSH Jump Hosts

- Jump routes contain at most five ordered saved SSH profiles.
- Every hop performs a separate SSH handshake, host-key comparison, and authentication step.
- Unknown keys require explicit approval one hop at a time; changed keys stop the entire route.
- Hop credentials and private-key passphrases are resolved in Rust from the OS credential vault.
- `direct-tcpip` channels are bridged only through ephemeral listeners bound to `127.0.0.1`.
- Duplicate and self-referencing hops are rejected, and profiles used by a route cannot be deleted until references are removed.
- Normal JSON/CSV exports omit jump-host links and credential references.

### SFTP and Local Files

- SFTP opens only from an already authenticated, host-key-verified SSH pane and follows the same ProxyJump route when configured.
- Remote paths are absolute, length-bounded, NUL-free, normalized in Rust, and server-returned filenames are rejected if they contain path separators or traversal names.
- Upload and download data is streamed in bounded chunks. File contents and full paths are not written to logs, SQLite, settings, exports, or transfer events.
- Uploads and downloads use unique sibling staging files and publish only after the transfer succeeds. Failed or cancelled jobs attempt to remove their staged partial file.
- Existing destinations are refused by default. Replacement requires an explicit user confirmation and an `overwrite` request.
- Remote directory deletion is deliberately non-recursive; the server must report the directory as empty.
- Local paths originate from native file dialogs in the trusted main WebView and are revalidated in Rust as absolute file paths with existing parent directories. Remote BMC WebViews have no dialog or SFTP IPC capability.
- Closing a terminal pane cancels every active transfer owned by that pane. Transfer state is in memory only and is not restored after application exit.

### SSH Tunnels

- Local and remote forwarding are available only from an authenticated, host-key-verified SSH pane and follow that pane's ProxyJump route.
- Local listeners bind exclusively to client-side `127.0.0.1`. Remote listeners request server-side `127.0.0.1`. The UI exposes no wildcard or external bind option.
- The backend validates terminal references, target host lengths/content, and local/remote ports. Port `0` requests an assigned listener port and the actual port is returned to the UI.
- Each accepted local client receives a separate native libssh2 `direct-tcpip` channel. Forwarded payload bytes are never logged or sent to the frontend.
- Each accepted remote channel connects only to the explicit local target configured by the user. Dropping the libssh2 listener cancels the server-side forwarding request.
- Dynamic forwarding implements SOCKS5 CONNECT only. SOCKS BIND, UDP association, and proxy authentication are not supported or implied.
- The SOCKS listener is fixed to client-side `127.0.0.1`. Requests are length-bounded, use a bounded handshake deadline, and open one native SSH `direct-tcpip` channel only after strict protocol validation. Domain destinations are passed through the SSH transport for remote-side resolution.
- Runtime limits cap tunnels globally and per pane, and cap concurrent connections per tunnel to bound listener, thread, socket, and SSH-channel resource use.
- Tunnel definitions are runtime-only. Stopping a tunnel or closing its owning terminal pane closes the listener and active forwarding channels.
- Forwarded payload bytes and SOCKS destination requests are not logged, persisted, exported, or sent to the frontend.

### Application Lock

- Optional master password with PBKDF2/Argon2 key derivation
- Random salt per installation
- Authenticated encryption (AES-256-GCM)
- Biometric support where platform allows

### Encrypted Backup

- Password-based key derivation (Argon2id)
- AES-256-GCM authenticated encryption
- Random salt and nonce per backup
- Integrity verification before restore

### Logging

Application diagnostic logs are sanitized and never contain:
- Passwords or passphrases
- Private key content
- Credential vault values
- Authentication tokens
- Terminal input that may contain secrets

User-created terminal logs are a separate, explicitly enabled feature. They contain raw remote output and may therefore include echoed input, passwords, tokens, secrets, configurations, internal IP addresses, and customer information. SessionDock does not claim to redact these files. They are written only to the local folder selected through the native dialog, are never uploaded by SessionDock, and are flushed when logging stops or the owning pane closes.

### Transfers Workspace

- Transfer progress, local/remote paths, and retry requests remain in bounded in-memory state for the current application run and are not persisted to SQLite or browser storage.
- The workspace displays filenames and remote paths but does not display file contents, credentials, SSH authentication material, or terminal output.
- Pause, resume, cancel, and retry use the existing narrow transfer commands; the frontend cannot choose an arbitrary backend operation.
- Transfer ownership remains pane-scoped. Closing a pane cancels its native jobs and marks any active runtime records cancelled even if the final backend event races with unmount.

### Tunnels Workspace

- The global tunnel inventory is read from the in-memory native tunnel manager and is never persisted to SQLite or browser storage.
- It displays bind and target endpoint metadata but no credentials, SSH authentication material, terminal output, or forwarded traffic.
- Tunnel creation remains inside an explicitly connected SSH pane, preserving loopback-only defaults, endpoint validation, ownership limits, and the existing warning model.
- Global stop actions use the narrow validated tunnel command, and closing an owning pane still cancels its listeners and active forwarding channels.

### Diagnostics Workspace

- Diagnostic records and raw stdout/stderr remain in bounded in-memory state for the current application run and are not persisted to SQLite or browser storage.
- Starting or rerunning a check sends only pane, provider, and diagnostic identifiers; Rust resolves the command from its fixed read-only allowlist.
- Global cancel actions use the narrow diagnostics manager command. Closing an owning pane cancels its native jobs and marks any active runtime records cancelled if the final event races with unmount.
- Raw output can contain sensitive infrastructure details. It is displayed only on explicit expansion and is never uploaded by SessionDock.

### Automatic Reconnect

- Automatic reconnect is disabled by default and configured per saved session.
- Unexpected disconnects use exponential backoff capped at 30 seconds; explicit disconnects, tab closure, and user cancellation never retry.
- Changed or declined host keys, interactive credential requirements, and authentication-stage failures stop automatic retries.
- Every retry performs the normal host-key verification and authentication path; reconnect does not bypass trust or credential controls.

### Active Connections

- The Active Connections workspace derives its inventory from in-memory tab and pane metadata and does not persist connection state.
- It displays endpoint and username metadata but never passwords, private-key material, credential values, terminal output, or BMC token-bearing URLs.
- Explicit disconnect and reconnect actions are routed through the owning terminal pane so retry suppression, tunnel cleanup, transfer cancellation, diagnostics, and logging lifecycle rules remain in force.
- Closing a terminal connection releases its native backend resources before removing the pane from the workspace.

### Connection IPC

- SessionDock registers only the native terminal lifecycle for SSH and Telnet connections; the removed legacy connection facade is not exposed through Tauri IPC.
- Every SSH connection performs the complete handshake, host-key verification, and authentication flow before it can become connected.
- Terminal write, resize, reconnect, and close actions remain pane-scoped so dependent transfers, tunnels, diagnostics, MultiExec jobs, and logs are cleaned up by their owning managers.

### Dependency Auditing

- Pull requests and pushes that change npm or Cargo manifests, lockfiles, or the audit workflow run read-only npm and RustSec vulnerability scans.
- A weekly scheduled scan detects newly published advisories even when dependency files have not changed.
- npm findings at high severity or above fail the audit. Rust dependencies are scanned with the pinned `cargo-audit` 0.22.2 release.
- The workflow token has read-only repository contents permission; the scanners receive no issue, check, or source write capability.
- The project audit configuration narrowly ignores `RUSTSEC-2026-0367`, `RUSTSEC-2026-0368`, and `RUSTSEC-2026-0369`. Tauri uses the affected `zip` 4 extraction code only for Windows updater artifacts, and the updater rejects artifacts that are not signed by SessionDock's embedded public key before installation.
- Tauri's latest compatible updater still requires `zip` 4. The three exceptions must be removed as soon as upstream supports `zip` 9; all other current and future RustSec vulnerabilities continue to fail CI and release publication.
- Yanked, unmaintained, and unsound transitive dependency warnings are reviewed separately and remain visible. Current warnings have no compatible downstream update and are monitored pending Tauri, GTK, `rand`, and `ssh2` ecosystem updates.

### BMC Remote Content

- BMC pages run in native child WebViews whose `bmc-*` labels match no privileged Tauri capability.
- Remote pages cannot invoke SessionDock commands or access its filesystem, shell, updater, dialog, or process plugins.
- Navigation is restricted to HTTP(S), popup creation is denied, and embedded URL credentials are rejected.
- Sensitive query values are redacted in the UI and omitted from SQLite, JSON, and CSV.
- Embedded certificate verification is never disabled globally or per application WebView.

### Data Privacy

- No analytics
- No telemetry
- No cloud synchronization
- No hosted backend
- No account registration
- No external credential storage
- Data never leaves the device except to target connection hosts

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.7.x | Yes |
