# claude-skills swarm: implementation plan

> **For agentic workers:** this plan is run in this session (see Execution at the end). Steps use `- [ ]` checkboxes. **Gates** marked 🛑 stop work until Don answers.

**Goal:** Replace superpowers with the `claude-skills` plugin. The plan is built and proved step by step through a ladder of headless A/B experiments.

**Architecture:** One plugin at the repo root. It holds lean skills, plus one Claude workflow script (`skills/build/swarm.workflow.js`) that runs Haiku workers over a task graph that `plan` writes. A `bench/` harness runs headless `claude -p` sessions in throwaway copies of .NET fixtures. It scores them on time, cost, hidden tests and a blind review, and writes results to `bench/results/`.

**Tech stack:** Claude Code 2.1.181 plugins and workflows; bash and Node 24 (`node:test`) for the harness and script tests; .NET 10 SDK 10.0.400 (xUnit) for fixtures.

**Spec:** `docs/specs/2026-11-20-swarm-skills-design.md`

## Global constraints

- Plugin name and marketplace name are both `claude-skills`. Install command: `claude-skills@claude-skills`.
- Fixed session model for all experiment arms except E5: `claude-opus-5-5`. Workers: `model: 'haiku'`, set in the workflow script.
- Total experiment budget is about **$150**. E1 and FINAL run 3 reps. E2–E5 run on F-small with 2 reps. Report spend after E0 and after E1.
- A capped run (`--max-budget-usd`) is a failure and is recorded, not dropped.
- Fix loop: at most 2 extra Haiku rounds, then `stuck`. Never escalate to a bigger model.
- Ported skills keep MIT attribution to obra/superpowers (© 2025 Jesse Vincent).
- All skills together load at most **8,000 words** (superpowers: about 22k). Check with `wc -w skills/*/SKILL.md`.
- Bump `version` in `.claude-plugin/plugin.json` whenever skills change.

## Review focus

1. **An undeclared shared file:** two tasks in one wave both edit `Program.cs` or a `.csproj` that neither lists in `owns`. Expected: `check` flags edits outside `owns`, so the task fails instead of being merged silently. Pinned in Task 4 (`check_flags_edit_outside_owns`).
2. **A graph with a cycle, an unknown `depends_on` id, or overlapping `owns` in concurrent tasks.** Expected: rejected before any agent starts, with the offending ids named. Pinned in Task 3.
3. **A worker that never succeeds.** Expected: after 2 fix rounds the task is `stuck`, its dependents are `skipped`, and the workflow still returns a summary rather than hanging. Pinned in Task 4 (`stuck_after_two_fix_rounds`, `dependents_of_stuck_are_skipped`).
4. **Parallel `dotnet build` in shared-folder mode** colliding on `obj/` and `bin/`. Expected: each worker builds into `.build/<task-id>`. Pinned in Task 4 (`shared_mode_prompt_sets_build_output`) and observed in E2.
5. **A run that hits its budget cap halfway through a workflow.** Expected: the runner still writes a result row marked `capped`, and the hidden tests still run on whatever was left. Pinned in Task 2 (`runner_records_capped_run`).

---

## Phase 0: harness and feasibility

### Task 1: Commit the current state

**Files:** everything currently uncommitted: Don's deletions (`skills/ssr-frontend`, `scripts/dump.sh`), the rename, `README.md`, `docs/`.

- [ ] **Step 1:** `git add -A && git commit -m "Rename plugin to claude-skills, drop ssr-frontend and dump.sh, add swarm design and plan"`, with the Co-Authored-By trailer.
- [ ] **Step 2:** `claude plugin validate .`. Expected: `Validation passed`.

### Task 2: Bench runner

