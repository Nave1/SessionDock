---
name: sessiondock-security
description: Security engineering rules and review gates for SessionDock, a security-sensitive Remote Infrastructure Workspace.
---

# SessionDock Security Skill

## Purpose

Use this skill whenever implementing, modifying, reviewing, or debugging any SessionDock feature that touches:

- credentials
- authentication
- SSH
- SFTP
- tunnels
- jump hosts
- BMC/WebView
- filesystem access
- import/export
- backups
- updates
- terminal logging
- IPC
- plugins
- automation
- AI assistance
- network-connected code

SessionDock handles privileged infrastructure access. Treat every boundary as hostile until proven otherwise.

## Core Security Principles

Always prefer:

- least privilege
- explicit trust
- defense in depth
- local-first storage
- OS-native secret storage
- authenticated encryption
- secure defaults
- narrow permissions
- transparent operations
- fail-closed behavior

Never trade security for convenience without an explicit, documented design decision.

## Credential Rules

Persistent secrets must never be stored in:

- SQLite
- JSON exports
- CSV exports
- plaintext configuration
- logs
- crash reports
- analytics
- telemetry
- frontend state persistence

Use:

- Windows Credential Manager
- macOS Keychain

Private key passphrases and passwords must remain backend-controlled whenever possible.

Avoid passing secrets through React unless absolutely required.

Minimize secret lifetime in memory.

Avoid unnecessary cloning of secret-bearing Rust strings.

Use zeroization where practical.

Never log credential objects, authorization headers, session cookies, tokens, BMC console URLs, or temporary access tickets.

## SSH Security

Host-key validation is mandatory.

For a new host key, display:

- hostname
- resolved IP where available
- key algorithm
- fingerprint

Require explicit user trust.

If a known host key changes:

- stop the connection
- display a high-severity warning
- never silently replace the stored key

Every jump-host hop requires independent host-key validation.

Never create a global "accept all host keys" mode.

## TLS and BMC Security

Never globally disable TLS validation.

Certificate exceptions must be:

- explicit
- scoped
- temporary where possible
- limited to the specific diagnostic or connection context

Embedded BMC pages are untrusted remote content.

They must not have access to:

- privileged Tauri IPC
- credential vault APIs
- arbitrary filesystem access
- shell execution
- application state
- update mechanisms

Use capability-based Tauri permissions.

Deny uncontrolled popups.

Restrict child WebView navigation.

Do not persist token-bearing console URLs.

## IPC Security

Treat all frontend-to-Rust IPC data as untrusted.

Every command must:

1. Validate required fields.
2. Validate enum-like values.
3. Bound lengths.
4. Validate ports and paths.
5. Reject malformed identifiers.
6. Avoid implicit shell invocation.
7. Return structured errors without secrets.

Do not expose broad generic IPC commands when a narrow capability-specific command is sufficient.

## Database Security

SQLite stores metadata, not secrets.

Always use parameterized queries.

Never interpolate untrusted strings into SQL.

Validate FTS queries.

Validate migrations.

Prevent recursive/cyclic folder structures.

Bound nesting depth and import sizes.

## Filesystem Security

Treat local and remote paths as untrusted.

Prevent:

- path traversal
- unsafe symlink behavior
- arbitrary overwrite
- directory escape
- malformed filenames
- unsafe temporary files

For SFTP, normalize remote paths carefully and do not assume remote filenames are trustworthy.

## Import and Backup Security

Normal JSON/CSV exports must not contain secrets.

Imports must validate:

- schema version
- field types
- field lengths
- protocol values
- ports
- relationships
- folder depth
- references

Encrypted backups must use authenticated encryption.

Authenticate before parsing restored content.

Never deserialize untrusted backup content before integrity validation.

## Update Security

Signed updates are mandatory.

Never weaken signature verification.

Never embed signing private keys in:

- source control
- application binaries
- frontend bundles
- release artifacts

CI secrets must remain isolated.

## Terminal Logging

Terminal logging is opt-in.

Warn that logs may contain:

- credentials
- tokens
- internal addresses
- customer data
- configurations
- secrets

Never upload logs automatically.

Any redaction feature must be presented as best-effort, not guaranteed secret removal.

## Automation and MultiExec

Automation must remain transparent.

For MultiExec:

- show the target list
- show the exact command
- classify risk where possible
- warn for potentially modifying commands
- require strong confirmation for high-risk commands

Command classification is advisory only.

Never claim a command is safe solely because a classifier did not recognize it.

## AI Security Boundary

AI may:

- explain output
- summarize diagnostics
- suggest commands
- compare read-only data
- identify likely issues

AI must not autonomously:

- execute commands
- modify configuration
- reboot systems
- delete data
- change network state

Never send infrastructure credentials to AI services.

Sensitive terminal output must not leave the local machine without explicit user action and a defined privacy boundary.

## Dependency Security

Before adding a dependency:

1. Check whether an existing dependency can solve the problem.
2. Prefer actively maintained projects.
3. Review security advisories.
4. Avoid unnecessary dependencies.
5. Prefer memory-safe implementations.
6. Justify unsafe Rust dependencies.
7. Commit lockfiles.
8. Add vulnerability scanning where practical.

## Mandatory Security Review

Before marking a feature complete, answer:

- What new trust boundary was introduced?
- What untrusted inputs were added?
- Can any secret reach the frontend, database, logs, exports, or crash output?
- Can remote content invoke privileged IPC?
- Can malformed input escape its intended filesystem/database boundary?
- Are TLS/SSH trust checks preserved?
- Are dangerous actions explicit?
- Are permissions narrower than required?
- Are security tests present?
- Could this feature weaken another feature's security?

If any answer is unclear, the feature is not complete.

## Security Gate

A feature must NOT be considered done until:

- tests pass
- secret leakage is reviewed
- IPC permissions are reviewed
- host/TLS validation behavior is verified where relevant
- failure modes are fail-closed
- documentation is updated
- no broad security bypass was added