---
name: finish-branch
description: Use when implementation on a branch is complete and you need to decide how to integrate it (merge, pull request, keep, or discard), or when the user says they are done with a feature branch or worktree.
---

# Finish a Branch

Verify, offer the options, do what the user picks, clean up. **Commit, push, merge or open a PR only when the user asks.**

## 1. Verify

Run the full test suite (and build, lint) on the tree you will integrate. An earlier green run does not count. If anything fails, report it and stop; fix with `claude-skills:systematic-debugging`. If changes are uncommitted, show `git status` and ask.

## 2. Find the context

- **Base branch:** from the plan, the conversation or the upstream. If unsure, ask; a wrong-base merge is costly to undo.
- **Worktree:** note `git rev-parse --show-toplevel` now, before you change directory.

## 3. Offer the options

```
Done and tests pass. What next?
1. Merge into <base> locally
2. Push and open a pull request
3. Keep the branch as it is
```

Wait. Offer discarding only if the user raises it.

## 4. Do it

**Merge locally:** from the main checkout, `git checkout <base> && git pull && git merge <branch>`, then run the tests on the merged result. If they fail, stop and leave everything in place. If green, clean up the worktree and `git branch -d <branch>`.

**Pull request:** `git push -u origin <branch>`, then `gh pr create --base <base>` following the repo's PR template. Report the URL; keep the worktree for review fixes (`claude-skills:code-review`).

**Keep:** report the branch and worktree path.

**Discard (only when asked):** list what is lost (branch, commits from `git log <base>..<branch> --oneline`, worktree path) and ask the user to type `discard`. Nothing else counts as confirmation. Then clean up the worktree and `git branch -D <branch>`.

## 5. Clean up the worktree

After a merge or a confirmed discard only. Use `claude-skills:worktrees`: `ExitWorktree` if a native tool made it, otherwise `git worktree remove <path>` from the main checkout. If removal is refused over uncommitted files, show them and ask: commit, move, or delete. Never `--force` on your own, and never touch worktrees you did not create.

## Never

- Force-push. A rejected push means the remote moved; ask.
- Merge with failing tests.
- Treat "yeah, get rid of it" as confirmation to discard.
