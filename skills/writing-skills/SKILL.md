---
name: writing-skills
description: Use when creating a new skill, editing or trimming an existing one, or checking that a skill triggers and changes behaviour, especially in the claude-skills plugin repo.
---

# Writing Skills

A skill is a reusable technique, pattern or reference that changes what an agent does. It is not a story about one session, a project-specific convention (put that in `CLAUDE.md`), or a rule a script could enforce (write the script).

## Structure

```
skills/<name>/
  SKILL.md          required
  <supporting file> only for heavy reference or a reusable tool
```

`SKILL.md` starts with exactly:

```
---
name: <folder name>
description: Use when …
---
```

- **`name`** matches the folder: lowercase letters, digits, hyphens.
- **`description` drives triggering.** Claude sees only this when deciding to load the skill. Say *when*: the situation, symptoms and words a user would say. Do not summarise the steps, or the agent follows the summary instead. Third person, under 1024 characters.
- **Cross-reference** siblings as `claude-skills:<name>`, never by file path.
- **Bundled scripts:** call them through their interpreter (`node <skill dir>/tool.mjs`), not by bare path; packaging can strip the executable bit.

## Keep it lean

Every word loads into context each time the skill fires.

- Imperative voice, plain English, one good example.
- No repetition. A four-to-six-row table beats a page of argument.
- Move reference material over about 100 lines into a supporting file and link it.
- Keep all of this repo's skill text under about **8,000 words** in total. Check with `wc -w skills/*/*.md`.

## Match the form to the failure

| Failure you saw | Write |
|---|---|
| Breaks a rule under pressure | A hard rule plus a short "thought / reality" table of the excuses you saw |
| Output has the wrong shape | A positive recipe: what the output is, its parts in order |
| Leaves out a required piece | A required slot in the template |
| Should depend on a condition | A conditional on something observable |

Avoid "don't X unless…": the exception reopens the argument.

## Test it

Write the test before the skill, as in `claude-skills:test-driven-development`.

1. **Baseline.** Run a realistic task that should trigger the skill, without the skill. Note what goes wrong. If nothing does, skip the skill.
2. **Write the minimum** that fixes what you saw.
3. **Trigger and behaviour.** Run the same task with the plugin loaded, headless:
   ```bash
   claude -p "<task prompt>" --plugin-dir . --output-format stream-json --verbose
   ```
   Confirm the `Skill` tool call appears and behaviour changed. Also try a prompt that should *not* trigger it.
4. **Repeat** three to five times per variant and read the outputs; single runs lie.
5. **Close loopholes.** New excuse? Add a counter, rerun.

## This repo's process

1. Edit `skills/<name>/SKILL.md` (and any supporting files).
2. Bump `version` in `.claude-plugin/plugin.json` on every change, however small; Claude Code uses it to detect updates.
3. Run `claude plugin validate .` and fix what it reports.
4. Test as above.
5. When the user asks: commit, push, then run `/plugin marketplace update claude-skills`.

## Red flags

| Thought | Reality |
|---|---|
| "It's obviously clear, no need to test." | Clear to you is not clear to a fresh agent. Run it. |
| "The description should explain the steps." | Then the agent follows the description and skips the skill. |
| "More examples will help." | One sharp example; the rest is context cost. |
| "Small edit, no version bump." | No bump, no update for users. Bump it. |
