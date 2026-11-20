---
name: systematic-debugging
description: Use when you hit any bug, test failure, crash, build failure or unexpected behaviour, before proposing a fix. Finds the root cause first, then fixes it test-first.
---

# Systematic Debugging

**No fix without root-cause investigation first.** A fix aimed at the symptom is a failure, even when the symptom goes away.

Use this for every technical problem: failing tests, crashes, bugs, build or CI failures, performance problems, integration issues. Use it most when the cause seems obvious, when you are under time pressure, or when a fix has already failed. Systematic debugging is faster than guessing.

Work through the phases in order. Do not propose a fix until phase 1 is done.

## Phase 1: Investigate the root cause

1. **Read the error.** Read the whole message and stack trace. Note files, line numbers and error codes. Do not skip warnings.
2. **Reproduce it.** Find exact steps that trigger it reliably. If it does not reproduce, gather more data. Do not guess.
3. **Check recent changes.** `git diff`, recent commits, new dependencies, config or environment changes.
4. **Gather evidence across components.** When the failure passes through several layers (CI to build to deploy, API to service to database), log what enters and leaves each boundary, including environment and config. Run once to see where it breaks, then investigate only that layer.
5. **Trace the bad value backwards.** When the error appears deep in a call stack, ask what passed the bad value, then what called that, until you reach the source. Fix at the source. See `root-cause-tracing.md` in this folder.

## Phase 2: Compare with what works

1. Find similar code in the same codebase that works.
2. If you are following a pattern or reference, read it completely. Do not skim.
3. List every difference between working and broken, however small. Do not assume a difference cannot matter.
4. Note what the broken code depends on: config, environment, ordering, assumptions.

## Phase 3: One hypothesis, tested minimally

1. Write down one specific hypothesis: "X is the root cause because Y."
2. Test it with the smallest possible change, one variable at a time.
3. If it is confirmed, go to phase 4. If not, form a new hypothesis. Do not stack another change on top.
4. If you do not understand something, say so. Research or ask the user rather than pretending.

## Phase 4: Fix test-first

1. **Write a failing test** that reproduces the bug, using `claude-skills:test-driven-development`. Watch it fail for the reason you identified. If there is no test framework, write a one-off script.
2. **Make one fix** at the root cause. No "while I'm here" changes and no bundled refactoring.
3. **Verify** with `claude-skills:verification-before-completion`: the new test passes, the whole suite is green, and the original symptom is gone.
4. **Harden where it helps.** When bad data caused the bug, consider validating it at each layer it passes through (entry point, business logic, environment guard) so the bug cannot return by another path.

**Size the fix.** A small fix is done inline with TDD. A fix that touches many files or modules: hand the root cause and the failing test to `claude-skills:plan`, then run it with `claude-skills:build`.

## When fixes keep failing

If a fix does not work, stop and count your attempts.
- Fewer than three: go back to phase 1 with what you just learned.
- Three or more: stop fixing. Question the architecture.

Signs of an architectural problem: each fix exposes new coupling or shared state somewhere else, fixes need a large refactor, or each fix causes a new symptom. Ask whether the pattern is sound at all, and discuss it with the user before attempting another fix.

## Flaky and timing failures

Replace arbitrary sleeps with waiting on the actual condition (poll for the state, event or file, with a timeout and a clear error). Keep a fixed delay only when you are testing timing itself, and comment why.

## When there is truly no root cause

If the investigation shows the cause is environmental, timing-dependent or external, document what you checked, add handling (retry, timeout, clear error), and add logging for next time. Most "no root cause" cases are unfinished investigations, so be sure first.

## Red flags: stop and return to phase 1

| Thought | Reality |
|---|---|
| "Quick fix now, investigate later" | The first fix sets the pattern. Investigate now. |
| "Just try changing X and see" | That is guessing. Form a hypothesis. |
| "Several changes at once saves time" | You cannot tell which one worked, and you add bugs. |
| "I'll add the test after it works" | Untested fixes do not stick. Test first. |
| "I see the problem" | You see the symptom. Trace it to the cause. |
| "One more attempt" after two failures | Three failures point at the design. Question it. |

The user's frustration is also a signal. "Stop guessing", "is that actually happening?" or "we're stuck" mean you skipped evidence. Go back to phase 1.
