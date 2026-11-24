# Team skills: a read-only, self-improving PR review loop

Status: built, not yet run on real PRs. Branch `improver-compare-bench`.

## Goal

Extend claude-skills so it learns the team's PR review conventions from past reviews, keeps improving from feedback, and shows with a score that each change helped. Claude never comments, replies or posts on GitHub, Jira or Slack. It drafts; Don relays.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Home | Inside claude-skills (seed skills + `team/` tools + `bench/`) | One plugin, one harness |
| Seed vs generated | Seed (hand-written, protected): spec, plan, build, code-review, `baseline`, `improver`, `relay`. Generated: `skills/team-*` | The improver and the no-post rule must not come from mined data |
| Improver reach | `skills/team-*/**` edit; `bench/regress/**` add-only (`bench/improver-allow`) | It cannot edit its own judge, fixtures or guardrails |
| Delivery | Local commit or `WORKTREE`, compared before any push | Works on `main`, no CI |
| Evaluation | Paired comparison on frozen PRs, human review comments as hidden reference | Same pattern as the existing bench |
| First skill | `team-review` | Richest history, clearest signal |
| Out of scope | Slack mining, any posting, auto-merge | |

## Flow

1. `team/mine.mjs`: merged PRs, human reviewer comments, and the diff as it was at the first review (GET only, `gh api`).
2. `team/build-fixtures.mjs`: comments → checklist of checkable findings (one cheap, cached model call per PR). Newest PRs, and optionally a whole repo, become holdout.
3. `baseline` skill: generate `team-review` from train fixtures only. `team/leak-check.mjs` rejects skill text that quotes held-out material.
4. `bench/compare.sh` with `bench/run-review.sh`: the agent sees only the PR description and diff, writes `draft.md`; a judge matches it to the checklist. Recall is the metric; precision and noise are reported.
5. `relay` skill: draft → logged (`team/relay.mjs`) → Don posts → edits and reactions logged.
6. `improver` skill: reads edits, rejections and new review comments; makes the smallest edit; `compare.sh` decides; the triggering case becomes a regression fixture (`team/add-regression.mjs`).

## Cost controls

Scores cache by content hash of the skills; only fixtures a changed skill can affect run; paired runs stop early; a hard total budget; checklists are extracted once per PR; the judge defaults to Haiku and must pass `team/calibrate-judge.mjs` against Don's labels.

## Guardrails

- GitHub access is GET-only, enforced in code (`team/lib/gh-read.mjs`) and tested.
- Opt-in hook (`CLAUDE_SKILLS_NO_POST=1`) refuses `gh` writes, `git push`, and Slack, Jira and GitHub write tools.
- Give tokens read-only scopes as well. The hook is a second layer, not the first.
- Mined data stays in `$TEAM_DATA`, outside the repo.

## Known limits

- One fixture per PR, from its first review round only.
- Recall counts what reviewers said, so a good draft finding something reviewers missed scores as noise. The judge flags plausible extras, which are reported but not scored.
- Verdicts come from a paired bootstrap over a handful of fixtures: conservative, unable to prove small gains.
- Historical reviews contain stale conventions and rubber stamps. Weight comes from recurrence across PRs and reviewers, which the baseline skill applies.
- Not yet run against real sessions. First real run: mine a small bounded set, check a few checklists by eye, calibrate the judge, then run the baseline proof.
