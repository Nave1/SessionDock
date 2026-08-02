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
