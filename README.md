<img src="public/icon-48.png" alt="SessionDock logo" width="48" height="48">

# SessionDock

A modern desktop application for managing SSH, Telnet, Serial, BMC, and VNC remote sessions.

Built for network engineers, data-center technicians, system administrators, and IT professionals who manage hundreds or thousands of network devices.

![Version](https://img.shields.io/badge/version-0.9.5-blue)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS-lightgrey)
![License](https://img.shields.io/badge/license-MIT-green)

## Features

### Connections and terminal

- **Native embedded SSH** - SSH runs in-process through libssh2; SessionDock does not wrap `ssh.exe`, Command Prompt, or PowerShell.
- **SSH authentication** - Supports password and keyboard-interactive authentication with an in-terminal credential prompt.
- **Hostname and IP support** - Resolves DNS names, tries all resolved addresses, and reports connection errors by stage.
- **Quick Connect** - Open an SSH, Telnet, Serial, BMC, or VNC connection without creating a saved session first.
- **BMC / KVM over IP** - Open iDRAC, iLO, XClarity, Supermicro IPMI, and other browser-based management consoles in restricted native child WebViews or the default browser.
- **VNC remote desktop** - Save or quickly open a VM desktop as a standalone VNC connection through RealVNC Viewer, using port 5900 by default.
- **BMC diagnostics** - Test HTTP(S) reachability, latency, authentication responses, and optional Redfish discovery before connecting.
- **Telnet support** - Connect to legacy network equipment with a clear transport security warning.
- **Serial support** - Detect serial ports and configure baud rate, data bits, stop bits, parity, and flow control.
- **Tabbed and split terminal workspace** - Run multiple concurrent sessions, split a terminal right or down into as many as four panes, and focus or close panes independently.
- **Full terminal interaction** - Raw keyboard input, control sequences, selection-aware copy, right-click paste, resize, links, scrolling, and remote output are handled by xterm.js.
- **Terminal search** - Find text in the active terminal and move between matches.
- **Semantic output colors** - Optionally highlights IP/CIDR addresses, MAC addresses, interfaces, VLANs, timestamps, status words, and ping results without changing the remote byte stream or overriding native ANSI colors.

### Session organization

- **Saved sessions** - Store connection profiles with protocol, host, port, username, vendor, model, device type, description, and tags.
- **Persistent local library** - Sessions and folders are stored in SQLite and restored automatically when SessionDock starts.
- **Session editing and deletion** - Update saved profiles or remove them with confirmation.
- **Session folder assignment** - Choose a folder while creating or editing a session, or drag sessions between folders and the permanent Unfiled area.
- **Nested folders** - Build multi-level folder hierarchies and drag folders into other folders.
- **Root reordering** - Drag nested folders back to the top level using the Sidebar root target.
- **Content-preserving folder deletion** - Delete a folder while moving its direct child folders and sessions to the deleted folder's parent.
- **Folder context actions** - Right-click a folder to create a session or nested folder inside it, rename it, export its subtree as JSON/CSV, or delete it.
- **Session search** - Search by name, host, vendor, model, description, and tags.
- **Command palette** - Press `Ctrl+K` to search sessions and run common application actions from the keyboard.
- **Native import and export** - Use Windows Open/Save dialogs for reliable JSON/CSV import and export to any user-selected path without credential secrets.
- **Encrypted backups** - Create and restore password-encrypted AES-GCM backups from the Data settings page using native file dialogs.

### Interface and preferences

- **Dark, light, and system themes** - Choose a theme mode that persists across restarts, with high-contrast dark-mode text.
- **Accent colors** - Switch instantly between Blue, Cyan, Green, Purple, and Orange accents.
- **Configurable terminal appearance** - Set terminal font family, font size, cursor style, cursor blink, scrollback, and semantic coloring.
- **Home dashboard** - View connection summaries, favorites, recent sessions, and saved sessions.
- **Keyboard shortcuts** - Quickly create sessions, close tabs, change tabs, and open the command palette.
- **English and Hebrew UI** - Includes right-to-left layout support for Hebrew.
- **Local-first design** - No account, analytics, telemetry, or cloud backend; application data remains on the local device.
- **Native desktop experience** - Compact Tauri interface with custom SessionDock branding, no console window, and a Windows NSIS installer.

## Security

- Passwords stored exclusively in OS credential vaults (never in SQLite or config files)
- SSH authentication handled entirely in-process (no external ssh.exe)
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
| SSH Backend | ssh2 crate (libssh2) â€” native in-process, no external ssh.exe |



| Database | SQLite with FTS5 (rusqlite) |
| Serial | serialport crate |
| Credentials | keyring crate (Win Credential Manager / macOS Keychain) |
| State | Zustand (with persist middleware) |
| i18n | react-i18next |
| Updates | tauri-plugin-updater |
| Icons | Lucide React + custom SessionDock application icons |

## Installation

### Windows

Download `SessionDock_0.9.1_x64-setup.exe` from the `release/` folder and run it. The NSIS installer will:
- Install to Program Files
- Create a Start Menu shortcut
- Support clean uninstall via Add/Remove Programs
- Upgrade in-place over previous versions (no uninstall needed)

> **Note:** Since the app is unsigned, Windows SmartScreen may show a warning. Click "More info" â†’ "Run anyway".

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
# Output: src-tauri\target\release\bundle\nsis\SessionDock_0.9.1_x64-setup.exe
```

> **Intel network users:** The build script automatically sets the proxy (`proxy-iil.intel.com:912`). If you're on a different network, remove the proxy lines from `build.ps1`.

### Run Tests

```powershell
npm test          # unit tests
npx tsc --noEmit  # TypeScript check
```

## Build Outputs

| Platform | Output | Location |
|----------|--------|----------|
| Windows | NSIS Installer (.exe) | `release/` (copied by build.ps1) |
| Windows | Raw binary | `src-tauri/target/release/sessiondock.exe` |
| macOS | DMG Installer (.dmg) | Built via GitHub Actions on macOS runner |

## Project Structure

```
SessionDock/
â”œâ”€â”€ public/                       # Browser favicon and in-app logo assets
â”œâ”€â”€ src/                          # React frontend
â”‚   â”œâ”€â”€ components/               # UI components
â”‚   â”‚   â”œâ”€â”€ forms/                # Session, Folder, QuickConnect, Credential forms
â”‚   â”‚   â”œâ”€â”€ views/                # HomeView, SettingsView, SessionList
â”‚   â”‚   â”œâ”€â”€ terminal/             # TerminalView (xterm.js)
â”‚   â”‚   â”œâ”€â”€ tree/                 # FolderTree with drag-and-drop
â”‚   â”‚   â”œâ”€â”€ search/               # SearchPanel with highlighting
â”‚   â”‚   â”œâ”€â”€ Sidebar.tsx           # Navigation sidebar
â”‚   â”‚   â”œâ”€â”€ MainContent.tsx       # View routing and terminal display
â”‚   â”‚   â”œâ”€â”€ TerminalTabs.tsx      # Tab bar
â”‚   â”‚   â”œâ”€â”€ CommandPalette.tsx    # Ctrl+K command palette
â”‚   â”‚   â”œâ”€â”€ ToastContainer.tsx    # Toast notifications
â”‚   â”‚   â””â”€â”€ UpdateNotification.tsx # Auto-update UI
â”‚   â”œâ”€â”€ stores/                   # Zustand state management
â”‚   â”‚   â”œâ”€â”€ appStore.ts           # UI state, tabs, navigation
â”‚   â”‚   â”œâ”€â”€ sessionStore.ts       # Sessions, folders, credentials
â”‚   â”‚   â”œâ”€â”€ settingsStore.ts      # Persistent settings
â”‚   â”‚   â”œâ”€â”€ themeStore.ts         # Theme mode + accent color
â”‚   â”‚   â””â”€â”€ toastStore.ts         # Notifications
â”‚   â”œâ”€â”€ locales/                  # i18n (en.json, he.json)
â”‚   â”œâ”€â”€ types/                    # TypeScript interfaces
â”‚   â”œâ”€â”€ api/                      # Tauri IPC command wrappers
â”‚   â”œâ”€â”€ utils/                    # Import/export, seed data
â”‚   â””â”€â”€ hooks/                    # Keyboard shortcuts
â”œâ”€â”€ src-tauri/                    # Rust backend
â”‚   â”œâ”€â”€ src/
â”‚   â”‚   â”œâ”€â”€ commands/             # Tauri IPC handlers
â”‚   â”‚   â”‚   â”œâ”€â”€ sessions.rs       # Session CRUD + FTS5 search
â”‚   â”‚   â”‚   â”œâ”€â”€ folders.rs        # Folder CRUD with nesting
â”‚   â”‚   â”‚   â”œâ”€â”€ credentials.rs    # Credential profiles (vault integration)
â”‚   â”‚   â”‚   â”œâ”€â”€ connections.rs    # SSH/Telnet connection management
â”‚   â”‚   â”‚   â”œâ”€â”€ terminal.rs       # spawn/write/close terminal commands
â”‚   â”‚   â”‚   â”œâ”€â”€ known_hosts.rs    # Host key verification
â”‚   â”‚   â”‚   â”œâ”€â”€ data.rs           # Export JSON/CSV, import
â”‚   â”‚   â”‚   â””â”€â”€ serial.rs        # Serial port listing
â”‚   â”‚   â”œâ”€â”€ terminal.rs          # Native SSH (ssh2/libssh2) + Telnet process manager
â”‚   â”‚   â”œâ”€â”€ credential_vault/    # OS vault abstraction (keyring)
â”‚   â”‚   â”œâ”€â”€ protocols/           # SSH, Telnet, Serial protocol types
â”‚   â”‚   â”œâ”€â”€ migrations/          # SQLite schema (FTS5, indexes)
â”‚   â”‚   â”œâ”€â”€ db.rs                # Database init + migrations
â”‚   â”‚   â”œâ”€â”€ models.rs            # Data models (Session, Folder, etc.)
â”‚   â”‚   â”œâ”€â”€ error.rs             # Error types
â”‚   â”‚   â””â”€â”€ lib.rs               # Tauri app setup + command registration
â”‚   â”œâ”€â”€ icons/                   # App icons (ICO, PNG, ICNS)
â”‚   â”œâ”€â”€ capabilities/            # Tauri security permissions
â”‚   â””â”€â”€ tauri.conf.json          # Tauri configuration
â”œâ”€â”€ release/                     # Built installers (gitignored)
â”œâ”€â”€ scripts/                     # Build and update scripts
â”‚   â””â”€â”€ serve-updates.ps1
â”œâ”€â”€ .github/                     # CI/CD workflows
â”‚   â”œâ”€â”€ workflows/ci.yml         # PR checks (lint, test, build)
â”‚   â””â”€â”€ workflows/release.yml    # Signed Windows release and updater artifacts
â”œâ”€â”€ build.ps1                    # One-command build script
â”œâ”€â”€ SECURITY.md                  # Security model documentation
â”œâ”€â”€ CONTRIBUTING.md              # Contribution guidelines
â”œâ”€â”€ CHANGELOG.md                 # Version history
â””â”€â”€ LICENSE                      # MIT
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

MIT License â€” see [LICENSE](LICENSE)

## Security Policy

See [SECURITY.md](SECURITY.md) for vulnerability reporting.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.
