---
name: sessiondock-testing
description: Testing, regression, security gate, and definition-of-done standards for SessionDock.
---

# SessionDock Testing Skill

## Purpose

Use this skill for every feature implementation and bug fix.

No infrastructure-access feature is complete without tests.

## Test Layers

### Unit Tests

Use for:

- validation
- parsers
- command classification
- provider detection
- migration helpers
- tunnel configuration
- import/export logic
- path normalization
- error mapping

### Integration Tests

Use for:

- SSH
- authentication
- SFTP
- jump hosts
- tunnels
- SQLite
- credential vault abstraction
- state transitions
- reconnect behavior

### Security Tests

Use for:

- secret leakage
- host-key mismatch
- changed host keys
- malformed imports
- oversized inputs
- path traversal
- malicious filenames
- recursive folder structures
- unsafe IPC input
- corrupted encrypted backups
- malicious BMC navigation
- tunnel external-binding warnings

### Regression Tests

Every fixed bug should receive a regression test where practical.

Do not rely on manual verification alone.

## Device Provider Fixtures

Provider tests should use captured/sanitized fixtures.

Never commit real:

- credentials
- customer hostnames
- production IPs
- tokens
- session cookies
- private configuration

Fixtures should include:

- valid output
- empty output
- malformed output
- partial output
- version differences
- unsupported command output

## Command Classification Tests

MultiExec classification must test:

- clearly read-only commands
- potentially modifying commands
- clearly destructive commands
- whitespace/case variants
- chained commands
- shell separators
- vendor variants

The classifier must not be presented as a security guarantee.

## Migration Tests

Database migrations must test:

- upgrade from prior schema
- existing data preservation
- idempotent startup
- failure handling

Never assume a clean database.

## UI Tests

Test critical user flows:

- create session
- edit session
- connect
- disconnect
- split terminal
- search
- folder move
- credential prompt
- host-key prompt
- transfer cancellation
- MultiExec confirmation

## Failure Testing

Test negative paths intentionally.

Examples:

- DNS failure
- TCP timeout
- auth failure
- SFTP initialization failure
- jump-host hop 2 failure
- local tunnel port already in use
- credential vault unavailable
- database locked
- malformed device output

## CI Gate

Recommended CI checks:

- npm test
- TypeScript type check
- lint
- Rust tests
- cargo fmt --check
- cargo clippy
- cargo audit
- dependency audit
- secret scanning
- release build verification

Security-related failures should fail CI where practical.

## Definition of Done

A feature is done only when:

1. The feature works.
2. Relevant unit tests exist.
3. Relevant integration tests exist.
4. Security tests exist where needed.
5. Regression tests protect prior behavior.
6. Existing tests still pass.
7. Type checking passes.
8. Rust checks pass.
9. No secret is logged.
10. Documentation is updated.
11. CHANGELOG is updated.
12. Manual smoke test covers the primary user workflow.

## Bug-Fix Rule

For a bug:

1. Reproduce it.
2. Identify root cause.
3. Add a failing regression test if practical.
4. Fix the root cause.
5. Verify the regression test passes.
6. Verify neighboring behavior.
7. Avoid unrelated refactoring.