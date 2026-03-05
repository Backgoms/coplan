# coplan

`coplan` adds a Claude Code slash command that turns your request into a structured implementation plan, gets a Codex critique via MCP, and returns a revised final plan.

## Before You Use

Requirements:

- Git
- Node.js 20+ (LTS recommended) + npm
- Claude Code + Claude CLI (`claude` in PATH)
- Codex CLI (`codex` in PATH)
- ChatGPT plan that includes Codex (Plus/Pro/Business/Edu/Enterprise). Free plans are not a safe assumption.

Local files created:

- `~/.coplan/auth.json` (local auth metadata; do not commit)
- `~/.claude/commands/` (installed slash command templates)

## Quickstart

Clone:

```bash
git clone https://github.com/Backgoms/coplan.git
cd coplan
npm install
```

Install slash commands + register MCP + login:

```bash
npm run setup
```

Open Claude Code and run:

```text
/user:coplan <your task>
```

## How It Works

When you run `/user:coplan <task>`:

1. Claude generates a Draft Plan
2. Claude generates a short Plan Summary
3. MCP tool `codex_plan_review` sends the draft plan to Codex for critique
4. Claude revises the plan and returns the Final Plan

## Usage (Claude Code)

- `/user:coplan <task>`: generate plan + Codex critique + final plan
- `/user:coplan-status`: check setup/runtime state and suggest fixes
- `/user:coplan-login`: start Codex/ChatGPT login (opens browser if needed)
- `/user:coplan-logout`: log out of Codex and clear local coplan state
- `/user:coplan-update`: fast-forward update this git clone (safe `git pull --ff-only`)

## Updating

Update the git clone:

```bash
git pull --ff-only
```

If slash commands were changed/added in the repo, re-install them:

```bash
npm run install:claude
```

Notes:

- `/user:coplan-update` runs `coplan update --apply` which only fast-forwards when the working tree is clean.
- The MCP server also attempts a safe fast-forward update on startup by default; set `COPLAN_MCP_AUTO_UPDATE=0` to disable.

## Troubleshooting

- Slash commands not found: run `npm run install:claude` then restart Claude Code
- Login UI does not open: you are probably already logged in; use `/user:coplan-logout` then `/user:coplan-login`
- Auto-update skipped: ensure the repo working tree is clean (`git status`) then re-run `/user:coplan-update`

## Repository Layout

- `.claude/commands/`: slash command templates installed into `~/.claude/commands/`
- `packages/coplan-cli/`: CLI used by setup/login/status
- `packages/coplan-mcp/`: MCP server exposing `codex_plan_review`
- `packages/coplan-auth/`: legacy local auth web server (`127.0.0.1:8719`)
