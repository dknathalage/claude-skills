---
name: build
description: Use when an approved claude-skills task graph (docs/plans/*.json) is ready to implement. Runs the work as a Claude workflow, with parallel Haiku workers per task, a Haiku check and fix loop, one integration step and a final review on the session model.
---

# Build

Build a plan by running the swarm workflow. **This skill runs a Claude workflow; invoking it is the user's opt-in to running one.**

## Steps

1. **Find the plan.** Use the plan the user named, else the newest `docs/plans/*.json`. Its topic is the file name without date and extension (for example `2026-11-20-loans.json` → `loans`).
2. **Validate it.** Run `node <this skill's base directory>/../plan/validate-graph.mjs <plan.json>`. On `ok:false`, stop and fix the plan (use `claude-skills:plan`); never build an invalid graph. Keep the `waves` it prints.
3. **Pick options.** Use any build options the user gave, else the defaults: `{"isolation":"worktree","check":true,"serial":false}`.
4. **Create the feature branch.** Commit or stash nothing of the user's. If the working tree is dirty with unrelated changes, stop and say so. Otherwise `git checkout -b build/<topic>` from the plan's `base_branch` (or check it out if it exists).
5. **Run the workflow.** Call the Workflow tool with:
   - `scriptPath`: `<this skill's base directory>/swarm.workflow.js`
   - `args`: `{"graph": <the plan JSON>, "waves": <waves from step 2>, "topic": "<topic>", "mode": <options>}`, passed as a JSON object, not a string.
   Wait for its completion notification. Do not poll it and do not build tasks yourself meanwhile.
6. **Act on the result.**
   - All tasks `pass`, integrate `ok`, no critical or important findings: done. Report the branch and the totals.
   - Tasks `stuck` or `skipped`: read each stuck task's `problems`. If the task was underspecified, fix that task in the plan and run the workflow again with a graph of only the unfinished tasks (re-validate first). If it is a small fix, do it yourself and run its `verify`.
   - Integrate not `ok`: resolve the listed conflicts or failing tests yourself, then run the plan's `verify_all`.
   - Review findings graded critical or important: fix them, each with a test that fails first, then run `verify_all`.
   - Never re-run workers on a bigger model.
7. **Report** in a few lines: branch, tasks passed/stuck/skipped, what you fixed after the workflow, and the final `verify_all` result.

## Notes

- A workflow runs at most min(16, CPU cores − 2) agents at once; extra tasks queue. Raise "Dynamic workflow size" in `/config` if Claude Code limits workflow size.
- Workers only touch the files their task `owns`. If a task needs another file, the plan is wrong: fix the plan, do not widen the worker.
