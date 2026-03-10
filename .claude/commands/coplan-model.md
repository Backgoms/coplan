Set the Codex CLI model and reasoning effort used by coplan.

Input: $ARGUMENTS

Steps:

1. Call MCP tool `coplan_get_codex_cli_selection` and show:
   - current config values
   - any env overrides
2. Call MCP tool `coplan_codex_cli_models`.
   - If models list is non-empty: show a numbered list of model slugs and their supported reasoning efforts.
3. If $ARGUMENTS includes a model and/or effort:
   - Accept either `<model> <effort>` or `model=<...> effort=<...>`
   - Validate model exists in the list (when list is available)
   - Validate effort is supported by that model (when list is available)
   - Call MCP tool `coplan_set_codex_cli_selection` with:
     - model (string, or empty string to clear)
     - reasoning_effort (string, or empty string to clear)
4. If $ARGUMENTS is empty:
   - Ask the user to reply with:
     - model slug
     - reasoning effort (low/medium/high/xhigh)
   - Then call `coplan_set_codex_cli_selection`.

Notes:
- Changes apply to the next `/coplan` run.
- Environment variables override config: `COPLAN_CODEX_CLI_MODEL`, `COPLAN_CODEX_CLI_REASONING_EFFORT`.
