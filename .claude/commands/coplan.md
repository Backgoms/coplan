You are operating in PLAN MODE. The user request is: $ARGUMENTS

Steps:

1. Generate Draft Plan
2. Create Plan Summary for Review (max 10 lines)
3. Call MCP tool `codex_plan_review` with:
{
  "plan": "<draft plan text>",
  "rubric": "completeness, architecture soundness, security risks, scalability, failure handling, test strategy, rollback strategy"
}
4. Revise the plan using Codex critique and unresolved questions.

Output sections:

## Draft Plan

## Plan Summary for Review

## Codex Review

## Final Plan (Codex-reviewed)

