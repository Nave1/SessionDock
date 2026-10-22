# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-10-22

### Added
- Add an integrated WinSCP-style dual-pane Files workspace with local drives and folders on the left and the connected device on the right
- Navigate local drives and directories and create, rename, or delete local entries without launching an external file-transfer application
- Upload a selected local file or download a selected remote file directly into the current local directory

### Changed
- Keep remote directory browsing on the authenticated SFTP subsystem while allowing explicit SCP single-file transfers for compatible SSH servers
- Reuse the existing streaming transfer queue for dual-pane progress, pause, resume, cancel, retry, staging, and overwrite handling

### Security
- Expose local filesystem operations through narrow path-validated Rust commands instead of broad frontend filesystem access
- Reject local path control characters, unsafe entry names, symlink deletion, recursive deletion, and implicit overwrite

## [1.0.2] - 2026-10-22

### Fixed
- Enable the native Windows Credential Manager backend so password profiles persist across independent vault entries and SSH connections
- Verify every vault write through a fresh operating-system credential entry before saving credential profile metadata

### Security
- Fail credential creation or password replacement immediately when the operating-system vault cannot read back the saved secret
- Remove an unverified vault entry instead of retaining credential metadata that cannot authenticate

Profiles created with v1.0.1 may have metadata but no recoverable vault password. After updating, edit each affected profile and save its password once.

## [1.0.1] - 2026-10-22

### Added
- Edit credential profile names and usernames, replace vault passwords, and explicitly reveal the current password from the edit dialog
- Start an SCP connection for a saved SSH session from its sidebar context menu or session-list action while reusing Quick Connect credential selection

### Fixed
- Reject new password credential profiles without a vault secret and report existing profiles whose saved password is missing
- Apply Quick Connect credentials through the existing camel-case IPC contract and preserve vault secrets during metadata-only credential edits
- Replace the deprecated Arista EOS `show environment all` quick command with `show system environment all`
- Wire startup, close-confirmation, connection-default, language, motion, terminal, and SSH keepalive settings to runtime behavior
- Remove tab-restoration, application-lock, SSH-agent-selection, timeout, and density controls that did not have a safe or supported implementation

### Security
- Retrieve an existing credential secret only after an explicit reveal action and keep it in dialog-local memory
- Continue storing credential secrets exclusively in the operating-system vault; SQLite, exports, logs, and persisted frontend state contain metadata only

## [1.0.0] - 2026-10-21

### Added
- Add compact session deletion actions to sidebar rows and their context menus, with confirmation and dependency-safe backend validation
- Add SCP to Quick Connect as a discoverable SSH-backed transfer mode that opens the Files panel ready for SCP
- Add saved password credential selection to Quick Connect while keeping credential secrets in the OS vault and backend
- Add visible start actions to Transfers, Tunnels, and Diagnostics that open the correct tool on a connected SSH pane
- Add Windows registry serial-port discovery as a fallback to native enumeration, with deduplication and natural COM-port sorting

### Fixed
- Remove the misleading COM3 placeholder when no serial port has been detected
- Route operational workspace start actions to Quick Connect when no SSH pane is connected

## [0.10.0] - 2026-10-21

### Added
- Add native OpenSSH private-key and SSH-agent authentication for saved SSH sessions
- Add OS-vault credential profiles for SSH passwords and encrypted-key passphrases
- Add explicit first-use SSH host-key trust and trusted-host management
- Add native SSH ProxyJump chains with up to five ordered saved jump hosts
- Add integrated SFTP browsing and file management on authenticated SSH and ProxyJump panes
- Add opt-in native SCP single-file transfers for SSH servers without SFTP, including ProxyJump routes and shared transfer controls
- Add streamed upload and download queues with progress, pause, resume, cancel, retry, and explicit overwrite confirmation
- Add the first SSH Tunnel Manager slice with runtime local forwarding, automatic port allocation, and per-pane start/stop controls
- Add runtime SSH remote forwarding with loopback-only server listeners, automatic port allocation, and explicit local targets
- Add runtime SOCKS5 CONNECT forwarding with loopback-only listeners, automatic port allocation, remote-side domain resolution, and pane-owned lifecycle controls
- Add a pane-scoped Command Snippets library with search, create/edit/delete, favorites, categories, vendor metadata, and exact-command insertion without automatic execution
- Add the first Device Intelligence slice with metadata-driven Generic SSH, Linux, and Arista EOS providers plus transparent pane-scoped Quick Commands
- Add structured Linux and Arista EOS diagnostics with pane-scoped progress, cancellation, exit status, and raw output
- Add MultiExec for one-command execution across explicitly selected connected SSH panes with per-target status, cancellation, exit code, and raw output
- Add opt-in SSH, Telnet, and Serial terminal logging to timestamped files in a user-selected local folder with a persistent recording indicator
- Add per-session disabled, retry-once, and automatic reconnect modes with bounded exponential backoff, visible retry state, and cancellation
- Add reusable session groups with many-to-many membership, searchable assignment, and bounded connect-all actions
- Add a searchable Active Connections workspace with pane-level status, focus, reconnect, explicit disconnect, and close controls
- Add a global Transfers workspace with cross-pane progress, filtering, focus, pause, resume, cancel, retry, and bounded runtime history
- Add a global Tunnels workspace with authoritative runtime refresh, forwarding-mode filters, owner-pane focus, stop controls, and live navigation counts
- Add a global Diagnostics workspace with cross-pane status, filtering, owner focus, cancellation, rerun, explicit raw output, and bounded runtime history

