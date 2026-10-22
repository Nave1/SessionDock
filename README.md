<img src="public/icon-48.png" alt="SessionDock logo" width="48" height="48">

# SessionDock

A modern desktop application for managing SSH, Telnet, Serial, BMC, and VNC remote sessions.

Built for network engineers, data-center technicians, system administrators, and IT professionals who manage hundreds or thousands of network devices.

![Version](https://img.shields.io/badge/version-1.1.0-blue)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS-lightgrey)
![License](https://img.shields.io/badge/license-MIT-green)

## What's new in v1.1.0

- The integrated Files workspace now provides a WinSCP-style dual-pane view: local drives and folders on the left, and the connected device on the right.
- Upload and download selected files directly between panes, with existing progress, pause, resume, cancel, retry, staging, and overwrite controls.
- Create, rename, and delete local or remote entries through native, path-validated operations without launching external WinSCP.
- Remote browsing uses the authenticated SFTP subsystem; SCP remains available for explicit single-file transfers when selected.

> **v1.0.1 credential repair:** passwords created with v1.0.1 were not persisted and cannot be recovered. After updating, edit each affected credential profile and save its password once.

## Features

### Connections and terminal

- **Native embedded SSH** - SSH runs in-process through libssh2; SessionDock does not wrap `ssh.exe`, Command Prompt, or PowerShell.
- **SSH authentication** - Supports password, keyboard-interactive, OpenSSH private-key, and SSH-agent authentication through native libssh2 APIs.
- **SSH host trust** - Requires explicit fingerprint approval for new hosts and blocks changed keys until the saved trust entry is reviewed and removed.
- **SSH jump hosts** - Route saved SSH sessions through an ordered chain of up to five credential-ready bastions using native libssh2 `direct-tcpip` channels.
- **Dual-pane file workspace** - Browse local drives and the connected device side by side, manage entries in either pane, and transfer selected files without an external application.
- **Integrated SFTP** - Browse, upload, download, rename, delete, and create directories through the authenticated SSH pane, including ProxyJump routes.
- **SCP compatibility transfers** - Stream single-file uploads and downloads through authenticated SSH and ProxyJump panes when a server does not provide SFTP; SFTP remains the default.
- **Saved-session SCP** - Start SCP from an SSH session's sidebar context menu or session-list action and choose a saved password credential or enter credentials manually.
- **Transfer controls** - Stream files with progress, pause, resume, cancel, and retry controls without buffering entire files in memory.
- **Transfers workspace** - Start a transfer on a connected SSH pane, monitor every in-process SFTP and SCP job across open panes, filter runtime history, focus its owning connection, and control active or failed work globally.
- **SSH local tunnels** - Forward an automatic or chosen `127.0.0.1` port through an authenticated SSH or ProxyJump pane to a remote host and port.
- **SSH remote tunnels** - Request an automatic or chosen server-side `127.0.0.1` port and forward accepted connections back to a local target.
- **SSH dynamic forwarding** - Run a pane-owned SOCKS5 CONNECT proxy on an automatic or chosen local `127.0.0.1` port, including domain requests resolved through the SSH path.
- **Tunnels workspace** - Open the tunnel creator on a connected SSH pane, inspect every active local, remote, and dynamic forward, filter runtime endpoints, focus its owning pane, and stop it from one operational table.
- **Hostname and IP support** - Resolves DNS names, tries all resolved addresses, and reports connection errors by stage.
- **Quick Connect** - Open SSH, SCP, Telnet, Serial, BMC, or VNC without creating a saved session first. SSH and SCP can use a saved password credential or manually entered credentials.
- **BMC / KVM over IP** - Open iDRAC, iLO, XClarity, Supermicro IPMI, and other browser-based management consoles in restricted native child WebViews or the default browser.
- **VNC remote desktop** - Save or quickly open a VM desktop as a standalone VNC connection through RealVNC Viewer, using port 5900 by default.
- **BMC diagnostics** - Test HTTP(S) reachability, latency, authentication responses, and optional Redfish discovery before connecting.
- **Telnet support** - Connect to legacy network equipment with a clear transport security warning.
- **Serial support** - Detect connected serial ports, merge the Windows serial registry as a discovery fallback, sort COM ports naturally, and configure baud rate, data bits, stop bits, parity, and flow control.
- **Tabbed and split terminal workspace** - Run multiple concurrent sessions, split a terminal right or down into as many as four panes, and focus or close panes independently.
- **Active Connections workspace** - Search and filter every open pane, inspect protocol, endpoint, and live status, then focus, reconnect, explicitly disconnect, or close it from one operational table.
- **Full terminal interaction** - Raw keyboard input, control sequences, selection-aware copy, right-click paste, resize, links, scrolling, and remote output are handled by xterm.js.
- **Terminal search** - Find text in the active terminal and move between matches.
- **Opt-in terminal logging** - Record raw remote output for SSH, Telnet, or Serial panes to timestamped files in an explicitly selected local folder, with a persistent recording indicator and pane-owned stop/flush behavior.
- **Optional auto reconnect** - Configure saved SSH, Telnet, and Serial sessions to stay disconnected, retry once, or retry automatically with exponential backoff capped at 30 seconds and a visible cancel control.
- **Command snippets** - Create, search, edit, favorite, and categorize reusable commands in a pane-side library; insertion shows and copies the exact command into the SSH terminal without pressing Enter.
- **Device Info and Quick Commands** - Match configured session metadata to conservative Generic SSH, Linux, or Arista EOS providers and expose exact read-only commands for insertion without automatic probing or execution.
- **Structured device diagnostics** - Run provider-specific allowlisted checks in isolated SSH channels with status, exit code, truncation state, and raw stdout/stderr shown beside the terminal.
- **Diagnostics workspace** - Open Device Info on a connected SSH pane to select an allowlisted check, then monitor checks across panes, inspect raw output, cancel active work, or rerun finished checks.
- **MultiExec** - Review one exact command against explicitly selected connected SSH panes, confirm modifying or high-risk batches, and inspect status plus raw output independently for every target.
- **Semantic output colors** - Optionally highlights IP/CIDR addresses, MAC addresses, interfaces, VLANs, timestamps, status words, and ping results without changing the remote byte stream or overriding native ANSI colors.

### Session organization

- **Saved sessions** - Store connection profiles with protocol, host, port, username, vendor, model, device type, description, and tags.
- **Persistent local library** - Sessions, folders, and groups are stored in SQLite and restored automatically when SessionDock starts.
- **Session groups** - Build flat reusable groups whose sessions can overlap, edit membership from a searchable list, and connect up to 25 group members together with confirmation for larger batches.
- **Session editing and deletion** - Update saved profiles or remove them with confirmation from the session list, sidebar trash icon, or sidebar context menu.
- **Credential profile editing** - Update vault-backed usernames and passwords, explicitly reveal the current password when needed, and repair profiles with missing secrets.
- **Session folder assignment** - Choose a folder while creating or editing a session, or drag sessions between folders and the permanent Unfiled area.
- **Nested folders** - Build multi-level folder hierarchies and drag folders into other folders.
- **Root reordering** - Drag nested folders back to the top level using the Sidebar root target.
- **Content-preserving folder deletion** - Delete a folder while moving its direct child folders and sessions to the deleted folder's parent.
- **Folder context actions** - Right-click a folder to create a session or nested folder inside it, rename it, export its subtree as JSON/CSV, or delete it.
- **Session search** - Search by name, host, vendor, model, description, and tags.
- **Command palette** - Press `Ctrl+K` to search sessions and run common application actions from the keyboard.
- **Native import and export** - Use Windows Open/Save dialogs for reliable JSON/CSV import and export to any user-selected path without credential secrets.
- **Export boundary** - Normal exports omit credential profiles, private-key paths, and jump-host routing links so restored data cannot silently inherit access paths.
- **Encrypted backups** - Create and restore password-encrypted AES-GCM backups from the Data settings page using native file dialogs.

### Interface and preferences

- **Dark, light, and system themes** - Choose a theme mode that persists across restarts, with high-contrast dark-mode text.
- **Accent colors** - Switch instantly between Blue, Cyan, Green, Purple, and Orange accents.
- **Configurable terminal behavior** - Apply terminal font family, font size, line height, cursor style and blink, scrollback, copy-on-select, visual bell, and semantic coloring to active terminals.
- **Home dashboard** - View connection summaries, favorites, recent sessions, and saved sessions.
- **Keyboard shortcuts** - Quickly create sessions, close tabs, change tabs, and open the command palette.
- **English and Hebrew UI** - Includes right-to-left layout support for Hebrew.
- **Local-first design** - No account, analytics, telemetry, or cloud backend; application data remains on the local device.
- **Native desktop experience** - Compact Tauri interface with custom SessionDock branding, no console window, and a Windows NSIS installer.
- **Signed automatic updates** - Check GitHub releases for signed updater manifests and install verified SessionDock updates in place.

## Using Transfers, Tunnels, and Diagnostics

These workspaces operate on an authenticated SSH connection. Their primary action uses the active connected SSH pane when possible; if none is available, SessionDock opens Quick Connect.

### Transfers

1. Open **Transfers** and select **Start transfer**.
2. Navigate local drives in the left pane and the connected device in the right pane.
3. Select a local file to upload or a remote file to download into the current local directory.
4. Keep **SFTP** selected for remote browsing and file management, or choose **SCP** for a single file at an absolute remote path.
5. Use the Transfers workspace to monitor progress, pause, resume, cancel, or retry.

### Tunnels

1. Open **Tunnels** and select **Create tunnel**.
2. Choose local forwarding, remote forwarding, or a dynamic SOCKS5 proxy and enter the listener and target details.
3. Start the tunnel. The Tunnels workspace shows its runtime endpoint and provides focus and stop controls.

All tunnel listeners are restricted to `127.0.0.1`.

### Diagnostics

1. Open **Diagnostics** and select **Run diagnostic**.
2. Device Info opens on the selected SSH pane. Choose one of the provider's predefined checks.
3. Review status and bounded raw output in the Diagnostics workspace, where active checks can be cancelled and completed checks can be rerun.

Diagnostics use backend allowlisted commands; this workspace does not accept arbitrary commands.

## Security

- Passwords stored exclusively in OS credential vaults (never in SQLite or config files)
- Private keys remain at their original filesystem path; optional passphrases are stored only in the OS credential vault
- SSH authentication handled entirely in-process (no external ssh.exe)
- SSH host keys are verified before authentication and rechecked by the backend before a terminal opens
- Every jump host is resolved, authenticated, and host-key verified independently; internal bridge listeners bind only to loopback
- SFTP reuses the authenticated SSH transport, validates remote paths and metadata, stages transfers before publishing, and requires confirmation before overwrite
- Closing an SSH pane cancels its active transfers; failed and cancelled jobs remove staged partial files where the remote server permits it
- Local tunnel listeners bind only to `127.0.0.1`, open one native SSH `direct-tcpip` channel per client, and stop with their owning pane
- Remote tunnel listeners request only server-side `127.0.0.1` binds, connect to an explicit local target, and are cancelled when their owning pane closes
- Dynamic SOCKS listeners bind only to `127.0.0.1`, support CONNECT without proxy authentication, and stop with their owning pane; SOCKS BIND and UDP are not supported
- Command snippets are bounded and validated before local SQLite storage; inserting a snippet never submits it, and destructive classification is user-authored metadata rather than a safety guarantee
- Device provider matching uses configured local metadata only; fallback never guesses a vendor, Quick Command classification is advisory, and commands are neither probed nor executed automatically
- Structured diagnostics accept provider and check identifiers only; Rust resolves a fixed allowlist, uses a separate SSH channel, caps runtime and combined output, cancels pane-owned jobs on close, and keeps global history in bounded memory only
- MultiExec reclassifies commands in Rust, treats classification as advisory, limits each batch to 25 unique connected panes, requires explicit acknowledgement for modifying commands and an exact target-count phrase for high-risk commands, and applies per-target runtime/output caps
- Terminal logging is disabled by default, requires an explicit sensitive-data confirmation and native folder selection, writes create-new timestamped files locally, never uploads them, performs no claimed secret redaction, and flushes when its pane closes
- Auto reconnect remains disabled by default, never runs after an explicit disconnect, and stops for host-key trust decisions, interactive credential prompts, and authentication-stage failures
- No telemetry, no analytics, no cloud backend
- All data stays local on your device
- Credential vault abstraction for Windows Credential Manager and macOS Keychain
- BMC remote pages receive no SessionDock capability or privileged IPC access; popup creation is denied and navigation is limited to HTTP(S)
- Token-, ticket-, and session-bearing console URLs are available ephemerally but omitted from persistence and export
- Embedded BMC certificate validation remains enabled; SessionDock never applies a global TLS bypass

### BMC limitations

- Vendor consoles that require Java applets, native browser extensions, or unrestricted popup windows may need External Browser mode.
- The "ignore TLS errors" preference applies only to the explicit connection diagnostic request. Tauri/WebView2 does not expose a safe per-child-WebView certificate bypass, so embedded consoles continue to validate certificates.
- Tab cookie isolation uses the platform WebView's incognito support. Behavior depends on the installed WebView2/WKWebView version.

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Framework | Tauri 2 |
| Frontend | React 18 + TypeScript |
| Build | Vite 6 |
| Styling | Tailwind CSS 4 |
| Terminal | xterm.js 5 |
| SSH Backend | ssh2 crate (libssh2) - native in-process, no external ssh.exe |

| Database | SQLite with FTS5 (rusqlite) |
| Serial | serialport crate |
| Credentials | keyring crate (Win Credential Manager / macOS Keychain) |
| State | Zustand (with persist middleware) |
| i18n | react-i18next |
| Updates | tauri-plugin-updater |
| Icons | Lucide React + custom SessionDock application icons |

## Installation

### Windows

Download `SessionDock_1.1.0_x64-setup.exe` from the [v1.1.0 GitHub release](https://github.com/Nave1/SessionDock/releases/tag/v1.1.0) and run it. The NSIS installer will:
- Install to Program Files
- Create a Start Menu shortcut
- Support clean uninstall via Add/Remove Programs
- Upgrade in-place over previous versions (no uninstall needed)

> **Note:** Since the app is unsigned, Windows SmartScreen may show a warning. Click "More info" -> "Run anyway".

## Development Setup

### Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [Rust](https://rustup.rs/) >= 1.77 (run `rustup default stable`)
- [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with "Desktop development with C++" workload
- [Tauri CLI](https://v2.tauri.app/start/prerequisites/) (installed via npm)

### Quick Start

```powershell
cd C:\projects\SessionDock

# Install frontend dependencies
npm install

# Run in development mode (hot-reload)
npm run tauri dev

# Run frontend only (no Rust backend)
npm run dev
```

### Build Windows Installer

```powershell
# One-command build (sets proxy, builds, copies .exe to release/)
.\build.ps1

# Or manually:
npx tauri build
# Output: src-tauri\target\release\bundle\nsis\SessionDock_1.0.0_x64-setup.exe
```

> **Intel network users:** The build script automatically sets the proxy (`proxy-iil.intel.com:912`). If you're on a different network, remove the proxy lines from `build.ps1`.

### Run Tests

```powershell
npm test          # unit tests
npm run lint      # TypeScript and React correctness lint
npx tsc --noEmit  # TypeScript check

# Dependency security audits
npm audit --audit-level=high
cargo install cargo-audit --version 0.22.2 --locked
cargo audit --manifest-path src-tauri/Cargo.toml
```

Dependency audits also run in CI when either lockfile changes and on a weekly schedule.

## Build Outputs

| Platform | Output | Location |
|----------|--------|----------|
| Windows | NSIS Installer (.exe) | `release/` (copied by build.ps1) |
| Windows | Raw binary | `src-tauri/target/release/sessiondock.exe` |
| macOS | DMG Installer (.dmg) | Built via GitHub Actions on macOS runner |

## Project Structure

```
SessionDock/
|-- public/                       # Browser favicon and in-app logo assets
|-- src/                          # React frontend
|   |-- components/               # UI components
|   |   |-- forms/                # Session, Folder, QuickConnect, Credential forms
|   |   |-- views/                # HomeView, SettingsView, SessionList
|   |   |-- terminal/             # TerminalView (xterm.js)
|   |   |-- tree/                 # FolderTree with drag-and-drop
|   |   |-- search/               # SearchPanel with highlighting
|   |   |-- Sidebar.tsx           # Navigation sidebar
|   |   |-- MainContent.tsx       # View routing and terminal display
|   |   |-- TerminalTabs.tsx      # Tab bar
|   |   |-- CommandPalette.tsx    # Ctrl+K command palette
|   |   |-- ToastContainer.tsx    # Toast notifications
|   |   `-- UpdateNotification.tsx # Auto-update UI
|   |-- stores/                   # Zustand state management
|   |   |-- appStore.ts           # UI state, tabs, navigation
|   |   |-- sessionStore.ts       # Sessions, folders, credentials
|   |   |-- settingsStore.ts      # Persistent settings
|   |   |-- themeStore.ts         # Theme mode + accent color
|   |   `-- toastStore.ts         # Notifications
|   |-- locales/                  # i18n (en.json, he.json)
|   |-- types/                    # TypeScript interfaces
|   |-- api/                      # Tauri IPC command wrappers
|   |-- utils/                    # Import/export, seed data
|   `-- hooks/                    # Keyboard shortcuts
|-- src-tauri/                    # Rust backend
|   |-- src/
|   |   |-- commands/             # Tauri IPC handlers
|   |   |   |-- sessions.rs       # Session CRUD + FTS5 search
|   |   |   |-- folders.rs        # Folder CRUD with nesting
|   |   |   |-- credentials.rs    # Credential profiles (vault integration)
|   |   |   |-- connections.rs    # SSH/Telnet connection management
|   |   |   |-- terminal.rs       # spawn/write/close terminal commands
|   |   |   |-- known_hosts.rs    # Host key verification
|   |   |   |-- data.rs           # Export JSON/CSV, import
|   |   |   `-- serial.rs         # Serial port listing
|   |   |-- terminal.rs           # Native SSH (ssh2/libssh2) + Telnet process manager
|   |   |-- credential_vault/     # OS vault abstraction (keyring)
|   |   |-- protocols/            # SSH, Telnet, Serial protocol types
|   |   |-- migrations/           # SQLite schema (FTS5, indexes)
|   |   |-- db.rs                 # Database init + migrations
|   |   |-- models.rs             # Data models (Session, Folder, etc.)
|   |   |-- error.rs              # Error types
|   |   `-- lib.rs                # Tauri app setup + command registration
|   |-- icons/                    # App icons (ICO, PNG, ICNS)
|   |-- capabilities/             # Tauri security permissions
|   `-- tauri.conf.json           # Tauri configuration
|-- release/                      # Retained current and previous installers
|-- scripts/                      # Build and update scripts
|   `-- serve-updates.ps1
|-- .github/                      # CI/CD workflows
|   |-- workflows/ci.yml          # PR checks (lint, test, build)
|   `-- workflows/release.yml     # Signed Windows release and updater artifacts
|-- build.ps1                     # One-command build script
|-- SECURITY.md                   # Security model documentation
|-- CONTRIBUTING.md               # Contribution guidelines
|-- CHANGELOG.md                  # Version history
`-- LICENSE                       # MIT
```

## Auto-Updates

SessionDock includes a built-in update system:

1. On launch, it checks a GitHub Releases endpoint for new versions
2. If an update is available, a notification appears with version info and release notes
3. Click "Update Now" to download and install in-place (no manual uninstall needed)

**To publish an update:**
```powershell
# One-time repository setup (run only from a trusted machine):
Get-Content src-tauri\.tauri-private-key -Raw | gh secret set TAURI_SIGNING_PRIVATE_KEY
Get-Content src-tauri\.tauri-key-password -Raw | gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD

# For each release, bump the version in package.json, src-tauri/tauri.conf.json,
# and src-tauri/Cargo.toml, then push a matching version tag.
git tag v0.8.0
git push origin v0.8.0
```

The release workflow builds signed updater packages and publishes `latest.json` automatically. Installed copies check shortly after launch, whenever the app becomes active, and every six hours. The updater downloads, verifies, installs, and restarts SessionDock in place.

Keep `src-tauri/.tauri-private-key` and `src-tauri/.tauri-key-password` private and backed up securely. Losing either prevents existing installations from trusting future updates. Never commit them to Git.

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+K` | Open command palette |
| `Ctrl+N` | New session |
| `Ctrl+W` | Close current tab |
| `Ctrl+Tab` | Next tab |
| `Ctrl+Shift+Tab` | Previous tab |

## License

MIT License - see [LICENSE](LICENSE)

## Security Policy

See [SECURITY.md](SECURITY.md) for vulnerability reporting.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.
