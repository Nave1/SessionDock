---
name: sessiondock-terminal-protocols
description: Protocol engineering guidance for SSH, SFTP, SCP, ProxyJump, tunnels, Telnet, Serial, and remote terminal behavior.
---

# SessionDock Terminal Protocols Skill

## Purpose

Use this skill for protocol and connectivity work involving:

- SSH
- keyboard-interactive authentication
- SSH keys
- SSH agent
- ProxyJump
- chained jump hosts
- SFTP
- SCP
- local forwarding
- remote forwarding
- SOCKS forwarding
- Telnet
- Serial
- terminal lifecycle

## SSH Principles

SSH must be native and in-process wherever practical.

Never wrap external `ssh.exe` as the primary implementation.

Preserve:

- host-key verification
- negotiated cryptography
- clear authentication errors
- terminal resize behavior
- control sequences
- clean disconnect handling

## Authentication

Support progressively:

- password
- keyboard-interactive
- private keys
- encrypted private keys
- SSH agent

Never persist passphrases in plaintext.

Authentication errors should identify the method attempted without revealing secrets.

## Private Keys

Prefer referencing private keys at their filesystem location.

Do not silently copy private keys into SessionDock application storage.

Support common secure formats based on underlying library capabilities.

Gracefully report unsupported key algorithms or formats.

## Jump Hosts

A target may have:

- zero jump hosts
- one jump host
- multiple chained jump hosts

For each hop:

- resolve independently
- connect independently
- validate host key independently
- authenticate independently
- report failure stage independently

Detect loops in jump-host chains.

Bound chain depth.

Do not allow a session to indirectly jump through itself.

## Tunnels

Support:

### Local forwarding

local bind -> SSH -> remote endpoint

Default bind address:

127.0.0.1 / ::1

Warn before binding externally.

### Remote forwarding

remote bind -> SSH -> local endpoint

Show the actual bound remote port when dynamically allocated.

### Dynamic forwarding

SOCKS proxy.

Expose clear runtime status.

Allow stop/restart.

Clean up all listeners when the owning connection closes.

## SFTP

SFTP must use the authenticated SSH channel.

Support:

- directory listing
- upload
- download
- rename
- delete
- mkdir
- refresh
- transfer queue
- transfer progress
- cancellation

Treat remote metadata as untrusted.

Prevent unsafe local path traversal.

Do not automatically overwrite local files without user-defined behavior.

For large transfers, stream rather than buffering entire files.

## SCP

If implemented, treat SCP as a compatibility feature.

Prefer SFTP for richer file management.

Maintain strict path handling.

## Terminal Behavior

Do not modify the remote byte stream for semantic highlighting.

Visual highlighting must be a presentation-layer feature.

Preserve ANSI escape sequences.

Terminal search must not alter output.

Handle resize events reliably.

On disconnect, distinguish:

- remote closure
- network failure
- authentication failure
- user closure
- protocol error

## Telnet

Telnet is insecure.

Display a visible transport security warning.

Never imply that Telnet encrypts credentials or traffic.

Do not reuse insecure Telnet behavior for SSH.

## Serial

Support configurable:

- baud rate
- data bits
- stop bits
- parity
- flow control

Handle unavailable/disconnected serial devices cleanly.

Do not freeze the UI when a serial device disappears.

## Auto Reconnect

Reconnect must be optional.

Use exponential backoff.

Avoid infinite tight loops.

Do not automatically reconnect after an explicit user disconnect.

Be careful when reconnecting sessions used by MultiExec.

## Protocol Testing

Test:

- authentication success/failure
- host-key mismatch
- key authentication
- jump-host failure at each hop
- chain loop detection
- SFTP cancellation
- tunnel bind failure
- tunnel cleanup
- remote disconnect
- terminal resize
- reconnect backoff
- malformed server responses where practical

## Definition of Done

A protocol feature is complete only when:

- security verification is preserved
- errors identify the correct stage
- cancellation works
- resources clean up
- reconnect behavior is defined
- secrets are not logged
- tests cover success and failure paths