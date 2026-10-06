---
name: sessiondock-ui
description: UI and UX standards for SessionDock as a professional Remote Infrastructure Workspace.
---

# SessionDock UI / UX Skill

## Product Character

SessionDock is a professional infrastructure engineering workspace.

It is not a consumer productivity app.

Optimize for:

- speed
- clarity
- information density
- keyboard use
- repeatability
- high device counts
- operational awareness
- safe actions

## Core UX Principles

Prefer:

- visible system state
- predictable layouts
- keyboard shortcuts
- low click counts
- compact tables
- searchable interfaces
- explicit warnings
- useful defaults
- persistent user preferences

Avoid:

- excessive animation
- decorative dashboards with little value
- hidden critical actions
- ambiguous icons without tooltips
- excessive modal dialogs
- large empty whitespace that reduces operational density

## Workspace Model

Primary areas should map to infrastructure work:

- Home / Overview
- Sessions
- Folders
- Groups
- Active Connections
- Transfers
- Tunnels
- Diagnostics
- Settings

Do not expose features merely because they exist internally.

## Terminal Workspace

The terminal is central.

Preserve:

- tabs
- split panes
- fast switching
- search
- semantic highlighting
- native ANSI behavior
- visible connection status

Useful contextual side areas may include:

- Files
- Device Info
- Quick Commands
- Diagnostics

Do not crowd the terminal by default.

Allow users to hide auxiliary panels.

## Device Intelligence UX

Device Intelligence must be explicit.

Show:

- detected vendor/OS
- confidence
- metadata source
- manual override

Quick Commands should display the command.

Structured diagnostics should always provide access to raw output.

Never replace raw infrastructure state with only a green/red badge.

## MultiExec UX

MultiExec requires operational awareness.

Always show:

- number of targets
- target names
- exact command
- risk classification
- execution status per target

For high-risk actions, require strong confirmation.

Do not use one generic "Are you sure?" dialog.

## Error UX

Errors should be precise.

Good example:

SSH connection failed

Stage: Authentication
Host: leaf23
Address: 10.30.40.23
Reason: Keyboard-interactive authentication rejected.

Avoid:

"Something went wrong."

Errors must not contain secrets.

## Large-Scale Session UX

The UI must remain usable with thousands of sessions.

Prioritize:

- fast FTS search
- filters
- tags
- groups
- keyboard navigation
- virtualized lists if necessary
- incremental rendering
- stable sorting

Do not make users traverse deep folder trees for every task.

## Forms

Session forms should progressively reveal advanced options.

Basic:

- name
- protocol
- host
- port
- username

Advanced:

- authentication
- jump hosts
- key
- metadata
- device type
- tags
- terminal options

Avoid overwhelming users with all fields at once.

## Security UX

Security warnings should be specific and actionable.

Host-key change:

- show old fingerprint
- show new fingerprint
- explain the risk
- block silent continuation

External tunnel bind:

- explain that other machines may reach the listener
- show bind address
- require explicit choice

Telnet:

- show that traffic is unencrypted

Do not normalize dangerous choices by making warning bypasses one-click defaults.

## Localization

Preserve:

- English
- Hebrew
- RTL support

Technical tokens such as IP addresses, commands, paths, MAC addresses, and interface names should preserve readable directionality inside RTL layouts.

## Accessibility

Maintain:

- keyboard navigation
- focus indicators
- sufficient contrast
- readable terminal sizing
- tooltips for icon-only actions

## Performance

Avoid expensive rerenders during terminal output.

Do not push raw terminal streams through broad global React state.

Use component boundaries carefully.

## Definition of Done

UI work is complete when:

- keyboard workflow is tested
- RTL does not break the layout
- dark/light themes work
- error states exist
- loading states exist
- disabled states are meaningful
- dangerous actions are explicit
- thousands-of-sessions scalability is considered
- the terminal remains responsive