### Security
- Remove the unused legacy connection IPC and incomplete SSH/Telnet facades so connection lifecycle commands use only the authenticated, host-key-verified native terminal path
- Enforce SSH host-key verification in the Rust connection path before all authentication methods
- Block changed host keys without one-click replacement and keep private keys and passphrases out of SQLite and exports
- Verify and authenticate every ProxyJump hop independently, reject invalid chains, and bind internal bridges only to loopback
- Normalize SFTP paths, reject unsafe remote names, stage transfers before publish, and cancel pane-owned jobs on disconnect
- Restrict SCP to shell-safe absolute remote file paths, require explicit upload confirmation, and stage local downloads before publish
- Restrict local tunnel listeners to `127.0.0.1`, validate endpoints, and stop pane-owned listeners and channels on disconnect
- Restrict remote tunnel listeners to server-side `127.0.0.1` and cancel server forwarding plus active channels on pane disconnect
- Restrict dynamic SOCKS listeners to client-side `127.0.0.1`, reject unsupported authentication, BIND, UDP, malformed destinations, and stalled handshakes
- Validate snippet identifiers and bounded text fields through typed Rust request payloads, apply edits atomically, and keep insertion separate from command execution
- Keep provider matching local and conservative, expose confidence and metadata source, and never probe or execute Quick Commands automatically
- Resolve diagnostic commands from a fixed Rust allowlist, execute them outside the interactive PTY, and enforce 10-second and 64 KiB limits with pane-close cancellation
- Reclassify MultiExec commands in Rust, default unknown commands to potentially modifying, require strong high-risk confirmation, cap batches at 25 unique targets, and isolate every execution from interactive PTYs
- Keep terminal logging disabled by default, require explicit sensitive-data confirmation, create new local files without overwrite, avoid secret-redaction claims, never upload logs, and flush logs when their pane closes
- Keep automatic reconnect disabled by default, cancel retries after explicit disconnects and trust/authentication failures, and preserve host-key verification on every attempt
- Validate group names and membership identifiers in Rust, update memberships transactionally, and cap connect-all batches at 25 sessions
- Route Active Connections lifecycle controls through pane owners, avoid displaying credentials, and close native terminal resources before removing panes
- Keep transfer paths and retry metadata in non-persisted runtime state, route controls through narrow native commands, and cancel stale active records when their pane closes
- Keep tunnel creation scoped to explicit SSH panes, expose only runtime endpoint metadata globally, and route stop actions through the validated native tunnel manager
- Keep diagnostic commands backend-allowlisted, retain raw results in bounded non-persisted runtime state, and route global cancel or rerun actions through narrow native commands
- Add read-only npm and RustSec dependency audit gates for lockfile changes and weekly advisory checks
- Refresh locked QUIC and TLS dependencies to patched releases for current RustSec denial-of-service and cryptographic advisories
- Refresh certificate verification dependencies for current RustSec trust-store advisories
- Enforce frontend, Rust, and dependency-security gates before publishing signed release artifacts

### Fixed
- Defer xterm fitting while terminal panes are hidden so background connections initialize without zero-dimension rendering errors
- Restore frontend linting with an ESLint 9 flat config and enforce it in CI alongside TypeScript and React hook checks

## [0.9.7] - 2026-10-06

### Added
- Add detected COM port and serial speed selection to saved sessions and Quick Connect

### Fixed
- Connect serial tabs through the native in-process serial backend with persistent baud-rate settings
- Keep forms, home actions, terminal controls, and the sidebar usable in narrow application windows

## [0.9.6] - 2026-08-18

### Fixed
- Keep interactive SSH input responsive by avoiding a blocking flush after every keystroke

## [0.9.5] - 2026-08-18

### Fixed
- Prevent SSH sessions from freezing when writes, terminal resizes, or disconnects wait on a stalled transport
- Preserve ordered terminal input while nonblocking SSH writes retry without stopping incoming output

## [0.9.4] - 2026-08-10

### Fixed
- Keep SSH sessions active when an optional keepalive message cannot be sent, while continuing to detect real channel and socket closure
- Reset terminal modes, viewport, and scrollback after the old connection closes so reconnect starts with a fresh terminal

## [0.9.3] - 2026-08-10

### Added
- Disconnect the active terminal connection explicitly with Ctrl+Q while keeping its tab available for reconnection

### Fixed
- Keep SSH sessions connected when libssh2 reports a nonblocking `transport read` polling condition
- Copy selected terminal text to the native OS clipboard so it can be pasted into other applications
- Make terminal right-click copy selected text and paste only when no text is selected

## [0.9.2] - 2026-08-06

