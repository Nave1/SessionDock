# SessionDock

A modern, fast, lightweight desktop application for managing and opening SSH, Telnet, and Serial terminal sessions.

Built for network engineers, data-center technicians, system administrators, and IT professionals who manage hundreds or thousands of network devices.

![Version](https://img.shields.io/badge/version-0.3.0-blue)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS-lightgrey)
![License](https://img.shields.io/badge/license-MIT-green)

## Features

- **Native Embedded SSH** — In-process SSH via libssh2 (ssh2 crate). No ssh.exe, no CMD window. Password auth handled inside the app
- **Quick Connect** — Enter host, username, password, press Enter. Connects instantly without saving
- **Edit & Delete Sessions** — Hover any session to edit (pencil) or delete (trash) with confirmation
- **Saved Sessions** — Create and organize connection profiles with device metadata (vendor, model, device type, description, tags)
- **Command Palette** — Ctrl+K to search sessions by name, IP, vendor, model. Ranked results with highlighting. Type > for app commands
- **Nested Folders** — Organize sessions in deep folder hierarchies with drag-and-drop
- **Terminal Tabs** — Multiple concurrent sessions with status indicators (connected/connecting/disconnected)
- **Telnet** — Legacy equipment support with security warnings
- **Serial** — Serial port detection and configurable baud/parity/flow control
- **Secure Credentials** — Windows Credential Manager / macOS Keychain integration (passwords never in SQLite)
- **Import/Export** — Import from JSON/CSV via file picker; safe export without credentials
- **Dark & Light Mode** — Professional dark theme (default), light mode, system-follow. Persists across restarts
- **Accent Colors** — Blue, Cyan, Green, Purple, Orange — click to change, instantly applied
- **Persistent Settings** — All preferences saved locally via Zustand persist middleware
- **Auto-Update** — In-app update notification when new versions are published to GitHub Releases
- **No Console Window** — Pure GUI app, no background CMD window at any point
- **Multilingual** — English and Hebrew UI with RTL support
- **Cross-Platform** — Windows-first, macOS architecture ready
- **No Telemetry** — No analytics, no cloud, no account, no internet required

## Security

- Passwords stored exclusively in OS credential vaults (never in SQLite or config files)
- SSH authentication handled entirely in-process (no external ssh.exe)
- No telemetry, no analytics, no cloud backend
- All data stays local on your device
- Credential vault abstraction for Windows Credential Manager and macOS Keychain

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Framework | Tauri 2 |
| Frontend | React 18 + TypeScript |
| Build | Vite 6 |
| Styling | Tailwind CSS 4 |
| Terminal | xterm.js 5 |
| SSH Backend | ssh2 crate (libssh2) — native in-process, no external ssh.exe |
| Database | SQLite with FTS5 (rusqlite) |
| Serial | serialport crate |
| Credentials | keyring crate (Win Credential Manager / macOS Keychain) |
| State | Zustand (with persist middleware) |
| i18n | react-i18next |
| Updates | tauri-plugin-updater |
| Icons | Lucide React |

## Installation

### Windows

Download `SessionDock_0.3.0_x64-setup.exe` from the `release/` folder and run it. The NSIS installer will:
- Install to Program Files
- Create a Start Menu shortcut
- Support clean uninstall via Add/Remove Programs
- Upgrade in-place over previous versions (no uninstall needed)

> **Note:** Since the app is unsigned, Windows SmartScreen may show a warning. Click "More info" → "Run anyway".

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
# Output: src-tauri\target\release\bundle\nsis\SessionDock_0.3.0_x64-setup.exe
```

> **Intel network users:** The build script automatically sets the proxy (`proxy-iil.intel.com:912`). If you're on a different network, remove the proxy lines from `build.ps1`.

### Run Tests

```powershell
npm test          # 33 unit tests
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
├── src/                          # React frontend
│   ├── components/               # UI components
│   │   ├── forms/                # Session, Folder, QuickConnect, Credential forms
│   │   ├── views/                # HomeView, SettingsView, SessionList
│   │   ├── terminal/             # TerminalView (xterm.js)
│   │   ├── tree/                 # FolderTree with drag-and-drop
│   │   ├── search/               # SearchPanel with highlighting
│   │   ├── Sidebar.tsx           # Navigation sidebar
│   │   ├── MainContent.tsx       # View routing and terminal display
│   │   ├── TerminalTabs.tsx      # Tab bar
│   │   ├── CommandPalette.tsx    # Ctrl+K command palette
│   │   ├── ToastContainer.tsx    # Toast notifications
│   │   └── UpdateNotification.tsx # Auto-update UI
│   ├── stores/                   # Zustand state management
│   │   ├── appStore.ts           # UI state, tabs, navigation
│   │   ├── sessionStore.ts       # Sessions, folders, credentials
│   │   ├── settingsStore.ts      # Persistent settings
│   │   ├── themeStore.ts         # Theme mode + accent color
│   │   └── toastStore.ts         # Notifications
│   ├── locales/                  # i18n (en.json, he.json)
│   ├── types/                    # TypeScript interfaces
│   ├── api/                      # Tauri IPC command wrappers
│   ├── utils/                    # Import/export, seed data
│   └── hooks/                    # Keyboard shortcuts
├── src-tauri/                    # Rust backend
│   ├── src/
│   │   ├── commands/             # Tauri IPC handlers
│   │   │   ├── sessions.rs       # Session CRUD + FTS5 search
│   │   │   ├── folders.rs        # Folder CRUD with nesting
│   │   │   ├── credentials.rs    # Credential profiles (vault integration)
│   │   │   ├── connections.rs    # SSH/Telnet connection management
│   │   │   ├── terminal.rs       # spawn/write/close terminal commands
│   │   │   ├── known_hosts.rs    # Host key verification
│   │   │   ├── data.rs           # Export JSON/CSV, import
│   │   │   └── serial.rs        # Serial port listing
│   │   ├── terminal.rs          # Native SSH (ssh2/libssh2) + Telnet process manager
│   │   ├── credential_vault/    # OS vault abstraction (keyring)
│   │   ├── protocols/           # SSH, Telnet, Serial protocol types
│   │   ├── migrations/          # SQLite schema (FTS5, indexes)
│   │   ├── db.rs                # Database init + migrations
│   │   ├── models.rs            # Data models (Session, Folder, etc.)
│   │   ├── error.rs             # Error types
│   │   └── lib.rs               # Tauri app setup + command registration
│   ├── icons/                   # App icons (ICO, PNG, ICNS)
│   ├── capabilities/            # Tauri security permissions
│   └── tauri.conf.json          # Tauri configuration
├── release/                     # Built installers (gitignored)
├── scripts/                     # Build and update scripts
│   ├── generate-update-manifest.ps1
│   └── serve-updates.ps1
├── .github/                     # CI/CD workflows
│   ├── workflows/ci.yml         # PR checks (lint, test, build)
│   └── workflows/release.yml    # Windows + macOS release builds
├── build.ps1                    # One-command build script
├── SECURITY.md                  # Security model documentation
├── CONTRIBUTING.md              # Contribution guidelines
├── CHANGELOG.md                 # Version history
└── LICENSE                      # MIT
```

## Auto-Updates

SessionDock includes a built-in update system:

1. On launch, it checks a GitHub Releases endpoint for new versions
2. If an update is available, a notification appears with version info and release notes
3. Click "Update Now" to download and install in-place (no manual uninstall needed)

**To publish an update:**
```powershell
# 1. Bump version in tauri.conf.json and package.json
# 2. Build with manifest
.\build.ps1 -Release
# 3. Upload .exe + latest.json to GitHub Releases
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+K` | Open command palette |
| `Ctrl+N` | New session |
| `Ctrl+W` | Close current tab |
| `Ctrl+Tab` | Next tab |
| `Ctrl+Shift+Tab` | Previous tab |

## License

MIT License — see [LICENSE](LICENSE)

## Security Policy

See [SECURITY.md](SECURITY.md) for vulnerability reporting.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.
