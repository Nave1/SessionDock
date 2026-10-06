---
name: sessiondock-rust-tauri
description: Rust and Tauri architecture conventions for SessionDock backend development.
---

# SessionDock Rust + Tauri Skill

## Purpose

Use this skill for work in:

- src-tauri
- Rust command handlers
- connection management
- credential vault integration
- database access
- filesystem access
- Tauri capabilities
- WebViews
- updater logic
- concurrency
- error handling

## Architecture Rules

Keep privileged logic in Rust.

React should primarily handle:

- presentation
- user interaction
- non-sensitive state
- rendering
- command orchestration

Rust should own:

- credentials
- SSH authentication
- host-key validation
- tunnels
- SFTP
- filesystem-sensitive actions
- database operations
- encrypted backups
- security-sensitive validation

Do not move sensitive logic into TypeScript for convenience.

## Tauri IPC Design

Prefer narrow commands.

Good:

- start_ssh_session
- list_remote_directory
- start_local_tunnel
- save_credential_profile

Avoid generic commands such as:

- execute_any_shell_command
- read_any_file
- invoke_backend_action

Every IPC argument must be validated in Rust.

Use typed request/response objects.

Return structured errors.

Never include secret values in errors.

## Error Architecture

Errors should identify the failing stage.

Examples:

- DNS
- TCP
- SSH_HANDSHAKE
- HOST_KEY
- AUTHENTICATION
- JUMP_HOST
- TUNNEL
- TERMINAL
- SFTP
- DATABASE
- CREDENTIAL_VAULT

Prefer strongly typed error enums.

Errors shown to users should be actionable without exposing secrets.

## Concurrency

Do not block the Tauri main thread.

Use appropriate async/background execution for:

- network connections
- SFTP transfers
- tunnels
- diagnostics
- long-running database operations

Ensure cancellation is possible where practical.

Avoid orphaned tasks.

Session close must clean up:

- sockets
- channels
- tunnels
- terminal workers
- transfer jobs

## Resource Ownership

Use explicit ownership for active connections.

Define clear lifecycle states such as:

- connecting
- connected
- reconnecting
- closing
- closed
- failed

Avoid hidden global mutable state.

If shared state is required, protect it with suitable synchronization primitives and document lock ordering.

## Rust Safety

Prefer safe Rust.

Any `unsafe` block requires:

- a clear justification
- a narrow scope
- comments describing invariants
- dedicated tests

Avoid unnecessary secret cloning.

Use RAII for cleanup.

## Database Access

Use migrations.

Use parameterized SQL.

Keep DB operations behind a clear data layer.

Do not embed SQL directly throughout UI-facing commands.

Preserve backward compatibility when migrating schemas.

## Tauri Capabilities

Use least privilege.

Each window/WebView should receive only the permissions it requires.

Remote BMC WebViews must not inherit the primary application's privileged capabilities.

Review capabilities whenever adding:

- filesystem access
- shell access
- window creation
- external URL opening
- clipboard integration
- updater behavior

## WebView Rules

Remote content is hostile.

Do not expose privileged Tauri commands to BMC pages.

Restrict navigation.

Reject arbitrary popup creation.

Do not inject secrets into page JavaScript.

Do not persist console-token URLs.

## Implementation Workflow

Before coding:

1. Inspect existing module boundaries.
2. Identify Rust ownership of the feature.
3. Identify IPC shape.
4. Identify state lifecycle.
5. Identify cleanup behavior.
6. Identify error types.
7. Identify tests.
8. Identify security impact.

Do not perform broad refactors unless necessary.

## Definition of Done

Rust/Tauri work is complete only when:

- cargo fmt passes
- cargo clippy passes
- Rust tests pass
- IPC is validated
- cleanup is verified
- errors are structured
- no secrets are logged
- capabilities remain least-privilege
- documentation is updated