# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
