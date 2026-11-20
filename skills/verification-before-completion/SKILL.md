---
name: verification-before-completion
description: Use when about to claim work is complete, fixed or passing, or before committing or opening a PR. Requires running the verification command and reading its output before any success claim.
---

# Verification Before Completion

**No completion claim without fresh evidence.** If you have not run the command in this turn and read its output, you cannot say it passes.

## The gate

Before saying done, fixed, passing, or anything that implies it:

1. **Identify** the command that proves the claim.
2. **Run** it in full, fresh. Not a subset, not an earlier run.
3. **Read** the whole output: exit code, failure count, warnings.
4. **Compare** the output with the claim.
5. **Then** state the result, quoting the evidence ("`dotnet test`: 142 passed, 0 failed").

Never write "should work", "probably fixed" or "looks correct". Those words mean you have not verified. Do the check or say plainly that you have not.

## What counts as evidence

| Claim | Needs | Not enough |
|---|---|---|
| Tests pass | Full suite output with 0 failures | One file passing, an old run |
| Build succeeds | Build command exits 0 | Linter clean, logs look fine |
| Bug fixed | The original symptom no longer reproduces | Code changed, assumed fixed |
| Regression test works | Seen red without the fix, green with it | Passing once |
| Agent finished | You checked the diff and re-ran the verify | The agent's own success report |
| Requirements met | Each requirement checked off against the spec or plan | Tests passing |

## Reporting failures

When the evidence says no, report that honestly:
- State the actual status first ("3 of 142 tests fail").
- Name every failing test or error, including ones you did not cause or that look unrelated.
- Quote the relevant output lines.
- Say what you have and have not verified.

Never bury a failure under what went well.

## When to apply

Before any of these:
- saying work is complete, fixed or passing, in any wording
- committing, pushing or opening a PR
- marking a task done or moving to the next one
- accepting a subagent's or worker's result

Being tired, confident or sure "just this once" is not evidence. Run the command.
