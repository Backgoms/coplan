# Contributing

Thanks for taking the time to contribute.

## Development Setup

Prereqs:

- Node.js (LTS recommended)
- npm

Setup:

```bash
npm install
npm test
```

## Project Commands

- `npm run check`: syntax checks for key entrypoints
- `npm run doctor`: local diagnostics (depends on your local Claude/Codex setup)

## Pull Requests

- Keep changes focused and small.
- Include platform considerations (Windows + macOS).
- Avoid introducing any credential storage in the repository.

## Security

If you think you found a vulnerability, please follow `SECURITY.md`.
