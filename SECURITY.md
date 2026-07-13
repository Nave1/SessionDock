# Security Policy

## Reporting Vulnerabilities

If you discover a security vulnerability, please report it responsibly:

1. **Do NOT** open a public GitHub issue for security vulnerabilities.
2. Email: security@sessiondock.example (placeholder)
3. Include: description, reproduction steps, potential impact.
4. Allow reasonable time for a fix before public disclosure.

## Security Model

### Credential Storage

- **Windows**: Passwords and secrets are stored in Windows Credential Manager under the `sessiondock` service namespace.
- **macOS**: Passwords and secrets are stored in macOS Keychain under the `sessiondock` service identifier.
- **SQLite** contains only: credential profile names, usernames, authentication methods, and vault reference IDs. Never passwords.

### What is stored where

| Data | Location | Encrypted |
|------|----------|-----------|
| Session metadata | SQLite | No (non-sensitive) |
| Folder structure | SQLite | No |
| Credential profile names | SQLite | No |
| Usernames | SQLite | No |
| Passwords | OS Credential Vault | Yes (OS-managed) |
| Private key passphrases | OS Credential Vault | Yes (OS-managed) |
| SSH host fingerprints | SQLite | No |
| Application settings | SQLite | No |

### SSH Host Key Verification

- First connection: fingerprint displayed for user approval
- Subsequent connections: fingerprint compared to stored value
- Changed fingerprints: prominent warning with explanation of risks
- Users can inspect and remove trusted host entries

### Application Lock

- Optional master password with PBKDF2/Argon2 key derivation
- Random salt per installation
- Authenticated encryption (AES-256-GCM)
- Biometric support where platform allows

### Encrypted Backup

- Password-based key derivation (Argon2id)
- AES-256-GCM authenticated encryption
- Random salt and nonce per backup
- Integrity verification before restore

### Logging

Sanitized logs never contain:
- Passwords or passphrases
- Private key content
- Credential vault values
- Authentication tokens
- Terminal input that may contain secrets

### Data Privacy

- No analytics
- No telemetry
- No cloud synchronization
- No hosted backend
- No account registration
- No external credential storage
- Data never leaves the device except to target connection hosts

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x | Yes |
