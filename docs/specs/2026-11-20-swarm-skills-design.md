# claude-skills: a swarm-based replacement for superpowers

Status: awaiting approval · 2026-11-20

## Intent

Superpowers gives good discipline: brainstorm → plan → build → review. Its build phase is slow and expensive. `subagent-driven-development` builds one task at a time, reviews each task before starting the next, and runs every step in a context on a strong model. Ten tasks means about twenty agents back to back.

`claude-skills` (this repo, one plugin of the same name) replaces superpowers completely for Don. The split:

- **Thinking on a strong model.** Brainstorming, planning, debugging diagnosis and the final review run on the session model (Fable or Opus).
- **Doing on a Haiku swarm.** Implementation and per-task checks run on Haiku agents, many at once. A **Claude workflow** script drives them, so code decides the order and the model, not the model's judgment.

Each design choice is tested with small A/B experiments while it is built. The finished plugin is then compared head to head with superpowers.

## Goals

1. **Every skill Don uses from superpowers exists in claude-skills.** Superpowers can then be uninstalled.
2. **The build phase is much faster and cheaper than superpowers** on the same work, without lower quality. Targets are in Success criteria.
3. **The main session stays light during a build.** It sees one structured summary, not every worker's transcript.
4. **Haiku is enforced by the workflow script** (`agent(..., {model: 'haiku'})`), not by asking the model.
5. **Every claimed benefit is backed by a recorded experiment** in `bench/results/`.

## Non-goals

- Changing how spec creation feels. The `spec` skill stays a short conversation on the strong model, like superpowers brainstorming.
- Supporting harnesses other than Claude Code, such as Codex or Kimi. Superpowers does; claude-skills does not.
- Enforcing Haiku outside workflows through env vars or hooks.

## Anti-goals (failure even if it "works")

- **Cheaper because it checks less.** Every task still runs its own verify command, and every build ends with a strong-model review.
- **Haiku code that passes its own tests but is junk.** Quality is judged on held-out tests the workers never see, plus a blind review.
- **A swarm that needs babysitting.** If Don has to untangle merge conflicts or rescue stuck workers by hand, it has failed.
- **Bloat.** Superpowers' skills total about 22k words. claude-skills should load far less text per session.

## Constraints

- **Licence.** Superpowers is MIT (© 2025 Jesse Vincent). Ported skills keep the licence notice, and the README credits upstream.
- **Concurrency.** A workflow runs at most min(16, CPUs − 2) agents at once. On Don's 10-core Mac that is **8**. More tasks queue. "Double digits" means double-digit totals per build, not double-digit concurrency.
- **Workflow size setting.** The session default guideline is about 10 agents per workflow. A real build exceeds that, so Don raises "Dynamic workflow size" in `/config`. The README says so.
- **Opt-in.** Claude may only run a workflow when the user opts in. A skill whose instructions say to call Workflow counts as opt-in. So `build` must say so explicitly.
- **Parallel edits collide.** Two workers on the same file, or two `dotnet build` runs in one folder (`obj/`, `bin/`), collide. The plan must split tasks by file ownership. Isolation is decided by experiment E2.
- **No filesystem in workflow scripts.** Scripts orchestrate. Agents do all reading, writing, git and merging.
- **Plugin limits.** A plugin cannot set env vars. Whether a plugin-shipped script can be run via `scriptPath` is untested (E0).

## Approaches considered

