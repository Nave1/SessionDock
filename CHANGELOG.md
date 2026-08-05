# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
