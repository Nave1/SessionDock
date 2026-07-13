# SessionDock

A modern, fast, cross-platform desktop application for managing and opening SSH, Telnet, and Serial terminal sessions.

Built for network engineers, data-center technicians, system administrators, and IT professionals who manage hundreds or thousands of network devices.

## Features

- **Saved Sessions** — Create and organize connection profiles with full device metadata
- **Nested Folders** — Organize sessions in deep folder hierarchies
- **Global Search** — Instantly find sessions by name, IP, hostname, tag, vendor, or description
- **Terminal Tabs** — Open multiple concurrent terminal sessions
- **SSH** — Password, private key, and SSH agent authentication with host-key verification
- **Telnet** — Legacy equipment support with security warnings
- **Serial** — Full serial port configuration (baud, parity, flow control)
- **Secure Credentials** — Windows Credential Manager / macOS Keychain integration
- **Import/Export** — JSON, CSV, and encrypted backup
- **Dark Mode** — Professional dark theme with light/system mode options
- **Multilingual** — English and Hebrew with full RTL support
- **Cross-Platform** — Windows and macOS

## Security

- Passwords stored exclusively in OS credential vaults (never in SQLite or files)
- SSH host-key verification with known-host management
- No telemetry, no analytics, no cloud backend
- All data stays local on your device
- Encrypted backup with authenticated encryption

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Framework | Tauri 2 |
| Frontend | React 18 + TypeScript |
| Build | Vite 6 |
| Styling | Tailwind CSS 4 |
| Terminal | xterm.js |
| Database | SQLite (rusqlite) |
| SSH | russh |
| Serial | serialport |
| Credentials | keyring (Win Credential Manager / macOS Keychain) |
| State | Zustand |
| i18n | react-i18next |

## Development Setup

### Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [Rust](https://rustup.rs/) >= 1.77
- [Tauri CLI](https://v2.tauri.app/start/prerequisites/)

### Windows Development

```powershell
# Clone repository
git clone https://github.com/your-org/sessiondock.git
cd sessiondock

# Install frontend dependencies
npm install

# Run in development mode
npm run tauri dev

# Build Windows installer
npm run tauri build
```

### macOS Development

```bash
# Install dependencies
npm install

# Run in development mode  
npm run tauri dev

# Build macOS .dmg
npm run tauri build
```

## Build Outputs

| Platform | Output | Location |
|----------|--------|----------|
| Windows | NSIS Installer (.exe) | `src-tauri/target/release/bundle/nsis/` |
| macOS | DMG Installer (.dmg) | `src-tauri/target/release/bundle/dmg/` |

## Project Structure

```
sessiondock/
├── src/                    # React frontend
│   ├── components/         # UI components
│   ├── stores/             # Zustand state
│   ├── hooks/              # React hooks
│   ├── locales/            # i18n translations
│   └── types/              # TypeScript types
├── src-tauri/              # Rust backend
│   ├── src/
│   │   ├── commands/       # Tauri IPC commands
│   │   ├── protocols/      # SSH, Telnet, Serial
│   │   ├── credential_vault/ # OS credential integration
│   │   ├── migrations/     # SQLite migrations
│   │   └── models.rs       # Data models
│   └── Cargo.toml
├── .github/workflows/      # CI/CD
└── docs/                   # Documentation
```

## License

MIT License — see [LICENSE](LICENSE)

## Security Policy

See [SECURITY.md](SECURITY.md) for vulnerability reporting.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.
