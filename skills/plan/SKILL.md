---
name: plan
description: Use when an approved spec or design needs turning into an implementation plan before building. Writes a task graph (docs/plans/*.json) where each task owns its files, so claude-skills:build can run tasks in parallel on Haiku workers.
---

# Plan

Turn an approved spec into a task graph that cheap, fast workers can build in parallel without making design decisions.

## Output

Write two files in `docs/plans/`:
- `YYYY-MM-DD-<topic>.json`: the graph below. This is what `build` runs.
- `YYYY-MM-DD-<topic>.md`: a short readable summary for the user (goal, one line per task, the waves).

```json
{
  "goal": "one sentence",
  "spec": "path/to/spec.md",
  "base_branch": "main",
  "verify_all": "the full test command",
  "tasks": [
    { "id": "T1", "title": "…", "depends_on": [], "owns": ["exact/file.cs", "tests/exact/FileTests.cs"],
      "reads": ["files to read"], "instructions": "1. …\n2. …", "verify": "fast test command", "done_when": ["…"] }
  ]
}
```

## Rules

- **Own files, never share them.** Every file a task creates or edits is in its `owns`. Two tasks that could run at the same time (neither depends on the other) never own the same file.
- **Shared files go to one integration task.** Wiring that many tasks would touch (DI registration, `Program.cs`, project files, routes, migrations) belongs to one task that depends on the others.
- **Leave no design to the worker.** Instructions are numbered steps with exact paths, exact type and method names and signatures, and the spec's exact values. Test first: the first step writes the failing test with its concrete cases.
- **Small tasks.** One to three files each. A task a worker cannot finish from its instructions alone is too big or too vague.
- **Fast verify.** Each task's `verify` runs only its own tests (for example `dotnet test --filter FullyQualifiedName~FooTests`). The last task's verify may be the whole suite.
- **Maximise the widest wave.** Prefer more independent tasks over long chains: workers run in parallel.
- **Shared types live with their first owner.** A record or DTO that several later tasks use belongs in the earliest task's files, so the later tasks only read it. Give its exact definition in that task's instructions.
- **Make parallel tasks testable alone.** Prefer units a worker can test directly (handlers, calculators, services) over tasks that only work once everything is wired. End-to-end wiring and its one integration test belong to the integration task.
- **Read before you write.** Look at the project's layout, test style and project files first, so paths, namespaces and test commands match what is there. Project-file or package changes belong to one early task.

## Example task

```json
{ "id": "T4", "title": "FeeCalculator", "depends_on": [],
  "owns": ["src/Loans/FeeCalculator.cs", "tests/Loans.Tests/FeeCalculatorTests.cs"],
  "reads": ["SPEC.md"],
  "instructions": "1. In tests/Loans.Tests/FeeCalculatorTests.cs write xUnit tests for FeeCalculator.LateFee(dueOn, returnedOn) with due 2026-01-15 UTC: returned early → 0; due + 23h → 0; due + 5 days → 2.50; due + 45 days → 10.00.\n2. Run them and watch them fail.\n3. Create src/Loans/FeeCalculator.cs: public static class FeeCalculator { public const decimal PerDay = 0.50m; public const decimal Cap = 10.00m; public static decimal LateFee(DateTime dueOn, DateTime returnedOn) } — whole days late, rounded down, times PerDay, capped at Cap.\n4. Run the tests until they pass.",
  "verify": "dotnet test --filter FullyQualifiedName~FeeCalculatorTests",
  "done_when": ["FeeCalculatorTests pass", "only owned files changed"] }
```

## Finish

1. Run `node <this skill's base directory>/validate-graph.mjs <plan.json>` and fix every error.
2. Commit both files.
3. Hand off to `claude-skills:build` (when working unattended, do it straight away; otherwise show the user the `.md` summary and the waves first).
