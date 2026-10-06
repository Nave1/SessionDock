# SessionDock Agent Guidance

Before implementing, modifying, reviewing, or debugging a SessionDock feature, identify and load every relevant skill from `.github/skills/`.

Always load `sessiondock-testing` for feature implementations and bug fixes. Load `sessiondock-security` for every security-sensitive or infrastructure-operating change, including credentials, authentication, SSH, SFTP, tunnels, jump hosts, BMC/WebViews, files, imports/exports, backups, updates, terminal logging, IPC, plugins, automation, AI assistance, or network-connected code.

Load task-specific skills as applicable:

- Rust, Tauri, IPC, database, capabilities, updater, WebView, filesystem, concurrency, and backend work: `sessiondock-rust-tauri`
- SSH, SFTP/SCP, jump hosts, tunnels, Telnet, Serial, reconnect, and terminal lifecycle: `sessiondock-terminal-protocols`
- Device detection, providers, quick commands, parsers, diagnostics, and comparisons: `sessiondock-device-provider`
- Network-device and data-center workflows: `sessiondock-network-engineering`
- React UI, terminal workspace UX, accessibility, localization, and interaction design: `sessiondock-ui`

Do not mark work complete until the relevant skill Definition of Done and security/testing gates have been satisfied.