You are operating in PLAN MODE. The user request is: $ARGUMENTS

Steps:

1. Generate Draft Plan
2. Create Plan Summary for Review (max 10 lines)
3. Call MCP tool `codex_plan_review` with:
{
  "plan": "<draft plan text>",
  "rubric": "completeness, architecture soundness, security risks, scalability, failure handling, test strategy, rollback strategy"
}
4. Revise the plan using Codex critique and any unresolved questions.
   - The Final Plan MUST include a short section that records:
     - what Codex reviewed/validated/flagged (high-signal bullets)
     - how those findings were applied to the Final Plan (explicit mapping)

Output sections:

## Draft Plan

## Plan Summary for Review

## Codex Review

## Codex Findings -> Plan Changes

## Final Plan (Codex-reviewed)

In `## Codex Findings -> Plan Changes`, include:

- Codex Findings: high-signal one-liners with IDs (F1, F2, ...) (paraphrase; keep it concise)
- Plan Changes: explicit mapping from finding IDs -> concrete changes in the Final Plan (what changed and where)
  - If a finding is not applied, record: `F# -> Not applied (reason)`
  - The Final Plan MUST reflect all applied changes listed here

If `usage` (token counts) is available from the Codex review tool, add a short line here (human-readable), for example:

Usage: input=<n>, output=<n>, total=<n>, cached_input=<n (if available)>

Also include this link somewhere in the Final Plan so the user can open the dashboard immediately:

Dashboard: http://127.0.0.1:8719/dashboard/usage