| # | Approach | Trade-off |
|---|----------|-----------|
| 1 | **Superpowers Tiered** (Don's earlier brief): fork superpowers, pin implementer and reviewer agents to Haiku in their settings, tell the skill to dispatch many at once | Least new design. Still driven by the model: a model passed at dispatch overrides the pin, and the main session still reads every report, so it stays costly. |
| 2 | **Own skills plus a workflow build engine** (chosen): lean ports of the superpowers skills, a planner that writes a task list keyed by file ownership, a workflow that runs the Haiku swarm | Most to build. Deterministic, parallel, cheap main session. Replaces superpowers entirely. |
| 3 | **Like 2, but keep superpowers' writing-plans** and convert its output | Less to write, but those plans are written as a sequence of steps, so they parallelise badly. |

Don picked **2** and widened it: claude-skills holds every skill, so superpowers can be removed.

## Skill set

All skills live in `skills/` of the `claude-skills` plugin. Ports are rewrites in the same spirit, roughly a third of the length, not copies.

| claude-skills skill | Replaces (superpowers) | Tier | Notes |
|---|---|---|---|
| `using-claude-skills` | using-superpowers | session | Short bootstrap: what exists, when each fires. Loaded at session start through a SessionStart hook. Hooks are allowed in plugins; to be confirmed in E0. |
| `spec` | brainstorming | session | **Spec creation.** A short conversation to find what the user wants and why. Lays out 2–3 approaches and gets a pick, then writes the design spec to `docs/specs/YYYY-MM-DD-<topic>-design.md`. One fresh builder-check subagent finds open questions, and the user approves. Hands off to `plan`. Same shape as superpowers brainstorming, leaner. |
| `plan` | writing-plans | session | Writes the **task graph** (below). Checks file ownership before handing off. |
| `build` | subagent-driven-development, executing-plans, dispatching-parallel-agents | session drives a Haiku workflow | Runs the swarm workflow. The only build path. |
| `systematic-debugging` | systematic-debugging | session | Diagnosis on the strong model. A fix can become a one-task graph handed to `build`. |
| `test-driven-development` | test-driven-development | worker guidance | Short rules injected into worker prompts. Also usable inline. |
| `verification-before-completion` | verification-before-completion | both | Evidence before claims. |
| `code-review` | requesting-code-review, receiving-code-review | session | Final whole-branch review, plus how to take review feedback. |
| `worktrees` | using-git-worktrees | mechanical | Used by `build` for isolation if E2 says so. |
| `finish-branch` | finishing-a-development-branch | mechanical | Merge, PR or keep. |
| `writing-skills` | writing-skills | session | How to add skills to this repo, including the version bump. |

Dropped: `diagnosing-superpowers`, which is about superpowers itself.

## The task graph (planner output)

`plan` writes `docs/plans/YYYY-MM-DD-<topic>.json`, plus a short `.md` summary for Don to read. Schema:

```json
{
  "goal": "one sentence",
  "spec": "docs/specs/...md",
  "base_branch": "main",
  "verify_all": "dotnet test",
  "tasks": [
    {
      "id": "T3",
      "title": "Add InvoiceTotals calculator",
      "depends_on": ["T1"],
      "owns": ["src/Billing/InvoiceTotals.cs", "tests/Billing/InvoiceTotalsTests.cs"],
      "reads": ["src/Billing/Invoice.cs"],
      "instructions": "Numbered, concrete steps a Haiku agent can follow without design judgment.",
      "verify": "dotnet test --filter InvoiceTotals",
      "done_when": ["tests pass", "no edits outside owns"]
    }
  ]
}
```

Rules `plan` enforces before handoff:

- No file appears in `owns` of two tasks that could run at the same time, meaning neither depends on the other.
- Shared files that many tasks must touch (DI registration, a project file, migrations) go to one **integration task** that depends on the others.
- Each task is sized for Haiku: no design decisions left, exact file paths, about one to three files. E4 tunes the right size.
- Every task has a `verify` command that runs in seconds to a minute.

## The build workflow

`build` loads the graph and calls the Workflow tool with `skills/build/swarm.workflow.js` and the graph as `args`. Shape:

1. **Waves by dependency.** The script sorts tasks topologically. Within a wave it uses `pipeline()`, so each task moves on independently, with no barrier between stages.
2. **Per task:**
   - `implement`: Haiku, worktree or shared folder per E2. It follows the instructions, edits only `owns`, runs `verify`, commits, and returns `{status, files_changed, verify_output_tail}`.
   - `check`: Haiku, fresh context. It re-runs `verify` and diffs against `owns`. It answers whether the task meets `done_when`, and returns `{pass, problems[]}`.
   - **Fix loop:** up to 2 more `implement` rounds given `problems`, still on Haiku. Still failing → status `stuck`, never escalated to a bigger model.
3. **Integrate:** one Haiku agent merges finished task branches into the feature branch in dependency order, runs `verify_all`, and reports conflicts.
4. **Review:** one agent on the session model reviews the whole-branch diff against the spec.
5. **Return** one structured summary: per task pass/stuck, integration result, review findings, and totals.

The session then handles anything `stuck` or found in review. It either revises those tasks and runs `build` again on just them, or fixes small things inline.

**Branches and commits (builder's call).** `build` first creates the feature branch `build/<plan-topic>` from `base_branch`. What happens next depends on the isolation mode:

- **Worktree mode:** each task works on `build/<plan-topic>/<task-id>` in its own worktree and commits there. Integrate merges those branches into the feature branch.
- **Shared-folder mode:** workers edit but **never commit**. Git's index would collide, just like `obj/`. Integrate commits each finished task's `owns` files as one commit per task, in dependency order. To avoid build-output collisions, each worker builds into its own output folder (`dotnet build -o .build/<task-id>`, or `--artifacts-path`).

## Experiments

All experiments live in `bench/`. A runner script starts headless sessions (`claude -p --output-format json --plugin-dir <arm>`, other plugins disabled through `--settings`) in throwaway copies of a fixture repo. It records:

- wall-clock time
- cost and tokens, from the JSON result. E0 checks that workflow and subagent usage is included.
- held-out test pass rate: a hidden test suite copied in after the run
- a blind review score from 1 to 10, given by a strong-model judge that sees the diff but not the arm
- for the swarm: tasks stuck and fix rounds used

Results go to `bench/results/<experiment>.md` (a table plus a one-paragraph verdict) with raw JSON beside it.

**Fixtures** (in `bench/fixtures/`, .NET 10, matching Don's stack):

- **F-small:** a feature of about 3 tasks, to measure fixed overhead.
- **F-medium:** a feature of about 10 tasks across a small modular monolith (an entity, handlers, endpoints, tests, DI wiring), where parallelism should pay off.

Each fixture ships a fixed approved spec, so both arms start from the same design. Brainstorming is not part of the A/B.

**Ladder.** Each experiment informs the next build step:

| Id | Question | Arms | Decides |
|----|----------|------|---------|
| E0 | Does the plumbing work headless? | — (feasibility) | Workflow runs from `claude -p`. A plugin script runs via `scriptPath`. `model: 'haiku'` shows in usage. Cost JSON includes workflow agents. The SessionStart hook loads. |
| E1 | Does parallelism alone pay? | Same hand-written graph: (a) swarm workflow, (b) the same tasks one at a time in a workflow, (c) superpowers SDD on the equivalent plan | Whether the workflow design is worth it before porting everything |
| E2 | Isolation | Worktree per task vs shared folder with disjoint `owns` | The `build` default |
| E3 | Per-task check | Haiku `check` stage vs none (final review only) | Keep or cut the check stage |
| E4 | Task size | Graph cut fine (1 file per task) vs coarse (3–4 files) | Sizing rules in `plan` |
| E5 | Planner model | `plan` on Fable vs Opus, same spec, swarm build fixed | Recommended session model for planning |
| FINAL | Head to head | claude-skills end to end vs superpowers end to end, on F-small and F-medium | Whether to uninstall superpowers |

Each experiment runs **3 repetitions per arm** to see run-to-run noise. Each run is capped with `--max-budget-usd` so a runaway costs a known amount. A capped run is recorded as a failure, not dropped.

**Session model.** Every arm of every experiment except E5 uses the same fixed session model: **Opus 5.5** (`claude-opus-5-5`). Workers are Haiku in claude-skills arms. Superpowers arms keep superpowers' own model guidance.

**Total experiment budget:** **about $150**, trimmed. E1 and FINAL run 3 repetitions. E2–E5 run on F-small with 2 repetitions. Actual spend is reported to Don after E0 and again after E1, before going on. If E0's real per-run costs show the ladder won't fit, the builder stops and says so rather than cutting more on its own.

**Run protocol (builder's call), so the runs are hands-free and fair:**

- Each run gets one fixed driver prompt, the same wording for both arms apart from the skill it names. The prompt says: the spec is approved; plan it and build it; take the recommended option at every choice (execution mode, worktree, finish = keep the branch, no PR); and opt in to workflows.
- The run includes everything the session does to reach done, including re-running `stuck` tasks and fixing review findings. It ends when the session's turn ends or the cap is hit.
- Time and cost cover the whole run. Neither arm gets a human answer. A run that stops to ask a question counts as "needed intervention".

**If E0 finds a gap (builder's call):**

| Check fails | Fallback |
|---|---|
| Workflow won't run from `claude -p` | Stop and report to Don before building more. The swarm design and the benchmark both depend on it. |
| Plugin script won't run via `scriptPath` | `build` copies `swarm.workflow.js` into the project's `.claude/workflows/` (gitignored) and runs it from there, or passes it inline. |
| Cost JSON leaves out workflow agents | Measure cost from the session's transcript files (per-agent usage × published per-model prices), for both arms. |
| `model: 'haiku'` not visible | Check it from the agent transcripts instead. |
| SessionStart hook doesn't load | Rely on the `using-claude-skills` skill description. FINAL measures whether skills fire. |

**Decision thresholds (builder's call, proposed defaults):**

- **E1 (gate):** go on if the swarm arm has at least 30% lower median wall-clock time than the serial-workflow arm, with cost within ±15% and equal held-out pass rate. Otherwise stop and rethink with Don before porting the other skills.
- **E2:** pick shared folder unless it causes any collision or failure in 6 runs. Otherwise pick worktrees.
- **E3:** keep the check stage if removing it lowers the held-out pass rate or the review score at all. Otherwise cut it if it saves at least 15% of cost.
- **E4:** pick the size with the higher held-out pass rate. On a tie, pick the faster one.

## Success criteria

On F-medium in FINAL, claude-skills versus superpowers (medians of 3):

- **at least 40% less wall-clock time**
- **at least 40% less cost**
- **held-out test pass rate no lower** (at most 1 test worse)
- **review score no lower by more than 1**
- **no human intervention** in any claude-skills run

On F-small, claude-skills may be slower, but no more than 25% slower, because swarm overhead does not pay off on tiny jobs. If so, `build` gets an inline path below a task count the experiments pick.

## Decided

- Approach 2. claude-skills replaces superpowers entirely, in this repo, as the single `claude-skills` plugin.
- Haiku workers through a Claude workflow. Thinking on the session model.
- A/B experiments drive the build. The head-to-head decides the switch.

## Left to the builder

- Prompt wording for workers and checkers. Start from superpowers' implementer and reviewer prompts, trimmed.
- How the runner disables other plugins per arm, and how arm A points at superpowers (the installed cache path via `--plugin-dir`).
- The exact fixture code and hidden tests.
- Whether `using-claude-skills` needs a hook or a skill description alone fires reliably. E0 decides.