**Files:**
- Create: `bench/run.sh`, `bench/lib/summarize.mjs`, `bench/judge.sh`, `bench/prompts/driver-claude-skills.md`, `bench/prompts/driver-superpowers.md`, `bench/prompts/driver-claude-skills-planned.md`, `bench/prompts/driver-superpowers-planned.md` (plan already written at `docs/plans/`: skip planning, build it), `bench/prompts/judge.md`
- Test: `bench/test/summarize.test.mjs`, `bench/test/run.test.sh`
- Modify: `.gitignore` (add `bench/work/`, `.build/`)

**Interfaces:**
- Produces: `bench/run.sh --exp <id> --arm <arm> --fixture <f-small|f-medium> --rep <n> [--budget <usd>] [--prompt <file>] [--args-json <json>]`. It writes `bench/results/raw/<exp>/<arm>__<fixture>__<rep>.json` with this shape:
  ```json
  {"exp":"E1","arm":"swarm","fixture":"f-medium","rep":1,
   "status":"ok|capped|error|asked","wall_ms":0,"cost_usd":0,"tokens":{"input":0,"output":0},
   "hidden":{"passed":0,"failed":0},"review_score":null,"stuck":null,"fix_rounds":null,
   "session_id":"…","plugins_loaded":["…"]}
  ```
- Produces: `node bench/lib/summarize.mjs <exp>`, which writes `bench/results/<exp>.md` with a table of medians per arm.
- Arms: `claude-skills` = `--plugin-dir <repo root>`. `superpowers` = `--plugin-dir ~/.claude/plugins/cache/claude-plugins-official/superpowers/7.0.2`. Variants of claude-skills (serial, shared, nocheck, …) pass mode flags through `--args-json`, which the driver prompt hands to `build`.

**Steps:**
- [ ] **Step 1: Write failing tests** in `summarize.test.mjs`:
  - `medians_per_arm`: given 3 raw rows per arm, the table shows the median `wall_ms`, `cost_usd` and hidden pass rate.
  - `capped_counts_as_failure`: a `capped` row counts in n, and its hidden pass rate is whatever was measured.
  - `asked_flagged`: any `asked` row puts "needed human" in that arm's row.
  - `total_spend`: `node bench/lib/summarize.mjs --spend` prints the summed `cost_usd` over every raw row across all experiments. This is the running total reported at each gate.
- [ ] **Step 2:** `node --test bench/test`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement `run.sh`:**
  1. Copy the fixture's `repo/` to `bench/work/<exp>/<arm>__<fixture>__<rep>/` and `git init` it with one commit.
  2. Run `claude -p "$(cat <driver prompt>)" --model claude-opus-5-5 --output-format stream-json --verbose --plugin-dir <arm> --setting-sources project,local --max-budget-usd <budget>` from that folder. `--setting-sources project,local` keeps Don's user-level plugins out. Tee the output to `transcript.jsonl` beside it.
  3. Read the final `result` event for `total_cost_usd`, `duration_ms`, usage and `is_error`, and the `init` event for the loaded plugins.
  4. Copy `fixture/hidden-tests/` in, run `dotnet test` on it, and count passed and failed.
  5. Run `judge.sh` on `git diff <first commit>..HEAD`.
  6. Write the JSON row.
  - Status: `capped` when the result says the budget was exceeded. `asked` when the final assistant message ends with a question to the user. `error` when the run errors. Otherwise `ok`.
- [ ] **Step 4: Implement `judge.sh`:** `claude -p` with `--model claude-opus-5-5` and `prompts/judge.md`, given the spec and the diff, never the arm name. It returns `{"score":1-10,"reasons":[…]}` through `--json-schema`, or by asking for JSON only and parsing it.
- [ ] **Step 5: Driver prompts.** Both state: the spec at `SPEC.md` is approved; plan and build it; take the recommended option at every choice; finish by keeping the branch, no PR; do not ask questions.
  - The claude-skills driver adds: "Use claude-skills:plan then claude-skills:build. I opt in to running workflows. Build options: {{ARGS_JSON}}".
  - The superpowers driver adds: "Use superpowers:writing-plans then superpowers:subagent-driven-development."
