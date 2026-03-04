# Security

## Controls

- API key is never committed to the repo.
- Auth server binds only to `127.0.0.1`.
- Token file is stored under user home at `.coplan/auth.json`.
- MCP server reads auth mode from disk at runtime.
- Default mode can avoid local API key storage by using ChatGPT sign-in via Codex CLI.
- OpenAI provider defaults to `OPENAI_API_KEY` environment variable (no key persisted by default).
- Plain local key storage is available only via explicit `--allow-plain-key-storage` opt-in.
- Login endpoint validates `Origin/Referer` against local host to reduce CSRF risk.
- On Unix-like systems, auth file writes are hardened to `0600` permissions (best effort).

## Risks And Mitigations

1. Local token theft from disk
- Mitigation: use user profile permissions; avoid shared accounts.

2. Prompt leakage of sensitive info
- Mitigation: pass only plan content and rubric to Codex review.

3. Invalid or malformed Codex output
- Mitigation: schema validation with strict fallback errors.

## Optional Hardening

- Add CSRF token to login form.
- Encrypt token at rest via OS keychain integration.
- Add rate limiting to local auth endpoint.
