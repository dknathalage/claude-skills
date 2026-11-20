---
name: build
description: Use when an approved claude-skills task graph (docs/plans/*.json) is ready to implement. Runs the work as a Claude workflow, with parallel Haiku workers per task, a Haiku check and fix loop, one integration step and a final review on the session model.
---

# Build

Build a plan by running the swarm workflow. **This skill runs a Claude workflow; invoking it is the user's opt-in to running one.**

## Steps

1. **Find the plan.** Use the plan the user named, else the newest `docs/plans/*.json`. Its topic is the file name without date and extension (for example `2026-11-20-loans.json` → `loans`).
2. **Validate it.** Run `node <this skill's base directory>/../plan/validate-graph.mjs <plan.json>`. On `ok:false`, stop and fix the plan (use `claude-skills:plan`); never build an invalid graph. Keep the `waves` it prints.
3. **Pick options.** Use any build options the user gave, else the defaults: `{"isolation":"worktree","check":true,"serial":false}`. Optional limits:
   - `timeouts`: minutes per agent, default `{"implement_min":20,"check_min":10,"integrate_min":20,"review_min":20}`. A worker that runs past its limit is abandoned, and its task becomes `stuck` with `timed_out: true` (no retry, since a timeout usually means the task is too big).
   - `deadline_min`: the whole build, default 120. After it passes, no new task starts; tasks not yet started become `skipped`, and the result says `deadline_hit: true`.
4. **Create the feature branch.** Commit or stash nothing of the user's. If the working tree is dirty with unrelated changes, stop and say so. Otherwise `git checkout -b build/<topic>` from the plan's `base_branch` (or check it out if it exists).
5. **Run the workflow.**
   - If the Workflow tool is not available (not listed and not found with ToolSearch `select:Workflow`), stop and tell the user to enable workflows (`"enableWorkflows": true` in Claude Code settings). Do not build the tasks yourself instead: that silently drops the parallel Haiku build the user chose.
   - Call the Workflow tool with:
   - `scriptPath`: `<this skill's base directory>/swarm.workflow.js`. If Workflow refuses that path (it only loads scripts you can read), Read that file once and pass its text as `script` instead.
   - `args`: `{"graph": <the plan JSON>, "waves": <waves from step 2>, "topic": "<topic>", "mode": <options>}`, passed as a JSON object, not a string.
   Wait for its completion notification. Do not poll it and do not build tasks yourself meanwhile.
6. **Act on the result.**
   - All tasks `pass`, integrate `ok`, no critical or important findings: done. Report the branch and the totals.
   - Tasks `stuck` or `skipped`: read each stuck task's `problems`. A `timed_out` task is too big: split it in the plan before re-running. If the task was underspecified, fix that task in the plan and run the workflow again with a graph of only the unfinished tasks (re-validate first). If it is a small fix, do it yourself and run its `verify`.
   - Integrate not `ok`: resolve the listed conflicts or failing tests yourself, then run the plan's `verify_all`.
   - Review findings graded critical or important: fix them, each with a test that fails first, then run `verify_all`.
   - Never re-run workers on a bigger model.
7. **Report** in a few lines: branch, tasks passed/stuck/skipped, what you fixed after the workflow, and the final `verify_all` result.

## Keep the session light

The session model is most of a build's cost (benchmark: about 90%, Haiku about 10%). While the workflow runs, do not read the code it is writing, re-run its tests or narrate its progress. Act only on the summary it returns, and read files only for the problems it reports.

## Small plans

With 1–2 tasks, or a plan whose widest wave is 1, there is nothing to parallelise. In the benchmark, building inline was faster and cheaper there. Tell the user that in one line and offer to build inline with `claude-skills:test-driven-development`. When working unattended, build inline.

## Notes

- **Permissions.** Workers need to write files and run the project's build, test and git commands. In auto permission mode, file writes inside workflow workers have been refused ("classifier gave no verdict"). If workers report refused writes, ask the user to run the build in accept-edits mode with those commands allowed.
- **Concurrency.** A workflow runs at most min(16, CPU cores − 2) agents at once, and extra tasks queue. `CLAUDE_CODE_WORKFLOW_MAX_CONCURRENT_AGENTS` overrides that. Set the `workflowSizeGuideline` setting to `large` or `unrestricted` if Claude Code limits workflow size.
- **Ownership.** Workers only touch the files their task `owns`. If a task needs another file, the plan is wrong: fix the plan, do not widen the worker.
- **Branches.** Task work lands on `swarm/<topic>/<id>` branches and is merged into `build/<topic>`. Delete the `swarm/<topic>/*` branches after a clean build.
