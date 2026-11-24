---
name: relay
description: Use when asked to review a teammate's PR or draft an answer to a Jira or Slack question for the person to post themselves. Claude drafts; the person posts.
---

# Relay

You draft. The person posts. Never comment, reply, approve, merge or send to GitHub, Jira or Slack, even if asked in the middle of the work.

## Steps

1. **Get the material, read-only.** A PR: `node team/fetch-pr.mjs <owner/repo#N> --out <tmp dir>`. A Jira or Slack question: the person pastes it.
2. **Draft.** For a PR, review `pr.md` and `diff.patch` with `claude-skills:team-review` if it exists, else `claude-skills:code-review`. Number each comment: file and line, the problem, why it matters. Write it to a file.
3. **Log it.** `node team/relay.mjs draft --target <owner/repo#N> --file <draft> [--kind jira|slack]` prints a draft id.
4. **Hand over.** Show the draft and the id, then stop.
5. **Record what happened**, when the person tells you:
   - Posted unchanged: `node team/relay.mjs posted --id <id> --same`.
   - Posted edited: save their text to a file and use `--file`.
   - A reaction: `node team/relay.mjs outcome --id <id> --result accepted|rejected|ignored|discussed --note "<why>"`.

The log is how the improver learns. Edits and rejections are its best signal.
