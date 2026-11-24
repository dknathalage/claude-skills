---
name: improver
description: Use when asked to improve a team-* skill from feedback (review comments, the relay log, a correction), or to check that a change to a team-* skill helped. Not for editing the seed skills, the bench or the guardrails.
---

# Improver

Change a generated `team-*` skill, prove it helped, leave the push to the person. Never post to GitHub, Jira or Slack.

## Rules

- Edit only what `bench/improver-allow` lists: `skills/team-*/**`, plus new files in `bench/regress/`. Seed skills, `bench/`, fixtures, the judge, hooks and this skill are off limits. If the fix needs one, stop and say so.
- Never bump `plugin.json` or `git push`.
- A fixture the change was written from does not count as evidence. Add it to `bench/regress/` instead.

## Steps

1. Find the one pattern in the feedback since the last improvement. If there is none, stop.
2. Make the smallest edit to one `team-*` skill: a principle and its reason, not a rule list.
3. `bash bench/guard.sh HEAD WORKTREE`. Fix or abort on any violation.
4. Compare. Commit mode (default): commit locally, then `bash bench/compare.sh HEAD~1 HEAD --fixtures <dir> --budget-total <cap>`. Worktree mode: leave it uncommitted and run `… HEAD WORKTREE …`. Cap: the person's figure, else $5.
5. Act on the exit code, not your impression:

| Exit | Verdict | Do |
|---|---|---|
| 0 | BETTER | Keep. |
| 0 | NO_WORSE | Keep, and say it is not proven better. |
| 1 | WORSE | Undo your own change only (`git reset --hard HEAD~1` after checking HEAD is your commit, or `git checkout -- skills/team-*`). Report why. |
| 2 | INCONCLUSIVE | Do not keep. Say what is missing. |
| 3 | COST_UP | Do not keep. Report the ratio. |

6. Add the triggering case to `bench/regress/` as a new fixture. Cite the report (`bench/results/compare/*.md`) in the commit message.
7. Report three lines: verdict, comparison cost, what changed.
