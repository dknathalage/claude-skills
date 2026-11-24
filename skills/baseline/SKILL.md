---
name: baseline
description: Use when asked to build or rebuild the team's baseline skills (team-review and friends) from historical PR reviews, or to check that the baseline beats having no team skills.
---

# Baseline

Mine past PRs, learn from the older ones, and prove the result on newer ones. Read-only: never post anywhere.

## Steps

1. **Mine.** `node team/mine.mjs --repo <owner/name> --since <date>` per repo. Data lands in `$TEAM_DATA` (default `~/.cache/claude-skills-team`), never in this repo.
2. **Fixtures.** `node team/build-fixtures.mjs` (add `--holdout-repo <owner/name>` to hold out a whole repo). Read `split.json` and tell the person the train and holdout counts.
3. **Judge.** The person's labels must pass `node team/calibrate-judge.mjs <labels dir>`. If there are no labels yet, ask for 30–50 and stop.
4. **Generate from `fixtures/train/` only.** Never open `fixtures/holdout/`. Read the reference comments and write `skills/team-review/`:
   - `SKILL.md` stays small: principles, each with its reason, for patterns that recur across several PRs or reviewers. Ignore one-offs.
   - `references/` for conventions too long for `SKILL.md`; scripts for anything a script can check.
5. **Guard.** `bash bench/guard.sh HEAD WORKTREE`, then `node team/leak-check.mjs skills/team-review --holdout $TEAM_DATA/fixtures/holdout`. Fix any hit by rewording from principle, not by deleting a number.
6. **Prove it.** With HEAD holding no team skills: `bash bench/compare.sh HEAD WORKTREE --fixtures $TEAM_DATA/fixtures/holdout --runner bench/run-review.sh --metric recall --budget-total <cap>`.
7. **Keep only BETTER.** NO_WORSE means no lift over having no skills: report it, keep nothing. Do not push.
