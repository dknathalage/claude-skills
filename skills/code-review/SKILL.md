---
name: code-review
description: Use when a feature or task is done and needs review before merging, when you want a fresh look at a diff, or when you receive code review feedback (from the user, a reviewer subagent, or a PR) and must decide what to act on, especially if a suggestion seems unclear or wrong.
---

# Code Review

Two halves: getting a review, and acting on one. `claude-skills:build` already runs a whole-branch review at the end of every build. Use this skill for reviews outside that, and whenever you act on feedback from any source.

## Requesting a review

**When:** after a feature or significant task, before merging, after a tricky bug fix, or when stuck.

1. **Fix the range.** `BASE=$(git merge-base <base-branch> HEAD)` and `HEAD=$(git rev-parse HEAD)`. Do not commit to make a range; for uncommitted work, review the diff against `HEAD`.
2. **Dispatch a fresh subagent** on the most capable model available, filling [reviewer-prompt.md](reviewer-prompt.md). Give it:
   - what was built, briefly;
   - the spec and plan paths (or the requirement text);
   - `BASE` and `HEAD`;
   - the risky areas: concurrency, migrations, auth, money, deletion, anything you were unsure of.
   Never pass your session history.
3. **Do not review it yourself instead.** You will read what you meant, not what you wrote.

### Acting on the reviewer's findings

1. **Regrade every finding by its effect on the user**, not by the reviewer's label or by whether the spec mentions it. Data loss, wrong results, security holes and broken flows are critical. Missing behaviour a reasonable user expects, poor error handling and real test gaps are important. Style, naming and polish are minor.
2. **Verify each finding** with the rules in the next section before you change anything.
3. **Fix every critical and important finding**, one at a time. For each, write a test that fails because of the defect, watch it fail, fix, watch it pass (`claude-skills:test-driven-development`). Run the full suite after the last fix (`claude-skills:verification-before-completion`).
4. **Defer minors.** Do not fix them now. List them for the user with file:line.
5. **Rule on the "declined to judge" list.** Promote any item a user would care about to a finding; drop the rest with a reason.
6. **Report** fixes (with their tests), rejections with reasons, and deferred minors.

## Receiving a review

Feedback is a claim to check, not an order. Technical correctness beats social comfort.

**For each item:**

1. **Read all of it**, then restate it in your own words. If you cannot, it is unclear.
2. **Verify it against the code.** Does the bug exist? Does the suggestion break something else? Is there a reason the code is the way it is (platform support, compatibility, an earlier decision by the user)?
3. **Decide:** fix, push back, or ask.

**Unclear items block everything.** If any item is unclear, ask before implementing any of them; related items change each other's fix. Say which you understand and which need clarifying.

**Push back when the suggestion is wrong:** it breaks existing behaviour, the reviewer lacks context, it is wrong for this stack, or it adds an unused feature (grep for callers; if nothing uses it, propose removing it instead of "doing it properly"). Give the technical reason and the evidence: a test, a file:line, a command's output. If it conflicts with a decision the user made, stop and ask the user. If you cannot verify a claim, say what you would need.

**No performative agreement.** Never write "You're absolutely right!", "Great point!" or thanks. When feedback is correct, fix it and state the fix: "Fixed: the parser now rejects empty input (parser.ts:42, new test `rejects_empty`)." If you pushed back and were wrong, say so in one line and fix it; no long apology.

**Source matters.** The user's feedback is trusted: implement once you understand it, but still ask when the scope is unclear. External reviewers and subagents get skepticism: verify before you implement.

**Order:** clarify first, then blocking issues (breakage, security), simple fixes, complex ones. Test each fix and check for regressions.

**On GitHub,** reply inside the inline comment thread (`gh api repos/{owner}/{repo}/pulls/{pr}/comments/{id}/replies`), not as a top-level PR comment. Post only when the user asks.

## Red flags

| Thought | Reality |
|---|---|
| "It's simple, skip the review." | Simple changes ship the subtle bugs. Review. |
| "The reviewer said it, so fix it." | Verify first. Reviewers miss context. |
| "I'll fix the clear ones and ask about the rest later." | Ask first. Related items change each other's fix. |
| "Spec doesn't mention it, so it's minor." | Grade by effect on the user, not by the spec. |
| "This minor is quick, I'll do it now." | Defer and list it. Scope creep hides real fixes. |