- [ ] **Step 6: Test `run.test.sh`** with a stub `claude` on `PATH` that emits a canned `result` event with `"subtype":"error_max_budget_usd"`. This is `runner_records_capped_run`: the row is `status: capped` and the hidden tests still ran.
- [ ] **Step 7:** `node --test bench/test && bash bench/test/run.test.sh`. Expected: PASS.
- [ ] **Step 8:** Commit.

### Task 3: Graph validator

**Files:** Create `skills/plan/validate-graph.mjs`. Test: `bench/test/validate-graph.test.mjs`. Fixtures: `bench/test/graphs/*.json`.

**Interfaces:**
- Produces: `node skills/plan/validate-graph.mjs <graph.json>`. Exit 0 prints `{"ok":true,"waves":[["T1","T2"],["T3"]]}`. Exit 1 prints `{"ok":false,"errors":["…"]}`.
- Also exports `validate(graph) -> {ok, waves, errors}` for tests. Waves = topological levels.
- Graph schema: as in the spec (`goal, spec, base_branch, verify_all, tasks[{id,title,depends_on,owns,reads,instructions,verify,done_when}]`).

**Steps:**
- [ ] **Step 1: Write failing tests:**
  - `valid_graph_returns_waves`: a 4-task diamond gives `[["T1"],["T2","T3"],["T4"]]`.
  - `rejects_cycle`: the error names the ids in the cycle.
  - `rejects_unknown_dependency`: `"T9" not found (depended on by T2)`.
  - `rejects_owns_overlap_in_concurrent_tasks`: T2 and T3 both own `src/A.cs` with no dependency between them. Error: `src/A.cs owned by T2 and T3, which can run at the same time`.
  - `allows_overlap_when_ordered`: same overlap, but T3 depends on T2, so it is ok.
  - `rejects_missing_fields`: every task needs `id, owns (non-empty), instructions, verify`.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3: Implement.** Overlap is checked over every pair of tasks where neither can reach the other in the dependency graph, not only tasks in the same wave.
- [ ] **Step 4:** Run them. Expected: PASS.
- [ ] **Step 5:** Commit.

### Task 4: Swarm workflow script (first cut)

**Files:** Create `skills/build/swarm.workflow.js`, `skills/build/prompts.md` (the worker and checker prompt text, kept in the script as template strings; the `.md` is the readable copy). Test: `bench/test/swarm.test.mjs` with `bench/test/lib/run-workflow.mjs`.

**Interfaces:**
- `args` = `{graph, waves, repo, mode: {isolation: "worktree"|"shared", check: true|false, serial: false|true}}`. The waves come from Task 3, so the script needs no sorting logic of its own.
- Returns `{tasks: [{id, status: "pass"|"stuck"|"skipped", fix_rounds, files_changed}], integrate: {ok, conflicts[], verify_all_tail}, review: {findings[{severity, file, summary}]}, totals: {tasks, passed, stuck, skipped}}`.
- Agent schemas:
  - implement → `{status: "done"|"blocked", files_changed[], verify_passed, verify_tail, notes}`
  - check → `{pass, problems[]}`
  - integrate → `{ok, conflicts[], verify_all_passed, verify_all_tail}`
  - review → `{findings[]}`
- Models: implement, check and integrate use `{model: 'haiku', effort: 'low'}`. Review omits `model`, so it runs on the session model.
- `run-workflow.mjs`: `runWorkflow(path, args, fakeAgent) -> result`. It loads the script text, strips `export ` from `meta`, and runs the body inside an `AsyncFunction` with stub `agent, pipeline, parallel, phase, log, args`. `pipeline` and `parallel` behave the same as the real ones, minus concurrency.

