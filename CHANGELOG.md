# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
