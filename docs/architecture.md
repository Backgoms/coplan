# Architecture

## Components

1. Claude Code command (`/coplan`)
2. MCP server (`packages/coplan-mcp`)
3. Codex API call (`codexClient`)
4. Local auth server (`packages/coplan-auth`)
5. CLI wrapper (`packages/coplan-cli`)

## Runtime Flow

1. User runs `/coplan <task>` in Claude Code.
2. Claude writes a draft implementation plan.
3. Claude calls MCP tool `codex_plan_review` with the plan text.
4. MCP server uses local auth mode:
   - `provider=chatgpt`: calls Codex CLI (`codex exec`) using ChatGPT session
   - `provider=openai`: calls OpenAI Responses API with local API key
5. Codex returns structured JSON critique.
6. Claude revises and returns final plan, including a "Codex Findings -> Plan Changes" section (what Codex flagged + how it was applied).

Note: the MCP tool can also return optional token usage (`usage`) depending on provider support.

## Design Notes

- Token storage is local-only (`~/.coplan/auth.json`).
- MCP exposes one focused tool for deterministic integration.
- Critique contract is strict JSON for reliable downstream parsing.
