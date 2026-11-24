# claude-skills

Personal [Claude Code](https://claude.com/claude-code) skills in one plugin, `claude-skills`. It replaces [superpowers](https://github.com/obra/superpowers). The discipline is the same (spec → plan → build → review), but the build phase runs **parallel Haiku workers in a Claude workflow**, not one strong-model agent per task in sequence.

## Install

```
/plugin marketplace add dknathalage/claude-skills
/plugin install claude-skills@claude-skills
```

Update with `/plugin marketplace update claude-skills`. The small `marketplace.json` exists only because `/plugin` installs through a marketplace; it points at this repo root.

**`build` needs workflows enabled.** The desktop app has them on. For the CLI, set `"enableWorkflows": true` in your Claude Code settings.

## Skills

| Skill | Use it when |
|---|---|
| `using-claude-skills` | Loaded at session start by a hook. Lists the skills and the rule to check them first. |
| `spec` | A new feature or change isn't fully specified. A short conversation and 2–3 approaches lead to an approved design doc in `docs/specs/`. |
| `plan` | An approved spec needs a task graph (`docs/plans/*.json`) where each task owns its files. |
| `build` | A task graph is ready to run. It runs a Claude workflow: parallel Haiku workers, a Haiku check-and-fix loop per task, one integration step and a whole-branch review on the session model. Per-agent timeouts and a build deadline apply. |
| `test-driven-development` | You are writing any feature or bugfix code. |
| `systematic-debugging` | There is a bug, failing test or crash. Find the root cause before any fix. |
| `verification-before-completion` | You are about to say done, fixed or passing. |
| `code-review` | You are reviewing work outside a build, or acting on review feedback. |
| `worktrees` | Work needs isolating in a git worktree. |
| `finish-branch` | Tests pass and the branch needs merging, a PR, keeping or discarding. |
| `relay` | You are asked to review a PR or draft a Jira or Slack answer. Claude drafts and logs it; you post. |
| `baseline` | Build the team's `team-review` skill from past PR reviews and prove it beats no skills. |
| `improver` | A `team-*` skill needs improving from feedback. It edits only `skills/team-*/`, runs `bench/compare.sh`, and keeps the change only if the score holds. |
| `writing-skills` | You are adding or changing a skill in this plugin. |

All `SKILL.md` files together come to about 6,800 words, against about 22,000 for superpowers.

## How `build` works

```
plan.json ──validate──▶ waves ──▶ Workflow
  ├─ T1: implement (Haiku) → check (Haiku) → up to 2 fix rounds
  ├─ T2: implement (Haiku) → check (Haiku)            each task starts as soon
  └─ T3 (needs T1): …                                  as its dependencies pass
        ▼
  integrate (Haiku): merge swarm/<topic>/<id> into build/<topic>, run verify_all
        ▼
  review (session model): whole branch against the spec, one summary back
```

Workers edit only the files their task owns. A task that keeps failing, or runs past its time limit, comes back `stuck` for the session to re-plan. It is never retried on a bigger model.

## Benchmarks

Headless A/B runs against superpowers on .NET fixtures, scored by hidden tests and a blind judge. Details are in [`bench/results/`](bench/results/).

Results on F-medium (8 tasks), median of 3 runs each:

| Arm | Time | Cost | Hidden tests | Review |
|---|---|---|---|---|
| swarm | 401 s | $1.48 | 20/20 | 8 |
| same tasks one at a time | 570 s | $1.50 | 20/20 | 8 |
| superpowers | 695 s | $3.88 | 20/20 | 9 |

Run one session with `bench/run.sh`, or the E1 set with `bench/e1.sh`. `npm test` runs the harness and workflow tests.

## Checking that a change helped

`bench/compare.sh <base> <head> --fixtures <dir>` scores two states of the skills on the same fixtures. Each side is a git ref or `WORKTREE` (uncommitted edits), so it works straight on `main` with no CI. Scores cache by the content hash of the skills, only fixtures a changed skill can affect run, and it stops early once the answer is clear or the budget is spent. Exit codes: 0 better or no worse, 1 worse, 2 inconclusive, 3 cost up. `bench/guard.sh` checks that an improver change stays inside `bench/improver-allow`.

## Team skills (self-improving)

A read-only loop that learns your team's review conventions. Claude never posts to GitHub, Jira or Slack: it drafts, you post.

```
mine PRs ──▶ fixtures (train | holdout) ──▶ baseline skill (train only) ──▶ proof on holdout
   relay: draft ▶ you post ▶ log edits and reactions ──▶ improver ──▶ compare.sh ──▶ keep or revert
```

| Step | Command |
|---|---|
| Mine merged PRs (GitHub GET only) | `node team/mine.mjs --repo owner/name --since 2026-01-01` |
| Build fixtures, newest PRs held out | `node team/build-fixtures.mjs [--holdout-repo owner/name]` |
| Check the judge against your labels | `node team/calibrate-judge.mjs <labels dir>` |
| Check a skill quotes no held-out text | `node team/leak-check.mjs skills/team-review --holdout $TEAM_DATA/fixtures/holdout` |
| Prove a change helped | `bench/compare.sh HEAD~1 HEAD --fixtures $TEAM_DATA/fixtures/holdout --runner bench/run-review.sh --metric recall` |
| Log a draft, what you posted, the reaction | `node team/relay.mjs draft|posted|outcome` |

Data lives in `$TEAM_DATA` (default `~/.cache/claude-skills-team`), never in this repo. To block writes at the tool level, start team sessions with `CLAUDE_SKILLS_NO_POST=1` (a plugin hook refuses `gh` writes, `git push` and Slack, Jira or GitHub write tools), and give the tokens read-only scopes. Run reviews with the same model you use day to day (`REVIEW_MODEL`), or the scores will not transfer.

## Adding or changing a skill

See the `writing-skills` skill. In short:
1. Edit `skills/<name>/SKILL.md`.
2. Bump `version` in `.claude-plugin/plugin.json`.
3. Run `claude plugin validate .`.
4. Commit, push, then run `/plugin marketplace update claude-skills`.

## License

MIT. Several skills are rewritten from superpowers by Jesse Vincent, also MIT; see [NOTICE](NOTICE).
