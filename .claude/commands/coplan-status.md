Check coplan runtime status for this machine.

Steps:

1. Run shell command: `node "{{COPLAN_CLI_PATH}}" doctor --json`
2. Summarize these fields:
   - provider
   - auth file exists and key source
   - slash command files installed
   - MCP coplan registered
   - codex CLI available
   - codex logged in
3. If any FAIL exists, list fix commands in order.
4. If `codex logged in` is false, tell user to run:
   - `node "{{COPLAN_CLI_PATH}}" login --provider chatgpt`
