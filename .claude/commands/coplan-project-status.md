Check coplan runtime status for THIS repository.

Steps:

1. Run shell command: `node packages/coplan-cli/bin/coplan.js doctor --json`
2. Summarize these fields:
   - provider
   - auth file exists and key source
   - MCP coplan registered
   - codex CLI available
   - codex logged in
3. If any FAIL exists, list fix commands in order.
