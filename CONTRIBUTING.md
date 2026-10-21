# Contributing to SessionDock

## Development Setup

1. Install prerequisites:
   - Node.js >= 18
   - Rust >= 1.77
   - Tauri prerequisites (see https://v2.tauri.app/start/prerequisites/)

2. Clone and install:
   ```bash
   git clone https://github.com/Nave1/SessionDock.git
   cd sessiondock
   npm install
   ```

3. Run development mode:
   ```bash
   npm run tauri dev
   ```

## Pull Request Process

1. Fork the repository.
2. Create a feature branch from `main`.
3. Make your changes.
4. Run tests: `npm test`
5. Run linting: `npm run lint`
6. Submit a pull request with a clear description.

## Code Style

- Frontend: Prettier + ESLint
- Backend: `cargo fmt` + `cargo clippy`
- Commits: conventional commits (feat:, fix:, chore:, etc.)

## Security

- Never commit credentials, keys, or secrets.
- Never store passwords in plain text.
- Always validate Tauri command inputs.
- Follow the security model in SECURITY.md.

## Testing

- Write unit tests for validation logic.
- Write integration tests for database operations.
- Mock external services (SSH, serial) in tests.
- Never use real production infrastructure in tests.

### Local SSH integration fixture

An opt-in localhost fixture is available for live SSH, key authentication,
ProxyJump, SFTP, and tunnel smoke tests. It binds only to `127.0.0.1`, uses
runtime-generated keys, limits direct forwarding to fixture-owned ports, and
deletes its temporary files when stopped.

On 64-bit MSVC Windows, `.cargo/config.toml` enables libssh2's built-in WinCNG
ECDH/ECDSA support. The fixture pins `ecdh-sha2-nistp256` key exchange and uses
a runtime-generated ECDSA P-256 client key, avoiding the legacy WinCNG
finite-field DH and RSA PEM paths while still exercising file-based key auth.

Create an isolated environment and install the fixture dependency:

```powershell
py -m venv "$env:TEMP\sessiondock-ssh-fixture-venv"
& "$env:TEMP\sessiondock-ssh-fixture-venv\Scripts\python.exe" -m pip install -r scripts/requirements-ssh-fixture.txt
```

Verify the fixture protocol surface:

```powershell
& "$env:TEMP\sessiondock-ssh-fixture-venv\Scripts\python.exe" scripts/ssh_integration_fixture.py --self-test
```

Exercise SessionDock's Rust SSH path, including strict host-key verification,
private-key authentication through ProxyJump, managed SFTP, and local, remote,
and SOCKS forwarding:

```powershell
& "$env:TEMP\sessiondock-ssh-fixture-venv\Scripts\python.exe" scripts/ssh_integration_fixture.py --rust-smoke
```

This is an ignored, opt-in backend integration test. The Tauri UI and IPC
workflow remain part of the manual smoke test below.

The Rust smoke first isolates handshake and key authentication, then exercises
the complete route. Repeat all stages against one fixture for a stability run:

```powershell
& "$env:TEMP\sessiondock-ssh-fixture-venv\Scripts\python.exe" scripts/ssh_integration_fixture.py --rust-smoke --rust-smoke-runs 3
```

Start it for a manual SessionDock smoke test:

```powershell
& "$env:TEMP\sessiondock-ssh-fixture-venv\Scripts\python.exe" scripts/ssh_integration_fixture.py
```

The startup JSON contains the target and jump-host ports, username, generated
private-key path, SFTP root, echo endpoint, and expected host-key fingerprint.
Keep the fixture running while using those values. Confirm the displayed
fingerprint when SessionDock asks whether to trust each fixture host key.
