# coplan

Auto-validated plan workflow for Claude Code slash commands.

## Quickstart (GitHub)

Prereqs:

- Node.js 20+ (LTS recommended)
- npm

Clone and install:

```bash
git clone https://github.com/Backgoms/coplan.git
cd coplan
npm install
```

Claude Code integration (installs slash commands + registers MCP):

```bash
npm run setup
```

From inside Claude Code (project-local):

```text
/project:coplan-project-setup
/project:coplan-project-status
```

Then in Claude Code:

```text
/user:coplan <your task>
/user:coplan-status
```

## What It Does

`/coplan <task>` creates a draft plan in Claude Code, sends it to Codex for critique through MCP, then returns a revised final plan.

Pipeline:

1. Draft Plan (Claude)
2. Plan Summary (Claude)
3. `codex_plan_review` critique (MCP -> Codex)
4. Final Plan (Claude, revised with critique)

## Repository Layout

- `docs/`: architecture, security, and diagram docs
- `.claude/commands/coplan.md`: slash command prompt template
- `packages/coplan-mcp/`: MCP server exposing `codex_plan_review`
- `packages/coplan-auth/`: local auth web server (`127.0.0.1:8719`)
- `packages/coplan-cli/`: `coplan` CLI (`coplan login`)

## Setup

Security note:

- Do not commit local auth state. `~/.coplan/auth.json` is a user-local file.
- This repo also ignores `.coplan/` (workspace-local) via `.gitignore`.

2. Install into Claude Code (slash command + MCP registration):

```bash
npm run install:claude
```

If you want a one-command setup, use:

```bash
npm run setup
```

This installs:

- `~/.claude/commands/coplan.md`
- `~/.claude/commands/coplan-status.md`
- MCP server registration named `coplan` (user scope)

3. Run auth flow once (default: ChatGPT sign-in via Codex CLI):

```bash
npm run login
```

Direct CLI variants:

```bash
node packages/coplan-cli/bin/coplan.js login --provider chatgpt
```

4. One-shot setup for new users:

```bash
npm run setup
```

5. Check auth/provider status:

```bash
npm run status
```

JSON output:

```bash
node packages/coplan-cli/bin/coplan.js status --json
```

6. Run diagnostics:

```bash
npm run doctor
```

7. (Optional) Start MCP server manually:

```bash
npm run start:mcp
```

8. (Optional) Uninstall from Claude Code:

```bash
npm run uninstall:claude
```

Legacy plain-key browser mode (`--allow-plain-key-storage`) opens `http://127.0.0.1:8719`.

- Windows: `%USERPROFILE%\\.coplan\\auth.json`
- Linux/macOS: `~/.coplan/auth.json`

## Claude Commands

Claude Code slash commands:

- `/user:coplan <task>`: generate plan + Codex review
- `/user:coplan-status`: run `npm run doctor` and summarize setup/runtime state

## MCP Tool Contract

Tool: `codex_plan_review`

Input:

```json
{
  "plan": "string",
  "rubric": "string (optional)"
}
```

Output:

```json
{
  "score": 0,
  "issues": [],
  "missing_steps": [],
  "improvements": [],
  "questions": []
}
```
