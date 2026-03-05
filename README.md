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
/coplan <your task>
```

Tip: Claude Code command invocation can vary by version. The safest way is to type `/` and pick `coplan` from autocomplete. If manual typing is required, try both `/coplan` and `/user:coplan`.

## How It Works

When you run `/user:coplan <task>`:

1. Claude generates a Draft Plan
2. Claude generates a short Plan Summary
3. MCP tool `codex_plan_review` sends the draft plan to Codex for critique
4. Claude revises the plan and returns the Final Plan

## Usage (Claude Code)

Use the names shown in autocomplete (prefix may be `/` or `/user:` depending on version):

- `coplan <task>`: generate plan + Codex critique + final plan
- `coplan-status`: check setup/runtime state and suggest fixes
- `coplan-login`: start Codex/ChatGPT login (opens browser if needed)
- `coplan-logout`: log out of Codex and clear local coplan state
- `coplan-update`: fast-forward update this git clone (safe `git pull --ff-only`)

## Updating

You do NOT need to manually run `git pull` every time.

What happens automatically:

- When Claude Code connects to the `coplan` MCP server, it starts a local server process.
- On startup, the MCP server attempts a safe fast-forward update (`git fetch` + `git pull --ff-only`) if:
  - this is a git clone with `origin`
  - the working tree is clean

Manual update options:

- In Claude Code: run `coplan-update`
- In terminal:

```bash
npm run update
```

When you DO need `npm run install:claude` again:

- Only if slash command templates changed/added in the repo (new commands, prompt text changes).
- If you only updated code (MCP/CLI logic), you can usually skip it.

## Troubleshooting

- Slash commands not found: run `npm run install:claude` then restart Claude Code
- Login UI does not open: you are probably already logged in; use `/user:coplan-logout` then `/user:coplan-login`
- Auto-update skipped: ensure the repo working tree is clean (`git status`) then re-run `/user:coplan-update`
 - After updating, things look broken: run `npm install` (dependencies may have changed)

## Repository Layout

- `.claude/commands/`: slash command templates installed into `~/.claude/commands/`
- `packages/coplan-cli/`: CLI used by setup/login/status
- `packages/coplan-mcp/`: MCP server exposing `codex_plan_review`
- `packages/coplan-auth/`: legacy local auth web server (`127.0.0.1:8719`)