**Steps:**
- [ ] **Step 1: Write failing tests** (fake agents return scripted results per label):
  - `all_pass_returns_summary`: 3 tasks pass, so totals are `{3,3,0,0}`, integrate runs once and review runs once.
  - `workers_use_haiku`: every implement, check and integrate call has `opts.model === 'haiku'`, and review has no `model`.
  - `check_flags_edit_outside_owns`: check returns `pass:false`, so implement is called again with the problems in its prompt.
  - `stuck_after_two_fix_rounds`: check fails every time, so there are exactly 3 implement calls, then status `stuck`.
  - `dependents_of_stuck_are_skipped`: T3 depends on a stuck T1, so T3 is `skipped` and never implemented.
  - `serial_mode_runs_one_at_a_time`: with `mode.serial`, no two implement calls overlap. The fake agent records start and end order.
  - `no_check_mode_skips_check`: with `mode.check:false`, no check calls happen.
  - `shared_mode_prompt_sets_build_output`: in shared mode, the implement prompt contains `.build/<task-id>` and "do not commit".
  - `worktree_mode_uses_isolation`: in worktree mode, implement calls carry `isolation:'worktree'` and the prompt names branch `build/<topic>/<id>`.
- [ ] **Step 2:** `node --test bench/test/swarm.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Waves run in order. Inside a wave, `pipeline(waveTasks, implementStage, checkAndFixStage)`. In serial mode, a plain `for` loop instead.
  - The worker prompt includes the task's instructions, `owns`, `reads`, `verify`, the TDD rules (Task 9 supplies the text; until then, a 5-line placeholder), and the isolation rules.
  - Integrate runs after the last wave, then review gets the spec path and the base branch.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit.

### Task 5: Fixtures

**Files:** `bench/fixtures/f-small/` and `bench/fixtures/f-medium/`. Each holds:
- `repo/`: a .NET 10 solution that builds and passes its own tests at the start
- `repo/SPEC.md`: the approved feature spec
- `hidden-tests/`: an xUnit project the agents never see
- `plan.json`: a hand-written task graph for E1
- `plan.md`: the same tasks in superpowers plan format, for E1's superpowers arm

**Content (builder writes the code; keep the domain generic, with no PocketNet):**
- **F-small:** a `Tags` class library. The spec asks for a tag-normalising service: trim, lower-case, de-duplicate, and reject tags over 32 characters or with spaces. The work is 3 tasks: normaliser, validator, and a service plus its tests. Hidden tests: 8 cases, edge cases included.
- **F-medium:** an ASP.NET Core minimal API with EF Core SQLite: a `Loans` module of books, members and loans. The spec asks for:
  - create and list books and members
  - borrow and return, with a maximum of 3 active loans per member
  - overdue listing
  - a late fee of 0.50 per day, capped at 10.00
  - endpoints for each
  
  About 10 tasks: entities, DbContext, one handler each for book, member, borrow, return and overdue, fee calculator, endpoints, and DI/Program wiring as the integration task. Hidden tests: about 20 integration tests through `WebApplicationFactory`.

**Steps:**
- [ ] **Step 1:** Build F-small. `dotnet test` passes at the start. `node skills/plan/validate-graph.mjs plan.json` returns ok.
- [ ] **Step 2:** Build F-medium the same way. Check that `plan.json` has at least 4 tasks in its widest wave, so parallelism has something to win.
- [ ] **Step 3:** Prove the hidden tests can fail and can pass. Against the starting repo they fail. Against a reference solution (`bench/fixtures/<f>/reference.patch`, built by hand or by a single Opus session, cost noted) they all pass.
- [ ] **Step 4:** Commit.

### Task 6: Minimal `build` and `plan` skills, and E0

**Files:** Create `skills/build/SKILL.md` and `skills/plan/SKILL.md` (minimal versions; Tasks 8 and 9 finish them), `bench/results/E0.md`. Modify `.claude-plugin/plugin.json` (version `0.3.0`).

**Interfaces:**
- `build` SKILL.md:
  1. Find the newest `docs/plans/*.json`.
  2. Run `node <this skill's base dir>/../plan/validate-graph.mjs` on it and stop on errors.
  3. Read the build options from the prompt (default `{isolation:"worktree",check:true,serial:false}`).
  4. Call Workflow with `scriptPath: "<base dir>/swarm.workflow.js"` and `args`.
  5. Report the summary, then handle `stuck` tasks and findings per the spec.
- `plan` SKILL.md: write the graph JSON and the `.md` summary to `docs/plans/`, then run the validator.

**Steps:**
- [ ] **Step 1:** Write both minimal skills.
- [ ] **Step 2: E0 feasibility, by hand.** Run `bench/run.sh --exp E0 --arm claude-skills --fixture f-small --rep 1 --budget 5`. Record each check in `bench/results/E0.md`:
  1. The workflow ran from `claude -p`. Evidence: the transcript has a Workflow tool call and its result.
  2. `scriptPath` into the plugin dir worked.
  3. Workers were Haiku. Evidence: model ids in the transcript or the workflow journal.
  4. `total_cost_usd` includes workflow agents. Compare against summed per-agent usage from the transcripts.
  5. Only claude-skills was loaded. Evidence: the `init` event's plugin and skill list.
  6. Measured cost per run.
  - The SessionStart hook check moves to Task 10 Step 3, because the hook is built there.
- [ ] **Step 3: One superpowers run:** `--arm superpowers --fixture f-small --rep 1 --budget 10`. Record its cost and whether it stayed hands-free.
- [ ] **Step 4:** Apply the E0 fallbacks from the spec for any failed check, re-run, and record the outcome.
- [ ] **Step 5:** Commit.
- [ ] 🛑 **Gate:** report E0 results and spend (`summarize.mjs --spend`) to Don. If workflows can't run headless, stop here.

## Phase 1: does the swarm pay? (E1)

### Task 7: Run E1

- [ ] **Step 1:** On F-medium, 3 reps each, each run given `plan.json` or `plan.md` (`--prompt bench/prompts/driver-*-planned.md`, with the fixture's plan copied into `docs/plans/` by the runner):
  - arm `swarm`: `--args-json '{"isolation":"worktree","check":true,"serial":false}'`
  - arm `serial`: same with `serial:true`
  - arm `superpowers` on `plan.md`
- [ ] **Step 2:** `node bench/lib/summarize.mjs E1`. Write the verdict against the spec's E1 threshold: at least 30% faster than serial, cost within ±15%, equal hidden pass rate.
- [ ] **Step 3:** Commit the results.
- [ ] 🛑 **Gate:** report E1 and the running spend to Don. If the threshold fails, stop and rethink with him.

## Phase 2: tune build (E2, E3)

### Task 8: E2 isolation, E3 check stage, then finish `build`

- [ ] **Step 1: E2** on F-small, 2 reps: `isolation: worktree` vs `shared`. Apply the spec's rule: shared unless it causes any collision or failure.
- [ ] **Step 2: E3** on F-small, 2 reps, using the E2 winner: `check:true` vs `check:false`. Apply the spec's rule.
- [ ] **Step 3:** Set the winners as `build`'s defaults. Write the full `skills/build/SKILL.md`:
  - when to use it
  - the opt-in sentence ("This skill runs a Claude workflow; invoking it is the user's opt-in")
  - the defaults
  - how to handle `stuck` tasks and review findings
  - an inline path below a task count, only if FINAL later shows a slowdown on F-small
  - the note on concurrency (8 on a 10-core Mac) and the "Dynamic workflow size" setting
- [ ] **Step 4:** Re-run `node --test bench/test` (update tests if defaults changed). Bump the version to `0.4.0` and commit.

## Phase 3: planning (E4, E5)

### Task 9: Full `plan` skill, E4, E5

**Files:** `skills/plan/SKILL.md`, `skills/test-driven-development/SKILL.md`. The TDD text is injected into worker prompts, so the placeholder in `swarm.workflow.js` is replaced with it.

- [ ] **Step 1: Write `plan` SKILL.md:**
  - read the spec
  - map files to owners
  - put shared files in one integration task
  - size tasks for Haiku (exact paths, no design left, numbered steps)
  - one fast `verify` per task
  - write `.json` and `.md`
  - run the validator
  - hand off to `build`

  Target: at most 900 words.
- [ ] **Step 2:** Write the `test-driven-development` skill, at most 500 words. Replace the worker-prompt placeholder with its rules, then re-run the swarm tests.
- [ ] **Step 3: E4** on F-small, 2 reps: plan told to cut fine (1 file per task) vs coarse (3–4 files). Record the hidden pass rate. Update the sizing rule in `plan`.
- [ ] **Step 4: E5** on F-small, 2 reps: the session model is `claude-fable-5-2` vs `claude-opus-5-5` for the whole run, with workers fixed on Haiku. Record cost and quality, and write the recommended planning model in the README.
- [ ] **Step 5:** Commit. Bump the version to `0.5.0`.

## Phase 4: port the rest

### Task 10: Remaining skills and the session-start hook

**Files:**
- Create `skills/{using-claude-skills,brainstorming,systematic-debugging,verification-before-completion,code-review,worktrees,finish-branch,writing-skills}/SKILL.md`.
- Create `hooks/hooks.json` and `hooks/session-start`, modelled on superpowers 7.0.2's `hooks/`, unix only. They print `using-claude-skills` as additional context.
- Add a `NOTICE` with the superpowers MIT copyright.

- [ ] **Step 1:** Write each skill from its superpowers counterpart. Keep the rules and drop the repetition. Word targets:

  | Skill | Max words |
  |---|---|
  | brainstorming | 1,200 |
  | systematic-debugging | 900 |
  | code-review | 800 |
  | verification | 400 |
  | worktrees | 400 |
  | finish-branch | 400 |
  | writing-skills | 600 |
  | using-claude-skills | 400 |

  - Brainstorming ends by handing off to `plan`.
  - Debugging hands a fix to `plan` and `build` as a one-task graph.
  - `writing-skills` covers this repo's layout and the version bump.
- [ ] **Step 2:** `wc -w skills/*/SKILL.md | tail -1`. Expected: at most 8,000.
- [ ] **Step 3: Check that skills trigger.** First confirm the SessionStart hook loads: the `init` or first system event shows the `using-claude-skills` context. Then, in each of 3 headless runs (`--budget 1`, F-small copy), give a prompt that should trigger brainstorming, debugging or verification. Check the transcript for the matching `Skill` call. Fix descriptions that don't fire.
- [ ] **Step 4:** `claude plugin validate .`, bump the version to `0.6.0`, and commit.

## Phase 5: head to head

### Task 11: FINAL

- [ ] **Step 1:** Full end-to-end runs from `SPEC.md` (plan and build), 3 reps each:
  - claude-skills on F-small and F-medium
  - superpowers on F-small and F-medium
- [ ] **Step 2:** `summarize.mjs FINAL`. Write the verdict against every success criterion in the spec:
  - F-medium: at least 40% faster, at least 40% cheaper, hidden tests within 1, review within 1, no human help
  - F-small: no more than 25% slower

  If F-small fails, add `build`'s inline path, re-run F-small claude-skills only, and record it.
- [ ] **Step 3:** Write `bench/results/README.md`: one table across all experiments, total spend, and the decisions each experiment made.
- [ ] **Step 4:** Update the README:
  - skill list
  - how the swarm works
  - the concurrency note
  - the recommended session model
  - a link to the results
  - credit to superpowers
- [ ] **Step 5:** Bump the version to `1.0.0`, commit, and push.
- [ ] **Step 6:** Swap the installed plugin: `claude plugin uninstall dk-skills@claude-skills`, `claude plugin marketplace update claude-skills`, then `claude plugin install claude-skills@claude-skills`.
- [ ] 🛑 **Gate:** show Don the FINAL verdict. Uninstalling superpowers is his call.