### Changed
- Open VNC connections through RealVNC Viewer Address Book entries so credentials remembered on the first connection are reused automatically

## [0.9.1] - 2026-08-06

### Added
- Add VNC as a standalone saved and Quick Connect protocol with a default port of 5900
- Open VNC desktops in RealVNC Viewer without placing credentials in process arguments

### Changed
- Keep VNC configuration separate from browser-based BMC / KVM sessions

### Fixed
- Prevent legacy BMC VNC settings from falling through to an HTTPS WebView

## [0.9.0] - 2026-08-06

### Added
- Split SSH and Telnet terminals right or down into mixed layouts of up to four independent panes
- Copy selected terminal text with Ctrl+C and paste clipboard text with Ctrl+V or right-click

### Changed
- Show BMC sessions with a sky-blue protocol indicator in the sidebar

### Fixed
- Erase masked password characters correctly with Backspace
- Retry short-lived SSH `transport read` failures instead of disconnecting immediately
- Reconnect a closed terminal by pressing Enter and make the tab-bar reconnect control functional
- Resize the remote PTY after connecting so wide switch output uses the actual terminal width instead of wrapping at 80 columns
- Keep bare Ctrl+C available as the remote interrupt signal when no terminal text is selected

## [0.8.3] - 2026-08-05

### Changed
- Increase secondary and muted text contrast in light and dark modes
- Give closed folders a distinct burnished-amber icon color

### Fixed
- Show previously connected sessions in newest-first order in the Recent tab

## [0.8.2] - 2026-08-05

### Fixed
- Resolve Windows PAC/WPAD proxy settings before checking for or downloading updates

## [0.8.1] - 2026-08-05

### Fixed
- Keep nested folders collapsed when a parent folder is closed and reopened

## [0.8.0] - 2026-08-05

### Added
- Signed in-app updates with automatic checks, download progress, active-session warnings, installation, and restart
- Resizable sidebar with persisted width and keyboard controls
- Right-click session editing from the folder tree and session lists
- Folder hierarchy and session placement preservation in JSON and CSV export/import

### Changed
- CSV exports now include backward-compatible folder and parent records
- Release automation now produces signed Windows updater artifacts and `latest.json`

### Fixed
- Prevent transient zero-byte SSH reads from being treated as disconnections
- Enable configured SSH keepalives and report remote EOF, exit status, transport errors, and keepalive failures
- Remove stale SSH connections and restore nonblocking mode after write failures
- Guard native Tauri IPC in browser previews with an actionable desktop-runtime message
- Preserve BMC protocol and metadata during import

### Security
- Verify updater packages with an embedded public key while keeping signing credentials outside Git
- Continue excluding credentials and sensitive BMC URL parameters from exported data

## [0.7.0] - 2026-08-03

### Added
- Saved and Quick Connect BMC / KVM over IP sessions with Dell iDRAC, HPE iLO, Lenovo XClarity, and Supermicro presets
- Restricted native child WebViews with per-tab lifecycle, native bounds, external-browser mode, reload controls, and cookie policy
- HTTP(S) reachability and Redfish diagnostics with structured status and latency results
- BMC server, serial, site, and rack metadata in SQLite FTS search and credential-free JSON/CSV import/export
- English and Hebrew BMC configuration strings

### Security
- Scope privileged Tauri capabilities to the main application WebView so remote BMC pages receive no SessionDock IPC permissions
- Deny BMC popup creation, restrict navigation to HTTP(S), reject embedded URL credentials, and disable devtools
- Omit token-, ticket-, password-, and session-bearing console URLs from persistence and exports
- Keep embedded certificate validation enabled; diagnostic TLS exceptions are isolated to their individual HTTP client

## [0.6.2] - 2026-08-03

### Fixed
- Save JSON/CSV exports, folder exports, and encrypted backups to the user-selected path
- Read JSON/CSV imports and encrypted backups reliably from native Open dialogs
- Flush completed file writes before reporting a successful save

## [0.6.1] - 2026-08-03

### Added
- New SessionDock logo across the application header, browser favicon, executable, and installer
- Folder context action to create a nested folder with the clicked folder preselected as its parent

## [0.6.0] - 2026-08-03

### Added
- Native Windows Open/Save dialogs for JSON and CSV session import/export
- Password-encrypted AES-GCM backup creation and restore
- Folder right-click menu for scoped session creation, rename, subtree export, and deletion
- Permanent Unfiled session area with pointer-based drag and drop

### Fixed
- Persist sessions and folders to SQLite and restore them at application startup
- Persist session edits, deletion, folder assignment, folder moves, and folder deletion
- Show unfiled sessions in the Sidebar and open saved sessions from the folder tree
- Update the About version from synchronized Tauri package metadata

### Added
- Initial project scaffold with Tauri 2 + React + TypeScript
- SQLite database with FTS5 full-text search
- Session CRUD operations
- Folder management with nesting
- Credential vault abstraction (Windows Credential Manager / macOS Keychain)
- Dark theme UI shell
- Sidebar navigation
- Terminal tab system
- Command palette (Ctrl+K)
- i18n support (English + Hebrew)
- Serial port listing
