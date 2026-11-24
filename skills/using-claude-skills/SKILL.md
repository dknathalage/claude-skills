---
name: using-claude-skills
description: Use at the start of every session. Lists the claude-skills skills, when each one applies, and the rule to check for a matching skill before acting.
---

# Using claude-skills

**The rule: before your first reply or tool call on any request, check the table below. If a skill could apply, invoke it with the Skill tool first, before exploring code, asking questions or planning.** Being only fairly sure is enough to load it; if it turns out not to fit, drop it. This includes requests that look simple. The user's own instructions (CLAUDE.md, direct requests) override skills.

| When | Skill |
|---|---|
| New feature, product or change that isn't fully specified; "brainstorm", "design", "spec this" | `claude-skills:spec` |
| An approved spec needs an implementation plan | `claude-skills:plan` |
| An approved plan (`docs/plans/*.json`) is ready to build | `claude-skills:build` |
| Writing any feature or bugfix code | `claude-skills:test-driven-development` |
| A bug, failing test, crash or unexpected behaviour | `claude-skills:systematic-debugging` |
| About to say done, fixed or passing, or before a commit or PR | `claude-skills:verification-before-completion` |
| Reviewing finished work, or acting on review feedback | `claude-skills:code-review` |
| Work that needs an isolated branch checkout | `claude-skills:worktrees` |
| Implementation is done and tests pass; time to merge, open a PR or keep the branch | `claude-skills:finish-branch` |
| Creating or editing a skill in this plugin | `claude-skills:writing-skills` |
| Review a teammate's PR, or draft a Jira or Slack answer for the person to post | `claude-skills:relay` |
| Build the team baseline skills from past PR reviews | `claude-skills:baseline` |
| Improve a `team-*` skill from feedback, or prove a change to one helped | `claude-skills:improver` |

## The usual flow

`spec` (find out what and why, get approval) → `plan` (task graph where each task owns its files) → `build` (parallel Haiku workers in a Claude workflow, then integration and a review on the session model) → `finish-branch`.

Small, clear tasks skip straight to the work: a one-line fix needs no spec or plan, just TDD and verification.

## Rules

- Process skills come first: `spec` before building, `systematic-debugging` before fixing.
- Announce a skill in one short line when you start it ("Using spec to pin down the design"). Never quote skill text to the user.
- Evidence before claims: never say something works without running it.
